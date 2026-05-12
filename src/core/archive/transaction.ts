// archive 顺序原子化:Move→Sync(spec §3.5)
// Plan 3 Task 11:archive transaction 实现
// plan-9e1 Task 3 修订:加 archive_summary `.tmp` 写入(Move 前)+ rename 到正式名(Move 后)+ 失败回滚

import { rename, mkdir, rm, cp, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { readDeltas, applyDeltas } from '../specs-sync/index.js';
import type { ArchiveSummary } from '../schemas/archive-summary.js';

/** archiveTransaction 输入参数 */
export interface ArchiveTransactionInput {
  /** <project>/forge/ 目录绝对路径 */
  forgeRoot: string;
  /** change id,如 'add-login' */
  changeId: string;
  /** 归档日期,格式 'YYYY-MM-DD',如 '2026-05-04' */
  archiveDate: string;
  /**
   * plan-9e1 Task 3 新增:可选 archive_summary 对象
   * - 传:Move 前在 source 写 archive_summary.tmp.yaml,Move 后 rename → archive_summary.yaml
   * - 不传:沿 v0.4 老行为,不产 summary(向后兼容)
   */
  archiveSummary?: ArchiveSummary;
}

/**
 * archive 顺序原子化:Move→Sync(spec §3.5)
 *
 * 阶段 0 — .tmp 写(plan-9e1 Task 3 新增,可选):
 *   在 source 目录写 archive_summary.tmp.yaml,跟随 Move 一起搬到 archive 目录
 *
 * 阶段 1 — Move(原子):
 *   fs.rename forge/changes/<id>/ → forge/changes/archive/<date>-<id>/
 *
 * 阶段 1.5 — rename .tmp → 正式名(plan-9e1 Task 3 新增,可选):
 *   archive 目录内 archive_summary.tmp.yaml → archive_summary.yaml
 *
 * 阶段 1.6 — Backup(独立阶段,失败立即反向 rename + 不进 Sync)
 *
 * 阶段 2 — Sync(可回滚):
 *   a. 备份当前 forge/specs/ → .cache/archive-sync-backup-<pid>/
 *   b. readDeltas + applyDeltas
 *   c. 成功 → 删 backup
 *   d. 失败 → 从 backup 恢复 specs/ + 反向 rename archive 回 changes/<id>/
 *
 * crash/SIGKILL 由 OS fs.rename 原子性保证(best-effort)。
 * --recover 由 Plan 3 Task 13 处理。
 */
export async function archiveTransaction(input: ArchiveTransactionInput): Promise<void> {
  const { forgeRoot, changeId, archiveDate, archiveSummary } = input;

  // 路径计算
  const sourceDir = join(forgeRoot, 'changes', changeId);
  const archiveTargetDir = join(forgeRoot, 'changes', 'archive', `${archiveDate}-${changeId}`);
  const currentSpecsDir = join(forgeRoot, 'specs');
  const backupDir = join(forgeRoot, '.cache', `archive-sync-backup-${process.pid}`);
  // plan-9e1 Task 3:archive_summary 路径(.tmp 与正式名)
  const tmpSummaryInSource = join(sourceDir, 'archive_summary.tmp.yaml');
  const tmpSummaryInArchive = join(archiveTargetDir, 'archive_summary.tmp.yaml');
  const finalSummaryInArchive = join(archiveTargetDir, 'archive_summary.yaml');

  // —— 阶段 0(plan-9e1 Task 3):Move 前在 source 写 archive_summary.tmp.yaml ——
  // 沿 design §2.4.5 step 3:archive_summary.tmp.yaml 写到 source 目录,跟随 Move 一起搬到 archive 目录
  // 失败处理:写入失败 → 抛错(整体 archive 失败,markers 未移走,source 仅 .tmp 残留 → finally 兜底 unlink)
  if (archiveSummary) {
    try {
      const yamlText = stringifyYaml(archiveSummary);
      await writeFile(tmpSummaryInSource, yamlText, 'utf8');
    } catch (writeErr) {
      // .tmp 写失败 → source 可能残留 partial 文件 → unlink + 抛错(整体 archive 失败)
      if (existsSync(tmpSummaryInSource)) {
        await unlink(tmpSummaryInSource).catch(() => {
          /* unlink 失败也忽略,把原始 write 错误抛出 */
        });
      }
      throw new Error(`archive_summary.tmp.yaml 写入失败: ${(writeErr as Error).message}`);
    }
  }

  // —— 阶段 1:Move(单原子 fs.rename)——
  // 确保 archive 父目录存在,但不创建目标目录本身(rename 负责)
  await mkdir(dirname(archiveTargetDir), { recursive: true });
  // 若目标已存在,rename 会失败(EEXIST/ENOTEMPTY),即 Move 失败路径
  try {
    await rename(sourceDir, archiveTargetDir);
  } catch (moveErr) {
    // plan-9e1 Task 3:Move 失败 → source 残留 .tmp → unlink + 抛错
    if (archiveSummary && existsSync(tmpSummaryInSource)) {
      await unlink(tmpSummaryInSource).catch(() => {
        /* 忽略 unlink 失败,把原始 move 错误抛出 */
      });
    }
    throw moveErr;
  }

  // —— 阶段 1.5(plan-9e1 Task 3):Move 后 rename .tmp → 正式名 ——
  // 沿 design §2.4.5 step 5:archive 目录内 archive_summary.tmp.yaml → archive_summary.yaml
  // 失败处理:rename 失败极罕见(同目录 rename);此时 archive 目录已 move,数据已在 archive,
  //   按 design §2.4.5 不强制回滚 Move,改提示用户走 forge archive --resume-summary <id>
  let summaryRenamed = false;
  if (archiveSummary) {
    try {
      await rename(tmpSummaryInArchive, finalSummaryInArchive);
      summaryRenamed = true;
    } catch (renameErr) {
      // 不回滚 Move(数据已在 archive),抛特殊错误供 caller 提示用户 --resume-summary
      throw new Error(
        `archive_summary rename 失败(.tmp → 正式名);archive 已 move 完成但 summary 仍是 .tmp 名。\n` +
          `请运行:forge archive --resume-summary ${archiveDate}-${changeId}\n` +
          `原始错误:${(renameErr as Error).message}`,
      );
    }
  }

  // summaryRenamed 仅作后续可能扩展使用(当前阶段:已 rename 或无 summary)
  void summaryRenamed;

  // —— 阶段 1.6:Backup(独立阶段,失败立即反向 rename + 不进 Sync)——
  // P2.2 修复:backup 独立成阶段,失败时 specs 不被破坏
  let backupSucceeded = false;
  try {
    if (existsSync(currentSpecsDir)) {
      await cp(currentSpecsDir, backupDir, { recursive: true });
    }
    backupSucceeded = true;
  } catch (backupErr) {
    // 部分 backup 残留 → 清理
    if (existsSync(backupDir)) {
      await rm(backupDir, { recursive: true, force: true });
    }
    // 反向 rename:把已移走的 change 目录恢复(specs/ 未动)
    try {
      await rename(archiveTargetDir, sourceDir);
      // v2 MAJOR 1 修订:反向 Move 后 unlink 任何 summary 文件(无论 .tmp / 正式名),
      // 让回滚状态完全等价"事务开始前 — 无 summary 残留",重试 archive 时重新生成
      if (archiveSummary) {
        const finalInSource = join(sourceDir, 'archive_summary.yaml');
        if (existsSync(finalInSource)) {
          await unlink(finalInSource).catch(() => {
            /* unlink 失败忽略 — backup 错是 root cause */
          });
        }
        if (existsSync(tmpSummaryInSource)) {
          await unlink(tmpSummaryInSource).catch(() => {});
        }
      }
    } catch {
      // 反向 rename 失败也忽略,把原始 backup 错抛出去(用户能看到 specs/ 未变)
    }
    throw new Error(`Backup failed before sync: ${(backupErr as Error).message}`);
  }

  // —— 阶段 2:Sync(可回滚,只在 backup 成功时启用 backup 路径)——
  try {
    // 2a. 读 deltas + 应用
    const archiveSpecsDir = join(archiveTargetDir, 'specs');
    const deltas = await readDeltas(archiveSpecsDir, currentSpecsDir);
    await applyDeltas(currentSpecsDir, deltas);

    // 2b. 成功 → 清理 backup
    if (existsSync(backupDir)) {
      await rm(backupDir, { recursive: true, force: true });
    }
  } catch (syncErr) {
    // —— 回滚路径(P2.3 修复:用 rolledBack flag 防止 throw 被 inner catch 误捕获)——
    let rolledBack = false;
    try {
      // a. 仅 backupSucceeded 时才从 backup 恢复 specs/
      if (backupSucceeded && existsSync(backupDir)) {
        // 清除(可能)已部分修改的 specs/
        await rm(currentSpecsDir, { recursive: true, force: true });
        await cp(backupDir, currentSpecsDir, { recursive: true });
      }

      // b. 反向 rename:archive/<date>-<id>/ 回 changes/<id>/
      await rename(archiveTargetDir, sourceDir);

      // v2 MAJOR 1 修订:反向 Move 后 unlink 任何 summary 文件(无论 .tmp / 正式名)
      if (archiveSummary) {
        const finalInSource = join(sourceDir, 'archive_summary.yaml');
        if (existsSync(finalInSource)) {
          await unlink(finalInSource).catch(() => {
            /* unlink 失败忽略 — Sync 错是 root cause */
          });
        }
        if (existsSync(tmpSummaryInSource)) {
          await unlink(tmpSummaryInSource).catch(() => {});
        }
      }

      // c. 清理 backup
      if (existsSync(backupDir)) {
        await rm(backupDir, { recursive: true, force: true });
      }

      rolledBack = true;
    } catch (rbErr) {
      // 回滚本身也失败 — 人工介入
      throw new Error(
        `Sync failed AND rollback failed: ${(syncErr as Error).message} / ${(rbErr as Error).message}\n` +
          `请手动检查 ${backupDir} 和 ${archiveTargetDir}`,
      );
    }
    // 回滚成功 → 在 inner try 外面 throw,避免被 inner catch 误捕获
    if (rolledBack) {
      throw new Error(`Sync failed and rolled back: ${(syncErr as Error).message}`);
    }
  }
}
