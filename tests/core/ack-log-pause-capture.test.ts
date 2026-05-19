// ack-log-pause-capture.test.ts — Task 7:PauseCaptureEntry 单元测试(TDD)
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendAckLog,
  readAllAckLogEntries,
  verifyAckLogChain,
  type PauseCaptureEntry,
} from '../../src/core/ack-log.js';
import { canonicalHash } from '../../src/core/canonical-json.js';

describe('ack-log PauseCaptureEntry', () => {
  it('appendAckLog 写 pause-capture entry → readAll 读回 + 链自洽', async () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-pc-acklog-'));
    try {
      const entry: PauseCaptureEntry = {
        schema: 'forge-ack-log/v1',
        kind: 'pause-capture',
        timestamp: '2026-05-12T14:25:00Z',
        capture_id: 'cap-uuid-1',
        change_id: 'c1',
        task_ref: 'tasks.md#task-3',
        pause_issue_summary: 'OAuth refresh',
        tasks_md_task_ids: ['task-1', 'task-2'],
        git_head: null,
        extra: {},
      };
      await appendAckLog(root, entry);
      const all = await readAllAckLogEntries(root);
      expect(all).toHaveLength(1);
      expect(all[0]!.kind).toBe('pause-capture');
      expect((all[0] as PauseCaptureEntry).capture_id).toBe('cap-uuid-1');
      // 链自洽:单条 entry,prev=null
      const chain = verifyAckLogChain(all, canonicalHash(all[0]!), 1);
      expect(chain.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
