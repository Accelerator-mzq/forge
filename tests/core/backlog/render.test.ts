import { describe, it, expect } from 'vitest';
import { deriveWarningsAndTombstones } from '../../../src/core/backlog/render.js';
import type { SupersedingDetail, SkippedBlock } from '../../../src/core/scope/aggregator.js';
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
});
