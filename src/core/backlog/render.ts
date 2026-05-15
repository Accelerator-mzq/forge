// src/core/backlog/render.ts
// plan-backlog-registry — 纯函数:聚合结果 → BacklogWarning[] + tombstone + markdown
// 本文件 Task 2 放 warning/tombstone 派生;Task 3/4 续加 renderActive / renderArchived。

import type { SupersedingDetail, SkippedBlock } from '../scope/aggregator.js';

/** render 层呈现类型 —— 由 superseding[] / skipped[] 派生(spec §7.1) */
export type BacklogWarning =
  | { kind: 'dangling-reference'; superseded_in_change: string; source_change: string; entry_id: string }
  | { kind: 'invalid-new-status'; superseded_in_change: string; source_change: string; entry_id: string; raw: string }
  | {
      kind: 'duplicate-claim';
      source_change: string;
      entry_id: string;
      claimants: { superseded_in_change: string; superseded_at: string }[];
      winner_superseded_in_change: string;
    }
  | { kind: 'malformed-dirname'; superseded_in_change: string }
  | { kind: 'skipped-block'; change: string; file: string; reason: string };

const VALID_NEW_STATUS = new Set(['superseded', 'obsolete', 'completed', 'inherited']);

/** superseded_at 比较:有效 YYYY-MM-DD 按字典序;'unknown' 一律排最后(spec §5) */
function compareSupersededAt(a: string, b: string): number {
  if (a === b) return 0;
  if (a === 'unknown') return 1;
  if (b === 'unknown') return -1;
  return a < b ? -1 : 1;
}

/** 两条 claim 选 winner:superseded_at 最早;并列按 superseded_in_change 字典序 */
function earlier(a: SupersedingDetail, b: SupersedingDetail): SupersedingDetail {
  const c = compareSupersededAt(a.superseded_at, b.superseded_at);
  if (c !== 0) return c < 0 ? a : b;
  return a.superseded_in_change <= b.superseded_in_change ? a : b;
}

/**
 * 从 aggregator 的 superseding[] / skipped[] 派生 warning 与 tombstone(spec §5 处理顺序 / §7.1)。
 * 处理顺序:先剔 dangling(snapshot=null)与非法 new_status,再在剩余 valid claim 组内选 winner。
 */
export function deriveWarningsAndTombstones(
  superseding: SupersedingDetail[],
  skipped: SkippedBlock[],
): { warnings: BacklogWarning[]; tombstones: SupersedingDetail[] } {
  const warnings: BacklogWarning[] = [];
  const valid: SupersedingDetail[] = [];

  for (const s of superseding) {
    if (s.registry_entry_snapshot === null) {
      warnings.push({
        kind: 'dangling-reference',
        superseded_in_change: s.superseded_in_change,
        source_change: s.source_change,
        entry_id: s.entry_id,
      });
      continue;
    }
    if (!VALID_NEW_STATUS.has(s.new_status)) {
      warnings.push({
        kind: 'invalid-new-status',
        superseded_in_change: s.superseded_in_change,
        source_change: s.source_change,
        entry_id: s.entry_id,
        raw: s.new_status,
      });
      continue;
    }
    valid.push(s);
  }

  // malformed-dirname:任何 superseding 明细目录名异常都报
  for (const s of superseding) {
    if (s.superseded_at === 'unknown') {
      warnings.push({ kind: 'malformed-dirname', superseded_in_change: s.superseded_in_change });
    }
  }

  // valid claim 按身份键分组
  const groups = new Map<string, SupersedingDetail[]>();
  for (const s of valid) {
    const key = `${s.source_change}::${s.entry_id}`;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }

  const tombstones: SupersedingDetail[] = [];
  for (const g of groups.values()) {
    const winner = g.reduce(earlier);
    tombstones.push(winner);
    if (g.length > 1) {
      warnings.push({
        kind: 'duplicate-claim',
        source_change: winner.source_change,
        entry_id: winner.entry_id,
        claimants: g.map((s) => ({
          superseded_in_change: s.superseded_in_change,
          superseded_at: s.superseded_at,
        })),
        winner_superseded_in_change: winner.superseded_in_change,
      });
    }
  }

  for (const sk of skipped) {
    warnings.push({ kind: 'skipped-block', change: sk.change, file: sk.file, reason: sk.reason });
  }

  return { warnings, tombstones };
}
