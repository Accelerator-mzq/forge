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
  USING_FORGE_SKILL_NAME,
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

  it('exports templates registry + bootstrap skill name (Plan 4)', () => {
    // Plan 4 已用真 registry 替换 placeholder,bootstrap 退化为 USING_FORGE_SKILL_NAME 常量
    // plan-9i 新增 writing-skills,plan-9d 新增 verifying-three-dimensions,共 14 个 skill
    expect(SKILL_NAMES).toHaveLength(14);
    expect(COMMAND_NAMES).toHaveLength(6);
    expect(USING_FORGE_SKILL_NAME).toBe('using-forge');
  });
});
