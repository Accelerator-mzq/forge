# Plan 9c — apply 阶段 Fluid Pause Decision Point 实施

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。**特别注意**:本 plan **不是新 skill 开发**(只改既有 SKILL.md 一档 status),所以 **不必 invoke `forge:writing-skills`**;走标准 TDD/SDD 即可,沿 9b 修订 receiving-code-review SKILL.md 的同模式。

**Goal**:落地 v1.0 §2.1 *Fluid Pause Decision Point* — subagent 在 apply 中段碰到本 change 必做但 spec 未覆盖 / plan 本身错的非 CRITICAL issue 时,主代理走"AskUserQuestion 三选项 + 第 4 项 Other → marker `pause_decisions` 字段持久化 → archive fence 五类业务校验"协议。同步落地 `pause_decisions` marker schema 字段(`.verify-passed` / `.review-passed` / `.verify-failed` / `.review-failed` 四 marker 全部 superset additive)、`commands/apply.md` 加 §"Fluid Pause Decision Point" 段、`skills/subagent-driven-development/SKILL.md` 加 `DESIGN_ISSUE_FOUND` 第 5 档 status + `DONE_WITH_CONCERNS` 分流修订、`src/cli/commands/archive.ts` fence 加 pause_decisions 五类校验(option 1-4 + CRITICAL 重定向 + ack 校验 + marker 缺失老兼容)。

**Architecture**:四层加固。(1) **数据形态层**:`src/core/markers/types.ts` 加 `PauseDecision` interface(沿 §2.1.5 字段);四个 marker interface 加 `pause_decisions?: PauseDecision[]` 字段(superset additive,老 marker 缺等价 `[]`);`src/core/validate/marker-schema.ts` 加 `checkPauseDecisionsArray` 校验(必填 / 类型 / 枚举,**不**校验业务规则)。 (2) **Fence 业务校验层**:新建 `src/core/archive/pause-decisions-fence.ts` 模块(沿 9d `verify-findings-fence.ts` 模块化模式)— `validatePauseDecisionsFence` 函数做五类业务校验:option=1 → `target_artifact='proposal.md'` 且 `target_anchor` 指向 `## What Changes`;option=2 → tasks.md 中 `task_ref` 指向的行已勾选 `[x]`;option=3 → proposal/design YAML 块内有对应 scope entry(沿 9b `scope-entries` schema)+ `non_blocking_rationale` 非空;option=4 → `other_rationale` + `other_acked_by` 非空;CRITICAL severity → 拒签(不应进 pause);WARNING + 未 resolved → 必须 `severity_acked_by`/`_at`;SUGGESTION 允许空 ack。`archive.ts` 在 verify_findings fence 之后插入新调用点。 (3) **行为塑造层**:`commands/apply.md` 加 §"Fluid Pause Decision Point" 段(§2.1.3 流程 + §2.1.4 AskUserQuestion 模板 + §2.1.5 marker 字段说明);`skills/subagent-driven-development/SKILL.md` 加 `DESIGN_ISSUE_FOUND` 第 5 档 + `DONE_WITH_CONCERNS` 分流修订(原 "address them before review" → "CRITICAL 同 v0.4 强 fence;else invoke Fluid Pause")+ forge-specific 反向加固段。 (4) **测试层**:单元测试覆盖 schema 校验 + fence 五分支 8 case;e2e 集成 fixture 5 个 case 子目录(option 1/2/3/4 + CRITICAL-redirect)走 tmpdir 复制风格(沿 9d Task 8)+ 真实 archive end-to-end 走 archiveTransaction。

**Tech Stack**:Node 20+ / TypeScript ESM / commander 12 / `yaml` v2 / vitest / 现有 `src/core/schemas/severity.ts`(9a Severity enum)+ `src/core/schemas/scope-entries.ts`(9b ScopeEntry interface — option=3 校验 reference)+ `src/core/validate/types.ts`(ValidationResult / failed / ok / mergeResults)+ `src/core/markers/types.ts`(9d 已扩 VerifyFinding / verify_findings 字段,本 plan 沿同模式)+ `src/core/archive/verify-findings-fence.ts`(9d 已落地 fence 模块化模式,本 plan 沿同模式)+ `src/cli/commands/archive.ts`(已有 fence 调用链 + exit code 对齐)。**不引入新 npm 依赖**。

**Spec 引用**:
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §2.1 全节(§2.1.1 基线 / §2.1.2 触发条件 / §2.1.3 流程 / §2.1.4 AskUserQuestion 模板 / §2.1.5 marker pause_decisions 字段 + 五类 fence 校验 / §2.1.6 v0.4 兼容性 / §2.1.7 实施清单)+ §2.3.2 三级 enum + §2.3.3 severity_acked_by 协议 + §2.6 scope-entries schema(被 option=3 reference)
- master plan §3.3(plan-9c 概览 P50 2.5 / P90 3.5)+ §3.12.1 Finding 字段冻结(沿 9a)+ §3.12.3 CLI exit code 冻结(`forge archive` 1 = fence business-fail,与 9d 一致)+ 依赖图 line 90-93(9a/9b 前置 → 9c → 9e archive 软告警)

**P50 工日**:4.15(v6 修订:codex 五轮 review 0 BLOCKER + 2 MAJOR + 1 MINOR + 1 NIT 全采纳;Task 2 在 v5 基础上 +0.05d:option=2 bold 分支 lookahead 补完 + option=3 exactly one 校验 + script try/catch + 旧注释清理);**P90 工日**:5.25(master §3.3 P90 3.5 + 1.75 buffer)

**v5 → v6 关键修订**(codex 五轮全采纳):
- MAJOR A4 续修:option=2 regex bold 分支 `\*\*taskKey\*\*` 后**补 lookahead**`(?![\p{L}\p{N}_-])` — v5 只修了 bare 分支,bold 分支 `**task-2**-extra` 仍误匹配;v6 闭合
- MAJOR B2:option=3 fence 改 **exactly one** — 收集所有 triggered_by 匹配 entry,数量 ≠ 1 拒签;数量 = 1 才做字段校验。v5 在第一个匹配后 `return ok()` 不校验其余 → 多 entry 漏检
- MINOR:`release-blocker-attack-path.test.ts` 顶部旧注释清理 — 与 v5 release 模式指引统一(9z 必须改 CI 调 release 模式,改 SOFT 值仅可选)
- NIT:`check-release-gate.mjs` `readFileSync` 加 try/catch,ENOENT 给清晰错误信息

**Shell 假设**(v3 codex MINOR 9 修订):本 plan 多处用 `git commit -m "$(cat <<'EOF' ... EOF)"` heredoc 形式。**实施者必须先确认当前 shell**:
- **Bash / Git-Bash**:直接使用 heredoc 形式
- **PowerShell 5.1+ / 7+**:heredoc 不可用,需替换为 here-string:`git commit -m @'...内容...'@`(`@'` 与 `'@` 必须各自独占一行,`'@` 不能有前导空白)
- Claude Code Bash tool 在 Windows 上默认走 PowerShell(沿 system prompt),如需 heredoc 必须显式调用 Git-Bash 路径或改 here-string 形式。**实施者每次提交前用 `echo $SHELL` 或 `$PSVersionTable` 验证当前 shell**

**前置**:
- 9a 横切层基础(已完成,`f347329`;Severity enum / Finding 接口 / ValidationResult 框架全可用)
- 9b out-of-scope schema(已完成,`d15001d`;`ScopeEntry` / `ScopeEntriesBlock` schema + scope-entries.ts validator + propose.md 落地 anchor — option=3 校验依赖此)
- 9d verify 三维度(已完成,`20e3563`;`verify-findings-fence.ts` 模块化模式被本 plan 沿用作为 `pause-decisions-fence.ts` 模板;archive.ts fence 调用链已对齐 exit 1)

**后续 unblocked**:
- 9e1 archive 软告警基础(本 plan 完成后,archive_summary.handoff_to_backlog 的第 2 类输入 — `pause_decisions chosen_option=3` 转 out-of-scope — 数据形态就绪)
- 9f explore 命令(本 plan 完成后,`/forge:explore` 的 `--change` 模式可读取 active change 的 pause_decisions 作为上下文)

**DoD**(完成定义):
- `src/core/markers/types.ts` 加 `PauseDecision` interface(13 字段 + enum 类型 `ChosenOption` = `1|2|3|4`);四 marker interface 加 `pause_decisions?: PauseDecision[]` 字段
- `src/core/validate/marker-schema.ts` 加 `checkPauseDecisionsArray`(必填 8 字段 + 枚举值 + id 唯一性 + ISO 8601 时间戳格式;v3 codex NIT 11 修订:7 → 8 字段)+ 在 4 个 schema 分支中调用
- `src/core/archive/pause-decisions-fence.ts` 含 `validatePauseDecisionsFence` 函数 — CRITICAL 重定向 + ack 校验 + option=1/2/3/4 五分支业务校验(option=3 reference 9b scope-entries)
- `src/cli/commands/archive.ts` 步骤 3.8 加 `validatePauseDecisionsFence` 调用点(verify_findings fence 之后,ack-log 一致性之前;失败 exit 1)
- `commands/apply.md` 加 §"Fluid Pause Decision Point" 段(完整 §2.1.3 流程 + §2.1.4 模板 + §2.1.5 marker 字段)+ §"与其他 sub-plan 合并点" 提示
- `skills/subagent-driven-development/SKILL.md` "Handling Implementer Status" 段加 `DESIGN_ISSUE_FOUND` 第 5 档 + `DONE_WITH_CONCERNS` 修订(分流 CRITICAL/非-CRITICAL)+ forge-specific 反向加固段(显式声明"不能伪造 severity_acked_by")
- 测试:`tests/core/markers/pause-decisions-schema.test.ts`(必填字段 / 类型 / 枚举 / id 唯一性 / superset additive 兼容)+ `tests/cli/archive-pause-fence.test.ts`(5 fence 分支 × 8 case)+ `tests/integration/pause-decisions-end-to-end.test.ts`(5 fixture × tmpdir 复制 × archive 真跑)+ `tests/fixtures/pause-decisions/{option-1-expand-scope,option-2-add-task,option-3-out-of-scope,option-4-other,critical-redirect-rejected}/`
- 全本地 verify 通过(`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test`)

---

## 0. 总览

本 sub-plan 拆 **5 个 task**:

| Task | 名称 | 工日 P50 | 关键交付 |
|------|------|---------|---------|
| 1 | PauseDecision schema 锁死 + marker schema 数组校验 + 单测 | 0.6 | `src/core/markers/types.ts` 加 `PauseDecision` interface + 四 marker `pause_decisions?` 字段;`src/core/validate/marker-schema.ts` 加 `checkPauseDecisionsArray` + 4 个 schema 分支调用;`tests/core/markers/pause-decisions-schema.test.ts`(v2 codex MINOR 9 修订:12 case + baseline 9 fail / 3 pass) |
| 2 | archive.ts fence pause_decisions 五类业务校验 + ack-log 扩展 + 单测 | **2.2**(v4 codex 三轮 +0.3d:option=2 regex 改 negative lookahead NEW-MAJOR A4 + option=3 fence 改局部段校验 NEW-MAJOR B4(v3 ctx 改必填 NEW-MAJOR A6 在 v4 自动随 B4 解决 → revert);v3 已含 +0.4d,v2 已含 +0.5d) | `src/core/archive/pause-decisions-fence.ts` 模块 `validatePauseDecisionsFence` async + 复用 9b `parseFencedYamlBlocks` + `parseMarkdown` 局部段校验(v4 NEW-MAJOR B4);`src/core/archive/ack-log-consistency.ts` 扩展;`src/cli/commands/archive.ts` 步骤 3.7 对 verifyRec + reviewRec 都跑 fence;`tests/cli/archive-pause-fence.test.ts` 16 case;`tests/cli/ack-log-pause-decisions.test.ts` 6 case |
| 3 | `commands/apply.md` 加 §"Fluid Pause Decision Point" 段 | 0.4 | apply.md 加 §"Fluid Pause Decision Point" + §"与其他 sub-plan 合并点"提示 + §"9c → 9h merge rebase 指引"(v2 codex MINOR 11 修订) |
| 4 | `skills/subagent-driven-development/SKILL.md` 加 `DESIGN_ISSUE_FOUND` 第 5 档 + `DONE_WITH_CONCERNS` 修订 | 0.4 | SKILL.md "Handling Implementer Status" 段加第 5 档 + DONE_WITH_CONCERNS 分流 + forge-specific 反向加固段(v2 codex BLOCKER 1 修订:反向加固段宣称改为真实工作的版本) |
| 5 | e2e 集成测试 + fixture + 全本地 verify + release-blocker script gate | **0.5**(v3 codex BLOCKER 3 +0.1d:加 release-blocker-attack-path.test.ts 占位 + 9z gate 说明;v4 codex NEW-BLOCKER A3 改 it.todo → script-based gate,工作量同) | `tests/fixtures/pause-decisions/` 含 5 case 子目录(v2 codex BLOCKER 3:evidence: [] + is_git_repo: false + --force);`tests/integration/pause-decisions-end-to-end.test.ts` tmpdir 复制风格;`tests/integration/release-blocker-attack-path.test.ts` 含 2 个 it.todo;`scripts/check-release-gate.mjs` script-based gate(v4 codex NEW-BLOCKER A3:`pnpm test` 后置调用 + EXPECTED_TODO_COUNT 与文件实际计数比对,9z 必须同步改);全本地 verify 全绿 |

**串行约束**:
- Task 1 → Task 2(schema 字段先冻结再写 fence 业务规则)
- Task 1 → Task 4(SKILL.md 反向加固段需要 reference 字段名,字段先稳定)
- Task 2 → Task 5(fence 实施后才能 e2e)
- Task 3 与 Task 4 可并行(apply.md 与 SDD SKILL.md 互不修改)
- Task 5 集成,放最后

**多 agent 并行可能**:Task 3 / Task 4 可并行;Task 1 / Task 2 不可并行(Task 2 import Task 1 类型)

**与其他 sub-plan 合并点**(参考 master plan §3.3 line 272;v2 codex MINOR 11 修订:加 rebase 指引):
- `commands/apply.md`:9c / 9h(Critical Plan Review + STOP triggers) / 9g(record-tdd helper)三方修改。**推荐 merge 顺序 9h → 9c → 9g**。本 plan 假设 9h 未完成,在基线 apply.md 上加 §"Fluid Pause Decision Point" 段
- `skills/subagent-driven-development/SKILL.md`:9c(DESIGN_ISSUE_FOUND 第 5 档) / 9g(record-tdd 报告字段) / 9h(Main Agent STOP Triggers)三方修改。本 plan 仅改 "Handling Implementer Status" 段 + 加新 forge-specific 反向加固段,与 9g/9h 修改区域无重叠
- **9c 先 merge 后 9h 实施时的 rebase 指引**(v2 codex MINOR 11 修订):
  - apply.md:9h 在步骤 0 加 `forge preflight branch-check` + 步骤 3.5 加 §"Critical Plan Review",**不动**本 plan 的 §"Fluid Pause Decision Point" 和 §"与其他 sub-plan 合并点"段。9h 实施者需在 PR 中跑 `git diff main..HEAD commands/apply.md` 确认无冲突段重叠;若有,9h 必须 rebase 把"Fluid Pause Decision Point"段保留原位置
  - SKILL.md:9h 加 §"Main Agent STOP Triggers" 新段,**不动**本 plan 的 "Handling Implementer Status" 5 档定义 和 §"forge-specific 反向加固"段。同样 9h 实施 PR 验证无重叠
  - 9c plan **不**修改 `commands/verify.md`(9d 已落地)或 `src/cli/commands/validate.ts`(9d 已扩展),避免与已完成 sub-plan 文件冲突

---

## 1. File Structure

### 新增文件

```
src/core/archive/pause-decisions-fence.ts          ← Task 2:validatePauseDecisionsFence async 函数 + 五类业务校验
tests/core/markers/pause-decisions-schema.test.ts  ← Task 1:PauseDecision schema 校验单测
tests/cli/archive-pause-fence.test.ts              ← Task 2:fence 五分支 8 case 单测
tests/integration/pause-decisions-end-to-end.test.ts  ← Task 5:e2e 集成测试(tmpdir 复制 + archive 真跑)
tests/integration/release-blocker-attack-path.test.ts ← Task 5 Step 1.6:release-blocker 占位(v4 codex NEW-BLOCKER A3 修订;v3 引入 + v4 补 File Structure 漏列 MINOR B5)
scripts/check-release-gate.mjs                        ← Task 5 Step 1.6.2:script-based release gate(v4 codex NEW-BLOCKER A3 修订)
tests/fixtures/pause-decisions/option-1-expand-scope/     ← Task 5:option=1 fixture(proposal.md + .verify-passed + .review-passed + tasks.md)
tests/fixtures/pause-decisions/option-2-add-task/         ← Task 5:option=2 fixture(tasks.md 含勾选新 task)
tests/fixtures/pause-decisions/option-3-out-of-scope/     ← Task 5:option=3 fixture(proposal.md 含 scope-entries YAML 块)
tests/fixtures/pause-decisions/option-4-other/            ← Task 5:option=4 fixture(other_rationale + other_acked_by 完整)
tests/fixtures/pause-decisions/critical-redirect-rejected/   ← Task 5:CRITICAL severity → fence 拒签 fixture
```

### 修改文件

```
src/core/markers/types.ts                          ← Task 1:加 PauseDecision interface + ChosenOption type + 四 marker interface 加 pause_decisions? 字段
src/core/validate/marker-schema.ts                 ← Task 1:加 checkPauseDecisionsArray + 4 个 schema 分支调用
src/core/archive/ack-log-consistency.ts            ← Task 2 Step 3.5:扩展 validateAckLogConsistency 覆盖 pause_decisions WARNING + downgrade(v3 codex BLOCKER 1)
src/cli/commands/archive.ts                        ← Task 2:步骤 3.7 加 validatePauseDecisionsFence(对 verifyRec + reviewRec 都跑)+ 步骤 3.8 对两个 marker 都跑 ack-log
commands/apply.md                                  ← Task 3:加 §"Fluid Pause Decision Point" 段 + §"与其他 sub-plan 合并点"
skills/subagent-driven-development/SKILL.md        ← Task 4:"Handling Implementer Status" 段加 DESIGN_ISSUE_FOUND 第 5 档 + DONE_WITH_CONCERNS 修订 + forge-specific 反向加固段
package.json                                       ← Task 5 Step 1.6.3:加 test:gate script + test 后置 hook(v4 codex NEW-BLOCKER A3)
```

### 不修改文件(明确边界)

```
src/core/schemas/severity.ts                       ← 9a 锁死,本 plan 复用 Severity / isSeverity 不动
src/core/schemas/scope-entries.ts                  ← 9b 锁死,本 plan option=3 校验 reference 不动
src/core/archive/verify-findings-fence.ts          ← 9d 锁死,本 plan 沿用作为模块化模板不动
src/cli/commands/validate.ts                       ← validate 不校验 pause_decisions 业务规则(那是 archive fence 的事;validate 只跑 marker-schema 类型校验)
src/core/templates/skills/index.ts                 ← 不加新 skill registry(本 plan 是修订既有 SKILL.md,不新建 skill)
forge-eval/scenarios/                              ← 不加 forge-eval scenario(本 plan 不是新 skill 开发,沿 9b receiving-code-review 同模式 — 只改既有 skill 不需 eval)
```

---

## 2. Task 1 — PauseDecision schema 锁死 + marker-schema 数组校验

