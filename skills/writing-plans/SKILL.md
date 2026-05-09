---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the forge:writing-plans skill to create the implementation plan."

**Context:** This should be run in a dedicated worktree (created by brainstorming skill).

**Save plans to:** `forge/changes/<change-id>/tasks.md`(forge 把 plan 直接落到 change 的 tasks.md;design.md 与 specs/ 由 propose 模板另行生成)

- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## Scale-aware mode (P3 fix from v0.2 fixture testing)

**Before writing tasks**, decide between **light mode** (1-2 tasks, ~50-80 lines) vs **full mode** (5+ tasks, ~200+ lines with strict RED → GREEN → REFACTOR + verification per task).

### Decision logic

1. **Read** `forge/changes/<change-id>/proposal.md` — count the line number (e.g., `wc -l`)
2. **Read** `forge/config.yaml#writing_plans.light_threshold`(if exists);默认 200(由 `validateWritingPlansConfig` fallback,见 `src/core/schema/writing-plans-config.ts`)
3. **Check** `--light` flag(若用户 `/forge:propose <id> --light` 显式传 → 强制 light mode,跳过 threshold 判定)
4. **Decide**:
   - proposal 行数 < `light_threshold` 或 `--light` flag → **light mode**
   - proposal 行数 >= `light_threshold`(默认)→ **full mode**

### Light mode template (trivial change)

- 1-2 tasks(typically 1 task with multiple steps)
- 跳过 RED → GREEN → REFACTOR 三段强约束(直接写实现 + 写测试,合并到 1-2 step)
- 跳过 per-task verification + commit(只在 task 末尾一次性 verify + commit)
- 总长度 ~50-80 行 tasks.md

**适用场景**:加 1 个字段、加 1 个 CLI flag、改 1 个常量、修 1 个简单 bug、纯文本修改 / docs 改动

### Full mode template (complex feature, 默认)

- 5+ tasks,each with `RED → GREEN → REFACTOR` + verification + commit
- 每 task 独立可 review,每 step 2-5 分钟可执行
- 总长度 200+ 行(参见现有 forge-repo plans)

**适用场景**:新模块、跨多文件 refactor、协议变动、新增子系统

### Why this matters (v0.2 P3 fixture test 教训)

v0.2 fixture 测试发现:trivial change(用户原话"加 1 个 priority 字段 + `-p` flag")被 writing-plans 强制套 5-task 完整模板 + 每 task RED/GREEN/REFACTOR + verification → tasks.md **511 行**(后续 Plan 0b.1 实测进一步发现可达 1378 行)。

scale-aware mode 让 trivial change 走 light mode,避免:

- 文档冗长降低 review 体验
- AI 单次输出长度边界压力
- "为了 TDD 而 TDD" 形式主义

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**

- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use forge:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (forge v0.1 不提供 inline executing 模式,统一用 subagent 派发)

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**

- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Remember

- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Execution Handoff

After saving the plan, offer execution choice:

> "Plan complete and saved to `forge/changes/<change-id>/tasks.md`. Execution will use the **Subagent-Driven** approach: each task is dispatched to a fresh subagent with two-stage review (spec compliance + code quality)."

**REQUIRED SUB-SKILL:** Use forge:subagent-driven-development to implement this plan task-by-task.

Note: forge v0.1 仅提供 subagent-driven 模式,无 inline executing 模式。
