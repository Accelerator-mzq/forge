// specs/<name>.md 解析器 — Given/When/Then scenario

import { parseMarkdown } from './markdown.js';

/** parseSpec 函数的返回结构 */
export interface ParsedSpec {
  /** 规格文档标题（H1） */
  title: string;
  /** 所有 scenario 列表 */
  scenarios: Scenario[];
}

/** 单个 Scenario 结构 */
export interface Scenario {
  /** 从 "## Scenario: <id>" 标题抽出的 id */
  id: string;
  /** Given 子句正文(去 **Given** 前缀) */
  given: string[];
  /** When 子句 */
  when: string[];
  /** Then + And 子句(都归入 then) */
  then: string[];
  /** 该 scenario 的原始 markdown body */
  rawBody: string;
}

// 匹配 **Keyword** 开头的步骤行，提取关键字和正文
const STEP_RE = /^\*\*(Given|When|Then|And|But)\*\*\s+(.+)$/i;

/**
 * 解析 specs markdown 文件，抽取标题和 Given/When/Then scenario 列表。
 */
export function parseSpec(text: string): ParsedSpec {
  const md = parseMarkdown(text);

  // 找到 H1 作为 spec 标题
  const titleSection = md.sections.find((s) => s.level === 1);
  const title = titleSection?.heading ?? '';

  // 找所有 "## Scenario: <id>" 章节
  const scenarioSections = md.sections.filter(
    (s) => s.level === 2 && /^Scenario:/i.test(s.heading),
  );

  const scenarios: Scenario[] = scenarioSections.map((sec) => {
    // 从 heading 提取 scenario id
    const idMatch = sec.heading.match(/^Scenario:\s*(\S.*)$/i);
    const id = idMatch?.[1]?.trim() ?? '';

    const given: string[] = [];
    const when: string[] = [];
    const then: string[] = [];
    // 跟踪当前所在子句，用于 And/But 归并
    let currentClause: 'given' | 'when' | 'then' | null = null;

    // 逐行解析步骤
    for (const rawLine of sec.body.split('\n')) {
      const line = rawLine.trim();
      const m = line.match(STEP_RE);
      if (!m) continue;

      const keyword = m[1]!.toLowerCase();
      const body = m[2]!.trim();

      if (keyword === 'given') {
        currentClause = 'given';
        given.push(body);
      } else if (keyword === 'when') {
        currentClause = 'when';
        when.push(body);
      } else if (keyword === 'then') {
        currentClause = 'then';
        then.push(body);
      } else if (keyword === 'and' || keyword === 'but') {
        // And/But 归入当前所在子句
        if (currentClause === 'given') given.push(body);
        else if (currentClause === 'when') when.push(body);
        else if (currentClause === 'then') then.push(body);
      }
    }

    return { id, given, when, then, rawBody: sec.body };
  });

  return { title, scenarios };
}
