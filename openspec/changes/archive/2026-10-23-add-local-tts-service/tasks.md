## 1. TTS 服务
- [x] 1.1 aiohttp 服务与 CORS 中间件
- [x] 1.2 `edge-tts` 合成，`rate` 参数透传
- [x] 1.3 结果缓存（音色 + 语速 + 文本 作为 key）
- [x] 1.4 并发信号量限制 6，避免被限流

## 2. 扩展侧
- [x] 2.1 service worker 转发 `/tts`，返回 base64 音频
- [x] 2.2 20 秒超时保护
- [x] 2.3 `requirements.txt` 固定 `edge-tts>=7.3`（旧版本 token 失效会导致 403）
