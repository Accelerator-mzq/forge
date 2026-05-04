# Phase 0.5 Spike Results

**测试日期**:2026-05-05
**spec 引用**:[2026-05-04-forge-fusion-design.md](../docs/specs/2026-05-04-forge-fusion-design.md) §6 Phase 0.5
**Plan 1 引用**:[2026-05-05-plan-1-foundation.md](../docs/plans/2026-05-05-plan-1-foundation.md) §Phase 0.5

## Acceptance Test 结果矩阵

| Harness | Bootstrap 注入路径 | 自动触发 brainstorming | 结果 | 详情 |
|---|---|---|---|---|
| Claude Code | `.claude/skills/<name>/SKILL.md` | YES | **PASS** | [详情](claude-code/ACCEPTANCE-TEST.md) — 0 code / 7 question signals;AI 列 ABCD 选项让用户选,主动提到 `forge/drafts/` 路径 |
| Codex | `.agents/skills/<name>/SKILL.md` 或全局 `~/.agents/skills/`(共享 Claude Agent SDK 约定) | YES | **PASS** | [详情](codex/ACCEPTANCE-TEST.md) — 0 code / 4 question signals;AI 给 3 方案对照表 + 1 澄清问题 |
| OpenCode | skill 路径(`~/.config/opencode/skills/` / `.opencode/skills/`)**只注册工具,不自动注入**。需要写 JavaScript plugin(`experimental.chat.messages.transform`)实现 session-start 注入 | NO | **FAIL** | [详情](opencode/ACCEPTANCE-TEST.md) — 3 code apply_patch / 0 question;AI 直接写 src/cli/ 下 3 个 TS 文件,完全跳过 brainstorming |

## v0.1 实际范围决策

根据 Plan 1 退出标准:

- 全 3 通过 → v0.1 = 3 harness
- **仅 Claude + Codex 通过 → v0.1 = 2 harness,OpenCode 推 v0.2** ← 本次结果
- 仅 Claude 通过 → v0.1 = 1 harness
- 全失败 → 回到设计阶段

**本次决策**:**v0.1 = Claude Code + Codex(2 harness),OpenCode 推 v0.2**。

## OpenCode v0.2 实施路径

- 参考 `superpowers/.opencode/plugins/superpowers.js`(本地 `D:/ClaudeProject/opsp/superpowers/.opencode/`)写 forge plugin
- plugin 通过 `experimental.chat.messages.transform` hook 在每个 session 开头注入 `using-forge` 内容
- forge OpenCode adapter 要把 plugin 文件铺到 `<project>/.opencode/plugins/forge.js`(具体路径研究 v0.2 时再定)

## 对后续 Plan 2 / 3 的影响

- **adapter 实现范围**:Plan 2 / 3 只写 `claude.ts` + `codex.ts` 两个 adapter,**不写** `opencode.ts`
- **§5.1 release gate smoke test 范围**:每个 release 跑 Claude Code + Codex 两个 smoke,不跑 OpenCode
- **决策快照同步**:spec 决策 #4 / #18 自动收紧到本结果
- **Codex skill 路径精确**:`.agents/skills/<name>/SKILL.md`(不是 `.codex/skills/`),Plan 2 写 codex adapter 时记牢

## 失败原因详细记录(供 v0.2 参考)

**OpenCode 缺自动注入机制**:

OpenCode 的 skill 发现机制(`~/.config/opencode/skills/` 和项目级 `.opencode/skills/`)只把 SKILL.md 注册为**可调用工具**,而非"会话开始就拼到 system prompt"。也就是说:

- AI 看到的 system prompt 不含 `using-forge` 内容
- AI 只在用户明确触发 skill 时才"知道"该 skill 存在
- 用户输入"我想做个 todo list"时,AI 没有任何"红旗清单"约束,直接按本能写代码

**plugin 是唯一通路**:OpenCode 提供 `experimental.chat.messages.transform` plugin hook,允许 plugin 在每条消息发往 LLM 前修改它(包括加 system prompt)。superpowers 已实现一个,可借鉴。但实现 plugin 不在 v0.1 范围。
