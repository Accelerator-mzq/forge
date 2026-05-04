// Marker schema 类型校验 — spec §3.4.1

import type { AnyMarker } from '../markers/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

// 已知合法的 schema 名称
const KNOWN_SCHEMAS = [
  'forge-verify/v1',
  'forge-review/v1',
  'forge-verify-failed/v1',
  'forge-review-failed/v1',
] as const;
type KnownSchema = (typeof KNOWN_SCHEMAS)[number];

// ISO 8601 UTC 格式正则(YYYY-MM-DDTHH:MM:SSZ)
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
// sha256: 前缀 + 64 位小写十六进制
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
// git commit hash:40 位小写十六进制
const GIT_HEAD_RE = /^[a-f0-9]{40}$/;
// actor 合法值
const ACTOR_VALUES = new Set(['ai-agent', 'human-override']);
// review severity 合法值
const SEVERITY_VALUES = new Set(['S', 'C', 'L']);

/**
 * 校验 marker 对象的 schema 合法性。
 * @param m - 已解析的 marker 对象(AnyMarker 或 unknown)
 * @param file - 可选:来源文件路径,用于错误报告
 */
export function validateMarkerSchema(m: unknown, file?: string): ValidationResult {
  if (!m || typeof m !== 'object') {
    return failed({ artifact: 'marker', message: 'marker must be a YAML mapping', file });
  }
  const obj = m as Record<string, unknown>;

  // 1. schema 字段必须是已知值之一
  if (typeof obj.schema !== 'string' || !KNOWN_SCHEMAS.includes(obj.schema as KnownSchema)) {
    return failed({
      artifact: 'marker',
      field: 'schema',
      message: `schema must be one of: ${KNOWN_SCHEMAS.join(', ')}`,
      file,
    });
  }

  const schema = obj.schema as KnownSchema;
  const results: ValidationResult[] = [];

  // 2. 按 schema 类型分支校验各字段
  if (schema === 'forge-verify/v1') {
    results.push(checkTimestamp(obj, 'verified_at', file));
    results.push(checkActor(obj, 'verified_by', file));
    results.push(checkSha256(obj, 'tasks_hash', file));
    results.push(checkSha256(obj, 'content_hash', file));
    results.push(checkEvidenceArray(obj.evidence, file));
  } else if (schema === 'forge-review/v1') {
    results.push(checkTimestamp(obj, 'reviewed_at', file));
    results.push(checkActor(obj, 'reviewed_by', file));
    results.push(checkSha256(obj, 'tasks_hash', file));
    results.push(checkSha256(obj, 'content_hash', file));
    results.push(checkGitInfo(obj.git, file));
    results.push(checkReviewOutcomes(obj.review_outcomes, file));
  } else if (schema === 'forge-verify-failed/v1') {
    results.push(checkTimestamp(obj, 'failed_at', file));
    results.push(checkStringArray(obj, 'reasons', file));
    results.push(checkStringArray(obj, 'fake_completions', file));
    results.push(checkStringArray(obj, 'appended_tasks', file));
  } else if (schema === 'forge-review-failed/v1') {
    results.push(checkTimestamp(obj, 'failed_at', file));
    if (!Array.isArray(obj.unresolved_outcomes)) {
      results.push(
        failed({
          artifact: 'marker',
          field: 'unresolved_outcomes',
          message: 'must be array',
          file,
        }),
      );
    }
    results.push(checkStringArray(obj, 'appended_tasks', file));
  }

  return mergeResults(...results);
}

// 校验 ISO 8601 UTC 时间戳字段
function checkTimestamp(
  obj: Record<string, unknown>,
  field: string,
  file?: string,
): ValidationResult {
  const v = obj[field];
  if (typeof v !== 'string' || !ISO_8601_RE.test(v)) {
    return failed({
      artifact: 'marker',
      field,
      message: 'must be ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ)',
      file,
    });
  }
  return ok();
}

// 校验 actor 字段(ai-agent 或 human-override)
function checkActor(obj: Record<string, unknown>, field: string, file?: string): ValidationResult {
  const v = obj[field];
  if (typeof v !== 'string' || !ACTOR_VALUES.has(v)) {
    return failed({
      artifact: 'marker',
      field,
      message: 'must be "ai-agent" or "human-override"',
      file,
    });
  }
  return ok();
}

// 校验 sha256: 前缀的哈希字段
function checkSha256(obj: Record<string, unknown>, field: string, file?: string): ValidationResult {
  const v = obj[field];
  if (typeof v !== 'string' || !SHA256_RE.test(v)) {
    return failed({ artifact: 'marker', field, message: 'must match ^sha256:[a-f0-9]{64}$', file });
  }
  return ok();
}

// 校验字符串数组字段
function checkStringArray(
  obj: Record<string, unknown>,
  field: string,
  file?: string,
): ValidationResult {
  const v = obj[field];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    return failed({ artifact: 'marker', field, message: 'must be array of strings', file });
  }
  return ok();
}

