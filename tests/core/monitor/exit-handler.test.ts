// tests/core/monitor/exit-handler.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maybeRecordCliExit } from '../../../src/core/monitor/exit-handler.js';
import { readCliExits, cliExitsPath } from '../../../src/core/monitor/trace-store.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-exit-'));
  mkdirSync(join(root, 'forge'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function enable(): void {
  writeFileSync(join(root, 'forge', 'config.yaml'), 'schema: forge-spec-driven/v1\nmonitor:\n  enabled: true\n');
}

describe('maybeRecordCliExit', () => {
  it('监控关闭 → 不写文件', () => {
    maybeRecordCliExit(root, ['verify'], 0);
    expect(existsSync(cliExitsPath(root))).toBe(false);
  });
  it('监控开启 → 记录 exit', () => {
    enable();
    maybeRecordCliExit(root, ['verify', '2026-05-15-x'], 1);
    const recs = readCliExits(root);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.command).toEqual(['verify', '2026-05-15-x']); // ?. — noUncheckedIndexedAccess
    expect(recs[0]?.exit_code).toBe(1);
  });
  it('argv 以 monitor 开头 → 跳过自身,不记录', () => {
    enable();
    maybeRecordCliExit(root, ['monitor', 'report'], 0);
    expect(existsSync(cliExitsPath(root))).toBe(false);
  });
  it('内部异常被吞掉,绝不抛', () => {
    enable();
    // 传 undefined argv 模拟异常输入
    expect(() => maybeRecordCliExit(root, undefined as unknown as string[], 0)).not.toThrow();
  });
});
