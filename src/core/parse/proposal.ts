// proposal.md 解析器 — 抽 title / why / what / scope

import { parseMarkdown } from './markdown.js';

/** parseProposal 函数的返回结构 */
export interface ParsedProposal {
  /** proposal 标题(来自 h1) */
  title: string;
  /** Why 章节正文 */
  why: string;
  /** What 章节正文 */
  what: string;
  /** Scope 章节正文(可选，无则 undefined) */
  scope?: string;
}

/**
 * 解析 proposal.md 文本。
 * 期望结构:`# <Title>` + `## Why` + `## What` + 可选 `## Scope`。
 * 缺 title / why / what 不报错(留给 validate 阶段)。
 */
export function parseProposal(text: string): ParsedProposal {
  const md = parseMarkdown(text);

  // 从 sections 中找 h1 作为标题
  const titleSection = md.sections.find((s) => s.level === 1);
  const title = titleSection?.heading ?? '';

  // 按 heading 名称（不区分大小写）查找章节正文
  const findBody = (heading: string) =>
    md.sections.find((s) => s.heading.toLowerCase() === heading.toLowerCase())?.body.trim() ?? '';

  const why = findBody('Why');
  const what = findBody('What');

  // Scope 章节可选：找到时返回正文，找不到时返回 undefined
  const scopeSection = md.sections.find((s) => s.heading.toLowerCase() === 'scope');
  const scope = scopeSection?.body.trim();

  return { title, why, what, scope };
}
