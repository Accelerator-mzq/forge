// tests/cli/evidence-freeze.test.ts — plan-9g Task 4.2
// 测 forge evidence freeze 子命令 8 case(brainstorm spec §8.2)
//
// Case 1: --kind requiredOption omit → commander 自动 exit 1
// Case 2: --kind invalid value(非 verify|review)→ exit 2
// Case 3: staging.yaml 不存在 → exit 1 + 提示先跑 record-tdd
// Case 4: staging_hash mismatch(中间篡改)→ exit 1 staging tampered
// Case 5: marker 不存在 → exit 1 + 提示先写 .verify-passed
// Case 6: happy path — freeze 写 marker.process_evidence + tail_hash + entry_count
// Case 7: WARNING 7(verify_invocations < tasks)→ 转 VerifyFinding 写 marker.verify_findings
// Case 8: CRITICAL 12(mode != full + acked_by 缺)→ exit 1 拒绝写 marker

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { canonicalHash } from '../../src/core/canonical-json.js';

const CLI = join(process.cwd(), 'dist', 'cli', 'index.js');

// ─── Fixture helpers ────────────────────────────────────────────────────────

async function setupChangeFixture(): Promise<{
  projectRoot: string;
  changeRoot: string;
  changeId: string;
}> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'forge-freeze-test-'));
  const changeId = 'test-change';
  const changeRoot = join(projectRoot, 'forge', 'changes', changeId);
  await mkdir(join(changeRoot, '.evidence'), { recursive: true });
  // 写 minimal tasks.md(用于不变量 7 count);含 2 task
  await writeFile(join(changeRoot, 'tasks.md'), `- [ ] Task 1\n- [x] Task 2\n`, 'utf8');
  return { projectRoot, changeRoot, changeId };
}

/**
 * writeStaging — 写入 process-evidence.staging.yaml 到 changeRoot/.evidence/
 *
 * Observation(latent bug 2 修正):
 *   plan §5.2.1 Case 6/7 writeStaging helper 只写三数组,缺 process_verification_mode / env_hash 等必填字段。
 *   freeze 时 missingFields.length > 0 → exit 1。
 *   修正:补完整字段,默认 mode='full' + env_hash 与当前 process 一致(不触发不变量 10 WARNING)。
 *
 * Observation(latent bug 1 修正):
 *   staging_hash 用 canonicalHash(三数组+其他字段的完整 ProcessEvidence struct,不含 staging_hash)
 *   与 Task 3 writeStagingYaml 公式一致。
 */
async function writeStaging(
  changeRoot: string,
  data: {
    tdd_event_chain: unknown[];
    verify_invocations: unknown[];
    subagent_review_chain: unknown[];
    process_verification_mode?: string;
    process_verification_mode_acked_by?: string | null;
    process_verification_mode_acked_at?: string | null;
    env_hash?: {
      lockfile_hash: string;
      node_version: string;
      os_platform: string;
    };
  },
): Promise<string> {
  // 补默认值:mode=full + env_hash 与当前 process 一致
  const fullData = {
    schema: 'forge-process-evidence/v1' as const,
    change_id: 'test-change',
    created_at: '2026-05-13T00:00:00Z',
    process_verification_mode: data.process_verification_mode ?? 'full',
    process_verification_mode_acked_by: data.process_verification_mode_acked_by ?? null,
    process_verification_mode_acked_at: data.process_verification_mode_acked_at ?? null,
    env_hash: data.env_hash ?? {
      lockfile_hash: 'sha256:test-lockfile-placeholder',
      node_version: process.version.slice(1), // 与当前 process 一致,不触发不变量 10
      os_platform: process.platform,
    },
    tdd_event_chain: data.tdd_event_chain,
    verify_invocations: data.verify_invocations,
    subagent_review_chain: data.subagent_review_chain,
  };
  // staging_hash = canonicalHash(完整 ProcessEvidence struct)
  // 沿 Task 3 writeStagingYaml 公式(evidence.ts:122):stagingHash = canonicalHash(data)
  // 注:staging_hash 是信封字段,不含在 hash 计算范围内
  const staging_hash = canonicalHash(fullData);
  const withHash = { ...fullData, staging_hash };
  await writeFile(
    join(changeRoot, '.evidence', 'process-evidence.staging.yaml'),
    stringifyYaml(withHash),
    'utf8',
  );
  return staging_hash;
}

