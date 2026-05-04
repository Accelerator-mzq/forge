# Plan 2:Core Engine(Phase 1)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**:实现 forge 的核心 library 代码(parse / validate / hash / artifact-graph / specs-sync / marker-validation),全部 unit-tested、无 CLI、无 fs adapter——`pnpm test` 跑通 100+ 单元测试。Plan 1 punch list 一次性修完。

**Architecture**:在 `src/core/` 下分模块,每个模块单一职责 + 公共 type 暴露。fs IO 限制到 parse/specs-sync/hash 内部(都是读操作);测试用 in-memory fixtures + temp dirs 验证。**不**写 CLI,**不**写 harness adapter,**不**写 templates 真内容(占位即可)。

**Tech Stack**:已有(TypeScript 5.6+ + Node 20.19+ + ESM + Vitest 2 + pnpm 9);新增依赖:`yaml`(YAML 解析,Plan 2 添加)、`gray-matter`(markdown frontmatter,Plan 2 添加)。

**Spec 引用**:[`docs/specs/2026-05-04-forge-fusion-design.md`](../specs/2026-05-04-forge-fusion-design.md) §2.1 npm package 内部模块、§3.4 Marker YAML schema、§3.4.1 类型校验、§3.5 archive 顺序原子化、§4.4 不变量保护表。

**Plan 1 punch list 移交**(本 Plan 头部 4 个 task 处理):
1. CI 加 `concurrency` + `timeout-minutes: 15` + dev 分支触发
2. `tsconfig.test.json` + ESLint type-aware rules
3. spec §5.1 release-gate smoke 范围 + 决策快照 #4 / #18 收紧到 v0.1 = 2 harness
4. **不**创建 `src/cli/index.ts`(留给 Plan 3)——但要确保 `package.json#bin` 仍合规,Plan 2 不发布 npm

---

## File Structure(Plan 2 完成时新增/修改)

```
forge-repo/
├── .github/workflows/ci.yml              ← 修改:concurrency + timeout + dev 触发
├── tsconfig.json                         ← 修改:加 references 指向 tsconfig.test.json
├── tsconfig.test.json                    ← 新增:测试用 ts config(include tests)
├── eslint.config.js                      ← 修改:加 type-aware rule block(只对 src)
├── package.json                          ← 修改:devDeps 加 yaml + gray-matter
├── docs/specs/2026-05-04-forge-fusion-design.md  ← 修改:决策 #4/#18 收紧
├── src/
│   ├── core/
│   │   ├── schema/
│   │   │   ├── types.ts                  ← spec-driven schema 类型
│   │   │   └── index.ts                  ← 导出
│   │   ├── parse/
│   │   │   ├── markdown.ts               ← markdown frontmatter + sections
│   │   │   ├── yaml.ts                   ← config.yaml 解析
│   │   │   ├── proposal.ts               ← proposal.md 解析
│   │   │   ├── specs.ts                  ← spec md (GWT scenario) 解析
│   │   │   ├── design.ts                 ← design.md 解析
│   │   │   ├── tasks.ts                  ← tasks.md (checkbox) 解析
│   │   │   └── index.ts                  ← 导出
│   │   ├── validate/
│   │   │   ├── types.ts                  ← ValidationResult/Error 类型
│   │   │   ├── proposal.ts               ← 校验 proposal
│   │   │   ├── specs.ts                  ← 校验 spec GWT
│   │   │   ├── tasks.ts                  ← 校验 tasks 不变量(append-only / 已勾不重排)
│   │   │   ├── change.ts                 ← 顶层 validate(changeId)
│   │   │   ├── marker-schema.ts          ← marker YAML 类型校验(§3.4.1)
│   │   │   └── index.ts
│   │   ├── hash/
│   │   │   ├── tasks.ts                  ← computeTasksHash
│   │   │   ├── content.ts                ← computeContentHash
│   │   │   ├── log.ts                    ← computeLogHash
│   │   │   ├── diff.ts                   ← computeDiffHash(git pathspec)
│   │   │   └── index.ts
│   │   ├── artifact-graph/
│   │   │   ├── types.ts                  ← ArtifactGraph
│   │   │   ├── builder.ts                ← 构建依赖图
│   │   │   └── index.ts
│   │   ├── markers/
│   │   │   ├── types.ts                  ← VerifyMarker / ReviewMarker / FailedMarker
│   │   │   ├── parse.ts                  ← 解析 4 种 marker YAML
│   │   │   └── index.ts
│   │   ├── specs-sync/
│   │   │   ├── deltas.ts                 ← 解析 specs deltas
│   │   │   ├── apply.ts                  ← 应用 deltas(纯 fs 操作,internal)
│   │   │   └── index.ts
│   │   ├── templates/
│   │   │   ├── commands/                 ← 占位空目录(Plan 4 填实)
│   │   │   ├── skills/                   ← 占位空目录
│   │   │   └── index.ts                  ← 占位 export
│   │   └── bootstrap/
│   │       └── index.ts                  ← 占位 export(Plan 4 填实 using-forge 内容)
│   └── index.ts                          ← 修改:重新导出 core 全部公共 API
└── tests/
    ├── core/
    │   ├── schema.test.ts
    │   ├── parse/
    │   │   ├── markdown.test.ts
    │   │   ├── yaml.test.ts
    │   │   ├── proposal.test.ts
    │   │   ├── specs.test.ts
    │   │   ├── design.test.ts
    │   │   └── tasks.test.ts
    │   ├── validate/
    │   │   ├── proposal.test.ts
    │   │   ├── specs.test.ts
    │   │   ├── tasks.test.ts
    │   │   ├── change.test.ts
    │   │   └── marker-schema.test.ts
    │   ├── hash/
    │   │   ├── tasks.test.ts
    │   │   ├── content.test.ts
    │   │   ├── log.test.ts
    │   │   └── diff.test.ts
    │   ├── artifact-graph.test.ts
    │   ├── markers.test.ts
    │   └── specs-sync.test.ts
    ├── fixtures/
    │   ├── valid-change/                 ← 完整合法 change(供多个 test 共用)
    │   │   ├── proposal.md
    │   │   ├── specs/
    │   │   │   └── login.md
    │   │   ├── design.md
    │   │   └── tasks.md
    │   ├── markers/
    │   │   ├── verify-passed.yaml
    │   │   ├── review-passed.yaml
    │   │   ├── verify-failed.yaml
    │   │   ├── review-failed.yaml
    │   │   └── invalid-types.yaml
    │   └── deltas/
    │       └── ...
    └── smoke.test.ts                     ← 已有(Plan 1 Task 3),Phase 1 起替换为更扎实测试
```

---

## Phase 0:Plan 1 Punch List 修复

> Plan 1 final reviewer 给的必修项,先一次性清掉。这一段不增加新功能,只把仓库设施补齐到 Plan 2 实施需要的状态。

### Task 1:CI 加 concurrency + timeout-minutes + dev 触发

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1.1:打开 ci.yml,在 `on:` block 加 dev 触发**

把 `on:` block 改为:

```yaml
on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]
```

- [ ] **Step 1.2:在 `jobs:` 同级别加 `concurrency` 顶层字段**

在 `on:` block 之后、`jobs:` 之前插入:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

含义:同一分支的连续 push 会取消旧 job(节省 minutes),不同分支并行不受影响。

- [ ] **Step 1.3:在 `jobs.test:` 下加 `timeout-minutes: 15`**

```yaml
jobs:
  test:
    name: Test on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    timeout-minutes: 15            # 新增
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
```

含义:单 job 超过 15 分钟 GitHub 自动 kill。当前最长 58s,15 分钟有 15x 缓冲。

- [ ] **Step 1.4:Commit + push**

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add .github/workflows/ci.yml
git commit -m "ci: add concurrency cancel + 15min timeout + dev branch triggers"
git push
```

- [ ] **Step 1.5:验证 push 触发 CI 并绿**

```bash
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

预期:Run conclusion=success,Linux + Windows 两个 job 都绿。

---

### Task 2:tsconfig.test.json + ESLint type-aware rules

**Files:**
- Create: `tsconfig.test.json`
- Modify: `tsconfig.json`(加 references)
- Modify: `eslint.config.js`(加 type-aware rule block)

- [ ] **Step 2.1:写 `tsconfig.test.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist", "spike"]
}
```

- [ ] **Step 2.2:更新 `package.json` 的 `typecheck` 脚本同时跑两个 config**

打开 `package.json`,把 `scripts.typecheck` 改为:

```json
"typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit"
```

- [ ] **Step 2.3:跑新 typecheck 验证不破坏现有代码**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm typecheck
```

预期:退出码 0,无错误。如果 `tests/smoke.test.ts` 有 `as any` 等 type-aware 抓出来的问题,在 Step 2.5 再处理。

- [ ] **Step 2.4:更新 `eslint.config.js` 加 src 专用 type-aware rule block**

打开 `eslint.config.js`,**追加**(不替换原有的)一个新 block:

```javascript
// eslint.config.js — 末尾追加:src 专用 type-aware block
// 注意:tests/ 不开 type-aware(避免 vitest 全局 globals 报错噪音)
{
  files: ['src/**/*.ts'],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      project: ['./tsconfig.json'],   // src 走 tsconfig.json,有 type info
    },
  },
  plugins: {
    '@typescript-eslint': tsPlugin,
  },
  rules: {
    // type-aware rules — 只对 src 生效
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
  },
},
```

放在原有的 src+tests 共用 block **之后**(末尾)。这样 ESLint 用 last-wins 规则把 src 的 type-aware 加上去。

- [ ] **Step 2.5:跑 lint 验证**

```bash
pnpm lint
```

预期:退出码 0。如果 `src/index.ts`(目前只 export 一个 const)报错,极少见(常量没 floating promise 风险)。

- [ ] **Step 2.6:Commit + push**

```bash
git add tsconfig.test.json tsconfig.json package.json eslint.config.js
git commit -m "chore: add tsconfig.test.json + ESLint type-aware rules for src/"
git push
```

- [ ] **Step 2.7:等 CI 验证**

```bash
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

预期:Linux + Windows 都绿。

---

### Task 3:同步 spec — 收紧到 v0.1 = 2 harness

**Files:**
- Modify: `docs/specs/2026-05-04-forge-fusion-design.md`

- [ ] **Step 3.1:更新决策快照 #4(支持 harness)**

找到第 17 行附近:

```
| 4 | 支持 harness | Claude Code、Codex、OpenCode(目标;v0.1 实际范围由决策 18 的 Phase 0.5 spike 决定) |
```

改为:

```
| 4 | 支持 harness | **v0.1 = Claude Code + Codex(2 harness)**;OpenCode 推 v0.2 等 plugin(`experimental.chat.messages.transform`)实现。基于 Phase 0.5 spike 实测结果(详见 [`spike/RESULTS.md`](../../spike/RESULTS.md)) |
```

- [ ] **Step 3.2:更新决策快照 #18**

找到第 31 行附近:

```
| 18 | 三 harness 验证 | Phase 0.5 spike(0.5 周)gating,结果决定 v0.1 实际覆盖面 |
```

改为:

```
| 18 | 三 harness spike 结果 | **已完成**:Claude Code PASS / Codex PASS / OpenCode FAIL(skill 路径只注册工具不自动注入,需写 plugin)→ v0.1 收紧到 2 harness |
```

- [ ] **Step 3.3:更新 §5.1 release-gate smoke test 范围**

找到 §5.1 段落,把"v0.1 实际覆盖到的每个 harness 都跑一次(实际覆盖范围由 Phase 0.5 spike 决定,可能是 1-3 个)"改为:

```
v0.1 实际覆盖到的每个 harness 都跑一次:**Claude Code 和 Codex 2 个**(基于 Phase 0.5 spike 结果)。OpenCode v0.2 加。
```

把后面的"必须人工跑一遍 v0.1 覆盖的全部 smoke,不通过不发版(若 v0.1 只覆盖 Claude Code,只跑 Claude Code smoke;若覆盖三个,三个都跑)"改为:

```
必须人工跑一遍 Claude Code + Codex 两个 smoke,任一不通过不发版(对应 v0.1 实际范围)。
```

- [ ] **Step 3.4:更新 Phase 0.5 章节末尾退出标准记录**

找到 §6 Phase 0.5 退出标准与 v0.1 范围决策段落,在末尾加一行:

```
**实际结果**(Phase 0.5 spike 完成于 2026-05-05):
- Claude Code:PASS — `.claude/skills/<name>/SKILL.md` 自动注入有效
- Codex:PASS — `.agents/skills/<name>/SKILL.md`(共享 Claude Agent SDK 约定)自动注入有效
- OpenCode:FAIL — skill 路径只注册工具不自动 inject,推 v0.2(plugin 实现)
- **v0.1 = Claude Code + Codex(2 harness)**
```

- [ ] **Step 3.5:更新 §6 风险与开放问题 #1**

