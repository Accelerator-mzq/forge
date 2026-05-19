// ack-confirm-marker.test.ts: Task A2/A3 TDD — ack confirm 写 marker ack 字段 + ack-log finding_hash
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

describe('ack confirm 写 marker —— downgrade', () => {
  let proj: string;
  let changeDir: string;

  // 构造一个指定 severity 的 fixture finding,并返回带真实 finding_hash 的对象
  function makeFinding(severity: 'WARNING' | 'CRITICAL' | 'SUGGESTION'): Record<string, unknown> {
    const f: Record<string, unknown> = {
      id: 1,
      dimension: 'correctness',
      check_type: 'requirement-mapping',
      severity,
      automated: false,
      content_hash: 'sha256:abc',
      git_head: 'd4e5f6',
      evidence: 'ev',
      recommendation: 'rec',
      resolved: false,
      severity_acked_by: null,
      severity_acked_at: null,
    };
    // 用真实 computeFindingHash 计算初始 hash(severity 取当前值)
    f.finding_hash = computeFindingHash(extractHashPayload(f as unknown as Finding));
    return f;
  }

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'ackproj-downgrade-'));
    changeDir = join(proj, 'forge', 'changes', 'add-x');
    mkdirSync(join(changeDir, '.evidence', 'pending-acks'), { recursive: true });
  });

  it('(a) WARNING finding downgrade → marker severity 改 SUGGESTION,写 downgrade_acked_by/rationale/downgraded_from=WARNING,finding_hash 重算,ack-log finding_hash == 重算值', () => {
    // 准备 WARNING finding 的 .verify-passed marker
    const finding = makeFinding('WARNING');
    writeFileSync(
      join(changeDir, '.verify-passed'),
      stringifyYaml({ schema: 'forge-verify/v1', verify_findings: [finding] }),
    );

    // propose 阶段(AI 提议 downgrade,action=downgrade,提供 rationale)
    expect(
      runForge(proj, [
        'ack',
        'propose',
        'add-x',
        '--finding',
        '1',
        '--action',
        'downgrade',
        '--rationale',
        'test rationale',
      ]).code,
    ).toBe(1);

    // confirm 阶段:User 确认
    const r = runForge(proj, ['ack', 'confirm', 'add-x', '1']);
    expect(r.code, `confirm 失败,stderr: ${r.stderr}`).toBe(0);

    // 验证 marker:severity 改为 SUGGESTION
    const marker = parseYaml(readFileSync(join(changeDir, '.verify-passed'), 'utf8')) as Record<
      string,
      unknown
    >;
    const findings = marker.verify_findings as Array<Record<string, unknown>>;
    const f = findings[0]!;

    expect(f.severity).toBe('SUGGESTION');
    expect(f.downgraded_from).toBe('WARNING');
    expect(f.downgrade_acked_by).toBeTruthy();
    expect(f.downgrade_rationale).toBe('test rationale');

    // 重算预期 hash:severity 已是 SUGGESTION
    const expectedHash = computeFindingHash(extractHashPayload(f as unknown as Finding));
    expect(f.finding_hash).toBe(expectedHash);

    // 验证 ack-log entry finding_hash == 重算值(SUGGESTION payload)
    const log = readFileSync(join(changeDir, '.evidence', 'ack-log.jsonl'), 'utf8')
      .trim()
      .split('\n');
    const ackEntry = JSON.parse(log[log.length - 1]!) as Record<string, unknown>;
    expect(ackEntry.finding_hash).not.toBeNull();
    expect(ackEntry.finding_hash).toBe(expectedHash);
  });

  it('(b) CRITICAL finding downgrade → confirm exit 2,marker 不变,ack-log 不写', () => {
    const finding = makeFinding('CRITICAL');
    const originalHash = finding.finding_hash as string;
    writeFileSync(
      join(changeDir, '.verify-passed'),
      stringifyYaml({ schema: 'forge-verify/v1', verify_findings: [finding] }),
    );

    // propose 阶段(AI 提议)
    expect(
      runForge(proj, [
        'ack',
        'propose',
        'add-x',
        '--finding',
        '1',
        '--action',
        'downgrade',
        '--rationale',
        'test rationale',
      ]).code,
    ).toBe(1);

    // confirm 阶段:应 exit 2(CRITICAL 不允许 downgrade)
    const r = runForge(proj, ['ack', 'confirm', 'add-x', '1']);
    expect(r.code, `confirm 应 exit 2,但返回 ${r.code},stderr: ${r.stderr}`).toBe(2);

    // marker 不变:severity 仍为 CRITICAL,finding_hash 不变
    const marker = parseYaml(readFileSync(join(changeDir, '.verify-passed'), 'utf8')) as Record<
      string,
      unknown
    >;
    const findings = marker.verify_findings as Array<Record<string, unknown>>;
    expect(findings[0]!.severity).toBe('CRITICAL');
    expect(findings[0]!.finding_hash).toBe(originalHash);
    expect(findings[0]!.downgraded_from).toBeUndefined();

    // ack-log 不存在或无新条目
    const ackLogPath = join(changeDir, '.evidence', 'ack-log.jsonl');
    const logExists = (() => {
      try {
        readFileSync(ackLogPath, 'utf8');
        return true;
      } catch {
        return false;
      }
    })();
    expect(logExists, 'ack-log.jsonl 不应被写入').toBe(false);
  });

  it('(c) SUGGESTION finding downgrade → confirm exit 2,marker 不变,ack-log 不写', () => {
    const finding = makeFinding('SUGGESTION');
    const originalHash = finding.finding_hash as string;
    writeFileSync(
      join(changeDir, '.verify-passed'),
      stringifyYaml({ schema: 'forge-verify/v1', verify_findings: [finding] }),
    );

    // propose 阶段(AI 提议)
    expect(
      runForge(proj, [
        'ack',
        'propose',
        'add-x',
        '--finding',
        '1',
        '--action',
        'downgrade',
        '--rationale',
        'test rationale',
      ]).code,
    ).toBe(1);

    // confirm 阶段:应 exit 2(SUGGESTION 不需 downgrade)
    const r = runForge(proj, ['ack', 'confirm', 'add-x', '1']);
    expect(r.code, `confirm 应 exit 2,但返回 ${r.code},stderr: ${r.stderr}`).toBe(2);

    // marker 不变:severity 仍为 SUGGESTION,finding_hash 不变
    const marker = parseYaml(readFileSync(join(changeDir, '.verify-passed'), 'utf8')) as Record<
      string,
      unknown
    >;
    const findings = marker.verify_findings as Array<Record<string, unknown>>;
    expect(findings[0]!.severity).toBe('SUGGESTION');
    expect(findings[0]!.finding_hash).toBe(originalHash);
    expect(findings[0]!.downgraded_from).toBeUndefined();

    // ack-log 不存在或无新条目
    const ackLogPath = join(changeDir, '.evidence', 'ack-log.jsonl');
    const logExists = (() => {
      try {
        readFileSync(ackLogPath, 'utf8');
        return true;
      } catch {
        return false;
      }
    })();
    expect(logExists, 'ack-log.jsonl 不应被写入').toBe(false);
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

describe('ack confirm 事务 —— rollback + 幂等', () => {
  let proj: string;
  let changeDir: string;

  // 构造标准 ack-warning fixture
  function buildWarningFixture(): void {
    mkdirSync(join(changeDir, '.evidence', 'pending-acks'), { recursive: true });
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
    finding.finding_hash = computeFindingHash(extractHashPayload(finding as unknown as Finding));
    writeFileSync(
      join(changeDir, '.verify-passed'),
      stringifyYaml({ schema: 'forge-verify/v1', verify_findings: [finding] }),
    );
  }

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'ackproj-txn-'));
    changeDir = join(proj, 'forge', 'changes', 'add-x');
  });

  it('(a) rollback: ack-log 路径是目录时, marker 从 .bak 恢复, pending 未删, confirm exit 非 0', () => {
    buildWarningFixture();

    // propose 阶段(AI 写 pending,exit 1)
    expect(
      runForge(proj, ['ack', 'propose', 'add-x', '--finding', '1', '--action', 'ack-warning']).code,
    ).toBe(1);

    // 把 ack-log.jsonl 路径创建为目录 → readAllAckLogEntries/appendAckLog 读/写时 EISDIR
    const evidenceDir = join(changeDir, '.evidence');
    const ackLogPath = join(evidenceDir, 'ack-log.jsonl');
    mkdirSync(ackLogPath, { recursive: true }); // 目录名就是 ack-log.jsonl

    // confirm 应 exit 非 0(rollback 触发)
    const r = runForge(proj, ['ack', 'confirm', 'add-x', '1']);
    expect(r.code, `confirm 应 exit 非 0,但返回 ${r.code},stderr: ${r.stderr}`).not.toBe(0);

    // marker 应从 .bak 恢复:severity_acked_by 回到 null
    const marker = parseYaml(
      readFileSync(join(changeDir, '.verify-passed'), 'utf8'),
    ) as Record<string, unknown>;
    const findings = marker.verify_findings as Array<Record<string, unknown>>;
    expect(
      findings[0]!.severity_acked_by,
      'rollback 后 severity_acked_by 应为 null(已从 .bak 恢复)',
    ).toBeNull();

    // pending 文件未被删除(confirm 失败保留 pending 供 retry)
    const pendingDir = join(changeDir, '.evidence', 'pending-acks');
    const pendingFiles = (() => {
      try {
        const { readdirSync } = require('node:fs') as typeof import('node:fs');
        return readdirSync(pendingDir).filter((f: string) => f.endsWith('.yaml'));
      } catch {
        return [];
      }
    })();
    expect(pendingFiles.length, 'rollback 后 pending 文件应保留').toBeGreaterThan(0);
  });

  it('(b) 幂等: 同一 finding 二次 confirm 后 ack-log 不出现重复 ack entry', () => {
    buildWarningFixture();

    // 第一次 propose + confirm(应成功)
    expect(
      runForge(proj, ['ack', 'propose', 'add-x', '--finding', '1', '--action', 'ack-warning']).code,
    ).toBe(1);
    const r1 = runForge(proj, ['ack', 'confirm', 'add-x', '1']);
    expect(r1.code, `第一次 confirm 应成功,stderr: ${r1.stderr}`).toBe(0);

    // 第二次 propose 同 finding+action
    expect(
      runForge(proj, ['ack', 'propose', 'add-x', '--finding', '1', '--action', 'ack-warning']).code,
    ).toBe(1);

    // 第二次 confirm
    const r2 = runForge(proj, ['ack', 'confirm', 'add-x', '1']);
    expect(r2.code, `第二次 confirm 应成功(幂等),stderr: ${r2.stderr}`).toBe(0);

    // 读 ack-log,断言 kind=ack 的 entry 中没有完全相同的 (change_id, finding_id, action, user, finding_hash)
    const ackLogPath = join(changeDir, '.evidence', 'ack-log.jsonl');
    expect(existsSync(ackLogPath), 'ack-log.jsonl 应存在').toBe(true);
    const lines = readFileSync(ackLogPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    const ackEntries = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((e) => e['kind'] === 'ack');

    // 构造去重 key,确认无重复
    const keys = ackEntries.map(
      (e) =>
        `${String(e['change_id'])}|${String(e['finding_id'])}|${String(e['action'])}|${String(e['user'])}|${String(e['finding_hash'])}`,
    );
    const uniqueKeys = new Set(keys);
    expect(
      uniqueKeys.size,
      `ack-log 中存在重复 ack entry(keys: ${keys.join(', ')})`,
    ).toBe(keys.length);
  });
});
