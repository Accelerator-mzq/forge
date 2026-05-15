import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'hooks', 'monitor-check.mjs');

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-check-'));
  mkdirSync(join(root, 'forge'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function check(configText?: string): number {
  if (configText !== undefined) {
    writeFileSync(join(root, 'forge', 'config.yaml'), configText, 'utf8');
  }
  return spawnSync('node', [SCRIPT], { cwd: root }).status ?? -1;
}

describe('monitor-check.mjs', () => {
  it('config 缺失 → exit 1', () => {
    expect(check()).toBe(1);
  });
  it('块式 monitor.enabled: true → exit 0', () => {
    expect(check('schema: forge-spec-driven/v1\nmonitor:\n  enabled: true\n')).toBe(0);
  });
  it('块式 monitor.enabled: false → exit 1', () => {
    expect(check('schema: forge-spec-driven/v1\nmonitor:\n  enabled: false\n')).toBe(1);
  });
  it('inline flow monitor: { enabled: true } → exit 0', () => {
    expect(check('schema: forge-spec-driven/v1\nmonitor: { enabled: true }\n')).toBe(0);
  });
  it('注释掉的 enabled 不算数 → exit 1', () => {
    expect(check('schema: forge-spec-driven/v1\nmonitor:\n  # enabled: true\n')).toBe(1);
  });
  it('别的父键下的 enabled 不误判 → exit 1', () => {
    expect(check('schema: forge-spec-driven/v1\nother:\n  enabled: true\n')).toBe(1);
  });
  it('带引号的 "true" 不算裸 boolean → exit 1', () => {
    expect(check('schema: forge-spec-driven/v1\nmonitor:\n  enabled: "true"\n')).toBe(1);
  });
});
