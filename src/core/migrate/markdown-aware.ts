// markdown-aware walker — Plan 8b Task 2.1
// Spec §2.5 v3 边界:只识 fenced(``` 或 ~~~,同种 token 收尾);不识 indented code;UTF-8 + BOM 跳过

export interface LineCtx {
  // 当前行是否在 fenced code block 内
  inFenced: boolean;
  // 当前行是否是 markdown table row(以 `|` 开头且至少 2 个 `|`)
  isTableRow: boolean;
}

export type WalkCallback = (line: string, ctx: LineCtx, lineIndex: number) => string | void;

/**
 * 逐行扫描 markdown,识别 fenced + table-row;只在 !inFenced && !isTableRow 行允许 transform。
 * walker 不识 indented code(4 空格 / Tab)— spec §7.1 known limitation。
 *
 * @param content markdown 文本(自动 CRLF normalize)
 * @param cb 每行回调;返 string 则替换该行,返 void 保留原行
 * @returns 处理后的 markdown 文本
 */
export function walkLines(content: string, cb: WalkCallback): string {
  // CRLF normalize
  const normalized = content.replace(/\r\n/g, '\n');
  // BOM 跳过
  const stripped = normalized.charCodeAt(0) === 0xfeff ? normalized.slice(1) : normalized;
  // 空内容早退:''.split('\n') 返回 [''] 会触发一次回调,语义应零次(I #4 fix)
  if (stripped.length === 0) return '';
  const lines = stripped.split('\n');

  const out: string[] = [];
  let inFenced = false;
  let fenceToken: '```' | '~~~' | null = null;
  // 末尾是否有 \n(决定末尾空行的 inFenced 状态)
  const endsWithNewline = stripped.length > 0 && stripped[stripped.length - 1] === '\n';
  // 保存上一行的 inFenced 状态(用于末尾空行的处理)
  let prevLineInFenced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    // 检查当前行是否开启或关闭 fence
    const startsTripleBacktick = trimmed.startsWith('```');
    const startsTildeTilde = trimmed.startsWith('~~~');

    // 决定当前行的 inFenced 状态和状态转移
    // 默认继承当前 fenced 状态;开启行/闭合行本身仍算 fenced
    // 注:plan 参考代码闭合行 inFenced=false,与 plan 测试 2(``` 必须同种 token 收尾)
    // 期望 visited=[] 直接矛盾(闭合行会进 visited)。修正为开启行 + 闭合行 lineInFenced=true,
    // 与"fenced 整个范围(开启 + 内容 + 闭合 + 末尾空行)都不暴露给 transform"语义一致。
    let lineInFenced = inFenced;
    if (!inFenced && startsTripleBacktick) {
      // 开启 ``` fence(开启行算 fenced)
      lineInFenced = true;
      inFenced = true;
      fenceToken = '```';
    } else if (!inFenced && startsTildeTilde) {
      // 开启 ~~~ fence(开启行算 fenced)
      lineInFenced = true;
      inFenced = true;
      fenceToken = '~~~';
    } else if (inFenced && fenceToken === '```' && startsTripleBacktick) {
      // 关闭 ``` fence(闭合符仍算 fenced)
      lineInFenced = true;
      inFenced = false;
      fenceToken = null;
    } else if (inFenced && fenceToken === '~~~' && startsTildeTilde) {
      // 关闭 ~~~ fence(闭合符仍算 fenced)
      lineInFenced = true;
      inFenced = false;
      fenceToken = null;
    }

    // table-row 判定:以 `|` 开头且至少 2 个 `|`
    const isTableRow = trimmed.startsWith('|') && (trimmed.match(/\|/g)?.length ?? 0) >= 2;

    // 末尾空行特殊处理:plan 测试 2 隐含语义 — fenced 闭合后末尾空行视为 fenced 内部
    // (input '```\n...\n```\n' 末尾 \n 产生的空字符串继承上一行的 inFenced 状态)
    const finalLineInFenced =
      i === lines.length - 1 && line === '' && endsWithNewline ? prevLineInFenced : lineInFenced;

    const ctx: LineCtx = { inFenced: finalLineInFenced, isTableRow };
    const replaced = cb(line, ctx, i);
    out.push(typeof replaced === 'string' ? replaced : line);

    prevLineInFenced = lineInFenced;
  }

  return out.join('\n');
}

// Section 切分(fence-aware) — codex C2:不复用 parse/markdown.ts(其不 fence-aware)
export interface AwareSection {
  // heading 级别(1-6)
  level: number;
  // heading 文本内容(不含 `#` 符号)
  heading: string;
  // body 不含 heading 行;不去除 fenced 内容
  body: string;
  // heading 行在原文的起始行号
  startLine: number;
  // body 结束行号(不含该行)
  endLine: number;
}

/**
 * fence-aware section 切分(复用 walkLines):防止代码块内 `## Fake` 误切。
 * 不复用 parse/markdown.ts(其不 fence-aware)。
 */
export function splitSectionsAware(content: string): AwareSection[] {
  const sections: AwareSection[] = [];
  // 用元组持有当前 section,避开 TS 在闭包回调外无法收窄 null 的限制
  const state: { current: AwareSection | null } = { current: null };
  const buffer: string[] = [];

  walkLines(content, (line, ctx, i) => {
    // 只在 !inFenced 行识别 heading(防代码块内 ## Fake 误切)
    const headingMatch = !ctx.inFenced ? line.match(/^(#{1,6})\s+(.+)$/) : null;
    if (headingMatch) {
      if (state.current !== null) {
        state.current.body = buffer.join('\n');
        state.current.endLine = i;
        sections.push(state.current);
        buffer.length = 0;
      }
      state.current = {
        level: headingMatch[1]?.length ?? 1,
        heading: headingMatch[2]?.trim() ?? '',
        body: '',
        startLine: i + 1,
        endLine: -1,
      };
    } else if (state.current !== null) {
      buffer.push(line);
    }
  });
  if (state.current !== null) {
    state.current.body = buffer.join('\n');
    sections.push(state.current);
  }
  return sections;
}
