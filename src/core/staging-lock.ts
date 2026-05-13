// src/core/staging-lock.ts — plan-9g Task 3.2
// staging 文件并发保护(brainstorm spec §9.10)
// 仿 archive lock.ts 模式 — O_CREAT|O_EXCL + isPidAlive stale detection
//
// 用途:helper(record-tdd/verify/review)写 staging.yaml 是"读 YAML + 改 array +
//       重算 hash + 覆写"非原子操作;主代理多 helper 并发(per-task 并行)会 lost update。
//       wrapper read-modify-write 在 acquireStagingLock → releaseStagingLock 内。
//
// 语义差异:archive lock 是 fail-immediately;staging lock 是 wait-retry-timeout
// (合理因 staging 是 short-lived per-call)

import { writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, openSync, closeSync, mkdirSync, constants } from 'node:fs';
import { join, dirname } from 'node:path';

/** lock 文件内容 */
interface StagingLockData {
  pid: number;
  acquired_at: string;
}

/** 当 staging lock 被另一活进程持有时抛出 */
export class StagingLockHeldError extends Error {
  constructor(public readonly holder: StagingLockData) {
    super(
      `another evidence helper is writing staging (pid ${holder.pid}, acquired ${holder.acquired_at})`,
    );
    this.name = 'StagingLockHeldError';
  }
}

/** acquireStagingLock 选项 */
export interface AcquireStagingLockOptions {
  /** 等待 lock 释放的总超时毫秒(默认 5000) */
  timeoutMs?: number;
  /** 重试间隔毫秒(默认 100) */
  retryIntervalMs?: number;
}

/**
 * acquireStagingLock — 获取 staging 文件锁
 *
 * 路径:<changeRoot>/.evidence/.staging.lock(独立于 archive lock)
 *
 * 流程:
 *   1. O_CREAT|O_EXCL 原子创建 lock 文件
 *   2. 若已存在 — isPidAlive 检测:
 *      - dead(stale)→ 删 lock 重试
 *      - alive → 等 retryInterval 重试,直到 timeoutMs 超时抛 StagingLockHeldError
 *   3. 成功 → 写 {pid, acquired_at}
 *
 * @param changeRoot change 根目录
 * @param options { timeoutMs, retryIntervalMs }
 * @returns release 函数(幂等)
 */
export async function acquireStagingLock(
  changeRoot: string,
  options: AcquireStagingLockOptions = {},
): Promise<() => Promise<void>> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const retryIntervalMs = options.retryIntervalMs ?? 100;
  const lockPath = join(changeRoot, '.evidence', '.staging.lock');

  // 确保 .evidence 目录存在
  mkdirSync(dirname(lockPath), { recursive: true });

  const deadline = Date.now() + timeoutMs;
  let lastHolder: StagingLockData | null = null;

  while (Date.now() < deadline) {
    let fd: number;
    try {
      // O_CREAT|O_EXCL 原子创建:若文件已存在则抛 EEXIST
      fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        // lock 已存在;检测 stale
        try {
          const data = JSON.parse(await readFile(lockPath, 'utf8')) as StagingLockData;
          lastHolder = data;
          if (!isPidAlive(data.pid)) {
            // stale → 删 lock 重试
            await rm(lockPath, { force: true });
            continue;
          }
        } catch {
          // 坏 lock 文件 → 删除重试
          await rm(lockPath, { force: true });
          continue;
        }
        // alive → 等 retryInterval
        await new Promise((r) => setTimeout(r, retryIntervalMs));
        continue;
      }
      throw err;
    }

    // 创建成功 → 写 lock 内容
    const data: StagingLockData = {
      pid: process.pid,
      acquired_at: new Date().toISOString(),
    };
    // 先写内容,再关闭 fd(fd 只是用于原子创建)
    await writeFile(lockPath, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'w' });
    closeSync(fd);

    // 返回幂等 release 函数
    return async (): Promise<void> => {
      if (existsSync(lockPath)) {
        await rm(lockPath, { force: true });
      }
    };
  }

  // 超时 → 抛错(用最后一次读到的 holder 数据)
  if (lastHolder) {
    throw new StagingLockHeldError(lastHolder);
  }
  throw new StagingLockHeldError({ pid: -1, acquired_at: new Date(deadline).toISOString() });
}

/**
 * isPidAlive — 沿 archive lock.ts 同函数
 *
 * process.kill(pid, 0) 向进程发信号 0(不实际发信号),仅验证进程是否存在。
 * - pid <= 0 永远视为 stale(防御性)
 * - ESRCH:进程不存在 → stale
 * - EPERM:进程存在但无权限 → 视为 alive
 */
function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0); // 不发实际信号,仅验证存活
    return true;
  } catch (err) {
    // ESRCH = 进程不存在;其他错误(EPERM)= 进程存在但无权限
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