// 校验 evidence 数组(每项含 6 个必需字段)
function checkEvidenceArray(v: unknown, file?: string): ValidationResult {
  if (!Array.isArray(v)) {
    return failed({ artifact: 'marker', field: 'evidence', message: 'must be array', file });
  }
  const results: ValidationResult[] = [];
  for (let i = 0; i < v.length; i++) {
    const e = v[i] as Record<string, unknown> | null;
    if (!e || typeof e !== 'object') {
      results.push(
        failed({ artifact: 'marker', field: `evidence[${i}]`, message: 'must be object', file }),
      );
      continue;
    }
    if (typeof e.scenario_id !== 'string' || !e.scenario_id) {
      results.push(
        failed({
          artifact: 'marker',
          field: `evidence[${i}].scenario_id`,
          message: 'required string',
          file,
        }),
      );
    }
    if (typeof e.test_command !== 'string') {
      results.push(
        failed({
          artifact: 'marker',
          field: `evidence[${i}].test_command`,
          message: 'required string',
          file,
        }),
      );
    }
    if (typeof e.test_file !== 'string') {
      results.push(
        failed({
          artifact: 'marker',
          field: `evidence[${i}].test_file`,
          message: 'required string',
          file,
        }),
      );
    }
    // log_path 必须以 ./ 开头
    if (typeof e.log_path !== 'string' || !e.log_path.startsWith('./')) {
      results.push(
        failed({
          artifact: 'marker',
          field: `evidence[${i}].log_path`,
          message: 'must start with "./"',
          file,
        }),
      );
    }
    if (typeof e.log_hash !== 'string' || !SHA256_RE.test(e.log_hash)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `evidence[${i}].log_hash`,
          message: 'must match sha256 regex',
          file,
        }),
      );
    }
    if (typeof e.pass !== 'boolean') {
      results.push(
        failed({
          artifact: 'marker',
          field: `evidence[${i}].pass`,
          message: 'required boolean',
          file,
        }),
      );
    }
  }
  return mergeResults(...results);
}

// 校验 git 信息对象
function checkGitInfo(v: unknown, file?: string): ValidationResult {
  if (!v || typeof v !== 'object') {
    return failed({ artifact: 'marker', field: 'git', message: 'must be object', file });
  }
  const g = v as Record<string, unknown>;
  if (typeof g.is_git_repo !== 'boolean') {
    return failed({
      artifact: 'marker',
      field: 'git.is_git_repo',
      message: 'required boolean',
      file,
    });
  }
  // is_git_repo=true 时还需校验 head/diff_hash/diff_pathspec
  if (g.is_git_repo) {
    if (typeof g.head !== 'string' || !GIT_HEAD_RE.test(g.head)) {
      return failed({
        artifact: 'marker',
        field: 'git.head',
        message: 'must match ^[a-f0-9]{40}$',
        file,
      });
    }
    if (typeof g.diff_hash !== 'string' || !SHA256_RE.test(g.diff_hash)) {
      return failed({
        artifact: 'marker',
        field: 'git.diff_hash',
        message: 'must match sha256',
        file,
      });
    }
    if (!g.diff_pathspec || typeof g.diff_pathspec !== 'object') {
      return failed({
        artifact: 'marker',
        field: 'git.diff_pathspec',
        message: 'required object',
        file,
      });
    }
    // git.diff_pathspec.include / exclude 必须是 string array(spec §3.4.1)
    const ps = g.diff_pathspec as Record<string, unknown>;
    if (!Array.isArray(ps.include) || !ps.include.every((x) => typeof x === 'string')) {
      return failed({
        artifact: 'marker',
        field: 'git.diff_pathspec.include',
        message: 'must be array of strings',
        file,
      });
    }
    if (!Array.isArray(ps.exclude) || !ps.exclude.every((x) => typeof x === 'string')) {
      return failed({
        artifact: 'marker',
        field: 'git.diff_pathspec.exclude',
        message: 'must be array of strings',
        file,
      });
    }
  }
  return ok();
}

// 校验 review_outcomes 数组
function checkReviewOutcomes(v: unknown, file?: string): ValidationResult {
  if (!Array.isArray(v)) {
    return failed({ artifact: 'marker', field: 'review_outcomes', message: 'must be array', file });
  }
  const results: ValidationResult[] = [];
  for (let i = 0; i < v.length; i++) {
    const o = v[i] as Record<string, unknown> | null;
    if (!o || typeof o !== 'object') {
      results.push(
        failed({
          artifact: 'marker',
          field: `review_outcomes[${i}]`,
          message: 'must be object',
          file,
        }),
      );
      continue;
    }
    // severity 必须是 S/C/L 之一
    if (typeof o.severity !== 'string' || !SEVERITY_VALUES.has(o.severity)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `review_outcomes[${i}].severity`,
          message: 'must be S/C/L',
          file,
        }),
      );
    }
    if (typeof o.accepted !== 'boolean') {
      results.push(
        failed({
          artifact: 'marker',
          field: `review_outcomes[${i}].accepted`,
          message: 'required boolean',
          file,
        }),
      );
    }
    if (typeof o.resolved !== 'boolean') {
      results.push(
        failed({
          artifact: 'marker',
          field: `review_outcomes[${i}].resolved`,
          message: 'required boolean',
          file,
        }),
      );
    }
    // accepted=true 必须有 task_ref;accepted=false 必须有 rationale
    if (o.accepted === true && (typeof o.task_ref !== 'string' || !o.task_ref)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `review_outcomes[${i}].task_ref`,
          message: 'required when accepted=true',
          file,
        }),
      );
    }
    if (o.accepted === false && (typeof o.rationale !== 'string' || !o.rationale)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `review_outcomes[${i}].rationale`,
          message: 'required when accepted=false',
          file,
        }),
      );
    }
  }
  return mergeResults(...results);
}

// 为方便外部使用,重新导出 AnyMarker 类型(从 markers 模块)
export type { AnyMarker };
