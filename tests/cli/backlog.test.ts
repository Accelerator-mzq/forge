import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildBacklogCommand } from '../../src/cli/commands/backlog.js';

describe('buildBacklogCommand 装配 (plan-backlog-registry Task 6)', () => {
  it('返回名为 backlog 的 Command,含 list 子命令', () => {
    const cmd = buildBacklogCommand();
    expect(cmd.name()).toBe('backlog');
    expect(cmd.commands.map((c) => c.name())).toContain('list');
  });

  it('backlog 顶层命令含 --check 选项', () => {
    const cmd = buildBacklogCommand();
    expect(cmd.options.map((o) => o.long)).toContain('--check');
  });
});

const FORGE_CLI = resolve(process.cwd(), 'dist/cli/index.js');
function runCli(cwd: string, args: string[]) {
  const r = spawnSync('node', [FORGE_CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe('forge backlog CLI 行为 (plan-backlog-registry Task 6)', () => {
  it('forge backlog:空 archive → exit 0 + 生成 active.md', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-bl-cli-'));
    mkdirSync(join(root, 'forge', 'changes', 'archive'), { recursive: true });
    const r = runCli(root, ['backlog']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/backlog 已生成/);
    expect(existsSync(join(root, 'forge', 'backlog', 'active.md'))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('forge backlog --check:一致 → exit 0;改脏 → exit 1', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-bl-cli-'));
    mkdirSync(join(root, 'forge', 'changes', 'archive'), { recursive: true });
    runCli(root, ['backlog']);
    expect(runCli(root, ['backlog', '--check']).code).toBe(0);
    writeFileSync(join(root, 'forge', 'backlog', 'active.md'), 'STALE');
    expect(runCli(root, ['backlog', '--check']).code).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it('forge backlog list:打印 active backlog 到 stdout,不落盘', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-bl-cli-'));
    mkdirSync(join(root, 'forge', 'changes', 'archive'), { recursive: true });
    const r = runCli(root, ['backlog', 'list']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('# Active Backlog');
    expect(existsSync(join(root, 'forge', 'backlog', 'active.md'))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('forge backlog:无 forge/changes/archive → exit 2', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-bl-cli-'));
    const r = runCli(root, ['backlog']);
    expect(r.code).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });
});
