// forge archive 子命令集成测试
// 覆盖:happy path / 缺 marker / hash 不匹配 / human-override + --force / --recover
// P1/P2 新增:schema 类型限定 / evidence / non-git --force / outcomes / recover P2.1/P2.2

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYAML } from 'yaml';
import { computeTasksHash, computeContentHash, computeLogHash } from '../../src/core/hash/index.js';
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
 * @param withLogFile 是否在 logs/ 目录创建真实日志文件(用于 evidence 验证)
 * @returns           changeDir 路径
 */
async function setupValidChange(
  changesDir: string,
  changeId: string,
  actor: 'ai-agent' | 'human-override' = 'ai-agent',
  withLogFile = true,
): Promise<string> {
  const changeDir = join(changesDir, changeId);
  mkdirSync(join(changeDir, 'specs'), { recursive: true });
  mkdirSync(join(changeDir, 'logs'), { recursive: true });

  // 固定内容文件
  const proposalContent =
    '# Add Login\n\n## Why\nUsers need authentication.\n\n## What\nOAuth2 flow.\n';
  const designContent = '# Design\n\n## Architecture\nJWT tokens.\n';
  const tasksContent = '# Tasks\n\n- [ ] t1: implement login\n- [ ] t2: write tests\n';
  const specContent =
    '# Login Spec\n\n## Scenario: successful login\n\n**Given** valid credentials\n**When** user logs in\n**Then** token issued\n';
  const logContent = 'Test run at 2026-05-04\nAll tests passed\n';

  writeFileSync(join(changeDir, 'proposal.md'), proposalContent, 'utf8');
  writeFileSync(join(changeDir, 'design.md'), designContent, 'utf8');
  writeFileSync(join(changeDir, 'tasks.md'), tasksContent, 'utf8');
  writeFileSync(join(changeDir, 'specs', 'login.md'), specContent, 'utf8');

  // 写真实日志文件
  const logFilePath = join(changeDir, 'logs', 'login.txt');
  if (withLogFile) {
    writeFileSync(logFilePath, logContent, 'utf8');
  }

  // 计算 hash(用 core 函数,与 CLI 里逻辑一致)
  const tasksHash = computeTasksHash(tasksContent);
  const contentHash = await computeContentHash(changeDir);

  // 计算真实日志 hash
  let logHash: string;
  if (withLogFile) {
    logHash = await computeLogHash(logFilePath);
  } else {
    logHash = 'sha256:' + 'a'.repeat(64); // 占位(不会通过 evidence 验证)
  }

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
        log_hash: logHash,
        pass: true,
      },
    ],
  };

  // 构建 .review-passed marker(is_git_repo: false → 需要 --force)
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
  // 注意:is_git_repo: false → 需要 --force(P1.3 non-git 必须 --force)
  it('happy path:合法 change → archive 成功,change 移到 archive 目录', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-happy-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      // change 存在于 changes/
      expect(existsSync(join(changesDir, 'add-login'))).toBe(true);

      // is_git_repo: false → 需要 --force
      const r = runCli(['archive', 'add-login', '--force'], join(projectRoot));
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

      // 不传 --force → 先触发 human-override 检查(在 non-git 检查之前)
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

  // Test 8: P2.1 — 多个已完成 archive 历史 + 无 backup → recover 返回 clean(不误报 case A)
  it('P2.1:多个 archive 历史 + 无 backup → recover 返回 clean(不误判为半归档)', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-recover-p21-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      // 模拟已完成的 archive 历史(多条)
      const archiveDir = join(changesDir, 'archive');
      for (const entry of [
        '2026-05-01-feature-a',
        '2026-05-02-feature-b',
        '2026-05-04-feature-c',
      ]) {
        mkdirSync(join(archiveDir, entry, 'specs'), { recursive: true });
        writeFileSync(
          join(archiveDir, entry, 'specs', 'spec.md'),
          '# Spec\n\n## Scenario: x\n\n**Given** g\n**When** w\n**Then** t\n',
          'utf8',
        );
      }
      // 无 backup → 应该 clean

      const r = runCli(['archive', '--recover'], projectRoot);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('无半完成状态需要恢复');
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

  // ─── P1 新增测试 ────────────────────────────────────────────────────────────

  // Test P1.1: 把合法的 forge-review/v1 marker 写到 .verify-passed → archive 拒绝
  it('P1.1:.verify-passed 写入了 forge-review/v1 marker → archive 拒绝,stderr 含"必须是 forge-verify/v1"', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-p11-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      const changeDir = join(changesDir, 'add-login');
      const verifyPath = join(changeDir, '.verify-passed');

      // 重新计算正确 hash
      const tasksContent = '# Tasks\n\n- [ ] t1: implement login\n- [ ] t2: write tests\n';
      const tasksHash = computeTasksHash(tasksContent);
      const contentHash = await computeContentHash(changeDir);

      // 用 forge-review/v1 的 marker 写到 .verify-passed(类型错位)
      const wrongMarker = {
        schema: 'forge-review/v1', // 错误:应该是 forge-verify/v1
        reviewed_at: '2026-05-04T12:00:00Z',
        reviewed_by: 'ai-agent',
        tasks_hash: tasksHash,
        content_hash: contentHash,
        git: { is_git_repo: false },
        review_outcomes: [],
      };
      writeFileSync(verifyPath, stringifyYAML(wrongMarker), 'utf8');

      const r = runCli(['archive', 'add-login', '--force'], projectRoot);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('必须是 forge-verify/v1');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test P1.2a: evidence 中 pass=false → 拒绝
  it('P1.2a:evidence 中 pass=false → archive 拒绝,stderr 含 pass', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-p12a-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      const changeDir = join(changesDir, 'add-login');
      const verifyPath = join(changeDir, '.verify-passed');

      const tasksContent = '# Tasks\n\n- [ ] t1: implement login\n- [ ] t2: write tests\n';
      const tasksHash = computeTasksHash(tasksContent);

      // 先写日志文件,再计算 hash
      const logPath = join(changeDir, 'logs', 'login.txt');
      writeFileSync(logPath, 'Test run at 2026-05-04\nAll tests passed\n', 'utf8');
      const logHash = await computeLogHash(logPath);

      // 再计算包含日志的 contentHash
      const contentHash = await computeContentHash(changeDir);

      const badVerifyMarker = {
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
            pass: false, // 失败的测试
          },
        ],
      };
      writeFileSync(verifyPath, stringifyYAML(badVerifyMarker), 'utf8');

      // 更新 review marker 也要用新 contentHash
      const reviewPath = join(changeDir, '.review-passed');
      const reviewMarker = {
        schema: 'forge-review/v1',
        reviewed_at: '2026-05-04T13:00:00Z',
        reviewed_by: 'ai-agent',
        tasks_hash: tasksHash,
        content_hash: contentHash,
        git: { is_git_repo: false },
        review_outcomes: [],
      };
      writeFileSync(reviewPath, stringifyYAML(reviewMarker), 'utf8');

      const r = runCli(['archive', 'add-login', '--force'], projectRoot);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toMatch(/pass|evidence/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test P1.2b: evidence 中 log_path 不存在 → 拒绝
  it('P1.2b:evidence log_path 不存在 → archive 拒绝,stderr 含 log_path 或 evidence', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-p12b-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login', 'ai-agent', false); // 不创建日志文件

      const changeDir = join(changesDir, 'add-login');
      const verifyPath = join(changeDir, '.verify-passed');

      const tasksContent = '# Tasks\n\n- [ ] t1: implement login\n- [ ] t2: write tests\n';
      const tasksHash = computeTasksHash(tasksContent);
      const contentHash = await computeContentHash(changeDir);

      const badVerifyMarker = {
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
            log_path: './logs/nonexistent.txt', // 不存在的日志文件
            log_hash: 'sha256:' + 'a'.repeat(64),
            pass: true,
          },
        ],
      };
      writeFileSync(verifyPath, stringifyYAML(badVerifyMarker), 'utf8');

      // review marker 同步
      const reviewPath = join(changeDir, '.review-passed');
      const reviewMarker = {
        schema: 'forge-review/v1',
        reviewed_at: '2026-05-04T13:00:00Z',
        reviewed_by: 'ai-agent',
        tasks_hash: tasksHash,
        content_hash: contentHash,
        git: { is_git_repo: false },
        review_outcomes: [],
      };
      writeFileSync(reviewPath, stringifyYAML(reviewMarker), 'utf8');

      const r = runCli(['archive', 'add-login', '--force'], projectRoot);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toMatch(/log_path|evidence|不存在/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test P1.3a: non-git review 无 --force → 拒绝
  it('P1.3a:non-git review 无 --force → archive 拒绝,stderr 含 non-git 或 --force', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-p13a-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      // 不传 --force
      const r = runCli(['archive', 'add-login'], projectRoot);
      expect(r.exitCode).toBe(2);
      // 可能先触发 human-override 或 non-git 检查
      // ai-agent → 不触发 human-override → 触发 non-git
      expect(r.stderr).toMatch(/非 git|--force|non-git/i);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test P1.3b: non-git review + --force → 接受
  it('P1.3b:non-git review + --force → archive 成功', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-p13b-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      const r = runCli(['archive', 'add-login', '--force'], projectRoot);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('archived');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // Test P1.3c: review_outcomes accepted=true + resolved=false → 拒绝
  it('P1.3c:review_outcomes 含 accepted=true + resolved=false → archive 拒绝,stderr 含 review_outcomes', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'forge-archive-p13c-'));
    try {
      const changesDir = setupForgeRoot(projectRoot);
      await setupValidChange(changesDir, 'add-login');

      const changeDir = join(changesDir, 'add-login');
      const reviewPath = join(changeDir, '.review-passed');

      const tasksContent = '# Tasks\n\n- [ ] t1: implement login\n- [ ] t2: write tests\n';
      const tasksHash = computeTasksHash(tasksContent);
      const contentHash = await computeContentHash(changeDir);

      // review_outcomes 中 accepted=true 但 resolved=false
      const badReviewMarker = {
        schema: 'forge-review/v1',
        reviewed_at: '2026-05-04T13:00:00Z',
        reviewed_by: 'ai-agent',
        tasks_hash: tasksHash,
        content_hash: contentHash,
        git: { is_git_repo: false },
        review_outcomes: [
          {
            severity: 'S',
            accepted: true,
            resolved: false, // accepted=true 但 resolved=false → 违规
            task_ref: 'T1',
          },
        ],
      };
      writeFileSync(reviewPath, stringifyYAML(badReviewMarker), 'utf8');

      const r = runCli(['archive', 'add-login', '--force'], projectRoot);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toMatch(/review_outcomes|resolved/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
