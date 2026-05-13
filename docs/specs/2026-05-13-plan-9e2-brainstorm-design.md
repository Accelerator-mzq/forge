# Plan-9e2 brainstorm design — ProcessEvidenceSummary 真实统计接入

> **Status**: brainstorming 产物,作为 writing-plans 阶段的输入。
> **Date**: 2026-05-13
> **Author**: msc(brainstorm 与 Claude 协作)
> **Master spec 引用**:`docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §2.4.3(archive_summary YAML 字面)+ §2.7(process_evidence schema + 14 不变量)+ §3.4.4.1(legacy 豁免表)
> **Master plan 引用**:`docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` §3.5 line 308-310(9e1 / 9e2 拆分)+ Week 5 line 593(9e2 必须在 9g.3 完成后启动)
> **前置**:plan-9e1(archive_summary base + placeholder)/ plan-9g(crossCuttingFenceCheck 填实 + 14 不变量 fence)
> **后置**:plan-9z(release polish);v1.1 forge backlog index 消费 archive_summary.yaml

---

## 0.0 文档状态声明

**本文档是 brainstorming 阶段产物,描述 plan-9e2 的"实施清单"而非"已实施成果"。** 全文出现的"9e2 改"、"扩 status enum"、"加 summarizeProcessEvidence"、"严格 schema validator"等表述,都是 9e2 writing-plans 阶段拆 task + 实施时的目标,**当前代码库尚未包含这些改动**。

- `src/core/archive/fence.ts:25-30` 当前 FenceInvariantResult 仅 `{ invariant, ok, reason }` 三字段(9g 现状,无 status enum)
- `src/core/archive/summary-builder.ts:118` 当前硬写 `process_evidence_summary: PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY`,buildArchiveSummary 签名未含 fenceResult 入参
- `src/core/validate/archive-summary-schema.ts:651-665` 当前仅校验 `process_evidence_summary` 是 object,不校验内部字段
- `src/cli/commands/archive.ts:231` 当前 fenceResult 用完即丢,未传给 buildArchiveSummary
- `src/core/templates/commands/archive.md` 当前 line 53/66/141/144 仍带 "9e2 待 9g 完成后" 字面

**本文档是 plan-9e2 writing-plans 阶段的输入 spec**,不是验证当前代码状态的 checklist。

---

## 0. 目的与边界

本文档是 `superpowers:brainstorming` skill 流程的产物,**记录 plan-9e2 实施路径选型决策**。

- **Spec 层(不动)**:`docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §2.4.3 archive_summary YAML 字面 / §2.7 process_evidence schema + 14 不变量 / §3.4.4.1 legacy 豁免表(14 不变量中 #1-8/10/13 跳过共 10 个,#9/11/12/14 保留共 4 个)已定型,本文档完全沿用。
- **Plan 层(本文档落地)**:三态信息流归属、字段语义、schema 校验严格度、文档更新边界 — 这些是 spec → plan 之间的**实现路径选型**。
- **Task 层(writing-plans 阶段产出)**:本文档不拆完整 Task。后续由 `superpowers:writing-plans` skill 基于本文档生成 `docs/plans/2026-05-13-plan-9e2-process-evidence-summary.md`,内含每个 Task 的 inline 完整代码(沿 plan-9j Pattern A / plan-9g 同教训)。

---

## 1. Brainstorming 决策摘要

| # | 决策点 | 选定 | 选定理由 |
|---|---|---|---|
| Q1 | FenceInvariantResult 三态信息流归属 | **扩 `status: 'pass' \| 'fail' \| 'legacy-skip'` enum 字段,语义住 fence 层** | legacy 豁免表(哪些 invariant 跳)只在 fence.ts 内单源维护(LEGACY_EXEMPT_INVARIANTS 常量);类型安全;superset additive 不破 plan-9g 已写 ok/reason 代码 |
| Q2 | `invariants_failed` 字段语义 | **保留字段,值永远 = 0**(对称性 + 防未来 fail-soft 模式) | 字段已在 9e1 schema 立(archive-summary.ts:64-73),不破 backwards-compat;archive_summary.yaml 是用户 review 产物,字段对称直观;未来若 fence 改 fail-soft(部分 invariant fail 但仍写 summary)字段已就位 |
| Q3 | placeholder=false 路径 schema 校验严格度 | **严格:三字段必填 + number + 值域 [0, EXPECTED_INVARIANT_COUNT] + sum = EXPECTED_INVARIANT_COUNT 不变式;常量派生自 `FENCE_INVARIANT_NAMES.length` 自动跟随 invariant 数演化** | 9g 14 不变量是产物完整性核心,sum 不变式破 = bug 或 tamper 直接拒签;archive_summary.yaml 是 v1.1 backlog index 上游,后续消费者期望字段完整;与 plan-9d / 9j schema validator 严格化路径一致 |
| Q4 | archive.md 文档更新边界 | **4 处文案校正 + 短段解释字段语义**(legacy_exempt 引 master §3.4.4.1 表 / invariants_failed 永远 = 0 设计理由) | archive.md 是 slash command 模板被 `forge init` 写入用户项目,基本字段语义必须可读;但"具体哪 10 个被跳"展开是 master spec 工作,文档引到表即可不内嵌(YAGNI) |

---

## 2. 架构 + 数据流

### 2.1 数据流图

```
archive.ts:231
   │
   ▼
crossCuttingFenceCheck(changeRoot)
   │  ← 读 verify marker process_evidence_unavailable_legacy flag(fence.ts:115)
   │
   ▼ FenceCheckResult { ok, results: [14×{invariant, ok, status, reason}] }
   │
   │  status 取值:
   │   - 'pass'         真过校验(non-legacy 全 / legacy 路径下保留的 #9/11/12/14)
   │   - 'fail'         CRITICAL,fence.ok=false → archive exit 1 终止
   │   - 'legacy-skip'  legacy 路径下沿 §3.4.4.1 跳的 #1-8/10/13(共 10 个)
   │
   ▼ (仅 fence.ok=true 路径,fail 路径已 exit 1)
buildArchiveSummary(verifyMarker, reviewMarker, changeDir, changeId, fenceResult, opts)
   │
   ▼
summarizeProcessEvidence(fenceResult): ProcessEvidenceSummary
   │  passed = results.filter(r => r.status === 'pass').length
   │  failed = results.filter(r => r.status === 'fail').length    // 永远 0(architectually unreachable in write path)
   │  exempt = results.filter(r => r.status === 'legacy-skip').length
   │  不变式: passed + failed + exempt === FENCE_INVARIANT_NAMES.length
   │
   ▼
ArchiveSummary.process_evidence_summary = {
   placeholder: false,
   invariants_passed: <number>,
   invariants_failed: 0,
   legacy_exempt: <number>,
}
   │
   ▼ .tmp 写入 → validateArchiveSummarySchema(严格校验) → rename 正式 .yaml
```

### 2.2 关键不变式

1. **sum 不变式**:`invariants_passed + invariants_failed + legacy_exempt === FENCE_INVARIANT_NAMES.length`,fence 层产 + schema 层校验双源
2. **legacy_exempt 取值**:0(非 legacy)或 10(legacy,沿 §3.4.4.1 #1-8/10/13);**不硬编码 10**,从 fence status='legacy-skip' 折数
3. **`process_evidence_unavailable_legacy` flag 单源**:来源 verify marker(plan-9j `--resign-markers` 写入或 v0.4 升级时手填),fence.ts:115 单源读取,9e2 信任不二次校验
4. **invariants_failed 永远 = 0**:fence.ok=false 时 archive.ts:231 已 exit 1,buildArchiveSummary 永远不执行;字段保留对称 + 防未来 fail-soft

### 2.3 模块改动 surface(5 文件 + 1 文档)

| 文件 | 改动量 | 性质 |
|---|---|---|
| `src/core/archive/fence.ts` | +5 行 | FenceInvariantResult 加 status 字段 + LEGACY_EXEMPT_INVARIANTS 常量 + mapper 重写 |
| `src/core/archive/process-evidence-fence.ts` | ~5 行 | 若 fence.ts 改动需 propagate(实际可能无改 — mapper 在 fence.ts 内) |
| `src/core/archive/summary-builder.ts` | +30 行 | summarizeProcessEvidence 新私有 fn + buildArchiveSummary 签名扩 fenceResult |
| `src/core/validate/archive-summary-schema.ts` | +25 行 | placeholder=false 严格校验(必填 / 值域 / sum 不变式) |
| `src/cli/commands/archive.ts` | ~3 行 | fenceResult 透传到 buildArchiveSummary |
| `src/core/templates/commands/archive.md` | ~10 行 | 4 处文案校正 + 短段解释字段语义 |

---

## 3. 组件契约

### 3.1 `FenceInvariantResult`(fence.ts:25-30 扩 status)

```ts
// 改前(plan-9g 现状)
export interface FenceInvariantResult {
  invariant: string;
  ok: boolean;
  reason: string;
}

// 改后(plan-9e2)
export interface FenceInvariantResult {
  invariant: string;            // 'fence-1' ... 'fence-14'(plan-9g 现有)
  ok: boolean;                  // plan-9g 现有,保留不动(backwards-compat)
  status: 'pass' | 'fail' | 'legacy-skip';  // 9e2 新增
  reason: string;               // plan-9g 现有,保留不动
}
```

**不变式**:`status === 'fail' ⟺ ok === false`(ok 与 status 是冗余字段,9e2 mapper 主动维持不变式,**不**让 ok 从 status 计算;保留 ok 兼容 plan-9g 已写代码,deprecation 留给 plan-9z polish)。

### 3.2 `crossCuttingFenceCheck()` mapper 重写(fence.ts:197-205)

```ts
// 9e2 新增模块级常量(沿 master §3.4.4.1 表)
export const LEGACY_EXEMPT_INVARIANTS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 10, 13]);
// 注:#9/11/12/14 不在豁免表,legacy 路径下仍强制校验

// 改后 mapper
const results: FenceInvariantResult[] = FENCE_INVARIANT_NAMES.map((name) => {
  const inv = parseInt(name.replace('fence-', ''), 10);
  const fail = criticalFindings.find((f) => f.invariant === inv);
  if (fail) {
    return { invariant: name, ok: false, status: 'fail', reason: fail.message };
  }
  if (legacyExempt && LEGACY_EXEMPT_INVARIANTS.has(inv)) {
    return { invariant: name, ok: true, status: 'legacy-skip', reason: 'legacy-exempt per master §3.4.4.1' };
  }
  return { invariant: name, ok: true, status: 'pass', reason: 'pass' };
});
```

`LEGACY_EXEMPT_INVARIANTS` 导出,供测试断言用(`expect(LEGACY_EXEMPT_INVARIANTS.size).toBe(10)`)。

### 3.3 `summarizeProcessEvidence()`(summary-builder.ts 新私有 fn)

```ts
function summarizeProcessEvidence(fenceResult: FenceCheckResult): ProcessEvidenceSummary {
  const passed = fenceResult.results.filter(r => r.status === 'pass').length;
  const failed = fenceResult.results.filter(r => r.status === 'fail').length;
  const exempt = fenceResult.results.filter(r => r.status === 'legacy-skip').length;
  // 注:不变式断言由 archive-summary-schema validator 单点把守
  //     此 fn 不主动 throw(避免双源校验路径分歧)
  return {
    placeholder: false,
    invariants_passed: passed,
    invariants_failed: failed,
    legacy_exempt: exempt,
  };
}
```

### 3.4 `buildArchiveSummary()` 签名扩(summary-builder.ts:51-57)

```ts
export async function buildArchiveSummary(
  verifyMarker: Record<string, unknown>,
  reviewMarker: Record<string, unknown>,
  changeDir: string,
  changeId: string,
  fenceResult: FenceCheckResult,           // ← 9e2 新增入参
  opts: BuildArchiveSummaryOptions = {},
): Promise<ArchiveSummary>
```

内部 line 118 `process_evidence_summary: PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY` → `summarizeProcessEvidence(fenceResult)`。

`PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY` 常量保留(测试 fixture 可能引用),但生产路径不再使用 — 注释更新为"9e2 已接真实统计,本常量仅供测试 fixture 使用"。

### 3.5 `archive-summary-schema.ts` 严格校验扩(line 651-665 区段)

```ts
// 沿 fence.ts 导入派生常量(自动跟随 invariant 数演化)
import { FENCE_INVARIANT_NAMES } from '../archive/fence.js';
const EXPECTED_INVARIANT_COUNT = FENCE_INVARIANT_NAMES.length;

// placeholder=false 路径严格校验扩
if (peSummary.placeholder === false) {
  // 1. 三字段必填 + number
  for (const field of ['invariants_passed', 'invariants_failed', 'legacy_exempt'] as const) {
    if (typeof peSummary[field] !== 'number') {
      errors.push({
        field: `process_evidence_summary.${field}`,
        message: `required number when placeholder=false`,
      });
    }
  }
  // 仅当前面类型检查通过才走值域 + 不变式(避免 NaN 干扰)
  if (typeof peSummary.invariants_passed === 'number'
      && typeof peSummary.invariants_failed === 'number'
      && typeof peSummary.legacy_exempt === 'number') {
    // 2. 值域 [0, EXPECTED_INVARIANT_COUNT]
    for (const field of ['invariants_passed', 'invariants_failed', 'legacy_exempt'] as const) {
      const v = peSummary[field];
      if (v < 0 || v > EXPECTED_INVARIANT_COUNT) {
        errors.push({
          field: `process_evidence_summary.${field}`,
          message: `must be in [0, ${EXPECTED_INVARIANT_COUNT}]`,
        });
      }
    }
    // 3. sum 不变式
    const sum = peSummary.invariants_passed + peSummary.invariants_failed + peSummary.legacy_exempt;
    if (sum !== EXPECTED_INVARIANT_COUNT) {
      errors.push({
        field: 'process_evidence_summary',
        message: `sum invariant: ${sum} !== ${EXPECTED_INVARIANT_COUNT}`,
      });
    }
  }
}
// placeholder=true 路径不变(9e1 容忍)
```

### 3.6 `archive.ts:231` fenceResult 透传

```ts
// archive.ts:231(plan-9g 现状)
const fenceResult = await crossCuttingFenceCheck(join(forgeRoot, 'changes', changeId));
if (!fenceResult.ok) {
  // exit 1
}
// ... 中间步骤(marker 校验等)...

// 9e2 改:buildArchiveSummary 调用处加 fenceResult 入参
const summary = await buildArchiveSummary(
  verifyMarker, reviewMarker, changeDir, changeId,
  fenceResult,                            // ← 9e2 新增
  { archivedAt },
);
```

### 3.7 `archive.md` 文档更新

**4 处文案校正**:
- line 53:`process_evidence_summary`(9e1 placeholder,9e2 接 9g 真实统计)→ 改为字段语义说明
- line 66:`**Security:** [process_evidence:placeholder] ... (9e2 完成后改为真实统计)`→ 改为真实输出 sample `[process_evidence:passed=4/failed=0/legacy=10]`
- line 141:`- **9e2**(待 9g 完成后):...` → 标"已完成"或删
- line 144:merge 顺序提示 `9e1 → 9g → 9e2` → 加"已完成"注脚

**短段解释字段语义(新增 5-8 行)**:
- `invariants_passed`:fence 14 不变量真过的数(non-legacy 路径下通常 = 14)
- `invariants_failed`:**v1.0 永远 = 0**;fence 任一不变量失败时 archive 直接 exit 1 拒签,summary 不写入。字段对称保留,未来 v1.1+ 若引入 fail-soft 模式可填非零
- `legacy_exempt`:`process_evidence_unavailable_legacy: true` 路径下被精确豁免的不变量数(沿 master §3.4.4.1 表,通常 = 10),非 legacy 路径恒 = 0

---

## 4. 错误处理

### 4.1 错误路径矩阵

| 场景 | 触发点 | 后果 | exit code |
|---|---|---|---|
| fence CRITICAL finding 出现 | crossCuttingFenceCheck | results[i].status='fail' / ok=false → archive 拦截 | 1(沿 master §3.12.3 fence business-fail) |
| legacy flag 误填 | fence.ts:115 读 flag | legacy 豁免路径,#1-8/10/13 标 'legacy-skip',真实 process_evidence 校验绕过 | 0(假阴性 — 但语义上是 `forge upgrade --resign-markers` 责任,fence 不二次判断) |
| sum 不变式破(fence 内部 bug) | summarizeProcessEvidence 不主动 throw | 写入 .tmp → archive-summary-schema 严格校验拒签 | 3(corrupt) |
| .tmp 内容 tamper | validateArchiveSummarySchema | 必填字段缺 → errors → archive 拒签 | 3(corrupt) |
| 派生常量与 fence 出 result 数不一致 | summarizeProcessEvidence | sum 校验失败 → exit 3 | 3 |

### 4.2 关键路径决策

**1. `summarizeProcessEvidence` 不主动 throw**
不在 builder 内 assert sum 不变式 — 让 archive-summary-schema 单点把守(避免双源校验路径分歧)。实际效果:fence 内部 bug → .tmp 写入异常 → schema validator 拒签 → exit 3。

**2. backwards-compat for plan-9g 现有 caller**
`FenceInvariantResult.ok` 字段保留(不删),plan-9g 已写代码继续工作。但 `status === 'fail' ⟺ ok === false` 不变式有"重复字段"风险 — 由 9e2 测试用断言守住,后续 plan-9z polish 可考虑 ok deprecation。

**3. legacy flag 单源信任**
fence.ts:115 读 marker 内 `process_evidence_unavailable_legacy: true` 即信任,**不做二次判断**(不查 marker version 是否 < 1.0.0 等)。这是 plan-9j `--resign-markers` 的责任。9e2 只消费 flag,不验证。

**4. resume-summary 路径自动适配**
`resumeArchiveSummary()` 不变,它走 `readFile → parseYaml → validateArchiveSummarySchema → rename`。schema validator 9e2 已升级严格校验,resume 时读 .tmp 自动按新规则把关:
- v1.0 native(.tmp 含真实统计):pass schema 校验 → rename
- v0.4 native(.tmp 含 placeholder=true):schema validator 容忍 placeholder=true 路径 → pass → rename
- tampered(.tmp 假 placeholder=false 漏字段):schema fail → exit 3 corrupt

### 4.3 边界场景

| 场景 | 9e2 行为 |
|---|---|
| 14 个全 pass(non-legacy) | `passed=14, failed=0, exempt=0` |
| legacy + 14 个全无 CRITICAL | `passed=4, failed=0, exempt=10`(#9/11/12/14 真过,#1-8/10/13 跳) |
| legacy + 1 个保留不变量 fail(如 fence-9 JCS hash) | fence.ok=false → exit 1,summary 不写 |
| `FENCE_INVARIANT_NAMES.length` 演化到 15(未来加新 invariant) | 派生常量自动跟随,sum=15 校验生效,9e2 schema 不破 |

### 4.4 不引入的复杂度(YAGNI)

- ❌ `summarizeProcessEvidence` 内 throw(留给 schema validator 单点)
- ❌ `FenceInvariantResult.ok` 删除(plan-9z polish 阶段再做)
- ❌ legacy 豁免表二次校验(单源信任 marker flag)
- ❌ archive_summary.yaml 加 invariants_total 字段(派生值,YAGNI)

---

## 5. 测试策略

### 5.1 Unit 测试矩阵(沿 plan-9e1 / 9g 同模式 vitest)

**1. `fence.ts` — status enum + legacy mapper**(新增 ~5 case)
```
✓ non-legacy + 14 个全 pass → 14 个 status='pass'
✓ legacy + 14 个全无 CRITICAL → #1-8/10/13 status='legacy-skip'(10 个),#9/11/12/14 status='pass'(4 个)
✓ non-legacy + 1 个 CRITICAL(fence-9) → fence-9 status='fail',其余 status='pass';fence.ok=false
✓ legacy + 1 个保留不变量 fail → fence-9 status='fail',豁免表中仍 'legacy-skip',fence.ok=false
✓ LEGACY_EXEMPT_INVARIANTS 常量导出断言:size === 10 + 内容匹配 §3.4.4.1
```
现有 fence.ts 测试不破(`ok` + `reason` 字段语义未变)。

**2. `summary-builder.ts:summarizeProcessEvidence`**(新增 ~4 case)
```
✓ 14 全 pass → {placeholder:false, passed:14, failed:0, exempt:0}
✓ legacy 全跳 #1-8/10/13 + 4 个真过 → {placeholder:false, passed:4, failed:0, exempt:10}
✓ buildArchiveSummary 签名带 fenceResult 入参 → ArchiveSummary.process_evidence_summary 为真实统计(非 placeholder)
✓ buildArchiveSummary 与 fence 集成:用 stub FenceCheckResult 入参 → 输出 yaml 序列化字段顺序稳定
```

**3. `archive-summary-schema.ts` 严格校验**(新增 ~6 case)
```
✓ placeholder=false 缺 invariants_passed → errors 含字段名
✓ placeholder=false 缺 invariants_failed → errors 含字段名
✓ placeholder=false 缺 legacy_exempt → errors 含字段名
✓ placeholder=false invariants_passed = -1 → "must be in [0, 14]"
✓ placeholder=false invariants_passed = 15 → "must be in [0, 14]"
✓ placeholder=false sum 不变式破(passed=10 failed=0 exempt=5,sum=15)→ "sum invariant: 15 !== 14"
✓ placeholder=true(9e1 路径) → pass(backward-compat)
```

**4. `archive.ts` integration test**(扩 9e1 现有 test ~2 case)
```
✓ archive non-legacy change → archive_summary.yaml 含 invariants_passed:14 / failed:0 / exempt:0
✓ archive legacy change(process_evidence_unavailable_legacy: true)→ archive_summary.yaml 含 invariants_passed:4 / failed:0 / exempt:10
```

### 5.2 Fixture 准备

**legacy marker fixture**:需新建 v0.4 风格 verify marker 含 `process_evidence_unavailable_legacy: true` flag,搭 `.review-passed` + 完整 change 目录,放 `tests/fixtures/archive-legacy-process-evidence/`。

**注**:fixture 格式与 plan-9j 的 `forge upgrade --resign-markers` 输出相同,9e2 可手写(不依赖 9j 完成);若 9j 已合,直接复用 9j fixture。

**non-legacy v1.0 marker fixture**:plan-9g.3 已立(`tests/fixtures/process-evidence-*` 类似命名),9e2 复用。

### 5.3 不覆盖(YAGNI)

- ❌ 跨 OS test(沿 plan-9e1/9g 现有 CI 矩阵,9e2 不加新 OS-specific 路径)
- ❌ fence.ok=false 路径下 summary 写入测试(架构上不可达,exit 1 已拦截 — archive.ts 现有 integration test 守住)
- ❌ resume-summary 路径下 process_evidence_summary 字段测试(resume 只过 schema validator,validator 测试已覆盖)
- ❌ FENCE_INVARIANT_NAMES.length 演化到 15 的迁移测试(派生常量自动跟随,演化时 plan-9z+ 加测试)

### 5.4 CI 验证

**本地全验**(沿 plan-9g 同流程):
```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run
```
**memory 强制 `format:check`** 含 prettier(forge-repo CI 含 prettier 失败短路)。

**跨 OS CI**:GitHub Actions Linux/Windows × Node 20/22,沿 plan-9g 已绿矩阵不动。

---

## 6. Task 分解粗粒度 + DoD

### 6.1 Task 分解(writing-plans 阶段细化)

| # | 范围 | 复杂度 | 大致 implementer |
|---|---|---|---|
| 1 | `fence.ts` FenceInvariantResult 扩 status enum + LEGACY_EXEMPT_INVARIANTS 常量 + crossCuttingFenceCheck mapper 重写 + unit ~5 case | multi-file 设计面 | sonnet |
| 2 | `summary-builder.ts` summarizeProcessEvidence 新私有 fn + buildArchiveSummary 签名扩 fenceResult 参 + 接线 + unit ~4 case | multi-file | sonnet |
| 3 | `archive-summary-schema.ts` placeholder=false 严格校验扩(必填 / 值域 / sum 不变式 用 `FENCE_INVARIANT_NAMES.length` 派生)+ unit ~6 case | mechanical | haiku |
| 4 | `archive.ts:231` fenceResult 透传 + integration ~2 case(non-legacy / legacy) | mechanical | haiku |
| 5 | `archive.md` 4 处文案 + 短段解释 invariants_failed/legacy_exempt 语义 | docs | haiku |
| 6 | legacy marker fixture(若 9j 未合则手写,9j 已合则复用)+ end-to-end integration ~2 case | fixture | sonnet |

**review**:每 Task 二段 review(spec ✅ 后 quality ✅,沿 plan-9g 协议)→ sonnet。

### 6.2 DoD(完成验收)

**功能层**:
- `FenceInvariantResult.status` 字段产 + `LEGACY_EXEMPT_INVARIANTS` 常量导出 + mapper legacy 路径正确分支
- `summarizeProcessEvidence(fenceResult)` 返 ProcessEvidenceSummary,sum 不变式成立
- `buildArchiveSummary` 签名扩 fenceResult 入参,所有 caller 同步更新(archive.ts:231 区段)
- `archive-summary-schema.ts` placeholder=false 路径严格校验,sum 不变式由派生常量 `FENCE_INVARIANT_NAMES.length` 守住
- `archive.md` 4 处文案校正 + 1 段解释字段语义

**测试层**:
- Unit:fence mapper / summarize / schema validator 三层各自覆盖 = ~15 新 case
- Integration:non-legacy + legacy 两种 archive 输出 yaml 真实统计 fields 正确

**纪律层**:
- 全本地 verify(`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run`)PASS
- 跨 OS CI(Linux / Windows × Node 20/22)全绿
- 每 Task DONE_REPORT 含 RED commit + GREEN commit + log paths(沿 plan-9g process_evidence 协议)
- 每 Task 完成跑 retrospect Q1-Q6;Yes 触发 Case 06 + §6 catalog updates

**接口契约层**:
- `PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY` 常量保留(测试 fixture 用),生产路径不再使用,注释更新
- `FenceInvariantResult.ok` 字段保留(plan-9z polish 阶段考虑 deprecation,9e2 不动)
- legacy 豁免表语义住 fence.ts 单源(`LEGACY_EXEMPT_INVARIANTS = {1-8, 10, 13}`,沿 master §3.4.4.1)

### 6.3 估时

| 阶段 | 时长 |
|---|---|
| brainstorm(本文档已完成) | 0.5d 内 |
| writing-plans 起草 sub-plan | ~0.75d |
| SDD 实施 6 Task | ~1d(P50,沿 master §3.5 字面) |
| retrospect + 综合 review | ~0.25d |
| **总 P50** | **~2-2.5d** |
| **总 P90** | **~3d**(+25% buffer) |

---

## 7. 遗留项(明确不在 9e2 scope)

| # | 项目 | 处置 |
|---|---|---|
| 1 | `FenceInvariantResult.ok` 字段 deprecation | plan-9z polish |
| 2 | v1.1 forge backlog index 消费 archive_summary.yaml | plan-v1.1 |
| 3 | dimension enum 三处独立维护(severity.ts / marker-schema.ts / finding.ts) | plan-9z polish(9g 已知遗留) |
| 4 | invariant 11 ack lookup per-task 精度损失 | plan-9z polish(9g 已知遗留) |
| 5 | Task 4 Case 8 dead-code path(plan 字面 design 矛盾) | plan-9z polish(9g 已知遗留) |
| 6 | Task 6 shell:true 注入面(forge/config.yaml test_command 无校验) | plan-9z polish(9g 已知遗留) |
| 7 | 29 个 it.todo(Task 5/6 e2e fixture 完整 inline) | plan-9z polish(9g 已知遗留) |

---

## 8. 跨 sub-plan 合并点

`commands/archive.md` 是多 sub-plan 共改文件,plan-9e2 是第三次也是最后一次扩展:
- **9e1**:三级 fence 行为 + summary 输出基础架构 + placeholder
- **9g**:14 不变量 fence(沿 9g brainstorm spec)
- **9e2**:placeholder → 真实统计 + 字段语义短段(本 plan)

merge 顺序已固定:**9e1 → 9g → 9e2**(plan-9e1 line 188 / master plan line 593 已锁)。

---

**End of plan-9e2 brainstorm design**
