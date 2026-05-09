import { describe, it, expect } from 'vitest';
import {
  stratifiedSample,
  parseFactJudgeResponse,
  judgeAllFacts,
  formatQualityReport,
  DEFAULT_FIDELITY_THRESHOLD,
  type JudgeClient,
} from '../../../src/core/legacy-bridge/quality-judge.js';
import type { KeyFact } from '../../../src/core/legacy-bridge/types.js';

function makeMockJudge(state: 'preserved' | 'paraphrased' | 'lost', reason = 'r'): JudgeClient {
  return {
    messages: {
      create: async () =>
        ({
          content: [{ type: 'text', text: `${state}\n${reason}` }],
        }) as never,
    },
  };
}

function makeRoundRobinJudge(states: Array<'preserved' | 'paraphrased' | 'lost'>): JudgeClient {
  let idx = 0;
  return {
    messages: {
      create: async () => {
        const state = states[idx % states.length];
        idx += 1;
        return {
          content: [{ type: 'text', text: `${state}\nr` }],
        } as never;
      },
    },
  };
}

describe('legacy-bridge/quality-judge.stratifiedSample', () => {
  const facts: KeyFact[] = [
    { text: 'critical-1', section: '§4.5', critical: true },
    { text: 'critical-2', section: '§3.1', critical: true },
    { text: 'nc-1', section: '§4.5', critical: false },
    { text: 'nc-2', section: '§4.5', critical: false },
    { text: 'nc-3', section: '§3.1', critical: false },
    { text: 'nc-4', section: '§5.0', critical: false },
  ];

  it('critical 全量必抽 + 至少 1 条 / 章', () => {
    const r = stratifiedSample({ allFacts: facts, total: 30 });
    expect(r.sampled.length).toBeGreaterThanOrEqual(5);
    expect(r.sampled.filter((f) => f.critical)).toHaveLength(2);
  });

  it('total 比 critical 数量小 → 仅返回 critical(决策 #16:critical 优先)', () => {
    const r = stratifiedSample({ allFacts: facts, total: 1 });
    expect(r.sampled).toHaveLength(2);
  });

  it('uncoveredSections 仅在确实没抽到时填', () => {
    const r = stratifiedSample({ allFacts: facts, total: 30 });
    expect(r.uncoveredSections).toEqual([]);
  });

  it('单章节多 fact + 总数限制 → 该章节多抽几条(防统计骗术)', () => {
    const big: KeyFact[] = Array.from({ length: 20 }, (_, i) => ({
      text: `nc-big-${i}`,
      section: '§big',
      critical: false,
    }));
    const small: KeyFact[] = Array.from({ length: 4 }, (_, i) => ({
      text: `nc-small-${i}`,
      section: '§small',
      critical: false,
    }));
    const r = stratifiedSample({ allFacts: [...big, ...small], total: 12 });
    const bigSampled = r.sampled.filter((f) => f.section === '§big').length;
    const smallSampled = r.sampled.filter((f) => f.section === '§small').length;
    expect(bigSampled).toBeGreaterThan(smallSampled);
    expect(smallSampled).toBeGreaterThanOrEqual(1);
  });
});

describe('legacy-bridge/quality-judge.parseFactJudgeResponse', () => {
  const fact: KeyFact = { text: 't', section: 's', critical: false };

  it('preserved / paraphrased / lost 三态各自解析', () => {
    expect(parseFactJudgeResponse('preserved\n理由', fact).state).toBe('preserved');
    expect(parseFactJudgeResponse('paraphrased', fact).state).toBe('paraphrased');
    expect(parseFactJudgeResponse('lost\n没找到', fact).state).toBe('lost');
  });

  it('解析失败 → 保守 lost(决策 #16 不 retry)', () => {
    expect(parseFactJudgeResponse('random text', fact).state).toBe('lost');
  });

  it('reasoning 多行保留', () => {
    const r = parseFactJudgeResponse('preserved\n第一行\n第二行', fact);
    expect(r.reasoning).toBe('第一行\n第二行');
  });
});

