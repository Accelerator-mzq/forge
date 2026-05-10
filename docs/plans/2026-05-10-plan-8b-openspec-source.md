# Plan 8b — `forge migrate` Phase 2 OpenSpecSource 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:实施 `OpenSpecSource` 完整(detect + scan + classify + prepareCopy + markdown-aware transformer);共用 `markdown-aware.ts` walker 也在本 phase 落地。`forge migrate openspec --no-regenerate --dry-run` 端到端跑通(里程碑 M2)。

**Architecture**:`markdown-aware.ts` walker = 4 层 bridge 的 Layer 1(spec §1.1);openspec.ts 走 walker 实施 §2.5 transformer 规则(H4→H2 Scenario / Problem→Why / 三层 task 编号);`### Requirement` **改名为 `## Requirement`**(不删除,保留 Description/Notes)。

**Tech Stack**:Node 20+、TypeScript ESM、yaml、gray-matter(已有)。

**Spec 引用**:[`2026-05-10-forge-migrate-design.md`](../specs/2026-05-10-forge-migrate-design.md) §1.1 Bridge 架构、§2.1 OpenSpec 目录映射、§2.3 config.yaml 合并、§2.5 OpenSpec transformer、§2.7 design.md 校验、§3.1 错误矩阵 scan 段、§4.2 fixture openspec-minimal、§4.3 OpenSpec 集成测断言。

**前置**:Plan 8a 完成(types.ts + sources/index.ts + LockMode 扩展);可与 plan-8c(P3)并行。

---

## File Structure(Plan 8b 完成时改动)

```
src/core/migrate/
├── markdown-aware.ts                     ← ★ NEW(Task 2.1):walker 实现
└── sources/
    └── openspec.ts                       ← 改:从空骨架填实(Task 2.2-2.10)

tests/
├── migrate/
│   ├── markdown-aware.test.ts            ← ★ NEW(Task 2.1)
│   ├── openspec.test.ts                  ← ★ NEW(Task 2.11):集成测
│   └── sources/
│       └── openspec.test.ts              ← ★ NEW(Task 2.6/2.7/2.8):transform 单元测
└── fixtures/migrate/openspec-minimal/    ← ★ NEW(Task 2.11)
    └── openspec/
        ├── specs/foo/spec.md             # H4 Scenario + list-prefix WHEN/THEN
        ├── specs/bar/spec.md             # 含代码块内 #### Scenario(测 fenced 跳过)
        ├── specs/baz/spec.md             # ### Requirement 含 Description + 多行 WHEN 续行
        ├── changes/add-bar/{proposal.md, tasks.md, design.md}
        ├── changes/three-level/tasks.md  # 三层编号 1.2.3.
        ├── changes/archive/old-baz/{proposal.md, tasks.md, design.md, specs/x.md}
        ├── explorations/idea-x.md
        └── config.yaml
```

---

## Task 2.1:`markdown-aware.ts` walker(fenced state + table-row + 自切 section)

**Files:**
- Create: `src/core/migrate/markdown-aware.ts`
- Create: `tests/migrate/markdown-aware.test.ts`

