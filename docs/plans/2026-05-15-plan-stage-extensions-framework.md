# plan stage-extensions-framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**(v2 修订,F4 fix)加 **codex stage extension framework** — `forge stage-extensions` CLI 子命令在 forge 主流程 5 处 review 触点跑 codex review / adversarial review;loose 集成不入 marker,不阻塞 fence。v1 **codex-only scope**(generic framework 留 v2 / v3 真有 grok/lint/coverage 需求时 refactor 加 ExtensionContract 抽象,YAGNI 防预设抽象错)。Tier 1 Claude Code only 实施,Tier 2/3 文档指引手动跑 codex CLI。SKILL.md 0 改动(协议层纯净),只在 5 处 `commands/*.md` 末尾各加 ~5 行调用 runner。

**Architecture:**(v2 修订)`src/cli/commands/stage-extensions.ts` runner 读 `forge/config.yaml#stage_extensions.<stage>` 数组 → 遍历 entries → 每 entry 跑显式状态机(`round_converged` / `round_unconverged` / `spawn_failed` / `zombie` / `attempt_failed` / `max_rounds_exceeded` 6 个 state)→ **拆分 retry budget vs round budget 两个独立计数器**(F2 fix)→ AskUserQuestion 介入 → loose 模式。配套:`scripts/codex-review-helper.mjs`(B-full Task 0 已 ship,本 plan 扩展加 thread-id / poll-interval / 多 mode 子命令),`src/core/stage-extensions/` 6 子模块(severity-mapper / convergence-judge / thread-map / trend-analyzer / output-watcher / state-machine),`src/core/codex-review/prompts/` 1 个 adversarial-default.md(B-full Task 0 已 ship 通用模板)+ 留接口未来加 stage-specific。

**Pre-condition:** 所有 commit / PR / heredoc 命令在 Git-Bash 执行(沿用户 Windows 11 + Git-Bash 环境)。本 plan 的所有 fenced bash 字面在 Git-Bash 原生支持。codex CLI 已装(`codex --version` 可用)— 否则 runner spawn 失败走错误隔离路径。**Windows 兼容性**(F-P11):helper 内 `spawn('codex', ...)` 需加 `shell: true`(B-full 实证沿 forge-repo execFileSync 同模式;Windows 下 `codex` 是 `.cmd` wrapper,无 `shell: true` 会 spawn ENOENT)。

**Tech Stack:** Node 20+ / TypeScript ESM strict / commander 12 / vitest / pnpm 9+ / codex CLI native subcommands(`codex exec` / `codex review` / 留 `--resume` thread map)/ codex review JSON output schema(`review-output.schema.json`,critical/high/medium/low 四级 severity + verdict + confidence)

---

## §0 Brainstorm 决策表(2026-05-15)

