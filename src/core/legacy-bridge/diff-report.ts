// 5 档严重度差异报告渲染 — Plan 7 Phase C
// 决策 #5:critical / major / minor / style / info;markdown + YAML 双栈

import { stringify as stringifyYaml } from 'yaml';
import type { SyncStateFile, SyncStateDiff, DiffSeverity } from './types.js';

/** 严重度排序(渲染顺序:critical → info) */
export const SEVERITY_ORDER: ReadonlyArray<DiffSeverity> = [
  'critical',
  'major',
  'minor',
  'style',
  'info',
];

/** 严重度图标 */
const SEVERITY_ICON: Record<DiffSeverity, string> = {
  critical: '🔴',
  major: '🟠',
  minor: '🟡',
  style: '🔵',
  info: '⚪',
};

/** 把 SyncStateFile 渲染为 markdown(human-readable) */
export function renderDiffMarkdown(file: SyncStateFile): string {
  const lines: string[] = [];
  lines.push(`# Sync 差异报告:${file.change_id}`);
  lines.push('');
  lines.push(`生成时间:${file.generated_at}`);
  lines.push('');

  const counts = countBySeverity(file.diffs);
  const summary = SEVERITY_ORDER
    .map((s) => `${SEVERITY_ICON[s]} ${s}: ${counts[s]}`)
    .join('  ');
  lines.push(`**总览**:${summary}`);
  lines.push('');

  if (file.cross_anchor_conflicts && file.cross_anchor_conflicts.length > 0) {
    lines.push(`> ⚠ 跨 anchor 冲突 ${file.cross_anchor_conflicts.length} 项默认入 diff(决策 #18 修订)`);
    lines.push('');
  }

  for (const severity of SEVERITY_ORDER) {
    const items = file.diffs.filter((d) => d.severity === severity);
    if (items.length === 0) continue;
    lines.push(`## ${SEVERITY_ICON[severity]} ${severity} (${items.length})`);
    lines.push('');
    for (const d of items) {
      lines.push(`### #${d.id} \`${d.anchor_path}\`${d.section ? ` ${d.section}` : ''}`);
      lines.push('');
      lines.push(d.description);
      lines.push('');
      lines.push(`**status**:\`${d.status}\`${d.reason ? ` — ${d.reason}` : ''}`);
      lines.push('');
    }
  }

  if (file.cross_anchor_conflicts && file.cross_anchor_conflicts.length > 0) {
    lines.push(`## 跨 anchor 不一致(决策 #18 修订)`);
    lines.push('');
    for (const d of file.cross_anchor_conflicts) {
      lines.push(`### #${d.id} ${d.anchor_path}`);
      lines.push('');
      lines.push(d.description);
      lines.push('');
      lines.push(`**status**:\`${d.status}\``);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## resolve 流程(决策 #19)');
  lines.push('');
  lines.push('1. 用户根据上述 diffs 决定:更新老文档 / false-positive / skipped');
  lines.push('2. 编辑同名 `.yaml` 文件,把每条 status 字段从 `pending` 改为对应值');
  lines.push('3. 跑 `forge legacy-bridge resolve <change-id>` 校验全部已 ack');
  return lines.join('\n');
}

/** 把 SyncStateFile 渲染为 YAML(machine-readable + 用户编辑入口) */
export function renderDiffYaml(file: SyncStateFile): string {
  return stringifyYaml(file);
}

/** diffs 按 severity 分组计数 */
export function countBySeverity(diffs: SyncStateDiff[]): Record<DiffSeverity, number> {
  const out: Record<DiffSeverity, number> = {
    critical: 0,
    major: 0,
    minor: 0,
    style: 0,
    info: 0,
  };
  for (const d of diffs) {
    out[d.severity] += 1;
  }
  return out;
}

/** 是否含 critical 未 resolve 项(determines preflight 是否阻塞) */
export function hasCriticalPending(file: SyncStateFile): boolean {
  return file.diffs.some((d) => d.severity === 'critical' && d.status === 'pending');
}

/** 给定 LLM 输出 yaml 草稿,补全 status 字段(默认 pending) */
export function normalizeDiffsFromLlm(diffs: Array<Partial<SyncStateDiff>>): SyncStateDiff[] {
  return diffs.map((d, idx) => ({
    id: d.id ?? idx + 1,
    severity: (d.severity ?? 'info') as DiffSeverity,
    anchor_path: d.anchor_path ?? '',
    section: d.section,
    description: d.description ?? '',
    status: (d.status ?? 'pending') as SyncStateDiff['status'],
    reason: d.reason,
  }));
}
