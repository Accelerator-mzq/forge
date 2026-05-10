// archive lock 测试 — Plan 3 Task 12
// 覆盖 4 case:happy path / LockHeldError / stale 清理 / release 幂等

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock, acquireLockByPath, LockHeldError } from '../../../src/core/archive/lock.js';

// —— helper:创建含 .cache/ 的 forgeRoot 临时目录 ——
function setupForgeRoot(): { forgeRoot: string; lockPath: string; cleanup: () => void } {
  const tmp = mkdtempSync(join(tmpdir(), 'forge-lock-'));
  // .cache/ 必须预先存在(lock 文件放在这里)
  mkdirSync(join(tmp, '.cache'), { recursive: true });
  return {
    forgeRoot: tmp,
    lockPath: join(tmp, '.cache', 'archive.lock'),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

describe('acquireLock — O_CREAT|O_EXCL lock with stale pid detection', () => {
  // —— case 1:happy path — acquire 成功,release 后 lock 文件消失 ——
  it('happy path:acquire 成功 + release 后 .cache/archive.lock 被清理', async () => {
    const { forgeRoot, lockPath, cleanup } = setupForgeRoot();
    try {
      const release = await acquireLock(forgeRoot, 'archive');

      // lock 文件已创建
      expect(existsSync(lockPath)).toBe(true);

      // release lock
      await release();

      // lock 文件已被删除
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      cleanup();
    }
  });

  // —— case 2:lock 被活进程持有 → 抛 LockHeldError ——
  it('活进程持有 lock:第二次 acquire 抛 LockHeldError', async () => {
    const { forgeRoot, lockPath, cleanup } = setupForgeRoot();
    try {
      // 写一个假 lock 文件,pid 用自身进程(process.pid),模拟活进程持有
      const lockData = {
        pid: process.pid, // 当前进程还活着
        started_at: new Date().toISOString(),
        mode: 'archive',
      };
      writeFileSync(lockPath, JSON.stringify(lockData, null, 2), 'utf8');

      // 尝试 acquire 应该抛 LockHeldError
      await expect(acquireLock(forgeRoot, 'archive')).rejects.toThrow(LockHeldError);

      // 验证 error 的 holder 属性
      let caughtError: unknown;
      try {
        await acquireLock(forgeRoot, 'archive');
      } catch (err) {
        caughtError = err;
      }
      expect(caughtError).toBeInstanceOf(LockHeldError);
      expect((caughtError as LockHeldError).holder.pid).toBe(process.pid);
      expect((caughtError as LockHeldError).holder.mode).toBe('archive');
    } finally {
      cleanup();
    }
  });

  // —— case 3:stale lock(pid 不存在)→ 自动清理 + 重新 acquire 成功 ——
  it('stale lock(pid 不存活):自动清理后 acquire 成功', async () => {
    const { forgeRoot, lockPath, cleanup } = setupForgeRoot();
    try {
      // 写含不存在 pid 的 stale lock 文件
      const staleLockData = {
        pid: 99999999, // 几乎不可能存在的 pid
        started_at: '2020-01-01T00:00:00.000Z',
        mode: 'archive',
      };
      writeFileSync(lockPath, JSON.stringify(staleLockData, null, 2), 'utf8');

      // acquire 应该成功(自动清理 stale lock)
      const release = await acquireLock(forgeRoot, 'archive');

      // lock 文件存在,但现在是当前进程持有的
      expect(existsSync(lockPath)).toBe(true);

      // 验证 lock 内容是当前进程的 pid,而非 stale pid
      const lockContent = JSON.parse(require('node:fs').readFileSync(lockPath, 'utf8')) as {
        pid: number;
        mode: string;
      };
      expect(lockContent.pid).toBe(process.pid);
      expect(lockContent.mode).toBe('archive');

      // 清理
      await release();
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      cleanup();
    }
  });

  // —— case 4:release 是幂等的 — 多次 release 不抛错 ——
  it('release 幂等:release 后再次 release 不抛错', async () => {
    const { forgeRoot, lockPath, cleanup } = setupForgeRoot();
    try {
      const release = await acquireLock(forgeRoot, 'recover');

      // 第一次 release
      await release();
      expect(existsSync(lockPath)).toBe(false);

      // 第二次 release — 不应抛错
      await expect(release()).resolves.toBeUndefined();

      // 第三次 release — 同样安全
      await expect(release()).resolves.toBeUndefined();
    } finally {
      cleanup();
    }
  });

  // —— case 5:P2.1 修复 — fresh clone 时 .cache/ 不存在 → acquireLock 不抛 ENOENT ——
  it('P2.1:fresh tmpdir 不预创建 .cache/ → acquireLock 自动 mkdir,正常获取并 release', async () => {
    // 创建一个全新 tmpdir,不调用 setupForgeRoot(不预创建 .cache/)
    const forgeRoot = mkdtempSync(join(tmpdir(), 'forge-lock-fresh-'));
    const lockPath = join(forgeRoot, '.cache', 'archive.lock');
    try {
      // 验证 .cache/ 确实不存在
      expect(existsSync(join(forgeRoot, '.cache'))).toBe(false);

      // acquireLock 应该自动创建 .cache/ 目录,不抛 ENOENT
      const release = await acquireLock(forgeRoot, 'archive');

      // lock 文件已创建
      expect(existsSync(lockPath)).toBe(true);

      // release lock
      await release();

      // lock 文件已被删除
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      rmSync(forgeRoot, { recursive: true, force: true });
    }
  });
});

describe('lock - legacy-bridge mode 扩展(决策 #23)', () => {
  it('acquireLockByPath 用 legacy-bridge.lock 文件名', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-lb-lock-'));
    try {
      const release = await acquireLockByPath(d, 'legacy-bridge-regenerate', 'legacy-bridge.lock');
      expect(existsSync(join(d, '.cache', 'legacy-bridge.lock'))).toBe(true);
      const data = JSON.parse(await readFile(join(d, '.cache', 'legacy-bridge.lock'), 'utf8'));
      expect(data.mode).toBe('legacy-bridge-regenerate');
      await release();
      expect(existsSync(join(d, '.cache', 'legacy-bridge.lock'))).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('archive.lock 与 legacy-bridge.lock 互不影响', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-mix-lock-'));
    try {
      const releaseA = await acquireLockByPath(d, 'archive', 'archive.lock');
      const releaseB = await acquireLockByPath(d, 'legacy-bridge-map', 'legacy-bridge.lock');
      expect(existsSync(join(d, '.cache', 'archive.lock'))).toBe(true);
      expect(existsSync(join(d, '.cache', 'legacy-bridge.lock'))).toBe(true);
      await releaseA();
      await releaseB();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('legacy-bridge.lock 已被持有 → 抛 LockHeldError', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-lb-held-'));
    try {
      const release = await acquireLockByPath(d, 'legacy-bridge-regenerate', 'legacy-bridge.lock');
      await expect(
        acquireLockByPath(d, 'legacy-bridge-index', 'legacy-bridge.lock'),
      ).rejects.toThrow(/another forge archive is in progress.*legacy-bridge-regenerate/);
      await release();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

// Plan 8a Task 1.1:'migrate' mode 测试
describe("acquireLockByPath - 'migrate' mode", () => {
  it('acquires migrate lock with custom file name', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-lock-migrate-'));
    const release = await acquireLockByPath(tmp, 'migrate', 'migrate.lock');
    const lockPath = join(tmp, '.cache', 'migrate.lock');
    expect(existsSync(lockPath)).toBe(true);
    const data = JSON.parse(await readFile(lockPath, 'utf8'));
    expect(data.mode).toBe('migrate');
    await release();
    expect(existsSync(lockPath)).toBe(false);
    await rm(tmp, { recursive: true, force: true });
  });

  it("LockHeldError 文案保持兼容(不写 'operation',保留 'archive')", async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-lock-migrate-busy-'));
    const release = await acquireLockByPath(tmp, 'migrate', 'migrate.lock');
    await expect(acquireLockByPath(tmp, 'migrate', 'migrate.lock')).rejects.toThrow(
      /another forge archive is in progress.*mode migrate/,
    );
    await release();
    await rm(tmp, { recursive: true, force: true });
  });
});
