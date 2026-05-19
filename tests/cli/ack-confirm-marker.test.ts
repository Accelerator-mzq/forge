// ack-confirm-marker.test.ts: Task A2 TDD — ack confirm 写 marker ack 字段 + ack-log finding_hash
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
