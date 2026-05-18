import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverSources,
  extractText,
  buildExtractTasks,
  parseExtractResults,
  diffAgainstConfirmed,
  type ExtractedRequirement,
} from '../../../src/core/legacy-bridge/extractor.js';
import type { LegacyRequirement } from '../../../src/core/legacy-bridge/legacy-requirements.js';

async function tmpRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'extract-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return root;
}

describe('discoverSources', () => {
  it('识别需求文档(SRS 命名)与 backlog 文件,排除 node_modules', async () => {
    const root = await tmpRepo({
      'docs/SRS.md': '# 需求规格',
      'TODO.md': '- 待办一',
      'node_modules/pkg/SRS.md': 'noise',
      'src/app.ts': 'code',
      'README.md': '# 项目',
    });
    const found = await discoverSources(root);
    const paths = found.map((s) => s.path).sort();
    expect(paths).toContain('docs/SRS.md');
    expect(paths).toContain('TODO.md');
    expect(paths).not.toContain('node_modules/pkg/SRS.md');
    // README.md 不匹配需求/backlog 命名 → 不纳入
    expect(paths).not.toContain('README.md');
  });

  it('source.kind 标注正确', async () => {
    const root = await tmpRepo({ 'docs/SRS.md': 'x', 'BACKLOG.md': 'y' });
    const found = await discoverSources(root);
    expect(found.find((s) => s.path === 'docs/SRS.md')?.kind).toBe('srs');
    expect(found.find((s) => s.path === 'BACKLOG.md')?.kind).toBe('backlog-file');
  });
});

describe('extractText', () => {
  it('.md 直读', async () => {
    const root = await tmpRepo({ 'docs/SRS.md': '# 需求\n第一条' });
    expect(await extractText(root, 'docs/SRS.md')).toContain('第一条');
  });

  it('.txt 直读', async () => {
    const root = await tmpRepo({ 'TODO.txt': '待办内容' });
    expect(await extractText(root, 'TODO.txt')).toContain('待办内容');
  });

  it('读取失败 → 抛带路径的错误', async () => {
    const root = await tmpRepo({});
    await expect(extractText(root, 'missing.md')).rejects.toThrow(/missing\.md/);
  });
});

describe('buildExtractTasks', () => {
  it('每来源文档一个 task,op=extract,prompt 内嵌 redact 后文本', async () => {
    const root = await tmpRepo({
      'docs/SRS.md': '# 需求\nAWS key AKIAIOSFODNN7EXAMPLE 出现在此',
      'TODO.md': '- 待办',
    });
    const sources = await discoverSources(root);
    // codeIndex 含一个 secret 样的路径 —— 用于验证代码索引也走 redact
    const tasks = await buildExtractTasks(root, sources, [
      'src/app.ts',
      'src/cfg-AKIAIOSFODNN7EXAMPLE.ts',
    ]);
    expect(tasks).toHaveLength(2);
    for (const t of tasks) {
      expect(t.op).toBe('extract');
      expect(t.outputPath).toMatch(/^\.cache\/extract-result-\d+\.json$/);
    }
    const srsTask = tasks.find((t) => t.prompt.includes('docs/SRS.md'));
    // redact:文档正文里的 secret 不进 prompt
    expect(srsTask?.prompt).not.toContain('AKIAIOSFODNN7EXAMPLE');
    // 代码索引内嵌进 prompt(spec §4.2 关键约定)
    expect(srsTask?.prompt).toContain('src/app.ts');
  });
});

