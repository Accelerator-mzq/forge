// tests/migrate/quality.test.ts
// quality.ts 测试套件 — Plan 8e Task 5.3-5.9
// 覆盖:callAnthropic + extractFacts(通用 / motivation / behavior)+ judgeAll + getFidelityThreshold
import { describe, it, expect, vi } from 'vitest';
import {
  callAnthropic,
  AbortInterrupted,
  extractFacts,
  extractMotivationFacts,
  extractBehaviorFacts,
  judgeAll,
  getFidelityThreshold,
  type AnthropicClient,
  type KeyFact,
} from '../../src/core/migrate/quality.js';

// helper:mock client 返指定 text — 单次调用都返同一段
function mockClientReturning(text: string): AnthropicClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text }],
      }),
    },
  } as unknown as AnthropicClient;
}

describe('callAnthropic({signal})', () => {
  it('SDK 返结果 → 透传 text', async () => {
    const client = mockClientReturning('hello');
    const out = await callAnthropic(client, {
      model: 'claude-sonnet-4-6',
      prompt: 'x',
      maxTokens: 100,
      signal: new AbortController().signal,
    });
    expect(out).toBe('hello');
  });

  it('AbortError 映射为 AbortInterrupted', async () => {
    const ac = new AbortController();
    ac.abort();
    const err = new Error('aborted');
    err.name = 'AbortError';
    const client = {
      messages: { create: vi.fn().mockRejectedValue(err) },
    } as unknown as AnthropicClient;
    await expect(
      callAnthropic(client, {
        model: 'claude-sonnet-4-6',
        prompt: 'x',
        maxTokens: 100,
        signal: ac.signal,
      }),
    ).rejects.toThrow(AbortInterrupted);
  });
});

describe('extractFacts(content) — 通用', () => {
  it('mock SDK 返 30 条 facts → 抽取', async () => {
    const facts30 = Array.from({ length: 30 }, (_, i) => ({
      text: `fact ${i}`,
      section: '§1',
      critical: i < 3,
    }));
    const client = mockClientReturning(JSON.stringify(facts30));
    const result = await extractFacts(client, 'some content', new AbortController().signal);
    expect(result).toHaveLength(30);
    expect(result[0]?.text).toBe('fact 0');
    expect(result[0]?.critical).toBe(true);
  });

  it('SDK 返非 JSON → throw QualityFailure parse-error', async () => {
    const client = mockClientReturning('not json');
    await expect(extractFacts(client, 'x', new AbortController().signal)).rejects.toThrow(
      /parse-error/,
    );
  });

  it('SDK 返 < 5 条 → throw QualityFailure too-few-facts', async () => {
    const client = mockClientReturning(
      JSON.stringify([{ text: 'a', section: '§1', critical: false }]),
    );
    await expect(extractFacts(client, 'x', new AbortController().signal)).rejects.toThrow(
      /too-few-facts/,
    );
  });

  it('容忍 ```json fence 包裹的 JSON', async () => {
    const facts = Array.from({ length: 5 }, (_, i) => ({
      text: `fact ${i}`,
      section: '§1',
      critical: false,
    }));
    const client = mockClientReturning('```json\n' + JSON.stringify(facts) + '\n```');
    const result = await extractFacts(client, 'x', new AbortController().signal);
    expect(result).toHaveLength(5);
  });

  it('重复 facts(text 小写)去重', async () => {
    const facts = [
      { text: 'Fact A', section: '§1', critical: false },
      { text: 'fact a', section: '§2', critical: false }, // 小写后同
      { text: 'fact b', section: '§1', critical: false },
      { text: 'fact c', section: '§1', critical: false },
      { text: 'fact d', section: '§1', critical: false },
      { text: 'fact e', section: '§1', critical: false },
    ];
    const client = mockClientReturning(JSON.stringify(facts));
    const result = await extractFacts(client, 'x', new AbortController().signal);
    expect(result).toHaveLength(5); // 去重后 5 条
  });
});

