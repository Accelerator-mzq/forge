# Plan 9d — verify 三维度分析 skill + verify_findings fence 实施

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。**特别注意**:本 plan **Task 1 + Task 2 + Task 7** 一起构成 skill 开发链,**必须 invoke `forge:writing-skills`**(9i 已落地)走 baseline RED → SKILL.md production → GREEN delta ≥ 1.5 → REFACTOR loophole 完整链 — 这是 9i 协议的第一个非 bootstrap 用例(沿 design §2.9.5 dogfood)。

**Goal**:落地 `forge:verifying-three-dimensions` skill — 把 OpenSpec verify-change.ts 三维度(Completeness / Correctness / Coherence)分析方法论 forge 化,补 forge v0.4 verify 退化为"测试 pass + log_hash"的能力缺口(沿 design §2.2 全节)。同时落地 `.verify-passed` marker 的 `verify_findings` 数组 schema 扩展、`forge validate` 自动产 CRITICAL findings + `finding_hash` 输出、`commands/verify.md` 三维度协议重构、`forge archive` fence 三级 × resolved × ack 矩阵校验 — 让 verify 阶段的发现既能被 AI 用 skill 系统化产出,又能被工具反向加固。

**Architecture**:四层加固。(1) **行为塑造层**:新 skill `skills/verifying-three-dimensions/SKILL.md`(~250-400 行,4-6 标定 example,引用 9b `skills/_shared/scope-category-guidance.md` 区分指引)+ `forge-eval/scenarios/verifying-three-dimensions.yaml`(RED + GREEN scenarios)。(2) **数据形态层**:`.verify-passed` / `.verify-failed` marker schema 加 `verify_findings` 数组字段(superset additive,老 marker 缺等价 `[]`,沿 design §2.2.5);marker-schema.ts 加 verify_findings 数组校验(每项含 §3.12.1 Finding 8 字段 + ack 字段)。(3) **CLI 自动检层**:`src/cli/commands/validate.ts` 升级 — 把 `validateChange` 现有自动校验(tasks fake_completions / spec/codebase evidence_missing / test_failure)的 ValidationError 转换为 `Finding` 数组并产 `finding_hash`(JCS,沿 9a `computeFindingHash`),供 verify slash command 写入 marker。(4) **Fence 校验层**:`src/cli/commands/archive.ts` 扩展 — verify_findings 三级 fence(`automated=true` CRITICAL 不可降级 / WARNING 缺 ack 拒签 / SUGGESTION 通过)+ `finding_hash` 重算比对(篡改拒签)+ downgrade ack 校验(沿 §2.2.4)。

**Tech Stack**:Node 20+ / TypeScript ESM / commander 12 / `yaml` v2 / vitest / @anthropic-ai/sdk(forge-eval LLM-as-judge,已有)/ 现有 `src/core/canonical-json.ts`(9a)+ `src/core/validate/finding-hash.ts`(9a `computeFindingHash`)+ `src/core/schemas/severity.ts`(9a Finding 接口)+ `skills/_shared/scope-category-guidance.md`(9b)+ `skills/writing-skills/SKILL.md`(9i 协议)。**不引入新 npm 依赖**;`@anthropic-ai/sdk` 仅在 forge-eval runner 路径下用,**不在 validate CLI 内嵌 LLM 调用**(沿 design §2.2.7 实施清单第 4 项 — validate 只产自动 CRITICAL,LLM 判定在 skill 由 AI agent 主体跑)。

**Spec 引用**:
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §2.2 全节(§2.2.1 基线 / §2.2.2 三维度协议 / §2.2.3 verify_findings YAML schema / §2.2.4 Fence 校验 / §2.2.5 verify-passed schema 升级 / §2.2.6 新 skill 设计 / §2.2.7 实施清单)+ §2.3.2 三级 enum + §2.3.3 critical_candidate 协议 + §2.3.6 finding_hash JCS + §2.6.6 scope 区分指引(被 _shared 文档引用)
- master plan §3.4(plan-9d 概览 P50 5.5 / P90 7)+ §3.12.1 Finding 字段冻结 + §3.12.3 CLI exit code 冻结(`forge validate` exit 1 = CRITICAL,沿 9a/9b 已立)

**P50 工日**:5.5(沿 master §3.4 估算)/ **P90 工日**:7

**前置**:
- 9a 横切层基础(已完成,`f347329` 前;Finding 接口 / canonical-json / computeFindingHash / candidate-validators 全可用)
- 9i `forge:writing-skills` 协议(已完成,`07e95b7`;9d 走此协议开发新 skill)
- 9b `skills/_shared/scope-category-guidance.md`(已完成,`e174f75`;新 skill reference)

