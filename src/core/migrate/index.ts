// src/core/migrate/index.ts
// runMigrate 主流程 — Plan 8a Task 1.6(框架)+ Task 4.7 cp 三步走集成
// 对应 spec §1.5 主流程伪码 v4 + §3.1 错误矩阵 + §3.4 trace

import { acquireLockByPath, LockHeldError } from '../archive/lock.js';
import { existsSync } from 'node:fs';
import { mkdir, rename, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { getSource } from './sources/index.js';
import { resolveConflicts } from './conflict.js';
import { Journal, finalizeAndRename, writeReportMd } from './report.js';
import type { MigrateOptions, ClassifyCtx, TraceOp, MigrateTrace } from './types.js';

export { getSource };
export type { MigrateOptions, MigrateSource, SourceId } from './types.js';

/** runMigrate 主流程编排 */
export async function runMigrate(opts: MigrateOptions): Promise<number> {
  const cwd = process.cwd();
  const source = getSource(opts.source);

  // P1 阶段:detect 调真;后续阶段填实
  const detect = await source.detect(cwd).catch((err) => {
    return { found: false, message: (err as Error).message } as const;
  });

  if (!detect.found) {
    console.error(`source <${opts.source}> not found: ${detect.message ?? 'unknown reason'}`);
    return 2;
  }

  // ensureForgeBootstrap — 此前不存在 forge/ 时建最小 .cache(spec §1.5)
  await ensureForgeBootstrap(cwd);

  let release: (() => Promise<void>) | undefined;
  // v4 修订(codex C2):用 process.once 防 listener 累积(测试多次 runMigrate);finally 显式 off 兜底
  const sigintHandler = () => {
    console.error('\n[migrate] SIGINT received; rolling back...');
    process.exit(130);
  };
  process.once('SIGINT', sigintHandler);

  try {
    release = await acquireLockByPath(join(cwd, 'forge'), 'migrate', 'migrate.lock');

    // git repo 探测:用 git rev-parse --git-dir 试探,失败即非 git
    let inGitRepo = false;
    try {
      execSync('git rev-parse --git-dir', { cwd, stdio: 'pipe' });
      inGitRepo = true;
    } catch {
      // 非 git 仓库 / git 不可用,信号 2 自然失效
    }

    const ctx: ClassifyCtx = {
      cwd,
      archiveListPath: opts.archiveList,
      inGitRepo,
    };

    // P2/P3 实施真实 scan/classify
    const scan = await source.scan(detect.rootPath!);

    // 空源守护(spec §1.5 / §3.1):isEmpty → exit 2
    if (scan.isEmpty) {
      console.error(`[migrate] 源目录无可迁移文件,确认 source 类型与路径:${detect.rootPath}`);
      return 2;
    }

    // plan-8d / plan-8e 阶段填实 cp/regen 路径时改为 const plan = await ...
    const plan = await source.classify(scan, ctx);

    // 检查 unsafe-slug ≥ 50% 全局 skip 标记(spec §3.1 — Task 3.8)
    // 触发时 exit 4
    const globalSkip = plan.skipped.find((s) => s.source === '__GLOBAL__');
    if (globalSkip?.reason.includes('unsafe-slug-ratio-too-high')) {
      console.error(`[migrate] ${globalSkip.reason};请检查 source 文件命名后重跑`);
      return 4;
    }

    if (opts.dryRun) {
      console.log('[migrate] dry-run: not implemented yet (plan-8d report.printPlan)');
      console.log(`[migrate] source=${source.id}, scanned ${scan.files.length} files`);
      return 0;
    }

    // missingPreview 早算(B3 修订);P5 用于 archive 完整性检查
    const missingPreview = source.listMissingArtifacts(plan);
    console.log(
      `[migrate] scanned ${scan.files.length} files, missing-preview: ${missingPreview.length}`,
    );

    // 准备 ops + plan 阶段全锁定 conflict
    const targetForge = join(cwd, 'forge');
    const rawOps = source.prepareCopy(plan, targetForge);
    const conflictResult = await resolveConflicts(rawOps, {
      force: opts.force ?? false,
      forgeRoot: targetForge,
    });

    // 打开 journal(append 模式,crash 时半完成 ops 可被 readTrace 重建)
    const journalPath = join(targetForge, 'migrate-trace.json.ndjson');
    await mkdir(targetForge, { recursive: true });
    const journal = await Journal.open(journalPath);

    const ts = new Date().toISOString();
    const traceOps: TraceOp[] = [];

    try {
      for (const op of conflictResult.ops) {
        // 步骤 1:journal pending(crash 后 rollback 知道清 .tmp)
        const pendingEntry: TraceOp = {
          from: op.source,
          to: op.target,
          kind: op.kind,
          transform: [],
          validate: 'pending',
          regen: null,
          writtenAt: ts,
          status: 'pending',
        };
        await journal.append(pendingEntry);

        // 步骤 2a:读源 + transform + 写 .tmp
        let transformed = '';
        if (op.source) {
          const raw = await readFile(op.source, 'utf8');
          transformed = source.transform(raw, op.kind);
        }
        const tmpTarget = op.target + '.tmp';
        await mkdir(dirname(op.target), { recursive: true });
        await writeFile(tmpTarget, transformed, 'utf8');

        // 步骤 2b:fs.rename .tmp → 真目标(POSIX 原子)
        await rename(tmpTarget, op.target);

        // 步骤 3:journal committed
        const committedEntry: TraceOp = {
          ...pendingEntry,
          validate: 'ok', // P5 实施真实 validate;此处占位 'ok'
          status: 'committed',
        };
        await journal.append(committedEntry);
        traceOps.push(committedEntry);
      }

      // 末态 rename:journal close → finalizeAndRename → writeReportMd
      await journal.close();
      const finalTrace: MigrateTrace = {
        version: 1,
        source: source.id,
        sourceRoot: detect.rootPath!,
        ts,
        ops: traceOps,
        conflicts: conflictResult.conflicts.map((c) => ({ target: c.original, rename: c.renamed })),
        downgrades: [], // P5 Task 5.16 加
        cleanupHint:
          source.id === 'openspec'
            ? 'git rm -r openspec/'
            : 'git rm -r docs/superpowers/{specs,plans}/',
      };
      await finalizeAndRename(targetForge, finalTrace);
      await writeReportMd(targetForge, finalTrace);

      return 0;
    } catch (err) {
      // rollback:基于 journal NDJSON 反向 rm committed + 清残留 .tmp
      await journal.close().catch(() => {});
      await rollbackFromJournal(journalPath);
      throw err;
    }
  } catch (err) {
    if (err instanceof LockHeldError) {
      // P1 Task 1.7 在 CLI 入口提供友好文案;此处再次兜底友好化(spec §3.3 v4)
      console.error(
        `forge migrate is blocked by lock: pid ${err.holder.pid}, mode ${err.holder.mode}, started ${err.holder.started_at}`,
      );
      return 1;
    }
    throw err;
  } finally {
    process.off('SIGINT', sigintHandler); // v4 修订:防 listener 累积(codex C2)
    if (release) await release();
  }
}

async function ensureForgeBootstrap(cwd: string): Promise<void> {
  await mkdir(join(cwd, 'forge', '.cache'), { recursive: true });
  await mkdir(join(cwd, 'forge', '.forge-trash'), { recursive: true });
  await mkdir(join(cwd, 'forge', '.forge-ack'), { recursive: true });
}

/**
 * rollback:基于 NDJSON journal 反向 rm 已 committed 文件 + 清残留 .tmp
 * 源文件不动(只删 target 侧产物)
 */
async function rollbackFromJournal(journalPath: string): Promise<void> {
  if (!existsSync(journalPath)) return;
  const content = await readFile(journalPath, 'utf8');
  const committedTargets: string[] = [];
  const pendingTargets: string[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const op = JSON.parse(line) as TraceOp;
      if (op.status === 'committed') committedTargets.push(op.to);
      else if (op.status === 'pending') pendingTargets.push(op.to + '.tmp');
    } catch {
      // 容忍 truncate(crash 中途)
    }
  }
  // 反向 rm 已 committed(LIFO 顺序)
  for (const t of committedTargets.reverse()) {
    if (existsSync(t)) await unlink(t).catch(() => {});
  }
  // 清残留 .tmp
  for (const t of pendingTargets) {
    if (existsSync(t)) await unlink(t).catch(() => {});
  }
}
