import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBacklog } from '../../../src/core/backlog/index.js';
import { renderActiveMarkdown, renderArchivedMarkdown } from '../../../src/core/backlog/render.js';

async function tmpForge(): Promise<string> {
  const forge = join(await mkdtemp(join(tmpdir(), 'bk-')), 'forge');
  await mkdir(forge, { recursive: true });
  return forge;
}

describe('buildBacklog 空 archive 容错', () => {
  it('forge/changes/archive/ 不存在 → buildBacklog 不抛错', async () => {
    const forge = await tmpForge();
    await expect(buildBacklog(forge)).resolves.toBeDefined();
  });
});

describe('renderActiveMarkdown Legacy Requirements 段', () => {
  it('只渲染 unimplemented + 未退役条目;implemented 不渲染', () => {
    const legacyReqs = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        {
          id: 'LR-0001',
          title: '未实现',
          description: 'd',
          status: 'unimplemented' as const,
          source: { document: 'docs/SRS.md', section: '1', kind: 'srs' as const },
          evidence: [],
          confidence: 'medium' as const,
          priority: null,
          review: 'confirmed' as const,
          notes: '',
        },
        {
          id: 'LR-0002',
          title: '已实现',
          description: 'd',
          status: 'implemented' as const,
          source: { document: 'docs/SRS.md', section: '2', kind: 'srs' as const },
          evidence: ['src/x.ts:1'],
          confidence: 'high' as const,
          priority: null,
          review: 'confirmed' as const,
          notes: '',
        },
      ],
    };
    const md = renderActiveMarkdown([], [], legacyReqs);
    expect(md).toContain('## Legacy Requirements');
    expect(md).toContain('未实现');
    expect(md).not.toContain('已实现');
  });

  it('legacyReqs 为 null → 不渲染 Legacy Requirements 段、不改顶部待办行(向后兼容)', () => {
    const md = renderActiveMarkdown([], [], null);
    expect(md).not.toContain('## Legacy Requirements');
    expect(md).not.toContain('legacy requirements 待办');
  });

  it('legacyReqs 非 null → 顶部待办行补「另有 N 项 legacy requirements 待办」(F3,spec §7.2)', () => {
    const legacyReqs = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        {
          id: 'LR-0001',
          title: '未实现',
          description: 'd',
          status: 'unimplemented' as const,
          source: { document: 'docs/SRS.md', section: '1', kind: 'srs' as const },
          evidence: [],
          confidence: 'medium' as const,
          priority: null,
          review: 'confirmed' as const,
          notes: '',
        },
      ],
    };
    const md = renderActiveMarkdown([], [], legacyReqs);
    expect(md).toContain('另有 1 项 legacy requirements 待办');
  });
});

describe('renderArchivedMarkdown Retired 段', () => {
  it('scope tombstone 为空但有 legacy tombstone → Retired 段仍渲染(F2,不被早退吞掉)', () => {
    const lt = [
      {
        entry_id: 'LR-0001',
        new_status: 'completed',
        rationale: 'r',
        superseded_in_change: '2026-05-01-foo',
        superseded_at: '2026-05-01',
        requirement_snapshot: null,
      },
    ];
    const md = renderArchivedMarkdown([], lt);
    expect(md).toContain('## Legacy Requirements — Retired');
    expect(md).toContain('LR-0001');
  });

  it('无 legacy tombstone → archived.md 不含 Retired 段(既有项目不变)', () => {
    const md = renderArchivedMarkdown([], []);
    expect(md).not.toContain('Retired');
  });
});

describe('buildBacklog 双源(legacy-requirements.yaml 第二源)', () => {
  it('有 legacy-requirements.yaml → active.md 出 Legacy Requirements 段', async () => {
    const forge = await tmpForge();
    await writeFile(
      join(forge, 'legacy-requirements.yaml'),
      `schema: forge-legacy-requirements/v1
requirements:
  - id: LR-0001
    title: 未实现需求
    description: d
    status: unimplemented
    source: { document: docs/SRS.md, section: "1", kind: srs }
    evidence: []
    confidence: medium
    priority: null
    review: confirmed
    notes: ""
`,
      'utf8',
    );
    const result = await buildBacklog(forge);
    expect(result.activeMd).toContain('## Legacy Requirements');
    expect(result.activeMd).toContain('未实现需求');
  });
});

describe('buildBacklog reserved-archive-dirname(spec §8.5 第 6 项)', () => {
  it('archive 下存在名为 legacy-requirements 的目录 → active.md 报 reserved-archive-dirname warning', async () => {
    const forge = await tmpForge();
    await mkdir(join(forge, 'changes', 'archive', 'legacy-requirements'), { recursive: true });
    const result = await buildBacklog(forge);
    expect(result.activeMd).toContain('reserved-archive-dirname');
  });
});
