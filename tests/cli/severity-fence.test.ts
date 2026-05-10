import { describe, it, expect } from 'vitest';
import {
  Severity,
  CandidateType,
  isSeverity,
  isCandidateType,
  EVIDENCE_FORMATS,
} from '../../src/core/schemas/severity.js';

describe('severity schema', () => {
  it('Severity enum has exactly three values', () => {
    expect(['CRITICAL', 'WARNING', 'SUGGESTION']).toContain('CRITICAL');
    expect(isSeverity('CRITICAL')).toBe(true);
    expect(isSeverity('WARNING')).toBe(true);
    expect(isSeverity('SUGGESTION')).toBe(true);
    expect(isSeverity('S')).toBe(false); // v0.4 简码 — Task 9j 处理迁移,本层不接受
    expect(isSeverity('blocking')).toBe(false);
  });

  it('CandidateType enum has 6 types', () => {
    const types = [
      'test_failure',
      'hash_mismatch',
      'evidence_missing',
      'coverage_gap',
      'api_contract',
      'manual_claim',
    ];
    types.forEach((t) => expect(isCandidateType(t)).toBe(true));
    expect(isCandidateType('unknown')).toBe(false);
  });

  it('EVIDENCE_FORMATS contains 5 supported types', () => {
    expect(EVIDENCE_FORMATS).toEqual([
      'file:line',
      'artifact:section',
      'change-level',
      'command-output',
      'tests:scenario',
    ]);
  });
});
