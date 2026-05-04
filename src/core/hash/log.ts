// log_hash:对 evidence log 文件的字节做 SHA256(不规范化,字节级一致)

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * 计算 log 文件的字节级 SHA256 hash。
 * 不做任何规范化,保证字节级一致性。
 * 文件不存在时抛出异常(由调用方处理)。
 */
export async function computeLogHash(logPath: string): Promise<string> {
  const buf = await readFile(logPath); // 字节读取,不指定编码
  const sha = createHash('sha256').update(buf).digest('hex');
  return `sha256:${sha}`;
}
