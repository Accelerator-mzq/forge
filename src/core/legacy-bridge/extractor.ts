// Layer 3b:whole-repo 发现 + 文本抽取 + prep + apply + 增量 diff(spec §4/§5/§6)
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';
import type { LegacyRequirementKind } from './legacy-requirements.js';

/** 发现时跳过的目录(沿 mapper.ts 的 SKIP_DIRS 约定 + spec §5.1) */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-bundled',
  'build',
  'forge',
  '.cache',
]);

/** 可读取的文档扩展名(spec §5.1 / §5.2) */
const DOC_EXTS = new Set(['.md', '.txt', '.docx', '.pdf', '.xlsx']);

/** 需求文档文件名匹配模式(不分大小写) */
const REQUIREMENT_NAME_RE = /(srs|prd|requirement|需求|规格|spec)/i;
/** backlog 文件名匹配模式 */
const BACKLOG_NAME_RE = /^(backlog|todo|roadmap)\b/i;
/** issue 导出文件名匹配模式 */
const ISSUE_NAME_RE = /issue/i;

/** 一个被发现的来源文件 */
export interface DiscoveredSource {
  /** 相对仓库根的路径 */
  path: string;
  kind: LegacyRequirementKind;
  /** 小写扩展名,如 '.md' */
  ext: string;
}

/** 递归扫目录,产相对 baseRoot 的文件路径 */
async function* walk(dir: string, baseRoot: string): AsyncGenerator<string> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) yield* walk(full, baseRoot);
    else if (s.isFile()) yield relative(baseRoot, full).split('\\').join('/');
  }
}

/** 据文件名判 kind;不属需求/backlog 任何一类返回 null(不纳入发现) */
function classifyKind(relPath: string): LegacyRequirementKind | null {
  const name = basename(relPath);
  if (ISSUE_NAME_RE.test(name)) return 'issue-export';
  if (BACKLOG_NAME_RE.test(name)) return 'backlog-file';
  if (REQUIREMENT_NAME_RE.test(name)) return 'srs';
  return null;
}

/**
 * whole-repo 发现(spec §5.1):扫整个仓库,识别需求文档 / backlog 文件。
 * 排除 SKIP_DIRS;只收 DOC_EXTS 扩展名;按文件名 classifyKind。
 */
export async function discoverSources(repoRoot: string): Promise<DiscoveredSource[]> {
  const out: DiscoveredSource[] = [];
  for await (const rel of walk(repoRoot, repoRoot)) {
    const ext = extname(rel).toLowerCase();
    if (!DOC_EXTS.has(ext)) continue;
    const kind = classifyKind(rel);
    if (kind === null) continue;
    out.push({ path: rel, kind, ext });
  }
  // 排序:跨平台确定,便于测试与 manifest 稳定
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

import { parseWorkbook, sheetToMarkdown } from './excel.js';

/**
 * 按扩展名抽纯文本(spec §5.2)。
 * .md/.txt 直读;.xlsx 复用 excel.ts;.docx 用 mammoth;.pdf 用 pdf-parse(v2 class API)。
 * 读取/解析失败抛带路径的错误。
 */
export async function extractText(repoRoot: string, relPath: string): Promise<string> {
  const full = join(repoRoot, relPath);
  const ext = extname(relPath).toLowerCase();
  try {
    if (ext === '.md' || ext === '.txt') {
      return await readFile(full, 'utf8');
    }
    if (ext === '.xlsx') {
      const wb = await parseWorkbook(full);
      return wb.sheets.map((s) => sheetToMarkdown(s)).join('\n\n');
    }
    if (ext === '.docx') {
      // mammoth 动态 import:仅 .docx 路径需要,避免无谓加载
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ path: full });
      return value;
    }
    if (ext === '.pdf') {
      // pdf-parse v2:class API(动态 import 仅 .pdf 路径需要,避免无谓加载)
      const { PDFParse } = await import('pdf-parse');
      const buf = await readFile(full);
      const parser = new PDFParse({ data: buf });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }
    throw new Error(`不支持的扩展名 ${ext}`);
  } catch (err) {
    throw new Error(`文本抽取失败 ${relPath}:${(err as Error).message}`);
  }
}
