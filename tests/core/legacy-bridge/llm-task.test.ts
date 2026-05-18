// tests/core/legacy-bridge/llm-task.test.ts
import { describe, it, expect } from 'vitest';
import {
  canonicalize,
  computeManifestHash,
  buildManifest,
  verifyManifest,
} from '../../../src/core/legacy-bridge/llm-task.js';
import type { LlmTask, TaskManifest } from '../../../src/core/legacy-bridge/llm-task.js';

const sampleTask: LlmTask = {
  op: 'map',
  inputs: [{ source: 'docs/SRS.md', content: 'redacted preview' }],
  prompt: 'classify this',
  model: 'claude-sonnet-4-6',
  outputSchema: '{ classifications: [...] }',
  outputPath: 'forge/.cache/legacy-bridge-result-map.json',
};

describe('canonicalize', () => {
  it('键序无关:不同插入顺序产同一字符串', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });
});

describe('computeManifestHash + verifyManifest', () => {
  it('computeManifestHash 对同一结构产相同 hash', () => {
    const m1: Omit<TaskManifest, 'manifest_hash'> = {
      op: 'map',
      round: 1,
      tasks: [sampleTask],
      forge_version: '1.4.0',
    };
    const m2: Omit<TaskManifest, 'manifest_hash'> = {
      op: 'map',
      round: 1,
      tasks: [sampleTask],
      forge_version: '1.4.0',
    };
    expect(computeManifestHash(m1)).toBe(computeManifestHash(m2));
  });

  it('buildManifest 产物能自校验通过', () => {
    const m = buildManifest({ op: 'map', round: 1, tasks: [sampleTask], forgeVersion: '1.4.0' });
    expect(verifyManifest(m)).toEqual({ ok: true });
  });

  it('篡改 meta.gate_context 后 verifyManifest 失败', () => {
    const m = buildManifest({
      op: 'sync-check',
      round: 1,
      tasks: [sampleTask],
      forgeVersion: '1.4.0',
      meta: { gate_context: 'archive-preflight' },
    });
    const tampered = { ...m, meta: { gate_context: 'standalone' } };
    expect(verifyManifest(tampered).ok).toBe(false);
  });

  it('篡改 round 后 verifyManifest 失败', () => {
    const m = buildManifest({
      op: 'regenerate',
      round: 1,
      tasks: [sampleTask],
      forgeVersion: '1.4.0',
    });
    expect(verifyManifest({ ...m, round: 2 }).ok).toBe(false);
  });
});
