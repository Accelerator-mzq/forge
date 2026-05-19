// tests/integration/tier23-bridge-structure.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const R = process.cwd();
const STAGES: Array<[string, string]> = [
  ['skills/writing-plans/SKILL.md', 'commands/propose.md'],
  ['skills/subagent-driven-development/SKILL.md', 'commands/apply.md'],
  ['skills/requesting-code-review/SKILL.md', 'commands/review.md'],
  ['skills/verification-before-completion/SKILL.md', 'commands/verify.md'],
  ['skills/finishing-a-development-branch/SKILL.md', 'commands/archive.md'],
];

describe('Tier 2/3 桥接结构', () => {
  it('_shared/tier23-command-bridge.md 存在且含替换规则', () => {
    const p = join(R, 'skills/_shared/tier23-command-bridge.md');
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, 'utf8')).toContain('forge executable token');
  });

  it.each(STAGES)('%s 含 Tier 2/3 Orchestration 段且指向 %s', (skill, cmd) => {
    const txt = readFileSync(join(R, skill), 'utf8');
    expect(txt).toContain('Tier 2/3 Orchestration');
    expect(txt).toContain(cmd);
  });

  it('verification-before-completion 不再含假 claim', () => {
    expect(
      readFileSync(join(R, 'skills/verification-before-completion/SKILL.md'), 'utf8'),
    ).not.toContain('forge CLI 自动写');
  });
});
