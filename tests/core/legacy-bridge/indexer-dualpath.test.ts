// tests/core/legacy-bridge/indexer-dualpath.test.ts
import { describe, it, expect } from 'vitest';
import { buildIndexTask, applyIndexResult } from '../../../src/core/legacy-bridge/indexer.js';
import type { LegacyAnchorsFile } from '../../../src/core/legacy-bridge/types.js';

const file: LegacyAnchorsFile = {
  schema: 'forge-legacy-anchor/v1',
  anchors: [
    { role: 'requirements', path: 'docs/SRS.md', authoritative: true },
    { role: 'acceptance-report', path: 'docs/UAT.md', authoritative: true },
  ],
};

describe('buildIndexTask', () => {
  it('只为非 metadata-only anchor 产 LlmTask;metadata-only 走 prebuilt', async () => {
    const { task, prebuilt } = await buildIndexTask(file, async () => '正文内容若干');
    expect(task).not.toBeNull();
    expect(task!.op).toBe('index');
    expect(task!.prompt).toContain('docs/SRS.md');
    expect(task!.prompt).not.toContain('docs/UAT.md'); // acceptance-report 不进 LLM
    expect(prebuilt.find((e) => e.path === 'docs/UAT.md')).toBeTruthy();
  });
});

describe('applyIndexResult', () => {
  it('LLM 的 {path: summary} map + prebuilt 合并渲染 markdown', () => {
    const llmText = JSON.stringify({ 'docs/SRS.md': '这是需求摘要' });
    const prebuilt = [
      { path: 'docs/UAT.md', role: 'acceptance-report', summary: '(metadata-only)', inputBytes: 0 },
    ];
    const md = applyIndexResult(llmText, file, prebuilt);
    expect(md).toContain('这是需求摘要');
    expect(md).toContain('docs/UAT.md');
  });
});
