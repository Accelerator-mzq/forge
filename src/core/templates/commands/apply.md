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

0. **前置 branch-check**(plan-9h §2.8.3 C):调 `forge preflight branch-check <change-id>`
   - exit 0 → 继续步骤 1
   - exit 2 → **必须停下**,按 stderr 建议切 feature branch(`git checkout -b feature/<change-id>`)或显式传 `--allow-protected-branch`(后者需用户确认 build/CI 风险)
   - 非 git 项目:helper 自动跳过 exit 0(沿 v0.4 graceful 降级)
1. **必须调用 `forge:subagent-driven-development` skill**(无 inline 模式)。
2. **必须调用 `forge:test-driven-development` skill** 作为每个 subagent 的实施纲领。
3. 若 `--parallel`,**追加调用 `forge:dispatching-parallel-agents` 和 `forge:using-git-worktrees`**。

3.5. **Critical Plan Review**(主代理 dispatch subagent 前必做,沿 design §2.8.3 A):

主代理读 `forge/changes/<id>/{proposal, design, tasks, specs/*}.md` 全套,**按 4 类维度逐条检查**(不允许 vague pass-through,沿反向加固):

| 维度   | 检查问题                                                            |
| ------ | ------------------------------------------------------------------- |
| 完整性 | tasks 是否覆盖 specs 所有 requirement?(对照 specs requirement 计数) |
| 顺序   | tasks 依赖关系是否合理?(标 dependency 的 task 是否先于被依赖)       |
| 清晰度 | 是否有 tasks 描述 vague(如"处理边界情况" / "加测试")?               |
| scope  | 是否有 tasks 应该是 §2.6 out-of-scope 而非本 change?                |

- **若有 concerns** → AskUserQuestion 列 concerns,等用户决策:
  - 改 plan(回 propose 修)
  - 接受当前 plan(继续 dispatch)
  - 走 §2.5 explore 重新评估
- **无 concerns** → 主代理**必须显式输出 4 类维度的结论**(可以是"无问题"但按维度逐条说),然后进步骤 4 dispatch

**反向加固**:Critical Plan Review **不允许 vague pass-through** — 主代理必须显式输出 4 类检查结果(可以是"无问题"但必须按维度逐条说),不允许跳过整段 review。

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
                       → no  → 主代理调 `forge pause-capture <change-id> --task <triggering-task-ref> --issue "<summary>"`
                                (捕获 pause 时刻 tasks.md 状态进 ack-log hash-chain;记下 stdout 返回的 capture_id)
                                ↓
                                AskUserQuestion 四选项
                                ↓
                                用户选择
                                ↓
                                1=扩本 change scope → 更新 proposal `## What` + subagent 重派
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
1. **扩本 change scope** — 把这个 issue 纳入本 change。更新 proposal `## What` 段,重新派 subagent 实施。代价:本 change scope 增大,需要重 review
2. **加 task 进本轮 tasks.md** — 当成新发现的本 change 必做项。主代理 append 新 task 到 tasks.md,subagent 重派实施。等同 v0.4 行为
3. **转 out-of-scope**(仅限 issue 不阻断本 task 时可用) — 不在本 change 做,写到 proposal `## Out of Scope` 或 design `## Future Work` 段(YAML 结构化字段,沿 §2.6)。subagent 跳过该 issue 继续当前 task。**v1.1 backlog registry 会从这里读**
4. **Other** — 自由文本描述。必须配 `other_rationale` + `other_acked_by`(用户在 marker 之外的某处确认)

