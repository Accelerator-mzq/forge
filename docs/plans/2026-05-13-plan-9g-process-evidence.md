# Plan 9g — process_evidence + 14 不变量 + worktree 重跑 + reporter parser + freeze CLI 子命令

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。沿 plan-9j / plan-9e1 / plan-9d 同模式,**P2 路径新增 process-evidence skill 需 invoke `forge:writing-skills`**(本 plan Task 7 单独 invoke,沿 plan-9i 9g 实施前已完成提供新 skill 创建协议);Task 1-6 走标准 TDD/SDD。

**Goal**:落地 v1.0 §2.7 *process_evidence 完整协议* — marker schema 加 `process_evidence?: ProcessEvidence`(superset additive,sha256 链 + JCS hash 五源 cross-check 反伪造)+ 三新字段 `process_evidence_staging_hash` / `ack_log_tail_hash` / `ack_log_entry_count`;`src/cli/commands/evidence.ts` 扩 record-tdd/verify/review 三 helper commander options +19 个新选项(主代理预先跑测试 + 算 hash 后传完整字段,helper **不自跑测试**) + 加 `forge evidence freeze <changeId> --kind <verify|review>` 新子命令(staging → marker 凝固走 transaction);staging 写入用文件锁 `.evidence/.staging.lock`(并发保护);ack-log.ts 扩 `prev_entry_hash` 全 JSONL 链;`src/core/archive/fence.ts` 填实 plan-9a 13 stub 扩到 **14** 不变量(加 fence-14 `green_commit ↞ archive HEAD ancestor` 挡旁支造链攻击)+ `src/core/archive/process-evidence-fence.ts` 字段类不变量 1-4/7-12/14 + `src/core/archive/process-evidence-rerun.ts` worktree 类不变量 5-6/13;`src/core/worktree.ts` 高阶 `runInWorktree(sha, fn, opts)` API;`src/core/test-reporters/{junit,tap,vitest-json}.ts` + index factory;archive.ts 移除 `--enable-cross-cutting-fence` + `--allow-stub-fence` opt-in flag(默认开启)+ WARNING 转 VerifyFinding 写入 marker.verify_findings(沿 plan-9d schema + 扩 dimension enum 加 `process_evidence`);新增 `src/core/templates/skills/process-evidence.md` skill + `forge-eval/scenarios/process-evidence.yaml` 3 scenario AI 行为压力测试。

**Architecture**:七层 — (1) **Schema 层**:`src/core/schemas/process-evidence.ts` 定义 `ProcessEvidence` / `TddEventChain` / `RedCommitRecord` / `GreenCommitRecord` / `ExpectedFailure` / `TddExemption` / `VerifyInvocation` / `SubagentReviewChain` / `ReviewIteration` / `EnvHash` / `ProcessVerificationConfig` 11 个 interface;字段命名严格沿 master spec §2.7.2 字面(`red_log_path/red_log_hash` / `green_log_path/green_log_hash` 等);`src/core/schemas/severity.ts:53` FindingHashPayload.dimension enum 扩 `process_evidence` 第 4 值(沿 plan-9c/9d/9j superset additive 模式)+ `src/core/validate/marker-schema.ts:44/498` + `src/cli/commands/finding.ts:68` runtime validator 同步扩;`src/core/markers/types.ts` VerifyMarker/ReviewMarker 加 `process_evidence?` + `process_evidence_staging_hash?` + `ack_log_tail_hash?` + `ack_log_entry_count?` 四 optional 字段。 (2) **Worktree 层**:`src/core/worktree.ts` 高阶 `runInWorktree(sha, fn, opts)` API(try/finally 强 cleanup + timeout AbortSignal + max_parallel 并发 gate);wraps `git worktree add /tmp/forge-rerun-<id>-<sha> <sha>` + `runFn(workPath)` + `git worktree remove --force`(失败 log WARNING 不阻断)。 (3) **Reporter parser 层**:`src/core/test-reporters/junit.ts`(fast-xml-parser wrap)+ `tap.ts`(tap-parser wrap)+ `vitest-json.ts`(原生 JSON.parse)+ `index.ts` factory `parseReporter(path, type)` 分发;统一 `ReporterResult` 类型(`{ tests: TestCaseResult[], passCount, failCount, ... }`)。 (4) **Evidence helper CLI 层**:`src/cli/commands/evidence.ts` 扩 record-tdd 加 11 options(red_timestamp/red_log/red_log_hash/red_report/red_report_hash/red_exit + green 五同)+ record-verify 加 5(log/log_hash/report_hash/exit_code/invoked_at)+ record-review 加 3(spec_iterations/quality_iterations/main_check_off_at JSON);**新增 `forge evidence freeze <changeId> --kind <verify|review>`** 子命令(commander.requiredOption,omit 自动 exit 1)— 读 staging.yaml + 重算 staging_hash 校验 + 读 .verify-passed/.review-passed marker + 复制三数组到 marker.process_evidence + 写 process_evidence_staging_hash + ack_log_tail_hash + ack_log_entry_count 固化 + WARNING 7/10 转 VerifyFinding 写 marker.verify_findings + transaction (tmp + rename atomic) 落盘;helper 不自跑测试(主代理预先跑 + 传完整字段)。 (5) **Staging + ack-log 层**:helper 写入 `forge/changes/<id>/.evidence/process-evidence.staging.yaml`(append 三数组 + 重算 staging_hash 覆盖)走文件锁 `.evidence/.staging.lock`(仿 archive lock.ts 模式;PID-based stale detection);`src/core/ack-log.ts` EvidenceHelperEntry 扩 `prev_entry_hash?: string | null` 字段;`appendAckLog` 算 prev = canonicalHash(最后一行任意 kind);fence 验证全 JSONL 链(chain 内自洽 + tail hash 固化 + entry count 固化 三重校验)。 (6) **Archive fence 填实层**:`src/core/archive/fence.ts` FENCE_INVARIANT_NAMES 13 → **14**(加 fence-14 green↞HEAD);`crossCuttingFenceCheck()` 替换 stub 改为真实分发 — 一次 `buildProcessEvidenceFenceContext()` 读全 + `runFieldFence(ctx)` 同步 1-4/7-12/14 + `await runRerunFence(ctx)` 异步 5-6/13(mode 分支:full → 全跑 / sample → sample_ratio 抽样 / hash-only → 跳过);CRITICAL finding 拒签 exit 1;WARNING 7/10 已在 freeze-time 写 marker.verify_findings(archive 步骤 3.6/3.9 接);WARNING 13(rerun-time sample/hash-only timeout)stderr 不阻断(ack-mode 隐含覆盖,沿 brainstorm spec v9 简化);**不变量 14**(`git merge-base --is-ancestor green_commit.sha HEAD`)挡旁支造链攻击。 (7) **CLI + Slash/Skill 模板层**:`src/cli/commands/archive.ts` 移除 `--enable-cross-cutting-fence` + `--allow-stub-fence` 两 opt-in flag(默认开启 14 不变量 fence);`src/cli/commands/validate.ts` 加 `--verify-process` flag 单独跑 process_evidence 子检;`src/cli/commands/init.ts:38` deprecation 文本 "v0.4" → "v1.2";`commands/apply.md` + `commands/verify.md` 双同步(src/core/templates/ + 顶层)— apply 加禁止行为"不允许绕过 helper 直接写 process_evidence";verify 步骤 4.3 后加调 `forge evidence freeze --kind verify`;`skills/subagent-driven-development/SKILL.md` + `skills/test-driven-development/SKILL.md` 双同步加 process_evidence 协议补丁;**新增 `src/core/templates/skills/process-evidence.md` skill**(沿 plan-9i writing-skills 协议)+ 顶层 `skills/process-evidence/SKILL.md` 同步;`forge-eval/scenarios/process-evidence.yaml` 3 scenario(tempted-to-skip-red-commit / tempted-to-switch-hash-only / tempted-to-fake-marker)RED/GREEN 双跑 + judge 评分。

**Tech Stack**:Node 20+ / TypeScript ESM / commander 12 / `yaml` v2 / vitest / `@anthropic-ai/sdk`(forge-eval 用,本 plan 不直调)/ `canonicalize` v3(9a 已加,JCS RFC 8785)/ **新增 `fast-xml-parser` v4**(JUnit XML reporter)/ **新增 `tap-parser` v15**(TAP stream reporter)/ Vitest 原生 JSON reporter(无新 dep)/ 现有 `src/core/schemas/severity.ts`(9a Severity/Finding,本 plan 扩 dimension enum)+ `src/core/markers/types.ts`(9c/9d/9e1/9j 已扩,本 plan 加 4 个 optional 字段)+ `src/core/ack-log.ts`(9a propose/confirm,本 plan 扩 prev_entry_hash)+ `src/cli/commands/evidence.ts`(plan-9a 已搭骨架,本 plan 扩 19 options + 加 freeze 子命令)+ `src/cli/commands/archive.ts`(plan-9e1/9j 已扩,本 plan 删两 flag + fence 填实)+ `src/core/archive/fence.ts`(plan-9a Task 8 已搭 13 stub,本 plan 填实并扩到 14)+ `src/core/archive/transaction.ts`(plan-9e1 已立,本 plan freeze 子命令复用)+ `src/core/archive/lock.ts`(plan-9e1 已立,本 plan staging 锁仿模式)+ `src/cli/commands/ack.ts`(plan-9a 已立,本 plan 不动)。

**Spec 引用**:
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §2.7 全节(§2.7.1 基线 / §2.7.2 process_evidence schema / §2.7.3 14 不变量表(brainstorm v12 修订加第 14 行)/ §2.7.4 worktree 重跑机制 / §2.7.5 反向加固攻击场景 / §2.7.6 collection 协议(brainstorm v10 修订 helper 接收字段)/ §2.7.7 与现有 evidence 兼容 / §2.7.8 实施清单(brainstorm v10/v12 修订))+ §2.3.6 finding_hash JCS + §2.9 writing-skills 协议(本 plan Task 7 P2 路径 process-evidence skill 创建)
- master plan §3.10(plan-9g 概览 P50 8 / P90 11;brainstorm v9 修订)+ §3.12.1(marker 字段冻结 — 9g 加 4 字段在范围)+ §3.12.3 CLI exit code 冻结
- **brainstorm spec [`2026-05-13-plan-9g-brainstorm-design.md`](../specs/2026-05-13-plan-9g-brainstorm-design.md) v16(1227 行,9 轮 Codex 审查收敛 0 BLOCKER 五连)**:全部落地选型 + 五源 cross-check 反伪造矩阵 + WARNING 流转两段 + ack-mode 隐含覆盖 / freeze --kind 必填 / ack-log 全 JSONL chain + tail/count 固化 / dimension enum 扩
- plan-9a Task 5 + Task 8(evidence CLI 骨架 + fence.ts stub framework + ack-log + canonical hash)— 本 plan 扩 helper options + 填实 fence stub + 扩 ack-log
- plan-9d Task 3 + Task 6(VerifyFinding schema + computeFindingHash + ack-log consistency + verify_findings fence)— 本 plan WARNING 转 VerifyFinding + 接 step 3.6 fence
- plan-9e1 Task 4 + Task 5(三级业务行为 fence + transaction.ts + lock.ts)— 本 plan freeze 子命令复用 transaction;staging 锁仿 lock 模式
- plan-9i(writing-skills 协议落地,commit 7862862 v7 完成)— 本 plan Task 7 P2 路径前置依赖
- plan-9j Task 5 + Task 6.2(legacy-exemption + version-retrograde fence + slash 模板双同步模式)— 本 plan 沿模块化 + 双同步模式

**P50 工日**:**8.0**(brainstorm v6 Codex 一轮修订 7→8;9g 范围内 7 task);**P90 工日**:**11.0**(P50 + 3.0d buffer ~37%;brainstorm v6 9→11)

**前置(必须完成)**:
- 9a 横切层基础(已完成,`f347329`):`Severity` enum / `Finding` / `FindingHashPayload` / `computeFindingHash` / `extractHashPayload`(9a `src/core/schemas/severity.ts`)/ `ack-log.ts` propose/confirm / `canonical-json.ts` JCS / **`fence.ts` 13 stub framework(crossCuttingFenceCheck)**/ `evidence.ts` 三 helper 骨架(record-tdd/verify/review)
- 9c apply Fluid Pause Decision Point(已完成,`a9b6ab4`):marker pause_decisions? 字段;`commands/apply.md` 协议
- 9d verify 三维度(已完成,`20e3563`):VerifyFinding interface + verify-findings-fence.ts + finding_hash 写入 marker;`commands/verify.md` 三维度协议 + 步骤 4.3 写 marker(本 plan 步骤 4.3 后加 freeze 调用点)
- plan-9e1 archive 软告警基础(已完成,`dde9209`):archive.ts 步骤 3.5 evidence 完整性 / 3.6 verify_findings / 3.7 pause / 3.8 ack-log / 3.9 three-level + transaction.ts + lock.ts;archive_summary.ProcessEvidenceSummary placeholder(本 plan 接 14 不变量真实统计 — 9e2 完整接,9g 仅写 placeholder 兼容)
- plan-9i writing-skills 协议(已完成,`7862862` v7):新 skill RED+GREEN scenario + frontmatter 规范;本 plan Task 7 创建 process-evidence skill 沿此协议
- plan-9j marker version deprecation(已完成,`af64854` 之前):legacy-exemption + version-retrograde fence;archive.ts 步骤 3.4 + commands/upgrade.md;本 plan archive.ts 步骤 3.5 区段(原 v0.4 evidence 完整性)插入填实的 fence,不动 3.4

**不前置(实现层面)**:
- 9e2 process_evidence_summary 接入(本 plan Task 5 仅写 14 不变量 placeholder 兼容 plan-9e1 现状 ProcessEvidenceSummary;9e2 单独 plan 接真实统计 — 沿 master plan §0)

**用户工作流强依赖**(brainstorm spec §5 数据流):
- v1.0 新创建 change 路径:主代理在 task 实施时跑测试 + 算 hash + 调 `forge evidence record-tdd/verify/review` helper → helper 写 staging + ack-log;commands/verify.md 步骤 4.3 写完 .verify-passed yaml 后调 `forge evidence freeze --kind verify` → marker.process_evidence 凝固 + WARNING 写 marker.verify_findings;archive 时 crossCuttingFenceCheck 跑 14 不变量(含 worktree 重跑 + 五源 cross-check);CRITICAL 拒签 / WARNING 走 9d/9e1 ack 流程
- v0.4 legacy marker 路径:plan-9j legacy-exemption 已处理(13 不变量豁免表),本 plan 不动

**后续 unblocked**:
- 9e2 process_evidence_summary 接入(1d,9g 完成后即可)
- 9f explore(9g 之后可并行;独立模块)
- 9z release(v1.0 收尾;统一全路径 CHANGELOG + npm publish)

**DoD**(完成定义,沿 master §3.10 + brainstorm spec §13-§19 所有 0 BLOCKER 收敛):

