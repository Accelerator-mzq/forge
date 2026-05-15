---
description: 派 review subagent 审 [proposal + specs + design + diff],主代理处理反馈,满足三条件打 review-passed YAML
argument-hint: '[--change-id <id>]'
---

You are about to handle `/forge:review $ARGUMENTS`.

解析:`--change-id <id>` 默认 `forge/changes/` 下唯一未归档 change。

## 步骤

1.  **必须调用 `forge:requesting-code-review` skill**(主轨)。
2.  **必须调用 `forge:receiving-code-review` skill**(收反馈环节)。
3.  打包 review 输入:
    - `forge/changes/<id>/proposal.md`
    - `forge/changes/<id>/specs/*.md`
    - `forge/changes/<id>/design.md`
    - `git diff <since-tasks-start>..HEAD`(`since-tasks-start` 取 tasks.md 末尾 `applied_commits` 的第一个 commit 的 parent)
4.  派 fresh review subagent,产出意见列表(每条带:[严重度:阻塞/关键/可改进/建议]、[文件路径]、[问题描述]、[期望修改])。
5.  主代理对每条意见 **逐条判断接受/拒绝**(参考 forge:receiving-code-review skill 的"用证据反驳"原则,不机械接受)。
6.  接受的意见 → append 到 `forge/changes/<id>/tasks.md` 末尾作为新 task 条目。
7.  **仅当满足三条件,才打 `forge/changes/<id>/.review-passed`**:
    a. 无"已用证据反驳但未存档"的拒绝意见
    b. 接受的意见已**全部实现 + 测试通过**(本轮新接受的意见**不算本轮通过**,需下一轮 review)
    c. 满足 a+b 时,本轮 review 无新增 task
    7a. **(本 fix 补缺)调 forge evidence record-review 记录 review 事件证据到 staging**

        主代理在写完 .review-passed YAML 后、freeze 之前,**必须**先调 record-review:

        ```bash
        forge evidence record-review <changeId> --task <ref> --implementer-commit <sha>
        ```

        这一步把 review 事件(子代理调用 + 主代理 accept/reject outcomes)写入 `.evidence/process-evidence.staging.yaml`(沿 `src/cli/commands/evidence.ts:474`;helper list 权威 `commands/apply.md:179-182`)。

    7b. **(本 fix 补缺)调 forge evidence freeze 凝固 process_evidence**

        7a record-review 后,**必须**调:

        ```bash
        forge evidence freeze <changeId> --kind review
        ```

        若漏调 record-review 直接 freeze → exit 1 + 提示 "staging file not found"(代码事实 `evidence.ts:639`)。若漏调 freeze → archive fence 拒签 "[review] v1.0 marker missing process_evidence"(代码事实 `src/core/archive/fence.ts:185`)。

8.  `.review-passed` YAML schema(spec §3.4)— 含 `pause_decisions` 数组(本 fix 补 lifecycle 注):
    ```yaml
    schema: forge-review/v1
    tasks_hash: <sha256(tasks.md 已勾段)>
    content_hash: <sha256(proposal+specs+design)>
    reviewed_by: ai-agent # 或 human-override(需 archive --force)
    git:
      is_git_repo: true
      head: <git rev-parse HEAD>
      diff_hash: <sha256(git diff against forge/config.yaml code_paths)>
    review_outcomes:
      - id: 1
        severity: blocking
        accepted: true
        resolved: true
        resolution_commit: <hash>
    pause_decisions: # apply 阶段累积的 pause 决策在写本 marker 时一并迁移(沿 commands/apply.md "Marker 持久化" 段 lifecycle 说明)
      - id: 1
        # ... 完整 schema 见 commands/apply.md "Marker 持久化" 段
    ```

## 禁止行为

- 不允许跳过 review subagent 直接打 review-passed
- 不允许接受意见但不实现就打 review-passed(违反 b)
- 非 git 项目跳过 git 字段时,review-passed YAML 必须 `is_git_repo: false`(archive --force 才接受)

## (可选)Stage extensions hook — Tier 1 Claude Code only

> codex review 集成。AI 主代理在本 stage(`review`)跑多轮收敛协议。
> Tier 2/3(Codex/OpenCode)见 [`docs/stage-extensions.md §未来 Tier 2/3 集成`](../docs/stage-extensions.md#未来-tier-23-集成)。

**Step A — 检查是否启用**:读 `forge/config.yaml#stage_extensions.review`。无该字段 / 数组为空 / 全部 entry `enabled: false` → **跳过本段,流程结束**。

**Step B — 对每个 `enabled` entry 跑多轮收敛 loop**:

初始化 `round = 1`、`threadId = ''`、`roundHistory = []`、`roundLimit = null`(F1-v8 fix:`roundLimit` **不从 config 文件读** —— effective convergence 由 runner 输出,见 Step 3。AI 协议不碰 config 文件解析 / deep-merge,单一数据源是 runner JSON)。循环:

1. **跑单轮 runner**:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" stage-extensions run \
     --stage review --change-id <change-id> --extension <entry-name> \
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