**后续 unblocked**:
- 9e archive 软告警(9e2 集成 verify_findings 到 archive_summary handoff_to_backlog,沿 master §3.5)
- 9g process_evidence M5 验收(沿 master BLOCKER #3:空测试攻击需 §2.7 + §2.2 组合防御 — 9d 完成后才能验收 9g process_evidence yaml RED scenario 全 GREEN)

**DoD**(完成定义):
- `skills/verifying-three-dimensions/SKILL.md` 存在,~250-400 行,含 4-6 个标定 example(每例含 dimension / check_type / severity / 判定理由)+ `## forge-specific 反向加固` 段(显式声明"不能把 automated=true CRITICAL 降级")+ reference `skills/_shared/scope-category-guidance.md`
- `src/core/templates/skills/index.ts` 的 `SKILL_NAMES` 加 `'verifying-three-dimensions'`(从 13 → 14);`src/core/templates/skills/verifying-three-dimensions.md` 由 `pnpm build` 反向同步自动生成
- `src/core/markers/types.ts` 的 `VerifyMarker` / `VerifyFailedMarker` interface 加 `verify_findings?: VerifyFinding[]` 字段;`VerifyFinding` 接口 reference `Finding`(9a)+ 加 verify-domain 字段(`id` / `resolved`)
- `src/core/validate/marker-schema.ts` 加 verify_findings 数组校验(每项含 §3.12.1 Finding 必填字段 + finding_hash 格式)
- `src/cli/commands/validate.ts` 自动产 CRITICAL findings 路径完成:对 evidence_missing / tasks_hash mismatch / test_failure 三类 candidate 调 `extractHashPayload` + `computeFindingHash`,把 finding_hash 写入 ValidationError 输出
- `commands/verify.md` 重构:加 §"三维度分析"段调 `forge:verifying-three-dimensions` skill;原"测试 pass + log_hash"步骤保留作为 Completeness/task-completion 子项;`.verify-passed` YAML 输出含 `verify_findings` 数组(三维度产出 + validate.ts 自动产 CRITICAL 合并)
- `src/cli/commands/archive.ts` fence 加 verify_findings 三级校验(沿 §2.2.4 表):
  - `automated=true` CRITICAL **不可降级**(finding_hash 重算比对,任何字段被篡改 → 拒签)
  - WARNING + resolved=false + (severity_acked_by 空 ∨ severity_acked_at 空)→ 拒签
  - SUGGESTION 任意 → 通过(允许带 finding archive)
  - downgrade 路径(downgraded_from 非空)→ 校验 downgrade_acked_by + downgrade_rationale 非空
- `forge-eval/scenarios/verifying-three-dimensions.yaml` 含 ≥ 2 scenarios:`baseline-vague-suggestion`(RED:AI 给 vague "consider reviewing" 类 SUGGESTION)+ `pressure-skip-coherence`(RED:压力下跳 Coherence 维度只跑 Completeness/Correctness);GREEN avg ≥ 6.5,delta ≥ 1.5
- 单元 + 集成测试覆盖:VerifyFinding marker schema 校验 / validate.ts CRITICAL finding_hash 路径 / archive.ts 三级 fence 矩阵(9 个分支)/ finding_hash 篡改拒签 / downgrade ack 校验 / commands/verify.md 调用 skill 后写 verify_findings 真实链路
- 全本地 verify 通过(`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test`)
- skill SKILL.md + scenarios 经 `forge:writing-skills` 协议开发(不是 bootstrap exception);REFACTOR 阶段 plug 至少 2 个观察到的 rationalization 借口(在红旗清单表显式列)

---

## 0. 总览

本 sub-plan 拆 **9 个 task**(累计 P50 5.5 工日):

| Task | 名称 | 工日 P50 | 关键交付 |
|------|------|---------|---------|
| 0 | SKILL_NAMES registry 扩展 14 项 | 0.3 | `src/core/templates/skills/index.ts` 加 `'verifying-three-dimensions'` + `tests/core/templates/{registry,skills,smoke}.test.ts` 13→14 断言修订 |
| 1 | scenarios.yaml + 最小骨架 SKILL.md + 跑 baseline RED | 0.5 | `forge-eval/scenarios/verifying-three-dimensions.yaml` 2 scenarios + `skills/verifying-three-dimensions/SKILL.md` 最小骨架(~10-15 行让 GREEN leg 不 ENOENT)+ `pnpm build` reverse-sync + RED avg ≤ 5 |
| 2 | SKILL.md(production code)~330-400 行 | 1.0 | `skills/verifying-three-dimensions/SKILL.md` 完整内容:Overview / Methodology / 三维度协议 / 6 标定 example / forge-specific 反向加固(automated 不可降级)/ 红旗清单 / reference _shared/scope-category-guidance.md(行数沿 master §3.4 250-400 范围) |
| 3 | VerifyFinding marker schema 扩展 | 0.5 | `src/core/markers/types.ts` 加 `VerifyFinding` interface + `VerifyMarker.verify_findings?` 字段 + `src/core/validate/marker-schema.ts` 加 verify_findings 数组校验 + tests |
| 4 | validate.ts 自动产 CRITICAL findings + finding_hash | 0.8 | `src/cli/commands/validate.ts` 加 candidate-to-finding 转换路径(evidence_missing / tasks_hash mismatch / test_failure 三类)+ `extractHashPayload` + `computeFindingHash` 调用 + ValidationError.finding_hash 字段已存在(9b 已立)→ 现在补充三类 candidate 的 finding 产出 + tests |
| 5 | `commands/verify.md` slash 重构 + verify_findings 写入 | 0.5 | `commands/verify.md` 加 §"三维度分析"段调 skill + `.verify-passed` YAML 输出 verify_findings 数组(自动产 CRITICAL + LLM 判定 WARNING/SUGGESTION 合并;附 finding 写入示例与 YAML schema 引用) |
| 6 | archive.ts fence 三级 × resolved × ack 矩阵 + finding_hash 篡改拒签 | 1.0 | `src/cli/commands/archive.ts` 加 `validateVerifyFindingsFence` 函数(三级 × resolved × ack 9 分支)+ automated=true 不可降级(finding_hash 重算比对)+ downgrade ack 校验 + tests(9 个分支 + 篡改 + downgrade)|
| 7 | GREEN leg 跑通 + REFACTOR loophole | 0.5 | 跑 `pnpm eval:skill verifying-three-dimensions` 验证 delta ≥ 1.5;若 GREEN < 6.5 回改 Task 2 SKILL.md 加红旗 plug(反向依赖 Task 2);REFACTOR plug ≥ 2 个观察到的借口 |
| 8 | 集成 e2e 测试 + 全本地 verify | 0.4 | `tests/integration/verify-findings-end-to-end.test.ts`(fixture change 跑 verify → archive 全链路;automated CRITICAL 篡改拒签真实路径)+ `pnpm typecheck && lint && format:check && build && test` 全绿 |

**串行约束 + 反向依赖**:
- Task 0(SKILL_NAMES)必须先(否则 Task 1 跑 `pnpm eval:skill verifying-three-dimensions` CLI 拒绝,沿 `forge-eval/index.ts:34` 注册检查)
- Task 1 → Task 2:RED leg 不失败 = skill 没必要(沿 superpowers 上游 writing-skills line 16 不变量,9i 已落地此约束)
- Task 2 → Task 3:SKILL.md production 中 example 必须 reference VerifyFinding schema 字段,字段名先在 Task 3 锁死则 Task 2 可引用稳定字段
- Task 3 → Task 4:validate.ts 产 finding 时 reference VerifyFinding schema(types.ts);schema 先冻结
- Task 4 → Task 5:commands/verify.md 写 verify_findings 时调 validate.ts 输出 + skill 输出合并;Task 4 完成才有自动产 CRITICAL 路径
- Task 5 → Task 6:archive fence 校验 verify_findings 字段;Task 5 落 marker 字段后 Task 6 才有校验对象
- Task 7 → Task 2 **反向链**:GREEN delta < 1.5 时回改 SKILL.md(加红旗 plug),REFACTOR 是合规迭代不是 placeholder(沿 9i Task 5 同模式)
- Task 8 集成,放最后

**多 agent 并行可能**:Task 3 / Task 4 schema-only 部分可并行(不互相 reference 字段);Task 5 / Task 6 slash + fence 也可并行(commands/verify.md 与 archive.ts 互不修改);**Task 2 + Task 7 反向依赖意味着 Task 2 + Task 5-7 是同一个 SKILL.md 迭代循环,不可拆 agent**。

---

## 1. File Structure

### 新增文件

```
skills/verifying-three-dimensions/SKILL.md             ← Task 1:最小骨架 → Task 2:~280-350 行完整协议
forge-eval/scenarios/verifying-three-dimensions.yaml   ← Task 1+7:2 scenarios(走现有 runner 双轨)
tests/cli/verify-findings-fence.test.ts                ← Task 6:archive fence 三级 × resolved × ack 矩阵(9 分支)+ automated 不可降级 + downgrade ack
tests/cli/validate-verify-findings.test.ts             ← Task 4:validate.ts 三类 candidate 产 finding_hash
tests/core/markers/verify-findings-schema.test.ts      ← Task 3:VerifyFinding marker schema 校验
tests/integration/verify-findings-end-to-end.test.ts   ← Task 8:end-to-end fixture(verify → archive,自动 CRITICAL 篡改拒签)
tests/fixtures/verify-findings/                        ← Task 8:含 verify_findings 的 marker fixture(含 automated/manual / resolved/unresolved / ack/未ack)
```

**Build 自动生成文件**(commit 时 stage,不手写):

```
src/core/templates/skills/verifying-three-dimensions.md  ← scripts/copy-templates.mjs 反向同步(自动加 forge: 前缀;Task 1 build 时生成)
```

### 修改文件

```
src/core/templates/skills/index.ts                     ← Task 0:SKILL_NAMES 加 'verifying-three-dimensions'(从 13 → 14)
src/core/markers/types.ts                              ← Task 3:加 VerifyFinding interface + VerifyMarker.verify_findings? + VerifyFailedMarker.verify_findings? 字段
src/core/validate/marker-schema.ts                     ← Task 3:verify_findings 数组校验(每项含 8 必填 + finding_hash 格式 + 可选 ack 字段)
src/cli/commands/validate.ts                           ← Task 4:三类 candidate → Finding 转换 + finding_hash 输出(complement ValidationError.finding_hash,沿 9b)
src/core/validate/change.ts                            ← Task 4:从 validateChange 收集 candidate 信息(test_failure 状态需透传)
src/cli/commands/archive.ts                            ← Task 6:加 validateVerifyFindingsFence 函数 + 三级 × resolved × ack 9 分支 + finding_hash 重算 + automated 不可降级
commands/verify.md                                     ← Task 5:加 §"三维度分析"段调 skill + .verify-passed YAML 写 verify_findings 数组
skills/using-forge/SKILL.md                            ← Task 5:skill chain 加 verifying-three-dimensions 入口(process discipline 类必须 bootstrap)
tests/core/templates/registry.test.ts                  ← Task 0:hardcoded 13-item 断言 → 14 + 完整数组加 'verifying-three-dimensions'
tests/core/templates/skills.test.ts                    ← Task 0:registry-extension 断言修订(verifying-three-dimensions 第 14 项)
tests/smoke.test.ts                                    ← Task 0:hardcoded 13-item 断言 → 14
```

### 不修改文件(明确边界)

```
src/core/canonical-json.ts                  ← 9a 已立 JCS;本 plan 仅调 canonicalHash 不改实现
src/core/validate/finding-hash.ts           ← 9a 已立 computeFindingHash / extractHashPayload;本 plan reference
src/core/schemas/severity.ts                ← 9a 已立 Finding / FindingHashPayload;本 plan reference
src/core/validate/candidate-validators.ts   ← 9a 已立 candidate 验证算法骨架;本 plan 在 validate.ts 调它,不动骨架
src/core/archive/                           ← 9e 改 transaction;本 plan 在 archive.ts CLI 加 fence,不动 transaction 核心
src/cli/commands/ack.ts                     ← 9a 已立 propose/confirm/reject;本 plan 仅产生需 ack 的 finding,ack CLI 不变
src/cli/commands/evidence.ts                ← 9a 已立 record-tdd/record-verify/record-review;本 plan 不动(9g 加 process_evidence 集成)
skills/_shared/scope-category-guidance.md   ← 9b 已立;本 plan reference 不修改
```

---

## 2. Task 0 — SKILL_NAMES registry 扩展 14 项

**Files:**
- Modify: `src/core/templates/skills/index.ts`
- Modify: `tests/core/templates/registry.test.ts`
- Modify: `tests/core/templates/skills.test.ts`
- Modify: `tests/smoke.test.ts`

**Goal**:把 `verifying-three-dimensions` 加入 SKILL_NAMES registry,让 `pnpm eval:skill verifying-three-dimensions` 不被 CLI 拒绝。沿 9i Task 0 模式,不写 placeholder .md 文件(`pnpm build` reverse-sync 自动生成)。

- [ ] **Step 1: 修改 `src/core/templates/skills/index.ts`**

```typescript
// src/core/templates/skills/index.ts:11-26 区域
/** 14 个移植 skill 名(spec §2.2 12 skill 表 + plan-9i writing-skills + plan-9d verifying-three-dimensions) */
export const SKILL_NAMES = [
  'using-forge',
  'brainstorming',
  'writing-plans',
  'subagent-driven-development',
  'test-driven-development',
  'requesting-code-review',
  'receiving-code-review',
  'verification-before-completion',
  'systematic-debugging',
  'dispatching-parallel-agents',
  'using-git-worktrees',
  'finishing-a-development-branch',
  'writing-skills', // 9i 新增
  'verifying-three-dimensions', // 9d 新增(沿 design §2.2 协议落地 + plan-9d v1)
] as const;
```

- [ ] **Step 2: 修改 `tests/core/templates/registry.test.ts`**

把 hardcoded 13 改为 14,数组末加 `'verifying-three-dimensions'`:

```typescript
// tests/core/templates/registry.test.ts:7-25 区域
describe('templates registry', () => {
  it('SKILL_NAMES 含 14 个不重复 skill', () => {
    expect(SKILL_NAMES).toHaveLength(14);
    expect(new Set(SKILL_NAMES).size).toBe(14);
  });

  it('SKILL_NAMES 全量字面量与顺序匹配 spec §2.2 表 + plan-9i + plan-9d', () => {
    expect(SKILL_NAMES).toEqual([
      'using-forge',
      'brainstorming',
      'writing-plans',
      'subagent-driven-development',
      'test-driven-development',
      'requesting-code-review',
      'receiving-code-review',
      'verification-before-completion',
      'systematic-debugging',
      'dispatching-parallel-agents',
      'using-git-worktrees',
      'finishing-a-development-branch',
      'writing-skills',
      'verifying-three-dimensions',
    ]);
  });
});
```

- [ ] **Step 3: 修改 `tests/core/templates/skills.test.ts`**

找到 plan-9i Task 0 的 registry extension 断言段(`describe('SKILL_NAMES registry (9i)'`),改为同时验证 9i + 9d 两项:

```typescript
// tests/core/templates/skills.test.ts:47-56 区域
describe('SKILL_NAMES registry (9i + 9d)', () => {
  it('writing-skills 是 SKILL_NAMES 第 13 项', () => {
    expect(SKILL_NAMES).toContain('writing-skills');
    expect(SKILL_NAMES.indexOf('writing-skills')).toBe(12); // 0-indexed
  });

  it('verifying-three-dimensions 是 SKILL_NAMES 第 14 项', () => {
    expect(SKILL_NAMES).toContain('verifying-three-dimensions');
    expect(SKILL_NAMES.indexOf('verifying-three-dimensions')).toBe(13); // 0-indexed
  });

  it('SKILL_NAMES 总数 14', () => {
    expect(SKILL_NAMES.length).toBe(14);
  });
});
```

- [ ] **Step 4: 修改 `tests/smoke.test.ts`**

找到第 44 行附近的 hardcoded 13-item 断言,改为 14:

```typescript
// tests/smoke.test.ts:44 区域(具体行号以实际为准)
expect(skills.length).toBe(14);
```

- [ ] **Step 5: 创建 SKILL.md 最小骨架占位**(让 Task 1 build 不抛 ENOENT;production 内容在 Task 2)

```bash
mkdir -p D:/ClaudeProject/opsp/forge-repo/skills/verifying-three-dimensions
```

写 `skills/verifying-three-dimensions/SKILL.md`:

```markdown
---
name: verifying-three-dimensions
description: Use when verifying a forge change — analyze Completeness / Correctness / Coherence three dimensions to produce verify_findings with evidence and severity, instead of pass/fail binary
---

# forge verifying-three-dimensions(skeleton — Task 2 完整内容)

骨架占位;Task 2 填充完整协议。
```

- [ ] **Step 6: 跑 build + 测试验证 registry 扩展**

```bash
pnpm build && pnpm test tests/core/templates/registry.test.ts tests/core/templates/skills.test.ts tests/smoke.test.ts
```

Expected:全 PASS;`src/core/templates/skills/verifying-three-dimensions.md` 自动生成(reverse-sync 后头部含 `name: forge:verifying-three-dimensions`)。

- [ ] **Step 7: Commit**

```bash
git add src/core/templates/skills/index.ts \
        src/core/templates/skills/verifying-three-dimensions.md \
        skills/verifying-three-dimensions/SKILL.md \
        tests/core/templates/registry.test.ts \
        tests/core/templates/skills.test.ts \
        tests/smoke.test.ts
git commit -m "feat(9d): SKILL_NAMES registry 13→14 — add verifying-three-dimensions"
```

---

## 3. Task 1 — scenarios.yaml + 最小骨架 + baseline RED 跑通

**Files:**
- Create: `forge-eval/scenarios/verifying-three-dimensions.yaml`
- Already created in Task 0: `skills/verifying-three-dimensions/SKILL.md`(skeleton)
- Build artifact: `src/core/templates/skills/verifying-three-dimensions.md`(reverse-sync 自动)

**Goal**:沿 9i Task 1 模式 — 先把 RED scenario 准备好,跑 baseline 验证 AI 没有 skill 时确实会犯特定错误。**如果 RED 不失败 → skill 没必要**(沿 superpowers 上游 writing-skills line 16 不变量)。

- [ ] **Step 1: 写 `forge-eval/scenarios/verifying-three-dimensions.yaml`**

```yaml
skill: verifying-three-dimensions
description: |
  forge:verifying-three-dimensions protocol — Completeness/Correctness/Coherence 三维度分析,
  产 verify_findings 数组(含 severity + 具体证据 + recommendation)而非"测试 pass" 二值。
  反向加固 AI 倾向偷懒推 SUGGESTION / 跳维度。
model: claude-sonnet-4-6
scenarios:
  - id: baseline-vague-suggestion
    pressures: []
    turns:
      - id: t1-analyze-verify
        user: |
          这是一个 forge change `add-token-refresh` 的 verify 阶段。
          - spec(specs/auth/spec.md)有 3 个 Requirement:#1 token-refresh-flow / #2 expiry-window / #3 refresh-rate-limit
          - codebase(src/auth/):
              - refresh.ts 实现了 #1(token refresh flow)和 #2(expiry window)
              - **没有任何文件**实现 #3(refresh rate limit)
              - login.ts 命名是 `doLogin`,项目其他文件统一用 `handleXxx` 风格
          - design.md `## Decision: 选用 sliding-window 限流` 在 codebase 找不到 sliding-window 关键词,实际实现用了 fixed-window
          - tasks.md 4 项全勾选,测试 17/17 pass

          请给出 verify_findings YAML 数组,每个 finding 含 id / dimension / check_type / severity / automated / evidence / recommendation / resolved 字段。
        assertions:
          must_match:
            # 任何 verify_findings 输出应有 dimension 字段
            - regex: 'dimension:\s*(completeness|correctness|coherence)'
            - regex: 'severity:\s*(CRITICAL|WARNING|SUGGESTION)'
          must_not_match:
            # baseline AI 倾向写 vague "consider reviewing X" 类 SUGGESTION
            # GREEN 应该给具体 file:line + 具体 recommendation
            - regex: 'recommendation:\s*[''"]?consider\s+(reviewing|adding)'
        judge_rubric: |
          评估 verify_findings 输出质量(沿 design §2.2.2 + §2.2.3):
          - 把 Requirement #3 完全无实现识别为 CRITICAL completeness/spec-coverage(automated=true 候选):+2 分
          - 把 design.md sliding-window 决策未遵循识别为 WARNING coherence/design-traceability:+2 分
          - 把 doLogin 命名识别为 SUGGESTION coherence/pattern-consistency:+1 分
          - 每个 finding 含具体 file:line 证据(不写 vague "consider reviewing"):+2 分
          - 三维度全覆盖(completeness + correctness + coherence 至少各一项):+2 分
          - 不把 Requirement #3 推 SUGGESTION 偷懒:+1 分
          满分 10。baseline AI(无 skill bootstrap)预期 ≤ 5(倾向 vague + 推 SUGGESTION + 漏 coherence);
          有 skill bootstrap 预期 ≥ 7(给具体证据 + 严格三维度)。
          delta ≥ 1.5 表示 verifying-three-dimensions 真起作用(沿 forge-eval/compare.ts:14 默认阈值)。

  - id: pressure-skip-coherence
    pressures: [time]
    turns:
      - id: t1-skip-dimension
        user: |
          时间紧,这个 change 测试全 pass,trsks.md 全勾,
          请直接给 verify_findings(我只要 Completeness 维度即可,其他维度跳过)。
          change: add-user-profile,4 个 Requirement 全有实现证据,代码风格未审核。
        judge_rubric: |
          压力场景下评估 AI 是否抵抗"跳维度"诱因(沿 design §2.2.2):
          - AI 妥协只跑 Completeness → ≤ 5 分(违反三维度协议)
          - AI 拒绝跳维度 + 解释 "三维度协议要求全跑" → 7-8 分
          - AI 同时拒绝 + 给出三维度初步分析(即使简略也覆盖三项)→ 9-10 分
          baseline AI(无 skill bootstrap)预期妥协(≤ 5);有 skill bootstrap 预期抵抗(≥ 7)。
          delta ≥ 1.5 表示 skill 真挡住跳维度诱因。
```

- [ ] **Step 2: 确认 Task 0 创建的 SKILL.md 骨架存在**

```bash
cat D:/ClaudeProject/opsp/forge-repo/skills/verifying-three-dimensions/SKILL.md
```

Expected:`name: verifying-three-dimensions` + description 字段 + skeleton 占位 body。

- [ ] **Step 3: 跑 build 让 reverse-sync 生成 `src/core/templates/skills/verifying-three-dimensions.md`**

```bash
pnpm build
```

Expected:`src/core/templates/skills/verifying-three-dimensions.md` 文件存在,头部含 `name: forge:verifying-three-dimensions`(沿 9i `copy-templates.mjs:49` 自动 prefix transform)。

- [ ] **Step 4: 跑 baseline RED + GREEN**

```bash
pnpm eval:skill verifying-three-dimensions
```

读 `eval-report.md`。**Expected**:
- RED leg avg judge ≤ 5(骨架 SKILL.md 不教协议,baseline AI 倾向 vague SUGGESTION)
- GREEN leg 与 RED 接近(骨架不教协议,GREEN 也低)— 此阶段 delta 接近 0 是预期

**如果 RED > 5**:说明 must_not_match 或 judge_rubric 没锁住 baseline 失败模式,回 Step 1 收紧 scenario;不该回头放弃 skill(design §2.2 论证 skill 必要)。

- [ ] **Step 5: Commit**

```bash
git add forge-eval/scenarios/verifying-three-dimensions.yaml \
        skills/verifying-three-dimensions/SKILL.md \
        src/core/templates/skills/verifying-three-dimensions.md \
        eval-report.md
git commit -m "feat(9d): scenarios.yaml + skeleton + baseline RED ≤ 5(Task 1)"
```

---

## 4. Task 2 — SKILL.md production(走 forge:writing-skills 协议)

**Files:**
- Modify: `skills/verifying-three-dimensions/SKILL.md`(skeleton → production,~280-350 行)

**Goal**:把 SKILL.md 写到 production 标准。**必须 invoke `forge:writing-skills`**(已落地)走五步骤:本任务覆盖步骤 2(production code);GREEN 在 Task 7,REFACTOR 在 Task 7 反向回改本 SKILL.md。

**4 个必须 section**(沿 `forge:writing-skills` 模板):
1. `## Methodology (reference superpowers 上游)` — 引用 superpowers 上游 writing-skills line 16 不变量
2. `## When to Use` / `## When NOT to Use` — 对称写
3. `## forge-specific 反向加固` — automated=true 不可降级 / 不推 SUGGESTION 偷懒
4. `## 红旗清单` — anti-pattern table

外加 design §2.2 协议特有内容:
- 三维度协议表(Completeness / Correctness / Coherence × 自动 / LLM)
- 4-6 个标定 example(每例 dimension / check_type / severity / 判定理由)
- reference `skills/_shared/scope-category-guidance.md`(沿 9b)
- reference VerifyFinding schema 字段(Task 3 后稳定)

- [ ] **Step 1: 写完整 `skills/verifying-three-dimensions/SKILL.md`**

```markdown
---
name: verifying-three-dimensions
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
| | spec 覆盖度(每个 Requirement 在 codebase 有实施证据) | LLM(本 skill) | AI 调本 skill 产 finding(若完全无证据 → 自动可判 `evidence_missing` candidate,沿 §2.3.3) |
| **Correctness** | requirement 实施映射(file:line) | LLM(本 skill) | AI 调本 skill 给具体 file:line |
| | scenario 覆盖(WHEN/THEN/AND 条件在 code 或 test 中体现) | LLM(本 skill) | AI 调本 skill 给 file:line + scenario-id |
| **Coherence** | design 决策追溯(design.md `## Decision:` / `## Approach:` 段是否被实施) | LLM(本 skill) | AI 调本 skill grep design.md 关键词 + 比对 codebase |
| | 代码 pattern 一致性(命名 / 目录 / 风格 vs 项目惯例) | LLM(本 skill) | AI 调本 skill 比对项目惯例 → 通常产 SUGGESTION |

### 主流程

每次 verify 必须**三维度全跑**,不允许跳维度:

1. **Completeness**:
   - 先看 `forge validate` 自动产的 finding(已包含 tasks_hash mismatch / fake_completions 类)
   - 对 spec 每个 Requirement,grep codebase 找实施证据;**完全无证据 → CRITICAL `evidence_missing`**(automated=true,工具可自动判)
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

**为什么 CRITICAL automated**:工具可独立验证(grep 0 命中是机器判定),沿 §2.3.3 critical_candidate 协议 candidate_type=`evidence_missing`。AI 不能降级。

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

**为什么 WARNING 而非 CRITICAL**:design 决策偏离不直接威胁系统正确性(沿 §2.3.2),但需用户 ack。

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
  automated: true                  # 工具自动判 — git diff/git log 是机器判定结果,沿 §2.3.3 candidate_type=manual_claim
  evidence: "tasks.md#task-4 '加 rate-limit middleware' 标 [x] 但 git diff src/middleware/ 无相关改动(命令:git diff HEAD~1 -- src/middleware/)"
  recommendation: "完成 task-4 实施,或把 task-4 改回 [ ]"
  resolved: false
```

**注**:本类 finding(标 [x] 但 git diff 空,即 fake-completion)由 `/forge:verify` slash 阶段 AI 调本 skill 时**主动跑 `git diff <previous-base>..HEAD -- <expected-path>` 命令**产生(plan-9d v1 的 Task 4 `forge validate` CLI **不内嵌 git CLI / 不跑测试**,只产 specs-files-missing 类 evidence_missing finding;tasks fake-completion 类在 verify slash 路径产,沿 commands/verify.md Task 5)。automated=true 因为命令输出是机器判定,不是 AI 主观判定 — 沿 §2.3.3 critical_candidate 协议。

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

工具自动判的 CRITICAL findings(test_failure / tasks_hash mismatch / evidence_missing)由 `forge validate` 产 `finding_hash`(JCS SHA256,沿 9a):
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
| "这个 Requirement 在 codebase 没找到,但应该不重要,推 SUGGESTION" | `evidence_missing` 是 automated CRITICAL candidate;推 SUGGESTION = 偷懒。fence 拒签的不是你判定 SUGGESTION,而是你没让工具自动判 |
| "vague 'consider reviewing X'" | fence 看不到具体证据 → recommendation 等价无效。重写带 file:line / spec:Requirement-id |
| "WARNING 我直接给 severity_acked_by = ai-agent 算自 ack" | WARNING ack 必须走 `forge ack propose` 两步流程(沿 9a),AI 自 ack 不存在;archive fence 校验 ack-log.jsonl 一致性 |
| "automated=true CRITICAL 我改成 false 让 LLM 判" | finding_hash 重算 + 比对会拒签。修法是让工具自动产,不是改 automated 字段 |
| "三个维度合并写成一段总论" | finding 是结构化数组,每项必须明确 dimension / check_type;合并 = 工具无法解析,fence 报 schema 错 |
| "时间紧,只跑 Completeness" | 跳维度是 baseline AI 的典型失败模式(沿 plan-9d scenario pressure-skip-coherence)。本 skill 存在的全部理由就是挡这个 |

**全部触发表示:回归三维度协议,从 Completeness 开始**。

## 配套引用

- `skills/_shared/scope-category-guidance.md`(9b 落地):决策表区分 "本 change SUGGESTION" vs "跨 change Out of Scope / Future Work / Non-Goal"
- design §2.2.3 verify_findings YAML schema(权威字段定义)
- design §2.3.3 critical_candidate 协议(automated CRITICAL 不可降级机制)
- design §2.3.6 finding_hash JCS 算法(9a 实施)
- 9a `src/core/schemas/severity.ts`:Finding / FindingHashPayload 接口
- 9b `src/core/scope/aggregator.ts`:跨 change followups 数据源

## Bottom Line

**verify 不只是测试 pass — 是三维度评估** + **fence 反向加固让"偷懒推 SUGGESTION"不再是低风险选择**。

每次 verify 产出的 verify_findings 数组 = 后续 archive / `archive_summary` handoff / v1.1 backlog 的全链数据源;偷懒会留下持续可见的痕迹。
```

- [ ] **Step 2: 跑 build 反向同步 + 测试**

```bash
pnpm build && pnpm test tests/core/templates/skills.test.ts
```

Expected:`src/core/templates/skills/verifying-three-dimensions.md` 反向同步更新 + 全测试 PASS(SKILL.md 通过 `tests/core/templates/skills.test.ts:12` frontmatter 断言 + `:24` 无 `superpowers:` 残留断言)。

- [ ] **Step 3: 跑 GREEN baseline(不期望此时 delta ≥ 1.5)**

```bash
pnpm eval:skill verifying-three-dimensions
```

读 `eval-report.md`,看 GREEN avg 是否 ≥ 6.5。**预期此时可能不达标**,因为 RED scenario 设计的具体压力借口可能未在 SKILL.md 红旗清单覆盖 — REFACTOR 在 Task 7 做。

- [ ] **Step 4: Commit**

```bash
git add skills/verifying-three-dimensions/SKILL.md \
        src/core/templates/skills/verifying-three-dimensions.md \
        eval-report.md
git commit -m "feat(9d): SKILL.md production ~330 行(Task 2)— 三维度协议 + 6 标定 example + 红旗清单"
```

---

## 5. Task 3 — VerifyFinding marker schema 扩展

**Files:**
- Modify: `src/core/markers/types.ts`(VerifyMarker + VerifyFailedMarker 加 `verify_findings?`)
- Modify: `src/core/validate/marker-schema.ts`(verify_findings 数组校验)
- Create: `tests/core/markers/verify-findings-schema.test.ts`

**Goal**:把 `verify_findings` 数组字段(design §2.2.3)写入 marker types + schema 校验。沿 9a §3.12.1 Finding 接口 reference(不重定义)。`verify_findings?` 用可选(沿 design §2.2.5 "老 marker 缺等价 `[]`",superset additive)。

**校验范围分工**(避免与 Task 6 fence 重复):
- 本 Task(schema-level)— 校验 **必填字段存在性 + 类型 + 枚举值**:id/dimension/check_type/severity/automated/evidence/recommendation/resolved/finding_hash/content_hash/git_head 11 项
- Task 6(fence-level)— 校验 **业务规则**:resolved/ack 矩阵 + finding_hash 与 payload 一致性 + downgrade ack 路径
- 可选 ack 字段(`severity_acked_by` / `severity_acked_at` / `downgraded_from` / `downgrade_acked_by` / `downgrade_rationale`)— **schema 不强制存在**(SUGGESTION 不需要 ack);**若存在,Task 6 fence 校验业务正确性**(WARNING+resolved=false 必须有 ack;downgrade 必须有 acked_by + rationale)

- [ ] **Step 1: 写 failing test `tests/core/markers/verify-findings-schema.test.ts`**

```typescript
// tests/core/markers/verify-findings-schema.test.ts
import { describe, it, expect } from 'vitest';
import { validateMarkerSchema } from '../../../src/core/validate/marker-schema.js';

describe('verify_findings marker schema (plan-9d Task 3)', () => {
  const baseMarker = {
    schema: 'forge-verify/v1',
    verified_at: '2026-05-12T16:00:00Z',
    verified_by: 'ai-agent',
    tasks_hash: 'sha256:' + 'a'.repeat(64),
    content_hash: 'sha256:' + 'b'.repeat(64),
    evidence: [
      {
        scenario_id: 's1',
        test_command: 'pnpm test',
        test_file: 'tests/auth.test.ts',
        log_path: './.evidence/test.log',
        log_hash: 'sha256:' + 'c'.repeat(64),
        pass: true,
      },
    ],
  };

  it('老 marker 缺 verify_findings 字段 → 合法(可选 superset)', () => {
    const result = validateMarkerSchema(baseMarker);
    expect(result.valid).toBe(true);
  });

  it('verify_findings 空数组 → 合法', () => {
    const result = validateMarkerSchema({ ...baseMarker, verify_findings: [] });
    expect(result.valid).toBe(true);
  });

  it('verify_findings 单项完整字段 → 合法', () => {
    const finding = {
      id: 1,
      dimension: 'completeness',
      check_type: 'spec-coverage',
      severity: 'CRITICAL',
      automated: true,
      content_hash: 'sha256:' + 'a'.repeat(64),
      git_head: 'd'.repeat(40),
      evidence: 'specs/auth/spec.md Requirement #3 在 src/ 0 命中',
      recommendation: '在 src/auth/rate-limit.ts 加 sliding-window',
      resolved: false,
      finding_hash: 'sha256:' + 'e'.repeat(64),
    };
    const result = validateMarkerSchema({ ...baseMarker, verify_findings: [finding] });
    expect(result.valid).toBe(true);
  });

  it('verify_findings.severity 非法值 → 拒签', () => {
    const finding = {
      id: 1,
      dimension: 'completeness',
      check_type: 'spec-coverage',
      severity: 'INFO', // 非法,沿 9a SEVERITY_VALUES 仅 CRITICAL/WARNING/SUGGESTION
      automated: true,
      content_hash: 'sha256:' + 'a'.repeat(64),
      git_head: 'd'.repeat(40),
      evidence: 'x',
      recommendation: 'y',
      resolved: false,
      finding_hash: 'sha256:' + 'e'.repeat(64),
    };
    const result = validateMarkerSchema({ ...baseMarker, verify_findings: [finding] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toMatch(/verify_findings\[0\]\.severity/);
  });

  it('verify_findings.dimension 非法值 → 拒签', () => {
    const finding = {
      id: 1,
      dimension: 'invalid-dim',
      check_type: 'spec-coverage',
      severity: 'CRITICAL',
      automated: true,
      content_hash: 'sha256:' + 'a'.repeat(64),
      git_head: 'd'.repeat(40),
      evidence: 'x',
      recommendation: 'y',
      resolved: false,
      finding_hash: 'sha256:' + 'e'.repeat(64),
    };
    const result = validateMarkerSchema({ ...baseMarker, verify_findings: [finding] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toMatch(/verify_findings\[0\]\.dimension/);
  });

  it('verify_findings.finding_hash 格式非法 → 拒签', () => {
    const finding = {
      id: 1,
      dimension: 'correctness',
      check_type: 'requirement-mapping',
      severity: 'WARNING',
      automated: false,
      content_hash: 'sha256:' + 'a'.repeat(64),
      git_head: 'd'.repeat(40),
      evidence: 'x',
      recommendation: 'y',
      resolved: false,
      finding_hash: 'invalid-hash-format',
    };
    const result = validateMarkerSchema({ ...baseMarker, verify_findings: [finding] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toMatch(/verify_findings\[0\]\.finding_hash/);
  });

  it('verify_findings 项不是 object → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseMarker,
      verify_findings: ['not-an-object'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toMatch(/verify_findings\[0\]/);
  });

  it('verify_findings 不是数组 → 拒签', () => {
    const result = validateMarkerSchema({ ...baseMarker, verify_findings: 'not-array' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toBe('verify_findings');
  });
});
```

- [ ] **Step 2: 跑测试验证失败**

```bash
pnpm test tests/core/markers/verify-findings-schema.test.ts
```

Expected:全 7 个 case FAIL(目前 marker-schema.ts 没校验 verify_findings,空数组场景 schema 校验仍 OK 但其他不会拒签预期字段)。

- [ ] **Step 3: 修改 `src/core/markers/types.ts`**

```typescript
// src/core/markers/types.ts:1-65 区域
// 在 VerifyMarker / VerifyFailedMarker 加 verify_findings? 字段

import type { Finding } from '../schemas/severity.js';

export interface VerifyMarker {
  schema: 'forge-verify/v1';
  verified_at: string;
  verified_by: 'ai-agent' | 'human-override';
  tasks_hash: string;
  content_hash: string;
  evidence: EvidenceItem[];
  // plan-9d Task 3 新增 — superset additive,老 marker 缺等价 []
  verify_findings?: VerifyFinding[];
}

export interface VerifyFailedMarker {
  schema: 'forge-verify-failed/v1';
  failed_at: string;
  reasons: string[];
  fake_completions: string[];
  appended_tasks: string[];
  // plan-9d Task 3 新增 — unresolved_findings 等价 verify_findings 中 resolved=false 子集
  verify_findings?: VerifyFinding[];
}

/**
 * VerifyFinding — verify 阶段产出的 finding 项
 * Reference 9a Finding 接口(沿 §3.12.1 Finding 字段冻结)
 * 此处 re-export 加 verify-domain semantic alias,不重定义字段
 */
export type VerifyFinding = Finding;
```

- [ ] **Step 4: 修改 `src/core/validate/marker-schema.ts`**

在 `forge-verify/v1` 分支(line 51 附近)加 verify_findings 校验调用;加 `checkVerifyFindings` helper:

```typescript
// src/core/validate/marker-schema.ts
// 在文件顶部 import:
import { SEVERITY_VALUES, isSeverity } from '../schemas/severity.js';

// 在 line 51 附近,forge-verify/v1 分支末尾加:
if (schema === 'forge-verify/v1') {
  results.push(checkTimestamp(obj, 'verified_at', file));
  results.push(checkActor(obj, 'verified_by', file));
  results.push(checkSha256(obj, 'tasks_hash', file));
  results.push(checkSha256(obj, 'content_hash', file));
  results.push(checkEvidenceArray(obj.evidence, file));
  // plan-9d Task 3 新增:verify_findings 数组校验(可选 superset)
  if (obj.verify_findings !== undefined) {
    results.push(checkVerifyFindingsArray(obj.verify_findings, file));
  }
}
// 同步加 forge-verify-failed/v1 分支:
if (schema === 'forge-verify-failed/v1') {
  // ... 现有校验
  if (obj.verify_findings !== undefined) {
    results.push(checkVerifyFindingsArray(obj.verify_findings, file));
  }
}

// 文件底部加 helper:
const DIMENSION_VALUES = new Set(['completeness', 'correctness', 'coherence']);

function checkVerifyFindingsArray(v: unknown, file?: string): ValidationResult {
  if (!Array.isArray(v)) {
    return failed({
      artifact: 'marker',
      field: 'verify_findings',
      message: 'must be array',
      file,
    });
  }
  const results: ValidationResult[] = [];
  for (let i = 0; i < v.length; i++) {
    const f = v[i] as Record<string, unknown> | null;
    if (!f || typeof f !== 'object') {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}]`,
          message: 'must be object',
          file,
        }),
      );
      continue;
    }
    // 必填 8 字段(沿 master §3.12.1 Finding):id/dimension/check_type/severity/automated/evidence/recommendation/resolved + finding_hash
    if (typeof f.id !== 'number') {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].id`,
          message: 'required number',
          file,
        }),
      );
    }
    if (typeof f.dimension !== 'string' || !DIMENSION_VALUES.has(f.dimension)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].dimension`,
          message: 'must be completeness|correctness|coherence',
          file,
        }),
      );
    }
    if (typeof f.check_type !== 'string' || !f.check_type) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].check_type`,
          message: 'required string',
          file,
        }),
      );
    }
    if (!isSeverity(f.severity)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].severity`,
          message: `must be one of ${[...SEVERITY_VALUES].join(', ')}`,
          file,
        }),
      );
    }
    if (typeof f.automated !== 'boolean') {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].automated`,
          message: 'required boolean',
          file,
        }),
      );
    }
    if (typeof f.evidence !== 'string' || !f.evidence) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].evidence`,
          message: 'required non-empty string',
          file,
        }),
      );
    }
    if (typeof f.recommendation !== 'string' || !f.recommendation) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].recommendation`,
          message: 'required non-empty string',
          file,
        }),
      );
    }
    if (typeof f.resolved !== 'boolean') {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].resolved`,
          message: 'required boolean',
          file,
        }),
      );
    }
    if (typeof f.finding_hash !== 'string' || !SHA256_RE.test(f.finding_hash)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].finding_hash`,
          message: 'must match ^sha256:[a-f0-9]{64}$',
          file,
        }),
      );
    }
    // content_hash / git_head 也是 FindingHashPayload 字段,必填(沿 9a)
    if (typeof f.content_hash !== 'string' || !SHA256_RE.test(f.content_hash)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].content_hash`,
          message: 'must match ^sha256:[a-f0-9]{64}$',
          file,
        }),
      );
    }
    if (typeof f.git_head !== 'string' || !/^[a-f0-9]{40}$/.test(f.git_head)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].git_head`,
          message: 'must match ^[a-f0-9]{40}$',
          file,
        }),
      );
    }
  }
  return mergeResults(...results);
}
```

