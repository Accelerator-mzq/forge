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

/** review_outcomes 子集类型(沿 marker types.ReviewOutcome) */
interface ReviewOutcome {
  severity: 'S' | 'C' | 'L';
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

  // 2. review_outcomes 端:**核心** — S/C/L 三分支裁决(v2 BLOCKER 3)
  const outcomes = Array.isArray(reviewMarker.review_outcomes)
    ? (reviewMarker.review_outcomes as ReviewOutcome[])
    : [];
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i] as ReviewOutcome;
    const fieldBase = `review_outcomes[${i}]`;
    if (o.severity === 'S' && o.resolved === false) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.resolved`,
          message: `review_outcomes S(CRITICAL 简码)未 resolve(沿 design §2.4.2 + §2.3.5 简码映射);需 resolve 或走 forge upgrade --resign-markers 迁移为全名 CRITICAL`,
          file: reviewFile,
        }),
      );
    } else if (o.severity === 'C') {
      // v3 BLOCKER 1 + v4 BLOCKER 1:C(clarification)**无视** resolved/accepted/rationale 全拒签
      // 沿 design §2.3.5 line 559 + line 563:"C 不自动映射;archive 阶段给 CRITICAL finding,
      //   拒签直到用户走 forge upgrade --resign-markers 处理"
      // 关键语义:resolved=true 仅表示 v0.4 视角已修,但 v1.0 视角 severity 仍是简码 C —
      //   archive_summary.yaml 落地后 v1.1 backlog index 读到 C 简码会语义错乱;
      //   必须经 9j resign 把 C 升级到 WARNING/SUGGESTION 全名后才能 archive
      //
      // v4 BLOCKER 1 修订:**删除** v3 "9j 未完成时手动迁移 marker" 路径 — 三道墙都走不通:
      //   (1) ReviewOutcome 接口 severity: 'S'|'C'|'L' 不接受全名
      //   (2) marker-schema REVIEW_OUTCOME_SEVERITY_CODES 拒签全名
      //   (3) WARNING ack 必须 CLI ack-log,违反 AI 反向加固
      // 9e1 fence 是**硬墙** — 9j 未完成时 archive C 简码 marker 阻塞,必须等 9j 落地
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.severity`,
          message:
            `review_outcomes C(clarification 简码,resolved=${String(o.resolved)})不允许 archive(沿 design §2.3.5 line 559+563:C 不自动映射,必须经 forge upgrade --resign-markers 人工迁移)。\n` +
            `  **必须等 plan-9j marker version + deprecation 完成后**,运行 \`forge upgrade --resign-markers\` 交互式询问每条 C 的目标 severity(WARNING / SUGGESTION)+ 自动 resign marker 字段 + 写 ack-log.jsonl。\n` +
            `  9e1 fence 是硬墙 — 不接受手动编辑 marker(违反 AI 反向加固 + ReviewOutcome 接口不接受全名 + ack-log 协议)。`,
          file: reviewFile,
        }),
      );
    }
    // L(SUGGESTION 简码)+ 未 resolved → 通过(handoff 进 builder collector2 pending_suggestions)
    // S 简码 + resolved=true → 通过(常规 archive)
    // L 简码 + resolved=true → 通过
  }

  return mergeResults(...results);
}
