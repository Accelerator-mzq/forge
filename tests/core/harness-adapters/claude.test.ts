import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../../src/core/harness-adapters/index.js';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('ClaudeAdapter', () => {
  it('id is "claude"', () => {
    expect(new ClaudeAdapter().id).toBe('claude');
  });

  it('detect=true when .claude/ exists', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-claude-'));
    try {
      mkdirSync(join(d, '.claude'));
      const r = await new ClaudeAdapter().detect(d);
      expect(r.detected).toBe(true);
      expect(r.detectedAt).toBe('.claude');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('plan() generates .claude/skills/forge-<name>/SKILL.md for each skill', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-claude-'));
    try {
      const adapter = new ClaudeAdapter();
      const plan = await adapter.plan({
        projectRoot: d,
        skills: [
          { name: 'using-forge', content: 'bootstrap content' },
          { name: 'brainstorming', content: 'brainstorm content' },
        ],
        commands: [{ name: 'brainstorm', content: 'cmd content' }],
      });
      const paths = plan.files.map((f) => f.relPath);
      expect(paths).toContain('.claude/skills/forge-using-forge/SKILL.md');
      expect(paths).toContain('.claude/skills/forge-brainstorming/SKILL.md');
      expect(paths).toContain('.claude/commands/forge/brainstorm.md');
      expect(plan.files.find((f) => f.relPath.includes('using-forge'))?.content).toBe(
        'bootstrap content',
      );
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
