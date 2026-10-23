## ADDED Requirements

### Requirement: 生成可直接上传的商店包
系统 SHALL 提供脚本生成 zip，且 `manifest.json` 位于压缩包根目录。

#### Scenario: 打包
- **WHEN** 执行 `bash tools/package.sh`
- **THEN** 在 `dist/` 下生成 `dubwave-<version>.zip`，包内只含 `manifest.json`、`src/`、`icon/`、`LICENSE`

#### Scenario: 排除开发资料
- **WHEN** 检查生成的 zip
- **THEN** 不包含 `docs/`、`helper/`、`openspec/`、`tools/`、`.hermes/`

### Requirement: 公开的隐私政策
系统 SHALL 在仓库内提供隐私政策，说明处理的数据类型、网络请求目标与权限用途。

#### Scenario: 填写商店隐私问卷
- **WHEN** 开发者填写 Chrome Web Store 的 Privacy practices
- **THEN** 可直接依据隐私政策中的表格声明「网站内容」与「用户活动」的处理方式，并给出公开 URL
