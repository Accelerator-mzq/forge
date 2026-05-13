# Plan 9e2 — ProcessEvidenceSummary 真实统计接入

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。沿 plan-9g / plan-9e1 / plan-9j 同模式,Task 1-6 走标准 TDD/SDD。

**Goal**:把 plan-9e1 留下的 `archive_summary.process_evidence_summary` placeholder 字面接到 plan-9g 实施的 14 不变量真实 pass/warning/fail/legacy_exempt 统计;同步双改根级 `commands/archive.md` + 模板 `src/core/templates/commands/archive.md`(md5 sync 守护)+ 5 case integration 覆盖含 review-only legacy + verify-side WARNING 副作用回归。

**Architecture**:四层 — (1) **Schema 层**:`src/core/schemas/archive-summary.ts` `ProcessEvidenceSummary` interface 加 `invariants_with_warning?: number` 字段(v2 codex 一轮 MAJOR 修订),从 3 计数字段扩 4 计数字段;`PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY` 常量保留(测试 fixture 用),生产路径不再使用,JSDoc 注释更新。 (2) **Fence 层**:`src/core/archive/fence.ts` `FenceInvariantResult` 加 `status: 'pass' | 'warning' | 'fail' | 'legacy-skip'` 4 态 enum 字段(沿 plan-9g 现有 `ok: boolean` + `reason: string` 保留 backwards-compat,但新 mapper 维持 `status === 'fail' ⟺ ok === false` 不变式);加 `LEGACY_EXEMPT_INVARIANTS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 10, 13])` 模块级常量(沿 master §3.4.4.1 表);`crossCuttingFenceCheck()` mapper 重写 — `effectiveLegacyExempt = verifyLegacy || reviewLegacy`(v2 codex 一轮 MAJOR 修订并集);从 allFindings 同时筛 CRITICAL + WARNING;mapper 优先级 `fail > legacy-skip > warning > pass`(legacy 路径下被豁免的 invariant 即使产 WARNING 也优先 'legacy-skip',这是 v1.0 接受的精度损失,v1.1+ side-aware 拆分修复)。 (3) **Builder + Validator 层**:`src/core/archive/summary-builder.ts` 加私有 `summarizeProcessEvidence(fenceResult): ProcessEvidenceSummary`(4 字段),`buildArchiveSummary()` 签名扩 `fenceResult: FenceCheckResult` 入参,line 118 placeholder 替换;`src/core/validate/archive-summary-schema.ts` 加 placeholder=false 路径严格校验 — 4 字段必填 + number + 值域 [0, EXPECTED_INVARIANT_COUNT] + sum 不变式;`EXPECTED_INVARIANT_COUNT = FENCE_INVARIANT_NAMES.length` 派生常量(自动跟随 invariant 数演化)。 (4) **CLI + 文档 + 测试层**:`src/cli/commands/archive.ts:231` fence 调用后透传 fenceResult 到 `buildArchiveSummary()`;**双改** `commands/archive.md` + `src/core/templates/commands/archive.md`(实施前 md5 完全一致,实施时逐行同步双改;CI + unit md5 比对断言守 sync);**4 case integration 通过 test-runtime builder helper 构造 fixture**(v2 codex 一轮 plan review BLOCKER 1 修订:仓库无 plan-9g `tests/fixtures/process-evidence-*` baseline,改为代码构造 marker — sha256 hash 链由 helper 实时计算避免手写 hash 失效),覆盖含副作用回归。

**Tech Stack**:Node 20+ / TypeScript ESM strict + noUncheckedIndexedAccess / commander 12 / `yaml` v2 / vitest 1.x / pnpm 9+ / `crypto` 内置(md5 sync 守护用);现有 `src/core/schemas/archive-summary.ts`(plan-9e1 已立 ProcessEvidenceSummary 3 字段,本 plan 扩第 4 字段)+ `src/core/archive/fence.ts`(plan-9g 已填实 crossCuttingFenceCheck + 14 不变量 mapper,本 plan 加 status enum + LEGACY_EXEMPT_INVARIANTS + 改 mapper)+ `src/core/archive/summary-builder.ts`(plan-9e1 已立 buildArchiveSummary,本 plan 扩签名 + 加 summarizeProcessEvidence)+ `src/core/validate/archive-summary-schema.ts`(plan-9e1 已立,本 plan 扩 placeholder=false 路径严格校验)+ `src/cli/commands/archive.ts`(plan-9e1/9g/9j 已合,本 plan 改 line 231 区段透传)+ `commands/archive.md` × 2(plan-9e1/9g 已合,本 plan 同步双改)。

