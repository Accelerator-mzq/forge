// trend-analyzer.test.ts — analyzeTrend 单元测试
// 4 个测试:data_insufficient / strict_decrease / stable / increase(+fluctuate)

import { describe, it, expect } from 'vitest';
import { analyzeTrend } from '../../../src/core/stage-extensions/trend-analyzer.js';

describe('trend-analyzer', () => {
  it('data_insufficient:历史轮次 < 3 时返回 data_insufficient', () => {
    // 只有 2 轮数据,不足以判断趋势
    const result = analyzeTrend([
      { round: 1, block_count: 5 },
      { round: 2, block_count: 3 },
    ]);
    expect(result.trend).toBe('data_insufficient');
    expect(result.recommended_option).toBe(1);
  });

  it('strict_decrease:最后 3 轮严格递减 → strict_decrease', () => {
    // 5 > 3 > 1:严格递减,应推荐继续
    const result = analyzeTrend([
      { round: 1, block_count: 5 },
      { round: 2, block_count: 3 },
      { round: 3, block_count: 1 },
    ]);
    expect(result.trend).toBe('strict_decrease');
    expect(result.recommended_option).toBe(1);
  });

  it('stable:最后 3 轮近平(差值 ≤ 1) → stable', () => {
    // 3 → 4 → 3:差值均 ≤ 1,应判定为停滞
    const result = analyzeTrend([
      { round: 1, block_count: 3 },
      { round: 2, block_count: 4 },
      { round: 3, block_count: 3 },
    ]);
    expect(result.trend).toBe('stable');
    expect(result.recommended_option).toBe(2);
  });

  it('increase:最后 3 轮有明显上升 → increase', () => {
    // 2 → 4 → 6:持续上升
    const result = analyzeTrend([
      { round: 1, block_count: 2 },
      { round: 2, block_count: 4 },
      { round: 3, block_count: 6 },
    ]);
    expect(result.trend).toBe('increase');
    expect(result.recommended_option).toBe(2);
  });

  it('fluctuate:非以上任意情况 → fluctuate', () => {
    // 10 → 5 → 5:b < a(非 increase b>a),c = b(非 increase c>b),非严格递减,|b-a|=5 > 1(非 stable) → 波动
    const result = analyzeTrend([
      { round: 1, block_count: 10 },
      { round: 2, block_count: 5 },
      { round: 3, block_count: 5 },
    ]);
    expect(result.trend).toBe('fluctuate');
    expect(result.recommended_option).toBe(3);
  });
});