**Files**:
- Modify: `src/core/markers/types.ts:1-81`(加 PauseDecision interface + ChosenOption type + 四 marker 加 pause_decisions? 字段)
- Modify: `src/core/validate/marker-schema.ts`(加 checkPauseDecisionsArray + 4 schema 分支调用)
- Create: `tests/core/markers/pause-decisions-schema.test.ts`(必填字段 / 类型 / 枚举 / id 唯一性 / superset additive)

### Step 1: 先写 schema 校验失败测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/core/markers/pause-decisions-schema.test.ts`**

```typescript
// pause-decisions-schema.test.ts — plan-9c Task 1 单测(沿 verify-findings-schema.test.ts 模式)
// 校验 pause_decisions 数组 schema:必填字段 / 类型 / 枚举值 / id 唯一性 / superset additive

import { describe, it, expect } from 'vitest';
import { validateMarkerSchema } from '../../../src/core/validate/marker-schema.js';

// 合法 marker baseline(verify-passed,无 pause_decisions)
const baseVerifyMarker = {
  schema: 'forge-verify/v1',
  verified_at: '2026-05-12T14:30:00Z',
  verified_by: 'ai-agent',
  tasks_hash: 'sha256:' + 'a'.repeat(64),
  content_hash: 'sha256:' + 'b'.repeat(64),
  evidence: [],
};

// 合法 PauseDecision baseline(option=3 转 out-of-scope)
const basePauseDecision = {
  id: 1,
  paused_at: '2026-05-12T14:30:00Z',
  task_ref: 'tasks.md#task-3',
  issue_summary: 'subagent 发现 specs 没覆盖 OAuth refresh token 过期处理',
  severity: 'WARNING',
  severity_acked_by: 'msc',
  severity_acked_at: '2026-05-12T14:32:00Z',
  chosen_option: 3,
  target_artifact: 'proposal.md',
  target_anchor: '## Out of Scope',
  non_blocking_rationale: 'subagent 可以跳过该 issue 完成本 task 主体功能',
  other_rationale: null,
  other_acked_by: null,
};

describe('pause_decisions schema validation', () => {
  it('superset additive:marker 缺 pause_decisions 字段 → 老兼容通过', () => {
    const result = validateMarkerSchema(baseVerifyMarker);
    expect(result.valid).toBe(true);
  });

  it('空数组 pause_decisions: [] → 通过', () => {
    const result = validateMarkerSchema({ ...baseVerifyMarker, pause_decisions: [] });
    expect(result.valid).toBe(true);
  });

  it('合法 PauseDecision 项(option=3) → 通过', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [basePauseDecision],
    });
    expect(result.valid).toBe(true);
  });

  it('pause_decisions 非数组 → 拒签', () => {
    const result = validateMarkerSchema({ ...baseVerifyMarker, pause_decisions: 'not-array' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions')).toBe(true);
  });

  it('id 重复 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [
        { ...basePauseDecision, id: 1 },
        { ...basePauseDecision, id: 1 },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /id.*重复/.test(e.message))).toBe(true);
  });

  it('缺 paused_at 必填字段 → 拒签', () => {
    const { paused_at, ...rest } = basePauseDecision;
    const result = validateMarkerSchema({ ...baseVerifyMarker, pause_decisions: [rest] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].paused_at')).toBe(true);
  });

  it('paused_at 非 ISO 8601 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [{ ...basePauseDecision, paused_at: '2026-05-12 14:30' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].paused_at')).toBe(true);
  });

  it('severity 非三级 enum → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [{ ...basePauseDecision, severity: 'INFO' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].severity')).toBe(true);
  });

  it('chosen_option 非 1-4 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [{ ...basePauseDecision, chosen_option: 5 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].chosen_option')).toBe(true);
  });

  it('chosen_option 是 string 而非 number → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [{ ...basePauseDecision, chosen_option: '3' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].chosen_option')).toBe(true);
  });

  it('issue_summary 空串 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [{ ...basePauseDecision, issue_summary: '' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].issue_summary')).toBe(true);
  });

  it('task_ref 缺失 → 拒签', () => {
    const { task_ref, ...rest } = basePauseDecision;
    const result = validateMarkerSchema({ ...baseVerifyMarker, pause_decisions: [rest] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].task_ref')).toBe(true);
  });
});
```

- [ ] **Step 1.2: 跑测试确认全红(预期 FAIL — checkPauseDecisionsArray 尚未实现)**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/markers/pause-decisions-schema.test.ts
```

预期:12 tests 总共,baseline 跑 **9 fail / 3 pass**(因 marker-schema.ts 还没识别 pause_decisions 字段,所以含 pause_decisions 的 marker 都默认 valid=true:`superset additive`/`空数组`/`合法项` 三个期望 valid=true 的 case 反过来 PASS,其他 9 个期望 valid=false 的 case 全 FAIL。v2 codex MINOR 9 修订)。

### Step 2: 加 PauseDecision interface + ChosenOption type(TDD green Part 1)

- [ ] **Step 2.1: 修改 `src/core/markers/types.ts:1-3` 加 import**

```typescript
// Marker YAML 类型 — spec §3.4

import type { Finding } from '../schemas/severity.js';
import type { Severity } from '../schemas/severity.js';
```

(`Severity` 已通过 `Finding` 间接 import,但显式列出方便后续 reference;若 lint 报 unused 改回单 import line)

- [ ] **Step 2.2: 修改 `src/core/markers/types.ts:5-14` — VerifyMarker 加 pause_decisions? 字段**

```typescript
export interface VerifyMarker {
  schema: 'forge-verify/v1';
  verified_at: string; // ISO 8601 UTC
  verified_by: 'ai-agent' | 'human-override';
  tasks_hash: string;
  content_hash: string;
  evidence: EvidenceItem[];
  // plan-9d Task 3 新增 — superset additive,老 marker 缺等价 []
  verify_findings?: VerifyFinding[];
  // plan-9c Task 1 新增 — superset additive,老 marker 缺等价 []
  // apply 阶段 Fluid Pause Decision Point 主代理调 AskUserQuestion 三选项后写入(沿 design §2.1.5)
  pause_decisions?: PauseDecision[];
}
```

- [ ] **Step 2.3: 修改 `src/core/markers/types.ts:36-44` — ReviewMarker 加 pause_decisions? 字段**

```typescript
export interface ReviewMarker {
  schema: 'forge-review/v1';
  reviewed_at: string;
  reviewed_by: 'ai-agent' | 'human-override';
  tasks_hash: string;
  content_hash: string;
  git: GitInfo;
  review_outcomes: ReviewOutcome[];
  // plan-9c Task 1 新增 — superset additive(verify 端 pause 也镜像到 review marker,沿 design §2.1.6)
  pause_decisions?: PauseDecision[];
}
```

- [ ] **Step 2.4: 修改 `src/core/markers/types.ts:64-72` — VerifyFailedMarker 加 pause_decisions? 字段**

```typescript
export interface VerifyFailedMarker {
  schema: 'forge-verify-failed/v1';
  failed_at: string;
  reasons: string[];
  fake_completions: string[];
  appended_tasks: string[];
  // plan-9d Task 3 新增
  verify_findings?: VerifyFinding[];
  // plan-9c Task 1 新增 — verify failed 也可能携带 pause_decisions(本 round verify 失败但已有 pause 记录)
  pause_decisions?: PauseDecision[];
}
```

- [ ] **Step 2.5: 修改 `src/core/markers/types.ts:74-79` — ReviewFailedMarker 加 pause_decisions? 字段**

```typescript
export interface ReviewFailedMarker {
  schema: 'forge-review-failed/v1';
  failed_at: string;
  unresolved_outcomes: ReviewOutcome[];
  appended_tasks: string[];
  // plan-9c Task 1 新增
  pause_decisions?: PauseDecision[];
}
```

- [ ] **Step 2.6: 在 `src/core/markers/types.ts:25` VerifyFinding interface 之后追加 PauseDecision interface + ChosenOption type**

```typescript
/**
 * chosen_option — Fluid Pause 用户决策选项(沿 design §2.1.4 / §2.1.5)
 * 1 = 扩 scope(更新 proposal `## What Changes`,subagent 重派)
 * 2 = 加 task(主代理 append 新 task 到 tasks.md,subagent 重派)
 * 3 = 转 out-of-scope(写到 proposal `## Out of Scope` / design `## Future Work` YAML 块,subagent 跳过 issue 继续)
 * 4 = Other(用户提供自由文本描述,必须配 other_rationale + other_acked_by)
 */
export type ChosenOption = 1 | 2 | 3 | 4;

/**
 * PauseDecision — apply 阶段 Fluid Pause Decision Point 主代理记录的决策项
 * 沿 design §2.1.5 marker schema
 * superset additive:四 marker 均可选 pause_decisions?,缺等价 []
 *
 * v2 codex MINOR 10 修订:本 interface 的 nullable 字段(severity_acked_by/_at /
 *   non_blocking_rationale / other_rationale / other_acked_by)统一用 `string | null`,
 *   **与 9a `Finding.severity_acked_by?: string` 不同**。
 *   - 设计理由:design §2.1.5 line 256-257 YAML 示例字面用 `other_rationale: null` /
 *     `other_acked_by: null`,marker YAML 中字段必须存在(值或填或 null),不允许"字段缺失"。
 *   - 9a Finding 是另一回事:Finding 字段缺失等价默认值,9a 实施沿 optional 模式。
 *   - 两 interface 独立,本 PauseDecision 沿 design YAML 字面格式。
 */
export interface PauseDecision {
  /** 同一 marker 内唯一(数字 id,沿 9a Finding id 模式) */
  id: number;
  /** pause 触发时刻(ISO 8601 UTC) */
  paused_at: string;
  /** 关联的 task(tasks.md#task-N 格式;subagent 报 DONE_WITH_CONCERNS / BLOCKED / DESIGN_ISSUE_FOUND 时所在 task) */
  task_ref: string;
  /** subagent 报告的 issue 一句概括 */
  issue_summary: string;
  /** 主代理初判(CRITICAL → 不应进 pause,本 enum 校验 + fence 重定向) */
  severity: Severity;
  /** WARNING 必须有,SUGGESTION 允许空(沿 design §2.1.5 fence 校验) */
  severity_acked_by: string | null;
  severity_acked_at: string | null;
  /** 1 | 2 | 3 | 4 — 用户在 AskUserQuestion 选择 */
  chosen_option: ChosenOption;
  /** option=1 → 'proposal.md';option=2 → 'tasks.md';option=3 → 'proposal.md' | 'design.md' */
  target_artifact: string;
  /** option=1 → '## What Changes';option=2 → 新 task 行;option=3 → '## Out of Scope' | '## Future Work' */
  target_anchor: string;
  /** option=3 必填(沿 design §2.1.5 fence 校验);其他选项填 null */
  non_blocking_rationale: string | null;
  /** option=4 必填(用户提供自由文本) */
  other_rationale: string | null;
  /** option=4 必填(用户在 marker 之外某处确认 — fence 仅校验非空,不校验来源)  */
  other_acked_by: string | null;
}
```

- [ ] **Step 2.7: 修改 `src/core/markers/types.ts:81` AnyMarker 不变(union 自动包含新字段)**

(无修改 — TypeScript optional 字段自动 propagate)

### Step 3: 加 checkPauseDecisionsArray + 在 4 个 schema 分支调用(TDD green Part 2)

- [ ] **Step 3.1: 修改 `src/core/validate/marker-schema.ts:33` DIMENSION_VALUES 之后追加 CHOSEN_OPTION_VALUES**

```typescript
// verify_findings.dimension 合法值(沿 design §2.2.2 三维度)
const DIMENSION_VALUES = new Set(['completeness', 'correctness', 'coherence']);
// plan-9c Task 1 新增:pause_decisions.chosen_option 合法值(1 | 2 | 3 | 4)
const CHOSEN_OPTION_VALUES = new Set([1, 2, 3, 4]);
```

- [ ] **Step 3.2: 修改 `src/core/validate/marker-schema.ts:60-69` — forge-verify/v1 分支加 pause_decisions 校验**

```typescript
  if (schema === 'forge-verify/v1') {
    results.push(checkTimestamp(obj, 'verified_at', file));
    results.push(checkActor(obj, 'verified_by', file));
    results.push(checkSha256(obj, 'tasks_hash', file));
    results.push(checkSha256(obj, 'content_hash', file));
    results.push(checkEvidenceArray(obj.evidence, file));
    // plan-9d Task 3 新增
    if (obj.verify_findings !== undefined) {
      results.push(checkVerifyFindingsArray(obj.verify_findings, file));
    }
    // plan-9c Task 1 新增 — pause_decisions superset additive
    if (obj.pause_decisions !== undefined) {
      results.push(checkPauseDecisionsArray(obj.pause_decisions, file));
    }
  }
```

- [ ] **Step 3.3: 修改 `src/core/validate/marker-schema.ts:70-76` — forge-review/v1 分支加 pause_decisions 校验**

```typescript
  } else if (schema === 'forge-review/v1') {
    results.push(checkTimestamp(obj, 'reviewed_at', file));
    results.push(checkActor(obj, 'reviewed_by', file));
    results.push(checkSha256(obj, 'tasks_hash', file));
    results.push(checkSha256(obj, 'content_hash', file));
    results.push(checkGitInfo(obj.git, file));
    results.push(checkReviewOutcomes(obj.review_outcomes, file));
    // plan-9c Task 1 新增
    if (obj.pause_decisions !== undefined) {
      results.push(checkPauseDecisionsArray(obj.pause_decisions, file));
    }
  }
```

- [ ] **Step 3.4: 修改 `src/core/validate/marker-schema.ts:77-85` — forge-verify-failed/v1 分支加 pause_decisions 校验**

```typescript
  } else if (schema === 'forge-verify-failed/v1') {
    results.push(checkTimestamp(obj, 'failed_at', file));
    results.push(checkStringArray(obj, 'reasons', file));
    results.push(checkStringArray(obj, 'fake_completions', file));
    results.push(checkStringArray(obj, 'appended_tasks', file));
    if (obj.verify_findings !== undefined) {
      results.push(checkVerifyFindingsArray(obj.verify_findings, file));
    }
    // plan-9c Task 1 新增
    if (obj.pause_decisions !== undefined) {
      results.push(checkPauseDecisionsArray(obj.pause_decisions, file));
    }
  }
```

- [ ] **Step 3.5: 修改 `src/core/validate/marker-schema.ts:86-99` — forge-review-failed/v1 分支加 pause_decisions 校验**

```typescript
  } else if (schema === 'forge-review-failed/v1') {
    results.push(checkTimestamp(obj, 'failed_at', file));
    if (!Array.isArray(obj.unresolved_outcomes)) {
      results.push(
        failed({
          artifact: 'marker',
          field: 'unresolved_outcomes',
          message: 'must be array',
          file,
        }),
      );
    }
    results.push(checkStringArray(obj, 'appended_tasks', file));
    // plan-9c Task 1 新增
    if (obj.pause_decisions !== undefined) {
      results.push(checkPauseDecisionsArray(obj.pause_decisions, file));
    }
  }
```

- [ ] **Step 3.6: 在 `src/core/validate/marker-schema.ts` 文件末尾(checkVerifyFindingsArray 函数之后,约 line 530)追加 checkPauseDecisionsArray**

```typescript
// plan-9c Task 1:pause_decisions 数组校验
// 校验范围:必填字段 / 类型 / 枚举值 / id 唯一性(沿 master §3.12.1 + design §2.1.5)
// 不校验业务规则(option=3 必须有 non_blocking_rationale 等)— 那是 Task 2 fence 的事
function checkPauseDecisionsArray(v: unknown, file?: string): ValidationResult {
  if (!Array.isArray(v)) {
    return failed({
      artifact: 'marker',
      field: 'pause_decisions',
      message: 'must be array',
      file,
    });
  }
  const results: ValidationResult[] = [];
  // id 唯一性校验(沿 checkVerifyFindingsArray 同模式)
  const seenIds = new Set<number>();
  for (let i = 0; i < v.length; i++) {
    const p = v[i] as { id?: unknown };
    if (typeof p?.id === 'number') {
      if (seenIds.has(p.id)) {
        results.push(
          failed({
            artifact: 'marker',
            field: `pause_decisions[${i}].id`,
            message: `pause_decision id ${p.id} 重复(同一 marker 内 id 必须唯一)`,
            file,
          }),
        );
      }
      seenIds.add(p.id);
    }
  }
  for (let i = 0; i < v.length; i++) {
    const p = v[i] as Record<string, unknown> | null;
    if (!p || typeof p !== 'object') {
      results.push(
        failed({
          artifact: 'marker',
          field: `pause_decisions[${i}]`,
          message: 'must be object',
          file,
        }),
      );
      continue;
    }
    const fieldBase = `pause_decisions[${i}]`;
    // 必填 8 字段(沿 design §2.1.5,v3 codex NIT 11 修订:7 → 8):id / paused_at / task_ref / issue_summary / severity / chosen_option / target_artifact / target_anchor
    if (typeof p.id !== 'number') {
      results.push(
        failed({ artifact: 'marker', field: `${fieldBase}.id`, message: 'required number', file }),
      );
    }
    if (typeof p.paused_at !== 'string' || !ISO_8601_RE.test(p.paused_at)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.paused_at`,
          message: 'must be ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ)',
          file,
        }),
      );
    }
    if (typeof p.task_ref !== 'string' || !p.task_ref) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.task_ref`,
          message: 'required string (e.g., tasks.md#task-3)',
          file,
        }),
      );
    }
    if (typeof p.issue_summary !== 'string' || !p.issue_summary) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.issue_summary`,
          message: 'required non-empty string',
          file,
        }),
      );
    }
    if (!isSeverity(p.severity)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.severity`,
          message: `must be one of ${[...SEVERITY_VALUES].join(', ')}`,
          file,
        }),
      );
    }
    if (typeof p.chosen_option !== 'number' || !CHOSEN_OPTION_VALUES.has(p.chosen_option)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.chosen_option`,
          message: 'must be number in {1, 2, 3, 4}',
          file,
        }),
      );
    }
    if (typeof p.target_artifact !== 'string' || !p.target_artifact) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.target_artifact`,
          message: 'required string (e.g., proposal.md / tasks.md / design.md)',
          file,
        }),
      );
    }
    if (typeof p.target_anchor !== 'string' || !p.target_anchor) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.target_anchor`,
          message: 'required string (e.g., "## Out of Scope")',
          file,
        }),
      );
    }
    // severity_acked_by / severity_acked_at 类型校验(null 或 string)
    if (
      p.severity_acked_by !== null &&
      (typeof p.severity_acked_by !== 'string' || !p.severity_acked_by)
    ) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.severity_acked_by`,
          message: 'must be null or non-empty string',
          file,
        }),
      );
    }
    if (p.severity_acked_at !== null) {
      if (typeof p.severity_acked_at !== 'string' || !ISO_8601_RE.test(p.severity_acked_at)) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.severity_acked_at`,
            message: 'must be null or ISO 8601 UTC',
            file,
          }),
        );
      }
    }
    // non_blocking_rationale / other_rationale / other_acked_by 类型校验(null 或 string;业务规则在 fence)
    for (const field of ['non_blocking_rationale', 'other_rationale', 'other_acked_by']) {
      const val = p[field];
      if (val !== null && (typeof val !== 'string' || !val)) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.${field}`,
            message: 'must be null or non-empty string',
            file,
          }),
        );
      }
    }
  }
  return mergeResults(...results);
}
```

### Step 4: 跑测试确认全绿(TDD green)

- [ ] **Step 4.1: 跑 schema 单测**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/markers/pause-decisions-schema.test.ts
```

预期:**12 tests PASS, 0 fail**(v2 codex MINOR 9 修订)。

