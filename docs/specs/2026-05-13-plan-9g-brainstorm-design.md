# Plan-9g brainstorm design — process_evidence + 13 不变量 + worktree 重跑 + reporter parser

> **Status**: brainstorming 产物,作为 writing-plans 阶段的输入。
> **Date**: 2026-05-13
> **Author**: msc(brainstorm 与 Claude 协作)
> **Master spec 引用**:`docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §2.7(1076-1342 行)
> **Master plan 引用**:`docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` line 30
> **前置**:plan-9a(横切层基础 + ack 两步协议)/ plan-9d(三维度 verify + VerifyFinding)/ plan-9j(legacy + version-retrograde fence)

---

## 0. 目的与边界

本文档是 `superpowers:brainstorming` skill 流程的产物,**记录 plan-9g 实施路径选型决策**,而非重新设计 §2.7 内容。

- **Spec 层(不动)**:`docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §2.7 已 v3 完整定型 — 13 不变量字面、7 攻击场景、3 个 CLI helper 接口签名、三档 mode + ack 流程都已锁定。本文档**完全沿用**,不重复其字面定义。
- **Plan 层(本文档落地)**:reporter parser 包选型、fence 代码拆分粒度、worktree helper 抽象层、process_evidence lifecycle、archive.ts 集成切口、测试组织 — 这些是 spec → plan 之间的**实现路径选型**。
- **Task 层(writing-plans 阶段产出)**:本文档不拆 task。后续由 `superpowers:writing-plans` skill 基于本文档生成 `docs/plans/2026-05-10-plan-9g-process-evidence.md`,内含每个 Task 的 inline 完整代码(沿 plan-9j Pattern A 教训)。

---

## 1. Brainstorming 决策摘要

| # | 决策点 | 选定 | 选定理由 |
|---|---|---|---|
| 1 | Reporter parser 三档(`junit | tap | vitest-json`)实现路径 | **三档各引独立 npm 包** | 生态最成熟 — JUnit 用 `fast-xml-parser`、TAP 用 `tap-parser`(isaacs 维护)、Vitest 用原生 JSON.parse;统一抽象成 `ReporterResult` 类型,parseReporter(path, type) factory 分发 |
| 2 | 13 不变量 fence 代码拆分粒度 | **二分:fence.ts(字段类)+ rerun.ts(worktree 类)** | 沿 src/core/archive/ 现有模式(legacy-exemption / version-retrograde / verify-findings / pause-decisions / three-level fence 各成模块);IO/纯函数分离,test 时 rerun.ts 可整体 mock |
| 3 | Worktree helper 接口抽象层 | **高阶 `runInWorktree(sha, fn, opts)`** | try/finally 强制 cleanup,丢 cleanup 不可能;test 时 mock 整个 helper 简单;sample 模式多 task 重跑可通过 `max_parallel_reruns` 并发 gate |
| 4 | process_evidence helper append-only 写入路径 | **staging 文件 + archive 聚合(三源 cross-check)** | helper 调用不依赖 marker 存在;marker 字段是凝固快照;**marker == staging == ack-log 三源 cross-check 反伪造强度最高**;不动现有 marker reader 代码(archive/validate/recover) |
| 5 | forge-eval RED scenario 组织 | **7 个独立 attack scenario + 1 GREEN(含三档 mode sub-fixture)** | 沿 v0.4 forge-eval/scenarios/ 模式,目录隔离;debug 时一眼看出当前测哪类攻击;改一个不连累别的 |
| 6 | Staging → marker freeze 触发点 | **verify.ts / review CLI 内联自动 freeze** | UX 连贯(用户只敲 `forge verify` / `forge review`),不引入新概念;反伪造强度与独立 freeze 命令等同(staging 已被 helper 锁住,freeze 只是搬运) |
| 7 | Schema 校验工具 | **手写 TS interface + 沿 archive-summary.ts JSDoc 风格** | 现有 src/core/schemas/ 全用手写 interface(无 zod),沿同风格一致;运行时校验由 fence 函数显式做 |

---

## 2. 架构 + 模块边界 + 文件清单

### 2.1 新增文件(8 个)

