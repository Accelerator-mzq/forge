// src/core/monitor/config.ts — monitor 开关读写(spec §3.1)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as stringifyYAML } from 'yaml';
import { parseConfig } from '../parse/index.js';
import type { ForgeConfig } from '../schema/index.js';

/** forge/config.yaml 的绝对路径(cwd=项目根约定,对齐 config 命令,spec §9 G-9) */
export function monitorConfigPath(projectRoot: string): string {
  return join(projectRoot, 'forge', 'config.yaml');
}

/**
 * 读路径:任何异常(缺失 / 损坏 / 缺段)一律返回 false,绝不抛(spec §3.1)。
 * 同步实现 —— exit 处理器与 CLI 子命令都可调。
 */
export function isMonitorEnabled(projectRoot: string): boolean {
  try {
    const path = monitorConfigPath(projectRoot);
    if (!existsSync(path)) return false;
    const config = parseConfig(readFileSync(path, 'utf8'));
    return config.monitor?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * 写路径:fail-fast(spec §3.1 G-8)。
 * - config 不存在 → 报错提示先 forge init(不自行造 config)。
 * - config 损坏 → 报错 abort(不静默覆盖损坏文件)。
 * 正常路径 read-modify-write,保留其它字段值(注释/格式不保留,与 `forge config set` 一致)。
 * monitor 段内部也走 spread 合并,保留 monitor 对象的其它字段。
 */
export function setMonitorEnabled(projectRoot: string, enabled: boolean): void {
  const path = monitorConfigPath(projectRoot);
  if (!existsSync(path)) {
    throw new Error(`forge/config.yaml 不存在(${path})—— 先跑 \`forge init\` 初始化项目`);
  }
  let config: ForgeConfig;
  try {
    config = parseConfig(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`forge/config.yaml 解析失败,拒绝覆盖:${(err as Error).message}`);
  }
  config.monitor = { ...config.monitor, enabled };
  writeFileSync(path, stringifyYAML(config), 'utf8');
}
