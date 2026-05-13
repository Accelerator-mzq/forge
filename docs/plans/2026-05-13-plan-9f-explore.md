# Plan 9f — forge:exploring skill + /forge:explore 命令落地

> **For agentic workers:** REQUIRED SUB-SKILL: 本 phase 走 **forge:writing-skills 协议**(plan-9i 已落地的五步骤 RED-GREEN-REFACTOR),不走 superpowers:subagent-driven-development。9f 是 forge:writing-skills 的 **first real use case**(沿 design §2.9.5 dogfood 设计意图)。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:落地 `/forge:explore` 命令 + `forge:exploring` skill + capture decisions 协议 + using-forge bootstrap meta-entry 段及红旗清单 — fusion completion 9 个 sub-plan 中 explore/思考空间能力落地(沿 design §2.5 全节 + §2.6.6 区分指引表)。

**Architecture**:四层落地 — (1) **registry 层**:`src/core/templates/skills/index.ts` SKILL_NAMES 加 `'exploring'`;`src/core/templates/commands/index.ts` COMMAND_NAMES 加 `'explore'`;hardcoded 断言数同步上调(沿 plan-9i Task 0 模式)。(2) **skill 层**:`skills/exploring/SKILL.md`(~300-500 行,4-6 标定 example,包含 4 必备 section + §2.6.6 区分指引表 + §2.5.6 反向加固三条);`src/core/templates/skills/exploring.md` 由 `pnpm build` 反向同步自动生成(不手 cp,沿 plan-9i §8.4.2 修订)。(3) **command 层**:`commands/explore.md`(~30 行薄包装)+ `src/core/templates/commands/explore.md` **双改**(md5 sync invariant 守护,沿 plan-9e2 archive-md-sync 模式);`commands/apply.md` + 模板双改加 `## Fluid Pause Decision Point` 段 cross-ref。(4) **forge-eval 层**:`forge-eval/scenarios/exploring.yaml`(3 scenarios:vague idea / mid-implementation stuck / option compare,走现有 runner 双轨 RED+GREEN 配对设计)。(5) **bootstrap 层**:`skills/using-forge/SKILL.md` slash commands 表加 explore 行 + 红旗清单加"实施中模糊 → 走 explore"条目(reverse-sync 自动覆盖 template)。

**Tech Stack**:Markdown(skill / command 文档)+ 现有 forge-eval/ YAML 框架(@anthropic-ai/sdk LLM-as-judge)+ vitest(registry 断言 + md5 sync guard)。**无新 npm 依赖、无 src/cli 改动、无 src/core schema 改动**(沿 design §2.5.8 第 5 项:explore 是 skill 驱动,无 CLI fence)。

