// version-retrograde-fence.test.ts — plan-9j Task 4 单测
// 7 case 实测 + 1 it.todo:retrograde 拒签 / 非 git 跳过 / 合法 semver / tamper 检测 / 缺字段 / 上升路径 / **non-git fake gitDir best-effort**(v7 MAJOR 1 真名实对齐)+ it.todo: git repo 内 log 失败 fail-closed

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateVersionRetrograde } from '../../../src/core/archive/version-retrograde-fence.js';

interface GitMarkerCtx {
  tmpRoot: string;
  markerPath: string;
}

function setupGitRepoWithMarker(history: string[]): GitMarkerCtx {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9j-retrograde-'));
  execFileSync('git', ['init', '-q'], { cwd: tmpRoot });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpRoot });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: tmpRoot });
  const markerPath = join(tmpRoot, '.verify-passed');
  for (const version of history) {
    const marker = `schema: forge-verify/v1
verified_at: 2026-05-12T14:30:00Z
verified_by: ai-agent
tasks_hash: sha256:${'a'.repeat(64)}
content_hash: sha256:${'b'.repeat(64)}
evidence: []
created_by_tool_version: '${version}'
`;
    writeFileSync(markerPath, marker, 'utf8');
    execFileSync('git', ['add', '.verify-passed'], { cwd: tmpRoot });
    execFileSync('git', ['commit', '-q', '-m', `bump to ${version}`], { cwd: tmpRoot });
  }
  return { tmpRoot, markerPath };
}

describe('validateVersionRetrograde', () => {
  const cleanupDirs: string[] = [];
  afterEach(() => {
    for (const d of cleanupDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('合法 retrograde 缺失(单 commit 1.0.0)→ 通过', async () => {
    const ctx = setupGitRepoWithMarker(['1.0.0']);
    cleanupDirs.push(ctx.tmpRoot);
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(ctx.markerPath, marker, ctx.tmpRoot);
    expect(result.valid).toBe(true);
  });

  it('retrograde 检测:历史含 1.0.0,当前 0.4.0 → 拒签', async () => {
    // 历史先 1.0.0 后改成 0.4.0
    const ctx = setupGitRepoWithMarker(['1.0.0', '0.4.0']);
    cleanupDirs.push(ctx.tmpRoot);
    const marker = { created_by_tool_version: '0.4.0' };
    const result = await validateVersionRetrograde(ctx.markerPath, marker, ctx.tmpRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /retrograde|tamper/.test(e.message))).toBe(true);
  });

  it('上升路径 0.4.0 → 1.0.0 → 通过', async () => {
    const ctx = setupGitRepoWithMarker(['0.4.0', '1.0.0']);
    cleanupDirs.push(ctx.tmpRoot);
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(ctx.markerPath, marker, ctx.tmpRoot);
    expect(result.valid).toBe(true);
  });

  it('非 git 项目 → 跳过(best-effort,沿 v0.4 git fence)', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9j-retrograde-nogit-'));
    cleanupDirs.push(tmpRoot);
    const markerPath = join(tmpRoot, '.verify-passed');
    writeFileSync(markerPath, 'schema: forge-verify/v1\ncreated_by_tool_version: 1.0.0\n');
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(markerPath, marker, tmpRoot);
    expect(result.valid).toBe(true);
  });

  it('marker 缺 created_by_tool_version 字段 → 跳过(老 marker 兼容)', async () => {
    const ctx = setupGitRepoWithMarker(['1.0.0']);
    cleanupDirs.push(ctx.tmpRoot);
    const marker = {}; // 无字段
    const result = await validateVersionRetrograde(ctx.markerPath, marker, ctx.tmpRoot);
    expect(result.valid).toBe(true);
  });

  // v7 MAJOR 1 修订(名实对齐):case 7 改为 non-git best-effort 真实测;
  //   真 git repo 内 git log 失败的 fail-closed 路径留作 it.todo + 9z release 解锁
  it('非 git path(fake gitDir,rev-parse 失败)→ best-effort 跳过(返 ok)— v3 MAJOR 1 非 git 路径', async () => {
    const fakeGitDir = mkdtempSync(join(tmpdir(), 'forge-9j-fake-git-'));
    cleanupDirs.push(fakeGitDir);
    const markerPath = join(fakeGitDir, '.verify-passed');
    writeFileSync(markerPath, 'schema: forge-verify/v1\ncreated_by_tool_version: 1.0.0\n');
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(markerPath, marker, fakeGitDir);
    expect(result.valid).toBe(true); // non-git best-effort
  });

  // v7 MAJOR 1:真 git repo 内 git log 失败 fail-closed 路径 — 用文件操作难模拟,留 it.todo + 9z release gate 解锁
  it.todo(
    'git repo 内 git log 命令失败(模拟 git binary 异常)→ fail-closed 拒签(v3 MAJOR 1;9z release plan 解锁 — 需要 mock spawn 或注入失败 child_process)',
  );

  it('历史含 2.0.0 prerelease,当前 1.0.0 → 拒签(prerelease 也算 retrograde)', async () => {
    const ctx = setupGitRepoWithMarker(['2.0.0-alpha.1', '1.0.0']);
    cleanupDirs.push(ctx.tmpRoot);
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(ctx.markerPath, marker, ctx.tmpRoot);
    expect(result.valid).toBe(false);
  });
});