```
src/core/schemas/process-evidence.ts
   ProcessEvidence / TddEventChain / TddCommitRecord / ExpectedFailure /
   TddExemption / VerifyInvocation / SubagentReviewChain / ReviewIteration /
   EnvHash / ProcessVerificationConfig
   schema literal: 'forge-process-evidence/v1'

src/core/worktree.ts
   runInWorktree(sha, fn, opts) — 高阶 helper
   opts: { timeout, parallelGate, cwd }

src/core/test-reporters/index.ts
   parseReporter(path, type) factory + ReporterResult 统一类型
src/core/test-reporters/junit.ts        — fast-xml-parser wrap
src/core/test-reporters/tap.ts          — tap-parser wrap
src/core/test-reporters/vitest-json.ts  — JSON.parse + Vitest schema

src/core/archive/process-evidence-fence.ts
   buildProcessEvidenceFenceContext(args)
   runFieldFence(ctx) → ProcessEvidenceFinding[]   不变量 1-4 / 7-12

src/core/archive/process-evidence-rerun.ts
   runRerunFence(ctx) → Promise<ProcessEvidenceFinding[]>   不变量 5-6 / 13
```

### 2.2 修改文件(7 个)

```
src/cli/commands/evidence.ts
   plan-9a 已搭骨架(ack-log + canonical hash);9g 补三 helper marker staging 写入

src/cli/commands/verify.ts
   .verify-passed 生成路径加 staging → marker freeze(读 staging.yaml + JCS 重算 +
   复制三数组到 marker.process_evidence 字段 + transaction writeFile)

src/cli/commands/review.ts(若有,否则同样模式落在 review-passed 生成位置)
   .review-passed 同上

src/cli/commands/archive.ts
   步骤 3.5b(field fence)+ 3.5c(rerun fence)新增
   不动:3.4 legacy/retrograde(plan-9j)/ 3.5 evidence(v0.4)/
        3.6 verify_findings(plan-9d)/ 3.7 pause(plan-9c)/
        3.8 ack-log(plan-9d)/ 3.9 three-level(plan-9e1)

src/cli/commands/validate.ts
   加 --verify-process flag 单独跑 process_evidence 子检
   CRITICAL finding 输出 finding_hash(JCS,沿 §2.3.6)

src/core/schema/types.ts
   扩 ForgeConfig 加 process_verification / test / ack 三 optional 子树
   + DEFAULT_PROCESS_VERIFICATION / DEFAULT_TEST_REPORTER / DEFAULT_ACK_ALLOW_CI_MODE 常量

src/core/schema/process-verification-config.ts(新文件,沿 writing-plans-config.ts 模式)
   validateProcessVerificationConfig() 阈值校验

package.json
   加 fast-xml-parser + tap-parser 两 deps
```

### 2.3 新增测试(8 类)

```
tests/cli/process-evidence-fence.test.ts      — fieldFence 13×7 + 三档 mode + WARNING/CRITICAL
tests/cli/process-evidence-rerun.test.ts      — rerunFence 不变量 5/6/13 + worktree + timeout
tests/cli/evidence-helpers.test.ts            — 三 helper staging append-only + freeze
tests/cli/verify-freeze.test.ts               — verify.ts 内联 freeze staging → marker
tests/cli/ack-cli-mode.test.ts                — CI + mode != full 拒签 + ack-mode action

tests/core/test-reporters/junit.test.ts       — Jest/Vitest/Mocha 三 framework JUnit XML
tests/core/test-reporters/tap.test.ts         — node:test fixture
tests/core/test-reporters/vitest-json.test.ts — Vitest --reporter=json 原生

tests/core/worktree.test.ts                   — timeout + cleanup + parallel + 异常路径
tests/core/schemas/process-evidence.test.ts   — schema literal + type guard

forge-eval/scenarios/process-evidence/
  attack-1-timestamp-reverse/      → expected: invariant=1 拒签
  attack-2-rebase-ancestor-broken/ → expected: invariant=2 拒签
  attack-3-same-commit-no-red/     → expected: invariant=5/11 拒签
  attack-4-unrelated-failure/      → expected: invariant=5 子项 d 拒签
  attack-5-fake-verify-invocations/→ expected: invariant=9 拒签
  attack-6-bypass-helper/          → expected: invariant=9 拒签
  attack-7-hash-only-no-ack/       → expected: invariant=12 拒签
  green-normal-tdd-pass/           → expected: 通过(三档 mode 各 sub-fixture)
```

