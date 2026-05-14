// candidate-validators.ts: Task 7(plan-9a §8) — 6 类 candidate_type 验证框架(stub 骨架)
// 本 plan 全部 stub 返回 not_implemented;后续计划:
//   - 9d 实施 test_failure / hash_mismatch
//   - 9g 实施 evidence_missing / coverage_gap
//   - 9j 实施 api_contract / manual_claim

import type { CandidateType, Finding } from '../schemas/severity.js';

/** 单个 candidate 验证结果 */
export interface CandidateValidationResult {
  verified: boolean;
  reason: string;
}

/**
 * 单个 candidate validator 签名
 * 后续 9d/9g/9j 各自实现具体 candidate_type 的验证逻辑
 */
export type CandidateValidator = (finding: Finding) => Promise<CandidateValidationResult>;

/** 统一 stub 返回值:本 plan 期内全部 candidate 路径均返回此值 */
const NOT_IMPLEMENTED: CandidateValidationResult = {
  verified: false,
  reason: 'not_implemented',
};

/**
 * 6 类 candidate_type → validator 注册表
 * 键顺序遵循 CandidateType 定义顺序(test_failure 排首位)
 */
export const CANDIDATE_VALIDATORS: Record<CandidateType, CandidateValidator> = {
  // 9d 实施:测试失败类 candidate 验证
  test_failure: async () => NOT_IMPLEMENTED,
  // 9d 实施:hash 不匹配类 candidate 验证
  hash_mismatch: async () => NOT_IMPLEMENTED,
  // 9g 实施:evidence 缺失类 candidate 验证
  evidence_missing: async () => NOT_IMPLEMENTED,
  // 9g 实施:覆盖率缺口类 candidate 验证
  coverage_gap: async () => NOT_IMPLEMENTED,
  // 9j 实施:API 契约类 candidate 验证
  api_contract: async () => NOT_IMPLEMENTED,
  // 9j 实施:手动声明类 candidate 验证
  manual_claim: async () => NOT_IMPLEMENTED,
};

/**
 * 顶层入口:检查 finding 是否为 CRITICAL candidate,并分发到对应的 stub validator
 * 非 candidate finding(severity_candidate 未设置)直接返回 verified:true
 */
export async function validateCandidate(finding: Finding): Promise<CandidateValidationResult> {
  if (finding.severity_candidate !== 'CRITICAL') {
    // 非 candidate finding 直接通过(本框架仅处理升级到 CRITICAL 的候选)
    return { verified: true, reason: 'not-a-candidate' };
  }
  if (!finding.candidate_type) {
    // severity_candidate=CRITICAL 但缺少 candidate_type,数据异常
    return { verified: false, reason: 'missing-candidate_type' };
  }
  // 根据 candidate_type 分发到对应的 stub validator
  const validator = CANDIDATE_VALIDATORS[finding.candidate_type];
  return validator(finding);
}
