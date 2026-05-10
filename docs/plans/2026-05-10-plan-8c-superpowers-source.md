# Plan 8c — `forge migrate` Phase 3 SuperpowersSource 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:实施 `SuperpowersSource` 完整(配对算法 + slug 安全归一化 + archive-detect 严格化推测 + transformer);`forge migrate superpowers --no-regenerate --dry-run` 端到端跑通(里程碑 M3 待 P4 cp)。

**Architecture**:配对算法锚定 `/-design\.md$/` 后缀;archive-detect 多信号(checkbox ≥ 95% **且** task ≥ 3 + git log word-boundary + slug 共同命中 + critical-task-pending 检查);transformer 走 markdown-aware walker(中英冒号 `[:：]` + 大小写 STEP + 三层嵌套);slug 安全归一化(禁 `..` / 保留名)。

**Tech Stack**:Node 20+、TypeScript ESM;复用 `markdown-aware.ts`(plan-8b 已落地);git log 走 `child_process.execSync` (`git log --follow -- <path>`)。

**Spec 引用**:[`2026-05-10-forge-migrate-design.md`](../specs/2026-05-10-forge-migrate-design.md) §2.2 superpowers 配对 + archive-detect、§2.6 transformer、§3.1 错误矩阵 classify 段(unsafe-slug ≥ 50% / archive 完整性)、§4.2 fixture superpowers-minimal、§4.3 集成测断言。

**前置**:Plan 8a 完成(types + lock 扩展);Plan 8b 完成(markdown-aware walker)。可与 plan-8b 并行(本 phase 走 archive-detect 不依赖 walker;但 transform 阶段需要 walker)。

---

## File Structure(Plan 8c 完成时改动)

```
src/core/migrate/
├── archive-detect.ts                     ← ★ NEW(Task 3.1):推测引擎
└── sources/
    └── superpowers.ts                    ← 改:从空骨架填实(Task 3.3-3.8)

tests/
├── migrate/
│   ├── archive-detect.test.ts            ← ★ NEW(Task 3.1)
│   ├── superpowers.test.ts               ← ★ NEW(Task 3.9)集成测
│   └── sources/
│       └── superpowers.test.ts           ← ★ NEW(Task 3.4-3.7)
└── fixtures/migrate/superpowers-minimal/ ← ★ NEW(Task 3.9)
    ├── docs/superpowers/
    │   ├── specs/2026-01-01-add-auth-design.md
    │   ├── specs/2026-04-01-cleanup-deps-design.md
    │   ├── plans/2026-01-01-add-auth-plan.md          # 全 [x] + Step 1.1 嵌套 + 中文冒号
    │   ├── plans/2026-04-01-cleanup-deps-plan.md      # 部分 [x]
    │   ├── plans/2026-03-01-orphan-plan.md            # plan-only + STEP 大写
    │   └── plans/2026-02-01-single-task-plan.md       # 1 task 100% → 不 archive
    └── .git/                              # commits 含 close + slug 共同命中
```

---

## Task 3.1:`archive-detect.ts` 推测引擎

**Files:**
- Create: `src/core/migrate/archive-detect.ts`
- Create: `tests/migrate/archive-detect.test.ts`

**Spec 引用**:§2.2 已归档推测(信号 1 checkbox ≥ 95% 且 task ≥ 3 / 信号 2 git log word-boundary + slug 共同命中 / 信号 3 mtime 仅展示 / 信号 4 marker `<!-- forge:archived -->`)+ critical-task-pending 检查。

- [ ] **Step 1:写 fail test 全信号矩阵**

