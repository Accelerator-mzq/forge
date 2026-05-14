// forge update 子命令 — 重铺 skills/commands 到所有已配置的 harness
// 不改 config.yaml,不重新检测,直接读现有 forge/config.yaml 的 harness 字段
// 若 config.yaml 不存在或无 harness 字段,接受 --harness 参数覆盖

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../../core/parse/index.js';
import {
  ClaudeAdapter,
  CodexAdapter,
  deployAtomic,
  filterByHash,
} from '../../core/harness-adapters/index.js';
import type { HarnessAdapter, DeployInput } from '../../core/harness-adapters/index.js';
import { loadAllSkills, loadAllCommands, loadAllSharedDocs } from '../../core/templates/index.js';

export function buildUpdateCommand(): Command {
  return new Command('update')
    .description('Re-deploy forge skills/commands for all configured harnesses')
    .option(
      '--harness <list>',
      'comma-separated harness ids (claude,codex); overrides config.yaml',
      '',
    )
    .option('--force', '强制覆盖已被用户修改的 skill / command 文件(SHA256 hash 比对决定是否覆盖)')
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

      // 5. 加载真实 templates(Plan 4)+ plan-9b sharedDocs
      const skills = await loadAllSkills();
      const commands = await loadAllCommands();
      const sharedDocs = await loadAllSharedDocs(); // v2 plan-9b Task 7b:加载 _shared/*.md
      const input: DeployInput = {
        projectRoot: cwd,
        skills, // LoadedSkill[] 兼容 SkillSpec[]
        commands, // LoadedCommand[] 兼容 CommandSpec[]
        sharedDocs, // 共用 reference docs 铺到 _shared 子目录
      };
      const plans = await Promise.all(adapters.map((a) => a.plan(input)));

      // 6. hash 比对过滤
      const force = opts.force ?? false;
      const { filteredPlans, skippedModified, unchanged, toWrite } = await filterByHash(
        cwd,
        plans,
        force,
      );
      if (skippedModified.length > 0) {
        console.warn(`⚠ ${skippedModified.length} 个文件已被用户修改,跳过(加 --force 覆盖):`);
        for (const f of skippedModified) console.warn(`  - ${f.relPath}`);
      }
      if (toWrite.length === 0) {
        console.log(`✓ 全部 ${unchanged.length} 个文件已是最新`);
        return;
      }
      await deployAtomic(cwd, filteredPlans);
      const modifiedPart =
        skippedModified.length > 0
          ? `;${skippedModified.length} 个已修改(跳过,加 --force 覆盖)`
          : '';
      console.log(
        `✓ forge updated: ${toWrite.length} 写入;${unchanged.length} 未变${modifiedPart}`,
      );
    });
}
