// marker-ack.ts: Task A2 — marker ack 字段写入 + 定位逻辑
// 按 action 类型定位对应 marker 文件,写入 severity_acked_by/at 等 ack 字段
// 采用原子写 + 备份回滚机制,保证 marker 一致性

import { readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { extractHashPayload, computeFindingHash } from '../validate/finding-hash.js';
import type { Finding } from '../schemas/severity.js';

/** 原子写单文件:先写 tmp 再 rename,避免写到一半崩溃留下半文件 */
async function atomicWriteYaml(filePath: string, obj: unknown): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, stringifyYaml(obj), 'utf8');
  await rename(tmp, filePath);
}

/** 一组 marker 写入项 */
interface MarkerWrite {
  path: string;
  content: Record<string, unknown>;
}

/**
 * writeMarkersAtomic — 备份并原子写一组 marker;**任一写失败 → 恢复所有已写的、抛错**。
 * 这是 A3 双 marker 自回滚的核心:写第 2 个 marker 失败时第 1 个会被恢复。
 * 返回 .bak 路径列表(与 writes 顺序对齐)。
 */
async function writeMarkersAtomic(writes: MarkerWrite[]): Promise<string[]> {
  // 先为每个 marker 建备份
  const backups = writes.map((w) => `${w.path}.bak`);
  for (let i = 0; i < writes.length; i++) await copyFile(writes[i]!.path, backups[i]!);

  const written: number[] = [];
  try {
    for (let i = 0; i < writes.length; i++) {
      await atomicWriteYaml(writes[i]!.path, writes[i]!.content);
      written.push(i);
    }
  } catch (e) {
    // 尽力恢复所有已写 marker;收集恢复失败,不让单个失败中断其余恢复
    const restoreErrors: string[] = [];
    for (const i of written) {
      try {
        await copyFile(backups[i]!, writes[i]!.path);
      } catch (re) {
        restoreErrors.push(`${writes[i]!.path}: ${re instanceof Error ? re.message : String(re)}`);
      }
    }
    if (restoreErrors.length > 0) {
      throw new Error(
        `marker 写失败且 rollback incomplete —— 未恢复: ${restoreErrors.join('; ')}` +
          `;原错误: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    throw e;
  }
  return backups;
}

export interface MarkerAckResult {
  ok: boolean;
  /** 失败原因(marker/finding 缺失、severity 不合法、marker 写失败已自恢复 等),ok=false 时非空 */
  reason?: string;
  /** ok=true 时:写回 ack-log entry 应带的 finding_hash(ack-pause-warning 为 null) */
  ackLogFindingHash: string | null;
  /**
   * ok=true 时:本次已写 marker 的 .bak 路径列表。供调用方:
   * ack-log 操作失败 → 用 .bak restore 对应 marker(spec §5.1.4 rollback);
   * 成功 → best-effort unlink .bak 清理。ok=false 时为 [](applyMarkerAck 内部已自恢复)。
   */
  backups: string[];
}

/**
 * applyMarkerAck — 按 action 定位 marker 并写 ack 字段。**永不抛错**:
 * marker/finding 缺失、severity 不合法、marker 写失败 → 一律返回 { ok:false }
 * (写失败时 writeMarkersAtomic 已自恢复所有 marker)。调用方据 ok=false → exit 2。
 */
export async function applyMarkerAck(params: {
  changeDir: string;
  action: string;
  findingId: string;
  user: string;
  ackedAt: string;
  rationale: string | null;
  targetSeverity: 'WARNING' | 'SUGGESTION' | null;
}): Promise<MarkerAckResult> {
  const { changeDir, action, findingId, user, ackedAt } = params;
  const verifyPath = join(changeDir, '.verify-passed');

  // 统一的失败构造器
  const FAIL = (reason: string): MarkerAckResult => ({
    ok: false,
    reason,
    ackLogFindingHash: null,
    backups: [],
  });

  try {
    if (action === 'ack-warning') {
      // 定位 .verify-passed marker 中的 finding,写 severity_acked_by/at
      if (!existsSync(verifyPath)) return FAIL('.verify-passed 不存在');
      const marker = parseYaml(await readFile(verifyPath, 'utf8')) as Record<string, unknown>;
      const findings = (marker.verify_findings as Array<Record<string, unknown>>) ?? [];
      const f = findings.find((x) => String(x.id) === findingId);
      if (!f) return FAIL(`verify_findings 无 id=${findingId}`);

      // 写入 ack 字段
      f.severity_acked_by = user;
      f.severity_acked_at = ackedAt;

      // 原子写,备份用于 A5 事务回滚
      const backups = await writeMarkersAtomic([{ path: verifyPath, content: marker }]);

      // 计算 finding_hash 并返回(ack-warning 不修改 8 字段 payload,hash 不变)
      return {
        ok: true,
        ackLogFindingHash: computeFindingHash(extractHashPayload(f as unknown as Finding)),
        backups,
      };
    }

    // ack-pause-warning / downgrade 见 Task A3 / A4 扩展(同样走 writeMarkersAtomic)
    // 其余 action:不写 marker,finding_hash 为 null
    return { ok: true, ackLogFindingHash: null, backups: [] };
  } catch (e) {
    // marker 写失败 → writeMarkersAtomic 已自恢复所有已写 marker;此处转 ok:false
    return FAIL(`marker 写入失败(已回滚): ${e instanceof Error ? e.message : String(e)}`);
  }
}
