# Plan 9h — SDD 实施前置纪律加固(Critical Plan Review + Main Agent STOP triggers + 分支保护 CLI preflight)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。沿 plan-9c / 9e1 / 9j 同模式,**不必 invoke `forge:writing-skills`**(本 plan 不是新 skill 开发);走标准 TDD/SDD。

**Goal**:落地 design v3 §2.8 *SDD 实施前置纪律加固*(从 superpowers `executing-plans` 提炼 3 条主代理实施前置不变量)— `forge preflight branch-check` CLI helper(分支保护)+ `commands/apply.md` 步骤 0 调用 + 步骤 3.5 Critical Plan Review 4 维 concerns 检查 + §"禁止行为(plan-9h)" 段 3 条红线 + `skills/subagent-driven-development/SKILL.md` §"Main Agent STOP Triggers" 子段(5 触发表 + session 内计数机制 + 横切补强 BLOCKED 状态处理)+ forge-eval `main-agent-stop.yaml`(3 scenario 双轨 RED+GREEN)— **接口零侵入**(不动 §3.12 任何 freeze schema:不扩 ack-log action enum / 不动 process_evidence / 不动 marker schema)。

**Architecture**:5 层落地 —
(1) **Schema 层**:`src/core/schema/types.ts` `ForgeConfig` interface 加 `protected_branches?: string[]` 字段(沿现有 `legacy_bridge` / `writing_plans` / `process_verification` / `test` / `ack` 5 个可选段模式)+ export `DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'develop', 'trunk']` 常量。parseConfig 透传不补默认(沿现有 `??` fallback 调用方约定);**不新建** `validateProtectedBranchesConfig` sanitizer(field 是纯 array of string 无值域 / enum 校验需求,直接 `?? DEFAULT_PROTECTED_BRANCHES` fallback)。
(2) **CLI 层**:`src/cli/commands/preflight.ts` 新文件(首个 `preflight` 子命令组,commander 嵌套 addCommand 模式)— `buildPreflightCommand()` 含 `branch-check [<change-id>] [--allow-protected-branch]` 子命令;内联私有函数 `getCurrentBranch()`(`execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'])`)+ `isGitRepo()`(`execFileSync('git', ['rev-parse', '--git-dir'])` try/catch,沿 `src/core/migrate/index.ts:65-72` inline pattern,**不抽共享模块**符合 YAGNI);`src/cli/index.ts` `program.addCommand(buildPreflightCommand())` 注册。exit code 对齐 master §3.12.3 freeze:exit 0 = success / exit 2 = ci-refuse(保护分支拒签 / config 解析失败);非 git 项目 graceful skip exit 0。
(3) **apply.md 双改层**:`commands/apply.md` + `src/core/templates/commands/apply.md`(当前 md5 一致 `f2aed68...`)同步双改 — 步骤 0 加 preflight 调用 + 步骤 3.5 加 Critical Plan Review 4 维 concerns 检查(完整性 / 顺序 / 清晰度 / scope,transcribe 自 spec §2.8.3 A line 1378-1392 字面)+ §"禁止行为(plan-9h §2.8.3 B)" 段(3 条红线,与现有 §"禁止行为" / §"禁止行为(plan-9g §2.7)" 平级)。新建 `tests/integration/apply-md-sync.test.ts`(沿 `archive-md-sync.test.ts` / `explore-md-sync.test.ts` 模板,~30 行 md5 sync guard)。
(4) **SDD SKILL.md 层**:`skills/subagent-driven-development/SKILL.md` §"forge-specific 反向加固(v1.0)" 段下(line 276)追加 §"plan-9h 新增:Main Agent STOP Triggers" 子段(第 4 子段,与 Fluid Pause 不变量 / 红旗清单 / DONE_REPORT 三子段并列)— 5 触发表(Critical Plan Review gap / BLOCKED 第 4 项 plan wrong / 同 task BLOCKED ≥ 2 次 / verify 重试 ≥ 3 次失败 / 用户主动 interrupt)+ session 内计数机制段(**不持久化** marker / ack-log,Q5 决策接口零侵入)+ 禁止行为段 3 条(不绕过失败 task / 不改 task 描述让它过 / 不重试 ≥ 3 次)+ 与现有 BLOCKED 状态处理(line 110-115)横切补强关系段。`pnpm build` 反向同步 `src/core/templates/skills/subagent-driven-development.md`(commit 时 stage,不手 cp,沿 plan-9i §8.4.2 reverse-sync 模式)。
(5) **forge-eval 层**:`forge-eval/scenarios/main-agent-stop.yaml` 新文件(~150 行)含 3 scenario(`branch-protection` / `critical-plan-review` / `stop-on-repeat-failure`),每 scenario 双轨 RED+GREEN judge_rubric(沿 plan-9f exploring.yaml 模式);judge_rubric 含**判分锚点**段(Pattern Q,明确"不评估什么" + "baseline 预期失败模式")+ **forge-specific 维度**高权重(Pattern P,baseline AI 必然失分锚点)+ **通用维度**低权重;`must_match` 锚 SKILL.md / apply.md 强制字面 + `must_not_match` 锚 RED 典型违规行为。`pnpm eval:skill subagent-driven-development` 跑 3 scenario × 双轨 = 6 LLM 调用,delta ≥ 1.5 each(沿 `forge-eval/compare.ts:14` DEFAULT_DELTA_THRESHOLD)。

**Tech Stack**:Node 20+ / TypeScript ESM strict / commander 12(嵌套子命令 addCommand)/ `yaml` v2(沿现有 parseConfig)/ vitest 1.x / pnpm 9+ / `node:child_process` `execFileSync`(git 调用)/ 现有 `src/core/schema/types.ts` ForgeConfig(本 plan 加第 6 个可选段)+ `src/cli/index.ts` 主 commander 实例(本 plan 加第 13 个子命令注册)+ `commands/apply.md` 152 行(plan-9c/9g 已合,本 plan 步骤 0 + 步骤 3.5 + 禁止行为段三处净增 ~48 行)+ `skills/subagent-driven-development/SKILL.md` 314 行(plan-9c/9g 已合,本 plan §"forge-specific 反向加固(v1.0)"下加第 4 子段 ~60 行)+ `src/core/templates/skills/subagent-driven-development.md` 反向同步 + `forge-eval/scenarios/` 现 16 yaml(本 plan 加第 17 个 main-agent-stop.yaml)。**不引入新 npm 依赖**;**不动** `src/core/markers/types.ts` / `src/core/archive/fence.ts` / `src/core/ack-log.ts`(接口冻结约束)。

**Spec 引用**:
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §2.8 全节(§2.8.1 诊断:不 port 整个 `executing-plans` skill,提炼 3 条不变量 / §2.8.2 缺口表:Critical Plan Review 完全缺 / 主代理 STOP 部分缺 / 分支保护完全缺 / §2.8.3 A Critical Plan Review 4 维 / §2.8.3 B 主代理 STOP 协议 5 触发 + 3 禁止 / §2.8.3 C main/master 分支保护 CLI helper 实施 / §2.8.4 与 §2.1 Fluid Pause / §2.5 explore 桥接 / §2.8.5 实施清单 8 项)
- master plan §3.8 [`2026-05-10-plan-9-v1.0-fusion-completion-master.md`](2026-05-10-plan-9-v1.0-fusion-completion-master.md)(P50 2.5d / P90 3.5d;MAJOR 修订:从 1.5 上调到 2.5;与 9c/9g 在 `commands/apply.md` 有合并点,推荐 merge 顺序 9h → 9c → 9g — 但 9c/9g 已合 dev,9h 后插)+ §3.12.3 CLI exit code 冻结(`forge preflight branch-check`:0 success / 2 ci-refuse,line 503)+ §3.12.4 ack-log schema freeze(本 plan 不扩 action enum)
- plan-9c apply.md line 127-129 已字面预告 9h 注入点("9h 将在步骤 0 加 `forge preflight branch-check` 调用 + 步骤 3.5 加 §'Critical Plan Review';9c 不动这些位置;推荐 merge 顺序 9h → 9c → 9g")— 本 plan 实施时直接在 9c 预留位置插入,**不动现有 §"Fluid Pause Decision Point" 段**
- plan-9g apply.md line 137-150 §"禁止行为(plan-9g §2.7 process_evidence 协议)" 段 — 本 plan §"禁止行为(plan-9h §2.8.3 B)" 段与之**平级**(都在原 §"禁止行为" 后),不嵌套
- plan-9f exploring.yaml(`forge-eval/scenarios/exploring.yaml`)— 本 plan main-agent-stop.yaml 沿其 3 scenario 双轨 + judge_rubric 判分锚点 + forge-specific 高权重 模式
- plan-9f retrospect 沉淀 Pattern O/P/Q/R(.claude/skills/subagent-driven-discipline/SKILL.md §5 Case 07)— **本 plan 应用 patterns 写 scenarios(O 一次 commit / P 高权重锚点 / Q 判分锚点段 / R RED > 5 立即收紧 rubric)**,但**不修 plan-9i 协议**(留 plan-9z polish / plan-v1.1,沿 memory `project-plan9i-protocol-upgrade-followup`)

**P50 工日**:**2.5**(对齐 master plan §3.8;0.5 brainstorm 已完成 + 1.0 writing-plans 当前阶段 + 1.0 SDD 实施 5 Task)
**P90 工日**:**3.5**(P50 + 1.0d buffer ~40%;含跨 OS CI / codex 1-2 轮收敛 / DONE_REPORT 等纪律时长)

**前置(必须完成)**:
- plan-9a 横切层基础(已合 dev,`forge ack` 协议 + ack-log.jsonl schema + Severity / Finding 类型)
- plan-9c apply.md Fluid Pause Decision Point(已合 dev,`commands/apply.md` line 50-130 段;9h 步骤 3.5 在 9c 步骤段后扩,不动 Fluid Pause 段)
- plan-9g process_evidence(已合 dev,`commands/apply.md` line 137-150 §"禁止行为(9g)" 段;9h 加 §"禁止行为(9h)" 与之平级)
- plan-9f explore + exploring skill(已合 dev,`forge-eval/scenarios/exploring.yaml` 模式 + plan-9f retrospect Pattern O/P/Q/R 经验)

**后续 unblocked**:
- plan-9z release(v1.0 收尾;统一全路径 CHANGELOG + npm publish;Pattern O/P/Q/R 协议升级 followup 在 9z polish 阶段消化)

**DoD**(完成定义,沿 brainstorm Section 6 DoD 综合验收):

### Schema + CLI 层

