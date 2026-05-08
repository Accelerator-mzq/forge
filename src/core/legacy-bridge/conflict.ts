// 跨 anchor 一致性决策 — Plan 7 Phase B1
// 决策 #18 修订:同 role 多版本 → authoritative=true 单选(无 diff);
//                跨 role 不一致 → 默认入 diff(major 档);
//                config.yaml#legacy_bridge.auto_resolve_cross_anchor=true 才走 mtime > role 优先级

import type { LegacyAnchor, LegacyAnchorRole, LegacyAnchorsFile } from './types.js';
import { groupAnchorsByRole } from './anchors.js';

/** role 优先级(决策 #18:auto_resolve_cross_anchor=true 时用) */
export const ROLE_PRIORITY: ReadonlyArray<LegacyAnchorRole> = [
  'requirements', // 最高:SRS 是合同性边界
  'high-level-design',
  'low-level-design',
  'system-tests',
  'rationale',
  'glossary',
  'acceptance-report', // 最低:metadata-only,不参与决策
];

/** 决策结果 */
export interface ResolveResult {
  /** 选中的 anchor(用于 LLM 输入) */
  chosen: LegacyAnchor;
  /** 决策依据 */
  reason: 'sole-authoritative' | 'mtime-newer' | 'role-priority';
  /** 同 role 其他被跳过的 anchor(authoritative=false 历史版) */
  skipped?: LegacyAnchor[];
}

/**
 * 同 role 多版本 → 选 authoritative=true 那条;无 authoritative=true → 抛错(决策 #10 schema 已挡)。
 *
 * 不返回多个、不返回 mtime 最新版(决策 #10 哲学:authoritative 是用户显式标的,不靠 mtime 推测)。
 */
export function resolveSameRole(anchors: LegacyAnchor[]): ResolveResult {
  if (anchors.length === 0) {
    throw new Error('resolveSameRole: anchors 为空');
  }
  // I2 修:invariant 校验 — 函数语义是"同 role 多版本",防 caller 误传混 role 数组
  // resolveAuthoritativeForAllRoles 通过 groupAnchorsByRole 保证安全;外部 caller 误用时显式抛错
  const expectedRole = anchors[0]!.role;
  if (anchors.some((a) => a.role !== expectedRole)) {
    throw new Error(`resolveSameRole: 传入了混合 role 的 anchors(期望全为 '${expectedRole}')`);
  }
  const auth = anchors.filter((a) => a.authoritative);
  if (auth.length === 1 && auth[0]) {
    return {
      chosen: auth[0],
      reason: 'sole-authoritative',
      skipped: anchors.filter((a) => !a.authoritative),
    };
  }
  if (auth.length === 0) {
    throw new Error(
      `resolveSameRole: role '${anchors[0]?.role}' 无 authoritative=true;请在 legacy-anchors.yaml 标当前版`,
    );
  }
  // schema 校验已挡 multi-authoritative,这里 defensive
  throw new Error(
    `resolveSameRole: role '${anchors[0]?.role}' 多个 authoritative=true(schema 应已拒)`,
  );
}

/** 跨 role 决策入参 */
export interface CrossRoleInput {
  /** 文件 mtime(秒级时间戳),由 caller 传入(支持 mock) */
  mtimeOf: (path: string) => number;
  /** 是否走 auto_resolve(默认 false → 不决策,直接返回 'enter-diff') */
  autoResolve: boolean;
}

/** 跨 role 决策结果 */
export type CrossRoleDecision =
  | { kind: 'enter-diff'; conflictingRoles: LegacyAnchorRole[] }
  | {
      kind: 'auto-resolved';
      chosen: LegacyAnchor;
      reason: 'mtime-newer' | 'role-priority';
      losers: LegacyAnchor[];
    };

/**
 * 检测跨 role 冲突:对所有 authoritative=true 的 anchor 配对,
 * caller 传入"两 anchor 是否冲突"的 predicate(LLM 在 sync-check 中判定);
 * 这里只做"决策怎么处理冲突"的逻辑。
 */
export function decideCrossRole(
  conflicting: LegacyAnchor[],
  input: CrossRoleInput,
): CrossRoleDecision {
  // I1 修:统一空数组防御(原本只在 autoResolve=true 路径检查,
  // autoResolve=false 时 Set([]) 静默返空 enter-diff,Phase C 难诊断)
  if (conflicting.length === 0) {
    throw new Error('decideCrossRole: conflicting 为空');
  }

  // 决策 #18 修订:默认 enter-diff(major 档),不自动决策
  if (!input.autoResolve) {
    const roles = Array.from(new Set(conflicting.map((a) => a.role)));
    return { kind: 'enter-diff', conflictingRoles: roles };
  }

  // auto_resolve_cross_anchor=true:走 mtime > role 优先级
  let winner = conflicting[0]!; // length>0 已防御
  let winnerMtime = input.mtimeOf(winner.path);
  // C1 修:reason 在循环内追踪,默认 role-priority;
  // 出现 mtime 严格更大时锁定 mtime-newer。
  // 原 allSameMtime 推断在 [mtime=100,mtime=100,mtime=50] 输入下误报 mtime-newer
  // (winnerMtime=100 vs c.mtime=50 → allSameMtime=false → 错报),实际 winner 是 role-priority 选出。
  let reason: 'mtime-newer' | 'role-priority' = 'role-priority';

  for (const a of conflicting.slice(1)) {
    const m = input.mtimeOf(a.path);
    if (m > winnerMtime) {
      winner = a;
      winnerMtime = m;
      reason = 'mtime-newer'; // 出现 mtime 严格大者就锁定
    } else if (m === winnerMtime) {
      // mtime 相同 → role 优先级(数字小的优先);reason 不变(若已 mtime-newer 则保留)
      if (rolePriorityIdx(a.role) < rolePriorityIdx(winner.role)) {
        winner = a;
      }
    }
  }
  return {
    kind: 'auto-resolved',
    chosen: winner,
    reason,
    losers: conflicting.filter((a) => a !== winner),
  };
}

function rolePriorityIdx(role: LegacyAnchorRole): number {
  const idx = ROLE_PRIORITY.indexOf(role);
  return idx === -1 ? ROLE_PRIORITY.length : idx;
}

/** 给定 anchors file 与 mtimeOf,返回所有 authoritative anchors 的"同 role 决策结果"列表 */
export function resolveAuthoritativeForAllRoles(file: LegacyAnchorsFile): ResolveResult[] {
  const grouped = groupAnchorsByRole(file);
  const out: ResolveResult[] = [];
  for (const [, anchors] of grouped.entries()) {
    if (anchors.length === 0) continue;
    out.push(resolveSameRole(anchors));
  }
  return out;
}
