// 6 个 slash 命令模板的 registry — Plan 4
// 文件实体 .md 由 Task C 逐个填实

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 6 个 slash 命令名(spec §2.2 6 命令表;实际 slash 名为 /forge:<name>) */
export const COMMAND_NAMES = [
  'brainstorm',
  'propose',
  'apply',
  'review',
  'verify',
  'archive',
] as const;

export type CommandName = (typeof COMMAND_NAMES)[number];

/** 单 command 内容加载 — 用 import.meta.url 定位,开发与生产路径自适应 */
export async function loadCommand(name: CommandName): Promise<string> {
  return readFile(join(__dirname, `${name}.md`), 'utf8');
}

export interface LoadedCommand {
  name: CommandName;
  content: string;
}

/** 全量加载 6 个 slash 命令,失败抛错(说明某个 .md 漏建) */
export async function loadAllCommands(): Promise<LoadedCommand[]> {
  return Promise.all(
    COMMAND_NAMES.map(async (name) => ({ name, content: await loadCommand(name) })),
  );
}
