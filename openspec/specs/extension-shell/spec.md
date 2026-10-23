# extension-shell Specification

## Purpose
定义 MV3 扩展的加载方式、权限范围与图标资源构建流程，作为所有功能能力的承载外壳。它约束清单字段与构建产物，保证扩展在各站点都能正常注入。

## Requirements

### Requirement: 扩展以 MV3 形式加载
系统 SHALL 提供 `manifest_version: 3` 的扩展清单，声明 content script、service worker 与所需权限。

#### Scenario: 加载未打包扩展
- **WHEN** 在 `chrome://extensions` 中以「加载已解压的扩展程序」选择仓库根目录
- **THEN** 扩展成功载入，且扩展页不出现清单错误

### Requirement: 图标随构建生成
系统 SHALL 以 `icon/icon.svg` 为唯一源文件生成各尺寸 PNG。

#### Scenario: 重新生成图标
- **WHEN** 执行 `python3 tools/make_icons.py`
- **THEN** 生成 16/32/48/128/512 五档 PNG，且小尺寸经过裁边与提亮处理
