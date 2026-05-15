// convergence-judge.ts — 收敛判断核心逻辑
// plan-stage-extensions Task 2.2
// 根据 CodexReviewOutput + ConvergenceConfig 输出 ConvergenceResult;
// 不判断是否已收敛 — runner 通过 blockFindings.length === 0 自行决策

import type { ConvergenceConfig } from '../schema/types.js';
import type { CodexReviewOutput, ForgeFinding, SeverityMap } from './types.js';
import { mapCodexToForge } from './severity-mapper.js';

/**
 * 收敛判断结果。
 * blockFindings = BLOCKER/MAJOR(经 confidence 过滤后);runner 据此判断是否收敛。
 */
export interface ConvergenceResult {
  /** codex session thread id;首轮或 codex 未返回时为 null */
  threadId: string | null;
  /** codex 的原始 verdict */
  verdict: 'approve' | 'needs-attention';
  /** 需阻塞 merge 的 findings(BLOCKER + MAJOR,经 confidence 过滤) */
  blockFindings: ForgeFinding[];
  /** 可忽略的 findings(MINOR + NIT,经 confidence 过滤) */
  ignoreFindings: ForgeFinding[];
  /** 因置信度不足被丢弃的 finding 数量 */
  droppedByConfidence: number;
  /** 是否因 approve + 无 block findings 而短路(跳过 block 逻辑) */
  shortCircuited: boolean;
}

/**
 * 判断单轮 codex review 输出的收敛结果。
 *
 * 步骤:
 * 1. 按 confidence_threshold 过滤 findings
 * 2. 用 severity_map 做 codex → forge 4 级映射
 * 3. 按 block_severity 分入 blockFindings / ignoreFindings
 * 4. 检查是否满足 verdict_approve_short_circuit 条件
 *
 * @param output       codex review 完整输出
 * @param config       收敛配置(来自 NormalizedStageExtensionEntry.convergence)
 * @param severityMap  severity 映射表
 */
export function judgeConvergence(
  output: CodexReviewOutput,
  config: ConvergenceConfig,
  severityMap: SeverityMap,
): ConvergenceResult {
  // 1. 按置信度过滤 findings
  const filtered = output.findings.filter((f) => f.confidence >= config.confidence_threshold);
  const block: ForgeFinding[] = [];
  const ignore: ForgeFinding[] = [];
  const droppedByConfidence = output.findings.length - filtered.length;

  // 2. 映射 severity 并分桶
  for (const f of filtered) {
    const forgeSeverity = mapCodexToForge(f.severity, severityMap);
    const ff: ForgeFinding = { ...f, forge_severity: forgeSeverity };
    if (config.block_severity.includes(forgeSeverity)) {
      block.push(ff);
    } else {
      ignore.push(ff);
    }
  }

  // 3. 检查是否满足短路条件:approve 且无 block findings
  const shortCircuited =
    config.verdict_approve_short_circuit && output.verdict === 'approve' && block.length === 0;

  return {
    threadId: output.thread_id ?? null,
    verdict: output.verdict,
    blockFindings: block,
    ignoreFindings: ignore,
    droppedByConfidence,
    shortCircuited,
  };
}
