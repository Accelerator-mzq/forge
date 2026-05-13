---
description: 读 tasks.md 派子代理实施每个 task,顺序模式或 --parallel 模式
argument-hint: '[--parallel] [--change-id <id>]'
---

You are about to handle `/forge:apply $ARGUMENTS`.

解析:

- 默认:顺序模式(主工作区直接跑)
- `--parallel`:并行模式(每个独立 task 一个 worktree;遵循 forge:dispatching-parallel-agents 的 cherry-pick 串行协议)
- `--change-id <id>`:指定 change(默认为 `forge/changes/` 下唯一未归档的 change;若 >1,**报错并停止**列出选项)

## 步骤

1. **必须调用 `forge:subagent-driven-development` skill**(无 inline 模式)。
2. **必须调用 `forge:test-driven-development` skill** 作为每个 subagent 的实施纲领。
3. 若 `--parallel`,**追加调用 `forge:dispatching-parallel-agents` 和 `forge:using-git-worktrees`**。
4. 读 `forge/changes/<id>/tasks.md`,识别未勾选 tasks。
5. **顺序模式**:
   - for each task:派 fresh subagent(主工作区),subagent 拿 [task + 相关 specs/<sub-area>.md + design.md] 启动
   - subagent 跑 TDD:red → green → refactor + git commit
   - 主代理 review subagent 的 commit + test 日志,通过则在主工作区 tasks.md 把 `[ ]` 改 `[x]`
6. **--parallel 模式**:严格遵守 cherry-pick 串行协议(详 forge:dispatching-parallel-agents skill 的"forge --parallel 模式 cherry-pick 串行协议"段)
7. 全部 task 完成后,在 tasks.md 末尾追加(parallel 多 commit 用列表):
   ```yaml
   applied_commits:
     - <task-id-1>: <commit-hash>
     - <task-id-2>: <commit-hash>
   final_head: <git rev-parse HEAD>
   ```

## Fluid Pause Decision Point(v1.0,沿 design §2.1)

> **与 `/forge:explore` 边界提示**(沿 design §2.5.5 + plan-9f):Fluid Pause 是**被动**触发(subagent 报告阻塞型 issue 时主代理进入);若是**开放思考**(非阻塞 issue,如"实施途中想重新评估某个 design 决策"),应主动触发 `/forge:explore --change <id>` 而非 Fluid Pause。两者边界详见 `forge:exploring` skill 的"与 §2.1 Fluid Pause 边界"段。

### 触发条件

subagent 在 apply 中段报告以下三档之一时,主代理**不直接处理**,改进 Fluid Pause:

| Subagent 报告                                                                                                                         | 主代理行为                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `DONE_WITH_CONCERNS`,concerns 类型 = "correctness or scope"(非 CRITICAL)                                                              | 进 Fluid Pause                                                |
| `BLOCKED` 第 4 项 = "plan itself is wrong"                                                                                            | 进 Fluid Pause                                                |
| `DESIGN_ISSUE_FOUND`(v1.0 新增第 5 档,沿 subagent-driven-development SKILL.md)— subagent 实施中发现属于本 change 但 spec 未覆盖的需求 | 进 Fluid Pause                                                |
| **任一 CRITICAL 级问题**(测试 fail / hash mismatch / evidence 丢)                                                                     | **不进 Fluid Pause** — 走 forge 强 fence 拒签(保留 v0.4 行为) |

### 协议流程

```
subagent 报告 → 主代理判定 severity(CRITICAL / WARNING / SUGGESTION,沿 design §2.3)
              ↓
              CRITICAL? → yes → 走 forge 强 fence 拒签(原 v0.4 行为)
                       → no  → AskUserQuestion 四选项
                                ↓
                                用户选择
                                ↓
                                1=扩本 change scope → 更新 proposal `## What Changes` + subagent 重派
                                2=加 task 进本轮 → 主代理 append 新 task 到 tasks.md + subagent 重派
                                3=转 out-of-scope → 写到 proposal `## Out of Scope` / design `## Future Work` YAML 块(沿 §2.6)+ subagent 跳过 issue 继续
                                4=Other → 用户自由文本描述(必须配 other_rationale + other_acked_by)
                                ↓
                                marker `pause_decisions` YAML 字段记录(沿 design §2.1.5)
```

### AskUserQuestion 模板

主代理调 AskUserQuestion(harness 不支持时降级为终端 [1]/[2]/[3]/[4] prompt):

```
## Implementation Paused

**Change:** <change-id>
**Task:** <task-id>(<task-summary>)
**Progress:** N/M tasks complete

### Issue Encountered
<subagent 报告的 issue 描述,从 DONE_WITH_CONCERNS / BLOCKED concerns 字段或 DESIGN_ISSUE_FOUND payload 提取>

