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

  it('review_passed 非 object → 拒签', () => {
    const result = validateArchiveSummarySchema({
      ...baseSummary,
      review_passed: 'not-object',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'review_passed')).toBe(true);
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

  // ============================================================
  // plan-9e2 Task 3:placeholder=false 路径严格校验扩 10 case
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
      void invariants_passed;
      const result = validateArchiveSummarySchema(buildWithPeSummary(rest));
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'process_evidence_summary.invariants_passed'),
      ).toBe(true);
    });

    it('placeholder=false 缺 invariants_with_warning → 拒签(v2 codex 一轮 MAJOR 修订新字段)', () => {
      const { invariants_with_warning, ...rest } = realSummaryBaseline;
      void invariants_with_warning;
      const result = validateArchiveSummarySchema(buildWithPeSummary(rest));
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'process_evidence_summary.invariants_with_warning'),
      ).toBe(true);
    });

    it('placeholder=false 缺 invariants_failed → 拒签', () => {
      const { invariants_failed, ...rest } = realSummaryBaseline;
      void invariants_failed;
      const result = validateArchiveSummarySchema(buildWithPeSummary(rest));
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'process_evidence_summary.invariants_failed'),
      ).toBe(true);
    });

    it('placeholder=false 缺 legacy_exempt → 拒签', () => {
      const { legacy_exempt, ...rest } = realSummaryBaseline;
      void legacy_exempt;
      const result = validateArchiveSummarySchema(buildWithPeSummary(rest));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'process_evidence_summary.legacy_exempt')).toBe(
        true,
      );
    });

    it('placeholder=false invariants_with_warning = -1 → 越界 + sum 不变式破,with_warning 错误存在', () => {
      // I-2 quality review 修订:数学根本矛盾 — sum=14 时单字段越界必须另字段负数补偿
      //   故只让 with_warning=-1,接受 sum 也错;断言只查 with_warning 越界错误存在
      const result = validateArchiveSummarySchema(
        buildWithPeSummary({ ...realSummaryBaseline, invariants_with_warning: -1 }),
      );
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.field === 'process_evidence_summary.invariants_with_warning' &&
            /must be in \[0, 14\]/.test(e.message),
        ),
      ).toBe(true);
    });

    it('placeholder=false invariants_passed = 15 → 越界 + sum 不变式破,passed 错误存在', () => {
      // I-2 quality review 修订:同 case 5,只让 passed=15,接受 sum 也错;断言只查 passed 越界
      const result = validateArchiveSummarySchema(
        buildWithPeSummary({ ...realSummaryBaseline, invariants_passed: 15 }),
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
});
