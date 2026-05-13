---
name: exploring
description: Use when 用户在任何阶段需要非线性思考空间(brainstorm 前 / apply 中 / 选项对比 / vague idea)— 不强制 reach conclusion 但必须显式收尾 + capture offer 含具体 forge 路径;不允许 explore 阶段直接写 artifacts(沿 design §2.5)
---

# forge exploring

## Overview

forge:exploring 是 forge 协议的**非线性思考空间** — 任何阶段主动触发,非产物驱动,鼓励 ASCII diagram / 选项对比 / 反思 assumption。

与 OpenSpec 上游 `/opsx:explore` 关键差异:OpenSpec 允许"不 reach a conclusion / continue exploring later"(`explore.ts:136-143`),在 AI 手里会被滥用作偷懒理由(无限发散 / 不收尾 / 最后没 capture)。**forge 反向加固**(沿 design §2.5.6 三条):

1. **必须显式收尾**(Exploration Summary 段)
2. **Capture offer 必须可执行**(具体 `file:section`)
3. **不能在 explore 阶段直接写 artifacts**(必须 capture offer + 用户确认两步)

## Methodology(reference 上游协议)

**REQUIRED BACKGROUND**:必须先懂 forge:test-driven-development(skill 的 forge-eval RED-GREEN 验证基础)。

核心论点(沿上游协议 + forge 加固):

- **OpenSpec 上游 `/opsx:explore` 不变量**:"thinking, not implementing"(`explore.ts:15`)+ "The user decides — Offer and move on"(`explore.ts:132`)+ "Don't auto-capture"(`explore.ts:132`)
- **forge-eval RED-GREEN 验证不变量**(沿 forge:writing-skills):"If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing" — 本 skill 通过 `forge-eval/scenarios/exploring.yaml` 3 scenarios(vague-idea / mid-implementation-stuck / option-compare)验证 baseline AI 没 skill 时必然失分
- **forge-specific 反向加固**:OpenSpec "What You Don't Have To Do"(`explore.ts:136-143`)在 AI 手里被滥用 → forge 加三条反向加固(详 §"forge-specific 反向加固")

## When to Use

- 任何阶段用户主动触发 `/forge:explore` 或表达需要"想想"(vague idea / specific problem / option compare 等)
- mid-implementation 实施途中需要回头思考,但**非阻塞 issue**(若是阻塞 issue 走 §"与 Fluid Pause 边界"判定 → Fluid Pause)
- 用户在 `/forge:brainstorm` 起 draft 之前不确定 idea 方向 — explore 开放思考后再决定起 brainstorm
- 用户在 `/forge:propose` 后想再回头探索某个 design 决策 — `explore --change <id>` 读 4 件套作上下文

## When NOT to Use

- 用户明确给具体 task 实施请求 → 走 `/forge:apply` / 主代理直接实施,不进 explore
- 阻塞型 mid-implementation issue → 走 §2.1 Fluid Pause,**不**走 explore(见 §"与 Fluid Pause 边界")
- 写 forge 自身的协议文档 → 用 forge:writing-skills + forge:writing-plans
- 修 typo / 加一行示例的小改动(non-behavior change) → 直接做,跳协议

## 协议步骤(沿 design §2.5.4)

1. **读上下文**(若 `--change <id>`):`forge/changes/<id>/{proposal,design,tasks,specs/*}.md`。
   - 主代理在 `/forge:apply` subagent 实施中、检测到唯一未归档 change 时,允许省略 `--change`(沿 v0.4 推断模式)。
2. **进入 exploration mode**:本 skill 引导。
3. **探索阶段**:
   - 鼓励 ASCII diagram(system diagrams / state machines / data flows / comparison tables)
   - 鼓励选项对比(`Options: 1/2/3` + tradeoff 行)
   - 鼓励反思 assumption(包括用户的和你自己的)
   - 不限定输出格式,不强制 reach a conclusion
   - 用户随时叫停 / 转向
4. **Capture offer 阶段**:见下方 capture decisions 表 + §2.6.6 区分指引表。
5. **Capture 是 offer 不是命令**:AI 给 offer 后用户可拒绝 / 修改 / 推迟。

