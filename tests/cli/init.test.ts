// forge init 子命令集成测试
// 验证 detect + adapters + atomic deploy + forge 目录骨架创建

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

describe('forge init', () => {
  // Test 1: forge init --harness=claude → 创建 .claude/skills/forge-using-forge/SKILL.md + forge 骨架
  it('forge init --harness=claude → 创建 SKILL.md + forge 目录骨架', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-init-claude-'));
    try {
      const r = runCli(['init', '--harness=claude'], d);
      expect(r.exitCode).toBe(0);

      // adapter 铺的 skill 文件
      const skillPath = join(d, '.claude', 'skills', 'forge-using-forge', 'SKILL.md');
      expect(existsSync(skillPath)).toBe(true);
      expect(readFileSync(skillPath, 'utf8')).toContain('placeholder');

      // forge 目录骨架
      expect(existsSync(join(d, 'forge', 'config.yaml'))).toBe(true);
      expect(existsSync(join(d, 'forge', 'drafts'))).toBe(true);
      expect(existsSync(join(d, 'forge', 'changes'))).toBe(true);
      expect(existsSync(join(d, 'forge', 'specs'))).toBe(true);

      // stdout 包含成功消息
      expect(r.stdout).toContain('forge initialized');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 2: forge init --harness=codex → 创建 .agents/skills/forge-using-forge/SKILL.md
  it('forge init --harness=codex → 创建 .agents/skills 下 SKILL.md', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-init-codex-'));
    try {
      const r = runCli(['init', '--harness=codex'], d);
      expect(r.exitCode).toBe(0);

      // Codex adapter 铺到 .agents/skills/
      const skillPath = join(d, '.agents', 'skills', 'forge-using-forge', 'SKILL.md');
      expect(existsSync(skillPath)).toBe(true);
      expect(readFileSync(skillPath, 'utf8')).toContain('placeholder');

      // .claude 不应该被创建
      expect(existsSync(join(d, '.claude', 'skills'))).toBe(false);

      // forge 骨架依然创建
      expect(existsSync(join(d, 'forge', 'config.yaml'))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 3: forge init --harness=claude,codex → 同时铺两个 harness
  it('forge init --harness=claude,codex → 同时铺两个 harness', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-init-both-'));
    try {
      const r = runCli(['init', '--harness=claude,codex'], d);
      expect(r.exitCode).toBe(0);

      // Claude adapter
      expect(existsSync(join(d, '.claude', 'skills', 'forge-using-forge', 'SKILL.md'))).toBe(true);

      // Codex adapter
      expect(existsSync(join(d, '.agents', 'skills', 'forge-using-forge', 'SKILL.md'))).toBe(true);

      // forge 骨架
      expect(existsSync(join(d, 'forge', 'config.yaml'))).toBe(true);
      expect(existsSync(join(d, 'forge', 'drafts'))).toBe(true);
      expect(existsSync(join(d, 'forge', 'changes'))).toBe(true);
      expect(existsSync(join(d, 'forge', 'specs'))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 4: forge init 无参数,在已有 .claude/ 的目录 → 自动检测到 claude 并铺
  it('forge init 无参数,在 .claude/ 已存在时自动检测并铺 claude', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-init-auto-'));
    try {
      // 预先创建 .claude/ 目录,模拟已有 Claude Code 项目
      mkdirSync(join(d, '.claude'), { recursive: true });

      const r = runCli(['init'], d);
      expect(r.exitCode).toBe(0);

      // 自动检测到 claude 并部署
      expect(existsSync(join(d, '.claude', 'skills', 'forge-using-forge', 'SKILL.md'))).toBe(true);

      // stdout 包含 claude
      expect(r.stdout).toContain('claude');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 5(可选): 非 git 目录跑 forge init → stderr 含 warn 信息
  it('非 git 目录跑 forge init --harness=claude → stderr 含非 git warn', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-init-nogit-'));
    try {
      // d 是空目录,没有 .git
      const r = runCli(['init', '--harness=claude'], d);
      // 命令本身成功
      expect(r.exitCode).toBe(0);

      // stderr 应含 warn 提示
      const combined = r.stderr + r.stdout;
      // 包含 "git init" 或 "非 git" 的提示
      expect(combined).toMatch(/git init|非 git/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 6: forge init --harness=unknown → exit 1 + stderr 含 Unknown harness
  it('forge init --harness=unknown → exit 1, stderr 含 Unknown harness', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-init-bad-'));
    try {
      const r = runCli(['init', '--harness=unknown'], d);
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('Unknown harness id');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 7: 幂等性 — 二次 forge init 相同 harness → harness 字段相同
  it('二次 forge init 相同 harness → harness 字段保持不变', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-init-idempotent-'));
    try {
      // 第一次 init
      runCli(['init', '--harness=claude'], d);
      const configPath = join(d, 'forge', 'config.yaml');
      expect(existsSync(configPath)).toBe(true);

      // 第二次 init 相同 harness
      const r2 = runCli(['init', '--harness=claude'], d);
      expect(r2.exitCode).toBe(0);

      // harness 字段应该一致(yaml 格式可能有细微空白差异,只检查字段内容)
      const afterContent = readFileSync(configPath, 'utf8');
      expect(afterContent).toContain('claude');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test P2.1: 已有 config.yaml + forge init --harness=codex → harness 变 codex,schema 字段保留
  it('P2.1:已有 config.yaml(harness=claude) + init --harness=codex → harness 变 codex,schema 字段保留', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-init-p21-'));
    try {
      // 第一次 init claude
      runCli(['init', '--harness=claude'], d);
      const configPath = join(d, 'forge', 'config.yaml');
      expect(existsSync(configPath)).toBe(true);
      const firstContent = readFileSync(configPath, 'utf8');
      expect(firstContent).toContain('claude');

      // 第二次 init codex — 应该覆盖 harness 字段,但保留 schema
      const r2 = runCli(['init', '--harness=codex'], d);
      expect(r2.exitCode).toBe(0);

      const afterContent = readFileSync(configPath, 'utf8');
      // harness 字段更新为 codex
      expect(afterContent).toContain('codex');
      // schema 字段保留
      expect(afterContent).toContain('forge-spec-driven/v1');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test P2.2a: --force flag 被接受(当前 noop,为 Plan 4 准备的 surface)
  it('P2.2:accepts --force flag (currently noop, prepared for Plan 4)', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-init-force-'));
    try {
      const r = runCli(['init', '--harness=claude', '--force'], d);
      expect(r.exitCode).toBe(0);
      // 当前是 noop,只验证不报错,命令正常完成
      expect(r.stdout).toContain('forge initialized');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
