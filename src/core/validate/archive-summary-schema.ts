// src/core/validate/archive-summary-schema.ts — v4 OpenSpec alignment 简版(plan-v4 Phase 1 Task 1.4)
//
// v4 BREAKING:
// - schema literal: forge-archive-summary/v1 → v2
// - 删 process_evidence_summary / acked_warnings / pending_suggestions 必填校验
// - 简化 handoff_to_backlog source 枚举(仅 pause_decisions / scope_entries)
// - 删 FENCE_INVARIANT_NAMES 依赖(archive fence 砍后无 14 不变量)
// - ISO 8601 允许 ms 精度(V-1 修复)
// - 加 spec_updates_applied forge operation 风格校验

import { type ValidationResult, ok, failed, mergeResults } from './types.js';
import { ARCHIVE_SUMMARY_ISO_8601_RE, SEMVER_RE } from '../schemas/archive-summary.js';

/**
 * 校验 archive_summary v2 对象的 schema 合法性
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
  if (obj.schema !== 'forge-archive-summary/v2') {
    results.push(
      failed({
        artifact: 'change',
        field: 'schema',
        message: `schema must be literal 'forge-archive-summary/v2' (got: ${JSON.stringify(obj.schema)})`,
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
        message: 'version must be semver (X.Y.Z)',
        file,
      }),
    );
  }

  // 3. archived_at ISO 8601(允许 ms)
  if (typeof obj.archived_at !== 'string' || !ARCHIVE_SUMMARY_ISO_8601_RE.test(obj.archived_at)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'archived_at',
        message: 'must be ISO 8601 UTC (YYYY-MM-DDTHH:MM:SS[.fff]Z)',
        file,
      }),
    );
  }

  // 4. change_id / archive_name / verified_by / reviewed_by 必填非空 string
  for (const k of ['change_id', 'archive_name', 'verified_by', 'reviewed_by'] as const) {
    if (typeof obj[k] !== 'string' || (obj[k] as string).length === 0) {
      results.push(
        failed({
          artifact: 'change',
          field: k,
          message: `${k} must be non-empty string`,
          file,
        }),
      );
    }
  }

  // 5. applied_commits 可选,若存在必须 string[]
  if (obj.applied_commits !== undefined) {
    if (!Array.isArray(obj.applied_commits)) {
      results.push(
        failed({
          artifact: 'change',
          field: 'applied_commits',
          message: 'applied_commits must be array if present',
          file,
        }),
      );
    } else {
      for (let i = 0; i < obj.applied_commits.length; i++) {
        if (typeof obj.applied_commits[i] !== 'string') {
          results.push(
            failed({
              artifact: 'change',
              field: `applied_commits[${i}]`,
              message: 'applied_commits item must be string',
              file,
            }),
          );
        }
      }
    }
  }

  // 6. spec_updates_applied 必填数组(可空)
  if (!Array.isArray(obj.spec_updates_applied)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'spec_updates_applied',
        message: 'spec_updates_applied must be array',
        file,
      }),
    );
  } else {
    const ALLOWED_OPS = ['create', 'replace', 'delete'];
    for (let i = 0; i < obj.spec_updates_applied.length; i++) {
      const u = obj.spec_updates_applied[i] as Record<string, unknown>;
      if (!u || typeof u !== 'object') {
        results.push(
          failed({
            artifact: 'change',
            field: `spec_updates_applied[${i}]`,
            message: 'must be object',
            file,
          }),
        );
        continue;
      }
      if (typeof u.capability !== 'string' || u.capability.length === 0) {
        results.push(
          failed({
            artifact: 'change',
            field: `spec_updates_applied[${i}].capability`,
            message: 'capability must be non-empty string',
            file,
          }),
        );
      }
      if (typeof u.operation !== 'string' || !ALLOWED_OPS.includes(u.operation)) {
        results.push(
          failed({
            artifact: 'change',
            field: `spec_updates_applied[${i}].operation`,
            message: `operation must ∈ {${ALLOWED_OPS.join(', ')}}`,
            file,
          }),
        );
      }
    }
  }

  // 7. handoff_to_backlog 必填数组(可空)
  if (!Array.isArray(obj.handoff_to_backlog)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'handoff_to_backlog',
        message: 'handoff_to_backlog must be array',
        file,
      }),
    );
  } else {
    const ALLOWED_SOURCES = ['pause_decisions', 'scope_entries'];
    for (let i = 0; i < obj.handoff_to_backlog.length; i++) {
      const h = obj.handoff_to_backlog[i] as Record<string, unknown>;
      if (!h || typeof h !== 'object') {
        results.push(
          failed({
            artifact: 'change',
            field: `handoff_to_backlog[${i}]`,
            message: 'must be object',
            file,
          }),
        );
        continue;
      }
      if (typeof h.source !== 'string' || !ALLOWED_SOURCES.includes(h.source)) {
        results.push(
          failed({
            artifact: 'change',
            field: `handoff_to_backlog[${i}].source`,
            message: `source must ∈ {${ALLOWED_SOURCES.join(', ')}}`,
            file,
          }),
        );
      }
    }
  }

  return results.length === 0 ? ok() : mergeResults(...results);
}
