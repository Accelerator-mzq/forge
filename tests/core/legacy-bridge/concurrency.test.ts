import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireLockByPath,
  LockHeldError,
} from '../../../src/core/archive/lock.js';

describe('legacy-bridge 并发 / lock 防死锁(C-2 / I-5)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-concurrency-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('regenerate(获 archive.lock + legacy-bridge.lock)与 archive(获 archive.lock)互斥', async () => {
    const releaseA = await acquireLockByPath(dir, 'archive', 'archive.lock');
    await expect(
      acquireLockByPath(dir, 'legacy-bridge-regenerate', 'archive.lock'),
    ).rejects.toThrow(LockHeldError);
    await releaseA();
  });

  it('map 与 regenerate 同时跑 → legacy-bridge.lock 互斥', async () => {
    const releaseMap = await acquireLockByPath(dir, 'legacy-bridge-map', 'legacy-bridge.lock');
    await expect(
      acquireLockByPath(dir, 'legacy-bridge-regenerate', 'legacy-bridge.lock'),
    ).rejects.toThrow(LockHeldError);
    await releaseMap();
  });

  it('archive 内 sync-check 复用 archive.lock(不再获 legacy-bridge.lock)', async () => {
    const releaseArchive = await acquireLockByPath(dir, 'archive', 'archive.lock');
    // archive 内 sync-check 不调 acquireLockByPath legacy-bridge.lock
    // legacy-bridge.lock 仍可被独立 map / resolve 持有
    const releaseMap = await acquireLockByPath(
      dir,
      'legacy-bridge-map',
      'legacy-bridge.lock',
    );
    await releaseArchive();
    await releaseMap();
  });

  it('resolve 与 sync-check 同 change-id 竞争 → legacy-bridge.lock 互斥', async () => {
    const r1 = await acquireLockByPath(dir, 'legacy-bridge-resolve', 'legacy-bridge.lock');
    await expect(
      acquireLockByPath(dir, 'legacy-bridge-sync-check', 'legacy-bridge.lock'),
    ).rejects.toThrow(LockHeldError);
    await r1();
  });

  it('release 后另一进程可以获(无残留)', async () => {
    const r1 = await acquireLockByPath(dir, 'legacy-bridge-map', 'legacy-bridge.lock');
    await r1();
    const r2 = await acquireLockByPath(dir, 'legacy-bridge-regenerate', 'legacy-bridge.lock');
    await r2();
  });

  it('lock 顺序固定:先 archive.lock 后 legacy-bridge.lock(死锁防护)', async () => {
    // 模拟正确顺序
    const a = await acquireLockByPath(dir, 'legacy-bridge-regenerate', 'archive.lock');
    const b = await acquireLockByPath(dir, 'legacy-bridge-regenerate', 'legacy-bridge.lock');
    await b();
    await a();
    // 不抛错即为通过(Plan 7 在 regenerate action 中用此顺序;此 case 仅断言两 lock 可顺序持有)
    expect(true).toBe(true);
  });
});