| Q | 问题 | 选项 | 决策 | 理由 |
|---|---|---|---|---|
| Q1(v2 修订)| hardcoded codex hook vs generic framework | A. hardcoded codex / B. generic framework / C. **codex-specific framework with extensible interface 留 v2 升级**(本 plan 选) | **C(v2 修订)** | v1 codex-only(types 签名 `judgeConvergence(codexOutput: CodexReviewOutput)` 等明确绑 codex),Codex Pattern S finding F4 实证 "generic" 名义但 API 仅支持 codex output → 容易设计错;v2/v3 真有 grok/lint 需求时再 refactor 加 ExtensionContract(沿 forge-repo YAGNI 一脉相承 — 不为虚构需求做抽象)。commands/*.md 仍只加 ~25 行,框架 hook 点不变,只是 contract narrower |
| Q2 | 三 harness 范围 | A. Tier 1 only / B. Tier 1 + Tier 2/3 同步 / C. Tier 1 + Tier 2/3 文档手动指引 | **C. Tier 1 only,文档指引 Tier 2/3** | Tier 2/3 上 codex 集成需要 SKILL.md 改动 + harness 检测,工程量翻倍;Tier 2/3 用户跑 codex CLI 直接调一行即可;留 harness-agnostic 接口(helper 不绑 `${CLAUDE_PLUGIN_ROOT}`),未来 v2 可加 |
| Q3 | SKILL.md 是否改 | A. 改 5 处 / B. 0 改 | **B. 0 改** | 协议层纯净度优先;commands/*.md 是 plugin 接入层,加段不污染协议本体;跟 forge-repo 历史"commands 是入口,skills 是协议"分层一致 |
| Q4 | 触发点范围 | A. 只 D/E / B. A+B+C+D+E 全 5 处 / C. 用户 config 自选 | **B+C 混合** | 默认 5 处全开;但 config 可逐 stage `enabled: false` 关掉。文档 quick start 推荐"只开 D/E"(20-50 分钟,平衡 UX 与价值) |
| Q5(v2 修订)| mode 默认值 | A. sync(阻塞主代理对话)/ B. async background(detach + 写 job/status file + 主代理 poll) | **A. sync default(v2 修订,F3 fix)** | Codex Pattern S finding F3 实证 v1 决策 "B background" 但实施伪代码 `await runExtension` 仍 sync — 决策与实施矛盾。真后台化需加 job/status/cancel CLI 子命令 ~200 LOC + 测试 ~5 case,工程量大;v1 sync default 跟 B-full ship 实证一致(15min 总超时 + 5min mtime 静止 cancel 已挡僵尸)。**`--background` flag 留 v2 加完整 job-control 协议** |
| Q6 | 僵尸检测信号 | A. codex job status=running 卡住 / B. output 文件 mtime 静止 / C. AND 两者 | **B. output 文件 mtime 静止 ≥ 5 分钟 AND 总时长 ≥ 15 分钟** | output 文件 mtime 是机器判定,比 codex job status 更可靠;AND 减少误判(codex 启动后 1 分钟没写文件不算僵尸) |
| Q7 | max_retries 默认值 | A. 0 / B. 1 / C. 3 | **B. 1**(总 2 次尝试),config 可改 | 用户明确"连续两次失败放弃";retry 2 次给 codex 偶发抖动一次机会,2 次都挂大概率系统性问题 |
| Q8 | subagent 复用策略 | A. 每轮新 thread / B. 同 stage 复用 thread,跨 stage 新 thread / C. 全局单 thread | **B. 同 stage 复用 + 跨 stage 新 thread** | codex `--resume <thread-id>` 让 review 续 context,看用户修了什么改;跨 stage 切 thread 防 context 串扰 |
| Q9 | severity 显示术语 | A. codex 原生 critical/high/medium/low / B. forge 三级 CRITICAL/WARNING/SUGGESTION / C. forge 四级 BLOCKER/MAJOR/MINOR/NIT | **C. BLOCKER/MAJOR/MINOR/NIT** | 沿 forge plan/spec 文档惯例(`grep BLOCKER\|MAJOR docs/plans/` 命中);跟 maintainer 跑 codex 时 prose 翻译习惯一致;loose 模式不入 marker,只 UX 显示 |
| Q10 | 收敛规则 | A. block=[BLOCKER] / B. block=[BLOCKER, MAJOR] / C. 全 severity 必须 0 | **B. block=[BLOCKER, MAJOR]** | 用户明确"没有 BLOCKER MAJOR 算收敛";MINOR/NIT 不阻塞,计 backlog;沿 forge SUGGESTION 不阻塞 archive 同语义 |
| Q11 | max_rounds 默认 | A. 5 / B. 10 / C. 无限 | **B. 10**,config 可改 | 用户明确;5 太少(可能首版 codex review 收敛慢),无限可能卡死 |
| Q12 | max_rounds 到顶行为 | A. 强制结束计 backlog / B. ask 用户给趋势建议 / C. 用户 config 选 | **C. config 选,默认 ask** | 用户明确 ask + 建议;`force_end` 留给 CI 自动跑场景 |
| Q13 | 未收敛默认介入 | A. 每轮 ask / B. auto fix subagent / C. 三选项 ask 推 auto fix | **C. 三选项 ask 推 auto fix** | 平衡用户掌控 + 流程顺;默认回车即 auto fix,不打扰节奏 |
| Q14 | confidence_threshold | A. 0(不过滤)/ B. 0.7 / C. 0.9 | **B. 0.7**,config 可改 | 平衡 — 过滤明显低置信度 noise,保留多数 finding;codex 偶尔推 0.4-0.6 finding 占位,容易拖死流程 |
| Q15(v2 修订)| verdict='approve' 短路 | A. true 信任 verdict / B. false 严格按 findings 分桶 / C. **verdict=approve AND block 桶为空** 才短路 | **C(v2 修订,F5 fix)** | Codex Pattern S finding F5 实证 v1 决策 A 会掩盖"approve 但 findings 含 BLOCKER/MAJOR"的现实 LLM 输出不一致;C 保留短路效率(approve 多数确实 findings 空 → 直接退出)同时挡边界 case;若 block 桶非空 → 走未收敛分支即使 verdict=approve;**默认 `verdict_approve_short_circuit: true` 保留,但 short-circuit 逻辑改为 AND block 桶空**(语义改,字段名兼容)|
| Q16 | fallback 机制 | A. `on_failure_command` 字段(`/codex:rescue` 兜底)/ B. 不引入,max_retries=1 同 command 重试足够 | **B. 不引入**,留 v2 加 | 用户改为 max_retries=1 同 command 重试;rescue prompt 模板单独写复杂度高;第一版砍掉,留 config 字段保留扩展性 |
| Q17 | loose vs strict 模式 | A. loose 不入 marker / B. strict 入 marker.review_outcomes / C. 单独 .codex-passed marker | **A. loose 不入 marker** | codex finding freeform → forge schema 映射不平凡;不影响 archive fence;给用户多一份意见参考,不强制 |
| Q18 | branch 策略 | A. dev 沿用 / B. 新 feature/stage-extensions / C. docs/plan-stage-extensions(沿 PR #35/#36/#37 命名) | **C. docs/plan-stage-extensions-framework** | 沿 forge-repo 最近 PR 命名风格;plan + impl 同分支;~3-5d scope 适合短命分支 |
| Q19 | 是否单独写 spec | A. plan + spec 两份 / B. plan 内嵌设计段 | **B. plan 内嵌**,沿 plan-v1.1 模式 | scope 跟 plan-9 sub-plan 相当但不跨 sub-plan;设计写在 plan 内不分散 |
| Q20 | dogfood 测试 | A. 本 change 自身用 stage_extensions runner / B. 不 dogfood | **B. 不 dogfood** | chicken-and-egg(stage_extensions 还没实施时 dogfood 跑不起来);plan 完成后另起 change `feature/codex-review-self-test` dogfood |
| Q21(v2 新增,F-P1 fix)| B-full wrapper 第一步 enabling 实施 | A. plan 实施前先 ship B-full(独立 commit) / B. 跟 full framework 一起 ship | **A. 已 ship**(commit `02710da`)| 在 plan v1 自身被 codex review 前 ship enabling tool 让 AI 主代理能调 `/forge:codex-adversarial`(绕开 `/codex:adversarial-review` `disable-model-invocation: true` 限制)。**已 ship 内容**:`commands/codex-adversarial.md` slash / `scripts/codex-review-helper.mjs` helper(2 子命令)/ `src/core/codex-review/prompts/adversarial-default.md` 通用模板 / 12 integration tests。后续 Task 3 / 4 在此基础上扩展(不重建) |
| Q22(v2 新增)| runner 状态机表达 | A. 嵌套 loop 隐式状态 / B. **显式状态机**(round_converged / round_unconverged / spawn_failed / zombie / attempt_failed / max_rounds_exceeded 6 states) | **B(v2 新增,F1 fix)** | Codex Pattern S finding F1 实证 v1 嵌套 loop 有 `convergence` 变量作用域 leak + zombie/error 错走 max_rounds 分支 BLOCKER 级 bug;显式状态机用 enum / tagged union 表达消除作用域 + 控制流歧义 |
| Q23(v2 新增)| retry budget vs round budget 拆分 | A. 共用 outer loop / B. 独立 2 计数器 | **B(v2 新增,F2 fix)** | Codex Pattern S finding F2 实证 v1 用户选 "continue N 轮" 会消耗 retry attempt + round 从 1 重新开始 + roundHistory 清空 — 污染 retry 语义;v2 拆 `attempt`(失败重试,默认 max=1)和 `roundBudget`(收敛轮数,默认 10)两个独立计数器,continue 走 `roundBudget += N` 不动 attempt |
| Q24(v2 新增)| codex output 失败路径覆盖 | A. 只测 happy path / B. **加 8 失败 case 测试** | **B(v2 新增,F6 fix)** | Codex Pattern S finding F6 实证 v1 测试计划缺失:approve+BLOCKER 冲突 / codex JSON malformed / output file 不存在 / spawn exit nonzero / zombie 后不进入 max_rounds / 多个 enabled entries 隔离 / thread-map 写入竞争 / 用户 continue 不消耗 retry。这 8 个失败路径恰是 runner 最易坏的地方 |

---

## §1 Scope 概述(v2 修订)

**性质**:codex stage extension framework(v1 codex-only;generic ExtensionContract 留 v2/v3 真有 grok/lint 需求时 refactor)。生产代码 + 配套测试 + 完整文档 + Tier 2/3 harness-agnostic 接口预留。

**3 类 scope + 10 Task**(v2 加 Task 0 标 B-full ship):

- **Task 0(已 ship,B-full 前置 enabling)**:slash 命令 / helper script / prompt 模板 / 12 tests 已 commit `02710da`
- **A 组 核心模块**(4 Task):config schema → core 子模块 → helper script 扩展 → prompt 模板增量
- **B 组 整合**(2 Task):runner CLI 子命令(显式状态机)→ commands/*.md 5 处末尾段
- **C 组 测试与文档**(2 Task):integration + unit tests(含 13 失败路径)→ 文档全套
- **Verify + retrospect**(1 Task):全 5 verify + CHANGELOG + version bump

**估时 P50 ~3.5-4.5d / P90 ~6d / cost ~$2-4**(v2 修订 — 减去 B-full 已花 ~0.5d ~$0.5;加 F1/F2/F6 修订工程量 ~0.5d;净增减相当)。

**LOC 估计**(v2 修订,减去 B-full ~698 LOC 已 ship):
- 本 plan 剩余 LOC ~1300(原估 2000 LOC - B-full 698 LOC)
- 测试新增 52 个(plan 实施;不含 B-full Task 0 已 ship 12 个)— 详 §2 "测试 inventory 单一来源" 表

**不在本 plan scope**(v2 修订,明确 scope-out):
- **Generic ExtensionContract**(`output_format` / `parser` / `success_criteria` / `retry_policy` / `artifact_contract`)→ 留 v2/v3 真有非 codex 工具集成需求时 refactor 加;v1 codex-only 防预设抽象错(F4 fix)
- **`--background` async mode + job/status/cancel CLI 协议**(~200 LOC + ~5 test)→ 留 v2(F3 fix);v1 sync default 配 15min 总超时 + 5min mtime 静止 cancel 已挡僵尸
- Tier 2/3 Codex/OpenCode 实施 → 留 v2;helper / config / prompt 模板已 harness-agnostic 留接口
- rescue 模式 fallback(`on_failure_command` 字段) → 留 v2;第一版 max_retries=1 重试足够
- D/E 阶段 adversarial 模式(D/E 只跑 code-review) → 留 v2;v1 prompt 模板 1 个通用(adversarial-default.md,已 ship)
- handoff_to_backlog 集成深度优化(severity 二次映射 to forge 三级)→ 第一版 minimum viable,只 `.evidence/codex-pending-findings.yaml` 写
- 自定义 stage(用户加新 stage 名)→ 第一版只 5 stage hardcode

---

## §2 Task list 概要表(v2 修订)

| Task | 标题 | Scope | 估时(d)| 依赖 | 验收 |
|---|---|---|---|---|---|
| **0**(已 ship)| B-full enabling wrapper | `commands/codex-adversarial.md` slash / `scripts/codex-review-helper.mjs` helper / `src/core/codex-review/prompts/adversarial-default.md` 通用模板 / 12 integration tests | 已 ship 0.5d | — | commit `02710da`;1030 tests pass(1018 + 12) |
| 1 | config schema + validator | `src/core/schema/types.ts` 扩 `StageExtensionsConfig` + `validateStageExtensionsConfig` | 0.5 | — | unit test 覆盖默认值 + 边界 case;`pnpm validate` config 文件示例通过 |
| 2 | core 子模块 | `src/core/stage-extensions/` 6 模块(severity-mapper / convergence-judge / thread-map / trend-analyzer / output-watcher / state-machine) | 1.0 | 1 | unit test 各模块覆盖 ≥ 85% |
| 3 | helper script 扩展(在 B-full ship 基础上)| 扩展 `scripts/codex-review-helper.mjs`:加 `--thread-id` resume / `--poll-interval` / mode 多分支(code-review / adversarial / rescue);保留 B-full 已有 2 子命令向后兼容 | 0.5 | 0, 1, 2 | helper integration test 扩展 +5 case;harness-compat test 已在 Task 0 验过 |
| 4 | prompt 模板增量(在 B-full ship 基础上)| 评估 stage-specific 模板必要性:若 stage-stage 攻击面差异大 → 加 `<stage>-adversarial.md`;否则保留 B-full `adversarial-default.md` 通用模板 | 0.3 | 0 | self-review:决定加 / 不加;若加附理由 |
| 5 | runner CLI 子命令(显式状态机)| `src/cli/commands/stage-extensions.ts` — 7 state 显式状态机(含 timeout,F3-v2 fix)+ 拆 retry/round budget(F1+F2 fix)+ verdict-approve AND block 桶空短路(F5 fix)+ normalized config(F1-v2 fix)+ AskUserQuestion 介入 | 1.5 | 1, 2, 3, 4 | integration test 20 scenario(7 happy + 13 失败路径);TypeScript strict 模式 0 error |
| 6 | commands/*.md 5 处 | 末尾各加 ~5 行调 runner;build sync verify | 0.5 | 5 | `pnpm build` md5 sync 通过;commands sync test 验 5 文件改动 |
| 7 | 测试 inventory 统一 + 失败路径补全 | 跨 §2 / §9 / §14 统一 test 计数 + 加 13 失败路径(F6 8 个 + F-9..F-13 累计 5 个) | 0.5 | 1-6 | 跨段 test 数一致;`pnpm test` 全 1030 + 52 = **1082 PASS**(详见下方单一来源表) |
| 8 | 文档 | `docs/stage-extensions.md` 协议 + `docs/codex-review.md` 用户指南 + `docs/getting-started.md` 嵌入 deep-dive + README 更新 | 0.5 | 1-7 | self-review:每文档 含 quick start + 完整 config schema + troubleshooting + Tier 2/3 未来路径 |
| 9 | verify + retrospect | 全 5 verify(typecheck / lint / format:check / build / test)+ version 1.1.0→1.2.0 + CHANGELOG + git tag v1.2.0 + master plan 状态回写 | 0.5 | 1-8 | 全 5 命令 exit 0;CHANGELOG `[1.2.0]` 段含 24 决策(v2 修订)+ breaking changes(无)+ ack |

**P50 总 4.5d / P90 6d**(Task 0 已 ship 不计入剩余)。

**测试 inventory 单一来源**(F6 fix — 跨段权威表;§9 / §14 引用本表数字):

| 阶段 | 测试 | 累计 |
|---|---|---|
| Baseline(plan-v1.1 ship 后) | 1018 | 1018 |
| Task 0 B-full(已 ship)| +12 | **1030** |
| Task 1 config schema | +4 unit(v3:加 partial deep-merge test)| 1034 |
| Task 2 core 子模块 | +22 unit(severity-mapper 4 / convergence-judge 5 / thread-map 4 / trend-analyzer 4 / output-watcher 5;v5:output-watcher 3→5 加 done happy + single-settle)| 1056 |
| Task 3 helper 扩展 | +5 integration(thread resume / mode 多分支)| 1061 |
| Task 5 runner | +20 integration(7 happy + 13 失败路径;v5:加 F-13 entry 异常隔离)| 1081 |
| Task 6 commands sync | +1 integration | **1082** |
| Task 7 / 9 cross-cutting | 0(仅协调 / verify,无新 test)| 1082 |

**Plan v5 实施后目标:1082 tests pass**(52 个新 + B-full ship 12 个 = 64 incremental)。

---

## §3 Task 1 — config schema + validator

**Files:**
- Modify: `src/core/schema/types.ts`(扩 `StageExtensionsConfig` interface + `validateStageExtensionsConfig`)
- Create: `tests/core/schema/stage-extensions-config.test.ts`

### Step 1.1: Pre-flight grep verify(Pattern S 协议)

```bash
# verify 现有 schema 结构 + 命名一致性
grep -n "validateWritingPlansConfig\|WritingPlansConfig" src/core/schema/types.ts
grep -n "ForgeConfig\b" src/core/schema/types.ts | head -3
```

### Step 1.2: 扩 `ForgeConfig` 加 `stage_extensions?: StageExtensionsConfig`

```typescript
// src/core/schema/types.ts(新增段)

export interface StageExtensionEntry {
  name: string;
  enabled: boolean;
  command: string;
  build_prompt?: string;
  output: string;
  // 各 extension 可覆盖 defaults:
  timeout_sec?: number;
  poll_interval_sec?: number;
  zombie_threshold_sec?: number;
  max_retries?: number;
  convergence?: Partial<ConvergenceConfig>;
}

export interface ConvergenceConfig {
  max_rounds: number;
  max_rounds_on_exceed: 'ask' | 'force_end';
  block_severity: Array<'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT'>;
  ignore_severity: Array<'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT'>;
  confidence_threshold: number; // 0-1
  verdict_approve_short_circuit: boolean;
}

export interface StageExtensionsDefaults {
  mode: 'background' | 'sync';
  poll_interval_sec: number;
  zombie_threshold_sec: number;
  timeout_sec: number;
  max_retries: number;
  convergence: ConvergenceConfig;
  severity_map: {
    critical: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT';
    high: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT';
    medium: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT';
    low: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT';
  };
  severity_map_to_forge: {
    BLOCKER: 'critical' | 'warning' | 'suggestion';
    MAJOR: 'critical' | 'warning' | 'suggestion';
    MINOR: 'critical' | 'warning' | 'suggestion';
    NIT: 'critical' | 'warning' | 'suggestion';
  };
  user_interaction: {
    block_unconverged: 'auto_fix_recommended' | 'manual_fix_recommended' | 'give_up_recommended';
    max_rounds_exceed: 'give_up_recommended' | 'continue_recommended' | 'accept_recommended';
  };
}

export interface StageExtensionsConfig {
  defaults?: Partial<StageExtensionsDefaults>;
  brainstorming?: StageExtensionEntry[];
  propose?: StageExtensionEntry[];
  apply_critical_plan_review?: StageExtensionEntry[];
  review?: StageExtensionEntry[];
  verify?: StageExtensionEntry[];
}

// extend ForgeConfig
export interface ForgeConfig {
  // ... existing fields
  stage_extensions?: StageExtensionsConfig;
}

// ── Normalized 类型(v3 新增,F1-v2 fix)──
// validator 把 raw config(entry 含 Partial<ConvergenceConfig> + 各 optional 字段)
// 规范化成 Normalized*:所有 optional 填充 default,convergence 深合并成完整 ConvergenceConfig。
// runner 只接收 Normalized*,不再做 `entry.convergence ?? defaults.convergence`(避免 partial leak)。

export interface NormalizedStageExtensionEntry {
  name: string;
  enabled: boolean;
  command: string;
  build_prompt?: string; // 仍 optional — 不是所有 mode 都需要 prompt(code-review 不需要)
  output: string;
  timeout_sec: number; // 已填充
  poll_interval_sec: number; // 已填充
  zombie_threshold_sec: number; // 已填充
  max_retries: number; // 已填充
  convergence: ConvergenceConfig; // 已深合并为完整(非 Partial)
}

export interface NormalizedStageExtensionsConfig {
  // defaults 已 fold 进每个 entry,runner 不再单独读 defaults
  severity_map: StageExtensionsDefaults['severity_map'];
  severity_map_to_forge: StageExtensionsDefaults['severity_map_to_forge'];
  user_interaction: StageExtensionsDefaults['user_interaction'];
  brainstorming: NormalizedStageExtensionEntry[];
  propose: NormalizedStageExtensionEntry[];
  apply_critical_plan_review: NormalizedStageExtensionEntry[];
  review: NormalizedStageExtensionEntry[];
  verify: NormalizedStageExtensionEntry[];
}
```

### Step 1.3: 写 `validateStageExtensionsConfig`(沿 `validateWritingPlansConfig` 模式;v3 修订 F1-v2 fix)

签名:`validateStageExtensionsConfig(raw: unknown): NormalizedStageExtensionsConfig`

- 跑 deep merge defaults(用户配置覆盖 built-in default)
- **关键(F1-v2 fix):每个 entry 规范化成 `NormalizedStageExtensionEntry`**:
  - 各 optional 字段(`timeout_sec` / `poll_interval_sec` / `zombie_threshold_sec` / `max_retries`)未提供 → 填 `defaults.<field>`
  - **`convergence` 深合并**:`effectiveConvergence = { ...defaults.convergence, ...entry.convergence }`(entry 的 `Partial<ConvergenceConfig>` 只覆盖提供的字段,其余从 defaults 补全)→ 保证 runner 拿到完整 `ConvergenceConfig`,不会 `confidence_threshold` / `block_severity` undefined
- 校验(规范化后跑,确保 effective 值合法):
  - `max_retries` ∈ [0, 10]
  - `timeout_sec` ∈ [60, 3600]
  - `confidence_threshold` ∈ [0, 1]
  - `max_rounds` ∈ [1, 100]
  - `block_severity` ∪ `ignore_severity` ⊆ ['BLOCKER', 'MAJOR', 'MINOR', 'NIT']
  - `command` 字符串非空(`build_prompt` 可空 — code-review mode 不需要)
- 返回 `NormalizedStageExtensionsConfig`(每 entry convergence 是完整 `ConvergenceConfig`)

### Step 1.4: 写 4 个 unit test(v3 修订 — F1-v2 加第 4 个)

- `validates default config`(全 default 输入返回完整 config)
- `validates user override`(用户改 max_rounds=20 → 返回 max_rounds=20 其他保持默认)
- `rejects invalid values`(max_rounds=-1 / confidence_threshold=2 → throw ValidationError)
- **`partial entry convergence is deep-merged`(F1-v2 fix)**:entry 只给 `convergence: { max_rounds: 20 }` → 规范化后 `confidence_threshold` / `block_severity` / `verdict_approve_short_circuit` 等仍是 defaults 值,**不是 undefined**;断言 normalized entry 的 convergence 是完整 `ConvergenceConfig`

### Step 1.5: commit Task 1

```bash
git add src/core/schema/types.ts tests/core/schema/stage-extensions-config.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): add StageExtensionsConfig + validator (plan-stage-extensions Task 1)

- StageExtensionsConfig interface + 5 stage entries + defaults
- validateStageExtensionsConfig: range checks + deep merge with built-in defaults
- 3 unit tests: defaults / override / rejection

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## §4 Task 2 — core 子模块(6 个)

**Files:**
- Create: `src/core/stage-extensions/severity-mapper.ts`
- Create: `src/core/stage-extensions/convergence-judge.ts`
- Create: `src/core/stage-extensions/thread-map.ts`
- Create: `src/core/stage-extensions/trend-analyzer.ts`
- Create: `src/core/stage-extensions/output-watcher.ts`
- Create: `src/core/stage-extensions/state-machine.ts`(v2 新增,F1 fix — `RoundOutcome` tagged union + dispatch helper)
- Create: `src/core/stage-extensions/index.ts`(re-export)
- Create: `tests/core/stage-extensions/*.test.ts`(每模块一份)

### Step 2.1: `severity-mapper.ts`

```typescript
// codex JSON severity → forge 显示
export function mapCodexToForge(
  codexSeverity: 'critical' | 'high' | 'medium' | 'low',
  severityMap: StageExtensionsDefaults['severity_map']
): 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT';

// forge 显示 → forge 三级(handoff_to_backlog 用)
export function mapForgeToForgeTier(
  forgeSeverity: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT',
  severityMapToForge: StageExtensionsDefaults['severity_map_to_forge']
): 'critical' | 'warning' | 'suggestion';
```

### Step 2.2: `convergence-judge.ts`(v2 修订 — interface 跟 §7 Step 5.2bis 对齐)

```typescript
export interface ConvergenceResult {
  threadId: string | null;             // codex thread id(首轮可能 null)
  verdict: 'approve' | 'needs-attention';
  blockFindings: ForgeFinding[];       // BLOCKER + MAJOR(confidence filter 后)
  ignoreFindings: ForgeFinding[];      // MINOR + NIT(confidence filter 后)
  droppedByConfidence: number;         // confidence < threshold 被丢弃的 finding 数
  shortCircuited: boolean;             // verdict=approve AND block 桶空 → true(F5 fix)
}

// 收敛判定 = blockFindings.length === 0(由 runner Step 5.2 runOneRound 判)
// judgeConvergence 只负责分桶 + filter,不返 boolean converged
// (F5 fix:收敛与否由 runner 看 blockFindings.length,不在本函数硬编码 verdict 短路)
export function judgeConvergence(
  codexOutput: CodexReviewOutput,
  config: ConvergenceConfig,
  severityMap: SeverityMap
): ConvergenceResult;
```

完整实现见 §7 Step 5.2bis(judgeConvergence 修订)。

### Step 2.3: `thread-map.ts`(v3 修订 — F2-v2 fix:thread_id nullable)

```typescript
export interface ThreadMapEntry {
  thread_id: string | null;  // v3 修订(F2-v2 fix):codex 首轮可能不返 thread id;
                             // null 时下一轮不传 --resume(走新 thread)。
                             // 类型契约与 ConvergenceResult.threadId 对齐(都是 string | null)。
  round: number;
  last_verdict: 'approve' | 'needs-attention' | null;
  last_finding_count: number;
  last_round_at: string;  // ISO 8601
}

export class ThreadMap {
  constructor(changeId: string);
  async load(): Promise<void>;                              // 读 forge/changes/<id>/.codex-threads.yaml
  async save(): Promise<void>;                              // 写回
  getThreadId(stage: string, name: string): string | null;  // 首轮返 null
  recordRound(stage: string, name: string, entry: ThreadMapEntry): void;
  resetStage(stage: string): void;                          // 跨 stage 切新 thread
}
```

### Step 2.4: `trend-analyzer.ts`

```typescript
export interface TrendAdvice {
  trend: 'data_insufficient' | 'strict_decrease' | 'stable' | 'increase' | 'fluctuate';
  recommendation: string;                  // 给用户的建议文本
  recommended_option: 1 | 2 | 3;          // AskUserQuestion 默认推哪个
}

export function analyzeTrend(
  roundHistory: Array<{ round: number; block_count: number }>
): TrendAdvice;
```

实现:
- `total_rounds < 3` → `data_insufficient` + 推 option 1 再跑 3 轮
- 最后 3 轮严格递减 → `strict_decrease` + 推 option 1 继续
- 最后 3 轮差 ≤ 1 → `stable` + 推 option 2 放弃
- 最后 3 轮 finding 数上升(>3 任一对)→ `increase` + 推 option 2 放弃
- 否则 → `fluctuate` + 推 option 3 接受

### Step 2.5: `output-watcher.ts`(v4 修订 — F1-v3 fix:补 `done` 产生规格)

`OutputWatcher` 监控**两个独立信号的 race**:子进程退出(`proc.close`)+ output 文件 mtime 进度。

```typescript
export class OutputWatcher {
  // v4 修订(F1-v3 fix):构造函数加 proc — watcher 必须监听进程退出才能 emit done
  constructor(
    proc: ChildProcess,
    filePath: string,
    pollIntervalSec: number,
    zombieThresholdSec: number,
    timeoutSec: number,
  );
  async start(): Promise<void>;
  on(event: 'zombie' | 'timeout' | 'progress' | 'done', listener: Function): this;
  stop(): void;  // 清理 setInterval + 移除 proc listener
}
```

实现(4 个 emit 条件 — v4 补全 `done`):
- **`done`**(F1-v3 fix):监听 `proc.once('close', (code) => ...)`;进程退出 → emit `done` 携带 `exitCode` → **立即 clearInterval 停止 polling**(进程退出后不再判 zombie/timeout)
- `zombie`:`setInterval` 每 `pollIntervalSec` 秒读 `fs.stat(filePath).mtime`;若 `now() - startTime ≥ timeoutSec` AND `now() - mtime ≥ zombieThresholdSec` → emit `zombie`
- `timeout`:若 `now() - startTime ≥ timeoutSec` 但 mtime 仍在更新 → emit `timeout`
- `progress`:mtime 更新 → emit `progress`

**关键**(F1-v3 fix):`done` 与 `zombie`/`timeout` 是 race — codex 正常退出时 `proc.close` 先到 → emit `done`,polling 立即停;只有进程**没退出**才可能走 zombie/timeout。`watchProcess(proc, outputFile, opts)` 包装本 watcher,返回首个到达的 outcome(`{ kind: 'done', exitCode }` / `{ kind: 'zombie', jobId }` / `{ kind: 'timeout', jobId }`)。

**single-settle 规格**(v5 修订,F3-v4 fix):`watchProcess` 必须保证**只 settle 一次**,消除 interval / close 边界竞争:

- watcher 持一个 `settled: boolean` 标志,初值 false
- **所有** emit 路径(`done` / `zombie` / `timeout`)settle 前先检查 `if (settled) return; settled = true;`
- interval callback 在判 `zombie` / `timeout` 前**先检查 `proc.exitCode !== null || proc.signalCode !== null`** — 若进程已退出,不发 zombie/timeout(让 `close` 事件走 `done` 路径)
- 任一最终事件(done/zombie/timeout)后立即调 `stop()`(clearInterval + 移除 proc listener)
- 边界 case:进程在 timeout 边界写完合法 JSON 并退出,interval 与 close 近同时触发 → single-settle 保证只返回一次,且**优先 done**(interval 先检查 exitCode 发现已退出 → 不发 timeout)

**unit test**(2 个):
- stub codex 写合法 JSON 后 `exit 0` → watcher emit `done` exitCode=0,**不等 timeout**;断言 `watchProcess` 在 timeout_sec 之前返回
- 进程在 timeout 边界退出(interval 与 close 近同时)→ `watchProcess` 只返回一次,且 kind=done(F3-v4 fix single-settle 边界)

### Step 2.6: `state-machine.ts`(v2 新增,F1 fix;v3 修订加 timeout — F3-v2 fix)

```typescript
// RoundOutcome tagged union — 见 §7 Step 5.2 完整定义(v3:7 个 kind)
export type RoundOutcome =
  | { kind: 'converged'; convergence: ConvergenceResult }
  | { kind: 'unconverged'; convergence: ConvergenceResult }
  | { kind: 'spawn_failed'; error: Error }
  | { kind: 'zombie'; jobId: string | null }       // v3:jobId nullable(codex 可能没返 job id)
  | { kind: 'timeout'; jobId: string | null }      // v3 新增(F3-v2 fix):总超时但 mtime 仍更新
  | { kind: 'invalid_output'; reason: string }
  | { kind: 'attempt_failed'; reason: string };

// 分类 helper:RoundOutcome → 是否属于"失败类"(失败类直接进 retry attempt,不进 max_rounds)
export function isFailureOutcome(o: RoundOutcome): boolean {
  return o.kind === 'spawn_failed' || o.kind === 'zombie' || o.kind === 'timeout'
    || o.kind === 'invalid_output' || o.kind === 'attempt_failed';
}
```

state-machine 模块只放纯类型 + 分类 helper;runner Step 5.2 的 `runExtension` 状态机循环引用本模块。

**v3 timeout vs zombie 区别**(F3-v2 fix):
- `zombie`:总超时 AND output mtime 静止 ≥ 5min — codex 卡死,output 也不动
- `timeout`:总超时 BUT output mtime 仍在更新 — codex 还活着但跑太久
- **两者都必须 kill 进程 + cancel job**(F3-v2 fix 关键:v2 只 kill zombie,timeout 的 codex 进程会残留与 retry 竞争写 output file)

### Step 2.7: 写 4 + 5 + 4 + 4 + 5 + 0 = 22 unit test 覆盖每模块(v5:output-watcher 3→5,加 done happy + single-settle 边界)

state-machine 是纯类型 + 1 个 helper,`isFailureOutcome` 的覆盖并入 runner integration test(§7 Step 5.3 F-1..F-13)。trend-analyzer 4 fixture(data_insufficient / strict_decrease / stable / increase|fluctuate)。

### Step 2.8: commit Task 2

```bash
git add src/core/stage-extensions/ tests/core/stage-extensions/
git commit -m "feat(stage-extensions): add 6 core modules + 20 unit tests (Task 2)..."
```

---

## §5 Task 3 — helper script 扩展(`scripts/codex-review-helper.mjs`)

**v2 修订**:本 Task **不创建 new helper**,而是在 B-full Task 0 ship 的 `scripts/codex-review-helper.mjs` 基础上扩展(沿 forge-repo 内文件管理协议,避免 dup)。

**Files:**
- Modify: `scripts/codex-review-helper.mjs`(扩展现有 helper)
- Modify: `tests/scripts/codex-review-helper.test.ts`(在 Task 0 12 tests 基础上加 +5)

### Step 3.1: 扩展现有 helper

B-full Task 0 已 ship 2 子命令(`build-prompt` / `run`)— 本 Task 加:

```javascript
// scripts/codex-review-helper.mjs(扩展现有,不重写)

// build-prompt 子命令加 stage-mode 路径解析(可选,优先使用 --template 直接传)
//   --stage <s> --mode <m> [--template <path>]
//   若 --template 未传,fallback 读 src/core/codex-review/prompts/<stage>-<mode>.md
//   再 fallback 读 adversarial-default.md(B-full ship)

// run 子命令加 --thread-id 和 mode 多分支
//   --mode <code-review|adversarial|rescue> --thread-id <id> --output-log <path>
//   根据 mode 调对应 codex CLI:
//     code-review → `codex review` (无需 prompt-file,codex 内置 reviewer)
//     adversarial → `codex exec` (stdin pipe prompt)
//     rescue → `codex exec` (stdin pipe prompt;留接口,v1 不实施验证)
//   若 --thread-id 非空,在 codex CLI 加 --resume <thread-id>
```

**保留向后兼容**:Task 0 的 helper --help / build-prompt --template+output / run --prompt-file+output-log 接口不变,新加参数 optional。

### Step 3.2: harness-agnostic 接口已验证(Task 0)

B-full Task 0 已加 2 个 harness-compat tests:
- helper source 不含 `process.env.CLAUDE_PLUGIN_ROOT` / `process.env.FORGE_PLUGIN_ROOT` 字面
- helper 跑时不依赖任何 forge / Claude Code 特定 env var

本 Task 扩展时**继续 assert** 这两条不变(测试已存在,加新代码不能破坏)。

### Step 3.3: 写新 integration test(+5)

- `build-prompt --stage <s> --mode adversarial` 自动 fallback 读 `<stage>-adversarial.md`(若存在)否则 adversarial-default.md
- `run --mode code-review` spawn `codex review`(用 stub codex CLI 替身)
- `run --mode adversarial --thread-id cdx-123` spawn `codex exec --resume cdx-123` + stdin pipe prompt
- `run --mode rescue` 跟 adversarial 走同代码路径(留接口验证)
- `--thread-id` 为空时 codex CLI 不加 `--resume`(新 thread)

### Step 3.4: commit Task 3

```bash
git commit -m "feat(scripts): extend codex-review-helper.mjs with --thread-id and mode dispatch (Task 3)..."
```

---

## §6 Task 4 — prompt 模板增量评估(在 B-full ship 基础上)

**v2 修订**:B-full Task 0 已 ship `src/core/codex-review/prompts/adversarial-default.md`(通用模板,含 design-stage + code-stage 两类 attack_surface + `{{USER_FOCUS}}` / `{{TARGET_LABEL}}` 变量)。本 Task **评估是否需要拆 stage-specific 模板**,而非无条件创建 3 个。

### Step 4.1: 评估 stage-specific 必要性

判据:跑 B-full `adversarial-default.md` 对 brainstorming / propose / apply 三 stage 实测,看通用模板是否够用:

- **够用**(通用模板已含两类 attack_surface,变量传 stage 焦点)→ **不拆**,保留单一 `adversarial-default.md`;Task 4 仅 self-review 记录"评估结论:不拆 + 理由"
- **不够**(某 stage 攻击面差异大,通用模板抓不到)→ 拆该 stage 的 `<stage>-adversarial.md`

本 plan v2 默认倾向**不拆**(B-full ship 的 adversarial-default.md 实测对本 plan 自身 review 已产出 1 BLOCKER + 5 MAJOR 有效 finding,证明通用模板对 design/plan stage 够用)。

### Step 4.2: 若决定拆 — 模板结构(沿 codex `/codex:adversarial-review` prompt 模板)

每个 stage-specific 模板含:`<role>` / `<task>`(stage 目标)/ `<operating_stance>` / `<attack_surface>`(stage 专属)/ `<finding_bar>` / `<severity_scale>`(BLOCKER/MAJOR/MINOR/NIT)/ `<output_format>`。

stage 专属 attack_surface 候选(若拆):
- **brainstorming**:design 假设合理性 / scope 边界 / 成功标准可证伪性 / 未识别 risk
- **propose**:4 件套类型一致性 / scope 顺序 / spec coverage / task 粒度
- **apply_critical_plan_review**:plan 完整性 / 顺序合理性 / vague task 描述 / scope 应转 out-of-scope 项

### Step 4.3: commit Task 4

```bash
git commit -m "feat(prompts): evaluate stage-specific templates (keep unified adversarial-default.md) (Task 4)..."
```

---

## §7 Task 5 — runner CLI 子命令

**Files:**
- Create: `src/cli/commands/stage-extensions.ts`
- Modify: `src/cli/index.ts`(注册 `buildStageExtensionsCommand()`)
- Create: `tests/cli/stage-extensions.test.ts`(6 integration scenario)

### Step 5.1: CLI 接口

```bash
forge stage-extensions run --stage <stage> --change-id <id>
# stage ∈ [brainstorming, propose, apply_critical_plan_review, review, verify]
```

### Step 5.2: 主流程伪代码(v2 重写 — F1 + F2 + F5 fix)

**v1 → v2 关键变化**:
1. **显式状态机**(F1 fix):用 `RoundOutcome` tagged union 替代嵌套 loop + `break`,消除变量作用域 leak + 控制流歧义
2. **拆 retry budget vs round budget 两个独立计数器**(F2 fix):`attempt` 只在 spawn/zombie 失败时 +1;`round` 是 review 轮数;用户 continue 走 `roundBudget += N` 不动 attempt
3. **verdict-approve AND block 桶空短路**(F5 fix):即使 `verdict='approve'`,findings 经 confidence/severity filter 后 block 桶非空 → 仍判未收敛

```typescript
// v3 修订(F1-v2 fix):runStage 先跑 validateStageExtensionsConfig 拿
// NormalizedStageExtensionsConfig — 每个 entry 的 convergence 已深合并为完整 ConvergenceConfig,
// 各 optional 字段已填充。runner 全程只接收 normalized,不再做 `?? defaults` fallback。
async function runStage(stage: StageName, changeId: string): Promise<number> {
  const raw = loadConfig().stage_extensions;
  if (!raw) return 0;                                  // 字段不存在,exit 0
  const config: NormalizedStageExtensionsConfig = validateStageExtensionsConfig(raw);
  const entries = config[stage];                       // normalized — 一定是数组(可能空)
  if (entries.length === 0) return 0;                  // 该 stage 无 extension,exit 0

  for (const entry of entries) {
    if (!entry.enabled) continue;
    // v5 修订(F1-v4 fix):per-entry try/catch — runExtension 内的非 RoundOutcome
    // 异常(buildPrompt / threadMap.save / askUser / dispatchFix / writePendingFindings
    // 等 reject)必须被隔离,否则一个 entry 异常打穿整个 stage,后续 enabled
    // entries 不跑,违背 loose 不互相影响语义。
    try {
      await runExtension(entry, stage, changeId, config);
    } catch (err) {
      log(`[runStage] extension '${entry.name}' 抛出非预期异常(已隔离,继续下一 entry):${(err as Error).message}`);
    }
  }
  return 0;   // 永远 exit 0(loose)
}

// RoundOutcome 7-kind tagged union 定义在 §4 state-machine.ts(v3 加 timeout,F3-v2 fix)
// 本段引用,不重复定义。

async function runExtension(
  entry: NormalizedStageExtensionEntry,
  stage: StageName,
  changeId: string,
  config: NormalizedStageExtensionsConfig,
) {
  const threadMap = new ThreadMap(changeId);
  await threadMap.load();

  // 拆 retry budget vs round budget(F2 fix)— entry 已 normalized,直接读不 fallback
  const maxAttempts = 1 + entry.max_retries;          // 默认 1 + 1 = 2
  let roundBudget = entry.convergence.max_rounds;     // 默认 10
  const roundHistory: Array<{ round: number; block_count: number }> = [];
  let lastConvergence: ConvergenceResult | null = null;                  // F1 fix:外层声明
  let attempt = 0;
  let round = 0;
  let totalRounds = 0;  // 跨 max_rounds_exceed continue 累计

  attemptLoop:
  while (attempt < maxAttempts) {
    // 内层 round loop — 一个 attempt 内的所有 review 轮次
    while (round < roundBudget) {
      round++;
      totalRounds++;
      const threadId = threadMap.getThreadId(stage, entry.name);
      const promptFile = await buildPrompt(entry, stage, changeId);
      const outputFile = resolveOutputPath(entry.output, changeId, totalRounds);

      const outcome = await runOneRound({
        command: entry.command,
        promptFile,
        threadId,
        outputFile,
        // entry 已 normalized — 直接读,无 `?? defaults` fallback(F1-v2 fix)
        poll_interval_sec: entry.poll_interval_sec,
        zombie_threshold_sec: entry.zombie_threshold_sec,
        timeout_sec: entry.timeout_sec,
        convergenceConfig: entry.convergence,         // 完整 ConvergenceConfig(已深合并)
        severityMap: config.severity_map,
      });

      // F1 fix:显式状态机 dispatch,失败类直接 continue attemptLoop 进 retry
      switch (outcome.kind) {
        case 'converged':
          // ✓ 收敛 → 更新 thread map + 退出 extension
          lastConvergence = outcome.convergence;
          await threadMap.recordRound(stage, entry.name, {
            thread_id: outcome.convergence.threadId ?? threadId,  // F2-v3 fix:codex 本轮缺 thread_id 时保留旧值,不 null 覆盖(防 resume 静默失效)
            round: totalRounds,
            last_verdict: outcome.convergence.verdict,
            last_finding_count: outcome.convergence.blockFindings.length + outcome.convergence.ignoreFindings.length,
            last_round_at: new Date().toISOString(),
          });
          await threadMap.save();
          return;  // ✓ 该 extension 成功

        case 'unconverged':
          // block 桶非空 → 更新 history + 用户介入
          lastConvergence = outcome.convergence;
          roundHistory.push({ round: totalRounds, block_count: outcome.convergence.blockFindings.length });
          await threadMap.recordRound(stage, entry.name, {
            thread_id: outcome.convergence.threadId ?? threadId,  // F2-v3 fix:codex 本轮缺 thread_id 时保留旧值,不 null 覆盖(防 resume 静默失效)
            round: totalRounds,
            last_verdict: outcome.convergence.verdict,
            last_finding_count: outcome.convergence.blockFindings.length + outcome.convergence.ignoreFindings.length,
            last_round_at: new Date().toISOString(),
          });
          await threadMap.save();

          // AskUserQuestion 三选项
          const userChoice = await askUserOnUnconverged(outcome.convergence, config.user_interaction);
          if (userChoice === 'auto_fix') {
            await dispatchFixSubagent(outcome.convergence.blockFindings);
            // 进下一 round(不动 attempt)
            continue;
          } else if (userChoice === 'manual_fix') {
            await waitForUserDone();
            continue;
          } else { // give_up
            return;
          }

        case 'spawn_failed':
        case 'zombie':
        case 'timeout':            // v3 新增(F3-v2 fix):timeout 跟其他失败类同处理
        case 'invalid_output':
        case 'attempt_failed':
          // 失败类(isFailureOutcome)→ F1 fix:直接 continue attemptLoop,不进 max_rounds 分支
          log(`[${entry.name}] round ${totalRounds} failed (${outcome.kind}): ${(outcome as any).reason ?? (outcome as any).error?.message ?? ''}`);
          attempt++;
          round = 0;  // round 重置,但 totalRounds 不重置(趋势分析跨 attempt 累计)
          continue attemptLoop;
      }
    }

    // 内层 round loop 自然结束 = max_rounds 到顶(不是 break 出来的)
    // F2 fix:max_rounds 到顶不消耗 attempt;若用户继续,直接 roundBudget += extra
    const trend = analyzeTrend(roundHistory);
    const exceedMode = entry.convergence.max_rounds_on_exceed;   // entry 已 normalized

    if (exceedMode === 'force_end') {
      // F1 fix:lastConvergence 必须有(到这里至少跑过 max_rounds 轮 unconverged)
      if (lastConvergence) await writePendingFindings(lastConvergence);
      return;
    }

    // ask 用户(默认推 give_up_recommended)
    const userChoice = await askUserOnMaxRounds(lastConvergence, trend, config.user_interaction);
    if (userChoice.kind === 'continue') {
      // F2 fix:加 round budget,不消耗 attempt
      roundBudget += userChoice.extraRounds;
      continue;  // 回到 inner while(round < roundBudget)
    } else if (userChoice === 'give_up') {
      return;
    } else { // accept
      if (lastConvergence) await writePendingFindings(lastConvergence);
      return;
    }
  }

  // attempt 用尽 (max_retries+1 次都失败)
  log(`[${entry.name}] ${maxAttempts} 次都失败,该 stage 放弃 codex 介入`);
  // 不阻塞主流程(loose),return 0 由 outer runStage 处理
}

// runOneRound 执行单轮:spawn + watcher + parse + judge
async function runOneRound(params): Promise<RoundOutcome> {
  let proc;
  try {
    proc = spawnCodex(params.command, params.promptFile, params.threadId, params.outputFile);
  } catch (error) {
    return { kind: 'spawn_failed', error };
  }

  const watchResult = await watchProcess(proc, params.outputFile, {
    poll_interval_sec: params.poll_interval_sec,
    zombie_threshold_sec: params.zombie_threshold_sec,
    timeout_sec: params.timeout_sec,
  });

  // v4 修订(F3-v3 fix):zombie + timeout 都必须终结进程。
  // 关键顺序:**先本地 proc.kill()(不可跳过),再 best-effort cancel** —
  // v3 伪代码 `await cancelCodexJob(); proc.kill()` 有缺陷:cancelCodexJob(null)
  // 抛错 / cancel RPC 卡住 → proc.kill() 不执行 → codex 进程残留与 retry 竞争。
  if (watchResult.kind === 'zombie' || watchResult.kind === 'timeout') {
    await terminateRound(proc, watchResult.jobId);
    return { kind: watchResult.kind, jobId: watchResult.jobId };
  }

  // watchResult.kind === 'done' — codex 进程自然退出
  if (watchResult.exitCode !== 0) {
    return { kind: 'attempt_failed', reason: `codex exit ${watchResult.exitCode}` };
  }

  let codexOutput: CodexReviewOutput;
  try {
    codexOutput = parseCodexOutput(params.outputFile);
  } catch (error) {
    return { kind: 'invalid_output', reason: (error as Error).message };
  }

  // F5 fix:verdict='approve' AND block 桶空 才短路;否则按 findings 分桶判
  const convergence = judgeConvergence(codexOutput, params.convergenceConfig, params.severityMap);

  if (convergence.blockFindings.length === 0) {
    return { kind: 'converged', convergence };
  }
  return { kind: 'unconverged', convergence };
}

// terminateRound(v4 新增,F3-v3 fix;v5 修订 F2-v4 fix:SIGKILL 后再确认 close)。
// 终结 zombie/timeout 轮次的进程。terminateRound resolve 时进程**已确认 close**
// (或明确记录"无法确认终止")— runner 据此保证 retry 不与旧进程竞争。
async function terminateRound(proc: ChildProcess, jobId: string | null): Promise<void> {
  // 0. v5 修订(F2-v4 fix):入口先订阅 close,避免后续错过事件
  //    proc 已 spawn,close 可能在任意时刻派发 — 提前挂 listener。
  const closePromise: Promise<void> = once(proc, 'close').then(() => undefined);

  // 1. 本地 kill — 必须先做,不被 cancel 失败阻断
  try {
    proc.kill();  // SIGTERM
  } catch {
    /* 进程可能已退出,忽略 */
  }

  // 2. best-effort 远程 cancel — jobId 为 null 跳过;加短 timeout;吞错只记日志
  if (jobId !== null) {
    try {
      await withTimeout(cancelCodexJob(jobId), 5000);  // 5s cancel 上限
    } catch (err) {
      log(`[terminateRound] cancelCodexJob(${jobId}) 失败(已本地 kill,忽略):${(err as Error).message}`);
    }
  }

  // 3. 等 SIGTERM 后 close;超时 → SIGKILL → **再次等 close**(F2-v4 fix:
  //    v4 缺陷是 SIGKILL 后立即 return,close 是异步事件未确认)
  try {
    await withTimeout(closePromise, 3000);
    return;  // ✓ SIGTERM 后正常 close
  } catch {
    proc.kill('SIGKILL');
  }
  try {
    await withTimeout(closePromise, 3000);  // 第二次等待 — SIGKILL 后确认 close
  } catch {
    // 第二次仍超时 — 明确记录"无法确认终止"(极端情况,如僵死内核态)
    log(`[terminateRound] ⚠️ 进程 ${proc.pid} SIGKILL 后仍未确认 close — 无法确认终止;retry 风险标记`);
  }
}
```

### Step 5.2bis: judgeConvergence 修订(F5 fix)

```typescript
function judgeConvergence(
  output: CodexReviewOutput,
  config: ConvergenceConfig,
  severityMap: SeverityMap,
): ConvergenceResult {
  // 1. confidence filter
  const filtered = output.findings.filter((f) => f.confidence >= config.confidence_threshold);

  // 2. severity 翻译 + 分桶
  const block: ForgeFinding[] = [];
  const ignore: ForgeFinding[] = [];
  const droppedByConfidence = output.findings.length - filtered.length;

  for (const f of filtered) {
    const forgeSeverity = mapCodexToForge(f.severity, severityMap);
    const ff: ForgeFinding = { ...f, forge_severity: forgeSeverity };
    if (config.block_severity.includes(forgeSeverity)) block.push(ff);
    else ignore.push(ff);
  }

  // 3. F5 fix:verdict=approve 短路条件 = block 桶空(即使 verdict=approve,block 非空也不收敛)
  const verdictApproveShortCircuit = config.verdict_approve_short_circuit
    && output.verdict === 'approve'
    && block.length === 0;

  return {
    threadId: output.thread_id ?? null,
    verdict: output.verdict,
    blockFindings: block,
    ignoreFindings: ignore,
    droppedByConfidence,
    shortCircuited: verdictApproveShortCircuit,
  };
}
```

### Step 5.3: 20 integration scenario(v5 修订 — 7 happy + 13 失败路径;累计 F6 + F1-v2/v3 + F3-v2/v3 + F1-v4 fix)

**7 Happy Path Scenarios**(v4 加第 7 个 — F1-v3 fix):

| Scenario | 验证 |
|---|---|
| 首轮收敛(verdict=approve, block 桶空) | RoundOutcome.kind=converged,thread map 更新 round=1 |
| 首轮 verdict=approve **但** findings 含 1 BLOCKER → 不短路(F5 fix) | RoundOutcome.kind=unconverged,即使 verdict=approve |
| 多轮收敛(round 1 unconverged → fix → round 2 converged) | thread map round=2 + last_verdict=approve;attempt=0 不动 |
| 僵尸 cancel + retry 成功(F1 fix:zombie 直接进 retry 不进 max_rounds) | round 1 zombie → attempt++→ round 重置 0 → attempt 2 round 1 converged |
| max_rounds=10 到顶 ask + 趋势递减 → 用户 continue 5 轮(F2 fix:不消耗 attempt)| roundBudget 10→15,attempt 仍 0;继续 round 11-15 |
| max_rounds_on_exceed=force_end → 写 pending-findings.yaml | round 10 不 ask,直接落 backlog |
| **codex 正常 exit 0 → watcher emit `done` 不等 timeout(v4 新增,F1-v3 fix)** | stub codex 写合法 JSON 后 exit 0 → `proc.close` 触发 → watcher emit `done` exitCode=0 → **在 timeout_sec 之前** runOneRound 返回 converged;assert 总耗时 ≪ timeout_sec |

**13 Failure Path Scenarios**(v5 修订 — F6 8 个 + F1-v2/F3-v2 + F2-v3/F3-v3 + F1-v4 各加):

| Scenario | 验证 |
|---|---|
| F-1 approve+BLOCKER 冲突 | judgeConvergence 返 unconverged(verdict=approve but block.length > 0) |
| F-2 codex JSON malformed(缺 verdict 字段) | RoundOutcome.kind=invalid_output → 进 retry attempt |
| F-3 codex output file 不存在(spawn 退但没写文件) | parseCodexOutput 抛 error → invalid_output |
| F-4 codex spawn exit nonzero(非 0 非僵尸) | RoundOutcome.kind=attempt_failed → 进 retry |
| F-5 僵尸后**不**进入 max_rounds 分支(F1 fix) | round 1 zombie + max_rounds 10 → 不算到顶,进 retry attempt 2 |
| F-6 多个 enabled entries 隔离(entry A 失败,entry B 仍跑) | runStage 内 entries[1] 跑挂 entries[2] 不受影响 |
| F-7 thread-map 写入竞争(并发 entries 同 stage 不同 name) | ThreadMap.save 用 lock 防 yaml 文件损坏 |
| F-8 用户 continue 不消耗 retry(F2 fix) | max_rounds 到顶 + 用户 continue 5 → attempt 仍 0,roundBudget 加 5 |
| F-9 timeout 进程被 kill 且不进 max_rounds(F3-v2 fix;v4 强化) | output mtime 持续更新直到 timeout_sec → RoundOutcome.kind=timeout → `terminateRound` 先 proc.kill();assert codex 进程已终止 + 进 retry attempt |
| F-10 entry partial convergence 仍可 judge(F1-v2 fix) | config entry 只覆盖 `convergence: { max_rounds: 20 }` → validateStageExtensionsConfig 深合并 → judgeConvergence 不抛异常 |
| **F-11 thread_id 缺失轮次保留旧 thread(v4 新增,F2-v3 fix)** | round1 codex 返 `cdx-123` 写入 map;round2 resume 后 codex 输出**缺** `thread_id`(judgeConvergence threadId=null)→ recordRound 写回 `null ?? threadId` 保留 `cdx-123`;round3 仍 `--resume cdx-123` |
| F-12 terminateRound:jobId=null + cancel reject 进程仍终止(F3-v3 fix;v5 强化)| (a) `jobId=null` → 跳过 cancelCodexJob,proc 仍被 kill;(b) `cancelCodexJob` reject → 已先 proc.kill(),错误被吞 + log;(c) **SIGTERM 被忽略 → SIGKILL → 再次等 close**(v5,F2-v4 fix);三 case 都 assert 进程最终确认 close |
| **F-13 单 entry 非 RoundOutcome 异常被隔离(v5 新增,F1-v4 fix)** | entry A 的 `buildPrompt` 或 `threadMap.save` reject → runStage per-entry try/catch 捕获 + log → entry B 仍被执行 → CLI exit 0(loose 不打穿)|

### Step 5.4: commit Task 5

---

## §8 Task 6 — commands/*.md 5 处末尾段

**Files:**
- Modify: `commands/brainstorm.md`
- Modify: `commands/propose.md`
- Modify: `commands/apply.md`
- Modify: `commands/review.md`
- Modify: `commands/verify.md`
- Modify: `src/core/templates/commands/*.md`(由 `scripts/copy-templates.mjs` 自动 sync,不手动改)
- Create: `tests/integration/stage-extensions-commands-sync.test.ts`

### Step 6.1: 5 处末尾段模板

```markdown
## (可选)Stage extensions hook — Tier 1 Claude Code only

> 通用 stage extensions framework;codex review 是预置 default entries。
> Tier 2/3(Codex/OpenCode)见 [`docs/stage-extensions.md §未来 Tier 2/3 集成`](../docs/stage-extensions.md#未来-tier-23-集成)。

​```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" stage-extensions run \
  --stage <stage> \
  --change-id <change-id>
​```

runner 内部读 `forge/config.yaml#stage_extensions.<stage>` 决定跑哪些工具;若 `enabled: false`
或数组为空,runner 立即 exit 0,无副作用。详细协议见 [`docs/stage-extensions.md`](../docs/stage-extensions.md)。
```

每文件只换 `--stage <name>` 字段值:
- `brainstorm.md` → `--stage brainstorming`
- `propose.md` → `--stage propose`
- `apply.md` → `--stage apply_critical_plan_review`
- `review.md` → `--stage review`
- `verify.md` → `--stage verify`

### Step 6.2: 跑 `pnpm build` md5 sync

```bash
pnpm build  # 沿 [[feedback-forge-commands-build-sync]] 必跑
# 期望:✓ synced 9 commands 含 5 个本次改动
```

### Step 6.3: commands sync test

assert 5 个 commands/*.md 末尾段的 5 个 stage 字段都正确(grep 命令字面)。

### Step 6.4: commit Task 6

---

## §9 Task 7 — integration + unit tests

**Files:**
- Existing tests scattered in Task 1-6 commits
- 这个 Task 是补齐缺漏 + 跑全 suite

### Step 7.1: test inventory(v2 修订 — 引用 §2 单一来源,不重复)

详见 §2 "**测试 inventory 单一来源**" 表。本 Task 任务是**校对各 Task commit 后的累计 test 数符合 §2 表预期**,不增加新 test 项。

权威累计:1018 baseline + 12 B-full(已 ship) + 52 本 plan 新增 = **1082 target**。

### Step 7.2: 跑全 suite

```bash
pnpm test  # 期望 1082 PASS
# 若 PASS 数 != 1082,跨 Task 1-6 commit 各回查累计

# 同时显式跑 13 失败路径(F6 + F1-v2/v3 + F3-v2/v3 + F1-v4 关键 case):
pnpm vitest run tests/cli/stage-extensions.test.ts -t "failure path"
```

### Step 7.3: commit Task 7(若有补漏)

---

## §10 Task 8 — 文档

**Files:**
- Create: `docs/stage-extensions.md`(framework 协议主文档)
- Create: `docs/codex-review.md`(codex 预置 extension 用户指南)
- Modify: `docs/getting-started.md`(加 §"Stage extensions" 嵌入 deep-dive)
- Modify: `README.md`(§"核心交付" 加 stage-extensions 段)

### Step 8.1: `docs/stage-extensions.md` 结构

- §1 概念(framework 是什么)
- §2 config schema 完整字段表
- §3 协议:多轮收敛 / 僵尸检测 / thread map / 趋势分析
- §4 加新 extension(用户视角:加 grok / lint)
- §5 troubleshooting(常见 8 个问题)
- §6 未来 Tier 2/3 集成(留接口设计)

### Step 8.2: `docs/codex-review.md` 结构

- §1 quick start(开关 enabled + 推荐 D/E 路径)
- §2 完整 config 默认值
- §3 5 stage 触发点说明 + 适用场景
- §4 severity 4 级映射(codex / forge 显示 / forge 三级)
- §5 收敛规则 + 用户介入流程
- §6 Tier 2/3 手动跑 codex CLI 指引

### Step 8.3: `docs/getting-started.md` 嵌入

在第 4 步 review 段和第 5 步 verify 段各加"嵌入 deep-dive: stage-extensions"段(5-8 行 + 链接到 docs/stage-extensions.md)。

### Step 8.4: `README.md` 更新

- §"核心交付" 加 "stage_extensions framework"(plan-stage-extensions-framework)bullet
- §状态段 update 测试数 1018 → 1082

### Step 8.5: commit Task 8

---

## §11 Task 9 — verify + retrospect

### Step 9.1: 全 5 verify

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
# 期望:全 exit 0
```

### Step 9.2: version bump 1.1.0 → 1.2.0

```bash
# package.json version 字段
# CHANGELOG.md 加 [1.2.0] - 2026-05-XX 段
```

### Step 9.3: CHANGELOG `[1.2.0]` 段(v2 修订)

- **Added**:`stage_extensions` codex stage extension framework(v1 codex-only;generic ExtensionContract 留 v2/v3 refactor)
- **Added — CLI**:`forge stage-extensions run` 子命令(显式状态机 / 拆 retry+round budget / 僵尸检测 cancel)
- **Added — Core**:`src/core/stage-extensions/` 6 模块 + `src/core/codex-review/prompts/adversarial-default.md`(B-full Task 0 已 ship 通用模板)
- **Added — Skills + Templates**:`commands/*.md` 5 处末尾段(brainstorm/propose/apply/review/verify)+ 1 个新 slash 命令 `commands/codex-adversarial.md`(B-full Task 0 已 ship)
- **Added — Tests**:64 incremental tests(B-full Task 0 ship 12 + plan 实施 52;1018 baseline + 64 = 1082 total)
- **Added — Docs**:`docs/stage-extensions.md`(framework 协议)+ `docs/codex-review.md`(用户指南)+ `docs/getting-started.md` 嵌入 deep-dive + README 更新
- **Acknowledgments**:Codex 对抗性 review N 轮(plan v1 → v2 已经 ship 1 轮发现 1 BLOCKER + 5 MAJOR + 1 MINOR 全 accept 修订;后续 v2 → v3 视情况;沿 v1.0/v1.1 ack 模式)

### Step 9.4: master plan 状态回写

(本 plan 是独立 framework,不在 fusion completion master plan §3 表里;若 master plan 有 "v1.2 planned" 段,加入)

### Step 9.5: PR

```bash
gh pr create --title "feat: stage-extensions framework + codex review integration (plan-stage-extensions-framework)" \
             --body "$(cat <<'EOF'
## Summary
- 加 stage_extensions framework(forge core 通用 stage-level extension runner)
- 预置 codex review/adversarial 作 default entries(Tier 1 Claude Code only)
- 5 处 commands/*.md 末尾段调 runner;SKILL.md 0 改动(协议层纯净)
- 多轮收敛 + 僵尸检测 + thread map + 趋势分析 + AskUserQuestion 介入
- 留 Tier 2/3 Codex/OpenCode 扩展接口(harness-agnostic helper / config / prompts)

## Test plan
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test`
- [x] 1018 + 64(12 B-full + 52 本 plan)= 1082 tests pass
- [x] config schema validation 边界 case 覆盖
- [x] integration test 20 scenario:7 happy + 13 failure path(F-1..F-13 详 plan §7 Step 5.3)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 9.6: git tag v1.2.0

```bash
git tag -a v1.2.0 -m "v1.2.0: stage-extensions framework + codex review integration"
git push origin v1.2.0
```

---

## §12 风险与缓解

| 风险 | 缓解 |
|---|---|
| codex review 平均耗时不可控(可能 ≥ 15min)| `timeout_sec` config 可改;`docs/codex-review.md` troubleshooting 段给调节指引 |
| 多轮收敛卡死(每轮 ask 干扰流程)| max_rounds 到顶 ask 默认推放弃;`user_interaction.block_unconverged: auto_fix_recommended` 默认自动 |
| auto fix subagent 引入新 bug 后 round 2 报新 finding(死循环)| trend-analyzer:finding 上升时建议放弃 |
| codex JSON output 不合规(schema 校验失败)| runner 校验,失败按 extension exit !=0 处理走 retry |
| codex CLI 未装 | runner spawn 失败 → 错误隔离 → 跳过 + 用户提示 |
| 用户开 5 stage 但忘了 disable + 总耗时 3 小时 | 文档明确推 "只开 D/E";getting-started 加 quick start config 示例 |
| Tier 2/3 用户期待自动跑 codex 失望 | `docs/stage-extensions.md` §6 明确写 Tier 2/3 第一版不实施 + 给手动跑 codex CLI 指引;留接口 |

---

## §13 修订记录

(plan 起草 + 后续 Codex review 多轮修订留底,沿 plan-v1.1 模板)

- **v1**(2026-05-15):plan 起草,沿用户对话 ~10 轮 brainstorm 沉淀(16 决策表 → 20 Q-style decisions);未跑 Codex review
- **v1.1**(2026-05-15):B-full Task 0 enabling wrapper ship(commit `02710da`):`commands/codex-adversarial.md` + `scripts/codex-review-helper.mjs` + `src/core/codex-review/prompts/adversarial-default.md` + 12 tests;后续 plan v2 incorporate 此 ship
- **v2**(2026-05-15):Codex 对抗性 review 第 1 轮跑完(64 commit `02710da` ship 后),拿到 1 BLOCKER + 5 MAJOR + 1 MINOR + 11 user-列 polish,全 accept 修订:
  - **F1 BLOCKER** runner 变量作用域 + 控制流:Q22 新增 + §7 Step 5.2 重写显式状态机(6 RoundOutcome states)+ lastConvergence 外层声明
  - **F2 MAJOR** continue 消耗 retry:Q23 新增 + §7 拆 attempt vs roundBudget 两个独立计数器
  - **F3 MAJOR** background 决策与实施矛盾:Q5 修订 sync default + `--background` 留 v2
  - **F4 MAJOR** generic 抽象泄漏:Q1 修订 codex-specific scope + 留 ExtensionContract v2/v3
  - **F5 MAJOR** verdict approve 短路掩盖 BLOCKER:Q15 修订 + §7 Step 5.2bis judgeConvergence 短路条件改为 AND block 桶空
  - **F6 MAJOR** 测试 inventory 不一致 + 缺失场景:Q24 新增 + §2 单一来源表 + §7 Step 5.3 14 scenario(6 happy + 8 failure)
  - **F7 MINOR** DoD 不可验证:§14 全改可执行命令
  - **P1-P11 user polish**:helper 名 `codex-review-helper.mjs`、加 Task 0、Windows `shell:true` 兼容、估时减 B-full 等
- **v3**(2026-05-15):Codex 对抗性 review 第 2 轮跑完(plan v2 commit `3021c87` 后),Codex 确认 v2 修掉原 F1/F2/F5 主线意图,但 v2 重写 §7 引入新接口问题 — 拿 2 BLOCKER + 2 MAJOR,全独立核实为真问题(0 误报),全 accept 修订:
  - **F1-v2 BLOCKER** entry-level partial convergence 绕过 defaults → judgeConvergence 运行时崩溃:§3 加 `NormalizedStageExtensionEntry` / `NormalizedStageExtensionsConfig` 类型 + validator 深合并 effective convergence;§7 runner 全程接收 normalized config,删 `?? defaults` fallback;§7 Step 5.3 加 F-10 test
  - **F2-v2 BLOCKER** `threadId: string \| null` 写入 `thread_id: string` strict 编译失败:§4 `ThreadMapEntry.thread_id` 改 `string \| null` + null 不 resume 语义
  - **F3-v2 MAJOR** timeout 路径无状态分支 → 残留 codex 进程:§4 state-machine RoundOutcome 加 `timeout` kind(6→7 states)+ `isFailureOutcome` 含 timeout;§7 runOneRound 加 timeout 分支(kill + cancel,同 zombie);§7 Step 5.3 加 F-9 test
  - **F4-v2 MAJOR** §14 DoD 假阳性(grep 错文件 / `==` 非断言):§14 全改真 shell 断言(`test "$(...)" = "$(...)"`),CHANGELOG grep 改指向 `CHANGELOG.md`,git tag 用 `^{}` 解 annotated tag
  - 测试(v3 当时)16 scenario(6 happy + 10 failure)/ 总目标 1076(58 incremental)
- **v4**(2026-05-15):Codex 对抗性 review 第 3 轮跑完(plan v3 commit `2d41a9f` 后)。**BLOCKER 清零**(收敛趋势 block 桶 6→4→3),Codex 拿 0 BLOCKER + 3 MAJOR,全独立核实真问题(0 误报),全 accept 修订:
  - **F1-v3 MAJOR** OutputWatcher 没定义 `done` 产生 → 正常退出轮次误判:§2.5 watcher 构造函数加 `proc` 参数 + 明确监听 `proc.once('close')` emit `done` + 立即 clearInterval;加第 7 个 happy-path test(codex exit 0 不等 timeout)
  - **F2-v3 MAJOR** `thread_id: null` 覆盖已有 thread → resume 静默失效:§7 runner recordRound 写回改 `outcome.convergence.threadId ?? threadId`(本轮缺失保留旧值);加 F-11 test
  - **F3-v3 MAJOR** timeout/zombie 先 cancel 后 kill,cancel 失败留进程:§7 加 `terminateRound` helper — 先 `proc.kill()`(不可跳过)再 best-effort cancel(jobId null 跳过 + 5s timeout + 吞错)+ 等 close 否则 SIGKILL;加 F-12 test
  - 测试(v4 当时)19 scenario(7 happy + 12 failure)/ 总目标 1079(61 incremental)
- **v5**(2026-05-15):Codex 对抗性 review 第 4 轮跑完(plan v4 commit `7810765` 后)。Codex 确认 v4 thread_id 保留修复成立。收敛趋势 block 桶 6→4→3→2,持续递减。Codex 拿 0 BLOCKER + 2 MAJOR + 1 MINOR,全独立核实真问题(0 误报),全 accept 修订:
  - **F1-v4 MAJOR** 单 entry 非 RoundOutcome 异常打穿 loose 隔离:§7 `runStage` 每个 entry 加 `try/catch`(隔离 buildPrompt / threadMap.save / askUser / dispatchFix / writePendingFindings 等 reject)+ log + 继续下一 entry;加 F-13 test
  - **F2-v4 MAJOR** `terminateRound` SIGKILL fallback 未确认 close:§7 terminateRound 入口先订阅 `closePromise`,SIGTERM 等待超时 → SIGKILL → **再次等 close**,第二次仍超时则记录"无法确认终止";F-12 test 加 SIGKILL case
  - **F3-v4 MINOR** OutputWatcher 无 single-settle 防护:§2.5 加 `settled` flag 规格(所有 emit 路径先检查 + interval 发 zombie/timeout 前检查 `proc.exitCode`),output-watcher unit test 3→5(加 done happy + single-settle 边界)
  - 测试 20 scenario(7 happy + 13 failure)/ 总目标 1082(64 incremental)
- (待:v6 — 若第 5 轮 Codex review 仍有 BLOCKER/MAJOR)

---

## §14 验收 checklist(v3 修订 — F7 + F4-v2 fix:全改真 shell 断言)

每条都是真 shell 断言(`test` / `grep -q` / `[ ]`),exit code 0 = 通过;不需推理:

- [ ] **全 5 verify exit 0**:`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test`
- [ ] **总测试 1082 PASS**:`pnpm test 2>&1 | grep -E "Tests +.*1082 passed"`
- [ ] **CHANGELOG 段存在**:`grep -q "^## \[1.2.0\]" CHANGELOG.md`
- [ ] **CHANGELOG 含 finding 修订记录**(v3 修订,F4-v2 fix — grep `CHANGELOG.md` 不是 plan 文件):`test "$(grep -cE '\b(F1|F2|F3|F4|F5|F6|F7)\b' CHANGELOG.md)" -ge 7`
- [ ] **PR 已合并到 main**:`git log main --oneline | head -1 | grep -E "stage-extensions"`(必须 PR 合并后才存在该 commit)
- [ ] **git tag v1.2.0 指向 main HEAD**(v3 修订,F4-v2 fix — 真 shell 断言,`^{}` 解 annotated tag):`test "$(git rev-parse 'v1.2.0^{}')" = "$(git rev-parse main)"`(tag 必须在 PR 合并后创建,不能合并前推)
- [ ] **README badge v1.2.0**:`grep -oE '"version":\s*"[^"]+' package.json | grep -q "1.2.0"`(GitHub package-json badge 自动读)
- [ ] **SKILL.md 0 改动**(全 repo 不限 skills/):`test "$(git diff main^..HEAD --name-only | grep -cE '(^|/)SKILL\.md$')" -eq 0`
- [ ] **5 commands/*.md 末尾段一致**:`test "$(grep -l 'stage-extensions run' commands/*.md | wc -l)" -eq 5`
- [ ] **commands sync 一致**:`test "$(grep -l 'stage-extensions run' src/core/templates/commands/*.md | wc -l)" -eq 5`
- [ ] **helper harness-agnostic**:`test "$(grep -cE 'process\.env\.(CLAUDE_PLUGIN_ROOT|FORGE_PLUGIN_ROOT)' scripts/codex-review-helper.mjs)" -eq 0`(沿 B-full Task 0 harness-compat test 同协议)
- [ ] **13 failure path tests 跑过**:`pnpm vitest run tests/cli/stage-extensions.test.ts -t "failure path" 2>&1 | grep -E "13 passed"`
- [ ] **docs 文档存在 + 含 quick start**:`for f in docs/stage-extensions.md docs/codex-review.md; do grep -qi "quick start" "$f" || { echo "MISSING quick start in $f"; exit 1; }; done`
- [ ] **README §核心交付 含 stage-extensions**:`grep -q "stage-extensions" README.md`
