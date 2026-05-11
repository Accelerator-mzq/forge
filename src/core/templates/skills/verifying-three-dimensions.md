---
name: forge:verifying-three-dimensions
description: Use when verifying a forge change — analyze Completeness / Correctness / Coherence three dimensions to produce verify_findings with concrete evidence and severity, instead of degenerate "tests pass" binary
---

# forge verifying-three-dimensions

> 本 skill 走 `forge:writing-skills` 协议开发(非 bootstrap exception,沿 design §2.9.5 dogfood)。SKILL.md + scenarios 经过 RED → GREEN → REFACTOR 完整链(plan-9d Task 1 + Task 2 + Task 7)。

## Overview

forge v0.4 的 verify 阶段退化为"测试 pass + log_hash"二值判定(沿 design §2.2.1)。测试 pass 不等于实施完整 — spec 里没被测试覆盖的 Requirement 完全不会被发现。本 skill 移植 OpenSpec `verify-change.ts` 的三维度方法论,把 verify 阶段从二值判定升级为带证据的 finding 数组,**配合 forge fence 反向加固让 AI 不能偷懒推 SUGGESTION**。

## Methodology (reference superpowers 上游)

**REQUIRED BACKGROUND**:必须先懂 `forge:verification-before-completion`(证据先于声称的纪律)。

核心论点:

- "测试 pass 不等于 spec 覆盖 — 没测试覆盖的 Requirement 完全无声音失败"(沿 design §2.2.1)
- 三维度协议来自 OpenSpec `src/core/templates/workflows/verify-change.ts` 第 4-7 步,forge 化的关键是**反向加固 AI 倾向**:OpenSpec verify-change.ts:152 "When uncertain, prefer SUGGESTION over WARNING" 在 AI 手里是放水按钮(沿 design §2.2.4 关键差异化)

## When to Use

- `/forge:verify <change-id>` slash command 调用本 skill(沿 commands/verify.md 重构后协议)
- AI agent 主体在 verify 阶段产 `.verify-passed` / `.verify-failed` marker 的 `verify_findings` 数组前
- 手动 review 一个 change 实施完整度(三维度作为 checklist)

## When NOT to Use

- 写 `forge plan`(那是 `forge:writing-plans`)
- 写新 skill(那是 `forge:writing-skills`)
- code review(那是 `forge:receiving-code-review` 或 `/forge:review` slash)
- archive 阶段 fence 校验(那是 `forge archive` CLI 自动做,不需 AI 调 skill;沿 design §2.2.4)

## 三维度协议

| 维度 | 检查项 | 自动 / LLM | 产 finding 路径 |
|---|---|---|---|
| **Completeness** | task 完成度(checkbox 计数) | 自动 | `forge validate` 已做(走 ValidationError → Finding;沿 plan-9d Task 4) |
| | spec 覆盖度(每个 Requirement 在 codebase 有实施证据) | 自动 + LLM | `forge validate` 已做(走 coverage_gap candidate,沿 §11.1bis;grep + 0 命中);AI 调本 skill 在 grep 命中后再判语义偏离 |
| **Correctness** | requirement 实施映射(file:line) | LLM(本 skill) | AI 调本 skill 给具体 file:line |
| | scenario 覆盖(WHEN/THEN/AND 条件在 code 或 test 中体现) | LLM(本 skill) | AI 调本 skill 给 file:line + scenario-id |
| **Coherence** | design 决策追溯(design.md `## Decision:` / `## Approach:` 段是否被实施) | LLM(本 skill) | AI 调本 skill grep design.md 关键词 + 比对 codebase |
| | 代码 pattern 一致性(命名 / 目录 / 风格 vs 项目惯例) | LLM(本 skill) | AI 调本 skill 比对项目惯例 → 通常产 SUGGESTION |

### 主流程

每次 verify 必须**三维度全跑**,不允许跳维度:

1. **Completeness**:
   - 先看 `forge validate` 自动产的 finding(含 spec-files-missing / coverage_gap 类,沿 §11.1bis)
   - 对 spec 每个 Requirement,grep codebase 找实施证据;**完全无证据 → CRITICAL `coverage_gap`**(automated=true,工具自动判,沿 design line 446;若 spec 列了但 grep 0 命中,validate 已自动产此类 finding,AI 调本 skill 时合并即可)
   - 对 tasks.md 标 [x] 但 git diff 反向 0 改动:走 `fake_completion` 路径(verify slash 阶段 AI 主动跑 `git diff` 产 CRITICAL finding,automated=true,candidate_type 不填 — 沿 v3 B-3 边界 case;**不**走 evidence_missing,因 evidence_missing 语义是 evidence.log_path 文件缺失,不同)
