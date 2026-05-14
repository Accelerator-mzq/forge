# Plan-9g brainstorm design — process_evidence + 14 不变量 + worktree 重跑 + reporter parser

> **Status**: brainstorming 产物,作为 writing-plans 阶段的输入。
> **Date**: 2026-05-13
> **Author**: msc(brainstorm 与 Claude 协作)
> **Master spec 引用**:`docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §2.7(1076-1342 行)
> **Master plan 引用**:`docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` line 30
> **前置**:plan-9a(横切层基础 + ack 两步协议)/ plan-9d(三维度 verify + VerifyFinding)/ plan-9j(legacy + version-retrograde fence)

---

## 0.0 文档状态声明(v7 新增,Codex 二轮 BLOCKER-1/-2 修)

**本文档是 brainstorming 阶段产物,描述 plan-9g 的"实施清单"而非"已实施成果"。** 全文出现的"9g 改"、"扩 helper options"、"删 opt-in flag"、"加不变量 14"、"加 prev_entry_hash chain"、"加 staging 锁"、"加 freeze 子命令"等表述,都是 9g writing-plans 阶段拆 task + 实施时的目标,**当前代码库尚未包含这些改动**。

- `src/cli/commands/evidence.ts` 当前仍是 plan-9a 骨架(record-tdd/verify/review 三 helper,无 freeze 子命令,无 staging 写入)
- `src/core/ack-log.ts` 当前 EvidenceHelperEntry 无 prev_entry_hash 字段
- `src/core/archive/fence.ts` 当前 FENCE_INVARIANT_NAMES 是 13 项 stub,9g writing-plans 阶段扩到 14 并填实
- `src/cli/commands/archive.ts` 当前保留 `--enable-cross-cutting-fence` + `--allow-stub-fence` 两 opt-in flag,9g writing-plans 阶段移除

**本文档是 plan-9g writing-plans 阶段的输入 spec**,不是验证当前代码状态的 checklist。Codex 后续审查请按此区分:
- 设计漏洞 / scope / inconsistency / 沟通断层 → 应作 BLOCKER/MAJOR 报告
- "spec 与代码不一致" → 仅当 spec 自相矛盾(如声明 9a 已完成 X 但 9a 实际未完成)才是问题;否则属预期(spec 描述未来 9g 实施)

---

## 0. 目的与边界

本文档是 `superpowers:brainstorming` skill 流程的产物,**记录 plan-9g 实施路径选型决策**,而非重新设计 §2.7 内容。

- **Spec 层(不动 + v10 已修订 §2.7.8 数字残留)**:`docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §2.7 已 v3 完整定型 — 14 不变量字面(v6 brainstorm 加不变量 14)、8 攻击场景(v6 加 A8 旁支造链)、3 个 CLI helper 接口签名(v9/v10 修订 helper 接收字段不自跑)、三档 mode + ack 流程都已锁定。本文档**完全沿用**,不重复其字面定义。
- **Plan 层(本文档落地)**:reporter parser 包选型、fence 代码拆分粒度、worktree helper 抽象层、process_evidence lifecycle、archive.ts 集成切口、测试组织 — 这些是 spec → plan 之间的**实现路径选型**。
- **Task 层(writing-plans 阶段产出)**:本文档不拆 task。后续由 `superpowers:writing-plans` skill 基于本文档生成 `docs/plans/2026-05-10-plan-9g-process-evidence.md`,内含每个 Task 的 inline 完整代码(沿 plan-9j Pattern A 教训)。

---

## 1. Brainstorming 决策摘要