What would you like to do?
```

### Marker 持久化(沿 design §2.1.5)

**Lifecycle 说明**(本 fix 补缺):pause 决策**实际写入** `.verify-passed` / `.review-passed` marker 是在 **verify / review 阶段**(那时 marker 才真正打;沿 `commands/verify.md` step 4.3 + `commands/review.md` step 7);apply **中段** marker 尚不存在,AI 主代理把每次 pause 决策**累积记录在本 change session context** 中,等到 verify / review 时一并迁移到对应 marker 的 `pause_decisions` 数组(沿 `src/cli/commands/archive.ts:411/422` archive fence 同时校验 verify-passed + review-passed 两个 marker 的 pause_decisions,确认这是 additive 模式)。

主代理在 verify / review 写 marker 时,**必须**把本 change apply 阶段累积的所有 pause 决策按下面 schema 写入 `pause_decisions` 数组:

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
    added_task_ref: tasks.md#task-7 # option=2 必填:Fluid Pause 新增的 task(与 task_ref=触发 task 区分)
    capture_id: <forge pause-capture 返回的 capture_id> # option=2 必填:关联 pause-capture entry
    target_artifact: proposal.md # option=1=proposal.md;option=2=tasks.md;option=3=proposal.md|design.md
    target_anchor: '## Out of Scope' # 记录写到哪个段(option=2 降为仅人类可读,fence 不据此校验)
    non_blocking_rationale: 'subagent 可跳过该 issue 完成本 task 主体功能' # option=3 必填
    other_rationale: null # option=4 必填
    other_acked_by: null # option=4 必填
```

### Fence 校验(`forge archive` 阶段,本协议反向加固点)

`forge archive` 跑 `validatePauseDecisionsFence`(沿 design §2.1.5)— 任一违反拒签 exit 1:

- CRITICAL severity → 拒签(CRITICAL 应走 forge 强 fence,不应进 pause)
- WARNING + (severity_acked_by 空 ∨ severity_acked_at 空)→ 拒签
- option=1:`target_artifact='proposal.md'` + `target_anchor` 含 `What`
- option=2:`added_task_ref` 指向的 task ∉ capture 快照、∈ 当前 tasks.md 且勾选 `[x]`;`capture_id` 匹配 ack-log pause-capture entry;链完整
- option=3:proposal/design YAML 块含对应 entry.id + `non_blocking_rationale` 非空
- option=4:`other_rationale` + `other_acked_by` 非空

### option=2 capture 的已知边界(capture-input gap,design §9.2/§9.3)

`forge pause-capture` 是轻量锚点,**不能**密码学证明 "task 是 pause 真新增的"。它能挡:无 capture 流程的 option=2、capture entry 事后被篡改、同 marker 内 capture 复用。它**挡不住**:capture 当下喂假输入(删旧 task → capture → 恢复)、AI 预先攒多条 capture 后选择性认领、AI 完全不记录 pause_decision。轻量 capture 对 "诚实但偷懒" 的 AI 有效,对蓄意构造假输入的攻击者无效 —— 此 gap 是当前 forge 架构下的已知限制。

## 与其他 sub-plan 合并点

本 §"Fluid Pause Decision Point" 段(plan-9c)与后续 sub-plan 在 apply.md 有合并点(参考 master plan §3.3 line 272):

- **9h(SDD 实施前置纪律加固)**:将在步骤 0 加 `forge preflight branch-check` 调用 + 步骤 3.5 加 §"Critical Plan Review";9c 不动这些位置
- **9g(process_evidence)**:将在每个 subagent task 完成后加 `forge evidence record-tdd` helper 调用;9c 不动这些位置
- **推荐 merge 顺序**:9h → 9c → 9g

## 禁止行为

- 不允许主代理直接写代码 — 所有 task 实施必须通过 subagent
- 不允许 subagent 改 tasks.md(写入是主代理单点串行职责)
- 不允许跳过 TDD 的 red 步骤(verify 阶段会发现并 append 修复 task)

## 禁止行为(plan-9h §2.8.3 B 主代理 STOP 协议)

主代理 dispatch 阶段必须停下问用户的场景(不允许自动绕过 / 不允许重试,沿 `skills/subagent-driven-development/SKILL.md` §"Main Agent STOP Triggers"):

