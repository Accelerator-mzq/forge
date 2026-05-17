// tests/core/legacy-bridge/regenerator-dualpath.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildRegenerateRound1Tasks,
  applyRound1AndBuildRound2,
  applyRound2,
} from '../../../src/core/legacy-bridge/regenerator.js';
import type { LegacyAnchor } from '../../../src/core/legacy-bridge/types.js';
import type { SamplingOutput } from '../../../src/core/legacy-bridge/quality-judge.js';

const auth: LegacyAnchor = { role: 'requirements', path: 'docs/SRS.md', authoritative: true };

// applyRound2 测试用抽样数据:§1 节含 1 critical + 1 non-critical fact
const sampling: SamplingOutput = {
  sampled: [
    { text: 'a', section: '§1', critical: true },
    { text: 'b', section: '§1', critical: false },
  ],
  perSectionSampled: { '§1': 2 },
  uncoveredSections: [],
};

describe('buildRegenerateRound1Tasks', () => {
  it('产 2 个 LlmTask:regenerate + extract-facts', async () => {
    const tasks = await buildRegenerateRound1Tasks(
      {
        role: 'requirements',
        authoritative: auth,
        forgeVersion: '1.4.0',
        regenLicense: 'derived-from-source',
      },
      async () => '老 SRS 正文,含密钥 AKIA1234567890ABCDEF',
    );
    expect(tasks.map((t) => t.op).sort()).toEqual(['extract-facts', 'regenerate']);
    for (const t of tasks) {
      expect(t.prompt).not.toContain('AKIA1234567890ABCDEF'); // prompt 已 redact
      // inputs 同样写进 manifest 交给 agent —— 也必须是 masked 内容
      expect(t.inputs[0]!.content).not.toContain('AKIA1234567890ABCDEF');
    }
  });

  it('metadata-only role 抛 RegenOutputError', async () => {
    await expect(
      buildRegenerateRound1Tasks(
        {
          role: 'acceptance-report',
          authoritative: auth,
          forgeVersion: '1.4.0',
          regenLicense: 'derived-from-source',
        },
        async () => 'x',
      ),
    ).rejects.toThrow(/metadata-only/);
  });
});

describe('applyRound1AndBuildRound2', () => {
  it('轮1 产物 → stratifiedSample → 产 quality-judge LlmTask + SamplingOutput', () => {
    const regenBody = '## 复写后的 SRS\n字段 X 必须非空。' + 'x'.repeat(200);
    const facts = JSON.stringify([
      { text: '字段 X 必须非空', section: '§4', critical: true },
      { text: 'fact2', section: '§4', critical: false },
      { text: 'fact3', section: '§5', critical: false },
    ]);
    const { task, sampling } = applyRound1AndBuildRound2(regenBody, facts, 'requirements');
    expect(task.op).toBe('quality-judge');
    expect(task.prompt).toContain('字段 X 必须非空'); // 抽样 fact 进 prompt
    expect(sampling.sampled.length).toBeGreaterThan(0);
  });

  it('extract-facts 空 / 非法 → 抛 RegenOutputError(不静默走「空抽样=passed」)', () => {
    const regenBody = '## SRS\n' + 'x'.repeat(200);
    expect(() => applyRound1AndBuildRound2(regenBody, 'not json', 'requirements')).toThrow(
      /extract-facts/,
    );
    expect(() => applyRound1AndBuildRound2(regenBody, '[]', 'requirements')).toThrow(/保真率/);
  });

  it('extract-facts 被 ```json fence 包裹 → 剥 fence 后仍能解析', () => {
    const regenBody = '## 复写后的 SRS\n字段 X 必须非空。' + 'x'.repeat(200);
    const fenced =
      '```json\n' +
      JSON.stringify([{ text: '字段 X 必须非空', section: '§4', critical: true }]) +
      '\n```';
    const { task } = applyRound1AndBuildRound2(regenBody, fenced, 'requirements');
    expect(task.op).toBe('quality-judge');
    expect(task.prompt).toContain('字段 X 必须非空');
  });
});

describe('applyRound2 三态保真率 gate', () => {
  it('全 preserved → critical_rate=1 total_rate=1 → passed', () => {
    // 两条 fact 均 preserved,critical 全量保留,total=1,threshold=0.9 → passed
    const judge = JSON.stringify([{ state: 'preserved' }, { state: 'preserved' }]);
    const r = applyRound2(judge, sampling, 0.9);
    expect(r.critical_rate).toBe(1);
    expect(r.passed).toBe(true);
  });

  it('critical fact lost → critical_rate<1 → 不 passed(critical 必须 100%,即便 total 达标)', () => {
    // 第 1 条是 critical 且 lost;第 2 条 non-critical preserved → total_rate=0.5(达不到 0.4)
    // critical_rate=0 → 不管 threshold 如何都 passed=false
    const judge = JSON.stringify([{ state: 'lost' }, { state: 'preserved' }]);
    const r = applyRound2(judge, sampling, 0.4);
    expect(r.critical_rate).toBe(0);
    expect(r.passed).toBe(false);
  });

  it('paraphrased 视为保留(state !== lost)', () => {
    // 两条均 paraphrased → critical_rate=1,total_rate=1 → passed
    const judge = JSON.stringify([{ state: 'paraphrased' }, { state: 'paraphrased' }]);
    const r = applyRound2(judge, sampling, 0.9);
    expect(r.passed).toBe(true);
  });
});
