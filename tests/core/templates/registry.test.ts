// templates registry 测试 — SKILL_NAMES + COMMAND_NAMES 数量与拼写
import { describe, it, expect } from 'vitest';
import { SKILL_NAMES } from '../../../src/core/templates/skills/index.js';
import { COMMAND_NAMES } from '../../../src/core/templates/commands/index.js';

describe('templates registry', () => {
  // 验证 spec §2.2 表里的 12 个 skill 全到位
  it('SKILL_NAMES 含 12 个不重复 skill', () => {
    expect(SKILL_NAMES).toHaveLength(12);
    expect(new Set(SKILL_NAMES).size).toBe(12);
  });

  // 验证关键 skill 名无拼写漂移(Plan 5 eval scenarios.yaml 文件名要对得上)
  it('SKILL_NAMES 含核心几个 skill 字面量', () => {
    expect(SKILL_NAMES).toContain('using-forge');
    expect(SKILL_NAMES).toContain('brainstorming');
    expect(SKILL_NAMES).toContain('writing-plans');
    expect(SKILL_NAMES).toContain('test-driven-development');
    expect(SKILL_NAMES).toContain('verification-before-completion');
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
