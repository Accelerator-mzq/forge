import { describe, it, expect } from 'vitest';
import { detect, detectAll } from '../../../src/core/harness-adapters/index.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('detector — detect harness presence', () => {
  it('detects claude when .claude/ exists', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-detect-claude-'));
    try {
      mkdirSync(join(d, '.claude'));
      const r = await detect(d, 'claude');
      expect(r.id).toBe('claude');
      expect(r.detected).toBe(true);
      expect(r.detectedAt).toBe('.claude');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('detects codex when .agents/ exists', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-detect-codex-'));
    try {
      mkdirSync(join(d, '.agents'));
      const r = await detect(d, 'codex');
      expect(r.id).toBe('codex');
      expect(r.detected).toBe(true);
      expect(r.detectedAt).toBe('.agents');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('detects opencode when .opencode/ exists', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-detect-opencode-'));
    try {
      mkdirSync(join(d, '.opencode'));
      const r = await detect(d, 'opencode');
      expect(r.id).toBe('opencode');
      expect(r.detected).toBe(true);
      expect(r.detectedAt).toBe('.opencode');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('detects opencode when AGENTS.md exists (fallback)', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-detect-opencode-fallback-'));
    try {
      writeFileSync(join(d, 'AGENTS.md'), '# Agents');
      const r = await detect(d, 'opencode');
      expect(r.id).toBe('opencode');
      expect(r.detected).toBe(true);
      expect(r.detectedAt).toBe('AGENTS.md');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('returns detected=false when harness not found', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-detect-missing-'));
    try {
      const r = await detect(d, 'claude');
      expect(r.id).toBe('claude');
      expect(r.detected).toBe(false);
      expect(r.detectedAt).toBeUndefined();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('returns 3 entries (claude/codex/opencode) regardless of detection', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-detect-all-'));
    try {
      const r = await detectAll(d);
      expect(r).toHaveLength(3);
      expect(r.map((x) => x.id).sort()).toEqual(['claude', 'codex', 'opencode']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
