// Marker schema 类型校验 — spec §3.4.1

import type { AnyMarker } from '../markers/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';
// plan-9d Task 3 (v12 REG-IMPORT-001 修订):import 9a 三级 severity enum + isSeverity
// 用于 checkVerifyFindingsArray 校验 verify_findings[i].severity(CRITICAL/WARNING/SUGGESTION)
// 现有 local const SEVERITY_VALUES 已 rename → REVIEW_OUTCOME_SEVERITY_CODES 避免重名冲突
import { SEVERITY_VALUES, isSeverity } from '../schemas/severity.js';

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
// finding_hash:裸 64-hex(沿 9a finding-hash.ts:8,不带 sha256: 前缀)
const FINDING_HASH_RE = /^[a-f0-9]{64}$/;
// git commit hash:40 位小写十六进制
const GIT_HEAD_RE = /^[a-f0-9]{40}$/;
// plan-9j Task 1 新增:created_by_tool_version semver 校验
// 沿 archive-summary.ts SEMVER_RE 同模式(major.minor.patch[-prerelease][+build])
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
// actor 合法值
const ACTOR_VALUES = new Set(['ai-agent', 'human-override']);
// review_outcomes.severity 合法值(S/C/L 简码,语义独立于 9a 三级 enum CRITICAL/WARNING/SUGGESTION)
// plan-9d Task 3 (v12 REG-IMPORT-001 修订):rename 自 SEVERITY_VALUES → REVIEW_OUTCOME_SEVERITY_CODES
// v3 BLOCKER 4(plan-9j):union 扩 simcode + 全名(沿 types.ts ReviewOutcome.severity)
const REVIEW_OUTCOME_SEVERITY_CODES = new Set([
  'S',
  'C',
  'L', // v0.4 simcode(老 marker 兼容)
  'CRITICAL',
  'WARNING',
  'SUGGESTION', // v1.0 全名(resign 后或 v1.0 native 写入)
]);
// verify_findings.dimension 合法值(沿 design §2.2.2 三维度)
const DIMENSION_VALUES = new Set(['completeness', 'correctness', 'coherence']);
// plan-9c Task 1 新增:pause_decisions.chosen_option 合法值(1 | 2 | 3 | 4)
const CHOSEN_OPTION_VALUES = new Set([1, 2, 3, 4]);

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
    // plan-9d Task 3 新增:verify_findings 数组校验(可选 superset additive,老 marker 缺等价 [])
    if (obj.verify_findings !== undefined) {
      results.push(checkVerifyFindingsArray(obj.verify_findings, file));
    }
    // plan-9c Task 1 新增 — pause_decisions superset additive
    if (obj.pause_decisions !== undefined) {
      results.push(checkPauseDecisionsArray(obj.pause_decisions, file));
    }
    // plan-9j Task 1 新增:created_by_tool_version 可选 superset additive 字段
    results.push(checkSemverString(obj, 'created_by_tool_version', file));
    // v3 BLOCKER 2 新增:resigned_by_tool_version(沿 v2 选项 C — 区分 created vs resigned)
    results.push(checkSemverString(obj, 'resigned_by_tool_version', file));
  } else if (schema === 'forge-review/v1') {
    results.push(checkTimestamp(obj, 'reviewed_at', file));
    results.push(checkActor(obj, 'reviewed_by', file));
    results.push(checkSha256(obj, 'tasks_hash', file));
    results.push(checkSha256(obj, 'content_hash', file));
    results.push(checkGitInfo(obj.git, file));
    results.push(checkReviewOutcomes(obj.review_outcomes, file));
    // plan-9c Task 1 新增
    if (obj.pause_decisions !== undefined) {
      results.push(checkPauseDecisionsArray(obj.pause_decisions, file));
    }
    // plan-9j Task 1 新增:created_by_tool_version 可选 superset additive 字段
    results.push(checkSemverString(obj, 'created_by_tool_version', file));
    // v3 BLOCKER 2 新增:resigned_by_tool_version(沿 v2 选项 C — 区分 created vs resigned)
    results.push(checkSemverString(obj, 'resigned_by_tool_version', file));
  } else if (schema === 'forge-verify-failed/v1') {
    results.push(checkTimestamp(obj, 'failed_at', file));
    results.push(checkStringArray(obj, 'reasons', file));
    results.push(checkStringArray(obj, 'fake_completions', file));
    results.push(checkStringArray(obj, 'appended_tasks', file));
    // plan-9d Task 3 新增:verify_findings 数组校验(可选 superset)
    if (obj.verify_findings !== undefined) {
      results.push(checkVerifyFindingsArray(obj.verify_findings, file));
    }
    // plan-9c Task 1 新增
    if (obj.pause_decisions !== undefined) {
      results.push(checkPauseDecisionsArray(obj.pause_decisions, file));
    }
    // plan-9j Task 1 新增:created_by_tool_version 可选 superset additive 字段
    results.push(checkSemverString(obj, 'created_by_tool_version', file));
    // v3 BLOCKER 2 新增:resigned_by_tool_version(沿 v2 选项 C — 区分 created vs resigned)
    results.push(checkSemverString(obj, 'resigned_by_tool_version', file));
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
    // plan-9c Task 1 新增
    if (obj.pause_decisions !== undefined) {
      results.push(checkPauseDecisionsArray(obj.pause_decisions, file));
    }
    // plan-9j Task 1 新增:created_by_tool_version 可选 superset additive 字段
    results.push(checkSemverString(obj, 'created_by_tool_version', file));
    // v3 BLOCKER 2 新增:resigned_by_tool_version(沿 v2 选项 C — 区分 created vs resigned)
    results.push(checkSemverString(obj, 'resigned_by_tool_version', file));
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

// plan-9j Task 1 新增:校验 semver 字符串字段(可选字段,缺失等价 <1.0.0)
function checkSemverString(
  obj: Record<string, unknown>,
  field: string,
  file?: string,
): ValidationResult {
  const v = obj[field];
  if (v === undefined) {
    return ok(); // 字段缺失等价老 marker(<1.0.0),superset additive 兼容
  }
  if (typeof v !== 'string' || !SEMVER_RE.test(v)) {
    return failed({
      artifact: 'marker',
      field,
      message: `must be semver string (major.minor.patch[-prerelease][+build]) or omitted (老 marker <1.0.0,沿 design §3.4.1)`,
      file,
    });
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
    // severity 必须是 6 元素之一(v0.4 simcode S/C/L + v1.0 全名 CRITICAL/WARNING/SUGGESTION;沿 plan-9j v3 BLOCKER 4 双格式扩)
    if (typeof o.severity !== 'string' || !REVIEW_OUTCOME_SEVERITY_CODES.has(o.severity)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `review_outcomes[${i}].severity`,
          message:
            'must be one of: S / C / L (v0.4 simcode) or CRITICAL / WARNING / SUGGESTION (v1.0 全名)',
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

// plan-9d Task 3:verify_findings 数组校验
// 校验范围:必填字段存在性 + 类型 + 枚举值(沿 master §3.12.1)
// 不校验业务规则(resolved/ack 矩阵 + finding_hash 与 payload 一致性) — 那是 Task 6 fence 的事
function checkVerifyFindingsArray(v: unknown, file?: string): ValidationResult {
  if (!Array.isArray(v)) {
    return failed({
      artifact: 'marker',
      field: 'verify_findings',
      message: 'must be array',
      file,
    });
  }
  const results: ValidationResult[] = [];
  // v4 D-2 修订:finding id 唯一性校验(同一 marker 内不允许重复 id,沿 master §3.12.1)
  const seenIds = new Set<number>();
  for (let i = 0; i < v.length; i++) {
    const f = v[i] as { id?: unknown };
    if (typeof f?.id === 'number') {
      if (seenIds.has(f.id)) {
        results.push(
          failed({
            artifact: 'marker',
            field: `verify_findings[${i}].id`,
            message: `finding id ${f.id} 重复(同一 marker 内 id 必须唯一,沿 master §3.12.1)`,
            file,
          }),
        );
      }
      seenIds.add(f.id);
    }
  }
  for (let i = 0; i < v.length; i++) {
    const f = v[i] as Record<string, unknown> | null;
    if (!f || typeof f !== 'object') {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}]`,
          message: 'must be object',
          file,
        }),
      );
      continue;
    }
    // 必填 11 字段(沿 master §3.12.1 Finding):
    // id / dimension / check_type / severity / automated / evidence / recommendation / resolved
    // + finding_hash / content_hash / git_head
    if (typeof f.id !== 'number') {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].id`,
          message: 'required number',
          file,
        }),
      );
    }
    if (typeof f.dimension !== 'string' || !DIMENSION_VALUES.has(f.dimension)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].dimension`,
          message: 'must be completeness|correctness|coherence',
          file,
        }),
      );
    }
    if (typeof f.check_type !== 'string' || !f.check_type) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].check_type`,
          message: 'required string',
          file,
        }),
      );
    }
    if (!isSeverity(f.severity)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].severity`,
          message: `must be one of ${[...SEVERITY_VALUES].join(', ')}`,
          file,
        }),
      );
    }
    if (typeof f.automated !== 'boolean') {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].automated`,
          message: 'required boolean',
          file,
        }),
      );
    }
    if (typeof f.evidence !== 'string' || !f.evidence) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].evidence`,
          message: 'required non-empty string',
          file,
        }),
      );
    }
    if (typeof f.recommendation !== 'string' || !f.recommendation) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].recommendation`,
          message: 'required non-empty string',
          file,
        }),
      );
    }
    if (typeof f.resolved !== 'boolean') {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].resolved`,
          message: 'required boolean',
          file,
        }),
      );
    }
    // plan-9d v2 B-1 修订:finding_hash 是裸 64-hex(沿 9a finding-hash.ts:8)
    if (typeof f.finding_hash !== 'string' || !FINDING_HASH_RE.test(f.finding_hash)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].finding_hash`,
          message: 'must match ^[a-f0-9]{64}$ (裸 hex,无 sha256: 前缀,沿 9a)',
          file,
        }),
      );
    }
    // content_hash / git_head 是 FindingHashPayload 字段(沿 9a;content_hash sha256: 前缀,git_head 裸 40-hex)
    if (typeof f.content_hash !== 'string' || !SHA256_RE.test(f.content_hash)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].content_hash`,
          message: 'must match ^sha256:[a-f0-9]{64}$',
          file,
        }),
      );
    }
    if (typeof f.git_head !== 'string' || !GIT_HEAD_RE.test(f.git_head)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].git_head`,
          message: 'must match ^[a-f0-9]{40}$',
          file,
        }),
      );
    }
  }
  return mergeResults(...results);
}

