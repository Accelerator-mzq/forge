// archive cross-cutting fence 存根合约测试 (plan-9a Task 8)
// 覆盖:core 单元测试 + CLI flag 烟雾测试

import { describe, it, expect } from 'vitest';
import { crossCuttingFenceCheck, FENCE_INVARIANT_NAMES } from '../../src/core/archive/fence.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYAML } from 'yaml';
import { computeTasksHash, computeContentHash, computeLogHash } from '../../src/core/hash/index.js';
import { runCli } from './helpers.js';

// ─── core 单元测试 ────────────────────────────────────────────────────────────

describe('cross-cutting fence (core unit)', () => {
  // 不传 allowStubFence:13 个 stub 均返回 not_implemented, ok=false
  it('默认: 13 个 invariant 均 not_implemented, ok=false', async () => {
    const result = await crossCuttingFenceCheck('/dummy', {});
    expect(result.ok).toBe(false);
    expect(result.notImplementedCount).toBe(13);
    expect(result.results.length).toBe(13);
    // 每条均 ok:false, reason:'not_implemented'
    expect(result.results.every((r) => !r.ok)).toBe(true);
    expect(result.results.every((r) => r.reason === 'not_implemented')).toBe(true);
  });

  // allowStubFence:not_implemented → skipped, ok=true
  it('allowStubFence=true: not_implemented 视为 skip, ok=true', async () => {
    const result = await crossCuttingFenceCheck('/dummy', { allowStubFence: true });
    expect(result.ok).toBe(true);
    // notImplementedCount 仍保留原始计数(13 个 stub)
    expect(result.notImplementedCount).toBe(13);
    expect(result.results.every((r) => r.ok)).toBe(true);
    expect(result.results.every((r) => r.reason === 'skipped:not_implemented')).toBe(true);
  });

  // FENCE_INVARIANT_NAMES 必须恰好 13 个
  it('FENCE_INVARIANT_NAMES 恰好包含 13 个名称', () => {
    expect(FENCE_INVARIANT_NAMES.length).toBe(13);
  });

  // 每个 result.invariant 与 FENCE_INVARIANT_NAMES 对应
  it('results[i].invariant 与 FENCE_INVARIANT_NAMES[i] 一致', async () => {
    const result = await crossCuttingFenceCheck('/dummy', {});
    for (let i = 0; i < FENCE_INVARIANT_NAMES.length; i++) {
      expect(result.results[i]!.invariant).toBe(FENCE_INVARIANT_NAMES[i]);
    }
  });
});

// ─── CLI 烟雾测试 ─────────────────────────────────────────────────────────────

/**
 * 搭建最小 forge 骨架(复用 archive.test.ts 模式)
 */
function setupForgeRoot(projectRoot: string): string {
  const forgeDir = join(projectRoot, 'forge');
  mkdirSync(join(forgeDir, 'changes'), { recursive: true });
  mkdirSync(join(forgeDir, 'specs'), { recursive: true });
  mkdirSync(join(forgeDir, '.cache'), { recursive: true });
  writeFileSync(
    join(forgeDir, 'config.yaml'),
    'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
    'utf8',
  );
  return join(forgeDir, 'changes');
}

/**
 * 创建完整合法的 change 目录(含正确 hash 的 marker 文件)
 * 注意:review marker 使用 is_git_repo:false → 需要 --force
 */
