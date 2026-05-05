# Forge

> Multi-harness CLI 把 OpenSpec 的产物驱动工作流和 superpowers 的行为塑造 skill 体系融合到一起。AI 在 Claude Code / Codex 等 harness 里按统一规范工作。

```bash
pnpm dlx @accelerator-mzq/forge init --harness claude
# 或
pnpm dlx @accelerator-mzq/forge init --harness codex
```

## 它做什么

1. **把 12 个行为塑造 skill 装到 harness 里**:`brainstorming`(模糊需求时强制提问)、`test-driven-development`(red→green→refactor)、`subagent-driven-development`(派 fresh 子代理实施每个 task)、`verification-before-completion`(声称完成必附证据)等。
2. **把 6 个工作流命令铺到 harness**:`/forge:brainstorm` → `/forge:propose` → `/forge:apply` → `/forge:review` → `/forge:verify` → `/forge:archive` 串成产物化流水线。
3. **CLI 兜底**:`forge validate / archive` 验证产物完整性、严格门禁归档(verify+review marker hash 不对就拒绝)。
4. **专注 v0.1 = Claude Code + Codex**(OpenCode 推 v0.2,需要 plugin 实现自动注入)。

## 5 分钟跑通

详见 [`docs/getting-started.md`](docs/getting-started.md)。

```bash
# 1. 装 + 初始化
mkdir my-project && cd my-project
git init                                            # 强烈建议(非 git 项目下 review 标记不绑代码 diff)
pnpm dlx @accelerator-mzq/forge init --harness claude

# 2. 起 harness 会话,第一句话:
#    "我想做个 todo list 应用"
#    AI 自动触发 brainstorming,问问题、写 forge/drafts/<date>-todo-list.md

# 3. 你审完 draft,跑:
#    /forge:propose add-todo --from-draft 2026-05-05-todo-list
#    AI 调 writing-plans skill,产出 forge/changes/add-todo/{proposal,specs,design,tasks}.md

# 4. 跑 /forge:apply,AI 派子代理跑 TDD 实施每个 task
# 5. 跑 /forge:review,派 review 子代理 + 主代理处理反馈
# 6. 跑 /forge:verify,跑 forge validate + 写 .verify-passed
# 7. 跑 /forge:archive,严格校验 marker hash → mv 到 forge/changes/archive/
```

## CLI 命令

`forge init / update / config / validate / archive`。详见 [`docs/cli-reference.md`](docs/cli-reference.md)。

## Harness 安装

[Claude Code 与 Codex 的安装步骤、bootstrap 注入路径、调试技巧](docs/harness-setup.md)。

## 设计文档

- [2026-05-04 融合方案设计](docs/specs/2026-05-04-forge-fusion-design.md)(1273 行,21 条决策,完整架构 / 数据流 / 错误处理 / 测试策略 / 实施路线)
- [Plan 1-6 实施记录](docs/plans/)
- [Phase 0.5 spike 结果](spike/RESULTS.md):为什么 v0.1 = Claude Code + Codex 两 harness

## 状态

**v0.1 候选**:Phase 1+2+3+4+5+6 完成,自动化 skill eval 跑在 weekly + PR cadence,本地 5 命令全 0,**release gate 通过即可发版**。详见 [`CHANGELOG.md`](CHANGELOG.md)。

## 许可

MIT。复制了 superpowers 的 12 个 skill 文本(MIT 许可),attribution 见 [`LICENSE-THIRD-PARTY.md`](LICENSE-THIRD-PARTY.md)。

## 致谢

- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — 产物驱动工作流的设计灵感
- [superpowers](https://github.com/obra/superpowers) — 行为塑造 skill 体系的源头(skill 文本经 MIT 许可移植)