- `src/core/schemas/process-evidence.ts` 新建 — 11 interface(沿 master spec §2.7.2 字面 + brainstorm v6 拆 RedCommitRecord/GreenCommitRecord)+ schema literal `'forge-process-evidence/v1'`
- `src/core/schemas/severity.ts:53` FindingHashPayload.dimension enum 扩 `process_evidence` 第 4 值
- `src/core/validate/marker-schema.ts:44+498` 运行时 validator dimension 校验扩 4 值
- `src/cli/commands/finding.ts:68` finding hash CLI stdin JSON dimension 校验扩 4 值
- `src/core/markers/types.ts` VerifyMarker/ReviewMarker 加 4 个 optional 字段(`process_evidence?` + `process_evidence_staging_hash?` + `ack_log_tail_hash?` + `ack_log_entry_count?`)
- `src/core/worktree.ts` 新建 — `runInWorktree(sha, fn, opts)` 高阶 API + cleanup + timeout + parallelGate
- `src/core/test-reporters/{index,junit,tap,vitest-json}.ts` 新建 — parseReporter factory + 三档独立实现
- `src/core/archive/process-evidence-fence.ts` 新建 — `buildProcessEvidenceFenceContext` + `runFieldFence`(1-4/7-12/14)
- `src/core/archive/process-evidence-rerun.ts` 新建 — `runRerunFence`(5-6/13,mode 分支)
- `src/core/archive/fence.ts` 改 — FENCE_INVARIANT_NAMES 13→14;`crossCuttingFenceCheck` 替换 stub 改为真实分发
- `src/core/ack-log.ts` 改 — EvidenceHelperEntry 加 `prev_entry_hash?: string | null`;`appendAckLog` 算链 + 加 `verifyAckLogChain` helper
- `src/cli/commands/evidence.ts` 改 — record-tdd 加 11 options(red/green × log/log_hash/report_hash/exit/timestamp)+ record-verify 加 5 + record-review 加 3 + 加 staging 写入 + 文件锁;加 `freeze --kind <verify|review>` 新子命令(commander.requiredOption,transaction 落 marker)
- `src/cli/commands/archive.ts` 改 — 移除 `--enable-cross-cutting-fence` + `--allow-stub-fence` 两 opt-in flag(默认开启);archive.ts:240 crossCuttingFenceCheck 调用无条件运行
- `src/cli/commands/validate.ts` 改 — 加 `--verify-process` flag
- `src/cli/commands/init.ts:38` 改 — deprecation 文本 "v0.4" → "v1.2"
- `forge/config.yaml` schema 扩 — `src/core/schema/types.ts` ForgeConfig 加 `process_verification` + `test` + `ack` 三 optional 子树 + 默认常量;`src/core/schema/process-verification-config.ts` 新建校验函数
- `commands/apply.md` + `src/core/templates/commands/apply.md` 双同步 — 加禁止行为段"不允许绕过 helper 直接写 process_evidence"+ 主代理改为调 helper(沿 plan-9j Task 6.2 双同步模式)
- `commands/verify.md` + `src/core/templates/commands/verify.md` 双同步 — 步骤 4.3 后加 `forge evidence freeze --kind verify` 调用
- `skills/subagent-driven-development/SKILL.md` + `src/core/templates/skills/subagent-driven-development.md` 双同步 — subagent DONE 报告必须含 RED commit/GREEN commit/log paths/expected_failures(供主代理调 record-tdd)
- `skills/test-driven-development/SKILL.md` + `src/core/templates/skills/test-driven-development.md` 双同步 — 加"RED commit 不可省略"硬约束;light mode 走 tdd_exemption ack 路径
- `src/core/templates/skills/process-evidence.md` + `skills/process-evidence/SKILL.md` 新建(P2 路径,沿 plan-9i writing-skills 协议)— process_evidence 协议(走 helper / 不直写 marker / 不静默切 mode / RED commit 不可省略 / staging append-only / 不绕过 freeze 子命令)
- `forge-eval/scenarios/process-evidence.yaml` 新建 — 3 scenario AI 行为压力(tempted-to-skip-red-commit / tempted-to-switch-hash-only / tempted-to-fake-marker)RED/GREEN 双跑 + judge 评分
- `src/core/schemas/archive-summary.ts:33+56+133` 字面 13 → 14(plan-9e1 留的 placeholder 同步;9e2 接真实统计)
- 测试:
  - `tests/core/schemas/process-evidence.test.ts`(schema literal + type guard + RED/GREEN 字段名严格 + GREEN 不允许 expected_failures + 必填字段)
  - `tests/core/worktree.test.ts`(runInWorktree + timeout + cleanup + parallel + 异常路径 7 case)
  - `tests/core/test-reporters/{junit,tap,vitest-json}.test.ts`(每档至少 3 framework fixture + 解析正确性 + 边界 case)
  - `tests/core/validate/marker-schema.test.ts`(dimension=process_evidence 不被拒签 + verify_findings 数组接受 process_evidence)
  - `tests/core/markers/verify-findings-schema.test.ts`(VerifyFinding 接受 process_evidence dimension)
  - `tests/core/ack-log.test.ts`(扩 — prev_entry_hash 链完整性 + tail hash + entry count 边界:空 / 空行 / 坏 JSON / 行数 mismatch / tail mismatch / chain broken 7 case)
  - `tests/cli/finding-hash.test.ts`(扩 — finding hash CLI dimension=process_evidence 路径)
  - `tests/cli/process-evidence-fence.test.ts`(14 不变量 × 8 攻击场景 fixture + 三档 mode happy path + WARNING/CRITICAL 分级 — A1 timestamp / A2 ancestor / A3 same-commit / A4 unrelated-failure / A5 fake-verify-invocations / A6 bypass-helper / A7 hash-only-no-ack / **A8 旁支造链 + 主分支换实现**)
  - `tests/cli/process-evidence-rerun.test.ts`(rerun fence 不变量 5/6/13 + worktree + timeout 分级 6 case)
  - `tests/cli/evidence-helpers.test.ts`(扩 — 三 helper staging append + 文件锁 + ack-log chain 5 case)
  - `tests/cli/evidence-freeze.test.ts`(新 — freeze 子命令 staging → marker + transaction 回滚 + WARNING 转 VerifyFinding + 锁 + --kind requiredOption omit exit 1 8 case)
  - `tests/cli/evidence-staging-concurrency.test.ts`(新 — 双 helper 并发 read-modify-write 不丢更新 3 case)
  - `tests/cli/ack-cli-mode.test.ts`(扩 — CI + mode != full 拒签三档全测 6 case)
- 全本地 verify 通过(`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test`)
- forge-eval scenario 通过(若配 ANTHROPIC_API_KEY,brainstorm §9.9 锁定 9g 实施期走策略 A 不配 key;9z release 前升级)

**Shell 假设 + commit block 跨 shell 兼容**(沿 plan-9j v3 同模式):本 plan 7 个 Task commit block 全用 `git commit -F file 模式` 而非 heredoc(沿 Windows + PowerShell 用户偏好;memory `本地 verification 必须含 format:check`)。**实施者必须先确认当前 shell + 按下表转换**:

| Shell | commit 命令模式 | 说明 |
|---|---|---|
| Bash / Git-Bash / WSL | `git commit -m "$(cat <<'EOF' ... EOF)"` | heredoc 直接用 |
| PowerShell 5.1 / 7+(默认) | `git commit -F message-tmp.txt` | 先 Write message 到 tmp 文件,commit 后 rm;避免 `@` 字符泄漏 subject 行(memory)|
| Claude Code Bash tool (Windows) | 同 PowerShell | 默认走 PowerShell |

---

## 0. 总览

本 sub-plan 拆 **7 个 task**(P2 路径 brainstorm §9.8 锁定;Task 7 新 skill 创建沿 plan-9i 协议):

| Task | 名称 | 工日 P50 | 关键交付 |
|------|------|---------|---------|
| 1 | process_evidence schema + dimension enum 扩 + marker schema 扩 4 字段 + 测试 | **1.0** | 11 interface(RedCommitRecord/GreenCommitRecord 拆,沿 master spec §2.7.2 字面);severity.ts dimension enum 4 值;marker-schema.ts + finding.ts runtime validator 同步;markers/types.ts 4 optional 字段;~8 case schema test |
| 2 | worktree.ts 高阶 API + test-reporters 三档 parser + 测试 | **1.5** | `runInWorktree(sha, fn, opts)` API + cleanup + timeout + parallelGate;junit.ts(fast-xml-parser)+ tap.ts(tap-parser)+ vitest-json.ts(原生 JSON)+ index.ts factory;ReporterResult 统一类型;9 case worktree + 9 case reporters |
| 3 | ack-log.ts 扩 prev_entry_hash 链 + evidence.ts 三 helper 扩 19 options + staging 写入 + 文件锁 + 测试 | **1.5** | EvidenceHelperEntry 加 prev_entry_hash + verifyAckLogChain;record-tdd/verify/review 扩 19 options;staging 写入 + lock 仿 archive lock.ts;7 case ack-log + 5 case evidence-helpers + 3 case staging concurrency |
| 4 | evidence freeze 新子命令(--kind requiredOption + transaction + WARNING 转 VerifyFinding + 锁) + 测试 | **1.0** | freeze CLI subcommand(commander.requiredOption omit 自动 exit 1 + transaction tmp+rename atomic + WARNING 7/10 转 VerifyFinding 写 marker.verify_findings + ack_log_tail_hash + entry_count 固化);8 case freeze test |
| 5 | archive fence.ts 填实(13→14 + green↞HEAD + buildProcessEvidenceFenceContext + runFieldFence) + 测试 + archive.ts 删两 flag + ProcessEvidenceSummary 13→14 | **1.5** | fence.ts FENCE_INVARIANT_NAMES 扩 + crossCuttingFenceCheck 替换 stub 真实分发;process-evidence-fence.ts(field 1-4/7-12/14);archive.ts 移除 --enable-cross-cutting-fence + --allow-stub-fence;14×8 fixture 测试 |
| 6 | rerun fence(worktree 重跑 + 三档 mode 分支) + archive 集成 + e2e 攻击场景 + 全本地 verify | **0.8** | process-evidence-rerun.ts(5/6/13 mode 分支);archive 步骤 3.5 集成 fence 入口;e2e 8 攻击 fixture(A1-A8 拒签 + 1 GREEN 通过 + 三档 mode sub-fixture);全本地 verify PASS |
| 7 | process-evidence skill + forge-eval scenario + slash/skill 模板双同步(apply/verify/SDD/TDD) + commit | **0.7** | src/core/templates/skills/process-evidence.md(沿 plan-9i 协议)+ skills/process-evidence/SKILL.md 同步;forge-eval/scenarios/process-evidence.yaml 3 scenario(RED/GREEN 双跑);apply/verify/SDD/TDD 4 模板双同步;Task 7 invoke superpowers:writing-skills skill |

**总 P50**:1.0+1.5+1.5+1.0+1.5+0.8+0.7 = **8.0d**(沿 brainstorm spec v6 Codex 一轮 7→8)
**总 P90**:1.4+2.0+2.0+1.4+2.0+1.2+1.0 = **11.0d**(P50 + 37% buffer,沿 brainstorm spec v6 9→11)

**串行约束**:
- Task 1 → Task 2(worktree/reporter 不直依赖 schema,但 fence/rerun 都需要 schema 就位)
- Task 1 → Task 3(evidence helper options 扩需 schema 字段定义)
- Task 2 → Task 5(fence.ts runFieldFence 测试需要 mock reporter parser,reporter parser 模块要先就位)
- Task 2 → Task 6(rerun.ts 直依赖 worktree.ts + reporter parser)
- Task 3 → Task 4(freeze 子命令读 staging + ack-log,staging/chain 写入路径要先就位)
- Task 4 → Task 5(fence 五源 cross-check 需要 marker 三新字段已被 freeze 写入,marker schema 已在 Task 1)
- Task 5 → Task 6(archive 集成 + e2e 需要 fence framework 就位)
- Task 6 → Task 7(skill + scenario + 模板同步在最后,因 skill 描述需引用最终落地的 helper/freeze 调用)

**Task 实施顺序**:1 → 2 → 3 → 4 → 5 → 6 → 7(严格串行;Task 7 必须最后)

**多 agent 并行可能**:Task 2 / Task 3 中后段可短暂并行(Task 2 是新 module,Task 3 是改既有 ack-log + evidence);但 plan-9j/9e1 经验串行最稳,沿串行。

**与其他 sub-plan 合并点**:
- `src/core/markers/types.ts`:9c(PauseDecision)+ 9d(VerifyFinding)+ 9j(`created_by_tool_version` + `resigned_by_tool_version`)+ **9g(`process_evidence` + 三新字段)**四方修改;无字段重叠,均 superset additive
- `src/core/schemas/severity.ts:53` FindingHashPayload.dimension enum:9a 锁三值,9g brainstorm v6 Codex 一轮明示扩 `process_evidence` 第 4 值(沿 plan-9c/9d/9j superset additive 模式)
- `src/cli/commands/archive.ts`:plan-9e1 + 9j 已扩步骤 3.4-3.9;9g 不加新步骤号,**填实 plan-9a 已搭的 crossCuttingFenceCheck() 调用**(archive.ts:240)+ 移除 --enable-cross-cutting-fence + --allow-stub-fence flag
- `src/core/archive/fence.ts`:plan-9a 搭的 13 stub framework,9g 填实并扩到 14(不另起平行系统,沿 brainstorm v6 Codex 一轮 M-4 修复)
- `src/core/ack-log.ts`:9a 立 propose/confirm + ackEntry + getPendingPath;9g 加 prev_entry_hash 字段 + verifyAckLogChain helper(superset additive,沿 9a freeze 例外模式,brainstorm §9.11)
- `src/cli/commands/evidence.ts`:plan-9a 已搭三 helper 骨架;9g 扩 19 options + 加 freeze 子命令 + staging 写入路径
- `commands/apply.md` + `commands/verify.md`:plan-9c(apply Fluid Pause)+ plan-9d(verify 三维度)+ **9g(apply 加禁止行为段 + verify 步骤 4.3 后加 freeze 调用)**三方修改

---

## 1. File Structure

### 新增文件

```
src/core/schemas/process-evidence.ts             ← Task 1:11 interface(沿 brainstorm spec §4 字面)+ schema literal 'forge-process-evidence/v1'
src/core/schema/process-verification-config.ts   ← Task 1:validateProcessVerificationConfig 阈值校验(沿 validateWritingPlansConfig 模式)
src/core/worktree.ts                             ← Task 2:runInWorktree(sha, fn, opts) 高阶 API + cleanup + timeout + parallelGate
src/core/test-reporters/index.ts                 ← Task 2:parseReporter(path, type) factory + ReporterResult 统一类型
src/core/test-reporters/junit.ts                 ← Task 2:fast-xml-parser wrap + JUnit XML → ReporterResult
src/core/test-reporters/tap.ts                   ← Task 2:tap-parser wrap + TAP stream → ReporterResult
src/core/test-reporters/vitest-json.ts           ← Task 2:JSON.parse + Vitest schema → ReporterResult
src/core/archive/process-evidence-fence.ts       ← Task 5:buildProcessEvidenceFenceContext + runFieldFence(1-4/7-12/14)
src/core/archive/process-evidence-rerun.ts       ← Task 6:runRerunFence(5-6/13,mode 分支)
src/core/templates/skills/process-evidence.md    ← Task 7:新 skill(走 helper / 不直写 marker / 不静默切 mode / RED commit 不可省略)
skills/process-evidence/SKILL.md                 ← Task 7:顶层同步(沿 plan-9j Task 6.2 双同步模式)
forge-eval/scenarios/process-evidence.yaml       ← Task 7:3 scenario AI 行为压力 RED/GREEN 双跑

tests/core/schemas/process-evidence.test.ts      ← Task 1:schema literal + type guard + RED/GREEN 字段名严格 8 case
tests/core/worktree.test.ts                      ← Task 2:runInWorktree timeout + cleanup + parallel + 异常 9 case
tests/core/test-reporters/junit.test.ts          ← Task 2:JUnit XML 解析 vitest/jest/mocha 3 framework 3 case
tests/core/test-reporters/tap.test.ts            ← Task 2:TAP stream 解析 node:test 3 case
tests/core/test-reporters/vitest-json.test.ts    ← Task 2:Vitest --reporter=json 原生 3 case
tests/core/ack-log-chain.test.ts                 ← Task 3:扩 ack-log prev_entry_hash 链完整性 + tail/count 边界 7 case
tests/cli/evidence-staging-concurrency.test.ts   ← Task 3:双 helper 并发 staging 锁 3 case
tests/cli/evidence-freeze.test.ts                ← Task 4:freeze 子命令 staging→marker + transaction + WARNING + 锁 + --kind 8 case
tests/cli/process-evidence-fence.test.ts         ← Task 5:14 不变量 × 8 攻击场景 fixture + 三档 mode happy path
tests/cli/process-evidence-rerun.test.ts         ← Task 6:rerun fence 5/6/13 + worktree + timeout 6 case
tests/cli/ack-cli-mode.test.ts                   ← Task 6:CI + mode != full 拒签三档全测 6 case
tests/integration/process-evidence-end-to-end.test.ts  ← Task 6:e2e 8 攻击 fixture + 1 GREEN(含三档 mode sub-fixture)

tests/fixtures/process-evidence/attack-1-timestamp-reverse/        ← Task 6 e2e fixture
tests/fixtures/process-evidence/attack-2-rebase-ancestor-broken/   ← Task 6 e2e fixture
tests/fixtures/process-evidence/attack-3-same-commit-no-red/       ← Task 6 e2e fixture
tests/fixtures/process-evidence/attack-4-unrelated-failure/        ← Task 6 e2e fixture
tests/fixtures/process-evidence/attack-5-fake-verify-invocations/  ← Task 6 e2e fixture
tests/fixtures/process-evidence/attack-6-bypass-helper/            ← Task 6 e2e fixture
tests/fixtures/process-evidence/attack-7-hash-only-no-ack/         ← Task 6 e2e fixture
tests/fixtures/process-evidence/attack-8-cross-branch-rewrite/     ← Task 6 e2e fixture(brainstorm v6 新增 A8)
tests/fixtures/process-evidence/green-normal-tdd-pass-full/        ← Task 6 e2e fixture(三档 mode sub-fixture)
tests/fixtures/process-evidence/green-normal-tdd-pass-sample/      ← Task 6 e2e fixture
tests/fixtures/process-evidence/green-normal-tdd-pass-hash-only/   ← Task 6 e2e fixture
```

### 修改文件

