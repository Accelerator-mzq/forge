#!/usr/bin/env node
// forge CLI 入口 — Plan 3 起填实

import { Command } from 'commander';
import { FORGE_VERSION } from '../index.js';
import { buildConfigCommand } from './commands/config.js';
import { buildValidateCommand } from './commands/validate.js';
import { buildInitCommand } from './commands/init.js';
import { buildUpdateCommand } from './commands/update.js';
import { buildArchiveCommand } from './commands/archive.js';
import { buildLegacyBridgeCommand } from './commands/legacy-bridge.js';
import { buildUpgradeCommand } from './commands/upgrade.js';
import { buildMigrateCommand } from './commands/migrate.js';

// 创建主命令
const program = new Command();

program
  .name('forge')
  .description('OpenSpec × superpowers fusion: spec-driven CLI with multi-harness adapters')
  .version(FORGE_VERSION);

// 注册 config 子命令
program.addCommand(buildConfigCommand());

// 注册 validate 子命令
program.addCommand(buildValidateCommand());

// 注册 init 子命令
program.addCommand(buildInitCommand());

// 注册 update 子命令(Task 17)
program.addCommand(buildUpdateCommand());

// 注册 archive 子命令(Task 17)
program.addCommand(buildArchiveCommand());

// 注册 legacy-bridge 子命令(Plan 7 Phase A 骨架)
program.addCommand(buildLegacyBridgeCommand());

// 注册 upgrade 子命令(v0.3 Plan 4 — v0.2→v0.3 legacy 清理)
program.addCommand(buildUpgradeCommand());

// 注册 migrate 子命令(v0.4 — 搬运 OpenSpec / superpowers 项目仓库)
program.addCommand(buildMigrateCommand());

// 解析命令行参数,遇到错误时打印并退出
program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
