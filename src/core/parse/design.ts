// design.md 解析器 — 通用结构(title + sections),不强制具体段名

import { parseMarkdown } from './markdown.js';
import type { Section } from './markdown.js';

/** parseDesign 函数的返回结构 */
export interface ParsedDesign {
  /** design 标题(来自 h1) */
  title: string;
  /** h2 及以下所有章节(不含 h1 标题章节) */
  sections: Section[];
}

/**
 * 解析 design.md 文本。
 * 只抽 title(h1)和所有 h2+ 章节，不强制特定段名。
 */
export function parseDesign(text: string): ParsedDesign {
  const md = parseMarkdown(text);

  // 找 h1 作为标题
  const titleSection = md.sections.find((s) => s.level === 1);

  return {
    title: titleSection?.heading ?? '',
    // 过滤出 h2 及以下章节
    sections: md.sections.filter((s) => s.level >= 2),
  };
}
