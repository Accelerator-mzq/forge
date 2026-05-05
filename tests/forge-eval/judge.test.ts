import { describe, it, expect } from 'vitest';
import { checkPatterns } from '../../forge-eval/judge.js';

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
