// budget 估算 + 警告 — Plan 5(spec §5.5.7 月预算 ~$50-80)
// v0.1 仅警告,不阻塞;超阈值打印 stderr,用户可 Ctrl-C

/** 每个 scenario 大约的 API 调用次数(RED + GREEN,各含主 + judge) */
const APPROX_API_CALLS_PER_SCENARIO = 5;
/** 每次 API 调用的粗估 cost(USD);spec §5.5.7 估算 */
const APPROX_COST_PER_API_CALL_USD = 0.045;

/** 默认警告阈值 USD(spec §5.5.7 全量约 $6.5,留 3x 余量) */
export const DEFAULT_BUDGET_WARN_USD = 20.0;

/** 估算给定 scenario 数的总 cost */
export function estimateRunCost(scenarioCount: number): number {
  return scenarioCount * APPROX_API_CALLS_PER_SCENARIO * APPROX_COST_PER_API_CALL_USD;
}

/**
 * 跑前估算 + 警告。返回 estimated cost(供 caller 写入 stdout 让用户感知)。
 * 超 threshold 时 stderr 打印警告,但不阻塞(v0.1 仅警告,spec 显式)。
 */
export function checkBudget(scenarioCount: number, threshold = DEFAULT_BUDGET_WARN_USD): number {
  const estimated = estimateRunCost(scenarioCount);
  if (estimated > threshold) {
    console.warn(
      `⚠ 估算本次 eval cost ≈ $${estimated.toFixed(2)},超阈值 $${threshold.toFixed(2)};继续执行中,如需取消请立即 Ctrl-C。`,
    );
  }
  return estimated;
}
