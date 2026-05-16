---
name: forge:subagent-driven-discipline
description: Subagent task type taxonomy + cheap-model reliability playbook + Trigger Type Matrix retrospect for subagent-driven-development workflows。**重场景轻业务**:按 subagent 任务类型(implementation 5 子类 / spec review 4 子类 / code quality review 5 子类 / test creation / doc / debug / verification)细分 model tier + WHY + 让 cheap model 高质量的具体 prompt patterns。**Design 任务(algorithmic / architectural / arch doc rewrite / complex root cause)绝对原则 Opus only,无 exception**。Cross-scenario discipline(cwd verify / cross-verify / cherry-pick recovery / cost framework)作为 supporting infrastructure。**Living catalog 增长由 §3.4 Trigger Type Matrix retrospect 强制**:5 trigger types(3-stage / parallel / standalone / ad-hoc / codex CLI)各自 retrospect intensity;Type 1+2 Opus mandatory full;Type 3 light;Type 4 skip retrospect 仅 cross-verify;任一 Yes 才加 case study;全 No 不加(避免噪声)。Companion to `forge:subagent-driven-development`。
license: MIT
compatibility: Claude Code Agent tool;sister to forge:subagent-driven-development(generic 3-stage process)
metadata:
  author: forge (generic skill)
  version: "1.0-generic"
  scenario_subtype_count: 28
  case_study_count: 0
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
| **§1.1.2 Pattern-matching(用既有模式)** | 改 / 新建文件,需照既有 sister files 风格;Plan 给 file:line 锚点但不全 inline | `haiku` 或 `sonnet`(borderline)| Pattern lookup + 套用是 pattern matching 任务;若需理解 pattern semantic 升 Sonnet | 1) **必给 sister file 路径**(让 implementer Read 参考)<br>2) Pattern 元素 enumerated(e.g. "沿 `<existing-project-module>` 的代码风格和模式")<br>3) Style constraint(stdlib only / 中文 docstring)<br>4) Anti-pattern 显式列(e.g. "不引入外部 dep") |
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

