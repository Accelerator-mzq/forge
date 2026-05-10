import { describe, it, expect } from 'vitest';
import { SuperpowersSource } from '../../../src/core/migrate/sources/superpowers.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClassificationPlan } from '../../../src/core/migrate/types.js';

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

describe('SuperpowersSource.classify', () => {
  it('paired slug + 全勾 [x] + git close commit → archive', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-cls-'));
    const root = join(tmp, 'docs/superpowers');
    await mkdir(join(root, 'specs'), { recursive: true });
    await mkdir(join(root, 'plans'), { recursive: true });
    await writeFile(join(root, 'specs/2026-01-01-add-auth-design.md'), '# Auth\n');
    await writeFile(
      join(root, 'plans/2026-01-01-add-auth-plan.md'),
      '- [x] task-1: a\n- [x] task-2: b\n- [x] task-3: c\n',
    );

    const src = new SuperpowersSource();
    const scan = await src.scan(root);
    // ctx.inGitRepo=false 让信号 2 失效；依赖信号 1（checkbox 3/3 → archive）
    const plan = await src.classify(scan, { cwd: tmp, inGitRepo: false });
    const change = plan.changes.find((c) => c.slug === 'add-auth');
    expect(change?.classification).toBe('archive');
    expect(change?.classificationReason).toContain('checkbox 3/3');
    await rm(tmp, { recursive: true, force: true });
  });

  it('unsafe-slug ≥ 50% → skipped 含 __GLOBAL__ 标记', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-half-unsafe-'));
    const root = join(tmp, 'docs/superpowers');
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs/2026-01-01-..-design.md'), 'X');
    await writeFile(join(root, 'specs/2026-02-01-good-design.md'), 'Y');

    const src = new SuperpowersSource();
    const scan = await src.scan(root);
    const plan = await src.classify(scan, { cwd: tmp, inGitRepo: false });
    expect(plan.skipped.find((s) => s.source === '__GLOBAL__')).toBeDefined();
    expect(plan.skipped.find((s) => s.source === '__GLOBAL__')?.reason).toContain(
      'unsafe-slug-ratio-too-high',
    );
    await rm(tmp, { recursive: true, force: true });
  });
});

describe('SuperpowersSource.prepareCopy', () => {
  it('active change → forge/changes/<slug>/{design,tasks}.md', () => {
    const plan: ClassificationPlan = {
      changes: [
        {
          slug: 'add-auth',
          classification: 'active',
          artifacts: {
            design: {
              absPath: '/x/docs/superpowers/specs/2026-01-01-add-auth-design.md',
              relPath: 'specs/2026-01-01-add-auth-design.md',
              kind: 'design',
              size: 0,
              mtime: '',
              encoding: 'utf8',
            },
            tasks: {
              absPath: '/x/docs/superpowers/plans/2026-01-01-add-auth-plan.md',
              relPath: 'plans/2026-01-01-add-auth-plan.md',
              kind: 'tasks',
              size: 0,
              mtime: '',
              encoding: 'utf8',
            },
          },
        },
      ],
      specs: [],
      drafts: [],
      configFiles: [],
      skipped: [],
    };
    const src = new SuperpowersSource();
    const ops = src.prepareCopy(plan, '/y/forge');
    const targets = ops.map((o) => o.target);
    expect(targets).toContain(join('/y/forge/changes/add-auth/design.md'));
    expect(targets).toContain(join('/y/forge/changes/add-auth/tasks.md'));
  });

  it('archive change → forge/changes/archive/<slug>/...', () => {
    const plan: ClassificationPlan = {
      changes: [
        {
          slug: 'old-feature',
          classification: 'archive',
          artifacts: {
            design: {
              absPath: '/x/d.md',
              relPath: 'specs/2026-01-01-old-feature-design.md',
              kind: 'design',
              size: 0,
              mtime: '',
              encoding: 'utf8',
            },
            tasks: {
              absPath: '/x/p.md',
              relPath: 'plans/2026-01-01-old-feature-plan.md',
              kind: 'tasks',
              size: 0,
              mtime: '',
              encoding: 'utf8',
            },
          },
        },
      ],
      specs: [],
      drafts: [],
      configFiles: [],
      skipped: [],
    };
    const src = new SuperpowersSource();
    const ops = src.prepareCopy(plan, '/y/forge');
    const targets = ops.map((o) => o.target);
    expect(targets).toContain(join('/y/forge/changes/archive/old-feature/design.md'));
    expect(targets).toContain(join('/y/forge/changes/archive/old-feature/tasks.md'));
  });
});
