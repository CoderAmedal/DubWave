## Why
需要一个能在 Chrome 加载的 MV3 扩展骨架，作为字幕获取、翻译与配音能力的基础。
当前没有可运行的扩展入口，后续能力无从挂载。

## What Changes
- 新增 `manifest.json`：MV3、storage 权限、YouTube 与 Bilibili 的 host 权限、本地 TTS 地址
- 新增 `src/background.js`（service worker 占位）、`src/content.js`（content script 占位）
- 新增图标资源与 `tools/make_icons.py` 生成脚本

## Impact
- 影响能力：`extension-shell`
- 无破坏性变更；此时尚未接入任何站点逻辑
