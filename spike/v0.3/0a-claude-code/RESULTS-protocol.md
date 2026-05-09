# Plan 0a.1.4 — Claude Code 协议 Spike 实测结果

**日期**:2026-05-09
**Claude Code 版本**:用户实测(Claude Code 2.x 主线)
**Install transport**:Transport A(本地路径 marketplace add,见 RESULTS-install-transport.md)
**OS**:Windows 11 + Git Bash

## 协议假设验证(5 态)

| # | 假设                                                              | 结论                                | 证据                                                                                              |
| - | ----------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1 | SessionStart hook 注入 system prompt                              | **PASS**                            | `/reload-plugins` 后 session 内 AI 知道 `test:using-test` skill 存在,触发短语 work               |
| 2 | Plugin skills 进 skill auto-trigger 池                             | **PASS**                            | 用户输入 `spike protocol test` → AI 自动 invoke `Skill(test:using-test)` 并 echo `SPIKE_PROTOCOL_OK_2026-05-09T00:00:00Z` |
| 3 | Plugin `commands/` 自动注册 `/<plugin>:<cmd>`                     | **PASS**                            | `/test:test` 调起 commands.md,AI 输出 `COMMANDS_REGISTRY_OK_7f3a2b9c`                            |
| 4 | Cross-plugin 同名 brainstorming + description diff 区分            | UNVERIFIED                          | 待跑 — 用户需装 superpowers + 输入模糊 brainstorming 触发短语后填                                |

## 完整 Transcript(假设 1-3)

```
> /plugin marketplace add D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-claude-code
  ⎿  Successfully added marketplace: test-spike

> /plugin install test@test-spike
  ⎿  ✓ Installed test. Run /reload-plugins to apply.

> /reload-plugins
  ⎿  Reloaded: 6 plugins · 10 skills · 6 agents · 5 hooks · 1 plugin MCP server · 1 plugin LSP server

> spike protocol test

● Skill(test:using-test)
  ⎿  Successfully loaded skill

● SPIKE_PROTOCOL_OK_2026-05-09T00:00:00Z

> /test:test

● COMMANDS_REGISTRY_OK_7f3a2b9c
```

## Tier 1 决策(基于上表组合)

- 假设 1 + 2 PASS → **Tier 1 hook + skill 路径 unblock**,Plan 1 进
- 假设 3 PASS → **spec §2.4 commands 注册路径有保障**(commands.md 调 helper 形态可行)
- 假设 4 UNVERIFIED → spec §2.6 description differentiator 假设保留,待 cross-plugin 测试后定

## Tier 1 release 阻塞状态

✅ **解除阻塞** — forge v0.3 Tier 1(Claude Code)plugin 化路径技术上完全可行:

1. SessionStart hook + plugin skills 真进 auto-trigger 池(**v0.2 P0 真根因解的硬证据**)
2. Plugin commands 真注册 `/<plugin>:<cmd>` slash(spec §2.4 npx → run-forge.mjs helper 路径可行)
3. 本地路径 marketplace add 真 work(spec §3.3 air-gapped bundled 路径可承诺)

## Spec 修订 trigger

无强制修订(假设 4 待测,可能影响 §2.6 + §7 R6)。

## 已知 issue 实测对照

实测中无 plan known-issues 触发。Plan known-issue #1(default export 验证)和 #2(文件树注释)是 0a.3.x OpenCode 范畴,与 Tier 1 无关。
