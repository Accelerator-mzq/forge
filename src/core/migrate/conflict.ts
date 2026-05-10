// src/core/migrate/conflict.ts
// conflict 处理 — Plan 8d Task 4.1
// Spec §2.4 冲突表:同名 --imported-N(撞 99 abort);--force trash 路径

import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import type { CopyOp } from './types.js';

// 上限 99(spec §2.4):撞至 --imported-99 全占即 abort
const DEFAULT_MAX_IMPORTED = 99;

// --imported-N 全占时 throw
export class ConflictExhausted extends Error {
  constructor(public readonly target: string) {
    super(`--imported-1..${DEFAULT_MAX_IMPORTED} 全占;无法分配新名:${target}`);
    this.name = 'ConflictExhausted';
  }
}

export interface ResolveConflictsOptions {
  /** --force 模式:旧目标 mv 到 trash */
  force: boolean;
  /** --force 时必填:用于 trash 路径计算 */
  forgeRoot?: string;
  /** trash 时间戳;不传默认 ISO now() */
  ts?: string;
}

export interface ConflictResult {
  /** 重写过的 op(target 可能改名) */
  ops: CopyOp[];
  /** 改名记录(原 target → 新 target) */
  conflicts: Array<{ original: string; renamed: string }>;
  /** trash 记录(--force 模式) */
  trashEntries: Array<{ original: string; trashed: string }>;
}

/**
 * plan 阶段全锁定:扫所有 op,目标存在则递增 --imported-N 直到唯一;
 * --force 则旧目标先 mv 到 .forge-trash/<ts>/。
 *
 * reservedTargets 防同 plan 内多 op 抢同 imported-N slot。
 */
export async function resolveConflicts(
  ops: CopyOp[],
  opts: ResolveConflictsOptions,
): Promise<ConflictResult> {
  const conflicts: ConflictResult['conflicts'] = [];
  const trashEntries: ConflictResult['trashEntries'] = [];
  // 同 plan 内已分配的 target 集合(防重)
  const reservedTargets = new Set<string>();
  const newOps: CopyOp[] = [];

  // ts 用作 trash 子目录名;: 在 windows 文件名非法,统一替换
  const ts = opts.ts ?? new Date().toISOString().replace(/[:.]/g, '-');

  for (const op of ops) {
    const conflictOnDisk = existsSync(op.target);
    const conflictReserved = reservedTargets.has(op.target);

    if (!conflictOnDisk && !conflictReserved) {
      // 目标无冲突:直接加入并 reserve
      reservedTargets.add(op.target);
      newOps.push(op);
      continue;
    }

    if (opts.force && conflictOnDisk) {
      // --force 模式:旧目标 mv 到 trash,目标路径不变
      // reserved 冲突不算 force 命中(同 plan 内前后 op 互撞)
      if (!opts.forgeRoot) {
        throw new Error('--force 需要 forgeRoot 参数');
      }
      const trashRoot = join(opts.forgeRoot, '.forge-trash', ts);
      await mkdir(trashRoot, { recursive: true });
      const trashed = join(trashRoot, basename(op.target));
      await rename(op.target, trashed);
      trashEntries.push({ original: op.target, trashed });
      reservedTargets.add(op.target);
      newOps.push(op);
      continue;
    }

    // 非 --force 或 reserved 冲突:递增 --imported-N 找空位(用默认 MAX=99)
    const newTarget = findFreeImportedSlot(op.target, reservedTargets);
    reservedTargets.add(newTarget);
    conflicts.push({ original: op.target, renamed: newTarget });
    // 记录 renamedFrom 以供 report 使用
    newOps.push({ ...op, target: newTarget, renamedFrom: op.target });
  }

  return { ops: newOps, conflicts, trashEntries };
}

/**
 * 找到第一个可用的 --imported-N 路径;target 末级目录加 --imported-N 后缀。
 *
 * 示例:
 *   /forge/changes/add-bar/proposal.md(N=1)
 *   → /forge/changes/add-bar--imported/proposal.md
 *   → /forge/changes/add-bar--imported-2/proposal.md(N=2)
 *
 * 撞至 maxImported → throw ConflictExhausted。
 *
 * export 用于测试:传入小 maxImported(如 2)可快速触发 ConflictExhausted 而无需 mkdir 99 次。
 * resolveConflicts 内部调用时使用默认值 DEFAULT_MAX_IMPORTED(=99),行为不变。
 */
export function findFreeImportedSlot(
  target: string,
  reserved: Set<string>,
  maxImported = DEFAULT_MAX_IMPORTED,
): string {
  const dir = dirname(target);
  const file = basename(target);
  // 兼容 unix(/) 和 windows(\) 两种分隔符
  const dirParts = dir.split(/[\\/]/);
  const lastDir = dirParts[dirParts.length - 1];
  if (!lastDir) throw new Error(`unexpected target without parent dir: ${target}`);

  for (let n = 1; n <= maxImported; n++) {
    // n=1 用 '--imported',n>=2 用 '--imported-N'
    const suffix = n === 1 ? '--imported' : `--imported-${n}`;
    // 重组:去除末段,加上末段+suffix,再 native join + file
    // join() 会 normalize,保证 windows 下反斜杠一致
    const newDir = [...dirParts.slice(0, -1), lastDir + suffix].join('/');
    const candidate = join(newDir, file);
    if (!existsSync(candidate) && !reserved.has(candidate)) {
      return candidate;
    }
  }
  throw new ConflictExhausted(target);
}
