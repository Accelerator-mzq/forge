import { describe, it, expect } from 'vitest';
import { isSeverity, isCandidateType, EVIDENCE_FORMATS } from '../../src/core/schemas/severity.js';
import type { Finding, FindingHashPayload } from '../../src/core/schemas/severity.js';
import {
  computeFindingHash,
  extractHashPayload,
  validateCandidate,
  CANDIDATE_VALIDATORS,
} from '../../src/core/validate/index.js';

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

// Task 7(plan-9a §8): finding_hash framework 测试
describe('finding-hash framework', () => {
  it('computeFindingHash produces deterministic 64-hex SHA256', () => {
    const payload: FindingHashPayload = {
      content_hash: 'abc',
      git_head: 'def',
      dimension: 'completeness',
      check_type: 'spec_coverage',
      severity: 'CRITICAL',
      automated: true,
      evidence: 'tests/foo.test.ts:42',
      recommendation: 'Add scenario X',
    };
    const h = computeFindingHash(payload);
    // 必须是 64 字符十六进制(SHA256 hex 输出)
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    // 同一 8 字段稳定 payload 再次计算结果相同(deterministic,plan-9b v3 B1 修订)
    expect(computeFindingHash(payload)).toBe(h);
  });

  it('extractHashPayload strips ack/resolved/candidate fields', () => {
    const full: Finding = {
      id: 1,
      content_hash: 'c',
      git_head: 'g',
      dimension: 'correctness',
      check_type: 'tdd',
      severity: 'WARNING',
      automated: false,
      evidence: 'e',
      recommendation: 'r',
      resolved: true,
      finding_hash: 'will-be-recomputed',
      severity_candidate: 'CRITICAL',
      candidate_type: 'test_failure',
    };
    const payload = extractHashPayload(full);
    // 可变字段不应出现在 hash payload 中
    expect('id' in payload).toBe(false);
    expect('resolved' in payload).toBe(false);
    expect('finding_hash' in payload).toBe(false);
    expect('severity_candidate' in payload).toBe(false);
    // 核心字段必须保留
    expect(payload.severity).toBe('WARNING');
  });

  it('extractHashPayload 剥离 validate_run_id(v3 B1 修订核心合约)', () => {
    // v3 B1 修订核心合约:Finding.validate_run_id 是瞬态元数据,不入 hash payload
    // 此测试显式构造带 validate_run_id 的 Finding,验证 extractHashPayload 将其剥离
    const finding: Finding = {
      id: 99,
      resolved: false,
      finding_hash: 'placeholder',
      validate_run_id: 'run-xyz', // 显式带值,验证剥离
      content_hash: 'c',
      git_head: 'g',
      dimension: 'correctness',
      check_type: 'test',
      severity: 'CRITICAL',
      automated: true,
      evidence: 'e',
      recommendation: 'r',
    };
    const payload = extractHashPayload(finding);
    // validate_run_id 必须不在 hash payload 中(否则破坏 finding_hash 去重 / 持久 ack 设计)
    expect('validate_run_id' in payload).toBe(false);
  });

  it('extractHashPayload + computeFindingHash round-trips', () => {
    const full: Finding = {
      id: 7,
      content_hash: 'cc',
      git_head: 'gg',
      dimension: 'coherence',
      check_type: 'ref_consistency',
      severity: 'SUGGESTION',
      automated: true,
      evidence: 'design.md§3',
      recommendation: 'Reword',
      resolved: false,
      finding_hash: 'placeholder',
    };
    const h = computeFindingHash(extractHashPayload(full));
    // round-trip 后仍是合法 SHA256 hex
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});

// Task 7(plan-9a §8): candidate 验证框架测试(本 plan 全部 stub 返回 not_implemented)
describe('candidate validation framework', () => {
  it('CANDIDATE_VALIDATORS has all 6 candidate_types', () => {
    const keys = Object.keys(CANDIDATE_VALIDATORS).sort();
    expect(keys).toEqual([
      'api_contract',
      'coverage_gap',
      'evidence_missing',
      'hash_mismatch',
      'manual_claim',
      'test_failure',
    ]);
  });

  it('all 6 stubs return verified:false reason:not_implemented', async () => {
    for (const ctype of Object.keys(CANDIDATE_VALIDATORS) as Array<
      keyof typeof CANDIDATE_VALIDATORS
    >) {
      const result = await CANDIDATE_VALIDATORS[ctype]({} as Finding);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('not_implemented');
    }
  });

  it('validateCandidate returns not-a-candidate when severity_candidate missing', async () => {
    const finding = { severity: 'WARNING' } as unknown as Finding;
    const result = await validateCandidate(finding);
    // 非 candidate finding 直接通过
    expect(result.verified).toBe(true);
    expect(result.reason).toBe('not-a-candidate');
  });

  it('validateCandidate returns missing-candidate_type when candidate_type absent', async () => {
    const finding = { severity: 'WARNING', severity_candidate: 'CRITICAL' } as unknown as Finding;
    const result = await validateCandidate(finding);
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('missing-candidate_type');
  });

  it('validateCandidate dispatches to test_failure stub → not_implemented', async () => {
    const finding = {
      severity: 'WARNING',
      severity_candidate: 'CRITICAL',
      candidate_type: 'test_failure',
    } as unknown as Finding;
    const result = await validateCandidate(finding);
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('not_implemented');
  });
});
