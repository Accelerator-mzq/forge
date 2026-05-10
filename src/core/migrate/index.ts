// src/core/migrate/index.ts
// runMigrate 主流程 — Plan 8a Task 1.6(框架)+ Task 4.7 cp 三步走集成
// 对应 spec §1.5 主流程伪码 v4 + §3.1 错误矩阵 + §3.4 trace
// Task 5.16:enforceArchiveIntegrity(M13) / Task 5.17:isBundled(M16)

import { acquireLockByPath, LockHeldError } from '../archive/lock.js';
import { existsSync } from 'node:fs';
import { mkdir, rename, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { getSource } from './sources/index.js';
import { resolveConflicts, ConflictExhausted } from './conflict.js';
import { Journal, finalizeAndRename, writeReportMd } from './report.js';
import type {
  MigrateOptions,
  ClassifyCtx,
  TraceOp,
  MigrateTrace,
  ClassificationPlan,
} from './types.js';

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
    // Task 5.16:改为 let 以允许 enforceArchiveIntegrity 重写 plan
    let plan = await source.classify(scan, ctx);

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

    // Task 5.16:M13 enforceArchiveIntegrity(unsafe-slug 检查通过后、dry-run 后执行)
    // M16 bundled 探测后 regenEnabled 可能变化,故在 bundled 判断前先计算 regenEnabled 初始值
    let regenEnabled = !opts.noRegenerate;

    // Task 5.17:M16 bundled 探测(env FORGE_BUNDLED=1 或 CLAUDE_PLUGIN_ROOT 含 'forge-bundled')
    if (isBundled() && regenEnabled) {
      if (source.id === 'superpowers') {
        if (opts.noInteractive) {
          // bundled + superpowers + --no-interactive:拒绝静默降级,abort exit 4
          console.error(
            '[migrate] bundled + superpowers + --no-interactive: refuse to silently degrade',
          );
          return 4;
        }
        // 交互模式:简化 prompt(P5 简化,实际后续接 readline)
        const msg = `[migrate] bundled plugin: --regenerate unavailable;此模式将产生 ${missingPreview.length} 个 [needs-fix](superpowers 必缺 proposal/specs)。继续?(默认 yes)`;
        const ok = await promptYesNo(msg);
        if (!ok) return 0;
        regenEnabled = false;
      } else {
        // openspec:静默 fallback no-regenerate(spec M16:openspec 多数已有件,可静默)
        console.warn(
          '[migrate] bundled: --regenerate unavailable, falling back to --no-regenerate',
        );
        regenEnabled = false;
      }
    }

    // M13 enforceArchiveIntegrity:用经 M16 更新的 regenEnabled
    const integrityResult = enforceArchiveIntegrity(
      plan,
      regenEnabled,
      opts.noInteractive ?? false,
    );
    if (integrityResult.abort) {
      return 4;
    }
    plan = integrityResult.plan;
    const downgrades = integrityResult.downgrades;
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

      // 末态 rename:journal close → writeReportMd → finalizeAndRename
      // spec §1.5:report 先写(失败可降级 stderr),finalize 是最后关键路径
      await journal.close();
      const finalTrace: MigrateTrace = {
        version: 1,
        source: source.id,
        sourceRoot: detect.rootPath!,
        ts,
        ops: traceOps,
        conflicts: conflictResult.conflicts.map((c) => ({ target: c.original, rename: c.renamed })),
        downgrades, // Task 5.16:enforceArchiveIntegrity 降级记录
        cleanupHint:
          source.id === 'openspec'
            ? 'git rm -r openspec/'
            : 'git rm -r docs/superpowers/{specs,plans}/',
      };
      // spec §1.5:report 先写(失败可降级 stderr),finalize 是关键路径放最后
      await writeReportMd(targetForge, finalTrace);
      await finalizeAndRename(targetForge, finalTrace);

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
    // C-1(spec §3.1):ConflictExhausted → exit 4;journal 尚未打开无需 rollback
    if (err instanceof ConflictExhausted) {
      console.error(`[migrate] ${err.message};请清理 forge/changes/ 后重跑`);
      return 4;
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
 *
 * I-1 修:crash 在 rename→committed 之间时,journal 只有 pending 没有 committed。
 * 此时 .tmp 已被 rename 走,真目标 op.to 留盘。rollback 需同时处理:
 *   - .tmp 存在 → unlink .tmp(rename 未完成)
 *   - .tmp 不在但真目标存在 → unlink 真目标(rename 完成但 committed 未写)
 */
async function rollbackFromJournal(journalPath: string): Promise<void> {
  if (!existsSync(journalPath)) return;
  const content = await readFile(journalPath, 'utf8');
  const committedTargets: string[] = [];
  // I-1:pending 同时记录 tmpPath 和 realPath
  const pendingTargets: Array<{ tmpPath: string; realPath: string }> = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const op = JSON.parse(line) as TraceOp;
      if (op.status === 'committed') committedTargets.push(op.to);
      else if (op.status === 'pending') {
        pendingTargets.push({ tmpPath: op.to + '.tmp', realPath: op.to });
      }
    } catch {
      // 容忍 truncate(crash 中途)
    }
  }
  // 反向 rm 已 committed(LIFO 顺序);M-2:失败加 stderr 输出
  for (const t of committedTargets.reverse()) {
    if (existsSync(t)) {
      await unlink(t).catch((e) => {
        console.error(`[migrate] rollback unlink committed failed: ${t}`, (e as Error).message);
      });
    }
  }
  // I-1:.tmp 优先删;.tmp 不在则删真目标(rename 发生但 committed 未写);M-2:失败加 stderr
  for (const { tmpPath, realPath } of pendingTargets) {
    if (existsSync(tmpPath)) {
      await unlink(tmpPath).catch((e) => {
        console.error(`[migrate] rollback unlink tmp failed: ${tmpPath}`, (e as Error).message);
      });
    } else if (existsSync(realPath)) {
      // rename 已发生但 committed 未写 → 清掉真目标(孤儿文件)
      await unlink(realPath).catch((e) => {
        console.error(`[migrate] rollback unlink real failed: ${realPath}`, (e as Error).message);
      });
    }
  }
}

