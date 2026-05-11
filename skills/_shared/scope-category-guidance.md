---
title: Scope Category Guidance
description: AI 判定指引 — 找到一个"未实施项",该写到哪里(SUGGESTION / Future Work / Out of Scope / Non-Goal)
source-of-truth: forge v1.0 design §2.6.6
---

# Scope Category Guidance

> 此文档是 `skills/_shared/` 下的共用 reference,由 `forge:receiving-code-review` / `forge:verifying-three-dimensions` / `forge:exploring` 三 skill 引用。不要把这表抄到各 skill — 集中维护避免漂移。

## 决策表(沿 design §2.6.6)

当你识别出一个"未在本 change 实施的事项",按下表四选一,不要默认塞 SUGGESTION:

| 状态                           | 写到                                                                                    | 语义                               | 判定指引(关键词)                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **应在本 change 做但低优先级** | `verify_findings` / `review_outcomes` 的 `SUGGESTION` finding                           | 本 change 内的 nice-to-have,可不做 | "可定位 + 可修复 + 不做也不影响本 change 核心目标"(例:补一处 log message 措辞 / 加一个 edge case 测试) |
| **本 change 不做,未来可能做**  | `design.md` `## Future Work {#forge-future-work}` 段的 `forge-scope-entries/v1` YAML 块 | 跨 change 长期 backlog             | "实施会扩 scope,但目标方向一致"(例:本 change 加 OAuth 基础,refresh-token-grace-period 留 future-work)  |
| **本 change 不做,原则反对做**  | `proposal.md` `## Non-Goals {#forge-non-goals}` 段的 YAML 块                            | 反目标                             | "实施会偏离项目方向 / 违反核心约束"(例:加密产品不接受"明文密码可选项")                                 |
| **本 change 不做,无强烈意见**  | `proposal.md` `## Out of Scope {#forge-oos}` 段的 YAML 块                               | 中性 out-of-scope                  | "明显不属于本 change 但未来可能做也可能不做"(例:本 change 加 password-reset,SSO/SAML 不属于但不反对)   |

## 常见误判 → 修正

| AI 倾向                                     | 修正                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 把所有"不做"塞 SUGGESTION 持挂              | SUGGESTION 应**只**用于"本 change 内 nice-to-have";跨 change 项必须走 out-of-scope/future-work/non-goal |
| 把"未来可能做"标 Non-Goal                   | Non-Goal 是**反对**做;不确定的项应走 Future Work 或 Out of Scope                                        |
| 给 `## Out of Scope` 段填一句话不写 YAML 块 | OK — 但若有具体项,**必须**写 forge-scope-entries/v1 YAML 块带 reason(沿 plan-9b §2.6.3 reason 必填)     |
| 编 entry 的 `reason` 为空 / 写"未来再说"    | reason 是 forge 比 OpenSpec 强制升级的字段;空 reason 会被 `forge validate` 拒签为 CRITICAL              |
| 用本地化标题就改 anchor ID                  | **anchor ID 是契约**,标题文字可改(`## 不做项 {#forge-oos}`),但 `{#forge-oos}` 不可改                    |

## Fence 反向加固(`/forge:archive`)

archive 阶段若发现 SUGGESTION > 5 项 或 SUGGESTION 中含关键词(`future` / `later` / `outside scope` / `未来` / `后续` / `超出` / `另外`),给 deprecation warning 提示考虑推到 `## Future Work` / `## Out of Scope`。**仅 warning,不阻断**(沿 design §2.3 SUGGESTION 不要求 ack)。

## Cross-reference

- 数据 schema:`src/core/schemas/scope-entries.ts`(`forge-scope-entries/v1`)
- 锚点契约:`{#forge-oos}` / `{#forge-non-goals}` / `{#forge-future-work}`(沿 design §2.6.3)
- 跨 change 扫描:`forge scope scan-archived-followups <change-id>`(沿 design §2.6.5)
