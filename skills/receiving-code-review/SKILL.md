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

## Severity 判定指引(v4 prose 风格)

review feedback 的 `severity` 字段仅作 prose 分级用,**v4 不参与 archive fence 门禁**(v3 marker `review_outcomes` 数组已删,review marker schema 极简到 5 字段;沿 `src/core/markers/types.ts:ReviewMarker`)。每条 finding 仍按以下三级分类用于讨论:

### 三级语义

| 级别           | 语义                                                               | 主代理决策                                                                     |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **blocking**   | 事实层面客观不一致(测试 fail / API 签名不匹配 / 实施明显违背 spec) | 必修后才能写 `.review-passed`;不修就 abort 让用户决                            |
| **important**  | 需做但有讨论空间(scope / 优先级 / 实施代价)                        | 优先采纳;有合理证据反驳可拒(沿"用证据反驳"原则);拒绝时必须在对话内显式记录理由 |
| **suggestion** | 可改进但不阻塞(风格 / 命名 / 微优化 / 未来扩展点)                  | 顺手 fix;不 fix 转入 `## Out of Scope` 或 `## Future Work` YAML 块进 backlog   |

### 判定决策树(给 reviewer-receiver)

```
收到 review finding 后,先看 severity:

IF severity == blocking
  必修。fix → commit。"用证据反驳"原则:若有事实证据 finding 错(如 reviewer 误读 code)→ 在对话内显式反驳并不修,不写 .review-passed 前必须澄清

IF severity == important
  优先 fix;若有合理理由不 fix → 在对话内显式记录"已用证据反驳"(不存档到 marker — v4 marker 不持久化 review_outcomes)

IF severity == suggestion
  能 fix 顺手 fix;不 fix 走 ## Out of Scope / ## Future Work YAML 块进 backlog
```

**不要写 v3 marker 字段**(`review_outcomes` / `severity_candidate` / `candidate_type` / `finding_hash` / `severity_acked_by` / `automated` 等已删 — v4 `ReviewMarker` schema 校验拒绝写入)。

## The Bottom Line

**External feedback = suggestions to evaluate, not orders to follow.**

Verify. Question. Then implement.

No performative agreement. Technical rigor always.

## Scope Category Guidance(plan-9b 共用 reference)

判定一个 review 意见应走 SUGGESTION 还是 `## Out of Scope` / `## Future Work` / `## Non-Goals` 时,**先参考共用决策表**:`skills/_shared/scope-category-guidance.md`(plugin runtime 下:`_shared/scope-category-guidance.md`)。

特别注意 §"常见误判 → 修正"段 — 不要默认把所有"不做"塞 SUGGESTION;跨 change 项应走 out-of-scope / future-work / non-goal,沿 `forge-scope-entries/v1` YAML 块。