// ============================================================================
// Task 5.16:M13 enforceArchiveIntegrity
// ============================================================================

/**
 * enforceArchiveIntegrity:archive change 缺 proposal/specs 时:
 * - regenEnabled:留给 LLM 补,函数不动
 * - regen 关 + --no-interactive:abort exit 4
 * - regen 关 + 交互:降级 active(P5 简化:console.warn + 默认降级,不接 readline)
 */
function enforceArchiveIntegrity(
  plan: ClassificationPlan,
  regenEnabled: boolean,
  noInteractive: boolean,
): {
  plan: ClassificationPlan;
  downgrades: { change: string; from: string; to: string; reason: string }[];
  abort: boolean;
} {
  const downgrades: { change: string; from: string; to: string; reason: string }[] = [];
  // shallow clone changes(防 in-place mutation)
  const changes = plan.changes.map((c) => ({ ...c }));

  for (const c of changes) {
    if (c.classification !== 'archive') continue;
    const hasProposal = !!c.artifacts.proposal;
    const hasSpecs = !!(c.artifacts.specs && c.artifacts.specs.length > 0);
    if (hasProposal && hasSpecs) continue; // archive 完整 OK

    if (regenEnabled) continue; // 留给 LLM 补;本函数不动

    // regen 关 / 拒绝 → 必须降级或 abort
    if (noInteractive) {
      console.error(
        `[migrate] M13 archive 完整性不可达(change: ${c.slug});--no-interactive 模式 abort`,
      );
      return { plan: { ...plan, changes }, downgrades, abort: true };
    }
    // 交互模式:简化为 console.warn + 默认降级 active(P5 简化版,实际后续接 readline 或 prompts)
    console.warn(
      `[migrate] M13 archive 完整性不可达(change: ${c.slug});默认降级 active(--no-regenerate / 用户拒绝)`,
    );
    c.classification = 'active';
    downgrades.push({
      change: c.slug,
      from: 'archive',
      to: 'active',
      reason: 'M13: missing proposal/specs;default downgrade(no-regenerate path)',
    });
  }
  return { plan: { ...plan, changes }, downgrades, abort: false };
}

// ============================================================================
// Task 5.17:M16 bundled 探测 + promptYesNo
// ============================================================================

/**
 * isBundled:检测当前是否运行在 bundled plugin 环境中。
 * 探测方式:env FORGE_BUNDLED=1 或 CLAUDE_PLUGIN_ROOT 含 'forge-bundled'
 */
function isBundled(): boolean {
  return (
    process.env['FORGE_BUNDLED'] === '1' ||
    (process.env['CLAUDE_PLUGIN_ROOT']?.includes('forge-bundled') ?? false)
  );
}

/**
 * promptYesNo:简化 readline yes/no prompt。
 * P5 简化:console.log + 默认返 true(继续)。
 * 后续 P6 接真实 readline/prompts 包。
 */
async function promptYesNo(message: string): Promise<boolean> {
  console.log(message);
  return true;
}