**Spec 引用**:
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §2.5 全节(§2.5.1-2.5.8;§2.5.7 skill 来源/forge 化改动/保留项字面;§2.5.8 实施清单 6 项)+ §2.6.6 区分指引表(SUGGESTION / Future Work / Non-Goals / Out of Scope 4 状态)+ §2.9 全节(writing-skills 协议)
- master plan §3.6(P50 3 工日 / P90 4 工日;前置 9a / 9b / 9i)+ Week 5 line 593
- plan-9i `skills/writing-skills/SKILL.md`(五步骤协议 + 4 必备 section + 红旗清单格式)
- plan-9i Task 0 SKILL_NAMES 扩展模式(已落地,9f 直接套)
- plan-9e2 Task 5 commands/* 双同步 md5 sync guard 模式(`tests/integration/archive-md-sync.test.ts`)
- OpenSpec 上游 `src/core/templates/workflows/explore.ts`(255 行)— 4 entry point example + ASCII diagram 鼓励 + 选项对比模式(transcribe + forge 化)

**P50 工日**:**2.5**(0.3 registry + 0.4 RED scenarios + 0.8 SKILL.md production + 0.3 command + 0.4 GREEN/REFACTOR + 0.3 using-forge entry & retrospect)
**P90 工日**:**3.5**(P50 + 1.0d buffer ~40%;含跨 OS CI + codex 收敛轮次 + DONE_REPORT 纪律时长)

**前置(必须完成)**:
- plan-9a 横切层基础(已合 dev)
- plan-9b out-of-scope 协议(已合 dev,§2.6.6 区分指引表 schema 由 9b 立)
- plan-9i forge:writing-skills 协议(已合 commit 7862862):`skills/writing-skills/SKILL.md` 五步骤 + frontmatter 规范 + forge-eval integration + registry 扩展模板可复用

**后续 unblocked**:
- plan-9h SDD 实施前置纪律加固(独立模块)
- plan-9z release(v1.0 收尾;统一全路径 CHANGELOG + npm publish)

**DoD**(完成定义):

- **registry**:
  - `src/core/templates/skills/index.ts` 的 `SKILL_NAMES` 加 `'exploring'`(13 → 14)
  - `src/core/templates/commands/index.ts` 的 `COMMAND_NAMES` 加 `'explore'`(8 → 9)
  - hardcoded 断言同步:`tests/core/templates/registry.test.ts` + `tests/smoke.test.ts`(skill 13→14 / command 8→9 + 完整数组加入)
- **skill**:
  - `skills/exploring/SKILL.md` 存在,~300-500 LOC
  - 含 4 必备 section(Methodology / When to Use & When NOT to Use / forge-specific 反向加固 / 红旗清单)
  - 含 4-6 标定 example(从 OpenSpec entry point 4 例 transcribe + forge 化:vague idea / specific problem / mid-implementation stuck / compare options + 至少 1 forge 专属 example)
  - 含 §2.5.6 反向加固三条字面落地("必须显式收尾" / "Capture offer 必须可执行" / "AI 不能在 explore 阶段直接写 artifacts")
  - 含 §2.5.5 与 §2.1 Fluid Pause 边界段(mid-implementation 阻塞型 issue → Fluid Pause;开放思考 → explore)
  - 含 §2.6.6 区分指引表(4 状态完整 transcribe;SUGGESTION / Future Work / Non-Goals / Out of Scope)
  - 含 capture decisions 表(5 类 forge 路径替换;沿 §2.5.4 表)
  - `src/core/templates/skills/exploring.md` 由 `pnpm build` 反向同步自动生成(commit 时 stage,**不手 cp**;沿 plan-9i §8.4.2)
- **command**:
  - `commands/explore.md` 存在,~30 行薄包装,沿 §2.5.3 命令形态(`/forge:explore [<topic> | --change <id>]`)
  - `src/core/templates/commands/explore.md` 与根级**完全一致**(md5 sync)
  - `commands/apply.md` + `src/core/templates/commands/apply.md` 双改加 cross-ref(§"Fluid Pause Decision Point"段加"如果是开放探索而非阻塞型 issue,转 `/forge:explore --change <id>`",沿 design §2.5.8 第 4 项)
- **forge-eval**:
  - `forge-eval/scenarios/exploring.yaml` 含 3 scenarios(`vague-idea` / `mid-implementation-stuck` / `option-compare`)
  - 每个 scenario 含 `judge_rubric` 覆盖 RED + GREEN 两侧(沿 plan-9i §8.4 单文档双轨设计)
  - 必含 RED 反向加固验证:**至少 1 scenario must_match 锁"AI 无限发散无收尾"或"AI 直接改 artifacts 跳过 capture offer"信号**(对应 §2.5.6 反向加固三条)
  - `pnpm eval:skill exploring` 跑双轨,GREEN delta ≥ 1.5 over RED(沿 `forge-eval/compare.ts:14` `DEFAULT_DELTA_THRESHOLD`)
- **bootstrap**:
  - `skills/using-forge/SKILL.md` 的 slash commands 表加 `/forge:explore` 行
  - `skills/using-forge/SKILL.md` 的 forge 红旗清单段加"实施中模糊 → 走 explore 不要直接改 artifacts"(沿 design §2.5.8 第 3 项)
  - `src/core/templates/skills/using-forge.md` 由 `pnpm build` 反向同步自动覆盖
- **测试**:
  - `tests/core/templates/registry.test.ts` 扩 14-item 完整数组断言 + 9-item commands 数组
  - `tests/smoke.test.ts` 扩 14 / 9 hardcoded 数量断言
  - `tests/integration/explore-md-sync.test.ts`(新)— 1 case `commands/explore.md` 与 `src/core/templates/commands/explore.md` md5 完全一致(沿 `tests/integration/archive-md-sync.test.ts` 模板)
  - `tests/integration/apply-md-sync.test.ts` 若不存在则新增(沿同模板);若已存在则当 9f 改 apply.md 时无需新增,跑现有 sync test 验证回归
- **verify**:
  - 全本地 verify 通过(`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run`,memory `本地 verification 必须含 format:check` 不变量)
  - 跨 OS CI(Linux + Windows × Node 20/22)全绿
- **codex 收敛**:
  - SKILL.md production review 0 BLOCKER + 0 MAJOR(预期 1-2 轮收敛;docs heavy,codex finding 主要在 rubric 精度 + example 边界)
  - final review Approved
- **retrospect**:
  - 综合 retrospect Q1-Q6;Yes 触发 Case 07 写入 `.claude/skills/subagent-driven-discipline/SKILL.md` §5(沿 plan-9e2 retrospect Case 06 模式)

---

## 0. Scope freeze + 不做项声明

**本 plan freeze 时,以下代码状态为 plan-9i / 9j HEAD(fbbf1f9)现状**:
- `src/core/templates/skills/index.ts` SKILL_NAMES 含 13 项(plan-9i 加 'writing-skills' 后)
- `src/core/templates/commands/index.ts` COMMAND_NAMES 含 8 项
- `skills/writing-skills/SKILL.md` 五步骤协议已就绪;runner 双轨设计已实测可用(plan-9i §8.4 验证)
- `commands/apply.md` 含 `## Fluid Pause Decision Point` 段(plan-9c 已落地)— 9f 改此段加 cross-ref,不重新设计 Fluid Pause 协议

**本 plan 明确不做**(沿 design §2.5.8 + master plan §3.6;若提议扩做需独立 sub-plan):
- ❌ **不引入 CLI fence**:no `src/cli/commands/explore.ts`;explore 是 skill 驱动,fence 在后续 verify/archive 阶段自然拦截(沿 §2.5.4 第 5 项 + §2.5.8 第 5 项)
- ❌ **不动 marker schema / archive 不变量**:explore capture 写 artifacts 后由现有 `content_hash` 变更机制让 marker 自然失效;不加新 invariant
- ❌ **不实施 §2.6.6 表对 receiving-code-review / verifying-three-dimensions skill 的同步加表**:design §2.6.8 第 7-8 项是 9b out-of-scope phase 的工作,9f 只负责 `skills/exploring/SKILL.md` 自身这一份表
- ❌ **不动 forge-eval runner**:沿 plan-9i §8.4 决定,不引入 `phase: red/green` / `expected_judge_score_max` / `expected_violations` 字段(runner 不读;留 v1.0 后独立 sub-plan reconcile)
- ❌ **不做 explore 命令的 CLI 子命令变体**(如 `forge explore list-captures`):design §2.5 全节未提,留 v1.1+

---

## 1. File Structure

### 新增文件

```
skills/exploring/SKILL.md                          ← Task 1:最小骨架(~10-15 行让 GREEN leg 不 ENOENT)→ Task 2:~300-500 行完整协议
commands/explore.md                                ← Task 1:最小骨架 → Task 3:~30 行薄包装
forge-eval/scenarios/exploring.yaml                ← Task 1:3 scenarios(vague-idea / mid-implementation-stuck / option-compare)
tests/integration/explore-md-sync.test.ts          ← Task 3:1 case md5 sync 守护(双文件完全一致)
```

### 修改文件

```
src/core/templates/skills/index.ts                 ← Task 0:SKILL_NAMES 加 'exploring'(13 → 14)
src/core/templates/commands/index.ts               ← Task 0:COMMAND_NAMES 加 'explore'(8 → 9)
tests/core/templates/registry.test.ts              ← Task 0:hardcoded 13/8 → 14/9 + 完整数组加入
tests/smoke.test.ts                                ← Task 0:hardcoded 13/8 → 14/9 同步
commands/apply.md                                  ← Task 3:`## Fluid Pause Decision Point` 段加 cross-ref
src/core/templates/commands/apply.md               ← Task 3:同步双改
skills/using-forge/SKILL.md                        ← Task 5:slash commands 表加 explore 行 + 红旗清单加条目
```

### Build 自动生成文件(commit 时 stage,**不手写**)

```
src/core/templates/skills/exploring.md             ← scripts/copy-templates.mjs 反向同步(自动加 forge: 前缀;Task 1 build 时生成,Task 2 内容更新后 re-build)
src/core/templates/skills/using-forge.md           ← Task 5 改 skills/using-forge/SKILL.md 后 pnpm build 反向同步
src/core/templates/commands/explore.md             ← Task 3:**不是 reverse-sync,需手工 Write 双同步**;由 md5 sync guard 钉住一致性(commands 走根级 → templates 单向 copy,沿 plan-9e2 archive-md-sync 模式)
dist/core/templates/...                            ← build 输出(若 .gitignore 不排除则 stage)
```

**重要差异声明**(沿 plan-9i §8.4.2 + plan-9e2 Task 5):
- `skills/*` → `src/core/templates/skills/*`:由 `scripts/copy-templates.mjs:49` 反向同步**自动加 `forge:` 前缀**;直接 cp 会触发 `tests/core/templates/skills.test.ts:12` 断言失败
- `commands/*` → `src/core/templates/commands/*`:由 `scripts/copy-templates.mjs:105` 同步,**但 commands 内容无 forge: 前缀 transform**,所以可手 cp 但**推荐用 Write 双 file 同时改 + md5 sync guard 钉住** — 沿 plan-9e2 model

### 不修改文件(明确边界)

```
src/cli/commands/                                  ← 无任何 CLI 改动(§2.5.8 第 5 项)
src/core/schemas/                                  ← 无 schema 改动
src/core/archive/                                  ← 无 fence/invariant 改动
forge-eval/runner.ts                               ← 不扩展(沿 plan-9i §8.4)
forge-eval/types.ts                                ← 不加 phase / expected_violations 字段
skills/receiving-code-review/SKILL.md              ← §2.6.6 表对此 skill 的同步加表是 9b 工作,9f 不动
skills/verifying-three-dimensions/SKILL.md         ← 同上,9d 已合(若未合则 9d 工作),9f 不动
```

---

## 2. Task 拆分(累计 P50 2.5 工日,6 task)

| Task | 名称 | 工日 P50 | 关键交付 |
|------|------|---------|---------|
| 0 | registry 扩展(SKILL_NAMES + COMMAND_NAMES + hardcoded 断言) | 0.3 | `src/core/templates/skills/index.ts` 加 `'exploring'` + `src/core/templates/commands/index.ts` 加 `'explore'` + 3 处 hardcoded 断言同步;**不写 placeholder**(build 时反向同步生成,沿 plan-9i Task 0) |
| 1 | scenarios.yaml + 最小骨架 SKILL/command + 跑 RED baseline | 0.4 | `forge-eval/scenarios/exploring.yaml` 3 scenarios + `skills/exploring/SKILL.md` 最小骨架(~10-15 行)+ `commands/explore.md` 最小骨架(~10 行)+ `pnpm build` reverse-sync + `pnpm eval:skill exploring` 跑双轨看 RED avg ≤ 5(沿 plan-9i Task 1) |
| 2 | SKILL.md production code(~300-500 行,4-6 example) | 0.8 | `skills/exploring/SKILL.md` 完整;含 4 必备 section + §2.5.5/2.5.6/2.6.6 三段 + capture decisions 表 + 4-6 标定 example(从 OpenSpec explore.ts entry point 4 例 + 至少 1 forge 专属)|
| 3 | command + md5 sync guard + apply.md cross-ref | 0.3 | `commands/explore.md` ~30 行 + `src/core/templates/commands/explore.md` 双同步 + `tests/integration/explore-md-sync.test.ts` 1 case + `commands/apply.md` + 模板双改加 Fluid Pause cross-ref |
| 4 | GREEN leg 跑通 + REFACTOR + codex final review | 0.4 | 跑 `pnpm eval:skill exploring` 验证 delta ≥ 1.5;不达标回 Task 2 加红旗清单 plug(**反向依赖 Task 2**);跑全本地 verify;codex final review 0 BLOCKER + 0 MAJOR 收敛 |
| 5 | using-forge meta-entry + 红旗清单 + 综合 retrospect | 0.3 | `skills/using-forge/SKILL.md` slash commands 表加行 + 红旗清单加条目 + `pnpm build` reverse-sync + 跨 OS CI 验证;综合 retrospect Q1-Q6;Yes 触发 Case 07 写入 `subagent-driven-discipline/SKILL.md` §5 |

**串行约束 + 反向依赖**(沿 plan-9i §0):
- Task 0 必须先(否则 Task 1 跑 `pnpm eval:skill exploring` CLI 拒绝,沿 `forge-eval/index.ts:34`)
- Task 1 → Task 2:RED leg 没失败(RED avg > 5)= skill 没必要(沿 superpowers 上游 writing-skills line 16 不变量);若 RED 不失败 → 回头收紧 must_match / judge_rubric
- Task 3 与 Task 2 弱耦合(命令薄包装内容独立于 SKILL.md 详尽内容,可与 Task 2 后期并行)
- Task 4 → Task 2 **反向链**:GREEN delta < 1.5 时必须回改 SKILL.md 加红旗 plug,REFACTOR 是合规迭代(沿 plan-9i Task 5)
- Task 5 集成,放最后

---

## 3. 关键设计决策(transcribe 自 design §2.5,不发散)

### 3.1 命令形态(§2.5.3 字面)

`/forge:explore [<topic> | --change <id>]`

- 无参数:开放探索,不绑定具体 change
- `<topic>`:用户给的探索主题(自由文本)
- `--change <id>`:绑定本 change,explore 时读该 change 的 4 件套作为上下文(典型 mid-implementation 用法)
- 主代理在 `/forge:apply` subagent 实施中、检测到唯一未归档 change 时,允许省略 `--change`(沿 v0.4 推断模式)

### 3.2 协议步骤(§2.5.4 字面)

1. **读上下文**(若 `--change <id>`):`forge/changes/<id>/{proposal,design,tasks,specs/*}.md`
2. **必须调用 `forge:exploring` skill**(本 plan 新建)
3. **探索阶段**(skill 引导):AI 鼓励 ASCII diagram / 选项对比 / 反思 assumption;不限定输出格式;不强制 reach a conclusion(沿 OpenSpec explore.ts:252);用户随时叫停/转向
4. **Capture offer 阶段**:5 类(New requirement / Design decision / Scope changed / **Out-of-scope** / New work identified / Assumption invalidated)→ 各对应 forge 路径(沿 §2.5.4 表)
5. **Capture 是 offer 不是命令**:AI 给 offer 后用户可拒绝/修改/推迟(沿 OpenSpec explore.ts:132 "The user decides — Offer and move on")

### 3.3 反向加固三条(§2.5.6 字面)

- **必须有显式收尾**:exploring skill 末尾强制 AI 输出 "Exploration Summary":列 N 个 tentative decision + capture offer。**禁止"探索完成无结论"**
- **Capture offer 必须可执行**:每个 offer 必须给具体 `file:section`,不允许 vague"也许更新一下 design"
- **AI 不能在 explore 阶段直接写 artifacts**:写入必须经过 capture offer + 用户确认两步,沿 OpenSpec "Don't auto-capture"(explore.ts:132)

### 3.4 与 §2.1 Fluid Pause 边界(§2.5.5 字面)

- explore 在 mid-implementation 触发,如果发现 issue 阻塞当前 task → 不直接走 explore capture,而是引导主代理走 §2.1 Fluid Pause(因为这种是被 issue 推动的,语义匹配 pause-with-Options)
- 开放思考(非阻塞,非被动)→ 走 explore
- **explore 不能绕过 archive 不变量**:archived change 是冻结的,explore 触发对 archived change artifacts 的修改 → 拒绝(沿 v0.4 archive 不变量)

### 3.5 4-6 标定 example 来源

来自 OpenSpec `src/core/templates/workflows/explore.ts` 4 entry point(可直接 transcribe + forge 化):

1. **vague idea**:用户提"我想加 X 功能但不确定怎么做" → 不绑定 change,开放 ASCII 探索
2. **specific problem**:用户提"OAuth refresh token 怎么处理 grace period" → 单点问题选项对比
3. **mid-implementation stuck**:用户在 `/forge:apply` 中提"OAuth 集成比想象复杂,需要重新想想" → `--change <id>` 读 4 件套 + 探索 + offer capture
4. **compare options**:用户提"A 方案 vs B 方案,我想想 tradeoff" → ASCII diagram 选项对比表

**至少 1 forge 专属 example**(因 OpenSpec 4 例 forge 化时已覆盖,可选加 1 个边界:发现 out-of-scope 转 §2.6 follow-up 的 capture offer 示例)。

### 3.6 §2.6.6 区分指引表完整 transcribe

| 状态 | 写到 | 语义 | AI 判定指引 |
|---|---|---|---|
| **应在本 change 做但低优先级** | `verify_findings` / `review_outcomes` 中 SUGGESTION | 本 change 内的 nice-to-have | "可定位 + 可修复 + 不做也不影响本 change 核心目标" |
| **本 change 不做,未来可能做** | `design.md` `## Future Work` YAML 块 | 跨 change 长期 backlog | "实施会扩 scope,但目标方向一致" |
| **本 change 不做,原则反对做** | `proposal.md` `## Non-Goals` YAML 块 | 反目标 | "实施会偏离项目方向 / 违反核心约束" |
| **本 change 不做,无强烈意见** | `proposal.md` `## Out of Scope` YAML 块 | 中性 out-of-scope | "明显不属于本 change 但未来可能做也可能不做" |

---

## 4. Shell + commit 兼容(沿 plan-9e2 §0)

**Shell 假设 + commit block 跨 shell 兼容**:本 plan 6 个 Task commit block 全用 `git commit -F file` 模式(Windows + PowerShell 用户偏好;memory `本地 verification 必须含 format:check`)。**实施者必须先确认当前 shell + 按下表转换**:

| Shell | commit 命令模式 | 说明 |
|---|---|---|
| Bash / Git-Bash / WSL | `git commit -m "$(cat <<'EOF' ... EOF)"` | heredoc 直接用(用户偏好,沿 CLAUDE.md global) |
| PowerShell 5.1 / 7+(默认) | `git commit -F message-tmp.txt` | 先 Write message 到 tmp 文件,commit 后 rm;避免 `@` 字符泄漏 subject 行 |
| Claude Code Bash tool (Windows) | 同 PowerShell | 默认走 PowerShell |

---

## 5. 风险 + 退路

### 5.1 RED scenario 写不出来(暴露 design §2.5.6 缺口)

**症状**:Task 1 写 must_match / judge_rubric 时,无法把"AI 无限发散无收尾"或"AI 直接改 artifacts"用具体信号锁住。

**根因**:design §2.5.6 反向加固三条是行为描述,转 forge-eval 行为契约时可能需要更具体的 anti-pattern 信号词。

**退路**:
- 第一档:把三条加固描述细化为具体词汇(如"无限发散" = AI 输出 ≥ 800 token 仍未给 capture offer / "直接改" = AI 在 explore turn 内调用 Write/Edit 工具修改 `forge/changes/*` 路径)
- 第二档:回头 mini-explore 暴露 design §2.5.6 措辞不够 actionable → 修订 design(独立 spec 修订)

### 5.2 GREEN delta < 1.5(skill 写得不到位)

**症状**:Task 4 跑 `pnpm eval:skill exploring` 发现 GREEN avg - RED avg < 1.5。

**退路**(沿 plan-9i Task 5 反向链 + writing-skills 步骤 4 REFACTOR):
- 读 `eval-report.md` 失败详情段 → 找 judge reasoning 提到的具体 AI 说辞
- 在 SKILL.md 红旗清单加 plug(把 AI 用过的借口列为 anti-pattern)
- 重跑 `pnpm eval:skill exploring` 验证 plug 起作用

### 5.3 plan-9i 协议第一次实战漏洞

**症状**:Task 1-4 走 plan-9i 五步骤时撞上协议未覆盖的边界(如 forge-eval runner 默认配置在 docs-heavy skill 上判分偏低)。

**退路**:
- 记录到 retrospect Q3(plan-9i 协议在 9f 实施中暴露的缺口)
- 9f 完成后开 plan-9i 补丁 sub-plan(沿 plan-9e2 retrospect Case 06 模式)

### 5.4 例 4-6 个不够,概念覆盖不全

**症状**:OpenSpec 4 entry point 转 forge 化后,某类典型 forge 探索场景没 example 覆盖。

**退路**:
- Task 2 写 SKILL.md 时主动 review forge v1.0 已有 9 个 sub-plan 的 retrospect 段,找出"explore 本应触发但实际走了别的路径"的真实历史例
- 沿 plan-9e2 Case 06 模式,把真实案例作为 example transcribe

---

## 6. 综合 retrospect(沿 plan-9e2 + plan-9j 模式)

Task 5 完成全本地 verify 后,跑综合 retrospect 6 问:

- **Q1**:本 plan 实施过程中,有没有出现"我以为按协议走但实际跳了步骤"的瞬间?
- **Q2**:plan-9i 五步骤协议在 9f 实战中有缺口或冗余吗?
- **Q3**:RED scenario 暴露了 design §2.5.6 反向加固描述的措辞不够 actionable 吗?
- **Q4**:commands/* 手工双同步 + md5 sync guard 在 9f 的实际负担(vs reverse-sync 自动)?
- **Q5**:4-6 example 覆盖度够吗?有没有典型 forge 探索场景漏标?
- **Q6**:9f 作为 forge:writing-skills 的 first real use case,是否暴露了 plan-9i `using-forge` 红旗清单缺条目?

**任一 Yes 触发**:写入 `.claude/skills/subagent-driven-discipline/SKILL.md` §5 Case 07(沿 plan-9e2 Case 06 模式;frontmatter `case_study_count` 6 → 7 同步)。

---

## 7. 备忘

- **md5 sync 守护对象**:
  - `commands/explore.md` ↔ `src/core/templates/commands/explore.md`(沿 plan-9e2 archive-md-sync test 模板,1 case)
  - `commands/apply.md` ↔ `src/core/templates/commands/apply.md`(若 9c plan 未立 sync test 则 9f 顺便补;若已立则 9f 改动后跑现有 test 验证回归)
  - `skills/exploring/SKILL.md` ↔ `src/core/templates/skills/exploring.md` 由 build reverse-sync 钉住(`tests/core/templates/skills.test.ts:12` 已有通用断言),**不需要 9f 加新 test**
- **forge-eval CLI 识别**:`forge-eval/index.ts:34` 用 SKILL_NAMES + COMMAND_NAMES 作 CLI argument validation;Task 0 加 'exploring' / 'explore' 后自动识别 `pnpm eval:skill exploring`(沿 plan-9i 已验证)
- **using-forge 反向同步**:Task 5 改 `skills/using-forge/SKILL.md` 后必须跑 `pnpm build` reverse-sync,否则 `src/core/templates/skills/using-forge.md` 落后 → `tests/core/templates/skills.test.ts:12` 通用断言失败
- **codex 收敛预期**:docs-heavy plan codex finding 主要在 rubric 精度 + example 边界,预期 RED scenario spec 1-2 轮 + SKILL.md production 1-2 轮 + final 1 轮,共 3-5 轮收敛(对比 plan-9e2 6+4+1 轮 schema-heavy 收敛模式更轻)
- **dev-direct push 模式**:沿 plan-9e2 决定;若过程出现重大决策面变更则切 feature branch + PR(由用户授权)