找到 "三 harness 注入机制差异大——由 Phase 0.5 spike 显式验证,...",改为:

```
1. **OpenCode 自动注入需 plugin**——Phase 0.5 spike 已确认 OpenCode skill 路径只注册工具不自动 inject。v0.2 通过实现 `experimental.chat.messages.transform` plugin 解决,参考 superpowers `.opencode/plugins/superpowers.js`。v0.1 不支持 OpenCode。
```

- [ ] **Step 3.6:Commit + push**

```bash
git add docs/specs/2026-05-04-forge-fusion-design.md
git commit -m "docs(spec): sync v0.1 scope to Claude+Codex 2 harness (Phase 0.5 spike result)"
git push
```

CI 跑过即可(只改 markdown,所有步骤应该秒过)。

---

## Phase 1:Core Engine 实施

### Task 4:新增依赖 + 项目结构骨架

**Files:**
- Modify: `package.json`(devDeps 加 yaml + gray-matter)
- Create: `src/core/{schema,parse,validate,hash,artifact-graph,markers,specs-sync,templates,bootstrap}/`(创建所有空目录占位)

- [ ] **Step 4.1:加依赖**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm add yaml gray-matter
```

预期:`package.json` 的 `dependencies` 加上:
```json
"yaml": "^2.x.x",
"gray-matter": "^4.x.x"
```

`pnpm-lock.yaml` 同步更新。

- [ ] **Step 4.2:创建 src/core/ 子目录结构**

```bash
cd D:/ClaudeProject/opsp/forge-repo/src
mkdir -p core/{schema,parse,validate,hash,artifact-graph,markers,specs-sync,templates,bootstrap}
mkdir -p core/templates/{commands,skills}
```

- [ ] **Step 4.3:每个新目录加 `index.ts` 占位**

每个目录创建一个 `index.ts`,内容只一行(中文注释 + 占位 export):

```typescript
// 占位 — 内容由后续 task 填充
export {};
```

具体路径:`src/core/schema/index.ts`、`src/core/parse/index.ts`、`src/core/validate/index.ts`、`src/core/hash/index.ts`、`src/core/artifact-graph/index.ts`、`src/core/markers/index.ts`、`src/core/specs-sync/index.ts`、`src/core/templates/index.ts`、`src/core/bootstrap/index.ts`。

- [ ] **Step 4.4:跑 build + typecheck 验证**

```bash
pnpm build
pnpm typecheck
```

预期:全部退出码 0。

- [ ] **Step 4.5:Commit + push**

```bash
git add package.json pnpm-lock.yaml src/core/
git commit -m "feat(core): scaffold core/ subdirectories + add yaml + gray-matter deps"
git push
```

---

### Task 5:Schema 类型定义(spec-driven schema)

**Files:**
- Create: `src/core/schema/types.ts`
- Modify: `src/core/schema/index.ts`
- Test: `tests/core/schema.test.ts`

- [ ] **Step 5.1:写 schema 类型(`src/core/schema/types.ts`)**

```typescript
// spec-driven schema 类型定义 — 对应 forge/config.yaml + 默认 schema

/**
 * forge/config.yaml 的解析结果类型。
 * 详见 spec §2.2.1。
 */
export interface ForgeConfig {
  schema: string; // e.g., 'forge-spec-driven/v1'
  context?: string;
  rules?: {
    proposal?: string[];
    specs?: string[];
    design?: string[];
    tasks?: string[];
  };
  code_paths?: {
    include?: string[];
    exclude?: string[];
  };
}

/**
 * 默认 spec-driven schema 的 artifact 列表(决定哪些文件构成一个 change)。
 */
export const DEFAULT_ARTIFACTS = ['proposal', 'specs', 'design', 'tasks'] as const;
export type ArtifactKind = (typeof DEFAULT_ARTIFACTS)[number];

/**
 * code_paths.exclude 的默认值(不可关闭,与用户声明合并使用)。
 * 详见 spec §3.4 hash 计算规则。
 */
export const DEFAULT_CODE_EXCLUDE = [
  'forge/**',
  '**/*.md',
  '**/.verify-passed',
  '**/.review-passed',
  '**/.verify-failed',
  '**/.review-failed',
  '**/.evidence/**',
] as const;
```

- [ ] **Step 5.2:更新 `src/core/schema/index.ts` 重新导出**

```typescript
// src/core/schema/index.ts
export * from './types.js';
```

- [ ] **Step 5.3:写测试 `tests/core/schema.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { DEFAULT_ARTIFACTS, DEFAULT_CODE_EXCLUDE } from '../../src/core/schema/index.js';
import type { ForgeConfig, ArtifactKind } from '../../src/core/schema/index.js';

describe('schema/types', () => {
  it('should expose DEFAULT_ARTIFACTS in correct order', () => {
    expect(DEFAULT_ARTIFACTS).toEqual(['proposal', 'specs', 'design', 'tasks']);
  });

  it('should expose DEFAULT_CODE_EXCLUDE matching spec §3.4', () => {
    // 必含的关键 exclude
    expect(DEFAULT_CODE_EXCLUDE).toContain('forge/**');
    expect(DEFAULT_CODE_EXCLUDE).toContain('**/*.md');
    expect(DEFAULT_CODE_EXCLUDE).toContain('**/.verify-passed');
    expect(DEFAULT_CODE_EXCLUDE).toContain('**/.review-passed');
    expect(DEFAULT_CODE_EXCLUDE).toContain('**/.evidence/**');
  });

  it('should accept a valid ForgeConfig type', () => {
    const config: ForgeConfig = {
      schema: 'forge-spec-driven/v1',
      context: 'TypeScript + Node',
      rules: { proposal: ['Include rollback plan'] },
      code_paths: { include: ['src/**'], exclude: ['src/generated/**'] },
    };
    expect(config.schema).toBe('forge-spec-driven/v1');
  });

  it('should accept ArtifactKind as union', () => {
    const k: ArtifactKind = 'proposal';
    expect(['proposal', 'specs', 'design', 'tasks']).toContain(k);
  });
});
```

- [ ] **Step 5.4:跑测试验证**

```bash
pnpm test tests/core/schema.test.ts
```

预期:`Test Files  1 passed (1)` + `Tests  4 passed (4)`。

- [ ] **Step 5.5:Commit**

```bash
git add src/core/schema/ tests/core/schema.test.ts
git commit -m "feat(core/schema): add spec-driven schema types and constants"
```

不 push(后续 task 完一批再统一 push)。

---

### Task 6:Markdown 解析器(frontmatter + sections)

**Files:**
- Create: `src/core/parse/markdown.ts`
- Modify: `src/core/parse/index.ts`
- Test: `tests/core/parse/markdown.test.ts`
- Fixture: `tests/fixtures/markdown/with-frontmatter.md`、`without-frontmatter.md`

- [ ] **Step 6.1:写 fixture `tests/fixtures/markdown/with-frontmatter.md`**

```markdown
---
title: Sample
tags: [a, b]
---

# Heading 1

Body of heading 1.

## Heading 2

Body of heading 2.
```

- [ ] **Step 6.2:写 fixture `tests/fixtures/markdown/without-frontmatter.md`**

```markdown
# Just Heading

Body without frontmatter.
```

- [ ] **Step 6.3:写测试 `tests/core/parse/markdown.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../../src/core/parse/markdown.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixturesDir = resolve(__dirname, '../../fixtures/markdown');

function loadFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), 'utf8');
}

describe('parseMarkdown', () => {
  it('extracts frontmatter when present', () => {
    const content = loadFixture('with-frontmatter.md');
    const result = parseMarkdown(content);
    expect(result.frontmatter.title).toBe('Sample');
    expect(result.frontmatter.tags).toEqual(['a', 'b']);
  });

  it('returns empty frontmatter when absent', () => {
    const content = loadFixture('without-frontmatter.md');
    const result = parseMarkdown(content);
    expect(result.frontmatter).toEqual({});
  });

  it('parses sections by heading level', () => {
    const content = loadFixture('with-frontmatter.md');
    const result = parseMarkdown(content);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.level).toBe(1);
    expect(result.sections[0]?.heading).toBe('Heading 1');
    expect(result.sections[1]?.level).toBe(2);
    expect(result.sections[1]?.heading).toBe('Heading 2');
  });

  it('preserves section body content', () => {
    const content = loadFixture('with-frontmatter.md');
    const result = parseMarkdown(content);
    expect(result.sections[0]?.body.trim()).toBe('Body of heading 1.');
    expect(result.sections[1]?.body.trim()).toBe('Body of heading 2.');
  });
});
```

- [ ] **Step 6.4:跑测试验证 RED(还没实现,应该 fail)**

```bash
pnpm test tests/core/parse/markdown.test.ts
```

预期:**FAIL** with `Cannot find module '../../../src/core/parse/markdown.js'`。

- [ ] **Step 6.5:实现 `src/core/parse/markdown.ts`**

```typescript
// markdown 解析器 — 抽 frontmatter 和按 heading 切 section

import matter from 'gray-matter';

export interface ParsedMarkdown {
  /** YAML frontmatter 解析结果(无则空对象) */
  frontmatter: Record<string, unknown>;
  /** 原始正文(去掉 frontmatter) */
  body: string;
  /** 按 ATX heading(`#`)切分的章节 */
  sections: Section[];
}

export interface Section {
  /** 标题级别(1-6) */
  level: number;
  /** 标题文本(不含 `#` 和空格) */
  heading: string;
  /** 该章节正文(到下一个同级或更高级 heading 之前) */
  body: string;
  /** 起始行号(1-indexed,heading 行) */
  startLine: number;
  /** 结束行号(下一个 heading 行 - 1,或文件末尾) */
  endLine: number;
}

/**
 * 解析 markdown 文本。
 * 支持 YAML frontmatter(`---` 包裹)+ ATX heading(`# / ##`)分章节。
 */
export function parseMarkdown(text: string): ParsedMarkdown {
  const parsed = matter(text);
  const frontmatter = (parsed.data ?? {}) as Record<string, unknown>;
  const body = parsed.content;

  const sections = extractSections(body);

  return { frontmatter, body, sections };
}

/**
 * 把 markdown 正文按 ATX heading 切成章节。
 * 同级或更高级 heading 是边界。
 */
function extractSections(body: string): Section[] {
  const lines = body.split('\n');
  const sections: Section[] = [];
  let current: Section | null = null;
  const buffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // 关闭当前 section
      if (current) {
        current.body = buffer.join('\n');
        current.endLine = i; // 上一行
        sections.push(current);
        buffer.length = 0;
      }
      // 开始新 section
      current = {
        level: headingMatch[1]?.length ?? 1,
        heading: headingMatch[2]?.trim() ?? '',
        body: '',
        startLine: i + 1,
        endLine: lines.length,
      };
    } else if (current) {
      buffer.push(line);
    }
  }

  // 关闭最后一个 section
  if (current) {
    current.body = buffer.join('\n');
    sections.push(current);
  }

  return sections;
}
```

- [ ] **Step 6.6:更新 `src/core/parse/index.ts`**

```typescript
// src/core/parse/index.ts
export * from './markdown.js';
```

- [ ] **Step 6.7:跑测试验证 GREEN**

```bash
pnpm test tests/core/parse/markdown.test.ts
```

预期:`Tests  4 passed (4)`。

- [ ] **Step 6.8:Commit**

```bash
git add src/core/parse/ tests/core/parse/ tests/fixtures/markdown/
git commit -m "feat(core/parse): markdown parser (frontmatter + sections)"
```

---

### Task 7:YAML config 解析器

**Files:**
- Create: `src/core/parse/yaml.ts`
- Modify: `src/core/parse/index.ts`
- Test: `tests/core/parse/yaml.test.ts`
- Fixtures: `tests/fixtures/configs/valid.yaml`、`malformed.yaml`、`missing-schema.yaml`

- [ ] **Step 7.1:写 fixture `tests/fixtures/configs/valid.yaml`**

```yaml
schema: forge-spec-driven/v1
context: |
  Tech stack: TypeScript, React, Node.js
rules:
  proposal:
    - Include rollback plan
  specs:
    - Use Given/When/Then format
code_paths:
  include:
    - "src/**"
    - "tests/**"
```

- [ ] **Step 7.2:写 fixture `tests/fixtures/configs/malformed.yaml`**

```yaml
schema: forge-spec-driven/v1
rules:
  proposal:
    - missing colon and dash structure
context
  bad indentation
```

- [ ] **Step 7.3:写 fixture `tests/fixtures/configs/missing-schema.yaml`**

```yaml
context: hello
rules:
  proposal: []
```

- [ ] **Step 7.4:写测试 `tests/core/parse/yaml.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { parseConfig, ConfigParseError } from '../../../src/core/parse/yaml.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixDir = resolve(__dirname, '../../fixtures/configs');
const load = (name: string) => readFileSync(resolve(fixDir, name), 'utf8');

