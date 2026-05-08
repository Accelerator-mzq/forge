import { describe, it, expect } from 'vitest';
import {
  estimateRegenerateCost,
  estimateSyncCheckCost,
  estimateIndexCost,
  estimateMapCost,
  checkBudgetGate,
  REGEN_WARN_USD,
  SYNC_CHECK_WARN_USD,
} from '../../../src/core/legacy-bridge/budget.js';

describe('legacy-bridge/budget', () => {
  it('estimateRegenerateCost 随 anchor 数线性增', () => {
    const c1 = estimateRegenerateCost(10);
    const c2 = estimateRegenerateCost(20);
    expect(c2).toBeCloseTo(c1 + 10 * 0.075, 2);
    expect(c1).toBeGreaterThan(0);
  });

  it('estimateSyncCheckCost / estimateIndexCost / estimateMapCost 都为正数', () => {
    expect(estimateSyncCheckCost(5)).toBeGreaterThan(0);
    expect(estimateIndexCost(5)).toBeGreaterThan(0);
    expect(estimateMapCost()).toBeGreaterThan(0);
  });

  it('checkBudgetGate 估算 < 阈值 → proceed', () => {
    const r = checkBudgetGate(5, 20, false, false);
    expect(r.proceed).toBe(true);
    expect(r.exitCode).toBe(0);
  });

  it('checkBudgetGate 超阈值 + TTY → proceed + 倒计时提示', () => {
    const r = checkBudgetGate(30, 20, false, true);
    expect(r.proceed).toBe(true);
    expect(r.message).toContain('5 秒后继续');
    // I-1 修验证:仅 TTY 超阈值路径 requiresCountdown=true,caller 用此 flag 不字符串耦合
    expect(r.requiresCountdown).toBe(true);
  });

  // M-1 修验证:estimated === threshold 边界归"未超"路径(spec §4.4 ">$20" 严格大于)
  it('checkBudgetGate estimated === threshold → proceed 不倒计时(M-1 修边界)', () => {
    const r = checkBudgetGate(20, 20, false, true); // 估算精确等于阈值
    expect(r.proceed).toBe(true);
    expect(r.requiresCountdown).toBe(false);
  });

  it('checkBudgetGate 超阈值 + 非 TTY + 无 --yes → 拒绝(M-4)', () => {
    const r = checkBudgetGate(30, 20, false, false);
    expect(r.proceed).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.message).toContain('--yes');
  });

  it('checkBudgetGate 超阈值 + 非 TTY + --yes → proceed', () => {
    const r = checkBudgetGate(30, 20, true, false);
    expect(r.proceed).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.requiresCountdown).toBe(false); // 非 TTY 不倒计时
  });

  it('REGEN_WARN_USD 与 spec 一致 = 20', () => {
    expect(REGEN_WARN_USD).toBe(20);
  });

  // M-3 修:SYNC_CHECK_WARN_USD 也应有数值断言(spec §4.4)
  it('SYNC_CHECK_WARN_USD 与 spec 一致 = 5(M-3 修)', () => {
    expect(SYNC_CHECK_WARN_USD).toBe(5);
  });
});
