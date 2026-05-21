---
description: 读 tasks.md 派子代理实施每个 task,顺序模式或 --parallel 模式
argument-hint: '[--parallel] [--change-id <id>]'
---

You are about to handle `/forge:apply $ARGUMENTS`.

解析:

- 默认:顺序模式(主工作区直接跑)
- `--parallel`:并行模式(每个独立 task 一个 worktree;遵循 `forge:dispatching-parallel-agents` 的 cherry-pick 串行协议)
- `--change-id <id>`:指定 change(默认为 `forge/changes/` 下唯一未归档的 change;若 >1,**报错并停止**列出选项)

## 步骤

0. **前置 branch-check**(沿 §2.8.3 C):调 `forge preflight branch-check <change-id>`
   - exit 0 → 继续步骤 1
   - exit 2 → **必须停下**,按 stderr 建议切 feature branch(`git checkout -b feature/<change-id>`)或显式传 `--allow-protected-branch`(后者需用户确认风险)
   - 非 git 项目:helper 自动跳过 exit 0
1. **必须调用 `forge:subagent-driven-development` skill**(无 inline 模式)。
2. **必须调用 `forge:test-driven-development` skill** 作为每个 subagent 的实施纲领。
3. 若 `--parallel`,**追加调用 `forge:dispatching-parallel-agents` 和 `forge:using-git-worktrees`**。

3.5. **Critical Plan Review**(主代理 dispatch subagent 前必做):

主代理读 `forge/changes/<id>/{proposal, design, tasks, specs/*}.md` 全套,**按 4 类维度逐条检查**:

| 维度   | 检查问题                                                            |
| ------ | ------------------------------------------------------------------- |
| 完整性 | tasks 是否覆盖 specs 所有 requirement?(对照 specs requirement 计数) |
| 顺序   | tasks 依赖关系是否合理?(标 dependency 的 task 是否先于被依赖)       |
| 清晰度 | 是否有 tasks 描述 vague(如"处理边界情况" / "加测试")?               |
| scope  | 是否有 tasks 应该是 out-of-scope 而非本 change?                     |

- **若有 concerns** → AskUserQuestion 列 concerns,等用户决策:
  - 改 plan(回 propose 修)
  - 接受当前 plan(继续 dispatch)
  - 走 explore 重新评估
- **无 concerns** → 主代理**必须显式输出 4 类维度的结论**(可以是"无问题"但按维度逐条说),然后进步骤 4 dispatch

**Critical Plan Review 不允许 vague pass-through** — 必须显式输出 4 类检查结果,不允许跳过整段 review。

4. 读 `forge/changes/<id>/tasks.md`,识别未勾选 tasks。
5. **顺序模式**:
   - for each task:派 fresh subagent(主工作区),subagent 拿 [task + 相关 specs/<sub-area>.md + design.md] 启动
   - subagent 跑 TDD:red → green → refactor + git commit
   - 主代理 review subagent 的 commit + test 日志,通过则在主工作区 tasks.md 把 `[ ]` 改 `[x]`
6. **--parallel 模式**:严格遵守 cherry-pick 串行协议(详 `forge:dispatching-parallel-agents` skill 的"forge --parallel 模式 cherry-pick 串行协议"段)
7. 全部 task 完成后,在 tasks.md 末尾追加(parallel 多 commit 用列表):
   ```yaml
   applied_commits:
     - <task-id-1>: <commit-hash>
     - <task-id-2>: <commit-hash>
   final_head: <git rev-parse HEAD>
   ```

## Fluid Pause Decision Point

> **与 `/forge:explore` 边界**:Fluid Pause 是**被动**触发(subagent 报告阻塞型 issue 时主代理进入);若是**开放思考**(非阻塞 issue,如"实施途中想重新评估某个 design 决策"),应主动触发 `/forge:explore --change <id>` 而非 Fluid Pause。两者边界详见 `forge:exploring` skill。

### 触发条件

subagent 在 apply 中段报告以下三档之一时,主代理**不直接处理**,改进 Fluid Pause:

| Subagent 报告                                                                | 主代理行为                            |
| ---------------------------------------------------------------------------- | ------------------------------------- |
| `DONE_WITH_CONCERNS`,concerns 类型 = "correctness or scope"                  | 进 Fluid Pause                        |
| `BLOCKED` 第 4 项 = "plan itself is wrong"                                   | 进 Fluid Pause                        |
| `DESIGN_ISSUE_FOUND` — subagent 实施中发现属于本 change 但 spec 未覆盖的需求 | 进 Fluid Pause                        |
| **任一 CRITICAL 级问题**(测试 fail / 显式错误)                               | **不进 Fluid Pause** — abort 让用户修 |

### 协议流程

```
subagent 报告 → 主代理判定问题性质
              ↓
              CRITICAL? → yes → abort,让用户修代码 / 重派 subagent
                       → no  → AskUserQuestion 四选项
                                ↓
                                用户选择
                                ↓
                                1=扩本 change scope → 更新 proposal `## What` + subagent 重派
                                2=加 task 进本轮 → 主代理 append 新 task 到 tasks.md + subagent 重派
                                3=转 out-of-scope → 写到 proposal `## Out of Scope` / design `## Future Work` YAML 块 + subagent 跳过 issue 继续
                                4=Other → 用户自由文本描述
                                ↓
                                主代理在 session context 累积 PauseDecisionSimple
                                ↓
                                verify / review 阶段写 marker 时一并填 pause_decisions[]
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

