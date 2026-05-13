// ack-log.ts:ack 日志和 pending-acks 目录的共用 helper
// 被 Task 3 ack.ts + Task 5 evidence.ts 同时调用
// 提供 NDJSON append-only 日志写入 + pending 文件路径管理

import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { canonicalHash } from './canonical-json.js'; // plan-9g Task 3:全 JSONL 链 hash 算法

// ──────────────────────────────────────────────────────────────────────────────
// 类型定义(AckLogEntry 判别联合)
// ──────────────────────────────────────────────────────────────────────────────

/** ack 操作日志条目(kind='ack') */
export interface AckEntry {
  schema: 'forge-ack-log/v1'; // §3.12.4 接口冻结字面量类型
  kind: 'ack';
  timestamp: string; // ISO 8601 时间戳
  action: string; // 'ack-warning' | 'ack-critical' 等
  change_id: string;
  finding_id: string | null;
  user: string;
  rationale: string | null;
  git_head: string | null;
  finding_hash: string | null;
  target_severity?: 'WARNING' | 'SUGGESTION'; // v3 BLOCKER 4:resign-c-simcode 或 downgrade action 时可能非空
  /**
   * plan-9g Task 3 新增 — superset additive(brainstorm spec §9.11 全 JSONL 链)
   * 与 EvidenceHelperEntry 同字段;沿全 JSONL 链协议,所有 kind entry 都参与链
   */
  prev_entry_hash?: string | null;
  extra: Record<string, unknown>;
}

/** evidence helper 操作日志条目(kind='evidence-helper') */
export interface EvidenceHelperEntry {
  schema: 'forge-ack-log/v1'; // §3.12.4 接口冻结字面量类型
  kind: 'evidence-helper';
  timestamp: string; // ISO 8601 时间戳
  helper_name: 'record-tdd' | 'record-verify' | 'record-review' | 'freeze'; // plan-9g Task 4 加 freeze
  change_id: string;
  task_ref: string;
  payload_hash: string;
  status: 'success' | 'partial' | 'failed';
  git_head: string | null;
  /**
   * plan-9g Task 3 新增 — superset additive(brainstorm spec §9.11)
   * 全 JSONL 链 prev_entry_hash:指上一条 entry(任意 kind)的 canonicalHash;
   * 链头 null(空 ack-log 或 plan-9a 旧 entry 缺等价 null)
   */
  prev_entry_hash?: string | null;
  extra: Record<string, unknown>;
}

/** ack 日志条目判别联合 */
export type AckLogEntry = AckEntry | EvidenceHelperEntry;

// ──────────────────────────────────────────────────────────────────────────────
// pending 文件元数据类型
// ──────────────────────────────────────────────────────────────────────────────

