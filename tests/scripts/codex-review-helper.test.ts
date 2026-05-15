// tests/scripts/codex-review-helper.test.ts
// B-full wrapper helper integration tests
//
// Test scope:
// - build-prompt 子命令:模板变量替换 / 默认值 / 错误处理 / --stage+--mode 模板推导
// - run 子命令:错误处理(不真调 codex,会真花钱)
//              --mode dispatch 验证(通过 stub codex 捕获 argv)
// - harness-compat:helper source 不引用 Claude Code-specific 环境变量
//
// 不在 scope:
// - run 子命令真调 codex(需 ANTHROPIC API key + 花钱;留 manual smoke test)
// - 完整 framework runner(plan-stage-extensions-framework Task 5)

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
  opts?: { cwd?: string; env?: Record<string, string> },
): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync('node', [HELPER, ...args], {
    cwd: opts?.cwd ?? process.cwd(),
    env: opts?.env,
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

// 创建 stub codex 脚本:把接收到的 argv[2..] 写入 argvFile 后立即退出 0
// 用 node 脚本实现跨平台兼容(无需 .sh / .cmd)
// 返回一个包含 stub 脚本路径和 argv 记录文件路径的对象
function makeStubCodex(dir: string): { stubBin: string; argvFile: string } {
  const argvFile = join(dir, 'codex-argv.json');
  const stubScript = join(dir, 'codex.mjs');

  // stub 脚本:将 process.argv.slice(2) 写入 argvFile 并退出 0
  writeFileSync(
    stubScript,
    `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));
process.exit(0);
`,
    'utf-8',
  );

  // Windows 上 shell:true 会查 PATH 找 codex.cmd / codex;
  // 创建一个 codex.cmd 包装器来调用 node stub
  const stubCmd = join(dir, 'codex.cmd');
  writeFileSync(stubCmd, `@node "${stubScript}" %*\r\n`, 'utf-8');

  // 同时在 Unix 下创建无扩展名的 codex stub(Git-Bash / Linux CI 用)
  const stubUnix = join(dir, 'codex');
  writeFileSync(
    stubUnix,
    `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));\nprocess.exit(0);\n`,
    'utf-8',
  );

  return { stubBin: dir, argvFile };
}

// 读取 stub codex 记录到的 argv 数组
function readStubArgv(argvFile: string): string[] {
  try {
    return JSON.parse(readFileSync(argvFile, 'utf-8')) as string[];
  } catch {
    return [];
  }
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

  // ──────────────────────────────────────────────────────────────
  // 新增测试 1:build-prompt --stage + --mode 模板推导 fallback 链
  // ──────────────────────────────────────────────────────────────
  it('[new-1] --stage + --mode: 不存在的 stage-mode.md 时 fallback 到 adversarial-default.md', () => {
    // 使用一个不存在的 stage/mode 组合 → 预期 fallback 到 adversarial-default.md
    const d = makeTempDir();
    const outFile = join(d, 'out.md');

    const result = spawnNode([
      'build-prompt',
      '--stage',
      'nonexistent-stage',
      '--mode',
      'adversarial',
      '--output',
      outFile,
    ]);

    expect(result.exitCode).toBe(0);
    // stderr 应包含 fallback 警告
    expect(result.stderr).toContain('fallback');
    // 输出文件应来自 adversarial-default.md(含 <role> 标记)
    const generated = readFileSync(outFile, 'utf-8');
    expect(generated).toContain('<role>');
    expect(generated).not.toMatch(/\{\{[A-Z_]+\}\}/);
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

  // ──────────────────────────────────────────────────────────────
  // 新增测试 2:run --mode code-review → spawn `codex review`
  // ──────────────────────────────────────────────────────────────
  it('[new-2] --mode code-review: spawns `codex review` (stub codex, no real API call)', () => {
    const d = makeTempDir();
    const { stubBin, argvFile } = makeStubCodex(d);

    // 注入 stub 目录到 PATH 最前,让 helper spawn 到 stub codex
    const result = spawnNode(['run', '--mode', 'code-review'], {
      env: {
        ...(Object.fromEntries(
          Object.entries(process.env).filter(([, v]) => v !== undefined),
        ) as Record<string, string>),
        PATH: `${stubBin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      },
    });

    // stub codex 退出 0
    expect(result.exitCode).toBe(0);
    // stderr 应提示 spawning codex review
    expect(result.stderr).toContain('codex review');

    // stub 记录的 argv 第一个元素应是 'review'
    const argv = readStubArgv(argvFile);
    expect(argv[0]).toBe('review');
  });

  // ──────────────────────────────────────────────────────────────
  // 新增测试 3:run --mode adversarial --thread-id → spawn `codex exec resume <id>`
  // ──────────────────────────────────────────────────────────────
  it('[new-3] --mode adversarial --thread-id cdx-123: spawns `codex exec resume cdx-123`', () => {
    const d = makeTempDir();
    const { stubBin, argvFile } = makeStubCodex(d);

    // 创建一个临时 prompt 文件
    const promptFile = join(d, 'prompt.md');
    writeFileSync(promptFile, 'test prompt content', 'utf-8');

    const result = spawnNode(
      ['run', '--mode', 'adversarial', '--thread-id', 'cdx-123', '--prompt-file', promptFile],
      {
        env: {
          ...(Object.fromEntries(
            Object.entries(process.env).filter(([, v]) => v !== undefined),
          ) as Record<string, string>),
          PATH: `${stubBin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
        },
      },
    );

    expect(result.exitCode).toBe(0);
    // stderr 应提示 spawning codex exec resume cdx-123
    expect(result.stderr).toContain('exec resume cdx-123');

    // stub 记录的 argv:['exec', 'resume', 'cdx-123']
    const argv = readStubArgv(argvFile);
    expect(argv[0]).toBe('exec');
    expect(argv[1]).toBe('resume');
    expect(argv[2]).toBe('cdx-123');
  });

  // ──────────────────────────────────────────────────────────────
  // 新增测试 4:run --mode rescue → 同 adversarial 代码路径(codex exec)
  // ──────────────────────────────────────────────────────────────
  it('[new-4] --mode rescue: goes through codex exec code path (same as adversarial)', () => {
    const d = makeTempDir();
    const { stubBin, argvFile } = makeStubCodex(d);

    const promptFile = join(d, 'prompt.md');
    writeFileSync(promptFile, 'rescue prompt', 'utf-8');

    const result = spawnNode(['run', '--mode', 'rescue', '--prompt-file', promptFile], {
      env: {
        ...(Object.fromEntries(
          Object.entries(process.env).filter(([, v]) => v !== undefined),
        ) as Record<string, string>),
        PATH: `${stubBin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      },
    });

    expect(result.exitCode).toBe(0);
    // stderr 应提示 spawning codex exec
    expect(result.stderr).toContain('codex exec');

    // stub 记录的 argv 第一个元素应是 'exec'(非 review)
    const argv = readStubArgv(argvFile);
    expect(argv[0]).toBe('exec');
    // 无 thread-id → 不含 'resume'
    expect(argv).not.toContain('resume');
  });

  // ──────────────────────────────────────────────────────────────
  // 新增测试 5:无 --thread-id → codex 调用不含 resume(新会话)
  // ──────────────────────────────────────────────────────────────
  it('[new-5] no --thread-id (or empty): codex invoked WITHOUT resume subcommand', () => {
    const d = makeTempDir();
    const { stubBin, argvFile } = makeStubCodex(d);

    const promptFile = join(d, 'prompt.md');
    writeFileSync(promptFile, 'new session prompt', 'utf-8');

    // 不传 --thread-id
    const result = spawnNode(['run', '--prompt-file', promptFile], {
      env: {
        ...(Object.fromEntries(
          Object.entries(process.env).filter(([, v]) => v !== undefined),
        ) as Record<string, string>),
        PATH: `${stubBin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      },
    });

    expect(result.exitCode).toBe(0);

    // stub argv 应为 ['exec'],不含 'resume'
    const argv = readStubArgv(argvFile);
    expect(argv[0]).toBe('exec');
    expect(argv).not.toContain('resume');
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
