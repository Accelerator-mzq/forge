// mapper.ts 单测 — Plan 7 Phase D Task D1
// 覆盖:happy / 自定义 docsPaths / --merge / 解析失败 fallback / 空 docs / 落盘 / skip 目录

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMapper, writeMapperDraft, type MapperClient } from '../../../src/core/legacy-bridge/mapper.js';
import { parse as parseYaml } from 'yaml';
import type { LegacyAnchorsFile } from '../../../src/core/legacy-bridge/types.js';

function makeMockMapper(jsonText: string): MapperClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: jsonText }],
      }) as never,
    },
  };
}

describe('legacy-bridge/mapper', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-mapper-'));
    mkdirSync(join(tmp, 'docs'), { recursive: true });
    writeFileSync(join(tmp, 'docs', 'SRS.md'), '# 需求规格说明书\n## 1. 概述');
    writeFileSync(join(tmp, 'docs', 'HLD.md'), '# 概要设计\n## 1. 架构');
    writeFileSync(join(tmp, 'docs', 'README.md'), '# 项目说明');
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('happy path:LLM 返 3 个分类 → newAnchors / unmatched 正确', async () => {
    const mock = makeMockMapper(
      JSON.stringify([
        { path: 'docs/SRS.md', role: 'requirements', modules: ['payment'] },
        { path: 'docs/HLD.md', role: 'high-level-design' },
        { path: 'docs/README.md', role: 'unmatched' },
      ]),
    );
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'overwrite' });
    expect(r.newAnchors).toHaveLength(2);
    expect(r.newAnchors[0]?.role).toBe('requirements');
    expect(r.newAnchors[0]?.authoritative).toBe(true);
    expect(r.unmatched).toEqual(['docs/README.md']);
  });

  it('docsPaths 自定义路径 → 仅扫指定目录', async () => {
    mkdirSync(join(tmp, 'specifications'), { recursive: true });
    writeFileSync(join(tmp, 'specifications', 'spec.md'), '# spec');
    const mock = makeMockMapper(
      JSON.stringify([{ path: 'specifications/spec.md', role: 'requirements' }]),
    );
    const r = await runMapper(mock, {
      projectRoot: tmp,
      docsPaths: ['specifications'],
      mode: 'overwrite',
    });
    const yaml = parseYaml(r.draftYaml) as LegacyAnchorsFile;
    expect(yaml.anchors[0]?.path).toBe('specifications/spec.md');
  });

  it('--merge 模式:保留 existing anchors,跳过 path 重复', async () => {
    const existing: LegacyAnchorsFile = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        { role: 'requirements', path: 'docs/SRS.md', authoritative: true, modules: ['user-edited'] },
      ],
    };
    const mock = makeMockMapper(
      JSON.stringify([
        { path: 'docs/SRS.md', role: 'requirements' }, // 已存在 — 应保留 user-edited
        { path: 'docs/HLD.md', role: 'high-level-design' }, // 新增
      ]),
    );
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'merge', existing });
    expect(r.preservedAnchors).toHaveLength(1);
    expect(r.preservedAnchors[0]?.modules).toEqual(['user-edited']);
    expect(r.newAnchors).toHaveLength(1);
    expect(r.newAnchors[0]?.path).toBe('docs/HLD.md');
  });

  it('LLM 输出非 JSON → fallback 全 unmatched(不阻塞)', async () => {
    const mock = makeMockMapper('not json');
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'overwrite' });
    expect(r.newAnchors).toHaveLength(0);
    expect(r.unmatched.length).toBeGreaterThan(0);
  });

  it('docs 目录不存在 → 空 newAnchors,无错', async () => {
    rmSync(join(tmp, 'docs'), { recursive: true });
    const mock = makeMockMapper('[]');
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'overwrite' });
    expect(r.newAnchors).toHaveLength(0);
  });

  it('writeMapperDraft 落盘 yaml + md', async () => {
    mkdirSync(join(tmp, 'forge'), { recursive: true });
    const mock = makeMockMapper(
      JSON.stringify([{ path: 'docs/SRS.md', role: 'requirements' }]),
    );
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'overwrite' });
    const { yamlPath, mdPath } = await writeMapperDraft(join(tmp, 'forge'), r);
    const { readFileSync, existsSync } = await import('node:fs');
    expect(existsSync(yamlPath)).toBe(true);
    expect(existsSync(mdPath)).toBe(true);
    expect(readFileSync(yamlPath, 'utf8')).toContain('schema: forge-legacy-anchor/v1');
  });

  it('skip node_modules / .git / forge / dist', async () => {
    mkdirSync(join(tmp, 'node_modules'), { recursive: true });
    writeFileSync(join(tmp, 'node_modules', 'should-skip.md'), '# vendor');
    mkdirSync(join(tmp, 'forge'), { recursive: true });
    writeFileSync(join(tmp, 'forge', 'config.yaml'), 'schema: x');
    const mock = makeMockMapper(JSON.stringify([{ path: 'docs/SRS.md', role: 'requirements' }]));
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'overwrite' });
    const yaml = parseYaml(r.draftYaml) as LegacyAnchorsFile;
    expect(yaml.anchors.every((a) => !a.path.includes('node_modules'))).toBe(true);
    expect(yaml.anchors.every((a) => !a.path.startsWith('forge/'))).toBe(true);
  });
});
