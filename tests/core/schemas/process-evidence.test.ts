// tests/core/schemas/process-evidence.test.ts — plan-9g Task 1.6
// 测 process-evidence.ts schema 8 case(brainstorm spec §4 + §8.2 测试矩阵)
//
// Case 1:schema literal 锁定为 'forge-process-evidence/v1'
// Case 2:RedCommitRecord 含 red_log_path/red_log_hash(非 log_path)
// Case 3:GreenCommitRecord 含 green_log_path/green_log_hash 且无 expected_failures
// Case 4:process_verification_mode 三档 literal union('full'|'sample'|'hash-only')
// Case 5:failure_type 四档 literal union('assertion'|'timeout'|'error'|'not-implemented')
// Case 6:TddEventChain.red_commit 可 null(tdd_exemption 非空时)
// Case 7:validateProcessVerificationConfig 默认值 fallback
// Case 8:validateProcessVerificationConfig 范围 + 类型校验

import { describe, it, expect } from 'vitest';
import type {
  ProcessEvidence,
  RedCommitRecord,
  GreenCommitRecord,
  ExpectedFailure,
  TddEventChain,
  TddExemption,
} from '../../../src/core/schemas/process-evidence.js';
import { validateProcessVerificationConfig } from '../../../src/core/schema/process-verification-config.js';
import { DEFAULT_PROCESS_VERIFICATION } from '../../../src/core/schema/types.js';

