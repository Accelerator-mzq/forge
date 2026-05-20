// src/core/archive/summary-builder.ts — v4 OpenSpec alignment 简版(plan-v4 Phase 1 Task 1.6)
//
// v4 BREAKING change(沿 plan-v4 §6.4 + §10.1.2):
// - signature 改为 `buildArchiveSummary({ archivePath, changeId, verifyMarker, reviewMarker, deltas })`
// - 输出 ArchiveSummary v2:仅 schema/version/archived_at/change_id/archive_name/verified_by/
//   reviewed_by/applied_commits/spec_updates_applied/handoff_to_backlog 字段
// - 删 collectAckedWarnings / collectPendingSuggestions / buildVerifiedInvariants /
//   buildProcessEvidenceSummary / mergePauseDecisions(反加固阵列消亡)
// - handoff_to_backlog 仅两来源:pause_decisions chosen_option=3 + scope_entries 三段 YAML 块
// - spec_updates_applied 字段从 forge applyDeltas 实际 SpecDelta[] 转换,operation 沿 create/replace/delete

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { PauseDecisionSimple } from '../markers/types.js';
import type { SpecDelta } from '../specs-sync/index.js';
import type { ArchiveSummary, HandoffEntry } from '../schemas/archive-summary.js';
import { ARCHIVE_SUMMARY_VERSION } from '../schemas/archive-summary.js';
import { parseMarkdown } from '../parse/markdown.js';
import { parseFencedYamlBlocks } from '../parse/fenced-yaml.js';
import { SCOPE_ANCHOR_IDS, type ScopeAnchorId, type ScopeEntry } from '../schemas/scope-entries.js';

/**
 * buildArchiveSummary 入参 — v4 sig 改造(plan §10.1.2 Task 1.6)
 *
 * - archivePath:归档后的目标目录绝对路径(forge/changes/archive/<archiveName>/);
 *   buildArchiveSummary 从此处读 proposal.md / design.md 抽 scope_entries handoff
 * - changeId:change id 字符串
 * - verifyMarker / reviewMarker:v2 marker 解析后对象
 * - deltas:archive 主流程 readDeltas + applyDeltas 实际应用的 SpecDelta 数组
 * - archivedAt:可选时间戳(测试注入用,生产默认 new Date().toISOString())
 */
export interface BuildArchiveSummaryInput {
  archivePath: string;
  changeId: string;
  verifyMarker: Record<string, unknown>;
  reviewMarker: Record<string, unknown>;
  deltas: SpecDelta[];
  archivedAt?: string;
}

/**
 * buildArchiveSummary v4 — 构造极简 ArchiveSummary v2 对象
 *
 * 沿 plan §6.4 + §10.1.2 v7:
 *   - schema:forge-archive-summary/v2
 *   - spec_updates_applied:从 deltas 1:1 映射 capability + operation
 *   - handoff_to_backlog 两来源:
 *       1) verify/review marker.pause_decisions[] chosen_option=3(转 out-of-scope)
 *       2) proposal.md + design.md `## Out of Scope` / `## Future Work` YAML 块 active entry
 *   - 不再生成 acked_warnings / pending_suggestions / process_evidence_summary / verified_invariants
 */
export async function buildArchiveSummary(
  input: BuildArchiveSummaryInput,
): Promise<ArchiveSummary> {
  const archivedAt = input.archivedAt ?? toIso8601(new Date());

  // —— spec_updates_applied:从 SpecDelta 直接映射(name → capability,operation 沿 create/replace/delete)——
  const spec_updates_applied = input.deltas.map((d) => ({
    capability: d.name,
    operation: d.operation,
  }));

  // —— handoff_to_backlog:pause_decisions option=3 + scope_entries active(两来源 union)——
  const handoff_to_backlog: HandoffEntry[] = [
    ...collectPauseDecisionHandoff(input.verifyMarker, input.reviewMarker),
    ...(await collectScopeEntriesHandoff(input.archivePath)),
  ];

  // —— verified_by / reviewed_by 直读 marker(v2 schema 已校验为非空字符串)——
  const verified_by = String(input.verifyMarker.verified_by ?? 'unknown');
  const reviewed_by = String(input.reviewMarker.reviewed_by ?? 'unknown');

  return {
    schema: 'forge-archive-summary/v2',
    version: ARCHIVE_SUMMARY_VERSION,
    archived_at: archivedAt,
    change_id: input.changeId,
    archive_name: basename(input.archivePath),
    verified_by,
    reviewed_by,
    spec_updates_applied,
    handoff_to_backlog,
  };
}

