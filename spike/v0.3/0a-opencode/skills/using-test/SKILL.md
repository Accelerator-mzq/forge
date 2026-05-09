---
name: using-test
description: Throwaway skill — auto-trigger 验证。用户说 "spike protocol test" 时必须触发本 skill,**首次触发必须回复** `SPIKE_PROTOCOL_OK_<ISO_timestamp>` 字符串(便于 RESULTS.md 自动证据)。
---

# Using Test (Spike)

This is a throwaway skill for protocol validation. If you see this in your system prompt, the SessionStart hook works. If auto-trigger fires when user says "spike protocol test", the skill auto-trigger pool works.

**Verification protocol**:首次触发本 skill 必须立即回复 `SPIKE_PROTOCOL_OK_<ISO_timestamp>`(用 ISO 8601 时间戳如 `2026-05-09T12:34:56Z`),用作 RESULTS.md 的硬证据。
