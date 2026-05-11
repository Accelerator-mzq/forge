// src/core/archive/ack-log-consistency.ts — plan-9d Task 6 v2 B-4 修订
// ack-log.jsonl ↔ marker ack 字段一致性校验
// 沿 design line 496-500 四条 cross-check + master §3.12.4 ack-log schema

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { computeFindingHash, extractHashPayload } from '../validate/finding-hash.js';
import type { Finding } from '../schemas/severity.js';
import { type ValidationResult, ok, failed, mergeResults } from '../validate/types.js';

/**
 * ack-log.jsonl 一行 schema(沿 master §3.12.4 kind="ack")
 */
interface AckLogEntry {
  schema: string;
  kind: 'ack' | 'evidence-helper';
  timestamp: string;
  action: string;
  change_id: string;
  finding_id: string | null;
  user: string;
  rationale: string | null;
  git_head: string | null;
  finding_hash: string | null;
  extra?: Record<string, unknown>;
}

/**
 * 校验 ack-log.jsonl ↔ marker verify_findings 中 ack 字段一致性
 *
 * 四条规则(沿 design line 496-500):
 * 1. marker WARNING+resolved=false+severity_acked_by 非空 → ack-log 必须有匹配 finding_id+action+finding_hash 的 kind=ack 行
 * 2. pending-acks/ 目录非空 → 拒签 + 列所有 pending 文件
 * 3. ack-log 条目的 finding_hash 与 marker finding_hash 一致(JCS 重算 marker payload 比对)
 * 4. AI 直填 marker ack 字段但 ack-log 无对应条目 → 等价规则 1 的反向,拒签
 *
 * v3 m-1 修订:加 ack-log user 字段与 marker severity_acked_by 一致性校验
 * (防止 AI 在 marker 写 'msc' 但 ack-log 'ai-agent' 不一致路径)
 */
export async function validateAckLogConsistency(
  changeDir: string,
  verifyMarker: Record<string, unknown>,
  changeId: string,
): Promise<ValidationResult> {
  const findings = verifyMarker.verify_findings;
  if (!Array.isArray(findings)) return ok();

  const evidenceDir = join(changeDir, '.evidence');
  const ackLogPath = join(evidenceDir, 'ack-log.jsonl');
  const pendingDir = join(evidenceDir, 'pending-acks');

  const results: ValidationResult[] = [];

  // 1. pending-acks/ 残留检测
  try {
    const pending = await readdir(pendingDir);
    const pendingYamls = pending.filter((n) => n.endsWith('.yaml'));
    if (pendingYamls.length > 0) {
      results.push(
        failed({
          artifact: 'change',
          field: 'pending-acks',
          message: `pending-acks/ 目录残留 ${pendingYamls.length} 个未 confirm/reject 的 pending 文件:${pendingYamls.join(', ')};必须先 /forge:ack-confirm 或 forge ack reject(沿 design line 498)`,
          file: pendingDir,
        }),
      );
    }
  } catch (err) {
    // pending-acks/ 不存在是 OK(沿 9a:目录在第一次 propose 时才创建)
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      results.push(
        failed({
          artifact: 'change',
          message: `[fs] pending-acks/ 读取失败: ${(err as Error).message}`,
        }),
      );
    }
  }

  // 2-4. ack-log.jsonl 解析 + marker ↔ ack-log 一致性
  let ackEntries: AckLogEntry[] = [];
  try {
    const ackText = await readFile(ackLogPath, 'utf8');
    ackEntries = ackText
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as AckLogEntry)
      .filter((e) => e.kind === 'ack'); // 仅看 kind=ack(沿 master §3.12.4)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      results.push(
        failed({
          artifact: 'change',
          message: `[fs] ack-log.jsonl 读取失败: ${(err as Error).message}`,
        }),
      );
    }
    // ack-log 不存在但 marker 有 ack 字段非空 → 拒签(下面循环处理)
  }

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i] as Finding;
    const fieldBase = `verify_findings[${i}]`;

    // 规则 1 + 4:WARNING ack 字段非空必须有 ack-log 匹配条目
    if (
      f.severity === 'WARNING' &&
      f.resolved === false &&
      (f.severity_acked_by || f.severity_acked_at)
    ) {
      const matchAck = ackEntries.find(
        (e) =>
          e.change_id === changeId && e.finding_id === String(f.id) && e.action === 'ack-warning',
      );
      if (!matchAck) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.severity_acked_by`,
            message: `marker WARNING ack 字段非空但 ack-log.jsonl 无对应 kind=ack + change_id=${changeId} + finding_id=${f.id} + action=ack-warning 条目;AI 不能跨过 user 直接写 marker(沿 design §2.3.3 B 两步协议)`,
            file: ackLogPath,
          }),
        );
        continue;
      }
      // 规则 3:ack-log 条目的 finding_hash 与 marker 重算 finding_hash 一致
      const expectedHash = computeFindingHash(extractHashPayload(f));
      if (matchAck.finding_hash !== expectedHash) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.finding_hash`,
            message: `ack-log finding_hash (${matchAck.finding_hash?.slice(0, 16)}...) 与 marker finding (重算 ${expectedHash.slice(0, 16)}...) 不一致 — ack 被绑定到不同 payload 的 finding,拒签(沿 design line 499)`,
            file: ackLogPath,
          }),
        );
      }
      // v3 m-1 修订:ack-log user 字段必须与 marker severity_acked_by 一致
      // (防止 AI 在 marker 写 'msc' 但 ack-log 写 'ai-agent' 或反之的不一致路径)
      if (matchAck.user !== f.severity_acked_by) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.severity_acked_by`,
            message: `ack-log user (${matchAck.user}) 与 marker severity_acked_by (${f.severity_acked_by}) 不一致 — ack 主体不匹配,拒签`,
            file: ackLogPath,
          }),
        );
      }
    }

    // downgrade 路径同样需要 ack-log 验证(规则 1 + 3 类比)
    if (f.downgraded_from && f.downgrade_acked_by) {
      const matchDowngrade = ackEntries.find(
        (e) =>
          e.change_id === changeId && e.finding_id === String(f.id) && e.action === 'downgrade',
      );
      if (!matchDowngrade) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.downgrade_acked_by`,
            message: `marker downgrade ack 字段非空但 ack-log.jsonl 无对应 action=downgrade 条目;AI 不能跨过 user 直接降级(沿 design §2.3.3 C)`,
            file: ackLogPath,
          }),
        );
      }
    }
  }

  return mergeResults(...results);
}
