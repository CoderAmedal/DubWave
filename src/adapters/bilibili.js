// adapters/bilibili.js — B 站适配器：走公开 API 取 CC 字幕
//   view  -> aid / cid
//   player/v2 -> subtitle.subtitles[]（含 subtitle_url）
//   subtitle_url -> {"body":[{from,to,content}]}
(() => {
  const VIEW = "https://api.bilibili.com/x/web-interface/view";
  const PLAYER = "https://api.bilibili.com/x/player/v2";

  function bvidFromUrl() {
    const m = location.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/);
    return m ? m[1] : "";
  }

  function pageIndex() {
    const p = new URLSearchParams(location.search).get("p");
    return Math.max(1, parseInt(p || "1", 10) || 1);
  }

  async function api(url, timeoutMs = 12000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { credentials: "include", signal: ctrl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.code !== 0) throw new Error(`B站接口 ${j.code}: ${j.message || ""}`);
      return j.data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function context() {
    const bvid = bvidFromUrl();
    if (!bvid) throw new Error("不是 B 站视频页");
    const view = await api(`${VIEW}?bvid=${bvid}`);
    const page = view.pages?.[pageIndex() - 1] || view.pages?.[0];
    if (!page) throw new Error("拿不到分 P 信息");
    return { bvid, aid: view.aid, cid: page.cid, title: view.title };
  }

  window.DubWaveAdapter = {
    name: "bilibili",
    emptyHint: "这个视频没有可用字幕（B 站字幕需要登录，且该视频要有 UP 主字幕或 AI 字幕）",
    async getTracks() {
      const { aid, cid } = await context();
      const data = await api(`${PLAYER}?aid=${aid}&cid=${cid}`);
      const list = data?.subtitle?.subtitles || [];
      return {
        audioLang: "zh",
        tracks: list.map((s) => ({
          id: s.id,
          languageCode: s.lan || "zh",
          kind: s.ai_status ? "asr" : "",
          name: `${s.lan_doc || s.lan}${s.ai_status ? " (AI)" : ""}`,
          url: s.subtitle_url?.startsWith("//") ? "https:" + s.subtitle_url : s.subtitle_url,
        })),
      };
    },
    async getCues(track) {
      if (!track.url) throw new Error("这条字幕没有下载地址（可能需要登录）");
      const r = await fetch(track.url, { credentials: "include" });
      if (!r.ok) throw new Error("字幕下载失败 HTTP " + r.status);
      const j = await r.json();
      return (j.body || [])
        .map((b) => ({ start: b.from, end: b.to, text: (b.content || "").trim() }))
        .filter((c) => c.text);
    },
    playerBar() {
      return (
        document.querySelector(".bpx-player-control-bottom-right") ||
        document.querySelector(".bpx-player-control-bottom") ||
        document.querySelector(".bilibili-player-video-bottom-area")
      );
    },
    video() {
      return document.querySelector("video");
    },
    onNavigate(cb) {
      // B 站是 SPA：分 P 切换 / 推荐跳转都不刷新页面
      window.addEventListener("popstate", cb);
      window.addEventListener("bpx_player_profile_change", cb);
      let last = location.href;
      setInterval(() => {
        if (location.href !== last) {
          last = location.href;
          cb();
        }
      }, 1500);
    },
    hideNativeCaptions(on) {
      let el = document.getElementById("dubwave-native-hide");
      if (!on) {
        if (el) el.remove();
        return;
      }
      if (el) return;
      el = document.createElement("style");
      el.id = "dubwave-native-hide";
      el.textContent = ".bpx-player-subtitle-panel, .bilibili-player-video-subtitle { display: none !important; }";
      document.head.appendChild(el);
    },
  };
})();
