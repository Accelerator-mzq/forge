// src/core/migrate/index.ts
// runMigrate 主流程 — Plan 8a Task 1.6(框架)+ 后续 phase 填实
// 对应 spec §1.5 主流程伪码 v4

import { acquireLockByPath, LockHeldError } from '../archive/lock.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { getSource } from './sources/index.js';
import type { MigrateOptions, ClassifyCtx } from './types.js';

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

    // P4 / P5 实施 conflict / cp / regenerate / report
    throw new Error('runMigrate copy / regenerate path not implemented (plan-8d / plan-8e)');
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
