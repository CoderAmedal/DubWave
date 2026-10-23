// inject.js — MAIN world。
// 关键点：YouTube 的 timedtext 请求带 pot/签名，扩展自己重新 fetch 会拿到 0 字节，
// 所以这里在 document_start 挂钩 fetch/XHR，截获播放器自己请求回来的字幕数据。
(() => {
  const SRC = "dubwave";
  if (window.__dubwaveInjected) return;
  window.__dubwaveInjected = true;

  const captured = []; // {lang, kind, url, text, at}

  function cap(url, text, via) {
    if (!text) return;
    let u;
    try { u = new URL(url, location.origin); } catch { return; }
    if (!/timedtext/i.test(u.pathname + u.href)) return;
    const lang = u.searchParams.get("lang") || u.searchParams.get("tlang") || "";
    const kind = u.searchParams.get("kind") || "";
    captured.push({ lang, kind, url: u.href, text, at: Date.now(), via });
    if (captured.length > 12) captured.shift();
  }

  // ---- fetch 钩子 ----
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const p = origFetch.apply(this, arguments);
    if (/timedtext/i.test(url)) {
      p.then((r) => {
        try {
          r.clone().text().then((t) => cap(url, t, "fetch")).catch(() => {});
        } catch {}
      }).catch(() => {});
    }
    return p;
  };

  // ---- XHR 钩子 ----
  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    try { this.__dubwaveUrl = String(u); } catch {}
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    try {
      this.addEventListener("load", () => {
        const u = this.__dubwaveUrl || "";
        if (!/timedtext/i.test(u)) return;
        try {
          const t = this.responseType === "json" ? JSON.stringify(this.response) : this.responseText;
          cap(u, t, "xhr");
        } catch {}
      });
    } catch {}
    return XS.apply(this, arguments);
  };

  // ---- 解析 ----
  function parseJson3(text) {
    const data = JSON.parse(text);
    const out = [];
    for (const e of data.events || []) {
      const segs = e.segs || [];
      const t = segs.map((s) => s.utf8 || "").join("").replace(/\n/g, " ").trim();
      if (!t) continue;
      const start = (e.tStartMs || 0) / 1000;
      const dur = (e.dDurationMs || 0) / 1000 || 2;
      out.push({ start, end: start + dur, text: t });
    }
    return out;
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "text/xml");
    const nodes = [...doc.querySelectorAll("text")];
    return nodes.map((n) => {
      const start = parseFloat(n.getAttribute("start") || "0");
      const dur = parseFloat(n.getAttribute("dur") || "2");
      return { start, end: start + dur, text: (n.textContent || "").replace(/\s+/g, " ").trim() };
    }).filter((c) => c.text);
  }

  function parseCues(text) {
    const t = (text || "").trim();
    if (!t) return [];
    if (t.startsWith("{")) return parseJson3(t);
    if (t.startsWith("<")) return parseXml(t);
    return []; // vtt 暂不处理
  }

  // 有些轨（尤其自动翻译的 ASR）是逐词/逐短语的，条数上千；这里按时间+长度合并
  function coalesce(cues, maxDur = 6, maxChars = 80) {
    const out = [];
    let cur = null;
    for (const c of cues) {
      if (!cur) {
        cur = { ...c };
        continue;
      }
      const gap = c.start - cur.end;
      const joined = (cur.text + " " + c.text).replace(/\s+/g, " ").trim();
      if (gap < 0.35 && c.end - cur.start <= maxDur && joined.length <= maxChars) {
        cur.text = joined;
        cur.end = c.end;
      } else {
        out.push(cur);
        cur = { ...c };
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  function merge(cues) {
    const out = [];
    for (const c of cues) {
      const prev = out[out.length - 1];
      if (prev && prev.text === c.text && c.start - prev.end < 0.35) prev.end = c.end;
      else out.push({ ...c });
    }
    return out;
  }

  // ---- 轨道列表 ----
  function playerResponse() {
    return (
      window.ytInitialPlayerResponse ||
      (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args &&
        window.ytplayer.config.args.player_response &&
        JSON.parse(window.ytplayer.config.args.player_response)) ||
      null
    );
  }

  function tracks() {
    const pr = playerResponse();
    const list = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(list)) return [];
    return list.map((t) => ({
      languageCode: t.languageCode || "",
      name: (t.name && (t.name.simpleText || (t.name.runs && t.name.runs[0] && t.name.runs[0].text))) || t.languageCode,
      kind: t.kind || "",
      vssId: t.vssId || "",
    }));
  }

  // ---- 让播放器去拉某条轨道，然后等我们截到它 ----
  async function fetchCues(lang, kind, timeoutMs = 12000) {
    const player = document.querySelector("#movie_player");
    const btn = document.querySelector(".ytp-subtitles-button");
    const before = captured.length;

    const enable = () => {
      try {
        if (player && player.setOption) {
          const opt = { languageCode: lang };
          if (kind) opt.kind = kind;
          player.setOption("captions", "track", opt);
          player.setOption("captions", "reload", true);
        }
      } catch {}
    };
    enable();
    // 播放器没反应就点一下 CC 按钮强制刷新
    setTimeout(() => {
      if (captured.length === before && btn && btn.getAttribute("aria-pressed") !== "true") btn.click();
    }, 1500);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hit = [...captured].reverse().find(
        (c) =>
          (!lang || c.lang === lang || (c.url || "").includes("lang=" + lang)) &&
          (kind ? c.kind === kind : true)
      );
      if (hit) {
        const cues = coalesce(merge(parseCues(hit.text)));
        if (cues.length) return { cues, from: hit.via, bytes: hit.text.length };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    // 兜底：任何一条已截获的字幕
    const any = [...captured].reverse().find((c) => parseCues(c.text).length);
    if (any) {
      const cues = coalesce(merge(parseCues(any.text)));
      return { cues, from: any.via + "/fallback", bytes: any.text.length };
    }
    throw new Error("没有截获到字幕数据（视频可能无字幕，或播放器未请求）");
  }

  window.addEventListener("message", async (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== SRC || d.dir !== "req") return;
    const reqId = d.payload?.reqId;
    const reply = (kind, payload) =>
      window.postMessage({ source: SRC, dir: "res", kind, payload: { reqId, ...payload } }, location.origin);
    try {
      if (d.kind === "tracks") {
        const pr = playerResponse();
        reply("tracks", {
          tracks: tracks(),
          audioLang: (pr?.videoDetails?.defaultAudioLanguage || "").split("-")[0],
        });
      }
      else if (d.kind === "cues") {
        const r = await fetchCues(d.payload.lang, d.payload.kind);
        reply("cues", r);
      }
    } catch (e) {
      reply("error", { message: String((e && e.message) || e) });
    }
  });

  console.log("[dubwave:inject] ready");
})();
