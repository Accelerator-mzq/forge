// forge update 子命令 — 重铺 skills/commands 到所有已配置的 harness
// 不改 config.yaml,不重新检测,直接读现有 forge/config.yaml 的 harness 字段
// 若 config.yaml 不存在或无 harness 字段,接受 --harness 参数覆盖

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../../core/parse/index.js';
import { ClaudeAdapter, CodexAdapter, deployAtomic } from '../../core/harness-adapters/index.js';
import type { HarnessAdapter, DeployInput } from '../../core/harness-adapters/index.js';

export function buildUpdateCommand(): Command {
  return new Command('update')
    .description('Re-deploy forge skills/commands for all configured harnesses')
    .option(
      '--harness <list>',
      'comma-separated harness ids (claude,codex); overrides config.yaml',
      '',
    )
    .option(
      '--force',
      '强制覆盖已有 skill 文件(v0.1 stub 阶段:此 flag 当前为 noop,Plan 4 真实施 hash 比对后启用)',
    )
    .action(async (opts: { harness: string; force?: boolean }) => {
      const cwd = process.cwd();
      const forgeDir = join(cwd, 'forge');
      const configPath = join(forgeDir, 'config.yaml');

      // 1. 检查 forge/config.yaml 是否存在(判断项目是否已 init)
      if (!existsSync(configPath)) {
        console.error('✗ forge/config.yaml not found — run "forge init" first');
        process.exit(1);
      }

      // 2. 读取 config.yaml,获取已保存的 harness 列表
      const configText = await readFile(configPath, 'utf8');
      const config = parseConfig(configText) as unknown as Record<string, unknown>;

      // 3. 确定 harness 列表:优先 --harness 参数,其次 config.yaml harness 字段
      let selectedIds: string[];
      if (opts.harness) {
        // 命令行参数优先(方便 CI 场景)
        selectedIds = opts.harness
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (Array.isArray(config.harness) && config.harness.length > 0) {
        // 读 config.yaml 里记录的 harness 列表
        selectedIds = (config.harness as unknown[]).map(String);
      } else {
        console.error(
          '✗ No harness configured in forge/config.yaml and no --harness option provided.\n' +
            '  Run "forge init" or pass --harness=claude,codex to specify.',
        );
        process.exit(1);
      }

      console.log(`Updating forge for: ${selectedIds.join(', ')}`);

      // 4. 实例化 adapters
      const adapters: HarnessAdapter[] = [];
      for (const id of selectedIds) {
        if (id === 'claude') {
          adapters.push(new ClaudeAdapter());
        } else if (id === 'codex') {
          adapters.push(new CodexAdapter());
        } else if (id === 'opencode') {
          // opencode 是 v0.2 计划,暂跳过
          console.warn('OpenCode is v0.2 — skipping');
        } else {
          throw new Error(`Unknown harness id: ${id}`);
        }
      }

      if (adapters.length === 0) {
        console.error('✗ No valid adapters to deploy');
        process.exit(1);
      }

      // 5. plan() — Plan 3 阶段 templates 使用最小 stub 内容
      // Plan 4 会替换为真实 templates
      const input: DeployInput = {
        projectRoot: cwd,
        skills: [{ name: 'using-forge', content: '<!-- placeholder, Plan 4 will fill -->' }],
        commands: [],
      };
      const plans = await Promise.all(adapters.map((a) => a.plan(input)));

      // 6. 原子部署 — Stage→Backup→Commit 三阶段
      await deployAtomic(cwd, plans);

      console.log(`✓ forge updated for ${adapters.length} harness(es)`);
    });
}