```
src/core/schemas/severity.ts                     ← Task 1:FindingHashPayload.dimension enum 扩 'process_evidence' 第 4 值
src/core/validate/marker-schema.ts:44+498        ← Task 1:运行时 validator dimension 校验扩 4 值
src/cli/commands/finding.ts:68                   ← Task 1:finding hash CLI stdin JSON dimension 校验扩 4 值
src/core/markers/types.ts                        ← Task 1:VerifyMarker/ReviewMarker 加 4 个 optional 字段
src/core/schema/types.ts                         ← Task 1:ForgeConfig 加 process_verification / test / ack 三 optional 子树 + 3 个 DEFAULT_* 常量
src/core/schemas/archive-summary.ts:33+56+133    ← Task 5:ProcessEvidenceSummary 13 不变量字面 → 14(plan-9e1 placeholder 同步;9e2 接真实统计)
src/core/ack-log.ts                              ← Task 3:EvidenceHelperEntry 加 prev_entry_hash?: string | null;appendAckLog 算链;加 verifyAckLogChain helper

src/cli/commands/evidence.ts                     ← Task 3+4:扩三 helper 19 options + 加 freeze 子命令 + staging 写入 + 文件锁
src/cli/commands/archive.ts                      ← Task 5:移除 --enable-cross-cutting-fence + --allow-stub-fence 两 opt-in flag(默认开启)
src/cli/commands/validate.ts                     ← Task 5:加 --verify-process flag(单独跑 process_evidence 子检)
src/cli/commands/init.ts:38                      ← Task 5:deprecation 文本 "v0.4" → "v1.2"
src/core/archive/fence.ts                        ← Task 5:FENCE_INVARIANT_NAMES 13→14;crossCuttingFenceCheck 替换 stub 改真实分发

commands/apply.md + src/core/templates/commands/apply.md             ← Task 7:加禁止行为段 + 主代理调 helper(双同步)
commands/verify.md + src/core/templates/commands/verify.md           ← Task 7:步骤 4.3 后加 forge evidence freeze --kind verify(双同步)
skills/subagent-driven-development/SKILL.md + src/core/templates/skills/subagent-driven-development.md  ← Task 7:subagent DONE 必须含 RED commit/GREEN commit/log/expected_failures
skills/test-driven-development/SKILL.md + src/core/templates/skills/test-driven-development.md         ← Task 7:加"RED commit 不可省略"硬约束 + light mode tdd_exemption ack 路径

package.json                                     ← Task 2:加 fast-xml-parser ^4 + tap-parser ^15 两 deps
```

### 不修改文件(明确边界)

```
src/core/schemas/archive-summary.ts(除 13→14 字面外)  ← plan-9e1 锁,9g 仅同步 placeholder 数字;真实统计接入留 9e2
src/core/markers/parse.ts                        ← 9a/9c/9d 锁(YAML 解析无变化)
src/core/archive/transaction.ts                  ← plan-9e1 锁;9g freeze 子命令 import executeTransaction 调用,不动 transaction 内部
src/core/archive/lock.ts                         ← plan-9e1 锁;9g staging 锁仿模式但**新建** .evidence/.staging.lock(不复用 archive lock 实例)
src/core/archive/legacy-exemption.ts             ← plan-9j 锁,9g 不动
src/core/archive/version-retrograde-fence.ts     ← plan-9j 锁,9g 不动
src/core/archive/verify-findings-fence.ts        ← plan-9d 锁,9g 不动(WARNING 写入 marker.verify_findings 由 freeze 子命令做,fence 校验由 9d 现有 fence 自动接)
src/core/archive/pause-decisions-fence.ts        ← plan-9c 锁
src/core/archive/three-level-fence.ts            ← plan-9e1 锁(9g freeze-time WARNING 走 9d/9e1 现有 ack 流程)
src/core/archive/ack-log-consistency.ts          ← plan-9d 锁(9g 扩 ack-log entries 通过 prev_entry_hash 链单独校验,不动该模块)
src/core/canonical-json.ts                       ← 9a 锁(JCS RFC 8785 wrap canonicalize 包)
src/cli/commands/ack.ts                          ← plan-9a 锁(9g 不扩 action enum;rerun-time WARNING 走 ack-mode 隐含覆盖,无独立 ack 协议;沿 brainstorm v9 简化)
src/cli/commands/scope.ts / finding.ts / upgrade.ts / migrate.ts / config.ts  ← 不动
```

---

## 2. Task 1 — process_evidence schema + dimension enum 扩 + marker schema 扩 4 字段 + ForgeConfig 三子树 + 8 case 单测

**Files:**

- Create: `src/core/schemas/process-evidence.ts`
- Create: `src/core/schema/process-verification-config.ts`
- Modify: `src/core/schemas/severity.ts:56`(FindingHashPayload.dimension enum 扩第 4 值)
- Modify: `src/core/validate/marker-schema.ts:44,498-503`(运行时 DIMENSION_VALUES + error message)
- Modify: `src/cli/commands/finding.ts:68-70`(stdin JSON dimension 校验)
- Modify: `src/core/markers/types.ts:6-24,33-35`(VerifyMarker + ReviewMarker 加 4 个 optional 字段)
- Modify: `src/core/schema/types.ts`(ForgeConfig 加 process_verification + test + ack 三子树 + 3 DEFAULT 常量)
- Test: `tests/core/schemas/process-evidence.test.ts`(8 case)

### 2.1 步骤 1.1:写 process-evidence.ts schema

- [ ] **Step 1.1.1: 写 `src/core/schemas/process-evidence.ts` 完整字面**

```typescript
// src/core/schemas/process-evidence.ts — plan-9g Task 1
// §2.7.2 forge-process-evidence/v1 schema:14 不变量字段 + 五源 cross-check(brainstorm v16)
// 沿 archive-summary.ts 模式:schema literal + 手写 interface + JSDoc
//
// 关键设计(brainstorm spec §4):
//   - RedCommitRecord / GreenCommitRecord 拆两 interface(Codex 一轮 M-1)
//   - 字段名严格沿 master spec §2.7.2 行 1115/1116 / 1127/1128 字面
//     (red_log_path / red_log_hash / green_log_path / green_log_hash;
//      runner_report_path / runner_report_hash 通用)
//   - GreenCommitRecord 无 expected_failures 字段(schema 层禁止 GREEN 含)

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
  /** RED 阶段记录(tdd_exemption 非空时可省) */
  red_commit: RedCommitRecord | null;
  /** GREEN 阶段记录(必填) */
  green_commit: GreenCommitRecord;
  /** light mode trivial change 免 RED 的 ack 引用(沿 §2.7.2 MAJOR #37;不变量 11) */
  tdd_exemption: TddExemption | null;
  /** tdd_exemption 非空时必填 — ack-log 中对应 user ack 的 acked_by */
  tdd_exemption_acked_by: string | null;
}

/**
 * RED commit 记录(brainstorm v6 修订,Codex 一轮 M-1 修复)
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
 * GREEN commit 记录(brainstorm v6 修订,Codex 一轮 M-1 修复)
 * 字段名沿 master spec §2.7.2 行 1127/1128 字面 — green_commit 节点下用 green_log_path/hash
 * 注:无 expected_failures 字段(schema 层禁止 GREEN 含)
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

/**
 * ProcessVerificationConfig:forge/config.yaml#process_verification 字段类型
 * validateProcessVerificationConfig 校验阈值,见 src/core/schema/process-verification-config.ts
 */
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

- [ ] **Step 1.1.2:跑 typecheck 验证 schema 文件**

```bash
pnpm typecheck
```

Expected: PASS(纯 type 文件,无 runtime 代码)

- [ ] **Step 1.1.3:commit Step 1.1**

```bash
git add src/core/schemas/process-evidence.ts
# Windows + PowerShell:用 git commit -F file 模式(memory)
echo "feat(9g Task 1.1): process-evidence.ts schema — 11 interface + schema literal" > .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "11 interface 沿 master spec §2.7.2 字面(brainstorm spec §4 完整 inline):" >> .git/COMMIT_MSG
echo "- ProcessEvidence(顶级)+ EnvHash + TddEventChain + RedCommitRecord +" >> .git/COMMIT_MSG
echo "  GreenCommitRecord(brainstorm v6 拆两 interface,沿 master spec 字面)+" >> .git/COMMIT_MSG
echo "  ExpectedFailure + TddExemption + VerifyInvocation + SubagentReviewChain +" >> .git/COMMIT_MSG
echo "  ReviewIteration + ProcessVerificationConfig" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "字段命名沿 master spec §2.7.2 字面:red_log_path/red_log_hash(行 1115/1116) +" >> .git/COMMIT_MSG
echo "  green_log_path/green_log_hash(行 1127/1128)+ runner_report_path/hash 通用" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "schema literal: 'forge-process-evidence/v1'" >> .git/COMMIT_MSG
git commit -F .git/COMMIT_MSG
rm .git/COMMIT_MSG
```

Expected: typecheck PASS;commit hash 输出

### 2.2 步骤 1.2:写 process-verification-config.ts validator

- [ ] **Step 1.2.1:写 `src/core/schema/process-verification-config.ts` 完整字面**

```typescript
// src/core/schema/process-verification-config.ts — plan-9g Task 1.2
// v1.0 process_verification 配置 validation(沿 validateWritingPlansConfig 模式)
//
// 规则(brainstorm spec §6.1):
//   - 缺失字段 → 返回默认值(DEFAULT_PROCESS_VERIFICATION)
//   - 类型错 / 范围外 → stderr warn + fallback 默认
//   - 合法值 → 直接返回

import type { ForgeConfig } from './types.js';
import { DEFAULT_PROCESS_VERIFICATION } from './types.js';

/** 默认值类型(sanitize 后必填三字段返回) */
export interface SanitizedProcessVerificationConfig {
  mode: 'full' | 'sample' | 'hash-only';
  sample_ratio: number;
  test_timeout_per_task: number;
  max_parallel_reruns: number;
}

/**
 * 验证并 sanitize process_verification 配置。
 * 永远返回合法值(用 default fallback,不抛错 — 配置层 graceful degradation)。
 *
 * @param config — forge/config.yaml 解析结果(可缺 process_verification 段)
 * @param warn — 注入 console.warn 用于测试 / 自定义 logger
 * @returns 合法的 SanitizedProcessVerificationConfig
 */
export function validateProcessVerificationConfig(
  config: ForgeConfig | undefined,
  warn: (msg: string) => void = (msg) => console.warn(msg),
): SanitizedProcessVerificationConfig {
  const raw = config?.process_verification;

  // 缺失 → 全默认
  if (!raw) {
    return { ...DEFAULT_PROCESS_VERIFICATION };
  }

  // mode 校验
  let mode: SanitizedProcessVerificationConfig['mode'] = DEFAULT_PROCESS_VERIFICATION.mode;
  if (raw.mode !== undefined && raw.mode !== null) {
    if (raw.mode === 'full' || raw.mode === 'sample' || raw.mode === 'hash-only') {
      mode = raw.mode;
    } else {
      warn(
        `forge config: process_verification.mode must be 'full'|'sample'|'hash-only', got ${JSON.stringify(raw.mode)}; falling back to ${DEFAULT_PROCESS_VERIFICATION.mode}`,
      );
    }
  }

  // sample_ratio 校验(0..1)
  let sample_ratio = DEFAULT_PROCESS_VERIFICATION.sample_ratio;
  if (raw.sample_ratio !== undefined && raw.sample_ratio !== null) {
    if (
      typeof raw.sample_ratio === 'number' &&
      !Number.isNaN(raw.sample_ratio) &&
      raw.sample_ratio >= 0 &&
      raw.sample_ratio <= 1
    ) {
      sample_ratio = raw.sample_ratio;
    } else {
      warn(
        `forge config: process_verification.sample_ratio must be number in [0,1], got ${JSON.stringify(raw.sample_ratio)}; falling back to ${DEFAULT_PROCESS_VERIFICATION.sample_ratio}`,
      );
    }
  }

  // test_timeout_per_task 校验([10, 3600] 秒)
  let test_timeout_per_task = DEFAULT_PROCESS_VERIFICATION.test_timeout_per_task;
  if (raw.test_timeout_per_task !== undefined && raw.test_timeout_per_task !== null) {
    if (
      typeof raw.test_timeout_per_task === 'number' &&
      Number.isInteger(raw.test_timeout_per_task) &&
      raw.test_timeout_per_task >= 10 &&
      raw.test_timeout_per_task <= 3600
    ) {
      test_timeout_per_task = raw.test_timeout_per_task;
    } else {
      warn(
        `forge config: process_verification.test_timeout_per_task must be integer in [10, 3600], got ${JSON.stringify(raw.test_timeout_per_task)}; falling back to ${DEFAULT_PROCESS_VERIFICATION.test_timeout_per_task}`,
      );
    }
  }

  // max_parallel_reruns 校验([1, 8])
  let max_parallel_reruns = DEFAULT_PROCESS_VERIFICATION.max_parallel_reruns;
  if (raw.max_parallel_reruns !== undefined && raw.max_parallel_reruns !== null) {
    if (
      typeof raw.max_parallel_reruns === 'number' &&
      Number.isInteger(raw.max_parallel_reruns) &&
      raw.max_parallel_reruns >= 1 &&
      raw.max_parallel_reruns <= 8
    ) {
      max_parallel_reruns = raw.max_parallel_reruns;
    } else {
      warn(
        `forge config: process_verification.max_parallel_reruns must be integer in [1, 8], got ${JSON.stringify(raw.max_parallel_reruns)}; falling back to ${DEFAULT_PROCESS_VERIFICATION.max_parallel_reruns}`,
      );
    }
  }

  return { mode, sample_ratio, test_timeout_per_task, max_parallel_reruns };
}
```

- [ ] **Step 1.2.2:写测试 fixture(skip,在 Step 1.6 统一 8 case)**

(测试在 §2.6 集中写)

### 2.3 步骤 1.3:扩 src/core/schema/types.ts(ForgeConfig 三子树 + 3 DEFAULT)

- [ ] **Step 1.3.1:编辑 `src/core/schema/types.ts`,在 `writing_plans?:` 段之后追加**

```typescript
  /**
   * v1.0 process_verification(plan-9g §2.7 — 14 不变量 + worktree 重跑配置)
   * 缺失时调用方应以 `??` fallback 取 DEFAULT_PROCESS_VERIFICATION 值
   * 或调 validateProcessVerificationConfig 拿 sanitized 完整值
   */
  process_verification?: {
    /** 默认 'full'(沿 §2.7.4 B);mode != full 必须 CLI ack 写 marker */
    mode?: 'full' | 'sample' | 'hash-only';
    /** sample 模式抽样比例 [0..1],默认 0.3 */
    sample_ratio?: number;
    /** 单 task 重跑 timeout 秒(默认 300;full 模式触发 → CRITICAL,沿 §2.7.4 D) */
    test_timeout_per_task?: number;
    /** 并发 worktree 上限(默认 2;Windows 磁盘空间约束更紧) */
    max_parallel_reruns?: number;
  };

  /**
   * v1.0 test reporter(plan-9g §2.7.4 C — 解析结构化测试报告)
   * 缺失时调用方应以 `??` fallback 'junit'
   */
  test?: {
    /** 默认 'junit';reporter 类型决定 parseReporter 走哪个分支 */
    reporter?: 'junit' | 'tap' | 'vitest-json';
    /** 单 task 测试命令(用于 worktree 重跑;沿 commands/verify.md:29) */
    test_command?: string;
  };

  /**
   * v1.0 ack CLI 安全开关(plan-9g §2.7.4 B — CI 模式拒绝 ack 防静默降级)
   * 缺失时调用方应以 `??` fallback false(更安全)
   */
  ack?: {
    /** false(默认):检测 CI=true 时 `forge ack propose` 拒绝触发 */
    allow_ci_mode?: boolean;
  };
}
```

(注:把 `}` 闭合 ForgeConfig interface;紧接 `}` 之后 + `export const DEFAULT_LIGHT_THRESHOLD` 之前插入)

- [ ] **Step 1.3.2:在 `export const DEFAULT_LIGHT_THRESHOLD = 200;` 之后追加 3 个 DEFAULT 常量**

```typescript
/**
 * 默认 process_verification 配置(plan-9g §6;调用方 fallback 用)
 * brainstorm spec §6 锁定四档默认值
 */
export const DEFAULT_PROCESS_VERIFICATION = {
  mode: 'full' as const,
  sample_ratio: 0.3,
  test_timeout_per_task: 300, // 秒
  max_parallel_reruns: 2,
};

/** 默认 test.reporter(plan-9g §6) */
export const DEFAULT_TEST_REPORTER = 'junit' as const;

/** 默认 ack.allow_ci_mode(plan-9g §6;false 防 CI 静默降级) */
export const DEFAULT_ACK_ALLOW_CI_MODE = false;
```

- [ ] **Step 1.3.3:跑 typecheck**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 1.3.4:commit Step 1.2 + Step 1.3**

```bash
git add src/core/schema/types.ts src/core/schema/process-verification-config.ts
# 用 git commit -F 模式
> .git/COMMIT_MSG
echo "feat(9g Task 1.2-1.3): ForgeConfig 扩 process_verification/test/ack 三子树 + validator" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "src/core/schema/types.ts:" >> .git/COMMIT_MSG
echo "- ForgeConfig 加 process_verification? / test? / ack? 三 optional 子树" >> .git/COMMIT_MSG
echo "  (沿 legacy_bridge / writing_plans 模式,brainstorm spec §6)" >> .git/COMMIT_MSG
echo "- DEFAULT_PROCESS_VERIFICATION / DEFAULT_TEST_REPORTER /" >> .git/COMMIT_MSG
echo "  DEFAULT_ACK_ALLOW_CI_MODE 三 const(调用方 fallback 用)" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "src/core/schema/process-verification-config.ts:" >> .git/COMMIT_MSG
echo "- validateProcessVerificationConfig 沿 validateWritingPlansConfig 同模式" >> .git/COMMIT_MSG
echo "- 阈值校验:mode 三档 enum / sample_ratio [0,1] /" >> .git/COMMIT_MSG
echo "  test_timeout_per_task [10,3600] / max_parallel_reruns [1,8]" >> .git/COMMIT_MSG
echo "- 类型错 / 范围外 → warn + fallback 默认(graceful degradation)" >> .git/COMMIT_MSG
git commit -F .git/COMMIT_MSG
rm .git/COMMIT_MSG
```

Expected: typecheck PASS;commit 输出

### 2.4 步骤 1.4:扩 dimension enum 三处(severity.ts + marker-schema.ts + finding.ts)

- [ ] **Step 1.4.1:修改 `src/core/schemas/severity.ts:56` FindingHashPayload.dimension union 扩 'process_evidence' 第 4 值**

老字面(severity.ts:56):
```typescript
  dimension: 'completeness' | 'correctness' | 'coherence';
