// forge config 子命令测试
// 测试 get/set 操作及错误路径

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

describe('forge config', () => {
  // Test 1: forge config set <field> <value> 能写入 forge/config.yaml
  it('forge config set schema <value> 写入 forge/config.yaml', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-config-'));
    try {
      const r = runCli(['config', 'set', 'schema', 'forge-spec-driven/v2'], d);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('set schema = forge-spec-driven/v2');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 2: forge config get <field> 能读取已设置的值
  it('forge config get schema 返回之前 set 的值', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-config-'));
    try {
      // 先 set
      runCli(['config', 'set', 'schema', 'forge-spec-driven/v2'], d);
      // 再 get
      const r = runCli(['config', 'get', 'schema'], d);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('forge-spec-driven/v2');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 3: forge config get <field> 在 config.yaml 不存在时报错
  it('forge config get xxx 在 forge/config.yaml 不存在时报错', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-config-'));
    try {
      const r = runCli(['config', 'get', 'schema'], d);
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('not found');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
