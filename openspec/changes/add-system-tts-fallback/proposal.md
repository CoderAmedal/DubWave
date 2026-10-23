## Why
扩展的语音合成依赖本机 helper 进程。审核者或新用户未启动 helper 时点击配音会直接失败，
既影响首次体验，也容易被 Chrome Web Store 判定为「功能不足」。

## What Changes
- 启动时探测 helper：可用则使用本地 Edge TTS，不可用则降级为浏览器内置语音（`chrome.tts`）
- 新增 `tts` 权限与 Service Worker 的 `tts-speak` / `tts-stop` 消息
- 降级时按槽位估算语速，仍保持逐句推进与原声静音
- 提示语改为「已切换为浏览器内置语音（音质一般）」

## Impact
- 影响能力：`speech-synthesis`
- 本地服务存在时行为不变；降级路径不支持淡入淡出与时长精调
