# Plan 9z — v1.0 release(CHANGELOG + release-gate-checklist § v1.0 + init.ts 文本 + plan-9z polish 9 工作单 + npm publish)

> **For agentic workers:** REQUIRED SUB-SKILL: 沿 plan-9j / plan-9h 同模式,**不必 invoke `forge:writing-skills`**(本 plan 不是新 skill 开发);**docs-heavy + 已知路径**,采用 brainstorm Section 6 决策的**中间路线 B 模式**(写 sub-plan doc + inline 实施,跳过 brainstorming 探索 + 跳过 implementer dispatch + 跳过 self-review 三轮)。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:落地 forge v1.0 release 收尾 — `docs/release-gate-checklist.md` § v1.0 fusion completion 发布门(沿 v0.3 / v0.4 模板 6 子段)+ `CHANGELOG.md` `[1.0.0]` 段(9 子模块概要 + codex review 累计修订记录 + acknowledgments)+ `src/cli/commands/init.ts:38` warning 文本更新("v0.4" → "v1.2",B-7 修订,仅文本改实际 init removal 留 v1.2)+ **plan-9z polish 9 工作单消化**(plan-9i 协议 4 patterns O/P/Q/R + plan-9h Task 4 2 concerns P-1/P-2 + 协议升级 P-5~P-8;P-3 fence-9.2 flaky timeout / P-9 git utils 抽出 / P-4 plan-9h 外部 codex review 按用户授权决定)+ 全本地 verify + 跨 OS CI 全绿 + 版本号决策(选项 A 一次性 v1.0.0)+ `pnpm publish`(用户授权触发)。

**Architecture**:5 层 release 收尾 —
(1) **Release docs 层**:`docs/release-gate-checklist.md` 末尾追加 §5 v1.0 fusion completion 发布门(沿现有 v0.4 §4 段 6 子段模板:代码 + 测验证 / 端测 / 兼容 / 文档 / npm / plugin);`CHANGELOG.md` `[Unreleased]` 后插入 `[1.0.0]` 段(沿 v0.4 段格式:Major changes / Added by sub-plan / Changed / Fixed / Acknowledgments)。
(2) **CLI 文本层**:`src/cli/commands/init.ts:38` warning 文本 "v0.4" → "v1.2"(仅一行文本改;实际 init removal 留 v1.2 plan)。
(3) **plan-9z polish A 组层(协议字面升级)**:`.claude/skills/writing-skills/SKILL.md` 应用 Pattern O(步骤 1 line 47 加 registry + scenarios + 骨架一起 commit 警示)+ Pattern P(rubric 设计原则段:baseline 能否做对判权重)+ Pattern R(步骤 1 line 53 加硬 trigger "任一 RED avg > 5 → 立即 REFACTOR scenarios");`.claude/skills/writing-skills/forge-eval-integration.md` 应用 Pattern Q(rubric 模板段加判分锚点段示例)+ P-7(must_not_match 引用 vs 行为边界子段);`.claude/skills/subagent-driven-discipline/SKILL.md` 应用 P-5(§2.1 implementer prompt 加 external protocol assumption verify 子段)+ P-6(§3.X 加 区分 rubric 软度 vs 验证强度 段)+ P-8(§3.X plan writing playbook 加 Task BLOCKED 修订决策树 子段)。**全部纯字面 docs 改动 — 不动代码 / 不改 schema / 不改 CLI 行为**。
(4) **plan-9z polish B 组层(forge-eval 收尾)**:P-1 改 `.claude/skills/subagent-driven-discipline/SKILL.md` §"Main Agent STOP Triggers" 5 触发表加第 6 行 cross-ref 到 `commands/apply.md` 步骤 0 + `forge preflight branch-check`(plan-9h Task 4 concern α 字面缺口);P-2 改 `forge-eval/scenarios/main-agent-stop.yaml` `stop-on-repeat-failure` scenario 收紧 `must_not_match` regex(从 `(直接\s*再派|再试一次|换个\s*model\s*再派)` 引用短语 → `(?:好的|那就|可以).{0,20}(再派|再试)` 或 `Use Task tool with .* sonnet` 行为锚)+ 判分锚点段显式标 "must_not_match 不针对 AI 复述用户原话";**重跑 `pnpm eval:skill subagent-driven-development` 验 `branch-protection` + `stop-on-repeat-failure` 两 scenario pair_pass 通过**(plan-9h Task 4 DONE_WITH_CONCERNS 状态消化)。
(5) **Verify + 版本号 + publish 层**:全本地 verify(typecheck/lint/format:check/test/build,memory `feedback-local-verification-format` 不变量)+ push CI 触发跨 OS GitHub Actions(Linux + Windows × Node 20/22 全绿)+ 版本号决策(选项 A 一次性 v1.0.0,沿 brainstorm Section 4 用户授权)+ `package.json` `version` bump `0.4.0` → `1.0.0` + 打 tag `v1.0.0` + `pnpm publish`(**用户授权触发**,不自动跑)。

**Tech Stack**:Node 20+ / TypeScript ESM strict / pnpm 9+ / vitest 1.x / 现有 `forge-eval/scenarios/main-agent-stop.yaml`(plan-9h Task 4 落地)+ `.claude/skills/writing-skills/SKILL.md`(plan-9i Task 2 落地)+ `.claude/skills/writing-skills/forge-eval-integration.md`(plan-9i Task 4 落地)+ `.claude/skills/subagent-driven-discipline/SKILL.md`(plan-9h Task 3 落地 + 累积 plan-9i / 9f 沉淀)+ `src/cli/commands/init.ts`(v0.3 现状,本 plan 改 line 38 warning 文本)+ `docs/release-gate-checklist.md`(现 255 行,本 plan 末尾追加 § v1.0 段)+ `CHANGELOG.md`(现 207 行,本 plan `[Unreleased]` 后插 `[1.0.0]` 段)+ `package.json` version 字段。**不引入新 npm 依赖**;**不动** 任何 schema / `src/core/markers/types.ts` / `src/core/archive/*` / `src/cli/commands/*`(除 init.ts:38 文本)。

**Spec 引用**:
- master plan §3.11 [`2026-05-10-plan-9-v1.0-fusion-completion-master.md`](2026-05-10-plan-9-v1.0-fusion-completion-master.md) line 403-413(plan-9z release scope:CHANGELOG + release-gate § v1.0 + init.ts 文本 + verify + npm publish + 版本号选项 A/B/C)
- master plan §0 line 44-60(版本拆分选项 A / B / C;**brainstorm Section 4 决策选项 A 一次性 v1.0.0**,因 9a-9j 全 DONE 直接 release,B/C 拆 alpha/rc 适用"开发到一半启动 release",不适用本场景)
- memory [[project-plan9i-protocol-upgrade-followup]] 完整 plan-9z polish 工作单清单(4 patterns O/P/Q/R + P-1~P-9)
- `.claude/skills/subagent-driven-discipline/SKILL.md` §5 Case 07(plan-9f 沉淀 Pattern O/P/Q/R)+ Case 08(plan-9h 沉淀 Pattern S/T/U + REINFORCE Q + 5 Followup)
- plan-9h §9 Retrospect [`2026-05-14-plan-9h-sdd-discipline.md`](2026-05-14-plan-9h-sdd-discipline.md) line 1084-1107(2 concerns P-1/P-2 + flaky timeout P-3 caveat)
- v0.4 reference:`docs/release-gate-checklist.md` §4 v0.4 forge migrate 发布门(line 215-254)+ `CHANGELOG.md` `[0.4.0]` 段(line 11-66)— **本 plan 沿同样模板**

**P50 工日**:**1.3**(0.15 Task 0 sub-plan doc + 0.15 Task 1 release-gate § v1.0 + 0.2 Task 2 CHANGELOG + 0.05 Task 3 init.ts + 0.25 Task 4 polish A 组 + 0.3 Task 5 polish B 组 含 baseline 重跑 + 0.2 Task 6 verify + publish)
**P90 工日**:**1.9**(P50 + 0.6d buffer ~46%;含跨 OS CI 等待 / Task 5 baseline 重跑可能多轮 / Task 6 verify 失败排查 / 可选 P-4 外部 codex review;与 §10 工日表合计闭合;沿 plan-9h 同等规模)

**前置(必须完成)**:
- plan-9a-9j 全 sub-plan 已合 dev(de32baa,plan-9h Task 5 review fix 末态)
- dev clean + sync origin/dev
- codex auth 已恢复(用户已确认,不需 `! codex login`)
- 跨 OS CI baseline 已绿(plan-9h Task 5 末态 push 已触发,可直接复用 — 仅在 Task 6 再次 push verify)

**后续 unblocked**:
- v1.0.0 npm 发布(Task 6 publish 后)
- plan-v1.1(P-3 fence-9.2 flaky timeout / P-9 git utils 抽出 / 可能其他遗留)

**DoD**(完成定义,沿 brainstorm Section 6 DoD 综合验收):

### Release docs 层

- `docs/release-gate-checklist.md` 末尾追加 §5 v1.0 fusion completion 发布门段;6 子段(代码 + 测验证 / 端测 / 兼容 / 文档 / npm / plugin)沿 v0.4 §4 模板字面
- 每子段含 ≥ 3 个 checkbox 项(`- [ ]` 语法,默认未勾,maintainer 发版前手动勾)
- 文档引用 `2026-05-10-v1.0-fusion-completion-design.md` + master plan + 各 sub-plan 文件(沿 v0.4 §4.4 模式)
- `CHANGELOG.md` 在 `[Unreleased]` 后插入 `[1.0.0] - 2026-05-XX` 段
- `[1.0.0]` 段含:Major changes(9 子模块累积主题)+ Added by sub-plan(9a-9j 各一段概要)+ Changed(关键 schema / 行为变更)+ Fixed(codex review 累计修订记录,跨 9 sub-plan)+ Acknowledgments(spec / plan 链)
- `[1.0.0]` 段长度 ≤ 100 行(沿 v0.4 段 ~55 行 + v0.3 段 ~55 行 同量级)

