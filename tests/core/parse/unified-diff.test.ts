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

  it('\\ No newline at end of file 元数据行不占新文件行号', () => {
    const diff = `diff --git a/f.txt b/f.txt
--- a/f.txt
+++ b/f.txt
@@ -1 +1,2 @@
-old
\\ No newline at end of file
+new
+added second
`;
    const hunks = parseUnifiedDiff(diff);
    // newStart=1;-old 删除不占;\ No newline 元数据不占;+new=1、+added second=2
    expect(addedLineNumbers(hunks)).toEqual([1, 2]);
  });

  it('同一文件连续多 hunk → 第二 hunk newCursor 从 newStart 重置', () => {
    const diff = `diff --git a/f.md b/f.md
--- a/f.md
+++ b/f.md
@@ -1,2 +1,3 @@
 line 1
+inserted at 2
 line 2
@@ -20,2 +21,3 @@
 line 20
+inserted at 22
 line 21
`;
    const hunks = parseUnifiedDiff(diff);
    expect(hunks).toHaveLength(2);
    // hunk1 newStart=1:line1(1)→2,+inserted(2)→3,line2(3);hunk2 newStart=21:line20(21)→22,+inserted(22)→23
    expect(addedLineNumbers(hunks)).toEqual([2, 22]);
  });
});
