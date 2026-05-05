// archive 进程锁 — Plan 3 Task 12
// 用 O_CREAT|O_EXCL 独占创建 .cache/archive.lock,含 stale pid 检测

import { writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, openSync, closeSync, mkdirSync, constants } from 'node:fs';
import { join, dirname } from 'node:path';

/** lock 文件内容结构 */
interface LockData {
  pid: number;
  started_at: string;
  mode: 'archive' | 'recover';
}

/** 当 lock 被另一个活进程持有时抛出 */
export class LockHeldError extends Error {
  constructor(public readonly holder: LockData) {
    super(
      `another forge archive is in progress (pid ${holder.pid}, mode ${holder.mode}, started ${holder.started_at})`,
    );
    this.name = 'LockHeldError';
  }
}

/**
 * 获取 archive 进程锁
 *
 * 用 O_CREAT|O_EXCL 原子创建 .cache/archive.lock:
 * - 若文件不存在 → 独占创建,写入 {pid, started_at, mode},返回 release 函数
 * - 若文件已存在:
 *   - 检查持有者 pid 是否存活(isPidAlive)
 *   - stale(进程已死) → 删除 lock + 递归重试
 *   - alive → 抛 LockHeldError
 *
 * @param forgeRoot forge 根目录(含 .cache/ 子目录)
 * @param mode      当前操作模式
 * @returns         release 函数(幂等,可多次调用)
 */
export async function acquireLock(
  forgeRoot: string,
  mode: 'archive' | 'recover',
): Promise<() => Promise<void>> {
  const lockPath = join(forgeRoot, '.cache', 'archive.lock');

  // P2.1 修复:fresh clone 后 .cache/ 不存在 → 提前 mkdir
  mkdirSync(dirname(lockPath), { recursive: true });

  // 用 O_CREAT|O_EXCL 独占创建 lock 文件
  let fd: number;
  try {
    fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      // lock 文件已存在 — 检查 stale
      const data = JSON.parse(await readFile(lockPath, 'utf8')) as LockData;
      if (!isPidAlive(data.pid)) {
        // stale lock:进程已死 → 清理后重试
        await rm(lockPath, { force: true });
        return acquireLock(forgeRoot, mode);
      }
      // 活进程持有 lock → 报错
      throw new LockHeldError(data);
    }
    throw err;
  }

  // 写入 lock 数据
  const data: LockData = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    mode,
  };
  await writeFile(lockPath, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'w' });
  closeSync(fd);

  // 返回幂等的 release 函数
  return async (): Promise<void> => {
    if (existsSync(lockPath)) {
      await rm(lockPath, { force: true });
    }
  };
}

/**
 * 检查 pid 是否存活
 *
 * process.kill(pid, 0):向进程发信号 0(不实际发送信号),
 * 仅验证进程是否存在及当前用户是否有权限访问。
 * - 返回 true:进程存在
 * - 返回 false:进程不存在(ESRCH)
 * - 返回 true:EPERM(进程存在但无权限)
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // 不发实际信号,仅验证存活
    return true;
  } catch (err) {
    // ESRCH = 进程不存在;其他错误(EPERM)= 进程存在但无权限
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