## Stance(沿 OpenSpec 上游 + forge 化)

- **Curious, not prescriptive** — 提自然涌现的问题,不照剧本走
- **Open threads, not interrogations** — 抛多个有趣方向让用户选,不漏斗
- **Visual** — 自由使用 ASCII diagram 帮助思考
- **Adaptive** — 跟着有趣线索走,新信息出现时转向
- **Patient** — 不急于下结论,让问题形状自然浮现
- **Grounded** — 探索真实 codebase,不光理论化

## What You Might Do

根据用户带来的不同输入:

**探索问题空间**

- 提自然涌现的澄清问题
- 挑战 assumption
- 重新框定问题
- 找类比

**调查 codebase**

- 画相关现有架构
- 找集成点
- 识别已用模式
- 暴露隐藏复杂度

**对比选项**

- brainstorm 多种方案
- 建对比表
- 勾画 tradeoff
- 给出推荐(**仅在用户明确问时**;否则沿 OpenSpec `explore.ts:132` "用户自己决定")

**可视化**

```
┌─────────────────────────────────────────┐
│     自由使用 ASCII diagram              │
├─────────────────────────────────────────┤
│                                         │
│      ┌────────┐         ┌────────┐      │
│      │ State  │────────▶│ State  │      │
│      │   A    │         │   B    │      │
│      └────────┘         └────────┘      │
│                                         │
│   system diagrams, state machines,      │
│   data flows, architecture sketches,    │
│   dependency graphs, comparison tables  │
│                                         │
└─────────────────────────────────────────┘
```

**暴露 risks 和 unknowns**

- 识别可能出错的地方
- 找理解 gap
- 建议 spike 或 investigation

## forge-specific 反向加固(沿 design §2.5.6 三条)

forge skill 与 OpenSpec 上游的关键差异:OpenSpec "What You Don't Have To Do"(`explore.ts:136-143`)在 AI 手里被滥用作偷懒理由(无限发散 / 不收尾 / 不 capture)。**forge 加三条强制约束**:

### 1. 必须有显式收尾(Exploration Summary)

OpenSpec 允许"不 reach conclusion / continue exploring later",forge **不允许"探索完成无结论"**。

skill 末尾**强制 AI 输出**:

```markdown
## Exploration Summary

**Tentative decisions**(本次探索得出的临时结论,**不是定论**):

- <decision 1>
- <decision 2>

**Open questions**(仍未澄清的):

- <question 1>

**Capture offer**(给用户决定):

- 若选 <option A>,可 capture 到 `forge/changes/<id>/design.md ## <section>`
- 若选 <option B>,可 capture 到 ...
```

允许 zero tentative decisions(纯 question 状态),**但不允许 zero offer** — 必须给至少一个 capture offer,即使是"是否 capture 这次讨论的摘要"。

### 2. Capture offer 必须可执行

不允许 vague:

- ❌ "也许更新一下 design"
- ❌ "把这个想法记一下"
- ❌ "可以考虑改一下 proposal"

必须给具体 `file:section`:

- ✅ "capture 到 `forge/changes/oauth/design.md ## Token Refresh Strategy` 段"
- ✅ "capture 到 `forge/drafts/audit-logging.md`(新建 draft)"
- ✅ "capture 到 `forge/changes/oauth/proposal.md ## Out of Scope` YAML 块(沿 §2.6 schema)"

### 3. AI 不能在 explore 阶段直接写 artifacts

写入必须经过两步:

1. AI 给 capture offer(具体 `file:section`)
2. 用户**明确**确认("好,capture 吧" / "可以,改" 等明确指令)

**禁止 AI 在 explore turn 内调用 Write / Edit 工具修改 `forge/changes/*` artifacts**(沿 OpenSpec `explore.ts:132` "Don't auto-capture")。

- 读 artifacts(Read 工具)→ **允许**
- 写 artifacts(Write / Edit / Bash 修改文件)→ **禁止**

即使用户随口说"那就改 design 吧",也必须先反确认:"我把 `design.md ## Token Refresh` 段加上 Y,可以吗?",得到明确"yes"再改。

