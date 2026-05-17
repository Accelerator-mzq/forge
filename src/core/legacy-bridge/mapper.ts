// 二阶段 mapping 第一阶段:LLM 扫 docs/+src/ → anchors-draft.yaml — Plan 7 Phase D
// 决策 #4(二阶段 mapping)+ M-2(--merge / --overwrite 语义)

import Anthropic from '@anthropic-ai/sdk';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { LegacyAnchor, LegacyAnchorRole, LegacyAnchorsFile } from './types.js';
import { redact } from './redact.js';
import type { LlmTask } from './llm-task.js';

const DEFAULT_DOCS_PATHS = ['docs', 'doc', 'document', 'documents', 'documentation'];
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'forge', // forge 自身产物
  '.cache',
]);

/** mapper 输入 */
export interface MapperInput {
  /** 项目根 */
  projectRoot: string;
  /** 用户额外 docs 目录(覆盖 DEFAULT_DOCS_PATHS) */
  docsPaths?: string[];
  /** 是否扫 src/(找 .test 反推 system-tests) */
  scanSrc?: boolean;
  /** 现有 anchors.yaml 内容(用于 --merge 决策) */
  existing?: LegacyAnchorsFile;
  /** merge 模式(M-2) */
  mode: 'merge' | 'overwrite';
}

/** mapper 输出 */
export interface MapperOutput {
  draftYaml: string;
  draftMarkdown: string;
  /** 新增的 anchor(相对 existing) */
  newAnchors: LegacyAnchor[];
  /** 保留的现有 anchor(merge 模式) */
  preservedAnchors: LegacyAnchor[];
  /** 扫到但未匹配 role 的文件(让 LLM 标 'unmatched',用户后审) */
  unmatched: string[];
}

/** mapper 客户端最小接口 */
export interface MapperClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const SCAN_FILE_EXTS = new Set(['.md', '.txt', '.csv', '.xlsx']);
const PREVIEW_LINES = 30;

/** 递归扫目录 */
async function* walk(dir: string, baseRoot: string): AsyncGenerator<string> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    if (name.startsWith('.') && name !== '.gitattributes') continue;
    const full = join(dir, name);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      yield* walk(full, baseRoot);
    } else if (s.isFile() && SCAN_FILE_EXTS.has(extname(name).toLowerCase())) {
      yield relative(baseRoot, full);
    }
  }
}

/** 取文件前 N 行作 preview(LLM 据此推测 role) */
async function readPreview(path: string): Promise<string> {
  const ext = extname(path).toLowerCase();
  if (ext === '.xlsx') {
    return '(xlsx 二进制 — 不读取 preview;由 LLM 据文件名推测 role)';
  }
  try {
    const content = await readFile(path, 'utf8');
    const lines = content.split(/\r?\n/).slice(0, PREVIEW_LINES);
    return lines.join('\n');
  } catch {
    return '(读取失败)';
  }
}

