// forge validate 子命令 — 验证 change 目录
// 使用 validateChange API,exit 0/2 + 错误打印到 stderr

import { Command } from 'commander';
import { join } from 'node:path';
import { validateChange } from '../../core/validate/index.js';

export function buildValidateCommand(): Command {
  return new Command('validate')
    .argument('<changeId>', 'change directory id (e.g., add-login)')
    .description('Validate a change directory')
    .action(async (changeId: string) => {
      // 构建 change 目录路径: <cwd>/forge/changes/<changeId>
      const changeDir = join(process.cwd(), 'forge', 'changes', changeId);
      const result = await validateChange(changeDir);

      if (result.valid) {
        // 验证成功 → stdout + exit 0
        console.log(`✓ ${changeId}: valid`);
        process.exit(0);
      } else {
        // 验证失败 → stderr + exit 2
        console.error(`✗ ${changeId}: ${result.errors.length} errors`);
        for (const e of result.errors) {
          console.error(
            `  - [${e.artifact}] ${e.field ?? ''}: ${e.message}${e.file ? ` (${e.file}${e.line ? `:${e.line}` : ''})` : ''}`
          );
        }
        process.exit(2);
      }
    });
}
