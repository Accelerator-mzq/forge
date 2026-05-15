// src/core/monitor/report-renderer.ts — 渲染 markdown 报告(spec §10)
import type { TraceEvent, CliExitRecord } from './types.js';
import { computeVerdict } from './health-verdict.js';
import { DIVERGENCE_MAP, findScenario } from './divergence-map.js';

/** 净化 markdown 表格单元格:转义管道符、压平换行(防 AI 自由文本破坏表格) */
function sanitizeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** 渲染某 change 的完整监控报告 markdown */
export function renderReport(
  changeId: string,
  events: TraceEvent[],
  cliExits: CliExitRecord[],
  now: string = new Date().toISOString(),
): string {
  const verdict = computeVerdict(events);
  const lines: string[] = [];

  lines.push(`# Forge 工作流监控报告 — ${changeId}`, '');
  lines.push(`生成时间:${now}`);
  lines.push(`差异映射表同步于:${DIVERGENCE_MAP.meta.synced_at}`, '');

  // ── 1. 健康裁决 ──
  lines.push('## 1. 健康裁决', '');
  const levelText = { ok: '✓ OK', regression: '✗ 检出回归', anomaly: '⚠ 检出异常' }[verdict.level];
  lines.push(`整体:${levelText}`, '');
  if (verdict.items.length === 0) {
    lines.push('无命中项。', '');
  } else {
    for (const it of verdict.items) {
      const tag = it.kind === 'regression' ? '回归' : '异常';
      lines.push(`- [${tag}] (${it.stage}) ${it.detail}`);
      lines.push(`  证据:${it.evidence}`);
    }
    lines.push('');
  }

  // ── 2. 阶段时间线 ──
  lines.push('## 2. 阶段时间线', '');
  if (events.length === 0) {
    lines.push('(无 trace 事件)', '');
  } else {
    lines.push('| 时间 | 阶段 | 层 | 事件 |', '| --- | --- | --- | --- |');
    for (const e of events) {
      lines.push(`| ${e.ts} | ${e.stage} | ${e.layer} | ${sanitizeCell(e.event)} |`);
    }
    lines.push('');
  }
  if (cliExits.length > 0) {
    lines.push('CLI exit 记录:');
    for (const c of cliExits) {
      lines.push(`- ${c.ts} \`forge ${c.command.join(' ')}\` → exit ${c.exit_code}`);
    }
    lines.push('');
  }

  // ── 3. 三方对比表 ──
  lines.push('## 3. 三方对比表(Forge vs OpenSpec vs Superpowers)', '');
  lines.push(
    '| scenario | forge 实际走法 | openspec | superpowers | 加固守住? |',
    '| --- | --- | --- | --- | --- |',
  );
  const decisions = events.filter((e) => e.layer === 'ai' && e.event === 'decision');
  if (decisions.length === 0) {
    lines.push('| (无 decision record) | — | — | — | — |');
  } else {
    for (const d of decisions) {
      const sidRaw = String(d.data.scenario_id ?? '');
      const chosen = sanitizeCell(String(d.data.chosen ?? '(未记录)'));
      const sc = findScenario(sidRaw);
      lines.push(
        `| ${sanitizeCell(sidRaw)} | ${chosen} | ${sanitizeCell(sc?.openspec ?? '?')} | ${sanitizeCell(sc?.superpowers ?? '?')} | ? |`,
      );
    }
  }
  lines.push('');
  lines.push('> `加固守住?` 列填 `?` 的需人工对照 `regression_signal` 判定(spec §10.1)。', '');

  // ── 4. 附录 ──
  lines.push('## 4. 附录:原始 trace', '');
  lines.push('```jsonl');
  for (const e of events) lines.push(JSON.stringify(e));
  lines.push('```', '');

  return lines.join('\n');
}