**Spec 引用**:§2.5 v3 边界精确化(行 308-313)— 只识 fenced(``` 或 ~~~,token 同种收尾);不识 indented code(known limitation);UTF-8 + BOM 跳过;CRLF normalize。

- [ ] **Step 1:写 fail test 全覆盖 4 类场景**

```ts
// tests/migrate/markdown-aware.test.ts
import { describe, it, expect } from 'vitest';
import { walkLines, splitSectionsAware } from '../../src/core/migrate/markdown-aware.js';

describe('walkLines — fenced code state', () => {
  it('在 ``` fenced 内不调用 transform', () => {
    const input = '```md\n#### Scenario: x\n```\n#### Scenario: y\n';
    const calls: string[] = [];
    walkLines(input, (line, ctx) => {
      if (!ctx.inFenced && !ctx.isTableRow) calls.push(line);
    });
    expect(calls).toContain('#### Scenario: y');
    expect(calls).not.toContain('#### Scenario: x');
  });

  it('``` 必须同种 token 收尾(~~~ 不能闭 ```)', () => {
    const input = '```\n#### Scenario: x\n~~~\n#### Scenario: y\n```\n';
    const visited: string[] = [];
    walkLines(input, (line, ctx) => {
      if (!ctx.inFenced) visited.push(line);
    });
    // ``` 直到 line 5 的 ``` 才闭合;line 2-4 全 fenced
    expect(visited).toEqual([]);
  });

  it('table-row 跳过(`|...|` 行)', () => {
    const input = '## Hello\n| col1 | col2 |\n| ---- | ---- |\n| - **WHEN** x | y |\n';
    const skipped: string[] = [];
    walkLines(input, (line, ctx) => {
      if (ctx.isTableRow) skipped.push(line);
    });
    expect(skipped).toHaveLength(3);
  });

  it('不识 indented code(4 空格 / Tab)— known limitation', () => {
    const input = '## Hello\n\n    #### Scenario: x\n\n## After\n';
    const visited: string[] = [];
    walkLines(input, (line, ctx) => {
      if (!ctx.inFenced) visited.push(line);
    });
    // walker 不识 indented code → '    #### Scenario: x' 也会被 visit
    expect(visited).toContain('    #### Scenario: x');
  });

  it('CRLF normalize 为 LF', () => {
    const input = '## Hello\r\n## World\r\n';
    const visited: string[] = [];
    walkLines(input, (line) => visited.push(line));
    expect(visited).toEqual(['## Hello', '## World', '']);
  });
});

describe('splitSectionsAware — fence-aware section 切分', () => {
  it('代码块内 ## 不切 section(C2 修订)', () => {
    const input = '# Title\n```md\n## Fake\n```\n## Real\n';
    const sections = splitSectionsAware(input);
    expect(sections.map((s) => s.heading)).toEqual(['Title', 'Real']);
  });
});
```

- [ ] **Step 2:跑 test 验证 fail**

```bash
pnpm test -- tests/migrate/markdown-aware.test.ts
```

预期:FAIL `Cannot find module markdown-aware.js`。

- [ ] **Step 3:实施 walker + splitSectionsAware**

```ts
// src/core/migrate/markdown-aware.ts
// markdown-aware walker — Plan 8b Task 2.1
// Spec §2.5 v3 边界:只识 fenced(``` 或 ~~~,同种 token 收尾);不识 indented code;UTF-8 + BOM 跳过

export interface LineCtx {
  /** 当前行是否在 fenced code block 内 */
  inFenced: boolean;
  /** 当前行是否是 markdown table row(以 `|` 开头且至少 2 个 `|`) */
  isTableRow: boolean;
}

export type WalkCallback = (line: string, ctx: LineCtx, lineIndex: number) => string | void;

/**
 * 逐行扫描 markdown,识别 fenced + table-row;只在 !inFenced && !isTableRow 行允许 transform。
 * walker 不识 indented code(4 空格 / Tab)— spec §7.1 known limitation。
 *
 * @param content markdown 文本(自动 CRLF normalize)
 * @param cb 每行回调;返 string 则替换该行,返 void 保留原行
 * @returns 处理后的 markdown 文本
 */
export function walkLines(content: string, cb: WalkCallback): string {
  // CRLF normalize
  const normalized = content.replace(/\r\n/g, '\n');
  // BOM 跳过
  const stripped = normalized.charCodeAt(0) === 0xfeff ? normalized.slice(1) : normalized;
  const lines = stripped.split('\n');

  const out: string[] = [];
  let inFenced = false;
  let fenceToken: '```' | '~~~' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    // fence 状态机:同种 token 收尾
    if (!inFenced) {
      if (trimmed.startsWith('```')) {
        inFenced = true;
        fenceToken = '```';
      } else if (trimmed.startsWith('~~~')) {
        inFenced = true;
        fenceToken = '~~~';
      }
    } else {
      // 开 fenced 后,必须同种 token 收尾
      if (fenceToken === '```' && trimmed.startsWith('```')) {
        inFenced = false;
        fenceToken = null;
      } else if (fenceToken === '~~~' && trimmed.startsWith('~~~')) {
        inFenced = false;
        fenceToken = null;
      }
    }

    const isTableRow = trimmed.startsWith('|') && (trimmed.match(/\|/g)?.length ?? 0) >= 2;

    const ctx: LineCtx = { inFenced, isTableRow };
    const replaced = cb(line, ctx, i);
    out.push(typeof replaced === 'string' ? replaced : line);
  }

  return out.join('\n');
}

/** Section 切分(fence-aware) — codex C2:不复用 parse/markdown.ts(其不 fence-aware) */
export interface AwareSection {
  level: number;
  heading: string;
  /** body 不含 heading 行;不去除 fenced 内容 */
  body: string;
  startLine: number;
  endLine: number;
}

