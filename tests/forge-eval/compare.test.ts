import { describe, it, expect } from 'vitest';
import { compareScenarioPair, DEFAULT_DELTA_THRESHOLD } from '../../forge-eval/compare.js';
import type { Scenario, ScenarioRunResult } from '../../forge-eval/types.js';

// 基础 scenario fixture
const scenarioFixture: Scenario = {
  skill: 'brainstorming',
  id: 'fixture-1',
  turns: [{ user: 'x', judge_rubric: 'r' }],
};

/** 构造 ScenarioRunResult fixture,指定 judge scores 数组 + scenarioPass */
function makeRun(scores: number[], scenarioPass: boolean, withSkill: boolean): ScenarioRunResult {
  return {
    scenarioId: 'fixture-1',
    skill: 'brainstorming',
    withSkill,
    turnResults: scores.map((s, i) => ({
      turnId: `turn-${i}`,
      userMessage: 'x',
      assistantResponse: 'y',
      patternResult: { pass: true, skipped: true, failures: [] },
      judgeResult: { score: s, reasoning: '' },
      turnPass: s >= 6,
      tokensUsed: 100,
    })),
    scenarioPass,
    totalTokens: 100,
    estimatedCost: 0.01,
  };
}

describe('forge-eval/compare.compareScenarioPair', () => {
  it('GREEN avg 8 - RED avg 4 = delta 4(≥ 1.5)+ green pass → pair pass', () => {
    const red = makeRun([4], false, false);
    const green = makeRun([8], true, true);
    const pair = compareScenarioPair(scenarioFixture, red, green);
    expect(pair.delta).toBe(4);
    expect(pair.pairPass).toBe(true);
  });

  it('delta < threshold(green 6 vs red 5,delta=1)→ pair fail', () => {
    const red = makeRun([5], false, false);
    const green = makeRun([6], true, true);
    const pair = compareScenarioPair(scenarioFixture, red, green);
    expect(pair.delta).toBe(1);
    expect(pair.pairPass).toBe(false);
  });

  it('green scenario fail(任一 turn fail)→ 即使 delta 高也 pair fail', () => {
    const red = makeRun([3], false, false);
    const green = makeRun([8], false, true); // scenarioPass=false
    const pair = compareScenarioPair(scenarioFixture, red, green);
    expect(pair.delta).toBe(5);
    expect(pair.pairPass).toBe(false);
  });

  it('多 turn 取平均', () => {
    const red = makeRun([3, 4, 5], false, false); // avg 4
    const green = makeRun([8, 7, 9], true, true); // avg 8
    const pair = compareScenarioPair(scenarioFixture, red, green);
    expect(pair.delta).toBe(4);
  });

  it('自定义 threshold 覆盖默认', () => {
    const red = makeRun([4], false, false);
    const green = makeRun([5], true, true);
    const tightPair = compareScenarioPair(scenarioFixture, red, green, 2.0);
    expect(tightPair.pairPass).toBe(false); // delta 1 < 2
    const loosePair = compareScenarioPair(scenarioFixture, red, green, 0.5);
    expect(loosePair.pairPass).toBe(true); // delta 1 >= 0.5
  });

  it('DEFAULT_DELTA_THRESHOLD = 1.5', () => {
    expect(DEFAULT_DELTA_THRESHOLD).toBe(1.5);
  });
});
