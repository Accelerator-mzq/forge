// forge update 子命令集成测试
// 验证:已 init 后重铺 skills、未 init 报错、--harness 参数

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

describe('forge update', () => {
  // Test 1: 已 init 项目 → forge update 默认不覆盖被改文件,--force 才覆盖
  it('已 init 项目 → forge update 默认不覆盖被改文件,--force 才覆盖', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-update-claude-'));
    try {
      const initR = runCli(['init', '--harness=claude'], d);
      expect(initR.exitCode).toBe(0);

      const skillPath = join(d, '.claude', 'skills', 'forge-using-forge', 'SKILL.md');
      writeFileSync(skillPath, 'USER MODIFIED', 'utf8');

      // update 不加 --force → 跳过
      const r1 = runCli(['update'], d);
      expect(r1.exitCode).toBe(0);
      expect(readFileSync(skillPath, 'utf8')).toBe('USER MODIFIED');

      // update --force → 覆盖回真模板
      const r2 = runCli(['update', '--force'], d);
      expect(r2.exitCode).toBe(0);
      const restored = readFileSync(skillPath, 'utf8');
      expect(restored).toContain('forge:using-forge');
      expect(restored).not.toBe('USER MODIFIED');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 2: 没有 forge/config.yaml(未 init) → forge update 报错 exit 1
  it('未 init 的项目(无 forge/config.yaml) → forge update 报错 exit 1', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-update-noinit-'));
    try {
      const r = runCli(['update'], d);
      expect(r.exitCode).toBe(1);
      // 错误提示包含指引
      expect(r.stderr).toMatch(/forge init|config\.yaml/i);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 3: 用 --harness 参数覆盖 config.yaml → 铺指定的 harness
  it('--harness=codex 参数覆盖 → 铺到 .agents/skills/', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-update-harness-'));
    try {
      // 先 init claude,config.yaml 里记录 claude
      const initR = runCli(['init', '--harness=claude'], d);
      expect(initR.exitCode).toBe(0);

      // 用 --harness=codex 强制覆盖
      const r = runCli(['update', '--harness=codex'], d);
      expect(r.exitCode).toBe(0);

      // codex 的 .agents/skills/ 应该存在
      expect(existsSync(join(d, '.agents', 'skills', 'forge-using-forge', 'SKILL.md'))).toBe(true);
      expect(r.stdout).toContain('codex');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 4: config.yaml 有 harness 字段但为空数组 → 报错
  it('config.yaml harness 字段为空,无 --harness → 报错 exit 1', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-update-noharness-'));
    try {
      // 手动创建 forge/config.yaml(无 harness 字段)
      mkdirSync(join(d, 'forge'), { recursive: true });
      writeFileSync(join(d, 'forge', 'config.yaml'), 'schema: forge-spec-driven/v1\n', 'utf8');

      const r = runCli(['update'], d);
      expect(r.exitCode).toBe(1);
      // 错误提示包含如何修复的信息
      expect(r.stderr).toMatch(/harness|--harness/i);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
