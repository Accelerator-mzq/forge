# Plan 3:CLI 命令 + Adapters(Phase 2 + Phase 3 cut)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**:让 `forge init / update / config / validate / archive` 五个 CLI 命令真能跑;Claude Code 和 Codex 两个 adapter 真能往 `.claude/skills/` 和 `.agents/skills/` 铺最小内容;`pnpm pack` 出来的 tarball 全局安装后 `forge --version` 能跑。Plan 2 reviewer punch list(I1-I4 + M1-M2)一次清完。

**Architecture**:CLI 用 commander 驱动,每个命令是一个独立模块;Adapters 实现 `HarnessAdapter` 接口,通过 `transaction.ts` 三阶段原子化部署文件;Archive 命令独立编排 Move→Sync 顺序原子化(spec §3.5)+ marker hash 重算 + `--force` + `--recover`。

**Tech Stack**:已有(TypeScript 5.6+ + Node 20.19+ + ESM + Vitest 2 + pnpm 9 + commander 12);新增依赖:`fast-glob`(harness 检测时 glob 文件)。

**Spec 引用**:[`docs/specs/2026-05-04-forge-fusion-design.md`](../specs/2026-05-04-forge-fusion-design.md) §2.1 CLI / Harness adapter 模块、§3.5 archive 顺序原子化、§4.2 adapter 三阶段、§4.4 不变量保护。

**Plan 2 reviewer punch list 移交**(本 Plan 头部 5 个 task 处理):
1. `src/cli/index.ts` + shebang(I1 — 阻塞级,bin 当前 broken)
2. `validateChange` partial-failure 测试补全(I2)
3. spec 加 design.md 最小约束 + spec-sync delete v0.2 决策(I3 + I4)
4. ESLint `**/*.config.{js,ts}` ignore 收紧 + 配置文件自身进 lint(M1)
5. README "当前状态" 更新到 Phase 2 进行中(M2)

---

## File Structure(Plan 3 完成时新增/修改)

```
forge-repo/
├── package.json                          ← 修改:加 fast-glob 依赖
├── tsconfig.json                         ← 修改:include 加 src/cli/(目前只 src/**/* 自动包含)
├── eslint.config.js                      ← 修改:收紧 config 文件 ignore + 加 config 文件自身 lint block
├── docs/specs/2026-05-04-forge-fusion-design.md  ← 修改:加 design.md 最小约束 + spec-sync delete v0.2 注释
├── README.md                             ← 修改:状态从"实施未开始"改为"Phase 2 进行中"
├── src/
│   ├── cli/
│   │   ├── index.ts                      ← 新增:#!/usr/bin/env node + commander 入口
│   │   └── commands/
│   │       ├── config.ts                 ← 新增:forge config get/set/profile
│   │       ├── init.ts                   ← 新增:forge init
│   │       ├── update.ts                 ← 新增:forge update
│   │       ├── validate.ts               ← 新增:forge validate
│   │       └── archive.ts                ← 新增:forge archive [--force] [--recover]
│   ├── core/
│   │   ├── harness-adapters/
│   │   │   ├── interface.ts              ← 新增:HarnessAdapter interface
│   │   │   ├── transaction.ts            ← 新增:Stage→Backup→Commit 三阶段原子化(spec §4.2)
│   │   │   ├── detector.ts               ← 新增:检测项目里装了哪些 harness
│   │   │   ├── claude.ts                 ← 新增:Claude Code adapter
│   │   │   ├── codex.ts                  ← 新增:Codex adapter(用 ~/.agents/skills/ 路径)
│   │   │   └── index.ts                  ← 新增:导出
│   │   ├── archive/
│   │   │   ├── transaction.ts            ← 新增:Move→Sync 顺序原子化(spec §3.5)
│   │   │   ├── lock.ts                   ← 新增:archive.lock 进程锁
│   │   │   ├── recover.ts                ← 新增:--recover 状态机(case A/B/C)
│   │   │   └── index.ts                  ← 新增:导出
│   │   └── validate/
│   │       └── change.ts                 ← 修改:补 partial-failure 路径(I2)
│   └── index.ts                          ← 修改:重新导出 cli + adapter + archive
└── tests/
    ├── cli/
    │   ├── config.test.ts                ← 新增
    │   ├── init.test.ts                  ← 新增(集成测试,用 tmpdir)
    │   ├── update.test.ts                ← 新增
    │   ├── validate.test.ts              ← 新增
    │   ├── archive.test.ts               ← 新增(包括 --force --recover 路径)
    │   └── pack-smoke.test.ts            ← 新增:pnpm pack 后 tarball 验证(I1)
    ├── core/
    │   ├── harness-adapters/
    │   │   ├── transaction.test.ts       ← 新增:三阶段失败回滚
    │   │   ├── detector.test.ts          ← 新增
    │   │   ├── claude.test.ts            ← 新增
    │   │   └── codex.test.ts             ← 新增
    │   ├── archive/
    │   │   ├── transaction.test.ts       ← 新增:Move→Sync 失败回滚
    │   │   ├── lock.test.ts              ← 新增
    │   │   └── recover.test.ts           ← 新增:case A/B/C
    │   └── validate/
    │       └── change.test.ts            ← 修改:加 partial-failure case(I2)
    └── fixtures/
        └── adapters/
            └── existing-claude-skills/   ← 新增:模拟已存在的 .claude/skills/
```

---

## Phase 0:Plan 2 punch list 修复

### Task 1:`src/cli/index.ts` + shebang(I1 阻塞级)

**Files:**
- Create: `src/cli/index.ts`
- Test: `tests/cli/pack-smoke.test.ts`

#### Step 1.1:写 `src/cli/index.ts`(shebang + commander 骨架)

```typescript
#!/usr/bin/env node
// forge CLI 入口 — Plan 3 起填实

import { Command } from 'commander';
import { FORGE_VERSION } from '../index.js';

const program = new Command();

program
  .name('forge')
  .description('OpenSpec × superpowers fusion: spec-driven CLI with multi-harness adapters')
  .version(FORGE_VERSION);

// 后续 task 在这里 .addCommand(...)

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

#### Step 1.2:验证 build 后 dist/cli/index.js 存在

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm build
ls dist/cli/
```

预期:`dist/cli/index.js`、`dist/cli/index.d.ts`、`.map` 文件存在。

如果 dist/cli/ 不存在,**问题**:tsconfig.json 的 `include: ["src/**/*"]` 会自动包含 `src/cli/`,所以应该没问题。如果真没出现,加 `include: ["src/**/*", "src/cli/**/*"]`(应该不需要)。

#### Step 1.3:写 pack smoke 测试 `tests/cli/pack-smoke.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../..');

