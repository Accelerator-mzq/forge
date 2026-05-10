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
  const lines = stripped.split('\n');

  const out: string[] = [];
  let inFenced = false;
  let fenceToken: '```' | '~~~' | null = null;
  // 末尾是否有 \n（决定末尾空行的 inFenced 状态）
  const endsWithNewline = stripped.length > 0 && stripped[stripped.length - 1] === '\n';
  // 保存上一行的 inFenced 状态（用于末尾空行的处理）
  let prevLineInFenced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    // 检查当前行是否开启或关闭 fence
    const startsTripleBacktick = trimmed.startsWith('```');
    const startsTildeTilde = trimmed.startsWith('~~~');

    // 决定当前行的 inFenced 状态和状态转移
    let lineInFenced = inFenced; // 默认继承当前 fenced 状态
    if (!inFenced && startsTripleBacktick) {
      // 开启 ``` fence（开启行算 fenced）
      lineInFenced = true;
      inFenced = true;
      fenceToken = '```';
    } else if (!inFenced && startsTildeTilde) {
      // 开启 ~~~ fence（开启行算 fenced）
      lineInFenced = true;
      inFenced = true;
      fenceToken = '~~~';
    } else if (inFenced && fenceToken === '```' && startsTripleBacktick) {
      // 关闭 ``` fence（闭合符仍算 fenced）
      lineInFenced = true;
      inFenced = false;
      fenceToken = null;
    } else if (inFenced && fenceToken === '~~~' && startsTildeTilde) {
      // 关闭 ~~~ fence（闭合符仍算 fenced）
      lineInFenced = true;
      inFenced = false;
      fenceToken = null;
    }

    // table-row 判定:以 `|` 开头且至少 2 个 `|`
    const isTableRow = trimmed.startsWith('|') && (trimmed.match(/\|/g)?.length ?? 0) >= 2;

    // 末尾空行特殊处理:如果末尾是 \n，末尾空行继承上一行的 inFenced 状态
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

export function splitSectionsAware(content: string): AwareSection[] {
  const sections: AwareSection[] = [];
  let current: AwareSection | null = null;
  const buffer: string[] = [];

  const normalized = content.replace(/\r\n/g, '\n');
  const stripped = normalized.charCodeAt(0) === 0xfeff ? normalized.slice(1) : normalized;
  const lines = stripped.split('\n');

  let inFenced = false;
  let fenceToken: '```' | '~~~' | null = null;
  // 末尾是否有 \n
  const endsWithNewline = stripped.length > 0 && stripped[stripped.length - 1] === '\n';
  // 保存上一行的 inFenced 状态
  let prevLineInFenced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    // 检查当前行是否开启或关闭 fence（同 walkLines 逻辑）
    const startsTripleBacktick = trimmed.startsWith('```');
    const startsTildeTilde = trimmed.startsWith('~~~');

    // 决定当前行的 inFenced 状态
    let lineInFenced = inFenced;
    if (!inFenced && startsTripleBacktick) {
      lineInFenced = true;
      inFenced = true;
      fenceToken = '```';
    } else if (!inFenced && startsTildeTilde) {
      lineInFenced = true;
      inFenced = true;
      fenceToken = '~~~';
    } else if (inFenced && fenceToken === '```' && startsTripleBacktick) {
      lineInFenced = true;
      inFenced = false;
      fenceToken = null;
    } else if (inFenced && fenceToken === '~~~' && startsTildeTilde) {
      lineInFenced = true;
      inFenced = false;
      fenceToken = null;
    }

    // 末尾空行特殊处理
    const finalLineInFenced =
      i === lines.length - 1 && line === '' && endsWithNewline ? prevLineInFenced : lineInFenced;

    // 只在 !finalLineInFenced 行识别 heading(防代码块内 ## Fake 误切)
    const headingMatch = !finalLineInFenced ? line.match(/^(#{1,6})\s+(.+)$/) : null;
    if (headingMatch) {
      if (current !== null) {
        current.body = buffer.join('\n');
        current.endLine = i;
        sections.push(current);
        buffer.length = 0;
      }
      current = {
        level: headingMatch[1]!.length,
        heading: headingMatch[2]!.trim(),
        body: '',
        startLine: i + 1,
        endLine: -1,
      };
    } else if (current !== null) {
      buffer.push(line);
    }

    prevLineInFenced = lineInFenced;
  }

  if (current !== null) {
    current.body = buffer.join('\n');
    sections.push(current);
  }

  return sections;
}
