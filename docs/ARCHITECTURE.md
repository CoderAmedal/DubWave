# DubWave 架构

## 整体结构

```
┌──────────────── page (youtube.com / bilibili.com) ────────────────┐
│  MAIN world (仅 YouTube)                                          │
│    inject.js   挂钩 fetch / XMLHttpRequest，截获 timedtext 响应    │
│                                                                    │
│  ISOLATED world                                                    │
│    adapters/*.js   平台适配：字幕轨道、字幕内容、播放器挂载点      │
│    content.js      通用核心：按钮、选轨、分块翻译、滑动窗口        │
│    engine.js       播放引擎：预取、游标推进、时长对齐、原声静音    │
└────────────────────────────────────────────────────────────────────┘
                              │ chrome.runtime
┌───────────────────── service worker ───────────────────────────────┐
│  background.js    翻译（Google / OpenAI 兼容）+ TTS 转发          │
└────────────────────────────────────────────────────────────────────┘
                              │ HTTP
┌────────────────────────────────────────────────────────────────────┐
│  helper/helper.py  edge-tts → /tts 返回 audio/mpeg（127.0.0.1:8758）│
└────────────────────────────────────────────────────────────────────┘
```

## 平台适配层

`content.js` 不直接碰任何平台细节，只依赖 `window.DubWaveAdapter`：

| 方法 | 作用 |
|---|---|
| `getTracks()` | 返回 `{tracks, audioLang}`，每条含 `languageCode / kind / name` |
| `getCues(track)` | 返回 `[{start, end, text}]` |
| `playerBar()` | 返回要插入按钮的控制栏容器 |
| `video()` | 返回 `<video>` 元素 |
| `onNavigate(cb)` | 注册站点内导航（SPA / 分 P 切换） |
| `hideNativeCaptions(on)` | 配音期间隐藏站点原生字幕 |

### YouTube

`inject.js` 在 `document_start` 运行在 MAIN world：

1. 从 `ytInitialPlayerResponse` 读 `captionTracks`；
2. 挂钩 `window.fetch` 与 `XMLHttpRequest`，凡是 URL 命中 `timedtext` 就克隆响应并缓存；
3. 需要某条轨道时调用 `#movie_player.setOption('captions','track',{languageCode,kind})`
   让播放器自己去请求，再从缓存里取回数据。

> 为什么不能自己 fetch：`captionTracks[].baseUrl` 现在需要 `pot`（proof-of-origin）签名，
> 扩展上下文里直接请求会返回 **200 + 0 字节**，`fmt=json3/vtt/srv3` 都一样。

### Bilibili

```
x/web-interface/view?bvid=…   → aid、当前分 P 的 cid
x/player/v2?aid=&cid=         → subtitle.subtitles[]（lan / lan_doc / ai_status / subtitle_url）
subtitle_url                  → {"body":[{from,to,content}]}
```

字幕接口需要登录态，且视频本身要有 UP 主字幕或已生成 AI 字幕。

## 翻译流水线

```
字幕 → 聚块(1500字/45秒) → 4 路并发翻译 → 按源字符比例回填到每一句
```

- **聚块**：几千条逐词字幕会被压成几十到几百块，请求数下降一个数量级
- **并发**：4 个 worker 同时跑
- **滑动窗口**：只翻「当前位置往后 3 分钟」，翻完立刻开播，之后每 8 秒补一次
- 某句播放时还没轮到翻译：最多等 3 秒，之后退回原文

## 播放引擎

### 推进方式

不依赖 `VTTCue.oncuechange`（事件会合并/丢帧导致漏读），而是每 120ms 检查
`video.currentTime`，用 `cursor` 逐句推进：

```
while (t >= subs[cursor].start) { play(cursor++); }
```

一次只启动一句（`_pending` 守卫），保证 TTS 慢时也不会后一句先播、前一句补播。

### 时长对齐（三段式）

1. **合成前**：`est ≈ 汉字/4.6 + 词/2.7 + 0.35`，与槽位（到下一句开始）比较，
   给 edge-tts 传 `rate`（-12% ~ +70%）
2. **合成后**：实测音频时长，偏离槽位 >6% 就按实际比值再合成一次，取更接近的一条
3. **播放时**：仍有偏差则配音提速（≤1.6x），再不够就临时放慢视频（≥0.8x），
   停止时恢复用户原倍速；上一句剩余 ≤0.9s 时不硬切，让它自然收尾

### 其他

- 播放中 `video.muted = true`，停止时恢复原 `volume`/`muted`
- 每句 50ms 淡入、切句 70ms 淡出，消除爆音
- TTS 失败重试 2 次（300ms / 900ms 退避）
- 预取并发 3，窗口为当前位置之后 6 句

## 字幕叠加

`content.js` 在播放器里插入一个绝对定位层，按 `subMode` 渲染：

| 模式 | 显示 |
|---|---|
| `bilingual` | 原文（灰底）在上，译文（深底）在下 |
| `translation` | 仅译文 |
| `original` | 仅原文 |
| `none` | 不显示 |

设置改动通过 `chrome.storage.onChanged` + 2 秒轮询兜底实时生效。

## 已知限制

- 只支持 YouTube watch 页与 Bilibili 视频页，不处理 Shorts / 直播 / 嵌入播放器
- 视频必须自带字幕；Bilibili 还需要登录
- 译文明显长于原句时，视频会有可见的轻微放慢
