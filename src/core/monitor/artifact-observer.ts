// src/core/monitor/artifact-observer.ts — 把 forge 常规产物反推成 CLI 层 trace 事件(spec §3 / §3.2)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYAML } from 'yaml';
import { parseMarker } from '../markers/parse.js';
import { validateMarkerSchema } from '../validate/marker-schema.js';
import { validateArchiveSummarySchema } from '../validate/archive-summary-schema.js';
import type { TraceEvent, MonitorStage } from './types.js';

/** marker 文件名 → 监控阶段(以 Step 1 确认的实际文件名为准) */
const MARKER_FILES: Record<string, MonitorStage> = {
  '.verify-passed': 'verify',
  '.verify-failed': 'verify',
  '.review-passed': 'review',
  '.review-failed': 'review',
};

function mkEvent(
  changeId: string,
  stage: MonitorStage,
  event: string,
  data: Record<string, unknown>,
  ts?: string,
): TraceEvent {
  return {
    // 优先用产物自带时间戳;缺失才回退观察时刻 —— 报告时间线才不乱序(Codex 计划审查第 4 轮 检查点 3)
    ts: ts ?? new Date().toISOString(),
    schema: 'forge-monitor-trace/v1',
    change_id: changeId,
    stage,
    layer: 'cli',
    event,
    data,
  };
}

/** 扫一个目录里的 4 个 marker 文件,产出 marker_observed / record_error 事件 */
function observeMarkers(dir: string, relBase: string, changeId: string): TraceEvent[] {
  const events: TraceEvent[] = [];
  for (const [fileName, stage] of Object.entries(MARKER_FILES)) {
    const markerPath = join(dir, fileName);
    if (!existsSync(markerPath)) continue;
    const relPath = join(relBase, fileName);
    try {
      const marker = parseMarker(readFileSync(markerPath, 'utf8'));
      // marker 是 union 类型;失败类 marker 无 hash 字段,转 record 安全取值
      const obj = marker as unknown as Record<string, unknown>;
      const validation = validateMarkerSchema(marker, markerPath);
      // 事件 ts 取 marker 自带时间戳(verify→verified_at / review→reviewed_at / failed→failed_at);
      // 报告「阶段时间线」按真实时序排序才有意义(Codex 计划审查第 4 轮 检查点 3)。
      // 用 typeof runtime guard 而非 as 断言 —— schema-invalid marker 的时间戳字段可能不是 string,
      // as 会让非 string 值漏进 TraceEvent.ts,致 Task 11 排序 localeCompare 崩溃(第 5 轮 Finding 1)
      const markerTs =
        typeof obj.verified_at === 'string'
          ? obj.verified_at
          : typeof obj.reviewed_at === 'string'
            ? obj.reviewed_at
            : typeof obj.failed_at === 'string'
              ? obj.failed_at
              : undefined;
      events.push(
        mkEvent(
          changeId,
          stage,
          'marker_observed',
          {
            marker_schema: marker.schema,
            path: relPath,
            hashes: { tasks_hash: obj.tasks_hash, content_hash: obj.content_hash },
            ok: validation.valid, // spec §3.2:ok = marker schema 校验是否通过
            observed_at: new Date().toISOString(), // observer 实际跑的时刻,与 ts 区分
          },
          markerTs,
        ),
      );
      // I-2(spec §3.2):verify/review 的 fence_observed —— 从 marker findings 抽未决项
      const findingsKey = stage === 'verify' ? 'verify_findings' : 'review_outcomes';
      const rawFindings = Array.isArray(obj[findingsKey])
        ? (obj[findingsKey] as Record<string, unknown>[])
        : [];
      const blockedFindings = rawFindings
        .filter((f) => f.resolved === false)
        .map((f, i) => ({ id: f.id ?? i, severity: f.severity ?? null, dimension: f.dimension }));
      const fenceOk = !blockedFindings.some((b) => b.severity === 'CRITICAL' || b.severity === 'S');
      events.push(
        mkEvent(
          changeId,
          stage,
          'fence_observed',
          { level: stage, ok: fenceOk, blocked_findings: blockedFindings, path: relPath },
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

/** 读一个 change 目录的 .evidence/ack-log.jsonl,对每条 ack entry 产 ack_observed 事件(spec §3.2) */
function observeAckLog(dir: string, changeId: string): TraceEvent[] {
  const events: TraceEvent[] = [];
  const logPath = join(dir, '.evidence', 'ack-log.jsonl');
  if (!existsSync(logPath)) return events;
  let lines: string[];
  try {
    lines = readFileSync(logPath, 'utf8').split(/\r?\n/);
  } catch {
    return events; // 读失败 → 跳过,never-throw
  }
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry.kind !== 'ack') continue; // 只记 ack entry,跳过 evidence-helper
      events.push(
        mkEvent(
          changeId,
          'ack-confirm',
          'ack_observed',
          {
            action: entry.action ?? null,
            finding_id: entry.finding_id ?? null,
            severity: entry.target_severity ?? null,
            user: entry.user ?? null,
          },
          typeof entry.timestamp === 'string' ? entry.timestamp : undefined,
        ),
      );
    } catch {
      /* 坏 JSON 行跳过 */
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

  // 1. active change 目录的 marker + ack-log
  const activeDir = join(projectRoot, 'forge', 'changes', changeId);
  if (existsSync(activeDir)) {
    events.push(...observeMarkers(activeDir, join('forge', 'changes', changeId), changeId));
    events.push(...observeAckLog(activeDir, changeId));
  }

  // 2. archive 目录 —— archive 成功后 change 移到 forge/changes/archive/<YYYY-MM-DD>-<changeId>/
  //    (transaction.ts:56 给目录名加 archiveDate 前缀;monitor 不知 archiveDate,按正则反解;
  //     Codex 计划审查第 2 轮 F-2 / 新-1 / 新-3)
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
        events.push(...observeAckLog(archiveDir, changeId));

        // archive_summary.yaml —— 三级 fence 的 archive 侧裁决产物(spec §3.2)
        const summaryPath = join(archiveDir, 'archive_summary.yaml');
        if (!existsSync(summaryPath)) continue;
        const summaryRel = join(archiveRel, 'archive_summary.yaml');
        try {
          const summary = parseYAML(readFileSync(summaryPath, 'utf8')) as unknown;
          // Codex 计划审查第 2 轮 新-2:用完整 schema 校验定 ok,而非浅守卫 looksLikeArchiveSummary
          const validation = validateArchiveSummarySchema(summary, summaryPath);
          const s = (summary ?? {}) as Record<string, unknown>;
          events.push(
            mkEvent(
              changeId,
              'archive',
              'fence_observed',
              {
                level: 'archive',
                ok: validation.valid,
                path: summaryRel,
                verify_passed: s.verify_passed,
                review_passed: s.review_passed,
                process_evidence_summary: s.process_evidence_summary,
                observed_at: new Date().toISOString(),
              },
              typeof s.archived_at === 'string' ? s.archived_at : undefined, // ts 取 archived_at,typeof guard(第 5 轮 Finding 1)
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