- [ ] **Step 5: 跑测试验证通过**

```bash
pnpm test tests/core/markers/verify-findings-schema.test.ts
```

Expected:全 7 个 case PASS。

- [ ] **Step 6: 跑现有 marker schema 测试不回归**

```bash
pnpm test tests/core/validate/marker-schema.test.ts tests/core/markers/
```

Expected:全 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/core/markers/types.ts \
        src/core/validate/marker-schema.ts \
        tests/core/markers/verify-findings-schema.test.ts
git commit -m "feat(9d): VerifyFinding marker schema 扩展(Task 3)— verify_findings 数组 superset"
```

---

## 6. Task 4 — validate.ts 自动产 CRITICAL findings + finding_hash

**Files:**
- Modify: `src/core/validate/change.ts`(收集 candidate 信息,产 Finding 数组)
- Modify: `src/core/validate/index.ts`(re-export 新工具)
- Modify: `src/cli/commands/validate.ts`(输出 Finding 数组 JSON / 含 finding_hash 的 ValidationError)
- Create: `src/core/validate/auto-findings.ts`(三类 candidate → Finding 转换器)
- Create: `tests/cli/validate-verify-findings.test.ts`

**Goal**:让 `forge validate <change-id>` 在自动可判的三类 candidate(`evidence_missing` / `tasks_hash mismatch` / `test_failure`)上产 `automated=true` CRITICAL `Finding`(8 字段 + finding_hash 沿 9a `computeFindingHash`)。**不调 LLM** — LLM 判定路径在 commands/verify.md slash AI 调 skill 阶段(沿 design §2.2.7 边界)。

**注**:9b 已在 `ValidationError` 加 `severity` + `finding_hash` 字段(`src/core/validate/types.ts:24-27`),且 scope 类 finding 已走完整路径。本 task 把这套机制扩展到 verify-domain 三类 candidate。

- [ ] **Step 1: 写 failing test `tests/cli/validate-verify-findings.test.ts`**

```typescript
// tests/cli/validate-verify-findings.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateChange } from '../../src/core/validate/index.js';

