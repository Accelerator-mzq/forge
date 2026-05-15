// src/core/backlog/render.ts
// plan-backlog-registry — 纯函数:聚合结果 → BacklogWarning[] + tombstone + markdown
// 本文件 Task 2 放 warning/tombstone 派生;Task 3/4 续加 renderActive / renderArchived。

import type { SupersedingDetail, SkippedBlock, AggregatedScopeEntry } from '../scope/aggregator.js';
import { VALID_SUPERSEDING_NEW_STATUS } from '../schemas/scope-entries.js';
import type { ScopeCategory } from '../schemas/scope-entries.js';

/** render 层呈现类型 —— 由 superseding[] / skipped[] 派生(spec §7.1) */
export type BacklogWarning =
  | {
      kind: 'dangling-reference';
      superseded_in_change: string;
      source_change: string;
      entry_id: string;
    }
  | {
      kind: 'invalid-new-status';
      superseded_in_change: string;
      source_change: string;
      entry_id: string;
      raw: string;
    }
  | {
      kind: 'duplicate-claim';
      source_change: string;
      entry_id: string;
      claimants: { superseded_in_change: string; superseded_at: string }[];
      winner_superseded_in_change: string;
    }
  | { kind: 'malformed-dirname'; superseded_in_change: string }
  | { kind: 'skipped-block'; change: string; file: string; reason: string };

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
    if (!VALID_SUPERSEDING_NEW_STATUS.has(s.new_status)) {
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

/** 单条 BacklogWarning → 一行文本(spec §7.1 表) */
export function renderWarningLine(w: BacklogWarning): string {
  switch (w.kind) {
    case 'dangling-reference':
      return `- [dangling] ${w.superseded_in_change} 认领的 ${w.source_change}::${w.entry_id} 不存在`;
    case 'invalid-new-status':
      return `- [invalid-status] ${w.superseded_in_change} 认领 ${w.source_change}::${w.entry_id} new_status=${w.raw}`;
    case 'duplicate-claim': {
      const cs = w.claimants.map((c) => `${c.superseded_in_change}:${c.superseded_at}`).join(' ');
      return `- [duplicate] ${w.source_change}::${w.entry_id} claimants=${cs} winner=${w.winner_superseded_in_change}`;
    }
    case 'malformed-dirname':
      return `- [malformed-dirname] ${w.superseded_in_change} 目录名无日期前缀,superseded_at=unknown`;
    case 'skipped-block':
      return `- [skipped] ${w.change}/${w.file}: ${w.reason}`;
  }
}

/** 单条 active entry → markdown 块 */
function renderEntry(e: AggregatedScopeEntry): string {
  // triggered_by 格式化:有则 source#id,无则 (无)
  const tb = e.triggered_by ? `${e.triggered_by.source}#${e.triggered_by.id}` : '(无)';
  return [
    `### \`${e.source_change}::${e.id}\``,
    '',
    `- **source change**: ${e.source_change}`,
    `- **description**: ${e.description}`,
    `- **reason**: ${e.reason}`,
    `- **priority**: ${e.priority ?? '(未排序)'}`,
    `- **related change**: ${e.related_change ?? '(无)'}`,
    `- **triggered_by**: ${tb}`,
    '',
  ].join('\n');
}

/** 渲染 active.md(spec §4) */
export function renderActiveMarkdown(
  entries: AggregatedScopeEntry[],
  warnings: BacklogWarning[],
): string {
  // 按 category 分组过滤
  const byCat = (c: ScopeCategory) => entries.filter((e) => e.category === c);
  const fw = byCat('future-work');
  const oos = byCat('out-of-scope');
  const ng = byCat('non-goal');
  // 待办计数:Future Work + Out of Scope;Non-Goals 不计入
  const openCount = fw.length + oos.length;

  const lines: string[] = [];
  lines.push('# Active Backlog');
  lines.push('');
  lines.push('> 生成产物 —— 由 `/forge:archive` 自动重生成,**勿手编**。Schema 见 README.md。');
  lines.push(`> 待办计 ${openCount} 项(Future Work + Out of Scope;Non-Goals 不计入)。`);
  lines.push('');
  lines.push(`## Warnings (${warnings.length})`);
  lines.push('');
  // 无 warning 则输出 (无),否则每条一行
  lines.push(warnings.length === 0 ? '(无)' : warnings.map(renderWarningLine).join('\n'));
  lines.push('');
  // 三段 category:Future Work / Out of Scope / Non-Goals
  for (const [title, list] of [
    [`## Future Work (${fw.length})`, fw],
    [`## Out of Scope (${oos.length})`, oos],
    [`## Non-Goals (${ng.length}) — 原则不做,不计入待办`, ng],
  ] as const) {
    lines.push(title);
    lines.push('');
    if (list.length === 0) {
      lines.push('(无)');
      lines.push('');
    } else {
      for (const e of list) lines.push(renderEntry(e));
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** 渲染 archived.md tombstone(spec §5);入参为 deriveWarningsAndTombstones 选出的 winner 列表 */
export function renderArchivedMarkdown(tombstones: SupersedingDetail[]): string {
  const lines: string[] = [];
  lines.push('# Archived Backlog (Tombstones)');
  lines.push('');
  lines.push(
    '> 生成产物 —— 由 `/forge:archive` 自动重生成。每条记录一个 backlog 项的退役。Schema 见 README.md。',
  );
  lines.push(
    '> 异常(悬空认领 / 非法 new_status / 重复认领 / 跳过坏块 / 目录名异常)见 active.md `## Warnings`。',
  );
  lines.push('');
  if (tombstones.length === 0) {
    lines.push('(无)');
    return lines.join('\n') + '\n';
  }
  for (const t of tombstones) {
    // registry_entry_snapshot 一定非 null(deriveWarningsAndTombstones 已剔 dangling)
    const snapshot = JSON.stringify(t.registry_entry_snapshot);
    lines.push(`### \`${t.source_change}::${t.entry_id}\``);
    lines.push('');
    lines.push(`- **superseded_in_change**: ${t.superseded_in_change}`);
    lines.push(`- **superseded_at**: ${t.superseded_at}`);
    lines.push(`- **new_status**: ${t.new_status}`);
    lines.push(`- **cancellation_reason**: ${t.rationale}`);
    lines.push(`- **registry_entry_snapshot**: ${snapshot}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
