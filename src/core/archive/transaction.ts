// archive 顺序原子化:Move→Sync(spec §3.5)
// Plan 3 Task 11:archive transaction 实现

import { rename, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { readDeltas, applyDeltas } from '../specs-sync/index.js';

/** archiveTransaction 输入参数 */
export interface ArchiveTransactionInput {
  /** <project>/forge/ 目录绝对路径 */
  forgeRoot: string;
  /** change id,如 'add-login' */
  changeId: string;
  /** 归档日期,格式 'YYYY-MM-DD',如 '2026-05-04' */
  archiveDate: string;
}

/**
 * archive 顺序原子化:Move→Sync(spec §3.5)
 *
 * 阶段 1 — Move(原子):
 *   fs.rename forge/changes/<id>/ → forge/changes/archive/<date>-<id>/
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
  const { forgeRoot, changeId, archiveDate } = input;

  // 路径计算
  const sourceDir = join(forgeRoot, 'changes', changeId);
  const archiveTargetDir = join(forgeRoot, 'changes', 'archive', `${archiveDate}-${changeId}`);
  const currentSpecsDir = join(forgeRoot, 'specs');
  const backupDir = join(forgeRoot, '.cache', `archive-sync-backup-${process.pid}`);

  // —— 阶段 1:Move(单原子 fs.rename)——
  // 确保 archive 父目录存在,但不创建目标目录本身(rename 负责)
  await mkdir(dirname(archiveTargetDir), { recursive: true });
  // 若目标已存在,rename 会失败(EEXIST/ENOTEMPTY),即 Move 失败路径
  await rename(sourceDir, archiveTargetDir);

  // —— 阶段 2:Sync(可回滚)——
  try {
    // 2a. 备份当前 specs/(用于回滚)
    if (existsSync(currentSpecsDir)) {
      await cp(currentSpecsDir, backupDir, { recursive: true });
    }

    // 2b. 读 deltas + 应用
    const archiveSpecsDir = join(archiveTargetDir, 'specs');
    const deltas = await readDeltas(archiveSpecsDir, currentSpecsDir);
    await applyDeltas(currentSpecsDir, deltas);

    // 2c. 成功 → 清理 backup
    if (existsSync(backupDir)) {
      await rm(backupDir, { recursive: true, force: true });
    }
  } catch (syncErr) {
    // —— 回滚路径(P2.3 修复:用 rolledBack flag 防止 throw 被 inner catch 误捕获)——
    let rolledBack = false;
    try {
      // a. 从 backup 恢复 specs/
      if (existsSync(backupDir)) {
        // 清除(可能)已部分修改的 specs/
        await rm(currentSpecsDir, { recursive: true, force: true });
        await cp(backupDir, currentSpecsDir, { recursive: true });
      }

      // b. 反向 rename:archive/<date>-<id>/ 回 changes/<id>/
      await rename(archiveTargetDir, sourceDir);

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