describe('legacy-bridge/quality-judge.judgeAllFacts', () => {
  it('全 preserved → critical_rate=1, total_rate=1, passed', async () => {
    const facts: KeyFact[] = [
      { text: 'c-1', section: '§4', critical: true },
      { text: 'nc-1', section: '§4', critical: false },
      { text: 'nc-2', section: '§5', critical: false },
    ];
    const sampling = stratifiedSample({ allFacts: facts });
    const result = await judgeAllFacts(makeMockJudge('preserved'), 'body', sampling);
    expect(result.passed).toBe(true);
    expect(result.critical_rate).toBe(1.0);
    expect(result.total_rate).toBe(1.0);
    expect(result.lost_critical).toEqual([]);
  });

  it('critical 任一 lost → passed=false(无关 90% 阈值)', async () => {
    const facts: KeyFact[] = [
      { text: 'c-1', section: '§4', critical: true },
      { text: 'nc-1', section: '§4', critical: false },
    ];
    const sampling = stratifiedSample({ allFacts: facts });
    const result = await judgeAllFacts(
      makeRoundRobinJudge(['lost', 'preserved']),
      'body',
      sampling,
    );
    expect(result.passed).toBe(false);
    expect(result.critical_rate).toBeLessThan(1.0);
    expect(result.lost_critical.length).toBeGreaterThan(0);
  });

  it('total_rate 低于阈值 → passed=false', async () => {
    const facts: KeyFact[] = Array.from({ length: 10 }, (_, i) => ({
      text: `nc-${i}`,
      section: i < 5 ? '§a' : '§b',
      critical: false,
    }));
    const sampling = stratifiedSample({ allFacts: facts });
    const result = await judgeAllFacts(
      makeRoundRobinJudge(['preserved', 'lost', 'lost', 'lost', 'lost']),
      'body',
      sampling,
      0.9,
    );
    expect(result.passed).toBe(false);
    expect(result.total_rate).toBeLessThan(0.9);
  });

  it('per_section_rates 防统计骗术(某章 0% 仍单独可见)', async () => {
    const facts: KeyFact[] = [
      { text: 'a-1', section: '§a', critical: false },
      { text: 'b-1', section: '§b', critical: false },
      { text: 'b-2', section: '§b', critical: false },
    ];
    const sampling = stratifiedSample({ allFacts: facts });
    const client: JudgeClient = {
      messages: {
        create: async (args) => {
          const userPrompt = args.messages[0]!.content as string;
          const isB = userPrompt.includes('§b');
          return {
            content: [{ type: 'text', text: `${isB ? 'lost' : 'preserved'}\nr` }],
          } as never;
        },
      },
    };
    const r = await judgeAllFacts(client, 'body', sampling);
    expect(r.per_section_rates['§a']).toBe(1.0);
    expect(r.per_section_rates['§b']).toBe(0.0);
  });
});

describe('legacy-bridge/quality-judge.formatQualityReport', () => {
  it('passed 报告含百分比', () => {
    const result = {
      total_rate: 0.95,
      critical_rate: 1.0,
      per_section_rates: { '§4': 1.0 },
      lost_critical: [],
      lost_non_critical: [],
      uncovered_sections: [],
      passed: true,
    };
    const out = formatQualityReport('requirements', result);
    expect(out).toContain('95.0%');
    expect(out).toContain('100.0%');
    expect(out).not.toContain('失败处理');
  });

  it('未通过报告含失败处理段', () => {
    const result = {
      total_rate: 0.7,
      critical_rate: 0.5,
      per_section_rates: {},
      lost_critical: [{ text: 'critical fact lost', section: '§4', critical: true }],
      lost_non_critical: [],
      uncovered_sections: ['§7'],
      passed: false,
    };
    const out = formatQualityReport('requirements', result);
    expect(out).toContain('失败处理');
    expect(out).toContain('接受 .partial');
    expect(out).toContain('critical fact lost');
    expect(out).toContain('§7');
  });
});

describe('legacy-bridge/quality-judge.constants', () => {
  it('DEFAULT_FIDELITY_THRESHOLD = 0.9(决策 #16)', () => {
    expect(DEFAULT_FIDELITY_THRESHOLD).toBe(0.9);
  });
});
