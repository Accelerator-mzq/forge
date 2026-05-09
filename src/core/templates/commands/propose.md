---
description: 把 draft(可选)转化为 forge/changes/<id>/ 下的 4 件套(proposal + specs + design + tasks)
argument-hint: '<change-id> [--from-draft <date-topic>] [--light]'
---

You are about to handle `/forge:propose $ARGUMENTS`.

解析参数:

- 第一个 token 是 `<change-id>`(slug,小写连字符)
- 可选 `--from-draft <date-topic>` 指定要消费的 draft 文件(对应 `forge/drafts/<date-topic>.md`)
- **可选 `--light` (v0.3 P3 修复)**:强制 writing-plans skill 走 light mode(1-2 task,跳过 RED/GREEN/REFACTOR 三段强约束),用于 trivial change(加 1 字段 / 改 1 常量 / 修 1 simple bug 等)。不传时由 writing-plans skill 按 proposal 行数 + `forge/config.yaml#writing_plans.light_threshold`(默认 200)自动判定 light vs full mode。

## 步骤(必须按序)

1. **若提供了 `--from-draft <name>`**:
   - 读 `forge/drafts/<name>.md`(若不存在,**报错并停止**:"draft 不存在: forge/drafts/<name>.md。可用 draft: " + 列出 `forge/drafts/*.md`)
   - 把 draft 内容作为后续 writing 的输入上下文
2. **读 `forge/config.yaml`** 提取 `context`(tech stack)和 `rules.{proposal,specs,design,tasks}`,把这些作为系统提示注入后续 skill。
3. **必须调用 `forge:writing-plans` skill** 来产出 tasks。
4. 产出文件到 `forge/changes/<change-id>/`(如目录已存在且非空,**报错并停止**:"change 已存在: forge/changes/<change-id>/。请改 change-id 或删除已有目录"):
   - `proposal.md` — H1 标题 + Why + What + Scope + Out of scope
   - `specs/<sub-area>.md` — 每个改动域一个文件,Given/When/Then 三段格式(spec deltas)
   - `design.md` — H1 标题 + 技术方案 + 数据模型 + 接口设计(可短,但 H1 必须有)
   - `tasks.md` — checkbox 任务列表,粒度 2-5 分钟一步,采用 forge:writing-plans skill 的 task 结构
5. **若有 `--from-draft`**:把 draft 移到 `forge/drafts/.consumed/<name>.md`(filesystem chmod 444 只读)。
6. 跑 `forge validate <change-id>` 确认 4 件套完整。**若 validate 失败,根据错误回去补,不要把不完整产物留下**。

## 禁止行为

- 不允许跳过 `forge:writing-plans` skill 直接写 tasks.md(skill 内置 self-review,跳过会漏 placeholder 检查)
- 不允许把任何东西写到 `forge/specs/`(那是 archive 内部 sync 的输出)
- 不允许在 `forge/changes/<id>/` 之外创建产物文件
