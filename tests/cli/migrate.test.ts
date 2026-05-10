// tests/cli/migrate.test.ts
// Task 6.1:forge migrate CLI 端到端测(exit code + dry-run + lock 友好文案)
// Task 6.5:SIGINT process.once 不累积测(codex C2)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrate } from '../../src/core/migrate/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CLI 二进制路径(pnpm build 产物)
const FORGE_CLI = join(__dirname, '../../dist/cli/index.js');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * 执行 forge migrate <args>,不抛异常
 * catch 后返回 stdout/stderr/code
 */
function runForge(args: string[], cwd: string): RunResult {
  try {
    const stdout = execFileSync('node', [FORGE_CLI, 'migrate', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as {
      status?: number;
      stdout?: Buffer | string;
      stderr?: Buffer | string;
    };
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

// ============================================================================
// Task 6.1:CLI 端到端测
// ============================================================================

describe('forge migrate CLI 端到端', () => {
  let tmp: string;

  beforeEach(async () => {
    // 每个 case 独立临时目录
    tmp = await mkdtemp(join(tmpdir(), 'forge-cli-migrate-'));
  });

  afterEach(async () => {
    // 清理临时目录
    await rm(tmp, { recursive: true, force: true });
  });

  it('参数缺失 → exit 非 0 + stderr 提示 source', () => {
    // forge migrate(无 <source> 参数)→ commander 报 missing argument
    const r = runForge([], tmp);
    expect(r.code).not.toBe(0);
    // commander 的 missing argument 文案中含 source 或 argument 字样
    expect(r.stderr.toLowerCase()).toMatch(/source|argument/);
  });

  it("source 非 'openspec'/'superpowers' → exit 非 0,错误文案含有效选项提示", () => {
    // CLI 自己校验:source !== openspec && !== superpowers → process.exit(2)
    const r = runForge(['unknown'], tmp);
    expect(r.code).not.toBe(0);
    // CLI 打印 openspec 或 superpowers 提示
    const combined = r.stderr + r.stdout;
    expect(combined.toLowerCase()).toMatch(/openspec|superpowers|invalid|unknown/);
  });

  it('源目录不存在 → exit 2,stderr 提示找不到源', () => {
    // forge migrate openspec — 当前目录无 openspec/ → detect.found === false
    const r = runForge(['openspec'], tmp);
    expect(r.code).toBe(2);
    // runMigrate 打出 source <openspec> not found 文案
    expect(r.stderr).toMatch(/openspec.*not found|not.*found/i);
  });

  it('--dry-run 不写 forge/ 文件(只建 .cache bootstrap)', async () => {
    // 构造最小 openspec 目录结构
    await mkdir(join(tmp, 'openspec', 'specs', 'foo'), { recursive: true });
    await writeFile(join(tmp, 'openspec', 'specs', 'foo', 'spec.md'), '# Foo\n');

    const r = runForge(['openspec', '--dry-run', '--no-regenerate'], tmp);
    expect(r.code).toBe(0);
    // dry-run 输出包含 source= 信息
    expect(r.stdout).toContain('source=openspec');
    // forge/specs/foo/spec.md 不应写入(dry-run 模式不写盘)
    expect(existsSync(join(tmp, 'forge/specs/foo/spec.md'))).toBe(false);
  });

  it('LockHeldError 友好文案(stderr 含 lock 关键字,不含 forge archive 误导)', async () => {
    // 模拟 migrate.lock 被当前进程持有:pid = process.pid → isPidAlive check 通过 → 触发 LockHeldError
    // lock 实际路径:forge/.cache/migrate.lock (acquireLockByPath(join(cwd,'forge'),'migrate','migrate.lock'))
    await mkdir(join(tmp, 'forge', '.cache'), { recursive: true });
    const lockPath = join(tmp, 'forge', '.cache', 'migrate.lock');
    await writeFile(
      lockPath,
      JSON.stringify({
        pid: process.pid, // 当前进程 pid → kill(pid,0) 通过 → 视为活锁
        started_at: new Date().toISOString(),
        mode: 'migrate',
      }),
    );
    // openspec/ 也要存在(先通过 detect 再碰到锁)
    await mkdir(join(tmp, 'openspec'), { recursive: true });

    const r = runForge(['openspec', '--no-regenerate', '--dry-run'], tmp);
    // LockHeldError → exit 1(runMigrate 返回 1)
    // stderr 含友好 lock 文案
    expect(r.stderr).toMatch(/blocked.*lock|lock.*blocked|migrate.*lock|in progress/i);
    // 关键反 case:不应误导用户以为是 archive 命令占锁
    expect(r.stderr).not.toMatch(/forge archive/);
  });
});

// ============================================================================
// Task 6.5:SIGINT process.once 不累积测试(codex C2)
// ============================================================================

describe('runMigrate SIGINT listener — 不累积(codex C2)', () => {
  it('多次 runMigrate 后 process.listenerCount("SIGINT") 不增长', async () => {
    // 构造临时 openspec 目录(dry-run 不写盘,快速)
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sigint-'));
    await mkdir(join(tmp, 'openspec', 'specs', 'foo'), { recursive: true });
    await writeFile(join(tmp, 'openspec', 'specs', 'foo', 'spec.md'), '# Foo\n');

    const originalCwd = process.cwd();
    // chdir 让 runMigrate 在临时目录执行,防污染主工作区
    process.chdir(tmp);
    try {
      const before = process.listenerCount('SIGINT');
      // 连跑两次 dry-run:每次应注册后再 off,不累积
      await runMigrate({ source: 'openspec', dryRun: true, noRegenerate: true });
      await runMigrate({ source: 'openspec', dryRun: true, noRegenerate: true });
      const after = process.listenerCount('SIGINT');
      // process.once + finally off → after === before(不累积)
      expect(after).toBe(before);
    } finally {
      // 无论测试成败,都恢复 cwd 防止污染其他测试
      process.chdir(originalCwd);
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
