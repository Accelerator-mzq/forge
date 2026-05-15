import { describe, it, expect } from 'vitest';
import {
  deriveWarningsAndTombstones,
  renderActiveMarkdown,
  renderArchivedMarkdown,
} from '../../../src/core/backlog/render.js';
import type { SupersedingDetail, SkippedBlock, AggregatedScopeEntry } from '../../../src/core/scope/aggregator.js';
import type { ScopeEntry } from '../../../src/core/schemas/scope-entries.js';

const snap: ScopeEntry = {
  id: 'foo', category: 'out-of-scope', description: 'd', reason: 'r',
  priority: null, status: 'active', triggered_by: null, related_change: null,
};
function sup(p: Partial<SupersedingDetail>): SupersedingDetail {
  return {
    source_change: '2026-05-01-a', entry_id: 'foo', new_status: 'completed',
    rationale: 'done', superseded_in_change: '2026-05-09-b', superseded_at: '2026-05-09',
    registry_entry_snapshot: snap, ...p,
  };
}

describe('deriveWarningsAndTombstones (plan-backlog-registry Task 2)', () => {
  it('snapshot=null → dangling-reference warning,不出 tombstone', () => {
    const r = deriveWarningsAndTombstones([sup({ registry_entry_snapshot: null })], []);
    expect(r.tombstones).toHaveLength(0);
    expect(r.warnings).toEqual([
      { kind: 'dangling-reference', superseded_in_change: '2026-05-09-b', source_change: '2026-05-01-a', entry_id: 'foo' },
    ]);
  });

  it('new_status 非法 → invalid-new-status warning(带 raw),不出 tombstone', () => {
    const r = deriveWarningsAndTombstones([sup({ new_status: 'active' })], []);
    expect(r.tombstones).toHaveLength(0);
    expect(r.warnings[0]).toMatchObject({ kind: 'invalid-new-status', raw: 'active' });
  });

  it('重复认领 → 取 superseded_at 最早为 winner,其余进 duplicate-claim warning', () => {
    const r = deriveWarningsAndTombstones(
      [
        sup({ superseded_in_change: '2026-05-09-b', superseded_at: '2026-05-09' }),
        sup({ superseded_in_change: '2026-05-03-c', superseded_at: '2026-05-03' }),
      ],
      [],
    );
    expect(r.tombstones).toHaveLength(1);
    // noUncheckedIndexedAccess:用 ! 断言保证 TS 编译通过
    expect(r.tombstones[0]!.superseded_in_change).toBe('2026-05-03-c');
    expect(r.warnings).toEqual([
      {
        kind: 'duplicate-claim', source_change: '2026-05-01-a', entry_id: 'foo',
        claimants: [
          { superseded_in_change: '2026-05-09-b', superseded_at: '2026-05-09' },
          { superseded_in_change: '2026-05-03-c', superseded_at: '2026-05-03' },
        ],
        winner_superseded_in_change: '2026-05-03-c',
      },
    ]);
  });

  it("superseded_at='unknown' → malformed-dirname warning,且排序中算最晚", () => {
    const r = deriveWarningsAndTombstones(
      [
        sup({ superseded_in_change: 'legacy-x', superseded_at: 'unknown' }),
        sup({ superseded_in_change: '2026-05-09-b', superseded_at: '2026-05-09' }),
      ],
      [],
    );
    // noUncheckedIndexedAccess:用 ! 断言保证 TS 编译通过
    expect(r.tombstones[0]!.superseded_in_change).toBe('2026-05-09-b');
    expect(r.warnings).toContainEqual({ kind: 'malformed-dirname', superseded_in_change: 'legacy-x' });
  });

  it('skipped block → skipped-block warning', () => {
    const sk: SkippedBlock = { change: '2026-05-01-a', file: 'proposal.md', reason: 'yaml-parse-error' };
    const r = deriveWarningsAndTombstones([], [sk]);
    expect(r.warnings).toEqual([
      { kind: 'skipped-block', change: '2026-05-01-a', file: 'proposal.md', reason: 'yaml-parse-error' },
    ]);
  });

  // 边界:同组两条 claim 都 snapshot=null → 两条都被剔为 dangling,不进分组,无 tombstone
  it('同组两条 claim 都 snapshot=null → tombstones 空、2 条 dangling-reference', () => {
    const r = deriveWarningsAndTombstones(
      [
        sup({ superseded_in_change: '2026-05-09-b', registry_entry_snapshot: null }),
        sup({ superseded_in_change: '2026-05-03-c', registry_entry_snapshot: null }),
      ],
      [],
    );
    expect(r.tombstones).toHaveLength(0);
    expect(r.warnings).toEqual([
      { kind: 'dangling-reference', superseded_in_change: '2026-05-09-b', source_change: '2026-05-01-a', entry_id: 'foo' },
      { kind: 'dangling-reference', superseded_in_change: '2026-05-03-c', source_change: '2026-05-01-a', entry_id: 'foo' },
    ]);
  });

  // 边界:new_status 非法 + superseded_at=unknown 同时命中 → invalid-new-status 与 malformed-dirname 正交各报一条
  it('new_status 非法 + superseded_at=unknown → invalid-new-status + malformed-dirname 各 1 条', () => {
    const r = deriveWarningsAndTombstones(
      [sup({ superseded_in_change: 'legacy-x', new_status: 'active', superseded_at: 'unknown' })],
      [],
    );
    expect(r.tombstones).toHaveLength(0);
    expect(r.warnings).toContainEqual({
      kind: 'invalid-new-status', superseded_in_change: 'legacy-x', source_change: '2026-05-01-a', entry_id: 'foo', raw: 'active',
    });
    expect(r.warnings).toContainEqual({ kind: 'malformed-dirname', superseded_in_change: 'legacy-x' });
  });

  // 边界:snapshot=null + superseded_at=unknown 同时命中 → dangling-reference 与 malformed-dirname 正交各报一条
  it('snapshot=null + superseded_at=unknown → dangling-reference + malformed-dirname 各 1 条', () => {
    const r = deriveWarningsAndTombstones(
      [sup({ superseded_in_change: 'legacy-x', registry_entry_snapshot: null, superseded_at: 'unknown' })],
      [],
    );
    expect(r.tombstones).toHaveLength(0);
    expect(r.warnings).toContainEqual({
      kind: 'dangling-reference', superseded_in_change: 'legacy-x', source_change: '2026-05-01-a', entry_id: 'foo',
    });
    expect(r.warnings).toContainEqual({ kind: 'malformed-dirname', superseded_in_change: 'legacy-x' });
  });
});

