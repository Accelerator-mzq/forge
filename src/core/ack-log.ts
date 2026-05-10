// ack-log.ts:ack 日志和 pending-acks 目录的共用 helper
// 被 Task 3 ack.ts + Task 5 evidence.ts 同时调用
// 提供 NDJSON append-only 日志写入 + pending 文件路径管理

import { appendFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// ──────────────────────────────────────────────────────────────────────────────
// 类型定义(AckLogEntry 判别联合)
// ──────────────────────────────────────────────────────────────────────────────

/** ack 操作日志条目(kind='ack') */
export interface AckEntry {
  schema: string; // 固定 'forge-ack-log/v1'
  kind: 'ack';
  timestamp: string; // ISO 8601 时间戳
  action: string; // 'ack-warning' | 'ack-critical' 等
  change_id: string;
  finding_id: string | null;
  user: string;
  rationale: string | null;
  git_head: string | null;
  finding_hash: string | null;
  extra: Record<string, unknown>;
}

/** evidence helper 操作日志条目(kind='evidence-helper') */
export interface EvidenceHelperEntry {
  schema: string; // 固定 'forge-ack-log/v1'
  kind: 'evidence-helper';
  timestamp: string; // ISO 8601 时间戳
  helper_name: 'record-tdd' | 'record-verify' | 'record-review';
  change_id: string;
  task_ref: string;
  payload_hash: string;
  status: 'success' | 'partial' | 'failed';
  git_head: string | null;
  extra: Record<string, unknown>;
}

/** ack 日志条目判别联合 */
export type AckLogEntry = AckEntry | EvidenceHelperEntry;

// ──────────────────────────────────────────────────────────────────────────────
// pending 文件元数据类型
// ──────────────────────────────────────────────────────────────────────────────

/** listPending 返回的单条记录 */
export interface PendingItem {
  /** 文件绝对路径 */
  filePath: string;
  /** finding id(从文件名解析) */
  findingId: string;
  /** 时间戳字符串(从文件名解析,冒号已还原) */
  timestamp: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// 常量
// ──────────────────────────────────────────────────────────────────────────────

/** ack-log.jsonl 相对于 changeRoot 的路径 */
const ACK_LOG_REL = '.evidence/ack-log.jsonl';

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
 * 路径：<changeRoot>/.evidence/ack-log.jsonl
 * 每条 entry 序列化为一行 JSON,结尾加 '\n'(append-only,不读取已有内容)。
 */
export async function appendAckLog(changeRoot: string, entry: AckLogEntry): Promise<void> {
  const logPath = path.join(changeRoot, ACK_LOG_REL);
  // JSON.stringify 不含换行,手动添加 \n 实现 NDJSON 格式
  await appendFile(logPath, JSON.stringify(entry) + '\n', 'utf8');
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
      filePath: path.join(pendingDir, file),
      findingId: parsedFindingId,
      timestamp: safeTimestamp, // 保持安全格式,字符串排序等价于时间升序
    });
  }

  // 按时间戳字符串升序排列(ISO 格式时间戳字典序等价于时间序)
  items.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  return items;
}
