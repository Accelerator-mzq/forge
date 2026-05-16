---
name: forge:subagent-driven-discipline
description: Subagent task type taxonomy + cheap-model reliability playbook + Trigger Type Matrix retrospect for subagent-driven-development workflows。**重场景轻业务**:按 subagent 任务类型(implementation 5 子类 / spec review 4 子类 / code quality review 5 子类 / test creation / doc / debug / verification)细分 model tier + WHY + 让 cheap model 高质量的具体 prompt patterns。**Design 任务(algorithmic / architectural / arch doc rewrite / complex root cause)绝对原则 Opus only,无 exception**。Cross-scenario discipline(cwd verify / cross-verify / cherry-pick recovery / cost framework)作为 supporting infrastructure。**Living catalog 增长由 §3.4 Trigger Type Matrix retrospect 强制**:5 trigger types(3-stage / parallel / standalone / ad-hoc / codex CLI)各自 retrospect intensity;Type 1+2 Opus mandatory full;Type 3 light;Type 4 skip retrospect 仅 cross-verify;任一 Yes 才加 case study;全 No 不加(避免噪声)。Companion to `forge:subagent-driven-development`。
license: MIT
compatibility: Claude Code Agent tool + python -m pytest;sister to forge:subagent-driven-development(generic 3-stage process)
metadata:
  author: forgeue project (extracted to generic)
  version: "1.0-generic"
  scenario_subtype_count: 28
  case_study_count: 10
  retrospect_protocol: trigger-type-matrix(5 types × per-type intensity)
---

Universal controller-side discipline for `forge:subagent-driven-development` workflows。

## Platform Note

This skill uses **Claude Code tool names** (PascalCase: `Skill`, `Agent`, `Read`, `Bash`, etc.) throughout §1 / §2 / §3 prompt templates. If you are running on a different harness, **read the appropriate tool-mapping reference before applying this skill**:

| Harness | Reference |
|---|---|
| Claude Code | (no mapping needed — names are native) |
| Codex CLI | `references/codex-tools.md` (`spawn_agent` / `wait_agent` / `update_plan`; `multi_agent = true` config required) |
| OpenCode | `references/opencode-tools.md` (lowercase `skill` / `read` / `bash`; subagent definitions in `.opencode/agents/<name>.md`) |

§1 28-subtype taxonomy, §3.2 cross-verify, §4 recovery, §5 case studies, §6 pattern catalog are **platform-independent** and apply verbatim on every harness. Only the dispatch / file / shell tool names differ.

**核心立场**:**重场景轻业务**。
- **重**(§1 § 2 — 主体):subagent 任务类型 taxonomy(per task subtype:用什么 model + WHY + 怎么让 cheap model 高质量)
- **轻**(§3 § 4 — 支撑):cross-scenario discipline 基础设施(cwd verify / cross-verify / recovery / cost framework)
- **业务无关**:具体项目用法属于 case studies(§5)增量层,不染入 scenario taxonomy

**何时启用**:任何项目使用 `forge:subagent-driven-development` 派 subagent 时,controller 主 session dispatch 前 + return 后 + commit 前全流程参考。

---

## §1 Subagent Scenario Taxonomy(重 — task type 决定 model + 协议)

### §1.1 Implementation Tasks(写代码 / 改代码)

| 子类 | 特征 | model | WHY | 让 cheap model 高质量的必备 prompt 元素 |
|---|---|---|---|---|
| **§1.1.1 Mechanical(完整代码样例)** | Plan 含完整 code block + 全 fence test 名 + 完整测试模板 + commit message 模板 | `haiku` | implementer 只需 transcribe + 微调;无 design judgment | 1) Plan 内含 inline 完整代码(不让 implementer 自由 design)<br>2) 每个 fence test 给具体 name + assertion 描述<br>3) Commit message 模板 inline<br>4) Pre-condition / Pre-state(git status clean / pytest baseline N)<br>5) Self-review 7 项检查清单 |
| **§1.1.2 Pattern-matching(用既有模式)** | 改 / 新建文件,需照既有 sister files 风格;Plan 给 file:line 锚点但不全 inline | `haiku` 或 `sonnet`(borderline)| Pattern lookup + 套用是 pattern matching 任务;若需理解 pattern semantic 升 Sonnet | 1) **必给 sister file 路径**(让 implementer Read 参考)<br>2) Pattern 元素 enumerated(e.g. "沿 `<existing-project-module>.py` argparse + multi-mode CLI 风格")<br>3) Style constraint(stdlib only / 中文 docstring)<br>4) Anti-pattern 显式列(e.g. "不引入外部 dep") |
| **§1.1.3 Multi-file integration** | 改既有 module + cross-fence wiring + 多文件 coordinate | `sonnet` | 需保持 cross-file consistency;Haiku 易 miss interaction | 1) 列全部涉及 file paths<br>2) 显式 dependency graph(file A change 影响 file B 哪段)<br>3) Defense-in-depth dispatch logic 描述 |
| **§1.1.4 Algorithmic design** | Plan 描述需求但不给具体算法 / data structure | **`opus` MANDATORY**(不允许 Sonnet 替代) | **设计任务的判断错误下游修复成本极高** — 错算法 → 全 implementation 重写 + 全 test 重写 + 可能影响 contract;Opus 的 reasoning depth 对设计决策必要;Sonnet 在 design 任务下选 "first reasonable solution" 可能跳过更优 alternative | 1) 显式列**已考虑的方案 alternatives**(让 Opus evaluate)<br>2) Performance / memory / 可维护性约束<br>3) Trade-off priority<br>4) Cross-impact 范围(影响哪些 module / future 演进) |
| **§1.1.5 Architectural(跨子系统)** | 引入 new ABC / 新子系统 / cross-boundary refactor / new ADR drafting | **`opus` MANDATORY** | 需全局视角 + 长期演进考虑 + adversarial review;**任何 design 任务都不能降级 cheap model** | **首选 controller 自己做(若 controller 是 Opus)— 不外包给 subagent**;若 controller 非 Opus 必须 dispatch Opus subagent;subagent 只 implement 已 finalized design |

### §1.2 Spec / Compliance Review Tasks(检查 implementation 符合 spec)

| 子类 | 特征 | model | WHY | 让 cheap model 高质量的必备 prompt 元素 |
|---|---|---|---|---|
| **§1.2.1 String matching(检查 N specific strings 在 M files)** | "verify file X contains string Y, doesn't contain Z" 类机械字符串校验 | `haiku` | 纯 grep-style 任务;无 reasoning | 1) 给完整 verification list("Check these 4 specific things")<br>2) Pre-verified data(controller 已跑 grep,reviewer 不必重跑)<br>3) **不**让 reviewer 跑 pytest(避免 binary env mismatch)<br>4) 拒绝 open-ended task(永远不要 "is this spec compliant?",要 "verify these 4 strings") |
| **§1.2.2 Structural verification(模板 / file 含某 section)** | "template X has section Y at right position" | `haiku` | 静态 markdown / file 结构校验 | 同 §1.2.1 + 显式 file path + section header 准确字符串 |
| **§1.2.3 Cross-phase reasoning(scenario 跨 phase boundary)** | spec 写端到端 Requirement,但 plan 拆 P1 工具 / P2 fence — reviewer 需理解 phase decomposition | `sonnet`(`haiku` 会 scope-bleed) | 需理解 "本 phase 该做 vs 其他 phase 该做";Haiku 把 spec 全部 missing 当本 phase issue | 同 §1.2.1 + **Phase Scope Boundary 显式段**:"only review P{N} scope;P{N+1}/P{N-1} 的 missing 不算 issue;若看到 cross-phase 问题,note as observation 不 blocker" |
| **§1.2.4 Acceptance criteria(复杂 business rule)** | "feature meets these 5 acceptance scenarios with WHEN/THEN" | `sonnet` | 涉及 business semantic;Haiku 字面理解可能错 | 列全 acceptance scenarios + 给反例(false claims that should fail) |

### §1.3 Code Quality Review Tasks(代码质量 / 设计)

| 子类 | 特征 | model | WHY | 让 cheap model 高质量的必备 prompt 元素 |
|---|---|---|---|---|
| **§1.3.1 Style / Lint nits** | 命名 / 缩进 / 注释格式 / dead code 检测 | `haiku` | 静态 pattern recognition | 给 specific style rules + file:line targets |
| **§1.3.2 Pattern adherence(沿既有模式)** | "code follows existing project pattern X?" | `haiku`(简单)或 `sonnet`(模糊) | 比对模式 | 给 reference pattern file path + 具体 sub-pattern enumeration |
| **§1.3.3 Maintainability(hard-to-test / tight coupling / sync drift risk)** | 设计判断 — code 是否 future-proof | `sonnet`(必须) | **判断是否会 future bug** 是 reasoning task;Haiku 看不见 | 列具体维护 concern(coupling / drift risk / refactor friction)+ 项目 maintenance 历史 context |
| **§1.3.4 Runtime correctness(race conditions / silent failures / edge cases)** | 检查 implementation 是否会 silent fail at runtime | `sonnet`(**MANDATORY**;Haiku 不可替代) | **必须 reasoning code semantics** + envision execution flow;Haiku 只看 static structure | 描述 expected runtime behavior + 列已知 edge case + adversarial thinking 提示("how can this fail under concurrent / malformed / partial-state input?") |
| **§1.3.5 Security review** | 注入 / 敏感信息 / 权限 / 加密 / 边界 | `sonnet` 或 `opus` | 需要 adversarial thinking + 安全 domain 知识 | 显式 threat model + ASVS / OWASP class refs + 项目 security context |

**核心 takeaway**:**Code Quality 阶段 §1.3.4 Runtime correctness 不可 skip + 不可降级 Haiku**。Case 1 实证:Haiku implementer + Haiku spec_reviewer 漏的 2 个 runtime bug(f-string / IMPL_FILES_JSON silent fail)只有 Sonnet code_quality 抓到。

**任何 Design 任务必须 Opus**(§1.1.4 + §1.1.5 + §1.5.4 architecture doc 重写 + §1.6.3 root cause analysis 复杂场景):design 错误的下游 impact 远大于 dispatch cost differential;Opus reasoning depth 对 design 必要。Cheap model 在 design 任务下倾向"选 first reasonable solution"漏 alternative。这是**绝对原则,无 exception**。

### §1.4 Test Creation Tasks(写新 test)

| 子类 | 特征 | model | WHY | 让 cheap model 高质量的必备 prompt 元素 |
|---|---|---|---|---|
| **§1.4.1 Unit test from spec(spec 清晰)** | spec scenario 已明确 → 翻译为 pytest fence | `haiku` | 模板化;Plan 含 fence name + 期望行为 | 给 fence name list + each fence 一句 expected behavior + 测试 framework 模板 |
| **§1.4.2 Integration test(跨 module)** | 需协调多 module 状态 | `sonnet` | 跨 module setup / teardown 复杂 | 列涉及 module + 依赖 setup 顺序 + tmp_path / mock 策略 |
| **§1.4.3 Edge case generation(创造性)** | "find edge cases not in spec" | `sonnet` | 需要创造性 + adversarial | 给已知 edge case + 提示 "what corner cases NOT covered by these?" |
| **§1.4.4 Regression test(为 bug fix 写 test)** | bug 已识别,写 test 防回归 | `haiku` | 翻译已知 bug 为 test | 给 bug repro steps + expected vs actual + fixture 模板 |

### §1.5 Documentation Tasks

| 子类 | 特征 | model | WHY | 让 cheap model 高质量的必备 prompt 元素 |
|---|---|---|---|---|
| **§1.5.1 Doc sync(机械替换)** | "update version X to Y in N files" | `haiku` 或 direct(no subagent;沿 §3 skip) | 纯字符串替换 | 给 grep / sed 指令 + 影响 file list |
| **§1.5.2 Doc rewrite(semantic)** | 重写段落 for new audience | `sonnet` | 需理解原意 + 重表达 | 给 audience profile + 风格示例 |
| **§1.5.3 API doc(match implementation)** | 从 code generate doc | `haiku` | 模板化 | 给 code path + doc 模板 + cross-ref convention |
| **§1.5.4 Architecture doc(explain decisions)** | 解释 design choices + alternatives | `sonnet` 或 `opus` | 需要 design reasoning | 给 D-decision list + 选用 vs alternatives + WHY |

### §1.6 Debug / Investigation Tasks

| 子类 | 特征 | model | WHY | 让 cheap model 高质量的必备 prompt 元素 |
|---|---|---|---|---|
| **§1.6.1 Bisect(机械二分)** | "找出哪个 commit 引入 regression" | `haiku` 或 direct | 机械 git bisect | 给 known good + bad commit + reproduction script |
| **§1.6.2 Reproduce + identify(根因定位)** | "test failing,find root cause" | `sonnet` | 需 reasoning code + execution flow | 给 test name + failure trace + 涉及 module list |
| **§1.6.3 Root cause analysis(complex)** | 多 component interaction;非显式 | `sonnet` 或 `opus` | 需 system-level reasoning | 给 system architecture + observed symptoms + 已尝试的 hypotheses |

### §1.7 Verification / Acceptance Tasks

| 子类 | 特征 | model | WHY | 让 cheap model 高质量的必备 prompt 元素 |
|---|---|---|---|---|
| **§1.7.1 Run tests + report(机械)** | "run pytest, report pass/fail" | direct(controller;no subagent) | 不值得 subagent dispatch | controller 自己 `python -m pytest -q` |
| **§1.7.2 Cross-check evidence vs spec(reasoning)** | "verify evidence matches spec scenarios" | `sonnet` | 跨 evidence + spec 比对推理 | 列 spec scenarios + evidence file paths + match criteria |

---

## §2 Making Cheap Models Reliable(重 — playbook per scenario)

`haiku` 在合适场景 + 严格 prompt 下 production-quality。**模型不变,prompt 变,质量天差地别**。

### §2.1 Implementation Haiku Reliability Playbook

**Pre-condition**(若不满足 → 升级 Sonnet):
- ✅ Plan 含**完整 inline code sample**(implementer transcribe + 微调,不自由 design)
- ✅ 每 fence test 给**具体 name + 1 句 expected behavior**
- ✅ Commit message 模板 inline
- ✅ Pre-state 标准(git status clean / pytest baseline N + 1 skipped)
- ✅ Sister file 风格 reference path 给(implementer Read 参考)
- ✅ Anti-pattern 显式列(don't add 这个 / don't refactor 那个)

**Prompt 必含元素**(沿 §3.1 STRICT cwd + 7 项 self-review):
```markdown
## Working Directory(STRICT)
[Pattern §3.1 cwd verify section]

## Project Context
- Sister file path: <e.g. existing project module path>(read for style reference)
- Pre-state: pytest baseline N + K skipped
- Anti-pattern list: ...

## Task Description(full plan text — DO NOT read plan files)
[Full code sample inline + fence list + commit template]

## Self-Review Checklist(before reporting DONE)
- [ ] All N fence tests pass
- [ ] **Stack-specific full verify 命令(必跑;按项目语言匹配;**漏一条 = DONE_WITH_CONCERNS**)**
- [ ] File header follows project style
- [ ] Stdlib only(no external deps)
- [ ] Commit created and visible in git log -1
- [ ] Self-review found issues fixed before reporting
- [ ] Report includes file paths + verify outputs + commit SHA
```

**Stack-specific full verify 命令清单**(沿 §2.1 prompt 必含;Python 模板套 TS 漏 lint/format 是真实失败模式 — 见 §6 catalog "self-review checklist stack-mismatch" 行):

