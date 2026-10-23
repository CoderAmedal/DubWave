## 1. 接口对接
- [x] 1.1 从 URL 解析 bvid 与分 P 序号
- [x] 1.2 `view` 取 aid/cid，`player/v2` 取字幕列表
- [x] 1.3 处理协议相对地址（`//aisubtitle.hdslb.com/...`）
- [x] 1.4 解析 `body[{from,to,content}]` 为 cue

## 2. 站点适配
- [x] 2.1 按钮挂载到 `.bpx-player-control-bottom-right`
- [x] 2.2 SPA 导航监听（popstate + URL 轮询）
- [x] 2.3 配音期间隐藏站点原生字幕
- [x] 2.4 无字幕时提示「需要登录且视频要有字幕」
