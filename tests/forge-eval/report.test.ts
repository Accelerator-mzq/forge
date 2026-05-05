import { describe, it, expect } from 'vitest';
import { buildMarkdownReport } from '../../forge-eval/report.js';
import type { RunSummary, ScenarioRunResult } from '../../forge-eval/types.js';

/** 构造 ScenarioRunResult fixture */
function makeRun(scores: number[], pass: boolean, withSkill: boolean): ScenarioRunResult {
  return {
    scenarioId: 'fx-1',
    skill: 'brainstorming',
    withSkill,
    turnResults: scores.map((s, i) => ({
      turnId: `turn-${i}`,
      userMessage: 'x',
      assistantResponse: 'y',
      patternResult: { pass: true, skipped: true, failures: [] },
      judgeResult: { score: s, reasoning: 'ok' },
      turnPass: s >= 6,
      tokensUsed: 100,
    })),
    scenarioPass: pass,
    totalTokens: 100,
    estimatedCost: 0.01,
  };
}

describe('forge-eval/report.buildMarkdownReport', () => {
  it('全 pass 报告含 ✅ 整体结果', () => {
    // 注意:使用 totalEstimatedCost(M-1 修复后字段名,与 types.ts 一致)
    const summary: RunSummary = {
      timestamp: '2026-05-05T10:00:00Z',
      skillsRun: ['brainstorming'],
      pairs: [
        {
          scenarioId: 'fx-1',
          skill: 'brainstorming',
          red: makeRun([3], false, false),
          green: makeRun([8], true, true),
          delta: 5,
          pairPass: true,
        },
      ],
      totalApiCalls: 4,
      totalTokens: 200,
      totalEstimatedCost: 0.02,
      runPass: true,
    };
    const md = buildMarkdownReport(summary);
    expect(md).toContain('✅ PASS');
    expect(md).toContain('| brainstorming | fx-1 |');
    expect(md).toContain('## 总览');
    expect(md).not.toContain('## 失败详情');
  });

  it('有失败 pair 时含 ## 失败详情段', () => {
    const summary: RunSummary = {
      timestamp: '2026-05-05T10:00:00Z',
      skillsRun: ['brainstorming'],
      pairs: [
        {
          scenarioId: 'fx-1',
          skill: 'brainstorming',
          red: makeRun([5], false, false),
          green: makeRun([5], false, true),
          delta: 0,
          pairPass: false,
        },
      ],
      totalApiCalls: 4,
      totalTokens: 200,
      totalEstimatedCost: 0.02,
      runPass: false,
    };
    const md = buildMarkdownReport(summary);
    expect(md).toContain('❌ FAIL');
    expect(md).toContain('## 失败详情');
    expect(md).toContain('### brainstorming / fx-1');
  });

  it('cost 用 4 位小数格式', () => {
    const summary: RunSummary = {
      timestamp: '2026-05-05T10:00:00Z',
      skillsRun: [],
      pairs: [],
      totalApiCalls: 0,
      totalTokens: 0,
      totalEstimatedCost: 1.234567,
      runPass: true,
    };
    const md = buildMarkdownReport(summary);
    expect(md).toContain('$1.2346');
  });
});
