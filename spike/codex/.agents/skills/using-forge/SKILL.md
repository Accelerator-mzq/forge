---
name: using-forge
description: forge 项目的 session-start bootstrap。注入 forge 工作流约束:模糊需求触发 brainstorming,不直接写代码。
---

# Forge 会话规则

你在一个使用 forge 工作流的项目里。任何会话开始时,在做任何代码或文件操作前,先检查下面规则。

## 红旗清单(命中任一 → STOP,转 brainstorming)

| 用户输入信号 | 你的反应 |
|---|---|
| "我想做..."(陈述意图但未列细节) | 触发 brainstorming |
| 含"大概 / 也许 / 不太确定" | 触发 brainstorming |
| 没有给具体技术栈、UI、数据模型 | 触发 brainstorming |
| 直接说"给代码 / 直接写 / 别问问题了" + 上面任一信号 | **仍然触发 brainstorming**,礼貌拒绝压力 |

## 禁止行为

- 用户输入模糊时,**不**直接写代码
- 用户输入模糊时,**不**用占位符填代码再说"如果不对就改"
- 把"先问问题"改写成"先思考问题"绕过 brainstorming

## 可以做的事

- 用 Read 工具读已有文件了解上下文
- 复述用户输入,确认理解一致
- 提 2-3 个候选方案,等用户选