**Spec 引用**:
- **brainstorm spec v6 [`2026-05-13-plan-9e2-brainstorm-design.md`](../specs/2026-05-13-plan-9e2-brainstorm-design.md)(HEAD 497b834,6 轮 Codex 对抗审查彻底)**:全部落地 4 设计决策(Q1-Q4 + 新增 Q5 legacy flag 并集) + 4 错误路径矩阵 + 8 边界场景(含副作用)+ 5.1 测试矩阵(~23 unit + 5 integration case)+ §7 遗留项
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §2.4.3(archive_summary YAML 字面)+ §2.7.3(14 不变量表 + WARNING 来源 #7/#10/#13)+ §3.4.4.1(legacy 精确豁免表 14 不变量中 #1-8/10/13 跳过,#9/11/12/14 保留)
- master plan §3.5 line 308-310(9e1 / 9e2 拆分,9e2 P50 1d)+ Week 5 line 593(9e2 必须在 9g.3 完成后启动)+ §3.12.1bis(archive_summary 9 字段冻结)+ §3.12.3(exit code 1/2/3)
- plan-9e1 Task 1 + Task 2(archive_summary schema + builder placeholder)— 本 plan 接 placeholder
- plan-9g(crossCuttingFenceCheck 填实 + 14 不变量 fence + WARNING via stderr)— 本 plan 复用 fence 输出
- plan-9j(legacy-exemption + version-retrograde fence)— 本 plan archive.ts:341/349 兜底拒签 v1.0 native marker 误带 legacy flag

**P50 工日**:**3.0**(brainstorm v6 codex 五轮收敛 — 0.75 brainstorm + 0.75 writing-plans + 1.25 SDD + 0.25 retrospect)
**P90 工日**:**4.0**(P50 + 1.0d buffer ~33%)

**前置(必须完成)**:
- plan-9e1 archive 软告警基础(已完成,`dde9209`):`archive_summary.process_evidence_summary` placeholder + `PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY` 常量 + `ProcessEvidenceSummary` interface 3 字段 + `summary-builder.ts` line 118 placeholder 写入 + `summary-render.ts:26-31` placeholder=false 渲染分支(已留好,本 plan 让分支生效)
- plan-9g process_evidence(已完成 `300fb5c`):`crossCuttingFenceCheck()` 填实 + `FENCE_INVARIANT_NAMES` 14 名 + `ProcessEvidenceFinding.severity: 'CRITICAL' | 'WARNING'` + verify/review marker 各自独立读 `process_evidence_unavailable_legacy` flag(fence.ts:115/157)+ allFindings 合并(verify + review + rerun)
- plan-9j marker version deprecation(已完成):`validateLegacyExemption` 兜底拒签 v1.0 native marker 误带 legacy flag(archive.ts:341/349)+ legacy-exemption.ts 互斥校验

**后续 unblocked**:
- plan-9f explore(独立模块,可并行)
- plan-9z release(v1.0 收尾;统一全路径 CHANGELOG + npm publish)

**DoD**(完成定义,沿 brainstorm spec §6.2 全部 0 finding 收敛):

- `src/core/schemas/archive-summary.ts` 改 — `ProcessEvidenceSummary` 加 `invariants_with_warning?: number` 字段;JSDoc 注释更新含字段语义 + legacy 路径精度损失说明
- `src/core/archive/fence.ts` 改 — `FenceInvariantResult` 加 `status: 'pass' | 'warning' | 'fail' | 'legacy-skip'` 字段;模块级常量 `LEGACY_EXEMPT_INVARIANTS = new Set([1,2,3,4,5,6,7,8,10,13])` 导出;`crossCuttingFenceCheck()` mapper 重写 — `effectiveLegacyExempt = verifyLegacy || reviewLegacy` 并集;从 allFindings 同时筛 CRITICAL + WARNING;优先级 `fail > legacy-skip > warning > pass`
- `src/core/archive/summary-builder.ts` 改 — 加 `summarizeProcessEvidence(fenceResult): ProcessEvidenceSummary` 私有 fn;`buildArchiveSummary()` 签名扩 `fenceResult: FenceCheckResult` 入参;line 118 placeholder → `summarizeProcessEvidence(fenceResult)`
- `src/core/validate/archive-summary-schema.ts` 改 — placeholder=false 路径严格校验 4 字段必填 + 值域 [0, EXPECTED_INVARIANT_COUNT] + sum 不变式;`EXPECTED_INVARIANT_COUNT = FENCE_INVARIANT_NAMES.length` 派生
- `src/cli/commands/archive.ts:231` 区段改 — fenceResult 透传到 `buildArchiveSummary()` 调用
- `commands/archive.md` + `src/core/templates/commands/archive.md` **双改** — 4 处文案校正(line 53/66/141/144)+ 短段解释 4 字段语义(沿 brainstorm spec §3.7)+ CI + unit md5 sync 守护
- 测试:
  - `tests/core/archive/fence-mapper.test.ts`(新)— 9 case 覆盖 4 态 mapper + dual-legacy 并集 + 优先级
  - `tests/core/archive/summary-builder.test.ts` 扩 — 5 case 覆盖 summarize + 签名扩
  - `tests/core/validate/archive-summary-schema.test.ts` 扩 — 8 case 覆盖 4 字段严格校验 + sum 不变式
  - `tests/cli/archive-process-evidence-summary.test.ts`(新)— 5 case integration(含副作用回归;v2 codex 一轮 plan review BLOCKER 1 修订:用 test-runtime builder helper 构造 marker,不依赖物理 fixture 目录)
  - `tests/integration/archive-md-sync.test.ts`(新)— 1 case md5 sync 守护
  - `tests/utils/build-archive-fixture.ts`(新,v2 codex 一轮 plan review BLOCKER 1 修订)— `buildProcessEvidenceFixture(opts)` helper 函数,programmatically 构造完整 verify/review marker(含 process_evidence 字段 + sha256 hash 链 + JCS canonical 序列化),返回 marker objects + helper 写入 mkdtemp 目录;4 种 scenario:`warning` / `verify-legacy` / `review-legacy` / `review-legacy-with-verify-warning`
- 物理 fixture:**仅 tasks.md / proposal.md / design.md stub 文件**(不含 marker yaml,marker 由 builder helper 注入)— 实施时如发现 plan-9g 已合后 base dev 补全了 `tests/fixtures/process-evidence-*`,Task 6 可改回复用物理 fixture(但 builder helper 仍保留为 backstop)
- 全本地 verify 通过(`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run`)
- 跨 OS CI(Linux/Windows × Node 20/22)全绿

**Shell 假设 + commit block 跨 shell 兼容**(沿 plan-9j / plan-9g 同模式):本 plan 6 个 Task commit block 全用 `git commit -F file` 模式(Windows + PowerShell 用户偏好;memory `本地 verification 必须含 format:check`)。**实施者必须先确认当前 shell + 按下表转换**:

| Shell | commit 命令模式 | 说明 |
|---|---|---|
| Bash / Git-Bash / WSL | `git commit -m "$(cat <<'EOF' ... EOF)"` | heredoc 直接用 |
| PowerShell 5.1 / 7+(默认) | `git commit -F message-tmp.txt` | 先 Write message 到 tmp 文件,commit 后 rm;避免 `@` 字符泄漏 subject 行(memory)|
| Claude Code Bash tool (Windows) | 同 PowerShell | 默认走 PowerShell |

**v2 codex 一轮 plan review MAJOR 6 修订**:本 plan 主体 commit block 给 PowerShell 形式(沿 Windows + PowerShell 用户偏好);**Bash heredoc 等价见 Task 1 GREEN commit 下方注脚** — implementer 在 Bash 环境按相同消息内容用 `git commit -m "$(cat <<'EOF'...EOF)"` 改写即可,无需重复列出每 Task 的 Bash 版本。

---

## 0. 文档状态声明 + Pattern A 教训沿用

**本 plan 实施完成前,以下代码状态为 plan-9g 现状(brainstorm spec §0.0 已声明)**:
- `src/core/schemas/archive-summary.ts:64-73` ProcessEvidenceSummary 仅 3 字段(placeholder/passed/failed/exempt),无 invariants_with_warning
- `src/core/archive/fence.ts:25-30` FenceInvariantResult 仅 `{ invariant, ok, reason }` 三字段,无 status enum 无 LEGACY_EXEMPT_INVARIANTS 常量
- `src/core/archive/fence.ts:197-205` mapper 只筛 criticalFindings,WARNING 落 'pass'
- `src/core/archive/summary-builder.ts:118` 硬写 `process_evidence_summary: PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY`,签名无 fenceResult 入参
- `src/core/validate/archive-summary-schema.ts:651-665` 仅校验 process_evidence_summary 是 object,不校验内部字段
- `src/cli/commands/archive.ts:231` fenceResult 用完即丢
- `commands/archive.md` + `src/core/templates/commands/archive.md`(两份 md5 完全一致)line 53/66/141/144 仍带 "9e2 待 9g 完成后" 字面

**Pattern A 教训沿用(plan-9j v3 + plan-9g v6 教训)**:本 plan 99% 实施细节已 inline,每 Task RED test + GREEN 代码完整,不留 "TBD / 类似 Task N / similar to above"。

---

## 1. File Structure

| 文件 | 改动量 | 责任 | Task |
|---|---|---|---|
| `src/core/schemas/archive-summary.ts` | +5 行 + JSDoc | ProcessEvidenceSummary 加 invariants_with_warning 字段 | T1 |
| `src/core/archive/fence.ts` | +8 行 + mapper 重写 | FenceInvariantResult 加 status 4 态 + LEGACY_EXEMPT_INVARIANTS 常量 + mapper 改并集 + WARNING 处理 | T1 |
| `src/core/archive/summary-builder.ts` | +35 行 | summarizeProcessEvidence + 签名扩 | T2 |
| `src/core/validate/archive-summary-schema.ts` | +30 行 | placeholder=false 路径严格校验扩 | T3 |
| `src/cli/commands/archive.ts` | ~3 行 | fenceResult 透传 | T4 |
| `commands/archive.md` | ~10 行 | 双改根级 slash command | T5 |
| `src/core/templates/commands/archive.md` | ~10 行 | 双改模板 | T5 |
| `tests/core/archive/fence-mapper.test.ts` | 新文件 ~280 行 | 9 case 4 态 mapper 单测 | T1 |
| `tests/core/archive/summary-builder.test.ts` | 扩 ~150 行 | 5 case summarize 单测 | T2 |
| `tests/core/validate/archive-summary-schema.test.ts` | 扩 ~150 行 | 8 case schema 严格校验 | T3 |
| `tests/cli/archive-process-evidence-summary.test.ts` | 新文件 ~300 行 | 5 case integration(含副作用)| T4 |
| `tests/integration/archive-md-sync.test.ts` | 新文件 ~30 行 | md5 sync 守护单测 | T5 |
| `tests/utils/build-archive-fixture.ts` | 新文件 ~200 行 | `buildProcessEvidenceFixture(opts)` helper 程序化构造 verify/review marker + sha256 hash 链(v2 codex 一轮 plan review BLOCKER 1 修订:仓库无 plan-9g baseline fixture,改为代码构造)| T6 |
| `tests/fixtures/archive-9e2-stub/` | 新 fixture stub 目录 | 4 scenario 共享的 tasks.md / proposal.md / design.md(不含 marker yaml,marker 由 builder helper 注入到 mkdtemp)| T6 |

---

## 2. Task 1 — fence.ts 4 态 status enum + LEGACY_EXEMPT_INVARIANTS + mapper 重写 + archive-summary.ts schema 扩字段

**Implementer**:sonnet(multi-file + 设计面 — schema 扩字段 + fence mapper 重写 + 4 态优先级)
**Spec reviewer**:sonnet
**Quality reviewer**:sonnet

**Files**:
- Modify: `src/core/schemas/archive-summary.ts:64-73`
- Modify: `src/core/archive/fence.ts:25-30` + `:194-205`
- Create: `tests/core/archive/fence-mapper.test.ts`

### Step 1: 先写 RED 失败测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/core/archive/fence-mapper.test.ts`**

```typescript
// fence-mapper.test.ts — plan-9e2 Task 1 单测
// 9 case 覆盖 4 态 status enum mapper + dual-legacy 并集 + 优先级
// fail > legacy-skip > warning > pass
// v2 codex 一轮 plan review MINOR 3 修订:简化 imports,纯 mapper 单测无需 IO

import { describe, it, expect } from 'vitest';
import {
  FENCE_INVARIANT_NAMES,
  LEGACY_EXEMPT_INVARIANTS,
  mapFindingsToResults,
} from '../../../src/core/archive/fence.js';
import type { ProcessEvidenceFinding } from '../../../src/core/archive/process-evidence-fence.js';

describe('crossCuttingFenceCheck module-level constants', () => {
  it('LEGACY_EXEMPT_INVARIANTS 常量导出 size === 10 + 内容匹配 §3.4.4.1', () => {
    expect(LEGACY_EXEMPT_INVARIANTS.size).toBe(10);
    expect([...LEGACY_EXEMPT_INVARIANTS].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 10, 13,
    ]);
  });

  it('FENCE_INVARIANT_NAMES.length === 14(plan-9g brainstorm v6 锁定)', () => {
    expect(FENCE_INVARIANT_NAMES.length).toBe(14);
  });

  // 注:更精确的 4 态 mapper 单元测试通过 export 的 `mapFindingsToResults` 纯函数测试(下方 describe 块)
  //     沿 plan-9d / 9j 同纯函数提取模式;crossCuttingFenceCheck 的 IO 路径由 plan-9g 现有 process-evidence-fence.test.ts 覆盖
  //     本 describe 块仅守 LEGACY_EXEMPT_INVARIANTS 常量 + FENCE_INVARIANT_NAMES 长度两个 module-level invariant
  //     (v2 codex 一轮 plan review MINOR 3 修订:删空体 sanity case,不留 placeholder)
});

// ============================================================
// mapFindingsToResults 纯函数版 mapper 单元测试(沿 plan-9d 同模式)
// v2 codex 一轮 plan review MAJOR 3 修订:import 已在文件顶部,本块不重复
// ============================================================

describe('mapFindingsToResults — 4 态 mapper 纯函数', () => {
  it('non-legacy + 无 finding → 14 个 status="pass"', () => {
    const results = mapFindingsToResults({
      findings: [],
      effectiveLegacyExempt: false,
    });
    expect(results).toHaveLength(14);
    expect(results.every((r) => r.status === 'pass' && r.ok === true)).toBe(true);
    expect(results.every((r) => r.reason === 'pass')).toBe(true);
  });

  it('non-legacy + 1 WARNING(fence-10) → fence-10 status="warning",其余 "pass";fence.ok=true', () => {
    const findings: ProcessEvidenceFinding[] = [
      { invariant: 10, severity: 'WARNING', message: 'env_hash mismatch' },
    ];
    const results = mapFindingsToResults({ findings, effectiveLegacyExempt: false });
    const ten = results.find((r) => r.invariant === 'fence-10');
    expect(ten?.status).toBe('warning');
    expect(ten?.ok).toBe(true);
    expect(ten?.reason).toBe('env_hash mismatch');
    expect(results.filter((r) => r.status === 'pass')).toHaveLength(13);
    expect(results.some((r) => r.status === 'fail')).toBe(false);
  });

  it('legacy(verify-only) + 14 全无 finding → #1-8/10/13 status="legacy-skip"(10),#9/11/12/14 "pass"(4)', () => {
    const results = mapFindingsToResults({
      findings: [],
      effectiveLegacyExempt: true,
    });
    const skip = results.filter((r) => r.status === 'legacy-skip');
    const pass = results.filter((r) => r.status === 'pass');
    expect(skip).toHaveLength(10);
    expect(pass).toHaveLength(4);
    expect(skip.map((r) => r.invariant).sort()).toEqual([
      'fence-1',
      'fence-10',
      'fence-13',
      'fence-2',
      'fence-3',
      'fence-4',
      'fence-5',
      'fence-6',
      'fence-7',
      'fence-8',
    ]);
    expect(pass.map((r) => r.invariant).sort()).toEqual([
      'fence-11',
      'fence-12',
      'fence-14',
      'fence-9',
    ]);
  });

  it('legacy(并集等价于 verify-only legacy) + 14 全无 finding → 等同上一 case', () => {
    // mapFindingsToResults 入参只看 effectiveLegacyExempt boolean,并集语义在 caller(crossCuttingFenceCheck)
    // 本测试钉住 boolean=true 路径与 verify-only 路径输出一致
    const results = mapFindingsToResults({
      findings: [],
      effectiveLegacyExempt: true,
    });
    expect(results.filter((r) => r.status === 'legacy-skip')).toHaveLength(10);
    expect(results.filter((r) => r.status === 'pass')).toHaveLength(4);
  });

  it('legacy + 1 WARNING 落保留 invariant(fence-9)→ fence-9 status="warning",豁免表中仍 "legacy-skip"', () => {
    const findings: ProcessEvidenceFinding[] = [
      { invariant: 9, severity: 'WARNING', message: 'JCS hash WARNING (synthetic)' },
    ];
    const results = mapFindingsToResults({ findings, effectiveLegacyExempt: true });
    const nine = results.find((r) => r.invariant === 'fence-9');
    expect(nine?.status).toBe('warning');
    expect(nine?.ok).toBe(true);
    expect(results.filter((r) => r.status === 'legacy-skip')).toHaveLength(10);
    expect(results.filter((r) => r.status === 'pass')).toHaveLength(3); // #11/#12/#14
    expect(results.filter((r) => r.status === 'warning')).toHaveLength(1);
  });

  it('legacy + 1 WARNING 落豁免 invariant(fence-10)→ fence-10 标 "legacy-skip"(优先级高于 warning),不计 warning', () => {
    const findings: ProcessEvidenceFinding[] = [
      { invariant: 10, severity: 'WARNING', message: 'env_hash mismatch' },
    ];
    const results = mapFindingsToResults({ findings, effectiveLegacyExempt: true });
    const ten = results.find((r) => r.invariant === 'fence-10');
    expect(ten?.status).toBe('legacy-skip');
    expect(ten?.ok).toBe(true);
    expect(ten?.reason).toBe('legacy-exempt per master §3.4.4.1');
    expect(results.filter((r) => r.status === 'warning')).toHaveLength(0);
  });

  it('non-legacy + 1 CRITICAL(fence-9)→ fence-9 status="fail",其余 "pass";fence.ok=false 由 caller 判断', () => {
    const findings: ProcessEvidenceFinding[] = [
      { invariant: 9, severity: 'CRITICAL', message: 'JCS hash mismatch' },
    ];
    const results = mapFindingsToResults({ findings, effectiveLegacyExempt: false });
    const nine = results.find((r) => r.invariant === 'fence-9');
    expect(nine?.status).toBe('fail');
    expect(nine?.ok).toBe(false);
    expect(nine?.reason).toBe('JCS hash mismatch');
    expect(results.filter((r) => r.status === 'pass')).toHaveLength(13);
  });

  it('legacy + 1 保留不变量 CRITICAL(fence-9)→ fence-9 "fail",豁免表中仍 "legacy-skip",优先级 fail > legacy-skip 不冲突(fence-9 不在豁免表)', () => {
    const findings: ProcessEvidenceFinding[] = [
      { invariant: 9, severity: 'CRITICAL', message: 'JCS hash mismatch' },
    ];
    const results = mapFindingsToResults({ findings, effectiveLegacyExempt: true });
    const nine = results.find((r) => r.invariant === 'fence-9');
    expect(nine?.status).toBe('fail');
    expect(results.filter((r) => r.status === 'legacy-skip')).toHaveLength(10);
    expect(results.filter((r) => r.status === 'fail')).toHaveLength(1);
  });

  it('同一 invariant 同时有 CRITICAL + WARNING → status="fail"(优先级最高)', () => {
    const findings: ProcessEvidenceFinding[] = [
      { invariant: 9, severity: 'CRITICAL', message: 'JCS critical' },
      { invariant: 9, severity: 'WARNING', message: 'JCS warning (synthetic dup)' },
    ];
    const results = mapFindingsToResults({ findings, effectiveLegacyExempt: false });
    const nine = results.find((r) => r.invariant === 'fence-9');
    expect(nine?.status).toBe('fail');
    expect(nine?.reason).toBe('JCS critical');
  });
});
```

- [ ] **Step 1.2: 跑测试确认全红(预期 FAIL:`mapFindingsToResults` / `LEGACY_EXEMPT_INVARIANTS` 未导出)**

Run: `pnpm vitest run tests/core/archive/fence-mapper.test.ts`
Expected: FAIL — `mapFindingsToResults is not a function` / `LEGACY_EXEMPT_INVARIANTS is not exported`

- [ ] **Step 1.3: RED commit**

(PowerShell)
```powershell
@'
test(9e2 Task 1 RED): fence-mapper 9 case + LEGACY_EXEMPT_INVARIANTS 断言

沿 brainstorm spec §5.1 测试矩阵 case 1-9 + 边界:
- LEGACY_EXEMPT_INVARIANTS size === 10 + 内容匹配 §3.4.4.1
- FENCE_INVARIANT_NAMES.length === 14
- mapFindingsToResults 纯函数:non-legacy/legacy × pass/warning/fail/legacy-skip 四态
- 优先级:fail > legacy-skip > warning > pass(legacy 路径下被豁免 invariant 的 WARNING 被吞)
- 同 invariant CRITICAL + WARNING → fail(最高优先级)

红:mapFindingsToResults + LEGACY_EXEMPT_INVARIANTS 未导出 → FAIL

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@ | Out-File -Encoding utf8 .git/COMMIT_MSG_T1_RED
git add tests/core/archive/fence-mapper.test.ts
git commit -F .git/COMMIT_MSG_T1_RED
Remove-Item .git/COMMIT_MSG_T1_RED
```

### Step 2: 实现 — archive-summary.ts schema 扩字段 + fence.ts mapper 重写(GREEN)

- [ ] **Step 2.1: 修改 `src/core/schemas/archive-summary.ts:55-73` 加 invariants_with_warning 字段**

替换 `ProcessEvidenceSummary` interface 整段(line 55-73):
```typescript
/**
 * process_evidence_summary — 14 不变量分布(9g/9e2 真实填,9e1 仅 placeholder)
 *
 * placeholder=true 表示本字段是 9e1 占位,9e2 实施时改为真实统计:
 *   - placeholder: false
 *   - invariants_passed: number(经 mapper 优先级筛选后仍为 status='pass' 的 invariant 数)
 *   - invariants_with_warning: number(经 mapper 优先级筛选后仍为 status='warning' 的 invariant 数)
 *   - invariants_failed: number(v1.0 永远 = 0,fence.ok=false 时 archive 直接 exit 1,summary 不写入)
 *   - legacy_exempt: number(legacy marker 豁免数 — verify || review 任一为 legacy 即触发,沿 §3.4.4.1)
 *
 * **精度损失说明(v1.0 接受)**:legacy 路径下被豁免的 invariant 即使产 WARNING 也优先标 'legacy-skip'
 * 不计入 invariants_with_warning;特别是 review-only legacy + verify-side WARNING 副作用
 * (沿 brainstorm spec §4.3 边界场景 + §7 遗留 #8);WARNING 实际信息仍走 acked_warnings(freeze-time)
 * 或 stderr(rerun-time)双路径不丢,仅 summary 中 invariants_with_warning 计数偏低;
 * v1.1+ side-aware mapper 修复。
 *
 * **sum 不变式**:invariants_passed + invariants_with_warning + invariants_failed + legacy_exempt
 *               === FENCE_INVARIANT_NAMES.length(14)
 */
export interface ProcessEvidenceSummary {
  /** true = 9e1 占位;false = 9e2 真实统计 */
  placeholder: boolean;
  /** placeholder=true 时填说明 */
  note?: string;
  /** placeholder=false 时填具体数;9e2 接 9g */
  invariants_passed?: number;
  /** placeholder=false 时填具体数;9e2 v2 codex 一轮 MAJOR 修订新增字段;legacy 路径下被豁免 invariant 的 WARNING 不计入(精度损失,见上述说明) */
  invariants_with_warning?: number;
  /** placeholder=false 时填具体数;v1.0 永远 = 0(fence.ok=false 时 archive exit 1,summary 不写入) */
  invariants_failed?: number;
  /** placeholder=false 时填具体数;verify || review 任一为 legacy 时该 invariant 在 §3.4.4.1 豁免表内被跳 */
  legacy_exempt?: number;
}
```

- [ ] **Step 2.2: 修改 `src/core/archive/fence.ts:25-30` FenceInvariantResult 加 status 4 态字段**

替换 `FenceInvariantResult` interface 整段(line 25-30):
```typescript
/** 单个不变量的检查结果(plan-9e2 v2 codex 一轮 MAJOR 修订:加 status 4 态 enum) */
export interface FenceInvariantResult {
  invariant: string;
  /** plan-9g 现有字段,保留 backwards-compat;不变式 status === 'fail' ⟺ ok === false */
  ok: boolean;
  /** plan-9e2 新增 4 态 status;优先级 fail > legacy-skip > warning > pass */
  status: 'pass' | 'warning' | 'fail' | 'legacy-skip';
  reason: string;
}
```

- [ ] **Step 2.3: 修改 `src/core/archive/fence.ts:62` 后(FENCE_INVARIANT_NAMES 常量声明之后)插入 LEGACY_EXEMPT_INVARIANTS 模块级常量**

在 `export type FenceInvariantName = ...` 行之后,`crossCuttingFenceCheck` 函数声明之前插入:
```typescript
/**
 * plan-9e2 v2 codex 一轮 MAJOR 修订:legacy 路径下被精确豁免的 invariant 编号集合
 * 沿 master §3.4.4.1:14 不变量中 #1-8/10/13 跳过(共 10 个),#9/11/12/14 保留校验
 *
 * 导出供测试断言用(`expect(LEGACY_EXEMPT_INVARIANTS.size).toBe(10)`)
 * + summary builder summarizeProcessEvidence reference(但不直接用,通过 status='legacy-skip' 折数)
 */
export const LEGACY_EXEMPT_INVARIANTS: ReadonlySet<number> = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 10, 13,
]);
```

- [ ] **Step 2.4: 修改 `src/core/archive/fence.ts:194-205` mapper 重写(WARNING + dual-legacy 并集 + 4 态优先级)**

替换 `crossCuttingFenceCheck()` 函数内 line 192-211 区段(从 `const allFindings` 到 `return { ok: ... }`):
```typescript
  // 5. 汇合 + 输出 FenceCheckResult(verify + review + rerun;v2 M-1 加 reviewFindings)
  // plan-9e2 v2 codex 一轮 MAJOR 修订:同时筛 CRITICAL + WARNING + 取 verify||review legacy 并集
  const allFindings = [...fieldFindings, ...reviewFindings, ...rerunFindings];

  // plan-9e2 v2 codex 一轮 MAJOR 修订:legacyExempt 取 verify || review 并集
  // 沿 fence.ts:115/153-164 当前已两源独立读约定;v1.0 精度损失 = 无法区分 verify-only / review-only legacy
  const reviewLegacyExempt =
    (reviewMarker?.process_evidence_unavailable_legacy as boolean | undefined) === true;
  const effectiveLegacyExempt = legacyExempt || reviewLegacyExempt;

  const results = mapFindingsToResults({
    findings: allFindings,
    effectiveLegacyExempt,
  });
  const ok = !results.some((r) => r.status === 'fail');

  return {
    ok,
    results,
    notImplementedCount: 0, // 9g 完成,permanent 0
  };
}

/**
 * mapFindingsToResults — 14 不变量 finding → FenceInvariantResult[14] 纯函数 mapper
 *
 * plan-9e2 v2 codex 一轮 MAJOR 修订:从内联代码提取为纯函数(沿 plan-9d / 9j 同模式),便于单元测试
 *
 * 优先级:fail > legacy-skip > warning > pass
 *   1. 任一 invariant 有 CRITICAL → status='fail' / ok=false
 *   2. legacy 路径下被豁免 invariant(在 LEGACY_EXEMPT_INVARIANTS 集合内)→ status='legacy-skip' / ok=true
 *   3. 任一 invariant 有 WARNING(未被前两级覆盖)→ status='warning' / ok=true
 *   4. 默认 → status='pass' / ok=true
 *
 * 精度损失:legacy 路径下被豁免 invariant 即使产 WARNING 也被吞为 'legacy-skip',不计入 warning
 *           (沿 brainstorm spec §4.3 副作用,v1.0 接受,v1.1+ side-aware 拆分)
 */
export function mapFindingsToResults(opts: {
  findings: readonly ProcessEvidenceFinding[];
  effectiveLegacyExempt: boolean;
}): FenceInvariantResult[] {
  const { findings, effectiveLegacyExempt } = opts;
  const criticalFindings = findings.filter((f) => f.severity === 'CRITICAL');
  const warningFindings = findings.filter((f) => f.severity === 'WARNING');

  return FENCE_INVARIANT_NAMES.map<FenceInvariantResult>((name) => {
    const inv = parseInt(name.replace('fence-', ''), 10);
    // 1. fail 最高优先级
    const fail = criticalFindings.find((f) => f.invariant === inv);
    if (fail) {
      return { invariant: name, ok: false, status: 'fail', reason: fail.message };
    }
    // 2. legacy-skip 次优先(legacy 路径下被豁免 invariant 不论是否产 WARNING 均标 skip)
    if (effectiveLegacyExempt && LEGACY_EXEMPT_INVARIANTS.has(inv)) {
      return {
        invariant: name,
        ok: true,
        status: 'legacy-skip',
        reason: 'legacy-exempt per master §3.4.4.1',
      };
    }
    // 3. warning 次次优先(沿 design §2.7.3 #7/#10/#13)
    const warn = warningFindings.find((f) => f.invariant === inv);
    if (warn) {
      return { invariant: name, ok: true, status: 'warning', reason: warn.message };
    }
    // 4. 真过
    return { invariant: name, ok: true, status: 'pass', reason: 'pass' };
  });
}
```

注:本 step 替换了原 line 196-211 区段(从注释 `// 把 14 个不变量映射...` 到 `}` 闭合)+ 末尾插入新导出的 `mapFindingsToResults`。

- [ ] **Step 2.5: 跑测试确认 9 case 全 PASS**

Run: `pnpm vitest run tests/core/archive/fence-mapper.test.ts`
Expected: PASS — 9/9 case green

- [ ] **Step 2.6: 跑现有 fence.test.ts 确保未回归**

Run: `pnpm vitest run tests/cli/process-evidence-fence.test.ts tests/cli/process-evidence-rerun.test.ts`
Expected: PASS — plan-9g 现有 fence 测试不破(`ok` + `reason` 字段语义未变;status 字段新增但所有现有 result 仍有 ok 字段)

### Step 3: 全本地 verify + commit Task 1

- [ ] **Step 3.1: 跑 typecheck + lint + format:check**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: 全 PASS

- [ ] **Step 3.2: GREEN commit Task 1**

```powershell
@'
feat(9e2 Task 1 GREEN): fence 4 态 status enum + LEGACY_EXEMPT_INVARIANTS + mapper 重写

实施 plan-9e2 brainstorm spec §3.1-3.2:
- archive-summary.ts ProcessEvidenceSummary 加 invariants_with_warning?: number 字段(v2 codex 一轮 MAJOR);JSDoc 注释含 sum 不变式 + legacy 精度损失说明
- fence.ts FenceInvariantResult 加 status: 'pass'|'warning'|'fail'|'legacy-skip' 4 态 enum(保留 ok 字段 backwards-compat,plan-9z 阶段考虑 deprecation)
- fence.ts 加 LEGACY_EXEMPT_INVARIANTS = new Set([1-8, 10, 13]) 模块级常量(沿 master §3.4.4.1)
- fence.ts mapper 重写:effectiveLegacyExempt = verifyLegacy || reviewLegacy 并集;从 allFindings 同时筛 CRITICAL + WARNING;优先级 fail > legacy-skip > warning > pass
- mapFindingsToResults 提取为导出纯函数(沿 plan-9d/9j 同模式)便于单测

9 case unit test 全 PASS,现有 fence test 无回归。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@ | Out-File -Encoding utf8 .git/COMMIT_MSG_T1_GREEN
git add src/core/schemas/archive-summary.ts src/core/archive/fence.ts tests/core/archive/fence-mapper.test.ts
git commit -F .git/COMMIT_MSG_T1_GREEN
Remove-Item .git/COMMIT_MSG_T1_GREEN
```

- [ ] **Step 3.3: 验证 Task 1 完成**

Run: `git log -2 --format="%h %s"`
Expected: 看到 GREEN commit + RED commit 各一条

**Bash 等价 commit sample(v2 codex 一轮 plan review MAJOR 6 修订;其他 Task 同模式 implementer 转换)**:

PowerShell 上方 GREEN commit block 的 Bash heredoc 等价:
```bash
git add src/core/schemas/archive-summary.ts src/core/archive/fence.ts tests/core/archive/fence-mapper.test.ts
git commit -m "$(cat <<'EOF'
feat(9e2 Task 1 GREEN): fence 4 态 status enum + LEGACY_EXEMPT_INVARIANTS + mapper 重写

实施 plan-9e2 brainstorm spec §3.1-3.2:
- archive-summary.ts ProcessEvidenceSummary 加 invariants_with_warning?: number 字段(v2 codex 一轮 MAJOR);JSDoc 注释含 sum 不变式 + legacy 精度损失说明
- fence.ts FenceInvariantResult 加 status: 'pass'|'warning'|'fail'|'legacy-skip' 4 态 enum(保留 ok 字段 backwards-compat,plan-9z 阶段考虑 deprecation)
- fence.ts 加 LEGACY_EXEMPT_INVARIANTS = new Set([1-8, 10, 13]) 模块级常量(沿 master §3.4.4.1)
- fence.ts mapper 重写:effectiveLegacyExempt = verifyLegacy || reviewLegacy 并集;从 allFindings 同时筛 CRITICAL + WARNING;优先级 fail > legacy-skip > warning > pass
- mapFindingsToResults 提取为导出纯函数(沿 plan-9d/9j 同模式)便于单测

9 case unit test 全 PASS,现有 fence test 无回归。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Task 2-6 implementer 按相同 message 内容 + 相同 git add file 列表自行用 Bash heredoc 改写,无需重复列出。

---

## 3. Task 2 — summary-builder.ts summarizeProcessEvidence + buildArchiveSummary 签名扩

**Implementer**:sonnet(multi-file — builder 签名扩需所有 caller 同步)
**Spec reviewer**:sonnet
**Quality reviewer**:sonnet

**Files**:
- Modify: `src/core/archive/summary-builder.ts`(import 区 + buildArchiveSummary 签名 + line 118 placeholder 区 + 末尾加 summarizeProcessEvidence 私有 fn)
- Modify: `tests/core/archive/summary-builder.test.ts`(扩 5 case)

### Step 1: 先写 RED 失败测试(TDD red)

- [ ] **Step 1.1: 修改 `tests/core/archive/summary-builder.test.ts` 末尾追加 summarizeProcessEvidence 测试 describe 块**

在文件末尾(`});` 最外层 describe 之后)追加:
```typescript
// ============================================================
// plan-9e2 Task 2:summarizeProcessEvidence + buildArchiveSummary 签名扩 5 case
// ============================================================
// 注:buildArchiveSummary 已在文件顶部 line 14 import,本块不重复 import(v2 codex 一轮 plan review MAJOR 3 修订)
import type { FenceCheckResult } from '../../../src/core/archive/fence.js';