## 与 §2.1 Fluid Pause 边界(沿 design §2.5.5)

mid-implementation 触发时,**根据触发原因区分**:

| 触发原因                             | 走                                                                                 | 理由                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------ |
| 实施途中发现 issue **阻塞**当前 task | `/forge:apply` 的 Fluid Pause(§2.1)                                                | 被动触发,语义匹配 pause-with-Options |
| 实施途中**开放思考**(非阻塞)         | `/forge:explore --change <id>`                                                     | 主动触发,语义匹配 explore            |
| 实施途中发现 scope 问题              | 先 explore 判定 → 若决定扩 scope 走 explore capture;若决定不做走 §2.6 out-of-scope | 决定由 explore 引导                  |

**explore 不能绕过 archive 不变量**:archived change 是冻结的,explore 触发对 archived change artifacts 的修改 → 拒绝(沿 v0.4 archive 不变量)。

如果用户在 explore 中决定修改 archived change,**必须先反向加固提示**:"`<change-id>` 已 archived,artifacts 冻结;需起新 change supersede。capture offer 改为新 change `proposal.md` 起草"。

## Handling Different Entry Points(沿 OpenSpec + forge 化)

### Entry 1 — User brings a vague idea(无 `--change`)

```
User: 我在想加个"用户活动审计日志"功能,但不确定怎么入手 — 数据库还是文件?保留多久?

You: 审计日志是个有空间的话题。先看 dimension:

      AUDIT LOG SPECTRUM
      ════════════════════════════════════════════

      Granularity   Retention      Query Pattern
          │             │                 │
          ▼             ▼                 ▼
      ┌────────┐    ┌────────┐       ┌────────┐
      │ event  │    │ 30 天  │       │ 即时   │
      │ /req/  │    │ vs     │       │ 查询   │
      │ field  │    │ 1 年   │       │ vs     │
      └────────┘    │ vs 永久│       │ 离线   │
                    └────────┘       └────────┘

      关键 assumption:你这个项目是否有 compliance 要求(如 GDPR / SOX)?
      合规要求会决定保留时长是 30 天还是 7 年,差异巨大。

      你的项目背景?

## Exploration Summary

**Tentative decisions**:
- (暂无,等用户回应 compliance 问题后再定)

**Open questions**:
- 合规要求?
- 数据敏感度?
- 用户量(决定存储压力)

**Capture offer**:
- 若决定起 audit-logging change:capture 到 `forge/drafts/audit-logging.md`(新建 draft)
- 若决定推迟 / 不做:capture 到当前任何 active change 的 `proposal.md ## Out of Scope` YAML 块(沿 §2.6 schema)
```

### Entry 2 — User brings a specific problem(无 `--change`)

```
User: 我们的 auth 系统乱七八糟,想重新设计。

You: [读 codebase] 看到三个集成点纠缠:

     ┌─────────────────────────────────────────────┐
     │              CURRENT AUTH FLOW              │
     └─────────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
     ┌─────────┐  ┌─────────┐  ┌─────────┐
     │ Google  │  │  GitHub │  │  Email  │
     │  OAuth  │  │  OAuth  │  │  Magic  │
     └────┬────┘  └────┬────┘  └────┬────┘
          │             │             │
          └─────────────┼─────────────┘
                        ▼
                  ┌───────────┐
                  │  Session  │
                  └─────┬─────┘
                        │
                        ▼
                  ┌───────────┐
                  │   Perms   │
                  └───────────┘

     三个 tangle:
     1. Session 状态散在 OAuth 三家(各家有自己 session lifetime)
     2. Permission check 散在 routes(没统一 middleware)
     3. Magic email 与 OAuth 走不同 path(有重复)

     最痛的是哪个?

## Exploration Summary

**Tentative decisions**(等用户回应后修订):
- 三 tangle 中最痛的可能是 (1) session 不统一

**Open questions**:
- 哪个 tangle 实际造成 bug 最多?
- 是否有外部约束(GDPR session 限制 / 合规审计)?

