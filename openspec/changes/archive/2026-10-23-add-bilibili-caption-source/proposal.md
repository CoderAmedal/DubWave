## Why
Bilibili 的字幕不在页面 DOM 中，需要走 `x/player/v2` 接口；同时站点是 SPA，分 P 切换不刷新页面。

## What Changes
- 新增 `src/adapters/bilibili.js`
- 通过 `x/web-interface/view` 取 `aid` 与当前分 P 的 `cid`
- 通过 `x/player/v2` 取 `subtitle.subtitles[]`，再下载 `subtitle_url` 的 JSON
- 复用通用核心：按钮、选轨、翻译、播放

## Impact
- 影响能力：`caption-source`、`platform-adapters`
- 需要登录态；无字幕视频给出明确提示