// plan-9c Task 1:pause_decisions 数组校验
// 校验范围:必填字段 / 类型 / 枚举值 / id 唯一性(沿 master §3.12.1 + design §2.1.5)
// 不校验业务规则(option=3 必须有 non_blocking_rationale 等)— 那是 Task 2 fence 的事
function checkPauseDecisionsArray(v: unknown, file?: string): ValidationResult {
  if (!Array.isArray(v)) {
    return failed({
      artifact: 'marker',
      field: 'pause_decisions',
      message: 'must be array',
      file,
    });
  }
  const results: ValidationResult[] = [];
  // id 唯一性校验(沿 checkVerifyFindingsArray 同模式)
  const seenIds = new Set<number>();
  for (let i = 0; i < v.length; i++) {
    const p = v[i] as { id?: unknown };
    if (typeof p?.id === 'number') {
      if (seenIds.has(p.id)) {
        results.push(
          failed({
            artifact: 'marker',
            field: `pause_decisions[${i}].id`,
            message: `pause_decision id ${p.id} 重复(同一 marker 内 id 必须唯一)`,
            file,
          }),
        );
      }
      seenIds.add(p.id);
    }
  }
  for (let i = 0; i < v.length; i++) {
    const p = v[i] as Record<string, unknown> | null;
    if (!p || typeof p !== 'object') {
      results.push(
        failed({
          artifact: 'marker',
          field: `pause_decisions[${i}]`,
          message: 'must be object',
          file,
        }),
      );
      continue;
    }
    const fieldBase = `pause_decisions[${i}]`;
    // 必填 8 字段(沿 design §2.1.5,v3 codex NIT 11 修订:7 → 8):id / paused_at / task_ref / issue_summary / severity / chosen_option / target_artifact / target_anchor
    if (typeof p.id !== 'number') {
      results.push(
        failed({ artifact: 'marker', field: `${fieldBase}.id`, message: 'required number', file }),
      );
    }
    if (typeof p.paused_at !== 'string' || !ISO_8601_RE.test(p.paused_at)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.paused_at`,
          message: 'must be ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ)',
          file,
        }),
      );
    }
    if (typeof p.task_ref !== 'string' || !p.task_ref) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.task_ref`,
          message: 'required string (e.g., tasks.md#task-3)',
          file,
        }),
      );
    }
    if (typeof p.issue_summary !== 'string' || !p.issue_summary) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.issue_summary`,
          message: 'required non-empty string',
          file,
        }),
      );
    }
    if (!isSeverity(p.severity)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.severity`,
          message: `must be one of ${[...SEVERITY_VALUES].join(', ')}`,
          file,
        }),
      );
    }
    if (typeof p.chosen_option !== 'number' || !CHOSEN_OPTION_VALUES.has(p.chosen_option)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.chosen_option`,
          message: 'must be number in {1, 2, 3, 4}',
          file,
        }),
      );
    }
    if (typeof p.target_artifact !== 'string' || !p.target_artifact) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.target_artifact`,
          message: 'required string (e.g., proposal.md / tasks.md / design.md)',
          file,
        }),
      );
    }
    if (typeof p.target_anchor !== 'string' || !p.target_anchor) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.target_anchor`,
          message: 'required string (e.g., "## Out of Scope")',
          file,
        }),
      );
    }
    // severity_acked_by / severity_acked_at 类型校验(null 或 string)
    if (
      p.severity_acked_by !== null &&
      (typeof p.severity_acked_by !== 'string' || !p.severity_acked_by)
    ) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.severity_acked_by`,
          message: 'must be null or non-empty string',
          file,
        }),
      );
    }
    if (p.severity_acked_at !== null) {
      if (typeof p.severity_acked_at !== 'string' || !ISO_8601_RE.test(p.severity_acked_at)) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.severity_acked_at`,
            message: 'must be null or ISO 8601 UTC',
            file,
          }),
        );
      }
    }
    // non_blocking_rationale / other_rationale / other_acked_by 类型校验(null 或 string;业务规则在 fence)
    for (const field of ['non_blocking_rationale', 'other_rationale', 'other_acked_by']) {
      const val = p[field];
      if (val !== null && (typeof val !== 'string' || !val)) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.${field}`,
            message: 'must be null or non-empty string',
            file,
          }),
        );
      }
    }
  }
  return mergeResults(...results);
}

// 为方便外部使用,重新导出 AnyMarker 类型(从 markers 模块)
export type { AnyMarker };