/** 写 minimal .verify-passed marker(主代理刚写完的 verify marker) */
async function writeMinimalVerifyMarker(changeRoot: string): Promise<void> {
  const marker = {
    schema: 'forge-verify/v1',
    verified_at: '2026-05-13T00:00:00Z',
    verified_by: 'ai-agent',
    tasks_hash: 'sha256:placeholder',
    content_hash: 'sha256:placeholder',
    evidence: [],
  };
  await writeFile(join(changeRoot, '.verify-passed'), stringifyYaml(marker), 'utf8');
}

// ─── 测试套件 ────────────────────────────────────────────────────────────────

describe('forge evidence freeze (plan-9g Task 4)', () => {
  let projectRoot: string;
  let changeRoot: string;
  let changeId: string;

  beforeEach(async () => {
    ({ projectRoot, changeRoot, changeId } = await setupChangeFixture());
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('Case 1: --kind requiredOption omit → exit 1(commander 自动)', () => {
    // commander requiredOption omit 时自动 exit 1 + stderr error message
    expect(() => {
      execFileSync('node', [CLI, 'evidence', 'freeze', changeId], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    }).toThrow(/required option.*--kind|Process exited|exit code 1/i);
  });

  it('Case 2: --kind invalid value → exit 2', () => {
    // --kind invalid 触发 freeze action 内 enum 校验 → exit 2
    expect(() => {
      execFileSync('node', [CLI, 'evidence', 'freeze', changeId, '--kind', 'invalid'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    }).toThrow(/invalid --kind|Process exited|exit code (1|2)/i);
  });

  it('Case 3: staging.yaml 不存在 → exit 1', async () => {
    // 只写 marker,不写 staging → 触发 "staging file not found"
    await writeMinimalVerifyMarker(changeRoot);
    expect(() => {
      execFileSync('node', [CLI, 'evidence', 'freeze', changeId, '--kind', 'verify'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    }).toThrow(/staging file not found|exit code 1/i);
  });

  it('Case 4: staging_hash mismatch → exit 1 staging tampered', async () => {
    // 先写合法 staging,再直接篡改 staging_hash 字段
    await writeStaging(changeRoot, {
      tdd_event_chain: [],
      verify_invocations: [],
      subagent_review_chain: [],
    });
    // 手动篡改 staging_hash
    const stagingPath = join(changeRoot, '.evidence', 'process-evidence.staging.yaml');
    const staging = parseYaml(await readFile(stagingPath, 'utf8')) as Record<string, unknown>;
    staging.staging_hash = 'sha256:tampered000000000000000000000000000000000000000000000000';
    await writeFile(stagingPath, stringifyYaml(staging), 'utf8');
    await writeMinimalVerifyMarker(changeRoot);

    expect(() => {
      execFileSync('node', [CLI, 'evidence', 'freeze', changeId, '--kind', 'verify'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    }).toThrow(/staging tampered|staging_hash mismatch|exit code 1/i);
  });

  it('Case 5: marker 不存在 → exit 1 提示先写', async () => {
    // 只写 staging,不写 .verify-passed → 触发 "marker not found"
    await writeStaging(changeRoot, {
      tdd_event_chain: [],
      verify_invocations: [],
      subagent_review_chain: [],
    });
    expect(() => {
      execFileSync('node', [CLI, 'evidence', 'freeze', changeId, '--kind', 'verify'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    }).toThrow(/marker not found|exit code 1/i);
  });

  it('Case 6: happy path — freeze 写 marker.process_evidence + tail/count', async () => {
    // Observation(latent bug 2 修正):writeStaging 补完整字段(mode=full + env_hash 一致)
    // happy path:0 tdd_event_chain tdd_exemption;verify_invocations=2 >= tasks count=2
    await writeStaging(changeRoot, {
      tdd_event_chain: [
        {
          task_ref: 'tasks.md#task-1',
          red_commit: null,
          green_commit: {
            sha: 'abc123',
            timestamp: '2026-05-13T00:00:00Z',
            green_log_path: '.evidence/g.log',
            green_log_hash: 'sha256:x',
            exit_code: 0,
            runner_report_path: '.evidence/g.xml',
            runner_report_hash: 'sha256:y',
          },
          tdd_exemption: null,
          tdd_exemption_acked_by: null,
        },
      ],
      verify_invocations: [
        {
          invoked_at: '2026-05-13T00:00:00Z',
          task_refs: ['tasks.md#task-1', 'tasks.md#task-2'],
          verify_scope: 'change-level',
          result: 'pass',
          exit_code: 0,
          log_path: '.evidence/v.log',
          log_hash: 'sha256:v',
          runner_report_path: '.evidence/v.xml',
          runner_report_hash: 'sha256:vr',
        },
        {
          invoked_at: '2026-05-13T00:01:00Z',
          task_refs: ['tasks.md#task-2'],
          verify_scope: 'per-task',
          result: 'pass',
          exit_code: 0,
          log_path: '.evidence/v2.log',
          log_hash: 'sha256:v2',
          runner_report_path: '.evidence/v2.xml',
          runner_report_hash: 'sha256:vr2',
        },
      ],
      subagent_review_chain: [],
    });
    await writeMinimalVerifyMarker(changeRoot);

    // freeze 执行不应抛错(exit 0)
    execFileSync('node', [CLI, 'evidence', 'freeze', changeId, '--kind', 'verify'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    // 验证 marker 字段
    const marker = parseYaml(await readFile(join(changeRoot, '.verify-passed'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(marker.process_evidence).toBeDefined();
    expect(marker.process_evidence_staging_hash).toBeDefined();
    // freeze 自身写了 ack-log entry → ack_log_tail_hash 非 null,ack_log_entry_count >= 1
    expect(marker.ack_log_tail_hash).toBeDefined();
    expect(typeof marker.ack_log_tail_hash).toBe('string');
    expect(typeof marker.ack_log_entry_count).toBe('number');
    expect(marker.ack_log_entry_count as number).toBeGreaterThan(0);
  });

  it('Case 7: WARNING 7 verify_invocations < tasks → marker.verify_findings 含 process_evidence 维度 finding', async () => {
    // Observation(latent bug 2 修正):writeStaging 补完整字段(mode=full + env_hash 一致)
    // tasks.md 含 2 task,verify_invocations=0 → count < tasks → WARNING 7
    await writeStaging(changeRoot, {
      tdd_event_chain: [],
      verify_invocations: [], // 0 < 2 → 触发不变量 7 WARNING
      subagent_review_chain: [],
    });
    await writeMinimalVerifyMarker(changeRoot);

    // freeze 应成功(WARNING 不 exit 1)
    execFileSync('node', [CLI, 'evidence', 'freeze', changeId, '--kind', 'verify'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const marker = parseYaml(await readFile(join(changeRoot, '.verify-passed'), 'utf8')) as Record<
      string,
      unknown
    >;
    const findings = marker.verify_findings as Array<{
      dimension: string;
      check_type: string;
      severity: string;
    }>;
    expect(findings).toBeDefined();
    // 应含 process_evidence 维度 + invariant-7-verify-count check_type
    expect(
      findings.some(
        (f) => f.dimension === 'process_evidence' && f.check_type === 'invariant-7-verify-count',
      ),
    ).toBe(true);
    // M-2 fix:断言 severity='WARNING'(非 CRITICAL)
    const inv7 = findings.find((f) => f.check_type === 'invariant-7-verify-count');
    expect(inv7?.severity).toBe('WARNING');
  });

  it('Case 9 (I-1 regression): re-freeze idempotency — ack-log 不长第二条 freeze entry', async () => {
    // I-1 fix regression:模拟 freeze 成功后再 freeze 一次,
    //   guard 应识别 last entry 已是相同 payload_hash 的 freeze → 不再 append。
    //   ack-log entry_count 应保持不变(仍为 1 条 freeze entry)。
    await writeStaging(changeRoot, {
      tdd_event_chain: [],
      verify_invocations: [
        {
          invoked_at: '2026-05-13T00:00:00Z',
          task_refs: ['tasks.md#task-1', 'tasks.md#task-2'],
          verify_scope: 'change-level',
          result: 'pass',
          exit_code: 0,
          log_path: '.evidence/v.log',
          log_hash: 'sha256:v',
          runner_report_path: '.evidence/v.xml',
          runner_report_hash: 'sha256:vr',
        },
        {
          invoked_at: '2026-05-13T00:01:00Z',
          task_refs: ['tasks.md#task-2'],
          verify_scope: 'per-task',
          result: 'pass',
          exit_code: 0,
          log_path: '.evidence/v2.log',
          log_hash: 'sha256:v2',
          runner_report_path: '.evidence/v2.xml',
          runner_report_hash: 'sha256:vr2',
        },
      ],
      subagent_review_chain: [],
    });
    await writeMinimalVerifyMarker(changeRoot);

    // 第一次 freeze
    execFileSync('node', [CLI, 'evidence', 'freeze', changeId, '--kind', 'verify'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    // 读 ack-log 第一次 freeze 后行数
    const ackLogPath = join(changeRoot, '.evidence', 'ack-log.jsonl');
    const ackLog1 = await readFile(ackLogPath, 'utf8');
    const lines1 = ackLog1.split('\n').filter((l) => l.trim().length > 0);
    expect(lines1.length).toBe(1); // 仅 1 条 freeze entry

    // 第二次 freeze(retry,模拟 transaction 失败后重试)
    execFileSync('node', [CLI, 'evidence', 'freeze', changeId, '--kind', 'verify'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    // I-1 guard 应识别 replay → ack-log 仍 1 条
    const ackLog2 = await readFile(ackLogPath, 'utf8');
    const lines2 = ackLog2.split('\n').filter((l) => l.trim().length > 0);
    expect(lines2.length).toBe(1); // 仍 1 条(idempotency guard 拦截重复 append)
  });

  it('Case 8: CRITICAL 12 mode != full + acked_by 缺 → exit 1 拒绝写 marker', async () => {
    // Observation(latent bug 2 修正):需写完整 staging 含 mode=hash-only + acked_by=null
    //   env_hash 完整(避免 missingFields exit 1 遮蔽 CRITICAL 12)
    // 直接构造含 mode/env_hash/acked_by 的完整 staging
    const fullData = {
      schema: 'forge-process-evidence/v1' as const,
      change_id: 'test-change',
      created_at: '2026-05-13T00:00:00Z',
      process_verification_mode: 'hash-only' as const, // non-full mode
      process_verification_mode_acked_by: null, // ack 缺 → CRITICAL 12
      process_verification_mode_acked_at: null,
      env_hash: {
        lockfile_hash: 'sha256:test-lockfile-placeholder',
        node_version: process.version.slice(1),
        os_platform: process.platform as 'win32' | 'darwin' | 'linux',
      },
      tdd_event_chain: [] as unknown[],
      verify_invocations: [] as unknown[],
      subagent_review_chain: [] as unknown[],
    };
    const staging_hash = canonicalHash(fullData);
    const withHash = { ...fullData, staging_hash };
    await writeFile(
      join(changeRoot, '.evidence', 'process-evidence.staging.yaml'),
      stringifyYaml(withHash),
      'utf8',
    );
    await writeMinimalVerifyMarker(changeRoot);

    // freeze 应 exit 1(CRITICAL 12)
    expect(() => {
      execFileSync('node', [CLI, 'evidence', 'freeze', changeId, '--kind', 'verify'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    }).toThrow(/CRITICAL.*invariant|mode.*ack|invariant-12|exit code 1/i);
  });
});