// helper:构造 stub FenceCheckResult
function buildStubFenceResult(opts: {
  passed: number;
  warning: number;
  failed: number;
  exempt: number;
}): FenceCheckResult {
  const results = [];
  let idx = 1;
  for (let i = 0; i < opts.passed; i++) {
    results.push({ invariant: `fence-${idx++}`, ok: true, status: 'pass' as const, reason: 'pass' });
  }
  for (let i = 0; i < opts.warning; i++) {
    results.push({
      invariant: `fence-${idx++}`,
      ok: true,
      status: 'warning' as const,
      reason: 'env_hash mismatch',
    });
  }
  for (let i = 0; i < opts.failed; i++) {
    results.push({
      invariant: `fence-${idx++}`,
      ok: false,
      status: 'fail' as const,
      reason: 'CRITICAL bug',
    });
  }
  for (let i = 0; i < opts.exempt; i++) {
    results.push({
      invariant: `fence-${idx++}`,
      ok: true,
      status: 'legacy-skip' as const,
      reason: 'legacy-exempt per master §3.4.4.1',
    });
  }
  return {
    ok: opts.failed === 0,
    results,
    notImplementedCount: 0,
  };
}

describe('summarizeProcessEvidence 通过 buildArchiveSummary 接入 — plan-9e2 Task 2', () => {
  const baselineVerifyMarker = {
    schema: 'forge-verify/v1',
    verify_findings: [],
  };
  const baselineReviewMarker = {
    schema: 'forge-review/v1',
    reviewed_by: 'ai-agent',
    review_outcomes: [],
  };

  it('14 全 pass → process_evidence_summary 实际统计 {placeholder:false, passed:14, warning:0, failed:0, exempt:0}', async () => {
    const fenceResult = buildStubFenceResult({ passed: 14, warning: 0, failed: 0, exempt: 0 });
    const summary = await buildArchiveSummary(
      baselineVerifyMarker,
      baselineReviewMarker,
      '/tmp/nonexistent-change-dir',
      'test-change-1',
      fenceResult,
      { archivedAt: '2026-05-13T12:00:00Z' },
    );
    expect(summary.process_evidence_summary).toEqual({
      placeholder: false,
      invariants_passed: 14,
      invariants_with_warning: 0,
      invariants_failed: 0,
      legacy_exempt: 0,
    });
  });

  it('legacy + 4 真过 + 10 legacy-skip → {placeholder:false, passed:4, warning:0, failed:0, exempt:10}', async () => {
    const fenceResult = buildStubFenceResult({ passed: 4, warning: 0, failed: 0, exempt: 10 });
    const summary = await buildArchiveSummary(
      baselineVerifyMarker,
      baselineReviewMarker,
      '/tmp/nonexistent-change-dir',
      'test-change-2',
      fenceResult,
      { archivedAt: '2026-05-13T12:01:00Z' },
    );
    expect(summary.process_evidence_summary).toEqual({
      placeholder: false,
      invariants_passed: 4,
      invariants_with_warning: 0,
      invariants_failed: 0,
      legacy_exempt: 10,
    });
  });

  it('non-legacy + 1 WARNING → {placeholder:false, passed:13, warning:1, failed:0, exempt:0}', async () => {
    const fenceResult = buildStubFenceResult({ passed: 13, warning: 1, failed: 0, exempt: 0 });
    const summary = await buildArchiveSummary(
      baselineVerifyMarker,
      baselineReviewMarker,
      '/tmp/nonexistent-change-dir',
      'test-change-3',
      fenceResult,
      { archivedAt: '2026-05-13T12:02:00Z' },
    );
    expect(summary.process_evidence_summary).toEqual({
      placeholder: false,
      invariants_passed: 13,
      invariants_with_warning: 1,
      invariants_failed: 0,
      legacy_exempt: 0,
    });
  });

  it('legacy + 1 WARNING 落保留 invariant + 3 真过 + 10 skip → {placeholder:false, passed:3, warning:1, failed:0, exempt:10}', async () => {
    const fenceResult = buildStubFenceResult({ passed: 3, warning: 1, failed: 0, exempt: 10 });
    const summary = await buildArchiveSummary(
      baselineVerifyMarker,
      baselineReviewMarker,
      '/tmp/nonexistent-change-dir',
      'test-change-4',
      fenceResult,
      { archivedAt: '2026-05-13T12:03:00Z' },
    );
    expect(summary.process_evidence_summary).toEqual({
      placeholder: false,
      invariants_passed: 3,
      invariants_with_warning: 1,
      invariants_failed: 0,
      legacy_exempt: 10,
    });
  });

  it('summary 字段顺序稳定 — process_evidence_summary 出现在 review_passed 之后 handoff_to_backlog 之前(沿 plan-9e1 design §2.4.3 yaml 字面顺序)', async () => {
    const fenceResult = buildStubFenceResult({ passed: 14, warning: 0, failed: 0, exempt: 0 });
    const summary = await buildArchiveSummary(
      baselineVerifyMarker,
      baselineReviewMarker,
      '/tmp/nonexistent-change-dir',
      'test-change-5',
      fenceResult,
      { archivedAt: '2026-05-13T12:04:00Z' },
    );
    const keys = Object.keys(summary);
    const peIdx = keys.indexOf('process_evidence_summary');
    const reviewIdx = keys.indexOf('review_passed');
    const handoffIdx = keys.indexOf('handoff_to_backlog');
    expect(peIdx).toBeGreaterThan(reviewIdx);
    expect(peIdx).toBeLessThan(handoffIdx);
  });
});
```

- [ ] **Step 1.2: 跑测试确认全红**

Run: `pnpm vitest run tests/core/archive/summary-builder.test.ts`
Expected: FAIL — `buildArchiveSummary` 现签名不接受第 5 个参数 fenceResult,TS 编译失败 / 运行时 placeholder 而非真实统计

- [ ] **Step 1.3: RED commit**

```powershell
@'
test(9e2 Task 2 RED): summarizeProcessEvidence + buildArchiveSummary 签名扩 5 case