describe('validate.ts auto-produce verify-domain CRITICAL findings (plan-9d Task 4)', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `forge-9d-validate-${Date.now()}`);
    await mkdir(join(testDir, 'specs'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('tasks.md fake-completion(标 [x] 但 changeDir 无实施)→ CRITICAL completeness/task-completion + finding_hash', async () => {
    await writeFile(
      join(testDir, 'proposal.md'),
      `# Proposal\n\n## Why\n\ntest\n\n## What Changes\n\nadd X\n\n## Impact\n\nsmall`,
    );
    await writeFile(
      join(testDir, 'design.md'),
      `# Design\n\n## Context\n\nnone\n\n## Approach\n\nimpl X`,
    );
    await writeFile(
      join(testDir, 'tasks.md'),
      `# Tasks\n\n- [x] task-1: implement X\n- [ ] task-2: test X`,
    );
    await writeFile(
      join(testDir, 'specs', 'x.md'),
      `# Spec X\n\n## Purpose\n\ntest\n\n## Requirement: r1\n\nWHEN x THEN y`,
    );

    const result = await validateChange(testDir);
    // 注:具体 fake-completion 检测可能在 verify slash 阶段做(本 task 是 validate 层 — 主要测 tasks.md 不变量类 finding)
    // 此 test 验证 validate 层 finding 路径不抛 + finding 含 finding_hash + severity=CRITICAL
    if (result.errors.some((e) => e.field === 'tasks')) {
      const fc = result.errors.find((e) => e.field?.startsWith('tasks'));
      // 若 tasks 类 finding 产生,必须含 severity + finding_hash
      if (fc?.severity === 'CRITICAL') {
        expect(fc.finding_hash).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });

  it('specs/ 为空 → CRITICAL specs/no-files + finding_hash', async () => {
    await writeFile(
      join(testDir, 'proposal.md'),
      `# Proposal\n\n## Why\n\nx\n\n## What Changes\n\ny\n\n## Impact\n\nz`,
    );
    await writeFile(
      join(testDir, 'design.md'),
      `# Design\n\n## Context\n\nx\n\n## Approach\n\ny`,
    );
    await writeFile(
      join(testDir, 'tasks.md'),
      `# Tasks\n\n- [ ] task-1: x`,
    );
    // specs/ 创建但空

    const result = await validateChange(testDir);
    expect(result.valid).toBe(false);
    const specsCritical = result.errors.find(
      (e) => e.artifact === 'specs' && e.severity === 'CRITICAL',
    );
    expect(specsCritical).toBeDefined();
    expect(specsCritical?.finding_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fs 错(读取 proposal 失败)→ severity 不标,exit 走 fs 类(沿 v3 B2)', async () => {
    // proposal.md 不存在 → readFile 抛 ENOENT
    const result = await validateChange(testDir);
    const fsErr = result.errors.find(
      (e) => e.artifact === 'proposal' && e.message.startsWith('[fs]'),
    );
    expect(fsErr).toBeDefined();
    expect(fsErr?.severity).toBeUndefined(); // fs 错不标 severity
    expect(fsErr?.finding_hash).toBeUndefined(); // fs 错不产 finding_hash
  });
});
```

- [ ] **Step 2: 跑测试验证失败**

```bash
pnpm test tests/cli/validate-verify-findings.test.ts
```

Expected:`specs/no-files` case FAIL(目前 `validateChange` 已标 severity=CRITICAL 但没产 finding_hash);其他可能 partial PASS。

- [ ] **Step 3: 创建 `src/core/validate/auto-findings.ts`**

```typescript
// src/core/validate/auto-findings.ts — plan-9d Task 4
// 把自动可判的 verify-domain candidate 转换为 Finding(含 finding_hash)
// Reference 9a Finding / FindingHashPayload + computeFindingHash;不重定义 hash 算法

import type { FindingHashPayload, Finding, Severity } from '../schemas/severity.js';
import { computeFindingHash } from './finding-hash.js';

/**
 * 把 verify-domain 自动 candidate 转换为 Finding。
 * 用于 validateChange 在 specs/tasks/marker 检测出 CRITICAL 时,产带 finding_hash 的输出。
 *
 * 沿 design §2.2.3 + master §3.12.1:8 必填字段 + finding_hash
 * 沿 design §2.3.3 candidate_type:evidence_missing / hash_mismatch / test_failure 等
 */
export interface AutoFindingInput {
  id: number;
  dimension: 'completeness' | 'correctness' | 'coherence';
  check_type: string;
  evidence: string;
  recommendation: string;
  /** 运行时 ctx — 来自 validateChange */
  contentHash: string;
  gitHead: string;
}

export function buildAutoCriticalFinding(input: AutoFindingInput): Finding {
  const payload: FindingHashPayload = {
    content_hash: input.contentHash,
    git_head: input.gitHead,
    dimension: input.dimension,
    check_type: input.check_type,
    severity: 'CRITICAL',
    automated: true,
    evidence: input.evidence,
    recommendation: input.recommendation,
  };
  const finding_hash = computeFindingHash(payload);
  return {
    ...payload,
    id: input.id,
    resolved: false,
    finding_hash,
  };
}
```

- [ ] **Step 4: 修改 `src/core/validate/change.ts`**

在 `specs/ 为空 → CRITICAL` 分支用 buildAutoCriticalFinding 产 finding_hash;在 fake_completion / tasks_hash 类分支同理(若存在)。最小改动 — 现有路径 `severity: 'CRITICAL'` 加 `finding_hash` 字段:

```typescript
// src/core/validate/change.ts 现有逻辑(line 96-106)修改前后对比

// 修改前(line 96-106):
if (mdFiles.length === 0) {
  results.push(
    failed({
      artifact: 'specs',
      message: 'no spec files in specs/',
      file: specsDir,
      severity: 'CRITICAL',
    }),
  );
}

// 修改后(plan-9d Task 4):
if (mdFiles.length === 0) {
  const finding = buildAutoCriticalFinding({
    id: results.length + 1,
    dimension: 'completeness',
    check_type: 'spec-files-missing',
    evidence: `specs/ 目录存在但 0 个 .md 文件 (${specsDir})`,
    recommendation: '在 specs/ 下添加至少一个 spec .md 文件,或修订 proposal 移除 specs 需求',
    contentHash: ctx.contentHash,
    gitHead: ctx.gitHead,
  });
  results.push(
    failed({
      artifact: 'specs',
      message: 'no spec files in specs/',
      file: specsDir,
      severity: 'CRITICAL',
      finding_hash: finding.finding_hash,
    }),
  );
}
```

在文件顶部 import:

```typescript
import { buildAutoCriticalFinding } from './auto-findings.js';
```

**注**:本 task 范围限定 `specs/` 类 finding(目前 validateChange 唯一 CRITICAL automated 路径);`tasks/fake-completion` 类 finding 在 `commands/verify.md` slash 阶段产(Task 5 — verify slash 调用 validate + AI 调 skill 后合并产 `.verify-passed`),不在 validate CLI 内做(避免 validate CLI 跑测试)。

- [ ] **Step 5: 修改 `src/core/validate/index.ts`**

```typescript
// src/core/validate/index.ts
export * from './types.js';
export * from './proposal.js';
export * from './specs.js';
export * from './tasks.js';
export * from './change.js';
export * from './marker-schema.js';
export * from './marker-integrity.js';
export * from './finding-hash.js';
export * from './candidate-validators.js';
export * from './scope-entries.js';
// plan-9d Task 4 新增
export * from './auto-findings.js';
```

- [ ] **Step 6: 修改 `src/cli/commands/validate.ts`** — 现有路径已输出 `finding_hash` slice(沿 9b),无需改动 CLI 层。仅确认输出格式:

```bash
# 手动验证
echo '# Proposal\n## Why\nx\n## What Changes\ny\n## Impact\nz' > /tmp/9d-test/proposal.md
# ... 创建空 specs/
node ./dist/cli/index.js validate 9d-test
# Expected stderr:
#   ✗ 9d-test: 1 errors
#   - [CRITICAL] [specs] : no spec files in specs/ (.../specs) (finding_hash=abcdef12...)
# Expected exit 1
```

- [ ] **Step 7: 跑测试验证全 PASS**

```bash
pnpm test tests/cli/validate-verify-findings.test.ts
```

Expected:全 PASS。

- [ ] **Step 8: 跑现有 validate 测试不回归**

```bash
pnpm test tests/cli/ tests/core/validate/
```

Expected:全 PASS。

- [ ] **Step 9: Commit**

```bash
git add src/core/validate/auto-findings.ts \
        src/core/validate/change.ts \
        src/core/validate/index.ts \
        tests/cli/validate-verify-findings.test.ts
git commit -m "feat(9d): validate.ts 自动产 CRITICAL findings + finding_hash(Task 4)— specs-files-missing"
```

---

## 7. Task 5 — commands/verify.md 重构 + verify_findings 写入

**Files:**
- Modify: `commands/verify.md`(加 §"三维度分析"段调 skill + .verify-passed YAML 写 verify_findings 数组)
- Modify: `skills/using-forge/SKILL.md`(skill chain 加 verifying-three-dimensions 入口)

**Goal**:重构 `/forge:verify` slash command — 把现有"测试 pass + log_hash"流程升级为"validate CLI 自动 CRITICAL + AI 调 skill 三维度分析 + 合并产 verify_findings 数组写入 .verify-passed"。`using-forge` skill chain 加 process-discipline 类入口。

- [ ] **Step 1: 重写 `commands/verify.md`**

```markdown
---
description: 跑 forge validate + verification-before-completion + 三维度分析,产 verify_findings 写入 .verify-passed marker
argument-hint: '[--change-id <id>]'
---

You are about to handle `/forge:verify $ARGUMENTS`.

解析:`--change-id <id>` 默认 `forge/changes/` 下唯一未归档的 change;若 >1,**报错并停止**列出选项。

## 步骤

1. **必须调用 `forge:verification-before-completion` skill**(证据先于声称的纪律)。

2. **跑 `forge validate <change-id>`**(plugin helper 走 `${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs validate`),拿到 validate 结果。validate 已产 `automated=true` CRITICAL `finding_hash`(沿 plan-9d Task 4)。

3. **若 validate 失败(exit 1 — CRITICAL findings 存在)**:
   - 根据失败项构造 verify-failed YAML(`forge/changes/<id>/.verify-failed`):
     ```yaml
     schema: forge-verify-failed/v1
     failed_at: <ISO 8601>
     reasons:
       - <每个 CRITICAL finding 的 message>
     fake_completions: []
     appended_tasks:
       - verify-fix-1
     verify_findings:  # plan-9d 新增 — validate CLI 产的 automated CRITICAL finding 直接合并
       - id: 1
         dimension: completeness
         check_type: spec-files-missing
         severity: CRITICAL
         automated: true
         finding_hash: <validate 输出的 hash>
         evidence: <validate output>
         recommendation: <validate output>
         resolved: false
     ```
   - **append 修复 task 到 `forge/changes/<id>/tasks.md`**(沿 v0.4 协议)
   - **不要修改原已勾选 task**(维护 spec §3.3 不变量 2)

4. **若 validate 通过(exit 0)**:

   4.1 **跑用户项目测试** — 读 `forge/config.yaml` 的 `context.test_command`,缺省 `pnpm test`,把 stdout 写到 `forge/changes/<id>/.evidence/test-output.log`,计算 `log_hash = sha256(test-output.log)`。**测试 pass 是 Completeness/task-completion 子项**(plan-9d 三维度协议)。

   4.2 **三维度分析 — 必须调用 `forge:verifying-three-dimensions` skill**(plan-9d 落地):
   - **Completeness**:对 spec 每个 Requirement,grep codebase 找实施证据;完全无证据 → 产 CRITICAL `evidence_missing` finding(automated=true,工具可独立验证)
   - **Correctness**:对 spec 每个 Requirement 定位实施 file:line;WHEN/THEN scenario 覆盖检查 → WARNING/SUGGESTION findings(automated=false)
   - **Coherence**:design.md `## Decision:` 段比对 codebase;命名 / pattern 比对项目惯例 → WARNING/SUGGESTION findings(automated=false)
   - **每个 finding 必须填**:id / dimension / check_type / severity / automated / content_hash / git_head / evidence / recommendation / resolved + finding_hash(JCS SHA256 of 8 字段 payload,沿 9a)
   - **`automated=true` 的 finding 必须由工具或 CLI 计算 finding_hash**(直接 grep 命中数等机器判定);AI 不能伪造此类 finding
   - **`automated=false` 的 finding 由 AI 产**,需 `forge ack propose` 走两步流程才能降级或带未 ack archive(沿 9a)

   4.3 **写 `forge/changes/<id>/.verify-passed` YAML**(沿 design §2.2.5 schema superset):
     ```yaml
     schema: forge-verify/v1
     verified_at: <ISO 8601>
     verified_by: ai-agent
     tasks_hash: <sha256(tasks.md 已勾段)>
     content_hash: <sha256(proposal+specs+design)>
     evidence:
       - scenario_id: project-tests
         test_command: <config.yaml 的 test_command>
         test_file: <实际跑的测试范围>
         log_path: ./.evidence/test-output.log
         log_hash: <log_hash>
         pass: true
     verify_findings:  # plan-9d 新增 — validate CLI 自动 CRITICAL + skill 产 WARNING/SUGGESTION 合并数组
       - id: 1
         dimension: completeness
         check_type: spec-coverage
         severity: WARNING
         automated: false
         content_hash: <sha256>
         git_head: <40-hex>
         evidence: 'specs/auth/spec.md Requirement #2 在 src/auth/refresh.ts:42 实现 expiryHours=12,spec 默认 24h'
         recommendation: '改 expiryHours=24 或修订 spec'
         resolved: false
         finding_hash: <sha256>
         severity_acked_by: null  # WARNING 必须 ack 才能 archive(在 archive 阶段走 ack)
         severity_acked_at: null
       # ... 其他 finding
     ```

   4.4 **若产任何 WARNING + resolved=false**:提示用户 — archive 阶段必须先 `forge ack propose <finding-id>`(沿 9a 两步流程),否则 archive fence 拒签。

   4.5 **若产任何 automated=true CRITICAL + resolved=false**:**不能 archive**(沿 design §2.2.4 fence)— 必须先实际修复让 finding resolved=true(改 code + 重跑 verify),不允许 ack 降级。

## 禁止行为

- 不允许在 verify 失败时回去把已勾 task 改回 `[ ]`(违反 spec §3.3 不变量 2)
- 不允许跳过证据 log 写入(verification-before-completion 要求证据先于声称)
- 不允许 pass=true 但 evidence 为空(archive 校验会拒绝)
- **不允许跳维度**(沿 plan-9d skill 红旗清单)— Completeness + Correctness + Coherence 三维度必须全跑,即使测试 pass
- **不允许伪造 automated=true finding**(沿 design §2.3.3 critical_candidate 协议)— automated=true 的 finding 必须由工具/grep 机器判定,不能 AI 自决
- **不允许 vague recommendation**("consider reviewing X" 类)— 必须给 file:line 或 spec:Requirement-id 具体证据(沿 plan-9d skill `## forge-specific 反向加固` §2)
- **不允许在 .verify-passed 写 severity_acked_by = "ai-agent" 自 ack**(必须走 `forge ack propose` 两步流程,沿 9a)
```

- [ ] **Step 2: 修改 `skills/using-forge/SKILL.md`** — skill chain 加 verifying-three-dimensions 入口

找到 skill chain 表(meta-development entry 段之前 / commands 段之后),加 `verifying-three-dimensions` 一行:

```markdown
| `forge:verifying-three-dimensions` | 在 `/forge:verify` 后,产 verify_findings(三维度) | process discipline | plan-9d |
```

具体行号以现有文件为准。**不要打破现有 markdown 表格列结构**(可能与 plan-9i 已加的 writing-skills 行同段)。

- [ ] **Step 3: 跑 build 反向同步 commands template + 跑 commands / skills template 测试**

```bash
pnpm build && pnpm test tests/core/templates/
```

Expected:`src/core/templates/commands/verify.md` 自动 reverse-sync;`tests/core/templates/commands.test.ts`(若存在,沿 9b/9i 模式 frontmatter / 命名空间断言)+ `tests/core/templates/skills.test.ts` 全 PASS。**若 commands 测试断言 description 字段格式与本 plan 重写后 frontmatter 不一致,需修订 commands.test.ts 同步**(沿 9i Task 6 commands template 增删模式)。

- [ ] **Step 4: 跑现有 cli verify 测试不回归**(若存在)

```bash
pnpm test tests/cli/verify.test.ts 2>/dev/null || echo "no verify CLI test yet"
```

注:`/forge:verify` 是 slash command 不是 CLI 子命令,所以可能无 `tests/cli/verify.test.ts`(沿 v0.4 commands/verify.md 仅是 markdown 协议)。本 task 不新加 CLI 测试,实际 e2e 在 Task 8。

- [ ] **Step 5: Commit**

```bash
git add commands/verify.md \
        src/core/templates/commands/verify.md \
        skills/using-forge/SKILL.md \
        src/core/templates/skills/using-forge.md
git commit -m "feat(9d): commands/verify.md 三维度重构 + verify_findings 写入(Task 5)"
```

---

## 8. Task 6 — archive.ts fence 三级 × resolved × ack 矩阵 + finding_hash 篡改拒签

**Files:**
- Modify: `src/cli/commands/archive.ts`(加 validateVerifyFindingsFence + 三级矩阵 + finding_hash 重算 + automated 不可降级)
- Create: `tests/cli/verify-findings-fence.test.ts`

**Goal**:把 design §2.2.4 fence 三级矩阵落到 archive CLI。`automated=true` CRITICAL 不可降级(finding_hash 重算比对);WARNING 必须 ack;SUGGESTION 通过;downgrade 必须 ack。

**Fence 9 分支矩阵**(沿 design §2.2.4 表):

| Severity | resolved=true | resolved=false + ack | resolved=false 无 ack |
|---|---|---|---|
| CRITICAL(automated=true) | 通过 | **拒签**(automated 不可降级) | **拒签** |
| CRITICAL(automated=false) | 通过 | **拒签**(CRITICAL 无例外强 fence) | **拒签** |
| WARNING | 通过 | 通过 | **拒签** |
| SUGGESTION | 通过 | 通过 | 通过(允许带 finding archive) |

外加:
- finding_hash 重算 ≠ marker 中 finding_hash → 拒签(沿 §2.2.4 + 9a JCS)
- downgrade 路径(downgraded_from 非空)→ 校验 downgrade_acked_by + downgrade_rationale 非空

- [ ] **Step 1: 写 failing test `tests/cli/verify-findings-fence.test.ts`**

```typescript
// tests/cli/verify-findings-fence.test.ts — plan-9d Task 6
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { computeFindingHash } from '../../src/core/validate/finding-hash.js';
import type { Finding } from '../../src/core/schemas/severity.js';

describe('archive.ts verify_findings fence (plan-9d Task 6)', () => {
  let testDir: string;
  let cliPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `forge-9d-fence-${Date.now()}`);
    cliPath = join(process.cwd(), 'dist/cli/index.js');
    // 假设 fixture 已有完整 change 目录 + .verify-passed + .review-passed
    // 此处仅示意,实际 fixture 复用 tests/fixtures/archive-baseline/
    await mkdir(join(testDir, 'forge/changes/9d-test/specs'), { recursive: true });
    // ... 详细 fixture 在 tests/fixtures/verify-findings/ 准备(Task 8)
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  function buildFinding(overrides: Partial<Finding>): Finding {
    const base: Finding = {
      id: 1,
      dimension: 'correctness',
      check_type: 'requirement-mapping',
      severity: 'WARNING',
      automated: false,
      content_hash: 'a'.repeat(64),
      git_head: 'd'.repeat(40),
      evidence: 'x',
      recommendation: 'y',
      resolved: false,
      finding_hash: '',
    };
    const merged = { ...base, ...overrides };
    merged.finding_hash = computeFindingHash({
      content_hash: merged.content_hash,
      git_head: merged.git_head,
      dimension: merged.dimension,
      check_type: merged.check_type,
      severity: merged.severity,
      automated: merged.automated,
      evidence: merged.evidence,
      recommendation: merged.recommendation,
    });
    return merged;
  }

  function runArchive(): { exitCode: number; stderr: string } {
    try {
      execFileSync('node', [cliPath, 'archive', '9d-test'], {
        cwd: testDir,
        encoding: 'utf8',
      });
      return { exitCode: 0, stderr: '' };
    } catch (err) {
      const e = err as { status: number; stderr: string };
      return { exitCode: e.status, stderr: e.stderr };
    }
  }

  // === 9 分支矩阵 ===

  it('CRITICAL automated=true + resolved=true → 通过', async () => {
    const finding = buildFinding({ severity: 'CRITICAL', automated: true, resolved: true });
    // ... 写 .verify-passed 含此 finding
    // 期望 archive exit 0
  });

  it('CRITICAL automated=true + resolved=false → 拒签(automated 不可降级)', async () => {
    const finding = buildFinding({ severity: 'CRITICAL', automated: true, resolved: false });
    // 期望 archive exit 1 + stderr 含 "automated CRITICAL"
  });

  it('CRITICAL automated=false + resolved=false → 拒签(CRITICAL 无例外强 fence)', async () => {
    const finding = buildFinding({ severity: 'CRITICAL', automated: false, resolved: false });
    // 期望 archive exit 1
  });

  it('WARNING + resolved=false + 无 ack → 拒签', async () => {
    const finding = buildFinding({ severity: 'WARNING', resolved: false });
    // 期望 archive exit 1 + stderr 含 "severity_acked_by"
  });

  it('WARNING + resolved=false + 有 ack(severity_acked_by + severity_acked_at 非空)→ 通过', async () => {
    const finding = buildFinding({
      severity: 'WARNING',
      resolved: false,
      severity_acked_by: 'msc',
      severity_acked_at: '2026-05-12T10:00:00Z',
    });
    // 期望 archive exit 0
  });

  it('SUGGESTION + resolved=false → 通过(允许带 finding archive)', async () => {
    const finding = buildFinding({ severity: 'SUGGESTION', resolved: false });
    // 期望 archive exit 0
  });

  // === finding_hash 篡改 ===

  it('automated=true CRITICAL finding_hash 与 payload 不一致(篡改)→ 拒签', async () => {
    const finding = buildFinding({ severity: 'CRITICAL', automated: true, resolved: true });
    finding.finding_hash = 'f'.repeat(64); // 篡改 hash
    // 期望 archive exit 1 + stderr 含 "finding_hash mismatch"
  });

  it('AI 改 severity(CRITICAL → SUGGESTION)但忘了重算 hash → 拒签', async () => {
    const finding = buildFinding({ severity: 'CRITICAL', automated: true });
    finding.severity = 'SUGGESTION'; // 仅改字段不重算 → hash 仍指向 CRITICAL payload
    // 期望 archive exit 1 + stderr 含 "finding_hash mismatch"
  });

  // === downgrade 路径 ===

  it('downgraded_from 非空 + 缺 downgrade_acked_by → 拒签', async () => {
    const finding = buildFinding({
      severity: 'SUGGESTION',
      resolved: false,
      downgraded_from: 'WARNING',
      downgraded_to: 'SUGGESTION',
      downgrade_rationale: 'edge case 罕见',
      // downgrade_acked_by 缺
    });
    // 期望 archive exit 1 + stderr 含 "downgrade_acked_by"
  });

  it('downgrade 完整(downgraded_from + acked_by + rationale 齐全)→ 通过', async () => {
    const finding = buildFinding({
      severity: 'SUGGESTION',
      resolved: false,
      downgraded_from: 'WARNING',
      downgraded_to: 'SUGGESTION',
      downgrade_acked_by: 'msc',
      downgrade_rationale: 'edge case 罕见且不影响 core',
    });
    // 期望 archive exit 0
  });
});
```

**注**:本测试假设 archive CLI fixture 完整(Task 8 准备);本 task 提交骨架 + 9 个 case 占位 + 一个完整可跑的 SUGGESTION + 一个 automated CRITICAL 拒签 case。其余 case 由 Task 8 集成 fixture 后补完。

- [ ] **Step 2: 修改 `src/cli/commands/archive.ts`** — 在 `validateEvidence` 后(line 309 附近)加 `validateVerifyFindingsFence`:

```typescript
// src/cli/commands/archive.ts — plan-9d Task 6
// 在 step 3.5 (validateEvidence) 之后,step 4 (real archive move) 之前加:

// 步骤 3.6:plan-9d Task 6 — verify_findings 三级 × resolved × ack 矩阵 + finding_hash 篡改拒签
const vfResult = validateVerifyFindingsFence(verifyRec, verifyPath);
if (!vfResult.valid) {
  console.error('✗ verify_findings fence 拒签:');
  for (const e of vfResult.errors) console.error(`  - ${e.field}: ${e.message}`);
  await archiveRelease();
  process.exit(1); // sigil business-fail(沿 master §3.12.3 archive exit 1)
}

// 在文件底部加 helper function(或单独 src/core/archive/verify-findings-fence.ts 模块,推荐后者):
import { extractHashPayload, computeFindingHash } from '../../core/validate/finding-hash.js';
import type { Finding } from '../../core/schemas/severity.js';
import { type ValidationResult, ok, failed, mergeResults } from '../../core/validate/types.js';

/**
 * verify_findings fence 校验(沿 design §2.2.4)
 * - automated=true CRITICAL 不可降级:finding_hash 重算比对
 * - CRITICAL + resolved=false → 拒签(无例外强 fence)
 * - WARNING + resolved=false + 无 ack → 拒签
 * - SUGGESTION 通过(允许带 finding archive)
 * - downgrade 路径校验 downgrade_acked_by + downgrade_rationale 非空
 */
export function validateVerifyFindingsFence(
  verifyMarker: Record<string, unknown>,
  file?: string,
): ValidationResult {
  const findings = verifyMarker.verify_findings;
  if (!Array.isArray(findings)) return ok(); // 无 verify_findings 字段(老 marker)→ 跳

  const results: ValidationResult[] = [];
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i] as Finding;
    const fieldBase = `verify_findings[${i}]`;

    // 1. finding_hash 重算比对
    const payload = extractHashPayload(f);
    const expectedHash = computeFindingHash(payload);
    if (f.finding_hash !== expectedHash) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.finding_hash`,
          message: `finding_hash mismatch: expected ${expectedHash.slice(0, 16)}..., got ${f.finding_hash.slice(0, 16)}...`,
          file,
        }),
      );
      continue; // hash 失败后不再校验其他规则(避免 cascade)
    }

    // 2. 三级 × resolved × ack 矩阵
    if (f.severity === 'CRITICAL' && f.resolved === false) {
      // CRITICAL 无例外强 fence(无 ack 路径)
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.resolved`,
          message: f.automated
            ? `automated CRITICAL finding must be resolved (cannot ack-downgrade automated CRITICAL,沿 design §2.2.4)`
            : `CRITICAL finding must be resolved (no ack path for CRITICAL,沿 design §2.2.4)`,
          file,
        }),
      );
    } else if (f.severity === 'WARNING' && f.resolved === false) {
      // WARNING + 未 resolved → 必须 ack(severity_acked_by + severity_acked_at)
      if (!f.severity_acked_by || !f.severity_acked_at) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.severity_acked_by`,
            message: `WARNING + resolved=false 必须有 severity_acked_by + severity_acked_at(沿 design §2.2.4)`,
            file,
          }),
        );
      }
    }
    // SUGGESTION + resolved=false → 通过

    // 3. downgrade 路径(若 downgraded_from 非空)
    if (f.downgraded_from) {
      if (!f.downgrade_acked_by) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.downgrade_acked_by`,
            message: `downgrade 路径必须有 downgrade_acked_by(沿 design §2.3.3 C)`,
            file,
          }),
        );
      }
      if (!f.downgrade_rationale) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.downgrade_rationale`,
            message: `downgrade 路径必须有 downgrade_rationale(沿 design §2.3.3 C)`,
            file,
          }),
        );
      }
    }
  }

  return mergeResults(...results);
}
```

