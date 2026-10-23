# speech-synthesis Specification

## Purpose
提供本地、可调语速的语音合成服务，供扩展按句调用，并把合成结果缓存以降低重复开销。服务只监听 127.0.0.1，不对外暴露。

## Requirements

### Requirement: 本地语音合成服务
系统 SHALL 提供本机 HTTP 服务，将文本合成为 mp3 音频。

#### Scenario: 合成一句话
- **WHEN** 扩展向 `/tts` POST `{text, voice, rate}`
- **THEN** 服务返回 `audio/mpeg`，并缓存该结果以便复用

### Requirement: 语速可调
系统 SHALL 接受 `rate` 参数（百分比），用于在合成阶段做时长对齐。

#### Scenario: 槽位紧张时加速
- **WHEN** 估算朗读时长超过字幕槽位
- **THEN** 合成请求携带正 rate，且被限制在允许区间内

### Requirement: 本地服务不可用时降级为系统语音
系统 SHALL 在本地 TTS 服务不可用时使用浏览器内置语音朗读字幕，而不是直接失败。

#### Scenario: 未启动 helper
- **WHEN** 用户在没有启动本地服务的情况下点击配音
- **THEN** 扩展切换为浏览器内置语音继续逐句朗读，并提示音质下降

#### Scenario: 本地服务可用
- **WHEN** helper 正常运行
- **THEN** 扩展使用本地服务合成，不启用系统语音

### Requirement: 降级路径保持时间轴推进
系统 SHALL 在降级模式下继续按字幕时间轴逐句朗读，并保持原声静音。

#### Scenario: 降级播放
- **WHEN** 处于系统语音模式且视频播放到下一句
- **THEN** 停止上一句朗读、按新句的槽位估算语速并朗读
