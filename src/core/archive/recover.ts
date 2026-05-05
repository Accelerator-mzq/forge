// archive --recover 状态机 — Plan 3 Task 13
// spec §3.5:single-shot recover,失败抛 Error 让用户介入

import { readdir, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyDeltas, readDeltas } from '../specs-sync/index.js';
import type { SpecDelta } from '../specs-sync/index.js';

/** recover 返回结果 */
export interface RecoverResult {
  /** 状态机判定的 case */
  case: 'clean' | 'A' | 'B' | 'C' | 'corrupt';
  /** 人类可读说明(含操作指引) */
  message: string;
  /**
   * case='C' 时填充,提供 CLI 进行交互式二选一所需上下文。
   * 其他 case 为 undefined。
   */
  caseCData?: {
    /** archive change 目录绝对路径(用于"撤销归档"反向 rename) */
    archiveChangeDir: string;
    /** 原 change 名(去掉日期前缀,用于"撤销归档"反向 rename 目标) */
    changeOrigId: string;
    /** backup 目录绝对路径 */
    backupDir: string;
    /** archive specs 目录(用于"完成归档"重跑 Sync) */
    archiveSpecsDir: string;
    /** current specs 目录(用于"完成归档"或"撤销归档") */
    currentSpecsDir: string;
    /** 待应用 deltas(用于"完成归档") */
    deltas: SpecDelta[];
    /** backup 完整性 check 结果 */
    backupIntegrity: BackupIntegrityResult;
    /** archive 完整性 check 结果 */
    archiveIntegrity: ArchiveIntegrityResult;
  };
}

/**
 * --recover 状态机(single-shot,spec §3.5)
 *
 * - case A:archive/<date>-<id>/ 存在 + backup 存在 + deltas 全是 replace + 内容一致(已应用)
 *           → 仅删 backup（此路径实为 case B 的别名，保留兼容）
 * - case B:archive/<date>-<id>/ 存在 + backup 残留 + deltas 全是 replace
 *           且 archive specs 内容与 current specs 完全一致 → 已应用,只需删 backup
 * - case C:archive/<date>-<id>/ 存在 + backup 残留 + deltas 含 create 或内容不一致
 *           → specs 还没完全应用,状态不一致,报告需用户介入
 * - clean:backup 不存在 → 无需恢复(含"archive 有历史但无半完成状态"的正常情况)
 * - corrupt:backup 存在但 archive 不存在 → 状态损坏
 *
 * P2.1 修复:仅当 backupDir 存在时才考虑 halfArchivedChange,
 *           否则一律 case='clean'(防止已完成 archive 被误判为半归档)。
 * P2.2 修复:case B 删 backup 前要比对内容,不只看文件名(delta 全 replace 不够)。
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

  // P2.1 修复:只有 backup 存在才考虑半归档
  // backup 不存在 → 一律 clean(防止多个历史 archive 被误判为半归档)
  if (!backupDir) {
    return { case: 'clean', message: '无半完成状态需要恢复' };
  }

  // 2. backup 存在 → 扫描 archive/ 目录,找最近的半归档 change
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
  if (!halfArchivedChange) {
    // corrupt:backup 存在但 archive 不存在
    return {
      case: 'corrupt',
      message:
        'corrupt:backup 存在但找不到对应的 archive 条目,状态损坏(退出码 4),需人工介入。\n' +
        `  backup 位置:${backupDir}`,
    };
  }

  // halfArchivedChange 存在 + backupDir 存在
  const archiveSpecsDir = join(archiveDir, halfArchivedChange, 'specs');
  const deltas = await readDeltas(archiveSpecsDir, currentSpecsDir);

  if (deltas.every((d) => d.operation === 'replace')) {
    // P2.2 修复:case B 判定不只看文件名,还要比对 archive spec 与 current spec 内容一致
    const allMatch = await verifyAllReplacedAlreadyApplied(
      archiveSpecsDir,
      currentSpecsDir,
      deltas,
    );
    if (allMatch) {
      // case B:specs 已应用,backup 是旧状态的残留,安全删除
      await rm(backupDir, { recursive: true, force: true });
      return {
        case: 'B',
        message: `case B:删除残留 backup 完成(${halfArchivedChange})`,
      };
    }
  }

  // case A:backup 存在,archive 存在,specs 未完全应用(deltas 含 create)
  // 重跑 Sync(单次,失败抛 Error)
  if (deltas.every((d) => d.operation !== 'delete')) {
    await applyDeltas(currentSpecsDir, deltas);
    await rm(backupDir, { recursive: true, force: true });
    return {
      case: 'A',
      message: `case A:重跑 Sync 完成(${halfArchivedChange})`,
    };
  }

  // case C:deltas 含 delete 或内容不一致(说明状态不一致)
  // Plan 6:加完整性 check + 给 CLI 提供 caseCData 让其决定走交互(两者都完整)或退出 4(任一不完整)
  const changeOrigId = halfArchivedChange.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const archiveChangeDir = join(archiveDir, halfArchivedChange);
  const backupIntegrity = await checkBackupIntegrity(backupDir);
  const archiveIntegrity = await checkArchiveIntegrity(archiveChangeDir);

  const baseMsg =
    `case C:archive/${halfArchivedChange} 与 backup 不一致(specs 应用状态)。\n` +
    `  archive 位置:${archiveChangeDir}\n` +
    `  backup 位置:${backupDir}`;

  return {
    case: 'C',
    message: baseMsg,
    caseCData: {
      archiveChangeDir,
      changeOrigId,
      backupDir,
      archiveSpecsDir,
      currentSpecsDir,
      deltas,
      backupIntegrity,
      archiveIntegrity,
    },
  };
}

/**
 * P2.2 helper:验证所有 replace 操作的 archive spec 内容是否已应用到 current specs。
 * 只有当每个 archive spec 文件内容与 current spec 完全一致时才返回 true。
 */
