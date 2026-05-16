// templates registry 测试 — SKILL_NAMES + COMMAND_NAMES 数量与拼写
import { describe, it, expect } from 'vitest';
import { SKILL_NAMES, COMMAND_NAMES } from '../../../src/core/templates/index.js';

describe('templates registry', () => {
  // 验证 spec §2.2 表里的 12 个 skill + plan-9i writing-skills + plan-9d verifying-three-dimensions + plan-9f exploring + plan-port-discipline subagent-driven-discipline 共 16 项全到位
  it('SKILL_NAMES 含 16 个不重复 skill', () => {
    expect(SKILL_NAMES).toHaveLength(16);
    expect(new Set(SKILL_NAMES).size).toBe(16);
  });

  it('SKILL_NAMES 全量字面量与顺序匹配 spec §2.2 表 + plan-9i + plan-9d + plan-9f + plan-port-discipline', () => {
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
      'exploring', // plan-9f 新增
      'subagent-driven-discipline', // plan-port-discipline 新增
    ]);
  });

  it('COMMAND_NAMES 含 7 个不重复命令', () => {
    expect(COMMAND_NAMES).toHaveLength(7);
    expect(new Set(COMMAND_NAMES).size).toBe(7);
  });

  it('COMMAND_NAMES 含 spec §2.2 全部 6 个命令 + plan-9f explore', () => {
    expect(COMMAND_NAMES).toEqual([
      'brainstorm',
      'propose',
      'apply',
      'review',
      'verify',
      'archive',
      'explore', // plan-9f 新增
    ]);
  });
});
