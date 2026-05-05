// hash 比对 — 决定 deployAtomic 实际要写哪些文件
// spec §4.2 已存在 + 用户改动场景的 --force 覆盖语义

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { DeployPlan, PlannedFile } from './interface.js';

export interface HashCompareResult {
  /** 真正会传给 deployAtomic 的 plans(只含要写的文件) */
  filteredPlans: DeployPlan[];
  /** 已存在且被改但未 --force → 跳过 + 警告用户 */
  skippedModified: PlannedFile[];
  /** 已存在且 hash 与 shipped 相同 → no-op */
  unchanged: PlannedFile[];
  /** 实际要写(新增 + force 覆盖) */
  toWrite: PlannedFile[];
}

/**
 * 按 SHA256 hash 比对决定每个 PlannedFile 的处置。
 *
 * - 目标不存在 → toWrite
 * - 目标存在且 sha256(existing) == sha256(shipped) → unchanged(no-op)
 * - 目标存在且 hash 不同 + force=false → skippedModified(警告)
 * - 目标存在且 hash 不同 + force=true → toWrite(覆盖)
 */
export async function filterByHash(
  projectRoot: string,
  plans: DeployPlan[],
  force: boolean,
): Promise<HashCompareResult> {
  const skippedModified: PlannedFile[] = [];
  const unchanged: PlannedFile[] = [];
  const toWrite: PlannedFile[] = [];

  for (const plan of plans) {
    for (const f of plan.files) {
      // 注意:existsSync + readFile 存在 TOCTOU 窗口,单进程 CLI 场景可接受
      const targetAbs = join(projectRoot, f.relPath);
      if (!existsSync(targetAbs)) {
        toWrite.push(f);
        continue;
      }
      const existing = await readFile(targetAbs, 'utf8');
      if (sha256(existing) === sha256(f.content)) {
        unchanged.push(f);
      } else if (force) {
        toWrite.push(f);
      } else {
        skippedModified.push(f);
      }
    }
  }

  // 重新组装 plans:每个 plan 仅含 toWrite 中的文件
  const toWriteSet = new Set(toWrite);
  const filteredPlans: DeployPlan[] = plans.map((plan) => ({
    files: plan.files.filter((f) => toWriteSet.has(f)),
  }));

  return { filteredPlans, skippedModified, unchanged, toWrite };
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