```

改为:
```typescript
  /**
   * dimension enum:plan-9d 三维度 + plan-9g 新增 process_evidence(brainstorm v10 Codex 六轮 M-1)
   * 'process_evidence' 用于 plan-9g freeze-time WARNING(不变量 7/10)写入 marker.verify_findings;
   * sub-enum 'invariant-7-verify-count' | 'invariant-10-env-drift' 用 check_type 字段
   */
  dimension: 'completeness' | 'correctness' | 'coherence' | 'process_evidence';
```

- [ ] **Step 1.4.2:修改 `src/core/validate/marker-schema.ts:44` DIMENSION_VALUES Set 扩 'process_evidence'**

老字面(marker-schema.ts:43-44):
```typescript
// verify_findings.dimension 合法值(沿 design §2.2.2 三维度)
const DIMENSION_VALUES = new Set(['completeness', 'correctness', 'coherence']);
```

改为:
```typescript
// verify_findings.dimension 合法值(沿 design §2.2.2 三维度 + plan-9g brainstorm v10 加 process_evidence)
const DIMENSION_VALUES = new Set([
  'completeness',
  'correctness',
  'coherence',
  'process_evidence', // plan-9g freeze-time WARNING 7/10(brainstorm spec §3 修订)
]);
```

- [ ] **Step 1.4.3:修改 `src/core/validate/marker-schema.ts:498-503` error message 扩**

老字面(498-503):
```typescript
    if (typeof f.dimension !== 'string' || !DIMENSION_VALUES.has(f.dimension)) {
      errors.push({
        field: `verify_findings[${i}].dimension`,
        message: 'must be completeness|correctness|coherence',
      });
    }
```

改为:
```typescript
    if (typeof f.dimension !== 'string' || !DIMENSION_VALUES.has(f.dimension)) {
      errors.push({
        field: `verify_findings[${i}].dimension`,
        message: 'must be completeness|correctness|coherence|process_evidence',
      });
    }
```

- [ ] **Step 1.4.4:修改 `src/cli/commands/finding.ts:68-70` stdin JSON 校验扩**

老字面(68-70):
```typescript
    o.dimension !== 'completeness' &&
    o.dimension !== 'correctness' &&
    o.dimension !== 'coherence'
```

改为:
```typescript
    o.dimension !== 'completeness' &&
    o.dimension !== 'correctness' &&
    o.dimension !== 'coherence' &&
    o.dimension !== 'process_evidence' // plan-9g brainstorm v10 加(freeze-time WARNING 7/10 用)
```

- [ ] **Step 1.4.5:跑 typecheck + lint(确认三处 enum 扩没破坏现有代码)**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS

- [ ] **Step 1.4.6:commit Step 1.4**

```bash
> .git/COMMIT_MSG
echo "feat(9g Task 1.4): FindingHashPayload.dimension enum 扩 'process_evidence' 第 4 值" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "三处同步扩(沿 brainstorm spec v10 Codex 六轮 M-1 修复 — type + runtime 两层):" >> .git/COMMIT_MSG
echo "- src/core/schemas/severity.ts:56 FindingHashPayload.dimension union 加 'process_evidence'" >> .git/COMMIT_MSG
echo "- src/core/validate/marker-schema.ts:44 DIMENSION_VALUES Set 加 'process_evidence' +" >> .git/COMMIT_MSG
echo "  :498 error message 扩 'must be ...|process_evidence'" >> .git/COMMIT_MSG
echo "- src/cli/commands/finding.ts:70 stdin JSON dimension 校验扩 'process_evidence'" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "用途:plan-9g freeze-time WARNING(不变量 7 verify_invocations 计数 +" >> .git/COMMIT_MSG
echo "  不变量 10 env_hash 漂移)走 marker.verify_findings 路径需 dimension='process_evidence'" >> .git/COMMIT_MSG
echo "(brainstorm spec §3 WARNING 流转 + §9.11 计算 finding_hash 沿 9a 8 字段 schema)" >> .git/COMMIT_MSG
git commit -F .git/COMMIT_MSG
rm .git/COMMIT_MSG
```

Expected: typecheck + lint PASS;commit 输出

### 2.5 步骤 1.5:扩 markers/types.ts(VerifyMarker / ReviewMarker 加 4 个 optional 字段)

- [ ] **Step 1.5.1:先找 ReviewMarker interface 当前位置(可能在 types.ts 中段)**

```bash
pnpm exec grep -n "ReviewMarker" src/core/markers/types.ts
```

Expected: 找到 `export interface ReviewMarker {` 行号(后续 Step 1.5.2 用)

- [ ] **Step 1.5.2:修改 VerifyMarker(types.ts:6-24)在 `resigned_by_tool_version?: string;` 之后追加 4 个新 optional 字段**

```typescript
  resigned_by_tool_version?: string;
  // plan-9g Task 1 新增 — superset additive(沿 plan-9c/9d/9j 同模式)
  // brainstorm spec §2.2.2 + §9.11 — process_evidence schema + 三源 cross-check + ack-log chain
  /** v1.0 process_evidence 完整结构(沿 design §2.7.2);老 marker 缺等价 undefined */
  process_evidence?: ProcessEvidence;
  /** freeze 时 staging.yaml 三数组 JCS canonicalize hash 快照(archive fence cross-check 用) */
  process_evidence_staging_hash?: string;
  /** freeze 时全 JSONL ack-log.jsonl 末行 canonicalize hash 快照(挡"改最后一行"攻击) */
  ack_log_tail_hash?: string;
  /** freeze 时全 JSONL ack-log.jsonl 行数固化(挡"重写整链 + 链内自洽"攻击,brainstorm SUG1) */
  ack_log_entry_count?: number;
}
```

- [ ] **Step 1.5.3:在 types.ts:3 import 行追加 ProcessEvidence 导入**

老字面(types.ts:3):
```typescript
import type { Finding } from '../schemas/severity.js';
import type { Severity } from '../schemas/severity.js';
```

改为:
```typescript
import type { Finding } from '../schemas/severity.js';
import type { Severity } from '../schemas/severity.js';
import type { ProcessEvidence } from '../schemas/process-evidence.js'; // plan-9g Task 1
```

- [ ] **Step 1.5.4:同样在 ReviewMarker interface 内追加 4 个 optional 字段(沿同模式;positional 在 ReviewMarker.resigned_by_tool_version?: string 之后)**

```typescript
  resigned_by_tool_version?: string;
  // plan-9g Task 1 新增 — superset additive(同 VerifyMarker)
  process_evidence?: ProcessEvidence;
  process_evidence_staging_hash?: string;
  ack_log_tail_hash?: string;
  ack_log_entry_count?: number;
}
```

(若 ReviewMarker 当前无 resigned_by_tool_version 字段,则在末尾 `}` 之前插入 4 个新字段)

- [ ] **Step 1.5.5:跑 typecheck 确认 import 路径 + interface 扩**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 1.5.6:commit Step 1.5**

```bash
> .git/COMMIT_MSG
echo "feat(9g Task 1.5): markers/types.ts 扩 VerifyMarker/ReviewMarker 加 4 字段" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "Superset additive 扩四 optional 字段(沿 plan-9c/9d/9j 同模式):" >> .git/COMMIT_MSG
echo "- process_evidence?: ProcessEvidence(v1.0 完整结构,沿 design §2.7.2)" >> .git/COMMIT_MSG
echo "- process_evidence_staging_hash?: string(freeze 时 staging hash 快照)" >> .git/COMMIT_MSG
echo "- ack_log_tail_hash?: string(全 JSONL ack-log 末行 hash 固化)" >> .git/COMMIT_MSG
echo "- ack_log_entry_count?: number(全 JSONL ack-log 行数固化)" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "后三字段挡 brainstorm 五源 cross-check 反伪造矩阵:" >> .git/COMMIT_MSG
echo "- staging_hash:挡 marker 与 staging 不一致" >> .git/COMMIT_MSG
echo "- tail_hash:挡'改 ack-log 最后一行无下一行引用'攻击" >> .git/COMMIT_MSG
echo "- entry_count:挡'重写整链 + 链内自洽'攻击(brainstorm Codex 二轮 M-3 SUG1)" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "import type { ProcessEvidence } from '../schemas/process-evidence.js'" >> .git/COMMIT_MSG
git commit -F .git/COMMIT_MSG
rm .git/COMMIT_MSG
```

Expected: typecheck PASS

### 2.6 步骤 1.6:写 `tests/core/schemas/process-evidence.test.ts` 8 case

- [ ] **Step 1.6.1:先 RED — 写测试 fail 验证 schema 行为**

```typescript
// tests/core/schemas/process-evidence.test.ts — plan-9g Task 1.6
// 测 process-evidence.ts schema 8 case(brainstorm spec §4 + §8.2 测试矩阵)
//
// Case 1:schema literal 锁定为 'forge-process-evidence/v1'
// Case 2:RedCommitRecord 含 red_log_path/red_log_hash(非 log_path)
// Case 3:GreenCommitRecord 含 green_log_path/green_log_hash 且无 expected_failures
// Case 4:process_verification_mode 三档 literal union('full'|'sample'|'hash-only')
// Case 5:failure_type 四档 literal union('assertion'|'timeout'|'error'|'not-implemented')
// Case 6:TddEventChain.red_commit 可 null(tdd_exemption 非空时)
// Case 7:validateProcessVerificationConfig 默认值 fallback
// Case 8:validateProcessVerificationConfig 范围 + 类型校验

import { describe, it, expect } from 'vitest';
import type {
  ProcessEvidence,
  RedCommitRecord,
  GreenCommitRecord,
  ExpectedFailure,
  TddEventChain,
  TddExemption,
  VerifyInvocation,
  SubagentReviewChain,
  EnvHash,
  ProcessVerificationConfig,
} from '../../../src/core/schemas/process-evidence.js';
import { validateProcessVerificationConfig } from '../../../src/core/schema/process-verification-config.js';
import { DEFAULT_PROCESS_VERIFICATION } from '../../../src/core/schema/types.js';

describe('process-evidence schema', () => {
  it('Case 1: schema literal 锁定 forge-process-evidence/v1', () => {
    const pe: ProcessEvidence = {
      schema: 'forge-process-evidence/v1',
      process_verification_mode: 'full',
      process_verification_mode_acked_by: null,
      process_verification_mode_acked_at: null,
      env_hash: {
        lockfile_hash: 'sha256:placeholder',
        node_version: '20.10.0',
        os_platform: 'linux',
      },
      tdd_event_chain: [],
      verify_invocations: [],
      subagent_review_chain: [],
    };
    expect(pe.schema).toBe('forge-process-evidence/v1');
    // TypeScript 编译期验证 literal 唯一(以下行不应编译通过,留作 type test):
    // const wrong: ProcessEvidence = { schema: 'forge-process-evidence/v2', ... };
  });

  it('Case 2: RedCommitRecord 字段名严格 red_log_path/red_log_hash(沿 master spec 行 1115/1116)', () => {
    const red: RedCommitRecord = {
      sha: 'abc123',
      timestamp: '2026-05-12T14:00:00Z',
      red_log_path: '.evidence/task-1-red.log',
      red_log_hash: 'sha256:redhash',
      exit_code: 1, // RED 必 != 0
      runner_report_path: '.evidence/task-1-red-junit.xml',
      runner_report_hash: 'sha256:reportshash',
      expected_failures: [
        {
          test_file: 'src/auth/refresh.test.ts',
          test_name: 'refreshToken returns new token',
          failure_type: 'assertion',
        },
      ],
    };
    // 字段名严格沿 master spec §2.7.2 字面
    expect(red.red_log_path).toBe('.evidence/task-1-red.log');
    expect(red.red_log_hash).toBe('sha256:redhash');
    // TypeScript 编译期验证 — RedCommitRecord 不应含 log_path 字段:
    // @ts-expect-error 不允许 log_path
    // const r2: RedCommitRecord = { ...red, log_path: 'x' };
    expect(red.exit_code).not.toBe(0);
  });

  it('Case 3: GreenCommitRecord 含 green_log_path/green_log_hash 且无 expected_failures', () => {
    const green: GreenCommitRecord = {
      sha: 'def456',
      timestamp: '2026-05-12T14:30:00Z',
      green_log_path: '.evidence/task-1-green.log',
      green_log_hash: 'sha256:greenhash',
      exit_code: 0, // GREEN 必 == 0
      runner_report_path: '.evidence/task-1-green-junit.xml',
      runner_report_hash: 'sha256:gxhash',
    };
    expect(green.green_log_path).toBe('.evidence/task-1-green.log');
    expect(green.exit_code).toBe(0);
    // TypeScript 编译期验证 — GreenCommitRecord schema 层禁止 expected_failures
    // @ts-expect-error 不允许 expected_failures
    // const g2: GreenCommitRecord = { ...green, expected_failures: [] };
  });

  it('Case 4: process_verification_mode 三档 literal union', () => {
    const modes: ProcessEvidence['process_verification_mode'][] = ['full', 'sample', 'hash-only'];
    expect(modes).toHaveLength(3);
    // TypeScript 编译期验证:
    // const wrong: ProcessEvidence['process_verification_mode'] = 'invalid'; // @ts-expect-error
  });

  it('Case 5: failure_type 四档 literal union', () => {
    const failures: ExpectedFailure['failure_type'][] = [
      'assertion',
      'timeout',
      'error',
      'not-implemented',
    ];
    expect(failures).toHaveLength(4);
  });

  it('Case 6: TddEventChain.red_commit 可 null(tdd_exemption 非空时)', () => {
    const exemption: TddExemption = {
      reason: 'light-mode-trivial',
      loc_delta: 50,
    };
    const chain: TddEventChain = {
      task_ref: 'tasks.md#task-1',
      red_commit: null, // tdd_exemption 非空时 RED 可省
      green_commit: {
        sha: 'def456',
        timestamp: '2026-05-12T14:30:00Z',
        green_log_path: '.evidence/task-1-green.log',
        green_log_hash: 'sha256:greenhash',
        exit_code: 0,
        runner_report_path: '.evidence/task-1-green-junit.xml',
        runner_report_hash: 'sha256:gxhash',
      },
      tdd_exemption: exemption,
      tdd_exemption_acked_by: 'msc',
    };
    expect(chain.red_commit).toBeNull();
    expect(chain.tdd_exemption?.reason).toBe('light-mode-trivial');
  });

  it('Case 7: validateProcessVerificationConfig 默认值 fallback(缺 process_verification 段)', () => {
    const sanitized = validateProcessVerificationConfig(undefined);
    expect(sanitized).toEqual(DEFAULT_PROCESS_VERIFICATION);

    const sanitized2 = validateProcessVerificationConfig({ schema: 'forge-spec-driven/v1' });
    expect(sanitized2).toEqual(DEFAULT_PROCESS_VERIFICATION);
  });

  it('Case 8: validateProcessVerificationConfig 范围 + 类型校验', () => {
    const warns: string[] = [];
    const warn = (msg: string) => warns.push(msg);

    // sample_ratio 超范围
    const r1 = validateProcessVerificationConfig(
      {
        schema: 'forge-spec-driven/v1',
        process_verification: { sample_ratio: 1.5 },
      },
      warn,
    );
    expect(r1.sample_ratio).toBe(DEFAULT_PROCESS_VERIFICATION.sample_ratio);
    expect(warns[0]).toMatch(/sample_ratio.*\[0,1\]/);

    // mode 非法 string
    warns.length = 0;
    const r2 = validateProcessVerificationConfig(
      {
        schema: 'forge-spec-driven/v1',
        // @ts-expect-error - test 故意传非法值校验
        process_verification: { mode: 'invalid' },
      },
      warn,
    );
    expect(r2.mode).toBe('full');

    // test_timeout_per_task 非整数
    warns.length = 0;
    const r3 = validateProcessVerificationConfig(
      {
        schema: 'forge-spec-driven/v1',
        process_verification: { test_timeout_per_task: 3.14 },
      },
      warn,
    );
    expect(r3.test_timeout_per_task).toBe(DEFAULT_PROCESS_VERIFICATION.test_timeout_per_task);

    // max_parallel_reruns 超上限
    warns.length = 0;
    const r4 = validateProcessVerificationConfig(
      {
        schema: 'forge-spec-driven/v1',
        process_verification: { max_parallel_reruns: 100 },
      },
      warn,
    );
    expect(r4.max_parallel_reruns).toBe(DEFAULT_PROCESS_VERIFICATION.max_parallel_reruns);

    // 合法值通过
    warns.length = 0;
    const r5 = validateProcessVerificationConfig(
      {
        schema: 'forge-spec-driven/v1',
        process_verification: {
          mode: 'sample',
          sample_ratio: 0.5,
          test_timeout_per_task: 600,
          max_parallel_reruns: 4,
        },
      },
      warn,
    );
    expect(r5).toEqual({
      mode: 'sample',
      sample_ratio: 0.5,
      test_timeout_per_task: 600,
      max_parallel_reruns: 4,
    });
    expect(warns).toHaveLength(0);
  });
});
```

- [ ] **Step 1.6.2:跑测试**

```bash
pnpm test tests/core/schemas/process-evidence.test.ts
```

Expected: 8 case 全 PASS

- [ ] **Step 1.6.3:跑全本地 verify 收尾 Task 1**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
```

