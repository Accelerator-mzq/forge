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

  it('LLM 输出非合法 JSON → 1 条 info diff(不静默漏报)', () => {
    const state = applySyncCheckResult('not json at all', 'add-pay', 'h');
    expect(state.diffs).toHaveLength(1);
    expect(state.diffs[0]!.severity).toBe('info');
    expect(state.produced_from).toBe('h');
  });

  it('LLM 输出合法 JSON 但非数组(对象) → 1 条 info diff(不静默漏报)', () => {
    const state = applySyncCheckResult(JSON.stringify({ unexpected: true }), 'add-pay', 'h');
    expect(state.diffs).toHaveLength(1);
    expect(state.diffs[0]!.severity).toBe('info');
  });

  it('LLM 输出空数组 → diffs 为空,produced_from 仍保存', () => {
    const state = applySyncCheckResult('[]', 'add-pay', 'h2');
    expect(state.diffs).toHaveLength(0);
    expect(state.produced_from).toBe('h2');
  });
});
