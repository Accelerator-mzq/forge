// src/core/scope/aggregator.ts
// plan-9b Task 5 — 扫 archived YAML 块 + 聚合 active entries + 扣 superseding_entries

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarkdown } from '../parse/markdown.js';
import { parseFencedYamlBlocks, FencedYamlParseError } from '../parse/fenced-yaml.js';
import {
  SCOPE_ANCHOR_IDS,
  type ScopeEntry,
  type SupersedingRef,
  type ScopeCategory,
} from '../schemas/scope-entries.js';

/** 含来源 change id 的 entry(供 propose 选单显示) */
export interface AggregatedScopeEntry extends ScopeEntry {
  /** 来源 archived change id(目录名) */
  source_change: string;
}

export interface AggregatorResult {
  entries: AggregatedScopeEntry[];
}

const CATEGORY_ORDER: Record<ScopeCategory, number> = {
  'future-work': 0,
  'out-of-scope': 1,
  'non-goal': 2,
};

/**
 * 扫 forgeRoot/changes/archive/<id>/{proposal,design}.md 内 anchor 三段的 fenced YAML 块,
 * 收集 status=active 的 entries,扣已被任意 archived change 的 superseding_entries 走的。
 *
 * @param forgeRoot 项目内 forge/ 根目录的绝对路径
 * @returns active entries 按 future-work > out-of-scope > non-goal 排序
 * @throws Error 当 forgeRoot/changes/archive/ 不存在时(让 CLI exit 2)
 */
export async function scanArchivedFollowups(forgeRoot: string): Promise<AggregatorResult> {
  const archiveRoot = join(forgeRoot, 'changes', 'archive');
  if (!existsSync(archiveRoot)) {
    throw new Error(`archive 目录不存在(ENOENT): ${archiveRoot}`);
  }

  const archDirs = await readdir(archiveRoot, { withFileTypes: true });
  const collected: AggregatedScopeEntry[] = [];
  const superseded = new Set<string>(); // key: `${source_change}::${entry_id}`

  for (const ent of archDirs) {
    if (!ent.isDirectory()) continue;
    const changeId = ent.name;
    const changeDir = join(archiveRoot, changeId);
    // 遍历 proposal.md 和 design.md
    for (const fname of ['proposal.md', 'design.md']) {
      const path = join(changeDir, fname);
      if (!existsSync(path)) continue;
      const text = await readFile(path, 'utf8');
      const md = parseMarkdown(text);
      // 遍历每个 section,找 anchor 在三段之列的
      for (const sec of md.sections) {
        if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) {
          continue;
        }
        // 抽该 section 的 fenced YAML 块
        let blocks: unknown[];
        try {
          blocks = parseFencedYamlBlocks(sec.body);
        } catch (err) {
          // 单 archived 的 YAML 语法错不阻塞整体扫描,静默跳过(archive 历史不可改)
          if (err instanceof FencedYamlParseError) {
            continue;
          }
          throw err;
        }
        // 处理每个 YAML 块
        for (const block of blocks) {
          const b = block as {
            schema?: string;
            entries?: ScopeEntry[];
            superseding_entries?: SupersedingRef[];
          };
          // v3 codex MAJOR 1 修订:必须先校验 schema 字段
          // archived 老 change 的 yaml 块可能缺 schema 字段:stderr warning + skip
          if (b.schema !== 'forge-scope-entries/v1') {
            process.stderr.write(
              `⚠ scope-aggregator: skipping yaml block in ${changeId}/${fname} — ` +
                `expected schema='forge-scope-entries/v1', got ${JSON.stringify(b.schema)}\n`,
            );
            continue;
          }
          // 收集 status=active 的 entries
          for (const e of b.entries ?? []) {
            if (e.status === 'active') {
              collected.push({ ...e, source_change: changeId });
            }
          }
          // 记录被 superseding 的 entries
          for (const sup of b.superseding_entries ?? []) {
            superseded.add(`${sup.source_change}::${sup.entry_id}`);
          }
        }
      }
    }
  }

  // 过滤掉被 superseding 走的 entries
  const filtered = collected.filter((e) => !superseded.has(`${e.source_change}::${e.id}`));

  // 按 future-work > out-of-scope > non-goal,然后按 source_change,再按 id 排序
  filtered.sort((a, b) => {
    const cmp = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (cmp !== 0) return cmp;
    if (a.source_change !== b.source_change) {
      return a.source_change < b.source_change ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { entries: filtered };
}
