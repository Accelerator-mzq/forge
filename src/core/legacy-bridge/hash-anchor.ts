// anchor 文件 hash 计算 — Plan 7 Phase B2
// 用 node:crypto SHA256 直接算单文件 hash(plan 原写复用 src/core/hash 的 computeContentHash,
// 但该函数签名是 (changeDir: string) → Promise<string> 用于 change 多文件聚合 hash,不接 Buffer;
// 此处单文件 anchor hash 用 createHash 直接计算更直观且类型匹配)
// 支持 .md / 文本(utf8 normalize CRLF→LF)+ .xlsx / 二进制(原始字节)
// spec §4.3 不变量:CRLF/LF 不漂移触发误警

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import type { LegacyAnchor } from './types.js';

/** 用 SHA256 算单文件 hash(返回 64 字符 hex 全长) */
function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * 计算 anchor 内容 hash(SHA256)。
 *
 * - markdown / txt / 其他文本:utf8 解码 + 行尾 normalize 为 LF(避免 CRLF/LF 漂移触发误警)
 * - xlsx / .bin / 二进制:用原始字节
 *
 * @returns hash 字符串(64 字符 hex);文件不存在 → null(caller 决定是否警告)
 */
export async function computeAnchorHash(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  const ext = extname(path).toLowerCase();
  const raw = await readFile(path);
  if (ext === '.xlsx' || ext === '.bin') {
    return sha256(raw);
  }
  // 文本:utf8 normalize + LF
  const text = raw.toString('utf8').replace(/\r\n/g, '\n');
  return sha256(Buffer.from(text, 'utf8'));
}

/** 校验 anchor 当前文件 hash 与 yaml 记录的 hash 是否一致 */
export interface HashCheck {
  /** 文件不存在 / 无记录 hash → 'no-record';一致 → 'fresh';不一致 → 'stale' */
  state: 'fresh' | 'stale' | 'no-record';
  currentHash: string | null;
  recordedHash?: string;
}

export async function checkAnchorHash(anchor: LegacyAnchor): Promise<HashCheck> {
  const currentHash = await computeAnchorHash(anchor.path);
  if (!anchor.hash || !currentHash) {
    return { state: 'no-record', currentHash };
  }
  return {
    state: currentHash === anchor.hash ? 'fresh' : 'stale',
    currentHash,
    recordedHash: anchor.hash,
  };
}