- [ ] **Step 4.2: 跑全 marker schema 测试确认不破坏 9d 现有测试**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/markers/
```

预期:含 verify-findings-schema.test.ts 在内全 marker 测试 PASS。

### Step 5: 类型检查 + lint + format + commit

- [ ] **Step 5.1: 跑 typecheck + lint + format:check**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm format:check
```

预期:全 PASS(若 format 有问题先 `pnpm format` 修正)。

- [ ] **Step 5.2: 提交 Task 1**

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add src/core/markers/types.ts src/core/validate/marker-schema.ts tests/core/markers/pause-decisions-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(9c Task 1): PauseDecision marker schema + checkPauseDecisionsArray helper

- src/core/markers/types.ts: add PauseDecision interface + ChosenOption type
- 4 marker interfaces (Verify/Review/VerifyFailed/ReviewFailed) extend pause_decisions?
- src/core/validate/marker-schema.ts: checkPauseDecisionsArray (required fields,
  enum values, id uniqueness, ISO 8601 timestamps); call in 4 schema branches
- tests/core/markers/pause-decisions-schema.test.ts: 13 tests cover
  superset additive / id duplicate / missing required / enum violations

Sealed: PauseDecision schema fields (沿 design §2.1.5)
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 3. Task 2 — archive.ts fence pause_decisions 五类业务校验

**Files**:
- Create: `src/core/archive/pause-decisions-fence.ts`(validatePauseDecisionsFence async 函数)
- Modify: `src/cli/commands/archive.ts:316-333`(步骤 3.8 加调用点,verify_findings fence 之后)
- Create: `tests/cli/archive-pause-fence.test.ts`(5 fence 分支 × 8 case)

### Step 1: 先写 fence 失败测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/cli/archive-pause-fence.test.ts`**

```typescript
// archive-pause-fence.test.ts — plan-9c Task 2 单测
// 沿 verify-findings-fence.test.ts 同模式,覆盖 5 fence 分支 + 边界 case
// 校验范围:option 1-4 业务规则 + CRITICAL 重定向 + ack 校验 + marker 缺失老兼容

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePauseDecisionsFence } from '../../src/core/archive/pause-decisions-fence.js';

// 合法 PauseDecision baseline(option=3 + 完整 ack + non_blocking_rationale)
const basePauseDecision = {
  id: 1,
  paused_at: '2026-05-12T14:30:00Z',
  task_ref: 'tasks.md#task-3',
  issue_summary: 'subagent 发现 specs 没覆盖 OAuth refresh token 过期处理',
  severity: 'WARNING' as const,
  severity_acked_by: 'msc',
  severity_acked_at: '2026-05-12T14:32:00Z',
  chosen_option: 3 as const,
  target_artifact: 'proposal.md',
  target_anchor: '## Out of Scope',
  non_blocking_rationale: 'subagent 可以跳过该 issue 完成本 task 主体功能',
  other_rationale: null,
  other_acked_by: null,
};

// v4 codex NEW-MAJOR A6 + B4 联动修订:fence 不再需要 ctx 参数,单测调用回归 v3 前形态

describe('validatePauseDecisionsFence', () => {
  let changeDir: string;

  beforeEach(() => {
    changeDir = mkdtempSync(join(tmpdir(), 'forge-pause-fence-'));
    mkdirSync(changeDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(changeDir, { recursive: true, force: true });
  });

  // —— Superset additive:marker 缺 pause_decisions → 老兼容通过 ——
  it('marker 缺 pause_decisions 字段 → 老兼容 ok', async () => {
    const result = await validatePauseDecisionsFence({}, changeDir);
    expect(result.valid).toBe(true);
  });

  it('pause_decisions: [] → 通过', async () => {
    const result = await validatePauseDecisionsFence({ pause_decisions: [] }, changeDir);
    expect(result.valid).toBe(true);
  });

  // —— CRITICAL 重定向:不应进 pause(无 ack 路径) ——
  it('CRITICAL severity → 拒签(CRITICAL 应走 forge 强 fence,不应进 pause)', async () => {
    const result = await validatePauseDecisionsFence(
      { pause_decisions: [{ ...basePauseDecision, severity: 'CRITICAL' }] },
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/CRITICAL.*应走.*fence/);
  });

  // —— WARNING + 未 ack → 拒签 ——
  it('WARNING + severity_acked_by 空 → 拒签', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          { ...basePauseDecision, severity: 'WARNING', severity_acked_by: null },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toMatch(/severity_acked_by/);
  });

  // —— SUGGESTION + 未 ack → 通过(fence 仅校验存在性) ——
  it('SUGGESTION + severity_acked_by 空 → 通过(SUGGESTION 例外)', async () => {
    // SUGGESTION 必须配 option=3 路径 + non_blocking_rationale 才合理(option=1/2 SUGGESTION 没意义)
    writeFileSync(
      join(changeDir, 'proposal.md'),
      buildProposalWithScopeEntry('issue-1', '## Out of Scope', 'forge-oos'),
    );
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            severity: 'SUGGESTION',
            severity_acked_by: null,
            severity_acked_at: null,
            target_artifact: 'proposal.md',
            target_anchor: '## Out of Scope',
            non_blocking_rationale: 'edge-case 建议',
            // scope_entry_id 通过 task_ref 关联 'issue-1'(下文 Step 2 fence 实施会用 task_ref 末段做 entry_id 匹配)
            task_ref: 'tasks.md#issue-1',
          },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(true);
  });

  // —— option=1 (扩 scope):target_artifact=proposal.md + target_anchor 含 'What Changes' ——
  it('option=1 + target_artifact=proposal.md + target_anchor=## What Changes → 通过', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 1,
            target_artifact: 'proposal.md',
            target_anchor: '## What Changes',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(true);
  });

  it('option=1 + target_artifact=tasks.md → 拒签(option=1 必须改 proposal.md)', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 1,
            target_artifact: 'tasks.md',
            target_anchor: '## What Changes',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/option=1.*proposal/);
  });

  // —— option=2 (加 task):tasks.md 中 task_ref 指向的行已勾选 [x] ——
  it('option=2 + tasks.md 中 task_ref 行已勾选 → 通过', async () => {
    writeFileSync(
      join(changeDir, 'tasks.md'),
      '# Tasks\n- [x] **task-3** subagent 实施 OAuth\n',
    );
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 2,
            task_ref: 'tasks.md#task-3',
            target_artifact: 'tasks.md',
            target_anchor: '- task-3',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(true);
  });

  it('option=2 + tasks.md 中 task_ref 行未勾选 [ ] → 拒签', async () => {
    writeFileSync(
      join(changeDir, 'tasks.md'),
      '# Tasks\n- [ ] **task-3** subagent 实施 OAuth\n',
    );
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 2,
            task_ref: 'tasks.md#task-3',
            target_artifact: 'tasks.md',
            target_anchor: '- task-3',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/option=2.*未勾选/);
  });

  it('option=2 + tasks.md 中找不到 task_ref → 拒签', async () => {
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n- [x] **task-1** other\n');
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 2,
            task_ref: 'tasks.md#task-3',
            target_artifact: 'tasks.md',
            target_anchor: '- task-3',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/找不到.*task-3/);
  });

  // —— option=3 (转 out-of-scope):scope-entries 有 entry + non_blocking_rationale 非空 ——
  it('option=3 + scope-entries 有 entry + non_blocking_rationale → 通过', async () => {
    writeFileSync(
      join(changeDir, 'proposal.md'),
      buildProposalWithScopeEntry('issue-1', '## Out of Scope', 'forge-oos'),
    );
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          { ...basePauseDecision, task_ref: 'tasks.md#issue-1' },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(true);
  });

  it('option=3 + non_blocking_rationale 为 null → 拒签', async () => {
    writeFileSync(
      join(changeDir, 'proposal.md'),
      buildProposalWithScopeEntry('issue-1', '## Out of Scope', 'forge-oos'),
    );
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            task_ref: 'tasks.md#issue-1',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/option=3.*non_blocking_rationale/);
  });

  it('option=3 + scope-entries 块无 triggered_by 反向引用本 pause_decision → 拒签', async () => {
    // v3 codex MAJOR 5 修订:负例改为 triggered_by.id=999 ≠ basePauseDecision.id=1
    //   (老版用 entry.id='different-id' 但 triggered_by.id 仍是 1,新 fence 反向查找仍匹配)
    writeFileSync(
      join(changeDir, 'proposal.md'),
      buildProposalWithScopeEntry('different-id', '## Out of Scope', 'forge-oos', 999),
    );
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            non_blocking_rationale: 'rationale here',
          },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/scope-entries.*triggered_by.*pause_decision/);
  });

  // —— option=4 (Other):other_rationale + other_acked_by 必填 ——
  it('option=4 + other_rationale + other_acked_by 非空 → 通过', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 4,
            other_rationale: '用户自定义方案 X',
            other_acked_by: 'msc',
            target_artifact: 'proposal.md',
            target_anchor: '## What Changes',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(true);
  });

  it('option=4 + other_rationale 为 null → 拒签', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 4,
            other_rationale: null,
            other_acked_by: 'msc',
            target_artifact: 'proposal.md',
            target_anchor: '## What Changes',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/option=4.*other_rationale/);
  });

  it('option=4 + other_acked_by 为 null → 拒签', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 4,
            other_rationale: '用户自定义方案 X',
            other_acked_by: null,
            target_artifact: 'proposal.md',
            target_anchor: '## What Changes',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/option=4.*other_acked_by/);
  });
});

// Helper:构造含 scope-entries fenced YAML 块的 proposal.md(沿 9b §2.6.3 anchor 模式)
// v3 codex MAJOR 5 修订:加 triggeredById 参数,允许负例传 999 让反向查找匹配失败
function buildProposalWithScopeEntry(
  entryId: string,
  sectionHeader: string,
  anchorId: 'forge-oos' | 'forge-future-work',
  triggeredById: number = 1, // 默认 1 对齐 basePauseDecision.id=1;负例传非 1 让反向查找失败
): string {
  return `# Proposal: test-change

## What Changes

- baseline change

${sectionHeader} {#${anchorId}}

\`\`\`yaml
schema: forge-scope-entries/v1
anchor_id: ${anchorId}
entries:
  - id: ${entryId}
    category: ${anchorId === 'forge-oos' ? 'out-of-scope' : 'future-work'}
    description: "subagent paused issue"
    reason: "non-blocking, transferred via pause_decisions"
    priority: null
    status: active
    triggered_by:
      source: pause_decisions
      id: ${triggeredById}
    related_change: null
\`\`\`
`;
}
```

- [ ] **Step 1.2: 跑测试确认全红**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/cli/archive-pause-fence.test.ts
```

预期:**全部测试 FAIL(import 失败,pause-decisions-fence.ts 尚不存在)**。

### Step 2: 实现 pause-decisions-fence.ts(TDD green)

- [ ] **Step 2.1: 创建 `src/core/archive/pause-decisions-fence.ts`**