---

## 3. 13 不变量到 fence.ts / rerun.ts 映射

| # | 不变量(沿 spec §2.7.3 字面) | severity | 落到 | 关键依赖 |
|---|---|---|---|---|
| 1 | `red_commit.timestamp < green_commit.timestamp` | CRITICAL | fence.ts | `Date.parse()` 比对 |
| 2 | `red_commit.sha` 是 `green_commit.sha` 祖先 | CRITICAL | fence.ts | `git merge-base --is-ancestor`(execFileSync) |
| 3 | RED `exit_code != 0` | CRITICAL | fence.ts | 字段值断言 |
| 4 | GREEN `exit_code == 0` | CRITICAL | fence.ts | 字段值断言 |
| **5** | **RED worktree 实际 fail + `expected_failures` 命中** | **CRITICAL** | **rerun.ts** | **runInWorktree + parseReporter** |
| **6** | **GREEN worktree 实际 pass** | **CRITICAL** | **rerun.ts** | **runInWorktree + parseReporter** |
| 7 | `verify_invocations 总数 ≥ task 数` | WARNING | fence.ts | 计数 + parseTasks(tasks.md) |
| 8 | `subagent_review_chain` 顺序合理 | CRITICAL | fence.ts | git ancestor + timestamp 链 |
| 9 | process_evidence JCS hash 三源一致 | CRITICAL | fence.ts | canonicalHash() × 3 源 |
| 10 | env_hash 一致性 | WARNING | fence.ts | lockfile + node_version + os_platform 比对 |
| 11 | tdd_exemption 非空时 ack-log 含条目 | CRITICAL | fence.ts | ack-log scan(复用 ack-log-consistency.ts) |
| 12 | mode != full 时 acked_by 非空 + CI 拒签 | CRITICAL | fence.ts | ack-log scan + `process.env.CI` |
| **13** | **重跑 timeout** | **full=CRITICAL / 其他=WARNING** | **rerun.ts** | **runInWorktree opts.timeout** |

### 3.1 fence.ts 关键函数签名

```typescript
// src/core/archive/process-evidence-fence.ts

export interface ProcessEvidenceFenceContext {
  changeId: string;
  processEvidence: ProcessEvidence;
  stagingHash: string | null;             // 从 staging.yaml 读
  ackLogEntries: EvidenceHelperEntry[];   // 从 ack-log.jsonl 过滤
  tasksCount: number;                     // 沿 parseTasks(tasks.md)
  cwd: string;
  isCiMode: boolean;                       // process.env.CI === 'true'
  config: Required<NonNullable<ForgeConfig['process_verification']>>;
}

export interface ProcessEvidenceFinding {
  invariant: number;                       // 1..13
  severity: Severity;                      // CRITICAL | WARNING | SUGGESTION
  message: string;
  taskRef?: string;
}

export function runFieldFence(ctx: ProcessEvidenceFenceContext): ProcessEvidenceFinding[];
```

### 3.2 rerun.ts 关键函数签名

```typescript
// src/core/archive/process-evidence-rerun.ts

export async function runRerunFence(
  ctx: ProcessEvidenceFenceContext,
): Promise<ProcessEvidenceFinding[]>;
```

mode 分支处理:
- `full` → for each task in chain,跑 RED + GREEN 重跑(并发 ≤ `max_parallel_reruns`)
- `sample` → 按 `sample_ratio` 抽样 tasks
- `hash-only` → 跳过(返空数组;依赖 fence.ts 不变量 9 hash 校验 + 不变量 12 ack 校验)

---

## 4. process_evidence schema(沿 spec §2.7.2 + archive-summary.ts 风格)