**核心 takeaway**:**Code Quality 阶段 §1.3.4 Runtime correctness 不可 skip + 不可降级 Haiku**。Haiku implementer + Haiku spec_reviewer 漏的 runtime bug(f-string / JSON 序列化通过 env var 静默失败)只有 Sonnet code_quality 抓到。

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
| **TypeScript / Node(pnpm)** | `pnpm typecheck` / `pnpm lint` / **`pnpm format:check`**(漏 → 可能导致 CI 失败,具体看项目 CI 配置)/ `pnpm test --run` / `pnpm build`(若改 src/* 影响 dist) |
| **Python(pytest)** | `python -m pytest -q` / `ruff check`(若用 ruff)/ `mypy <package>`(若用 mypy) |
| **Rust(cargo)** | `cargo fmt --check` / `cargo clippy -- -D warnings` / `cargo test` |
| **Go** | `go vet ./...` / `gofmt -l .`(空输出)/ `go test ./...` |

**Plan inline code escape valve**(implementer 自我反思口子;§6 catalog "Plan inline code 含 latent bug" 行):
若 self-review 中发现 plan inline code 看似有 bug(IO 不在 try 内 / fd 不 close / type 越界 / race window 等 runtime correctness 问题),**不擅自改 plan**,在 self-review 报告中加 "Observation: plan line X-Y 似有 <issue>,留 reviewer 判断" 段。Sonnet code_quality reviewer 沿 §1.3.4 runtime correctness MANDATORY 兜底。

**Failure mode if skipped**:implementer 自由 design / hallucinate self-report / 漏 commit / commit 错 branch(see Pattern §3.1 worktree leak)/ stack-mismatch self-review 漏 lint/format 导致 CI fail / 照搬 plan inline latent bug 不报 observation。

#### §2.1.1 P-5 — external protocol assumption verify

Dispatch implementer 第一步**不是开始实施**,而是 grep / read 实际项目代码验证 plan 字面陈述与外部系统约束是否一致:

- **外部 registry / enum 约束**(`<registry-file>` 实际 union 值;runner 不接受 plan 字面虚构的条目名)
- **build script**(`<build-sync-script>` 实际 stages + reverse-sync 行为)
- **其他外部协议**(命令协议文件 step 顺序 / SKILL.md cross-ref / 现有 schema / action enum 字面)

Plan 字面是设计**意图**,外部代码是实施**约束**;前者可能漏拷后者。

**Prompt 必含元素**(沿 §2.1 prompt 模板补):
```markdown
## External Protocol Assumption Verify(MANDATORY first step,§2.1.1)

Before implementing, grep / read these files and verify plan claims:
- <file path 1>: verify <plan claim>
- <file path 2>: verify <plan claim>
- ...

If any verify fails → report BLOCKED with specific verify command + actual vs expected output, DO NOT start implementation。
```

### §2.1.2 cross-cutting 状态回写 hook

**Trigger**:implementer 实施 Task 改动了 master plan / spec / 上游 sub-plan / 当前 sub-plan 自身 引用的 cross-cutting 字段:

- file:line 字面(eg. `<module-path>:<line>` 模板字面引用)
- 不变量计数(eg. spec §X.Y "14 green↞HEAD" / "6 子段 7 子段")
- DoD 状态(eg. master plan §3.X "<sub-plan-name> DONE @ commit `<sha>`")
- version 字面(eg. package.json / CHANGELOG.md / templates 内 v0.X 引用)
- release gate / 协议字面(eg. sub-plan 自身 release gate "0 严重 / 0 阻塞 / 0 Major" sync 全 plan)

**Required action**(同 commit 内回写 — 不留 stale 引用):

1. implementer 实施前:**grep** `<changed-content>` master plan / spec / 上游 sub-plan / 当前 sub-plan 全文,**列出所有引用方位置 list**(不眼测)
2. implementer 实施时:**同 commit** 内回写所有引用方至新值
3. implementer self-review checklist 加项:"列出本 Task 改动 cross-cutting 字段 → grep 全 plan 验所有引用方已 sync"

**Controller dispatch prompt 加项**(在 §2.1 任务描述段尾):

```markdown
若本 Task 改动 cross-cutting 字段(file:line 字面 / 不变量计数 / DoD 状态 / version 字面 / release gate 协议字面),
implementer **必 grep** master plan / spec / 上游 sub-plan / 当前 sub-plan 全文,**列出所有引用方位置 list**(不眼测),
**同 commit** 内回写至新值;不留 stale 引用。
```

**verify protocol**(implementer self-review checklist line 末加):

```bash
# 若 cross-cutting 字段改动,跑此 verify(不眼测):
grep -rn "<old-value>" <master-plan-path> <spec-path> <upstream-sub-plan-paths> | wc -l  # 期望 = 0(全 sync)
grep -rn "<new-value>" <master-plan-path> <spec-path> <upstream-sub-plan-paths> | wc -l  # 期望 ≥ N(新值已替换 N 处)
```

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

违任一 → cheap model 易 hallucinate / scope-bleed / 输出 useless verdict。

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

### §3.3.1 P-6 — 区分 rubric 软度 vs 验证强度

自动评测框架中有两个**独立指标**,**不互替**:

| 指标 | 含义 | 触发什么改动? |
|---|---|---|
| **rubric 软度** | baseline AI 不失分 → rubric 没收紧到必要程度 | **改评测测试配置**(收紧 rubric / 提权重) |
| **验证强度**(区分度) | GREEN AI 与 RED AI 差距不显著 → skill 字面未充分对齐 | **改 skill 内容 / bootstrap**(让 GREEN AI 看到更多字面) |

**关键纪律**:两指标混用会导致 rubric 不断收紧到不可达,GREEN AI 也通不过(假性 RED)。若区分度不足,应**改 skill 字面**而非收紧 rubric 凑数字(Goodhart's law 防御)。

### §3.3.2 P-8 — Task BLOCKED 修订决策树

Task implementer 报 BLOCKED 时,plan author 决策两选项:

- **选项 A — 改架构**:新建独立 skill / 独立配置文件,**侵入基础设施**
- **选项 B — 复用现有架构**:merge 进现有配置,保持当前 plan 序列 atomic

**默认选 B**。

- 选 A 的代价:增加 release 时基础设施改动面积 + breaking 现有测试基线 + 跨 sub-plan 影响
- 选 B 的代价:验证粒度可能变粗(多个 plan 共用一个配置)— 但通过 scenario 分组可缓解

**关键纪律**:优先保持 plan 序列 atomic,避免因一个 BLOCKED task 引发跨边界的基础设施改动。若必须选 A,需明确评估所有受影响的下游测试配置与 skill 引用。

### §3.4 Post-Phase Quality Retrospect Protocol(Opus-only judgment;skill 增长触发)

**核心原则**:任何 subagent dispatch 完成都需 controller-side 质量分析 — 但 dispatch 类型不同,retrospect intensity 不同。本节定义 **5 Trigger Type × 不同 retrospect intensity**。

#### §3.4.0 Trigger Type Matrix(总览)

| Trigger Type | 何时 fires | Retrospect Intensity | Actor | Cost |
|---|---|---|---|---|
| **Type 1: 3-stage full**(canonical;§1.1 + §1.2 + §1.3)| per-task implementer + spec_reviewer + code_quality_reviewer 全 ✅/⚠️ + 3 evidence committed | **MANDATORY full Q1-Q6** | **Opus**(MANDATORY)| $0.30-1.00 |
| **Type 2: Parallel dispatch**(`forge:dispatching-parallel-agents`)| 多 implementer 并行全 commit + W2 actual diff 验证 + 后续 spec / code_quality reviewer 全 ✅ | **MANDATORY full Q1-Q6 + Q7**(parallel-specific) | **Opus**(MANDATORY)| $0.40-1.20 |
| **Type 3: Standalone Task**(§1.4/§1.5/§1.6/§1.7 单 subagent dispatch,无 3-stage review)| Single Task return DONE / DONE_WITH_CONCERNS | **Light:Q2 + Q3 + Q4**(skip Q1/Q5/Q6 — 单 task scope 不够 trigger broader pattern) | **Opus or Sonnet** | $0.10-0.30 |
| **Type 4: Ad-hoc research Task**(无 evidence committed;e.g. "summarize files" / "find X usage")| Task return | **Skip full retrospect;仅 §3.2 cross-verify** | Controller(any tier) | ~$0(cross-verify only) |
| **Type 5: Codex CLI subprocess**(`<external-review-command>` 等外部 CLI review 触发)| Codex CLI return | **本 skill 不 cover**(Codex 自家 protocol — 沿 `<codex-helper-script>` 自家协议) | N/A | N/A |

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
| **Q7c** | JSON 序列化(env var 传递)缺失 / W2 actual diff Bash glue 错?(silent overlap detection failure)| 必加 §5 case + §1.1.3 multi-file integration playbook 加 prompt 元素 |
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

**Trigger**:`<external-review-command>` 等外部 CLI review 触发(如 codex-plugin 派的 CLI subprocess)。

**为什么不 cover**:
- Codex CLI 不是 Claude Code subagent — 是外部 CLI subprocess(`<codex-helper-script>` broker)
- Codex 走自家 protocol(Round Counter + Polling Convention + verbatim-first output)
- Codex 自家有 review 协议(`<review-output-file>` / cross-check matrix)

**Controller 责任**(本 skill 不规约,但提醒):
- Codex return 后仍需 §3.2 cross-verify(测试 count / file path / commit SHA / URL)
- 若 codex hallucinate → 是 codex-plugin / `<codex-helper-script>` bug,不是本 skill 范围

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

> 本层 ship 时为空。下游项目按 §3.4 Trigger Type Matrix retrospect 机制,在满足「任一 trigger 命中」时往这里追加自己的 case study。pattern 教学价值见 §6 Pattern Catalog。

### Case <NN>: <title>

- **Trigger Type**: <Type 1-5 之一>
- **Context**: <场景一句话>
- **Failure mode / friction**: <遇到的具体问题>
- **Recovery**: <如何恢复>
- **Lesson / Pattern**: <沉淀的可复用 pattern>

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
