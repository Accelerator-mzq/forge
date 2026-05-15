---
description: 把模糊想法转化为 forge/drafts/ 下的结构化 draft,通过强制提问 + 设计探讨完成
argument-hint: '<topic>'
---

You are about to handle a `/forge:brainstorm <topic>` invocation. The user typed:

```
/forge:brainstorm $ARGUMENTS
```

Follow these steps strictly. Do NOT skip any:

1. **必须先调用 `forge:brainstorming` skill**(用 Skill 工具,skill 名 `forge:brainstorming`)。该 skill 强制提问 / 不允许直接给方案 / 不允许写代码。
2. 完成 skill 内的全部 checklist(包括"探索项目上下文"、"逐个澄清问题"、"提 2-3 方案"、"分段呈现 design")。
3. 确认 design 通过用户审阅后,把 draft **保存到 `forge/drafts/<YYYY-MM-DD>-<topic>.md`**(date 用今天,topic 来自用户参数,小写连字符化)。
4. 若 `forge/drafts/` 目录不存在,先 `mkdir -p forge/drafts/`。
5. 写完后,提示用户:"draft 保存到 `forge/drafts/<file>`,确认要推进就跑 `/forge:propose <change-id> --from-draft <date>-<topic>`"。

## 禁止行为

- 不允许直接产出 `forge/changes/<id>/` 任何文件(那是 `/forge:propose` 的工作)
- 不允许跳过 `forge:brainstorming` skill 的提问环节,即使用户表示"我已经想清楚了"
- 不允许在 `forge/specs/` 里写任何东西(specs/ 仅由 archive 内部 sync 写入)

## (可选)Stage extensions hook — Tier 1 Claude Code only

> codex review 集成。AI 主代理在本 stage(`brainstorming`)跑多轮收敛协议。
> Tier 2/3(Codex/OpenCode)见 [`docs/stage-extensions.md §未来 Tier 2/3 集成`](../docs/stage-extensions.md#未来-tier-23-集成)。

**Step A — 检查是否启用**:读 `forge/config.yaml#stage_extensions.brainstorming`。无该字段 / 数组为空 / 全部 entry `enabled: false` → **跳过本段,流程结束**。

**Step B — 对每个 `enabled` entry 跑多轮收敛 loop**:

初始化 `round = 1`、`threadId = ''`、`roundHistory = []`、`roundLimit = null`(F1-v8 fix:`roundLimit` **不从 config 文件读** —— effective convergence 由 runner 输出,见 Step 3。AI 协议不碰 config 文件解析 / deep-merge,单一数据源是 runner JSON)。循环:

1. **跑单轮 runner**:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" stage-extensions run \
     --stage brainstorming --change-id <change-id> --extension <entry-name> \
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
