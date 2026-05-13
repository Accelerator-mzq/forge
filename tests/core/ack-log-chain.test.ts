// tests/core/ack-log-chain.test.ts — plan-9g Task 3.1
// 测 ack-log 全 JSONL 链 + appendAckLog 算链 + verifyAckLogChain 三重校验
// 沿 brainstorm spec §8.2 测试矩阵 7 case

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendAckLog,
  readAllAckLogEntries,
  verifyAckLogChain,
} from '../../src/core/ack-log.js';
import type { EvidenceHelperEntry } from '../../src/core/ack-log.js';
import { canonicalHash } from '../../src/core/canonical-json.js';

// 构造测试用 EvidenceHelperEntry(不含 prev_entry_hash,由 appendAckLog 填)
function mkHelperEntry(seq: number): EvidenceHelperEntry {
  return {
    schema: 'forge-ack-log/v1',
    kind: 'evidence-helper',
    timestamp: `2026-05-13T0${seq}:00:00Z`,
    helper_name: 'record-tdd',
    change_id: 'test-change',
    task_ref: `tasks.md#task-${seq}`,
    payload_hash: `sha256placeholder${seq.toString().padStart(60, '0')}`,
    status: 'success',
    git_head: null,
    extra: { seq },
  };
}

describe('ack-log chain (plan-9g Task 3.1)', () => {
  let changeRoot: string;

  beforeEach(async () => {
    changeRoot = await mkdtemp(join(tmpdir(), 'forge-acklog-chain-'));
    await mkdir(join(changeRoot, '.evidence'), { recursive: true });
  });

  it('Case 1: 空 ack-log → readAllAckLogEntries 返 [];verifyAckLogChain 通过', async () => {
    const entries = await readAllAckLogEntries(changeRoot);
    expect(entries).toEqual([]);
    const result = verifyAckLogChain(entries, null, null);
    expect(result.ok).toBe(true);
  });

  it('Case 2: appendAckLog 第一条 prev_entry_hash=null,第二条指上一条 hash', async () => {
    await appendAckLog(changeRoot, mkHelperEntry(1));
    await appendAckLog(changeRoot, mkHelperEntry(2));
    const entries = await readAllAckLogEntries(changeRoot);
    expect(entries).toHaveLength(2);
    // noUncheckedIndexedAccess guard
    const entry0 = entries[0]!;
    const entry1 = entries[1]!;
    expect(entry0.prev_entry_hash).toBeNull();
    // 第二条 prev 应等于第一条 canonicalHash(已含 prev_entry_hash=null 的完整 entry)
    expect(entry1.prev_entry_hash).toBe(canonicalHash(entry0));
  });

  it('Case 3: verifyAckLogChain 链内自洽通过 + 完整 marker 固化通过', async () => {
    await appendAckLog(changeRoot, mkHelperEntry(1));
    await appendAckLog(changeRoot, mkHelperEntry(2));
    await appendAckLog(changeRoot, mkHelperEntry(3));
    const entries = await readAllAckLogEntries(changeRoot);
    const tailEntry = entries[2]!;
    const tailHash = canonicalHash(tailEntry);
    const result = verifyAckLogChain(entries, tailHash, 3);
    expect(result.ok).toBe(true);
  });

  it('Case 4: 链断检测 — 中间一行被改 → chain broken', async () => {
    await appendAckLog(changeRoot, mkHelperEntry(1));
    await appendAckLog(changeRoot, mkHelperEntry(2));
    await appendAckLog(changeRoot, mkHelperEntry(3));
    // 篡改中间行内容(但 prev_entry_hash 不变)— 后续行的 prev 不再 match
    const entries = await readAllAckLogEntries(changeRoot);
    const entry2 = entries[2]!;
    const tailHash = canonicalHash(entry2);
    // 修改 entries[1] 的 extra(模拟内容篡改,但不改 prev_entry_hash)
    const tamperedEntries = entries.map((e, i) =>
      i === 1 ? { ...e, extra: { tampered: true } } : e,
    );
    const result = verifyAckLogChain(tamperedEntries, tailHash, 3);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('chain broken');
  });

  it('Case 5: 行数 mismatch — 实际 2 行但 marker 固化 4 行 → entry count mismatch', async () => {
    await appendAckLog(changeRoot, mkHelperEntry(1));
    await appendAckLog(changeRoot, mkHelperEntry(2));
    const entries = await readAllAckLogEntries(changeRoot);
    const entry1 = entries[1]!;
    const tailHash = canonicalHash(entry1);
    const result = verifyAckLogChain(entries, tailHash, 4); // 假装 marker 写 4 行
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('entry count mismatch');
  });

  it('Case 6: tail hash mismatch — 改最后一行无下一行引用 → tail mismatch', async () => {
    await appendAckLog(changeRoot, mkHelperEntry(1));
    await appendAckLog(changeRoot, mkHelperEntry(2));
    const entries = await readAllAckLogEntries(changeRoot);
    // 固化原 tail hash
    const origTailHash = canonicalHash(entries[1]!);
    // 篡改最后一行(实际尾 hash 变)但 marker 固化的是原 tail
    const tamperedEntries = [
      entries[0]!,
      { ...entries[1]!, extra: { tampered: true } },
    ];
    const result = verifyAckLogChain(tamperedEntries, origTailHash, 2);
    expect(result.ok).toBe(false);
    // 此 case 测 tail hash 检测:中间篡改也触发链断(两种都可)
    expect(
      result.reason?.includes('chain broken') || result.reason?.includes('tail hash mismatch'),
    ).toBe(true);
  });

  it('Case 7: 坏 JSON 行 → readAllAckLogEntries 抛 corrupted error', async () => {
    const logPath = join(changeRoot, '.evidence', 'ack-log.jsonl');
    await writeFile(
      logPath,
      '{"schema":"forge-ack-log/v1","kind":"evidence-helper","timestamp":"2026-01-01T00:00:00Z"}\nINVALID-JSON\n',
      'utf8',
    );
    await expect(readAllAckLogEntries(changeRoot)).rejects.toThrow(/corrupted at line 2/);
  });
});
