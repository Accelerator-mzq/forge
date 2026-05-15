import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildBacklog,
  generateBacklog,
  checkBacklogStale,
} from '../../../src/core/backlog/index.js';

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

  it('buildBacklog:非空 archive → openCount 只计 future-work + out-of-scope(non-goal 不计入)', async () => {
    // 造一个 archived change,proposal.md 含一个 scope-entries YAML 块:
    // 1 个 future-work + 1 个 out-of-scope + 1 个 non-goal,均 status=active。
    // openCount 应为 2 —— non-goal 不计入待办(验计数口径未写反)。
    const dir = join(forgeRoot, 'changes', 'archive', '2026-05-10-mix');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'proposal.md'),
      [
        '# Proposal',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: fw-1',
        '    category: future-work',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '  - id: oos-1',
        '    category: out-of-scope',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '  - id: ng-1',
        '    category: non-goal',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );
    await writeFile(join(dir, 'design.md'), '# Design\n');

    const r = await buildBacklog(forgeRoot);
    expect(r.openCount).toBe(2);
  });
});
