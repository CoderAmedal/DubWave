# DubWave

把视频字幕翻译成中文，再用本地 **Edge TTS** 实时配音，播放时自动静音原声、跟着字幕节奏念。

支持 **YouTube** 和 **Bilibili**，不依赖任何自建后端。


## 特性

- **字幕获取**
  - YouTube：截获播放器自己请求的 `timedtext`（带 `pot` 签名，扩展内直接 fetch 会拿到 0 字节）
  - Bilibili：`x/player/v2` 的 CC 字幕（需要登录，且视频要有 UP 主或 AI 字幕）
- **翻译**：Google 免费通道（默认）或任意 OpenAI 兼容接口
- **配音**：本地 `edge-tts`，音色可选（晓晓 / 云希 / 云扬 / 曉臻）
- **时长对齐**：合成前按槽位估算语速，合成后实测再校正，播放端还有提速与轻微放慢视频兜底
- **不漏读**：按时间游标推进而不是依赖 cue 事件；同一时刻只处理一句，保证顺序
- **字幕显示**：双语（原文上/译文下）、仅译文、仅原文、不显示
- **字幕轨选择**：面板里可手动切换，运行中换轨会重新翻译并接着播

## 安装

### 1. 本地 TTS 服务

```bash
cd helper
python3 -m venv --system-site-packages .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python helper.py          # 监听 127.0.0.1:8758
```

### 2. 加载扩展

`chrome://extensions` → 打开「开发者模式」→「加载已解压的扩展程序」→ 选择本目录。

### 3. 使用

打开 YouTube / Bilibili 视频 → 播放器右下角点「配音」。
下拉箭头可以选字幕轨，扩展弹窗里可以设置目标语言、音色、翻译引擎、字幕显示方式。

## 目录结构

```
manifest.json          MV3 清单
src/
  inject.js            YouTube：MAIN world 挂钩 fetch/XHR 截获 timedtext
  adapters/
    youtube.js         YouTube 适配器（字幕轨道 / 播放器挂载点）
    bilibili.js        Bilibili 适配器（view → player/v2 → subtitle_url）
  content.js           通用核心：UI、选轨、分块翻译、滑动窗口
  engine.js            播放引擎：预取、游标推进、时长对齐、原声静音
  background.js        Service Worker：翻译 + TTS 代理
  content.css          播放器按钮、选轨面板、字幕叠加层
  popup.html/js        设置页
helper/helper.py       本地 TTS（aiohttp + edge-tts）
icon/                  图标（icon.svg 为源文件）
tools/make_icons.py    从 icon.svg 生成各尺寸 PNG
docs/                  架构说明
```

## 关键实现

| 问题 | 做法 |
|---|---|
| 扩展内取 YouTube 字幕拿到空响应 | 在 `document_start` 挂钩 `fetch` / `XMLHttpRequest`，截获播放器自己发出的 timedtext |
| 5000+ 条逐词字幕翻译太慢 | 字幕聚块（1500 字符 / 45 秒）+ 4 路并发 + 只翻当前播放位置往后 3 分钟的滑动窗口 |
| 译文比原句长，尾音被切 | 合成前按槽位传 `rate`，合成后实测再合成一次；播放端再提速 ≤1.6x、放慢视频 ≥0.8x |
| 长视频等两分钟才出声 | 先翻第一个窗口就开播，剩下的边播边补 |
| 切句时爆音 | 50ms 淡入 / 70ms 淡出 |
| TTS 偶发失败导致漏读 | 失败重试 2 次（300ms / 900ms 退避），仍失败才放弃该句 |

更多细节见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 开发流程（OpenSpec）

需求与实现通过 OpenSpec 管理，`openspec/specs/` 是当前生效的能力规格，
`openspec/changes/archive/` 保留了每一次变更的提案、任务清单与设计决策。

```bash
openspec list --specs      # 查看能力与需求
openspec validate --all    # 校验规格与变更
```

新增能力时先在 `openspec/changes/<id>/` 写 proposal + tasks + 规格增量，
校验通过后再改代码，最后 `openspec archive <id> -y` 合并进主规格。

## 已知限制

- 只支持 YouTube watch 页与 Bilibili 视频页，不处理 Shorts / 直播 / 嵌入播放器
- 视频必须自带字幕；Bilibili 还需要登录态
- 译文明显长于原句时，视频会有可见的轻微放慢
- 仅在 Chrome 156（Linux/Flatpak）上验证过

## 免责声明

仅用于学习、安全研究与自有服务互操作。请遵守各平台的服务条款，不要用于分发受版权保护的内容。
