import { describe, it, expect } from 'vitest';
import { loadSkillBootstrap, SKILL_NAMES } from '../../forge-eval/load-skill.js';

describe('forge-eval/load-skill', () => {
  it('loadSkillBootstrap 返回非空内容(每个 skill)', async () => {
    for (const name of SKILL_NAMES) {
      const content = await loadSkillBootstrap(name);
      expect(content.length).toBeGreaterThan(100);
      expect(content).toContain(`name: forge:${name}`);
    }
  });
});
