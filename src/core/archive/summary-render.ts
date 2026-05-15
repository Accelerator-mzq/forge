// src/core/archive/summary-render.ts — plan-9e1 Task 4
// renderArchiveSummaryOutput:把 ArchiveSummary → 用户可读字符串(沿 design §2.4.4 模板)

import type { ArchiveSummary, AckedWarningRef, SuggestionRef } from '../schemas/archive-summary.js';

/**
 * 渲染 archive 完成后的用户输出字符串
 * @param summary ArchiveSummary 对象
 * @param archiveDirName archive 子目录名(如 '2026-05-12-add-oauth-refresh');用于 yaml 路径提示
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
  lines.push(`**Specs:** ✓ Synced`);
  // process_evidence_summary placeholder 显式标注(9e2 接 9g 后换成真实统计)
  if (summary.process_evidence_summary.placeholder) {
    lines.push(
      `**Security:** [process_evidence:placeholder] ${summary.process_evidence_summary.note ?? ''}`,
    );
  } else {
    const p = summary.process_evidence_summary;
    lines.push(
      `**Security:** [process_evidence:passed=${p.invariants_passed ?? 0}/failed=${p.invariants_failed ?? 0}/legacy=${p.legacy_exempt ?? 0}]`,
    );
  }
  lines.push('');

  // Acknowledged Warnings 段
  if (summary.acked_warnings.length > 0) {
    lines.push(`### Acknowledged Warnings (${summary.acked_warnings.length})`);
    for (const a of summary.acked_warnings) {
      lines.push(renderAckedWarning(a));
    }
    lines.push('');
  }

  // Pending Suggestions 段
  if (summary.pending_suggestions.length > 0) {
    lines.push(
      `### Pending Suggestions (${summary.pending_suggestions.length}) — recorded in archive_summary`,
    );
    for (const s of summary.pending_suggestions) {
      lines.push(renderPendingSuggestion(s));
    }
    lines.push('');
  }

  // 提示
  lines.push(
    `Review handoff details: cat forge/changes/archive/${archiveDirName}/archive_summary.yaml`,
  );
  lines.push(`Cross-change backlog: run \`forge backlog list\` (see forge/backlog/)`);
  return lines.join('\n');
}

/** 渲染单条 AckedWarningRef */
function renderAckedWarning(a: AckedWarningRef): string {
  const tag = `[WARNING] ${a.source}#${a.id}`;
  const dim = a.dimension && a.check_type ? ` (${a.dimension}/${a.check_type})` : '';
  const head = `- ${tag}${dim}`;
  const ev = a.evidence ? `\n  Evidence: ${a.evidence}` : '';
  const acked = `\n  Acked by: ${a.acked_by}${a.acked_at ? ` at ${a.acked_at}` : ''}`;
  const rat = a.rationale ? `\n  Rationale: ${a.rationale}` : '';
  return `${head}${ev}${acked}${rat}`;
}

/** 渲染单条 SuggestionRef */
function renderPendingSuggestion(s: SuggestionRef): string {
  const tag = `[SUGGESTION] ${s.source}#${s.id}`;
  const dim = s.dimension && s.check_type ? ` (${s.dimension}/${s.check_type})` : '';
  const head = `- ${tag}${dim}`;
  const ev = s.evidence ? `\n  Source: ${s.evidence}` : '';
  const rec = s.recommendation ? `\n  Recommendation: ${s.recommendation}` : '';
  return `${head}${ev}${rec}`;
}
