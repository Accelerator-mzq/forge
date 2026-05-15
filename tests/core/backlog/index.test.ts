import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateBacklog, checkBacklogStale } from '../../../src/core/backlog/index.js';

describe('generateBacklog (plan-backlog-registry Task 5)', () => {
  let forgeRoot: string;
  beforeEach(async () => {
    forgeRoot = await mkdtemp(join(tmpdir(), 'forge-backlog-'));
    await mkdir(join(forgeRoot, 'changes', 'archive'), { recursive: true });
  });
  afterEach(async () => {
    await rm(forgeRoot, { recursive: true, force: true });
  });

  it('空 archive:写出 active.md / archived.md / README.md', async () => {
    const r = await generateBacklog(forgeRoot);
    expect(r.openCount).toBe(0);
    const active = await readFile(join(forgeRoot, 'backlog', 'active.md'), 'utf8');
    expect(active).toContain('# Active Backlog');
    await stat(join(forgeRoot, 'backlog', 'archived.md'));
    await stat(join(forgeRoot, 'backlog', 'README.md'));
  });

  it('README.md 已存在则不覆盖', async () => {
    await mkdir(join(forgeRoot, 'backlog'), { recursive: true });
    await writeFile(join(forgeRoot, 'backlog', 'README.md'), 'CUSTOM');
    await generateBacklog(forgeRoot);
    expect(await readFile(join(forgeRoot, 'backlog', 'README.md'), 'utf8')).toBe('CUSTOM');
  });

  it('checkBacklogStale:磁盘缺文件 → 报两文件陈旧;generateBacklog 后 → 一致', async () => {
    expect((await checkBacklogStale(forgeRoot)).sort()).toEqual(['active.md', 'archived.md']);
    await generateBacklog(forgeRoot);
    expect(await checkBacklogStale(forgeRoot)).toEqual([]);
  });
});
