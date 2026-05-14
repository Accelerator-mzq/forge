// src/core/validate/coverage-gap.ts — plan-9d Task 4 v3
// 扫描 spec.md 列出的 Requirement,grep codebase 找实施证据;0 命中产 coverage_gap finding
// 沿 design §2.3.3 line 446 grep + AST 0 命中原则;v1.0 仅 grep,AST 留 v1.1 增强
//
// v3 B-1 修订:不依赖 src/core/parse/specs.ts 的 parseSpec(它只解析 Scenario,无 Requirement);
// 改用 parseMarkdown 直接找 `## Requirement:` heading
//
// 注:本模块不读 marker 文件(verify 阶段 marker 尚未产);
// 只扫 spec 与 codebase(由 changeDir 的上一级 cwd 推断)

import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path'; // v6 N-2 修订:补 sep import
import { parseMarkdown } from '../parse/markdown.js';

export interface SpecRequirement {
  id: string; // Requirement: 后的标识(从 heading 抽)
  title: string; // 完整标题(用于关键词抽取)
}

export interface CoverageGapHit {
  spec_file: string; // spec 路径(相对 codebaseRoot)
  requirement_id: string; // Requirement 段落 id
  searched_keywords: string[]; // grep 用的关键词
  grep_results: Record<string, number>; // 关键词 → 命中次数
  total_hits: number;
}

/**
 * 从 spec.md 文本抽 Requirement 列表(沿 design Requirement 命名约定):
 * `## Requirement: <id>` 或 `### Requirement: <id>` 或更深(H2-H6)
 *
 * v4 D-4 修订:扩 H2-H6(不限 H2-H3) — design line 304 没限制 Requirement 必须 H2;
 * 若 spec 用 H4+ 写 Requirement 应被识别,而非静默漏扫
 */
export function extractRequirements(specText: string): SpecRequirement[] {
  const md = parseMarkdown(specText);
  const reqSections = md.sections.filter(
    (s) => s.level >= 2 && s.level <= 6 && /^Requirement\s*[:#]?\s*/i.test(s.heading),
  );
  return reqSections.map((sec) => {
    const m = sec.heading.match(/^Requirement\s*[:#]?\s*(.+)$/i);
    const id = (m?.[1] ?? sec.heading).trim();
    return { id, title: sec.heading };
  });
}

/**
 * 扫描 specs/*.md 中每个 Requirement,在 codebase grep 关键词。
 * 完全 0 命中的 Requirement 收集到列表,供 validateChange 产 CRITICAL coverage_gap finding。
 *
 * codebase 扫描范围:codebaseRoot,排除 node_modules / dist / .git / forge / tests/fixtures
 */
export async function scanCoverageGaps(
  changeDir: string,
  codebaseRoot: string,
): Promise<CoverageGapHit[]> {
  const specsDir = join(changeDir, 'specs');
  let entries: string[];
  try {
    entries = await readdir(specsDir);
  } catch {
    return [];
  }
  const mdFiles = entries.filter((n) => n.endsWith('.md'));
  const hits: CoverageGapHit[] = [];

  for (const name of mdFiles) {
    const specPath = join(specsDir, name);
    const specText = await readFile(specPath, 'utf8');
    const requirements = extractRequirements(specText);

    for (const req of requirements) {
      const keywords = extractKeywords(req.id || req.title);
      if (keywords.length === 0) continue;
      const grepResults: Record<string, number> = {};
      let total = 0;
      for (const kw of keywords) {
        const count = await grepCountInDir(codebaseRoot, kw);
        grepResults[kw] = count;
        total += count;
      }
      if (total === 0) {
        hits.push({
          spec_file: relative(codebaseRoot, specPath),
          requirement_id: req.id,
          searched_keywords: keywords,
          grep_results: grepResults,
          total_hits: 0,
        });
      }
    }
  }
  return hits;
}

/**
 * 从 Requirement 标题抽 1-5 个关键词(v3 M-1 修订:拆 hyphen / camelCase)
 *
 * 示例:
 *   'token-refresh-flow' → ['token', 'refresh', 'flow']
 *   'tokenRefreshFlow' → ['token', 'refresh', 'flow']
 *   'token_refresh_flow' → ['token', 'refresh', 'flow']
 *   'JWT API Endpoint' → ['jwt', 'api', 'endpoint']
 */
export function extractKeywords(title: string): string[] {
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'of',
    'to',
    'in',
    'for',
    'with',
    'is',
    'be',
    'on',
    'at',
    'by',
    'as',
    'it',
    'if',
  ]);
  // v3 M-1:把 camelCase 边界改成空格 + 把 hyphen / underscore / 标点 改空格
  const tokens = title
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase split
    .replace(/[-_./:]+/g, ' ') // hyphen / underscore / 标点 → 空格
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopwords.has(w));
  // 去重保序
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t);
      result.push(t);
    }
  }
  return result.slice(0, 5); // 取前 5 个,提高命中率(v3 M-1 修订:从 3 → 5)
}

/**
 * 在 dir 下递归 grep 关键词(简化版 — 不用 child_process,用 readFile;v1.0 性能可接受)
 *
 * v4 R-3 修订 + v6 N-1 简化 + v7 N-2 注释同步:SKIP_DIRS 兼顾两种路径形态:
 *   - 单层 directory name(node_modules / dist / forge / coverage / build)— 用 SKIP_BASENAMES Set 匹配 e.name
 *   - 顶层 relative path(tests / docs / forge-eval)— 用 SKIP_REL_PATHS exact match path.relative(root, currentDir);
 *     walk 从 rootDir 开始,进入 tests/ 时 rel='tests' 命中 catch-all → continue,后续 tests/core, tests/cli 等子目录永远进不来
 * 同时跳所有以 . 或 _ 开头的目录(.git / .evidence / _shared 等)
 */
async function grepCountInDir(rootDir: string, keyword: string): Promise<number> {
  const SKIP_BASENAMES = new Set(['node_modules', 'dist', 'forge', 'coverage', 'build']);
  const SKIP_REL_PATHS = new Set([
    // v5 REG-3 修订 + v6 N-1 修订:tests 顶层是 catch-all(walk 进入 tests/ 时 rel='tests' 命中 continue,
    // 后续 tests/core, tests/cli 等子目录永远进不来);docs 同样原理。简化为顶层 catch-all,无冗余。
    'tests',
    'docs',
    'forge-eval',
  ]);
  let total = 0;
  async function walk(d: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        // 1. basename skip(node_modules / dist / 等)
        if (SKIP_BASENAMES.has(e.name)) continue;
        // 2. dot / underscore prefix skip(.git / .evidence / _shared)
        if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
        // 3. relative path skip(顶层 catch-all:tests / docs / forge-eval — walk 进入后不会下钻)
        const rel = relative(rootDir, p).split(sep).join('/');
        if (SKIP_REL_PATHS.has(rel)) continue;
        await walk(p);
      } else if (e.isFile() && /\.(ts|tsx|js|jsx|md)$/.test(e.name)) {
        try {
          const text = await readFile(p, 'utf8');
          const matches = text.match(
            new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          );
          if (matches) total += matches.length;
        } catch {
          /* 文件读失败跳过 */
        }
      }
    }
  }
  await walk(rootDir);
  return total;
}
