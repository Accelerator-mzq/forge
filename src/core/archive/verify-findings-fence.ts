// src/core/archive/verify-findings-fence.ts — plan-9d Task 6 (v2 模块化)
// 沿 design §2.2.4 fence 三级矩阵:CRITICAL 无 ack 路径(自动/LLM 都拒签)/ WARNING 必须 ack /
// SUGGESTION 通过;finding_hash 重算比对(篡改拒签);downgrade ack 校验

import { extractHashPayload, computeFindingHash } from '../validate/finding-hash.js';
import type { Finding } from '../schemas/severity.js';
import { type ValidationResult, ok, failed, mergeResults } from '../validate/types.js';

/**
 * verify_findings fence 校验(沿 design §2.2.4)
 * - automated=true CRITICAL 不可降级:finding_hash 重算比对
 * - CRITICAL + resolved=false → 拒签(无例外强 fence,无 ack 路径)
 * - WARNING + resolved=false + 无 ack → 拒签
 * - SUGGESTION 通过(允许带 finding archive)
 * - downgrade 路径校验 downgrade_acked_by + downgrade_rationale 非空
 */
export function validateVerifyFindingsFence(
  verifyMarker: Record<string, unknown>,
  file?: string,
): ValidationResult {
  const findings = verifyMarker.verify_findings;
  if (!Array.isArray(findings)) return ok(); // 无 verify_findings 字段(老 marker)→ 跳

  const results: ValidationResult[] = [];
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i] as Finding;
    const fieldBase = `verify_findings[${i}]`;

    // 1. finding_hash 重算比对(篡改任何字段都会让 hash 不一致)
    const payload = extractHashPayload(f);
    const expectedHash = computeFindingHash(payload);
    if (f.finding_hash !== expectedHash) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.finding_hash`,
          message: `finding_hash mismatch: expected ${expectedHash.slice(0, 16)}..., got ${f.finding_hash.slice(0, 16)}...`,
          file,
        }),
      );
      continue; // hash 失败后不再校验其他规则(避免 cascade)
    }

    // 2. 三级 × resolved × ack 矩阵
    if (f.severity === 'CRITICAL' && f.resolved === false) {
      // CRITICAL 无例外强 fence(无 ack 路径,沿 design §2.2.4)
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.resolved`,
          message: f.automated
            ? `automated CRITICAL finding must be resolved (cannot ack-downgrade automated CRITICAL,沿 design §2.2.4)`
            : `CRITICAL finding must be resolved (no ack path for CRITICAL,沿 design §2.2.4)`,
          file,
        }),
      );
    } else if (f.severity === 'WARNING' && f.resolved === false) {
      // WARNING + 未 resolved → 必须 ack(severity_acked_by + severity_acked_at)
      if (!f.severity_acked_by || !f.severity_acked_at) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.severity_acked_by`,
            message: `WARNING + resolved=false 必须有 severity_acked_by + severity_acked_at(沿 design §2.2.4)`,
            file,
          }),
        );
      }
    }
    // SUGGESTION + resolved=false → 通过(允许带 finding archive)

    // 3. downgrade 路径(若 downgraded_from 非空)
    if (f.downgraded_from) {
      if (!f.downgrade_acked_by) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.downgrade_acked_by`,
            message: `downgrade 路径必须有 downgrade_acked_by(沿 design §2.3.3 C)`,
            file,
          }),
        );
      }
      if (!f.downgrade_rationale) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.downgrade_rationale`,
            message: `downgrade 路径必须有 downgrade_rationale(沿 design §2.3.3 C)`,
            file,
          }),
        );
      }
    }
  }

  return mergeResults(...results);
}
