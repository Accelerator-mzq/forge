import { describe, it, expect, vi } from 'vitest';
import { estimateRunCost, checkBudget, DEFAULT_BUDGET_WARN_USD } from '../../forge-eval/budget.js';

describe('forge-eval/budget', () => {
  it('estimateRunCost(29) ≈ spec §5.5.7 全量估算', () => {
    // 29 scenario × 5 calls × $0.045 ≈ $6.5
    const cost = estimateRunCost(29);
    expect(cost).toBeGreaterThan(6);
    expect(cost).toBeLessThan(7);
  });

  it('estimateRunCost 线性', () => {
    expect(estimateRunCost(10)).toBeCloseTo(estimateRunCost(5) * 2, 4);
  });

  it('checkBudget 超阈值打印 warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkBudget(200, 1.0); // 200 scenario 估算远超 $1
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('超阈值');
    warnSpy.mockRestore();
  });

  it('checkBudget 未超阈值不打印', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkBudget(1, 100.0); // 1 scenario 远低于 $100
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('DEFAULT_BUDGET_WARN_USD = 20', () => {
    expect(DEFAULT_BUDGET_WARN_USD).toBe(20.0);
  });
});
