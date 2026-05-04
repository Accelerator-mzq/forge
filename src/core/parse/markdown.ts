// markdown 解析器 — 抽 frontmatter 和按 heading 切 section

import matter from 'gray-matter';

/** parseMarkdown 函数的返回结构 */
export interface ParsedMarkdown {
  /** YAML frontmatter 解析结果(无则空对象) */
  frontmatter: Record<string, unknown>;
  /** 原始正文(去掉 frontmatter) */
  body: string;
  /** 按 ATX heading(`#`)切分的章节 */
  sections: Section[];
}

/** 一个 heading 章节 */
export interface Section {
  /** 标题级别(1-6) */
  level: number;
  /** 标题文本(不含 `#` 和空格) */
  heading: string;
  /** 该章节正文(到下一个同级或更高级 heading 之前) */
  body: string;
  /** 起始行号(1-indexed,heading 行) */
  startLine: number;
  /** 结束行号(下一个 heading 行 - 1,或文件末尾) */
  endLine: number;
}

/**
 * 解析 markdown 文本。
 * 支持 YAML frontmatter(`---` 包裹)+ ATX heading(`# / ##`)分章节。
 */
export function parseMarkdown(text: string): ParsedMarkdown {
  // gray-matter 自动处理 frontmatter
  const parsed = matter(text);
  const frontmatter = (parsed.data ?? {}) as Record<string, unknown>;
  const body = parsed.content;

  // 按 heading 切分正文
  const sections = extractSections(body);

  return { frontmatter, body, sections };
}

/**
 * 把 markdown 正文按 ATX heading 切成章节。
 * 每遇到新 heading 就关闭当前 section，开启新 section。
 */
function extractSections(body: string): Section[] {
  const lines = body.split('\n');
  const sections: Section[] = [];
  let current: Section | null = null;
  const buffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // 匹配 ATX heading：1-6 个 # 后接空格和标题文本
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // 关闭当前 section，把缓冲区内容写入 body
      if (current) {
        current.body = buffer.join('\n');
        current.endLine = i; // 当前行是新 heading，所以 endLine 是上一行索引
        sections.push(current);
        buffer.length = 0;
      }
      // 开始新 section
      current = {
        level: headingMatch[1]?.length ?? 1,
        heading: headingMatch[2]?.trim() ?? '',
        body: '',
        startLine: i + 1, // 1-indexed
        endLine: lines.length, // 默认到文件末尾
      };
    } else if (current) {
      // 当前行属于 current section 的正文
      buffer.push(line);
    }
  }

  // 关闭最后一个 section
  if (current) {
    current.body = buffer.join('\n');
    sections.push(current);
  }

  return sections;
}
