// src/core/schemas/scope-entries.ts
// §3.12.1bis Interface Freeze 共享 schema(plan-9b)
// 后续 sub-plan(9e2 / 9f / 9d / receiving-code-review) reference 此处,不重定义

/** 三段 category 枚举(沿 design §2.6.2) */
export type ScopeCategory = 'out-of-scope' | 'non-goal' | 'future-work';
export const SCOPE_CATEGORY_VALUES: readonly ScopeCategory[] = [
  'out-of-scope',
  'non-goal',
  'future-work',
] as const;

export function isScopeCategory(v: unknown): v is ScopeCategory {
  return typeof v === 'string' && (SCOPE_CATEGORY_VALUES as readonly string[]).includes(v);
}

/** 状态转移五枚举(沿 design §2.6.4) */
export type ScopeStatus = 'active' | 'inherited' | 'superseded' | 'completed' | 'obsolete';
export const SCOPE_STATUS_VALUES: readonly ScopeStatus[] = [
  'active',
  'inherited',
  'superseded',
  'completed',
  'obsolete',
] as const;

export function isScopeStatus(v: unknown): v is ScopeStatus {
  return typeof v === 'string' && (SCOPE_STATUS_VALUES as readonly string[]).includes(v);
}

/** 三段 anchor ID(沿 design §2.6.3,§3.12.2 路径冻结) */
export type ScopeAnchorId = 'forge-oos' | 'forge-non-goals' | 'forge-future-work';
export const SCOPE_ANCHOR_IDS: readonly ScopeAnchorId[] = [
  'forge-oos',
  'forge-non-goals',
  'forge-future-work',
] as const;

export function isScopeAnchorId(v: unknown): v is ScopeAnchorId {
  return typeof v === 'string' && (SCOPE_ANCHOR_IDS as readonly string[]).includes(v);
}

/** anchor ID → category 默认映射(propose 阶段补全 entry.category 用) */
export const ANCHOR_TO_CATEGORY: Record<ScopeAnchorId, ScopeCategory> = {
  'forge-oos': 'out-of-scope',
  'forge-non-goals': 'non-goal',
  'forge-future-work': 'future-work',
};

/** triggered_by 来源(沿 design §2.6.3 字段语义) */
export interface TriggeredByRef {
  source: 'pause_decisions' | 'explore_capture' | 'review_outcomes';
  id: string | number;
}

/** 优先级(沿 design §2.6.3,可空) */
export type ScopePriority = 'critical' | 'high' | 'medium' | 'low' | null;

/** Scope entry 8 字段(沿 design §2.6.3 字段语义详) */
export interface ScopeEntry {
  /** kebab-case 稳定 ID,跨 change 唯一 */
  id: string;
  /** 三段分类 */
  category: ScopeCategory;
  /** 1-2 句概括 */
  description: string;
  /** 必填论证 — 为什么不做 / 为什么反目标 / 为什么是未来工作 */
  reason: string;
  /** 优先级(null = 暂未排序) */
  priority: ScopePriority;
  /** 状态(沿 §2.6.4 状态转移) */
  status: ScopeStatus;
  /** 来源引用(从 §2.1 pause_decisions / §2.5 explore capture / review_outcomes 转入)*/
  triggered_by: TriggeredByRef | null;
  /** 关联其他 change id */
  related_change: string | null;
}

/** SupersedingRef 4 字段(沿 design §2.6.4 forward-reference) */
export interface SupersedingRef {
  /** 历史 entry 所在 archived change id */
  source_change: string;
  /** 历史 entry 的 id */
  entry_id: string;
  /** 新状态(本 change 给出的状态变更) */
  new_status: ScopeStatus;
  /** 论证(为什么把状态改成 new_status) */
  rationale: string;
}

/** scope-entries 顶级 schema(§3.12.1bis 锁死) */
export interface ScopeEntriesBlock {
  schema: 'forge-scope-entries/v1';
  /** 每段一个 anchor */
  anchor_id: ScopeAnchorId;
  /** 本段 entries */
  entries: ScopeEntry[];
  /** 可选 forward-reference */
  superseding_entries?: SupersedingRef[];
}
