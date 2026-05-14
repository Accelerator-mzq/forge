# Forge

[![CI](https://github.com/Accelerator-mzq/forge/actions/workflows/ci.yml/badge.svg)](https://github.com/Accelerator-mzq/forge/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@accelerator-mzq/forge.svg)](https://www.npmjs.com/package/@accelerator-mzq/forge)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **v1.1** 三 harness AI 工作流 plugin。融合 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 产物驱动工作流 + [superpowers](https://github.com/obra/superpowers) 行为塑造 skill,**外加 v1.0 反向加固协议(三级 severity / 三维 verify / 三级 fence / ack 两步)防 AI 在 spec 阶段偷懒**。

```bash
# Tier 1 — Claude Code(全功能,推荐)
/plugin marketplace add Accelerator-mzq/forge
/plugin install forge@accelerator-mzq-forge
```

OpenCode + Codex 见 [`docs/installation.md`](docs/installation.md)。

## TL;DR(5 分钟跑通)

```bash
# 1. 装 plugin(Tier 1 Claude Code)
mkdir my-todo-app && cd my-todo-app && git init && touch .gitignore
claude   # 启动 Claude Code 会话

# 在 Claude Code 会话里:
/plugin marketplace add Accelerator-mzq/forge
/plugin install forge@accelerator-mzq-forge
/exit && claude   # 重启,SessionStart hook 注入 skill + slash 命令
```

主流程 6 步(每步对应一个 marker 产出):

```
我想做个 todo list 应用              # →  forge/drafts/<date>-todo-list.md(brainstorm)
/forge:propose add-todo --from-draft <date>-todo-list
                                     # →  forge/changes/add-todo/{proposal,specs/,design,tasks}.md
/forge:apply                         # →  tasks.md 末尾 applied_commits YAML
/forge:review                        # →  forge/changes/add-todo/.review-passed
/forge:verify                        # →  forge/changes/add-todo/.verify-passed
/forge:archive                       # →  forge/changes/archive/<date>-add-todo/
```

完整端到端演练 + Bug fix 快速路径见 [`docs/getting-started.md`](docs/getting-started.md)(含 [Bug fix 快速路径](docs/getting-started.md#bug-fix-快速路径) C1/C2 决策表)。

## 核心交付 — v1.0+ 协议体系

forge 不只是把 superpowers skill 搬到三 harness。v1.0 **fusion completion** 加了 9 块反向加固协议(plan-9a..9j),防 AI 在 spec / verify / archive 三阶段偷懒。

### 1. 主流程 6 步 + 9 slash 命令

`/forge:brainstorm` → `/forge:propose` → `/forge:apply` → `/forge:review` → `/forge:verify` → `/forge:archive`。

横切命令:`/forge:explore`(非线性思考空间)、`/forge:ack-confirm`(WARNING 两步 ack)、`/forge:upgrade`(legacy 清理 + marker 重签)。

每步产强校验 marker,后续阶段读 marker 的 `tasks_hash` / `content_hash` / `git.diff_hash` 验证未漂移(`src/core/markers/types.ts`)。

### 2. 反向加固协议(forge 区别于上游的核心增量)

- **三级 severity + critical_candidate**:CRITICAL automated(测试 fail / hash mismatch / coverage_gap 等)**不可 ack 降级**,JCS SHA256 `finding_hash` 兜底重算拒签(`src/core/schemas/severity.ts`,plan-9a)
- **ack 两步协议**:WARNING 必须走 `forge ack propose` + `/forge:ack-confirm` 两步,AI 自 ack 不存在;archive fence 校验 `.ack-log.jsonl` 一致性(`src/cli/commands/ack.ts`)
- **三维 verify**:Completeness(spec 覆盖度 grep)+ Correctness(`file:line` 映射)+ Coherence(design 决策追溯),取代 v0.4 "测试 pass" 二值判定(`skills/verifying-three-dimensions/SKILL.md`,plan-9d)
- **三级 archive fence**:critical 硬墙(必修)/ warning ack(必两步确认)/ suggestion soft(聚合到 `archive_summary.handoff_to_backlog`)(`src/core/archive/three-level-fence.ts`,plan-9e1)

### 3. 横切协议(主流程外的工具)

- **Fluid Pause**:apply 中段 subagent 报告非 CRITICAL issue → 主代理弹四选项(扩 scope / 加 task / out-of-scope / Other)等用户决策;CRITICAL 仍走强 fence 拒签(`commands/apply.md` §"Fluid Pause Decision Point",plan-9c)
- **exploring**:`/forge:explore` 非线性思考空间,**禁止直接写 artifact**,只给 `file:section` 具体 capture offer 等用户明确确认(`skills/exploring/SKILL.md`,plan-9f)
- **process_evidence**:14 不变量 + worktree 重跑 + reporter parser;`forge evidence record-tdd/verify/review` + `freeze` 凝固到 marker(`skills/process-evidence/SKILL.md`,plan-9g)
- **Out-of-Scope / Future Work / Non-Goals YAML 块** + `forge scope scan-archived-followups` 跨 change backlog 聚合(plan-9b)

### 4. 实施纪律(plan-9h)

- **`forge preflight branch-check`**:防 main/master 分支误改(exit 2 + 要求 `--allow-protected-branch` 显式绕过)
- **Critical Plan Review**:主代理 dispatch subagent 前对 4 件套跑完整性/顺序/清晰度/scope 四维度检查,**不允许 vague pass-through**(`commands/apply.md:24-41`)
- **Main Agent STOP Triggers**:5 触发表防"绕过失败 task / 修改 task 描述让它能过 / 重试 ≥3 次不停下"(`.claude/skills/subagent-driven-development/SKILL.md`)

## 安装(三 harness)

| Harness         | 状态                                                                   | 入口                                                   |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| **Claude Code** | Tier 1 ENABLE(全功能 — skill auto-trigger + 9 slash 命令 + CLI helper) | [`docs/claude-install.md`](docs/claude-install.md)     |
| **OpenCode**    | Tier 2 PARTIAL_SHIP(skills + skill-driven CLI;commands 不支持)         | [`docs/opencode-install.md`](docs/opencode-install.md) |
| **Codex**       | Tier 3 PARTIAL_SHIP(同 OpenCode)                                       | [`docs/codex-install.md`](docs/codex-install.md)       |

总览 + 选哪个 tier 见 [`docs/installation.md`](docs/installation.md)。

## CLI 命令(13 个顶层子命令)

按业务分组,详见 [`docs/cli-reference.md`](docs/cli-reference.md):

**主流程**:`forge init`(v0.3 deprecated,v1.2 移除)/ `validate` / `archive`

**反向加固协议(v1.0+)**:`ack propose/confirm/reject`(plan-9a)/ `evidence record-tdd/verify/review` + `freeze`(plan-9g)/ `scope scan-archived-followups`(plan-9b)/ `finding hash`(plan-9d)/ `preflight branch-check`(plan-9h)

**迁移与升级**:`migrate openspec/superpowers`(v0.4)/ `legacy-bridge`(v0.2 brownfield)/ `upgrade` + `--resign-markers`(plan-9j marker 重签)

**杂项**:`config` / `update`

## 迁移与升级

**从已有项目搬过来**(v0.4+):

```bash
forge migrate openspec       # 默认 --regenerate(LLM 补缺件,估价 ≥ $5 需 ack)
forge migrate superpowers    # design+plan 配对成 forge change
```

加 `--no-regenerate` 跳过 LLM,失败件标 `[needs-fix]` 后续手补 / 重跑。详见 [`docs/migration/from-openspec.md`](docs/migration/from-openspec.md) + [`from-superpowers.md`](docs/migration/from-superpowers.md)。

**升级既有 forge 项目**(v0.x → v1.1):

```bash
forge upgrade                              # 5 阶段事务(SCAN→SHOW DIFF→ASK→STASH→VERIFY→COMMIT)
forge upgrade --recover                    # 24h 内还原
forge upgrade --resign-markers <changeId>  # plan-9j v1.0+ marker 重签(legacy 13 不变量精确豁免)
```

详见 [`docs/migration/v0.2-to-v0.3.md`](docs/migration/v0.2-to-v0.3.md);v0.3 → v1.1 路径待补单独文档。

## 状态 + 文档导航

**v1.1.0** released 2026-05-14(`CHANGELOG.md:11`):

- 本地 5 命令(`typecheck` / `lint` / `format:check` / `build` / `test`)全 0
- **1018 tests pass**(`CHANGELOG.md:17`)
- 自动化 skill eval(`pnpm eval`,`forge-eval/scenarios/` 双轨 baseline)
- 16 skill + 9 slash 命令 + 13 CLI 子命令

**v1.0 fusion completion** 经 Codex CLI(gpt-5.4-codex)累计 5+ 轮对抗性 review(跨 10 sub-plan)+ Opus subagent 多轮自检,共修 200+ 条问题;**v1.1 polish leftover** 经 Codex 七轮 review 累计 32 finding 全处置(0 严重 / 0 阻塞 / 0 Major)。

**文档导航**:

- [`docs/getting-started.md`](docs/getting-started.md) — v1.1 端到端工作流 + Bug fix 快速路径
- [`docs/cli-reference.md`](docs/cli-reference.md) — 13 CLI 子命令完整参数 + 退出码
- [`docs/installation.md`](docs/installation.md) — 三 harness 安装总览
- [`docs/migration/`](docs/migration/) — OpenSpec / superpowers 迁移 + 版本升级
- [`docs/specs/2026-05-10-v1.0-fusion-completion-design.md`](docs/specs/2026-05-10-v1.0-fusion-completion-design.md) — v1.0 fusion 21 决策权威 spec
- [`docs/plans/`](docs/plans/) — plan-9a..9j + plan-9z + plan-v1.1 累积 ~20 份 plan 文件

## 许可

MIT。复制了 superpowers 的 16 个 skill 文本(MIT 许可),attribution 见 [`LICENSE-THIRD-PARTY.md`](LICENSE-THIRD-PARTY.md)。

## 致谢

- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — 产物驱动工作流的设计灵感(`/opsx:propose` `/opsx:apply` `/opsx:verify` 等 12 个 workflow 协议直接借鉴)
- [superpowers](https://github.com/obra/superpowers) — 行为塑造 skill 体系的源头(16 skill 文本 + plugin 形态经 MIT 许可移植 + 命名空间 `superpowers:` → `forge:`)
