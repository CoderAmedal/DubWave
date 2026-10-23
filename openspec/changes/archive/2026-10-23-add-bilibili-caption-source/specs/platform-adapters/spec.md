## ADDED Requirements

### Requirement: 平台差异收敛到适配器
系统 SHALL 通过 `window.DubWaveAdapter` 暴露平台能力，核心流程不得直接依赖具体站点。

#### Scenario: 新增站点
- **WHEN** 需要支持新站点
- **THEN** 只需实现 `getTracks / getCues / playerBar / video / onNavigate / hideNativeCaptions` 六个方法，核心代码不改动
