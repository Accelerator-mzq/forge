import { describe, it, expect } from 'vitest';
import type { ScanResult, ClassificationPlan } from '../../../src/core/migrate/types.js';
import { OpenSpecSource } from '../../../src/core/migrate/sources/openspec.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('OpenSpecSource.detect', () => {
  it('found=false when openspec/ missing', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-detect-'));
    const src = new OpenSpecSource();
    const r = await src.detect(tmp);
    expect(r.found).toBe(false);
    expect(r.message).toContain('openspec/');
    await rm(tmp, { recursive: true, force: true });
  });

  it('found=true with rootPath when openspec/ exists', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-detect-'));
    await mkdir(join(tmp, 'openspec', 'specs'), { recursive: true });
    const src = new OpenSpecSource();
    const r = await src.detect(tmp);
    expect(r.found).toBe(true);
    expect(r.rootPath).toBe(join(tmp, 'openspec'));
    await rm(tmp, { recursive: true, force: true });
  });
});

describe('OpenSpecSource.scan', () => {
  it('枚举 specs / changes(active+archive) / explorations / config.yaml', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-scan-'));
    await mkdir(join(tmp, 'openspec', 'specs', 'foo'), { recursive: true });
    await writeFile(join(tmp, 'openspec', 'specs', 'foo', 'spec.md'), '# Foo\n');
    await mkdir(join(tmp, 'openspec', 'changes', 'add-bar'), { recursive: true });
    await writeFile(join(tmp, 'openspec', 'changes', 'add-bar', 'proposal.md'), '# Bar\n');
    await mkdir(join(tmp, 'openspec', 'changes', 'archive', 'old'), { recursive: true });
    await writeFile(join(tmp, 'openspec', 'changes', 'archive', 'old', 'proposal.md'), '# Old\n');
    await mkdir(join(tmp, 'openspec', 'explorations'), { recursive: true });
    await writeFile(join(tmp, 'openspec', 'explorations', 'idea.md'), '# Idea\n');
    await writeFile(join(tmp, 'openspec', 'config.yaml'), 'schema: spec-driven\n');

    const src = new OpenSpecSource();
    const r = await src.scan(join(tmp, 'openspec'));
    expect(r.isEmpty).toBe(false);
    expect(r.files.length).toBeGreaterThanOrEqual(5);
    const kinds = r.files.map((f) => f.kind);
    expect(kinds).toContain('spec');
    expect(kinds).toContain('proposal');
    expect(kinds).toContain('draft');
    expect(kinds).toContain('config');
    await rm(tmp, { recursive: true, force: true });
  });

  it('isEmpty=true when openspec/ has no recognizable files', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-scan-empty-'));
    await mkdir(join(tmp, 'openspec'), { recursive: true });
    const src = new OpenSpecSource();
    const r = await src.scan(join(tmp, 'openspec'));
    expect(r.isEmpty).toBe(true);
    await rm(tmp, { recursive: true, force: true });
  });

  it('scan 产出的 relPath 永远是 posix slash(无反斜杠)', async () => {
    // 守护:Windows 上 path.join 会产生反斜杠,relPath 必须永远 posix
    const tmp = await mkdtemp(join(tmpdir(), 'forge-relpath-'));
    await mkdir(join(tmp, 'openspec', 'specs', 'foo'), { recursive: true });
    await writeFile(join(tmp, 'openspec', 'specs', 'foo', 'spec.md'), '# Foo\n');
    await mkdir(join(tmp, 'openspec', 'changes', 'archive', 'old'), { recursive: true });
    await writeFile(join(tmp, 'openspec', 'changes', 'archive', 'old', 'proposal.md'), '# Old\n');

    const src = new OpenSpecSource();
    const r = await src.scan(join(tmp, 'openspec'));
    for (const f of r.files) {
      expect(f.relPath).not.toContain('\\');
    }
    await rm(tmp, { recursive: true, force: true });
  });
});

