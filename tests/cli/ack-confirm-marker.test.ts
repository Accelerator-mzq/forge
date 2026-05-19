// ack-confirm-marker.test.ts: Task A2/A3 TDD — ack confirm 写 marker ack 字段 + ack-log finding_hash
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { computeFindingHash, extractHashPayload } from '../../src/core/validate/finding-hash.js';
import type { Finding } from '../../src/core/schemas/severity.js';

// 跑 CLI:node dist/cli/index.js ack confirm ...(dist 由 pnpm build 产)
function runForge(cwd: string, args: string[]): { code: number; stderr: string } {
  try {
    execFileSync('node', [join(process.cwd(), 'dist/cli/index.js'), ...args], {
      cwd,
      encoding: 'utf8',
    });
    return { code: 0, stderr: '' };
  } catch (e: any) {
    return { code: e.status ?? 1, stderr: String(e.stderr ?? '') };
  }
}

describe('ack confirm 写 marker —— ack-warning', () => {
  let proj: string;
  let changeDir: string;

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'ackproj-'));
    changeDir = join(proj, 'forge', 'changes', 'add-x');
    mkdirSync(join(changeDir, '.evidence', 'pending-acks'), { recursive: true });

    // WARNING + resolved=false finding;finding_hash 用真实 computeFindingHash 生成
    // (archive fence 会重算比对,placeholder 会让后续集成测试 archive 失败)
    const finding: Record<string, unknown> = {
      id: 1,
      dimension: 'correctness',
      check_type: 'requirement-mapping',
      severity: 'WARNING',
      automated: false,
      content_hash: 'sha256:abc',
      git_head: 'd4e5f6',
      evidence: 'ev',
      recommendation: 'rec',
      resolved: false,
      severity_acked_by: null,
      severity_acked_at: null,
    };
    // 用真实 computeFindingHash 计算,ack-warning 不改 8 字段 payload,hash 前后一致
    finding.finding_hash = computeFindingHash(extractHashPayload(finding as unknown as Finding));

    writeFileSync(
      join(changeDir, '.verify-passed'),
      stringifyYaml({ schema: 'forge-verify/v1', verify_findings: [finding] }),
    );
  });

  it('confirm 后 marker 写入 severity_acked_by/at,ack-log entry finding_hash 非 null 且与 marker finding 一致', () => {
    // propose 阶段:AI 写 pending(预期 exit 1)
    expect(
      runForge(proj, ['ack', 'propose', 'add-x', '--finding', '1', '--action', 'ack-warning']).code,
    ).toBe(1);

    // confirm 阶段:User 确认
    const r = runForge(proj, ['ack', 'confirm', 'add-x', '1']);
    expect(r.code).toBe(0);

    // 验证 marker 写入:severity_acked_by/at 非空
    const marker = parseYaml(readFileSync(join(changeDir, '.verify-passed'), 'utf8')) as Record<
      string,
      unknown
    >;
    const findings = marker.verify_findings as Array<Record<string, unknown>>;
    expect(findings[0]!.severity_acked_by).toBeTruthy();
    expect(findings[0]!.severity_acked_at).toBeTruthy();

    // 验证 ack-log entry finding_hash 非 null 且与 marker finding 一致
    const log = readFileSync(join(changeDir, '.evidence', 'ack-log.jsonl'), 'utf8')
      .trim()
      .split('\n');
    const ackEntry = JSON.parse(log[log.length - 1]!) as Record<string, unknown>;
    expect(ackEntry.finding_hash).not.toBeNull();
    expect(ackEntry.user).toBe(findings[0]!.severity_acked_by);
    // finding_hash 应与 marker finding 中的值一致(ack-warning 不改 8 字段 payload)
    expect(ackEntry.finding_hash).toBe(findings[0]!.finding_hash);
  });
});

