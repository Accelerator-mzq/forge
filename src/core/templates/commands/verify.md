---
description: 跑 forge validate + verification-before-completion + 三维度 prose check,写 .verify-passed v2 marker
argument-hint: '[--change-id <id>]'
---

You are about to handle `/forge:verify $ARGUMENTS`.

解析:`--change-id <id>` 默认 `forge/changes/` 下唯一未归档的 change;若 >1,**报错并停止**列出选项。

## 步骤

1. **必须调用 `forge:verification-before-completion` skill**(证据先于声称的纪律)。

2. **跑 `forge validate <change-id>`**(plugin helper 走 `${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs validate`)。

3. **若 validate 失败(exit 1)**:
   - 不写 `.verify-failed` marker(v4 砍掉 failed marker schema)
   - 直接 abort,把错误透传给用户,提示按 validate 错误修代码 / 改 spec 后重跑 `/forge:verify`

4. **若 validate 通过(exit 0)**:

   4.1 **跑用户项目测试** — 读 `forge/config.yaml` 的 `test.test_command`,缺省 `pnpm test`,失败 abort 让用户修。

   4.2 **三维度 prose check — 必须调用 `forge:verifying-three-dimensions` skill**:
   - **Completeness**:对 spec 每个 Requirement,grep codebase 找实施证据;空 → 报告给用户
   - **Correctness**:对 spec 每个 Requirement 定位实施 file:line;WHEN/THEN scenario 覆盖检查
   - **Coherence**:design.md `## Decision:` 段比对 codebase;命名 / pattern 比对项目惯例
   - 三维度发现的问题以 prose 形式呈现给用户(对话内 + 必要时改 code 或 spec);**不写 marker 内 fence 字段**(v4 删 `verify_findings` 数组)

     4.3 **写 `forge/changes/<id>/.verify-passed` v2 marker**(沿 `src/core/markers/types.ts:VerifyMarker`):

     ```yaml
     schema: forge-verify/v2
     verified_at: <ISO 8601 UTC,允许 ms 精度>
     verified_by: ai-agent # 或 human-override(需 archive --force)
     pause_decisions: # 可选 — apply 阶段累积的 PauseDecisionSimple
       - paused_at: 2026-05-21T14:30:00Z
         task_ref: tasks.md#task-3
         issue_summary: subagent 报告 OAuth refresh edge case
         chosen_option: 3 # 1=扩scope/2=加task/3=转out-of-scope/4=Other
         notes: 'subagent 可跳过该 issue 完成本 task 主体功能'
     created_by_tool_version: <FORGE_VERSION>
     ```

     schema 字段只 5 个,无 hash / git / process_evidence / verify_findings / evidence 数组。

     4.4 **若三维度发现重大问题**(应改 code / spec 后重跑 verify):**不写 .verify-passed**,直接 abort 让用户先修。AI 不允许"知道问题但仍写 verify-passed"。

## (可选)Stage extensions hook — Tier 1 Claude Code only

> codex review 集成。AI 主代理在本 stage(`verify`)跑多轮收敛协议。
> Tier 2/3(Codex/OpenCode)见 [`docs/stage-extensions.md §未来 Tier 2/3 集成`](../docs/stage-extensions.md#未来-tier-23-集成)。

**Step A — 检查是否启用**:读 `forge/config.yaml#stage_extensions.verify`。无该字段 / 数组为空 / 全部 entry `enabled: false` → **跳过本段**。

**Step B — 对每个 `enabled` entry 跑多轮收敛 loop**:

初始化 `round = 1`、`threadId = ''`、`roundHistory = []`、`roundLimit = null`。循环:

1. **跑单轮 runner**:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" stage-extensions run \
     --stage verify --change-id <change-id> --extension <entry-name> \
     --round <round>${threadId:+ --thread-id $threadId}
   ```
2. **解析 stdout JSON 的 `kind`**:
   - `converged` → break loop(codex 输出 verbatim 透传给用户)
   - `failed` / `config_error` / `no_extension` → break loop(loose,不阻塞主流程)
   - `unconverged` → 继续 3
3. **从 unconverged JSON 取状态**:
   - `roundHistory.push({ round, block_count: <blockFindings.length> })`;`threadId = <JSON.threadId>`;codex finding verbatim 透传给用户
   - 首轮:`roundLimit = <JSON.effectiveConvergence.max_rounds>`
4. **若 `round >= roundLimit`**:
   - 若 `<JSON.effectiveConvergence.max_rounds_on_exceed>` 为 `force_end` → 把 blockFindings 写 `forge/changes/<id>/.evidence/codex-pending-findings.yaml`,break loop
   - 否则跑 `stage-extensions analyze-trend` 拿 TrendAdvice,再 AskUserQuestion 三选项:**①再跑 N 轮**(`roundLimit += N` 后 `round++`)/ **②放弃 codex**(break)/ **③接受当前**(blockFindings 写 backlog,break)
5. **否则**:AskUserQuestion 三选项(默认推 `<JSON.userInteraction.block_unconverged>`):**①auto_fix**(dispatch fresh fix subagent → `round++`)/ **②manual_fix**(等用户改 → `round++`)/ **③give_up**(break)

**Step C — loose**:本段任何步骤失败都**不阻塞主流程**。runner 永远 exit 0;AskUserQuestion harness 不支持时降级终端 prompt。

## 禁止行为

- 不允许跳过三维度 prose check 就写 .verify-passed
- 不允许测试 fail 时仍写 .verify-passed(违反 verification-before-completion 纪律)
- 不允许伪造 `verified_by` 字段(`ai-agent` 表示真跑了流程,`human-override` 表示用户手工签证 — archive 需 `--force`)
- **不允许在 .verify-passed 写 v4 已删字段**(`verify_findings` / `evidence` / `git` / `tasks_hash` / `content_hash` / `process_evidence` — schema 校验会拒)
