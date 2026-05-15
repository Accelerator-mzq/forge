---
description: 调 forge archive CLI 把 change 移到 archive/、内部 sync specs/、严格校验 verify+review 标记
argument-hint: '<change-id> [--force] [--recover]'
---

You are about to handle `/forge:archive $ARGUMENTS`.

## 步骤

本命令是 CLI 的薄包装。直接执行:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" archive $ARGUMENTS
```

(plugin helper 内部 spawn npx 拉 forge CLI,避开 v0.2 P1 全局 PATH 问题。OpenCode/Codex 路径下 commands.md 不可用,走 skill 内嵌路径 — 见 Plan 3 Task 3.3 + skills/finishing-a-development-branch/SKILL.md。)

## v1.0 三级分级行为(plan-9e1 落地)

archive 阶段在 verify+review marker 严格校验之外,再叠加"三级业务行为"裁决(沿 design §2.4.2):

| 状态                                                             | archive 行为                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| 全 resolved=true                                                 | 通过                                                         |
| CRITICAL resolved=false                                          | **拒签**(无 ack 出口,exit 1)                                 |
| WARNING resolved=false + `severity_acked_by` 非空 + ack-log 匹配 | 通过(标 acked-warning archive,handoff 列入 `acked_warnings`) |
| WARNING resolved=false + `severity_acked_by` 空                  | **拒签**(exit 1)                                             |
| SUGGESTION resolved=false(无论 ack 与否)                         | **通过**(标 pending-suggestion archive,handoff to backlog)   |

**强 fence 优势保留**:CRITICAL 永远拒签,无 `--force` 出口(`--force` 仍只覆盖 v0.4 那两类降级 — human-override / 非 git;不扩展到 CRITICAL,沿 design §2.4.6)。

`review_outcomes` 端简码 S/C/L 迁移规则(v4 BLOCKER 1 + MAJOR 1 修订,沿 design §2.3.5 line 553-563):

| v0.4 简码          | v1.0 映射             | archive 行为                                                                                                    |
| ------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `S`(critical)      | `CRITICAL` 直接映射   | `S + resolved=false` 拒签;`S + resolved=true` 通过                                                              |
| `L`(low)           | `SUGGESTION` 直接映射 | `L + resolved=false` 通过(进 pending_suggestions);`L + resolved=true` 通过                                      |
| `C`(clarification) | **不自动映射**        | **任何状态**(resolved/accepted/rationale)**全拒签**;必须等 plan-9j 完成跑 `forge upgrade --resign-markers` 迁移 |

**重要**:`review_outcomes` 端不存在"`accepted=true + rationale 非空` 等价 ack"路径(v2 文档错误,v4 MAJOR 1 修订删除)— ReviewOutcome 接口本身无 `severity_acked_by` 字段;WARNING ack 必须经 verify_findings 端 CLI ack-log 协议(沿 design §2.3.3)。

## archive_summary 输出(plan-9e1 落地)

archive 成功后,**新增产物**:`forge/changes/archive/YYYY-MM-DD-<id>/archive_summary.yaml`(给 v1.1 backlog index 入参)。

完整 schema 见 [`src/core/schemas/archive-summary.ts`](../src/core/schemas/archive-summary.ts);9 顶级字段:

- `schema` literal `forge-archive-summary/v1`
- `version` semver
- `archived_at` ISO 8601 UTC
- `change_id` 字符串
- `verify_passed` / `review_passed` 摘要
- `process_evidence_summary`(9e1 placeholder → 9e2 真实统计,沿 plan-9g 14 不变量):
  - `placeholder: false`
  - `invariants_passed: number`(经 mapper 优先级筛选后仍为 status='pass' 的 invariant 数)
  - `invariants_with_warning: number`(WARNING 经 fail/legacy-skip 优先级筛选后仍保留为 status='warning' 的数;legacy 路径下被豁免 invariant 的 WARNING 不计入,沿 master §3.4.4.1 精度损失)
  - `invariants_failed: number`(v1.0 永远 = 0;fence.ok=false 时 archive 直接 exit 1,summary 不写入)
  - `legacy_exempt: number`(`process_evidence_unavailable_legacy: true` 路径下被豁免的 invariant 数;legacy 路径恒 = 10,非 legacy 恒 = 0;flag 取自 verify || review 任一为 true)
  - 不变式:`invariants_passed + invariants_with_warning + invariants_failed + legacy_exempt === 14`(沿 plan-9g FENCE_INVARIANT_NAMES.length)
- `handoff_to_backlog` 三类聚合(SUGGESTION 持挂 + pause_decisions chosen_option=3 + scope-entries active)
- `acked_warnings`(WARNING + ack 的引用,给用户回顾)
- `pending_suggestions`(SUGGESTION + resolved=false 引用,handoff 子集)

archive 成功后 stdout 渲染段(沿 design §2.4.4 模板):

```
## Archive Complete

