---
description: 把 draft(可选)转化为 forge/changes/<id>/ 下的 4 件套(proposal + specs + design + tasks)
argument-hint: '<change-id> [--from-draft <date-topic>] [--light]'
---

You are about to handle `/forge:propose $ARGUMENTS`.

解析参数:

- 第一个 token 是 `<change-id>`(slug,小写连字符)
- 可选 `--from-draft <date-topic>` 指定要消费的 draft 文件(对应 `forge/drafts/<date-topic>.md`)
- **可选 `--light`**:强制 writing-plans skill 走 light mode(沿 v0.3 P3)

## 前置 — Pending follow-ups 扫描(plan-9b §2.6.5)

**在产 proposal/design/tasks 之前**,先扫 archived changes 的 out-of-scope / future-work / non-goal:

1. 跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" scope scan-archived-followups <change-id>`(若 helper 不可用,fallback 调本地 `npx forge scope scan-archived-followups <change-id>`)
2. 解析 stdout JSON;若 `entries` 为空 → 跳过本段直接进步骤 1
3. 若非空 → 用 AskUserQuestion 渲染:
   - 按 `category` 分组(future-work / out-of-scope / non-goal),沿 §2.6.5 优先级排序
   - 标题:"## Pending follow-ups from archived changes (N active)"
   - 每个 entry 显示:`[source_change] id — description`
   - 每项 5 选项:`inherit`(本 change 做)/ `acknowledge but defer`(留 active)/ `mark obsolete` / `mark superseded by some other change` / `mark completed`(本 change 已实际完成该 backlog 项)
4. 用户决策聚合并写入:
   - **`inherit`**:写到本 change 自己的 `## Out of Scope/Future Work` YAML 块成为新 entry,archived 来源用 **`related_change: "<source_change>"`** 字段记录(change 粒度;entry 级精确来源由配套那条 superseding ref 的 `entry_id` 承载)(**勿**写 `triggered_by: {source: "from-archived", ...}` —— `from-archived` 不在 `TriggeredByRef.source` 枚举内,会被严格 validator 拒签);**并且**在 `superseding_entries` 数组写一条 `{source_change, entry_id, new_status: inherited, rationale}` —— 否则被继承的老 entry 不会从 backlog 注册表扣除,造成 double-count(plan-backlog-registry §9a/§9b)。此处 `rationale` 填「从 `<source_change>` 继承至本 change 实施」一类说明,勿留空
   - **`mark obsolete` / `mark superseded` / `mark completed`**:各写一条 `superseding_entries` 项(`{source_change, entry_id, new_status, rationale}`,`new_status` 取 `obsolete` / `superseded` / `completed`)
5. `acknowledge but defer` 不写(留原 archived entry 仍 active,下次再问)

**不强制** — 用户可全跳过 / 部分处理。但**必须**显式提示,不能静默忽略。

## 步骤(必须按序)

1. **若提供了 `--from-draft <name>`**:
   - 读 `forge/drafts/<name>.md`(若不存在,**报错并停止**:"draft 不存在: forge/drafts/<name>.md。可用 draft: " + 列出 `forge/drafts/*.md`)
   - 把 draft 内容作为后续 writing 的输入上下文
2. **读 `forge/config.yaml`** 提取 `context`(tech stack)和 `rules.{proposal,specs,design,tasks}`,把这些作为系统提示注入后续 skill。
3. **必须调用 `forge:writing-plans` skill** 来产出 tasks。
4. 产出文件到 `forge/changes/<change-id>/`(如目录已存在且非空,**报错并停止**:"change 已存在: forge/changes/<change-id>/。请改 change-id 或删除已有目录"):
   - `proposal.md` — H1 标题 + Why + What + Scope
     - **必须**含 `## Out of Scope {#forge-oos}` 段(沿 plan-9b §2.6.3);若本 change 没有 out-of-scope 项,该段仅占位 anchor 无 YAML 块(合法)
     - **必须**含 `## Non-Goals {#forge-non-goals}` 段(同上)
     - 若上面 §"前置"步骤 4 收集到 `inherit` / `superseding_entries` 决策 → 写入对应段的 `forge-scope-entries/v1` YAML 块(inherit 项带 `related_change`,且必配一条 `new_status: inherited` 的 superseding_entries 项 —— plan-backlog-registry §9a/§9b)
   - `specs/<sub-area>.md` — 每个改动域一个文件,Given/When/Then 三段格式(spec deltas)
   - `design.md` — H1 标题 + 技术方案 + 数据模型 + 接口设计;**必须**含 `## Future Work {#forge-future-work}` 段(同上,可仅占位)
   - `tasks.md` — checkbox 任务列表,粒度 2-5 分钟一步,采用 forge:writing-plans skill 的 task 结构
5. **若有 `--from-draft`**:把 draft 移到 `forge/drafts/.consumed/<name>.md`(filesystem chmod 444 只读)。
6. 跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" validate <change-id>` 确认 4 件套完整 + scope YAML 合规(沿 plan-9b §2.6.8;若 helper 不可用 改用 skill 内嵌 fenced bash 调 helper,见 Plan 3 Task 3.3)。**若 validate 失败,根据错误回去补,不要把不完整产物留下**。

## 禁止行为

- 不允许跳过 `forge:writing-plans` skill 直接写 tasks.md(skill 内置 self-review,跳过会漏 placeholder 检查)
- 不允许把任何东西写到 `forge/specs/`(那是 archive 内部 sync 的输出)
- 不允许在 `forge/changes/<id>/` 之外创建产物文件
- **不允许省略三段 anchor**(plan-9b §2.6.3):缺 `{#forge-oos}` / `{#forge-non-goals}` / `{#forge-future-work}` 会让 content_hash 把 follow-up 编辑算进 marker 失效,违反 §2.6.3 解耦
- **不允许把 archived followups 决策静默丢弃**:若 scan 输出非空,必须走 AskUserQuestion 让用户做决策

## (可选)Stage extensions hook — Tier 1 Claude Code only

> codex review 集成。AI 主代理在本 stage(`propose`)跑多轮收敛协议。
> Tier 2/3(Codex/OpenCode)见 [`docs/stage-extensions.md §未来 Tier 2/3 集成`](../docs/stage-extensions.md#未来-tier-23-集成)。

**Step A — 检查是否启用**:读 `forge/config.yaml#stage_extensions.propose`。无该字段 / 数组为空 / 全部 entry `enabled: false` → **跳过本段,流程结束**。

**Step B — 对每个 `enabled` entry 跑多轮收敛 loop**:

初始化 `round = 1`、`threadId = ''`、`roundHistory = []`、`roundLimit = null`(F1-v8 fix:`roundLimit` **不从 config 文件读** —— effective convergence 由 runner 输出,见 Step 3。AI 协议不碰 config 文件解析 / deep-merge,单一数据源是 runner JSON)。循环:

1. **跑单轮 runner**:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" stage-extensions run \
     --stage propose --change-id <change-id> --extension <entry-name> \
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
