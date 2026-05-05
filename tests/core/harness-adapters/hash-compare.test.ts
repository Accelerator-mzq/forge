// hash-compare 4 类 case 单测
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { filterByHash } from '../../../src/core/harness-adapters/hash-compare.js';
import type { DeployPlan } from '../../../src/core/harness-adapters/interface.js';

describe('filterByHash', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hash-compare-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const plan: DeployPlan = {
    files: [
      { relPath: '.claude/skills/forge-using-forge/SKILL.md', content: 'NEW CONTENT' },
    ],
  };

  it('case 1: 目标不存在 → toWrite', async () => {
    const r = await filterByHash(root, [plan], false);
    expect(r.toWrite).toHaveLength(1);
    expect(r.unchanged).toHaveLength(0);
    expect(r.skippedModified).toHaveLength(0);
    expect(r.filteredPlans[0]?.files).toHaveLength(1);
  });

  it('case 2: 目标存在且 hash 与 shipped 相同 → unchanged(no-op)', async () => {
    const target = join(root, '.claude/skills/forge-using-forge/SKILL.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'NEW CONTENT', 'utf8');

    const r = await filterByHash(root, [plan], false);
    expect(r.unchanged).toHaveLength(1);
    expect(r.toWrite).toHaveLength(0);
    expect(r.skippedModified).toHaveLength(0);
    expect(r.filteredPlans[0]?.files).toHaveLength(0);
  });

  it('case 3: hash 不同 + force=false → skippedModified', async () => {
    const target = join(root, '.claude/skills/forge-using-forge/SKILL.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'USER MODIFIED', 'utf8');

    const r = await filterByHash(root, [plan], false);
    expect(r.skippedModified).toHaveLength(1);
    expect(r.toWrite).toHaveLength(0);
    expect(r.unchanged).toHaveLength(0);
    expect(r.filteredPlans[0]?.files).toHaveLength(0);
  });

  it('case 4: hash 不同 + force=true → toWrite', async () => {
    const target = join(root, '.claude/skills/forge-using-forge/SKILL.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'USER MODIFIED', 'utf8');

    const r = await filterByHash(root, [plan], true);
    expect(r.toWrite).toHaveLength(1);
    expect(r.skippedModified).toHaveLength(0);
    expect(r.unchanged).toHaveLength(0);
  });
});
