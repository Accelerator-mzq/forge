import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff, addedLineNumbers } from '../../../src/core/parse/unified-diff.js';

// 一段真实 git diff(改了 proposal.md:新文件第 8-9 行新增)
const SAMPLE = `diff --git a/proposal.md b/proposal.md
index 1111111..2222222 100644
--- a/proposal.md
+++ b/proposal.md
@@ -6,3 +6,5 @@
 ## What Changes

-- old item
+- new item A
+- new item B
+- new item C
 ## Impact
`;

describe('parseUnifiedDiff', () => {
  it('解析 hunk 头与增删行', () => {
    const hunks = parseUnifiedDiff(SAMPLE);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.newStart).toBe(6);
    expect(hunks[0]!.added.map((l) => l.content)).toEqual([
      '- new item A',
      '- new item B',
      '- new item C',
    ]);
  });

  it('addedLineNumbers 返回新增行在新文件中的行号', () => {
    const hunks = parseUnifiedDiff(SAMPLE);
    // hunk newStart=6;上下文行 "## What Changes"(6)、""(7)、被删行不占新文件行、
    // 新增 A=8 B=9 C=10、上下文 "## Impact"(11)
    expect(addedLineNumbers(hunks)).toEqual([8, 9, 10]);
  });

  it('空 diff(无未提交修改)→ 空 hunk 列表', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });

  it('多文件 diff → 各文件 hunk 都解析', () => {
    const multi =
      SAMPLE +
      `diff --git a/tasks.md b/tasks.md
--- a/tasks.md
+++ b/tasks.md
@@ -1,1 +1,2 @@
 # Tasks
+- [ ] task-2: new
`;
    const hunks = parseUnifiedDiff(multi);
    expect(hunks.length).toBe(2);
  });
});
