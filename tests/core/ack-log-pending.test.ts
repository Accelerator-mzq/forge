// ack-log-pending.test.ts:测试 pending 文件名 namespace 编码功能
// 覆盖 pause_decisions:<id> 形态的 finding id(含 ':',Windows 非法字符)

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPendingPath, listPending } from '../../src/core/ack-log.js';

describe('ack-log pending 文件名 namespace 编码', () => {
  const TS = '2026-05-19T10:30:00.000Z';
  const SAFE = '2026-05-19T10-30-00.000Z';

  it('纯数字 findingId:文件名不变(向后兼容)', () => {
    const p = getPendingPath('/r', '5', TS);
    expect(p.endsWith(`/.evidence/pending-acks/5-${SAFE}.yaml`)).toBe(true);
  });

  it('pause_decisions:<id> findingId:冒号被 encodeURIComponent 编码', () => {
    const p = getPendingPath('/r', 'pause_decisions:1', TS);
    expect(p.endsWith(`/pending-acks/pause_decisions%3A1-${SAFE}.yaml`)).toBe(true);
    expect(p.includes(':1-')).toBe(false); // 原始冒号不出现在文件名
  });

  it('listPending:编码文件名解码还原原始 findingId', async () => {
    const root = mkdtempSync(join(tmpdir(), 'acklog-'));
    const dir = join(root, '.evidence', 'pending-acks');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `pause_decisions%3A2-${SAFE}.yaml`), 'kind: ack-propose\n');
    writeFileSync(join(dir, `7-${SAFE}.yaml`), 'kind: ack-propose\n');
    const all = await listPending(root);
    expect(all.map((x) => x.findingId).sort()).toEqual(['7', 'pause_decisions:2']);
    const filtered = await listPending(root, 'pause_decisions:2');
    expect(filtered).toHaveLength(1);
  });
});
