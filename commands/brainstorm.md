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
