# plan stage-extensions-framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加 `stage_extensions` framework — forge core 通用 stage-level extension runner;预置 codex review/adversarial 作 default entries;让用户能 config 开关 / 改阈值 / 加新工具(grok / lint / coverage 等);Tier 1 Claude Code only 实施,Tier 2/3 Codex/OpenCode 留 harness-agnostic 扩展接口。SKILL.md 0 改动(协议层纯净),只在 5 处 `commands/*.md` 末尾各加 ~5 行调用 runner。

**Architecture:** 通用 framework + 预置 codex extension。`src/cli/commands/stage-extensions.ts` runner 读 `forge/config.yaml#stage_extensions.<stage>` 数组 → 遍历 extension → 每 entry build_prompt + spawn + poll 僵尸 + 收敛判定 + AskUserQuestion 介入 + loose 模式(不入 marker,不阻塞 fence)。配套:`scripts/run-codex-review.mjs`(harness-agnostic helper),`src/core/stage-extensions/` 6 子模块(severity-mapper / convergence-judge / thread-map / trend-analyzer / output-watcher / config-validator),`src/core/codex-review/prompts/` 3 个 adversarial 模板,3 处 commands(brainstorm/propose/apply 走 adversarial)+ 2 处 commands(review/verify 走 code-review)末尾段。

**Pre-condition:** 所有 commit / PR / heredoc 命令在 Git-Bash 执行(沿用户 Windows 11 + Git-Bash 环境)。本 plan 的所有 fenced bash 字面在 Git-Bash 原生支持。codex CLI 已装(`codex --version` 可用)— 否则 runner spawn 失败走错误隔离路径。

**Tech Stack:** Node 20+ / TypeScript ESM strict / commander 12 / vitest / pnpm 9+ / codex CLI native subcommands(`codex review` / `codex exec` / `codex task --resume` / `codex cancel`)/ codex-companion.mjs(可选,留 fallback;主路径直接调 codex CLI)/ codex review JSON output schema(`review-output.schema.json`,critical/high/medium/low 四级 severity + verdict + confidence)

---

## §0 Brainstorm 决策表(2026-05-15)

