// tests/core/monitor/report-renderer.test.ts
import { describe, it, expect } from 'vitest';
import { renderReport } from '../../../src/core/monitor/report-renderer.js';
import type { TraceEvent } from '../../../src/core/monitor/types.js';

function ev(over: Partial<TraceEvent>): TraceEvent {
  return {
    ts: '2026-05-15T00:00:00.000Z',
    schema: 'forge-monitor-trace/v1',
    change_id: '2026-05-15-x',
    stage: 'verify',
    layer: 'ai',
    event: 'stage_enter',
    data: {},
    ...over,
  };
}

describe('renderReport', () => {
  it('含四个章节标题', () => {
    const md = renderReport('2026-05-15-x', [ev({})], []);
    expect(md).toMatch(/# Forge 工作流监控报告 — 2026-05-15-x/);
    expect(md).toMatch(/## 1\. 健康裁决/);
    expect(md).toMatch(/## 2\. 阶段时间线/);
    expect(md).toMatch(/## 3\. 三方对比表/);
    expect(md).toMatch(/## 4\. 附录/);
  });
  it('regression 出现在健康裁决段', () => {
    const md = renderReport(
      '2026-05-15-x',
      [
        ev({
          layer: 'ai',
          event: 'hardening_step',
          data: { step: '三维 verify', executed: false },
        }),
      ],
      [],
    );
    expect(md).toMatch(/检出回归/);
    expect(md).toMatch(/三维 verify/);
  });
  it('decision 事件进三方对比表', () => {
    const md = renderReport(
      '2026-05-15-x',
      [
        ev({
          layer: 'ai',
          event: 'decision',
          data: { scenario_id: 'verify-tests-green', chosen: '走了三维' },
        }),
      ],
      [],
    );
    expect(md).toMatch(/verify-tests-green/);
    expect(md).toMatch(/走了三维/);
  });
  it('空 events → 时间线与对比表显示空态', () => {
    const md = renderReport('2026-05-15-x', [], []);
    expect(md).toMatch(/\(无 trace 事件\)/);
    expect(md).toMatch(/无 decision record/);
    expect(md).toMatch(/无命中项/);
  });
  it('cliExits 渲染进时间线段', () => {
    const md = renderReport(
      '2026-05-15-x',
      [],
      [{ ts: '2026-05-15T00:00:00.000Z', command: ['verify', 'x'], cwd: '/p', exit_code: 1 }],
    );
    expect(md).toMatch(/CLI exit 记录/);
    expect(md).toMatch(/forge verify x/);
    expect(md).toMatch(/exit 1/);
  });
});
