---
description: 派 review subagent 审 [proposal + specs + design + diff],主代理处理反馈,满足三条件写 .review-passed v2 marker
argument-hint: '[--change-id <id>]'
---

You are about to handle `/forge:review $ARGUMENTS`.

解析:`--change-id <id>` 默认 `forge/changes/` 下唯一未归档 change。

## 步骤

1. **必须调用 `forge:requesting-code-review` skill**(主轨)。
2. **必须调用 `forge:receiving-code-review` skill**(收反馈环节)。
3. 打包 review 输入:
   - `forge/changes/<id>/proposal.md`
   - `forge/changes/<id>/specs/*.md`
   - `forge/changes/<id>/design.md`
   - `git diff <since-tasks-start>..HEAD`(`since-tasks-start` 取 tasks.md 末尾 `applied_commits` 第一个 commit 的 parent)
4. 派 fresh review subagent,产出意见列表(每条带:[严重度]、[文件路径]、[问题描述]、[期望修改])。
5. 主代理对每条意见**逐条判断接受/拒绝**(参考 `forge:receiving-code-review` skill 的"用证据反驳"原则,不机械接受)。
6. 接受的意见 → append 到 `forge/changes/<id>/tasks.md` 末尾作为新 task 条目,实施 + commit。
7. **仅当满足三条件,才写 `.review-passed` v2 marker**:
   - a. 无"已用证据反驳但未存档"的拒绝意见
   - b. 接受的意见已**全部实现 + 测试通过**(本轮新接受的意见**不算本轮通过**,需下一轮 review)
   - c. 满足 a+b 时,本轮 review 无新增 task

8. **`.review-passed` v2 marker 示例**(沿 `src/core/markers/types.ts:ReviewMarker`):

   ```yaml
   schema: forge-review/v2
   reviewed_at: <ISO 8601 UTC,允许 ms 精度>
   reviewed_by: ai-agent # 或 human-override(需 archive --force)
   pause_decisions: # 可选 — 同 verify marker 的 PauseDecisionSimple
     - paused_at: 2026-05-21T15:00:00Z
       task_ref: tasks.md#task-7
       issue_summary: review subagent 发现 spec 未覆盖的 edge case
       chosen_option: 2
       notes: '加 task 进本轮 tasks.md'
   created_by_tool_version: <FORGE_VERSION>
   ```

   schema 字段只 5 个,无 hash / git / process_evidence / review_outcomes / evidence 数组。

## 禁止行为

- 不允许跳过 review subagent 直接写 .review-passed
- 不允许接受意见但不实现就写 .review-passed(违反条件 b)
- 不允许伪造 `reviewed_by` 字段
- **不允许在 .review-passed 写 v4 已删字段**(`review_outcomes` / `git` / `tasks_hash` / `content_hash` / `process_evidence` — schema 校验会拒)

## (可选)Stage extensions hook — Tier 1 Claude Code only

> codex review 集成。AI 主代理在本 stage(`review`)跑多轮收敛协议。
> Tier 2/3(Codex/OpenCode)见 [`docs/stage-extensions.md §未来 Tier 2/3 集成`](../docs/stage-extensions.md#未来-tier-23-集成)。

**Step A — 检查是否启用**:读 `forge/config.yaml#stage_extensions.review`。无该字段 / 数组为空 / 全部 entry `enabled: false` → **跳过本段**。

**Step B — 对每个 `enabled` entry 跑多轮收敛 loop**:

初始化 `round = 1`、`threadId = ''`、`roundHistory = []`、`roundLimit = null`。循环:

1. **跑单轮 runner**:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" stage-extensions run \
     --stage review --change-id <change-id> --extension <entry-name> \
     --round <round>${threadId:+ --thread-id $threadId}
   ```
2. **解析 stdout JSON 的 `kind`**:
   - `converged` → break loop(codex 输出 verbatim 透传)
   - `failed` / `config_error` / `no_extension` → break loop(loose)
   - `unconverged` → 继续 3
3. **从 unconverged JSON 取状态**:
   - `roundHistory.push({ round, block_count: <blockFindings.length> })`;`threadId = <JSON.threadId>`;codex finding verbatim 透传
   - 首轮:`roundLimit = <JSON.effectiveConvergence.max_rounds>`
4. **若 `round >= roundLimit`**:
   - 若 `<JSON.effectiveConvergence.max_rounds_on_exceed>` 为 `force_end` → blockFindings 写 `forge/changes/<id>/.evidence/codex-pending-findings.yaml`,break
   - 否则跑 `stage-extensions analyze-trend` 拿 TrendAdvice,AskUserQuestion 三选项:**①再跑 N 轮**(`roundLimit += N`,`round++`)/ **②放弃 codex**(break)/ **③接受当前**(写 backlog,break)
5. **否则**:AskUserQuestion 三选项(默认推 `<JSON.userInteraction.block_unconverged>`):**①auto_fix** → dispatch fresh fix subagent → `round++` / **②manual_fix** → 等用户改 → `round++` / **③give_up** → break

**Step C — loose**:本段任何步骤失败都**不阻塞主流程**。
