// scenario pair 比较 — Plan 5 spec §5.5.4
// RED/GREEN 双跑后,计算 delta(GREEN avg score - RED avg score),
// delta < threshold 视为"skill 没起作用",pair fail

import type { Scenario, ScenarioPair, ScenarioRunResult } from './types.js';

/**
 * 默认 delta 阈值(0-10 分制下,GREEN 比 RED 高 1.5 分才算 skill 真起作用)。
 * spec §5.5.4 没硬性指定数值,1.5 是工程取舍:
 * - 太高 → eval 一直挂(模型自身随机波动 ±0.5 分常见)
 * - 太低 → skill 实际无效但 eval 过(失去意义)
 * 1.5 给 1 分容差 + 0.5 信号边界。后续可按数据校准。
 */
export const DEFAULT_DELTA_THRESHOLD = 1.5;

/** 对 1 个 scenario 的 RED+GREEN 双跑算 pair */
export function compareScenarioPair(
  scenario: Scenario,
  red: ScenarioRunResult,
  green: ScenarioRunResult,
  threshold: number = DEFAULT_DELTA_THRESHOLD,
): ScenarioPair {
  const redAvg = avgJudgeScore(red);
  const greenAvg = avgJudgeScore(green);
  const delta = greenAvg - redAvg;
  // pair pass 条件:GREEN scenario pass 本身 + delta >= threshold
  // (RED 可以 fail,实际上 RED 应该 fail 才符合 skill 要解决的问题)
  const pairPass = green.scenarioPass && delta >= threshold;
  return {
    scenarioId: scenario.id,
    skill: scenario.skill,
    red,
    green,
    delta,
    pairPass,
  };
}

/** 算一次 ScenarioRunResult 全 turn 的 judge 平均分 */
function avgJudgeScore(run: ScenarioRunResult): number {
  if (run.turnResults.length === 0) return 0;
  const sum = run.turnResults.reduce((acc, t) => acc + t.judgeResult.score, 0);
  return sum / run.turnResults.length;
}
