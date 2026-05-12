---
description: 调 forge upgrade CLI(legacy adapter 清理 + marker resign)
argument-hint: '[--resign-markers <changeId>] [--recover] [--gc] [--dry-run]'
---

# /forge:upgrade

包装 `forge upgrade` CLI(v0.3 / plan-9j 落地)。

## 用法 / 选项(v6 MINOR 4:option flag 形态,不是 subcommand)

- `forge upgrade`(无 flag,沿 v0.3):清理 legacy v0.2 harness adapter 产物
- `forge upgrade --resign-markers <changeId>`(plan-9j 新增 option):升级 v0.4 marker 到 v1.0 schema

## --resign-markers 用法(plan-9j Task 2 落地)

```bash
forge upgrade --resign-markers add-oauth-refresh
```

行为:

- **S 简码** → 自动映射 CRITICAL
- **L 简码** → 自动映射 SUGGESTION
- **C 简码** → 写 pending file 到 `.evidence/pending-acks/`,exit 1 + 提示走 `forge ack confirm`
- **不自动填空** verify_findings / pause_decisions / process_evidence(违反 AI 反向加固)
- 改标 `process_evidence_unavailable_legacy: true` meta 字段
- 写 `ack-log.jsonl` action=resign 行

退出码(沿 master §3.12.3):

- 0:全部 marker resigned 或已是 v1.0
- 1:部分需 C 简码 confirm / 阶段事务失败
- 2:CI 模式拒绝(env CI=true)

## C 简码迁移协议(完整流程)

C 简码(clarification)不自动映射(沿 design §2.3.5):用户必须判断目标 severity:

1. 跑 `forge upgrade --resign-markers <changeId>` — 若含 C 简码,exit 1 + 写 pending file
2. 跑 `forge ack confirm <changeId> <findingId> --target-severity WARNING|SUGGESTION`(或走 `/forge:ack-confirm` slash)
3. 重跑 `forge upgrade --resign-markers <changeId>` 完成 resign

## sunset policy

`process_evidence_unavailable_legacy: true` 在 v2.0 sunset(沿 design §3.4.4.2):

- v1.0 / v1.1:合法
- v1.2:warning 加强
- v2.0:拒签,`forge migrate <change-id>` 自动触发 process_evidence 补录

## archive 行为(沿 plan-9j Task 3 / 4)

archive.ts 步骤 3.4 在 evidence 校验之前先跑 legacy-exemption + version-retrograde fence:

- legacy marker 缺 created_by_tool_version 字段或 `<1.0.0` → 走 legacy 路径(13 不变量精确豁免)
- **`legacy=true ⊥ (created_by_tool_version >= 1.0.0 且 resigned_by_tool_version 缺失)`** 互斥(沿 §3.4.4.1 + v6 选项 C resigned-aware):原生 v1.0 marker 不允许 legacy 标记;resigned 后 marker(含 resigned_by_tool_version 字段)允许 legacy + version 共存
- version retrograde(高版本 → 低版本)→ 拒签(沿 §3.4.4.3)
