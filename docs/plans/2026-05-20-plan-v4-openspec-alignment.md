# Plan v4 — OpenSpec Alignment (BREAKING)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v4.0.0 砍掉 forge `archive` 阶段所有反向加固协议,与 OpenSpec `archive.ts` 设计哲学对齐。具体砍 5 类:hash 链 / 14 invariant fence / git CLI ancestry 校验 / 两步 ack 协议 / archive transaction 中断恢复。最终 forge `archive` 主入口从 1166 行降到 ~250 行,模块体系从 17 个 archive 子模块降到 3 个(summary-builder / summary-render / index)。

**Architecture:** 4 个 Phase 顺序实施。Phase 1 = 砍核心代码(src/core/archive/ 13 文件全删 + evidence.ts/ack.ts/pause-capture.ts/ack-log.ts/process-evidence-freeze-warnings.ts 全删 + 新简化版 archive.ts ~250 行)。Phase 2 = marker-schema.ts / markers/types.ts 简化(791+183 → ~100+60 行),顺手放宽 ISO 8601 正则允许 ms 精度(报告 V-1 修复保留)。Phase 3 = commands/*.md 大改 + 反加固 skill 群删除/改写 + archive emit monitor trace event(报告 3.1 修复)。Phase 4 = 测试 + fixture 清理 + v4.0.0 发布(CHANGELOG / tag / gh release / npm publish)。

**Tech Stack:** TypeScript(ESM,Node ≥ 20.19)、commander(CLI)、vitest(测试)、yaml、gray-matter。包管理 pnpm。

**权威决策证据:**
- 2026-05-20 user msc 通过 forge upstream session 选择 B1 严格模式("hash 链/不变量/git CLI/ack 协议/中断恢复 全砍,和 openspec 维度对齐")
- ForgeUE dogfood 报告 `D:\ClaudeProject\ForgeUE_claude\forge\changes\archive\2026-05-20-executor-async-rewrite\notes\workflow_analysis_report.md` 暴露 Arch-1 fence-9 double-marker cycle(协议循环依赖,5 种 workaround 全 fail)
- 对照 OpenSpec `src/core/archive.ts` 339 行实现,无 marker / 无 ack-log / 无 hash 链 / 无 fence / 无 git 校验,仍能正常 archive 闭环

---

## §1 Executive Summary

| 度量 | v3.1.1(当前) | v4.0.0(B1 后) | 倍数 |
|---|---|---|---|
| archive 主入口 行数 | 1166 | ~250 | 4.7× ↓ |
| archive 相关模块总行数 | 4818 | ~600 | 8× ↓ |
| archive 子模块数 | 17 | 3 | — |
| 中间 marker 数 | 2(.verify-passed + .review-passed,fence 强校验)| 2(同名,**仅作存在性 + 简化 schema 校验**)| 内容深度 ↓ |
| Hash 链种类 | 8(tasks_hash / content_hash / git.diff_hash / finding_hash JCS / ack_log_tail_hash / prev_entry_hash / payload_hash / staging_hash) | **0** | — |
| 校验不变量 | 14(fence-1 ~ fence-14)| **0** | — |
| git CLI 调用次数 | 8+ | **0** | — |
| Ack 协议步数 | 2(propose + confirm)| **0** | — |
| 中断恢复 / transaction | transaction.ts + recover.ts + recover-prompt.ts | **无** | — |
| Severity 等级 | 3(CRITICAL/WARNING/SUGGESTION)| **无** | — |

**砍后 forge 比 OpenSpec 仍然多的特性**(forge 真正差异化价值):
- `handoff_to_backlog`(跨 change 跟踪 Out of Scope / Future Work / Non-Goals)— forge 独有亮点
- `archive_summary.yaml`(简化版 audit trail)
- marker 存在性检查(`.verify-passed` + `.review-passed` 必须存在,**不 fence 内容**)
- 18 → ~13 个 skill(反加固相关删除后剩余的行为塑造价值)
- multi-harness(Codex/OpenCode 兼容)/ monitor / preflight / migrate / legacy-bridge / stage-extensions / backlog registry CLI

**砍后 forge 失去**:
- 防 AI 跳过 verify/review 直接 archive(除存在性外无任何 fence)
- 防 AI 篡改 tasks.md `[x]` 标记(tasks_hash 砍)
- 防 AI 在 verify 后 commit 新代码混入 archive(git.diff_hash 砍)
- 防 AI 写假 TDD red→green commit chain(invariant-1/2/14 砍)
- 防 AI 自 ack WARNING(两步 ack 砍)
- 防 Fluid Pause option=1/2/3 marker 字段伪造(pause_decisions fence 砍)
- 防 AI 整体替换 ack-log 文件(ack-log 整体砍)

**砍后用户必须自管**:git diff review、tasks.md 勾选审核、commit history 审核 — 这是 OpenSpec 早就是的模式。

---

## §2 Design Philosophy Shift

| 维度 | v3.x(反向加固协议)| v4.0(OpenSpec 对齐)|
|---|---|---|
| 对 AI 信任度 | 极低 — "防 AI 偷懒" 是第一目标 | 中高 — 信任 AI + 用户 review |
| 防御层 | 8 hash + 14 invariant + 2 marker fence + ack-log chain + 两步 ack | 仅 spec schema validate + marker 存在性 |
| 复杂度成本 | 高 — fence 链耦合产生 Arch-1 cycle 等架构 bug | 低 — 各组件独立 |
| 用户摩擦 | 高 — 用户撞 R-1/V-1/Arch-1/V-2 等多重坑 | 低 — 接近 OpenSpec 原生体验 |
| 设计哲学 | "Trust nothing, verify everything cryptographically" | "Fluid not rigid, iterative not waterfall"(OpenSpec README 字面)|

---

## §3 Mode Selection — B1 strict alignment

**B1 = 严格按字面砍**:hash 链 / 不变量 / git CLI / ack 协议 / 中断恢复 5 项全部 → 0。不留任何反加固"甜区"(不留 tasks_hash + content_hash 比对)。

**B1 vs B2 选择记录**:
- B1(严格)：archive 100% 对齐 OpenSpec,无任何 hash 防护
- B2(留 tasks_hash + content_hash 单点 invariant)：~30 行成本,防 verify 后产物篡改 — 用户拒绝,选 B1

**决策时间**: 2026-05-20  
**决策人**: msc  
**理由**: 用户拒绝任何形式的 hash chain / invariant,要求完全对齐 OpenSpec

---

## §4 当前 vs B1 完整对比表

### §4.1 archive 主流程逐步对比

| 步骤 | v3.1.1 当前 | v4.0 B1 | OpenSpec 对照 |
|---|---|---|---|
| 1. 找/确认 changeName | 同 OpenSpec(interactive select)| 同 | ✅ 同 |
| 2. validate proposal.md | validate(non-blocking)| 同 | ✅ 同 |
| 3. validate change/specs/ deltas | 严格 spec 段名 + delta 语法 | 同 | ✅ 同(forge 段名更严)|
| 4. 检查 .verify-passed + .review-passed | 存在性 + schema + tasks_hash + content_hash + git.diff_hash + ack_log_entry_count + ack_log_tail_hash + process_evidence + pause_decisions + verify_findings 14 invariant fence | **仅存在性 + schema 必填字段**(verified_at/reviewed_at/verified_by) | **forge 独有,但极简** |
| 5. legacy-exemption fence | 兼容老 marker | **删** | OpenSpec 无 |
| 6. version-retrograde fence | 防工具版本回退 | **删** | OpenSpec 无 |
| 7. validatePauseDecisionsFence | 5 option 业务校验 | **删** | OpenSpec 无 |
| 8. validateAckLogConsistency | ack-log ↔ marker ack 4 条规则 | **删** | OpenSpec 无 |
| 9. validateThreeLevelFence | critical/warning/suggestion 三级桶 | **删** | OpenSpec 无 |
| 10. validateVerifyFindingsFence | verify_findings 字段 fence | **删** | OpenSpec 无 |
| 11. crossCuttingFenceCheck (14 invariant) | git ancestry / red→green 时序 / projection hash 等 | **删** | OpenSpec 无 |
| 12. archiveTransaction(lock + 阶段 rename + Sync + summary)| transaction.ts(211)+ lock.ts(131)+ recover.ts(280) | **删** — 改 simple `fs.rename` + spec deltas | OpenSpec 同 |
| 13. specs-sync apply deltas | `src/core/specs-sync/apply.ts` | 同 — 保留 | OpenSpec `specs-apply.ts` 对照 |
| 14. archive_summary.yaml 生成 | summary-builder.ts(351 行)+ render | 简化 — `archived_at` + `applied_commits` + `handoff_to_backlog` + `spec_updates_applied` | OpenSpec 无 audit summary,**forge 保留**(简化)|
| 15. 写 archive HEAD marker | git tag-like marker 写入 | **删** | OpenSpec 无 |
| 16. recover-prompt 中断恢复 | recover-prompt.ts | **删** | OpenSpec 无 |
| 17. monitor trace emit | 仅靠 maybeRecordCliExit | 新增 1 行 `appendTraceEvent`(顺手修报告 3.1)| OpenSpec 无 |

### §4.2 Marker 字段对比

| 字段 | v3.1.1 .verify-passed | v4.0 .verify-passed | 用途 |
|---|---|---|---|
| `schema` | `forge-verify/v1` | `forge-verify/v2`(BREAKING)| 区分新版 |
| `verified_at` | ISO 8601 严格秒(V-1 bug)| ISO 8601 允许 ms(V-1 修)| 时间戳 |
| `verified_by` | string | string | 谁跑的 verify |
| `tasks_hash` | SHA256 of tasks.md | **删** | 防篡改 |
| `content_hash` | SHA256 of specs/+design+proposal | **删** | 防篡改 |
| `git.head` + `git.diff_hash` | git refs + diff hash | **删** | 防绕过 |
| `process_evidence`(整段)| 复杂结构 — staging 4 数组 | **删** | 防 AI 伪造 verify 调用 |
| `process_evidence_staging_hash` | staging hash 快照 | **删** | 同上 |
| `ack_log_tail_hash` + `ack_log_entry_count` | ack-log 链固化 | **删** | 防替换 ack-log |
| `verify_findings`(WARNING 阵列)| 复杂结构 + ack 字段 | **删** | 三级 severity |
| `pause_decisions` | 5 字段 + option 业务校验 | **保留**(简化为 `{paused_at, task_ref, issue_summary, chosen_option, notes}` 自由 prose,不 fence)| Fluid Pause 软记录 |
| `created_by_tool_version` | `FORGE_VERSION` 写入(v3.1.1 已动态读 package.json)| 保留 | 工具版本追溯 |

`.review-passed` 同步简化(`reviewed_at` / `reviewed_by` / 删 hash 链 / 删 process_evidence / 删 ack-log / 保留简版 pause_decisions)。

---

## §5 Architecture — 完整删/留/新清单

### §5.1 删除清单(文件级 + 行数)

| 路径 | 行数 | 理由 |
|---|---|---|
| `src/core/archive/fence.ts` | 276 | crossCuttingFenceCheck 入口 |
| `src/core/archive/process-evidence-fence.ts` | 596 | 14 invariant fence 体系 |
| `src/core/archive/process-evidence-rerun.ts` | 261 | invariant 5/6/13 worktree 重跑 |
| `src/core/archive/pause-decisions-fence.ts` | 678 | 5 option 业务校验 |
| `src/core/archive/ack-log-consistency.ts` | 211 | marker ack ↔ ack-log 4 条规则 |
| `src/core/archive/verify-findings-fence.ts` | 98 | verify_findings 字段 fence |
| `src/core/archive/three-level-fence.ts` | 127 | critical/warning/suggestion 三级桶 |
| `src/core/archive/legacy-exemption.ts` | 108 | 老 marker 兼容(v4 重置版本号,无需) |
| `src/core/archive/version-retrograde-fence.ts` | 110 | 工具版本回退防护 |
| `src/core/archive/transaction.ts` | 211 | 阶段化 rename + Sync + summary,B1 改 simple fs.rename |
| `src/core/archive/recover.ts` | 280 | 中断恢复 |
| `src/core/archive/recover-prompt.ts` | 34 | 中断恢复 prompt |
| `src/core/archive/lock.ts` | 131 | archive lock(简化版用 mkdir EEXIST 即可)|
| `src/core/archive/resume-summary.ts` | 94 | recover 配套 |
| **archive 子模块小计** | **3215** | 13/17 个删,留 summary-builder/render/index |
| `src/cli/commands/evidence.ts` | 842 | record-tdd/verify/review + freeze CLI 整删 |
| `src/cli/commands/ack.ts` | 399 | 两步 ack CLI 整删 |
| `src/cli/commands/pause-capture.ts` | 107 | pause-capture CLI 整删 |
| `src/core/ack-log.ts` | 307 | ack-log JSONL chain 整删 |
| `src/core/process-evidence-freeze-warnings.ts` | 215 | freeze WARNING 计算 |
| `src/core/staging-lock.ts` | ~50 | staging.yaml 锁 |
| `src/core/schemas/process-evidence.ts` | ~50 | process_evidence schema |
| `src/core/validate/marker-integrity.ts` | ~80 | marker integrity 校验(hash 链) |
| `src/core/ack/marker-ack.ts` | ~200 | **v2 新增删除项**(Codex F-1.2)— forge ack confirm 写 marker ack 字段,反加固模块残留 |
| **CLI / helpers / schemas 小计** | **~2230** | — |
| **删除总计** | **~5445** | — |

**v2 修订:不删项**(原 plan 误列删):
- `src/core/validate/finding-hash.ts`(~60)— **保留**:Codex F-1.1 确证 13 处依赖(`validate/index.ts:9` / `validate/scope-entries.ts:161` / `finding.ts:17` / `validate/change.ts` / `validate/auto-findings.ts` / `schemas/severity.ts` / `validate/marker-schema.ts` / `validate/types.ts` / `_shared/tier23-command-bridge.md:34` 等)。multi-harness Tier 2/3 bridge 调 `forge finding hash`(F-6.2),scope-entries fingerprint / candidate validators 都用 — **属 spec layer 工具,不是 archive fence 工具**。
- `src/core/canonical-json.ts`(~30)— **保留**:finding-hash 依赖它(JCS canonicalize)。仅删 archive fence 路径上的 canonicalHash 引用,wrapper 本身留。

**v2 修订:新增重写项**(原 plan 漏)— Codex F-1.3:
- `src/core/schemas/archive-summary.ts` 从 `forge-archive-summary/v1` 升 `v2`,删 `process_evidence_summary` 字段 + `acked_warnings` + `pending_suggestions` 反加固字段;保留 `archived_at` / `change_id` / `applied_commits` / `handoff_to_backlog` / `spec_updates_applied`。
- `src/core/validate/archive-summary-schema.ts` 同步重写,删 `process_evidence_summary` 必填校验,简化为 v2 schema validate。

### §5.2 保留清单(forge 真正价值)

| 路径 | 行数 | 理由 |
|---|---|---|
| `src/cli/commands/validate.ts` | — | 4 件套 spec validate(同 OpenSpec)|
| `src/cli/commands/backlog.ts` | — | backlog registry CLI(forge 独有亮点)|
| `src/cli/commands/scope.ts` | — | scope-entries aggregator(forge 独有亮点)|
| `src/cli/commands/config.ts` | — | forge config 管理 |
| `src/cli/commands/init.ts` | — | forge init scaffold |
| `src/cli/commands/update.ts` | — | forge update |
| `src/cli/commands/upgrade.ts` | — | forge upgrade(v0.2 → v0.3 等 legacy) |
| `src/cli/commands/migrate.ts` | — | OpenSpec/superpowers 项目搬运 |
| `src/cli/commands/legacy-bridge.ts` | — | brownfield onboarding |
| `src/cli/commands/preflight.ts` | — | main/master 分支保护 |
| `src/cli/commands/stage-extensions.ts` | — | codex review hook |
| `src/cli/commands/monitor.ts` | — | trace monitor |
| `src/cli/commands/finding.ts` | — | **保留**(Codex F-6.2)— multi-harness Tier 2/3 bridge `skills/_shared/tier23-command-bridge.md:34` 显式调 `node run-forge.mjs finding hash`,删之破坏 multi-harness 价值承诺 |
| `src/core/archive/summary-builder.ts` | 351 → ~80 | 简化版 — 仅生成 archived_at/applied_commits/handoff_to_backlog |
| `src/core/archive/summary-render.ts` | 81 | render summary 给用户看,保留 |
| `src/core/archive/index.ts` | 5 | 模块 entry |
| `src/core/specs-sync/` 全套 | — | spec deltas 应用,等同 OpenSpec specs-apply.ts |
| `src/core/parse/` 全套 | — | proposal/specs/tasks/design 解析 |
| `src/core/validate/{change,proposal,specs,tasks,archive-summary-schema,scope-entries,coverage-gap,orphan-tmp,types}.ts` | — | spec layer validate(保留)|
| `src/core/markers/{parse,index}.ts` | — | marker 解析(types.ts 简化)|
| `src/core/backlog/` | — | backlog registry implementation |
| `src/core/monitor/` 全套 | — | monitor trace 系统(独立) |
| `src/core/migrate/` 全套 | — | 项目搬运 |
| `src/core/legacy-bridge/` 全套 | — | brownfield |
| `src/core/stage-extensions/` 全套 | — | codex review hook |
| `src/core/preflight/` | — | branch-check |
| `src/core/hash/` | — | 评估:若仅 archive fence 用则删;若 specs-sync 也用则留 |
| `src/core/canonical-json.ts` | — | 评估:backlog registry 是否依赖? |

### §5.3 新增清单

| 新增 | 内容 | 行数 |
|---|---|---|
| `src/cli/commands/archive.ts` 重写 | 简化版主流程 — check markers → validate → confirm progress → apply deltas → mv → emit monitor trace + 写 archive_summary.yaml | ~250 |
| `src/core/markers/types.ts` 重写 | 简化版 marker interface(仅 schema + verified_at + verified_by + pause_decisions 字段)| ~60 |
| `src/core/validate/marker-schema.ts` 重写 | 简化版 schema(仅必填字段 + ISO 8601 允许 ms)| ~100 |
| `docs/migration/v3-to-v4.md` 新建 | v3.x → v4.0 用户迁移指南 | ~200 |
| `CHANGELOG.md [4.0.0]` 段 | BREAKING change 详尽描述 | ~80 |

### §5.4 Commands(.md)改写要点

| 文件 | 当前行数(估)| 改写要点 | 改后行数(估)|
|---|---|---|---|
| `commands/archive.md` | ~200 | 删 14 fence 描述 / 删 ack-log fence / 删 process_evidence 协议;改为简单 "validate → confirm progress → apply specs → mv → done" | ~80 |
| `commands/verify.md` | ~300 | 删 record-verify + freeze --kind verify 调用;改为简单"写 .verify-passed marker(verified_at + verified_by + pause_decisions 数组)";三维 verify skill 行为保留(但不写复杂 marker 字段) | ~120 |
| `commands/review.md` | ~250 | 同 verify.md;删 record-review + freeze --kind review;改为简单写 .review-passed marker | ~100 |
| `commands/apply.md` | ~230 | **保留 Fluid Pause skill 行为**(AskUserQuestion 4 选项);删 pause-capture CLI 调用 + pause_decisions 复杂字段写入 + capture_id;改为简单 prose 写 marker pause_decisions 数组(自由字段无 fence)| ~150 |
| `commands/ack-confirm.md` | ~150 | **整删**(两步 ack 协议消亡)| 0 |
| `commands/brainstorm.md` | ~100 | 不变(无 fence)| ~100 |
| `commands/propose.md` | ~120 | 不变(spec validate 路径保留)| ~120 |
| `commands/explore.md` | ~80 | 不变 | ~80 |
| `commands/upgrade.md` | ~50 | 不变 | ~50 |
| `commands/codex-adversarial.md` | ~95 | 不变(独立 codex review hook)| ~95 |

### §5.5 Skills 删/改清单

| skill | 当前 | v4 命运 |
|---|---|---|
| `brainstorming` | OpenSpec 上游 | **保留** |
| `exploring` | OpenSpec 上游 | **保留**(只移除 What Changes → What 残留,已在 v3.1.1 修)|
| `writing-plans` | OpenSpec 上游 | **保留**(scale-aware mode 不变)|
| `writing-skills` | OpenSpec 上游 | **保留** |
| `test-driven-development` | OpenSpec 上游 | **保留**(TDD red→green 行为是好习惯,只是不再 fence 校验)|
| `subagent-driven-development` | OpenSpec 上游 + forge 加固 | **保留 + 删反加固段**(删 process-evidence record-tdd 强制调用要求)|
| `dispatching-parallel-agents` | OpenSpec 上游 | **保留** |
| `using-git-worktrees` | OpenSpec 上游 | **保留** |
| `systematic-debugging` | OpenSpec 上游 | **保留** |
| `verification-before-completion` | OpenSpec 上游 + forge 加固 | **保留 + 删反加固段**(删 evidence helper / 三级 fence claim)|
| `finishing-a-development-branch` | OpenSpec 上游 | **保留** |
| `receiving-code-review` | OpenSpec 上游 + forge 加固 | **保留 + 简化**(删 review marker 复杂字段写入要求)|
| `requesting-code-review` | OpenSpec 上游 + forge 加固 | **保留 + 简化**(同上)|
| `using-forge` | forge 元 skill | **保留 + 重写**(更新对齐 v4 协议)|
| **`process-evidence`** | forge 反加固独有 | **整删** |
| **`verifying-three-dimensions`** | forge 反加固独有(但行为价值独立)| **v2 修订:保留 + 简化**(Codex F-6.1 暴露原 plan §5.5/§8.2 内部矛盾)— 三维 verify(Completeness/Correctness/Coherence)是有价值的 prose check 行为,与反加固协议正交。改写为"仅 prose check 不写 marker.verify_findings"。**与 §8.2 一致** |
| **`verifying-process-evidence`** | forge 反加固独有 | **整删**(如存在;若已合并到 verifying-three-dimensions 同删)|
| **`subagent-driven-discipline`** | forge 反加固独有(但 taxonomy/model-tier 价值独立) | **v3 修订(Codex v2 F-6.1):保留 + 简化**。原 plan §5.5 整删,但 `skills/_shared/tier23-command-bridge.md:27` 显式引用 `skills/subagent-driven-discipline/references/codex-tools.md` + `skills/subagent-driven-development/SKILL.md:35-37` 强制 invoke 此 skill 取 task-type taxonomy / model-tier 映射 / cross-verify 五类协议。整删破坏 Tier 2/3 + dispatch-discipline 调用链。改为:删 marker 字段挂钩段(verify_findings cross-check / staging.yaml record-tdd 强制)+ 留 §1 task-type taxonomy + §2 model-tier 映射 + §3.2 cross-verify(改成"reviewer 报 file:line evidence"不再 hash 链)+ §3.3 inline-fix vs round-2 decision tree |
| `legacy-bridge-fulfillment` | forge 独有 | **保留**(brownfield 不依赖 fence)|

净:保留 13,删 4-5,改 5-6。

---

## §6 简化版 archive.ts 完整设计

### §6.1 主流程伪代码

> **v7 修订(Codex v6 F-R6-1)— 实现模式注意**:下方伪代码用 `class ArchiveCommand` 风格仅为可读性,**真实实现必须用 forge 现有 `buildArchiveCommand(): Command` 工厂模式**(沿 `src/cli/index.ts:10/46` 注册契约)。把 `execute` 主体改写到 commander `.action(async (...) => { ... })` 内即可,`selectChange / getArchiveDate / moveDirectory / renderDeltasSummary` 是文件内 module-level 普通 helper(非 class method)。

```typescript
// src/cli/commands/archive.ts v4 草案(沿 OpenSpec archive.ts 风格;真实导出见上方 disclaimer)

export class ArchiveCommand {
  async execute(changeId?: string, options: ArchiveOptions = {}): Promise<void> {
    const targetPath = '.';
    const changesDir = path.join(targetPath, 'forge', 'changes');
    const archiveDir = path.join(changesDir, 'archive');
    const mainSpecsDir = path.join(targetPath, 'forge', 'specs');

    // 1. 找 changes 目录;若 changeId 缺则 interactive select
    if (!await exists(changesDir)) {
      throw new Error("No forge changes directory. Run 'forge init' first.");
    }
    if (!changeId) {
      changeId = await this.selectChange(changesDir);
      if (!changeId) return;
    }
    const changeDir = path.join(changesDir, changeId);
    if (!await isDirectory(changeDir)) {
      throw new Error(`Change '${changeId}' not found.`);
    }

    // 2. Legacy-bridge preflight(Codex F-2.1 — brownfield 同步检查,非反加固)
    // forge-repo 现有 archive.ts:271/765 调 runArchivePreflight,真签名是
    // (forgeRoot, changeId, opts) — v3 修订(Codex v2 F-2.1)
    // 检查 kind !== 'ok' 退出(halted-for-fulfillment / critical-pending gate)
    const preflightResult = await runArchivePreflight(forgeRoot, changeId, {
      apiMode: options.api ?? false,
      runner: undefined, // 默认非 --api 模式,runner 由 preflight 内部 default
    });
    if (preflightResult.kind !== 'ok') {
      console.error(`✗ legacy-bridge preflight 拒签:${preflightResult.kind}`);
      return;
    }

    // 3. Spec validate(blocking) + proposal validate(non-blocking)
    // v9 修订(Codex v8 F-R8-1):删 options.noValidate 分支,archive 永远 validate。
    // 沿 B1 严格精神 — spec layer validate 不是反加固 fence,删 --no-validate flag
    // 让 plan v8 §9.4 CLI flag 表完整闭合(无 undocumented option)
    const result = await validateChange(changeDir);
    if (!result.valid) {
      printValidationErrors(result);
      return;
    }

    // 3. Marker 存在性 check + schema validate
    const verifyPath = path.join(changeDir, '.verify-passed');
    const reviewPath = path.join(changeDir, '.review-passed');
    if (!await exists(verifyPath)) {
      throw new Error(`Missing .verify-passed in ${changeDir}. Run /forge:verify first.`);
    }
    if (!await exists(reviewPath)) {
      throw new Error(`Missing .review-passed in ${changeDir}. Run /forge:review first.`);
    }
    const verifyMarker = parseYaml(await readFile(verifyPath));
    const reviewMarker = parseYaml(await readFile(reviewPath));
    const verifyValid = validateMarkerSchema(verifyMarker, 'verify');
    const reviewValid = validateMarkerSchema(reviewMarker, 'review');
    if (!verifyValid.valid || !reviewValid.valid) {
      printValidationErrors([verifyValid, reviewValid]);
      return;
    }

    // 4. Task progress 显示 + 未完成 confirm(沿 OpenSpec)
    const progress = await getTaskProgressForChange(changesDir, changeId);
    if (progress.incomplete > 0 && !options.yes) {
      const proceed = await confirm({ 
        message: `${progress.incomplete} incomplete task(s). Continue?`, 
        default: false 
      });
      if (!proceed) return;
    }

    // 5. Spec deltas 应用 — v5 修订(Codex v4 F-R4-1/F-R4-2):放弃移植 OpenSpec specs-apply,
    // 用 forge 现有 readDeltas + applyDeltas(整文件 create/replace,与 forge `## Scenario:` grammar 兼容)。
    // OpenSpec specs-apply 用 delta grammar(## ADDED/MODIFIED Requirements),与 forge GWT grammar
    // 不兼容,即使移植也产生 forge validate 拒收的 spec。Path B 是唯一可行(详 §6.5)。
    let deltas: SpecDelta[] = [];
    if (!options.skipSpecs) {
      const changeSpecsDir = path.join(changeDir, 'specs');
      deltas = await readDeltas(changeSpecsDir, mainSpecsDir);
      if (deltas.length > 0) {
        // 显示 deltas 给用户 + interactive confirm(同 OpenSpec archive.ts 询问模式)
        // v6 修订(Codex v5 F-R5-2):renderDeltasSummary 是 archive.ts 内新增 local helper(~10 行),
        // 不在 specs-sync/ 新增 — Path B "无新增代码"仅指 specs-sync/ 不变,archive.ts 仍需此 helper
        console.log(renderDeltasSummary(deltas));
        if (!options.yes) {
          const proceed = await confirm({ message: 'Apply spec deltas?', default: true });
          if (!proceed) {
            console.log('Skipping spec deltas. Continuing with archive.');
            deltas = [];
          }
        }
        if (deltas.length > 0) {
          await applyDeltas(mainSpecsDir, deltas);
        }
      }
    }

    // 6. mv change → archive/YYYY-MM-DD-changeId(沿 OpenSpec moveDirectory 含 Windows EPERM/EXDEV fallback)
    // v4 修订(Codex v3 F-R3-2):archiveDate 只算一次,后续 archiveName + posthook 共用同一变量,
    // 防跨午夜 archive 时 archiveName 用 day N、posthook 拿 day N+1 不一致(沿 archive.ts:859 I-2 注释)
    const archiveDate = getArchiveDate();
    const archiveName = `${archiveDate}-${changeId}`;
    const archivePath = path.join(archiveDir, archiveName);
    if (await exists(archivePath)) {
      throw new Error(`Archive '${archiveName}' already exists.`);
    }
    await fs.mkdir(archiveDir, { recursive: true });
    await moveDirectory(changeDir, archivePath);

    // 7. 写简化 archive_summary.yaml(forge 独有亮点 — handoff_to_backlog)
    // v7 修订(Codex v6 F-R6-2):函数名保留 forge 现有 `buildArchiveSummary`(summary-builder.ts:52),
    // 不改名为 buildSimplifiedSummary。signature:({ archivePath, changeId, verifyMarker, reviewMarker, deltas })
    const summary = await buildArchiveSummary({
      archivePath,
      changeId,
      verifyMarker,
      reviewMarker,
      deltas,
    });
    await writeFile(path.join(archivePath, 'archive_summary.yaml'), stringify(summary));

    // 8. Legacy-bridge posthook(Codex F-2.1 — brownfield 同步检查 post 路径)
    // forge-repo 现有 archive.ts:654/861 调 runArchivePostHook,真签名是
    // (forgeRoot, changeId, opts: { archiveDate, api }) — v3 修订(Codex v2 F-2.2)
    // v4 修订(Codex v3 F-R3-2):archiveDate 透传 Step 6 算的同一变量,不再调 getArchiveDate()
    await runArchivePostHook(forgeRoot, changeId, {
      archiveDate, // = Step 6 already-computed,跨午夜也保持一致
      api: options.api ?? false,
    });

    // 9. archive 后自动重生成 backlog(Codex F-2.2 + F-6.3 — forge 差异化价值,自动一致)
    // forge-repo 现有 archive.ts:666 调 generateBacklog;archive 主流程成功后必跑,
    // 失败仅 warn 不回滚 archive(backlog 是衍生产物)
    try {
      const bl = await generateBacklog(forgeRoot);
      console.log(`Backlog: forge/backlog/active.md (${bl.openCount} open, ${bl.warningCount} warnings)`);
    } catch (e) {
      console.warn(`⚠ backlog 重生成失败(不影响 archive):${(e as Error).message} —— 可手动跑 \`forge backlog\``);
    }

    // 10. 顺手 emit monitor trace event(报告 3.1 修复)
    appendTraceEvent(targetPath, {
      ts: new Date().toISOString(),
      schema: 'forge-monitor-trace/v1',
      change_id: changeId,
      stage: 'archive',
      layer: 'cli',
      event: 'change_archived',
      data: { archive_name: archiveName, spec_updates: updates?.length ?? 0 },
    });

    console.log(`Change '${changeId}' archived as '${archiveName}'.`);
  }
}
```

**总行数估算**:~280 行(含 import / helper / inquirer 交互 + legacy-bridge preflight/posthook + generateBacklog)。

**v2 修订说明(Codex F-2.3 + F-5.1)**:删 transaction.ts 后,spec sync 第 5 步(`buildUpdatedSpec → writeUpdatedSpec`)部分失败时**无原子回滚** — 已写的 spec 文件保留半边状态。**已知接受 risk**,沿 OpenSpec 风格(`archive.ts:225-262` 也是这样的"部分失败重跑"模式)。用户撞到时手动 git checkout 受影响 specs 即可。

### §6.2 Marker schema 简化(`src/core/markers/types.ts` v4)

```typescript
/** v4 verify marker — 极简 */
export interface VerifyMarker {
  schema: 'forge-verify/v2';                       // BREAKING bump
  verified_at: string;                              // ISO 8601 允许 ms (V-1 修)
  verified_by: string;                              // 'ai-agent' | username
  pause_decisions?: PauseDecisionSimple[];          // 软记录,无 fence
  created_by_tool_version?: string;                 // FORGE_VERSION 写入
}

