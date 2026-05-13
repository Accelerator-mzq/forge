// finding-hash.ts: Task 7(plan-9a §8) — finding_hash 计算辅助模块
// 封装 canonicalHash,为 Finding 提供确定性 SHA256 hash 计算与 payload 提取

import { canonicalHash } from '../canonical-json.js';
import type { FindingHashPayload, Finding } from '../schemas/severity.js';

/**
 * 计算 finding_hash:对 FindingHashPayload 8 字段做 JCS 序列化后 SHA256
 * 输出为 64 字符十六进制字符串
 * plan-9b v3 B1 修订:payload 已移除 validate_run_id,现为 8 个稳定字段
 */
export function computeFindingHash(payload: FindingHashPayload): string {
  return canonicalHash(payload);
}

/**
 * 从完整 Finding 提取 hash payload
 * 剥离 id / resolved / finding_hash / validate_run_id / severity_candidate / candidate_type 等可变字段,
 * 只保留 FindingHashPayload 中定义的 8 个不可变字段(plan-9b v3 B1 修订)
 */
export function extractHashPayload(finding: Finding): FindingHashPayload {
  return {
    content_hash: finding.content_hash,
    git_head: finding.git_head,
    dimension: finding.dimension,
    check_type: finding.check_type,
    severity: finding.severity,
    automated: finding.automated,
    evidence: finding.evidence,
    recommendation: finding.recommendation,
  };
}
