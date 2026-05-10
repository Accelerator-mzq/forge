// tests/migrate/conflict.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveConflicts,
  ConflictExhausted,
  findFreeImportedSlot,
} from '../../src/core/migrate/conflict.js';
import type { CopyOp } from '../../src/core/migrate/types.js';

describe('resolveConflicts — plan 阶段全锁定', () => {
  it('目标不存在 → 不动', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-conflict-'));
    const ops: CopyOp[] = [
      {
        source: '/x/a.md',
        target: join(tmp, 'forge/changes/add-bar/proposal.md'),
        kind: 'proposal',
      },
    ];
    const r = await resolveConflicts(ops, { force: false });
    expect(r.ops[0]?.target).toBe(ops[0]?.target);
    expect(r.conflicts).toHaveLength(0);
    await rm(tmp, { recursive: true, force: true });
  });

  it('目标存在 → 改名加 --imported 后缀', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-conflict-'));
    await mkdir(join(tmp, 'forge/changes/add-bar'), { recursive: true });
    await writeFile(join(tmp, 'forge/changes/add-bar/proposal.md'), 'old');
    const ops: CopyOp[] = [
      {
        source: '/x/a.md',
        target: join(tmp, 'forge/changes/add-bar/proposal.md'),
        kind: 'proposal',
      },
    ];
    const r = await resolveConflicts(ops, { force: false });
    expect(r.ops[0]?.target).toContain('add-bar--imported');
    expect(r.conflicts).toHaveLength(1);
    await rm(tmp, { recursive: true, force: true });
  });

  it('--imported 也撞 → --imported-2', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-conflict-'));
    await mkdir(join(tmp, 'forge/changes/add-bar'), { recursive: true });
    await writeFile(join(tmp, 'forge/changes/add-bar/proposal.md'), 'a');
    await mkdir(join(tmp, 'forge/changes/add-bar--imported'), { recursive: true });
    await writeFile(join(tmp, 'forge/changes/add-bar--imported/proposal.md'), 'b');
    const ops: CopyOp[] = [
      {
        source: '/x/a.md',
        target: join(tmp, 'forge/changes/add-bar/proposal.md'),
        kind: 'proposal',
      },
    ];
    const r = await resolveConflicts(ops, { force: false });
    expect(r.ops[0]?.target).toContain('add-bar--imported-2');
    await rm(tmp, { recursive: true, force: true });
  });

  it('plan 内多 op 抢同 imported → reservedTargets 防重', async () => {
    // 两个 op 都要写 add-bar/proposal.md(假设场景:同 plan 内重复 slug)
    // 第一个用 --imported,第二个不会再用 --imported(已 reserved)→ 用 --imported-2
    const tmp = await mkdtemp(join(tmpdir(), 'forge-conflict-multi-'));
    await mkdir(join(tmp, 'forge/changes/add-bar'), { recursive: true });
    await writeFile(join(tmp, 'forge/changes/add-bar/proposal.md'), 'orig');
    const ops: CopyOp[] = [
      {
        source: '/x/a.md',
        target: join(tmp, 'forge/changes/add-bar/proposal.md'),
        kind: 'proposal',
      },
      {
        source: '/x/b.md',
        target: join(tmp, 'forge/changes/add-bar/proposal.md'),
        kind: 'proposal',
      },
    ];
    const r = await resolveConflicts(ops, { force: false });
    expect(r.ops[0]?.target).toContain('add-bar--imported');
    expect(r.ops[1]?.target).toContain('add-bar--imported-2');
    expect(r.ops[0]?.target).not.toBe(r.ops[1]?.target);
    await rm(tmp, { recursive: true, force: true });
  });

  it('--force 模式 → 旧目标 mv 到 .forge-trash/<ts>/', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-conflict-force-'));
    await mkdir(join(tmp, 'forge/changes/add-bar'), { recursive: true });
    await writeFile(join(tmp, 'forge/changes/add-bar/proposal.md'), 'old');
    await mkdir(join(tmp, 'forge/.forge-trash'), { recursive: true });
    const ops: CopyOp[] = [
      {
        source: '/x/a.md',
        target: join(tmp, 'forge/changes/add-bar/proposal.md'),
        kind: 'proposal',
      },
    ];
    const r = await resolveConflicts(ops, {
      force: true,
      forgeRoot: join(tmp, 'forge'),
      ts: 'fixed-ts',
    });
    expect(r.ops[0]?.target).toBe(ops[0]?.target); // 目标路径不变
    expect(r.trashEntries).toHaveLength(1);
    expect(r.trashEntries[0]?.trashed).toContain('fixed-ts');
    // 旧文件已不在原位
    expect(existsSync(ops[0]!.target)).toBe(false);
    // 旧文件 内容 在 trash
    expect(await readFile(r.trashEntries[0]!.trashed, 'utf8')).toBe('old');
    await rm(tmp, { recursive: true, force: true });
  });

  it('ConflictExhausted at 99 — 用 mock 验证 throw 类型', async () => {
    // 实际 99 次 mkdir 太慢;改用 mock fs(此处简化:用 mock 通过 internal MAX_IMPORTED 测略过)
    // 改为:测 ConflictExhausted 类是 export,name='ConflictExhausted',target 字段保留
    const e = new ConflictExhausted('/some/target');
    expect(e.name).toBe('ConflictExhausted');
    expect(e.target).toBe('/some/target');
    expect(e.message).toContain('全占');
  });
});

// I-4:findFreeImportedSlot 导出后测真实 ConflictExhausted 触发路径
// 传 maxImported=2 避免 99 次 mkdir,精确测 throw 上限逻辑
describe('findFreeImportedSlot — export + maxImported 参数', () => {
  it('maxImported=2 + 2 个 slot 全占 → throw ConflictExhausted', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-exhaust-'));
    try {
      // slot 1(--imported) + slot 2(--imported-2) 均已存在
      await mkdir(join(tmp, 'forge/changes/add-bar'), { recursive: true });
      await writeFile(join(tmp, 'forge/changes/add-bar/proposal.md'), 'a');
      await mkdir(join(tmp, 'forge/changes/add-bar--imported'), { recursive: true });
      await writeFile(join(tmp, 'forge/changes/add-bar--imported/proposal.md'), 'b');
      await mkdir(join(tmp, 'forge/changes/add-bar--imported-2'), { recursive: true });
      await writeFile(join(tmp, 'forge/changes/add-bar--imported-2/proposal.md'), 'c');

      const target = join(tmp, 'forge/changes/add-bar/proposal.md');
      // maxImported=2:N=1 和 N=2 都在磁盘 → 触发 ConflictExhausted
      expect(() => findFreeImportedSlot(target, new Set(), 2)).toThrow(ConflictExhausted);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('maxImported=2 + 只有 slot 1 占 → 返回 slot 2 路径(不 throw)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-exhaust-'));
    try {
      await mkdir(join(tmp, 'forge/changes/add-bar'), { recursive: true });
      await writeFile(join(tmp, 'forge/changes/add-bar/proposal.md'), 'a');
      await mkdir(join(tmp, 'forge/changes/add-bar--imported'), { recursive: true });
      await writeFile(join(tmp, 'forge/changes/add-bar--imported/proposal.md'), 'b');
      // slot 2(--imported-2)尚未存在 → 应返回该路径

      const target = join(tmp, 'forge/changes/add-bar/proposal.md');
      const result = findFreeImportedSlot(target, new Set(), 2);
      expect(result).toContain('add-bar--imported-2');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
