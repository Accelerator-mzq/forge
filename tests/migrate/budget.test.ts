// tests/migrate/budget.test.ts
// migrate 专属 cost 估算 test — Plan 8e Task 5.2
import { describe, it, expect } from 'vitest';
import {
  estimateMigrateCost,
  MIGRATE_WARN_USD,
  type MissingArtifactWithLength,
} from '../../src/core/migrate/budget.js';

describe('estimateMigrateCost', () => {
  it('无 missing 件 → cost 0', () => {
    expect(estimateMigrateCost([])).toBe(0);
  });

  it('每件 ~5k input;3 件应 > $0.05 < $0.50(I1 修:参数对齐 plan,原版偏高 2-3 倍)', () => {
    // 新参数:0.25 token/byte + 0.6 output factor + 2000 overhead
    // totalInputTokens = (5000+3000+6000)*0.25 + 3*2000 = 3500 + 6000 = 9500
    // output = 9500*0.6 = 5700
    // cost ≈ (9500/1M)*3 + (5700/1M)*15 = $0.0285 + $0.0855 = $0.114
    const items: MissingArtifactWithLength[] = [
      {
        changeSlug: 'a',
        kind: 'proposal',
        targetPath: '',
        factsSource: 'design',
        sourceLength: 5000,
      },
      {
        changeSlug: 'a',
        kind: 'specs',
        targetPath: '',
        factsSource: 'tasks',
        sourceLength: 3000,
      },
      {
        changeSlug: 'b',
        kind: 'proposal',
        targetPath: '',
        factsSource: 'design',
        sourceLength: 6000,
      },
    ];
    const cost = estimateMigrateCost(items);
    expect(cost).toBeGreaterThan(0.05);
    expect(cost).toBeLessThan(0.5);
  });

  it('MIGRATE_WARN_USD 等于 5', () => {
    expect(MIGRATE_WARN_USD).toBe(5);
  });

  it('返回的 cost 是 2 位小数(避免浮点尾巴)', () => {
    const items: MissingArtifactWithLength[] = [
      {
        changeSlug: 'a',
        kind: 'proposal',
        targetPath: '',
        factsSource: 'design',
        sourceLength: 12345,
      },
    ];
    const cost = estimateMigrateCost(items);
    // 检查没有超过 2 位小数(转字符串检验)
    const costStr = cost.toFixed(2);
    expect(parseFloat(costStr)).toBe(cost);
  });
});
