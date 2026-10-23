## Context
`chrome.tts` 只在扩展页面与 Service Worker 中可用，content script 访问不到；
且该接口直接播放、不返回音频缓冲，无法复用现有的 Audio 元素与预取链路。

## Decisions
### 双后端而非统一抽象
本地 helper 返回音频缓冲，支持预取、淡入淡出与精确时长对齐；
系统语音只能“朗读”，因此只在降级时走另一条分支，避免为抽象牺牲主路径能力。

### 默认 tts，探测成功再切 audio
反过来会导致启动瞬间按 audio 模式预取，产生数条必然失败的请求。

### 通过 Service Worker 间接调用
content script 没有 `chrome.tts`，必须由后台代理；消息保持极简（只传文本、语言、语速）。

## Risks
- 系统语音无法控制精确结束时间，长句可能压到下一句
- 部分 Linux 环境没有语音引擎，此时只能提示不可用
