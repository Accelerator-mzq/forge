import { describe, it, expect } from 'vitest';
import type {
  HarnessAdapter,
  HarnessId,
  DeployPlan,
} from '../../../src/core/harness-adapters/index.js';

describe('HarnessAdapter interface', () => {
  it('accepts a valid HarnessAdapter shape', () => {
    const stub: HarnessAdapter = {
      id: 'claude',
      detect: async () => ({ id: 'claude', detected: true, detectedAt: '.claude/' }),
      plan: async () => ({ files: [] }) satisfies DeployPlan,
    };
    expect(stub.id).toBe('claude');
  });

  it('HarnessId is a string union of three known harness', () => {
    const ids: HarnessId[] = ['claude', 'codex', 'opencode'];
    expect(ids).toHaveLength(3);
  });
});