沿 brainstorm spec §5.1 测试矩阵 case + §3.3-3.4:
- 14 全 pass → {placeholder:false, passed:14, warning:0, failed:0, exempt:0}
- legacy + 4 真过 + 10 skip → exempt:10
- non-legacy + 1 WARNING → warning:1
- legacy + 1 WARNING 落保留 invariant → passed:3 / warning:1 / exempt:10
- 字段顺序稳定 — process_evidence_summary 在 review_passed 之后 handoff_to_backlog 之前

红:buildArchiveSummary 签名未含 fenceResult 入参 → TS 编译失败

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@ | Out-File -Encoding utf8 .git/COMMIT_MSG_T2_RED
git add tests/core/archive/summary-builder.test.ts
git commit -F .git/COMMIT_MSG_T2_RED
Remove-Item .git/COMMIT_MSG_T2_RED
```

### Step 2: 实现 — summary-builder.ts 签名扩 + summarizeProcessEvidence(GREEN)

- [ ] **Step 2.1: 修改 `src/core/archive/summary-builder.ts:13-22` import 区(加 FenceCheckResult)**

替换 import 区(line 13-22):
```typescript
import type { Finding } from '../schemas/severity.js';
import type { PauseDecision } from '../markers/types.js';
import type {
  ArchiveSummary,
  HandoffEntry,
  AckedWarningRef,
  SuggestionRef,
  ProcessEvidenceSummary,
} from '../schemas/archive-summary.js';
import { ARCHIVE_SUMMARY_VERSION } from '../schemas/archive-summary.js';
// plan-9e2 Task 2:接 plan-9g fence 真实统计;PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY 不再生产路径使用
import type { FenceCheckResult } from './fence.js';
import { parseMarkdown } from '../parse/markdown.js';
import { parseFencedYamlBlocks } from '../parse/fenced-yaml.js';
import { SCOPE_ANCHOR_IDS, type ScopeAnchorId, type ScopeEntry } from '../schemas/scope-entries.js';
```

- [ ] **Step 2.2: 修改 `src/core/archive/summary-builder.ts:51-57` buildArchiveSummary 签名扩 fenceResult**

替换函数声明(line 51-57):
```typescript
/**
 * 构造 archive_summary 对象
 *
 * @param verifyMarker .verify-passed 解析后对象(Record 形)
 * @param reviewMarker .review-passed 解析后对象(Record 形)
 * @param changeDir change 目录绝对路径(读 proposal.md / design.md 抽 scope-entries)
 * @param changeId change id 字符串
 * @param fenceResult plan-9g crossCuttingFenceCheck() 输出;9e2 接真实统计(替换 plan-9e1 placeholder)
 * @param opts 可选项
 */
export async function buildArchiveSummary(
  verifyMarker: Record<string, unknown>,
  reviewMarker: Record<string, unknown>,
  changeDir: string,
  changeId: string,
  fenceResult: FenceCheckResult,
  opts: BuildArchiveSummaryOptions = {},
): Promise<ArchiveSummary> {
```

- [ ] **Step 2.3: 修改 `src/core/archive/summary-builder.ts:118` 替换 placeholder 写入**

把:
```typescript
    process_evidence_summary: PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
```

替换为:
```typescript
    process_evidence_summary: summarizeProcessEvidence(fenceResult),
```

- [ ] **Step 2.4: 在 `src/core/archive/summary-builder.ts` 文件末尾追加 summarizeProcessEvidence 私有 fn**

在最后一行 `}` 之后追加(注:summary-builder.ts 末尾通常是 `collectScopeEntriesHandoff` fn 闭合):
```typescript

/**
 * summarizeProcessEvidence — fence 14 不变量统计折数为 ProcessEvidenceSummary
 *
 * plan-9e2 v2 codex 一轮 MAJOR 修订:4 字段计数
 *
 * 输出 4 计数:
 *   - invariants_passed: status='pass' 的数(真过校验)
 *   - invariants_with_warning: status='warning' 的数(WARNING 经 fail/legacy-skip 优先级筛选后保留)
 *   - invariants_failed: status='fail' 的数(v1.0 永远 = 0;fence.ok=false 时 archive 已 exit 1 不进本路径)
 *   - legacy_exempt: status='legacy-skip' 的数(沿 §3.4.4.1)
 *
 * 不变式:passed + warning + failed + exempt === FENCE_INVARIANT_NAMES.length
 *
 * 注:不在 builder 内 throw — 让 archive-summary-schema validator 单点把守不变式
 *     (避免双源校验路径分歧;沿 brainstorm spec §4.2 决策 #1)
 */
function summarizeProcessEvidence(fenceResult: FenceCheckResult): ProcessEvidenceSummary {
  const passed = fenceResult.results.filter((r) => r.status === 'pass').length;
  const warning = fenceResult.results.filter((r) => r.status === 'warning').length;
  const failed = fenceResult.results.filter((r) => r.status === 'fail').length;
  const exempt = fenceResult.results.filter((r) => r.status === 'legacy-skip').length;
  return {
    placeholder: false,
    invariants_passed: passed,
    invariants_with_warning: warning,
    invariants_failed: failed,
    legacy_exempt: exempt,
  };
}
```

- [ ] **Step 2.5: 跑测试确认 5 case PASS**

Run: `pnpm vitest run tests/core/archive/summary-builder.test.ts`
Expected: PASS — 5/5 case green;现有 summary-builder 测试也全 PASS(plan-9e1 现有 ~17 case 不破)

### Step 3: 全本地 verify + commit Task 2

- [ ] **Step 3.1: 跑 typecheck + format**

Run: `pnpm typecheck && pnpm format:check`
Expected: PASS

注:`buildArchiveSummary` 签名扩第 5 参后,所有 caller 必须同步更新(否则 typecheck FAIL)。当前唯一 caller 在 `src/cli/commands/archive.ts:444-446`(plan-9e1 Task 4 立),Task 4 会更新;本步骤 typecheck 会暴露该 caller 编译失败 — **这是预期失败,Task 4 修复**。

**Step 3.1 实际预期**:typecheck FAIL — archive.ts caller 未更新。
**临时绕过**:在本 Task 2 commit 之前,暂时给 archive.ts:444-446 调用处传 stub fenceResult:
```typescript
// archive.ts:444-446 临时改(Task 4 会替换为真实 fenceResult)
const summary = await buildArchiveSummary(
  verifyMarker,
  reviewMarker,
  changeDir,
  changeId,
  { ok: true, results: [], notImplementedCount: 0 }, // 临时 stub,Task 4 改成 fenceResult
  { archivedAt: ... },
);
```

注:这破坏了 plan-9e1 archive 集成测试(因为 stub 让 schema validator 失败 — placeholder=false 但缺字段,沿 Task 3 严格校验)。**Task 2 临时绕过期间,archive 集成测试 SKIP**(用 `vitest run --exclude tests/cli/archive*.test.ts`),Task 4 完整修复。

实际更干净的做法:**Task 2 commit 时同步改 archive.ts:444-446**(本 step 内一同改),不留临时 stub。下方 Step 3.1b 是这个做法:

- [ ] **Step 3.1b(替代 3.1):修改 `src/cli/commands/archive.ts:444-446` 同步加 fenceResult 参(避免 typecheck 失败)**

将:
```typescript
const summary = await buildArchiveSummary(verifyMarker, reviewMarker, changeDir, changeId, {
  archivedAt: toIso8601(new Date()),
});
```

改为(注:fenceResult 已在 archive.ts:231 拿到,本 step 直接 reference;Task 4 会进一步整理调用顺序):
```typescript
// plan-9e2 Task 2 同步改:加 fenceResult 入参(沿 archive.ts:231 现有 crossCuttingFenceCheck 输出)
const summary = await buildArchiveSummary(
  verifyMarker,
  reviewMarker,
  changeDir,
  changeId,
  fenceResult,
  { archivedAt: toIso8601(new Date()) },
);
```

- [ ] **Step 3.1c: 重新跑 typecheck + format**

Run: `pnpm typecheck && pnpm format:check`
Expected: PASS

- [ ] **Step 3.1d: 跑完整 archive + summary-builder 测试确认未回归**

Run: `pnpm vitest run tests/core/archive/ tests/cli/archive*.test.ts`
Expected: PASS(plan-9e1 现有 ~30 case + Task 2 新 5 case 全 PASS)

注:此时 placeholder=false 的 schema validator 还未严格化(Task 3 才做),所以 archive 集成测试中的 baseline summary 仍能过 schema(因为 plan-9e1 schema validator 现状只校 object 形)。Task 3 严格化后 schema validator 会对 sum 不变式严格,如 fenceResult 给出 14 项合法分布则 pass。

- [ ] **Step 3.2: GREEN commit Task 2**

```powershell
@'
feat(9e2 Task 2 GREEN): summarizeProcessEvidence + buildArchiveSummary 签名扩 fenceResult

实施 plan-9e2 brainstorm spec §3.3-3.4:
- summary-builder.ts 加 summarizeProcessEvidence 私有 fn(4 字段计数 — passed/warning/failed/exempt)
- buildArchiveSummary() 签名加 fenceResult: FenceCheckResult 入参(沿 brainstorm spec §2.1 数据流)
- line 118 placeholder 写入替换为 summarizeProcessEvidence(fenceResult);PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY 常量保留供测试 fixture
- archive.ts:444-446 同步更新调用处加 fenceResult 入参(沿 archive.ts:231 现有 crossCuttingFenceCheck 输出)— Task 4 进一步整理调用顺序

