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

  it('LLM 错形返回 JSON 数组 → 降级,只渲染 prebuilt(不产 numeric-key 垃圾)', () => {
    const prebuilt = [
      { path: 'docs/UAT.md', role: 'acceptance-report', summary: '(metadata-only)', inputBytes: 0 },
    ];
    const md = applyIndexResult(JSON.stringify(['docs/SRS.md', 'x']), file, prebuilt);
    expect(md).toContain('docs/UAT.md'); // prebuilt 仍渲染
    expect(md).not.toContain('docs/SRS.md'); // 数组被拒,SRS.md 无 summary 条目、未渲染
  });

  it('LLM 摘要含 anchors 之外的幻觉路径 → 仍渲染,role 落 unmatched', () => {
    const md = applyIndexResult(JSON.stringify({ 'docs/GHOST.md': '幻觉摘要' }), file, []);
    expect(md).toContain('docs/GHOST.md');
    expect(md).toContain('幻觉摘要');
    expect(md).toContain('unmatched');
  });
});

describe('buildIndexTask task===null 分支', () => {
  it('全部 anchor 是 metadata-only → task 为 null,prebuilt 非空', async () => {
    const onlyMeta: LegacyAnchorsFile = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [{ role: 'acceptance-report', path: 'docs/UAT.md', authoritative: true }],
    };
    const { task, prebuilt } = await buildIndexTask(onlyMeta, async () => 'x');
    expect(task).toBeNull();
    expect(prebuilt).toHaveLength(1);
  });
});