/** v4 review marker — 极简,镜像 verify */
export interface ReviewMarker {
  schema: 'forge-review/v2';
  reviewed_at: string;
  reviewed_by: string;
  pause_decisions?: PauseDecisionSimple[];
  created_by_tool_version?: string;
}

/** v4 Fluid Pause 软记录 — 仅作 audit 不 fence */
export interface PauseDecisionSimple {
  paused_at: string;                                // ISO 8601 允许 ms
  task_ref: string;                                 // tasks.md#task-N
  issue_summary: string;
  chosen_option: 1 | 2 | 3 | 4;                     // 1=扩 scope / 2=加 task / 3=转 out-of-scope / 4=other
  notes?: string;                                   // 自由 prose
}
```

### §6.3 Marker schema validate(`src/core/validate/marker-schema.ts` v4)

```typescript
// ISO 8601 允许 ms(V-1 修复)
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

export function validateMarkerSchema(marker: unknown, kind: 'verify' | 'review'): ValidationResult {
  if (typeof marker !== 'object' || marker === null) return failed('marker not object');
  const m = marker as Record<string, unknown>;
  
  // schema 类型
  const expectedSchema = kind === 'verify' ? 'forge-verify/v2' : 'forge-review/v2';
  if (m.schema !== expectedSchema) return failed(`schema must be ${expectedSchema}`);
  
  // timestamp 字段
  const atKey = kind === 'verify' ? 'verified_at' : 'reviewed_at';
  if (typeof m[atKey] !== 'string' || !ISO_8601_RE.test(m[atKey] as string)) {
    return failed(`${atKey} must be ISO 8601 UTC (YYYY-MM-DDTHH:MM:SS[.fff]Z)`);
  }
  
  // by 字段
  const byKey = kind === 'verify' ? 'verified_by' : 'reviewed_by';
  if (typeof m[byKey] !== 'string') return failed(`${byKey} must be string`);
  
  // pause_decisions(可选,数组类型 only,内容不 fence)
  if (m.pause_decisions !== undefined && !Array.isArray(m.pause_decisions)) {
    return failed('pause_decisions must be array if present');
  }
  
  return ok();
}
```

总行数 ~100。

### §6.4 archive_summary.yaml 简化

```yaml
schema: forge-archive-summary/v2                    # BREAKING bump
archived_at: 2026-05-20T15:30:00Z
change_id: executor-async-rewrite
archive_name: 2026-05-20-executor-async-rewrite
verified_by: msc
reviewed_by: msc
applied_commits: []                                 # 可选,user 想填就填,不 fence
spec_updates_applied:
  # v6 修订(Codex v5 F-R5-3):字段语义对齐 forge `applyDeltas` operation 类型
  # (create / replace / delete),不是 OpenSpec delta-block 级别(added / modified / removed / renamed)
  - capability: auth
    operation: replace # 'create' | 'replace' | 'delete',沿 forge SpecDelta.operation
