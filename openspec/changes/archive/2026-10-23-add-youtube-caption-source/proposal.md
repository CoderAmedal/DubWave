## Why
YouTube 播放器只在用户开启字幕时才请求 `timedtext`，且该请求带有 `pot` 签名；
扩展内自行拼接或重放 URL 会得到 200 状态但 0 字节的响应，无法直接取字幕。

## What Changes
- 新增 `src/inject.js`，运行在 MAIN world 的 `document_start`
- 挂钩 `fetch` 与 `XMLHttpRequest`，命中 `timedtext` 时克隆响应并缓存
- 通过 `player.setOption('captions','track',...)` 触发播放器请求指定轨道
- 新增 `src/adapters/youtube.js`，把上述能力包装成平台适配器

## Impact
- 影响能力：`caption-source`
- 只在 YouTube watch 页生效
