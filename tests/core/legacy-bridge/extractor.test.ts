import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSources } from '../../../src/core/legacy-bridge/extractor.js';

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