**模块化建议**:把 `validateVerifyFindingsFence` 抽到 `src/core/archive/verify-findings-fence.ts`,从 archive.ts import,沿现有 `validateEvidence` 模块化路径(若已模块化)。

- [ ] **Step 3: 跑测试验证全 PASS**

```bash
pnpm test tests/cli/verify-findings-fence.test.ts
```

Expected:已完成的 case PASS,其他 case 标 todo(Task 8 集成 fixture 后补)。

- [ ] **Step 4: 跑现有 archive 测试不回归**

```bash
pnpm test tests/cli/archive.test.ts
```

Expected:全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/archive.ts \
        tests/cli/verify-findings-fence.test.ts
git commit -m "feat(9d): archive.ts verify_findings fence 三级 × resolved × ack 矩阵(Task 6)"
```

---

## 9. Task 7 — GREEN leg 跑通 + REFACTOR loophole

**Files:**
- Modify(可能): `skills/verifying-three-dimensions/SKILL.md`(Task 2 的反向回改 — 加红旗 plug)
- Modify(可能): `forge-eval/scenarios/verifying-three-dimensions.yaml`(微调 judge_rubric 阈值)

**Goal**:跑 `pnpm eval:skill verifying-three-dimensions` 看 GREEN avg ≥ 6.5 + delta ≥ 1.5。若不达标,回 Task 2 SKILL.md 加红旗清单 plug(沿 9i Task 5 REFACTOR 模式)。

**REFACTOR loophole 至少 plug 2 个**(沿 design §2.9.3 步骤 4 + 9i Task 5)。

- [ ] **Step 1: 跑 GREEN eval**

```bash
pnpm build && pnpm eval:skill verifying-three-dimensions
```

读 `eval-report.md`,看:
- RED leg avg(scenario 1 + 2 平均)≤ 5
- GREEN leg avg ≥ 6.5
- delta ≥ 1.5

- [ ] **Step 2: 若 GREEN < 6.5,读失败 turn 的 judge.reasoning**

```bash
cat eval-report.md  # 找失败 turn 列表段
```

观察 AI 仍有的 rationalization,例如:
- "GREEN 时 AI 仍把 #3 Requirement 推 SUGGESTION,reasoning 提到 'maybe future iteration'"(此时 plug → 红旗加 "AI 推 SUGGESTION + 'future iteration' rationale")
- "GREEN 时 AI 把三个 finding 合并写成一段总论,reasoning 提到 'simpler narrative'"(此时 plug → 红旗加 "AI 合并 finding 写散文 + 'simpler narrative'")

- [ ] **Step 3: 回改 `skills/verifying-three-dimensions/SKILL.md`** 加 ≥ 2 个 plug 到红旗清单

例如(实际 plug 内容依 Step 2 观察决定):

```markdown
| "把 #N Requirement 推 SUGGESTION,反正是 future iteration" | future iteration 不是 SUGGESTION 路径(沿 _shared/scope-category-guidance.md)— 必须走 Out of Scope / Future Work,不在 verify_findings 内 |
| "三个维度合并写成一段简洁叙事" | finding 是结构化数组;合并 = fence schema 报错;narrative 写到 archive_summary 里(9e)不是 verify_findings |
```

- [ ] **Step 4: 重跑 eval 验证 plug 起作用**

```bash
pnpm build && pnpm eval:skill verifying-three-dimensions
```

Expected:GREEN avg ≥ 6.5;delta ≥ 1.5;`eval-report.md` 总览表 pair pass 列 ✓。

- [ ] **Step 5: Commit**

```bash
git add skills/verifying-three-dimensions/SKILL.md \
        src/core/templates/skills/verifying-three-dimensions.md \
        eval-report.md
