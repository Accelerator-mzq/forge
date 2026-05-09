// 索引摘要器 — Plan 7 Phase D / spec §1.2 Layer 2
// 每 anchor ~100 字 LLM 摘要;大文件(> 30KB)分块输入,合并摘要

import Anthropic from '@anthropic-ai/sdk';
import { extname } from 'node:path';
import { readAnchorFile } from './encoding.js';
import { parseWorkbook, getSheet, sheetToMarkdown } from './excel.js';
import { redact } from './redact.js';
import type { LegacyAnchor, LegacyAnchorsFile } from './types.js';

/** 单 anchor 索引项 */
export interface IndexEntry {
  path: string;
  role: string;
  /** ~100 字摘要(±20 字容差) */
  summary: string;
  /** 输入字节数(用于诊断) */
  inputBytes: number;
}

/** 索引器客户端 */
export interface IndexerClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const SUMMARY_TARGET_LEN = 100;
const SUMMARY_TOLERANCE = 20;
/** 大文件分块阈值(单 chunk) */
const CHUNK_THRESHOLD_BYTES = 30 * 1024;

/** 取 anchor 文本(支持 md / xlsx) */
async function readAnchorText(anchor: LegacyAnchor): Promise<string> {
  const ext = extname(anchor.path).toLowerCase();
  if (ext === '.xlsx') {
    const wb = await parseWorkbook(anchor.path);
    const sheet = getSheet(wb, anchor.sheet, anchor.path);
    return sheetToMarkdown(sheet);
  }
  return (await readAnchorFile(anchor.path)).text;
}

/** 把长文本分块(按段落边界,不在中间断) */
export function chunkText(text: string, maxChunkBytes: number = CHUNK_THRESHOLD_BYTES): string[] {
  if (Buffer.byteLength(text, 'utf8') <= maxChunkBytes) return [text];
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (Buffer.byteLength(current + '\n\n' + p, 'utf8') > maxChunkBytes && current) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? current + '\n\n' + p : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** 调 LLM 生成 ~100 字摘要 */
async function summarizeChunk(client: IndexerClient, chunk: string, role: string): Promise<string> {
  const prompt = `请用约 100 字总结下列 ${role} 文档片段的核心内容。直接输出摘要,不加 preamble。

# 片段
${chunk}`;
  // P7-07 修复:LLM 调用前数据传输声明
  console.log(
    `→ sending ${Buffer.byteLength(prompt, 'utf8')} bytes to Anthropic API (provider=anthropic, region: auto, model=${DEFAULT_MODEL}, op=index)`,
  );
  const result = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return (block?.text ?? '').trim();
}

/** P7-03 修复:metadata-only role 集合(与 regenerator.ts 保持一致;此处复写避免循环 import) */
const METADATA_ONLY_INDEX_ROLES = new Set(['acceptance-report']);

/** 跑单 anchor 的索引 */
export async function indexAnchor(client: IndexerClient, anchor: LegacyAnchor): Promise<IndexEntry> {
  // P7-03 修复:acceptance-report 走 metadata-only(spec §7 line 909 / 决策 #8 / I-8)
  // 仅读文件名 + frontmatter(若有),不读全文不发 LLM
  if (METADATA_ONLY_INDEX_ROLES.has(anchor.role)) {
    return await indexAnchorMetadataOnly(anchor);
  }
  const text = await readAnchorText(anchor);
  // redact 敏感数据后再发 LLM
  const masked = redact(text).redactedText;
  const inputBytes = Buffer.byteLength(masked, 'utf8');
  const chunks = chunkText(masked);

  let summary: string;
  if (chunks.length === 1) {
    summary = await summarizeChunk(client, chunks[0]!, anchor.role);
  } else {
    // 分块各自摘要,再合并
    const partials: string[] = [];
    for (const c of chunks) {
      partials.push(await summarizeChunk(client, c, anchor.role));
    }
    // 二次合并:让 LLM 把多个 chunk 摘要合成 ~100 字
    summary = await summarizeChunk(client, partials.join('\n\n'), anchor.role);
  }

  return {
    path: anchor.path,
    role: anchor.role,
    summary,
    inputBytes,
  };
}

/** 跑全部 authoritative anchor */
export async function buildIndex(
  client: IndexerClient,
  file: LegacyAnchorsFile,
): Promise<IndexEntry[]> {
  const auth = file.anchors.filter((a) => a.authoritative);
  const out: IndexEntry[] = [];
  for (const a of auth) {
    out.push(await indexAnchor(client, a));
  }
  return out;
}

/** 渲染索引为 markdown(forge/docs/index.md) */
export function renderIndexMarkdown(entries: IndexEntry[]): string {
  const lines: string[] = [];
  lines.push('# Legacy Anchor Index');
  lines.push('');
  lines.push('| role | path | summary |');
  lines.push('|---|---|---|');
  for (const e of entries) {
    const summaryEscaped = e.summary.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    lines.push(`| ${e.role} | \`${e.path}\` | ${summaryEscaped} |`);
  }
  return lines.join('\n');
}

/** 摘要长度容差校验(spec §5.4 indexer) */
export function isSummaryWithinTolerance(summary: string): boolean {
  const len = summary.length;
  return len >= SUMMARY_TARGET_LEN - SUMMARY_TOLERANCE * 2 && len <= SUMMARY_TARGET_LEN + SUMMARY_TOLERANCE * 4;
}

/** P7-03 修复:metadata-only 索引(不发 LLM,只读文件名 + 可选 frontmatter)
 * spec §7 line 909:验收报告仅在 forge/docs/index.md 索引文件名 + metadata,
 * 不读全文,不发 LLM,提供 trace graph 入口
 */
async function indexAnchorMetadataOnly(anchor: LegacyAnchor): Promise<IndexEntry> {
  const { readFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  let frontmatterSummary = '(metadata-only;不读全文)';
  try {
    if (existsSync(anchor.path)) {
      const raw = (await readFile(anchor.path, 'utf8')).slice(0, 2048);
      // 仅解析 frontmatter(若有);用 gray-matter 静态扫
      const matter = (await import('gray-matter')).default;
      const parsed = matter(raw);
      const meta = parsed.data ?? {};
      const fields = ['client', 'date', 'version', 'pass_count', 'total_count']
        .filter((k) => k in meta)
        .map((k) => `${k}=${String(meta[k])}`)
        .join(', ');
      if (fields) {
        frontmatterSummary = `acceptance metadata:${fields}(metadata-only,不发 LLM)`;
      } else {
        frontmatterSummary = `(metadata-only;无 frontmatter,仅索引文件路径作 trace 入口)`;
      }
    }
  } catch {
    // 解析失败不阻塞
  }
  return {
    path: anchor.path,
    role: anchor.role,
    summary: frontmatterSummary,
    inputBytes: 0,
  };
}