详细字段字面沿 master spec `docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §2.7.2(行 1097-1161 YAML 字面定义);本文档不重复 ~100 行字面,只列 TS interface 落地的关键决策:

- `schema: 'forge-process-evidence/v1'` literal(沿 forge marker schema 同约定)
- 5 大类型 + 4 辅助:`ProcessEvidence`(顶级)/ `TddEventChain` / `TddCommitRecord` / `ExpectedFailure` / `TddExemption` / `VerifyInvocation` / `SubagentReviewChain` / `ReviewIteration` / `EnvHash` / `ProcessVerificationConfig`
- 字段命名沿 spec §2.7.2 字面(`tdd_event_chain` / `verify_invocations` / `subagent_review_chain` / `env_hash` / `process_verification_mode` / `process_verification_mode_acked_by` / `tdd_exemption` / `expected_failures` / `runner_report_path` / `runner_report_hash` / `task_refs` / `verify_scope` 等)
- `process_verification_mode: 'full' | 'sample' | 'hash-only'` 三档 literal union
- `failure_type: 'assertion' | 'timeout' | 'error' | 'not-implemented'` 四档 literal union
- 全 optional 字段在 fence ctx 构建时显式补默认或视为缺失 finding

### 4.1 staging file schema

```yaml
# forge/changes/<id>/.evidence/process-evidence.staging.yaml
schema: forge-process-evidence-staging/v1
change_id: <id>
created_at: <ISO 8601>
tdd_event_chain: [...]
verify_invocations: [...]
subagent_review_chain: [...]
staging_hash: <JCS sha256 of the three arrays above>
```

helper 每次 append 后重算 `staging_hash` 覆盖。freeze 时 verify.ts 重算校验未被中间篡改。

---

## 5. 数据流(helper → staging → freeze → marker → archive fence)

```
[task 实施期间]

主代理读 subagent 报告 ──→ forge evidence record-tdd / record-verify / record-review
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                                ▼
              append staging.yaml             append ack-log.jsonl
            (三数组 + staging_hash)          (entry + payload JCS hash)

[verify CLI / review 完成时,verify.ts / review 内联自动 freeze]

forge verify / review ──→ verify-passed / review-passed 生成路径
                             │
                             │ 1. 读 staging.yaml
                             │ 2. 重算 staging_hash 校验未被中间篡改
                             │ 3. 复制三数组到 marker.process_evidence
                             │ 4. marker 加 process_evidence_staging_hash 快照
                             │ 5. 一次 fs.writeFile marker(transaction)
                             ▼
                    .verify-passed.yaml / .review-passed.yaml(含 process_evidence)

[forge archive — archive.ts 步骤 3.5b/3.5c]

archive 流程:
  ├── 读 marker.process_evidence
  ├── 读 staging.yaml → stagingHash
  ├── 读 ack-log.jsonl → evidence helper entries
  │
  ▼
runFieldFence(ctx)  ──→  不变量 1-4 / 7-12 finding[]
  │
  │ 不变量 9 三源 cross-check:
  │   marker_hash = canonicalHash(marker.process_evidence)
  │   stagingHash = ctx.stagingHash
  │   ackLogChainHash = canonicalHash(ackLogEntries 还原的三数组)
  │   三者不等 → CRITICAL "process_evidence tampered"
  │
  ▼
runRerunFence(ctx)  ──→ 不变量 5-6 / 13 finding[](mode 分支 / 抽样 / timeout 分级)
  │
  ▼
所有 finding 汇入 archive finding 池 → 后续步骤 3.6+ 使用
```

### 5.1 三源 cross-check 反伪造矩阵

| 攻击 | marker | staging | ack-log | 检测点 |
|---|---|---|---|---|
| 直接改 marker.process_evidence | ✗ | ✓ | ✓ | 不变量 9 三源不等 |
| 删/改 staging.yaml 后改 marker | ✗ | ✗ | ✓ | marker_hash != ackLogChainHash |
| 改 ack-log.jsonl 一行 | ✓ | ✓ | ✗ | hash 重算不匹配 entry |
| 三源全改 | ✗ | ✗ | ✗ | **不变量 5/6 worktree 重跑** — AI 改不动测试运行结果 |

---

## 6. forge/config.yaml schema 扩展

ForgeConfig 三 optional 顶级子树(沿 legacy_bridge / writing_plans 模式):

```typescript
process_verification?: {
  mode?: 'full' | 'sample' | 'hash-only';   // 默认 'full'
  sample_ratio?: number;                     // 默认 0.3,范围 [0,1]
  test_timeout_per_task?: number;            // 默认 300,范围 [10,3600] 秒
  max_parallel_reruns?: number;              // 默认 2,范围 [1,8]
};

test?: {
  reporter?: 'junit' | 'tap' | 'vitest-json'; // 默认 'junit'
  test_command?: string;                       // 沿 commands/verify.md:29
};