async function setupValidChange(changesDir: string, changeId: string): Promise<string> {
  const changeDir = join(changesDir, changeId);
  mkdirSync(join(changeDir, 'specs'), { recursive: true });
  mkdirSync(join(changeDir, 'logs'), { recursive: true });

  const proposalContent =
    '# Add Login\n\n## Why\nUsers need authentication.\n\n## What\nOAuth2 flow.\n';
  const designContent = '# Design\n\n## Architecture\nJWT tokens.\n';
  const tasksContent = '# Tasks\n\n- [ ] t1: implement login\n- [ ] t2: write tests\n';
  const specContent =
    '# Login Spec\n\n## Scenario: successful login\n\n**Given** valid credentials\n**When** user logs in\n**Then** token issued\n';
  const logContent = 'Test run at 2026-05-04\nAll tests passed\n';
  const logFilePath = join(changeDir, 'logs', 'login.txt');

  writeFileSync(join(changeDir, 'proposal.md'), proposalContent, 'utf8');
  writeFileSync(join(changeDir, 'design.md'), designContent, 'utf8');
  writeFileSync(join(changeDir, 'tasks.md'), tasksContent, 'utf8');
  writeFileSync(join(changeDir, 'specs', 'login.md'), specContent, 'utf8');
  writeFileSync(logFilePath, logContent, 'utf8');

  const tasksHash = computeTasksHash(tasksContent);
  const contentHash = await computeContentHash(changeDir);
  const logHash = await computeLogHash(logFilePath);

  const verifyMarker = {
    schema: 'forge-verify/v1',
    verified_at: '2026-05-04T12:00:00Z',
    verified_by: 'ai-agent',
    tasks_hash: tasksHash,
    content_hash: contentHash,
    evidence: [
      {
        scenario_id: 's1',
        test_command: 'pnpm test',
        test_file: 'tests/login.test.ts',
        log_path: './logs/login.txt',
        log_hash: logHash,
        pass: true,
      },
    ],
  };

  // is_git_repo:false → 需要 --force 才能通过(与 archive.test.ts 保持一致)
  const reviewMarker = {
    schema: 'forge-review/v1',
    reviewed_at: '2026-05-04T13:00:00Z',
    reviewed_by: 'ai-agent',
    tasks_hash: tasksHash,
    content_hash: contentHash,
    git: { is_git_repo: false },
    review_outcomes: [],
  };

  writeFileSync(join(changeDir, '.verify-passed'), stringifyYAML(verifyMarker), 'utf8');
  writeFileSync(join(changeDir, '.review-passed'), stringifyYAML(reviewMarker), 'utf8');

  return changeDir;
}

describe('archive --enable-cross-cutting-fence (CLI 集成)', () => {
  // 没有 --enable-cross-cutting-fence flag → fence 不运行,无 "fence" 关键字在 stderr
  it('无 --enable-cross-cutting-fence: fence 不触发,stderr 不含 fence 相关文字', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-fence-off-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      // is_git_repo:false → 需要 --force;但不传 --enable-cross-cutting-fence
      const r = runCli(['archive', 'add-login', '--force'], projectRoot);
      // 成功归档(exit 0)且 stderr 不含 fence 词汇
      expect(r.exitCode).toBe(0);
      expect(r.stderr).not.toMatch(/fence/i);
      expect(r.stderr).not.toMatch(/cross-cutting/i);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // --enable-cross-cutting-fence 但无 --allow-stub-fence → fence 失败 exit 2,
  // stderr 含 "fence not ready" 或 "invariants are stubs"
  it('--enable-cross-cutting-fence (无 --allow-stub-fence): exit 2 且 stderr 含 "fence not ready"', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-fence-fail-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      const r = runCli(
        ['archive', 'add-login', '--force', '--enable-cross-cutting-fence'],
        projectRoot,
      );
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toMatch(/fence not ready/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // --enable-cross-cutting-fence --allow-stub-fence → fence pass(skip),
  // 但 stderr 含开发警告 "--allow-stub-fence is for development only"
  it('--enable-cross-cutting-fence --allow-stub-fence: fence skip,stderr 含开发警告', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-fence-skip-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      const r = runCli(
        ['archive', 'add-login', '--force', '--enable-cross-cutting-fence', '--allow-stub-fence'],
        projectRoot,
      );
      // fence pass 后 archive 正常完成 exit 0
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toMatch(/--allow-stub-fence is for development only/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // 烟雾测试:flag 本身被 commander 接受,不报 "unknown option"
  it('flag 接受烟雾: unknown option 不出现在 stderr', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-fence-smoke-'));
    try {
      mkdirSync(join(root, 'forge', 'changes'), { recursive: true });
      // 无 change → exit 2 preflight 失败,但 flag 被 commander 正常接受
      const r = runCli(['archive', 'nonexistent', '--enable-cross-cutting-fence'], root);
      expect(r.stderr).not.toMatch(/unknown option/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