**Capture offer**:
- 若决定起 auth-refactor change:capture 到 `forge/drafts/auth-refactor.md`(新 draft 含三 tangle 分析)
- 若仅想记录现状不立 change:capture 到当前 change 的 `design.md ## Background`
```

### Entry 3 — User is stuck mid-implementation(`--change <id>`)

```
User: /forge:explore --change add-oauth-integration
      OAuth refresh token 在过期边界处理比想象复杂,我需要重新想想。

You: [读 forge/changes/add-oauth-integration/{proposal,design,tasks,specs/oauth/spec.md}]

     你在 tasks.md 的 task 4("Implement OAuth flow")卡住,design.md 没提
     refresh token grace period。让我画一下:

     ┌─────────────────────────────────────────────┐
     │            REFRESH TOKEN GRACE              │
     └─────────────────────────────────────────────┘

     现状(design.md 写的简化模型):
        access_token expires → request fails → refresh → retry

     实际(你发现的复杂度):
        ┌─────────┐
        │ Client  │  时钟漂移 ±5min
        │  Clock  │  ─────────────┐
        └─────────┘               │
            │                     ▼
            ▼              ┌────────────┐
     ┌─────────┐           │ Server 时钟│
     │access_  │ ◀──────── │  3rd-party │
     │token    │   时差    │   IdP 时钟 │
     │exp time │           └────────────┘
     └─────────┘

     三时钟域(client / server / IdP),refresh window 该按哪个为准?

     Options:
     1. Server 时钟唯一权威(忽略 IdP exp),需要主动 sync
     2. IdP `exp` 字段权威,加 grace period(如 30s)
     3. 双 token(access + refresh),refresh 自带长 lifetime

     这是**开放思考**(非阻塞 issue) → 走 explore 不走 §2.1 Fluid Pause:
     你还没尝试实施失败,是发现 design 不完整需要回头想。

## Exploration Summary

**Tentative decisions**:
- design.md 当前 token model 过于简化,需要补 refresh 子模型
- 三 option 都可选;option 2(IdP `exp` + grace period)是行业默认

**Open questions**:
- IdP 是否承诺时钟精度?
- grace period 应硬编码还是配置化?

**Capture offer**:
- 若选 option 2:capture 到 `forge/changes/add-oauth-integration/design.md ## Token Refresh Strategy`(新增段);**注意**:design.md 改后 marker `content_hash` 失效,需要重 verify
- 若决定扩 scope(加 IdP 时钟同步):capture 到 `proposal.md ## What Changes`(扩本 change)
- 若决定不做(留 v1.1):capture 到 `proposal.md ## Out of Scope` YAML 块(沿 §2.6 schema)
```

### Entry 4 — User wants to compare options

```
User: 我在评估架构决策:
      - A:主库 audit_log 表(强一致,放大写)
      - B:独立 ClickHouse(高吞吐,跨库 transaction 难)
      告诉我哪个更合理。

You: forge:exploring 下的对比请求 — 沿 OpenSpec `explore.ts:132` "用户自己决定"原则,
     我不直接选,但给完整 tradeoff 帮你决定。

     ┌─────────────────────────────────────────────────┐
     │       AUDIT LOG: 主库 vs 独立 ClickHouse        │
     └─────────────────────────────────────────────────┘

                          A (主库)        B (ClickHouse)
     写性能 (TPS)         50K             500K
     一致性               ACID             eventual
     运维复杂度           +0               +1 (独立服务)
     查询延迟 (P99)        5ms              50ms
     合规审计完整性       强               需要事务日志验证
     演化成本             低 (改 schema)   高 (跨库 schema 协调)
     冷数据归档           需要分区策略     ClickHouse 内置 TTL

     **关键 dimension**:audit log 写量是否会超过主库 5% 容量?
     - 若否(< 5%):A 更合理(运维简单 / 一致性强)
     - 若是(> 5%):B 不可避免(主库写放大风险)

## Exploration Summary

**Tentative decisions**(用户决定):
- 选择依赖 audit 写量占比(< 5% 选 A,否则 B)

**Open questions**:
- 你预估的 audit 写量?

