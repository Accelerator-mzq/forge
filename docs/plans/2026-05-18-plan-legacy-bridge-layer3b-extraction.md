# Legacy-bridge Layer 3b 需求抽取 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 forge 加第六个 `legacy-bridge` 子命令 `extract` —— 从老文档(SRS/PRD + `BACKLOG.md`/`TODO.md` 等)抽取需求条目、LLM 判实现状态,经用户审落成 `forge/legacy-requirements.yaml`,并接成 backlog registry 的第二数据源。

**Architecture:** 复用 Spec A 的 `LlmTask`/`TaskManifest`/双 runner。新增两个 core 模块(`legacy-requirements.ts` 管 schema/load/finalize,`extractor.ts` 管发现/抽取/prep/apply/增量 diff),`legacy-bridge.ts` 加 `extract` 四分支子命令(emit/`--apply`/`--api`/`--finalize`),`backlog/{index,render}.ts` 扩成双源。聚合层 `aggregator.ts` 不动。

**Tech Stack:** TypeScript(ESM,`.js` import 后缀)、commander、vitest、pnpm、`mammoth`(docx)、`pdf-parse`(pdf)。

**权威 spec:** `docs/specs/2026-05-18-legacy-bridge-layer3b-extraction-design.md`(经 Codex 8 轮对抗性审查收敛,0 HIGH 0 MEDIUM)。本计划实现该 spec,下文 §N 均指 spec 章节。

**通用约定:**

- 所有 commit message 末尾加一行:`Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`。
- 单测试文件跑法:`pnpm vitest run <path>`;按名:`pnpm vitest run <path> -t "<子串>"`。
- 改 `skills/*` 后**必须** `pnpm build`(双源 md5 sync,见仓库 `CLAUDE.md` 约束 1),改完跑 `pnpm format:check`。
- `dist/` / `dist-bundled/` 是 gitignored 构建产物 —— 任何 commit 都不要 `git add dist/`。`src/core/templates/` 进 git。
- 代码注释用中文(仓库 `CLAUDE.md` 要求)。
- push 前本地至少跑过 CI 五步:`pnpm lint` → `pnpm format:check` → `pnpm typecheck` → `pnpm build` → `pnpm test`。
- TS 测试文件 import 用相对路径 + `.js` 后缀(如 `../../../src/core/legacy-bridge/extractor.js`)。

---

## File Structure

| 文件 | 责任 | 任务 |
| --- | --- | --- |
| `src/core/legacy-bridge/legacy-requirements.ts`(新) | `forge-legacy-requirements/v1` schema 类型 + 校验 + `loadLegacyRequirements` + `finalizeLegacyRequirements`(ID 分配/合并) | A1, A2 |
| `src/core/legacy-bridge/extractor.ts`(新) | whole-repo 发现 + 文本抽取 + `buildExtractTask` + `applyExtractResult` + 增量 diff + draft 渲染 | B2, B3, B4, C1, C2, C3 |
| `src/core/legacy-bridge/llm-task.ts`(改) | `LlmOp` 联合类型加 `extract` | D1 |
| `src/cli/commands/legacy-bridge.ts`(改) | `runExtractCommand` 四分支 + 注册 `extract` 子命令 | D2 |
| `src/core/backlog/index.ts`(改) | `buildBacklog` 双源 + 空 archive 容错 + superseding 分流 | E1, E2 |
| `src/core/backlog/render.ts`(改) | Legacy Requirements 段 / Retired 段 / 新 `BacklogWarning` kind / winner helper | E2, E3 |
| `src/core/backlog/assets/backlog-readme.md`(改) | 文档化第二数据源 | F2 |
| `skills/legacy-bridge-fulfillment/SKILL.md`(改) | 加 `extract` op fulfill 契约 + 反偷懒约束 | F1 |
| `docs/legacy-bridge.md` / `docs/cli-reference.md` / `CHANGELOG.md`(改) | 文档化 Layer 3b | F2 |
| `package.json`(改) | 加 `mammoth` + `pdf-parse` 依赖 | B1 |

任务依赖顺序:A1 → A2;B1 → B2 → B3;**D1 必须先于 B4**(B4 的代码用到 `op: 'extract'`,该值在 D1 才加入 `LlmOp`,顺序反了会编译失败);B4 → C1 → C2 → C3;D2 依赖 A / C / D1;E1 → E2 → E3(依赖 A1);F1、F2 独立。**建议执行顺序:A1 A2 → B1 B2 B3 → D1 → B4 → C1 C2 C3 → D2 → E1 E2 E3 → F1 F2。**(注意:D1 提前到 B4 之前,不按 Phase 字母顺序。)

---

## Phase A:legacy-requirements 模块

### Task A1:schema 类型 + 校验 + `loadLegacyRequirements`

**Files:**
- Create: `src/core/legacy-bridge/legacy-requirements.ts`
- Test: `tests/core/legacy-bridge/legacy-requirements.test.ts`

实现 spec §3 的 `forge-legacy-requirements/v1` schema。

- [ ] **Step 1:写失败测试**

```typescript
// tests/core/legacy-bridge/legacy-requirements.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadLegacyRequirements,
  validateLegacyRequirementsFile,
} from '../../../src/core/legacy-bridge/legacy-requirements.js';

async function tmpForge(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'lr-'));
  const forge = join(root, 'forge');
  await mkdir(forge, { recursive: true });
  return forge;
}

describe('loadLegacyRequirements', () => {
  it('文件不存在 → 返回 null', async () => {
    const forge = await tmpForge();
    expect(await loadLegacyRequirements(forge)).toBeNull();
  });

  it('读出合法 yaml', async () => {
    const forge = await tmpForge();
    await writeFile(
      join(forge, 'legacy-requirements.yaml'),
      `schema: forge-legacy-requirements/v1
requirements:
  - id: LR-0001
    title: 登录支持 2FA
    description: 系统应支持双因素认证
    status: unimplemented
    source: { document: docs/SRS.md, section: "3.2.1", kind: srs }
    evidence: []
    confidence: medium
    priority: high
    review: confirmed
    notes: ""
`,
      'utf8',
    );
    const file = await loadLegacyRequirements(forge);
    expect(file?.requirements[0]?.id).toBe('LR-0001');
    expect(file?.requirements[0]?.source.section).toBe('3.2.1');
  });
});

describe('validateLegacyRequirementsFile', () => {
  it('schema 字段错 → 抛错', () => {
    expect(() => validateLegacyRequirementsFile({ schema: 'wrong', requirements: [] })).toThrow(
      /schema/,
    );
  });

  it('status 越界 → 抛错', () => {
    const bad = {
      schema: 'forge-legacy-requirements/v1',
      requirements: [
        {
          id: 'LR-0001',
          title: 't',
          description: 'd',
          status: 'done',
          source: { document: 'a', section: '', kind: 'srs' },
          evidence: [],
          confidence: 'high',
          priority: null,
          review: 'pending',
          notes: '',
        },
      ],
    };
    expect(() => validateLegacyRequirementsFile(bad)).toThrow(/status/);
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/legacy-requirements.test.ts`
Expected: FAIL —— `legacy-requirements.js` 不存在 / 导出未定义。

- [ ] **Step 3:写实现**

```typescript
// src/core/legacy-bridge/legacy-requirements.ts
// Layer 3b:forge-legacy-requirements/v1 schema + load + finalize(spec §3 / §6.2)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** 需求实现状态(spec §3,D1 二值) */
export type LegacyRequirementStatus = 'implemented' | 'unimplemented';
/** 审核态(spec §3) */
export type LegacyRequirementReview = 'pending' | 'confirmed';
/** 来源类别(spec §3,D3) */
export type LegacyRequirementKind = 'srs' | 'backlog-file' | 'issue-export';
/** LLM 判定置信度 */
export type LegacyRequirementConfidence = 'high' | 'medium' | 'low';
/** 优先级(用户填) */
export type LegacyRequirementPriority = 'critical' | 'high' | 'medium' | 'low' | null;

const STATUS_VALUES = new Set<string>(['implemented', 'unimplemented']);
const REVIEW_VALUES = new Set<string>(['pending', 'confirmed']);
const KIND_VALUES = new Set<string>(['srs', 'backlog-file', 'issue-export']);
const CONFIDENCE_VALUES = new Set<string>(['high', 'medium', 'low']);
const PRIORITY_VALUES = new Set<string>(['critical', 'high', 'medium', 'low']);

/** 来源定位 */
export interface LegacyRequirementSource {
  /** 来源文件,相对仓库根 */
  document: string;
  /** 章节锚 / 标题;无则空字符串 */
  section: string;
  kind: LegacyRequirementKind;
}

/** 单条 legacy requirement(legacy-requirements.yaml#requirements[]) */
export interface LegacyRequirement {
  /** 稳定 ID 'LR-NNNN';draft 里新条目为空字符串 */
  id: string;
  title: string;
  description: string;
  status: LegacyRequirementStatus;
  source: LegacyRequirementSource;
  /** implemented 的代码依据;unimplemented 时为空数组 */
  evidence: string[];
  confidence: LegacyRequirementConfidence;
  priority: LegacyRequirementPriority;
  review: LegacyRequirementReview;
  notes: string;
}

/** legacy-requirements.yaml 顶层结构 */
export interface LegacyRequirementsFile {
  schema: 'forge-legacy-requirements/v1';
  requirements: LegacyRequirement[];
}

/** 文件名常量(确认产物 + draft 态) */
export const LEGACY_REQUIREMENTS_FILE = 'legacy-requirements.yaml';
export const LEGACY_REQUIREMENTS_DRAFT_FILE = 'legacy-requirements-draft.yaml';
export const LEGACY_REQUIREMENTS_DRAFT_MD = 'legacy-requirements-draft.md';

/** 校验任意对象是否合法 LegacyRequirementsFile;非法即抛错 */
export function validateLegacyRequirementsFile(obj: unknown): LegacyRequirementsFile {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('legacy-requirements:顶层不是对象');
  }
  const o = obj as Record<string, unknown>;
  if (o.schema !== 'forge-legacy-requirements/v1') {
    throw new Error(`legacy-requirements:schema 字段须为 forge-legacy-requirements/v1,实得 ${String(o.schema)}`);
  }
  if (!Array.isArray(o.requirements)) {
    throw new Error('legacy-requirements:requirements 须为数组');
  }
  o.requirements.forEach((r, i) => validateRequirement(r, i));
  return obj as LegacyRequirementsFile;
}

/** 校验单条 requirement;非法即抛错(i 用于错误定位) */
function validateRequirement(r: unknown, i: number): void {
  if (typeof r !== 'object' || r === null) throw new Error(`requirement[${i}]:不是对象`);
  const o = r as Record<string, unknown>;
  const at = `requirement[${i}]`;
  if (typeof o.id !== 'string') throw new Error(`${at}.id 须为字符串(新条目用空串)`);
  if (typeof o.title !== 'string' || o.title === '') throw new Error(`${at}.title 须为非空字符串`);
  if (typeof o.description !== 'string') throw new Error(`${at}.description 须为字符串`);
  if (!STATUS_VALUES.has(o.status as string)) throw new Error(`${at}.status 越界:${String(o.status)}`);
  if (!REVIEW_VALUES.has(o.review as string)) throw new Error(`${at}.review 越界:${String(o.review)}`);
  if (!CONFIDENCE_VALUES.has(o.confidence as string)) {
    throw new Error(`${at}.confidence 越界:${String(o.confidence)}`);
  }
  if (o.priority !== null && !PRIORITY_VALUES.has(o.priority as string)) {
    throw new Error(`${at}.priority 越界:${String(o.priority)}`);
  }
  if (!Array.isArray(o.evidence) || !o.evidence.every((x) => typeof x === 'string')) {
    throw new Error(`${at}.evidence 须为 string[]`);
  }
  if (typeof o.notes !== 'string') throw new Error(`${at}.notes 须为字符串`);
  const src = o.source as Record<string, unknown> | undefined;
  if (typeof src !== 'object' || src === null) throw new Error(`${at}.source 须为对象`);
  if (typeof src.document !== 'string') throw new Error(`${at}.source.document 须为字符串`);
  if (typeof src.section !== 'string') throw new Error(`${at}.source.section 须为字符串(无则空串)`);
  if (!KIND_VALUES.has(src.kind as string)) throw new Error(`${at}.source.kind 越界:${String(src.kind)}`);
}

/** 读 forge/legacy-requirements.yaml;文件不存在返回 null;损坏或非法 schema 抛错 */
export async function loadLegacyRequirements(
  forgeRoot: string,
): Promise<LegacyRequirementsFile | null> {
  const path = join(forgeRoot, LEGACY_REQUIREMENTS_FILE);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`legacy-requirements.yaml 解析失败:${(err as Error).message}`);
  }
  return validateLegacyRequirementsFile(parsed);
}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/legacy-requirements.test.ts`
Expected: PASS(4 个用例)。

- [ ] **Step 5:Commit**

```bash
git add src/core/legacy-bridge/legacy-requirements.ts tests/core/legacy-bridge/legacy-requirements.test.ts
git commit -m "feat(legacy-bridge): legacy-requirements schema + loadLegacyRequirements"
```

---

### Task A2:`finalizeLegacyRequirements` —— ID 分配 + 合并

**Files:**
- Modify: `src/core/legacy-bridge/legacy-requirements.ts`
- Test: `tests/core/legacy-bridge/legacy-requirements.test.ts`

实现 spec §6.2 的 `--finalize`:读 draft → 校验 → 给空 `id` 按 `max(LR-NNNN)+1` 分配 → 整表 `review` 置 `confirmed`。本任务只写纯函数 `finalizeLegacyRequirements`(读盘/写盘在 D2)。

- [ ] **Step 1:写失败测试**

