// tests/core/markers/verify-findings-schema.test.ts
// plan-9d Task 3 — VerifyFinding marker schema 数组校验
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
        // v13 REG-LOGHASH-TASK3-001 修订:Task 3 测试是 marker-schema 单元测试,
        // 只校验 schema 格式(SHA256_RE),不真重算 log hash;hardcoded 合法 sha256: 前缀即可
        // (e2e 测试中 fixture 必须真算 — 见 Task 8 buildFixture)
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
      finding_hash: 'e'.repeat(64), // 裸 hex,沿 9a finding-hash.ts:8
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
      finding_hash: 'e'.repeat(64),
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
      finding_hash: 'e'.repeat(64),
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

  // v4 D-2 修订:finding id 唯一性校验
  it('verify_findings 含重复 finding.id → 拒签', () => {
    const findingTemplate = {
      dimension: 'completeness' as const,
      check_type: 'spec-coverage',
      severity: 'CRITICAL' as const,
      automated: true,
      content_hash: 'sha256:' + 'a'.repeat(64),
      git_head: 'd'.repeat(40),
      evidence: 'x',
      recommendation: 'y',
      resolved: false,
      finding_hash: 'e'.repeat(64),
    };
    const result = validateMarkerSchema({
      ...baseMarker,
      verify_findings: [
        { id: 1, ...findingTemplate },
        { id: 1, ...findingTemplate }, // 重复 id
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /finding id 1 重复/.test(e.message))).toBe(true);
  });
});
