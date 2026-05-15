// output-watcher.test.ts — OutputWatcher / watchProcess 单元测试
// 5 个测试:zombie / timeout / progress / done happy-path / single-settle 边界
// 使用 EventEmitter 模拟 ChildProcess,避免真实 spawn

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OutputWatcher } from '../../../src/core/stage-extensions/output-watcher.js';
import type { ChildProcess } from 'node:child_process';

// ─── 辅助:创建 ChildProcess 存根 ─────────────────────────────────────────────

/**
 * 创建一个最小化的 ChildProcess 存根。
 * 继承 EventEmitter,暴露 exitCode / signalCode。
 */
function makeFakeProc(exitCode: number | null = null, signalCode: string | null = null) {
  const emitter = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: string | null;
    removeAllListeners: (event?: string) => EventEmitter;
    once: <T>(event: string, cb: (...args: T[]) => void) => EventEmitter;
  };
  emitter.exitCode = exitCode;
  emitter.signalCode = signalCode;
  return emitter as unknown as ChildProcess & EventEmitter;
}

// ─── 辅助:等待 n ms ──────────────────────────────────────────────────────────
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── tmpdir 管理 ─────────────────────────────────────────────────────────────
let tmp: string;
let filePath: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'forge-watcher-'));
  filePath = path.join(tmp, 'output.json');
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('OutputWatcher', () => {
  it('emits zombie when elapsed ≥ timeout and mtime stale', async () => {
    // 进程未退出(exitCode=null),文件不存在(mtime 停止更新),超时后应 emit zombie
    const proc = makeFakeProc(null, null);
    const events: string[] = [];

    // pollInterval=20ms, zombie=10ms, timeout=50ms
    const watcher = new OutputWatcher(proc, filePath, 0.02, 0.01, 0.05);
    watcher.on('zombie', () => events.push('zombie'));
    watcher.on('timeout', () => events.push('timeout'));
    watcher.on('done', () => events.push('done'));

    watcher.start();

    // 等待足够时间让 zombie 触发(50ms timeout + 几个 poll 周期)
    await wait(200);

    expect(events).toContain('zombie');
    // 只 settle 一次
    expect(events.filter((e) => ['zombie', 'timeout', 'done'].includes(e))).toHaveLength(1);
  });

  it('emits timeout when elapsed ≥ timeout but mtime still advancing', async () => {
    // 文件在轮询期间被更新(mtime 推进),超时后应 emit timeout(非 zombie)
    const proc = makeFakeProc(null, null);
    const events: string[] = [];

    // pollInterval=20ms, zombie=1000ms(远大于 timeout), timeout=50ms
    const watcher = new OutputWatcher(proc, filePath, 0.02, 1000, 0.05);
    watcher.on('zombie', () => events.push('zombie'));
    watcher.on('timeout', () => events.push('timeout'));
    watcher.on('done', () => events.push('done'));

    watcher.start();

    // 在超时前持续更新文件 mtime
    const updateInterval = setInterval(() => {
      void writeFile(filePath, 'data', 'utf8');
    }, 10);

    await wait(200);
    clearInterval(updateInterval);

    // zombie threshold=1000s >> timeout=50ms,超时时 mtime 仍在更新 → timeout
    expect(events).toContain('timeout');
    expect(events.filter((e) => ['zombie', 'timeout', 'done'].includes(e))).toHaveLength(1);
  });

  it('emits progress when file mtime advances before timeout', async () => {
    // 文件 mtime 推进时应 emit progress(不 settle)
    const proc = makeFakeProc(null, null);
    const progressEvents: string[] = [];
    const terminalEvents: string[] = [];

    // pollInterval=20ms, zombie=1000ms, timeout=500ms
    const watcher = new OutputWatcher(proc, filePath, 0.02, 1000, 0.5);
    watcher.on('progress', () => progressEvents.push('progress'));
    watcher.on('zombie', () => terminalEvents.push('zombie'));
    watcher.on('timeout', () => terminalEvents.push('timeout'));
    watcher.on('done', () => terminalEvents.push('done'));

    watcher.start();

    // 更新文件一次触发 progress
    await wait(10);
    await writeFile(filePath, 'initial', 'utf8');
    await wait(60); // 等几个 poll 周期

    // 手动 stop 避免等到 timeout
    watcher.stop();

    // 应有 progress 事件且无 terminal 事件
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(terminalEvents).toHaveLength(0);
  });

  it('done happy-path:进程退出时立即 emit done,不等 timeout', async () => {
    // 进程 close 事件触发后应立即 emit done,不需要等到 timeout
    const proc = makeFakeProc(null, null);
    const events: Array<{ kind: string; exitCode?: number }> = [];

    // timeout=5s,但进程很快退出
    const watcher = new OutputWatcher(proc, filePath, 1, 1, 5);
    watcher.on('done', (...args: unknown[]) => {
      events.push({ kind: 'done', exitCode: args[0] as number });
    });
    watcher.on('zombie', () => events.push({ kind: 'zombie' }));
    watcher.on('timeout', () => events.push({ kind: 'timeout' }));

    watcher.start();

    // 50ms 后模拟进程退出
    await wait(50);
    (proc as unknown as EventEmitter).emit('close', 0);

    await wait(50);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('done');
    expect(events[0]?.exitCode).toBe(0);
  });

  it('single-settle 边界:进程在 timeout 边界退出只 settle 一次且 kind=done', async () => {
    // 同时触发:进程退出 close 和超时轮询几乎同时发生
    // 预期:只 settle 一次,且 done 优先(close handler 最先检查 settled)
    const proc = makeFakeProc(null, null);
    const events: string[] = [];

    // pollInterval=30ms, timeout=60ms — 进程在约 55ms 时退出(接近 timeout 边界)
    const watcher = new OutputWatcher(proc, filePath, 0.03, 0.01, 0.06);
    watcher.on('done', () => events.push('done'));
    watcher.on('zombie', () => events.push('zombie'));
    watcher.on('timeout', () => events.push('timeout'));

    watcher.start();

    // 在 timeout 边界附近(55ms)触发 close 事件
    await wait(55);
    // 标记 exitCode 让 poll 跳过(模拟进程已退出)
    (proc as unknown as { exitCode: number }).exitCode = 0;
    (proc as unknown as EventEmitter).emit('close', 0);

    await wait(100);

    // 无论哪个先触发,只应 settle 一次
    const terminalCount = events.filter((e) => ['done', 'zombie', 'timeout'].includes(e)).length;
    expect(terminalCount).toBe(1);
    // close 在 poll 之前注册,进程退出优先
    expect(events[0]).toBe('done');
  });
});
