// summary-builder.test.ts — plan-9e1 Task 2 单测
// 校验 buildArchiveSummary 三类聚合:
//   collector1: acked_warnings(verify_findings + review_outcomes WARNING + ack)
//   collector2: pending_suggestions(SUGGESTION + resolved=false)
//   collector3: handoff_to_backlog(三类 input 聚合)
//     - verify_findings/review_outcomes SUGGESTION 未 resolved
//     - pause_decisions chosen_option=3
//     - proposal/design scope-entries Out-of-Scope/Future-Work YAML 块的 active entry

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildArchiveSummary } from '../../../src/core/archive/summary-builder.js';
import type { FenceCheckResult } from '../../../src/core/archive/fence.js';

// helper:构造 stub FenceCheckResult(plan-9e2 Task 2;quality review I-1:前移到 STUB_FENCE_RESULT 之前)
// 注:const 不能引用文件后部声明的 function — TS function declaration hoisting 只对 function 不对 const = ...
function buildStubFenceResult(opts: {
  passed: number;
  warning: number;
  failed: number;
  exempt: number;
}): FenceCheckResult {
  const results = [];
  let idx = 1;
  for (let i = 0; i < opts.passed; i++) {
    results.push({
      invariant: `fence-${idx++}`,
      ok: true,
      status: 'pass' as const,
      reason: 'pass',
    });
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

// plan-9e2 Task 2:既有测试用 stub fenceResult(14 全 pass,sum 不变式 14+0+0+0=14 成立)
// quality review I-1:防 Task 3 schema validator 严格化后既有 ~17 test 集体失败
const STUB_FENCE_RESULT: FenceCheckResult = buildStubFenceResult({
  passed: 14,
  warning: 0,
  failed: 0,
  exempt: 0,
});

// helper:在 tmpdir 建一个最小 change 目录(proposal + design + tasks + specs)
function setupChangeDir(): { changeDir: string; cleanup: () => void } {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-builder-'));
  const changeDir = join(tmpRoot, 'forge', 'changes', 'add-x');
  mkdirSync(join(changeDir, 'specs'), { recursive: true });
  writeFileSync(join(changeDir, 'proposal.md'), '# Add X\n\n## Why\nreason\n', 'utf8');
  writeFileSync(join(changeDir, 'design.md'), '# Design X\n', 'utf8');
  writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [x] t1\n', 'utf8');
  writeFileSync(join(changeDir, 'specs', 'x.md'), '# X Spec\n', 'utf8');
  return {
    changeDir,
    cleanup: () => rmSync(tmpRoot, { recursive: true, force: true }),
  };
}

// helper:合法 verify marker baseline(无 findings)
function baseVerifyMarker(): Record<string, unknown> {
  return {
    schema: 'forge-verify/v1',
    verified_at: '2026-05-12T16:30:00Z',
    verified_by: 'ai-agent',
    tasks_hash: 'sha256:' + 'a'.repeat(64),
    content_hash: 'sha256:' + 'b'.repeat(64),
    evidence: [],
  };
}

function baseReviewMarker(): Record<string, unknown> {
  return {
    schema: 'forge-review/v1',
    reviewed_at: '2026-05-12T16:40:00Z',
    reviewed_by: 'ai-agent',
    tasks_hash: 'sha256:' + 'a'.repeat(64),
    content_hash: 'sha256:' + 'b'.repeat(64),
    git: { is_git_repo: false },
    review_outcomes: [],
  };
}

describe('buildArchiveSummary - basic baseline', () => {
  let ctx: { changeDir: string; cleanup: () => void };
  beforeEach(() => {
    ctx = setupChangeDir();
  });
  afterEach(() => ctx.cleanup());

  it('空 markers + 空 scope → 三数组都空', async () => {
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    expect(summary.handoff_to_backlog).toEqual([]);
    expect(summary.acked_warnings).toEqual([]);
    expect(summary.pending_suggestions).toEqual([]);
    expect(summary.schema).toBe('forge-archive-summary/v1');
    expect(summary.change_id).toBe('add-x');
    // plan-9e2 Task 2:生产路径 buildProcessEvidenceSummary 不再写 placeholder=true
    expect(summary.process_evidence_summary.placeholder).toBe(false);
  });

  it('verify_passed.verified_invariants 至少含 hash-match + evidence-complete', async () => {
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    expect(summary.verify_passed.verified_invariants).toContain('hash-match');
    expect(summary.verify_passed.verified_invariants).toContain('evidence-complete');
  });

  it('review_passed.reviewers 含 reviewed_by 字段值', async () => {
    const verify = baseVerifyMarker();
    const review = baseReviewMarker();
    review.reviewed_by = 'msc';
    const summary = await buildArchiveSummary(
      verify,
      review,
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    expect(summary.review_passed.reviewers).toContain('msc');
  });
});

describe('buildArchiveSummary - collector1 acked_warnings', () => {
  let ctx: { changeDir: string; cleanup: () => void };
  beforeEach(() => {
    ctx = setupChangeDir();
  });
  afterEach(() => ctx.cleanup());

  it('verify_findings WARNING + acked → acked_warnings 含 1 项', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 2,
        dimension: 'correctness',
        check_type: 'requirement-mapping',
        severity: 'WARNING',
        automated: false,
        evidence: 'specs/auth.md:15',
        recommendation: 'expand impl',
        resolved: false,
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T16:30:00Z',
        finding_hash: 'c'.repeat(64),
        content_hash: 'sha256:' + 'd'.repeat(64),
        git_head: 'e'.repeat(40),
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    expect(summary.acked_warnings).toHaveLength(1);
    expect(summary.acked_warnings[0]?.source).toBe('verify_findings');
    expect(summary.acked_warnings[0]?.id).toBe(2);
    expect(summary.acked_warnings[0]?.acked_by).toBe('msc');
  });

  it('verify_findings WARNING + resolved=true → 不入 acked_warnings(已解决)', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 2,
        dimension: 'correctness',
        check_type: 'x',
        severity: 'WARNING',
        automated: false,
        evidence: 'change-level',
        recommendation: 'r',
        resolved: true,
        finding_hash: 'c'.repeat(64),
        content_hash: 'sha256:' + 'd'.repeat(64),
        git_head: 'e'.repeat(40),
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    expect(summary.acked_warnings).toHaveLength(0);
  });
});

describe('buildArchiveSummary - collector2 pending_suggestions', () => {
  let ctx: { changeDir: string; cleanup: () => void };
  beforeEach(() => {
    ctx = setupChangeDir();
  });
  afterEach(() => ctx.cleanup());

  it('verify_findings SUGGESTION + resolved=false → pending_suggestions 含 1 项', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 3,
        dimension: 'coherence',
        check_type: 'pattern-consistency',
        severity: 'SUGGESTION',
        automated: false,
        evidence: 'src/auth/login.ts:23',
        recommendation: 'rename handleLogin',
        resolved: false,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    expect(summary.pending_suggestions).toHaveLength(1);
    expect(summary.pending_suggestions[0]?.id).toBe(3);
    expect(summary.pending_suggestions[0]?.dimension).toBe('coherence');
  });

  it('verify_findings SUGGESTION + resolved=true → 不入 pending_suggestions', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 3,
        dimension: 'coherence',
        check_type: 'x',
        severity: 'SUGGESTION',
        automated: false,
        evidence: 'change-level',
        recommendation: 'r',
        resolved: true,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    expect(summary.pending_suggestions).toHaveLength(0);
  });

  // v2 BLOCKER 3 新增:review_outcomes L 简码 → SUGGESTION 直接映射(沿 design §2.3.5 line 558)
  it('review_outcomes L + resolved=false → pending_suggestions 含 1 项 source=review_outcomes', async () => {
    const review = baseReviewMarker();
    review.review_outcomes = [
      { severity: 'L', accepted: false, resolved: false, rationale: 'nice-to-have rename' },
    ];
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      review,
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    expect(summary.pending_suggestions).toHaveLength(1);
    expect(summary.pending_suggestions[0]?.source).toBe('review_outcomes');
    expect(summary.pending_suggestions[0]?.recommendation).toBe('nice-to-have rename');
  });

  // v2 BLOCKER 3 新增:review_outcomes C 简码 → builder **不收**(C 由 fence 拒签;后续不该走到 builder)
  it('review_outcomes C + accepted=true + rationale 非空 → builder 不收(由 fence 拒签;builder sanity 应忽略)', async () => {
    const review = baseReviewMarker();
    review.review_outcomes = [
      { severity: 'C', accepted: true, resolved: false, rationale: 'should be rejected by fence' },
    ];
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      review,
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    // builder 仅 sanity:C 不进 acked_warnings / pending_suggestions
    expect(summary.acked_warnings).toHaveLength(0);
    expect(summary.pending_suggestions).toHaveLength(0);
  });
});

