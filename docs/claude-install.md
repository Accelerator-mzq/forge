# Forge for Claude Code(Tier 1 — 全功能)

**状态**:Plan 0a + Plan 0b.1 实测 PASS(2026-05-09)— hook + skill auto-trigger + commands 全功能 ENABLE。

## Prerequisites

- Claude Code 2.x 主线(plugin marketplace 协议支持)
- Node 20+
- npm 7+

## Installation

session 内逐一输入(实测路径,Plan 0a.1.4 验证):

```
/plugin marketplace add Accelerator-mzq/forge
/plugin install forge@accelerator-mzq-forge
/reload-plugins
```

预期输出:

```
Successfully added marketplace: accelerator-mzq-forge
✓ Installed forge. Run /reload-plugins to apply.
Reloaded: <N> plugins · <M> skills · <K> agents · <L> hooks · <X> plugin MCP server · <Y> plugin LSP server
```

**重启 session**(`/exit` + `claude`)— SessionStart hook 才生效注入 `using-forge` bootstrap。

## Verify

session 内输入:

```
我想做个 todo list 应用
```

预期:AI 自动 invoke `Skill(forge:brainstorming)` + 走完整流程(preflight 检查 git base → 提问 → 方案对比 → 设计 → 写 `forge/drafts/<date>-todo-list.md` → commit)。

如果 AI **没** invoke skill(直接写代码 / 提问其他问题):

1. 检查 plugin enabled:`cat .claude/settings.local.json` 应含 `"forge@accelerator-mzq-forge": true`
2. 检查 skill 加载:输入 `/skills` 看列表是否含 `forge:brainstorming`
3. 重启 session(SessionStart hook 必须 fire)
4. 仍不 work → see [troubleshooting](#troubleshooting)

## Workflow(完整 happy path)

```
# Tier 1 全功能:8 个 /forge:* slash commands 都可用(brainstorm / propose / explore / apply / review / verify / archive / upgrade)
/forge:brainstorm <topic>     # 调 brainstorming skill
/forge:propose <change-id> [--from-draft <name>] [--light]
                              # 调 writing-plans skill(P3 scale-aware:< 200 行 → light mode)
/forge:explore --change <id>  # 不确定方案时探路(调 code 分析 skill)
/forge:apply [--parallel]      # 调 subagent-driven-development + test-driven-development
/forge:review                 # 调 requesting/receiving-code-review,写 forge-review/v2 marker
/forge:verify                 # 调 verification-before-completion,写 forge-verify/v2 marker
/forge:archive                # 调 helper archive(v4:v2 marker schema 校验 + spec deltas apply)
/forge:upgrade                # v0.x → v1.x 升级 legacy 项目(v4:删 --resign-markers flag)
# v4:删 /forge:ack-confirm —— 反加固两步 ack 协议消亡,WARNING 给用户自管
```

每个 command 内部调 `node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs"` helper,helper 内 spawn `npx -y --package @accelerator-mzq/forge@^4.0.0 -- forge ...` 拉 forge CLI(避开 v0.2 P1 全局 PATH 问题)。

## Troubleshooting

### 装 plugin 后 brainstorming 不 auto-trigger

```bash
# 1. 验证 plugin loaded
ls ~/.claude/plugins/cache/accelerator-mzq-forge/forge/   # 应含 .claude-plugin/ + skills/ + commands/ + hooks/

# 2. hook 本地预验证(off-session)— 确认 hook 脚本 work
cd ~/.claude/plugins/cache/accelerator-mzq-forge/forge
CLAUDE_PLUGIN_ROOT="$(pwd)" bash hooks/run-hook.cmd session-start
# 应输出合法 JSON,含 hookSpecificOutput.additionalContext + using-forge skill body
```

如果 hook 输出 OK 但 session 内仍不 trigger,可能 Claude Code 缓存。`/reload-plugins` 后再 `/exit` + `claude` 完全重启。

### `forge validate` 报 "command not found"

不需要全局装 forge。plugin commands.md 自动调 `${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs` helper(plugin tarball 自带),helper 内部 npx 拉 forge。

如果你想全局装:`npm i -g @accelerator-mzq/forge`(可选 — Plan 3 helper 已避开 P1)。

### Cross-plugin 同名(superpowers + forge brainstorming)

两 plugin 同装时,Claude Code skill auto-trigger 池含两个同名 brainstorming(`superpowers:brainstorming` + `forge:brainstorming`)。AI 用 description differentiator 选哪个。

- 想用 forge 路径:在项目 `.claude/settings.local.json` disable superpowers
- 想用 superpowers 路径:disable forge
- 都启用:由 description differentiator 决定,Plan 0a.1 known-issue 推 v1.2 spike 稳定性

