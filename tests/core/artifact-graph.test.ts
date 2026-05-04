import { describe, it, expect } from 'vitest';
import { buildGraph, findNextArtifact } from '../../src/core/artifact-graph/index.js';

describe('artifact-graph', () => {
  it('builds linear graph proposal → specs → design → tasks', () => {
    const g = buildGraph({
      proposal: { exists: true, valid: true },
      specs: { exists: true, valid: true },
      design: { exists: true, valid: true },
      tasks: { exists: true, valid: true },
    });
    expect(g.nodes).toHaveLength(4);
    expect(g.edges).toEqual([
      { from: 'proposal', to: 'specs' },
      { from: 'specs', to: 'design' },
      { from: 'design', to: 'tasks' },
    ]);
  });

  it('findNextArtifact returns null when all valid', () => {
    const g = buildGraph({
      proposal: { exists: true, valid: true },
      specs: { exists: true, valid: true },
      design: { exists: true, valid: true },
      tasks: { exists: true, valid: true },
    });
    expect(findNextArtifact(g)).toBeNull();
  });

  it('findNextArtifact returns first invalid artifact', () => {
    const g = buildGraph({
      proposal: { exists: true, valid: true },
      specs: { exists: true, valid: false },
      design: { exists: true, valid: true },
      tasks: { exists: false, valid: false },
    });
    expect(findNextArtifact(g)).toBe('specs');
  });
});
