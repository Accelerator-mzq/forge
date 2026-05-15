// trend-analyzer.ts — finding 数量趋势分析
// plan-stage-extensions Task 2.4
// 分析最近 3 轮的 block_count 变化趋势,给出中文建议与推荐选项

/**
 * 趋势分析结果。
 * trend:数据不足 / 严格递减 / 停滞 / 上升 / 波动
 * recommended_option:对应 AskUserQuestion 的默认推荐选项(1=继续/2=放弃/3=接受)
 */
export interface TrendAdvice {
  trend: 'data_insufficient' | 'strict_decrease' | 'stable' | 'increase' | 'fluctuate';
  /** 中文建议文本 */
  recommendation: string;
  /** AskUserQuestion 默认推哪个选项(1/2/3) */
  recommended_option: 1 | 2 | 3;
}

/**
 * 分析收敛轮次历史,判断 finding 数量变化趋势。
 *
 * 规则(按优先级顺序):
 * 1. 历史 < 3 轮 → data_insufficient,推选项 1
 * 2. 最后 3 轮严格递减(a > b > c) → strict_decrease,推选项 1
 * 3. 最后 3 轮近平(任意相邻差 ≤ 1) → stable,推选项 2
 * 4. 最后 3 轮有上升(任意后轮 > 前轮) → increase,推选项 2
 * 5. 其他(波动) → fluctuate,推选项 3
 *
 * @param roundHistory  按 round 升序排列的历史记录
 */
export function analyzeTrend(
  roundHistory: Array<{ round: number; block_count: number }>,
): TrendAdvice {
  // 数据不足:历史轮次 < 3
  if (roundHistory.length < 3) {
    return {
      trend: 'data_insufficient',
      recommendation: '数据不足,建议再跑几轮',
      recommended_option: 1,
    };
  }

  // 取最后 3 轮
  const last3 = roundHistory.slice(-3);
  const [a, b, c] = last3 as [
    { round: number; block_count: number },
    { round: number; block_count: number },
    { round: number; block_count: number },
  ];

  // 严格递减:a.block_count > b.block_count > c.block_count
  if (a.block_count > b.block_count && b.block_count > c.block_count) {
    return {
      trend: 'strict_decrease',
      recommendation: '收敛中,建议继续',
      recommended_option: 1,
    };
  }

  // 近平(stable):所有相邻差 ≤ 1(优先于 increase 判断)
  if (
    Math.abs(b.block_count - a.block_count) <= 1 &&
    Math.abs(c.block_count - b.block_count) <= 1
  ) {
    return {
      trend: 'stable',
      recommendation: '已停滞,建议放弃 codex 介入',
      recommended_option: 2,
    };
  }

  // 上升:任意后轮 > 前轮
  if (b.block_count > a.block_count || c.block_count > b.block_count) {
    return {
      trend: 'increase',
      recommendation: 'finding 数上升,建议放弃',
      recommended_option: 2,
    };
  }

  // 波动(其他情况)
  return {
    trend: 'fluctuate',
    recommendation: '波动,建议接受当前状态计入 backlog',
    recommended_option: 3,
  };
}