```ts
// tests/migrate/archive-detect.test.ts
import { describe, it, expect } from 'vitest';
import {
  detectArchive,
  parseCheckboxes,
  countSlugInGitLog,
} from '../../src/core/migrate/archive-detect.js';

describe('parseCheckboxes', () => {
  it('返回 total + checked 数', () => {
    const input = '- [ ] task-1: x\n- [x] task-2: y\n- [x] task-3: z\n';
    expect(parseCheckboxes(input)).toEqual({ total: 3, checked: 2 });
  });
});

describe('detectArchive — 信号矩阵', () => {
  it('信号 1 + 信号 2 命中 → archive', () => {
    const result = detectArchive({
      slug: 'add-auth',
      planContent: '- [x] task-1: x\n- [x] task-2: y\n- [x] task-3: z\n',
      gitLogCommits: ['close add-auth: ship feature'],
      mtimeAgeDays: 60,
      hasArchivedMarker: false,
      inGitRepo: true,
    });
    expect(result.recommended).toBe('archive');
    expect(result.reasons).toContain('checkbox 3/3 (100%)');
    expect(result.reasons.some((r) => r.includes('git: 1 close-commit'))).toBe(true);
  });

  it('单 task 100% 完成(< 3) → 不 archive', () => {
    const result = detectArchive({
      slug: 'single',
      planContent: '- [x] task-1: spike\n',
      gitLogCommits: [],
      mtimeAgeDays: 60,
      hasArchivedMarker: false,
      inGitRepo: true,
    });
    expect(result.recommended).toBe('active');
  });

  it('git log "close-out the meeting" 不命中(无 slug 共同命中)', () => {
    const result = detectArchive({
      slug: 'add-auth',
      planContent: '- [ ] task-1: x\n- [ ] task-2: y\n',
      gitLogCommits: ['docs: close-out the meeting notes'], // 无 slug
      mtimeAgeDays: 60,
      hasArchivedMarker: false,
      inGitRepo: true,
    });
    expect(result.recommended).toBe('active');
  });

  it('marker <!-- forge:archived --> 命中 → 强制 archive(优先级最高)', () => {
    const result = detectArchive({
      slug: 'x',
      planContent: '<!-- forge:archived -->\n- [ ] task-1: x\n', // 即便没勾也 archive
      gitLogCommits: [],
      mtimeAgeDays: 0,
      hasArchivedMarker: true,
      inGitRepo: true,
    });
    expect(result.recommended).toBe('archive');
    expect(result.reasons).toContain('marker: <!-- forge:archived -->');
  });

  it('critical-task-pending 即使 95% 完成也不 archive', () => {
    const planContent =
      '<!-- critical: task-20 -->\n' +
      Array.from({ length: 19 })
        .map((_, i) => `- [x] task-${i + 1}: done\n`)
        .join('') +
      '- [ ] task-20: critical pending\n';
    const result = detectArchive({
      slug: 'cleanup',
      planContent,
      gitLogCommits: ['close cleanup: ship feature'],
      mtimeAgeDays: 60,
      hasArchivedMarker: false,
      inGitRepo: true,
    });
    expect(result.recommended).toBe('active');
    expect(result.reasons.some((r) => r.includes('critical-task-pending'))).toBe(true);
  });

  it('非 git 仓库:信号 2 失效,只用 1 + 4', () => {
    const result = detectArchive({
      slug: 'x',
      planContent: '- [x] task-1\n- [x] task-2\n- [x] task-3\n',
      gitLogCommits: [],
      mtimeAgeDays: 60,
      hasArchivedMarker: false,
      inGitRepo: false,
    });
    // 信号 1 命中但只它一个;信号 2 失效;mtime 不参与默认
    expect(result.recommended).toBe('archive'); // 信号 1 单独足以推 archive
  });
});

describe('countSlugInGitLog', () => {
  it('word-boundary close + slug 共同命中', () => {
    const commits = [
      'close add-auth: ship',          // 命中
      'docs: close-out meeting',        // 不命中(无 slug)
      'closing add-auth conversation',  // 命中(close 词根 + slug)
    ];
    expect(countSlugInGitLog(commits, 'add-auth')).toBe(2);
  });
});
```

- [ ] **Step 2-3:fail / 实施 archive-detect**

