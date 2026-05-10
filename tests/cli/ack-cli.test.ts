// tests/cli/ack-cli.test.ts
// forge ack {propose,confirm,reject} 子命令集成测试
// 覆盖:propose 写 pending YAML / CI 模式拒绝 / confirm 消费 pending / reject 消费 pending / 缺 rationale

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

// ─── Helper:搭建 change 目录骨架 ────────────────────────────────────────────

/**
 * 在临时目录下创建 forge/changes/test-change 子目录,返回项目根路径。
 * tests 以该目录为 cwd 运行,forge ack 命令会在 cwd 内解析 changeRoot。
 */
function setupChange(): string {
  const root = mkdtempSync(join(tmpdir(), 'forge-ack-cli-'));
  mkdirSync(join(root, 'forge', 'changes', 'test-change'), { recursive: true });
  return root;
}

// ─── 测试套件 ───────────────────────────────────────────────────────────────

describe('forge ack propose', () => {
  it('写 pending YAML 文件,exit 1,stderr 含 AI proposed ack 和 /forge:ack-confirm', () => {
    const root = setupChange();
    try {
      const result = runCli(
        ['ack', 'propose', 'test-change', '--finding', '7', '--action', 'ack-warning'],
        root,
      );

      // exit code 1:AI 已写 pending,需要 user 确认
      expect(result.exitCode).toBe(1);

      // stderr 含关键提示信息
      expect(result.stderr).toContain('AI proposed ack written to:');
      expect(result.stderr).toContain('/forge:ack-confirm');

      // pending 目录应有 YAML 文件
      const pendingDir = join(root, 'forge', 'changes', 'test-change', '.evidence', 'pending-acks');
      expect(existsSync(pendingDir)).toBe(true);

      const files = readdirSync(pendingDir);
      expect(files.length).toBe(1);

      // YAML 文件内容可读
      const content = readFileSync(join(pendingDir, files[0]!), 'utf8');
      expect(content).toContain('ack-propose');
      expect(content).toContain('test-change');
      expect(content).toContain('ack-warning');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('CI 模式下(env CI=true)exit 2,stderr 含 "CI mode"', () => {
    const root = setupChange();
    try {
      const result = runCli(
        ['ack', 'propose', 'test-change', '--finding', '7', '--action', 'ack-warning'],
        root,
        { CI: 'true' },
      );

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('CI mode');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('pending 文件名匹配 <findingId>-<isoTimestamp>.yaml 格式', () => {
    const root = setupChange();
    try {
      runCli(['ack', 'propose', 'test-change', '--finding', '7', '--action', 'ack-warning'], root);

      const pendingDir = join(root, 'forge', 'changes', 'test-change', '.evidence', 'pending-acks');
      const files = readdirSync(pendingDir);
      expect(files.length).toBe(1);

      // 文件名格式:7-YYYY-MM-DDTHH-MM-SS...yaml
      // 冒号已替换为连字符
      expect(files[0]).toMatch(/^7-\d{4}-\d{2}-\d{2}T/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('forge ack confirm', () => {
  it('confirm 后 exit 0,ack-log.jsonl 含 kind:ack + action:ack-warning,pending 文件删除', () => {
    const root = setupChange();
    try {
      // 先 propose
      runCli(['ack', 'propose', 'test-change', '--finding', '7', '--action', 'ack-warning'], root);

      // 再 confirm
      const result = runCli(['ack', 'confirm', 'test-change', '7'], root);
      expect(result.exitCode).toBe(0);

      // ack-log.jsonl 应有记录
      const logPath = join(root, 'forge', 'changes', 'test-change', '.evidence', 'ack-log.jsonl');
      expect(existsSync(logPath)).toBe(true);

      const logLine = readFileSync(logPath, 'utf8').trim();
      const entry = JSON.parse(logLine);
      expect(entry.kind).toBe('ack');
      expect(entry.action).toBe('ack-warning');

      // pending 文件已删除
      const pendingDir = join(root, 'forge', 'changes', 'test-change', '.evidence', 'pending-acks');
      const remaining = readdirSync(pendingDir);
      expect(remaining.length).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('无 pending 时 confirm exit 2,stderr 含 "No pending ack"', () => {
    const root = setupChange();
    try {
      const result = runCli(['ack', 'confirm', 'test-change', '7'], root);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('No pending ack');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('forge ack reject', () => {
  it('reject 后 exit 0,ack-log.jsonl 含 action:reject,pending 文件删除', () => {
    const root = setupChange();
    try {
      // 先 propose
      runCli(['ack', 'propose', 'test-change', '--finding', '7', '--action', 'ack-warning'], root);

      // 再 reject
      const result = runCli(
        ['ack', 'reject', 'test-change', '7', '--rationale', 'false positive'],
        root,
      );
      expect(result.exitCode).toBe(0);

      // ack-log.jsonl 应含 reject 记录
      const logPath = join(root, 'forge', 'changes', 'test-change', '.evidence', 'ack-log.jsonl');
      const logLine = readFileSync(logPath, 'utf8').trim();
      const entry = JSON.parse(logLine);
      expect(entry.action).toBe('reject');

      // pending 文件已删除
      const pendingDir = join(root, 'forge', 'changes', 'test-change', '.evidence', 'pending-acks');
      const remaining = readdirSync(pendingDir);
      expect(remaining.length).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reject 缺 --rationale 时 commander 报错,exit 非 0', () => {
    const root = setupChange();
    try {
      // 先 propose 一个 pending
      runCli(['ack', 'propose', 'test-change', '--finding', '7', '--action', 'ack-warning'], root);

      // reject 不带 --rationale
      const result = runCli(['ack', 'reject', 'test-change', '7'], root);
      // commander 对必填 option 报错,exit code 应为非 0
      expect(result.exitCode).not.toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
