// archive-summary-output.test.ts — plan-9e1 Task 4 单测
// 校验 renderArchiveSummaryOutput 输出格式(沿 design §2.4.4)

import { describe, it, expect } from 'vitest';
import { renderArchiveSummaryOutput } from '../../src/core/archive/summary-render.js';
import {
  ARCHIVE_SUMMARY_VERSION,
  PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
  type ArchiveSummary,
} from '../../src/core/schemas/archive-summary.js';

function baseSummary(): ArchiveSummary {
  return {
    schema: 'forge-archive-summary/v1',
    version: ARCHIVE_SUMMARY_VERSION,
    archived_at: '2026-05-12T16:45:00Z',
    change_id: 'add-oauth-refresh',
    verify_passed: { verified_invariants: ['hash-match', 'evidence-complete'] },
    review_passed: { reviewers: ['ai-agent'] },
    process_evidence_summary: PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
    handoff_to_backlog: [],
    acked_warnings: [],
    pending_suggestions: [],
  };
}

describe('renderArchiveSummaryOutput', () => {
  it('空 summary → 只含基本 header', () => {
    const out = renderArchiveSummaryOutput(baseSummary(), '2026-05-12-add-oauth-refresh');
    expect(out).toMatch(/## Archive Complete/);
    expect(out).toMatch(/\*\*Change:\*\* add-oauth-refresh/);
    expect(out).toMatch(
      /\*\*Archived to:\*\* forge\/changes\/archive\/2026-05-12-add-oauth-refresh/,
    );
    expect(out).not.toMatch(/Acknowledged Warnings/); // 空数组不出现段
    expect(out).not.toMatch(/Pending Suggestions/);
  });

  it('含 acked_warnings → 渲染 Acknowledged Warnings 段', () => {
    const s = baseSummary();
    s.acked_warnings = [
      {
        source: 'verify_findings',
        id: 2,
        dimension: 'correctness',
        check_type: 'requirement-mapping',
        evidence: 'specs/auth.md:15',
        acked_by: 'msc',
        acked_at: '2026-05-12T16:30:00Z',
        rationale: 'spec 描述模糊',
      },
    ];
    const out = renderArchiveSummaryOutput(s, '2026-05-12-add-oauth-refresh');
    expect(out).toMatch(/### Acknowledged Warnings \(1\)/);
    expect(out).toMatch(/\[WARNING\] verify_findings#2/);
    expect(out).toMatch(/correctness\/requirement-mapping/);
    expect(out).toMatch(/Acked by: msc/);
  });

  it('含 pending_suggestions → 渲染 Pending Suggestions 段 + handoff 提示', () => {
    const s = baseSummary();
    s.pending_suggestions = [
      {
        source: 'verify_findings',
        id: 3,
        dimension: 'coherence',
        check_type: 'pattern-consistency',
        evidence: 'src/auth/login.ts:23',
        recommendation: '考虑 rename handleLogin',
      },
    ];
    const out = renderArchiveSummaryOutput(s, '2026-05-12-add-oauth-refresh');
    expect(out).toMatch(/### Pending Suggestions \(1\) — handed off to backlog/);
    expect(out).toMatch(/\[SUGGESTION\] verify_findings#3/);
    expect(out).toMatch(/handleLogin/);
    expect(out).toMatch(/forge backlog list/); // v1.1 引用
  });
});