describe('OpenSpecSource.classify', () => {
  it('changes/<n>/ 归 active;changes/archive/<n>/ 归 archive', async () => {
    const scan: ScanResult = {
      isEmpty: false,
      files: [
        {
          absPath: '/x/openspec/changes/add-bar/proposal.md',
          relPath: 'changes/add-bar/proposal.md',
          kind: 'proposal',
          size: 0,
          mtime: '',
          encoding: 'utf8',
        },
        {
          absPath: '/x/openspec/changes/archive/old/proposal.md',
          relPath: 'changes/archive/old/proposal.md',
          kind: 'proposal',
          size: 0,
          mtime: '',
          encoding: 'utf8',
        },
      ],
    };
    const src = new OpenSpecSource();
    const plan = await src.classify(scan, { cwd: '/x', inGitRepo: false });
    expect(plan.changes).toHaveLength(2);
    expect(plan.changes.find((c) => c.slug === 'add-bar')?.classification).toBe('active');
    expect(plan.changes.find((c) => c.slug === 'old')?.classification).toBe('archive');
  });

  it('slug 命中保留名 → unsafe-slug skip', async () => {
    const scan: ScanResult = {
      isEmpty: false,
      files: [
        {
          absPath: '/x/openspec/changes/.cache/proposal.md',
          relPath: 'changes/.cache/proposal.md',
          kind: 'proposal',
          size: 0,
          mtime: '',
          encoding: 'utf8',
        },
      ],
    };
    const src = new OpenSpecSource();
    const plan = await src.classify(scan, { cwd: '/x', inGitRepo: false });
    expect(plan.skipped.length).toBeGreaterThan(0);
    const hasUnsafeSlug = plan.skipped.some((s) => s.reason.includes('unsafe-slug'));
    expect(hasUnsafeSlug).toBe(true);
  });
});

describe('OpenSpecSource.prepareCopy', () => {
  it('changes / archive / drafts / specs 各自映射目标路径', () => {
    const plan: ClassificationPlan = {
      changes: [
        {
          slug: 'add-bar',
          classification: 'active',
          artifacts: {
            proposal: {
              absPath: '/x/openspec/changes/add-bar/proposal.md',
              relPath: 'changes/add-bar/proposal.md',
              kind: 'proposal',
              size: 0,
              mtime: '',
              encoding: 'utf8',
            },
          },
        },
        {
          slug: 'old',
          classification: 'archive',
          artifacts: {
            proposal: {
              absPath: '/x/openspec/changes/archive/old/proposal.md',
              relPath: 'changes/archive/old/proposal.md',
              kind: 'proposal',
              size: 0,
              mtime: '',
              encoding: 'utf8',
            },
          },
        },
      ],
      specs: [
        {
          relPath: 'foo/spec.md',
          source: {
            absPath: '/x/openspec/specs/foo/spec.md',
            relPath: 'specs/foo/spec.md',
            kind: 'spec',
            size: 0,
            mtime: '',
            encoding: 'utf8',
          },
        },
      ],
      drafts: [],
      configFiles: [],
      skipped: [],
    };
    const src = new OpenSpecSource();
    const ops = src.prepareCopy(plan, '/y/forge');
    const targets = ops.map((o) => o.target);
    expect(targets).toContain(join('/y/forge/changes/add-bar/proposal.md'));
    expect(targets).toContain(join('/y/forge/changes/archive/old/proposal.md'));
    expect(targets).toContain(join('/y/forge/specs/foo/spec.md'));
  });
});

describe('OpenSpecSource.transform — spec.md 规则', () => {
  const src = new OpenSpecSource();

  it('### Requirement → ## Requirement(不删除)', () => {
    const input = '### Requirement: Login\n#### Scenario: x\n';
    const out = src.transform(input, 'spec');
    expect(out).toContain('## Requirement: Login');
    expect(out).toContain('## Scenario: x');
  });

  it('list-prefix WHEN/THEN/GIVEN 转 **When**/**Then**/**Given**', () => {
    const input = '## Scenario: x\n- **WHEN** user clicks login\n- **THEN** ok\n';
    const out = src.transform(input, 'spec');
    expect(out).toContain('**When** user clicks login');
    expect(out).toContain('**Then** ok');
    expect(out).not.toContain('- **WHEN');
  });

  it('多行 list 续行合并', () => {
    const input = '- **WHEN** user submits\n  with remember-me enabled\n- **THEN** ok\n';
    const out = src.transform(input, 'spec');
    expect(out).toMatch(/\*\*When\*\* user submits with remember-me enabled/);
  });

  it('代码块内的 #### Scenario / list-WHEN 不变', () => {
    const input = '```md\n#### Scenario: example\n- **WHEN** demo\n```\n#### Scenario: real\n';
    const out = src.transform(input, 'spec');
    expect(out).toContain('#### Scenario: example'); // 代码块内不动
    expect(out).toContain('## Scenario: real'); // 代码块外转
  });
});
