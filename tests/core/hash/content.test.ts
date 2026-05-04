import { describe, it, expect } from 'vitest';
import { computeContentHash } from '../../../src/core/hash/index.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
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
