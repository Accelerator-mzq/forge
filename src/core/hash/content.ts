// content_hash:[proposal.md, design.md, specs/**/*.md, tasks.md] 按字典序拼接 SHA256

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { parseMarkdown } from '../parse/markdown.js';
import { SCOPE_ANCHOR_IDS } from '../schemas/scope-entries.js';

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
    // plan-9b §2.6.3:proposal.md / design.md 在算 hash 前剔除 anchor 三段
    const stripped =
      rel === 'proposal.md' || rel === 'design.md' ? stripScopeAnchoredSections(content) : content;
    const normalized = normalizeForHash(stripped);
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

/**
 * 从 markdown 文本剔除带 SCOPE_ANCHOR_IDS(forge-oos / forge-non-goals / forge-future-work)
 * 的段(含 heading 行 + 该段全部 body + 任意 H3+ 子标题及其内容,
 * 直到下一个同级或更高级 heading 或文件末尾)。
 *
 * v2 codex MAJOR 2 修订:不能直接用 parseMarkdown 的 section.endLine,
 * 因为 parseMarkdown 任意 level heading 都关 section,H3 子标题会被切成独立 section
 * 让剔除不完整。本函数自己扫 sections,根据 level 自行算"下一同级或更高级"区间。
 *
 * 实施:proposal.md / design.md 走此过滤后再计 content_hash。
 */
function stripScopeAnchoredSections(text: string): string {
  const md = parseMarkdown(text);
  const sections = md.sections;

  // 收集要剔除的行号区间 [start, end](1-indexed,inclusive,在 body 行坐标系)
  const ranges: { start: number; end: number }[] = [];
  // body 的总行数(用于"剔除到文件末尾"的边界)
  const bodyLineCount = md.body.split('\n').length;

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (!sec) continue;
    // 仅处理带目标 anchor ID 的段
    if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) continue;

    // 找下一个 level <= sec.level 的 section,作为本剔除区间的结束(exclusive)
    let endLineInclusive = bodyLineCount; // 默认到文件末尾
    for (let j = i + 1; j < sections.length; j++) {
      const nextSec = sections[j];
      if (!nextSec) continue;
      if (nextSec.level <= sec.level) {
        // 区间结束于下一同级或更高级 heading 的前一行
        endLineInclusive = nextSec.startLine - 1;
        break;
      }
    }
    ranges.push({ start: sec.startLine, end: endLineInclusive });
  }
  if (ranges.length === 0) return text;

  // 剥 frontmatter — parseMarkdown 内部已剥掉,sections 行号是 body 内 1-indexed
  const fmMatch = text.match(/^---\n[\s\S]*?\n---\n/);
  const frontmatter = fmMatch ? fmMatch[0] : '';
  const body = fmMatch ? text.slice(fmMatch[0].length) : text;
  const lines = body.split('\n');

  // 构建"保留行"
  const keepLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1; // 1-indexed body 内
    const inRange = ranges.some((r) => lineNum >= r.start && lineNum <= r.end);
    if (!inRange) keepLines.push(lines[i] ?? '');
  }
  return frontmatter + keepLines.join('\n');
}