/** listPending 返回的单条记录 */
export interface PendingItem {
  /** 文件绝对路径(plan §7 line 1000 spec 字段名 'path') */
  path: string;
  /** finding id(从文件名解析) */
  findingId: string;
  /** 时间戳字符串(从文件名解析,冒号已还原) */
  timestamp: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// 常量
// ──────────────────────────────────────────────────────────────────────────────

/** pending-acks 目录相对于 changeRoot 的路径 */
const PENDING_DIR_REL = '.evidence/pending-acks';

/** 文件名正则:匹配 <findingId>-<safeTimestamp>.yaml */
// findingId 由数字组成;\d+ 捕获
// safeTimestamp 是 ISO 时间戳中冒号已替换为连字符后的结果
const PENDING_FILE_RE = /^(\d+)-(.+)\.yaml$/;

// ──────────────────────────────────────────────────────────────────────────────
// 公开 API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * appendAckLog — 以 NDJSON 格式追加一条日志到 ack-log.jsonl
 *
 * plan-9g Task 3 修订(brainstorm spec §9.11):
 *   1. 读 ack-log.jsonl 最后一非空行(若文件不存在 → prev=null)
 *   2. 算 prev_entry_hash = canonicalHash(lastEntry)
 *   3. entry.prev_entry_hash = prev(全 JSONL 链,跨 kind)
 *   4. appendFile
 *
 * 兼容性:plan-9a 旧 entries 缺 prev_entry_hash 字段 → 视为 undefined(链头);
 *   9g 第一条新 entry 的 prev 必须等于旧最后一条 entry 的 canonicalHash(向后兼容)
 */
export async function appendAckLog(changeRoot: string, entry: AckLogEntry): Promise<void> {
  // 自动创建父目录,避免首次写入时 ENOENT
  const evidenceDir = path.join(changeRoot, '.evidence');
  await mkdir(evidenceDir, { recursive: true });
  const logPath = path.join(evidenceDir, 'ack-log.jsonl');

  // plan-9g:算 prev_entry_hash(全 JSONL 链)
  let prevHash: string | null = null;
  if (existsSync(logPath)) {
    const content = await readFile(logPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1] ?? '';
      try {
        const lastEntry = JSON.parse(lastLine) as AckLogEntry;
        prevHash = canonicalHash(lastEntry);
      } catch {
        // 坏 JSON 行 → 视为 chain corrupted,fence 会单独拒签;append 仍走 prev=null
        prevHash = null;
      }
    }
  }
  const entryWithChain: AckLogEntry = { ...entry, prev_entry_hash: prevHash };

  // JSON.stringify 不含换行,手动添加 \n 实现 NDJSON 格式
  await appendFile(logPath, JSON.stringify(entryWithChain) + '\n', 'utf8');
}

/**
 * getPendingPath — 构造 pending-ack 文件的绝对路径
 *
 * 路径格式：<changeRoot>/.evidence/pending-acks/<findingId>-<safeTimestamp>.yaml
 * Windows 安全：ISO 时间戳中的 ':' 替换为 '-'(冒号在 Windows 文件名中非法)
 */
export function getPendingPath(changeRoot: string, findingId: string, timestamp: string): string {
  // 将 ISO 时间戳中的冒号替换为连字符,确保 Windows 文件系统兼容
  const safeTimestamp = timestamp.replace(/:/g, '-');
  const fileName = `${findingId}-${safeTimestamp}.yaml`;
  // path.join 在 Windows 上返回反斜杠;统一替换为正斜杠,使路径在跨平台测试中可靠匹配
  // Windows 文件系统 API 同时接受正斜杠路径
  return path.join(changeRoot, PENDING_DIR_REL, fileName).replace(/\\/g, '/');
}

/**
 * listPending — 列出 pending-acks 目录下的文件,按时间戳升序排列
 *
 * @param changeRoot  change 根目录
 * @param findingId   可选过滤条件;不传则返回所有 pending 文件
 * @returns           PendingItem 数组(时间戳升序)
 *
 * 目录不存在时返回空数组,不抛异常。
 */
