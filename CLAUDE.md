# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 本文件与 `AGENTS.md` 内容保持同步 —— 改一处请同步另一处。

## 项目概述

Forge 是一个多 harness AI 工作流 plugin —— 融合 OpenSpec 的产物驱动工作流与 superpowers 的行为塑造 skill。v4(2026-05-21)起设计哲学是 **OpenSpec 简洁对齐**(v3.x「反向加固协议」已砍 —— 维护成本 > 收益,WARNING/suggestion 给用户自管,详 [`docs/migration/v3-to-v4.md`](docs/migration/v3-to-v4.md) + `CHANGELOG.md` v4 BREAKING)。它有双重分发形态:既作为 Claude Code plugin 分发,也作为 npm 包(`@accelerator-mzq/forge`,bin `forge`)提供 14 个 CLI 子命令。

## 常用命令

包管理器是 pnpm(Node ≥ 20.19.0 / pnpm ≥ 9,见 `.nvmrc`)。

| 任务            | 命令                                                             |
| --------------- | ---------------------------------------------------------------- |
| 构建            | `pnpm build`                                                     |
| 全量测试        | `pnpm test`                                                      |
| 单文件测试      | `pnpm vitest run tests/core/markers/<file>.test.ts`              |
| 按名跑测试      | `pnpm vitest run -t "<test name 子串>"`                          |
| watch 测试      | `pnpm test:watch`                                                |
| 类型检查        | `pnpm typecheck`(同时检 `tsconfig.json` 与 `tsconfig.test.json`) |
| lint            | `pnpm lint` / 自动修 `pnpm lint:fix`                             |
| 格式化          | `pnpm format` / 仅检查 `pnpm format:check`                       |
| skill 自动 eval | `pnpm eval`(全量)/ `pnpm eval:changed` / `pnpm eval:skill`       |

`skill eval` 需要 `.env` 里的 API key(见 `.env.example`)。

**CI(`.github/workflows/ci.yml`,ubuntu + windows 双平台)按序跑:lint → format:check → typecheck → build → test,任一步失败即短路。** 推 commit 前本地至少跑过这 5 步。

## 关键约束(非显而易见,改代码前必读)

### 1. 改 `skills/` 或 `commands/` 后必须 `pnpm build`

仓库根的 `skills/`、`skills/_shared/`、`commands/` 是 **source of truth**(plugin 直接读)。`pnpm build` 第一步 `scripts/copy-templates.mjs` 把它们**反向同步**到两处:

- `src/core/templates/` —— legacy `forge init` 路径读
- `dist/core/templates/` —— npm 包运行时读

改了任何 `skills/*/SKILL.md` 或 `commands/*.md` 却不跑 `pnpm build`,模板就会漂移,CI / 运行时拿到旧内容。**编辑完一定补一次 build。** 同步时还会给 legacy 模板的 frontmatter `name:` 加回 `forge:` 命名空间前缀(根 `skills/` 保持无前缀,plugin 命名空间隐含)。

### 2. `format:check` 是 CI 硬门槛

CI 第二步就是 `pnpm format:check`(prettier),失败即短路。push 前务必本地跑过 `pnpm format:check`。

### 3. release gate 走 release-gate.mjs

v4(2026-05-21)起 `pnpm test` 只跑 `vitest run`,不再后置 release-blocker `it.todo` 计数 reminder gate(`scripts/check-release-gate.mjs` + `tests/integration/release-blocker-attack-path.test.ts` 已随反加固协议一并删)。release 时机器纪律由 `pnpm release:gate`(`scripts/release-gate.mjs`,跑 7 步 typecheck/lint/format/build/vitest/pack/dry-install)统管,`prepublishOnly` hook 自动触发。

### 4. `dist/` 与 `dist-bundled/` 是构建产物

两者都被 gitignore,不要手改、不要提交。`src/core/templates/` 虽进 git,同样是 `copy-templates.mjs` 生成的 —— 真正要改的是仓库根 `skills/` 与 `commands/`。

## 架构大图

### 多 harness + 双分发形态

forge 同时是:(a) Claude Code plugin —— `.claude-plugin/`(`plugin.json` + `marketplace.json`)、`hooks/` 里的 SessionStart hook 注入 skill 与 slash 命令;(b) npm CLI 包 —— `bin: forge` → `dist/cli/index.js`。三 harness 分 tier:Claude Code 是 Tier 1 全功能,OpenCode / Codex 是 Tier 2/3(只有 skills + CLI,无 slash 命令)。