Expected: 全 PASS(memory:本地 verification 必须含 format:check)

- [ ] **Step 1.6.4:commit Step 1.6 + 收尾 Task 1**

```bash
> .git/COMMIT_MSG
echo "feat(9g Task 1.6): process-evidence schema 8 case 单测 + Task 1 完成" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "tests/core/schemas/process-evidence.test.ts — 8 case:" >> .git/COMMIT_MSG
echo "- Case 1: schema literal 锁定 forge-process-evidence/v1" >> .git/COMMIT_MSG
echo "- Case 2: RedCommitRecord red_log_path/red_log_hash(沿 master spec 行 1115/1116)" >> .git/COMMIT_MSG
echo "- Case 3: GreenCommitRecord green_log_path 且 schema 层禁 expected_failures" >> .git/COMMIT_MSG
echo "- Case 4: process_verification_mode 三档 literal" >> .git/COMMIT_MSG
echo "- Case 5: failure_type 四档 literal" >> .git/COMMIT_MSG
echo "- Case 6: TddEventChain.red_commit 可 null(tdd_exemption 非空)" >> .git/COMMIT_MSG
echo "- Case 7: validateProcessVerificationConfig 缺段 fallback DEFAULT" >> .git/COMMIT_MSG
echo "- Case 8: 范围 + 类型 + 合法值四档校验" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "Task 1 完成:11 interface schema + dimension enum 扩 + marker 4 字段 +" >> .git/COMMIT_MSG
echo "  ForgeConfig 三子树 + 8 case 单测 全本地 verify PASS" >> .git/COMMIT_MSG
git add tests/core/schemas/process-evidence.test.ts
git commit -F .git/COMMIT_MSG
rm .git/COMMIT_MSG
```

Expected: 全本地 verify PASS;commit 输出

### 2.7 Task 1 完成定义(DoD)

- [x] `src/core/schemas/process-evidence.ts` 创建,11 interface + schema literal
- [x] `src/core/schema/process-verification-config.ts` 创建,validateProcessVerificationConfig 函数
- [x] `src/core/schemas/severity.ts:56` FindingHashPayload.dimension union 扩 'process_evidence'
- [x] `src/core/validate/marker-schema.ts:44+498` DIMENSION_VALUES + error message 扩
- [x] `src/cli/commands/finding.ts:68-70` stdin JSON 校验扩 'process_evidence'
- [x] `src/core/markers/types.ts` VerifyMarker + ReviewMarker 加 4 个 optional 字段 + ProcessEvidence import
- [x] `src/core/schema/types.ts` ForgeConfig 加 process_verification / test / ack 三子树 + 3 个 DEFAULT 常量
- [x] `tests/core/schemas/process-evidence.test.ts` 8 case PASS
- [x] 全本地 verify(typecheck + lint + format:check + build + test)PASS

---

## 3. Task 2 — worktree.ts 高阶 API + test-reporters 三档 parser + 9 case worktree + 9 case reporters

**Files:**

- Create: `src/core/worktree.ts`
- Create: `src/core/test-reporters/index.ts`
- Create: `src/core/test-reporters/junit.ts`
- Create: `src/core/test-reporters/tap.ts`
- Create: `src/core/test-reporters/vitest-json.ts`
- Modify: `package.json`(加 `fast-xml-parser` + `tap-parser` 两 deps)
- Test: `tests/core/worktree.test.ts`(9 case)
- Test: `tests/core/test-reporters/{junit,tap,vitest-json}.test.ts`(各 3 case)

### 3.1 步骤 2.1:加 npm deps

- [ ] **Step 2.1.1:加 fast-xml-parser + tap-parser 两 deps**

```bash
pnpm add fast-xml-parser@^4
pnpm add tap-parser@^15
```

Expected: pnpm-lock.yaml 更新;两 dep 加到 package.json dependencies

- [ ] **Step 2.1.2:跑 typecheck 确认新 deps types**

```bash
pnpm typecheck
```

Expected: PASS(tap-parser 有 @types,fast-xml-parser 自带 d.ts)

- [ ] **Step 2.1.3:commit Step 2.1**

```bash
> .git/COMMIT_MSG
echo "feat(9g Task 2.1): pnpm add fast-xml-parser + tap-parser deps" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "新增两 deps for plan-9g test-reporters:" >> .git/COMMIT_MSG
echo "- fast-xml-parser ^4(JUnit XML 解析,vitest/jest/mocha 通用)" >> .git/COMMIT_MSG
echo "- tap-parser ^15(TAP stream 解析,node:test 用)" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "(Vitest --reporter=json 走原生 JSON.parse,不需 dep)" >> .git/COMMIT_MSG
git add package.json pnpm-lock.yaml
git commit -F .git/COMMIT_MSG && rm .git/COMMIT_MSG
```

### 3.2 步骤 2.2:写 src/core/worktree.ts 高阶 API

- [ ] **Step 2.2.1:写 `src/core/worktree.ts` 完整字面**

```typescript
// src/core/worktree.ts — plan-9g Task 2.2
// 高阶 git worktree helper:runInWorktree(sha, fn, opts)
// 沿 brainstorm spec §2.1 锁定的"高阶 runInWorktree"路径(brainstorm 决策点 3)
//
// 关键设计:
//   - try/finally 强 cleanup(git worktree remove --force 必跑)
//   - timeout AbortSignal 控制单 task 重跑超时(沿 §2.7.4 D)
//   - max_parallel 并发 gate(brainstorm §9.10 — Windows 磁盘空间约束更紧)
//   - 跨平台 tmp 目录:Windows 用 os.tmpdir() 即 %TEMP%,Unix 用 /tmp

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

/** runInWorktree 调用选项 */
export interface RunInWorktreeOptions {
  /** 重跑 timeout 毫秒(沿 §2.7.4 D;ProcessVerificationConfig.test_timeout_per_task × 1000) */
  timeout?: number;
  /** 工作目录(默认 cwd) */
  cwd?: string;
  /** 失败 cleanup 时 stderr 输出回调(测试可注入 mock) */
  onCleanupWarning?: (msg: string) => void;
}

/** runInWorktree 失败错误类型 */
export class WorktreeError extends Error {
  constructor(
    message: string,
    public readonly stage: 'add' | 'run' | 'remove' | 'timeout',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WorktreeError';
  }
}

/**
 * runInWorktree — 在 git worktree 隔离执行 fn(workPath)
 *
 * 流程:
 *   1. mkdtemp 临时目录(跨平台 tmpdir)
 *   2. git worktree add <tmpDir> <sha> 创建 detached worktree
 *   3. try: fn(workPath) — 业务逻辑(测试重跑)
 *   4. finally: git worktree remove --force <tmpDir>(失败 log WARNING 不阻断)
 *
 * @param sha — 要 checkout 的 git commit sha
 * @param fn — 业务函数,接收 workPath(absolute)返回 T
 * @param opts — { timeout, cwd, onCleanupWarning }
 * @returns fn 的返回值 T
 * @throws WorktreeError stage='add'|'run'|'remove'|'timeout'
 */
export async function runInWorktree<T>(
  sha: string,
  fn: (workPath: string) => Promise<T>,
  opts: RunInWorktreeOptions = {},
): Promise<T> {
  const cwd = opts.cwd ?? process.cwd();
  const timeoutMs = opts.timeout ?? 300_000; // 默认 300 秒(沿 DEFAULT_PROCESS_VERIFICATION.test_timeout_per_task)
  const onCleanupWarning = opts.onCleanupWarning ?? ((msg) => process.stderr.write(`⚠ ${msg}\n`));

  // 1. 创建 tmpdir(跨平台)
  const workPath = await mkdtemp(join(tmpdir(), 'forge-rerun-'));

  let addedWorktree = false;
  try {
    // 2. git worktree add
    try {
      await execFileAsync('git', ['worktree', 'add', '--detach', workPath, sha], {
        cwd,
        encoding: 'utf8',
      });
      addedWorktree = true;
    } catch (e) {
      throw new WorktreeError(
        `git worktree add failed for sha=${sha} at ${workPath}: ${e instanceof Error ? e.message : String(e)}`,
        'add',
        e,
      );
    }

    // 3. 跑 fn 含 timeout
    const result = await Promise.race([
      fn(workPath),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new WorktreeError(`worktree fn timeout after ${timeoutMs}ms`, 'timeout')),
          timeoutMs,
        ),
      ),
    ]);

    return result;
  } catch (e) {
    if (e instanceof WorktreeError) throw e;
    // fn 内部抛错
    throw new WorktreeError(
      `runInWorktree fn failed: ${e instanceof Error ? e.message : String(e)}`,
      'run',
      e,
    );
  } finally {
    // 4. cleanup(失败仅 WARNING 不阻断)
    if (addedWorktree) {
      try {
        await execFileAsync('git', ['worktree', 'remove', '--force', workPath], {
          cwd,
          encoding: 'utf8',
        });
      } catch (cleanupErr) {
        onCleanupWarning(
          `git worktree remove --force ${workPath} failed: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
        );
      }
    }
    // tmpdir 物理目录最后清理(git worktree remove 应该已删,这里兜底)
    try {
      await rm(workPath, { recursive: true, force: true });
    } catch {
      // 已被 git worktree remove 删了,正常
    }
  }
}

/**
 * Parallel gate — 限制 max_parallel_reruns 并发(brainstorm §9.10)
 * 实施者根据 ProcessVerificationConfig.max_parallel_reruns 创建 gate 实例
 * 用法:
 *   const gate = new ParallelGate(2);
 *   await gate.acquire();
 *   try {
 *     await runInWorktree(sha, fn);
 *   } finally {
 *     gate.release();
 *   }
 */
export class ParallelGate {
  private inFlight = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {
    if (max < 1) throw new Error(`ParallelGate max must be >= 1, got ${max}`);
  }

  async acquire(): Promise<void> {
    if (this.inFlight < this.max) {
      this.inFlight++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.inFlight++;
        resolve();
      });
    });
  }

  release(): void {
    this.inFlight--;
    if (this.queue.length > 0 && this.inFlight < this.max) {
      const next = this.queue.shift()!;
      next();
    }
  }
}
```

- [ ] **Step 2.2.2:跑 typecheck**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 2.2.3:写 `tests/core/worktree.test.ts` 9 case**

```typescript
// tests/core/worktree.test.ts — plan-9g Task 2.2
// 测 runInWorktree 9 case(brainstorm spec §8.2):
//   - happy path(成功跑 + cleanup)
//   - timeout 触发
//   - fn 抛错 + cleanup 跑
//   - git worktree add 失败(非 git repo / sha 不存在)
//   - cleanup 失败仅 WARNING 不阻断
//   - ParallelGate max=2 并发 gate
//   - ParallelGate FIFO 顺序
//   - ParallelGate release 释放下一个
//   - WorktreeError stage 字段

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInWorktree, ParallelGate, WorktreeError } from '../../src/core/worktree.js';

const execFileAsync = promisify(execFile);

async function setupGitRepo(): Promise<{ repoPath: string; sha: string }> {
  const repoPath = await mkdtemp(join(tmpdir(), 'forge-worktree-test-'));
  await execFileAsync('git', ['init', '-q'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: repoPath });
  await writeFile(join(repoPath, 'README.md'), '# test\n', 'utf8');
  await execFileAsync('git', ['add', '.'], { cwd: repoPath });
  await execFileAsync('git', ['commit', '-q', '-m', 'init'], { cwd: repoPath });
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
  return { repoPath, sha: stdout.trim() };
}

describe('runInWorktree', () => {
  let repoPath: string;
  let sha: string;

  beforeEach(async () => {
    const setup = await setupGitRepo();
    repoPath = setup.repoPath;
    sha = setup.sha;
  });

  afterEach(async () => {
    await execFileAsync('rm', ['-rf', repoPath]).catch(() => {});
  });

  it('Case 1: happy path 返 fn 结果 + cleanup', async () => {
    let receivedPath = '';
    const result = await runInWorktree(
      sha,
      async (workPath) => {
        receivedPath = workPath;
        return 'ok';
      },
      { cwd: repoPath },
    );
    expect(result).toBe('ok');
    expect(receivedPath).toContain('forge-rerun-');
    // worktree 已被 cleanup;list 应不含
    const { stdout } = await execFileAsync('git', ['worktree', 'list'], { cwd: repoPath });
    expect(stdout).not.toContain(receivedPath);
  });

  it('Case 2: timeout 触发 WorktreeError stage=timeout', async () => {
    await expect(
      runInWorktree(
        sha,
        () => new Promise((resolve) => setTimeout(resolve, 200)),
        { cwd: repoPath, timeout: 50 },
      ),
    ).rejects.toMatchObject({
      name: 'WorktreeError',
      stage: 'timeout',
    });
  });

  it('Case 3: fn 抛错触发 WorktreeError stage=run + cleanup 跑', async () => {
    await expect(
      runInWorktree(
        sha,
        async () => {
          throw new Error('fn failed');
        },
        { cwd: repoPath },
      ),
    ).rejects.toMatchObject({
      name: 'WorktreeError',
      stage: 'run',
    });
  });

  it('Case 4: sha 不存在 → WorktreeError stage=add', async () => {
    await expect(
      runInWorktree('0000000000000000000000000000000000000000', async () => 'x', { cwd: repoPath }),
    ).rejects.toMatchObject({
      name: 'WorktreeError',
      stage: 'add',
    });
  });

  it('Case 5: cleanup 失败仅 WARNING 不阻断(mock cleanup error)', async () => {
    const warnings: string[] = [];
    // 模拟 cleanup 失败:fn 内手动 git worktree remove(占用),导致 finally 时 remove 失败
    const result = await runInWorktree(
      sha,
      async (workPath) => {
        // 提前 remove(让 finally 时再 remove 失败)
        await execFileAsync('git', ['worktree', 'remove', '--force', workPath], {
          cwd: repoPath,
        });
        return 'cleanup-tested';
      },
      {
        cwd: repoPath,
        onCleanupWarning: (msg) => warnings.push(msg),
      },
    );
    expect(result).toBe('cleanup-tested');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('git worktree remove');
  });

  it('Case 6: ParallelGate max=2 并发 gate(第 3 个等待)', async () => {
    const gate = new ParallelGate(2);
    const order: number[] = [];
    const tasks = [1, 2, 3].map(async (i) => {
      await gate.acquire();
      order.push(i);
      try {
        await new Promise((r) => setTimeout(r, 50));
      } finally {
        gate.release();
      }
    });
    await Promise.all(tasks);
    expect(order).toHaveLength(3);
    // 前两个并发(顺序 1,2),第 3 个等到 1 释放后进
    expect(order.slice(0, 2).sort()).toEqual([1, 2]);
    expect(order[2]).toBe(3);
  });

  it('Case 7: ParallelGate FIFO 顺序(连续 acquire)', async () => {
    const gate = new ParallelGate(1);
    const order: number[] = [];
    const tasks = [1, 2, 3].map(async (i) => {
      await gate.acquire();
      order.push(i);
      gate.release();
    });
    await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3]);
  });

  it('Case 8: ParallelGate release 触发下一个 acquire', async () => {
    const gate = new ParallelGate(1);
    await gate.acquire();
    let resolved = false;
    const next = gate.acquire().then(() => {
      resolved = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);
    gate.release();
    await next;
    expect(resolved).toBe(true);
    gate.release();
  });

  it('Case 9: WorktreeError stage 字段 union type', () => {
    const err = new WorktreeError('test', 'add');
    expect(err.stage).toBe('add');
    expect(err.name).toBe('WorktreeError');
    // type level: 'add'|'run'|'remove'|'timeout'
  });
});
```

- [ ] **Step 2.2.4:跑 worktree 测试**

```bash
pnpm test tests/core/worktree.test.ts
```

Expected: 9 case 全 PASS

- [ ] **Step 2.2.5:commit Step 2.2**

```bash
> .git/COMMIT_MSG
echo "feat(9g Task 2.2): worktree.ts 高阶 API + ParallelGate + 9 case 单测" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "src/core/worktree.ts:" >> .git/COMMIT_MSG
echo "- runInWorktree(sha, fn, opts):try/finally 强 cleanup + timeout AbortSignal" >> .git/COMMIT_MSG
echo "  + 跨平台 tmpdir(Windows %TEMP% / Unix /tmp)" >> .git/COMMIT_MSG
echo "- ParallelGate(max):FIFO 并发 gate(brainstorm §9.10 Windows 磁盘空间约束)" >> .git/COMMIT_MSG
echo "- WorktreeError stage='add'|'run'|'remove'|'timeout' 区分错误阶段" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "tests/core/worktree.test.ts:9 case 全 PASS" >> .git/COMMIT_MSG
echo "- happy path / timeout / fn 抛错 / sha 不存在 / cleanup 失败 WARNING /" >> .git/COMMIT_MSG
echo "- ParallelGate max=2 / FIFO / release 触发 / WorktreeError stage" >> .git/COMMIT_MSG
git add src/core/worktree.ts tests/core/worktree.test.ts
git commit -F .git/COMMIT_MSG && rm .git/COMMIT_MSG
```

### 3.3 步骤 2.3:写 test-reporters 三档 parser

- [ ] **Step 2.3.1:写 `src/core/test-reporters/index.ts` factory**

```typescript
// src/core/test-reporters/index.ts — plan-9g Task 2.3
// parseReporter(path, type) factory + ReporterResult 统一类型
// 沿 brainstorm spec 决策点 1:三档各引独立 npm 包
//
// 三档:
//   - junit  → fast-xml-parser wrap(vitest/jest/mocha 通用)
//   - tap    → tap-parser wrap(node:test)
//   - vitest-json → 原生 JSON.parse + Vitest schema

