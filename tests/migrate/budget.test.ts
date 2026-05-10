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

  it('每件 ~5k input + ~3k output token;3 件应 > $0.5', () => {
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
    expect(cost).toBeGreaterThan(0.5);
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