**Change:** <change-id>
**Archived to:** forge/changes/archive/<archive-id>/
**Specs:** ✓ Synced
**Security:** [process_evidence:passed=3/warning=1/failed=0/legacy=10]

### Acknowledged Warnings (N)
- [WARNING] verify_findings#<id> (<dimension>/<check_type>)
  Evidence: ...
  Acked by: <user> at <iso>
  Rationale: ...

### Pending Suggestions (M) — recorded in archive_summary
- [SUGGESTION] verify_findings#<id> (<dimension>/<check_type>)
  Source: ...
  Recommendation: ...

Review handoff details: cat forge/changes/archive/<archive-id>/archive_summary.yaml
Cross-change backlog: run `forge backlog list` (see forge/backlog/)
```

## --resume-summary 用法(plan-9e1 落地,罕见状态)

设计语义:archive 流程"Move 完成 + 在 archive 目录把 `.tmp` rename 为正式名时失败"是极罕见状态(同目录 rename 几乎不会失败)。若发生:

```bash
forge archive --resume-summary 2026-05-12-add-x
```

行为:

- archive 目录有 `.tmp` 无正式 `.yaml` → rename(exit 0)
- 两者都存在(冲突,无法判断 ground truth)→ 拒签 exit 1(用户手动检查后删一个再重跑)
- 两者都不存在 → 报错 exit 1(状态损坏 / 该 archive 从未生成 summary)

`forge validate <change-id>` 会扫描 active change 目录是否残留孤立 `archive_summary.tmp.yaml`,残留时给 WARNING 提示走 `--resume-summary` 或手动 `rm`。

## CLI 行为说明(给 AI 理解,不要重复实现)

1. **加进程锁** `forge/.cache/archive.lock`(防止并发)
2. **校验 verify-passed + review-passed 标记存在且合法**:
   - YAML 解析成功 + `schema` 字段值 = `forge-verify/v1` 或 `forge-review/v1`
   - 重算 `tasks_hash` / `content_hash` 必须等于 marker 字段值
   - 重算 git.head + git.diff_hash 必须等于(`is_git_repo: true` 时)
   - `verified_by`/`reviewed_by` 取值 ∈ `{ai-agent, human-override}`
3. **`--force` 接受这两类降级**:
   - `verified_by`/`reviewed_by` = `human-override`
   - `is_git_repo: false`(非 git 项目)跳过 git 字段
4. **`--force` 不覆盖**(任一不一致 archive 拒绝):
   - tasks_hash/content_hash 不一致(标记过期或被篡改)
   - evidence log 文件缺失 / log_hash 不匹配 / pass ≠ true
   - review_outcomes 中 accepted=true 但 resolved=false
   - **CRITICAL finding 未 resolve**(三级 fence 强不变量,无 ack 出口;沿 plan-9e1 §三级行为表)
   - **WARNING finding 未 resolve 且缺 ack**(用户必须显式 ack `severity_acked_by`)
5. **archive 顺序原子化**(沿 design §2.4.5 + spec §3.5):
   - Move 前先写 `archive_summary.tmp.yaml` 到 source 目录
   - Move(rename change → archive)
   - rename `.tmp` → 正式 `archive_summary.yaml`
   - Backup specs/
   - Sync specs/
   - 任一阶段失败按 §2.4.5 表回滚
6. **`--recover` 子模式**:扫描半归档状态(case A/B/C)并修复(沿 v0.4)
7. **`--resume-summary <archive-id>` 子模式**(plan-9e1):处理 archive 目录半完成 `.tmp` rename(rename ok / 双份冲突拒签 / 状态损坏报错)

## 禁止行为

- 不允许手工实现 Move/Sync/Rollback 原子化步骤(那是 CLI 内部实现;AI 只调 CLI,不重现 CLI 行为)
- 不允许在 archive 失败时绕过 verify+review 标记直接 mv 文件
- 不允许在 `--force` 不被允许的场景(如 hash 不匹配)主动加 `--force` 试图绕过

## AI 后续行为

archive 成功后,**调用 `forge:finishing-a-development-branch` skill** 提示用户做 git 层面的合并/PR/清理决策。

## 与其他 sub-plan 合并点(参考 master plan §3.5)

本文件由多个 sub-plan 共同维护:

- **9e1**(本文件落地):三级分级行为表 + archive_summary 输出格式 + --resume-summary 用法
- **9e2(已完成,plan-9e2)**:`process_evidence_summary` 字段从 placeholder 接 plan-9g 实施的 14 不变量真实统计(4 字段计数:passed / with_warning / failed / legacy_exempt;sum 不变式 = 14)
- **9g**(process_evidence):在"archive 顺序原子化"步骤中加入 worktree 重跑 + 结构化 reporter parsing(注:9g 实施时 **不动** 9e1 的 .tmp / rename / 三级 fence 步骤,只在 verify markers 阶段之前插入 worktree 阶段)

merge 顺序推荐:**9e1 → 9g → 9e2(已完成全链)** — 14 不变量真实统计已接入,placeholder 路径仅 plan-9e1 backward-compat 兼容保留

## C 简码迁移协议(plan-9e1 v4 BLOCKER 1 落地 + plan-9j v2 解锁)

`review_outcomes[i].severity = 'C'`(v0.4 clarification 简码)在 v1.0 三级体系中**不直接对应**;archive 阶段会**硬拒签**。

**plan-9j 落地完成后**:用户工作流解锁路径:

1. 跑 `forge upgrade --resign-markers <change-id>` — 若含 C 简码,exit 1 + 写 pending file
2. 跑 `forge ack confirm <change-id> <findingId> --target-severity <WARNING|SUGGESTION>` — user 判定目标 severity
3. 重跑 `forge upgrade --resign-markers <change-id>` — confirm 后 marker `severity` 字段改回全名,archive 通过

**plan-9j 未完成时**(本 plan 实施期间):archive 含 C 简码 marker 仍是阻塞性硬墙(无 manual edit 出口,沿 v4 BLOCKER 1 三道墙)。

## exit code 遗留声明(plan-9e1 v3 MAJOR 1 / v5 MINOR 3 修订:口径统一)

`forge archive` 各路径 LockHeldError 的 exit code:

| 路径                                                         | exit code | 说明                                                                                                                                                                                                               |
| ------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `forge archive <id>`(主路径)                                 | 5         | v0.4 遗留 — **master §3.12.3 将由 plan-9e1 Task 6 Step 4-pre 加 known limitation 注脚**(实施时落地;plan v7 阶段 master 仍是 freeze 表无注脚);由后续 sub-plan(候选:9z release / 单独 cleanup plan)统一全路径 exit 2 |
| `forge archive --recover`                                    | 5         | 同上 v0.4 遗留                                                                                                                                                                                                     |
| `forge archive --resume-summary <archive-id>`(plan-9e1 新增) | **2**     | 对齐 master §3.12.3 freeze                                                                                                                                                                                         |

**v5 口径统一(v10 措辞收干)**:不再说 "9e1 不修留 GH issue 跟进"(原 v3 措辞);改为 reflection **将由 Task 6 Step 4-pre 实施时落到** master plan(沿 v5 选项 C 修订;**实施 plan 阶段** master 仍是 freeze 表无注脚,Task 6 Step 4-pre 实施完成后 master 加 known limitation 注脚)。后续 sub-plan(9z release / cleanup plan)接 master notation 统一全路径 exit 2。

## backlog 产物(plan-backlog-registry)

archive 成功后,CLI 自动重生成项目级 backlog 注册表 `forge/backlog/{active.md,archived.md}`(跨所有 archived change 聚合未决 scope-entry;首次生成时附带 `README.md`)。backlog 生成失败**不回滚 archive**(archive 主流程已成功,backlog 是衍生产物),仅 stderr WARNING + 提示手动跑 `forge backlog`。详见 `forge backlog` 子命令(`forge backlog` 重生成 / `forge backlog list` 查询 / `forge backlog --check` CI staleness 守门)。
