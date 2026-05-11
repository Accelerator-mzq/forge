// tests/core/archive/ack-log-consistency.test.ts — plan-9d Task 6 v2 B-4
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateAckLogConsistency } from '../../../src/core/archive/ack-log-consistency.js';
import { computeFindingHash } from '../../../src/core/validate/finding-hash.js';

describe('ack-log consistency (plan-9d Task 6 v2 B-4)', () => {
  let changeDir: string;

  beforeEach(async () => {
    changeDir = join(
      tmpdir(),
      `forge-9d-ack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    await mkdir(join(changeDir, '.evidence'), { recursive: true });
  });

  afterEach(async () => {
    await rm(changeDir, { recursive: true, force: true });
  });

  function buildFinding(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
    const base = {
      id: 1,
      dimension: 'correctness' as const,
      check_type: 'requirement-mapping',
      severity: 'WARNING' as const,
      automated: false,
      content_hash: 'sha256:' + 'a'.repeat(64),
      git_head: 'd'.repeat(40),
      evidence: 'x',
      recommendation: 'y',
      resolved: false,
    };
    const merged = { ...base, ...overrides };
    return {
      ...merged,
      finding_hash: computeFindingHash({
        content_hash: merged.content_hash,
        git_head: merged.git_head,
        dimension: merged.dimension,
        check_type: merged.check_type,
        severity: merged.severity,
        automated: merged.automated,
        evidence: merged.evidence,
        recommendation: merged.recommendation,
      }),
    };
  }

  it('marker 无 verify_findings 字段(老 marker)→ 通过', async () => {
    const result = await validateAckLogConsistency(changeDir, {}, 'test-change');
    expect(result.valid).toBe(true);
  });

  it('marker WARNING ack 字段非空 + ack-log.jsonl 无匹配条目 → 拒签', async () => {
    const finding = buildFinding({ severity: 'WARNING', severity_acked_by: 'msc' });
    const marker = { verify_findings: [finding] };
    // 不写 ack-log → 无条目
    const result = await validateAckLogConsistency(changeDir, marker, 'test-change');
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/ack-log.*无对应/);
  });

  it('marker WARNING ack + ack-log 有匹配条目(finding_hash + user 都一致)→ 通过', async () => {
    const finding = buildFinding({ severity: 'WARNING', severity_acked_by: 'msc' });
    await writeFile(
      join(changeDir, '.evidence', 'ack-log.jsonl'),
      JSON.stringify({
        schema: 'forge-ack-log/v1',
        kind: 'ack',
        timestamp: '2026-05-12T10:00:00Z',
        action: 'ack-warning',
        change_id: 'test-change',
        finding_id: String(finding.id),
        user: 'msc',
        rationale: 'edge case',
        git_head: 'd'.repeat(40),
        finding_hash: finding.finding_hash,
      }) + '\n',
    );
    const result = await validateAckLogConsistency(
      changeDir,
      { verify_findings: [finding] },
      'test-change',
    );
    expect(result.valid).toBe(true);
  });

  it('ack-log finding_hash 与 marker 重算不一致(payload 篡改)→ 拒签', async () => {
    const finding = buildFinding({ severity: 'WARNING', severity_acked_by: 'msc' });
    await writeFile(
      join(changeDir, '.evidence', 'ack-log.jsonl'),
      JSON.stringify({
        schema: 'forge-ack-log/v1',
        kind: 'ack',
        timestamp: '2026-05-12T10:00:00Z',
        action: 'ack-warning',
        change_id: 'test-change',
        finding_id: String(finding.id),
        user: 'msc',
        rationale: 'edge case',
        git_head: 'd'.repeat(40),
        finding_hash: 'f'.repeat(64), // 篡改 hash
      }) + '\n',
    );
    const result = await validateAckLogConsistency(
      changeDir,
      { verify_findings: [finding] },
      'test-change',
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /finding_hash.*不一致/.test(e.message))).toBe(true);
  });

  it('ack-log user 与 marker severity_acked_by 不一致 → 拒签(v3 m-1)', async () => {
    const finding = buildFinding({ severity: 'WARNING', severity_acked_by: 'msc' });
    await writeFile(
      join(changeDir, '.evidence', 'ack-log.jsonl'),
      JSON.stringify({
        schema: 'forge-ack-log/v1',
        kind: 'ack',
        timestamp: '2026-05-12T10:00:00Z',
        action: 'ack-warning',
        change_id: 'test-change',
        finding_id: String(finding.id),
        user: 'ai-agent', // 与 marker 'msc' 不一致
        rationale: 'edge case',
        git_head: 'd'.repeat(40),
        finding_hash: finding.finding_hash,
      }) + '\n',
    );
    const result = await validateAckLogConsistency(
      changeDir,
      { verify_findings: [finding] },
      'test-change',
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /user.*不一致/.test(e.message))).toBe(true);
  });

  it('pending-acks/ 残留 → 拒签 + 列文件名', async () => {
    await mkdir(join(changeDir, '.evidence', 'pending-acks'), { recursive: true });
    await writeFile(
      join(changeDir, '.evidence', 'pending-acks', 'finding-1-20260512.yaml'),
      'pending content',
    );
    const result = await validateAckLogConsistency(
      changeDir,
      { verify_findings: [] },
      'test-change',
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/pending-acks.*残留/);
    expect(result.errors[0]?.message).toContain('finding-1-20260512.yaml');
  });

  it('downgrade ack 字段非空 + ack-log 无 action=downgrade 条目 → 拒签', async () => {
    const finding = buildFinding({
      severity: 'SUGGESTION',
      downgraded_from: 'WARNING',
      downgrade_acked_by: 'msc',
      downgrade_rationale: 'edge',
    });
    // ack-log 缺 action=downgrade 行
    const result = await validateAckLogConsistency(
      changeDir,
      { verify_findings: [finding] },
      'test-change',
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/action=downgrade/);
  });
});
