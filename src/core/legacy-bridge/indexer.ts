// 索引摘要器 — Plan 7 Phase D / spec §1.2 Layer 2
// 每 anchor ~100 字 LLM 摘要;大文件(> 30KB)分块输入,合并摘要

import Anthropic from '@anthropic-ai/sdk';
import { readAnchorAsText } from './encoding.js';
import { redact } from './redact.js';
import type { LegacyAnchor, LegacyAnchorsFile } from './types.js';
import type { LlmTask } from './llm-task.js';

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
export async function indexAnchor(
  client: IndexerClient,
  anchor: LegacyAnchor,
): Promise<IndexEntry> {
  // P7-03 修复:acceptance-report 走 metadata-only(spec §7 line 909 / 决策 #8 / I-8)
  // 仅读文件名 + frontmatter(若有),不读全文不发 LLM
  if (METADATA_ONLY_INDEX_ROLES.has(anchor.role)) {
    return await indexAnchorMetadataOnly(anchor);
  }
  const text = await readAnchorAsText(anchor);
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
  return (
    len >= SUMMARY_TARGET_LEN - SUMMARY_TOLERANCE * 2 &&
    len <= SUMMARY_TARGET_LEN + SUMMARY_TOLERANCE * 4
  );
}

/** 确定性 prep:产 batch 摘要 LlmTask + metadata-only 的 prebuilt 项 */
export async function buildIndexTask(
  file: LegacyAnchorsFile,
  readText: (anchor: LegacyAnchor) => Promise<string>,
): Promise<{ task: LlmTask | null; prebuilt: IndexEntry[] }> {
  // 只处理 authoritative anchor
  const auth = file.anchors.filter((a) => a.authoritative);
  const prebuilt: IndexEntry[] = [];
  const llmAnchors: Array<{ anchor: LegacyAnchor; masked: string }> = [];
  for (const a of auth) {
    // metadata-only role 不进 LLM,走 prebuilt 路径
    if (METADATA_ONLY_INDEX_ROLES.has(a.role)) {
      prebuilt.push(await indexAnchorMetadataOnly(a));
      continue;
    }
    // 读文件内容并 redact 敏感数据
    const masked = redact(await readText(a)).redactedText;
    llmAnchors.push({ anchor: a, masked });
  }
  // 所有 anchor 均为 metadata-only,不需要 LLM
  if (llmAnchors.length === 0) return { task: null, prebuilt };
  // 构造 batch prompt:合并所有需要 LLM 的 anchor
  const prompt =
    `请为下列每份文档产出约 ${SUMMARY_TARGET_LEN} 字摘要。\n严格输出 JSON 对象 {"<path>": "<摘要>"},不加 preamble。\n\n` +
    llmAnchors.map((x) => `## ${x.anchor.path}(role=${x.anchor.role})\n${x.masked}`).join('\n\n');
  return {
    task: {
      op: 'index',
      inputs: llmAnchors.map((x) => ({ source: x.anchor.path, content: x.masked })),
      prompt,
      model: DEFAULT_MODEL,
      outputSchema: '{ "<anchor-path>": "<约 100 字摘要>" }',
      outputPath: '.cache/legacy-bridge-result-index.json',
    },
    prebuilt,
  };
}

/** 确定性后处理:LLM 的 {path:summary} map + prebuilt → index markdown */
export function applyIndexResult(
  llmText: string,
  file: LegacyAnchorsFile,
  prebuilt: IndexEntry[],
): string {
  // 解析 LLM 返回的 {path: summary} JSON 对象
  let summaries: Record<string, string> = {};
  try {
    const parsed = JSON.parse(llmText.trim()) as Record<string, string>;
    // 排除 JSON 数组:typeof [] === 'object' 亦为 true,放行会产 numeric-key 垃圾条目
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) summaries = parsed;
  } catch {
    // 解析失败:LLM 摘要全空,prebuilt 仍渲染
  }
  // 建立 path → role 的反查 map
  const roleOf = new Map(file.anchors.map((a) => [a.path, a.role]));
  // 合并 prebuilt 与 LLM 摘要,统一渲染 markdown
  const entries: IndexEntry[] = [
    ...prebuilt,
    ...Object.entries(summaries).map(([path, summary]) => ({
      path,
      role: roleOf.get(path) ?? 'unmatched',
      summary,
      inputBytes: 0,
    })),
  ];
  return renderIndexMarkdown(entries);
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