```typescript
// 追加到 tests/core/legacy-bridge/legacy-requirements.test.ts
import { finalizeLegacyRequirements } from '../../../src/core/legacy-bridge/legacy-requirements.js';
import type { LegacyRequirement } from '../../../src/core/legacy-bridge/legacy-requirements.js';

function req(partial: Partial<LegacyRequirement>): LegacyRequirement {
  return {
    id: '',
    title: 't',
    description: 'd',
    status: 'unimplemented',
    source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
    evidence: [],
    confidence: 'medium',
    priority: null,
    review: 'pending',
    notes: '',
    ...partial,
  };
}

describe('finalizeLegacyRequirements', () => {
  it('空 id 按 max(既有 LR-NNNN)+1 顺序分配,4 位零填充', () => {
    const draft = [
      req({ id: 'LR-0007', title: '已有' }),
      req({ id: '', title: '新1' }),
      req({ id: '', title: '新2' }),
    ];
    const out = finalizeLegacyRequirements(draft);
    expect(out.requirements.map((r) => r.id)).toEqual(['LR-0007', 'LR-0008', 'LR-0009']);
  });

  it('整表 review 置 confirmed', () => {
    const out = finalizeLegacyRequirements([req({ id: 'LR-0001', review: 'pending' })]);
    expect(out.requirements[0]?.review).toBe('confirmed');
  });

  it('无既有 ID 时从 LR-0001 起', () => {
    const out = finalizeLegacyRequirements([req({}), req({})]);
    expect(out.requirements.map((r) => r.id)).toEqual(['LR-0001', 'LR-0002']);
  });

  it('幂等:对已 finalize 的结果再 finalize,ID 不变', () => {
    const once = finalizeLegacyRequirements([req({}), req({ id: 'LR-0003' })]);
    const twice = finalizeLegacyRequirements(once.requirements);
    expect(twice.requirements.map((r) => r.id)).toEqual(once.requirements.map((r) => r.id));
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/legacy-requirements.test.ts -t finalizeLegacyRequirements`
Expected: FAIL —— `finalizeLegacyRequirements` 未定义。

- [ ] **Step 3:写实现(追加到 `legacy-requirements.ts`)**

```typescript
/** 从 'LR-0042' 取数字 42;非法格式返回 0 */
function parseLrNumber(id: string): number {
  const m = /^LR-(\d{4,})$/.exec(id);
  return m ? Number(m[1]) : 0;
}

/** 'LR-' + 4 位零填充 */
function formatLrId(n: number): string {
  return `LR-${String(n).padStart(4, '0')}`;
}

/**
 * --finalize 纯逻辑(spec §6.2):
 * 给 id 为空的条目按 max(既有所有 LR-NNNN)+1 顺序分配;整表 review 置 confirmed。
 * 不读盘/不写盘 —— 调用方(CLI)负责 IO。
 */
export function finalizeLegacyRequirements(draft: LegacyRequirement[]): LegacyRequirementsFile {
  let maxNum = 0;
  for (const r of draft) {
    if (r.id !== '') maxNum = Math.max(maxNum, parseLrNumber(r.id));
  }
  const requirements = draft.map((r) => ({
    ...r,
    id: r.id === '' ? formatLrId(++maxNum) : r.id,
    review: 'confirmed' as LegacyRequirementReview,
  }));
  return { schema: 'forge-legacy-requirements/v1', requirements };
}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/legacy-requirements.test.ts`
Expected: PASS(全部用例)。

- [ ] **Step 5:Commit**

```bash
git add src/core/legacy-bridge/legacy-requirements.ts tests/core/legacy-bridge/legacy-requirements.test.ts
git commit -m "feat(legacy-bridge): finalizeLegacyRequirements —— ID 分配 + 合并"
```

---

## Phase B:extractor —— 发现 + 文本抽取 + prep

### Task B1:加 `mammoth` + `pdf-parse` 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1:装依赖**

Run:
```bash
pnpm add mammoth pdf-parse
pnpm add -D @types/pdf-parse
```
（`mammoth` 自带类型;`pdf-parse` 需 `@types/pdf-parse`。两者均纯 JS、无原生编译依赖,满足 spec §13 第 2 项的双平台 CI 要求。）

- [ ] **Step 2:确认 `package.json` 已加 dependencies**

Run: `pnpm typecheck`
Expected: PASS(无新增类型错误)。

- [ ] **Step 3:Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(legacy-bridge): 加 mammoth + pdf-parse(Layer 3b .docx/.pdf 读取)"
```

---

### Task B2:whole-repo 发现 `discoverSources`

**Files:**
- Create: `src/core/legacy-bridge/extractor.ts`
- Test: `tests/core/legacy-bridge/extractor.test.ts`

实现 spec §5.1:whole-repo 扫描,识别需求文档 / backlog 文件;排除 `node_modules`/`.git`/`dist` 等。

- [ ] **Step 1:写失败测试**

```typescript
// tests/core/legacy-bridge/extractor.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSources } from '../../../src/core/legacy-bridge/extractor.js';

async function tmpRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'extract-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return root;
}