**Capture offer**:
- 若选 A:capture 到 `forge/changes/<id>/design.md ## Architecture Decision`(段加 "A: 主库 audit_log,理由:写量 < 5% 主库容量")
- 若选 B:capture 到 `design.md ## Architecture Decision`(段加 "B: 独立 ClickHouse,理由:写量 > 5% 主库容量")
- 若推迟决定:capture 到 `proposal.md ## Open Questions`(沿 design §2.6 schema)
```

### Entry 5(forge 专属)— User triggers out-of-scope insight

```
User: /forge:explore --change add-oauth-integration
      我们应不应该顺便加 SAML 支持?

You: [读 add-oauth-integration 现状] proposal.md `## What Changes` 只列了 OAuth
     (Google + GitHub),没提 SAML。

     SAML vs OAuth 是企业级 vs 消费者级路线分支:

     SAML 主要用于:
     - 企业 SSO
     - 集中 IdP(Okta / Azure AD)
     - SP-initiated / IdP-initiated flow

     OAuth 主要用于:
     - 个人账户登录
     - 第三方授权(API access)

     **加 SAML 进本 change 会**:
     1. 扩三倍实施范围(SAML 协议 + IdP 集成 + cert handling)
     2. design.md 当前 token model 不适用(SAML 是 XML assertion 不是 JWT)
     3. 推迟本 change 完成 ~4-6 周

     **判定**:这**不是本 change 的 in-scope work**(沿 design §2.6.6 区分指引)。
     SAML 应:
     - 若未来确认要做 → §2.6 `## Future Work`(design.md)
     - 若决定永不做(消费者产品)→ §2.6 `## Non-Goals`(proposal.md)
     - 若中性观望 → §2.6 `## Out of Scope`(proposal.md)

## Exploration Summary

**Tentative decisions**:
- SAML 不在本 change scope,应转 §2.6 follow-up entry

**Open questions**:
- 你这个项目是消费者还是企业产品?(决定 SAML 转 Future Work 还是 Non-Goals)

**Capture offer**:
- 若选"未来可能做":capture 到 `forge/changes/add-oauth-integration/design.md ## Future Work` YAML 块,`category: future-work`(沿 §2.6.3 schema)
- 若选"原则反对做":capture 到 `proposal.md ## Non-Goals` YAML 块,`category: non-goal`
- 若中性:capture 到 `proposal.md ## Out of Scope` YAML 块,`category: out-of-scope`
```

## §2.6.6 区分指引表(out-of-scope vs SUGGESTION)

AI 倾向把所有"不做"的项都塞 SUGGESTION 持挂,而不写到 out-of-scope。本 skill 引导区分:

| 状态                           | 写到                                                | 语义                        | AI 判定指引                                        |
| ------------------------------ | --------------------------------------------------- | --------------------------- | -------------------------------------------------- |
| **应在本 change 做但低优先级** | `verify_findings` / `review_outcomes` 中 SUGGESTION | 本 change 内的 nice-to-have | "可定位 + 可修复 + 不做也不影响本 change 核心目标" |
| **本 change 不做,未来可能做**  | `design.md` `## Future Work` YAML 块                | 跨 change 长期 backlog      | "实施会扩 scope,但目标方向一致"                    |
| **本 change 不做,原则反对做**  | `proposal.md` `## Non-Goals` YAML 块                | 反目标                      | "实施会偏离项目方向 / 违反核心约束"                |
| **本 change 不做,无强烈意见**  | `proposal.md` `## Out of Scope` YAML 块             | 中性 out-of-scope           | "明显不属于本 change 但未来可能做也可能不做"       |

## Capture decisions 表(沿 design §2.5.4)

| 探索结论类型                          | 落地位置                                                                                                         | 后续动作                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| New requirement / Requirement changed | `forge/changes/<id>/specs/<capability>/spec.md`                                                                  | marker 失效(`content_hash` 变),提示用户重 verify |
| Design decision made                  | `forge/changes/<id>/design.md`                                                                                   | marker 失效,提示重 verify                        |
| Scope changed(扩本 change)            | `forge/changes/<id>/proposal.md ## What Changes`                                                                 | marker 失效,提示重 propose review                |
| **Out-of-scope 识别(转 follow-up)**   | `forge/changes/<id>/proposal.md ## Out of Scope` / `## Non-Goals` 或 `design.md ## Future Work` YAML 块(沿 §2.6) | 不影响 marker(out-of-scope 不是 change 内容)     |
| New work identified(本 change 必做)   | `forge/changes/<id>/tasks.md`                                                                                    | marker 失效,需重 apply                           |
| Assumption invalidated                | 相关 artifact                                                                                                    | 看具体                                           |