describe('extractMotivationFacts(design) — proposal 校验', () => {
  it('mock 返 8 条 motivation facts', async () => {
    const facts = Array.from({ length: 8 }, (_, i) => ({
      text: `motivation ${i}`,
      section: '§Why',
      critical: i === 0,
    }));
    const client = mockClientReturning(JSON.stringify(facts));
    const result = await extractMotivationFacts(
      client,
      'design content',
      new AbortController().signal,
    );
    expect(result).toHaveLength(8);
  });

  it('< 5 条 → throw too-few-facts(spec M15 v3 阈值)', async () => {
    const client = mockClientReturning(
      JSON.stringify([{ text: 'x', section: '§1', critical: false }]),
    );
    await expect(
      extractMotivationFacts(client, 'design', new AbortController().signal),
    ).rejects.toThrow(/too-few-facts/);
  });
});

describe('extractBehaviorFacts(tasks) — specs 校验', () => {
  it('mock 返 12 条 behavior facts', async () => {
    const facts = Array.from({ length: 12 }, (_, i) => ({
      text: `behavior ${i}`,
      section: '§task',
      critical: i % 3 === 0,
    }));
    const client = mockClientReturning(JSON.stringify(facts));
    const result = await extractBehaviorFacts(
      client,
      'tasks content',
      new AbortController().signal,
    );
    expect(result).toHaveLength(12);
  });
});

describe('judgeAll', () => {
  it('全 preserved → passed', async () => {
    const client = mockClientReturning('preserved\nclean.');
    const facts: KeyFact[] = Array.from({ length: 5 }, (_, i) => ({
      text: `fact ${i}`,
      section: '§1',
      critical: false,
    }));
    const result = await judgeAll(
      client,
      'generated body',
      facts,
      0.9,
      new AbortController().signal,
    );
    expect(result.passed).toBe(true);
    expect(result.totalRate).toBe(1);
  });

  it('70% preserved + threshold 0.9 → fail', async () => {
    let callCount = 0;
    const client: AnthropicClient = {
      messages: {
        create: vi.fn().mockImplementation(() => {
          callCount++;
          // 前 7 个返 preserved,后 3 个返 lost(总 10 个)
          const text = callCount <= 7 ? 'preserved\n' : 'lost\n';
          return Promise.resolve({ content: [{ type: 'text', text }] });
        }),
      },
    } as unknown as AnthropicClient;
    const facts: KeyFact[] = Array.from({ length: 10 }, (_, i) => ({
      text: `f ${i}`,
      section: '§1',
      critical: false,
    }));
    const result = await judgeAll(client, 'gen', facts, 0.9, new AbortController().signal);
    expect(result.passed).toBe(false);
    expect(result.totalRate).toBeLessThan(0.9);
  });

  it('critical fact lost → 必 fail(criticalRate < 1)', async () => {
    let callCount = 0;
    const client: AnthropicClient = {
      messages: {
        create: vi.fn().mockImplementation(() => {
          callCount++;
          // 第 1 个 critical 返 lost,其余 preserved
          const text = callCount === 1 ? 'lost\n' : 'preserved\n';
          return Promise.resolve({ content: [{ type: 'text', text }] });
        }),
      },
    } as unknown as AnthropicClient;
    const facts: KeyFact[] = Array.from({ length: 10 }, (_, i) => ({
      text: `f ${i}`,
      section: '§1',
      critical: i === 0, // 只第 1 个 critical
    }));
    const result = await judgeAll(client, 'gen', facts, 0.5, new AbortController().signal);
    expect(result.passed).toBe(false); // critical lost → 不可通过
    expect(result.criticalRate).toBeLessThan(1);
  });
});

describe('getFidelityThreshold', () => {
  it('superpowers=0.6 / openspec=0.9', () => {
    expect(getFidelityThreshold('superpowers')).toBe(0.6);
    expect(getFidelityThreshold('openspec')).toBe(0.9);
  });
});
