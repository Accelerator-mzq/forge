// forge init 子命令 — 初始化 forge 到当前目录
// 集成 detect + adapters + atomic deploy,创建 forge 目录骨架

import { Command } from 'commander';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as stringifyYAML } from 'yaml';
import {
  detectAll,
  ClaudeAdapter,
  CodexAdapter,
  deployAtomic,
} from '../../core/harness-adapters/index.js';
import type { HarnessAdapter, DeployInput } from '../../core/harness-adapters/index.js';
import { parseConfig } from '../../core/parse/index.js';

export function buildInitCommand(): Command {
  return new Command('init')
    .description('Initialize forge in current directory')
    .option('--harness <list>', 'comma-separated harness ids (claude,codex)', '')
    .option(
      '--force',
      '强制覆盖已有 skill 文件(v0.1 stub 阶段:此 flag 当前为 noop,Plan 4 真实施 hash 比对后启用)',
    )
    .action(async (opts: { harness: string; force?: boolean }) => {
      const cwd = process.cwd();

      // 步骤 1:检测项目里有哪些 harness
      const detections = await detectAll(cwd);

      // 步骤 2:选定要装的 adapter
      // 有 --harness 参数则用参数;否则自动检测到的(排除 opencode v0.2)
      let selectedIds: string[];
      if (opts.harness) {
        selectedIds = opts.harness
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        selectedIds = detections.filter((d) => d.detected && d.id !== 'opencode').map((d) => d.id);
        if (selectedIds.length === 0) {
          throw new Error('No supported harness detected. Use --harness=claude,codex to specify.');
        }
      }
      console.log(`Installing forge for: ${selectedIds.join(', ')}`);

      // 步骤 3:实例化 adapters
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

      // 步骤 4:plan() — Plan 3 阶段 templates 使用最小 stub 内容
      // Plan 4 会替换为真实 templates
      const input: DeployInput = {
        projectRoot: cwd,
        skills: [{ name: 'using-forge', content: '<!-- placeholder, Plan 4 will fill -->' }],
        commands: [],
      };
      const plans = await Promise.all(adapters.map((a) => a.plan(input)));

      // 步骤 5:原子部署 — Stage→Backup→Commit 三阶段
      await deployAtomic(cwd, plans);

      // 步骤 6:创建 forge/config.yaml + 目录骨架
      const forgeDir = join(cwd, 'forge');
      await mkdir(join(forgeDir, 'drafts'), { recursive: true });
      await mkdir(join(forgeDir, 'changes'), { recursive: true });
      await mkdir(join(forgeDir, 'specs'), { recursive: true });
      const configPath = join(forgeDir, 'config.yaml');
      // 写入 config.yaml — 已存在时保留其他字段(context/rules/code_paths),仅覆盖 harness
      let existingConfig: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        try {
          const raw = await readFile(configPath, 'utf8');
          const parsed = parseConfig(raw) as unknown as Record<string, unknown>;
          existingConfig = { ...parsed };
        } catch {
          // 解析失败 → 当成空配置(用户改坏了,init 帮恢复)
        }
      }
      const configData = {
        schema:
          typeof existingConfig['schema'] === 'string'
            ? existingConfig['schema']
            : 'forge-spec-driven/v1',
        ...existingConfig,
        harness: adapters.map((a) => a.id), // 总是覆盖 harness,保持与已部署 adapter 一致
      };
      await writeFile(configPath, stringifyYAML(configData), 'utf8');

      // 步骤 7:检测非 git 项目并 warn
      if (!existsSync(join(cwd, '.git'))) {
        console.warn(
          '⚠ 非 git 项目下 review 标记不绑定代码 diff,archive 必须 --force 才接受。建议跑 `git init`。',
        );
      }

      console.log(`✓ forge initialized for ${selectedIds.length} harness(es)`);
    });
}