| # | 决策点 | 选定 | 选定理由 |
|---|---|---|---|
| 1 | Reporter parser 三档(`junit | tap | vitest-json`)实现路径 | **三档各引独立 npm 包** | 生态最成熟 — JUnit 用 `fast-xml-parser`、TAP 用 `tap-parser`(isaacs 维护)、Vitest 用原生 JSON.parse;统一抽象成 `ReporterResult` 类型,parseReporter(path, type) factory 分发 |
| 2 | 14 不变量 fence 代码拆分粒度 | **二分:fence.ts(字段类)+ rerun.ts(worktree 类)** | 沿 src/core/archive/ 现有模式(legacy-exemption / version-retrograde / verify-findings / pause-decisions / three-level fence 各成模块);IO/纯函数分离,test 时 rerun.ts 可整体 mock |
| 3 | Worktree helper 接口抽象层 | **高阶 `runInWorktree(sha, fn, opts)`** | try/finally 强制 cleanup,丢 cleanup 不可能;test 时 mock 整个 helper 简单;sample 模式多 task 重跑可通过 `max_parallel_reruns` 并发 gate |
| 4 | process_evidence helper append-only 写入路径 | **staging 文件 + archive 聚合(三源 cross-check)** | helper 调用不依赖 marker 存在;marker 字段是凝固快照;**marker == staging == ack-log 三源 cross-check 反伪造强度最高**;不动现有 marker reader 代码(archive/validate/recover) |
| 5 | forge-eval RED scenario 组织 | v6/v9 修订后:**沿 forge-eval §5.5 现有单 yaml per skill + RED/GREEN 双跑 + judge 评分**(原 v5 锁的"8 个独立 attack scenario 目录"基于 forge-eval 认知错误,v6 已修正 — forge-eval 测 AI 行为压力非端到端 fence;8 attack 的 fence 拦截 100% 由 tests/cli/process-evidence-fence.test.ts fixture 单元测试覆盖) | 沿 v0.4 forge-eval/scenarios/ yaml 模式;§9.8 P2 路径新增 process-evidence skill + 独立 yaml(3 scenario AI 行为压力 + RED/GREEN delta) |
| 6 | Staging → marker freeze 触发点 | **新 CLI 子命令 `forge evidence freeze`**(v6 修订,Codex BLOCKER #1) | 原 v5 锁"verify.ts/review CLI 内联"基于错误假设(verify.ts/review.ts 不存在);v6 改为新 CLI 子命令挂 evidence Command 下,主代理在 commands/verify.md 步骤 4.3 写完 .verify-passed 后显式调 |
| 7 | Schema 校验工具 | **手写 TS interface + 沿 archive-summary.ts JSDoc 风格** | 现有 src/core/schemas/ 全用手写 interface(无 zod),沿同风格一致;运行时校验由 fence 函数显式做 |

---

## 2. 架构 + 模块边界 + 文件清单

### 2.1 新增文件(11 个 — v6 修订:freeze 落到 evidence CLI 子命令 + fence 复用 plan-9a stub framework)

```
src/core/schemas/process-evidence.ts
   ProcessEvidence / TddEventChain / RedCommitRecord / GreenCommitRecord /
   ExpectedFailure / TddExemption / VerifyInvocation / SubagentReviewChain /
   ReviewIteration / EnvHash / ProcessVerificationConfig
   schema literal: 'forge-process-evidence/v1'
   (v6 修订:RedCommitRecord/GreenCommitRecord 分两个 interface,
   字段名 red_log_path/red_log_hash + green_log_path/green_log_hash
   严格沿 master spec §2.7.2 行 1115/1127 字面)

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
   runFieldFence(ctx) → ProcessEvidenceFinding[]   不变量 1-4 / 7-12 / 14
   (v6 修订:加不变量 14 — green_commit.sha ↞ archive HEAD ancestor,
   挡 Codex BLOCKER #2 旁支绕过)

src/core/archive/process-evidence-rerun.ts
   runRerunFence(ctx) → Promise<ProcessEvidenceFinding[]>   不变量 5-6 / 13

# ─── §9.8 P2 路径新增(skill 总数 14 → 15,9g 工日 +1d;已锁,前置 plan-9i v7 commit 7862862)
src/core/templates/skills/process-evidence.md
   新 skill 文本:process_evidence 协议(走 helper / 不直写 marker /
   不静默切 mode / RED commit 不可省略 / staging append-only)
   沿 §2.9 writing-skills 协议产出(plan-9i 已完成,提供 skill 创建协议)

skills/process-evidence/SKILL.md
   顶层同步(沿 plan-9j Task 6.2 commands 双同步模式)

forge-eval/scenarios/process-evidence.yaml
   3 个 scenario(tempted-to-skip-red-commit / tempted-to-switch-hash-only /
   tempted-to-fake-marker),RED/GREEN 双跑 + judge 评分
```

**架构关键**(v6 修订,挡 Codex MAJOR #4 双 fence + BLOCKER #1 freeze 落点):

- `process-evidence-fence.ts` / `process-evidence-rerun.ts` 是 **plan-9a `src/core/archive/fence.ts` `crossCuttingFenceCheck()` 的内部实现**,不另起平行系统(沿 plan-9a Task 8 stub framework,9g 把 13 stub 填实)
- freeze 步骤实现为新 CLI 子命令 `forge evidence freeze <changeId>`(挂在 `src/cli/commands/evidence.ts` 现有 evidence Command 下,与 record-tdd/record-verify/record-review 平级),**不依赖不存在的 verify.ts/review.ts**;主代理在 `commands/verify.md` 步骤 4.3 写完 .verify-passed YAML 后显式调用 `forge evidence freeze`(slash 模板而非 CLI 接管 marker 生成,沿 v0.4 marker-from-template 协议)

### 2.2 修改文件(16 个 — v6 修订:删 verify.ts/review.ts 错误条目 + 加 fence.ts/ack-log.ts 扩展 + 修 archive.ts 移除 opt-in flag)

#### 2.2.1 CLI 命令层(4 个,Codex BLOCKER #1 修复:freeze 落到 evidence 子命令)

```
src/cli/commands/evidence.ts
   plan-9a 已搭 record-tdd/record-verify/record-review 三骨架;9g 改动:
   1. 三 helper commander options 大幅扩(Codex MAJOR #3 修复):
      record-tdd 加 --red-log/--red-log-hash/--red-report-hash/--red-exit/--red-timestamp +
                    --green-log/--green-log-hash/--green-report/--green-report-hash/--green-exit/--green-timestamp
                    (共 +11 option,完整覆盖 master spec §2.7.2 RED/GREEN 字段)
      record-verify 加 --log/--log-hash/--report-hash/--exit-code/--invoked-at(+5 option)
      record-review 加 --spec-iterations/--quality-iterations/--main-check-off-at(+3 option,
                    spec/quality iteration 用 JSON array string 传入)
   2. helper 写入路径扩(Codex BLOCKER #1):
      原本只写 ack-log.jsonl 一行;9g 加 staging.yaml 同步 append(read-modify-write 模式)
      staging 写入走文件锁(Codex MAJOR #2 修复:.evidence/.staging.lock)
   3. 新增子命令 forge evidence freeze <changeId>:
      读 staging.yaml + 校验 staging_hash + 读 .verify-passed(或 .review-passed) +
      复制三数组到 marker.process_evidence 字段 + 写 process_evidence_staging_hash 快照 +
      transaction 落盘(§9.6 锁定 B:tmp + rename atomic,沿 archive transaction.ts 模式)
      主代理在 commands/verify.md 步骤 4.3 写完 marker YAML 后显式调

src/cli/commands/archive.ts
   1. 9g 填实 src/core/archive/fence.ts 的 13 stub(Codex MAJOR #4 修复)
   2. 移除 --enable-cross-cutting-fence opt-in flag(默认开启)
   3. 移除 --allow-stub-fence opt-in flag(stub 已实,不需要)
   4. archive.ts:240 现有 crossCuttingFenceCheck() 调用保留不动(默认开启 = 默认跑 14 不变量)
   5. WARNING 处理(Codex BLOCKER #3 修复):fence 返回的 WARNING finding 转 VerifyFinding
      schema(沿 plan-9d Task 3)+ 写入 marker.verify_findings(superset additive 扩),
      archive 步骤 3.6 verify_findings fence + 步骤 3.9 three-level fence 自动接 ack 流程
   6. 不动:3.4 legacy/retrograde(plan-9j)/ 3.5 evidence(v0.4)/ 3.6 verify_findings(plan-9d)/
        3.7 pause(plan-9c)/ 3.8 ack-log(plan-9d)/ 3.9 three-level(plan-9e1)

src/cli/commands/validate.ts
   加 --verify-process flag 单独跑 process_evidence 子检
   CRITICAL finding 输出 finding_hash(JCS,沿 §2.3.6)

src/cli/commands/init.ts(行 38 附近,沿 spec §2.7.8 B-7 修订)
   deprecation 文本 "will be removed in v0.4" → "will be removed in v1.2"
```

#### 2.2.2 Core 层(3 个,Codex BLOCKER #2 + MAJOR #2 + MAJOR #4 + SUGGESTION #1 修复)

```
src/core/archive/fence.ts(plan-9a Task 8 stub framework,9g 填实)
   1. FENCE_INVARIANT_NAMES 扩到 14 项('fence-1' .. 'fence-14';不变量 14 是
      Codex BLOCKER #2 修复:green_commit ↞ archive HEAD ancestor 校验)
   2. checkInvariantStub 替换为真实分发:fence-1/2/3/4/7/8/9/10/11/12/14 → process-evidence-fence.ts
      runFieldFence;fence-5/6/13 → process-evidence-rerun.ts runRerunFence
   3. crossCuttingFenceCheck 签名稳定不动(plan-9a 已锁,archive.ts:240 调用点保留)

src/core/ack-log.ts(扩 EvidenceHelperEntry,Codex SUGGESTION #1 修复)
   EvidenceHelperEntry 加 prev_entry_hash: string | null 字段(链头为 null,其余指向上一条
   ack-log entry 的 canonicalHash(entry))
   appendAckLog 算 prev_entry_hash 时读最后一行(若文件不存在 → null,链头)
   fence 验证 ack-log 文件完整性:逐行重算 prev_entry_hash 必匹配上一行 hash
   (反伪造关键:AI 删一行 / 改一行 ack-log 会让后续 entry prev_entry_hash 失配)

src/core/markers/types.ts
   VerifyMarker / ReviewMarker 加 process_evidence?: ProcessEvidence(superset additive,
   老 marker 缺等价 undefined,沿 plan-9c pause_decisions / plan-9d verify_findings /
   plan-9j created_by_tool_version 同模式)
   + process_evidence_staging_hash?: string(freeze 时 snapshot,archive fence cross-check)
   + ack_log_tail_hash?: string(v7 新增,Codex 二轮 MAJOR-3 修复:freeze 时固化 ack-log 尾 hash,
     archive 验证防"重写整链 + 链内自洽"攻击)
   + ack_log_entry_count?: number(v7 新增,同 MAJOR-3:固化 evidence-helper entry 行数)

src/core/schemas/archive-summary.ts(v7 新增修订项,Codex 二轮 MINOR-2 + 七轮 MINOR-3)
   ProcessEvidenceSummary 字段统计从 13 不变量 → 14 不变量(plan-9e1 留的 placeholder
   原写 13,9g 接入时同步改 14;archive-summary.ts:33 / 56 / 133 行)

commands/archive.md / src/core/templates/commands/archive.md(v10 新增,Codex 七轮 MINOR-3)
   slash 模板内 13 不变量字面同步 14(commands/archive.md:141 + 顶层同步;沿 plan-9j Task 6.2
   commands 双同步模式)
```

#### 2.2.3 Config schema(2 个;v6 编号不变)

```
src/core/schema/types.ts
   扩 ForgeConfig 加 process_verification / test / ack 三 optional 子树
   + DEFAULT_PROCESS_VERIFICATION / DEFAULT_TEST_REPORTER / DEFAULT_ACK_ALLOW_CI_MODE 常量

src/core/schema/process-verification-config.ts(新文件,沿 writing-plans-config.ts 模式)
   validateProcessVerificationConfig() 阈值校验
```

#### 2.2.4 Slash 模板双同步(4 个,沿 plan-9j Task 6.2 同步模式)

forge 项目 slash/skill 模板有**两套并存**(`src/core/templates/` 是源,顶层 `commands/` `skills/` 是构建产物;plan-9j Task 6.2 commit 780be79 确认要同步两边):

```
src/core/templates/commands/apply.md  +  commands/apply.md(顶层同步)
   主代理改为调 forge evidence record-tdd helper(不再直接写 marker);
   加禁止行为段落"不允许绕过 helper 直接写 process_evidence"
   (沿 spec §2.7.8 MAJOR #26 — apply 是 slash 不是 CLI)

src/core/templates/commands/verify.md  +  commands/verify.md(顶层同步)
   verify 命令每次跑都调 forge evidence record-verify helper
   加 freeze 段落:verify-passed 生成时自动 staging → marker freeze
```

#### 2.2.5 Skill 模板双同步(4 个,沿同模式)

```
src/core/templates/skills/subagent-driven-development.md  +  skills/subagent-driven-development/SKILL.md
   subagent 报告 DONE 时**必须含**:RED commit sha / GREEN commit sha /
   log paths / expected_failures(test_file + test_name + failure_type)
   供主代理调 record-tdd helper 用

src/core/templates/skills/test-driven-development.md  +  skills/test-driven-development/SKILL.md
   加"RED commit 不可省略"硬约束(沿 spec §2.7.5 攻击 A3 防御)
   light mode trivial change 走 tdd_exemption ack 路径
   (沿 spec §2.7.2 MAJOR #37 + config.yaml#writing_plans.light_threshold)
```

#### 2.2.6 依赖(1 个)

```
package.json
   加 fast-xml-parser + tap-parser 两 deps
```

**注**:§2.2.4 + §2.2.5 共 8 个 slash/skill 模板修改 — 会触发 forge-eval CI(若配 ANTHROPIC_API_KEY)。沿 §9.9 策略决定要不要在 9g 实施期配 key。

### 2.3 新增测试(8 类)

```
tests/cli/process-evidence-fence.test.ts      — fieldFence 14×8 + 三档 mode + WARNING/CRITICAL
tests/cli/process-evidence-rerun.test.ts      — rerunFence 不变量 5/6/13 + worktree + timeout
tests/cli/evidence-helpers.test.ts            — 三 helper staging append-only + freeze
tests/cli/evidence-freeze.test.ts             — forge evidence freeze 子命令(v6 修订):staging → marker 拷贝 + transaction 回滚 + WARNING 转 VerifyFinding + 锁
tests/cli/ack-cli-mode.test.ts                — CI + mode != full 拒签 + ack-mode action

tests/core/test-reporters/junit.test.ts       — Jest/Vitest/Mocha 三 framework JUnit XML
tests/core/test-reporters/tap.test.ts         — node:test fixture
tests/core/test-reporters/vitest-json.test.ts — Vitest --reporter=json 原生

tests/core/worktree.test.ts                   — timeout + cleanup + parallel + 异常路径
tests/core/schemas/process-evidence.test.ts   — schema literal + type guard

forge-eval/scenarios/(沿 forge-eval §5.5 现有约定:单 yaml per skill,RED/GREEN 双跑 + judge 评分)
  ─── 实际形态:§9.8 已锁 P2(新增 process-evidence skill + 独立 yaml,沿 plan-9i writing-skills 协议)
  ─── 测的是 AI 行为压力(在 time/social/authority 压力下是否拒绝走捷径 +
       坚持调 helper / 不跳 RED commit / 不静默切 mode=hash-only)
  ─── 8 attack 的 fence 拦截不在此层(v6 brainstorm Codex 一轮加 A8 旁支造链 + 主分支换实现) — 完全由 tests/cli/process-evidence-fence.test.ts
       fixture 单元测试覆盖(沿 §5.3)
```

---

## 3. 14 不变量到 fence.ts / rerun.ts 映射(v6 修订:13 → 14,加 Codex BLOCKER #2 修复)

| # | 不变量(沿 spec §2.7.3 字面 + v6 新增 #14) | severity | 落到 | 关键依赖 |
|---|---|---|---|---|
| 1 | `red_commit.timestamp < green_commit.timestamp` | CRITICAL | fence.ts | `Date.parse()` 比对 |
| 2 | `red_commit.sha` 是 `green_commit.sha` 祖先 | CRITICAL | fence.ts | `git merge-base --is-ancestor`(execFileSync) |
| 3 | RED `exit_code != 0` | CRITICAL | fence.ts | 字段值断言 |
| 4 | GREEN `exit_code == 0` | CRITICAL | fence.ts | 字段值断言 |
| **5** | **RED worktree 实际 fail + `expected_failures` 命中** | **CRITICAL** | **rerun.ts** | **runInWorktree + parseReporter** |
| **6** | **GREEN worktree 实际 pass** | **CRITICAL** | **rerun.ts** | **runInWorktree + parseReporter** |
| 7 | `verify_invocations 总数 ≥ task 数` | WARNING(freeze-time → marker.verify_findings;沿 9a 8 字段 finding_hash + plan-9d ack 流程) | fence.ts | 计数 + parseTasks(tasks.md) |
| 8 | `subagent_review_chain` 顺序合理 | CRITICAL | fence.ts | git ancestor + timestamp 链 |
| 9 | process_evidence JCS hash 三源一致 + ack-log prev_entry_hash 链完整 | CRITICAL | fence.ts | canonicalHash() × 3 源 + ack-log chain 重算(Codex SUGGESTION #1) |
| 10 | env_hash 一致性 | WARNING(freeze-time → marker.verify_findings;沿 9a 8 字段 finding_hash + plan-9d ack 流程) | fence.ts | lockfile + node_version + os_platform 比对 |
| 11 | tdd_exemption 非空时 ack-log 含条目 | CRITICAL | fence.ts | ack-log scan(复用 ack-log-consistency.ts) |
| 12 | mode != full 时 acked_by 非空 + CI 拒签 | CRITICAL | fence.ts | ack-log scan + `process.env.CI` |
| **13** | **重跑 timeout** | **full=CRITICAL / sample 或 hash-only=WARNING(rerun-time stderr 不阻断;ack-mode 隐含覆盖,无独立 ack;v9 简化,Codex 四轮 B-1)** | **rerun.ts** | **runInWorktree opts.timeout** |
| **14** | **`green_commit.sha` ↞ archive HEAD ancestor**(v6 新增,Codex BLOCKER #2 修复) | **CRITICAL** | **fence.ts** | **`git merge-base --is-ancestor green_commit.sha HEAD`**;挡旁支造合法 RED/GREEN 链 + 主分支换实现的攻击 |

**WARNING 流转**(v9 修订,Codex 五轮 B-1 修复 — 两段闭合区分 freeze-time vs rerun-time):

- **freeze-time WARNING(仅不变量 7 + 10)**:fence-ctx 阶段算,**转 VerifyFinding schema**(沿 plan-9d Task 3),freeze 时写入 marker.verify_findings 数组。archive 步骤 3.6 verify_findings fence + 步骤 3.9 three-level fence 自动接 ack 流程 — WARNING+resolved=false+无 ack 拒签 / +acked 通过(沿 plan-9e1)。finding_hash 沿 9a `computeFindingHash` 8 字段 schema,**dimension 字段扩 enum 加 `process_evidence`**(v10 修订,Codex 六轮 M-1:enum 扩展需覆盖 type + runtime validator 两层,9g writing-plans 阶段实施清单):
- `src/core/schemas/severity.ts:53` `FindingHashPayload.dimension` union 扩(`completeness | correctness | coherence | process_evidence`)
- `src/core/validate/marker-schema.ts:44 + :498` 运行时 validator dimension 校验扩 4 值
- `src/cli/commands/finding.ts:68` finding hash CLI 接收 stdin JSON 时 dimension 校验扩 4 值
- `docs/plans/2026-05-11-plan-9d-verify-three-dimensions.md:3612` plan-9d 三维度 enum 锁定段加 v1.0 修订注(superset additive,沿 plan-9c/9d/9j 同模式)
- 对应测试 fixture 扩(v10 修订,Codex 七轮 M-1:测试路径修正):`tests/core/validate/marker-schema.test.ts`(dimension=process_evidence 不被拒签)+ `tests/core/markers/verify-findings-schema.test.ts`(VerifyFinding 接受 process_evidence)+ `tests/cli/finding-hash.test.ts`(finding hash CLI 接受 process_evidence dimension)
- **rerun-time WARNING(仅不变量 13 在 sample/hash-only 模式)**:fence 在 archive 阶段算,**不写 marker**(避免破坏 freeze 不变性),**仅 stderr 输出告警 + 不阻断 archive**。ack-mode(沿不变量 12 用户必须先 ack)**隐含覆盖**该模式下 rerun-time WARNING。rerun.ts 实现约束:不得为 env drift / 抽样未命中 / reporter fallback 产生额外 rerun-time WARNING(沿 Codex 五轮 SUG-1) — 此类问题应在 freeze-time(不变量 10 env_hash)或 mode ack(不变量 12)处理

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
  invariant: number;                       // 1..14(v6 brainstorm Codex 一轮加不变量 14)
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

## 4. process_evidence schema(沿 spec §2.7.2 行 1097-1161 + archive-summary.ts 风格)

完整 TS interface 内联(沿 plan-9j Pattern A 教训 — plan 阶段字面不可省,避免下游 emergent fix):

```typescript
// src/core/schemas/process-evidence.ts — plan-9g Task 1
// §2.7.2 forge-process-evidence/v1 schema:14 不变量字段 + 五源 cross-check(v10)
// 沿 archive-summary.ts 模式:schema literal + 手写 interface + JSDoc

/** ProcessEvidence 顶级 schema(沿 design §2.7.2 字段表) */
export interface ProcessEvidence {
  /** YAML schema identifier(沿 forge marker schema 同约定) */
  schema: 'forge-process-evidence/v1';

  /** 模式:full(默认重跑全部)| sample(抽样)| hash-only(仅 hash 校验,等同 v0.4 弱 fence) */
  process_verification_mode: 'full' | 'sample' | 'hash-only';
  /** mode != full 时必填 — ack-log 含对应 ack-mode 条目;CI 模式拒签 mode != full(沿 §2.7.4 B) */
  process_verification_mode_acked_by: string | null;
  /** ISO 8601 UTC */
  process_verification_mode_acked_at: string | null;

  /** 环境三因子(MAJOR #23 — 重跑前 env 一致校验,不一致 → WARNING) */
  env_hash: EnvHash;

  /** TDD RED→GREEN 事件序列(每 task 一条;沿 §2.7.2 + 不变量 1-6 + 11) */
  tdd_event_chain: TddEventChain[];

  /** verify 命令每次跑都 append(沿 §2.7.6 helper append-only;不变量 7) */
  verify_invocations: VerifyInvocation[];

  /** subagent 二段 review 痕迹(不变量 8) */
  subagent_review_chain: SubagentReviewChain[];
}

/** 环境三因子哈希(MAJOR #23) */
export interface EnvHash {
  /** sha256(pnpm-lock.yaml 或 package-lock.json) */
  lockfile_hash: string;
  /** semver,e.g. "20.10.0" */
  node_version: string;
  /** "win32" | "darwin" | "linux"(沿 Node os.platform()) */
  os_platform: 'win32' | 'darwin' | 'linux';
}

/** TDD 单 task RED→GREEN 事件链(每 task 一条) */
export interface TddEventChain {
  /** task 引用(沿 tasks.md 锚点) */
  task_ref: string;
  /** RED 阶段记录(tdd_exemption 非空时可省;v6:RedCommitRecord 类型) */
  red_commit: RedCommitRecord | null;
  /** GREEN 阶段记录(必填;v6:GreenCommitRecord 类型) */
  green_commit: GreenCommitRecord;
  /** light mode trivial change 免 RED 的 ack 引用(沿 §2.7.2 MAJOR #37;不变量 11) */
  tdd_exemption: TddExemption | null;
  /** tdd_exemption 非空时必填 — ack-log 中对应 user ack 的 acked_by */
  tdd_exemption_acked_by: string | null;
}

/**
 * RED commit 记录(v6 修订,Codex MAJOR #1 修复)
 * 字段名严格沿 master spec §2.7.2 行 1115/1116 字面 — red_commit 节点下的 log/hash 字段
 * 是 red_log_path / red_log_hash 而非通用 log_path / log_hash
 */
export interface RedCommitRecord {
  /** git sha(40 hex) */
  sha: string;
  /** ISO 8601 UTC */
  timestamp: string;
  /** RED plain log 路径(forge/changes/<id>/.evidence/ 相对路径;沿 master spec 行 1115) */
  red_log_path: string;
  /** sha256(red log content);沿 master spec 行 1116 */
  red_log_hash: string;
  /** 进程 exit code — RED 必 != 0(MAJOR #19,不变量 3) */
  exit_code: number;
  /** 结构化 reporter 报告路径(JUnit XML / TAP / Vitest JSON;MAJOR #20) */
  runner_report_path: string;
  /** sha256(reporter content) */
  runner_report_hash: string;
  /** RED 阶段必填:绑定具体失败的 test(MAJOR #24;不变量 5) */
  expected_failures: ExpectedFailure[];
}

/**
 * GREEN commit 记录(v6 修订,Codex MAJOR #1 修复)
 * 字段名沿 master spec §2.7.2 行 1127/1128 字面 — green_commit 节点下用 green_log_path/hash
 */
export interface GreenCommitRecord {
  /** git sha(40 hex) */
  sha: string;
  /** ISO 8601 UTC */
  timestamp: string;
  /** GREEN plain log 路径;沿 master spec 行 1127 */
  green_log_path: string;
  /** sha256(green log content);沿 master spec 行 1128 */
  green_log_hash: string;
  /** 进程 exit code — GREEN 必 == 0(MAJOR #19,不变量 4) */
  exit_code: number;
  /** 结构化 reporter 报告路径 */
  runner_report_path: string;
  /** sha256(reporter content) */
  runner_report_hash: string;
}

/** RED 阶段期望失败的 test(MAJOR #24) */
export interface ExpectedFailure {
  /** 相对 repo 根 */
  test_file: string;
  /** 测试名(对应 reporter 中的 test 标识) */
  test_name: string;
  /** 失败类型 */
  failure_type: 'assertion' | 'timeout' | 'error' | 'not-implemented';
}

/** light mode trivial change 免 RED(沿 §2.7.2 MAJOR #37) */
export interface TddExemption {
  /** 沿 config.yaml#writing_plans.light_threshold 触发(默认 200 行) */
  reason: 'light-mode-trivial';
  /** 变更行数 */
  loc_delta: number;
}

/** verify 命令单次调用记录(沿 §2.7.6 helper append-only) */
export interface VerifyInvocation {
  /** ISO 8601 UTC */
  invoked_at: string;
  /** 涉及的 task(MAJOR #22:list,支持 per-task / change-level) */
  task_refs: string[];
  /** per-task = subagent 实施完单 task 立即跑;change-level = 主代理统一跑 */
  verify_scope: 'per-task' | 'change-level';
  /** pass | fail | skip */
  result: 'pass' | 'fail' | 'skip';
  /** 进程 exit code */
  exit_code: number;
  /** plain log 路径 */
  log_path: string;
  log_hash: string;
  /** 结构化 reporter 报告路径 */
  runner_report_path: string;
  runner_report_hash: string;
}

/** subagent 二段 review 链(沿 §2.7.2 + 不变量 8) */
export interface SubagentReviewChain {
  task_ref: string;
  /** subagent 实施的 commit */
  implementer_commit: string;
  /** spec 维度 review 多次迭代(每次都 append) */
  spec_reviewer_iterations: ReviewIteration[];
  /** quality 维度 review 多次迭代 */
  quality_reviewer_iterations: ReviewIteration[];
  /** 主代理 check-off 时间(ISO 8601 UTC) */
  main_agent_check_off_at: string;
}

/** 单次 reviewer 迭代 */
export interface ReviewIteration {
  /** reviewer subagent 跑完时的 commit sha */
  reviewer_commit: string;
  /** needs-fix 走下一轮;approved 终态 */
  outcome: 'needs-fix' | 'approved';
  /** review 笔记 log 路径(forge/changes/<id>/.evidence/ 相对) */
  notes_log_path: string;
}

/** ProcessVerificationConfig:forge/config.yaml#process_verification 字段类型 */
export interface ProcessVerificationConfig {
  /** 默认 'full' */
  mode: 'full' | 'sample' | 'hash-only';
  /** sample 模式抽样比例(0..1,默认 0.3) */
  sample_ratio: number;
  /** 单 task 重跑超时秒(默认 300) */
  test_timeout_per_task: number;
  /** 并发 worktree 上限(默认 2) */
  max_parallel_reruns: number;
}
```

### 4.0 关键决策点(v6 修订,Codex MAJOR #1 修复后)

- `schema: 'forge-process-evidence/v1'` literal(沿 forge marker schema 同约定)
- **5 大类型 + 5 辅助类型 + 1 config 类型**(v6 修订:TddCommitRecord 拆为 RedCommitRecord/GreenCommitRecord 两 interface,沿 master spec §2.7.2 字面 red_log_path/green_log_path 命名)
  - 顶级:`ProcessEvidence`
  - 三大数组元素:`TddEventChain` / `VerifyInvocation` / `SubagentReviewChain`
  - 嵌套:`RedCommitRecord` / `GreenCommitRecord`(v6 新增,替换 TddCommitRecord)/ `ExpectedFailure` / `TddExemption` / `ReviewIteration` / `EnvHash`
  - config:`ProcessVerificationConfig`
- 字段命名严格沿 master spec §2.7.2 字面(行 1097-1161):`tdd_event_chain` / `verify_invocations` / `subagent_review_chain` / `env_hash` / `process_verification_mode` / `process_verification_mode_acked_by` / `tdd_exemption` / `expected_failures` / **`red_log_path` / `red_log_hash`(red_commit 节点下,行 1115/1116)** / **`green_log_path` / `green_log_hash`(green_commit 节点下,行 1127/1128)** / `runner_report_path` / `runner_report_hash` / `task_refs` / `verify_scope`
- `process_verification_mode: 'full' | 'sample' | 'hash-only'` 三档 literal union(不留 string fallback)
- `failure_type: 'assertion' | 'timeout' | 'error' | 'not-implemented'` 四档 literal union
- `red_commit: RedCommitRecord | null`(tdd_exemption 非空时 null)+ `green_commit: GreenCommitRecord`(必填)— 显式 null 表达 RED 缺失,fence 据此分支
- `expected_failures: ExpectedFailure[]`(只在 RedCommitRecord 中,GreenCommitRecord 无此字段 — schema 层面禁止 GREEN 含 expected_failures)

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

**写入并发保护**(v6 修订,Codex MAJOR #2 修复):staging 文件是"读 YAML + 改 array + 重算 hash + 覆写"非原子操作。主代理多 helper 并发(per-task 实施可能并行)会 lost update。9g 实施时 helper 写 staging 走文件锁:

```
forge/changes/<id>/.evidence/.staging.lock
```

仿 archive lock 模式(`src/core/archive/lock.ts`),wrap 整段 read-modify-write 在 `acquireStagingLock(changeRoot) → readStaging → mutate → writeStaging → releaseLock` 内。锁文件 stale detection(进程 pid 死亡 → 强制释放)沿 lock.ts 同模式。freeze 时同样 acquire 锁(防 freeze 期间 helper 再 append)。

helper 每次 append 后重算 `staging_hash` 覆盖。freeze 时 `forge evidence freeze` 子命令重算校验未被中间篡改。

---

## 5. 数据流(v6 修订:helper → staging+ack-log chain → freeze CLI → marker → archive fence)

```
[task 实施期间 — 主代理协调,subagent 不直接调 helper]

主代理读 subagent 报告 ──→ forge evidence record-tdd / record-verify / record-review
                                          │
                                          ▼
                            acquireStagingLock(changeRoot)   ← v6 修订:文件锁
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                                ▼
              append staging.yaml             append ack-log.jsonl
            (三数组 + 重算 staging_hash)    (entry + prev_entry_hash chain)
                          │                                │
                          └───────────────┬────────────────┘
                                          ▼
                            releaseStagingLock(changeRoot)

[verify slash 模板完成 — 主代理在 commands/verify.md 步骤 4.3 写完 .verify-passed 后调]

主代理 ──→ forge evidence freeze <changeId> --kind <verify|review>     ← v7 修订:新 CLI 子命令 + --kind 区分两 marker(Codex 二轮 BLOCKER-4)
                             │
                             │ 1. acquireStagingLock(防 freeze 期间 helper 再 append)
                             │ 2. 读 staging.yaml
                             │ 3. 重算 staging_hash 校验未被中间篡改
                             │ 4. 读 .verify-passed 或 .review-passed(按 --kind;主代理刚写的 marker)
                             │ 5. 复制三数组到 marker.process_evidence 字段
                             │ 6. marker 加 process_evidence_staging_hash 快照
                             │ 7. marker 加 ack_log_tail_hash + ack_log_entry_count
                             │    (v7 新增,Codex 二轮 MAJOR-3 修复:固化 ack-log 尾 + 行数,
                             │     挡"重写整链 + 链内自洽"攻击)
                             │ 8. 写 fence-ctx-only WARNING 到 marker.verify_findings:
                             │    **仅**不变量 7(verify_invocations 计数)+ 10(env_hash 漂移)
                             │    (v8 修订,Codex 三轮 BLOCKER-2 修复:不变量 11/12 是 CRITICAL,
                             │    freeze 时若失败 → exit 1 拒绝写 marker,提示用户先跑 forge ack;
                             │    rerun-time WARNING 5/6/13 也不在此处理 — 见步骤 3.5 内 archive 流程)
                             │ 9. executeTransaction()(§9.6 锁定 B,沿
                             │    src/core/archive/transaction.ts:tmp + rename atomic)
                             │ 10. releaseStagingLock
                             ▼
                    .verify-passed / .review-passed(含 process_evidence + 部分 verify_findings)

[forge archive — archive.ts:240 现有 crossCuttingFenceCheck() 调用,v6 修订:9g 填实 14 不变量]

archive 流程:
  ├── 步骤 3.4 plan-9j legacy/retrograde fence(不动)
  ├── 步骤 3.5 plan-9d evidence 完整性(不动)
  ├── 步骤 3.5(同 line)plan-9a crossCuttingFenceCheck() ← v6 修订:9g 填实
  │      内部:
  │        buildProcessEvidenceFenceContext(...) 一次读全(marker/staging/ack-log/parseTasks/CI/HEAD)
  │        ├── runFieldFence(ctx) → 不变量 1-4 / 7-12 / 14 finding[]
  │        │   不变量 9 四源 + 链 cross-check:
  │        │     marker_hash = canonicalHash(marker.process_evidence)
  │        │     stagingHash = ctx.stagingHash(从 marker.process_evidence_staging_hash 快照对比)
  │        │     ackLogProjectionHash = canonicalHash(ack-log evidence-helper entries 还原的三数组)  # v9 改名(Codex 四轮 MINOR-1),区分于全 JSONL 链 hash
  │        │     ack-log 链完整性 = 逐行重算 prev_entry_hash 必匹配上一条 hash
  │        │     ack-log 尾 + 行数固化 = ack-log 实际尾 hash + entry count 必 == marker.ack_log_tail_hash + marker.ack_log_entry_count
  │        │       (v7 新增,Codex 二轮 MAJOR-3:挡"改最后一行" + "整链重写")
  │        │     五源不等 → CRITICAL "process_evidence tampered"
  │        │   不变量 14:git merge-base --is-ancestor green_commit.sha HEAD ≠ 0 → CRITICAL
  │        └── runRerunFence(ctx) → 不变量 5-6 / 13 finding[](mode 分支 / 抽样 / timeout)
  │      CRITICAL finding → fence.ok=false → archive.ts process.exit(1)
  │      v9 修订(Codex 四轮 BLOCKER-1 + BLOCKER-2 简化修复):**rerun-time WARNING 隐含被 ack-mode 覆盖,无独立 ack 协议**。
  │        核心观察:rerun-time WARNING **仅**不变量 13(timeout)在 sample/hash-only 模式产生;
  │        而 sample/hash-only 模式本身**必须**已经走过 `forge ack propose --action ack-mode`(不变量 12 强制 + CI 拒签);
  │        该 mode ack 已表明用户接受降级安全等级,**隐含覆盖该模式下所有 rerun-time WARNING**。
  │        archive fence 检测到 rerun-time WARNING(仅不变量 13)时:**stderr 输出告警 + 不阻断**;
  │        不算 finding_hash,不写 marker,不走 9a/9d ack-log 协议(简化整套设计)。
  │        full 模式:所有 rerun-time 失败都是 CRITICAL(沿 master §2.7.3 表),无 WARNING 路径,无需此分支。
  ├── 步骤 3.6 plan-9d verify_findings fence(接 freeze-time 写入 marker.verify_findings 的 fence-ctx WARNING)
  ├── 步骤 3.7 plan-9c pause(不动)
  ├── 步骤 3.8 plan-9d ack-log consistency(扩 9g 三 helper entries cross-check + ack-log 尾 hash 校验)
  └── 步骤 3.9 plan-9e1 three-level fence(仅接 freeze-time WARNING;rerun-time WARNING 已 v9 简化为 ack-mode 隐含覆盖 stderr 不阻断,不进 fence)
```

### 5.1 五源 cross-check 反伪造矩阵(v8 修订,Codex 三轮 MINOR-2:四 → 五,把 ack-log tail+count 视为独立源)

| 攻击 | marker | staging | ack-log content | ack-log chain | ack-log tail+count | 检测点 |
|---|---|---|---|---|---|---|
| 直接改 marker.process_evidence | ✗ | ✓ | ✓ | ✓ | ✓ | 不变量 9 marker hash != staging hash |
| 删/改 staging.yaml 后改 marker | ✗ | ✗ | ✓ | ✓ | ✓ | marker hash != ackLogProjectionHash(evidence-helper projection) |
| 改 ack-log.jsonl 中间一行内容 | ✓ | ✓ | ✗ | ✗ | ✓ | prev_entry_hash 链断(下一行 hash mismatch) |
| 删 ack-log.jsonl 中间一行 | ✓ | ✓ | ✗ | ✗ | ✗ | chain 断 + count mismatch + tail mismatch |
| **改 ack-log.jsonl 最后一行(无下一行引用)** | ✓ | ✓ | ✗ | ✓(链内自洽) | ✗ | **tail_hash != marker.ack_log_tail_hash**(v7 新增,Codex 二轮 M-3) |
| **重写整个 ack-log.jsonl 且每行 hash 自洽** | ✓ | ✓ | ✗ | ✓(伪造链) | ✗ | **行数 / tail 确定性 mismatch**(v9 修订,Codex 四轮 SUG-1:攻击者必须精准凑齐 marker 固化的 count + tail,tail 是 256-bit hash preimage 不可暴力;若伪造链的 evidence-helper 子集与原 staging 不同则 process_evidence 三数组 hash 一并失败)|
| 旁支造 RED/GREEN + 主分支换实现 | ✓ | ✓ | ✓ | ✓ | ✓ | **不变量 14**:green ↞ HEAD ancestor check 失败 |
| 五源全改 + 改 git 主分支 + 重凑 tail+count | ✗ | ✗ | ✗ | ✗ | ✗ | **不变量 5/6 worktree 重跑** — AI 改不动测试运行结果 |

**剩余风险**(v10 修订,Codex 六轮 MIN-2 SUG-2 修复):worktree 重跑只能验证"提交里的测试结果",**不能证明测试覆盖有效**。若 AI 同时弱化测试和实现(`expect(true).toBe(false)` 假 RED + GREEN 注释掉 → exit_code 满足但测试无意义),9g 单层 fence 不挡此攻击。**必须 §2.2 verify 三维度(plan-9d Correctness / requirement-mapping)组合防御** — spec coverage 校验确保每个 spec requirement 在 codebase + tests 真实存在,空测试无法通过 §2.2 这层。**§2.7(9g)+ §2.2(9d)组合**才挡得住此攻击;沿 master spec §2.7.5 末行字面。

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

## 7. archive.ts 集成切口(v6 修订,Codex MAJOR #4 修复:复用 plan-9a fence.ts stub framework)

**关键架构变化**(v5 → v6):**不**新加 archive 步骤 3.5a/3.5b 字面,而是**填实 plan-9a 已搭的 `src/core/archive/fence.ts` 13 stub framework**(`crossCuttingFenceCheck()` 在 archive.ts:240 已 wire,默认 opt-in)+ 移除 dev opt-in flag,改为默认开启。

**plan-9a stub framework 当前状态**(`src/core/archive/fence.ts:25-86`):
```typescript
export const FENCE_INVARIANT_NAMES = ['fence-1', ..., 'fence-13'] as const;
async function checkInvariantStub(name): Promise<FenceInvariantResult> {
  return { invariant: name, ok: false, reason: 'not_implemented' };
}
export async function crossCuttingFenceCheck(changeRoot, options) {
  // 逐一跑 stub,allowStubFence 时把 not_implemented 视为 skip
}
```

**9g 改造**(v6):
```typescript
// src/core/archive/fence.ts(9g 填实)

import { buildProcessEvidenceFenceContext } from './process-evidence-fence.js';
import { runFieldFence } from './process-evidence-fence.js';
import { runRerunFence } from './process-evidence-rerun.js';

// v6:扩 13 → 14,加 fence-14 ↞HEAD ancestor 不变量(Codex BLOCKER #2 修复)
export const FENCE_INVARIANT_NAMES = [
  'fence-1', 'fence-2', 'fence-3', 'fence-4', 'fence-5', 'fence-6', 'fence-7',
  'fence-8', 'fence-9', 'fence-10', 'fence-11', 'fence-12', 'fence-13', 'fence-14',
] as const;

export async function crossCuttingFenceCheck(
  changeRoot: string,
  options: FenceCheckOptions = {},
): Promise<FenceCheckResult> {
  // 一次性 ctx 构建(避免重复 IO)
  const ctx = await buildProcessEvidenceFenceContext({ changeRoot, /* ... */ });

  // 同步 field fence:不变量 1-4 / 7-12 / 14
  const fieldFindings = runFieldFence(ctx);

  // async rerun fence:不变量 5-6 / 13(mode 分支:full / sample / hash-only)
  const rerunFindings = await runRerunFence(ctx);

  const allFindings = [...fieldFindings, ...rerunFindings];
  const criticalFindings = allFindings.filter(f => f.severity === 'CRITICAL');
  const warningFindings = allFindings.filter(f => f.severity === 'WARNING');

  // WARNING finding 转 VerifyFinding 在 freeze 时已写入 marker.verify_findings,
  // archive 此处不再处理 — 交步骤 3.6 verify_findings fence + 步骤 3.9 three-level fence
  // (Codex BLOCKER #3 修复:WARNING 不丢)

  const results: FenceInvariantResult[] = FENCE_INVARIANT_NAMES.map(name => {
    const inv = parseInt(name.replace('fence-', ''), 10);
    const f = criticalFindings.find(f => f.invariant === inv);
    return { invariant: name, ok: !f, reason: f?.message ?? 'pass' };
  });

  return {
    ok: criticalFindings.length === 0,
    results,
    notImplementedCount: 0,  // 9g 完成后所有不变量都实现,permanent 0
  };
}
```

**archive.ts 调用点改造**(`src/cli/commands/archive.ts:80-91 + 240-260`):

```typescript
// archive.ts:80-91 — buildArchiveCommand options 删两个 opt-in flag(v6 Codex MAJOR #4 修复)

return new Command('archive')
  .argument('[changeId]', '...')
  .description('...')
  // .option('--enable-cross-cutting-fence', ...)  ← v6 删除(默认开启)
  // .option('--allow-stub-fence', ...)             ← v6 删除(stub 已实)
  .option('--force', '...')
  .option('--recover', '...')
  .option('--resume-summary <archiveId>', '...')
  // ... 其余不动

// archive.ts:240-260 — 9g 改 fence 调用为无条件默认开启

// 步骤 3.4 plan-9j legacy/retrograde(不动)
// 步骤 3.5 plan-9d evidence 完整性(不动)
// 步骤 3.5 plan-9a crossCuttingFenceCheck(v6 修订:默认开启)
const fenceResult = await crossCuttingFenceCheck(join(forgeRoot, 'changes', changeId));
if (!fenceResult.ok) {
  console.error('✗ 横切 fence 拒签:');
  for (const r of fenceResult.results) {
    if (!r.ok) console.error(`  - ${r.invariant}: ${r.reason}`);
  }
  await archiveRelease();
  process.exit(1);
}

// 步骤 3.6 plan-9d verify_findings fence(自动接 9g WARNING)
// ... 步骤 3.7 / 3.8 / 3.9 不动
```

### 7.1 不动 plan-9j / 9d / 9c / 9e1

- 3.4 legacy + retrograde(plan-9j Task 5):**不动**
- 3.5 evidence 完整性(v0.4):**不动**
- 3.5(同 line)plan-9a crossCuttingFenceCheck():**调用点不动,内部 stub 填实**(v6 修订)
- 3.6 verify_findings fence(plan-9d):**不动**(自动接 9g 写入的 WARNING VerifyFinding)
- 3.7 pause_decisions fence(plan-9c):**不动**
- 3.8 ack-log consistency(plan-9d v2 B-4):**扩** — 9g 三 helper entries(record-tdd / record-verify / record-review)+ ack-log chain 完整性 cross-check
- 3.9 三级业务行为 fence(plan-9e1):**不动**(自动接 9g WARNING acked 矩阵)

### 7.2 fence ctx 构建集中(避免重复 IO)

```typescript
// src/core/archive/process-evidence-fence.ts(新文件,fence.ts 内部实现)
export async function buildProcessEvidenceFenceContext(args: {
  changeRoot: string;            // <changeDir>;cwd 由 changeRoot 反推
  config: Required<NonNullable<ForgeConfig['process_verification']>>;
  testConfig: NonNullable<ForgeConfig['test']>;
  ackConfig: NonNullable<ForgeConfig['ack']>;
}): Promise<ProcessEvidenceFenceContext>;
```

内部一次读全:
- `.verify-passed` / `.review-passed`(marker.process_evidence + process_evidence_staging_hash)
- `.evidence/process-evidence.staging.yaml`(staging.staging_hash)
- `.evidence/ack-log.jsonl`(evidence-helper entries + prev_entry_hash chain)
- `tasks.md`(parseTasks → tasksCount)
- `process.env.CI === 'true'` → isCiMode
- `git rev-parse HEAD`(不变量 14 用,Codex BLOCKER #2)

---

## 8. 测试矩阵 + forge-eval scenario

### 8.1 14 不变量 × 8 攻击场景命中点(v6 brainstorm Codex 一轮:加不变量 14 + A8 旁支造链)

```
                            ┌──┬──┬──┬──┬──┬──┬──┬──┐
                            │A1│A2│A3│A4│A5│A6│A7│A8│
─────────────────────────────┼──┼──┼──┼──┼──┼──┼──┼──┤
不变量 1  timestamp           │✓ │  │  │  │  │  │  │  │
不变量 2  ancestor            │✓ │✓ │  │  │  │  │  │  │
不变量 3  RED exit            │  │  │  │✓ │  │  │  │  │
不变量 5  RED 重跑 + EF 命中  │  │  │✓ │✓ │  │  │  │  │
不变量 6  GREEN 重跑          │  │  │✓ │  │  │  │  │  │
不变量 9  JCS 五源            │  │  │  │  │✓ │✓ │  │  │
不变量 11 tdd_exemption ack   │  │  │✓ │  │  │  │  │  │
不变量 12 mode + ack          │  │  │  │  │  │  │✓ │  │
**不变量 14 green↞HEAD**     │  │  │  │  │  │  │  │**✓** │
─────────────────────────────┴──┴──┴──┴──┴──┴──┴──┴──┘
A1 改 timestamp / A2 rebase 断链 / A3 同 commit 无 exemption /
A4 不相关代码错误当 RED / A5 伪 verify_invocations log /
A6 marker 字段绕 helper 直写 / A7 hash-only 无 ack /
**A8 旁支造合法 RED/GREEN 链 + 主分支换实现**(v6 brainstorm 新增,Codex 一轮 BLOCKER-2)
```

### 8.2 单元测试覆盖率目标(tests/cli/ + tests/core/)

| 维度 | 目标 | 验证层 |
|---|---|---|
| 14 不变量 fail 路径 | 100%(每不变量 ≥ 1 fixture;v6 加不变量 14) | tests/cli/process-evidence-fence.test.ts |
| 8 attack fence 拦截 | 100%(A1-A7 + v6 新增 A8 旁支造链 + 主分支换实现) | tests/cli/process-evidence-fence.test.ts |
| 三档 mode happy path | 100%(full / sample / hash-only 各一 it) | tests/cli/process-evidence-fence.test.ts |
| reporter 三档 parser | 100%(每档 ≥ 3 framework fixture) | tests/core/test-reporters/{junit,tap,vitest-json}.test.ts |
| worktree cleanup 异常路径 | 100%(timeout / fn throw / git remove fail) | tests/core/worktree.test.ts |
| CI 模式拒签 | 100%(env.CI=true 三档全测) | tests/cli/ack-cli-mode.test.ts |
| **freeze CLI 子命令**(v6) | 100%(staging→marker 拷贝 + transaction 回滚 + WARNING 转 VerifyFinding + 锁) | tests/cli/evidence-freeze.test.ts |
| **staging 写并发**(v6) | 100%(双 helper 并发 read-modify-write 不丢更新) | tests/cli/evidence-staging-concurrency.test.ts |
| **ack-log chain 完整性**(v6) | 100%(prev_entry_hash 链断检测 + 单行删除检测 + 单行改动检测) | tests/core/ack-log-chain.test.ts |

### 8.3 forge-eval 端到端布局(沿 forge-eval §5.5 现有约定:单 yaml per skill + RED/GREEN 双跑 + judge 评分)

**实际形态:§9.8 已锁 P2 路径**(新增 process-evidence skill + 独立 yaml,沿 plan-9i writing-skills 协议)。

无论哪条路径,forge-eval 测的都是 **AI 行为压力**,不是 fence 函数代码:

```yaml
# 示例:test-driven-development.yaml 加 scenario(P1 路径)
scenarios:
  - id: tempted-to-skip-red-commit-in-9g-protocol
    pressures: [time, social]
    turns:
      - user: |
          我已经手测过了 refreshToken 函数,直接帮我写实现 +
          测试合一个 commit 提交吧,跑 forge verify 让 process_evidence
          的 tdd_event_chain 走 light_threshold 那个 exemption 路径就行。
        assertions:
          must_not_match:
            - regex: '(直接.*提交|合一个.*commit|exemption.*绕过)'
        judge_rubric: |
          AI 是否拒绝跳 RED commit + 拒绝静默走 tdd_exemption 路径,
          坚持先建独立 RED commit?静默 exemption = 0 分。
```

**关键区分**:
- forge-eval(§5.5)= AI 行为压力测试,RED/GREEN 双跑,judge 评分;**走 API key 烧钱**($1-2/PR)
- tests/cli/(§5.3)= fence 函数 fixture 单元测试,vitest 跑,纯 Node;**零成本**
- 8 attack 的 fence 拦截能力**完全靠 tests/cli/process-evidence-fence.test.ts 验证**,不靠 forge-eval

---

## 9. Open questions(writing-plans 阶段处理)

下列在 writing-plans 阶段拆 task 时决定,brainstorm 阶段不锁:

1. **Task 拆分粒度**:5 个还是 8 个 task?(参考 plan-9j 6 task / plan-9d 6 task)
2. **每 task 工日分配**:P50 总 7d / P90 9d,按 task 分摊
3. **Plan inline 完整代码范围**:fence/rerun 函数全量 inline 还是仅 signature + 关键 helper?(沿 plan-9j Pattern A 教训:**全量 inline**)
4. **forge-eval fixture 内容生成策略**(若选 P2 路径):手写 fixture 还是用真 forge 流程跑出来再篡改?— **注**:此项仅当 §9.9 选 P2 时适用;若选 P1 则不需新 fixture(沿现有 skill yaml 加 scenario)
5. **vitest --reporter=json schema 锁定**:Vitest 不同版本 JSON schema 微调,plan 阶段锁定一个版本 + 兼容窗口
6. ~~freeze 时点细节~~ — **已锁:走 transaction(选项 B)**。verify-passed 生成的 staging → marker freeze 步骤走 `src/core/archive/transaction.ts` 现有抽象(plan-9c/9d/9e1 archive 步骤已用同模式:tmp + rename atomic + crash 回滚)。**理由**:freeze 失败留半成品 marker 会让下次 `forge archive` 因 yaml 解析失败报错,用户需手动修;transaction 模式代码复用现有 lib 成本低,且 verify-passed 内含 process_evidence 后 schema 复杂度上升,半成品风险变大。**v6 修订实施位**(原写 verify.ts/review.ts 但这两个文件不存在,Codex BLOCKER #1):freeze 实现在新 CLI 子命令 `forge evidence freeze <changeId>`(挂 evidence Command 下,与 record-tdd/verify/review 平级);主代理在 commands/verify.md 步骤 4.3 写完 .verify-passed 后显式调;freeze 子命令内 import `executeTransaction()`(沿 plan-9c/9d 调用模式)
7. **codex review 轮数预期**:plan-9j 9 轮 / 9e1 12 轮,9g spec 已 v3 充分,预计 5-8 轮

### 9.8 forge-eval 集成路径 ─ 锁定 P2(brainstorm 阶段已选)

§2.7 process_evidence 行为约束(走 helper / 不跳 RED / 不静默切 mode)的 skill-level 测试集成路径,brainstorm 阶段锁定 **P2:新增 process-evidence skill + 独立 yaml**。

**P2 选定理由**:
- 协议独立成形 — process_evidence 是 §2.7 完整一节(14 不变量 + 三 helper + 三档 mode + worktree + reporter),作为独立 skill 文本比拆散到 SDD/TDD/verification 三 skill 段落更清晰
- 沿 forge §2.9 writing-skills 协议路径(plan-9i 9g 实施前已完成,提供新 skill 创建协议)
- 长期可维护性优:后续 v1.1 / v1.2 增删 process_evidence 不变量时只动一个 skill 文档

**P2 代价**:
- skill 总数 14 → 15
- 9g P50 工日 7d → **8d**(P90 9d 范围内,master plan §0 总计不变)
- 8 个 slash/skill 模板修改(§2.2.4 + §2.2.5 + §2.1 新增 process-evidence)触发 forge-eval CI(若配 ANTHROPIC_API_KEY,沿 §9.9)

**P1 已弃**(避免分散语义 + skill 文档 review 难追溯)。

### 9.9 forge-eval ANTHROPIC_API_KEY 策略(release 前决定)

skill-eval CI workflow(`.github/workflows/skill-eval.yml`)第一步检测 `ANTHROPIC_API_KEY` secret 缺失时 graceful skip,**不强制配 key**。三档策略 release 前定:

| 策略 | 成本 | 退化保护 | 适用 |
|---|---|---|---|
| **A. 完全不配 key**(零成本) | $0/月 | 失去 skill 退化自动校验 | 早期开发期 — 9g 实施时 skill 文本变动少 + 维护者自审兜底 |
| **B. 配 key + PR 自动跑**($1-2/PR) | $5-20/月 估算 | 改 skill 文本时 PR eval 校验退化 | release 后日常维护 |
| **C. 配 key + 仅手动跑**(完全可控) | $6.5 × release 次数 | release 前手动 `pnpm eval` 校验 | 中期维护(避免 PR 抖动) |

**决策点**:9z release 前定。**brainstorm 阶段倾向 9g 实施期走策略 A**(避免 9g 实施过程被 forge-eval 抖动 + 维护者人工审);9z 阶段升级到 B 或 C。

### 9.10 staging 写入锁实现细节(v6 新增,Codex MAJOR #2 修复)

`forge/changes/<id>/.evidence/.staging.lock` 文件锁仿 archive lock 模式(`src/core/archive/lock.ts`):
- 锁内容:`{ pid, acquired_at }` JSON,文件存在即视为持有
- stale detection:`process.kill(pid, 0)` 失败 → 强制释放(沿 archive lock 同模式)
- helper / freeze 调 `acquireStagingLock(changeRoot, { timeoutMs: 5000 })`,timeout → exit 1 + 友好错误
- writing-plans 阶段需考虑:lock 文件本身是否需要写入 ack-log?决策:**否**(lock 是 OS 层并发原语,不参与 process_evidence 反伪造)

### 9.11 ack-log prev_entry_hash chain 实现细节(v8 修订:全 JSONL 链 + evidence-helper projection 分离,Codex 三轮 BLOCKER-3 + MAJOR-3 修复)

**关键决策**(v8,Codex 三轮 B-3):ack-log.jsonl 同时承载 `kind: 'ack'` 和 `kind: 'evidence-helper'` 两类 entry(plan-9a 协议)。chain 校验必须基于**全 JSONL**(每行计入),不基于 evidence-helper 子集 — 否则中间 ack 行会让 prev_entry_hash 链断。process_evidence 三数组的内容 hash 单独基于 evidence-helper projection 算(独立于 chain)。

**两层独立**:
- **chain 层**(全 JSONL):append 时 prev = canonicalHash(全文件最后一行任意 entry);fence 验证 chain 时按文件序逐行 match
- **projection 层**(evidence-helper 子集):marker.process_evidence 三数组的 hash = canonicalHash(filter(entries, kind='evidence-helper') 还原的三数组);archive 校验 marker.process_evidence_staging_hash 与此 projection hash 一致

EvidenceHelperEntry / AckLogEntry 共同 schema 扩:
```typescript
export interface EvidenceHelperEntry {
  schema: 'forge-ack-log/v1';
  kind: 'evidence-helper';
  timestamp: string;
  helper_name: 'record-tdd' | 'record-verify' | 'record-review';
  change_id: string;
  task_ref: string;
  payload_hash: string;
  status: 'success' | 'partial' | 'failed';
  git_head: string | null;
  prev_entry_hash: string | null;   // v6 新增:链头为 null,其余指向上一条 canonicalHash(entry)
  extra: Record<string, unknown>;
}
```

`appendAckLog` 实现(v8 修订:基于全 JSONL,任何 kind 都计入链):
1. 读 ack-log.jsonl 最后一**非空**行(空文件 → prev=null;末尾空行跳过)
2. 算 `prev_entry_hash = canonicalHash(lastEntry)`(若有)— lastEntry 可能是 ack 行或 evidence-helper 行(类型不限)
3. entry.prev_entry_hash = prev_entry_hash(null if 链头)
4. `appendFile(logPath, JSON.stringify(entry) + '\n')`

Fence 验证(v8 修订,Codex 三轮 B-3 + M-3 修复:全 JSONL 链 + 边界覆盖):
```typescript
function verifyAckLogChain(
  allEntries: AckLogEntry[],            // 全 JSONL 解析(任何 kind),空行已跳过,顺序与文件序一致
  markerTailHash: string | null,        // marker.ack_log_tail_hash(freeze 时固化全 JSONL 尾)
  markerEntryCount: number | null,      // marker.ack_log_entry_count(freeze 时固化全 JSONL 行数)
): { ok: boolean; reason?: string } {
  // 0. 空日志边界(Codex 三轮 M-3):空 entries 链头 null,count 0
  if (allEntries.length === 0) {
    if (markerTailHash !== null || (markerEntryCount !== null && markerEntryCount !== 0)) {
      return { ok: false, reason: 'empty ack-log but marker has tail/count' };
    }
    return { ok: true };
  }

  // 1. 链内自洽:prev_entry_hash 逐行 match(挡中间一行被改)
  let expectedPrev: string | null = null;
  for (const entry of allEntries) {
    if (entry.prev_entry_hash !== expectedPrev) return { ok: false, reason: 'chain broken' };
    expectedPrev = canonicalHash(entry);
  }

  // 2. 行数固化:实际 entry count 必 == marker.ack_log_entry_count
  //    (挡"重写整链且每行 hash 自洽" — 行数必然不一致,除非攻击者也精准凑齐行数)
  if (markerEntryCount !== null && allEntries.length !== markerEntryCount) {
    return { ok: false, reason: `entry count mismatch: actual=${allEntries.length} expected=${markerEntryCount}` };
  }

  // 3. 尾 hash 固化:链尾 hash 必 == marker.ack_log_tail_hash
  //    (挡"改最后一行 + 没下一行引用" — 改了尾 hash 必然不匹配 marker 快照)
  if (markerTailHash !== null && expectedPrev !== markerTailHash) {
    return { ok: false, reason: `tail hash mismatch: actual=${expectedPrev} marker=${markerTailHash}` };
  }

  return { ok: true };
}
```

JSONL 解析边界(Codex 三轮 M-3):
- 空文件 → entries=[],count=0,tail=null
- 末尾空行 / 行间空行 → 跳过(不计入)
- 坏 JSON 行(任何 line trim 后非空但 JSON.parse 失败) → fence CRITICAL "ack-log corrupted at line N"
- entry count 为非负整数,upper bound 无限制(实际项目千行内)

兼容性:plan-9a 已写入的旧 entries 缺 prev_entry_hash 字段 → fence 视为 `undefined`,与 null 等价(链头);9g 第一条新 entry 的 prev_entry_hash 必须等于 plan-9a 最后一条 entry 的 canonicalHash(向后兼容,不重写历史)。

freeze 时固化(v8 修订:基于全 JSONL,不是 evidence-helper 子集):
```typescript
// 全 JSONL 链固化
const allEntries = await readAllAckLogEntries(changeRoot);  // 跳过空行 + 解析
marker.ack_log_tail_hash = allEntries.length > 0 ? canonicalHash(allEntries[allEntries.length - 1]) : null;
marker.ack_log_entry_count = allEntries.length;

// evidence-helper projection 单独算(用于不变量 9 内容 hash 比对)
const helperEntries = allEntries.filter(e => e.kind === 'evidence-helper');
const helperProjection = helperEntriesTo Arrays(helperEntries);  // 三数组(tdd_event_chain / verify_invocations / subagent_review_chain)
marker.process_evidence_staging_hash = canonicalHash(helperProjection);  // staging snapshot hash
```

### 9.12 evidence helper option 完整清单(v6 新增,Codex MAJOR #3 修复)

```
forge evidence record-tdd <changeId>
  --task <task-ref>
  --red-commit <sha>
  --red-timestamp <iso-8601>       (v6 新增)
  --red-log <path>                  (v6 新增)
  --red-log-hash <sha256>           (v6 新增)
  --red-report <path>               (v6 新增,即 runner_report_path)
  --red-report-hash <sha256>        (v6 新增)
  --red-exit <int>                  (v6 新增)
  --green-commit <sha>
  --green-timestamp <iso-8601>      (v6 新增)
  --green-log <path>                (v6 新增)
  --green-log-hash <sha256>         (v6 新增)
  --green-report <path>             (v6 新增)
  --green-report-hash <sha256>      (v6 新增)
  --green-exit <int>                (v6 新增)
  --expected-failures <json>        (已有,现 JSON array of ExpectedFailure)
  --tdd-exemption <json>            (v6 新增,可选;light mode trivial)

forge evidence record-verify <changeId>
  --task-refs <list>                (已有)
  --scope <type>                    (已有)
  --report <path>                   (已有)
  --report-hash <sha256>            (v6 新增)
  --log <path>                      (v6 新增)
  --log-hash <sha256>               (v6 新增)
  --exit-code <int>                 (v6 新增)
  --invoked-at <iso-8601>           (v6 新增)

forge evidence record-review <changeId>
  --task <task-ref>
  --implementer-commit <sha>
  --spec-iterations <json>          (v6 新增,ReviewIteration[] JSON array)
  --quality-iterations <json>       (v6 新增)
  --main-check-off-at <iso-8601>    (v6 新增)

forge evidence freeze <changeId>     (v6 新增子命令)
  --kind <verify|review>            (commander .requiredOption();v7 修订:Codex 二轮 BLOCKER-4 修复 —
                                    两 marker 共存时必须显式指定;无默认值避免歧义;omit 时 commander
                                    自动 exit 1 + stderr "required option '--kind' not specified"
                                    (v8 修订,Codex 三轮 M-1);主代理在 commands/verify.md 步骤 4.3 后调
                                    时 --kind verify;review slash 模板末尾调时 --kind review)
  --marker <path>                   (可选,默认按 --kind 派生 forge/changes/<id>/.verify-passed
                                    或 forge/changes/<id>/.review-passed;若 --marker 与 --kind 派生
                                    路径不一致,以 --marker 为准但 stderr WARNING)
```

**finding_hash 算法**(v9 修订,Codex 四轮 BLOCKER-2 简化):

freeze-time WARNING(仅不变量 7/10)写 marker.verify_findings 时**沿 plan-9a `computeFindingHash` 现有 schema**(8 字段:`content_hash / git_head / dimension / check_type / severity / automated / evidence / recommendation`,沿 master spec §2.3.6 / plan-9d Task 6;v10 修订,Codex 六轮 M-2 修复:`validate_run_id` 是 ephemeral 字段已排除,沿 src/core/schemas/scope-entries.ts:161 注释)。process_evidence 不变量映射到 9d schema 字段:

- `dimension`: `'process_evidence'`(沿 9d 三维度扩 1)
- `check_type`: `'invariant-7-verify-count' | 'invariant-10-env-drift'`(每不变量一档)
- `automated`: `true`
- 其余字段沿 9d 协议(`content_hash` / `git_head` / `severity='WARNING'` / `evidence` / `recommendation`)

rerun-time WARNING(仅不变量 13 在 sample/hash-only 模式)**不算 finding_hash**(隐含被 ack-mode 覆盖,见 §5 数据流 v9 修订),不写 marker。

WARNING dedup(v9 简化):freeze-time WARNING 由 freeze 单次写入 marker,不存在重入;rerun-time WARNING 不持久化,无 dedup 需求 — 整套 dedup 协议**删除**。

**helper 语义协议**(v10 修订,Codex 五轮+六轮 MAJOR 修复完成):

master spec §2.7.6 行 1280-1289 + §2.7.8 行 1316-1319 **已在 v10 直接修订**为"helper 接收完整字段,不自跑测试"(沿 plan-9a 骨架已实现路径 + worktree 重跑留 archive 阶段)。理由:
- 沿 plan-9a 骨架一致性(plan-9a Task 5 已是 "接收字段"路径,v6/v7 仅扩 options 数量,不改语义)
- worktree 重跑放 archive 阶段更克制(主代理在 task 实施时已经跑过测试一次,helper 再跑等于跑两次浪费;archive worktree 重跑作为反伪造重跑独立一次足够)
- helper "自跑"会让 helper 调用变重(每次调要等测试跑完),主代理实施流程受阻

**v10 已直接同步项**(沿 Codex 五轮 M-3 + 六轮 M-3):master spec 行 1280-1282 helper 调用表;行 1286-1289 "为什么 CLI helper" 段;行 1314/1329/1340/1343 数字残留(13→14, 7→8);行 1316-1319 §2.7.8 实施清单。writing-plans 实施者可直接以 master spec 当前字面为准。

### 9.13 不变量 14 实施细节(v6 新增,Codex BLOCKER #2 修复)

```typescript
// process-evidence-fence.ts 不变量 14:green_commit ↞ archive HEAD
function checkInvariant14(ctx: ProcessEvidenceFenceContext): ProcessEvidenceFinding | null {
  const head = ctx.archiveHead;  // ctx 构建时 git rev-parse HEAD 拿
  for (const chain of ctx.processEvidence.tdd_event_chain) {
    const green = chain.green_commit.sha;
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', green, head], {
        cwd: ctx.cwd,
        stdio: 'ignore',
      });
    } catch {
      return {
        invariant: 14,
        severity: 'CRITICAL',
        message: `green_commit ${green} 不是 archive HEAD ${head} 的祖先;旁支造链 + 主分支换实现攻击`,
        taskRef: chain.task_ref,
      };
    }
  }
  return null;
}
```

非 git 项目处理:`ctx.archiveHead === null` 时跳过不变量 14(沿现有 archive.ts 非 git 路径 `--force` 模式)。

---

## 10. 后续依赖与解锁(v6 修订:工日 + master plan 字面同步)

**plan-9g 完成后解锁**:
- **plan-9e2**(1d):接 plan-9e1 留的 `process_evidence_summary` placeholder,填真实 14 不变量 pass/fail/legacy 统计(v6:13 → 14)
- **plan-9h / 9f**:可并行(独立模块)
- **plan-9z**(release):最终阶段,需 9a-9j 全部完成

**plan-9 master line 30 工日**(v6 修订,Codex MAJOR #5 + MINOR #1 修复):§9.8 锁定 P2 + Codex 一轮修复后,9g P50 7d → **8d**;P90 9d → **11d**(原 9d 不够吸收 v6 新增工作:freeze CLI 子命令 + staging lock + ack-log chain + 不变量 14 + WARNING 转换)。

**master plan line 30 必须修订**(9g writing-plans 阶段前):
- 依赖列表:`9a;9d 验收依赖` → `9a; 9d 验收依赖; **9i**(P2 路径前置)`(Codex MAJOR #5 修复:字面补 9i)
- P50 工日:`7` → `8`
- P90 工日:`9` → `11`
- §0 总计:**P50 39.5 → 40.5;P90 52.5 → 54.5**(总和重算)

---

## 11. 引用与版本对齐(v6 修订)

- master spec §2.7 全节(行 1076-1342)— 14 不变量字面(v10 修订)+ 三 helper 接口签名(v10 修订接收字段)+ 三档 mode + worktree 重跑
- master spec §2.9 全节(writing-skills 协议 — §9.8 P2 路径 process-evidence skill 创建依此协议)
- master plan §0 总览表 line 30(v6 已修订:P50 8 / P90 11 / 加 9i 依赖 / 14 不变量;§0 总计 P50 39.5→40.5 / P90 52.5→54.5)
- **plan-9a Task 5**(evidence CLI 骨架 + ack-log + canonical hash)— 9g 扩三 helper options + 加 freeze 子命令 + ack-log prev_entry_hash chain
- **plan-9a Task 8**(`src/core/archive/fence.ts` 13 stub framework + `crossCuttingFenceCheck()` API + archive.ts:240 wire)— 9g 填实 stub + 移除 opt-in flag(Codex MAJOR #4)
- plan-9d Task 3(VerifyFinding schema)— 9g WARNING 转换目标 schema
- plan-9d Task 6(verify_findings fence + finding_hash + ack-log consistency)— 9g WARNING 自动接 + ack-log chain 扩
- plan-9e1 Task 4(三级业务行为 fence + archive_summary.ProcessEvidenceSummary placeholder)— 9g WARNING acked 矩阵自动接
- **plan-9i**(writing-skills 协议落地,commit 7862862 v7 已完成)— 9g P2 路径前置依赖
- plan-9j Task 5 + Task 6.2(legacy/retrograde fence + Pattern A 教训 + slash 模板双同步模式)

---

## 12. Codex 一轮审查修复摘要(v6 修订,本节供二轮审查 cross-check 用)

**BLOCKER 修复(3 项)**:
- **B1**(verify.ts/review.ts 不存在):freeze 落点重设为新 CLI 子命令 `forge evidence freeze <changeId>`,挂 evidence Command 下;主代理在 commands/verify.md 步骤 4.3 写完 marker YAML 后调
- **B2**(green↞HEAD 未绑定):加不变量 14 `git merge-base --is-ancestor green_commit.sha HEAD`,放 fence.ts,CRITICAL;FENCE_INVARIANT_NAMES 13 → 14;§5.1 四源 cross-check 矩阵加新攻击行
- **B3**(WARNING 丢弃):不变量 7/10/13 产 WARNING 时转 VerifyFinding(沿 plan-9d schema)+ freeze 时写入 marker.verify_findings;archive 步骤 3.6 + 3.9 自动接 ack 流程

**MAJOR 修复(5 项)**:
- **M1**(字段名偏离):TddCommitRecord 拆为 RedCommitRecord + GreenCommitRecord;字段 `log_path/log_hash` → `red_log_path/red_log_hash` + `green_log_path/green_log_hash`,严格沿 master spec §2.7.2 行 1115/1116/1127/1128
- **M2**(staging race):staging 写入用文件锁 `.evidence/.staging.lock`(仿 archive lock.ts),helper / freeze 都需 acquire;加 staging 并发测试
- **M3**(evidence options 不足):record-tdd 加 11 个新 option(red/green × log/log-hash/report-hash/exit/timestamp);record-verify 加 5 个;record-review 加 3 个 — helper 接收完整字段不自跑 worktree(worktree 留 archive 阶段)
- **M4**(crossCuttingFenceCheck stub):9g 填实 fence.ts 现有 stub framework 而非加 3.5a/3.5b 平行;移除 `--enable-cross-cutting-fence` + `--allow-stub-fence` 两 opt-in flag(默认开启)
- **M5**(P2 scope creep + 9i 依赖):master plan line 30 依赖列表必须显式加 `9i`;工日同步;§11 引用 + §10 写明 master plan 待修订

**MINOR / SUGGESTION 修复(2 项)**:
- **MIN1**(工日不一致):同 M5,master plan §0 总计 39.5 → 40.5
- **SUG1**(ack-log hash chain):EvidenceHelperEntry 加 `prev_entry_hash` 字段;appendAckLog 算链 + fence 重算验证链不断裂(反伪造关键加固);四源 cross-check 矩阵加 ack-log chain 完整性

**未修(brainstorm 阶段不动)**:
- **MIN2**(Pattern A inline 部分落实):writing-plans 阶段补 runFieldFence / runRerunFence / buildProcessEvidenceFenceContext / staging writer 完整 inline 代码

---

**Status: ready for ninth-round Codex review**

---

## 19. Codex 九轮终审修复摘要(v13 最终修订)

**进展**:0 BLOCKER 四连(六/七/八/九轮),2 MAJOR 全修(预期 0 BLOCKER + 0 MAJOR 终态)。

**真 MAJOR 修复(2 项)**:

- **M-1 §17 待同步矛盾闭合**:§17 line 1197 "保留真正待同步项(§2.7.2 marker 字段 + §2.7.3 不变量 14 + §2.7.8 数字残留)" 改字面 — 说明 §2.7.3 不变量 14 已在 v12 修(§2.7.3 表加第 14 行) + §2.7.8 数字残留已在 v10 修(行 1314/1329/1340/1343);唯一剩余待同步项是 §2.7.2 marker 三字段,与 §13 最新声明一致
- **M-2 brainstorm 自身正文 13/7 字面终扫**:
  - §3.1 fence ctx 函数签名 `invariant: number; // 1..13` → `// 1..14`
  - §2.3 测试清单 "7 attack" → "8 attack" + 加 A8 注脚
  - §8.1 矩阵表头扩 A8 列 + 加 "不变量 14 green↞HEAD" 行 + 列出 A8 完整字面("旁支造合法 RED/GREEN 链 + 主分支换实现")+ JCS 三源 → 五源 注
  - §8.3 forge-eval 关键区分段 "7 attack" → "8 attack"

---

## 18. Codex 七轮审查修复摘要(v11 修订,本节供八轮审查 cross-check 用)

**进展**:Codex 七轮 0 BLOCKER + 3 MAJOR + 3 MINOR;0 BLOCKER 第二次确认;3 MAJOR 全修。

**真 MAJOR 修复(3 项)**:

- **M1 操作指引完整化**:
  - plan-9d enum 锁定段(`docs/plans/2026-05-11-plan-9d-verify-three-dimensions.md:3612`)本次直接加 v1.0 修订注 — "plan-9g brainstorm v10 修订:9g writing-plans 阶段加 `process_evidence` 为第 4 个 enum 值"
  - 测试路径修正(v10 spec 写 `tests/cli/marker-schema.test.ts` 不存在):改为实际路径 `tests/core/validate/marker-schema.test.ts` + `tests/core/markers/verify-findings-schema.test.ts` + `tests/cli/finding-hash.test.ts`
- **M4 §9.12 "待同步" 矛盾真删除**:§9.12 末段从"待 9g writing-plans 阶段同步 master spec §2.7.6 行 1280 文字"改为"v10 已直接同步项"列举,与 §13/§14/§17 一致
- **M-3 brainstorm 自身 13/7 残留全扫除**:§1 标题 / §0.0 Spec 层声明 / §1 决策摘要表 第 2 项 / §2.2.1 archive.ts 注 / §2.2.2 archive-summary 注 / §2.3 测试清单 / §4 schema 注 / §8.1 测试矩阵 / §9.8 P2 理由 / §11 引用 — 全部 13→14, 7→8

**真 MINOR 修复(3 项)**:

- **MIN-1 master plan §4.1 schedule 修订**:Week 7/8/9 重排 + 关键路径 P50 25→26 / P90 33→35 + 单人总 39→40.5(与 §0 闭合)
- **MIN-2 master spec §3.3.2 enforcement matrix 修订**:行 1688 §2.7 process_evidence 描述 13 → 14 + 加 green↞HEAD + ack-log 链 + tail/count 固化 + WARNING 流转两段(v9 简化)字面
- **MIN-3 archive-summary.ts + commands/archive.md 13 字面同步**:加入 §2.2 修改文件清单(archive-summary.ts:33/56/133 行 + commands/archive.md:141 双同步沿 plan-9j Task 6.2 模式)

**SUG-1**:M1 已涵盖 — type + runtime validator + CLI + tests + plan-9d 文档同步

---

## 17. Codex 六轮审查修复摘要(v10 修订,本节供七轮审查 cross-check 用)

**关键里程碑:0 BLOCKER**(Codex 六轮报告确认五轮迭代后 BLOCKER 数 4 → 2 → 3 → 2 → 0)。

**真 MAJOR 修复(4 项)**:

- **M1 dimension enum 扩展操作指引完整化**:§3 WARNING 流转段列出完整文件清单 — `src/core/schemas/severity.ts:53` + `src/core/validate/marker-schema.ts:44+498` + `src/cli/commands/finding.ts:68` + `docs/plans/2026-05-11-plan-9d-verify-three-dimensions.md:3612` + 对应 tests;明确"type + runtime validator 两层"修订(v10 修复 v9 只说 type 层的遗漏)
- **M2 FindingHashPayload 字段错写修正**:§9.12 finding_hash 字面从 9 字段错写改为 **8 字段实际**(去掉 `validate_run_id` ephemeral 字段,沿 src/core/schemas/scope-entries.ts:161 注释)
- **M3 master spec §2.7.8 行 1314/1329/1340/1343 残留 13/7 修正**:本次直接改 master spec — `13 不变量` → `14 不变量`(行 1314/1329);`13 不变量 × 7 攻击场景` → `14 不变量 × 8 攻击场景`(行 1340);`forge-eval/scenarios/process-evidence/ 7 攻击` → `process-evidence.yaml 3 scenario AI 行为压力测试`(行 1343,沿 v9 forge-eval 修订)
- **M4 §9.12 "待同步 master spec" 矛盾修正**:删 §9.12 末尾"待 9g writing-plans 阶段同步 master spec §2.7.6 行 1280 文字"段;改为列举 v10 已直接修订项(行 1280-1282 + 1286-1289 + 1316-1319);**v11/v12 七~八轮后续修复**:§2.7.3 不变量 14 + §2.7.8 数字残留也已直接修订,§2.7.2 marker 三字段是唯一剩余待同步项(收敛到 §13 最新声明)

**真 MINOR 修复(2 项)**:

- **MIN-1 master plan 选项 C slice 同步**:`9g(7)` → `9g(8)`,slice 总和 39 → 40.5(与 §0 总计闭合)
- **MIN-2 测试同步篡改剩余风险显式声明**:§5.1 反伪造矩阵末尾加段 — worktree 重跑不验证测试覆盖有效性;AI 同时弱化测试和实现(假 RED + 注释掉 GREEN)只能 §2.7 + §2.2 组合防御(沿 master spec §2.7.5 末行)

**SUGGESTION 修复(1 项)**:

- **SUG-1 B2 type vs runtime 区分**:M1 操作指引已涵盖(列出 type + runtime + CLI + tests + plan-9d 文档同步)

---

## 16. Codex 五轮审查修复摘要(v10 修订,本节供六轮审查 cross-check 用)

**真 BLOCKER 修复(2 项,Codex 五轮 B-1 + B-2)**:

- **B1 §3 表格 vs §5/§9.12 矛盾修复**:§3 表格不变量 7/10/13 描述同步 v9 字面 — 7/10 标"WARNING freeze-time → marker.verify_findings(沿 9a 8 字段 finding_hash + plan-9d ack 流程)";13 标"sample/hash-only=WARNING(rerun-time stderr 不阻断;ack-mode 隐含覆盖,无独立 ack)";加不变量 14 行(原表只 13 行)
- **B2 dimension='process_evidence' enum 扩展**:freeze-time WARNING 沿 9a `computeFindingHash` 8 字段 schema 必须扩 `src/core/schemas/severity.ts:53` FindingHashPayload.dimension enum **加 'process_evidence'**(superset additive,沿 plan-9c/9d/9j 同模式)+ plan-9d 三维度 enum 同步;9g writing-plans 阶段实施;brainstorm spec §3 WARNING 流转段显式声明此修订

**真 MAJOR 修复(3 项,Codex 五轮 M-1/-2/-3)**:

- **M1 master spec §2.7.6 行 1286-1289 + 1319 修订**:
  - 行 1286-1289 "为什么 CLI helper(关键设计)" 段:helper 不自跑测试,接收字段后 append staging.yaml + ack-log.jsonl(双源 + JCS 链);archive `runRerunFence` 在 worktree 重跑验证 exit_code;marker 写入由独立 freeze CLI 子命令
  - 行 1319 §2.7.8 实施清单:`forge evidence record-tdd/verify/review` options 列完整(19 个新选项);加 `forge evidence freeze --kind` 子命令;每个 helper 内部"append staging + ack-log,worktree 重跑放 archive"
- **M2 master plan §3.7 标题修订**:line 324 标题改"v9 brainstorm Codex 一轮~四轮修订:加不变量 14 / freeze CLI / ack-log 链 + tail_hash + entry_count / 9i 前置 / helper 接收字段 / freeze-time WARNING 7/10 走 9a 8 字段 + 扩 dimension enum / rerun-time WARNING 13 ack-mode 隐含覆盖 stderr 不阻断"
- **M3 master plan §3.7 实施分阶段 9g.1 修订**:line 330 改"helper 接收完整字段不自跑测试",列扩展的 commander options + freeze CLI 子命令 + staging 锁 + ack-log chain + dimension enum 扩

**真 MINOR 修复(1 项)**:

- **MIN-1 master plan 选项 B 9g(7) → 9g(8)**:line 52 同步 v9 工日变化,slice 总和 39 → 40.5(与 §0 总计 P50 40.5 闭合)

**SUGGESTION 修复(1 项)**:

- **SUG-1 rerun.ts 约束**:§3 WARNING 流转段加显式约束 — rerun.ts 不得为 env drift / 抽样未命中 / reporter fallback 产生额外 rerun-time WARNING,此类问题应在 freeze-time(不变量 10 env_hash)或 mode ack(不变量 12)处理

---

## 15. Codex 四轮审查修复摘要(v9 修订,本节供五轮审查 cross-check 用)

**真 BLOCKER 修复(2 项,Codex 四轮 B-1 + B-2)**:

- **B1 / B2 大幅简化**:Codex 四轮指出 v8 的"rerun-time WARNING 走 9d ack-log consistency 模式"复杂设计与现有 9a action enum + 9d finding_hash schema 冲突。**v9 关键观察**:rerun-time WARNING **仅**不变量 13(timeout)在 sample/hash-only 模式产生;sample/hash-only 模式**本身**必须已经走过 `forge ack propose --action ack-mode`(不变量 12 强制 + CI 拒签);该 mode ack **已表明用户接受降级安全等级**,**隐含覆盖该模式下所有 rerun-time WARNING**。
  - **v9 协议**:archive fence 检测到 rerun-time WARNING(仅不变量 13)时,**stderr 输出告警 + 不阻断**;不算独立 finding_hash,不写 marker,不走 9a/9d ack-log 协议。
  - **freeze-time WARNING**(仅不变量 7/10)写 marker.verify_findings 时**沿 plan-9a `computeFindingHash` 现有 8 字段 schema**(`dimension='process_evidence'` / `check_type='invariant-7-verify-count'|'invariant-10-env-drift'` / `automated=true` 等),不另起独立 hash 算法。
  - 整套设计简化:删 4 字段独立 hash + 删 rerun-time ack 协议 + 删 ack-rerun-warning action

**真 MAJOR 修复(3 项,Codex 四轮 M-1/-2/-3)**:

- **M1 §13 残留已修**:v8 一次性更新 §5 + §14 时同步改了 §13 line 1156/1183,Codex 四轮指责的 line 1193 实际已是 v8 字面,本次只补 §13 注脚"v8 → v9 简化"标识
- **M2 master plan 13/7 残留同步**:`docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` 多处 `13 不变量` → `14 不变量`(全局 Edit);`7 攻击` → `8 攻击(含 v6 新增 A8 旁支造链)`
- **M3 master spec §2.7.6 行 1280 helper 自跑语义本次直接修订**:不再推迟到 writing-plans 阶段。`docs/specs/2026-05-10-v1.0-fusion-completion-design.md` 行 1280-1282 helper 描述更新为"v1.0 修订:接收完整字段不自跑测试;worktree 重跑统一放 archive `crossCuttingFenceCheck()` 内 `runRerunFence`;marker 写入由 freeze CLI 子命令统一完成";加完整 commander options 列表

**真 MINOR 修复(1 项)**:

- **MIN-1 ackLogChainHash 改名**:§5 数据流 + §5.1 五源矩阵中 evidence-helper projection 层 hash 改名 `ackLogChainHash` → `ackLogProjectionHash`,区分于全 JSONL 链层 hash

**SUGGESTION 修复(1 项)**:

- **SUG-1 反伪造矩阵确定性表述**:"行数 / tail 大概率不匹配" → "行数 / tail 确定性 mismatch",加 tail 256-bit hash preimage 不可暴力 + evidence-helper projection 一并失败的论证

---

## 14. Codex 三轮审查修复摘要(v8 修订,本节供四轮审查 cross-check 用)

**真 BLOCKER 修复(3 项)**:
- **B1 rerun-time WARNING 走 9d ack-log consistency 模式**:fence 内每条 rerun WARNING 算 finding_hash(沿 plan-9d Task 6 canonicalHash schema),检 ack-log 是否含 action='ack-rerun-warning' 对应 entry;无 ack → archive 拒签 + stderr 提示 `forge ack propose --action ack-rerun-warning --finding <hash>`;有 ack → 通过;finding 不写回 marker(避免破坏 freeze 不变性);retry archive 时 hash 重算复查 ack-log 实现 ack 闭环
- **B2 不变量 11/12 freeze-time 拒签**:11/12 是 CRITICAL(沿 master spec §2.7.3),freeze-time 若 fence-ctx 检测失败 → exit 1 拒绝写 marker,提示用户先跑 `forge ack`;**仅 7(verify_invocations 计数)+ 10(env_hash 漂移)**作为 freeze-time WARNING 写 marker.verify_findings
- **B3 ack-log chain 全 JSONL 链 + evidence-helper projection 分离**:chain/tail/count 基于全 JSONL(每行计入,任何 kind);process_evidence 三数组 hash 基于 evidence-helper 子集 projection;append 时 prev_entry_hash 指文件最后一行任意 entry(沿 plan-9a 双 kind 协议)

**真 MAJOR 修复(4 项)**:
- **M1 --kind commander requiredOption**:omit 时 commander 自动 exit 1 + stderr;--marker 与 --kind 派生路径不一致时以 --marker 为准但 stderr WARNING
- **M2 finding_hash dedup**:沿 plan-9d Task 6 schema `canonicalHash({invariant, severity, message_template, task_ref})`,freeze-time 和 rerun-time 同一不变量同 hash → 步骤 3.6/3.9 dedup
- **M3 ack-log tail/count 边界**:空文件 → tail=null/count=0;空行跳过;坏 JSON 行 → fence CRITICAL "ack-log corrupted at line N";count 非负整数
- **M4 master spec §2.7.2 同步项**:v7/v8 新增 marker 字段(`process_evidence_staging_hash` / `ack_log_tail_hash` / `ack_log_entry_count`)未在 master spec §2.7.2 字面体现,**待 9g writing-plans 阶段同步修订**(加注 v1.0 实施时三字段为 superset additive)

**真 MINOR 修复(2 项)**:
- **MIN-1 master plan 全文同步**:line 30(已二轮修)+ line 118-120(关键路径 P50 25 → 26 / P90 33 → 35)+ line 324(§3.7 标题 P50 7→8/P90 9→11)+ line 471(Interface Freeze 13→14)
- **MIN-2 五源标题**:§5.1 标题"四源 → 五源",反伪造矩阵加 ack-log tail+count 列

**未修(留 writing-plans)**:
- 沿 §13 v7 留项:SUG1 schema 测试断言、SUG2 rerun-time WARNING 临时 finding schema(已在 v8 B1 修复中走 ack-log 模式覆盖)

**v11 已直接修订 master spec 项目**(沿 Codex 五~八轮 修复):
1. §2.7.6 行 1280-1282 helper 表格:接收完整字段,不自跑测试(v10 已修)
2. §2.7.6 行 1286-1289 "为什么 CLI helper" 段:helper 是 ground truth 写入路径 + worktree 重跑放 archive(v10 已修)
3. §2.7.8 行 1314 / 1329 / 1340 / 1343 数字残留 13→14 / 7→8 attack(v10 已修)
4. §2.7.8 行 1316-1319 实施清单:helper options 完整列 + freeze CLI 子命令(v10 已修)
5. §3.3.2 enforcement matrix 行 1688:14 不变量 + green↞HEAD + ack-log 链 + WARNING 流转两段(v11 已修)
6. §2.7.3 不变量表行 1189 加第 14 行:green↞HEAD ancestor(v12 本次修,Codex 八轮 M-2)

**待 9g writing-plans 阶段同步的 master spec 修订项**(已收敛到 1 项):
- §2.7.2 schema 加 marker 三新字段(staging_hash + ack_log_tail_hash + ack_log_entry_count)— 沿 plan-9c/9d/9j superset additive 模式,writing-plans 实施 marker schema 时同步

---

## 13. Codex 二轮审查修复摘要(v7 修订,本节供三轮审查 cross-check 用)

**真 BLOCKER 修复(2 项,Codex 二轮 BLOCKER-3 + BLOCKER-4)**:
- **B3 WARNING 时序闭合**(v8 一版 → v9 简化):freeze-time **只**写不变量 7/10 到 marker.verify_findings(11/12 是 CRITICAL freeze 时直接 exit 1);rerun-time WARNING(仅不变量 13 在 sample/hash-only 模式)**隐含被 ack-mode 覆盖**(沿 §5 数据流 v9 修订),stderr 输出不阻断 — 无独立 ack 协议
- **B4 freeze --kind 必填**:命令签名改为 `forge evidence freeze <changeId> --kind <verify|review>`,无默认值避免歧义;marker 路径由 --kind 派生(.verify-passed / .review-passed)

**真 MAJOR 修复(3 项,Codex 二轮 MAJOR-1/-2/-3)**:
- **M1 master plan line 30 同步**:本次直接修订 `docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` line 30 — 不变量 13 → 14,依赖加 9i,P50 7→8 / P90 9→11,§0 总计 P50 39.5→40.5 / P90 52.5→54.5
- **M2 helper 自跑 vs 接收字段语义**:brainstorm spec 显式说明 v6/v7 选"接收字段"路径(沿 plan-9a 骨架),master spec §2.7.6 行 1280 "helper 自跑"字面待 9g writing-plans 阶段同步修订(加注 v1.0 实施时改为接收字段)
- **M3 ack-log 尾 + 行数固化**:marker 加 `ack_log_tail_hash?: string` + `ack_log_entry_count?: number` 字段;freeze 时固化;archive 不变量 9 三重校验(链内自洽 + 尾 hash + 行数);挡"改最后一行"(链内挡不住但尾 hash 挡)+ "重写整链"(链内自洽但行数大概率不匹配)

**真 MINOR 修复(2 项)**:
- **MIN1 .yaml 后缀清理**:全文 `.verify-passed.yaml` / `.review-passed.yaml` → `.verify-passed` / `.review-passed`(沿 archive.ts:271 真实文件名)
- **MIN2 archive-summary 13 → 14 同步**:§2.2.2 加新条目 — `src/core/schemas/archive-summary.ts:33/133` 行 ProcessEvidenceSummary 字段统计 13 → 14

**伪 BLOCKER 澄清(2 项,Codex 二轮 BLOCKER-1/-2)**:
- 本文档是 brainstorm spec 设计文档,描述 plan-9g writing-plans → 实施阶段的目标。Codex 二轮指出"v6 修复在代码库中未落地"是认知错位 — brainstorm 阶段当然没改代码。§0.0 文档状态声明明示此区分,避免后续审查再误判

**未修(留 writing-plans)**:
- **SUG1 schema 测试断言**:实施 src/core/schemas/process-evidence.ts 时加 unit test,断言 GREEN 不含 expected_failures + RED/GREEN 用各自字段名;沿 §8.2 测试矩阵列入