```typescript
// src/core/archive/pause-decisions-fence.ts — plan-9c Task 2
// 沿 design §2.1.5 fence 五类业务校验:
//   - CRITICAL 重定向(CRITICAL 应走 forge 强 fence,不应进 pause)
//   - WARNING + 未 ack → 拒签
//   - SUGGESTION + 未 ack → 通过(SUGGESTION 例外)
//   - option=1:target_artifact=proposal.md + target_anchor 包含 'What Changes'
//   - option=2:tasks.md 中 task_ref 末段对应的行已勾选 [x]
//   - option=3:proposal.md/design.md 含 scope-entries fenced YAML 块 + entry_id 匹配 + non_blocking_rationale 非空
//   - option=4:other_rationale + other_acked_by 非空
//
// 沿 verify-findings-fence.ts 模块化模式;option=2/3 需读 fs 故 async

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PauseDecision } from '../markers/types.js';
import { type ValidationResult, ok, failed, mergeResults } from '../validate/types.js';
// v2 codex MAJOR 7 修订:复用 9b parseFencedYamlBlocks,删除自写 extractYamlFencedBlocks + 直接 parseYaml
import { parseFencedYamlBlocks } from '../parse/fenced-yaml.js';
// v3 codex MAJOR 6 修订:option=3 fence 加 scope-entries schema 子集校验(category/status 等)
// v4 codex NEW-MAJOR B4 修订:不调用整文件 validateScopeEntries(会被同文件其他段坏 YAML 误拦本 pause)
//                              改用 parseMarkdown 找 target_anchor 对应 section,只在该段内跑 schema 子集校验
import { parseMarkdown } from '../parse/markdown.js';
import {
  ANCHOR_TO_CATEGORY,
  isScopeCategory,
  isScopeStatus,
  type ScopeAnchorId,
} from '../schemas/scope-entries.js';

/**
 * pause_decisions fence 五类业务校验(沿 design §2.1.5)
 * @param marker — verify-passed / review-passed 等 marker 对象(Record 形)
 * @param changeDir — change 目录绝对路径(需读 proposal.md / tasks.md / design.md)
 * @param file — 可选错误报告用 marker 文件路径
 *
 * v4 codex NEW-MAJOR A6 + B4 联动修订:fence 不再需要 ctx 参数(v3 加 ctx 是为给
 * `validateScopeEntries` 算 finding_hash;但 v4 NEW-MAJOR B4 改用 `parseMarkdown` 局部段
 * 校验后,fence 内部不再调 validateScopeEntries,ctx 自然 unused → 沿 YAGNI 移除)
 */
export async function validatePauseDecisionsFence(
  marker: Record<string, unknown>,
  changeDir: string,
  file?: string,
): Promise<ValidationResult> {
  const decisions = marker.pause_decisions;
  if (!Array.isArray(decisions)) return ok(); // 老 marker 缺 → 通过

  const results: ValidationResult[] = [];
  for (let i = 0; i < decisions.length; i++) {
    const p = decisions[i] as PauseDecision;
    const fieldBase = `pause_decisions[${i}]`;

    // —— 1. CRITICAL 重定向:不应进 pause ——
    if (p.severity === 'CRITICAL') {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.severity`,
          message:
            `pause_decision id=${p.id} severity=CRITICAL — CRITICAL 应走 forge 强 fence,不应进 Fluid Pause(沿 design §2.1.2)`,
          file,
        }),
      );
      continue; // CRITICAL 拒签后不再校验其他规则(避免 cascade)
    }

    // —— 2. WARNING + 未 ack → 拒签(SUGGESTION 例外) ——
    if (p.severity === 'WARNING') {
      if (!p.severity_acked_by || !p.severity_acked_at) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.severity_acked_by`,
            message: `WARNING pause_decision 必须有 severity_acked_by + severity_acked_at(沿 design §2.1.5)`,
            file,
          }),
        );
      }
    }
    // SUGGESTION + 未 ack → 通过(fence 不要求 ack)

    // —— 3. option 五分支业务校验 ——
    if (p.chosen_option === 1) {
      // option=1 扩 scope:必须改 proposal.md `## What Changes`
      // TODO(9e1):本 task 仅校验 marker 字段一致性;design §2.1.5 line 262 要求"diff 内含 What Changes 段变更"
      // 真实 git diff 段级校验留给 9e1 archive_summary 集成 — 沿 plan-9c §7.5 已知降级声明
      if (p.target_artifact !== 'proposal.md') {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.target_artifact`,
            message: `option=1(扩 scope)必须 target_artifact='proposal.md',实际:${p.target_artifact}`,
            file,
          }),
        );
      }
      if (!p.target_anchor.includes('What Changes')) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.target_anchor`,
            message: `option=1(扩 scope)必须 target_anchor 包含 'What Changes',实际:${p.target_anchor}`,
            file,
          }),
        );
      }
    } else if (p.chosen_option === 2) {
      // option=2 加 task:tasks.md 中 task_ref 末段对应的行已勾选 [x]
      const tasksRes = await checkOption2TaskChecked(p, changeDir, fieldBase, file);
      results.push(tasksRes);
    } else if (p.chosen_option === 3) {
      // option=3 转 out-of-scope:scope-entries 有对应 entry + non_blocking_rationale 非空
      if (!p.non_blocking_rationale) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.non_blocking_rationale`,
            message: `option=3(转 out-of-scope)必须 non_blocking_rationale 非空(沿 design §2.1.5)`,
            file,
          }),
        );
      }
      // v4 codex NEW-MAJOR B4 修订:fence 只校验 target_anchor 对应段,不传 ctx 进 checkOption3
      //   (因不再调 validateScopeEntries 整文件,ctx 也不用作 finding_hash 绑定)
      const scopeRes = await checkOption3ScopeEntry(p, changeDir, fieldBase, file);
      results.push(scopeRes);
    } else if (p.chosen_option === 4) {
      // option=4 Other:other_rationale + other_acked_by 必填
      if (!p.other_rationale) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.other_rationale`,
            message: `option=4(Other)必须 other_rationale 非空`,
            file,
          }),
        );
      }
      if (!p.other_acked_by) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.other_acked_by`,
            message: `option=4(Other)必须 other_acked_by 非空`,
            file,
          }),
        );
      }
    }
  }

  return mergeResults(...results);
}

/**
 * option=2 校验:tasks.md 中 task_ref 末段对应的 task 行已勾选 [x]
 * task_ref 格式:'tasks.md#task-3' → 末段 'task-3' 用作 grep key
 */
async function checkOption2TaskChecked(
  p: PauseDecision,
  changeDir: string,
  fieldBase: string,
  file?: string,
): Promise<ValidationResult> {
  const tasksPath = join(changeDir, 'tasks.md');
  if (!existsSync(tasksPath)) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.task_ref`,
      message: `option=2 校验失败:tasks.md 不存在(${tasksPath})`,
      file,
    });
  }
  const tasksContent = await readFile(tasksPath, 'utf8');
  // 提取 task_ref 末段(支持 'tasks.md#task-3' / 'tasks.md#task-name' 等)
  const taskKey = p.task_ref.split('#').pop() ?? '';
  if (!taskKey) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.task_ref`,
      message: `option=2 校验失败:task_ref 末段为空(${p.task_ref})`,
      file,
    });
  }
  // v3 codex MAJOR 4 修订:用精确 regex 匹配 `- [x] **taskKey**` 整体形式
  // v4 codex NEW-MAJOR A4 修订:`\b` 在 `task-2-extra` 中 `2` 后接 `-` 仍是 word boundary
  //                              → false positive。改用 negative lookahead `(?![\w-])`
  // v5 codex MAJOR 2 修订:`\w` 无 `/u` flag 时仅 ASCII;中文/日文/俄文 task key `任务-3补充`
  //                        中 `补` 非 `\w` 非 `-` → lookahead 通过 → 误匹配 `任务-3` 前缀。
  //                        改用 Unicode property `\p{L}\p{N}_-`(Letter / Number / underscore / hyphen)
  //                        + `/u` flag,精确拒绝任何字母数字下划线连字符为后缀的扩展形式
  // v6 codex MAJOR A4 续修:v5 只给 bare 分支加 lookahead,**bold 分支 `\*\*taskKey\*\*` 后未加**
  //                          → `- [x] **task-2**-extra` / `- [x] **task-2**补充` 仍误匹配 prefix 形式。
  //                          v6 给 bold 分支末尾同样加 `(?![\p{L}\p{N}_-])` 闭合 bold 后缀扩展漏洞
  // 形式:`^\s*-\s*\[[ x]\]\s*(?:\*\*<taskKey>\*\*(?![\p{L}\p{N}_-])|<taskKey>(?![\p{L}\p{N}_-]))`,flag `iu`
  // 测试:`task-2`/`任务-3` → `- [x] <taskKey> ...` ✓ / `<taskKey>-extra` / `<taskKey>补充` ✗ /
  //       `- [x] **task-2** added` ✓(空格非 `\p{L}\p{N}_-`) / `**task-2**-extra` ✗(v6 修订拒绝)
  const taskKeyEscaped = taskKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const taskItemRe = new RegExp(
    `^\\s*-\\s*\\[([ x])\\]\\s*(?:\\*\\*${taskKeyEscaped}\\*\\*(?![\\p{L}\\p{N}_-])|${taskKeyEscaped}(?![\\p{L}\\p{N}_-]))`,
    'iu', // v5 MAJOR 2:加 'u' flag 启用 Unicode property
  );
  const lines = tasksContent.split('\n');
  const matchedLines = lines
    .map((line) => ({ line, m: line.match(taskItemRe) }))
    .filter((x) => x.m !== null);
  if (matchedLines.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.task_ref`,
      message: `option=2 校验失败:tasks.md 中找不到 task item ${taskKey}(需 \`- [x] **${taskKey}**\` 形式)`,
      file,
    });
  }
  const checkedLines = matchedLines.filter((x) => x.m![1].toLowerCase() === 'x');
  if (checkedLines.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.task_ref`,
      message: `option=2 校验失败:tasks.md 中 task item ${taskKey} 行未勾选 [x]`,
      file,
    });
  }
  return ok();
}

/**
 * option=3 校验:proposal.md / design.md 含 scope-entries fenced YAML 块 +
 *   通过 `triggered_by.source='pause_decisions' AND triggered_by.id=<pause.id>` 反向查找匹配 entry
 *   (沿 9b §2.6 scope-entries schema TriggeredByRef 字段)
 *
 * v2 codex MAJOR 6:不再把 task_ref 末段当 scope entry id;用 triggered_by 反向查找
 * v2 codex MAJOR 7:复用 9b parseFencedYamlBlocks,YAML parse 失败抛 FencedYamlParseError → 拒签
 * v3 codex MAJOR 6(新):option=3 fence 加 scope-entries schema 子集校验
 *                       (反向加固 — 防止用户在 propose 后篡改 scope-entries YAML 块)
 * v3 codex MAJOR 7(新):限制 target_artifact ∈ {'proposal.md', 'design.md'} +
 *                       target_anchor 白名单 ∈ {'## Out of Scope', '## Future Work'}
 * v3 codex MINOR 8:triggered_by.id 用 String() normalize 比较,避免 string '1' vs number 1 漏拒
 * v4 codex NEW-MAJOR B4(新):只校验 target_anchor 对应那段(不跑整 artifact validateScopeEntries),
 *                            避免同文件其他段坏 YAML 误拦本 pause
 */
async function checkOption3ScopeEntry(
  p: PauseDecision,
  changeDir: string,
  fieldBase: string,
  file?: string,
): Promise<ValidationResult> {
  // v3 MAJOR 7:target_artifact 白名单
  if (p.target_artifact !== 'proposal.md' && p.target_artifact !== 'design.md') {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_artifact`,
      message: `option=3 校验失败:target_artifact 必须 ∈ {'proposal.md', 'design.md'},实际 ${p.target_artifact}`,
      file,
    });
  }
  // v3 MAJOR 7:target_anchor 白名单
  if (p.target_anchor !== '## Out of Scope' && p.target_anchor !== '## Future Work') {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:target_anchor 必须 ∈ {'## Out of Scope', '## Future Work'},实际 ${p.target_anchor}`,
      file,
    });
  }

  const artifactPath = join(changeDir, p.target_artifact);
  if (!existsSync(artifactPath)) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_artifact`,
      message: `option=3 校验失败:${p.target_artifact} 不存在`,
      file,
    });
  }
  const content = await readFile(artifactPath, 'utf8');

  // v4 codex NEW-MAJOR B4:用 parseMarkdown 找 target_anchor 对应 section,只在该段内校验
  //   (不调 validateScopeEntries 整文件,避免被同文件其他段坏 YAML 误拦本 pause)
  const md = parseMarkdown(content);
  const targetAnchorId: ScopeAnchorId =
    p.target_anchor === '## Out of Scope' ? 'forge-oos' : 'forge-future-work';
  const targetSection = md.sections.find((sec) => sec.anchor === targetAnchorId);
  if (!targetSection) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:${p.target_artifact} 找不到 {#${targetAnchorId}} anchor 段(target_anchor=${p.target_anchor})`,
      file,
    });
  }

  // v2 MAJOR 7:用 9b parseFencedYamlBlocks 只对该段 body 抽 YAML 块
  let yamlBlocks: unknown[];
  try {
    yamlBlocks = parseFencedYamlBlocks(targetSection.body);
  } catch (err) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_artifact`,
      message: `option=3 校验失败:${p.target_artifact} 段 ${p.target_anchor} YAML 块解析失败(${(err as Error).message})`,
      file,
    });
  }
  if (yamlBlocks.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:${p.target_artifact} 段 ${p.target_anchor} 内无 scope-entries fenced YAML 块`,
      file,
    });
  }

  // v3 MAJOR 6(新)+ v4 NEW-MAJOR B4:仅校验本段 scope-entries 子集 schema(不跑整 artifact)
  const block = yamlBlocks[0] as Record<string, unknown>;
  if (block.schema !== 'forge-scope-entries/v1') {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:段 ${p.target_anchor} 内 YAML 块 schema 非 forge-scope-entries/v1(实际:${String(block.schema)})`,
      file,
    });
  }
  if (block.anchor_id !== targetAnchorId) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:段 ${p.target_anchor} 内 YAML 块 anchor_id (${String(block.anchor_id)}) ≠ enclosing section anchor (${targetAnchorId})`,
      file,
    });
  }
  const entries = block.entries;
  if (!Array.isArray(entries)) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:段 ${p.target_anchor} 内 entries 不是数组`,
      file,
    });
  }

  // v2 MAJOR 6:反向查找 — 遍历本段 entries,找 triggered_by 匹配本 pause_decision.id
  // v3 MINOR 8:用 String() normalize 比较,接受 yaml 中 id 是 number 或 string 两种形式
  // v5 codex MAJOR 1+3 修订:补 id / description / reason 字段校验对齐 9b validateScopeEntries
  //                          完整不变量(scope-entries.ts:120-128)。**找到 triggered_by 匹配的 entry**
  //                          后才校验该 entry 的字段完整性 — 不匹配的 entry 不校验(避免误拦其他 entry)
  // v6 codex MAJOR B2 修订:v5 在匹配第一个 entry 后 `return ok()`,后续 entry 不校验。
  //                          但 design 语义 pause id ↔ scope entry 一对一,出现多条 triggered_by 引用
  //                          同一 pause.id 是数据异常(可能篡改/逻辑错)→ **exactly one 否则拒签**:
  //                          先收集所有匹配 entry,数量 ≠ 1 直接拒签;数量 = 1 才做完整字段校验
  const expectedCategory = ANCHOR_TO_CATEGORY[targetAnchorId];
  const matchedEntries: Record<string, unknown>[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const triggeredBy = e.triggered_by as Record<string, unknown> | null;
    if (
      !triggeredBy ||
      triggeredBy.source !== 'pause_decisions' ||
      String(triggeredBy.id) !== String(p.id) // v3 MINOR 8:normalize 类型
    ) {
      continue;
    }
    matchedEntries.push(e);
  }
  // v6 MAJOR B2:exactly one
  if (matchedEntries.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:${p.target_artifact} 段 ${p.target_anchor} 内无 entry.triggered_by={source:'pause_decisions', id:${p.id}} 反向引用本 pause_decision(沿 9b §2.6 TriggeredByRef)`,
      file,
    });
  }
  if (matchedEntries.length > 1) {
    // v6 codex B4 NIT 修订:缺 id 或非 string 时输出占位,避免 'undefined' 误导
    const matchedIds = matchedEntries
      .map((e) => (typeof e.id === 'string' && e.id.length > 0 ? e.id : '<missing-id>'))
      .join(', ');
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:${p.target_artifact} 段 ${p.target_anchor} 内有 ${matchedEntries.length} 条 entry triggered_by 引用本 pause id=${p.id}(应 exactly one,实际 entry ids: [${matchedIds}])— 数据异常,拒签(v6 codex MAJOR B2 修订)`,
      file,
    });
  }
  // 唯一匹配 entry — 做完整字段校验(对齐 9b validateScopeEntries 不变量)
  const e = matchedEntries[0];
  if (typeof e.id !== 'string' || e.id.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:匹配的 scope entry 缺 id(non-empty string)(沿 9b scope-entries.ts:121)`,
      file,
    });
  }
  if (typeof e.description !== 'string' || e.description.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:匹配的 scope entry id=${e.id} 缺 description(non-empty string)(沿 9b scope-entries.ts:125)`,
      file,
    });
  }
  if (typeof e.reason !== 'string' || e.reason.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:匹配的 scope entry id=${e.id} 缺 reason 必填论证(沿 9b scope-entries.ts:129 + design §2.6.3)`,
      file,
    });
  }
  if (!isScopeCategory(e.category) || e.category !== expectedCategory) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:匹配的 scope entry id=${e.id} category=${String(e.category)} ≠ anchor ${targetAnchorId} 默认映射 ${expectedCategory}(沿 9b scope-entries.ts:133)`,
      file,
    });
  }
  if (!isScopeStatus(e.status)) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:匹配的 scope entry id=${e.id} status=${String(e.status)} 非合法(沿 9b scope-entries.ts:142)`,
      file,
    });
  }
  return ok();
}
```

- [ ] **Step 2.2: 跑测试确认全绿**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/cli/archive-pause-fence.test.ts
```

预期:**全部测试 PASS**(若某 case fail 检查 fence 实现细节)。

### Step 3: archive.ts 集成 fence 调用点

- [ ] **Step 3.1: 修改 `src/cli/commands/archive.ts:41-42` 加 import**

```typescript
// plan-9d Task 6:verify_findings fence + ack-log consistency
import { validateVerifyFindingsFence } from '../../core/archive/verify-findings-fence.js';
import { validateAckLogConsistency } from '../../core/archive/ack-log-consistency.js';
// plan-9c Task 2:pause_decisions fence
import { validatePauseDecisionsFence } from '../../core/archive/pause-decisions-fence.js';
```

- [ ] **Step 3.2: 修改 `src/cli/commands/archive.ts:325-333`(verify_findings fence 后,ack-log 之前)插入调用点**

```typescript
          // 步骤 3.6:plan-9d Task 6 — verify_findings fence 三级 × resolved × ack 矩阵 + finding_hash 篡改拒签
          const vfResult = validateVerifyFindingsFence(verifyRec, verifyPath);
          if (!vfResult.valid) {
            console.error('✗ verify_findings fence 拒签:');
            for (const e of vfResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }

          // 步骤 3.7:plan-9c Task 2 — pause_decisions fence(option 1-4 五类业务校验 + CRITICAL 重定向)
          // v2 codex MAJOR 4 修订:对 verifyRec + reviewRec 都跑 fence
          // v4 codex NEW-MAJOR A6 + B4 联动:fence 不再需要 ctx 参数(B4 改用 parseMarkdown 局部段校验,
          //   不再调 validateScopeEntries → ctx unused → 沿 YAGNI 移除)
          const pdVerifyResult = await validatePauseDecisionsFence(verifyRec, changeDir, verifyPath);
          if (!pdVerifyResult.valid) {
            console.error('✗ pause_decisions fence 拒签(verify-passed):');
            for (const e of pdVerifyResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
          const pdReviewResult = await validatePauseDecisionsFence(reviewRec, changeDir, reviewPath);
          if (!pdReviewResult.valid) {
            console.error('✗ pause_decisions fence 拒签(review-passed):');
            for (const e of pdReviewResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }

          // 步骤 3.8:plan-9d Task 6 v2 B-4 — ack-log 一致性 cross-check
          // v3 codex BLOCKER 2 修订:对 verifyRec + reviewRec 都跑 cross-check
          // (review marker 同样可承载 pause_decisions superset additive,沿 9c Task 1 schema)
          const ackVerifyResult = await validateAckLogConsistency(changeDir, verifyRec, changeId);
          if (!ackVerifyResult.valid) {
            console.error('✗ ack-log 一致性校验失败(verify-passed):');
            for (const e of ackVerifyResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
          const ackReviewResult = await validateAckLogConsistency(changeDir, reviewRec, changeId);
          if (!ackReviewResult.valid) {
            console.error('✗ ack-log 一致性校验失败(review-passed):');
            for (const e of ackReviewResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
```

(注:原步骤 3.7 重编号为 3.8;若 archive.ts 后续段落引用 "步骤 3.7" 也要相应更新 — 但本文件正文段落不再引用编号,只需注释更新)

### Step 3.5(v2 codex BLOCKER 1 新增):扩展 `validateAckLogConsistency` 覆盖 pause_decisions

**问题**:plan v1 在 SDD SKILL.md 反向加固段宣称"伪造 `severity_acked_by` 会被 ack-log cross-check 拦截",但 9d 实施的 `validateAckLogConsistency` 只读 `verifyMarker.verify_findings`(`ack-log-consistency.ts:45-46`),不读 `pause_decisions`。当前 AI 主代理在 marker 直填 `severity_acked_by: msc` 且 ack-log 无对应条目时,fence 不能拦截。本步骤扩展该函数覆盖 pause_decisions WARNING 路径。

- [ ] **Step 3.5.1: 修改 `src/core/archive/ack-log-consistency.ts:40-46` 在函数开头加 pause_decisions 路径**

```typescript
export async function validateAckLogConsistency(
  changeDir: string,
  verifyMarker: Record<string, unknown>,
  changeId: string,
): Promise<ValidationResult> {
  // v3 codex BLOCKER 1 修订:findings / pauseDecisions 都 normalize 为数组(防止 pause-only marker 进入后续 findings.length 循环崩溃)
  const findingsArr: unknown[] = Array.isArray(verifyMarker.verify_findings)
    ? (verifyMarker.verify_findings as unknown[])
    : [];
  const pauseDecisionsArr: unknown[] = Array.isArray(verifyMarker.pause_decisions)
    ? (verifyMarker.pause_decisions as unknown[])
    : [];
  // 两个都空 → 老兼容通过
  if (findingsArr.length === 0 && pauseDecisionsArr.length === 0) return ok();
```

- [ ] **Step 3.5.1b: 修改 `src/core/archive/ack-log-consistency.ts:101` for 循环用 normalize 后变量**

baseline line 101 是 `for (let i = 0; i < findings.length; i++)`,需改为用 `findingsArr`(v3 codex BLOCKER 1 修订):

```typescript
  // 改前(baseline line 101):
  // for (let i = 0; i < findings.length; i++) {
  //   const f = findings[i] as Finding;

  // 改后(v3):
  for (let i = 0; i < findingsArr.length; i++) {
    const f = findingsArr[i] as Finding;
```

(同时本文件后续凡引用 `findings[...]` 或 `findings.length` 的地方 — baseline 只在 line 101 / 102 — 也用 `findingsArr`)

- [ ] **Step 3.5.2: 在 verify_findings 循环之后(baseline line 169 之前)追加 pause_decisions 循环(沿用 `pauseDecisionsArr`)**

```typescript
  // —— v2 codex BLOCKER 1 新增:pause_decisions ack-log 一致性 ——
  // 规则:WARNING + severity_acked_by 非空 → ack-log 必须有匹配 action=ack-pause-warning + finding_id=pause_decisions:<id> 条目
  // 沿 design §2.1.5 "WARNING 必须有 severity_acked_by" + design line 496-500 ack-log cross-check
  if (pauseDecisionsArr.length > 0) {
    for (let i = 0; i < pauseDecisionsArr.length; i++) {
      const p = pauseDecisionsArr[i] as Record<string, unknown>;
      const fieldBase = `pause_decisions[${i}]`;
      // 仅校验 WARNING ack 路径(SUGGESTION 允许空 ack;CRITICAL 由 fence 重定向拒签)
      if (p.severity === 'WARNING' && (p.severity_acked_by || p.severity_acked_at)) {
        const findingId = `pause_decisions:${p.id}`;
        const matchAck = ackEntries.find(
          (e) =>
            e.change_id === changeId &&
            e.finding_id === findingId &&
            e.action === 'ack-pause-warning',
        );
        if (!matchAck) {
          results.push(
            failed({
              artifact: 'marker',
              field: `${fieldBase}.severity_acked_by`,
              message: `marker pause_decision id=${p.id} ack 字段非空但 ack-log.jsonl 无对应 kind=ack + finding_id=${findingId} + action=ack-pause-warning 条目;AI 不能跨过 user 直接写 pause_decision ack(沿 design §2.1.5 + 9d v2 B-4 同模式)`,
              file: ackLogPath,
            }),
          );
          continue;
        }
        if (matchAck.user !== p.severity_acked_by) {
          results.push(
            failed({
              artifact: 'marker',
              field: `${fieldBase}.severity_acked_by`,
              message: `ack-log user (${matchAck.user}) 与 pause_decision severity_acked_by (${p.severity_acked_by}) 不一致 — ack 主体不匹配,拒签`,
              file: ackLogPath,
            }),
          );
        }
      }
    }
  }
```

- [ ] **Step 3.5.3: 创建 `tests/cli/ack-log-pause-decisions.test.ts` 单测覆盖 6 case**

```typescript
// ack-log-pause-decisions.test.ts — plan-9c Task 2 Step 3.5(v2 codex BLOCKER 1 新增)
// 沿 9d ack-log-consistency.test.ts 模式

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAckLogConsistency } from '../../src/core/archive/ack-log-consistency.js';

const basePause = {
  id: 1,
  paused_at: '2026-05-12T14:30:00Z',
  task_ref: 'tasks.md#task-3',
  issue_summary: 'test issue',
  severity: 'WARNING',
  severity_acked_by: 'msc',
  severity_acked_at: '2026-05-12T14:32:00Z',
  chosen_option: 3,
  target_artifact: 'proposal.md',
  target_anchor: '## Out of Scope',
  non_blocking_rationale: 'test rationale',
  other_rationale: null,
  other_acked_by: null,
};

describe('validateAckLogConsistency — pause_decisions extension (v2 BLOCKER 1)', () => {
  let changeDir: string;
  let evidenceDir: string;

  beforeEach(() => {
    changeDir = mkdtempSync(join(tmpdir(), 'forge-ack-pause-'));
    evidenceDir = join(changeDir, '.evidence');
    mkdirSync(evidenceDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(changeDir, { recursive: true, force: true });
  });

  it('marker 缺 pause_decisions + verify_findings → 通过', async () => {
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), '');
    const result = await validateAckLogConsistency(changeDir, {}, 'test-change');
    expect(result.valid).toBe(true);
  });

  it('WARNING pause_decision + ack-log 有匹配 ack-pause-warning 条目 → 通过', async () => {
    const ackLine = JSON.stringify({
      schema: 'forge-ack-log/v1',
      kind: 'ack',
      timestamp: '2026-05-12T14:32:00Z',
      action: 'ack-pause-warning',
      change_id: 'test-change',
      finding_id: 'pause_decisions:1',
      user: 'msc',
      rationale: 'pause ack',
      git_head: null,
      finding_hash: null,
    });
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), ackLine + '\n');
    const result = await validateAckLogConsistency(
      changeDir,
      { pause_decisions: [basePause] },
      'test-change',
    );
    expect(result.valid).toBe(true);
  });

  it('WARNING pause_decision + ack-log 无对应条目 → 拒签', async () => {
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), '');
    const result = await validateAckLogConsistency(
      changeDir,
      { pause_decisions: [basePause] },
      'test-change',
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('pause_decisions[0].severity_acked_by');
    expect(result.errors[0].message).toMatch(/ack-pause-warning.*finding_id=pause_decisions:1/);
  });

  it('WARNING pause_decision + ack-log user 与 marker 不一致 → 拒签', async () => {
    const ackLine = JSON.stringify({
      schema: 'forge-ack-log/v1',
      kind: 'ack',
      timestamp: '2026-05-12T14:32:00Z',
      action: 'ack-pause-warning',
      change_id: 'test-change',
      finding_id: 'pause_decisions:1',
      user: 'ai-agent', // ← 不匹配 marker.severity_acked_by='msc'
      rationale: 'pause ack',
      git_head: null,
      finding_hash: null,
    });
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), ackLine + '\n');
    const result = await validateAckLogConsistency(
      changeDir,
      { pause_decisions: [basePause] },
      'test-change',
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/ack 主体不匹配/);
  });

  it('SUGGESTION pause_decision + ack-log 空 → 通过(SUGGESTION 不要求 ack 一致性)', async () => {
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), '');
    const result = await validateAckLogConsistency(
      changeDir,
      {
        pause_decisions: [
          { ...basePause, severity: 'SUGGESTION', severity_acked_by: null, severity_acked_at: null },
        ],
      },
      'test-change',
    );
    expect(result.valid).toBe(true);
  });

  it('WARNING pause_decision + ack 字段全空(未 ack) → 通过(由 Task 2 fence 单独拦截 acked 缺失,不在本 cross-check 范围)', async () => {
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), '');
    const result = await validateAckLogConsistency(
      changeDir,
      {
        pause_decisions: [
          { ...basePause, severity_acked_by: null, severity_acked_at: null },
        ],
      },
      'test-change',
    );
    expect(result.valid).toBe(true); // ack-log cross-check 仅当 ack 字段非空时跑;空 ack 由 Task 2 fence WARNING 强校验拦
  });
});
```

