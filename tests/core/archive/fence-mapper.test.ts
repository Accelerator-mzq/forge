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

  // quality fix I-2:删除原 case 4 "legacy(并集等价于 verify-only legacy)..."
  //   理由:mapFindingsToResults 是纯函数只看 effectiveLegacyExempt boolean,不接触并集语义;
  //   入参与 case 3 完全相同 + 断言子集,实质是 case 3 路径重复测试,不验证并集。
  //   并集语义由 caller(crossCuttingFenceCheck)负责,不属于本纯函数单测覆盖范围。

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
