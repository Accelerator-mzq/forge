// src/core/archive/three-level-fence.ts — plan-9e1 Task 4(v2 BLOCKER 3 + MINOR 1 重构)
// 9e1 三级业务行为 fence:
//
// 设计定位(v2 MINOR 1 重构):
//   - **verify_findings 端**:仅 CRITICAL sanity 兜底(9d verify-findings-fence step 3.6 已拦
//     CRITICAL+resolved=false 与 WARNING+!ack;9e1 此处只保 CRITICAL 双重保险,WARNING/SUGGESTION
//     由 9d 单源,不重复)
//   - **review_outcomes 端**:核心 — 简码 S/C/L 三分支裁决(沿 design §2.4.2 表 + §2.3.5 简码迁移)
//     - S(CRITICAL 简码)+ resolved=false → 拒签
//     - C(clarification)+ resolved=false → 拒签 + **提示 `forge upgrade --resign-markers`**
//       (沿 design §2.3.5 line 559:C 不自动映射,必须人工迁移)
//     - L(SUGGESTION)+ resolved=false → 通过(handoff to backlog)
//
// 沿 verify-findings-fence.ts / pause-decisions-fence.ts 模块化模式
// 与 verify-findings-fence 的区别:本 fence **不重算 finding_hash**(verify-findings-fence 已校验),
//   只做"业务行为"裁决

import type { Finding } from '../schemas/severity.js';
import { type ValidationResult, failed, mergeResults } from '../validate/types.js';

/** review_outcomes 子集类型(沿 marker types.ReviewOutcome — v3 BLOCKER 4 plan-9j:扩全名双格式) */
interface ReviewOutcome {
  severity: 'S' | 'C' | 'L' | 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  accepted: boolean;
  resolved: boolean;
  task_ref?: string;
  rationale?: string;
}

/**
 * 三级业务行为 fence(v2 BLOCKER 3 + MINOR 1 重构)
 * @param verifyMarker .verify-passed marker(Record 形)— 读 verify_findings 字段
 * @param reviewMarker .review-passed marker(Record 形)— 读 review_outcomes 字段
 * @param verifyFile 可选错误报告用 .verify-passed 路径
 * @param reviewFile 可选错误报告用 .review-passed 路径
 */
export function validateThreeLevelFence(
  verifyMarker: Record<string, unknown>,
  reviewMarker: Record<string, unknown>,
  verifyFile?: string,
  reviewFile?: string,
): ValidationResult {
  const results: ValidationResult[] = [];

  // 1. verify_findings 端:**仅 CRITICAL sanity 兜底**(v2 MINOR 1:WARNING/SUGGESTION 由 9d 单源)
  const findings = Array.isArray(verifyMarker.verify_findings)
    ? (verifyMarker.verify_findings as Finding[])
    : [];
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i] as Finding;
    if (f.severity === 'CRITICAL' && f.resolved === false) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].resolved`,
          message: `[9e1 sanity 兜底] CRITICAL finding 未 resolve;正常应被 9d verify-findings-fence step 3.6 拦截,此处兜底拒签(沿 design §2.4.2 CRITICAL 行)`,
          file: verifyFile,
        }),
      );
    }
    // v2 MINOR 1:WARNING + resolved=false + !ack 由 9d verify-findings-fence step 3.6 拦,本 fence 不重复
    // SUGGESTION + resolved=false 由 9e1 builder 进 pending_suggestions 持挂,本 fence 不拦
  }

  // 2. review_outcomes 端:**核心** — **v6 plan-9j 修订:simcode + 全名双格式裁决**
  // 沿 summary-builder.ts:70-72 同 Array.isArray guard 模式(非 array 严格视为空数组,不接受 falsy 误读)
  const outcomes: Array<Record<string, unknown>> = Array.isArray(reviewMarker.review_outcomes)
    ? (reviewMarker.review_outcomes as Array<Record<string, unknown>>)
    : [];

  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i] as unknown as ReviewOutcome;
    const sev = o.severity;
    const fieldBase = `review_outcomes[${i}]`;

    // CRITICAL/S(同义)— 拒签
    if ((sev === 'S' || sev === 'CRITICAL') && !o.resolved) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.severity`,
          message: `${sev}(${sev === 'S' ? 'CRITICAL 简码' : 'CRITICAL 全名'})未 resolve,archive 拒签(沿 design §2.4.2 + plan-9j v3 BLOCKER 4 双格式)`,
          file: reviewFile,
        }),
      );
      continue;
    }

    // C 简码 — 硬墙拒签(沿 plan-9e1 v4 BLOCKER 1)
    if (sev === 'C') {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.severity`,
          message:
            `review_outcomes C(clarification 简码,resolved=${String(o.resolved)})不允许 archive。\n` +
            `  必须等 plan-9j 完成跑 \`forge upgrade --resign-markers\` 迁移(沿 design §2.3.5)。\n` +
            `  9e1 fence 是硬墙 — 不接受手动编辑 marker(违反 AI 反向加固 + ReviewOutcome 接口不接受全名 + ack-log 协议)。`,
          file: reviewFile,
        }),
      );
      continue;
    }

    // WARNING 全名 — 必须 acked(简码 v0.4 无 WARNING 简码 — 仅 v1.0 全名;沿 design §2.3.5)
    if (sev === 'WARNING' && !o.resolved) {
      const acked =
        o.accepted === true && typeof o.rationale === 'string' && o.rationale.length > 0;
      if (!acked) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.accepted`,
            message: `review_outcomes WARNING(v1.0 全名)未 resolve + 缺 acked(需 accepted=true + rationale 非空)`,
            file: reviewFile,
          }),
        );
      }
      continue;
    }

    // L/SUGGESTION(同义)+ resolved=false → 通过(handoff to backlog)
    // 全 resolved=true → 通过(无 fence 动作)
  }

  return mergeResults(...results);
}
