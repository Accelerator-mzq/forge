// src/core/scope/aggregator.ts
// plan-9b Task 5 — 扫 archived YAML 块 + 聚合 active entries + 扣 superseding_entries
// plan-backlog-registry Task 1 — 扩展:保留 superseding 明细 + skipped 坏块 + new_status 守卫

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarkdown } from '../parse/markdown.js';
import { parseFencedYamlBlocks, FencedYamlParseError } from '../parse/fenced-yaml.js';
import {
  SCOPE_ANCHOR_IDS,
  VALID_SUPERSEDING_NEW_STATUS,
  type ScopeEntry,
  type SupersedingRef,
  type ScopeCategory,
} from '../schemas/scope-entries.js';

/** 含来源 change id 的 entry(供 propose 选单显示) */
export interface AggregatedScopeEntry extends ScopeEntry {
  /** 来源 archived change id(目录名) */
  source_change: string;
}

/** 一条 superseding 明细 —— 供 backlog tombstone + render 层派生 warning(spec §3.2) */
export interface SupersedingDetail {
  /** 被认领的历史 entry 所在 archived change(目录名) */
  source_change: string;
  /** 被认领的 entry id */
  entry_id: string;
  /** YAML 原始字串,未 cast;合法性在 render 层判(∈ 4 枚举) */
  new_status: string;
  /** 认领论证 */
  rationale: string;
  /** 写下这条 SupersedingRef 的 archived change(认领者,目录名) */
  superseded_in_change: string;
  /** 认领者目录名日期前缀 YYYY-MM-DD;无可解析前缀 → 'unknown' */
  superseded_at: string;
  /** 原 entry 快照;null = 悬空引用 */
  registry_entry_snapshot: ScopeEntry | null;
}

/** 被 skip 的 archived scope 块 —— aggregator 唯一产出的「原始异常」(spec §3.2) */
export interface SkippedBlock {
  /** archived change 目录名 */
  change: string;
  /** proposal.md | design.md */
  file: string;
  reason: 'yaml-parse-error' | 'schema-mismatch';
}

export interface AggregatorResult {
  /** 存活 active(已扣 superseding) */
  entries: AggregatedScopeEntry[];
  /** superseding 明细(plan-backlog-registry) */
  superseding: SupersedingDetail[];
  /** 坏块结构化列表(plan-backlog-registry) */
  skipped: SkippedBlock[];
}

const CATEGORY_ORDER: Record<ScopeCategory, number> = {
  'future-work': 0,
  'out-of-scope': 1,
  'non-goal': 2,
};

/** 从 archived 目录名取日期前缀;无 YYYY-MM-DD 前缀 → 'unknown' */
function dirnameDate(changeId: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})-/.exec(changeId);
  return m ? m[1]! : 'unknown';
}

/**
 * 扫 forgeRoot/changes/archive/<id>/{proposal,design}.md 内 anchor 三段的 fenced YAML 块,
 * 收集 status=active 的 entries,扣已被合法 superseding_entries 走的;
 * 同时保留 superseding 明细与坏块列表。
 *
 * @param forgeRoot 项目内 forge/ 根目录的绝对路径
 * @throws Error 当 forgeRoot/changes/archive/ 不存在时(让 CLI exit 2)
 */
