// recover-prompt 单测 — 用 customPrompt 注入避免真 stdin 交互
import { describe, it, expect } from 'vitest';
import { promptRecoverChoice } from '../../../src/core/archive/recover-prompt.js';

describe('forge-recover/promptRecoverChoice', () => {
  it('注入 customPrompt 返回 complete-archive', async () => {
    const r = await promptRecoverChoice(async () => 'complete-archive');
    expect(r).toBe('complete-archive');
  });

  it('注入 customPrompt 返回 undo-archive', async () => {
    const r = await promptRecoverChoice(async () => 'undo-archive');
    expect(r).toBe('undo-archive');
  });
});
