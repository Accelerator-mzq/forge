// src/core/worktree.ts — plan-9g Task 2.2
// 高阶 git worktree helper:runInWorktree(sha, fn, opts)
// 沿 brainstorm spec §2.1 锁定的"高阶 runInWorktree"路径(brainstorm 决策点 3)
//
// 关键设计:
//   - try/finally 强 cleanup(git worktree remove --force 必跑)
//   - timeout AbortSignal 控制单 task 重跑超时(沿 §2.7.4 D)
//   - max_parallel 并发 gate(brainstorm §9.10 — Windows 磁盘空间约束更紧)
//   - 跨平台 tmp 目录:Windows 用 os.tmpdir() 即 %TEMP%,Unix 用 /tmp

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

/** runInWorktree 调用选项 */
export interface RunInWorktreeOptions {
  /** 重跑 timeout 毫秒(沿 §2.7.4 D;ProcessVerificationConfig.test_timeout_per_task × 1000) */
  timeout?: number;
  /** 工作目录(默认 cwd) */
  cwd?: string;
  /** 失败 cleanup 时 stderr 输出回调(测试可注入 mock) */
  onCleanupWarning?: (msg: string) => void;
}

/** runInWorktree 失败错误类型 */
export class WorktreeError extends Error {
  constructor(
    message: string,
    public readonly stage: 'add' | 'run' | 'remove' | 'timeout',
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WorktreeError';
  }
}

/**
 * runInWorktree — 在 git worktree 隔离执行 fn(workPath)
 *
 * 流程:
 *   1. mkdtemp 临时目录(跨平台 tmpdir)
 *   2. git worktree add <tmpDir> <sha> 创建 detached worktree
 *   3. try: fn(workPath) — 业务逻辑(测试重跑)
 *   4. finally: git worktree remove --force <tmpDir>(失败 log WARNING 不阻断)
 *
 * @param sha — 要 checkout 的 git commit sha
 * @param fn — 业务函数,接收 workPath(absolute)返回 T
 * @param opts — { timeout, cwd, onCleanupWarning }
 * @returns fn 的返回值 T
 * @throws WorktreeError stage='add'|'run'|'remove'|'timeout'
 */
export async function runInWorktree<T>(
  sha: string,
  fn: (workPath: string) => Promise<T>,
  opts: RunInWorktreeOptions = {},
): Promise<T> {
  const cwd = opts.cwd ?? process.cwd();
  const timeoutMs = opts.timeout ?? 300_000; // 默认 300 秒(沿 DEFAULT_PROCESS_VERIFICATION.test_timeout_per_task)
  const onCleanupWarning = opts.onCleanupWarning ?? ((msg) => process.stderr.write(`⚠ ${msg}\n`));

  // 1. 创建 tmpdir(跨平台)
  const workPath = await mkdtemp(join(tmpdir(), 'forge-rerun-'));

  let addedWorktree = false;
  try {
    // 2. git worktree add
    try {
      await execFileAsync('git', ['worktree', 'add', '--detach', workPath, sha], {
        cwd,
        encoding: 'utf8',
      });
      addedWorktree = true;
    } catch (e) {
      throw new WorktreeError(
        `git worktree add failed for sha=${sha} at ${workPath}: ${e instanceof Error ? e.message : String(e)}`,
        'add',
        e,
      );
    }

    // 3. 跑 fn 含 timeout
    // I-1 修:setTimeout handle 在 fn 完成后必须 clearTimeout,
    //         否则 timeoutMs 默认 300s 内 process 退出会被 pending timer 卡住
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      fn(workPath),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new WorktreeError(`worktree fn timeout after ${timeoutMs}ms`, 'timeout')),
          timeoutMs,
        );
      }),
    ]).finally(() => {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    });

    return result;
  } catch (e) {
    if (e instanceof WorktreeError) throw e;
    // fn 内部抛错
    throw new WorktreeError(
      `runInWorktree fn failed: ${e instanceof Error ? e.message : String(e)}`,
      'run',
      e,
    );
  } finally {
    // 4. cleanup(失败仅 WARNING 不阻断)
    if (addedWorktree) {
      try {
        await execFileAsync('git', ['worktree', 'remove', '--force', workPath], {
          cwd,
          encoding: 'utf8',
        });
      } catch (cleanupErr) {
        onCleanupWarning(
          `git worktree remove --force ${workPath} failed: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
        );
      }
    }
    // tmpdir 物理目录最后清理(git worktree remove 应该已删,这里兜底)
    try {
      await rm(workPath, { recursive: true, force: true });
    } catch {
      // 已被 git worktree remove 删了,正常
    }
  }
}

/**
 * Parallel gate — 限制 max_parallel_reruns 并发(brainstorm §9.10)
 * 实施者根据 ProcessVerificationConfig.max_parallel_reruns 创建 gate 实例
 * 用法:
 *   const gate = new ParallelGate(2);
 *   await gate.acquire();
 *   try {
 *     await runInWorktree(sha, fn);
 *   } finally {
 *     gate.release();
 *   }
 */
export class ParallelGate {
  private inFlight = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {
    if (max < 1) throw new Error(`ParallelGate max must be >= 1, got ${max}`);
  }

  async acquire(): Promise<void> {
    if (this.inFlight < this.max) {
      this.inFlight++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.inFlight++;
        resolve();
      });
    });
  }

  release(): void {
    this.inFlight--;
    if (this.queue.length > 0 && this.inFlight < this.max) {
      const next = this.queue.shift()!;
      next();
    }
  }
}
