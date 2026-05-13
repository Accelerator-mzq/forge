// tests/cli/evidence-helpers.test.ts
// forge evidence {record-tdd,record-verify,record-review} 子命令集成测试
// 覆盖:happy path / 确定性 hash / 无效 scope / 多条日志追加顺序
// plan-9g Task 3.3 扩:+5 case(三 helper staging append + ack-log chain + lock)

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
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

  it('带 --expected-failures 时正确解析 JSON 并写入 extra.red_commit.expected_failures', () => {
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
      // plan-9g Task 3.3:expected_failures 移入 red_commit 节点
      const redCommit = extra['red_commit'] as Record<string, unknown>;
      expect(Array.isArray(redCommit['expected_failures'])).toBe(true);
      expect(redCommit['expected_failures']).toEqual(['test-a', 'test-b']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('record-tdd rejects invalid --expected-failures JSON with exit 2', () => {
    const root = setupChange();
    try {
      // 故意传入语法非法的 JSON 字符串,期望 exit 2 + stderr 提示
      const result = runCli(
        [
          'evidence',
          'record-tdd',
          'test-change',
          '--task',
          'tasks.md#task-1',
          '--red-commit',
          'abc',
          '--green-commit',
          'def',
          '--expected-failures',
          '[invalid json',
        ],
        root,
      );
      // exit 2 与 invalid scope 错误路径一致(不是 commander 兜底的 exit 1)
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toMatch(/Invalid --expected-failures/);
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

  it('带可选 --spec-iterations / --quality-iterations 时正确写入 extra(plan-9g rename)', () => {
    const root = setupChange();
    try {
      // plan-9g Task 3.3:--spec-iterations / --quality-iterations(JSON array;rename from 单数形式)
      const specIters = JSON.stringify([
        { reviewer_commit: 'abc000', outcome: 'approved', notes_log_path: 'docs/spec-notes.md' },
      ]);
      const qualityIters = JSON.stringify([
        { reviewer_commit: 'abc000', outcome: 'approved', notes_log_path: 'docs/quality-notes.md' },
      ]);
      const result = runCli(
        [
          'evidence',
          'record-review',
          'test-change',
          '--task',
          'tasks.md#task-5',
          '--implementer-commit',
          'abc000',
          '--spec-iterations',
          specIters,
          '--quality-iterations',
          qualityIters,
        ],
        root,
      );

      expect(result.exitCode).toBe(0);

      const entries = readAckLog(root);
      const extra = entries[0]!['extra'] as Record<string, unknown>;
      // plan-9g:字段名改为复数 + JSON array
      expect(Array.isArray(extra['spec_iterations'])).toBe(true);
      expect(Array.isArray(extra['quality_iterations'])).toBe(true);
      const specArr = extra['spec_iterations'] as Record<string, unknown>[];
      expect(specArr[0]!['outcome']).toBe('approved');
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

// ─── plan-9g Task 3.3 扩:staging.yaml 写入 + ack-log chain + 新 options ──────

/** 读取 staging.yaml 返回解析后对象 */
function readStagingYaml(root: string): Record<string, unknown> {
  const stagingPath = join(
    root,
    'forge',
    'changes',
    'test-change',
    '.evidence',
    'process-evidence.staging.yaml',
  );
  const raw = readFileSync(stagingPath, 'utf8');
  return parseYaml(raw) as Record<string, unknown>;
}

describe('forge evidence record-tdd staging 写入(plan-9g Task 3.3)', () => {
  it('full options happy path — staging.yaml 写入正确字段 + ack-log chain', () => {
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
          '--red-timestamp',
          '2026-05-13T01:00:00Z',
          '--red-log',
          '.evidence/red.log',
          '--red-log-hash',
          'abc' + '0'.repeat(61),
          '--red-report',
          '.evidence/red-report.xml',
          '--red-report-hash',
          'def' + '0'.repeat(61),
          '--red-exit',
          '1',
          '--green-timestamp',
          '2026-05-13T02:00:00Z',
          '--green-log',
          '.evidence/green.log',
          '--green-log-hash',
          'ghi' + '0'.repeat(61),
          '--green-report',
          '.evidence/green-report.xml',
          '--green-report-hash',
          'jkl' + '0'.repeat(61),
          '--green-exit',
          '0',
          '--mode',
          'full',
        ],
        root,
      );
      expect(result.exitCode).toBe(0);

      // staging.yaml 应被创建
      const stagingPath = join(
        root,
        'forge',
        'changes',
        'test-change',
        '.evidence',
        'process-evidence.staging.yaml',
      );
      expect(existsSync(stagingPath)).toBe(true);

      // 读取 staging.yaml 验证字段
      const staging = readStagingYaml(root);
      expect(staging['schema']).toBe('forge-process-evidence/v1');
      expect(staging['process_verification_mode']).toBe('full');

      // tdd_event_chain 应含 1 条
      const chain = staging['tdd_event_chain'] as unknown[];
      expect(chain).toHaveLength(1);
      const tddEntry = chain[0] as Record<string, unknown>;
      expect(tddEntry['task_ref']).toBe('tasks.md#task-1');
      const redCommit = tddEntry['red_commit'] as Record<string, unknown>;
      expect(redCommit['sha']).toBe('aaa111');
      expect(redCommit['red_log_path']).toBe('.evidence/red.log');

      // ack-log chain:第一条 prev_entry_hash=null
      const entries = readAckLog(root);
      expect(entries[0]!['prev_entry_hash']).toBeNull();
      expect(entries[0]!['helper_name']).toBe('record-tdd');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('forge evidence record-verify staging 写入(plan-9g Task 3.3)', () => {
  it('full options happy path — staging.yaml verify_invocations append + ack-log chain', () => {
    const root = setupChange();
    try {
      // 第一次调用:建立 staging.yaml
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
          '.evidence/report.xml',
          '--result',
          'pass',
          '--report-hash',
          'aaa' + '0'.repeat(61),
          '--log',
          '.evidence/verify.log',
          '--log-hash',
          'bbb' + '0'.repeat(61),
          '--exit-code',
          '0',
          '--invoked-at',
          '2026-05-13T03:00:00Z',
        ],
        root,
      );
      // 第二次调用:append-only
      const r2 = runCli(
        [
          'evidence',
          'record-verify',
          'test-change',
          '--task-refs',
          'tasks.md#task-2',
          '--scope',
          'change-level',
          '--report',
          '.evidence/report2.xml',
          '--result',
          'fail',
        ],
        root,
      );
      expect(r2.exitCode).toBe(0);

      const staging = readStagingYaml(root);
      const invocations = staging['verify_invocations'] as unknown[];
      // append-only:两条
      expect(invocations).toHaveLength(2);
      expect((invocations[0] as Record<string, unknown>)['result']).toBe('pass');
      expect((invocations[1] as Record<string, unknown>)['result']).toBe('fail');

      // ack-log chain:第二条 prev 指向第一条
      const entries = readAckLog(root);
      expect(entries).toHaveLength(2);
      expect(entries[0]!['prev_entry_hash']).toBeNull();
      expect(typeof entries[1]!['prev_entry_hash']).toBe('string');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('forge evidence record-review staging 写入(plan-9g Task 3.3)', () => {
  it('full options happy path — staging.yaml subagent_review_chain 写入', () => {
    const root = setupChange();
    try {
      const specIterations = JSON.stringify([
        {
          reviewer_commit: 'rev001',
          outcome: 'approved',
          notes_log_path: '.evidence/spec-notes.md',
        },
      ]);
      const qualityIterations = JSON.stringify([
        {
          reviewer_commit: 'rev002',
          outcome: 'approved',
          notes_log_path: '.evidence/quality-notes.md',
        },
      ]);
      const result = runCli(
        [
          'evidence',
          'record-review',
          'test-change',
          '--task',
          'tasks.md#task-5',
          '--implementer-commit',
          'ff00ff',
          '--spec-iterations',
          specIterations,
          '--quality-iterations',
          qualityIterations,
          '--main-check-off-at',
          '2026-05-13T04:00:00Z',
        ],
        root,
      );
      expect(result.exitCode).toBe(0);

      const staging = readStagingYaml(root);
      const reviewChain = staging['subagent_review_chain'] as unknown[];
      expect(reviewChain).toHaveLength(1);
      const reviewEntry = reviewChain[0] as Record<string, unknown>;
      expect(reviewEntry['task_ref']).toBe('tasks.md#task-5');
      expect(reviewEntry['implementer_commit']).toBe('ff00ff');
      expect(reviewEntry['main_agent_check_off_at']).toBe('2026-05-13T04:00:00Z');

      // spec_reviewer_iterations 应含 1 条
      const specIters = reviewEntry['spec_reviewer_iterations'] as unknown[];
      expect(specIters).toHaveLength(1);
      expect((specIters[0] as Record<string, unknown>)['outcome']).toBe('approved');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('forge evidence staging append-only(多次 record-tdd)', () => {
  it('第二次 record-tdd 追加到 tdd_event_chain 而非覆盖', () => {
    const root = setupChange();
    try {
      runCli(
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
      runCli(
        [
          'evidence',
          'record-tdd',
          'test-change',
          '--task',
          'tasks.md#task-2',
          '--red-commit',
          'ccc333',
          '--green-commit',
          'ddd444',
        ],
        root,
      );

      const staging = readStagingYaml(root);
      const chain = staging['tdd_event_chain'] as unknown[];
      // 两条 tdd_event_chain — append-only,不覆盖
      expect(chain).toHaveLength(2);
      expect((chain[0] as Record<string, unknown>)['task_ref']).toBe('tasks.md#task-1');
      expect((chain[1] as Record<string, unknown>)['task_ref']).toBe('tasks.md#task-2');

      // ack-log chain:第二条 prev 指第一条
      const entries = readAckLog(root);
      expect(entries).toHaveLength(2);
      expect(entries[1]!['prev_entry_hash']).not.toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