5 case unit test 全 PASS,plan-9e1 现有 ~17 case 不破。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@ | Out-File -Encoding utf8 .git/COMMIT_MSG_T2_GREEN
git add src/core/archive/summary-builder.ts src/cli/commands/archive.ts tests/core/archive/summary-builder.test.ts
git commit -F .git/COMMIT_MSG_T2_GREEN
Remove-Item .git/COMMIT_MSG_T2_GREEN
```

---

## 4. Task 3 — archive-summary-schema.ts placeholder=false 路径严格校验

**Implementer**:haiku(mechanical — schema validator 扩 + 单测,沿 plan-9e1 现有模式)
**Spec reviewer**:sonnet
**Quality reviewer**:sonnet

**Files**:
- Modify: `src/core/validate/archive-summary-schema.ts`(line 651-665 区段扩 + import 加 FENCE_INVARIANT_NAMES)
- Modify: `tests/core/schemas/archive-summary-schema.test.ts`(扩 8 case)

### Step 1: 先写 RED 失败测试(TDD red)

- [ ] **Step 1.1: 修改 `tests/core/schemas/archive-summary-schema.test.ts` 末尾追加 8 case**

在文件末尾(最外层 `});` 之前)追加:
```typescript
  // ============================================================
  // plan-9e2 Task 3:placeholder=false 路径严格校验扩 8 case
  // ============================================================
  describe('process_evidence_summary placeholder=false 路径严格校验 — plan-9e2 Task 3', () => {
    const realSummaryBaseline = {
      placeholder: false,
      invariants_passed: 14,
      invariants_with_warning: 0,
      invariants_failed: 0,
      legacy_exempt: 0,
    };

    function buildWithPeSummary(peSummary: Record<string, unknown>): Record<string, unknown> {
      return { ...baseSummary, process_evidence_summary: peSummary };
    }

    it('placeholder=false 缺 invariants_passed → 拒签', () => {
      const { invariants_passed, ...rest } = realSummaryBaseline;
      const result = validateArchiveSummarySchema(buildWithPeSummary(rest));
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'process_evidence_summary.invariants_passed'),
      ).toBe(true);
    });

    it('placeholder=false 缺 invariants_with_warning → 拒签(v2 codex 一轮 MAJOR 修订新字段)', () => {
      const { invariants_with_warning, ...rest } = realSummaryBaseline;
      const result = validateArchiveSummarySchema(buildWithPeSummary(rest));
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'process_evidence_summary.invariants_with_warning'),
      ).toBe(true);
    });

    it('placeholder=false 缺 invariants_failed → 拒签', () => {
      const { invariants_failed, ...rest } = realSummaryBaseline;
      const result = validateArchiveSummarySchema(buildWithPeSummary(rest));
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'process_evidence_summary.invariants_failed'),
      ).toBe(true);
    });

    it('placeholder=false 缺 legacy_exempt → 拒签', () => {
      const { legacy_exempt, ...rest } = realSummaryBaseline;
      const result = validateArchiveSummarySchema(buildWithPeSummary(rest));
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'process_evidence_summary.legacy_exempt'),
      ).toBe(true);
    });

    it('placeholder=false invariants_with_warning = -1 → "must be in [0, 14]"', () => {
      const result = validateArchiveSummarySchema(
        buildWithPeSummary({ ...realSummaryBaseline, invariants_with_warning: -1, invariants_passed: 15 }),
      );
      // 注:passed=15 也越界,但本 case 主断 with_warning;sum 不变式由后续 case 单独测
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.field === 'process_evidence_summary.invariants_with_warning' &&
            /must be in \[0, 14\]/.test(e.message),
        ),
      ).toBe(true);
    });

    it('placeholder=false invariants_passed = 15 → "must be in [0, 14]"', () => {
      const result = validateArchiveSummarySchema(
        buildWithPeSummary({
          ...realSummaryBaseline,
          invariants_passed: 15,
          invariants_with_warning: -1, // 拉低让 sum 仍 = 14 避免触发 sum 错混淆
        }),
      );
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.field === 'process_evidence_summary.invariants_passed' &&
            /must be in \[0, 14\]/.test(e.message),
        ),
      ).toBe(true);
    });

    it('placeholder=false sum 不变式破(passed=10 / warning=0 / failed=0 / exempt=5,sum=15)→ 拒签', () => {
      const result = validateArchiveSummarySchema(
        buildWithPeSummary({
          placeholder: false,
          invariants_passed: 10,
          invariants_with_warning: 0,
          invariants_failed: 0,
          legacy_exempt: 5,
        }),
      );
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.field === 'process_evidence_summary' && /sum invariant: 15 !== 14/.test(e.message),
        ),
      ).toBe(true);
    });

    it('placeholder=false sum 不变式破(passed=4 / warning=1 / failed=0 / exempt=10,sum=15)→ 拒签', () => {
      const result = validateArchiveSummarySchema(
        buildWithPeSummary({
          placeholder: false,
          invariants_passed: 4,
          invariants_with_warning: 1,
          invariants_failed: 0,
          legacy_exempt: 10,
        }),
      );
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.field === 'process_evidence_summary' && /sum invariant: 15 !== 14/.test(e.message),
        ),
      ).toBe(true);
    });

    it('placeholder=true 路径(plan-9e1 容忍)→ 通过(backward-compat)', () => {
      const result = validateArchiveSummarySchema(
        buildWithPeSummary({ placeholder: true, note: 'placeholder' }),
      );
      expect(result.valid).toBe(true);
    });

    it('placeholder=false sum 不变式成立 + 4 字段值域内 → 通过', () => {
      const result = validateArchiveSummarySchema(buildWithPeSummary(realSummaryBaseline));
      expect(result.valid).toBe(true);
    });
  });
```

- [ ] **Step 1.2: 跑测试确认全红**

Run: `pnpm vitest run tests/core/schemas/archive-summary-schema.test.ts`
Expected: FAIL — 多数 case fail(validator 现仅校验 process_evidence_summary 是 object,不校内部字段)

- [ ] **Step 1.3: RED commit**

```powershell
@'
test(9e2 Task 3 RED): archive-summary-schema placeholder=false 严格校验 10 case

沿 brainstorm spec §5.1 测试矩阵(v2 codex 一轮 plan review MINOR 2 修订:8 → 10 计数):
- 缺 invariants_passed / invariants_with_warning / invariants_failed / legacy_exempt 各拒签(4)
- invariants_with_warning = -1 / invariants_passed = 15 越界拒签 "must be in [0, 14]"(2)
- sum 不变式破 2 case(passed+failed+exempt=15 / passed+warning+exempt=15)拒签 "sum invariant"(2)
- placeholder=true 路径(plan-9e1 容忍)通过(1)
- 4 字段值域内 + sum=14 通过(1)
合计 10 case

红:validator 现仅校 object,不校内部字段 → FAIL

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@ | Out-File -Encoding utf8 .git/COMMIT_MSG_T3_RED
git add tests/core/schemas/archive-summary-schema.test.ts
git commit -F .git/COMMIT_MSG_T3_RED
Remove-Item .git/COMMIT_MSG_T3_RED
```

### Step 2: 实现 — archive-summary-schema.ts 扩严格校验(GREEN)

- [ ] **Step 2.1: 修改 `src/core/validate/archive-summary-schema.ts` 顶部 import + 模块级常量(v2 codex 一轮 plan review MAJOR 5 修订:EXPECTED_INVARIANT_COUNT 提升模块级)**

在现有 import 之后追加:
```typescript
// plan-9e2 Task 3:派生 EXPECTED_INVARIANT_COUNT 从 FENCE_INVARIANT_NAMES.length(自动跟随 invariant 数演化)
import { FENCE_INVARIANT_NAMES } from '../archive/fence.js';

/**
 * plan-9e2 v2 codex 一轮 plan review MAJOR 5 修订:模块级派生常量
 * 沿 brainstorm spec §3.5 + DoD 显式要求"派生常量"语义 — 不放函数内 const,模块级单源
 * 后续若 invariant 数演化(plan-v1.1+),本常量自动跟随 FENCE_INVARIANT_NAMES.length
 */
const EXPECTED_INVARIANT_COUNT = FENCE_INVARIANT_NAMES.length;
```

- [ ] **Step 2.2: 在 `src/core/validate/archive-summary-schema.ts:651-665` process_evidence_summary 校验区段后插入 placeholder=false 严格校验**

定位现有代码(plan-9e1 写的):
```typescript
  // 7. process_evidence_summary 必填 object(9e1 仅 placeholder,9e2 接 9g 真实统计;两态都得过 schema)
  if (
    !obj.process_evidence_summary ||
    typeof obj.process_evidence_summary !== 'object' ||
    Array.isArray(obj.process_evidence_summary)
  ) {
    errors.push(
      err({
        field: 'process_evidence_summary',
        message: 'must be object (9e1 placeholder, 9e2 接 9g 真实统计)',
      }),
    );
  }
```

在其后(同一函数内,但在 errors 返回前)追加:
```typescript
  // plan-9e2 Task 3:placeholder=false 路径严格校验(v2 codex 一轮 MAJOR 修订:4 字段 + sum 不变式)
  if (
    obj.process_evidence_summary &&
    typeof obj.process_evidence_summary === 'object' &&
    !Array.isArray(obj.process_evidence_summary)
  ) {
    const peSummary = obj.process_evidence_summary as Record<string, unknown>;
    if (peSummary.placeholder === false) {
      // EXPECTED_INVARIANT_COUNT 从模块顶层 import(v2 codex 一轮 plan review MAJOR 5 修订)
      const REQUIRED_FIELDS = [
        'invariants_passed',
        'invariants_with_warning',
        'invariants_failed',
        'legacy_exempt',
      ] as const;

      // 1. 4 字段必填 + number
      for (const field of REQUIRED_FIELDS) {
        if (typeof peSummary[field] !== 'number') {
          errors.push(
            err({
              field: `process_evidence_summary.${field}`,
              message: `required number when placeholder=false`,
            }),
          );
        }
      }

      // 仅当 4 字段全部为 number 才走值域 + sum 不变式(避免 NaN 干扰)
      if (REQUIRED_FIELDS.every((f) => typeof peSummary[f] === 'number')) {
        // 2. 值域 [0, EXPECTED_INVARIANT_COUNT]
        for (const field of REQUIRED_FIELDS) {
          const v = peSummary[field] as number;
          if (v < 0 || v > EXPECTED_INVARIANT_COUNT) {
            errors.push(
              err({
                field: `process_evidence_summary.${field}`,
                message: `must be in [0, ${EXPECTED_INVARIANT_COUNT}]`,
              }),
            );
          }
        }
        // 3. sum 不变式(v2 codex 一轮 MAJOR 修订:4 字段 sum)
        const sum =
          (peSummary.invariants_passed as number) +
          (peSummary.invariants_with_warning as number) +
          (peSummary.invariants_failed as number) +
          (peSummary.legacy_exempt as number);
        if (sum !== EXPECTED_INVARIANT_COUNT) {
          errors.push(
            err({
              field: 'process_evidence_summary',
              message: `sum invariant: ${sum} !== ${EXPECTED_INVARIANT_COUNT}`,
            }),
          );
        }
      }
    }
    // placeholder=true 路径不变(9e1 容忍)
  }
```

注:`err()` 是 plan-9e1 文件内现有 helper(`{ field, message } => { field, message }` 工厂),沿用。

- [ ] **Step 2.3: 跑测试确认 8 case PASS + 现有 archive-summary-schema 测试不破**

Run: `pnpm vitest run tests/core/schemas/archive-summary-schema.test.ts`
Expected: PASS — 现有 ~12 case + 新 10 case 全 PASS

### Step 3: 全本地 verify + commit Task 3

- [ ] **Step 3.1: 跑 typecheck + lint + format + 完整测试**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run`
Expected: 全 PASS

- [ ] **Step 3.2: GREEN commit Task 3**

```powershell
@'
feat(9e2 Task 3 GREEN): archive-summary-schema placeholder=false 严格校验

实施 plan-9e2 brainstorm spec §3.5:
- archive-summary-schema.ts placeholder=false 路径加 4 字段必填校验(passed/with_warning/failed/exempt)
- 值域 [0, EXPECTED_INVARIANT_COUNT] 校验(EXPECTED_INVARIANT_COUNT 派生自 FENCE_INVARIANT_NAMES.length 自动跟随 invariant 数演化)
- sum 不变式:passed + with_warning + failed + exempt === EXPECTED_INVARIANT_COUNT
- placeholder=true 路径不变(plan-9e1 backward-compat)

10 case unit test 全 PASS,plan-9e1 现有 ~12 case 不破。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@ | Out-File -Encoding utf8 .git/COMMIT_MSG_T3_GREEN
git add src/core/validate/archive-summary-schema.ts tests/core/schemas/archive-summary-schema.test.ts
git commit -F .git/COMMIT_MSG_T3_GREEN
Remove-Item .git/COMMIT_MSG_T3_GREEN
```

---

## 5. Task 4 — archive.ts:231 fenceResult 透传 + integration 5 case

**Implementer**:haiku(mechanical — 透传 + integration test 沿 plan-9e1 现有 archive 测试模式)
**Spec reviewer**:sonnet
**Quality reviewer**:sonnet

**Files**:
- Modify: `src/cli/commands/archive.ts:231-241`(fence 调用区段确认 fenceResult 透传到 buildArchiveSummary;Task 2 Step 3.1b 已临时改,本 Task 整理调用顺序确认)
- Create: `tests/cli/archive-process-evidence-summary.test.ts`

### Step 1: 先写 RED 失败测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/cli/archive-process-evidence-summary.test.ts`**

