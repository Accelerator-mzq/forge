// tests/cli/process-evidence-fence.test.ts — plan-9g Task 5.7
// 14 不变量 × 8 攻击场景 fixture(brainstorm §8.1 矩阵)
//
// 8 attack:
//   A1 改 timestamp           → 不变量 1 拒签
//   A2 rebase 断 ancestor    → 不变量 2 拒签
//   A3 同 commit 无 exemption → 不变量 5(worktree;Task 6)+ 11 拒签
//   A4 不相关代码错误当 RED   → 不变量 5(worktree;Task 6)
//   A5 伪 verify_invocations log → 不变量 9 三源 hash mismatch
//   A6 marker 字段绕 helper 直写 → 不变量 9 staging/projection mismatch
//   A7 hash-only 无 ack       → 不变量 12 拒签
//   A8(brainstorm v6 新增)旁支造合法链 + 主分支换实现 → 不变量 14 green↞HEAD 拒签

import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { crossCuttingFenceCheck } from '../../src/core/archive/fence.js';
import { canonicalHash } from '../../src/core/canonical-json.js';
import { runCli } from './helpers.js';

/**
 * setupAttackFixture — 搭建最小 git repo + change 目录骨架
 * 返回 { projectRoot, changeRoot }
 * 调用者负责写入具体攻击 fixture 内容
 */
async function setupAttackFixture(
  attackId: string,
): Promise<{ projectRoot: string; changeRoot: string }> {
  const projectRoot = await mkdtemp(join(tmpdir(), `forge-fence-${attackId}-`));
  // git init + baseline commit
  execFileSync('git', ['init', '-q'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectRoot });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: projectRoot });
  await writeFile(join(projectRoot, 'README.md'), '# test\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: projectRoot });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: projectRoot });

  // forge/changes/<attackId> 目录结构
  const changeRoot = join(projectRoot, 'forge', 'changes', `attack-${attackId}`);
  await mkdir(join(changeRoot, '.evidence'), { recursive: true });
  await writeFile(join(changeRoot, 'tasks.md'), '- [ ] Task 1\n', 'utf8');
  return { projectRoot, changeRoot };
}

