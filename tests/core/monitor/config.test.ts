// tests/core/monitor/config.test.ts - monitor 配置读写测试
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMonitorEnabled, setMonitorEnabled } from '../../../src/core/monitor/config.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-cfg-'));
  mkdirSync(join(root, 'forge'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeConfig(text: string): void {
  writeFileSync(join(root, 'forge', 'config.yaml'), text, 'utf8');
}

describe('isMonitorEnabled', () => {
  it('config 缺失 → false', () => {
    expect(isMonitorEnabled(root)).toBe(false);
  });
  it('缺 monitor 段 → false', () => {
    writeConfig('schema: forge-spec-driven/v1\n');
    expect(isMonitorEnabled(root)).toBe(false);
  });
  it('monitor.enabled: true → true', () => {
    writeConfig('schema: forge-spec-driven/v1\nmonitor:\n  enabled: true\n');
    expect(isMonitorEnabled(root)).toBe(true);
  });
  it('monitor.enabled: false → false', () => {
    writeConfig('schema: forge-spec-driven/v1\nmonitor:\n  enabled: false\n');
    expect(isMonitorEnabled(root)).toBe(false);
  });
  it('config 损坏 → false,不抛', () => {
    writeConfig(': : : 不是合法 yaml : :\n');
    expect(isMonitorEnabled(root)).toBe(false);
  });
});

describe('setMonitorEnabled', () => {
  it('写入嵌套 monitor.enabled,且保留其它字段值', () => {
    writeConfig('schema: forge-spec-driven/v1\ncontext: 我的项目\n');
    setMonitorEnabled(root, true);
    const txt = readFileSync(join(root, 'forge', 'config.yaml'), 'utf8');
    expect(txt).toMatch(/monitor:/);
    expect(txt).toMatch(/enabled: true/);
    expect(txt).toMatch(/context: 我的项目/);
    expect(isMonitorEnabled(root)).toBe(true);
  });
  it('setMonitorEnabled(false) 后 isMonitorEnabled 为 false', () => {
    writeConfig('schema: forge-spec-driven/v1\nmonitor:\n  enabled: true\n');
    setMonitorEnabled(root, false);
    expect(isMonitorEnabled(root)).toBe(false);
  });
  it('config 不存在 → 报错提示 forge init', () => {
    expect(() => setMonitorEnabled(root, true)).toThrow(/forge init/);
  });
  it('config 损坏 → 报错 abort,不覆盖', () => {
    writeConfig(': : 损坏 : :\n');
    expect(() => setMonitorEnabled(root, true)).toThrow(/解析失败/);
  });
});
