// tests/scripts/codex-review-helper.test.ts
// B-full wrapper helper integration tests
//
// Test scope:
// - build-prompt 子命令:模板变量替换 / 默认值 / 错误处理
// - run 子命令:错误处理(不真调 codex,会真花钱)
// - harness-compat:helper source 不引用 Claude Code-specific 环境变量
//
// 不在 scope:
// - run 子命令真调 codex(需 ANTHROPIC API key + 花钱;留 manual smoke test)
// - 完整 framework runner(plan-stage-extensions-framework Task 5)

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HELPER = join(process.cwd(), 'scripts', 'codex-review-helper.mjs');
const TEMPLATE = join(
  process.cwd(),
  'src',
  'core',
  'codex-review',
  'prompts',
  'adversarial-default.md',
);

// 跨平台 spawn node — Windows 上 node.exe 在 PATH 里(沿 preflight.test.ts 同模式)
function spawnNode(
  args: string[],
  opts?: { cwd?: string },
): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync('node', [HELPER, ...args], {
    cwd: opts?.cwd ?? process.cwd(),
    encoding: 'utf-8',
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

let tmpDirs: string[] = [];

afterEach(() => {
  // 清理 tmpdir
  for (const d of tmpDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {}
  }
  tmpDirs = [];
});

function makeTempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forge-codex-helper-test-'));
  tmpDirs.push(d);
  return d;
}

describe('codex-review-helper --help', () => {
  it('prints usage with both subcommands', () => {
    const result = spawnNode(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('build-prompt');
    expect(result.stdout).toContain('run');
    expect(result.stdout).toContain('harness-agnostic');
  });

  it('prints usage when no args given', () => {
    const result = spawnNode([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('build-prompt');
  });
});

describe('codex-review-helper build-prompt', () => {
  it('replaces {{USER_FOCUS}} and {{TARGET_LABEL}} variables', () => {
    const d = makeTempDir();
    const outFile = join(d, 'out.md');

    const result = spawnNode([
      'build-prompt',
      '--template',
      TEMPLATE,
      '--output',
      outFile,
      '--user-focus',
      'Test focus text',
      '--target-label',
      'test-branch',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('prompt written');

    const generated = readFileSync(outFile, 'utf-8');
    expect(generated).toContain('Focus: Test focus text');
    expect(generated).toContain('Target: test-branch');
    // assert no unreplaced {{VAR}}
    expect(generated).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('uses default values when --user-focus / --target-label omitted', () => {
    const d = makeTempDir();
    const outFile = join(d, 'out.md');

    const result = spawnNode(['build-prompt', '--template', TEMPLATE, '--output', outFile]);

    expect(result.exitCode).toBe(0);
    const generated = readFileSync(outFile, 'utf-8');
    expect(generated).toContain('Focus: (none provided)');
    expect(generated).toContain('Target: current branch');
  });

  it('fails when --template path does not exist', () => {
    const d = makeTempDir();
    const result = spawnNode([
      'build-prompt',
      '--template',
      join(d, 'nonexistent-template.md'),
      '--output',
      join(d, 'out.md'),
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('模板文件不存在');
  });

  it('fails when --template / --output missing', () => {
    const result = spawnNode(['build-prompt']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('需要 --template');
  });

  it('creates output directory if missing', () => {
    const d = makeTempDir();
    const nestedOut = join(d, 'nested', 'deep', 'out.md');

    const result = spawnNode(['build-prompt', '--template', TEMPLATE, '--output', nestedOut]);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(nestedOut, 'utf-8')).toContain('<role>');
  });
});

describe('codex-review-helper run', () => {
  it('fails when --prompt-file missing', () => {
    const result = spawnNode(['run']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('需要 --prompt-file');
  });

  it('fails when --prompt-file does not exist', () => {
    const d = makeTempDir();
    const result = spawnNode(['run', '--prompt-file', join(d, 'nonexistent-prompt.md')]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('prompt 文件不存在');
  });

  it('rejects unknown subcommand', () => {
    const result = spawnNode(['unknown-subcmd']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('未知子命令');
  });
});

describe('codex-review-helper harness-agnostic', () => {
  it('helper source does not reference Claude Code-specific env vars', () => {
    const helperSource = readFileSync(HELPER, 'utf-8');

    // assert helper itself (除注释外) 不引用 ${CLAUDE_PLUGIN_ROOT} / ${FORGE_PLUGIN_ROOT}
    // 这些变量是 harness-specific,绑死会破坏跨 harness 接口
    //
    // 允许在注释 / 文档段 mention 这些字符串(注释里只是说"不依赖"的字面说明)
    // 用简单规则:删除所有注释行后再检查

    const codeOnly = helperSource
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');

    // 在代码部分(不含注释)不应有 process.env.CLAUDE_PLUGIN_ROOT 或类似引用
    expect(codeOnly).not.toMatch(/process\.env\.CLAUDE_PLUGIN_ROOT/);
    expect(codeOnly).not.toMatch(/process\.env\.FORGE_PLUGIN_ROOT/);
  });

  it('all path arguments come from CLI not env vars', () => {
    // 跑 build-prompt 不预设任何 env var 也能工作(harness-agnostic 证明)
    const d = makeTempDir();
    const outFile = join(d, 'out.md');

    const result = spawnSync(
      'node',
      [HELPER, 'build-prompt', '--template', TEMPLATE, '--output', outFile],
      {
        env: {
          // 清空相关 env var(模拟非 Claude Code 环境)
          PATH: process.env.PATH ?? '',
          // 故意不设 CLAUDE_PLUGIN_ROOT / FORGE_PLUGIN_ROOT
        },
        encoding: 'utf-8',
      },
    );

    expect(result.status).toBe(0);
  });
});
