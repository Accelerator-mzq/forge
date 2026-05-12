// archive 进程锁 — Plan 3 Task 12;Plan 7 Phase A Task A2 扩展支持 legacy-bridge.lock
// 用 O_CREAT|O_EXCL 独占创建 .cache/<lockName>,含 stale pid 检测

import { writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, openSync, closeSync, mkdirSync, constants } from 'node:fs';
import { join, dirname } from 'node:path';

// 决策 #23:扩展 mode union 支持 legacy-bridge 命令(C-2 / spec §2.6)
// migrate 命令 v0.4 加(Plan 8a Task 1.1):LockMode union 加 'migrate' 一项
// LockHeldError 文案不动(保兼容 lock.test.ts:188 / cli/archive.test.ts:516 断言);
// migrate CLI 入口 catch 后改输出友好文案(见 plan-8a Task 1.7)
// plan-9e1 v2 BLOCKER 1:加 'resume-summary' — archive --resume-summary 子路径需要独立锁
export type LockMode =
  | 'archive'
  | 'recover'
  | 'resume-summary' // plan-9e1 v2 BLOCKER 1 修订
  | 'legacy-bridge-map'
  | 'legacy-bridge-regenerate'
  | 'legacy-bridge-index'
  | 'legacy-bridge-resolve'
  | 'legacy-bridge-sync-check'
  | 'migrate';

/** lock 文件内容结构 */
interface LockData {
  pid: number;
  started_at: string;
  mode: LockMode;
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
 * acquireLock 的可定制 lock 文件版本(决策 #23)。
 *
 * legacy-bridge 命令获 forge/.cache/legacy-bridge.lock(独立于 archive.lock);
 * regenerate/index 同时获 archive.lock + legacy-bridge.lock(顺序固定:先 archive.lock 后 legacy-bridge.lock)。
 *
 * @param forgeRoot forge 根目录
 * @param mode      操作 mode(也写入 lock 数据)
 * @param lockName  lock 文件名,默认 'archive.lock'
 * @returns         release 函数(幂等,可多次调用)
 */
export async function acquireLockByPath(
  forgeRoot: string,
  mode: LockMode,
  lockName: string = 'archive.lock',
): Promise<() => Promise<void>> {
  const lockPath = join(forgeRoot, '.cache', lockName);

  mkdirSync(dirname(lockPath), { recursive: true });

  let fd: number;
  try {
    fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      const data = JSON.parse(await readFile(lockPath, 'utf8')) as LockData;
      if (!isPidAlive(data.pid)) {
        await rm(lockPath, { force: true });
        return acquireLockByPath(forgeRoot, mode, lockName);
      }
      throw new LockHeldError(data);
    }
    throw err;
  }

  const data: LockData = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    mode,
  };
  await writeFile(lockPath, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'w' });
  closeSync(fd);

  return async (): Promise<void> => {
    if (existsSync(lockPath)) {
      await rm(lockPath, { force: true });
    }
  };
}

/**
 * 获取 archive 进程锁(`.cache/archive.lock` 专用 wrapper)。
 *
 * 用 O_CREAT|O_EXCL 原子创建 .cache/archive.lock:
 * - 若文件不存在 → 独占创建,写入 {pid, started_at, mode},返回 release 函数
 * - 若文件已存在:
 *   - 检查持有者 pid 是否存活(isPidAlive)
 *   - stale(进程已死) → 删除 lock + 递归重试
 *   - alive → 抛 LockHeldError
 *
 * **使用约定**:本函数仅供 archive / recover / **resume-summary**(plan-9e1 v3 NIT 1 修订)命令使用;
 * legacy-bridge 命令应直接调 `acquireLockByPath(forgeRoot, mode, 'legacy-bridge.lock')`(决策 #23)。
 *
 * @param forgeRoot forge 根目录(含 .cache/ 子目录)
 * @param mode      当前操作模式(LockMode union 支持 legacy-bridge-* 与 'migrate' 是为统一类型;
 *                  实际 callsite 应仅传 'archive' / 'recover' / 'resume-summary';
 *                  legacy-bridge-* 与 'migrate' 走 `acquireLockByPath` 路径)
 * @returns         release 函数(幂等,可多次调用)
 */
export async function acquireLock(forgeRoot: string, mode: LockMode): Promise<() => Promise<void>> {
  return acquireLockByPath(forgeRoot, mode, 'archive.lock');
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
