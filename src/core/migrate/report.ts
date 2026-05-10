// src/core/migrate/report.ts
// journal NDJSON + 末态 fs.rename + reader 优先级 — Plan 8d Task 4.4
// Spec §3.4 trace 格式 + journal 流程 v4

import { existsSync } from 'node:fs';
import { open, rename, unlink, writeFile, readFile, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import type { MigrateTrace, TraceOp, SourceId } from './types.js';

// 三个 trace 文件名常量
const NDJSON_NAME = 'migrate-trace.json.ndjson';
const TMP_NAME = 'migrate-trace.json.tmp';
const FINAL_NAME = 'migrate-trace.json';

/**
 * Journal:NDJSON 行式写入 + 每步 fsync
 * crash 时半完成 ops 仍可被 readTrace 重建
 */
export class Journal {
  private constructor(private readonly fh: FileHandle) {}

  /** 打开 journal 文件(append 模式) */
  static async open(filePath: string): Promise<Journal> {
    const fh = await open(filePath, 'a'); // append 模式:crash 安全
    return new Journal(fh);
  }

  /** 追加一个 op，立即 fsync 防 crash 丢数据 */
  async append(op: TraceOp): Promise<void> {
    const line = JSON.stringify(op) + '\n';
    await this.fh.write(line, null, 'utf8');
    await this.fh.sync(); // fsync — crash safety 关键步骤
  }

  /** 关闭文件句柄 */
  async close(): Promise<void> {
    await this.fh.close();
  }
}

/**
 * reader 优先级:.json > .ndjson(重建)> .tmp(忽略,返 null)
 * 说明:
 * - .json 是末态原子 rename 写成的,可信
 * - .ndjson 是 crash 半完成态,可重建 ops
 * - .tmp 是崩溃中的写入,不可读(可能不完整)
 */
export async function readTrace(dir: string): Promise<MigrateTrace | null> {
  const finalPath = join(dir, FINAL_NAME);
  const ndjsonPath = join(dir, NDJSON_NAME);

  // 优先级 1:.json 存在且可解析
  if (existsSync(finalPath)) {
    try {
      const content = await readFile(finalPath, 'utf8');
      return JSON.parse(content) as MigrateTrace;
    } catch {
      // .json 损坏(极少见)→ fallback 到 ndjson
    }
  }

  // 优先级 2:.ndjson 存在 → 逐行重建 ops
  if (existsSync(ndjsonPath)) {
    const content = await readFile(ndjsonPath, 'utf8');
    const ops: TraceOp[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        ops.push(JSON.parse(line) as TraceOp);
      } catch {
        // 容忍最后一行 truncate(crash 中途写入)
      }
    }
    // 注意:.ndjson 行只含 TraceOp 字段,不含 source/sourceRoot/ts/cleanupHint 等 meta;
    // 此处用占位值('openspec' / '' 等),P5 crash 恢复若需要这些 meta,应从 opts/detect 重新传入
    // 而非依赖 readTrace 的 ndjson 重建路径。
    return {
      version: 1,
      source: 'openspec' as SourceId,
      sourceRoot: '',
      ts: '',
      ops,
      conflicts: [],
      downgrades: [],
      cleanupHint: '',
    };
  }

  // 优先级 3(最低):.tmp 只有或全无 → 崩溃中,不读
  return null;
}

/**
 * 末态原子 rename 三步走:
 * 1. 写 .tmp(完整 final trace JSON)
 * 2. fs.rename .tmp → .json(POSIX 原子)
 * 3. 删 .ndjson(若存在)
 */
export async function finalizeAndRename(dir: string, finalTrace: MigrateTrace): Promise<void> {
  const tmpPath = join(dir, TMP_NAME);
  const finalPath = join(dir, FINAL_NAME);
  const ndjsonPath = join(dir, NDJSON_NAME);

  // 步骤 1:写 .tmp
  await writeFile(tmpPath, JSON.stringify(finalTrace, null, 2), 'utf8');
  // 步骤 2:原子 rename .tmp → .json
  await rename(tmpPath, finalPath);
  // 步骤 3:删 .ndjson(仅在存在时)
  if (existsSync(ndjsonPath)) {
    await unlink(ndjsonPath);
  }
}

/**
 * 写 migrate-report.md(spec §3.4)
 * 磁盘满或写入失败时:降级 stderr 输出全文(spec §3.1)
 */
export async function writeReportMd(dir: string, finalTrace: MigrateTrace): Promise<void> {
  const lines: string[] = [];
  lines.push(`# Migration Report — ${finalTrace.source} @ ${finalTrace.ts}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Source: ${finalTrace.source} (rootPath: ${finalTrace.sourceRoot})`);
  lines.push(`- Total ops: ${finalTrace.ops.length}`);
  lines.push(`- Conflicts: ${finalTrace.conflicts.length}`);
  lines.push(`- Downgrades: ${finalTrace.downgrades.length}`);
  lines.push('');
  lines.push('## Plan');
  lines.push('| From | To | Kind | Validate |');
  lines.push('| ---- | -- | ---- | -------- |');
  for (const op of finalTrace.ops) {
    lines.push(`| ${op.from ?? '(missing)'} | ${op.to} | ${op.kind} | ${op.validate} |`);
  }
  // 冲突表(可选)
  if (finalTrace.conflicts.length > 0) {
    lines.push('');
    lines.push('## Conflicts');
    for (const c of finalTrace.conflicts) {
      lines.push(`- ${c.target} → ${c.rename}`);
    }
  }
  // 降级表(可选)
  if (finalTrace.downgrades.length > 0) {
    lines.push('');
    lines.push('## Downgrades(M13)');
    for (const d of finalTrace.downgrades) {
      lines.push(`- ${d.change}: ${d.from} → ${d.to}(reason: ${d.reason})`);
    }
  }
  lines.push('');
  lines.push('## Cleanup');
  lines.push(finalTrace.cleanupHint);

  try {
    await writeFile(join(dir, 'migrate-report.md'), lines.join('\n'), 'utf8');
  } catch {
    // 磁盘满降级:stderr 输出(spec §3.1)
    console.error('[migrate] report.md 写入失败,降级 stderr 输出:');
    console.error(lines.join('\n'));
  }
}