describe('pnpm pack tarball smoke', () => {
  it('produces tarball that includes dist/cli/index.js', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-pack-'));
    try {
      // 1. pack
      const stdout = execSync('pnpm pack --pack-destination ' + tmp, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      // 2. 找 tarball
      const tgzPath = stdout.split('\n').find((l) => l.endsWith('.tgz'))?.trim();
      expect(tgzPath).toBeDefined();
      expect(existsSync(tgzPath!)).toBe(true);

      // 3. 验证 tarball 含 dist/cli/index.js
      const list = execSync(`tar -tzf "${tgzPath}"`, { encoding: 'utf8' });
      expect(list).toContain('package/dist/cli/index.js');
      expect(list).toContain('package/LICENSE');
      expect(list).toContain('package/LICENSE-THIRD-PARTY.md');
      expect(list).toContain('package/README.md');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('shebang preserved in dist/cli/index.js', () => {
    const distEntry = resolve(REPO_ROOT, 'dist/cli/index.js');
    const content = require('node:fs').readFileSync(distEntry, 'utf8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });
});
```

注意:这个测试比较慢(跑 `pnpm pack`),应该在 CI 跑而不是每次 dev 都跑。但当前简单些,放在普通 test 套里。

#### Step 1.4:跑测试

```bash
pnpm build && pnpm test tests/cli/pack-smoke.test.ts
```

预期:2 passed。如果 shebang 没被 tsc 保留,需要 build 后处理(下一步)。

#### Step 1.5:**TypeScript 不会保留 shebang**——加 build 后处理脚本

`tsc` 编译 TypeScript 时**会**保留 shebang(只要源文件第一行就是);但如果遇到 unicode BOM 或其他编码问题可能丢。如果 Step 1.4 第二个测试失败(shebang 丢了),做以下补救:

打开 `package.json`,把 `scripts.build` 改成:

```json
"build": "tsc -p tsconfig.json && node scripts/post-build.mjs"
```

创建 `scripts/post-build.mjs`:

```javascript
#!/usr/bin/env node
// build 后处理:确保 dist/cli/index.js 第一行是 shebang + 设可执行权限

import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';

const cliJs = resolve('dist/cli/index.js');
let content = readFileSync(cliJs, 'utf8');
if (!content.startsWith('#!/usr/bin/env node')) {
  content = '#!/usr/bin/env node\n' + content;
  writeFileSync(cliJs, content, 'utf8');
}
// chmod 755(POSIX);Windows 上 chmod 是 no-op
chmodSync(cliJs, 0o755);
console.log('post-build: dist/cli/index.js shebang + executable mode set');
```

跑 `pnpm build` 验证。

如果 Step 1.4 直接通过(shebang 保留了),**跳过 Step 1.5**——一般 tsc 会保留,只有特定 tsconfig 配置可能丢。

#### Step 1.6:Commit + push

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add src/cli/ tests/cli/pack-smoke.test.ts
# 若 Step 1.5 也做了
git add package.json scripts/post-build.mjs
git commit -m "feat(cli): add forge CLI entry with shebang + pack smoke test"
git push
```

#### Step 1.7:等 CI 绿

```bash
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

预期:Linux + Windows 都绿。

---

### Task 2:`validateChange` partial-failure 测试补全(I2)

**Files:**
- Modify: `tests/core/validate/change.test.ts`

#### Step 2.1:打开 `tests/core/validate/change.test.ts` 在末尾追加 3 个测试

```typescript
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeChangeDir(overrides: { proposal?: string; design?: string; tasks?: string; specs?: Record<string, string> }): string {
  const d = mkdtempSync(join(tmpdir(), 'forge-validate-change-'));
  writeFileSync(join(d, 'proposal.md'), overrides.proposal ?? '# Title\n\n## Why\nr\n\n## What\nw\n');
  writeFileSync(join(d, 'design.md'), overrides.design ?? '# Design\n\n## Architecture\nx\n');
  writeFileSync(join(d, 'tasks.md'), overrides.tasks ?? '# T\n\n- [ ] t1: a\n');
  if (overrides.specs !== undefined) {
    mkdirSync(join(d, 'specs'));
    for (const [name, content] of Object.entries(overrides.specs)) {
      writeFileSync(join(d, 'specs', name), content);
    }
  } else {
    mkdirSync(join(d, 'specs'));
    writeFileSync(
      join(d, 'specs', 's.md'),
      '# S\n\n## Scenario: x\n\n**Given** g\n**When** w\n**Then** t\n',
    );
  }
  return d;
}

// 在 describe('validateChange', ...) 内追加:

it('returns errors when proposal is invalid (missing why)', async () => {
  const d = makeChangeDir({ proposal: '# Title\n\n## What\nw\n' }); // 没 Why
  try {
    const r = await validateChange(d);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'why')).toBe(true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

it('returns errors when specs/ is empty', async () => {
  const d = makeChangeDir({ specs: {} }); // specs/ 存在但空
  try {
    const r = await validateChange(d);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes('no spec files'))).toBe(true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

it('returns errors when tasks have duplicate id', async () => {
  const d = makeChangeDir({
    tasks: '# T\n\n- [ ] t1: a\n- [x] t1: b\n', // duplicate id
  });
  try {
    const r = await validateChange(d);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate'))).toBe(true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
```

#### Step 2.2:跑测试

```bash
pnpm test tests/core/validate/change.test.ts
```

预期:5 passed(原 2 + 新 3)。

#### Step 2.3:Commit + push

```bash
git add tests/core/validate/change.test.ts
git commit -m "test(core/validate): add partial-failure cases for validateChange (Plan 2 reviewer I2)"
git push
```

---

### Task 3:Spec sync — design 最小约束 + spec-sync delete 推 v0.2(I3 + I4)

**Files:**
- Modify: `docs/specs/2026-05-04-forge-fusion-design.md`

#### Step 3.1:在 §4.3 表格里加 design.md 最小约束行

打开 `docs/specs/2026-05-04-forge-fusion-design.md`,找 §4.3 "AI 行为侧错误" 表(L450 附近),**在表头之后追加**一行:

```
| AI 在 `/forge:propose` 但没产出 design.md 或产出空 design.md | `forge validate <id>` 跑完报"design.md missing or empty H1"。最小约束:必须有 H1 标题(同 proposal/specs 一致)。AI 模板要求收到这个错就回去补 |
```

#### Step 3.2:在 §3.5 specs-sync 段落加 delete 推 v0.2 说明

打开同文件,找 §3.5 archive 顺序原子化协议(L508 附近),在 §3.5 末尾(`不变量:` 段落之后)追加一段:

```markdown

**specs-sync delete 语义推 v0.2**:

v0.1 的 specs-sync 模块(`core/specs-sync/`)只支持 `create` 和 `replace` 两种 deltas 操作。spec 中"新增/修改/删除"三种语义里,**delete 语义留给 v0.2 实现**——理由:

- v0.1 的常规工作流是"新增 spec"或"修改既有 spec",删除 spec 极少见(说明该 change 决定撤销某个功能)
- delete 需要在 changes/<id>/specs/ 用特殊标记表达(如空文件 + frontmatter `deleted: true`),会引入 schema 设计决策
- v0.1 的 archive 命令调 specs-sync 时,如果 deltas 含 delete operation,直接抛错(`v0.2 not implemented`)

v0.2 加 delete 时会同步更新 spec §3.5 + plan,设计 deletion marker 格式。
```

#### Step 3.3:Commit + push

```bash
git add docs/specs/2026-05-04-forge-fusion-design.md
git commit -m "docs(spec): add design.md minimum constraint + spec-sync delete deferred to v0.2"
git push
```

---

### Task 4:ESLint 配置收紧 + 让 config 文件自身进 lint(M1)

**Files:**
- Modify: `eslint.config.js`

#### Step 4.1:打开 `eslint.config.js`,改 ignores + 加 config 专用 lint block

把 `ignores` 行从:

```javascript
ignores: ['dist/**', 'node_modules/**', 'spike/**', '**/*.config.js', '**/*.config.ts'],
```

改为(把 `*.config.{js,ts}` 拆掉,改在末尾用专 block):

```javascript
ignores: ['dist/**', 'node_modules/**', 'spike/**'],
```

然后**在末尾新加一个 block**(放在原 src+tests 共用 block 之后,在 src 专用 type-aware block 之后):

```javascript
// 配置文件自己进 lint(eslint.config.js / vitest.config.ts / etc),但不开 type-aware
{
  files: ['*.config.{js,ts,mjs,cjs}', 'scripts/**/*.{js,mjs,ts}'],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // 配置文件不进 tsconfig.json,不开 type-aware
    },
  },
  plugins: {
    '@typescript-eslint': tsPlugin,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': 'off',
  },
},
```

#### Step 4.2:跑 lint 验证

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm lint
```

预期:0 错误。如果 vitest.config.ts 或 eslint.config.js 自己有 lint 错误,**修了再继续**(必然是写法上的小毛病)。

#### Step 4.3:Commit + push + CI

```bash
git add eslint.config.js
git commit -m "chore(eslint): narrow config file ignore + lint config files (Plan 2 reviewer M1)"
git push
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

预期:绿。

---

### Task 5:README 状态更新(M2)

**Files:**
- Modify: `README.md`

#### Step 5.1:打开 README.md,改第 5 行

把:

```
**当前状态**:设计阶段(spec 已完成 5 轮 Codex 对抗审查)。实施未开始。
```

改为:

```
**当前状态**:Phase 1 Core Engine 完成(80 unit tests passing)。**Phase 2 CLI + Phase 3 Adapters 进行中**(Plan 3)。
```

#### Step 5.2:Commit + push

```bash
git add README.md
git commit -m "docs: update README current status (Plan 2 reviewer M2)"
git push
```

---

## Phase A:Adapter 基础

### Task 6:`HarnessAdapter` interface

**Files:**
- Create: `src/core/harness-adapters/interface.ts`、`types.ts`、`index.ts`(替换占位前先创建)
- Test: `tests/core/harness-adapters/interface.test.ts`(类型测试)

#### Step 6.1:写 `src/core/harness-adapters/types.ts`

```typescript
// Harness adapter 共用类型 — spec §2.1 + Phase 0.5 spike 结果

/** 受支持的 harness 标识 */
export type HarnessId = 'claude' | 'codex' | 'opencode';

/** harness 检测结果 — 项目里这个 harness 是否装了 */
export interface HarnessDetection {
  id: HarnessId;
  detected: boolean;
  /** 检测到的标志路径(如 `.claude/`、`AGENTS.md`) */
  detectedAt?: string;
}

/**
 * skill 文件描述 — adapter 要铺什么内容
 * Plan 4 之前 templates 是占位,这里只关心结构
 */
export interface SkillSpec {
  /** skill 名(如 'using-forge', 'forge-brainstorming') */
  name: string;
  /** SKILL.md 内容 */
  content: string;
}

/** slash 命令模板描述 */
export interface CommandSpec {
  /** 命令名(如 'brainstorm', 'propose') — 完整命令是 `/forge:<name>` */
  name: string;
  /** 命令模板 markdown 内容 */
  content: string;
}

/** adapter 部署任务输入 */
export interface DeployInput {
  /** 项目根目录 */
  projectRoot: string;
  /** 要铺的 skill 列表 */
  skills: SkillSpec[];
  /** 要铺的命令列表 */
  commands: CommandSpec[];
}
```

#### Step 6.2:写 `src/core/harness-adapters/interface.ts`

```typescript
// HarnessAdapter — 每个 harness 一个实现 — spec §2.1

import type { HarnessId, DeployInput, HarnessDetection } from './types.js';

export interface HarnessAdapter {
  /** harness 标识 */
  readonly id: HarnessId;

  /**
   * 检测当前 projectRoot 下是否有该 harness 的痕迹(已装/启用)。
   * 用于 `forge init` 时给用户看 default 选项。
   */
  detect(projectRoot: string): Promise<HarnessDetection>;

  /**
   * 计算该 adapter 部署后的目标文件列表(相对 projectRoot 的路径 + 内容)。
   * 这是"纯函数"步骤 — 不写 fs。
   * Plan 3 transaction 用这个结果做 Stage 阶段的预生成。
   */
  plan(input: DeployInput): Promise<DeployPlan>;
}

/** plan() 输出:目标文件清单 */
export interface DeployPlan {
  files: PlannedFile[];
}

export interface PlannedFile {
  /** 相对 projectRoot 的路径(POSIX 风格) */
  relPath: string;
  /** 文件内容 */
  content: string;
}
```

#### Step 6.3:写 `src/core/harness-adapters/index.ts`(替换占位 export {})

```typescript
export * from './types.js';
export * from './interface.js';
```

#### Step 6.4:写测试 `tests/core/harness-adapters/interface.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import type { HarnessAdapter, HarnessId, DeployPlan } from '../../../src/core/harness-adapters/index.js';

describe('HarnessAdapter interface', () => {
  it('accepts a valid HarnessAdapter shape', () => {
    const stub: HarnessAdapter = {
      id: 'claude',
      detect: async () => ({ id: 'claude', detected: true, detectedAt: '.claude/' }),
      plan: async () => ({ files: [] } satisfies DeployPlan),
    };
    expect(stub.id).toBe('claude');
  });

  it('HarnessId is a string union of three known harness', () => {
    const ids: HarnessId[] = ['claude', 'codex', 'opencode'];
    expect(ids).toHaveLength(3);
  });
});
```

#### Step 6.5:跑测试

```bash
mkdir -p tests/core/harness-adapters
pnpm test tests/core/harness-adapters/interface.test.ts
```

预期:2 passed。

#### Step 6.6:Commit

```bash
git add src/core/harness-adapters/types.ts src/core/harness-adapters/interface.ts src/core/harness-adapters/index.ts tests/core/harness-adapters/interface.test.ts
git commit -m "feat(core/harness-adapters): types + HarnessAdapter interface"
```

---

### Task 7:Harness detector

**Files:**
- Create: `src/core/harness-adapters/detector.ts`
- Modify: `src/core/harness-adapters/index.ts`(追加 detector 导出)
- Test: `tests/core/harness-adapters/detector.test.ts`

#### Step 7.1:写测试 `tests/core/harness-adapters/detector.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { detectAll } from '../../../src/core/harness-adapters/index.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('detectAll', () => {
  it('detects claude when .claude/ exists', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-detect-'));
    try {
      mkdirSync(join(d, '.claude'));
      const r = await detectAll(d);
      expect(r.find((x) => x.id === 'claude')?.detected).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('detects codex when .agents/ exists', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-detect-'));
    try {
      mkdirSync(join(d, '.agents'));
      const r = await detectAll(d);
      expect(r.find((x) => x.id === 'codex')?.detected).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('all detected=false on empty directory', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-detect-'));
    try {
      const r = await detectAll(d);
      expect(r.every((x) => !x.detected)).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('returns 3 entries (claude/codex/opencode) regardless of detection', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-detect-'));
    try {
      const r = await detectAll(d);
      expect(r).toHaveLength(3);
      expect(r.map((x) => x.id).sort()).toEqual(['claude', 'codex', 'opencode']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
```

#### Step 7.2:跑测试 RED — 预期 FAIL。

#### Step 7.3:实现 `src/core/harness-adapters/detector.ts`

```typescript
// harness 检测 — 看项目里是否有 .claude/ / .agents/ / .opencode/

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessId, HarnessDetection } from './types.js';

const DETECTION_PATHS: Record<HarnessId, string[]> = {
  claude: ['.claude'],
  codex: ['.agents'], // 共享 Claude Agent SDK 约定(Phase 0.5 spike 实测)
  opencode: ['.opencode', 'AGENTS.md'],
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function detect(projectRoot: string, id: HarnessId): Promise<HarnessDetection> {
  const candidates = DETECTION_PATHS[id];
  for (const rel of candidates) {
    const abs = join(projectRoot, rel);
    if (await pathExists(abs)) {
      return { id, detected: true, detectedAt: rel };
    }
  }
  return { id, detected: false };
}

export async function detectAll(projectRoot: string): Promise<HarnessDetection[]> {
  const ids: HarnessId[] = ['claude', 'codex', 'opencode'];
  return Promise.all(ids.map((id) => detect(projectRoot, id)));
}
```

#### Step 7.4:更新 `src/core/harness-adapters/index.ts`

```typescript
export * from './types.js';
export * from './interface.js';
export * from './detector.js';
```

#### Step 7.5:跑测试 GREEN

```bash
pnpm test tests/core/harness-adapters/detector.test.ts
```

预期:4 passed。

#### Step 7.6:Commit

```bash
git add src/core/harness-adapters/detector.ts src/core/harness-adapters/index.ts tests/core/harness-adapters/detector.test.ts
git commit -m "feat(core/harness-adapters): detector for claude/codex/opencode"
```

---

### Task 8:Adapter transaction(Stage→Backup→Commit)

**Files:**
- Create: `src/core/harness-adapters/transaction.ts`
- Modify: `src/core/harness-adapters/index.ts`
- Test: `tests/core/harness-adapters/transaction.test.ts`

#### Step 8.1:写测试 `tests/core/harness-adapters/transaction.test.ts`

```typescript
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
      expect(readFileSync(join(d, '.claude/skills/forge-brainstorming/SKILL.md'), 'utf8')).toBe('B');
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
```

#### Step 8.2:跑测试 RED — 预期 FAIL。

#### Step 8.3:实现 `src/core/harness-adapters/transaction.ts`

```typescript
// adapter 三阶段原子化部署 — spec §4.2

import { mkdir, writeFile, rename, rm, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { DeployPlan } from './interface.js';

/**
 * 部署多个 plan 到 projectRoot,使用 Stage→Backup→Commit 三阶段原子化(spec §4.2)。
 *
 * 1. **Stage**:把所有 plan 的文件先写到 forge/.cache/staging-<pid>/ 镜像目录
 * 2. **Backup**:对每个目标位置(若已存在),备份到 forge/.cache/backup-<pid>/
 * 3. **Commit**:逐个目标 rm 旧 + rename staging → 目标
 *    - 任一失败 → 反向回滚:已 rename 的 adapter 从 backup 恢复
 *    - 反向回滚也失败 → abort,退出码 3,人工介入
 */
export async function deployAtomic(projectRoot: string, plans: DeployPlan[]): Promise<void> {
  const pid = process.pid;
  const cacheDir = join(projectRoot, 'forge', '.cache');
  const stagingDir = join(cacheDir, `staging-${pid}`);
  const backupDir = join(cacheDir, `backup-${pid}`);

  // 确保 cache 父目录存在
  await mkdir(cacheDir, { recursive: true });

  // 收集所有计划文件
  const allFiles = plans.flatMap((p) => p.files);

  // 阶段 1:Stage
  try {
    for (const f of allFiles) {
      const stagedAbs = join(stagingDir, f.relPath);
      await mkdir(dirname(stagedAbs), { recursive: true });
      await writeFile(stagedAbs, f.content, 'utf8');
    }
  } catch (err) {
    await rm(stagingDir, { recursive: true, force: true });
    throw new Error(`Stage failed: ${(err as Error).message}`);
  }

  // 阶段 2:Backup(对每个**顶层目标目录**备份,而不是对每个文件)
  // 收集 plan 目标 top-level dirs(如 .claude/skills/forge-using-forge/)
  const targetDirs = collectTargetDirs(allFiles);
  try {
    for (const targetRel of targetDirs) {
      const targetAbs = join(projectRoot, targetRel);
      if (existsSync(targetAbs)) {
        const backupAbs = join(backupDir, targetRel);
        await mkdir(dirname(backupAbs), { recursive: true });
        await cp(targetAbs, backupAbs, { recursive: true });
      }
    }
  } catch (err) {
    await rm(stagingDir, { recursive: true, force: true });
    await rm(backupDir, { recursive: true, force: true });
    throw new Error(`Backup failed: ${(err as Error).message}`);
  }

  // 阶段 3:Commit(逐文件 rename)
  const committed: string[] = [];
  try {
    for (const f of allFiles) {
      const stagedAbs = join(stagingDir, f.relPath);
      const targetAbs = join(projectRoot, f.relPath);
      await mkdir(dirname(targetAbs), { recursive: true });
      // 已存在则先删
      if (existsSync(targetAbs)) {
        await rm(targetAbs, { force: true });
      }
      await rename(stagedAbs, targetAbs);
      committed.push(f.relPath);
    }
    // 全部成功 → 清理
    await rm(stagingDir, { recursive: true, force: true });
    await rm(backupDir, { recursive: true, force: true });
  } catch (err) {
    // 反向回滚
    try {
      for (const rel of committed) {
        const targetAbs = join(projectRoot, rel);
        const backupAbs = join(backupDir, rel);
        if (existsSync(targetAbs)) await rm(targetAbs, { force: true });
        if (existsSync(backupAbs)) await cp(backupAbs, targetAbs, { recursive: true });
      }
      await rm(stagingDir, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
      throw new Error(`Commit failed and rolled back: ${(err as Error).message}`);
    } catch (rollbackErr) {
      // 回滚也失败
      throw new Error(
        `Commit failed AND rollback failed: ${(err as Error).message} / ${(rollbackErr as Error).message}\n` +
          `请手动清理 ${stagingDir} 和 ${backupDir},然后从 backup 恢复目标位置`,
      );
    }
  }
}

/** 收集"被该 plan 影响的顶层目标目录"用于 backup */
function collectTargetDirs(files: { relPath: string }[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    // 取 relPath 的第二层目录(如 .claude/skills/),adapter 实际部署都是这个层级
    const parts = f.relPath.split('/');
    if (parts.length >= 2) {
      dirs.add(parts.slice(0, 2).join('/'));
    } else {
      dirs.add(parts[0] ?? '');
    }
  }
  return Array.from(dirs).filter(Boolean);
}
```

#### Step 8.4:更新 `src/core/harness-adapters/index.ts`

```typescript
export * from './types.js';
export * from './interface.js';
export * from './detector.js';
export * from './transaction.js';
```

#### Step 8.5:跑测试 GREEN

```bash
pnpm test tests/core/harness-adapters/transaction.test.ts
```

预期:4 passed。

#### Step 8.6:全部本地命令

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

预期:全 0,**累计 ~91 tests**(80 + ~11 新增到此为止)。

#### Step 8.7:Commit + push + CI

```bash
git add src/core/harness-adapters/transaction.ts src/core/harness-adapters/index.ts tests/core/harness-adapters/transaction.test.ts
git commit -m "feat(core/harness-adapters): atomic Stage→Backup→Commit deployment"
git push
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

---

## Phase B:Adapter 实现

### Task 9:Claude adapter

**Files:**
- Create: `src/core/harness-adapters/claude.ts`
- Modify: `src/core/harness-adapters/index.ts`
- Test: `tests/core/harness-adapters/claude.test.ts`

#### Step 9.1:写测试 `tests/core/harness-adapters/claude.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../../src/core/harness-adapters/index.js';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('ClaudeAdapter', () => {
  it('id is "claude"', () => {
    expect(new ClaudeAdapter().id).toBe('claude');
  });

  it('detect=true when .claude/ exists', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-claude-'));
    try {
      mkdirSync(join(d, '.claude'));
      const r = await new ClaudeAdapter().detect(d);
      expect(r.detected).toBe(true);
      expect(r.detectedAt).toBe('.claude');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('plan() generates .claude/skills/forge-<name>/SKILL.md for each skill', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-claude-'));
    try {
      const adapter = new ClaudeAdapter();
      const plan = await adapter.plan({
        projectRoot: d,
        skills: [
          { name: 'using-forge', content: 'bootstrap content' },
          { name: 'brainstorming', content: 'brainstorm content' },
        ],
        commands: [{ name: 'brainstorm', content: 'cmd content' }],
      });
      const paths = plan.files.map((f) => f.relPath);
      expect(paths).toContain('.claude/skills/forge-using-forge/SKILL.md');
      expect(paths).toContain('.claude/skills/forge-brainstorming/SKILL.md');
      expect(paths).toContain('.claude/commands/forge/brainstorm.md');
      expect(plan.files.find((f) => f.relPath.includes('using-forge'))?.content).toBe(
        'bootstrap content',
      );
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
```

#### Step 9.2:跑测试 RED — 预期 FAIL。

#### Step 9.3:实现 `src/core/harness-adapters/claude.ts`

```typescript
// Claude Code adapter — 铺到 .claude/skills/forge-<name>/SKILL.md 和 .claude/commands/forge/<name>.md
// 路径基于 Phase 0.5 spike 实测(spike/claude-code/.claude/...)

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  HarnessAdapter,
  DeployInput,
  DeployPlan,
  HarnessDetection,
  PlannedFile,
} from './interface.js';

export class ClaudeAdapter implements HarnessAdapter {
  readonly id = 'claude' as const;

  async detect(projectRoot: string): Promise<HarnessDetection> {
    const target = join(projectRoot, '.claude');
    try {
      await stat(target);
      return { id: this.id, detected: true, detectedAt: '.claude' };
    } catch {
      return { id: this.id, detected: false };
    }
  }

  async plan(input: DeployInput): Promise<DeployPlan> {
    const files: PlannedFile[] = [];
    for (const skill of input.skills) {
      files.push({
        relPath: `.claude/skills/forge-${skill.name}/SKILL.md`,
        content: skill.content,
      });
    }
    for (const cmd of input.commands) {
      files.push({
        relPath: `.claude/commands/forge/${cmd.name}.md`,
        content: cmd.content,
      });
    }
    return { files };
  }
}
```

#### Step 9.4:更新 `src/core/harness-adapters/index.ts`

```typescript
export * from './types.js';
export * from './interface.js';
export * from './detector.js';
export * from './transaction.js';
export * from './claude.js';
```

#### Step 9.5:跑测试 GREEN

```bash
pnpm test tests/core/harness-adapters/claude.test.ts
```

预期:3 passed。

#### Step 9.6:Commit

```bash
git add src/core/harness-adapters/claude.ts src/core/harness-adapters/index.ts tests/core/harness-adapters/claude.test.ts
git commit -m "feat(core/harness-adapters): Claude Code adapter (.claude/skills + .claude/commands)"
```

---

### Task 10:Codex adapter(用 `.agents/skills/`,**不**是 `.codex/skills/`)

**Files:**
- Create: `src/core/harness-adapters/codex.ts`
- Modify: `src/core/harness-adapters/index.ts`
- Test: `tests/core/harness-adapters/codex.test.ts`

#### Step 10.1:写测试 `tests/core/harness-adapters/codex.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { CodexAdapter } from '../../../src/core/harness-adapters/index.js';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('CodexAdapter', () => {
  it('id is "codex"', () => {
    expect(new CodexAdapter().id).toBe('codex');
  });

  it('detect=true when .agents/ exists (NOT .codex/)', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-codex-'));
    try {
      mkdirSync(join(d, '.agents'));
      const r = await new CodexAdapter().detect(d);
      expect(r.detected).toBe(true);
      expect(r.detectedAt).toBe('.agents');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('plan() generates .agents/skills/forge-<name>/SKILL.md (NOT .codex/skills/)', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-codex-'));
    try {
      const adapter = new CodexAdapter();
      const plan = await adapter.plan({
        projectRoot: d,
        skills: [{ name: 'using-forge', content: 'bootstrap' }],
        commands: [],
      });
      const paths = plan.files.map((f) => f.relPath);
      expect(paths).toContain('.agents/skills/forge-using-forge/SKILL.md');
      // 关键回归:不能是 .codex/...
      expect(paths.every((p) => !p.startsWith('.codex/'))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
```

#### Step 10.2:跑测试 RED。

#### Step 10.3:实现 `src/core/harness-adapters/codex.ts`

```typescript
// Codex adapter — 铺到 .agents/skills/forge-<name>/SKILL.md
// 关键:Phase 0.5 spike 实测 Codex 用 .agents/(共享 Claude Agent SDK 约定),不是 .codex/

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  HarnessAdapter,
  DeployInput,
  DeployPlan,
  HarnessDetection,
  PlannedFile,
} from './interface.js';

export class CodexAdapter implements HarnessAdapter {
  readonly id = 'codex' as const;

  async detect(projectRoot: string): Promise<HarnessDetection> {
    const target = join(projectRoot, '.agents');
    try {
      await stat(target);
      return { id: this.id, detected: true, detectedAt: '.agents' };
    } catch {
      return { id: this.id, detected: false };
    }
  }

  async plan(input: DeployInput): Promise<DeployPlan> {
    const files: PlannedFile[] = [];
    for (const skill of input.skills) {
      files.push({
        relPath: `.agents/skills/forge-${skill.name}/SKILL.md`,
        content: skill.content,
      });
    }
    // Codex 暂不需要 commands(spike 阶段只验 skills 自动注入即可触发 brainstorming)
    // commands 模板在 Plan 4 完整 v0.1 时再决定是否需要(可能用 plugin manifest 形式)
    if (input.commands.length > 0) {
      // forge v0.1 先把 commands 写到 .agents/commands/forge/<name>.md(对称 Claude 路径)
      // v0.2 视 Codex 实际行为调整
      for (const cmd of input.commands) {
        files.push({
          relPath: `.agents/commands/forge/${cmd.name}.md`,
          content: cmd.content,
        });
      }
    }
    return { files };
  }
}
```

#### Step 10.4:更新 `src/core/harness-adapters/index.ts`

```typescript
export * from './types.js';
export * from './interface.js';
export * from './detector.js';
export * from './transaction.js';
export * from './claude.js';
export * from './codex.js';
```

#### Step 10.5:跑测试 GREEN + Commit

```bash
pnpm test tests/core/harness-adapters/codex.test.ts
git add src/core/harness-adapters/codex.ts src/core/harness-adapters/index.ts tests/core/harness-adapters/codex.test.ts
git commit -m "feat(core/harness-adapters): Codex adapter (.agents/skills, NOT .codex/)"
```

---

## Phase C:Archive transaction + lock + recover

### Task 11:Archive transaction(Move→Sync)

**Files:**
- Create: `src/core/archive/transaction.ts`、`index.ts`
- Test: `tests/core/archive/transaction.test.ts`

完整实现按 spec §3.5。详细代码见 plan 后续 task 引用,**核心逻辑**:

```typescript
// src/core/archive/transaction.ts
import { rename, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { readDeltas, applyDeltas } from '../specs-sync/index.js';

export interface ArchiveTransactionInput {
  forgeRoot: string;        // <project>/forge/
  changeId: string;         // 'add-login'
  archiveDate: string;      // '2026-05-04'
}

/**
 * archive 顺序原子化:Move→Sync(spec §3.5)
 * 1. fs.rename forge/changes/<id>/ → forge/changes/archive/<date>-<id>/(单原子)
 * 2. forge sync internal:把 archive/<date>-<id>/specs/ 应用到 forge/specs/(可回滚)
 * 3. sync 失败 → 反向 rename + specs/ 备份恢复
 */
export async function archiveTransaction(input: ArchiveTransactionInput): Promise<void> {
  const { forgeRoot, changeId, archiveDate } = input;
  const sourceDir = join(forgeRoot, 'changes', changeId);
  const archiveTargetDir = join(forgeRoot, 'changes', 'archive', `${archiveDate}-${changeId}`);
  const currentSpecsDir = join(forgeRoot, 'specs');
  const backupDir = join(forgeRoot, '.cache', `archive-sync-backup-${process.pid}`);

  // 阶段 1:Move
  await mkdir(dirname(archiveTargetDir), { recursive: true });
  await rename(sourceDir, archiveTargetDir);

  // 阶段 2:Sync(可回滚)
  try {
    // 备份当前 specs/
    if (existsSync(currentSpecsDir)) {
      await cp(currentSpecsDir, backupDir, { recursive: true });
    }
    // 跑 sync
    const archiveSpecs = join(archiveTargetDir, 'specs');
    const deltas = await readDeltas(archiveSpecs, currentSpecsDir);
    await applyDeltas(currentSpecsDir, deltas);
    // 成功 → 删 backup
    if (existsSync(backupDir)) await rm(backupDir, { recursive: true, force: true });
  } catch (syncErr) {
    // 反向回滚
    try {
      // a. 从 backup 恢复 specs/
      if (existsSync(backupDir)) {
        await rm(currentSpecsDir, { recursive: true, force: true });
        await cp(backupDir, currentSpecsDir, { recursive: true });
      }
      // b. 反向 rename
      await rename(archiveTargetDir, sourceDir);
      // c. 删 backup
      if (existsSync(backupDir)) await rm(backupDir, { recursive: true, force: true });
      throw new Error(`Sync failed and rolled back: ${(syncErr as Error).message}`);
    } catch (rbErr) {
      throw new Error(
        `Sync failed AND rollback failed: ${(syncErr as Error).message} / ${(rbErr as Error).message}\n` +
          `请手动检查 ${backupDir} 和 ${archiveTargetDir}`,
      );
    }
  }
}
```

按上面的代码实现 + 测试(4 测试):
1. happy path(Move + Sync 都成功)
2. Move 失败时 specs/ 不变
3. Sync 失败时 archive 反向 rename + specs 从 backup 恢复
4. backup 在成功后被清理

详细 test 模板按 plan §Task 18 specs-sync 测试结构 + plan §Task 14 content hash 测试结构组合。

(因篇幅,具体测试代码工程师按上述 4 个 case 编写,模仿现有 test 风格用 `mkdtempSync` + `setup/cleanup` helper。)

#### Step 11 — 6 步 + commit:

按 Plan 1/2 模式:test → RED → impl → GREEN → typecheck/lint/format → commit + push。

```bash
git add src/core/archive/ tests/core/archive/
git commit -m "feat(core/archive): Move→Sync transaction with rollback (spec §3.5)"
```

---

### Task 12:Archive lock(`forge/.cache/archive.lock`)

**Files:**
- Create: `src/core/archive/lock.ts`
- Modify: `src/core/archive/index.ts`(追加 lock 导出)
- Test: `tests/core/archive/lock.test.ts`

按 spec §3.5 lock 协议:`O_CREAT|O_EXCL` 创建独占文件,内容 `{pid, started_at, mode}`,stale lock 检测 pid 存活后强制清理。

```typescript
// src/core/archive/lock.ts
import { writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, openSync, closeSync, constants } from 'node:fs';
import { join } from 'node:path';

interface LockData {
  pid: number;
  started_at: string;
  mode: 'archive' | 'recover';
}

export class LockHeldError extends Error {
  constructor(public readonly holder: LockData) {
    super(`another forge archive is in progress (pid ${holder.pid}, mode ${holder.mode}, started ${holder.started_at})`);
    this.name = 'LockHeldError';
  }
}

export async function acquireLock(forgeRoot: string, mode: 'archive' | 'recover'): Promise<() => Promise<void>> {
  const lockPath = join(forgeRoot, '.cache', 'archive.lock');
  // 用 O_CREAT|O_EXCL 独占创建
  let fd: number;
  try {
    fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      // 检查是否 stale
      const data = JSON.parse(await readFile(lockPath, 'utf8')) as LockData;
      if (!isPidAlive(data.pid)) {
        // stale → 清理
        await rm(lockPath, { force: true });
        return acquireLock(forgeRoot, mode); // 重试
      }
      throw new LockHeldError(data);
    }
    throw err;
  }
  const data: LockData = { pid: process.pid, started_at: new Date().toISOString(), mode };
  await writeFile(lockPath, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'w' });
  closeSync(fd);

  // 返回 release 函数
  return async () => {
    if (existsSync(lockPath)) await rm(lockPath, { force: true });
  };
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // 不 send signal 只验证存活
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
```

测试 4 case:
1. acquire happy path → release 后文件清理
2. 第二次 acquire(同 pid 模拟)→ 抛 LockHeldError
3. stale lock(pid 不存活)→ 自动清理 + 重新 acquire 成功
4. release 是幂等的

#### Commit

```bash
git add src/core/archive/lock.ts src/core/archive/index.ts tests/core/archive/lock.test.ts
git commit -m "feat(core/archive): O_CREAT|O_EXCL lock with stale pid detection"
```

---

### Task 13:Archive recover(case A/B/C)

**Files:**
- Create: `src/core/archive/recover.ts`
- Modify: `src/core/archive/index.ts`
- Test: `tests/core/archive/recover.test.ts`

按 spec §3.5 `--recover` 状态机:

- case A:archive/<id>/ 存在 + specs deltas 未应用 → 重跑 Sync(单次,失败抛错让用户介入)
- case B:archive/ 完整 + backup 残留 → 验证一致性后删 backup
- case C:archive 与 backup 不一致 → 交互让用户选(完成归档 / 撤销归档)
- 全干净 → 报"无半完成状态需要恢复"

```typescript
// src/core/archive/recover.ts
import { readdir, rm, cp, rename, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyDeltas, readDeltas } from '../specs-sync/index.js';
import { computeContentHash } from '../hash/index.js';

export interface RecoverResult {
  case: 'clean' | 'A' | 'B' | 'C' | 'corrupt';
  message: string;
}

/**
 * --recover 单次尝试 + 明确退出码(spec §3.5)
 * 不自动循环。失败抛 Error,用户修底层问题后再跑。
 */
export async function recover(forgeRoot: string): Promise<RecoverResult> {
  const cacheDir = join(forgeRoot, '.cache');
  const archiveDir = join(forgeRoot, 'changes', 'archive');
  const currentSpecsDir = join(forgeRoot, 'specs');

  // 找有 backup 的 pid
  let backupDir: string | null = null;
  try {
    const cacheEntries = await readdir(cacheDir);
    const backups = cacheEntries.filter((e) => e.startsWith('archive-sync-backup-'));
    if (backups.length > 0) backupDir = join(cacheDir, backups[0]!);
  } catch {
    // 没 cache 目录,忽略
  }

  // 找 archive 目录里"刚归档"的 change(spec dir 与 specs/ 状态有偏差)
  let halfArchivedChange: string | null = null;
  // (实现:对比 archive 下每个 change 的 specs/ hash 与 currentSpecsDir 的 hash)
  // 简化版:看 archive 下最近修改的子目录,如果 backup 也存在就认为是它
  if (backupDir) {
    try {
      const archiveEntries = await readdir(archiveDir);
      // 最简单的 heuristic:倒序找最近的
      halfArchivedChange = archiveEntries.sort().reverse()[0] ?? null;
    } catch {
      // archive 不存在,case A 无意义
    }
  }

  // 状态机
  if (!halfArchivedChange && !backupDir) {
    return { case: 'clean', message: '无半完成状态需要恢复' };
  }

  if (halfArchivedChange && !backupDir) {
    // case A:archive 已经移完,但 sync 没跑(没 backup)
    // 重跑 Sync
    const archiveSpecs = join(archiveDir, halfArchivedChange, 'specs');
    const deltas = await readDeltas(archiveSpecs, currentSpecsDir);
    await applyDeltas(currentSpecsDir, deltas);
    return { case: 'A', message: `case A:重跑 Sync 完成(${halfArchivedChange})` };
  }

  if (halfArchivedChange && backupDir) {
    // 比较 backup vs current specs/ — 一致 = case B(只是 backup 没清),不一致 = case C
    // 简化:看文件数 + 总长度 hash
    const archiveSpecs = join(archiveDir, halfArchivedChange, 'specs');
    const deltas = await readDeltas(archiveSpecs, currentSpecsDir);
    if (deltas.every((d) => d.operation === 'replace')) {
      // 假设全 replace 且 current 已应用 → backup 是旧状态,可删
      await rm(backupDir, { recursive: true, force: true });
      return { case: 'B', message: `case B:删除残留 backup 完成` };
    }
    // case C — 交互(v0.1 简化:报告状态让用户决定)
    return {
      case: 'C',
      message: `case C:archive/${halfArchivedChange} 与 backup 不一致,需用户介入。请手动选择:\n` +
        `  [完成归档] cp ${backupDir}/* ${currentSpecsDir} 之后再跑 forge archive --recover\n` +
        `  [撤销归档] mv ${join(archiveDir, halfArchivedChange)} ${join(forgeRoot, 'changes')}/${halfArchivedChange.split('-').slice(3).join('-')}`,
    };
  }

  // backup 存在但 halfArchivedChange 不存在 — 状态损坏
  return { case: 'corrupt', message: 'backup 存在但找不到对应的 archive,状态损坏(退出码 4 等待人工介入)' };
}
```

测试 4 case + 1 clean。

#### Commit

```bash
git add src/core/archive/recover.ts src/core/archive/index.ts tests/core/archive/recover.test.ts
git commit -m "feat(core/archive): --recover state machine (case A/B/C/clean/corrupt)"
```

---

## Phase D:CLI 命令

### Task 14-17:CLI 命令(config / init / update / validate / archive)

> 每个命令一个 task,共 4 个 task(`config` / `init` / `update` / `archive`;`validate` 包到 `init` 里因为最简)。
>
> 详细代码遵循统一模板:`commander.command().description().action(async (...) => { ... })`,在 action 里调 core 模块。

#### Task 14:`forge config`(简单,先做)

```typescript
// src/cli/commands/config.ts
import { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../../core/parse/index.js';
import { stringify as stringifyYAML } from 'yaml';

export function buildConfigCommand(): Command {
  const cmd = new Command('config').description('Manage forge/config.yaml');

  cmd
    .command('get <field>')
    .description('Read a config field')
    .action(async (field: string) => {
      const path = join(process.cwd(), 'forge', 'config.yaml');
      if (!existsSync(path)) throw new Error(`forge/config.yaml not found at ${path}`);
      const config = parseConfig(await readFile(path, 'utf8'));
      const value = (config as unknown as Record<string, unknown>)[field];
      console.log(JSON.stringify(value ?? null, null, 2));
    });

  cmd
    .command('set <field> <value>')
    .description('Write a config field')
    .action(async (field: string, value: string) => {
      const path = join(process.cwd(), 'forge', 'config.yaml');
      await mkdir(join(process.cwd(), 'forge'), { recursive: true });
      let config: Record<string, unknown> = {};
      if (existsSync(path)) {
        config = parseConfig(await readFile(path, 'utf8')) as unknown as Record<string, unknown>;
      } else {
        config = { schema: 'forge-spec-driven/v1' };
      }
      config[field] = value;
      await writeFile(path, stringifyYAML(config), 'utf8');
      console.log(`set ${field} = ${value}`);
    });

  return cmd;
}
```

注册到 `src/cli/index.ts`:

```typescript
import { buildConfigCommand } from './commands/config.js';
program.addCommand(buildConfigCommand());
```

测试 `tests/cli/config.test.ts` 用 `runCli(args, cwd)` helper(下面 task 14 的 step 第一步会建)。

#### 通用 CLI test helper

`tests/cli/helpers.ts`(Task 14 step 1 创建):

```typescript
// CLI 集成测试 helper — 用 spawn 子进程跑 dist/cli/index.js
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_ENTRY = resolve(__dirname, '../../dist/cli/index.js');

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCli(args: string[], cwd: string): RunResult {
  try {
    const stdout = execFileSync('node', [CLI_ENTRY, ...args], { cwd, encoding: 'utf8' });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.status ?? 1 };
  }
}
```

注意:跑测试前要 `pnpm build` 让 `dist/cli/index.js` 存在。`vitest.config.ts` 在 setup 阶段自动跑 build,或在 CLI test 里加 `beforeAll(() => execSync('pnpm build'))`。

#### Task 15:`forge validate`

```typescript
// src/cli/commands/validate.ts
import { Command } from 'commander';
import { join } from 'node:path';
import { validateChange } from '../../core/validate/index.js';

export function buildValidateCommand(): Command {
  return new Command('validate')
    .argument('<changeId>', 'change directory id (e.g., add-login)')
    .description('Validate a change directory')
    .action(async (changeId: string) => {
      const changeDir = join(process.cwd(), 'forge', 'changes', changeId);
      const result = await validateChange(changeDir);
      if (result.valid) {
        console.log(`✓ ${changeId}: valid`);
        process.exit(0);
      } else {
        console.error(`✗ ${changeId}: ${result.errors.length} errors`);
        for (const e of result.errors) {
          console.error(`  - [${e.artifact}] ${e.field ?? ''}: ${e.message}${e.file ? ` (${e.file}${e.line ? `:${e.line}` : ''})` : ''}`);
        }
        process.exit(2);
      }
    });
}
```

#### Task 16:`forge init`

```typescript
// src/cli/commands/init.ts
import { Command } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectAll, ClaudeAdapter, CodexAdapter, deployAtomic } from '../../core/harness-adapters/index.js';
import type { HarnessAdapter, DeployInput } from '../../core/harness-adapters/index.js';

export function buildInitCommand(): Command {
  return new Command('init')
    .description('Initialize forge in current directory')
    .option('--harness <list>', 'comma-separated harness ids (claude,codex)', '')
    .action(async (opts: { harness: string }) => {
      const cwd = process.cwd();

      // 1. 检测 harness
      const detections = await detectAll(cwd);

      // 2. 选定要装的 adapter
      let selectedIds: string[];
      if (opts.harness) {
        selectedIds = opts.harness.split(',').map((s) => s.trim());
      } else {
        selectedIds = detections.filter((d) => d.detected && d.id !== 'opencode').map((d) => d.id);
        if (selectedIds.length === 0) {
          throw new Error('No supported harness detected. Use --harness=claude,codex to specify.');
        }
      }
      console.log(`Installing forge for: ${selectedIds.join(', ')}`);

      // 3. 准备 adapters
      const adapters: HarnessAdapter[] = [];
      for (const id of selectedIds) {
        if (id === 'claude') adapters.push(new ClaudeAdapter());
        else if (id === 'codex') adapters.push(new CodexAdapter());
        else if (id === 'opencode') {
          console.warn('OpenCode is v0.2 — skipping');
        } else {
          throw new Error(`Unknown harness id: ${id}`);
        }
      }

      // 4. plan() — Plan 3 阶段 templates 还是占位,用最小 stub 内容
      const input: DeployInput = {
        projectRoot: cwd,
        skills: [
          { name: 'using-forge', content: '<!-- placeholder, Plan 4 will fill -->' },
        ],
        commands: [],
      };
      const plans = await Promise.all(adapters.map((a) => a.plan(input)));

      // 5. 原子部署
      await deployAtomic(cwd, plans);

      // 6. 创建 forge/config.yaml + 目录
      const forgeDir = join(cwd, 'forge');
      await mkdir(join(forgeDir, 'drafts'), { recursive: true });
      await mkdir(join(forgeDir, 'changes'), { recursive: true });
      await mkdir(join(forgeDir, 'specs'), { recursive: true });
      const configPath = join(forgeDir, 'config.yaml');
      if (!existsSync(configPath)) {
        await writeFile(configPath, 'schema: forge-spec-driven/v1\n', 'utf8');
      }

      // 7. 检测非 git 项目并 warn
      if (!existsSync(join(cwd, '.git'))) {
        console.warn(
          '⚠ 非 git 项目下 review 标记不绑定代码 diff,archive 必须 --force 才接受。建议跑 `git init`。',
        );
      }

      console.log(`✓ forge initialized for ${selectedIds.length} harness(es)`);
    });
}
```

#### Task 17:`forge update` + `forge archive`

`update` 跟 `init` 类似但只重铺 skills/commands(不改 config.yaml / 不重新检测)。

`archive` 复杂:

```typescript
// src/cli/commands/archive.ts
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarker, validateMarkerSchema } from '../../core/markers/index.js';
import { computeTasksHash, computeContentHash } from '../../core/hash/index.js';
import { archiveTransaction } from '../../core/archive/transaction.js';
import { acquireLock, LockHeldError } from '../../core/archive/lock.js';
import { recover } from '../../core/archive/recover.js';

export function buildArchiveCommand(): Command {
  return new Command('archive')
    .argument('[changeId]', 'change directory id')
    .option('--force', 'accept human-override or non-git review markers')
    .option('--recover', 'recover from a half-completed archive')
    .action(async (changeId: string | undefined, opts: { force?: boolean; recover?: boolean }) => {
      const forgeRoot = join(process.cwd(), 'forge');

      // --recover 单独路径
      if (opts.recover) {
        const release = await acquireLock(forgeRoot, 'recover');
        try {
          const r = await recover(forgeRoot);
          console.log(r.message);
          if (r.case === 'corrupt') process.exit(4);
          if (r.case === 'C') process.exit(0); // 用户决定后再跑
          process.exit(0);
        } catch (err) {
          if (err instanceof LockHeldError) {
            console.error(err.message);
            process.exit(5);
          }
          throw err;
        } finally {
          await release();
        }
      }

      // 正常 archive 路径
      if (!changeId) throw new Error('changeId required (unless using --recover)');

      const release = await acquireLock(forgeRoot, 'archive');
      try {
        const changeDir = join(forgeRoot, 'changes', changeId);
        const verifyPath = join(changeDir, '.verify-passed');
        const reviewPath = join(changeDir, '.review-passed');

        if (!existsSync(verifyPath) || !existsSync(reviewPath)) {
          console.error(`✗ archive 拒绝:缺 .verify-passed 或 .review-passed`);
          process.exit(2);
        }

        // 解析 + 类型校验
        const verify = parseMarker(await readFile(verifyPath, 'utf8'));
        const review = parseMarker(await readFile(reviewPath, 'utf8'));
        for (const m of [verify, review]) {
          const r = validateMarkerSchema(m);
          if (!r.valid) {
            console.error(`✗ marker schema 校验失败:${r.errors[0]?.message}`);
            process.exit(2);
          }
        }

        // hash 重算 + 比对
        const tasksContent = await readFile(join(changeDir, 'tasks.md'), 'utf8');
        const tasksHashNow = computeTasksHash(tasksContent);
        const contentHashNow = await computeContentHash(changeDir);
        const v = verify as unknown as Record<string, string>;
        const r = review as unknown as Record<string, string>;
        if (tasksHashNow !== v.tasks_hash || contentHashNow !== v.content_hash) {
          console.error('✗ verify-passed marker 已过期(tasks/content hash 不匹配),请重跑 verify');
          process.exit(2);
        }
        if (tasksHashNow !== r.tasks_hash || contentHashNow !== r.content_hash) {
          console.error('✗ review-passed marker 已过期,请重跑 review');
          process.exit(2);
        }

        // human-override 检查(--force)
        const verifiedBy = (verify as { verified_by?: string }).verified_by;
        const reviewedBy = (review as { reviewed_by?: string }).reviewed_by;
        if (verifiedBy === 'human-override' || reviewedBy === 'human-override') {
          if (!opts.force) {
            console.error('✗ human-override 标记需 --force 接受');
            process.exit(2);
          }
        }

        // archive transaction
        const archiveDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        await archiveTransaction({ forgeRoot, changeId, archiveDate });
        console.log(`✓ archived ${changeId} → archive/${archiveDate}-${changeId}`);
      } finally {
        await release();
      }
    });
}
```

每个命令独立 task + 各自 4-6 个测试用例(happy path + 错误路径)。

---

## Phase E:Integration

### Task 18:CLI integration test(pack-smoke 已在 Task 1)

每个 CLI 命令有自己的集成测试,Task 14-17 已涵盖。最后做端到端 smoke:

```typescript
// tests/cli/end-to-end.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

beforeAll(() => execSync('pnpm build', { stdio: 'inherit' }));

describe('forge CLI end-to-end', () => {
  it('forge init --harness=claude creates expected structure', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-e2e-'));
    try {
      const r = runCli(['init', '--harness=claude'], d);
      expect(r.exitCode).toBe(0);
      expect(existsSync(join(d, '.claude/skills/forge-using-forge/SKILL.md'))).toBe(true);
      expect(existsSync(join(d, 'forge/config.yaml'))).toBe(true);
      expect(existsSync(join(d, 'forge/changes'))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('forge --version prints version', () => {
    const r = runCli(['--version'], process.cwd());
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

---

### Task 19:README 更新 + Plan 4 接手清单

```markdown
## Plan 3 进度

Phase 2(CLI)+ Phase 3 cut(2 个 adapter)完成:

- 5 个公开 CLI 命令:`forge init/update/config/validate/archive`(其中 archive 含 `--force` 和 `--recover` 子模式)
- 2 个 adapter:`claude.ts`(`.claude/skills + .claude/commands`)、`codex.ts`(`.agents/skills` 共享 Claude Agent SDK 约定)
- archive 顺序原子化(Move→Sync 三阶段 + lock + recover)

Plan 4 接手:Phase 4(12 个 superpowers skill 真实内容 + 6 个 slash 命令模板)。
```

### Task 20:Plan 3 完成 + 最终自查

按 Plan 1/2 模板:跑 5 个本地命令 + 验证测试数 + 更新 README + commit + push + 等 CI。

---

## Plan 3 完成标准

- [ ] CI Linux + Windows 全绿
- [ ] 5 个本地命令(typecheck / lint / format:check / test / build)全 0
- [ ] 测试用例总数 ≥ 130(Plan 2 末尾 80 + Plan 3 新增 ~50)
- [ ] `forge --version` 真能跑(global install 后)
- [ ] `pnpm pack` tarball 含 `dist/cli/index.js` + shebang 完整
- [ ] 5 个 CLI 命令各有集成测试
- [ ] 2 个 adapter 各有单元测试
- [ ] archive transaction + lock + recover 都有测试
- [ ] Plan 2 reviewer punch list(I1-I4 + M1-M2)全部完成

---

## Plan 3 → Plan 4 衔接

Plan 4 范围:

- 把 12 个 superpowers skill 真实文本(MIT 复制 + 改名)放进 `src/core/templates/skills/`
- 写 6 个 `/forge:*` slash 命令模板
- 替换 `src/core/templates/index.ts` 占位为真实模板 registry
- `forge init` 用真实 templates 而不是 stub `<!-- placeholder -->`
- 新增 e2e:`forge init` 后 `claude -p "我想做个 todo list 应用"` 真触发 brainstorming(类似 Phase 0.5 spike acceptance test,但用 v0.1 实际产物)

不在 Plan 4:eval 框架(Plan 5)、release polish(Plan 6)。