**Options:**
1. **扩本 change scope** — 把这个 issue 纳入本 change。更新 proposal `## What` 段,重新派 subagent 实施。代价:本 change scope 增大,需要重 review
2. **加 task 进本轮 tasks.md** — 当成新发现的本 change 必做项。主代理 append 新 task 到 tasks.md,subagent 重派实施
3. **转 out-of-scope**(仅限 issue 不阻断本 task 时可用) — 不在本 change 做,写到 proposal `## Out of Scope` 或 design `## Future Work` 段(YAML 结构化字段)。subagent 跳过该 issue 继续当前 task。**v1.1+ backlog registry 会从这里读**
4. **Other** — 自由文本描述,主代理 notes 字段留底

What would you like to do?
```

### Marker 持久化(v4 简版)

apply **中段** marker 尚不存在,AI 主代理把每次 pause 决策**累积记录在本 change session context** 中,等到 verify / review 时一并迁移到对应 marker 的 `pause_decisions[]` 数组(`PauseDecisionSimple` schema,沿 `src/core/markers/types.ts`):

```yaml
pause_decisions:
  - paused_at: 2026-05-21T14:30:00Z # ISO 8601 UTC,允许 ms 精度
    task_ref: tasks.md#task-3
    issue_summary: 'subagent 发现 specs 没覆盖 OAuth refresh token 过期处理'
    chosen_option: 3 # 1=扩scope/2=加task/3=转out-of-scope/4=Other
    notes: 'subagent 可跳过该 issue 完成本 task 主体功能'
```

**v4 BREAKING**:`PauseDecisionSimple` 只 5 个字段(`paused_at` / `task_ref` / `issue_summary` / `chosen_option` / `notes?`)。已删字段:`severity` / `severity_acked_by` / `severity_acked_at` / `added_task_ref` / `capture_id` / `target_artifact` / `target_anchor` / `non_blocking_rationale` / `other_rationale` / `other_acked_by`(v3 反加固 fence 字段全消亡)。**archive 阶段无 `validatePauseDecisionsFence` 校验**(v4 删 fence,marker 仅作 audit)。

## 禁止行为

- 不允许主代理直接写代码 — 所有 task 实施必须通过 subagent
- 不允许 subagent 改 tasks.md(写入是主代理单点串行职责)
- 不允许跳过 TDD 的 red 步骤(verify 阶段三维度 prose check 会发现)

## 禁止行为(主代理 STOP 协议)

主代理 dispatch 阶段必须停下问用户的场景(不允许自动绕过 / 不允许重试,沿 `forge:subagent-driven-development` skill 的"Main Agent STOP Triggers"):

- ✗ **不允许"绕过失败 task 跑下一个"**(同 task BLOCKED 后必须 STOP)
- ✗ **不允许"修改 task 描述让它能过"**(改 task 描述需经 Fluid Pause 走选项 1/2)
- ✗ **不允许"重试同一 task ≥ 3 次不停下"**(verify 命令重试 ≥ 3 次仍失败 / subagent BLOCKED ≥ 2 次 → STOP 问用户)

## (可选)Stage extensions hook — Tier 1 Claude Code only

> codex review 集成。AI 主代理在本 stage(`apply_critical_plan_review`)跑多轮收敛协议。
> Tier 2/3(Codex/OpenCode)见 [`docs/stage-extensions.md §未来 Tier 2/3 集成`](../docs/stage-extensions.md#未来-tier-23-集成)。

**Step A — 检查是否启用**:读 `forge/config.yaml#stage_extensions.apply_critical_plan_review`。无该字段 / 数组为空 / 全部 entry `enabled: false` → **跳过本段**。

**Step B — 对每个 `enabled` entry 跑多轮收敛 loop**:

初始化 `round = 1`、`threadId = ''`、`roundHistory = []`、`roundLimit = null`。循环:

1. **跑单轮 runner**:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" stage-extensions run \
     --stage apply_critical_plan_review --change-id <change-id> --extension <entry-name> \
     --round <round>${threadId:+ --thread-id $threadId}
   ```
2. **解析 stdout JSON 的 `kind`**:`converged` / `failed` / `config_error` / `no_extension` → break loop(loose);`unconverged` → 继续 3
3. **从 unconverged JSON 取状态**:`roundHistory.push(...)`;`threadId = <JSON.threadId>`;首轮 `roundLimit = <JSON.effectiveConvergence.max_rounds>`
4. **若 `round >= roundLimit`**:`force_end` → 写 backlog,break;否则 `analyze-trend` + AskUserQuestion 三选项(再跑 N 轮 / 放弃 / 接受当前)
5. **否则**:AskUserQuestion 三选项(auto_fix dispatch fix subagent / manual_fix 等用户改 / give_up)

**Step C — loose**:本段任何步骤失败都**不阻塞主流程**。
