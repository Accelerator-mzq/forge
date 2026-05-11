---
name: receiving-code-review
description: Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
---

# Code Review Reception

## Overview

Code review requires technical evaluation, not emotional performance.

**Core principle:** Verify before implementing. Ask before assuming. Technical correctness over social comfort.

## The Response Pattern

```
WHEN receiving code review feedback:

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each
```

## Forbidden Responses

**NEVER:**

- "You're absolutely right!" (explicit CLAUDE.md violation)
- "Great point!" / "Excellent feedback!" (performative)
- "Let me implement that now" (before verification)

**INSTEAD:**

- Restate the technical requirement
- Ask clarifying questions
- Push back with technical reasoning if wrong
- Just start working (actions > words)

## Handling Unclear Feedback

```
IF any item is unclear:
  STOP - do not implement anything yet
  ASK for clarification on unclear items

WHY: Items may be related. Partial understanding = wrong implementation.
```

**Example:**

```
your human partner: "Fix 1-6"
You understand 1,2,3,6. Unclear on 4,5.

❌ WRONG: Implement 1,2,3,6 now, ask about 4,5 later
✅ RIGHT: "I understand items 1,2,3,6. Need clarification on 4 and 5 before proceeding."
```

## Source-Specific Handling

### From your human partner

- **Trusted** - implement after understanding
- **Still ask** if scope unclear
- **No performative agreement**
- **Skip to action** or technical acknowledgment

### From External Reviewers

```
BEFORE implementing:
  1. Check: Technically correct for THIS codebase?
  2. Check: Breaks existing functionality?
  3. Check: Reason for current implementation?
  4. Check: Works on all platforms/versions?
  5. Check: Does reviewer understand full context?

IF suggestion seems wrong:
  Push back with technical reasoning

IF can't easily verify:
  Say so: "I can't verify this without [X]. Should I [investigate/ask/proceed]?"

IF conflicts with your human partner's prior decisions:
  Stop and discuss with your human partner first
```

**your human partner's rule:** "External feedback - be skeptical, but check carefully"

## YAGNI Check for "Professional" Features

```
IF reviewer suggests "implementing properly":
  grep codebase for actual usage

  IF unused: "This endpoint isn't called. Remove it (YAGNI)?"
  IF used: Then implement properly
```

**your human partner's rule:** "You and reviewer both report to me. If we don't need this feature, don't add it."

## Implementation Order

```
FOR multi-item feedback:
  1. Clarify anything unclear FIRST
  2. Then implement in this order:
     - Blocking issues (breaks, security)
     - Simple fixes (typos, imports)
     - Complex fixes (refactoring, logic)
  3. Test each fix individually
  4. Verify no regressions
```

After accepting and implementing feedback, append accepted items as new task entries to `forge/changes/<change-id>/tasks.md` at the end of the file, so the change record stays complete.

## When To Push Back

Push back when:

- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature)
- Technically incorrect for this stack
- Legacy/compatibility reasons exist
- Conflicts with your human partner's architectural decisions

**How to push back:**

- Use technical reasoning, not defensiveness
- Ask specific questions
- Reference working tests/code
- Involve your human partner if architectural

**Signal if uncomfortable pushing back out loud:** "Strange things are afoot at the Circle K"

## Acknowledging Correct Feedback

When feedback IS correct:

```
✅ "Fixed. [Brief description of what changed]"
✅ "Good catch - [specific issue]. Fixed in [location]."
✅ [Just fix it and show in the code]

❌ "You're absolutely right!"
❌ "Great point!"
❌ "Thanks for catching that!"
❌ "Thanks for [anything]"
❌ ANY gratitude expression
```

**Why no thanks:** Actions speak. Just fix it. The code itself shows you heard the feedback.

**If you catch yourself about to write "Thanks":** DELETE IT. State the fix instead.

## Gracefully Correcting Your Pushback

If you pushed back and were wrong:

```
✅ "You were right - I checked [X] and it does [Y]. Implementing now."
✅ "Verified this and you're correct. My initial understanding was wrong because [reason]. Fixing."

❌ Long apology
❌ Defending why you pushed back
❌ Over-explaining
```

State the correction factually and move on.

## Common Mistakes

| Mistake                      | Fix                                 |
| ---------------------------- | ----------------------------------- |
| Performative agreement       | State requirement or just act       |
| Blind implementation         | Verify against codebase first       |
| Batch without testing        | One at a time, test each            |
| Assuming reviewer is right   | Check if breaks things              |
| Avoiding pushback            | Technical correctness > comfort     |
| Partial implementation       | Clarify all items first             |
| Can't verify, proceed anyway | State limitation, ask for direction |

## Real Examples

**Performative Agreement (Bad):**

```
Reviewer: "Remove legacy code"
❌ "You're absolutely right! Let me remove that..."
```

**Technical Verification (Good):**

```
Reviewer: "Remove legacy code"
✅ "Checking... build target is 10.15+, this API needs 13+. Need legacy for backward compat. Current impl has wrong bundle ID - fix it or drop pre-13 support?"
```

**YAGNI (Good):**

```
Reviewer: "Implement proper metrics tracking with database, date filters, CSV export"
✅ "Grepped codebase - nothing calls this endpoint. Remove it (YAGNI)? Or is there usage I'm missing?"
```

