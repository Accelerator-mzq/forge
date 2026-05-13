// src/core/archive/process-evidence-rerun.ts — plan-9g Task 6.1
// process_evidence fence worktree 重跑类不变量(5-6 / 13)
// brainstorm spec §3 不变量表 + §7 mode 分支
//
// mode 分支(brainstorm spec §9.10):
//   - full     → 全 task 重跑(并发 ≤ max_parallel_reruns)
//   - sample   → 按 sample_ratio 抽样 task
//   - hash-only → 跳过 worktree 重跑(返空数组;hash 校验已在 runFieldFence 9 完成)
//
// WARNING 13(timeout 在 sample/hash-only)由 ack-mode 隐含覆盖,本 fence 仅 stderr 不阻断
//   (brainstorm spec §3 WARNING 流转 + v9 简化)
//
// Observation(latent bug 自修):
//   - plan §7.1 line 4845/4914 用 execFileSync('sh', ['-c', testCommand]) — Windows 无 sh
//     → 改为 execFileSync(testCommand, [], { shell: true })(Node 自适应 POSIX/Windows)
//   - plan §7.1 line 4850/4853 chain.red_commit!.runner_report_path 在 async closure 内
//     narrowing 会丢失(TS Object is possibly 'null')
//     → 在 if (chain.red_commit) 后 const redCommit = chain.red_commit 解构,closure 用 redCommit

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { runInWorktree, ParallelGate, WorktreeError } from '../worktree.js';
import { parseReporter, type ReporterType } from '../test-reporters/index.js';
import type {
  ProcessEvidenceFenceContext,
  ProcessEvidenceFinding,
} from './process-evidence-fence.js';
import { seededSample } from './process-evidence-fence.js';
import type { TddEventChain } from '../schemas/process-evidence.js';

/**
 * runRerunFence — 跑 worktree 重跑类不变量 5/6/13
 *
 * @param ctx fence ctx(brainstorm spec §7.2)
 * @returns ProcessEvidenceFinding[]
 */