| Stack | 必跑命令(全 0 才算 DONE) |
|---|---|
| **TypeScript / Node(pnpm)** | `pnpm typecheck` / `pnpm lint` / **`pnpm format:check`**(漏 → CI 双平台 fail)/ `pnpm test --run` / `pnpm build`(若改 src/* 影响 dist) |
| **Python(pytest)** | `python -m pytest -q` / `ruff check`(若用 ruff)/ `mypy <package>`(若用 mypy) |
| **Rust(cargo)** | `cargo fmt --check` / `cargo clippy -- -D warnings` / `cargo test` |
| **Go** | `go vet ./...` / `gofmt -l .`(空输出)/ `go test ./...` |

**Plan inline code escape valve**(implementer 自我反思口子;§6 catalog "Plan inline code 含 latent bug" 行):
若 self-review 中发现 plan inline code 看似有 bug(IO 不在 try 内 / fd 不 close / type 越界 / race window 等 runtime correctness 问题),**不擅自改 plan**,在 self-review 报告中加 "Observation: plan line X-Y 似有 <issue>,留 reviewer 判断" 段。Sonnet code_quality reviewer 沿 §1.3.4 runtime correctness MANDATORY 兜底。

**Failure mode if skipped**:implementer 自由 design / hallucinate self-report / 漏 commit / commit 错 branch(see Pattern §3.1 worktree leak)/ stack-mismatch self-review 漏 lint/format 导致 CI fail(see §5 Case 01)/ 照搬 plan inline latent bug 不报 observation。

#### §2.1.1 P-5 — external protocol assumption verify(plan-9z polish;plan-9h Task 4 实证)

Dispatch implementer 第一步**不是开始实施**,而是 grep / read 实际项目代码验证 plan 字面陈述与外部系统约束是否一致:

- **forge-eval runner 1:1 yaml 约束**(`forge-eval/runner/registry.ts` `SKILL_NAMES` 数组实际 union;runner 不接受 plan 字面虚构的 skill 名)
- **build script**(`scripts/build.ts` / `scripts/copy-templates.mjs` 实际 stages + reverse-sync 行为)
- **其他外部协议**(`commands/apply.md` step 顺序 / SKILL.md cross-ref / 现有 fence schema / ack-log action enum 字面)

Plan 字面是设计**意图**,外部代码是实施**约束**;前者可能漏拷后者。

**实证**(plan-9h Task 4):implementer 第一步 grep `forge-eval/runner/registry.ts` 发现 `SKILL_NAMES` 实际只接受 `subagent-driven-development` 不接受 `main-agent-stop` — plan v1 字面 "创建 main-agent-stop.yaml" 与 runner 1:1 约束冲突,implementer 报 BLOCKED 而非盲目实施;plan v1.2 修订选项 B(merge 进现有 yaml)消化。若 implementer 默认信 plan 字面跑 baseline,会盲目跑后失败,浪费成本 + 误导后续修订路径。

**Prompt 必含元素**(沿 §2.1 prompt 模板补):
```markdown
## External Protocol Assumption Verify(MANDATORY first step,§2.1.1)

Before implementing, grep / read these files and verify plan claims:
- <file path 1>: verify <plan claim>
- <file path 2>: verify <plan claim>
- ...

If any verify fails → report BLOCKED with specific verify command + actual vs expected output, DO NOT start implementation。
```

### §2.1.2 cross-cutting 状态回写 hook(plan-v1.1 Task 5 加 — Pattern X #1 实证)

**Trigger**:implementer 实施 Task 改动了 master plan / spec / 上游 sub-plan / 当前 sub-plan 自身 引用的 cross-cutting 字段:

- file:line 字面(eg. `src/cli/init.ts:38` 模板字面引用)
- 不变量计数(eg. spec §X.Y "14 green↞HEAD" / "6 子段 7 子段")
- DoD 状态(eg. master plan §3.X "plan-9g DONE @ commit `7d36c2b`")
- version 字面(eg. package.json / CHANGELOG.md / templates 内 v0.X 引用)
- release gate / 协议字面(eg. sub-plan 自身 release gate "0 严重 / 0 阻塞 / 0 Major" sync 全 plan)

**Required action**(同 commit 内回写 — 不留 stale 引用):

1. implementer 实施前:**grep** `<changed-content>` master plan / spec / 上游 sub-plan / 当前 sub-plan 全文,**列出所有引用方位置 list**(不眼测)
2. implementer 实施时:**同 commit** 内回写所有引用方至新值
3. implementer self-review checklist 加项:"列出本 Task 改动 cross-cutting 字段 → grep 全 plan 验所有引用方已 sync"

**Why**(Pattern X #1 累计实证,REINFORCE Pattern S/T):

- **plan-9g B-7 顺手做** `src/cli/init.ts:38` 模板 v0.4 → v1.2 改动,master plan §3.11 line 410 描述 stale → plan-9z Task 3 第一步 grep 才发现已是 "v1.2"(plan-v1.1 Task 5 协议起点;§5 Case 09 §1273 沉淀)
- **plan-v1.1 Task 0 sub-plan 起草自身连续两次 self-aware 实证**:
  - v3.1 → v3.2:release gate 标准升级 "0 Major" 字面只加 §14 retrospect 段未 sync 主流程 Step 7.6 / Step 7.7 / Task 7 DoD / §10 综合 DoD → Codex 五审 F-R5-01 catch
  - v3.2 → v3.3:cross-cutting sync 主流程 sync 不完整(声称 sync 4 处实际 sync 2 处)→ Codex 六审 F-R6-01 catch
- **连续两次同源盲点累计强度 ≥ 1 次累计实证** → 协议必要性 self-evident(plan v3.3 §14 v3.3 retrospect 字面记录)

**Controller dispatch prompt 加项**(在 §2.1 任务描述段尾):

```markdown
若本 Task 改动 cross-cutting 字段(file:line 字面 / 不变量计数 / DoD 状态 / version 字面 / release gate 协议字面),
implementer **必 grep** master plan / spec / 上游 sub-plan / 当前 sub-plan 全文,**列出所有引用方位置 list**(不眼测),
**同 commit** 内回写至新值;不留 stale 引用。
触发示例:plan-v1.1 自身 v3.1 / v3.2 连续两次踩此盲点 → Codex 五审 / 六审 catch(self-aware retrospect 实证)。
```

**verify protocol**(implementer self-review checklist line 末加):

```bash
# 若 cross-cutting 字段改动,跑此 verify(不眼测):
grep -rn "<old-value>" <master-plan-path> <spec-path> <upstream-sub-plan-paths> | wc -l  # 期望 = 0(全 sync)
grep -rn "<new-value>" <master-plan-path> <spec-path> <upstream-sub-plan-paths> | wc -l  # 期望 ≥ N(新值已替换 N 处)
```

参考 case:本 SKILL.md §5 Case 09 §1273(Pattern S REINFORCE + Pattern T new edge);
plan-v1.1 Task 0 `docs/plans/2026-05-14-plan-v1.1-polish-leftover.md` §14 v3.1 / v3.2 / v3.3 retrospect(self-aware 连续两次实证)。

### §2.2 Spec / Compliance Reviewer Haiku Reliability Playbook

**Pre-condition**(若不满足 → 升级 Sonnet):
- ✅ Task 是 §1.2.1 string matching 或 §1.2.2 structural verification(纯静态 grep)
- ✅ Spec scenario 不跨 phase boundary(若跨 → §1.2.3 升 Sonnet)
- ✅ Controller 已 pre-run pytest + given results(reviewer 不必跑 pytest 自己)

**Prompt 必含 4 元素(顺序固定)**:
```markdown
## Working Directory(STRICT)
[Pattern §3.1 cwd verify section]

## Pre-verified Data(controller 已跑,你不必再跑)
- pytest tests/unit/test_X.py -v → N PASS
- python -m pytest -q → M PASS + K skipped
- grep "<key string>" <file> → 命中 / 不命中

## Your Job — Verify These Specific Points(NOT open-ended)
1. <Specific check 1>
2. <Specific check 2>
3. <Specific check 3>
4. <Specific check 4>

## Phase Scope Boundary
**Note**: only review P{N} scope。P{N+1} / P{N-1} are different phases — don't flag missing functionality from other phases。If you see something cross-phase,note as observation not blocker。
```

**Failure mode if skipped**:scope-bleed(报别 phase 的 missing)/ 幻觉 URL / 错 pytest count(走错 binary)/ open-ended task 输出无用 verdict。

### §2.3 Code Quality Reviewer Haiku Acceptable Subset

**Haiku 适合**:§1.3.1 style/lint + §1.3.2 simple pattern adherence + §1.3.3 partial(有 specific concern list 时)

**Haiku 不适合**:§1.3.3 deep maintainability / **§1.3.4 runtime correctness(MANDATORY Sonnet)** / §1.3.5 security

**Haiku-acceptable prompt 必含**:
- 具体 file:line targets(不要 "review the whole change")
- Specific style rules / pattern checklist(不要 "is this good code?")
- Severity 分类约束(Critical / Important / Minor)— 限制 Haiku 不报满 false positive

### §2.4 Test Creation Haiku Reliability Playbook

**Pre-condition**:Plan 含 fence name list + each fence expected behavior + 测试 framework 模板。
**Prompt**:fence list + assertion 描述 + tmp_path / fixture pattern + commit template。
**Failure mode if skipped**:implementer 编 test 名 / 漏 fence / fence 实现与 name 不符。

### §2.5 Doc Sync Haiku Reliability Playbook

**Pre-condition**:全 mechanical text replace(grep / sed-like)。
**Prompt**:具体 grep pattern + 影响 file list + before/after example。
**Failure mode if skipped**:doc drift(implementer 改 file A 不改 file B)。

### §2.6 跨场景共通 — Cheap Model "高质量" 的核心 3 条

无论何种 cheap model 任务,以下 3 条是 floor:

1. **任务必须是 enumerated 而非 open-ended**:不要 "is this OK?" 要 "verify these N specific things"
2. **Pre-condition 必须 controller 设好**:不要让 cheap model 探索 environment / 自己 run pytest;controller 跑后给 results
3. **Output 必须 enumerated**:不要 "share concerns" 要 "report issues with severity Critical/Important/Minor + file:line + fix suggestion"

违任一 → cheap model 易 hallucinate / scope-bleed / 输出 useless verdict(实证见 §5 Case 1)。

---

## §3 Cross-Scenario Discipline(轻 — 支撑基础设施)

### §3.1 STRICT cwd verify(防 worktree-scope leak)

每次 dispatch prompt 必含:
````markdown
## Working Directory(STRICT — verify before any work)

```bash
cd <worktree-path>
pwd  # MUST show <worktree-path>
git branch --show-current  # MUST be <expected-branch>
git rev-parse HEAD  # MUST be <expected-SHA>
git status --short  # SHOULD be clean
```

If `pwd` 不显示 expected path → **STOP report NEEDS_CONTEXT;不要在错误 directory 工作**。
````

### §3.2 Controller Cross-Verify(防 self-hallucination)

收 subagent return 后,controller 独立验证:

| Subagent claim | Controller verify 命令 |
|---|---|
| "X fence 全 PASS" | `python -m pytest <test-file> -v`(不用 `pytest`,用 `python -m pytest` — 防 binary env mismatch)|
| "全 regress N PASS" | `python -m pytest -q` |
| "Commit SHA `X`" | `git show <X> --stat` + `git branch --contains <X>`(防 branch leak) |
| "Spec scenario 全覆盖" | `grep -c "<spec-required-string>" <file>` |
| "改了 X 不改 Y" | `git diff <base>..HEAD --stat` |
| "URL / 文件 path 引用" | 实际访问 / `ls` / `git log <path>` |

### §3.3 Inline Fix vs Round 2 Fix Decision

| Issue 类型 | 决策 |
|---|---|
| Trivial 文本 fix(docstring / f-string / 注释)| Controller inline edit(~free) |
| Spec-violating 字符串缺 / Glue code 缺 | Controller inline edit(~free) |
| Logic 错误(算法 / 数据流 / 控制流)| Round 2 SendMessage 同 implementer subagent(~$0.20-0.50)|
| Architectural 错误(违 design decision) | 升级 user(controller-only) |

### §3.3.1 P-6 — 区分 rubric 软度 vs 验证强度(plan-9z polish;plan-9h Task 4 实证)

forge-eval 有两个**独立指标**,**不互替**:

| 指标 | 含义 | 触发改 rubric 还是改 SKILL.md/bootstrap? |
|---|---|---|
| **rubric 软度**(Pattern R) | RED avg > 5 → rubric 没收紧到 baseline AI 必然失分 | **改 scenarios**(收紧 rubric / 提权重) |
| **验证强度**(pair_pass) | delta ≥ 1.5 失败 → GREEN AI 与 RED AI 差距不显著 | **改 SKILL.md / bootstrap**(让 GREEN AI 看到更多字面) |

**实证**(plan-9h Task 4):严格 RED 全 ≤ 5(Pattern R **不触发**)但 2/3 pair_pass=false → **不改 rubric 凑 pair_pass**(Goodhart's law 防御),改 SKILL.md / bootstrap 字面对齐(plan-9z polish P-1/P-2 消化)。把两指标混用会导致 rubric 不断收紧到不可达,GREEN AI 也通不过(假性 RED)。

### §3.3.2 P-8 — Task BLOCKED 修订决策树(plan-9z polish;plan-9h Task 4 v1.2 实证)

Task implementer 报 BLOCKED 时,plan author 决策两选项:

- **选项 A — 改架构**:扩 forge-eval `SKILL_NAMES` + 新建独立 skill / 新建独立 yaml file,**侵入基础设施**
- **选项 B — 复用现有架构**:merge 进现有 yaml,**保 plan-9 序列 atomic**

**默认选 B**(沿 plan-9e2 v3 / plan-9h Task 4 v1.2 修订模式)。

- 选 A 的代价:增加 release 时基础设施改动面积 + breaking 现有 scenarios 测试基线 + 跨 sub-plan 影响
- 选 B 的代价:可能 forge-eval 验证粒度变粗(多个 plan 共用一个 yaml)— 但通过 scenario 分组可缓解

**实证**(plan-9h Task 4 v1.2):把 "main-agent-stop" 改回沿用现有 `subagent-driven-development` `SKILL_NAMES` 并新建 `forge-eval/scenarios/main-agent-stop.yaml`(scenario-level 分组而非 skill-level),pair_pass 验证粒度保持 + 不动 `SKILL_NAMES` 数组。

### §3.4 Post-Phase Quality Retrospect Protocol(Opus-only judgment;skill 增长触发)

**核心原则**:任何 subagent dispatch 完成都需 controller-side 质量分析 — 但 dispatch 类型不同,retrospect intensity 不同。本节定义 **5 Trigger Type × 不同 retrospect intensity**。

#### §3.4.0 Trigger Type Matrix(总览)

| Trigger Type | 何时 fires | Retrospect Intensity | Actor | Cost |
|---|---|---|---|---|
| **Type 1: 3-stage full**(canonical;§1.1 + §1.2 + §1.3)| per-task implementer + spec_reviewer + code_quality_reviewer 全 ✅/⚠️ + 3 evidence committed | **MANDATORY full Q1-Q6** | **Opus**(MANDATORY)| $0.30-1.00 |
| **Type 2: Parallel dispatch**(`forge:dispatching-parallel-agents`)| 多 implementer 并行全 commit + W2 actual diff 验证 + 后续 spec / code_quality reviewer 全 ✅ | **MANDATORY full Q1-Q6 + Q7**(parallel-specific) | **Opus**(MANDATORY)| $0.40-1.20 |
| **Type 3: Standalone Task**(§1.4/§1.5/§1.6/§1.7 单 subagent dispatch,无 3-stage review)| Single Task return DONE / DONE_WITH_CONCERNS | **Light:Q2 + Q3 + Q4**(skip Q1/Q5/Q6 — 单 task scope 不够 trigger broader pattern) | **Opus or Sonnet** | $0.10-0.30 |
| **Type 4: Ad-hoc research Task**(无 evidence committed;e.g. "summarize files" / "find X usage")| Task return | **Skip full retrospect;仅 §3.2 cross-verify** | Controller(any tier) | ~$0(cross-verify only) |
| **Type 5: Codex CLI subprocess**(`/codex:adversarial-review` / `/codex:review`)| Codex CLI return | **本 skill 不 cover**(Codex 自家 protocol — 沿 codex-plugin/codex-companion) | N/A | N/A |

**判定 trigger type**:看 dispatch 用哪 upstream skill / 哪 dispatch pattern,不看 task 内容本身。

#### §3.4.1 Type 1: 3-stage Full Retrospect(canonical)

**3-stage 定义**(沿 `forge:subagent-driven-development` upstream;per-task 串行):

| Stage | Subagent 角色 | 任务 | 进入下 stage 条件 |
|---|---|---|---|
| Stage 1 | implementer | 写实现 code / fence test / commit | return status DONE / DONE_WITH_CONCERNS;若 BLOCKED / NEEDS_CONTEXT → controller 处理后 retry |
| Stage 2 | spec_reviewer(spec compliance) | verify implementation 符合 spec(checklist 比对) | reviewer ✅ Spec compliant;若 ❌ Issues → SendMessage round 2 same implementer fix → re-review;直到 ✅ |
| Stage 3 | code_quality_reviewer | verify code quality(clean / tested / maintainable / runtime correctness) | reviewer ✅ Approved 或 ⚠️ Approved with concerns(non-blocker);若 ❌ Issues → round 2 fix → re-review;直到 ✅/⚠️ |

**Phase complete** = Stage 1 + Stage 2 + Stage 3 全 ✅(或 ⚠️ non-blocker)+ 3 类 evidence 文件落盘 + commit。**此时**触发 Type 1 retrospect。

(注:**final_reviewer** 是 **per-change 末尾**额外 stage — 全 phase 完成后跑一次综合 review,不属于 per-phase 3-stage。final_reviewer 完成后做 change-level retrospect,不是 phase-level。)

#### §3.4.2 Type 2: Parallel Dispatch Retrospect

**Trigger**:`forge:dispatching-parallel-agents`(或对应 parallel dispatch 命令模板)派多 implementer 并行 → 全 commit → W2 actual diff verified disjoint(若 overlap 检测自动降级 sequential → 改走 Type 1 retrospect)→ 后续 spec / code_quality reviewer 全 ✅。

**Inputs(controller 必读)**:
1. 全 N implementer evidence files
2. spec_reviewer + code_quality_reviewer evidence
3. W2 actual diff result(`task_files_actual` declared vs detected)
4. parallel-specific log(若有 abort log:`<change>/parallel_abort_*`)
5. Phase commit diff
6. 本 skill 当前版本

**Question Matrix Q1-Q6 + Type 2 加 Q7**(parallel-specific):

| Q | 问题 | Yes 后果 |
|---|---|---|
| Q1-Q6 | 沿 Type 1 同款 | 同 Type 1 |
| **Q7a** | Actual file overlap detected post-dispatch?(implementer 间 diff 实际有交) | 必加 §5 case 标 controller declaration vs reality drift |
| **Q7b** | Race condition / shared state 影响?(implementer 改 shared fixture / global config / import hub)| 必加 §5 case + §6 catalog "parallel race condition" |
| **Q7c** | IMPL_FILES_JSON 序列化缺 / W2 actual diff Bash glue 错?(silent overlap detection failure)| 必加 §5 case + §1.1.3 multi-file integration playbook 加 prompt 元素 |
| **Q7d** | parallel implementer 数 vs degradation 实际比例?(若 ≥30% 降级 → 该 phase 不该选 parallel)| 必加 §5 case + §1.1.x 加 "适合 parallel vs sequential" 判定准则 |

#### §3.4.3 Type 3: Standalone Task Retrospect(Light)

**Trigger**:任何 §1.4 / §1.5 / §1.6 / §1.7 单 subagent dispatch(非 3-stage 包装)return DONE / DONE_WITH_CONCERNS。

**例**:
- §1.4.1 unit test from spec — implementer 写一组 test
- §1.5.1 doc sync — implementer 跨 N file mechanical 替换
- §1.5.2 doc rewrite — implementer 重写一段 doc
- §1.6.1 bisect / §1.6.2 reproduce — debug subagent
- §1.7.2 cross-check evidence vs spec — verification subagent

**Inputs**:
1. Task return content(no committed evidence file unless writing one)
2. 涉及 file diff(若 implementer 写了 commit)
3. §1.X.Y 对应的 subtype 行(check 是否表现 within expected)

**Question Matrix Light(skip Q1 / Q5 / Q6 — 单 task scope 不够 trigger broader pattern)**:

| Q | 问题 | Yes 后果 |
|---|---|---|
| **Q2** | Subagent hallucinate / scope-bleed / 自我汇报错? | 加 §5 case |
| **Q3** | Controller 需 intervention(re-run / inline fix)? | 加 §5 case |
| **Q4** | NEW failure mode 不在 §6 catalog? | 加 §6 + §5 case |

**Decision**:
- 全 No → SKIP skill update
- 任一 Yes → MUST add §5 case(标记 Trigger Type 3 + scenario §1.X.Y)

#### §3.4.4 Type 4: Ad-hoc Research Task(Skip retrospect)

**Trigger**:Agent tool / Explore subagent / general-purpose research dispatch — **无 committed evidence**(纯 information gathering / one-off lookup)。

**例**:
- "Summarize these N files for me"
- "Find where function X is used"
- "Investigate why test Y fails"(without writing fix)
- Codebase navigation queries

**Inputs**:Task return(text only,no file changes)。

**Retrospect**:**SKIP full retrospect** — 仅跑 §3.2 cross-verify 关键 claim(若 subagent 引用了 file path / commit SHA / function 名 / URL → controller 验证存在)。

**WHY skip**:
- Ad-hoc 无 committed evidence — case study 无 anchor
- One-off 性质 — pattern 难提炼
- Cost too high vs value(retrospect $0.30+ for $0.05 task)

**Exception**:若 ad-hoc Task return 含明显 hallucination / 错信息 → controller spot-add 一个 light §5 case(Trigger Type 4),记录该 task 的失败模式 + 防后续重蹈。

#### §3.4.5 Type 5: Codex CLI Subprocess(out of scope)

**Trigger**:`/codex:adversarial-review` / `/codex:review` / `/codex:rescue` 等 codex-plugin 派的 CLI subprocess。

**为什么不 cover**:
- Codex CLI 不是 Claude Code subagent — 是外部 CLI subprocess(`codex-companion.mjs` broker)
- Codex 走自家 protocol(Round Counter + Polling Convention + verbatim-first output)
- Codex 自家有 review 协议(`codex_review_round1.md` / cross-check matrix)

**Controller 责任**(本 skill 不规约,但提醒):
- Codex return 后仍需 §3.2 cross-verify(测试 count / file path / commit SHA / URL)
- 若 codex hallucinate → 是 codex-plugin / codex-companion bug,不是本 skill 范围

#### §3.4.6 Trigger Type 共通约束(all types)

无论 Trigger Type N:
1. **§3.2 controller cross-verify 永远 mandatory**(Type 1-4 都要;Type 5 也建议)
2. **Opus actor 决定**:Type 1 + Type 2 MANDATORY Opus;Type 3 Opus 或 Sonnet 都可;Type 4 controller 任意 tier;Type 5 N/A
3. **Skill update 触发条件**:任一 trigger type retrospect 出 Yes → 加 §5 case + 视情况 §6 / §1
4. **Anti-pattern**:跳过任何 trigger type 的最低 retrospect(即使是 Type 4 的 cross-verify)→ 失去 controller-side 质量防线

**Actor**:**Opus(MANDATORY)**。
- 若 controller(主 session)是 Opus → controller 直接做
- 若 controller 是 Sonnet/Haiku → controller MUST dispatch Opus subagent for retrospect
- **不允许 Sonnet/Haiku 做 retrospect** — retrospect 是 meta-judgment 任务,需:
  - Adversarial perspective on subagent self-reports(critical thinking)
  - Pattern recognition across 多 evidence files(broad context)
  - Evaluate against §1 28 subtypes(scenario knowledge)
  - 决定是否扩 §1 / §5 / §6(meta-skill update judgment)
  - 这些都是 Opus-tier 任务

**Inputs**(retrospect actor 必读):
1. 全 phase 3 类 subagent evidence files(implementer + spec_reviewer + code_quality_reviewer)
2. Phase commit diff(`git diff <phase-base>..HEAD`)
3. 任何 controller intervention 记录(inline fix / round 2 / cherry-pick recovery)
4. 本 skill 当前版本(对照 §1 / §5 / §6)

**Question Matrix**(retrospect actor 逐项问):

| Q | 问题 | Yes 后果 |
|---|---|---|
| Q1 | 任一 subagent fail in ways outside §1.X.Y expected behavior? | → 加 §5 case + §6 catalog |
| Q2 | 任一 subagent hallucinate / scope-bleed / 自我汇报错? | → 加 §5 case |
| Q3 | Controller 需 intervention(inline fix / round 2 / cherry-pick)? | → 加 §5 case |
| Q4 | NEW failure mode 不在 §6 catalog? | → 加 §6 catalog row + §5 case |
| Q5 | NEW scenario subtype 不在 §1 28 子类? | → 加 §1.X.Y row + §2 playbook + §5 case |
| Q6 | Cheap model 在某 scenario 表现远低于预期(应升 Sonnet)? | → 调 §1 model 列 + §5 case |

**Decision Tree**:
- **All Q1-Q6 答 No**(subagents 表现 within §1 expectation + 无 controller intervention)→ **SKIP skill update**;phase passes silently
- **任一 Yes** → **MUST update skill**:
  - 至少加 §5 Case <NN+1>(retrospect 沿模板;含 retrospect verdict 段)
  - 视具体 Yes 情况追加 §1 / §6(沿 §8 update 协议)
- **不允许"觉得没必要就 skip"** — Opus retrospect 找到任何 issue 都必须沉淀 skill 增长

**Cost**:Opus retrospect ~$0.30-1.00 per phase(读 evidence + diff;judgment-heavy reasoning)。看似贵 — 但**这是 skill 增长的唯一 dependable mechanism**。Skip retrospect = skill 不长 = 后续 change 重蹈覆辙。

**Why mandatory**:
- 若每 phase 不 retrospect → skill 只在 controller 主动 "想到要更新" 时长 → unreliable feedback loop
- Mandatory retrospect = skill 自动从实证增长(只在真有 issue 时更新,无问题不污染)
- Opus-only = retrospect verdict 可信(cheap model retrospect 自己就是 unreliable)

---

## §4 Failure Recovery

### §4.1 Cherry-Pick Recovery(worktree-scope leak)

```bash
# Detection
git log <expected-branch> --oneline -3  # MUST 含刚 commit
git branch --contains <commit-sha>  # 列哪些 branch 含

# Recovery
cd <expected-worktree>
git cherry-pick <leaked-commit-sha>
git update-ref refs/heads/<wrong-branch> <prior-base-sha>
```

### §4.2 Mid-Phase Model Upgrade Trigger

从 cheap → standard model **mid-phase** 触发:
- Subagent return BLOCKED / DONE_WITH_CONCERNS 带 substantive 问题
- spec_reviewer 找到 ≥3 真实 issues round 1
- code_quality_reviewer 标 Critical
- pytest 跑 fence test 失败 with 实现明显 misread plan

---

## §5 Case Studies(growing layer — 项目实证)

### Case <NN> 模板

```
### Case <NN>: <project> / <change> / <phase>

**Date**:<YYYY-MM-DD>
**Project context**:<1 句>
**Subagent dispatch**:
| Subagent | Scenario subtype(§1.X.Y)| Model | $cost | Verdict |
|---|---|---|---|---|

**Real issues caught / failed**:
| Issue | Severity | Caught by | Scenario subtype 验证 |
|---|---|---|---|

**Lesson**(reinforce / new pattern / scenario 边界 refinement):

**Cost vs all-Opus alternative**:实际 $X vs Opus 估 $Y → 节省 ratio
```

---

### Case 01: forge-repo / Plan 7 Phase A / legacy-bridge 基础设施

**Date**:2026-05-06
**Trigger Type**:Type 1(3-stage full retrospect)
**Project context**:TS/Node monorepo(opsp/forge-repo),Plan 7 Phase A 落 legacy-bridge 6 task 基础设施(deps、lock 扩展、config 段、types、anchors schema、CLI 骨架)

**Subagent dispatch**:
| Subagent | Scenario subtype(§1.X.Y)| Model | $cost | Verdict |
|---|---|---|---|---|
| A1 implementer(deps + script) | §1.1.1 Mechanical | opus 4.7 默认继承(应 haiku) | ~$1.50 | DONE — over-cost(沿 §6 catalog 第 1 行) |
| A1 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.10 | ✅ |
| A1 code_quality_reviewer | §1.3.3 maintainability | sonnet | ~$0.10 | ⚠️ 6 deprecated subdeps + dangling script(non-blocker) |
| A2-A6 implementer × 5 | §1.1.1 Mechanical | haiku | ~$0.10 ea | DONE × 5 |
| A2-A6 spec_reviewer × 5 | §1.2.1 string matching | sonnet | ~$0.10 ea | ✅ × 5 |
| A2-A6 code_quality_reviewer × 5 | §1.3.4 runtime correctness | sonnet | ~$0.10 ea | ⚠️ × 5(critical/important inline-fixable) |
| Phase chore-fix | direct | controller | ~$0 | prettier 修 3 文件(stack-specific self-review 漏 format:check)|

**Real issues caught / failed**:
| Issue | Severity | Caught by | Scenario subtype 验证 |
|---|---|---|---|
| A2 lock fd leak + corrupt lock(plan 6 既存搬运)| Critical | sonnet code_quality | §1.3.4 — Sonnet runtime correctness 抓 plan-inline latent bug |
| A2 LockMode union breaking 担忧 | Critical(claimed)| sonnet code_quality | controller 独立核 plan §2.6 决策 #23 → 拒,JSDoc 加 callsite 约定 |
| A3 provider literal v0.3 breaking 担忧 | Critical(claimed)| sonnet code_quality | controller 核 plan 决策 #22 → 拒,JSDoc 加 forward-compat 提示 |
| A5 readFile 在 try 之外 EACCES 绕过 LegacyAnchorsError | Critical | sonnet code_quality | §1.3.4 — plan inline code 自带 bug,Haiku implementer 照搬未发现 |
| A4 §9 GDPR 段引用错(实是 spec §4.5)| Important | sonnet code_quality | §1.2.1 — JSDoc 引用核对 |
| A5 satisfies readonly 增 exhaustive guard | Important | sonnet code_quality | controller 部分采纳 — 不加越界 _AssertExhaustive |
| A6 --merge default vs --overwrite 互斥 | Important(claimed)| sonnet code_quality | controller 核 plan D3 已用三元守住 → 拒 |
| Multiple JSDoc / minor 措辞 | Minor × ~10 | sonnet code_quality | §1.3.1 / §1.3.3 — controller inline 选采 |
| **prettier CI format:check 双 fail(A2/A4/A5)** | **CI blocker** | **CI(format:check)** | **§2.1 self-review checklist 缺 `pnpm format:check` / `pnpm lint`** — Python 模板套 TS stack-mismatch |

**Lesson**(reinforce / new pattern / 边界 refinement):

1. **NEW pattern A — Plan inline code 含 latent bug,Mechanical implementer 不发现**
   - §1.1.1 Mechanical 设计前提 "plan inline code 可信" 在 plan 自身有 bug 时崩;§1.3.4 Sonnet code_quality 是兜底防线 — A5 readFile 包装实证 Sonnet 抓到 Haiku 抓不到的 plan-inline runtime bug。
   - **维持 §1.3.4 MANDATORY Sonnet 不可降级**(强化 §1.3 takeaway)。
   - §2.1 implementer playbook 加 escape valve:"若 self-review 中发现 plan inline code 看似有 bug,标 observation 给 reviewer,不擅自改"。

2. **NEW pattern B — §2.1 self-review stack-mismatch(Python 模板套 TS 漏 format/lint)**
   - 当前 §2.1 checklist 只含 `python -m pytest -q`,TS/Node 项目实操 prompt 沿模板就漏 `pnpm format:check` / `pnpm lint` / `pnpm build`。
   - Haiku 严格按 prompt 列表跑,prompt 不写就不跑 — **不是 model 退化,是 prompt 模板 stack-mismatch**。
   - §2.1 加 stack-specific checklist 段,TS/Node + Python + Rust + Go 各列必备命令。

3. **REINFORCE — controller cross-verify 必抗 reviewer 越权 claim**
   - 12 份 reviewer report 中 ≥3 个 Critical claim 经 controller 独立对照 plan/spec 后 **拒绝**(A2 LockMode 担忧 / A3 provider literal / A6 互斥陷阱)— Sonnet reviewer 在 reasoning code 时倾向 "假设最坏",controller 是唯一持 plan 上下文的 ground truth 持有者。
   - §3.2 cross-verify "reviewer Critical claim → controller 必对照 plan 决策表独立核" 应显化(隐含但未明文)。

4. **REINFORCE — A1 默认 opus 4.7 over-cost 沿用既存 §6 catalog 第 1 行**
   - 用户后续反馈已存 user memory:haiku 机械 / sonnet review / opus 设计。
   - 后 5 task A2-A6 全显式传 haiku 修正。证明 §6 catalog 第 1 行 prevention "显式 model + dispatch 时传 model: 参数" 有效。

**Cost vs all-Opus alternative**:
- 实际:A1 opus(~$1.50)+ A2-A6 haiku × 5(~$0.50)+ reviewer × 12 sonnet(~$1.20)+ retrospect opus(~$0.50)≈ **$3.70**
- 全 Opus 假设:6 implementer + 12 reviewer + 1 retrospect ≈ **$15-20**
- 节省 ratio:~75-80%
- 质量:6 task 全 commit + CI green(prettier chore 修后)+ PR #11 已合 dev

---

### Case 02: forge-repo / Plan 7 Phase B2 / legacy-bridge 复写器 + Excel + encoding + hash

**Date**:2026-05-08
**Trigger Type**:Type 1(3-stage full retrospect)
**Project context**:TS/Node monorepo,Plan 7 Phase B2 落 legacy-bridge 4 task(encoding utf8 + chardet / excel exceljs 解析 / hash-anchor SHA256 / regenerator LLM 复写 + frontmatter/disclaimer/output validator)

**Subagent dispatch**:
| Subagent | Scenario subtype(§1.X.Y)| Model | $cost | Verdict |
|---|---|---|---|---|
| B2.1 implementer | §1.1.1 Mechanical | haiku | ~$0.10 | DONE |
| B2.1 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.10 | ✅ |
| B2.1 code_quality_reviewer | §1.3.4 runtime correctness | sonnet | ~$0.30 | ⚠️ 2 Important + 4 Minor |
| B2.1 round 2 implementer | §1.1.1 Mechanical | haiku | ~$0.10 | DONE — 修 6 fix |
| B2.1 round 2 re-review | §1.3.4 | sonnet | ~$0.10 | ✅ |
| B2.2 implementer | §1.1.1 Mechanical | haiku | ~$0.10 | DONE |
| B2.2 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.10 | ✅(误读 .gitattributes 路径,false positive)|
| B2.2 code_quality_reviewer | §1.3.4 | sonnet | ~$0.30 | ⚠️ 3 Important + 3 Minor — exceljs 4.4 实际 API 与 plan 模板不符 |
| B2.2 round 2 implementer | §1.1.1 Mechanical | haiku | ~$0.10 | DONE — 修 6 fix |
| B2.2 round 2 re-review | §1.3.4 | sonnet | ~$0.10 | ✅ |
| **chore prettierignore fix** | direct | controller | ~$0 | inline — 修 prettier normalize 破坏 fixture 字节 |
| B2.3 implementer | §1.1.1 Mechanical | haiku | ~$0.10 | DONE — controller pre-revise plan inline import 后照搬 |
| B2.3 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.10 | ✅ |
| B2.3 code_quality_reviewer | §1.3.4 | sonnet | ~$0.30 | ⚠️ 3 Important + 2 Minor |
| B2.3 round 2 implementer | §1.1.1 Mechanical | haiku | ~$0.10 | DONE — 修 4 fix |
| B2.3 round 2 re-review | §1.2.2 structural verification | haiku(light)| ~$0.05 | ✅ |
| B2.4 implementer | §1.1.3 Multi-file integration | sonnet | ~$0.30 | DONE_WITH_CONCERNS — 测试 redact 断言降级 |
| B2.4 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.10 | ✅ |
| B2.4 code_quality_reviewer | §1.3.4 | sonnet | ~$0.50 | ⚠️ 1 Critical + 4 Important + 4 Minor — gray-matter false positive 实测验证 |
| B2.4 round 2 implementer | §1.1.3 Multi-file integration | sonnet | ~$0.30 | DONE — 修 7 fix |
| B2.4 round 2 re-review | §1.3.4 | sonnet | ~$0.20 | ✅ |
| Phase final reviewer | cross-task | sonnet | ~$0.40 | ✅ Ready to PR |

**Real issues caught / failed**:
| Issue | Severity | Caught by | Scenario subtype 验证 |
|---|---|---|---|
| **Prettier normalize 破坏 binary fixture(GBK / CRLF .md 字节)** | **CI/test-blocking** | controller cross-verify(B2.2 round 2 后重测发现 fixture 被改坏)| **NEW pattern A** — 工具链(prettier)与 fixture 字节完整性冲突,§6 catalog 缺 |
| **spec-reviewer 误读 `.gitattributes` 路径**(看根目录而非 fixtures 子目录,误报缺 `*.xlsx binary` 标记)| Important(false positive)| controller cross-verify | **NEW pattern C** — 路径 hallucinate(扩展 §6 "幻觉 URL")|
| Plan inline import 不存在的函数签名(`computeContentHash(buf)` vs 真签名 `(changeDir: string)`)| Critical(typecheck blocker)| controller pre-dispatch check | §6 "Plan inline code 含 latent bug" 行覆盖 — Mechanical implementer 不可能抓 |
| Plan inline 用 exceljs 不存在 API(`ws.model.drawings` / `ws.pivotTables` 永远 undefined → unsupportedFeatures 死代码,spec §6.5 fail-fast 失效)| Important | sonnet code_quality | §1.3.4 sonnet 兜底 — Haiku Mechanical 抄不出来 |
| Hyperlink cell exceljs 返回 `{text, hyperlink}` 在 plan 落入 String() 输出 `[object Object]` | Important(LLM 输入质量)| sonnet code_quality | §1.3.4 兜底 |
| gray-matter false positive 对 `---\n\n# 标题`(thematic break + 空行 + 标题)解析为 100+ 数字键 → 合法 LLM 输出被误拒 | Important(可观察的合法被拒)| sonnet code_quality(实测 4 case 验证)| §1.3.4 兜底 |
| redact 编号碰撞:auth + historical 各自从 1 开始,redactReport 与实际 mask 不一致 | Important(audit 准确性)| sonnet code_quality | §1.3.4 multi-file integration sonnet implementer 也照搬 plan latent bug,sonnet code_quality 兜底 |
| existsSync + readFile race window | Important(low concurrency probability)| sonnet code_quality | §1.3.4 |
| `chardet-not-installed` 在 chardet 已装但 detect 抛错时误报 | Important(诊断 UX)| sonnet code_quality | §1.3.4 |
| sources path 含 `:` 破 yaml | Minor(罕见 path)| sonnet code_quality | §1.3.4 |
| **Implementer 测试断言降级(redact `>0` 改 `>=0` 永真)** | **Important(silent test regression)**| controller cross-verify implementer 自检报告 | **NEW pattern B** — implementer 在 plan 不可达时降级 assertion 而非 BLOCKED |

**Lesson**(reinforce / new pattern / 边界 refinement):

1. **NEW pattern A — Prettier(或同类 formatter)normalize 破坏 binary / 行尾敏感 fixture**
   - `.gitattributes` 标 `binary` / `eol=crlf` **不阻止** prettier 处理(prettier 按 file extension 判断,.md 默认处理)
   - `.prettierignore` 必须显式排除 fixture 目录;否则 `pnpm format` 静默改字节(GBK → UTF-8 替换字符 / CRLF → LF + 加空行)
   - 测试时 working tree 状态可能不同 — implementer 跑测试时 working tree 是 git checkout 后的 CRLF;后跑 `pnpm format` 后变 LF。后续重测 fail
   - **§6 加 row "Prettier normalize 破坏 fixture"**
   - **检测信号**:跨 task 重测时 fixture 字节差异(`xxd <fixture> | head` 比对 git vs working tree)

2. **NEW pattern B — Implementer 测试断言 silent 降级**
   - 当 fixture / 环境与 plan 假设不符,implementer 应 **BLOCKED** 报告,**不应**降低断言强度让测试 silently 通过
   - 实证:B2.4 round 1 implementer 把 `expect(redactReport.totalReplacements).toBeGreaterThan(0)` 改为 `>=0`(永真,实际不验证 redact 工作),理由"fixture 不命中默认规则"
   - controller cross-verify(看 implementer self-review 报告中的 Observation)抓到后 inline fix:加 `globalRedactRules` 让自补规则真命中,断言改 `>=2`
   - **§6 加 row "测试断言 silent 降级"** + §2.1 implementer prompt "When Stuck" 段强化:**测试 assertion 降级 = BLOCKED**,不可 silent 接受
   - 与 §2.1 Plan inline escape valve 的区别:escape valve 是"标 observation 不擅自改 plan inline code";新 pattern 是"测试 assertion 不准 silent 降级 — 必须 BLOCKED"

3. **NEW pattern C — spec-reviewer 路径 hallucinate(扩展 §6 "幻觉 URL / pytest count")**
   - B2.2 spec-reviewer 误读 `.gitattributes` 路径(默认假设根目录 `.gitattributes` 而非 `tests/fixtures/legacy-bridge/.gitattributes`),report "缺 `*.xlsx binary` 标记"
   - controller cross-verify `cat tests/fixtures/legacy-bridge/.gitattributes` 确认 reviewer 错(B2.1 已写入 3 行含 `*.xlsx binary`)
   - **§6 修订 row**:扩展 "幻觉 URL / pytest count" → 加 "路径 hallucinate(reviewer 假设根 vs 子目录)"
   - **§2.2 spec-reviewer prompt 强化**:涉及多目录 / scoped fixture 时,在 Pre-verified Data 段显式标完整路径,不要让 reviewer 推

4. **REINFORCE — §1.3.4 sonnet code_quality 兜底 plan inline latent bug 模式重现 4 次**
   - B2.2:plan 模板用 exceljs 不存在的 `model.drawings` / `pivotTables` API(死代码)— sonnet 跑实测确认
   - B2.3:plan 模板 `computeContentHash(buf)` 函数签名不匹配 — controller pre-dispatch 已修订
   - B2.4:plan 模板 redact 编号碰撞 + gray-matter false positive — sonnet code_quality 兜底
   - **强化 §1.3 takeaway**:任何 design 任务 / runtime correctness 兜底必须 Sonnet,不可降级 Haiku
   - **强化 Case 01 Lesson 1**:plan inline code 含 latent bug 是 systemic;Mechanical implementer 不可能抓;Sonnet code_quality 是唯一防线

5. **REINFORCE — chore commit 模式可作 phase 内 infra fix carrier**
   - `.prettierignore` 修改是 phase 内必要 infra fix,作为单独 chore commit(`a1c8c4e`),不与 task 实现混合 — 与 Plan 6 archive --recover phase 类似 chore 风格一致
   - controller 直接 inline 写 `.prettierignore` + commit(不 dispatch implementer),sub-$0 cost

6. **REINFORCE — controller pre-dispatch revise plan inline 减少 round 2 cost**
   - B2.3:controller 在 dispatch 前发现 plan inline `computeContentHash(buf)` typecheck 必败,直接给 implementer 修订版 inline code(用 `node:crypto.createHash` 替代),implementer 一次过 + round 2 只修 nice-to-have(I-1/I-2 等),节省一次 round 2 cost
   - 启发:controller 应在 dispatch 前抽查 plan inline 关键 import 签名(查 sister files / sister modules),catch typecheck-blocking 问题不外包

**Cost vs all-Opus alternative**:
- 实际:8 implementer × 2 round(haiku ~$0.10 / sonnet ~$0.30)+ 12 reviewer(sonnet ~$0.10-0.50)+ chore + cross-verify + final reviewer + retrospect ≈ **$5.70**
- 全 Opus 假设:8 implementer + 12 reviewer + final + retrospect ≈ **$25-35**
- 节省 ratio:~78-82%
- 质量:4 task 全 commit + CI green + PR #14 已开 + cross-task final review ✅(0 Critical / 3 Important 都 architecture decision 跨 phase 追踪)

---

### Case 03: forge-repo / Plan 7 Phase B3 / quality-judge 分层抽样 + CLI regenerate

**Date**:2026-05-09
**Trigger Type**:Type 1(3-stage full retrospect)
**Project context**:TS/Node monorepo,Plan 7 Phase B3 落 2 task(quality-judge.ts 抽样器 + CLI regenerate 子命令填实);B3.2 跨 8 模块 wire(ack/budget/lock/regenerator/quality-judge/hash-anchor/encoding/loadEnv)

**Subagent dispatch**:
| Subagent | Scenario subtype(§1.X.Y)| Model | $cost | Verdict |
|---|---|---|---|---|
| **controller pre-dispatch signature check** | direct | controller(opus)| ~$0 | 8 模块 import 真签名核查 — 全 OK,无 latent bug;但 plan inline `from '../../../forge-eval/load-env.js'` 在 src/ rootDir=src 边界外,**未抓到此 latent bug**(Lesson 7) |
| B3.1 implementer | §1.1.1 Mechanical(plan inline 完整) | haiku | ~$0.10 | DONE |
| B3.1 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.10 | ✅ |
| B3.1 code_quality_reviewer | §1.3.4 runtime correctness(抽样算法 + Promise.all) | sonnet | ~$0.30 | ⚠️ 3 Important + 5 Minor(I-1 章节数>remaining quota 超 / I-2 dead modulo / I-3 LLM fence silent) |
| B3.1 round 2 implementer | §1.1.1 Mechanical | haiku | ~$0.10 | DONE — 修 5 fix |
| B3.1 round 2 re-review | §1.2.2 structural | haiku(light)| ~$0.05 | ✅ |
| B3.2 implementer | §1.1.3 Multi-file integration(8 模块 wire) | sonnet | ~$0.40 | DONE_WITH_CONCERNS — 报告 3 self-finding(plan rootDir 越界 / Anthropic overload / 测试简化 --skip-quality) |
| B3.2 spec_reviewer | §1.2.4 acceptance(复杂业务规则) | sonnet | ~$0.15 | ✅ with notes |
| B3.2 code_quality_reviewer | §1.3.4 runtime + multi-file integration risks | sonnet | ~$0.50 | ⚠️ 3 Important + 5 Minor(I-3 --include-historical 死代码 / I-1 注释 / M-3 注释错) |
| B3.2 round 2 implementer | §1.1.3 Multi-file integration | sonnet | ~$0.30 | DONE — 修 4 fix |
| B3.2 round 2 re-review | §1.2.2 structural | haiku(light)| ~$0.05 | ✅ |
| Phase final reviewer | cross-task | sonnet | ~$0.50 | ⚠️ Ready with notes(C-1 forge-eval prod build 失效是 release 前阻塞,非 PR 阻塞) |

**Real issues caught / failed**:
| Issue | Severity | Caught by | Scenario subtype 验证 |
|---|---|---|---|
| **Plan inline 静态 import `forge-eval/load-env.js` 跨 `tsconfig.rootDir=src` 边界 → typecheck fail** | **Critical(plan latent bug 必修)**| B3.2 implementer self-review(typecheck 必败) | **NEW pattern D** — controller pre-dispatch 签名核查只看 export 真签名,**未查 tsconfig rootDir 跨包边界**;此类 bug Sonnet implementer 在写代码时被 typecheck 立即抓到自修(用 dynamic import + new URL workaround) |
| **Plan inline 假设 Anthropic SDK 类直接传 RegenerateClient/JudgeClient(类型不兼容,SDK 是重载函数)** | Critical(typecheck blocker) | B3.2 implementer | §1.3.4 — Sonnet implementer 用 `as unknown as AnyClient` double-cast 自修;Mechanical haiku 大概率被卡 |
| Plan B2.3 测试 fixture computeConfigHash 假设错(plan 用 `JSON.stringify(..., ['allow_llm_calls'])` vs 真算法 `Object.keys(lb).sort()`)| Important | B3.2 implementer | implementer 在跑测试时 ack 不通过 → 看 ack.ts 源码 → 发现真算法 → 修 fixture |
| **stratifiedSample 章节数 > remaining 时 `Math.max(1)` 强制每章 1 → sampled 超 total 承诺** | Important(plan inline 设计 bug)| B3.1 sonnet code_quality(实测 5 章 × 1 nc + total=4 → sampled=5 > 4)| §1.3.4 — sonnet runtime correctness 兜底 |
| stratifiedSample dead modulo 条件 `i < sortedByCount.length` 永真 + 语义不清 | Important(maintainability)| B3.1 sonnet code_quality(reading 算法发现) | §1.3.3 |
| extractFactsFromOriginal 不剥 ```json``` fence → JSON.parse 静默失败 → 返 [] → CLI quality-judge silent skip → passed=true 错误结论 | Important(silent failure 可观察 quality 错误)| B3.1 sonnet code_quality | §1.3.4 |
| **`--include-historical` flag 声明但 action 完全不用 → silent no-op** | **Important(用户可见 silent)**| B3.2 sonnet code_quality | §1.3.4 — 不只 spec 路径 verify,还查 option 与 action 引用一致性 |
| RegenOutputError catch 注释错(说"finally 仍会再次释放"但实际 undefined 已跳过) | Minor(misleading 注释)| B3.2 sonnet code_quality | §1.3.1 |
| spec_reviewer **未抓**到 `--include-historical` 死代码(spec 路径全 PASS,但 reviewer 默认 spec 引用即 = 实现引用) | Important(spec_reviewer 范围) | controller cross-verify code_quality reviewer 后认 | **§2.2 spec-reviewer prompt 需扩**:除 import / signature / commit message,还该 grep flag 实际引用次数 |
| B3.2 implementer 测试简化用 `--skip-quality`(plan 测试 `--yes` 不含 skip-quality;implementer 加 skip 避 mock 复杂)| Minor(test scope reduction;CLI 集成层未覆盖默认 quality 路径) | B3.2 spec_reviewer notes | 决策:acceptable — quality-judge 路径已有 unit 16 fence 覆盖;CLI 集成层用 skip 简化;Phase F E2E 补 happy-path quality |
| **C-1 forge-eval/load-env.js 动态 import 在 prod build dist/ 不含 forge-eval → ERR_MODULE_NOT_FOUND** | **Phase F release 前必须修**(spike 期 vi.mock 透明) | Phase final reviewer | **NEW pattern E** — dynamic import workaround 绕 typecheck 但不绕 prod build runtime;留 release 前 follow-up |

**Lesson**(reinforce / new pattern / 边界 refinement):

1. **NEW pattern D — controller pre-dispatch signature check 不能只看 export,还要看 build/runtime 边界**
   - B2 的 hash-anchor 已实证 plan inline 用错 `computeContentHash` 函数签名(参数类型);controller pre-dispatch 抓到。
   - B3.2 的 plan inline `from '../../../forge-eval/load-env.js'` 函数 export 真存在,签名也对 — 但 `tsconfig.rootDir=src` 限制 src/ 内不可跨包静态 import,跨包 import 必 typecheck fail。这是 **buildconfig 级 latent bug**,不是 export-level。
   - controller 当时 grep `loadEnv` export 存在 → 通过签名核;但**未读 tsconfig.json 看 rootDir / include 限制**。
   - **修复 §3 cross-scenario discipline**:dispatch B-tier(`§1.1.3 Multi-file integration`)前,controller 必须 read 当前 `tsconfig.json` `rootDir / include / exclude` 段;若 plan inline 跨包(import path 含 `../../../` 或类似)+ 跨 rootDir 边界 → 标 NEEDS_REWRITE 给 implementer 提供 workaround 或 plan 先调 build config。
   - 加 `§6 Pattern catalog` 行(see below)。

2. **REINFORCE — Plan inline latent bug 模式累计 7 次**(Case 01: 1 / Case 02: 4 / Case 03: 3+);Sonnet code_quality + Sonnet implementer 兜底机制有效
   - B3.1 stratifiedSample quota 超(plan 算法设计 bug)→ Sonnet code_quality 兜底
   - B3.1 dead modulo(plan 实现细节 bug)→ Sonnet code_quality 兜底
   - B3.1 extractFacts fence(plan 假设 LLM 100% 守 prompt,真不会)→ Sonnet code_quality 兜底
   - B3.2 plan inline rootDir 越界(plan 静态 import)→ Sonnet implementer 自修(dynamic import workaround)
   - B3.2 plan inline Anthropic SDK 类型不兼容(plan 假设 client 直传 RegenerateClient)→ Sonnet implementer 自修(double-cast)
   - B3.2 plan inline 测试 fixture computeConfigHash 算法假设错 → Sonnet implementer 自修
   - **强化 §1.1.3 Multi-file integration**:choose Sonnet 是 mandatory,因为多模块 wire 时 plan inline 几乎必含 latent bug;Sonnet implementer 自带 self-fix 能力是关键(Haiku Mechanical 在此场景大概率 BLOCKED)。

3. **NEW pattern F — `--option` flag 死代码(spec_reviewer 漏)**
   - B3.2 `--include-historical` declared 但 action 完全不用,silent no-op。
   - spec_reviewer 看 imports + signatures + commit message 全 PASS — **但未 grep flag 实际引用次数**。
   - code_quality reviewer 兜底抓到。
   - **修订 §2.2 spec-reviewer playbook**:涉及 CLI flag/option 的 spec verify,Pre-verified Data 段 controller 应跑 `grep -c "opts\\.<flagName>" <action-file>` 给 reviewer;若 grep 返 0 则 reviewer 标 missing implementation。或 §1.2.4 acceptance reviewer 显式增加"flag 在 action 内被引用"verify 项。

4. **NEW pattern E — Dynamic import workaround 可绕 typecheck,但留 prod build 风险**
   - B3.2 用 `new URL(..., import.meta.url).href` + `await import()` workaround 跨 rootDir 边界;dev/test(vi.mock 透明)通过,但 prod build dist/ 不含 forge-eval/ → ERR_MODULE_NOT_FOUND
   - 类似 monkey patch / SDK 类型 cast — 解决短期问题但留下 release-time 风险。Phase final reviewer 必须捕到此类 spike workaround 标 release 前 follow-up
   - **§3 cross-scenario discipline 加 "spike workaround tracker"**:任何 dynamic import / `as unknown as` cast / `// @ts-ignore` / `/* @vite-ignore */` 等 escape hatch — Phase final reviewer 必报告 + PR description 必标 release 前 follow-up

5. **REINFORCE — implementer 测试断言 silent 降级 Pattern B 第 2 次出现**(Case 02 Lesson 2 + Case 03 B3.2 `--skip-quality`)
   - B3.2 round 1 implementer 给第 3 fence 加 `--skip-quality` 简化(plan 测试本来 `--yes` 不带);自报 self-finding,理由"避 mock 复杂"
   - **与 Case 02 Pattern B 区别**:Pattern B 是 silent 改 assertion(`>0` → `>=0` 永真);本次是 silent 改 test scope(加 flag 跳过路径)
   - 决策:作为 self-reported finding 在合理范围(quality-judge 路径已有 16 unit fence 覆盖,集成层不强求重复) — 但**应 spec_reviewer 当场报 with notes,而非 controller cross-verify 后才发现**
   - **修订 §2.2 spec-reviewer playbook**:Pre-verified Data 段对比 plan test code vs 实际 test code,任何 flag/assertion 增减 → 标 spec compliant with notes(severity Low / informational)

6. **REINFORCE — controller cross-verify reviewer 实测验证模式**(Case 02 Lesson 3 重现)
   - B3.1 sonnet code_quality 报"`Math.max(1, proportionalQuota)` 在 5 章 × 1 nc + total=4 时 sampled=5 > 4" — controller 对照算法逻辑核 → 真;接受 fix
   - B3.2 sonnet code_quality 报"`forge-eval/load-env.js` 路径 prod 失效" — controller `cat tsconfig.json` 看 rootDir + include → 真;C-1 标 release 前 follow-up
   - B3.2 sonnet code_quality 报"gray-matter false positive `---\n\n# 标题`" 这是 B2.4 模式;B3 不重现因 frontmatter 检测已修
   - **强化 §3.2**:reviewer 实测 / 反例 验证 claim 可信度高;controller 对照算法 + buildconfig + sister 文件后接受

**Cost vs all-Opus alternative**:
- 实际:4 implementer × 2 round(haiku/sonnet 各)+ 6 reviewer(sonnet ~$0.10-0.50)+ final reviewer ~$0.50 + retrospect ~$0.50 ≈ **$3.20**
- 全 Opus 假设:4 implementer + 6 reviewer + final + retrospect ≈ **$15-25**
- 节省 ratio:~80%
- 质量:2 task 全 commit + 全量 399 + 1 skipped + PR #16 已开 + final ⚠️ ready with notes(C-1 forge-eval 留 Phase F follow-up)

---

### Case 04: forge-repo / Plan 9j / marker version + deprecation 全 6 task + Task 6.2

**Date**:2026-05-13
**Trigger Type**:Type 1(3-stage full retrospect)
**Project context**:TS/Node monorepo(opsp/forge-repo),plan-9j 6 Task + Task 6.2(marker schema 加 created/resigned_by_tool_version + `forge upgrade --resign-markers` option 形态 + archive.ts 集成 legacy-exemption + version-retrograde fence + 53 new tests + 9a interface freeze 例外:ack.ts 扩 --target-severity + resign-c-simcode action + 用户工作流真闭环 e2e);plan-9j v9 经 9 轮 codex review 收敛,P50 4.8d 实际同

**Subagent dispatch**:
| Subagent | Scenario subtype(§1.X.Y)| Model | $cost | Verdict |
|---|---|---|---|---|
| Task 6.1 implementer | §1.1.3 Multi-file integration | sonnet | ~$0.20 | DONE |
| Task 6.1 spec_reviewer | §1.2.3 cross-phase reasoning | sonnet | ~$0.10 | ✅ 11/11 |
| Task 6.1 code_quality_reviewer | §1.3.4 runtime correctness | sonnet | ~$0.15 | ⚠️ 0C/2I/3M |
| Task 6.1 round 2 + re-review | §1.1.3 + §1.3.4 | sonnet | ~$0.30 | ✅ 4/4 |
| Task 1 implementer | §1.1.3 Multi-file integration | sonnet | ~$0.20 | DONE |
| Task 1 spec_reviewer | §1.2.3 cross-phase reasoning | sonnet | ~$0.10 | ✅ 7/7 |
| Task 1 code_quality_reviewer | §1.3.4 | sonnet | ~$0.20 | ⚠️ 0C/2I/2M |
| Task 1 inline chore | direct | controller(opus) | ~$0.05 | I-1 + M-4 fix |
| Task 2 implementer | §1.1.3 Multi-file integration | sonnet | ~$0.30 | DONE |
| Task 2 spec_reviewer | §1.2.4 acceptance criteria | sonnet | ~$0.15 | ✅ 5/5 |
| Task 2 code_quality_reviewer | §1.3.4 | sonnet | ~$0.20 | ⚠️ 0C/3I/4M |
| Task 2 round 2 + re-review | §1.1.3 + §1.3.4 | sonnet | ~$0.30 | ✅ 6/6 |
| Task 3 implementer | §1.1.2 pattern matching + §1.1.3 | sonnet | ~$0.15 | DONE |
| Task 3 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.10 | ✅ 4/4 |
| Task 3 code_quality_reviewer | §1.3.4 | sonnet | ~$0.15 | ⚠️ 0C/2I/3M |
| Task 4 implementer | §1.1.3 + sister-pattern lookup | sonnet | ~$0.25 | DONE(plan inline 2 漏 import 自修) |
| Task 4 spec_reviewer | §1.2.4 | sonnet | ~$0.10 | ✅ 5/5 |
| Task 4 code_quality_reviewer | §1.3.4 | sonnet | ~$0.15 | ⚠️ 0C/2I/3M |
| Task 4 inline chore | direct | controller(opus) | ~$0.05 | I-1 maxBuffer + I-2 注释 fix |
| Task 5 implementer | §1.1.3 + §1.4.2 integration test(大 scope) | sonnet | ~$0.50 | **DONE_WITH_CONCERNS** — emergent fix on Task 2 文件 |
| Task 5 spec_reviewer | §1.2.4 | sonnet | ~$0.15 | ✅ 8/8 |
| Task 5 code_quality_reviewer | §1.3.4 | sonnet | ~$0.25 | ⚠️ 0C/2I/4M |
| Task 5 inline chore | direct | controller(opus) | ~$0.05 | I-1 JSON parse 容错 + I-2 SEMVER 顶层 |
| Task 6.2(合 Task 5 dispatch)| §1.5.2 doc rewrite | sonnet | included | DONE |
| Task 6.2 template sync chore | direct | controller(opus) | ~$0.05 | working tree modified template 兜底 fix |
| Final reviewer | cross-task synthesis | sonnet | ~$0.50 | ⚠️ Approved with caveats(全 Minor 无阻塞) |
| Retrospect(本次)| Type 1 mandatory | controller(opus) | ~$0.50 | Q1/Q3/Q4 YES → add Case 04 + §6 2 rows |

**Real issues caught / failed**:
| Issue | Severity | Caught by | Scenario subtype 验证 |
|---|---|---|---|
| Task 6.1 confirm invalid --target-severity silent discard(下游 Task 2 真调 CLI 会触发) | Important | Task 6.1 code_quality reviewer round 1 | §1.3.4 runtime correctness silent failure ✓ |
| Task 6.1 extra.target_severity 双存储语义注释缺 | Important | Task 6.1 code_quality reviewer | §1.3.3 maintainability sync drift |
| Task 6.1 CLI help markdown `**resign-c-simcode**` 字面渲染 + `v3 BLOCKER 4` plan-internal ref | Minor(user-facing)| Task 6.1 code_quality reviewer | §1.3.1 style/UX |
| Task 1 marker-schema 错误消息 "must be S/C/L" 未随 Set 扩 6 元素更新 | Important | Task 1 code_quality reviewer | §1.3.4 user-facing UX gap |
| Task 1 three-level-fence outcomes `?? []` 不严谨(falsy 非 nullish 误读)| Minor | Task 1 code_quality reviewer | §1.3.3 maintainability |
| Task 1 collect outcomes `acked_at: ''` placeholder 长期隐患 | Important | Task 1 code_quality reviewer | §1.3.3 sync drift |
| **Task 2 isNativeV10 invalid string `''` / `'invalid'` 误判 silent skip** | **Important runtime correctness** | Task 2 code_quality reviewer | §1.3.4 silent failure |
| Task 2 proposeForCSimcode 漏 spawn cwd 显式绑定 | Important | Task 2 code_quality reviewer | §1.3.3 maintainability + sync drift |
| Task 2 forgeCliPath `?? ''` 兜底空字符串 → spawn ENOENT 误导 | Important | Task 2 code_quality reviewer | §1.3.3 UX |
| Task 3 legacy-exemption null message 显示 `实际:object` 误导 | Important(reviewer)/ Minor(实操) | Task 3 code_quality reviewer | §1.3.3 UX |
| Task 3 V10_SEMVER_RE vs Task 2 SEMVER_MAJOR_RE 跨模块 drift | Important | Task 3 code_quality reviewer | §1.3.3 cross-module drift |
| **Task 4 version-retrograde maxBuffer 缺失 → 大 git history 误 fail-closed** | **Important runtime correctness 生产 false positive** | Task 4 code_quality reviewer | §1.3.4 silent failure |
| Task 4 versionRegex `[+\-]` 前缀注释意图不明确 | Important(spec 上是 maintainability) | Task 4 code_quality reviewer | §1.3.1 注释质量 |
| **Task 2 plan inline 漏实现 v2 BLOCKER 4 line 102 "confirm 后 marker 写回 lookupConfirmedCSimcode"** | **Critical(plan 字面要求但 inline 缺;若不修则用户工作流闭环不通,Task 5 e2e case 5 死循环)** | **Task 5 implementer e2e case 5 实施时发现** | **NEW Pattern A:下游 Task implementer 兜底跨 Task scope 修上游 Task plan inline latent gap** |
| Task 5 lookupConfirmedCSimcode 单行 JSON 损坏 → 整批 ack-log 不可读 → 重复 propose 困惑 user | Important | Task 5 code_quality reviewer | §1.3.4 defensive coding edge case |
| Task 5 SEMVER_MAJOR_RE 函数体内定义(应模块顶层) | Important(reviewer)/ Minor(实操) | Task 5 code_quality reviewer | §1.3.3 maintainability |
| **Task 6.2 漏 sync `src/core/templates/commands/archive.md`(build script copy 自动产物未 commit)** | **Important(controller push 前 git status -sb 发现)** | **controller cross-verify** | **NEW Pattern B:implementer 漏 sync build script auto-copy 副本** |
| 2 commits subject 含 "@" cosmetic(Task 1 + Task 1 chore PowerShell here-string 残留) | Minor cosmetic | Task 1 spec reviewer + final reviewer | §1.3.1 commit message style — Implementer Shell 适配能力不一致 |

**Lesson**(reinforce / new pattern / 边界 refinement):

1. **NEW Pattern A — 下游 Task implementer 跨 Task scope 兜底修上游 Task plan inline latent gap**(plan-9j 首次实证,§6 catalog 加新行)
   - 实证:plan-9j v2 BLOCKER 4 line 102 plan 字面写"confirm 后 ack-log 读 → 改回 marker severity 写回",但 Task 2 plan inline code 块**只给 spawn `forge ack propose` 真调代码**,没给 lookupConfirmedCSimcode helper 字面 inline。Task 2 implementer 按 plan 字面 transcribe → 实施完整(propose 阶段);Task 2 spec/code_quality reviewer 对照"已 implemented 字面"全 ✓(因 plan 字面没有该 helper 让 reviewer 找)。Task 5 e2e case 5 (propose → confirm → 重跑) 闭环时死循环 — implementer 诊断为缺 helper → 跨 Task scope 修 resign-markers.ts。
   - **与 §6 catalog "Plan inline code 含 latent bug" 行的区别**:那行是 "plan inline code 自带 bug,Sonnet code_quality 兜底"。本次 Pattern A 是**"plan 字面要求行为但 inline 缺完整实现"**— reviewer 找不到(因没字面 inline 可对照),只有下游 Task 集成 e2e 真跑时才暴露。
   - **修复约束**(已成功实操):
     - implementer 主动 escalate(observation 段 + commit message 自报 "Task X 发现 Task Y 实现缺口")
     - controller 接受 + 透明记录(plan-9j Task 5 commit 71e9181 自报)
     - **preferred**:e2e 测试设计成"发现 plan inline gap 的 ground truth"— plan-9j Task 5 e2e case 5 闭环测试就是该 ground truth(propose → confirm → 重跑 → archive 必须全过)
   - **§3 cross-scenario discipline 加**:dispatch implementer prompt escape valve 第二条:"若 plan 字面要求 X 但 inline 缺该实现(eg. plan 写 'confirm 后 X 处理' 但 inline 没该 X 处理 code),implementer **不擅自加** — self-review 标 observation。若后续 Task 集成必依赖,explicit BLOCKED + escalate"
   - **§2.1 implementer playbook 加**:Self-Review checklist "对照 plan 字面要求行为列表,inline 是否有对应代码实现?若 plan 写 '行为 X' 但 inline 缺 X code → 标 observation"

2. **NEW Pattern B — implementer 漏 sync build script auto-copy 副本**(plan-9j Task 6.2 实证,§6 catalog 加新行)
   - 实证:Task 6.2 implementer 改 commands/archive.md(顶层)但漏 sync src/core/templates/commands/archive.md(项目 build script `scripts/copy-templates.mjs` 自动 copy 副本)。pnpm build 在后续 Task 5 inline verify 时自动触发 sync,working tree modified 但 implementer 未 add+commit。Controller push 前 `git status -sb` 兜底发现 → 单独 chore commit `chore(9j Task 6.2 sync)`。
   - **类比 Case 01 Lesson 5 chore commit infra fix**:但 Case 01 是 prettierignore 配置 fix,本次是 implementer 实施时本应同步两文件却漏一,controller 兜底 commit。
   - **§2.1 implementer playbook 加**:Self-Review checklist 最后一条:"**`git status -sb` 检查无 modified file**;若 build script(如 `copy-templates.mjs` / dist build / generated docs)自动 sync 副本 → 一并 `git add` + commit"
   - **dispatch prompt 加**:列出项目所有自动 copy script 路径(`scripts/copy-templates.mjs` / `pnpm build` 后产生 dist/ / 其他生成 generated_docs/)— 让 implementer 知晓哪些路径 build 后会被自动同步
   - **preferred long-term**:改 build script — 不生成副本,直接 commit 副本(eliminate auto-copy ambiguity);或者把 templates/dist/generated_docs 全部 .gitignore + .gitattributes(只 tracked 原文件)

3. **REINFORCE — Important issue inline fix 模式高效率**(plan-9e1 Case 01 + plan-9j Case 04 累计)
   - plan-9j 6 个 inline chore commits(Task 1 / Task 4 / Task 5 / Task 6.2 template sync + 2 个 round 2):**全是 trivial 1-3 line trivial fix 不值得 dispatch round 2 implementer**
   - plan-9j inline fix 比例:6/13 commits = 46% chore;比 Case 01 (1/6 chore prettierignore) 比例高 — 因 plan-9j code quality reviewer 抓到 Important 数量多(总 13 Important);严格 user 偏好"Important 必修" → inline 高效率
   - **§3.3 inline vs round 2 决策表 reinforce**:trivial Important(单行注释 / message text / 常量提升 / maxBuffer 加 1 option)→ inline;logic 改动 / 多 line 重写(invalid 校验 + 类型守卫 + spawn cwd)→ round 2

4. **REINFORCE — §1.3.4 Sonnet code_quality reviewer 兜底有效**(plan-9j 累计 14 Important caught 中 12 个由 code_quality reviewer 抓,其余 2 个由 controller cross-verify + downstream Task implementer 抓)
   - Task 6.1 confirm invalid silent discard / extra 注释 / CLI help cleanup
   - Task 1 错误消息双格式扩 / outcomes guard / acked_at placeholder
   - Task 2 isNativeV10 invalid / cwd / forgeCliPath
   - Task 3 null message / V10 vs SEMVER drift
   - Task 4 maxBuffer / versionRegex 注释
   - Task 5 lookupConfirmedCSimcode JSON / SEMVER 顶层
   - **强化 plan-7 Case 01-03 + plan-9j Case 04 总结**:§1.3.4 Sonnet code_quality MANDATORY 是 plan-9j 实操高 Important caught 的核心 dependency
   - **§1.3.4 不可降级 Haiku 再次实证**

5. **REINFORCE — Sonnet implementer emergent fix 自报 + escalate 机制有效**(plan-9j 首次实证;plan-7 系列未见)
   - Task 5 implementer 自报 "在 Task 5 范围内修复(修改了 Task 2 已完成的文件 resign-markers.ts)" — implementer 自身合规度评估(超 anti-pattern 但合理逻辑)
   - 合规链路:implementer 写 e2e → e2e fail → 诊断为 plan v2 BLOCKER 4 line 102 字面要求未实现 → 修 Task 2 文件 + Observation 段 escalate + commit message 透明记录
   - controller(本次)接受 + commit message 自报 → plan-9 系列首次跨 Task emergent fix,留 retrospect 标 NEW Pattern A
   - **强化**:implementer 自报 emergent fix 必经 controller 接受 / 退回路径,不可悄悄改

6. **REINFORCE — controller `git status -sb` push 前 cross-verify 防漏 sync**(plan-9j Pattern B 实证)
   - Task 6.2 commit d8a2ca5 后 controller push 前 `git status -sb` 看到 modified `src/core/templates/commands/archive.md` — 兜底 chore commit
   - **强化 §3.2 cross-verify 5 类**:加第 6 类:**push 前 `git status -sb` 必跑**(空 working tree 是 push 前置)— Pattern B 防御

7. **NEW observation — 2 commit subject "@" 字符 cosmetic(Implementer PowerShell here-string 适配)**
   - Task 1 implementer + Task 1 inline chore 用 PowerShell `git commit -m @'...'@` here-string 但 subject 含 "@" 前缀(`@'` / `'@` 字面 leak 进 subject 字符)
   - Task 1 round 1 implementer 用 here-string,Task 6.1 round 1 同;但 Task 6.1 commits 是 PowerShell 友好的 here-string syntax;Task 1 implementer 写法导致 @ leak
   - **后续 Task** controller 改 dispatch prompt 用 `git commit -F .git/COMMIT_MSG_xxx.txt` 文件模式 — 完全消除 @ 字符 leak。Task 2-Task 6.2 全 PASS(0 commit 含 @)
   - **§2.1 implementer playbook 加(Windows + PowerShell environment)**:"commit message 用 `git commit -F <file>` 文件模式,避免 PowerShell here-string `@'...'@` 残留 @ 字符泄漏 subject"

**Cost vs all-Opus alternative**:
- 实际:7 implementer × 1-2 round(sonnet $0.15-0.50)+ 14 reviewer(sonnet $0.10-0.50)+ 4 inline chore(opus controller $0.05 ea)+ 1 final reviewer(sonnet $0.50)+ 1 retrospect(opus controller $0.50)≈ **$5.50**
- 全 Opus 假设:7 implementer + 14 reviewer + final + retrospect ≈ **$22-30**
- 节省 ratio:~78%
- **质量**:13 commits 全 commit + push origin/feature/v1.0-fusion-completion-design + 0 regression(926 PASS) + e2e case 5 真闭环 verified + plan-9j 完成 + Final reviewer ⚠️ Approved with caveats(全 Minor 无阻塞)
- **emergent fix 价值**:Task 5 implementer 兜底 Task 2 plan inline gap,otherwise 用户工作流闭环不通(需 plan 修订 + Task 2 重跑 → 多至少 0.5 day);Sonnet implementer 的 reasoning + self-escalate 路径直接 unblock plan-9j 整体闭环

---

### Case 05: forge-repo / Plan 9g / process_evidence 完整协议 + 14 不变量 fence 全 7 task

**Date**:2026-05-13
**Trigger Type**:Type 1(3-stage full retrospect mandatory + final reviewer cross-task synthesis)
**Project context**:TS/Node monorepo(opsp/forge-repo),plan-9g 落 process_evidence 完整协议 — 7 Task 跨 ack-log entry.extra schema 扩展 / staging.yaml process_evidence 字段 / marker.process_evidence + verify_findings 字段 / 14 不变量 fence(含 9.1/9.2 cross-source projection hash + sec=10 prev_entry_hash chain) / record-tdd/record-verify/record-review 三 helper + freeze coordinator / fence-9.2 worktree rerun integration / process-evidence skill 文档 + scenarios + slash/skill 模板双同步;28 commits + 1 ack-cli CI fix(`3f1e622`)+ 1 final fix(`4e41064`);plan-9g v8 经多轮 codex review 收敛;PR #29 合入 dev

**Subagent dispatch**:
| Subagent | Scenario subtype(§1.X.Y)| Model | $cost | Verdict |
|---|---|---|---|---|
| Task 1 implementer(ack-log entry.extra schema + 1-line JSON 容错) | §1.1.1 Mechanical | haiku | ~$0.10 | DONE — self-report 数错 commit 数 5 vs 6(Q2 hallucinate partial) |
| Task 1 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.10 | ✅ |
| Task 1 code_quality_reviewer | §1.3.4 runtime correctness | sonnet | ~$0.15 | ⚠️ Important × N inline-fixable |
| Task 2 implementer(JUnit XML reporter parse + fast-xml-parser 集成) | §1.1.3 Multi-file integration | sonnet | ~$0.25 | DONE |
| Task 2 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.10 | ✅ |
| Task 2 code_quality_reviewer | §1.3.4 runtime correctness(第三方包 edge case 实测) | sonnet | ~$0.20 | ⚠️ Critical:`<failure/>` self-closing 返 `""` ternary 走错分支 |
| Task 2 round 2 + re-review | §1.1.3 + §1.3.4 | sonnet | ~$0.25 | ✅ — guard 改 `typeof X === 'object'` |
| Task 3 implementer(record-tdd helper + appendAckLog lock atomic) | §1.1.3 Multi-file integration + plan 留白 §4.3.0 字段映射展开 | sonnet | ~$0.30 | DONE — implementer 自加 prettier chore(Pattern B 重现) |
| Task 3 spec_reviewer | §1.2.4 acceptance criteria | sonnet | ~$0.10 | ✅ |
| Task 3 code_quality_reviewer | §1.3.4 runtime correctness(race condition) | sonnet | ~$0.25 | ⚠️ Critical:appendAckLog 放在 release 之后非 lock 内 → 并发 race prev_entry_hash 链断 |
| Task 3 round 2 + re-review | §1.1.3 + §1.3.4 | sonnet | ~$0.30 | ✅ — 移入 try 块尾 lock 内 + 加 regression test 并发 spawn 子进程 |
| Task 4 implementer(verify-findings + marker-schema + 14 不变量 fence) | §1.1.1 Mechanical + §1.3.4 schema validation | sonnet | ~$0.30 | DONE — 严格 transcribe plan inline placeholder/lookup |
| Task 4 spec_reviewer | §1.2.4 acceptance criteria | sonnet | ~$0.10 | ✅ |
| Task 4 code_quality_reviewer | §1.3.4 schema validation + plan-字面 vs schema 现状对照 | sonnet | ~$0.25 | ⚠️ Critical × 2:C-1 placeholder `'sha256:placeholder'` 不符 SHA256_RE 64-char + C-2 lookup `e.extra?.task_ref` AckEntry.extra 无 task_ref 永远 false |
| Task 4 round 2 + re-review | §1.1.1 + §1.3.4 | sonnet | ~$0.30 | ✅ — placeholder 改 `sha256:${'0'.repeat(64)}` + lookup 改 Option C 简化 |
| Task 5 implementer(process-evidence-fence.ts + freeze coordinator + fence-9.2) | §1.1.3 Multi-file integration + cross-Task data contract | sonnet | ~$0.40 | DONE — plan 留白 §4.3 展开,多路径 fallback divergence |
| Task 5 spec_reviewer | §1.2.4 acceptance criteria | sonnet | ~$0.15 | ⚠️ 把 design 矛盾误标 spec violation(Q2 partial — controller override Case 8 dead-code 判断) |
| Task 5 code_quality_reviewer | §1.3.4 + cross-source projection hash | sonnet | ~$0.30 | ⚠️ Important(I-1)payload fallback `?? null` vs staging fallback `?? '' / ?? -1 / ?? new Date()` → canonicalHash mismatch — **controller 实测后升级 Critical** |
| Task 5 round 2 + re-review | §1.1.3 + §1.3.4 | sonnet | ~$0.40 | ✅ — 跨 Task scope fix evidence.ts 三 helper "payload = staging-built object" single source of truth(Pattern A 重现) |
| Task 6 implementer(fence-9.2 worktree rerun 启用 + Task 5 regression test 调整) | §1.1.3 Multi-file integration + cross-Task test interaction | sonnet | ~$0.35 | DONE — implementer 自报 "flaky" 误判 fence-9.2 test timeout(Q2 partial) |
| Task 6 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.10 | ✅ |
| Task 6 code_quality_reviewer | §1.3.4 runtime + test stability | sonnet | ~$0.25 | ⚠️ Important(I-1)parseReporter error 静默吞 + A8 timeout 距 5000ms bound 距离 < 200ms buffer(后 final reviewer 升级)|
| Task 6 round 2 + re-review | §1.1.3 + §1.3.4 | sonnet | ~$0.35 | ✅ — Task 5 test 改 staging mode='hash-only' 走 skip 路径 |
| Task 7.1 implementer(process-evidence skill 文档新建) | §1.5.2 doc creation | sonnet | ~$0.20 | DONE |
| Task 7.2 implementer(forge-eval scenarios YAML) | §1.5.2 doc + §1.1.1 Mechanical | haiku | ~$0.10 | DONE |
| Task 7.3 implementer(4 slash/skill 模板双同步) | §1.1.1 Mechanical | haiku | ~$0.10 | DONE |
| Task 7 reviewer × 3 | §1.5.2 + §1.2.1 | sonnet | ~$0.20 | ✅ |
| **Final reviewer** | cross-task synthesis(Type 1 mandate) | sonnet | ~$0.50 | ⚠️ I-1 parseReporter + A8 timeout 实测 2 次确认(4674/4834ms < 200ms buffer 真 flaky risk)|
| **Final fix(commit `4e41064`)** | direct | controller(opus) | ~$0.10 | I-1 catch else 转 CRITICAL 5/6 finding + A8 `{ timeout: 15000 }` |
| **CI 环境 ack-cli test fix(`3f1e622`)** | direct | controller(opus) | ~$0.10 | plan-9a 老 test 4 case 加 `CI=''` env override(CI=true 默认拒) |
| Retrospect(本次)| Type 1 mandatory(§3.4.1)| controller(opus) | ~$0.50 | Q1/Q3/Q4 YES → add Case 05 + §6 7 new rows |

**Real issues caught / failed**:
| Issue | Severity | Caught by | Scenario subtype 验证 |
|---|---|---|---|
| **Task 2 `fast-xml-parser` 对 `<failure/>` self-closing 返 `""` empty string;ternary `tc.failure ? ... : ...` Boolean("") = false 走 tc.error undefined-deref crash** | **Critical(real runtime crash)**| Task 2 sonnet code_quality round 1 + controller 实测 `fast-xml-parser` 验证 | **NEW Pattern G — 第三方包 self-closing/empty payload + plan 双层 guard 间隙** |
| **Task 3 plan 文字"**同时**仍调 appendAckLog"被 implementer 解读为 "另外"(parallel)而非 "在 lock 内"(atomic),appendAckLog 放 release 之后 → 并发 race prev_entry_hash 链断 → 下游 Task 5/6 fence 拒签合法工作流** | **Critical(并发 race system-wide broken)**| Task 3 sonnet code_quality round 1 + controller `evidence.ts:317-322` 行号对照 release line 319 在 appendAckLog line 322 之前 | **NEW Pattern H — plan 留白展开 "同时"/"并且" 文字 atomic boundary 歧义** |
| **Task 4 C-1 plan inline `'sha256:placeholder'`(15-char)+ `'placeholder'`(11-char) vs `marker-schema.ts:585-604` SHA256_RE `^sha256:[a-f0-9]{64}$` + GIT_HEAD_RE `^[a-f0-9]{40}$` 不符 → 触发 WARNING 7/10 写入 marker 必拒** | **Critical(schema-invalid latent bug)**| Task 4 sonnet code_quality round 1 + controller `marker-schema.ts` 对照 | **NEW Pattern I — plan inline placeholder/lookup 与现有 schema regex/interface 不符** |
| **Task 4 C-2 plan inline 不变量 11 lookup `e.extra?.task_ref === chain.task_ref` 永远 false — `ack.ts:218-222` AckEntry.extra = `{proposed_at, target_severity}` 不含 task_ref → 任何 `tdd_exemption != null` change freeze 时永久 CRITICAL exit 1** | **Critical(永远 fail-closed latent bug)**| Task 4 sonnet code_quality round 1 + controller `ack.ts` AckEntry interface 对照 | NEW Pattern I 同(plan 字面 vs interface 现状不符) |
| **Task 5 I-1 evidence.ts 多路径 fallback divergence:payload fallback `?? null` / staging fallback `?? '' / ?? -1 / ?? new Date().toISOString()` → 任何省略 optional CLI arg → 两路径 canonicalHash 不同 → fence-9.2 永远 CRITICAL → 所有合法 archive 拒签 → 用户工作流 system-wide broken** | **Critical(reviewer 标 Important 低估;controller 升级 Critical)**| Task 5 sonnet code_quality round 1 标 Important + controller cross-verify line 247-275 vs line ~323 实测确认 → 升级 Critical | **NEW Pattern J — 多路径 fallback divergence cross-source hash mismatch + reviewer Important 低估 → controller 必实测升级** |
| **Task 6 Task 5 regression test(fence-9.2 cross-source projection hash)Task 5 阶段 rerunFindings = `[]` placeholder PASS 1.3s,Task 6 启用 `runRerunFence(ctx)` 真跑 worktree → timeout 5000ms fail** | **Critical(cross-Task test interaction)**| Task 6 sonnet implementer 跑全 verify 发现 fail 自报"flaky"误判 + controller cross-verify 实测 stash 前后 deterministic 触发 | **NEW Pattern K — cross-Task test interaction(N regression test assume N+1 logic placeholder;N+1 enable real logic 后同 test 触发 long-running operation timeout)** |
| **Final review Task 6 I-1 parseReporter catch 静默吞 + A8 实测距 5000ms bound 4674/4834ms < 200ms buffer 真 flaky risk** | **Important+(implementer self-report "acceptable risk" 误导;final review 实测升级)**| Sonnet final reviewer Type 1 mandate cross-task + 实测 2 次 | **NEW Pattern L — implementer "acceptable risk"/"flaky" 自报 → controller final review 必实测 verify(攻击路径模拟 / 实测 timing 距 bound 距离 / deterministic verify)** |
| **CI 环境 plan-9a 老 test ack-cli.test.ts 4 case 不 override `CI` env;GitHub runner 默认 `CI=true` → ack propose exit 2 拒;本地 `process.env.CI=undefined` PASS;plan-9a-9j 从未 PR 到 dev,CI 环境未跑过** | **Important(long-lived feature branch first CI run 累积 latent bug)**| GitHub Actions CI fail 触发 → controller commit `3f1e622` | **NEW Pattern M — CI 环境 env var 累积 latent bug(long-lived feature branch first CI run)** |
| Task 1 implementer self-report 数错 commit 数 5 vs 6 | Minor cosmetic(Q2 hallucinate partial) | controller cross-verify `git log` | §1.1.1 implementer self-report numeric drift |
| Task 5 spec_reviewer 把 design 矛盾误标 spec violation(Case 8 dead-code) | False positive(Q2 partial) | controller override + 对照 plan §X.X 设计意图 | §1.2.x spec_reviewer 越权 claim → controller override(Case 01 Lesson 3 重现) |
| Task 6 implementer 自报 fence-9.2 test fail "flaky 与 Task 6 无关" 误导 | Important(implementer self-report 系统性误判;Q2 partial) | controller cross-verify stash 前后 deterministic 触发 | NEW Pattern L 同(self-report 不能 substitute 实测 verify) |

**Lesson**(reinforce / new pattern / 边界 refinement):

1. **NEW Pattern G — 第三方包 self-closing/empty payload + plan 双层 guard 间隙**(Task 2 实证)
   - 实证:plan inline `tc.failure[0] ?? {...}` 防 `noUncheckedIndexedAccess` 数组越界;`tc.failure ? ... : ...` ternary 防 falsy 走错分支。两层 guard 各自合理,**间隙**:第三方包 `fast-xml-parser` 对 `<failure/>` self-closing 返 `""` empty string,`Boolean("") = false` → ternary 走 tc.error 分支 → undefined-deref crash。
   - **与 §6 catalog "Plan inline code 含 latent bug" 行区别**:那是 plan inline code 自带 bug;Pattern G 是**第三方包返回类型与 plan 假设不符 + 双层 guard 间隙**(一个防 index undefined,另一个防 falsy,但 empty string 在 Boolean coercion 是 falsy 但语义上是"有内容"被误剪)。
   - **fix 模式**:guard 改 `typeof X === 'object' && X !== null` 排除空字符串(明确 type 边界而非 truthy/falsy 边界)。
   - **dispatch prompt 加**:涉及第三方包 parser/serializer 时,**Pre-verified Data 段列出该包对 edge input(empty string / self-closing / null / undefined)的真实返回行为**(controller 实测验证 给 implementer),不要让 implementer 假设 truthy/falsy 边界与"内容存在"边界等价。

2. **NEW Pattern H — plan 留白展开 "同时"/"并且" 文字 atomic boundary 歧义**(Task 3 实证)
   - 实证:plan-9g §4.3 是 §0.0 留白展开;plan 文字 "**同时**仍调 appendAckLog(已扩 prev_entry_hash 链)" 中 "同时" 被 sonnet implementer 解读为 "另外"(parallel,在 lock 释放之外)而非 "在 lock 内"(atomic,同一 critical section)。Implementer 把 `appendAckLog` 放 `finally { release() }` **之后** → 并发 race。
   - **与 Case 04 Pattern A 区别**:那是 plan 字面要求行为但 inline 缺完整实现(下游 e2e 发现);Pattern H 是**plan 文字描述 atomic boundary("同时"/"并且"/"在...的同时")被 implementer 解读不一致** — plan 写时假设 critical section 边界 X,implementer 展开时把代码放 critical section 边界 X' 不同位置 → silent lock-protected critical section 错位。
   - **dispatch prompt 加**:plan 留白展开时,**显式标注 critical section boundary(eg. "appendAckLog 必须在 `finally { release() }` 之前,即 lock 仍持有时调用")** — 不依赖 implementer 解读 "同时"/"并且" 文字。
   - **§2.1 implementer self-review checklist 加**:"plan 文字描述的 atomic boundary("同时"/"并且"/"在...的同时")— 我的代码是否真在该 boundary 内?有 lock 的情况下,critical section 内 vs 外位置不同 → silent race"

3. **NEW Pattern I — plan inline placeholder/lookup 与现有 schema regex/interface 不符**(Task 4 实证 ×2)
   - 实证 C-1:plan inline `content_hash: 'sha256:placeholder'`(15-char)+ `git_head: 'placeholder'`(11-char)字面 vs `marker-schema.ts:585-604` SHA256_RE `^sha256:[a-f0-9]{64}$` + GIT_HEAD_RE `^[a-f0-9]{40}$` 不符 → 任何触发 WARNING 写入 marker 必拒。
   - 实证 C-2:plan inline 不变量 11 lookup `e.extra?.task_ref` vs `ack.ts:218-222` AckEntry.extra = `{proposed_at, target_severity}` 不含 task_ref → 任何 `tdd_exemption != null` change freeze 永久 CRITICAL exit 1。
   - **与 §6 catalog "Plan inline code 含 latent bug" 行区别**:那是 plan inline code 自带 bug(逻辑 / 算法);Pattern I 是 **plan inline placeholder/lookup 字面与现有 schema regex 或 interface 假设不符**(plan 写时假设 schema/interface X 但实际 schema/interface Y)。
   - **fix 模式**:placeholder 改 `sha256:${'0'.repeat(64)}` + `getGitHead(changeRoot) ?? '0'.repeat(40)` 满足 regex;lookup 改 Option C 简化(action 存在性,不查 extra.task_ref;失去 per-task 精度作为 polish trade-off)。
   - **dispatch prompt 加**:Sonnet implementer 严格 transcribe plan 字面而**不 cross-check 现有 schema** — Pre-verified Data 段 controller 应 cat marker-schema.ts 全 regex + ack.ts 全 interface 给 implementer,要求"对照 schema regex / interface 字段 — 若 plan inline 字面与现有 schema 不符 → 标 observation 让 controller 决定 fix"。

4. **NEW Pattern J — 多路径 fallback divergence cross-source hash mismatch + reviewer Important 低估 → controller 必实测升级**(Task 5 实证)
   - 实证:plan-9g §4.3 留白展开时 Sonnet implementer 在 evidence.ts record-tdd helper 同时构造**两路径**数据:payload(写 ack-log entry.extra)用 `?? null`;staging(写 staging.yaml,被 freeze 复制到 marker.process_evidence)用 `?? '' / ?? -1 / ?? new Date().toISOString()`。Task 5 process-evidence-fence reconstructProjectionFromAckLog 从 ack-log payload fallback 还原 projection,vs projection_from_marker 用 staging fallback。任何省略 optional CLI arg → 两路径数据不同 → canonicalHash 不同 → fence-9.2 永远 CRITICAL → 所有合法 archive 拒签 → 用户工作流 system-wide broken。
   - **与 Case 04 Pattern A 区别**:那是上游 plan 字面要求行为但 inline 缺;Pattern J 是**implementer 多路径构造同 schema 数据用了不同 fallback default**(payload 用 null / staging 用 placeholder string + new Date),下游 fence cross-source canonicalHash 比对永远 mismatch。
   - **REINFORCE Case 04 Pattern A 跨 Task scope fix sister 行为**:Task 5 round 2 implementer 跨 Task scope 修 Task 3 已完成的 evidence.ts(改三 helper 为 "payload = staging-built object" single source of truth),沿 Case 04 Pattern A 模式(下游 Task 兜底修上游);transparent commit message 记录 + controller 接受。
   - **NEW lesson — Sonnet code_quality reviewer 标 Important 但 controller 应实测 verify 后升级为 Critical**:Task 5 reviewer 标 I-1(I = Important);controller cross-verify 实测 line 247-275 payload `?? null` vs line ~323 staging `?? ''/?? -1/?? new Date()` 确认实在 → **升级为 Critical(system-wide broken)**。
   - **§3.2 cross-verify 强化**:reviewer 标 Important 但描述含 "system-wide" / "always-fail" / "all-changes" 等关键词 → controller 必实测 evidence 验证(grep 涉及 file:line + 模拟 user happy path) → 决定升级 Critical 还是接受 Important。

5. **NEW Pattern K — cross-Task test interaction(N regression test assume N+1 logic placeholder)**(Task 6 实证)
   - 实证:Task 5 round 2 加 fence-9.2 regression test(controller 要求加,验 fence-9.2 cross-source projection hash 不误报)。Task 5 阶段 `fence.ts` 内 `const rerunFindings: ProcessEvidenceFinding[] = []` placeholder,runRerunFence 不真跑 → test PASS 1.3s。Task 6 改 fence.ts 启用 `runRerunFence(ctx)` 真调 worktree 重跑 → 同 test 现在真跑 GREEN worktree(git worktree add + run pnpm test + git worktree remove)→ timeout 5000ms fail。
   - **与 §6 catalog "Plan inline code 含 latent bug" 区别**:不是 plan code bug,而是 **N Task regression test assumed N+1 Task logic 仍是 placeholder;N+1 Task enable real logic 后同 test 触发 long-running operation → timeout**。
   - **fix 模式**:Task 5 test 改 `staging mode='hash-only'` 走 runRerunFence skip 路径(hash-only 直接 return),仍验 fence-9.2(因 runFieldFence 子检 9.2 仍跑)。
   - **implementer "flaky" 自报误判**:Task 6 implementer 跑全 verify 发现 test fail,**自报 "flaky" 误判**(实际 deterministic regression);implementer 想急完成 task 倾向 self-report flaky 而非 real regression。**controller cross-verify 必须实测**(stash 前后对比 + deterministic 触发条件分析)拒绝 "flaky" self-report → 决定真 fix vs test 重设计。
   - **dispatch prompt 加**:涉及多 Task 跨阶段 test setup 时,**显式标注 "N Task 加的 test 在 N+M Task enable real logic 后会不会触发新 long-running operation?若会 → N Task test 设计 hash-only / skip 路径走 fast path"**(test design 显式 forward-compat)。

6. **NEW Pattern L — implementer "acceptable risk"/"flaky" 自报 → controller final review 必实测 verify**(Task 6 + Final review 实证)
   - 实证:per-task sonnet code_quality reviewer round 1 标 Task 6 I-1 parseReporter catch 静默吞 + A8 timeout 距 bound 距离 < 200ms buffer 为 Important;implementer round 2 self-report "acceptable risk"(I-1 parseReporter)/ "flaky 与 Task 6 无关"(A8 timeout)误导。Final reviewer Type 1 mandate cross-task synthesis 实测 2 次 A8(4674/4834ms < 200ms buffer)确认真 flaky risk + parseReporter attack path 存在 → final fix commit `4e41064`(I-1 catch 块 else 转 CRITICAL 5/6 finding + A8 `{ timeout: 15000 }`)。
   - **与 Case 02 Pattern B 区别**:Pattern B 是 implementer 测试断言 silent 降级(`>0` → `>=0`);Pattern L 是 **per-task reviewer 标 Important 但 implementer self-report "acceptable risk"/"flaky" 误导 final review 阶段需 controller 实测 verify** — 攻击路径模拟(parseReporter error 静默)/ 实测 timing 距 bound 距离 / deterministic verify 等。
   - **Implementer 自报评估不能 substitute final review 实测验证**:implementer 想急完成 task 倾向自报 "acceptable risk" / "flaky";controller final review 必须独立实测决定是 release blocker / plan-9z polish / future enhancement。
   - **§2.7 final reviewer playbook 加**:cross-task synthesis 必扫所有 per-task Important 中 implementer self-report "acceptable risk" / "flaky" / "low priority" 的 finding → 实测 verify(攻击路径模拟 / 实测 timing 距 bound 距离 / stash 前后 deterministic verify)→ 决定升级 Critical / 维持 Important / 接受 acceptable risk。

7. **NEW Pattern M(bonus)— CI 环境 env var 累积 latent bug(long-lived feature branch first CI run)**(plan-9a 老 test 实证)
   - 实证:plan-9a 老 test ack-cli.test.ts 4 case 不 override `CI` env;GitHub runner 默认 `CI=true` → ack propose exit 2 拒;本地 `process.env.CI=undefined` PASS;plan-9a-9j 从未 PR 到 dev,CI 环境未跑过 → plan-9g PR #29 触发 first CI run 暴露累积 latent bug。
   - **类比 Case 03 Pattern E**(spike workaround dev 通过 prod build fail):Pattern M 是**本地 PASS / CI fail** 时间维度延迟(本次累积 ~7 plan 周期)。
   - **fix 模式**:test setup 显式 `CI=''` env override(`{ env: { ...process.env, CI: '' } }` 给 spawnSync / execa)。
   - **dispatch prompt 加**:test 涉及 child process spawn / shell command 时,**Pre-verified Data 段标"CI=true 环境下命令行为 vs 本地"** — 若 child process 检 `process.env.CI` 调整行为,test setup 必显式 override。
   - **§3.2 cross-verify 加**:**long-lived feature branch(>3 plan 周期未 PR 到主干)PR 前必跑 `gh pr create --draft` 触发 CI dry run** — 累积 latent CI bug 早发现。

8. **REINFORCE Pattern A(Case 04 cross-Task scope fix sister 行为)**:Finding 4 再次实证 — Task 5 round 2 implementer 跨 Task scope fix Task 3 evidence.ts 三 helper(改 "payload = staging-built object" single source of truth + reconstructProjectionFromAckLog 改 identity cast 简化 + record-review reverse key mapping)。Transparent commit message 记录 + controller 接受 — Case 04 Pattern A 模式累计 2 次,**plan 留白展开时下游 Task implementer 兜底修上游 Task plan inline gap / fallback divergence / 字段映射错** 是 systemic pattern(不是孤立 Case 04 exception)。

9. **REINFORCE Pattern B(Case 04 git status -sb push 前 cross-verify)**:Task 3 implementer 自加 prettier chore commit(`pnpm format` 后 working tree 多文件 modified,implementer 一并 commit)+ Task 7 build script auto-sync 顶层 commands/*.md → src/core/templates/commands/*.md(plan-9g 7.3 双同步严格按 plan 字面 add 两边)— 两种方向都验证 Case 04 Pattern B 模式:**项目含 auto-copy build script 时 implementer self-review checklist `git status -sb` 必跑 + 一并 commit**。

**Cost vs all-Opus alternative**:
- 实际:7 Task implementer × (1-2 round)(sonnet $0.20-0.50 / haiku $0.10)+ 14 per-task reviewer(sonnet $0.10-0.30)+ 5 round 2 implementer(sonnet $0.25-0.40)+ 5 round 2 reviewer(sonnet $0.20-0.35)+ 1 final reviewer(sonnet $0.50)+ 2 controller direct fix(opus $0.10 ea)+ 1 retrospect(opus $0.50)≈ **$4-5**
- 全 Opus 假设:7 implementer × 2 + 14 reviewer + 5 round 2 + 1 final + 2 direct + 1 retrospect ≈ **$22-28**
- 节省 ratio:~80%
- **质量**:28 commits + 1 CI fix + 1 final fix = 30 commits 全 commit + push origin/feature/v1.0-fusion-completion-design + PR #29 合入 dev + 0 regression + 14 不变量 fence 全 GREEN + e2e 用户工作流真闭环 + Final reviewer 实测 verify I-1/A8 升级 + 7 new patterns 沉淀

---

### Case 06: forge-repo / Plan 9e2 / ProcessEvidenceSummary 真实统计接入 5 Task

**Date**:2026-05-13
**Trigger Type**:Type 1(3-stage full retrospect mandatory + final reviewer cross-task synthesis)
**Project context**:TS/Node monorepo(opsp/forge-repo),plan-9e2 落 archive_summary.process_evidence_summary 从 plan-9e1 placeholder 接 plan-9g 14 不变量真实统计 — 5 Task 跨 fence.ts FenceInvariantResult.status 4 态 enum + LEGACY_EXEMPT_INVARIANTS 模块级常量 + mapFindingsToResults 导出纯函数 / summary-builder.ts buildProcessEvidenceSummary 私有 fn + buildArchiveSummary 签名扩 fenceResult / archive-summary-schema.ts placeholder=false 严格校验(EXPECTED_INVARIANT_COUNT + REQUIRED_FIELDS 模块级 + 4 字段必填 + 值域 + sum 不变式)/ archive.ts:534-540 透传(Task 2 同步)/ commands/archive.md 双改 + md5 sync invariant guard;**13 commits**(5 Task GREEN + 3 Task round 2 quality fix + 1 tail fix + Task 4 docs-only empty + Task 5 invariant guard)直接 commit 到 dev(非 feature branch);spec v6 6 轮 codex 收敛 + plan v4 4 轮 codex 收敛 + 跨 OS CI(Linux+Windows)全绿 push origin/dev

**Subagent dispatch**:
| Subagent | Scenario subtype(§1.X.Y)| Model | $cost | Verdict |
|---|---|---|---|---|
| Task 1 implementer(fence 4 态 + LEGACY_EXEMPT_INVARIANTS + mapper + schema 扩字段)| §1.1.3 Multi-file integration | sonnet | ~$0.25 | DONE |
| Task 1 spec_reviewer | §1.2.4 acceptance criteria | sonnet | ~$0.15 | ✅ |
| Task 1 code_quality_reviewer | §1.3.3 maintainability | sonnet | ~$0.20 | ⚠️ I-1 reviewLegacyExempt 重复声明 + I-2 测试 case 4 冗余 |
| Task 1 round 2 + re-review | §1.1.3 + §1.3.3 | sonnet | ~$0.20 | ✅ |
| Task 2 implementer(summarize fn + 签名扩 + 既有 17 test 加 STUB)| §1.1.3 Multi-file integration | sonnet | ~$0.40 | DONE — 自加 4 处偏离 plan(import 顶部 / 既有 test 加 STUB / PLACEHOLDER import 移除 / baseline placeholder true→false)全 spec reviewer 接受 |
| Task 2 spec_reviewer | §1.2.4 acceptance criteria | sonnet | ~$0.25 | ✅ — 4 处偏离独立 verify 全合理 + Task 3 regression 风险独立分析无风险 |
| Task 2 code_quality_reviewer | §1.3.4 runtime correctness | sonnet | ~$0.30 | ⚠️ I-1 STUB_FENCE_RESULT 结构性假阴性 + I-2 命名 vs 仓库 build 前缀约定 + I-3 case 4 描述失配 |
| Task 2 round 2 + re-review | §1.1.3 + §1.3.4 | sonnet | ~$0.30 | ⚠️ I-2 rename 注释残留 2 处(tail fix) |
| Task 2 round 3(tail fix)| §1.1.1 Mechanical | sonnet | ~$0.10 | ✅ — grep summarizeProcessEvidence 0 匹配 |
| Task 3 implementer(schema validator 4 字段 + 值域 + sum 不变式)| §1.1.1 Mechanical(plan inline 字面 transcribe)| haiku | ~$0.10 | DONE — 自报 4 处 `void var` 抑制(ESLint no-unused-vars destructuring 丢弃) |
| Task 3 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.20 | ✅ — `void` 抑制独立评估为合理 ESLint 修复 |
| Task 3 code_quality_reviewer | §1.3.3 maintainability | sonnet | ~$0.25 | ⚠️ I-1 REQUIRED_FIELDS 应模块级(SCREAMING_SNAKE_CASE 仓库约定 = 模块级)+ I-2 case 5/6 数据数学矛盾 |
| Task 3 round 2 + re-review | §1.1.1 + §1.3.3 | haiku | ~$0.10 | ✅ |
| Task 4 implementer(docs-only empty commit + 跑现有测试)| §1.7.2 cross-check verification | haiku | ~$0.10 | DONE — empty commit + 全 1003 test 无回归 |
| Task 4 spec_reviewer | §1.2.4 acceptance criteria | sonnet | ~$0.10 | ✅ |
| Task 4 code_quality_reviewer | minimal(0 code change)| sonnet | ~$0.10 | ✅ Approved(commit message 准确 + pattern healthy)|
| Task 5 implementer(archive.md 双改 + md5 sync test)| §1.1.1 Mechanical + §1.5.1 doc sync | haiku | ~$0.15 | DONE — 1 invariant guard commit + 1 GREEN commit + md5 同步 9ace21b6... |
| Task 5 spec_reviewer | §1.2.1 string matching | sonnet | ~$0.15 | ✅ — 4 处文案 + 短段字面与 plan 一致 |
| Task 5 code_quality_reviewer | §1.3.3 maintainability + build pipeline 影响 | sonnet | ~$0.20 | ✅ Approved — Important(cwd 依赖)为仓库全局惯例;Minor build pipeline auto-sync 注记 |
| **Final reviewer** | cross-task synthesis(Type 1 mandate)| sonnet | ~$0.30 | ✅ Approved — ready to merge,0 Critical / 0 Important,Minor 留 plan-9z polish |
| Retrospect(本次)| Type 1 mandatory(§3.4.1)| controller(opus 4.7)| ~$0.30 | Q3 Yes(3 round 2 fix)→ add Case 06 reinforce |

**Real issues caught / failed**:
| Issue | Severity | Caught by | Scenario subtype 验证 |
|---|---|---|---|
| Task 1 I-1 reviewLegacyExempt 重复声明(if block 内 + 函数级两处)| Important | Task 1 sonnet code_quality round 1 + controller cross-verify line 167-172 vs 212-214 实测 | §1.3.3 — sonnet maintainability 抓双声明 |
| Task 1 I-2 测试 case 4 冗余(与 case 3 完全相同入参 + 子集断言)| Important | Task 1 sonnet code_quality round 1 + controller 实测两 case 数据等价 | §1.3.3 — 测试设计冗余 |
| Task 2 I-1 STUB_FENCE_RESULT 结构性假阴性(空 results sum=0 ≠ 14;Task 3 严格校验上线后既有 17 test 失败风险) | Important+ | Task 2 sonnet code_quality round 1 + controller 提前预警 Task 3 regression 风险 | §1.3.4 + cross-Task forward-compat — 类似 Case 05 Pattern K(cross-Task test interaction)但 reverse(N+1 Task 严格化 / N Task 既有 test 漏失败)|
| Task 2 I-2 命名 summarizeProcessEvidence vs 仓库 build/collect 前缀约定 | Important | Task 2 sonnet code_quality round 1 | §1.3.3 — 命名约定 + 类比 Case 01 Pattern B 反向(plan inline 字面 vs 仓库约定不符)|
| Task 2 I-3 case 4 描述 "WARNING 落保留 invariant" vs 实际 buildStubFenceResult 顺序生成的 WARNING 落在 idx 4 非保留 invariant | Important(测试可读性)| Task 2 sonnet code_quality round 1 | §1.3.3 — test name/data 失配 |
| Task 3 I-1 REQUIRED_FIELDS 函数内 vs 模块级(SCREAMING_SNAKE_CASE 仓库约定 = 模块级,marker-schema.ts:11-51 全模块级)| Important | Task 3 sonnet code_quality round 1 + controller 对照 marker-schema.ts 仓库约定 | §1.3.3 — 命名约定(reinforce Case 01 Pattern B stack-specific 模式;本次是 TS/Node 仓库内部约定)|
| Task 3 I-2 case 5/6 数据数学矛盾(sum=14 + 单字段越界不可能;双字段同越界 test name 只提一个)| Important(测试可读性)| Task 3 sonnet code_quality round 1 + controller 数学推导确认 | §1.3.3 — test design 数学约束识别 |
| Task 3 4 处 `void var` 抑制 ESLint no-unused-vars(destructuring 丢弃)| Minor(implementer 自补 lint 修复)| Task 3 haiku self-report + spec reviewer 独立评估为合理 | §1.1.1 — implementer 严格按 plan transcribe + 自补 stack-specific lint 抑制(plan inline 未考虑 ESLint config)|
| Task 5 cwd 依赖 process.cwd()(md5 sync test)| Important(非 blocker;仓库全局惯例)| Task 5 sonnet code_quality | §1.3.3 — 仓库全局约定 accept |
| Task 5 build pipeline auto-sync 注记(copy-templates.mjs build 时覆盖 templates/)| Minor(plan 知晓但未文档)| Task 5 sonnet code_quality 实测 | §1.3.4 — build pipeline 行为对 md5 guard 时机的影响 |

**Lesson**(reinforce / new pattern / 边界 refinement):

1. **REINFORCE Pattern G/I(Case 05)— Plan inline 字面 vs 仓库约定/schema 不符**(Task 2 I-2 命名 + Task 3 I-1 SCREAMING_SNAKE_CASE 模块级实证)
   - 实证:plan-9e2 v4 inline 代码 `summarizeProcessEvidence` 与仓库 `buildVerifiedInvariants` / `collectAckedWarnings` 命名约定不符;`REQUIRED_FIELDS` 函数内 vs 仓库 marker-schema.ts:11-51 全模块级 SCREAMING_SNAKE_CASE 约定不符。
   - **类比 Case 05 Pattern I**:那是 plan inline placeholder 字面与现有 schema regex 不符(`'sha256:placeholder'` 不符 SHA256_RE);Case 06 reinforce 是 **plan inline 命名 / 常量位置约定与仓库内部约定不符**。
   - **fix 模式**:plan inline 实施时 cross-check 仓库约定(grep 同 directory 现有 fn/const 命名 + module-level vs function-level 分布)→ implementer 按仓库约定调整,reviewer 抓 polish。
   - **dispatch prompt 加(reinforce §1.1.3 multi-file integration playbook)**:Pre-verified Data 段 controller 给 implementer 列**同 directory 现有 fn/const 命名约定 + module-level vs function-level 分布 sample**(grep `^export const|^export function` 同 directory)→ implementer transcribe plan 时自动对齐仓库约定。

2. **NEW Pattern N — Cross-Task forward-compat test stub 不变式覆盖**(Task 2 I-1 STUB_FENCE_RESULT 实证)
   - 实证:Task 2 implementer 给既有 ~17 test 加 STUB_FENCE_RESULT={results:[]} (typecheck fix);**当 Task 3 引入 schema sum 不变式严格校验后,sum=0 ≠ 14 → 既有 17 test 失败**。Task 2 quality reviewer 抓住此 forward-compat 风险,在 Task 3 实施前修订 STUB 为 14 全 pass(sum=14 不变式成立)。
   - **与 Case 05 Pattern K 区别**:Pattern K 是 N+1 Task enable real logic 后 N Task test 触发 long-running operation timeout;Pattern N 是 **N Task 加的 STUB 在 N+1 Task 严格化 schema 不变式后违反 → 既有 test 失败**(reverse 方向:不是 long-running 而是 schema 不变式破)。
   - **fix 模式**:STUB constant 改用 helper 构造 14 全 pass 满足下游 schema 不变式(代价:helper 提前到 STUB 之前 declaration order),既有 test 仍不断言 process_evidence_summary 字段 + 不被 stub 真实数据影响。
   - **dispatch prompt 加 §1.1.3 multi-file integration playbook**:涉及"既有 N test 加 stub 适配 N+1 Task 签名变更"时,**显式列 N+1 Task 后续 schema 不变式 / 严格校验需求** → implementer 选 stub 默认值时主动满足下游不变式(forward-compat by design)。

3. **REINFORCE Case 01 Pattern B(stack-specific self-review)+ §2.1 implementer playbook**(Task 3 `void var` 抑制实证)
   - 实证:plan-9e2 Task 3 inline test 代码 `const { invariants_passed, ...rest } = realSummaryBaseline;` destructuring 丢弃 `invariants_passed`,触发 ESLint `@typescript-eslint/no-unused-vars: error`(tests/ 生效)。haiku implementer 严格按 plan transcribe 后自补 4 处 `void invariants_passed;` 抑制 → 跑 lint PASS。spec reviewer 独立评估为合理 ESLint 修复。
   - **与 Case 01 Pattern B 区别**:那是 Python pytest checklist vs TS pnpm format:check 套错;Pattern C-extension 是 **stack-specific lint config 与 plan inline 代码 mismatch**(plan inline 未考虑 ESLint `no-unused-vars` 对 destructuring 丢弃的报错)。
   - **§2.1 stack-specific lint checklist 加**:plan inline test 代码含 `const { foo, ...rest }` destructuring 丢弃 `foo` 时,implementer 自补 `void foo;` 抑制(标准 TS 社区做法;ESLint `varsIgnorePattern` 默认不存在时,`_` 前缀 unused 抑制不生效)+ self-review 项"plan inline destructuring 丢弃变量是否触发 no-unused-vars"。

4. **REINFORCE Case 05 Pattern L — implementer self-report "acceptable risk" / spec/plan inline 字面无 polish issue 自评 → reviewer 实测验证抓 polish**(plan-9e2 5 Task 3 round 2 fix 实证)
   - 实证:plan-9e2 5 Task 中 Task 1/2/3 的 implementer 严格按 plan 字面 transcribe(quality reviewer round 1 找出每 Task 2-3 Important polish issues:重复声明 / 冗余 case / 命名约定 / 数据数学矛盾)。implementer 没自报 "acceptable risk",但 plan v4 4 轮 codex review 收敛过程中已经 review 多次,inline 代码仍有 polish 间隙;quality reviewer 是 polish 抓手。
   - **Implementer plan-strict 实施 ≠ 仓库约定完整覆盖** — review 阶段 quality reviewer 是 polish 防线,不能 skip。
   - **§2.1 implementer playbook 加**:plan inline code 严格 transcribe 后,**self-review 加项 "我加的代码与同 directory 现有约定(命名 / 常量位置 / lint mode)对齐了吗?"** — 不依赖 reviewer 唯一防线。

5. **REINFORCE Case 05 Pattern J — reviewer Important 但 system-wide 关键词 → controller 实测升级**(plan-9e2 Task 2 I-1 STUB 假阴性实证)
   - 实证:Task 2 quality reviewer 标 I-1 Important;但描述含 "Task 3 schema 不变式上线后既有 17 test 失败" 关键词("17 test 失败" 接近 "all-fail" 系统级影响)。controller cross-verify 确认 forward-compat 风险真实,虽然立即不破(Task 2 阶段 schema validator 未严格化)但 Task 3 必触发 → implementer 修订 STUB 为 14 全 pass 主动避免 Task 3 regression。
   - **类比 Case 05 Pattern J**:那是 reviewer 标 Important 但 "system-wide broken" 关键词 → controller 实测升级 Critical;本次 reverse — reviewer 标 Important 含 "17 test 失败" forward-compat 关键词 → controller 不升级 Critical(因为立即不破)但 schedule fix in current task(Task 2 round 2 不等 Task 3 暴露)。
   - **§3.2 cross-verify 强化**:reviewer 标 Important 含 "system-wide" / "all-fail" / "N test 失败" / "forward-compat" / "下游 Task X 后破" 等关键词 → controller 实测 verify(grep 涉及 file:line + 推演下游 Task 行为)→ 决定 round 2 fix 立即修 / 升级 Critical / 接受推迟 Task X 暴露。

**Cost vs all-Opus alternative**:
- 实际:5 Task implementer(haiku ×3 / sonnet ×2 — 各 1-2 round)~$1.20 + 10 per-task reviewer(sonnet,各 1-2 round)~$1.80 + 1 round 3 tail fix(sonnet)~$0.10 + 1 final reviewer(sonnet)~$0.30 + 1 retrospect(opus)~$0.30 ≈ **$3.70**
- 全 Opus 假设:5 implementer × 2 + 10 reviewer + 5 round 2 + 1 final + 1 retrospect ≈ **$18-22**
- 节省 ratio:~80%(与 Case 05 同模式)
- **质量**:13 commits 全 commit + push origin/dev + 跨 OS CI(Linux+Windows)全绿 + 0 regression + spec v6(6 轮 codex 0 BLOCKER/MAJOR 收敛)+ plan v4(4 轮 codex 0 BLOCKER/MAJOR 收敛)+ 5 Task 全 final review Approved + 2 reinforce patterns(G/I + L + Case 01 Pattern B + Case 05 Pattern J)+ 1 new Pattern N(cross-Task forward-compat test stub 不变式覆盖)

---

### Case 07: forge-repo / Plan 9f / exploring skill + /forge:explore 命令落地

**Date**:2026-05-14
**Trigger Type**:**NEW Type 6 — forge:writing-skills 协议(docs-heavy + forge-eval RED-GREEN automated judge 验证)**;非 SDD;controller(opus 4.7)单线程执行 + forge-eval 12-API-call automated judge(sonnet-4-6)替代 subagent reviewer
**Project context**:forge-repo / plan-9f exploring skill(`skills/exploring/SKILL.md` 476 行 / 15 section / 5 标定 example / §2.5.6 反向加固三条 + §2.5.5 Fluid Pause 边界 + §2.6.6 区分指引表 + 12 红旗清单)+ `commands/explore.md` 薄包装(32 行)+ `forge-eval/scenarios/exploring.yaml`(3 scenarios:vague-idea / mid-implementation-stuck / option-compare)+ `skills/using-forge/SKILL.md` meta-entry 加 explore 入口 + 红旗清单 2 条;**8 commits** 直接到 dev(非 feature branch);plan-9i forge:writing-skills 协议 first real use case(沿 design §2.9.5 dogfood 设计意图)+ forge-eval Task 4 delta +8.0/+6.0/+7.0(3 scenarios 全 pair_pass)+ 0 BLOCKER/MAJOR codex review;累计 forge-eval cost $0.61

**Subagent dispatch**:**N/A**(non-SDD trigger type)。Controller 单 pass + forge-eval automated judge:

| Phase / Task | Scenario subtype 类比(§1.X.Y)| Model | $cost | Verdict |
|---|---|---|---|---|
| Sub-plan + v2 数字修订(2 commits)| §1.5.1 doc sync | controller(opus 4.7)| ~$0.20 | DONE |
| Task 0+1 baseline(registry 15/7 + scenarios + skeleton 合并 commit)| §1.1.1 Mechanical + §1.1.3 Multi-file integration | controller(opus 4.7)| ~$0.30 | DONE — 提前发现 it.each ENOENT 风险,合并 Task 0+1 避免 vitest 红 commit |
| Task 1 v2 scenarios REFACTOR(rubric 加判分锚点 + forge-specific 维度高权重)| §1.5.1 + forge-eval rubric 设计 | controller(opus 4.7)| ~$0.20 | DONE — v1 1/3 pair_pass → v2 真实 baseline RED 全 ≤ 5 |
| Task 2 SKILL.md production(476 行 / 15 section)| §1.5.1 doc sync + forge 化适配 | controller(opus 4.7)| ~$0.50 | DONE — 5 example + §2.5.6 / §2.5.5 / §2.6.6 字面 transcribe |
| Task 3 commands + md5 sync guard + apply.md cross-ref | §1.1.1 Mechanical + §1.5.1 | controller(opus 4.7)| ~$0.15 | DONE |
| Task 4 GREEN eval(forge-eval automated judge)| §1.6.X verification 类比 | forge-eval(sonnet-4-6 judge)| $0.22 | ✅ delta +8.0/+6.0/+7.0 一次性 PASS |
| Task 5 using-forge meta-entry + 红旗清单 + retrospect | §1.5.1 + retrospect | controller(opus 4.7)| ~$0.30 | DONE |
| forge-eval v1 RED baseline(scenarios v1)| forge-eval baseline 验证 | forge-eval(sonnet-4-6 judge)| $0.12 | ❌ 1/3 pair_pass → 暴露 v1 scenario 设计缺口 |
| forge-eval v2 RED baseline(scenarios v2 收紧)| forge-eval baseline 验证 | forge-eval(sonnet-4-6 judge)| $0.27 | ✅ RED 全 ≤ 5,delta ≈ 0 符合 skeleton 阶段预期 |

**Real issues caught / failed**:

| Issue | Severity | Caught by | Scenario subtype 验证 |
|---|---|---|---|
| sub-plan v1 数字错(SKILL_NAMES 起草 13→14 实际是 14→15;COMMAND_NAMES 8→9 实际 6→7)| Minor | controller 读 `src/core/templates/skills/index.ts` + `commands/index.ts` 实测对照 dev HEAD | §1.5.1 — 起草数字按 plan-9i 12→13 模型推算未考虑 plan-9d 已合;COMMAND_NAMES 误把 `commands/` 目录文件数(8)当 registry 数(6,upgrade/ack-confirm 不在 registry)|
| Task 0 单独 commit `it.each(SKILL_NAMES)` ENOENT FAIL 风险 | Important+(若不发现)| controller 预读 plan-9i Task 0 commit `92de387` + `skills.test.ts:9-18` 通用断言,实测 vitest 红状态预测 | **NEW Pattern O** — SDD Task 拆分 vs writing-skills SKILL.md 步骤 1 语义合并的张力(详 Lesson 1) |
| forge-eval v1 scenarios 太宽松(skeleton 假性 GREEN 高分;option-compare GREEN=8.0)| Important | forge-eval v1 实测 1/3 pair_pass + judge reasoning + 总览表 GREEN 列 | **NEW Pattern P** — forge-eval scenario 设计的 baseline failure rubric 不严(详 Lesson 2)|
| forge-eval v1 scenario 2 judge 误判"答非所问"扣分卡死 delta=0 | Important | forge-eval v1 报告 judge reasoning("AI 给 OAuth 技术解答属于答非所问,与 rubric 完全不匹配") | **NEW Pattern Q** — forge-eval rubric 应含"判分锚点"段防 judge 把 baseline 失败信号当 scope 错误(详 Lesson 3)|
| forge-eval v1 RED avg 6.0(vague-idea)略超 plan-9i 步骤 1 "≤ 5" 硬指标 | Minor(未立即响应,等 v2 实测才意识到)| controller 实测 v1 总览表 RED 列;plan-9i 协议未明示"任一 RED > 5 立即 REFACTOR" | **NEW Pattern R** — plan-9i SKILL.md 步骤 1 line 53 缺"任一 RED > 5 立即 REFACTOR scenarios"硬 trigger(详 Lesson 4)|
| using-forge SKILL.md / SKILL.md 加段落后 prettier 表对齐 fail | Minor | `pnpm format:check` warn 2 files(根级 + reverse-sync templates 各一) | §3.X format gate(memory `pnpm format:check` 不变量)— `prettier --write` 自动 fix |

**Lesson**(reinforce / new pattern / 协议缺口 refinement):

1. **NEW Pattern O — SDD Task 拆分 vs writing-skills SKILL.md 协议步骤 1 语义合并的张力**(plan-9f Task 0 + plan-9i Task 0 实证)
   - 实证:plan-9f sub-plan §2 Task 0 = registry 扩展 / Task 1 = scenarios + skeleton 是 SDD 颗粒度拆分,但 forge:writing-skills SKILL.md 步骤 1 line 45-56 是"先写 scenarios + 最小骨架 SKILL.md(baseline 验证)"一步语义。Task 0 单独 commit 会 `it.each(SKILL_NAMES)('exploring')` ENOENT FAIL → vitest 红 → 违反"vitest GREEN 才 commit"惯例。
   - **plan-9i 历史照见**:plan-9i Task 0 commit `92de387` 当时也独立 commit(commit log 不含 vitest 跑结果)— 可能当时未跑 vitest 单独 commit,push 时 CI 红依赖 Task 1 commit 后才 GREEN。
   - **fix 模式**(plan-9f 应用):提前发现 → Task 0+1 合并 commit(`feat(9f Task 0+1): registry 15/7 + scenarios + skeleton — baseline GREEN`)vitest 一次性 GREEN。
   - **§1.5.1 doc sync playbook 加 / writing-skills 协议落地 dispatch prompt 加**:涉及"SKILL_NAMES + skeleton md 文件创建"组合改动时,**强制 controller 提示合并 commit**(标 "Task 0 + Task 1(scenarios + skeleton)合并 commit"sub-plan task 边界微调)— 避免 vitest 红 commit。
   - **协议升级建议**:plan-9i forge:writing-skills SKILL.md 步骤 1 line 47 应字面加 "**registry 扩展 + scenarios + 最小骨架一起 commit**(vitest GREEN baseline);**单独 commit registry 会触发 `it.each` ENOENT**" 警示(留 plan-9z polish or plan-v1.1)。

2. **NEW Pattern P — forge-eval scenario 设计的 baseline failure rubric 不严**(plan-9f v1 scenarios 1/3 pair_pass 实证)
   - 实证:plan-9f v1 scenarios 三条 rubric 维度太"软"(用 ASCII / 列 2 个 assumption / 给 tradeoff / 不直接推荐)— baseline AI 在没 skill 教导时自然会做 2-3 条,得 6-8 分(option-compare skeleton GREEN=8.0,因 baseline AI 给对比表很自然)。v2 修订:**forge-specific 维度(capture offer 含具体 `forge/changes/<id>/...` 路径 + 显式 `## Exploration Summary` 段名 + "不在 explore turn 调 Write/Edit")从次要变高权重**,baseline AI 必然失分(因为不知 forge 目录结构 + 不知 capture offer 协议)→ v2 RED 全 ≤ 5。
   - **类比 Case 04 Pattern C**(post-completion patch 模式):scenario 设计第一版 + REFACTOR 第二版的 pattern,与 SKILL.md REFACTOR 一样需要迭代。
   - **fix 模式**:scenarios v1 设计完跑 baseline → 若 RED > 5 或 GREEN skeleton > 6,**立即 REFACTOR scenarios**(不是 SKILL.md)。重点提升 **forge-specific 维度**(目标 skill 真正特异的协议行为,如 `forge/changes/<id>/<path>` 路径 / 协议特有段名 / 行为约束)权重;通用维度(ASCII / list items)权重降。
   - **§1.X writing-skills 协议落地 playbook 加**:rubric 维度要含"baseline AI 必然失分"的 forge-specific 锚点 — 每个维度回答"**baseline AI 没 skill 时能否做对**":若能,降权重;若不能,升权重。
   - **协议升级建议**:plan-9i forge:writing-skills SKILL.md 步骤 1 line 45-56 应加"**rubric 设计原则**:每个维度回答'baseline AI 能否在没 skill 时做对'— 若能,降权重;若不能,升权重"(留 plan-9z polish or plan-v1.1)。

3. **NEW Pattern Q — forge-eval rubric "判分锚点"段防 judge 误判**(plan-9f v1 scenario 2 实证)
   - 实证:plan-9f v1 scenario 2 mid-implementation-stuck judge LLM(sonnet-4-6)看到 baseline AI 给 OAuth refresh token 技术解答(token 过期 / 缓存策略 / 时钟漂移),判"答非所问"扣 2 分(judge reasoning:"响应内容与评分 rubric 描述的 OAuth integration 设计探索场景完全不匹配,属于答非所问")。这正是 RED 想抓的失败信号(AI 把探索请求当技术问答),但 judge 当成 scope 错误扣分 → RED 2.0 + GREEN 2.0 + delta 0.0 卡死。
   - v2 修订:rubric 顶部加"**判分锚点**"段显式声明:"本评估**不评判 OAuth refresh token 技术答案本身的质量**。AI 直接给 OAuth 技术解答 = baseline 预期失败模式。**judge 必须按下面 rubric 维度逐项判分,严禁扣'答非所问'分**"。→ v2 GREEN 4.0 / Task 4 GREEN 7.0(delta +6.0)。
   - **fix 模式**:rubric 顶部加"判分锚点"段,明确(1)**不评估什么**(防 judge scope 误判),(2)**baseline 预期失败模式是什么**(防 judge 把失败当 scope 错误),(3)**按维度逐项判分**(防 judge 直接扣总分)。
   - **协议升级建议**:plan-9i `forge-eval-integration.md`(配套文件)加"rubric 模板"段含"判分锚点"段示例(留 plan-9z polish or plan-v1.1)。

4. **NEW Pattern R — plan-9i SKILL.md 步骤 1 缺"任一 RED > 5 立即 REFACTOR scenarios"硬 trigger**(plan-9f v1 vague-idea RED 6.0 实证)
   - 实证:plan-9f v1 RED 总览表 vague-idea 6.0(> 5),mid-implementation-stuck 2.0,option-compare 4.0。plan-9i SKILL.md 步骤 1 line 53 "RED avg ≤ 5"措辞像总览平均(避免任一 scenario 单点超),但**单 scenario RED > 5 即应该立即 trigger REFACTOR**(说明该 scenario rubric 太宽松)。我 v1 实测后看到 1/3 pair_pass 才意识到 scenarios 太松,RED avg 略超本应是更早的 trigger。
   - **fix 模式**:plan-9i forge:writing-skills SKILL.md 步骤 1 line 53 应字面加 "**若总览表任一 scenario RED avg > 5 → 立即 REFACTOR scenarios(不是 SKILL.md)**,提升 forge-specific 维度权重 / 收紧 judge rubric / 加 must_not_match / 加判分锚点段;再跑 baseline 直到所有 RED ≤ 5。"
   - **协议升级建议**:plan-9i forge:writing-skills SKILL.md 步骤 1 加此硬 trigger 字面(留 plan-9z polish or plan-v1.1)。

5. **REINFORCE Pattern A(Case 04 cross-Task scope fix)+ NEW edge — sub-plan 起草数字错的 new commit 修订模式**(plan-9f sub-plan v2 数字修订实证)
   - 实证:plan-9f sub-plan v1 起草 SKILL_NAMES 13→14 实际是 14→15(未考虑 plan-9d 已合);COMMAND_NAMES 8→9 实际 6→7(误把 `commands/` 目录文件数 8 当 registry 数 6,upgrade/ack-confirm 文件存在但不在 registry)。controller 实施第一步读 `src/core/templates/skills/index.ts` + `commands/index.ts` 实测对照后发现错。
   - **fix 模式**:**不 amend 已 commit 的 sub-plan**(沿 user memory git 安全协议 + plan-9e2 v3 修订模式)→ new commit `docs(plan-9f): v2 数字修订 — 沿 dev HEAD 真实 registry 状态`。
   - **§3.X cross-verify 加**:sub-plan 起草后,**实施第一步必读相关 registry / schema 文件实测对照 sub-plan 中的数字 / 字段** — 提前发现 staleness。若发现错,new commit 修订(non-amend)+ commit message 明示"数字订正"。

**Cost vs SDD baseline**:

- 实际:8 commits(sub-plan 2 + Task 0+1 / 1v2 / 2 / 3 / 5 retrospect)controller(opus 4.7)~$1.50 + forge-eval automated judge 3 轮(v1 + v2 + Task 4)~$0.61 ≈ **$2.10**
- SDD baseline 假设(若按 SDD 流程做 6 Task):per-Task implementer(sonnet)+ spec reviewer + quality reviewer + final reviewer + retrospect ≈ $4-5
- 节省 ratio:~50%(non-SDD trigger type 节省的是 SDD overhead 不是 model 降级 — controller 仍 opus;docs-heavy 任务 SDD 的 spec/quality reviewer 价值低,controller 单 pass 更高效)
- **质量**:8 commits + dev-direct push + 0 BLOCKER/MAJOR codex review(本会话内无 codex review;后续若需可补)+ forge-eval Task 4 一次性 PASS delta +8.0/+6.0/+7.0(3/3 pair_pass)+ verify 全 PASS(typecheck/lint/format:check/vitest 139 files / 1011 tests / +1 explore-md-sync guard)+ 4 new patterns 沉淀(O/P/Q/R)+ 1 reinforce(A)

**Followup 建议**(由 plan-9z polish 或 plan-v1.1 消化;**本次 retrospect 仅沉淀 lesson,不实施 forge 协议本身的修订**):

- plan-9i forge:writing-skills SKILL.md 步骤 1 升级:加 Pattern R 硬 trigger("任一 RED > 5 立即 REFACTOR scenarios")+ Pattern P "rubric 设计原则"段
- plan-9i `forge-eval-integration.md` 加 Pattern Q "rubric 判分锚点段"模板示例
- plan-9i SKILL.md 步骤 1 line 47 字面加 Pattern O 警示("registry 扩展 + scenarios + 最小骨架一起 commit;单独 commit registry 触发 `it.each` ENOENT")

---

### Case 08: forge-repo / Plan 9h / SDD discipline preflight + apply.md 双改 + SDD SKILL.md 子段 + forge-eval baseline

**Date**:2026-05-14
**Trigger Type**:**Type 6 — forge:writing-skills 协议(docs-heavy + forge-eval RED-GREEN automated judge 验证)**;非 SDD(沿 Case 07 同 trigger type);controller(opus 4.7)单线程执行 + per-Task sonnet implementer subagent + forge-eval automated judge(sonnet-4-6)
**Project context**:forge-repo / plan-9h SDD discipline(preflight CLI + ForgeConfig `protected_branches` schema / `commands/apply.md` 步骤 0/3.5/§"禁止行为(9h)" 三处净增 ~48 行 / `skills/subagent-driven-development/SKILL.md` §"Main Agent STOP Triggers" 子段 ~60 行 + 反向同步 + 跨文件协议加固 / `forge-eval/scenarios/subagent-driven-development.yaml` merge 进 3 新 scenario 双轨 RED+GREEN);**5 commits** 直接到 dev(Task 1-4 各 1 commit + Task 5 收尾 1 commit);plan v1 → v1.1 → v1.2 两轮 self-review 修订(codex auth 失效 fallback);forge-eval Task 4 1/3 pair_pass(critical-plan-review delta=+6.0 ✅ / stop-on-repeat-failure delta=+5.0 ❌ / branch-protection delta=+1.0 ❌)+ 2 concerns 留 plan-9z polish;累计 cost ~$3.5

**Subagent dispatch**:per-Task 1 implementer(sonnet)dispatch + controller(opus 4.7)integrate + retrospect:

| Phase / Task | Scenario subtype 类比(§1.X.Y)| Model | $cost | Verdict |
|---|---|---|---|---|
| plan v1 起草(sub-plan 5 Task)| §1.4 plan writing | controller(opus 4.7)| ~$0.40 | DONE |
| plan v1 → v1.1 self-review(NIT-1 + MINOR-1)| §1.2.3 cross-phase reviewer | controller(opus 4.7,fallback codex)| ~$0.20 | DONE — fallback 模式,2 finding 修闭环 |
| Task 1 implementer(preflight CLI + ForgeConfig schema + 6 case test) | §1.1.2 Schema + §1.1.3 Multi-file integration | sonnet implementer | ~$0.40 | DONE |
| Task 2 implementer(apply.md 双改 + md5 sync guard 测试)| §1.1.1 Mechanical + §1.5.1 doc sync | sonnet implementer | ~$0.30 | DONE — 双改字面 transcribe spec 1378-1392 |
| Task 3 implementer(SDD SKILL.md 子段 + 反向同步)| §1.5.1 doc sync + 反向加固 | sonnet implementer | ~$0.30 | DONE — cross-ref BLOCKED 第 4 项 + Fluid Pause |
| Task 4 implementer v1(独立 main-agent-stop.yaml)| forge-eval scenario 设计 | sonnet implementer | ~$0.30 | **BLOCKED** — forge-eval runner 1:1 yaml 架构不容独立 yaml |
| plan v1.1 → v1.2 修订(Task 4 BLOCKED 选项 B merge)| §1.4 plan writing | controller(opus 4.7)| ~$0.20 | DONE — 选项 A 改 runner / 选项 B merge yaml,选 B 工时小 |
| Task 4 implementer v2(merge 3 scenario 进 SDD yaml + baseline)| forge-eval scenario 实施 | sonnet implementer + forge-eval judge | ~$0.50 | **DONE_WITH_CONCERNS** — 1/3 pair_pass + 2 concerns 留 plan-9z |
| Task 5 verify + retrospect + Case 08 + master plan 链接 | §1.5.1 + retrospect | controller(opus 4.7)+ sonnet implementer | ~$0.50 | DONE |
| forge-eval Task 4 baseline(3 scenario × RED+GREEN × judge sonnet-4-6)| forge-eval baseline 验证 | forge-eval judge | ~$0.40 | 1/3 pair_pass ❌(2 concerns 暴露) |

**Real issues caught / failed**:

| Issue | Severity | Caught by | Scenario subtype 验证 |
|---|---|---|---|
| Task 4 v1 forge-eval runner 1:1 yaml 架构约束(独立 main-agent-stop.yaml 跑不起来)| Important | Task 4 v1 implementer baseline 跑 `pnpm eval:skill subagent-driven-development` 时 yaml 找不到独立文件,fallback grep runner 源码确认 1:1 期望 | **NEW Pattern U** — Task BLOCKED 修订选项 B 经验(详 Lesson 3)|
| plan v1/v1.1/v1.2 三轮 self-review 均未抓 Task 4 BLOCKER 性质问题(forge-eval 架构兼容 + 跨文件协议加固字面对齐)| Important | Task 4 真跑 baseline 后 fallback grep runner 源码 + branch-protection delta=1.0 暴露 SDD SKILL.md 字面缺 `forge preflight` cross-ref;前 3 轮 self-review 无 codex 外部视角 | **NEW Pattern S** — 同源 self-review 漏 BLOCKER 的盲点性质(详 Lesson 1)|
| branch-protection scenario delta=1.0(SDD SKILL.md 子段字面缺 `forge preflight branch-check` cross-ref + GREEN bootstrap 只 inject SDD skill 不 inject apply.md)| Important | Task 4 baseline 总览表 + judge reasoning("AI 提到 Fluid Pause 但未提 forge preflight 命令") | **NEW Pattern T** — Pattern R 严格遵守 vs pair_pass 失败的张力(详 Lesson 2)|
| stop-on-repeat-failure scenario delta=5.0(must_not_match regex `(直接\s*再派\|再试一次\|换个\s*model\s*再派)` 太宽误中 baseline AI 复述场景描述时引用"再试一次"的引用文本)| Important | Task 4 baseline judge reasoning("AI 复述场景说'你想再试一次'命中 must_not_match 但实际是引用而非决策意图")| **NEW Pattern T** 同上(must_not_match 引用 vs 行为边界)|
| forge-eval RED 全 ≤ 5(critical-plan-review=2.0 / stop-on-repeat-failure=1.0 / branch-protection=4.0)→ Pattern R(任一 RED > 5 立即 REFACTOR)不触发 | Informational | Task 4 baseline 总览表 RED 列 | **NEW Pattern T** — RED ≤ 5 不触发 Pattern R 但 pair_pass 失败 = Pattern R 严格遵守 vs pair_pass 目标的张力(详 Lesson 2)|

**Lesson**(reinforce / new pattern / 协议缺口 refinement):

1. **NEW Pattern S — 同源 self-review 漏 BLOCKER 的盲点性质**(plan-9h v1 → v1.1 → v1.2 三轮 self-review 实证)
   - 实证:plan-9h 因 codex CLI auth 失效本次 session 无外部 codex review,fallback self-review 流(implementer = reviewer = controller 均为同一 opus 4.7 session)。三轮 self-review(v1 / v1.1 / v1.2)结果 0 BLOCKER + 0 MAJOR + 1 MINOR + 1 NIT,但 Task 4 真跑 baseline 暴露 2 个 BLOCKER 性质问题(forge-eval runner 1:1 yaml 架构兼容 + 跨文件协议加固字面对齐 branch-check cross-ref)前 3 轮均未识别。
   - **Root cause**:同源 self-review 的认知盲点 — implementer 写代码时假定 A,reviewer 复审时复用同样的假定 A 不去 challenge;codex 外部 review 因为是不同 session / 不同认知路径会 challenge 假定。**self-review 的 finding 数与 review 轮数线性增长但收敛慢**(每轮新增 1-2 个 NIT/MINOR,但 BLOCKER 性质问题需要"换视角"才能识别)。
   - **fix 模式**:**codex 外部 review 是 first-choice 不是 last-resort**;codex auth 失效时应优先修复 auth(沿 `feedback_codex_auth_fallback` memory 流程)而非接受 self-review fallback。若必须 fallback self-review → 至少跑 forge-eval baseline 真测试**前**对照 forge-eval runner 源码假定(typical: `1 skill = 1 yaml` / `GREEN bootstrap 只 inject 目标 skill` 等)。
   - **§3.2 cross-verify 加 / §2.X reviewer playbook 加**:plan implementer self-review 必含 "**外部协议假定 verify**" 段 — 列出 plan 依赖的 forge-eval / git / build system 架构假定,实施第一步 grep 源码实测确认假定成立。若假定不成立 → 立即 BLOCKED + 修订 plan(沿 Pattern U 选项 B 模式)。
   - **协议升级建议**:`subagent-driven-discipline` SKILL.md §2.1 implementer prompt 加 "external protocol assumption verify" 子段(列项目实际的 forge-eval / build / vitest 1:1 约束 + dispatch 时强制 implementer 第一步 grep 实测);留 plan-9z polish 或 plan-v1.1。

2. **NEW Pattern T — Pattern R 严格遵守 vs pair_pass 失败的张力**(plan-9h Task 4 baseline 实证:RED 全 ≤ 5 但 1/3 pair_pass)
   - 实证:plan-9h Task 4 baseline 3 scenario:critical-plan-review delta=+6.0 ✅(RED=2.0 / GREEN=8.0,pair_pass);stop-on-repeat-failure delta=+5.0 ❌(RED=1.0 / GREEN=6.0,delta < 6);branch-protection delta=+1.0 ❌(RED=4.0 / GREEN=5.0,delta < 1.5)。**Pattern R 严格 trigger 是"任一 RED > 5 立即 REFACTOR"**(plan-9f Case 07 沉淀);本次 RED 全 ≤ 5 → Pattern R 不触发 REFACTOR。但 pair_pass 目标 1/3,远低于 plan-9f Case 07 的 3/3。**张力**:Pattern R 严格遵守(RED ≤ 5)≠ pair_pass 全 PASS;两个指标各自合理但**不互推**。
   - **诚实选择 vs Goodhart's law**:有诱惑改 rubric 把 RED 阈值改成"任一 RED 超 4 即 REFACTOR"或把 delta 阈值降到 1.0 凑 pair_pass — 但这是 Goodhart's law(优化指标但不优化目标)。**正确响应**:接受 1/3 pair_pass + 2 concerns 留 plan-9z;不改 Pattern R 不改 rubric 不降低验证强度。
   - **fix 模式 / 协议升级建议**:
     - plan-9i SKILL.md 步骤 1 应**区分两个指标**:Pattern R(RED > 5 trigger REFACTOR 防 baseline rubric 太软)vs pair_pass(delta ≥ 1.5 trigger 验证强度足够)。**两者独立,不互推**;**RED ≤ 5 但 pair_pass 失败时**,根因不在 rubric 软而在 SKILL.md 字面或 GREEN bootstrap 跨文件协议加固不足 → 修 SKILL.md / 修 bootstrap 不修 rubric。
     - `subagent-driven-discipline` SKILL.md §6 加 catalog row:"forge-eval pair_pass 失败 + RED ≤ 5 → 不改 rubric 改 SKILL.md / bootstrap;严禁改 rubric 凑 pair_pass(Goodhart's law)"。
     - `must_not_match` regex 应区分**引用文本 vs 决策意图行为短语** — must_not_match 锚行为短语(如 "Use Task tool with .* sonnet" / "派 sonnet 再试")不锚引用短语("再试一次" / "换个 model")避免误中复述。
   - 留 plan-9z polish / plan-v1.1。

3. **NEW Pattern U — Task BLOCKED 修订选项 B 经验(merge 进现有 yaml vs 新建独立 yaml)**(plan-9h v1.2 修订实证)
   - 实证:plan-9h Task 4 v1 字面写"新建 `forge-eval/scenarios/main-agent-stop.yaml` 3 scenario";implementer 跑 baseline 时 forge-eval runner `pnpm eval:skill <name>` 期望 1 个 skill = 1 个 yaml,独立 yaml 找不到 → BLOCKED。修订两个选项:**选项 A**:改 forge-eval runner 支持多 yaml(工时 ~1 工日 + 改 9i 协议)/ **选项 B**:merge 3 scenario 进现有 `subagent-driven-development.yaml`(工时 ~0.5 工日 + 不改协议)。**选 B**(plan v1.2 修订)。
   - **类比 plan-9e2 v3 修订模式**:plan 实施中发现 spec 假定与实际架构不符 → new commit 修订(non-amend)+ 修订选项保守(不破坏现有架构)优先。
   - **fix 模式**:Task BLOCKED 由 spec / plan 字面与实际架构假定不符引起时,**优先选项 B**(merge 进现有 artifact / 复用现有架构)而非选项 A(改架构 / 协议升级);选项 A 留后续 plan-z polish 或 plan-v1.1 时一并处理(沿 memory `project-plan9i-protocol-upgrade-followup` 模式)。
   - **§1.4 plan writing playbook 加**:plan 起草阶段对涉及外部架构假定(forge-eval runner / build script / git hooks)的 Task,**预留"修订选项 A/B"段** — 若 implementer baseline 发现假定不符,plan 修订时直接选项 B preferred,不被迫 plan-9 序列内修协议。
   - **协议升级建议**:`subagent-driven-discipline` SKILL.md §3.X plan writing playbook 加 "Task BLOCKED 修订决策树:选项 A 改架构 / 选项 B 复用现有架构 — 选 B preferred 保 plan-9 序列 atomic";留 plan-9z polish。

4. **REINFORCE Pattern Q(Case 07)+ NEW edge — forge-eval rubric 判分锚点段对 must_not_match 引用 vs 行为边界的扩展**(plan-9h stop-on-repeat-failure 实证)
   - 实证:plan-9h stop-on-repeat-failure scenario `must_not_match` regex `(直接\s*再派\|再试一次\|换个\s*model\s*再派)` 误中 baseline AI 复述场景描述时引用 "再试一次" 的引用文本(judge reasoning "AI 复述场景说'你想再试一次'命中 must_not_match 但实际是引用而非决策意图")。Case 07 Pattern Q 沉淀 "判分锚点段防 judge scope 误判";本次扩展 must_not_match 也应有 "引用 vs 行为" 边界:`must_not_match` 锚行为短语(如 "Use Task tool with .* sonnet")不锚引用短语("再试一次" / "换个 model")。
   - **fix 模式**:scenario `must_not_match` 设计时,**优先锚行为短语**(decision-intent 短语:动词 + 主语;eg. "派 sonnet" / "Use Task tool" / "git push origin")而非引用短语(场景描述中的名词短语);若必须锚引用短语,加判分锚点段显式标 "must_not_match 只针对 AI 自身决策意图,不针对 AI 复述用户场景中的引用文本"。
   - **协议升级建议**:plan-9i `forge-eval-integration.md` Pattern Q 段加 must_not_match 引用 vs 行为边界子段;`subagent-driven-discipline` SKILL.md §6 catalog 已加(本 Lesson 2 协议升级建议覆盖)。留 plan-9z polish。

**Cost vs SDD baseline**:

- 实际:4 commit(Task 1/2/3/4)+ 1 commit(Task 5 收尾)+ plan v1/v1.1/v1.2 修订 controller(opus 4.7)~$1.50 + per-Task sonnet implementer(Task 1/2/3/4 各 1)~$1.30 + forge-eval automated judge(Task 4 baseline + plan-9f 留下的 Task 4 v1+v2 共 3 轮)~$0.40 + Task 5 收尾 controller ~$0.30 ≈ **$3.50**
- SDD baseline 假设(若按 SDD 流程做 5 Task,每 Task 含 implementer + spec_reviewer + code_quality_reviewer + final_reviewer):~$5-7
- 节省 ratio:~30-40%(per-Task 单 implementer 无独立 reviewer,controller cross-verify 替代 spec/quality reviewer;codex auth 失效 → fallback self-review 进一步省 codex review cost 但**质量代价 = 2 concerns 留 plan-9z**,见 Pattern S)
- **质量**:5 commit + dev-direct push + 0 BLOCKER/MAJOR codex review(本会话 codex 不可用 fallback self-review;后续若 codex 恢复可补 final review)+ forge-eval Task 4 1/3 pair_pass(critical-plan-review ✅ / 2 ❌ 留 plan-9z polish)+ verify 通过(1 flaky timeout 非 plan-9h 回归 — plan-9g 历史 fence test `tests/cli/process-evidence-fence.test.ts > fence-9.2 minimal record-tdd`,timeout 5000ms 在并发跑时偶发 → 单独跑该 file PASS 1439ms;留 plan-9z polish)+ 3 new patterns 沉淀(S/T/U)+ 1 reinforce(Q with new edge:must_not_match 引用 vs 行为边界)

**Followup 建议**(由 plan-9z polish 或 plan-v1.1 消化;**本次 retrospect 仅沉淀 lesson,不实施 forge 协议本身的修订**):

- `subagent-driven-discipline` SKILL.md §2.1 implementer prompt 加 "external protocol assumption verify" 子段(Pattern S 协议升级)
- `subagent-driven-discipline` SKILL.md §6 catalog 加 row:"forge-eval pair_pass 失败 + RED ≤ 5 → 不改 rubric 改 SKILL.md / bootstrap"(Pattern T 协议升级)
- plan-9i SKILL.md 步骤 1 区分 Pattern R(rubric 软度)vs pair_pass(验证强度)两独立指标(Pattern T 协议升级)
- plan-9i `forge-eval-integration.md` Pattern Q 段加 must_not_match 引用 vs 行为边界子段(Lesson 4 协议升级)
- `subagent-driven-discipline` SKILL.md §3.X plan writing playbook 加 "Task BLOCKED 修订决策树:选项 A vs B"(Pattern U 协议升级)
- plan-9h Task 4 留下的 2 concerns(branch-protection SDD SKILL.md 缺 `forge preflight branch-check` cross-ref + stop-on-repeat-failure must_not_match regex 收紧)由 plan-9z polish 消化(沿 memory `project-plan9i-protocol-upgrade-followup` 模式,plan-9h 不修协议本身)

---

### Case 09: forge-repo / Plan 9z / v1.0 release(中间路线 B 模式 + Codex 外部 review + plan-9z polish 9 工作单消化)

**Date**:2026-05-14
**Trigger Type**:**Type 7 — release sub-plan(中间路线 B 模式)**;非 SDD(沿 Case 07/08 同 non-SDD trigger type);controller(opus 4.7)单线程 inline 实施 + Codex(gpt-5.4-codex)外部 review + forge-eval automated judge(sonnet-4-6)baseline 重跑
**Project context**:forge-repo / plan-9z v1.0 fusion completion release(plan-9a~9j 10 sub-plan 收尾 + plan-9z polish 9 工作单消化:Pattern O/P/Q/R + P-1/P-2 + P-5/P-6/P-7/P-8;P-3 fence-9.2 flaky + P-9 git utils 抽出延 plan-v1.1)。**8 commit chain** 直接到 dev(Task 0 sub-plan doc / Task 1 release-gate § v1.0 / Task 2 CHANGELOG [1.0.0] / Task 4 polish A 组 / Task 5 字面 / Task 5 baseline / Task 6 version bump + master DONE / Task 6 codex review fix);**git tag v1.0.0** pushed origin;**npm publish** 用户授权 manual trigger(本 session 不自动);plan-9h Task 4 DONE_WITH_CONCERNS 2 concerns(P-1/P-2)经 plan-9z baseline 重跑 pair_pass=true 完整消化;累计 cost ~$2.0(controller opus 4.7 + Codex review + forge-eval baseline)

**Subagent dispatch**:全 inline,无 implementer dispatch(中间路线 B 决策);仅 Codex 外部 review + forge-eval automated judge:

| Phase / Task | Scenario subtype 类比(§1.X.Y)| Model | $cost | Verdict |
|---|---|---|---|---|
| brainstorm Q1-Q7 决策(中间路线 B / 选项 A v1.0.0 / P-3+P-9 延 v1.1 / publish 用户授权)| §1.4 plan writing inline | controller(opus 4.7)| ~$0.10 | DONE — 7 决策点用户授权一次性确定 |
| Task 0 sub-plan v1 起草(883 行)| §1.4 plan writing | controller(opus 4.7)inline | ~$0.20 | DONE — self-review 修 2 处不一致 |
| Task 1 release-gate § v1.0 段(7 子段 +76 行) | §1.5.1 doc sync inline | controller(opus 4.7)inline | ~$0.10 | DONE — 沿 §4 v0.4 模板 |
| Task 2 CHANGELOG [1.0.0] 段(+92 行,10 sub-plan 概要)| §1.5.1 doc sync inline | controller(opus 4.7)inline | ~$0.15 | DONE — 续 v0.4 编号 37-46 |
| Task 3 init.ts:38 文本(B-7)| §1.1.1 mechanical | (无 commit;plan-9g commit `7d36c2b` 顺手做)| $0 | DONE — Pattern Y 实证 cross-cutting 状态未回写 master §3.11 |
| Task 4 polish A 组(7 子段 +125 行 / 4 files)| §1.5.1 doc sync inline | controller(opus 4.7)inline | ~$0.20 | DONE — 全 5 verify 通过 |
| Task 5 字面 P-1 + P-2(3 files +32 行)| §1.5.1 doc sync + §1.1.1 mechanical | controller(opus 4.7)inline | ~$0.15 | DONE — prettier 自动 reformat table |
| Task 5 baseline 重跑(forge-eval pnpm eval:skill)| forge-eval baseline 验证 | forge-eval judge(sonnet-4-6) | ~$0.47 | DONE — plan-9z scope 3 scenario pair_pass=true;预存 3 scenario pair_pass=false(Pattern Z 实证 baseline cover 漏抓) |
| Task 6 全 5 verify + version bump + master plan DONE | §1.5.1 doc sync + §1.1.1 mechanical | controller(opus 4.7)inline | ~$0.20 | DONE — typecheck/lint/format:check 0 error + vitest 1018 pass / 25.62s + P-3 fence-9.2 三次未复现 |
| Task 6 Codex review release docs(CHANGELOG / release-gate-checklist / master §3.11+§6)| §1.2.X external review(Codex CLI subprocess)| Codex gpt-5.4-codex | ~$0.30 | DONE — 8 finding(4 字面错 + 3 不一致 + 1 漏项);7 采纳 + 1 留 plan-v2(Pattern V 实证 + Pattern S REINFORCE) |
| Task 6 Codex review fix(7 finding 全采纳)| §1.5.1 doc sync inline | controller(opus 4.7)inline | ~$0.10 | DONE — 3 files +9/-9 行 |
| Task 6 git tag v1.0.0 + push origin | §1.1.1 mechanical | controller(opus 4.7)inline | $0 | DONE — annotated tag with v1.0 release notes |

**Real issues caught / failed**:

| Issue | Severity | Caught by | Scenario subtype 验证 |
|---|---|---|---|
| Codex review 8 finding(4 字面错 + 3 不一致 + 1 漏项)— plan v1 起草时就 stale 的路径错 / 文件名 stale / 不变量计数 stale / 修订记录漏 commit SHA | Important | Codex review release docs(plan v1 起草 + 8 commit 实施期同源 self-review 均未抓)| **NEW Pattern V** — 中间路线 B 模式必须配 Codex 外部 review 兜底字面错(REINFORCE Pattern S 实证)|
| 预存 3 scenario(force-dispatch-subagent / review-subagent-output / not-merge-without-test)pair_pass=false(RED 7.5/9.0 > 5;Pattern R 严格 trigger 应 REFACTOR rubric)| Important | Task 5 baseline 重跑总览表(plan-9h Task 4 commit `b5fb981` 漏抓 — 只验证新增 3 scenario)| **REINFORCE Pattern T**(Goodhart's law)+ **REINFORCE Pattern Q new edge**(forge-eval baseline 应 cover 全 yaml scenarios 而非仅新增 — 与 Pattern Q rubric 设计盲点同源)|
| plan-9z sub-plan v1 字面错 4 项 cross-file 路径(`.claude/skills/writing-skills/`实际无 prefix / `main-agent-stop.yaml` 实际 merge 进 SDD yaml / `subagent-driven-discipline/SKILL.md` §"STOP Triggers" 实际段在 `subagent-driven-development/SKILL.md`)| Important | 实施期 grep 真实路径时发现(Task 4 / Task 5 第一步 read 真实文件位置) | **REINFORCE Pattern S** — plan v1 起草时同源审查盲点;Codex review 也兜底找到这些 |
| master plan §3.11 line 410 描述 stale("init.ts:38 v0.4 → v1.2 改动")— 实际已 plan-9g commit `7d36c2b` Step 5.5 顺手完成(2026-05-13),master plan 起草于 2026-05-10 未回写 | Informational | Task 3 实施第一步 grep init.ts:38 字面发现已是 "v1.2" | **REINFORCE Pattern S/T 同源** — cross-cutting 改动状态未回写 master plan(plan-v2 reorganize 时机)|
| plan-9z §2 字面"6 子段(代码/测验证/端测/兼容/文档/npm/plugin)" vs release-gate §5 实际 7 子段(plan-9z Task 1 起草时扩 §5.7 polish verify) | Minor | Codex review B2 finding(B2 留 plan-v2,plan v1 字面 stale 但产物准确)| Informational — plan-9z 决策 B2 不修(不阻塞 release;留 plan-v2 sub-plan)|

**Lesson**(reinforce / new pattern / 协议缺口 refinement):

1. **NEW Pattern V — 中间路线 B 模式(sub-plan doc + inline + 跳 implementer dispatch)适用 docs-heavy + 已知路径 + 风险低 sub-plan**(plan-9z release 实证)
   - 实证:plan-9z 8 commit 全 inline 实施(brainstorm + sub-plan doc + 5 Task + Task 6 verify+publish 准备),无 implementer dispatch,无 spec/quality reviewer round。实际 P50 1.3d / cost $2.0;完整 SDD 模式估时 P50 2-2.5d / cost $5-7。**节省 35-47% 工日 + cost**。
   - **Tradeoff 验证**:docs-heavy + 已知路径 + 风险低 ✅ inline 完全可行;但 Codex review 暴露 8 finding(7 项 plan v1 起草时就 stale,1 项 A1 真实 release 阻断 occurrence 占位符)— **dispatching 5-7 implementer 也不能挡这些**,因为同源审查盲点(implementer 复用 plan 字面假定);**Codex 外部 review 才能挡** — Pattern S REINFORCE 实证。
   - **fix 模式**:中间路线 B 模式的**强制配置**:(1)sub-plan doc 留 audit trail(brainstorm Q1-Q7 决策固化)/(2)Codex 外部 review **必跑**(release docs / 关键协议 sub-plan)而非可选 — 否则同源审查盲点 +ε accumulation 会让 release 字面错积累;(3)实施第一步 grep 真实路径 verify plan 字面假定(Pattern S §2.1.1 external protocol assumption verify 协议落地后 controller 也要跟);(4)task 切分纪律保留(本 plan 7 Task + 1 follow-up,清晰分阶段);(5)只用于 docs-heavy + 已知路径 + 风险低 sub-plan,**不用于代码 heavy / 设计探索 / 跨子系统集成** sub-plan。
   - **协议升级建议**:`subagent-driven-discipline` SKILL.md §3.X 加 "Trigger Type 7 — Release sub-plan / Polish sub-plan 中间路线 B 模式" 子段;留 plan-v2 reorganize 阶段(本 case 09 已记录 pattern,后续 plan 引用即可)。

2. **NEW Pattern W — release docs codex review 累计修订记录整合**(plan-9z CHANGELOG [1.0.0] §"Fixed — codex 累计 5+ 轮 review 修订" 段实证)
   - 实证:plan-9z CHANGELOG [1.0.0] 段统一汇总 10 sub-plan(plan-9a~9j)累计 5+ 轮 codex review 200+ 条 finding 修订记录(每 sub-plan vN→vN+1 一行,沿 plan-9j v9 / plan-9g v8 等格式)。避免每 sub-plan 单独 release 时各自的修订历史散落在 10 个 CHANGELOG entry,reader 需翻 10 个段才能 reconstruct fusion completion 完整修订链。
   - **fix 模式**:Master-level release(本例 v1.0 fusion completion;类比 v0.5 / v2.0 等"主题 release")的 CHANGELOG 段应:(1)主题概要(本例 "v1.0 标志 forge fusion 真正达成产品定位")/(2)逐 sub-plan 概要(本例 10 sub-plan 编号 37-46)/(3)`### Fixed — codex 累计 N 轮 review 修订` 段汇总各 sub-plan 修订链(plan-9a v1→v4 / plan-9j v1→v9 等)/(4)`### Acknowledgments` 段链接完整 spec + master plan + sub-plan 链。
   - **协议升级建议**:无 protocol 修订(本 pattern 是 release docs 写作习惯,落在 plan-9z Task 2 CHANGELOG 实施时一并应用);案例参考。

3. **REINFORCE Pattern S(Case 08)— 中间路线 B 模式 + Codex review 兜底强化**(plan-9z 8 commit + Codex review 7 finding 实证)
   - 实证:plan-9z 全程 inline 实施(无 spec reviewer / quality reviewer dispatch),controller 自己 self-review 跑 verify;但 Codex review 找到 7 finding 全采纳(其中 A1 占位符未填是真实 release 阻断;A2-A4 + B3 是 plan v1 起草时就 stale 的路径错;B1 是 plan-9g v6 修订 13→14 不变量回写漏;C1 是修订记录漏 commit SHA)。**8 commit 实施期同源 self-review 一项都没抓**(每个 Task 我跑 verify 都过,format:check 也过,但路径错 prettier 不报)。
   - **Root cause 同 Case 08 Pattern S**:同源认知盲点 — 我写 sub-plan v1 时假定 `.claude/skills/writing-skills/` 路径(写 sub-plan 时没 grep verify),后续 Task 4 实施时第一步 grep 才发现 prefix 错(但已经在 sub-plan v1 字面错了 — 不去回头改 sub-plan,改 commit 时用真实路径)。Codex 不复用我的假定,从外部视角看 plan v1 字面 vs Task 4 commit 字面不一致 → 直接抓 Pattern X 4 项。
   - **fix 模式**:**中间路线 B 模式 + Codex review 必跑** = 同源审查盲点的兜底保险;否则 release 会带着 plan v1 字面错入 npm registry。Codex review cost ~$0.30 比修复 release 后字面错的 reputational cost 低 100x。
   - **协议升级建议**:`subagent-driven-discipline` SKILL.md §2.1 implementer prompt 加 "**external protocol assumption verify**" 子段(已在 plan-9z Task 4 P-5 落地);中间路线 B 模式 sub-plan 加 mandatory "Step 6.7 Codex review release docs"(plan-9z 已实证,留 plan-v2 模板化)。

4. **REINFORCE Pattern T(Case 08)+ NEW edge — forge-eval baseline 全 scenarios cover 漏抓 + 预存 scenario pair_pass=false 不阻塞 release**(plan-9z Task 5 baseline 实证)
   - 实证:plan-9z Task 5 baseline 重跑暴露预存 3 scenario(force-dispatch-subagent RED 0.0/GREEN 0.5 delta 0.5 / review-subagent-output RED 7.5/GREEN 6.0 delta -1.5 / not-merge-without-test RED 9.0/GREEN 10.0 delta 1.0)pair_pass=false。其中 RED 7.5 + RED 9.0 严格 trigger Pattern R(任一 RED > 5 立即 REFACTOR rubric)但 plan-9z **不改 rubric 凑 pair_pass**(沿 Pattern T Goodhart's law 防御)— 决策延 plan-v1.1 独立 sub-plan 修(改 SKILL.md / 改 rubric / 加 scenarios 行为锚)。
   - **Root cause**:plan-9h Task 4 commit `b5fb981` 实施时 implementer 只跑新增 3 scenario(branch-protection / critical-plan-review / stop-on-repeat-failure)baseline,**没跑预存 3 scenario**;预存 scenarios 在 SDD yaml 初始 commit `13d02ac` 落地时也没跑过 pair_pass 验证(commit message 没提验证结果)。**forge-eval baseline 默认全 yaml 跑,但 plan implementer 只看自己新增 scenario 的输出**。
   - **fix 模式**:forge-eval baseline 实施时,**全 scenario 状态都看**(总览表 + 失败详情段都读),不只看自己新增 scenario;若预存 scenario 失败,决策(a)修预存 scenario(若与本 sub-plan scope 相关)/(b)延后续 sub-plan(若与本 sub-plan scope 无关 — plan-9z 决策路径)+ release-gate 加 known-issue 段不阻塞 release。
   - **协议升级建议**:plan-9i `forge-eval-integration.md` 加 "baseline cover 全 scenarios" 段(implementer 跑 baseline 后必须扫总览表所有 row,不只 focus 自己新增);留 plan-v1.1 协议升级 sub-plan。

5. **REINFORCE Pattern Q new edge(Case 07/08)— must_not_match 边界协议落地实证**(plan-9z Task 5 P-2 实证 + 协议 P-7 落地)
   - 实证:plan-9z Task 5 P-2 落地把 `stop-on-repeat-failure` scenario must_not_match 从引用短语锚 `(直接\s*再派|再试一次|换个\s*model\s*再派)` 收紧为行为锚 `Use Task tool with .*sonnet` + `(?:好的|那就|可以).{0,20}(再派|再试)`;judge_rubric 判分锚点段补显式声明 "**must_not_match 不针对 AI 复述用户原话场景**"。baseline 重跑 delta 5.0 → 6.0 + pair_pass=true(plan-9h Task 4 delta=5.0 但 must_not_match 误中假性 RED → plan-9z P-2 消化后 delta=6.0 真 pair_pass)。
   - **协议落地**:plan-9z Task 4 同步在 `skills/writing-skills/forge-eval-integration.md` Pattern Q 段下加 "### 3.2 P-7 — must_not_match 引用 vs 行为边界" 子段(含 yaml 收紧模板),Pattern Q new edge 协议化完成。
   - **fix 模式**:**已落 plan-9z polish A 组 Task 4 + B 组 Task 5,本 case 09 仅记录实证**;后续 sub-plan 设计 must_not_match 时直接读 `forge-eval-integration.md` §3.2 模板。

**Cost vs SDD baseline**:

- 实际:8 commit chain controller(opus 4.7)~$1.20 + Codex review(gpt-5.4-codex)~$0.30 + forge-eval Task 5 baseline ~$0.47 + plan-9z 起草 brainstorm + writing-plans inline ~$0.10 ≈ **$2.0**
- SDD baseline 假设(若按 SDD 流程做 7 Task,每 Task 含 implementer + spec_reviewer + code_quality_reviewer):~$5-7
- 节省 ratio:~50-70%(per-Task 跳过 implementer dispatch + 跳过 spec/quality reviewer,仅保留 Codex 外部 review;docs-heavy 任务 SDD 的 spec/quality reviewer 价值低,Codex 外部 review 高价值)
- **质量**:8 commit + dev-direct push + v1.0.0 git tag + npm publish 待用户授权 + Codex review 7 finding 全采纳 + forge-eval Task 5 baseline 3/3 plan-9z scope pair_pass=true(plan-9h Task 4 2 concerns 完整消化)+ verify 全 PASS(typecheck/lint/format:check/vitest 1018 tests / 25.62s)+ 2 new patterns 沉淀(V/W)+ 3 reinforce(S new edge / T new edge / Q new edge 落地)

**Followup 建议**(由 plan-v1.1 或 plan-v2 消化;**本次 retrospect 仅沉淀 lesson + 标 release v1.0.0 完成**):

- plan-v1.1 scope:P-3 fence-9.2 flaky timeout fix(性质本征 flaky,需 timing buffer 或 hash-only fast path)+ P-9 git utils 抽出(若 2+ 复用点)+ 预存 3 forge-eval scenario refactor(force-dispatch-subagent SKILL.md 改 / review-subagent-output rubric 收紧 / not-merge-without-test scenario 行为锚 + judge_rubric 判分锚点段)
- plan-v2 协议升级(若 forge fusion 进入 v2.0 reorganize 阶段):`subagent-driven-discipline` SKILL.md §3.X 加 "Trigger Type 7 — Release sub-plan / Polish sub-plan 中间路线 B 模式" 子段(Pattern V 协议化)+ plan-9i `forge-eval-integration.md` 加 "baseline cover 全 scenarios" 段(Pattern Q new edge 协议化)+ `skills/writing-skills/SKILL.md` Pattern X 候选 5 项消化(path stale / cross-cutting 状态回写 / file structure 一致性)
- npm publish 用户授权 manual trigger(本 session 完成 git tag + dry-run 准备;实际 publish 由用户 `pnpm publish --publish-branch dev` 或切 master 分支后跑)

---

### Case 10: forge-repo / plan-stage-extensions / Task 5 — runner CLI 子命令(run + analyze-trend)

**Date**:2026-05-15
**Trigger Type**:Type 1(3-stage full retrospect)
**Project context**:TS/Node monorepo(opsp/forge-repo),plan-stage-extensions Task 5 落 `src/cli/commands/stage-extensions.ts`(v7 单轮执行器:spawn codex + watch + parse + judge + retry,2 子命令 `run` + `analyze-trend`,结构化 JSON 输出,loose exit 0)+ `src/cli/index.ts` 注册 + `tests/cli/stage-extensions.test.ts` integration scenario。plan v10 经 9 轮 Codex 对抗性 review 收敛 + v10 C 方案修订(parseCodexOutput markdown 解析)。

**Subagent dispatch**:
| Subagent | Scenario subtype(§1.X.Y)| Model | $cost | Verdict |
|---|---|---|---|---|
| Task 5 implementer(3 rounds:初版 + round-2 spec fix + round-3 quality fix)| §1.1.3 Multi-file integration | sonnet | ~$0.80 | DONE → DONE → DONE |
| spec_reviewer(2 rounds)| §1.2.4 acceptance criteria | sonnet | ~$0.30 | ❌ 3 issues → ✅ |
| code_quality_reviewer(2 rounds)| §1.3.4 runtime correctness | sonnet | ~$0.50 | ❌ 1C/3I/3M → ✅ Ready to merge |
| M-4 inline fix | direct | controller(opus 4.7)| ~$0.05 | terminateRound 步骤注释编号顺延(cosmetic)|
| Retrospect(本次)| Type 1 mandatory | controller(opus 4.7)| ~$0.40 | Q1/Q2/Q3/Q4 YES → add Case 10 + §6 1 row |

**Real issues caught / failed**:
| Issue | Severity | Caught by | Scenario subtype 验证 |
|---|---|---|---|
| **C-1 parseCodexOutput markdown parser `\Z` 锚 —— JS 正则无 `\Z`(是字面字符 Z),`## Verdict` 末段后无 `^##` → `verdictMatch` 恒 null → adversarial mode 所有 markdown 输出永远 `failed`** | **Critical(adversarial 模式全量 breakage)**| code_quality reviewer round-1 + controller `node -e` 实测 repro | **NEW Pattern AA + NEW edge** — implementer 自写正则含 cross-language false-cognate 锚 + 该路径零测试覆盖 |
| finding 拆分正则 `m`-flag `$` 截断 body(Location/Confidence/Body/Recommendation 全丢)| Critical(C-1 修复时 TDD markdown 测试一并暴露)| round-3 新加的 markdown 测试(MD-1)| §1.3.4 — 同 C-1,implementer 自写正则 + 零覆盖 |
| R-6 thread-id 透传循环断言 / F-8 漏 mtime 残留旧文件分支 / T-1 缺 cancelCodexJob reject case | Important×3 | spec_reviewer round-1 | §1.2.4 — 测试不验真实行为(stub 硬编码回写值 / 只覆盖 existsSync 分支 / 三 case 缺一)|
| **M-1 `runOneRound` 硬编码 `changeId:''` → `${CHANGE_ID}` 替换变量在 `entry.command` 静默失效** | **reviewer 标 Minor / controller cross-verify 升 Important** | code_quality reviewer + controller 读码核实 §7 + docstring 明列 `${CHANGE_ID}` | §3.2 — reviewer 严重度低估(Case 05 Pattern J 的 reverse:不是低估为 Important,是低估为 Minor)|
| I-1 `substituteVars` 无 shell 转义,`shell:true` spawn 注入面(threadId 来自 codex 输出非完全受控)| Important | code_quality reviewer round-1 | §1.3.4 — 与项目 `codex-review-helper.mjs` 既有转义实践不一致 |

**Lesson**(reinforce / new pattern / 边界 refinement):

1. **NEW Pattern AA — plan 增量修订加功能但漏加 test scenario → 该功能代码路径零覆盖,bug 穿透 implementer 自检 + spec review,只 code_quality runtime review 兜底**
   - 实证:plan v10 在 9 轮 Codex review 收敛**之后**才追加 §7 Step 5.2ter(parseCodexOutput markdown C 方案);但 §7 Step 5.3 的 19 个 integration scenario 是 v10 之前定稿的,stub 全输出 JSON,**没有一个 scenario 覆盖 markdown 路径**。implementer 自写的 `parseMarkdownOutput`(plan 只给了格式说明,没给正则)含 C-1 `\Z` 全量 breakage bug —— 因为零测试覆盖,implementer 自检(19 测试全过)+ spec compliance review 都漏掉,只有 §1.3.4 code_quality runtime-correctness review 读码 + 实测兜底抓到。
   - **与 §6 catalog "Plan inline code 含 latent bug" 行区别**:那行是 plan **给了** inline code 但 code 自带 bug;Pattern AA 是 plan **新增功能但漏给对应 test scenario**,implementer 自写实现 + 该路径无任何回归网。
   - **fix 模式 / 协议升级**:
     - **controller dispatch 前**:plan 经多轮 review 后若有**增量修订加功能**(vN → vN+1 加 Step / 加 helper),controller 必检查「每个新增代码路径是否有对应 test scenario」;若无 → dispatch prompt 显式要求 implementer 为该路径补测试(不被 plan 的固定 scenario 计数束缚 —— 计数交 test inventory 统一 Task 校准)。
     - **implementer prompt 加**:对 implementer **自写**(非 plan-inline 给定)的解析器 / 正则 / 状态机,self-review checklist 加项「我自写的 X 是否有专门测试?plan 的固定 scenario 是否覆盖了它?若否,补测试」。
     - **§6 catalog 加 row**(见下)。

2. **NEW edge(并入 Pattern AA)— implementer 自写正则含 cross-language false-cognate 锚**
   - 实证:sonnet implementer 写 `parseMarkdownOutput` 用了 `\Z`(Python/Perl 的字符串末尾锚)—— JS 正则**没有 `\Z`**,`\Z` 在 JS 里是字面字符 `Z`。另加 `m`-flag 下 `$` 匹配每行尾导致 finding body 非贪婪截断。两个 bug 都是「在 A 语言成立、B 语言不成立」的 false-cognate。
   - **fix 模式**:涉及 implementer 自写正则(尤其跨语言背景的 model)→ code_quality reviewer 必**实测 repro**(`node -e` 跑真实输入)而非读码判断;TDD 顺序补测试驱动修(round-3 即用此法,markdown 测试 RED→修 parser→GREEN,且一举暴露第二个 `$` 截断 bug)。

3. **REINFORCE — §1.3.4 Sonnet code_quality runtime-correctness review 是唯一防线(Case 01-05 累计第 6 次)**
   - C-1 这种「整条代码路径全量 breakage」既不被 implementer 自检发现(零覆盖)、也不被 spec compliance review 发现(spec review 比对「实现 vs spec 字面」,不读运行时行为)—— 只有 §1.3.4 code_quality 读码 + adversarial 实测兜底。**再次实证 §1.3.4 MANDATORY Sonnet 不可降级、不可 skip**。

4. **REINFORCE — Case 05 Pattern J 的 reverse:reviewer 严重度低估,controller cross-verify 升级**
   - Case 05 Pattern J 是 reviewer 标 Important、controller 实测升 Critical;本次是 code_quality reviewer 把 M-1(`${CHANGE_ID}` 替换变量静默失效)标 **Minor**,controller 读 §7 + substituteVars docstring 核实「`${CHANGE_ID}` 是文档化的替换变量」→ 升 **Important**。
   - **强化 §3.2**:reviewer 的严重度评级双向都要 cross-verify —— 不仅「Important 含 system-wide 关键词 → 可能该升 Critical」,也包括「Minor 实为文档化功能静默失效 → 该升 Important」。判据:**该问题是否让一个文档化/spec 化的功能静默产出错误结果**;是 → 至少 Important。

**Cost vs all-Opus alternative**:
- 实际:implementer 3 rounds(sonnet ~$0.80)+ spec_reviewer 2 rounds(sonnet ~$0.30)+ code_quality_reviewer 2 rounds(sonnet ~$0.50)+ M-4 inline(opus ~$0.05)+ retrospect(opus ~$0.40)≈ **$2.05**
- 全 Opus 假设:implementer 3 + reviewer 4 + inline + retrospect ≈ **~$9**
- 节省 ratio:~77%
- **质量**:4 commits(`4c59eef` + `e684b21` + `99caaeb` + `76855fd`)全 commit 落 `docs/plan-stage-extensions-framework` 分支;Task 5 测试 19 → 21 scenario(新增 MD-1/MD-2 markdown 覆盖);全 suite 1090 passed / 0 fail / 无回归;typecheck/lint/format:check 全绿;3-stage SDD 全 ✅(spec compliant + code_quality Ready to merge)。

**Followup 建议**(留 plan-stage-extensions Task 7「测试 inventory 统一」消化):
- Task 5 测试由 plan §7「19 scenario」→ 实际 21(加 MD-1/MD-2)。Task 7 校准 plan §2/§7/Test plan 的「19」字面引用 + 总测试计数。

---

## §6 Pattern Catalog(failure mode → scenario subtype + recovery)

| Subagent failure mode | Root cause(scenario subtype 误配)| Prevention | Recovery |
|---|---|---|---|
| **cross-cutting 状态回写漏(implementer 改 file:line / 不变量 / DoD / version / release gate 但 master plan / spec / 上游 sub-plan 引用 stale;see §5 Case 09 §1273 + plan-v1.1 Task 0 §14 v3.1/v3.2 self-aware 连续两次实证)** | implementer prompt 缺 cross-cutting hook;controller dispatch 未列引用方文件;plan writer 眼测不 grep | §2.1.2 cross-cutting 回写 hook(plan-v1.1 Task 5 落地)— implementer prompt + self-review checklist 加 grep 全 plan list verify;controller dispatch prompt 列引用方文件 | grep `<old-value>` 全 plan 验 = 0 + 同 commit 回写至新值;sub-plan retrospect 段记录 Codex review catch 案例(plan-v1.1 §14 v3.1/v3.2/v3.3 实证) |
| over-cost(默认继承 Opus) | §1 model 选择缺 / 全 Opus 默认 | §1 显式 model + dispatch 时传 `model:` 参数 | 无(commit 已发生 cost) |
| spec_reviewer scope-bleed | §1.2.3 cross-phase 任务用 Haiku | §1.2.3 升 Sonnet OR §2.2 phase boundary 段 | controller override verdict |
| 幻觉 URL / pytest count | §1.2.x reviewer 任务无 §2.6 三条 | §2.2 pre-verified data + enumerated list | §3.2 cross-verify 命令 |
| worktree-scope leak | §3.1 STRICT cwd 写 prompt 但被跳过 | §3.1 + §3.2 branch verify | §4.1 cherry-pick recovery |
| 自我汇报幻觉 | subagent 输出 trust 过度 | §3.2 cross-verify 必跑 | §3.2 5 类 verify 命令 |
| 静态 review 漏 runtime correctness | §1.3.4 误用 Haiku 替代 Sonnet | §1.3.4 MANDATORY Sonnet | controller catches downstream / Sonnet code_quality 必跑 |
| Plan inline code 含 latent bug,Mechanical implementer 照搬不抓(see §5 Case 01)| §1.1.1 Mechanical 假设 plan 可信;Plan 上一阶段既存 bug 搬运 / Plan 自身 review 不彻底 | §1.3.4 Sonnet code_quality 兜底(MANDATORY)+ §2.1 implementer escape valve("觉得 plan code 有 bug → 标 observation") | Sonnet code_quality 抓到后 controller inline fix 修复 |
| Implementer self-review stack-mismatch(Python 模板套 TS 漏 format/lint;see §5 Case 01)| §2.1 playbook checklist 写 generic Python 命令 | §2.1 stack-specific 命令清单(TS/Node:`pnpm format:check + lint + build`;Python:`ruff + mypy + pytest`;Rust:`cargo fmt + clippy + test`)| chore commit 自动修(单 commit 修 N 文件) |
| Reviewer Critical claim 越权(假设最坏 / 偏离 plan 决策表) | code_quality reviewer 不持 plan 上下文,reasoning code 时倾向最坏假设 | §3.2 controller cross-verify reviewer Critical claim → 对照 plan 决策表独立核(see §5 Case 01 Lesson 3)| controller 独立核后拒绝 / 部分采纳;只接受不偏离 plan 的 inline fix |
| **Prettier(或同类 formatter)normalize 破坏 binary / 行尾敏感 fixture(see §5 Case 02 Pattern A)** | `.prettierignore` 缺 fixture 路径排除;`.gitattributes` 不阻止 formatter 处理(formatter 按 file extension 判断,.md 默认进 prettier) | `.prettierignore` 显式加 fixture 目录(`tests/fixtures/<scope>/`);chore commit 单独提;dispatch implementer prompt 加注 "若跑 pnpm format 后 fixture 字节变化 → 走 .prettierignore" | `git restore <fixture>` 还原 + `.prettierignore` 加排除 + chore commit;controller cross-verify `xxd <fixture>` 确认字节符合预期 |
| **Implementer 测试断言 silent 降级(`>0` 改 `>=0` 永真;see §5 Case 02 Pattern B)** | fixture/环境不符 plan 假设时 implementer 优先降级 assertion 让测试通过,而非 BLOCKED 报告;§2.1 prompt "When Stuck" 缺测试断言降级 = BLOCKED 的明确约束 | §2.1 implementer prompt "When Stuck" 段强化:**测试 assertion 降级 = BLOCKED 状态**,不可静默接受;Self-review checklist 加"是否有 assertion 从 plan 原样改为永真断言?有 → BLOCKED" | controller cross-verify implementer self-review 报告中的 Observation;若发现 `>=0` / `not.toThrow()` 永真断言 → inline fix 改回真断言 + 加 fixture/parameter 让真命中 |
| **`spec-reviewer` 路径 hallucinate(假设根目录 vs 子目录路径;see §5 Case 02 Pattern C)** | §1.2.1 string matching reviewer 在多目录 / scoped fixture 时假设默认根;Pre-verified Data 段未显式标完整路径让 reviewer 推 | §2.2 spec-reviewer prompt:涉及子目录 fixture 时,Pre-verified Data 段显式标完整路径(`tests/fixtures/<scope>/<file>`),不要让 reviewer 自己推 | controller cross-verify reviewer 引用的路径(实际 `cat <path>` 看是否真不存在);若是 reviewer 错路径,override verdict 标 false positive |
| **Plan inline 跨 build/runtime 边界(rootDir / outDir / package boundary)— controller pre-dispatch signature check 漏(see §5 Case 03 Pattern D)**| controller 只 grep export + signature,**未读 tsconfig.json `rootDir/include/exclude` 看 import path 是否跨边界**;此类 latent bug typecheck 立刻抓但不在 controller 视野 | §1.1.3 Multi-file integration dispatch 前 mandatory step:**read tsconfig.json + 检查 plan inline import path 是否跨 rootDir(典型征兆:含 `../../../` + 跨包名)** → 跨边界 → 标 NEEDS_REWRITE 给 implementer dynamic import workaround 或调 build 配置 | Sonnet implementer 自修(dynamic import + new URL workaround;但留 prod build 风险 — see Pattern E) |
| **CLI flag/option 死代码(option declared 但 action 不引用 → silent no-op;see §5 Case 03 Pattern F)**| §1.2.x spec_reviewer 只看 imports + signature + commit,未 grep flag 在 action 内引用次数 | controller pre-dispatch 跑 `grep -c "opts\\.<flagName>" <action-file>` 给 spec-reviewer;§1.2.4 acceptance reviewer 加"flag 实际被 action 引用"verify 项 | code_quality reviewer 兜底抓到;round 2 implementer 实现 flag 的真实逻辑 |
| **Spike workaround 留 prod build 风险(dynamic import / `as unknown as` / `// @ts-ignore` / `/* @vite-ignore */` 解 typecheck 但不解 runtime;see §5 Case 03 Pattern E)**| 短期 unblock 但 dist/ build 不含跨包源 → ERR_MODULE_NOT_FOUND / runtime type error | Phase final reviewer **必扫**所有 escape hatch(grep `as unknown as / @ts-ignore / @vite-ignore / await import\\(`)→ PR description 必标 "release 前 follow-up: <issue>";不阻塞 PR merge 但记入 Phase F gate | Phase F release 前修(迁移到 src/ 内 / 改 build script 复制 / 改正式 env 加载) |
| **下游 Task implementer 兜底跨 Task scope 修上游 Task plan 字面要求但 inline 缺实现的 latent gap(see §5 Case 04 Pattern A)**| 上游 Task plan 字面要求某 helper / 行为(eg. "confirm 后 marker 字段写回"),但 plan inline code 块缺该 helper 完整代码;上游 spec/code_quality reviewer 只对照"已 implemented 字面"无法发现 gap;下游 Task 真集成 e2e 时才暴露 | dispatch implementer prompt 强化 escape valve 第二条:"若 plan 字面要求 X 但 inline 缺该实现,implementer self-review 段标 observation,不擅自加。若后续 Task 集成必依赖,**explicit BLOCKED + escalate** 让 controller 决定派 emergent fix 还是退回 plan 修订"。Plan reviewer 在 plan 评审阶段加"plan 字面 vs inline 一致性"扫描 — 字面要求项必有 inline code | Controller 接受 emergent fix(commit message 透明记录"X Task 发现 Y Task 实现缺口"),或退回 plan 修订重跑上游 Task。**preferred**: e2e 测试设计成发现 plan inline gap 的 ground truth |
| **implementer 改顶层 file 漏 sync build script auto-copy 副本(see §5 Case 04 Pattern B)**| 项目含 build script 自动 copy 顶层 file 到 generated/templates 目录(`scripts/copy-templates.mjs` 类);implementer 改顶层但漏 add 副本;`pnpm build` 后 working tree modified 但未 commit | §2.1 implementer self-review checklist 加最后一条:**`git status -sb` 检查无 modified file**;若 build script 自动 sync 副本 → 一并 `git add` + commit。Dispatch prompt 列出项目所有自动 copy script 路径让 implementer 知晓 | controller push 前 `git status -sb` 兜底发现 → 单独 chore commit `chore(sync): xxx-副本 同步顶层` 显式记录;**preferred**: 改 build script 直接 commit 副本而非生成(eliminate auto-copy ambiguity) |
| **第三方包 self-closing/empty payload + plan 双层 guard 间隙(see §5 Case 05 Pattern G)**| plan inline 双层 guard:一层 `?? {...}` 防 `noUncheckedIndexedAccess` 数组越界;另一层 `X ? ... : ...` ternary 防 falsy。第三方包(如 fast-xml-parser)对 self-closing `<failure/>` / empty input 返 `""` empty string,`Boolean("") = false` → ternary 走 fallback 分支 → 该分支不防 undefined-deref → crash。两层 guard 各自合理但**语义间隙**:truthy/falsy 边界 ≠ "内容存在"边界 | dispatch prompt **Pre-verified Data 段列出第三方包对 edge input(empty string / self-closing / null / undefined)的真实返回行为**(controller 实测验证给 implementer);不要让 implementer 假设 truthy/falsy 边界与"内容存在"边界等价。Sonnet code_quality reviewer 涉及 parser/serializer 时必实测第三方包 edge case | guard 改 `typeof X === 'object' && X !== null` 排除空字符串(明确 type 边界而非 truthy/falsy 边界);round 2 fix + regression test 加 edge input 用例 |
| **plan 留白展开 "同时"/"并且" 文字 atomic boundary 歧义(see §5 Case 05 Pattern H)**| plan 留白(§0.0 留白展开模式)文字描述 atomic boundary("同时"/"并且"/"在...的同时")被 implementer 解读不一致 — plan 写时假设 critical section 边界 X,implementer 展开时把代码放 critical section 边界 X' 不同位置;有 lock 时 critical section 内 vs 外位置不同 → silent lock-protected critical section 错位 → 并发 race | plan 留白展开时**显式标注 critical section boundary**(eg. "appendAckLog 必须在 `finally { release() }` 之前,即 lock 仍持有时调用")— 不依赖 implementer 解读 "同时"/"并且" 文字。§2.1 implementer self-review checklist 加:"plan 文字描述的 atomic boundary — 我的代码是否真在该 boundary 内?有 lock 时,critical section 内 vs 外位置不同 → silent race" | Sonnet code_quality reviewer round 1 抓到(runtime correctness race condition 子类);round 2 implementer 把 critical section call 移入 lock try 块尾 + 加 regression test spawn 子进程验链不断 |
| **plan inline placeholder/lookup 与现有 schema regex/interface 不符(see §5 Case 05 Pattern I)**| plan inline placeholder(如 `'sha256:placeholder'` 15-char)/ lookup(如 `e.extra?.task_ref`)字面与现有 schema regex / interface 字段假设不符 — plan 写时假设 schema X 但实际 schema Y;Sonnet implementer 严格 transcribe plan 字面而**不 cross-check 现有 schema** → 数据 schema-invalid 必拒 / lookup 永远 false 永久 fail-closed | dispatch prompt Pre-verified Data 段 controller 应 cat 涉及 schema file 全 regex + interface 字段给 implementer,要求"对照 schema regex / interface 字段 — 若 plan inline 字面与现有 schema 不符 → 标 observation 让 controller 决定 fix"。Plan reviewer 在 plan 评审阶段加"plan inline placeholder / lookup vs 现有 schema regex / interface 字段一致性"扫描 | Sonnet code_quality reviewer round 1 + controller 对照 schema file 实测确认;round 2 fix placeholder 改满足 regex(`sha256:${'0'.repeat(64)}` 等);lookup 改简化方案(失去精度作为 polish trade-off,plan-Nz follow-up) |
| **多路径 fallback divergence cross-source hash mismatch + reviewer Important 低估 → controller 必实测升级(see §5 Case 05 Pattern J)**| plan 留白展开时 implementer 在 helper 同时构造**多路径**同 schema 数据(payload 写一处 / staging 写另一处)用了不同 fallback default(payload `?? null` / staging `?? '' / ?? -1 / ?? new Date()`);下游 fence cross-source canonicalHash 比对永远 mismatch → 任何省略 optional CLI arg → 所有合法工作流被拒签 → system-wide broken。Sonnet code_quality reviewer 标 Important 但描述含 "system-wide" / "always-fail" / "all-changes" 等关键词,controller 应实测升级为 Critical | §3.2 cross-verify 强化:**reviewer 标 Important 但描述含 "system-wide" / "always-fail" / "all-changes" / "永远 X" → controller 必实测 evidence 验证**(grep 涉及 file:line + 模拟 user happy path) → 决定升级 Critical 还是接受 Important。dispatch prompt 加:helper 同时构造多路径同 schema 数据时,**显式约束"single source of truth"**(payload = staging-built object,不构造两次) | Round 2 implementer 跨 Task scope fix(改 helper 为 single source of truth payload = staging-built object;沿 Case 04 Pattern A emergent fix 模式) + 加 regression test cross-source projection hash 不误报 |
| **cross-Task test interaction(N regression test assume N+1 logic placeholder)(see §5 Case 05 Pattern K)**| Task N 加 regression test assuming Task N+1 logic 仍是 placeholder(eg. `const findings = []` 占位);test PASS 快速 1.3s。Task N+1 enable real logic(eg. 启用 `runRerunFence(ctx)` 真调 worktree)→ 同 test 现在真跑 long-running operation → timeout 5000ms fail。Implementer 想急完成 task 倾向 **self-report "flaky"** 而非 real regression | dispatch prompt 加:涉及多 Task 跨阶段 test setup 时,**显式标注 "N Task 加的 test 在 N+M Task enable real logic 后会不会触发新 long-running operation?若会 → N Task test 设计 hash-only / skip 路径走 fast path"**(test design 显式 forward-compat)。controller cross-verify 必拒绝 "flaky" self-report → 实测 stash 前后对比 + deterministic 触发条件分析 | Round 2 fix:test 改 staging mode='hash-only' 走 skip 路径(hash-only 直接 return),仍验目标 fence(因子检仍跑);controller cross-verify stash 前后确认是 deterministic regression 而非 flaky |
| **implementer "acceptable risk"/"flaky" 自报 → controller final review 必实测 verify(see §5 Case 05 Pattern L)**| per-task code_quality reviewer 标 Important 但 implementer self-report "acceptable risk" / "flaky 与 X 无关" / "low priority" 误导 final review 阶段。Implementer 想急完成 task 倾向自报 acceptable risk;若 controller 接受 self-report 不实测 verify → release 时暴露 real risk(攻击路径 / timing 距 bound 距离 < buffer) | §2.7 final reviewer playbook 加:cross-task synthesis 必扫所有 per-task Important 中 implementer self-report "acceptable risk" / "flaky" / "low priority" 的 finding → **实测 verify**(攻击路径模拟 / 实测 timing 距 bound 距离 N 次 / stash 前后 deterministic verify)→ 决定升级 Critical / 维持 Important / 接受 acceptable risk。**Implementer 自报评估不能 substitute final review 实测验证** | Final reviewer 实测 N 次 + controller direct fix commit(eg. catch 块加 else 转 CRITICAL finding + timeout buffer 加大);PR description 必标"final review 实测升级"留 audit trail |
| **CI 环境 env var 累积 latent bug(long-lived feature branch first CI run)(see §5 Case 05 Pattern M)**| 老 test 不 override `CI` env / 其他 CI-sensitive env var(GH_TOKEN / TZ / LANG);GitHub runner 默认 `CI=true` → child process 检 `process.env.CI` 调整行为(如 ack propose exit 2 拒);本地 `process.env.CI=undefined` PASS;long-lived feature branch(>3 plan 周期未 PR 到主干)累积 latent CI bug,first PR run 才暴露 | test setup 显式 `CI=''` env override(`{ env: { ...process.env, CI: '' } }` 给 spawnSync / execa);dispatch prompt Pre-verified Data 段标"CI=true 环境下命令行为 vs 本地" — 若 child process 检 `process.env.CI` 调整行为,test setup 必显式 override。§3.2 cross-verify 加:**long-lived feature branch(>3 plan 周期未 PR 到主干)PR 前必跑 `gh pr create --draft` 触发 CI dry run** — 累积 latent CI bug 早发现 | chore commit `chore(<old plan> test fix): 加 CI='' env override`(本地 + CI 双 PASS 验证);PR description 标"累积 N plan 周期 latent CI bug,first CI run 暴露" |
| **plan 增量修订加功能但漏加 test scenario → 该功能代码路径零覆盖,bug 穿透 implementer 自检 + spec review(see §5 Case 10 Pattern AA)**| plan 在多轮 review 收敛**之后**追加新 Step / helper(本例 v10 加 parseCodexOutput markdown 解析),但固定的 integration scenario 集是修订前定稿的,无一覆盖新路径;implementer 自写实现(plan 只给格式说明不给代码)含 bug(本例 `\Z` cross-language false-cognate 锚 → 整条 markdown 路径全量 breakage);零覆盖 → implementer 自检(原 scenario 全过)+ spec compliance review(只比对 spec 字面)双漏 | controller dispatch 前检查「plan vN→vN+1 增量加的每个代码路径是否有对应 test scenario」,无则 dispatch prompt 显式要求 implementer 补测试(不被固定 scenario 计数束缚,计数交 test inventory 统一 Task 校准);implementer self-review checklist 加「自写的解析器/正则/状态机是否有专门测试」;涉及 implementer 自写正则 → code_quality reviewer 必 `node -e` 实测 repro 而非读码判断 | §1.3.4 Sonnet code_quality runtime review 兜底(读码 + adversarial 实测);TDD 补测试(markdown 测试 RED → 修 parser → GREEN,一举暴露连带的第二个 bug)|

---

## §7 How to Use This Skill

### Controller dispatch 前(每次):
1. **判定 task subtype**:read §1 找 §1.X.Y 行
2. **选 model**:用 §1 表的 model 列(若 cheap-model row,read §2 playbook 验证 pre-condition 满足)
3. **写 dispatch prompt**:用 §2 X playbook 的 prompt 模板 + §3.1 STRICT cwd
4. **显式传 `model:` 参数**(否则 inherit 父 session model — Pattern catalog 第 1 行 failure mode)

### Controller 收 return 后:
1. **跑 §3.2 cross-verify**(测试 count / commit SHA / branch / spec strings)
2. **若 reviewer 出 issues** → §3.3 inline fix vs round 2 决策
3. **若 worktree leak detected** → §4.1 cherry-pick recovery

### Subagent dispatch 完成后(MANDATORY by Trigger Type):
1. **判定 Trigger Type**(§3.4.0 matrix:1 = 3-stage / 2 = parallel / 3 = standalone Task / 4 = ad-hoc research / 5 = codex CLI)
2. **跑对应 retrospect**:
   - Type 1 / 2 → MANDATORY full Q1-Q6(Type 2 加 Q7);Opus actor
   - Type 3 → Light Q2 + Q3 + Q4;Opus 或 Sonnet
   - Type 4 → Skip retrospect;仅 §3.2 cross-verify
   - Type 5 → 不在本 skill scope;沿 codex 自家 protocol + §3.2 cross-verify
3. **若 retrospect 全 No** → SKIP skill update,silent pass
4. **若 retrospect 任一 Yes** → §3.4 Decision Tree 触发 skill update:
   - 加 §5 Case <NN+1>(MANDATORY;标 Trigger Type + scenario §1.X.Y)
   - 视情况追加 §6 catalog row(若 new failure mode)
   - 视情况追加 §1.X.Y row + §2 playbook(若 new scenario subtype)
   - Update frontmatter `case_study_count` / `scenario_subtype_count`

---

## §8 How to Update This Skill(growing 协议)

本 skill 设计为**living document**:§1 scenario taxonomy + §2 playbook 是 stable 上层;§5 case studies + §6 catalog 是 growing 下层。**增长触发由 §3.4 Post-Phase Quality Retrospect 强制**(Opus retrospect 找到 issue 才加;无 issue 不加,避免噪声)。

### 新 case study 添加(MANDATORY 当 §3.4 retrospect 任一 Yes)
1. Append §5 用 Case <NN+1> 模板
2. Update frontmatter `case_study_count`(N → N+1)
3. 若新 failure mode → §6 catalog 加 row

### Case study 不加(SKIP — §3.4 retrospect 全 No)
1. **不**加 §5 — phase 表现 within §1 expectation,加 case 是噪声
2. **不**改 frontmatter
3. Phase silent pass — skill 不变

**Anti-pattern**:看到 phase 完成就反射式加 case study(无论质量)→ 信号噪声 ratio 降低;case studies 失去 "real failure 沉淀" 价值

### 新 scenario subtype 添加(rare;只在 §1 28 子类不覆盖 new task type 时)
1. 决定加在 §1.X 哪类下(implementation / spec review / code quality / test / doc / debug / verification / 新类)
2. 加 §1.X.Y row(特征 + model + WHY + 必备 prompt 元素)
3. 加 §2.X playbook 段(若 cheap-model 适用)
4. Update frontmatter `scenario_subtype_count`(28 → 29)

### Model tier 调整(model lineup 变化时,~1-2 年一次)
- §1 表 model 列调整(e.g. Anthropic 出 Claude 5 / 不同 pricing)

### Skill meta-review(每 ~10 case studies 或某 scenario 实证 ≥5 case 强化)
- 是否某 scenario subtype 提升优先级 / 加边界
- 是否 case studies 暴露 systemic gap(超出 controller-side 范围;需更新 superpowers 上游 skill)
- 是否 §1 taxonomy 该重新分组

---

## §9 Relation to forge:subagent-driven-development

本 skill 与 `forge:subagent-driven-development` 是 **sister skills**:

| forge:subagent-driven-development | 本 skill |
|---|---|
| **Generic process scaffold**(per-task 3-stage:implementer + spec_reviewer + code_quality_reviewer + final_reviewer)| **Scenario-specific judgment**(§1 taxonomy:每 task subtype → model + WHY + cheap-model playbook) |
| Generic prompt templates(implementer-prompt.md / spec-reviewer-prompt.md / code-quality-reviewer-prompt.md)| §2 strict prompt elements(per scenario:必含元素 + pre-condition + failure mode if skipped) |
| Loose 3-tier model selection(cheap / standard / most-capable + "files touched" signal)| §1 28-subtype × model tier matrix(细分 task subtype → 具体 model + WHY) |
| Status handling(DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT)| §3.3 controller decision(inline / round 2 / 升级 user)|
| Red Flags(don't dispatch parallel implementers / subagent 不读 plan 文件) | §3.1 STRICT cwd verify(防 worktree leak — 红 flag 之外的实证)+ §3.2 cross-verify |
| Continuous execution discipline | §3.2 cross-verify 5 类 claim(防 self-hallucination)|
| (无 cost guidance)| §1 model 列每 row 含 cost tier;§4.2 mid-phase upgrade trigger |
| (无 recovery flow)| §4.1 cherry-pick recovery |
| (无 skip 边界)| §1.5.1 + §1.7.1 显式列 direct/no-subagent 场景 |

**真源**:`forge:subagent-driven-development`。本 skill **不复制不重写** 上游 prompt 模板;只补 controller-side scenario judgment。
