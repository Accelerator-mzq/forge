import { describe, it, expect } from 'vitest';
import { splitLegacyClaims } from '../../../src/core/backlog/render.js';
import type { SupersedingDetail } from '../../../src/core/scope/aggregator.js';
import type { LegacyRequirement } from '../../../src/core/legacy-bridge/legacy-requirements.js';

function lr(id: string): LegacyRequirement {
  return {
    id,
    title: id,
    description: 'd',
    status: 'unimplemented',
    source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
    evidence: [],
    confidence: 'medium',
    priority: null,
    review: 'confirmed',
    notes: '',
  };
}
function claim(p: Partial<SupersedingDetail>): SupersedingDetail {
  return {
    source_change: 'legacy-requirements',
    entry_id: 'LR-0001',
    new_status: 'completed',
    rationale: 'r',
    superseded_in_change: '2026-05-01-foo',
    superseded_at: '2026-05-01',
    registry_entry_snapshot: null,
    ...p,
  };
}

describe('splitLegacyClaims', () => {
  it('合法 completed claim → 产 tombstone', () => {
    const out = splitLegacyClaims([claim({})], [lr('LR-0001')]);
    expect(out.tombstones).toHaveLength(1);
    expect(out.tombstones[0]?.entry_id).toBe('LR-0001');
    expect(out.retiredIds.has('LR-0001')).toBe(true);
  });

  it('new_status 越界 → invalid-legacy-status warning,不产 tombstone', () => {
    const out = splitLegacyClaims([claim({ new_status: 'inherited' })], [lr('LR-0001')]);
    expect(out.tombstones).toHaveLength(0);
    expect(out.warnings.some((w) => w.kind === 'invalid-legacy-status')).toBe(true);
    expect(out.retiredIds.has('LR-0001')).toBe(false);
  });

  it('entry_id 不在 yaml → dangling-legacy-claim warning', () => {
    const out = splitLegacyClaims([claim({ entry_id: 'LR-9999' })], [lr('LR-0001')]);
    expect(out.warnings.some((w) => w.kind === 'dangling-legacy-claim')).toBe(true);
  });

  it('同 entry_id 两个有效 claim → winner = 最早,duplicate warning', () => {
    const out = splitLegacyClaims(
      [
        claim({ superseded_in_change: '2026-05-02-b', superseded_at: '2026-05-02' }),
        claim({ superseded_in_change: '2026-05-01-a', superseded_at: '2026-05-01' }),
      ],
      [lr('LR-0001')],
    );
    expect(out.tombstones).toHaveLength(1);
    expect(out.tombstones[0]?.superseded_in_change).toBe('2026-05-01-a');
    expect(out.warnings.some((w) => w.kind === 'duplicate-legacy-claim')).toBe(true);
    expect(out.retiredIds.has('LR-0001')).toBe(true);
  });
});