### 三层结构

- **`src/cli/`** —— CLI 入口 `index.ts` + `commands/` 下 14 个子命令(commander 注册;v4 删 `ack` / `evidence` / `pause-capture`)。
- **`src/core/`** —— 工作流协议核心(v4 反加固砍后整删 14 个 archive 子模块,详 CHANGELOG v4)。
- **`commands/` 与 `skills/`(仓库根)** —— plugin 形态的 9 个 slash 命令 `.md`(v4 删 `/forge:ack-confirm`)与 17 个 skill。**这是 plugin 的实际行为载体**,TS core 给 CLI helper 与验证逻辑撑腰。

### 主流程 6 步 + marker

工作流:`brainstorm → propose → apply → review → verify → archive`。verify / review 两步各产一个 marker(`src/core/markers/`,v2 极简 schema:`schema` / `verified_at` 或 `reviewed_at` / `verified_by` 或 `reviewed_by` / 可选 `pause_decisions` / 可选 `created_by_tool_version`)。v3.x 时代的 `tasks_hash` / `content_hash` / `git.diff_hash` 完整性校验链 v4 已砍,marker 退化为审计性质;verify/review 失败不写 failed marker,直接 abort 让 user 修复后重跑。**理解任一阶段都要同时看三处:`src/core/` 的逻辑、`commands/<stage>.md` 的协议、对应 `skills/*/SKILL.md` 的行为约束** —— 三者协同,单看一处不完整。

### v4 设计转向(从反向加固变 OpenSpec 对齐)

v3.x「反向加固协议」(13 fence、三级 severity、ack 两步协议、process-evidence freeze、ack-log 完整性链、`verify_findings` / `review_outcomes` marker 字段、transaction 五阶段 atomic、resign-markers 升级等)v4 整套砍掉(~5500 行净删,详 [CHANGELOG v4 BREAKING](CHANGELOG.md))。**当前 v4 留存的"协议骨架"**:

- **三维 verify**(`skills/verifying-three-dimensions/`):Completeness + Correctness + Coherence — 仍是 verify 阶段的行为约束 skill,但失败不再写 `.verify-failed` marker,直接 abort。
- **Fluid Pause**(`apply` 阶段):subagent 报 BLOCKED/DONE_WITH_CONCERNS/DESIGN_ISSUE_FOUND 时,主代理 `AskUserQuestion` 4 选项后写 `PauseDecisionSimple`(5 字段 + 自由 notes,无 fence 校验)进 marker `pause_decisions[]` —— 仅审计。
- **archive_summary v2 + spec deltas apply**(`src/core/archive/`):archive 阶段读 verify/review marker → 校验 v2 schema → apply `spec_updates_applied[]`(create/replace/delete operation)→ 写 `handoff_to_backlog[]`(来自 `pause_decisions` chosen_option=3 + 未解决 `scope_entries`)。沿 OpenSpec applyDeltas 风格,无 fence 拒签。
- **WARNING/suggestion 用户自管**:v3.x 的 ack 两步协议(`forge ack propose` + `/forge:ack-confirm`)消亡,WARNING/SUGGESTION 给 user 看 prose 自己判断;CRITICAL findings 仍存在(`forge validate` exit 1)但只走 `finding-hash` 幂等去重,不再有 ack 降级链。

### Stage Extensions(v1.2)

`src/core/stage-extensions/`(6 模块)+ `src/core/codex-review/` —— 在 5 个 stage 挂钩调外部工具(预置 codex review / adversarial)。CLI runner(`forge stage-extensions run`)永远 exit 0(loose,不阻塞主流程),多轮收敛由 AI 主代理驱动。`scripts/codex-review-helper.mjs` 是 harness-agnostic 的 codex 调用 helper。

### 测试

vitest;`tests/` 分 `cli/` `core/` `integration/` `migrate/` `scripts/` `forge-eval/`。`forge-eval/` 是独立的 skill 自动评测 harness(`pnpm eval`,`scenarios/` 双轨 baseline)。

## 分支与文档

- CI 跑 `main` 和 `dev`;日常开发在 `dev`。`forge preflight branch-check` 用来防 main/master 误改。
- 详尽文档在 `docs/`:`getting-started.md`(端到端流程)、`cli-reference.md`(16 子命令)、`stage-extensions.md`、`codex-review.md`、`docs/plans/`(plan-9a..9j 等设计 plan)、`docs/specs/`(权威 spec)。
- `CHANGELOG.md` 按 Keep a Changelog,版本号遵循 SemVer。
