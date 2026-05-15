// state-machine.ts — 单轮收敛轮次结果类型 + 辅助函数
// plan-stage-extensions Task 2.6
// 定义 RoundOutcome 判别联合和 isFailureOutcome 辅助函数;
// 完整状态机由 runner (Task 5) 实现

import type { ConvergenceResult } from './convergence-judge.js';

/**
 * 单轮 codex extension 执行结果。
 *
 * converged   :block findings 为空,可继续 merge
 * unconverged :block findings 非空,需再轮
 * spawn_failed:子进程启动失败
 * zombie      :进程挂死(mtime 停止更新)
 * timeout     :整体超时(mtime 仍更新)
 * invalid_output:codex 输出文件格式非法
 * attempt_failed:重试次数耗尽或其他失败
 */
export type RoundOutcome =
  | { kind: 'converged'; convergence: ConvergenceResult }
  | { kind: 'unconverged'; convergence: ConvergenceResult }
  | { kind: 'spawn_failed'; error: Error }
  | { kind: 'zombie'; jobId: string | null }
  | { kind: 'timeout'; jobId: string | null }
  | { kind: 'invalid_output'; reason: string }
  | { kind: 'attempt_failed'; reason: string };

/**
 * 判断 RoundOutcome 是否为失败态。
 * 失败态:spawn_failed / zombie / timeout / invalid_output / attempt_failed。
 * converged / unconverged 不视为失败(unconverged 是正常的"需继续"状态)。
 *
 * @param o  单轮结果
 */
export function isFailureOutcome(o: RoundOutcome): boolean {
  return (
    o.kind === 'spawn_failed' ||
    o.kind === 'zombie' ||
    o.kind === 'timeout' ||
    o.kind === 'invalid_output' ||
    o.kind === 'attempt_failed'
  );
}
