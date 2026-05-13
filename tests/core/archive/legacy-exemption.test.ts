// legacy-exemption.test.ts — plan-9j Task 3 单测
// 13 不变量豁免矩阵 13 case + 互斥校验 2 case + v3 +2(resigned-aware 互斥 + process_evidence fail-closed) = **17 case**
// 沿 design §3.4.4.1 精确豁免表 + 反向加固

import { describe, it, expect } from 'vitest';
import { validateLegacyExemption } from '../../../src/core/archive/legacy-exemption.js';

// 合法 v0.4 legacy marker baseline
const baseLegacyMarker = {
  schema: 'forge-verify/v1',
  verified_at: '2025-08-01T10:00:00Z',
  verified_by: 'ai-agent',
  tasks_hash: 'sha256:' + 'a'.repeat(64),
  content_hash: 'sha256:' + 'b'.repeat(64),
  evidence: [],
  process_evidence_unavailable_legacy: true,
  // 注意:无 created_by_tool_version 字段,等价 <1.0.0
};

describe('validateLegacyExemption', () => {
  it('legacy marker 缺 created_by_tool_version → 视为 legacy,豁免通过', () => {
    const result = validateLegacyExemption(baseLegacyMarker);
    expect(result.valid).toBe(true);
  });

  it('legacy marker + created_by_tool_version=0.4.0 → 豁免通过', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      created_by_tool_version: '0.4.0',
    });
    expect(result.valid).toBe(true);
  });

  it('legacy=true + created_by_tool_version=1.0.0 → **互斥拒签**(v1.0 marker 不允许 legacy 标记)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence_unavailable_legacy: true,
      created_by_tool_version: '1.0.0',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /互斥|legacy.*1\.0\.0/.test(e.message))).toBe(true);
  });

  it('legacy=true + created_by_tool_version=1.1.0 → 互斥拒签(任何 >=1.0.0 都不允许)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence_unavailable_legacy: true,
      created_by_tool_version: '1.1.0',
    });
    expect(result.valid).toBe(false);
  });

  it('非 legacy(无 process_evidence_unavailable_legacy 字段)→ 走 strict 路径,本函数不裁决(返通过)', () => {
    const { process_evidence_unavailable_legacy, ...nonLegacy } = baseLegacyMarker;
    void process_evidence_unavailable_legacy;
    const result = validateLegacyExemption(nonLegacy);
    // 本函数仅校验 legacy=true 的不变量;legacy=false 不裁决,交给 strict fence 处理
    expect(result.valid).toBe(true);
  });

  // —— 13 不变量豁免矩阵 ——

  it('不变量 #1-#8 跳过(legacy marker 无 process_evidence,无需校验 timestamp/SHA/exit_code 等)', () => {
    // 沿 design §3.4.4.1 第 1-8 行:legacy=true 全部跳过
    // 校验方法:legacy marker 无 process_evidence 子字段,validateLegacyExemption 返通过即可
    const result = validateLegacyExemption(baseLegacyMarker);
    expect(result.valid).toBe(true);
  });

  it('不变量 #9 保留(JCS hash 校验 marker 整体完整性)— marker 字段未篡改 → 通过', () => {
    // 实施:legacy-exemption 内部不重算 hash(那是 verify-findings-fence 的事)
    // 本函数仅在 marker 字段层面校验;hash 校验由现有 marker-integrity.ts 处理
    // 此 case 验证 legacy-exemption 函数不影响 marker hash 路径
    const result = validateLegacyExemption(baseLegacyMarker);
    expect(result.valid).toBe(true);
  });

  it('不变量 #10 跳过(env_hash 一致性,legacy 无 env_hash 字段)', () => {
    const result = validateLegacyExemption(baseLegacyMarker);
    expect(result.valid).toBe(true);
  });

  it('不变量 #11 反向加固:legacy marker **不应该**有 tdd_exemption 字段,有则拒签', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      tdd_exemption: { rationale: 'fake exemption' }, // 试图加 tdd_exemption 绕过 fence
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /tdd_exemption.*legacy/.test(e.message))).toBe(true);
  });

  it('不变量 #12 反向加固:legacy marker **不应该**有 process_verification_mode 字段,有则拒签', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_verification_mode: 'sample', // 试图加该字段
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /process_verification_mode.*legacy/.test(e.message))).toBe(
      true,
    );
  });

  it('不变量 #13 跳过(timeout 行为,legacy 无重跑)', () => {
    const result = validateLegacyExemption(baseLegacyMarker);
    expect(result.valid).toBe(true);
  });

  // —— 互斥校验 + 反向加固边界 ——

  it('legacy=true + created_by_tool_version=2.0.0-alpha.1 → 互斥拒签(任何 >=1.0.0 prerelease 也算)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      created_by_tool_version: '2.0.0-alpha.1',
    });
    expect(result.valid).toBe(false);
  });

  it('legacy=true + 同时含 tdd_exemption + process_verification_mode → 两条 fence 都触发,拒签', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      tdd_exemption: { rationale: 'x' },
      process_verification_mode: 'sample',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('process_evidence_unavailable_legacy=false 显式标 → 不算 legacy,本函数返通过(交给 strict)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence_unavailable_legacy: false,
    });
    expect(result.valid).toBe(true);
  });

  it('process_evidence_unavailable_legacy=1(非 boolean)→ 严格类型校验拒签', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence_unavailable_legacy: 1, // 非 boolean
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => /process_evidence_unavailable_legacy.*boolean/.test(e.message)),
    ).toBe(true);
  });

  // v3 BLOCKER 5 新增:resigned-aware 互斥 allow + process_evidence 反向加固
  it('legacy=true + created_by_tool_version=1.0.0 + resigned_by_tool_version=1.0.0 → **允许通过**(resigned-aware,v3 BLOCKER 2)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence_unavailable_legacy: true,
      created_by_tool_version: '1.0.0', // 注意:created 1.0.0(原本应互斥)
      resigned_by_tool_version: '1.0.0', // 但 resigned 字段存在 → 允许通过
    });
    expect(result.valid).toBe(true);
  });

  it('legacy=true + process_evidence 整字段(伪造)→ **fail-closed 反向加固**(v3 BLOCKER 6)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence: { fake: 'tampered process_evidence' }, // 试图加 process_evidence 绕开 fence
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => /process_evidence.*legacy|integrity|tamper/.test(e.message)),
    ).toBe(true);
  });
});
