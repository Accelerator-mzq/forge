// model_tiers 配置:读取侧 resolver + 写入侧 validator。
// 读写两侧共享 MODEL_TIER_VALUES / MODEL_TIER_RANK,避免规则漂移。
// 详见 docs/specs/2026-05-17-model-tier-mapping-design.md §2.1。

import type { ForgeConfig, ModelTier } from './types.js';
import { DEFAULT_MODEL_TIERS } from './types.js';

/** 三个合法 model tier 值(单一来源) */
export const MODEL_TIER_VALUES = ['haiku', 'sonnet', 'opus'] as const;

/** tier 强弱序数:升级 = 序数变大;identity = 相等;降级 = 变小 */
export const MODEL_TIER_RANK = { haiku: 0, sonnet: 1, opus: 2 } as const;

/** resolveModelTiers 的返回类型:三档都解析为具体模型 */
export interface ResolvedModelTiers {
  haiku: ModelTier;
  sonnet: ModelTier;
  opus: ModelTier;
}

/** validateModelTierAssignment 的返回类型 */
export type ModelTierAssignmentResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-field' | 'invalid-value' | 'downgrade' };

/** 可重映射的 tier 键(opus 不可重映射,不在内) */
const REMAPPABLE_TIERS = ['haiku', 'sonnet'] as const;

function isModelTier(v: unknown): v is ModelTier {
  return typeof v === 'string' && (MODEL_TIER_VALUES as readonly string[]).includes(v);
}

/**
 * 读取侧:把 ForgeConfig.model_tiers 解析成填满的 { haiku, sonnet, opus }。
 * 永远返回合法值、永不抛异常(配置层 graceful degradation)。
 */
export function resolveModelTiers(
  config: ForgeConfig | undefined,
  warn: (msg: string) => void = (msg) => console.warn(msg),
): ResolvedModelTiers {
  const result: ResolvedModelTiers = { ...DEFAULT_MODEL_TIERS };
  const raw: unknown = config?.model_tiers;

  // 规则2:缺失 → 全 identity(无 warn)
  if (raw === undefined) return result;
  // 规则3:malformed —— model_tiers 不是对象 → 全 identity + warn
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    warn('forge config: model_tiers 不是对象,已忽略,全部 tier 按 identity');
    return result;
  }

  const obj = raw as Record<string, unknown>;
  // 规则3:未知键 → 忽略 + warn
  for (const key of Object.keys(obj)) {
    if (key !== 'haiku' && key !== 'sonnet') {
      warn(`forge config: model_tiers.${key} 不是可重映射 tier(仅 haiku/sonnet),已忽略`);
    }
  }

  for (const tier of REMAPPABLE_TIERS) {
    const value = obj[tier];
    if (value === undefined) continue; // 规则2:缺键 → identity
    if (!isModelTier(value)) {
      // 规则4:非法值 → warn + identity
      warn(`forge config: model_tiers.${tier} 值 "${String(value)}" 非法,已按 identity`);
      continue;
    }
    if (MODEL_TIER_RANK[value] < MODEL_TIER_RANK[tier]) {
      // 规则5:降级 → warn + identity
      warn(`forge config: model_tiers.${tier} → ${value} 是降级,已拒绝、按 identity`);
      continue;
    }
    // 规则1:单次查表 —— value 即派发模型,不二次解析
    result[tier] = value;
  }
  // 规则6:result.opus 来自 DEFAULT_MODEL_TIERS,从未被触碰,恒为 'opus'
  return result;
}

/**
 * 写入侧:校验一次 `forge config set model_tiers.<tier> <value>` 赋值。
 * fail-fast —— 不 sanitize。reason 优先级固定:invalid-field → invalid-value → downgrade。
 */
export function validateModelTierAssignment(
  tier: string,
  value: string,
): ModelTierAssignmentResult {
  if (tier !== 'haiku' && tier !== 'sonnet') {
    return { ok: false, reason: 'invalid-field' };
  }
  if (!isModelTier(value)) {
    return { ok: false, reason: 'invalid-value' };
  }
  if (MODEL_TIER_RANK[value] < MODEL_TIER_RANK[tier]) {
    return { ok: false, reason: 'downgrade' };
  }
  return { ok: true };
}