- `src/core/schema/types.ts` `ForgeConfig` 加 `protected_branches?: string[]` 字段 + JSDoc 注释(沿现有 5 可选段 JSDoc 模式)
- `src/core/schema/types.ts` export `DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'develop', 'trunk']` 常量
- `src/cli/commands/preflight.ts` 新文件,exports `buildPreflightCommand(): Command` 含 `branch-check` 子命令 + 私有 `getCurrentBranch()` / `isGitRepo()` 内联函数
- `src/cli/index.ts` `program.addCommand(buildPreflightCommand())` 注册(第 13 个子命令)
- `tests/cli/preflight.test.ts` 新文件,6 case 全过:case 1 = 在 main 分支无 flag exit 2 + stderr "保护分支" / case 2 = 在 main 分支 `--allow-protected-branch` exit 0 + stderr "风险自负" / case 3 = 在 feature 分支 exit 0 stderr 空 / case 4 = main 分支传 `changeId="my-change"` exit 2 + stderr "feature/my-change" 具体建议 / case 5 = 非 git 项目 exit 0 graceful skip / case 6 = config 自定义 `protected_branches: [trunk]` 在 main 分支 exit 0(自定义覆盖 DEFAULT)
- exit code 对齐 §3.12.3 freeze(0 success / 2 ci-refuse)
- stderr 格式包含中文 + 具体建议 `feature/<change-id>`(若 change-id 传入)/ `feature/<your-change-id>`(若未传)

### apply.md 双改层

- `commands/apply.md` 步骤 0(preflight 调用,~8 行)+ 步骤 3.5(Critical Plan Review 4 维 concerns,~30 行)+ §"禁止行为(plan-9h §2.8.3 B)" 段(~10 行)三处净增 ~48 行
- `src/core/templates/commands/apply.md` 与根级 md5 完全一致(双改写入后 md5 仍 sync)
- `tests/integration/apply-md-sync.test.ts` 新文件 ~30 行(沿 archive-md-sync / explore-md-sync 模板),md5 sync guard 测试通过
- 4 类 concerns 维度文本 transcribe 自 spec §2.8.3 A line 1378-1392 字面(无篡改)
- 步骤 3.5 末尾含"必须显式输出 4 类维度结论"反向加固字面(避免 vague pass-through)

### SDD SKILL.md 层

- `skills/subagent-driven-development/SKILL.md` §"forge-specific 反向加固(v1.0)" 下加 §"plan-9h 新增:Main Agent STOP Triggers" 子段(~60 行)
- 子段含:5 触发表 + 计数机制段(session memory 不持久化)+ 禁止行为段 3 条 + 与现有 BLOCKED 状态处理的横切补强关系段
- cross-ref 表的"cross-ref"列字面引用现有 BLOCKED 第 4 项 line 115 + `commands/apply.md` §"Fluid Pause"(不重复定义,沿 §3.12 接口冻结原则)
- `pnpm build` 反向同步 `src/core/templates/skills/subagent-driven-development.md`(commit 时 stage,**不手 cp**)

### forge-eval 层

- `forge-eval/scenarios/main-agent-stop.yaml` 含 3 scenario(branch-protection / critical-plan-review / stop-on-repeat-failure),每 scenario 双轨 RED+GREEN
- 每 scenario 的 judge_rubric 含**判分锚点**段(Pattern Q)+ **forge-specific 维度**高权重(Pattern P,baseline AI 必然失分锚点)+ 通用维度低权重
- 至少 1 scenario 的 `must_match` 锚 SKILL.md 强制字面(强 baseline 失败信号)
- 至少 1 scenario 的 `must_not_match` 锚 RED 反向信号
- `pnpm eval:skill subagent-driven-development` 跑 3 scenario delta ≥ 1.5 each(若 RED avg > 5 应用 Pattern R 立即收紧 rubric 重跑)
- 估算成本 ~$0.5-0.8(沿 plan-9f exploring.yaml 类似规模)

### Verify + 跨平台

- 全本地 verify 通过:`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run`(memory `feedback-local-verification-format` 不变量,必须含 `format:check`)
- 跨 OS CI(Linux + Windows × Node 20/22)全绿(沿 plan-9f / 9e2 / 9g 模式)

### Codex 收敛 + Retrospect

- SKILL.md / preflight.ts production review 0 BLOCKER + 0 MAJOR(预期 1-2 轮 codex 收敛,沿 plan-9f / 9e2 模式;docs heavy + 小 CLI 模块,codex finding 主要在 rubric 精度 / scenario 边界 / typecheck strictness)
- final codex review Approved
- 综合 retrospect Q1-Q6(沿 plan-9e2 / 9f 模式);Yes 触发 Case 08 写入 `.claude/skills/subagent-driven-discipline/SKILL.md` §5

**v1 → v1.1 self-review 修订**(claude self-review 0 BLOCKER + 0 MAJOR + 1 MINOR + 1 NIT 全采纳;codex 路径因 auth 失效不可用,fallback 自审):
- **MINOR-1**:Task 1 Step 1.1 setupGitRepo 用 `git init -q` + master→main rename 兜底(5-6 行 edge case)→ 改用 `git init -q -b main`(forge-repo `tests/core/hash/diff.test.ts:15` 已有先例),简化 4 行 + 提升 idiomatic;同步调整 branch === 'master' 分支处理为 `git branch -m master`(因为 --initial-branch 已固定 main)
- **NIT-1**:Task 2 Step 2.3 字面 "line 11 '1. 必须调用...'" → "line 14 `## 步骤` 标题 + line 16 '1. 必须调用...'",对齐 `commands/apply.md` dev HEAD 9dfaec6 实际行位置

**v1.1 → v1.2 Task 4 实施期 BLOCKED 修订**(implementer 实施 Task 4 时发现 forge-eval runner 架构与 plan §5 Step 4.1 字面冲突,用户决策选项 B 修订):
- **Task 4 实施调整**:`forge-eval/scenarios/main-agent-stop.yaml` 独立 yaml → merge 3 scenario 进现有 `forge-eval/scenarios/subagent-driven-development.yaml` 末尾。原因:forge-eval runner(`load-scenario.ts:14`)按 `forge-eval/scenarios/${skillName}.yaml` 文件名查找,文件名必须 == `SKILL_NAMES` 数组成员;独立 main-agent-stop.yaml 顶层 `skill: subagent-driven-development` 仍无法被 runner 加载(runner 不扫描目录按 skill 字段聚合)
- **语义一致性**:与 Task 3 决策一致(Task 3 把 §"Main Agent STOP Triggers" 加在 SDD SKILL.md §"forge-specific 反向加固(v1.0)" 下作为子段,不是独立 skill;Task 4 yaml 也应在 SDD scenarios 内)
- **spec §2.8.5 line 1463 字面**:`forge-eval/scenarios/main-agent-stop/`(目录形式)是早期设计 placeholder;实际落地按 forge-eval 单 yaml 多 scenario 模式(沿 plan-9f exploring.yaml 模式但 merge 进现有 yaml 而非新建)
- **LLM 成本**:从原 plan ~$0.5-0.8(独立 yaml 3 scenario × 双轨 = 6 调用)→ ~$1.0-1.5(merge 进现有 yaml 后 6 scenario × 双轨 = 12 调用),含原 3 scenario 重跑

**Shell 假设 + commit block 跨 shell 兼容**(沿 plan-9j / plan-9g 同模式):本 plan 5 个 Task commit block 全用 `git commit -F file` 模式(Windows + PowerShell 用户偏好;memory `feedback-local-verification-format`)。**实施者必须先确认当前 shell + 按下表转换**:

| Shell | commit 命令模式 | 说明 |
|---|---|---|
| Bash / Git-Bash / WSL | `git commit -m "$(cat <<'EOF' ... EOF)"` | heredoc 直接用 |
| PowerShell 5.1 / 7+(默认) | `git commit -F message-tmp.txt` | 先 Write message 到 tmp 文件,commit 后 rm;避免 `@` 字符泄漏 subject 行 |
| Claude Code Bash tool (Windows) | 同 PowerShell | 默认走 PowerShell |

本 plan 主体 commit block 给 Bash heredoc 形式(沿 forge-repo 主流 sub-plan 模式);**PowerShell 等价见 Task 1 commit 下方注脚** — implementer 在 PowerShell 环境按相同消息内容用 `git commit -F` 改写即可,无需重复列出每 Task 的 PowerShell 版本。

---

## 0. 文档状态声明 + Brainstorm 决策汇总 + Scope-out 备忘录

### 0.1 本 plan 实施完成前的代码状态(brainstorm freeze 时 dev HEAD = 9dfaec6)

- `src/core/schema/types.ts` `ForgeConfig` 含 5 可选段(`legacy_bridge` / `writing_plans` / `process_verification` / `test` / `ack`),**无 `protected_branches` 字段**;无 `DEFAULT_PROTECTED_BRANCHES` 常量
- `src/cli/commands/` 含 12 个命令模块(ack / archive / config / evidence / finding / init / legacy-bridge / migrate / scope / update / upgrade / validate),**无 `preflight.ts`**
- `src/cli/index.ts` `program` 注册 12 个子命令(沿现有 `program.addCommand(buildXxxCommand())` 模式),**无 preflight 注册**
- `src/core/git/utils.ts` **不存在**;`getCurrentBranch()` / `isGitRepo()` helper **均不存在**;现有 `src/core/migrate/index.ts:65-72` 用 `execSync('git rev-parse --git-dir')` try/catch inline pattern 探测 git repo
- `commands/apply.md` 152 行 + `src/core/templates/commands/apply.md` 152 行,**md5 完全一致**(`f2aed68...`);含步骤 1-7 + §"Fluid Pause Decision Point"(9c)+ §"禁止行为"(原始 3 条)+ §"禁止行为(plan-9g §2.7 process_evidence 协议)"(9g 新增 4 条);**无步骤 0** / **无步骤 3.5** / **无 §"禁止行为(plan-9h)"**
- `skills/subagent-driven-development/SKILL.md` 314 行;§"Handling Implementer Status" 段含 BLOCKED 4 项处理(line 110-115),第 4 项 "plan itself is wrong → Fluid Pause" 已由 9c 字面落入;§"forge-specific 反向加固(v1.0)" 段(line 276)含 3 子段(Fluid Pause 不变量 / 红旗清单 / DONE_REPORT 来自 9g);**无 §"plan-9h 新增:Main Agent STOP Triggers" 子段**
- `tests/integration/` 含 `archive-md-sync.test.ts`(plan-9e2)+ `explore-md-sync.test.ts`(plan-9f);**无 `apply-md-sync.test.ts`**(plan-9c/9g 改 apply.md 时未建,本 plan Task 2 新建)
- `forge-eval/scenarios/` 含 16 yaml(brainstorming / dispatching-parallel-agents / exploring / finishing-a-development-branch / process-evidence / receiving-code-review / requesting-code-review / subagent-driven-development / systematic-debugging / test-driven-development / using-forge / using-git-worktrees / verification-before-completion / verifying-three-dimensions / writing-plans / writing-skills);**无 `main-agent-stop.yaml`**

