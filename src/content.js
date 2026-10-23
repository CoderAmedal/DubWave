// content.js — 页面编排：注入按钮、选轨、取字幕、翻译、启动引擎。
(() => {
  if (window.__dubwaveContentLoaded) return; // 防止重复注入导致两个引擎同时播放
  window.__dubwaveContentLoaded = true;

  const IID = Math.random().toString(36).slice(2, 6);
  const log = (...a) => console.log("[dubwave:cs]" + IID, ...a);
  let engine = null;
  let busy = false;
  let tracksCache = [];
  let selected = null; // {languageCode, kind, name} | null = 自动
  let audioLang = "";
  let runToken = 0; // 每次启动+1，旧的流程在 await 后自动作废
  let subMode = "bilingual"; // bilingual | translation | original | none
  let lastSub = null;
  let translateTimer = null;

  // 用扩展自己的图标，避免和工具栏图标不一致
  const ICON_HTML = `<img class="dubwave-ico" src="${chrome.runtime.getURL("icon/icon32.png")}" width="16" height="16" alt="">`;

  const ADAPTER = window.DubWaveAdapter;
  if (!ADAPTER) {
    console.warn("[dubwave] 没有找到平台适配器，扩展未生效");
    return;
  }

  const bg = (msg) =>
    new Promise((resolve) => {
      const t = setTimeout(() => resolve({ ok: false, error: "bg timeout" }), 30000);
      chrome.runtime.sendMessage(msg, (r) => {
        clearTimeout(t);
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r);
      });
    });

  // ---- 自动选轨 ----
  function pickAuto(tracks) {
    const lang = (audioLang || "en").toLowerCase();
    return (
      tracks.find((t) => !t.kind && t.languageCode.toLowerCase().startsWith(lang)) ||
      tracks.find((t) => !t.kind) ||
      tracks.find((t) => t.kind === "asr" && t.languageCode.toLowerCase().startsWith(lang)) ||
      tracks.find((t) => t.kind === "asr") ||
      tracks[0]
    );
  }

  // ---- UI ----
  function mountButton() {
    if (document.getElementById("dubwave-btn")) return;
    const bar = ADAPTER.playerBar();
    if (!bar) return;

    const wrap = document.createElement("span");
    wrap.id = "dubwave-wrap";
    wrap.className = "dubwave-wrap";

    const btn = document.createElement("button");
    btn.id = "dubwave-btn";
    btn.className = "dubwave-btn";
    btn.title = "AI 配音（字幕翻译 + 本地 TTS）";
    btn.innerHTML = `${ICON_HTML}<span id="dubwave-label">配音</span>`;
    btn.addEventListener("click", onClick);

    const caret = document.createElement("button");
    caret.id = "dubwave-track-btn";
    caret.className = "dubwave-caret";
    caret.title = "选择字幕轨";
    caret.textContent = "▾";
    caret.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePanel();
    });

    wrap.appendChild(btn);
    wrap.appendChild(caret);
    bar.insertBefore(wrap, bar.firstChild);
    log("button mounted");
  }

  function setBtn(text, cls = "") {
    const b = document.getElementById("dubwave-btn");
    const label = document.getElementById("dubwave-label");
    if (label) label.textContent = text;
    else if (b) b.textContent = text;
    if (b) b.className = "dubwave-btn " + cls;
  }

  function toast(msg, ms = 4000) {
    let el = document.getElementById("dubwave-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "dubwave-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.style.display = "none"), ms);
  }

  function panelEl() {
    let p = document.getElementById("dubwave-panel");
    if (!p) {
      p = document.createElement("div");
      p.id = "dubwave-panel";
      document.body.appendChild(p);
    }
    return p;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function renderPanel() {
    const p = panelEl();
    const rows = [
      `<div class="dubwave-row ${selected ? "" : "on"}" data-i="-1">
         <span class="dubwave-name">自动（原声语言优先）</span><span class="dubwave-kind"></span>
       </div>`,
    ];
    tracksCache.forEach((t, i) => {
      const on = selected && selected.languageCode === t.languageCode && selected.kind === t.kind;
      rows.push(
        `<div class="dubwave-row ${on ? "on" : ""}" data-i="${i}">
           <span class="dubwave-name">${escapeHtml(t.name || t.languageCode)}</span>
           <span class="dubwave-kind">${t.kind === "asr" ? "自动" : "人工"}</span>
         </div>`
      );
    });
    p.innerHTML =
      `<div class="dubwave-head">字幕轨（${tracksCache.length}）</div>` +
      (tracksCache.length ? rows.join("") : `<div class="dubwave-row">没有可用字幕轨</div>`);

    p.querySelectorAll(".dubwave-row[data-i]").forEach((row) => {
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        const i = Number(row.dataset.i);
        selected = i < 0 ? null : tracksCache[i];
        chrome.storage.local.set({
          lastTrack: selected ? { languageCode: selected.languageCode, kind: selected.kind } : null,
        });
        log("selected:", selected ? selected.languageCode + "/" + selected.kind : "auto");
        renderPanel();
        hidePanel();
        if (engine) restart();
      });
    });
  }

  function togglePanel() {
    const p = panelEl();
    if (p.classList.contains("show")) return hidePanel();
    openPanel();
  }

  async function openPanel() {
    const p = panelEl();
    p.classList.add("show");
    if (!tracksCache.length) {
      p.innerHTML = `<div class="dubwave-head">字幕轨</div><div class="dubwave-row">读取中…</div>`;
      try {
        const meta = await ADAPTER.getTracks();
        tracksCache = meta.tracks || [];
        audioLang = meta.audioLang || "";
        const saved = (await chrome.storage.local.get({ lastTrack: null })).lastTrack;
        if (saved) {
          selected = tracksCache.find((t) => t.languageCode === saved.languageCode && t.kind === saved.kind) || null;
        }
      } catch (e) {
        tracksCache = [];
        log("读轨道失败:", e.message);
      }
    }
    renderPanel();
  }

  function hidePanel() {
    const p = document.getElementById("dubwave-panel");
    if (p) p.classList.remove("show");
  }

  // 点击面板外部关闭（全局只注册一次）
  document.addEventListener(
    "click",
    (e) => {
      const p = document.getElementById("dubwave-panel");
      if (!p || !p.classList.contains("show")) return;
      const t = e.target;
      if (p.contains(t) || (t.closest && t.closest("#dubwave-wrap"))) return;
      hidePanel();
    },
    true
  );

  // ---- 字幕叠加层 ----
  function ensureOverlay() {
    let el = document.getElementById("dubwave-subs");
    if (el) return el;
    const player = document.querySelector(".html5-video-player") || document.body;
    el = document.createElement("div");
    el.id = "dubwave-subs";
    el.className = "dubwave-subs";
    player.appendChild(el);
    return el;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }

  function renderCue(sub) {
    lastSub = sub;
    const el = ensureOverlay();
    if (!sub || subMode === "none") {
      el.innerHTML = "";
      el.style.display = "none";
      return;
    }
    const orig = esc(sub.text);
    const trans = esc(sub.translation || "");
    const parts = [];
    if (subMode === "original") parts.push(`<div class="dubwave-orig">${orig}</div>`);
    else if (subMode === "translation") parts.push(`<div class="dubwave-trans">${trans || orig}</div>`);
    else {
      // 上下：原文在上，译文在下
      if (orig) parts.push(`<div class="dubwave-orig">${orig}</div>`);
      if (trans) parts.push(`<div class="dubwave-trans">${trans}</div>`);
    }
    el.innerHTML = parts.join("");
    el.style.display = "flex";
  }

  // 把字幕按字符数/时长聚成翻译块，一条请求翻一大段
  function buildBlocks(cues, maxChars = 1500, maxSpan = 45) {
    const blocks = [];
    let cur = null;
    for (const c of cues) {
      const text = (c.text || "").trim();
      if (!text) continue;
      if (!cur || cur.chars + text.length > maxChars || c.end - cur.start > maxSpan) {
        cur = { start: c.start, end: c.end, chars: 0, cues: [], texts: [] };
        blocks.push(cur);
      }
      cur.cues.push(c);
      cur.texts.push(text);
      cur.end = c.end;
      cur.chars += text.length + 1;
    }
    return blocks;
  }

  // 整块译文回填：条数一致直接对应，不一致按源字符比例切
  function applyBlock(block, out) {
    if (!out || !out.length) return;
    if (out.length === block.cues.length) {
      block.cues.forEach((c, i) => { c.translation = (out[i] || "").trim(); });
      return;
    }
    const src = block.texts.join("");
    const dst = out.join("");
    if (!src.length || !dst.length) return;
    let acc = 0;
    block.cues.forEach((c, i) => {
      const from = Math.round((acc / src.length) * dst.length);
      acc += block.texts[i].length;
      const to = Math.round((acc / src.length) * dst.length);
      c.translation = dst.slice(from, to).trim();
    });
  }

  function videoEl() {
    return ADAPTER.video();
  }

  // ---- 主流程 ----
  async function runPipeline(track, token) {
    log("runPipeline", track.languageCode, track.kind);
    const { targetLang } = await chrome.storage.local.get({ targetLang: "zh-CN" });

    setBtn("取字幕…", "busy");
    const cues = await ADAPTER.getCues(track);
    if (token !== runToken) return;
    if (!cues || !cues.length) throw new Error("字幕内容为空");

    // 4 小时视频有 4000+ 条字幕，全量翻译要等两分钟；改成：
    //   1) 字幕聚成块（一条请求翻一大段）
    //   2) 4 路并发
    //   3) 只翻"当前播放位置往后 3 分钟"，翻完就开播，边播边补
    const blocks = buildBlocks(cues);
    const state = blocks.map((b) => ({ b, done: false }));
    log(`翻译分块: ${cues.length} 条 → ${blocks.length} 块`);

    const translateWindow = async (fromT, toT) => {
      const todo = state.filter((x) => !x.done && x.b.start <= toT && x.b.end >= fromT);
      let i = 0;
      let finished = 0;
      const worker = async () => {
        while (i < todo.length) {
          if (token !== runToken) return;
          const item = todo[i++];
          if (item.done) continue;
          const r = await bg({ type: "translate", texts: item.b.texts, targetLang });
          if (token !== runToken) return;
          if (r && r.ok) applyBlock(item.b, r.texts);
          else log("翻译失败，跳过一块: " + (r && r.error));
          item.done = true;
          finished++;
          const doneCount = state.filter((x) => x.done).length;
          if (engine) setBtn("停止配音", "playing");
          else setBtn(`翻译 ${doneCount}/${state.length}`, "busy");
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
      return finished;
    };

    const video = videoEl();
    if (!video) throw new Error("找不到 video 元素");
    const t0 = video.currentTime || 0;
    setBtn("翻译首个窗口…", "busy");
    await translateWindow(t0, t0 + 180);
    if (token !== runToken) return;

    const h = await bg({ type: "ping-helper" });
    if (!h || !h.ok) toast("未检测到本地 TTS 服务，已切换为浏览器内置语音（音质一般）", 8000);

    const { voice } = await chrome.storage.local.get({ voice: "zh-CN-XiaoxiaoNeural" });
    const st = await chrome.storage.local.get({ subMode: "bilingual" });
    subMode = st.subMode;
    if (token !== runToken) return;
    if (engine) engine.stop();
    engine = new window.DubWaveEngine({
      video,
      subs: cues,
      voice,
      lang: targetLang,
      onLog: (m) => log(m),
      onCue: (sub) => renderCue(sub),
    });
    engine.start();

    // 边播边补：每 8 秒把"当前位置往后 3 分钟"还没翻的块补上
    if (translateTimer) clearInterval(translateTimer);
    translateTimer = setInterval(() => {
      if (token !== runToken || !engine) return;
      const t = video.currentTime || 0;
      translateWindow(t, t + 180).catch(() => {});
    }, 8000);

    setBtn("停止配音", "playing");
    toast(`配音已启动（${track.languageCode}${track.kind === "asr" ? " 自动" : ""} · ${cues.length} 句，后台继续翻译）`);
  }

  async function startWith(track) {
    const token = ++runToken;
    busy = true;
    try {
      await runPipeline(track, token);
    } catch (e) {
      log("失败:", e.message);
      toast("配音失败：" + e.message, 6000);
      if (engine) { engine.stop(); engine = null; }
      if (translateTimer) { clearInterval(translateTimer); translateTimer = null; }
      setBtn("配音");
    } finally {
      busy = false;
    }
  }

  async function onClick() {
    if (busy) return;
    hidePanel();
    if (engine) {
      engine.stop();
      engine = null;
      if (translateTimer) clearInterval(translateTimer);
      translateTimer = null;
      setBtn("配音");
      toast("已停止配音");
      return;
    }
    let track;
    try {
      setBtn("取字幕…", "busy");
      const meta = await ADAPTER.getTracks();
      tracksCache = meta.tracks || [];
      audioLang = meta.audioLang || "";
      if (!tracksCache.length) throw new Error(ADAPTER.emptyHint || "该视频没有可用字幕轨道");
      // 选轨可能来自面板缓存；缓存里没有就自动挑
      track =
        (selected &&
          tracksCache.find((t) => t.languageCode === selected.languageCode && t.kind === selected.kind)) ||
        pickAuto(tracksCache);
      log("track:", track.languageCode, track.kind);
    } catch (e) {
      log("失败:", e.message);
      toast("配音失败：" + e.message, 6000);
      setBtn("配音");
      return;
    }
    await startWith(track);
  }

  // 运行中换轨：停掉旧的，按新轨重来
  async function restart() {
    if (busy) return;
    if (engine) {
      engine.stop();
      engine = null;
    }
    setBtn("配音");
    const track =
      (selected && tracksCache.find((t) => t.languageCode === selected.languageCode && t.kind === selected.kind)) ||
      pickAuto(tracksCache);
    await startWith(track);
  }

  // ---- 挂载 ----
  const timer = setInterval(() => {
    if (ADAPTER.playerBar()) {
      mountButton();
      clearInterval(timer);
    }
  }, 1000);

  ADAPTER.onNavigate(() => {
    if (engine) {
      engine.stop();
      engine = null;
    }
    tracksCache = [];
    audioLang = "";
    setBtn("配音");
    hidePanel();
    setTimeout(mountButton, 1200);
  });

  // ---- 字幕显示模式：设置变化实时生效（onChanged + 轮询兜底）----
  function applySubMode(next) {
    if (!next || next === subMode) return;
    subMode = next;
    log("subMode ->", subMode);
    if (engine) renderCue(lastSub);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.subMode) applySubMode(changes.subMode.newValue);
  });

  setInterval(() => {
    try {
      chrome.storage.local.get({ subMode: "bilingual" }, (v) => applySubMode(v.subMode));
    } catch (e) {
      /* 扩展上下文失效时忽略 */
    }
  }, 2000);

  log("content ready", IID);
})();
