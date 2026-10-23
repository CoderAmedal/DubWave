// popup.js — 设置读写 + TTS 连通性测试
const FIELDS = ["targetLang", "voice", "subMode", "translator", "openaiBase", "openaiKey", "openaiModel", "ttsEndpoint"];
const DEFAULTS = {
  targetLang: "zh-CN",
  voice: "zh-CN-XiaoxiaoNeural",
  subMode: "bilingual",
  translator: "google",
  openaiBase: "",
  openaiKey: "",
  openaiModel: "gpt-4o-mini",
  ttsEndpoint: "http://127.0.0.1:8758",
};

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

function setStatus(t) { statusEl.textContent = t; }

function toggleOpenAI() {
  $("openaiBox").classList.toggle("hide", $("translator").value !== "openai");
}

async function load() {
  const s = await chrome.storage.local.get(DEFAULTS);
  for (const f of FIELDS) if (s[f] !== undefined) $(f).value = s[f];
  toggleOpenAI();
}

async function save() {
  const out = {};
  for (const f of FIELDS) out[f] = $(f).value.trim ? $(f).value.trim() : $(f).value;
  await chrome.storage.local.set(out);
  setStatus("已保存");
  setTimeout(() => setStatus(""), 1500);
}

async function testTts() {
  setStatus("测试中…");
  const endpoint = ($("ttsEndpoint").value || DEFAULTS.ttsEndpoint).replace(/\/$/, "");
  try {
    const h = await fetch(endpoint + "/health");
    if (!h.ok) throw new Error("helper 返回 " + h.status);
    const r = await fetch(endpoint + "/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "配音服务连接正常。", voice: $("voice").value }),
    });
    if (!r.ok) throw new Error("tts 返回 " + r.status);
    const blob = await r.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    await audio.play();
    setStatus(`正常，音频 ${(blob.size / 1024).toFixed(0)} KB`);
  } catch (e) {
    setStatus("失败：" + e.message + "（检查 helper 是否启动）");
  }
}

$("translator").addEventListener("change", toggleOpenAI);
$("save").addEventListener("click", save);
$("test").addEventListener("click", testTts);
load();