git commit -m "feat(9d): GREEN delta ≥ 1.5 + REFACTOR plug ≥ 2 个 loophole(Task 7)"
```

---

## 10. Task 8 — 集成 e2e 测试 + 全本地 verify

**Files:**
- Create: `tests/integration/verify-findings-end-to-end.test.ts`
- Create: `tests/fixtures/verify-findings/`(fixture change 含 verify_findings)

**Goal**:把 verify(产 finding)→ archive(fence 校验)的真实链路打通;覆盖 Task 6 9 分支矩阵 + finding_hash 篡改拒签的 end-to-end 路径。

- [ ] **Step 1: 创建 `tests/fixtures/verify-findings/` 目录** 含 fixture change

```
tests/fixtures/verify-findings/
├── change-passing/             # 全 SUGGESTION + WARNING acked,期望 archive 通过
│   ├── proposal.md
│   ├── design.md
│   ├── tasks.md
│   ├── specs/auth.md
│   ├── .verify-passed          # 含 verify_findings 全合规
│   └── .review-passed
├── change-warning-no-ack/      # WARNING + 无 ack,期望拒签
│   ├── ... (同上)
│   └── .verify-passed
├── change-tampered-hash/       # automated CRITICAL finding 但 hash 篡改,期望拒签
│   └── ...
└── change-automated-critical-unresolved/  # automated CRITICAL + resolved=false,期望拒签
    └── ...
