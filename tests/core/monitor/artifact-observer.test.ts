// tests/core/monitor/artifact-observer.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeArtifacts } from '../../../src/core/monitor/artifact-observer.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-obs-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const HASH_A = 'sha256:' + 'a'.repeat(64);
const HASH_B = 'sha256:' + 'b'.repeat(64);

/** 写一个合法的 verify marker 到 active change 目录 */
function writeVerifyMarker(changeId: string, taskHash: string = HASH_A): void {
  const dir = join(root, 'forge', 'changes', changeId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, '.verify-passed'),
    [
      'schema: forge-verify/v1',
      'verified_at: 2026-05-15T01:00:00Z', // marker-schema ISO 正则不接受毫秒
      'verified_by: ai-agent',
      `tasks_hash: ${taskHash}`,
      `content_hash: ${HASH_B}`,
      'evidence: []',
    ].join('\n') + '\n',
    'utf8',
  );
}

describe('observeArtifacts', () => {
  it('无 change 目录 → 空事件', () => {
    expect(observeArtifacts(root, '无此 change')).toEqual([]);
  });

  it('合法 verify marker → marker_observed,含 hashes 与 ok=true', () => {
    writeVerifyMarker('2026-05-15-x');
    const events = observeArtifacts(root, '2026-05-15-x');
    const m = events.find((e) => e.event === 'marker_observed');
    expect(m).toBeDefined();
    expect(m?.layer).toBe('cli');
    expect(m?.stage).toBe('verify');
    expect(m?.data.marker_schema).toBe('forge-verify/v1');
    expect(m?.data.ok).toBe(true);
    expect((m?.data.hashes as Record<string, unknown>).tasks_hash).toBe(HASH_A);
    expect(m?.ts).toBe('2026-05-15T01:00:00Z'); // 事件 ts = marker 的 verified_at,非观察时刻
  });

  it('hash 格式非法的 marker → marker_observed 但 ok=false', () => {
    writeVerifyMarker('2026-05-15-bad', '非法hash');
    const events = observeArtifacts(root, '2026-05-15-bad');
    const m = events.find((e) => e.event === 'marker_observed');
    expect(m?.data.ok).toBe(false);
  });

  it('marker YAML 损坏 → record_error,不抛', () => {
    const dir = join(root, 'forge', 'changes', '2026-05-15-y');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.verify-passed'), '{ this is: [unclosed\n', 'utf8');
    const events = observeArtifacts(root, '2026-05-15-y');
    expect(events.some((e) => e.event === 'record_error')).toBe(true);
  });

  it('archive 目录有 archive_summary.yaml → fence_observed(archive 阶段)', () => {
    // archive 目录名带 <YYYY-MM-DD>- 前缀(transaction.ts:56);changeId 仍是 2026-05-15-z
    const adir = join(root, 'forge', 'changes', 'archive', '2026-05-16-2026-05-15-z');
    mkdirSync(adir, { recursive: true });
    writeFileSync(
      join(adir, 'archive_summary.yaml'),
      [
        'schema: forge-archive-summary/v1',
        'version: 1.0.0',
        'archived_at: 2026-05-15T02:00:00Z',
        'change_id: 2026-05-15-z',
        'verify_passed: { verified_invariants: [] }',
        'review_passed: { reviewers: [ai-agent] }',
        'process_evidence_summary: { placeholder: true }',
        'handoff_to_backlog: []',
        'acked_warnings: []',
        'pending_suggestions: []',
      ].join('\n') + '\n',
      'utf8',
    );
    const events = observeArtifacts(root, '2026-05-15-z');
    const f = events.find((e) => e.event === 'fence_observed');
    expect(f).toBeDefined();
    expect(f?.stage).toBe('archive');
    expect(f?.data.ok).toBe(true);
  });

  it('review-passed marker → marker_observed,stage=review、ts=reviewed_at', () => {
    const dir = join(root, 'forge', 'changes', '2026-05-15-rv');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '.review-passed'),
      'schema: forge-review/v1\nreviewed_at: 2026-05-15T03:00:00Z\n',
      'utf8',
    );
    const events = observeArtifacts(root, '2026-05-15-rv');
    const m = events.find((e) => e.event === 'marker_observed');
    expect(m?.stage).toBe('review');
    expect(m?.ts).toBe('2026-05-15T03:00:00Z');
  });

  it('verify-failed marker → marker_observed,ts=failed_at', () => {
    const dir = join(root, 'forge', 'changes', '2026-05-15-fl');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '.verify-failed'),
      'schema: forge-verify-failed/v1\nfailed_at: 2026-05-15T04:00:00Z\n',
      'utf8',
    );
    const events = observeArtifacts(root, '2026-05-15-fl');
    const m = events.find((e) => e.event === 'marker_observed');
    expect(m?.ts).toBe('2026-05-15T04:00:00Z');
  });
});
