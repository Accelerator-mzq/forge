// src/cli/commands/migrate.ts
// forge migrate <source> 子命令 — Plan 8a Task 1.7
// 对应 spec §1.4 CLI 形态(8 个选项)+ §3.3 LockHeldError 友好 catch

import { Command } from 'commander';
import { runMigrate } from '../../core/migrate/index.js';
import type { SourceId } from '../../core/migrate/types.js';

export function buildMigrateCommand(): Command {
  return new Command('migrate')
    .description('搬运已有 OpenSpec / superpowers 项目仓库到 forge 工作目录')
    .argument('<source>', "源类型:'openspec' 或 'superpowers'(必填,不自动猜)")
    .option('--no-regenerate', '不调 LLM 补缺件;失败件标 [needs-fix],不阻塞 cp')
    .option('--dry-run', '只扫描 + 出 plan + 输出报告,不写 forge/')
    .option('--force', '冲突时旧目标 mv 到 forge/.forge-trash/<ts>/(留 24h 兜底)再覆盖')
    .option('--archive-list <file>', '显式指定哪些 slug 进 archive,跳过自动推测')
    .option('--no-interactive', '跳过 active/archive 交互确认表,全用推测默认值')
    .option('--redact-rules <file>', '--regenerate 时附加自定义 redact 规则')
    .action(
      async (
        source: string,
        opts: {
          regenerate?: boolean; // commander --no-regenerate flag 反向
          dryRun?: boolean;
          force?: boolean;
          archiveList?: string;
          interactive?: boolean; // commander --no-interactive flag 反向
          redactRules?: string;
        },
      ) => {
        // 校验 source argument:仅接受 'openspec' 或 'superpowers'
        if (source !== 'openspec' && source !== 'superpowers') {
          console.error(`error: <source> must be 'openspec' or 'superpowers', got '${source}'`);
          process.exit(2);
        }

        const exitCode = await runMigrate({
          source: source as SourceId,
          noRegenerate: opts.regenerate === false,
          dryRun: opts.dryRun ?? false,
          force: opts.force ?? false,
          archiveList: opts.archiveList,
          noInteractive: opts.interactive === false,
          redactRules: opts.redactRules,
        });

        process.exit(exitCode);
      },
    );
}