describe('ack confirm 写 marker —— ack-pause-warning', () => {
  let proj: string;
  let changeDir: string;

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'ackproj-pause-'));
    changeDir = join(proj, 'forge', 'changes', 'add-x');
    mkdirSync(join(changeDir, '.evidence', 'pending-acks'), { recursive: true });

    // 构造包含 pause_decisions 的 .verify-passed marker
    // PauseDecision: id=1, severity=WARNING, severity_acked_by/at=null
    const pauseDecision = {
      id: 1,
      paused_at: '2026-01-01T00:00:00.000Z',
      task_ref: 'tasks.md#task-1',
      issue_summary: 'test issue',
      severity: 'WARNING',
      severity_acked_by: null,
      severity_acked_at: null,
      chosen_option: 3,
      target_artifact: 'proposal.md',
      target_anchor: '## Out of Scope',
      non_blocking_rationale: 'out of scope',
      other_rationale: null,
      other_acked_by: null,
    };

    writeFileSync(
      join(changeDir, '.verify-passed'),
      stringifyYaml({
        schema: 'forge-verify/v1',
        pause_decisions: [pauseDecision],
      }),
    );

    // 构造包含相同 pause_decisions 的 .review-passed marker
    writeFileSync(
      join(changeDir, '.review-passed'),
      stringifyYaml({
        schema: 'forge-review/v1',
        pause_decisions: [pauseDecision],
      }),
    );
  });

  it('confirm 后两个 marker 的 pause_decisions[0].severity_acked_by/at 都被写入且同值,ack-log finding_id=pause_decisions:1, finding_hash=null', () => {
    // propose 阶段:AI 写 pending(预期 exit 1)
    expect(
      runForge(proj, [
        'ack',
        'propose',
        'add-x',
        '--finding',
        'pause_decisions:1',
        '--action',
        'ack-pause-warning',
      ]).code,
    ).toBe(1);

    // confirm 阶段:User 确认(findingId 为原始字面量 pause_decisions:1)
    const r = runForge(proj, ['ack', 'confirm', 'add-x', 'pause_decisions:1']);
    expect(r.code, `confirm 失败,stderr: ${r.stderr}`).toBe(0);

    // 验证 .verify-passed marker:pause_decisions[0].severity_acked_by/at 非空
    const verifyMarker = parseYaml(
      readFileSync(join(changeDir, '.verify-passed'), 'utf8'),
    ) as Record<string, unknown>;
    const verifyPds = verifyMarker.pause_decisions as Array<Record<string, unknown>>;
    expect(verifyPds[0]!.severity_acked_by, '.verify-passed severity_acked_by 应非空').toBeTruthy();
    expect(verifyPds[0]!.severity_acked_at, '.verify-passed severity_acked_at 应非空').toBeTruthy();

    // 验证 .review-passed marker:pause_decisions[0].severity_acked_by/at 非空
    const reviewMarker = parseYaml(
      readFileSync(join(changeDir, '.review-passed'), 'utf8'),
    ) as Record<string, unknown>;
    const reviewPds = reviewMarker.pause_decisions as Array<Record<string, unknown>>;
    expect(reviewPds[0]!.severity_acked_by, '.review-passed severity_acked_by 应非空').toBeTruthy();
    expect(reviewPds[0]!.severity_acked_at, '.review-passed severity_acked_at 应非空').toBeTruthy();

    // 验证两个 marker 写入的 ack 值完全相同
    expect(verifyPds[0]!.severity_acked_by).toBe(reviewPds[0]!.severity_acked_by);
    expect(verifyPds[0]!.severity_acked_at).toBe(reviewPds[0]!.severity_acked_at);

    // 验证 ack-log entry:finding_id === 'pause_decisions:1',finding_hash === null
    const log = readFileSync(join(changeDir, '.evidence', 'ack-log.jsonl'), 'utf8')
      .trim()
      .split('\n');
    const ackEntry = JSON.parse(log[log.length - 1]!) as Record<string, unknown>;
    expect(ackEntry.finding_id).toBe('pause_decisions:1');
    expect(ackEntry.finding_hash).toBeNull();
  });
});
