// severity.ts:§3.12.1 Interface Freeze 共享字段 single source of truth
// 后续 sub-plan(9c/9d/9e/9g/9j 等)reference 此处,不重定义

/** 三级分级(沿 design §2.3.2) */
export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
export const SEVERITY_VALUES: readonly Severity[] = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;

export function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (SEVERITY_VALUES as readonly string[]).includes(v);
}

/** candidate_type 6 类(沿 design §2.3.3 A,9a 立 enum,9g/9j/9d 各自实现具体验证算法) */
export type CandidateType =
  | 'test_failure'
  | 'hash_mismatch'
  | 'evidence_missing'
  | 'coverage_gap'
  | 'api_contract'
  | 'manual_claim';
export const CANDIDATE_TYPE_VALUES: readonly CandidateType[] = [
  'test_failure',
  'hash_mismatch',
  'evidence_missing',
  'coverage_gap',
  'api_contract',
  'manual_claim',
] as const;

export function isCandidateType(v: unknown): v is CandidateType {
  return typeof v === 'string' && (CANDIDATE_TYPE_VALUES as readonly string[]).includes(v);
}

/** evidence 5 类格式(沿 design §2.3.3 D)— prefix 形式 */
export const EVIDENCE_FORMATS = [
  'file:line',
  'artifact:section',
  'change-level',
  'command-output',
  'tests:scenario',
] as const;
export type EvidenceFormat = (typeof EVIDENCE_FORMATS)[number];

/**
 * Finding hash payload 字段集 — 8 个稳定字段(沿 design §2.3.6)
 * 注意:resolved / ack 字段不在本接口内(它们不进 hash payload)
 *
 * plan-9b v3 B1 修订:移除 validate_run_id
 * 原因:validate_run_id 是每次调用的瞬态 crypto.randomUUID(),
 * 若进入 hash payload 则 finding_hash 每次 validate 都变化,
 * 破坏 finding 去重与持久 ack 的设计意图。
 * validate_run_id 改为 Finding-level optional metadata(不入 hash)。
 */
export interface FindingHashPayload {
  content_hash: string;
  git_head: string;
  dimension: 'completeness' | 'correctness' | 'coherence';
  check_type: string;
  severity: Severity;
  automated: boolean;
  evidence: string;
  recommendation: string;
}

/**
 * 完整 Finding 字段(含 ack / resolved / candidate 等可变字段)
 * 用于 marker schema reference,不进 hash payload
 */
export interface Finding extends FindingHashPayload {
  id: number;
  resolved: boolean;
  finding_hash: string; // SHA256 of canonicalize(FindingHashPayload)
  /** 瞬态元数据 — 本次 validate 调用 ID;不进 hash payload(v3 B1 修订) */
  validate_run_id?: string;
  severity_candidate?: 'CRITICAL';
  candidate_type?: CandidateType;
  severity_candidate_rejected?: boolean;
  candidate_rejected_reason?: string;
  severity_acked_by?: string;
  severity_acked_at?: string;
  downgraded_from?: Severity;
  downgraded_to?: Severity;
  downgrade_acked_by?: string;
  downgrade_rationale?: string;
}
