// src/core/monitor/trace-store.ts — append-only JSONL trace 存储(spec §3.2 / §5)
import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
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

/** session-id 持久化文件路径 */
function sessionIdFile(projectRoot: string): string {
  return join(monitorDir(projectRoot), '.session-id');
}

/**
 * 返回本项目的 _session-<uuid> change-id —— pre-change(brainstorm/explore)事件的桶。
 * 首次调用生成 uuid 并持久化到 forge/.monitor/.session-id,后续读回同一 id,保证一个 session 一个桶。
 */
export function sessionChangeId(projectRoot: string): string {
  const file = sessionIdFile(projectRoot);
  try {
    if (existsSync(file)) {
      const id = readFileSync(file, 'utf8').trim();
      if (id.startsWith('_session-')) return id;
    }
  } catch {
    /* 读失败 → 落到生成新 id */
  }
  const id = `_session-${randomUUID()}`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, id, 'utf8');
  } catch {
    /* 写失败也返回 id —— record 仍能写 trace,只是下次又生成新 id */
  }
  return id;
}

/** 读所有 _session-* 桶的 trace 事件并合并(spec §2.4/§3.2:report 渲染时并入 pre-change 事件) */
export function readSessionTrace(projectRoot: string): TraceEvent[] {
  const dir = monitorDir(projectRoot);
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: TraceEvent[] = [];
  for (const name of entries) {
    if (!name.startsWith('_session-')) continue;
    out.push(...readTrace(projectRoot, name).events);
  }
  return out;
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
