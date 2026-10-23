## ADDED Requirements

### Requirement: 支持 Bilibili CC 字幕
系统 SHALL 通过 `x/player/v2` 获取字幕列表，并下载 `subtitle_url` 指向的字幕 JSON。

#### Scenario: 已登录且有字幕
- **WHEN** 用户在已登录状态打开带 CC 字幕的 B 站视频并触发配音
- **THEN** 系统解析出 cue 列表并进入配音流程

#### Scenario: 未登录或视频无字幕
- **WHEN** 字幕列表为空
- **THEN** 系统提示「需要登录，且视频要有 UP 主字幕或 AI 字幕」，不得静默失败