```typescript
// archive-process-evidence-summary.test.ts — plan-9e2 Task 4 integration
// 5 case:non-legacy / non-legacy+WARNING / verify-legacy / review-legacy / review-only legacy + verify WARNING 副作用回归
// 沿 plan-9e1 tests/cli/archive*.test.ts 同 e2e 模式;fixture 在 Task 6 创建,本 Task 用临时 mkdtemp + 手写 marker

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { execSync } from 'node:child_process';

// 假设 forge CLI 已构建到 dist/cli/index.js(沿 plan-9g/9e1 e2e 测试模式)
const FORGE_CLI = join(process.cwd(), 'dist', 'cli', 'index.js');

describe('archive 真实 process_evidence_summary 写入 — plan-9e2 Task 4 integration', () => {
  let projectRoot: string;
  let changeDir: string;
  let archiveDir: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-pe-summary-'));
    // 初始化最小 git repo
    execSync('git init -q && git config user.email t@t && git config user.name t', {
      cwd: projectRoot,
    });
    // 创建 forge 目录结构
    mkdirSync(join(projectRoot, 'forge', 'changes', 'test-change'), { recursive: true });
    mkdirSync(join(projectRoot, 'forge', 'changes', 'archive'), { recursive: true });
    changeDir = join(projectRoot, 'forge', 'changes', 'test-change');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function writeBaselineMarkers(opts: {
    verifyMarker?: Record<string, unknown>;
    reviewMarker?: Record<string, unknown>;
  } = {}): void {
    const verifyDefault = {
      schema: 'forge-verify/v1',
      created_by_tool_version: '1.0.0',
      tasks_hash: 'a'.repeat(64),
      content_hash: 'b'.repeat(64),
      verified_at: '2026-05-13T10:00:00Z',
      verified_by: 'ai-agent',
      evidence: [],
      verify_findings: [],
      pause_decisions: [],
    };
    const reviewDefault = {
      schema: 'forge-review/v1',
      created_by_tool_version: '1.0.0',
      tasks_hash: 'a'.repeat(64),
      content_hash: 'b'.repeat(64),
      reviewed_at: '2026-05-13T10:05:00Z',
      reviewed_by: 'ai-agent',
      review_outcomes: [],
      pause_decisions: [],
    };
    writeFileSync(
      join(changeDir, '.verify-passed'),
      stringifyYaml({ ...verifyDefault, ...(opts.verifyMarker ?? {}) }),
      'utf8',
    );
    writeFileSync(
      join(changeDir, '.review-passed'),
      stringifyYaml({ ...reviewDefault, ...(opts.reviewMarker ?? {}) }),
      'utf8',
    );
  }

  function runArchive(): { exitCode: number; stdout: string; stderr: string } {
    try {
      const stdout = execSync(`node ${FORGE_CLI} archive test-change`, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { exitCode: 0, stdout, stderr: '' };
    } catch (e) {
      const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
      return {
        exitCode: err.status ?? 1,
        stdout: String(err.stdout ?? ''),
        stderr: String(err.stderr ?? ''),
      };
    }
  }

  function readSummary(): Record<string, unknown> {
    // 读 archive 目录下的 archive_summary.yaml(沿 plan-9e1 yaml 路径)
    // v2 codex 一轮 plan review MAJOR 4 修订:用 readdirSync ESM import(避免 require ESM 不支持)
    const archiveSubDirs = readdirSync(join(projectRoot, 'forge', 'changes', 'archive')).filter(
      (d) => d.includes('test-change'),
    );
    expect(archiveSubDirs.length).toBe(1);
    const summaryPath = join(
      projectRoot,
      'forge',
      'changes',
      'archive',
      archiveSubDirs[0],
      'archive_summary.yaml',
    );
    return parseYaml(readFileSync(summaryPath, 'utf8'));
  }

  it('plan-9e1 mixed-all-three fixture(legacy / pre-9g marker)→ archive exit 0 + summary {placeholder:false, passed:14, warning:0, failed:0, exempt:0}', () => {
    // v2 codex 一轮 plan review MAJOR 2 + BLOCKER 2 修订:用 plan-9e1 现有 fixture 作为强 RED 路径
    //
    // RED 因果:Task 4 GREEN 前 archive.ts:444-446 buildArchiveSummary 调用未带 fenceResult 入参
    //          (Task 2 Step 3.1b 已临时改,本 Task 4 走完整路径) → 调用栈断 → typecheck fail
    //          或运行时 buildArchiveSummary 收到 undefined fenceResult → summarize crash / placeholder 写入
    // GREEN:Task 4 Step 2.1 确认 fenceResult 透传后,fence 跑 mixed-all-three(无 created_by_tool_version
    //        的 legacy / pre-9g marker)→ runFieldFence 早 return 空 findings(沿 process-evidence-fence.ts:243
    //        isV10Native=false 路径)→ mapper 折数 14 全 'pass' → summary {placeholder:false, 14/0/0/0}
    //
    // 注:plan-9e1 mixed-all-three fixture 已存在(tests/fixtures/archive-warnings/mixed-all-three/)
    //     沿 plan-9e1 同 e2e 模式;sum 不变式 14+0+0+0=14 PASS
    copyFixtureToProject('archive-warnings/mixed-all-three');
    const r = runArchive();
    expect(r.exitCode).toBe(0);
    const summary = readSummary();
    expect(summary.process_evidence_summary).toEqual({
      placeholder: false,
      invariants_passed: 14,
      invariants_with_warning: 0,
      invariants_failed: 0,
      legacy_exempt: 0,
    });
  });

  it.todo('non-legacy v1.0 marker + 完整 process_evidence + 1 #10 env_hash WARNING(Task 6 builder helper 接)→ passed:13 / warning:1 / failed:0 / exempt:0');

  it.todo('verify-only legacy(verify marker process_evidence_unavailable_legacy: true)(Task 6 builder helper 接)→ passed:4 / warning:0 / failed:0 / exempt:10');

  it.todo('review-only legacy(verify v1 native + review process_evidence_unavailable_legacy: true)(Task 6 builder helper 接)→ 等同 verify-only legacy(并集)');

  it.todo('review-only legacy + verify-side #10 WARNING(Task 6 builder helper 接)→ passed:4 / warning:0 / failed:0 / exempt:10(v2 codex 一轮 MAJOR 副作用回归;verify WARNING 被吞,summary 计数为 0 但 stderr 有输出)');

  // 注:copyFixtureToProject helper 见文件底部辅助函数;沿 plan-9e1 archive*.test.ts 同模式
});

// ============================================================
// Test helper(沿 plan-9e1 同模式)
// ============================================================
import { cpSync } from 'node:fs';

declare let projectRoot: string;

function copyFixtureToProject(fixturePath: string): void {
  const fixtureSrc = join(process.cwd(), 'tests', 'fixtures', fixturePath);
  const fixtureDst = join(projectRoot, 'forge', 'changes', 'test-change');
  cpSync(fixtureSrc, fixtureDst, { recursive: true, force: true });
}
```

注:Task 4 的 integration 测试有 4 个 it.todo,Task 6 完成 fixture 后 enable;Task 4 仅保留 2 个可立即跑的 case(non-legacy 缺 process_evidence 拒签 + happy-path placeholder)。沿 plan-9g Task 5/6 同 it.todo 占位模式。

- [ ] **Step 1.2: 跑测试确认 RED**

Run: `pnpm vitest run tests/cli/archive-process-evidence-summary.test.ts`
Expected: 1 case FAIL(non-legacy 缺 process_evidence)— 实际可能 PASS 取决于 plan-9g 现状是否已有此路径覆盖;若已 PASS,作为 regression guard 落地

- [ ] **Step 1.3: RED commit**

```powershell
@'
test(9e2 Task 4 RED): archive integration 5 case(1 active + 4 it.todo Task 6 builder 接)

沿 brainstorm spec §5.1 测试矩阵 + v2 codex 一轮 plan review BLOCKER 2 + MAJOR 2 修订:
- plan-9e1 mixed-all-three fixture(legacy / pre-9g marker)→ summary {placeholder:false, 14/0/0/0}(active 强 RED → GREEN)
- non-legacy v1.0 + 完整 process_evidence + 1 #10 WARNING → passed:13 / warning:1(it.todo,Task 6 builder helper 接)
- verify-only legacy → passed:4 / exempt:10(it.todo,Task 6 builder helper 接)
- review-only legacy → 等同 verify-only legacy 并集(it.todo,Task 6 builder helper 接)
- review-only legacy + verify WARNING → 副作用回归(it.todo,Task 6 builder helper 接)

红:Task 4 GREEN 前 archive.ts:444-446 buildArchiveSummary 未带 fenceResult 入参 → TS 编译失败或运行时 placeholder 写入,active case fail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@ | Out-File -Encoding utf8 .git/COMMIT_MSG_T4_RED
git add tests/cli/archive-process-evidence-summary.test.ts
git commit -F .git/COMMIT_MSG_T4_RED
Remove-Item .git/COMMIT_MSG_T4_RED
```

### Step 2: 实现 — archive.ts:231 区段确认 fenceResult 透传到 buildArchiveSummary(GREEN)

- [ ] **Step 2.1: 检查 `src/cli/commands/archive.ts:444-446` Task 2 已临时修改的 buildArchiveSummary 调用**

Task 2 Step 3.1b 已把:
```typescript
const summary = await buildArchiveSummary(verifyMarker, reviewMarker, changeDir, changeId, {
  archivedAt: ...,
});
```

改成:
```typescript
const summary = await buildArchiveSummary(
  verifyMarker, reviewMarker, changeDir, changeId,
  fenceResult,
  { archivedAt: ... },
);
```

Task 4 本步骤检查该改动落地,且 `fenceResult` 变量正确 reference 到 archive.ts:231 `crossCuttingFenceCheck()` 输出。

如 fenceResult 变量未在该函数 scope 内(可能 Task 2 临时 stub 漏改),修正 — 把 `crossCuttingFenceCheck()` 的返回值 hoisted 到 buildArchiveSummary 调用前可见的 scope。

- [ ] **Step 2.2: 跑测试确认 active case PASS**

Run: `pnpm vitest run tests/cli/archive-process-evidence-summary.test.ts`
Expected: 1 active case PASS + 4 it.todo skipped

- [ ] **Step 2.3: 跑完整 archive 集成测试确认未回归**

Run: `pnpm vitest run tests/cli/archive*.test.ts`
Expected: 全 PASS(plan-9e1/9g 现有 archive 集成测试不破)

### Step 3: 全本地 verify + commit Task 4

- [ ] **Step 3.1: 全本地 verify**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run`
Expected: 全 PASS

- [ ] **Step 3.2: GREEN commit Task 4**

```powershell
@'
feat(9e2 Task 4 GREEN): archive.ts fenceResult 透传 + 1 active integration case

实施 plan-9e2 brainstorm spec §3.6:
- archive.ts:444-446 buildArchiveSummary 调用接 fenceResult 入参(Task 2 已临时改,Task 4 确认 fenceResult 变量在 scope 内)
- 1 active integration case 落地:non-legacy + 缺 process_evidence → fence 反向加固拦截 exit 1(plan-9g B-3 修订路径回归 guard)
- 4 it.todo 占位等 Task 6 fixture 完成

active case PASS,plan-9e1/9g 现有 archive 集成测试无回归。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@ | Out-File -Encoding utf8 .git/COMMIT_MSG_T4_GREEN
git add src/cli/commands/archive.ts tests/cli/archive-process-evidence-summary.test.ts
git commit -F .git/COMMIT_MSG_T4_GREEN
Remove-Item .git/COMMIT_MSG_T4_GREEN
```

---

## 6. Task 5 — 双改 archive.md(根级 + 模板)+ md5 sync 守护

**Implementer**:haiku(docs + ci — 4 处文案 + 字段语义短段 + md5 sync test)
**Spec reviewer**:sonnet
**Quality reviewer**:sonnet

**Files**:
- Modify: `commands/archive.md`(根级,line 53/66/141/144 + 短段)
- Modify: `src/core/templates/commands/archive.md`(模板,完全同步根级)
- Create: `tests/integration/archive-md-sync.test.ts`

### Step 1: 建立 md5 sync invariant guard test(非 TDD red,守护 invariant)

**注(v2 codex 一轮 plan review MAJOR 1 修订)**:本 Task 不是标准 TDD red→green — md5 sync 是 invariant guard,实施前两份 archive.md 已经 md5 一致(实施前基线),Step 1 落地的 test 初始 PASS。Step 2 双改两份文件后 test 仍 PASS(守住一致性)。**Step 1.3 的"临时破坏"是教练性 sanity verify,不是 TDD red 流程**。

- [ ] **Step 1.1: 创建 `tests/integration/archive-md-sync.test.ts`(invariant guard)**

```typescript
// archive-md-sync.test.ts — plan-9e2 Task 5 md5 sync 守护
// 守住根级 commands/archive.md 与模板 src/core/templates/commands/archive.md 内容完全一致
// 沿 plan-9j Task 6.2 slash 模板双同步模式;v2 codex 一轮 MAJOR 修订:加 CI + unit 双层守护

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

describe('archive.md 双文件同步守护 — plan-9e2 Task 5', () => {
  it('根级 commands/archive.md 与模板 src/core/templates/commands/archive.md md5 完全一致', () => {
    const rootPath = join(process.cwd(), 'commands', 'archive.md');
    const tmplPath = join(process.cwd(), 'src', 'core', 'templates', 'commands', 'archive.md');
    const rootMd5 = createHash('md5').update(readFileSync(rootPath)).digest('hex');
    const tmplMd5 = createHash('md5').update(readFileSync(tmplPath)).digest('hex');
    expect(rootMd5).toBe(tmplMd5);
  });
});
```

- [ ] **Step 1.2: 跑测试确认初始通过(实施前两份本来一致)**

Run: `pnpm vitest run tests/integration/archive-md-sync.test.ts`
Expected: PASS(实施前两份 md5 一致)

注:本 test 不是 TDD red — 它是守护 invariant 不被破坏。Task 5 后续步骤改一份未同步会让此 test FAIL;同步双改后恢复 PASS。

- [ ] **Step 1.3: 教练性 sanity verify — 改一份制造临时不一致,确认守护生效**

v2 codex 一轮 plan review MINOR 4 修订:**先确认工作区干净**避免覆盖用户改动:
```powershell
git diff --quiet commands/archive.md src/core/templates/commands/archive.md
if ($LASTEXITCODE -ne 0) {
  Write-Host "Error: archive.md 工作区不干净,先 stash 或 commit 用户改动再跑 sanity verify"
  exit 1
}
```

人工编辑 `commands/archive.md` 末尾加一行空行(临时破坏 md5),跑测试:
```
Run: pnpm vitest run tests/integration/archive-md-sync.test.ts
Expected: FAIL — md5 mismatch
```

回滚临时改动(此时工作区干净,git checkout 不会覆盖意外改动):
```powershell
git checkout commands/archive.md
```

再跑测试:
```
Run: pnpm vitest run tests/integration/archive-md-sync.test.ts
Expected: PASS
```

- [ ] **Step 1.4: invariant guard commit(守护测试落地;v2 codex 一轮 plan review MAJOR 1 修订:非 TDD red)**

```powershell
@'
test(9e2 Task 5 guard): commands/archive.md 双文件 md5 sync invariant 守护