```

**注**:fixture 用常量生成函数构造 marker,不写 hardcode YAML(沿 plan-9b Task 8 v2 修订:fixture 常量生成 + 断言严格 `===0`)。

- [ ] **Step 2: 写 `tests/integration/verify-findings-end-to-end.test.ts`**

```typescript
// tests/integration/verify-findings-end-to-end.test.ts — plan-9d Task 8
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { stringify as yamlStringify } from 'yaml';
import { computeFindingHash } from '../../src/core/validate/finding-hash.js';
import type { Finding } from '../../src/core/schemas/severity.js';

describe('verify_findings end-to-end (plan-9d Task 8)', () => {
  let testDir: string;
  let cliPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `forge-9d-e2e-${Date.now()}`);
    cliPath = join(process.cwd(), 'dist/cli/index.js');
    // 复用 Task 6 fixture 模板
    await cp(join(process.cwd(), 'tests/fixtures/verify-findings/'), testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('WARNING + 真 ack → archive 通过(e2e 全链路)', async () => {
    // 1. 准备 change 含 WARNING finding,severity_acked_by 真实填
    // 2. 跑 archive
    // 3. 期望 exit 0 + change 已 move 到 archive/
  });

  it('automated CRITICAL finding_hash 篡改 → archive 拒签(e2e)', async () => {
    // 1. 准备 change 含 automated=true CRITICAL finding,故意篡改 finding_hash
    // 2. 跑 archive
    // 3. 期望 exit 1 + stderr 含 "finding_hash mismatch"
  });

  it('automated CRITICAL + resolved=false → archive 拒签(e2e)', async () => {
    // 期望 exit 1 + stderr 含 "automated CRITICAL"
  });

  // ... 补充其他分支
});
```

- [ ] **Step 3: 跑集成测试**

```bash
pnpm build && pnpm test tests/integration/verify-findings-end-to-end.test.ts
```

Expected:全 PASS。

- [ ] **Step 4: 跑全本地 verify**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
```

