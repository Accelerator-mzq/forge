// tests/cli/evidence-helpers.test.ts
// forge evidence {record-tdd,record-verify,record-review} 子命令集成测试
// 覆盖:happy path / 确定性 hash / 无效 scope / 多条日志追加顺序

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

// ─── Helper:搭建 change 目录骨架 ────────────────────────────────────────────

/**
 * 在临时目录下创建 forge/changes/test-change 子目录,返回项目根路径。
 * forge evidence 命令会在 cwd 内解析 changeRoot。
 */
function setupChange(): string {
  const root = mkdtempSync(join(tmpdir(), 'forge-evidence-cli-'));
  mkdirSync(join(root, 'forge', 'changes', 'test-change'), { recursive: true });
  return root;
}

/** 读取 ack-log.jsonl,返回解析后的 JSON 行数组 */
function readAckLog(root: string): Record<string, unknown>[] {
  const logPath = join(root, 'forge', 'changes', 'test-change', '.evidence', 'ack-log.jsonl');
  const raw = readFileSync(logPath, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

// ─── 测试套件:record-tdd ────────────────────────────────────────────────────

describe('forge evidence record-tdd', () => {
  it('happy path — exit 0,ack-log.jsonl 含正确字段', () => {
    const root = setupChange();
    try {
      const result = runCli(
        [
          'evidence',
          'record-tdd',
          'test-change',
          '--task',
          'tasks.md#task-1',
          '--red-commit',
          'aaa111',
          '--green-commit',
          'bbb222',
        ],
        root,
      );

      // exit 0 表示成功
      expect(result.exitCode).toBe(0);

      // 解析日志条目
      const entries = readAckLog(root);
      expect(entries.length).toBe(1);

      const entry = entries[0]!;
      // 基本字段验证
      expect(entry['schema']).toBe('forge-ack-log/v1');
      expect(entry['kind']).toBe('evidence-helper');
      expect(entry['helper_name']).toBe('record-tdd');
      expect(entry['change_id']).toBe('test-change');
      expect(entry['task_ref']).toBe('tasks.md#task-1');
      expect(entry['status']).toBe('success');

      // payload_hash 是 64 位十六进制 SHA256
      expect(typeof entry['payload_hash']).toBe('string');
      expect((entry['payload_hash'] as string).length).toBe(64);
      expect(entry['payload_hash'] as string).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('payload_hash 跨两次调用具有确定性(相同输入 → 相同 hash)', () => {
    const root1 = setupChange();
    const root2 = setupChange();
    try {
      const args = [
        'evidence',
        'record-tdd',
        'test-change',
        '--task',
        'tasks.md#task-2',
        '--red-commit',
        'deadbeef',
        '--green-commit',
        'cafebabe',
      ];

      runCli(args, root1);
      runCli(args, root2);

      const entries1 = readAckLog(root1);
      const entries2 = readAckLog(root2);

      // 两次调用的 payload_hash 必须完全一致
      expect(entries1[0]!['payload_hash']).toBe(entries2[0]!['payload_hash']);
    } finally {
      rmSync(root1, { recursive: true, force: true });
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it('带 --expected-failures 时正确解析 JSON 并写入 extra', () => {
    const root = setupChange();
    try {
      const result = runCli(
        [
          'evidence',
          'record-tdd',
          'test-change',
          '--task',
          'tasks.md#task-3',
          '--red-commit',
          'abc123',
          '--green-commit',
          'def456',
          '--expected-failures',
          '["test-a","test-b"]',
        ],
        root,
      );

      expect(result.exitCode).toBe(0);

      const entries = readAckLog(root);
      const extra = entries[0]!['extra'] as Record<string, unknown>;
      // expected_failures 应解析为数组
      expect(Array.isArray(extra['expected_failures'])).toBe(true);
      expect(extra['expected_failures']).toEqual(['test-a', 'test-b']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── 测试套件:record-verify ─────────────────────────────────────────────────

describe('forge evidence record-verify', () => {
  it('--scope per-task → exit 0,日志含 helper_name:record-verify', () => {
    const root = setupChange();
    try {
      const result = runCli(
        [
          'evidence',
          'record-verify',
          'test-change',
          '--task-refs',
          'tasks.md#task-1,tasks.md#task-2',
          '--scope',
          'per-task',
          '--report',
          'forge/changes/test-change/verify-report.md',
        ],
        root,
      );

      expect(result.exitCode).toBe(0);

      const entries = readAckLog(root);
      expect(entries.length).toBe(1);

      const entry = entries[0]!;
      expect(entry['kind']).toBe('evidence-helper');
      expect(entry['helper_name']).toBe('record-verify');
      expect(entry['change_id']).toBe('test-change');
      expect(entry['status']).toBe('success');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--scope change-level → exit 0', () => {
    const root = setupChange();
    try {
      const result = runCli(
        [
          'evidence',
          'record-verify',
          'test-change',
          '--task-refs',
          'tasks.md#task-1',
          '--scope',
          'change-level',
          '--report',
          'report.md',
        ],
        root,
      );

      expect(result.exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('无效 scope → exit 2,stderr 含错误信息', () => {
    const root = setupChange();
    try {
      const result = runCli(
        [
          'evidence',
          'record-verify',
          'test-change',
          '--task-refs',
          'tasks.md#task-1',
          '--scope',
          'invalid-scope',
          '--report',
          'report.md',
        ],
        root,
      );

      // 无效 scope 应 exit 2
      expect(result.exitCode).toBe(2);
      // stderr 应包含错误提示
      expect(result.stderr).toMatch(/scope/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── 测试套件:record-review ─────────────────────────────────────────────────

describe('forge evidence record-review', () => {
  it('happy path — exit 0,日志含 helper_name:record-review', () => {
    const root = setupChange();
    try {
      const result = runCli(
        [
          'evidence',
          'record-review',
          'test-change',
          '--task',
          'tasks.md#task-5',
          '--implementer-commit',
          'ff00ff',
        ],
        root,
      );

      expect(result.exitCode).toBe(0);

      const entries = readAckLog(root);
      expect(entries.length).toBe(1);

      const entry = entries[0]!;
      expect(entry['kind']).toBe('evidence-helper');
      expect(entry['helper_name']).toBe('record-review');
      expect(entry['change_id']).toBe('test-change');
      expect(entry['status']).toBe('success');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('带可选 --spec-iteration / --quality-iteration 时正确写入 extra', () => {
    const root = setupChange();
    try {
      const result = runCli(
        [
          'evidence',
          'record-review',
          'test-change',
          '--task',
          'tasks.md#task-5',
          '--implementer-commit',
          'abc000',
          '--spec-iteration',
          'abc000:approved:docs/spec-notes.md',
          '--quality-iteration',
          'abc000:approved:docs/quality-notes.md',
        ],
        root,
      );

      expect(result.exitCode).toBe(0);

      const entries = readAckLog(root);
      const extra = entries[0]!['extra'] as Record<string, unknown>;
      expect(extra['spec_iteration']).toBe('abc000:approved:docs/spec-notes.md');
      expect(extra['quality_iteration']).toBe('abc000:approved:docs/quality-notes.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── 测试套件:多命令追加顺序 ────────────────────────────────────────────────

describe('forge evidence 多命令追加顺序', () => {
  it('三种 helper 追加到同一 ack-log.jsonl,行数与 helper_name 顺序正确', () => {
    const root = setupChange();
    try {
      // 依次调用三个 helper
      runCli(
        [
          'evidence',
          'record-tdd',
          'test-change',
          '--task',
          'tasks.md#task-1',
          '--red-commit',
          'r1',
          '--green-commit',
          'g1',
        ],
        root,
      );

      runCli(
        [
          'evidence',
          'record-verify',
          'test-change',
          '--task-refs',
          'tasks.md#task-1',
          '--scope',
          'per-task',
          '--report',
          'report.md',
        ],
        root,
      );

      runCli(
        [
          'evidence',
          'record-review',
          'test-change',
          '--task',
          'tasks.md#task-1',
          '--implementer-commit',
          'impl001',
        ],
        root,
      );

      // 读取日志:应有 3 行,顺序与调用一致
      const entries = readAckLog(root);
      expect(entries.length).toBe(3);
      expect(entries[0]!['helper_name']).toBe('record-tdd');
      expect(entries[1]!['helper_name']).toBe('record-verify');
      expect(entries[2]!['helper_name']).toBe('record-review');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