describe('parseConfig', () => {
  it('parses a valid forge/config.yaml', () => {
    const config = parseConfig(load('valid.yaml'));
    expect(config.schema).toBe('forge-spec-driven/v1');
    expect(config.rules?.proposal).toContain('Include rollback plan');
    expect(config.code_paths?.include).toContain('src/**');
  });

  it('throws ConfigParseError on malformed YAML', () => {
    expect(() => parseConfig(load('malformed.yaml'))).toThrow(ConfigParseError);
  });

  it('throws ConfigParseError when schema field missing', () => {
    expect(() => parseConfig(load('missing-schema.yaml'))).toThrow(/schema/);
  });
});
```

- [ ] **Step 7.5:跑测试验证 RED**

```bash
pnpm test tests/core/parse/yaml.test.ts
```

预期 FAIL:`Cannot find module ... yaml.js`。

- [ ] **Step 7.6:实现 `src/core/parse/yaml.ts`**

```typescript
// forge/config.yaml 解析器

import { parse as parseYAML } from 'yaml';
import type { ForgeConfig } from '../schema/index.js';

/** YAML 解析失败或必需字段缺失时抛此 error */
export class ConfigParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ConfigParseError';
  }
}

/**
 * 解析 forge/config.yaml 文本。
 * - YAML 解析失败 → ConfigParseError
 * - 缺 schema 字段 → ConfigParseError("missing schema field")
 */
export function parseConfig(text: string): ForgeConfig {
  let parsed: unknown;
  try {
    parsed = parseYAML(text);
  } catch (err) {
    throw new ConfigParseError('YAML parse failed', err);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ConfigParseError('config.yaml must be a YAML mapping at root');
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.schema !== 'string') {
    throw new ConfigParseError('missing schema field (string)');
  }

  return obj as ForgeConfig;
}
```

- [ ] **Step 7.7:更新 `src/core/parse/index.ts`**

```typescript
export * from './markdown.js';
export * from './yaml.js';
```

- [ ] **Step 7.8:跑测试验证 GREEN**

```bash
pnpm test tests/core/parse/yaml.test.ts
```

预期:3 passed。

- [ ] **Step 7.9:Commit**

```bash
git add src/core/parse/yaml.ts src/core/parse/index.ts tests/core/parse/yaml.test.ts tests/fixtures/configs/
git commit -m "feat(core/parse): YAML config parser with schema validation"
```

---

### Task 8:Proposal / Design 解析器

**Files:**
- Create: `src/core/parse/proposal.ts`、`src/core/parse/design.ts`
- Modify: `src/core/parse/index.ts`
- Test: `tests/core/parse/proposal.test.ts`、`tests/core/parse/design.test.ts`
- Fixtures: 在 `tests/fixtures/valid-change/` 下建一个完整的 sample change

- [ ] **Step 8.1:建 fixture `tests/fixtures/valid-change/proposal.md`**

```markdown
# Add Login Feature

## Why

Users need to authenticate to access protected resources.

## What

Implement email/password login with session cookies.

## Scope

- In: login form, session management, logout
- Out: SSO, MFA, password reset (future plan)
```

- [ ] **Step 8.2:建 fixture `tests/fixtures/valid-change/design.md`**

```markdown
# Login Design

## Architecture

- Frontend: React form component
- Backend: POST /api/login with bcrypt hash
- Session: HttpOnly cookie, 24h expiry

## Data Model

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
```
```

- [ ] **Step 8.3:写测试 `tests/core/parse/proposal.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { parseProposal } from '../../../src/core/parse/proposal.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = readFileSync(
  resolve(__dirname, '../../fixtures/valid-change/proposal.md'),
  'utf8',
);

describe('parseProposal', () => {
  it('extracts title from h1', () => {
    const r = parseProposal(fixture);
    expect(r.title).toBe('Add Login Feature');
  });

  it('extracts why section body', () => {
    const r = parseProposal(fixture);
    expect(r.why).toContain('authenticate');
  });

  it('extracts what section body', () => {
    const r = parseProposal(fixture);
    expect(r.what).toContain('email/password');
  });

  it('extracts scope section body when present', () => {
    const r = parseProposal(fixture);
    expect(r.scope).toContain('session management');
  });

  it('returns undefined scope when absent', () => {
    const minimal = '# Title\n\n## Why\nx\n\n## What\ny\n';
    const r = parseProposal(minimal);
    expect(r.scope).toBeUndefined();
  });
});
```

- [ ] **Step 8.4:写测试 `tests/core/parse/design.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { parseDesign } from '../../../src/core/parse/design.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = readFileSync(
  resolve(__dirname, '../../fixtures/valid-change/design.md'),
  'utf8',
);

describe('parseDesign', () => {
  it('extracts title from h1', () => {
    const r = parseDesign(fixture);
    expect(r.title).toBe('Login Design');
  });

  it('returns sections list with level + heading', () => {
    const r = parseDesign(fixture);
    expect(r.sections.find((s) => s.heading === 'Architecture')).toBeDefined();
    expect(r.sections.find((s) => s.heading === 'Data Model')).toBeDefined();
  });
});
```

- [ ] **Step 8.5:跑测试验证 RED**

```bash
pnpm test tests/core/parse/proposal.test.ts tests/core/parse/design.test.ts
```

预期 FAIL。

- [ ] **Step 8.6:实现 `src/core/parse/proposal.ts`**

```typescript
// proposal.md 解析器 — 抽 title / why / what / scope

import { parseMarkdown } from './markdown.js';

export interface ParsedProposal {
  title: string;
  why: string;
  what: string;
  scope?: string;
}

/**
 * 解析 proposal.md 文本。
 * 期望结构:`# <Title>` + `## Why` + `## What` + 可选 `## Scope`。
 * 缺 title / why / what 不报错(留给 validate 阶段)。
 */
export function parseProposal(text: string): ParsedProposal {
  const md = parseMarkdown(text);

  const titleSection = md.sections.find((s) => s.level === 1);
  const title = titleSection?.heading ?? '';

  const findBody = (heading: string) =>
    md.sections.find((s) => s.heading.toLowerCase() === heading.toLowerCase())?.body.trim() ?? '';

  const why = findBody('Why');
  const what = findBody('What');
  const scopeSection = md.sections.find((s) => s.heading.toLowerCase() === 'scope');
  const scope = scopeSection?.body.trim();

  return { title, why, what, scope };
}
```

- [ ] **Step 8.7:实现 `src/core/parse/design.ts`**

```typescript
// design.md 解析器 — 通用结构(title + sections),不强制具体段名

import { parseMarkdown } from './markdown.js';
import type { Section } from './markdown.js';

export interface ParsedDesign {
  title: string;
  sections: Section[];
}

export function parseDesign(text: string): ParsedDesign {
  const md = parseMarkdown(text);
  const titleSection = md.sections.find((s) => s.level === 1);
  return {
    title: titleSection?.heading ?? '',
    sections: md.sections.filter((s) => s.level >= 2),
  };
}
```

- [ ] **Step 8.8:更新 `src/core/parse/index.ts`**

```typescript
export * from './markdown.js';
export * from './yaml.js';
export * from './proposal.js';
export * from './design.js';
```

- [ ] **Step 8.9:跑测试验证 GREEN**

```bash
pnpm test tests/core/parse/proposal.test.ts tests/core/parse/design.test.ts
```

预期:7 passed。

- [ ] **Step 8.10:Commit**

```bash
git add src/core/parse/proposal.ts src/core/parse/design.ts src/core/parse/index.ts tests/core/parse/proposal.test.ts tests/core/parse/design.test.ts tests/fixtures/valid-change/
git commit -m "feat(core/parse): proposal + design parsers"
```

---

### Task 9:Specs(GWT scenario)解析器

**Files:**
- Create: `src/core/parse/specs.ts`
- Modify: `src/core/parse/index.ts`
- Test: `tests/core/parse/specs.test.ts`
- Fixture: `tests/fixtures/valid-change/specs/login.md`

- [ ] **Step 9.1:建 fixture `tests/fixtures/valid-change/specs/login.md`**

```markdown
# Login Spec

## Scenario: happy-path

**Given** a user with valid credentials
**When** they POST /api/login with correct password
**Then** they receive a 200 with session cookie
**And** subsequent requests are authenticated

## Scenario: wrong-password

**Given** a user with valid email but wrong password
**When** they POST /api/login
**Then** they receive 401
**And** no cookie is set
```

- [ ] **Step 9.2:写测试 `tests/core/parse/specs.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { parseSpec } from '../../../src/core/parse/specs.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = readFileSync(
  resolve(__dirname, '../../fixtures/valid-change/specs/login.md'),
  'utf8',
);

describe('parseSpec', () => {
  it('extracts spec title', () => {
    const r = parseSpec(fixture);
    expect(r.title).toBe('Login Spec');
  });

  it('parses 2 scenarios', () => {
    const r = parseSpec(fixture);
    expect(r.scenarios).toHaveLength(2);
  });

  it('extracts scenario id from heading', () => {
    const r = parseSpec(fixture);
    expect(r.scenarios[0]?.id).toBe('happy-path');
    expect(r.scenarios[1]?.id).toBe('wrong-password');
  });

  it('parses Given/When/Then/And steps', () => {
    const r = parseSpec(fixture);
    const happy = r.scenarios[0]!;
    expect(happy.given).toContain('a user with valid credentials');
    expect(happy.when[0]).toContain('POST /api/login');
    expect(happy.then.length).toBeGreaterThanOrEqual(2); // Then + And
  });
});
```

- [ ] **Step 9.3:跑测试 RED**

预期 FAIL。

- [ ] **Step 9.4:实现 `src/core/parse/specs.ts`**

```typescript
// specs/<name>.md 解析器 — Given/When/Then scenario

import { parseMarkdown } from './markdown.js';

export interface ParsedSpec {
  title: string;
  scenarios: Scenario[];
}

export interface Scenario {
  /** 从 "## Scenario: <id>" 标题抽出的 id */
  id: string;
  /** Given 子句正文(去 **Given** 前缀) */
  given: string[];
  /** When 子句 */
  when: string[];
  /** Then + And 子句(都归入 then) */
  then: string[];
  /** 该 scenario 的原始 markdown body */
  rawBody: string;
}

const STEP_RE = /^\*\*(Given|When|Then|And|But)\*\*\s+(.+)$/i;

export function parseSpec(text: string): ParsedSpec {
  const md = parseMarkdown(text);
  const titleSection = md.sections.find((s) => s.level === 1);
  const title = titleSection?.heading ?? '';

  const scenarioSections = md.sections.filter(
    (s) => s.level === 2 && /^Scenario:/i.test(s.heading),
  );

  const scenarios: Scenario[] = scenarioSections.map((sec) => {
    const idMatch = sec.heading.match(/^Scenario:\s*(\S.*)$/i);
    const id = idMatch?.[1]?.trim() ?? '';

    const given: string[] = [];
    const when: string[] = [];
    const then: string[] = [];
    let currentClause: 'given' | 'when' | 'then' | null = null;

    for (const rawLine of sec.body.split('\n')) {
      const line = rawLine.trim();
      const m = line.match(STEP_RE);
      if (!m) continue;
      const keyword = m[1]!.toLowerCase();
      const body = m[2]!.trim();

      if (keyword === 'given') {
        currentClause = 'given';
        given.push(body);
      } else if (keyword === 'when') {
        currentClause = 'when';
        when.push(body);
      } else if (keyword === 'then') {
        currentClause = 'then';
        then.push(body);
      } else if (keyword === 'and' || keyword === 'but') {
        // And/But 归入当前子句
        if (currentClause === 'given') given.push(body);
        else if (currentClause === 'when') when.push(body);
        else if (currentClause === 'then') then.push(body);
      }
    }

    return { id, given, when, then, rawBody: sec.body };
  });

  return { title, scenarios };
}
```

- [ ] **Step 9.5:更新 `src/core/parse/index.ts`**

```typescript
export * from './markdown.js';
export * from './yaml.js';
export * from './proposal.js';
export * from './design.js';
export * from './specs.js';
```

- [ ] **Step 9.6:跑测试 GREEN**

```bash
pnpm test tests/core/parse/specs.test.ts
```

预期:4 passed。

- [ ] **Step 9.7:Commit**

```bash
git add src/core/parse/specs.ts src/core/parse/index.ts tests/core/parse/specs.test.ts tests/fixtures/valid-change/specs/
git commit -m "feat(core/parse): specs (GWT scenario) parser"
```

---

### Task 10:Tasks(checkbox + applied_commits)解析器

**Files:**
- Create: `src/core/parse/tasks.ts`
- Modify: `src/core/parse/index.ts`
- Test: `tests/core/parse/tasks.test.ts`
- Fixture: `tests/fixtures/valid-change/tasks.md`

- [ ] **Step 10.1:建 fixture `tests/fixtures/valid-change/tasks.md`**

```markdown
# Login Tasks

