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

  it('case 6: archived yaml 块缺 schema 字段 → schema-mismatch 进 skipped[](plan-backlog-registry 行为变更)', async () => {
    // plan-backlog-registry Task 1:缺 schema 字段不再写 stderr,改为结构化 skipped[]
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

    const result = await scanArchivedFollowups(forgeRoot);
    expect(result.entries).toHaveLength(0);
    expect(result.skipped).toEqual([
      { change: 'no-schema-archive', file: 'proposal.md', reason: 'schema-mismatch' },
    ]);
  });

  it('case 7: archive 目录不存在 → throw with code ENOENT', async () => {
    const noArchDir = await mkdtemp(join(tmpdir(), 'forge-noarch-'));
    try {
      await expect(scanArchivedFollowups(noArchDir)).rejects.toThrow(/ENOENT|不存在/);
    } finally {
      await rm(noArchDir, { recursive: true, force: true });
    }
  });

  // ---- plan-backlog-registry Task 1 ----
  function ossBlock(entriesYaml: string, supersedingYaml = ''): string {
    return [
      '# Proposal',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      entriesYaml,
      supersedingYaml,
      '```',
      '',
    ].join('\n');
  }

  it('Task1: superseding 明细被保留(含 superseded_in_change / superseded_at / snapshot)', async () => {
    await makeArchive(
      '2026-05-01-a',
      ossBlock(
        'entries:\n  - {id: foo, category: out-of-scope, description: d, reason: r, priority: null, status: active, triggered_by: null, related_change: null}',
      ),
    );
    await makeArchive(
      '2026-05-09-b',
      ossBlock(
        'entries: []',
        'superseding_entries:\n  - {source_change: 2026-05-01-a, entry_id: foo, new_status: completed, rationale: done}',
      ),
    );
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.entries).toHaveLength(0);
    expect(r.superseding).toHaveLength(1);
    expect(r.superseding[0]!).toMatchObject({
      source_change: '2026-05-01-a',
      entry_id: 'foo',
      new_status: 'completed',
      superseded_in_change: '2026-05-09-b',
      superseded_at: '2026-05-09',
    });
    expect(r.superseding[0]!.registry_entry_snapshot?.id).toBe('foo');
  });

  it('Task1: new_status=active 的 superseding 不扣减(§9c 守卫),但仍进 superseding[]', async () => {
    await makeArchive(
      '2026-05-01-a',
      ossBlock(
        'entries:\n  - {id: foo, category: out-of-scope, description: d, reason: r, priority: null, status: active, triggered_by: null, related_change: null}',
      ),
    );
    await makeArchive(
      '2026-05-09-b',
      ossBlock(
        'entries: []',
        'superseding_entries:\n  - {source_change: 2026-05-01-a, entry_id: foo, new_status: active, rationale: bogus}',
      ),
    );
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.entries).toHaveLength(1);
    expect(r.superseding).toHaveLength(1);
    expect(r.superseding[0]!.new_status).toBe('active');
  });

  it('Task1: 坏 YAML 块进 skipped[](不再静默)', async () => {
    await makeArchive('2026-05-01-a', [
      '# Proposal',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'entries: [unclosed',
      '```',
    ].join('\n'));
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.skipped).toEqual([
      { change: '2026-05-01-a', file: 'proposal.md', reason: 'yaml-parse-error' },
    ]);
  });

  it('Task1 M-2: superseding ref 指向不存在的 entry_id → snapshot 为 null(悬空引用)', async () => {
    // 原 archived change 里没有该 entry,认领是悬空引用
    await makeArchive(
      '2026-05-01-a',
      ossBlock(
        'entries:\n  - {id: foo, category: out-of-scope, description: d, reason: r, priority: null, status: active, triggered_by: null, related_change: null}',
      ),
    );
    await makeArchive(
      '2026-05-09-b',
      ossBlock(
        'entries: []',
        'superseding_entries:\n  - {source_change: 2026-05-01-a, entry_id: ghost, new_status: completed, rationale: done}',
      ),
    );
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.superseding).toHaveLength(1);
    expect(r.superseding[0]!.entry_id).toBe('ghost');
    expect(r.superseding[0]!.registry_entry_snapshot).toBeNull();
  });

  it('Task1 M-3: scope 段内 YAML 块解析成非对象(标量)→ skipped[] reason=schema-mismatch', async () => {
    // fenced YAML 块内容是一个标量数字,非对象 → schema-mismatch 守卫
    await makeArchive('2026-05-01-a', [
      '# Proposal',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      '42',
      '```',
    ].join('\n'));
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.skipped).toEqual([
      { change: '2026-05-01-a', file: 'proposal.md', reason: 'schema-mismatch' },
    ]);
  });

  it('Task1 M-4: archived 目录名无 YYYY-MM-DD 前缀 → superseded_at 为 unknown', async () => {
    await makeArchive(
      '2026-05-01-a',
      ossBlock(
        'entries:\n  - {id: foo, category: out-of-scope, description: d, reason: r, priority: null, status: active, triggered_by: null, related_change: null}',
      ),
    );
    // 认领者目录名无日期前缀
    await makeArchive(
      'legacy-no-date',
      ossBlock(
        'entries: []',
        'superseding_entries:\n  - {source_change: 2026-05-01-a, entry_id: foo, new_status: completed, rationale: done}',
      ),
    );
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.superseding).toHaveLength(1);
    expect(r.superseding[0]!.superseded_in_change).toBe('legacy-no-date');
    expect(r.superseding[0]!.superseded_at).toBe('unknown');
  });
});
