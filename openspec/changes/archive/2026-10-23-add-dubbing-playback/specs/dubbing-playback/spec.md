## ADDED Requirements

### Requirement: 逐句播放且不遗漏
系统 SHALL 保证每条字幕最多播放一次，且不会因事件合并而跳过整句。

#### Scenario: 连续播放
- **WHEN** 视频连续播放 90 秒
- **THEN** 播放序号连续递增，日志中不出现跳号

### Requirement: 音频长度与字幕槽位对齐
系统 SHALL 让每句配音落在其字幕槽位内，避免顶到下一句被截断。

#### Scenario: 译文明显偏长
- **WHEN** 合成音频时长为槽位的 1.8 倍
- **THEN** 系统先提高合成语速并重新合成；仍不足时配音提速至 ≤1.6x，必要时视频放慢至 ≥0.8x

#### Scenario: 上一句即将结束
- **WHEN** 下一句开始时上一句仅剩 ≤0.9 秒
- **THEN** 系统允许上一句自然收尾，不做硬切

### Requirement: 配音期间静音原声
系统 SHALL 在配音播放期间静音视频原声，并在停止时恢复用户原有音量与静音状态。

#### Scenario: 停止配音
- **WHEN** 用户点击停止
- **THEN** `video.muted` 与 `video.volume` 恢复到启动前的值
