// smoke 测试 — 验证顶层公共 API 完整覆盖
import { describe, it, expect } from 'vitest';
import {
  FORGE_VERSION,
  DEFAULT_ARTIFACTS,
  parseMarkdown,
  parseProposal,
  validateProposal,
  computeTasksHash,
  buildGraph,
  SKILL_NAMES,
  COMMAND_NAMES,
  BOOTSTRAP_PLACEHOLDER,
} from '../src/index.js';

describe('smoke — top-level public API', () => {
  it('exports FORGE_VERSION', () => {
    expect(FORGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exports schema constants', () => {
    expect(DEFAULT_ARTIFACTS).toEqual(['proposal', 'specs', 'design', 'tasks']);
  });

  it('exports parsers', () => {
    expect(typeof parseMarkdown).toBe('function');
    expect(typeof parseProposal).toBe('function');
  });

  it('exports validators', () => {
    expect(typeof validateProposal).toBe('function');
  });

  it('exports hash computation', () => {
    expect(typeof computeTasksHash).toBe('function');
  });

  it('exports artifact-graph builder', () => {
    expect(typeof buildGraph).toBe('function');
  });

  it('exports templates registry + bootstrap placeholder (Plan 4)', () => {
    // Plan 4 已用真 registry 替换 placeholder
    expect(SKILL_NAMES).toHaveLength(12);
    expect(COMMAND_NAMES).toHaveLength(6);
    expect(BOOTSTRAP_PLACEHOLDER).toBe(true);
  });
});
