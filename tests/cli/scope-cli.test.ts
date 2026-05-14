import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

describe('forge scope scan-archived-followups CLI (plan-9b Task 5)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'forge-scope-cli-'));
    await mkdir(join(projectRoot, 'forge', 'changes', 'archive'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('case 1: 空 archive → exit 0 + JSON {entries: []}', () => {
    const r = runCli(['scope', 'scan-archived-followups', 'new-change-id'], projectRoot);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.entries).toEqual([]);
  });

  it('case 2: archive 含 active entry → JSON 输出 + 含 source_change', async () => {
    const dir = join(projectRoot, 'forge', 'changes', 'archive', '2026-05-01-a');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'proposal.md'),
      [
        '# P',
        '## Why',
        'w',
        '## What',
        'c',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: foo',
        '    category: out-of-scope',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );
    await writeFile(join(dir, 'design.md'), '# D\n');

    const r = runCli(['scope', 'scan-archived-followups', 'new-id'], projectRoot);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].id).toBe('foo');
    expect(parsed.entries[0].source_change).toBe('2026-05-01-a');
  });

  it('case 3: legacy archive 缺 schema 字段 → exit 0 + entries 空 + stderr 含 "skipping yaml block"', async () => {
    const dir = join(projectRoot, 'forge', 'changes', 'archive', '2026-04-legacy-no-schema');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'proposal.md'),
      [
        '# Legacy P',
        '## Why',
        'w',
        '## What',
        'c',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: legacy-entry',
        '    category: out-of-scope',
        '    description: legacy',
        '    reason: legacy r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );
    await writeFile(join(dir, 'design.md'), '# D\n');

    const r = runCli(['scope', 'scan-archived-followups', 'new-id'], projectRoot);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).entries).toEqual([]);
    expect(r.stderr).toMatch(/skipping yaml block/);
  });

  it('case 4: archive 目录不存在 → exit 2 + stderr 含 ENOENT', async () => {
    const noArchRoot = await mkdtemp(join(tmpdir(), 'forge-9b-noarch-'));
    try {
      const r = runCli(['scope', 'scan-archived-followups', 'new-id'], noArchRoot);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toMatch(/ENOENT|不存在/);
    } finally {
      await rm(noArchRoot, { recursive: true, force: true });
    }
  });
});