ack?: {
  allow_ci_mode?: boolean;                     // 默认 false(更安全)
};
```

校验函数 `validateProcessVerificationConfig()` 沿 `validateWritingPlansConfig` 模式,放 `src/core/schema/process-verification-config.ts`。

### 6.1 兼容性

- 三字段全 optional + 有默认 → 旧 forge/config.yaml(v0.4 / v1.0 alpha)零修改可用
- `mode` 默认 full 保证旧 config 不绕过重跑校验
- `ack.allow_ci_mode` 默认 false 防 CI 静默降级
- 沿 §3.4 deprecation:superset additive 无需 migrate

---

## 7. archive.ts 集成切口

**插入位**:步骤 3.5(v0.4 evidence 完整性,既有)之后,步骤 3.6(plan-9d verify_findings,既有)之前。

**编号策略**:9g 新增 3.5b + 3.5c,**不改既有 3.4 / 3.5 / 3.6 / 3.7 / 3.8 / 3.9 编号**。

```typescript
// 步骤 3.5 已有(v0.4)─ 不动 ──────────────────────────────────────────
const evResult = await validateEvidence(verifyRec, verifyPath);
// ... fail-fast ...

// 步骤 3.5b(plan-9g):process-evidence field fence ─ 同步
const fieldCtx = await buildProcessEvidenceFenceContext({ ... });
const fieldFenceResult = runFieldFence(fieldCtx);
const fieldCritical = fieldFenceResult.filter(f => f.severity === 'CRITICAL');
if (fieldCritical.length > 0) {
  console.error('✗ process-evidence field fence 拒签:');
  for (const f of fieldCritical) console.error(`  - 不变量 ${f.invariant}: ${f.message}`);
  await archiveRelease();
  process.exit(1);
}

// 步骤 3.5c(plan-9g):process-evidence rerun fence ─ async,mode 分支
const rerunFenceResult = await runRerunFence(fieldCtx);
const rerunCritical = rerunFenceResult.filter(f => f.severity === 'CRITICAL');
if (rerunCritical.length > 0) {
  console.error('✗ process-evidence rerun fence 拒签:');
  for (const f of rerunCritical)
    console.error(`  - 不变量 ${f.invariant} [${f.severity}] task=${f.taskRef}: ${f.message}`);
  await archiveRelease();
  process.exit(1);
}

const allProcessEvidenceFindings = [...fieldFenceResult, ...rerunFenceResult];

// 步骤 3.6 已有(plan-9d)─ 不动 ──────────────────────────────────────
const vfResult = validateVerifyFindingsFence(verifyRec, verifyPath);
// ...
```

### 7.1 不动 plan-9j / 9d / 9c / 9e1

- 3.4 legacy + retrograde(plan-9j Task 5):**不动**
- 3.5 evidence 完整性(v0.4):**不动**
- 3.6 verify_findings fence(plan-9d):**不动**
- 3.7 pause_decisions fence(plan-9c):**不动**
- 3.8 ack-log consistency(plan-9d v2 B-4):**不动**
- 3.9 三级业务行为 fence(plan-9e1):**不动**

### 7.2 fence ctx 构建集中(避免重复 IO)

```typescript
// src/core/archive/process-evidence-fence-ctx.ts(新文件)
export async function buildProcessEvidenceFenceContext(args: {
  changeId: string;
  changeDir: string;
  verifyRec: VerifyPassedRecord;
  verifyPath: string;
  cwd: string;
  config: Required<NonNullable<ForgeConfig['process_verification']>>;
  testConfig: NonNullable<ForgeConfig['test']>;
  ackConfig: NonNullable<ForgeConfig['ack']>;
}): Promise<ProcessEvidenceFenceContext>;
```

内部一次读全:marker.process_evidence + staging.yaml + ack-log.jsonl + parseTasks + check `process.env.CI`。

---

## 8. 测试矩阵 + forge-eval scenario

### 8.1 13 不变量 × 7 攻击场景命中点

```
                            ┌──┬──┬──┬──┬──┬──┬──┐
                            │A1│A2│A3│A4│A5│A6│A7│
