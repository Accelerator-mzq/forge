import { describe, it, expect } from 'vitest';
import { SuperpowersSource } from '../../../src/core/migrate/sources/superpowers.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ScanResult,
  ClassificationPlan,
  ScannedFile,
} from '../../../src/core/migrate/types.js';

describe('SuperpowersSource.detect', () => {
  it('found=false 当 docs/superpowers/ 缺', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-detect-'));
    const src = new SuperpowersSource();
    const r = await src.detect(tmp);
    expect(r.found).toBe(false);
    await rm(tmp, { recursive: true, force: true });
  });

  it('found=true 当 docs/superpowers/{specs,plans}/ 存在', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-detect-'));
    await mkdir(join(tmp, 'docs/superpowers/specs'), { recursive: true });
    await mkdir(join(tmp, 'docs/superpowers/plans'), { recursive: true });
    const src = new SuperpowersSource();
    const r = await src.detect(tmp);
    expect(r.found).toBe(true);
    expect(r.rootPath).toBe(join(tmp, 'docs/superpowers'));
    await rm(tmp, { recursive: true, force: true });
  });
});

describe('SuperpowersSource.scan — 配对算法', () => {
  it('design+plan 配对 + plan-only + design-only + unrecognized 分流', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-scan-'));
    const root = join(tmp, 'docs/superpowers');
    await mkdir(join(root, 'specs'), { recursive: true });
    await mkdir(join(root, 'plans'), { recursive: true });
    await writeFile(join(root, 'specs/2026-01-01-add-auth-design.md'), '# Auth\n');
    await writeFile(join(root, 'plans/2026-01-01-add-auth-plan.md'), '- [x] **Step 1**: x\n');
    await writeFile(join(root, 'plans/2026-03-01-orphan-plan.md'), '- [ ] **Step 1**: y\n');
    await writeFile(join(root, 'specs/2026-04-01-feature-design-v2.md'), '# v2\n');

    const src = new SuperpowersSource();
    const r = await src.scan(root);
    expect(r.pairings?.paired).toContainEqual(expect.objectContaining({ slug: 'add-auth' }));
    expect(r.pairings?.paired).toContainEqual(expect.objectContaining({ slug: 'orphan' }));
    // unrecognized 含 v2 后缀(不是标准 -design.md 结尾加 slug 无效)
    expect(r.pairings?.unrecognized.some((u) => u.includes('feature-design-v2.md'))).toBe(true);
    await rm(tmp, { recursive: true, force: true });
  });

  it('unsafe-slug `..` → 进 unsafeSlug 列表', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-unsafe-'));
    const root = join(tmp, 'docs/superpowers');
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs/2026-01-01-..-design.md'), '# X\n');

    const src = new SuperpowersSource();
    const r = await src.scan(root);
    expect(r.pairings?.unsafeSlug.some((u) => u.includes('..'))).toBe(true);
    await rm(tmp, { recursive: true, force: true });
  });

  it('relPath 永远 posix slash(无反斜杠 — Windows P2 lesson)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-relpath-'));
    const root = join(tmp, 'docs/superpowers');
    await mkdir(join(root, 'specs'), { recursive: true });
    await mkdir(join(root, 'plans'), { recursive: true });
    await writeFile(join(root, 'specs/2026-01-01-add-auth-design.md'), '# Auth\n');
    await writeFile(join(root, 'plans/2026-01-01-add-auth-plan.md'), '- [x] task\n');

    const src = new SuperpowersSource();
    const r = await src.scan(root);
    for (const f of r.files) {
      expect(f.relPath).not.toContain('\\\\');
    }
    await rm(tmp, { recursive: true, force: true });
  });
});