- [x] task-1: Set up users table migration
- [x] task-2: Implement POST /api/login
- [ ] task-3: Add login form component
- [ ] task-4: Wire up session middleware

## Verify-failed (auto-added)

- [ ] verify-fix-1: Add test for wrong-password scenario
- [ ] verify-fix-2: Fix missing evidence for task-2

applied_commits:
  - task-1: a1b2c3d4e5f67890
  - task-2: f0e9d8c7b6a54321
final_head: deadbeef00112233
```

- [ ] **Step 10.2:写测试 `tests/core/parse/tasks.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { parseTasks } from '../../../src/core/parse/tasks.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = readFileSync(
  resolve(__dirname, '../../fixtures/valid-change/tasks.md'),
  'utf8',
);

describe('parseTasks', () => {
  it('parses checkbox items with id and description', () => {
    const r = parseTasks(fixture);
    expect(r.items).toHaveLength(6);
    expect(r.items[0]).toMatchObject({
      id: 'task-1',
      checked: true,
      description: 'Set up users table migration',
    });
    expect(r.items[2]).toMatchObject({
      id: 'task-3',
      checked: false,
    });
  });

  it('captures section context for verify-fix items', () => {
    const r = parseTasks(fixture);
    const fix = r.items.find((t) => t.id === 'verify-fix-1');
    expect(fix?.section).toBe('Verify-failed (auto-added)');
  });

  it('parses applied_commits list when present', () => {
    const r = parseTasks(fixture);
    expect(r.appliedCommits).toEqual([
      { taskId: 'task-1', hash: 'a1b2c3d4e5f67890' },
      { taskId: 'task-2', hash: 'f0e9d8c7b6a54321' },
    ]);
    expect(r.finalHead).toBe('deadbeef00112233');
  });

  it('returns undefined applied_commits when absent', () => {
    const minimal = '# Tasks\n\n- [ ] task-1: do thing\n';
    const r = parseTasks(minimal);
    expect(r.appliedCommits).toBeUndefined();
    expect(r.finalHead).toBeUndefined();
  });
});
```

- [ ] **Step 10.3:跑测试 RED** — 预期 FAIL。

- [ ] **Step 10.4:实现 `src/core/parse/tasks.ts`**

```typescript
// tasks.md 解析器 — checkbox + applied_commits

import { parseMarkdown } from './markdown.js';

export interface ParsedTasks {
  title: string;
  items: TaskItem[];
  /** 全部跑完后写入(详见 spec §3.1 T3 step 4) */
  appliedCommits?: { taskId: string; hash: string }[];
  /** git HEAD at completion */
  finalHead?: string;
}

export interface TaskItem {
  /** task id(从 "- [x] task-1: ..." 抽出) */
  id: string;
  /** 描述(冒号后) */
  description: string;
  /** [x] = true / [ ] = false */
  checked: boolean;
  /** 该 task 所在的二级 section heading(若非顶层) */
  section?: string;
  /** 行号(1-indexed) */
  lineNumber: number;
}

const TASK_RE = /^\s*- \[([ x])\]\s+([\w-]+)\s*:\s*(.+)$/;
const APPLIED_RE = /^\s*-\s+([\w-]+)\s*:\s*([a-f0-9]+)\s*$/;

export function parseTasks(text: string): ParsedTasks {
  const md = parseMarkdown(text);
  const titleSection = md.sections.find((s) => s.level === 1);
  const title = titleSection?.heading ?? '';

  const items: TaskItem[] = [];
  const lines = text.split('\n');
  let currentSection: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      currentSection = headingMatch[1]?.trim();
      continue;
    }
    const m = line.match(TASK_RE);
    if (m) {
      items.push({
        id: m[2]!,
        description: m[3]!.trim(),
        checked: m[1] === 'x',
        section: currentSection,
        lineNumber: i + 1,
      });
    }
  }

  const { appliedCommits, finalHead } = extractAppliedCommits(text);
  return { title, items, appliedCommits, finalHead };
}

function extractAppliedCommits(text: string): {
  appliedCommits?: { taskId: string; hash: string }[];
  finalHead?: string;
} {
  const lines = text.split('\n');
  const appliedIdx = lines.findIndex((l) => /^applied_commits:\s*$/.test(l));
  if (appliedIdx < 0) return {};

  const appliedCommits: { taskId: string; hash: string }[] = [];
  let finalHead: string | undefined;
  for (let i = appliedIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = line.match(APPLIED_RE);
    if (m) {
      appliedCommits.push({ taskId: m[1]!, hash: m[2]! });
      continue;
    }
    const headMatch = line.match(/^final_head:\s+([a-f0-9]+)\s*$/);
    if (headMatch) {
      finalHead = headMatch[1];
      break;
    }
    if (line.trim() === '') continue;
    break;
  }

  return { appliedCommits, finalHead };
}
```

- [ ] **Step 10.5:更新 `src/core/parse/index.ts`**

```typescript
export * from './markdown.js';
export * from './yaml.js';
export * from './proposal.js';
export * from './design.js';
export * from './specs.js';
export * from './tasks.js';
```

- [ ] **Step 10.6:跑测试 GREEN**

```bash
pnpm test tests/core/parse/tasks.test.ts
```

预期:4 passed。

- [ ] **Step 10.7:Commit**

```bash
git add src/core/parse/tasks.ts src/core/parse/index.ts tests/core/parse/tasks.test.ts tests/fixtures/valid-change/tasks.md
git commit -m "feat(core/parse): tasks (checkbox + applied_commits) parser"
```

---

### Task 11:Validate types + 顶层 ValidationResult

**Files:**
- Create: `src/core/validate/types.ts`、`src/core/validate/index.ts`
- Test: `tests/core/validate/types.test.ts`

- [ ] **Step 11.1:写 `src/core/validate/types.ts`**

```typescript
// 验证结果类型 — proposal/specs/tasks/marker 共用

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  artifact: 'proposal' | 'specs' | 'design' | 'tasks' | 'marker' | 'change';
  /** 出错的字段或路径 */
  field?: string;
  /** 描述 */
  message: string;
  /** 文件路径(可选) */
  file?: string;
  /** 行号(可选) */
  line?: number;
}

export interface ValidationWarning extends Omit<ValidationError, 'message'> {
  message: string;
}

