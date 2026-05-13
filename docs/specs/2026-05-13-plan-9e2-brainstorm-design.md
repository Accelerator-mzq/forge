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
| Q1 | FenceInvariantResult 多态信息流归属 | **扩 `status: 'pass' \| 'warning' \| 'fail' \| 'legacy-skip'` 4 态 enum 字段,语义住 fence 层**(v2 codex 一轮 MAJOR 修订:从 3 态扩 4 态加 WARNING 处理) | legacy 豁免表(哪些 invariant 跳)只在 fence.ts 内单源维护(LEGACY_EXEMPT_INVARIANTS 常量);类型安全;superset additive 不破 plan-9g 已写 ok/reason 代码;WARNING(env_hash 不一致 / sample 模式 timeout / verify_invocations 不足等沿 design §2.7.3 #7/#10/#13)必须可识别,否则 invariants_passed 数字虚高把"有软告警放行"误报"全过" |
| Q2 | `invariants_failed` 字段语义 | **保留字段,值永远 = 0**(对称性 + 防未来 fail-soft 模式) | 字段已在 9e1 schema 立(archive-summary.ts:64-73),不破 backwards-compat;archive_summary.yaml 是用户 review 产物,字段对称直观;未来若 fence 改 fail-soft(部分 invariant fail 但仍写 summary)字段已就位 |
| Q3 | placeholder=false 路径 schema 校验严格度 | **严格:四字段必填 + number + 值域 [0, EXPECTED_INVARIANT_COUNT] + sum = EXPECTED_INVARIANT_COUNT 不变式;常量派生自 `FENCE_INVARIANT_NAMES.length` 自动跟随 invariant 数演化**(v2 codex 一轮 MAJOR 修订:三字段 → 四字段含 invariants_with_warning) | 9g 14 不变量是产物完整性核心,sum 不变式破 = bug 或 tamper 直接拒签;archive_summary.yaml 是 v1.1 backlog index 上游,后续消费者期望字段完整;与 plan-9d / 9j schema validator 严格化路径一致 |
| Q4 | archive.md 文档更新边界 | **4 处文案校正 + 短段解释字段语义,且双改根级 `commands/archive.md` + 模板 `src/core/templates/commands/archive.md` 两份**(v2 codex 一轮 MAJOR 修订:漏列根级)(legacy_exempt 引 master §3.4.4.1 表 / invariants_failed 永远 = 0 设计理由 / invariants_with_warning 解释) | archive.md 是 slash command 模板被 `forge init` 写入用户项目,基本字段语义必须可读;两份 archive.md(根级 + template)实施前 `md5sum` 完全一致(v2 codex 二轮 NIT 修订:删字面量 hash 避免实施后过时),必须同步双改否则用户调根级 `/forge:archive` 会读到过期协议;但"具体哪 10 个被跳"展开是 master spec 工作,文档引到表即可不内嵌(YAGNI) |
| Q5 | legacy flag 取值源(v2 codex 一轮 MAJOR 修订:新增) | **`legacyExempt = verifyMarker.process_evidence_unavailable_legacy === true \|\| reviewMarker?.process_evidence_unavailable_legacy === true`(任一为 true 即视为 legacy 路径)** | 当前 fence.ts:153-186 已对 review marker 独立读 reviewLegacyExempt 跑独立 process_evidence 校验;若只读 verify side flag,verify 非 legacy + review legacy 路径下 review 侧被豁免的 #1-8/10/13 会落成 status='pass',legacy_exempt 统计失真;v1.0 取并集简化(精度损失 = 无法区分 verify-only / review-only legacy,留 v1.1+ 精确拆分) |

---

## 2. 架构 + 数据流

### 2.1 数据流图

```
archive.ts:231
   │
   ▼
crossCuttingFenceCheck(changeRoot)
   │  ← 读 verify marker + review marker 各自 process_evidence_unavailable_legacy flag
   │     fence.ts:115/157 当前已两源独立读;9e2 mapper 取并集 verifyLegacy || reviewLegacy
   │
   ▼ FenceCheckResult { ok, results: [14×{invariant, ok, status, reason}] }
   │
   │  status 取值(4 态;v2 codex 一轮 MAJOR 修订加 'warning'):
   │   - 'pass'         真过校验(无任何 CRITICAL / WARNING finding 命中该 invariant)
   │   - 'warning'      无 CRITICAL 但有 WARNING finding 命中(沿 design §2.7.3 #7/#10/#13)
   │   - 'fail'         CRITICAL,fence.ok=false → archive exit 1 终止
   │   - 'legacy-skip'  legacy 路径下沿 §3.4.4.1 跳的 #1-8/10/13(verify || review 任一 legacy 即触发)
   │
   │  优先级:fail > legacy-skip > warning > pass(per-invariant 多侧 finding 合并取最严)
   │
   ▼ (仅 fence.ok=true 路径,fail 路径已 exit 1)
buildArchiveSummary(verifyMarker, reviewMarker, changeDir, changeId, fenceResult, opts)
   │
   ▼
summarizeProcessEvidence(fenceResult): ProcessEvidenceSummary
   │  passed   = results.filter(r => r.status === 'pass').length
   │  warning  = results.filter(r => r.status === 'warning').length
   │  failed   = results.filter(r => r.status === 'fail').length    // 永远 0(write path 不可达)
   │  exempt   = results.filter(r => r.status === 'legacy-skip').length
   │  不变式: passed + warning + failed + exempt === FENCE_INVARIANT_NAMES.length
   │
   ▼
ArchiveSummary.process_evidence_summary = {
   placeholder: false,
   invariants_passed: <number>,
   invariants_with_warning: <number>,    // 9e2 v2 codex MAJOR 一轮新增字段
   invariants_failed: 0,
   legacy_exempt: <number>,
}
   │
   ▼ .tmp 写入 → validateArchiveSummarySchema(严格校验) → rename 正式 .yaml
```

### 2.2 关键不变式

1. **sum 不变式(v2 codex 一轮 MAJOR 修订:4 字段)**:`invariants_passed + invariants_with_warning + invariants_failed + legacy_exempt === FENCE_INVARIANT_NAMES.length`,fence 层产 + schema 层校验双源
2. **legacy_exempt 取值**:0(非 legacy)或 10(legacy 路径,沿 §3.4.4.1 #1-8/10/13);**不硬编码 10**,从 fence status='legacy-skip' 折数
3. **`process_evidence_unavailable_legacy` flag 双源取并集(v2 codex 一轮 MAJOR 修订)**:`legacyExempt = verifyMarker.process_evidence_unavailable_legacy === true || reviewMarker?.process_evidence_unavailable_legacy === true`;沿 plan-9g fence.ts:115/157 已两源独立读约定,9e2 mapper 取并集;v1.0 精度损失 = 无法区分 verify-only / review-only legacy,留 v1.1+ 精确拆分
4. **invariants_failed 永远 = 0**:fence.ok=false 时 archive.ts:231 已 exit 1,buildArchiveSummary 永远不执行;字段保留对称 + 防未来 fail-soft
5. **invariants_with_warning 取值范围(v2 codex 一轮 MAJOR 修订:新增)**:0 到 (FENCE_INVARIANT_NAMES.length - exempt - passed);WARNING 来源 design §2.7.3 #7(verify_invocations 不足)/ #10(env_hash 不一致)/ #13(sample/hash-only 模式 timeout);WARNING 不阻断 fence,但需要在 summary 中可见,否则 invariants_passed 数字虚高

### 2.3 模块改动 surface(5 代码文件 + 2 文档,v2 codex 一轮 MAJOR 修订:补根级 archive.md)

| 文件 | 改动量 | 性质 |
|---|---|---|
| `src/core/schemas/archive-summary.ts` | +5 行 | ProcessEvidenceSummary 加 `invariants_with_warning?: number` 字段(v2 修订)+ JSDoc 注释更新 |
| `src/core/archive/fence.ts` | +8 行 | FenceInvariantResult 加 status 4 态字段 + LEGACY_EXEMPT_INVARIANTS 常量 + mapper 重写(WARNING + dual-legacy) |
| `src/core/archive/process-evidence-fence.ts` | ~3 行 | 若 fence.ts 改动需 propagate(实际可能无改 — mapper 在 fence.ts 内) |
| `src/core/archive/summary-builder.ts` | +35 行 | summarizeProcessEvidence 新私有 fn(4 字段)+ buildArchiveSummary 签名扩 fenceResult |
| `src/core/validate/archive-summary-schema.ts` | +30 行 | placeholder=false 严格校验(4 字段必填 / 值域 / sum 不变式) |
| `src/cli/commands/archive.ts` | ~3 行 | fenceResult 透传到 buildArchiveSummary |
| `commands/archive.md` | ~10 行 | **根级 slash command;v2 codex 一轮 MAJOR 修订:漏列已补**;4 处文案校正 + 短段解释字段语义(含 invariants_with_warning) |
| `src/core/templates/commands/archive.md` | ~10 行 | **模板,被 `forge init` 复制到用户项目**;内容与根级 md5 完全一致(实施前基线;v2 codex 二轮 NIT 修订:删字面量 hash 避免实施后过时),9e2 实施时同步双改 |

---

## 3. 组件契约

### 3.1 `FenceInvariantResult`(fence.ts:25-30 扩 status 4 态,v2 codex 一轮 MAJOR 修订)

```ts
// 改前(plan-9g 现状)
export interface FenceInvariantResult {
  invariant: string;
  ok: boolean;
  reason: string;
}

// 改后(plan-9e2,4 态 status enum)
export interface FenceInvariantResult {
  invariant: string;            // 'fence-1' ... 'fence-14'(plan-9g 现有)
  ok: boolean;                  // plan-9g 现有,保留不动(backwards-compat)
  status: 'pass' | 'warning' | 'fail' | 'legacy-skip';  // 9e2 新增 4 态(v2 修订加 'warning')
  reason: string;               // plan-9g 现有,保留不动
}
```

**不变式**:`status === 'fail' ⟺ ok === false`(ok 与 status 是冗余字段,9e2 mapper 主动维持不变式,**不**让 ok 从 status 计算;保留 ok 兼容 plan-9g 已写代码,deprecation 留给 plan-9z polish)。**status === 'warning'** 时 ok 仍为 true(WARNING 不阻断 fence,沿 design §2.7.3 #7/#10/#13 + plan-9g brainstorm spec §3 v9 修订)。

### 3.2 `crossCuttingFenceCheck()` mapper 重写(fence.ts:194-205,v2 codex 一轮 MAJOR 修订)

```ts
// 9e2 新增模块级常量(沿 master §3.4.4.1 表)
export const LEGACY_EXEMPT_INVARIANTS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 10, 13]);
// 注:#9/11/12/14 不在豁免表,legacy 路径下仍强制校验

// v2 codex 一轮 MAJOR 修订:legacyExempt 改取 verify || review 并集
const effectiveLegacyExempt =
  (verifyMarker.process_evidence_unavailable_legacy as boolean | undefined) === true ||
  (reviewMarker?.process_evidence_unavailable_legacy as boolean | undefined) === true;

// v2 codex 一轮 MAJOR 修订:从 allFindings 同时筛 CRITICAL + WARNING
const allFindings = [...fieldFindings, ...reviewFindings, ...rerunFindings];
const criticalFindings = allFindings.filter((f) => f.severity === 'CRITICAL');
const warningFindings = allFindings.filter((f) => f.severity === 'WARNING');

// 改后 mapper(4 态,优先级 fail > legacy-skip > warning > pass)
const results: FenceInvariantResult[] = FENCE_INVARIANT_NAMES.map((name) => {
  const inv = parseInt(name.replace('fence-', ''), 10);
  // 1. fail 最高优先级
  const fail = criticalFindings.find((f) => f.invariant === inv);
  if (fail) {
    return { invariant: name, ok: false, status: 'fail', reason: fail.message };
  }
  // 2. legacy-skip 次优先(legacy 路径下被豁免的 invariant 不论是否有 WARNING 均标 skip)
  if (effectiveLegacyExempt && LEGACY_EXEMPT_INVARIANTS.has(inv)) {
    return { invariant: name, ok: true, status: 'legacy-skip', reason: 'legacy-exempt per master §3.4.4.1' };
  }
  // 3. warning 次次优先(沿 design §2.7.3 #7/#10/#13)
  const warn = warningFindings.find((f) => f.invariant === inv);
  if (warn) {
    return { invariant: name, ok: true, status: 'warning', reason: warn.message };
  }
  // 4. 真过
  return { invariant: name, ok: true, status: 'pass', reason: 'pass' };
});
```

`LEGACY_EXEMPT_INVARIANTS` 导出,供测试断言用(`expect(LEGACY_EXEMPT_INVARIANTS.size).toBe(10)`)。

**精度损失说明(v2 codex 一轮 MAJOR 修订)**:`effectiveLegacyExempt` 取并集后,v1.0 summary 无法区分 verify-only / review-only legacy。这是有意的简化 — v1.0 archive_summary.yaml 是给用户审计 + v1.1 backlog index 用,粗粒度足够;精确拆分留 v1.1+ 引入 `verify_legacy_exempt` / `review_legacy_exempt` 时再做。

### 3.3 `summarizeProcessEvidence()`(summary-builder.ts 新私有 fn,v2 codex 一轮 MAJOR 修订:4 字段)

```ts
function summarizeProcessEvidence(fenceResult: FenceCheckResult): ProcessEvidenceSummary {
  const passed  = fenceResult.results.filter(r => r.status === 'pass').length;
  const warning = fenceResult.results.filter(r => r.status === 'warning').length;
  const failed  = fenceResult.results.filter(r => r.status === 'fail').length;
  const exempt  = fenceResult.results.filter(r => r.status === 'legacy-skip').length;
  // 注:不变式断言由 archive-summary-schema validator 单点把守
  //     此 fn 不主动 throw(避免双源校验路径分歧)
  return {
    placeholder: false,
    invariants_passed: passed,
    invariants_with_warning: warning,   // v2 codex 一轮 MAJOR 修订:新增字段
    invariants_failed: failed,
    legacy_exempt: exempt,
  };
}
```

`ProcessEvidenceSummary` 类型同步扩(`src/core/schemas/archive-summary.ts`):
```ts
export interface ProcessEvidenceSummary {
  placeholder: boolean;
  note?: string;
  invariants_passed?: number;
  invariants_with_warning?: number;   // v2 codex 一轮 MAJOR 修订:新增
  invariants_failed?: number;
  legacy_exempt?: number;
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

// placeholder=false 路径严格校验扩(v2 codex 一轮 MAJOR 修订:三字段 → 四字段)
if (peSummary.placeholder === false) {
  // 1. 四字段必填 + number(v2 加 invariants_with_warning)
  const REQUIRED_FIELDS = [
    'invariants_passed',
    'invariants_with_warning',  // v2 codex 一轮 MAJOR 修订:新增
    'invariants_failed',
    'legacy_exempt',
  ] as const;
  for (const field of REQUIRED_FIELDS) {
    if (typeof peSummary[field] !== 'number') {
      errors.push({
        field: `process_evidence_summary.${field}`,
        message: `required number when placeholder=false`,
      });
    }
  }
  // 仅当前面类型检查通过才走值域 + 不变式(避免 NaN 干扰)
  if (REQUIRED_FIELDS.every(f => typeof peSummary[f] === 'number')) {
    // 2. 值域 [0, EXPECTED_INVARIANT_COUNT]
    for (const field of REQUIRED_FIELDS) {
      const v = peSummary[field] as number;
      if (v < 0 || v > EXPECTED_INVARIANT_COUNT) {
        errors.push({
          field: `process_evidence_summary.${field}`,
          message: `must be in [0, ${EXPECTED_INVARIANT_COUNT}]`,
        });
      }
    }
    // 3. sum 不变式(v2 codex 一轮 MAJOR 修订:4 字段 sum)
    const sum = (peSummary.invariants_passed as number)
              + (peSummary.invariants_with_warning as number)
              + (peSummary.invariants_failed as number)
              + (peSummary.legacy_exempt as number);
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

### 3.7 `archive.md` 文档更新(v2 codex 一轮 MAJOR 修订:双改 + 加 warning 字段说明)

**双文件同步改(沿 §2.3 改动 surface,v2 修订)**:`commands/archive.md`(根级 slash command)+ `src/core/templates/commands/archive.md`(模板),两份 md5 完全一致(实施前基线;v3 codex 二轮 NIT 残留清理:删字面 hash),9e2 实施时**逐行同步双改**;CI 加 md5 比对断言守 sync。

**4 处文案校正**(两份各 4 处):
- line 53:`process_evidence_summary`(9e1 placeholder,9e2 接 9g 真实统计)→ 改为字段语义说明
- line 66:`**Security:** [process_evidence:placeholder] ... (9e2 完成后改为真实统计)`→ 改为真实输出 sample `[process_evidence:passed=3/warning=1/failed=0/legacy=10]`(v2 codex 一轮 MAJOR 修订:sample 加 warning)
- line 141:`- **9e2**(待 9g 完成后):...` → 标"已完成"或删
- line 144:merge 顺序提示 `9e1 → 9g → 9e2` → 加"已完成"注脚

**短段解释字段语义(新增 ~8-10 行,v2 修订加 invariants_with_warning)**:
- `invariants_passed`:fence 14 不变量真过且**无 WARNING** 的数(non-legacy + 无软告警路径下 = 14)
- `invariants_with_warning`:fence mapper 经 fail / legacy-skip 优先级筛选后**仍保留为 `status='warning'`** 的 invariant 数(沿 design §2.7.3 WARNING 来源:#7 verify_invocations 不足 / #10 env_hash 不一致 / #13 sample/hash-only 模式 timeout)。**精度损失(v3 codex 二轮 MAJOR 自我修订)**:legacy 路径下被豁免的 invariant 即使产 WARNING 也优先标 'legacy-skip' 不计入本字段(沿 mapper 优先级 fail > legacy-skip > warning > pass);特别是 review-only legacy + verify-side WARNING 的副作用(沿 §4.3 边界场景行);WARNING 实际信息仍走 `acked_warnings`(freeze-time)或 stderr(rerun-time)双路径不丢,**summary 中仅 `invariants_with_warning` 计数可能偏低**;v1.1+ side-aware mapper 修复(沿 §7 遗留 #8)
- `invariants_failed`:**v1.0 永远 = 0**;fence 任一不变量失败时 archive 直接 exit 1 拒签,summary 不写入。字段对称保留,未来 v1.1+ 若引入 fail-soft 模式可填非零
- `legacy_exempt`:`process_evidence_unavailable_legacy: true` 路径下被精确豁免的不变量数(沿 master §3.4.4.1 表,legacy 路径恒 = 10),非 legacy 路径恒 = 0;**legacy flag 取自 verify || review 任一为 true**(v2 codex 一轮 MAJOR 修订)

---

## 4. 错误处理

### 4.1 错误路径矩阵

| 场景 | 触发点 | 后果 | exit code |
|---|---|---|---|
| fence CRITICAL finding 出现 | crossCuttingFenceCheck | results[i].status='fail' / ok=false → archive 拦截 | 1(沿 master §3.12.3 fence business-fail) |
| fence WARNING finding 出现(v2 codex 一轮 MAJOR 修订:新增) | crossCuttingFenceCheck mapper | results[i].status='warning' / ok=true;archive 继续,summary 中 invariants_with_warning 计数+1 | 0(WARNING 不阻断;沿 design §2.7.3 + plan-9g brainstorm v9 修订) |
| legacy flag 误填(v1.0 native marker 含 legacy flag,v2 codex 一轮 MINOR 修订) | archive.ts:341/349 validateLegacyExemption 兜底 | legacy-exemption.ts:47-62 互斥校验拒签(`legacy=true ⊥ created_by_tool_version>=1.0.0 且 resigned 缺失`)| 1(沿 plan-9j 反向加固 + design §3.4.4.1) |
| sum 不变式破(fence 内部 bug) | summarizeProcessEvidence 不主动 throw | 写入 .tmp → archive-summary-schema 严格校验拒签 | 3(corrupt) |
| .tmp 内容 tamper | validateArchiveSummarySchema | 必填字段缺 → errors → archive 拒签 | 3(corrupt) |
| 派生常量与 fence 出 result 数不一致 | summarizeProcessEvidence | sum 校验失败 → exit 3 | 3 |
| 根级 / 模板 archive.md md5 失同步(v2 codex 一轮 MAJOR 修订:新增 CI 守护)| CI md5 比对 step | 两份 md5 不一致 → CI fail | CI 拒绝(非 archive 运行时 exit) |

### 4.2 关键路径决策

**1. `summarizeProcessEvidence` 不主动 throw**
不在 builder 内 assert sum 不变式 — 让 archive-summary-schema 单点把守(避免双源校验路径分歧)。实际效果:fence 内部 bug → .tmp 写入异常 → schema validator 拒签 → exit 3。

**2. backwards-compat for plan-9g 现有 caller**
`FenceInvariantResult.ok` 字段保留(不删),plan-9g 已写代码继续工作。但 `status === 'fail' ⟺ ok === false` 不变式有"重复字段"风险 — 由 9e2 测试用断言守住,后续 plan-9z polish 可考虑 ok deprecation。

**3. legacy flag 双源取并集 + 兜底信任(v2 codex 一轮 MAJOR + MINOR 修订)**
fence.ts mapper 取 `verifyLegacy || reviewLegacy`(任一为 true 视为 legacy 路径);**fence 不二次校验 flag 合法性**(不查 marker version 是否 < 1.0.0 等),由 archive.ts:341/349 的 `validateLegacyExemption()` 兜底拒签 v1.0 native marker 误带 legacy flag(沿 plan-9j legacy-exemption.ts:47-62)。9e2 mapper 只消费 flag,验证由 plan-9j 已有 fence 守住。

**4. resume-summary 路径自动适配**
`resumeArchiveSummary()` 不变,它走 `readFile → parseYaml → validateArchiveSummarySchema → rename`。schema validator 9e2 已升级严格校验,resume 时读 .tmp 自动按新规则把关:
- v1.0 native(.tmp 含真实统计):pass schema 校验 → rename
- v0.4 native(.tmp 含 placeholder=true):schema validator 容忍 placeholder=true 路径 → pass → rename
- tampered(.tmp 假 placeholder=false 漏字段):schema fail → exit 3 corrupt

### 4.3 边界场景(v2 codex 一轮 MAJOR 修订:加 WARNING + dual-legacy 场景)

| 场景 | 9e2 行为 |
|---|---|
| 14 个全 pass(non-legacy + 无 WARNING) | `passed=14, warning=0, failed=0, exempt=0` |
| non-legacy + 1 个 WARNING(如 #10 env_hash 不一致) | `passed=13, warning=1, failed=0, exempt=0`;archive 继续,WARNING reason 进 result.reason |
| legacy(verify only)+ 14 个全无 CRITICAL/WARNING | `passed=4, warning=0, failed=0, exempt=10`(#9/11/12/14 真过,#1-8/10/13 跳) |
| legacy(review only,verify 非 legacy)+ 14 个全无 CRITICAL/WARNING | `passed=4, warning=0, failed=0, exempt=10`(取并集后等同 verify legacy 路径) |
| **review-only legacy + verify 侧 #10 env_hash WARNING(v2 codex 二轮 MAJOR 修订:精度损失新增场景)** | `passed=4, warning=0, failed=0, exempt=10`;**verify 侧 #10 WARNING 因 effectiveLegacyExempt=true 被 mapper 标 'legacy-skip' 静默丢失**;v1.0 接受此精度损失(Q5 并集决策副作用),实际 WARNING 仍走 stderr / acked_warnings 路径 — 但 summary 中 invariants_with_warning 数字偏低;v1.1+ 引入 side-aware mapper 修复(沿 §7 遗留 #8) |
| legacy + 1 个保留不变量 WARNING(如 #9 JCS hash WARNING)+ 0 CRITICAL | `passed=3, warning=1, failed=0, exempt=10`(legacy-skip 优先级高于 warning,但 #9/11/12/14 不在 exempt 表,WARNING 落在保留 invariant 上) |
| legacy + 1 个豁免不变量 WARNING(如 #10 env_hash,#10 在 exempt 表)| `passed=4, warning=0, failed=0, exempt=10`(legacy-skip 优先级高于 warning,#10 仍标 legacy-skip 不计 warning;同 review-only legacy 副作用) |
| legacy + 1 个保留不变量 CRITICAL(如 fence-9 JCS hash)| fence.ok=false → exit 1,summary 不写 |
| v1.0 native marker 误带 legacy flag(v2 codex 一轮 MINOR + 二轮 MINOR 修订)| **先进 crossCuttingFenceCheck mapper:effectiveLegacyExempt=true → 豁免表 invariant 标 'legacy-skip',fence.ok=true 不拦截**;后被 archive.ts:341/349 validateLegacyExemption 兜底拒签(legacy-exemption.ts:47-62 互斥:`legacy=true ⊥ created>=1.0.0 且 resigned 缺失`)→ exit 1,summary 不写 |
| `FENCE_INVARIANT_NAMES.length` 演化到 15(未来加新 invariant) | 派生常量自动跟随,sum=15 校验生效,9e2 schema 不破 |

### 4.4 不引入的复杂度(YAGNI)

- ❌ `summarizeProcessEvidence` 内 throw(留给 schema validator 单点)
- ❌ `FenceInvariantResult.ok` 删除(plan-9z polish 阶段再做)
- ❌ legacy 豁免表二次校验(单源信任 marker flag)
- ❌ archive_summary.yaml 加 invariants_total 字段(派生值,YAGNI)

---

## 5. 测试策略

### 5.1 Unit 测试矩阵(沿 plan-9e1 / 9g 同模式 vitest)

**1. `fence.ts` — status 4 态 enum + legacy mapper + WARNING 处理**(新增 ~9 case,v2 codex 一轮 MAJOR 修订加 case)
```
✓ non-legacy + 14 个全无 finding → 14 个 status='pass'
✓ non-legacy + 1 WARNING(fence-10) → fence-10 status='warning' / 其余 'pass';fence.ok=true
✓ legacy(verify-only) + 14 个全无 CRITICAL/WARNING → #1-8/10/13 status='legacy-skip'(10),#9/11/12/14 status='pass'(4)
✓ legacy(review-only,verify 非 legacy)+ 14 个全无 CRITICAL/WARNING → 等同 verify legacy(取并集)
✓ legacy(verify+review 都 legacy)+ 14 个全无 finding → 等同 verify legacy(并集幂等)
✓ legacy + 1 WARNING 落在保留 invariant(fence-9)→ fence-9 status='warning',#1-8/10/13 仍 'legacy-skip'
✓ legacy + 1 WARNING 落在豁免 invariant(fence-10)→ fence-10 status='legacy-skip'(优先级高于 warning),其余按 legacy 路径
✓ non-legacy + 1 CRITICAL(fence-9) → fence-9 status='fail',其余 status='pass';fence.ok=false
✓ legacy + 1 保留不变量 CRITICAL(fence-9)→ fence-9 status='fail',豁免表中仍 'legacy-skip';fence.ok=false
✓ LEGACY_EXEMPT_INVARIANTS 常量导出断言:size === 10 + 内容匹配 §3.4.4.1(精确 = {1,2,3,4,5,6,7,8,10,13})
```
现有 fence.ts 测试不破(`ok` + `reason` 字段语义未变)。

**2. `summary-builder.ts:summarizeProcessEvidence`**(新增 ~5 case,v2 修订:4 字段 + dual-legacy)
```
✓ 14 全 pass → {placeholder:false, passed:14, warning:0, failed:0, exempt:0}
✓ legacy + 4 个真过 → {placeholder:false, passed:4, warning:0, failed:0, exempt:10}
✓ non-legacy + 1 WARNING → {placeholder:false, passed:13, warning:1, failed:0, exempt:0}
✓ legacy + 1 WARNING 落保留 invariant → {placeholder:false, passed:3, warning:1, failed:0, exempt:10}
✓ buildArchiveSummary 签名带 fenceResult 入参 → ArchiveSummary.process_evidence_summary 为真实统计(非 placeholder)+ yaml 序列化字段顺序稳定
```

**3. `archive-summary-schema.ts` 严格校验**(新增 ~8 case,v2 修订:4 字段)
```
✓ placeholder=false 缺 invariants_passed → errors 含字段名
✓ placeholder=false 缺 invariants_with_warning → errors 含字段名(v2 修订)
✓ placeholder=false 缺 invariants_failed → errors 含字段名
✓ placeholder=false 缺 legacy_exempt → errors 含字段名
✓ placeholder=false invariants_with_warning = -1 → "must be in [0, 14]"(v2 修订)
✓ placeholder=false invariants_passed = 15 → "must be in [0, 14]"
✓ placeholder=false sum 不变式破(passed=10 warning=0 failed=0 exempt=5,sum=15)→ "sum invariant: 15 !== 14"
✓ placeholder=false sum 不变式破(passed=4 warning=1 failed=0 exempt=10,sum=15)→ "sum invariant: 15 !== 14"
✓ placeholder=true(9e1 路径) → pass(backward-compat)
```

**4. `archive.ts` integration test**(扩 9e1 现有 test ~4 case,v2 修订加 WARNING + dual-legacy 路径)
```
✓ archive non-legacy change → archive_summary.yaml 含 passed:14 / warning:0 / failed:0 / exempt:0
✓ archive non-legacy change + 1 WARNING fixture → archive_summary.yaml 含 passed:13 / warning:1 / failed:0 / exempt:0
✓ archive legacy(verify-only)change → archive_summary.yaml 含 passed:4 / warning:0 / failed:0 / exempt:10
✓ archive legacy(review-only)change → archive_summary.yaml 等同 verify-only legacy(取并集)
```

**5. `archive.md` 双文件同步守护**(v2 codex 一轮 MAJOR 修订:新增 1 case)
```
✓ md5sum commands/archive.md === md5sum src/core/templates/commands/archive.md(CI step + unit test 双层)
```
unit test 用 node 自身 `crypto.createHash('md5')` 计算,避免 OS 工具依赖。CI step 加 `pnpm test` 之前。

### 5.2 Fixture 准备(v2 codex 一轮 MAJOR 修订:加 WARNING + review-legacy fixture)

**legacy marker fixture**:需新建 v0.4 风格 verify marker 含 `process_evidence_unavailable_legacy: true` flag,搭 `.review-passed` + 完整 change 目录,放 `tests/fixtures/archive-legacy-process-evidence/`。

**v2 codex 一轮 MAJOR 修订新增 fixture**:
- `tests/fixtures/archive-warning-process-evidence/` — non-legacy v1.0 marker,verify 阶段产 #10 env_hash WARNING(env mismatch)
- `tests/fixtures/archive-review-only-legacy/` — verify v1.0 native + review 标 `process_evidence_unavailable_legacy: true`(测试 dual-legacy 并集路径)

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
| 1 | `archive-summary.ts` ProcessEvidenceSummary 加 invariants_with_warning 字段(v2 codex 一轮 MAJOR 修订);`fence.ts` FenceInvariantResult 扩 status 4 态 enum + LEGACY_EXEMPT_INVARIANTS 常量 + crossCuttingFenceCheck mapper 重写(WARNING + dual-legacy 并集)+ unit ~9 case | multi-file 设计面 | sonnet |
| 2 | `summary-builder.ts` summarizeProcessEvidence 新私有 fn(4 字段)+ buildArchiveSummary 签名扩 fenceResult 参 + 接线 + unit ~5 case | multi-file | sonnet |
| 3 | `archive-summary-schema.ts` placeholder=false 严格校验扩(4 字段必填 / 值域 / sum 不变式 用 `FENCE_INVARIANT_NAMES.length` 派生)+ unit ~8 case | mechanical | haiku |
| 4 | `archive.ts:231` fenceResult 透传 + integration ~4 case(non-legacy / non-legacy+WARNING / verify-legacy / review-legacy) | mechanical | haiku |
| 5 | **双改** `commands/archive.md` + `src/core/templates/commands/archive.md`(v2 codex 一轮 MAJOR 修订)4 处文案 + 短段解释 invariants_passed/with_warning/failed/legacy_exempt 语义 + CI/unit md5 同步守护 | docs + ci | haiku |
| 6 | legacy marker fixture(若 9j 未合则手写,9j 已合则复用)+ WARNING fixture + review-only legacy fixture(v2 codex 一轮 MAJOR 修订)+ end-to-end integration ~4 case | fixture | sonnet |

**review**:每 Task 二段 review(spec ✅ 后 quality ✅,沿 plan-9g 协议)→ sonnet。

### 6.2 DoD(完成验收)

**功能层(v2 codex 一轮 MAJOR 修订)**:
- `ProcessEvidenceSummary.invariants_with_warning` 字段加 + `FenceInvariantResult.status` 4 态字段产 + `LEGACY_EXEMPT_INVARIANTS` 常量导出 + mapper:WARNING 路径 + dual-legacy 并集 + legacy-skip > warning 优先级正确分支
- `summarizeProcessEvidence(fenceResult)` 返 ProcessEvidenceSummary(4 计数字段),sum 不变式成立
- `buildArchiveSummary` 签名扩 fenceResult 入参,所有 caller 同步更新(archive.ts:231 区段)
- `archive-summary-schema.ts` placeholder=false 路径 4 字段严格校验,sum 不变式由派生常量 `FENCE_INVARIANT_NAMES.length` 守住
- `commands/archive.md` 根级 + 模板**双改**(md5 一致守护),4 处文案校正 + 1 段解释 4 个字段语义

**测试层(v2 codex 一轮 MAJOR 修订)**:
- Unit:fence mapper(9 case)+ summarize(5 case)+ schema validator(8 case)+ md5 sync(1 case)= ~23 新 case
- Integration:non-legacy + non-legacy+WARNING + verify-legacy + review-legacy 四种 archive 输出 yaml 真实统计 fields 正确

**纪律层**:
- 全本地 verify(`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run`)PASS
- 跨 OS CI(Linux / Windows × Node 20/22)全绿
- 每 Task DONE_REPORT 含 RED commit + GREEN commit + log paths(沿 plan-9g process_evidence 协议)
- 每 Task 完成跑 retrospect Q1-Q6;Yes 触发 Case 06 + §6 catalog updates

**接口契约层(v2 codex 一轮 MAJOR 修订)**:
- `PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY` 常量保留(测试 fixture 用),生产路径不再使用,注释更新
- `FenceInvariantResult.ok` 字段保留(plan-9z polish 阶段考虑 deprecation,9e2 不动);新加 `status` 4 态 enum
- legacy 豁免表语义住 fence.ts 单源(`LEGACY_EXEMPT_INVARIANTS = {1-8, 10, 13}`,沿 master §3.4.4.1)
- legacy flag 取值:`verifyMarker.process_evidence_unavailable_legacy === true || reviewMarker?.process_evidence_unavailable_legacy === true`(并集);v1.0 不精确拆分 verify-only / review-only,留 v1.1+
- 两份 `archive.md`(根级 + 模板)md5 必须 sync(CI + unit 双层守护)

### 6.3 估时(v2 codex 一轮 MAJOR 修订:上调实施时长 ~30%)

| 阶段 | 时长 |
|---|---|
| brainstorm(本文档已完成,含 v2 codex 一轮对抗审查 + 修订) | 0.75d 内 |
| writing-plans 起草 sub-plan | ~0.75d |
| SDD 实施 6 Task(v2 修订加 WARNING + dual-legacy + 双 fixture + md5 sync) | ~1.25d(P50,master §3.5 字面 1d + 30% buffer) |
| retrospect + 综合 review | ~0.25d |
| **总 P50** | **~3d** |
| **总 P90** | **~4d**(+30% buffer) |

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
| 8 | legacy_exempt 精确拆分 verify-only / review-only + side-aware WARNING(v2 codex 二轮 MAJOR 修订扩) | plan-v1.1 — 扩 `verify_legacy_exempt` / `review_legacy_exempt` 字段;mapper 改 side-aware 不取并集,可解决"review-only legacy + verify-side WARNING 被静默吞"副作用(沿 §4.3 边界场景);v1.0 接受并集精度损失,因 archive_summary 是粗粒度审计输入,WARNING 实际仍走 stderr / acked_warnings 双路径不丢实际信息,仅 summary 计数偏低 |
| 9 | freeze-time WARNING 走 marker.verify_findings → acked_warnings vs rerun-time WARNING 走 stderr,两条路径在 summary 中合并为 invariants_with_warning 单字段,精度损失 | plan-9z polish 或 v1.1(若有需求拆 freeze/rerun WARNING) |

---

## 8. 跨 sub-plan 合并点

`commands/archive.md` 是多 sub-plan 共改文件,plan-9e2 是第三次也是最后一次扩展:
- **9e1**:三级 fence 行为 + summary 输出基础架构 + placeholder
- **9g**:14 不变量 fence(沿 9g brainstorm spec)
- **9e2**:placeholder → 真实统计 + 字段语义短段(本 plan)

merge 顺序已固定:**9e1 → 9g → 9e2**(plan-9e1 line 188 / master plan line 593 已锁)。

---

**End of plan-9e2 brainstorm design**
