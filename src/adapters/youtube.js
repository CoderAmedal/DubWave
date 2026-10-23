// adapters/youtube.js — YouTube 适配器：字幕来自 MAIN world 的 inject.js 桥
(() => {
  const SRC = "dubwave";

  function request(kind, payload = {}, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const reqId = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        reject(new Error(`bridge timeout: ${kind}`));
      }, timeoutMs);
      function onMsg(ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.source !== SRC || d.dir !== "res") return;
        if (!d.payload || d.payload.reqId !== reqId) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        if (d.kind === "error") reject(new Error(d.payload.message));
        else resolve(d.payload);
      }
      window.addEventListener("message", onMsg);
      window.postMessage({ source: SRC, dir: "req", kind, payload: { ...payload, reqId } }, location.origin);
    });
  }

  window.DubWaveAdapter = {
    name: "youtube",
    async getTracks() {
      const meta = await request("tracks");
      return { tracks: meta.tracks || [], audioLang: meta.audioLang || "" };
    },
    async getCues(track) {
      const r = await request("cues", { lang: track.languageCode, kind: track.kind }, 25000);
      return r.cues || [];
    },
    playerBar() {
      return document.querySelector(".ytp-right-controls");
    },
    video() {
      return document.querySelector("video.html5-main-video") || document.querySelector("video");
    },
    onNavigate(cb) {
      document.addEventListener("yt-navigate-finish", cb);
    },
    hideNativeCaptions(on) {
      const p = document.querySelector(".html5-video-player");
      if (p) p.classList.toggle("dubwave-on", !!on);
    },
  };
})();
