// tests/integration/verify-findings-end-to-end.test.ts — plan-9d Task 8 v2 M-4 / v11 MINOR-2
// 完整 13 e2e case,无 ellipsis;每个 case 给完整 fixture 构造 + archive run + 断言

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { buildFixture } from '../fixtures/verify-findings/build-fixture.js';

describe('verify_findings end-to-end (plan-9d Task 8)', () => {
  let rootDir: string;
  let cliPath: string;

  beforeEach(async () => {
    rootDir = join(
      tmpdir(),
      `forge-9d-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    await mkdir(rootDir, { recursive: true });
    cliPath = join(process.cwd(), 'dist/cli/index.js');
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  function runArchive(changeId: string): { exitCode: number; stderr: string } {
    // v3 M-2:--force 让 non-git fixture 通过 archive.ts is_git_repo=false 检查
    try {
      execFileSync('node', [cliPath, 'archive', changeId, '--force'], {
        cwd: rootDir,
        encoding: 'utf8',
      });
      return { exitCode: 0, stderr: '' };
    } catch (err) {
      const e = err as { status: number; stderr: string };
      return { exitCode: e.status ?? 0, stderr: e.stderr ?? '' };
    }
  }

  // === Case 1: CRITICAL automated=true + resolved=true → exit 0 ===
  it('1. crit-auto-resolved → exit 0', async () => {
    await buildFixture(rootDir, {
      changeId: 'crit-auto-resolved',
      finding: { severity: 'CRITICAL', automated: true, resolved: true },
    });
    const { exitCode } = runArchive('crit-auto-resolved');
    expect(exitCode).toBe(0);
  });

  // === Case 2: CRITICAL automated=true + resolved=false → exit 1 ===
  it('2. crit-auto-unresolved → exit 1 + automated CRITICAL', async () => {
    await buildFixture(rootDir, {
      changeId: 'crit-auto-unresolved',
      finding: { severity: 'CRITICAL', automated: true, resolved: false },
    });
    const { exitCode, stderr } = runArchive('crit-auto-unresolved');
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/automated CRITICAL/);
  });

  // === Case 3: CRITICAL automated=false + resolved=true → exit 0 ===
  it('3. crit-llm-resolved → exit 0', async () => {
    await buildFixture(rootDir, {
      changeId: 'crit-llm-resolved',
      finding: { severity: 'CRITICAL', automated: false, resolved: true },
    });
    const { exitCode } = runArchive('crit-llm-resolved');
    expect(exitCode).toBe(0);
  });

  // === Case 4: CRITICAL automated=false + resolved=false → exit 1 ===
  it('4. crit-llm-unresolved → exit 1 + no ack path', async () => {
    await buildFixture(rootDir, {
      changeId: 'crit-llm-unresolved',
      finding: { severity: 'CRITICAL', automated: false, resolved: false },
    });
    const { exitCode, stderr } = runArchive('crit-llm-unresolved');
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/no ack path for CRITICAL/);
  });

  // === Case 5: WARNING resolved=true → exit 0 ===
  it('5. warning-resolved → exit 0', async () => {
    await buildFixture(rootDir, {
      changeId: 'warning-resolved',
      finding: { severity: 'WARNING', resolved: true },
    });
    const { exitCode } = runArchive('warning-resolved');
    expect(exitCode).toBe(0);
  });

  // === Case 6: WARNING + acked + ack-log 匹配 → exit 0 ===
  it('6. warning-acked → exit 0(完整 ack-log 一致)', async () => {
    await buildFixture(rootDir, {
      changeId: 'warning-acked',
      finding: {
        severity: 'WARNING',
        resolved: false,
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T10:00:00Z',
      },
      ackLogMatch: 'matching',
    });
    const { exitCode } = runArchive('warning-acked');
    expect(exitCode).toBe(0);
  });

  // === Case 7: WARNING resolved=false + 无 ack → exit 1 ===
  it('7. warning-no-ack → exit 1 + severity_acked_by', async () => {
    await buildFixture(rootDir, {
      changeId: 'warning-no-ack',
      finding: { severity: 'WARNING', resolved: false },
    });
    const { exitCode, stderr } = runArchive('warning-no-ack');
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/severity_acked_by/);
  });

  // === Case 8 (v2 B-4): WARNING ack + ack-log 缺条目 → exit 1 ===
  it('8. warning-acked-no-acklog → exit 1 + ack-log 无对应(B-4)', async () => {
    await buildFixture(rootDir, {
      changeId: 'warning-acked-no-acklog',
      finding: {
        severity: 'WARNING',
        resolved: false,
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T10:00:00Z',
      },
      ackLogMatch: 'missing',
    });
    const { exitCode, stderr } = runArchive('warning-acked-no-acklog');
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ack-log.*无对应/);
  });

  // === Case 9 (v2 B-4): WARNING ack + ack-log hash 篡改 → exit 1 ===
  it('9. warning-acked-acklog-hash-mismatch → exit 1 + finding_hash 不一致(B-4)', async () => {
    await buildFixture(rootDir, {
      changeId: 'warning-acked-acklog-hash-mismatch',
      finding: {
        severity: 'WARNING',
        resolved: false,
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T10:00:00Z',
      },
      ackLogMatch: 'hash-mismatch',
    });
    const { exitCode, stderr } = runArchive('warning-acked-acklog-hash-mismatch');
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/finding_hash.*不一致/);
  });

  // === Case 10: SUGGESTION resolved=false → exit 0(允许带 finding) ===
  it('10. suggestion-unresolved → exit 0', async () => {
    await buildFixture(rootDir, {
      changeId: 'suggestion-unresolved',
      finding: { severity: 'SUGGESTION', resolved: false },
    });
    const { exitCode } = runArchive('suggestion-unresolved');
    expect(exitCode).toBe(0);
  });

  // === Case 11: automated CRITICAL hash 篡改 → exit 1 ===
  it('11. tampered-finding-hash → exit 1 + finding_hash mismatch', async () => {
    await buildFixture(rootDir, {
      changeId: 'tampered-finding-hash',
      finding: { severity: 'CRITICAL', automated: true, resolved: true },
      tamperHash: true,
    });
    const { exitCode, stderr } = runArchive('tampered-finding-hash');
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/finding_hash mismatch/);
  });

  // === Case 12: downgrade 完整 → exit 0 ===
  it('12. downgrade-complete → exit 0', async () => {
    await buildFixture(rootDir, {
      changeId: 'downgrade-complete',
      finding: {
        severity: 'SUGGESTION',
        resolved: false,
      },
      downgrade: {
        fromSeverity: 'WARNING',
        ackedBy: 'msc',
        rationale: 'edge case 罕见',
        ackLogMatch: true,
      },
    });
    const { exitCode } = runArchive('downgrade-complete');
    expect(exitCode).toBe(0);
  });

  // === Case 13 (v2 B-4): pending-acks 残留 → exit 1 ===
  // 注:用 SUGGESTION 让 finding 绕过 verify_findings fence(WARNING 缺 ack 会先拒签),
  // 触发 ack-log fence 检测 pending-acks 残留(沿 design line 498)
  it('13. pending-acks-residual → exit 1 + pending-acks 残留(B-4)', async () => {
    await buildFixture(rootDir, {
      changeId: 'pending-acks-residual',
      finding: { severity: 'SUGGESTION', resolved: false },
      pendingAcksResidual: true,
    });
    const { exitCode, stderr } = runArchive('pending-acks-residual');
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/pending-acks.*残留/);
  });
});
