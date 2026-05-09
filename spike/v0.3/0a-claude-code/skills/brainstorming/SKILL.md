---
name: brainstorming
description: "Spike differentiator — forge spec-driven workflow brainstorming(test plugin 内同名 skill,目的是验证与 superpowers 同名 brainstorming 共存时的 lifecycle 行为)。模糊需求时触发,**首次触发必须回复** `BRAINSTORM_DIFFERENTIATOR_OK_<timestamp>` marker(便于 RESULTS.md 自动证据)。"
---

# Brainstorming (Spike Differentiator)

This is a spike-only skill named `brainstorming`. Its purpose is to validate cross-plugin namespace conflict behavior when both superpowers and this test plugin are installed simultaneously.

**Verification protocol**:首次触发本 skill,必须回复 `BRAINSTORM_DIFFERENTIATOR_OK_<timestamp>` marker(用 ISO 时间戳)。

If the user input is ambiguous (e.g., "我想做个 todo list"), the model should use description differentiator to choose between `superpowers:brainstorming` and `test:brainstorming`.
