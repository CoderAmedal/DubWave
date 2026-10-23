## 1. 后端探测
- [x] 1.1 引擎默认为 `tts` 模式，`ping-helper` 成功后才切到 `audio`
- [x] 1.2 `ping-helper` 同时返回系统可用音色数量
- [x] 1.3 本地服务不可用时输出明确日志

## 2. 系统语音链路
- [x] 2.1 manifest 增加 `tts` 权限
- [x] 2.2 Service Worker 代理 `tts-speak` / `tts-stop`（content script 无 `chrome.tts`）
- [x] 2.3 按 `est/slot` 计算语速，范围 0.6–2.0
- [x] 2.4 停止配音或跳转时调用 `tts-stop`

## 3. 提示与文档
- [x] 3.1 弹窗提示改为「已切换为浏览器内置语音」
- [x] 3.2 更新 README 与上架文档中的路线说明
