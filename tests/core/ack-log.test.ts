import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendAckLog, listPending, getPendingPath } from '../../src/core/ack-log.js';

describe('ack-log', () => {
  let tmp: string;

  // 每个测试前创建临时目录结构
  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), 'forge-acklog-'));
    await mkdir(path.join(tmp, '.evidence/pending-acks'), { recursive: true });
  });

  // 每个测试后清理临时目录
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('appendAckLog writes one line per entry (NDJSON)', async () => {
    // 写入两条不同 kind 的日志条目
    await appendAckLog(tmp, {
      schema: 'forge-ack-log/v1',
      kind: 'ack',
      timestamp: '2026-01-01',
      action: 'ack-warning',
      change_id: 'c1',
      finding_id: '1',
      user: 'u',
      rationale: null,
      git_head: null,
      finding_hash: null,
      extra: {},
    });
    await appendAckLog(tmp, {
      schema: 'forge-ack-log/v1',
      kind: 'evidence-helper',
      timestamp: '2026-01-02',
      helper_name: 'record-tdd',
      change_id: 'c1',
      task_ref: 't1',
      payload_hash: 'h',
      status: 'success',
      git_head: null,
      extra: {},
    });

    const log = await readFile(path.join(tmp, '.evidence/ack-log.jsonl'), 'utf8');
    const lines = log.trim().split('\n');
    expect(lines.length).toBe(2);
    // 非空断言:上方 expect 已验证长度为 2,元素一定存在
    expect(JSON.parse(lines[0]!).kind).toBe('ack');
    expect(JSON.parse(lines[1]!).kind).toBe('evidence-helper');
  });

  it('listPending returns sorted by timestamp ascending', async () => {
    // 构造两个不同时间戳的 pending 文件,验证按升序排列
    const p1 = getPendingPath(tmp, '7', '2026-05-12T14:30:00.000Z');
    const p2 = getPendingPath(tmp, '7', '2026-05-12T10:00:00.000Z');
    await writeFile(p1, 'a', 'utf8');
    await writeFile(p2, 'b', 'utf8');
    const list = await listPending(tmp, '7');
    expect(list.length).toBe(2);
    // 非空断言:上方 expect 已验证长度为 2,元素一定存在
    expect(list[0]!.timestamp < list[1]!.timestamp).toBe(true);
  });

  it('listPending filters by findingId', async () => {
    // 验证 findingId 过滤:写入两个不同 finding 的文件,只返回指定的
    await writeFile(getPendingPath(tmp, '7', '2026-05-12T10:00:00.000Z'), 'a', 'utf8');
    await writeFile(getPendingPath(tmp, '8', '2026-05-12T10:00:00.000Z'), 'b', 'utf8');
    const list = await listPending(tmp, '7');
    expect(list.length).toBe(1);
    // 非空断言:上方 expect 已验证长度为 1,元素一定存在
    expect(list[0]!.findingId).toBe('7');
  });

  it('listPending returns empty when dir missing', async () => {
    // 目录不存在时应返回空数组,不抛异常
    const t2 = await mkdtemp(path.join(tmpdir(), 'forge-acklog-empty-'));
    try {
      const list = await listPending(t2);
      expect(list).toEqual([]);
    } finally {
      await rm(t2, { recursive: true, force: true });
    }
  });

  it('getPendingPath formats <findingId>-<isoTimestamp>.yaml with : replaced', () => {
    // 验证冒号被替换为连字符,Windows 文件系统安全
    const p = getPendingPath('/root', '7', '2026-05-12T14:30:00.000Z');
    expect(p.replace(/\\\\/g, '/')).toMatch(/pending-acks\/7-2026-05-12T14-30-00\.000Z\.yaml$/);
  });
});
