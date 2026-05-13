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

