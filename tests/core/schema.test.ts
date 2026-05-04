import { describe, it, expect } from 'vitest';
import { DEFAULT_ARTIFACTS, DEFAULT_CODE_EXCLUDE } from '../../src/core/schema/index.js';
import type { ForgeConfig, ArtifactKind } from '../../src/core/schema/index.js';

describe('schema/types', () => {
  it('should expose DEFAULT_ARTIFACTS in correct order', () => {
    expect(DEFAULT_ARTIFACTS).toEqual(['proposal', 'specs', 'design', 'tasks']);
  });

  it('should expose DEFAULT_CODE_EXCLUDE matching spec §3.4', () => {
    // 必含的关键 exclude
    expect(DEFAULT_CODE_EXCLUDE).toContain('forge/**');
    expect(DEFAULT_CODE_EXCLUDE).toContain('**/*.md');
    expect(DEFAULT_CODE_EXCLUDE).toContain('**/.verify-passed');
    expect(DEFAULT_CODE_EXCLUDE).toContain('**/.review-passed');
    expect(DEFAULT_CODE_EXCLUDE).toContain('**/.evidence/**');
  });

  it('should accept a valid ForgeConfig type', () => {
    const config: ForgeConfig = {
      schema: 'forge-spec-driven/v1',
      context: 'TypeScript + Node',
      rules: { proposal: ['Include rollback plan'] },
      code_paths: { include: ['src/**'], exclude: ['src/generated/**'] },
    };
    expect(config.schema).toBe('forge-spec-driven/v1');
  });

  it('should accept ArtifactKind as union', () => {
    const k: ArtifactKind = 'proposal';
    expect(['proposal', 'specs', 'design', 'tasks']).toContain(k);
  });
});
