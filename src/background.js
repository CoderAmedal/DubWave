// background.js — service worker：翻译 + TTS 代理（TTS 走本机 127.0.0.1:8758 helper）。
const DEFAULTS = {
  targetLang: "zh-CN",
  voice: "zh-CN-XiaoxiaoNeural",
  translator: "google",       // google | openai
  openaiBase: "",
  openaiKey: "",
  openaiModel: "gpt-4o-mini",
  ttsEndpoint: "http://127.0.0.1:8758",
};

async function settings() {
  const s = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

// ---------- 翻译 ----------
async function googleTranslate(texts, target) {
  // 免费端点，无需 key；分批，每批不超过 ~1800 字符
  const out = [];
  let batch = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const q = batch.join("\n");
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
      encodeURIComponent(target) +
      "&dt=t&q=" + encodeURIComponent(q);
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) throw new Error("translate HTTP " + r.status);
    const data = await r.json();
    const joined = (data[0] || []).map((seg) => seg[0]).join("");
    const lines = joined.split("\n");
    if (lines.length === batch.length) out.push(...lines);
    else out.push(...batch.map(() => joined)); // 段落对不齐时退化处理
    batch = [];
    size = 0;
  };
  for (const t of texts) {
    if (size + t.length > 1800) await flush();
    batch.push(t);
    size += t.length + 1;
  }
  await flush();
  return out;
}

async function openaiTranslate(texts, cfg) {
  const sys = `你是字幕翻译。把用户给出的每行文本翻译成 ${cfg.targetLang}，保持行数一致，只输出译文，不要解释。`;
  const r = await fetch(cfg.openaiBase.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.openaiKey },
    body: JSON.stringify({
      model: cfg.openaiModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: texts.join("\n") },
      ],
    }),
  });
  if (!r.ok) throw new Error("openai HTTP " + r.status);
  const d = await r.json();
  const lines = (d.choices?.[0]?.message?.content || "").split("\n");
  return texts.map((_, i) => lines[i] || lines[0] || "");
}

// ---------- TTS ----------
async function synthesize(text, voice, endpoint, rate) {
  const r = await fetch(endpoint.replace(/\/$/, "") + "/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, rate }),
  });
  if (!r.ok) throw new Error("tts HTTP " + r.status);
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return { ok: true, contentType: "audio/mpeg", audioBase64: btoa(bin) };
}

// ---------- 路由 ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    const cfg = await settings();
    if (msg.type === "translate") {
      try {
        const texts = msg.texts || [];
        const result =
          cfg.translator === "openai" && cfg.openaiBase && cfg.openaiKey
            ? await openaiTranslate(texts, { ...cfg, targetLang: msg.targetLang || cfg.targetLang })
            : await googleTranslate(texts, msg.targetLang || cfg.targetLang);
        sendResponse({ ok: true, texts: result });
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
      return;
    }
    if (msg.type === "tts") {
      try {
        sendResponse(await synthesize(msg.text, msg.voice || cfg.voice, cfg.ttsEndpoint, msg.rate));
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
      return;
    }
    if (msg.type === "ping-helper") {
      try {
        const r = await fetch(cfg.ttsEndpoint.replace(/\/$/, "") + "/health");
        sendResponse({ ok: r.ok });
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
      return;
    }
    sendResponse({ ok: false, error: "unknown message" });
  })();
  return true; // 异步响应
});