export function splitSectionsAware(content: string): AwareSection[] {
  const sections: AwareSection[] = [];
  let current: AwareSection | null = null;
  const buffer: string[] = [];

  walkLines(content, (line, ctx, i) => {
    // 只在 !inFenced 行识别 heading(防代码块内 ## Fake 误切)
    const headingMatch = !ctx.inFenced ? line.match(/^(#{1,6})\s+(.+)$/) : null;
    if (headingMatch) {
      if (current) {
        current.body = buffer.join('\n');
        current.endLine = i;
        sections.push(current);
        buffer.length = 0;
      }
      current = {
        level: headingMatch[1]?.length ?? 1,
        heading: headingMatch[2]?.trim() ?? '',
        body: '',
        startLine: i + 1,
        endLine: -1,
      };
    } else if (current) {
      buffer.push(line);
    }
  });
  if (current) {
    current.body = buffer.join('\n');
    sections.push(current);
  }
  return sections;
}
```

- [ ] **Step 4:跑 test 验证 pass**

```bash
pnpm test -- tests/migrate/markdown-aware.test.ts
```

预期:全 PASS(5 个 walkLines case + 1 个 splitSectionsAware case)。

- [ ] **Step 5:format/lint/typecheck**

```bash
pnpm format:check && pnpm lint && pnpm typecheck
```

- [ ] **Step 6:commit**

```bash
git add src/core/migrate/markdown-aware.ts tests/migrate/markdown-aware.test.ts
git commit -m "$(cat <<'EOF'
feat(migrate): migrate-2.1 markdown-aware walker(fenced state + table-row)

walker 逐行扫描 + LineCtx { inFenced, isTableRow };fenced state 机
要求 ``` / ~~~ 同种 token 收尾;不识 indented code(spec §7.1 known limitation)。
splitSectionsAware:fence-aware section 切分(替代 parse/markdown.ts,
后者不 fence-aware → 代码块内 ## 会误切;codex C2 解)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2.2:`OpenSpecSource.detect`

**Files:**
- Modify: `src/core/migrate/sources/openspec.ts`(从 throw 改为 detect 真实)

**Spec 引用**:§3.1 detect 阶段 — 指定 source 不存在 → exit 2;部分存在(只 specs/ 缺 changes/)→ warn + 当 partial 继续。

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/sources/openspec.test.ts(新文件)
import { describe, it, expect } from 'vitest';
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
```

- [ ] **Step 2:跑 test 验证 fail**

```bash
pnpm test -- tests/migrate/sources/openspec.test.ts -t "detect"
```

预期:FAIL `OpenSpecSource.detect not implemented (plan-8b)`。

- [ ] **Step 3:实施 detect**

```ts
// src/core/migrate/sources/openspec.ts(改 detect 方法)
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// 在 OpenSpecSource class 内,改 detect:
async detect(cwd: string): Promise<DetectResult> {
  const root = join(cwd, 'openspec');
  if (!existsSync(root)) {
    return {
      found: false,
      message: `<cwd>/openspec/ 不存在;预期路径:${root}`,
    };
  }
  return { found: true, rootPath: root };
}
```

- [ ] **Step 4:跑 test 验证 pass**

```bash
pnpm test -- tests/migrate/sources/openspec.test.ts -t "detect"
```

预期:PASS。

- [ ] **Step 5:commit**

```bash
git add src/core/migrate/sources/openspec.ts tests/migrate/sources/openspec.test.ts
git commit -m "feat(migrate): migrate-2.2 OpenSpecSource.detect 实施"
```

---

## Task 2.3:`OpenSpecSource.scan` 枚举源产物

**Files:**
- Modify: `src/core/migrate/sources/openspec.ts`

**Spec 引用**:§2.1 目录映射(specs/changes/explorations/config.yaml)+ §3.1 scan 阶段(yaml parse 失败 warn 跳过、文件读权限失败标 [skip:read-fail]、UTF-8/BOM/non-utf8 探测)。

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/sources/openspec.test.ts(追加)
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
});
```

- [ ] **Step 2:跑 test 验证 fail**

```bash
pnpm test -- tests/migrate/sources/openspec.test.ts -t "scan"
```

- [ ] **Step 3:实施 scan(枚举 specs/changes/explorations/config.yaml + utf8/BOM/non-utf8 探测)**

```ts
// src/core/migrate/sources/openspec.ts(改 scan)
import { readFile, readdir, stat } from 'node:fs/promises';

// helper:UTF-8/BOM/non-utf8 探测(读前 4 byte)
async function detectEncoding(absPath: string): Promise<'utf8' | 'utf8-bom' | 'non-utf8'> {
  const buf = Buffer.alloc(4);
  const fh = await import('node:fs').then((m) => m.promises.open(absPath, 'r'));
  await fh.read(buf, 0, 4, 0);
  await fh.close();
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8-bom';
  if (buf[0] === 0xff && buf[1] === 0xfe) return 'non-utf8'; // UTF-16-LE BOM
  if (buf[0] === 0xfe && buf[1] === 0xff) return 'non-utf8'; // UTF-16-BE BOM
  // 简单启发:含 0x00 字节多半是 UTF-16
  for (const b of buf) if (b === 0x00) return 'non-utf8';
  return 'utf8';
}

// 在 OpenSpecSource class 内
async scan(rootPath: string): Promise<ScanResult> {
  const files: ScannedFile[] = [];

  // 1. specs/<n>/spec.md
  const specsDir = join(rootPath, 'specs');
  if (existsSync(specsDir)) {
    const dirs = await readdir(specsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const specPath = join(specsDir, d.name, 'spec.md');
      if (!existsSync(specPath)) continue;
      const stats = await stat(specPath);
      const encoding = await detectEncoding(specPath);
      files.push({
        absPath: specPath,
        relPath: join('specs', d.name, 'spec.md'),
        kind: 'spec',
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        encoding,
      });
    }
  }

  // 2. changes/<n>/(active 与 archive)
  const changesDir = join(rootPath, 'changes');
  if (existsSync(changesDir)) {
    const entries = await readdir(changesDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const changeName = e.name;
      const isArchive = changeName === 'archive';
      const changeRoot = join(changesDir, changeName);

      if (isArchive) {
        // archive 子目录:再 readdir 一层
        const archiveEntries = await readdir(changeRoot, { withFileTypes: true });
        for (const ae of archiveEntries) {
          if (!ae.isDirectory()) continue;
          await addChangeFiles(join(changeRoot, ae.name), join('changes', 'archive', ae.name), files);
        }
      } else {
        await addChangeFiles(changeRoot, join('changes', changeName), files);
      }
    }
  }

  // 3. explorations/
  const explorationsDir = join(rootPath, 'explorations');
  if (existsSync(explorationsDir)) {
    const entries = await readdir(explorationsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() || !e.name.endsWith('.md')) continue;
      const absPath = join(explorationsDir, e.name);
      const stats = await stat(absPath);
      const encoding = await detectEncoding(absPath);
      files.push({
        absPath,
        relPath: join('explorations', e.name),
        kind: 'draft',
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        encoding,
      });
    }
  }

  // 4. config.yaml
  const configPath = join(rootPath, 'config.yaml');
  if (existsSync(configPath)) {
    const stats = await stat(configPath);
    files.push({
      absPath: configPath,
      relPath: 'config.yaml',
      kind: 'config',
      size: stats.size,
      mtime: stats.mtime.toISOString(),
      encoding: await detectEncoding(configPath),
    });
  }

  return { isEmpty: files.length === 0, files };
}