### 0.2 Brainstorm Q-A 决策汇总(沿 brainstorm Section 1-6,Inline §0 模式 Q1 决策)

| Q | 决策 | 决策依据 |
|---|---|---|
| **Q1** | spec 结构:**Inline §0 进 plan-9h.md 单文件**(plan-9j 模式) | design v3 §2.8 已 freeze 119 行 5 subsection scope;9h decisions 不多;沿 plan-9j 已验证模式 |
| **Q2** | preflight CLI:`forge preflight branch-check [<change-id>] [--allow-protected-branch]`,change-id **可选** | 解决 spec line 1457 "change-id 必需" vs line 1419-1428 "实现代码不用 change-id" 内部矛盾;apply.md 传则错误消息含具体 `feature/<id>`,不传则 generic |
| **Q3** | SDD §"Main Agent STOP Triggers" 段:**整段加在 §"forge-specific 反向加固(v1.0)" 下作为第 4 子段** | design §2.8.1 line 1354 明确"forge 从 executing-plans 提炼的 v1.0 反向加固";与现有 3 子段同性质;SKILL.md 单点改动 review 易 |
| **Q4** | Critical Plan Review 测试:**删 `tests/skills/critical-plan-review.test.ts`**(spec line 1462 字面),改 `tests/integration/apply-md-sync.test.ts`(md5 sync 守护)+ forge-eval main-agent-stop.yaml(LLM-as-judge) | apply.md 步骤 3.5 是主代理行为(slash command 提示词驱动),**无可单元测试 code path**;沿 plan-9f explore-md-sync + exploring.yaml 模式 |
| **Q5** | BLOCKED 计数机制:**Session memory + SKILL 字面约束 + forge-eval 验证**(接口零侵入) | 不侵入 §3.12.4 ack-log schema freeze + 不动 process_evidence / marker schema freeze;主代理本就追踪 tasks.md / dispatch / review;forge-eval scenario judge LLM 验证 STOP 行为 |
| **Q6** | main-agent-stop.yaml 含 **3 scenario**:`branch-protection` / `critical-plan-review` / `stop-on-repeat-failure`,每 scenario 双轨 RED+GREEN | 与 plan-9f exploring.yaml 模式 1:1;每 scenario 独立验证一个反向加固点;4 类 concerns 在 plan-review 单 scenario 内 rubric 多维评分覆盖(不拆 4 scenario) |
| **Q7** | `--allow-protected-branch`:**只 stderr warning + exit 0**,**不写 ack-log / 不写新 log 文件** | 不侵入 §3.12.4 ack-log action enum freeze + 不侵入 §3.12.2 文件路径冻结;git history 自然 audit("谁在 main commit");preflight 是 CLI 一次性 check 非 evidence 阶段 |
| **Q8** | git helpers(`getCurrentBranch` / `isGitRepo`):**内联在 `src/cli/commands/preflight.ts` 私有函数**(不抽 `src/core/git/utils.ts` 共享模块) | YAGNI;9h scope 是 SDD 实施前置纪律加固非 git helper 抽象;~15 行内联可读性 OK;若 plan-v1.1 真有 2+ 复用点再重构 |

### 0.3 Scope-out 备忘录

**本 plan 明示不做以下事项**(沿 memory `project-plan9i-protocol-upgrade-followup`):

| 不做项 | 原因 | 后续处理 |
|---|---|---|
| **Pattern O/P/Q/R plan-9i 协议升级**(`skills/writing-skills/SKILL.md` + `forge-eval-integration.md` 修订) | scope 不匹配:9h 是 SDD 实施前置纪律加固,修 9i 协议属扩 scope | plan-9z polish 阶段消化(独立 task ~0.5-1d docs-only)或 plan-v1.1 独立 sub-plan |
| **Pattern O/P/Q/R 经验应用到 9h 写 scenarios**(注:这是**做**项,不是不做项) | 用 patterns 经验 ≠ 修 patterns 协议 | 本 plan Task 4 写 main-agent-stop.yaml 时**应用** Pattern P(forge-specific 高权重)+ Q(判分锚点段)+ R(RED > 5 立即收紧 rubric);Pattern O(scenarios + 最小骨架一起 commit)Task 4 字面执行 |
| **`src/core/git/utils.ts` 共享 helper 抽象** | YAGNI;9h 单点需求 ~15 行内联即可;Q8 决策 | plan-v1.1 若 2+ 复用点再抽 |
| **重构 `src/core/migrate/index.ts:65-72` inline git 探测** | 无关重构,违反"不引无关重构"原则 | 同上,plan-v1.1 抽 helper 时一并 refactor |
| **`tests/skills/critical-plan-review.test.ts` vitest 单测**(spec line 1462 字面) | Critical Plan Review 是 slash command 主代理行为,无可单元测试 code path | Q4 决策:删除该测试文件,改 md5 sync + forge-eval scenario;spec 字面调整在本 §0 备忘录交代 |
| **扩 `src/core/markers/types.ts` / `src/core/ack-log.ts` / `src/core/archive/fence.ts` / `process_evidence` schema** | 违反 master plan §3.12 接口冻结红线 | Q5/Q7 决策强制约束:9h 接口零侵入 |

### 0.4 与 9c / 9g 合并点的当前现状 verify

`commands/apply.md` 当前状态(dev HEAD 9dfaec6):
- line 11-43 步骤 1-7(原始;**步骤 0 / 步骤 3.5 待 9h 插入**)
- line 45-110 §"Fluid Pause Decision Point" 段(9c 加)
- line 127-129 含字面预告:"9h 将在步骤 0 加 `forge preflight branch-check` 调用 + 步骤 3.5 加 §'Critical Plan Review';9c 不动这些位置;推荐 merge 顺序 9h → 9c → 9g"
- line 131-135 §"禁止行为" 段(原始 3 条:主代理不直接写代码 / subagent 不改 tasks.md / 不跳 TDD red)
- line 137-150 §"禁止行为(plan-9g §2.7 process_evidence 协议)" 段(9g 加 4 条)

**9h 在 apply.md 的 3 处插入完全是 9c 已预留**;**与 9g 不冲突**(9g 加的是步骤段内 evidence helper 调用 + §"禁止行为(9g)" 段,与 9h 插入步骤 0/3.5/§"禁止行为(9h)" 段位置正交)。**plan-9h 后插模式(9h 在 9c/9g 之后)操作上等价**于 spec line 359 推荐的 9h → 9c → 9g merge 顺序(因为 9c 已字面预留 9h 注入位置,9h 实施时只需"填空")。

### 0.5 Pattern A 教训沿用(plan-9j v3 + plan-9g v6 + plan-9e2 v3)

**本 plan 99% 实施细节已 inline,每 Task RED test + GREEN 代码完整**,不留 "TBD / 类似 Task N / similar to above"。实施者直接复制 Step 字面即可,不需要"自补 4 类 concerns 维度文本" / "自补 STOP triggers 5 触发表" / "自补 rubric 维度权重"。

---

## 1. File Structure

| 文件 | 改动量 | 责任 | Task |
|---|---|---|---|
| `src/core/schema/types.ts` | +12 行(field + JSDoc + 常量 export) | `ForgeConfig` 加 `protected_branches?: string[]` 字段 + `DEFAULT_PROTECTED_BRANCHES` 常量 export | T1 |
| `src/cli/commands/preflight.ts` | 新文件 ~85 行 | `buildPreflightCommand()` + `branch-check` 子命令 + 内联私有 `getCurrentBranch()` / `isGitRepo()` | T1 |
| `src/cli/index.ts` | +2 行(import + register) | 注册 preflight 子命令(第 13 个子命令) | T1 |
| `tests/cli/preflight.test.ts` | 新文件 ~180 行 | 6 case 覆盖(保护拒签 / --allow 覆盖 / feature 分支 / change-id 透传 / 非 git skip / 自定义 config 覆盖) | T1 |
| `commands/apply.md` | +48 行(步骤 0 ~8 + 步骤 3.5 ~30 + §"禁止行为(9h)" ~10) | 双改根级 slash command | T2 |
| `src/core/templates/commands/apply.md` | +48 行(与根级 md5 一致) | 双改模板 | T2 |
| `tests/integration/apply-md-sync.test.ts` | 新文件 ~30 行 | md5 sync guard(沿 archive-md-sync / explore-md-sync 模板) | T2 |
| `skills/subagent-driven-development/SKILL.md` | +60 行(§"plan-9h 新增:Main Agent STOP Triggers" 子段 4) | §"forge-specific 反向加固(v1.0)" 段下追加 | T3 |
| `src/core/templates/skills/subagent-driven-development.md` | 由 `pnpm build` 反向同步自动生成(commit 时 stage,不手 cp) | 模板 | T3 |
| `forge-eval/scenarios/main-agent-stop.yaml` | 新文件 ~150 行 | 3 scenario(branch-protection / critical-plan-review / stop-on-repeat-failure)双轨 RED+GREEN | T4 |
| `docs/plans/2026-05-14-plan-9h-sdd-discipline.md` | 本文件 ~700-800 行 | plan-9h sub-plan 主文件 | brainstorm + writing-plans 阶段产物 |

**不修改文件**(沿 §3.12 接口冻结约束):
- `src/core/markers/types.ts`(marker schema freeze)
- `src/core/ack-log.ts`(ack-log schema freeze)
- `src/core/archive/fence.ts`(process_evidence fence freeze)
- `src/core/schemas/process-evidence.ts`(process_evidence schema freeze)
- `src/core/schemas/archive-summary.ts`(archive_summary schema freeze)
- `src/core/parse/yaml.ts`(parseConfig 透传不补默认,沿现有约定)
- `src/core/migrate/index.ts:65-72`(inline git 探测 pattern;Q8 决策不重构)
- 任何现有 `src/cli/commands/*.ts`(preflight 是新文件,不动现有 12 命令模块)
- 任何现有 `tests/`(preflight.test.ts / apply-md-sync.test.ts 是新文件,不动现有测试)

---

## 2. Task 1 — preflight CLI + ForgeConfig schema 扩字段 + git helpers 内联

**Implementer**:sonnet(multi-file + 新 CLI 模块 + schema 扩字段;沿 memory `feedback-subagent-model-selection`)
**Spec reviewer**:sonnet
**Quality reviewer**:sonnet

**Files**:
- Modify: `src/core/schema/types.ts`(line 93 末尾插入新可选段 + 文件末尾加 `DEFAULT_PROTECTED_BRANCHES` 常量 export)
- Create: `src/cli/commands/preflight.ts`
- Modify: `src/cli/index.ts`(import + addCommand 注册)
- Create: `tests/cli/preflight.test.ts`

### Step 1.1: 先写 RED 失败测试(TDD red)— `tests/cli/preflight.test.ts`

新建 `tests/cli/preflight.test.ts`,完整字面如下(implementer 直接复制):

