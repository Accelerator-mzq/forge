// Marker schema 类型校验 — v4 OpenSpec alignment 简版(plan-v4 Phase 1 Task 1.3)
//
// v4 BREAKING change:
// - 删 KNOWN_SCHEMAS 中 v1 schema + verify-failed/review-failed
// - 改 ISO_8601_RE 允许 ms 精度(V-1 修复)
// - 删 process_evidence / ack_log_* / verify_findings 复杂校验
// - 简化 PauseDecision schema 校验为 PauseDecisionSimple(5 字段)

import type { AnyMarker } from '../markers/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

// 已知合法的 schema 名称(v4 BREAKING:v2)
const KNOWN_SCHEMAS = ['forge-verify/v2', 'forge-review/v2'] as const;
type KnownSchema = (typeof KNOWN_SCHEMAS)[number];

// ISO 8601 UTC 格式正则 — v4 允许 ms 精度(沿 V-1 修复:YYYY-MM-DDTHH:MM:SS[.fff]Z)
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
// semver(created_by_tool_version 用)
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;

/**
 * validateMarkerSchema — 校验 marker 文件的 schema 类型 + 必填字段
 *
 * v4 简版:仅校验
 *   - schema 字段是否在 KNOWN_SCHEMAS 中
 *   - verified_at / reviewed_at ISO 8601 (允许 ms)
 *   - verified_by / reviewed_by 字符串非空
 *   - pause_decisions 数组类型(若存在)+ 内字段类型
 *   - created_by_tool_version semver 格式(若存在)
 *
 * 不再校验:tasks_hash / content_hash / git / process_evidence / ack_log_* / verify_findings
 * (v4 反加固协议砍后这些字段已从 marker 删除)
 */
export function validateMarkerSchema(obj: unknown, file?: string): ValidationResult {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return failed({
      artifact: 'marker',
      message: 'marker 文件根必须是 object',
      file,
    });
  }
  const m = obj as Record<string, unknown>;

  // 1. schema 字段必填且合法
  if (typeof m.schema !== 'string') {
    return failed({ artifact: 'marker', field: 'schema', message: 'schema 必须是字符串', file });
  }
  if (!KNOWN_SCHEMAS.includes(m.schema as KnownSchema)) {
    return failed({
      artifact: 'marker',
      field: 'schema',
      message: `schema 必须 ∈ {${KNOWN_SCHEMAS.join(', ')}},实际:${m.schema}`,
      file,
    });
  }

  const results: ValidationResult[] = [];
  const kind = (m.schema as KnownSchema) === 'forge-verify/v2' ? 'verify' : 'review';

  // 2. timestamp 字段(verified_at / reviewed_at)
  const atKey = kind === 'verify' ? 'verified_at' : 'reviewed_at';
  results.push(checkTimestamp(m, atKey, file));

  // 3. by 字段(verified_by / reviewed_by)— v4 不限定 enum,允许任意 string
  const byKey = kind === 'verify' ? 'verified_by' : 'reviewed_by';
  if (typeof m[byKey] !== 'string' || (m[byKey] as string).length === 0) {
    results.push(
      failed({
        artifact: 'marker',
        field: byKey,
        message: `${byKey} 必须是非空字符串`,
        file,
      }),
    );
  }

  // 4. pause_decisions(可选,数组类型 only)
  if (m.pause_decisions !== undefined) {
    results.push(checkPauseDecisionsArray(m.pause_decisions, file));
  }

  // 5. created_by_tool_version(可选,semver 格式)
  if (m.created_by_tool_version !== undefined) {
    if (typeof m.created_by_tool_version !== 'string') {
      results.push(
        failed({
          artifact: 'marker',
          field: 'created_by_tool_version',
          message: 'created_by_tool_version 必须是字符串',
          file,
        }),
      );
    } else if (!SEMVER_RE.test(m.created_by_tool_version)) {
      results.push(
        failed({
          artifact: 'marker',
          field: 'created_by_tool_version',
          message: `created_by_tool_version 必须是 semver(X.Y.Z),实际:${m.created_by_tool_version}`,
          file,
        }),
      );
    }
  }

  return results.length === 0 ? ok() : mergeResults(...results);
}

/** 校验 ISO 8601 UTC 时间戳字段(允许 ms 精度) */
function checkTimestamp(
  obj: Record<string, unknown>,
  field: string,
  file?: string,
): ValidationResult {
  const v = obj[field];
  if (typeof v !== 'string') {
    return failed({
      artifact: 'marker',
      field,
      message: `${field} 必须是字符串`,
      file,
    });
  }
  if (!ISO_8601_RE.test(v)) {
    return failed({
      artifact: 'marker',
      field,
      message: `${field} 必须是 ISO 8601 UTC (YYYY-MM-DDTHH:MM:SS[.fff]Z),实际:${v}`,
      file,
    });
  }
  return ok();
}

/** 校验 pause_decisions 数组(v4 简化版,无 fence 业务校验) */
function checkPauseDecisionsArray(value: unknown, file?: string): ValidationResult {
  if (!Array.isArray(value)) {
    return failed({
      artifact: 'marker',
      field: 'pause_decisions',
      message: 'pause_decisions 必须是数组(若存在)',
      file,
    });
  }
  const results: ValidationResult[] = [];
  for (let i = 0; i < value.length; i++) {
    const p = value[i] as Record<string, unknown>;
    const base = `pause_decisions[${i}]`;
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      results.push(
        failed({ artifact: 'marker', field: base, message: 'pause_decision 必须是 object', file }),
      );
      continue;
    }
    // paused_at
    if (typeof p.paused_at !== 'string' || !ISO_8601_RE.test(p.paused_at)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${base}.paused_at`,
          message: 'paused_at 必须是 ISO 8601 UTC (YYYY-MM-DDTHH:MM:SS[.fff]Z)',
          file,
        }),
      );
    }
    // task_ref / issue_summary 必填 string
    for (const k of ['task_ref', 'issue_summary'] as const) {
      if (typeof p[k] !== 'string' || (p[k] as string).length === 0) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${base}.${k}`,
            message: `${k} 必须是非空字符串`,
            file,
          }),
        );
      }
    }
    // chosen_option ∈ {1, 2, 3, 4}
    if (typeof p.chosen_option !== 'number' || ![1, 2, 3, 4].includes(p.chosen_option)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${base}.chosen_option`,
          message: 'chosen_option 必须 ∈ {1, 2, 3, 4}',
          file,
        }),
      );
    }
    // notes 可选 string
    if (p.notes !== undefined && typeof p.notes !== 'string') {
      results.push(
        failed({
          artifact: 'marker',
          field: `${base}.notes`,
          message: 'notes 必须是字符串(若存在)',
          file,
        }),
      );
    }
  }
  return results.length === 0 ? ok() : mergeResults(...results);
}

// AnyMarker re-export(为下游 import 提供 type)— 沿用 markers/types.ts 的 v4 简版定义
export type { AnyMarker };