### CLI 文本层

- `src/cli/commands/init.ts:38` warning 文本 "v0.4" → "v1.2"
- **实际 init removal 不在本 plan**(留 v1.2);本 plan 仅做文本预告

### plan-9z polish A 组层(协议字面升级)

- `.claude/skills/writing-skills/SKILL.md` 步骤 1 段加:
  - **Pattern O**(line 47 附近):一段警示文本 "registry 扩展 + scenarios + 最小骨架一起 commit(vitest GREEN baseline);单独 commit registry 触发 `it.each` ENOENT"(plan-9i Task 0 commit `92de387` + plan-9f Task 0+1 合并 commit `1d220ef` 实证)
  - **Pattern P**(rubric 设计原则段):每个维度问 "baseline AI 能否在没 skill 时做对" — 能则降权重,不能则升权重(forge-specific 维度高权重 = baseline AI 必然失分锚点);plan-9f v1 scenarios 1/3 pair_pass 假性 GREEN 实证
  - **Pattern R**(line 53 附近):硬 trigger "若总览表任一 scenario RED avg > 5 → 立即 REFACTOR scenarios(不是 SKILL.md),提升 forge-specific 维度权重 / 收紧 judge rubric / 加 must_not_match / 加判分锚点段;再跑 baseline 直到所有 RED ≤ 5"
- `.claude/skills/writing-skills/forge-eval-integration.md` 加:
  - **Pattern Q**(rubric 模板段):加 "判分锚点" 段示例 — 显式声明(1)不评估什么 (2)baseline 预期失败模式 (3)按维度逐项判分(plan-9f v1 scenario 2 judge LLM 把 OAuth 技术解答判 "答非所问" 扣分实证)
  - **P-7**(Pattern Q 升级)子段:"must_not_match 引用 vs 行为边界" — must_not_match 锚行为(`Use Task tool with .* sonnet` / `派 sonnet 再试`)而非引用短语(`再试一次` / `换个 model`);判分锚点段标 "regex 不针对 AI 复述用户原话场景"(plan-9h Task 4 `stop-on-repeat-failure` 实证)