describe('process-evidence-fence A1-A8 attacks', () => {
  /**
   * A1: 改 timestamp — 不变量 1 拒签
   *
   * 构造:marker.process_evidence.tdd_event_chain[0].red_commit.timestamp >
   *       marker.process_evidence.tdd_event_chain[0].green_commit.timestamp
   * 预期:fence-1 ok=false(red timestamp not before green)
   *
   * 注:fence-9 的 projection hash 子检也会失败(ack-log 空,marker tdd chain 非空),
   *   但测试只断言 fence-1 失败即可(result.ok=false 同时成立)
   */
  it('A1 改 timestamp → 不变量 1 拒签', async () => {
    const { projectRoot, changeRoot } = await setupAttackFixture('1-timestamp');

    // 取 HEAD sha 用于 green_commit(满足 merge-base 检查)
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();

    // 构造伪造 marker:red_timestamp > green_timestamp(倒置 — A1 攻击)
    const processEvidence = {
      schema: 'forge-process-evidence/v1',
      process_verification_mode: 'full',
      process_verification_mode_acked_by: null,
      process_verification_mode_acked_at: null,
      env_hash: {
        lockfile_hash: 'abc',
        node_version: '20.0.0',
        os_platform: 'linux',
      },
      tdd_event_chain: [
        {
          task_ref: 'task-1',
          red_commit: {
            sha: headSha,
            // A1 攻击:red timestamp 故意晚于 green timestamp
            timestamp: '2026-05-13T12:00:00Z',
            red_log_path: 'logs/red.txt',
            red_log_hash: 'aaa',
            exit_code: 1,
            runner_report_path: 'logs/red-report.xml',
            runner_report_hash: 'bbb',
            expected_failures: [],
          },
          green_commit: {
            sha: headSha,
            // green timestamp 早于 red timestamp → 违反不变量 1
            timestamp: '2026-05-13T11:00:00Z',
            green_log_path: 'logs/green.txt',
            green_log_hash: 'ccc',
            exit_code: 0,
            runner_report_path: 'logs/green-report.xml',
            runner_report_hash: 'ddd',
          },
          tdd_exemption: null,
          tdd_exemption_acked_by: null,
        },
      ],
      verify_invocations: [],
      subagent_review_chain: [],
    };

    const verifyMarker = {
      schema: 'forge-verify/v1',
      verified_at: '2026-05-13T12:00:00Z',
      verified_by: 'ai-agent',
      tasks_hash: 'placeholder',
      content_hash: 'placeholder',
      process_evidence: processEvidence,
      // 无 process_evidence_staging_hash → staging hash 子检 9.1 两边都 undefined,不报错
    };

    await writeFile(join(changeRoot, '.verify-passed'), stringifyYaml(verifyMarker), 'utf8');

    const result = await crossCuttingFenceCheck(changeRoot);

    // fence-1 必须失败(A1 攻击核心断言)
    expect(result.ok).toBe(false);
    const fence1 = result.results.find((r) => r.invariant === 'fence-1');
    expect(fence1?.ok).toBe(false);
    expect(fence1?.reason).toMatch(/not before/);
  });

  it.todo('A2 rebase ancestor 断 → 不变量 2 拒签');
  it.todo('A3 同 commit 无 exemption → 不变量 5/11 拒签');
  it.todo('A4 不相关代码错误当 RED → 不变量 5 拒签(Task 6 worktree)');
  it.todo('A5 伪 verify_invocations log → 不变量 9 hash mismatch');
  it.todo('A6 marker 字段绕 helper 直写 → 不变量 9 staging mismatch');
  it.todo('A7 hash-only 无 ack → 不变量 12 拒签');

  /**
   * A8: 旁支造合法 RED/GREEN 链 + 主分支换实现 → 不变量 14 green↞HEAD 拒签
   *
   * 构造:
   *   - 在 branch-X 上额外 commit(green_commit sha)
   *   - 切回 main,再 commit(new HEAD,不含 branch-X 的 green commit)
   *   - marker.process_evidence.tdd_event_chain[0].green_commit.sha = branch-X 上的 sha
   *   - archiveHead = main 的新 HEAD
   *   - git merge-base --is-ancestor <green-sha> <main-HEAD> → 失败 → fence-14 CRITICAL
   */
  it('A8 旁支造合法 RED/GREEN 链 + 主分支换实现 → 不变量 14 green↞HEAD 拒签', async () => {
    const { projectRoot, changeRoot } = await setupAttackFixture('8-cross-branch');

    // 记录初始 HEAD(用于 red_commit)
    const initHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();

    // 在 branch-X 上创建 GREEN commit(攻击者的旁支 sha)
    execFileSync('git', ['checkout', '-b', 'branch-x'], { cwd: projectRoot });
    await writeFile(join(projectRoot, 'impl-branchx.txt'), 'branch-x impl\n', 'utf8');
    execFileSync('git', ['add', '.'], { cwd: projectRoot });
    execFileSync('git', ['commit', '-q', '-m', 'green commit on branch-x'], { cwd: projectRoot });
    const greenShaOnBranchX = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();

    // 切回 main,创建新 commit(替换实现,diverge from branch-x)
    execFileSync('git', ['checkout', '-'], { cwd: projectRoot });
    await writeFile(join(projectRoot, 'impl-main.txt'), 'main different impl\n', 'utf8');
    execFileSync('git', ['add', '.'], { cwd: projectRoot });
    execFileSync('git', ['commit', '-q', '-m', 'main: different implementation'], {
      cwd: projectRoot,
    });
    const mainHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();

    // 验证 greenShaOnBranchX 确实不是 mainHead 的祖先
    let isAncestor = false;
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', greenShaOnBranchX, mainHead], {
        cwd: projectRoot,
      });
      isAncestor = true;
    } catch {
      isAncestor = false;
    }
    // 前置条件:branch-x green sha 不在 main 祖先路径
    expect(isAncestor).toBe(false);

    // 构造攻击 marker:green_commit.sha = branch-x 上的 sha(旁支造链)
    const processEvidence = {
      schema: 'forge-process-evidence/v1',
      process_verification_mode: 'full',
      process_verification_mode_acked_by: null,
      process_verification_mode_acked_at: null,
      env_hash: {
        lockfile_hash: 'abc',
        node_version: '20.0.0',
        os_platform: 'linux',
      },
      tdd_event_chain: [
        {
          task_ref: 'task-1',
          red_commit: {
            sha: initHead,
            timestamp: '2026-05-13T10:00:00Z',
            red_log_path: 'logs/red.txt',
            red_log_hash: 'aaa',
            exit_code: 1,
            runner_report_path: 'logs/red-report.xml',
            runner_report_hash: 'bbb',
            expected_failures: [],
          },
          green_commit: {
            // A8 攻击:green sha 是 branch-x 的,不在 main 祖先路径
            sha: greenShaOnBranchX,
            timestamp: '2026-05-13T11:00:00Z',
            green_log_path: 'logs/green.txt',
            green_log_hash: 'ccc',
            exit_code: 0,
            runner_report_path: 'logs/green-report.xml',
            runner_report_hash: 'ddd',
          },
          tdd_exemption: null,
          tdd_exemption_acked_by: null,
        },
      ],
      verify_invocations: [],
      subagent_review_chain: [],
    };

    const verifyMarker = {
      schema: 'forge-verify/v1',
      verified_at: '2026-05-13T12:00:00Z',
      verified_by: 'ai-agent',
      tasks_hash: 'placeholder',
      content_hash: 'placeholder',
      process_evidence: processEvidence,
    };

    await writeFile(join(changeRoot, '.verify-passed'), stringifyYaml(verifyMarker), 'utf8');

    const result = await crossCuttingFenceCheck(changeRoot);

    // fence-14 必须失败(A8 攻击核心断言)
    expect(result.ok).toBe(false);
    const fence14 = result.results.find((r) => r.invariant === 'fence-14');
    expect(fence14?.ok).toBe(false);
    expect(fence14?.reason).toMatch(/祖先|ancestor/);
  });
});

