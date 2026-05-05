// forge archive 子命令集成测试
// 覆盖:happy path / 缺 marker / hash 不匹配 / human-override + --force / --recover

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYAML } from 'yaml';
import { computeTasksHash, computeContentHash } from '../../src/core/hash/index.js';
import { runCli } from './helpers.js';

// ─── Helper: 搭建标准 forge 骨架 ───────────────────────────────────────────────

/**
 * 在 forgeRoot 下创建最小合法 forge 目录骨架。
 * 返回 changeDir 路径。
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
 * 在 changesDir 下创建完整合法 change 目录。
 * 含 proposal.md, design.md, tasks.md, specs/ + 正确 hash 的两个 marker 文件。
 *
 * @param changesDir  forge/changes/ 目录
 * @param changeId    change id,如 'add-login'
 * @param actor       'ai-agent' | 'human-override'
 * @returns           changeDir 路径
 */
async function setupValidChange(
  changesDir: string,
  changeId: string,
  actor: 'ai-agent' | 'human-override' = 'ai-agent',
): Promise<string> {
  const changeDir = join(changesDir, changeId);
  mkdirSync(join(changeDir, 'specs'), { recursive: true });

  // 固定内容文件
  const proposalContent =
    '# Add Login\n\n## Why\nUsers need authentication.\n\n## What\nOAuth2 flow.\n';
  const designContent = '# Design\n\n## Architecture\nJWT tokens.\n';
  const tasksContent = '# Tasks\n\n- [ ] t1: implement login\n- [ ] t2: write tests\n';
  const specContent =
    '# Login Spec\n\n## Scenario: successful login\n\n**Given** valid credentials\n**When** user logs in\n**Then** token issued\n';

  writeFileSync(join(changeDir, 'proposal.md'), proposalContent, 'utf8');
  writeFileSync(join(changeDir, 'design.md'), designContent, 'utf8');
  writeFileSync(join(changeDir, 'tasks.md'), tasksContent, 'utf8');
  writeFileSync(join(changeDir, 'specs', 'login.md'), specContent, 'utf8');

  // 计算 hash(用 core 函数,与 CLI 里逻辑一致)
  const tasksHash = computeTasksHash(tasksContent);
  const contentHash = await computeContentHash(changeDir);

  // 构建 .verify-passed marker
  const verifyMarker = {
    schema: 'forge-verify/v1',
    verified_at: '2026-05-04T12:00:00Z',
    verified_by: actor,
    tasks_hash: tasksHash,
    content_hash: contentHash,
    evidence: [
      {
        scenario_id: 's1',
        test_command: 'pnpm test',
        test_file: 'tests/login.test.ts',
        log_path: './logs/login.txt',
        log_hash: 'sha256:' + 'a'.repeat(64),
        pass: true,
      },
    ],
  };

  // 构建 .review-passed marker
  const reviewMarker = {
    schema: 'forge-review/v1',
    reviewed_at: '2026-05-04T13:00:00Z',
    reviewed_by: actor,
    tasks_hash: tasksHash,
    content_hash: contentHash,
    git: {
      is_git_repo: false,
    },
    review_outcomes: [],
  };

  writeFileSync(join(changeDir, '.verify-passed'), stringifyYAML(verifyMarker), 'utf8');
  writeFileSync(join(changeDir, '.review-passed'), stringifyYAML(reviewMarker), 'utf8');

  return changeDir;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('forge archive', () => {
  // Test 1: happy path — 手工铺合法 change → 成功 + 移到 archive/<date>-add-login/
  it('happy path:合法 change → archive 成功,change 移到 archive 目录', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-happy-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      // change 存在于 changes/
      expect(existsSync(join(changesDir, 'add-login'))).toBe(true);

      const r = runCli(['archive', 'add-login'], join(projectRoot));
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('archived');
      expect(r.stdout).toContain('add-login');

      // change 已从 changes/ 移走
      expect(existsSync(join(changesDir, 'add-login'))).toBe(false);

      // 移到了 changes/archive/<date>-add-login/
      const archiveDir = join(changesDir, 'archive');
      expect(existsSync(archiveDir)).toBe(true);
      const archiveEntries = readdirSync(archiveDir);
      expect(archiveEntries.some((e) => e.endsWith('-add-login'))).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test 2: 缺 .verify-passed → archive 拒绝 exit 2
  it('缺 .verify-passed → archive 拒绝 exit 2,stderr 含缺 .verify-passed', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-noverify-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      // 删除 .verify-passed
      const verifyPath = join(changesDir, 'add-login', '.verify-passed');
      rmSync(verifyPath);
      expect(existsSync(verifyPath)).toBe(false);

      const r = runCli(['archive', 'add-login'], projectRoot);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('.verify-passed');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test 3: 缺 .review-passed → archive 拒绝 exit 2
  it('缺 .review-passed → archive 拒绝 exit 2,stderr 含缺 .review-passed', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-noreview-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      // 删除 .review-passed
      const reviewPath = join(changesDir, 'add-login', '.review-passed');
      rmSync(reviewPath);
      expect(existsSync(reviewPath)).toBe(false);

      const r = runCli(['archive', 'add-login'], projectRoot);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('.review-passed');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test 4: hash 不匹配(verify-passed 里的 tasks_hash 与实际 tasks.md 不一致) → exit 2
  it('hash 不匹配(修改 tasks.md 后未重算 hash) → archive 拒绝 exit 2,stderr 含"已过期"', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-hashmismatch-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      // 修改 tasks.md 内容,让 hash 失效
      const tasksPath = join(changesDir, 'add-login', 'tasks.md');
      writeFileSync(tasksPath, '# Tasks\n\n- [ ] t1: extra task added\n- [ ] t2: more\n', 'utf8');

      const r = runCli(['archive', 'add-login'], projectRoot);
      expect(r.exitCode).toBe(2);
      // 错误信息包含"已过期"或"不匹配"
      expect(r.stderr).toMatch(/已过期|不匹配/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test 5: human-override + 没有 --force → 拒绝 exit 2
  it('human-override 标记但没有 --force → 拒绝 exit 2,stderr 含 human-override', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-override-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      // actor = 'human-override'
      await setupValidChange(changesDir, 'add-login', 'human-override');

      const r = runCli(['archive', 'add-login'], projectRoot);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('human-override');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test 6: human-override + --force → 成功接受
  it('human-override + --force → archive 成功', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-force-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      // actor = 'human-override'
      await setupValidChange(changesDir, 'add-login', 'human-override');

      const r = runCli(['archive', 'add-login', '--force'], projectRoot);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('archived');

      // change 已从 changes/ 移走
      expect(existsSync(join(changesDir, 'add-login'))).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test 7: --recover 模式,无半完成状态 → exit 0,stdout 含"无半完成"
  it('--recover 模式,干净状态 → exit 0,stdout 含"无半完成状态需要恢复"', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-recover-clean-'));
    try {
      setupForgeRoot(projectRoot);

      const r = runCli(['archive', '--recover'], projectRoot);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('无半完成状态需要恢复');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test 8: --recover case A — archive 存在但无 backup → 重跑 Sync → exit 0
  it('--recover case A:archive 存在但无 backup → 重跑 Sync 完成 → exit 0', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-recover-a-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      // 模拟 case A:change 已 rename 到 archive/ 但没跑 Sync(无 backup)
      const archiveDir = join(changesDir, 'archive', '2026-05-04-add-login');
      mkdirSync(join(archiveDir, 'specs'), { recursive: true });
      // 写一个 spec 文件到 archive specs/
      writeFileSync(
        join(archiveDir, 'specs', 'login.md'),
        '# Login Spec\n\n## Scenario: x\n\n**Given** g\n**When** w\n**Then** t\n',
        'utf8',
      );

      // 当前 forge/specs/ 是空的(已在 setupForgeRoot 里创建)
      const forgeSpecsDir = join(projectRoot, 'forge', 'specs');
      expect(existsSync(forgeSpecsDir)).toBe(true);

      const r = runCli(['archive', '--recover'], projectRoot);
      expect(r.exitCode).toBe(0);
      // case A 消息
      expect(r.stdout).toContain('case A');

      // forge/specs/ 里应该有 login.md 了(Sync 已应用)
      expect(existsSync(join(forgeSpecsDir, 'login.md'))).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test 9: 缺少 changeId(无 --recover) → exit 1
  it('无 changeId 且无 --recover → exit 1', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-noid-'));
    try {
      setupForgeRoot(projectRoot);
      const r = runCli(['archive'], projectRoot);
      // commander 会因为 argument 缺失而非零退出,或我们自己 exit(1)
      expect(r.exitCode).not.toBe(0);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