// helper:把单个 change 目录(proposal.md / tasks.md / design.md / specs/*.md)加入 files[]
async function addChangeFiles(absDir: string, relDir: string, out: ScannedFile[]): Promise<void> {
  const SCALAR_FILES = [
    { name: 'proposal.md', kind: 'proposal' as const },
    { name: 'tasks.md', kind: 'tasks' as const },
    { name: 'design.md', kind: 'design' as const },
  ];
  for (const { name, kind } of SCALAR_FILES) {
    const absPath = join(absDir, name);
    if (!existsSync(absPath)) continue;
    const stats = await stat(absPath);
    out.push({
      absPath,
      relPath: join(relDir, name),
      kind,
      size: stats.size,
      mtime: stats.mtime.toISOString(),
      encoding: await detectEncoding(absPath),
    });
  }
  // specs/<area>.md
  const specsSubDir = join(absDir, 'specs');
  if (existsSync(specsSubDir)) {
    const entries = await readdir(specsSubDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() || !e.name.endsWith('.md')) continue;
      const absPath = join(specsSubDir, e.name);
      const stats = await stat(absPath);
      out.push({
        absPath,
        relPath: join(relDir, 'specs', e.name),
        kind: 'spec',
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        encoding: await detectEncoding(absPath),
      });
    }
  }
}
```

- [ ] **Step 4:跑 test 验证 pass**

```bash
pnpm test -- tests/migrate/sources/openspec.test.ts -t "scan"
```

- [ ] **Step 5:commit**

```bash
git add src/core/migrate/sources/openspec.ts tests/migrate/sources/openspec.test.ts
git commit -m "feat(migrate): migrate-2.3 OpenSpecSource.scan 枚举源产物 + UTF-8 探测"
```

---

## Task 2.4:`OpenSpecSource.classify` 归类 active/archive/draft/spec

**Files:**
- Modify: `src/core/migrate/sources/openspec.ts`

**Spec 引用**:§2.1 + §2.2 落点表;§3.1 classify 阶段(unsafe-slug 命中保留名跳过)。

- [ ] **Step 1:写 fail test(active vs archive 分类)**

```ts
// tests/migrate/sources/openspec.test.ts(追加)
describe('OpenSpecSource.classify', () => {
  it('changes/<n>/ 归 active;changes/archive/<n>/ 归 archive', async () => {
    // 假设 scan 结果如下(简化构造)
    const scan: ScanResult = {
      isEmpty: false,
      files: [
        { absPath: '/x/openspec/changes/add-bar/proposal.md', relPath: 'changes/add-bar/proposal.md', kind: 'proposal', size: 0, mtime: '', encoding: 'utf8' },
        { absPath: '/x/openspec/changes/archive/old/proposal.md', relPath: 'changes/archive/old/proposal.md', kind: 'proposal', size: 0, mtime: '', encoding: 'utf8' },
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
        { absPath: '/x/openspec/changes/.cache/proposal.md', relPath: 'changes/.cache/proposal.md', kind: 'proposal', size: 0, mtime: '', encoding: 'utf8' },
      ],
    };
    const src = new OpenSpecSource();
    const plan = await src.classify(scan, { cwd: '/x', inGitRepo: false });
    expect(plan.skipped).toContainEqual(expect.objectContaining({ reason: expect.stringContaining('unsafe-slug') }));
  });
});
```

- [ ] **Step 2:跑 fail**

```bash
pnpm test -- tests/migrate/sources/openspec.test.ts -t "classify"
```

- [ ] **Step 3:实施 classify**

```ts
// src/core/migrate/sources/openspec.ts(改 classify)
const RESERVED_SLUGS = new Set(['.cache', '.forge-trash', '.forge-ack', 'archive']);

function isUnsafeSlug(slug: string): boolean {
  if (slug === '..' || slug === '.') return true;
  if (RESERVED_SLUGS.has(slug)) return true;
  if (slug.includes('/') || slug.includes('\\')) return true;
  return false;
}

