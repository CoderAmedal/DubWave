# AGENTS.md

本项目采用 **OpenSpec** 的 spec-driven 流程：先写变更提案与规格，再写代码。

## 目录

```
openspec/
  config.yaml              工作流配置（spec-driven，产物用 zh-CN）
  specs/<capability>/      当前生效的能力规格（归档时自动合并）
  changes/                 进行中的变更
  changes/archive/         已完成并归档的变更（含 proposal / tasks / design）
```

## 工作流

1. **提案**：在 `openspec/changes/<change-id>/` 下写 `proposal.md`（Why / What Changes / Impact）
   与 `tasks.md`（可勾选清单），必要时补 `design.md`（Context / Decisions / Risks）。
2. **规格增量**：在 `openspec/changes/<change-id>/specs/<capability>/spec.md` 写
   `## ADDED Requirements`，每条需求用 `### Requirement:`，场景用 `#### Scenario:` + `- **WHEN** / - **THEN**`。
3. **实现**：按 `tasks.md` 实现并勾选，代码改动与需求一一对应。
4. **校验**：`openspec validate --all` 必须全绿。
5. **归档**：`openspec archive <change-id> -y`，规格自动合并进 `openspec/specs/`，
   变更移入 `changes/archive/<date>-<change-id>/`。

## 约定

- 需求句必须包含 **SHALL**（或 **MUST**），场景必须可执行、可验证。
- 一个变更只做一件事；跨能力的改动拆成多个 change。
- 代码与规格不一致时，先改规格再改代码。
- 提交信息遵循 Conventional Commits：`feat|fix|perf|docs|chore|refactor(scope): 摘要`。

## 常用命令

```bash
openspec list                 # 进行中的变更
openspec list --specs         # 当前能力与需求数
openspec validate --all       # 校验
openspec archive <id> -y      # 归档
```
