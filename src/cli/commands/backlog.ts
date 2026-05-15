// src/cli/commands/backlog.ts
// plan-backlog-registry Task 6 — forge backlog / list / --check

import { Command } from 'commander';
import { join } from 'node:path';
import { generateBacklog, buildBacklog, checkBacklogStale } from '../../core/backlog/index.js';

export function buildBacklogCommand(): Command {
  const backlog = new Command('backlog').description(
    '生成 / 查询 forge/backlog/ 注册表(active.md + archived.md)',
  );

  // forge backlog [--check]:默认重生成;--check 只比对不写
  backlog
    .option('--check', '只比对磁盘与重生成结果,陈旧则 exit 1,不写盘')
    .action(async (opts: { check?: boolean }) => {
      try {
        const forgeRoot = join(process.cwd(), 'forge');
        if (opts.check) {
          const stale = await checkBacklogStale(forgeRoot);
          if (stale.length > 0) {
            process.stderr.write(
              `✗ backlog 陈旧:${stale.join(', ')} —— 跑 \`forge backlog\` 重生成\n`,
            );
            process.exit(1);
          }
          process.stdout.write('✓ backlog 与 archived changes 一致\n');
          process.exit(0);
        }
        const r = await generateBacklog(forgeRoot);
        process.stdout.write(
          `✓ backlog 已生成:forge/backlog/active.md (${r.openCount} open, ${r.warningCount} warnings)\n`,
        );
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`✗ backlog failed: ${msg}\n`);
        process.exit(2);
      }
    });

  // forge backlog list:把当前未决 backlog(同 active.md 内容)打到 stdout,不落盘
  backlog
    .command('list')
    .description('打印当前未决 backlog(不落盘)')
    .action(async () => {
      try {
        const forgeRoot = join(process.cwd(), 'forge');
        const built = await buildBacklog(forgeRoot);
        process.stdout.write(built.activeMd);
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`✗ backlog list failed: ${msg}\n`);
        process.exit(2);
      }
    });

  return backlog;
}
