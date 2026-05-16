// tests/core/monitor/divergence-map.test.ts
import { describe, it, expect } from 'vitest';
import { DIVERGENCE_MAP, findScenario } from '../../../src/core/monitor/divergence-map.js';
import { COMPARABLE_STAGES } from '../../../src/core/monitor/types.js';

describe('divergence-map', () => {
  it('scenario_id 全表唯一', () => {
    const ids = DIVERGENCE_MAP.scenarios.map((s) => s.scenario_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('7 个可对比阶段每个至少 1 条场景', () => {
    for (const stage of COMPARABLE_STAGES) {
      expect(DIVERGENCE_MAP.scenarios.some((s) => s.stage === stage)).toBe(true);
    }
  });
  it('每条场景五个对比字段非空', () => {
    for (const s of DIVERGENCE_MAP.scenarios) {
      for (const f of [
        'openspec',
        'superpowers',
        'forge',
        'rationale',
        'regression_signal',
      ] as const) {
        expect(s[f].length, `${s.scenario_id}.${f}`).toBeGreaterThan(0);
      }
    }
  });
  it('findScenario 命中已知 id', () => {
    const s = findScenario('verify-tests-green');
    expect(s?.stage).toBe('verify');
  });
  it('findScenario 未命中返回 undefined', () => {
    expect(findScenario('不存在的-id')).toBeUndefined();
  });
});
