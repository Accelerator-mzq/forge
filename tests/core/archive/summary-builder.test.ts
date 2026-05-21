// tests/core/archive/summary-builder.test.ts — v4 OpenSpec alignment 简版(plan-v4 Phase 4 Task 4.11)
//
// 覆盖 v4 buildArchiveSummary 主路径:
//   - happy path:verify + review marker(无 pause)+ deltas → archive_summary v2
//   - spec_updates_applied:每 delta 1:1 映射 capability/operation
//   - handoff_to_backlog:pause_decisions option=3 + scope_entries active(两来源)
//   - F-3(Codex Phase 1 backlog):verify + review 同 (task_ref, paused_at) 去重
//   - scope_entries:forge-oos / forge-future-work active 进;forge-non-goals / 非 active 不进

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildArchiveSummary } from '../../../src/core/archive/summary-builder.js';
import type { SpecDelta } from '../../../src/core/specs-sync/index.js';

let archivePath: string;
beforeEach(() => {
  archivePath = mkdtempSync(join(tmpdir(), 'forge-summary-v4-'));
});
afterEach(() => rmSync(archivePath, { recursive: true, force: true }));

/** v4 v2 verify marker(可选 pause_decisions) */
function vMarker(
  pause_decisions?: Array<Record<string, unknown>>,
  verified_by: string = 'ai-agent',
): Record<string, unknown> {
  const m: Record<string, unknown> = {
    schema: 'forge-verify/v2',
    verified_at: '2026-05-21T10:00:00Z',
    verified_by,
  };
  if (pause_decisions) m.pause_decisions = pause_decisions;
  return m;
}

/** v4 v2 review marker */
function rMarker(
  pause_decisions?: Array<Record<string, unknown>>,
  reviewed_by: string = 'ai-agent',
): Record<string, unknown> {
  const m: Record<string, unknown> = {
    schema: 'forge-review/v2',
    reviewed_at: '2026-05-21T11:00:00Z',
    reviewed_by,
  };
  if (pause_decisions) m.pause_decisions = pause_decisions;
  return m;
}

