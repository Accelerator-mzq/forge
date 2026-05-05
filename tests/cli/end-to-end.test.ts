// forge CLI 端到端集成测试 — 真跑 forge CLI 命令,验证完整工作流
// 包含 forge init、forge --version 等关键命令的端到端流程验证

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

describe('forge CLI end-to-end', () => {
  // Test 1: forge init --harness=claude 在空目录 → 创建完整结构并 exit 0
  it('forge init --harness=claude creates expected structure', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-e2e-'));
    try {
      const r = runCli(['init', '--harness=claude'], d);
      expect(r.exitCode).toBe(0);

      // 验证 .claude/skills/forge-using-forge/SKILL.md 存在
      expect(existsSync(join(d, '.claude/skills/forge-using-forge/SKILL.md'))).toBe(true);

      // 验证 forge/config.yaml 存在
      expect(existsSync(join(d, 'forge/config.yaml'))).toBe(true);

      // 验证 forge/changes 目录存在
      expect(existsSync(join(d, 'forge/changes'))).toBe(true);

      // stdout 包含成功消息
      expect(r.stdout).toContain('forge initialized');

      // Plan 4 真模板:验证 12 skill + 6 cmd 文件全部存在
      const skillNames = [
        'using-forge', 'brainstorming', 'writing-plans',
        'subagent-driven-development', 'test-driven-development',
        'requesting-code-review', 'receiving-code-review',
        'verification-before-completion', 'systematic-debugging',
        'dispatching-parallel-agents', 'using-git-worktrees',
        'finishing-a-development-branch',
      ];
      for (const n of skillNames) {
        expect(existsSync(join(d, `.claude/skills/forge-${n}/SKILL.md`))).toBe(true);
      }
      const cmdNames = ['brainstorm', 'propose', 'apply', 'review', 'verify', 'archive'];
      for (const n of cmdNames) {
        expect(existsSync(join(d, `.claude/commands/forge/${n}.md`))).toBe(true);
      }
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 2: forge --version 打印版本号,exit 0 并匹配 semver 格式
  it('forge --version prints version', () => {
    const r = runCli(['--version'], process.cwd());
    expect(r.exitCode).toBe(0);
    // 匹配 semver 格式: X.Y.Z
    expect(r.stdout).toMatch(/^\d+\.\d+\.\d+/);
  });

  // Test 3(可选): forge init 后 forge config get harness → 输出包含 "claude"
  it('forge init → forge config get harness outputs harness list', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-e2e-config-'));
    try {
      // 先初始化
      const initR = runCli(['init', '--harness=claude'], d);
      expect(initR.exitCode).toBe(0);

      // 再查询 harness 配置
      const configR = runCli(['config', 'get', 'harness'], d);
      expect(configR.exitCode).toBe(0);
      expect(configR.stdout).toContain('claude');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 4(可选): forge init 后 forge update --harness=claude → 成功且不报错
  it('forge init → forge update --harness=claude completes without error', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-e2e-update-'));
    try {
      // 先初始化
      const initR = runCli(['init', '--harness=claude'], d);
      expect(initR.exitCode).toBe(0);

      // 再更新(应该是幂等操作,不报错)
      const updateR = runCli(['update', '--harness=claude'], d);
      expect(updateR.exitCode).toBe(0);

      // forge 骨架应该保持完整
      expect(existsSync(join(d, 'forge/config.yaml'))).toBe(true);
      expect(existsSync(join(d, 'forge/changes'))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
