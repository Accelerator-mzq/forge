import { describe, it, expect } from 'vitest';
import {
  findAffectedAnchors,
  parseLlmDiffJson,
  runSyncCheck,
  type SyncCheckClient,
} from '../../../src/core/legacy-bridge/sync-check.js';
import type { LegacyAnchor, LegacyAnchorsFile } from '../../../src/core/legacy-bridge/types.js';

function makeMock(jsonText: string): SyncCheckClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: jsonText }],
      }) as never,
    },
  };
}

const anchors: LegacyAnchorsFile = {
  schema: 'forge-legacy-anchor/v1',
  anchors: [
    {
      role: 'requirements',
      path: 'docs/legacy/SRS.md',
      authoritative: true,
      modules: ['payment', 'order'],
    },
    {
      role: 'high-level-design',
      path: 'docs/legacy/HLD.md',
      authoritative: true,
      modules: ['order'],
    },
    {
      role: 'low-level-design',
      path: 'docs/legacy/payment-detailed.md',
      authoritative: true,
      modules: ['payment'],
    },
  ],
};

describe('legacy-bridge/sync-check.findAffectedAnchors', () => {
  it('module=payment → 命中 SRS + payment-detailed', () => {
    const r = findAffectedAnchors(anchors, ['payment']);
    expect(r.map((a) => a.path).sort()).toEqual(
      ['docs/legacy/SRS.md', 'docs/legacy/payment-detailed.md'].sort(),
    );
  });

  it('module=unknown → 空', () => {
    expect(findAffectedAnchors(anchors, ['unknown'])).toHaveLength(0);
  });

  it('affectedModules 空 → 空', () => {
    expect(findAffectedAnchors(anchors, [])).toHaveLength(0);
  });
});

describe('legacy-bridge/sync-check.parseLlmDiffJson', () => {
  const anchor: LegacyAnchor = {
    role: 'requirements',
    path: 'a.md',
    authoritative: true,
  };

  it('合法 JSON 数组解析成功', () => {
    const r = parseLlmDiffJson(
      '[{"severity":"critical","section":"§4","description":"x"}]',
      anchor,
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.severity).toBe('critical');
  });

  it('空数组(LLM 判无差异)→ 0 条', () => {
    expect(parseLlmDiffJson('[]', anchor)).toHaveLength(0);
  });

  it('LLM 输出非 JSON → 1 条 info(不阻塞)', () => {
    const r = parseLlmDiffJson('not json at all', anchor);
    expect(r).toHaveLength(1);
    expect(r[0]?.severity).toBe('info');
    expect(r[0]?.description).toContain('LLM 输出非合法 JSON');
  });

  it('LLM 输出 JSON 但非数组 → 1 条 info', () => {
    const r = parseLlmDiffJson('{"foo":1}', anchor);
    expect(r).toHaveLength(1);
    expect(r[0]?.severity).toBe('info');
  });
});

describe('legacy-bridge/sync-check.runSyncCheck', () => {
  it('happy path:LLM 返 critical → 报告含 critical', async () => {
    const client = makeMock('[{"severity":"critical","section":"§4.5","description":"幂等约束变化"}]');
    const r = await runSyncCheck(
      client,
      {
        changeId: 'add-payment',
        changeContext: 'feat: 新增退款',
        affectedModules: ['payment'],
        anchors,
        autoResolveCrossAnchor: false,
        mtimeOf: () => 100,
      },
      async () => '原文 SRS 内容',
    );
    expect(r.syncState.diffs.some((d) => d.severity === 'critical')).toBe(true);
    expect(r.syncState.diffs.every((d) => d.status === 'pending')).toBe(true);
  });

  it('跨 role anchor 多个 affected → 默认 cross_anchor_conflicts(决策 #18)', async () => {
    const client = makeMock('[]'); // LLM 判每 anchor 都没差异
    const r = await runSyncCheck(
      client,
      {
        changeId: 'add-payment',
        changeContext: 'feat: 新增 module',
        affectedModules: ['payment', 'order'],
        anchors,
        autoResolveCrossAnchor: false,
        mtimeOf: () => 100,
      },
      async () => '原文',
    );
    expect(r.syncState.cross_anchor_conflicts).toBeDefined();
    expect(r.syncState.cross_anchor_conflicts!.length).toBeGreaterThan(0);
  });

  it('autoResolveCrossAnchor=true → cross_anchor_conflicts 空', async () => {
    const client = makeMock('[]');
    const r = await runSyncCheck(
      client,
      {
        changeId: 'x',
        changeContext: '',
        affectedModules: ['payment', 'order'],
        anchors,
        autoResolveCrossAnchor: true,
        mtimeOf: () => 100,
      },
      async () => '',
    );
    expect(r.syncState.cross_anchor_conflicts).toBeUndefined();
  });

  it('hash 检测:无记录 hash → state=no-record', async () => {
    const client = makeMock('[]');
    const r = await runSyncCheck(
      client,
      {
        changeId: 'x',
        changeContext: '',
        affectedModules: ['payment'],
        anchors,
        autoResolveCrossAnchor: false,
        mtimeOf: () => 100,
      },
      async () => '',
    );
    expect(r.hashChecks.every((h) => h.state === 'no-record')).toBe(true);
  });
});
