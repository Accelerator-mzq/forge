---
description: 主动触发非线性思考空间 — 鼓励 ASCII diagram / 选项对比 / 反思 assumption;探索完必须显式收尾 + capture offer 含具体 forge 路径(沿 design §2.5)
argument-hint: '[<topic> | --change <id>]'
---

You are about to handle a `/forge:explore [<topic> | --change <id>]` invocation. The user typed:

```
/forge:explore $ARGUMENTS
```

Follow these steps strictly. Do NOT skip any:

1. **必须先调用 `forge:exploring` skill**(用 Skill 工具,skill 名 `forge:exploring`)。该 skill 强制显式收尾 + 可执行 capture offer + 禁止 explore 阶段直接写 artifacts(沿 design §2.5.6 反向加固三条)。
2. **解析参数**:
   - 无参数:开放探索,不绑定具体 change。
   - `--change <id>`:绑定本 change,**读** `forge/changes/<id>/{proposal,design,tasks,specs/*}.md` 作上下文。
   - `<topic>`(自由文本,非 `--` 开头):用户给的探索主题。
   - 在 `/forge:apply` subagent 实施中、检测到唯一未归档 change 时,允许省略 `--change`(沿 v0.4 推断模式)。
3. 完成 skill 内全部协议步骤(读上下文 → 探索阶段 → `## Exploration Summary` 显式收尾 → Capture offer 给具体 `file:section`)。
4. **若 Capture offer 被用户明确确认**(明确"yes / 改吧 / capture 吧"),才走对应 capture decisions 表的落地位置(如 `design.md` / `proposal.md` / `tasks.md` / `forge/drafts/`);Write / Edit 前再次反确认具体段落改动。

## 禁止行为

- 不允许 explore turn 内直接 Write / Edit 修改 `forge/changes/*` artifacts(沿 design §2.5.6 反向加固第三条 + OpenSpec `explore.ts:132` "Don't auto-capture")— 读 Read 允许,写必须经 Capture offer + 用户明确确认两步
- 不允许"探索完成无结论"— skill 末尾必须显式输出 `## Exploration Summary` 段(沿 §2.5.6 反向加固第一条)
- 不允许 vague capture offer(如"也许更新 design")— 必须 `file:section` 具体(沿 §2.5.6 反向加固第二条)
- 不允许触发对 archived change artifacts 的修改 — archived 冻结,引导起新 change supersede(沿 v0.4 archive 不变量 + design §2.5.5 桥接)
- 不允许在用户已明示"我自己决定"的情况下直接替用户选(沿 OpenSpec `explore.ts:132` "The user decides — Offer and move on")
