// tests/cli/evidence-staging-concurrency.test.ts — plan-9g Task 3.2 + round 2 C5 regression
// 测 staging 文件锁并发保护(brainstorm spec §9.10)
//
// Case 1: 双 acquire 串行 — 第二个等到第一个 release
// Case 2: stale lock 自动清理
// Case 3: timeout 触发 StagingLockHeldError
// Case 4: round 2 C5 regression — 双 record-tdd 并发不破坏 ack-log 链

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireStagingLock, StagingLockHeldError } from '../../src/core/staging-lock.js';
import { canonicalHash } from '../../src/core/canonical-json.js';
import type { AckLogEntry } from '../../src/core/ack-log.js';

// dist CLI 入口(运行时由 vitest globalSetup pnpm build 保证存在)
const CLI_ENTRY = resolve(__dirname, '../../dist/cli/index.js');

// 异步 spawn forge evidence record-tdd;返回 Promise<exitCode>
function spawnRecordTdd(
  cwd: string,
  task: string,
  redSha: string,
  greenSha: string,
): Promise<number> {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn(
      'node',
      [
        CLI_ENTRY,
        'evidence',
        'record-tdd',
        'test-change',
        '--task',
        task,
        '--red-commit',
        redSha,
        '--green-commit',
        greenSha,
      ],
      { cwd, stdio: 'pipe' },
    );
    proc.on('exit', (code) => resolveP(code ?? 1));
    proc.on('error', rejectP);
  });
}

describe('staging-lock', () => {
  let changeRoot: string;

  beforeEach(async () => {
    changeRoot = await mkdtemp(join(tmpdir(), 'forge-staging-lock-'));
    await mkdir(join(changeRoot, '.evidence'), { recursive: true });
  });

  it('Case 1: 双 acquire 串行(第二个等第一个 release)', async () => {
    const release1 = await acquireStagingLock(changeRoot, { timeoutMs: 2000 });
    const order: number[] = [];

    // round 2 fix (M1):retryIntervalMs 从 20 改 50,sleep 从 100 改 200
    // 拉大窗口避免 Windows CI 边界 timing 抖动
    const p2 = acquireStagingLock(changeRoot, { timeoutMs: 2000, retryIntervalMs: 50 }).then(
      async (release2) => {
        order.push(2);
        await release2();
      },
    );

    // 等一段时间确认第二个仍在等待
    await new Promise((r) => setTimeout(r, 200));
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

  // round 2 C5 regression:并发 record-tdd 不破坏 ack-log 链
  it('Case 4: 双 record-tdd 并发不破坏 ack-log 链(C5 regression)', async () => {
    // 用真 spawn 两个 CLI 子进程并发跑 — 模拟主代理 per-task subagent 并行场景
    // 关键不变量:两条 entry 写入后,第二条 prev_entry_hash == canonicalHash(第一条)
    // 若 C5 未修(appendAckLog 在 lock 外),则两进程可能写入两条相同 prev=null → 链断
    const projectRoot = changeRoot; // change 命令在 cwd 下解析 forge/changes/<id>
    await mkdir(join(projectRoot, 'forge', 'changes', 'test-change'), { recursive: true });

    // 并发跑两个 record-tdd
    const [exit1, exit2] = await Promise.all([
      spawnRecordTdd(projectRoot, 'tasks.md#task-1', 'aaa111', 'bbb222'),
      spawnRecordTdd(projectRoot, 'tasks.md#task-2', 'ccc333', 'ddd444'),
    ]);

    expect(exit1).toBe(0);
    expect(exit2).toBe(0);

    // 读 ack-log.jsonl;两条 entry 必须形成链
    const ackLogPath = join(
      projectRoot,
      'forge',
      'changes',
      'test-change',
      '.evidence',
      'ack-log.jsonl',
    );
    const content = await readFile(ackLogPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2);
    const entry0 = JSON.parse(lines[0]!) as AckLogEntry;
    const entry1 = JSON.parse(lines[1]!) as AckLogEntry;

    // 第一条 prev_entry_hash 必 null;第二条 prev_entry_hash 必指向第一条 canonicalHash
    // C5 fix 保证:lock 内串行 appendAckLog → 第二条进程读到完整第一条 → 正确链
    expect(entry0.prev_entry_hash).toBeNull();
    expect(entry1.prev_entry_hash).toBe(canonicalHash(entry0));
    expect(entry1.prev_entry_hash).not.toBeNull(); // 防 race 退化双 null
  });
});
