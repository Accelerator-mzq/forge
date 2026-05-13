// tests/cli/preflight.test.ts — plan-9h Task 1 RED 失败基线
// 沿 plan-9j / plan-9g e2e CLI 测试模式,用 execFileSync spawn 真 CLI

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// CLI 入口(沿 plan-9j / plan-9g 同模式)
const CLI = join(process.cwd(), 'dist', 'cli', 'index.js');

// 测试 helper:在 tempdir 建 git repo + 切到指定分支
function setupGitRepo(branch: string, opts?: { configYaml?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge-preflight-test-'));
  // v1 self-review MINOR-1 修订:用 -b main 显式指定初始分支(沿 tests/core/hash/diff.test.ts:15 先例),避免 git default branch flakiness
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.local'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  // 初始 commit 让 HEAD 可解析为分支(空 repo 的 HEAD 是 unborn)
  writeFileSync(join(dir, 'README.md'), '# test\n');
  execFileSync('git', ['add', 'README.md'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  // 切到目标分支(若非 main/master,需 git checkout -b)
  // master 分支需求由 `git branch -m master` 实现(--initial-branch 已固定 main)
  if (branch === 'master') {
    execFileSync('git', ['branch', '-m', 'master'], { cwd: dir });
  } else if (branch !== 'main') {
    execFileSync('git', ['checkout', '-q', '-b', branch], { cwd: dir });
  }
  // 写 forge/config.yaml(若 opts.configYaml)
  if (opts?.configYaml) {
    mkdirSync(join(dir, 'forge'), { recursive: true });
    writeFileSync(join(dir, 'forge', 'config.yaml'), opts.configYaml);
  }
  return dir;
}

describe('forge preflight branch-check', () => {
  let testDir: string;
  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Windows occasionally locks files; ignore cleanup error
      }
    }
  });

  it('case 1: 在 main 分支无 flag → exit 2 + stderr "保护分支"', () => {
    testDir = setupGitRepo('main');
    const result = spawnSync('node', [CLI, 'preflight', 'branch-check'], {
      cwd: testDir,
      encoding: 'utf-8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('保护分支');
    expect(result.stderr).toContain("'main'");
  });

  it('case 2: 在 main 分支有 --allow-protected-branch → exit 0 + stderr "风险自负"', () => {
    testDir = setupGitRepo('main');
    const result = spawnSync(
      'node',
      [CLI, 'preflight', 'branch-check', '--allow-protected-branch'],
      { cwd: testDir, encoding: 'utf-8' },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('风险自负');
  });

  it('case 3: 在 feature/foo 分支 → exit 0 + stderr 空', () => {
    testDir = setupGitRepo('feature/foo');
    const result = spawnSync('node', [CLI, 'preflight', 'branch-check'], {
      cwd: testDir,
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');
  });

  it('case 4: main 分支传 changeId="my-change" → exit 2 + stderr 含 "feature/my-change"', () => {
    testDir = setupGitRepo('main');
    const result = spawnSync('node', [CLI, 'preflight', 'branch-check', 'my-change'], {
      cwd: testDir,
      encoding: 'utf-8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('feature/my-change');
  });

  it('case 5: 非 git 项目 → exit 0 graceful skip', () => {
    testDir = mkdtempSync(join(tmpdir(), 'forge-preflight-nongit-'));
    const result = spawnSync('node', [CLI, 'preflight', 'branch-check'], {
      cwd: testDir,
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');
  });

  it('case 6: config 自定义 protected_branches=[trunk] → 在 main 分支 exit 0', () => {
    testDir = setupGitRepo('main', {
      configYaml: 'schema: forge-spec-driven/v1\nprotected_branches:\n  - trunk\n',
    });
    const result = spawnSync('node', [CLI, 'preflight', 'branch-check'], {
      cwd: testDir,
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');
  });
});
