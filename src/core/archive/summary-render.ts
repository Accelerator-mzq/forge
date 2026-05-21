// src/core/archive/summary-render.ts — v4 OpenSpec alignment 简版(plan-v4 Phase 1 Task 1.7)
//
// v4 BREAKING change(沿 plan-v4 §10.1.2 Task 1.7):
// - 删读 v1 字段:process_evidence_summary / acked_warnings / pending_suggestions
// - 保留读 v2 字段:archived_at / change_id / archive_name / verified_by /
//   reviewed_by / spec_updates_applied / handoff_to_backlog
// - 81 → ~40 行

import type { ArchiveSummary, HandoffEntry } from '../schemas/archive-summary.js';

/**
 * 渲染 archive 完成后的用户输出字符串(v4 简版)
 *
 * @param summary ArchiveSummary v2 对象
 * @param archiveDirName archive 子目录名(如 '2026-05-20-add-oauth-refresh');
 *                       caller 已算出,本函数不重复算(避免与 summary.archive_name 同步偏移)
 */
export function renderArchiveSummaryOutput(
  summary: ArchiveSummary,
  archiveDirName: string,
): string {
  const lines: string[] = [];
  lines.push('## Archive Complete');
  lines.push('');
  lines.push(`**Change:** ${summary.change_id}`);
  lines.push(`**Archived to:** forge/changes/archive/${archiveDirName}/`);
  lines.push(`**Verified by:** ${summary.verified_by}`);
  lines.push(`**Reviewed by:** ${summary.reviewed_by}`);

  // Spec updates 段(若有,显示 capability + operation 简要)
  if (summary.spec_updates_applied.length > 0) {
    lines.push(`**Specs:** ✓ Synced (${summary.spec_updates_applied.length} update(s))`);
    for (const u of summary.spec_updates_applied) {
      lines.push(`  - ${u.capability}: ${u.operation}`);
    }
  } else {
    lines.push(`**Specs:** (no spec changes)`);
  }
  lines.push('');

  // Handoff 段(若有 entry,逐条列出供 user 跨 change 跟踪)
  if (summary.handoff_to_backlog.length > 0) {
    lines.push(`### Handoff to backlog (${summary.handoff_to_backlog.length})`);
    for (const h of summary.handoff_to_backlog) {
      lines.push(renderHandoffEntry(h));
    }
    lines.push('');
  }

  // 收尾提示
  lines.push(
    `Review handoff details: cat forge/changes/archive/${archiveDirName}/archive_summary.yaml`,
  );
  lines.push(`Cross-change backlog: run \`forge backlog\` (see forge/backlog/)`);
  return lines.join('\n');
}

/** 渲染单条 HandoffEntry — 区分 pause_decisions / scope_entries 两来源 */
function renderHandoffEntry(h: HandoffEntry): string {
  if (h.source === 'pause_decisions') {
    return `- [pause_decisions#${h.id}] ${h.issue_summary ?? '(no summary)'}`;
  }
  // scope_entries
  const cat = h.category ?? 'unspecified';
  const desc = h.description ?? '(no description)';
  const reason = h.reason ? `\n  Reason: ${h.reason}` : '';
  return `- [scope_entries:${cat}] ${h.id}: ${desc}${reason}`;
}