// v3 MAJOR 2 新增:ScopeEntriesIntegrityError 抛错路径 4 case
describe('buildArchiveSummary - ScopeEntriesIntegrityError 抛错路径(v3 MAJOR 2)', () => {
  let ctx: { changeDir: string; cleanup: () => void };
  beforeEach(() => {
    ctx = setupChangeDir();
  });
  afterEach(() => ctx.cleanup());

  it('proposal Out-of-Scope 段 YAML 语法错 → 抛 ScopeEntriesIntegrityError', async () => {
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# X',
        '## Why',
        'r',
        '## Out of Scope {#forge-oos}',
        '```yaml',
        'schema: forge-scope-entries/v1',
        '@@@@@ corrupt yaml',
        '```',
      ].join('\n'),
      'utf8',
    );
    await expect(
      buildArchiveSummary(
        baseVerifyMarker(),
        baseReviewMarker(),
        ctx.changeDir,
        'add-x',
        STUB_FENCE_RESULT,
      ),
    ).rejects.toThrow(/scope-entries YAML parse failed/);
  });

  it('proposal Out-of-Scope 段 schema 非 forge-scope-entries/v1 → 抛 ScopeEntriesIntegrityError', async () => {
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# X',
        '## Why',
        'r',
        '## Out of Scope {#forge-oos}',
        '```yaml',
        'schema: wrong/v2',
        'anchor_id: forge-oos',
        'entries: []',
        '```',
      ].join('\n'),
      'utf8',
    );
    await expect(
      buildArchiveSummary(
        baseVerifyMarker(),
        baseReviewMarker(),
        ctx.changeDir,
        'add-x',
        STUB_FENCE_RESULT,
      ),
    ).rejects.toThrow(/scope-entries schema 非 'forge-scope-entries\/v1'/);
  });

  it('proposal Out-of-Scope 段 anchor_id 不匹配 → 抛 ScopeEntriesIntegrityError', async () => {
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# X',
        '## Why',
        'r',
        '## Out of Scope {#forge-oos}',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-non-goals', // 不匹配 forge-oos
        'entries: []',
        '```',
      ].join('\n'),
      'utf8',
    );
    await expect(
      buildArchiveSummary(
        baseVerifyMarker(),
        baseReviewMarker(),
        ctx.changeDir,
        'add-x',
        STUB_FENCE_RESULT,
      ),
    ).rejects.toThrow(/scope-entries anchor_id 不匹配/);
  });

  it('proposal Out-of-Scope 段 entries 非数组 → 抛 ScopeEntriesIntegrityError', async () => {
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# X',
        '## Why',
        'r',
        '## Out of Scope {#forge-oos}',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries: not-an-array',
        '```',
      ].join('\n'),
      'utf8',
    );
    await expect(
      buildArchiveSummary(
        baseVerifyMarker(),
        baseReviewMarker(),
        ctx.changeDir,
        'add-x',
        STUB_FENCE_RESULT,
      ),
    ).rejects.toThrow(/scope-entries entries 非数组/);
  });
});

