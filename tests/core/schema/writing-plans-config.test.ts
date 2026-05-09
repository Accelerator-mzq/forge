// v0.3 P3 修复(Plan 2 Task 2.2)— writing-plans light_threshold validate 单测
// 覆盖 6 case:default / override / 非整数 / 非数字 / 范围下越界 / 范围上越界

import { describe, it, expect, vi } from 'vitest';
import { validateWritingPlansConfig } from '../../../src/core/schema/writing-plans-config.js';
import { DEFAULT_LIGHT_THRESHOLD } from '../../../src/core/schema/types.js';
import type { ForgeConfig } from '../../../src/core/schema/types.js';

describe('validateWritingPlansConfig', () => {
  it('default fallback to 200 when config undefined', () => {
    expect(validateWritingPlansConfig(undefined)).toBe(DEFAULT_LIGHT_THRESHOLD);
    expect(DEFAULT_LIGHT_THRESHOLD).toBe(200);
  });

  it('default fallback when writing_plans 段缺失', () => {
    const config: ForgeConfig = { schema: 'forge-spec-driven/v1' };
    expect(validateWritingPlansConfig(config)).toBe(200);
  });

  it('default fallback when light_threshold 缺失', () => {
    const config: ForgeConfig = {
      schema: 'forge-spec-driven/v1',
      writing_plans: {},
    };
    expect(validateWritingPlansConfig(config)).toBe(200);
  });

  it('user override 100 accepted(范围内合法)', () => {
    const config: ForgeConfig = {
      schema: 'forge-spec-driven/v1',
      writing_plans: { light_threshold: 100 },
    };
    expect(validateWritingPlansConfig(config)).toBe(100);
  });

  it('user override 边界值 50 accepted', () => {
    const config: ForgeConfig = {
      schema: 'forge-spec-driven/v1',
      writing_plans: { light_threshold: 50 },
    };
    expect(validateWritingPlansConfig(config)).toBe(50);
  });

  it('user override 边界值 2000 accepted', () => {
    const config: ForgeConfig = {
      schema: 'forge-spec-driven/v1',
      writing_plans: { light_threshold: 2000 },
    };
    expect(validateWritingPlansConfig(config)).toBe(2000);
  });

  it('rejects 非整数 (100.5) → warn + fallback 200', () => {
    const warnSpy = vi.fn();
    // 用 any cast 模拟用户写错配置(yaml 解析后可能是 float)
    const config = {
      schema: 'forge-spec-driven/v1',
      writing_plans: { light_threshold: 100.5 },
    } as ForgeConfig;
    expect(validateWritingPlansConfig(config, warnSpy)).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('integer'));
  });

  it('rejects 非数字 (string) → warn + fallback 200', () => {
    const warnSpy = vi.fn();
    const config = {
      schema: 'forge-spec-driven/v1',
      writing_plans: { light_threshold: '100' as unknown as number },
    } as ForgeConfig;
    expect(validateWritingPlansConfig(config, warnSpy)).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('number'));
  });

  it('rejects 范围下越界 (49) → warn + fallback 200', () => {
    const warnSpy = vi.fn();
    const config: ForgeConfig = {
      schema: 'forge-spec-driven/v1',
      writing_plans: { light_threshold: 49 },
    };
    expect(validateWritingPlansConfig(config, warnSpy)).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('range'));
  });

  it('rejects 范围上越界 (2001) → warn + fallback 200', () => {
    const warnSpy = vi.fn();
    const config: ForgeConfig = {
      schema: 'forge-spec-driven/v1',
      writing_plans: { light_threshold: 2001 },
    };
    expect(validateWritingPlansConfig(config, warnSpy)).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('range'));
  });
});
