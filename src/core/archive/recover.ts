// archive --recover 状态机 — Plan 3 Task 13
// spec §3.5:single-shot recover,失败抛 Error 让用户介入

import { readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyDeltas, readDeltas } from '../specs-sync/index.js';

/** recover 返回结果 */
export interface RecoverResult {
  /** 状态机判定的 case */
  case: 'clean' | 'A' | 'B' | 'C' | 'corrupt';
  /** 人类可读说明(含操作指引) */
  message: string;
}

/**
 * --recover 状态机(single-shot,spec §3.5)
 *
 * - case A:archive/<date>-<id>/ 存在 + backup 不存在
 *           → sync 没跑完,重跑 applyDeltas
 * - case B:archive/<date>-<id>/ 存在 + backup 残留 + deltas 全是 replace
 *           → specs 已应用,只需删 backup
 * - case C:archive/<date>-<id>/ 存在 + backup 残留 + deltas 含 create
 *           → specs 还没完全应用,状态不一致,报告需用户介入
 * - clean:archive 和 backup 都不存在 → 无需恢复
 * - corrupt:backup 存在但 archive 不存在 → 状态损坏
 *
 * @param forgeRoot forge 根目录(如 forge/)绝对路径
 */
export async function recover(forgeRoot: string): Promise<RecoverResult> {
  const cacheDir = join(forgeRoot, '.cache');
  const archiveDir = join(forgeRoot, 'changes', 'archive');
  const currentSpecsDir = join(forgeRoot, 'specs');

  // 1. 扫描 .cache/ 找 archive-sync-backup-* 目录
  let backupDir: string | null = null;
  try {
    const cacheEntries = await readdir(cacheDir);
    // 找所有 backup 目录,取第一个(通常只有一个)
    const backups = cacheEntries.filter((e) => e.startsWith('archive-sync-backup-'));
    if (backups.length > 0) {
      backupDir = join(cacheDir, backups[0]!);
    }
  } catch {
    // .cache/ 目录不存在,忽略(backupDir 保持 null)
  }

  // 2. 扫描 archive/ 目录,找最近的半归档 change
  let halfArchivedChange: string | null = null;
  if (existsSync(archiveDir)) {
    try {
      const archiveEntries = await readdir(archiveDir);
      // 按字典序倒排,取最近的一个条目(日期前缀 YYYY-MM-DD-<id> 排序即时间序)
      if (archiveEntries.length > 0) {
        halfArchivedChange = archiveEntries.sort().reverse()[0] ?? null;
      }
    } catch {
      // archive 目录无法读取,忽略
    }
  }

  // 3. 状态机判定
  if (!halfArchivedChange && !backupDir) {
    // 干净状态:什么都不需要恢复
    return { case: 'clean', message: '无半完成状态需要恢复' };
  }

  if (halfArchivedChange && !backupDir) {
    // case A:archive 已经移完,但 sync 没跑(没有 backup 说明 Sync 阶段还没开始)
    // 重跑 Sync(单次,失败抛 Error)
    const archiveSpecsDir = join(archiveDir, halfArchivedChange, 'specs');
    const deltas = await readDeltas(archiveSpecsDir, currentSpecsDir);
    await applyDeltas(currentSpecsDir, deltas);
    return {
      case: 'A',
      message: `case A:重跑 Sync 完成(${halfArchivedChange})`,
    };
  }

  if (halfArchivedChange && backupDir) {
    // 检查 specs/ 当前状态与 archive specs 的关系
    const archiveSpecsDir = join(archiveDir, halfArchivedChange, 'specs');
    const deltas = await readDeltas(archiveSpecsDir, currentSpecsDir);

    if (deltas.every((d) => d.operation === 'replace')) {
      // case B:deltas 全是 replace(说明 currentSpecsDir 已有同名文件 → 已应用)
      // backup 是旧状态的残留,安全删除
      await rm(backupDir, { recursive: true, force: true });
      return {
        case: 'B',
        message: `case B:删除残留 backup 完成(${halfArchivedChange})`,
      };
    }

    // case C:deltas 含 create(说明 currentSpecsDir 里还缺文件 → specs 未完全应用)
    // 不一致,需要用户手动介入
    const changeOrigId = halfArchivedChange.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    return {
      case: 'C',
      message:
        `case C:archive/${halfArchivedChange} 与 backup 不一致,需用户介入。请手动选择:\n` +
        `  [完成归档] 恢复 specs 后再跑 forge archive --recover\n` +
        `  [撤销归档] mv ${join(archiveDir, halfArchivedChange)} ${join(forgeRoot, 'changes', changeOrigId)}\n` +
        `  backup 位置:${backupDir}`,
    };
  }

  // corrupt:backup 存在但 archive 不存在(halfArchivedChange 为 null)
  return {
    case: 'corrupt',
    message:
      'corrupt:backup 存在但找不到对应的 archive 条目,状态损坏(退出码 4),需人工介入。\n' +
      `  backup 位置:${backupDir}`,
  };
}