─────────────────────────────┼──┼──┼──┼──┼──┼──┼──┤
不变量 1  timestamp           │✓ │  │  │  │  │  │  │
不变量 2  ancestor            │✓ │✓ │  │  │  │  │  │
不变量 3  RED exit            │  │  │  │✓ │  │  │  │
不变量 5  RED 重跑 + EF 命中  │  │  │✓ │✓ │  │  │  │
不变量 6  GREEN 重跑          │  │  │✓ │  │  │  │  │
不变量 9  JCS 三源            │  │  │  │  │✓ │✓ │  │
不变量 11 tdd_exemption ack   │  │  │✓ │  │  │  │  │
不变量 12 mode + ack          │  │  │  │  │  │  │✓ │
─────────────────────────────┴──┴──┴──┴──┴──┴──┴──┘
A1 改 timestamp / A2 rebase 断链 / A3 同 commit 无 exemption /
A4 不相关代码错误当 RED / A5 伪 verify_invocations log /
A6 marker 字段绕 helper 直写 / A7 hash-only 无 ack
```

### 8.2 单元测试覆盖率目标

| 维度 | 目标 | 验证 |
|---|---|---|
| 13 不变量 fail 路径 | 100%(每不变量 ≥ 1 fixture) | unit |
| 7 攻击 fence 拦截 | 100% | forge-eval RED |
| 三档 mode happy path | 100% | forge-eval GREEN(三 sub-fixture) |
| reporter 三档 parser | 100%(每档 ≥ 3 framework fixture) | unit |
| worktree cleanup 异常路径 | 100%(timeout / fn throw / git remove fail) | unit |
| CI 模式拒签 | 100%(env.CI=true 三档全测) | unit |

### 8.3 forge-eval 端到端布局

```
forge-eval/scenarios/process-evidence/
  attack-1-timestamp-reverse/{forge/...,expected.json}
  attack-2-rebase-ancestor-broken/...
  attack-3-same-commit-no-red/...
  attack-4-unrelated-failure/...
  attack-5-fake-verify-invocations/...
  attack-6-bypass-helper/...
  attack-7-hash-only-no-ack/...
  green-normal-tdd-pass/{full,sample,hash-only} 三 sub-fixture
  runner.ts                       — 循环跑 attack-*/green-*
```

---

## 9. Open questions(writing-plans 阶段处理)

下列在 writing-plans 阶段拆 task 时决定,brainstorm 阶段不锁:

1. **Task 拆分粒度**:5 个还是 8 个 task?(参考 plan-9j 6 task / plan-9d 6 task)
2. **每 task 工日分配**:P50 总 7d / P90 9d,按 task 分摊
3. **Plan inline 完整代码范围**:fence/rerun 函数全量 inline 还是仅 signature + 关键 helper?(沿 plan-9j Pattern A 教训:**全量 inline**)
4. **forge-eval fixture 内容生成策略**:手写 fixture 还是用真 forge 流程跑出来再篡改?
5. **vitest --reporter=json schema 锁定**:Vitest 不同版本 JSON schema 微调,plan 阶段锁定一个版本 + 兼容窗口
6. **freeze 时点细节**:verify-passed 生成是单 fs.writeFile 还是 transaction?(沿 archive transaction.ts 模式抽象)
7. **codex review 轮数预期**:plan-9j 9 轮 / 9e1 12 轮,9g spec 已 v3 充分,预计 5-8 轮

---

## 10. 后续依赖与解锁

**plan-9g 完成后解锁**:
- **plan-9e2**(1d):接 plan-9e1 留的 `process_evidence_summary` placeholder,填真实 13 不变量 pass/fail/legacy 统计
- **plan-9h / 9f**:可并行(独立模块)
- **plan-9z**(release):最终阶段,需 9a-9j 全部完成

**plan-9 master line 30 工日不变**:P50 7d / P90 9d。

---

## 11. 引用与版本对齐

- master spec §2.7 全节(行 1076-1342)
- master plan §0 总览表 line 30
- plan-9a Task 5(evidence CLI 骨架 + ack-log + canonical hash)
- plan-9d Task 6(verify_findings fence + finding_hash + ack-log consistency)
- plan-9e1 Task 4(三级业务行为 fence + archive_summary.ProcessEvidenceSummary placeholder)
- plan-9j Task 5(legacy-exemption + version-retrograde fence + Pattern A 教训)

---

**Status: ready for writing-plans skill 实施**