handoff_to_backlog:                                 # forge 独有亮点 — 跨 change 收集
  - source: scope_entries                            # proposal.md Out of Scope YAML 块
    entries:
      - id: oauth-refresh-token
        category: out-of-scope
        description: ...
        related_change: null
```

简化版无 `severity_buckets`(critical/warning/suggestion)、无 `fence_results`、无 `acked_warnings`、无 `pause_decisions` 复杂结构(那些都 archive 后 grep 原 marker 即可)。

### §6.5 Spec deltas 应用(沿用)

**v5 修订(Codex v4 F-R4-1/F-R4-2)— 放弃 OpenSpec specs-apply 移植**:`src/core/specs-sync/{apply,deltas,index}.ts` 全套**保留不变**,archive 主流程直接调用 forge 现有 `readDeltas` + `applyDeltas`。**v6 修订(Codex v5 F-R5-4)**:实际调用点是 forge 当前 `transaction.ts:159-160`(`archiveTransaction` 内调 readDeltas + applyDeltas);v4 archive.ts 简化版直接在 main 流程调,绕开 transaction.ts。

**根因分析**(Codex v4 抓到的根本路线问题):
- OpenSpec specs-apply.ts 用 **delta grammar**:`## ADDED/MODIFIED/REMOVED/RENAMED Requirements` 段 + 内部 `### Requirement: <name>` blocks(requirement-blocks.ts:122-125)
- forge 用 **GWT grammar**:`## Scenario: <id>` H2 + `**Given/When/Then**` 步骤(parse/specs.ts:40 + fixture valid-change/specs/login.md 实证)
- forge 现有 `applyDeltas` 是**整文件 create/replace**(`deltas.ts:17` SpecDelta.operation = 'create'/'replace'/'delete'),不解析 requirement-blocks
- OpenSpec `buildSpecSkeleton` 生成 `## Requirements` 结构,forge `validateSpec` 不接受(找不到 `## Scenario:` H2 即 fail)
- **两套 grammar 完全不兼容,即使移植 ~700-900 行也产生 forge 不认的 spec**

**v5 取消 plan v4 §10.1.1 Task 1.1a-1.1f 整套**(7 个移植子任务全删)。archive.ts 简化版第 5 步用 forge `readDeltas + applyDeltas`(整文件 create/replace),功能等同 forge 当前 archive.ts 行为,与 forge grammar 兼容。这也是 forge v3.x 的实际运行方式,稳定可靠。

**与 OpenSpec archive.ts 风格的差异**:OpenSpec 用 fine-grained delta merge(ADDED/MODIFIED block 级别),forge v4 用整文件 create/replace 级别。这是设计选择 — 用户原选项 (a) 移植 OpenSpec 是基于 grammar 兼容假设,实际不兼容则 path B 是唯一可行。失去 fine-grained delta merge 能力,但 forge change 一般 capability 粒度写整 spec 文件,整文件替换其实够用。

---

## §7 Fluid Pause 去 fence 协议

### §7.1 v3 协议(被砍部分)

- `forge pause-capture <changeId> --task <ref> --issue "<summary>"` CLI → 写 ack-log entry
- marker `pause_decisions` 严格 schema(`target_artifact` / `target_anchor` / `non_blocking_rationale` / `other_rationale` / `other_acked_by` / `severity_acked_by` / `severity_acked_at` / `added_task_ref` / `capture_id`)
- archive 时 `validatePauseDecisionsFence` 跑 5 option 业务校验(option=1 必须改 `## What` 段 + diff 段级校验;option=2 必须 capture_id 链 + task ∈ tasks.md `[x]`;option=3 必须 scope-entries YAML 块 + non_blocking_rationale;option=4 必须 other_rationale + other_acked_by)
- CRITICAL severity 拒签;WARNING + 未 ack 拒签

### §7.2 v4 协议(简化)

- **保留 skill 行为**:apply 中段 subagent 报 `BLOCKED` / `DONE_WITH_CONCERNS` / `DESIGN_ISSUE_FOUND` 时,主代理 invoke `AskUserQuestion` 弹 4 选项(沿 v3 同语义):
  - 1 = 扩本 change scope → 用户自行更新 `proposal.md ## What` 段(skill 提示)
  - 2 = 加 task 进本轮 → 用户/AI append 新 task 到 `tasks.md`(skill 提示)
  - 3 = 转 out-of-scope → 用户/AI 写到 `proposal.md ## Out of Scope` YAML 块(forge-scope-entries/v1,仍保留 schema!— `scope-entries` validate 是 spec layer)
  - 4 = Other → 自由 prose
- **删除**:`forge pause-capture` CLI、marker `pause_decisions` 严格字段、`validatePauseDecisionsFence` 业务校验、CRITICAL 重定向、severity_acked_by 强校验
- **简化版 marker `pause_decisions` 数组**(若 user/AI 想写):
  ```yaml
  pause_decisions:
    - paused_at: 2026-05-20T14:25:00Z
      task_ref: tasks.md#task-3
      issue_summary: subagent 发现 spec 漏 OAuth refresh token
      chosen_option: 1
      notes: 用户扩 scope,proposal.md What 段已加 refresh token 处理
  ```
- 无 fence,marker schema 仅校验数组类型 + 内字段类型(`paused_at` ISO 8601、`chosen_option` ∈ {1,2,3,4})

**Why 保留 skill 行为而不全删**:Fluid Pause 决策点本身是有价值的工作流元素(让用户在 apply 中段做 scope 决策);v3 复杂的是 marker fence,不是 skill 行为本身。

---

## §8 Verify / Review 行为简化

### §8.1 v3 协议(被砍)

- `/forge:verify`:跑 vitest 全套 → record-verify CLI 写 staging.yaml → freeze --kind verify(算 invariant 7/10 WARNING + fence-9 ack-log chain 固化)→ ack propose 处理 WARNING → ack confirm 写 marker
- `/forge:review`:dispatch subagent code review → record-review CLI 写 staging.yaml subagent_review_chain → freeze --kind review

### §8.2 v4 协议(简化)