```ts
// src/core/migrate/archive-detect.ts
// 已归档推测引擎 — Plan 8c Task 3.1
// Spec §2.2:信号 1 checkbox ≥ 95% 且 task ≥ 3 / 信号 2 git log word-boundary + slug / 信号 3 mtime 仅展示 / 信号 4 marker

export interface DetectArchiveInput {
  slug: string;
  /** plan.md 完整文本(含 checkbox + critical 标记 + archived marker) */
  planContent: string;
  /** git log 该 plan 文件的 commit message 列表(若非 git 仓库则空) */
  gitLogCommits: string[];
  /** mtime 距今天数(仅展示,不参与默认分类) */
  mtimeAgeDays: number;
  /** 是否含 <!-- forge:archived --> marker */
  hasArchivedMarker: boolean;
  /** 是否在 git 仓库内(false 则信号 2 失效) */
  inGitRepo: boolean;
}

export interface DetectArchiveResult {
  recommended: 'active' | 'archive';
  reasons: string[]; // 给 report 表显示
}

/** 信号 1:解析 checkbox total + checked */
export function parseCheckboxes(content: string): { total: number; checked: number } {
  let total = 0;
  let checked = 0;
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*- \[([ x])\]/);
    if (!m) continue;
    total++;
    if (m[1] === 'x') checked++;
  }
  return { total, checked };
}

/** 信号 2:git log word-boundary close 关键词 + slug 共同命中 */
export function countSlugInGitLog(commits: string[], slug: string): number {
  const KEYWORDS = /\b(close|complete|done|finish|archive|ship|closing|closed)\b/i;
  let count = 0;
  for (const c of commits) {
    if (!c.includes(slug)) continue;
    if (KEYWORDS.test(c)) count++;
  }
  return count;
}

/** 信号 4:critical-task-pending 检查(<!-- critical: task-N --> 标记的 task 未勾 [x]) */
function hasCriticalTaskPending(content: string): boolean {
  const lines = content.split('\n');
  // 找所有 <!-- critical: <task-id> --> 标记
  const criticalIds: string[] = [];
  for (const line of lines) {
    const m = line.match(/<!--\s*critical:\s*([\w-]+)\s*-->/);
    if (m && m[1]) criticalIds.push(m[1]);
  }
  if (criticalIds.length === 0) return false;
  // 检查这些 task-id 是否都勾 [x]
  for (const id of criticalIds) {
    const re = new RegExp(`- \\[x\\]\\s+${id}\\b`);
    if (!re.test(content)) return true; // 有未勾 critical → pending
  }
  return false;
}

export function detectArchive(input: DetectArchiveInput): DetectArchiveResult {
  const reasons: string[] = [];
  const { slug, planContent, gitLogCommits, mtimeAgeDays, hasArchivedMarker, inGitRepo } = input;

  // 信号 4 marker — 优先级最高
  if (hasArchivedMarker) {
    reasons.push('marker: <!-- forge:archived -->');
    return { recommended: 'archive', reasons };
  }

  // critical-task-pending 检查 — 即使 95% 也不 archive
  if (hasCriticalTaskPending(planContent)) {
    reasons.push('critical-task-pending(忽略其他信号)');
    return { recommended: 'active', reasons };
  }

  // 信号 1 checkbox(必须 ≥ 3 task)
  const { total, checked } = parseCheckboxes(planContent);
  const sig1 =
    total >= 3 && checked / total >= 0.95
      ? `checkbox ${checked}/${total} (${((checked / total) * 100).toFixed(0)}%)`
      : null;
  if (sig1) reasons.push(sig1);

  // 信号 2 git log
  let sig2: string | null = null;
  if (inGitRepo) {
    const closeCommits = countSlugInGitLog(gitLogCommits, slug);
    if (closeCommits > 0) sig2 = `git: ${closeCommits} close-commit(s) with slug`;
    if (sig2) reasons.push(sig2);
  } else {
    reasons.push('git: not-available');
  }

  // 信号 3 mtime — 仅展示
  reasons.push(`mtime: ${mtimeAgeDays}d ago`);

  // 推荐:信号 1 OR 信号 2 命中 → archive
  if (sig1 || sig2) {
    return { recommended: 'archive', reasons };
  }
  return { recommended: 'active', reasons };
}
```

- [ ] **Step 4-5:pass + commit**

```bash
pnpm test -- tests/migrate/archive-detect.test.ts
git add src/core/migrate/archive-detect.ts tests/migrate/archive-detect.test.ts
git commit -m "feat(migrate): migrate-3.1 archive-detect 推测引擎(checkbox + git keyword + marker + critical)"
```

---

## Task 3.2:`SuperpowersSource.detect`

