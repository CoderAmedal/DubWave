// engine.js — 配音播放引擎。
// 设计要点：
//  1) 播放推进不依赖 VTTCue 的 oncuechange（事件会被合并/丢帧，导致漏读），
//     改成 120ms 定时器 + 游标（cursor）逐句推进，保证每句都被处理一次。
//  2) 预取与播放解耦：预取按 cursor 往后看 AHEAD 句，播放只认 cursor。
//  3) 所有异步调度都走 setTimeout，不在 finally 里递归，避免主线程自旋。
(() => {
  const PREFETCH = 3;   // 并发预取数
  const AHEAD = 6;      // 预取窗口（句，最少）
  const AHEAD_TIME = 25; // 预取窗口（视频秒），高速播放时按时间而不是句数
  const AHEAD_MAX = 40;  // 预取窗口上限（句）
  const TICK_MS = 120;  // 推进间隔
  const LATE_SKIP = 2.5;   // 落后超过这么多秒才放弃
  const AUDIO_MAX_RATE = 1.6; // 配音最多提速到 1.6x
  const VIDEO_MIN_RATE = 0.8;
  const RATE_MIN = -12; // 槽位宽松时最多说慢 12%
  const RATE_MAX = 70;  // 槽位紧张时最多说快 45%（合成前就处理，减少事后压缩）

  function estimateSeconds(text) {
    const zh = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const rest = String(text).replace(/[\u4e00-\u9fff]/g, " ").trim();
    const words = rest ? rest.split(/\s+/).length : 0;
    return zh / 4.6 + words / 2.7 + 0.35;
  }

  // Intl.Segmenter 按语言分句；不支持时退化成标点切分
  const segmenterCache = new Map();
  function segmenter(locale) {
    if (!("Segmenter" in Intl)) return null;
    const key = locale + "::sentence";
    if (segmenterCache.has(key)) return segmenterCache.get(key);
    let seg = null;
    try {
      seg = new Intl.Segmenter(locale, { granularity: "sentence" });
    } catch {
      seg = null;
    }
    segmenterCache.set(key, seg);
    return seg;
  }

  function splitSentences(text, locale) {
    const seg = segmenter(locale);
    if (seg) {
      const out = [];
      for (const { segment } of seg.segment(text)) {
        const t = segment.trim();
        if (t) out.push(t);
      }
      if (out.length) return out;
    }
    return text
      .split(/(?<=[。！？!?；;\n])/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  // 单句仍然过长：先按逗号，再按字符硬切
  function hardSplit(text, maxChars) {
    if (text.length <= maxChars) return [text];
    const out = [];
    let buf = "";
    for (const ch of text) {
      buf += ch;
      if (buf.length >= maxChars || /[，,、：:]/.test(ch)) {
        if (buf.trim()) out.push(buf.trim());
        buf = "";
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  // 把过长/过密的 cue 拆成更小的段，时间按预估朗读时长比例分配
  function splitCues(subs, maxChars = 30, locale = "zh-CN") {
    const out = [];
    for (const s of subs) {
      if (!s.translation) { out.push(s); continue; } // 还没翻译：原样保留，等翻完再说
      const translation = (s.translation || "").trim();
      const dur0 = Math.max(0.2, s.end - s.start);
      const est0 = estimateSeconds(translation);
      // 太长 或 太密（按自然语速说不完这段字幕）都要拆
      const dense = translation.length > 18 && est0 > dur0 * 1.15;
      if (!translation || (translation.length <= maxChars && !dense)) {
        out.push(s);
        continue;
      }
      let parts = splitSentences(translation, locale).flatMap((x) => hardSplit(x, maxChars));
      parts = parts.filter(Boolean);
      if (parts.length <= 1) {
        out.push(s);
        continue;
      }
      const weights = parts.map((x) => Math.max(4, estimateSeconds(x)));
      const total = weights.reduce((a, b) => a + b, 0);
      const dur = Math.max(0.4, s.end - s.start);
      let acc = 0;
      parts.forEach((piece, idx) => {
        const st = s.start + (dur * acc) / total;
        acc += weights[idx];
        const en = s.start + (dur * acc) / total;
        out.push({
          start: st,
          end: en,
          // 原文只挂在第一段，避免双语模式重复显示
          text: idx === 0 ? s.text : "",
          translation: piece,
        });
      });
    }
    return out;
  }

  class DubEngine {
    constructor({ video, subs, voice, lang, onLog, onCue }) {
      this.video = video;
      this.subs = splitCues(subs, 30, lang || "zh-CN");
      this._rawSubs = subs.length;
      this.voice = voice;
      this.lang = lang;
      this.log = onLog || (() => {});
      if (this.subs.length !== this._rawSubs) {
        this.log(`cue 切分: ${this._rawSubs} → ${this.subs.length}`);
      }
      this.onCue = onCue || null;

      this.audioMap = new Map(); // index -> HTMLAudioElement | null
      this.cursor = 0;           // 下一句要播的下标
      this.fetchNext = 0;        // 下一句要预取的下标
      this.workers = 0;
      this.running = false;
      this.timer = null;
      this.pumpTimer = null;
      this.activeAudio = null;
      this.tails = []; // 上一句快要结束时允许它自然收尾
      this.activeIndex = -1;
      this.paused = false;
      this._pending = null; // 正在处理的那一句（保证不并发、不乱序）
      this.mode = "tts";    // 先按浏览器语音起步；helper 探测通过再切 audio
      this.systemVoiceOk = false;

      this.origVolume = video.volume;
      this.origMuted = video.muted;

      this._onPause = () => this.onPause();
      this._onPlay = () => this.onResume();
      this._onRate = () => {
        if (this._selfRate) return; // 我们自己调的倍速，不算用户操作
        this.baseRate = this.video.playbackRate || 1;
        if (this.activeAudio) {
          this.activeAudio.playbackRate = Math.min(2.5, this.baseRate * (this.activeAudio._fit || 1));
        }
      };
      this._onSeek = () => this.onSeek();
      this._anchor = video.currentTime || 0;
    }

    // ---------- 生命周期 ----------
    start() {
      if (this.running) return;
      this.running = true;
      this.baseRate = this.video.playbackRate || 1; // 用户自己的倍速，后面所有调整都以它为基准
      this.alignTo(videoTime(this.video));
      this.muteOriginal();
      this.hideNativeCaptions(true);
      this.bindVideo();
      this.detectBackend();
      this.loop();
      this.schedulePump(0);
    }

    stop() {
      this.running = false;
      this.unbindVideo();
      if (this.timer) clearTimeout(this.timer);
      if (this.pumpTimer) clearTimeout(this.pumpTimer);
      this.timer = this.pumpTimer = null;
      this.stopAudio();
      if (this.onCue) this.onCue(null);
      this.restoreOriginal();
    }

    alignTo(t) {
      let i = this.subs.findIndex((s) => s.end >= t);
      if (i < 0) i = this.subs.length;
      // 落在句子后半段才加入：直接从下一句开始，避免半句起步
      const cur = this.subs[i];
      if (cur && cur.end - t < (cur.end - cur.start) * 0.5) i += 1;
      this.cursor = i;
      this.fetchNext = i;
      this.activeIndex = -1;
      this._anchor = t;
      this._freshSeek = true; // 跳转后的第一句不按"落后"丢弃
    }

    onSeek() {
      const t = videoTime(this.video);
      if (Math.abs(t - this._anchor) < 0.75) return; // 抖动
      this._anchor = t;
      this.stopAudio();
      this.alignTo(t);
      this.schedulePump(0);
    }

    onPause() {
      this.paused = true;
      if (this.activeAudio && !this.activeAudio.paused) this.activeAudio.pause();
    }

    onResume() {
      this.paused = false;
      this._pending = null; // 正在处理的那一句（保证不并发、不乱序）
      this.mode = "tts";    // 先按浏览器语音起步；helper 探测通过再切 audio
      this.systemVoiceOk = false;
      if (this.activeAudio && this.activeAudio.paused && !this.activeAudio.ended) {
        this.activeAudio.play().catch(() => {});
      }
      this.schedulePump(0);
    }

    bindVideo() {
      this.video.addEventListener("pause", this._onPause);
      this.video.addEventListener("play", this._onPlay);
      this.video.addEventListener("ratechange", this._onRate);
      this.video.addEventListener("seeked", this._onSeek);
    }

    unbindVideo() {
      this.video.removeEventListener("pause", this._onPause);
      this.video.removeEventListener("play", this._onPlay);
      this.video.removeEventListener("ratechange", this._onRate);
      this.video.removeEventListener("seeked", this._onSeek);
    }

    // 为了拿到字幕我们打开了 CC，配音时要把 YouTube 自带的字幕藏起来，避免和我们的叠加层打架
    hideNativeCaptions(on) {
      if (window.DubWaveAdapter && window.DubWaveAdapter.hideNativeCaptions) {
        window.DubWaveAdapter.hideNativeCaptions(on);
        return;
      }
      const player = document.querySelector(".html5-video-player") || document.body;
      player.classList.toggle("dubwave-on", !!on);
    }

    muteOriginal() {
      try {
        this.video.muted = true;
        this.video.volume = 0;
      } catch {}
    }

    restoreOriginal() {
      try {
        this.video.volume = this.origVolume;
        this.video.muted = this.origMuted;
      } catch {}
    }

    // ---------- 推进 ----------
    loop() {
      if (!this.running) return;
      const interval = Math.max(50, TICK_MS / Math.max(1, this.baseRate || 1));
      this.timer = setTimeout(() => {
        try {
          this.tick();
        } catch (e) {
          this.log("tick 异常: " + e.message);
        }
        this.loop();
      }, interval);
    }

    tick() {
      if (!this.running || this.video.paused || this.video.seeking) return;
      if (this.video.playbackRate === 0) return;
      if (this._pending) return; // 上一句还在准备（TTS 还没回来），先别越过它
      const t = videoTime(this.video);

      while (this.cursor < this.subs.length && t >= this.subs[this.cursor].start) {
        const i = this.cursor++;
        const sub = this.subs[i];
        const late = t - sub.start;
        const lateLimit = LATE_SKIP * Math.max(1, this.baseRate || 1);
        const force = this._freshSeek;
        this._freshSeek = false;
        if (late > lateLimit && !force) {
          this.log(`跳过 #${i}（落后 ${late.toFixed(1)}s）`);
          continue;
        }
        this._pending = this.playIndex(i, t, force).finally(() => {
          this._pending = null;
        });
        break; // 一次只推进一句，避免乱序
      }
      this.schedulePump(0);
    }

    // ---------- 播放 ----------
    async playIndex(i, now, force = false) {
      const sub = this.subs[i];
      if (!sub) return;
      this.activeIndex = i;
      if (this.onCue) this.onCue(sub);

      if (this.mode === "tts") {
        if (this.activeAudio) this.stopAudio();
        this.speakSystem(sub.translation || sub.text || "", this.slotOf(i), i);
        this.lastSpoken = i;
        return;
      }

      let audio = this.audioMap.get(i);
      if (audio === undefined) {
        // 关键：高速播放或 TTS 慢时不能在这里等，否则整条时间轴被拖住
        this.fetchOne(i); // 后台补，下一句可能就用上
        if (this.systemVoiceOk) {
          this.speakSystem(sub.translation || sub.text || "", this.slotOf(i), i);
          this.log(`未就绪，系统语音顶上 #${i}`);
          return;
        }
        this.log(`未预取且无系统语音，临时拉取 #${i}`);
        await this.fetchOne(i);
        audio = this.audioMap.get(i);
      }
      if (!this.running) return; // 期间被停止
      // 预取慢时这里可能已经落后：只要没超过 LATE_SKIP 就补播，别把这句丢掉
      const late = videoTime(this.video) - sub.start;
      const lateLimit = LATE_SKIP * Math.max(1, this.baseRate || 1);
      if (late > lateLimit && !force) {
        this.log(`#${i} 音频就绪太晚（${late.toFixed(1)}s），跳过`);
        return;
      }
      if (!audio) {
        this.log(`#${i} 无音频（合成失败）`);
        return;
      }

      // 上一句如果只差一点点就结束，让它自然收尾，不要硬切（尾音丢失的主因）
      const prev = this.activeAudio;
      const prevRemain = prev && isFinite(prev.duration) ? prev.duration - prev.currentTime : 0;
      if (prev && prevRemain > 0.9) {
        this.log(`cut #${i - 1} remain=${prevRemain.toFixed(2)}s`); // 被迫截断，正常应为 0
        this.stopAudio();
      } else if (prev && prevRemain > 0) {
        this.activeAudio = null;
        this.tails.push(prev);
      } else {
        this.stopAudio();
      }

      this.activeAudio = audio;
      audio.volume = 0;
      this.fadeTo(audio, 1, 50); // 淡入，避免爆音

      // 时长对齐：
      //   1) 先给配音提速，最多 1.5x；
      //   2) 还不够就把视频放慢，最低 0.75x（它用 applyClauseVideoRate，minVideoFactor=0.75）；
      //   3) 都不够才允许溢出到下一句开头，尽量不截断尾音。
      const nextStart = this.subs[i + 1] ? this.subs[i + 1].start : sub.end + 0.6;
      const slot = Math.max(0.5, nextStart - sub.start);
      const offset = Math.max(0, videoTime(this.video) - sub.start);
      const base = this.baseRate || this.video.playbackRate || 1;
      const applyRate = () => {
        const d = audio.duration;
        if (!isFinite(d) || d <= 0) return;
        const remainAudio = Math.max(0.2, d - offset);
        const remainSlot = Math.max(0.6, slot - offset);
        const need = remainAudio / remainSlot;
        const fit = Math.min(AUDIO_MAX_RATE, Math.max(1, need));
        audio._fit = fit;
        audio.playbackRate = Math.min(3.4, base * fit);
        // 还可能溢出：把视频放慢，给它腾时间
        const vf = need > AUDIO_MAX_RATE ? Math.max(VIDEO_MIN_RATE, AUDIO_MAX_RATE / need) : 1;
        this.applyVideoFactor(vf);
        this.log(
          `fit #${i} dur=${d.toFixed(2)} slot=${remainSlot.toFixed(2)} audio=${fit.toFixed(2)}x video=${vf.toFixed(2)}x`
        );
      };
      audio.addEventListener("loadedmetadata", applyRate, { once: true });
      applyRate();

      try {
        if (offset > 0.15) audio.currentTime = Math.min(offset, (audio.duration || offset) - 0.05);
        else audio.currentTime = 0;
      } catch {}
      audio.play().catch((e) => {
        if (this.running) this.log(`play 失败: ${e.message}`);
      });
      this.log(`play #${i} dur=${audio.duration ? audio.duration.toFixed(2) : "?"} slot=${slot.toFixed(2)} rate=${(audio._fit || 1).toFixed(2)}`);
    }

    fadeTo(audio, target, ms = 60) {
      if (!audio) return;
      const steps = Math.max(1, Math.round(ms / 20));
      const from = audio.volume;
      let i = 0;
      clearInterval(audio._fade);
      audio._fade = setInterval(() => {
        i++;
        try {
          audio.volume = Math.min(1, Math.max(0, from + ((target - from) * i) / steps));
        } catch {}
        if (i >= steps) {
          clearInterval(audio._fade);
          audio._fade = null;
        }
      }, 20);
    }

    // helper 不可用时退回浏览器内置语音，保证「装完能用」
    detectBackend() {
      chrome.runtime.sendMessage({ type: "ping-helper" }, (r) => {
        if (chrome.runtime.lastError || !r) return;
        this.systemVoiceOk = (r.voices || 0) > 0;
        if (r.ok) {
          this.mode = "audio";
          this.log("使用本地 TTS 服务");
          this.schedulePump(0);
        } else {
          this.mode = "tts";
          this.log(`helper 不可用，使用浏览器内置语音（可用音色 ${r.voices || 0} 个）`);
        }
      });
    }

    // 用浏览器内置语音读一句（同步、零等待）
    speakSystem(text, slot, tag) {
      const est = estimateSeconds(text);
      const rate = Math.min(2, Math.max(0.6, est / Math.max(0.5, slot)));
      chrome.runtime.sendMessage(
        { type: "tts-speak", text, lang: this.lang || "zh-CN", rate },
        (r) => {
          if (chrome.runtime.lastError) this.log(`sys ${tag} 失败: ${chrome.runtime.lastError.message}`);
          else if (r && !r.ok) this.log(`sys ${tag} 失败: ${r.error}`);
        }
      );
      this.log(`sys #${tag} rate=${rate.toFixed(2)}`);
    }

    // 只临时改视频倍速，并把它和我们自己的调整区分开
    applyVideoFactor(factor) {
      if (!this.running) return;
      const target = Math.max(0.5, Math.min(4, (this.baseRate || 1) * factor));
      if (Math.abs((this.video.playbackRate || 1) - target) < 0.01) return;
      this._selfRate = true;
      try { this.video.playbackRate = target; } catch {}
      setTimeout(() => { this._selfRate = false; }, 80);
    }

    stopAudio() {
      if (this.mode === "tts") {
        chrome.runtime.sendMessage({ type: "tts-stop" });
      }
      for (const a of this.tails || []) {
        try { a.pause(); } catch {}
      }
      if (this.tails) this.tails.length = 0;
      if (this.activeAudio) {
        const a = this.activeAudio;
        this.fadeTo(a, 0, 70);
        setTimeout(() => {
          try {
            a.pause();
            a.currentTime = 0;
          } catch {}
        }, 75);
        this.activeAudio = null;
      }
    }

    // ---------- 预取 ----------
    schedulePump(delay) {
      if (!this.running || this.pumpTimer) return;
      this.pumpTimer = setTimeout(() => {
        this.pumpTimer = null;
        this.pump();
      }, delay);
    }

    pump() {
      if (!this.running || this.mode !== "audio") return;
      // 预取窗口：至少 AHEAD 句，并且覆盖未来 AHEAD_TIME 秒（高速播放时句数会更多）
      const cur = this.subs[this.cursor];
      const horizon = (cur ? cur.start : 0) + AHEAD_TIME;
      let limit = this.cursor;
      while (limit < this.subs.length && limit - this.cursor < AHEAD_MAX && this.subs[limit].start <= horizon) {
        limit++;
      }
      limit = Math.max(limit, Math.min(this.subs.length, this.cursor + AHEAD));
      const maxWorkers = Math.min(6, PREFETCH * Math.max(1, Math.ceil(this.baseRate || 1)));
      while (this.workers < maxWorkers && this.fetchNext < limit) {
        const i = this.fetchNext++;
        if (this.audioMap.has(i)) continue;
        this.workers++;
        this.fetchOne(i).finally(() => {
          this.workers--;
          this.schedulePump(0);
        });
      }
    }

    // 这句的可用槽位：到下一句开始为止
    slotOf(i) {
      const sub = this.subs[i];
      const next = this.subs[i + 1];
      const end = next ? next.start : sub.end + 0.6;
      return Math.max(0.5, end - sub.start);
    }

    async fetchOne(i) {
      const sub = this.subs[i];
      if (!sub) return;
      try {
        // 边播边翻模式下，这一句可能还没轮到翻译：等最多 3 秒
        for (let k = 0; k < 12 && this.running && !sub.translation; k++) {
          await new Promise((r) => setTimeout(r, 250));
        }
        const text = (sub.translation || sub.text || "").trim();
        if (!text) {
          this.audioMap.set(i, null);
          return;
        }
        // 合成前先算语速：估时长和槽位的比值决定说快还是说慢
        const slot = this.slotOf(i);
        const est = estimateSeconds(text);
        const rate = Math.round(Math.min(RATE_MAX, Math.max(RATE_MIN, (est / slot - 1) * 100)));
        this.log(`tts #${i} est=${est.toFixed(1)}s slot=${slot.toFixed(1)}s rate=${rate > 0 ? "+" : ""}${rate}%`);
        let { audio, rateUsed } = await this.synthWithRetry(text, rate);

        // 合成后实测时长，偏离槽位太多就按实际值再合一次
        const dur = await durationOf(audio);
        if (dur > 0) {
          const ratio = dur / slot;
          if (ratio > 1.06 || ratio < 0.6) {
            const fixed = Math.round(
              Math.min(RATE_MAX, Math.max(RATE_MIN, rateUsed + (ratio - 1) * 100))
            );
            if (Math.abs(fixed - rateUsed) >= 8) {
              const retry = await this.synthWithRetry(text, fixed);
              const dur2 = await durationOf(retry.audio);
              if (dur2 > 0 && Math.abs(dur2 - slot) < Math.abs(dur - slot)) {
                audio = retry.audio;
                rateUsed = fixed;
                this.log(`retry #${i} ${rateUsed > 0 ? "+" : ""}${rateUsed}% dur ${dur.toFixed(2)}→${dur2.toFixed(2)}s (slot ${slot.toFixed(2)}s)`);
              }
            }
          }
        }
        this.audioMap.set(i, audio);
      } catch (e) {
        this.log(`tts[${i}] 失败: ${e.message}`);
        this.audioMap.set(i, null);
      }
    }

    async synthWithRetry(text, rate, attempts = 3) {
      let lastErr = null;
      for (let a = 0; a < attempts; a++) {
        try {
          return await this.synthOnce(text, rate);
        } catch (e) {
          lastErr = e;
          if (a < attempts - 1) {
            const delay = a === 0 ? 300 : 900;
            this.log(`tts retry ${a + 1}/${attempts - 1} in ${delay}ms: ${e.message}`);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      throw lastErr || new Error("tts failed");
    }

    async synthOnce(text, rate) {
      const r = await this.tts(text, rate);
      if (!r || !r.ok) throw new Error((r && r.error) || "tts failed");
      const blob = await (await fetch(`data:${r.contentType};base64,${r.audioBase64}`)).blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.preload = "auto";
      audio._rate = rate;
      return { audio, rateUsed: rate };
    }

    tts(text, rate) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ ok: false, error: "timeout" }), 20000);
        chrome.runtime.sendMessage({ type: "tts", text, voice: this.voice, lang: this.lang, rate }, (r) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(r);
        });
      });
    }
  }

  function durationOf(audio) {
    return new Promise((resolve) => {
      if (isFinite(audio.duration) && audio.duration > 0) return resolve(audio.duration);
      let done = false;
      const finish = (v) => {
        if (!done) {
          done = true;
          resolve(v);
        }
      };
      audio.addEventListener("loadedmetadata", () => finish(audio.duration || 0), { once: true });
      setTimeout(() => finish(0), 2500);
    });
  }

  function videoTime(v) {
    return Number.isFinite(v.currentTime) ? v.currentTime : 0;
  }

  window.DubWaveEngine = DubEngine;
})();