- ✗ **不允许"绕过失败 task 跑下一个"**(同 task BLOCKED 后必须 STOP)
- ✗ **不允许"修改 task 描述让它能过"**(改 task 描述需经 §"Fluid Pause Decision Point" 走选项 1/2)
- ✗ **不允许"重试同一 task ≥ 3 次不停下"**(verify 命令重试 ≥ 3 次仍失败 / subagent BLOCKED ≥ 2 次 → STOP 问用户,沿 SDD STOP triggers 表)

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

## (可选)Stage extensions hook — Tier 1 Claude Code only

> codex review 集成。AI 主代理在本 stage(`apply_critical_plan_review`)跑多轮收敛协议。
> Tier 2/3(Codex/OpenCode)见 [`docs/stage-extensions.md §未来 Tier 2/3 集成`](../docs/stage-extensions.md#未来-tier-23-集成)。

**Step A — 检查是否启用**:读 `forge/config.yaml#stage_extensions.apply_critical_plan_review`。无该字段 / 数组为空 / 全部 entry `enabled: false` → **跳过本段,流程结束**。

**Step B — 对每个 `enabled` entry 跑多轮收敛 loop**:

初始化 `round = 1`、`threadId = ''`、`roundHistory = []`、`roundLimit = null`(F1-v8 fix:`roundLimit` **不从 config 文件读** —— effective convergence 由 runner 输出,见 Step 3。AI 协议不碰 config 文件解析 / deep-merge,单一数据源是 runner JSON)。循环:

1. **跑单轮 runner**:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" stage-extensions run \
     --stage apply_critical_plan_review --change-id <change-id> --extension <entry-name> \
     --round <round>${threadId:+ --thread-id $threadId}
   ```
2. **解析 stdout JSON 的 `kind`**:
   - `converged` → 该 entry 收敛完成,**break loop**(codex 输出 verbatim 透传给用户)
   - `failed` / `config_error` / `no_extension` → 该 entry 放弃,**break loop**(loose,不阻塞主流程)
   - `unconverged` → 继续 3
3. **从 unconverged JSON 取状态**(F1-v8 fix:effective config 来自 runner 输出,runner 内 `validateStageExtensionsConfig` 已 normalize):
   - `roundHistory.push({ round, block_count: <blockFindings.length> })`;`threadId = <JSON.threadId>`;codex finding verbatim 透传给用户
   - 首轮:`roundLimit = <JSON.effectiveConvergence.max_rounds>`(后续轮 `roundLimit` 已设,不覆盖 —— 选项①的 `roundLimit += N` 增量须保留)
4. **若 `round >= roundLimit`**(F2-v7 fix:用可增长的 `roundLimit`):
   - 若 `<JSON.effectiveConvergence.max_rounds_on_exceed>` 为 `force_end` → 把 blockFindings 写 `forge/changes/<id>/.evidence/codex-pending-findings.yaml`(backlog),**break loop**
   - 否则跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" stage-extensions analyze-trend --history '<roundHistory JSON>'` 拿 TrendAdvice,再 `AskUserQuestion` 三选项(默认推 `TrendAdvice.recommended_option`):**①再跑 N 轮**(F2-v7 fix:读用户输入的 `N`,执行 `roundLimit += N`,然后 `round++` 继续 loop —— 后续 `round >= roundLimit` 判定按新上限走,不会立刻又进 Step 4)/ **②放弃 codex**(break loop)/ **③接受当前**(blockFindings 写 backlog,break loop)
5. **否则(`round < roundLimit`)**:`AskUserQuestion` 三选项(默认推 `<JSON.userInteraction.block_unconverged>`):
   - **①auto_fix** → 用 `Task` 工具 dispatch fresh fix subagent 修 blockFindings → `round++`,继续 loop
   - **②manual_fix** → 等用户改完 → `round++`,继续 loop
   - **③give_up** → break loop

**Step C — loose**:本段任何步骤(runner 调用 / AskUserQuestion / fix dispatch)失败都**不阻塞主流程 fence**。runner 永远 exit 0;AskUserQuestion harness 不支持时降级终端 prompt。
