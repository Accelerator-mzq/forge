// src/core/validate/archive-summary-schema.ts — plan-9e1 Task 1
// validateArchiveSummarySchema:校验 archive_summary 顶级字段
// 不校验业务规则(handoff 三类聚合是否齐全)— 那是 Task 2 builder 与 e2e 的事
// 沿 marker-schema.ts checkXxx helper 同结构

import { type ValidationResult, ok, failed, mergeResults } from './types.js';
import { ARCHIVE_SUMMARY_ISO_8601_RE, SEMVER_RE } from '../schemas/archive-summary.js';

/**
 * 校验 archive_summary 对象的 schema 合法性
 * @param m 已解析的对象
 * @param file 可选错误报告用 archive_summary.yaml 路径
 */
export function validateArchiveSummarySchema(m: unknown, file?: string): ValidationResult {
  if (!m || typeof m !== 'object') {
    return failed({
      artifact: 'change',
      message: 'archive_summary must be a YAML mapping',
      file,
    });
  }
  const obj = m as Record<string, unknown>;
  const results: ValidationResult[] = [];

  // 1. schema literal
  if (obj.schema !== 'forge-archive-summary/v1') {
    results.push(
      failed({
        artifact: 'change',
        field: 'schema',
        message: `schema must be literal 'forge-archive-summary/v1' (got: ${JSON.stringify(obj.schema)})`,
        file,
      }),
    );
  }

  // 2. version semver
  if (typeof obj.version !== 'string' || !SEMVER_RE.test(obj.version)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'version',
        message: 'must be semver string (major.minor.patch)',
        file,
      }),
    );
  }

  // 3. archived_at ISO 8601
  if (typeof obj.archived_at !== 'string' || !ARCHIVE_SUMMARY_ISO_8601_RE.test(obj.archived_at)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'archived_at',
        message: 'must be ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ)',
        file,
      }),
    );
  }

  // 4. change_id 非空 string
  if (typeof obj.change_id !== 'string' || !obj.change_id) {
    results.push(
      failed({
        artifact: 'change',
        field: 'change_id',
        message: 'must be non-empty string',
        file,
      }),
    );
  }

  // 5. verify_passed object
  if (
    !obj.verify_passed ||
    typeof obj.verify_passed !== 'object' ||
    Array.isArray(obj.verify_passed)
  ) {
    results.push(
      failed({
        artifact: 'change',
        field: 'verify_passed',
        message: 'must be object',
        file,
      }),
    );
  }

  // 6. review_passed object
  if (
    !obj.review_passed ||
    typeof obj.review_passed !== 'object' ||
    Array.isArray(obj.review_passed)
  ) {
    results.push(
      failed({
        artifact: 'change',
        field: 'review_passed',
        message: 'must be object',
        file,
      }),
    );
  }

  // 7. process_evidence_summary 必填 object(9e1 仅 placeholder,9e2 接 9g 真实统计;两态都得过 schema)
  if (
    !obj.process_evidence_summary ||
    typeof obj.process_evidence_summary !== 'object' ||
    Array.isArray(obj.process_evidence_summary)
  ) {
    results.push(
      failed({
        artifact: 'change',
        field: 'process_evidence_summary',
        message: 'must be object (9e1 placeholder, 9e2 接 9g 真实统计)',
        file,
      }),
    );
  }

  // 8-10. 三数组字段
  if (!Array.isArray(obj.handoff_to_backlog)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'handoff_to_backlog',
        message: 'must be array',
        file,
      }),
    );
  }
  if (!Array.isArray(obj.acked_warnings)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'acked_warnings',
        message: 'must be array',
        file,
      }),
    );
  }
  if (!Array.isArray(obj.pending_suggestions)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'pending_suggestions',
        message: 'must be array',
        file,
      }),
    );
  }

  return results.length === 0 ? ok() : mergeResults(...results);
}
