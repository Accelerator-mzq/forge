// 16 个 skill markdown 文件的通用结构断言(plan-9i +13 / plan-9d +14 / plan-9f +15 / plan-port-discipline +16)
// 每个 task B# 给本文件追加自己的 it('skill X ...') case
import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { loadSkill, SKILL_NAMES } from '../../../src/core/templates/skills/index.js';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

describe('templates/skills', () => {
  // 通用断言:所有 16 skill frontmatter 必须含 forge:<name> 形式的 name 字段
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

  // 净化回归锁:移植版 discipline 不得含任何项目锚点(plan-port-discipline Task 3-8 净化结果锁定)
  it('subagent-driven-discipline 不含项目锚点', async () => {
    const content = await loadSkill('subagent-driven-discipline');
    const anchors: RegExp[] = [
      /forgeue/i, // ForgeUE 项目名
      /forge-eval\/runner/, // 架空旧路径
      /IMPL_FILES_JSON/, // 真实变量名
      /\bplan-9[a-z]/, // plan-9x 内部计划名
      /\bplan-v1\.1\b/, // plan-v1.1 内部计划名
      /codex-companion/, // 项目专有 helper
      /PR #\d+/, // 项目 PR 编号
    ];
    for (const re of anchors) {
      expect(content).not.toMatch(re);
    }
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

// plan-9i Task 0 + plan-9d Task 0 + plan-9f Task 0 + plan-port-discipline Task 10 — 验证 SKILL_NAMES registry 扩展
// (9i:writing-skills 第 13 项 + 9d:verifying-three-dimensions 第 14 项 + 9f:exploring 第 15 项 + port-discipline:subagent-driven-discipline 第 16 项)
// 注:SKILL_NAMES 已由上方 import 引入,无需重复 import
describe('SKILL_NAMES registry (9i + 9d + 9f + port-discipline)', () => {
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

  it('subagent-driven-discipline 是 SKILL_NAMES 第 16 项', () => {
    expect(SKILL_NAMES).toContain('subagent-driven-discipline');
    expect(SKILL_NAMES.indexOf('subagent-driven-discipline')).toBe(15); // 0-indexed
  });

  it('SKILL_NAMES 总数 16', () => {
    expect(SKILL_NAMES.length).toBe(16);
  });
});

describe('skill references/ 同步(copy-templates syncSkillReferences)', () => {
  it('subagent-driven-discipline references/ 已镜像到 src/core/templates/', () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
    const refDir = join(
      repoRoot,
      'src/core/templates/skills/subagent-driven-discipline/references',
    );
    expect(existsSync(join(refDir, 'codex-tools.md'))).toBe(true);
    expect(existsSync(join(refDir, 'opencode-tools.md'))).toBe(true);
  });
});

describe('Model Tier 映射 —— discipline 两副本 parity', () => {
  const repoRoot = join(__dirname, '../../../skills/subagent-driven-discipline/SKILL.md');
  const dogfood = join(__dirname, '../../../.claude/skills/subagent-driven-discipline/SKILL.md');

  // 抽取 `## Model Tier 映射` 段:从该二级标题行(含)起,到下一个二级标题(`## `)或文件末尾止
  function extractGovernanceSection(filePath: string): string {
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    const start = lines.findIndex((l) => l.startsWith('## Model Tier 映射'));
    if (start === -1) return ''; // 抽不到 → 空串,断言必失败(预期的 drift 告警)
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i]?.startsWith('## ')) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join('\n').trimEnd();
  }

  // 抽取 Platform Note 里以 "§1 28-subtype taxonomy" 开头的那一行(修正前后都以此开头)
  function extractPlatformNoteLine(filePath: string): string {
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    return lines.find((l) => l.startsWith('§1 28-subtype taxonomy')) ?? '';
  }

  it('两副本的 `## Model Tier 映射` 治理段逐字一致', () => {
    const a = extractGovernanceSection(repoRoot);
    const b = extractGovernanceSection(dogfood);
    expect(a.length).toBeGreaterThan(0); // repo-root 必须含治理段
    expect(b).toBe(a); // .claude/ 副本逐字一致
  });

  it('两副本的 Platform Note 修正句逐字一致、且确为修正后的新句', () => {
    const a = extractPlatformNoteLine(repoRoot);
    const b = extractPlatformNoteLine(dogfood);
    expect(a.length).toBeGreaterThan(0); // repo-root 必须含该句
    expect(a).toContain('per-harness/per-config');
    expect(a).not.toContain('Only the dispatch / file / shell tool names differ');
    expect(b).toBe(a); // .claude/ 副本逐字一致
  });
});
