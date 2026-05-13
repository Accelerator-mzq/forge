// 15 个 skill markdown 文件的通用结构断言(plan-9i +13 / plan-9d +14 / plan-9f +15)
// 每个 task B# 给本文件追加自己的 it('skill X ...') case
import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { loadSkill, SKILL_NAMES } from '../../../src/core/templates/skills/index.js';

describe('templates/skills', () => {
  // 通用断言:所有 15 skill frontmatter 必须含 forge:<name> 形式的 name 字段
  it.each(SKILL_NAMES)('%s 有合法 frontmatter 且 name 为 forge:<name>', async (name) => {
    const content = await loadSkill(name);
    const parsed = matter(content);
    expect(parsed.data.name).toBe(`forge:${name}`);
    expect(parsed.data.description).toBeTruthy();
    expect(typeof parsed.data.description).toBe('string');
    expect((parsed.data.description as string).length).toBeGreaterThan(50);
    // 正文非空
    expect(parsed.content.trim().length).toBeGreaterThan(100);
  });

  // 通用断言:所有 skill 不含未替换的 superpowers 命名空间引用
  // (superpowers 项目名作为致谢出现是允许的,只查 superpowers:<word> 形式)
  it.each(SKILL_NAMES)('%s 不含残留 superpowers:<x> 命名空间引用', async (name) => {
    const content = await loadSkill(name);
    expect(content).not.toMatch(/superpowers:[a-z][a-z0-9-]*/);
  });

  // 通用断言:不含未替换的 docs/superpowers/specs 或 docs/superpowers/plans 路径
  it.each(SKILL_NAMES)('%s 不含残留 docs/superpowers/(specs|plans) 路径', async (name) => {
    const content = await loadSkill(name);
    expect(content).not.toMatch(/docs\/superpowers\/(specs|plans)/);
  });

  // using-forge 专属:必须含 6 个 forge slash 命令清单
  it('using-forge 含 6 个 /forge:* 命令清单', async () => {
    const content = await loadSkill('using-forge');
    expect(content).toContain('/forge:brainstorm');
    expect(content).toContain('/forge:propose');
    expect(content).toContain('/forge:apply');
    expect(content).toContain('/forge:review');
    expect(content).toContain('/forge:verify');
    expect(content).toContain('/forge:archive');
  });
});

// plan-9i Task 0 + plan-9d Task 0 + plan-9f Task 0 — 验证 SKILL_NAMES registry 扩展
// (9i:writing-skills 第 13 项 + 9d:verifying-three-dimensions 第 14 项 + 9f:exploring 第 15 项)
// 注:SKILL_NAMES 已由上方 import 引入,无需重复 import
describe('SKILL_NAMES registry (9i + 9d + 9f)', () => {
  it('writing-skills 是 SKILL_NAMES 第 13 项', () => {
    expect(SKILL_NAMES).toContain('writing-skills');
    expect(SKILL_NAMES.indexOf('writing-skills')).toBe(12); // 0-indexed
  });

  it('verifying-three-dimensions 是 SKILL_NAMES 第 14 项', () => {
    expect(SKILL_NAMES).toContain('verifying-three-dimensions');
    expect(SKILL_NAMES.indexOf('verifying-three-dimensions')).toBe(13); // 0-indexed
  });

  it('exploring 是 SKILL_NAMES 第 15 项', () => {
    expect(SKILL_NAMES).toContain('exploring');
    expect(SKILL_NAMES.indexOf('exploring')).toBe(14); // 0-indexed
  });

  it('SKILL_NAMES 总数 15', () => {
    expect(SKILL_NAMES.length).toBe(15);
  });
});
