# Forge

> OpenSpec 的产物驱动工作流 × superpowers 的行为塑造 skill 体系,融合成一个独立的 npm CLI + 多 harness 适配器。

**当前状态**:Phase 1+2+3 cut 完成(146 unit/integration tests passing)。**Phase 4(skill 文本移植)+ eval 框架待启动**(Plan 4 / Plan 5)。

## 设计文档

- [2026-05-04 融合方案设计](docs/specs/2026-05-04-forge-fusion-design.md) — 1273 行,21 条决策,涵盖架构、组件、数据流、错误处理、测试、实施路线

## 核心定位

- **OpenSpec 作主干**:产物结构(proposal/specs/design/tasks)+ 归档(`forge/changes/archive/`)+ 配置注入(`forge/config.yaml`)
- **superpowers 作武器库**:12 个 skill 移植(brainstorming / writing-plans / subagent-driven-development / TDD / code-review / verification-before-completion 等)
- **6 个 slash 命令流水线**:`/forge:brainstorm` → `/forge:propose` → `/forge:apply` → `/forge:review` → `/forge:verify` → `/forge:archive`
- **5 个公开 CLI 命令**:`forge init / update / config / validate / archive`(specs-sync 是内部模块,不公开)
- **目标 harness**:Claude Code、Codex、OpenCode(实际范围由 Phase 0.5 spike 决定)

## 实施路线

约 8 周(单人全职估算):

| Phase | 内容                                     | 时长   |
| ----- | ---------------------------------------- | ------ |
| 0     | 仓库脚手架                               | 0.5 周 |
| 0.5   | 多 harness Bootstrap Spike(gating)       | 0.5 周 |
| 1     | Core Engine 骨架                         | 1.5 周 |
| 2     | CLI 命令 + Adapter 接口                  | 1 周   |
| 3     | 三个 Adapter 实现                        | 1.5 周 |
| 4     | 模板内容(12 skill + 6 命令)              | 1 周   |
| 5     | Skill Eval 框架                          | 1.5 周 |
| 6     | harness 集成 smoke + recover 命令 + 文档 | 0.5 周 |

## Phase 0.5 Spike 结果

[查看 spike 结果与 v0.1 范围决策](spike/RESULTS.md)

**v0.1 实际范围**:Claude Code + Codex 2 harness(OpenCode 推 v0.2,需开发 plugin 实现自动注入)。

## Plan 2 进度

Phase 1(Core Engine)完成 — `src/core/` 下 8 个模块全部实现 + 单元测试覆盖:

- `schema/` — spec-driven schema 类型
- `parse/` — markdown / yaml / proposal / specs / design / tasks 解析器
- `validate/` — 各 artifact + marker schema 校验
- `hash/` — tasks / content / log / diff 4 种 hash 计算
- `artifact-graph/` — 依赖图(proposal → specs → design → tasks)
- `markers/` — verify/review marker YAML 类型 + 解析
- `specs-sync/` — deltas 应用(internal-only)
- `templates/` + `bootstrap/` — 占位,Plan 4 填实

Plan 3 接手:Phase 2(CLI 命令)+ Phase 3 cut(claude.ts + codex.ts adapter)。

## Plan 3 进度

Phase 2(CLI)+ Phase 3 cut(2 个 adapter)完成:

- 5 个公开 CLI 命令:`forge init/update/config/validate/archive`(其中 archive 含 `--force` 和 `--recover` 子模式)
- 2 个 adapter:`claude.ts`(`.claude/skills + .claude/commands`)、`codex.ts`(`.agents/skills` 共享 Claude Agent SDK 约定)
- archive 顺序原子化(Move→Sync 三阶段 + lock + recover)

Plan 4 接手:Phase 4(12 个 superpowers skill 真实内容 + 6 个 slash 命令模板)。

## 许可

MIT License

## 致谢

- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — 产物驱动工作流的设计灵感
- [superpowers](https://github.com/obra/superpowers) — 行为塑造 skill 体系的源头(skill 文本经 MIT 许可移植)