2. **Correctness**:
   - 对 spec 每个 Requirement,定位实施 file:line;**WHEN/THEN/AND scenario 在 test 或 code 中找证据;若找不到 → WARNING `scenario-coverage`**
3. **Coherence**:
   - design.md `## Decision:` / `## Approach:` 段提到的关键词,grep codebase 比对;**实施偏离决策 → WARNING `design-traceability`**
   - 命名 / 目录 / 风格比对项目惯例;**偏离 → SUGGESTION `pattern-consistency`**(沿 _shared/scope-category-guidance.md)

每个 finding 必须填(8 必填字段沿 design §2.2.3 + master §3.12.1):

- `id`(单调递增整数)
- `dimension`(`completeness` / `correctness` / `coherence`)
- `check_type`(细分,如 `task-completion` / `spec-coverage` / `requirement-mapping` / `scenario-coverage` / `design-traceability` / `pattern-consistency`)
- `severity`(`CRITICAL` / `WARNING` / `SUGGESTION`)
- `automated`(true if 工具可判,false if LLM 判)
- `evidence`(必须含 file:line 或 spec:Requirement-id 或 design.md:段落标题;**禁止 vague "could be reviewed"**)
- `recommendation`(具体下一步,如 "在 src/auth/rate-limit.ts 加 sliding-window 实现" — 不允许 "consider reviewing")
- `resolved`(true / false)

## 4-6 标定 example

### Example 1 — Completeness/spec-coverage CRITICAL(automated)

```yaml
- id: 1
  dimension: completeness
  check_type: spec-coverage
  severity: CRITICAL
  automated: true                  # 工具可判 — codebase grep 0 个 file 提及该 Requirement 关键词
  evidence: "specs/auth/spec.md Requirement #3 'refresh rate limit' 在 src/auth/ 0 个 file 提及 'rate-limit' / 'rateLimit' / 'throttle' 关键词"
  recommendation: "在 src/auth/rate-limit.ts 实现 sliding-window 限流,或修订 spec 移除 #3"
  resolved: false
```

**为什么 CRITICAL automated**:工具可独立验证(grep + AST 双重 0 命中是机器判定),沿 design §2.3.3 critical_candidate 协议 candidate_type=`coverage_gap`(spec 列 requirement 但 codebase 完全 0 命中,沿 design line 446)。AI 不能降级。**注**:`evidence_missing` 是 candidate_type 6 类之一但语义不同 — 它检查 `evidence.log_path` 文件是否存在(沿 design line 445),不适用于本 example 的 spec→codebase 覆盖检查。

### Example 2 — Correctness/requirement-mapping WARNING(LLM)

```yaml
- id: 2
  dimension: correctness
  check_type: requirement-mapping
  severity: WARNING
  automated: false                 # LLM 判 — 需 AI 比对 spec 描述 vs 实施语义
  evidence: "specs/auth/spec.md Requirement #2 'expiry window 默认 24h' 在 src/auth/refresh.ts:42 实现为 expiryHours = 12(与 spec 不一致)"
  recommendation: "改 expiryHours = 24,或修订 spec 改默认值"
  resolved: false
  severity_acked_by: null          # WARNING 必须 ack 才能 archive
  severity_acked_at: null
```

**为什么 WARNING**:语义不一致非 0/1 判定(LLM 需读 spec + 代码语境),且可改 → 不该 CRITICAL 强 fence。AI ack 路径走 `forge ack propose`(沿 9a)。

### Example 3 — Coherence/design-traceability WARNING(LLM)

```yaml
- id: 3
  dimension: coherence
  check_type: design-traceability
  severity: WARNING
  automated: false
  evidence: "design.md '## Decision: 选用 sliding-window 限流' 在 src/auth/ 实施为 fixed-window(rate-limit.ts:15 用 expiryAt + bucket 模式,sliding-window 关键词 0 命中)"
  recommendation: "实施 sliding-window(按 design 决策),或修订 design.md 改决策为 fixed-window 并写理由"
  resolved: false
  severity_acked_by: null
  severity_acked_at: null
```

**为什么 WARNING 而非 CRITICAL**:design 决策偏离不直接威胁系统正确性(沿 design §2.3.2),但需用户 ack。

### Example 4 — Coherence/pattern-consistency SUGGESTION(LLM)

```yaml
- id: 4
  dimension: coherence
  check_type: pattern-consistency
  severity: SUGGESTION
  automated: false
  evidence: "src/auth/login.ts:23 函数名 doLogin 与项目 7 个 handler 文件 (src/handlers/) 统一 handleXxx 命名风格不一致"
  recommendation: "rename doLogin → handleLogin"
  resolved: false                  # SUGGESTION 不要求 resolved,允许带 finding archive
```