| Q | 问题 | 选项 | 决策 | 理由 |
|---|---|---|---|---|
| Q1 | hardcoded codex hook vs generic framework | A. hardcoded codex / B. generic framework(stage_extensions)/ C. A.5 hybrid | **B. generic framework** | 用户明确选 C 路径;为未来加 grok / lint / coverage 等留扩展;commands/*.md 改动从 ~125 行降到 ~25 行;第三方 plugin 可加 default entries 不动 forge core |
| Q2 | 三 harness 范围 | A. Tier 1 only / B. Tier 1 + Tier 2/3 同步 / C. Tier 1 + Tier 2/3 文档手动指引 | **C. Tier 1 only,文档指引 Tier 2/3** | Tier 2/3 上 codex 集成需要 SKILL.md 改动 + harness 检测,工程量翻倍;Tier 2/3 用户跑 codex CLI 直接调一行即可;留 harness-agnostic 接口(helper 不绑 `${CLAUDE_PLUGIN_ROOT}`),未来 v2 可加 |
| Q3 | SKILL.md 是否改 | A. 改 5 处 / B. 0 改 | **B. 0 改** | 协议层纯净度优先;commands/*.md 是 plugin 接入层,加段不污染协议本体;跟 forge-repo 历史"commands 是入口,skills 是协议"分层一致 |
| Q4 | 触发点范围 | A. 只 D/E / B. A+B+C+D+E 全 5 处 / C. 用户 config 自选 | **B+C 混合** | 默认 5 处全开;但 config 可逐 stage `enabled: false` 关掉。文档 quick start 推荐"只开 D/E"(20-50 分钟,平衡 UX 与价值) |
| Q5 | mode 默认值 | A. sync `--wait` / B. async `--background` | **B. background** | codex 平均 5-15 分钟,sync 会阻塞主代理对话;background + 定时 status 反馈给用户更好 UX |
| Q6 | 僵尸检测信号 | A. codex job status=running 卡住 / B. output 文件 mtime 静止 / C. AND 两者 | **B. output 文件 mtime 静止 ≥ 5 分钟 AND 总时长 ≥ 15 分钟** | output 文件 mtime 是机器判定,比 codex job status 更可靠;AND 减少误判(codex 启动后 1 分钟没写文件不算僵尸) |
| Q7 | max_retries 默认值 | A. 0 / B. 1 / C. 3 | **B. 1**(总 2 次尝试),config 可改 | 用户明确"连续两次失败放弃";retry 2 次给 codex 偶发抖动一次机会,2 次都挂大概率系统性问题 |
| Q8 | subagent 复用策略 | A. 每轮新 thread / B. 同 stage 复用 thread,跨 stage 新 thread / C. 全局单 thread | **B. 同 stage 复用 + 跨 stage 新 thread** | codex `--resume <thread-id>` 让 review 续 context,看用户修了什么改;跨 stage 切 thread 防 context 串扰 |
| Q9 | severity 显示术语 | A. codex 原生 critical/high/medium/low / B. forge 三级 CRITICAL/WARNING/SUGGESTION / C. forge 四级 BLOCKER/MAJOR/MINOR/NIT | **C. BLOCKER/MAJOR/MINOR/NIT** | 沿 forge plan/spec 文档惯例(`grep BLOCKER\|MAJOR docs/plans/` 命中);跟 maintainer 跑 codex 时 prose 翻译习惯一致;loose 模式不入 marker,只 UX 显示 |
| Q10 | 收敛规则 | A. block=[BLOCKER] / B. block=[BLOCKER, MAJOR] / C. 全 severity 必须 0 | **B. block=[BLOCKER, MAJOR]** | 用户明确"没有 BLOCKER MAJOR 算收敛";MINOR/NIT 不阻塞,计 backlog;沿 forge SUGGESTION 不阻塞 archive 同语义 |
| Q11 | max_rounds 默认 | A. 5 / B. 10 / C. 无限 | **B. 10**,config 可改 | 用户明确;5 太少(可能首版 codex review 收敛慢),无限可能卡死 |
| Q12 | max_rounds 到顶行为 | A. 强制结束计 backlog / B. ask 用户给趋势建议 / C. 用户 config 选 | **C. config 选,默认 ask** | 用户明确 ask + 建议;`force_end` 留给 CI 自动跑场景 |
| Q13 | 未收敛默认介入 | A. 每轮 ask / B. auto fix subagent / C. 三选项 ask 推 auto fix | **C. 三选项 ask 推 auto fix** | 平衡用户掌控 + 流程顺;默认回车即 auto fix,不打扰节奏 |
| Q14 | confidence_threshold | A. 0(不过滤)/ B. 0.7 / C. 0.9 | **B. 0.7**,config 可改 | 平衡 — 过滤明显低置信度 noise,保留多数 finding;codex 偶尔推 0.4-0.6 finding 占位,容易拖死流程 |
| Q15 | verdict='approve' 短路 | A. true(信任 codex 总体判定)/ B. false(严格按 findings 分桶) | **A. true** default,config 可改 | 99% 时候结果一致;短路省 1 轮无意义 review;边界 case(approve 但 findings 含 NIT)直接收敛合理 |
| Q16 | fallback 机制 | A. `on_failure_command` 字段(`/codex:rescue` 兜底)/ B. 不引入,max_retries=1 同 command 重试足够 | **B. 不引入**,留 v2 加 | 用户改为 max_retries=1 同 command 重试;rescue prompt 模板单独写复杂度高;第一版砍掉,留 config 字段保留扩展性 |
| Q17 | loose vs strict 模式 | A. loose 不入 marker / B. strict 入 marker.review_outcomes / C. 单独 .codex-passed marker | **A. loose 不入 marker** | codex finding freeform → forge schema 映射不平凡;不影响 archive fence;给用户多一份意见参考,不强制 |
| Q18 | branch 策略 | A. dev 沿用 / B. 新 feature/stage-extensions / C. docs/plan-stage-extensions(沿 PR #35/#36/#37 命名) | **C. docs/plan-stage-extensions-framework** | 沿 forge-repo 最近 PR 命名风格;plan + impl 同分支;~3-5d scope 适合短命分支 |
| Q19 | 是否单独写 spec | A. plan + spec 两份 / B. plan 内嵌设计段 | **B. plan 内嵌**,沿 plan-v1.1 模式 | scope 跟 plan-9 sub-plan 相当但不跨 sub-plan;设计写在 plan 内不分散 |
| Q20 | dogfood 测试 | A. 本 change 自身用 stage_extensions runner / B. 不 dogfood | **B. 不 dogfood** | chicken-and-egg(stage_extensions 还没实施时 dogfood 跑不起来);plan 完成后另起 change `feature/codex-review-self-test` dogfood |

---

## §1 Scope 概述

**性质**:新 framework + 预置 codex extension。生产代码 + 配套测试 + 完整文档 + 跨 harness 接口预留。

**3 类 scope + 9 Task**:

- **A 组 核心模块**(4 Task):config schema → helper script → prompt 模板 → core modules
- **B 组 整合**(2 Task):runner CLI 子命令 → commands/*.md 5 处末尾段
- **C 组 测试与文档**(2 Task):integration + unit tests → 文档全套
- **Verify + retrospect**(1 Task):全 5 verify + CHANGELOG + version bump

**估时 P50 ~4-5d / P90 ~7d / cost ~$3-5**(对照 plan-9 系列 sub-plan 平均 P50 5-8 工日;本 plan 单一 framework 不跨 sub-plan,scope 更聚焦)。

**不在本 plan scope**(明确 scope-out):
- Tier 2/3 Codex/OpenCode 实施 → 留 v2;helper / config / prompt 模板设计为 harness-agnostic 留接口
- rescue 模式 fallback(`on_failure_command` 字段) → 留 v2;第一版 max_retries=1 重试足够
- D/E 阶段 adversarial 模式(D/E 只跑 code-review) → 留 v2;5 prompt 模板第一版只做 3 个 adversarial
- handoff_to_backlog 集成深度优化(severity 二次映射 to forge 三级)→ 第一版 minimum viable,只 `.evidence/codex-pending-findings.yaml` 写;后续 plan-9e 协议升级再深入
- 自定义 stage(用户加新 stage 名)→ 第一版只 5 stage hardcode;若需求出现再 generic stage name

---

## §2 Task list 概要表

| Task | 标题 | Scope | 估时(d)| 依赖 | 验收 |
|---|---|---|---|---|---|
| 1 | config schema + validator | `src/core/schema/types.ts` 扩 `StageExtensionsConfig` + `validateStageExtensionsConfig` | 0.5 | — | unit test 覆盖默认值 + 边界 case;`pnpm validate` config 文件示例通过 |
| 2 | core 子模块 | `src/core/stage-extensions/` 6 模块(severity-mapper / convergence-judge / thread-map / trend-analyzer / output-watcher / config-validator) | 1.0 | 1 | unit test 各模块覆盖 ≥ 85% |
| 3 | helper script | `scripts/run-codex-review.mjs` 2 子命令(`build-prompt` / `run`),harness-agnostic | 0.5 | 1, 2 | integration test 跑 codex CLI 真调成功;harness-compat test assert 不引用 `${CLAUDE_PLUGIN_ROOT}` |
| 4 | prompt 模板 | 3 个 adversarial 模板(brainstorming / propose / apply_critical_plan_review)在 `src/core/codex-review/prompts/` | 0.5 | — | 内容 review:每模板含 `<task>` / `<focus_artifacts>` / `<finding_bar>` / `<structured_output_contract>` 段 |
| 5 | runner CLI 子命令 | `src/cli/commands/stage-extensions.ts` 整合 1-4 模块:多轮收敛 + 僵尸检测 + AskUserQuestion 介入 | 1.5 | 1, 2, 3, 4 | integration test 6 个 scenario:首轮收敛 / 多轮收敛 / 僵尸 cancel / max_retries 用尽 / max_rounds 到顶 ask / max_rounds 到顶 force_end |
| 6 | commands/*.md 5 处 | 末尾各加 ~5 行调 runner;build sync verify | 0.5 | 5 | `pnpm build` md5 sync 通过;commands sync test 验 5 文件改动 |
| 7 | integration + unit tests | 全 25 test 凑齐:runner 6 / convergence 5 / thread-map 4 / trend 4 / output-watcher 3 / config 3 | 1.0 | 1-6 | `pnpm test` 全 1018+25 = 1043 PASS |
| 8 | 文档 | `docs/stage-extensions.md` 协议 + `docs/codex-review.md` 用户指南 + `docs/getting-started.md` 嵌入 deep-dive + README 更新 | 0.5 | 1-7 | self-review:每文档 含 quick start + 完整 config schema + troubleshooting + Tier 2/3 未来路径 |
| 9 | verify + retrospect | 全 5 verify(typecheck / lint / format:check / build / test)+ version 1.1.0→1.2.0 + CHANGELOG + git tag v1.2.0 + master plan 状态回写 | 0.5 | 1-8 | 全 5 命令 exit 0;CHANGELOG `[1.2.0]` 段含 9 决策 + breaking changes(无)+ ack |

**P50 总 5d / P90 7d**。

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
```

### Step 1.3: 写 `validateStageExtensionsConfig`(沿 `validateWritingPlansConfig` 模式)

- 跑 deep merge defaults(用户配置覆盖 built-in default)
- 校验:
  - `max_retries` ∈ [0, 10]
  - `timeout_sec` ∈ [60, 3600]
  - `confidence_threshold` ∈ [0, 1]
  - `max_rounds` ∈ [1, 100]
  - `block_severity` ∪ `ignore_severity` ⊆ ['BLOCKER', 'MAJOR', 'MINOR', 'NIT']
  - `command` / `build_prompt` 字符串非空
- 返回带 defaults 全填充的 config

### Step 1.4: 写 3 个 unit test

- `validates default config`(全 default 输入返回完整 config)
- `validates user override`(用户改 max_rounds=20 → 返回 max_rounds=20 其他保持默认)
- `rejects invalid values`(max_rounds=-1 / confidence_threshold=2 → throw ValidationError)

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

### Step 2.2: `convergence-judge.ts`

```typescript
export interface ConvergenceResult {
  converged: boolean;
  reason: 'verdict_approve' | 'block_bucket_empty' | 'block_bucket_non_empty' | 'max_rounds_exceeded';
  blockFindings: ForgeFinding[];      // BLOCKER + MAJOR(过滤 confidence 后)
  ignoreFindings: ForgeFinding[];     // MINOR + NIT
  filteredOut: ForgeFinding[];        // confidence < threshold 被过滤的
}

export function judgeConvergence(
  codexOutput: CodexReviewOutput,
  config: ConvergenceConfig,
  severityMap: SeverityMap
): ConvergenceResult;
```

### Step 2.3: `thread-map.ts`

```typescript
export interface ThreadMapEntry {
  thread_id: string;
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

### Step 2.5: `output-watcher.ts`

```typescript
export class OutputWatcher {
  constructor(filePath: string, pollIntervalSec: number, zombieThresholdSec: number, timeoutSec: number);
  async start(): Promise<void>;
  on(event: 'zombie' | 'timeout' | 'progress' | 'done', listener: Function): this;
  stop(): void;
}
```

实现:
- `setInterval` 每 `pollIntervalSec` 秒读 `fs.stat(filePath).mtime`
- 若 `now() - startTime ≥ timeoutSec` AND `now() - mtime ≥ zombieThresholdSec` → emit `zombie`
- 若 `now() - startTime ≥ timeoutSec` 但 mtime 仍在更新 → emit `timeout`
- 若 mtime 更新 → emit `progress`

### Step 2.6: 写 4 + 5 + 4 + 4 + 3 = 20 unit test 覆盖每模块

### Step 2.7: commit Task 2

```bash
git add src/core/stage-extensions/ tests/core/stage-extensions/
git commit -m "feat(stage-extensions): add 5 core modules + 20 unit tests (Task 2)..."
```

---

## §5 Task 3 — helper script `scripts/run-codex-review.mjs`

**Files:**
- Create: `scripts/run-codex-review.mjs`
- Create: `tests/scripts/run-codex-review.test.ts`

### Step 3.1: 写 helper(harness-agnostic)

```javascript
// scripts/run-codex-review.mjs
// 2 子命令:build-prompt / run

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [subcmd, ...rest] = process.argv.slice(2);

if (subcmd === 'build-prompt') {
  // --stage <s> --mode <m> --change-id <id> --output <path>
  // 读 src/core/codex-review/prompts/<stage>-<mode>.md
  // 替换变量({{CHANGE_ID}} / {{ARTIFACTS}} / ...)
  // 写到 --output 指定路径
} else if (subcmd === 'run') {
  // --mode <code-review|adversarial|rescue> --prompt-file <path> --thread-id <id> --output-file <path>
  // 根据 mode 调对应 codex CLI 子命令:
  //   code-review → `codex review`
  //   adversarial → `codex exec --prompt-file <path>`(读 prompt 文件作 prompt)
  //   rescue → `codex exec --prompt-file <path>`(留接口,v1 不实施)
  // 若 --thread-id 非空,加 `--resume <thread-id>`
  // stdout 透传 + tee 写到 --output-file
}
```

### Step 3.2: harness-agnostic 接口实证

- ❌ 不读 `process.env.CLAUDE_PLUGIN_ROOT`
- ❌ 不读 `process.env.FORGE_PLUGIN_ROOT`
- ✅ 所有路径通过 CLI 参数传入
- ✅ codex CLI 路径靠 PATH 解析(三 harness 通用)

### Step 3.3: 写 integration test

- `build-prompt` 子命令生成文件 + 变量替换正确(用 fixture 比对)
- `run --mode code-review` spawn `codex review`,assert spawn 参数(用 stub codex CLI 替身)
- `run --mode adversarial --thread-id ...` spawn `codex exec --prompt-file ... --resume ...`
- harness-compat test:assert helper source 不含 `CLAUDE_PLUGIN_ROOT` / `FORGE_PLUGIN_ROOT` 字面

### Step 3.4: commit Task 3

```bash
git commit -m "feat(scripts): add run-codex-review.mjs helper (Task 3)..."
```

---

## §6 Task 4 — prompt 模板 3 个

**Files:**
- Create: `src/core/codex-review/prompts/brainstorming-adversarial.md`
- Create: `src/core/codex-review/prompts/propose-adversarial.md`
- Create: `src/core/codex-review/prompts/apply_critical_plan_review-adversarial.md`

### Step 4.1: 模板结构(沿 codex `/codex:adversarial-review` prompt 模板)

每个 prompt 模板含:
- `<role>` — Codex 是 adversarial reviewer,不验证只挑战
- `<task>` — stage-specific 目标
- `<focus_artifacts>` — 列出本 stage 应读的 forge artifacts(变量替换)
- `<operating_stance>` — 默认怀疑,不为 happy path 加分
- `<attack_surface>` — stage-specific 攻击面
- `<finding_bar>` — 只报实质问题,不要风格/命名/低价值
- `<structured_output_contract>` — return JSON matching review-output.schema.json

### Step 4.2: brainstorming-adversarial.md 重点

`<focus_artifacts>`:
- `forge/drafts/{{DRAFT_NAME}}.md`(brainstorm draft)
`<attack_surface>`:
- design 假设的合理性 / scope 决策的边界 / 成功标准的可证伪性 / 未识别的 risk

### Step 4.3: propose-adversarial.md 重点

`<focus_artifacts>`:
- `forge/changes/{{CHANGE_ID}}/proposal.md`
- `forge/changes/{{CHANGE_ID}}/design.md`
- `forge/changes/{{CHANGE_ID}}/specs/*.md`
- `forge/changes/{{CHANGE_ID}}/tasks.md`
`<attack_surface>`:
- 4 件套类型一致性 / scope 顺序 / spec coverage / task 粒度

### Step 4.4: apply_critical_plan_review-adversarial.md 重点

`<focus_artifacts>`:
- `forge/changes/{{CHANGE_ID}}/tasks.md`
- `forge/changes/{{CHANGE_ID}}/specs/*.md`
`<attack_surface>`:
- plan 完整性 / 顺序合理性 / vague task 描述 / scope 应转 out-of-scope 的项

### Step 4.5: commit Task 4

```bash
git commit -m "feat(prompts): add 3 adversarial prompt templates (Task 4)..."
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

### Step 5.2: 主流程伪代码

```typescript
async function runStage(stage: string, changeId: string) {
  const config = loadConfig().stage_extensions;
  if (!config) return 0;                        // 字段不存在,exit 0
  const entries = config[stage] ?? [];
  if (entries.length === 0) return 0;           // 该 stage 无 extension,exit 0

  for (const entry of entries) {
    if (!entry.enabled) continue;
    await runExtension(entry, stage, changeId, config.defaults);
  }
  return 0;   // 永远 exit 0(loose)
}

async function runExtension(entry, stage, changeId, defaults) {
  const threadMap = new ThreadMap(changeId);
  await threadMap.load();

  for (let attempt = 0; attempt <= (entry.max_retries ?? defaults.max_retries); attempt++) {
    const roundHistory: Array<{ round: number; block_count: number }> = [];

    for (let round = 1; round <= (entry.convergence?.max_rounds ?? defaults.convergence.max_rounds); round++) {
      const threadId = threadMap.getThreadId(stage, entry.name);
      const promptFile = await buildPrompt(entry, stage, changeId);
      const outputFile = resolveOutputPath(entry.output, changeId);

      // spawn 命令 + 启 OutputWatcher
      const result = await spawnAndWatch(entry.command, promptFile, threadId, outputFile, {
        poll_interval_sec: entry.poll_interval_sec ?? defaults.poll_interval_sec,
        zombie_threshold_sec: entry.zombie_threshold_sec ?? defaults.zombie_threshold_sec,
        timeout_sec: entry.timeout_sec ?? defaults.timeout_sec,
      });

      if (result.kind === 'zombie' || result.kind === 'error') {
        // 进 retry
        break;
      }

      // 解析 codex output JSON
      const codexOutput = parseCodexOutput(outputFile);
      const convergence = judgeConvergence(codexOutput, entry.convergence ?? defaults.convergence, defaults.severity_map);
      roundHistory.push({ round, block_count: convergence.blockFindings.length });

      // 更新 thread map
      threadMap.recordRound(stage, entry.name, {
        thread_id: codexOutput.thread_id,
        round,
        last_verdict: codexOutput.verdict,
        last_finding_count: convergence.blockFindings.length + convergence.ignoreFindings.length,
        last_round_at: new Date().toISOString(),
      });
      await threadMap.save();

      if (convergence.converged) {
        // ✓ 收敛 → 退出
        return;
      }

      // 未收敛 → AskUserQuestion 三选项
      const userChoice = await askUserOnUnconverged(convergence, defaults.user_interaction);
      if (userChoice === 'auto_fix') {
        await dispatchFixSubagent(convergence.blockFindings);
        // 进下一轮
      } else if (userChoice === 'manual_fix') {
        await waitForUserDone();
      } else { // give_up
        return;
      }
    }

    // max_rounds 到顶
    const trend = analyzeTrend(roundHistory);
    if (entry.convergence?.max_rounds_on_exceed === 'force_end' || defaults.convergence.max_rounds_on_exceed === 'force_end') {
      await writePendingFindings(convergence);
      return;
    }
    // ask 用户(默认推 give_up_recommended)
    const userChoice = await askUserOnMaxRounds(convergence, trend, defaults.user_interaction);
    if (userChoice === 'continue') {
      // 用户输入 N → 跑 N 轮
      continue;
    } else if (userChoice === 'give_up') {
      return;
    } else { // accept
      await writePendingFindings(convergence);
      return;
    }
  }

  // max_retries 用尽
  log(`[${entry.name}] ${entry.max_retries + 1} 次都失败,该 stage 放弃 codex 介入`);
}
```

### Step 5.3: 6 integration scenario

| Scenario | 验证 |
|---|---|
| 首轮收敛(verdict=approve) | converged=true,thread map 更新 round=1 |
| 多轮收敛(round 1 needs-attention → fix → round 2 approve) | thread map round=2 + last_verdict=approve |
| 僵尸 cancel + retry 成功 | OutputWatcher 触发 zombie,kill spawn + retry attempt 2 |
| max_retries 用尽放弃 | attempt 用尽 + log "放弃 codex 介入" |
| max_rounds 到顶 ask + 趋势建议 | round 10 触发 ask,trend analyzer 输出建议 |
| max_rounds_on_exceed=force_end | round 10 直接写 pending-findings.yaml,无 ask |

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

### Step 7.1: test inventory

- Task 1: 3 unit
- Task 2: 20 unit(severity-mapper 4 + convergence 5 + thread-map 4 + trend 4 + output-watcher 3)
- Task 3: 4 integration(build-prompt / run code-review / run adversarial / harness-compat)
- Task 5: 6 integration
- Task 6: 1 integration

共 **34 test**。

### Step 7.2: 跑全 suite

```bash
pnpm test  # 期望 1018(原)+ 34(本)= 1052 PASS
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
- §状态段 update 测试数 1018 → 1052

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

### Step 9.3: CHANGELOG `[1.2.0]` 段

- **Added**:`stage_extensions` framework + 预置 codex review/adversarial extensions
- **Added — CLI**:`forge stage-extensions run` 子命令
- **Added — Core**:`src/core/stage-extensions/` 6 模块 + `src/core/codex-review/prompts/` 3 模板
- **Added — Skills + Templates**:`commands/*.md` 5 处末尾段
- **Added — Tests**:34 new test(unit 23 + integration 11)
- **Added — Docs**:`docs/stage-extensions.md` + `docs/codex-review.md` + getting-started 嵌入 + README 更新
- **Acknowledgments**:Codex 对抗性 review N 轮(本 plan 实施过程沉淀,沿 v1.0/v1.1 ack 模式)

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
- [x] 1018 + 34 = 1052 tests pass
- [x] config schema validation 边界 case 覆盖
- [x] integration test 6 scenario:首轮收敛 / 多轮 / 僵尸 / max_retries / max_rounds ask / max_rounds force_end

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
- (待:v2/v3...)

---

## §14 验收 checklist(end-state)

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test` 全 exit 0
- [ ] 1052 tests pass
- [ ] CHANGELOG `[1.2.0]` 段写完
- [ ] git tag v1.2.0 push origin
- [ ] PR 合并到 main
- [ ] README badge 显示 v1.2.0(沿 github/package-json/v badge 自动更新)
- [ ] `docs/stage-extensions.md` + `docs/codex-review.md` 文档双 self-review 通过(quick start + troubleshooting + Tier 2/3 路径)
- [ ] SKILL.md 0 改动(`git diff main..HEAD -- skills/` 期望空 diff)
- [ ] 5 commands/*.md 末尾段格式一致(grep verify)
- [ ] helper script harness-agnostic(grep assert 不含 `${CLAUDE_PLUGIN_ROOT}`)
