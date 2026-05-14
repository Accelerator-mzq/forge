// src/core/archive/summary-builder.ts — plan-9e1 Task 2
// buildArchiveSummary:从 markers + change 目录构造 ArchiveSummary
// 三 collector:
//   collectAckedWarnings — verify_findings + review_outcomes 中 WARNING + resolved=false + 有 ack
//   collectPendingSuggestions — verify_findings + review_outcomes 中 SUGGESTION + resolved=false
//   collectHandoffEntries — 三类 input 聚合(verify/review SUGGESTION 持挂 + pause_decisions option=3 + scope-entries active)

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding } from '../schemas/severity.js';
import type { PauseDecision } from '../markers/types.js';
import type {
  ArchiveSummary,
  HandoffEntry,
  AckedWarningRef,
  SuggestionRef,
  ProcessEvidenceSummary,
} from '../schemas/archive-summary.js';
import { ARCHIVE_SUMMARY_VERSION } from '../schemas/archive-summary.js';
// plan-9e2 Task 2:接 plan-9g fence 真实统计;PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY 常量已移至 schema 文件供测试 fixture 使用
import type { FenceCheckResult } from './fence.js';
import { parseMarkdown } from '../parse/markdown.js';
import { parseFencedYamlBlocks } from '../parse/fenced-yaml.js';
import { SCOPE_ANCHOR_IDS, type ScopeAnchorId, type ScopeEntry } from '../schemas/scope-entries.js';

/** review_outcomes 单项最小子集(沿 marker types.ReviewOutcome — v3 BLOCKER 4 plan-9j:扩全名双格式) */
interface ReviewOutcome {
  severity: 'S' | 'C' | 'L' | 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  accepted: boolean;
  resolved: boolean;
  task_ref?: string;
  rationale?: string;
}

/** 选项:archive 时刻(测试可注入,生产用 new Date()) */
export interface BuildArchiveSummaryOptions {
  /** archived_at 时刻(沿 archive transaction 调用方计算,默认 new Date().toISOString()) */
  archivedAt?: string;
}

/**
 * 构造 archive_summary 对象
 *
 * @param verifyMarker .verify-passed 解析后对象(Record 形)
 * @param reviewMarker .review-passed 解析后对象(Record 形)
 * @param changeDir change 目录绝对路径(读 proposal.md / design.md 抽 scope-entries)
 * @param changeId change id 字符串
 * @param fenceResult plan-9g crossCuttingFenceCheck() 输出;9e2 接真实统计(替换 plan-9e1 placeholder)
 * @param opts 可选项
 */
export async function buildArchiveSummary(
  verifyMarker: Record<string, unknown>,
  reviewMarker: Record<string, unknown>,
  changeDir: string,
  changeId: string,
  fenceResult: FenceCheckResult,
  opts: BuildArchiveSummaryOptions = {},
): Promise<ArchiveSummary> {
  const archivedAt = opts.archivedAt ?? toIso8601(new Date());

  const verifyFindings: Finding[] = Array.isArray(verifyMarker.verify_findings)
    ? (verifyMarker.verify_findings as Finding[])
    : [];
  const pauseDecisions: PauseDecision[] = Array.isArray(verifyMarker.pause_decisions)
    ? (verifyMarker.pause_decisions as PauseDecision[])
    : [];
  // review marker 也可能携带 pause_decisions(沿 9c superset additive 镜像)
  const reviewPauseDecisions: PauseDecision[] = Array.isArray(reviewMarker.pause_decisions)
    ? (reviewMarker.pause_decisions as PauseDecision[])
    : [];
  const reviewOutcomes: ReviewOutcome[] = Array.isArray(reviewMarker.review_outcomes)
    ? (reviewMarker.review_outcomes as ReviewOutcome[])
    : [];

  const acked_warnings = collectAckedWarnings(verifyFindings, reviewOutcomes);
  const pending_suggestions = collectPendingSuggestions(verifyFindings, reviewOutcomes);

  // 合并 verify + review 的 pause_decisions(去重以 id 为 key,review 镜像优先级低)
  const allPauseDecisions = mergePauseDecisions(pauseDecisions, reviewPauseDecisions);

  const handoff_to_backlog: HandoffEntry[] = [
    // 第 1 类:SUGGESTION 持挂(直接复用 pending_suggestions,但映射到 HandoffEntry 字段)
    ...pending_suggestions.map<HandoffEntry>((s) => ({
      source: s.source,
      id: s.id,
      severity: 'SUGGESTION',
      dimension: s.dimension,
      check_type: s.check_type,
      evidence: s.evidence,
      recommendation: s.recommendation,
    })),
    // 第 2 类:pause_decisions chosen_option=3
    ...allPauseDecisions
      .filter((p) => p.chosen_option === 3)
      .map<HandoffEntry>((p) => ({
        source: 'pause_decisions',
        id: p.id,
        severity: p.severity,
        chosen_option: 3,
        target_artifact: p.target_artifact,
        target_anchor: p.target_anchor,
        issue_summary: p.issue_summary,
      })),
    // 第 3 类:proposal/design scope-entries Out-of-Scope/Future-Work YAML 块的 active entry
    ...(await collectScopeEntriesHandoff(changeDir)),
  ];

  return {
    schema: 'forge-archive-summary/v1',
    version: ARCHIVE_SUMMARY_VERSION,
    archived_at: archivedAt,
    change_id: changeId,
    verify_passed: {
      verified_invariants: buildVerifiedInvariants(verifyMarker),
    },
    review_passed: {
      reviewers: [String(reviewMarker.reviewed_by ?? 'unknown')],
    },
    process_evidence_summary: buildProcessEvidenceSummary(fenceResult),
    handoff_to_backlog,
    acked_warnings,
    pending_suggestions,
  };
}