**为什么 SUGGESTION**:命名风格非核心目标 + 可不改 + 改起来简单,符合 _shared/scope-category-guidance.md "本 change 内 nice-to-have" 判定。

### Example 5 — Completeness/task-completion CRITICAL(automated,verify slash 阶段产)

```yaml
- id: 5
  dimension: completeness
  check_type: task-completion
  severity: CRITICAL
  automated: true                  # 工具自动判 — git diff 是机器判定
  # 注:candidate_type 字段不填(下文解释)
  evidence: "tasks.md#task-4 '加 rate-limit middleware' 标 [x] 但 git diff src/middleware/ 无相关改动(命令:git diff HEAD~1 -- src/middleware/)"
  recommendation: "完成 task-4 实施,或把 task-4 改回 [ ]"
  resolved: false
```

**注**(v3 B-3 修订):本类 finding(标 [x] 但 git diff 空,即 fake-completion)由 `/forge:verify` slash 阶段 AI 调本 skill 时**主动跑 `git diff <previous-base>..HEAD -- <expected-path>` 命令**产生(plan-9d v2 Task 4 `forge validate` CLI 仅产 `coverage_gap` spec-side 类 finding + `test_failure` stub,**不内嵌 git CLI** — git diff fake-completion 检测在 verify slash 路径产,沿 commands/verify.md Task 5)。automated=true 合理:git diff 命令输出是机器判定。

**关于 candidate_type 字段**:design line 443-448 列了 6 类 enum(test_failure / hash_mismatch / evidence_missing / coverage_gap / api_contract / manual_claim),但本 example "task 标 [x] 但 git diff 反向 0 改动" 不严格归入任何一类:

- **不是 `coverage_gap`**(spec→code 方向的 grep,本 example 是 task→code 方向的 git diff 反向)
- **不是 `manual_claim`**(manual_claim 工具不能自动判;本 example git diff 可自动判)
- **不是 `hash_mismatch`**(hash_mismatch 重算 tasks_hash/content_hash/log_hash/git.diff_hash,task 标 [x] 后 hash 已更新无 mismatch)
- **`fake_completion`** 不在 design 6 类 enum 之内(`Finding.candidate_type` 是 optional 字段,沿 9a severity.ts:75;不填合规)

**v1.0 处理**:`candidate_type` 字段不填(沿 9a Finding.candidate_type 是 optional);check_type=`task-completion` 即可区分本类。**v1.1 计划**:design §3.1 推迟项可加 `fake_completion` candidate_type 第 7 类(若 verify slash 场景多,值得正式 enum 化)。

**为什么 automated=true 仍合理**:design §2.3.3 表区分"工具自动产 CRITICAL"(line 457)与"AI 候选 + 工具验证"两种路径 — `git diff` 是工具自动判,落"工具自动产"路径(line 457 "forge validate 跑测试 fail / 算 hash mismatch / process_evidence 不变量违反等"语义涵盖 git diff 类工具自动判),不需要走 candidate 路径。

### Example 6 — Correctness/scenario-coverage SUGGESTION(LLM)

```yaml
- id: 6
  dimension: correctness
  check_type: scenario-coverage
  severity: SUGGESTION
  automated: false
  evidence: "specs/auth/spec.md Scenario 'expired token retry' 的 WHEN/THEN/AND 在 tests/auth/refresh.test.ts 仅覆盖 happy-path,边缘 case (token 刚过期) 无 test"
  recommendation: "加 tests/auth/refresh.test.ts:'expired-token retry edge case'"
  resolved: false
```

**为什么 SUGGESTION**:增测试是 nice-to-have(主流程已测),不影响 core verify pass。

## forge-specific 反向加固

forge v1.0 比 OpenSpec verify-change.ts 走更远 — 假设 AI 在 verify 阶段倾向偷懒。本 skill 配合 fence 反向加固:

### 1. automated=true CRITICAL 不可降级

工具自动判的 CRITICAL findings(v8 M-1 修订:口径与 §11.1bis 一致):

- `forge validate` 阶段产:**spec-files-missing**(specs/ 空)+ **coverage_gap**(spec Requirement grep 0 命中)
- `forge archive` 现有路径产:**hash_mismatch**(marker tasks_hash / content_hash 重算不一致,line 274-289)
- `/forge:verify` slash AI 调 skill 阶段产:**fake_completion**(tasks 标 [x] 但 git diff 反向 0 改动,automated=true 因 git 是机器判定;candidate_type 字段不填,沿 v3 B-3 边界 case)
- **不在 v1.0 实施**(沿 §11.1bis):`evidence_missing` 由 9a candidate-validators.ts framework 处理 / `api_contract` 推迟 v1.1 / `manual_claim` 走 9a ack 流程 / `test_failure` 走 stub warning,9g 完成后接 reporter parser