沿 brainstorm spec §5.1 case 5 + plan-9j Task 6.2 双同步模式:
- 根级 commands/archive.md 与模板 src/core/templates/commands/archive.md md5 必须完全一致
- 任一文件改动未同步另一份 → test FAIL
- CI 顺带跑 pnpm vitest run 即可触发(沿 plan-9e1/9g 同 CI 模式)

实施前两份 md5 已一致,本 test 落地即 PASS(作为 invariant guard,不是 TDD red)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@ | Out-File -Encoding utf8 .git/COMMIT_MSG_T5_RED
git add tests/integration/archive-md-sync.test.ts
git commit -F .git/COMMIT_MSG_T5_RED
Remove-Item .git/COMMIT_MSG_T5_RED
```

### Step 2: 双改两份 archive.md(沿同步双改模式)— GREEN

- [ ] **Step 2.1: 修改根级 `commands/archive.md` line 53(字段说明)**

把:
```markdown
- `process_evidence_summary`(9e1 placeholder,9e2 接 9g 真实统计)
```

替换为:
```markdown
- `process_evidence_summary`(9e1 placeholder → 9e2 真实统计,沿 plan-9g 14 不变量):
  - `placeholder: false`
  - `invariants_passed: number`(经 mapper 优先级筛选后仍为 status='pass' 的 invariant 数)
  - `invariants_with_warning: number`(WARNING 经 fail/legacy-skip 优先级筛选后仍保留为 status='warning' 的数;legacy 路径下被豁免 invariant 的 WARNING 不计入,沿 master §3.4.4.1 精度损失)
  - `invariants_failed: number`(v1.0 永远 = 0;fence.ok=false 时 archive 直接 exit 1,summary 不写入)
  - `legacy_exempt: number`(`process_evidence_unavailable_legacy: true` 路径下被豁免的 invariant 数;legacy 路径恒 = 10,非 legacy 恒 = 0;flag 取自 verify || review 任一为 true)
  - 不变式:`invariants_passed + invariants_with_warning + invariants_failed + legacy_exempt === 14`(沿 plan-9g FENCE_INVARIANT_NAMES.length)
```

- [ ] **Step 2.2: 修改根级 `commands/archive.md` line 66(stdout 渲染段)**

把:
```markdown
**Security:** [process_evidence:placeholder] ... (9e2 完成后改为真实统计)
```

替换为:
```markdown
**Security:** [process_evidence:passed=3/warning=1/failed=0/legacy=10]
```

注:此为 sample 输出,实际数字按 archive 时 fence 结果填。

- [ ] **Step 2.3: 修改根级 `commands/archive.md` line 141(9e2 状态说明)**

把:
```markdown
- **9e2**(待 9g 完成后):把 `process_evidence_summary` 字段从 placeholder 接 9g 实施的 13 不变量真实统计
```

替换为:
```markdown
- **9e2(已完成,plan-9e2)**:`process_evidence_summary` 字段从 placeholder 接 plan-9g 实施的 14 不变量真实统计(4 字段计数:passed / with_warning / failed / legacy_exempt;sum 不变式 = 14)
```

- [ ] **Step 2.4: 修改根级 `commands/archive.md` line 144(merge 顺序)**

把:
```markdown
merge 顺序推荐:**9e1 → 9g → 9e2**(本顺序保证 archive_summary placeholder 在 9g 真实 13 不变量统计完成后才接,避免 placeholder 与真实统计在中间状态混淆)
```

替换为:
```markdown
merge 顺序推荐:**9e1 → 9g → 9e2(已完成全链)** — 14 不变量真实统计已接入,placeholder 路径仅 plan-9e1 backward-compat 兼容保留
```

- [ ] **Step 2.5: 用 `cp commands/archive.md src/core/templates/commands/archive.md` 同步模板**

(PowerShell)
```powershell
Copy-Item commands/archive.md src/core/templates/commands/archive.md -Force
```

(Bash)
```bash
cp commands/archive.md src/core/templates/commands/archive.md
```

- [ ] **Step 2.6: 跑测试确认 md5 sync 守护 PASS**

Run: `pnpm vitest run tests/integration/archive-md-sync.test.ts`
Expected: PASS — md5 一致

- [ ] **Step 2.7: 跑全测确认未回归**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run`
Expected: 全 PASS

### Step 3: commit Task 5

- [ ] **Step 3.1: GREEN commit Task 5**

```powershell
@'
feat(9e2 Task 5 GREEN): archive.md 双改 + 字段语义短段 + md5 sync 守护

实施 plan-9e2 brainstorm spec §3.7:
- 根级 commands/archive.md + 模板 src/core/templates/commands/archive.md 双改 4 处文案
  - line 53:process_evidence_summary 字段说明扩 placeholder + 4 计数字段(passed/with_warning/failed/exempt)+ sum 不变式(v2 codex 一轮 plan review NIT 2 修订:placeholder 不是统计字段)
  - line 66:stdout sample 改为 [process_evidence:passed=3/warning=1/failed=0/legacy=10]
  - line 141:9e2 已完成状态说明
  - line 144:merge 顺序加 "9e2(已完成全链)" 注脚
- 两份文件 md5 完全一致(沿 plan-9j Task 6.2 双同步模式;CI + unit md5 守护)
- md5 sync 守护 test PASS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@ | Out-File -Encoding utf8 .git/COMMIT_MSG_T5_GREEN
git add commands/archive.md src/core/templates/commands/archive.md
git commit -F .git/COMMIT_MSG_T5_GREEN
Remove-Item .git/COMMIT_MSG_T5_GREEN
```

---

## 7. Task 6 — build-archive-fixture.ts builder helper + 4 it.todo integration case enable

**v2 codex 一轮 plan review BLOCKER 1 修订**:plan-9g `tests/fixtures/process-evidence-*` baseline 在仓库不存在(实际 ls tests/fixtures 仅 archive-warnings/ + legacy-bridge/);改为 **test-runtime builder helper 程序化构造完整 marker**(含 process_evidence + sha256 hash 链 + JCS canonical),不依赖物理 fixture 目录。

**Implementer**:sonnet(test infra — builder helper 设计 + 4 case enable + 副作用回归)
**Spec reviewer**:sonnet
**Quality reviewer**:sonnet

**Files**:
- Create: `tests/utils/build-archive-fixture.ts`(builder helper)
- Modify: `tests/cli/archive-process-evidence-summary.test.ts`(enable 4 it.todo 用 builder helper 注入 marker)

### Step 1: 创建 build-archive-fixture.ts builder helper

- [ ] **Step 1.1: 创建 `tests/utils/build-archive-fixture.ts`**

```typescript
// build-archive-fixture.ts — plan-9e2 Task 6 builder helper(v2 codex 一轮 plan review BLOCKER 1 修订)
// 程序化构造完整 verify/review marker(含 process_evidence + sha256 hash 链 + JCS canonical 序列化)
// 沿 plan-9g brainstorm spec §2.7.2 process_evidence schema 字段名严格(red_commit/green_commit/...)
// 4 scenario:warning / verify-legacy / review-legacy / review-legacy-with-verify-warning

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { createHash } from 'node:crypto';
import { canonicalize } from 'canonicalize'; // plan-9a 已 dep,JCS RFC 8785

/** 4 种 scenario 类别 — 决定 verify/review marker 内 process_evidence 字段构造 */
export type FixtureScenario =
  | 'warning' // non-legacy v1.0 + verify 阶段 env_hash WARNING(invariant 10)
  | 'verify-legacy' // verify marker 标 legacy + review v1.0 native
  | 'review-legacy' // verify v1.0 native + review 标 legacy
  | 'review-legacy-with-verify-warning'; // verify v1.0 + WARNING + review legacy(副作用回归)

export interface FixtureBuildOptions {
  scenario: FixtureScenario;
  /** change 目录绝对路径(必须已 mkdir);本 fn 写入 .verify-passed / .review-passed 到此目录 */
  changeDir: string;
  /** change-id 字符串,默认 'test-change' */
  changeId?: string;
}

/**
 * 程序化构造完整 v1.0 process_evidence(passable + matching env_hash 等)
 *
 * 注:本 helper 构造的 marker **不实际跑 fence rerun**(因为 mkdtemp 临时项目内无真实 git history /
 *     real test command);依赖 fence 内部 mode=hash-only 路径 ack-mode 隐含覆盖(沿 plan-9g brainstorm v9)
 *     fence 实际行为:hash-only mode → invariant 5/6/13 走 stderr 不阻断(WARNING 已被 ack-mode 隐含覆盖)
 *     不变量 1-4/7-9/11-12/14 走字段类校验,marker 内字段构造合法即 PASS
 */
function buildBaselineProcessEvidence(): Record<string, unknown> {
  // 最小合法 process_evidence — 14 不变量全 PASS(hash-only mode 跳 rerun;字段类不变量靠构造合法字段满足)
  const baselinePe = {
    version: '1.0.0',
    tdd_event_chain: [
      {
        task_ref: 'T1',
        red_commit: {
          sha: 'a'.repeat(40),
          timestamp: '2026-05-13T09:00:00Z',
          log_path: 'logs/red-T1.log',
          log_hash: 'b'.repeat(64),
          report_path: 'logs/red-T1.junit.xml',
          report_hash: 'c'.repeat(64),
          exit_code: 1,
          expected_failures: [{ test_id: 'T1.case1' }],
        },
        green_commit: {
          sha: 'd'.repeat(40),
          timestamp: '2026-05-13T09:05:00Z',
          log_path: 'logs/green-T1.log',
          log_hash: 'e'.repeat(64),
          report_path: 'logs/green-T1.junit.xml',
          report_hash: 'f'.repeat(64),
          exit_code: 0,
        },
      },
    ],
    verify_invocations: [
      {
        invoked_at: '2026-05-13T09:10:00Z',
        log_path: 'logs/verify.log',
        log_hash: '1'.repeat(64),
        report_hash: '2'.repeat(64),
        exit_code: 0,
      },
    ],
    subagent_review_chain: [
      {
        spec_iterations: 1,
        quality_iterations: 1,
        main_check_off_at: '2026-05-13T09:15:00Z',
      },
    ],
    env_hash: '3'.repeat(64),
    process_verification_mode: 'hash-only',
    process_verification_mode_acked_by: 'msc',
    worktree_paths: [],
  };
  return baselinePe;
}

/** 计算 process_evidence 的 JCS hash(plan-9g 不变量 9) */
function computeProcessEvidenceHash(pe: Record<string, unknown>): string {
  const jcs = canonicalize(pe);
  if (jcs === undefined) throw new Error('canonicalize failed');
  return createHash('sha256').update(jcs).digest('hex');
}

/**
 * Build marker objects + 写入 changeDir(.verify-passed + .review-passed)
 *
 * 注:本 helper 假设 hash-only mode + ack-mode 已覆盖 invariant 5/6/13;
 *     文件类不变量 1-4/7-9/11-12/14 通过构造合法 hash + timestamp 字段满足
 *     scenario 决定 verify/review 各自 marker 的 legacy / WARNING 字段
 */
export function buildProcessEvidenceFixture(opts: FixtureBuildOptions): void {
  const { scenario, changeDir, changeId = 'test-change' } = opts;
  mkdirSync(changeDir, { recursive: true });

  // 共享基础 marker 字段
  const sharedHash = 'a'.repeat(64); // tasks_hash / content_hash

  // 构造 verify marker
  let verifyMarker: Record<string, unknown>;
  if (scenario === 'verify-legacy') {
    // verify marker 走 legacy 路径:删 process_evidence,加 legacy flag + resigned_by_tool_version
    verifyMarker = {
      schema: 'forge-verify/v1',
      created_by_tool_version: '0.4.0',
      resigned_by_tool_version: '1.0.0', // 沿 plan-9j legacy-exemption resigned-aware
      process_evidence_unavailable_legacy: true,
      tasks_hash: sharedHash,
      content_hash: sharedHash,
      verified_at: '2026-05-13T10:00:00Z',
      verified_by: 'ai-agent',
      evidence: [],
      verify_findings: [],
      pause_decisions: [],
    };
  } else {
    // non-legacy 路径:含完整 process_evidence
    const pe = buildBaselineProcessEvidence();
    // scenario='warning' 或 'review-legacy-with-verify-warning' → verify 侧 env_hash 不一致触发 WARNING #10
    if (scenario === 'warning' || scenario === 'review-legacy-with-verify-warning') {
      pe.env_hash = 'deadbeef'.repeat(8); // 64 字符 sha256 字面,与 ctx.recomputed env_hash 不匹配 → WARNING
    }
    const peHash = computeProcessEvidenceHash(pe);
    verifyMarker = {
      schema: 'forge-verify/v1',
      created_by_tool_version: '1.0.0',
      tasks_hash: sharedHash,
      content_hash: sharedHash,
      verified_at: '2026-05-13T10:00:00Z',
      verified_by: 'ai-agent',
      evidence: [],
      verify_findings: [],
      pause_decisions: [],
      process_evidence: pe,
      process_evidence_staging_hash: peHash,
      ack_log_tail_hash: '0'.repeat(64),
      ack_log_entry_count: 0,
    };
  }

  // 构造 review marker
  let reviewMarker: Record<string, unknown>;
  if (scenario === 'review-legacy' || scenario === 'review-legacy-with-verify-warning') {
    // review marker 走 legacy 路径
    reviewMarker = {
      schema: 'forge-review/v1',
      created_by_tool_version: '0.4.0',
      resigned_by_tool_version: '1.0.0',
      process_evidence_unavailable_legacy: true,
      tasks_hash: sharedHash,
      content_hash: sharedHash,
      reviewed_at: '2026-05-13T10:05:00Z',
      reviewed_by: 'ai-agent',
      review_outcomes: [],
      pause_decisions: [],
    };
  } else {
    // non-legacy 路径(含 verify-legacy 场景 — review 是 v1.0 native)
    const pe = buildBaselineProcessEvidence();
    const peHash = computeProcessEvidenceHash(pe);
    reviewMarker = {
      schema: 'forge-review/v1',
      created_by_tool_version: '1.0.0',
      tasks_hash: sharedHash,
      content_hash: sharedHash,
      reviewed_at: '2026-05-13T10:05:00Z',
      reviewed_by: 'ai-agent',
      review_outcomes: [],
      pause_decisions: [],
      process_evidence: pe,
      process_evidence_staging_hash: peHash,
      ack_log_tail_hash: '0'.repeat(64),
      ack_log_entry_count: 0,
    };
  }

  writeFileSync(join(changeDir, '.verify-passed'), stringifyYaml(verifyMarker), 'utf8');
  writeFileSync(join(changeDir, '.review-passed'), stringifyYaml(reviewMarker), 'utf8');

  // 共享 stub:tasks.md / proposal.md / design.md(最小 stub,不含 scope-entries 块)
  writeFileSync(
    join(changeDir, 'tasks.md'),
    '# Tasks\n\n## Task 1\n\nMinimal stub.\n',
    'utf8',
  );
  writeFileSync(
    join(changeDir, 'proposal.md'),
    '# Proposal\n\nMinimal stub for plan-9e2 Task 6 fixture.\n',
    'utf8',
  );
  writeFileSync(
    join(changeDir, 'design.md'),
    '# Design\n\nMinimal stub.\n',
    'utf8',
  );

  // .evidence/staging 文件(plan-9g freeze 写入)— 用 fix 0 entry_count + 0-hash 简化
  mkdirSync(join(changeDir, '.evidence'), { recursive: true });
  writeFileSync(
    join(changeDir, '.evidence', 'process-evidence.staging.yaml'),
    stringifyYaml({ schema: 'forge-process-evidence/v1', tdd_event_chain: [], verify_invocations: [], subagent_review_chain: [] }),
    'utf8',
  );
  writeFileSync(join(changeDir, '.evidence', 'ack-log.jsonl'), '', 'utf8');
}
```

