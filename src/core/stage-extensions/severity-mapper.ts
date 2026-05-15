// severity-mapper.ts — severity 级别映射纯函数
// plan-stage-extensions Task 2.1
// 两个 map 查找:codex → forge 4级 / forge 4级 → forge 3级(handoff_to_backlog 用)

import type { SeverityMap } from './types.js';
import type { StageExtensionsDefaults } from '../schema/types.js';

/**
 * codex JSON severity → forge 显示 4 级。
 * 查 severity_map 做 1:1 映射;map 来自 NormalizedStageExtensionsConfig。
 *
 * @param codexSeverity  codex 输出的原始 severity
 * @param severityMap    来自 normalized config 的映射表
 * @returns forge 4 级 severity
 */
export function mapCodexToForge(
  codexSeverity: 'critical' | 'high' | 'medium' | 'low',
  severityMap: SeverityMap,
): 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT' {
  return severityMap[codexSeverity];
}

/**
 * forge 4 级 → forge 3 级(handoff_to_backlog 时使用)。
 * 查 severity_map_to_forge 做 1:1 映射。
 *
 * @param forgeSeverity       forge 内部 4 级 severity
 * @param severityMapToForge  来自 normalized config 的映射表
 * @returns forge 3 级 severity(critical / warning / suggestion)
 */
export function mapForgeToForgeTier(
  forgeSeverity: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT',
  severityMapToForge: StageExtensionsDefaults['severity_map_to_forge'],
): 'critical' | 'warning' | 'suggestion' {
  return severityMapToForge[forgeSeverity];
}
