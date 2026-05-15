// src/core/monitor/health-verdict.ts — 健康裁决(spec §10.1:只做可机检的判定)
import type { TraceEvent, HealthVerdict, VerdictItem, MonitorStage } from './types.js';

/**
 * 计算健康裁决。只做 spec §10.1 列的「可机检」项:
 * - regression:hardening_step.executed === false(加固步骤未执行)。
 * - anomaly:某阶段有 CLI 事件但完全无 AI stage_enter(AI trace 缺该阶段)。
 * 语义细微的 regression_signal 不在此机评,交报告并排呈现给人判。
 */
export function computeVerdict(events: TraceEvent[]): HealthVerdict {
  const items: VerdictItem[] = [];

  // 检查 1:加固步骤未执行 → regression
  for (const e of events) {
    if (e.layer === 'ai' && e.event === 'hardening_step' && e.data.executed === false) {
      items.push({
        kind: 'regression',
        stage: e.stage,
        detail: `加固步骤未执行:${String(e.data.step ?? '(未命名)')}`,
        evidence: `trace ${e.ts} hardening_step executed=false`,
      });
    }
  }

  // 检查 2:某阶段有 CLI 事件但无 AI stage_enter → anomaly
  const stagesWithCli = new Set<MonitorStage>();
  const stagesWithAiEnter = new Set<MonitorStage>();
  for (const e of events) {
    if (e.layer === 'cli') stagesWithCli.add(e.stage);
    if (e.layer === 'ai' && e.event === 'stage_enter') stagesWithAiEnter.add(e.stage);
  }
  for (const stage of stagesWithCli) {
    if (!stagesWithAiEnter.has(stage)) {
      items.push({
        kind: 'anomaly',
        stage,
        detail: `${stage} 阶段有 CLI 事件但缺 AI stage_enter record`,
        evidence: 'AI trace 不完整(可能漏记或中途启用)',
      });
    }
  }

  // 计算最终 level:如果有 regression 则为 regression,否则有 items 就 anomaly,都没有就 ok
  const level: HealthVerdict['level'] = items.some((i) => i.kind === 'regression')
    ? 'regression'
    : items.length > 0
      ? 'anomaly'
      : 'ok';
  return { level, items };
}