export async function listPending(changeRoot: string, findingId?: string): Promise<PendingItem[]> {
  const pendingDir = path.join(changeRoot, PENDING_DIR_REL);

  // 读取目录内容,目录不存在时返回空数组
  let files: string[];
  try {
    files = await readdir(pendingDir);
  } catch (err: unknown) {
    // ENOENT:目录不存在,属于正常情况(clean workspace)
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  // 解析文件名,过滤非法格式和不匹配的 findingId
  const items: PendingItem[] = [];
  for (const file of files) {
    const match = PENDING_FILE_RE.exec(file);
    if (!match) continue; // 跳过不符合命名规范的文件

    // match[1] 和 match[2] 由正则捕获组保证存在,但 TypeScript 认为可能 undefined
    const parsedFindingId = match[1] ?? '';
    const safeTimestamp = match[2] ?? '';

    // 可选 findingId 过滤
    if (findingId !== undefined && parsedFindingId !== findingId) continue;

    // 将文件名中的安全时间戳还原为 ISO 格式(仅用于排序比较,无需实际还原冒号)
    // 因为替换是单调的,字符串排序结果与原始 ISO 时间戳排序结果一致
    items.push({
      // 路径正斜杠规范化,与 getPendingPath 输出一致,避免下游字符串比较失配
      path: path.join(pendingDir, file).replace(/\\/g, '/'),
      findingId: parsedFindingId,
      timestamp: safeTimestamp, // 保持安全格式,字符串排序等价于时间升序
    });
  }

  // 按时间戳字符串升序排列(ISO 格式时间戳字典序等价于时间序)
  items.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  return items;
}

// ──────────────────────────────────────────────────────────────────────────────
// plan-9g Task 3 新增:全 JSONL 链 helper(brainstorm spec §9.11)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * readAllAckLogEntries — 读全 ack-log.jsonl 解析所有 entry(plan-9g §9.11)
 *
 * 跳过空行;遇坏 JSON 行抛错(fence 视为 ack-log corrupted)
 *
 * @param changeRoot change 根目录
 * @returns 全 ack-log entry array(空 ack-log 或文件不存在 → [])
 * @throws Error 若有坏 JSON 行,error message 含行号
 */
export async function readAllAckLogEntries(changeRoot: string): Promise<AckLogEntry[]> {
  const logPath = path.join(changeRoot, '.evidence', 'ack-log.jsonl');
  if (!existsSync(logPath)) return [];
  const content = await readFile(logPath, 'utf8');
  const lines = content.split('\n');
  const entries: AckLogEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.length === 0) continue; // 跳过空行
    try {
      entries.push(JSON.parse(line) as AckLogEntry);
    } catch (e) {
      throw new Error(
        `ack-log corrupted at line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return entries;
}

/** ack-log 链校验结果(plan-9g §9.11 三重校验) */
export interface AckLogChainVerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * verifyAckLogChain — 三重校验 ack-log 链完整性(brainstorm spec §9.11)
 *   1. 链内自洽:prev_entry_hash 逐行 match(挡中间一行被改)
 *   2. 行数固化:实际 entry count 必 == markerEntryCount(挡"重写整链 + 链内自洽")
 *   3. 尾 hash 固化:链尾 hash 必 == markerTailHash(挡"改最后一行无下一行引用")
 *
 * @param allEntries 全 JSONL 解析后(已跳空行 + 顺序与文件序一致)
 * @param markerTailHash marker.ack_log_tail_hash 快照(freeze 时固化)
 * @param markerEntryCount marker.ack_log_entry_count 快照
 */
export function verifyAckLogChain(
  allEntries: AckLogEntry[],
  markerTailHash: string | null,
  markerEntryCount: number | null,
): AckLogChainVerifyResult {
  // 0. 空日志边界
  if (allEntries.length === 0) {
    if (markerTailHash !== null || (markerEntryCount !== null && markerEntryCount !== 0)) {
      return { ok: false, reason: 'empty ack-log but marker has tail/count' };
    }
    return { ok: true };
  }

  // 1. 链内自洽
  let expectedPrev: string | null = null;
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i]!;
    // plan-9a 旧 entry 缺字段 → 视为 undefined === null 等价(链头逻辑)
    const actualPrev = entry.prev_entry_hash ?? null;
    if (actualPrev !== expectedPrev) {
      return { ok: false, reason: `chain broken at entry ${i + 1}` };
    }
    expectedPrev = canonicalHash(entry);
  }

  // 2. 行数固化(挡"重写整链且每行 hash 自洽")
  if (markerEntryCount !== null && allEntries.length !== markerEntryCount) {
    return {
      ok: false,
      reason: `entry count mismatch: actual=${allEntries.length} expected=${markerEntryCount}`,
    };
  }

  // 3. 尾 hash 固化(挡"改最后一行 + 没下一行引用")
  if (markerTailHash !== null && expectedPrev !== markerTailHash) {
    return {
      ok: false,
      reason: `tail hash mismatch: actual=${expectedPrev} marker=${markerTailHash}`,
    };
  }

  return { ok: true };
}