- [ ] **Step 3.5.4: 跑测试确认 6 case 全 PASS**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/cli/ack-log-pause-decisions.test.ts
```

预期:**6 tests PASS, 0 fail**。

### Step 4: 跑全测试 + typecheck + commit

- [ ] **Step 4.1: 跑全测试**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test
```

预期:**全 PASS**(含 9d archive.test.ts 全分支 + 本 plan 新增 pause-fence + schema 测试)。

- [ ] **Step 4.2: typecheck + lint + format:check**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm format:check
```

预期:全 PASS。

- [ ] **Step 4.3: 提交 Task 2**

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add src/core/archive/pause-decisions-fence.ts src/core/archive/ack-log-consistency.ts src/cli/commands/archive.ts tests/cli/archive-pause-fence.test.ts tests/cli/ack-log-pause-decisions.test.ts
git commit -m "$(cat <<'EOF'
feat(9c Task 2): archive.ts pause_decisions fence + ack-log 扩展 + review-passed 镜像

- src/core/archive/pause-decisions-fence.ts: validatePauseDecisionsFence async function
- 5 fence branches: CRITICAL redirect, WARNING + ack 校验, option=1 (扩 scope) /
  option=2 (加 task,tasks.md 勾选检查) / option=3 (转 out-of-scope,
  triggered_by 反向查找 + non_blocking_rationale 必填) / option=4 (Other ack)
- src/core/archive/ack-log-consistency.ts: 扩展覆盖 pause_decisions WARNING 路径
  (v2 codex BLOCKER 1) — finding_id=pause_decisions:<id> + action=ack-pause-warning
- src/cli/commands/archive.ts: 步骤 3.7 对 verifyRec + reviewRec 都跑 fence
  (v2 codex MAJOR 4),exit 1 on fence rejection (沿 master §3.12.3 freeze)
- tests/cli/archive-pause-fence.test.ts: 16 cases 覆盖 superset additive /
  CRITICAL / WARNING ack / SUGGESTION exempt / 4 options × pass/fail
- tests/cli/ack-log-pause-decisions.test.ts: 6 case ack-log cross-check
- option=3 使用 9b parseFencedYamlBlocks (v2 codex MAJOR 7) +
  triggered_by 反向查找 (v2 codex MAJOR 6,不再用 task_ref 当 entry id)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 4. Task 3 — `commands/apply.md` 加 §"Fluid Pause Decision Point" 段

**Files**:
- Modify: `commands/apply.md`(在"禁止行为"前插入 §"Fluid Pause Decision Point" 段 + 段后加 §"与其他 sub-plan 合并点")

### Step 1: 在 apply.md 加新 §"Fluid Pause Decision Point" 段

- [ ] **Step 1.1: 修改 `commands/apply.md:33` 在 "## 禁止行为" 之前插入新段**

```markdown
## Fluid Pause Decision Point(v1.0,沿 design §2.1)

### 触发条件

subagent 在 apply 中段报告以下三档之一时,主代理**不直接处理**,改进 Fluid Pause:

| Subagent 报告 | 主代理行为 |
|---|---|
| `DONE_WITH_CONCERNS`,concerns 类型 = "correctness or scope"(非 CRITICAL) | 进 Fluid Pause |
| `BLOCKED` 第 4 项 = "plan itself is wrong" | 进 Fluid Pause |
| `DESIGN_ISSUE_FOUND`(v1.0 新增第 5 档,沿 subagent-driven-development SKILL.md)— subagent 实施中发现属于本 change 但 spec 未覆盖的需求 | 进 Fluid Pause |
| **任一 CRITICAL 级问题**(测试 fail / hash mismatch / evidence 丢) | **不进 Fluid Pause** — 走 forge 强 fence 拒签(保留 v0.4 行为) |

### 协议流程

```
subagent 报告 → 主代理判定 severity(CRITICAL / WARNING / SUGGESTION,沿 design §2.3)
              ↓
              CRITICAL? → yes → 走 forge 强 fence 拒签(原 v0.4 行为)
                       → no  → AskUserQuestion 四选项
                                ↓
                                用户选择
                                ↓
                                1=扩本 change scope → 更新 proposal `## What Changes` + subagent 重派
                                2=加 task 进本轮 → 主代理 append 新 task 到 tasks.md + subagent 重派
                                3=转 out-of-scope → 写到 proposal `## Out of Scope` / design `## Future Work` YAML 块(沿 §2.6)+ subagent 跳过 issue 继续
                                4=Other → 用户自由文本描述(必须配 other_rationale + other_acked_by)
                                ↓
                                marker `pause_decisions` YAML 字段记录(沿 design §2.1.5)
```

### AskUserQuestion 模板

主代理调 AskUserQuestion(harness 不支持时降级为终端 [1]/[2]/[3]/[4] prompt):

```
## Implementation Paused

**Change:** <change-id>
**Task:** <task-id>(<task-summary>)
**Progress:** N/M tasks complete

### Issue Encountered
<subagent 报告的 issue 描述,从 DONE_WITH_CONCERNS / BLOCKED concerns 字段或 DESIGN_ISSUE_FOUND payload 提取>

**Severity:** WARNING | SUGGESTION(主代理初判,沿 design §2.3 分级;CRITICAL 不进本流程)

**Options:**
1. **扩本 change scope** — 把这个 issue 纳入本 change。更新 proposal `## What Changes` 段,重新派 subagent 实施。代价:本 change scope 增大,需要重 review
2. **加 task 进本轮 tasks.md** — 当成新发现的本 change 必做项。主代理 append 新 task 到 tasks.md,subagent 重派实施。等同 v0.4 行为
3. **转 out-of-scope**(仅限 issue 不阻断本 task 时可用) — 不在本 change 做,写到 proposal `## Out of Scope` 或 design `## Future Work` 段(YAML 结构化字段,沿 §2.6)。subagent 跳过该 issue 继续当前 task。**v1.1 backlog registry 会从这里读**
4. **Other** — 自由文本描述。必须配 `other_rationale` + `other_acked_by`(用户在 marker 之外的某处确认)

What would you like to do?
```

### Marker 持久化(沿 design §2.1.5)

主代理在用户作出决策后,**必须**在 `.verify-passed` / `.review-passed` marker 的 `pause_decisions` 数组追加一项:

```yaml
pause_decisions:
  - id: 1                              # 同一 marker 内唯一
    paused_at: 2026-05-12T14:30:00Z    # ISO 8601 UTC
    task_ref: tasks.md#task-3          # 关联 task
    issue_summary: "subagent 发现 specs 没覆盖 OAuth refresh token 过期处理"
    severity: WARNING                  # 主代理初判(CRITICAL 不进本流程)
    severity_acked_by: msc             # WARNING 必须;SUGGESTION 允许 null
    severity_acked_at: 2026-05-12T14:32:00Z
    chosen_option: 3                   # 1=扩 scope / 2=加 task / 3=转 out-of-scope / 4=Other
    target_artifact: proposal.md       # option=1=proposal.md;option=2=tasks.md;option=3=proposal.md|design.md
    target_anchor: "## Out of Scope"   # marker 记录写到哪个段
    non_blocking_rationale: "subagent 可跳过该 issue 完成本 task 主体功能"  # option=3 必填
    other_rationale: null              # option=4 必填
    other_acked_by: null               # option=4 必填
```

### Fence 校验(`forge archive` 阶段,本协议反向加固点)

`forge archive` 跑 `validatePauseDecisionsFence`(沿 design §2.1.5)— 任一违反拒签 exit 1:
- CRITICAL severity → 拒签(CRITICAL 应走 forge 强 fence,不应进 pause)
- WARNING + (severity_acked_by 空 ∨ severity_acked_at 空)→ 拒签
- option=1:`target_artifact='proposal.md'` + `target_anchor` 含 `What Changes`
- option=2:tasks.md 中 `task_ref` 末段对应的行已勾选 `[x]`
- option=3:proposal/design YAML 块含对应 entry.id + `non_blocking_rationale` 非空
- option=4:`other_rationale` + `other_acked_by` 非空
```

- [ ] **Step 1.2: 在 §"Fluid Pause Decision Point" 段末尾、"## 禁止行为" 之前插入 §"与其他 sub-plan 合并点"**

```markdown
## 与其他 sub-plan 合并点

本 §"Fluid Pause Decision Point" 段(plan-9c)与后续 sub-plan 在 apply.md 有合并点(参考 master plan §3.3 line 272):

- **9h(SDD 实施前置纪律加固)**:将在步骤 0 加 `forge preflight branch-check` 调用 + 步骤 3.5 加 §"Critical Plan Review";9c 不动这些位置
- **9g(process_evidence)**:将在每个 subagent task 完成后加 `forge evidence record-tdd` helper 调用;9c 不动这些位置
- **推荐 merge 顺序**:9h → 9c → 9g
```

### Step 2: 类型检查 + format + commit

- [ ] **Step 2.1: 跑 format:check 确保 markdown 不被 prettier 改**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm format:check
```

预期:PASS(若 markdown table 格式被 prettier 修则跑 `pnpm format` 修正)。

- [ ] **Step 2.2: typecheck + lint(确保 apply.md 不导致 build 失败)**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm build
```

预期:全 PASS(build 反向同步 commands/apply.md → src/core/templates/commands/apply.md)。

- [ ] **Step 2.3: 提交 Task 3**

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add commands/apply.md src/core/templates/commands/apply.md
git commit -m "$(cat <<'EOF'
feat(9c Task 3): commands/apply.md 加 Fluid Pause Decision Point 段

- 加 §"Fluid Pause Decision Point" 段:触发条件 / 协议流程 / AskUserQuestion
  模板 / marker pause_decisions YAML 字段示例 / fence 校验五分支说明
- 加 §"与其他 sub-plan 合并点" 提示 9h / 9g 协作点 + 推荐 merge 顺序
- src/core/templates/commands/apply.md: pnpm build 反向同步自动生成

沿 design §2.1.2 / §2.1.3 / §2.1.4 / §2.1.5
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 5. Task 4 — `skills/subagent-driven-development/SKILL.md` 加 `DESIGN_ISSUE_FOUND` 第 5 档 + `DONE_WITH_CONCERNS` 修订

**Files**:
- Modify: `skills/subagent-driven-development/SKILL.md:96-113`(Handling Implementer Status 段加第 5 档 + DONE_WITH_CONCERNS 修订)+ 末尾加 forge-specific 反向加固段

### Step 1: 修订 "Handling Implementer Status" 段

- [ ] **Step 1.1: 修改 `skills/subagent-driven-development/SKILL.md:96-113` 整段替换**

```markdown
## Handling Implementer Status

Implementer subagents report one of **five** statuses (forge v1.0 沿 design §2.1.2 加第 5 档 `DESIGN_ISSUE_FOUND`)。Handle each appropriately:

**DONE:** Proceed to spec compliance review.

**DONE_WITH_CONCERNS:** The implementer completed the work but flagged doubts. Read the concerns before proceeding:
- **CRITICAL concerns**(测试 fail / hash mismatch / evidence 丢)→ 走 forge 强 fence 拒签路径(原 v0.4 行为不变)
- **WARNING / SUGGESTION concerns about correctness or scope**(非 CRITICAL)→ **invoke Fluid Pause Decision Point**(沿 `commands/apply.md` §"Fluid Pause Decision Point" 段;主代理调 AskUserQuestion 四选项)
- **Observations**(e.g., "this file is getting large")→ note them and proceed to review

**NEEDS_CONTEXT:** The implementer needs information that wasn't provided. Provide the missing context and re-dispatch.

**BLOCKED:** The implementer cannot complete the task. Assess the blocker:

1. If it's a context problem, provide more context and re-dispatch with the same model
2. If the task requires more reasoning, re-dispatch with a more capable model
3. If the task is too large, break it into smaller pieces
4. If the **plan itself is wrong** → **invoke Fluid Pause Decision Point**(沿 forge v1.0;原 "escalate to human" 现有合规通道,沿 `commands/apply.md` §"Fluid Pause Decision Point" 段)

**`DESIGN_ISSUE_FOUND`**(v1.0 新增第 5 档,沿 forge design §2.1.2):The implementer is reporting that the current task requires functionality that's part of the change but **not covered by the spec**(spec 未覆盖但本 change 应做的需求)。This is **not BLOCKED**(还能干活)和 **not DONE_WITH_CONCERNS**(主体功能没完工就发现 spec 缺口)。Handle by **invoking Fluid Pause Decision Point**(沿 `commands/apply.md` §"Fluid Pause Decision Point" 段;典型走 option=1 扩 scope 或 option=3 转 out-of-scope)。

**Never** ignore an escalation or force the same model to retry without changes. If the implementer said it's stuck or surfaced a design issue, something needs to change.
```

### Step 2: 加 forge-specific 反向加固段(末尾追加)

- [ ] **Step 2.1: 在 SKILL.md 文件末尾(line 268 之后)追加新 §"forge-specific 反向加固"段**

```markdown

## forge-specific 反向加固(v1.0)

forge v1.0 在本 skill 基础上加以下反向加固协议(与上游 superpowers 兼容、不冲突):

### Fluid Pause 不可绕过的不变量

主代理在调 AskUserQuestion 并写入 `pause_decisions` marker 字段时**不可**:

1. **伪造 `severity_acked_by`** — WARNING pause_decision 的 `severity_acked_by` 必须是真实用户响应,且 `.evidence/ack-log.jsonl` 必须有对应 `kind=ack` + `action=ack-pause-warning` + `finding_id=pause_decisions:<id>` + `user=<同 marker>` 条目。若 marker 直填 `severity_acked_by: msc` 但 ack-log.jsonl 无该条目 → `validateAckLogConsistency`(v2 codex BLOCKER 1 扩展)拒签;若 ack-log `user` 与 marker `severity_acked_by` 不一致(如 marker 写 `msc`,ack-log 写 `ai-agent`)→ 拒签。**SUGGESTION 例外**:fence 不要求 ack 一致性(沿 design §2.1.5 SUGGESTION 允许空 ack)

2. **CRITICAL 走 pause 路径** — 主代理判定 severity=CRITICAL 时**禁止**调 AskUserQuestion 让用户在 1-4 间选;CRITICAL 必须走 forge 强 fence 拒签(沿 design §2.1.2)。`forge archive` 步骤 3.7 任一 `pause_decisions[].severity === 'CRITICAL'` → exit 1

3. **option=3 没 `non_blocking_rationale`** — `option=3` 转 out-of-scope 必须配 `non_blocking_rationale` 论证"为什么 subagent 能跳过该 issue 完成主体 task"。fence 拒签缺失

4. **option=2 不勾选新 task** — `option=2` 加 task 时,主代理 append 新 task 到 tasks.md 后 subagent 重派实施;实施完成后**必须**改 `[ ]` → `[x]`。fence 校验 `tasks.md` 中 `task_ref` 末段对应行已勾选

### 红旗清单(借口模式)

| AI 借口 | 反向加固 |
|---|---|
| "用户在对话中确认过,我直接写 ack 就好" | `forge archive` ack-log 一致性 cross-check 会发现 marker ack ↔ ack-log 不一致(沿 plan-9d v2 B-4) |
| "CRITICAL 太严了,我降级为 WARNING 让用户 ack" | fence 在 `severity` 字段重算 finding_hash(沿 plan-9d Task 6),篡改任一 hash payload 字段 → 拒签 |
| "option=3 转 out-of-scope 时 rationale 写"用户决定即可"" | rationale 必须论证"为什么 subagent 能跳过"— 不是"用户决定"是答案 |
```

### Step 3: format + commit

- [ ] **Step 3.1: 跑 format:check + build(SKILL.md 反向同步 src/core/templates/skills/)**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm format && pnpm format:check && pnpm build
```

预期:format PASS,build 反向同步 `src/core/templates/skills/subagent-driven-development.md`(自动加 forge: 前缀)。

- [ ] **Step 3.2: 跑全测试确认 SKILL.md 变更不破坏 templates 测试**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/templates/ tests/smoke.test.ts
```

预期:全 PASS。

- [ ] **Step 3.3: 提交 Task 4**

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add skills/subagent-driven-development/SKILL.md src/core/templates/skills/subagent-driven-development.md
git commit -m "$(cat <<'EOF'
feat(9c Task 4): SDD SKILL.md 加 DESIGN_ISSUE_FOUND 第 5 档 + forge 反向加固

- skills/subagent-driven-development/SKILL.md "Handling Implementer Status" 段
  扩 4 → 5 档:加 DESIGN_ISSUE_FOUND(spec 未覆盖但本 change 应做的需求)
- DONE_WITH_CONCERNS 修订:CRITICAL → forge 强 fence;非 CRITICAL → Fluid Pause
- BLOCKED 第 4 项 "plan wrong" → Fluid Pause(原 "escalate to human" 现有合规通道)
- 加 §"forge-specific 反向加固"段:Fluid Pause 不可绕过 4 不变量 + 红旗清单 3 借口模式
- src/core/templates/skills/subagent-driven-development.md: pnpm build 反向同步

沿 design §2.1.2(第 5 档触发条件) + §2.1.5(marker 反向加固)
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 6. Task 5 — e2e 集成测试 + fixture + 全本地 verify

**Files**:
- Create: `tests/fixtures/pause-decisions/option-1-expand-scope/{proposal.md,tasks.md,.verify-passed,.review-passed,specs/}`
- Create: `tests/fixtures/pause-decisions/option-2-add-task/...`(同结构)
- Create: `tests/fixtures/pause-decisions/option-3-out-of-scope/...`
- Create: `tests/fixtures/pause-decisions/option-4-other/...`
- Create: `tests/fixtures/pause-decisions/critical-redirect-rejected/...`
- Create: `tests/integration/pause-decisions-end-to-end.test.ts`(tmpdir 复制风格)

### Step 1: 创建 fixture 子目录(5 case)

