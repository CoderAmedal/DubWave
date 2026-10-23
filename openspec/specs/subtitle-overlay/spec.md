# subtitle-overlay Specification

## Purpose
在播放器画面上按用户选择呈现原文与译文，支持双语、仅译文、仅原文与关闭四种模式。叠加层独立于站点原生字幕，避免样式冲突。

## Requirements

### Requirement: 字幕呈现方式可配置
系统 SHALL 支持双语、仅译文、仅原文、不显示四种模式。

#### Scenario: 双语模式
- **WHEN** 用户选择「双语」
- **THEN** 原文显示在上一行（灰底），译文显示在下一行（深底）

#### Scenario: 切换模式立即生效
- **WHEN** 配音播放中修改字幕模式
- **THEN** 当前这句立即按新模式重绘，无需重启配音
