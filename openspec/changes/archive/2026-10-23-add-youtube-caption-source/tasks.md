## 1. 截获链路
- [x] 1.1 在 MAIN world 注入，避免被页面隔离影响
- [x] 1.2 挂钩 `window.fetch`，克隆 `timedtext` 响应读取文本
- [x] 1.3 挂钩 `XMLHttpRequest.open/send`，覆盖播放器实际使用的通道
- [x] 1.4 解析 json3 / xml，合并相邻同文 cue

## 2. 轨道控制
- [x] 2.1 从 `ytInitialPlayerResponse` 读取 `captionTracks`
- [x] 2.2 调用 `setOption('captions','track')` + `reload` 触发请求
- [x] 2.3 12 秒超时与兜底：任一条已截获轨道可作为回退
- [x] 2.4 适配器输出 `{tracks, audioLang}` 与 `getCues(track)`
