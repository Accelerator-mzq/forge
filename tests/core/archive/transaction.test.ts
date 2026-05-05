// archive transaction 测试 — Plan 3 Task 11
// 覆盖:happy path / Move 失败 / Sync 失败回滚 / backup 成功后清理

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// —— mock specs-sync:让 case 3 可以模拟 applyDeltas 失败 ——
// 注意:vi.mock 必须在 import 之前,vitest 会提升它
vi.mock('../../../src/core/specs-sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/specs-sync/index.js')>();
  return {
    ...actual,
    // applyDeltas 默认使用真实实现;case 3 通过 vi.spyOn 覆盖
    applyDeltas: actual.applyDeltas,
  };
});

import { archiveTransaction } from '../../../src/core/archive/transaction.js';
import * as specsSync from '../../../src/core/specs-sync/index.js';

// —— helper:创建标准 forge 目录结构 ——
function setupForgeRoot(
  changeId: string,
  specsContent: Record<string, string> = {},
): {
  forgeRoot: string;
  changeDir: string;
  cleanup: () => void;
} {
  const tmp = mkdtempSync(join(tmpdir(), 'forge-archive-tx-'));

  // forge/changes/<id>/
  const changeDir = join(tmp, 'changes', changeId);
  mkdirSync(changeDir, { recursive: true });

  // forge/changes/<id>/specs/
  const changeSpecsDir = join(changeDir, 'specs');
  mkdirSync(changeSpecsDir, { recursive: true });

  // 默认写一个 spec 文件
  if (Object.keys(specsContent).length === 0) {
    writeFileSync(
      join(changeSpecsDir, 'auth.md'),
      '# Auth Spec\n\n## Scenario: login\n\n**Given** user\n**When** login\n**Then** ok\n',
    );
  } else {
    for (const [name, content] of Object.entries(specsContent)) {
      writeFileSync(join(changeSpecsDir, name), content);
    }
  }

  // forge/specs/(当前 specs 目录,初始为空)
  const currentSpecsDir = join(tmp, 'specs');
  mkdirSync(currentSpecsDir, { recursive: true });

  return {
    forgeRoot: tmp,
    changeDir,
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

describe('archiveTransaction — Move→Sync 顺序原子化(spec §3.5)', () => {
  // 每个 case 后恢复 spy
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // —— case 1:happy path — Move + Sync 都成功 ——
  it('happy path:changes/<id>/ 归档 + forge/specs/ 应用 deltas', async () => {
    const changeId = 'add-login';
    const archiveDate = '2026-05-04';
    const { forgeRoot, changeDir, cleanup } = setupForgeRoot(changeId);
    try {
      await archiveTransaction({ forgeRoot, changeId, archiveDate });

      // changes/<id>/ 不再存在
      expect(existsSync(changeDir)).toBe(false);

      // archive/<date>-<id>/ 存在
      const archivedDir = join(forgeRoot, 'changes', 'archive', `${archiveDate}-${changeId}`);
      expect(existsSync(archivedDir)).toBe(true);

      // forge/specs/ 已应用 delta:auth.md 被写入
      const specsDir = join(forgeRoot, 'specs');
      const specFile = join(specsDir, 'auth.md');
      expect(existsSync(specFile)).toBe(true);
      expect(readFileSync(specFile, 'utf8')).toContain('Auth Spec');
    } finally {
      cleanup();
    }
  });

  // —— case 2:Move 失败 — 目标 archive/<date>-<id>/ 已存在 ——
  it('Move 失败:changes/<id>/ 仍在原位 + forge/specs/ 零变化', async () => {
    const changeId = 'add-login';
    const archiveDate = '2026-05-04';
    const { forgeRoot, changeDir, cleanup } = setupForgeRoot(changeId);
    try {
      // 预先创建目标目录,让 rename 失败
      const archiveTargetDir = join(forgeRoot, 'changes', 'archive', `${archiveDate}-${changeId}`);
      mkdirSync(archiveTargetDir, { recursive: true });
      writeFileSync(join(archiveTargetDir, 'existing.txt'), 'conflict');

      // 预设 forge/specs/ 内容
      const specsDir = join(forgeRoot, 'specs');
      writeFileSync(join(specsDir, 'pre-existing.md'), '# Pre-existing\n');

      await expect(archiveTransaction({ forgeRoot, changeId, archiveDate })).rejects.toThrow();

      // changes/<id>/ 仍然存在(没被移走)
      expect(existsSync(changeDir)).toBe(true);

      // forge/specs/ 没被修改(pre-existing.md 还在,没新增)
      const entries = readdirSync(specsDir);
      expect(entries).toContain('pre-existing.md');
      expect(entries).toHaveLength(1); // 只有 pre-existing.md,没有 auth.md
    } finally {
      cleanup();
    }
  });

  // —— case 3:Sync 失败 — applyDeltas 抛错 → 回滚 ——
  it('Sync 失败:forge/specs/ 从 backup 恢复 + archive/<date>-<id>/ 反向 rename 回 changes/<id>/', async () => {
    const changeId = 'add-login';
    const archiveDate = '2026-05-04';
    const { forgeRoot, changeDir, cleanup } = setupForgeRoot(changeId);
    try {
      // 在 forge/specs/ 放一个预有文件(回滚后应该还在)
      const specsDir = join(forgeRoot, 'specs');
      writeFileSync(join(specsDir, 'existing-spec.md'), '# Existing\n');

      // mock applyDeltas 在这个 case 抛错
      vi.spyOn(specsSync, 'applyDeltas').mockRejectedValueOnce(new Error('disk full (simulated)'));

      // 期望 archiveTransaction 抛"Sync failed and rolled back"
      await expect(archiveTransaction({ forgeRoot, changeId, archiveDate })).rejects.toThrow(
        'Sync failed and rolled back',
      );

      // 回滚验证:changes/<id>/ 应该回来
      expect(existsSync(changeDir)).toBe(true);

      // 回滚验证:archive/<date>-<id>/ 不应该存在
      const archivedDir = join(forgeRoot, 'changes', 'archive', `${archiveDate}-${changeId}`);
      expect(existsSync(archivedDir)).toBe(false);

      // 回滚验证:forge/specs/ 从 backup 恢复 — existing-spec.md 仍在
      expect(existsSync(join(specsDir, 'existing-spec.md'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  // —— case 4:backup 在 happy path 后被清理 ——
  it('成功归档后 .cache/archive-sync-backup-* 已被清理', async () => {
    const changeId = 'cleanup-test';
    const archiveDate = '2026-05-04';
    const { forgeRoot, cleanup } = setupForgeRoot(changeId);
    try {
      await archiveTransaction({ forgeRoot, changeId, archiveDate });

      // .cache/ 下不应有 archive-sync-backup-* 目录
      const cacheDir = join(forgeRoot, '.cache');
      if (existsSync(cacheDir)) {
        const entries = readdirSync(cacheDir);
        const backups = entries.filter((e) => e.startsWith('archive-sync-backup-'));
        expect(backups).toHaveLength(0);
      }
      // 若 cacheDir 不存在,说明完全没创建 backup(也算成功)
    } finally {
      cleanup();
    }
  });

  // —— P2.3 专项:Sync 失败 + 回滚成功 → error message 含 "rolled back" 不含 "AND rollback failed" ——
  // 验证 rolledBack flag 模式的正确性(不被 inner catch 误捕获)
  it('P2.3:Sync 失败 + 回滚成功 → error 含 "rolled back" 不含 "AND rollback failed"', async () => {
    const changeId = 'p23-test';
    const archiveDate = '2026-05-04';
    const { forgeRoot, cleanup } = setupForgeRoot(changeId);
    try {
      // mock applyDeltas 抛错 → 触发回滚
      vi.spyOn(specsSync, 'applyDeltas').mockRejectedValueOnce(new Error('simulated sync failure'));

      let caughtError: Error | null = null;
      try {
        await archiveTransaction({ forgeRoot, changeId, archiveDate });
      } catch (e) {
        caughtError = e as Error;
      }

      // 必须抛出错误
      expect(caughtError).not.toBeNull();

      // error message 必须含 "rolled back"
      expect(caughtError!.message).toContain('rolled back');

      // error message 不能含 "AND rollback failed"(否则说明 rolledBack flag 逻辑有误)
      expect(caughtError!.message).not.toContain('AND rollback failed');
    } finally {
      cleanup();
    }
  });

  // —— P2.2 专项:backup 阶段失败 → specs 未被修改 + change 目录已恢复 ——
  // 通过在 backupDir 路径预建一个普通文件来让 cp(dir→file) 失败,触发 Backup 失败路径
  it('P2.2:backup 阶段 cp 抛错 → throw "Backup failed" + specs 未变 + change 目录恢复', async () => {
    const changeId = 'p22-backup-fail';
    const archiveDate = '2026-05-04';
    const { forgeRoot, changeDir, cleanup } = setupForgeRoot(changeId);
    try {
      // 在 forge/specs/ 放预有文件,验证 backup 失败时 specs 未被修改
      const specsDir = join(forgeRoot, 'specs');
      writeFileSync(join(specsDir, 'existing-spec.md'), '# Existing Spec\n');

      // 记录 specs 目录原始内容
      const specsBefore = readdirSync(specsDir).sort();

      // 预先在 backupDir 路径创建一个普通文件(而非目录)
      // cp(currentSpecsDir, backupDir, { recursive: true }) 试图将目录 copy 到已有文件路径 → 会失败
      const cacheDir = join(forgeRoot, '.cache');
      mkdirSync(cacheDir, { recursive: true });
      // backupDir 用 process.pid,与 transaction.ts 中保持一致
      const backupDir = join(cacheDir, `archive-sync-backup-${process.pid}`);
      // 预建为普通文件:cp 将目录拷贝到此路径时会遇到 EEXIST/ENOTDIR 类错误
      writeFileSync(backupDir, 'blocker', 'utf8');

      let caughtError: Error | null = null;
      try {
        await archiveTransaction({ forgeRoot, changeId, archiveDate });
      } catch (e) {
        caughtError = e as Error;
      }

      // 1. 应该抛出包含 "Backup failed" 的错误
      expect(caughtError).not.toBeNull();
      expect(caughtError!.message).toContain('Backup failed');

      // 2. forge/specs/ 未被修改(内容不变)
      const specsAfter = readdirSync(specsDir).sort();
      expect(specsAfter).toEqual(specsBefore);

      // 3. forge/changes/<id>/ 已恢复(反向 rename 成功)
      expect(existsSync(changeDir)).toBe(true);

      // 4. archive 目标目录不应存在(已被反向 rename 恢复)
      const archivedDir = join(forgeRoot, 'changes', 'archive', `${archiveDate}-${changeId}`);
      expect(existsSync(archivedDir)).toBe(false);
    } finally {
      cleanup();
    }
  });
});
