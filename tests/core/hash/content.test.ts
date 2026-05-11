import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeContentHash } from '../../../src/core/hash/index.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 创建带标准文件的临时 change 目录
function makeChangeDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forge-hash-test-'));
  writeFileSync(join(d, 'proposal.md'), '# P\n');
  writeFileSync(join(d, 'design.md'), '# D\n');
  writeFileSync(join(d, 'tasks.md'), '# T\n- [ ] t1: a\n');
  mkdirSync(join(d, 'specs'));
  writeFileSync(join(d, 'specs', 's1.md'), '# S\n');
  return d;
}

describe('computeContentHash', () => {
  it('produces deterministic hash across calls', async () => {
    const d = makeChangeDir();
    try {
      const a = await computeContentHash(d);
      const b = await computeContentHash(d);
      expect(a).toBe(b);
      expect(a).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('changes when proposal content changes', async () => {
    const d = makeChangeDir();
    try {
      const a = await computeContentHash(d);
      writeFileSync(join(d, 'proposal.md'), '# P modified\n');
      const b = await computeContentHash(d);
      expect(a).not.toBe(b);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('changes when adding a new spec file', async () => {
    const d = makeChangeDir();
    try {
      const a = await computeContentHash(d);
      writeFileSync(join(d, 'specs', 's2.md'), '# S2\n');
      const b = await computeContentHash(d);
      expect(a).not.toBe(b);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // P1 回归:嵌套 specs 必须进 hash(spec §3.4 文档要求 specs/**\/*.md)
  it('changes when adding a nested spec file (specs/auth/login.md)', async () => {
    const d = makeChangeDir();
    try {
      const a = await computeContentHash(d);
      mkdirSync(join(d, 'specs', 'auth'));
      writeFileSync(join(d, 'specs', 'auth', 'login.md'), '# Auth/Login\n');
      const b = await computeContentHash(d);
      expect(a).not.toBe(b);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // P1 回归:修改嵌套 spec 内容也必须改 hash(确保不只是路径进了 hash)
  it('changes when modifying a nested spec file', async () => {
    const d = makeChangeDir();
    try {
      mkdirSync(join(d, 'specs', 'auth'));
      writeFileSync(join(d, 'specs', 'auth', 'login.md'), '# initial\n');
      const a = await computeContentHash(d);
      writeFileSync(join(d, 'specs', 'auth', 'login.md'), '# modified\n');
      const b = await computeContentHash(d);
      expect(a).not.toBe(b);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

// plan-9b Task 3:按 anchor 剔除三段测试
describe('computeContentHash — anchor 剔除(plan-9b Task 3)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'forge-9b-hash-'));
    await writeFile(join(dir, 'tasks.md'), '# Tasks\n');
    await mkdir(join(dir, 'specs'));
    await writeFile(join(dir, 'specs', 'a.md'), '# A\n');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('proposal.md 带 forge-oos 段:只改该段 → hash 不变', async () => {
    const v1 = '# Title\n\n## Why\n\nW1\n\n## What\n\nC1\n\n## Out of Scope {#forge-oos}\n\nE1\n';
    const v2 =
      '# Title\n\n## Why\n\nW1\n\n## What\n\nC1\n\n## Out of Scope {#forge-oos}\n\nE2 changed\n';
    await writeFile(join(dir, 'proposal.md'), v1);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'proposal.md'), v2);
    const h2 = await computeContentHash(dir);
    expect(h1).toBe(h2);
  });

  it('proposal.md 改 What 段(无 anchor)→ hash 变', async () => {
    const v1 = '# Title\n\n## Why\n\nW1\n\n## What\n\nC1\n\n## Out of Scope {#forge-oos}\n\nE1\n';
    const v2 =
      '# Title\n\n## Why\n\nW1\n\n## What\n\nC2 changed\n\n## Out of Scope {#forge-oos}\n\nE1\n';
    await writeFile(join(dir, 'proposal.md'), v1);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'proposal.md'), v2);
    const h2 = await computeContentHash(dir);
    expect(h1).not.toBe(h2);
  });

  it('design.md 带 forge-future-work 段:只改该段 → hash 不变', async () => {
    const d1 = '# Design\n\n## Approach\n\nA1\n\n## Future Work {#forge-future-work}\n\nF1\n';
    const d2 =
      '# Design\n\n## Approach\n\nA1\n\n## Future Work {#forge-future-work}\n\nF2 changed\n';
    await writeFile(join(dir, 'proposal.md'), '# P\n## Why\n\nw\n\n## What\n\nc\n');
    await writeFile(join(dir, 'design.md'), d1);
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'design.md'), d2);
    const h2 = await computeContentHash(dir);
    expect(h1).toBe(h2);
  });

  it('改 anchor ID(forge-oos → oos)→ 段重新进 hash → hash 变', async () => {
    const v1 = '# P\n\n## Why\n\nw\n\n## What\n\nc\n\n## Out {#forge-oos}\n\nE\n';
    const v2 = '# P\n\n## Why\n\nw\n\n## What\n\nc\n\n## Out {#oos}\n\nE\n';
    await writeFile(join(dir, 'proposal.md'), v1);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'proposal.md'), v2);
    const h2 = await computeContentHash(dir);
    expect(h1).not.toBe(h2);
  });

  it('本地化标题 + 正确 anchor → 仍剔除', async () => {
    const v1 = '# P\n## Why\n\nw\n## What\n\nc\n\n## 不做项 {#forge-oos}\n\nE1\n';
    const v2 = '# P\n## Why\n\nw\n## What\n\nc\n\n## 不做项 {#forge-oos}\n\nE2 changed\n';
    await writeFile(join(dir, 'proposal.md'), v1);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'proposal.md'), v2);
    expect(await computeContentHash(dir)).toBe(h1);
  });

  it('forge-oos 段含 H3 子标题 → 子标题及内容也被剔除(v2 codex MAJOR 2 修订)', async () => {
    const v1 = [
      '# P',
      '## Why\n\nw',
      '## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      'top body',
      '',
      '### Sub Detail',
      '',
      'sub body v1',
      '',
      '## Next Section',
      '',
      'next body',
      '',
    ].join('\n');
    const v2 = v1.replace('sub body v1', 'sub body v2 changed');
    await writeFile(join(dir, 'proposal.md'), v1);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'proposal.md'), v2);
    expect(await computeContentHash(dir)).toBe(h1);
  });

  it('forge-oos 段后接 H1 → H1 不被剔除(剔除止于下一同级或更高级)', async () => {
    const text = [
      '# P',
      '## Why\n\nw',
      '## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      'oos body',
      '',
      '# New H1',
      '',
      'h1 body',
    ].join('\n');
    await writeFile(join(dir, 'proposal.md'), text);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'proposal.md'), text.replace('h1 body', 'h1 changed'));
    const h2 = await computeContentHash(dir);
    expect(h1).not.toBe(h2);
  });

  it('tasks.md / specs/*.md 内带 anchor → 不剔除(仅 proposal/design 走 anchor 剔除)', async () => {
    await writeFile(join(dir, 'proposal.md'), '# P\n## Why\n\nw\n## What\n\nc\n');
    await writeFile(join(dir, 'design.md'), '# Design\n');
    await writeFile(join(dir, 'tasks.md'), '# T\n\n## Out {#forge-oos}\n\nT1\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'tasks.md'), '# T\n\n## Out {#forge-oos}\n\nT2 changed\n');
    const h2 = await computeContentHash(dir);
    expect(h1).not.toBe(h2);
  });
});
