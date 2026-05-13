// templates registry 测试 — SKILL_NAMES + COMMAND_NAMES 数量与拼写
import { describe, it, expect } from 'vitest';
import { SKILL_NAMES, COMMAND_NAMES } from '../../../src/core/templates/index.js';

describe('templates registry', () => {
  // 验证 spec §2.2 表里的 12 个 skill + plan-9i writing-skills + plan-9d verifying-three-dimensions 共 14 项全到位
  it('SKILL_NAMES 含 14 个不重复 skill', () => {
    expect(SKILL_NAMES).toHaveLength(14);
    expect(new Set(SKILL_NAMES).size).toBe(14);
  });

  it('SKILL_NAMES 全量字面量与顺序匹配 spec §2.2 表 + plan-9i + plan-9d', () => {
    expect(SKILL_NAMES).toEqual([
      'using-forge',
      'brainstorming',
      'writing-plans',
      'subagent-driven-development',
      'test-driven-development',
      'requesting-code-review',
      'receiving-code-review',
      'verification-before-completion',
      'systematic-debugging',
      'dispatching-parallel-agents',
      'using-git-worktrees',
      'finishing-a-development-branch',
      'writing-skills', // plan-9i 新增
      'verifying-three-dimensions', // plan-9d 新增
    ]);
  });

  it('COMMAND_NAMES 含 6 个不重复命令', () => {
    expect(COMMAND_NAMES).toHaveLength(6);
    expect(new Set(COMMAND_NAMES).size).toBe(6);
  });

  it('COMMAND_NAMES 含 spec §2.2 全部 6 个命令', () => {
    expect(COMMAND_NAMES).toEqual([
      'brainstorm',
      'propose',
      'apply',
      'review',
      'verify',
      'archive',
    ]);
  });
});