**Severity:** WARNING | SUGGESTION(主代理初判,沿 design §2.3 分级;CRITICAL 不进本流程)

**Options:**
1. **扩本 change scope** — 把这个 issue 纳入本 change。更新 proposal `## What Changes` 段,重新派 subagent 实施。代价:本 change scope 增大,需要重 review
2. **加 task 进本轮 tasks.md** — 当成新发现的本 change 必做项。主代理 append 新 task 到 tasks.md,subagent 重派实施。等同 v0.4 行为
3. **转 out-of-scope**(仅限 issue 不阻断本 task 时可用) — 不在本 change 做,写到 proposal `## Out of Scope` 或 design `## Future Work` 段(YAML 结构化字段,沿 §2.6)。subagent 跳过该 issue 继续当前 task。**v1.1 backlog registry 会从这里读**
4. **Other** — 自由文本描述。必须配 `other_rationale` + `other_acked_by`(用户在 marker 之外的某处确认)

What would you like to do?
```

### Marker 持久化(沿 design §2.1.5)

主代理在用户作出决策后,**必须**在 `.verify-passed` / `.review-passed` marker 的 `pause_decisions` 数组追加一项:

```yaml
pause_decisions:
  - id: 1 # 同一 marker 内唯一
    paused_at: 2026-05-12T14:30:00Z # ISO 8601 UTC
    task_ref: tasks.md#task-3 # 关联 task
    issue_summary: 'subagent 发现 specs 没覆盖 OAuth refresh token 过期处理'
    severity: WARNING # 主代理初判(CRITICAL 不进本流程)
    severity_acked_by: msc # WARNING 必须;SUGGESTION 允许 null
    severity_acked_at: 2026-05-12T14:32:00Z
    chosen_option: 3 # 1=扩 scope / 2=加 task / 3=转 out-of-scope / 4=Other
    target_artifact: proposal.md # option=1=proposal.md;option=2=tasks.md;option=3=proposal.md|design.md
    target_anchor: '## Out of Scope' # marker 记录写到哪个段
    non_blocking_rationale: 'subagent 可跳过该 issue 完成本 task 主体功能' # option=3 必填
    other_rationale: null # option=4 必填
    other_acked_by: null # option=4 必填
```

### Fence 校验(`forge archive` 阶段,本协议反向加固点)

`forge archive` 跑 `validatePauseDecisionsFence`(沿 design §2.1.5)— 任一违反拒签 exit 1:

- CRITICAL severity → 拒签(CRITICAL 应走 forge 强 fence,不应进 pause)
- WARNING + (severity_acked_by 空 ∨ severity_acked_at 空)→ 拒签
- option=1:`target_artifact='proposal.md'` + `target_anchor` 含 `What Changes`
- option=2:tasks.md 中 `task_ref` 末段对应的行已勾选 `[x]`
- option=3:proposal/design YAML 块含对应 entry.id + `non_blocking_rationale` 非空
- option=4:`other_rationale` + `other_acked_by` 非空

## 与其他 sub-plan 合并点

本 §"Fluid Pause Decision Point" 段(plan-9c)与后续 sub-plan 在 apply.md 有合并点(参考 master plan §3.3 line 272):

- **9h(SDD 实施前置纪律加固)**:将在步骤 0 加 `forge preflight branch-check` 调用 + 步骤 3.5 加 §"Critical Plan Review";9c 不动这些位置
- **9g(process_evidence)**:将在每个 subagent task 完成后加 `forge evidence record-tdd` helper 调用;9c 不动这些位置
- **推荐 merge 顺序**:9h → 9c → 9g

## 禁止行为

- 不允许主代理直接写代码 — 所有 task 实施必须通过 subagent
- 不允许 subagent 改 tasks.md(写入是主代理单点串行职责)
- 不允许跳过 TDD 的 red 步骤(verify 阶段会发现并 append 修复 task)

## 禁止行为(plan-9g §2.7 process_evidence 协议)

✗ **不允许绕过 forge evidence helper 直接写 process_evidence 字段**:

- 不允许 `fs.writeFile .verify-passed` 或 `.review-passed` 含 process_evidence 字段
- 不允许拼接 YAML 字面塞 process_evidence 到 marker
- 不允许直接编辑 `.evidence/process-evidence.staging.yaml`

✓ **必须**通过 helper 写入:

- `forge evidence record-tdd <changeId> --task ... --red-commit ... --green-commit ... ...`(20 options)
- `forge evidence record-verify <changeId> --task-refs ... --scope ... --report ...`
- `forge evidence record-review <changeId> --task ... --implementer-commit ...`
- `forge evidence freeze <changeId> --kind verify|review`(在 marker YAML 写完后调,统一凝固)

详细 process_evidence 协议见 `skills/process-evidence/SKILL.md`。
