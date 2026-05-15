// tests/core/monitor/cli-monitor.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMonitorCommand } from '../../../src/cli/commands/monitor.js';
import { isMonitorEnabled } from '../../../src/core/monitor/config.js';
import { readTrace } from '../../../src/core/monitor/trace-store.js';

let root: string;
let cwd: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-cli-'));
  mkdirSync(join(root, 'forge'), { recursive: true });
  writeFileSync(join(root, 'forge', 'config.yaml'), 'schema: forge-spec-driven/v1\n');
  cwd = process.cwd();
  process.chdir(root);
});
afterEach(() => {
  process.chdir(cwd);
  rmSync(root, { recursive: true, force: true });
});

async function run(args: string[]): Promise<void> {
  await buildMonitorCommand().parseAsync(['node', 'forge', ...args]);
}

describe('forge monitor enable/disable', () => {
  it('enable 把 config.monitor.enabled 置 true', async () => {
    await run(['enable']);
    expect(isMonitorEnabled(root)).toBe(true);
  });
  it('disable 把它置 false', async () => {
    await run(['enable']);
    await run(['disable']);
    expect(isMonitorEnabled(root)).toBe(false);
  });
});

describe('forge monitor record', () => {
  it('监控开启 → 写入一条 AI 层事件', async () => {
    await run(['enable']);
    await run([
      'record',
      '--stage',
      'verify',
      '--event',
      'decision',
      '--change',
      '2026-05-15-x',
      '--json',
      '{"scenario_id":"verify-tests-green","chosen":"走了三维"}',
    ]);
    const { events } = readTrace(root, '2026-05-15-x');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ layer: 'ai', event: 'decision', stage: 'verify' });
    expect(events[0]?.data.chosen).toBe('走了三维'); // ?. — tsconfig noUncheckedIndexedAccess
  });
  it('监控关闭 → 静默 no-op,不写文件', async () => {
    await run([
      'record',
      '--stage',
      'verify',
      '--event',
      'stage_enter',
      '--change',
      '2026-05-15-y',
    ]);
    expect(readTrace(root, '2026-05-15-y').events).toHaveLength(0);
  });
  it('坏 json → 不抛,写一条 record_error', async () => {
    await run(['enable']);
    await run([
      'record',
      '--stage',
      'verify',
      '--event',
      'decision',
      '--change',
      '2026-05-15-z',
      '--json',
      '不是json',
    ]);
    const { events } = readTrace(root, '2026-05-15-z');
    expect(events.some((e) => e.event === 'record_error')).toBe(true);
  });
});
