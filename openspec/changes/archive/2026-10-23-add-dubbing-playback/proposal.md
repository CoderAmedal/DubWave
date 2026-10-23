## Why
配音必须与画面同步，且不能因为网络抖动漏句或把尾音切断。
早期基于 `VTTCue.oncuechange` 的实现会出现事件合并，导致整句被跳过。

## What Changes
- 新增 `src/engine.js`：游标推进、预取、原声静音、时长对齐、淡入淡出、失败重试
- 播放推进改为 120ms 轮询 `currentTime`，不再依赖 cue 事件
- 单飞处理：一次只推进一句，避免乱序
- 合成前按槽位估算语速，合成后实测校正；播放端兜底提速/放慢视频

## Impact
- 影响能力：`dubbing-playback`
- 会临时修改 `video.playbackRate` 与 `muted`，停止时恢复