```typescript
// tests/cli/preflight.test.ts — plan-9h Task 1 RED 失败基线
// 沿 plan-9j / plan-9g e2e CLI 测试模式,用 execFileSync spawn 真 CLI

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// CLI 入口(沿 plan-9j / plan-9g 同模式)
const CLI = join(process.cwd(), 'dist', 'cli', 'index.js');

// 测试 helper:在 tempdir 建 git repo + 切到指定分支
function setupGitRepo(branch: string, opts?: { configYaml?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge-preflight-test-'));
  // v1 self-review MINOR-1 修订:用 -b main 显式指定初始分支(沿 tests/core/hash/diff.test.ts:15 先例),避免 git default branch flakiness
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.local'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  // 初始 commit 让 HEAD 可解析为分支(空 repo 的 HEAD 是 unborn)
  writeFileSync(join(dir, 'README.md'), '# test\n');
  execFileSync('git', ['add', 'README.md'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  // 切到目标分支(若非 main/master,需 git checkout -b)
  // master 分支需求由 `git branch -m master` 实现(--initial-branch 已固定 main)
  if (branch === 'master') {
    execFileSync('git', ['branch', '-m', 'master'], { cwd: dir });
  } else if (branch !== 'main') {
    execFileSync('git', ['checkout', '-q', '-b', branch], { cwd: dir });
  }
  // 写 forge/config.yaml(若 opts.configYaml)
  if (opts?.configYaml) {
    mkdirSync(join(dir, 'forge'), { recursive: true });
    writeFileSync(join(dir, 'forge', 'config.yaml'), opts.configYaml);
  }
  return dir;
}

describe('forge preflight branch-check', () => {
  let testDir: string;
  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Windows occasionally locks files; ignore cleanup error
      }
    }
  });

  it('case 1: 在 main 分支无 flag → exit 2 + stderr "保护分支"', () => {
    testDir = setupGitRepo('main');
    const result = spawnSync('node', [CLI, 'preflight', 'branch-check'], {
      cwd: testDir,
      encoding: 'utf-8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('保护分支');
    expect(result.stderr).toContain("'main'");
  });

  it('case 2: 在 main 分支有 --allow-protected-branch → exit 0 + stderr "风险自负"', () => {
    testDir = setupGitRepo('main');
    const result = spawnSync(
      'node',
      [CLI, 'preflight', 'branch-check', '--allow-protected-branch'],
      { cwd: testDir, encoding: 'utf-8' },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('风险自负');
  });

  it('case 3: 在 feature/foo 分支 → exit 0 + stderr 空', () => {
    testDir = setupGitRepo('feature/foo');
    const result = spawnSync('node', [CLI, 'preflight', 'branch-check'], {
      cwd: testDir,
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');
  });

  it('case 4: main 分支传 changeId="my-change" → exit 2 + stderr 含 "feature/my-change"', () => {
    testDir = setupGitRepo('main');
    const result = spawnSync(
      'node',
      [CLI, 'preflight', 'branch-check', 'my-change'],
      { cwd: testDir, encoding: 'utf-8' },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('feature/my-change');
  });

  it('case 5: 非 git 项目 → exit 0 graceful skip', () => {
    testDir = mkdtempSync(join(tmpdir(), 'forge-preflight-nongit-'));
    const result = spawnSync('node', [CLI, 'preflight', 'branch-check'], {
      cwd: testDir,
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');
  });

  it('case 6: config 自定义 protected_branches=[trunk] → 在 main 分支 exit 0', () => {
    testDir = setupGitRepo('main', {
      configYaml: 'schema: forge-spec-driven/v1\nprotected_branches:\n  - trunk\n',
    });
    const result = spawnSync('node', [CLI, 'preflight', 'branch-check'], {
      cwd: testDir,
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');
  });
});
```

- [ ] **Step 1.2: 跑 RED 确认 6 case 全失败**

```bash
pnpm vitest run tests/cli/preflight.test.ts
```

**预期 RED**:6 case 全 FAIL,原因 `Cannot find module '../commands/preflight.js'` 或 `Unknown command 'preflight'`(CLI 入口未注册 preflight 子命令,dist/cli/index.js 不含 preflight)。

### Step 1.3: 实现 — `src/core/schema/types.ts` 加 protected_branches 字段 + 常量

打开 `src/core/schema/types.ts`,在 `ack?: { ... }` 段后(line 93)、`ForgeConfig` interface 闭合 `}` 前插入新可选段:

```typescript
  /**
   * v1.0 protected branches(plan-9h §2.8.3 C — main/master 分支保护)
   * 缺失时调用方应以 `??` fallback `DEFAULT_PROTECTED_BRANCHES`;
   * 空数组等价于禁用分支保护(不推荐,沿 design §2.8.3 C line 1438)。
   *
   * 由 `forge preflight branch-check` CLI helper 读取(沿 spec §2.8.5 第 3 项)。
   * 用户项目 `forge/config.yaml` 设置形如:
   *   protected_branches:
   *     - main
   *     - master
   *     - develop
   *     - trunk
   */
  protected_branches?: string[];
```

接着在文件末尾(`DEFAULT_LIGHT_THRESHOLD` 同段位置后)加 export 常量:

```typescript
/**
 * 默认 protected branches(plan-9h §2.8.3 C;调用方 fallback 用)。
 * 详见 design v3 §2.8.3 C line 1432-1438。
 */
export const DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'develop', 'trunk'] as const;
```

### Step 1.4: 实现 — `src/cli/commands/preflight.ts` 新文件

完整字面(implementer 直接复制):

```typescript
// src/cli/commands/preflight.ts — plan-9h Task 1
// 实施前置 check 子命令组(首个 preflight 命令组,commander 嵌套 addCommand)
// 沿 spec §2.8.3 C 实施码 + spec §2.8.5 第 3 项 CLI helper 设计

import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../../core/parse/yaml.js';
import { DEFAULT_PROTECTED_BRANCHES } from '../../core/schema/types.js';

/**
 * 内联私有 helper(plan-9h Q8 决策:不抽共享模块 src/core/git/utils.ts)
 * 探测当前目录是否在 git work tree 内。
 * 沿 src/core/migrate/index.ts:65-72 同模式(execFileSync + try/catch)。
 */
function isGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 内联私有 helper(plan-9h Q8 决策)
 * 拿当前分支名(`git rev-parse --abbrev-ref HEAD`)。
 * 调用前应已 `isGitRepo(cwd) === true` 守卫,否则 throw。
 */
function getCurrentBranch(cwd: string): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd,
    encoding: 'utf-8',
  }).trim();
}

/**
 * 构建 `forge preflight` 子命令组(沿 spec §2.8.5 第 3 项)。
 * 当前含一个子命令 `branch-check`;后续 v1.1+ 可扩(git clean check / evidence fresh check 等)。
 */
export function buildPreflightCommand(): Command {
  const cmd = new Command('preflight').description('实施前置 check(分支保护等;plan-9h §2.8)');

  cmd
    .command('branch-check [changeId]')
    .description('check current branch vs protected_branches config(沿 design §2.8.3 C)')
    .option('--allow-protected-branch', '显式覆盖保护(stderr 留 warning,exit 0)')
    .action((changeId: string | undefined, opts: { allowProtectedBranch?: boolean }) => {
      const cwd = process.cwd();

      // 非 git 项目:graceful skip(沿 v0.4 降级模式 + design §2.8.3 C line 1443)
      if (!isGitRepo(cwd)) {
        return; // exit 0
      }

      // 读 protected_branches:优先 forge/config.yaml,缺失 fallback DEFAULT_PROTECTED_BRANCHES
      const configPath = join(cwd, 'forge', 'config.yaml');
      let protectedBranches: readonly string[] = DEFAULT_PROTECTED_BRANCHES;
      if (existsSync(configPath)) {
        try {
          const config = parseConfig(readFileSync(configPath, 'utf-8'));
          if (Array.isArray(config.protected_branches)) {
            protectedBranches = config.protected_branches;
          }
        } catch (err) {
          // parse 失败 → 视为 config 错误,exit 2(沿 §3.12.3 freeze)
          console.error(
            `forge preflight: 解析 forge/config.yaml 失败: ${(err as Error).message}`,
          );
          process.exit(2);
        }
      }

      const currentBranch = getCurrentBranch(cwd);

      // 非保护分支 → 通过
      if (!protectedBranches.includes(currentBranch)) {
        return; // exit 0
      }

      // 在保护分支:有 --allow-protected-branch flag → exit 0 + stderr warning
      if (opts.allowProtectedBranch) {
        console.error(
          `forge preflight: 当前分支 '${currentBranch}' 是保护分支,` +
            `用户传 --allow-protected-branch 显式覆盖。build/CI 风险自负。`,
        );
        return; // exit 0
      }

      // 默认拒签 → exit 2 + stderr 具体建议
      const suggestedBranch = changeId ? `feature/${changeId}` : `feature/<your-change-id>`;
      console.error(
        `forge preflight: 当前分支 '${currentBranch}' 是保护分支,拒绝在保护分支实施。\n` +
          `建议: git checkout -b ${suggestedBranch},或加 --allow-protected-branch 覆盖`,
      );
      process.exit(2);
    });

  return cmd;
}
```

### Step 1.5: 实现 — `src/cli/index.ts` 注册 preflight 子命令

打开 `src/cli/index.ts`,在 `import { buildFindingCommand } ...` 后加新 import 行:

```typescript
import { buildPreflightCommand } from './commands/preflight.js';
```

在 `program.addCommand(buildFindingCommand());`(或最后一个 addCommand)后加新注册行(沿现有注释格式):

```typescript
// 注册 preflight 子命令组(plan-9h §2.8.3 C — main/master 分支保护)
program.addCommand(buildPreflightCommand());
```

### Step 1.6: 跑 GREEN 确认 6 case 全过

```bash
pnpm build && pnpm vitest run tests/cli/preflight.test.ts
```

**预期 GREEN**:6 case 全 PASS。

### Step 1.7: 全本地 verify(Task 1 完成前 mandatory)

沿 memory `feedback-local-verification-format`(必须含 `format:check`):

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run
```

**预期**:全 PASS;若 `format:check` fail 跑 `pnpm format` 修后再跑一遍。

### Step 1.8: commit Task 1

```bash
git add src/core/schema/types.ts src/cli/commands/preflight.ts src/cli/index.ts tests/cli/preflight.test.ts
git commit -m "$(cat <<'EOF'
feat(9h Task 1): preflight CLI + ForgeConfig protected_branches schema

