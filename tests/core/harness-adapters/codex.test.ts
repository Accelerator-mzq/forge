import { describe, it, expect } from 'vitest';
import { CodexAdapter } from '../../../src/core/harness-adapters/index.js';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('CodexAdapter', () => {
  it('id is "codex"', () => {
    expect(new CodexAdapter().id).toBe('codex');
  });

  it('detect=true when .agents/ exists (NOT .codex/)', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-codex-'));
    try {
      mkdirSync(join(d, '.agents'));
      const r = await new CodexAdapter().detect(d);
      expect(r.detected).toBe(true);
      expect(r.detectedAt).toBe('.agents');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('plan() generates .agents/skills/forge-<name>/SKILL.md (NOT .codex/skills/)', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-codex-'));
    try {
      const adapter = new CodexAdapter();
      const plan = await adapter.plan({
        projectRoot: d,
        skills: [{ name: 'using-forge', content: 'bootstrap' }],
        commands: [],
      });
      const paths = plan.files.map((f) => f.relPath);
      expect(paths).toContain('.agents/skills/forge-using-forge/SKILL.md');
      // 关键回归:不能是 .codex/...
      expect(paths.every((p) => !p.startsWith('.codex/'))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
