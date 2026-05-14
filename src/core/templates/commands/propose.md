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
   - 每项 4 选项:`inherit`(本 change 做)/ `acknowledge but defer`(留 active)/ `mark obsolete` / `mark superseded by some other change`
4. 用户决策聚合,**`inherit` 项写到本 change 自己的 `## Out of Scope/Future Work` YAML 块**(本 change 实施时它就是新 entry,加 `triggered_by: {source: "from-archived", id: "<source_change>::<entry_id>"}` 跟踪来源);**`mark superseded` / `mark obsolete` 项写到 `superseding_entries` 数组**(每项含 source_change / entry_id / new_status / rationale)
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
     - 若上面 §"前置"步骤 4 收集到 `inherit` / `superseding_entries` 决策 → 写入对应段的 `forge-scope-entries/v1` YAML 块
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
