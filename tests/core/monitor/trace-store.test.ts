// tests/core/monitor/trace-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendTraceEvent,
  readTrace,
  recordCliExit,
  traceFilePath,
  cliExitsPath,
} from '../../../src/core/monitor/trace-store.js';
import type { TraceEvent } from '../../../src/core/monitor/types.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-trace-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function ev(over: Partial<TraceEvent> = {}): TraceEvent {
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

describe('appendTraceEvent / readTrace', () => {
  it('首次 append 自建目录,readTrace 读回', () => {
    appendTraceEvent(root, ev({ event: 'stage_enter' }));
    appendTraceEvent(root, ev({ event: 'stage_exit' }));
    const { events, corruptLines } = readTrace(root, '2026-05-15-x');
    expect(events.map((e) => e.event)).toEqual(['stage_enter', 'stage_exit']);
    expect(corruptLines).toBe(0);
  });
  it('trace 不存在 → 空结果', () => {
    expect(readTrace(root, '无此 change')).toEqual({ events: [], corruptLines: 0 });
  });
  it('坏行被跳过并计数', () => {
    appendTraceEvent(root, ev());
    appendFileSync(traceFilePath(root, '2026-05-15-x'), '这不是 json\n', 'utf8');
    appendTraceEvent(root, ev({ event: 'stage_exit' }));
    const { events, corruptLines } = readTrace(root, '2026-05-15-x');
    expect(events).toHaveLength(2);
    expect(corruptLines).toBe(1);
  });
});

describe('recordCliExit', () => {
  it('首次写自建目录,追加 JSONL', () => {
    recordCliExit(root, {
      ts: '2026-05-15T00:00:00.000Z',
      command: ['verify'],
      cwd: root,
      exit_code: 0,
    });
    const txt = readFileSync(cliExitsPath(root), 'utf8').trim();
    expect(JSON.parse(txt)).toMatchObject({ command: ['verify'], exit_code: 0 });
  });
});
