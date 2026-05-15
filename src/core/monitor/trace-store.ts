// src/core/monitor/trace-store.ts — append-only JSONL trace 存储(spec §3.2 / §5)
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { TraceEvent, CliExitRecord } from './types.js';

/** forge/.monitor/ 目录(spec §5) */
export function monitorDir(projectRoot: string): string {
  return join(projectRoot, 'forge', '.monitor');
}

/** 某 change 的 trace.jsonl 路径 */
export function traceFilePath(projectRoot: string, changeId: string): string {
  return join(monitorDir(projectRoot), changeId, 'trace.jsonl');
}

/** 项目级 cli-exits.jsonl 路径 */
export function cliExitsPath(projectRoot: string): string {
  return join(monitorDir(projectRoot), 'cli-exits.jsonl');
}

/** 追加一条 trace 事件;写入前先建目录(spec §4 G-10) */
export function appendTraceEvent(projectRoot: string, event: TraceEvent): void {
  const file = traceFilePath(projectRoot, event.change_id);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
}

// existsSync + readFileSync 间有 TOCTOU 窗口;单进程 CLI 场景可接受(对齐 ack-log.ts 惯例)
/** 读某 change 的 trace;逐行解析,坏行跳过并计数 */
export function readTrace(
  projectRoot: string,
  changeId: string,
): { events: TraceEvent[]; corruptLines: number } {
  const file = traceFilePath(projectRoot, changeId);
  if (!existsSync(file)) return { events: [], corruptLines: 0 };
  const events: TraceEvent[] = [];
  let corruptLines = 0;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as TraceEvent);
    } catch {
      corruptLines++;
    }
  }
  return { events, corruptLines };
}

/** 追加一条 CLI exit 记录;写入前先建目录 */
export function recordCliExit(projectRoot: string, record: CliExitRecord): void {
  const file = cliExitsPath(projectRoot);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * 读项目级 cli-exits.jsonl;坏行静默跳过且不计数。
 * 与 readTrace 返回 corruptLines 的不对称是有意设计:trace 坏行会进健康报告(spec §11),
 * 故 readTrace 暴露 corruptLines;cli-exits 仅作 exit code 旁证、不进健康裁决,坏行不暴露计数。
 */
export function readCliExits(projectRoot: string): CliExitRecord[] {
  const file = cliExitsPath(projectRoot);
  if (!existsSync(file)) return [];
  const out: CliExitRecord[] = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as CliExitRecord);
    } catch {
      /* 坏行跳过 */
    }
  }
  return out;
}