- `/forge:verify`:
  1. 跑 vitest + lint + typecheck + 三维 verify skill(Completeness/Correctness/Coherence 行为保留,但仅 skill prose check,不写 marker)
  2. 写 `.verify-passed` 极简 marker(schema + verified_at + verified_by + 可选 pause_decisions)
- `/forge:review`:
  1. dispatch subagent code review(行为保留)
  2. 写 `.review-passed` 极简 marker
- 无 staging.yaml、无 record-* CLI、无 freeze、无 ack 协议

### §8.3 verify_findings 怎么处理

v3 的 `verify_findings` 数组(WARNING 阵列)在 v4 直接砍掉。verify 发现的问题:
- CRITICAL → 不 archive,user 修复后重跑(等同 OpenSpec validate fail blocking)
- WARNING/SUGGESTION → user/AI 在 conversation 里讨论 + 决定是否修;**不再写进 marker**;若决定不修,user 可在 proposal.md Out of Scope 段加 entry(forge backlog registry 仍能跨 change 跟踪)

---

## §9 Migration Guide(v3.x → v4.0)

### §9.1 用户视角变化

| 变化 | v3.x 用户体验 | v4.0 用户体验 |
|---|---|---|
| `/forge:verify` 后看到 | invariant-7-verify-count WARNING + 要求 `forge ack propose` | 直接 marker 写完,流畅过 |
| `/forge:review` 后看到 | subagent_review_chain 详细 staging + freeze 各种 hash | 直接 marker 写完,流畅过 |
| `/forge:archive` 失败 | "fence-9.3 ack-log chain verification failed: entry count mismatch" | 仅 spec validate fail 或 marker 文件缺失 |
| Fluid Pause | 复杂 marker pause_decisions 字段 + capture_id 链 | 简单数组 + 自由 prose |
| AI 偷懒可能 | 几乎所有路径都被 fence 挡住 | 用户自管 — 跟 OpenSpec 一样 |

### §9.2 已有 active change 升级路径

用户从 v3.1.1 升级到 v4.0.0 时,正在进行中的 `forge/changes/<id>/` 怎么办?

**唯一升级路径 — 重跑 verify/review**(v2 修订:Codex F-3.1 暴露原 §9.2 方案 B `--legacy-marker-mode v1` flag 凭空承诺无 Task 实现,v2 删之保留单一路径):

1. v3.1.1 时已写的 `.verify-passed` / `.review-passed` marker schema 是 `forge-verify/v1`,v4.0 schema 是 `forge-verify/v2` — schema validate 会 fail。
2. **升级前必须做的清理**(Codex F-3.2):
   - 删 `forge/changes/<id>/.evidence/pending-acks/` 整目录(v4 不再读 pending ack)
   - 删 `forge/.cache/archive-pause-<changeId>.json`(若存在,v4 不再有 archive pause 协议)
   - 删 `forge/changes/<id>/.evidence/process-evidence.staging.yaml`(v4 不再用 staging)
   - 可选:删 `forge/changes/<id>/.evidence/ack-log.jsonl`(v4 不再用 ack-log;若想保留作 history 也无害,v4 archive 不读)
3. 用户在 v4.0 跑 `/forge:verify` 重新写一个 v2 marker 覆盖原 v1(verify skill 改写后自动写 v2 schema)— 不破坏数据(只是覆盖 marker 文件)
4. 同理重跑 `/forge:review` 写 v2 review marker
5. 跑 `/forge:archive` → 通过 v2 schema validate + spec deltas apply + mv

**v4.0 启动文档**(`docs/migration/v3-to-v4.md`)详细说明上面步骤,在 SessionStart hook 也加 BREAKING warning(Phase 3 Task 3.14 review)。

### §9.3 已 archived change 兼容性

`forge/changes/archive/*` 已归档的 v1 marker / 复杂 archive_summary.yaml 全部保留。v4.0 不读它们,只追加新 archive(沿 OpenSpec 风格,archive 是 dead state 不再操作)。

**潜在不便**:用户用 `forge backlog scan-archived-followups` 时,scope-entries YAML 块的 schema 没变(仍 `forge-scope-entries/v1`),仍能正常工作。

**v2 修订(Codex F-3.3)**:原 plan 写"v4 backlog CLI 读 archive_summary.handoff_to_backlog"**不准** — 实际 `src/core/backlog/index.ts:40` 调 `scanArchivedFollowups`,在 `src/core/scope/aggregator.ts:96-99` 直接扫 archived change 的 `proposal.md` / `design.md` 的 `## Out of Scope` / `## Future Work` / `## Non-Goals` YAML 块(`forge-scope-entries/v1` schema),**不读 archive_summary**。所以 v3 → v4 兼容路径是:v3 时期写的 archived proposal/design YAML 块继续被 v4 backlog CLI 扫到,与 archive_summary 改 v2 schema 无关。

### §9.4 CLI 子命令兼容性

| 子命令 | v4 状态 |
|---|---|
| `forge validate` | 保留(spec validate 不变)|
| `forge init` | 保留 |
| `forge update` | 保留 |
| `forge archive` | 重写(BREAKING — v8 flag 改造:**新增 `--yes` / `--skip-specs`**(沿 OpenSpec 风格);**删** `--recover` / `--resume-summary` / `--resume`(v3 transaction 中断恢复消亡);**保留** `--force`(human-override / 非 git)+ `--api`(legacy-bridge sync-check 直连)。Codex v7 F-R7-1)|
| `forge upgrade` | 保留(v0.2 → v0.3 legacy upgrade)|
| `forge migrate` | 保留 |
| `forge legacy-bridge` | 保留 |
| `forge preflight` | 保留 |
| `forge stage-extensions` | 保留 |
| `forge monitor` | 保留 + 接 archive emit trace |
| `forge backlog` | 保留 |
| `forge scope` | 保留 |
| `forge config` | 保留 |
| `forge finding` | **保留**(v10 修订 Codex v9 F-R9-1)— multi-harness Tier 2/3 bridge `skills/_shared/tier23-command-bridge.md:34` 显式调 `forge finding hash`;finding-hash 属 spec layer 工具,不是 archive fence。与 §5.2 / §14 已收敛决定一致 |
| **`forge ack`** | **整删** |
| **`forge evidence`** | **整删** |
| **`forge pause-capture`** | **整删** |

---

## §10 Phase 1-4 SDD 任务清单

### §10.1 Phase 1 — 核心代码砍

> 目标:删 ~5445 行 / 改 archive.ts 重写 ~280 行 + 重写 summary-builder/summary-render/archive-summary-schema/marker-schema 等。**v5 修订(Codex v4 F-R4-3)**:删 v3/v4 估的"移植 ~300 行 / 700-900 行 OpenSpec specs-apply API"— 此方案 path 错(grammar 不兼容),v5 走 path B 用 forge 现有 applyDeltas,无新增代码。
> 
> **v3 修订(Codex v2 F-4.1 / F-16.1)— 顺序根本重排**:Phase 1 真正正确的依赖图是 **"先重写 archive.ts 让它不再 import 待删模块 → 然后才能安全删 archive 子模块"**。v2 的"先清 barrel + 删 CLI → 后删 archive 子模块 → 最后重写 archive.ts"在中间状态(Task 1.11/1.12 删完 transaction/recover/fence,但 Task 1.14 才重写 archive.ts)仍 typecheck 立刻崩,因为 archive.ts:22-55 直接 import 这些。
> 
> v6 + v7 正确顺序(Path B 后):
> 1. **§10.1.1** 准备:简版 marker / archive-summary schema 草案到位(specs-sync 走 Path B 保持现有 API)
> 2. **§10.1.2** 重写 archive.ts(把 import 全切到新 helper)+ summary-render + summary-builder + archive-summary schema → archive.ts 不再 import 待删模块
> 3. **§10.1.3** 删 archive.ts 不再用的 archive 子模块(typecheck 自然干净)
> 4. **§10.1.4** 删 CLI 子命令(evidence/ack/pause-capture)+ 上游消费者(marker-ack)
> 5. **§10.1.5** 删 core helpers(ack-log / freeze warnings)
> 6. **§10.1.6** 清 barrels + 终末 typecheck/build 验证 + open question grep

**§10.1.1 准备阶段** — 简版 schema 草案到位(Path B 后无 OpenSpec API 移植任务)

