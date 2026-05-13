// archive cross-cutting fence 合约测试 (plan-9a Task 8 → plan-9g 填实更新)
// plan-9g 后:fence 默认开启(14 不变量);stub 行为已废弃
// 本文件更新为 9g 填实后的合约测试

import { describe, it, expect } from 'vitest';
import { crossCuttingFenceCheck, FENCE_INVARIANT_NAMES } from '../../src/core/archive/fence.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYAML } from 'yaml';
import { computeTasksHash, computeContentHash, computeLogHash } from '../../src/core/hash/index.js';
import { runCli } from './helpers.js';

// ─── core 单元测试 ────────────────────────────────────────────────────────────

describe('cross-cutting fence (core unit, plan-9g 填实后)', () => {
  // plan-9g 后:无 .verify-passed → legacy 路径 → ok=true,results=[]
  it('无 .verify-passed: legacy 路径 ok=true,results=[]', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'forge-fence-unit-'));
    try {
      mkdirSync(join(tmpDir, '.evidence'), { recursive: true });
      const result = await crossCuttingFenceCheck(tmpDir, {});
      expect(result.ok).toBe(true);
      expect(result.results.length).toBe(0);
      expect(result.notImplementedCount).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // allowStubFence 已 deprecated 但不报错;无 .verify-passed 时仍 ok=true
  it('allowStubFence=true(deprecated): 无 .verify-passed 时仍 ok=true', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'forge-fence-deprecated-'));
    try {
      mkdirSync(join(tmpDir, '.evidence'), { recursive: true });
      const result = await crossCuttingFenceCheck(tmpDir, { allowStubFence: true });
      expect(result.ok).toBe(true);
      expect(result.notImplementedCount).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // FENCE_INVARIANT_NAMES 必须恰好 14 个(plan-9g brainstorm v6 加 fence-14)
  it('FENCE_INVARIANT_NAMES 恰好包含 14 个名称', () => {
    expect(FENCE_INVARIANT_NAMES.length).toBe(14);
    expect(FENCE_INVARIANT_NAMES[13]).toBe('fence-14');
  });
});

// ─── CLI 集成烟雾测试 ──────────────────────────────────────────────────────────

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
 * plan-9g 后:无 process_evidence 字段 → legacy 路径,fence ok=true
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
    // 无 process_evidence 字段 → legacy 路径,fence ok=true
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

describe('archive fence CLI 集成(plan-9g 默认开启)', () => {
  // plan-9g 后:fence 默认开启;但无 process_evidence → legacy 路径 ok=true → archive 正常
  it('无 process_evidence(legacy marker): fence legacy 路径 ok=true,archive 成功', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-fence-legacy-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      // is_git_repo:false → 需要 --force
      const r = runCli(['archive', 'add-login', '--force'], projectRoot);
      // 成功归档(exit 0)且 stderr 不含 fence FAIL 词汇
      expect(r.exitCode).toBe(0);
      expect(r.stderr).not.toMatch(/fence rejected/i);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // plan-9g 删 flag 后:--enable-cross-cutting-fence 不再存在 → commander 报 unknown option
  it('已删 flag:--enable-cross-cutting-fence 报 unknown option', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-fence-deleted-flag-'));
    try {
      mkdirSync(join(root, 'forge', 'changes'), { recursive: true });
      const r = runCli(['archive', 'nonexistent', '--enable-cross-cutting-fence'], root);
      expect(r.stderr).toMatch(/unknown option/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // plan-9g 删 flag 后:--allow-stub-fence 不再存在 → commander 报 unknown option
  it('已删 flag:--allow-stub-fence 报 unknown option', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-fence-deleted-stub-flag-'));
    try {
      mkdirSync(join(root, 'forge', 'changes'), { recursive: true });
      const r = runCli(['archive', 'nonexistent', '--allow-stub-fence'], root);
      expect(r.stderr).toMatch(/unknown option/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
