// tests/cli/evidence-staging-concurrency.test.ts — plan-9g Task 3.2
// 测 staging 文件锁并发保护(brainstorm spec §9.10)
//
// Case 1: 双 acquire 串行 — 第二个等到第一个 release
// Case 2: stale lock 自动清理
// Case 3: timeout 触发 StagingLockHeldError

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireStagingLock, StagingLockHeldError } from '../../src/core/staging-lock.js';

describe('staging-lock', () => {
  let changeRoot: string;

  beforeEach(async () => {
    changeRoot = await mkdtemp(join(tmpdir(), 'forge-staging-lock-'));
    await mkdir(join(changeRoot, '.evidence'), { recursive: true });
  });

  it('Case 1: 双 acquire 串行(第二个等第一个 release)', async () => {
    const release1 = await acquireStagingLock(changeRoot, { timeoutMs: 2000 });
    const order: number[] = [];

    // 第二个 acquire 在后台等待
    const p2 = acquireStagingLock(changeRoot, { timeoutMs: 2000, retryIntervalMs: 20 }).then(
      async (release2) => {
        order.push(2);
        await release2();
      },
    );

    // 等一段时间确认第二个仍在等待
    await new Promise((r) => setTimeout(r, 100));
    expect(order).toEqual([]); // 第二个还在等

    // release 第一个 → 第二个可以获取
    order.push(1);
    await release1();
    await p2;
    expect(order).toEqual([1, 2]);
  });

  it('Case 2: stale lock 自动清理(模拟 pid 不存在)', async () => {
    const lockPath = join(changeRoot, '.evidence', '.staging.lock');
    // 写一个 pid=0(永远不存在)的 lock 模拟 stale
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 0, acquired_at: '2020-01-01T00:00:00Z' }),
      'utf8',
    );
    // acquireStagingLock 应能自动清理 stale lock 并成功获取
    const release = await acquireStagingLock(changeRoot, { timeoutMs: 1000 });
    // lock 文件存在(被替换成当前 pid 的 lock)
    expect(existsSync(lockPath)).toBe(true);
    // release 后文件删除
    await release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('Case 3: timeout 触发 StagingLockHeldError(模拟 alive pid holder)', async () => {
    // 写一个 pid=process.pid(自己 alive)模拟另一进程持有 lock
    const lockPath = join(changeRoot, '.evidence', '.staging.lock');
    await writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }),
      'utf8',
    );
    // 短 timeout → 应抛 StagingLockHeldError
    await expect(
      acquireStagingLock(changeRoot, { timeoutMs: 200, retryIntervalMs: 50 }),
    ).rejects.toBeInstanceOf(StagingLockHeldError);
  });
});
