// CLI 集成测试 helper — 用 spawn 子进程跑 dist/cli/index.js
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_ENTRY = resolve(__dirname, '../../dist/cli/index.js');

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCli(args: string[], cwd: string): RunResult {
  try {
    const stdout = execFileSync('node', [CLI_ENTRY, ...args], { cwd, encoding: 'utf8' });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.status ?? 1 };
  }
}
