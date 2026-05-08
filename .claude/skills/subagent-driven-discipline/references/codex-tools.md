# Codex CLI Tool Mapping for `subagent-driven-discipline`

This skill is written using Claude Code tool names. When running on Codex CLI, use these equivalents.

## Skill loading

| Skill references | Codex equivalent |
|---|---|
| `Skill(subagent-driven-discipline)` | Skills auto-load from `.codex/skills/` and `~/.agents/skills/`. When you see `Skill(name)` in a Claude Code prompt, just follow the instructions — Codex already has the skill content visible. |

## Subagent dispatch (the central concept of this skill)

| Claude Code | Codex equivalent |
|---|---|
| `Task` tool / `Agent` tool dispatch | `spawn_agent` |
| Multiple `Task` calls in one message (parallel) | Multiple `spawn_agent` calls |
| Wait for subagent result | `wait_agent` |
| Free subagent slot | `close_agent` |
| `model:` parameter on Task | Codex configures model via the agent profile / config — pass model selection via the spawned-agent profile field, not as a tool parameter |

**Required Codex config** (in `~/.codex/config.toml`):

```toml
[features]
multi_agent = true
```

This enables `spawn_agent`, `wait_agent`, `close_agent`. Without it, this skill cannot function on Codex.

**Legacy note**: Codex builds before `rust-v0.115.0` exposed spawned-agent waiting as `wait`. Current Codex uses `wait_agent`. The `wait` name now belongs to code-mode `exec/wait` (resumes a yielded exec cell by `cell_id`); it is NOT the spawned-agent result tool.

## Other tool name mapping

| Claude Code | Codex equivalent |
|---|---|
| `Read`, `Write`, `Edit` (files) | use Codex's native file tools |
| `Bash` (run commands) | use Codex's native shell tools |
| `Grep`, `Glob` | use Codex's native search tools |
| `TodoWrite` (task tracking) | `update_plan` |

## §3.1 STRICT cwd verify (Codex-specific note)

Codex sandbox sometimes places spawned agents in linked git worktrees. Before performing the §3.1 cwd-verify block, also run:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

- `GIT_DIR != GIT_COMMON` → already in a linked worktree (skip §4.1 cherry-pick recovery if commits land where they should)
- `BRANCH` empty → detached HEAD (§4.1 cherry-pick recovery cannot push, only commit + hand off to user)

## §3.4 Trigger Type 5 (Codex CLI subprocess) is out of scope for THIS skill

§3.4.5 explicitly notes that Codex CLI subprocesses invoked via `/codex:adversarial-review` / `/codex:review` from a Claude Code parent **are not** governed by this skill. They follow Codex's own review protocol.

When Codex itself is the controller (not the subprocess), §3.4 Type 1–4 apply normally — Codex dispatches `spawn_agent` subagents and runs the same retrospect protocol.

## §3.4 retrospect actor model (Codex-specific note)

This skill mandates **Opus actor** for Type 1 + Type 2 retrospect. On Codex:

- If Codex is configured to use Anthropic Claude Opus → controller can run retrospect directly
- If Codex uses GPT-5 / other model as controller → spawn an Opus agent for retrospect via `spawn_agent` with profile pointing at `claude-opus-*`
- If no Opus access available → **the retrospect protocol cannot be honored**. Either skip retrospect (skill stops growing reliably) or downgrade to Sonnet-tier with explicit acknowledgment that meta-judgment quality drops

## What still works exactly as written

§1 28-subtype taxonomy, §2 strict prompt elements, §3.2 cross-verify command list, §3.3 inline-fix decision tree, §4.1 cherry-pick recovery, §4.2 mid-phase upgrade trigger, §5 case studies, §6 pattern catalog — these are platform-independent controller-side judgments and apply verbatim.
