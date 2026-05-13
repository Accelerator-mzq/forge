// src/cli/commands/preflight.ts — plan-9h Task 1
// 实施前置 check 子命令组(首个 preflight 命令组,commander 嵌套 addCommand)
// 沿 spec §2.8.3 C 实施码 + spec §2.8.5 第 3 项 CLI helper 设计

import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../../core/parse/yaml.js';
import { DEFAULT_PROTECTED_BRANCHES } from '../../core/schema/types.js';

/**
 * 内联私有 helper(plan-9h Q8 决策:不抽共享模块 src/core/git/utils.ts)
 * 探测当前目录是否在 git work tree 内。
 * 沿 src/core/migrate/index.ts:65-72 同模式(execFileSync + try/catch)。
 */
function isGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 内联私有 helper(plan-9h Q8 决策)
 * 拿当前分支名(`git rev-parse --abbrev-ref HEAD`)。
 * 调用前应已 `isGitRepo(cwd) === true` 守卫,否则 throw。
 */
function getCurrentBranch(cwd: string): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd,
    encoding: 'utf-8',
  }).trim();
}

/**
 * 构建 `forge preflight` 子命令组(沿 spec §2.8.5 第 3 项)。
 * 当前含一个子命令 `branch-check`;后续 v1.1+ 可扩(git clean check / evidence fresh check 等)。
 */
export function buildPreflightCommand(): Command {
  const cmd = new Command('preflight').description('实施前置 check(分支保护等;plan-9h §2.8)');

  cmd
    .command('branch-check [changeId]')
    .description('check current branch vs protected_branches config(沿 design §2.8.3 C)')
    .option('--allow-protected-branch', '显式覆盖保护(stderr 留 warning,exit 0)')
    .action((changeId: string | undefined, opts: { allowProtectedBranch?: boolean }) => {
      const cwd = process.cwd();

      // 非 git 项目:graceful skip(沿 v0.4 降级模式 + design §2.8.3 C line 1443)
      if (!isGitRepo(cwd)) {
        return; // exit 0
      }

      // 读 protected_branches:优先 forge/config.yaml,缺失 fallback DEFAULT_PROTECTED_BRANCHES
      const configPath = join(cwd, 'forge', 'config.yaml');
      let protectedBranches: readonly string[] = DEFAULT_PROTECTED_BRANCHES;
      if (existsSync(configPath)) {
        try {
          const config = parseConfig(readFileSync(configPath, 'utf-8'));
          if (Array.isArray(config.protected_branches)) {
            protectedBranches = config.protected_branches;
          }
        } catch (err) {
          // parse 失败 → 视为 config 错误,exit 2(沿 §3.12.3 freeze)
          console.error(`forge preflight: 解析 forge/config.yaml 失败: ${(err as Error).message}`);
          process.exit(2);
        }
      }

      const currentBranch = getCurrentBranch(cwd);

      // 非保护分支 → 通过
      if (!protectedBranches.includes(currentBranch)) {
        return; // exit 0
      }

      // 在保护分支:有 --allow-protected-branch flag → exit 0 + stderr warning
      if (opts.allowProtectedBranch) {
        console.error(
          `forge preflight: 当前分支 '${currentBranch}' 是保护分支,` +
            `用户传 --allow-protected-branch 显式覆盖。build/CI 风险自负。`,
        );
        return; // exit 0
      }

      // 默认拒签 → exit 2 + stderr 具体建议
      const suggestedBranch = changeId ? `feature/${changeId}` : `feature/<your-change-id>`;
      console.error(
        `forge preflight: 当前分支 '${currentBranch}' 是保护分支,拒绝在保护分支实施。\n` +
          `建议: git checkout -b ${suggestedBranch},或加 --allow-protected-branch 覆盖`,
      );
      process.exit(2);
    });

  return cmd;
}