describe('parseExtractResults', () => {
  it('解析多 task 的 JSON 字符串结果,汇总成统一条目集', () => {
    const t1 = JSON.stringify([
      {
        title: '登录 2FA',
        description: 'd',
        status: 'unimplemented',
        section: '3.2',
        evidence: [],
        confidence: 'high',
      },
    ]);
    const t2 = JSON.stringify([
      {
        title: '日志',
        description: 'd2',
        status: 'implemented',
        section: '',
        evidence: ['src/log.ts:1'],
        confidence: 'medium',
      },
    ]);
    const out = parseExtractResults([
      { text: t1, source: 'docs/SRS.md', kind: 'srs' },
      { text: t2, source: 'docs/SRS.md', kind: 'srs' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.title).toBe('登录 2FA');
    expect(out[1]?.status).toBe('implemented');
  });

  it('某 task 文本非法 JSON → 抛带 source 的错误', () => {
    expect(() =>
      parseExtractResults([{ text: 'not json', source: 'TODO.md', kind: 'backlog-file' }]),
    ).toThrow(/TODO\.md/);
  });

  it('条目 status 越界 → 抛错', () => {
    const bad = JSON.stringify([
      {
        title: 't',
        description: 'd',
        status: 'maybe',
        section: '',
        evidence: [],
        confidence: 'low',
      },
    ]);
    expect(() => parseExtractResults([{ text: bad, source: 'a.md', kind: 'srs' }])).toThrow(
      /status/,
    );
  });

  it('数组元素为 null → 抛带 source 的错误(不漏成无上下文 TypeError)', () => {
    expect(() =>
      parseExtractResults([{ text: '[null]', source: 'docs/SRS.md', kind: 'srs' }]),
    ).toThrow(/docs\/SRS\.md\[0\]/);
  });
});

function extracted(p: Partial<ExtractedRequirement>): ExtractedRequirement {
  return {
    title: 't',
    description: 'd',
    status: 'unimplemented',
    source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
    evidence: [],
    confidence: 'medium',
    ...p,
  };
}

/** 构造一条既有 LegacyRequirement(confirmed yaml fixture 用) */
function req(p: Partial<LegacyRequirement>): LegacyRequirement {
  return {
    id: 'LR-0001',
    title: 't',
    description: 'd',
    status: 'unimplemented',
    source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
    evidence: [],
    confidence: 'medium',
    priority: null,
    review: 'confirmed',
    notes: '',
    ...p,
  };
}

describe('diffAgainstConfirmed', () => {
  it('首次抽取(无既有 yaml):全部 new,id 留空', () => {
    const draft = diffAgainstConfirmed([extracted({ title: 'A' })], null);
    expect(draft[0]?.change).toBe('new');
    expect(draft[0]?.requirement.id).toBe('');
  });

  it('matched 未变 → unchanged,保留既有 id 与用户 priority/notes', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        req({
          id: 'LR-0005',
          title: 'A',
          description: 'd',
          priority: 'high',
          notes: '用户笔记',
          source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
        }),
      ],
    };
    const draft = diffAgainstConfirmed([extracted({ title: 'A', description: 'd' })], confirmed);
    expect(draft[0]?.change).toBe('unchanged');
    expect(draft[0]?.requirement.id).toBe('LR-0005');
    expect(draft[0]?.requirement.priority).toBe('high');
    expect(draft[0]?.requirement.notes).toBe('用户笔记');
    expect(draft[0]?.requirement.review).toBe('confirmed');
  });

  it('matched 但 description 变 → changed,review 回退 pending', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        req({
          id: 'LR-0005',
          title: 'A',
          description: '旧',
          source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
        }),
      ],
    };
    const draft = diffAgainstConfirmed([extracted({ title: 'A', description: '新' })], confirmed);
    expect(draft[0]?.change).toBe('changed');
    expect(draft[0]?.requirement.review).toBe('pending');
    expect(draft[0]?.requirement.id).toBe('LR-0005');
  });

  it('matched 仅 confidence/evidence 变 → changed,review 回退 pending(spec §6.1「全一致」)', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        req({
          id: 'LR-0005',
          title: 'A',
          description: 'd',
          confidence: 'low',
          evidence: [],
          source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
        }),
      ],
    };
    const draft = diffAgainstConfirmed(
      [extracted({ title: 'A', description: 'd', confidence: 'high' })],
      confirmed,
    );
    expect(draft[0]?.change).toBe('changed');
    expect(draft[0]?.requirement.review).toBe('pending');
  });

  it('既有有、本轮没抽到 → vanished,保留 id', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        req({ id: 'LR-0009', source: { document: 'docs/SRS.md', section: '9', kind: 'srs' } }),
      ],
    };
    const draft = diffAgainstConfirmed([], confirmed);
    expect(draft[0]?.change).toBe('vanished');
    expect(draft[0]?.requirement.id).toBe('LR-0009');
  });

  it('同 document+section 抽出多条 → 全部 conflict / pending,不继承 id', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        req({ id: 'LR-0005', source: { document: 'docs/SRS.md', section: '1', kind: 'srs' } }),
      ],
    };
    const draft = diffAgainstConfirmed(
      [extracted({ title: 'A' }), extracted({ title: 'B' })],
      confirmed,
    );
    expect(draft.every((d) => d.change === 'conflict')).toBe(true);
    expect(draft.every((d) => d.requirement.id === '')).toBe(true);
    expect(draft.every((d) => d.requirement.review === 'pending')).toBe(true);
  });

  it('旧侧同 key 多条 + 新侧 1 条 → 旧 confirmed 条目不丢、全标 conflict(F02 防静默丢失)', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        req({
          id: 'LR-0005',
          title: 'A',
          source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
        }),
        req({
          id: 'LR-0006',
          title: 'B',
          source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
        }),
      ],
    };
    const draft = diffAgainstConfirmed([extracted({ title: 'C' })], confirmed);
    expect(draft).toHaveLength(3);
    expect(draft.every((d) => d.change === 'conflict')).toBe(true);
    expect(draft.every((d) => d.requirement.id === '')).toBe(true);
  });
});
