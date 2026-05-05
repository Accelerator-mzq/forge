import { describe, it, expect } from 'vitest';
import { checkPatterns, judgeWithLlm, parseJudgeResponse } from '../../forge-eval/judge.js';

describe('forge-eval/judge.checkPatterns', () => {
  it('assertions 缺失 → skipped=true, pass=true', () => {
    const r = checkPatterns('任意响应');
    expect(r.skipped).toBe(true);
    expect(r.pass).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it('assertions 两数组都空 → skipped=true', () => {
    const r = checkPatterns('任意响应', { must_match: [], must_not_match: [] });
    expect(r.skipped).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('must_match 命中 → pass', () => {
    const r = checkPatterns('AI:我先确认一下需求', {
      must_match: [{ regex: '(确认|澄清|问)' }],
    });
    expect(r.pass).toBe(true);
    expect(r.skipped).toBe(false);
  });

  it('must_match 未命中 → fail + failures 非空', () => {
    const r = checkPatterns('AI:好的我直接写代码', {
      must_match: [{ regex: '(确认|澄清|问)' }],
    });
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toContain('must_match 未命中');
  });

  it('must_not_match 命中 → fail', () => {
    const r = checkPatterns('```jsx\nconst Todo = () => {}\n```', {
      must_not_match: [{ regex: '```(jsx|tsx)' }],
    });
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toContain('must_not_match 命中');
  });

  it('must_match + must_not_match 同时配置都过 → pass', () => {
    const r = checkPatterns('AI:我有几个问题想先确认', {
      must_match: [{ regex: '问题' }],
      must_not_match: [{ regex: '```' }],
    });
    expect(r.pass).toBe(true);
  });
});

describe('forge-eval/judge.parseJudgeResponse', () => {
  it('合法响应:第一行整数 + 理由', () => {
    const r = parseJudgeResponse('8\n响应清晰,问对了关键问题');
    expect(r.score).toBe(8);
    expect(r.reasoning).toBe('响应清晰,问对了关键问题');
  });

  it('多行理由', () => {
    const r = parseJudgeResponse('5\n第一行理由\n第二行补充');
    expect(r.score).toBe(5);
    expect(r.reasoning).toBe('第一行理由\n第二行补充');
  });

  it('第一行非整数 → score=0, rawResponse 保留', () => {
    const r = parseJudgeResponse('我觉得这个挺好的,8 分吧');
    expect(r.score).toBe(0);
    expect(r.reasoning).toContain('解析失败');
    expect(r.rawResponse).toBe('我觉得这个挺好的,8 分吧');
  });

  it('分数超出 0-10 → score=0', () => {
    const r = parseJudgeResponse('15\n超分');
    expect(r.score).toBe(0);
  });

  it('无理由行 → reasoning 显示占位', () => {
    const r = parseJudgeResponse('7');
    expect(r.score).toBe(7);
    expect(r.reasoning).toBe('(无理由)');
  });
});

describe('forge-eval/judge.judgeWithLlm (with mock client)', () => {
  it('调 mock client → 返回解析后的 JudgeResult', async () => {
    const mockClient = {
      messages: {
        create: async () => ({
          content: [{ type: 'text', text: '7\n基本到位' }],
        }),
      },
    } as unknown as import('@anthropic-ai/sdk').default;

    const r = await judgeWithLlm(mockClient, 'AI 响应文本', 'rubric 文本');
    expect(r.score).toBe(7);
    expect(r.reasoning).toBe('基本到位');
  });
});
