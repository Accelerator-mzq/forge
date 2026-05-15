// tests/core/monitor/cli-monitor.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMonitorCommand } from '../../../src/cli/commands/monitor.js';
import { isMonitorEnabled } from '../../../src/core/monitor/config.js';

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
