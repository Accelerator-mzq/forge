---
description: 主代理读 pending ack file + AskUserQuestion 确认 + 调 forge ack confirm/reject 真正写 marker
argument-hint: '<change-id> <finding-id>'
---

You are about to handle `/forge:ack-confirm $ARGUMENTS`。

## 步骤(必须按序)

1. 解析 `$ARGUMENTS` 为 `<change-id>` `<finding-id>` 两参数(若缺,**报错并停止**)
2. 列出 `forge/changes/<change-id>/.evidence/pending-acks/<finding-id>-*.yaml`(可能多份,取最新)。**若 0 份,报错**:"No pending ack for finding <finding-id>"
3. 读 pending file 内容,提取 `action / rationale / target_severity` 等字段
4. **必须用 AskUserQuestion** 让用户确认:
   - 题目:`Confirm AI ack proposal for finding #<id>`
   - 选项:
     - `confirm`(执行 ack action)
     - `reject`(拒绝 + 让用户写 rationale)
     - `modify-rationale`(用户改 rationale 后再 confirm)
5. 根据用户选择:
   - `confirm` → 调 `forge ack confirm <change-id> <finding-id>`(CLI 对 severity-ack(ack-warning / ack-pause-warning / downgrade)写 marker ack 字段、写 ack-log、删 pending;其余 action 仅写 ack-log + 删 pending)
   - `reject` → 用 AskUserQuestion 让用户输入 `rejection rationale` → 调 `forge ack reject <change-id> <finding-id> --rationale "<text>"`
   - `modify-rationale` → 用 AskUserQuestion 让用户输入新 rationale → 重写 pending file → 回到 step 4

## 禁止行为

- 不允许跳过 AskUserQuestion 直接调 confirm(违反 §2.3.3 B 两步协议核心 — user 必须实际看到 + 确认)
- 不允许在 CI 模式下调用本 slash(CI 应该早在 propose 阶段就被 forge ack propose 拒绝)
- 不允许直接修改 marker 字段(必须经 forge ack confirm CLI)

## 与其他 forge 协议的关系

本 slash 是 §2.3.3 B 两步 propose/confirm 协议的第二步;第一步由 AI 在 receiving-code-review / verifying-three-dimensions / Fluid Pause Decision Point 等场景 invoke `forge ack propose`(写 pending file + exit 1)触发。
