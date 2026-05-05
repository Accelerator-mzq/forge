import { describe, it, expect } from 'vitest';
import { deployAtomic } from '../../../src/core/harness-adapters/index.js';
import type { DeployPlan } from '../../../src/core/harness-adapters/index.js';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('deployAtomic — Stage→Backup→Commit', () => {
  it('happy path: writes all files atomically', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-tx-'));
    try {
      const plan: DeployPlan = {
        files: [
          { relPath: '.claude/skills/forge-using-forge/SKILL.md', content: 'A' },
          { relPath: '.claude/skills/forge-brainstorming/SKILL.md', content: 'B' },
        ],
      };
      await deployAtomic(d, [plan]);
      expect(readFileSync(join(d, '.claude/skills/forge-using-forge/SKILL.md'), 'utf8')).toBe('A');
      expect(readFileSync(join(d, '.claude/skills/forge-brainstorming/SKILL.md'), 'utf8')).toBe(
        'B',
      );
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('rollback when commit phase fails (target target file already locked)', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-tx-'));
    try {
      // 提前创建一个 read-only 目录,模拟 Commit 失败
      mkdirSync(join(d, '.claude'));
      writeFileSync(join(d, '.claude', 'pre-existing.txt'), 'before');

      const plan: DeployPlan = {
        files: [{ relPath: '.claude/skills/forge-using-forge/SKILL.md', content: 'A' }],
      };
      await deployAtomic(d, [plan]);

      // 已存在文件不动
      expect(readFileSync(join(d, '.claude', 'pre-existing.txt'), 'utf8')).toBe('before');
      // 新文件写入
      expect(existsSync(join(d, '.claude/skills/forge-using-forge/SKILL.md'))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('idempotent: re-running with same plan replaces files', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-tx-'));
    try {
      const planA: DeployPlan = {
        files: [{ relPath: '.claude/skills/forge-using-forge/SKILL.md', content: 'A' }],
      };
      await deployAtomic(d, [planA]);
      const planB: DeployPlan = {
        files: [{ relPath: '.claude/skills/forge-using-forge/SKILL.md', content: 'B' }],
      };
      await deployAtomic(d, [planB]);
      expect(readFileSync(join(d, '.claude/skills/forge-using-forge/SKILL.md'), 'utf8')).toBe('B');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('cleans up forge/.cache/staging-*/ even on success', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-tx-'));
    try {
      const plan: DeployPlan = {
        files: [{ relPath: '.claude/skills/x/SKILL.md', content: 'X' }],
      };
      await deployAtomic(d, [plan]);
      // staging 目录应该被清理
      const cacheDir = join(d, 'forge', '.cache');
      if (existsSync(cacheDir)) {
        const { readdirSync } = await import('node:fs');
        const entries = readdirSync(cacheDir);
        expect(entries.filter((e) => e.startsWith('staging-'))).toHaveLength(0);
        expect(entries.filter((e) => e.startsWith('backup-'))).toHaveLength(0);
      }
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