- [ ] **Task 1.1**: **v5 修订(Codex v4 F-R4-1/F-R4-2)— 删除任务**:plan v3/v4 的 Task 1.1a-1.1f(从 OpenSpec 移植 specs-apply + parsers + validator,~700-900 行)整套**取消**。根本原因:OpenSpec delta grammar(`## ADDED Requirements`)与 forge GWT grammar(`## Scenario:`)不兼容,移植后产生 forge validate 拒收的 spec。改用 forge 现有 `readDeltas + applyDeltas`(整文件 create/replace,无需新代码,见 §6.1 Step 5 v5 修订)。**Task 1.1 不动 specs-sync/**。
- [ ] **Task 1.2**: 重写 `src/core/markers/types.ts`(183 → ~60 行)— 仅 VerifyMarker v2 / ReviewMarker v2 / PauseDecisionSimple interface(为 Task 1.5 archive.ts 重写时 import 准备)。
- [ ] **Task 1.3**: 重写 `src/core/validate/marker-schema.ts`(791 → ~100 行)— 仅校验 v2 schema(verified_at/reviewed_at 允许 ms — V-1 修);删 process_evidence / verify_findings / pause_decisions 复杂校验。
- [ ] **Task 1.4**: 重写 `src/core/schemas/archive-summary.ts` v1 → v2(Codex F-1.3)— 删 `process_evidence_summary` 必填;同步重写 `src/core/validate/archive-summary-schema.ts` validator。

**§10.1.2 重写 archive 主入口 + summary builder/render**(切 archive.ts 的 import)

- [ ] **Task 1.5**: 重写 `src/cli/commands/archive.ts`(1166 → ~280 行,沿 §6.1 v6 修订草案,**含正确签名的 legacy-bridge preflight/posthook + generateBacklog + appendTraceEvent + Path B 简化 spec sync 用 forge 现有 API**)。**v6 修订(Codex v5 F-R5-1/F-R5-2)**:Path B 后不再引入 OpenSpec API。引入新 helper:`validateMarkerSchema`(v4 简版,Task 1.3 已造)+ `readDeltas / applyDeltas / type SpecDelta`(forge 现有 specs-sync API,**不**新增到 specs-sync,只在 archive.ts 内 import 使用)+ `renderDeltasSummary(deltas: SpecDelta[]): string`(archive.ts 内**新增本地 helper** ~10 行,显示 deltas 给用户 confirm;Path B "无新增代码" 仅指 specs-sync/ 不变,archive.ts 内仍需 ~10 行 helper)+ `moveDirectory`(沿 OpenSpec EPERM/EXDEV fallback,archive.ts 内**新增本地 helper** ~15 行)+ `getArchiveDate`(archive.ts 内 ~5 行)+ `selectChange` inquirer 交互(archive.ts 内 ~30 行)。**关键**:重写后 archive.ts **不再 import** transaction/lock/recover/recover-prompt/resume-summary/fence/process-evidence-fence/ack-log-consistency/three-level-fence/legacy-exemption/version-retrograde-fence/verify-findings-fence/pause-decisions-fence 任何一个 — 这是 §10.1.3 删除安全的前提。
- [ ] **Task 1.6**: 重写 `src/core/archive/summary-builder.ts`(351 → ~80 行,删 fence_results / severity_buckets / acked_warnings;保留 archived_at + applied_commits + handoff_to_backlog + spec_updates_applied + verified_by + reviewed_by)。**v7 修订(Codex v6 F-R6-2)**:**导出名保留** `buildArchiveSummary`(不改 `buildSimplifiedSummary`),new signature:`buildArchiveSummary(opts: { archivePath, changeId, verifyMarker, reviewMarker, deltas }): Promise<ArchiveSummary>`。Task 1.5 archive.ts 重写时 import `buildArchiveSummary` 而非 v1-v6 plan 里漂移的 `buildSimplifiedSummary`。

**v8 修订(Codex v7 F-R7-1)— archive command CLI flag 扩展**:
Task 1.5 重写 archive.ts 时,**新增两个 CLI flag**(沿 OpenSpec archive 风格,§6.1 伪代码 `options.yes` / `options.skipSpecs` 已引用):
- `--yes` — 自动接受所有 interactive confirm(未完成 task / spec deltas 等),CI 自动化模式必备(沿 OpenSpec archive.ts:53)
- `--skip-specs` — 跳过 spec deltas 应用(沿 OpenSpec archive.ts:197/53)

保留 forge 现有 flag:`--force`(human-override / 非 git)、`--api`(legacy-bridge sync-check 直连 API),不再保留 v3 的 `--recover / --resume-summary / --resume`(transaction 中断恢复消亡)。

**v9 修订(Codex v8 F-R8-1)— 不引入 --no-validate flag**:沿 B1 严格精神,删 §6.1 `options.noValidate` 分支,archive **永远 validate**(spec layer validate 不是反加固 fence,无需提供 skip 路径)。CLI flag 表(Task 1.5 + §9.4)只含 `--yes` / `--skip-specs` / `--force` / `--api` 四个,完整闭合无 undocumented option。

§9 Migration Guide CLI 子命令兼容性表同步更新。
- [ ] **Task 1.7**: **v3 新增**(Codex v2 F-4.2)重写 `src/core/archive/summary-render.ts`(81 → ~40 行)— 删读 `process_evidence_summary` / `acked_warnings` / `pending_suggestions` v1 字段;保留读 archived_at + applied_commits + spec_updates_applied + handoff_to_backlog 段渲染。
- [ ] **Task 1.8**: 跑 `pnpm typecheck` 验证 archive.ts 已脱离待删模块依赖(此时仍 import barrel 但实际函数已切完 — barrel 清理在 §10.1.6)。

**§10.1.3 删 archive 子模块**(archive.ts 已切完依赖,可安全删)

- [ ] **Task 1.9**: 删 `src/core/archive/{fence,process-evidence-fence,process-evidence-rerun,pause-decisions-fence,ack-log-consistency,verify-findings-fence,three-level-fence,legacy-exemption,version-retrograde-fence}.ts`(总 ~2475 行)。
- [ ] **Task 1.10**: 删 `src/core/archive/{transaction,recover,recover-prompt,lock,resume-summary}.ts`(总 ~750 行)。

**§10.1.4 删 CLI 子命令 + 上游消费者**

- [ ] **Task 1.11**: 删 `src/cli/commands/evidence.ts`(842 行)+ `evidenceCommand` import / register from `src/cli/index.ts`。
- [ ] **Task 1.12**: 删 `src/cli/commands/ack.ts`(399)+ register。
- [ ] **Task 1.13**: 删 `src/cli/commands/pause-capture.ts`(107)+ register。
- [ ] **Task 1.14**: **v2 新增**(Codex F-1.2)删 `src/core/ack/marker-ack.ts`(~200)+ 该模块的 export(`src/core/ack/index.ts` 若有)+ 调用点。

**§10.1.5 删 core helpers**

- [ ] **Task 1.15**: 删 `src/core/ack-log.ts`(307)。
- [ ] **Task 1.16**: 删 `src/core/process-evidence-freeze-warnings.ts`(215)+ `staging-lock.ts` + `schemas/process-evidence.ts`。
- [ ] **Task 1.17**: 删 `src/core/validate/marker-integrity.ts`(~80)。**v2 修订**:**`finding-hash.ts` 不删**(Codex v1 F-1.1)— validate/scope-entries/finding CLI/auto-findings/severity schema 等 13 处依赖,multi-harness Tier 2/3 bridge `forge finding hash` 调用必需。`canonical-json.ts` 同样保留(finding-hash 依赖)。

**§10.1.6 清 barrels + 终末验证**

- [ ] **Task 1.18**: 清 `src/core/archive/index.ts` barrel — 删 `export * from './transaction'` / `lock` / `recover`(三行)。**v3 修订**:在 §10.1.3 完成后才清,而不是 v2 的"先清 barrel 再删模块"— 因为 archive.ts Task 1.5 重写后已不 import barrel 中这些模块,顺序无所谓,但 v3 选放到删完模块后清(更直观)。
- [ ] **Task 1.19**: 清 `src/core/validate/index.ts` barrel — 删 `export * from './marker-integrity'`(留 `./finding-hash` 不删,Codex v1 F-1.1)。
- [ ] **Task 1.20**: 跑 `pnpm typecheck` + `pnpm build`,确保 Phase 1 末尾 typecheck 干净(不需要 test 过)。
- [ ] **Task 1.21**: grep `canonicalize\|canonicalHash` 全仓非 archive 路径,确认 backlog/scope/finding 是否仍用 — 是则 `canonical-json.ts` + `finding-hash.ts` 留(预期是),否则可议(预期不议)。

### §10.2 Phase 2 — Marker schema 收尾(v3 修订后大幅缩水)

> **v3 修订**(Codex v2 F-4.1)— 原 Phase 2 的 Task 2.1/2.2 / archive-summary schema 重写已**前移到 §10.1.1**(Task 1.2/1.3/1.4),作为 Phase 1 archive.ts 重写的前置依赖。Phase 2 剩 2 个收尾 Task。

- [ ] **Task 2.1**: 顺手修 `src/core/validate/archive-summary-schema.ts:76` ISO 正则错误消息(与 marker-schema 对齐:`(YYYY-MM-DDTHH:MM:SS[.fff]Z)`)。
- [ ] **Task 2.2**: 删 `src/core/markers/parse.ts` 中跟 v1 marker 复杂字段相关的 parse 逻辑(若有),保留 simple YAML parse。
- [ ] **Task 2.3**: 跑 `pnpm typecheck` 干净。

> 备注:Phase 1 完成时 schema 简化已基本完成,Phase 2 仅 cleanup。若希望进一步合并 Phase 1+2,实施者可自由合 commit。

### §10.3 Phase 3 — Skills + 命令文档大改 + archive emit monitor trace

> 目标:文档级大改 + 反加固 skill 群删除

- [ ] **Task 3.1**: 整删 skill — `skills/process-evidence/SKILL.md` + 其 references/。
- [ ] **Task 3.2**: **v2 修订**(Codex F-6.1)— `skills/verifying-three-dimensions/SKILL.md` **改写不删**:三维 verify(Completeness/Correctness/Coherence)是有价值的 prose check 行为,删去其中"写 marker.verify_findings + severity 三级 + ack 协议"段;留三维 prose check 流程指引,与 §8.2 一致。同时清掉 references/ 内反加固相关 doc。
- [ ] **Task 3.3**: **v4 修订**(Codex v3 F-R3-3)— `skills/subagent-driven-discipline/SKILL.md` **grep-driven 改写**(v3 v2 修订的"删 §3.2/§4"切割范围偏窄,实际反加固引用散落更广)。
  - **保留 + 简化**:§1 task-type taxonomy(haiku/sonnet/opus 决策树)+ §2 model-tier 映射 + §3.3 inline-fix vs round-2 decision tree + reviewer file:line evidence 协议(replace hash 链)
  - **grep-driven 清理 keyword**:`canonicalHash` / `ack-log` / `finding_hash` / `validateAckLogConsistency` / `forge evidence` / `process_evidence` / `three-level-fence` / `staging.yaml` / `payload_hash` / `record-tdd` / `record-verify` / `record-review` / `freeze` — 凡含此类的段落整段清掉或改写为 v4 语义
  - 实证:line 632 §6 pattern catalog 含 canonicalHash 多路径 fallback divergence 模式(整段删 — 在 v4 无 hash 链);**全文 grep 命中 ≥10 处的关键词清完才算 done**
  - references/ 保留 `codex-tools.md` + `opencode-tools.md`(Tier 2/3 工具映射,multi-harness 必需);其他反加固 reference doc(如有 model-tier 反加固相关的)按内容评估
- [ ] **Task 3.4**: 整删 skill — `skills/verifying-process-evidence/SKILL.md`(若存在)。
- [ ] **Task 3.5**: 删 `commands/ack-confirm.md`(整删 — 两步 ack 协议消亡)。
- [ ] **Task 3.6**: 重写 `commands/archive.md`(~200 → ~80;删 14 fence / ack-log / process_evidence 协议描述)。
- [ ] **Task 3.7**: 重写 `commands/verify.md`(~300 → ~120;删 record-verify + freeze 调用;改为简单写 .verify-passed)。
- [ ] **Task 3.8**: 重写 `commands/review.md`(~250 → ~100;同上)。
- [ ] **Task 3.9**: 重写 `commands/apply.md`(~230 → ~150;保留 Fluid Pause skill 行为但删 pause-capture CLI + 复杂字段)。
- [ ] **Task 3.10**: **v4 修订**(Codex v3 F-R3-3)改 `skills/subagent-driven-development/SKILL.md` — **grep-driven 清理**(v2/v3 描述"删反加固段"切割不够,实际残留 line 338/350/351/354/356/368/389/413 等多处)。
  - **grep-driven 清理 keyword**(同 Task 3.3):`ack-log` / `validateAckLogConsistency` / `finding_hash` / `forge evidence record-tdd` / `process_evidence` / `canonicalHash` / `severity_acked_by` 写 marker 协议 / `tdd_event_chain` / `staging.yaml`
  - **保留**:dispatch subagent 行为 + cheap-model 决策 + TDD red→green 流程指引(TDD 行为本身保留,仅删 fence claim)+ §"Main Agent STOP Triggers"段(防 AI 绕过 BLOCKED)
  - **删整段**:plan-9g 新增的 DONE_REPORT process_evidence 字段(line 354-368);"不依赖 marker / ack-log 持久化字段"段(line 389)中跟 ack-log 挂钩部分;`forge evidence record-tdd` 调用要求(line 413)
  - **核查**:Task 3.10 完成后 grep `grep -E "ack-log|finding_hash|validateAckLogConsistency|forge evidence|process_evidence|canonicalHash" skills/subagent-driven-development/SKILL.md` 应 0 命中
- [ ] **Task 3.11**: 改 `skills/verification-before-completion/SKILL.md` — 删 evidence helper / 三级 fence claim。
- [ ] **Task 3.12**: 改 `skills/receiving-code-review/SKILL.md` — 删 review marker 复杂字段写入要求。
- [ ] **Task 3.13**: 改 `skills/requesting-code-review/SKILL.md` — 同上。
- [ ] **Task 3.14**: 重写 `skills/using-forge/SKILL.md` — 对齐 v4 协议描述。
- [ ] **Task 3.15**: 在 `src/cli/commands/archive.ts` 加 5 行 `appendTraceEvent` 调用(报告 3.1 修复)。
- [ ] **Task 3.16**: 跑 `pnpm build` 同步 commands/ + skills/ 模板到 dist/ + src/core/templates/。
- [ ] **Task 3.17**: 全套 CI 跑过 `format:check / lint / typecheck / build`。

### §10.4 Phase 4 — 测试 + fixture 清理 + v4.0.0 发布

> 目标:测试全绿、release-gate 通过、发版

- [ ] **Task 4.1**: 删 evidence helper 测试 — `tests/cli/evidence.test.ts` / `tests/cli/ack-*.test.ts` / `tests/cli/pause-capture.test.ts`(整删,~10 文件)。
- [ ] **Task 4.2**: 删 fence 测试 — `tests/cli/archive-pause-fence.test.ts` / `tests/core/archive/{pause-capture-fence,ack-log-consistency,three-level-fence,version-retrograde-fence,legacy-exemption,transaction,transaction-summary,recover,recover-prompt}.test.ts` 等(整删,~12 文件)。
- [ ] **Task 4.3**: 删 process_evidence + freeze warning 测试 — `tests/core/archive/process-evidence-{fence,fence-rerun}.test.ts` / `tests/core/process-evidence-freeze-warnings.test.ts`(~5 文件)。
- [ ] **Task 4.4**: 删 marker-integrity 测试 — `tests/core/markers/marker-integrity.test.ts` 等。
- [ ] **Task 4.5**: 删 release-blocker attack path 测试 — `tests/integration/release-blocker-attack-path.test.ts`(整删 — 这是 fence-9.3 attack path 测试,v4 fence 消亡)。
- [ ] **Task 4.5a**: **v2 新增**(Codex v1 F-4.3)— 处理 3 个反加固关联测试:
  - 删 `tests/cli/severity-fence.test.ts`(import `computeFindingHash` 走反加固路径)
  - 评估 `tests/core/canonical-json.test.ts`:Phase 1 Task 1.21 grep 显示 backlog/scope 仍依赖 `canonicalize` → 保留测试;反之删
  - 改 `tests/integration/tier23-bridge-protocol.test.ts:20` — 删 WARNING finding 构造路径,保留 multi-harness bridge 主路径测试(`forge finding hash` 调用应仍 work)
- [ ] **Task 4.5b**: **v3 新增**(Codex v2 F-10.1 + F-4.2)— 处理 monitor + summary-render 测试:
  - 改 `tests/core/monitor/artifact-observer.test.ts:81-84` — 删 `process_evidence_summary` / `acked_warnings` / `pending_suggestions` v1 字段构造,改用 v4 simplified archive_summary fixture
  - 改 `src/core/monitor/artifact-observer.ts:76-97/110-113` — 删读 ack-log + verify_findings 反加固路径;保留 archive_summary 观察(改读 v2 字段)
  - 改 `tests/core/archive/summary-render.test.ts`(若存在)— 配合 §10.1.2 Task 1.7 summary-render 重写
- [ ] **Task 4.5c**: **v4 新增**(Codex v3 F-R3-4)处理 `src/core/monitor/divergence-map.ts` + 其他 monitor 子模块的反加固语义:
  - 删 `archive-unresolved-warning` scenario(v4 无 fence 拒签 WARNING 语义,regression_signal `cli_exit.exit_code=0` 在 v4 是正常 OpenSpec 行为,不是回归)
  - 或改写为 OpenSpec-aligned scenario(`forge: 同 openspec - 放行 WARNING 给用户自管`)
  - 全 monitor 子模块 grep `ack|fence|severity_acked|verify_findings|process_evidence` 找 v3 残留,清理或改写到 v4 语义:**`src/core/monitor/{config,types,health-verdict,report-renderer,artifact-observer,divergence-map,trace-store,exit-handler}.ts`**
  - 同步对应测试 fixture 更新
- [ ] **Task 4.6**: 删 pause-decisions fixture — `tests/fixtures/pause-decisions/` 整目录(5 子目录)。
- [ ] **Task 4.7**: 删 process-evidence / verify-findings fixture — `tests/fixtures/{process-evidence,verify-findings,archive-warnings}/` 整目录。
- [ ] **Task 4.8**: 删 marker-version fixture(legacy-exemption + version-retrograde 配套)。
- [ ] **Task 4.9**: 简化 `tests/cli/archive.test.ts` — 写简化版主流程的新测试(check marker exists / validate / specs apply / mv / summary write)。
- [ ] **Task 4.10**: 简化 `tests/core/markers/marker-schema.test.ts` — 测 v4 schema(verified_at allow ms / required fields)。
- [ ] **Task 4.11**: 简化 `tests/core/archive/summary-builder.test.ts` — 测 v4 简化版 summary 生成。
- [ ] **Task 4.12**: 修 `scripts/check-release-gate.mjs` — 删 release-blocker-attack-path.test.ts 引用 + 调整 EXPECTED_TODO_COUNT_SOFT(应该 = 0)。
- [ ] **Task 4.13**: 跑 `pnpm test` 全套 + `pnpm test:gate` 干净。
- [ ] **Task 4.14**: 跑 `pnpm release:gate`(完整 7 步 release gate) 干净。
- [ ] **Task 4.15**: 写 `docs/migration/v3-to-v4.md`(~200 行 — §9 migration guide 落地)。
- [ ] **Task 4.16**: 写 `CHANGELOG.md [4.0.0]` 段(详尽 BREAKING 描述 + migration link)。
- [ ] **Task 4.17**: bump 5 处版本号 → `4.0.0`(package.json + .claude-plugin/plugin.json + .claude-plugin/marketplace.json + .codex-plugin/plugin.json + scripts/run-forge.mjs REQUIRED_RANGE → `^4.0.0`)。
- [ ] **Task 4.18**: `pnpm build` 同步模板。
- [ ] **Task 4.19**: commit + push to dev。
- [ ] **Task 4.19a**: **v2 新增**(Codex F-5.3)— 跑 `node scripts/build-bundled-plugin.mjs` 生成 `dist-bundled/forge-bundled-v4.0.0.tgz`(package.json 无 npm script alias,直接调脚本)。
- [ ] **Task 4.20**: `git tag v4.0.0 + push origin v4.0.0`。
- [ ] **Task 4.21**: `gh release create v4.0.0 dist-bundled/forge-bundled-v4.0.0.tgz --title "v4.0.0 — OpenSpec alignment (BREAKING)" --notes-from migration guide`。
- [ ] **Task 4.22**: 用户(msc 交互终端)`pnpm publish --no-git-checks --ignore-scripts` 输 OTP 发 npm。

---

## §11 测试改造矩阵

| 测试目录 | 当前数 | v4 命运 |
|---|---|---|
| `tests/cli/{evidence,ack-*,pause-capture}*.test.ts` | ~10 | **整删** |
| `tests/cli/archive*.test.ts`(除 v4 简化版新增)| ~5 | **删旧 + 写新简化** |
| `tests/core/archive/{pause-capture-fence,ack-log-consistency,three-level-fence,version-retrograde-fence,legacy-exemption,transaction,transaction-summary,recover,recover-prompt,fence,process-evidence-fence,process-evidence-rerun}.test.ts` | ~12 | **整删** |
| `tests/core/archive/summary-builder.test.ts` | 1 | **简化重写** |
| `tests/core/process-evidence-freeze-warnings.test.ts` | 1 | **整删** |
| `tests/core/markers/{marker-schema,marker-integrity,marker-version-schema,pause-decisions-schema}.test.ts` | ~4 | **简化(只留 marker-schema 简版)** |
| `tests/core/ack-log*.test.ts` | ~3 | **整删** |
| `tests/integration/release-blocker-attack-path.test.ts` | 1 | **整删** |
| `tests/integration/archive-summary-end-to-end.test.ts` | 1 | **简化重写** |
| `tests/integration/pause-decisions-end-to-end.test.ts` | 1 | **整删** |
| `tests/integration/marker-version-end-to-end.test.ts` | 1 | **整删** |
| `tests/cli/validate-verify-findings.test.ts` | 1 | **整删**(verify_findings 消亡)|
| `tests/fixtures/{pause-decisions,process-evidence,verify-findings,archive-warnings,marker-version}/` | 60+ 子目录 | **大批量删** |
| `tests/core/monitor/artifact-observer.test.ts` | 1 | **v3 修订**(Codex v2 F-10.1)— **改写**:fixture 构造从 v1 反加固字段切到 v2 simplified |
| `tests/core/specs-sync.test.ts` | 1 | **v7 新增**(Codex v6 F-R6-4)— **保留**(Path B 核心依赖:`readDeltas / applyDeltas / SpecDelta` 测试覆盖 create/replace/delete/error)。可补 `renderDeltasSummary` 单测 + archive path 集成覆盖 |
| 其他 — proposal/specs/tasks/parse/validate/backlog/scope/migrate/legacy-bridge/preflight/stage-extensions 等(monitor + specs-sync 已单独列上) | ~118 文件 | **不动**(独立子系统) |

**最终测试数估算**:192 → 约 120-130(去 60+ 反加固相关测试)。

---

## §12 Risk & Rollback

| 风险 | 缓解 |
|---|---|
| Phase 1 删大量代码后,某些"看似 archive 专用但实际被其他模块依赖"的 helper 被误删 → typecheck fail | 每个 Task 后跑 `pnpm typecheck`;遇 unresolved import 检查是否 backlog/scope/migrate/legacy-bridge 依赖,若是则保留(列入 §5.2 评估)|
| `canonicalize` / `canonical-json.ts` / `hash/` 模块可能被 backlog registry 用(finding_hash 跨用)→ 误删导致 backlog 子命令崩 | Phase 1 末尾跑 `grep -rn "canonicalHash\|canonicalize\|finding-hash"` 全仓 — 若仅 archive fence 用则删,backlog 用则留 |
| Skill 文档大改后 forge-eval scenarios 失效 | Phase 3 完跑 `pnpm eval` 看 scenarios 状态;失效的 scenario 留在 archive 不重跑(eval 是 skill 行为评测,删 4 skill 自然不再评)|
| v4.0.0 发布后老用户 active change 的 v1 marker schema validate fail → archive 卡住 | §9.2 migration guide 明确告知"升级前完成 archive 或重跑 /forge:verify"。**v3 修订(Codex v2 F-12.1)**:删原 v2 此处保留的 `--legacy-marker-mode v1` flag 后备承诺(与 §16 F-3.1 决定的"单一路径"冲突)— 唯一路径就是重跑 verify/review,不引入 flag 复杂度。|
| ForgeUE 项目 v3.1.1 升 v4.0.0 时正在跑的 executor-async-rewrite-followup change 卡住 | ForgeUE 项目 manual archive 已经在 v3.1.1 下走完 executor-async-rewrite,新 change 走 v4 |
| forge upstream issue / community 反弹("forge 不是反加固吗?") | CHANGELOG + migration guide + 这份 plan 解释设计哲学转向;接受社区反馈,极端情况可以保留 v3 分支永久 patch |
| **v2 新增**(Codex F-5.1)删 `transaction.ts` 阶段 0/1/1.5/1.6/2 五阶段 atomic 后,spec sync 部分失败无回滚,已写 spec 文件保留半边状态。**v6 修订(Codex v5 F-R5-4)**:Path B 后失败点是 `applyDeltas` 逐文件写入时部分成功(不再有 buildUpdatedSpec / writeUpdatedSpec) | **已知接受 risk**,沿 OpenSpec 风格(`archive.ts:225-262` 也是部分失败重跑模式)。用户撞到时:手动 `git checkout` 受影响 specs + 重跑 `/forge:archive`。在 migration guide §"已知限制" 段明示此 trade-off |
| **v2 新增**(Codex F-3.2)v3 → v4 升级时 `forge/changes/<id>/.evidence/pending-acks/` 与 `forge/.cache/archive-pause-*.json` 残留可能让用户困惑 | §9.2 v2 修订已加显式清理步骤;Phase 4 Task 4.15 写 `docs/migration/v3-to-v4.md` 时把这步放到最显眼位置 |

**Rollback**: 每个 Phase 是独立 commit batch,可逐 Phase revert。Phase 1 之前(本 plan 之后)是 v3.1.1 干净状态,完全可回。

---

## §13 Release Strategy(v4.0.0)

**SemVer**: MAJOR(4.0.0)— BREAKING change

**版本号同步 5 处**(沿 [[project_forge_version_sync]] memory 纪律):
- `package.json` `version: "4.0.0"`
- `.claude-plugin/plugin.json` `version: "4.0.0"`
- `.claude-plugin/marketplace.json` plugins[0].version
- `.codex-plugin/plugin.json` `version: "4.0.0"`
- `scripts/run-forge.mjs` `REQUIRED_RANGE = '^4.0.0'`

**4 步发布纪律**(沿 [[feedback_forge_release_discipline]]):
1. `pnpm release:gate`(v3.1.1 已接 prepublishOnly hook,Phase 4 末尾自动跑)
2. `pnpm publish --no-git-checks --ignore-scripts`(用户交互终端输 OTP)
3. `git tag v4.0.0 + push origin v4.0.0`
4. `gh release create v4.0.0 dist-bundled/forge-bundled-v4.0.0.tgz --title "v4.0.0 — OpenSpec alignment (BREAKING)" --notes ...`

**CHANGELOG `[4.0.0]` 段必含**:
- BREAKING:具体砍掉哪些子命令 / 协议 / fence
- Migration:指向 `docs/migration/v3-to-v4.md`
- 哲学转向说明(从反向加固到 OpenSpec 对齐)
- 同时修的小 fix(V-1 ms 正则 / 3.1 monitor trace)

---

## §14 Open Questions(留 review 时填)

1. **`forge finding` CLI 命运**:**v2 已定**(Codex F-1.1 + F-6.2)— **保留**。`finding-hash.ts` 不删,multi-harness Tier 2/3 bridge `skills/_shared/tier23-command-bridge.md:34` 显式调 `forge finding hash`。原 Q 答错被 Codex 抓出。
2. **`canonical-json.ts` 命运**:**v2 已定**(Codex F-1.1)— **保留**(finding-hash 依赖)。仅删 archive fence 路径上的 `canonicalHash` 调用,wrapper 本身留。Phase 1 Task 1.18 grep 二次确认。
3. **`forge-eval/` scenarios 命运**:删 4 反加固 skill 后,evaluator scenarios 与之对应的部分自然失效。是否需要补新 v4 风格 scenarios?**Phase 3 末跑 `pnpm eval` 看实际影响**,补 v4 风格 eval 留 v4.1 plan。
4. **`stage-extensions` 与 v4 兼容性**:stage-extensions 触发点是 `propose / apply / review / verify`,涉及现有 marker fence 调用?**Phase 1 检查 `src/core/stage-extensions/` 是否 import fence / evidence**;预期独立无依赖。
5. **`legacy-bridge` 与 v4 兼容性**:legacy-bridge 自己有 marker 写入?**Phase 1 检查;预期独立**。
6. **`upgrade` 子命令是否需要 v3 → v4 自动迁移逻辑**:user 跑 `forge upgrade` 时是否自动改写 active change 的 v1 marker → v2?**默认不实施**,留 migration guide 手动指引;实施留 v4.1。
7. **Plugin marketplace 行为**:`.claude-plugin/marketplace.json` 改 v4 后,已装 v3 plugin 用户升级路径?**Claude Code plugin 自动拉新版本应该 OK,加 migration warning 到 SessionStart hook**(留 Phase 3 Task 3.14 review)。

---

## §15 后续 Session 推荐节奏

**Session 1(本 session — Phase 0)**:写完本 plan + commit + push。**已完成**。

**Session 2(Phase 1)**:核心代码砍 + 写简化 archive.ts。**估计 2-3 小时**。  
**进入条件**:用户 review 本 plan 确认大方向无异议。

**Session 3(Phase 2)**:marker schema + types 简化。**估计 1-2 小时**。

**Session 4(Phase 3)**:skill + 命令文档大改。**估计 2-3 小时**。

**Session 5 (+ 可能 6)(Phase 4)**:测试 + fixture 清理 + 发布。**估计 3-4 小时**。

**总计**:5-8 session,跨 1-2 周日历时间(看用户节奏)。

---

---

## §16 Codex Adversarial Review v1 — Response Log(2026-05-20)

**Review trigger**: user msc 通过 codex:rescue agent 跑对抗性审查,目标本 plan v1。Codex 输出 16 条 finding,user 主代理逐条独立对照 forge-repo 代码核实,确证 16/16 全为真问题。Plan v2 修订针对每条 finding。

| Codex Finding | Severity | 核实 | Plan v2 修订 |
|---|---|---|---|
| **F-1.1** `finding-hash.ts` 非 archive-only,validate/scope-entries/finding CLI 等 13 处依赖 | Critical | ✅ grep 命中 13 文件 | §5.1 + §5.2 + §10.1.4 Task 1.13:**保留** finding-hash.ts;§14 Q1 改答案 |
| **F-1.2** 漏砍 `src/core/ack/marker-ack.ts`(写 verify_findings ack 字段) | Important | ✅ 文件存在 + import computeFindingHash | §5.1 加删除项;§10.1.2 Task 1.8 新增 |
| **F-1.3** archive-summary schema v1 字段未升 v2 | Critical | ✅ schemas/archive-summary.ts + validator/archive-summary-schema.ts:126 都要 `process_evidence_summary` | §5.1 加 v1→v2 重写项;§10.1.5 Task 1.16 新增 |
| **F-2.1** §6.1 漏 legacy-bridge preflight/posthook | Critical | ✅ archive.ts:270/651 调 runArchivePreflight/PostHook,legacy-bridge 是 brownfield 正式耦合非 fence | §6.1 伪代码补 Step 2 / Step 8 |
| **F-2.2** §6.1 漏 archive 后自动 generateBacklog | Important | ✅ archive.ts:666 调 generateBacklog | §6.1 伪代码补 Step 9 |
| **F-2.3** 删 transaction 后 spec sync 部分失败无回滚 | Important | ✅ transaction.ts 阶段 0/1/1.5/1.6/2 五阶段 atomic | §6.1 v2 修订说明 + §12 Risk 加已知接受项 |
| **F-3.1** §9.2 凭空承诺 `--legacy-marker-mode v1` flag,§10 无对应 Task | Important | ✅ archive 当前无此 flag,我自己凭空写 | §9.2 删方案 B,保留单一"重跑 verify/review"路径 |
| **F-3.2** §9.2 未覆盖 pending-acks / archive-pause cache 清理 | Important | ✅ ack-log.ts:93-94 写 `.evidence/pending-acks/`,archive.ts:1015 写 `.cache/archive-pause-<id>.json` | §9.2 加显式清理步骤;§12 Risk 加 v2 项 |
| **F-3.3** §9.3 错误描述 backlog CLI 读 archive_summary | Minor | ✅ 实际 backlog/index.ts:40 调 scanArchivedFollowups,在 scope/aggregator.ts:96-99 扫 archived proposal/design YAML | §9.3 加 v2 修订段澄清 |
| **F-4.1** Phase 1 Task 1.8 先删 finding-hash 致 typecheck 立崩 | Critical | ✅ upstream 13 依赖未清就删本体 | §10.1 全段重排为 6 个 sub-phase(1.1-1.18),先清 barrel + 上游消费者,再删模块本体 |
| **F-4.2** 漏 archive/index.ts + validate/index.ts barrel exports 清理 | Important | ✅ 两 barrel 都还 export 要删的模块 | §10.1.1 Task 1.1 + 1.2 新增 |
| **F-4.3** 漏 severity-fence / canonical-json / tier23-bridge 三测试 | Important | ✅ 3 文件全存在,severity-fence 直接 import computeFindingHash | §10.4 Task 4.5a 新增 |
| **F-5.1** Risk 未捕获 spec sync 失败无回滚 | Critical | ✅ 同 F-2.3 | §12 Risk 加 v2 项(已知接受) |
| **F-5.2** finding-hash 归因不全(validate + scope-entries 也依赖) | Important | ✅ §14 Q1/Q2 原答案错 | §14 Q1+Q2 改答案为"保留" |
| **F-5.3** Task 4.21 用 bundled tgz 但无生成步骤 | Minor | ✅ scripts/build-bundled-plugin.mjs 存在但 package.json 无 npm script alias | §10.4 Task 4.19a 新增 |
| **F-6.1** §5.5 删 verifying-three-dimensions vs §8.2 三维 verify 保留 — plan 自相矛盾 | Critical | ✅ 我自己两段写了相反内容 | §5.5 改"保留 + 简化"(仅 prose check 不写 verify_findings);§10.3 Task 3.2 同步改 |
| **F-6.2** 删 finding CLI 破坏 multi-harness Tier 2/3 bridge | Important | ✅ tier23-command-bridge.md:34 调 forge finding hash | §5.2 加 finding.ts 保留;§14 Q1 改答案 |
| **F-6.3** §6.1 漏 archive 自动 backlog 刷新(与 multi-harness 价值承诺冲突) | Important | ✅ 同 F-2.2 | §6.1 伪代码补 Step 9(同 F-2.2 fix) |

**统计**:Critical 6 / Important 8 / Minor 2 / 需人工验证 0(全部确证)。

**Codex review 准确率**:16/16(100%)。本轮 review 质量极高,关键 finding(F-1.1 finding-hash 13 依赖、F-2.1 legacy-bridge 耦合、F-4.1 Phase 1 顺序错、F-6.1 plan 自相矛盾)都是 user 主代理写 plan v1 时认知盲区,Codex 通过对照真实代码全部抓出。

**Plan v2 净改动**:
- §5.1 删除清单:删 finding-hash 移到保留;加 marker-ack 删除;加 schemas/archive-summary 重写
- §5.2 保留清单:加 finding.ts(multi-harness 承诺)
- §5.5 skill 清单:verifying-three-dimensions 改"保留 + 简化"
- §6.1 伪代码:加 legacy-bridge preflight/posthook + generateBacklog + 失败回滚 trade-off 说明
- §9.2 migration:删 legacy-marker-mode flag 承诺,加 pending-acks/archive-pause cache 清理步骤
- §9.3 backlog 描述修正
- §10.1 Phase 1:6 个 sub-phase(1.1-1.18),18 个 Task(原 11 个);新增 5 个 Task(marker-ack 删、archive-summary schema 重写、archive/validate barrel 清理、final grep 决定)。**v3 进一步修订**:删除顺序在 v2 仍错(Codex v2 F-4.1 + F-16.1),v3 §10.1 已彻底重排为"先重写 archive.ts 切 import → 再删模块",21 个 Task,Phase 2 缩水到 3 个收尾 Task
- §10.3 Phase 3 Task 3.2 改写
- §10.4 Phase 4 加 Task 4.5a(3 测试处理)+ 4.19a(bundled tgz 生成)
- §12 Risk:加 2 项 v2 风险
- §14 Open Questions:Q1+Q2 改答案

**进入 Phase 1 的前置**:plan v2 review 通过(本 commit)+ user 显式授权。

---

---

## §17 Codex Adversarial Review v2 — Response Log(2026-05-20)

**Review trigger**:plan v2 commit `4ec0f6c` 落地后,user msc 通过 codex:rescue agent 续 thread 跑第二轮对抗审查。Codex 输出 9 条新 finding(F-2.1 ~ F-16.1)。user 主代理逐条独立对照 forge-repo 代码核实,**确证 9/9 全为真问题**(Codex v2 review 准确率仍 100%)。Plan v3 修订针对每条 finding。

| Codex v2 Finding | Severity | 核实 | Plan v3 修订 |
|---|---|---|---|
| **F-2.1** `runArchivePreflight` 真签名 `(forgeRoot, changeId, opts)`,plan v2 写 `(changeDir, options)` | Critical | ✅ archive.ts:271/765 命中 | §6.1 伪代码 Step 2 改正确签名 + 加 `kind !== 'ok'` 退出 gate |
| **F-2.2** `runArchivePostHook` 真签名 `(forgeRoot, changeId, opts: {archiveDate, api})`,plan v2 缺 archiveDate/api | Important | ✅ archive.ts:654/861 命中 | §6.1 伪代码 Step 8 改正确签名 + 传 archiveDate / api |
| **F-2.3** forge `specs-sync/` 只 export `applyDeltas`,**缺 findSpecUpdates/buildUpdatedSpec/writeUpdatedSpec** — 这些只在 OpenSpec | **Critical** | ✅ specs-sync/index.ts 只 2 行 export;OpenSpec specs-apply.ts:57/102/353 真有 | §5.3 + §6.5 + §10.1.1 新增 Task 1.1 — **从 OpenSpec 移植** specs-apply.ts 到 forge specs-sync(~300 行) |
| **F-4.1** archive.ts 当前 import 12+ 待删模块,Task 1.11/1.12 先删→Task 1.14 才重写 → 中间 typecheck 必崩 | Critical | ✅ archive.ts:22-55 真 import transaction/lock/recover/fence/process-evidence-fence 等 | §10.1 全段彻底重排 — v3 真正顺序:Task 1.5 先重写 archive.ts → Task 1.9-1.10 再删 archive 子模块;21 个 Task 6 个 sub-phase 重新切分 |
| **F-4.2** `summary-render.ts:22/35/44` 仍读 v1 反加固字段,plan 没列入重写 | Important | ✅ 三个字段全命中 | §10.1.2 新增 Task 1.7 — 重写 summary-render.ts(81 → ~40 行) |
| **F-6.1** `subagent-driven-discipline` 是 Tier 2/3 + subagent-driven-development 硬依赖,整删破坏 multi-harness | **Critical** | ✅ tier23-command-bridge.md:27 + subagent-driven-development/SKILL.md:35-37 都引用/强制 invoke | §5.5 + §10.3 Task 3.3 改"保留 + 简化"— 留 §1 taxonomy / §2 model-tier / §3.3 decision tree,删反加固挂钩段 |
| **F-10.1** `tests/core/monitor/artifact-observer.test.ts:81-84` 仍构造 v1 反加固字段;`monitor/artifact-observer.ts:76-97/110-113` 也读 v1 路径;plan §11 monitor 列"不动"错 | Important | ✅ 3 行 fixture + 实现读 ack-log/verify_findings 命中 | §10.4 新增 Task 4.5b — 改 artifact-observer 实现 + 测试 fixture;§11 测试矩阵改 monitor 为"改写" |
| **F-12.1** plan §12 行 726 仍保留 `--legacy-marker-mode v1` flag 残留文字,与 §16 删除决定矛盾 | Minor | ✅ 行 726 真有此文字 | §12 该行改写,明确"删 flag,唯一路径就是重跑 verify/review" |
| **F-16.1** §16 自吹"§10.1 重排 6 sub-phase",但主体 Task 1.11/1.12 仍先删 archive 模块 → 重排不彻底 | Important | ✅ §16 描述与主体顺序矛盾 | §16 总结改实事求是(承认 v2 顺序仍错);§17 本节是真正的 v3 修订记 |

**统计**:Critical 4 / Important 4 / Minor 1(全部确证)。

**Codex v2 准确率**:9/9(100%)。重大 finding:F-2.3 暴露 plan v2 §6.1 整段假设"forge specs-sync 已有 OpenSpec 三 API"错(只有 applyDeltas),F-6.1 暴露 plan v2 §5.5 整删 subagent-driven-discipline 会断 Tier 2/3 调用链,F-4.1+F-16.1 暴露 plan v2 顺序重排仍不彻底(只清 barrel 不够,archive.ts 没切完 import 之前任何"先删模块"都会崩 typecheck)。

**Plan v3 净改动**:
- §5.3 + §6.5:加 specs-apply.ts 从 OpenSpec 移植(~300 行)
- §5.5:subagent-driven-discipline 改"保留 + 简化"
- §6.1 伪代码:preflight/posthook 签名修正 + Step 5 spec sync 段补正
- §10.1 全段重排:21 Task 6 个 sub-phase,先重写 archive.ts 再删模块本体
- §10.2 缩水(原 5 Task → 3 Task,marker schema 重写已前移到 Phase 1)
- §10.3 Task 3.3 改写
- §10.4 加 Task 4.5b(artifact-observer 改写)
- §11 测试矩阵 monitor 改"改写"
- §12 删 legacy-marker-mode 残留
- §16 总结字段补充承认 v2 仍错

**两轮 Codex Review 累计**:25 条 finding(v1 16 + v2 9),100% 命中率。说明 plan 文档协议复杂 + AI 主代理写 plan 时容易留盲区,跨轮迭代 review 显著降低 Phase 1 实施风险。

**第三轮 review 评估**:v3 修订后,plan 重大盲区已基本扫光(specs-sync API、subagent-driven-discipline 依赖、删除顺序、签名错位都已修)。剩余风险点:
- summary-render.ts 重写细节(F-4.2 修订后是否还有遗漏字段引用)
- artifact-observer 实现改造细节(F-10.1 修订是否漏 monitor 子系统其他文件)
- specs-apply.ts 移植后 forge 已有 `applyDeltas` 与新 `findSpecUpdates/buildUpdatedSpec/writeUpdatedSpec` 共存是否有冲突
- v3 仅纸面 plan,实际 Phase 1 实施时仍可能撞具体代码细节

**建议**:**接受 plan v3 进入 Phase 1**,实施中遇细节问题就地解决(沿 SDD 协议)。再跑第三轮 review 边际收益递减,不如 Phase 1 实施前先 grep 验证关键假设(specs-sync/index.ts barrel 现状、monitor/artifact-observer 实际逻辑)。

---

---

## §18 Codex Adversarial Review v3 — Response Log(2026-05-20)

**Review trigger**:plan v3 commit `b2a320c` 后,user msc 通过 codex:rescue 续 thread 跑第三轮对抗审查。Codex 输出 4 条新 finding(F-R3-1 ~ F-R3-4)。user 主代理逐条独立对照 forge-repo + OpenSpec 代码核实,**确证 4/4 全为真问题**(Codex v3 准确率仍 100%)。Plan v4 修订针对每条 finding。

| Codex v3 Finding | Severity | 核实 | Plan v4 修订 |
|---|---|---|---|
| **F-R3-1** OpenSpec specs-apply.ts 实际 import `requirement-blocks` + `spec-structure` + `Validator`,`SpecUpdate` ≠ `SpecDelta`,plan v3 Task 1.1 "移植三 helper 接 SpecDelta" 描述过简化 | **Critical** | ✅ OpenSpec specs-apply.ts 头 import 三模块;line 227 用 `findMainSpecStructureIssues` + `buildSpecSkeleton`;line 435 用 `Validator.validateSpecContent`;`SpecUpdate`(L24)≠ forge `SpecDelta`(deltas.ts:7) | §6.5 改 ~700-900 行真实估算;§10.1.1 Task 1.1 拆为 1.1a-1.1f 六个子任务(parsers 移植 / validator 适配 / 三 API 移植 / SpecUpdate vs SpecDelta 边界决定 / barrel 加 export) |
| **F-R3-2** §6.1 Step 6 + Step 8 各调一次 `getArchiveDate()`,跨午夜 archive 时 archiveName 与 posthook archiveDate 可能不一致 | Important | ✅ archive.ts:859 字面注释"I-2:archiveDate 由 archive 主流程透传,避免跨午夜偏一天" | §6.1 Step 6 改 `const archiveDate = getArchiveDate()` 算一次,Step 8 透传同变量 |
| **F-R3-3** subagent-driven-discipline / development 反加固引用远不止 §3.2/§4,散落 line 632/338/350/351/354/356/368/389/413 等多处 | Important | ✅ discipline:632 §6 pattern catalog 含 canonicalHash;development 多处 ack-log/validateAckLogConsistency/finding_hash/forge evidence record-tdd/process_evidence | §10.3 Task 3.3 + 3.10 改成 grep-driven rewrite,列 8 个 keyword(canonicalHash / ack-log / finding_hash / validateAckLogConsistency / forge evidence / process_evidence / three-level-fence / staging.yaml),全文 grep 0 命中才算 done |
| **F-R3-4** monitor `divergence-map.ts` 仍含 `archive-unresolved-warning` scenario("反向加固 — 强 fence 防偷懒归档"),v4 砍 fence 后 regression_signal 变错;plan §11 monitor 修订只列 artifact-observer 漏其他子模块 | Important | ✅ divergence-map.ts:91-93 字面命中 | §10.4 加 Task 4.5c — divergence-map.ts 删/改 archive-unresolved-warning scenario + 全 monitor 8 子模块 grep `ack|fence|severity_acked|verify_findings|process_evidence` 找 v3 残留清理 |

**统计**:Critical 1 / Important 3 / Minor 0(全部确证)。

**Codex v3 准确率**:4/4(100%)。**三轮累计 29 条 finding 100% 命中**。

**关键 v4 修订**:
- §6.5 + §10.1.1 Task 1.1 → 1.1a-1.1f:OpenSpec specs-apply 移植真实工作量从 ~300 行修正为 ~700-900 行(6 个子任务)
- §6.1 archiveDate 单点算一次
- Task 3.3/3.10 改 grep-driven rewrite(列 keyword)
- Task 4.5c:monitor divergence-map + 7 个其他子模块 grep 清理 v3 残留

**第四轮 review 评估**:v4 修订都是具体细节,可能仍有 monitor 8 子模块的具体行号未列、specs-apply 移植后某个 import 路径不对齐等。继续按 user 要求"直到 Critical+Important = 0"。

---

---

## §19 Codex Adversarial Review v4 — Response Log(2026-05-20)

**Review trigger**:plan v4 commit `9f3c84e` 后,user msc 要求"继续跑 codex 评审,直到 Critical 和 Important 问题为 0",续 thread 跑第四轮。Codex 输出 3 条 finding(F-R4-1 ~ F-R4-3),user 主代理逐条独立对照 forge-repo + OpenSpec 代码核实,**确证 3/3 全为真问题**(Codex v4 准确率仍 100%)。**Codex 四轮累计 32 条 finding,100% 命中率**。

第四轮 finding 抓出一个**根本性路线问题**,比前三轮所有 finding 都严重:plan v3/v4 整套"OpenSpec specs-apply 移植"方案 path 错。

| Codex v4 Finding | Severity | 核实 | Plan v5 修订 |
|---|---|---|---|
| **F-R4-1** OpenSpec delta grammar(`## ADDED Requirements`)与 forge GWT grammar(`## Scenario:`)不兼容,plan v3/v4 移植 OpenSpec specs-apply 后产生 forge validate 拒收的 spec | **Critical** | ✅ OpenSpec requirement-blocks.ts:122-125 / specs-apply.ts:374 vs forge parse/specs.ts:40 / fixture login.md / deltas.ts:17 实证 | **§5.3 + §6.5 + §10.1.1 Task 1.1 整套删除**(7 子任务 ~700-900 行移植任务全删);改用 forge 现有 `readDeltas + applyDeltas` 整文件 create/replace |
| **F-R4-2** OpenSpec `buildSpecSkeleton` 生成 `## Requirements` 结构,forge `validateSpec` 找不到 `## Scenario:` H2 → 拒;F-R4-1 + F-R4-2 双重阻塞 | Important | ✅ specs-apply.ts:374 + validate/specs.ts:21 | 同 F-R4-1 fix(走 path B 后此 finding 自动消失) |
| **F-R4-3** §10.1 头行残留 "移植 ~300 行" 与 §6.5/§18 已修正的 ~700-900 行不一致 | Minor | ✅ plan v4 行号实证 | §10.1 头行改为 "v5 后无移植代码,Phase 1 工作量净减"(path B 简化) |

**统计**:Critical 1 / Important 1 / Minor 1(全部确证)。

**Codex v4 准确率**:3/3(100%)。

**关键 v5 修订 — Path B 决策**:
- 用户原选项 (a) "从 OpenSpec 移植" 基于错误假设(以为 grammar 兼容),实际 OpenSpec delta grammar 与 forge GWT grammar 完全不兼容,移植后产物失效
- 唯一可行 path B:**保留 forge 现有 `specs-sync/{apply,deltas,index}.ts` 不变,archive 主流程调 `readDeltas + applyDeltas`** — 等同 forge v3.x 实际运行方式
- 失去 OpenSpec 的 fine-grained delta merge 能力,但 forge change 一般 capability 粒度写整 spec 文件,整文件 create/replace 够用
- Plan v5 净改:Phase 1 工作量**减少**(取消 7 个 OpenSpec 移植子任务),archive.ts 重写更简单(用现有 API)

**累计 Codex Review 统计**:
- v1 16 条(plan v1 → v2)
- v2 9 条(plan v2 → v3)
- v3 4 条(plan v3 → v4)
- v4 3 条(plan v4 → v5)
- **总计 32 条 finding,100% 命中率**

**第五轮 review 预期**:plan v5 走 path B 大幅简化 specs-sync 部分,剩余可能 finding 多是细节(§19 自身描述 / monitor 8 子模块清理范围 / archive_summary v2 schema 字段 list),Critical 概率显著降低。继续按 user 要求"直到 Critical+Important = 0"。

---

---

## §20 Codex Adversarial Review v5 — Response Log(2026-05-20)

**Review trigger**:plan v5 commit `518f9bf` 后,user msc 要求"继续到 C+I = 0",续 thread 跑第五轮。Codex 输出 4 条 finding(F-R5-1 ~ F-R5-4),全部关于 **plan 内部一致性问题**(v5 修订漏掉的描述同步)。user 主代理逐条核实,**确证 4/4 全为真**。

| Codex v5 Finding | Severity | 核实 | Plan v6 修订 |
|---|---|---|---|
| **F-R5-1** Task 1.5 描述仍写"用移植的 OpenSpec API + findSpecUpdates / buildUpdatedSpec / writeUpdatedSpec(Task 1.1 已移植)",与 v5 Path B 决定矛盾 | **Critical** | ✅ plan v5:658 真有此残留 | Task 1.5 改写为"用 forge 现有 readDeltas / applyDeltas / type SpecDelta + archive.ts 内本地 helper" |
| **F-R5-2** §6.1 Step 5 调 `printDeltasSummary(deltas)`,全仓无此函数;Path B "无新增代码" 描述不准 | Important | ✅ grep src/ 0 命中 | Step 5 改 `renderDeltasSummary`;§6.1 + Task 1.5 注明 "archive.ts 内本地 helper ~10 行";澄清 Path B "无新增代码" 仅指 `specs-sync/` 不变,archive.ts 内仍 ~50-70 行本地 helper |
| **F-R5-3** §6.4 archive_summary 用 OpenSpec `{added, modified, removed, renamed}`,forge applyDeltas operation 是 `create/replace/delete` | Important | ✅ plan:485 + deltas.ts:11 实证 | §6.4 改字段为 forge `operation: 'create' \| 'replace' \| 'delete'` 风格 |
| **F-R5-4** §6.5 行号引用 archive.ts:518-525,实际是 transaction.ts:159-160;§12 风险仍提 buildUpdatedSpec 部分失败,Path B 已无 | Minor | ✅ 实际调用在 transaction.ts:159-160 | §6.5 行号修正;§12 风险描述同步 `applyDeltas` 部分失败 |

**统计**:Critical 1 / Important 2 / Minor 1(全部确证)。

**Codex v5 准确率**:4/4(100%)。

**累计 Codex Review 统计**:
- v1 16 / v2 9 / v3 4 / v4 3 / v5 4
- **总计 36 条 finding,100% 命中率**

**v5 finding 性质**:全部是 plan v5 修订时漏掉的描述同步(Task 1.5 描述未跟 Path B 同步、§6.4 字段风格未对齐、引用行号过时)。代码层 path 已稳,剩余多是文档同步问题。

**第六轮 review 预期**:v6 修订都是机械文字同步,新引入隐患概率极低;但 plan v6 总行数已 1020+,可能仍有 Codex 此前未触及的小问题(例如 §10.4 Task 4.X 编号未连续 / §11 测试矩阵某行表述与代码现状有微小漂移)。继续按 user 要求"直到 Critical+Important = 0"。

---

---

## §21 Codex Adversarial Review v6 — Response Log(2026-05-20)

**Review trigger**:plan v6 commit `87adaf2` 后,user msc 要求"继续到 C+I = 0",续 thread 跑第六轮。Codex 输出 4 条 finding(0 Critical / 2 Important / 2 Minor)— **Critical 首次 = 0**!但 Important 仍 2,user 要求严格 C+I=0 → 继续。

| Codex v6 Finding | Severity | 核实 | Plan v7 修订 |
|---|---|---|---|
| **F-R6-1** §6.1 用 `class ArchiveCommand` 风格,与 forge CLI 实际 `buildArchiveCommand(): Command` 工厂模式矛盾 | Important | ✅ archive.ts:87 + index.ts:10/46 实证 | §6.1 加 v7 disclaimer:伪代码 class 风格仅可读性,真实实现用 `buildArchiveCommand()` 工厂 + commander `.action(async ...)` 入口 |
| **F-R6-2** §6.1 调 `buildSimplifiedSummary`,但 forge 实际 export `buildArchiveSummary`(summary-builder.ts:52)— 名字 mismatch | Important | ✅ grep 实证 | §6.1 + Task 1.6 改用 `buildArchiveSummary(opts: { archivePath, changeId, verifyMarker, reviewMarker, deltas })` |
| **F-R6-3** §10.1 头行残留"OpenSpec API 移植"描述,与 Path B 决定矛盾 | Minor | ✅ plan v6 行 646/653 实证 | §10.1 头行改"Path B 准备:简版 marker / archive-summary schema 草案到位" |
| **F-R6-4** §11 测试矩阵漏 `tests/core/specs-sync.test.ts`,Path B 核心依赖应明示保留 | Minor | ✅ 文件实存,矩阵无 | §11 加 specs-sync.test.ts 行 |

**关闭 v5 finding**(Codex v6 显式确认):
- F-R5-1/2/3/4 全部 closed in v6

**统计**:Critical 0 / Important 2 / Minor 2(全部确证)。

**Codex v6 准确率**:4/4(100%)。

**累计 Codex Review 统计**:
- v1 16 / v2 9 / v3 4 / v4 3 / v5 4 / v6 4
- **总计 40 条 finding,100% 命中率**

**重要里程碑**:**v6 是 Critical 首次 = 0**(进度)。剩余 Important 2 都是 plan 文档与 forge CLI 现有契约对齐细节(class vs 工厂、function name mismatch),v7 已修。

**第七轮 review 预期**:v7 修订都是机械文字同步。如果 v7 抓 0 Critical/Important,plan **ready for Phase 1**。

---

---

## §22 Codex Adversarial Review v7 — Response Log(2026-05-20)

**Review trigger**:plan v7 commit `9678794` 后,user msc 要求"继续到 C+I = 0",续 thread 跑第七轮。Codex 输出:**v6 4 条全 PASS**(F-R6-1 ~ F-R6-4 closed)+ 新 1 条 Important(F-R7-1)。

| Codex v7 Finding | Severity | 核实 | Plan v8 修订 |
|---|---|---|---|
| **F-R7-1** §6.1 伪代码用 `options.yes` / `options.skipSpecs`,但 Task 1.5 没声明新增这俩 CLI flag;forge 当前 archive 也无(只有 OpenSpec 有) | Important | ✅ archive.ts:92-103 + OpenSpec archive.ts:53/197 实证 | Task 1.5 + §9 Migration:**显式新增 `--yes` + `--skip-specs` CLI flag**(沿 OpenSpec 风格);**删** `--recover` / `--resume-summary` / `--resume`(transaction 中断恢复消亡);保留 `--force` + `--api` |

**统计**:Critical 0 / Important 1 / Minor 0(全部确证)。

**Codex v7 准确率**:1/1(100%)。

**累计 Codex Review 统计**:
- v1 16 / v2 9 / v3 4 / v4 3 / v5 4 / v6 4 / v7 1
- **总计 41 条 finding,100% 命中率**

**进度**:Critical 已稳 0(连续两轮 v6+v7);Important 从 v6 的 2 降到 v7 的 1。v8 修订是机械 CLI flag 扩展,无新 architectural 风险。

**第八轮 review 预期**:F-R7-1 是 plan 与 forge CLI 现有 option 契约对齐细节;v8 修订后,plan 应已达到 user 要求"C+I = 0",**进入 Phase 1**。

---

---

## §23 Codex Adversarial Review v8 — Response Log(2026-05-20)

**Review trigger**:plan v8 commit `24c562d` 后跑第八轮。Codex 输出:F-R7-1 PARTIAL closed(主体修了但 §6.1 `noValidate` 未对齐)+ 新 1 条 F-R8-1 Important + 0 Critical。

| Codex v8 Finding | Severity | 核实 | Plan v9 修订 |
|---|---|---|---|
| **F-R8-1** §6.1 用 `options.noValidate` 但 Task 1.5 / §9.4 没列此 flag,CLI option contract 不闭合 | Important | ✅ plan:294 真有 `!options.noValidate` 分支,Task 1.5 / §9.4 未列 | 选项 A:**删 §6.1 noValidate 分支,archive 永远 validate**(沿 B1 严格精神,spec validate 非反加固 fence,无需 skip 路径)|

**统计**:Critical 0 / Important 1 / Minor 0(全部确证)。

**Codex v8 准确率**:1/1(100%)。

**累计 Codex Review 统计**:
- v1 16 / v2 9 / v3 4 / v4 3 / v5 4 / v6 4 / v7 1 / v8 1
- **总计 42 条 finding,100% 命中率**

**进度**:Critical 连续 3 轮稳 0(v6/v7/v8);Important 趋势 v6:2 → v7:1 → v8:1。v9 修订是最小机械改动(删一个 if 分支),plan 应已稳定。

**第九轮 review 预期**:F-R8-1 是 CLI option contract 闭合细节;v9 修订后 plan 应达到 user 要求 "C+I = 0"。**进入 Phase 1**。

---

---

## §24 Codex Adversarial Review v9 — Response Log(2026-05-21)

**Review trigger**:plan v9 commit `c29b314` 后跑第九轮。Codex 输出:F-R8-1 CLOSED + 新 1 条 F-R9-1 Important + 0 Critical。

| Codex v9 Finding | Severity | 核实 | Plan v10 修订 |
|---|---|---|---|
| **F-R9-1** §9.4 `forge finding` 写"评估 — 若仅依赖则删",与 §5.2 / §14 已定的"保留"矛盾(plan 内部不一致) | Important | ✅ §9.4:641 / §5.2:181 / §14:866 + tier23-command-bridge.md:34 实证 | §9.4 一行改"保留 — multi-harness 依赖" |

**统计**:Critical 0 / Important 1 / Minor 0(全部确证)。

**Codex v9 准确率**:1/1(100%)。

**累计 Codex Review 统计**:
- v1 16 / v2 9 / v3 4 / v4 3 / v5 4 / v6 4 / v7 1 / v8 1 / v9 1
- **总计 43 条 finding,100% 命中率**

**第十轮 review 预期**:F-R9-1 是 plan 内部一行矛盾;v10 修订后 plan 应达 C+I = 0,**进入 Phase 1**。

---

**Plan 结束(v10)**。Review 后请确认是否进入 Phase 1。
