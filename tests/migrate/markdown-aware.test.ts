import { describe, it, expect } from 'vitest';
import { walkLines, splitSectionsAware } from '../../src/core/migrate/markdown-aware.js';

describe('walkLines — fenced code state', () => {
  it('在 ``` fenced 内不调用 transform', () => {
    const input = '```md\n#### Scenario: x\n```\n#### Scenario: y\n';
    const calls: string[] = [];
    walkLines(input, (line, ctx) => {
      if (!ctx.inFenced && !ctx.isTableRow) calls.push(line);
    });
    expect(calls).toContain('#### Scenario: y');
    expect(calls).not.toContain('#### Scenario: x');
  });

  it('``` 必须同种 token 收尾(~~~ 不能闭 ```)', () => {
    const input = '```\n#### Scenario: x\n~~~\n#### Scenario: y\n```\n';
    const visited: string[] = [];
    walkLines(input, (line, ctx) => {
      if (!ctx.inFenced) visited.push(line);
    });
    // ``` 直到 line 5 的 ``` 才闭合;line 2-4 全 fenced
    expect(visited).toEqual([]);
  });

  it('table-row 跳过(`|...|` 行)', () => {
    const input = '## Hello\n| col1 | col2 |\n| ---- | ---- |\n| - **WHEN** x | y |\n';
    const skipped: string[] = [];
    walkLines(input, (line, ctx) => {
      if (ctx.isTableRow) skipped.push(line);
    });
    expect(skipped).toHaveLength(3);
  });

  it('不识 indented code(4 空格 / Tab)— known limitation', () => {
    const input = '## Hello\n\n    #### Scenario: x\n\n## After\n';
    const visited: string[] = [];
    walkLines(input, (line, ctx) => {
      if (!ctx.inFenced) visited.push(line);
    });
    expect(visited).toContain('    #### Scenario: x');
  });

  it('CRLF normalize 为 LF', () => {
    const input = '## Hello\r\n## World\r\n';
    const visited: string[] = [];
    walkLines(input, (line) => {
      visited.push(line);
    });
    expect(visited).toEqual(['## Hello', '## World', '']);
  });
});

describe('splitSectionsAware — fence-aware section 切分', () => {
  it('代码块内 ## 不切 section(C2 修订)', () => {
    const input = '# Title\n```md\n## Fake\n```\n## Real\n';
    const sections = splitSectionsAware(input);
    expect(sections.map((s) => s.heading)).toEqual(['Title', 'Real']);
  });
});