export async function runRerunFence(
  ctx: ProcessEvidenceFenceContext,
): Promise<ProcessEvidenceFinding[]> {
  const findings: ProcessEvidenceFinding[] = [];

  if (!ctx.processEvidence) return findings;

  const mode = ctx.processEvidence.process_verification_mode;

  // hash-only:跳过 worktree 重跑(沿 brainstorm spec §9.10;hash 校验由 runFieldFence 9 完成)
  if (mode === 'hash-only') {
    return findings;
  }

  // 读 ForgeConfig.process_verification 配置
  const config = {
    sample_ratio: ctx.config.sample_ratio,
    // 秒 → 毫秒(worktree timeout 用)
    test_timeout_per_task: ctx.config.test_timeout_per_task * 1000,
    max_parallel_reruns: ctx.config.max_parallel_reruns,
  };

  // 选择要重跑的 task 列表(full → 全;sample → 抽样)
  const chains = ctx.processEvidence.tdd_event_chain;
  let targetChains: TddEventChain[];
  if (mode === 'full') {
    targetChains = chains;
  } else {
    // sample 抽样:按 sample_ratio,deterministic seed=changeId 保 fence reproducible
    const sampleCount = Math.max(1, Math.ceil(chains.length * config.sample_ratio));
    targetChains = seededSample(chains, sampleCount, ctx.changeId);
  }

  // 取 reporter 类型 + test command
  const reporterType: ReporterType = ctx.testConfig.reporter;
  const testCommand = ctx.testConfig.test_command;

  // 创建并发 gate
  const gate = new ParallelGate(config.max_parallel_reruns);

  // 并发跑每个 chain(限 max_parallel_reruns)
  const tasks = targetChains.map(async (chain) => {
    await gate.acquire();
    try {
      // 不变量 5:RED worktree 重跑实际 fail + expected_failures 命中
      if (chain.red_commit) {
        // 修(latent bug 3):在 if (chain.red_commit) guard 后赋 const,
        // 避免 async closure 内 TypeScript narrowing 丢失导致 Object is possibly 'null'
        const redCommit = chain.red_commit;

        try {
          const rerunResult = await runInWorktree(
            redCommit.sha,
            async (workPath) => {
              try {
                // 修(latent bug 1):shell:true 替代 execFileSync('sh',['-c',…])
                // Node 在 POSIX 用 /bin/sh,Windows 用 cmd.exe — 跨平台兼容
                execFileSync(testCommand, [], {
                  cwd: workPath,
                  shell: true,
                  encoding: 'utf8',
                  stdio: ['ignore', 'pipe', 'pipe'],
                });
                return {
                  exitCode: 0,
                  reportPath: join(workPath, redCommit.runner_report_path),
                };
              } catch {
                // 测试 fail 是预期(RED);取 exit_code 1
                return {
                  exitCode: 1,
                  reportPath: join(workPath, redCommit.runner_report_path),
                };
              }
            },
            { cwd: ctx.cwd, timeout: config.test_timeout_per_task },
          );

          // 不变量 5 子项 a:exit_code != 0(预期 RED fail)
          if (rerunResult.exitCode === 0) {
            findings.push({
              invariant: 5,
              severity: 'CRITICAL',
              message: `RED rerun expected fail but exit_code=0 (red sha=${redCommit.sha})`,
              taskRef: chain.task_ref,
            });
          }

          // 不变量 5 子项 b:expected_failures 中至少一个真失败(reporter parse 校验)
          if (existsSync(rerunResult.reportPath)) {
            const report = await parseReporter(rerunResult.reportPath, reporterType);
            const actualFailures = report.tests.filter((t) => t.status === 'fail');
            for (const ef of redCommit.expected_failures) {
              const matched = actualFailures.some(
                (af) => af.test_file === ef.test_file && af.test_name === ef.test_name,
              );
              if (!matched) {
                findings.push({
                  invariant: 5,
                  severity: 'CRITICAL',
                  message: `RED rerun expected_failure not actually failed: ${ef.test_file}::${ef.test_name}`,
                  taskRef: chain.task_ref,
                });
              }
            }
          }
        } catch (e) {
          if (e instanceof WorktreeError && e.stage === 'timeout') {
            // 不变量 13:timeout 分级(full=CRITICAL / sample=WARNING)
            const severity = mode === 'full' ? 'CRITICAL' : 'WARNING';
            findings.push({
              invariant: 13,
              severity,
              message: `RED rerun timeout (>${config.test_timeout_per_task}ms) in ${mode} mode for task ${chain.task_ref}`,
              taskRef: chain.task_ref,
            });
          } else if (e instanceof WorktreeError) {
            findings.push({
              invariant: 5,
              severity: 'CRITICAL',
              message: `RED worktree error ${e.stage}: ${e.message}`,
              taskRef: chain.task_ref,
            });
          }
        }
      }

      // 不变量 6:GREEN worktree 重跑实际 pass
      try {
        const rerunResult = await runInWorktree(
          chain.green_commit.sha,
          async (workPath) => {
            try {
              // 修(latent bug 1):shell:true 跨平台
              execFileSync(testCommand, [], {
                cwd: workPath,
                shell: true,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
              });
              return {
                exitCode: 0,
                reportPath: join(workPath, chain.green_commit.runner_report_path),
              };
            } catch {
              return {
                exitCode: 1,
                reportPath: join(workPath, chain.green_commit.runner_report_path),
              };
            }
          },
          { cwd: ctx.cwd, timeout: config.test_timeout_per_task },
        );

        if (rerunResult.exitCode !== 0) {
          findings.push({
            invariant: 6,
            severity: 'CRITICAL',
            message: `GREEN rerun expected pass but exit_code=${rerunResult.exitCode}`,
            taskRef: chain.task_ref,
          });
        }

        // 不变量 6 加固:reporter 显示 0 failures
        if (existsSync(rerunResult.reportPath)) {
          const report = await parseReporter(rerunResult.reportPath, reporterType);
          if (report.failCount > 0) {
            findings.push({
              invariant: 6,
              severity: 'CRITICAL',
              message: `GREEN rerun reporter shows ${report.failCount} failures`,
              taskRef: chain.task_ref,
            });
          }
        }
      } catch (e) {
        if (e instanceof WorktreeError && e.stage === 'timeout') {
          // 不变量 13:GREEN timeout 同样分级
          const severity = mode === 'full' ? 'CRITICAL' : 'WARNING';
          findings.push({
            invariant: 13,
            severity,
            message: `GREEN rerun timeout in ${mode} mode for ${chain.task_ref}`,
            taskRef: chain.task_ref,
          });
        } else if (e instanceof WorktreeError) {
          findings.push({
            invariant: 6,
            severity: 'CRITICAL',
            message: `GREEN worktree error ${e.stage}: ${e.message}`,
            taskRef: chain.task_ref,
          });
        }
      }
    } finally {
      gate.release();
    }
  });

  await Promise.all(tasks);

  // 注:rerun-time WARNING(不变量 13 在 sample/hash-only)走 stderr 不阻断,不进 fence.ok=false
  //     (brainstorm spec §3 v9 修订 — ack-mode 隐含覆盖);此处 findings 直接 caller 输出
  //     CRITICAL 走 archive 拒签;WARNING 由 archive.ts process.stderr 输出告警
  return findings;
}
