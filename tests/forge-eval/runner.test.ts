import { describe, it, expect } from 'vitest';
import { runScenario } from '../../forge-eval/runner.js';
import type { Scenario } from '../../forge-eval/types.js';
import type Anthropic from '@anthropic-ai/sdk';

/** 简化 mock:每次 messages.create 返回固定文本响应 + 模拟 usage */
function makeMockClient(responseText: string, judgeText = '8\n好'): Anthropic {
  let callCount = 0;
  return {
    messages: {
      create: async () => {
        callCount += 1;
        // 奇数次调用:主模型响应;偶数次调用:judge 响应
        const text = callCount % 2 === 1 ? responseText : judgeText;
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      },
    },
  } as unknown as Anthropic;
}

// 基础测试用 scenario fixture
const scenarioFixture: Scenario = {
  skill: 'brainstorming',
  id: 'fixture-1',
  model: 'claude-sonnet-4-6',
  turns: [
    {
      user: '我想做个 todo 应用,大概用 React?',
      assertions: { must_match: [{ regex: '(确认|问)' }] },
      judge_rubric: 'AI 是否拒绝直接写代码、坚持先理清?',
    },
  ],
};

describe('forge-eval/runner.runScenario', () => {
  it('多 turn assistant 响应被累积到 messages(turn 数 = turnResults 数)', async () => {
    const multiTurn: Scenario = {
      ...scenarioFixture,
      turns: [
        { user: 'turn 1', judge_rubric: 'r1' },
        { user: 'turn 2', judge_rubric: 'r2' },
      ],
    };
    const mock = makeMockClient('我先确认下需求');
    const r = await runScenario(multiTurn, false, mock);
    expect(r.turnResults).toHaveLength(2);
  });

  it('RED 跑(withSkill=false)scenarioPass 反映 turnResults', async () => {
    const mock = makeMockClient('我先确认下需求');
    const r = await runScenario(scenarioFixture, false, mock);
    expect(r.withSkill).toBe(false);
    expect(r.turnResults).toHaveLength(1);
    expect(r.turnResults[0]?.patternResult.pass).toBe(true);
    expect(r.turnResults[0]?.judgeResult.score).toBe(8);
    expect(r.turnResults[0]?.turnPass).toBe(true);
    expect(r.scenarioPass).toBe(true);
  });

  it('GREEN 跑(withSkill=true)依然走通(mock 不感知 system 内容)', async () => {
    const mock = makeMockClient('我先确认下需求');
    const r = await runScenario(scenarioFixture, true, mock);
    expect(r.withSkill).toBe(true);
    expect(r.scenarioPass).toBe(true);
  });

  it('assertions 失败(must_match 未命中)→ turnPass=false', async () => {
    const mock = makeMockClient('好的我直接写');
    const r = await runScenario(scenarioFixture, false, mock);
    expect(r.turnResults[0]?.patternResult.pass).toBe(false);
    expect(r.turnResults[0]?.turnPass).toBe(false);
    expect(r.scenarioPass).toBe(false);
  });

  it('judge 评分 < 6 → turnPass=false', async () => {
    const mock = makeMockClient('我先确认下需求', '3\n太弱');
    const r = await runScenario(scenarioFixture, false, mock);
    expect(r.turnResults[0]?.patternResult.pass).toBe(true);
    expect(r.turnResults[0]?.judgeResult.score).toBe(3);
    expect(r.turnResults[0]?.turnPass).toBe(false);
    expect(r.scenarioPass).toBe(false);
  });

  it('totalTokens / estimatedCost 累加', async () => {
    const mock = makeMockClient('响应');
    const r = await runScenario(scenarioFixture, false, mock);
    expect(r.totalTokens).toBeGreaterThan(0);
    expect(r.estimatedCost).toBeGreaterThan(0);
  });
});
