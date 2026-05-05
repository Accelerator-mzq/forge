// 6 个 slash 命令模板的通用结构断言
import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { loadCommand, COMMAND_NAMES } from '../../../src/core/templates/commands/index.js';

describe('templates/commands', () => {
  it.each(COMMAND_NAMES)('%s 有合法 frontmatter 含 description', async (name) => {
    const content = await loadCommand(name);
    const parsed = matter(content);
    expect(parsed.data.description).toBeTruthy();
    expect(typeof parsed.data.description).toBe('string');
    expect(parsed.content.trim().length).toBeGreaterThan(50);
  });

  it.each(COMMAND_NAMES)('%s 不含残留 superpowers:<x> 引用', async (name) => {
    const content = await loadCommand(name);
    expect(content).not.toMatch(/superpowers:[a-z][a-z0-9-]*/);
  });

  it('brainstorm 命令引用 forge:brainstorming skill 且写到 forge/drafts/', async () => {
    const content = await loadCommand('brainstorm');
    expect(content).toContain('forge:brainstorming');
    expect(content).toContain('forge/drafts/');
  });

  it('propose 命令引用 forge:writing-plans skill 且写到 forge/changes/', async () => {
    const content = await loadCommand('propose');
    expect(content).toContain('forge:writing-plans');
    expect(content).toContain('forge/changes/');
    expect(content).toContain('proposal.md');
    expect(content).toContain('tasks.md');
  });

  it('apply 命令引用 forge:subagent-driven-development + forge:test-driven-development', async () => {
    const content = await loadCommand('apply');
    expect(content).toContain('forge:subagent-driven-development');
    expect(content).toContain('forge:test-driven-development');
    expect(content).toContain('--parallel');
    expect(content).toContain('forge:dispatching-parallel-agents');
    expect(content).toContain('forge:using-git-worktrees');
    expect(content).toContain('applied_commits');
  });

  it('review 命令引用 forge:requesting-code-review + forge:receiving-code-review', async () => {
    const content = await loadCommand('review');
    expect(content).toContain('forge:requesting-code-review');
    expect(content).toContain('forge:receiving-code-review');
    expect(content).toContain('.review-passed');
    expect(content).toContain('forge-review/v1');
    expect(content).toContain('review_outcomes');
  });
});
