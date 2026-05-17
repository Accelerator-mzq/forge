// tests/core/legacy-bridge/sync-check-dualpath.test.ts
import { describe, it, expect } from 'vitest';
import { applySyncCheckResult } from '../../../src/core/legacy-bridge/sync-check.js';

describe('applySyncCheckResult', () => {
  it('LLM diff 数组 → SyncStateFile,带 produced_from', () => {
    const llmText = JSON.stringify([
      {
        anchor_path: 'docs/SRS.md',
        severity: 'critical',
        section: '§4.5',
        description: '幂等性变化',
      },
    ]);
    const state = applySyncCheckResult(llmText, 'add-pay', 'abc123hash');
    expect(state.change_id).toBe('add-pay');
    expect(state.produced_from).toBe('abc123hash');
    expect(state.diffs).toHaveLength(1);
    expect(state.diffs[0]!.severity).toBe('critical');
  });
});