**Files:** Modify `src/core/migrate/sources/superpowers.ts`

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/sources/superpowers.test.ts(新文件)
import { describe, it, expect } from 'vitest';
import { SuperpowersSource } from '../../../src/core/migrate/sources/superpowers.js';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
```

- [ ] **Step 2-3:fail / 实施**

```ts
// src/core/migrate/sources/superpowers.ts(改 detect)
async detect(cwd: string): Promise<DetectResult> {
  const root = join(cwd, 'docs', 'superpowers');
  if (!existsSync(root)) {
    return { found: false, message: `<cwd>/docs/superpowers/ 不存在;预期路径:${root}` };
  }
  return { found: true, rootPath: root };
}
```

- [ ] **Step 4-5:pass + commit**

```bash
pnpm test -- tests/migrate/sources/superpowers.test.ts -t "detect"
git commit -m "feat(migrate): migrate-3.2 SuperpowersSource.detect"
```

---

## Task 3.3:`SuperpowersSource.scan` + 配对算法

**Files:** Modify `superpowers.ts`

**Spec 引用**:§2.2 配对算法(锚定 `/-design\.md$/` + `/-plan\.md$/`;同 key 配对 / unrecognized / unsafe-slug)。

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/sources/superpowers.test.ts(追加)
describe('SuperpowersSource.scan — 配对算法', () => {
  it('design+plan 配对 + plan-only + design-only + unrecognized 分流', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-scan-'));
    const root = join(tmp, 'docs/superpowers');
    await mkdir(join(root, 'specs'), { recursive: true });
    await mkdir(join(root, 'plans'), { recursive: true });
    await writeFile(join(root, 'specs/2026-01-01-add-auth-design.md'), '# Auth\n');
    await writeFile(join(root, 'plans/2026-01-01-add-auth-plan.md'), '- [x] **Step 1**: x\n');
    await writeFile(join(root, 'plans/2026-03-01-orphan-plan.md'), '- [ ] **Step 1**: y\n');
    await writeFile(join(root, 'specs/2026-04-01-feature-design-v2.md'), '# v2\n'); // unrecognized

    const src = new SuperpowersSource();
    const r = await src.scan(root);
    expect(r.pairings?.paired).toContainEqual(
      expect.objectContaining({ slug: 'add-auth' }),
    );
    expect(r.pairings?.paired).toContainEqual(
      expect.objectContaining({ slug: 'orphan', designPath: undefined }),
    );
    expect(r.pairings?.unrecognized).toContain(
      expect.stringContaining('feature-design-v2.md'),
    );
    await rm(tmp, { recursive: true, force: true });
  });

  it('unsafe-slug `..` / 保留名 → 进 unsafeSlug 列表', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-unsafe-'));
    const root = join(tmp, 'docs/superpowers');
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs/2026-01-01-..-design.md'), '# X\n');

    const src = new SuperpowersSource();
    const r = await src.scan(root);
    expect(r.pairings?.unsafeSlug).toEqual(expect.arrayContaining([expect.stringContaining('..')]));
    await rm(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2-3:实施 scan + 配对**

```ts
// src/core/migrate/sources/superpowers.ts
const RESERVED_SLUGS_SP = new Set(['..', '.', '.cache', '.forge-trash', '.forge-ack', 'archive']);

function extractSlug(filename: string, suffix: '-design.md' | '-plan.md'): string | null {
  if (!filename.endsWith(suffix)) return null;
  const stem = filename.slice(0, -suffix.length);
  // stem 形如 2026-01-01-add-auth → 取 date 后部分(-3 token)
  const m = stem.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return m?.[1] ?? null;
}

function isUnsafeSlug(slug: string): boolean {
  if (RESERVED_SLUGS_SP.has(slug)) return true;
  if (slug.includes('/') || slug.includes('\\')) return true;
  if (slug.includes('..')) return true;
  return false;
}

// SuperpowersSource class:
async scan(rootPath: string): Promise<ScanResult> {
  const files: ScannedFile[] = [];
  const paired: Array<{ slug: string; designPath?: string; planPath?: string }> = [];
  const unrecognized: string[] = [];
  const unsafeSlug: string[] = [];

  const designByKey = new Map<string, ScannedFile>();
  const planByKey = new Map<string, ScannedFile>();

  // specs/ 扫
  const specsDir = join(rootPath, 'specs');
  if (existsSync(specsDir)) {
    const entries = await readdir(specsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() || !e.name.endsWith('.md')) continue;
      const slug = extractSlug(e.name, '-design.md');
      const absPath = join(specsDir, e.name);
      const stats = await stat(absPath);
      const sf: ScannedFile = {
        absPath,
        relPath: join('specs', e.name),
        kind: 'design',
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        encoding: await detectEncoding(absPath),
      };
      if (!slug) {
        unrecognized.push(sf.relPath);
        continue;
      }
      if (isUnsafeSlug(slug)) {
        unsafeSlug.push(sf.relPath);
        continue;
      }
      designByKey.set(slug, sf);
      files.push(sf);
    }
  }
  // plans/ 扫
  const plansDir = join(rootPath, 'plans');
  if (existsSync(plansDir)) {
    const entries = await readdir(plansDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() || !e.name.endsWith('.md')) continue;
      const slug = extractSlug(e.name, '-plan.md');
      const absPath = join(plansDir, e.name);
      const stats = await stat(absPath);
      const sf: ScannedFile = {
        absPath,
        relPath: join('plans', e.name),
        kind: 'tasks',
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        encoding: await detectEncoding(absPath),
      };
      if (!slug) {
        unrecognized.push(sf.relPath);
        continue;
      }
      if (isUnsafeSlug(slug)) {
        unsafeSlug.push(sf.relPath);
        continue;
      }
      planByKey.set(slug, sf);
      files.push(sf);
    }
  }

  // 配对
  const allKeys = new Set([...designByKey.keys(), ...planByKey.keys()]);
  for (const k of allKeys) {
    paired.push({
      slug: k,
      designPath: designByKey.get(k)?.absPath,
      planPath: planByKey.get(k)?.absPath,
    });
  }

  return {
    isEmpty: files.length === 0,
    files,
    pairings: { paired, unrecognized, unsafeSlug },
  };
}
```

(`detectEncoding` 复用 plan-8b openspec.ts 的同名 helper;实施时考虑提到 `markdown-aware.ts` 或 `utils.ts` 共用)

- [ ] **Step 4-5:pass + commit**

---

## Task 3.4:`SuperpowersSource.classify` 调 archive-detect + git log

**Files:** Modify `superpowers.ts`

**Spec 引用**:§2.2 落点表(active/archive/draft/skip)+ §3.1 unsafe-slug 件数 ≥ 50% → exit 4。

- [ ] **Step 1-3:写 fail / 实施 classify**

```ts
// src/core/migrate/sources/superpowers.ts
import { detectArchive } from '../archive-detect.js';
import { execSync } from 'node:child_process';

