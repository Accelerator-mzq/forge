// src/core/backlog/index.ts
// plan-backlog-registry — orchestration:聚合 → 渲染 → 写 forge/backlog/

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanArchivedFollowups } from '../scope/aggregator.js';
import {
  deriveWarningsAndTombstones,
  renderActiveMarkdown,
  renderArchivedMarkdown,
  countOpenBacklog,
} from './render.js';

export * from './render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** README 模板路径(随 dist 一起发布 —— 由 scripts/copy-templates.mjs 拷到 dist,见 Step 5) */
const README_TEMPLATE = join(__dirname, 'assets', 'backlog-readme.md');

export interface GenerateBacklogResult {
  /** 待办数(future-work + out-of-scope) */
  openCount: number;
  /** warning 数 */
  warningCount: number;
  /** 渲染出的两份 markdown(供 --check 比对,不必重新读盘) */
  activeMd: string;
  archivedMd: string;
}

/** 聚合 + 渲染,返回两份 markdown(纯计算,不写盘) */
export async function buildBacklog(forgeRoot: string): Promise<GenerateBacklogResult> {
  const agg = await scanArchivedFollowups(forgeRoot);
  const { warnings, tombstones } = deriveWarningsAndTombstones(agg.superseding, agg.skipped);
  const activeMd = renderActiveMarkdown(agg.entries, warnings);
  const archivedMd = renderArchivedMarkdown(tombstones);
  // 待办计数口径由 render.ts 的 countOpenBacklog 统一(避免与 renderActiveMarkdown 各写一份)
  const openCount = countOpenBacklog(agg.entries);
  return { openCount, warningCount: warnings.length, activeMd, archivedMd };
}

/** 聚合 + 渲染 + 写盘到 forge/backlog/(README 仅首写) */
export async function generateBacklog(forgeRoot: string): Promise<GenerateBacklogResult> {
  const result = await buildBacklog(forgeRoot);
  const dir = join(forgeRoot, 'backlog');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'active.md'), result.activeMd, 'utf8');
  await writeFile(join(dir, 'archived.md'), result.archivedMd, 'utf8');
  const readmePath = join(dir, 'README.md');
  if (!existsSync(readmePath)) {
    await writeFile(readmePath, await readFile(README_TEMPLATE, 'utf8'), 'utf8');
  }
  return result;
}

/**
 * 比对磁盘上的 forge/backlog/{active,archived}.md 与重生成结果。
 * 返回陈旧文件名列表(空数组 = 一致)。供 `forge backlog --check`(CI staleness 守门,spec §7.2)。
 */
export async function checkBacklogStale(forgeRoot: string): Promise<string[]> {
  const built = await buildBacklog(forgeRoot);
  const dir = join(forgeRoot, 'backlog');
  const stale: string[] = [];
  for (const [name, fresh] of [
    ['active.md', built.activeMd],
    ['archived.md', built.archivedMd],
  ] as const) {
    let onDisk: string;
    try {
      onDisk = await readFile(join(dir, name), 'utf8');
    } catch {
      onDisk = '';
    }
    if (onDisk !== fresh) stale.push(name);
  }
  return stale;
}
