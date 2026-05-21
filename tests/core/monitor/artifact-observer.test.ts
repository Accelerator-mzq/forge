// tests/core/monitor/artifact-observer.test.ts
// v4 简版(plan-v4 Phase 4 Task 4.5b):
// - 删 ack-log / verify-failed / review-failed / verify_findings / fence_observed 相关 case
// - marker 极简(VerifyMarker v2 / ReviewMarker v2,无 tasks_hash/content_hash/finding 字段)
// - archive_summary fence_observed → archive_summary_observed(无 fence 拒签语义,纯 audit)
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

/** 写一个合法的 v4 verify marker 到 active change 目录 */
function writeVerifyMarker(changeId: string): void {
  const dir = join(root, 'forge', 'changes', changeId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, '.verify-passed'),
    [
      'schema: forge-verify/v2',
      'verified_at: 2026-05-15T01:00:00Z',
      'verified_by: ai-agent',
    ].join('\n') + '\n',
    'utf8',
  );
}

describe('observeArtifacts (v4)', () => {
  it('无 change 目录 → 空事件', () => {
    expect(observeArtifacts(root, '无此 change')).toEqual([]);
  });

  it('合法 v4 verify marker → marker_observed,ok=true,ts=verified_at', () => {
    writeVerifyMarker('2026-05-15-x');
    const events = observeArtifacts(root, '2026-05-15-x');
    const m = events.find((e) => e.event === 'marker_observed');
    expect(m).toBeDefined();
    expect(m?.layer).toBe('cli');
    expect(m?.stage).toBe('verify');
    expect(m?.data.marker_schema).toBe('forge-verify/v2');
    expect(m?.data.ok).toBe(true);
    expect(m?.ts).toBe('2026-05-15T01:00:00Z'); // 事件 ts = marker 的 verified_at,非观察时刻
  });

  it('marker YAML 损坏 → record_error,不抛', () => {
    const dir = join(root, 'forge', 'changes', '2026-05-15-y');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.verify-passed'), '{ this is: [unclosed\n', 'utf8');
    const events = observeArtifacts(root, '2026-05-15-y');
    expect(events.some((e) => e.event === 'record_error')).toBe(true);
  });

  it('v4 review-passed marker → marker_observed,stage=review、ts=reviewed_at', () => {
    const dir = join(root, 'forge', 'changes', '2026-05-15-rv');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '.review-passed'),
      'schema: forge-review/v2\nreviewed_at: 2026-05-15T03:00:00Z\nreviewed_by: ai-agent\n',
      'utf8',
    );
    const events = observeArtifacts(root, '2026-05-15-rv');
    const m = events.find((e) => e.event === 'marker_observed');
    expect(m?.stage).toBe('review');
    expect(m?.data.marker_schema).toBe('forge-review/v2');
    expect(m?.ts).toBe('2026-05-15T03:00:00Z');
  });

  it('archive 目录有 v4 archive_summary.yaml → archive_summary_observed', () => {
    // archive 目录名带 <YYYY-MM-DD>- 前缀;changeId 仍是 2026-05-15-z
    const adir = join(root, 'forge', 'changes', 'archive', '2026-05-16-2026-05-15-z');
    mkdirSync(adir, { recursive: true });
    writeFileSync(
      join(adir, 'archive_summary.yaml'),
      [
        'schema: forge-archive-summary/v2',
        'version: 2.0.0',
        'archived_at: 2026-05-15T02:00:00Z',
        'change_id: 2026-05-15-z',
        'archive_name: 2026-05-16-2026-05-15-z',
        'verified_by: ai-agent',
        'reviewed_by: ai-agent',
        'spec_updates_applied: []',
        'handoff_to_backlog: []',
      ].join('\n') + '\n',
      'utf8',
    );
    const events = observeArtifacts(root, '2026-05-15-z');
    const f = events.find((e) => e.event === 'archive_summary_observed');
    expect(f).toBeDefined();
    expect(f?.stage).toBe('archive');
    expect(f?.data.ok).toBe(true);
    expect(f?.data.verified_by).toBe('ai-agent');
    expect(f?.data.reviewed_by).toBe('ai-agent');
    expect(f?.data.spec_updates_applied_count).toBe(0);
    expect(f?.data.handoff_to_backlog_count).toBe(0);
    expect(f?.ts).toBe('2026-05-15T02:00:00Z');
  });

  it('archive_summary 含 spec_updates + handoff → 计数正确', () => {
    const adir = join(root, 'forge', 'changes', 'archive', '2026-05-16-multi');
    mkdirSync(adir, { recursive: true });
    writeFileSync(
      join(adir, 'archive_summary.yaml'),
      [
        'schema: forge-archive-summary/v2',
        'version: 2.0.0',
        'archived_at: 2026-05-15T05:00:00Z',
        'change_id: multi',
        'archive_name: 2026-05-16-multi',
        'verified_by: ai-agent',
        'reviewed_by: msc',
        'spec_updates_applied:',
        '  - { capability: auth, operation: replace }',
        '  - { capability: api, operation: create }',
        'handoff_to_backlog:',
        '  - { source: pause_decisions, id: 0, chosen_option: 3, issue_summary: defer X }',
      ].join('\n') + '\n',
      'utf8',
    );
    const events = observeArtifacts(root, 'multi');
    const f = events.find((e) => e.event === 'archive_summary_observed');
    expect(f?.data.spec_updates_applied_count).toBe(2);
    expect(f?.data.handoff_to_backlog_count).toBe(1);
  });
});
