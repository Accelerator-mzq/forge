import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanArchivedFollowups } from '../../../src/core/scope/aggregator.js';

describe('scanArchivedFollowups (plan-9b Task 5)', () => {
  let forgeRoot: string;

  beforeEach(async () => {
    const tmpBase = await mkdtemp(join(tmpdir(), 'forge-scope-'));
    forgeRoot = tmpBase;
    await mkdir(join(forgeRoot, 'changes', 'archive'), { recursive: true });
  });

  afterEach(async () => {
    await rm(forgeRoot, { recursive: true, force: true });
  });

  // 辅助函数:创建 archived change 目录和文件
  async function makeArchive(
    id: string,
    proposalMd: string,
    designMd: string = '# Design\n',
  ): Promise<void> {
    const dir = join(forgeRoot, 'changes', 'archive', id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'proposal.md'), proposalMd);
    await writeFile(join(dir, 'design.md'), designMd);
  }

  it('case 1: 空 archive → 空 entries', async () => {
    const result = await scanArchivedFollowups(forgeRoot);
    expect(result.entries).toHaveLength(0);
  });

  it('case 2: 单 archived change 含 active entry → 收集', async () => {
    await makeArchive(
      '2026-05-01-a',
      [
        '# Proposal',
        '## Why',
        'Some reason',
        '## What',
        'Some change',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: foo',
        '    category: out-of-scope',
        '    description: test entry',
        '    reason: test reason',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );

    const result = await scanArchivedFollowups(forgeRoot);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry!.id).toBe('foo');
    expect(entry!.category).toBe('out-of-scope');
    expect(entry!.status).toBe('active');
    expect(entry!.source_change).toBe('2026-05-01-a');
  });

  it('case 3: archive A 写 entry + archive B 的 superseding_entries 标走 → 不收集', async () => {
    await makeArchive(
      'arch-a',
      [
        '# A',
        '## Why',
        'w',
        '## What',
        'c',
        '## Future Work {#forge-future-work}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-future-work',
        'entries:',
        '  - id: entry-xyz',
        '    category: future-work',
        '    description: item',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );

    await makeArchive(
      'arch-b',
      [
        '# B',
        '## Why',
        'w',
        '## What',
        'c',
        '## Future Work {#forge-future-work}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-future-work',
        'superseding_entries:',
        '  - source_change: arch-a',
        '    entry_id: entry-xyz',
        '    new_status: completed',
        '    rationale: done',
        '```',
      ].join('\n'),
    );

    const result = await scanArchivedFollowups(forgeRoot);
    expect(result.entries).toHaveLength(0);
  });

  it('case 4: 排序 future-work > out-of-scope > non-goal', async () => {
    // 三个不同 archive，各含不同 category，测试排序
    await makeArchive(
      'order-oos',
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
        '  - id: oos-entry',
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

    await makeArchive(
      'order-ng',
      [
        '# P',
        '## Why',
        'w',
        '## What',
        'c',
        '## Non-Goals {#forge-non-goals}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-non-goals',
        'entries:',
        '  - id: non-goal-entry',
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

    await makeArchive(
      'order-fw',
      [
        '# P',
        '## Why',
        'w',
        '## What',
        'c',
        '## Future Work {#forge-future-work}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-future-work',
        'entries:',
        '  - id: fw-entry',
        '    category: future-work',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );

    const result = await scanArchivedFollowups(forgeRoot);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]!.id).toBe('fw-entry');
    expect(result.entries[1]!.id).toBe('oos-entry');
    expect(result.entries[2]!.id).toBe('non-goal-entry');
  });

  it('case 5: 忽略 status != active', async () => {
    await makeArchive(
      'status-test',
      [
        '# P',
        '## Why',
        'w',
        '## What',
        'c',
        '## Future Work {#forge-future-work}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-future-work',
        'entries:',
        '  - id: active-entry',
        '    category: future-work',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '  - id: inherited-entry',
        '    category: future-work',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: inherited',
        '    triggered_by: null',
        '    related_change: null',
        '  - id: superseded-entry',
        '    category: future-work',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: superseded',
        '    triggered_by: null',
        '    related_change: null',
        '  - id: completed-entry',
        '    category: future-work',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: completed',
        '    triggered_by: null',
        '    related_change: null',
        '  - id: obsolete-entry',
        '    category: future-work',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: obsolete',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );

    const result = await scanArchivedFollowups(forgeRoot);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.id).toBe('active-entry');
  });

  it('case 6: archived yaml 块缺 schema 字段 → skip + stderr warning', async () => {
    await makeArchive(
      'no-schema-archive',
      [
        '# P',
        '## Why',
        'w',
        '## What',
        'c',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: orphan-entry',
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

    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr.write as unknown) = ((chunk: string | Buffer) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const result = await scanArchivedFollowups(forgeRoot);
      expect(result.entries).toHaveLength(0);
      const stderrMsg = stderrChunks.join('');
      expect(stderrMsg).toMatch(/skipping yaml block/);
      expect(stderrMsg).toMatch(/forge-scope-entries\/v1/);
    } finally {
      (process.stderr.write as unknown) = origWrite;
    }
  });

  it('case 7: archive 目录不存在 → throw with code ENOENT', async () => {
    const noArchDir = await mkdtemp(join(tmpdir(), 'forge-noarch-'));
    try {
      await expect(scanArchivedFollowups(noArchDir)).rejects.toThrow(/ENOENT|不存在/);
    } finally {
      await rm(noArchDir, { recursive: true, force: true });
    }
  });
});
