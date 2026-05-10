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

// 支持可选 env 参数,用于 CI 模式等需要覆盖环境变量的测试场景
export function runCli(args: string[], cwd: string, env?: NodeJS.ProcessEnv): RunResult {
  const result = spawnSync('node', [CLI_ENTRY, ...args], {
    cwd,
    encoding: 'utf8',
    // 捕获 stdout / stderr,无论进程以何退出码结束
    // 若传入 env,则与当前进程环境合并(覆盖指定字段);否则直接继承
    env: env !== undefined ? { ...process.env, ...env } : process.env,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}