上述所有 CRITICAL finding 都由对应工具产 `finding_hash`(JCS SHA256,沿 9a `computeFindingHash`):

- AI 改 severity 重算 hash 即不一致 → archive fence 拒签(沿 design §2.2.4)
- AI 改 evidence / recommendation 也会改 hash,同样拒签
- AI 唯一合规路径:走 `forge ack propose` 启动两步 ack 流程(沿 9a;CI 模式直接拒绝)

### 2. WARNING 必须 ack 才能 archive

LLM 判的 WARNING(automated=false)路径:

- AI 必须真给具体证据 + 具体 recommendation(不允许 vague "consider reviewing")
- archive 阶段 fence 校验 `severity_acked_by` + `severity_acked_at` 非空,否则拒签

### 3. SUGGESTION 不是放水按钮

OpenSpec verify-change.ts:152 "When uncertain, prefer SUGGESTION over WARNING" 在 forge 是 anti-pattern:

- SUGGESTION 累积到 `archive_summary` 的 `pending_suggestions` 数组(沿 9e),v1.1 backlog registry 全表索引(沿 design §3.1)
- AI 偷懒推 SUGGESTION 会留下持续可见的 SUGGESTION 堆积反向暴露
- 沿 `skills/_shared/scope-category-guidance.md`:"本 change 不做但跨 change 项" 应走 Out of Scope / Future Work / Non-Goal,不是 SUGGESTION

### 4. 三维度必须全跑

不允许跳维度。即使 Completeness 全 pass 也必须跑 Correctness + Coherence(典型借口:"测试都过了,看着没问题")。

## 红旗清单 — STOP and Start Over

| 想法 | 现实 |
|---|---|
| "测试都 pass 了,跳 Correctness/Coherence" | 测试 pass 只覆盖被写出来的 test。spec 里没测试覆盖的 Requirement 完全 silent。**跳维度 = 重新走第 1 维度** |
| "这个 Requirement 在 codebase 没找到,但应该不重要,推 SUGGESTION" | `coverage_gap` 是 automated CRITICAL candidate(沿 §11.1bis;evidence_missing 仅指 evidence.log_path 文件缺失);推 SUGGESTION = 偷懒。fence 拒签的不是你判定 SUGGESTION,而是你没让工具自动判 |
| "vague 'consider reviewing X'" | fence 看不到具体证据 → recommendation 等价无效。重写带 file:line / spec:Requirement-id |
| "WARNING 我直接给 severity_acked_by = ai-agent 算自 ack" | WARNING ack 必须走 `forge ack propose` 两步流程(沿 9a),AI 自 ack 不存在;archive fence 校验 ack-log.jsonl 一致性 |
| "automated=true CRITICAL 我改成 false 让 LLM 判" | finding_hash 重算 + 比对会拒签。修法是让工具自动产,不是改 automated 字段 |
| "三个维度合并写成一段总论" | finding 是结构化数组,每项必须明确 dimension / check_type;合并 = 工具无法解析,fence 报 schema 错 |
| "时间紧,只跑 Completeness" | 跳维度是 baseline AI 的典型失败模式(沿 plan-9d scenario pressure-skip-coherence)。本 skill 存在的全部理由就是挡这个 |

**全部触发表示:回归三维度协议,从 Completeness 开始**。

## 配套引用

- `skills/_shared/scope-category-guidance.md`(9b 落地;**plugin runtime 下:`_shared/scope-category-guidance.md`** — 沿 receiving-code-review SKILL.md:292 convention):决策表区分 "本 change SUGGESTION" vs "跨 change Out of Scope / Future Work / Non-Goal"
- design §2.2.3 verify_findings YAML schema(权威字段定义)
- design §2.3.3 critical_candidate 协议(automated CRITICAL 不可降级机制)
- design §2.3.6 finding_hash JCS 算法(9a 实施)
- 9a `src/core/schemas/severity.ts`:Finding / FindingHashPayload 接口
- 9b `src/core/scope/aggregator.ts`:跨 change followups 数据源

## Bottom Line

**verify 不只是测试 pass — 是三维度评估** + **fence 反向加固让"偷懒推 SUGGESTION"不再是低风险选择**。

每次 verify 产出的 verify_findings 数组 = 后续 archive / `archive_summary` handoff / v1.1 backlog 的全链数据源;偷懒会留下持续可见的痕迹。