/**
 * Regression test (plan-9g Task 5 round 2 Critical fix):
 *  fence-9.2 happy path no false positive
 *
 * 历史 bug:evidence.ts record-tdd 中 payload 用 `?? null` fallback,
 *  staging 用 `?? ''` / `?? -1` / `?? new Date()` fallback。
 *  任何省略 optional arg 的 record-tdd 调用都会导致 projection hash 不一致 → fence-9.2 永误报。
 *
 * Fix:payload = staging-built object(single source of truth),
 *     reconstructProjectionFromAckLog 改为 identity cast。
 *
 * 本 regression test:走完整 record-tdd → freeze → crossCuttingFenceCheck 流程,
 * 仅传 minimal required args(省略 optional)— 验证 fence-9.2 不误报。
 */
describe('process-evidence-fence regression: fence-9.2 happy path no false positive', () => {
  it('minimal record-tdd(仅 required args)+ freeze → fence-9.2 PASS(不误报)', async () => {
    const { projectRoot, changeRoot } = await setupAttackFixture('regression-9-2');
    const changeId = 'attack-regression-9-2';

    // Step 1:创建 RED commit + GREEN commit(满足不变量 2 ancestor + 不变量 14 green↞HEAD)
    // baseline 后再加两个 commit:red 含 RED 标识 + green 含 GREEN 修复
    await writeFile(join(projectRoot, 'red.txt'), 'red commit\n', 'utf8');
    execFileSync('git', ['add', '.'], { cwd: projectRoot });
    execFileSync('git', ['commit', '-q', '-m', 'RED commit'], { cwd: projectRoot });
    const redSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();

    await writeFile(join(projectRoot, 'green.txt'), 'green commit\n', 'utf8');
    execFileSync('git', ['add', '.'], { cwd: projectRoot });
    execFileSync('git', ['commit', '-q', '-m', 'GREEN commit'], { cwd: projectRoot });
    const greenSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();

    // Step 2:minimal record-tdd(仅 required args + red-exit/green-exit + 显式 timestamp)
    // 故意不传 --red-log / --red-log-hash / --red-report / --red-report-hash 等
    //   optional args → 触发原 bug 场景(payload fallback `?? null` vs staging fallback `?? ''`)
    // 必须传 --red-exit/--green-exit 满足不变量 3/4
    // 必须传 --red-timestamp/--green-timestamp 避免 staging `?? new Date()` 双调用产生
    //   相同/反序 timestamp 误触不变量 1(本 regression 测的是 fence-9.2,不应被 fence-1 干扰)
    // 关键:验证 payload 与 staging 字段一致 → 无 fence-9.2 误报
    const recordResult = runCli(
      [
        'evidence',
        'record-tdd',
        changeId,
        '--task',
        'tasks.md#task-1',
        '--red-commit',
        redSha,
        '--green-commit',
        greenSha,
        '--red-exit',
        '1',
        '--green-exit',
        '0',
        '--red-timestamp',
        '2026-05-13T10:00:00Z',
        '--green-timestamp',
        '2026-05-13T11:00:00Z',
      ],
      projectRoot,
    );
    expect(recordResult.exitCode).toBe(0);

    // Step 2.5(plan-9g Task 6 fix):改 staging.yaml 走 hash-only mode 路径,
    //   绕过 runRerunFence 真 git worktree 重跑(避免 5000ms vitest 默认 testTimeout 超时)。
    //
    // 回归测试意图不变:fence-9.2(projection hash match)校验 staging 的 tdd_event_chain
    // 与 ack-log helper projection 字段对齐。hash-only mode 在 runRerunFence 直接返空数组
    // (brainstorm spec §9.10),但 runFieldFence 不变量 9 仍跑完整 cross-source check,
    // 因此 fence-9.2 false positive 检测覆盖保持。
    //
    // staging 改 hash-only 必须同时:
    //   (a) 填 process_verification_mode_acked_by + acked_at(不变量 12 mode != full 要求)
    //   (b) 剥离 staging_hash 信封字段后 canonicalHash 重算(freeze 会校验 staging_hash 防篡改)
    const stagingPath = join(changeRoot, '.evidence', 'process-evidence.staging.yaml');
    const stagingRaw = await readFile(stagingPath, 'utf8');
    const stagingObj = parseYaml(stagingRaw) as Record<string, unknown> & { staging_hash?: string };
    stagingObj.process_verification_mode = 'hash-only';
    stagingObj.process_verification_mode_acked_by = 'msc';
    stagingObj.process_verification_mode_acked_at = '2026-05-13T09:00:00Z';
    // 剥离 staging_hash 后重算(沿 writeStagingYaml 公式:canonicalHash(data without staging_hash))
    delete stagingObj.staging_hash;
    const newStagingHash = canonicalHash(stagingObj);
    const finalStaging = { ...stagingObj, staging_hash: newStagingHash };
    await writeFile(stagingPath, stringifyYaml(finalStaging), 'utf8');

    // Step 3:写 minimal .verify-passed marker(主代理写,等待 freeze 注入 process_evidence)
    const verifyMarker = {
      schema: 'forge-verify/v1',
      verified_at: '2026-05-13T12:00:00Z',
      verified_by: 'ai-agent',
      tasks_hash: 'placeholder',
      content_hash: 'placeholder',
    };
    await writeFile(join(changeRoot, '.verify-passed'), stringifyYaml(verifyMarker), 'utf8');

    // Step 4:freeze verify marker(staging → marker.process_evidence + 三 hash 快照)
    const freezeResult = runCli(['evidence', 'freeze', changeId, '--kind', 'verify'], projectRoot);
    expect(freezeResult.exitCode).toBe(0);

    // Step 5:crossCuttingFenceCheck — 验证 fence-9 不误报
    //   特别是 fence-9.2(projection hash match):round 2 Critical fix 后必须 PASS
    //
    // mock process.env.CI=undefined 防 CI runner 环境触发不变量 12 CI mode 拒签
    //   (CI=true + mode != full 直接拒签;本测试用 hash-only 故必须确保非 CI 模式)
    const originalCI = process.env.CI;
    delete process.env.CI;
    let result;
    try {
      result = await crossCuttingFenceCheck(changeRoot);
    } finally {
      if (originalCI !== undefined) process.env.CI = originalCI;
    }

    // fence-9 必须 ok(若 9.2 仍误报,这里会 false)
    const fence9 = result.results.find((r) => r.invariant === 'fence-9');
    expect(fence9?.ok).toBe(true);
    expect(fence9?.reason).toBe('pass');

    // fence-1/2/3/4 也应 PASS(合法 RED → GREEN 链)
    expect(result.results.find((r) => r.invariant === 'fence-1')?.ok).toBe(true);
    expect(result.results.find((r) => r.invariant === 'fence-2')?.ok).toBe(true);
    expect(result.results.find((r) => r.invariant === 'fence-3')?.ok).toBe(true);
    expect(result.results.find((r) => r.invariant === 'fence-4')?.ok).toBe(true);
    expect(result.results.find((r) => r.invariant === 'fence-14')?.ok).toBe(true);
  });
});