每个 fixture 最小必要文件:`proposal.md` + `tasks.md` + `specs/<area>.md` + `.verify-passed` + `.review-passed`。tmpdir 复制后跑 `forge archive --force` CLI,断言 exit code + stderr。

**v2 codex BLOCKER 3 修订**:
- 所有 fixture 的 `.verify-passed` evidence 字段统一为 `evidence: []`(空数组),避免 `validateEvidence`(`marker-integrity.ts:45`)在 log 文件不存在处先死
- 所有 fixture 的 `.review-passed` `git.is_git_repo: false`,跳过 `validateReviewGitIntegrity`(`marker-integrity.ts:145`)的 diff_hash 重算
- 所有 fixture 走 `forge archive --force`(`--force` 接受非 git 项目跳过 git 字段,沿 archive.ts:376)
- `setupFixture` 函数只算 `tasks_hash` + `content_hash` 写回 marker,**不**算 `log_hash` / `diff_hash` / `git.head`(因为 evidence/git fence 都不跑)
- 这样 fixture 跑 archive 时:hash 校验 → pass / evidence 校验 → ok([] 跳过)/ verify_findings fence → pass(空)/ **pause_decisions fence → 真正命中**(本 Task 测试目标)/ ack-log 校验 → 注:fixture 需创建 `.evidence/ack-log.jsonl` 含对应 ack-pause-warning 条目(v2 BLOCKER 1 ack-log 扩展要求);CRITICAL fixture 不需要 ack-log 条目,因为 fence 在 CRITICAL 先拒签

- [ ] **Step 1.1: 创建 option-1 fixture(扩 scope,fence pass)**

`tests/fixtures/pause-decisions/option-1-expand-scope/proposal.md`:

```markdown
# Proposal: option-1-expand-scope

## Why

Fixture for plan-9c Task 5: option=1 (扩 scope) fence pass case.

## What Changes

- baseline change
- **扩 scope from pause-decision id=1**:加 OAuth refresh token 过期处理(原 spec 未覆盖,sub-agent 报 DESIGN_ISSUE_FOUND 后用户选 option=1)

## Impact

- Affected specs: auth
```

`tests/fixtures/pause-decisions/option-1-expand-scope/tasks.md`:

```markdown
# Tasks

- [x] **task-1** 实施 OAuth login flow
- [x] **task-3** 实施 OAuth refresh token 过期处理(扩 scope after pause-decision id=1)
```

`tests/fixtures/pause-decisions/option-1-expand-scope/specs/auth.md`:

```markdown
# Auth Spec

## Requirements

- OAuth login flow with refresh token
```

`.verify-passed`(v2 codex BLOCKER 3 修订:evidence: [] + setupFixture 算 tasks_hash/content_hash):

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T14:30:00Z
verified_by: ai-agent
tasks_hash: sha256:<setupFixture 算>
content_hash: sha256:<setupFixture 算>
evidence: []
pause_decisions:
  - id: 1
    paused_at: 2026-05-12T14:25:00Z
    task_ref: tasks.md#task-3
    issue_summary: "subagent 发现 spec 缺 OAuth refresh token 过期处理"
    severity: WARNING
    severity_acked_by: msc
    severity_acked_at: 2026-05-12T14:27:00Z
    chosen_option: 1
    target_artifact: proposal.md
    target_anchor: "## What Changes"
    non_blocking_rationale: null
    other_rationale: null
    other_acked_by: null
```

`.evidence/ack-log.jsonl`(v2 BLOCKER 1 要求:WARNING pause_decision 必须有对应 ack 条目):

```jsonl
{"schema":"forge-ack-log/v1","kind":"ack","timestamp":"2026-05-12T14:27:00Z","action":"ack-pause-warning","change_id":"option-1-expand-scope","finding_id":"pause_decisions:1","user":"msc","rationale":"pause ack","git_head":null,"finding_hash":null}
```

`.review-passed`(v2 codex BLOCKER 3 修订:is_git_repo: false 跳过 git diff_hash 校验):

```yaml
schema: forge-review/v1
reviewed_at: 2026-05-12T15:00:00Z
reviewed_by: ai-agent
tasks_hash: sha256:<setupFixture 算>
content_hash: sha256:<setupFixture 算>
git:
  is_git_repo: false
review_outcomes:
  - severity: L
    accepted: false
    resolved: true
    rationale: "no issues"
```

**通用 `.review-passed` 模板**(所有 5 fixture 共用,只 change_id / hash 由 setupFixture 算):

```yaml
schema: forge-review/v1
reviewed_at: 2026-05-12T15:00:00Z
reviewed_by: ai-agent
tasks_hash: sha256:<setupFixture 算>
content_hash: sha256:<setupFixture 算>
git:
  is_git_repo: false
review_outcomes:
  - severity: L
    accepted: false
    resolved: true
    rationale: "no issues"
```

**通用 `.evidence/ack-log.jsonl` 模板**(option-1/2/3/4 fixture 必填,WARNING 需对应 ack 条目;CRITICAL fixture 不需,因为 fence 先在 CRITICAL 拒签):

```jsonl
{"schema":"forge-ack-log/v1","kind":"ack","timestamp":"2026-05-12T14:27:00Z","action":"ack-pause-warning","change_id":"<fixture-name>","finding_id":"pause_decisions:1","user":"msc","rationale":"pause ack","git_head":null,"finding_hash":null}
```

(setupFixture 函数自动把 `<fixture-name>` 替换为目录名)

- [ ] **Step 1.2: 创建 option-2 fixture(加 task,fence pass)**

`tests/fixtures/pause-decisions/option-2-add-task/tasks.md`:

```markdown
# Tasks

- [x] **task-1** baseline task
- [x] **task-2** added after pause-decision id=1(option=2 add task)
```

`.verify-passed`:

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T14:30:00Z
verified_by: ai-agent
tasks_hash: sha256:<setupFixture 算>
content_hash: sha256:<setupFixture 算>
evidence: []
pause_decisions:
  - id: 1
    paused_at: 2026-05-12T14:25:00Z
    task_ref: tasks.md#task-2
    issue_summary: "需要加 logging 子任务"
    severity: WARNING
    severity_acked_by: msc
    severity_acked_at: 2026-05-12T14:27:00Z
    chosen_option: 2
    target_artifact: tasks.md
    target_anchor: "- task-2"
    non_blocking_rationale: null
    other_rationale: null
    other_acked_by: null
```

`proposal.md` / `specs/auth.md` 参考 option-1 最小化;`.review-passed` 用上面通用模板;`.evidence/ack-log.jsonl` 用上面通用模板(change_id=option-2-add-task)。

- [ ] **Step 1.3: 创建 option-3 fixture(转 out-of-scope,fence pass)**

`tests/fixtures/pause-decisions/option-3-out-of-scope/proposal.md`(含 scope-entries YAML 块,沿 9b §2.6.3):

```markdown
# Proposal: option-3-out-of-scope

## Why

Fixture for plan-9c Task 5: option=3 (转 out-of-scope) fence pass case.

## What Changes

- baseline change

## Out of Scope {#forge-oos}

\`\`\`yaml
schema: forge-scope-entries/v1
anchor_id: forge-oos
entries:
  - id: refresh-token-expiry
    category: out-of-scope
    description: "OAuth refresh token 过期处理"
    reason: "非阻塞,subagent 可跳过完成主体 task"
    priority: medium
    status: active
    triggered_by:
      source: pause_decisions
      id: 1
    related_change: null
\`\`\`
```

`tests/fixtures/pause-decisions/option-3-out-of-scope/tasks.md`(v2 codex MAJOR 6 修订:`task_ref` 改用真实任务引用,不再是 scope entry id):

```markdown
# Tasks

- [x] **task-1** baseline task
- [x] **task-3** subagent paused → option=3 转 out-of-scope
```

`.verify-passed`(v2 codex MAJOR 6 修订:task_ref 是 task 引用,scope entry 通过 `triggered_by.id` 反向引用本 pause_decision.id):

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T14:30:00Z
verified_by: ai-agent
tasks_hash: sha256:<setupFixture 算>
content_hash: sha256:<setupFixture 算>
evidence: []
pause_decisions:
  - id: 1
    paused_at: 2026-05-12T14:25:00Z
    task_ref: tasks.md#task-3        # v2: 真实 task 引用,不再是 scope entry id
    issue_summary: "OAuth refresh token 过期处理"
    severity: WARNING
    severity_acked_by: msc
    severity_acked_at: 2026-05-12T14:27:00Z
    chosen_option: 3
    target_artifact: proposal.md
    target_anchor: "## Out of Scope"
    non_blocking_rationale: "subagent 可跳过该 issue 完成本 task 主体功能"
    other_rationale: null
    other_acked_by: null
```

`.review-passed` + `.evidence/ack-log.jsonl` 用通用模板(change_id=option-3-out-of-scope)。

- [ ] **Step 1.4: 创建 option-4 fixture(Other,fence pass)**

`.verify-passed`:

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T14:30:00Z
verified_by: ai-agent
tasks_hash: sha256:<setupFixture 算>
content_hash: sha256:<setupFixture 算>
evidence: []
pause_decisions:
  - id: 1
    paused_at: 2026-05-12T14:25:00Z
    task_ref: tasks.md#custom-flow
    issue_summary: "用户提出自定义方案"
    severity: WARNING
    severity_acked_by: msc
    severity_acked_at: 2026-05-12T14:27:00Z
    chosen_option: 4
    target_artifact: proposal.md
    target_anchor: "## What Changes"
    non_blocking_rationale: null
    other_rationale: "用户决定走自定义方案:实施完后用 PR 描述说明,而非走标准三选项"
    other_acked_by: msc
```

`.review-passed` + `.evidence/ack-log.jsonl` 用通用模板(change_id=option-4-other)。

- [ ] **Step 1.5: 创建 critical-redirect-rejected fixture(CRITICAL,fence reject)**

`.verify-passed`(含 CRITICAL pause_decision,预期 fence 拒签;CRITICAL 在 ack-log cross-check 前就被 Task 2 fence 拒签,故**不**需要 ack-log.jsonl):

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T14:30:00Z
verified_by: ai-agent
tasks_hash: sha256:<setupFixture 算>
content_hash: sha256:<setupFixture 算>
evidence: []
pause_decisions:
  - id: 1
    paused_at: 2026-05-12T14:25:00Z
    task_ref: tasks.md#critical-issue
    issue_summary: "测试 fail 后 subagent 报 CRITICAL"
    severity: CRITICAL          # ← 应被 fence 拒签
    severity_acked_by: msc
    severity_acked_at: 2026-05-12T14:27:00Z
    chosen_option: 3
    target_artifact: proposal.md
    target_anchor: "## Out of Scope"
    non_blocking_rationale: "fixture for critical redirect"
    other_rationale: null
    other_acked_by: null
