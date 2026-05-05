// CLI 集成测试 helper — 用 spawnSync 子进程跑 dist/cli/index.js
// 改用 spawnSync 以便同时捕获 stdout 和 stderr(无论 exit code)
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_ENTRY = resolve(__dirname, '../../dist/cli/index.js');

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCli(args: string[], cwd: string): RunResult {
  const result = spawnSync('node', [CLI_ENTRY, ...args], {
    cwd,
    encoding: 'utf8',
    // 捕获 stdout / stderr,无论进程以何退出码结束
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}