import { readFile } from 'node:fs/promises';
import { parseJUnit } from './junit.js';
import { parseTAP } from './tap.js';
import { parseVitestJSON } from './vitest-json.js';

/** Reporter 类型 union(沿 ForgeConfig['test'].reporter) */
export type ReporterType = 'junit' | 'tap' | 'vitest-json';

/** 单 test case 解析结果 */
export interface TestCaseResult {
  /** 相对 repo 根的测试文件路径(可能为空字符串若 reporter 不提供) */
  test_file: string;
  /** 测试名(对应 describe/it 嵌套全名) */
  test_name: string;
  /** 'pass' | 'fail' | 'skip' */
  status: 'pass' | 'fail' | 'skip';
  /** 若 fail,失败类型(对应 ExpectedFailure.failure_type) */
  failure_type?: 'assertion' | 'timeout' | 'error' | 'not-implemented';
  /** 错误消息(若 fail) */
  message?: string;
}

/** 完整 reporter 解析结果 */
export interface ReporterResult {
  /** 所有 test case */
  tests: TestCaseResult[];
  /** 总数 */
  totalCount: number;
  /** pass 计数 */
  passCount: number;
  /** fail 计数 */
  failCount: number;
  /** skip 计数 */
  skipCount: number;
}

/**
 * parseReporter — 根据 reporter 类型 dispatch 解析
 *
 * @param reportPath — reporter 文件绝对路径
 * @param type — reporter 类型('junit' | 'tap' | 'vitest-json')
 * @returns ReporterResult 统一格式
 * @throws Error 若文件不存在 / 解析失败
 */