/** 拼 LLM prompt:让 LLM 给一批文件分类 role */
function buildMapperPrompt(fileEntries: Array<{ path: string; preview: string }>): string {
  return `你是一名文档资产分类员。对下面每个文件,判断其属于哪种 brownfield 角色。

# 角色定义
- requirements:SRS / PRD / 需求规格
- high-level-design:HLD / 概要设计 / Architecture
- low-level-design:LLD / 详细设计 / Module Spec
- system-tests:系统测试用例 / testcases
- acceptance-report:验收报告
- rationale:设计决策 / 历史背景
- glossary:术语表
- unmatched:不属于上述任何一种(README / changelog / API doc 等)

# 输出格式(必须严格 JSON)
\`\`\`
[
  {"path": "docs/SRS.md", "role": "requirements", "modules": ["payment","order"]}
]
\`\`\`
modules 字段可空(不确定时输出 [])。

# 文件清单
${fileEntries.map((e) => `## ${e.path}\n${e.preview}`).join('\n\n')}

仅输出 JSON 数组,不输出 preamble。`;
}

/** 解析 LLM 返回 */
function parseMapperResponse(
  text: string,
  fallbackPaths: string[],
): Array<{ path: string; role: LegacyAnchorRole | 'unmatched'; modules?: string[] }> {
  try {
    const arr = JSON.parse(text.trim()) as Array<{
      path: string;
      role: string;
      modules?: string[];
    }>;
    if (!Array.isArray(arr)) throw new Error('not array');
    return arr.map((item) => ({
      path: item.path,
      role: item.role as LegacyAnchorRole | 'unmatched',
      modules: item.modules,
    }));
  } catch {
    // 解析失败:全 mark unmatched(用户审)
    return fallbackPaths.map((p) => ({ path: p, role: 'unmatched' as const }));
  }
}

/** 确定性 prep:扫文件 + 读 preview + redact + 拼 prompt → 一个 LlmTask */
export async function buildMapTask(input: MapperInput): Promise<LlmTask> {
  const { projectRoot } = input;
  const docsPaths = input.docsPaths ?? DEFAULT_DOCS_PATHS;
  const allFiles: string[] = [];
  for (const docDir of docsPaths) {
    const full = join(projectRoot, docDir);
    if (!existsSync(full)) continue;
    for await (const f of walk(full, projectRoot)) allFiles.push(f);
  }
  if (input.scanSrc) {
    const srcRoot = join(projectRoot, 'src');
    if (existsSync(srcRoot)) {
      for await (const f of walk(srcRoot, projectRoot)) {
        if (f.includes('test') || f.includes('spec')) allFiles.push(f);
      }
    }
  }
  const entries: Array<{ path: string; preview: string }> = [];
  for (const f of allFiles) {
    const preview = redact(await readPreview(join(projectRoot, f))).redactedText;
    entries.push({ path: f, preview });
  }
  return {
    op: 'map',
    inputs: entries.map((e) => ({ source: e.path, content: e.preview })),
    prompt: buildMapperPrompt(entries),
    model: DEFAULT_MODEL,
    outputSchema: '[{ "path": string, "role": string, "modules": string[] }]',
    outputPath: '.cache/legacy-bridge-result-map.json',
  };
}

/** 确定性后处理:LLM 分类结果文本 → draft yaml/md + anchors */
export function applyMapResult(
  llmText: string,
  allFiles: string[],
  input: { mode: 'merge' | 'overwrite'; existing?: LegacyAnchorsFile },
): MapperOutput {
  // 解析 LLM 返回文本;解析失败则全 fallback 为 unmatched
  const classifications = parseMapperResponse(llmText, allFiles);
  const newAnchors: LegacyAnchor[] = [];
  const unmatched: string[] = [];
  // 同 role 第一个标 authoritative=true(简化策略;用户后审)
  const roleSeen = new Set<LegacyAnchorRole>();
  for (const c of classifications) {
    if (c.role === 'unmatched') {
      unmatched.push(c.path);
      continue;
    }
    const isFirst = !roleSeen.has(c.role);
    roleSeen.add(c.role);
    newAnchors.push({ role: c.role, path: c.path, authoritative: isFirst, modules: c.modules });
  }
  // merge 模式:保留 existing 中已审过的 anchor
  let preservedAnchors: LegacyAnchor[] = [];
  if (input.mode === 'merge' && input.existing) {
    const existingPaths = new Set(input.existing.anchors.map((a) => a.path));
    preservedAnchors = input.existing.anchors;
    // 新增中 path 已在 existing 的跳过(避免重复)
    const filtered = newAnchors.filter((a) => !existingPaths.has(a.path));
    newAnchors.length = 0;
    newAnchors.push(...filtered);
  }
  const finalFile: LegacyAnchorsFile = {
    schema: 'forge-legacy-anchor/v1',
    anchors: [...preservedAnchors, ...newAnchors],
    redact: input.existing?.redact,
  };
  return {
    draftYaml: stringifyYaml(finalFile),
    draftMarkdown: renderMapperOverview(finalFile, unmatched),
    newAnchors,
    preservedAnchors,
    unmatched,
  };
}

/** 跑 mapping(LLM 推测)—— 内部复用 buildMapTask + applyMapResult */
export async function runMapper(client: MapperClient, input: MapperInput): Promise<MapperOutput> {
  const task = await buildMapTask(input);
  const allFiles = task.inputs.map((i) => i.source);
  // 无文件时直接返回空结果
  if (task.inputs.length === 0) return applyMapResult('[]', [], input);
  // P7-07 修复:LLM 调用前数据传输声明
  console.log(
    `→ sending ${Buffer.byteLength(task.prompt, 'utf8')} bytes to Anthropic API (provider=anthropic, region: auto, model=${DEFAULT_MODEL}, op=map ${task.inputs.length} files)`,
  );
  const result = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: task.prompt }],
  });
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return applyMapResult(block?.text ?? '', allFiles, input);
}

/** 渲染概览 markdown(给用户审) */
function renderMapperOverview(file: LegacyAnchorsFile, unmatched: string[]): string {
  const lines: string[] = [];
  lines.push('# Legacy Anchors Draft 概览');
  lines.push('');
  lines.push(
    'LLM 自动扫描 + 推测的 anchor 草稿。请审改 yaml 后跑 `mv legacy-anchors-draft.yaml legacy-anchors.yaml`。',
  );
  lines.push('');
  lines.push('## Anchors by role');
  const byRole: Record<string, LegacyAnchor[]> = {};
  for (const a of file.anchors) {
    const list = byRole[a.role] ?? [];
    list.push(a);
    byRole[a.role] = list;
  }
  for (const [role, anchors] of Object.entries(byRole)) {
    lines.push(`### ${role} (${anchors.length})`);
    lines.push('');
    for (const a of anchors) {
      const auth = a.authoritative ? ' **(authoritative)**' : '';
      lines.push(
        `- \`${a.path}\`${auth}${a.modules?.length ? ` modules: ${a.modules.join(', ')}` : ''}`,
      );
    }
    lines.push('');
  }
  if (unmatched.length > 0) {
    lines.push('## Unmatched files(LLM 不确定 role)');
    lines.push('');
    for (const p of unmatched) {
      lines.push(`- ${p}`);
    }
  }
  return lines.join('\n');
}

/** 写 draft 到磁盘 */
export async function writeMapperDraft(
  forgeRoot: string,
  output: MapperOutput,
): Promise<{ yamlPath: string; mdPath: string }> {
  const yamlPath = join(forgeRoot, 'legacy-anchors-draft.yaml');
  const mdPath = join(forgeRoot, 'legacy-anchors-draft.md');
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(forgeRoot, { recursive: true });
  await writeFile(yamlPath, output.draftYaml, 'utf8');
  await writeFile(mdPath, output.draftMarkdown, 'utf8');
  return { yamlPath, mdPath };
}
