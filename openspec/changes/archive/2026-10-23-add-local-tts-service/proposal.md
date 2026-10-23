## Why
配音需要低延迟、可离线的语音合成，且不应把 API key 或音频处理放在页面上下文。

## What Changes
- 新增 `helper/helper.py`：aiohttp + edge-tts，暴露 `/health`、`/voices`、`/tts`
- 支持 `rate` 参数（-40% ~ +60%）与结果缓存
- `background.js` 负责翻译与 TTS 转发，content script 不直接访问 helper

## Impact
- 影响能力：`speech-synthesis`
- 需要用户本机启动 helper（默认 127.0.0.1:8758）