// 在 OpenSpecSource class 内
async classify(scan: ScanResult, _ctx: ClassifyCtx): Promise<ClassificationPlan> {
  const changesMap = new Map<string, PlannedChange>(); // slug → PlannedChange
  const specs: PlannedSpec[] = [];
  const drafts: PlannedDraft[] = [];
  const configFiles: PlannedConfig[] = [];
  const skipped: ClassificationPlan['skipped'] = [];

  for (const f of scan.files) {
    // encoding 检查
    if (f.encoding === 'non-utf8') {
      skipped.push({ source: f.relPath, reason: '[skip:encoding-not-utf8]' });
      continue;
    }

    // spec 顶层(specs/<n>/spec.md)
    if (f.kind === 'spec' && f.relPath.startsWith('specs/')) {
      specs.push({ relPath: f.relPath.replace(/^specs\//, ''), source: f });
      continue;
    }

    // change(active 或 archive)
    if (f.relPath.startsWith('changes/')) {
      const parts = f.relPath.split('/');
      // parts[0]='changes', parts[1]='archive' 或 slug, parts[2]=slug 或 file
      const isArchive = parts[1] === 'archive';
      const slug = isArchive ? parts[2] : parts[1];
      if (!slug) continue;
      if (isUnsafeSlug(slug)) {
        skipped.push({ source: f.relPath, reason: `[unsafe-slug: ${slug}]` });
        continue;
      }
      let change = changesMap.get(slug);
      if (!change) {
        change = {
          slug,
          classification: isArchive ? 'archive' : 'active',
          artifacts: {},
        };
        changesMap.set(slug, change);
      }
      change.artifacts[f.kind] = f;
      continue;
    }

    // draft(explorations/)
    if (f.kind === 'draft') {
      drafts.push({ targetName: f.relPath.replace(/^explorations\//, ''), source: f });
      continue;
    }

    // config.yaml — 由 prepareCopy 时根据 forge/config.yaml 是否存在决定 strategy
    if (f.kind === 'config') {
      configFiles.push({ source: f, strategy: 'fresh', targetName: 'config.yaml' });
      continue;
    }
  }

  return {
    changes: Array.from(changesMap.values()),
    specs,
    drafts,
    configFiles,
    skipped,
  };
}
```

- [ ] **Step 4:跑 pass**

```bash
pnpm test -- tests/migrate/sources/openspec.test.ts -t "classify"
```

- [ ] **Step 5:commit**

```bash
git add src/core/migrate/sources/openspec.ts tests/migrate/sources/openspec.test.ts
git commit -m "feat(migrate): migrate-2.4 OpenSpecSource.classify(active/archive/draft + unsafe-slug)"
```

---

## Task 2.5:`OpenSpecSource.prepareCopy` plan→CopyOp[]

**Files:**
- Modify: `src/core/migrate/sources/openspec.ts`

**Spec 引用**:§2.1 落点表(forge/specs / forge/changes / forge/changes/archive / forge/drafts / config.yaml/.imported)。

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/sources/openspec.test.ts(追加)
describe('OpenSpecSource.prepareCopy', () => {
  it('changes / archive / drafts / specs 各自映射目标路径', () => {
    const plan: ClassificationPlan = {
      changes: [
        {
          slug: 'add-bar',
          classification: 'active',
          artifacts: {
            proposal: { absPath: '/x/openspec/changes/add-bar/proposal.md', relPath: 'changes/add-bar/proposal.md', kind: 'proposal', size: 0, mtime: '', encoding: 'utf8' },
          },
        },
        {
          slug: 'old',
          classification: 'archive',
          artifacts: {
            proposal: { absPath: '/x/openspec/changes/archive/old/proposal.md', relPath: 'changes/archive/old/proposal.md', kind: 'proposal', size: 0, mtime: '', encoding: 'utf8' },
          },
        },
      ],
      specs: [
        {
          relPath: 'foo/spec.md',
          source: { absPath: '/x/openspec/specs/foo/spec.md', relPath: 'specs/foo/spec.md', kind: 'spec', size: 0, mtime: '', encoding: 'utf8' },
        },
      ],
      drafts: [],
      configFiles: [],
      skipped: [],
    };
    const src = new OpenSpecSource();
    const ops = src.prepareCopy(plan, '/y/forge');
    const targets = ops.map((o) => o.target);
    expect(targets).toContain('/y/forge/changes/add-bar/proposal.md');
    expect(targets).toContain('/y/forge/changes/archive/old/proposal.md');
    expect(targets).toContain('/y/forge/specs/foo/spec.md');
  });
});
```

- [ ] **Step 2-4:fail / 实施 / pass**

```ts
// src/core/migrate/sources/openspec.ts(改 prepareCopy)
prepareCopy(plan: ClassificationPlan, target: string): CopyOp[] {
  const ops: CopyOp[] = [];
  // changes
  for (const c of plan.changes) {
    const baseDir = c.classification === 'archive'
      ? join(target, 'changes', 'archive', c.slug)
      : join(target, 'changes', c.slug);
    for (const [kind, f] of Object.entries(c.artifacts)) {
      if (!f) continue;
      const fileName = (kind === 'spec') ? f.relPath.split('/').pop()! : `${kind}.md`;
      const targetPath = (kind === 'spec') ? join(baseDir, 'specs', fileName) : join(baseDir, fileName);
      ops.push({ source: f.absPath, target: targetPath, kind: kind as ArtifactKind, changeSlug: c.slug });
    }
  }
  // specs
  for (const s of plan.specs) {
    ops.push({ source: s.source.absPath, target: join(target, 'specs', s.relPath), kind: 'spec' });
  }
  // drafts
  for (const d of plan.drafts) {
    ops.push({ source: d.source.absPath, target: join(target, 'drafts', d.targetName), kind: 'draft' });
  }
  // config
  for (const cf of plan.configFiles) {
    ops.push({ source: cf.source.absPath, target: join(target, cf.targetName), kind: 'config' });
  }
  return ops;
}
```

- [ ] **Step 5:commit**

```bash
git add src/core/migrate/sources/openspec.ts tests/migrate/sources/openspec.test.ts
git commit -m "feat(migrate): migrate-2.5 OpenSpecSource.prepareCopy(plan→CopyOp[])"
```

---

## Task 2.6:`OpenSpecSource.transform` — spec.md 规则

**Files:**
- Modify: `src/core/migrate/sources/openspec.ts`

**Spec 引用**:§2.5 spec.md 规则表(行 316-330):
- `### Requirement: <name>` → `## Requirement: <name>`(**改名不删除**,反 codex #6)
- `#### Scenario:` → `## Scenario:`
- `- **WHEN/THEN/GIVEN/AND/BUT** <text>` → `**When/Then/...** <text>`(去 list 前缀 + 标题大小写)
- 多行 list 续行合并(2+ 空格缩进且非 `-` 起始)
- 走 walker → 只在 !inFenced && !isTableRow 行执行

- [ ] **Step 1:写 fail test 全规则**

```ts
// tests/migrate/sources/openspec.test.ts(追加)
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
```

- [ ] **Step 2-3:fail / 实施 transform**

```ts
// src/core/migrate/sources/openspec.ts(改 transform)
import { walkLines } from '../markdown-aware.js';

transform(content: string, kind: ArtifactKind): string {
  if (kind === 'spec') return this.transformSpec(content);
  if (kind === 'proposal') return this.transformProposal(content);
  if (kind === 'tasks') return this.transformTasks(content);
  return content; // design / config / draft 不 transform
}

private transformSpec(content: string): string {
  // 第一步:走 walker line replace(### Requirement / #### Scenario / list 前缀)
  const stage1 = walkLines(content, (line, ctx) => {
    if (ctx.inFenced || ctx.isTableRow) return;
    let l = line;
    l = l.replace(/^### Requirement:/, '## Requirement:');
    l = l.replace(/^#### Scenario:/, '## Scenario:');
    // list-prefix WHEN/THEN/GIVEN/AND/BUT
    const m = l.match(/^(\s*)- \*\*(WHEN|THEN|GIVEN|AND|BUT)\*\*\s+(.+)$/i);
    if (m) {
      const [, indent, kw, rest] = m;
      const titleCase = (kw ?? '').charAt(0).toUpperCase() + (kw ?? '').slice(1).toLowerCase();
      l = `${indent ?? ''}**${titleCase}** ${rest}`;
    }
    return l;
  });
  // 第二步:多行续行合并 — 简单走法:identify 形如 `**When** xxx\n  续行` 的两行,合并空格
  const lines = stage1.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i] ?? '';
    const isStep = /^(\s*)\*\*(When|Then|Given|And|But)\*\*\s/.test(cur);
    if (isStep) {
      let merged = cur;
      // 续行:2+ 空格缩进 + 非 `-` 起始 + 非 heading + 非空
      while (i + 1 < lines.length) {
        const next = lines[i + 1] ?? '';
        if (/^\s{2,}[^-#\s]/.test(next) && next.trim().length > 0) {
          merged += ' ' + next.trim();
          i++;
        } else break;
      }
      out.push(merged);
    } else {
      out.push(cur);
    }
  }
  return out.join('\n');
}
```

- [ ] **Step 4-5:跑 pass + commit**

```bash
pnpm test -- tests/migrate/sources/openspec.test.ts -t "spec.md"
git add src/core/migrate/sources/openspec.ts tests/migrate/sources/openspec.test.ts
git commit -m "feat(migrate): migrate-2.6 OpenSpecSource.transform spec.md(H4→H2 / list-prefix / 多行续行)"
```

---

## Task 2.7:`OpenSpecSource.transform` — proposal.md 规则

**Spec 引用**:§2.5 proposal.md(`## Problem` → `## Why`;`## Proposed Solution` → `## What`)。

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/sources/openspec.test.ts(追加)
describe('OpenSpecSource.transform — proposal.md 规则', () => {
  const src = new OpenSpecSource();
  it('Problem → Why; Proposed Solution → What', () => {
    const input = '# Title\n## Problem\nbody\n## Proposed Solution\nsol\n## User Experience\nux\n';
    const out = src.transform(input, 'proposal');
    expect(out).toContain('## Why');
    expect(out).toContain('## What');
    expect(out).toContain('## User Experience'); // 其他章节保留
    expect(out).not.toContain('## Problem');
  });
});
```

- [ ] **Step 2-3:fail / 实施**

```ts
// src/core/migrate/sources/openspec.ts(在 OpenSpecSource class 内加)
private transformProposal(content: string): string {
  return walkLines(content, (line, ctx) => {
    if (ctx.inFenced) return;
    if (line === '## Problem') return '## Why';
    if (line === '## Proposed Solution') return '## What';
  });
}
```

- [ ] **Step 4-5:pass + commit**

```bash
pnpm test -- tests/migrate/sources/openspec.test.ts -t "proposal.md"
git add src/core/migrate/sources/openspec.ts tests/migrate/sources/openspec.test.ts
git commit -m "feat(migrate): migrate-2.7 OpenSpecSource.transform proposal.md(Problem→Why)"
```

---

## Task 2.8:`OpenSpecSource.transform` — tasks.md 三层编号

**Spec 引用**:§2.5 tasks.md 表(`- [ ] N.<text>` / `- [ ] N.M.K.<text>` → `- [ ] task-N: <text>` / `task-N-M-K:`)。

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/sources/openspec.test.ts(追加)
describe('OpenSpecSource.transform — tasks.md 规则', () => {
  const src = new OpenSpecSource();
  it('数字编号 → task-N: / 三层 1.2.3 → task-1-2-3:', () => {
    const input = '- [ ] 1. First\n- [ ] 1.2. Second\n- [ ] 1.2.3. Third\n- [x] 2. Fourth\n';
    const out = src.transform(input, 'tasks');
    expect(out).toContain('- [ ] task-1: First');
    expect(out).toContain('- [ ] task-1-2: Second');
    expect(out).toContain('- [ ] task-1-2-3: Third');
    expect(out).toContain('- [x] task-2: Fourth');
  });

  it('无数字编号的 prose 行 → 不动(后续标 [needs-fix])', () => {
    const input = '- [ ] some prose without number\n';
    const out = src.transform(input, 'tasks');
    expect(out).toContain('- [ ] some prose without number');
    expect(out).not.toContain('task-');
  });
});
```

- [ ] **Step 2-3:fail / 实施**

```ts
// src/core/migrate/sources/openspec.ts(加)
private transformTasks(content: string): string {
  return walkLines(content, (line, ctx) => {
    if (ctx.inFenced || ctx.isTableRow) return;
    const m = line.match(/^(\s*)- \[([ x])\] (\d+(?:\.\d+){0,2})\.\s+(.+)$/);
    if (!m) return;
    const [, indent, checked, num, rest] = m;
    const taskId = `task-${(num ?? '').replace(/\./g, '-')}`;
    return `${indent ?? ''}- [${checked ?? ' '}] ${taskId}: ${rest ?? ''}`;
  });
}
```

- [ ] **Step 4-5:pass + commit**

---

## Task 2.9:OpenSpec config.yaml 合并策略

**Files:**
- Modify: `src/core/migrate/sources/openspec.ts`(prepareCopy 增强)

**Spec 引用**:§2.3 config.yaml 合并(forge/config.yaml 不存在 → cp + 加 import 注释;存在 → 写到 config.yaml.imported,再撞则 .imported-N)。

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/sources/openspec.test.ts(追加)
describe('OpenSpecSource config.yaml 合并', () => {
  it('forge/config.yaml 不存在 → fresh + 加注释头', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-cfg-'));
    // 此处单元测仅测 prepareCopy 输出 strategy 与 targetName;实际写入测在集成测
    // ...(具体实现见集成测 Task 2.11)
  });

  it('forge/config.yaml.imported 已存在 → strategy=imported targetName=config.yaml.imported-2', async () => {
    // 同上,集成测覆盖
  });
});
```

- [ ] **Step 2-3:fail / 实施(改 classify 让 config 决定 strategy 需要 cwd 上下文,实施在 prepareCopy 阶段拿 forge/ 状态)**

> 注:由于 prepareCopy 接口当前不接受 forge/ 现状,实施 plan 是**在 runMigrate 主流程在 cp 之前**对每个 ConfigOp 检查 forge/config.yaml.imported* 是否已存在,递增 .imported-N(P4 Task 4.1 的 conflict 全锁定逻辑统一处理)。本 task 仅在 source 层留 strategy='fresh' 默认。

- [ ] **Step 4-5:commit**

```bash
git commit -m "feat(migrate): migrate-2.9 config.yaml 合并 — strategy 默认 fresh,.imported-N 由 P4 conflict 处理"
```

---

## Task 2.10:`OpenSpecSource.listMissingArtifacts`

**Files:**
- Modify: `src/core/migrate/sources/openspec.ts`

**Spec 引用**:§2.8 触发件 — OpenSpec 仅 transform 后 validate 失败时触发;本 task 实施"列缺件"。

- [ ] **Step 1-3**(纯函数):

```ts
// src/core/migrate/sources/openspec.ts
listMissingArtifacts(plan: ClassificationPlan): MissingArtifact[] {
  const missing: MissingArtifact[] = [];
  for (const c of plan.changes) {
    if (!c.artifacts.proposal) {
      missing.push({
        changeSlug: c.slug,
        kind: 'proposal',
        targetPath: `forge/changes/${c.classification === 'archive' ? 'archive/' : ''}${c.slug}/proposal.md`,
        factsSource: 'self',
      });
    }
    if (!c.artifacts.spec) {
      missing.push({
        changeSlug: c.slug,
        kind: 'specs',
        targetPath: `forge/changes/${c.classification === 'archive' ? 'archive/' : ''}${c.slug}/specs/${c.slug}.md`,
        factsSource: 'self',
      });
    }
  }
  return missing;
}
```

- [ ] **Step 4-5:commit**

---

## Task 2.11:fixture + 集成测

**Files:**
- Create: `tests/fixtures/migrate/openspec-minimal/openspec/...`(详 master plan File Structure)
- Create: `tests/migrate/openspec.test.ts`

**Spec 引用**:§4.2 fixture 树 + §4.3 OpenSpec 集成测断言点(archive 件全 [ok] / 代码块内 #### Scenario 字串保留 / 多行 WHEN 续行合并 / 三层编号)。

- [ ] **Step 1:建 fixture 文件树**

```bash
mkdir -p tests/fixtures/migrate/openspec-minimal/openspec/{specs/{foo,bar,baz},changes/{add-bar,three-level,archive/old-baz/specs},explorations}
```

每个文件内容(摘要,完整内容由实施期填):
- `specs/foo/spec.md`:H4 Scenario + list-prefix(基础)
- `specs/bar/spec.md`:含代码块内 `#### Scenario` 示例
- `specs/baz/spec.md`:`### Requirement` 含 Description + 多行 WHEN 续行
- `changes/add-bar/{proposal.md,tasks.md,design.md}`:Problem/Solution + 数字编号 task
- `changes/three-level/tasks.md`:三层编号 1.2.3.
- `changes/archive/old-baz/{proposal.md,tasks.md,design.md,specs/x.md}`
- `explorations/idea-x.md`
- `config.yaml`:`schema: spec-driven`

- [ ] **Step 2:写 fail integration test**

```ts
// tests/migrate/openspec.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrate } from '../../src/core/migrate/index.js';

describe('forge migrate openspec — 集成测(--no-regenerate)', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'forge-migrate-os-'));
    // cp fixture 到 tmp
    await cp(
      join(__dirname, '../fixtures/migrate/openspec-minimal'),
      tmp,
      { recursive: true },
    );
    process.chdir(tmp);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('--dry-run 不写 forge/', async () => {
    const code = await runMigrate({ source: 'openspec', dryRun: true });
    expect(code).toBe(0);
    // forge/ 不应存在(只 .cache 等 bootstrap)
    // ... 具体断言由 P4 report 接入后完善
  });

  it('--no-regenerate 实跑后 forge/ 树就位 + transformer 应用 + archive 不残', async () => {
    const code = await runMigrate({ source: 'openspec', noRegenerate: true });
    expect(code).toBe(0);
    // 1. forge/specs/foo/spec.md 含 ## Scenario(transform 后)
    const fooSpec = await readFile(join(tmp, 'forge/specs/foo/spec.md'), 'utf8');
    expect(fooSpec).toContain('## Scenario:');
    expect(fooSpec).not.toContain('#### Scenario:');
    // 2. forge/specs/bar/spec.md 代码块内 #### Scenario 字串保留
    const barSpec = await readFile(join(tmp, 'forge/specs/bar/spec.md'), 'utf8');
    expect(barSpec).toContain('#### Scenario: example'); // fenced 内不动
    // 3. forge/changes/add-bar/proposal.md 含 ## Why / ## What
    const proposal = await readFile(join(tmp, 'forge/changes/add-bar/proposal.md'), 'utf8');
    expect(proposal).toContain('## Why');
    expect(proposal).toContain('## What');
    // 4. forge/changes/three-level/tasks.md 三层 task-1-2-3:
    const tasks = await readFile(join(tmp, 'forge/changes/three-level/tasks.md'), 'utf8');
    expect(tasks).toMatch(/task-1-2-3:/);
    // 5. forge/changes/archive/old-baz/ 在 archive 子目录
    expect(await readFile(join(tmp, 'forge/changes/archive/old-baz/proposal.md'), 'utf8')).toBeTruthy();
    // 6. forge/drafts/idea-x.md 存在
    expect(await readFile(join(tmp, 'forge/drafts/idea-x.md'), 'utf8')).toBeTruthy();
  });
});
```

- [ ] **Step 3:跑 fail**(预期 P4 cp 路径还没实施 → runMigrate 抛 'not implemented (plan-8d)')

```bash
pnpm test -- tests/migrate/openspec.test.ts
```

预期:大部分 case FAIL(等 P4)。**dry-run case 应已 PASS**(P1 Task 1.6 已支持)。

- [ ] **Step 4:commit fixture + 集成测(期望 fail,跨 phase 推动)**

```bash
git add tests/fixtures/migrate/openspec-minimal tests/migrate/openspec.test.ts
git commit -m "$(cat <<'EOF'
test(migrate): migrate-2.11 OpenSpec fixture + 集成测占位

集成测期望大部分 case FAIL — 等 P4(plan-8d)conflict + cp + report 实施完。
dry-run case 应在本 commit 后 PASS。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2.12:dry-run 端到端手测

**Files:** 无新文件

- [ ] **Step 1:在 fixture 上跑 dry-run**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm build
cd /tmp && mkdir -p test-os-migrate && cd test-os-migrate
cp -r D:/ClaudeProject/opsp/forge-repo/tests/fixtures/migrate/openspec-minimal/openspec .
node D:/ClaudeProject/opsp/forge-repo/dist/cli/index.js migrate openspec --dry-run
```

预期 stdout 含 `source=openspec, scanned 8+ files`。

- [ ] **Step 2:跑全量 verification(P2 完成)**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test -- tests/migrate/
```

预期:除 P4 待实施的集成测外全 PASS(markdown-aware + sources/openspec 单元测全绿)。

- [ ] **Step 3:commit P2 完成里程碑**

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(migrate): P2 OpenSpecSource 完成里程碑(里程碑 M2 待 P4 cp 路径)

OpenSpecSource detect / scan / classify / prepareCopy / transform 全实施;
markdown-aware walker 单元测 PASS;集成测占位等 P4。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Plan 8b Self-Review

- [ ] markdown-aware.ts walker 含 fenced state(同种 token 收尾)+ table-row 检测;splitSectionsAware fence-aware
- [ ] OpenSpecSource detect / scan / classify / prepareCopy / transform / listMissingArtifacts 全实施(无 throw)
- [ ] transform 三套规则(spec / proposal / tasks)单元测全 PASS
- [ ] 多行 WHEN 续行合并测通(spec §2.5 codex #7)
- [ ] `### Requirement` 改名不删除(spec §2.5 codex #6)
- [ ] 三层编号 `1.2.3` → `task-1-2-3` 测通
- [ ] fixture openspec-minimal/ 6 个反例覆盖(代码块、表格、Description、多行续行、三层、archive)
- [ ] unsafe-slug 检查覆盖 `..` / `.` / 保留名 + skipped 数组
- [ ] UTF-8 BOM / non-utf8 探测 + skip:encoding 标记

P2 完成,P4(plan-8d)接 cp 路径后 P2 集成测可 PASS,M2 里程碑达成。
