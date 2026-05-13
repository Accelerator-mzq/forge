// src/core/validate/scope-entries.ts
// plan-9b Task 4 — validateScopeEntries:校验 proposal/design 中 scope 三段 fenced YAML block
// v2 B1 + v3 B1 修订:context 仅含稳定字段,不含 ephemeral runId

import { parseMarkdown } from '../parse/markdown.js';
import { parseFencedYamlBlocks, FencedYamlParseError } from '../parse/fenced-yaml.js';
import {
  ANCHOR_TO_CATEGORY,
  SCOPE_ANCHOR_IDS,
  isScopeCategory,
  isScopeStatus,
  type ScopeAnchorId,
} from '../schemas/scope-entries.js';
import { computeFindingHash } from './finding-hash.js';
import type { FindingHashPayload } from '../schemas/severity.js';
import type { ValidationError } from './types.js';

/** validate 运行时上下文(v2 B1 + v3 B1 修订)— 仅含稳定字段,**不含 ephemeral runId** */
export interface ScopeValidateContext {
  /** computeContentHash(changeDir) 的结果(`sha256:...`) */
  contentHash: string;
  /** git rev-parse HEAD(40-char SHA);非 git → 'no-git-head' */
  gitHead: string;
}

/** validateScopeEntries 返回结果 */
export interface ScopeValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * 校验 markdown text 中所有 scope anchor 段内的 fenced YAML block。
 * 三段 anchor:forge-oos / forge-non-goals / forge-future-work
 * - schema 必须是 'forge-scope-entries/v1'
 * - anchor_id 必须与 enclosing section anchor 一致
 * - entries[] 每项 7 字段校验(id/category/description/reason/status)
 * 全部 error 标 severity: 'CRITICAL' + finding_hash(JCS SHA256 of 8 字段 payload)
 */
export function validateScopeEntries(
  text: string,
  file: string | undefined,
  ctx: ScopeValidateContext,
): ScopeValidationResult {
  const errors: ValidationError[] = [];
  const md = parseMarkdown(text);

  for (const sec of md.sections) {
    // 仅处理带目标 anchor ID 的段
    if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) continue;

    let blocks: unknown[];
    try {
      // 从段 body 中抽取 fenced YAML block
      blocks = parseFencedYamlBlocks(sec.body);
    } catch (err) {
      // YAML 语法错 → CRITICAL finding
      const bi = err instanceof FencedYamlParseError ? err.blockIndex : 0;
      errors.push(
        makeError(
          'yaml-parse',
          `yaml parse failed in block #${bi}: ${(err as Error).message}`,
          file,
          sec.anchor as ScopeAnchorId,
          ctx,
        ),
      );
      continue;
    }
    // 无 yaml block → 跳过(老 change 兼容)
    if (blocks.length === 0) continue;

    const block = blocks[0] as Record<string, unknown>;
    const anchorId = sec.anchor as ScopeAnchorId;

    // 校验 schema 字段
    if (block.schema !== 'forge-scope-entries/v1') {
      errors.push(
        makeError(
          'schema',
          `expected 'forge-scope-entries/v1', got ${JSON.stringify(block.schema)}`,
          file,
          anchorId,
          ctx,
        ),
      );
      continue;
    }

    // 校验 anchor_id 与 enclosing section anchor 一致
    if (block.anchor_id !== anchorId) {
      errors.push(
        makeError(
          'anchor_id',
          `anchor_id ${JSON.stringify(block.anchor_id)} ≠ enclosing section anchor ${anchorId}`,
          file,
          anchorId,
          ctx,
        ),
      );
      continue;
    }

    // 校验 entries 为数组
    const entries = Array.isArray(block.entries) ? block.entries : null;
    if (!entries) {
      errors.push(makeError('entries', `entries must be array`, file, anchorId, ctx));
      continue;
    }

    // 校验每个 entry 的各字段
    const expectedCategory = ANCHOR_TO_CATEGORY[anchorId];
    entries.forEach((e, i) => {
      const entry = e as Record<string, unknown>;
      const pre = `entries[${i}]`;
      // 推送 entry 级 error 的辅助函数
      const push = (subfield: string, msg: string) =>
        errors.push(makeError(`${pre}.${subfield}`, msg, file, anchorId, ctx));

      // id 必须非空 string
      if (typeof entry.id !== 'string' || entry.id.length === 0)
        push('id', `must be non-empty string`);

      // description 必须非空 string
      if (typeof entry.description !== 'string' || entry.description.length === 0)
        push('description', `must be non-empty string`);

      // reason 必须非空 string(必填论证,沿 design §2.6.3)
      if (typeof entry.reason !== 'string' || entry.reason.length === 0)
        push('reason', `must be non-empty string(必填论证,沿 design §2.6.3)`);

      // category 合法性 + 与 anchor_id 默认映射一致性
      if (!isScopeCategory(entry.category))
        push('category', `must be one of out-of-scope|non-goal|future-work`);
      else if (entry.category !== expectedCategory)
        push(
          'category',
          `category ${entry.category} ≠ anchor_id ${anchorId} 默认映射 ${expectedCategory}`,
        );

      // status 合法性
      if (!isScopeStatus(entry.status))
        push('status', `must be one of active|inherited|superseded|completed|obsolete`);
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 构造 ValidationError,附 severity: 'CRITICAL' + finding_hash。
 * finding_hash 绑定真实运行时上下文(v2 B1 + v3 B1 修订:8 字段,无 ephemeral runId)。
 */
function makeError(
  field: string,
  message: string,
  file: string | undefined,
  anchorId: ScopeAnchorId,
  ctx: ScopeValidateContext,
): ValidationError {
  // v2 B1 + v3 B1 修订:**真实**绑定 9a FindingHashPayload 8 字段(去 ephemeral validate_run_id)
  const payload: FindingHashPayload = {
    content_hash: ctx.contentHash,
    git_head: ctx.gitHead,
    dimension: 'correctness',
    check_type: `scope-entries:${anchorId}:${field}`,
    severity: 'CRITICAL',
    automated: true,
    evidence: file ? `file:${file}` : 'change-level',
    recommendation: message,
  };
  return {
    artifact: 'scope',
    field,
    message,
    file,
    severity: 'CRITICAL',
    finding_hash: computeFindingHash(payload),
  };
}
