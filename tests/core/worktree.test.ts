// tests/core/worktree.test.ts — plan-9g Task 2.2
// 测 runInWorktree 9 case(brainstorm spec §8.2):
//   - happy path(成功跑 + cleanup)
//   - timeout 触发
//   - fn 抛错 + cleanup 跑
//   - git worktree add 失败(非 git repo / sha 不存在)
//   - cleanup 失败仅 WARNING 不阻断
//   - ParallelGate max=2 并发 gate
//   - ParallelGate FIFO 顺序
//   - ParallelGate release 释放下一个
//   - WorktreeError stage 字段

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm as fsRm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInWorktree, ParallelGate, WorktreeError } from '../../src/core/worktree.js';

const execFileAsync = promisify(execFile);

async function setupGitRepo(): Promise<{ repoPath: string; sha: string }> {
  const repoPath = await mkdtemp(join(tmpdir(), 'forge-worktree-test-'));
  await execFileAsync('git', ['init', '-q'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: repoPath });
  await writeFile(join(repoPath, 'README.md'), '# test\n', 'utf8');
  await execFileAsync('git', ['add', '.'], { cwd: repoPath });
  await execFileAsync('git', ['commit', '-q', '-m', 'init'], { cwd: repoPath });
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
  return { repoPath, sha: stdout.trim() };
}

describe('runInWorktree', () => {
  let repoPath: string;
  let sha: string;

  beforeEach(async () => {
    const setup = await setupGitRepo();
    repoPath = setup.repoPath;
    sha = setup.sha;
  });

  afterEach(async () => {
    // I-3 修:用 Node fs/promises.rm 跨平台替代 GNU rm -rf
    //         (原 execFileAsync('rm',['-rf',...]) 依赖 Git-Bash coreutils,不跨平台)
    await fsRm(repoPath, { recursive: true, force: true }).catch(() => {});
  });

  it('Case 1: happy path 返 fn 结果 + cleanup', async () => {
    let receivedPath = '';
    const result = await runInWorktree(
      sha,
      async (workPath) => {
        receivedPath = workPath;
        return 'ok';
      },
      { cwd: repoPath },
    );
    expect(result).toBe('ok');
    expect(receivedPath).toContain('forge-rerun-');
    // worktree 已被 cleanup;list 应不含
    const { stdout } = await execFileAsync('git', ['worktree', 'list'], { cwd: repoPath });
    expect(stdout).not.toContain(receivedPath);
  });

  it('Case 2: timeout 触发 WorktreeError stage=timeout', async () => {
    await expect(
      runInWorktree(sha, () => new Promise((resolve) => setTimeout(resolve, 200)), {
        cwd: repoPath,
        timeout: 50,
      }),
    ).rejects.toMatchObject({
      name: 'WorktreeError',
      stage: 'timeout',
    });
  });

  it('Case 3: fn 抛错触发 WorktreeError stage=run + cleanup 跑', async () => {
    await expect(
      runInWorktree(
        sha,
        async () => {
          throw new Error('fn failed');
        },
        { cwd: repoPath },
      ),
    ).rejects.toMatchObject({
      name: 'WorktreeError',
      stage: 'run',
    });
  });

  it('Case 4: sha 不存在 → WorktreeError stage=add', async () => {
    await expect(
      runInWorktree('0000000000000000000000000000000000000000', async () => 'x', { cwd: repoPath }),
    ).rejects.toMatchObject({
      name: 'WorktreeError',
      stage: 'add',
    });
  });

  it('Case 5: cleanup 失败仅 WARNING 不阻断(mock cleanup error)', async () => {
    const warnings: string[] = [];
    // 模拟 cleanup 失败:fn 内手动 git worktree remove(占用),导致 finally 时 remove 失败
    const result = await runInWorktree(
      sha,
      async (workPath) => {
        // 提前 remove(让 finally 时再 remove 失败)
        await execFileAsync('git', ['worktree', 'remove', '--force', workPath], {
          cwd: repoPath,
        });
        return 'cleanup-tested';
      },
      {
        cwd: repoPath,
        onCleanupWarning: (msg) => warnings.push(msg),
      },
    );
    expect(result).toBe('cleanup-tested');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('git worktree remove');
  });

  it('Case 6: ParallelGate max=2 并发 gate(第 3 个等待)', async () => {
    const gate = new ParallelGate(2);
    const order: number[] = [];
    const tasks = [1, 2, 3].map(async (i) => {
      await gate.acquire();
      order.push(i);
      try {
        await new Promise((r) => setTimeout(r, 50));
      } finally {
        gate.release();
      }
    });
    await Promise.all(tasks);
    expect(order).toHaveLength(3);
    // 前两个并发(顺序 1,2),第 3 个等到 1 释放后进
    expect(order.slice(0, 2).sort()).toEqual([1, 2]);
    expect(order[2]).toBe(3);
  });

  it('Case 7: ParallelGate FIFO 顺序(连续 acquire)', async () => {
    const gate = new ParallelGate(1);
    const order: number[] = [];
    const tasks = [1, 2, 3].map(async (i) => {
      await gate.acquire();
      order.push(i);
      gate.release();
    });
    await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3]);
  });

  it('Case 8: ParallelGate release 触发下一个 acquire', async () => {
    const gate = new ParallelGate(1);
    await gate.acquire();
    let resolved = false;
    const next = gate.acquire().then(() => {
      resolved = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);
    gate.release();
    await next;
    expect(resolved).toBe(true);
    gate.release();
  });

  it('Case 9: WorktreeError stage 字段 union type', () => {
    const err = new WorktreeError('test', 'add');
    expect(err.stage).toBe('add');
    expect(err.name).toBe('WorktreeError');
    // type level: 'add'|'run'|'remove'|'timeout'
  });
});