export async function scanArchivedFollowups(forgeRoot: string): Promise<AggregatorResult> {
  const archiveRoot = join(forgeRoot, 'changes', 'archive');
  if (!existsSync(archiveRoot)) {
    throw new Error(`archive 目录不存在(ENOENT): ${archiveRoot}`);
  }

  const archDirs = await readdir(archiveRoot, { withFileTypes: true });
  const collected: AggregatedScopeEntry[] = [];
  const skipped: SkippedBlock[] = [];
  const rawSuperseding: Array<Omit<SupersedingDetail, 'registry_entry_snapshot'>> = [];
  const superseded = new Set<string>(); // key: `${source_change}::${entry_id}`

  for (const ent of archDirs) {
    if (!ent.isDirectory()) continue;
    const changeId = ent.name;
    const changeDir = join(archiveRoot, changeId);
    for (const fname of ['proposal.md', 'design.md']) {
      const path = join(changeDir, fname);
      if (!existsSync(path)) continue;
      const text = await readFile(path, 'utf8');
      const md = parseMarkdown(text);
      for (const sec of md.sections) {
        if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) {
          continue;
        }
        let blocks: unknown[];
        try {
          blocks = parseFencedYamlBlocks(sec.body);
        } catch (err) {
          if (err instanceof FencedYamlParseError) {
            skipped.push({ change: changeId, file: fname, reason: 'yaml-parse-error' });
            continue;
          }
          throw err;
        }
        for (const block of blocks) {
          // plan-backlog-registry Codex LOW-1:非对象块(null/标量)按 schema-mismatch,避免 b.schema 抛 TypeError
          if (typeof block !== 'object' || block === null) {
            skipped.push({ change: changeId, file: fname, reason: 'schema-mismatch' });
            continue;
          }
          const b = block as {
            schema?: string;
            entries?: ScopeEntry[];
            superseding_entries?: SupersedingRef[];
          };
          if (b.schema !== 'forge-scope-entries/v1') {
            skipped.push({ change: changeId, file: fname, reason: 'schema-mismatch' });
            continue;
          }
          for (const e of b.entries ?? []) {
            if (e.status === 'active') {
              collected.push({ ...e, source_change: changeId });
            }
          }
          for (const sup of b.superseding_entries ?? []) {
            rawSuperseding.push({
              source_change: sup.source_change,
              entry_id: sup.entry_id,
              new_status: String(sup.new_status),
              rationale: String(sup.rationale ?? ''),
              superseded_in_change: changeId,
              superseded_at: dirnameDate(changeId),
            });
            // §9c 守卫:只有合法 new_status 才扣减
            if (VALID_SUPERSEDING_NEW_STATUS.has(String(sup.new_status))) {
              superseded.add(`${sup.source_change}::${sup.entry_id}`);
            }
          }
        }
      }
    }
  }

  // 回填 snapshot:从内存中已扫的 entries 解析(不重读文件)
  const byKey = new Map<string, AggregatedScopeEntry>();
  for (const e of collected) byKey.set(`${e.source_change}::${e.id}`, e);
  const superseding: SupersedingDetail[] = rawSuperseding.map((s) => ({
    ...s,
    registry_entry_snapshot: byKey.get(`${s.source_change}::${s.entry_id}`) ?? null,
  }));

  const filtered = collected.filter((e) => !superseded.has(`${e.source_change}::${e.id}`));
  filtered.sort((a, b) => {
    const cmp = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (cmp !== 0) return cmp;
    if (a.source_change !== b.source_change) {
      return a.source_change < b.source_change ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // 对 superseding 排序:保证 archived.md tombstone 顺序跨平台确定、--check 不误报
  // 排序键:source_change → entry_id → superseded_in_change 字典序
  superseding.sort((a, b) => {
    if (a.source_change !== b.source_change) {
      return a.source_change < b.source_change ? -1 : 1;
    }
    if (a.entry_id !== b.entry_id) {
      return a.entry_id < b.entry_id ? -1 : 1;
    }
    return a.superseded_in_change < b.superseded_in_change
      ? -1
      : a.superseded_in_change > b.superseded_in_change
        ? 1
        : 0;
  });

  // 对 skipped 排序:保证 active.md Warnings 顺序跨平台确定、--check 不误报
  // 排序键:change → file 字典序
  skipped.sort((a, b) => {
    if (a.change !== b.change) {
      return a.change < b.change ? -1 : 1;
    }
    return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
  });

  return { entries: filtered, superseding, skipped };
}
