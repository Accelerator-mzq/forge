// tests/core/legacy-bridge/mapper-dualpath.test.ts
// 迁移自 mapper.test.ts(runMapper 被删除后,行为覆盖移至此处)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildMapTask,
  applyMapResult,
  writeMapperDraft,
} from '../../../src/core/legacy-bridge/mapper.js';
import type { LegacyAnchorsFile } from '../../../src/core/legacy-bridge/types.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lb-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs', 'SRS.md'), '# 需求规格\nAKIA1234567890ABCDEF', 'utf8');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('buildMapTask', () => {
  it('产 1 个 op=map 的 LlmTask,preview 已 redact', async () => {
    const task = await buildMapTask({ projectRoot: dir, mode: 'overwrite' });
    expect(task.op).toBe('map');
    expect(task.prompt).toContain('docs/SRS.md');
    expect(task.prompt).not.toContain('AKIA1234567890ABCDEF'); // redact 生效
    expect(task.outputPath).toContain('legacy-bridge-result-map');
  });
});

describe('applyMapResult', () => {
  it('把 LLM 分类结果组装成 draft yaml/md', () => {
    const llmText = JSON.stringify([
      { path: 'docs/SRS.md', role: 'requirements', modules: ['payment'] },
    ]);
    const out = applyMapResult(llmText, ['docs/SRS.md'], { mode: 'overwrite' });
    expect(out.draftYaml).toContain('requirements');
    expect(out.draftYaml).toContain('docs/SRS.md');
    expect(out.newAnchors).toHaveLength(1);
  });

  it('LLM 输出非法 JSON → 全部 fallback 成 unmatched', () => {
    const out = applyMapResult('not json', ['docs/X.md'], { mode: 'overwrite' });
    expect(out.unmatched).toContain('docs/X.md');
  });

  it('--merge 模式:保留 existing anchors,跳过 path 重复', () => {
    // 迁移自 mapper.test.ts:验证 applyMapResult merge 逻辑
    const existing: LegacyAnchorsFile = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        {
          role: 'requirements',
          path: 'docs/SRS.md',
          authoritative: true,
          modules: ['user-edited'],
        },
      ],
    };
    const llmText = JSON.stringify([
      { path: 'docs/SRS.md', role: 'requirements' }, // 已存在 — 应保留 user-edited
      { path: 'docs/HLD.md', role: 'high-level-design' }, // 新增
    ]);
    const out = applyMapResult(llmText, ['docs/SRS.md', 'docs/HLD.md'], {
      mode: 'merge',
      existing,
    });
    expect(out.preservedAnchors).toHaveLength(1);
    expect(out.preservedAnchors[0]?.modules).toEqual(['user-edited']);
    expect(out.newAnchors).toHaveLength(1);
    expect(out.newAnchors[0]?.path).toBe('docs/HLD.md');
  });
});

describe('buildMapTask — 扫描行为', () => {
  it('docsPaths 自定义路径 → buildMapTask 仅扫指定目录', async () => {
    // 迁移自 mapper.test.ts:验证 buildMapTask 接受自定义 docsPaths
    await mkdir(join(dir, 'specifications'), { recursive: true });
    await writeFile(join(dir, 'specifications', 'spec.md'), '# spec', 'utf8');
    const task = await buildMapTask({
      projectRoot: dir,
      docsPaths: ['specifications'],
      mode: 'overwrite',
    });
    // task.inputs 应只含 specifications/spec.md,不含 docs/SRS.md
    const paths = task.inputs.map((i) => i.source);
    expect(paths.some((p) => p.includes('specifications'))).toBe(true);
    expect(paths.every((p) => !p.includes('docs'))).toBe(true);
  });

  it('docs 目录不存在 → buildMapTask 返回空 inputs(无错)', async () => {
    // 迁移自 mapper.test.ts:验证 docs 不存在时 buildMapTask 正常返回
    const emptyDir = await mkdtemp(join(tmpdir(), 'lb-empty-'));
    try {
      const task = await buildMapTask({ projectRoot: emptyDir, mode: 'overwrite' });
      expect(task.inputs).toHaveLength(0);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('skip node_modules / .git / forge / dist', async () => {
    // 迁移自 mapper.test.ts:验证 walk 跳过不需要扫描的目录
    // 使用同步 API 构建测试 fixture(与原测试保持一致)
    const tmp2 = mkdtempSync(join(tmpdir(), 'forge-mapper-skip-'));
    try {
      mkdirSync(join(tmp2, 'docs'), { recursive: true });
      writeFileSync(join(tmp2, 'docs', 'SRS.md'), '# 需求规格说明书\n## 1. 概述');
      mkdirSync(join(tmp2, 'node_modules'), { recursive: true });
      writeFileSync(join(tmp2, 'node_modules', 'should-skip.md'), '# vendor');
      mkdirSync(join(tmp2, 'forge'), { recursive: true });
      writeFileSync(join(tmp2, 'forge', 'config.yaml'), 'schema: x');
      const task = await buildMapTask({ projectRoot: tmp2, mode: 'overwrite' });
      const paths = task.inputs.map((i) => i.source);
      expect(paths.every((p) => !p.includes('node_modules'))).toBe(true);
      expect(paths.every((p) => !p.startsWith('forge/'))).toBe(true);
    } finally {
      rmSync(tmp2, { recursive: true, force: true });
    }
  });
});

describe('writeMapperDraft — 落盘', () => {
  it('写 draft yaml + md 到磁盘', async () => {
    // 迁移自 mapper.test.ts:writeMapperDraft 独立于 runMapper,改用 applyMapResult 构造结果
    const forgeDir = join(dir, 'forge');
    await mkdir(forgeDir, { recursive: true });
    const out = applyMapResult(
      JSON.stringify([{ path: 'docs/SRS.md', role: 'requirements' }]),
      ['docs/SRS.md'],
      { mode: 'overwrite' },
    );
    const { yamlPath, mdPath } = await writeMapperDraft(forgeDir, out);
    expect(existsSync(yamlPath)).toBe(true);
    expect(existsSync(mdPath)).toBe(true);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(yamlPath, 'utf8')).toContain('schema: forge-legacy-anchor/v1');
  });
});
