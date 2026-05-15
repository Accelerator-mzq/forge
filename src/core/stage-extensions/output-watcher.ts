// output-watcher.ts — 子进程输出文件监控
// plan-stage-extensions Task 2.5
// 监控两个信号:子进程退出(proc.close) 和输出文件 mtime 进展
// 单次 settle:done/zombie/timeout 三种结果只会 emit 一次

import { stat } from 'node:fs/promises';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

/**
 * OutputWatcher — 监控子进程和输出文件。
 *
 * 事件:
 * - 'done'    :进程正常退出,参数 exitCode (number)
 * - 'zombie'  :超时且文件 mtime 停止更新(进程挂死)
 * - 'timeout' :超时但文件 mtime 仍在推进(进程可能卡在无限循环)
 * - 'progress':文件 mtime 有进展(不会 settle)
 *
 * 单次 settle:done/zombie/timeout 只会触发一次。
 */
export class OutputWatcher extends EventEmitter {
  private settled = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastMtime = 0;
  private startTime = 0;

  /** @param proc              被监控的子进程 */
  /** @param filePath          codex 输出文件路径 */
  /** @param pollIntervalSec   轮询间隔(秒) */
  /** @param zombieThresholdSec  判定 zombie 所需的 mtime 静止时长(秒) */
  /** @param timeoutSec        整体超时时长(秒) */
  constructor(
    private readonly proc: ChildProcess,
    private readonly filePath: string,
    private readonly pollIntervalSec: number,
    private readonly zombieThresholdSec: number,
    private readonly timeoutSec: number,
  ) {
    super();
  }

  /**
   * 启动监控。
   * - 立即注册 proc.close 监听器
   * - 启动定时轮询
   */
  start(): void {
    this.startTime = Date.now();

    // 监听进程退出:首选 settle 路径
    this.proc.once('close', (code: number | null) => {
      // 进程退出,emit done(单次 settle)
      this.settle('done', code ?? 0);
    });

    // 定时轮询:检测 zombie / timeout / progress
    this.intervalId = setInterval(() => {
      void this.poll();
    }, this.pollIntervalSec * 1000);
  }

  /**
   * 定时轮询逻辑。
   * 若进程已退出,跳过(等待 close 事件处理)。
   */
  private async poll(): Promise<void> {
    // 进程已退出,交给 close handler 处理
    if (this.proc.exitCode !== null || this.proc.signalCode !== null) {
      return;
    }

    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000;

    // 读取文件 mtime
    let mtime = this.lastMtime;
    try {
      const s = await stat(this.filePath);
      mtime = s.mtimeMs;
    } catch {
      // 文件尚未创建,mtime 保持上次值
    }

    const mtimeAge = (now - mtime) / 1000;
    const mtimeAdvanced = mtime > this.lastMtime;

    // 更新 lastMtime(仅在有进展时)
    if (mtimeAdvanced) {
      this.lastMtime = mtime;
    }

    if (elapsed >= this.timeoutSec) {
      if (mtimeAge >= this.zombieThresholdSec) {
        // 超时且 mtime 长时间未更新 → zombie
        this.settle('zombie');
      } else {
        // 超时但 mtime 还在更新 → timeout
        this.settle('timeout');
      }
      return;
    }

    // 未超时,仅发出 progress 通知
    if (mtimeAdvanced) {
      this.emit('progress');
    }
  }

  /**
   * 单次 settle:确保 done/zombie/timeout 只触发一次。
   * settle 后自动调用 stop()。
   */
  private settle(kind: 'done', exitCode: number): void;
  private settle(kind: 'zombie' | 'timeout'): void;
  private settle(kind: 'done' | 'zombie' | 'timeout', exitCode?: number): void {
    if (this.settled) return;
    this.settled = true;

    if (kind === 'done') {
      this.emit('done', exitCode);
    } else {
      this.emit(kind);
    }

    this.stop();
  }

  /**
   * 停止监控:清除定时器和进程监听器。
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // 移除 close 监听器防止内存泄漏(已 settle 后无需再监听)
    this.proc.removeAllListeners('close');
  }

  /** EventEmitter 类型重载,提供类型安全的事件注册 */
  override on(
    event: 'zombie' | 'timeout' | 'progress' | 'done',
    listener: (...args: unknown[]) => void,
  ): this {
    return super.on(event, listener);
  }
}

// ─── watchProcess helper ──────────────────────────────────────────────────────

/**
 * watchProcess 结果联合类型。
 * progress 不作为结果(不 resolve Promise)。
 */
export type WatchResult =
  | { kind: 'done'; exitCode: number }
  | { kind: 'zombie'; jobId: string | null }
  | { kind: 'timeout'; jobId: string | null };

/**
 * 包装 OutputWatcher,返回 Promise — 仅在首个终态事件时 resolve。
 * progress 事件不 resolve Promise。
 * jobId 由 runner 附加,此处固定传 null。
 *
 * @param proc      被监控的子进程
 * @param filePath  codex 输出文件路径
 * @param opts      轮询/超时参数
 */
export function watchProcess(
  proc: ChildProcess,
  filePath: string,
  opts: {
    poll_interval_sec: number;
    zombie_threshold_sec: number;
    timeout_sec: number;
  },
): Promise<WatchResult> {
  return new Promise<WatchResult>((resolve) => {
    const watcher = new OutputWatcher(
      proc,
      filePath,
      opts.poll_interval_sec,
      opts.zombie_threshold_sec,
      opts.timeout_sec,
    );

    // done:进程正常退出
    watcher.on('done', (...args: unknown[]) => {
      const exitCode = typeof args[0] === 'number' ? args[0] : 0;
      resolve({ kind: 'done', exitCode });
    });

    // zombie:进程挂死
    watcher.on('zombie', () => {
      resolve({ kind: 'zombie', jobId: null });
    });

    // timeout:超时(mtime 仍更新)
    watcher.on('timeout', () => {
      resolve({ kind: 'timeout', jobId: null });
    });

    watcher.start();
  });
}
