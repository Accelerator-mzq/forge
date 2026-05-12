// archive-summary-schema.test.ts — plan-9e1 Task 1 单测
// 沿 verify-findings-schema.test.ts / pause-decisions-schema.test.ts 模式
// 校验 archive_summary 顶级字段:schema/version/archived_at/change_id/...
// 业务规则(handoff 三类聚合 / process_evidence_summary 真实统计)留给 Task 2 builder + 9e2

import { describe, it, expect } from 'vitest';
import { validateArchiveSummarySchema } from '../../../src/core/validate/archive-summary-schema.js';

// 合法 baseline(沿 design §2.4.3 YAML 示例字面)
const baseSummary = {
  schema: 'forge-archive-summary/v1',
  version: '1.0.0',
  archived_at: '2026-05-12T16:45:00Z',
  change_id: 'add-oauth-refresh',
  verify_passed: { verified_invariants: ['hash-match', 'evidence-complete'] },
  review_passed: { reviewers: ['ai-agent'] },
  process_evidence_summary: {
    placeholder: true, // 9e1 仅写 placeholder,9e2 接 9g 实施后填实
    note: 'process_evidence 13 不变量统计待 9g + 9e2 实施',
  },
  handoff_to_backlog: [],
  acked_warnings: [],
  pending_suggestions: [],
};

describe('archive_summary schema validation', () => {
  it('合法 baseline → 通过', () => {
    const result = validateArchiveSummarySchema(baseSummary);
    expect(result.valid).toBe(true);
  });

  it('schema 字段缺失 → 拒签', () => {
    const { schema: _, ...rest } = baseSummary;
    void _;
    const result = validateArchiveSummarySchema(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'schema')).toBe(true);
  });

  it('schema 值不是 forge-archive-summary/v1 → 拒签', () => {
    const result = validateArchiveSummarySchema({ ...baseSummary, schema: 'foo/v2' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /forge-archive-summary\/v1/.test(e.message))).toBe(true);
  });

  it('version 非 semver 字符串 → 拒签', () => {
    const result = validateArchiveSummarySchema({ ...baseSummary, version: 'not-semver' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'version')).toBe(true);
  });

  it('archived_at 非 ISO 8601 → 拒签', () => {
    const result = validateArchiveSummarySchema({
      ...baseSummary,
      archived_at: '2026-05-12 16:45',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'archived_at')).toBe(true);
  });

  it('change_id 空串 → 拒签', () => {
    const result = validateArchiveSummarySchema({ ...baseSummary, change_id: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'change_id')).toBe(true);
  });

  it('verify_passed 非 object → 拒签', () => {
    const result = validateArchiveSummarySchema({
      ...baseSummary,
      verify_passed: 'not-object',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'verify_passed')).toBe(true);
  });

  it('handoff_to_backlog 非数组 → 拒签', () => {
    const result = validateArchiveSummarySchema({
      ...baseSummary,
      handoff_to_backlog: 'not-array',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'handoff_to_backlog')).toBe(true);
  });

  it('acked_warnings 非数组 → 拒签', () => {
    const result = validateArchiveSummarySchema({ ...baseSummary, acked_warnings: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'acked_warnings')).toBe(true);
  });

  it('pending_suggestions 非数组 → 拒签', () => {
    const result = validateArchiveSummarySchema({ ...baseSummary, pending_suggestions: null });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pending_suggestions')).toBe(true);
  });

  it('process_evidence_summary 缺失 → 拒签(必填,即使 placeholder)', () => {
    const { process_evidence_summary: _, ...rest } = baseSummary;
    void _;
    const result = validateArchiveSummarySchema(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'process_evidence_summary')).toBe(true);
  });

  it('handoff_to_backlog 含合法 entry → 通过', () => {
    const result = validateArchiveSummarySchema({
      ...baseSummary,
      handoff_to_backlog: [
        {
          source: 'verify_findings',
          id: 3,
          severity: 'SUGGESTION',
          dimension: 'coherence',
          check_type: 'pattern-consistency',
          evidence: 'src/auth/login.ts:23',
          recommendation: 'rename handleLogin',
        },
      ],
    });
    expect(result.valid).toBe(true);
  });
});