function entry(p: Partial<AggregatedScopeEntry>): AggregatedScopeEntry {
  return {
    id: 'e', category: 'future-work', description: 'desc', reason: 'rsn',
    priority: null, status: 'active', triggered_by: null, related_change: null,
    source_change: '2026-05-01-a', ...p,
  };
}

describe('renderActiveMarkdown (plan-backlog-registry Task 3)', () => {
  it('无 entry 无 warning:待办计 0、Warnings (0) 渲染 (无)', () => {
    const md = renderActiveMarkdown([], []);
    expect(md).toContain('待办计 0 项');
    expect(md).toContain('## Warnings (0)');
    expect(md).toContain('(无)');
  });

  it('future-work + out-of-scope 计入待办数,non-goal 不计入', () => {
    const md = renderActiveMarkdown(
      [
        entry({ id: 'fw', category: 'future-work' }),
        entry({ id: 'oos', category: 'out-of-scope' }),
        entry({ id: 'ng', category: 'non-goal' }),
      ],
      [],
    );
    expect(md).toContain('待办计 2 项');
    expect(md).toContain('## Future Work (1)');
    expect(md).toContain('## Out of Scope (1)');
    expect(md).toContain('## Non-Goals (1)');
    expect(md).toContain('### `2026-05-01-a::fw`');
  });

  it('warning 渲染进 ## Warnings 段', () => {
    const md = renderActiveMarkdown([], [
      { kind: 'dangling-reference', superseded_in_change: '2026-05-09-b', source_change: '2026-05-01-a', entry_id: 'foo' },
    ]);
    expect(md).toContain('## Warnings (1)');
    expect(md).toContain('[dangling] 2026-05-09-b 认领的 2026-05-01-a::foo 不存在');
  });
});

describe('renderArchivedMarkdown (plan-backlog-registry Task 4)', () => {
  it('无 tombstone:渲染标题 + (无)', () => {
    const md = renderArchivedMarkdown([]);
    expect(md).toContain('# Archived Backlog (Tombstones)');
    expect(md).toContain('(无)');
  });

  it('单 tombstone:复合键标题 + 5 字段', () => {
    const md = renderArchivedMarkdown([sup({ new_status: 'completed' })]);
    expect(md).toContain('### `2026-05-01-a::foo`');
    expect(md).toContain('- **superseded_in_change**: 2026-05-09-b');
    expect(md).toContain('- **superseded_at**: 2026-05-09');
    expect(md).toContain('- **new_status**: completed');
    expect(md).toContain('- **cancellation_reason**: done');
    expect(md).toContain('"id":"foo"');
  });
});
