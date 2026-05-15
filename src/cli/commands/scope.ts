// src/cli/commands/scope.ts
// plan-9b Task 5 — forge scope <sub>

import { Command } from 'commander';
import { join } from 'node:path';
import { scanArchivedFollowups } from '../../core/scope/index.js';

export function buildScopeCommand(): Command {
  const scope = new Command('scope').description(
    'out-of-scope / future-work / non-goal 跨 change 工具',
  );

  scope
    .command('scan-archived-followups')
    .description('扫 archived YAML 块输出 active entries(JSON)')
    .argument('<changeId>', '新 change 的 id(供日志显示,不参与扫描)')
    .action(async (_changeId: string) => {
      try {
        const forgeRoot = join(process.cwd(), 'forge');
        const result = await scanArchivedFollowups(forgeRoot);
        // stdout 输出完整 JSON(供下游解析)
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        // 坏块逐条写 stderr,格式含 "skipping yaml block" 供测试/日志搜索
        for (const s of result.skipped) {
          process.stderr.write(
            `⚠ scope-aggregator: skipping yaml block in ${s.change}/${s.file} (${s.reason})\n`,
          );
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`✗ scope scan-archived-followups failed: ${msg}\n`);
        process.exit(2);
      }
    });

  return scope;
}
