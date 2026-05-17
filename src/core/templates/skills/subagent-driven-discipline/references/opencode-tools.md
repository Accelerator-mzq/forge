# OpenCode Tool Mapping for `subagent-driven-discipline`

Tested against [anomalyco/opencode](https://github.com/anomalyco/opencode) (the open-source AI coding agent at opencode.ai). This skill is written using Claude Code tool names. When running on OpenCode, use these equivalents.

## Install path (OpenCode reads `.claude/skills/` natively)

OpenCode walks up from the current working directory to the git worktree and discovers skills at the following paths (in priority order):

**Project-local:**

- `.opencode/skills/<name>/SKILL.md` (native)
- `.claude/skills/<name>/SKILL.md` (Claude Code-compatible)
- `.agents/skills/<name>/SKILL.md` (cross-platform)

**Global:**

- `~/.config/opencode/skills/<name>/SKILL.md` (native)
- `~/.claude/skills/<name>/SKILL.md` (Claude Code-compatible)
- `~/.agents/skills/<name>/SKILL.md` (cross-platform)

**Practical implication**: a single install at `.claude/skills/subagent-driven-discipline/` is read by both Claude Code AND OpenCode without duplication. You do not need a separate copy at `.opencode/skills/`.

## Skill loading

| Claude Code                         | OpenCode equivalent                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `Skill(subagent-driven-discipline)` | `skill({ name: "subagent-driven-discipline" })` (lowercase tool name; JSON object parameter) |

OpenCode auto-discovers skills and shows the agent the available skill list (name + description from frontmatter); the agent decides when to invoke `skill(...)` to load full content.

## Subagent dispatch (the central concept of this skill)

| Claude Code                        | OpenCode equivalent                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Task` tool dispatch               | The `Task` tool (per opencode docs `permission.task`) — exact case + signature is not fully documented in opencode public docs; consult opencode's runtime tool list when in doubt.                                                       |
| User-driven `@subagent` invocation | Same in OpenCode — type `@<agent-name>` in chat to invoke a subagent                                                                                                                                                                      |
| `model:` parameter on Task         | OpenCode subagents are defined as separate `.md` files with `model:` in their frontmatter — the model is picked at agent definition, NOT per-dispatch. To dispatch with different models, define multiple subagents (one per model tier). |
| `subagent_type:` parameter         | The agent name (filename without `.md`) — e.g. invoke `general` to call the built-in `general` subagent                                                                                                                                   |

**Subagent definition path** (where you create the implementer / spec-reviewer / code-quality-reviewer agents this skill assumes):

- Project: `.opencode/agents/<name>.md`
- Global: `~/.config/opencode/agents/<name>.md`

Frontmatter required: `description` + `mode`. Optional: `model`, `temperature`, `permission`, `prompt`, `steps`, `disable`, `hidden`, `color`, `top_p`.

Example agent definition matching this skill's §1 model tiers:

```markdown
---
description: implementer for mechanical / pattern-matching tasks (§1.1.1 / §1.1.2). Use for tasks where plan provides full code samples or sister-file references.
mode: subagent
model: anthropic/claude-haiku-*
permission:
  edit: allow
  bash: allow
---

[system prompt — paste §2.1 Implementation Haiku Reliability Playbook here]
```

You will need 3+ such agent files (one per model tier × role: haiku-implementer, sonnet-implementer, opus-implementer, haiku-spec-reviewer, sonnet-code-quality-reviewer, etc.) or a smaller set if you don't need all tiers.

## Other tool name mapping

| Claude Code       | OpenCode equivalent                              |
| ----------------- | ------------------------------------------------ |
| `Read`            | `read`                                           |
| `Write`           | `write`                                          |
| `Edit`            | `edit`                                           |
| `Bash`            | `bash`                                           |
| `Grep`            | `grep`                                           |
| `Glob`            | `glob`                                           |
| `TodoWrite`       | `todowrite`                                      |
| `WebFetch`        | `webfetch`                                       |
| `WebSearch`       | `websearch` (requires `OPENCODE_ENABLE_EXA` env) |
| `AskUserQuestion` | `question`                                       |
| (no equivalent)   | `apply_patch`, `lsp` (OpenCode-specific)         |

OpenCode tool names are **lowercase**, in contrast to Claude Code's PascalCase.

## §3.1 STRICT cwd verify (OpenCode-specific)

OpenCode's TUI is client/server — the agent runs in a server process that may not share cwd with the user's terminal. The §3.1 cwd verify block (`pwd` + `git branch --show-current` + `git rev-parse HEAD`) catches this — the bash output reflects the server-side cwd, which is what subsequent commits use.

## §3.4 retrospect actor model (OpenCode-specific note)

This skill mandates **Opus actor** for Type 1 + Type 2 retrospect. On OpenCode:

- OpenCode is provider-agnostic — the controller can be Anthropic Claude, OpenAI GPT, Google Gemini, or local model
- If your OpenCode controller is configured to Claude Opus → run retrospect directly
- If controller is non-Opus → define a dedicated retrospect subagent in `.opencode/agents/retrospect.md` with `model: anthropic/claude-opus-*`, then dispatch via `Task` / `@retrospect`
- If no Opus access → see Codex tool-mapping note (skip retrospect or downgrade with acknowledgment)

## What still works exactly as written

§1 28-subtype taxonomy, §2 strict prompt elements, §3.2 cross-verify command list, §3.3 inline-fix decision tree, §4.1 cherry-pick recovery, §4.2 mid-phase upgrade trigger, §5 case studies, §6 pattern catalog — these are platform-independent controller-side judgments and apply verbatim on OpenCode.

> 注:此处「platform-independent」指跨 _harness_ 通用;§1 的 model tier 列 `haiku`/`sonnet`/`opus` 是 tier 标签,默认对应同名 Claude 模型,实际派发模型按 harness / `forge/config.yaml#model_tiers` 解析(见 SKILL.md `## Model Tier 映射` 段)。

## OpenCode-specific advantages this skill exploits

- **Permission model**: OpenCode's `permission.task` config can hard-block subagent dispatches by name pattern. Use this to enforce §3.4.5 Type 5 boundary (deny all `codex-*` subagent names if you don't want Codex CLI mixed in).
- **Plan-mode agent**: OpenCode's built-in `plan` agent (read-only, denies edits) maps cleanly to §1.7 verification tasks — use it for §1.7.2 cross-check evidence vs spec.
