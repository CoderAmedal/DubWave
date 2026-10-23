# caption-source Specification

## Purpose
从各站点获取字幕轨道与 cue 列表，屏蔽 YouTube 与 Bilibili 的接口差异，为上层的翻译与配音提供统一的输入结构。

## Requirements

### Requirement: 截获播放器自身的字幕请求
系统 SHALL 在网络层截获播放器发出的 `timedtext` 响应，而不是在扩展上下文重新请求该 URL。

#### Scenario: 开启字幕后取到内容
- **WHEN** 用户对带字幕的 YouTube 视频触发配音
- **THEN** 系统通过 `setOption` 打开目标轨道，并在 12 秒内从截获缓存中解析出 cue 列表

#### Scenario: 直接请求被 pot 拦截
- **WHEN** 扩展直接 `fetch` `captionTracks[].baseUrl`
- **THEN** 响应可能为 200 但内容为空，系统 MUST NOT 以此判定视频无字幕

### Requirement: 订阅轨道清单与语言
系统 SHALL 向 UI 提供字幕轨道列表，包含语言代码、名称与是否为自动生成。

#### Scenario: 列出轨道
- **WHEN** 用户展开字幕轨面板
- **THEN** 面板显示全部轨道，并标注「人工」或「自动」

### Requirement: 支持 Bilibili CC 字幕
系统 SHALL 通过 `x/player/v2` 获取字幕列表，并下载 `subtitle_url` 指向的字幕 JSON。

#### Scenario: 已登录且有字幕
- **WHEN** 用户在已登录状态打开带 CC 字幕的 B 站视频并触发配音
- **THEN** 系统解析出 cue 列表并进入配音流程

#### Scenario: 未登录或视频无字幕
- **WHEN** 字幕列表为空
- **THEN** 系统提示「需要登录，且视频要有 UP 主字幕或 AI 字幕」，不得静默失败
