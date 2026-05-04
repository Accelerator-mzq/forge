// tasks.md hash 计算 — 规范化:LF 行尾、UTF-8、去尾空白(spec §3.4)

import { createHash } from 'node:crypto';

/**
 * 规范化:
 * 1. CRLF / CR → LF
 * 2. 每行末尾空白(空格 / tab)去除
 * 3. UTF-8 字节
 * 然后 SHA256。
 */
export function computeTasksHash(content: string): string {
  const normalized = content
    .replace(/\r\n?/g, '\n') // CRLF/CR 统一转 LF
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, '')) // 去除每行尾部空白
    .join('\n');
  const buf = Buffer.from(normalized, 'utf8');
  const sha = createHash('sha256').update(buf).digest('hex');
  return `sha256:${sha}`;
}
