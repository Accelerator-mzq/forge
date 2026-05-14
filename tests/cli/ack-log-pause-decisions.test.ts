// ack-log-pause-decisions.test.ts — plan-9c Task 2 Step 3.5(v2 codex BLOCKER 1 新增)
// 沿 9d ack-log-consistency.test.ts 模式

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAckLogConsistency } from '../../src/core/archive/ack-log-consistency.js';

const basePause = {
  id: 1,
  paused_at: '2026-05-12T14:30:00Z',
  task_ref: 'tasks.md#task-3',
  issue_summary: 'test issue',
  severity: 'WARNING',
  severity_acked_by: 'msc',
  severity_acked_at: '2026-05-12T14:32:00Z',
  chosen_option: 3,
  target_artifact: 'proposal.md',
  target_anchor: '## Out of Scope',
  non_blocking_rationale: 'test rationale',
  other_rationale: null,
  other_acked_by: null,
};

describe('validateAckLogConsistency — pause_decisions extension (v2 BLOCKER 1)', () => {
  let changeDir: string;
  let evidenceDir: string;

  beforeEach(() => {
    changeDir = mkdtempSync(join(tmpdir(), 'forge-ack-pause-'));
    evidenceDir = join(changeDir, '.evidence');
    mkdirSync(evidenceDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(changeDir, { recursive: true, force: true });
  });

  it('marker 缺 pause_decisions + verify_findings → 通过', async () => {
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), '');
    const result = await validateAckLogConsistency(changeDir, {}, 'test-change');
    expect(result.valid).toBe(true);
  });

  it('WARNING pause_decision + ack-log 有匹配 ack-pause-warning 条目 → 通过', async () => {
    const ackLine = JSON.stringify({
      schema: 'forge-ack-log/v1',
      kind: 'ack',
      timestamp: '2026-05-12T14:32:00Z',
      action: 'ack-pause-warning',
      change_id: 'test-change',
      finding_id: 'pause_decisions:1',
      user: 'msc',
      rationale: 'pause ack',
      git_head: null,
      finding_hash: null,
    });
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), ackLine + '\n');
    const result = await validateAckLogConsistency(
      changeDir,
      { pause_decisions: [basePause] },
      'test-change',
    );
    expect(result.valid).toBe(true);
  });

  it('WARNING pause_decision + ack-log 无对应条目 → 拒签', async () => {
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), '');
    const result = await validateAckLogConsistency(
      changeDir,
      { pause_decisions: [basePause] },
      'test-change',
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toBe('pause_decisions[0].severity_acked_by');
    expect(result.errors[0]?.message).toMatch(/ack-pause-warning.*finding_id=pause_decisions:1/);
  });

  it('WARNING pause_decision + ack-log user 与 marker 不一致 → 拒签', async () => {
    const ackLine = JSON.stringify({
      schema: 'forge-ack-log/v1',
      kind: 'ack',
      timestamp: '2026-05-12T14:32:00Z',
      action: 'ack-pause-warning',
      change_id: 'test-change',
      finding_id: 'pause_decisions:1',
      user: 'ai-agent', // ← 不匹配 marker.severity_acked_by='msc'
      rationale: 'pause ack',
      git_head: null,
      finding_hash: null,
    });
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), ackLine + '\n');
    const result = await validateAckLogConsistency(
      changeDir,
      { pause_decisions: [basePause] },
      'test-change',
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/ack 主体不匹配/);
  });

  it('SUGGESTION pause_decision + ack-log 空 → 通过(SUGGESTION 不要求 ack 一致性)', async () => {
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), '');
    const result = await validateAckLogConsistency(
      changeDir,
      {
        pause_decisions: [
          {
            ...basePause,
            severity: 'SUGGESTION',
            severity_acked_by: null,
            severity_acked_at: null,
          },
        ],
      },
      'test-change',
    );
    expect(result.valid).toBe(true);
  });

  it('WARNING pause_decision + ack 字段全空(未 ack) → 通过(由 Task 2 fence 单独拦截 acked 缺失,不在本 cross-check 范围)', async () => {
    writeFileSync(join(evidenceDir, 'ack-log.jsonl'), '');
    const result = await validateAckLogConsistency(
      changeDir,
      {
        pause_decisions: [{ ...basePause, severity_acked_by: null, severity_acked_at: null }],
      },
      'test-change',
    );
    expect(result.valid).toBe(true); // ack-log cross-check 仅当 ack 字段非空时跑;空 ack 由 Task 2 fence WARNING 强校验拦
  });
});
