// Layer 3b:whole-repo 发现 + 文本抽取 + prep + apply + 增量 diff(spec §4/§5/§6)
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';
import type { LegacyRequirementKind, LegacyRequirementStatus } from './legacy-requirements.js';
import { parseWorkbook, sheetToMarkdown } from './excel.js';
import { redact } from './redact.js';
import type { LlmTask } from './llm-task.js';

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

const DEFAULT_MODEL = 'claude-sonnet-4-6';

/** 抽取条目数组的 outputSchema 描述(供 agent 自校验,spec §4.2) */
const EXTRACT_OUTPUT_SCHEMA =
  '[{ "title": string, "description": string, "status": "implemented"|"unimplemented", ' +
  '"section": string, "evidence": string[], "confidence": "high"|"medium"|"low" }]';

/** 单文档抽取 prompt:内嵌 redact 后文本 + redact 后代码索引(spec §4.2) */
function buildExtractPrompt(args: {
  docPath: string;
  docKind: LegacyRequirementKind;
  redactedText: string;
  redactedCodeIndex: string;
}): string {
  return `你是一名需求抽取员。从下面这份老文档抽取需求条目,逐条判定其在当前代码库里是否已实现。

# 文档
路径:${args.docPath}(kind=${args.docKind})
---
${args.redactedText}
---

# 当前代码库结构索引(file tree;判 implemented 时参考)
${args.redactedCodeIndex}

# 任务
- 抽取该文档里的每条需求,给 title(一行)+ description(正文)。
- 逐条判 status:implemented(代码已实现)或 unimplemented。
- 判 implemented 必须在 evidence 给出代码依据(形如 "src/foo.ts:42 ...");unimplemented 时 evidence 为 []。
- section:该条所在章节锚 / 标题;无则空字符串。
- confidence:你对 status 判定的置信度 high/medium/low。

# 输出格式(严格 JSON,无 preamble)
${EXTRACT_OUTPUT_SCHEMA}`;
}

/**
 * prep:每来源文档建一个 LlmTask(spec §4.1 第 4 步 / §4.2)。
 * redact 对**全部输入**(文档文本 + 代码索引);prompt 内嵌 redact 后两者(ApiRunner 只发 prompt)。
 * @param codeIndex whole-repo 代码文件路径列表(file tree),由调用方传入
 */
export async function buildExtractTasks(
  repoRoot: string,
  sources: DiscoveredSource[],
  codeIndex: string[],
): Promise<LlmTask[]> {
  // 代码索引对全部 task 相同,redact 一次(spec §4.1 第 3 步:全部输入都 redact,含代码索引)
  const redactedCodeIndex = redact(codeIndex.join('\n')).redactedText;
  const tasks: LlmTask[] = [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]!;
    const rawText = await extractText(repoRoot, src.path);
    const redactedText = redact(rawText).redactedText;
    const prompt = buildExtractPrompt({
      docPath: src.path,
      docKind: src.kind,
      redactedText,
      redactedCodeIndex,
    });
    tasks.push({
      op: 'extract',
      // inputs:与 prompt 并列的 redact 快照(文档 + 代码索引;非送 LLM 通道,spec §4.2)
      inputs: [
        { source: src.path, content: redactedText },
        { source: '<code-index>', content: redactedCodeIndex },
      ],
      prompt,
      model: DEFAULT_MODEL,
      outputSchema: EXTRACT_OUTPUT_SCHEMA,
      outputPath: `.cache/extract-result-${i}.json`,
    });
  }
  return tasks;
}

/** 一个 task 的原始结果 + 来源元信息 */
export interface ExtractResultInput {
  /** readTaskResults 取出的 { text } 信封里的 text 字符串 */
  text: string;
  /** 该 task 对应的来源文档路径 */
  source: string;
  kind: LegacyRequirementKind;
}

/** LLM 抽出的一条需求(尚未分配 id / review) */
export interface ExtractedRequirement {
  title: string;
  description: string;
  status: LegacyRequirementStatus;
  /** 来源文档 + 章节(section 来自 LLM,document/kind 来自 ExtractResultInput) */
  source: { document: string; section: string; kind: LegacyRequirementKind };
  evidence: string[];
  confidence: 'high' | 'medium' | 'low';
}

const STATUS_SET = new Set(['implemented', 'unimplemented']);
const CONFIDENCE_SET = new Set(['high', 'medium', 'low']);

/**
 * 解析 + 校验各 task 结果(spec §4.4 第 2-3 步)。
 * 每个 ExtractResultInput.text 是需求条目数组的 JSON 字符串。
 * 非法 JSON / schema 不符 → 抛带 source 的错误。
 */
export function parseExtractResults(inputs: ExtractResultInput[]): ExtractedRequirement[] {
  const out: ExtractedRequirement[] = [];
  for (const input of inputs) {
    let arr: unknown;
    try {
      arr = JSON.parse(input.text.trim());
    } catch (err) {
      throw new Error(`extract 结果解析失败 ${input.source}:${(err as Error).message}`);
    }
    if (!Array.isArray(arr)) {
      throw new Error(`extract 结果 ${input.source}:顶层不是数组`);
    }
    arr.forEach((e, i) => {
      const o = e as Record<string, unknown>;
      const at = `${input.source}[${i}]`;
      if (typeof o.title !== 'string' || o.title === '')
        throw new Error(`${at}.title 须为非空字符串`);
      if (typeof o.description !== 'string') throw new Error(`${at}.description 须为字符串`);
      if (!STATUS_SET.has(o.status as string))
        throw new Error(`${at}.status 越界:${String(o.status)}`);
      if (!CONFIDENCE_SET.has(o.confidence as string)) throw new Error(`${at}.confidence 越界`);
      if (!Array.isArray(o.evidence) || !o.evidence.every((x) => typeof x === 'string')) {
        throw new Error(`${at}.evidence 须为 string[]`);
      }
      const section = typeof o.section === 'string' ? o.section : '';
      out.push({
        title: o.title,
        description: o.description,
        status: o.status as LegacyRequirementStatus,
        source: { document: input.source, section, kind: input.kind },
        evidence: o.evidence as string[],
        confidence: o.confidence as 'high' | 'medium' | 'low',
      });
    });
  }
  return out;
}