describe('buildArchiveSummary - collector3 handoff_to_backlog 三类聚合', () => {
  let ctx: { changeDir: string; cleanup: () => void };
  beforeEach(() => {
    ctx = setupChangeDir();
  });
  afterEach(() => ctx.cleanup());

  it('第 1 类:verify_findings SUGGESTION 持挂 → handoff_to_backlog 含一项 source=verify_findings', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 3,
        dimension: 'coherence',
        check_type: 'x',
        severity: 'SUGGESTION',
        automated: false,
        evidence: 'src/x.ts:1',
        recommendation: 'r',
        resolved: false,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    expect(summary.handoff_to_backlog).toHaveLength(1);
    expect(summary.handoff_to_backlog[0]?.source).toBe('verify_findings');
    expect(summary.handoff_to_backlog[0]?.severity).toBe('SUGGESTION');
  });

  it('第 2 类:pause_decisions chosen_option=3 → handoff_to_backlog 含一项 source=pause_decisions', async () => {
    const verify = baseVerifyMarker();
    verify.pause_decisions = [
      {
        id: 1,
        paused_at: '2026-05-12T15:00:00Z',
        task_ref: 'tasks.md#t1',
        issue_summary: 'OAuth refresh edge',
        severity: 'WARNING',
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T15:05:00Z',
        chosen_option: 3,
        target_artifact: 'proposal.md',
        target_anchor: '## Out of Scope',
        non_blocking_rationale: 'can skip',
        other_rationale: null,
        other_acked_by: null,
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    const pauseEntries = summary.handoff_to_backlog.filter((e) => e.source === 'pause_decisions');
    expect(pauseEntries).toHaveLength(1);
    expect(pauseEntries[0]?.id).toBe(1);
    expect(pauseEntries[0]?.chosen_option).toBe(3);
    expect(pauseEntries[0]?.target_anchor).toBe('## Out of Scope');
  });

  it('第 2 类:pause_decisions chosen_option!=3 → 不进 handoff_to_backlog(option=1/2/4)', async () => {
    const verify = baseVerifyMarker();
    verify.pause_decisions = [
      {
        id: 1,
        paused_at: '2026-05-12T15:00:00Z',
        task_ref: 'tasks.md#t1',
        issue_summary: 'x',
        severity: 'WARNING',
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T15:05:00Z',
        chosen_option: 1, // 扩 scope,不进 backlog
        target_artifact: 'proposal.md',
        target_anchor: '## What',
        non_blocking_rationale: null,
        other_rationale: null,
        other_acked_by: null,
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    const pauseEntries = summary.handoff_to_backlog.filter((e) => e.source === 'pause_decisions');
    expect(pauseEntries).toHaveLength(0);
  });

  it('第 3 类:proposal Out-of-Scope scope-entries YAML 块 active entry → handoff_to_backlog 含一项 source=scope_entries', async () => {
    // 在 proposal.md 写一个含 forge-oos anchor + fenced YAML block
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# Add X',
        '',
        '## Why',
        'reason',
        '',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: oos-refresh-token',
        '    category: out-of-scope',
        '    description: OAuth refresh token 处理',
        '    reason: 本 change 仅含 access token issue/verify',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
        '',
      ].join('\n'),
      'utf8',
    );
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    const scopeEntries = summary.handoff_to_backlog.filter((e) => e.source === 'scope_entries');
    expect(scopeEntries).toHaveLength(1);
    expect(scopeEntries[0]?.id).toBe('oos-refresh-token');
    expect(scopeEntries[0]?.category).toBe('out-of-scope');
    expect(scopeEntries[0]?.reason).toBe('本 change 仅含 access token issue/verify');
  });

  it('第 3 类:scope-entries status=inherited / superseded / completed / obsolete → 不进 handoff(只 active 进)', async () => {
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# Add X',
        '',
        '## Why',
        'reason',
        '',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: old-entry',
        '    category: out-of-scope',
        '    description: 老条目',
        '    reason: 已在前置 change 标记',
        '    priority: null',
        '    status: inherited',
        '    triggered_by: null',
        '    related_change: null',
        '  - id: superseded-entry',
        '    category: out-of-scope',
        '    description: 被覆盖',
        '    reason: 后续 change 接手',
        '    priority: null',
        '    status: superseded',
        '    triggered_by: null',
        '    related_change: null',
        '```',
        '',
      ].join('\n'),
      'utf8',
    );
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    const scopeEntries = summary.handoff_to_backlog.filter((e) => e.source === 'scope_entries');
    expect(scopeEntries).toHaveLength(0);
  });

  it('混合三类 input → handoff_to_backlog 含三条 source 各一', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 3,
        dimension: 'coherence',
        check_type: 'x',
        severity: 'SUGGESTION',
        automated: false,
        evidence: 'src/x.ts:1',
        recommendation: 'r',
        resolved: false,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    verify.pause_decisions = [
      {
        id: 1,
        paused_at: '2026-05-12T15:00:00Z',
        task_ref: 'tasks.md#t1',
        issue_summary: 'OAuth refresh edge',
        severity: 'WARNING',
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T15:05:00Z',
        chosen_option: 3,
        target_artifact: 'proposal.md',
        target_anchor: '## Out of Scope',
        non_blocking_rationale: 'can skip',
        other_rationale: null,
        other_acked_by: null,
      },
    ];
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# Add X',
        '## Why',
        'r',
        '## Out of Scope {#forge-oos}',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: e1',
        '    category: out-of-scope',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
      'utf8',
    );
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
      STUB_FENCE_RESULT,
    );
    const bySource = new Set(summary.handoff_to_backlog.map((e) => e.source));
    expect(bySource).toEqual(new Set(['verify_findings', 'pause_decisions', 'scope_entries']));
    expect(summary.handoff_to_backlog).toHaveLength(3);
  });
});

// ============================================================
// plan-9e2 Task 2:buildProcessEvidenceSummary + buildArchiveSummary 签名扩 5 case
// ============================================================
// 注:buildArchiveSummary + FenceCheckResult + buildStubFenceResult helper 已在文件顶部定义/import(quality review I-1 修订前移)

describe('buildProcessEvidenceSummary 通过 buildArchiveSummary 接入 — plan-9e2 Task 2', () => {
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

  it('mixed:3 pass + 1 WARNING + 0 fail + 10 exempt → 4 字段计数正确', async () => {
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
