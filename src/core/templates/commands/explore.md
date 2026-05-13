---
name: explore
description: Use when 用户主动需要非线性思考空间 — 任何阶段触发,可不绑定 change(skeleton 阶段:Task 3 将替换为完整 ~30 行薄包装,沿 design §2.5.3 命令形态)
argument-hint: '[<topic> | --change <id>]'
---

# /forge:explore(Task 3 skeleton)

本 skeleton 仅为让 commands.test.ts 通用断言(frontmatter description + argument-hint + body + 禁止行为段)不 fail。

Task 3 将替换为完整 ~30 行薄包装:沿 design §2.5.3 命令形态(`[<topic> | --change <id>]`)+ §2.5.4 协议步骤 5 步(读上下文 / 调 forge:exploring skill / 探索 / capture offer / 用户决定)+ 调起 `forge:exploring` skill。

## 禁止行为(Task 3 完善)

- **不允许 AI 在 explore 阶段直接 Write/Edit 修改 `forge/changes/*` artifacts**(沿 design §2.5.6 反向加固第三条 + OpenSpec explore.ts:132 "Don't auto-capture")
- **不允许"探索完成无结论"**— skill 末尾必须显式输出 Exploration Summary 列 tentative decisions + capture offer(沿 §2.5.6 反向加固第一条)
- **不允许触发对 archived change artifacts 的修改** — archived change 是冻结的,explore capture 命中 archived → 拒绝(沿 v0.4 archive 不变量 + §2.5.5 桥接)
