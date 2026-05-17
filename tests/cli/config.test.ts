// forge config 子命令测试
// 测试 get/set 操作及错误路径

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse as parseYAML } from 'yaml';
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

  // Test 4: set model_tiers.haiku 写成嵌套结构(不是 flat key)
  it('set model_tiers.haiku 写成嵌套 YAML,get 嵌套读取', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-config-'));
    try {
      const s = runCli(['config', 'set', 'model_tiers.haiku', 'sonnet'], d);
      expect(s.exitCode).toBe(0);
      expect(s.stdout).toContain('model_tiers 仅对');
      const parsed = parseYAML(readFileSync(join(d, 'forge', 'config.yaml'), 'utf8')) as Record<
        string,
        unknown
      >;
      expect((parsed.model_tiers as Record<string, unknown> | undefined)?.haiku).toBe('sonnet');
      expect(parsed['model_tiers.haiku']).toBeUndefined();
      const g = runCli(['config', 'get', 'model_tiers.haiku'], d);
      expect(g.exitCode).toBe(0);
      expect(g.stdout).toContain('sonnet');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 5: 三类非法 set —— exit≠0、stderr 含对应 reason、config 文件不变
  it('set model_tiers 非法值 fail-fast(stderr 含 reason、文件 byte-for-byte 不变)', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-config-'));
    try {
      runCli(['config', 'set', 'schema', 'forge-spec-driven/v1'], d);
      const cfgPath = join(d, 'forge', 'config.yaml');
      const before = readFileSync(cfgPath);
      const cases: Array<[string, string, string]> = [
        ['model_tiers.opus', 'sonnet', 'invalid-field'],
        ['model_tiers.haiku', 'gpt4', 'invalid-value'],
        ['model_tiers.sonnet', 'haiku', 'downgrade'],
      ];
      for (const [field, value, reason] of cases) {
        const r = runCli(['config', 'set', field, value], d);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr).toContain(reason);
      }
      expect(readFileSync(cfgPath).equals(before)).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 6: config.yaml 三类 ConfigParseError 下 set 拒写、文件 byte-for-byte 不变
  it('config.yaml 各类 ConfigParseError 下 set 拒写、文件不变', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-config-'));
    try {
      const dir = join(d, 'forge');
      mkdirSync(dir, { recursive: true });
      const cfgPath = join(dir, 'config.yaml');
      const corruptCases = [
        'schema: [unclosed\n  : :\n',
        'just a scalar string\n',
        'model_tiers:\n  haiku: sonnet\n',
      ];
      for (const content of corruptCases) {
        writeFileSync(cfgPath, content);
        const before = readFileSync(cfgPath);
        const r = runCli(['config', 'set', 'model_tiers.haiku', 'sonnet'], d);
        expect(r.exitCode).not.toBe(0);
        expect(readFileSync(cfgPath).equals(before)).toBe(true);
      }
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 7: get 缺键 → null;损坏 config get 报错;超层/空段点分键 set 拒绝且文件不变
  it('get 缺键 → null;损坏 config get 报错;超层/空段点分键 set 拒绝且文件不变', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-config-'));
    try {
      runCli(['config', 'set', 'schema', 'forge-spec-driven/v1'], d);
      const cfgPath = join(d, 'forge', 'config.yaml');
      const miss = runCli(['config', 'get', 'model_tiers.haiku'], d);
      expect(miss.exitCode).toBe(0);
      expect(miss.stdout.trim()).toBe('null');
      const before = readFileSync(cfgPath);
      for (const bad of ['model_tiers.haiku.x', '.haiku', 'model_tiers.']) {
        const r = runCli(['config', 'set', bad, 'sonnet'], d);
        expect(r.exitCode).not.toBe(0);
      }
      expect(readFileSync(cfgPath).equals(before)).toBe(true);
      writeFileSync(cfgPath, 'schema: [unclosed\n');
      const g = runCli(['config', 'get', 'schema'], d);
      expect(g.exitCode).not.toBe(0);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
