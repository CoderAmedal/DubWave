## Context
`captionTracks[].baseUrl` 需要 `pot`（proof-of-origin）参数，扩展上下文重放会返回空 body。
因此必须让页面自己发请求，再在网络层截获响应。

## Decisions
### 同时挂钩 fetch 与 XHR
YouTube 不同版本的播放器两条通道都用过，只挂一条会间歇性失败。

### 以「触发 + 等待」代替主动请求
调用 `setOption` 让播放器请求目标轨道，最多等 12 秒；超时后回退到任意已截获轨道，
保证「有字幕就能出声」，而不是直接失败。

## Risks
- 站点改版可能导致 `setOption` 失效 → 需要保留 CDP 手测手段