/** 工具函数:把多个 ValidationResult 合并 */
export function mergeResults(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((r) => r.errors);
  const warnings = results.flatMap((r) => r.warnings);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/** 工具函数:给单个 error 构造合法 ValidationResult */
export function failed(error: ValidationError): ValidationResult {
  return { valid: false, errors: [error], warnings: [] };
}

/** 工具函数:成功 */
export function ok(warnings: ValidationWarning[] = []): ValidationResult {
  return { valid: true, errors: [], warnings };
}
```

- [ ] **Step 11.2:写 `src/core/validate/index.ts`**

```typescript
export * from './types.js';
```

- [ ] **Step 11.3:写测试 `tests/core/validate/types.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { mergeResults, failed, ok } from '../../../src/core/validate/index.js';

describe('validate/types helpers', () => {
  it('ok() returns valid=true with empty errors', () => {
    const r = ok();
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('failed() returns valid=false with one error', () => {
    const r = failed({
      artifact: 'proposal',
      field: 'why',
      message: 'missing why section',
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('why');
  });

  it('mergeResults aggregates errors and recomputes valid', () => {
    const a = ok([{ artifact: 'specs', message: 'minor' }]);
    const b = failed({ artifact: 'tasks', message: 'crit' });
    const merged = mergeResults(a, b);
    expect(merged.valid).toBe(false);
    expect(merged.errors).toHaveLength(1);
    expect(merged.warnings).toHaveLength(1);
  });

  it('mergeResults with all ok stays valid', () => {
    const merged = mergeResults(ok(), ok(), ok());
    expect(merged.valid).toBe(true);
  });
});
```

- [ ] **Step 11.4:跑测试 GREEN**

```bash
pnpm test tests/core/validate/types.test.ts
```

预期:4 passed。

- [ ] **Step 11.5:Commit**

```bash
git add src/core/validate/types.ts src/core/validate/index.ts tests/core/validate/types.test.ts
git commit -m "feat(core/validate): result types + merge/failed/ok helpers"
```

---

### Task 12:Validate Proposal / Specs / Tasks

**Files:**
- Create: `src/core/validate/proposal.ts`、`src/core/validate/specs.ts`、`src/core/validate/tasks.ts`
- Modify: `src/core/validate/index.ts`
- Test: `tests/core/validate/proposal.test.ts`、`specs.test.ts`、`tasks.test.ts`

- [ ] **Step 12.1:实现 `src/core/validate/proposal.ts`**

```typescript
// 验证 proposal:title 非空 + why/what 非空(spec §4.3)

import type { ParsedProposal } from '../parse/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

export function validateProposal(p: ParsedProposal, file?: string): ValidationResult {
  const errors: ValidationResult[] = [];
  if (!p.title.trim()) {
    errors.push(failed({ artifact: 'proposal', field: 'title', message: 'missing or empty H1 title', file }));
  }
  if (!p.why.trim()) {
    errors.push(failed({ artifact: 'proposal', field: 'why', message: 'missing or empty Why section', file }));
  }
  if (!p.what.trim()) {
    errors.push(failed({ artifact: 'proposal', field: 'what', message: 'missing or empty What section', file }));
  }
  return errors.length === 0 ? ok() : mergeResults(...errors);
}
```

- [ ] **Step 12.2:实现 `src/core/validate/specs.ts`**

```typescript
// 验证 spec GWT:每个 scenario 至少有 given/when/then 各 1 项(spec §4.3)

import type { ParsedSpec } from '../parse/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

export function validateSpec(s: ParsedSpec, file?: string): ValidationResult {
  const results: ValidationResult[] = [];

  if (!s.title.trim()) {
    results.push(failed({ artifact: 'specs', field: 'title', message: 'missing H1 title', file }));
  }
  if (s.scenarios.length === 0) {
    results.push(
      failed({ artifact: 'specs', field: 'scenarios', message: 'no scenarios found (expect "## Scenario: <id>")', file }),
    );
  }
  for (const sc of s.scenarios) {
    if (!sc.id) {
      results.push(failed({ artifact: 'specs', field: 'scenario.id', message: 'scenario missing id', file }));
    }
    if (sc.given.length === 0) {
      results.push(
        failed({ artifact: 'specs', field: `scenario:${sc.id}.given`, message: 'missing Given', file }),
      );
    }
    if (sc.when.length === 0) {
      results.push(
        failed({ artifact: 'specs', field: `scenario:${sc.id}.when`, message: 'missing When', file }),
      );
    }
    if (sc.then.length === 0) {
      results.push(
        failed({ artifact: 'specs', field: `scenario:${sc.id}.then`, message: 'missing Then', file }),
      );
    }
  }
  return results.length === 0 ? ok() : mergeResults(...results);
}
```

- [ ] **Step 12.3:实现 `src/core/validate/tasks.ts`**

```typescript
// 验证 tasks:至少 1 个 task,id 非空,id 唯一(spec §3.3 不变量 2:append-only 隐含 id 唯一)

import type { ParsedTasks } from '../parse/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

export function validateTasks(t: ParsedTasks, file?: string): ValidationResult {
  const results: ValidationResult[] = [];
  if (t.items.length === 0) {
    results.push(
      failed({ artifact: 'tasks', field: 'items', message: 'no checkbox items found', file }),
    );
  }
  const seen = new Set<string>();
  for (const item of t.items) {
    if (!item.id) {
      results.push(
        failed({
          artifact: 'tasks',
          field: 'item.id',
          message: `task at line ${item.lineNumber} has empty id`,
          file,
          line: item.lineNumber,
        }),
      );
    } else if (seen.has(item.id)) {
      results.push(
        failed({
          artifact: 'tasks',
          field: 'item.id',
          message: `duplicate task id "${item.id}" (violates append-only invariant)`,
          file,
          line: item.lineNumber,
        }),
      );
    } else {
      seen.add(item.id);
    }
  }
  return results.length === 0 ? ok() : mergeResults(...results);
}
```

- [ ] **Step 12.4:更新 `src/core/validate/index.ts`**

```typescript
export * from './types.js';
export * from './proposal.js';
export * from './specs.js';
export * from './tasks.js';
```

- [ ] **Step 12.5:写测试 `tests/core/validate/proposal.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { validateProposal } from '../../../src/core/validate/index.js';

describe('validateProposal', () => {
  it('accepts a complete proposal', () => {
    const r = validateProposal({
      title: 'X',
      why: 'reason',
      what: 'do thing',
      scope: 'limited',
    });
    expect(r.valid).toBe(true);
  });

  it('rejects missing title', () => {
    const r = validateProposal({ title: '', why: 'r', what: 'w' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'title')).toBe(true);
  });

  it('rejects missing why and what together', () => {
    const r = validateProposal({ title: 'X', why: '', what: '' });
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(2);
  });
});
```

- [ ] **Step 12.6:写测试 `tests/core/validate/specs.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { validateSpec } from '../../../src/core/validate/index.js';

describe('validateSpec', () => {
  it('accepts a valid spec with one scenario', () => {
    const r = validateSpec({
      title: 'X',
      scenarios: [{ id: 's1', given: ['a'], when: ['b'], then: ['c'], rawBody: '' }],
    });
    expect(r.valid).toBe(true);
  });

  it('rejects missing scenarios', () => {
    const r = validateSpec({ title: 'X', scenarios: [] });
    expect(r.valid).toBe(false);
  });

  it('rejects scenario missing Given', () => {
    const r = validateSpec({
      title: 'X',
      scenarios: [{ id: 's1', given: [], when: ['b'], then: ['c'], rawBody: '' }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toMatch(/given/);
  });
});
```

- [ ] **Step 12.7:写测试 `tests/core/validate/tasks.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { validateTasks } from '../../../src/core/validate/index.js';

describe('validateTasks', () => {
  it('accepts a valid task list', () => {
    const r = validateTasks({
      title: 'X',
      items: [
        { id: 't1', description: 'a', checked: false, lineNumber: 1 },
        { id: 't2', description: 'b', checked: true, lineNumber: 2 },
      ],
    });
    expect(r.valid).toBe(true);
  });

  it('rejects empty task list', () => {
    const r = validateTasks({ title: 'X', items: [] });
    expect(r.valid).toBe(false);
  });

  it('rejects duplicate id', () => {
    const r = validateTasks({
      title: 'X',
      items: [
        { id: 't1', description: 'a', checked: false, lineNumber: 1 },
        { id: 't1', description: 'b', checked: false, lineNumber: 2 },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.message).toMatch(/duplicate/);
  });
});
```

- [ ] **Step 12.8:跑测试 GREEN**

```bash
pnpm test tests/core/validate/
```

预期:9 passed。

- [ ] **Step 12.9:Commit**

```bash
git add src/core/validate/ tests/core/validate/proposal.test.ts tests/core/validate/specs.test.ts tests/core/validate/tasks.test.ts
git commit -m "feat(core/validate): proposal/specs/tasks validators"
```

---

### Task 13:Marker types + parser + 类型校验(对应 spec §3.4 + §3.4.1)

**Files:**
- Create: `src/core/markers/types.ts`、`src/core/markers/parse.ts`、`src/core/validate/marker-schema.ts`
- Modify: `src/core/markers/index.ts`、`src/core/validate/index.ts`
- Test: `tests/core/markers.test.ts`、`tests/core/validate/marker-schema.test.ts`
- Fixtures: `tests/fixtures/markers/{verify-passed,review-passed,verify-failed,review-failed,invalid-types}.yaml`

- [ ] **Step 13.1:写 `src/core/markers/types.ts`**

```typescript
// Marker YAML 类型 — spec §3.4

export interface VerifyMarker {
  schema: 'forge-verify/v1';
  verified_at: string; // ISO 8601 UTC
  verified_by: 'ai-agent' | 'human-override';
  tasks_hash: string;
  content_hash: string;
  evidence: EvidenceItem[];
}

export interface EvidenceItem {
  scenario_id: string;
  test_command: string;
  test_file: string;
  log_path: string; // 相对 marker 文件目录
  log_hash: string;
  pass: boolean;
}

export interface ReviewMarker {
  schema: 'forge-review/v1';
  reviewed_at: string;
  reviewed_by: 'ai-agent' | 'human-override';
  tasks_hash: string;
  content_hash: string;
  git: GitInfo;
  review_outcomes: ReviewOutcome[];
}

export interface GitInfo {
  is_git_repo: boolean;
  head?: string;
  diff_hash?: string;
  diff_pathspec?: {
    include: string[];
    exclude: string[];
  };
}

export interface ReviewOutcome {
  severity: 'S' | 'C' | 'L';
  accepted: boolean;
  resolved: boolean;
  task_ref?: string; // accepted=true 时必需
  rationale?: string; // accepted=false 时必需
}

export interface VerifyFailedMarker {
  schema: 'forge-verify-failed/v1';
  failed_at: string;
  reasons: string[];
  fake_completions: string[]; // 已勾但虚假的 task id
  appended_tasks: string[];
}

export interface ReviewFailedMarker {
  schema: 'forge-review-failed/v1';
  failed_at: string;
  unresolved_outcomes: ReviewOutcome[];
  appended_tasks: string[];
}

export type AnyMarker =
  | VerifyMarker
  | ReviewMarker
  | VerifyFailedMarker
  | ReviewFailedMarker;
```

- [ ] **Step 13.2:写 `src/core/markers/parse.ts`**

```typescript
// Marker YAML 解析器 — 只负责"语法解析",不验证字段值(那是 marker-schema.ts 的事)

import { parse as parseYAML } from 'yaml';
import type { AnyMarker } from './types.js';

export class MarkerParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'MarkerParseError';
  }
}

/**
 * 解析任一 marker YAML。
 * 不验证字段值合法性,只返回 unknown shape 的对象。
 * 调用方应紧接着用 validateMarkerSchema(...)。
 */
export function parseMarker(text: string): AnyMarker {
  let parsed: unknown;
  try {
    parsed = parseYAML(text);
  } catch (err) {
    throw new MarkerParseError('YAML parse failed', err);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new MarkerParseError('marker must be a YAML mapping');
  }
  return parsed as AnyMarker;
}
```

- [ ] **Step 13.3:写 `src/core/markers/index.ts`**

```typescript
export * from './types.js';
export * from './parse.js';
```

- [ ] **Step 13.4:写 `src/core/validate/marker-schema.ts`(对应 spec §3.4.1)**

```typescript
// Marker schema 类型校验 — spec §3.4.1

import type { AnyMarker } from '../markers/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

const KNOWN_SCHEMAS = [
  'forge-verify/v1',
  'forge-review/v1',
  'forge-verify-failed/v1',
  'forge-review-failed/v1',
] as const;
type KnownSchema = (typeof KNOWN_SCHEMAS)[number];

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const GIT_HEAD_RE = /^[a-f0-9]{40}$/;
const ACTOR_VALUES = new Set(['ai-agent', 'human-override']);
const SEVERITY_VALUES = new Set(['S', 'C', 'L']);

export function validateMarkerSchema(m: unknown, file?: string): ValidationResult {
  if (!m || typeof m !== 'object') {
    return failed({ artifact: 'marker', message: 'marker must be a YAML mapping', file });
  }
  const obj = m as Record<string, unknown>;

  // 1. schema field
  if (typeof obj.schema !== 'string' || !KNOWN_SCHEMAS.includes(obj.schema as KnownSchema)) {
    return failed({
      artifact: 'marker',
      field: 'schema',
      message: `schema must be one of: ${KNOWN_SCHEMAS.join(', ')}`,
      file,
    });
  }

  const schema = obj.schema as KnownSchema;
  const results: ValidationResult[] = [];

  // 2. 通用字段:timestamp + actor
  if (schema === 'forge-verify/v1') {
    results.push(checkTimestamp(obj, 'verified_at', file));
    results.push(checkActor(obj, 'verified_by', file));
    results.push(checkSha256(obj, 'tasks_hash', file));
    results.push(checkSha256(obj, 'content_hash', file));
    results.push(checkEvidenceArray(obj.evidence, file));
  } else if (schema === 'forge-review/v1') {
    results.push(checkTimestamp(obj, 'reviewed_at', file));
    results.push(checkActor(obj, 'reviewed_by', file));
    results.push(checkSha256(obj, 'tasks_hash', file));
    results.push(checkSha256(obj, 'content_hash', file));
    results.push(checkGitInfo(obj.git, file));
    results.push(checkReviewOutcomes(obj.review_outcomes, file));
  } else if (schema === 'forge-verify-failed/v1') {
    results.push(checkTimestamp(obj, 'failed_at', file));
    results.push(checkStringArray(obj, 'reasons', file));
    results.push(checkStringArray(obj, 'fake_completions', file));
    results.push(checkStringArray(obj, 'appended_tasks', file));
  } else if (schema === 'forge-review-failed/v1') {
    results.push(checkTimestamp(obj, 'failed_at', file));
    if (!Array.isArray(obj.unresolved_outcomes)) {
      results.push(failed({ artifact: 'marker', field: 'unresolved_outcomes', message: 'must be array', file }));
    }
    results.push(checkStringArray(obj, 'appended_tasks', file));
  }

  return mergeResults(...results);
}

function checkTimestamp(obj: Record<string, unknown>, field: string, file?: string): ValidationResult {
  const v = obj[field];
  if (typeof v !== 'string' || !ISO_8601_RE.test(v)) {
    return failed({ artifact: 'marker', field, message: 'must be ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ)', file });
  }
  return ok();
}

function checkActor(obj: Record<string, unknown>, field: string, file?: string): ValidationResult {
  const v = obj[field];
  if (typeof v !== 'string' || !ACTOR_VALUES.has(v)) {
    return failed({ artifact: 'marker', field, message: 'must be "ai-agent" or "human-override"', file });
  }
  return ok();
}

function checkSha256(obj: Record<string, unknown>, field: string, file?: string): ValidationResult {
  const v = obj[field];
  if (typeof v !== 'string' || !SHA256_RE.test(v)) {
    return failed({ artifact: 'marker', field, message: 'must match ^sha256:[a-f0-9]{64}$', file });
  }
  return ok();
}

function checkStringArray(obj: Record<string, unknown>, field: string, file?: string): ValidationResult {
  const v = obj[field];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    return failed({ artifact: 'marker', field, message: 'must be array of strings', file });
  }
  return ok();
}

function checkEvidenceArray(v: unknown, file?: string): ValidationResult {
  if (!Array.isArray(v)) {
    return failed({ artifact: 'marker', field: 'evidence', message: 'must be array', file });
  }
  const results: ValidationResult[] = [];
  for (let i = 0; i < v.length; i++) {
    const e = v[i] as Record<string, unknown> | null;
    if (!e || typeof e !== 'object') {
      results.push(failed({ artifact: 'marker', field: `evidence[${i}]`, message: 'must be object', file }));
      continue;
    }
    if (typeof e.scenario_id !== 'string' || !e.scenario_id) {
      results.push(failed({ artifact: 'marker', field: `evidence[${i}].scenario_id`, message: 'required string', file }));
    }
    if (typeof e.test_command !== 'string') {
      results.push(failed({ artifact: 'marker', field: `evidence[${i}].test_command`, message: 'required string', file }));
    }
    if (typeof e.test_file !== 'string') {
      results.push(failed({ artifact: 'marker', field: `evidence[${i}].test_file`, message: 'required string', file }));
    }
    if (typeof e.log_path !== 'string' || !e.log_path.startsWith('./')) {
      results.push(failed({ artifact: 'marker', field: `evidence[${i}].log_path`, message: 'must start with "./"', file }));
    }
    if (typeof e.log_hash !== 'string' || !SHA256_RE.test(e.log_hash)) {
      results.push(failed({ artifact: 'marker', field: `evidence[${i}].log_hash`, message: 'must match sha256 regex', file }));
    }
    if (typeof e.pass !== 'boolean') {
      results.push(failed({ artifact: 'marker', field: `evidence[${i}].pass`, message: 'required boolean', file }));
    }
  }
  return mergeResults(...results);
}

function checkGitInfo(v: unknown, file?: string): ValidationResult {
  if (!v || typeof v !== 'object') {
    return failed({ artifact: 'marker', field: 'git', message: 'must be object', file });
  }
  const g = v as Record<string, unknown>;
  if (typeof g.is_git_repo !== 'boolean') {
    return failed({ artifact: 'marker', field: 'git.is_git_repo', message: 'required boolean', file });
  }
  if (g.is_git_repo) {
    if (typeof g.head !== 'string' || !GIT_HEAD_RE.test(g.head)) {
      return failed({ artifact: 'marker', field: 'git.head', message: 'must match ^[a-f0-9]{40}$', file });
    }
    if (typeof g.diff_hash !== 'string' || !SHA256_RE.test(g.diff_hash)) {
      return failed({ artifact: 'marker', field: 'git.diff_hash', message: 'must match sha256', file });
    }
    if (!g.diff_pathspec || typeof g.diff_pathspec !== 'object') {
      return failed({ artifact: 'marker', field: 'git.diff_pathspec', message: 'required object', file });
    }
  }
  return ok();
}

function checkReviewOutcomes(v: unknown, file?: string): ValidationResult {
  if (!Array.isArray(v)) {
    return failed({ artifact: 'marker', field: 'review_outcomes', message: 'must be array', file });
  }
  const results: ValidationResult[] = [];
  for (let i = 0; i < v.length; i++) {
    const o = v[i] as Record<string, unknown> | null;
    if (!o || typeof o !== 'object') {
      results.push(failed({ artifact: 'marker', field: `review_outcomes[${i}]`, message: 'must be object', file }));
      continue;
    }
    if (typeof o.severity !== 'string' || !SEVERITY_VALUES.has(o.severity)) {
      results.push(failed({ artifact: 'marker', field: `review_outcomes[${i}].severity`, message: 'must be S/C/L', file }));
    }
    if (typeof o.accepted !== 'boolean') {
      results.push(failed({ artifact: 'marker', field: `review_outcomes[${i}].accepted`, message: 'required boolean', file }));
    }
    if (typeof o.resolved !== 'boolean') {
      results.push(failed({ artifact: 'marker', field: `review_outcomes[${i}].resolved`, message: 'required boolean', file }));
    }
    // accepted=true 必须有 task_ref;accepted=false 必须有 rationale
    if (o.accepted === true && (typeof o.task_ref !== 'string' || !o.task_ref)) {
      results.push(failed({ artifact: 'marker', field: `review_outcomes[${i}].task_ref`, message: 'required when accepted=true', file }));
    }
    if (o.accepted === false && (typeof o.rationale !== 'string' || !o.rationale)) {
      results.push(failed({ artifact: 'marker', field: `review_outcomes[${i}].rationale`, message: 'required when accepted=false', file }));
    }
  }
  return mergeResults(...results);
}
```

- [ ] **Step 13.5:更新 `src/core/validate/index.ts` 加 marker-schema 导出**

```typescript
export * from './types.js';
export * from './proposal.js';
export * from './specs.js';
export * from './tasks.js';
export * from './marker-schema.js';
```

- [ ] **Step 13.6:写 fixtures(每种 marker 一个有效 + 一个无效)**

`tests/fixtures/markers/verify-passed.yaml`(有效):
```yaml
schema: forge-verify/v1
verified_at: 2026-05-04T15:30:00Z
verified_by: ai-agent
tasks_hash: sha256:a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd
content_hash: sha256:1111111111111111111111111111111111111111111111111111111111111111
evidence:
  - scenario_id: login-happy-path
    test_command: pnpm test login
    test_file: tests/login.test.ts
    log_path: ./.evidence/login-2026-05-04T15-30-00Z.log
    log_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222
    pass: true
```

`tests/fixtures/markers/review-passed.yaml`(有效):
```yaml
schema: forge-review/v1
reviewed_at: 2026-05-04T16:00:00Z
reviewed_by: ai-agent
tasks_hash: sha256:a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd
content_hash: sha256:1111111111111111111111111111111111111111111111111111111111111111
git:
  is_git_repo: true
  head: a1b2c3d4e5f6789012345678901234567890abcd
  diff_hash: sha256:3333333333333333333333333333333333333333333333333333333333333333
  diff_pathspec:
    include: ["src/**", "tests/**"]
    exclude: ["forge/**", "**/*.md"]
review_outcomes:
  - severity: S
    accepted: true
    resolved: true
    task_ref: tasks.md#review-feedback-3
  - severity: C
    accepted: false
    rationale: "误报,见 design.md §2.1"
```

`tests/fixtures/markers/verify-failed.yaml`(有效):
```yaml
schema: forge-verify-failed/v1
failed_at: 2026-05-04T15:30:00Z
reasons:
  - "tasks.md#3 声称完成但无 evidence"
fake_completions:
  - tasks.md#3
appended_tasks:
  - tasks.md#verify-fix-1
```

`tests/fixtures/markers/review-failed.yaml`(有效):
```yaml
schema: forge-review-failed/v1
failed_at: 2026-05-04T16:00:00Z
unresolved_outcomes:
  - severity: S
    accepted: true
    resolved: false
    task_ref: tasks.md#review-feedback-3
appended_tasks:
  - tasks.md#review-feedback-1
```

`tests/fixtures/markers/invalid-types.yaml`(无效:多类型错):
```yaml
schema: forge-verify/v1
verified_at: not-a-timestamp
verified_by: random-string
tasks_hash: not-sha256
content_hash: sha256:invalid-hex-not-64-chars
evidence:
  - scenario_id: x
    test_command: x
    test_file: x
    log_path: not-relative
    log_hash: bad
    pass: yes
```

- [ ] **Step 13.7:写测试 `tests/core/markers.test.ts`(parse)**

```typescript
import { describe, it, expect } from 'vitest';
import { parseMarker, MarkerParseError } from '../../src/core/markers/index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixDir = resolve(__dirname, '../fixtures/markers');
const load = (name: string) => readFileSync(resolve(fixDir, name), 'utf8');

describe('parseMarker', () => {
  it('parses verify-passed YAML', () => {
    const m = parseMarker(load('verify-passed.yaml'));
    expect(m.schema).toBe('forge-verify/v1');
  });

  it('parses review-passed YAML', () => {
    const m = parseMarker(load('review-passed.yaml'));
    expect(m.schema).toBe('forge-review/v1');
  });

  it('throws on malformed YAML', () => {
    expect(() => parseMarker(': not yaml :::')).toThrow(MarkerParseError);
  });
});
```

- [ ] **Step 13.8:写测试 `tests/core/validate/marker-schema.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { parseMarker } from '../../../src/core/markers/index.js';
import { validateMarkerSchema } from '../../../src/core/validate/index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixDir = resolve(__dirname, '../../fixtures/markers');
const load = (name: string) => readFileSync(resolve(fixDir, name), 'utf8');

describe('validateMarkerSchema', () => {
  it('accepts valid verify-passed', () => {
    const m = parseMarker(load('verify-passed.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid).toBe(true);
  });

  it('accepts valid review-passed', () => {
    const m = parseMarker(load('review-passed.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid).toBe(true);
  });

  it('accepts valid verify-failed', () => {
    const m = parseMarker(load('verify-failed.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid).toBe(true);
  });

  it('accepts valid review-failed', () => {
    const m = parseMarker(load('review-failed.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid).toBe(true);
  });

  it('rejects invalid types (timestamp / actor / hash / log_path / pass)', () => {
    const m = parseMarker(load('invalid-types.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid).toBe(false);
    // 应至少有 6 个错误
    expect(r.errors.length).toBeGreaterThanOrEqual(5);
    // 关键错误字段
    const fields = r.errors.map((e) => e.field);
    expect(fields).toContain('verified_at');
    expect(fields).toContain('verified_by');
    expect(fields).toContain('tasks_hash');
  });

  it('rejects unknown schema', () => {
    const r = validateMarkerSchema({ schema: 'forge-unknown/v99' });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('schema');
  });
});
```

- [ ] **Step 13.9:跑测试 GREEN**

```bash
pnpm test tests/core/markers.test.ts tests/core/validate/marker-schema.test.ts
```

预期:9 passed(3 + 6)。

- [ ] **Step 13.10:Commit**

```bash
git add src/core/markers/ src/core/validate/marker-schema.ts src/core/validate/index.ts tests/core/markers.test.ts tests/core/validate/marker-schema.test.ts tests/fixtures/markers/
git commit -m "feat(core/markers+validate): YAML marker types + parse + schema validation"
```

---

### Task 14:Hash 模块 — tasks_hash + content_hash + log_hash

**Files:**
- Create: `src/core/hash/tasks.ts`、`content.ts`、`log.ts`、`index.ts`
- Test: `tests/core/hash/tasks.test.ts`、`content.test.ts`、`log.test.ts`

- [ ] **Step 14.1:写测试 `tests/core/hash/tasks.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { computeTasksHash } from '../../../src/core/hash/index.js';

describe('computeTasksHash', () => {
  it('returns deterministic sha256 for same input', () => {
    const a = computeTasksHash('hello');
    const b = computeTasksHash('hello');
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('normalizes line endings (CRLF → LF)', () => {
    const lf = computeTasksHash('a\nb\nc\n');
    const crlf = computeTasksHash('a\r\nb\r\nc\r\n');
    expect(lf).toBe(crlf);
  });

  it('normalizes trailing whitespace per line', () => {
    const trimmed = computeTasksHash('a\nb\n');
    const padded = computeTasksHash('a   \nb\t\n');
    expect(trimmed).toBe(padded);
  });

  it('different content → different hash', () => {
    const a = computeTasksHash('hello');
    const b = computeTasksHash('world');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 14.2:实现 `src/core/hash/tasks.ts`**

```typescript
// tasks.md hash 计算 — 规范化:LF 行尾、UTF-8、去尾空白(spec §3.4)

import { createHash } from 'node:crypto';

/**
 * 规范化:
 * 1. CRLF / CR → LF
 * 2. 每行末尾空白(空格 / tab)去除
 * 3. UTF-8 字节
 * 然后 SHA256。
 */
export function computeTasksHash(content: string): string {
  const normalized = content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
  const buf = Buffer.from(normalized, 'utf8');
  const sha = createHash('sha256').update(buf).digest('hex');
  return `sha256:${sha}`;
}
```

- [ ] **Step 14.3:跑测试 GREEN(tasks)**

```bash
pnpm test tests/core/hash/tasks.test.ts
```

预期:4 passed。

- [ ] **Step 14.4:写测试 `tests/core/hash/content.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { computeContentHash } from '../../../src/core/hash/index.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeChangeDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forge-hash-test-'));
  writeFileSync(join(d, 'proposal.md'), '# P\n');
  writeFileSync(join(d, 'design.md'), '# D\n');
  writeFileSync(join(d, 'tasks.md'), '# T\n- [ ] t1: a\n');
  mkdirSync(join(d, 'specs'));
  writeFileSync(join(d, 'specs', 's1.md'), '# S\n');
  return d;
}

describe('computeContentHash', () => {
  it('produces deterministic hash across calls', async () => {
    const d = makeChangeDir();
    try {
      const a = await computeContentHash(d);
      const b = await computeContentHash(d);
      expect(a).toBe(b);
      expect(a).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('changes when proposal content changes', async () => {
    const d = makeChangeDir();
    try {
      const a = await computeContentHash(d);
      writeFileSync(join(d, 'proposal.md'), '# P modified\n');
      const b = await computeContentHash(d);
      expect(a).not.toBe(b);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('changes when adding a new spec file', async () => {
    const d = makeChangeDir();
    try {
      const a = await computeContentHash(d);
      writeFileSync(join(d, 'specs', 's2.md'), '# S2\n');
      const b = await computeContentHash(d);
      expect(a).not.toBe(b);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 14.5:实现 `src/core/hash/content.ts`**

```typescript
// content_hash:[proposal.md, design.md, specs/**/*.md, tasks.md] 按字典序拼接 SHA256

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { computeTasksHash } from './tasks.js';

/**
 * 计算 content_hash(spec §3.4)。
 * 规则:
 * 1. 收集 [proposal.md, design.md, specs/**\/*.md, tasks.md]
 * 2. 用 POSIX 风格 path 排序(无论 OS,跨平台一致)
 * 3. 每个文件用 computeTasksHash 同款规范化
 * 4. 拼接 `<path>\0<normalized_content>\0` 各文件 → SHA256
 */
export async function computeContentHash(changeDir: string): Promise<string> {
  const files: string[] = [];
  for (const top of ['proposal.md', 'design.md', 'tasks.md']) {
    files.push(top);
  }

  // specs/ 下的所有 .md
  try {
    const specsDir = join(changeDir, 'specs');
    const entries = await readdir(specsDir);
    for (const name of entries) {
      if (name.endsWith('.md')) files.push(posix.join('specs', name));
    }
  } catch {
    // specs/ 不存在时跳过(允许)
  }

  files.sort();

  const hash = createHash('sha256');
  for (const rel of files) {
    let content: string;
    try {
      content = await readFile(join(changeDir, rel), 'utf8');
    } catch {
      // 文件不存在 → 用空字符串(让 hash 跟"存在但空"区分)
      content = '<MISSING>';
    }
    const normalized = normalizeForHash(content);
    hash.update(rel);
    hash.update('\0');
    hash.update(normalized);
    hash.update('\0');
  }

  return `sha256:${hash.digest('hex')}`;
}

function normalizeForHash(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
}

// 复用 tasks hash 实现(避免重复)— 不导出,只在内部用
void computeTasksHash;
```

- [ ] **Step 14.6:跑测试 GREEN(content)**

```bash
pnpm test tests/core/hash/content.test.ts
```

预期:3 passed。

- [ ] **Step 14.7:写测试 `tests/core/hash/log.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { computeLogHash } from '../../../src/core/hash/index.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('computeLogHash', () => {
  it('hashes a log file', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-loghash-'));
    const f = join(d, 'log.txt');
    writeFileSync(f, 'PASS test 1\nPASS test 2\n');
    try {
      const h = await computeLogHash(f);
      expect(h).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('throws when file does not exist', async () => {
    await expect(computeLogHash('/nonexistent/path.log')).rejects.toThrow();
  });
});
```

- [ ] **Step 14.8:实现 `src/core/hash/log.ts`**

```typescript
// log_hash:对 evidence log 文件的字节做 SHA256(不规范化,字节级一致)

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function computeLogHash(logPath: string): Promise<string> {
  const buf = await readFile(logPath);
  const sha = createHash('sha256').update(buf).digest('hex');
  return `sha256:${sha}`;
}
```

- [ ] **Step 14.9:写 `src/core/hash/index.ts`**

```typescript
export { computeTasksHash } from './tasks.js';
export { computeContentHash } from './content.js';
export { computeLogHash } from './log.js';
// computeDiffHash 在 Task 15 加
```

- [ ] **Step 14.10:跑测试 GREEN(log)**

```bash
pnpm test tests/core/hash/log.test.ts
```

预期:2 passed。

- [ ] **Step 14.11:Commit**

```bash
git add src/core/hash/ tests/core/hash/
git commit -m "feat(core/hash): tasks/content/log hash with normalization"
```

---

### Task 15:Hash 模块 — diff_hash(git pathspec)

**Files:**
- Create: `src/core/hash/diff.ts`
- Modify: `src/core/hash/index.ts`
- Test: `tests/core/hash/diff.test.ts`

- [ ] **Step 15.1:写测试 `tests/core/hash/diff.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { computeDiffHash, DEFAULT_DIFF_EXCLUDE } from '../../../src/core/hash/index.js';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeGitRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'forge-diff-'));
  execSync('git init -b main', { cwd: d, stdio: 'ignore' });
  execSync('git config user.email "t@t.com" && git config user.name "t"', {
    cwd: d,
    stdio: 'ignore',
    shell: '/bin/bash',
  });
  writeFileSync(join(d, 'README.md'), '# initial\n');
  mkdirSync(join(d, 'src'));
  writeFileSync(join(d, 'src', 'a.ts'), 'export const a = 1;\n');
  execSync('git add . && git commit -m init', { cwd: d, stdio: 'ignore', shell: '/bin/bash' });
  return d;
}

describe('computeDiffHash', () => {
  it('returns stable hash when no changes', async () => {
    const d = makeGitRepo();
    try {
      const a = await computeDiffHash(d, { include: ['src/**'], exclude: [...DEFAULT_DIFF_EXCLUDE] });
      const b = await computeDiffHash(d, { include: ['src/**'], exclude: [...DEFAULT_DIFF_EXCLUDE] });
      expect(a).toBe(b);
      expect(a).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('changes when src code changes', async () => {
    const d = makeGitRepo();
    try {
      const before = await computeDiffHash(d, { include: ['src/**'], exclude: [...DEFAULT_DIFF_EXCLUDE] });
      writeFileSync(join(d, 'src', 'a.ts'), 'export const a = 2;\n'); // 修改
      const after = await computeDiffHash(d, { include: ['src/**'], exclude: [...DEFAULT_DIFF_EXCLUDE] });
      expect(before).not.toBe(after);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('ignores changes outside include pathspec', async () => {
    const d = makeGitRepo();
    try {
      const before = await computeDiffHash(d, { include: ['src/**'], exclude: [...DEFAULT_DIFF_EXCLUDE] });
      writeFileSync(join(d, 'README.md'), '# changed\n'); // 修改但 README.md 不在 include
      const after = await computeDiffHash(d, { include: ['src/**'], exclude: [...DEFAULT_DIFF_EXCLUDE] });
      expect(before).toBe(after);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 15.2:实现 `src/core/hash/diff.ts`**

```typescript
// diff_hash:对 `git diff HEAD -- <pathspec>` 输出做 SHA256 — spec §3.4

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_CODE_EXCLUDE } from '../schema/index.js';

const execFileAsync = promisify(execFile);

export const DEFAULT_DIFF_EXCLUDE = DEFAULT_CODE_EXCLUDE;

export interface DiffPathspec {
  include: string[];
  exclude: string[];
}

/**
 * 计算 diff_hash。
 * pathspec.include 用作 `git diff` 的 path 参数;exclude 用 `:!<glob>` 语法。
 *
 * 注意:为防止 marker 文件本身污染 diff(自引用悖论),exclude 必须包含
 * `**\/.verify-passed` `**\/.review-passed` 等(由 DEFAULT_DIFF_EXCLUDE 兜底)。
 */
export async function computeDiffHash(repoRoot: string, pathspec: DiffPathspec): Promise<string> {
  const args: string[] = ['diff', 'HEAD', '--'];
  for (const p of pathspec.include) args.push(p);
  for (const e of pathspec.exclude) args.push(`:!${e}`);

  const { stdout } = await execFileAsync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024, // 50 MB,大 diff 兜底
  });

  const sha = createHash('sha256').update(stdout, 'utf8').digest('hex');
  return `sha256:${sha}`;
}
```

- [ ] **Step 15.3:更新 `src/core/hash/index.ts`**

```typescript
export { computeTasksHash } from './tasks.js';
export { computeContentHash } from './content.js';
export { computeLogHash } from './log.js';
export { computeDiffHash, DEFAULT_DIFF_EXCLUDE } from './diff.js';
export type { DiffPathspec } from './diff.js';
```

- [ ] **Step 15.4:跑测试 GREEN**

```bash
pnpm test tests/core/hash/diff.test.ts
```

预期:3 passed。

- [ ] **Step 15.5:Commit**

```bash
git add src/core/hash/diff.ts src/core/hash/index.ts tests/core/hash/diff.test.ts
git commit -m "feat(core/hash): git diff hash with include/exclude pathspec"
```

---

### Task 16:Artifact-graph 模块

**Files:**
- Create: `src/core/artifact-graph/types.ts`、`builder.ts`、`index.ts`
- Test: `tests/core/artifact-graph.test.ts`

- [ ] **Step 16.1:写 `src/core/artifact-graph/types.ts`**

```typescript
import type { ArtifactKind } from '../schema/index.js';

export interface ArtifactNode {
  id: ArtifactKind;
  /** 该 artifact 文件存在? */
  exists: boolean;
  /** 该 artifact 通过 validate? */
  valid: boolean;
}

export interface ArtifactGraph {
  nodes: ArtifactNode[];
  /** 顺序表示依赖:proposal → specs → design → tasks */
  edges: { from: ArtifactKind; to: ArtifactKind }[];
}
```

- [ ] **Step 16.2:写 `src/core/artifact-graph/builder.ts`**

```typescript
// 构建 artifact 依赖图 — spec §2.1 core/artifact-graph

import type { ArtifactGraph, ArtifactNode } from './types.js';
import { DEFAULT_ARTIFACTS, type ArtifactKind } from '../schema/index.js';

/**
 * 构建固定的"线性"依赖图:proposal → specs → design → tasks。
 * 调用方传入每个 artifact 的 exists / valid 状态。
 */
export function buildGraph(states: Record<ArtifactKind, { exists: boolean; valid: boolean }>): ArtifactGraph {
  const nodes: ArtifactNode[] = DEFAULT_ARTIFACTS.map((id) => ({
    id,
    exists: states[id].exists,
    valid: states[id].valid,
  }));
  const edges: ArtifactGraph['edges'] = [];
  for (let i = 0; i < DEFAULT_ARTIFACTS.length - 1; i++) {
    edges.push({ from: DEFAULT_ARTIFACTS[i]!, to: DEFAULT_ARTIFACTS[i + 1]! });
  }
  return { nodes, edges };
}

/**
 * 找出"可以跑"的下一个 artifact:从前到后,第一个 exists=false 或 valid=false 的就是该补/该改的。
 * 若全部 valid → 返回 null(可以进入 apply / archive)。
 */
export function findNextArtifact(graph: ArtifactGraph): ArtifactKind | null {
  for (const node of graph.nodes) {
    if (!node.exists || !node.valid) return node.id;
  }
  return null;
}
```

- [ ] **Step 16.3:写 `src/core/artifact-graph/index.ts`**

```typescript
export * from './types.js';
export * from './builder.js';
```

- [ ] **Step 16.4:写测试 `tests/core/artifact-graph.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildGraph, findNextArtifact } from '../../src/core/artifact-graph/index.js';

describe('artifact-graph', () => {
  it('builds linear graph proposal → specs → design → tasks', () => {
    const g = buildGraph({
      proposal: { exists: true, valid: true },
      specs: { exists: true, valid: true },
      design: { exists: true, valid: true },
      tasks: { exists: true, valid: true },
    });
    expect(g.nodes).toHaveLength(4);
    expect(g.edges).toEqual([
      { from: 'proposal', to: 'specs' },
      { from: 'specs', to: 'design' },
      { from: 'design', to: 'tasks' },
    ]);
  });

  it('findNextArtifact returns null when all valid', () => {
    const g = buildGraph({
      proposal: { exists: true, valid: true },
      specs: { exists: true, valid: true },
      design: { exists: true, valid: true },
      tasks: { exists: true, valid: true },
    });
    expect(findNextArtifact(g)).toBeNull();
  });

  it('findNextArtifact returns first invalid artifact', () => {
    const g = buildGraph({
      proposal: { exists: true, valid: true },
      specs: { exists: true, valid: false },
      design: { exists: true, valid: true },
      tasks: { exists: false, valid: false },
    });
    expect(findNextArtifact(g)).toBe('specs');
  });
});
```

- [ ] **Step 16.5:跑测试 GREEN**

```bash
pnpm test tests/core/artifact-graph.test.ts
```

预期:3 passed。

- [ ] **Step 16.6:Commit**

```bash
git add src/core/artifact-graph/ tests/core/artifact-graph.test.ts
git commit -m "feat(core/artifact-graph): linear graph + findNextArtifact"
```

---

### Task 17:顶层 validateChange(change directory 端到端)

**Files:**
- Create: `src/core/validate/change.ts`
- Modify: `src/core/validate/index.ts`
- Test: `tests/core/validate/change.test.ts`

- [ ] **Step 17.1:写测试 `tests/core/validate/change.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { validateChange } from '../../../src/core/validate/index.js';
import { resolve } from 'node:path';

const validChange = resolve(__dirname, '../../fixtures/valid-change');

describe('validateChange', () => {
  it('returns valid=true for the valid-change fixture', async () => {
    const r = await validateChange(validChange);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('returns errors when proposal is missing', async () => {
    // 用一个不存在的目录 → fs read 报错前置
    const r = await validateChange('/nonexistent/path');
    expect(r.valid).toBe(false);
  });
});
```

- [ ] **Step 17.2:实现 `src/core/validate/change.ts`**

```typescript
// 顶层 validateChange — 读 change 目录,跑所有 artifact 校验

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseProposal,
  parseSpec,
  parseDesign,
  parseTasks,
} from '../parse/index.js';
import { validateProposal } from './proposal.js';
import { validateSpec } from './specs.js';
import { validateTasks } from './tasks.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

export async function validateChange(changeDir: string): Promise<ValidationResult> {
  const results: ValidationResult[] = [];

  // proposal
  const proposalPath = join(changeDir, 'proposal.md');
  try {
    const text = await readFile(proposalPath, 'utf8');
    results.push(validateProposal(parseProposal(text), proposalPath));
  } catch (err) {
    results.push(
      failed({
        artifact: 'proposal',
        message: `cannot read proposal.md: ${(err as Error).message}`,
        file: proposalPath,
      }),
    );
  }

  // design
  const designPath = join(changeDir, 'design.md');
  try {
    const text = await readFile(designPath, 'utf8');
    parseDesign(text); // design 没有专门 validator(只解析能过即可)
  } catch (err) {
    results.push(
      failed({
        artifact: 'design',
        message: `cannot read design.md: ${(err as Error).message}`,
        file: designPath,
      }),
    );
  }

  // tasks
  const tasksPath = join(changeDir, 'tasks.md');
  try {
    const text = await readFile(tasksPath, 'utf8');
    results.push(validateTasks(parseTasks(text), tasksPath));
  } catch (err) {
    results.push(
      failed({
        artifact: 'tasks',
        message: `cannot read tasks.md: ${(err as Error).message}`,
        file: tasksPath,
      }),
    );
  }

  // specs/*.md
  const specsDir = join(changeDir, 'specs');
  try {
    const entries = await readdir(specsDir);
    const mdFiles = entries.filter((n) => n.endsWith('.md'));
    if (mdFiles.length === 0) {
      results.push(failed({ artifact: 'specs', message: 'no spec files in specs/', file: specsDir }));
    }
    for (const name of mdFiles) {
      const path = join(specsDir, name);
      const text = await readFile(path, 'utf8');
      results.push(validateSpec(parseSpec(text), path));
    }
  } catch (err) {
    results.push(
      failed({
        artifact: 'specs',
        message: `cannot read specs/: ${(err as Error).message}`,
        file: specsDir,
      }),
    );
  }

  return results.length === 0 ? ok() : mergeResults(...results);
}
```

- [ ] **Step 17.3:更新 `src/core/validate/index.ts`**

```typescript
export * from './types.js';
export * from './proposal.js';
export * from './specs.js';
export * from './tasks.js';
export * from './change.js';
export * from './marker-schema.js';
```

- [ ] **Step 17.4:跑测试 GREEN**

```bash
pnpm test tests/core/validate/change.test.ts
```

预期:2 passed。

- [ ] **Step 17.5:Commit**

```bash
git add src/core/validate/change.ts src/core/validate/index.ts tests/core/validate/change.test.ts
git commit -m "feat(core/validate): top-level validateChange (e2e for change directory)"
```

---

### Task 18:specs-sync 模块(internal)

**Files:**
- Create: `src/core/specs-sync/deltas.ts`、`apply.ts`、`index.ts`
- Test: `tests/core/specs-sync.test.ts`

- [ ] **Step 18.1:写 `src/core/specs-sync/deltas.ts`**

```typescript
// specs-sync deltas 解析 — change/<id>/specs/ 下的 md 是要应用到 forge/specs/ 的"增量"
// 当前模型:每个 md 文件代表"应替换 forge/specs/<name>"。未来可加"删除"语义(用空文件或 frontmatter 标记)。

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SpecDelta {
  /** spec 名(不含 .md) */
  name: string;
  /** create / replace / delete */
  operation: 'create' | 'replace' | 'delete';
  /** 内容(delete 时为 null) */
  content: string | null;
}

/**
 * 读 changeDir/specs/ 下所有 .md,与 currentSpecsDir 下已有的对比,产出 deltas。
 * 当前实现:简单替换(若 already exists → replace,否则 create)。
 * delete 语义未实现(留 v0.2)。
 */
export async function readDeltas(changeSpecsDir: string, currentSpecsDir: string): Promise<SpecDelta[]> {
  const newEntries = await readdir(changeSpecsDir).catch(() => []);
  const existing = new Set(await readdir(currentSpecsDir).catch(() => []));

  const deltas: SpecDelta[] = [];
  for (const name of newEntries) {
    if (!name.endsWith('.md')) continue;
    const content = await readFile(join(changeSpecsDir, name), 'utf8');
    const op: SpecDelta['operation'] = existing.has(name) ? 'replace' : 'create';
    deltas.push({ name: name.replace(/\.md$/, ''), operation: op, content });
  }

  return deltas;
}
```

- [ ] **Step 18.2:写 `src/core/specs-sync/apply.ts`**

```typescript
// 应用 deltas 到 forge/specs/

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { SpecDelta } from './deltas.js';

export async function applyDeltas(currentSpecsDir: string, deltas: SpecDelta[]): Promise<void> {
  for (const d of deltas) {
    const path = join(currentSpecsDir, `${d.name}.md`);
    if (d.operation === 'create' || d.operation === 'replace') {
      if (d.content === null) continue;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, d.content, 'utf8');
    } else if (d.operation === 'delete') {
      // v0.2 实现
      throw new Error(`delete operation not yet implemented (v0.2)`);
    }
  }
}
```

- [ ] **Step 18.3:写 `src/core/specs-sync/index.ts`**

```typescript
export * from './deltas.js';
export * from './apply.js';
```

- [ ] **Step 18.4:写测试 `tests/core/specs-sync.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { readDeltas, applyDeltas } from '../../src/core/specs-sync/index.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setup(): { changeSpecs: string; currentSpecs: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'forge-sync-'));
  const changeSpecs = join(root, 'change/specs');
  const currentSpecs = join(root, 'forge/specs');
  mkdirSync(changeSpecs, { recursive: true });
  mkdirSync(currentSpecs, { recursive: true });
  return {
    changeSpecs,
    currentSpecs,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('specs-sync', () => {
  it('detects "create" when spec is new', async () => {
    const { changeSpecs, currentSpecs, cleanup } = setup();
    try {
      writeFileSync(join(changeSpecs, 'login.md'), '# Login\n');
      const deltas = await readDeltas(changeSpecs, currentSpecs);
      expect(deltas).toHaveLength(1);
      expect(deltas[0]).toMatchObject({ name: 'login', operation: 'create' });
    } finally {
      cleanup();
    }
  });

  it('detects "replace" when spec already exists', async () => {
    const { changeSpecs, currentSpecs, cleanup } = setup();
    try {
      writeFileSync(join(currentSpecs, 'login.md'), '# Old\n');
      writeFileSync(join(changeSpecs, 'login.md'), '# New\n');
      const deltas = await readDeltas(changeSpecs, currentSpecs);
      expect(deltas[0]?.operation).toBe('replace');
    } finally {
      cleanup();
    }
  });

  it('applies create + replace correctly', async () => {
    const { changeSpecs, currentSpecs, cleanup } = setup();
    try {
      writeFileSync(join(currentSpecs, 'old.md'), '# Old\n');
      writeFileSync(join(changeSpecs, 'old.md'), '# Updated\n');
      writeFileSync(join(changeSpecs, 'new.md'), '# Brand New\n');
      const deltas = await readDeltas(changeSpecs, currentSpecs);
      await applyDeltas(currentSpecs, deltas);
      expect(readFileSync(join(currentSpecs, 'old.md'), 'utf8')).toBe('# Updated\n');
      expect(readFileSync(join(currentSpecs, 'new.md'), 'utf8')).toBe('# Brand New\n');
    } finally {
      cleanup();
    }
  });

  it('throws on delete (v0.2 not implemented)', async () => {
    const { currentSpecs, cleanup } = setup();
    try {
      await expect(
        applyDeltas(currentSpecs, [{ name: 'x', operation: 'delete', content: null }]),
      ).rejects.toThrow(/v0\.2/);
    } finally {
      cleanup();
    }
  });
});
```

- [ ] **Step 18.5:跑测试 GREEN**

```bash
pnpm test tests/core/specs-sync.test.ts
```

预期:4 passed。

- [ ] **Step 18.6:Commit**

```bash
git add src/core/specs-sync/ tests/core/specs-sync.test.ts
git commit -m "feat(core/specs-sync): readDeltas + applyDeltas (create/replace)"
```

---

### Task 19:占位 templates / bootstrap 模块 + 顶层 src/index.ts 重新导出

**Files:**
- Modify: `src/core/templates/index.ts`
- Modify: `src/core/bootstrap/index.ts`
- Modify: `src/index.ts`(顶层入口)
- Test: `tests/smoke.test.ts`(更新 smoke 测试)

- [ ] **Step 19.1:写 `src/core/templates/index.ts`**

```typescript
// templates 模块占位 — Plan 4 填实
// 该模块未来导出 6 个 slash command 模板 + 12 个 skill 文本

export const TEMPLATES_PLACEHOLDER = true as const;
```

- [ ] **Step 19.2:写 `src/core/bootstrap/index.ts`**

```typescript
// bootstrap 模块占位 — Plan 4 填实
// 未来导出 using-forge bootstrap 文本

export const BOOTSTRAP_PLACEHOLDER = true as const;
```

- [ ] **Step 19.3:更新 `src/index.ts` 重新导出公共 API**

```typescript
// forge core library — 公共 API

export const FORGE_VERSION = '0.0.1' as const;

// 重新导出所有 core 模块的公共类型 + 函数
export * from './core/schema/index.js';
export * from './core/parse/index.js';
export * from './core/validate/index.js';
export * from './core/hash/index.js';
export * from './core/artifact-graph/index.js';
export * from './core/markers/index.js';
export * from './core/specs-sync/index.js';
export * from './core/templates/index.js';
export * from './core/bootstrap/index.js';
```

- [ ] **Step 19.4:更新 `tests/smoke.test.ts`(替换占位 smoke 为真集成)**

```typescript
import { describe, it, expect } from 'vitest';
import {
  FORGE_VERSION,
  DEFAULT_ARTIFACTS,
  parseMarkdown,
  parseProposal,
  validateProposal,
  computeTasksHash,
  buildGraph,
  TEMPLATES_PLACEHOLDER,
  BOOTSTRAP_PLACEHOLDER,
} from '../src/index.js';

describe('smoke — top-level public API', () => {
  it('exports FORGE_VERSION', () => {
    expect(FORGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exports schema constants', () => {
    expect(DEFAULT_ARTIFACTS).toEqual(['proposal', 'specs', 'design', 'tasks']);
  });

  it('exports parsers', () => {
    expect(typeof parseMarkdown).toBe('function');
    expect(typeof parseProposal).toBe('function');
  });

  it('exports validators', () => {
    expect(typeof validateProposal).toBe('function');
  });

  it('exports hash computation', () => {
    expect(typeof computeTasksHash).toBe('function');
  });

  it('exports artifact-graph builder', () => {
    expect(typeof buildGraph).toBe('function');
  });

  it('exports placeholder templates / bootstrap (Plan 4 will fill)', () => {
    expect(TEMPLATES_PLACEHOLDER).toBe(true);
    expect(BOOTSTRAP_PLACEHOLDER).toBe(true);
  });
});
```

- [ ] **Step 19.5:跑全部测试 GREEN**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

预期:typecheck/lint 0;test 全部 passed(累计 50+ tests)。

- [ ] **Step 19.6:Commit + push**

```bash
git add src/core/templates/index.ts src/core/bootstrap/index.ts src/index.ts tests/smoke.test.ts
git commit -m "feat(core): wire up top-level src/index.ts + smoke covering full surface"
git push
```

CI 应该绿(Linux + Windows)。

---

### Task 20:Plan 2 完成 — 整体最终自查

**Files:**
- Modify: `README.md`(末尾追加 Plan 2 完成标注)

- [ ] **Step 20.1:跑全部本地命令验证**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
echo "All passed!"
```

预期:5 个命令都退出码 0,**所有测试加起来 50+ passed**。

- [ ] **Step 20.2:更新 README.md**

打开 `D:/ClaudeProject/opsp/forge-repo/README.md`,在 "## Phase 0.5 Spike 结果" 段落之后(或合适位置)插入:

```markdown
## Plan 2 进度

Phase 1(Core Engine)完成 — `src/core/` 下 8 个模块全部实现 + 单元测试覆盖:

- `schema/` — spec-driven schema 类型
- `parse/` — markdown / yaml / proposal / specs / design / tasks 解析器
- `validate/` — 各 artifact + marker schema 校验
- `hash/` — tasks / content / log / diff 4 种 hash 计算
- `artifact-graph/` — 依赖图(proposal → specs → design → tasks)
- `markers/` — verify/review marker YAML 类型 + 解析
- `specs-sync/` — deltas 应用(internal-only)
- `templates/` + `bootstrap/` — 占位,Plan 4 填实

Plan 3 接手:Phase 2(CLI 命令)+ Phase 3 cut(claude.ts + codex.ts adapter)。
```

- [ ] **Step 20.3:Commit + push**

```bash
git add README.md
git commit -m "docs: mark Plan 2 (Phase 1 Core Engine) complete"
git push
```

- [ ] **Step 20.4:验证 CI 绿 + 准备移交 Plan 3**

```bash
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

预期:Linux + Windows 都绿。

---

## Plan 2 完成标准(全勾完即完成)

- [ ] CI Linux + Windows 全绿
- [ ] 5 个本地命令(typecheck / lint / format:check / test / build)全部退出码 0
- [ ] 测试用例总数 ≥ 50(单元测试 + e2e)
- [ ] `src/core/` 下 8 个模块全部 export 公共 API
- [ ] `src/index.ts` 重新导出所有公共类型与函数
- [ ] Plan 1 punch list 4 项全部修(CI concurrency/timeout、tsconfig.test.json、ESLint type-aware、spec sync v0.1=2 harness)
- [ ] README.md 反映 Plan 2 完成

---

## Plan 2 → Plan 3 衔接

Plan 2 完成后,**Plan 3** 范围:

- Phase 2:CLI 命令(`forge init/update/config/validate/archive`)+ Adapter interface
- Phase 3 cut:`claude.ts` + `codex.ts` adapter(**不含** opencode.ts,基于 Phase 0.5 spike 结果)

**关键预提醒(写到 Plan 3 头部)**:

1. `src/cli/index.ts` 加 `#!/usr/bin/env node` shebang(Plan 1 final reviewer 标记)
2. Codex skill 路径写 `~/.agents/skills/`(Phase 0.5 spike 实测路径)
3. ESLint flat config 把 `**/*.config.{js,ts}` ignore 收紧(Plan 1 reviewer F1)
4. 加 dependabot + macos-latest matrix + release workflow(Plan 5 / 6)
5. v0.1 不发布 npm,但 `pnpm pack` 应能产出合规 tarball(Plan 1 reviewer S1)
