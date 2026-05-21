// src/core/monitor/artifact-observer.ts — 把 forge 常规产物反推成 CLI 层 trace 事件(spec §3 / §3.2)
//
// v4 简化(plan-v4 Phase 4 Task 4.5b):
// - 删 observeAckLog —— v4 无 ack-log.jsonl
// - 删 marker 中的 fence_observed —— v4 marker 无 verify_findings/review_outcomes,fence 语义消亡
// - marker_observed data 简化 —— v4 marker 极简(VerifyMarker v2 / ReviewMarker v2),无 tasks_hash/content_hash
// - 删 .verify-failed / .review-failed 监听 —— v4 verify/review 失败直接 abort,不写 failed marker
// - archive 部分 fence_observed 字段对齐 v4 archive_summary v2(verified_by/reviewed_by/spec_updates_applied/handoff_to_backlog)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYAML } from 'yaml';
import { parseMarker } from '../markers/parse.js';
import { validateMarkerSchema } from '../validate/marker-schema.js';
import { validateArchiveSummarySchema } from '../validate/archive-summary-schema.js';
import type { TraceEvent, MonitorStage } from './types.js';

/** marker 文件名 → 监控阶段(v4:只有 verify-passed / review-passed,无 failed marker) */
const MARKER_FILES: Record<string, MonitorStage> = {
  '.verify-passed': 'verify',
  '.review-passed': 'review',
};

function mkEvent(
  changeId: string,
  stage: MonitorStage,
  event: string,
  data: Record<string, unknown>,
  ts?: string,
): TraceEvent {
  return {
    // 优先用产物自带时间戳;缺失才回退观察时刻 —— 报告时间线才不乱序
    ts: ts ?? new Date().toISOString(),
    schema: 'forge-monitor-trace/v1',
    change_id: changeId,
    stage,
    layer: 'cli',
    event,
    data,
  };
}

/** 扫一个目录里的 marker 文件,产出 marker_observed / record_error 事件(v4:仅 marker_observed,无 fence_observed) */
function observeMarkers(dir: string, relBase: string, changeId: string): TraceEvent[] {
  const events: TraceEvent[] = [];
  for (const [fileName, stage] of Object.entries(MARKER_FILES)) {
    const markerPath = join(dir, fileName);
    if (!existsSync(markerPath)) continue;
    const relPath = join(relBase, fileName);
    try {
      const marker = parseMarker(readFileSync(markerPath, 'utf8'));
      const obj = marker as unknown as Record<string, unknown>;
      const validation = validateMarkerSchema(marker, markerPath);
      // 事件 ts 取 marker 自带时间戳(verify→verified_at / review→reviewed_at)
      const markerTs =
        typeof obj.verified_at === 'string'
          ? obj.verified_at
          : typeof obj.reviewed_at === 'string'
            ? obj.reviewed_at
            : undefined;
      events.push(
        mkEvent(
          changeId,
          stage,
          'marker_observed',
          {
            marker_schema: marker.schema,
            path: relPath,
            ok: validation.valid, // spec §3.2:ok = marker schema 校验是否通过
            observed_at: new Date().toISOString(),
          },
          markerTs,
        ),
      );
    } catch (err) {
      events.push(
        mkEvent(changeId, stage, 'record_error', { path: relPath, error: (err as Error).message }),
      );
    }
  }
  return events;
}

/**
 * 扫描某 change 的产物,反推 CLI 层事件(spec §3 / §3.2)。
 * 同时扫 active 目录 forge/changes/<id>/ 与 archive 目录 forge/changes/archive/<id>/
 * —— 产物是 forge 常规输出、与监控开关无关,故可回溯 enable 之前的阶段(spec §2.4)。
 * 单个产物解析失败不抛,产出一条 record_error 事件。
 */
export function observeArtifacts(projectRoot: string, changeId: string): TraceEvent[] {
  const events: TraceEvent[] = [];

  // 1. active change 目录的 marker
  const activeDir = join(projectRoot, 'forge', 'changes', changeId);
  if (existsSync(activeDir)) {
    events.push(...observeMarkers(activeDir, join('forge', 'changes', changeId), changeId));
  }

  // 2. archive 目录 —— archive 成功后 change 移到 forge/changes/archive/<YYYY-MM-DD>-<changeId>/
  const archiveRoot = join(projectRoot, 'forge', 'changes', 'archive');
  if (existsSync(archiveRoot)) {
    try {
      for (const entry of readdirSync(archiveRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        // 目录名 = <YYYY-MM-DD>-<changeId>;剥一层日期前缀,余下须严格等于 changeId
        const m = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(entry.name);
        if (!m || m[1] !== changeId) continue;

        const archiveDir = join(archiveRoot, entry.name);
        const archiveRel = join('forge', 'changes', 'archive', entry.name);
        events.push(...observeMarkers(archiveDir, archiveRel, changeId));

        // archive_summary.yaml —— archive 阶段产物(v4 v2:无 fence 拒签语义,纯 audit)
        const summaryPath = join(archiveDir, 'archive_summary.yaml');
        if (!existsSync(summaryPath)) continue;
        const summaryRel = join(archiveRel, 'archive_summary.yaml');
        try {
          const summary = parseYAML(readFileSync(summaryPath, 'utf8')) as unknown;
          const validation = validateArchiveSummarySchema(summary, summaryPath);
          const s = (summary ?? {}) as Record<string, unknown>;
          // v4 archive_summary v2 字段(沿 src/core/schemas/archive-summary.ts)
          const specUpdates = Array.isArray(s.spec_updates_applied)
            ? (s.spec_updates_applied as unknown[]).length
            : 0;
          const handoff = Array.isArray(s.handoff_to_backlog)
            ? (s.handoff_to_backlog as unknown[]).length
            : 0;
          events.push(
            mkEvent(
              changeId,
              'archive',
              'archive_summary_observed',
              {
                path: summaryRel,
                ok: validation.valid,
                verified_by: s.verified_by,
                reviewed_by: s.reviewed_by,
                spec_updates_applied_count: specUpdates,
                handoff_to_backlog_count: handoff,
                observed_at: new Date().toISOString(),
              },
              typeof s.archived_at === 'string' ? s.archived_at : undefined,
            ),
          );
        } catch (err) {
          events.push(
            mkEvent(changeId, 'archive', 'record_error', {
              path: summaryRel,
              error: (err as Error).message,
            }),
          );
        }
      }
    } catch {
      // archive 目录读取失败(并发删除/权限)→ 跳过 archive 扫描,不破坏 active 事件契约
    }
  }

  return events;
}
