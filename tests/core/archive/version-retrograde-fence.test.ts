// version-retrograde-fence.test.ts — plan-9j Task 4 单测
// 8 case 实测:retrograde 拒签 / 非 git 跳过 / 合法 semver / tamper 检测 / 缺字段 / 上升路径 / **non-git fake gitDir best-effort**(v7 MAJOR 1 真名实对齐)/ git repo 内 git log 失败 fail-closed(Task 2 解锁)

// vi.mock 必须在模块加载前执行(vitest 自动 hoist);
// factory 把 execFile 换成受控 mock,execFileSync 由 ...actual 保留真实 → setupGitRepoWithMarker 不受影响
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateVersionRetrograde } from '../../../src/core/archive/version-retrograde-fence.js';

// hoisted mock:在所有 import 之前替换 execFile,promisify 拿到 stub 引用
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  // execFileSync 保留真实实现,execFile 换成受控 mock
  return { ...actual, execFile: execFileMock };
});

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

  // 每个测试前把 execFileMock 转发到真实 execFile 并适配 callback 形态:
  // 真实 execFile callback 签名是 (err, stdout, stderr),
  // promisify 默认期望 (err, {stdout, stderr}) 形态 — 手动适配
  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    execFileMock.mockImplementation(
      (
        cmd: string,
        args: readonly string[],
        opts: unknown,
        cb: (e: Error | null, r?: { stdout: string; stderr: string }) => void,
      ) =>
        (actual.execFile as Function)(
          cmd,
          args,
          opts,
          (err: Error | null, stdout: string, stderr: string) => cb(err, { stdout, stderr }),
        ),
    );
  });

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
  //   真 git repo 内 git log 失败的 fail-closed 路径见下一 it()(Task 2 解锁)
  it('非 git path(fake gitDir,rev-parse 失败)→ best-effort 跳过(返 ok)— v3 MAJOR 1 非 git 路径', async () => {
    const fakeGitDir = mkdtempSync(join(tmpdir(), 'forge-9j-fake-git-'));
    cleanupDirs.push(fakeGitDir);
    const markerPath = join(fakeGitDir, '.verify-passed');
    writeFileSync(markerPath, 'schema: forge-verify/v1\ncreated_by_tool_version: 1.0.0\n');
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(markerPath, marker, fakeGitDir);
    expect(result.valid).toBe(true); // non-git best-effort
  });

  // v7 MAJOR 1:真 git repo 内 git log 失败 fail-closed 路径 — 用 vi.mock 注入 execFile 失败
  it('git repo 内 git log 失败 → fail-closed 拒签(v3 MAJOR 1)', async () => {
    // override 当次:rev-parse 成功(确认是 git repo),git log 失败(模拟 git binary 异常)
    // promisify(execFileMock) 默认取 callback 第 2 参为 resolve 值 → cb(null,{stdout}) 使 await 得 {stdout}
    execFileMock.mockImplementation(
      (
        _cmd: string,
        args: readonly string[],
        _opts: unknown,
        cb: (e: Error | null, r?: { stdout: string }) => void,
      ) => {
        if (args[0] === 'rev-parse')
          cb(null, { stdout: 'true\n' }); // 确认是 git repo
        else cb(new Error('git log: simulated binary failure')); // git log fail-closed
        return undefined as unknown as ReturnType<typeof import('node:child_process').execFile>;
      },
    );
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde('/tmp/fake/.verify-passed', marker, '/tmp/fake');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /fail-closed|git log/.test(e.message))).toBe(true);
  });

  it('历史含 2.0.0 prerelease,当前 1.0.0 → 拒签(prerelease 也算 retrograde)', async () => {
    const ctx = setupGitRepoWithMarker(['2.0.0-alpha.1', '1.0.0']);
    cleanupDirs.push(ctx.tmpRoot);
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(ctx.markerPath, marker, ctx.tmpRoot);
    expect(result.valid).toBe(false);
  });
});
