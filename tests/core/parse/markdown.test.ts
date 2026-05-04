import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../../src/core/parse/markdown.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// fixture 目录路径
const fixturesDir = resolve(__dirname, '../../fixtures/markdown');

// 读取 fixture 文件内容
function loadFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), 'utf8');
}

describe('parseMarkdown', () => {
  // 测试：有 frontmatter 时正确提取
  it('extracts frontmatter when present', () => {
    const content = loadFixture('with-frontmatter.md');
    const result = parseMarkdown(content);
    expect(result.frontmatter.title).toBe('Sample');
    expect(result.frontmatter.tags).toEqual(['a', 'b']);
  });

  // 测试：无 frontmatter 时返回空对象
  it('returns empty frontmatter when absent', () => {
    const content = loadFixture('without-frontmatter.md');
    const result = parseMarkdown(content);
    expect(result.frontmatter).toEqual({});
  });

  // 测试：按 heading 级别切分 sections
  it('parses sections by heading level', () => {
    const content = loadFixture('with-frontmatter.md');
    const result = parseMarkdown(content);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.level).toBe(1);
    expect(result.sections[0]?.heading).toBe('Heading 1');
    expect(result.sections[1]?.level).toBe(2);
    expect(result.sections[1]?.heading).toBe('Heading 2');
  });

  // 测试：保留 section 正文内容
  it('preserves section body content', () => {
    const content = loadFixture('with-frontmatter.md');
    const result = parseMarkdown(content);
    expect(result.sections[0]?.body.trim()).toBe('Body of heading 1.');
    expect(result.sections[1]?.body.trim()).toBe('Body of heading 2.');
  });
});
