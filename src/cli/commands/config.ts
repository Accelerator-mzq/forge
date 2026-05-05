// forge config 子命令 — 管理 forge/config.yaml
// 支持 get/set 操作

import { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../../core/parse/index.js';
import { stringify as stringifyYAML } from 'yaml';

export function buildConfigCommand(): Command {
  const cmd = new Command('config').description('Manage forge/config.yaml');

  // forge config get <field>
  cmd
    .command('get <field>')
    .description('Read a config field')
    .action(async (field: string) => {
      const path = join(process.cwd(), 'forge', 'config.yaml');
      if (!existsSync(path)) throw new Error(`forge/config.yaml not found at ${path}`);
      const config = parseConfig(await readFile(path, 'utf8'));
      const value = (config as unknown as Record<string, unknown>)[field];
      console.log(JSON.stringify(value ?? null, null, 2));
    });

  // forge config set <field> <value>
  cmd
    .command('set <field> <value>')
    .description('Write a config field')
    .action(async (field: string, value: string) => {
      const path = join(process.cwd(), 'forge', 'config.yaml');
      await mkdir(join(process.cwd(), 'forge'), { recursive: true });
      let config: Record<string, unknown> = {};
      if (existsSync(path)) {
        config = parseConfig(await readFile(path, 'utf8')) as unknown as Record<string, unknown>;
      } else {
        config = { schema: 'forge-spec-driven/v1' };
      }
      config[field] = value;
      await writeFile(path, stringifyYAML(config), 'utf8');
      console.log(`set ${field} = ${value}`);
    });

  return cmd;
}
