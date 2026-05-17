// forge config 子命令 — 管理 forge/config.yaml
// 支持 get/set;支持一层点分嵌套键(如 model_tiers.haiku);model_tiers.* 走 fail-fast 校验

import { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../../core/parse/index.js';
import { validateModelTierAssignment } from '../../core/schema/index.js';
import { stringify as stringifyYAML } from 'yaml';

type FieldPath = { kind: 'flat'; key: string } | { kind: 'nested'; ns: string; leaf: string };

/**
 * 把 field 解析为 flat 或一层嵌套键。
 * 用 indexOf/slice(而非 split)—— slice 返回 string,规避 tsconfig 的 noUncheckedIndexedAccess。
 * 超过一层(`a.b.c`)、空段(`.haiku` / `model_tiers.` / `model_tiers..x`)、空 field → 抛错 fail-fast。
 */
function parseField(field: string): FieldPath {
  const dot = field.indexOf('.');
  if (dot === -1) {
    if (field.length === 0) throw new Error('forge config: field 不能为空');
    return { kind: 'flat', key: field };
  }
  const ns = field.slice(0, dot);
  const leaf = field.slice(dot + 1);
  if (ns.length === 0 || leaf.length === 0 || leaf.includes('.')) {
    throw new Error(`forge config: 非法的点分键 (${field}) —— 只支持一层、且段不可为空`);
  }
  return { kind: 'nested', ns, leaf };
}

export function buildConfigCommand(): Command {
  const cmd = new Command('config').description('Manage forge/config.yaml');

  // forge config get <field> —— 支持一层点分嵌套键的 raw 读取
  cmd
    .command('get <field>')
    .description(
      'Read a config field (supports one-level dotted keys, e.g. model_tiers.haiku). ' +
        'A missing key prints null; null means unset/identity.',
    )
    .action(async (field: string) => {
      const path = join(process.cwd(), 'forge', 'config.yaml');
      if (!existsSync(path)) throw new Error(`forge/config.yaml not found at ${path}`);
      const config = parseConfig(await readFile(path, 'utf8')) as unknown as Record<
        string,
        unknown
      >;
      const fp = parseField(field);
      let value: unknown;
      if (fp.kind === 'flat') {
        value = config[fp.key];
      } else {
        const ns = config[fp.ns];
        value =
          ns && typeof ns === 'object' && !Array.isArray(ns)
            ? (ns as Record<string, unknown>)[fp.leaf]
            : undefined;
      }
      console.log(JSON.stringify(value ?? null, null, 2));
    });

  // forge config set <field> <value> —— 一层点分嵌套键;model_tiers.* 走 fail-fast 校验
  cmd
    .command('set <field> <value>')
    .description('Write a config field (supports one-level dotted keys, e.g. model_tiers.haiku)')
    .action(async (field: string, value: string) => {
      const dir = join(process.cwd(), 'forge');
      const path = join(dir, 'config.yaml');

      // 阶段①:先 parse 现有 config —— parse 失败 → ConfigParseError 抛出 → fail-fast,文件不动
      // (spec §2.1:config parse 优先于 field 校验)
      let config: Record<string, unknown>;
      if (existsSync(path)) {
        config = parseConfig(await readFile(path, 'utf8')) as unknown as Record<string, unknown>;
      } else {
        config = { schema: 'forge-spec-driven/v1' };
      }

      // 阶段②:parse 成功后才解析 field(空段 / 超过一层 → 抛错 fail-fast)
      const fp = parseField(field);

      // model_tiers 必须用 model_tiers.<tier> 二段形式;作 flat key → 拒绝
      if (fp.kind === 'flat' && fp.key === 'model_tiers') {
        throw new Error('forge config set: model_tiers 必须用 model_tiers.<tier> 形式');
      }
      // 阶段②:model_tiers.<leaf> 赋值 → 写入侧 fail-fast 校验
      let isModelTierKey = false;
      if (fp.kind === 'nested' && fp.ns === 'model_tiers') {
        isModelTierKey = true;
        const check = validateModelTierAssignment(fp.leaf, value);
        if (!check.ok) {
          throw new Error(
            `forge config set: model_tiers.${fp.leaf} = ${value} 非法 (${check.reason})`,
          );
        }
      }

      // 写入
      await mkdir(dir, { recursive: true });
      if (fp.kind === 'nested') {
        const cur = config[fp.ns];
        const nsObj =
          cur && typeof cur === 'object' && !Array.isArray(cur)
            ? (cur as Record<string, unknown>)
            : {};
        nsObj[fp.leaf] = value;
        config[fp.ns] = nsObj;
      } else {
        config[fp.key] = value;
      }
      await writeFile(path, stringifyYAML(config), 'utf8');
      console.log(`set ${field} = ${value}`);
      if (isModelTierKey) {
        console.log(
          'note: model_tiers 仅对直接传 model 参数的 harness(如 Claude Code)生效;OpenCode/Codex 请改 agent 定义。',
        );
      }
    });

  return cmd;
}
