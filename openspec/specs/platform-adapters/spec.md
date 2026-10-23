# platform-adapters Specification

## Purpose
收敛站点差异，让核心流程只依赖统一的适配器接口，新增平台时无需改动翻译与播放逻辑。适配器负责字幕来源、播放器挂载点与原生字幕隐藏。

## Requirements

### Requirement: 平台差异收敛到适配器
系统 SHALL 通过 `window.DubWaveAdapter` 暴露平台能力，核心流程不得直接依赖具体站点。

#### Scenario: 新增站点
- **WHEN** 需要支持新站点
- **THEN** 只需实现 `getTracks / getCues / playerBar / video / onNavigate / hideNativeCaptions` 六个方法，核心代码不改动