```

`.review-passed` 用通用模板(change_id=critical-redirect-rejected);**不**创建 `.evidence/ack-log.jsonl`(CRITICAL fence 先拒签,不进 ack-log cross-check)。

### Step 1.6: 创建 release-blocker 攻击路径占位 + script-based gate(v4 codex NEW-BLOCKER A3 + v5 codex BLOCKER 1+2 修订)

**问题**:v3 想用 `it.todo` 作为 9z gate,但 codex 三轮发现 **vitest `it.todo` 默认不导致非零退出** → gate 仍是 reviewer 软约束。v4 改用 **script-based 可执行 gate**;**v5 进一步加固**(沿 codex 四轮 BLOCKER 1+2):
- `scripts/check-release-gate.mjs` regex 改 `/it\s*\.\s*todo\s*\(/g` 兼容 `it . todo (` 空白绕过(v5 BLOCKER 1)
- script 拆 **soft / release 双模式**:soft(默认,9c 用,EXPECTED=2 通过)+ `--release` flag(9z 用,**忽略 EXPECTED 硬约束 actual=0**,不可改值绕过)(v5 BLOCKER 2)
- `package.json` 加 `test:gate` + `test:gate:release` 双 script
- 9c CI 跑 `pnpm test`(含 soft gate);**9z release CI 必须改调 `pnpm test:gate:release`** 才能真正拒签 release

- [ ] **Step 1.6.1: 创建 `tests/integration/release-blocker-attack-path.test.ts`**

```typescript
// release-blocker-attack-path.test.ts — plan-9c Task 5 Step 1.6(v3 codex BLOCKER 3 + v4 NEW-BLOCKER A3)
//
// ★★★ release-blocker 占位测试 ★★★
//
// 本文件含 9c plan §7.5.1 / §7.5.2 已知降级的攻击路径占位 — option=1 / option=2
// 在 9c 完成时**未实现** diff 段级校验,fence 不能拦截以下 attack path。
//
// **9z release plan 实施者**(v6 codex MINOR 修订:统一 v5 soft/release 双模式指引):
// 1. unskip 以下所有 `it.todo`,改为真实跑 attack fixture 并断言 fence 拒签
// 2. **改 9z release CI 配置调 `pnpm test:gate:release`**(release 模式硬约束 actual=0,
//    不读 `EXPECTED_TODO_COUNT_SOFT` — 不可通过改 SOFT 值绕过)
// 3.(可选)同步改 `EXPECTED_TODO_COUNT_SOFT` 让 9c 本地 soft gate 也通过 — 但这不影响 release gate
//
// release 模式判定:`pnpm test:gate:release` 见 actual 非 0 → exit 1 → CI fail → 9z release 拒签
// (沿 9c §7.5.1 / §7.5.2 9z 兜底承诺 + v5 codex BLOCKER 2 双模式)
//
// 9e1 plan 若先于 9z 完成且接入 git diff parser,可直接在 9e1 实施同 attack 路径,
// 本文件相应 unskip + 改 `EXPECTED_TODO_COUNT_SOFT`(可选)。

import { describe, it } from 'vitest';

describe('release-blocker: pause_decisions option=1/2 attack paths (9z gate)', () => {
  it.todo(
    'option=1 attack: marker 写 target_artifact=proposal.md / target_anchor=## What Changes,但实际 git diff 只改了 tasks.md → fence 应拒签(沿 9c §7.5.1 + design §2.1.5 line 262)',
  );

  it.todo(
    'option=2 attack: marker 写 task_ref=tasks.md#task-2 + 该 task 已勾选,但 git log 显示该 task 在 paused_at 之前已存在(非新增) → fence 应拒签(沿 9c §7.5.2 + design §2.1.5 line 263)',
  );
});
```

- [ ] **Step 1.6.2: 创建 `scripts/check-release-gate.mjs`(v5 修订:BLOCKER 1+2 双修)**

```javascript
#!/usr/bin/env node
// scripts/check-release-gate.mjs — plan-9c Task 5 Step 1.6.2
//
// 9z release-blocker gate(两层模式,沿 v5 codex 四轮 BLOCKER 1+2 修订):
//
// **soft 模式**(默认;9c plan 用):actual 与 EXPECTED_TODO_COUNT 比较 — 9c 完成时
//   EXPECTED=2,本地 gate 通过。这只是"reminder gate":9c 完成时已知 release-blocker,
//   不应让 9c CI fail。9c 不能宣称 release enforcement,仅作 reminder。
//
// **release 模式**(--release flag;9z plan 必须用):**硬约束** actual=0,
//   忽略 EXPECTED_TODO_COUNT,任何 it.todo 残留 → exit 1。这是真正的 release gate:
//   9z plan 实施者**不可**通过改 EXPECTED_TODO_COUNT 来绕过 — release 模式根本不读它
//
// v5 codex BLOCKER 1 修订:regex 兼容空白 `it\s*\.\s*todo\s*\(`,覆盖 `it . todo (` 等绕过
// v5 codex BLOCKER 2 修订:soft / release 双模式,release 模式 EXPECTED 不可改值绕过
//
// 集成:`pnpm test` 默认调 soft 模式(`pnpm test:gate`);9z release CI 配置必须调
// `pnpm test:gate:release`(--release flag)。9z plan 实施清单显式列接入 release CI。

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, '../tests/integration/release-blocker-attack-path.test.ts');

// **soft 模式** EXPECTED:9c=2(已知 release-blocker);9z plan 实施者**不需要**改这里,
//                       9z plan 应改 release CI 配置调 --release flag
// **release 模式**(--release flag):忽略 EXPECTED,强制 actual=0
const EXPECTED_TODO_COUNT_SOFT = 2;
const isRelease = process.argv.includes('--release');

// v6 codex NIT 修订:readFileSync 加 try/catch,文件不存在(中间状态)给清晰错误而非 stack trace
let content: string;
try {
  content = readFileSync(FILE, 'utf8');
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    console.error(
      `[release-gate] FAIL: 找不到 ${FILE}\n` +
        `如果你在 plan-9c 实施中间状态,先完成 Task 5 Step 1.6.1 创建 release-blocker-attack-path.test.ts。\n` +
        `如果你在 9z 实施中误删此文件,9z release gate 失效 — 必须恢复或重建。`,
    );
    process.exit(1);
  }
  throw err;
}
// v5 BLOCKER 1:regex 兼容空白,覆盖 `it . todo (` / `it.todo (` 等绕过形式
const matches = content.match(/it\s*\.\s*todo\s*\(/g) ?? [];
const actual = matches.length;

if (isRelease) {
  // release 模式硬约束:必须 actual = 0(9z 实施时全部 unskip)
  if (actual !== 0) {
    console.error(
      `[release-gate:release] FAIL: ${FILE} 含 ${actual} 个 it.todo,release 模式硬约束 actual=0\n` +
        `9z plan 实施者:必须 unskip 所有 it.todo(改为真 it() 跑 attack fixture)。\n` +
        `release 模式忽略 EXPECTED_TODO_COUNT_SOFT — 不可通过改 expected 值绕过。`,
    );
    process.exit(1);
  }
  console.log(`[release-gate:release] PASS: 0 it.todo (release gate enforced)`);
  process.exit(0);
}

// soft 模式:actual 与 EXPECTED 比较(9c 完成时 EXPECTED=2 通过)
if (actual !== EXPECTED_TODO_COUNT_SOFT) {
  console.error(
    `[release-gate:soft] FAIL: ${FILE} 含 ${actual} 个 it.todo,soft 期望 ${EXPECTED_TODO_COUNT_SOFT}\n` +
      `如果 9z plan 在 unskip,请同时改 EXPECTED_TODO_COUNT_SOFT 与 unskip 数量保持一致,\n` +
      `或者用 \`pnpm test:gate:release\` 跑 release 模式(release 模式不读 SOFT 值,硬约束 actual=0)。`,
  );
  process.exit(1);
}

console.log(
  `[release-gate:soft] PASS: ${actual} it.todo(s) = expected ${EXPECTED_TODO_COUNT_SOFT} (reminder only, NOT release enforcement)`,
);
```

- [ ] **Step 1.6.3: 修改 `package.json` 加 test:gate / test:gate:release scripts + test 后置 hook**

修改 `package.json:scripts`(在现有 `test` 后):

```json
{
  "scripts": {
    "test": "vitest run && pnpm test:gate",
    "test:gate": "node scripts/check-release-gate.mjs",
    "test:gate:release": "node scripts/check-release-gate.mjs --release"
  }
}
```

**实施注意**(v5 codex MINOR 2:加 Step 顺序 guard):
- **Step 1.6.2 必须先完成且 script 可执行,再做 Step 1.6.3** — 否则改 `test` hook 后任何 `pnpm test` 会因 script 缺失 fail
- 验证 Step 1.6.2 完成:`node scripts/check-release-gate.mjs` 应输出 soft 模式结果
- 实施者反序操作(先改 package.json 再创 script)→ 反向恢复:`git checkout package.json` 撤销 hook 改动,补完 script 后重做
- `pnpm test` 现含 vitest + soft gate 两步;CI 跑 `pnpm test` 时自动跑 soft gate
- **9z release CI 配置必须改成跑 `pnpm test:gate:release`**(不是 `pnpm test`)— release 模式硬约束 actual=0
- 单独跑 vitest(不含 gate)用 `pnpm vitest run` 显式
- 现有 plan-9d/9b/9a 测试因 `pnpm test` 仍跑 vitest 全套,本地 / PR CI 行为兼容(待实施时跑全套确认)

- [ ] **Step 1.6.4: 跑 `pnpm test:gate` 确认 9c 完成时 soft 模式 PASS**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test:gate
```

预期:**`[release-gate:soft] PASS: 2 it.todo(s) = expected 2 (reminder only, NOT release enforcement)`**,exit 0。

跑 release 模式自测:

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test:gate:release
```

预期:**`[release-gate:release] FAIL: ... 含 2 个 it.todo,release 模式硬约束 actual=0`**,exit 1(因为 9c 完成时仍含 2 个 todo)。这证明 release gate 在 9z 实施前确实拒签;9z plan unskip 全部 todo 后,本命令应 PASS。

**9z plan 实施者注意**(v5 codex BLOCKER 2):**不可**通过改 `EXPECTED_TODO_COUNT_SOFT` 来绕过 release gate — release 模式根本不读 SOFT 值,必须真 unskip 全部 todo 才能 PASS。9z plan 实施清单第一项:**改 CI 配置调 `pnpm test:gate:release` 代替 `pnpm test`**(或者两者都跑)。

### Step 2: 创建 e2e 集成测试

- [ ] **Step 2.1: 创建 `tests/integration/pause-decisions-end-to-end.test.ts`**

```typescript
// pause-decisions-end-to-end.test.ts — plan-9c Task 5 e2e 集成测试
// 沿 9d Task 8 verify-findings-end-to-end.test.ts 同模式
// tmpdir 复制 fixture → 算实际 hash 改 marker → 跑 forge archive → 断言 exit code + stderr

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { computeTasksHash, computeContentHash } from '../../src/core/hash/index.js';

const FIXTURES_DIR = resolve(__dirname, '../fixtures/pause-decisions');
const FORGE_CLI = resolve(__dirname, '../../dist/cli/index.js');

// Helper:复制 fixture 到 tmpdir,算 tasks_hash/content_hash,改 marker + ack-log
// v2 codex BLOCKER 3 修订:不再 git init/commit/算 diff_hash;marker 用 is_git_repo:false + --force 跳过 git fence
// v2 codex BLOCKER 1 修订:替换 ack-log.jsonl 中 <fixture-name> 占位为真实 fixtureName,
//                          让 ack-log cross-check 找到匹配 change_id 的 ack-pause-warning 条目
async function setupFixture(fixtureName: string): Promise<{ tmpRoot: string; changeId: string }> {
  const tmpRoot = mkdtempSync(join(tmpdir(), `forge-9c-${fixtureName}-`));
  const changeId = fixtureName;
  const changeDir = join(tmpRoot, 'forge', 'changes', changeId);

  // 复制 fixture → changeDir(含 .evidence/ 子目录,如果 fixture 包含)
  cpSync(join(FIXTURES_DIR, fixtureName), changeDir, { recursive: true });

  // 算 tasks_hash / content_hash(no git;沿 9d 同 helper,不依赖 git)
  const tasksContent = readFileSync(join(changeDir, 'tasks.md'), 'utf8');
  const tasksHash = computeTasksHash(tasksContent);
  const contentHash = await computeContentHash(changeDir);

  // 改 .verify-passed / .review-passed 的 hash 字段
  for (const markerName of ['.verify-passed', '.review-passed']) {
    const markerPath = join(changeDir, markerName);
    if (!existsSync(markerPath)) continue;
    const marker = parseYaml(readFileSync(markerPath, 'utf8')) as Record<string, unknown>;
    marker.tasks_hash = tasksHash;
    marker.content_hash = contentHash;
    // is_git_repo:false 已在 fixture YAML 静态写好,这里不改 git 字段
    writeFileSync(markerPath, stringifyYaml(marker));
  }

  // v2 BLOCKER 1:替换 ack-log.jsonl 中 <fixture-name> 占位
  const ackLogPath = join(changeDir, '.evidence', 'ack-log.jsonl');
  if (existsSync(ackLogPath)) {
    const ackContent = readFileSync(ackLogPath, 'utf8').replace(/<fixture-name>/g, fixtureName);
    writeFileSync(ackLogPath, ackContent);
  }

  return { tmpRoot, changeId };
}

// Helper:跑 forge archive,返回 exit code + stderr
function runArchive(tmpRoot: string, changeId: string): { code: number; stderr: string } {
  const res = spawnSync('node', [FORGE_CLI, 'archive', changeId, '--force'], {
    cwd: tmpRoot,
    encoding: 'utf8',
  });
  return { code: res.status ?? -1, stderr: res.stderr };
}

describe('pause_decisions e2e fence', () => {
  let cleanupDirs: string[] = [];

  afterAll(() => {
    for (const d of cleanupDirs) rmSync(d, { recursive: true, force: true });
  });

  it('option-1-expand-scope → archive 成功(exit 0)', async () => {
    const { tmpRoot, changeId } = await setupFixture('option-1-expand-scope');
    cleanupDirs.push(tmpRoot);
    const { code } = runArchive(tmpRoot, changeId);
    expect(code).toBe(0);
  });

  it('option-2-add-task → archive 成功(exit 0)', async () => {
    const { tmpRoot, changeId } = await setupFixture('option-2-add-task');
    cleanupDirs.push(tmpRoot);
    const { code } = runArchive(tmpRoot, changeId);
    expect(code).toBe(0);
  });

  it('option-3-out-of-scope → archive 成功(exit 0)', async () => {
    const { tmpRoot, changeId } = await setupFixture('option-3-out-of-scope');
    cleanupDirs.push(tmpRoot);
    const { code } = runArchive(tmpRoot, changeId);
    expect(code).toBe(0);
  });

  it('option-4-other → archive 成功(exit 0)', async () => {
    const { tmpRoot, changeId } = await setupFixture('option-4-other');
    cleanupDirs.push(tmpRoot);
    const { code } = runArchive(tmpRoot, changeId);
    expect(code).toBe(0);
  });

  it('critical-redirect-rejected → archive 拒签(exit 1)+ stderr 含 "CRITICAL"', async () => {
    const { tmpRoot, changeId } = await setupFixture('critical-redirect-rejected');
    cleanupDirs.push(tmpRoot);
    const { code, stderr } = runArchive(tmpRoot, changeId);
    expect(code).toBe(1);
    expect(stderr).toMatch(/CRITICAL/);
    expect(stderr).toMatch(/pause_decisions fence 拒签/);
  });
});
```

### Step 3: 跑 e2e + 全本地 verify + commit

- [ ] **Step 3.1: 跑 e2e 集成测试**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm build && pnpm test tests/integration/pause-decisions-end-to-end.test.ts
```

预期:**5 tests PASS**(option-1/2/3/4 exit 0;critical-redirect-rejected exit 1)。

- [ ] **Step 3.2: 跑全本地 verify(typecheck + lint + format:check + build + test)**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
```

预期:**全 PASS**(沿 9d Task 8 同模式;若 vitest 提示新增 fixture 但 build 没复制 dist,改 `vitest.config.ts` 或保持现状 — 因为 e2e 通过 cwd 直接读 fixtures/ 源目录,不依赖 dist)。

- [ ] **Step 3.3: 提交 Task 5**

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add tests/fixtures/pause-decisions/ tests/integration/pause-decisions-end-to-end.test.ts
git commit -m "$(cat <<'EOF'
feat(9c Task 5): e2e 集成测试 + 5 fixture + 全本地 verify PASS

- tests/fixtures/pause-decisions/{option-1-expand-scope,option-2-add-task,
  option-3-out-of-scope,option-4-other,critical-redirect-rejected}/
  含 proposal.md / tasks.md / specs/ / .verify-passed / .review-passed
- tests/integration/pause-decisions-end-to-end.test.ts: tmpdir 复制风格
  (沿 plan-9d Task 8) + setupFixture 算 tasks_hash/content_hash + 跑 forge archive --force
- 5 cases: 4 options PASS exit 0,critical-redirect REJECT exit 1
- 全本地 verify(typecheck + lint + format:check + build + test)PASS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 7. Self-Review Checklist

任务全部完成后,逐项核对(若任一未达 → 回退到对应 Task 修订):

### 7.1 Spec 覆盖

- [ ] design §2.1.2 触发条件三档(DONE_WITH_CONCERNS / BLOCKED-plan-wrong / DESIGN_ISSUE_FOUND)全部映射到 SDD SKILL.md 第 5 档(Task 4)
- [ ] design §2.1.3 协议流程(CRITICAL 重定向 + AskUserQuestion 四选项 + marker 写入)在 commands/apply.md §"Fluid Pause Decision Point" 段表达(Task 3)
- [ ] design §2.1.4 AskUserQuestion 模板在 apply.md 复制(Task 3)
- [ ] design §2.1.5 marker 字段全部 13 字段在 PauseDecision interface(Task 1)+ 校验规则全部 5 类业务在 pause-decisions-fence.ts(Task 2)
- [ ] design §2.1.6 v0.4 兼容性(`pause_decisions` 缺失等价空,老 marker 仍合法)在 schema 校验(Task 1 superset additive)+ fence(Task 2 `if (!Array.isArray(decisions)) return ok()`)实现
- [ ] design §2.1.7 实施清单 5 项全部覆盖:
  - [x] commands/apply.md(Task 3)
  - [x] skills/subagent-driven-development/SKILL.md DESIGN_ISSUE_FOUND 第 5 档(Task 4)
  - [x] src/core/schemas / marker schema 加 pause_decisions(Task 1)
  - [x] src/cli/commands/archive.ts fence(Task 2)
  - [x] tests/cli/archive-pause-fence.test.ts(Task 2)+ e2e(Task 5)

### 7.2 Placeholder 扫描

- [ ] 所有 `<TBD>` / `TODO` / "implement later" / "add appropriate error handling" 已替换为具体代码或测试
- [ ] 所有 hash 字段 `sha256:<setupFixture 算>` 在 e2e fixture 中有 setupFixture helper(Task 5 重写后只算 `tasks_hash` / `content_hash`,跳过 `log_hash` / `diff_hash` / `git.head` — 沿 v2 BLOCKER 3 修订)— **此 placeholder 在 plan 文档中保留,因为真实 hash 必须 fixture build 时算**

### 7.3 类型一致性

- [ ] `PauseDecision.severity` 用 `Severity`(9a)而非 string,与 VerifyFinding 一致
- [ ] `PauseDecision.chosen_option` 用 `ChosenOption = 1 | 2 | 3 | 4` 而非 `number`
- [ ] `validatePauseDecisionsFence` 签名一致:Task 1 schema(类型校验)/ Task 2 fence(业务校验)→ archive.ts(Task 2 集成调用点)使用 `await validatePauseDecisionsFence(verifyRec, changeDir, verifyPath)`
- [ ] 老 marker 兼容路径在三处一致:`checkPauseDecisionsArray`(Task 1 schema)/ `validatePauseDecisionsFence`(Task 2 fence)/ e2e fixture(Task 5 选择不提供 pause_decisions 的 marker 不做 fence 路径覆盖,只测 5 cases)
- [ ] fence 错误消息含 `field=pause_decisions[i].<字段>` 格式,与 9d verify-findings-fence.ts 一致

### 7.4 反向加固自检(沿 9d Task 6 v2 B-4 同模式)

- [ ] Task 2 option=3 走 9b `parseFencedYamlBlocks`(v2 codex MAJOR 7 修订)+ `triggered_by.source='pause_decisions' AND triggered_by.id=<pause.id>` 反向查找(v2 codex MAJOR 6)— 不再自写 YAML parser,不再用 task_ref 当 scope entry id
- [ ] Task 4 SDD SKILL.md 加 §"forge-specific 反向加固"段含 4 不变量 + 3 借口模式(沿 9d SKILL.md 同模式)
- [ ] e2e fixture 含 critical-redirect-rejected case(Task 5)证明 CRITICAL 不可通过 ack 绕过

### 7.5 已知降级(v2 codex BLOCKER 2 + MAJOR 5 修订:加 9z release 兜底承诺;v5 codex MAJOR 1+3 加 option=3 局部子集说明)

#### 7.5.0 option=3 局部段校验 vs 全 artifact validateScopeEntries(v5 codex MAJOR 1+3 修订)

- **现状**(v4 NEW-MAJOR B4 修订后 + v5 MAJOR 1+3 补完):option=3 fence 改用 `parseMarkdown` 找 target_anchor 对应 section,**只在该段内**跑 schema 子集校验。v5 补齐 `id` / `description` / `reason` 字段对齐 9b `validateScopeEntries` 完整不变量(`scope-entries.ts:120-128`)。
- **范围**(v5 后):fence 现校验匹配 entry 的 `id`(非空)+ `description`(非空)+ `reason`(非空必填论证,沿 design §2.6.3)+ `category`(与 anchor 默认映射一致)+ `status`(合法枚举)。
- **trade-off**(v5 显式声明):fence 现已**完整覆盖匹配 entry 的所有 9b 关键字段**;但是 fence 仅校验 triggered_by 匹配本 pause 的那条 entry,**不**校验该段其他 entry(因为它们可能 trigger from 其他 pause 或 explore 等,非本 pause 应管的范围)。这种"只校验本 pause 关联 entry"的限定**避免了**同段其他坏 entry 误拦本 pause(沿 v4 B4 解决"误拦其他段"原意),也对齐"反向加固防 propose 后篡改"的根因(只防篡改与本 pause 关联的 entry)。
- **结论**:option=3 反向加固在 v5 已**完整闭环 within scope**;未关联本 pause 的 entry 仍由 propose 阶段的 `validateScopeEntries`(整文件)负责。
- **v6 codex B1 NIT 修订:exactly one 语义假设**:v6 MAJOR B2 后,fence 对"多条 entry triggered_by 引用同一 pause id"直接拒签。这是基于 design "一对一"语义假设(一个 pause_decision 应对应一条 scope entry)。**已知限制**:若未来 design 允许"一个 pause 转出多条 scope entry"(例如 pause 触发"refresh token + access token expiry"两个 scope 项),需修订 fence 改回"全部校验"或加显式 design 字段(如 `pause_decision.expected_entry_count`)。**v1.0 视为强约束**(沿 codex 五轮建议),v1.1+ 再考虑放宽。



#### 7.5.1 option=1 fence 不校验 git diff 真实内容(BLOCKER 2)

- **现状**:design §2.1.5 line 262 写"`chosen_option = 1`:proposal.md 必须有对应修改(diff 内含 `## What Changes` 段变更)"。Task 2 fence 当前**只校验 marker 字段一致性**(target_artifact='proposal.md' + target_anchor 含 'What Changes' 文本),**未**用 git diff 解析校验"实际 diff 内有 ## What Changes 段变更"。
- **攻击场景**:AI 主代理在 marker 写 `target_artifact='proposal.md'` + `target_anchor='## What Changes'` 但实际只改了 tasks.md → 当前 fence 不能拦
- **原因**:option=1 进一步"diff 内含 What Changes 段"解析需独立 git diff parser(archive 阶段已有 review marker `git.diff_hash` 重算比对,整体 git 完整性已被 fence,但段级解析未实现)
- **补完位置**:**9e1**(archive_summary 集成阶段)— archive_summary `handoff_to_backlog` 第 3 类入参聚合时会一并接入 git diff parser;此时 option=1 校验可复用同 parser
- **9z release 兜底承诺**(v2 codex BLOCKER 2 修订):**如果 9e1 plan 进入实施前仍未补 diff parser,必须在 9z release 前补完 option=1 段级校验**;9z release 前实施者跑 `pnpm test -t pause-decision option=1` 确认 fence 真实拦截"marker 写 proposal 实际改 tasks"攻击路径。本 plan §"未来必补"段在 9z plan 中显式列出
- **本 plan 边界声明**:Task 2 fence 代码注释中标 "TODO(9e1 or 9z release):option=1 加 git diff 段级校验"

#### 7.5.2 option=2 fence 不校验"新增 task"语义(MAJOR 5)

- **现状**:design §2.1.5 line 263 写"`chosen_option = 2`:tasks.md 必须有**新增** task,且该 task 已勾选(`[x]`)"。Task 2 fence 当前**只**grep `task_ref` 末段对应的行存在且勾选 `[x]`,**未**校验"该 task 是 pause 后新增"(可能复用 paused_at 之前已存在的旧任务)
- **攻击场景**:AI 主代理 pause 后不真新增 task,而是把已勾选的旧 task 的 ref 写进 pause_decision.task_ref → 当前 fence 通过
- **原因**:校验"新增"需 git log 比对 tasks.md 在 `paused_at` 时刻前后的差异 — 需 git diff/log 解析
- **补完位置**:同 7.5.1 — 9e1 接入 git diff parser 后,option=2 校验 tasks.md diff 中 `- [x] **<taskKey>**` 行首现于 paused_at 之后
- **9z release 兜底承诺**:同 7.5.1
- **本 plan 边界声明**:Task 2 fence 代码注释中标 "TODO(9e1 or 9z release):option=2 加 git log 新增 task 校验"

### 7.6 codex 对抗性 review v2 一轮修订记录

本 plan v2 沿 codex 对抗性 review 一轮 12 议题(3 BLOCKER + 5 MAJOR + 3 MINOR + 1 NIT)全采纳。修订汇总:

| 编号 | 级别 | 议题 | 修订位置 | 处理 |
|---|---|---|---|---|
| 1 | BLOCKER | `pause_decisions` ack 可被伪造(`validateAckLogConsistency` 不读 pause_decisions) | Task 2 Step 3.5 新增子任务 + ack-log-consistency.ts 扩展 + tests/cli/ack-log-pause-decisions.test.ts 6 case | 全采纳实施 |
| 2 | BLOCKER | option=1 diff 段级校验未实现 + 9e1 plan 未展开 | §7.5.1 加 9z release 兜底承诺 + Task 2 fence 代码 TODO 注释 | 部分采纳:维持 9c 不实施,加 9z 兜底 |
| 3 | BLOCKER | e2e fixture 跑不到 pause fence(evidence/git fence 先死) | §6 fixture 改 evidence: [] + is_git_repo: false + --force + setupFixture 重写 + ack-log.jsonl 通用模板 | 全采纳 |
| 4 | MAJOR | review-passed 业务 fence 缺失 | Task 2 Step 3.2 改对 verifyRec + reviewRec 都跑 fence | 全采纳 |
| 5 | MAJOR | option=2 没校验"新增 task" | §7.5.2 同 BLOCKER 2 加 9z release 兜底 | 部分采纳 |
| 6 | MAJOR | option=3 把 task_ref 当 scope entry id | Task 2 fence `checkOption3ScopeEntry` 改用 `triggered_by.source='pause_decisions' AND triggered_by.id=<pause.id>` 反向查找 + fixture option-3 task_ref 改用真实 task 引用 | 全采纳 |
| 7 | MAJOR | option=3 自写 YAML parser 不复用 9b | Task 2 fence 用 `parseFencedYamlBlocks`(9b)+ YAML parse 失败抛错而非静默 continue | 全采纳 |
| 8 | MAJOR | bash heredoc 在 PowerShell 不兼容 | plan 顶部加 §"Shell 假设"段 | 全采纳 |
| 9 | MINOR | Task 1 红灯数 13 → 12,baseline 9 fail / 3 pass | Task 1 Step 1.2 + Step 4.1 期望文字修订 | 全采纳 |
| 10 | MINOR | `severity_acked_by` 类型 `string \| null` vs 9a `string?` 分歧 | 保留 `string \| null`(沿 design YAML 字面);加 design note 解释差异 | 部分采纳(保留差异 + 加文档说明) |
| 11 | MINOR | 9h/9g 合并漂移声明证据不足 | §0 加"9c → 9h merge rebase 指引"提示 | 部分采纳 |
| 12 | NIT | P50 2.8 估算偏乐观 | P50 2.8 → 3.3,P90 3.6 → 4.2 | 全采纳 |

**未实施的 spec 完整性**:BLOCKER 2 + MAJOR 5(option=1/2 diff 段级校验)— v3 codex BLOCKER 3 修订加 `tests/integration/release-blocker-attack-path.test.ts` 含 2 个 `it.todo` 作为可执行 gate。9z plan 实施前 `pnpm test --reporter=verbose` 输出 todo 计数必须 = 0,否则 9z release 拒签。

### 7.7 codex 对抗性 review v3 二轮修订记录

本 plan v3 沿 codex 二轮 review 12 议题(3 BLOCKER + 4 MAJOR + 3 MINOR + 2 NIT)全采纳。

**已完全解决的 v1 议题**:9(红灯数)、11(rebase 指引)、archive Step 4 路径(B-2 核实);v1 议题 1/2/3/4/5/6/7/8 在 v2 部分解决后,v3 二轮发现 gap 并补完。

| 编号 | 级别 | 议题 | 修订位置 | 处理 |
|---|---|---|---|---|
| 1 | BLOCKER | ack-log 扩展草稿在 pause-only marker 上会崩(`findings.length` undefined → TypeError) | Task 2 Step 3.5.1(findings/pauseDecisions normalize 数组)+ Step 3.5.1b(baseline line 101 for 循环改用 normalize 变量) | 全采纳 |
| 2 | BLOCKER | review-passed pause_decisions ack 仍可伪造(ack-log 只对 verifyRec 跑) | Task 2 Step 3.2 archive.ts 步骤 3.8 改对 verifyRec + reviewRec 都跑 `validateAckLogConsistency` | 全采纳 |
| 3 | BLOCKER | option=1 段级 diff 校验仍非硬约束(9z 文字承诺无可执行 gate) | Task 5 Step 1.6 新增 `tests/integration/release-blocker-attack-path.test.ts` 含 2 个 `it.todo`(option=1 attack + option=2 attack)+ 9z gate 说明 | 部分采纳(维持 9c 不实施 diff parser,加 it.todo 占位 + 9z reviewer 强制 unskip) |
| 4 | MAJOR | option=2 行匹配 `line.includes(taskKey)` 可被绕(issue_summary 含 taskKey 字符串误匹配) | Task 2 `checkOption2TaskChecked` 改用精确 regex `^\s*-\s*\[[ x]\]\s*(?:\*\*<taskKey>\*\*|<taskKey>)\b` + 转义 | 全采纳 |
| 5 | MAJOR | option=3 单测负例 helper `triggered_by.id` 硬编码 1,新 fence 仍匹配 → 假通过 | `buildProposalWithScopeEntry` helper 加 `triggeredById: number = 1` 参数;负例 case 传 999;断言改为匹配新 fence 错误消息 | 全采纳 |
| 6 | MAJOR | option=3 fence 只复用 `parseFencedYamlBlocks`,没复用 `validateScopeEntries` | `checkOption3ScopeEntry` 加调 `validateScopeEntries(content, file, ctx)`;fence 主签名加 `ctx: { contentHash, gitHead }` 可选参数(单测默认占位,archive.ts 传真实值);archive.ts 调用前算 `contentHashNow` + 从 review marker 取 `git.head`(**v4 / v5 历史记录**:**v3 加 ctx 在 v4 中段 revert** — 因 v4 NEW-MAJOR B4 改 fence 不再调 validateScopeEntries → ctx unused → YAGNI 移除;v5 fence 局部校验补齐 9b 字段子集,**当前签名 `(marker, changeDir, file?)`**,见 §7.3 类型一致性检查) | 全采纳 |
| 7 | MAJOR(新) | option=3 fence 未限制 `target_artifact` / `target_anchor` 白名单 | `checkOption3ScopeEntry` 入口加 `target_artifact ∈ {'proposal.md', 'design.md'}` + `target_anchor ∈ {'## Out of Scope', '## Future Work'}` 白名单 | 全采纳 |
| 8 | MINOR | `triggered_by.id === p.id` 严格比较类型漂移(string '1' vs number 1) | `checkOption3ScopeEntry` 用 `String(triggered_by.id) === String(p.id)` normalize 比较 | 全采纳 |
| 9 | MINOR | Shell 假设表述"Claude Code Bash tool 走 bash"与 system prompt "Shell: PowerShell" 冲突 | plan 顶部 §"Shell 假设"段重写:声明实施者必须先确认当前 shell;PowerShell 用 here-string `@'...'@`,bash 用 heredoc | 全采纳 |
| 10 | MINOR | e2e 受 BLOCKER 1 阻断 | BLOCKER 1 修后自动解决 | 自动解决 |
| 11 | NIT | 注释"必填 7 字段"实际枚举 8 个 | `checkPauseDecisionsArray` 内注释 7 → 8 | 全采纳 |
| 12 | NIT | Task 2 P50 1.5 / 总 P50 3.3 仍偏乐观 | Task 2 1.5 → 1.9d,Task 5 0.4 → 0.5d,总 P50 3.3 → 3.7d,P90 4.2 → 4.6d | 全采纳 |

**v3 后剩余的已知降级**:option=1 / option=2 diff 段级校验仍未在 9c 实施 — v4 codex NEW-BLOCKER A3 修订后,**通过 script-based gate(`scripts/check-release-gate.mjs`)成机器化 enforcement**:`pnpm test` 后置调用 gate;9z plan 实施者必须**同时** unskip 全部 it.todo + 修改 EXPECTED_TODO_COUNT=0,任一未做 → CI fail → 9z release 拒签。

### 7.8 codex 对抗性 review v4 三轮修订记录

本 plan v4 沿 codex 三轮 review 5 议题(1 NEW-BLOCKER + 3 NEW-MAJOR + 1 MINOR + 工日重估)全采纳。

**v3 议题回归状态**(已确认完全解决,无回归):
- v2/v3 议题 1(ack-log baseline 循环):**已解决** — Step 3.5.1 + 3.5.1b 完整覆盖
- v2/v3 议题 2(reviewRec ack-log):**已解决** — archive.ts 步骤 3.8 对两个 marker 都跑;exit immediately 不会双报
- v2/v3 议题 5(单测负例 triggered_by.id):**已解决** — buildProposalWithScopeEntry 接受 triggeredById 参数
- v2/v3 议题 8 / 9 / 11:**已解决** — String() normalize / shell 表述 / 8 字段

**v3 议题 3 / 4 / 6 / 7 / B4 在 v3 部分解决后,v4 三轮发现 gap 并补完**:

| 编号 | 级别 | 议题 | 修订位置 | 处理 |
|---|---|---|---|---|
| A3 | NEW-BLOCKER | v3 `it.todo` 在 vitest 默认不导致非零退出 → 9z gate 仍是 reviewer 软约束 | Task 5 Step 1.6.2 新增 `scripts/check-release-gate.mjs`(grep 计数 + EXPECTED 比对)+ Step 1.6.3 `package.json` 加 `test:gate` script + `test` 后置 hook | 全采纳 |
| A4 | NEW-MAJOR | option=2 regex `\b` 在 `task-2-extra` 中仍 word boundary → false positive(v3 议题 4 实际未解决) | `checkOption2TaskChecked` regex 改用 negative lookahead `(?![\w-])`:`task-2(?![\w-])` 拒 `task-2-extra` | 全采纳 |
| A6 | NEW-MAJOR | fence ctx 可省略 + 默认占位 → archive.ts 忘传时反向加固弱化 | **v4 中段 revert**:NEW-MAJOR B4 改用 `parseMarkdown` 局部段校验后,fence 内部不再调 `validateScopeEntries` → ctx 不再需要 → 沿 YAGNI 移除 ctx 参数;fence 主签名回归 `(marker, changeDir, file?)`,attack 路径(ctx 错绑)在 B4 修订后**自动消失** | 通过 B4 自动解决 |
| B4 | NEW-MAJOR | option=3 fence 跑整 artifact `validateScopeEntries` → 同文件其他段坏 YAML 误拦本 pause | `checkOption3ScopeEntry` 改用 `parseMarkdown` 找 target_anchor 对应 section,只在该段内跑 schema 子集校验(schema / anchor_id / entries / category / status);不调 9b 整文件 validateScopeEntries | 全采纳 |
| B5 | MINOR | §1 File Structure 漏列 `tests/integration/release-blocker-attack-path.test.ts` | §1 新增文件列表补 release-blocker-attack-path.test.ts + scripts/check-release-gate.mjs;修改文件列表补 ack-log-consistency.ts + package.json | 全采纳 |
| C1/C4 | NIT | Task 2 1.9 / 总 P50 3.7 仍偏乐观 | Task 2 1.9 → 2.2d;总 P50 3.7 → 4.0d;P90 4.6 → 5.0d | 全采纳 |

**v4 设计升级**:
- BLOCKER A3:script-based gate 替代 vitest todo 计数,机器可执行;9c 完成时 EXPECTED=2 通过,9z 必须同步改 EXPECTED 与 unskip todo,任一不一致 fail
- NEW-MAJOR A6:**通过 B4 自动解决** — B4 改 fence 内部不调 validateScopeEntries → ctx 不再需要 → 沿 YAGNI revert ctx 参数,fence 主签名回归 `(marker, changeDir, file?)`(避免引入 unused 必填参数)
- NEW-MAJOR B4:fence option=3 校验范围**收窄到 target_anchor 对应段**,避免同文件其他段坏 YAML 误拦;**只在本段内**做 schema 子集校验(schema/anchor_id/entries/category/status)+ triggered_by 反向查找

**v4 后剩余 known gap**:option=1 / option=2 diff 段级校验仍非 9c 实施范围,但通过 script-based gate 升级为 9z release 机器化拒签约束。可视为 v4 已"最大化在 9c 范围内反向加固";真实 attack-path 测试 + diff parser 留给 9z(或 9e1 如先于 9z 完成)。

### 7.9 codex 对抗性 review v5 四轮修订记录

本 plan v5 沿 codex 四轮 review 10 议题(2 BLOCKER + 3 MAJOR + 3 MINOR + 2 NIT)全采纳。

**v4 议题回归状态**(已确认完全解决,无回归):
- v3 议题 5 / 7 / 8(File Structure / ctx revert / 工日)

**v4 留下 + codex 四轮新发现议题修订**:

| 编号 | 级别 | 议题 | 修订位置 | 处理 |
|---|---|---|---|---|
| 1 | BLOCKER | release gate regex `/it\.todo\(/g` 可被 `it.todo (` 空格绕过 | `scripts/check-release-gate.mjs` regex 改 `/it\s*\.\s*todo\s*\(/g`,覆盖 `it . todo (` / `it.todo (` 等任意空白形式 | 全采纳 |
| 2 | BLOCKER | `EXPECTED_TODO_COUNT` 同文件硬编码可被实施者改值绕过 | script 拆 **soft / release 双模式**:soft 模式(9c 用,EXPECTED=2 通过)+ `--release` flag 模式(9z 用,**忽略 EXPECTED 硬约束 actual=0**,不可改值绕过);`package.json` 加 `test:gate:release` script;9z plan 必须改 CI 调 `pnpm test:gate:release` | 全采纳 |
| 3 | MAJOR | option=3 局部 schema 漏 `id`/`description`/`reason` 字段(9b validateScopeEntries 要求 reason 非空) | `checkOption3ScopeEntry` 内 triggered_by 匹配后**补完字段校验**:`id`/`description`/`reason`(非空)+ `category`(与 anchor 默认映射一致)+ `status`(合法枚举),对齐 9b `scope-entries.ts:120-128` | 全采纳 |
| 4 | MAJOR | option=2 regex 无 `/u` flag,中文 task key `任务-3补充` 中 `补` 非 `\w` 非 `-` → lookahead 通过 → false positive | regex 改用 Unicode property `\p{L}\p{N}_-` + `/u` flag → 正确拒绝任意 Unicode 字母数字后缀扩展 | 全采纳 |
| 5 | MAJOR | option=3 "防篡改闭环"表述强于实际能力 | §7.5.0 新增小节显式声明 trade-off:fence 仅校验本 pause 关联的 entry(完整 5 字段)+ 未关联 entry 由 propose 阶段 validateScopeEntries 负责;v5 后**完整闭环 within scope** | 全采纳 |
| 6 | MINOR | 顶部 P50 描述仍含 v4 残留"fence ctx 必填" | line 15 P50 工日描述删除 ctx 必填残留,改为 v5 修订摘要 | 全采纳 |
| 7 | MINOR | Step 1.6.2/1.6.3 顺序无显式 guard | Step 1.6.3 加"必须先完成 1.6.2 + 验证 script 跑通"guard;给反序错误恢复说明 | 全采纳 |
| 8 | MINOR | "9d/9b/9a CI 无回归"表述证据不足 | Step 1.6.3 实施注意改"本地 / PR CI 行为兼容(待实施时跑全套确认)",降低证据强度 | 全采纳 |
| 9 | NIT | §7.6 v2 修订记录第 6 行仍含 ctx 方案旧描述 | §7.6 第 6 行 ctx 描述末尾加 v4/v5 历史标注:"v3 加 ctx 在 v4 中段 revert,当前签名 `(marker, changeDir, file?)`" | 全采纳 |
| 10 | NIT | 多版本修订记录过长 | **不压缩** — 沿 user 偏好"plan 演进作为 audit trail";plan 文档读者从顶部 §"v4 → v5 关键修订" 拿到当前状态 + §7.6-7.9 历史 | 部分采纳(保留长度作为审计链) |

**v5 设计升级**:
- BLOCKER 1 + 2 联动:gate regex 兼容空白 + soft/release 双模式 — 9c "reminder gate" 不让 9c CI fail,9z "release gate" 硬约束 actual=0,不可改值绕过
- MAJOR 3 + 5:option=3 fence 局部校验从 v4 "部分子集"升级到 v5 "完整覆盖匹配 entry";trade-off 显式:仅校验本 pause 关联的 entry,不管其他 entry
- MAJOR 4:option=2 regex 真支持 Unicode task key(中文/日文/俄文 task 名)

**v5 后剩余 known gap**(沿 §7.5):
- option=1 / option=2 真实 git diff 段级校验仍非 9c 实施范围(BLOCKER 2 + MAJOR 5 from v3) — 9z release CI 跑 `test:gate:release` 时 actual=0 才通过,机器化拒签
- option=3 fence 不校验未关联本 pause 的 scope entry — 由 propose 阶段 `validateScopeEntries` 整文件兜底(沿 v0.4 既有不变量)

**实施判断**:v5 后 plan 在 9c 范围内 attack 面已**完整闭环**;option=1/2 真实 diff parser 留给 9e1 / 9z;option=3 未关联 entry 由 propose validate 兜底。codex 四轮建议 "修完 2 BLOCKER + MAJOR 1 后可 stop reviewing" 已达成。

### 7.10 codex 对抗性 review v6 五轮修订记录

本 plan v6 沿 codex 五轮 review 4 议题(0 BLOCKER + 2 MAJOR + 1 MINOR + 1 NIT)全采纳。

**v5 议题回归状态**(已确认完全解决,无回归):
- v4 议题 1/2/3/5/6/7/8/9/10(9 项)— 见 §7.9
- v4 议题 4(option=2 regex 中文)— bare 分支已修;**bold 分支由 v6 补完**

**v5 留下 + v6 补完**:

| 编号 | 级别 | 议题 | 修订位置 | 处理 |
|---|---|---|---|---|
| A4 续修 | MAJOR | v5 只给 option=2 regex bare 分支加 `(?![\p{L}\p{N}_-])` lookahead,bold 分支 `\*\*taskKey\*\*` 后未加 → `**task-2**-extra` / `**task-2**补充` 仍误匹配 | regex 改为 `\*\*${taskKey}\*\*(?![\p{L}\p{N}_-])\|${taskKey}(?![\p{L}\p{N}_-])`,两个分支末尾都加 lookahead | 全采纳 |
| B2 | MAJOR | option=3 fence 匹配第一个 entry 后 `return ok()`,后续 entry 不校验 → 多 entry 引用同一 pause id 时漏检 | 改 **exactly one** 模式:先收集所有 `triggered_by.id === p.id` 的 entries,数量 = 0 / > 1 直接拒签(后者错误信息列所有匹配 id);数量 = 1 才做字段校验。pause_decision id ↔ scope entry 一对一是 design 语义,多条是数据异常 | 全采纳 |
| MINOR | MINOR | `release-blocker-attack-path.test.ts` 顶部旧注释说"改 EXPECTED_TODO_COUNT 从 2 → 0",与 v5 release 模式(release 模式不读 EXPECTED)指引冲突 | 注释改为:1. unskip 全部 todo;2. **改 9z release CI 配置调 `pnpm test:gate:release`**(硬约束);3.(可选)同步改 SOFT 值。统一 v5 双模式语义 | 全采纳 |
| NIT | NIT | `check-release-gate.mjs` `readFileSync(FILE, 'utf8')` 无 try/catch,文件不存在(中间状态)给 stack trace 而非清晰错误 | 加 try/catch,捕 ENOENT 给清晰错误信息(提示中间状态 / 9z 误删恢复指引) | 全采纳 |

**v6 设计闭环验证**:
- option=2 regex 现两个分支都有 lookahead,真支持 Unicode + 拒绝 bold 后缀扩展;`**task-2** added`(空格) ✓ / `**task-2**-extra` ✗ / `**task-2**补充` ✗
- option=3 fence 现 exactly one + 完整字段校验,符合 design "pause id ↔ scope entry 一对一"语义
- script gate try/catch 给中间状态清晰错误,改善实施者体验

**v6 后剩余 known gap**(沿 §7.5):option=1 / option=2 真实 git diff 段级校验(原 v3 BLOCKER 2 + MAJOR 5)— 9z release CI 跑 `test:gate:release` 时 actual=0 才通过,机器化拒签兜底。

**最终实施判断**(v6 完成):codex 五轮已明确建议"修完 2 MAJOR 后可 stop reviewing"。v6 已修完全部 2 MAJOR + 1 MINOR + 1 NIT,**无剩余 BLOCKER / MAJOR**。9c 范围内反向加固完整闭环;遗留 known gap 均通过机器化拒签兜底。**plan v6 已就绪进入实施**。

---

## 8. 执行 Handoff

Plan 完成且保存到 `docs/plans/2026-05-11-plan-9c-apply-fluid-pause.md`。两种执行选项:

### 选项 1:Subagent-Driven(推荐)

每 task 派 fresh subagent,task 间两阶段 review(spec + code quality),快速迭代。沿 9d 实施同模式。
- **REQUIRED SUB-SKILL**:使用 `superpowers:subagent-driven-development`
- 串行约束:Task 1 → Task 2 → Task 5;Task 3 / Task 4 可并行(放 Task 2 完成后并行派)

### 选项 2:Inline Execution

主代理串行跑所有 task,无 subagent。批量执行 + checkpoint(每 task 完 commit + 等用户确认)。
- **REQUIRED SUB-SKILL**:使用 `superpowers:executing-plans`

**用户选哪个?**
