// adapter 三阶段原子化部署 — spec §4.2

import { mkdir, writeFile, rename, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { DeployPlan } from './interface.js';

/**
 * 部署多个 plan 到 projectRoot,使用 Stage→Backup→Commit 三阶段原子化(spec §4.2)。
 *
 * 1. **Stage**:把所有 plan 的文件先写到 forge/.cache/staging-<pid>/ 镜像目录
 * 2. **Backup**:对每个目标位置(若已存在),备份到 forge/.cache/backup-<pid>/
 * 3. **Commit**:逐个目标 rm 旧 + rename staging → 目标
 *    - 任一失败 → 反向回滚:已 rename 的 adapter 从 backup 恢复
 *    - 反向回滚也失败 → abort,退出码 3,人工介入
 */
export async function deployAtomic(projectRoot: string, plans: DeployPlan[]): Promise<void> {
  const pid = process.pid;
  const cacheDir = join(projectRoot, 'forge', '.cache');
  const stagingDir = join(cacheDir, `staging-${pid}`);
  const backupDir = join(cacheDir, `backup-${pid}`);

  // 确保 cache 父目录存在
  await mkdir(cacheDir, { recursive: true });

  // 收集所有计划文件
  const allFiles = plans.flatMap((p) => p.files);

  // 阶段 1:Stage
  try {
    for (const f of allFiles) {
      const stagedAbs = join(stagingDir, f.relPath);
      await mkdir(dirname(stagedAbs), { recursive: true });
      await writeFile(stagedAbs, f.content, 'utf8');
    }
  } catch (err) {
    await rm(stagingDir, { recursive: true, force: true });
    throw new Error(`Stage failed: ${(err as Error).message}`);
  }

  // 阶段 2:Backup(对每个**顶层目标目录**备份,而不是对每个文件)
  // 收集 plan 目标 top-level dirs(如 .claude/skills/forge-using-forge/)
  const targetDirs = collectTargetDirs(allFiles);
  try {
    for (const targetRel of targetDirs) {
      const targetAbs = join(projectRoot, targetRel);
      if (existsSync(targetAbs)) {
        const backupAbs = join(backupDir, targetRel);
        await mkdir(dirname(backupAbs), { recursive: true });
        await cp(targetAbs, backupAbs, { recursive: true });
      }
    }
  } catch (err) {
    await rm(stagingDir, { recursive: true, force: true });
    await rm(backupDir, { recursive: true, force: true });
    throw new Error(`Backup failed: ${(err as Error).message}`);
  }

  // 阶段 3:Commit(逐文件 rename)
  const committed: string[] = [];
  try {
    for (const f of allFiles) {
      const stagedAbs = join(stagingDir, f.relPath);
      const targetAbs = join(projectRoot, f.relPath);
      await mkdir(dirname(targetAbs), { recursive: true });
      // 已存在则先删
      if (existsSync(targetAbs)) {
        await rm(targetAbs, { force: true });
      }
      await rename(stagedAbs, targetAbs);
      committed.push(f.relPath);
    }
    // 全部成功 → 清理
    await rm(stagingDir, { recursive: true, force: true });
    await rm(backupDir, { recursive: true, force: true });
  } catch (err) {
    // 反向回滚
    try {
      for (const rel of committed) {
        const targetAbs = join(projectRoot, rel);
        const backupAbs = join(backupDir, rel);
        if (existsSync(targetAbs)) await rm(targetAbs, { force: true });
        if (existsSync(backupAbs)) await cp(backupAbs, targetAbs, { recursive: true });
      }
      await rm(stagingDir, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
      throw new Error(`Commit failed and rolled back: ${(err as Error).message}`);
    } catch (rollbackErr) {
      // 回滚也失败
      throw new Error(
        `Commit failed AND rollback failed: ${(err as Error).message} / ${(rollbackErr as Error).message}\n` +
          `请手动清理 ${stagingDir} 和 ${backupDir},然后从 backup 恢复目标位置`,
      );
    }
  }
}

/** 收集"被该 plan 影响的顶层目标目录"用于 backup */
function collectTargetDirs(files: { relPath: string }[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    // 取 relPath 的第二层目录(如 .claude/skills/),adapter 实际部署都是这个层级
    const parts = f.relPath.split('/');
    if (parts.length >= 2) {
      dirs.add(parts.slice(0, 2).join('/'));
    } else {
      dirs.add(parts[0] ?? '');
    }
  }
  return Array.from(dirs).filter(Boolean);
}