describe('discoverSources', () => {
  it('识别需求文档(SRS 命名)与 backlog 文件,排除 node_modules', async () => {
    const root = await tmpRepo({
      'docs/SRS.md': '# 需求规格',
      'TODO.md': '- 待办一',
      'node_modules/pkg/SRS.md': 'noise',
      'src/app.ts': 'code',
      'README.md': '# 项目',
    });
    const found = await discoverSources(root);
    const paths = found.map((s) => s.path).sort();
    expect(paths).toContain('docs/SRS.md');
    expect(paths).toContain('TODO.md');
    expect(paths).not.toContain('node_modules/pkg/SRS.md');
    // README.md 不匹配需求/backlog 命名 → 不纳入
    expect(paths).not.toContain('README.md');
  });

  it('source.kind 标注正确', async () => {
    const root = await tmpRepo({ 'docs/SRS.md': 'x', 'BACKLOG.md': 'y' });
    const found = await discoverSources(root);
    expect(found.find((s) => s.path === 'docs/SRS.md')?.kind).toBe('srs');
    expect(found.find((s) => s.path === 'BACKLOG.md')?.kind).toBe('backlog-file');
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts`
Expected: FAIL —— `extractor.js` 不存在。

- [ ] **Step 3:写实现**

```typescript
// src/core/legacy-bridge/extractor.ts
// Layer 3b:whole-repo 发现 + 文本抽取 + prep + apply + 增量 diff(spec §4/§5/§6)
import { readdir, stat } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';
import type { LegacyRequirementKind } from './legacy-requirements.js';

/** 发现时跳过的目录(沿 mapper.ts 的 SKIP_DIRS 约定 + spec §5.1) */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-bundled', 'build', 'forge', '.cache']);

/** 可读取的文档扩展名(spec §5.1 / §5.2) */
const DOC_EXTS = new Set(['.md', '.txt', '.docx', '.pdf', '.xlsx']);

/** 需求文档文件名匹配模式(不分大小写) */
const REQUIREMENT_NAME_RE = /(srs|prd|requirement|需求|规格|spec)/i;
/** backlog 文件名匹配模式 */
const BACKLOG_NAME_RE = /^(backlog|todo|roadmap)\b/i;
/** issue 导出文件名匹配模式 */
const ISSUE_NAME_RE = /issue/i;

/** 一个被发现的来源文件 */
export interface DiscoveredSource {
  /** 相对仓库根的路径 */
  path: string;
  kind: LegacyRequirementKind;
  /** 小写扩展名,如 '.md' */
  ext: string;
}

/** 递归扫目录,产相对 baseRoot 的文件路径 */
async function* walk(dir: string, baseRoot: string): AsyncGenerator<string> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) yield* walk(full, baseRoot);
    else if (s.isFile()) yield relative(baseRoot, full).split('\\').join('/');
  }
}

/** 据文件名判 kind;不属需求/backlog 任何一类返回 null(不纳入发现) */
function classifyKind(relPath: string): LegacyRequirementKind | null {
  const name = basename(relPath);
  if (ISSUE_NAME_RE.test(name)) return 'issue-export';
  if (BACKLOG_NAME_RE.test(name)) return 'backlog-file';
  if (REQUIREMENT_NAME_RE.test(name)) return 'srs';
  return null;
}

/**
 * whole-repo 发现(spec §5.1):扫整个仓库,识别需求文档 / backlog 文件。
 * 排除 SKIP_DIRS;只收 DOC_EXTS 扩展名;按文件名 classifyKind。
 */
export async function discoverSources(repoRoot: string): Promise<DiscoveredSource[]> {
  const out: DiscoveredSource[] = [];
  for await (const rel of walk(repoRoot, repoRoot)) {
    const ext = extname(rel).toLowerCase();
    if (!DOC_EXTS.has(ext)) continue;
    const kind = classifyKind(rel);
    if (kind === null) continue;
    out.push({ path: rel, kind, ext });
  }
  // 排序:跨平台确定,便于测试与 manifest 稳定
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts`
Expected: PASS。

- [ ] **Step 5:Commit**

```bash
git add src/core/legacy-bridge/extractor.ts tests/core/legacy-bridge/extractor.test.ts
git commit -m "feat(legacy-bridge): extractor.discoverSources —— whole-repo 发现"
```

---

### Task B3:文本抽取 `extractText`

**Files:**
- Modify: `src/core/legacy-bridge/extractor.ts`
- Test: `tests/core/legacy-bridge/extractor.test.ts`

实现 spec §4.1 第 2 步 / §5.2:按扩展名分派抽纯文本 —— `.md`/`.txt` 直读,`.xlsx` 复用 `excel.ts`,`.docx` 用 `mammoth`,`.pdf` 用 `pdf-parse`。

- [ ] **Step 1:写失败测试**

```typescript
// 追加到 tests/core/legacy-bridge/extractor.test.ts
import { extractText } from '../../../src/core/legacy-bridge/extractor.js';

describe('extractText', () => {
  it('.md 直读', async () => {
    const root = await tmpRepo({ 'docs/SRS.md': '# 需求\n第一条' });
    expect(await extractText(root, 'docs/SRS.md')).toContain('第一条');
  });

  it('.txt 直读', async () => {
    const root = await tmpRepo({ 'TODO.txt': '待办内容' });
    expect(await extractText(root, 'TODO.txt')).toContain('待办内容');
  });

  it('读取失败 → 抛带路径的错误', async () => {
    const root = await tmpRepo({});
    await expect(extractText(root, 'missing.md')).rejects.toThrow(/missing\.md/);
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts -t extractText`
Expected: FAIL —— `extractText` 未定义。

- [ ] **Step 3:写实现(追加到 `extractor.ts`)**

```typescript
import { readFile } from 'node:fs/promises';
import { parseWorkbook, sheetToMarkdown } from './excel.js';

/**
 * 按扩展名抽纯文本(spec §5.2)。
 * .md/.txt 直读;.xlsx 复用 excel.ts;.docx 用 mammoth;.pdf 用 pdf-parse。
 * 读取/解析失败抛带路径的错误。
 */
export async function extractText(repoRoot: string, relPath: string): Promise<string> {
  const full = join(repoRoot, relPath);
  const ext = extname(relPath).toLowerCase();
  try {
    if (ext === '.md' || ext === '.txt') {
      return await readFile(full, 'utf8');
    }
    if (ext === '.xlsx') {
      const wb = await parseWorkbook(full);
      return wb.sheets.map((s) => sheetToMarkdown(s)).join('\n\n');
    }
    if (ext === '.docx') {
      // mammoth 动态 import:仅 .docx 路径需要,避免无谓加载
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ path: full });
      return value;
    }
    if (ext === '.pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const buf = await readFile(full);
      const { text } = await pdfParse(buf);
      return text;
    }
    throw new Error(`不支持的扩展名 ${ext}`);
  } catch (err) {
    throw new Error(`文本抽取失败 ${relPath}:${(err as Error).message}`);
  }
}
```

> **注意:** 若 `excel.ts` 的 `WorkbookResult` 字段名不是 `sheets`,以实际为准(Task B3 实施时打开 `src/core/legacy-bridge/excel.ts` 核对 `WorkbookResult` / `SheetResult` 定义,`parseWorkbook` 在 §excel.ts:37、`sheetToMarkdown` 在 :135)。

- [ ] **Step 4:运行测试,确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts -t extractText`
Expected: PASS。

- [ ] **Step 5:Commit**

```bash
git add src/core/legacy-bridge/extractor.ts tests/core/legacy-bridge/extractor.test.ts
git commit -m "feat(legacy-bridge): extractor.extractText —— md/txt/xlsx/docx/pdf 文本抽取"
```

---

### Task B4:`buildExtractTask` —— prep 产 LlmTask[]

**Files:**
- Modify: `src/core/legacy-bridge/extractor.ts`
- Test: `tests/core/legacy-bridge/extractor.test.ts`

实现 spec §4.1 / §4.2:每来源文档一个 `LlmTask`(`op: 'extract'`),`prompt` 内嵌 redact 后文本 + 代码索引,`outputPath` 为 `.cache/extract-result-<n>.json`。依赖 D1 已把 `extract` 加入 `LlmOp` —— **故 D1 须先于 B4 完成**(调整依赖顺序:D1 提前)。

> **依赖调整:** 先做 Task D1(给 `LlmOp` 加 `extract`),再做 B4。

- [ ] **Step 1:写失败测试**

```typescript
// 追加到 tests/core/legacy-bridge/extractor.test.ts
import { buildExtractTasks } from '../../../src/core/legacy-bridge/extractor.js';

describe('buildExtractTasks', () => {
  it('每来源文档一个 task,op=extract,prompt 内嵌 redact 后文本', async () => {
    const root = await tmpRepo({
      'docs/SRS.md': '# 需求\nAWS key AKIAIOSFODNN7EXAMPLE 出现在此',
      'TODO.md': '- 待办',
    });
    const sources = await discoverSources(root);
    // codeIndex 含一个 secret 样的路径 —— 用于验证代码索引也走 redact
    const tasks = await buildExtractTasks(root, sources, ['src/app.ts', 'src/cfg-AKIAIOSFODNN7EXAMPLE.ts']);
    expect(tasks).toHaveLength(2);
    for (const t of tasks) {
      expect(t.op).toBe('extract');
      expect(t.outputPath).toMatch(/^\.cache\/extract-result-\d+\.json$/);
    }
    const srsTask = tasks.find((t) => t.prompt.includes('docs/SRS.md'));
    // redact:文档正文里的 secret 不进 prompt
    expect(srsTask?.prompt).not.toContain('AKIAIOSFODNN7EXAMPLE');
    // 代码索引内嵌进 prompt(spec §4.2 关键约定)
    expect(srsTask?.prompt).toContain('src/app.ts');
    // 代码索引也走 redact(spec §4.1 第 3 步:全部输入都 redact)—— 上面 not.toContain 已同时覆盖
    //(secret 出现在文档正文与代码索引两处,prompt 两处都不应含原始串)
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts -t buildExtractTasks`
Expected: FAIL —— `buildExtractTasks` 未定义。

- [ ] **Step 3:写实现(追加到 `extractor.ts`)**

```typescript
import { redact } from './redact.js';
import type { LlmTask } from './llm-task.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

/** 抽取条目数组的 outputSchema 描述(供 agent 自校验,spec §4.2) */
const EXTRACT_OUTPUT_SCHEMA =
  '[{ "title": string, "description": string, "status": "implemented"|"unimplemented", ' +
  '"section": string, "evidence": string[], "confidence": "high"|"medium"|"low" }]';

/** 单文档抽取 prompt:内嵌 redact 后文本 + redact 后代码索引(spec §4.2) */
function buildExtractPrompt(args: {
  docPath: string;
  docKind: LegacyRequirementKind;
  redactedText: string;
  redactedCodeIndex: string;
}): string {
  return `你是一名需求抽取员。从下面这份老文档抽取需求条目,逐条判定其在当前代码库里是否已实现。

# 文档
路径:${args.docPath}(kind=${args.docKind})
---
${args.redactedText}
---

# 当前代码库结构索引(file tree;判 implemented 时参考)
${args.redactedCodeIndex}

# 任务
- 抽取该文档里的每条需求,给 title(一行)+ description(正文)。
- 逐条判 status:implemented(代码已实现)或 unimplemented。
- 判 implemented 必须在 evidence 给出代码依据(形如 "src/foo.ts:42 ...");unimplemented 时 evidence 为 []。
- section:该条所在章节锚 / 标题;无则空字符串。
- confidence:你对 status 判定的置信度 high/medium/low。

# 输出格式(严格 JSON,无 preamble)
${EXTRACT_OUTPUT_SCHEMA}`;
}

/**
 * prep:每来源文档建一个 LlmTask(spec §4.1 第 4 步 / §4.2)。
 * redact 对**全部输入**(文档文本 + 代码索引);prompt 内嵌 redact 后两者(ApiRunner 只发 prompt)。
 * @param codeIndex whole-repo 代码文件路径列表(file tree),由调用方传入
 */
export async function buildExtractTasks(
  repoRoot: string,
  sources: DiscoveredSource[],
  codeIndex: string[],
): Promise<LlmTask[]> {
  // 代码索引对全部 task 相同,redact 一次(spec §4.1 第 3 步:全部输入都 redact,含代码索引)
  const redactedCodeIndex = redact(codeIndex.join('\n')).redactedText;
  const tasks: LlmTask[] = [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]!;
    const rawText = await extractText(repoRoot, src.path);
    const redactedText = redact(rawText).redactedText;
    const prompt = buildExtractPrompt({
      docPath: src.path,
      docKind: src.kind,
      redactedText,
      redactedCodeIndex,
    });
    tasks.push({
      op: 'extract',
      // inputs:与 prompt 并列的 redact 快照(文档 + 代码索引;非送 LLM 通道,spec §4.2)
      inputs: [
        { source: src.path, content: redactedText },
        { source: '<code-index>', content: redactedCodeIndex },
      ],
      prompt,
      model: DEFAULT_MODEL,
      outputSchema: EXTRACT_OUTPUT_SCHEMA,
      outputPath: `.cache/extract-result-${i}.json`,
    });
  }
  return tasks;
}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts -t buildExtractTasks`
Expected: PASS。

- [ ] **Step 5:Commit**

```bash
git add src/core/legacy-bridge/extractor.ts tests/core/legacy-bridge/extractor.test.ts
git commit -m "feat(legacy-bridge): buildExtractTasks —— 每文档一 LlmTask(prep)"
```

---

## Phase C:extractor —— apply(校验 + 增量 diff + draft)

### Task C1:`parseExtractResults` —— 解析 + 校验 agent 结果

**Files:**
- Modify: `src/core/legacy-bridge/extractor.ts`
- Test: `tests/core/legacy-bridge/extractor.test.ts`

实现 spec §4.4 第 2-3 步:`readTaskResults` 取出 `{text}` 信封的 `text` 字符串 → JSON parse → 校验 outputSchema → 汇总为统一条目集。本任务写纯函数 `parseExtractResults(texts: string[])`。

- [ ] **Step 1:写失败测试**

```typescript
// 追加到 tests/core/legacy-bridge/extractor.test.ts
import { parseExtractResults } from '../../../src/core/legacy-bridge/extractor.js';

describe('parseExtractResults', () => {
  it('解析多 task 的 JSON 字符串结果,汇总成统一条目集', () => {
    const t1 = JSON.stringify([
      { title: '登录 2FA', description: 'd', status: 'unimplemented', section: '3.2', evidence: [], confidence: 'high' },
    ]);
    const t2 = JSON.stringify([
      { title: '日志', description: 'd2', status: 'implemented', section: '', evidence: ['src/log.ts:1'], confidence: 'medium' },
    ]);
    const out = parseExtractResults([
      { text: t1, source: 'docs/SRS.md', kind: 'srs' },
      { text: t2, source: 'docs/SRS.md', kind: 'srs' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.title).toBe('登录 2FA');
    expect(out[1]?.status).toBe('implemented');
  });

  it('某 task 文本非法 JSON → 抛带 source 的错误', () => {
    expect(() =>
      parseExtractResults([{ text: 'not json', source: 'TODO.md', kind: 'backlog-file' }]),
    ).toThrow(/TODO\.md/);
  });

  it('条目 status 越界 → 抛错', () => {
    const bad = JSON.stringify([{ title: 't', description: 'd', status: 'maybe', section: '', evidence: [], confidence: 'low' }]);
    expect(() => parseExtractResults([{ text: bad, source: 'a.md', kind: 'srs' }])).toThrow(/status/);
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts -t parseExtractResults`
Expected: FAIL。

- [ ] **Step 3:写实现(追加到 `extractor.ts`)**

```typescript
import type { LegacyRequirement, LegacyRequirementStatus } from './legacy-requirements.js';

/** 一个 task 的原始结果 + 来源元信息 */
export interface ExtractResultInput {
  /** readTaskResults 取出的 { text } 信封里的 text 字符串 */
  text: string;
  /** 该 task 对应的来源文档路径 */
  source: string;
  kind: LegacyRequirementKind;
}

/** LLM 抽出的一条需求(尚未分配 id / review) */
export interface ExtractedRequirement {
  title: string;
  description: string;
  status: LegacyRequirementStatus;
  /** 来源文档 + 章节(section 来自 LLM,document/kind 来自 ExtractResultInput) */
  source: { document: string; section: string; kind: LegacyRequirementKind };
  evidence: string[];
  confidence: 'high' | 'medium' | 'low';
}

const STATUS_SET = new Set(['implemented', 'unimplemented']);
const CONFIDENCE_SET = new Set(['high', 'medium', 'low']);

/**
 * 解析 + 校验各 task 结果(spec §4.4 第 2-3 步)。
 * 每个 ExtractResultInput.text 是需求条目数组的 JSON 字符串。
 * 非法 JSON / schema 不符 → 抛带 source 的错误。
 */
export function parseExtractResults(inputs: ExtractResultInput[]): ExtractedRequirement[] {
  const out: ExtractedRequirement[] = [];
  for (const input of inputs) {
    let arr: unknown;
    try {
      arr = JSON.parse(input.text.trim());
    } catch (err) {
      throw new Error(`extract 结果解析失败 ${input.source}:${(err as Error).message}`);
    }
    if (!Array.isArray(arr)) {
      throw new Error(`extract 结果 ${input.source}:顶层不是数组`);
    }
    arr.forEach((e, i) => {
      const o = e as Record<string, unknown>;
      const at = `${input.source}[${i}]`;
      if (typeof o.title !== 'string' || o.title === '') throw new Error(`${at}.title 须为非空字符串`);
      if (typeof o.description !== 'string') throw new Error(`${at}.description 须为字符串`);
      if (!STATUS_SET.has(o.status as string)) throw new Error(`${at}.status 越界:${String(o.status)}`);
      if (!CONFIDENCE_SET.has(o.confidence as string)) throw new Error(`${at}.confidence 越界`);
      if (!Array.isArray(o.evidence) || !o.evidence.every((x) => typeof x === 'string')) {
        throw new Error(`${at}.evidence 须为 string[]`);
      }
      const section = typeof o.section === 'string' ? o.section : '';
      out.push({
        title: o.title,
        description: o.description,
        status: o.status as LegacyRequirementStatus,
        source: { document: input.source, section, kind: input.kind },
        evidence: o.evidence as string[],
        confidence: o.confidence as 'high' | 'medium' | 'low',
      });
    });
  }
  return out;
}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts -t parseExtractResults`
Expected: PASS。

- [ ] **Step 5:Commit**

```bash
git add src/core/legacy-bridge/extractor.ts tests/core/legacy-bridge/extractor.test.ts
git commit -m "feat(legacy-bridge): parseExtractResults —— 校验汇总 agent 结果"
```

---

### Task C2:增量 diff `diffAgainstConfirmed`

**Files:**
- Modify: `src/core/legacy-bridge/extractor.ts`
- Test: `tests/core/legacy-bridge/extractor.test.ts`

实现 spec §6.1:匹配键 = `document` +(`section` 非空用它,否则 content hash);键唯一才匹配,>1 条 → conflict;产 `matched`/`new`/`vanished`/`conflict` 四类带 `change` 标注的 draft 条目。

- [ ] **Step 1:写失败测试**

```typescript
// 追加到 tests/core/legacy-bridge/extractor.test.ts
import { diffAgainstConfirmed } from '../../../src/core/legacy-bridge/extractor.js';
import type { ExtractedRequirement } from '../../../src/core/legacy-bridge/extractor.js';
import type { LegacyRequirement } from '../../../src/core/legacy-bridge/legacy-requirements.js';

function extracted(p: Partial<ExtractedRequirement>): ExtractedRequirement {
  return {
    title: 't',
    description: 'd',
    status: 'unimplemented',
    source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
    evidence: [],
    confidence: 'medium',
    ...p,
  };
}

/** 构造一条既有 LegacyRequirement(confirmed yaml fixture 用)—— 本 helper 在本测试文件内定义 */
function req(p: Partial<LegacyRequirement>): LegacyRequirement {
  return {
    id: 'LR-0001',
    title: 't',
    description: 'd',
    status: 'unimplemented',
    source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
    evidence: [],
    confidence: 'medium',
    priority: null,
    review: 'confirmed',
    notes: '',
    ...p,
  };
}

describe('diffAgainstConfirmed', () => {
  it('首次抽取(无既有 yaml):全部 new,id 留空', () => {
    const draft = diffAgainstConfirmed([extracted({ title: 'A' })], null);
    expect(draft[0]?.change).toBe('new');
    expect(draft[0]?.requirement.id).toBe('');
  });

  it('matched 未变 → unchanged,保留既有 id 与用户 priority/notes', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        req({ id: 'LR-0005', title: 'A', description: 'd', priority: 'high', notes: '用户笔记',
              source: { document: 'docs/SRS.md', section: '1', kind: 'srs' } }),
      ],
    };
    const draft = diffAgainstConfirmed([extracted({ title: 'A', description: 'd' })], confirmed);
    expect(draft[0]?.change).toBe('unchanged');
    expect(draft[0]?.requirement.id).toBe('LR-0005');
    expect(draft[0]?.requirement.priority).toBe('high');
    expect(draft[0]?.requirement.notes).toBe('用户笔记');
    expect(draft[0]?.requirement.review).toBe('confirmed');
  });

  it('matched 但 description 变 → changed,review 回退 pending', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        req({ id: 'LR-0005', title: 'A', description: '旧',
              source: { document: 'docs/SRS.md', section: '1', kind: 'srs' } }),
      ],
    };
    const draft = diffAgainstConfirmed([extracted({ title: 'A', description: '新' })], confirmed);
    expect(draft[0]?.change).toBe('changed');
    expect(draft[0]?.requirement.review).toBe('pending');
    expect(draft[0]?.requirement.id).toBe('LR-0005');
  });

  it('matched 仅 confidence/evidence 变 → changed,review 回退 pending(spec §6.1「全一致」)', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        req({ id: 'LR-0005', title: 'A', description: 'd', confidence: 'low', evidence: [],
              source: { document: 'docs/SRS.md', section: '1', kind: 'srs' } }),
      ],
    };
    // title/description/status 与既有一致,仅 confidence low→high
    const draft = diffAgainstConfirmed(
      [extracted({ title: 'A', description: 'd', confidence: 'high' })],
      confirmed,
    );
    expect(draft[0]?.change).toBe('changed');
    expect(draft[0]?.requirement.review).toBe('pending');
  });

  it('既有有、本轮没抽到 → vanished,保留 id', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [req({ id: 'LR-0009', source: { document: 'docs/SRS.md', section: '9', kind: 'srs' } })],
    };
    const draft = diffAgainstConfirmed([], confirmed);
    expect(draft[0]?.change).toBe('vanished');
    expect(draft[0]?.requirement.id).toBe('LR-0009');
  });

  it('同 document+section 抽出多条 → 全部 conflict / pending,不继承 id', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [req({ id: 'LR-0005', source: { document: 'docs/SRS.md', section: '1', kind: 'srs' } })],
    };
    const draft = diffAgainstConfirmed(
      [extracted({ title: 'A' }), extracted({ title: 'B' })],
      confirmed,
    );
    expect(draft.every((d) => d.change === 'conflict')).toBe(true);
    expect(draft.every((d) => d.requirement.id === '')).toBe(true);
    expect(draft.every((d) => d.requirement.review === 'pending')).toBe(true);
  });

  it('旧侧同 key 多条 + 新侧 1 条 → 旧 confirmed 条目不丢、全标 conflict(F02 防静默丢失)', () => {
    const confirmed = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        req({ id: 'LR-0005', title: 'A', source: { document: 'docs/SRS.md', section: '1', kind: 'srs' } }),
        req({ id: 'LR-0006', title: 'B', source: { document: 'docs/SRS.md', section: '1', kind: 'srs' } }),
      ],
    };
    const draft = diffAgainstConfirmed([extracted({ title: 'C' })], confirmed);
    // 2 旧 + 1 新 = 3 条都在 draft,旧 confirmed 条目未被静默丢弃
    expect(draft).toHaveLength(3);
    expect(draft.every((d) => d.change === 'conflict')).toBe(true);
    expect(draft.every((d) => d.requirement.id === '')).toBe(true);
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts -t diffAgainstConfirmed`
Expected: FAIL。

- [ ] **Step 3:写实现(追加到 `extractor.ts`)**

```typescript
import { createHash } from 'node:crypto';
import type { LegacyRequirementsFile } from './legacy-requirements.js';

/** draft 条目的变化类别(spec §6.1) */
export type ExtractChangeKind = 'new' | 'changed' | 'unchanged' | 'vanished' | 'conflict';

/** 带变化标注的 draft 条目 */
export interface DraftEntry {
  requirement: LegacyRequirement;
  change: ExtractChangeKind;
}

/** 归一化 content hash:title+description 去空白后 sha256 前 12 位 */
function contentHash(title: string, description: string): string {
  const norm = (title + ' ' + description).replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(norm, 'utf8').digest('hex').slice(0, 12);
}

/** 匹配键(spec §6.1):document +(section 非空用它,否则 content hash) */
function matchKey(document: string, section: string, title: string, description: string): string {
  return section !== ''
    ? `${document} sec:${section}`
    : `${document} hash:${contentHash(title, description)}`;
}

/** ExtractedRequirement → draft LegacyRequirement(id/review 由调用方按 change 定) */
function toRequirement(e: ExtractedRequirement): LegacyRequirement {
  return {
    id: '',
    title: e.title,
    description: e.description,
    status: e.status,
    source: e.source,
    evidence: e.evidence,
    confidence: e.confidence,
    priority: null,
    review: 'pending',
    notes: '',
  };
}

/**
 * 增量 diff(spec §6.1):本轮抽取条目 vs 已确认 yaml。
 * 匹配仅在键唯一(旧侧、新侧各恰好 1 条)时进行;任一侧多于 1 条 → conflict。
 * confirmed 为 null(首次抽取)时全部 new。
 */
export function diffAgainstConfirmed(
  extracted: ExtractedRequirement[],
  confirmed: LegacyRequirementsFile | null,
): DraftEntry[] {
  const oldList = confirmed?.requirements ?? [];
  // 按键分组
  const oldByKey = new Map<string, LegacyRequirement[]>();
  for (const r of oldList) {
    const k = matchKey(r.source.document, r.source.section, r.title, r.description);
    (oldByKey.get(k) ?? oldByKey.set(k, []).get(k)!).push(r);
  }
  const newByKey = new Map<string, ExtractedRequirement[]>();
  for (const e of extracted) {
    const k = matchKey(e.source.document, e.source.section, e.title, e.description);
    (newByKey.get(k) ?? newByKey.set(k, []).get(k)!).push(e);
  }
  const draft: DraftEntry[] = [];
  const allKeys = new Set([...oldByKey.keys(), ...newByKey.keys()]);
  for (const k of allKeys) {
    const olds = oldByKey.get(k) ?? [];
    const news = newByKey.get(k) ?? [];
    if (olds.length > 1 || news.length > 1) {
      // 冲突:键非唯一(spec §6.1)。该键下旧 + 新条目一个都不能丢:
      // 新条目 → conflict,不继承 id
      for (const e of news) draft.push({ requirement: toRequirement(e), change: 'conflict' });
      // 旧条目:本轮没抽到该键 → vanished(保留 id,用户决定删不删);
      //         键被本轮新条目竞争 → 同进 conflict、清空 id(spec §6.1「不继承既有 id」),不静默丢失
      for (const o of olds) {
        draft.push(
          news.length === 0
            ? { requirement: o, change: 'vanished' }
            : { requirement: { ...o, id: '', review: 'pending' }, change: 'conflict' },
        );
      }
      continue;
    }
    const old = olds[0];
    const ne = news[0];
    if (old && ne) {
      // matched:复制 id,保留用户 priority/notes;status/evidence/confidence 用新值。
      // changed 判定须含 title/description/status/evidence/confidence 全部 5 项(spec §6.1
      //「新值与既有全一致」)—— 漏 evidence/confidence 会把它们的变化误标 unchanged、跳过用户复审。
      const changed =
        old.title !== ne.title ||
        old.description !== ne.description ||
        old.status !== ne.status ||
        old.confidence !== ne.confidence ||
        JSON.stringify(old.evidence) !== JSON.stringify(ne.evidence);
      draft.push({
        requirement: {
          ...toRequirement(ne),
          id: old.id,
          priority: old.priority,
          notes: old.notes,
          review: changed ? 'pending' : 'confirmed',
        },
        change: changed ? 'changed' : 'unchanged',
      });
    } else if (ne) {
      draft.push({ requirement: toRequirement(ne), change: 'new' });
    } else if (old) {
      draft.push({ requirement: old, change: 'vanished' });
    }
  }
  return draft;
}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts -t diffAgainstConfirmed`
Expected: PASS(7 个用例)。

- [ ] **Step 5:Commit**

```bash
git add src/core/legacy-bridge/extractor.ts tests/core/legacy-bridge/extractor.test.ts
git commit -m "feat(legacy-bridge): diffAgainstConfirmed —— 增量合并 diff"
```

---

### Task C3:`applyExtractResult` —— 串起校验→diff→渲染 draft

**Files:**
- Modify: `src/core/legacy-bridge/extractor.ts`
- Test: `tests/core/legacy-bridge/extractor.test.ts`

实现 spec §4.4 第 4-5 步:把 `parseExtractResults` + `diffAgainstConfirmed` 串起来,产 draft yaml 文本 + `.md` 概览(按 new/changed/vanished/unchanged/conflict 分组)。

- [ ] **Step 1:写失败测试**

```typescript
// 追加到 tests/core/legacy-bridge/extractor.test.ts
import { applyExtractResult } from '../../../src/core/legacy-bridge/extractor.js';

describe('applyExtractResult', () => {
  it('产 draft yaml + md 概览,md 按变化分组', () => {
    const text = JSON.stringify([
      { title: '登录 2FA', description: 'd', status: 'unimplemented', section: '3.2', evidence: [], confidence: 'high' },
    ]);
    const out = applyExtractResult(
      [{ text, source: 'docs/SRS.md', kind: 'srs' }],
      null,
    );
    expect(out.draftYaml).toContain('schema: forge-legacy-requirements/v1');
    expect(out.draftYaml).toContain('登录 2FA');
    expect(out.draftMarkdown).toContain('## New');
    expect(out.draftMarkdown).toContain('登录 2FA');
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts -t applyExtractResult`
Expected: FAIL。

- [ ] **Step 3:写实现(追加到 `extractor.ts`)**

```typescript
import { stringify as stringifyYaml } from 'yaml';

/** applyExtractResult 输出 */
export interface ExtractApplyOutput {
  draftYaml: string;
  draftMarkdown: string;
}

/** 渲染 draft .md 概览:按 change 分组(spec §6.1 第 3 步) */
function renderDraftOverview(draft: DraftEntry[]): string {
  const lines: string[] = ['# Legacy Requirements Draft 概览', ''];
  lines.push('LLM 抽取 + 增量 diff 的草稿。请审改 `legacy-requirements-draft.yaml` 后跑 `forge legacy-bridge extract --finalize`。', '');
  const groups: Array<[ExtractChangeKind, string]> = [
    ['new', 'New(本轮新抽)'],
    ['changed', 'Changed(本轮有变更,待复审)'],
    ['conflict', 'Conflict(匹配键撞,需手动认领 ID / 合并)'],
    ['vanished', 'Vanished(既有有、本轮没抽到)'],
    ['unchanged', 'Unchanged(未变,无需复审)'],
  ];
  for (const [kind, title] of groups) {
    const items = draft.filter((d) => d.change === kind);
    lines.push(`## ${title.split('(')[0]!.trim()} (${items.length})`, '');
    if (items.length === 0) {
      lines.push('(无)', '');
      continue;
    }
    for (const d of items) {
      const idLabel = d.requirement.id === '' ? '(待分配)' : d.requirement.id;
      lines.push(`- \`${idLabel}\` ${d.requirement.title} —— ${d.requirement.source.document}` +
        (d.requirement.source.section ? `#${d.requirement.source.section}` : ''));
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/**
 * --apply 后处理(spec §4.4 第 3-5 步):
 * 校验汇总 → 增量 diff → 产 draft yaml + md 概览。
 */
export function applyExtractResult(
  results: ExtractResultInput[],
  confirmed: LegacyRequirementsFile | null,
): ExtractApplyOutput {
  const extracted = parseExtractResults(results);
  const draft = diffAgainstConfirmed(extracted, confirmed);
  const draftFile: LegacyRequirementsFile = {
    schema: 'forge-legacy-requirements/v1',
    requirements: draft.map((d) => d.requirement),
  };
  return {
    draftYaml: stringifyYaml(draftFile),
    draftMarkdown: renderDraftOverview(draft),
  };
}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/extractor.test.ts`
Expected: PASS(extractor 全部用例)。

- [ ] **Step 5:Commit**

```bash
git add src/core/legacy-bridge/extractor.ts tests/core/legacy-bridge/extractor.test.ts
git commit -m "feat(legacy-bridge): applyExtractResult —— 产 draft yaml + md 概览"
```

---

## Phase D:CLI 接线

### Task D1:`LlmOp` 加 `extract`

> **执行顺序:** 本任务须在 Task B4 之前完成(B4 用到 `op: 'extract'`)。

**Files:**
- Modify: `src/core/legacy-bridge/llm-task.ts:8-14`
- Test: `tests/core/legacy-bridge/llm-task.test.ts`

- [ ] **Step 1:写失败测试**

```typescript
// 追加到 tests/core/legacy-bridge/llm-task.test.ts
describe('LlmOp 含 extract', () => {
  it('extract 可作合法 op 构造 manifest', () => {
    const task: LlmTask = {
      op: 'extract',
      inputs: [],
      prompt: 'p',
      model: 'claude-sonnet-4-6',
      outputSchema: '[]',
      outputPath: '.cache/extract-result-0.json',
    };
    const m = buildManifest({ op: 'extract', round: 1, tasks: [task], forgeVersion: '1.4.0' });
    expect(verifyManifest(m).ok).toBe(true);
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/llm-task.test.ts -t "含 extract"`
Expected: FAIL —— `'extract'` 不属 `LlmOp`(typecheck 错)。

- [ ] **Step 3:写实现**

修改 `src/core/legacy-bridge/llm-task.ts` 的 `LlmOp` 定义(当前 8-14 行):

```typescript
/** 可走双路径的 LLM 操作类型 */
export type LlmOp =
  | 'map'
  | 'index'
  | 'regenerate'
  | 'extract-facts'
  | 'quality-judge'
  | 'sync-check'
  | 'extract';
```

- [ ] **Step 4:运行测试 + 类型检查,确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/llm-task.test.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 5:Commit**

```bash
git add src/core/legacy-bridge/llm-task.ts tests/core/legacy-bridge/llm-task.test.ts
git commit -m "feat(legacy-bridge): LlmOp 加 extract"
```

---

### Task D2:`extract` 子命令 —— `runExtractCommand` 四分支

**Files:**
- Modify: `src/cli/commands/legacy-bridge.ts`(加 `runExtractCommand` + 注册 `extract` 子命令)
- Test: `tests/cli/legacy-bridge/extract-cli.test.ts`(新)

实现 spec §2 / §4:`extract` 四分支(emit / `--apply` / `--api` / `--finalize`),沿 `runMapCommand`(`legacy-bridge.ts:146`)的结构。`--apply`/`--api`/`--finalize` 三者互斥。

- [ ] **Step 1:写失败测试**

```typescript
// tests/cli/legacy-bridge/extract-cli.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runExtractCommand } from '../../../src/cli/commands/legacy-bridge.js';

/** 建一个带 forge/ + opt-in ack 的临时项目 */
async function tmpProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'extract-cli-'));
  const forge = join(root, 'forge');
  await mkdir(join(forge, '.cache'), { recursive: true });
  // 建空的 changes/archive/ —— D2 执行序在 E1 之前,此时 buildBacklog 仍无条件 scanArchivedFollowups;
  // 建一个空 archive 目录使 --finalize 调的 generateBacklog 跑得通(E1 空 archive 容错落地后此行可保留也无害)
  await mkdir(join(forge, 'changes', 'archive'), { recursive: true });
  await writeFile(join(root, 'forge', 'config.yaml'), 'legacy_bridge:\n  allow_llm_calls: true\n', 'utf8');
  await writeFile(join(root, 'docs-SRS.md'), '# SRS\n需求一', 'utf8'); // 文件名含 SRS
  // 写 llm-ack 让 opt-in 通过(config_hash 由实现侧 computeConfigHash 校验,测试可先 emit 再断言)
  return root;
}

describe('runExtractCommand', () => {
  it('--apply 与 --api 互斥 → 返回错误码', async () => {
    const root = await tmpProject();
    const code = await runExtractCommand({ projectRoot: root, apply: true, api: true, finalize: false });
    expect(code).not.toBe(0);
  });

  it('--apply 与 --finalize 互斥 → 返回错误码', async () => {
    const root = await tmpProject();
    const code = await runExtractCommand({ projectRoot: root, apply: true, api: false, finalize: true });
    expect(code).not.toBe(0);
  });

  it('--finalize 找不到 draft → 返回错误码', async () => {
    const root = await tmpProject();
    const code = await runExtractCommand({ projectRoot: root, apply: false, api: false, finalize: true });
    expect(code).not.toBe(0);
  });

  it('--finalize 有 draft → 写 legacy-requirements.yaml,分配 ID', async () => {
    const root = await tmpProject();
    await writeFile(
      join(root, 'forge', 'legacy-requirements-draft.yaml'),
      `schema: forge-legacy-requirements/v1
requirements:
  - id: ""
    title: 需求一
    description: d
    status: unimplemented
    source: { document: docs-SRS.md, section: "1", kind: srs }
    evidence: []
    confidence: medium
    priority: null
    review: pending
    notes: ""
`,
      'utf8',
    );
    const code = await runExtractCommand({ projectRoot: root, apply: false, api: false, finalize: true });
    expect(code).toBe(0);
    const finalized = await readFile(join(root, 'forge', 'legacy-requirements.yaml'), 'utf8');
    expect(finalized).toContain('LR-0001');
    expect(finalized).toContain('review: confirmed');
  });

  it('--finalize 后 backlog 刷新失败 → 返回 PARTIAL_SUCCESS(3),yaml 仍写成功', async () => {
    const root = await tmpProject();
    await writeFile(
      join(root, 'forge', 'legacy-requirements-draft.yaml'),
      `schema: forge-legacy-requirements/v1
requirements:
  - id: ""
    title: 需求一
    description: d
    status: unimplemented
    source: { document: docs-SRS.md, section: "1", kind: srs }
    evidence: []
    confidence: medium
    priority: null
    review: pending
    notes: ""
`,
      'utf8',
    );
    // 把 forge/backlog 占成普通文件 → generateBacklog 的 mkdir 抛错(无需 mock)
    await writeFile(join(root, 'forge', 'backlog'), 'occupied', 'utf8');
    const code = await runExtractCommand({ projectRoot: root, apply: false, api: false, finalize: true });
    expect(code).toBe(3); // LB_EXIT_PARTIAL_SUCCESS —— finalize 成功但 backlog 刷新失败
    // finalize 本身成功:legacy-requirements.yaml 仍写出
    expect(existsSync(join(root, 'forge', 'legacy-requirements.yaml'))).toBe(true);
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/cli/legacy-bridge/extract-cli.test.ts`
Expected: FAIL —— `runExtractCommand` 未导出。

- [ ] **Step 3:写实现 —— 加 `runExtractCommand` 到 `legacy-bridge.ts`**

在 `legacy-bridge.ts` 加入(import 区补 extractor / legacy-requirements 的导入;`runExtractCommand` 放在 `runMapCommand` 之后):

```typescript
// ===== extract 子命令(Layer 3b,spec §4)=====
import {
  discoverSources,
  buildExtractTasks,
  applyExtractResult,
  type ExtractResultInput,
} from '../../core/legacy-bridge/extractor.js';
import {
  loadLegacyRequirements,
  validateLegacyRequirementsFile,
  finalizeLegacyRequirements,
  LEGACY_REQUIREMENTS_FILE,
  LEGACY_REQUIREMENTS_DRAFT_FILE,
  LEGACY_REQUIREMENTS_DRAFT_MD,
  type LegacyRequirementsFile,
} from '../../core/legacy-bridge/legacy-requirements.js';
// node 内置 / yaml 的名字 legacy-bridge.ts 顶部都已 import,**不要新增重复 import**(否则
// duplicate identifier,typecheck 失败):readFile/writeFile/mkdir/readdir 在第 6 行、
// existsSync 在第 7 行、join 在第 8 行、parseYaml/stringifyYaml 在第 9 行,直接复用即可。
// 本 Task 只在两行既有 import 上各补一个名字:
//   第 7 行 → import { existsSync, statSync, type Dirent } from 'node:fs';
//   第 8 行 → import { join, relative } from 'node:path';

/** extract 子命令参数(四分支:emit / --apply / --api / --finalize) */
export interface ExtractCommandOpts {
  projectRoot: string;
  apply: boolean;
  api: boolean;
  finalize: boolean;
}

/** 收集 whole-repo 代码文件路径(file tree 索引,供 prompt 内嵌) */
async function collectCodeIndex(repoRoot: string): Promise<string[]> {
  const out: string[] = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'dist-bundled', 'build', 'forge', '.cache']);
  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (skip.has(ent.name) || ent.name.startsWith('.')) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile()) out.push(relative(repoRoot, full).split('\\').join('/'));
    }
  }
  await walk(repoRoot);
  return out.sort();
}

/**
 * extract 子命令四分支:
 *   默认 → 发现 + buildExtractTasks → emit manifest;
 *   --apply → 读 manifest + agent 结果 → applyExtractResult → 写 draft;
 *   --api → ApiRunner 进程内调 SDK → 同后处理;
 *   --finalize → 读 draft → finalizeLegacyRequirements → 写 legacy-requirements.yaml + 刷新 backlog。
 */
export async function runExtractCommand(opts: ExtractCommandOpts): Promise<number> {
  const forgeRoot = join(opts.projectRoot, 'forge');
  // 互斥校验:--apply / --api / --finalize 三者不能同传(spec §2)
  const exclusive = [opts.apply, opts.api, opts.finalize].filter(Boolean).length;
  if (exclusive > 1) {
    console.error('✗ --apply / --api / --finalize 三者互斥,只能用其一');
    return LB_EXIT_GENERAL_ERROR;
  }

  // --finalize 分支:纯确定性,不调 LLM,不过 opt-in gate(spec §6.2)
  if (opts.finalize) {
    return runExtractFinalize(forgeRoot, opts.projectRoot);
  }

  // --apply 不调 LLM,跳过 opt-in gate;emit / --api 先过 gate(spec §5 / §5.3)
  if (!opts.apply) {
    const optin = await assertLlmOptIn(forgeRoot);
    if (!optin.ok) {
      console.error(`✗ ${optin.reason}`);
      return optin.graceful ? LB_EXIT_OK : LB_EXIT_GENERAL_ERROR;
    }
  }

  if (opts.apply) {
    return runExtractApply(forgeRoot);
  }

  // emit / --api:确定性 prep
  const sources = await discoverSources(opts.projectRoot);
  if (sources.length === 0) {
    console.error('✗ 未发现任何需求文档 / backlog 文件;检查仓库是否有 SRS/PRD/BACKLOG/TODO 命名的文件');
    return LB_EXIT_GENERAL_ERROR;
  }
  const codeIndex = await collectCodeIndex(opts.projectRoot);
  const tasks = await buildExtractTasks(opts.projectRoot, sources, codeIndex);
  // 透明告知(spec §5.3 第 3 点)
  console.log(`→ 本次将把 ${sources.length} 份发现文档交给 LLM(redact 已跑默认规则)`);

  if (opts.api) {
    const client = (await makeForgeApiClient()) as unknown as RunnerClient;
    const results = await new ApiRunner(client).run(tasks);
    const confirmed = await loadLegacyRequirements(forgeRoot);
    const apiInputs: ExtractResultInput[] = results.map((r, i) => ({
      text: r.text,
      source: tasks[i]!.inputs[0]!.source,
      kind: sources[i]!.kind,
    }));
    const out = applyExtractResult(apiInputs, confirmed);
    await writeFile(join(forgeRoot, LEGACY_REQUIREMENTS_DRAFT_FILE), out.draftYaml, 'utf8');
    await writeFile(join(forgeRoot, LEGACY_REQUIREMENTS_DRAFT_MD), out.draftMarkdown, 'utf8');
    console.log('✓ extract draft 已写(--api 单进程)');
    return LB_EXIT_OK;
  }

  // 默认 agent 模式:emit manifest。已确认 yaml 快照写进 meta —— `--apply` 据此做增量 diff,
  // 不在 apply 时回读磁盘(emit 与 apply 之间 yaml 可能被改;快照随 manifest_hash 锁定基线,spec §4.1/§6.1)
  const confirmedSnapshot = await loadLegacyRequirements(forgeRoot);
  await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit('extract', 1, tasks, {
    confirmed_snapshot: confirmedSnapshot,
  });
  console.log(
    `✓ extract manifest 已写 ${manifestPath(forgeRoot, 'extract')}\n  → 请 fulfill 后跑 forge legacy-bridge extract --apply(见 skill: legacy-bridge-fulfillment)`,
  );
  return LB_EXIT_OK;
}

/** --apply:读 manifest + agent 结果 → 写 draft */
async function runExtractApply(forgeRoot: string): Promise<number> {
  let manifest: Awaited<ReturnType<typeof readManifest>>;
  try {
    manifest = await readManifest(forgeRoot, 'extract');
  } catch (e) {
    console.error(`✗ extract manifest 读取失败:${(e as Error).message}`);
    return LB_EXIT_GENERAL_ERROR;
  }
  if (!manifest) {
    console.error('✗ 无 extract manifest;请先跑 forge legacy-bridge extract');
    return LB_EXIT_GENERAL_ERROR;
  }
  let results: Awaited<ReturnType<typeof readTaskResults>>;
  try {
    results = await readTaskResults(forgeRoot, manifest.tasks);
  } catch (e) {
    console.error(`✗ agent 结果读取失败:${(e as Error).message}`);
    return LB_EXIT_GENERAL_ERROR;
  }
  // 每个 task 的来源文档 = task.inputs[0].source;kind 由 source 反查
  const applyInputs: ExtractResultInput[] = results.map((r, i) => {
    const src = manifest!.tasks[i]!.inputs[0]!.source;
    return { text: r.text, source: src, kind: inferKind(src) };
  });
  // 增量 diff 基线取自 manifest.meta 的快照(emit 时写入),不回读磁盘 —— manifest_hash 已锁定该快照
  const confirmed = (manifest.meta?.confirmed_snapshot ?? null) as LegacyRequirementsFile | null;
  let out;
  try {
    out = applyExtractResult(applyInputs, confirmed);
  } catch (e) {
    console.error(`✗ extract 结果校验失败:${(e as Error).message}`);
    return LB_EXIT_GENERAL_ERROR;
  }
  await writeFile(join(forgeRoot, LEGACY_REQUIREMENTS_DRAFT_FILE), out.draftYaml, 'utf8');
  await writeFile(join(forgeRoot, LEGACY_REQUIREMENTS_DRAFT_MD), out.draftMarkdown, 'utf8');
  await consumeManifest(forgeRoot, 'extract');
  console.log(`✓ extract draft 已写 forge/${LEGACY_REQUIREMENTS_DRAFT_FILE} —— 审改后跑 extract --finalize`);
  return LB_EXIT_OK;
}

/** 据文件名反查 kind(与 extractor.classifyKind 同规则) */
function inferKind(relPath: string): 'srs' | 'backlog-file' | 'issue-export' {
  const name = relPath.toLowerCase();
  if (/issue/.test(name)) return 'issue-export';
  if (/(^|\/)(backlog|todo|roadmap)/.test(name)) return 'backlog-file';
  return 'srs';
}

/** --finalize:读 draft → finalize → 写 legacy-requirements.yaml + 刷新 backlog */
async function runExtractFinalize(forgeRoot: string, projectRoot: string): Promise<number> {
  const draftPath = join(forgeRoot, LEGACY_REQUIREMENTS_DRAFT_FILE);
  let raw: string;
  try {
    raw = await readFile(draftPath, 'utf8');
  } catch {
    console.error(`✗ 找不到 ${LEGACY_REQUIREMENTS_DRAFT_FILE};请先跑 forge legacy-bridge extract + --apply`);
    return LB_EXIT_GENERAL_ERROR;
  }
  let draftFile;
  try {
    draftFile = validateLegacyRequirementsFile(parseYaml(raw));
  } catch (e) {
    console.error(`✗ draft 校验失败:${(e as Error).message}`);
    return LB_EXIT_GENERAL_ERROR;
  }
  const finalized = finalizeLegacyRequirements(draftFile.requirements);
  await writeFile(join(forgeRoot, LEGACY_REQUIREMENTS_FILE), stringifyYaml(finalized), 'utf8');
  console.log(`✓ ${LEGACY_REQUIREMENTS_FILE} 已写(${finalized.requirements.length} 条)`);
  // 立即刷新 backlog(spec §6.2 第 6 步);archive 目录可能不存在 → buildBacklog 已容错(E1)
  try {
    const { generateBacklog } = await import('../../core/backlog/index.js');
    await generateBacklog(forgeRoot);
    console.log('✓ forge/backlog/ 已刷新');
  } catch (e) {
    // legacy-requirements.yaml 已写成功,但 backlog 未刷新 → 部分成功(active.md 暂时陈旧)。
    // 不返回 OK —— 否则掩盖 active.md 与 yaml 不一致;也不返回硬错误 —— finalize 本身已成功。
    console.error(
      `⚠ legacy-requirements.yaml 已写,但 backlog 刷新失败:${(e as Error).message}\n  → 请手动跑 forge backlog 刷新`,
    );
    return LB_EXIT_PARTIAL_SUCCESS;
  }
  return LB_EXIT_OK;
}
```

> **实施提示:** `FORGE_VERSION` / `assertLlmOptIn` / `RunnerClient` / `makeForgeApiClient` / `manifestPath` / `readManifest` / `readTaskResults` / `consumeManifest` / `AgentHandoffRunner` / `ApiRunner` 均为 `legacy-bridge.ts` 已有的 import,复用即可;`join` 也已 import,只需把 `relative` 并入那一行。

- [ ] **Step 4:注册 `extract` 子命令**

在 `buildLegacyBridgeCommand`(`legacy-bridge.ts`)的 5 个子命令之后、`return cmd` 之前加:

```typescript
  cmd
    .command('extract')
    .description('扫全仓库老文档 → LLM 抽需求 + 判实现 → legacy-requirements.yaml(Layer 3b)')
    .option('--apply', '消费 agent 已写入的结果文件 → 产 draft yaml')
    .option('--api', '进程内直接调 Anthropic SDK(需 ANTHROPIC_API_KEY)')
    .option('--finalize', '读 draft → 分配 ID → 转正为 legacy-requirements.yaml')
    .action(async (opts: { apply?: boolean; api?: boolean; finalize?: boolean }) => {
      const code = await runExtractCommand({
        projectRoot: process.cwd(),
        apply: opts.apply ?? false,
        api: opts.api ?? false,
        finalize: opts.finalize ?? false,
      });
      process.exit(code);
    });
```

- [ ] **Step 5:运行测试 + 类型检查,确认通过**

Run: `pnpm vitest run tests/cli/legacy-bridge/extract-cli.test.ts && pnpm typecheck`
Expected: PASS(5 个用例)。

- [ ] **Step 6:Commit**

```bash
git add src/cli/commands/legacy-bridge.ts tests/cli/legacy-bridge/extract-cli.test.ts
git commit -m "feat(legacy-bridge): extract 子命令四分支(emit/--apply/--api/--finalize)"
```

---

## Phase E:backlog registry 双源

### Task E1:`buildBacklog` 空 archive 容错

**Files:**
- Modify: `src/core/backlog/index.ts`
- Test: `tests/core/backlog/legacy-source.test.ts`(新)

实现 spec §7.1 的「空 archive 容错」部分:`buildBacklog` 在调 `scanArchivedFollowups` 前判 `forge/changes/archive/` 是否存在,不存在则源一取空结果。**本任务不接 legacy-requirements 第二源** —— 第二源连同 `renderActiveMarkdown` 改签名一起在 E3 做。这样 E1 单独提交即可编译通过、测试转绿(不留下不可编译的中间态)。

- [ ] **Step 1:写失败测试**

```typescript
// tests/core/backlog/legacy-source.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBacklog } from '../../../src/core/backlog/index.js';

async function tmpForge(): Promise<string> {
  const forge = join(await mkdtemp(join(tmpdir(), 'bk-')), 'forge');
  await mkdir(forge, { recursive: true });
  return forge;
}

describe('buildBacklog 空 archive 容错', () => {
  it('forge/changes/archive/ 不存在 → buildBacklog 不抛错', async () => {
    const forge = await tmpForge();
    await expect(buildBacklog(forge)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/backlog/legacy-source.test.ts`
Expected: FAIL —— 当前 `buildBacklog` 无条件 `scanArchivedFollowups`,archive 目录不存在即抛错。

- [ ] **Step 3:写实现 —— 修改 `src/core/backlog/index.ts` 的 `buildBacklog`**

只加空 archive 容错,**不动 `renderActiveMarkdown` 调用**(仍两参)—— E1 单独提交即编译通过:

```typescript
// existsSync(node:fs)、join(node:path)已在 backlog/index.ts 第 5-6 行 import —— 复用,勿重复 import。
// 本任务只新增一个 type import:
import type { AggregatorResult } from '../scope/aggregator.js';

/** 聚合 + 渲染,返回两份 markdown(纯计算,不写盘) */
export async function buildBacklog(forgeRoot: string): Promise<GenerateBacklogResult> {
  // 源一:archived scope-entry —— 空 archive 容错(spec §7.1)
  let agg: AggregatorResult;
  if (existsSync(join(forgeRoot, 'changes', 'archive'))) {
    agg = await scanArchivedFollowups(forgeRoot);
  } else {
    agg = { entries: [], superseding: [], skipped: [] };
  }
  const { warnings, tombstones } = deriveWarningsAndTombstones(agg.superseding, agg.skipped);
  const activeMd = renderActiveMarkdown(agg.entries, warnings);
  const archivedMd = renderArchivedMarkdown(tombstones);
  const openCount = countOpenBacklog(agg.entries);
  return { openCount, warningCount: warnings.length, activeMd, archivedMd };
}
```

> **注意:** 此版 `buildBacklog` 仍是单源(scope),只多了空 archive 容错 —— 编译通过、E1 测试转绿、既有 backlog 测试不回归。第二数据源(`loadLegacyRequirements`)+ superseding 分流 + `renderActiveMarkdown` 改签名,统一在 Task E3 接入,届时整体替换本函数。

- [ ] **Step 4:运行测试,确认通过**

Run: `pnpm vitest run tests/core/backlog/legacy-source.test.ts && pnpm vitest run tests/core/backlog/`
Expected: PASS —— `legacy-source.test.ts` 通过,既有 backlog 测试无回归。

- [ ] **Step 5:Commit**

```bash
git add src/core/backlog/index.ts tests/core/backlog/legacy-source.test.ts
git commit -m "feat(backlog): buildBacklog 空 archive 容错(spec §7.1)"
```

---

### Task E2:superseding 分流 + `LegacyRequirementTombstone`

**Files:**
- Modify: `src/core/backlog/render.ts`
- Test: `tests/core/backlog/legacy-tombstone.test.ts`(新)

实现 spec §8.2 / §8.5:`buildBacklog` 把 `source_change === 'legacy-requirements'` 的 superseding 明细分流,产 `LegacyRequirementTombstone`;winner 选择 / dangling / invalid / duplicate 按 §8.5 三步走。本任务在 `render.ts` 加纯函数 `splitLegacyClaims`。

- [ ] **Step 1:写失败测试**

```typescript
// tests/core/backlog/legacy-tombstone.test.ts
import { describe, it, expect } from 'vitest';
import { splitLegacyClaims } from '../../../src/core/backlog/render.js';
import type { SupersedingDetail } from '../../../src/core/scope/aggregator.js';
import type { LegacyRequirement } from '../../../src/core/legacy-bridge/legacy-requirements.js';

function lr(id: string): LegacyRequirement {
  return {
    id, title: id, description: 'd', status: 'unimplemented',
    source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
    evidence: [], confidence: 'medium', priority: null, review: 'confirmed', notes: '',
  };
}
function claim(p: Partial<SupersedingDetail>): SupersedingDetail {
  return {
    source_change: 'legacy-requirements', entry_id: 'LR-0001', new_status: 'completed',
    rationale: 'r', superseded_in_change: '2026-05-01-foo', superseded_at: '2026-05-01',
    registry_entry_snapshot: null, ...p,
  };
}

describe('splitLegacyClaims', () => {
  it('合法 completed claim → 产 tombstone', () => {
    const out = splitLegacyClaims([claim({})], [lr('LR-0001')]);
    expect(out.tombstones).toHaveLength(1);
    expect(out.tombstones[0]?.entry_id).toBe('LR-0001');
    expect(out.retiredIds.has('LR-0001')).toBe(true);
  });

  it('new_status 越界 → invalid-legacy-status warning,不产 tombstone', () => {
    const out = splitLegacyClaims([claim({ new_status: 'inherited' })], [lr('LR-0001')]);
    expect(out.tombstones).toHaveLength(0);
    expect(out.warnings.some((w) => w.kind === 'invalid-legacy-status')).toBe(true);
    expect(out.retiredIds.has('LR-0001')).toBe(false);
  });

  it('entry_id 不在 yaml → dangling-legacy-claim warning', () => {
    const out = splitLegacyClaims([claim({ entry_id: 'LR-9999' })], [lr('LR-0001')]);
    expect(out.warnings.some((w) => w.kind === 'dangling-legacy-claim')).toBe(true);
  });

  it('同 entry_id 两个有效 claim → winner = 最早,duplicate warning', () => {
    const out = splitLegacyClaims(
      [
        claim({ superseded_in_change: '2026-05-02-b', superseded_at: '2026-05-02' }),
        claim({ superseded_in_change: '2026-05-01-a', superseded_at: '2026-05-01' }),
      ],
      [lr('LR-0001')],
    );
    expect(out.tombstones).toHaveLength(1);
    expect(out.tombstones[0]?.superseded_in_change).toBe('2026-05-01-a');
    expect(out.warnings.some((w) => w.kind === 'duplicate-legacy-claim')).toBe(true);
    expect(out.retiredIds.has('LR-0001')).toBe(true);
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/backlog/legacy-tombstone.test.ts`
Expected: FAIL —— `splitLegacyClaims` 未定义。

- [ ] **Step 3:写实现(追加到 `src/core/backlog/render.ts`)**

```typescript
import type { LegacyRequirement } from '../legacy-bridge/legacy-requirements.js';

/** legacy requirement 退役墓碑(spec §8.2,不复用 SupersedingDetail/ScopeEntry) */
export interface LegacyRequirementTombstone {
  entry_id: string;
  new_status: string;
  rationale: string;
  superseded_in_change: string;
  superseded_at: string;
  requirement_snapshot: LegacyRequirement | null;
}

/** legacy 专属 warning(spec §8.5);并入 BacklogWarning 联合 —— 见下方扩展 */
export type LegacyBacklogWarning =
  | { kind: 'dangling-legacy-claim'; entry_id: string; superseded_in_change: string }
  | { kind: 'invalid-legacy-status'; entry_id: string; superseded_in_change: string; raw: string }
  | { kind: 'duplicate-legacy-claim'; entry_id: string; winner_superseded_in_change: string;
      claimants: string[] }
  | { kind: 'malformed-dirname'; superseded_in_change: string }
  | { kind: 'reserved-archive-dirname' };

/** legacy 退役允许的 new_status(spec §8.1 收紧子集) */
const LEGACY_VALID_STATUS = new Set(['completed', 'obsolete']);

/** splitLegacyClaims 输出 */
export interface SplitLegacyResult {
  tombstones: LegacyRequirementTombstone[];
  warnings: LegacyBacklogWarning[];
  /** 已退役的 legacy requirement id 集(供 active.md 过滤) */
  retiredIds: Set<string>;
}

/**
 * 分流处理 source_change='legacy-requirements' 的 superseding 明细(spec §8.5)。
 * 三步:① 校验剔除 dangling/invalid ② 有效 claim 按 entry_id 选 winner ③ 目录名异常。
 * @param legacyClaims 已分流出的 legacy superseding 明细
 * @param legacyReqs   legacy-requirements.yaml 的 requirements(查 snapshot 用)
 */
export function splitLegacyClaims(
  legacyClaims: SupersedingDetail[],
  legacyReqs: LegacyRequirement[],
): SplitLegacyResult {
  const byId = new Map(legacyReqs.map((r) => [r.id, r]));
  const warnings: LegacyBacklogWarning[] = [];
  const valid: SupersedingDetail[] = [];

  // 第 1 步:校验,剔除无效 claim
  for (const c of legacyClaims) {
    const snapshot = byId.get(c.entry_id);
    if (!snapshot) {
      warnings.push({
        kind: 'dangling-legacy-claim',
        entry_id: c.entry_id,
        superseded_in_change: c.superseded_in_change,
      });
      continue;
    }
    if (!LEGACY_VALID_STATUS.has(c.new_status)) {
      warnings.push({
        kind: 'invalid-legacy-status',
        entry_id: c.entry_id,
        superseded_in_change: c.superseded_in_change,
        raw: c.new_status,
      });
      continue;
    }
    valid.push(c);
  }

  // 第 3 步(与有效性无关,对全部 claim 查目录名异常)
  for (const c of legacyClaims) {
    if (c.superseded_at === 'unknown') {
      warnings.push({ kind: 'malformed-dirname', superseded_in_change: c.superseded_in_change });
    }
  }

  // 第 2 步:有效 claim 按 entry_id 分组选 winner
  const groups = new Map<string, SupersedingDetail[]>();
  for (const c of valid) {
    (groups.get(c.entry_id) ?? groups.set(c.entry_id, []).get(c.entry_id)!).push(c);
  }
  const tombstones: LegacyRequirementTombstone[] = [];
  const retiredIds = new Set<string>();
  for (const [entryId, g] of groups) {
    // winner:superseded_at 最早;并列取 superseded_in_change 字典序
    const winner = g.reduce((a, b) => {
      if (a.superseded_at !== b.superseded_at) return a.superseded_at < b.superseded_at ? a : b;
      return a.superseded_in_change <= b.superseded_in_change ? a : b;
    });
    tombstones.push({
      entry_id: entryId,
      new_status: winner.new_status,
      rationale: winner.rationale,
      superseded_in_change: winner.superseded_in_change,
      superseded_at: winner.superseded_at,
      requirement_snapshot: byId.get(entryId) ?? null,
    });
    retiredIds.add(entryId);
    if (g.length > 1) {
      warnings.push({
        kind: 'duplicate-legacy-claim',
        entry_id: entryId,
        winner_superseded_in_change: winner.superseded_in_change,
        claimants: g.map((c) => c.superseded_in_change),
      });
    }
  }
  // tombstone 排序:跨平台确定
  tombstones.sort((a, b) => (a.entry_id < b.entry_id ? -1 : a.entry_id > b.entry_id ? 1 : 0));
  return { tombstones, warnings, retiredIds };
}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `pnpm vitest run tests/core/backlog/legacy-tombstone.test.ts`
Expected: PASS(4 个用例)。

- [ ] **Step 5:Commit**

```bash
git add src/core/backlog/render.ts tests/core/backlog/legacy-tombstone.test.ts
git commit -m "feat(backlog): splitLegacyClaims —— legacy 退役分流 + winner 选择"
```

---

### Task E3:`renderActiveMarkdown` Legacy Requirements 段 + `renderArchivedMarkdown` Retired 段

**Files:**
- Modify: `src/core/backlog/render.ts`、`src/core/backlog/index.ts`
- Test: `tests/core/backlog/legacy-source.test.ts`(E1 建的)

实现 spec §7.2 / §8.3 / §8.4:`renderActiveMarkdown` 加第三参 `legacyReqs`,渲染 `## Legacy Requirements` 段(只列 `unimplemented` 且未退役);`renderArchivedMarkdown` 加 Retired 段。

- [ ] **Step 1:扩 `renderActiveMarkdown` 测试**

```typescript
// 追加到 tests/core/backlog/legacy-source.test.ts
import { renderActiveMarkdown, renderArchivedMarkdown } from '../../../src/core/backlog/render.js';

describe('renderActiveMarkdown Legacy Requirements 段', () => {
  it('只渲染 unimplemented + 未退役条目;implemented 不渲染', () => {
    const legacyReqs = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        { id: 'LR-0001', title: '未实现', description: 'd', status: 'unimplemented' as const,
          source: { document: 'docs/SRS.md', section: '1', kind: 'srs' as const },
          evidence: [], confidence: 'medium' as const, priority: null, review: 'confirmed' as const, notes: '' },
        { id: 'LR-0002', title: '已实现', description: 'd', status: 'implemented' as const,
          source: { document: 'docs/SRS.md', section: '2', kind: 'srs' as const },
          evidence: ['src/x.ts:1'], confidence: 'high' as const, priority: null, review: 'confirmed' as const, notes: '' },
      ],
    };
    const md = renderActiveMarkdown([], [], legacyReqs);
    expect(md).toContain('## Legacy Requirements');
    expect(md).toContain('未实现');
    expect(md).not.toContain('已实现');
  });

  it('legacyReqs 为 null → 不渲染 Legacy Requirements 段、不改顶部待办行(向后兼容)', () => {
    const md = renderActiveMarkdown([], [], null);
    expect(md).not.toContain('## Legacy Requirements');
    expect(md).not.toContain('legacy requirements 待办');
  });

  it('legacyReqs 非 null → 顶部待办行补「另有 N 项 legacy requirements 待办」(F3,spec §7.2)', () => {
    const legacyReqs = {
      schema: 'forge-legacy-requirements/v1' as const,
      requirements: [
        { id: 'LR-0001', title: '未实现', description: 'd', status: 'unimplemented' as const,
          source: { document: 'docs/SRS.md', section: '1', kind: 'srs' as const },
          evidence: [], confidence: 'medium' as const, priority: null, review: 'confirmed' as const, notes: '' },
      ],
    };
    const md = renderActiveMarkdown([], [], legacyReqs);
    expect(md).toContain('另有 1 项 legacy requirements 待办');
  });
});

describe('renderArchivedMarkdown Retired 段', () => {
  it('scope tombstone 为空但有 legacy tombstone → Retired 段仍渲染(F2,不被早退吞掉)', () => {
    const lt = [
      {
        entry_id: 'LR-0001', new_status: 'completed', rationale: 'r',
        superseded_in_change: '2026-05-01-foo', superseded_at: '2026-05-01',
        requirement_snapshot: null,
      },
    ];
    const md = renderArchivedMarkdown([], lt);
    expect(md).toContain('## Legacy Requirements — Retired');
    expect(md).toContain('LR-0001');
  });

  it('无 legacy tombstone → archived.md 不含 Retired 段(既有项目不变)', () => {
    const md = renderArchivedMarkdown([], []);
    expect(md).not.toContain('Retired');
  });
});

describe('buildBacklog 双源(legacy-requirements.yaml 第二源)', () => {
  it('有 legacy-requirements.yaml → active.md 出 Legacy Requirements 段', async () => {
    const forge = await tmpForge();
    await writeFile(
      join(forge, 'legacy-requirements.yaml'),
      `schema: forge-legacy-requirements/v1
requirements:
  - id: LR-0001
    title: 未实现需求
    description: d
    status: unimplemented
    source: { document: docs/SRS.md, section: "1", kind: srs }
    evidence: []
    confidence: medium
    priority: null
    review: confirmed
    notes: ""
`,
      'utf8',
    );
    const result = await buildBacklog(forge);
    expect(result.activeMd).toContain('## Legacy Requirements');
    expect(result.activeMd).toContain('未实现需求');
  });
});

describe('buildBacklog reserved-archive-dirname(spec §8.5 第 6 项)', () => {
  it('archive 下存在名为 legacy-requirements 的目录 → active.md 报 reserved-archive-dirname warning', async () => {
    const forge = await tmpForge();
    await mkdir(join(forge, 'changes', 'archive', 'legacy-requirements'), { recursive: true });
    const result = await buildBacklog(forge);
    expect(result.activeMd).toContain('reserved-archive-dirname');
  });
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `pnpm vitest run tests/core/backlog/legacy-source.test.ts`
Expected: FAIL —— `renderActiveMarkdown` 仍是两参签名。

- [ ] **Step 3:写实现 —— 改 `renderActiveMarkdown` + 加 2 个 helper**

`renderActiveMarkdown`(`render.ts:169`)是既有函数,做 4 处改动,并在同文件加 2 个新 helper。

**改动 1 —— 签名**(加第 3、4 参,`warnings` 类型放宽;前两参不变 + 新参有默认值 → 既有调用点不破):
```typescript
export function renderActiveMarkdown(
  entries: AggregatedScopeEntry[],
  warnings: (BacklogWarning | LegacyBacklogWarning)[],
  legacyReqs: LegacyRequirementsFile | null = null,
  retiredLegacyIds: Set<string> = new Set(),
): string {
```

**改动 2 —— import**:文件头加
```typescript
import type { LegacyRequirementsFile, LegacyRequirement } from '../legacy-bridge/legacy-requirements.js';
```

**改动 3 —— 顶部待办行(F3,spec §7.2)**:函数体里 `lines.push(`> 待办计 ${openCount} 项(…)。`)` 那行**之后**插入(仅 legacyReqs 非 null 时补):
```typescript
const legacyOpen = openLegacyRequirements(legacyReqs, retiredLegacyIds);
if (legacyReqs) {
  lines.push(`> 另有 ${legacyOpen.length} 项 legacy requirements 待办(不计入上面 ${openCount})。`);
}
```
`countOpenBacklog`(scope 口径 future-work + out-of-scope)**不变**,legacy 不混入。

**改动 4 —— 追加 Legacy Requirements 段**:三段 category(Future Work / Out of Scope / Non-Goals)渲染**之后**、`return` 之前:
```typescript
lines.push(...renderLegacyRequirementsSection(legacyReqs, legacyOpen));
```

**新 helper 1 —— `openLegacyRequirements`**(active 口径过滤,§7.2/§8.4 共用):
```typescript
/** active 的 legacy requirement:unimplemented 且未退役(spec §7.2 / §8.4) */
function openLegacyRequirements(
  legacyReqs: LegacyRequirementsFile | null,
  retiredIds: Set<string>,
): LegacyRequirement[] {
  if (!legacyReqs) return [];
  return legacyReqs.requirements.filter(
    (r) => r.status === 'unimplemented' && !retiredIds.has(r.id),
  );
}
```

**新 helper 2 —— `renderLegacyRequirementsSection`**(spec §7.2):
```typescript
/** 渲染 active.md 的 ## Legacy Requirements 段;open 由 openLegacyRequirements 预过滤 */
function renderLegacyRequirementsSection(
  legacyReqs: LegacyRequirementsFile | null,
  open: LegacyRequirement[],
): string[] {
  if (!legacyReqs) return []; // 无 legacy-requirements.yaml → 不出段,active.md 对既有项目不变
  const lines: string[] = ['', `## Legacy Requirements (${open.length})`, ''];
  if (open.length === 0) {
    lines.push('(无)');
    return lines;
  }
  // 按来源文档分组
  const byDoc = new Map<string, LegacyRequirement[]>();
  for (const r of open) {
    const list = byDoc.get(r.source.document) ?? [];
    list.push(r);
    byDoc.set(r.source.document, list);
  }
  for (const [doc, list] of [...byDoc.entries()].sort()) {
    lines.push(`### \`${doc}\``, '');
    for (const r of list) {
      lines.push(
        `- \`${r.id}\` **${r.title}** — ${r.description}` +
          (r.priority ? ` (priority: ${r.priority})` : ''),
      );
    }
    lines.push('');
  }
  return lines;
}
```

> **实施提示:** `renderActiveMarkdown` 现有实现把内容拼进局部 `lines` 数组后 `return lines.join('\n').trimEnd() + '\n'`。改动 3/4 都是往那个 `lines` 里 `push`,不要新建数组、不要改 `return` 表达式。

- [ ] **Step 4:改 `renderArchivedMarkdown` 加 Retired 段 + 接线 `buildBacklog`**

`renderArchivedMarkdown`(`render.ts:211`)是既有函数。**关键:现有实现在 `tombstones` 为空时早退 `(无)` —— 必须去掉这个早退**(改成 `if/else` 落到末尾),否则「只有 legacy retired、无 scope tombstone」时 Retired 段会被吞掉(F2)。改造:

```typescript
export function renderArchivedMarkdown(
  tombstones: SupersedingDetail[],
  legacyTombstones: LegacyRequirementTombstone[] = [],
): string {
  const lines: string[] = [];
  lines.push('# Archived Backlog (Tombstones)');
  lines.push('');
  // ……原有两行 `> 生成产物 …` / `> 异常 …` 说明 + 空行,保持不变……
  // scope tombstone:原「if 空 → push (无) → return」改为 if/else,不再 return
  if (tombstones.length === 0) {
    lines.push('(无)');
  } else {
    for (const t of tombstones) {
      // ……原有 tombstone 渲染循环体(### / superseded_* / cancellation_reason / snapshot),保持不变……
    }
  }
  // legacy retired 段:仅当有 legacy tombstone 时追加(空则不出段)
  if (legacyTombstones.length > 0) {
    lines.push(...renderLegacyRetiredSection(legacyTombstones));
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** 渲染 archived.md 的 ## Legacy Requirements — Retired 段(spec §8.3);仅在 legacyTombstones 非空时被调用 */
function renderLegacyRetiredSection(tombstones: LegacyRequirementTombstone[]): string[] {
  const lines: string[] = ['', `## Legacy Requirements — Retired (${tombstones.length})`, ''];
  for (const t of tombstones) {
    lines.push(`### \`${t.entry_id}\``, '');
    lines.push(`- **new_status**: ${t.new_status}`);
    lines.push(`- **superseded_in_change**: ${t.superseded_in_change}`);
    lines.push(`- **superseded_at**: ${t.superseded_at}`);
    lines.push(`- **rationale**: ${t.rationale}`);
    lines.push(`- **requirement_snapshot**: ${JSON.stringify(t.requirement_snapshot)}`);
    lines.push('');
  }
  return lines;
}
```

> **不回归保证:** 上面对 `tombstones` 空/非空两分支的输出与改造前逐字节相同(只把 `return` 改成 `if/else` 落到末尾);`legacyTombstones` 为空时不追加任何东西。故没有 legacy 退役的既有项目 `archived.md` 输出不变,既有 backlog 测试不回归。

`index.ts` 的 `buildBacklog` —— **以下是完整最终版,取代 Task E1 Step 3 写的中间版**:

```typescript
// existsSync(node:fs)、join(node:path)已在 backlog/index.ts 第 5-6 行 import —— 复用,勿重复。
// 本任务新增的 import:
import { loadLegacyRequirements } from '../legacy-bridge/legacy-requirements.js';
import { splitLegacyClaims, type LegacyBacklogWarning } from './render.js';
import type { AggregatorResult } from '../scope/aggregator.js';

/** 聚合 + 渲染,返回两份 markdown(纯计算,不写盘)—— 双源(spec §7 / §8) */
export async function buildBacklog(forgeRoot: string): Promise<GenerateBacklogResult> {
  // 源一:archived scope-entry —— 空 archive 容错(spec §7.1)
  let agg: AggregatorResult;
  if (existsSync(join(forgeRoot, 'changes', 'archive'))) {
    agg = await scanArchivedFollowups(forgeRoot);
  } else {
    agg = { entries: [], superseding: [], skipped: [] };
  }
  // 源二:legacy-requirements.yaml
  const legacyReqs = await loadLegacyRequirements(forgeRoot);

  // legacy claim 分流(spec §8.2):在 deriveWarningsAndTombstones 之前
  const legacyClaims = agg.superseding.filter((s) => s.source_change === 'legacy-requirements');
  const scopeClaims = agg.superseding.filter((s) => s.source_change !== 'legacy-requirements');
  const { tombstones: legacyTombstones, warnings: legacyWarnings, retiredIds } = splitLegacyClaims(
    legacyClaims,
    legacyReqs?.requirements ?? [],
  );
  const { warnings: scopeWarnings, tombstones } = deriveWarningsAndTombstones(
    scopeClaims,
    agg.skipped,
  );
  // reserved-archive-dirname:archive 下若真存在名为 legacy-requirements 的目录(spec §8.5 第 6 项)
  const reservedWarnings: LegacyBacklogWarning[] = existsSync(
    join(forgeRoot, 'changes', 'archive', 'legacy-requirements'),
  )
    ? [{ kind: 'reserved-archive-dirname' }]
    : [];
  // legacy warning + scope warning + reserved 合并,一起渲染进 active.md ## Warnings 段
  const allWarnings = [...scopeWarnings, ...legacyWarnings, ...reservedWarnings];
  const activeMd = renderActiveMarkdown(agg.entries, allWarnings, legacyReqs, retiredIds);
  const archivedMd = renderArchivedMarkdown(tombstones, legacyTombstones);
  const openCount = countOpenBacklog(agg.entries);
  return { openCount, warningCount: allWarnings.length, activeMd, archivedMd };
}
```

> **说明:** Task E1 Step 3 先写一个只有「双源 + 空 archive 容错」的中间版 `buildBacklog`(此时 E1 测试 FAIL,因 `renderActiveMarkdown` 还是两参);E2 加 `splitLegacyClaims`;E3 此处用上面的完整版整体替换,E1/E2/E3 三处测试此刻整体转绿。`renderActiveMarkdown` 的 `warnings` 参类型须放宽为 `(BacklogWarning | LegacyBacklogWarning)[]`。

> **实施提示:** `renderWarningLine`(`render.ts:125`)的 `switch` 须补 `dangling-legacy-claim` / `invalid-legacy-status` / `duplicate-legacy-claim` / `reserved-archive-dirname` 四个 case(`malformed-dirname` 已有)。`BacklogWarning` 联合类型并入 `LegacyBacklogWarning`。`renderActiveMarkdown` 的 `warnings` 参类型相应放宽为 `(BacklogWarning | LegacyBacklogWarning)[]`。

- [ ] **Step 5:运行 Phase E 全部测试,确认通过**

Run: `pnpm vitest run tests/core/backlog/`
Expected: PASS —— 含 E1 的 `legacy-source.test.ts`(此刻整体转绿)、E2 的 `legacy-tombstone.test.ts`,以及既有 backlog 测试无回归。

- [ ] **Step 6:Commit**

```bash
git add src/core/backlog/render.ts src/core/backlog/index.ts tests/core/backlog/legacy-source.test.ts
git commit -m "feat(backlog): active.md Legacy Requirements 段 + archived.md Retired 段"
```

---

## Phase F:skill + 文档

### Task F1:`legacy-bridge-fulfillment` skill 加 `extract` op

**Files:**
- Modify: `skills/legacy-bridge-fulfillment/SKILL.md`

实现 spec §9:skill 流程补 `extract` op,加反偷懒约束(判 `implemented` 必须真读代码 + 给 file:line evidence)。

- [ ] **Step 1:改 SKILL.md**

`skills/legacy-bridge-fulfillment/SKILL.md` 的 `description` 末尾补 `extract`;「流程」第 2 步与「反偷懒约束」补:

```markdown
2. 对 `tasks[]` 里每个 task:按 `task.prompt` 做判定 —— `sync-check` / `regenerate` / `extract` 必须**真读对应代码 / 文档**做判断,不许凭空产出。

## 反偷懒约束(硬性)

- **不许伪造判定**:`sync-check` 的「无差异」、`quality-judge` 的「fact preserved」、`extract` 的「`status: implemented`」必须基于真实比对。
- **`extract` 判 implemented 必须给真实 evidence**:`status: implemented` 的条目,`evidence` 数组必须含真实 `file:line`(你确实读过该代码);判不准就标 `unimplemented` 或 `confidence: low`,**不许编造行号**。
```

- [ ] **Step 2:跑 `pnpm build`(双源 md5 sync)**

Run: `pnpm build`
Expected: 成功;`src/core/templates/` 与 `dist/core/templates/` 下 `legacy-bridge-fulfillment` 模板同步更新。

- [ ] **Step 3:格式检查**

Run: `pnpm format:check`
Expected: PASS。

- [ ] **Step 4:Commit**

```bash
git add skills/legacy-bridge-fulfillment/SKILL.md src/core/templates/
git commit -m "docs(legacy-bridge): fulfillment skill 加 extract op + 反偷懒约束"
```

---

### Task F2:文档 —— legacy-bridge.md / cli-reference.md / CHANGELOG.md / backlog-readme.md

**Files:**
- Modify: `docs/legacy-bridge.md`、`docs/cli-reference.md`、`CHANGELOG.md`、`src/core/backlog/assets/backlog-readme.md`

- [ ] **Step 1:`docs/legacy-bridge.md`** —— 概览表加一行 `Layer 3b | forge legacy-bridge extract | 抽老文档需求 → backlog`;加一节描述四模式工作流 + spec §4.5 的 `--api` evidence 较粗诚实声明。

- [ ] **Step 2:`docs/cli-reference.md`** —— legacy-bridge 子命令清单加 `extract`(4 个 flag:`--apply` / `--api` / `--finalize` + 默认 emit)。

- [ ] **Step 3:`CHANGELOG.md`** —— `[Unreleased]` 段 `Added` 加:`legacy-bridge Layer 3b:forge legacy-bridge extract —— 从老文档抽取需求条目并接入 backlog registry 第二数据源`。

- [ ] **Step 4:`src/core/backlog/assets/backlog-readme.md`** —— 「数据源」段补第二源:`forge/legacy-requirements.yaml`(由 forge legacy-bridge extract 产)→ active.md 的 Legacy Requirements 段。

- [ ] **Step 5:格式检查 + Commit**

```bash
pnpm format:check
git add docs/legacy-bridge.md docs/cli-reference.md CHANGELOG.md src/core/backlog/assets/backlog-readme.md
git commit -m "docs(legacy-bridge): Layer 3b extract 文档 + backlog 双源说明"
```

---

## 收尾:全量校验

- [ ] **跑 CI 五步**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`
Expected: 全 PASS。任一步失败即定位修复,不得跳过。

- [ ] **最终 Commit(若收尾有修补)**

```bash
git add -A
git commit -m "chore(legacy-bridge): Layer 3b 收尾校验修补"
```

---

## Self-Review(规划期自查)

**Spec 覆盖核对:**
- §2 架构 / 四模式 → Task D2 ✓
- §3 schema → Task A1 ✓
- §4 抽取流程(prep/apply/api)→ Task B4 / C1-C3 / D2 ✓
- §4.5 `--api` evidence 分模式 → Task F2 文档声明 ✓(强制阈值属 spec §13 留待项,实施时若 `--apply` 加 evidence 校验须分模式)
- §5 文档发现 + .docx/.pdf → Task B1/B2/B3 ✓
- §5.3 客户数据门 → Task D2 透明告知打印 + 复用 `assertLlmOptIn` ✓
- §6 增量合并 + ID 分配 → Task C2 / A2 / D2(`--finalize`)✓
- §7 backlog 双源 + 空 archive 容错 → Task E1/E3 ✓
- §8 退役 superseding 分流 + winner → Task E2 ✓
- §9 skill → Task F1 ✓

**类型一致性:** `LegacyRequirement` / `LegacyRequirementsFile`(A1)、`DiscoveredSource` / `ExtractedRequirement` / `DraftEntry` / `ExtractChangeKind`(B/C)、`LegacyRequirementTombstone` / `LegacyBacklogWarning` / `SplitLegacyResult`(E2)跨任务一致。`runExtractCommand` 的 `ExtractCommandOpts` 四字段(D2)与注册 action(D2 Step 4)一致。

**留待项(spec §13,实施时定):** `--apply` 是否对 agent 模式强校验 `evidence`;`pdf-parse` 若双平台 CI 有问题改选 `pdfjs-dist`;whole-repo ignore 规则细化;`forge backlog list` 是否列 legacy requirements(本计划未含,属可选)。

---

## Codex 对抗性审查处置(本计划)

本实施计划经 Codex 多轮对抗性审查;每条 finding 均独立对照 forge-repo 实际代码核实后处置。

### Round 1:4 真,全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | HIGH     | 真 —— 依赖顺序行写「线性 A→B→C→D」与 B4「D1 须先于 B4」矛盾;B4 用 `op:'extract'`,该值 D1 才入 `LlmOp`,顺序反则编译失败 | 改依赖顺序行:明确 D1 提前到 B4 之前,给出完整执行序 |
| 2   | HIGH     | 真 —— E3 接线算了 `legacyWarnings` 却没合进 `renderActiveMarkdown` 调用,legacy warning 被静默丢弃 | E3 的 `buildBacklog` 重写为完整版:`allWarnings = [...scope, ...legacy, ...reserved]` 一起传 |
| 3   | MEDIUM   | 真 —— `reserved-archive-dirname` 只声明 warning kind、无检测逻辑;检测需 `existsSync` 属 `buildBacklog` 层 | E3 `buildBacklog` 加 `existsSync(changes/archive/legacy-requirements)` 检测 + 测试 |
| 4   | MEDIUM   | 真 —— `runExtractFinalize` 在 `generateBacklog` 失败时只 warn 仍返回 `LB_EXIT_OK`,掩盖 active.md 陈旧 | 改返回 `LB_EXIT_PARTIAL_SUCCESS` + 明确提示 + 加无 mock 的测试(占用 `forge/backlog` 触发) |

### Round 2:3 真,全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | HIGH     | 真 —— D2 执行序在 E1 前,D2 `--finalize` 测试 `tmpProject` 没建 `forge/changes/archive/`,原版 `buildBacklog` 无条件 `scanArchivedFollowups` 会抛错 | D2 的 `tmpProject` 建空 `changes/archive/` 目录,使 `generateBacklog` 在 E1 容错落地前也跑得通 |
| 2   | MEDIUM   | 真 —— `renderArchivedMarkdown` 在 scope tombstone 为空时早退 `(无)`,「只有 legacy retired」时 Retired 段被吞 | E3 Step 4 明确去掉早退、改 `if/else`;补「scope 空 + legacy 非空」测试 |
| 3   | MEDIUM   | 真 —— spec §7.2 要求顶部待办行补「另有 N 项 legacy requirements 待办」,E3 只加段未改顶部行 | E3 Step 3 加改动 3:顶部行补 legacy 计数;补顶部行断言测试 |

### Round 3:3 真(MED)+ 1 真(LOW)+ 1 自查发现的 latent bug,全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | MEDIUM   | 真 —— B4 测试用 `sk-...` 作 secret,但 `DEFAULT_REDACT_RULES`(`redact.ts:7`)无 OpenAI `sk-` 规则,redact 不掉、测试不会绿 | B4 测试 fixture 换成 `AKIAIOSFODNN7EXAMPLE`(命中 `aws-access-key` 规则) |
| 2   | MEDIUM   | 真 —— C2 `changed` 判定只比 `title/description/status`,漏 `evidence/confidence`,与 spec §6.1「全一致」不符 | `changed` 补 `confidence` + `evidence`(JSON 比);补「仅 confidence/evidence 变 → changed」测试 |
| 3   | MEDIUM   | 真 —— E1 的 `buildBacklog` 调 3 参 `renderActiveMarkdown`,但该函数 E3 才改签名 → E1 单独提交编译失败 | E1 重构为「只做空 archive 容错、仍两参」,自洽可编译;双源 + 第二源测试移入 E3 |
| 4   | LOW      | 真 —— D2 测试块实为 5 个 `it`,计划写「PASS(4 个用例)」 | 改为「5 个用例」 |
| 5   | —        | 自查发现(Codex 未报)—— C2 测试用 `req()` 但 `extractor.test.ts` 只定义了 `extracted()`,`req` 未定义、测试不编译 | C2 测试块加 `req` helper + `LegacyRequirement` 类型 import |

### Round 4:2 真(MED),全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | MEDIUM   | 真 —— `buildExtractTasks` 只 redact 文档正文,`codeIndex` 原样进 prompt;spec §4.1「全部输入(含代码索引)redact」 | `buildExtractTasks` 对 `codeIndex.join` 也跑 redact;`buildExtractPrompt` 改收 `redactedCodeIndex`;补代码索引 redact 测试 |
| 2   | MEDIUM   | 真 —— C2 conflict 分支 `olds.length>1 && news.length>=1` 时旧 confirmed 条目被静默丢弃 | conflict 分支补旧条目处理:`news` 空→`vanished`、否则→`conflict`(清 id);补「旧侧多条」测试 |

### Round 5:1 HIGH + 1 MEDIUM,全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | HIGH     | 真 —— D2 import 块重复 import `readdir`(`legacy-bridge.ts:6` 已有),还多余别名 `fsWriteFile`/`fsReadFile`/`*Extract` → duplicate identifier,typecheck 失败 | 删重复 import;D2 代码改用既有 `readFile/writeFile/readdir/mkdir/join/existsSync/parseYaml/stringifyYaml`,只给 `node:fs`/`node:path` 两行各补 `Dirent`/`relative` |
| 2   | MEDIUM   | 真 —— 计划没把已确认 yaml 快照写进 manifest `meta`,`--apply` 回读磁盘 → emit/apply 间 yaml 被改则 diff 基线漂移,违背 spec §4.1/§6.1 的 manifest 快照契约 | emit 时 `loadLegacyRequirements` 写入 `meta.confirmed_snapshot`;`--apply` 从 `manifest.meta` 取快照(`--api` 仍读磁盘,单进程无 gap) |

### Round 6:1 真(MED),全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | MEDIUM   | 真 —— E1/E3 的 `buildBacklog` 片段重复 import `existsSync`/`join`(`backlog/index.ts:5-6` 已有)→ duplicate identifier,typecheck 失败 | E1/E3 import 指引改为「复用既有 `existsSync`/`join`,只新增缺失的 `AggregatorResult`/`loadLegacyRequirements`/`splitLegacyClaims` 等」 |

### Round 7:0 HIGH / 0 MEDIUM —— 收敛(顺手处置 1 LOW)

Codex 对照既有源码逐一核实,Round 1-6 所有已处置项均无复发。仅剩 1 条 LOW:

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | LOW      | 真 —— A1 `validateLegacyRequirementsFile`、C1 `parseExtractResults` 对 `evidence` 只校验 `Array.isArray`,未校验元素是 `string` | 两处补 `.every((x) => typeof x === 'string')` 校验 |

**收敛声明:** Plan 有效 finding 趋势 **4 → 3 → 4 → 2 → 2 → 1 → 0(HIGH/MED)**。Round 7 达成 **0 HIGH / 0 MEDIUM**(用户设定的收敛目标),残留的 1 条 LOW 亦已顺手处置。每轮 finding 均独立对照 forge-repo 实际代码核实后处置,其中 Round 3 还自查发现 1 条 Codex 未报的 latent bug(`req` helper 未定义)。计划可作为执行依据。
