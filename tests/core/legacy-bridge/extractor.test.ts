import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverSources,
  extractText,
  buildExtractTasks,
} from '../../../src/core/legacy-bridge/extractor.js';

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