**Unclear Item (Good):**

```
your human partner: "Fix items 1-6"
You understand 1,2,3,6. Unclear on 4,5.
✅ "Understand 1,2,3,6. Need clarification on 4 and 5 before implementing."
```

## GitHub Thread Replies

When replying to inline review comments on GitHub, reply in the comment thread (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), not as a top-level PR comment.

## Severity 判定指引(forge v1.0 横切层)

review feedback 中的 `severity` 字段不再是装饰,**参与 fence 门禁**(沿 design §2.3.4 review_outcomes 行 + §2.3.2 三级语义)。每条 finding 都属于以下三级之一:

### 三级语义

| 级别           | 语义                                                                                                      | 判定来源                              | 阻塞行为                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| **CRITICAL**   | 工具拒签级别 — **事实层面客观可验证的不一致**(测试 fail / hash mismatch / evidence 缺失 / API 签名不匹配) | **仅工具自动产生**(`automated: true`) | archive fence 拒签,**不能 ack 通过**                                                     |
| **WARNING**    | 要做但需决策 — 事实层面可能有问题但需人类判断,或 scope/优先级需确认                                       | **AI 主判**(`automated: false`)       | archive fence 默认拒签,**用户 CLI ack 可放行**(`forge ack propose --action ack-warning`) |
| **SUGGESTION** | 可改进但不阻塞 — 风格 / 命名 / 微优化 / 未来扩展点                                                        | **AI 主判**,无需 ack                  | archive 直接放行,进 archive_summary `handoff_to_backlog` 累积可见                        |

### AI 反向加固(critical_candidate 协议)

**CRITICAL 永远不能由 AI 直接产生**。AI 在 finding 中**不能写 `severity: CRITICAL`**,只能写:

```yaml
severity_candidate: CRITICAL
candidate_type: <test_failure | hash_mismatch | evidence_missing | coverage_gap | api_contract | manual_claim>
evidence: <定位证据,5 类格式之一>
```

工具 fence(`forge validate` / `forge archive`)按 `candidate_type` 独立验证:

- 验证通过 → 升级为 `severity: CRITICAL` + `automated: true` + `finding_hash` 锁死
- 验证失败 → fallback 为 `severity: WARNING` + `automated: false` + `severity_candidate_rejected: true`(给用户提示)
- AI 跨过 candidate 直接写 `severity: CRITICAL` + `automated: false` → **fence 拒签**

**WARNING / SUGGESTION** 由 AI 直接判定,但 evidence 必须可定位(沿 §2.3.3 D 五类:`file:line` / `artifact:section` / `change-level` / `command-output` / `tests:scenario:<name>`)。无定位的 finding fence 拒签。

### 判定决策树(给 reviewer-receiver)

```
收到 review finding 后,先看 severity:

IF severity == CRITICAL && automated: true
  必修。fix → 写 resolution_commit。不能讨价还价(工具客观事实)

IF severity == CRITICAL && automated: false
  → 这条 finding 不合规(AI 跨过 candidate 直接写)— 报错给 reviewer 重写为 candidate

IF severity == WARNING
  优先 fix;若有合理理由不 fix(scope 太大 / 实施代价过高 / 决策已被推翻),走 forge ack propose --action ack-warning,user 在 /forge:ack-confirm 中 ack

IF severity == SUGGESTION
  能 fix 顺手 fix;不 fix 进 backlog,archive 不阻塞
```

**不要把 CRITICAL 当 WARNING 处理**(走 ack 跳过):CRITICAL 是工具客观事实,无降级语义。若 AI 觉得不应该是 CRITICAL,只能在写入时用 candidate 路径让工具自己验证(沿 §2.3.3 A 不存在 CRITICAL→WARNING 降级路径)。

## v0.4 兼容(severity 简码迁移)

v0.4 的 review_outcomes 用单字母简码:

- `S` = blocking severity(对应 v1.0 `CRITICAL` candidate 路径)
- `C` = critical accepted(对应 v1.0 已 ack `WARNING`)
- `L` = low severity(对应 v1.0 `SUGGESTION`)

v1.0 fence 不接受 `S/C/L`,只接受 `CRITICAL/WARNING/SUGGESTION` 完整字符串。**简码 → 完整词的迁移由 9j sub-plan 实施**(`forge upgrade --resign-markers` 路径)。本 skill 在过渡期只接受完整词,遇到简码报错并提示运行 upgrade。

## The Bottom Line

**External feedback = suggestions to evaluate, not orders to follow.**

Verify. Question. Then implement.

No performative agreement. Technical rigor always.

## Scope Category Guidance(plan-9b 共用 reference)

判定一个 review 意见应走 SUGGESTION 还是 `## Out of Scope` / `## Future Work` / `## Non-Goals` 时,**先参考共用决策表**:`skills/_shared/scope-category-guidance.md`(plugin runtime 下:`_shared/scope-category-guidance.md`)。

特别注意 §"常见误判 → 修正"段 — 不要默认把所有"不做"塞 SUGGESTION;跨 change 项应走 out-of-scope / future-work / non-goal,沿 `forge-scope-entries/v1` YAML 块。
