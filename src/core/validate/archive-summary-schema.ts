// src/core/validate/archive-summary-schema.ts — plan-9e1 Task 1
// validateArchiveSummarySchema:校验 archive_summary 顶级字段
// 不校验业务规则(handoff 三类聚合是否齐全)— 那是 Task 2 builder 与 e2e 的事
// 沿 marker-schema.ts checkXxx helper 同结构

import { type ValidationResult, ok, failed, mergeResults } from './types.js';
import { ARCHIVE_SUMMARY_ISO_8601_RE, SEMVER_RE } from '../schemas/archive-summary.js';
// plan-9e2 Task 3:派生 EXPECTED_INVARIANT_COUNT 从 FENCE_INVARIANT_NAMES.length(自动跟随 invariant 数演化)
import { FENCE_INVARIANT_NAMES } from '../archive/fence.js';

/**
 * plan-9e2 v2 codex 一轮 plan review MAJOR 5 修订:模块级派生常量
 * 沿 brainstorm spec §3.5 + DoD 显式要求"派生常量"语义 — 不放函数内 const,模块级单源
 * 后续若 invariant 数演化(plan-v1.1+),本常量自动跟随 FENCE_INVARIANT_NAMES.length
 */
const EXPECTED_INVARIANT_COUNT = FENCE_INVARIANT_NAMES.length;

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

  // plan-9e2 Task 3:placeholder=false 路径严格校验(v2 codex 一轮 MAJOR 修订:4 字段 + sum 不变式)
  if (
    obj.process_evidence_summary &&
    typeof obj.process_evidence_summary === 'object' &&
    !Array.isArray(obj.process_evidence_summary)
  ) {
    const peSummary = obj.process_evidence_summary as Record<string, unknown>;
    if (peSummary.placeholder === false) {
      // EXPECTED_INVARIANT_COUNT 从模块顶层 import(v2 codex 一轮 plan review MAJOR 5 修订)
      const REQUIRED_FIELDS = [
        'invariants_passed',
        'invariants_with_warning',
        'invariants_failed',
        'legacy_exempt',
      ] as const;

      // 1. 4 字段必填 + number
      for (const field of REQUIRED_FIELDS) {
        if (typeof peSummary[field] !== 'number') {
          results.push(
            failed({
              artifact: 'change',
              field: `process_evidence_summary.${field}`,
              message: `required number when placeholder=false`,
              file,
            }),
          );
        }
      }

      // 仅当 4 字段全部为 number 才走值域 + sum 不变式(避免 NaN 干扰)
      if (REQUIRED_FIELDS.every((f) => typeof peSummary[f] === 'number')) {
        // 2. 值域 [0, EXPECTED_INVARIANT_COUNT]
        for (const field of REQUIRED_FIELDS) {
          const v = peSummary[field] as number;
          if (v < 0 || v > EXPECTED_INVARIANT_COUNT) {
            results.push(
              failed({
                artifact: 'change',
                field: `process_evidence_summary.${field}`,
                message: `must be in [0, ${EXPECTED_INVARIANT_COUNT}]`,
                file,
              }),
            );
          }
        }
        // 3. sum 不变式(v2 codex 一轮 MAJOR 修订:4 字段 sum)
        const sum =
          (peSummary.invariants_passed as number) +
          (peSummary.invariants_with_warning as number) +
          (peSummary.invariants_failed as number) +
          (peSummary.legacy_exempt as number);
        if (sum !== EXPECTED_INVARIANT_COUNT) {
          results.push(
            failed({
              artifact: 'change',
              field: 'process_evidence_summary',
              message: `sum invariant: ${sum} !== ${EXPECTED_INVARIANT_COUNT}`,
              file,
            }),
          );
        }
      }
    }
    // placeholder=true 路径不变(9e1 容忍)
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
