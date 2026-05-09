// v0.3 P3 修复(spec §2.3 + Plan 2 Task 2.2):
// writing-plans skill 的 scale-aware mode 配置 validation。
// 规则:
//   - 缺失字段 → 返回默认 200
//   - 非整数 / 范围外 [50, 2000] → stderr warn + fallback 200
//   - 合法值 → 直接返回

import type { ForgeConfig } from './types.js';
import { DEFAULT_LIGHT_THRESHOLD } from './types.js';

/**
 * 验证并 sanitize writing_plans.light_threshold。
 * 永远返回合法 number(用 default fallback,不抛错 — 配置层 graceful degradation)。
 *
 * @param config — forge/config.yaml 解析结果(可缺 writing_plans 段)
 * @param warn — 注入 console.warn 用于测试 / 自定义 logger;默认 console.warn
 * @returns 合法的 light_threshold(默认 200,范围 [50, 2000])
 */
export function validateWritingPlansConfig(
  config: ForgeConfig | undefined,
  warn: (msg: string) => void = (msg) => console.warn(msg),
): number {
  const raw = config?.writing_plans?.light_threshold;

  // 缺失 → 默认
  if (raw === undefined || raw === null) {
    return DEFAULT_LIGHT_THRESHOLD;
  }

  // 非数字 → warn + fallback
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    warn(
      `forge config: writing_plans.light_threshold must be a number, got ${typeof raw}; falling back to ${DEFAULT_LIGHT_THRESHOLD}`,
    );
    return DEFAULT_LIGHT_THRESHOLD;
  }

  // 非整数 → warn + fallback
  if (!Number.isInteger(raw)) {
    warn(
      `forge config: writing_plans.light_threshold must be integer, got ${raw}; falling back to ${DEFAULT_LIGHT_THRESHOLD}`,
    );
    return DEFAULT_LIGHT_THRESHOLD;
  }

  // 范围 [50, 2000] → 否则 warn + fallback
  if (raw < 50 || raw > 2000) {
    warn(
      `forge config: writing_plans.light_threshold out of range [50, 2000], got ${raw}; falling back to ${DEFAULT_LIGHT_THRESHOLD}`,
    );
    return DEFAULT_LIGHT_THRESHOLD;
  }

  // 合法值
  return raw;
}