/** collector1:verify_findings WARNING + ack + review_outcomes WARNING 全名 + acked(v3 BLOCKER 4:resign 后或 v1.0 native 写入) */
function collectAckedWarnings(findings: Finding[], outcomes: ReviewOutcome[]): AckedWarningRef[] {
  const refs: AckedWarningRef[] = [];
  // verify_findings WARNING + ack(plan-9e1 v3 BLOCKER 3 已有,不动)
  for (const f of findings) {
    if (
      f.severity === 'WARNING' &&
      f.resolved === false &&
      f.severity_acked_by &&
      f.severity_acked_at
    ) {
      refs.push({
        source: 'verify_findings',
        id: f.id,
        dimension: f.dimension,
        check_type: f.check_type,
        evidence: f.evidence,
        acked_by: f.severity_acked_by,
        acked_at: f.severity_acked_at,
      });
    }
  }
  // review_outcomes WARNING 全名 + acked(v3 BLOCKER 4:resign 后或 v1.0 native 写入)
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i] as ReviewOutcome;
    // C 简码由 fence 拒签,不进 builder(沿 plan-9e1 v3 BLOCKER 3)
    // S 简码 / CRITICAL 全名由 fence 拒签,不进 builder
    // 仅 WARNING 全名 + accepted=true + rationale 非空(v0.4 review_outcomes 端的 "acked" 等价路径)
    if (
      o.severity === 'WARNING' &&
      o.resolved === false &&
      o.accepted === true &&
      typeof o.rationale === 'string' &&
      o.rationale.length > 0
    ) {
      refs.push({
        source: 'review_outcomes',
        id: i,
        acked_by: 'review-accepted',
        acked_at: '', // review_outcomes 端无 user 字段,沿 plan-9e1 v1 collector1 review-accepted 标记
        rationale: o.rationale,
      });
    }
  }
  return refs;
}

/** collector2:verify_findings + review_outcomes 中 SUGGESTION + resolved=false(v3 BLOCKER 4:L 简码 + SUGGESTION 全名双格式) */
function collectPendingSuggestions(
  findings: Finding[],
  outcomes: ReviewOutcome[],
): SuggestionRef[] {
  const refs: SuggestionRef[] = [];
  // verify_findings SUGGESTION 全名(plan-9e1 v3 BLOCKER 3 已有,不动)
  for (const f of findings) {
    if (f.severity === 'SUGGESTION' && f.resolved === false) {
      refs.push({
        source: 'verify_findings',
        id: f.id,
        dimension: f.dimension,
        check_type: f.check_type,
        evidence: f.evidence,
        recommendation: f.recommendation,
      });
    }
  }
  // review_outcomes L 简码 + SUGGESTION 全名双格式映射(v3 BLOCKER 4 新增)
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i] as ReviewOutcome;
    if ((o.severity === 'L' || o.severity === 'SUGGESTION') && o.resolved === false) {
      refs.push({
        source: 'review_outcomes',
        id: i,
        recommendation: o.rationale,
      });
    }
  }
  return refs;
}

/**
 * v2 BLOCKER 4 修订:scope-entries YAML 完整性错误(parse 失败 / schema 非法 / anchor_id 不匹配)
 * archive.ts 步骤 4.5 try/catch 转 fence business-fail exit 1
 */
export class ScopeEntriesIntegrityError extends Error {
  constructor(
    message: string,
    public readonly artifactName: string,
    public readonly anchorId: string,
  ) {
    super(message);
    this.name = 'ScopeEntriesIntegrityError';
  }
}

/**
 * collector3 子函数:抽 proposal.md + design.md 中 scope-entries active entry
 * v2 BLOCKER 4:parse 失败 / schema 非法 → 抛 ScopeEntriesIntegrityError(不再静默 continue)
 */