- `.claude/skills/subagent-driven-discipline/SKILL.md` 加:
  - **P-5**(§2.1 implementer prompt 段):"external protocol assumption verify" 子段 — 要求 dispatch implementer 第一步 grep / read 实际项目代码(如 forge-eval runner 1:1 yaml 约束 / SKILL_NAMES 数组 / build script),而非默认信赖 plan 字面陈述(plan-9h Task 4 implementer 抓到 BLOCKED 价值实证)
  - **P-6**(§3.X 段):"区分 rubric 软度 vs 验证强度" 段 — 两独立指标:Pattern R(rubric 软度 RED ≤ 5 触发)vs pair_pass(验证强度 delta ≥ 1.5);**不互替**(Goodhart's law 防御);plan-9h Task 4 严格 RED 全 ≤ 5 但 2/3 pair_pass=false 实证 → 不改 rubric 凑 pair_pass,改 SKILL.md / bootstrap 字面对齐
  - **P-8**(§3.X plan writing playbook 段):"Task BLOCKED 修订决策树" 子段 — 选项 A(改架构 = 扩 SKILL_NAMES + 新建独立 skill)vs 选项 B(复用现有架构 = merge 进现有 yaml);**选 B preferred 保 plan-9 序列 atomic**(plan-9h Task 4 v1.2 修订选 B 实证;沿 plan-9e2 v3 修订模式)
- **A 组全 docs 改动,无代码 / schema / fence / CLI behavior 改动**

### plan-9z polish B 组层(forge-eval 收尾)

- `.claude/skills/subagent-driven-discipline/SKILL.md` §"Main Agent STOP Triggers" 5 触发表加第 6 行(P-1):cross-ref 到 `commands/apply.md` 步骤 0 + `forge preflight branch-check` 命令字面(plan-9h Task 4 concern α 消化)
- `forge-eval/scenarios/main-agent-stop.yaml` `stop-on-repeat-failure` scenario(P-2):
  - 收紧 `must_not_match` regex:从 `(直接\s*再派|再试一次|换个\s*model\s*再派)` → 行为锚 `(?:好的|那就|可以).{0,20}(再派|再试)` 或 `Use Task tool with .* sonnet`(具体 regex 字面在 Task 5 实施时收敛)
  - judge_rubric 判分锚点段加显式声明:"must_not_match 不针对 AI 复述用户原话场景"
- `pnpm eval:skill subagent-driven-development` 重跑 baseline,验:
  - **`branch-protection` scenario pair_pass=true**(P-1 cross-ref 字面落地后,GREEN AI 看到 `forge preflight branch-check` 命令字面 → judge 评分 > RED + delta ≥ 1.5)
  - **`stop-on-repeat-failure` scenario pair_pass=true**(P-2 regex 收紧后,must_not_match 不再误中 AI 复述用户原话 → judge=9 + delta ≥ 1.5)
  - 第 3 scenario `critical-plan-review` 保持 pair_pass=true(回归保护)
- plan-9h Task 4 状态从 DONE_WITH_CONCERNS → DONE(2 concerns 消化)

### Verify + 跨平台

- 全本地 verify 通过:`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run`(memory `feedback-local-verification-format` 不变量,必须含 `format:check`)
- 跨 OS CI(Linux + Windows × Node 20/22)全绿(沿 plan-9h Task 5 模式)
- **fence-9.2 flaky timeout**:若 verify 跑复现,顺手修(P-3);若未复现,延 plan-v1.1

### 版本号 + publish

- 选项 A 一次性 v1.0.0(沿 brainstorm Section 4 用户授权)
- `package.json` `version` 字段 `0.4.0` → `1.0.0`
- git tag `v1.0.0` 打在 release commit 上(Task 6 commit)
- `pnpm publish` **由用户手动授权触发**(不在 Task 6 自动跑);本 plan 准备 publish dry-run 验包内容清单

### Codex 收敛 + Retrospect

- release docs(release-gate / CHANGELOG)production review:**建议外部 codex review 一轮**(plan-9h Pattern S 教训:自我 review 是同源审查盲点)— 可作为 Task 6 子步,**用户授权决定**;沿 P-4 外部 review 同理
- final review Approved
- 综合 retrospect Q1-Q6(Task 6 收尾时填写;**重点 Q4-Q6**:v1.0 fusion completion 整体回顾 + sub-plan-z polish 9 工作单整合体验 + 沉淀 Case 09 到 subagent-driven-discipline SKILL.md §5 若有新模式)

### 接口零侵入 verify

- 本 plan **不动** master §3.12 接口冻结(无新 schema / 新 CLI exit code / 新 ack-log action enum)
- 本 plan **不动** 任何 src/core/ 代码(除 init.ts:38 文本)
- 本 plan **不动** 任何 forge-eval scenario 字面**除** main-agent-stop.yaml stop-on-repeat-failure(P-2)

### Master plan 更新

- `docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` §0 sub-plan table line 34 `plan-9z` 链接日期更新(指向本 plan 文件)
- master plan §3.11 段标 "DONE" + 链接 commit hash(Task 6 commit)
- master plan §6 修订记录加 v1.0 → v1.0.0 release 记录(沿 v0.4 / v0.3 模式)

---

## 0. 文档状态声明 + 中间路线 B 决策 + Scope-out 备忘录

### 0.1 本 plan 实施完成前的代码状态(brainstorm freeze 时 dev HEAD = de32baa)

- 分支:`dev` clean,sync origin/dev
- HEAD:`de32baa fix(9h Task 5 review): Case 08 + §9 字面补 flaky timeout 注记 + M-1/M-2 polish`
- plan-9a 到 plan-9j 全 sub-plan 已合 dev(跨 OS CI 全绿验证)
- 9 sub-plan 累积 commit ~ 60+(从 9a baseline `8d62acb` 到 9h 末态 `de32baa`)
- `forge-eval/scenarios/main-agent-stop.yaml` 已存在(plan-9h Task 4 落地,DONE_WITH_CONCERNS 状态)
- `forge-eval/scenarios/main-agent-stop.yaml` 当前状态:3 scenario,`critical-plan-review` pair_pass=true / `branch-protection` pair_pass=false(P-1 待修)/ `stop-on-repeat-failure` pair_pass=false(P-2 待修)

### 0.2 中间路线 B 决策汇总(沿 brainstorm Section 1-6 inline §0 模式)

| Q | 决策 | Why |
|---|---|---|
| **Q1**:走 SDD 完整流程(brainstorm + writing-plans + dispatch implementer + 三轮 self-review)还是中间路线 B 还是纯 inline? | **B 中间路线** | docs-heavy + 已知路径 + 风险低;不需要 brainstorm 探索(scope 在 master §3.11 + memory polish 工作单已明确)+ 不需要 implementer dispatch(纯字面 docs 改动,inline 完全可行);仍需 sub-plan doc 留 audit trail |
| **Q2**:版本号 v1.0.0 还是其他?(master §0 选项 A/B/C) | **选项 A 一次性 v1.0.0** | 9a-9j 全 DONE,直接 release;B/C 拆 alpha/rc 适用"开发到一半启动 release",不适用本场景 |
| **Q3**:P-4 codex auth 恢复 + plan-9h 末态外部 codex review? | **codex auth 已恢复**(用户已确认),plan-9h 末态外部 review **可选**,作为 Task 6 子步 — release docs(CHANGELOG / release-gate)外部 review 也可一并跑(plan-9h Pattern S 教训:外部 review 是 first-choice 非 last-resort) | 用户授权;不强制,但推荐做 release docs 外部 review |
| **Q4**:P-3 fence-9.2 flaky timeout / P-9 git utils 抽出 scope-in 还是延 plan-v1.1? | **都延 plan-v1.1**(scope-out) | P-3 性质本征 flaky(plan-9h 末态 verify 跑 24.39s 未复现),plan-9z verify 跑若复现顺手修否则延期;P-9 是 YAGNI(单点 inline,延 v1.1 2+ 复用点) |
| **Q5**:版本号 bump 在 Task 6 还是更早? | **Task 6**(最后) | Task 1-5 完成 + verify 全过后才 bump,避免误发未完成版本 |
| **Q6**:Task 6 publish 自动还是用户授权? | **用户授权手动触发** | npm publish 是高 blast radius 操作(发出去无法收回),沿 CLAUDE.md "对环境有影响的事先与用户确认" |
| **Q7**:plan-9h Task 4 状态从 DONE_WITH_CONCERNS → DONE 标在哪? | **本 plan §11 Retrospect Q1 文字描述 + master plan §0 plan-9h 链接旁加 DONE-WITH-CONCERNS-RESOLVED-BY-9z 注脚** | plan-9h 文档不动(避免回头改已 DONE plan);状态转移由 master plan + plan-9z Retrospect 文字描述 P-1/P-2 消化路径承担 |

### 0.3 Scope-out 备忘录

**明确不在 plan-9z scope**:
- **P-3 fence-9.2 flaky timeout**(`tests/cli/process-evidence-fence.test.ts > fence-9.2 minimal record-tdd` 5000ms 偶发)— 延 plan-v1.1;Task 6 verify 跑若复现顺手修
- **P-9 `src/core/git/utils.ts` 抽出**(`getCurrentBranch` / `isGitRepo` 共享 helper)— YAGNI 延 plan-v1.1 2+ 复用点;v1.1 抽 helper 时一并 refactor `src/core/migrate/index.ts:65-72` inline 探测
- **init.ts 实际 removal**(目前只改 warning 文本)— 留 v1.2 plan
- **新 schema / 新 CLI / 新 fence / 新 marker 字段** — 接口冻结(master §3.12)
- **plan-9h 文档回头改**(Task 4 状态从 DONE_WITH_CONCERNS 改 DONE)— 不动,本 plan §11 Retrospect 文字描述

### 0.4 与 plan-9h Task 4 forge-eval scenarios 的 dependency 确认

- `forge-eval/scenarios/main-agent-stop.yaml` 当前 3 scenario(critical-plan-review / branch-protection / stop-on-repeat-failure),plan-9h Task 4 落地
- **本 plan Task 5 不动 critical-plan-review scenario**(回归保护)+ 不动 `forge-eval/runner/` 基础设施 + 不扩 SKILL_NAMES 数组(沿 plan-9h Task 4 v1.2 选项 B 复用现有架构决策)
- Task 5 baseline 重跑预期成本:~$0.3-0.5(3 scenario × 双轨 = 6 LLM 调用,沿 plan-9h Task 4 实测规模)

### 0.5 Pattern A 教训沿用(plan-9j v3 + plan-9g v6 + plan-9e2 v3 + plan-9h)

- Pattern A:**字面真改,不留 implementer 自补**(plan-9j v3 BLOCKER 4 REGRESSION 教训)
- 本 plan Task 4(polish A 组)字面补完整 docs 改动文本(不只声明"在 SKILL.md 加 Pattern O 段",而是给出**完整字面**),实施者直接复制粘贴
- 本 plan Task 5(polish B 组)字面补 P-2 regex 完整字面(收敛在 Task 5 实施步)

---

## 1. File Structure

**本 plan 改动文件清单**(沿 v0.4 plan-8 / plan-9j / plan-9h File Structure 模式):

### 新建文件

- 无(本 plan docs-heavy,所有改动在现有文件追加 / 修改)

### 修改文件

| 文件 | 改动 | 行变化 | 触发 Task |
|---|---|---|---|
| `docs/release-gate-checklist.md` | 末尾追加 §5 v1.0 fusion completion 发布门(6 子段) | +60 ~ +80 行 | Task 1 |
| `CHANGELOG.md` | `[Unreleased]` 后插 `[1.0.0]` 段 | +80 ~ +100 行 | Task 2 |
| `src/cli/commands/init.ts` | line 38 warning 文本 "v0.4" → "v1.2" | 1 行改 | Task 3 |
| `.claude/skills/writing-skills/SKILL.md` | Pattern O(警示)+ Pattern P(rubric 设计原则段)+ Pattern R(硬 trigger) | +30 ~ +50 行 | Task 4 |
| `.claude/skills/writing-skills/forge-eval-integration.md` | Pattern Q(判分锚点段示例)+ P-7(must_not_match 边界子段) | +20 ~ +30 行 | Task 4 |
| `.claude/skills/subagent-driven-discipline/SKILL.md` | P-5(implementer external verify)+ P-6(rubric 软度 vs 验证强度)+ P-8(Task BLOCKED 修订决策树)+ P-1(STOP Triggers 第 6 行 cross-ref) | +40 ~ +60 行 | Task 4 + Task 5 |
| `forge-eval/scenarios/main-agent-stop.yaml` | `stop-on-repeat-failure` scenario must_not_match regex 收紧 + 判分锚点段补 | 5 ~ 10 行改 | Task 5 |
| `package.json` | `version` 字段 "0.4.0" → "1.0.0" | 1 行改 | Task 6 |
| `docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` | §0 line 34 plan-9z 链接日期更新 + §3.11 标 DONE + §6 修订记录加 v1.0.0 release | +5 ~ +10 行 | Task 6 |

### 不修改文件(接口冻结)

- 任何 `src/core/markers/types.ts` / `src/core/schemas/*` / `src/core/archive/*` / `src/core/validate/*`(master §3.12.1 / §3.12.1bis schema 冻结)
- 任何 `src/cli/commands/*` 除 `init.ts:38` 文本
- 任何 `commands/*.md` / `src/core/templates/commands/*.md`(plan-9h 已稳定)
- 任何 `tests/*`(无新 test;Task 5 baseline 重跑是 forge-eval 不是 vitest)
- `forge-eval/runner/*`(基础设施冻结)
- `.claude/skills/subagent-driven-development/SKILL.md`(plan-9h Task 3 已稳定;**注意本 plan 改的是 `subagent-driven-discipline` 即 forge 内置 skill,不是 `subagent-driven-development` 即 upstream superpowers**)

---

## 2. Task 1 — release-gate-checklist § v1.0 段

**Goal**:`docs/release-gate-checklist.md` 末尾追加 §5 v1.0 fusion completion 发布门段,沿 v0.4 §4 模板字面 6 子段。

**P50 工日**:0.15 / **P90 工日**:0.2

### Step 1.1: 读 v0.4 §4 段拿格式 reference

- [ ] `Read docs/release-gate-checklist.md offset 215 limit 41`(v0.4 §4 全段 line 215-254;6 子段:§4.1 代码 + 测验证 / §4.2 端到端手测 / §4.3 兼容性 / §4.4 文档完整 / §4.5 npm 包 / §4.6 plugin 形态)

### Step 1.2: 写 § v1.0 段(沿 v0.4 模板)

- [ ] 在 `docs/release-gate-checklist.md` 末尾(EOF 后)追加:
  ```markdown
  ## §5 v1.0 fusion completion 发布门(2026-05-14)

  本段沿 §4 v0.4 模板,验 plan-9z release(plan-9a 到 plan-9j 9 sub-plan 累积 + plan-9z polish 9 工作单消化)。

  ### §5.1 代码 + 测验证

  - [ ] `pnpm format:check` 0 error
  - [ ] `pnpm lint` 0 error
  - [ ] `pnpm typecheck` 0 error
  - [ ] `pnpm test` 全 PASS;含 9a 横切 + 9b out-of-scope + 9c fluid-pause + 9d verify-three-dimensions + 9e archive-soft-warning + 9f explore + 9g process_evidence + 9h SDD + 9i writing-skills + 9j marker-deprecation 全部 test 模块
  - [ ] `pnpm build` 0 error;`dist/cli/index.js` 可调起:
    - `forge --help` 列出所有 9 sub-plan 引入的子命令
    - `forge preflight branch-check --help`(plan-9h)
    - `forge ack --help`(plan-9a)
    - `forge verify --help`(plan-9d)
    - `forge upgrade --resign-markers --help`(plan-9j)
    - `forge explore --help`(plan-9f,若 9f 引入 CLI 入口)
  - [ ] `forge-eval` baseline 跑 main-agent-stop.yaml 3 scenario 全 pair_pass=true(plan-9z Task 5 消化)

  ### §5.2 端到端手测

  - [ ] `forge init` 在新目录创建 forge 工作树(verify init.ts:38 warning 文本含 "v1.2" 字样)
  - [ ] `forge migrate openspec/superpowers` 仍可用(plan-8/v0.4 兼容性)
  - [ ] `forge ack propose/confirm/reject` 三子命令协议跑通(plan-9a)
  - [ ] `forge upgrade --resign-markers <changeId>` 在 v0.4 marker 上跑通(plan-9j)
  - [ ] `forge verify` LLM-judge 路径跑通(plan-9d;可选,需 ANTHROPIC_API_KEY)
  - [ ] `forge archive <changeId>` 全 13 不变量校验 + handoff_to_backlog(plan-9e)

  ### §5.3 兼容性

  - [ ] v0.4 native marker(无 `created_by_tool_version` / 无 `legacy=true`)走 strict path 不被 9j legacy-exemption 拦
  - [ ] v0.2 fixture(brownfield 路径)仍跑通(spec §5.1 v3 兼容性约束)
  - [ ] `forge upgrade`(v0.2 → v0.3 → v0.4 → v1.0)仍跑通

  ### §5.4 文档完整

  - [ ] README 主页含 v1.0 fusion completion 主题描述(若需要)+ 链接 design v3
  - [ ] `docs/specs/2026-05-10-v1.0-fusion-completion-design.md` v3 commit 在 docs/specs/(已 commit)
  - [ ] 9 sub-plan 文件(plan-9a 到 plan-9j)+ master plan + plan-9z(本文件)全在 `docs/plans/`
  - [ ] `CHANGELOG.md` `[1.0.0]` 段写完(本 plan Task 2)
  - [ ] `.claude/skills/writing-skills/SKILL.md` + `forge-eval-integration.md` + `subagent-driven-discipline/SKILL.md` 含 plan-9z polish 协议升级(本 plan Task 4 / Task 5)

  ### §5.5 npm 包

  - [ ] `package.json` `version` = `1.0.0`;`bin` 字段保 `forge`
  - [ ] `pnpm pack` 产 tarball;解压检查:
    - `dist/cli/index.js` 在
    - `dist/cli/commands/preflight.js`(plan-9h)+ `dist/cli/commands/ack.js`(plan-9a)+ `dist/cli/commands/verify.js`(plan-9d)+ `dist/cli/commands/upgrade.js` 含 `--resign-markers`(plan-9j)
    - bundled `src/core/templates/` 含 9c/9g/9h apply.md + 9h SDD SKILL.md + 9i writing-skills/SKILL.md 反向同步内容
  - [ ] `pnpm publish --dry-run` 验包内文件清单(forge-repo files 字段)

  ### §5.6 plugin 形态(若同步发 plugin)

  - [ ] bundled plugin tarball(若发):dist/cli/commands/ 含全部 9 sub-plan 子命令
  - [ ] `commands/preflight.md` / `commands/ack.md` / `commands/verify.md` / `commands/upgrade.md` / `commands/archive.md` / `commands/explore.md`(若 9f 引入)plugin slash 命令对齐 CLI 子命令
  - [ ] `.claude/skills/writing-skills/` + `.claude/skills/subagent-driven-discipline/` 全 skill bundled(plan-9z polish 协议升级后内容)

  ### §5.7 plan-9z polish 9 工作单消化 verify

  - [ ] **P-1**(plan-9h Task 4 concern α):`.claude/skills/subagent-driven-discipline/SKILL.md` §"Main Agent STOP Triggers" 第 6 行 cross-ref `forge preflight branch-check` 字面在
  - [ ] **P-2**(plan-9h Task 4 concern β):`forge-eval/scenarios/main-agent-stop.yaml` `stop-on-repeat-failure` must_not_match regex 收紧 + 判分锚点段补
  - [ ] **Pattern O**:`.claude/skills/writing-skills/SKILL.md` 步骤 1 含 "registry + scenarios + 骨架一起 commit" 警示
  - [ ] **Pattern P**:`.claude/skills/writing-skills/SKILL.md` 步骤 1 含 "rubric 设计原则" 段
  - [ ] **Pattern Q**:`.claude/skills/writing-skills/forge-eval-integration.md` 含 "判分锚点段示例"
  - [ ] **Pattern R**:`.claude/skills/writing-skills/SKILL.md` 步骤 1 含 "RED avg > 5 立即 REFACTOR" 硬 trigger
  - [ ] **P-5**:`.claude/skills/subagent-driven-discipline/SKILL.md` §2.1 含 "external protocol assumption verify"
  - [ ] **P-6**:`.claude/skills/subagent-driven-discipline/SKILL.md` §3.X 含 "rubric 软度 vs 验证强度"
  - [ ] **P-7**:`.claude/skills/writing-skills/forge-eval-integration.md` 含 "must_not_match 引用 vs 行为边界" 子段
  - [ ] **P-8**:`.claude/skills/subagent-driven-discipline/SKILL.md` §3.X 含 "Task BLOCKED 修订决策树"
  - [ ] **P-3**(scope-out 延 v1.1):若 §5.1 verify 跑复现 fence-9.2 timeout 顺手修;未复现延 v1.1
  - [ ] **P-9**(scope-out 延 v1.1):`src/core/git/utils.ts` 抽出留 v1.1

  ### v1.0 release 阻塞门禁

  以上 §5.1-§5.7 全勾 + 跨 OS CI 全绿 → 阻塞解除,maintainer 可触发 `pnpm publish`。
  ```
- [ ] 不动现有 §1-§4 段

### Step 1.3: 全本地 verify(Task 1 完成前 mandatory)

- [ ] `pnpm format:check`(prettier 应通过,sub-plan doc 不影响 prettier;本 plan 改的是 docs/release-gate-checklist.md,prettier 应忽略或通过)
- [ ] 若 prettier 报 release-gate-checklist.md 格式错,跑 `pnpm format` 自动修

### Step 1.4: commit Task 1

- [ ] `git add docs/release-gate-checklist.md docs/plans/2026-05-14-plan-9z-release.md`
- [ ] commit message(heredoc):
  ```
  docs(9z Task 1): release-gate-checklist § v1.0 fusion completion 发布门段

  沿 §4 v0.4 模板加 §5 v1.0 段(7 子段:代码 + 测验证 / 端测 /
  兼容 / 文档 / npm / plugin / polish 9 工作单 verify)。
  含 plan-9z polish 9 工作单(P-1/P-2 + 4 patterns O/P/Q/R + P-5~P-8)
  消化 checkbox + P-3/P-9 scope-out 延 v1.1 标注。
  ```

---

## 3. Task 2 — CHANGELOG v1.0.0 段

**Goal**:`CHANGELOG.md` `[Unreleased]` 后插入 `[1.0.0]` 段(沿 v0.4 / v0.3 段格式)。

**P50 工日**:0.2 / **P90 工日**:0.3

### Step 2.1: 读 v0.4 段拿格式 reference

- [ ] `Read CHANGELOG.md offset 11 limit 56`(v0.4 段 line 11-66,5 子段:Major changes / Added by CLI/Core/Tests+Docs / Changed / Fixed / Acknowledgments)

### Step 2.2: 写 [1.0.0] 段

- [ ] 在 `CHANGELOG.md` line 9 `(暂无)` 后插入 `[1.0.0]` 段:
  ```markdown
  ## [1.0.0] - 2026-05-XX(plan-9z 完成后填具体发布日期)

  ### Major changes — v1.0 fusion completion(9 sub-plan 累积 + plan-9z polish)

  v1.0 标志 forge fusion 真正达成产品定位 — OpenSpec UX 哲学全恢复 + superpowers process discipline 反向覆盖修复。9 sub-plan 9 子模块单议题深做:

  37. **三级 severity 分级 + critical_candidate 协议 + JCS finding_hash + ack 两步协议**(plan-9a):横切层基础,CLI helper 框架,Severity / Finding 类型,`forge ack propose/confirm/reject` 三子命令
  38. **out-of-scope 协议 + scope-entries fence**(plan-9b):3 类 out-of-scope/non-goal/future-work,三 skill(exploring/receiving-code-review/verifying-three-dimensions)区分指引
  39. **Fluid Pause Decision Point**(plan-9c):`commands/apply.md` 加 §"Fluid Pause" 段,pause_decisions marker schema + 三类 pause 模式
  40. **verify 三维(syntax / semantic / process)+ LLM-judge 集成**(plan-9d):`forge verify` CLI + LLM-judge 路径,verify-findings marker schema
  41. **archive 三级 fence + handoff_to_backlog**(plan-9e1/9e2):archive_summary marker schema 9 业务字段,三级 fence(critical-硬墙 / warning-ack / suggestion-soft),handoff_to_backlog 三类 input 聚合
  42. **forge:exploring skill + /forge:explore 命令**(plan-9f):新 skill + slash 命令 + forge-eval scenario 双轨 baseline 验证
  43. **process_evidence 14 不变量 + worktree 重跑 + reporter parsing**(plan-9g):process_evidence marker schema + git ancestor 不变量 + reporter parser
  44. **SDD 实施前置纪律加固**(plan-9h):`forge preflight branch-check` CLI + `commands/apply.md` Critical Plan Review 4 维 + §"Main Agent STOP Triggers" 5 触发表
  45. **forge:writing-skills 协议 + forge-eval-integration 协议**(plan-9i):新 skill 开发前提,baseline AI 评估 + scenario 双轨 + pair_pass 验证
  46. **marker version + deprecation 完整协议**(plan-9j):`created_by_tool_version` + `resigned_by_tool_version` semver 字段,`forge upgrade --resign-markers` option,legacy 精确豁免表(13 不变量)+ version retrograde fence

  **plan-9z polish 9 工作单消化**(plan-9f / plan-9h 累积 retrospect 沉淀的协议升级):

  - **Pattern O/P/Q/R**(plan-9f 4 缺口):`.claude/skills/writing-skills/SKILL.md` + `forge-eval-integration.md` 加 registry+scenarios 一起 commit 警示 + rubric 设计原则 + 判分锚点段示例 + RED > 5 硬 trigger
  - **P-1/P-2**(plan-9h Task 4 2 concerns):SDD SKILL.md §"Main Agent STOP Triggers" 加 forge preflight branch-check cross-ref + forge-eval stop-on-repeat-failure regex 收紧 + 判分锚点段补
  - **P-5/P-6/P-7/P-8**:subagent-driven-discipline SKILL.md + forge-eval-integration.md 加 external verify / rubric 软度 vs 验证强度 / must_not_match 边界 / Task BLOCKED 修订决策树
  - **P-3/P-9 延 v1.1**:fence-9.2 flaky timeout(性质本征,plan-9z verify 跑未复现)+ git utils 抽出(YAGNI)

  ### Added — CLI(plan-9a/9d/9h/9j)

  - `forge ack` 三子命令(propose/confirm/reject)+ ack-log.jsonl schema(plan-9a)
  - `forge verify` LLM-judge 路径 + verify-findings marker(plan-9d)
  - `forge preflight branch-check [<change-id>] [--allow-protected-branch]`(plan-9h)
  - `forge upgrade --resign-markers <changeId>` option(plan-9j)
  - `forge explore` slash 命令 + skill 入口(plan-9f)

  ### Added — Core(plan-9a/9b/9c/9d/9e/9f/9g/9h/9i/9j)

  - `src/core/schemas/severity.ts`(9a Severity / Finding 接口 + JCS hash)
  - `src/core/archive/three-level-fence.ts`(9e critical-硬墙 / warning-ack / suggestion-soft)
  - `src/core/archive/handoff-to-backlog.ts`(9e 三类 input 聚合)
  - `src/core/archive/legacy-exemption.ts`(9j 13 不变量精确豁免表)
  - `src/core/archive/version-retrograde-fence.ts`(9j git history 检查)
  - `src/core/process-evidence/*`(9g 14 不变量 + worktree 重跑 + reporter parsing)
  - `src/core/markers/types.ts` 扩 4 marker(verify-findings / review-passed / pause-decisions / archive-summary)+ 加 `created_by_tool_version?` + `resigned_by_tool_version?` 字段(9j)
  - `src/core/schema/types.ts` `ForgeConfig` 加 `protected_branches?: string[]` 字段(9h)

  ### Added — Skills + Templates(plan-9f/9h/9i)

  - `.claude/skills/exploring/SKILL.md`(9f 新 skill)
  - `.claude/skills/writing-skills/SKILL.md` + `forge-eval-integration.md`(9i 新 skill + 配套文件)
  - `.claude/skills/subagent-driven-discipline/SKILL.md` §"Main Agent STOP Triggers" 5 触发表(9h)
  - `.claude/skills/subagent-driven-development/SKILL.md` § "plan-9h 新增" 子段(9h 反向同步)
  - `forge-eval/scenarios/main-agent-stop.yaml`(9h 3 scenario)+ `exploring.yaml`(9f)+ 其他 9i 落地 scenarios

  ### Added — Tests + Docs(plan-9a 到 plan-9j 累积)

  - `tests/cli/preflight.test.ts`(9h)+ `tests/cli/ack.test.ts`(9a)+ `tests/cli/verify.test.ts`(9d)+ `tests/cli/upgrade.test.ts`(9j)
  - `tests/integration/apply-md-sync.test.ts`(9h)+ archive-md-sync / explore-md-sync(9e/9f)
  - 各 sub-plan 实施 + 测覆盖 ~100+ 新 vitest case 累积
  - 9 sub-plan 文件(`docs/plans/2026-05-10-plan-9*.md` 到 `2026-05-14-plan-9h-sdd-discipline.md`)+ master plan + plan-9z(本文件)
  - design v3 `docs/specs/2026-05-10-v1.0-fusion-completion-design.md` 1892 行 5+ 轮 codex 审查修订

  ### Changed

  - `src/cli/commands/init.ts:38` warning 文本 "v0.4" → "v1.2"(B-7 修订;实际 init removal 留 v1.2)
  - `commands/apply.md` 加步骤 0(preflight 调用,9h)+ 步骤 3.5(Critical Plan Review 4 维,9h)+ §"Fluid Pause"(9c)+ §"禁止行为(9g)"(9g)+ §"禁止行为(9h)"(9h)
  - `src/core/archive/archive.ts` 加 3.4 步(9j legacy + retrograde fence)+ 3.5 步(9e 三级 fence)
  - `package.json` `version` "0.4.0" → "1.0.0"

  ### Fixed — codex 累计 5+ 轮 review 修订(跨 9 sub-plan 共 200+ 条问题全采纳)

  - plan-9a v1→v4:横切层 BLOCKER + MAJOR 全修
  - plan-9b v1→v2:三 skill 区分指引接口 + adapter 部署链
  - plan-9c v1→v3:Fluid Pause Decision Point + pause_decisions marker schema
  - plan-9d v1→v5:LLM-judge 集成 + verify-findings fence
  - plan-9e1 v1→v12:archive 三级 fence + 选项 C cross-plan reflection(C 简码硬墙 → 9j --resign-markers 唯一合规出口)
  - plan-9e2 v1→v3:process_evidence 集成 + 9g 依赖
  - plan-9f v1→v3:exploring skill + forge-eval scenarios 双轨(沉淀 Pattern O/P/Q/R)
  - plan-9g v1→v8:process_evidence 14 不变量(v6 brainstorm Codex BLOCKER #2 加 #14 green↞HEAD ancestor)
  - plan-9h v1→v5:SDD 实施前置纪律(沉淀 Pattern S/T/U + Case 08)+ Task 4 DONE_WITH_CONCERNS(P-1/P-2 plan-9z polish 消化)
  - plan-9i v1→v2:forge:writing-skills 协议 + bootstrap inject SKILL.md
  - plan-9j v1→v9:marker version + deprecation(v9 codex 8 轮 review 0 BLOCKER + 2 MAJOR 部分采纳)

  ### Acknowledgments

  设计经 codex 对抗性审查累计 5+ 轮(跨 9 sub-plan)+ Opus subagent 自检 multi-round + plan-9z 收尾 inline 实施,共修 200+ 条问题。完整修订链:

  - master plan v1 → v9(`docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` §6 修订记录)
  - design v3 commit `b823f6e`(`docs/specs/2026-05-10-v1.0-fusion-completion-design.md`)
  - 各 sub-plan 文件含独立 vN → vN+1 修订段
  - plan-9z polish(本 plan)消化 plan-9f / plan-9h 累积 retrospect 9 工作单

  完整 spec:[`docs/specs/2026-05-10-v1.0-fusion-completion-design.md`](docs/specs/2026-05-10-v1.0-fusion-completion-design.md)。
  完整 plan 链:[`docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md`](docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md) + plan-9a..9j + plan-9z。
  ```
- [ ] 字面**精确版本号 / 内容**在 Task 2 实施时 inline 收敛(本 plan §3 模板字面已较完整,实施者可直接用作 baseline 微调)
- [ ] 不动现有 `[0.4.0]` / `[0.3.0]` / `[0.2.0]` / `[0.1.0]` 段

### Step 2.3: 全本地 verify(Task 2 完成前 mandatory)

- [ ] `pnpm format:check`(CHANGELOG.md 应通过)
- [ ] 若 prettier 报错,跑 `pnpm format` 自动修

### Step 2.4: commit Task 2

- [ ] `git add CHANGELOG.md`
- [ ] commit message(heredoc):
  ```
  docs(9z Task 2): CHANGELOG [1.0.0] 段 — v1.0 fusion completion 累积

  9 sub-plan(9a-9j)子模块概要 + plan-9z polish 9 工作单消化记录 +
  codex 累计 5+ 轮 review 200+ 条问题修订记录。

  发布日期 2026-05-XX 待 Task 6 publish 时确定。
  ```

---

## 4. Task 3 — init.ts:38 warning 文本更新(B-7)

**Goal**:`src/cli/commands/init.ts:38` warning 文本 "v0.4" → "v1.2"。

**P50 工日**:0.05 / **P90 工日**:0.1

### Step 3.1: 读 init.ts:38 现状

- [ ] `Read src/cli/commands/init.ts offset 30 limit 20`(验 line 38 真有 "v0.4" 字样)

### Step 3.2: 改 line 38 文本

- [ ] `Edit src/cli/commands/init.ts`:`old_string="v0.4"` → `new_string="v1.2"`(precise,确保 unique match)
- [ ] 若 line 38 不只一处 v0.4 / 上下文需要更精确,扩 old_string 含周边文本(沿 Edit 工具 uniqueness 约束)

### Step 3.3: 全本地 verify(Task 3 完成前 mandatory)

- [ ] `pnpm typecheck`(init.ts 改 1 行不应破坏 typecheck)
- [ ] `pnpm test tests/cli/init.test.ts`(若有该 test 文件,验 warning 文本断言;若断言 "v0.4" 需同步改)
- [ ] `pnpm format:check`

### Step 3.4: commit Task 3

- [ ] `git add src/cli/commands/init.ts` + 可能含 `tests/cli/init.test.ts`(若需同步改断言)
- [ ] commit message:
  ```
  fix(9z Task 3 / B-7): init.ts:38 warning 文本 v0.4 → v1.2

  实际 init removal 留 v1.2 plan;本 commit 仅做文本预告对齐
  master plan §3.11 B-7 修订。
  ```

---

## 5. Task 4 — plan-9z polish A 组(plan-9i 协议 4 patterns + P-5~P-8)

**Goal**:`.claude/skills/writing-skills/SKILL.md` + `forge-eval-integration.md` + `subagent-driven-discipline/SKILL.md` 字面追加协议升级段(纯 docs 改动)。

**P50 工日**:0.25 / **P90 工日**:0.35

### Step 4.1: 读现状文件结构

- [ ] `Read .claude/skills/writing-skills/SKILL.md`(找步骤 1 段 line 45-60 区域,Pattern O/P/R 注入位置)
- [ ] `Read .claude/skills/writing-skills/forge-eval-integration.md`(找 rubric 模板段,Pattern Q + P-7 注入位置)
- [ ] `Read .claude/skills/subagent-driven-discipline/SKILL.md`(找 §2.1 implementer prompt 段 + §3.X plan writing playbook 段,P-5/P-6/P-8 注入位置)
- [ ] 三个文件结构 grep:`Grep "^## |^### " <file>` 拿 outline

### Step 4.2: 应用 Pattern O / P / R(`.claude/skills/writing-skills/SKILL.md`)

- [ ] Pattern O:在步骤 1 line 47 附近找合适位置(可能在 "registry 扩展" 子项或独立 NOTE 块),加字面警示:
  ```
  > **NOTE(Pattern O — plan-9f / plan-9i 实证)**:registry 扩展 + scenarios 落地 + 最小骨架代码必须**一起 commit**(vitest GREEN baseline 同 commit),分开 commit 会触发 `forge-eval` runner `it.each` ENOENT(因 runner 1:1 yaml→test 加载)。
  ```
- [ ] Pattern P:在步骤 1 "rubric 设计" 或同等位置加段:
  ```
  ### Pattern P — rubric 维度权重设计原则

  每个维度问 "baseline AI 能否在没本 skill 时做对":
  - 能做对 → 该维度**权重低**(否则即使 RED 也 PASS,假性 GREEN);
  - 做不对 → 该维度**权重高**(forge-specific 维度高权重 = baseline AI 必然失分锚点)。

  反例:plan-9f v1 scenario 1/3 pair_pass 假性 GREEN(option-compare skeleton GREEN=8.0)— baseline AI 早能写 option-compare,该维度不应作为高权重锚点。
  ```
- [ ] Pattern R:在步骤 1 line 53 附近(forge-eval 跑完后的 review 段)加硬 trigger:
  ```
  > **HARD TRIGGER(Pattern R — plan-9f v1 vague-idea RED 6.0 实证)**:若总览表**任一 scenario RED avg > 5** → **立即 REFACTOR scenarios(不是 SKILL.md)**:提升 forge-specific 维度权重 / 收紧 judge rubric / 加 must_not_match / 加判分锚点段;再跑 baseline 直到所有 RED ≤ 5。
  > **不响应 RED > 5 → forge-eval 验证强度失效**(走形)。
  ```
- [ ] **三处 Pattern 字面在 Task 4 实施时 inline 收敛**(本 plan 模板已给较完整文本,实施者直接用作 baseline)

### Step 4.3: 应用 Pattern Q + P-7(`.claude/skills/writing-skills/forge-eval-integration.md`)

- [ ] Pattern Q:在 rubric 模板段(或同等位置)加 "判分锚点段示例":
  ```
  ### Pattern Q — judge_rubric 判分锚点段示例

  每个 scenario 的 judge_rubric 必须含**判分锚点**段,显式声明三件事:

  1. **不评估什么**:声明 judge 不该扣分的维度(防 judge LLM 把 baseline 技术解答误判 "答非所问")
  2. **baseline 预期失败模式**:声明 RED 应在哪个具体维度失分(防假性 GREEN)
  3. **按维度逐项判分**:judge 必须对每个 rubric 维度独立打分,而非综合印象分

  反例:plan-9f v1 scenario 2(OAuth)judge LLM 把 baseline AI 给 OAuth 技术解答判 "答非所问" 扣分 — 应是 RED 信号(技术解答恰是 baseline 不该做的方向)而非加分。
  ```
- [ ] P-7:在 Pattern Q 段下加 "must_not_match 引用 vs 行为边界" 子段:
  ```
  #### P-7 — must_not_match 引用 vs 行为边界

  must_not_match regex **锚行为**(`Use Task tool with .* sonnet` / `派 sonnet 再试` 等 dispatch action 字面)**而非引用短语**(`再试一次` / `换个 model` 等可能出现在 AI 复述用户原话的位置)。

  判分锚点段需显式声明:"must_not_match regex **不针对 AI 复述用户原话** 场景"。

  反例:plan-9h Task 4 `stop-on-repeat-failure` scenario must_not_match `(直接\s*再派|再试一次|换个\s*model\s*再派)` 误中 AI 复述用户提议 "用户说要再试一次" 的合规对话片段 — pair_pass=false 假性 RED 信号。
  ```

### Step 4.4: 应用 P-5 / P-6 / P-8(`.claude/skills/subagent-driven-discipline/SKILL.md`)

- [ ] P-5:在 §2.1 implementer prompt 段(或 dispatching-subagents 段)加 "external protocol assumption verify" 子段:
  ```
  #### P-5 — external protocol assumption verify(plan-9h Task 4 实证)

  Dispatch implementer 第一步**不是开始实施**,而是 grep / read 实际项目代码验证 plan 字面陈述与外部系统约束是否一致:

  - forge-eval runner 1:1 yaml 约束(`forge-eval/runner/registry.ts` SKILL_NAMES 数组实际 union)
  - build script(`scripts/build.ts` 实际 stages + reverse-sync 行为)
  - 其他外部协议(`commands/apply.md` step 顺序 / SKILL.md cross-ref / 现有 fence schema)

  Plan 字面是设计**意图**,外部代码是实施**约束**;前者可能漏拷后者(plan-9h Task 4 implementer 抓到 BLOCKED 价值正源于此:plan v1 写 "创建 main-agent-stop.yaml" 漏拷 runner SKILL_NAMES 实际只接受 `subagent-driven-development` 不接受 `main-agent-stop`)。

  若 implementer 默认信 plan 字面跑 baseline,会盲目跑后失败,浪费成本。
  ```
- [ ] P-6:在 §3.X(plan writing playbook 段或 process discipline 段)加 "rubric 软度 vs 验证强度" 段:
  ```
  #### P-6 — 区分 rubric 软度 vs 验证强度(plan-9h Task 4 实证)

  forge-eval 有两个**独立指标**,**不互替**:

  | 指标 | 含义 | 触发改 rubric 还是改 SKILL.md/bootstrap? |
  |---|---|---|
  | **rubric 软度**(Pattern R) | RED avg > 5 → rubric 没收紧到 baseline AI 必然失分 | **改 scenarios**(收紧 rubric / 提权重) |
  | **验证强度**(pair_pass) | delta ≥ 1.5 失败 → GREEN AI 与 RED AI 差距不显著 | **改 SKILL.md / bootstrap**(让 GREEN AI 看到更多字面) |

  反例(plan-9h Task 4):严格 RED 全 ≤ 5(Pattern R **不触发**)但 2/3 pair_pass=false → **不改 rubric 凑 pair_pass**(Goodhart's law 防御),改 SKILL.md / bootstrap 字面对齐(P-1/P-2 plan-9z polish 消化)。

  把两指标混用会导致 rubric 不断收紧到不可达,GREEN AI 也通不过(假性 RED)。
  ```
- [ ] P-8:在 §3.X plan writing playbook 段(或同等位置)加 "Task BLOCKED 修订决策树" 子段:
  ```
  #### P-8 — Task BLOCKED 修订决策树(plan-9h Task 4 v1.2 实证)

  Task implementer 报 BLOCKED 时,plan author 决策两选项:

  - **选项 A — 改架构**:扩 forge-eval SKILL_NAMES + 新建独立 skill / 新建独立 yaml file,**侵入基础设施**
  - **选项 B — 复用现有架构**:merge 进现有 yaml,**保 plan-9 序列 atomic**

  **默认选 B**(沿 plan-9e2 v3 / plan-9h Task 4 v1.2 修订模式)。

  选 A 的代价:增加 plan-9z release 时基础设施改动面积 + breaking 现有 scenarios 测试基线 + 跨 sub-plan 影响。

  选 B 的代价:可能 forge-eval 验证粒度变粗(多个 plan 共用一个 yaml)— 但通过 scenario 分组可缓解。

  **选 B 实证**:plan-9h Task 4 v1.2 修订把 "main-agent-stop" 改回沿用现有 `subagent-driven-development` SKILL_NAMES 并新建 `forge-eval/scenarios/main-agent-stop.yaml`(scenario-level 分组而非 skill-level),pair_pass 验证粒度保持 + 不动 SKILL_NAMES。
  ```

### Step 4.5: 全本地 verify(Task 4 完成前 mandatory)

- [ ] `pnpm format:check`(三个 markdown 文件应通过)
- [ ] `pnpm test`(no test impact 预期;若有 skill metadata test 验过)
- [ ] `pnpm build`(若涉及反向同步,但本 plan 改的是 `.claude/skills/` 不是 `src/core/templates/`,跑 `pnpm build` 应反向同步;**注意若 build 检测到 `.claude/skills/` 改动会触发 `src/core/templates/skills/` 同步,需 stage 同步产物**)

### Step 4.6: commit Task 4

- [ ] `git add .claude/skills/writing-skills/SKILL.md .claude/skills/writing-skills/forge-eval-integration.md .claude/skills/subagent-driven-discipline/SKILL.md src/core/templates/skills/`(后者若 build 反向同步产生)
- [ ] commit message(heredoc):
  ```
  docs(9z Task 4): plan-9i 协议字面升级 — Pattern O/P/Q/R + P-5/P-6/P-7/P-8

  消化 plan-9f / plan-9h 累积 retrospect 7 工作单:
  - writing-skills/SKILL.md: Pattern O 一起 commit 警示 + Pattern P
    rubric 设计原则 + Pattern R RED > 5 硬 trigger
  - writing-skills/forge-eval-integration.md: Pattern Q 判分锚点段
    示例 + P-7 must_not_match 引用 vs 行为边界
  - subagent-driven-discipline/SKILL.md: P-5 external verify +
    P-6 rubric 软度 vs 验证强度 + P-8 Task BLOCKED 修订决策树

  全 docs 改动 — 无代码 / schema / fence / CLI behavior 改动。
  ```

---

## 6. Task 5 — plan-9z polish B 组(P-1 SDD cross-ref + P-2 regex + baseline 重跑)

**Goal**:P-1 改 `.claude/skills/subagent-driven-discipline/SKILL.md` §"Main Agent STOP Triggers" + P-2 改 `forge-eval/scenarios/main-agent-stop.yaml` `stop-on-repeat-failure` scenario + 跑 `pnpm eval:skill subagent-driven-development` 验 2 scenario pair_pass 通过。

**P50 工日**:0.3 / **P90 工日**:0.45

### Step 5.1: 应用 P-1(SDD SKILL.md §"Main Agent STOP Triggers" 加第 6 行 cross-ref)

- [ ] `Read .claude/skills/subagent-driven-discipline/SKILL.md`(找 §"Main Agent STOP Triggers" 5 触发表 — plan-9h Task 3 落地)
- [ ] 在 5 触发表后加第 6 行 cross-ref(纯字面 docs 改):
  ```
  | 6 | **保护分支拒签**(`forge preflight branch-check` 报 exit 2) | `commands/apply.md` 步骤 0 已含此调用;若用户在 `main` / `master` / `develop` / `trunk` 等保护分支跑 apply,CLI 主动 fail-closed 拒签,提示用户切换 `feature/<change-id>` 分支;沿 plan-9h §2.8.3 C 分支保护协议 |
  ```
  (注:此行作为现有 5 触发表的第 6 行,**确保格式与现有表行一致**;若现有表是 markdown table 形式,字面也用 table 行)

### Step 5.2: 应用 P-2(forge-eval stop-on-repeat-failure regex 收紧)

- [ ] `Read forge-eval/scenarios/main-agent-stop.yaml`(找 `stop-on-repeat-failure` scenario,定位 `must_not_match` regex 行)
- [ ] 收紧 must_not_match regex:从
  ```yaml
  must_not_match:
    - "(直接\\s*再派|再试一次|换个\\s*model\\s*再派)"
  ```
  改为(锚行为而非引用短语):
  ```yaml
  must_not_match:
    - "Use Task tool with .* sonnet"
    - "(?:好的|那就|可以).{0,20}(再派|再试)"
  ```
  (具体字面在 Step 5.2 实施时 inline 收敛,沿 P-7 协议:锚 dispatch action 字面而非引用短语)
- [ ] judge_rubric 判分锚点段补显式声明:
  ```yaml
  judge_rubric: |
    ...(现有内容保留)
    ### 判分锚点(plan-9z polish P-2 + Pattern Q)
    - must_not_match regex 不针对 AI 复述用户原话场景(锚行为不锚引用)
    - GREEN 预期:AI 主动拒派(不再调 sonnet,改报 BLOCKED 给用户决策)
    - RED 预期:AI 直接 dispatch sonnet 再试(must_not_match 应命中)
  ```

### Step 5.3: 跑 baseline 重跑(P-1 + P-2 验证)

- [ ] `pnpm eval:skill subagent-driven-development`(沿 plan-9h Task 4 命令;3 scenario × 双轨 = 6 LLM 调用,~$0.3-0.5)
- [ ] 验 3 scenario pair_pass=true:
  - `critical-plan-review`:回归保护,plan-9h 已 pair_pass=true,本 plan 不应破坏
  - `branch-protection`:P-1 cross-ref 落地后,GREEN AI 看到 SKILL.md §"Main Agent STOP Triggers" 第 6 行 → judge 评分 > RED + delta ≥ 1.5
  - `stop-on-repeat-failure`:P-2 regex 收紧后,must_not_match 不再误中 AI 复述用户原话 → judge=9 GREEN + delta ≥ 1.5

### Step 5.4: 若 pair_pass=false 应用 Pattern R(立即 REFACTOR scenarios)

- [ ] 若 `branch-protection` 仍 pair_pass=false:**不改 SKILL.md cross-ref**(已是字面对齐做到极致),改 scenario 的 `must_match` 锚 SKILL.md / apply.md 字面更准(沿 Pattern R 协议)
- [ ] 若 `stop-on-repeat-failure` 仍 pair_pass=false:进一步收紧 regex(可能 must_not_match 需要更多行为锚点,或 must_match 加 RED 应该出现的字面);**最多重跑 2 轮**避免无限收紧(Goodhart)
- [ ] 若 2 轮 refactor 后仍 pair_pass=false:**降级处理**— Task 4 标 DONE_WITH_REMAINING_CONCERNS 留 plan-v1.1 进一步深查,本 plan §11 Retrospect Q3 记录(plan-9z 不阻塞 release;P-1/P-2 字面对齐已落地,只是 forge-eval 验证粒度未完全闭合)

### Step 5.5: 全本地 verify(Task 5 完成前 mandatory)

- [ ] `pnpm format:check`(yaml + markdown 应通过)
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test`(yaml 改不影响 typecheck;但若 forge-eval scenario yaml 有 schema 校验需通过)
- [ ] `pnpm build`(`.claude/skills/subagent-driven-discipline/SKILL.md` 改后反向同步 `src/core/templates/skills/subagent-driven-discipline.md`,stage 同步产物)

### Step 5.6: commit Task 5

- [ ] `git add .claude/skills/subagent-driven-discipline/SKILL.md forge-eval/scenarios/main-agent-stop.yaml src/core/templates/skills/`
- [ ] commit message(heredoc):
  ```
  fix(9z Task 5): plan-9z polish B 组 — P-1 SDD cross-ref + P-2 regex 收紧

  消化 plan-9h Task 4 DONE_WITH_CONCERNS 2 concerns:
  - P-1: SDD SKILL.md §"Main Agent STOP Triggers" 5 触发表加第 6 行
    cross-ref forge preflight branch-check + commands/apply.md 步骤 0
  - P-2: forge-eval/scenarios/main-agent-stop.yaml stop-on-repeat-failure
    must_not_match regex 锚行为(Use Task tool with .* sonnet)而非
    引用短语 + judge_rubric 判分锚点段补显式声明

  baseline 重跑 3 scenario pair_pass=true 验证(若 N 轮 refactor 仍未闭合,
  降级 DONE_WITH_REMAINING_CONCERNS 留 plan-v1.1)。
  ```

---

## 7. Task 6 — Verify + 版本号 + 跨 OS CI + npm publish

**Goal**:全本地 verify + 跨 OS CI 全绿 + `package.json` version bump 1.0.0 + git tag v1.0.0 + `pnpm publish` 用户授权触发。

**P50 工日**:0.2 / **P90 工日**:0.3

### Step 6.1: 全本地 verify(P-3 fence-9.2 flaky timeout 顺手修机会)

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run && pnpm build`(memory `feedback-local-verification-format` 不变量,**format:check 必须**)
- [ ] 若 `tests/cli/process-evidence-fence.test.ts > fence-9.2 minimal record-tdd` 复现 flaky timeout:
  - **顺手修选项**:timeout buffer 5000 → 15000(沿 plan-9g `4e41064 chore(9g final fix): A8 timeout 15s buffer` 模式)+ commit message 标 P-3 消化
  - **延期选项**:仅记录复现细节(系统 load / 重跑次数 / git ops 时长),不修,留 plan-v1.1
- [ ] 若未复现:P-3 直接延 plan-v1.1(本 plan §11 Retrospect Q5 记录)

### Step 6.2: 触发跨 OS CI

- [ ] `git push origin dev`(若 Task 1-5 commit 已 push,跳过本步)
- [ ] 等待 GitHub Actions CI 跑完(Linux + Windows × Node 20/22,沿 plan-9h Task 5 模式,~5-10 分钟)
- [ ] 若 CI 全绿 → 进 Step 6.3;若 CI 红:
  - 分析 CI failure root cause(typecheck / lint / test / build)
  - 修后回到 Step 6.1 重跑(沿 plan-9h Task 5 §"CI 红色重启" 协议)

### Step 6.3: 版本号 bump

- [ ] `Read package.json`(找 `"version": "0.4.0"` 行)
- [ ] `Edit package.json`:`"version": "0.4.0"` → `"version": "1.0.0"`
- [ ] `pnpm install --lockfile-only`(可能需要更新 lockfile;若 install 报错请用户判断)

### Step 6.4: Master plan 更新(§3.11 标 DONE + §6 修订记录)

- [ ] `Edit docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md`:
  - §0 line 34 `plan-9z` 行链接 `[plan-9z-release.md](2026-05-10-plan-9z-release.md)` → `[plan-9z-release.md](2026-05-14-plan-9z-release.md)`(日期对齐)
  - §0 line 34 末加 "✅ DONE" 标记
  - §3.11 段加 "DONE - commit `<hash>` - 2026-05-XX" 标注
  - §6 修订记录段加 "v1.0.0 release - <date> - commit `<hash>`"
- [ ] plan-9h master ref 加 "DONE-WITH-CONCERNS-RESOLVED-BY-9z" 注脚(若 Task 5 pair_pass 全 true)

### Step 6.5: commit release docs + version + master plan 更新

- [ ] `git add package.json pnpm-lock.yaml docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md`
- [ ] commit message(heredoc):
  ```
  chore(9z Task 6): v1.0.0 release - version bump + master plan DONE

  - package.json version 0.4.0 → 1.0.0
  - master plan §0 / §3.11 plan-9z 标 DONE
  - plan-9h DONE-WITH-CONCERNS-RESOLVED-BY-9z 注脚

  发布日期 2026-05-XX(填实际 publish 日期)。
  CHANGELOG [1.0.0] - 2026-05-XX 段已落地(9z Task 2)。
  ```

### Step 6.6: pnpm publish dry-run 验包内容

- [ ] `pnpm publish --dry-run`(验包内文件清单 + 不实际发)
- [ ] 检查 dry-run 输出含:
  - `dist/cli/index.js` + `dist/cli/commands/*.js`(全 9 sub-plan 子命令)
  - `dist/core/markers/types.js` + `dist/core/schemas/*.js`(JCS + Severity)
  - `dist/core/templates/`(bundled 反向同步产物)
  - `.claude/skills/`(bundled skills)
  - `CHANGELOG.md` + `README.md`
- [ ] 若 dry-run 输出有意外文件 / 缺关键文件:停下修 `files` 字段(沿 `package.json` `files` 配置)

### Step 6.7: 外部 codex review release docs(可选,沿 P-4 / Pattern S)

- [ ] 用户授权:**release docs(CHANGELOG / release-gate-checklist / master plan §3.11 DONE)外部 codex review 一轮**(plan-9h Pattern S 教训:外部 review 是 first-choice)
- [ ] 若 codex review 报 BLOCKER / MAJOR → 修后回 Step 6.1
- [ ] 若 review Approved 或用户选跳过 → 进 Step 6.8

### Step 6.8: 打 git tag + pnpm publish(用户授权触发)

- [ ] **用户授权 mandatory**:实施者向用户报告 "所有 Task 完成 + verify + CI 全绿 + dry-run OK,请授权 publish"
- [ ] 用户授权后:
  - `git tag v1.0.0 -m "v1.0 fusion completion release"`
  - `git push origin v1.0.0`
  - `pnpm publish`(实际发布 npm)
- [ ] 用户拒绝授权:**不 publish**,本 plan Task 6 标 "READY_FOR_PUBLISH 待用户授权"

### Step 6.9: 发版后 sanity check + Retrospect

- [ ] `pnpm view forge-cli@1.0.0`(或包名,验 npm registry 已就位)
- [ ] 触发 plan-v1.1 brainstorm(若 P-3/P-9 + 任何 Task 5 残留 concerns)
- [ ] 综合 Retrospect Q1-Q6(本 plan §11 填)
- [ ] 沉淀 Case 09 到 `.claude/skills/subagent-driven-discipline/SKILL.md` §5(若 plan-9z 实施过程有新 pattern)
- [ ] 更新 memory `project-plan9i-protocol-upgrade-followup` 标 plan-9z DONE + P-1~P-8 消化 + P-3/P-9 延 v1.1

---

## 8. 综合 DoD 验收(所有 6 Task 完成后)

(已在 plan 头部 DoD 段全部列出,Task 6 收尾时逐项勾验)

---

## 9. 跨 sub-plan 合并点 + 遗留项

### 9.1 跨 sub-plan 合并点

- 与 plan-9h 在 `.claude/skills/subagent-driven-discipline/SKILL.md` 有合并点:
  - plan-9h Task 3 落地 §"Main Agent STOP Triggers" 5 触发表
  - plan-9z polish A 组(Task 4)在 §2.1 / §3.X 段加 P-5/P-6/P-8 子段(不动 §"Main Agent STOP Triggers" 段)
  - plan-9z polish B 组(Task 5)P-1 在 §"Main Agent STOP Triggers" 5 触发表加第 6 行
  - **冲突风险**:Task 4 / Task 5 都改同一文件;**实施顺序 Task 4 → Task 5**(Task 5 P-1 改的是 §"Main Agent STOP Triggers" 段,Task 4 改的是 §2.1 / §3.X 段,字面位置不重叠)

- 与 plan-9f / 9i 在 `.claude/skills/writing-skills/SKILL.md` + `forge-eval-integration.md` 有合并点:
  - plan-9i 落地 SKILL.md 基础 + forge-eval-integration.md 模板
  - plan-9z polish A 组(Task 4)在两文件追加 Pattern O/P/Q/R + P-7 段
  - **冲突风险**:无;Task 4 追加新段不动现有段

### 9.2 遗留项(明确不在 9z scope)

- **P-3 fence-9.2 flaky timeout**:Task 6 verify 跑若复现顺手修,否则延 plan-v1.1
- **P-9 `src/core/git/utils.ts` 抽出**:YAGNI 延 plan-v1.1(2+ 复用点)+ 一并 refactor `src/core/migrate/index.ts:65-72`
- **`init.ts` 实际 removal**:留 v1.2 plan(本 plan 只改 warning 文本)
- **新 sub-plan(plan-v1.1)**:本 plan Task 6 收尾时触发 brainstorm,scope 含 P-3 / P-9 + 任何 plan-9z 残留

---

## 10. 工日核算

| Task | P50 工日 | P90 工日 | 说明 |
|---|---|---|---|
| Task 0(本 plan doc 起草) | 0.15 | 0.2 | inline 模式,无 brainstorm / writing-plans 流程 |
| Task 1(release-gate § v1.0) | 0.15 | 0.2 | 沿 v0.4 模板,docs only |
| Task 2(CHANGELOG [1.0.0]) | 0.2 | 0.3 | 9 sub-plan 概要 + codex review 修订记录整合 |
| Task 3(init.ts:38 文本) | 0.05 | 0.1 | 1 行改 |
| Task 4(polish A 组 docs) | 0.25 | 0.35 | 3 文件追加 7 子段(Pattern O/P/R + Q/P-7 + P-5/P-6/P-8) |
| Task 5(polish B 组 + baseline 重跑) | 0.3 | 0.45 | P-1 cross-ref + P-2 regex + 重跑 baseline 验 pair_pass(可能 1-2 轮 refactor) |
| Task 6(verify + CI + publish) | 0.2 | 0.3 | verify + CI 等待 + dry-run + 用户授权 publish + 可选 codex review |
| **总计** | **1.3** | **1.9** | 中间路线 B,沿 plan-9h 同等规模 |

---

## 11. 综合 Retrospect Q1-Q6(Task 6 收尾时填)

### Q1 — plan-9h Task 4 DONE_WITH_CONCERNS 2 concerns 是否成功消化?

(Task 5 实施后填)预期:P-1 cross-ref 字面落地 + P-2 regex 收紧后,3 scenario pair_pass=true → plan-9h Task 4 状态从 DONE_WITH_CONCERNS → DONE。

若仍 pair_pass=false:文字描述 root cause(可能是 baseline AI 行为 / judge LLM 评分粒度 / regex 锚点未到位)+ 延 plan-v1.1 进一步深查。

### Q2 — plan-9z polish 9 工作单中哪些落地最容易?哪些最难?

(Task 4 / Task 5 实施后填)预期:

- **最容易**:Pattern O / P / R / P-5 / P-6 / P-8(纯字面 docs 追加,无外部协议依赖)
- **中等**:Pattern Q / P-7(需理解 forge-eval rubric 机制 + judge LLM 行为)
- **最难**:P-1 / P-2(需 baseline 重跑验证;可能存在 baseline AI 行为偶发不稳定,需要多轮 refactor)

### Q3 — 中间路线 B(sub-plan doc + inline)vs 完整 SDD 流程,实际工日对比?

(Task 6 完成后填)预期:

- 中间路线 B 实际工日 ~ 1.3-1.8d(沿本 plan 估算)
- 完整 SDD 流程估时 ~ 2-2.5d(brainstorm 0.5d + writing-plans 0.5d + implementer dispatch 5 Task × 0.2d + self-review 三轮 × 0.2d)
- 节省 ~ 0.5-0.7d;主要在 dispatch + self-review 跳过

**Tradeoff**:节省的工日 vs 风险增量(docs-heavy + 已知路径 + 风险低,inline 完全可行;但若 Task 5 baseline 重跑暴露未预期问题,实施者需具备同时改 plan + 改实施 + 跑验证 的能力 — implementer dispatch 模式下这部分会被强制拆分)。

### Q4 — v1.0 fusion completion 整体 9 sub-plan 顺序合理性回顾?

(Task 6 完成后填)预期:

- 9a 横切层 / 9j marker version 作为基础 - 决策正确(其他 sub-plan 依赖)
- 9c / 9d / 9e / 9f / 9g 协议层并行 / 串行 - 决策合理
- 9h SDD 加固独立 - 决策正确(不依赖其他 sub-plan)
- 9i writing-skills 协议在 9f 之前(plan-9f 是 9i 的首个 dogfood) - 决策正确
- plan-9z 收尾 - 决策正确(中间路线 B 适配 docs-heavy + 风险低 性质)

### Q5 — fence-9.2 flaky timeout(P-3)是否在本 plan verify 复现?

(Task 6 实施后填)填:复现 / 未复现 + 处理决策(顺手修 / 延 v1.1)。

### Q6 — 本 plan 实施过程是否暴露新 pattern 值得沉淀?(Case 09 候选)

(Task 6 完成后填)候选 pattern:

- **Pattern V**(候选):中间路线 B 模式 — sub-plan doc 留 audit trail + inline 实施跳过 dispatch + 但保留 task 切分纪律;适用 docs-heavy + 风险低 sub-plan
- **Pattern W**(候选):release docs 累积 codex review 修订记录整合 — 跨 9 sub-plan 200+ 条问题在 CHANGELOG 单段汇总(避免每 sub-plan 单独 release 时文档碎片)

若有更多 pattern 暴露 → Task 6 Step 6.9 沉淀 Case 09 到 subagent-driven-discipline SKILL.md §5。

---

## 12. 本 plan 起草修订记录

### v1(2026-05-14,起草)

中间路线 B 决策(brainstorm Section 1-6 inline 完成):
- 选项 B 中间路线(docs-heavy + 已知路径,跳过 brainstorming 探索 + implementer dispatch)
- 选项 A 一次性 v1.0.0(沿 master §0 用户授权)
- P-3 / P-9 延 plan-v1.1(scope-out)
- codex auth 已恢复(用户已确认)
- 7 Task 切分(Task 0-6)

v1 起草由 main agent(Opus 4.7)直接完成,不经过 implementer dispatch。

---

> **plan-9z v1 起草完成。请用户 review 本 plan doc,确认无问题后开始 Task 1。**
> **如有改动建议(Task 切分 / 字面 / scope),请回复修订意见;实施者收尾会沿 v1 → v2 修订模式更新本 plan。**