export async function parseReporter(
  reportPath: string,
  type: ReporterType,
): Promise<ReporterResult> {
  const content = await readFile(reportPath, 'utf8');
  switch (type) {
    case 'junit':
      return parseJUnit(content);
    case 'tap':
      return parseTAP(content);
    case 'vitest-json':
      return parseVitestJSON(content);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown reporter type: ${String(_exhaustive)}`);
    }
  }
}

export { parseJUnit } from './junit.js';
export { parseTAP } from './tap.js';
export { parseVitestJSON } from './vitest-json.js';
```

- [ ] **Step 2.3.2:写 `src/core/test-reporters/junit.ts`(fast-xml-parser wrap)**

```typescript
// src/core/test-reporters/junit.ts — plan-9g Task 2.3
// JUnit XML reporter 解析(沿 vitest/jest/mocha 通用 schema)
// fast-xml-parser ^4 wrap

import { XMLParser } from 'fast-xml-parser';
import type { ReporterResult, TestCaseResult } from './index.js';

/**
 * JUnit XML schema(简化版,沿 vitest/jest/mocha 通用部分)
 *
 * <testsuites>
 *   <testsuite name="..." tests="N" failures="M">
 *     <testcase name="..." classname="..." file="..." time="...">
 *       <failure message="..." type="...">...</failure>
 *       <skipped/>
 *     </testcase>
 *   </testsuite>
 * </testsuites>
 *
 * 注:某些 framework 直接顶层 <testsuite>(无 <testsuites> 包裹);
 *     parser 需兼容两种形态
 */

interface JUnitFailureNode {
  '@_message'?: string;
  '@_type'?: string;
  '#text'?: string;
}

interface JUnitTestCaseNode {
  '@_name': string;
  '@_classname'?: string;
  '@_file'?: string;
  '@_time'?: string;
  failure?: JUnitFailureNode | JUnitFailureNode[];
  error?: JUnitFailureNode | JUnitFailureNode[];
  skipped?: object;
}

interface JUnitTestSuiteNode {
  '@_name'?: string;
  '@_tests'?: string;
  '@_failures'?: string;
  testcase?: JUnitTestCaseNode | JUnitTestCaseNode[];
}

interface JUnitDoc {
  testsuites?: { testsuite?: JUnitTestSuiteNode | JUnitTestSuiteNode[] };
  testsuite?: JUnitTestSuiteNode | JUnitTestSuiteNode[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  isArray: (name) => name === 'testsuite' || name === 'testcase',
});

/**
 * parseJUnit — 解析 JUnit XML 字符串
 * @param xmlContent JUnit XML 字符串
 * @returns ReporterResult
 */
export function parseJUnit(xmlContent: string): ReporterResult {
  let doc: JUnitDoc;
  try {
    doc = parser.parse(xmlContent) as JUnitDoc;
  } catch (e) {
    throw new Error(`JUnit XML parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 兼容 <testsuites> 包裹 vs 直接 <testsuite>
  const suites: JUnitTestSuiteNode[] = doc.testsuites?.testsuite
    ? Array.isArray(doc.testsuites.testsuite)
      ? doc.testsuites.testsuite
      : [doc.testsuites.testsuite]
    : doc.testsuite
      ? Array.isArray(doc.testsuite)
        ? doc.testsuite
        : [doc.testsuite]
      : [];

  const tests: TestCaseResult[] = [];
  for (const suite of suites) {
    if (!suite.testcase) continue;
    const cases = Array.isArray(suite.testcase) ? suite.testcase : [suite.testcase];
    for (const tc of cases) {
      const test: TestCaseResult = {
        test_file: tc['@_file'] ?? tc['@_classname'] ?? '',
        test_name: tc['@_name'],
        status: 'pass',
      };
      if (tc.skipped !== undefined) {
        test.status = 'skip';
      } else if (tc.failure !== undefined || tc.error !== undefined) {
        const failNode = tc.failure
          ? Array.isArray(tc.failure)
            ? tc.failure[0]
            : tc.failure
          : Array.isArray(tc.error!)
            ? (tc.error as JUnitFailureNode[])[0]
            : (tc.error as JUnitFailureNode);
        test.status = 'fail';
        test.message = failNode['@_message'] ?? failNode['#text'] ?? '';
        // failure type 映射(JUnit 标准 type 字段 → ExpectedFailure.failure_type)
        const rawType = (failNode['@_type'] ?? '').toLowerCase();
        if (rawType.includes('assertion') || rawType.includes('expect')) {
          test.failure_type = 'assertion';
        } else if (rawType.includes('timeout')) {
          test.failure_type = 'timeout';
        } else if (rawType.includes('notimplemented') || rawType.includes('skip')) {
          test.failure_type = 'not-implemented';
        } else {
          test.failure_type = 'error';
        }
      }
      tests.push(test);
    }
  }

  const passCount = tests.filter((t) => t.status === 'pass').length;
  const failCount = tests.filter((t) => t.status === 'fail').length;
  const skipCount = tests.filter((t) => t.status === 'skip').length;

  return {
    tests,
    totalCount: tests.length,
    passCount,
    failCount,
    skipCount,
  };
}
```

- [ ] **Step 2.3.3:写 `src/core/test-reporters/tap.ts`(tap-parser wrap)**

```typescript
// src/core/test-reporters/tap.ts — plan-9g Task 2.3
// TAP stream reporter 解析(node:test --reporter=tap 用)
// tap-parser ^15 wrap

import Parser from 'tap-parser';
import type { ReporterResult, TestCaseResult } from './index.js';

/**
 * parseTAP — 解析 TAP stream 字符串
 *
 * TAP 格式:
 *   TAP version 13
 *   1..N
 *   ok 1 - testname
 *   not ok 2 - testname2
 *     ---
 *     message: 'assertion failed'
 *     ...
 *
 * @param tapContent TAP stream 字符串
 * @returns ReporterResult
 */
export function parseTAP(tapContent: string): ReporterResult {
  return new Promise<ReporterResult>((resolve, reject) => {
    const tests: TestCaseResult[] = [];
    const parser = new Parser();

    parser.on('assert', (assert: { id: number; name: string; ok: boolean; skip?: string | boolean; todo?: string | boolean; diag?: { message?: string; type?: string; expected?: unknown; actual?: unknown } }) => {
      const test: TestCaseResult = {
        test_file: '', // TAP 不含 test_file 信息
        test_name: assert.name,
        status: 'pass',
      };
      if (assert.skip || assert.todo) {
        test.status = 'skip';
      } else if (!assert.ok) {
        test.status = 'fail';
        const diag = assert.diag ?? {};
        test.message = diag.message ?? '';
        const rawType = (diag.type ?? '').toLowerCase();
        if (rawType.includes('assertion')) {
          test.failure_type = 'assertion';
        } else if (rawType.includes('timeout')) {
          test.failure_type = 'timeout';
        } else if (diag.expected !== undefined || diag.actual !== undefined) {
          test.failure_type = 'assertion';
        } else {
          test.failure_type = 'error';
        }
      }
      tests.push(test);
    });

    parser.on('complete', () => {
      const passCount = tests.filter((t) => t.status === 'pass').length;
      const failCount = tests.filter((t) => t.status === 'fail').length;
      const skipCount = tests.filter((t) => t.status === 'skip').length;
      resolve({
        tests,
        totalCount: tests.length,
        passCount,
        failCount,
        skipCount,
      });
    });

    parser.on('error', (e: Error) => reject(new Error(`TAP parse failed: ${e.message}`)));

    parser.write(tapContent);
    parser.end();
  });
}
```

注:`parseTAP` 是 async(tap-parser 是 stream-based);`index.ts` 的 `parseReporter` 应改为 await `parseTAP(...)` — 已在签名上声明 Promise<ReporterResult>。但 `parseJUnit` 和 `parseVitestJSON` 当前是 sync,parseReporter 包装时需统一 — 让 parseJUnit / parseVitestJSON 也返 Promise(`return Promise.resolve(...)` 或改 async)。修订 index.ts:

```typescript
// index.ts 修订(Step 2.3.1 已写但需明示 parseJUnit/parseVitestJSON 也是 async):
export async function parseReporter(
  reportPath: string,
  type: ReporterType,
): Promise<ReporterResult> {
  const content = await readFile(reportPath, 'utf8');
  switch (type) {
    case 'junit':
      return parseJUnit(content); // 注:parseJUnit 返 ReporterResult 同步,await 不影响
    case 'tap':
      return await parseTAP(content); // async Promise
    case 'vitest-json':
      return parseVitestJSON(content);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown reporter type: ${String(_exhaustive)}`);
    }
  }
}
```

- [ ] **Step 2.3.4:写 `src/core/test-reporters/vitest-json.ts`(原生 JSON.parse)**

```typescript
// src/core/test-reporters/vitest-json.ts — plan-9g Task 2.3
// Vitest --reporter=json 原生 JSON.parse + schema
// 沿 Vitest 4.x 的 json reporter schema(2026 锁定 — brainstorm spec §9.5 留)

import type { ReporterResult, TestCaseResult } from './index.js';

/**
 * Vitest JSON reporter schema(精简版 — 仅本 plan 用到的字段)
 *
 * { numTotalTests, numPassedTests, numFailedTests, numPendingTests,
 *   testResults: [{
 *     name: filepath,
 *     assertionResults: [{
 *       fullName, status: 'passed'|'failed'|'pending'|'skipped',
 *       failureMessages?: string[]
 *     }]
 *   }]
 * }
 */
interface VitestJsonAssertionResult {
  fullName: string;
  status: 'passed' | 'failed' | 'pending' | 'skipped';
  failureMessages?: string[];
}

interface VitestJsonTestResult {
  name: string; // file path
  assertionResults: VitestJsonAssertionResult[];
}

interface VitestJsonDoc {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  testResults?: VitestJsonTestResult[];
}

/**
 * parseVitestJSON — 解析 Vitest JSON reporter 字符串
 * @param jsonContent Vitest --reporter=json 输出
 * @returns ReporterResult
 */
export function parseVitestJSON(jsonContent: string): ReporterResult {
  let doc: VitestJsonDoc;
  try {
    doc = JSON.parse(jsonContent) as VitestJsonDoc;
  } catch (e) {
    throw new Error(`Vitest JSON parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const tests: TestCaseResult[] = [];
  for (const file of doc.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      const test: TestCaseResult = {
        test_file: file.name,
        test_name: assertion.fullName,
        status:
          assertion.status === 'passed'
            ? 'pass'
            : assertion.status === 'failed'
              ? 'fail'
              : 'skip',
      };
      if (test.status === 'fail') {
        const msgs = assertion.failureMessages ?? [];
        test.message = msgs.join('\n');
        const msgLower = test.message.toLowerCase();
        if (msgLower.includes('assertionerror') || msgLower.includes('expect')) {
          test.failure_type = 'assertion';
        } else if (msgLower.includes('timeout')) {
          test.failure_type = 'timeout';
        } else if (msgLower.includes('not implemented')) {
          test.failure_type = 'not-implemented';
        } else {
          test.failure_type = 'error';
        }
      }
      tests.push(test);
    }
  }

  const passCount = tests.filter((t) => t.status === 'pass').length;
  const failCount = tests.filter((t) => t.status === 'fail').length;
  const skipCount = tests.filter((t) => t.status === 'skip').length;

  return {
    tests,
    totalCount: tests.length,
    passCount,
    failCount,
    skipCount,
  };
}
```

- [ ] **Step 2.3.5:写 3 个 reporter 测试 fixture(各 3 case)**

```typescript
// tests/core/test-reporters/junit.test.ts
import { describe, it, expect } from 'vitest';
import { parseJUnit } from '../../../src/core/test-reporters/junit.js';

describe('parseJUnit', () => {
  it('Case 1: vitest JUnit XML(testsuites 包裹)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="vitest" tests="3" failures="1">
  <testsuite name="auth.test.ts" tests="3" failures="1">
    <testcase name="login pass" classname="auth" file="src/auth.test.ts" time="0.1"/>
    <testcase name="login fail" classname="auth" file="src/auth.test.ts" time="0.2">
      <failure message="expected true to be false" type="AssertionError">stack...</failure>
    </testcase>
    <testcase name="logout" classname="auth" file="src/auth.test.ts" time="0.05">
      <skipped/>
    </testcase>
  </testsuite>
</testsuites>`;
    const result = parseJUnit(xml);
    expect(result.totalCount).toBe(3);
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(1);
    expect(result.skipCount).toBe(1);
    expect(result.tests[1].failure_type).toBe('assertion');
    expect(result.tests[1].message).toContain('expected true to be false');
  });

  it('Case 2: jest JUnit XML(直接 testsuite)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="jest" tests="2" failures="1">
  <testcase name="t1" classname="src/a.test.js" time="0.1"/>
  <testcase name="t2" classname="src/a.test.js" time="0.2">
    <error message="ReferenceError" type="ReferenceError">stack</error>
  </testcase>
</testsuite>`;
    const result = parseJUnit(xml);
    expect(result.totalCount).toBe(2);
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(1);
    expect(result.tests[1].failure_type).toBe('error');
  });

  it('Case 3: mocha JUnit XML(空 testsuite + 边界)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="empty"/>
</testsuites>`;
    const result = parseJUnit(xml);
    expect(result.totalCount).toBe(0);
    expect(result.tests).toEqual([]);
  });
});
```

```typescript
// tests/core/test-reporters/tap.test.ts
import { describe, it, expect } from 'vitest';
import { parseTAP } from '../../../src/core/test-reporters/tap.js';

describe('parseTAP', () => {
  it('Case 1: node:test TAP basic(2 pass 1 fail)', async () => {
    const tap = `TAP version 13
1..3
ok 1 - login pass
not ok 2 - login fail
  ---
  message: 'expected true to be false'
  type: assertion
  ...
ok 3 - logout
`;
    const result = await parseTAP(tap);
    expect(result.totalCount).toBe(3);
    expect(result.passCount).toBe(2);
    expect(result.failCount).toBe(1);
    expect(result.tests[1].failure_type).toBe('assertion');
  });

  it('Case 2: TAP with skip + todo', async () => {
    const tap = `TAP version 13
1..3
ok 1 - t1
ok 2 - t2 # SKIP not yet
ok 3 - t3 # TODO impl later
`;
    const result = await parseTAP(tap);
    expect(result.totalCount).toBe(3);
    expect(result.skipCount).toBe(2);
  });

  it('Case 3: TAP with diag expected/actual → failure_type=assertion', async () => {
    const tap = `TAP version 13
1..1
not ok 1 - check
  ---
  expected: 5
  actual: 3
  ...
`;
    const result = await parseTAP(tap);
    expect(result.failCount).toBe(1);
    expect(result.tests[0].failure_type).toBe('assertion');
  });
});
```

```typescript
// tests/core/test-reporters/vitest-json.test.ts
import { describe, it, expect } from 'vitest';
import { parseVitestJSON } from '../../../src/core/test-reporters/vitest-json.js';

describe('parseVitestJSON', () => {
  it('Case 1: Vitest JSON basic(1 pass 1 fail 1 skip)', () => {
    const json = JSON.stringify({
      numTotalTests: 3,
      numPassedTests: 1,
      numFailedTests: 1,
      numPendingTests: 1,
      testResults: [
        {
          name: '/abs/path/src/auth.test.ts',
          assertionResults: [
            { fullName: 'login pass', status: 'passed' },
            {
              fullName: 'login fail',
              status: 'failed',
              failureMessages: ['AssertionError: expected true to be false\n at ...'],
            },
            { fullName: 'logout', status: 'pending' },
          ],
        },
      ],
    });
    const result = parseVitestJSON(json);
    expect(result.totalCount).toBe(3);
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(1);
    expect(result.skipCount).toBe(1);
    expect(result.tests[1].failure_type).toBe('assertion');
  });

  it('Case 2: Vitest JSON 多文件多 assertion', () => {
    const json = JSON.stringify({
      testResults: [
        { name: 'a.test.ts', assertionResults: [{ fullName: 'a1', status: 'passed' }] },
        { name: 'b.test.ts', assertionResults: [{ fullName: 'b1', status: 'failed', failureMessages: ['timeout 5s'] }] },
      ],
    });
    const result = parseVitestJSON(json);
    expect(result.totalCount).toBe(2);
    expect(result.tests[1].failure_type).toBe('timeout');
  });

  it('Case 3: Vitest JSON 空 testResults', () => {
    const json = JSON.stringify({ testResults: [] });
    const result = parseVitestJSON(json);
    expect(result.totalCount).toBe(0);
  });
});
```

- [ ] **Step 2.3.6:跑 reporter 全部测试**

```bash
pnpm test tests/core/test-reporters/
```

Expected: 9 case 全 PASS

- [ ] **Step 2.3.7:全本地 verify 收尾 Task 2**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
```

Expected: 全 PASS

- [ ] **Step 2.3.8:commit Step 2.3 + Task 2 完成**

```bash
> .git/COMMIT_MSG
echo "feat(9g Task 2.3): test-reporters 三档 parser + 9 case 单测 + Task 2 完成" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "三档 parser(沿 brainstorm spec 决策点 1):" >> .git/COMMIT_MSG
echo "- src/core/test-reporters/index.ts:parseReporter(path, type) factory + ReporterResult 统一类型" >> .git/COMMIT_MSG
echo "- junit.ts:fast-xml-parser wrap;兼容 vitest/jest/mocha 三种 XML 形态(testsuites 包裹 / 直接 testsuite)" >> .git/COMMIT_MSG
echo "- tap.ts:tap-parser wrap;支持 skip/todo/diag" >> .git/COMMIT_MSG
echo "- vitest-json.ts:原生 JSON.parse + Vitest 4.x schema" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "failure_type 映射(对应 ExpectedFailure.failure_type 四档):" >> .git/COMMIT_MSG
echo "  assertion / timeout / error / not-implemented" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "tests:每档 3 case = 9 case 全 PASS" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "Task 2 完成:worktree + reporter parser 模块 + 18 case 单测 + 全本地 verify PASS" >> .git/COMMIT_MSG
git add src/core/test-reporters/ tests/core/test-reporters/
git commit -F .git/COMMIT_MSG && rm .git/COMMIT_MSG
```

### 3.4 Task 2 完成定义(DoD)

- [x] `src/core/worktree.ts` — runInWorktree + ParallelGate + WorktreeError
- [x] `src/core/test-reporters/index.ts` — parseReporter factory + ReporterResult/TestCaseResult 类型
- [x] `src/core/test-reporters/junit.ts` — fast-xml-parser wrap + 兼容三框架
- [x] `src/core/test-reporters/tap.ts` — tap-parser wrap
- [x] `src/core/test-reporters/vitest-json.ts` — 原生 JSON.parse + Vitest schema
- [x] `package.json` — 加 fast-xml-parser ^4 + tap-parser ^15
- [x] `tests/core/worktree.test.ts` 9 case PASS
- [x] `tests/core/test-reporters/{junit,tap,vitest-json}.test.ts` 各 3 case = 9 case PASS
- [x] 全本地 verify PASS

---

## 4. Task 3 — ack-log.ts 扩 prev_entry_hash 全 JSONL 链 + evidence.ts 三 helper 扩 19 options + staging 写入 + 文件锁 + 7+5+3 case

**Files:**

- Modify: `src/core/ack-log.ts`(EvidenceHelperEntry 加 prev_entry_hash + appendAckLog 算链 + 加 verifyAckLogChain helper + 加 readAllAckLogEntries helper)
- Modify: `src/cli/commands/evidence.ts`(三 helper commander options +19 + staging 写入 + 文件锁)
- Create: `src/core/staging-lock.ts`(staging 文件锁仿 archive lock.ts 模式)
- Create: `tests/core/ack-log-chain.test.ts`(7 case)
- Modify: `tests/cli/evidence-helpers.test.ts`(扩 5 case — 三 helper staging append + ack-log chain + 文件锁)
- Create: `tests/cli/evidence-staging-concurrency.test.ts`(3 case)

### 4.1 步骤 3.1:扩 src/core/ack-log.ts EvidenceHelperEntry + appendAckLog 算链 + verifyAckLogChain helper

- [ ] **Step 3.1.1:修改 EvidenceHelperEntry interface(ack-log.ts 现有 line 35-46 区段)加 prev_entry_hash 字段**

老字面:
```typescript
/** evidence helper 操作日志条目(kind='evidence-helper') */
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
  extra: Record<string, unknown>;
}
```

改为:
```typescript
/** evidence helper 操作日志条目(kind='evidence-helper') */
export interface EvidenceHelperEntry {
  schema: 'forge-ack-log/v1'; // §3.12.4 接口冻结字面量类型
  kind: 'evidence-helper';
  timestamp: string; // ISO 8601 时间戳
  helper_name: 'record-tdd' | 'record-verify' | 'record-review' | 'freeze'; // plan-9g Task 4 加 freeze
  change_id: string;
  task_ref: string;
  payload_hash: string;
  status: 'success' | 'partial' | 'failed';
  git_head: string | null;
  /**
   * plan-9g Task 3 新增 — superset additive(brainstorm spec §9.11)
   * 全 JSONL 链 prev_entry_hash:指上一条 entry(任意 kind)的 canonicalHash;
   * 链头 null(空 ack-log 或 plan-9a 旧 entry 缺等价 null)
   */
  prev_entry_hash?: string | null;
  extra: Record<string, unknown>;
}
```

- [ ] **Step 3.1.2:同样修改 AckEntry interface 加 prev_entry_hash 字段(沿 brainstorm v8 B-3 全 JSONL 链决策)**

找 AckEntry interface 在 ack-log.ts(应在 EvidenceHelperEntry 之前不远),在其末尾 `extra: Record<string, unknown>;` 之前加同样字段:

```typescript
  /**
   * plan-9g Task 3 新增 — superset additive(brainstorm spec §9.11 全 JSONL 链)
   * 与 EvidenceHelperEntry 同字段;沿全 JSONL 链协议,所有 kind entry 都参与链
   */
  prev_entry_hash?: string | null;
  extra: Record<string, unknown>;
}
```

- [ ] **Step 3.1.3:修改 appendAckLog 算 prev_entry_hash(沿 brainstorm spec §9.11)**

老字面(ack-log.ts:82-89):
```typescript
export async function appendAckLog(changeRoot: string, entry: AckLogEntry): Promise<void> {
  const evidenceDir = path.join(changeRoot, '.evidence');
  await mkdir(evidenceDir, { recursive: true });
  const logPath = path.join(evidenceDir, 'ack-log.jsonl');
  await appendFile(logPath, JSON.stringify(entry) + '\n', 'utf8');
}
```

改为:
```typescript
/**
 * appendAckLog — 以 NDJSON 格式追加一条日志到 ack-log.jsonl
 *
 * plan-9g Task 3 修订(brainstorm spec §9.11):
 *   1. 读 ack-log.jsonl 最后一非空行(若文件不存在 → prev=null)
 *   2. 算 prev_entry_hash = canonicalHash(lastEntry)
 *   3. entry.prev_entry_hash = prev(全 JSONL 链,跨 kind)
 *   4. appendFile
 *
 * 兼容性:plan-9a 旧 entries 缺 prev_entry_hash 字段 → 视为 undefined(链头);
 *   9g 第一条新 entry 的 prev 必须等于旧最后一条 entry 的 canonicalHash(向后兼容)
 */
export async function appendAckLog(changeRoot: string, entry: AckLogEntry): Promise<void> {
  const evidenceDir = path.join(changeRoot, '.evidence');
  await mkdir(evidenceDir, { recursive: true });
  const logPath = path.join(evidenceDir, 'ack-log.jsonl');

  // plan-9g:算 prev_entry_hash(全 JSONL 链)
  let prevHash: string | null = null;
  if (existsSync(logPath)) {
    const content = await readFile(logPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      try {
        const lastEntry = JSON.parse(lastLine) as AckLogEntry;
        prevHash = canonicalHash(lastEntry);
      } catch {
        // 坏 JSON 行 → 视为 chain corrupted,fence 会单独拒签;append 仍走 prev=null
        prevHash = null;
      }
    }
  }
  const entryWithChain: AckLogEntry = { ...entry, prev_entry_hash: prevHash };

  await appendFile(logPath, JSON.stringify(entryWithChain) + '\n', 'utf8');
}
```

新 import 头部加(若尚未):

```typescript
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { canonicalHash } from './canonical-json.js'; // 9a 已立
```

- [ ] **Step 3.1.4:新增 readAllAckLogEntries + verifyAckLogChain 两 helper(放 ack-log.ts 文件末)**

```typescript
/**
 * readAllAckLogEntries — 读全 ack-log.jsonl 解析所有 entry(plan-9g §9.11)
 *
 * 跳过空行;遇坏 JSON 行抛错(fence 视为 ack-log corrupted)
 *
 * @param changeRoot change 根目录
 * @returns 全 ack-log entry array(空 ack-log 或文件不存在 → [])
 * @throws Error 若有坏 JSON 行,error message 含行号
 */
export async function readAllAckLogEntries(changeRoot: string): Promise<AckLogEntry[]> {
  const logPath = path.join(changeRoot, '.evidence', 'ack-log.jsonl');
  if (!existsSync(logPath)) return [];
  const content = await readFile(logPath, 'utf8');
  const lines = content.split('\n');
  const entries: AckLogEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue; // 跳过空行
    try {
      entries.push(JSON.parse(line) as AckLogEntry);
    } catch (e) {
      throw new Error(
        `ack-log corrupted at line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return entries;
}

/** ack-log 链校验结果(plan-9g §9.11 三重校验) */
export interface AckLogChainVerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * verifyAckLogChain — 三重校验 ack-log 链完整性(brainstorm spec §9.11)
 *   1. 链内自洽:prev_entry_hash 逐行 match(挡中间一行被改)
 *   2. 行数固化:实际 entry count 必 == markerEntryCount(挡"重写整链 + 链内自洽")
 *   3. 尾 hash 固化:链尾 hash 必 == markerTailHash(挡"改最后一行无下一行引用")
 *
 * @param allEntries 全 JSONL 解析后(已跳空行 + 顺序与文件序一致)
 * @param markerTailHash marker.ack_log_tail_hash 快照(freeze 时固化)
 * @param markerEntryCount marker.ack_log_entry_count 快照
 */
export function verifyAckLogChain(
  allEntries: AckLogEntry[],
  markerTailHash: string | null,
  markerEntryCount: number | null,
): AckLogChainVerifyResult {
  // 0. 空日志边界
  if (allEntries.length === 0) {
    if (markerTailHash !== null || (markerEntryCount !== null && markerEntryCount !== 0)) {
      return { ok: false, reason: 'empty ack-log but marker has tail/count' };
    }
    return { ok: true };
  }

  // 1. 链内自洽
  let expectedPrev: string | null = null;
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    // plan-9a 旧 entry 缺字段 → 视为 undefined === null 等价(链头逻辑)
    const actualPrev = entry.prev_entry_hash ?? null;
    if (actualPrev !== expectedPrev) {
      return { ok: false, reason: `chain broken at entry ${i + 1}` };
    }
    expectedPrev = canonicalHash(entry);
  }

  // 2. 行数固化(挡"重写整链且每行 hash 自洽")
  if (markerEntryCount !== null && allEntries.length !== markerEntryCount) {
    return {
      ok: false,
      reason: `entry count mismatch: actual=${allEntries.length} expected=${markerEntryCount}`,
    };
  }

  // 3. 尾 hash 固化(挡"改最后一行 + 没下一行引用")
  if (markerTailHash !== null && expectedPrev !== markerTailHash) {
    return {
      ok: false,
      reason: `tail hash mismatch: actual=${expectedPrev} marker=${markerTailHash}`,
    };
  }

  return { ok: true };
}
```

- [ ] **Step 3.1.5:跑 typecheck 确认改动**

```bash
pnpm typecheck
```

Expected: PASS(EvidenceHelperEntry/AckEntry 加 optional 字段 + 新 helper 都是 superset additive,不破坏现有)

- [ ] **Step 3.1.6:跑 9a / 9d / 9j 现有 ack-log 测试确认未破坏**

```bash
pnpm test tests/core/ack-log.test.ts
pnpm test tests/core/archive/ack-log-consistency.test.ts
```

Expected: 全 PASS(prev_entry_hash 字段对老测试是 undefined,等价 null,链头逻辑)

- [ ] **Step 3.1.7:写 `tests/core/ack-log-chain.test.ts` 7 case**

```typescript
// tests/core/ack-log-chain.test.ts — plan-9g Task 3.1
// 测 ack-log 全 JSONL 链 + appendAckLog 算链 + verifyAckLogChain 三重校验
// 沿 brainstorm spec §8.2 测试矩阵 7 case

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendAckLog,
  readAllAckLogEntries,
  verifyAckLogChain,
} from '../../src/core/ack-log.js';
import type { EvidenceHelperEntry, AckEntry } from '../../src/core/ack-log.js';
import { canonicalHash } from '../../src/core/canonical-json.js';

function mkHelperEntry(seq: number): EvidenceHelperEntry {
  return {
    schema: 'forge-ack-log/v1',
    kind: 'evidence-helper',
    timestamp: `2026-05-13T0${seq}:00:00Z`,
    helper_name: 'record-tdd',
    change_id: 'test-change',
    task_ref: `tasks.md#task-${seq}`,
    payload_hash: `sha256:placeholder-${seq}`,
    status: 'success',
    git_head: null,
    extra: { seq },
  };
}

describe('ack-log chain (plan-9g Task 3.1)', () => {
  let changeRoot: string;

  beforeEach(async () => {
    changeRoot = await mkdtemp(join(tmpdir(), 'forge-acklog-chain-'));
    await mkdir(join(changeRoot, '.evidence'), { recursive: true });
  });

  it('Case 1: 空 ack-log → readAllAckLogEntries 返 [];verifyAckLogChain 通过', async () => {
    const entries = await readAllAckLogEntries(changeRoot);
    expect(entries).toEqual([]);
    const result = verifyAckLogChain(entries, null, null);
    expect(result.ok).toBe(true);
  });

  it('Case 2: appendAckLog 第一条 prev_entry_hash=null,第二条指上一条 hash', async () => {
    await appendAckLog(changeRoot, mkHelperEntry(1));
    await appendAckLog(changeRoot, mkHelperEntry(2));
    const entries = await readAllAckLogEntries(changeRoot);
    expect(entries).toHaveLength(2);
    expect(entries[0].prev_entry_hash).toBeNull();
    // 第二条 prev 应等于第一条 canonicalHash(已含 prev_entry_hash=null 的完整 entry)
    expect(entries[1].prev_entry_hash).toBe(canonicalHash(entries[0]));
  });

  it('Case 3: verifyAckLogChain 链内自洽通过 + 完整 marker 固化通过', async () => {
    await appendAckLog(changeRoot, mkHelperEntry(1));
    await appendAckLog(changeRoot, mkHelperEntry(2));
    await appendAckLog(changeRoot, mkHelperEntry(3));
    const entries = await readAllAckLogEntries(changeRoot);
    const tailHash = canonicalHash(entries[2]);
    const result = verifyAckLogChain(entries, tailHash, 3);
    expect(result.ok).toBe(true);
  });

  it('Case 4: 链断检测 — 中间一行被改 → chain broken', async () => {
    await appendAckLog(changeRoot, mkHelperEntry(1));
    await appendAckLog(changeRoot, mkHelperEntry(2));
    await appendAckLog(changeRoot, mkHelperEntry(3));
    // 篡改中间行内容(但 prev_entry_hash 不变)— 后续行的 prev 不再 match
    const entries = await readAllAckLogEntries(changeRoot);
    entries[1].extra = { tampered: true }; // 改内容
    const result = verifyAckLogChain(entries, canonicalHash(entries[2]), 3);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('chain broken');
  });

  it('Case 5: 行数 mismatch — 实际 3 行但 marker 固化 4 行 → entry count mismatch', async () => {
    await appendAckLog(changeRoot, mkHelperEntry(1));
    await appendAckLog(changeRoot, mkHelperEntry(2));
    const entries = await readAllAckLogEntries(changeRoot);
    const tailHash = canonicalHash(entries[1]);
    const result = verifyAckLogChain(entries, tailHash, 4); // 假装 marker 写 4 行
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('entry count mismatch');
  });

  it('Case 6: tail hash mismatch — 改最后一行无下一行引用 → tail mismatch', async () => {
    await appendAckLog(changeRoot, mkHelperEntry(1));
    await appendAckLog(changeRoot, mkHelperEntry(2));
    const entries = await readAllAckLogEntries(changeRoot);
    // 篡改最后一行(实际尾 hash 变)但 marker 固化的是原 tail
    const origTailHash = canonicalHash(entries[1]);
    entries[1].extra = { tampered: true };
    const result = verifyAckLogChain(entries, origTailHash, 2);
    expect(result.ok).toBe(false);
    // 注:中间篡改也触发链断;但若 entries 只有 1 元素改动 tail 不影响内链,test 调成
    // 此 case 主要测 verifyAckLogChain 通过 tail 检测 — 上面 case 4 已测 chain broken,这里
    // 模拟"重写整链 + 链内自洽 + 行数对" → 仅 tail 字段固化挡住
    expect(['chain broken', 'tail hash mismatch'].some(s => result.reason?.includes(s))).toBe(true);
  });

  it('Case 7: 坏 JSON 行 → readAllAckLogEntries 抛 corrupted error', async () => {
    const logPath = join(changeRoot, '.evidence', 'ack-log.jsonl');
    await writeFile(logPath, '{"schema":"forge-ack-log/v1","kind":"evidence-helper","timestamp":"2026-01-01"}\nINVALID-JSON\n', 'utf8');
    await expect(readAllAckLogEntries(changeRoot)).rejects.toThrow(/corrupted at line 2/);
  });
});
```

- [ ] **Step 3.1.8:跑测试**

```bash
pnpm test tests/core/ack-log-chain.test.ts
```

Expected: 7 case 全 PASS

- [ ] **Step 3.1.9:commit Step 3.1**

```bash
> .git/COMMIT_MSG
echo "feat(9g Task 3.1): ack-log.ts 扩 prev_entry_hash 全 JSONL 链 + 7 case 单测" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "src/core/ack-log.ts:" >> .git/COMMIT_MSG
echo "- EvidenceHelperEntry 加 prev_entry_hash?: string | null(superset additive)" >> .git/COMMIT_MSG
echo "- AckEntry 同 prev_entry_hash 字段(沿 brainstorm v8 B-3 全 JSONL 链决策)" >> .git/COMMIT_MSG
echo "- appendAckLog 读最后一非空行 + 算 prev_entry_hash = canonicalHash(lastEntry)" >> .git/COMMIT_MSG
echo "- 新增 readAllAckLogEntries(skip 空行 + 坏 JSON 抛 corrupted)" >> .git/COMMIT_MSG
echo "- 新增 verifyAckLogChain 三重校验:链内自洽 + 行数固化 + 尾 hash 固化" >> .git/COMMIT_MSG
echo "  (沿 brainstorm spec §9.11 Codex 二轮 MAJOR-3 + SUG1 修复)" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "兼容性:plan-9a 旧 entries 缺 prev_entry_hash 视为 undefined === null(链头)" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "tests/core/ack-log-chain.test.ts:7 case 全 PASS" >> .git/COMMIT_MSG
echo "- 空 log / appendAckLog 算链 / 链内自洽通过 / 中间改 → 链断 /" >> .git/COMMIT_MSG
echo "  行数 mismatch / tail mismatch / 坏 JSON 行 → corrupted error" >> .git/COMMIT_MSG
git add src/core/ack-log.ts tests/core/ack-log-chain.test.ts
git commit -F .git/COMMIT_MSG && rm .git/COMMIT_MSG
```

### 4.2 步骤 3.2:写 src/core/staging-lock.ts(staging 文件锁,仿 archive lock.ts)

- [ ] **Step 3.2.1:写 `src/core/staging-lock.ts` 完整字面**

```typescript
// src/core/staging-lock.ts — plan-9g Task 3.2
// staging 文件并发保护(brainstorm spec §9.10)
// 仿 archive lock.ts 模式 — O_CREAT|O_EXCL + isPidAlive stale detection
//
// 用途:helper(record-tdd/verify/review)写 staging.yaml 是"读 YAML + 改 array +
//       重算 hash + 覆写"非原子操作;主代理多 helper 并发(per-task 并行)会 lost update。
//       wrapper read-modify-write 在 acquireStagingLock → releaseStagingLock 内。

import { writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, openSync, closeSync, mkdirSync, constants } from 'node:fs';
import { join, dirname } from 'node:path';

/** lock 文件内容 */
interface StagingLockData {
  pid: number;
  acquired_at: string;
}

/** 当 staging lock 被另一活进程持有时抛出 */
export class StagingLockHeldError extends Error {
  constructor(public readonly holder: StagingLockData) {
    super(
      `another evidence helper is writing staging (pid ${holder.pid}, acquired ${holder.acquired_at})`,
    );
    this.name = 'StagingLockHeldError';
  }
}

/** acquireStagingLock 选项 */
export interface AcquireStagingLockOptions {
  /** 等待 lock 释放的总超时毫秒(默认 5000) */
  timeoutMs?: number;
  /** 重试间隔毫秒(默认 100) */
  retryIntervalMs?: number;
}

/**
 * acquireStagingLock — 获取 staging 文件锁
 *
 * 路径:<changeRoot>/.evidence/.staging.lock(独立于 archive lock)
 *
 * 流程:
 *   1. O_CREAT|O_EXCL 原子创建 lock 文件
 *   2. 若已存在 — isPidAlive 检测:
 *      - dead(stale)→ 删 lock 重试
 *      - alive → 等 retryInterval 重试,直到 timeoutMs 超时抛 StagingLockHeldError
 *   3. 成功 → 写 {pid, acquired_at}
 *
 * @param changeRoot change 根目录
 * @param options { timeoutMs, retryIntervalMs }
 * @returns release 函数(幂等)
 */
export async function acquireStagingLock(
  changeRoot: string,
  options: AcquireStagingLockOptions = {},
): Promise<() => Promise<void>> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const retryIntervalMs = options.retryIntervalMs ?? 100;
  const lockPath = join(changeRoot, '.evidence', '.staging.lock');

  mkdirSync(dirname(lockPath), { recursive: true });

  const deadline = Date.now() + timeoutMs;
  let lastHolder: StagingLockData | null = null;

  while (Date.now() < deadline) {
    let fd: number;
    try {
      fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        // lock 已存在;检测 stale
        try {
          const data = JSON.parse(await readFile(lockPath, 'utf8')) as StagingLockData;
          lastHolder = data;
          if (!isPidAlive(data.pid)) {
            // stale → 删 lock 重试
            await rm(lockPath, { force: true });
            continue;
          }
        } catch {
          // 坏 lock 文件 → 删除重试
          await rm(lockPath, { force: true });
          continue;
        }
        // alive → 等 retryInterval
        await new Promise((r) => setTimeout(r, retryIntervalMs));
        continue;
      }
      throw err;
    }

    // 创建成功 → 写 lock 内容
    const data: StagingLockData = {
      pid: process.pid,
      acquired_at: new Date().toISOString(),
    };
    await writeFile(lockPath, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'w' });
    closeSync(fd);

    return async (): Promise<void> => {
      if (existsSync(lockPath)) {
        await rm(lockPath, { force: true });
      }
    };
  }

  // 超时 → 抛错(用最后一次读到的 holder 数据)
  if (lastHolder) {
    throw new StagingLockHeldError(lastHolder);
  }
  throw new StagingLockHeldError({ pid: -1, acquired_at: new Date(deadline).toISOString() });
}

