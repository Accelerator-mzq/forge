// src/core/backlog/index.ts
// plan-backlog-registry — orchestration:聚合 → 渲染 → 写 forge/backlog/

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanArchivedFollowups, type AggregatorResult } from '../scope/aggregator.js';
import {
  deriveWarningsAndTombstones,
  renderActiveMarkdown,
  renderArchivedMarkdown,
  countOpenBacklog,
  splitLegacyClaims,
  type LegacyBacklogWarning,
} from './render.js';
import { loadLegacyRequirements } from '../legacy-bridge/legacy-requirements.js';

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

/** 聚合 + 渲染,返回两份 markdown(纯计算,不写盘)—— 双源(spec §7 / §8) */
export async function buildBacklog(forgeRoot: string): Promise<GenerateBacklogResult> {
  // 源一:archived scope-entry —— 空 archive 容错(spec §7.1)
  let agg: AggregatorResult;
  if (existsSync(join(forgeRoot, 'changes', 'archive'))) {
    agg = await scanArchivedFollowups(forgeRoot);
  } else {
    agg = { entries: [], superseding: [], skipped: [] };
  }
  // 源二:legacy-requirements.yaml
  const legacyReqs = await loadLegacyRequirements(forgeRoot);

  // legacy claim 分流(spec §8.2):在 deriveWarningsAndTombstones 之前
  const legacyClaims = agg.superseding.filter((s) => s.source_change === 'legacy-requirements');
  const scopeClaims = agg.superseding.filter((s) => s.source_change !== 'legacy-requirements');
  const {
    tombstones: legacyTombstones,
    warnings: legacyWarnings,
    retiredIds,
  } = splitLegacyClaims(legacyClaims, legacyReqs?.requirements ?? []);
  const { warnings: scopeWarnings, tombstones } = deriveWarningsAndTombstones(
    scopeClaims,
    agg.skipped,
  );
  // reserved-archive-dirname:archive 下若真存在名为 legacy-requirements 的目录(spec §8.5 第 6 项)
  const reservedWarnings: LegacyBacklogWarning[] = existsSync(
    join(forgeRoot, 'changes', 'archive', 'legacy-requirements'),
  )
    ? [{ kind: 'reserved-archive-dirname' }]
    : [];
  // legacy warning + scope warning + reserved 合并,一起渲染进 active.md ## Warnings 段
  const allWarnings = [...scopeWarnings, ...legacyWarnings, ...reservedWarnings];
  const activeMd = renderActiveMarkdown(agg.entries, allWarnings, legacyReqs, retiredIds);
  const archivedMd = renderArchivedMarkdown(tombstones, legacyTombstones);
  const openCount = countOpenBacklog(agg.entries);
  return { openCount, warningCount: allWarnings.length, activeMd, archivedMd };
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