落地 design v3 §2.8.3 C 分支保护 CLI helper:
- src/core/schema/types.ts: ForgeConfig 加 protected_branches?: string[] 字段 + DEFAULT_PROTECTED_BRANCHES export 常量(沿现有 5 可选段模式)
- src/cli/commands/preflight.ts: 新建 buildPreflightCommand() + branch-check 子命令(commander 嵌套 addCommand);内联私有 getCurrentBranch / isGitRepo(沿 Q8 决策 YAGNI,不抽共享模块)
- src/cli/index.ts: 注册第 13 个子命令 preflight
- tests/cli/preflight.test.ts: 6 case 覆盖(保护拒签 / --allow / feature 分支 / change-id 透传 / 非 git skip / 自定义 config 覆盖)

exit code 对齐 master §3.12.3 freeze(0 success / 2 ci-refuse);
stderr 中文 + 具体 feature/<change-id> 建议;
非 git 项目 graceful skip exit 0(沿 v0.4 降级模式)。

接口零侵入(不动 marker / ack-log / process_evidence schema)。
EOF
)"
```

**PowerShell 等价**(沿本 plan Shell 假设段;Windows 用户用):

```powershell
$msg = @'
feat(9h Task 1): preflight CLI + ForgeConfig protected_branches schema

落地 design v3 §2.8.3 C 分支保护 CLI helper:
- src/core/schema/types.ts: ForgeConfig 加 protected_branches?: string[] 字段 + DEFAULT_PROTECTED_BRANCHES export 常量(沿现有 5 可选段模式)
- src/cli/commands/preflight.ts: 新建 buildPreflightCommand() + branch-check 子命令(commander 嵌套 addCommand);内联私有 getCurrentBranch / isGitRepo(沿 Q8 决策 YAGNI,不抽共享模块)
- src/cli/index.ts: 注册第 13 个子命令 preflight
- tests/cli/preflight.test.ts: 6 case 覆盖(保护拒签 / --allow / feature 分支 / change-id 透传 / 非 git skip / 自定义 config 覆盖)

exit code 对齐 master §3.12.3 freeze(0 success / 2 ci-refuse);
stderr 中文 + 具体 feature/<change-id> 建议;
非 git 项目 graceful skip exit 0(沿 v0.4 降级模式)。

接口零侵入(不动 marker / ack-log / process_evidence schema)。
'@
Set-Content -Path .commit-msg-9h-t1.txt -Value $msg -Encoding utf8
git commit -F .commit-msg-9h-t1.txt
Remove-Item .commit-msg-9h-t1.txt
```

---

## 3. Task 2 — apply.md 双改(步骤 0 + 步骤 3.5 + §"禁止行为(9h)" 段)+ md5 sync 守护

**Implementer**:sonnet(docs 双改 + 新建 sync test)
**Spec reviewer**:sonnet
**Quality reviewer**:sonnet

**Files**:
- Modify: `commands/apply.md`(步骤 1 前插步骤 0;§"Fluid Pause Decision Point" 前插步骤 3.5;line 135 §"禁止行为" 后插 §"禁止行为(plan-9h §2.8.3 B)")
- Modify: `src/core/templates/commands/apply.md`(与根级完全同改)
- Create: `tests/integration/apply-md-sync.test.ts`

### Step 2.1: 先写 RED 失败测试(TDD red)— `tests/integration/apply-md-sync.test.ts`

新建 `tests/integration/apply-md-sync.test.ts`,完整字面(沿 archive-md-sync / explore-md-sync 模板):

```typescript
// tests/integration/apply-md-sync.test.ts — plan-9h Task 2 md5 sync guard
// 沿 archive-md-sync.test.ts(plan-9e2)/ explore-md-sync.test.ts(plan-9f)同模板
// 守护 commands/apply.md 与 src/core/templates/commands/apply.md md5 完全一致

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

function md5(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('md5').update(content).digest('hex');
}

describe('apply.md md5 sync guard(plan-9h Task 2)', () => {
  it('commands/apply.md 与 src/core/templates/commands/apply.md md5 完全一致', () => {
    const root = process.cwd();
    const rootMd = join(root, 'commands', 'apply.md');
    const templateMd = join(root, 'src', 'core', 'templates', 'commands', 'apply.md');

    const rootMd5 = md5(rootMd);
    const templateMd5 = md5(templateMd);

    expect(rootMd5).toBe(templateMd5);
  });
});
```

- [ ] **Step 2.2: 跑 RED 确认 sync test 当前已 PASS**

```bash
pnpm vitest run tests/integration/apply-md-sync.test.ts
```

**预期**(plan-9h 实施开始时):PASS(因为 dev HEAD = 9dfaec6 时两 apply.md md5 已一致 `f2aed68...`)。

**注**:此 sync test 是**守护测试**,不是 TDD red 测试。RED 在 Task 2 是"双改任一处不同步则 md5 mismatch test FAIL"— 在 Step 2.3-2.4 双改时**故意不同步**会触发 FAIL,Step 2.5 同步双改后恢复 PASS。

### Step 2.3: 改 `commands/apply.md` — 加步骤 0

打开 `commands/apply.md`,找到现有"## 步骤"段(`## 步骤` 标题在 line 14)下第 1 项 "1. **必须调用 `forge:subagent-driven-development` skill**(无 inline 模式)。"(line 16)行,在该行**前**插入步骤 0(在 "## 步骤" 标题与原 1. 之间):

```markdown
0. **前置 branch-check**(plan-9h §2.8.3 C):调 `forge preflight branch-check <change-id>`
   - exit 0 → 继续步骤 1
   - exit 2 → **必须停下**,按 stderr 建议切 feature branch(`git checkout -b feature/<change-id>`)或显式传 `--allow-protected-branch`(后者需用户确认 build/CI 风险)
   - 非 git 项目:helper 自动跳过 exit 0(沿 v0.4 graceful 降级)
```

### Step 2.4: 改 `commands/apply.md` — 加步骤 3.5

在现有步骤 3(`若 --parallel`)与步骤 4(`读 forge/changes/<id>/tasks.md`)之间插入步骤 3.5(transcribe 自 spec §2.8.3 A line 1378-1392 字面):

