# stage-extensions framework 实施进度快照(会话切换 handoff)

> 本文档是会话切换 handoff。原会话 context 满,新会话读本文档 + plan 即可无缝接续。
> **任务**:实施 forge plugin 的 `stage-extensions framework`(codex review 集成)。

## 速览

- **plan(权威设计)**:`docs/plans/2026-05-15-plan-stage-extensions-framework.md`(v10,经 9 轮 Codex 对抗性 review 收敛 + v7 架构修订 + v10 C 方案)
- **分支**:`docs/plan-stage-extensions-framework`,**PR #38**(github.com/Accelerator-mzq/forge/pull/38)
- **执行协议**:`superpowers:subagent-driven-development` —— 每 Task 派 fresh implementer subagent(model sonnet)→ spec compliance reviewer → code quality reviewer → 修 → mark complete
- **环境**:Windows 11 + Git-Bash,D:\ClaudeProject\opsp\forge-repo,Node 20 / TS ESM strict / vitest / pnpm 9
- **当前测试基线**:1069 tests pass(`pnpm vitest run`),plan v10 实施目标 1081

## Task 进度(plan §2)

| Task | 状态 | commit | 备注 |
|---|---|---|---|
| 0 B-full wrapper | ✅ 已 ship | `02710da` | codex-adversarial slash + helper + prompt + 12 test |
| 1 config schema + validator | ✅ 完成 | `6921fd5` + `92fba07`(fix)| `src/core/schema/types.ts` + `stage-extensions-config.ts`;7 test |
| 2 core 子模块 6 个 | ✅ 完成 | `9a8bce3` + `63ecc5c`(fix)| `src/core/stage-extensions/`(severity-mapper / convergence-judge / thread-map / trend-analyzer / output-watcher / state-machine / types / index);27 test |
| 3 helper script 扩展 | ✅ 完成 | `0276d3d` + `801ed9c`(fix)| `scripts/codex-review-helper.mjs`(build-prompt 加 stage/mode、run 加 mode/thread-id);17 test |
| 4 prompt 模板增量评估 | ✅ 完成(评估)| — | 评估结论:不拆 stage-specific,保留 B-full `adversarial-default.md` 通用模板;0 文件改动 |
| **5 runner CLI 子命令** | ⏳ **下一个** | — | `src/cli/commands/stage-extensions.ts`;详 plan §7;19 integration scenario |
| 6 commands/*.md 5 处末尾段 | 待 | — | 详 plan §8(多轮收敛 AI 协议)|
| 7 测试 inventory 统一 | 待 | — | 详 plan §9 |
| 8 文档 | 待 | — | `docs/stage-extensions.md` + `docs/codex-review.md` + getting-started 嵌入 + README;详 plan §10 |
| 9 verify + retrospect | 待 | — | 全 5 verify + version 1.1.0→1.2.0 + CHANGELOG + git tag v1.2.0;详 plan §11 |

task list(TaskCreate)状态:Task 1-4 completed,Task 5 in_progress,6-9 pending。新会话可重建 task list 或继续。

## 关键 context(新会话必读)

1. **v7 架构修订**:plan v1-v6 把多轮收敛 loop + AskUserQuestion + dispatchFixSubagent 误置 CLI runner 进程内。CLI 是纯 Node,调不了 AI 工具,且违反 forge CLI/AI 职责分层。v7 重写:**§7 runner = 单轮机械执行器**(spawn codex + watch + parse + judge + retry,输出结构化 JSON);**§8 commands/*.md = 多轮收敛 AI 协议**(AI 主代理读 markdown,反复调单轮 runner + AskUserQuestion + Task dispatch fix subagent)。

2. **v10 C 方案(Task 5 关键)**:`parseCodexOutput` 格式归一 —— code-review mode 的 `codex review` 输出 JSON 直接用;adversarial mode 的 `codex exec` 输出 freeform markdown,解析 + `BLOCKER→critical / MAJOR→high / MINOR→medium / NIT→low` 反映射,输出统一 `CodexReviewOutput`(severity `critical/high/medium/low`)。详 plan §7 Step 5.2ter。Task 2 的 convergence-judge / severity-mapper / 类型**不回溯改**。

3. **codex CLI 接口事实**(Task 3 实机验证):`codex exec` 读 stdin prompt;`codex exec resume <id>` 是子命令(不是 flag);`codex review` 无 resume。Windows 上 `codex` 是 `.cmd` wrapper,spawn 需 `shell:true`(单字符串引号化形式,见 codex-review-helper.mjs)。

4. **terminateRound 的 cancelCodexJob**:直接 spawn codex CLI 没有 remote job 概念,`jobId` 永远 `null`,`terminateRound` 的 `if (jobId !== null)` 守卫使 `cancelCodexJob` 实际永不被调用 —— Task 5 写一个 no-op stub + 注释「未来 remote codex job 预留接口」即可。terminateRound 核心是本地 `proc.kill()`。

5. **loose 语义**:runner 永远 `exit 0`;codex 集成任何失败都不阻塞 forge 主流程 fence。

## Task 5 实施要点(给新会话的 implementer)

派 Task 5 implementer(model sonnet),给完整 plan §7(Step 5.1 / 5.2 / 5.2ter / 5.2bis / 5.3)。要实现 `src/cli/commands/stage-extensions.ts`:

- `buildStageExtensionsCommand()` commander 命令,2 子命令 `run` + `analyze-trend`,注册到 `src/cli/index.ts`(沿现有 `buildXxxCommand` 模式)
- `runStageExtensionRound` / `runOneRound` / `terminateRound` / `runAnalyzeTrend` —— 按 §7 伪代码
- helper:`emitJson`(JSON 写 stdout)/ `resolveOutputPath`(entry.output 模板 + round + attempt 维度)/ `buildPromptFile`(spawn entry.build_prompt 命令,变量替换)/ `spawnCodex`(变量替换 entry.command + spawn)/ `parseCodexOutput`(C 方案,见 §7 Step 5.2ter)/ `withTimeout` / `cancelCodexJob`(no-op stub)/ `log`(stderr)
- 变量替换:`${FORGE_HELPER_DIR}` / `${PROMPT_FILE}` / `${THREAD_ID}` / `${OUTPUT_FILE}` / `${CHANGE_ID}` / `${TS}`
- 依赖:Task 1 `validateStageExtensionsConfig` / Normalized 类型;Task 2 `ThreadMap` / `judgeConvergence` / `watchProcess` / `isFailureOutcome` / `analyzeTrend` / `CodexReviewOutput` / `ForgeFinding`;Task 3 `codex-review-helper.mjs`
- 19 integration scenario(plan §7 Step 5.3:8 run + 8 retry/失败 + 3 terminate/trend),用 stub codex CLI 不花真钱
- TS strict 0 error;Chinese 注释;commit 后跑全 suite 确认无回归

然后走 SDD:spec compliance reviewer → code quality reviewer → 修 → mark Task 5 complete → Task 6。

## codex review 调用方式(plan review 用)

新会话若需对 plan / 代码跑 Codex 对抗性 review:
```bash
node scripts/codex-review-helper.mjs build-prompt \
  --template src/core/codex-review/prompts/adversarial-default.md \
  --output <tmp.md> --user-focus "<focus>" --target-label "<label>"
node scripts/codex-review-helper.mjs run --prompt-file <tmp.md> --output-log <log>
```
codex review 是用户 codex 账户额度;sonnet 跑过 9 轮 plan review 全收敛。

## 9 轮 Codex review 收敛史(背景)

block 桶趋势:r1-r6 = 6→4→3→2→1→0(plan v1→v6 初版收敛);r7 = 2(v7 CLI/AI 架构重写引入);r8 = 1;r9 = 0(v9 approve)。累计 21 finding(3 BLOCKER + 16 MAJOR + 2 MINOR)全 accept、0 误报。v10 是 Task 5 实施前的 C 方案修订(未再跑 review —— C 是实施细节决策,用户拍板)。