## 红旗清单 — STOP and Start Over

这些念头说明你正在 rationalize,STOP:

| 想法                                                                       | 现实                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| "用户没说要 capture,我不给 capture offer 直接结束"                         | Capture offer **必须**给(沿 §2.5.6 第二条)— 即使是"capture 这次讨论的摘要到 `design.md ## Background`"                                |
| "我直接 Write/Edit 改 `design.md`,反正用户应该会同意"                      | 禁止 — 写 artifacts 必须经 capture offer + 用户**明确**确认两步(沿 §2.5.6 第三条)                                                     |
| "用户在 mid-impl,我建议他在 apply 阶段直接做,不走 explore 协议"            | 错。mid-impl **阻塞** issue 走 Fluid Pause(§2.1);**开放思考**走 explore — 都不是"在 apply 中直接做"                                   |
| "时间紧,跳 Exploration Summary 收尾直接答"                                 | 时间紧时跳协议正是 baseline AI 的失败模式。即使时间压力下也给 Summary(可短,但**必须**有)                                              |
| "用户问'选 A 还是 B',我直接选 A 给他"                                      | 错。沿 OpenSpec `explore.ts:132` "用户自己决定",AI 只给对比 + capture offer,不替用户选(仅在用户明确要求"给我推荐"时给)                |
| "用户说'随便改一下 design',我直接改"                                       | 错。仍需 capture offer 明确"我把 X 改成 Y,可以吗?",得到明确"yes"再改                                                                  |
| "archived change 已冻结但用户说改,我改"                                    | 错。archived 不变量优先,引导用户起新 change supersede                                                                                 |
| "explore 是 thinking time,我可以无限发散"                                  | 错。forge 加了显式收尾约束 — 即使发散也要回到 Exploration Summary                                                                     |
| "capture offer 写 vague '更新一下 design' 就行"                            | 错。必须 `file:section` 具体(沿 §2.5.6 第二条)                                                                                        |
| "vague idea 没有上下文,不需要 capture offer"                               | 错。零上下文也给 offer — 至少"capture 到 `forge/drafts/<topic>.md` 新建 draft"                                                        |
| "用户给的是技术问题(如 OAuth refresh token),我直接答技术不走 explore 协议" | 错(沿 plan-9f scenario 2 RED 抓的失败模式)。即使是技术问题,若用户表达探索意图(如"想想"/"重新想"),仍走 explore 协议 + 给 capture offer |
| "对比选项时已经画了表,够了不用 capture offer"                              | 错。对比表是"探索结果"中间产物;capture offer 是"用户决定哪个" + "落到哪个 forge artifact"(沿 §2.5.4 capture decisions 表)             |

**全部触发表示**:回到协议步骤,从"显式收尾 + 可执行 capture offer + 不写 artifacts"三条反向加固 reinforce 整个响应。

## Bottom Line

forge:exploring 在 OpenSpec 上游 `/opsx:explore` 基础上加三条反向加固(沿 design §2.5.6):

1. **必须显式收尾**(Exploration Summary 段)
2. **Capture offer 必须可执行**(具体 `file:section`)
3. **不能在 explore 阶段直接写 artifacts**(必须 capture offer + 用户明确确认两步)

这三条是 forge 把 OpenSpec "stance, not workflow" 转成"可观测的协议响应"的关键 — 没有这三条,explore 会退化成普通对话,无 capture 落地,违反 §2.4 archive_summary `handoff_to_backlog` 设计意图(沿 §2.6.7 第 3 桥接)。

**Thinking IS valuable, but only when it crystallizes into actionable capture offers.** Don't trade structure for"自由发散" — forge 协议要求**自由 + 收尾**两者并存。