注:本 helper **在 hash-only mode + ack-mode 假设下构造**;若 fence rerun 不变量 5/6 真跑(full / sample mode)需扩 helper 注入 git history。Task 6 实施时如 fence 实际行为不符,需调整(可能简化为 fixture mode='hash-only' + ack-mode='acked' 标记内置)。

### Step 2: enable 4 it.todo case 用 builder helper

- [ ] **Step 2.1: 修改 `tests/cli/archive-process-evidence-summary.test.ts` 顶部加 builder import + 改 copyFixtureToProject 助手**

文件顶部 import 区追加:
```typescript
import { buildProcessEvidenceFixture, type FixtureScenario } from '../utils/build-archive-fixture.js';
```

删 `copyFixtureToProject` helper(改用 builder),改加:
```typescript
function buildFixtureInProject(scenario: FixtureScenario): void {
  const changeDir = join(projectRoot, 'forge', 'changes', 'test-change');
  buildProcessEvidenceFixture({ scenario, changeDir });
}
```

(`projectRoot` 是 describe 块顶层定义的 mkdtempSync 路径)

- [ ] **Step 2.2: 替换 4 个 `it.todo(...)` 为完整实现**

```typescript
it('non-legacy v1.0 marker + 完整 process_evidence + 1 #10 env_hash WARNING → passed:13 / warning:1 / failed:0 / exempt:0', () => {
  buildFixtureInProject('warning');
  const r = runArchive();
  expect(r.exitCode).toBe(0);
  const summary = readSummary();
  expect(summary.process_evidence_summary).toEqual({
    placeholder: false,
    invariants_passed: 13,
    invariants_with_warning: 1,
    invariants_failed: 0,
    legacy_exempt: 0,
  });
});

it('verify-only legacy → passed:4 / warning:0 / failed:0 / exempt:10', () => {
  buildFixtureInProject('verify-legacy');
  const r = runArchive();
  expect(r.exitCode).toBe(0);
  const summary = readSummary();
  expect(summary.process_evidence_summary).toEqual({
    placeholder: false,
    invariants_passed: 4,
    invariants_with_warning: 0,
    invariants_failed: 0,
    legacy_exempt: 10,
  });
});

it('review-only legacy → passed:4 / warning:0 / failed:0 / exempt:10(等同 verify-only legacy 并集)', () => {
  buildFixtureInProject('review-legacy');
  const r = runArchive();
  expect(r.exitCode).toBe(0);
  const summary = readSummary();
  expect(summary.process_evidence_summary).toEqual({
    placeholder: false,
    invariants_passed: 4,
    invariants_with_warning: 0,
    invariants_failed: 0,
    legacy_exempt: 10,
  });
});

it('review-only legacy + verify-side #10 WARNING(v2 codex 一轮 MAJOR 副作用回归)→ passed:4 / warning:0 / failed:0 / exempt:10', () => {
  // 副作用:verify 侧 #10 WARNING 被 effectiveLegacyExempt=true 吞为 legacy-skip
  //   summary invariants_with_warning 计数为 0(不是 1)— 这是核心副作用回归点
  buildFixtureInProject('review-legacy-with-verify-warning');
  const r = runArchive();
  expect(r.exitCode).toBe(0);
  const summary = readSummary();
  expect(summary.process_evidence_summary).toEqual({
    placeholder: false,
    invariants_passed: 4,
    invariants_with_warning: 0,
    invariants_failed: 0,
    legacy_exempt: 10,
  });
  // 副作用守护:WARNING 实际信息走 stderr 或 verify_findings(本 fixture WARNING 是 freeze-time #10 env_hash,
  //   走 marker.verify_findings → acked_warnings 路径),summary 主体不受影响
});
```

- [ ] **Step 2.3: 跑测试确认 5 case PASS**

Run: `pnpm vitest run tests/cli/archive-process-evidence-summary.test.ts`
Expected: PASS — 5 case 全 PASS(1 active Task 4 留 + 4 enable Task 6 新)

### Step 3: 全本地 verify + commit Task 6

- [ ] **Step 3.1: 跑全本地 verify**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run`
Expected: 全 PASS

- [ ] **Step 3.2: GREEN commit Task 6**

```powershell
@'
feat(9e2 Task 6 GREEN): build-archive-fixture builder helper + 4 integration case enable + 副作用回归钉住

实施 plan-9e2 brainstorm spec §5.2 + v2 codex 一轮 plan review BLOCKER 1 修订:
- tests/utils/build-archive-fixture.ts builder helper(程序化构造 v1.0 marker + sha256 hash 链 + JCS canonical)
- 4 scenario:warning(non-legacy + #10 env_hash WARNING)/ verify-legacy / review-legacy / review-legacy-with-verify-warning(副作用回归)
- 不依赖 plan-9g `tests/fixtures/process-evidence-*` baseline(仓库不存在)

Task 4 的 4 it.todo enable 为 active:
- non-legacy + WARNING → passed:13 / warning:1
- verify-only legacy → passed:4 / exempt:10
- review-only legacy → 等同 verify-only(取并集)
- review-only legacy + verify WARNING → passed:4 / warning:0 / exempt:10(副作用钉住,守 mapper 优先级 legacy-skip > warning 不被无意修改)

5 case integration 全 PASS,plan-9e1/9g 现有 archive 集成测试无回归。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@ | Out-File -Encoding utf8 .git/COMMIT_MSG_T6_GREEN
git add tests/utils/build-archive-fixture.ts tests/cli/archive-process-evidence-summary.test.ts
git commit -F .git/COMMIT_MSG_T6_GREEN
Remove-Item .git/COMMIT_MSG_T6_GREEN
```

---

## 8. 综合 DoD 验收(所有 6 Task 完成后)

- [ ] **DoD 1: 全本地 verify 通过**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run`
Expected: 全 PASS

- [ ] **DoD 2: 跨 OS CI 全绿**

Push 到 PR 分支,等待 GitHub Actions Linux/Windows × Node 20/22 全绿。
Expected: 4 job 全 PASS

- [ ] **DoD 2b: 每 Task DONE_REPORT 完整(v2 codex 一轮 plan review MAJOR 7 修订)**

沿 plan-9g process_evidence 协议 + brainstorm spec §6.2 DoD 字面要求,**每 Task 完成的 subagent / SDD session 必须 DONE_REPORT 含**:
- **RED commit sha**(本 plan Task 1-4/6 走 RED → GREEN;Task 5 是 invariant guard,单 commit)
- **GREEN commit sha**(本 plan Task 1-4/6;Task 5 是 invariant guard commit 即唯一 commit)
- **本地 verify 全 PASS 的 log paths**:
  - `pnpm typecheck` 输出(若无 error,记录 `verify-typecheck.log` 空文件或 stdout 摘要)
  - `pnpm lint` 输出
  - `pnpm format:check` 输出(memory `本地 verification 必须含 format:check`)
  - `pnpm vitest run` 输出含 Task 涉及 test 文件的 PASS 摘要
- **新增 / 修改文件的 git diff stat**(沿 plan-9g `git diff --stat HEAD~2..HEAD` 模式)

DONE_REPORT 缺失任一字段 → 主代理 reject 该 Task 不进入下一 Task review;沿 subagent-driven-discipline §3.4 + plan-9g 同协议。

- [ ] **DoD 3: 综合 retrospect Q1-Q6**

按 subagent-driven-discipline §3.4 skill 跑 retrospect:
- Q1: 是否有 task 整体偏离 plan?
- Q2: 是否需 plan 内补 emergent task?
- Q3: 是否发现 master plan §3.10 / §3.4.4.1 / §3.12.1bis 字面矛盾?
- Q4: 是否触发 BLOCKER / MAJOR codex review feedback?
- Q5: 是否引入新 latent bug(plan-9z polish 接住)?
- Q6: 是否需 Case 06 写入 subagent-driven-discipline §5?

Q1-Q6 任一 Yes → 触发 Case 06 + §6 catalog updates(沿 plan-9g retrospect 协议)。

- [ ] **DoD 4: 开 PR target dev**

```bash
gh pr create --base dev --head <feature-branch> --title "feat: plan-9e2 ProcessEvidenceSummary 真实统计接入" --body "$(cat <<'EOF'
## Summary
- 接 plan-9e1 ProcessEvidenceSummary placeholder → plan-9g 14 不变量真实 4 字段统计
- FenceInvariantResult 扩 status 4 态 enum + mapper 重写(WARNING + dual-legacy 并集)
- schema validator 严格化 + sum 不变式守护
- 双改根级 + 模板 archive.md + md5 sync 守护
- build-archive-fixture builder helper(v2 codex 一轮 plan review BLOCKER 1 修订:不依赖 plan-9g 物理 fixture)+ 5 integration case 含副作用回归

## Test plan
- [x] pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run 全 PASS
- [x] 跨 OS CI(Linux/Windows × Node 20/22)全绿
- [x] 综合 retrospect Q1-Q6 完成
- [x] brainstorm spec 6 轮 codex 对抗审查彻底(commit 497b834)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## 9. 跨 sub-plan 合并点 + 遗留项

### 9.1 跨 sub-plan 合并点

- `commands/archive.md`(根级 + 模板)是 plan-9e1 / plan-9g / plan-9e2 三方共改文件:
  - plan-9e1:三级 fence 行为 + summary 输出基础架构 + placeholder
  - plan-9g:14 不变量 fence(沿 plan-9g brainstorm spec)
  - plan-9e2:placeholder → 真实统计 + 字段语义短段(本 plan Task 5)
- merge 顺序锁:**9e1 → 9g → 9e2**(plan-9e1 line 188 / master plan line 593 已锁;9e2 实施时不冲突)

### 9.2 遗留项(明确不在 9e2 scope)

| # | 项目 | 处置 |
|---|---|---|
| 1 | `FenceInvariantResult.ok` 字段 deprecation(status 字段已足够) | plan-9z polish |
| 2 | v1.1 forge backlog index 消费 archive_summary.yaml | plan-v1.1 |
| 3 | dimension enum 三处独立维护(severity.ts / marker-schema.ts / finding.ts) | plan-9z polish(9g 已知遗留) |
| 4 | invariant 11 ack lookup per-task 精度损失 | plan-9z polish(9g 已知遗留) |
| 5 | Task 4 Case 8 dead-code path | plan-9z polish(9g 已知遗留) |
| 6 | shell:true 注入面(forge/config.yaml test_command 无校验) | plan-9z polish(9g 已知遗留) |
| 7 | 29 个 it.todo(plan-9g Task 5/6 e2e fixture 完整 inline) | plan-9z polish(9g 已知遗留) |
| 8 | legacy_exempt 精确拆分 verify-only / review-only + side-aware WARNING(并集精度损失,沿 brainstorm spec §4.3 + §7) | plan-v1.1 — 扩 `verify_legacy_exempt` / `review_legacy_exempt` 字段;mapper side-aware 不取并集,解决 review-only legacy 吞 verify-side WARNING 副作用 |
| 9 | freeze-time WARNING 走 marker.verify_findings → acked_warnings vs rerun-time WARNING 走 stderr,两条路径在 summary 中合并为 invariants_with_warning 单字段,精度损失 | plan-9z polish 或 v1.1 |

---

**End of plan-9e2 sub-plan**
