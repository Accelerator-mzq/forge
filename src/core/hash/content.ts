// content_hash:[proposal.md, design.md, specs/**/*.md, tasks.md] 按字典序拼接 SHA256

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';

/**
 * 计算 content_hash(spec §3.4)。
 * 规则:
 * 1. 收集 [proposal.md, design.md, specs/**\/*.md(递归), tasks.md]
 * 2. 用 POSIX 风格 path 排序(无论 OS,跨平台一致)
 * 3. 每个文件用同款规范化(LF + 去尾空白)
 * 4. 拼接 `<path>\0<normalized_content>\0` 各文件 → SHA256
 */
export async function computeContentHash(changeDir: string): Promise<string> {
  // 收集顶层固定文件(POSIX 路径)
  const files: string[] = ['proposal.md', 'design.md', 'tasks.md'];

  // specs/ 下的所有 .md 文件(递归扫描子目录,用 posix 路径保证跨平台一致)
  const specsDir = join(changeDir, 'specs');
  try {
    const entries = await readdir(specsDir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        // Node 20.12+ 提供 parentPath;旧版本 fallback 到 path
        const parent =
          (entry as unknown as { parentPath?: string; path: string }).parentPath ??
          (entry as unknown as { path: string }).path;
        const absPath = join(parent, entry.name);
        const relFromSpecs = relative(specsDir, absPath);
        const posixRel = relFromSpecs.split(sep).join('/');
        files.push(posix.join('specs', posixRel));
      }
    }
  } catch (err) {
    // 仅 ENOENT(specs/ 不存在)允许跳过,其他 IO 错误抛出
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }

  // 字典序排序确保顺序一致
  files.sort();

  const hash = createHash('sha256');
  for (const rel of files) {
    let content: string;
    try {
      // 注意:读文件时用 OS join,但哈希 key 用 posix rel 路径
      content = await readFile(join(changeDir, rel), 'utf8');
    } catch {
      // 文件不存在 → 用 <MISSING> 占位(让 hash 跟"存在但空"区分)
      content = '<MISSING>';
    }
    const normalized = normalizeForHash(content);
    hash.update(rel); // POSIX 路径名
    hash.update('\0'); // 空字节分隔符
    hash.update(normalized);
    hash.update('\0'); // 空字节分隔符
  }

  return `sha256:${hash.digest('hex')}`;
}

/**
 * 规范化文本内容:
 * 1. CRLF / CR → LF
 * 2. 每行末尾空白(空格 / tab)去除
 */
function normalizeForHash(text: string): string {
  return text
    .replace(/\r\n?/g, '\n') // 统一行尾
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, '')) // 去尾部空白
    .join('\n');
}
