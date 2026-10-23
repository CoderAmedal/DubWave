## Why
扩展要在 Chrome Web Store 发布，需要可复现的打包产物、公开的隐私政策，
以及一份覆盖审核要点的上架说明。当前仓库只有开发态文件，缺交付物。

## What Changes
- 新增 `tools/package.sh`：生成只含运行文件的 zip，manifest 位于根目录
- 新增 `PRIVACY.md`：数据处理、权限用途、第三方调用说明
- 新增 `docs/PUBLISHING.md`：注册、物料、隐私问卷、审核风险与备选渠道

## Impact
- 影响能力：`distribution`
- 不改变扩展运行时行为；`helper` 仍作为本机配套服务单独分发