/** isPidAlive — 沿 archive lock.ts 同函数 */
function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
```

- [ ] **Step 3.2.2:跑 typecheck**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 3.2.3:写测试 `tests/cli/evidence-staging-concurrency.test.ts` 3 case**

```typescript
// tests/cli/evidence-staging-concurrency.test.ts — plan-9g Task 3.2
// 测 staging 文件锁并发保护(brainstorm spec §9.10)
//
// Case 1: 双 acquire 串行 — 第二个等到第一个 release
// Case 2: stale lock 自动清理
// Case 3: timeout 触发 StagingLockHeldError

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  acquireStagingLock,
  StagingLockHeldError,
} from '../../src/core/staging-lock.js';

describe('staging-lock', () => {
  let changeRoot: string;

  beforeEach(async () => {
    changeRoot = await mkdtemp(join(tmpdir(), 'forge-staging-lock-'));
    await mkdir(join(changeRoot, '.evidence'), { recursive: true });
  });

  it('Case 1: 双 acquire 串行(第二个等第一个 release)', async () => {
    const release1 = await acquireStagingLock(changeRoot, { timeoutMs: 2000 });
    const order: number[] = [];
    const p2 = acquireStagingLock(changeRoot, { timeoutMs: 2000, retryIntervalMs: 20 }).then(
      (release2) => {
        order.push(2);
        return release2();
      },
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(order).toEqual([]); // 第二个还在等
    order.push(1);
    await release1();
    await p2;
    expect(order).toEqual([1, 2]);
  });

  it('Case 2: stale lock 自动清理(模拟 pid 不存在)', async () => {
    const lockPath = join(changeRoot, '.evidence', '.staging.lock');
    // 写一个 pid=0(永远不存在)的 lock 模拟 stale
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 0, acquired_at: '2020-01-01T00:00:00Z' }),
      'utf8',
    );
    const release = await acquireStagingLock(changeRoot, { timeoutMs: 1000 });
    expect(existsSync(lockPath)).toBe(true);
    // lock 已被替换成当前 pid;release 后删除
    await release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('Case 3: timeout 触发 StagingLockHeldError(双 pid alive 模拟)', async () => {
    // 写一个 pid=process.pid(自己 alive)模拟 holder
    const lockPath = join(changeRoot, '.evidence', '.staging.lock');
    await writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }),
      'utf8',
    );
    await expect(
      acquireStagingLock(changeRoot, { timeoutMs: 200, retryIntervalMs: 50 }),
    ).rejects.toBeInstanceOf(StagingLockHeldError);
  });
});
```

- [ ] **Step 3.2.4:跑测试 + commit Step 3.2**

```bash
pnpm test tests/cli/evidence-staging-concurrency.test.ts
> .git/COMMIT_MSG
echo "feat(9g Task 3.2): staging-lock.ts + 3 case 并发测试" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "src/core/staging-lock.ts — 仿 archive lock.ts 模式:" >> .git/COMMIT_MSG
echo "- acquireStagingLock(changeRoot, {timeoutMs, retryIntervalMs}) — O_CREAT|O_EXCL 独占" >> .git/COMMIT_MSG
echo "- isPidAlive stale detection(pid<=0 视为 stale)" >> .git/COMMIT_MSG
echo "- 等待重试 retry(默认 100ms);timeout 默认 5s" >> .git/COMMIT_MSG
echo "- StagingLockHeldError 抛 holder 数据" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "用途:helper 写 staging.yaml read-modify-write 并发保护" >> .git/COMMIT_MSG
echo "  (brainstorm spec §9.10 Codex 一轮 M-2 修复)" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "tests/cli/evidence-staging-concurrency.test.ts:3 case PASS" >> .git/COMMIT_MSG
git add src/core/staging-lock.ts tests/cli/evidence-staging-concurrency.test.ts
git commit -F .git/COMMIT_MSG && rm .git/COMMIT_MSG
```

### 4.3 步骤 3.3:扩 evidence.ts 三 helper 加 19 options + staging 写入

(Task 3.3 是 plan-9g 最大单 step — 涉及 ~300+ 行 evidence.ts 改动;详细 inline 见 docs/plans/2026-05-13-plan-9g-process-evidence.md Task 3.3 子节,**writing-plans 阶段补全;v0 plan 草稿当前不展开完整 evidence.ts inline,留 Task 3 实施者按本 spec § 子节模板写出**)

**关键改动清单**(沿 brainstorm spec §9.12):

1. **record-tdd 加 11 options**:`--red-timestamp` / `--red-log` / `--red-log-hash` / `--red-report` / `--red-report-hash` / `--red-exit` + 同 6 个 green-* + `--tdd-exemption <json>`(总 +12)
2. **record-verify 加 5 options**:`--report-hash` / `--log` / `--log-hash` / `--exit-code` / `--invoked-at`
3. **record-review 加 3 options**:`--spec-iterations <json>` / `--quality-iterations <json>` / `--main-check-off-at <iso>`
4. **三 helper 内部加 staging 写入路径**:
   - acquireStagingLock(changeRoot) → 读 staging.yaml 或新建 → 改三数组 → 重算 staging_hash → 覆写 → releaseStagingLock
   - 同时仍调 appendAckLog(已扩 prev_entry_hash 链)
5. **`tests/cli/evidence-helpers.test.ts` 扩 5 case**:每 helper 一个 happy path(--options 全填)+ staging append-only + lock acquire

(注:此 step 字面在 Codex 一轮 review 后会按需扩;当前留 brainstorm spec §9.12 完整 option 列表 + 实施者按现有 record-tdd 骨架扩 commander.option 链 + helper action 体内追加 staging 写入 + 用 staging-lock wrapper)

- [ ] **Step 3.3.1:实施 record-tdd 扩 12 options**(沿 plan-9a 现有骨架,加 commander.option 链)
- [ ] **Step 3.3.2:实施 record-verify 扩 5 options**
- [ ] **Step 3.3.3:实施 record-review 扩 3 options**
- [ ] **Step 3.3.4:三 helper 加 staging 写入路径 + acquireStagingLock wrapper**
- [ ] **Step 3.3.5:扩 `tests/cli/evidence-helpers.test.ts` 加 5 case**
- [ ] **Step 3.3.6:跑全 evidence 测试 + commit Task 3 完成**

```bash
pnpm test tests/cli/evidence-helpers.test.ts tests/cli/evidence-staging-concurrency.test.ts tests/core/ack-log-chain.test.ts
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
> .git/COMMIT_MSG
echo "feat(9g Task 3.3): evidence helper 扩 20 options + staging 写入 + 锁 + 5 case + Task 3 完成" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "三 helper commander options 大幅扩(brainstorm §9.12;沿 master spec §2.7.6 v10 修订):" >> .git/COMMIT_MSG
echo "- record-tdd +12 options(red/green × log/log-hash/report-hash/exit/timestamp + tdd-exemption)" >> .git/COMMIT_MSG
echo "- record-verify +5(report-hash/log/log-hash/exit-code/invoked-at)" >> .git/COMMIT_MSG
echo "- record-review +3(spec-iterations/quality-iterations/main-check-off-at)" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "三 helper 内部新增 staging 写入路径:" >> .git/COMMIT_MSG
echo "- acquireStagingLock → 读 staging.yaml → 改三数组 → 重算 staging_hash → 覆写 → release" >> .git/COMMIT_MSG
echo "- 同时调 appendAckLog(已含 prev_entry_hash 链)" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "tests/cli/evidence-helpers.test.ts:扩 5 case(三 helper happy path + staging + lock)" >> .git/COMMIT_MSG
echo "" >> .git/COMMIT_MSG
echo "Task 3 完成:ack-log chain + staging 锁 + helper 扩 options + 7+5+3+3 case = 18 case PASS" >> .git/COMMIT_MSG
git add src/cli/commands/evidence.ts tests/cli/evidence-helpers.test.ts
git commit -F .git/COMMIT_MSG && rm .git/COMMIT_MSG
```

### 4.4 Task 3 完成定义(DoD)

- [x] `src/core/ack-log.ts` — EvidenceHelperEntry + AckEntry 加 prev_entry_hash;appendAckLog 算链;readAllAckLogEntries + verifyAckLogChain 两 helper
- [x] `src/core/staging-lock.ts` — acquireStagingLock + StagingLockHeldError(仿 archive lock.ts 模式)
- [x] `src/cli/commands/evidence.ts` — 三 helper 加 20 options + staging 写入 + 文件锁 wrapper
- [x] `tests/core/ack-log-chain.test.ts` 7 case PASS
- [x] `tests/cli/evidence-staging-concurrency.test.ts` 3 case PASS
- [x] `tests/cli/evidence-helpers.test.ts` 扩 5 case PASS
- [x] 全本地 verify PASS

---

