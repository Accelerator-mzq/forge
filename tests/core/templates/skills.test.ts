// 12 个 skill markdown 文件的通用结构断言
// 每个 task B# 给本文件追加自己的 it('skill X ...') case
import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { loadSkill, SKILL_NAMES } from '../../../src/core/templates/skills/index.js';

describe('templates/skills', () => {
  // 通用断言:所有 12 skill frontmatter 必须含 forge:<name> 形式的 name 字段
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

// plan-9i Task 0 — 验证 SKILL_NAMES registry 扩展(writing-skills 第 13 项)
// 注:SKILL_NAMES 已由上方 import 引入,无需重复 import
describe('SKILL_NAMES registry (9i)', () => {
  it('includes writing-skills (sole self-bootstrapped skill, design §2.9.5)', () => {
    // writing-skills 是唯一"自引导"skill:用于编写其他 skills 的 skill 本身
    expect(SKILL_NAMES).toContain('writing-skills');
  });

  it('has 13 entries (v0.1 12 + 9i writing-skills)', () => {
    // plan-9i 将 registry 从 12 扩展到 13
    expect(SKILL_NAMES.length).toBe(13);
  });
});
