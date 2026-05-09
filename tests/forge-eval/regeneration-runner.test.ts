import { describe, it, expect } from 'vitest';
import {
  loadRegenScenario,
  validateScenario,
  runRegenScenario,
  buildRegenReport,
  type RegenRunnerClient,
} from '../../forge-eval/regeneration-runner.js';
import type { RegenScenario, RegenRunSummary } from '../../forge-eval/regeneration-types.js';

function makeMockClient(regeneratedBody: string, judgeAlwaysPreserved = true): RegenRunnerClient {
  let callCount = 0;
  return {
    messages: {
      create: async () => {
        callCount += 1;
        // 第 1 次 call:regenerator(返复写正文)
        // 后续 calls:judge(返 preserved)
        const text =
          callCount === 1
            ? regeneratedBody
            : judgeAlwaysPreserved
              ? 'preserved\nok'
              : 'lost\n找不到';
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 1000, output_tokens: 500 },
        };
      },
    },
  } as unknown as RegenRunnerClient;
}

describe('forge-eval/regeneration-runner', () => {
  it('loadRegenScenario 读 well-formed-srs', async () => {
    const s = await loadRegenScenario('well-formed-srs');
    expect(s.id).toBe('well-formed-srs');
    expect(s.key_facts.length).toBeGreaterThan(5);
    expect(s.key_facts.some((f) => f.critical)).toBe(true);
  });

  it('validateScenario 缺 key_facts → 抛错', () => {
    const bad: RegenScenario = {
      id: 'bad',
      role: 'requirements',
      input_anchors: [{ role: 'requirements', path: 'x.md', authoritative: true }],
      key_facts: [],
    };
    expect(() => validateScenario(bad, 'fake')).toThrow(/key_facts 为空/);
  });

  it('runRegenScenario happy path → passed=true(全 preserved)', async () => {
    const scenario = await loadRegenScenario('well-formed-srs');
    const long = '# 复写\n## 1. 章节\n' + scenario.key_facts.map((f) => f.text).join('\n');
    const r = await runRegenScenario(makeMockClient(long, true), scenario);
    expect(r.passed).toBe(true);
    expect(r.qualityResult.critical_rate).toBe(1.0);
  });

  it('runRegenScenario judge lost 全部 → passed=false', async () => {
    const scenario = await loadRegenScenario('well-formed-srs');
    const long = '# 复写\n## 1. 章节\n' + 'a'.repeat(200);
    const r = await runRegenScenario(makeMockClient(long, false), scenario);
    expect(r.passed).toBe(false);
    expect(r.qualityResult.lost_critical.length).toBeGreaterThan(0);
  });

  it('buildRegenReport 含 ✓/✗ 与所有 scenario', () => {
    const summary: RegenRunSummary = {
      timestamp: '2026-05-05T00:00:00Z',
      results: [
        {
          scenario: { id: 'a', role: 'requirements', input_anchors: [], key_facts: [] },
          qualityResult: {
            total_rate: 1,
            critical_rate: 1,
            per_section_rates: {},
            lost_critical: [],
            lost_non_critical: [],
            uncovered_sections: [],
            passed: true,
          },
          body: 'b',
          totalCost: 0.5,
          passed: true,
        },
      ],
      totalCost: 0.5,
      runPass: true,
    };
    const md = buildRegenReport(summary);
    expect(md).toContain('## a ✓');
    expect(md).toContain('ALL PASS');
  });

  it('partial-anchor-missing scenario → 因 historical 缺失走 graceful path', async () => {
    const scenario = await loadRegenScenario('partial-anchor-missing');
    // historical anchor MISSING-FILE.md 不存在 → runner 应 skip 它,只用 authoritative
    const long = '# 复写\n## §2.1 章节\nOrder 表 user_id 字段非空。';
    const r = await runRegenScenario(makeMockClient(long, true), scenario);
    // 不应抛错
    expect(r.body).toBeDefined();
  });
});
