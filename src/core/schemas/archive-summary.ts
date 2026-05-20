// src/core/schemas/archive-summary.ts — v4 OpenSpec alignment 简版(plan-v4 Phase 1 Task 1.4)
//
// v4 BREAKING change(schema v1 → v2):
// - 删反加固字段:process_evidence_summary / acked_warnings / pending_suggestions /
//   verify_passed.verified_invariants(14 不变量) / review_passed.reviewers(simcode 兼容)
// - 简化 handoff_to_backlog source 枚举(删 verify_findings / review_outcomes,仅留
//   pause_decisions + scope_entries)
// - 字段对齐 forge `applyDeltas` operation 风格(spec_updates_applied:
//   create/replace/delete 操作类型),不再是 OpenSpec delta-block 风格

/** archive_summary v2 顶级 schema(v4 简版) */
export interface ArchiveSummary {
  /** YAML schema identifier(v4 BREAKING:v2) */
  schema: 'forge-archive-summary/v2';
  /** archive_summary 自身版本(沿 forge 大版本号) */
  version: string;
  /** archive 操作时刻(ISO 8601 UTC,允许 ms 精度) */
  archived_at: string;
  /** change id(非空) */
  change_id: string;
  /** archive 目录名(YYYY-MM-DD-changeId) */
  archive_name: string;
  /** verify 执行者(沿 marker.verified_by) */
  verified_by: string;
  /** review 执行者(沿 marker.reviewed_by) */
  reviewed_by: string;
  /** applied_commits — user/AI 想填就填,无 fence */
  applied_commits?: string[];
  /** spec deltas 应用记录 — v4 按 forge applyDeltas operation 风格 */
  spec_updates_applied: SpecUpdateApplied[];
  /** 跨 change backlog 收集(forge 独有亮点)— scope_entries / pause_decisions 两来源 */
  handoff_to_backlog: HandoffEntry[];
}

/** spec deltas 应用一项 — v4 forge operation 风格 */
export interface SpecUpdateApplied {
  /** capability 名(对应 specs/<name>.md) */
  capability: string;
  /** forge SpecDelta.operation,沿 specs-sync/deltas.ts:11 */
  operation: 'create' | 'replace' | 'delete';
}

/**
 * handoff_to_backlog 一项 — v4 简化版,只两类来源
 *
 * - scope_entries:来自 archived change 的 proposal.md/design.md `## Out of Scope` /
 *   `## Future Work` / `## Non-Goals` YAML 块(沿 forge-scope-entries/v1 schema)
 * - pause_decisions:apply 中段 Fluid Pause option=3(转 out-of-scope)的软记录
 */
export interface HandoffEntry {
  /** 来源类别(v4 删 verify_findings / review_outcomes,反加固协议消亡) */
  source: 'pause_decisions' | 'scope_entries';
  /** 来源 id(pause_decisions 数字索引 / scope_entries 字符串 id) */
  id: number | string;
  /** scope_entries 来源时的 category */
  category?: 'out-of-scope' | 'non-goal' | 'future-work';
  /** pause_decisions 来源时的 chosen_option(应固定 = 3) */
  chosen_option?: 3;
  /** pause_decisions 来源时的 issue_summary */
  issue_summary?: string;
  /** scope_entries 来源时的 description / reason */
  description?: string;
  reason?: string;
}

/** v4 当前 version 常量 */
export const ARCHIVE_SUMMARY_VERSION = '2.0.0';

/** ISO 8601 UTC 校验正则(v4 允许 ms 精度,沿 marker-schema.ts 同步) */
export const ARCHIVE_SUMMARY_ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

/** semver 弱校验 */
export const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;

/** 类型守卫:对象具备 ArchiveSummary v2 顶级字段(运行时浅校验) */
export function looksLikeArchiveSummary(v: unknown): v is ArchiveSummary {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o.schema === 'forge-archive-summary/v2';
}
