# Forge

> OpenSpec 的产物驱动工作流 × superpowers 的行为塑造 skill 体系,融合成一个独立的 npm CLI + 多 harness 适配器。

**当前状态**:设计阶段(spec 已完成 5 轮 Codex 对抗审查)。实施未开始。

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

| Phase | 内容 | 时长 |
|---|---|---|
| 0 | 仓库脚手架 | 0.5 周 |
| 0.5 | 多 harness Bootstrap Spike(gating) | 0.5 周 |
| 1 | Core Engine 骨架 | 1.5 周 |
| 2 | CLI 命令 + Adapter 接口 | 1 周 |
| 3 | 三个 Adapter 实现 | 1.5 周 |
| 4 | 模板内容(12 skill + 6 命令) | 1 周 |
| 5 | Skill Eval 框架 | 1.5 周 |
| 6 | harness 集成 smoke + recover 命令 + 文档 | 0.5 周 |

## 许可

MIT License

## 致谢

- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — 产物驱动工作流的设计灵感
- [superpowers](https://github.com/obra/superpowers) — 行为塑造 skill 体系的源头(skill 文本经 MIT 许可移植)