describe('process-evidence schema', () => {
  it('Case 1: schema literal 锁定 forge-process-evidence/v1', () => {
    const pe: ProcessEvidence = {
      schema: 'forge-process-evidence/v1',
      process_verification_mode: 'full',
      process_verification_mode_acked_by: null,
      process_verification_mode_acked_at: null,
      env_hash: {
        lockfile_hash: 'sha256:placeholder',
        node_version: '20.10.0',
        os_platform: 'linux',
      },
      tdd_event_chain: [],
      verify_invocations: [],
      subagent_review_chain: [],
    };
    expect(pe.schema).toBe('forge-process-evidence/v1');
    // TypeScript 编译期验证 literal 唯一(以下行不应编译通过,留作 type test):
    // const wrong: ProcessEvidence = { schema: 'forge-process-evidence/v2', ... };
  });

  it('Case 2: RedCommitRecord 字段名严格 red_log_path/red_log_hash(沿 master spec 行 1115/1116)', () => {
    const red: RedCommitRecord = {
      sha: 'abc123',
      timestamp: '2026-05-12T14:00:00Z',
      red_log_path: '.evidence/task-1-red.log',
      red_log_hash: 'sha256:redhash',
      exit_code: 1, // RED 必 != 0
      runner_report_path: '.evidence/task-1-red-junit.xml',
      runner_report_hash: 'sha256:reportshash',
      expected_failures: [
        {
          test_file: 'src/auth/refresh.test.ts',
          test_name: 'refreshToken returns new token',
          failure_type: 'assertion',
        },
      ],
    };
    // 字段名严格沿 master spec §2.7.2 字面
    expect(red.red_log_path).toBe('.evidence/task-1-red.log');
    expect(red.red_log_hash).toBe('sha256:redhash');
    expect(red.exit_code).not.toBe(0);
  });

  it('Case 3: GreenCommitRecord 含 green_log_path/green_log_hash 且无 expected_failures', () => {
    const green: GreenCommitRecord = {
      sha: 'def456',
      timestamp: '2026-05-12T14:30:00Z',
      green_log_path: '.evidence/task-1-green.log',
      green_log_hash: 'sha256:greenhash',
      exit_code: 0, // GREEN 必 == 0
      runner_report_path: '.evidence/task-1-green-junit.xml',
      runner_report_hash: 'sha256:gxhash',
    };
    expect(green.green_log_path).toBe('.evidence/task-1-green.log');
    expect(green.exit_code).toBe(0);
  });

  it('Case 4: process_verification_mode 三档 literal union', () => {
    const modes: ProcessEvidence['process_verification_mode'][] = ['full', 'sample', 'hash-only'];
    expect(modes).toHaveLength(3);
    // TypeScript 编译期验证:
    // const wrong: ProcessEvidence['process_verification_mode'] = 'invalid'; // @ts-expect-error
  });

  it('Case 5: failure_type 四档 literal union', () => {
    const failures: ExpectedFailure['failure_type'][] = [
      'assertion',
      'timeout',
      'error',
      'not-implemented',
    ];
    expect(failures).toHaveLength(4);
  });

  it('Case 6: TddEventChain.red_commit 可 null(tdd_exemption 非空时)', () => {
    const exemption: TddExemption = {
      reason: 'light-mode-trivial',
      loc_delta: 50,
    };
    const chain: TddEventChain = {
      task_ref: 'tasks.md#task-1',
      red_commit: null, // tdd_exemption 非空时 RED 可省
      green_commit: {
        sha: 'def456',
        timestamp: '2026-05-12T14:30:00Z',
        green_log_path: '.evidence/task-1-green.log',
        green_log_hash: 'sha256:greenhash',
        exit_code: 0,
        runner_report_path: '.evidence/task-1-green-junit.xml',
        runner_report_hash: 'sha256:gxhash',
      },
      tdd_exemption: exemption,
      tdd_exemption_acked_by: 'msc',
    };
    expect(chain.red_commit).toBeNull();
    expect(chain.tdd_exemption?.reason).toBe('light-mode-trivial');
  });

  it('Case 7: validateProcessVerificationConfig 默认值 fallback(缺 process_verification 段)', () => {
    const sanitized = validateProcessVerificationConfig(undefined);
    expect(sanitized).toEqual(DEFAULT_PROCESS_VERIFICATION);

    const sanitized2 = validateProcessVerificationConfig({ schema: 'forge-spec-driven/v1' });
    expect(sanitized2).toEqual(DEFAULT_PROCESS_VERIFICATION);
  });

  it('Case 8: validateProcessVerificationConfig 范围 + 类型校验', () => {
    const warns: string[] = [];
    const warn = (msg: string) => warns.push(msg);

    // sample_ratio 超范围
    const r1 = validateProcessVerificationConfig(
      {
        schema: 'forge-spec-driven/v1',
        process_verification: { sample_ratio: 1.5 },
      },
      warn,
    );
    expect(r1.sample_ratio).toBe(DEFAULT_PROCESS_VERIFICATION.sample_ratio);
    expect(warns[0]).toMatch(/sample_ratio.*\[0,1\]/);

    // mode 非法 string
    warns.length = 0;
    const r2 = validateProcessVerificationConfig(
      {
        schema: 'forge-spec-driven/v1',
        // @ts-expect-error - test 故意传非法值校验
        process_verification: { mode: 'invalid' },
      },
      warn,
    );
    expect(r2.mode).toBe('full');

    // test_timeout_per_task 非整数
    warns.length = 0;
    const r3 = validateProcessVerificationConfig(
      {
        schema: 'forge-spec-driven/v1',
        process_verification: { test_timeout_per_task: 3.14 },
      },
      warn,
    );
    expect(r3.test_timeout_per_task).toBe(DEFAULT_PROCESS_VERIFICATION.test_timeout_per_task);

    // max_parallel_reruns 超上限
    warns.length = 0;
    const r4 = validateProcessVerificationConfig(
      {
        schema: 'forge-spec-driven/v1',
        process_verification: { max_parallel_reruns: 100 },
      },
      warn,
    );
    expect(r4.max_parallel_reruns).toBe(DEFAULT_PROCESS_VERIFICATION.max_parallel_reruns);

    // 合法值通过
    warns.length = 0;
    const r5 = validateProcessVerificationConfig(
      {
        schema: 'forge-spec-driven/v1',
        process_verification: {
          mode: 'sample',
          sample_ratio: 0.5,
          test_timeout_per_task: 600,
          max_parallel_reruns: 4,
        },
      },
      warn,
    );
    expect(r5).toEqual({
      mode: 'sample',
      sample_ratio: 0.5,
      test_timeout_per_task: 600,
      max_parallel_reruns: 4,
    });
    expect(warns).toHaveLength(0);
  });
});
