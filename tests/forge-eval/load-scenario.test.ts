import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import type { ScenarioFile } from '../../forge-eval/types.js';

// 我们直接测 validate + flatten 逻辑;loadScenarioFile 走 fs 在 integration 段测
// 这里直接 import 内部 helper 用 dynamic import 拼装临时文件

describe('forge-eval/load-scenario', () => {

  it('合法 ScenarioFile 解析成功', async () => {
    const yaml = `
skill: brainstorming
description: 测试用
model: claude-sonnet-4-6
scenarios:
  - id: test-1
    turns:
      - user: "我想做个 todo"
        judge_rubric: "AI 是否问问题"
`;
    const data = parseYaml(yaml) as ScenarioFile;
    expect(data.skill).toBe('brainstorming');
    expect(data.scenarios).toHaveLength(1);
    expect(data.scenarios[0]?.turns[0]?.judge_rubric).toBe('AI 是否问问题');
    // 补:覆盖 validateScenarioFile + flattenScenarios 而非仅 parseYaml
    const { validateScenarioFile, flattenScenarios } = await import('../../forge-eval/load-scenario.js');
    expect(() => validateScenarioFile(data, 'test')).not.toThrow();
    const scenarios = flattenScenarios(data);
    expect(scenarios[0]?.model).toBe('claude-sonnet-4-6'); // ScenarioFile 顶层 model 透传到 Scenario
    expect(scenarios[0]?.skill).toBe('brainstorming');     // 顶层 skill 注入到每个 scenario
  });

  it('judge_rubric 缺失抛错(合约违反)', async () => {
    const { validateScenarioFile } = await import('../../forge-eval/load-scenario.js');
    const bad: ScenarioFile = {
      skill: 'brainstorming',
      scenarios: [
        {
          id: 'bad-1',
          turns: [
            // @ts-expect-error 故意构造非法数据测 runtime 校验
            { user: '没 judge_rubric 的 turn' },
          ],
        },
      ],
    };
    expect(() => validateScenarioFile(bad, 'fake')).toThrow(/judge_rubric 必需/);
  });

  it('skill 字段缺失抛错', async () => {
    const { validateScenarioFile } = await import('../../forge-eval/load-scenario.js');
    // @ts-expect-error 测 runtime 校验
    const bad: ScenarioFile = { scenarios: [{ id: 'a', turns: [] }] };
    expect(() => validateScenarioFile(bad, 'fake')).toThrow(/缺 skill 字段/);
  });
});