describe('buildArchiveSummary (v4)', () => {
  it('happy path:无 pause、无 deltas → archive_summary v2 字段齐', async () => {
    const summary = await buildArchiveSummary({
      archivePath,
      changeId: 'add-login',
      verifyMarker: vMarker(),
      reviewMarker: rMarker(),
      deltas: [],
      archivedAt: '2026-05-21T12:00:00Z',
    });
    expect(summary.schema).toBe('forge-archive-summary/v2');
    expect(summary.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(summary.archived_at).toBe('2026-05-21T12:00:00Z');
    expect(summary.change_id).toBe('add-login');
    expect(summary.verified_by).toBe('ai-agent');
    expect(summary.reviewed_by).toBe('ai-agent');
    expect(summary.spec_updates_applied).toEqual([]);
    expect(summary.handoff_to_backlog).toEqual([]);
  });

  it('spec_updates_applied:每 delta 1:1 映射 capability + operation', async () => {
    const deltas: SpecDelta[] = [
      { name: 'auth', operation: 'replace', content: 'x' },
      { name: 'api', operation: 'create', content: 'y' },
      { name: 'legacy', operation: 'delete', content: null },
    ];
    const summary = await buildArchiveSummary({
      archivePath,
      changeId: 'multi-spec',
      verifyMarker: vMarker(),
      reviewMarker: rMarker(),
      deltas,
    });
    expect(summary.spec_updates_applied).toEqual([
      { capability: 'auth', operation: 'replace' },
      { capability: 'api', operation: 'create' },
      { capability: 'legacy', operation: 'delete' },
    ]);
  });

  it('pause_decisions chosen_option=3 → handoff_to_backlog 含 pause_decisions entry', async () => {
    const summary = await buildArchiveSummary({
      archivePath,
      changeId: 'with-pause',
      verifyMarker: vMarker([
        {
          paused_at: '2026-05-21T09:00:00Z',
          task_ref: 'tasks.md#t1',
          issue_summary: '把 X 转 out-of-scope',
          chosen_option: 3,
        },
      ]),
      reviewMarker: rMarker(),
      deltas: [],
    });
    expect(summary.handoff_to_backlog).toEqual([
      {
        source: 'pause_decisions',
        id: 0,
        chosen_option: 3,
        issue_summary: '把 X 转 out-of-scope',
      },
    ]);
  });

  it('pause_decisions chosen_option=1/2/4 → 不进 handoff', async () => {
    const summary = await buildArchiveSummary({
      archivePath,
      changeId: 'pause-other',
      verifyMarker: vMarker([
        { paused_at: '2026-05-21T09:00:00Z', task_ref: 'a', issue_summary: 'a', chosen_option: 1 },
        { paused_at: '2026-05-21T09:10:00Z', task_ref: 'b', issue_summary: 'b', chosen_option: 2 },
        { paused_at: '2026-05-21T09:20:00Z', task_ref: 'c', issue_summary: 'c', chosen_option: 4 },
      ]),
      reviewMarker: rMarker(),
      deltas: [],
    });
    expect(summary.handoff_to_backlog).toEqual([]);
  });

  // F-3 Codex Phase 1 backlog —— pause_decisions dedup
  it('F-3:verify + review 含同 (task_ref, paused_at) pause_decision → 去重(verify 侧优先)', async () => {
    const same = {
      paused_at: '2026-05-21T09:00:00Z',
      task_ref: 'tasks.md#t1',
      issue_summary: 'verify 侧版本',
      chosen_option: 3,
    };
    const sameRev = {
      ...same,
      issue_summary: 'review 侧版本(应被去掉)',
    };
    const summary = await buildArchiveSummary({
      archivePath,
      changeId: 'dedup',
      verifyMarker: vMarker([same]),
      reviewMarker: rMarker([sameRev]),
      deltas: [],
    });
    expect(summary.handoff_to_backlog).toHaveLength(1);
    expect((summary.handoff_to_backlog[0] as { issue_summary: string }).issue_summary).toBe(
      'verify 侧版本',
    );
  });

  it('F-3 edge case:task_ref 同但 paused_at 不同 → 不去重(两 entry 都进 handoff)', async () => {
    const summary = await buildArchiveSummary({
      archivePath,
      changeId: 'same-task-diff-ts',
      verifyMarker: vMarker([
        {
          paused_at: '2026-05-21T09:00:00Z',
          task_ref: 'tasks.md#t1',
          issue_summary: 'first',
          chosen_option: 3,
        },
      ]),
      reviewMarker: rMarker([
        {
          paused_at: '2026-05-21T10:00:00Z',
          task_ref: 'tasks.md#t1',
          issue_summary: 'second',
          chosen_option: 3,
        },
      ]),
      deltas: [],
    });
    expect(summary.handoff_to_backlog).toHaveLength(2);
  });

  it('proposal.md forge-oos active scope_entry → handoff scope_entries', async () => {
    writeFileSync(
      join(archivePath, 'proposal.md'),
      [
        '# Add Login',
        '',
        '## Why',
        '需要登录.',
        '',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: oos-1',
        '    category: out-of-scope',
        '    description: SSO 支持',
        '    reason: 留 v4.1',
        '    status: active',
        '```',
      ].join('\n'),
      'utf8',
    );
    const summary = await buildArchiveSummary({
      archivePath,
      changeId: 'oos-test',
      verifyMarker: vMarker(),
      reviewMarker: rMarker(),
      deltas: [],
    });
    expect(summary.handoff_to_backlog).toHaveLength(1);
    const h = summary.handoff_to_backlog[0]!;
    expect(h.source).toBe('scope_entries');
    expect(h.id).toBe('oos-1');
    expect(h.category).toBe('out-of-scope');
    expect(h.description).toBe('SSO 支持');
  });

  it('scope_entry status=inherited/superseded/completed → 不进 handoff', async () => {
    writeFileSync(
      join(archivePath, 'design.md'),
      [
        '# Design',
        '',
        '## Future Work {#forge-future-work}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-future-work',
        'entries:',
        '  - id: fw-1',
        '    category: future-work',
        '    description: A',
        '    reason: r',
        '    status: inherited',
        '  - id: fw-2',
        '    category: future-work',
        '    description: B',
        '    reason: r',
        '    status: active',
        '```',
      ].join('\n'),
      'utf8',
    );
    const summary = await buildArchiveSummary({
      archivePath,
      changeId: 'fw-test',
      verifyMarker: vMarker(),
      reviewMarker: rMarker(),
      deltas: [],
    });
    expect(summary.handoff_to_backlog).toHaveLength(1);
    expect(summary.handoff_to_backlog[0]!.id).toBe('fw-2');
  });

  it('forge-non-goals anchor 即使 status=active 也不进 handoff(v4 仅 oos/future-work 进)', async () => {
    writeFileSync(
      join(archivePath, 'proposal.md'),
      [
        '# X',
        '',
        '## Non-Goals {#forge-non-goals}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-non-goals',
        'entries:',
        '  - id: ng-1',
        '    category: non-goal',
        '    description: 不做 sharding',
        '    reason: r',
        '    status: active',
        '```',
      ].join('\n'),
      'utf8',
    );
    const summary = await buildArchiveSummary({
      archivePath,
      changeId: 'ng-test',
      verifyMarker: vMarker(),
      reviewMarker: rMarker(),
      deltas: [],
    });
    expect(summary.handoff_to_backlog).toEqual([]);
  });

  it('verified_by / reviewed_by 缺失 → 默认 "unknown"', async () => {
    const summary = await buildArchiveSummary({
      archivePath,
      changeId: 'missing-by',
      verifyMarker: { schema: 'forge-verify/v2', verified_at: '2026-05-21T10:00:00Z' },
      reviewMarker: { schema: 'forge-review/v2', reviewed_at: '2026-05-21T11:00:00Z' },
      deltas: [],
    });
    expect(summary.verified_by).toBe('unknown');
    expect(summary.reviewed_by).toBe('unknown');
  });

  it('archive_name = basename(archivePath)', async () => {
    const summary = await buildArchiveSummary({
      archivePath,
      changeId: 'x',
      verifyMarker: vMarker(),
      reviewMarker: rMarker(),
      deltas: [],
    });
    expect(summary.archive_name).toBe(join(archivePath).split(/[\\/]/).pop());
  });
});
