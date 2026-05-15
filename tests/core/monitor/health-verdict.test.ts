import { describe, it, expect } from 'vitest';
import { computeVerdict } from '../../../src/core/monitor/health-verdict.js';
import type { TraceEvent } from '../../../src/core/monitor/types.js';

// 辅助函数: 生成测试 TraceEvent
function ev(over: Partial<TraceEvent>): TraceEvent {
  return {
    ts: '2026-05-15T00:00:00.000Z',
    schema: 'forge-monitor-trace/v1',
    change_id: 'x',
    stage: 'verify',
    layer: 'ai',
    event: 'stage_enter',
    data: {},
    ...over,
  };
}

describe('computeVerdict', () => {
  it('无事件 → ok', () => {
    expect(computeVerdict([]).level).toBe('ok');
  });

  it('hardening_step executed=false → regression', () => {
    const v = computeVerdict([
      ev({
        layer: 'ai',
        event: 'hardening_step',
        data: { step: '三维 verify', executed: false },
      }),
    ]);
    expect(v.level).toBe('regression');
    expect(v.items[0]?.kind).toBe('regression'); // ?. — tsconfig noUncheckedIndexedAccess
  });

  it('stage 有 CLI 事件但无 AI stage_enter → anomaly', () => {
    const v = computeVerdict([ev({ layer: 'cli', event: 'marker_observed', stage: 'verify' })]);
    expect(v.level).toBe('anomaly');
    expect(v.items[0]?.detail).toMatch(/缺 AI/); // ?. — tsconfig noUncheckedIndexedAccess
  });

  it('hardening 全 executed=true 且有 stage_enter → ok', () => {
    const v = computeVerdict([
      ev({ layer: 'ai', event: 'stage_enter', stage: 'verify' }),
      ev({ layer: 'cli', event: 'marker_observed', stage: 'verify' }),
      ev({
        layer: 'ai',
        event: 'hardening_step',
        stage: 'verify',
        data: { step: 's', executed: true },
      }),
    ]);
    expect(v.level).toBe('ok');
  });
});