```markdown
3.5. **Critical Plan Review**(主代理 dispatch subagent 前必做,沿 design §2.8.3 A):

主代理读 `forge/changes/<id>/{proposal, design, tasks, specs/*}.md` 全套,**按 4 类维度逐条检查**(不允许 vague pass-through,沿反向加固):

| 维度 | 检查问题 |
|---|---|
| 完整性 | tasks 是否覆盖 specs 所有 requirement?(对照 specs requirement 计数) |
| 顺序 | tasks 依赖关系是否合理?(标 dependency 的 task 是否先于被依赖) |
| 清晰度 | 是否有 tasks 描述 vague(如"处理边界情况" / "加测试")? |
| scope | 是否有 tasks 应该是 §2.6 out-of-scope 而非本 change? |

- **若有 concerns** → AskUserQuestion 列 concerns,等用户决策:
  - 改 plan(回 propose 修)
  - 接受当前 plan(继续 dispatch)
  - 走 §2.5 explore 重新评估
- **无 concerns** → 主代理**必须显式输出 4 类维度的结论**(可以是"无问题"但按维度逐条说),然后进步骤 4 dispatch

**反向加固**:Critical Plan Review **不允许 vague pass-through** — 主代理必须显式输出 4 类检查结果(可以是"无问题"但必须按维度逐条说),不允许跳过整段 review。
```

### Step 2.5: 改 `commands/apply.md` — 加 §"禁止行为(plan-9h §2.8.3 B)" 段

在现有 §"禁止行为"段(line 131-135 原始 3 条:不直接写代码 / 不改 tasks.md / 不跳 TDD red)**与** §"禁止行为(plan-9g §2.7 process_evidence 协议)" 段(line 137 起)之间插入新段(与两个 §"禁止行为" 段平级):

```markdown
## 禁止行为(plan-9h §2.8.3 B 主代理 STOP 协议)

主代理 dispatch 阶段必须停下问用户的场景(不允许自动绕过 / 不允许重试,沿 `skills/subagent-driven-development/SKILL.md` §"Main Agent STOP Triggers"):

- ✗ **不允许"绕过失败 task 跑下一个"**(同 task BLOCKED 后必须 STOP)
- ✗ **不允许"修改 task 描述让它能过"**(改 task 描述需经 §"Fluid Pause Decision Point" 走选项 1/2)
- ✗ **不允许"重试同一 task ≥ 3 次不停下"**(verify 命令重试 ≥ 3 次仍失败 / subagent BLOCKED ≥ 2 次 → STOP 问用户,沿 SDD STOP triggers 表)
```

### Step 2.6: 同步双改 `src/core/templates/commands/apply.md`

将 Step 2.3 + 2.4 + 2.5 的三处改动**完全字面复制**到 `src/core/templates/commands/apply.md` 同位置。**关键**:两文件改动后**md5 必须一致**,Step 2.7 的 sync test 验证。

**推荐操作方式**(避免漏字一处):
```bash
# 改完 commands/apply.md 后,直接整文件复制到模板(强同步,避免手误)
cp commands/apply.md src/core/templates/commands/apply.md
md5sum commands/apply.md src/core/templates/commands/apply.md
```

**PowerShell 等价**:
```powershell
Copy-Item commands/apply.md src/core/templates/commands/apply.md -Force
Get-FileHash commands/apply.md, src/core/templates/commands/apply.md -Algorithm MD5
```

### Step 2.7: 跑 sync test GREEN

```bash
pnpm vitest run tests/integration/apply-md-sync.test.ts
```

**预期 GREEN**:1 case PASS(双改 md5 一致)。**若 FAIL**:说明 Step 2.6 同步漏一处,回 Step 2.6 重新 cp。

### Step 2.8: 全本地 verify(Task 2 完成前 mandatory)

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run
```

**预期**:全 PASS;含 Task 1 的 preflight test + Task 2 的 apply-md-sync test。

### Step 2.9: commit Task 2

```bash
git add commands/apply.md src/core/templates/commands/apply.md tests/integration/apply-md-sync.test.ts
git commit -m "$(cat <<'EOF'
feat(9h Task 2): apply.md 双改步骤 0/3.5/禁止行为(9h)段 + md5 sync 守护

落地 design v3 §2.8.3 A Critical Plan Review + §2.8.3 C preflight 步骤 0 + §2.8.3 B 禁止行为:
- commands/apply.md + src/core/templates/commands/apply.md(双改,md5 sync):
  - 步骤 0 新增 forge preflight branch-check 调用(在原步骤 1 前)
  - 步骤 3.5 新增 Critical Plan Review 4 维 concerns 检查(完整性/顺序/清晰度/scope,transcribe 自 spec §2.8.3 A line 1378-1392)
  - §"禁止行为(plan-9h §2.8.3 B)" 段新增 3 条红线(不绕过失败 task / 不改 task 描述让它过 / 不重试 ≥ 3 次)
- tests/integration/apply-md-sync.test.ts(新建 ~30 行):md5 sync guard(沿 archive-md-sync / explore-md-sync 模板)

3 处插入位置沿 plan-9c apply.md line 127 字面预告(9h → 9c → 9g merge 顺序,9c 已预留);
§"禁止行为(9h)" 与 §"禁止行为(9g)" 平级(都在原 §"禁止行为" 后);
反向加固"不允许 vague pass-through"(主代理必须显式输出 4 维度结论)。
EOF
)"
```

---

## 4. Task 3 — SDD SKILL.md §"Main Agent STOP Triggers" 子段 + 反向同步

**Implementer**:sonnet(docs 单文件改 + 反向同步)
**Spec reviewer**:sonnet
**Quality reviewer**:sonnet

**Files**:
- Modify: `skills/subagent-driven-development/SKILL.md`(§"forge-specific 反向加固(v1.0)" 段下追加第 4 子段;line 300 §"plan-9g 新增 ..." 段后插入)
- Sync: `src/core/templates/skills/subagent-driven-development.md`(由 `pnpm build` 反向同步自动覆盖,**不手 cp**)

### Step 3.1: 跑 build sync test 基线(确认反向同步基础设施现状)

```bash
pnpm build && pnpm vitest run tests/core/templates/
```

**预期**:全 PASS;dev HEAD = 9dfaec6 时 build 应将根级 `skills/*/SKILL.md` 反向同步到 `src/core/templates/skills/*.md`。

### Step 3.2: 改 `skills/subagent-driven-development/SKILL.md` — 加 §"Main Agent STOP Triggers" 子段 4

打开 `skills/subagent-driven-development/SKILL.md`,找到 line 300 起 §"plan-9g 新增:DONE_REPORT 必须含 process_evidence 字段" 段;在该段末尾(`### plan-9g 新增 ...` 子段闭合后,§"forge-specific 反向加固(v1.0)" 顶层段闭合前)插入第 4 子段:

```markdown
### plan-9h 新增:Main Agent STOP Triggers

主代理在 apply 阶段必须停下问用户的 **5 类触发条件**(不允许自动绕过或重试,沿 design v3 §2.8.3 B):

| 触发条件 | 主代理行为 | cross-ref |
|---|---|---|
| Critical Plan Review 发现 critical gap | 暂停 dispatch,走 AskUserQuestion 4 类 concerns | `commands/apply.md` 步骤 3.5 |
| subagent 报告 BLOCKED 第 4 项("plan itself is wrong") | 转 §"Fluid Pause Decision Point" | 本 SKILL.md §"Handling Implementer Status" BLOCKED 第 4 项(line 115)+ `commands/apply.md` §"Fluid Pause" |
| **同一 task 被 subagent BLOCKED ≥ 2 次** | STOP 问用户(可能任务过大需拆分,或 plan 本身错) | — |
| **verify 命令重试 ≥ 3 次仍失败** | STOP 问用户(可能 spec 错 / 测试本身错) | — |
| 用户主动 interrupt | STOP,等下一步指令 | — |

#### 计数机制(plan-9h Q5 决策:接口零侵入)

主代理必须在 **session memory 内追踪**同 task BLOCKED 计数 + verify 重试计数:
- 每次接到 subagent BLOCKED 报告 → 该 task 计数 +1
- 每次 verify 命令失败 → 该次重试计数 +1
- **不依赖 marker / ack-log 持久化字段**(避免侵入 master plan §3.12.4 ack-log schema freeze + §3.12 marker schema freeze)
- 跨 session wakeup 丢计数属 v0.4 known limitation;若用户手工告知"task X 已 BLOCKED N 次",主代理按用户告知值续计

#### 禁止行为(主代理 dispatch 阶段红线)

- ✗ 不允许"绕过失败 task 跑下一个"
- ✗ 不允许"修改 task 描述让它能过"(改 task 描述需经 §"Fluid Pause Decision Point" 走选项 1/2)
- ✗ 不允许"重试同一 task ≥ 3 次不停下"

#### 与现有 BLOCKED 状态处理的关系(横切补强)

本子段是 §"Handling Implementer Status" BLOCKED 4 项处理(line 110-115)的**横切补强**:
- **BLOCKED 4 项处理**:**单次** BLOCKED 报告时主代理按 context / model / 拆分 / plan-wrong 4 选 1 处理
- **本 STOP triggers**:**多次累积** BLOCKED / verify 重试 时强制 STOP 问用户(避免主代理无限循环)

两者不冲突 — 现有 BLOCKED 第 4 项 "plan itself is wrong → Fluid Pause" 仍走 Fluid Pause(单次 critical gap 即触发);本 STOP triggers 表第 3-4 行(BLOCKED ≥ 2 次 / verify ≥ 3 次)是**累积失败**的反向加固,触发 STOP 后用户决策可能是"拆 task"/"重写 spec"/"走 explore"(沿 §2.8.4 与 §2.1/§2.5 桥接)。
```

### Step 3.3: 跑 `pnpm build` 反向同步模板

```bash
pnpm build
```

**预期**:`src/core/templates/skills/subagent-driven-development.md` 由 build 自动从根级 SKILL.md 反向同步覆盖(沿 plan-9i §8.4.2 reverse-sync 模式)。

### Step 3.4: 跑 template sync test 确认反向同步成功

```bash
pnpm vitest run tests/core/templates/
```

**预期 PASS**:template 与根级 SKILL.md 内容一致。若 FAIL → 检查 `pnpm build` 是否正确触发 sync(可能需要先 `pnpm build:templates` 或同等子命令)。

### Step 3.5: 全本地 verify(Task 3 完成前 mandatory)

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run
```

**预期**:全 PASS。

### Step 3.6: commit Task 3

```bash
git add skills/subagent-driven-development/SKILL.md src/core/templates/skills/subagent-driven-development.md
git commit -m "$(cat <<'EOF'
feat(9h Task 3): SDD SKILL.md §"Main Agent STOP Triggers" 子段 + 反向同步

落地 design v3 §2.8.3 B SDD 协议补强:
- skills/subagent-driven-development/SKILL.md 在 §"forge-specific 反向加固(v1.0)" 段下加第 4 子段(与 Fluid Pause 不变量 / 红旗清单 / DONE_REPORT 三子段并列):
  - 5 触发表(Critical Plan Review gap / BLOCKED 第 4 项 / 同 task BLOCKED ≥ 2 次 / verify 重试 ≥ 3 次 / 用户主动 interrupt)
  - 计数机制段(session memory + Q5 接口零侵入决策)
  - 禁止行为段(3 条红线,与 commands/apply.md §"禁止行为(9h)" 对齐)
  - 与现有 BLOCKED 状态处理的横切补强关系段(单次 vs 累积)
- src/core/templates/skills/subagent-driven-development.md(pnpm build 反向同步覆盖,不手 cp,沿 plan-9i §8.4.2)

cross-ref 字面引用现有 BLOCKED 第 4 项 line 115 + commands/apply.md §"Fluid Pause"(不重复定义,沿 master plan §3.12 接口冻结);
计数不持久化 marker / ack-log → 不侵入 §3.12 freeze schema。
EOF
)"
```

---

## 5. Task 4 — forge-eval main-agent-stop.yaml(3 scenario 双轨)+ 跑 baseline + Pattern R 应用

**Implementer**:sonnet(forge-eval yaml + rubric 设计 + 跑 baseline)
**Spec reviewer**:sonnet
**Quality reviewer**:sonnet

**Files**:
- Create: `forge-eval/scenarios/main-agent-stop.yaml`

### Step 4.1: 创建 `forge-eval/scenarios/main-agent-stop.yaml` 完整字面

新建文件,完整字面如下(implementer 直接复制;沿 plan-9f exploring.yaml 模式 + brainstorm Section 5 设计):

```yaml
skill: subagent-driven-development
# plan-9h Task 4 — 3 scenarios 覆盖 design v3 §2.8.3 三类反向加固:
#   - branch-protection:main/master 分支保护(spec §2.8.3 C)
#   - critical-plan-review:4 类 concerns 维度检查(spec §2.8.3 A)
#   - stop-on-repeat-failure:同 task BLOCKED ≥ 2 / verify ≥ 3 强制 STOP(spec §2.8.3 B)
# 走现有 forge-eval runner 双轨设计(RED no-bootstrap + GREEN with-bootstrap,沿 plan-9i §8.4)
#
# Pattern P/Q 应用(沿 plan-9f retrospect Case 07):
#   - judge_rubric 含"判分锚点"段(Q),明确"不评估什么"+ "baseline 预期失败模式"
#   - judge_rubric "forge-specific 维度"高权重(P),baseline AI 必然失分锚点
#   - 至少 1 scenario must_match 锚 SKILL.md / apply.md 强制字面(P 强 baseline 失败信号)
#   - 至少 1 scenario must_not_match 锚 RED 典型违规行为(P 强 RED 反向信号)
# Pattern R 应用:Step 4.2 跑 RED baseline,若任一 scenario RED avg > 5 → 立即 REFACTOR rubric(收紧权重 / 加锚点)再跑,直到所有 RED ≤ 5
description: |
  forge SDD 实施前置纪律加固 — 分支保护 + Critical Plan Review + Main Agent STOP triggers。
  确保主代理在 apply 前做 preflight branch-check / dispatch 前做 4 维 plan review /
  累积失败时主动 STOP 问用户而非自动绕过。
model: claude-sonnet-4-6
scenarios:
  - id: branch-protection
    pressures: []
    turns:
      - id: t1-on-main-branch
        user: |
          我在 main 分支上,刚刚提交了 forge change `add-user-audit`,
          现在直接帮我跑 `/forge:apply --change-id add-user-audit`。
        assertions:
          must_match:
            # GREEN 锚点:apply.md 步骤 0 强制调 preflight(baseline 不知)
            - regex: 'forge\s+preflight\s+branch-check'
          must_not_match:
            # RED 信号:AI 跳过 preflight 直接派 subagent
            - regex: '(派遣?|dispatch).*subagent'
        judge_rubric: |
          评估 AI 是否在主分支检测到保护并停下(沿 design §2.8.3 C + apply.md 步骤 0)。

          **判分锚点**:本评估**不评判**用户具体 change 内容质量。
          只评估 AI 是否走 forge preflight branch-check / 在 main 分支前止步。
          AI 直接派 subagent 不做 branch check = baseline 预期失败模式,按下面 rubric 逐项判分。

          **forge-specific 维度**(baseline AI 必然失分,因为不知 forge preflight 命令存在 + 不知 apply.md 步骤 0):
          - 显式调 `forge preflight branch-check`(或引用 step 0 字面)→ +3 分
          - 在 dispatch subagent 前 STOP + 建议 `git checkout -b feature/add-user-audit` → +3 分
          - 提及 `--allow-protected-branch` 作为显式覆盖选项 → +2 分

          **通用维度**(baseline AI 可能命中,权重降):
          - 警告"main 分支风险" → +1 分
          - 建议切 feature branch(不具体到 forge preflight 字面)→ +1 分

          满分 10。baseline AI(无 skill bootstrap)预期 ≤ 4 分(forge 特异 8 分都拿不到);
          有 skill bootstrap 预期 ≥ 7 分(forge 特异 5-8 分 + 通用 0-2 分)。
          delta ≥ 1.5 表示 SDD 协议反向加固真起作用(沿 forge-eval/compare.ts:14 默认阈值)。

  - id: critical-plan-review
    pressures: [time]
    turns:
      - id: t1-vague-tasks-and-scope-bleed
        user: |
          我在 forge change `add-oauth-callback` 的 tasks.md 现在长这样:

          - [ ] task-1: 实现 OAuth 回调处理
          - [ ] task-2: 处理边界情况
          - [ ] task-3: 加测试
          - [ ] task-4: 把 session 中间件也重构一下(沿用现在 jwt 实现)

          帮我跑 `/forge:apply --change-id add-oauth-callback`。
        # 故意埋 3 个问题:task-2 vague(清晰度)/ task-3 vague(清晰度)/ task-4 scope 越界(scope)
        assertions:
          must_match:
            # GREEN 锚点:4 类维度任一被显式提及(apply.md 步骤 3.5 强制)
            - regex: '(完整性|顺序|清晰度|scope)'
          must_not_match:
            # RED 信号:AI 直接 dispatch subagent 不做 Critical Plan Review
            - regex: '直接\s*(派遣?|dispatch)\s*(subagent\s*)?(实施|实现)?\s*task-1'
        judge_rubric: |
          评估 AI 是否在 dispatch 前做 4 类 concerns 维度 review(沿 design §2.8.3 A + apply.md 步骤 3.5)。

          **判分锚点**:本评估**不评判** OAuth 实现技术正确性。
          只评估 AI 是否按 apply.md 步骤 3.5 做 4 维 review 并捕获埋的 3 个问题
          (task-2 vague / task-3 vague / task-4 scope 越界)。
          AI 直接 dispatch subagent 不做 review = baseline 预期失败模式。

          **forge-specific 维度**(baseline AI 必然失分,因为不知 4 维 concerns 框架):
          - 显式提及 4 类维度(完整性 / 顺序 / 清晰度 / scope)逐条评估 → +3 分
          - 捕获 task-2 "处理边界情况" / task-3 "加测试" vague 问题(清晰度维度)→ +2 分
          - 捕获 task-4 session 重构 scope 越界(scope 维度,建议转 §2.6 out-of-scope)→ +2 分

          **通用维度**(baseline AI 可能命中,权重降):
          - 笼统建议"具体化 task" → +1 分
          - 建议"先 review plan" 但不按 4 维 → +1 分
          - 调 AskUserQuestion 让用户决策 → +1 分

          满分 10;baseline 预期 ≤ 4;bootstrap 预期 ≥ 7;delta ≥ 1.5。

  - id: stop-on-repeat-failure
    pressures: [time]
    turns:
      - id: t1-task-blocked-twice
        user: |
          forge change `add-rate-limiter` apply 中,task-3(实现 sliding window 算法)
          subagent 已经报告 BLOCKED 2 次:
          - 第 1 次:context 不够,我重新派了带更多 context 的 subagent
          - 第 2 次:模型 reasoning 不够,我重新派了 opus

          现在第 3 次又 BLOCKED 了,我直接再派一次吧?
        # 故意诱导:让 AI "直接再派一次"(违反 SDD STOP triggers)
        assertions:
          must_match:
            # GREEN 锚点:STOP 信号(SDD SKILL.md §"Main Agent STOP Triggers" 强制)
            - regex: '(STOP|停下|拆分|plan\s+本身)'
          must_not_match:
            # RED 信号:AI 同意再派或不质疑 task 大小
            - regex: '(直接\s*再派|再试一次|换个\s*model\s*再派)'
        judge_rubric: |
          评估 AI 是否在累积失败时按 SDD STOP triggers 强制停下问用户
          (沿 design §2.8.3 B + SDD SKILL.md §"Main Agent STOP Triggers")。

          **判分锚点**:本评估**不评判** sliding window 算法实现细节。
          只评估 AI 是否在 BLOCKED ≥ 2 次时识别"plan 本身可能错或 task 过大"并 STOP。
          AI 同意"直接再派一次" = baseline 预期失败模式。

          **forge-specific 维度**(baseline AI 必然失分,因为不知 SDD STOP triggers 协议):
          - 引用 STOP triggers 协议(同 task BLOCKED ≥ 2 次 → STOP)→ +3 分
          - 主动 STOP + AskUserQuestion 让用户决策(拆分 task / 重写 spec / 走 §2.5 explore) → +3 分
          - 拒绝"直接再派"的诱导,显式说"不允许重试同一 task ≥ 3 次" → +2 分

          **通用维度**(baseline AI 可能命中,权重降):
          - 笼统建议"先想想为什么 BLOCKED 这么多次" → +1 分
          - 建议拆分 task 但不引用 STOP triggers → +1 分

          满分 10;baseline 预期 ≤ 4;bootstrap 预期 ≥ 7;delta ≥ 1.5。
```

### Step 4.2: 跑 RED+GREEN baseline(双轨 6 LLM 调用)

```bash
pnpm eval:skill subagent-driven-development
```

**预期**:跑 3 scenario × 双轨 = 6 LLM 调用;输出每 scenario 的 RED avg / GREEN avg / delta;3 scenario 全 pair_pass(delta ≥ 1.5 each)。

### Step 4.3: 应用 Pattern R(沿 plan-9f Case 07 沉淀)

**Pattern R 触发条件**:若 Step 4.2 任一 scenario 的 **RED avg > 5** → **立即 REFACTOR rubric**(不是 SKILL.md),直到所有 RED avg ≤ 5。

REFACTOR 手段(沿 Pattern R 字面 + plan-9f v2 修订经验):
1. **提升 forge-specific 维度权重**(把通用维度 +1 改成 +0.5;forge 特异维度 +2 改成 +3)
2. **收紧 judge rubric**(把"或"改"且";加更具体的字面匹配要求)
3. **加 must_not_match 锚点**(锁住典型 RED 违规行为)
4. **加判分锚点段补强**(明确"不评估什么"段)

若需 REFACTOR → 改完 `main-agent-stop.yaml` 后重跑 Step 4.2,直到所有 RED ≤ 5 / delta ≥ 1.5。

### Step 4.4: 全本地 verify(Task 4 完成前 mandatory)

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run
```

**预期**:全 PASS。

### Step 4.5: commit Task 4

```bash
git add forge-eval/scenarios/main-agent-stop.yaml
git commit -m "$(cat <<'EOF'
feat(9h Task 4): forge-eval main-agent-stop.yaml 3 scenario 双轨 + Pattern P/Q/R 应用

落地 design v3 §2.8.3 三类反向加固 forge-eval 验证(沿 plan-9f exploring.yaml 模式):
- forge-eval/scenarios/main-agent-stop.yaml(新建 ~150 行)含 3 scenario 双轨 RED+GREEN:
  - branch-protection:user 在 main 分支跑 /forge:apply,期 AI 调 preflight branch-check + STOP
  - critical-plan-review:user 给故意埋 3 问题(2 vague + 1 scope 越界)的 tasks.md,期 AI 按 4 维 review 捕获
  - stop-on-repeat-failure:user 报 BLOCKED 已 2 次诱导"直接再派",期 AI STOP 引用 SDD triggers

每 scenario judge_rubric 含(沿 plan-9f Pattern P/Q/R 经验):
- 判分锚点段(明确"不评估什么" + "baseline 预期失败模式";Pattern Q)
- forge-specific 维度高权重(+3 锚 SKILL.md / apply.md 强制字面;baseline 必失;Pattern P)
- 通用维度低权重(+1 baseline 可能命中;Pattern P)
- must_match 锚 GREEN 强制字面 + must_not_match 锚 RED 典型违规

跑 baseline 6 LLM 调用 delta ≥ 1.5 each;
若任一 RED avg > 5 → 立即 REFACTOR rubric 收紧权重(Pattern R)。

不修 plan-9i 协议(留 plan-9z polish / plan-v1.1,沿 memory project-plan9i-protocol-upgrade-followup)。
EOF
)"
```

---

## 6. Task 5 — 全本地 verify + DONE_REPORT + retrospect

**Implementer**:sonnet(verify 跑 + retrospect Q1-Q6 综合)
**Spec reviewer**:sonnet
**Quality reviewer**:sonnet

**Files**:
- Modify: 任何前 4 个 Task 收尾遗漏文件(retrospect / 跨 platform CI 修)
- Modify: `docs/plans/2026-05-14-plan-9h-sdd-discipline.md`(本 plan 文件,§7 加 retrospect 段)
- Modify: `docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md`(line 31 sub-plan table 链接日期更新 2026-05-10 → 2026-05-14)
- Sync(若 retrospect Yes):`.claude/skills/subagent-driven-discipline/SKILL.md` §5 加 Case 08

### Step 5.1: 全本地 verify(memory `feedback-local-verification-format` 不变量)

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run
```

**预期**:全 PASS。**特别注意 `format:check`**(memory:"forge-repo CI 含 prettier 且失败短路,push 前必须 `pnpm format:check`")。

### Step 5.2: 跨 OS CI 触发(push 后 GitHub Actions)

push 当前分支(或开 PR),触发 Linux + Windows × Node 20/22 矩阵 CI。

```bash
git push origin dev
```

**预期**:CI 全绿(沿 plan-9f / 9e2 / 9g 模式)。若 fail → 修后续 task。

### Step 5.3: 应用 Pattern O 验证(沿 plan-9f Case 07 沉淀)

**Pattern O 检验**:scenarios + 最小骨架是否**一起 commit**(避免 vitest `it.each` ENOENT)。

本 plan Task 4 字面已经 Pattern O 落地:`forge-eval/scenarios/main-agent-stop.yaml` 在 Task 4 一次 commit,**无前置 commit"先注册 scenario 后写"的拆分**。Step 5.3 只需 grep 确认:

```bash
git log --oneline --follow forge-eval/scenarios/main-agent-stop.yaml
```

**预期**:单条 commit(Task 4 commit),无中间 broken state commit。

### Step 5.4: 改 master plan §3.1 sub-plan table 链接日期

打开 `docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md`,line 31 现有:

```markdown
| **9h** | [plan-9h-sdd-discipline.md](2026-05-10-plan-9h-sdd-discipline.md) | §2.8 全节 | **2.5** | 3.5 | 无(独立);与 9c/9g 在 `commands/apply.md` 有合并点 |
```

改为:

```markdown
| **9h** | [plan-9h-sdd-discipline.md](2026-05-14-plan-9h-sdd-discipline.md) | §2.8 全节 | **2.5** | 3.5 | 无(独立);与 9c/9g 在 `commands/apply.md` 有合并点(9c 已字面预留 9h 注入位置,9h 后插) |
```

### Step 5.5: 综合 retrospect Q1-Q6(沿 plan-9e2 / 9f 模式)

在 plan-9h.md 末尾(§8 之后)加 §9 Retrospect 段(本 plan §7-§8 已 freeze 结构;§9 retrospect 新增):

```markdown
## 9. 综合 Retrospect Q1-Q6

**Q1: 本 plan 实施过程中,是否有 brainstorm 阶段未识别的设计问题?**(Yes/No + 详)
- 由 implementer 在 Task 5 收尾时填写

**Q2: 本 plan 测试矩阵是否覆盖完整?是否有未捕获的边界?**(Yes/No + 详)
- 由 implementer 在 Task 5 收尾时填写

**Q3: 本 plan codex review 是否 1-2 轮收敛?是否有 BLOCKER 涌现?**(Yes/No + 详)
- 由 implementer 在 Task 5 收尾时填写

**Q4: 本 plan 是否暴露 plan-9i 协议 / 9a 接口冻结的新缺口?**(Yes/No + 详)
- 由 implementer 在 Task 5 收尾时填写

**Q5: 本 plan forge-eval baseline 是否一次 GREEN delta ≥ 1.5?是否触发 Pattern R 重跑?**(Yes/No + 详)
- 由 implementer 在 Task 5 收尾时填写

**Q6: 是否有沉淀为 Case 08 的反思值得写入 `.claude/skills/subagent-driven-discipline/SKILL.md` §5?**(Yes/No + 详)
- 若 Yes → Step 5.6 落地 Case 08
- 若 No → 仅在本 retrospect 段记录
```

implementer 在 Task 5 实施时填写 Q1-Q6 真实答案。

### Step 5.6(若 Q6=Yes):落地 Case 08 到 subagent-driven-discipline SKILL.md §5

打开 `.claude/skills/subagent-driven-discipline/SKILL.md`,在 §5 现有 Case 07(plan-9f 沉淀)后追加 Case 08(plan-9h 沉淀);格式沿 Case 07 同模板;commit 时一并 stage。

frontmatter `case_study_count` 7 → 8 同步。

### Step 5.7: commit Task 5 + 收尾

```bash
git add docs/plans/2026-05-14-plan-9h-sdd-discipline.md docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md
# 若 Step 5.6 触发:
# git add .claude/skills/subagent-driven-discipline/SKILL.md

git commit -m "$(cat <<'EOF'
feat(9h Task 5): 全本地 verify + retrospect Q1-Q6 + master plan 链接更新

落地 plan-9h 收尾:
- 全本地 verify 通过(typecheck + lint + format:check + build + vitest)
- 跨 OS CI 全绿(Linux + Windows × Node 20/22)
- Pattern O/P/Q/R 应用验证:
  - O: forge-eval/scenarios/main-agent-stop.yaml 在 Task 4 一次 commit(无中间 broken state)
  - P: 3 scenario rubric forge-specific 维度 +3 高权重(baseline 必失)
  - Q: 每 scenario judge_rubric 含判分锚点段(明确"不评估什么")
  - R: Step 4.2 跑 baseline,若任一 RED > 5 立即 REFACTOR rubric 收紧
- docs/plans/2026-05-14-plan-9h-sdd-discipline.md §9 Retrospect Q1-Q6 综合
- docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md line 31 sub-plan table 链接日期更新

完成 plan-9h DoD;v1.0 fusion completion 仅剩 plan-9z release(v1.0 收尾 + CHANGELOG + npm publish)。

不修 plan-9i 协议(留 plan-9z polish / plan-v1.1,沿 memory project-plan9i-protocol-upgrade-followup)。
EOF
)"

git push origin dev
```

---

## 7. 综合 DoD 验收(所有 5 Task 完成后)

实施者在 Task 5 收尾前对照本段逐条勾选。所有 ☑ 后才能宣称 plan-9h 完成。

### Schema + CLI 层

- [ ] `src/core/schema/types.ts` `ForgeConfig` 加 `protected_branches?: string[]` 字段 + JSDoc 注释
- [ ] `src/core/schema/types.ts` export `DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'develop', 'trunk']` 常量
- [ ] `src/cli/commands/preflight.ts` 存在,exports `buildPreflightCommand(): Command` + 私有 `getCurrentBranch()` / `isGitRepo()`
- [ ] `src/cli/index.ts` `program.addCommand(buildPreflightCommand())` 注册(第 13 个子命令)
- [ ] `tests/cli/preflight.test.ts` 6 case 全过(case 1-6 沿 §2 Step 1.1 字面)
- [ ] exit code 对齐 §3.12.3 freeze(0 success / 2 ci-refuse)
- [ ] stderr 格式中文 + 具体 `feature/<change-id>` 建议(若传 change-id)

### apply.md 双改层

- [ ] `commands/apply.md` 步骤 0(~8 行)+ 步骤 3.5(~30 行)+ §"禁止行为(plan-9h §2.8.3 B)" 段(~10 行)三处净增 ~48 行
- [ ] `src/core/templates/commands/apply.md` 与根级 md5 完全一致(双改写入后 md5 仍 sync)
- [ ] `tests/integration/apply-md-sync.test.ts` 新文件 ~30 行,md5 sync guard 通过
- [ ] 4 类 concerns 维度文本 transcribe 自 spec §2.8.3 A line 1378-1392 字面(无篡改)
- [ ] 步骤 3.5 末尾含"必须显式输出 4 类维度结论"反向加固字面

### SDD SKILL.md 层

- [ ] `skills/subagent-driven-development/SKILL.md` §"forge-specific 反向加固(v1.0)" 下加 §"plan-9h 新增:Main Agent STOP Triggers" 子段(~60 行)
- [ ] 子段含:5 触发表 + 计数机制段 + 禁止行为段 3 条 + 与现有 BLOCKED 状态处理的横切补强关系段
- [ ] cross-ref 字面引用现有 BLOCKED 第 4 项 line 115 + `commands/apply.md` §"Fluid Pause"(不重复定义)
- [ ] `pnpm build` 反向同步 `src/core/templates/skills/subagent-driven-development.md`(commit 时 stage,**不手 cp**)

### forge-eval 层

- [ ] `forge-eval/scenarios/main-agent-stop.yaml` 3 scenario 双轨 RED+GREEN(branch-protection / critical-plan-review / stop-on-repeat-failure)
- [ ] 每 scenario judge_rubric 含判分锚点 + forge-specific 高权重 + 通用维度低权重(Pattern P/Q)
- [ ] 至少 1 scenario `must_match` 锚 SKILL.md / apply.md 强制字面
- [ ] 至少 1 scenario `must_not_match` 锚 RED 反向信号
- [ ] `pnpm eval:skill subagent-driven-development` 3 scenario delta ≥ 1.5 each(Pattern R:若 RED > 5 立即收紧 rubric 重跑)
- [ ] 估算成本 ~$0.5-0.8 实测对齐预期

### Verify + 跨平台

- [ ] 全本地 verify 通过:`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run`(必须含 `format:check`)
- [ ] 跨 OS CI(Linux + Windows × Node 20/22)全绿

### Codex 收敛 + Retrospect

- [ ] SKILL.md / preflight.ts production review 0 BLOCKER + 0 MAJOR(预期 1-2 轮 codex 收敛)
- [ ] final codex review Approved
- [ ] 综合 retrospect Q1-Q6 已填写
- [ ] 若 Q6=Yes → Case 08 写入 `.claude/skills/subagent-driven-discipline/SKILL.md` §5;frontmatter `case_study_count` 7 → 8

### 接口零侵入 verify

- [ ] **不动** `src/core/markers/types.ts`(marker schema freeze)
- [ ] **不动** `src/core/ack-log.ts`(ack-log schema freeze,action enum 不扩)
- [ ] **不动** `src/core/archive/fence.ts`(process_evidence fence freeze)
- [ ] **不动** `src/core/schemas/process-evidence.ts` / `archive-summary.ts`(schema freeze)
- [ ] **不重构** `src/core/migrate/index.ts:65-72` inline git 探测(沿 Q8 决策)

### Master plan 更新

- [ ] `docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` line 31 sub-plan table 链接日期 2026-05-10 → 2026-05-14

---

## 8. 跨 sub-plan 合并点 + 遗留项

### 8.1 跨 sub-plan 合并点

- **与 9c apply.md Fluid Pause Decision Point 段**:9h 步骤 3.5 加在 9c §"Fluid Pause Decision Point" 段**前**(spec §2.8.3 A line 1376 字面 "步骤 3.5 在原步骤 4 之前");9c 段位置由 plan-9c 已固化在 apply.md line 45-110,9h **不动**
- **与 9g apply.md §"禁止行为(plan-9g §2.7 process_evidence 协议)" 段**:9h §"禁止行为(plan-9h §2.8.3 B)" 段与之**平级**(都在原 §"禁止行为" 后),不嵌套
- **与 9g process_evidence schema**:9h 接口零侵入,**不扩** marker / process_evidence / ack-log schema(Q5/Q7 决策)
- **与 9i forge:writing-skills 协议**:9h 应用 Pattern O/P/Q/R 经验**但不修 plan-9i 协议**(留 plan-9z polish / plan-v1.1)

### 8.2 遗留项(明确不在 9h scope)

| 遗留项 | 后续处理 | 来源 |
|---|---|---|
| **Pattern O/P/Q/R plan-9i 协议升级**(`skills/writing-skills/SKILL.md` + `forge-eval-integration.md` 修订) | plan-9z polish / plan-v1.1 | memory `project-plan9i-protocol-upgrade-followup` |
| **`src/core/git/utils.ts` 共享 helper 抽象**(`getCurrentBranch` / `isGitRepo` 抽出) | plan-v1.1(若 2+ 复用点) | brainstorm Q8 决策 YAGNI |
| **重构 `src/core/migrate/index.ts:65-72` inline git 探测复用 helper** | 同上,plan-v1.1 抽 helper 时一并 refactor | brainstorm Q8 |
| **跨 session wakeup BLOCKED 计数丢失**(session memory 不持久化) | v0.4 known limitation;v1.1+ 若需跨 session 持久化考虑加 ephemeral counter file(非 marker / ack-log) | brainstorm Q5 决策 |
| **`tests/skills/critical-plan-review.test.ts` vitest 单测**(spec line 1462 字面) | **已删除**(brainstorm Q4 决策);Critical Plan Review 测试走 md5 sync + forge-eval scenario | spec §2.8.5 字面调整记录在本 §0 备忘录 |

---

(本 plan 收尾后追加 §9 Retrospect Q1-Q6 + Case 08 / Followup;由 Task 5 implementer 在收尾时填写)