/**
 * collectPauseDecisionHandoff:从 verify + review marker 抽 pause_decisions chosen_option=3
 *
 * v4 PauseDecisionSimple 仅 5 字段(paused_at / task_ref / issue_summary / chosen_option / notes),
 * 不再有 v1 的 target_artifact / target_anchor / severity 等反加固字段。
 * verify + review 两侧 pause_decisions 合并去重(以 (task_ref, paused_at) 复合 key)。
 */
function collectPauseDecisionHandoff(
  verifyMarker: Record<string, unknown>,
  reviewMarker: Record<string, unknown>,
): HandoffEntry[] {
  const all = mergePauseDecisions(
    extractPauseDecisions(verifyMarker),
    extractPauseDecisions(reviewMarker),
  );
  const entries: HandoffEntry[] = [];
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (!p || p.chosen_option !== 3) continue;
    entries.push({
      source: 'pause_decisions',
      id: i, // 数字索引(沿 v4 简化 — 不再有 capture_id 链)
      chosen_option: 3,
      issue_summary: p.issue_summary,
    });
  }
  return entries;
}

/** 从 marker 安全抽 pause_decisions 数组(非数组返空) */
function extractPauseDecisions(marker: Record<string, unknown>): PauseDecisionSimple[] {
  return Array.isArray(marker.pause_decisions)
    ? (marker.pause_decisions as PauseDecisionSimple[])
    : [];
}

/**
 * 合并 verify + review 两侧 pause_decisions
 *
 * 去重策略:以 (task_ref, paused_at) 复合 key 判等,verify 侧优先。
 * v4 简化:不再有 capture_id 锚定,user 在 verify/review 阶段可能各写一次同一 pause,
 * 合并避免 handoff 重复一项。
 */
function mergePauseDecisions(
  verifyPauses: PauseDecisionSimple[],
  reviewPauses: PauseDecisionSimple[],
): PauseDecisionSimple[] {
  const keyOf = (p: PauseDecisionSimple) => `${p.task_ref}@${p.paused_at}`;
  const seen = new Set<string>();
  const out: PauseDecisionSimple[] = [];
  for (const p of verifyPauses) {
    const k = keyOf(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  for (const p of reviewPauses) {
    const k = keyOf(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/**
 * collectScopeEntriesHandoff:从 archive 后的 proposal.md + design.md 抽 scope-entries
 *
 * v4 简化:
 *   - 仅扫 forge-oos / forge-future-work 两段(forge-non-goals 是反目标,不做 handoff)
 *   - 仅取 status=active 的 entry(inherited/superseded/completed/obsolete 不进)
 *   - parse 失败 / schema 不匹配 → 静默跳过(v4 不再 throw fence error,沿 OpenSpec 风格)
 *   - changeDir 已归档到 archivePath,本函数从该路径读 proposal/design
 */
async function collectScopeEntriesHandoff(archivePath: string): Promise<HandoffEntry[]> {
  const entries: HandoffEntry[] = [];
  for (const artifactName of ['proposal.md', 'design.md']) {
    const artifactPath = join(archivePath, artifactName);
    if (!existsSync(artifactPath)) continue;

    let content: string;
    try {
      content = await readFile(artifactPath, 'utf8');
    } catch {
      continue; // 读失败静默跳过(archive 已完成,handoff 是衍生产物)
    }

    const md = parseMarkdown(content);
    for (const sec of md.sections) {
      if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) continue;
      const anchorId = sec.anchor as ScopeAnchorId;
      // 仅 oos / future-work 进 handoff;non-goals 不进
      if (anchorId !== 'forge-oos' && anchorId !== 'forge-future-work') continue;

      let yamlBlocks: unknown[];
      try {
        yamlBlocks = parseFencedYamlBlocks(sec.body);
      } catch {
        continue; // v4 静默跳过(不再 throw ScopeEntriesIntegrityError)
      }
      if (yamlBlocks.length === 0) continue;

      const block = yamlBlocks[0] as Record<string, unknown>;
      if (block.schema !== 'forge-scope-entries/v1') continue;
      if (block.anchor_id !== anchorId) continue;
      if (!Array.isArray(block.entries)) continue;

      for (const e of block.entries as ScopeEntry[]) {
        if (!e || typeof e !== 'object') continue;
        if (e.status !== 'active') continue;
        entries.push({
          source: 'scope_entries',
          id: e.id,
          category: e.category,
          description: e.description,
          reason: e.reason,
        });
      }
    }
  }
  return entries;
}

/** Date → 'YYYY-MM-DDTHH:MM:SSZ'(沿 marker-schema.ts ISO 8601 UTC 格式,无 ms) */
function toIso8601(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
