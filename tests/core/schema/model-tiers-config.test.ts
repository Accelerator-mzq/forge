// model-tiers-config:resolveModelTiers + validateModelTierAssignment 单测
// 覆盖 spec §2.1 resolver 六条规则 + validator 三类 reason + 共享常量一致性

import { describe, it, expect } from 'vitest';
import {
  resolveModelTiers,
  validateModelTierAssignment,
  MODEL_TIER_VALUES,
  MODEL_TIER_RANK,
} from '../../../src/core/schema/model-tiers-config.js';
import type { ForgeConfig } from '../../../src/core/schema/types.js';

// 构造最小 ForgeConfig;model_tiers 用 unknown 转型以便测 malformed 输入
function cfg(model_tiers: unknown): ForgeConfig {
  return { schema: 'forge-spec-driven/v1', model_tiers } as unknown as ForgeConfig;
}
const IDENTITY = { haiku: 'haiku', sonnet: 'sonnet', opus: 'opus' };
const noop = () => {};

describe('resolveModelTiers — spec §2.1 六条规则', () => {
  it('规则2 缺失:config undefined / model_tiers 缺失 → 全 identity', () => {
    expect(resolveModelTiers(undefined, noop)).toEqual(IDENTITY);
    expect(resolveModelTiers(cfg(undefined), noop)).toEqual(IDENTITY);
  });

  it('规则2 缺键:只设 haiku → sonnet 保持 identity', () => {
    expect(resolveModelTiers(cfg({ haiku: 'sonnet' }), noop)).toEqual({
      haiku: 'sonnet',
      sonnet: 'sonnet',
      opus: 'opus',
    });
  });

  it('规则1 单次查表:{haiku:sonnet, sonnet:opus} → haiku=sonnet(非递归)', () => {
    const r = resolveModelTiers(cfg({ haiku: 'sonnet', sonnet: 'opus' }), noop);
    expect(r.haiku).toBe('sonnet');
    expect(r.sonnet).toBe('opus');
  });

  it('规则3 malformed:model_tiers 非对象 → 全 identity + warn', () => {
    for (const bad of [null, 'x', 42, ['a']]) {
      const warns: string[] = [];
      expect(resolveModelTiers(cfg(bad), (m) => warns.push(m))).toEqual(IDENTITY);
      expect(warns.length).toBeGreaterThan(0);
    }
  });

  it('规则3 未知键(opus / max / 大小写变体 Haiku)→ 忽略 + warn', () => {
    const warns: string[] = [];
    const r = resolveModelTiers(cfg({ opus: 'haiku', max: 'opus', Haiku: 'sonnet' }), (m) =>
      warns.push(m),
    );
    expect(r).toEqual(IDENTITY);
    expect(warns.length).toBe(3);
  });

  it('规则4 非法值 → warn + 该 tier identity', () => {
    const warns: string[] = [];
    expect(resolveModelTiers(cfg({ haiku: 'gpt4' }), (m) => warns.push(m)).haiku).toBe('haiku');
    expect(warns.length).toBe(1);
  });

  it('规则5 升级正确 / 降级被拒(warn + identity)', () => {
    expect(resolveModelTiers(cfg({ haiku: 'opus' }), noop).haiku).toBe('opus');
    expect(resolveModelTiers(cfg({ sonnet: 'opus' }), noop).sonnet).toBe('opus');
    const warns: string[] = [];
    expect(resolveModelTiers(cfg({ sonnet: 'haiku' }), (m) => warns.push(m)).sonnet).toBe('sonnet');
    expect(warns.length).toBe(1);
  });

  it('规则6 opus 恒为 opus(永不被配置影响)', () => {
    expect(resolveModelTiers(cfg({ opus: 'haiku' }), noop).opus).toBe('opus');
    expect(resolveModelTiers(cfg({ haiku: 'opus' }), noop).opus).toBe('opus');
  });

  it('永不抛异常', () => {
    expect(() => resolveModelTiers(cfg(null), noop)).not.toThrow();
    expect(() => resolveModelTiers(cfg({ haiku: 999 }), noop)).not.toThrow();
  });
});

describe('validateModelTierAssignment — 写入侧 fail-fast', () => {
  it('合法:identity 与升级 → ok', () => {
    expect(validateModelTierAssignment('haiku', 'haiku')).toEqual({ ok: true });
    expect(validateModelTierAssignment('haiku', 'sonnet')).toEqual({ ok: true });
    expect(validateModelTierAssignment('haiku', 'opus')).toEqual({ ok: true });
    expect(validateModelTierAssignment('sonnet', 'opus')).toEqual({ ok: true });
  });

  it('invalid-field:tier 非 haiku/sonnet', () => {
    expect(validateModelTierAssignment('opus', 'opus')).toEqual({
      ok: false,
      reason: 'invalid-field',
    });
    expect(validateModelTierAssignment('max', 'sonnet')).toEqual({
      ok: false,
      reason: 'invalid-field',
    });
  });

  it('invalid-value:value 非枚举', () => {
    expect(validateModelTierAssignment('haiku', 'gpt4')).toEqual({
      ok: false,
      reason: 'invalid-value',
    });
  });

  it('downgrade:sonnet→haiku', () => {
    expect(validateModelTierAssignment('sonnet', 'haiku')).toEqual({
      ok: false,
      reason: 'downgrade',
    });
  });

  it('多重非法走优先级:invalid-field 先于 invalid-value', () => {
    expect(validateModelTierAssignment('opus', 'bogus')).toEqual({
      ok: false,
      reason: 'invalid-field',
    });
  });
});

describe('共享常量一致性', () => {
  it('MODEL_TIER_RANK 的键集 == MODEL_TIER_VALUES', () => {
    expect(Object.keys(MODEL_TIER_RANK).sort()).toEqual([...MODEL_TIER_VALUES].sort());
  });
});