async function verifyAllReplacedAlreadyApplied(
  archiveSpecsDir: string,
  currentSpecsDir: string,
  deltas: SpecDelta[],
): Promise<boolean> {
  for (const d of deltas) {
    if (d.operation !== 'replace') return false;
    // SpecDelta.name 是不含 .md 的文件名
    const archiveSpecPath = join(archiveSpecsDir, `${d.name}.md`);
    const currentSpecPath = join(currentSpecsDir, `${d.name}.md`);
    try {
      const [archiveContent, currentContent] = await Promise.all([
        readFile(archiveSpecPath, 'utf8'),
        readFile(currentSpecPath, 'utf8'),
      ]);
      if (archiveContent !== currentContent) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** backup 完整性检查结果 */
export interface BackupIntegrityResult {
  ok: boolean;
  reason?: string;
}

/**
 * 检查 backup 目录完整性(Plan 6 — spec §3.5 case C 前置条件)。
 *
 * 完整性条件:
 * 1. backup 目录可读
 * 2. 目录非空(至少一个文件,否则代表 sync 没产生备份就死了)
 * 3. 内含 .md 文件能被 utf8 读取(非二进制损坏)
 *
 * 若任一不满足 → ok=false + reason 描述哪条不满足
 */
export async function checkBackupIntegrity(backupDir: string): Promise<BackupIntegrityResult> {
  if (!existsSync(backupDir)) {
    return { ok: false, reason: 'backup 目录不存在' };
  }
  let entries: string[];
  try {
    entries = await readdir(backupDir);
  } catch (err) {
    return { ok: false, reason: `backup 目录无法读取:${(err as Error).message}` };
  }
  if (entries.length === 0) {
    return { ok: false, reason: 'backup 目录为空(预期至少一个备份文件)' };
  }
  // 抽查前 3 个 .md 文件能否 utf8 读取
  const mdFiles = entries.filter((e) => e.endsWith('.md')).slice(0, 3);
  for (const name of mdFiles) {
    try {
      await readFile(join(backupDir, name), 'utf8');
    } catch (err) {
      return { ok: false, reason: `backup/${name} 无法读取:${(err as Error).message}` };
    }
  }
  return { ok: true };
}

/** archive 完整性检查结果 */
export interface ArchiveIntegrityResult {
  ok: boolean;
  reason?: string;
}

/**
 * 检查 archive/<date>-<id>/ 目录完整性(Plan 6 — spec §3.5 case C 前置条件)。
 *
 * 完整性条件:
 * 1. 目录存在
 * 2. 包含 specs/ 子目录(可空,但必须存在)
 * 3. 包含 .verify-passed 与 .review-passed 两个 marker 文件
 * 4. 两个 marker 都能被 utf8 读取(YAML 解析交给 archive 命令的 schema 校验)
 *
 * 若任一不满足 → ok=false + reason 描述
 */
export async function checkArchiveIntegrity(archiveChangeDir: string): Promise<ArchiveIntegrityResult> {
  if (!existsSync(archiveChangeDir)) {
    return { ok: false, reason: 'archive change 目录不存在' };
  }
  if (!existsSync(join(archiveChangeDir, 'specs'))) {
    return { ok: false, reason: 'archive 内缺 specs/ 子目录' };
  }
  const verifyPath = join(archiveChangeDir, '.verify-passed');
  const reviewPath = join(archiveChangeDir, '.review-passed');
  if (!existsSync(verifyPath)) {
    return { ok: false, reason: '.verify-passed marker 不存在' };
  }
  if (!existsSync(reviewPath)) {
    return { ok: false, reason: '.review-passed marker 不存在' };
  }
  try {
    await readFile(verifyPath, 'utf8');
    await readFile(reviewPath, 'utf8');
  } catch (err) {
    return { ok: false, reason: `marker 文件读取失败:${(err as Error).message}` };
  }
  return { ok: true };
}
