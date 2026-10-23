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
