// option=1 diff 段级校验用的 unified-diff 解析器(plan pause-fence Block B)
// 解析 `git diff` 文本输出为 hunk 列表;只关心增删行 + 新文件行号,不做 IO。

/** unified-diff 一个 hunk 内的一行变更 */
export interface DiffLine {
  /** '+' 新增 / '-' 删除 */
  kind: '+' | '-';
  /** 行内容(去掉前缀 +/-) */
  content: string;
  /** 该行在「新文件」中的行号(仅 kind='+' 有意义;kind='-' 为 null) */
  newLineNumber: number | null;
}

/** 一个 unified-diff hunk */
export interface DiffHunk {
  /** hunk 头 `@@ -a,b +c,d @@` 中的 c(新文件起始行号,1-indexed) */
  newStart: number;
  /** 本 hunk 内所有新增行(kind='+') */
  added: DiffLine[];
  /** 本 hunk 内所有删除行(kind='-') */
  removed: DiffLine[];
}

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * 解析 `git diff` 文本输出为 hunk 列表。
 * @param diffText `git diff HEAD -- <file>` 的 stdout(可为空 → 返回 [])
 */
export function parseUnifiedDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  if (!diffText.trim()) return hunks;

  const lines = diffText.split('\n');
  let current: DiffHunk | null = null;
  // 新文件行游标:遇 hunk 头重置为 newStart;上下文行/新增行 +1,删除行不动。
  let newCursor = 0;

  for (const line of lines) {
    const hunkMatch = line.match(HUNK_HEADER_RE);
    if (hunkMatch) {
      current = { newStart: parseInt(hunkMatch[1]!, 10), added: [], removed: [] };
      hunks.push(current);
      newCursor = current.newStart;
      continue;
    }
    if (!current) continue; // hunk 头之前的文件头(diff --git / --- / +++)忽略

    // git diff 文件头行(下一文件)会以 'diff --git' 开头 → 关闭当前 hunk 上下文
    if (line.startsWith('diff --git')) {
      current = null;
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue; // 文件头,非内容
    if (line.startsWith('\\')) continue; // '\ No newline at end of file' git 元数据行,不占新文件行号

    if (line.startsWith('+')) {
      current.added.push({ kind: '+', content: line.slice(1), newLineNumber: newCursor });
      newCursor += 1;
    } else if (line.startsWith('-')) {
      current.removed.push({ kind: '-', content: line.slice(1), newLineNumber: null });
      // 删除行不占新文件行号,newCursor 不动
    } else {
      // 上下文行(以空格开头,或空行)→ 占新文件一行
      newCursor += 1;
    }
  }
  return hunks;
}

/** 收集所有 hunk 的新增行在「新文件」中的行号(升序去重) */
export function addedLineNumbers(hunks: DiffHunk[]): number[] {
  const nums = new Set<number>();
  for (const h of hunks) {
    for (const l of h.added) {
      if (l.newLineNumber !== null) nums.add(l.newLineNumber);
    }
  }
  return [...nums].sort((a, b) => a - b);
}