async classify(scan: ScanResult, ctx: ClassifyCtx): Promise<ClassificationPlan> {
  const changes: PlannedChange[] = [];
  const drafts: PlannedDraft[] = [];
  const skipped: ClassificationPlan['skipped'] = [];

  // unsafe-slug 50% 阈值检查(spec §3.1 unsafe-slug ≥ 50% → 后续 runMigrate exit 4)
  const totalCount =
    (scan.pairings?.paired.length ?? 0) +
    (scan.pairings?.unsafeSlug.length ?? 0) +
    (scan.pairings?.unrecognized.length ?? 0);
  const unsafeRatio = totalCount > 0 ? (scan.pairings?.unsafeSlug.length ?? 0) / totalCount : 0;
  if (unsafeRatio >= 0.5) {
    // 标记;runMigrate 主流程检查后 exit 4
    skipped.push({ source: '__GLOBAL__', reason: `[unsafe-slug-ratio-too-high: ${(unsafeRatio * 100).toFixed(0)}%]` });
  }

  for (const p of scan.pairings?.paired ?? []) {
    const designFile = scan.files.find((f) => f.absPath === p.designPath);
    const planFile = scan.files.find((f) => f.absPath === p.planPath);

    // archive-detect 输入
    const planContent = planFile ? await readFile(planFile.absPath, 'utf8') : '';
    const hasArchivedMarker = planContent.includes('<!-- forge:archived -->');

    // git log 取该 plan 文件的 commits
    let gitLogCommits: string[] = [];
    if (ctx.inGitRepo && planFile) {
      try {
        const out = execSync(
          `git log --follow --pretty=format:%s -- "${planFile.absPath}"`,
          { cwd: ctx.cwd, encoding: 'utf8' },
        );
        gitLogCommits = out.split('\n').filter((s) => s.trim());
      } catch {
        // 忽略 git log 错误;当 not-available
      }
    }

    const mtimeAgeDays = planFile
      ? Math.floor((Date.now() - new Date(planFile.mtime).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const detect = detectArchive({
      slug: p.slug,
      planContent,
      gitLogCommits,
      mtimeAgeDays,
      hasArchivedMarker,
      inGitRepo: ctx.inGitRepo,
    });

    const change: PlannedChange = {
      slug: p.slug,
      classification: detect.recommended,
      classificationReason: detect.reasons.join('; '),
      artifacts: {},
    };
    if (designFile) change.artifacts.design = designFile;
    if (planFile) change.artifacts.tasks = planFile;
    changes.push(change);
  }

  // unsafe-slug / unrecognized 加入 skipped
  for (const u of scan.pairings?.unsafeSlug ?? []) {
    skipped.push({ source: u, reason: '[unsafe-slug]' });
  }
  for (const u of scan.pairings?.unrecognized ?? []) {
    skipped.push({ source: u, reason: '[unrecognized-filename]' });
  }

  return { changes, specs: [], drafts, configFiles: [], skipped };
}
```

- [ ] **Step 4-5:pass + commit**

---

## Task 3.5:`SuperpowersSource.prepareCopy`

**Spec 引用**:§2.2 落点表(active → forge/changes/<slug>/{design.md, tasks.md};archive → forge/changes/archive/<slug>/...;draft → forge/drafts/<date>-<slug>-{design,plan}.md 扁平保留)。

- [ ] **Step 1-3**:写 fail / 实施

```ts
// src/core/migrate/sources/superpowers.ts
prepareCopy(plan: ClassificationPlan, target: string): CopyOp[] {
  const ops: CopyOp[] = [];
  for (const c of plan.changes) {
    if (c.classification === 'skip') continue;
    if (c.classification === 'draft') {
      // 扁平保留(date-slug-design.md / -plan.md)
      if (c.artifacts.design) {
        ops.push({
          source: c.artifacts.design.absPath,
          target: join(target, 'drafts', basename(c.artifacts.design.absPath)),
          kind: 'draft',
        });
      }
      if (c.artifacts.tasks) {
        ops.push({
          source: c.artifacts.tasks.absPath,
          target: join(target, 'drafts', basename(c.artifacts.tasks.absPath)),
          kind: 'draft',
        });
      }
      continue;
    }
    const baseDir =
      c.classification === 'archive'
        ? join(target, 'changes', 'archive', c.slug)
        : join(target, 'changes', c.slug);
    if (c.artifacts.design) {
      ops.push({
        source: c.artifacts.design.absPath,
        target: join(baseDir, 'design.md'),
        kind: 'design',
        changeSlug: c.slug,
      });
    }
    if (c.artifacts.tasks) {
      // plan.md → tasks.md(只改名;内容由 transform 改)
      ops.push({
        source: c.artifacts.tasks.absPath,
        target: join(baseDir, 'tasks.md'),
        kind: 'tasks',
        changeSlug: c.slug,
      });
    }
  }
  return ops;
}
```

- [ ] **Step 4-5:pass + commit**

---

## Task 3.6:`SuperpowersSource.transform` — plan.md → tasks.md

**Spec 引用**:§2.6 transformer 规则表(`- [ ] **Step N**:` → `- [ ] task-N: `;三层 `**Step 1.1**` → `task-1-1`;中英冒号 `[:：]`;`STEP` 大写 / `step` 小写不敏感;走 walker)。

- [ ] **Step 1:写 fail test 全规则**

```ts
// tests/migrate/sources/superpowers.test.ts(追加)
describe('SuperpowersSource.transform — plan → tasks 规则', () => {
  const src = new SuperpowersSource();

  it('**Step N**: → task-N:(英文冒号)', () => {
    const input = '- [ ] **Step 1**: First\n- [x] **Step 2**: Second\n';
    const out = src.transform(input, 'tasks');
    expect(out).toContain('- [ ] task-1: First');
    expect(out).toContain('- [x] task-2: Second');
    expect(out).not.toContain('**Step');
  });

  it('中文冒号 `:` → 英文 `:`', () => {
    const input = '- [ ] **Step 1**:中文冒号 task\n';
    const out = src.transform(input, 'tasks');
    expect(out).toContain('- [ ] task-1: 中文冒号 task');
  });

  it('**Step 1.1** 嵌套 → task-1-1', () => {
    const input = '- [ ] **Step 1**: parent\n- [ ] **Step 1.1**: child\n';
    const out = src.transform(input, 'tasks');
    expect(out).toContain('task-1: parent');
    expect(out).toContain('task-1-1: child');
  });

  it('大小写不敏感 STEP / step / Step', () => {
    const input = '- [ ] **STEP 1**: upper\n- [ ] **step 2**: lower\n- [ ] **Step 3**: mixed\n';
    const out = src.transform(input, 'tasks');
    expect(out).toContain('task-1:');
    expect(out).toContain('task-2:');
    expect(out).toContain('task-3:');
  });

  it('代码块内不动', () => {
    const input = '```\n- [ ] **Step 1**: example\n```\n- [ ] **Step 2**: real\n';
    const out = src.transform(input, 'tasks');
    expect(out).toContain('- [ ] **Step 1**: example'); // 代码块内
    expect(out).toContain('task-2: real'); // 代码块外
  });
});
```

- [ ] **Step 2-3:实施**

```ts
// src/core/migrate/sources/superpowers.ts
import { walkLines } from '../markdown-aware.js';

transform(content: string, kind: ArtifactKind): string {
  if (kind === 'tasks') return this.transformPlan(content);
  return content; // design 不 transform(spec §2.6)
}

private transformPlan(content: string): string {
  return walkLines(content, (line, ctx) => {
    if (ctx.inFenced || ctx.isTableRow) return;
    // 大小写不敏感 STEP / step / Step;三层 \d+(?:\.\d+){0,2};中英冒号 [:：]
    const m = line.match(
      /^(\s*)- \[([ x])\] \*\*[Ss][Tt][Ee][Pp]\s+(\d+(?:\.\d+){0,2})\*\*\s*[:：]\s*(.+)$/,
    );
    if (!m) return;
    const [, indent, checked, num, rest] = m;
    const taskId = `task-${(num ?? '').replace(/\./g, '-')}`;
    return `${indent ?? ''}- [${checked ?? ' '}] ${taskId}: ${rest ?? ''}`;
  });
}
```

- [ ] **Step 4-5:pass + commit**

---

## Task 3.7:`SuperpowersSource.listMissingArtifacts`(M15 facts 目标分桶)

**Spec 引用**:§2.8 流程 6 / M15 v3 — proposal 校验 facts 来自 design;specs 校验 facts 来自 tasks。

- [ ] **Step 1-3:实施**

```ts
// src/core/migrate/sources/superpowers.ts
listMissingArtifacts(plan: ClassificationPlan): MissingArtifact[] {
  const missing: MissingArtifact[] = [];
  for (const c of plan.changes) {
    if (c.classification === 'draft' || c.classification === 'skip') continue;
    const baseDir =
      c.classification === 'archive' ? `forge/changes/archive/${c.slug}` : `forge/changes/${c.slug}`;
    // superpowers 必缺 proposal + specs(spec §2.6 / §2.8 触发件)
    missing.push({
      changeSlug: c.slug,
      kind: 'proposal',
      targetPath: `${baseDir}/proposal.md`,
      factsSource: 'design', // M15 目标分桶:proposal 校验 facts 来自 design
    });
    missing.push({
      changeSlug: c.slug,
      kind: 'specs',
      targetPath: `${baseDir}/specs/${c.slug}.md`,
      factsSource: 'tasks', // M15:specs 校验 facts 来自 tasks
    });
  }
  return missing;
}
```

- [ ] **Step 4-5:commit**

---

## Task 3.8:slug 安全归一化端到端测

**Files:** 加 fixture 复制 unsafe-slug 案例

- [ ] **Step 1-3:验证 unsafe-slug ≥ 50% 在 runMigrate 触发 exit 4**

```ts
// tests/migrate/superpowers.test.ts(集成测,部分)
it('unsafe-slug 件数 ≥ 50% → runMigrate exit 4', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-unsafe-half-'));
  const root = join(tmp, 'docs/superpowers');
  await mkdir(join(root, 'specs'), { recursive: true });
  await writeFile(join(root, 'specs/2026-01-01-..-design.md'), 'X');
  await writeFile(join(root, 'specs/2026-01-01-good-design.md'), 'Y');
  // 1/2 = 50% unsafe → exit 4
  process.chdir(tmp);
  const code = await runMigrate({ source: 'superpowers', noRegenerate: true, dryRun: true });
  expect(code).toBe(4);
  await rm(tmp, { recursive: true, force: true });
});
```

注:这个 case 需要 runMigrate 主流程在 classify 后检查 `skipped` 是否含 `__GLOBAL__` reason `[unsafe-slug-ratio-too-high]`,检查则 exit 4。本 task 在 runMigrate 加该检查(plan-8a Task 1.6 主流程框架已留扩展点)。

- [ ] **Step 2-3:在 runMigrate 加 unsafe-slug ≥ 50% 检查**

```ts
// src/core/migrate/index.ts(在 classify 之后,conflict 之前加)
const globalSkip = plan.skipped.find((s) => s.source === '__GLOBAL__');
if (globalSkip?.reason.includes('unsafe-slug-ratio-too-high')) {
  console.error(`[migrate] ${globalSkip.reason};请检查 source 文件命名后重跑`);
  return 4;
}
```

- [ ] **Step 4-5:pass + commit**

---

## Task 3.9:fixture + 集成测

**Files:**
- Create: `tests/fixtures/migrate/superpowers-minimal/` 全树
- Create: `tests/migrate/superpowers.test.ts`

**Spec 引用**:§4.2 fixture 树 + §4.3 superpowers 集成测断言。

- [ ] **Step 1:建 fixture(含 git fixture 用 `vitest.global-setup.ts` 跑 git init)**

```bash
mkdir -p tests/fixtures/migrate/superpowers-minimal/docs/superpowers/{specs,plans}
```

文件:
- `specs/2026-01-01-add-auth-design.md`(含 # H1)
- `specs/2026-04-01-cleanup-deps-design.md`
- `plans/2026-01-01-add-auth-plan.md`:全 [x] + Step 1.1 嵌套 + 中文冒号
- `plans/2026-04-01-cleanup-deps-plan.md`:部分 [x]
- `plans/2026-03-01-orphan-plan.md`:plan-only + STEP 大写
- `plans/2026-02-01-single-task-plan.md`:1 task 100%(< 3)

- [ ] **Step 2:扩 vitest.global-setup.ts:对 fixture 跑 `git init` + 写 commit**

```ts
// vitest.global-setup.ts(追加)
// 给 superpowers-minimal fixture 跑 git init + commit(spec §4.4)
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export async function setup() {
  const fixtureRoot = join(__dirname, 'tests/fixtures/migrate/superpowers-minimal');
  if (existsSync(fixtureRoot) && !existsSync(join(fixtureRoot, '.git'))) {
    execSync('git init', { cwd: fixtureRoot });
    execSync('git config user.email "test@test"', { cwd: fixtureRoot });
    execSync('git config user.name "test"', { cwd: fixtureRoot });
    execSync('git add .', { cwd: fixtureRoot });
    execSync('git commit -m "feat: initial fixture commit"', { cwd: fixtureRoot });
    execSync(
      'git commit --allow-empty -m "close add-auth: ship feature"',
      { cwd: fixtureRoot },
    );
    execSync(
      'git commit --allow-empty -m "docs: close-out the meeting notes"', // 不应误命中(无 slug)
      { cwd: fixtureRoot },
    );
  }
}
```

- [ ] **Step 3:写集成测**

```ts
// tests/migrate/superpowers.test.ts
describe('forge migrate superpowers — 集成测(--no-regenerate)', () => {
  // ... beforeEach / afterEach 同 openspec.test.ts

  it('add-auth(全 [x] + git slug+close commit) → archive 但缺件降级 active(M13 + --no-regenerate)', async () => {
    const code = await runMigrate({
      source: 'superpowers',
      noRegenerate: true,
      noInteractive: true,
    });
    // M13 v3:--no-interactive + archive 缺件 → exit 4
    expect(code).toBe(4);
  });

  it('交互模式可降级 active', async () => {
    // mock askUserConfirm 返 'active'
    // ...(实施期由 P5 Task 5.16 enforceArchiveIntegrity 接入后再开)
  });

  it('cleanup-deps(部分 [x])→ active', async () => {
    // ...(同 P4 cp 路径未实施,集成测占位)
  });

  it('single-task(1 task 100%, < 3)→ active', async () => {
    // ...
  });

  it('orphan(plan-only)→ active 且 design 缺(只 tasks)', async () => {
    // ...
  });

  it('tasks.md 含 task-1-1: 嵌套;不含 **Step;中文冒号转英文', async () => {
    // ...(P4 cp 路径)
  });
});
```

- [ ] **Step 4:commit fixture + 集成测占位**

```bash
git add tests/fixtures/migrate/superpowers-minimal vitest.global-setup.ts tests/migrate/superpowers.test.ts
git commit -m "test(migrate): migrate-3.9 superpowers fixture + 集成测占位(等 P4/P5 cp+regen)"
```

---

## Task 3.10:dry-run 端到端 + P3 完成

- [ ] **Step 1-3**:同 plan-8b Task 2.12,跑 dry-run + 全量 verification。

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test -- tests/migrate/
git commit --allow-empty -m "chore(migrate): P3 SuperpowersSource 完成里程碑"
```

---

## Plan 8c Self-Review

- [ ] archive-detect.ts 信号 1-4 全实施;critical-task-pending 检查覆盖
- [ ] SuperpowersSource detect / scan / classify / prepareCopy / transform / listMissingArtifacts 全实施
- [ ] transform 5 类规则(英冒 / 中冒 / 嵌套 1.1 / 大小写 STEP / 代码块跳过)单元测 PASS
- [ ] slug 安全归一化覆盖 `..` / 保留名;≥ 50% 触发 exit 4
- [ ] fixture superpowers-minimal/ 6 个 plan 文件 + git commit 含 close+slug 共同命中
- [ ] vitest.global-setup.ts 加 git init hook
- [ ] M15 facts 目标分桶在 listMissingArtifacts 标 factsSource: 'design'/'tasks'

P3 完成,M3 里程碑待 P4 cp 路径 + P5 regenerate 落地。
