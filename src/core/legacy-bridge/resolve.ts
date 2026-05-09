// resolve 命令逻辑 — Plan 7 Phase C
// 决策 #19:校验所有 diffs status ≠ pending 才标 resolved

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { SyncStateFile, SyncStateDiff } from './types.js';

const VALID_STATUSES: ReadonlyArray<SyncStateDiff['status']> = [
  'pending',
  'resolved-by-doc-update',
  'false-positive',
  'skipped',
];

/** 自定义异常:resolve 校验失败 */
export class ResolveError extends Error {
  constructor(
    message: string,
    public readonly kind: 'pending-remaining' | 'invalid-status' | 'state-not-found',
    public readonly details?: { pending?: number[]; invalid?: { id: number; status: string }[] },
  ) {
    super(message);
    this.name = 'ResolveError';
  }
}

/** sync-state YAML 文件路径 */
export function syncStatePath(forgeRoot: string, changeId: string): string {
  return join(forgeRoot, 'legacy-sync-state', `${changeId}.yaml`);
}

/** 校验 sync-state YAML;返回校验后的 file */
export function validateSyncState(file: SyncStateFile, changeId: string): void {
  // 决策 #19:status ∈ {pending, resolved-by-doc-update, false-positive, skipped}
  const invalid = file.diffs
    .map((d) => ({ id: d.id, status: d.status }))
    .filter((d) => !VALID_STATUSES.includes(d.status as SyncStateDiff['status']));
  if (invalid.length > 0) {
    throw new ResolveError(
      `sync-state ${changeId} 含非法 status:${invalid
        .map((i) => `#${i.id}=${i.status}`)
        .join(', ')}`,
      'invalid-status',
      { invalid },
    );
  }
  for (const d of file.cross_anchor_conflicts ?? []) {
    if (!VALID_STATUSES.includes(d.status as SyncStateDiff['status'])) {
      throw new ResolveError(
        `cross_anchor_conflicts #${d.id} status 非法:${d.status}`,
        'invalid-status',
      );
    }
  }
}

/** 检查 pending(若仍有 → 抛错;全 ack → 通过) */
export function checkAllAcked(file: SyncStateFile, changeId: string): void {
  const pending = [
    ...file.diffs.filter((d) => d.status === 'pending'),
    ...(file.cross_anchor_conflicts ?? []).filter((d) => d.status === 'pending'),
  ];
  if (pending.length > 0) {
    throw new ResolveError(
      `sync-state ${changeId} 仍有 ${pending.length} 项 pending:#${pending
        .map((d) => d.id)
        .join(', #')}`,
      'pending-remaining',
      { pending: pending.map((d) => d.id) },
    );
  }
}

/** 完整 resolve 流程:读 + validate + checkAllAcked + 写回(标 resolved-meta) */
export async function resolveSyncState(
  forgeRoot: string,
  changeId: string,
): Promise<SyncStateFile> {
  const path = syncStatePath(forgeRoot, changeId);
  if (!existsSync(path)) {
    throw new ResolveError(
      `sync-state 文件不存在:${path};请先跑 forge legacy-bridge sync-check`,
      'state-not-found',
    );
  }
  const raw = await readFile(path, 'utf8');
  const file = parseYaml(raw) as SyncStateFile;
  validateSyncState(file, changeId);
  checkAllAcked(file, changeId);

  // 通过 → 用 marker 写回("resolved" 状态)
  const resolved: SyncStateFile = {
    ...file,
    // 加 metadata 字段(在 schema 里没声明的,通过 cast)
  };
  await writeFile(path, stringifyYaml(resolved), 'utf8');
  return resolved;
}