async function collectScopeEntriesHandoff(changeDir: string): Promise<HandoffEntry[]> {
  const entries: HandoffEntry[] = [];
  for (const artifactName of ['proposal.md', 'design.md']) {
    const artifactPath = join(changeDir, artifactName);
    if (!existsSync(artifactPath)) continue;
    const content = await readFile(artifactPath, 'utf8');
    const md = parseMarkdown(content);
    for (const sec of md.sections) {
      if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) continue;
      // 仅取 forge-oos / forge-future-work(non-goals 不是 handoff 目标;non-goal 是"反目标",不需 backlog 追踪)
      const anchorId = sec.anchor as ScopeAnchorId;
      if (anchorId !== 'forge-oos' && anchorId !== 'forge-future-work') continue;
      let yamlBlocks: unknown[];
      try {
        yamlBlocks = parseFencedYamlBlocks(sec.body);
      } catch (err) {
        // v2 BLOCKER 4:parse 失败 → 抛错(让 archive fence 拒签),不再静默跳过
        throw new ScopeEntriesIntegrityError(
          `scope-entries YAML parse failed in ${artifactName} section ${anchorId}: ${(err as Error).message}`,
          artifactName,
          anchorId,
        );
      }
      if (yamlBlocks.length === 0) continue; // 段内无 YAML 块允许(空段沿 9b 通过)
      const block = yamlBlocks[0] as Record<string, unknown>;
      if (block.schema !== 'forge-scope-entries/v1') {
        throw new ScopeEntriesIntegrityError(
          `scope-entries schema 非 'forge-scope-entries/v1'(${artifactName} section ${anchorId},实际 ${JSON.stringify(block.schema)})`,
          artifactName,
          anchorId,
        );
      }
      if (block.anchor_id !== anchorId) {
        throw new ScopeEntriesIntegrityError(
          `scope-entries anchor_id 不匹配(${artifactName}:${anchorId} 段内 YAML 块 anchor_id=${JSON.stringify(block.anchor_id)})`,
          artifactName,
          anchorId,
        );
      }
      if (!Array.isArray(block.entries)) {
        throw new ScopeEntriesIntegrityError(
          `scope-entries entries 非数组(${artifactName} section ${anchorId})`,
          artifactName,
          anchorId,
        );
      }
      for (const e of block.entries as ScopeEntry[]) {
        if (!e || typeof e !== 'object') continue;
        // 仅 status=active 进 handoff(inherited/superseded/completed/obsolete 不进)
        if (e.status !== 'active') continue;
        entries.push({
          source: 'scope_entries',
          id: e.id,
          severity: null,
          category: e.category,
          reason: e.reason,
          target_artifact: artifactName,
          target_anchor: anchorId === 'forge-oos' ? '## Out of Scope' : '## Future Work',
        });
      }
    }
  }
  return entries;
}

/** 合并 verify + review 端 pause_decisions(以 id 为 key 去重,verify 优先) */
function mergePauseDecisions(
  verifyPauses: PauseDecision[],
  reviewPauses: PauseDecision[],
): PauseDecision[] {
  const byId = new Map<number, PauseDecision>();
  for (const p of verifyPauses) byId.set(p.id, p);
  for (const p of reviewPauses) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  return [...byId.values()];
}

/** 沿 design verified_invariants 至少含 hash-match + evidence-complete(9d 三维度 fence 已通过) */
function buildVerifiedInvariants(verifyMarker: Record<string, unknown>): string[] {
  const list = ['hash-match', 'evidence-complete'];
  // 9d 三维度 fence 已通过 — 若 verify_findings 字段存在(老 marker 缺则跳),加上 verify-findings-fence
  if (Array.isArray(verifyMarker.verify_findings)) {
    list.push('verify-findings-fence');
  }
  if (Array.isArray(verifyMarker.pause_decisions)) {
    list.push('pause-decisions-fence');
  }
  return list;
}

/** Date → 'YYYY-MM-DDTHH:MM:SSZ'(沿 marker-schema.ts:20 ISO 8601 UTC 格式) */
function toIso8601(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * buildProcessEvidenceSummary — fence 14 不变量统计折数为 ProcessEvidenceSummary
 *
 * plan-9e2 v2 codex 一轮 MAJOR 修订:4 字段计数
 *
 * 输出 4 计数:
 *   - invariants_passed: status='pass' 的数(真过校验)
 *   - invariants_with_warning: status='warning' 的数(WARNING 经 fail/legacy-skip 优先级筛选后保留)
 *   - invariants_failed: status='fail' 的数(v1.0 永远 = 0;fence.ok=false 时 archive 已 exit 1 不进本路径)
 *   - legacy_exempt: status='legacy-skip' 的数(沿 §3.4.4.1)
 *
 * 不变式:passed + warning + failed + exempt === FENCE_INVARIANT_NAMES.length
 *
 * 注:不在 builder 内 throw — 让 archive-summary-schema validator 单点把守不变式
 *     (避免双源校验路径分歧;沿 brainstorm spec §4.2 决策 #1)
 */
function buildProcessEvidenceSummary(fenceResult: FenceCheckResult): ProcessEvidenceSummary {
  // 按 status 4 态分类统计
  const passed = fenceResult.results.filter((r) => r.status === 'pass').length;
  const warning = fenceResult.results.filter((r) => r.status === 'warning').length;
  const failed = fenceResult.results.filter((r) => r.status === 'fail').length;
  const exempt = fenceResult.results.filter((r) => r.status === 'legacy-skip').length;
  return {
    placeholder: false,
    invariants_passed: passed,
    invariants_with_warning: warning,
    invariants_failed: failed,
    legacy_exempt: exempt,
  };
}