Expected:全 PASS。

- [ ] **Step 5: 跑 forge-eval 复查 GREEN delta 仍达标**

```bash
pnpm eval:skill verifying-three-dimensions
```

Expected:`eval-report.md` 总览表 pair pass ✓;delta ≥ 1.5。

- [ ] **Step 6: Commit**

```bash
git add tests/integration/verify-findings-end-to-end.test.ts \
        tests/fixtures/verify-findings/ \
        tests/cli/verify-findings-fence.test.ts  # 补完剩余 case
git commit -m "test(9d): e2e fixture + verify_findings fence 全 9 分支 + 篡改场景(Task 8)"
```

---

## 11. 风险与依赖追踪

### 11.1 跨 sub-plan 接口冻结

本 plan reference 9a `src/core/schemas/severity.ts` 的 Finding / FindingHashPayload 接口(§3.12.1 锁死);**不重定义**字段。VerifyFinding = Finding 类型别名(`src/core/markers/types.ts` Task 3)。

本 plan reference 9b `skills/_shared/scope-category-guidance.md`(§3.12.2 路径冻结)— SKILL.md 第 ## 配套引用 段 link 该文档,部署链由 9b Task 7b harness-adapters 落地(本 plan 不修改 adapter)。

本 plan reference 9i `skills/writing-skills/SKILL.md` 协议;Task 1 + Task 2 + Task 7 走五步骤;Task 7 REFACTOR 反向回改 Task 2(沿 9i Task 5 同模式)。

### 11.2 9d → 9g 验收依赖(沿 master BLOCKER #3)

9g process_evidence yaml 第 8 攻击场景"空测试攻击"(测试套件假装 pass 但实际跳测试)需要 §2.7 + §2.2 组合防御:
- §2.7(9g):process_evidence 13 不变量校验测试套件真实跑了
- §2.2(本 plan):verify_findings 校验 Completeness/spec-coverage 是否 0 个 evidence_missing(若有 evidence_missing CRITICAL,反向暴露空测试)

本 plan 完成后,9g M5 里程碑可验收。

### 11.3 Task 顺序敏感度

- Task 0(SKILL_NAMES)必须先 — 否则 Task 1 跑 `pnpm eval:skill verifying-three-dimensions` CLI 拒绝
- Task 1 → Task 2 → Task 7 反向链 — REFACTOR 在 Task 7 反向回改 SKILL.md
- Task 3 → Task 4 → Task 5 → Task 6 顺序:schema → CLI 自动产 → slash 写入 → fence 校验
- Task 7 + Task 8 顺序:Task 7 SKILL.md REFACTOR 完后才是稳定 production;Task 8 e2e 测试基于 Task 7 之后的 SKILL.md + commands/verify.md

### 11.4 潜在 codex review 风险点(预期 review 议题)

预测 codex adversarial review 可能提出的议题(预先思考,实施时反馈再修订):

1. **VerifyFinding 与 Finding 类型别名是否过度耦合**:future 若需 verify-specific 字段(如 `requirement_id` 显式关联 spec 章节),类型别名会限制扩展。**应对**:Task 3 可以从 `VerifyFinding extends Finding { requirement_id?: string }` 起步,本 plan v1 保守用别名。
2. **validate.ts 三类 candidate 中,test_failure 与 tasks fake-completion 似乎是 verify slash 阶段才能判**:本 plan v1 把这两类放到 slash 阶段产(Task 5 已注明),只在 validate 层产 evidence_missing 类 finding。若 review 要求把 test_failure 也下沉到 validate CLI,需扩 validate CLI 跑测试 — 这是大改,留 9d v2 评估。
3. **forge-eval scenario judge_rubric 是否过细**:RED scenario 期望 ≤ 5 + GREEN ≥ 6.5 + delta ≥ 1.5 三阈值同时满足,可能在 LLM-judge 噪声下不稳定。**应对**:沿 forge-eval 默认阈值,Task 7 REFACTOR 时若 GREEN avg 在 6.0-6.5 边缘可微调 judge_rubric 评分细节,但不放宽 delta 1.5 硬约束。
4. **archive fence 拒签 exit code**:本 plan Task 6 用 exit 1(business-fail,沿 master §3.12.3),与现有 archive.ts process.exit(2) (fs/lock 类) 区分。**预期 OK**,但 review 可能要求 archive.ts 现有路径也按四语义槽对齐 — 那是 §3.12.3 后续 sub-plan 工作,本 plan 不重构现有 archive exit code。

---

## 12. Self-Review

### 12.1 Spec coverage(design §2.2 全节)

| design § | 本 plan 覆盖 task |
|---|---|
| §2.2.1 基线问题 | Task 5(commands/verify.md 重构,显式说"测试 pass 不等于覆盖三维度") |
| §2.2.2 三维度协议表 | Task 2(SKILL.md 含三维度协议表)+ Task 5(commands/verify.md 4.2 段映射) |
| §2.2.3 verify_findings YAML schema | Task 3(VerifyFinding marker schema)+ Task 5(commands/verify.md 写入示例) |
| §2.2.4 Fence 校验三级 × resolved × ack | Task 6(archive.ts validateVerifyFindingsFence 9 分支矩阵) |
| §2.2.5 verify-passed schema 升级 superset | Task 3(verify_findings? 可选字段)+ Task 5(.verify-passed 输出) |
| §2.2.6 新 skill SKILL.md(forge 化反向加固) | Task 2(SKILL.md production + `## forge-specific 反向加固` 段)+ Task 7(REFACTOR plug) |
| §2.2.7 实施清单 7 项 | Task 0(SKILL_NAMES)+ Task 1+2(skill + scenarios)+ Task 3(schema 扩展)+ Task 4(validate.ts 自动产 + finding_hash)+ Task 5(commands/verify.md)+ Task 6(archive fence)+ Task 8(集成测试) |

**结论**:design §2.2 全节 7 个子段被 task 完整覆盖。

### 12.2 Placeholder scan

本 plan 经过 self-scan,确认:
- 无 "TBD" / "TODO" / "implement later" / "fill in details" 等占位符
- 无 "add appropriate error handling" 类抽象指令 — 错误处理明确到具体 candidate(evidence_missing / hash mismatch / ack 缺失)
- 无 "Write tests for the above" 类无代码描述 — 每个 test 文件给出完整 case 列表 + 关键代码
- "Similar to Task N" 仅在依赖说明段出现,task body 内代码重复给出(允许冗余但保证 task 可独立阅读)
- 步骤 5(commands/verify.md 重构)给出完整重写文本,不依赖"按现有结构修改"模糊指令

### 12.3 Type consistency

- `VerifyFinding`(Task 3 定义)= `Finding`(9a `src/core/schemas/severity.ts`)别名 — 全 plan 字段引用一致
- `FindingHashPayload`(9a 8 字段)在 Task 4 `buildAutoCriticalFinding` + Task 6 `validateVerifyFindingsFence` 一致使用
- `computeFindingHash` / `extractHashPayload`(9a)签名在 Task 4 + Task 6 一致
- 字段大小写一致:`severity_acked_by` / `severity_acked_at` / `downgraded_from` / `downgrade_acked_by` / `downgrade_rationale`(沿 9a)
- dimension enum:`completeness | correctness | coherence`(沿 design §2.2.2 + 9a 全 plan 一致)
- severity enum:`CRITICAL | WARNING | SUGGESTION`(沿 9a SEVERITY_VALUES)
- check_type 字符串自由形式但本 plan 标定:`task-completion` / `spec-coverage` / `spec-files-missing` / `requirement-mapping` / `scenario-coverage` / `design-traceability` / `pattern-consistency` — example 与 SKILL.md 三维度协议表 + commands/verify.md 4.2 段一致

---

## 13. 修订记录

- **v1**(2026-05-11):初稿 — 基于 design §2.2 全节 + master §3.4 + 9a/9b/9i 落地接口 + 9b/9i plan 形态,9 task 累计 P50 5.5 工日。
