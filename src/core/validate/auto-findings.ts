// src/core/validate/auto-findings.ts — plan-9d Task 4 (v2)
// 把自动可判的 verify-domain candidate 转换为 Finding(含 finding_hash)
// Reference 9a Finding / FindingHashPayload + computeFindingHash;不重定义 hash 算法

import type { FindingHashPayload, Finding } from '../schemas/severity.js';
import { computeFindingHash } from './finding-hash.js';

/**
 * 把 verify-domain 自动 candidate 转换为 Finding。
 * 用于 validateChange 在 specs/tasks/marker 检测出 CRITICAL 时,产带 finding_hash 的输出。
 *
 * 沿 design §2.2.3 + master §3.12.1:8 必填字段 + finding_hash
 * 沿 design §2.3.3 candidate_type:coverage_gap / test_failure 等
 *
 * plan-9d v2 m-2 修订:用独立 nextFindingId 避免 fs/schema error 也算进 finding id,
 * 保持 finding id 是连续 local sequence(1, 2, 3, ...)而非 results.length-based
 */
export interface AutoFindingInput {
  /** finding id — 调用方用 FindingIdSequence 单调递增 */
  id: number;
  dimension: 'completeness' | 'correctness' | 'coherence';
  check_type: string;
  evidence: string;
  recommendation: string;
  /** 运行时 ctx — 来自 validateChange */
  contentHash: string;
  gitHead: string;
}

export function buildAutoCriticalFinding(input: AutoFindingInput): Finding {
  const payload: FindingHashPayload = {
    content_hash: input.contentHash,
    git_head: input.gitHead,
    dimension: input.dimension,
    check_type: input.check_type,
    severity: 'CRITICAL',
    automated: true,
    evidence: input.evidence,
    recommendation: input.recommendation,
  };
  const finding_hash = computeFindingHash(payload);
  return {
    ...payload,
    id: input.id,
    resolved: false,
    finding_hash,
  };
}

/**
 * Finding id 计数器 — validateChange 调用时为每个真实产生的 Finding 单调递增。
 * 不计入 fs/schema 类 ValidationError(沿 v2 m-2 修订)。
 *
 * 用法:
 *   const ids = new FindingIdSequence();
 *   const finding = buildAutoCriticalFinding({ id: ids.next(), ... });
 */
export class FindingIdSequence {
  private current = 0;
  next(): number {
    return ++this.current;
  }
}
