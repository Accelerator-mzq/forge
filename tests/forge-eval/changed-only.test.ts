// changed-only 单测 — git diff 解析正则校验
// 注:实际 git diff 调用走 spawnSync 不易 mock,这里只测 regex 匹配函数
// 真集成走 integration test
import { describe, it, expect } from 'vitest';
import { SKILL_NAMES } from '../../forge-eval/load-skill.js';

// 把 changed-only.ts 的两个内部函数改为 export(用于单测)— 需在 changed-only.ts 调整
// 改动:matchSkillTemplate / matchScenarioFile 都加 export

describe('forge-eval/changed-only regex', () => {
  it('skill template 路径匹配', async () => {
    const m = await import('../../forge-eval/changed-only.js');
    // matchSkillTemplate / matchScenarioFile 已 export
    expect(m.matchSkillTemplate?.('src/core/templates/skills/brainstorming.md')).toBe('brainstorming');
    expect(m.matchSkillTemplate?.('src/core/templates/skills/unknown.md')).toBeNull();
    expect(m.matchSkillTemplate?.('src/cli/index.ts')).toBeNull();
  });

  it('scenario 文件路径匹配', async () => {
    const m = await import('../../forge-eval/changed-only.js');
    expect(m.matchScenarioFile?.('forge-eval/scenarios/brainstorming.yaml')).toBe('brainstorming');
    expect(m.matchScenarioFile?.('forge-eval/scenarios/unknown.yaml')).toBeNull();
    expect(m.matchScenarioFile?.('forge-eval/runner.ts')).toBeNull();
  });

  it('SKILL_NAMES 12 个 skill 全部能匹配 template 路径', async () => {
    const m = await import('../../forge-eval/changed-only.js');
    for (const name of SKILL_NAMES) {
      expect(m.matchSkillTemplate?.(`src/core/templates/skills/${name}.md`)).toBe(name);
    }
  });
});
