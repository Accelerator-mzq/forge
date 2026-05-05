# Forge Plan 4:Templates 真文本移植 + slash 命令 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**:把 12 个 superpowers skill 真实文本(MIT)复制并改名到 `forge:` 命名空间;新写 6 个 `/forge:*` slash 命令模板;实现 `--force` flag 真覆盖语义(SHA256 hash 比对);`forge init`/`update` 用真模板替换 stub;新增 e2e brainstorming acceptance test(gated by `CLAUDE_BIN` + `ANTHROPIC_API_KEY` env)。

**Architecture**:模板内容以 markdown 文件形式存于 `src/core/templates/{skills,commands}/`。新增 `scripts/copy-templates.mjs` 在 `pnpm build` 前把 `*.md` 复制到 `dist/`,运行时由 loader 通过 `import.meta.url` 定位文件读取(开发模式从 `src/`,生产模式从 `dist/`)。Loader 模块导出 `loadAllSkills()` / `loadAllCommands()` registry,被 init/update 调用。Hash 比对模块(`harness-adapters/hash-compare.ts`)在 `deployAtomic` 之前过滤 plan:已存在文件 hash == shipped → 跳过 no-op;hash != shipped 且无 `--force` → 跳过并 warn;`--force` → 覆盖。

**Tech Stack**:已有(TypeScript 5.6+ + Node 20.19+ + ESM + Vitest 2 + commander 12);新增使用:`node:crypto` SHA256(无新依赖)、`fs.cp`(prebuild 脚本)。

**Spec 引用**:[`docs/specs/2026-05-04-forge-fusion-design.md`](../specs/2026-05-04-forge-fusion-design.md) §1.3 bootstrap 注入、§2.2 6 slash 命令 + 12 skill 表、§4.2 已存在 skill + 用户改动的 `--force` 覆盖语义、§6 Phase 4 任务清单。

**Plan 3 reviewer 移交**:无(Plan 3 已自闭环 165 tests passing,无遗留 punch list)。

---

## Phase 0:本 plan 的范围与非范围

**做**:
1. 12 个 skill MIT 复制 + 命名空间从 `superpowers:` 改为 `forge:`、产物路径从 `docs/superpowers/specs|plans/` 改为 `forge/drafts|changes/<id>/`。
2. 6 个 `/forge:*` slash 命令模板原创编写(superpowers 没有等价物)。
3. `--force` flag 启用 SHA256 hash 比对,真接管"已被改/已存在"的覆盖判断。
4. `init.ts` / `update.ts` 用真模板替换 `'<!-- placeholder, Plan 4 will fill -->'`。
5. e2e brainstorming acceptance test(env-gated;无 `CLAUDE_BIN` 时 skip)。
6. 现有 init/update/end-to-end 测试中的 placeholder 断言改为真模板特征断言。

**不做**:
- skill eval 框架(Plan 5 范围)
- OpenCode adapter / plugin(v0.2)
- 多语言或本地化
- skill 文本的内容改写(仅改命名空间引用 + 产物路径,正文保持 MIT 原貌以保留原 superpowers 团队 tuning 的红旗清单 / 反模式表 / 流程图)

---

## File Structure(Plan 4 完成时新增/修改)

```
forge-repo/
├── package.json                            ← 修改:build 脚本前置 copy-templates.mjs
├── scripts/
│   └── copy-templates.mjs                  ← 新增:跨平台 .md → dist 复制
├── LICENSE-THIRD-PARTY.md                  ← 修改:补全 superpowers MIT attribution + 12 skill 来源
├── README.md                               ← 修改:Plan 4 进度段
├── docs/plans/
│   └── 2026-05-05-plan-4-templates.md      ← 新增:本 plan 文档
├── src/
│   ├── core/
│   │   ├── templates/
│   │   │   ├── index.ts                    ← 重写:聚合 registry,导出 loadAllSkills/loadAllCommands
│   │   │   ├── skills/
│   │   │   │   ├── index.ts                ← 新增:SKILL_NAMES 常量 + loadSkill loader
│   │   │   │   ├── using-forge.md          ← 新增(改自 superpowers using-superpowers)
│   │   │   │   ├── brainstorming.md        ← 新增
│   │   │   │   ├── writing-plans.md        ← 新增
│   │   │   │   ├── subagent-driven-development.md     ← 新增
│   │   │   │   ├── test-driven-development.md         ← 新增
│   │   │   │   ├── requesting-code-review.md          ← 新增
│   │   │   │   ├── receiving-code-review.md           ← 新增
│   │   │   │   ├── verification-before-completion.md  ← 新增
│   │   │   │   ├── systematic-debugging.md            ← 新增
│   │   │   │   ├── dispatching-parallel-agents.md     ← 新增
│   │   │   │   ├── using-git-worktrees.md             ← 新增
│   │   │   │   └── finishing-a-development-branch.md  ← 新增
│   │   │   └── commands/
│   │   │       ├── index.ts                ← 新增:COMMAND_NAMES + loadCommand loader
│   │   │       ├── brainstorm.md           ← 新增
│   │   │       ├── propose.md              ← 新增
│   │   │       ├── apply.md                ← 新增
│   │   │       ├── review.md               ← 新增
│   │   │       ├── verify.md               ← 新增
│   │   │       └── archive.md              ← 新增
│   │   ├── bootstrap/
│   │   │   └── index.ts                    ← 重写:导出 USING_FORGE_SKILL_NAME = 'using-forge' 常量
│   │   └── harness-adapters/
│   │       ├── hash-compare.ts             ← 新增:filterByHash() 纯函数
│   │       └── index.ts                    ← 修改:重新导出 filterByHash
│   └── cli/commands/
│       ├── init.ts                         ← 修改:用 loadAllSkills/Commands + filterByHash;--force 真生效
│       └── update.ts                       ← 修改:同上
└── tests/
    ├── core/templates/
    │   ├── skills.test.ts                  ← 新增:每个 skill 文件存在 + frontmatter name 匹配 + 不含残留命名空间
    │   ├── commands.test.ts                ← 新增:每个命令含核心 section
    │   └── registry.test.ts                ← 新增:loadAllSkills 返回 12 + loadAllCommands 返回 6
    ├── core/harness-adapters/
    │   └── hash-compare.test.ts            ← 新增:4 类 case(空/相同/改 force=false/改 force=true)
    └── cli/
        ├── init.test.ts                    ← 修改:placeholder 断言改为真模板特征
        ├── update.test.ts                  ← 修改:同上,加"用户改 + --force 才覆盖"路径
        ├── end-to-end.test.ts              ← 修改:断言 12 skill + 6 cmd 文件全部存在
        └── e2e-acceptance.test.ts          ← 新增:env-gated 真跑 claude CLI
```

---

## Phase A:基础设施(loader infra + LICENSE)

### Task A1:补全 LICENSE-THIRD-PARTY.md(superpowers attribution)

**Files:**
- Modify: `LICENSE-THIRD-PARTY.md`

- [ ] **Step 1:读现有 LICENSE-THIRD-PARTY.md 内容**

```bash
cat LICENSE-THIRD-PARTY.md
```

预期:文件存在(已被列入 `package.json` 的 `files` 数组),可能内容只是占位。如果完全为空或缺 superpowers 段,补齐。

- [ ] **Step 2:把以下完整内容写入 `LICENSE-THIRD-PARTY.md`(覆盖)**

````markdown
# Third-Party Licenses

Forge 包含来自以下开源项目的代码或文本(均为 MIT,允许复制再分发):

## superpowers (https://github.com/obra/superpowers) — MIT

Forge 的 `src/core/templates/skills/` 下 12 个 skill markdown 文本(下表)均改自 superpowers 仓库 `skills/<name>/SKILL.md`,做了 namespace 改名(`superpowers:` → `forge:`)和产物路径改写(`docs/superpowers/specs|plans/` → `forge/drafts|changes/<id>/`)。原文行文、红旗清单、反模式表、流程图保持原样以保留原作者 tuning。

| Forge 文件 | superpowers 源文件 |
|---|---|
| `using-forge.md` | `skills/using-superpowers/SKILL.md` |
| `brainstorming.md` | `skills/brainstorming/SKILL.md` |
| `writing-plans.md` | `skills/writing-plans/SKILL.md` |
| `subagent-driven-development.md` | `skills/subagent-driven-development/SKILL.md` |
| `test-driven-development.md` | `skills/test-driven-development/SKILL.md` |
| `requesting-code-review.md` | `skills/requesting-code-review/SKILL.md` |
| `receiving-code-review.md` | `skills/receiving-code-review/SKILL.md` |
| `verification-before-completion.md` | `skills/verification-before-completion/SKILL.md` |
| `systematic-debugging.md` | `skills/systematic-debugging/SKILL.md` |
| `dispatching-parallel-agents.md` | `skills/dispatching-parallel-agents/SKILL.md` |
| `using-git-worktrees.md` | `skills/using-git-worktrees/SKILL.md` |
| `finishing-a-development-branch.md` | `skills/finishing-a-development-branch/SKILL.md` |

```
MIT License

Copyright (c) 2025 Jesse Vincent and superpowers contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## OpenSpec (https://github.com/Fission-AI/OpenSpec) — MIT

Forge 的产物结构(proposal/specs/design/tasks)、归档机制、`forge/config.yaml` 配置注入设计借鉴自 OpenSpec。Forge 未直接复制 OpenSpec 代码,仅参考其设计模式,因此本节仅作设计致谢,无具体文件 attribution。
````

- [ ] **Step 3:验证文件可被 `pnpm pack` 包含**

```bash
pnpm pack --dry-run 2>&1 | grep LICENSE-THIRD-PARTY
```

预期:输出包含 `LICENSE-THIRD-PARTY.md`(因为 `package.json#files` 已含)。

- [ ] **Step 4:commit**

```bash
git add LICENSE-THIRD-PARTY.md
git commit -m "docs(license): 补全 superpowers MIT attribution + 12 skill 来源映射"
```

---

### Task A2:`scripts/copy-templates.mjs`(prebuild 跨平台拷贝)

**Files:**
- Create: `scripts/copy-templates.mjs`
- Modify: `package.json`

- [ ] **Step 1:写 `scripts/copy-templates.mjs`**

```javascript
#!/usr/bin/env node
// 把 src/core/templates/{skills,commands}/*.md 复制到 dist/ 对应位置
// tsc 不会复制非 TS 文件,因此构建时显式拷贝,确保运行时 readFile 能找到模板

import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const groups = [
  { src: 'src/core/templates/skills', dst: 'dist/core/templates/skills' },
  { src: 'src/core/templates/commands', dst: 'dist/core/templates/commands' },
];

for (const { src, dst } of groups) {
  const srcAbs = join(repoRoot, src);
  const dstAbs = join(repoRoot, dst);
  if (!existsSync(srcAbs)) {
    console.error(`✗ 模板源目录不存在:${srcAbs}`);
    process.exit(1);
  }
  await mkdir(dstAbs, { recursive: true });
  const entries = await readdir(srcAbs);
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    await copyFile(join(srcAbs, name), join(dstAbs, name));
  }
  console.log(`✓ copied ${entries.filter((n) => n.endsWith('.md')).length} files: ${src} → ${dst}`);
}
```

- [ ] **Step 2:在 `package.json` 修改 `scripts.build` 字段**

```json
"build": "node scripts/copy-templates.mjs && tsc -p tsconfig.json",
```

(原值 `"tsc -p tsconfig.json"` 改为上面)

- [ ] **Step 3:跑一次 `pnpm build` 验证**

```bash
pnpm build
ls dist/core/templates/skills/ dist/core/templates/commands/
```

预期:第一行打印 `✓ copied 0 files: src/core/templates/skills → dist/core/templates/skills`(因为 .md 文件还没建,后续 Task B/C 会陆续添加;copy 脚本不应报错)。`ls` 输出 `dist/core/templates/skills/` 和 `commands/` 都已被创建为空目录(或仅含 index.js)。

- [ ] **Step 4:commit**

```bash
git add scripts/copy-templates.mjs package.json
git commit -m "build: 加 prebuild copy-templates 脚本(.md → dist)"
```

---

### Task A3:`src/core/templates/skills/index.ts` loader

**Files:**
- Create: `src/core/templates/skills/index.ts`
- Test: `tests/core/templates/registry.test.ts`(本 task 只验 SKILL_NAMES;具体 loadSkill 在 Task B 测)

- [ ] **Step 1:写 `src/core/templates/skills/index.ts`**

```typescript
// 12 个 skill 真实文本的 registry — Plan 4
// 文件实体 .md 由 Task B 逐个填实

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 12 个移植 skill 名(spec §2.2 12 skill 表) */
export const SKILL_NAMES = [
  'using-forge',
  'brainstorming',
  'writing-plans',
  'subagent-driven-development',
  'test-driven-development',
  'requesting-code-review',
  'receiving-code-review',
  'verification-before-completion',
  'systematic-debugging',
  'dispatching-parallel-agents',
  'using-git-worktrees',
  'finishing-a-development-branch',
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

/** 单 skill 内容加载 — 用 import.meta.url 定位,开发与生产路径自适应 */
export async function loadSkill(name: SkillName): Promise<string> {
  return readFile(join(__dirname, `${name}.md`), 'utf8');
}

export interface LoadedSkill {
  name: SkillName;
  content: string;
}

/** 全量加载 12 个 skill,失败抛错(说明某个 .md 漏建) */
export async function loadAllSkills(): Promise<LoadedSkill[]> {
  return Promise.all(
    SKILL_NAMES.map(async (name) => ({ name, content: await loadSkill(name) })),
  );
}
```

- [ ] **Step 2:写 `tests/core/templates/registry.test.ts`(初版,只断言 SKILL_NAMES 长度)**

```typescript
// templates registry 测试 — SKILL_NAMES + COMMAND_NAMES 数量与拼写
import { describe, it, expect } from 'vitest';
import { SKILL_NAMES } from '../../../src/core/templates/skills/index.js';

describe('templates registry', () => {
  // 验证 spec §2.2 表里的 12 个 skill 全到位
  it('SKILL_NAMES 含 12 个不重复 skill', () => {
    expect(SKILL_NAMES).toHaveLength(12);
    expect(new Set(SKILL_NAMES).size).toBe(12);
  });

  // 验证关键 skill 名无拼写漂移(Plan 5 eval scenarios.yaml 文件名要对得上)
  it('SKILL_NAMES 含核心几个 skill 字面量', () => {
    expect(SKILL_NAMES).toContain('using-forge');
    expect(SKILL_NAMES).toContain('brainstorming');
    expect(SKILL_NAMES).toContain('writing-plans');
    expect(SKILL_NAMES).toContain('test-driven-development');
    expect(SKILL_NAMES).toContain('verification-before-completion');
  });
});
```

- [ ] **Step 3:跑测试验证它通过**

```bash
pnpm vitest run tests/core/templates/registry.test.ts
```

预期:2 tests passing(SKILL_NAMES 字面量已在 index.ts 写好,测试就绿)。

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/index.ts tests/core/templates/registry.test.ts
git commit -m "feat(templates): skills loader infra + SKILL_NAMES registry"
```

---

### Task A4:`src/core/templates/commands/index.ts` loader

**Files:**
- Create: `src/core/templates/commands/index.ts`
- Test: 复用 `tests/core/templates/registry.test.ts`(追加 COMMAND_NAMES 断言)

- [ ] **Step 1:写 `src/core/templates/commands/index.ts`**

```typescript
// 6 个 slash 命令模板的 registry — Plan 4
// 文件实体 .md 由 Task C 逐个填实

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 6 个 slash 命令名(spec §2.2 6 命令表;实际 slash 名为 /forge:<name>) */
export const COMMAND_NAMES = [
  'brainstorm',
  'propose',
  'apply',
  'review',
  'verify',
  'archive',
] as const;

export type CommandName = (typeof COMMAND_NAMES)[number];

export async function loadCommand(name: CommandName): Promise<string> {
  return readFile(join(__dirname, `${name}.md`), 'utf8');
}

export interface LoadedCommand {
  name: CommandName;
  content: string;
}

export async function loadAllCommands(): Promise<LoadedCommand[]> {
  return Promise.all(
    COMMAND_NAMES.map(async (name) => ({ name, content: await loadCommand(name) })),
  );
}
```

- [ ] **Step 2:在 `tests/core/templates/registry.test.ts` 追加 COMMAND_NAMES 断言**

在文件顶部加 import:
```typescript
import { COMMAND_NAMES } from '../../../src/core/templates/commands/index.js';
```

在 `describe('templates registry', ...)` 块内末尾追加:
```typescript
  it('COMMAND_NAMES 含 6 个不重复命令', () => {
    expect(COMMAND_NAMES).toHaveLength(6);
    expect(new Set(COMMAND_NAMES).size).toBe(6);
  });

  it('COMMAND_NAMES 含 spec §2.2 全部 6 个命令', () => {
    expect(COMMAND_NAMES).toEqual([
      'brainstorm',
      'propose',
      'apply',
      'review',
      'verify',
      'archive',
    ]);
  });
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/templates/registry.test.ts
```

预期:4 tests passing(SKILL_NAMES 2 个 + COMMAND_NAMES 2 个)。

- [ ] **Step 4:commit**

```bash
git add src/core/templates/commands/index.ts tests/core/templates/registry.test.ts
git commit -m "feat(templates): commands loader infra + COMMAND_NAMES registry"
```

---

### Task A5:重写 `src/core/templates/index.ts` 聚合 registry

**Files:**
- Modify: `src/core/templates/index.ts`(覆盖原占位)

- [ ] **Step 1:覆盖 `src/core/templates/index.ts`**

```typescript
// templates 模块顶层导出 — Plan 4
// 把 skills + commands 两个 sub-registry 聚合成单一入口

export {
  SKILL_NAMES,
  loadSkill,
  loadAllSkills,
  type SkillName,
  type LoadedSkill,
} from './skills/index.js';

export {
  COMMAND_NAMES,
  loadCommand,
  loadAllCommands,
  type CommandName,
  type LoadedCommand,
} from './commands/index.js';
```

- [ ] **Step 2:typecheck 验证导出没问题**

```bash
pnpm typecheck
```

预期:0 errors。

- [ ] **Step 3:commit**

```bash
git add src/core/templates/index.ts
git commit -m "feat(templates): 聚合 skills + commands sub-registry 到顶层 index"
```

---

## Phase B:12 个 skill 真实文本移植

> **通用移植规则**(每个 Task 套用一致):
> 1. `cp /d/ClaudeProject/opsp/superpowers/skills/<src-name>/SKILL.md src/core/templates/skills/<dst-name>.md`
> 2. **Frontmatter `name:`** 字段改为 `forge:<dst-name>`(原值通常是 `<src-name>`,无前缀)
> 3. **Frontmatter `description:`** 保留;若原文出现 superpowers 命名空间(如 "superpowers:writing-plans")在描述中,改为 "forge:writing-plans"
> 4. **正文中所有 `superpowers:<x>`** → `forge:<x>`(若 `<x>` 不在 12 个 forge skill 内,见下方"残余引用处理"表)
> 5. **正文中所有 `docs/superpowers/specs/...`** → `forge/drafts/...`(brainstorming 的 design doc 路径);**`docs/superpowers/plans/...`** → `forge/changes/<id>/`(writing-plans 的 plan doc 路径,具体路径见 Task B3)
> 6. **正文中 superpowers 项目名引用** 一般保留(如 "superpowers/CLAUDE.md")—— 这些是项目自我指代,改为 "forge/AGENTS.md" 反而失真;只改面向 AI 行为指令的 namespace 引用
> 7. **支持文件**(如 brainstorming/visual-companion.md):本 plan 不移植,删除 SKILL.md 中对支持文件的引用并加注 "(visual companion 在 forge v0.1 不提供)"

> **残余引用处理表**(superpowers 中存在但 forge 12 个不含的 skill 引用替换):
> | superpowers 引用 | forge 替换 |
> |---|---|
> | `superpowers:executing-plans` | `forge:subagent-driven-development`(forge 用 subagent 模式而非 inline;无 inline 模式) |
> | `superpowers:writing-skills` | 删除引用并加注 "(writing-skills 在 forge v0.1 不提供;v0.2 考虑)" |
> | `elements-of-style:writing-clearly-and-concisely` | 删除整段提示(forge 不依赖该 plugin) |

### Task B1:移植 `using-forge`(bootstrap)

**Files:**
- Create: `src/core/templates/skills/using-forge.md`
- Test: `tests/core/templates/skills.test.ts`(本 task 创建,后续 B2-B12 各自追加 case)

- [ ] **Step 1:复制源文件并重命名**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/using-superpowers/SKILL.md \
   src/core/templates/skills/using-forge.md
```

- [ ] **Step 2:用编辑器(或 sed)做以下精确替换**

打开 `src/core/templates/skills/using-forge.md`:

1. Frontmatter 改:
   ```yaml
   ---
   name: forge:using-forge
   description: Use when starting any conversation - establishes how to find and use forge skills, requiring Skill tool invocation before ANY response including clarifying questions
   ---
   ```
2. 正文中(原 superpowers using-superpowers SKILL.md 主体):
   - 把所有 "superpowers" 字面量(独立词)替换成 "forge"(整词替换,避免改到 SKILL 名)
   - 把所有 "superpowers:<x>" 命名空间引用替换为 "forge:<x>"
   - 删除"How to Access Skills"段落里的 "Copilot CLI" / "Gemini CLI" 子段(forge v0.1 只支 Claude Code + Codex);保留 Claude Code 段
   - 删除"Platform Adaptation"整段(forge v0.1 不做平台适配文档)
3. 在文件末尾追加 forge 专属 6 命令清单(spec §2.2):

   ````markdown

   ## forge slash commands(本 bootstrap 携带的 6 个工作流入口)

   触发以下任一命令时,会自动调起对应 skill 链:

   | 命令 | 用途 | 调起 skill |
   |---|---|---|
   | `/forge:brainstorm <topic>` | 模糊想法 → forge/drafts/<date>-<topic>.md | forge:brainstorming |
   | `/forge:propose <change-id> [--from-draft <name>]` | draft → 4 个 change 产物 | forge:writing-plans |
   | `/forge:apply [--parallel]` | tasks.md → 实施 | forge:subagent-driven-development + forge:test-driven-development(--parallel 加 forge:dispatching-parallel-agents + forge:using-git-worktrees) |
   | `/forge:review` | 派 review subagent + 收反馈 | forge:requesting-code-review + forge:receiving-code-review |
   | `/forge:verify` | 跑 forge validate + 写 verify-passed YAML | forge:verification-before-completion |
   | `/forge:archive` | 归档 change 到 forge/changes/archive/ | (CLI `forge archive`,无 skill 链) |

   ## forge 红旗清单(覆盖 superpowers 红旗清单的 forge 专属补充)

   除了 superpowers 通用红旗,forge 多一条:

   | 想法 | 现实 |
   |---|---|
   | "用户需求看起来很清晰,直接写 propose 吧" | 用户原话有 "大概 / 也许 / 不太确定 / 看着办" 任一关键词 → 必须先 `/forge:brainstorm`,不允许直接 `/forge:propose` |
   ````

- [ ] **Step 3:写 `tests/core/templates/skills.test.ts`(skill 通用断言框架)**

```typescript
// 12 个 skill markdown 文件的通用结构断言
// 每个 task B# 给本文件追加自己的 it('skill X ...') case
import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { loadSkill, SKILL_NAMES } from '../../../src/core/templates/skills/index.js';

describe('templates/skills', () => {
  // 通用断言:所有 12 skill frontmatter 必须含 forge:<name> 形式的 name 字段
  it.each(SKILL_NAMES)('%s 有合法 frontmatter 且 name 为 forge:<name>', async (name) => {
    const content = await loadSkill(name);
    const parsed = matter(content);
    expect(parsed.data.name).toBe(`forge:${name}`);
    expect(parsed.data.description).toBeTruthy();
    // 正文非空
    expect(parsed.content.trim().length).toBeGreaterThan(100);
  });

  // 通用断言:所有 skill 不含未替换的 superpowers 命名空间引用
  // (superpowers 项目名作为致谢出现是允许的,只查 superpowers:<word> 形式)
  it.each(SKILL_NAMES)('%s 不含残留 superpowers:<x> 命名空间引用', async (name) => {
    const content = await loadSkill(name);
    expect(content).not.toMatch(/superpowers:[a-z][a-z0-9-]*/);
  });

  // 通用断言:不含未替换的 docs/superpowers/specs 或 docs/superpowers/plans 路径
  it.each(SKILL_NAMES)('%s 不含残留 docs/superpowers/(specs|plans) 路径', async (name) => {
    const content = await loadSkill(name);
    expect(content).not.toMatch(/docs\/superpowers\/(specs|plans)/);
  });

  // using-forge 专属:必须含 6 个 forge slash 命令清单
  it('using-forge 含 6 个 /forge:* 命令清单', async () => {
    const content = await loadSkill('using-forge');
    expect(content).toContain('/forge:brainstorm');
    expect(content).toContain('/forge:propose');
    expect(content).toContain('/forge:apply');
    expect(content).toContain('/forge:review');
    expect(content).toContain('/forge:verify');
    expect(content).toContain('/forge:archive');
  });
});
```

- [ ] **Step 4:跑测试**

```bash
pnpm vitest run tests/core/templates/skills.test.ts
```

预期:**部分 fail**(只有 using-forge 那个 skill 的 4 个相关 case 通过;另 11 个 skill 的 3 个通用 case × 11 = 33 个 fail,因为对应 .md 文件还不存在)。这是预期的红状态,Task B2-B12 会陆续转绿。

如果 using-forge 那 4 个 case 没全过,根据具体报错回 Step 2 修正(常见:漏改 superpowers:<x> 引用)。

- [ ] **Step 5:commit**

```bash
git add src/core/templates/skills/using-forge.md tests/core/templates/skills.test.ts
git commit -m "feat(templates): 移植 using-forge skill(改自 using-superpowers)"
```

---

### Task B2:移植 `brainstorming`

**Files:**
- Create: `src/core/templates/skills/brainstorming.md`

- [ ] **Step 1:复制源文件**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/brainstorming/SKILL.md \
   src/core/templates/skills/brainstorming.md
```

- [ ] **Step 2:精确替换**

打开 `src/core/templates/skills/brainstorming.md`:

1. Frontmatter:
   ```yaml
   ---
   name: forge:brainstorming
   description: You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation.
   ---
   ```
2. 正文 checklist 第 6 条:
   - 原文:`Write design doc — save to \`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md\` and commit`
   - 改成:`Write draft — save to \`forge/drafts/YYYY-MM-DD-<topic>.md\` and commit. Do NOT save to forge/specs/(specs/ 仅由 archive 内部 sync 写入,见 spec §3.4).`
3. "After the Design"段:
   - 原文:`Write the validated design (spec) to \`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md\``
   - 改成:`Write the validated draft to \`forge/drafts/YYYY-MM-DD-<topic>.md\``
   - 删除整段 `Use elements-of-style:writing-clearly-and-concisely skill if available`
4. "Implementation"段:
   - 原文:`Invoke the writing-plans skill to create a detailed implementation plan`
   - 改成:`Invoke the forge:writing-plans skill via /forge:propose <change-id> --from-draft <date>-<topic> to create the change proposal + implementation plan. Do NOT invoke any other skill.`
5. "Visual Companion"段(整段):
   - **删除整段**(brainstorming 段标题 "## Visual Companion" 到文件末尾)
   - 替换成单行注释:`<!-- Visual companion 在 forge v0.1 不提供,brainstorming 全程在终端做。 -->`

- [ ] **Step 3:跑通用断言**

```bash
pnpm vitest run tests/core/templates/skills.test.ts -t brainstorming
```

预期:`brainstorming` 相关的 3 个通用 case 全过。如有 fail,根据报错回 Step 2 修正。

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/brainstorming.md
git commit -m "feat(templates): 移植 brainstorming skill(forge/drafts/ 路径)"
```

---

### Task B3:移植 `writing-plans`

**Files:**
- Create: `src/core/templates/skills/writing-plans.md`

- [ ] **Step 1:复制源文件**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/writing-plans/SKILL.md \
   src/core/templates/skills/writing-plans.md
```

- [ ] **Step 2:精确替换**

1. Frontmatter:
   ```yaml
   ---
   name: forge:writing-plans
   description: Use when you have a spec or requirements for a multi-step task, before touching code
   ---
   ```
2. "Save plans to:" 行:
   - 原文:`docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
   - 改成:`forge/changes/<change-id>/tasks.md`(同时改正下方说明:"forge 把 plan 直接落到 change 的 tasks.md;design.md 与 specs/ 由 propose 模板另行生成")
3. "Plan Document Header" 中模板:
   - 原文 `Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans`
   - 改成 `Use forge:subagent-driven-development to implement this plan task-by-task. (forge v0.1 不提供 inline executing 模式,统一用 subagent 派发)`
4. "Execution Handoff" 段:
   - 原文 superpowers:subagent-driven-development / executing-plans 引用 → 改成 forge:subagent-driven-development(删除 inline 选项,只留 subagent-driven 一种)
   - "Two execution options" → "Single execution option:Subagent-Driven"

- [ ] **Step 3:跑通用断言**

```bash
pnpm vitest run tests/core/templates/skills.test.ts -t writing-plans
```

预期:绿。

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/writing-plans.md
git commit -m "feat(templates): 移植 writing-plans skill(forge/changes/<id>/tasks.md)"
```

---

### Task B4:移植 `subagent-driven-development`

**Files:**
- Create: `src/core/templates/skills/subagent-driven-development.md`

- [ ] **Step 1:复制并改 frontmatter**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/subagent-driven-development/SKILL.md \
   src/core/templates/skills/subagent-driven-development.md
```

Frontmatter 改:
```yaml
---
name: forge:subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---
```

- [ ] **Step 2:做命名空间替换(整词替换)**

- 全部 `superpowers:test-driven-development` → `forge:test-driven-development`
- 全部 `superpowers:requesting-code-review` → `forge:requesting-code-review`
- 全部 `superpowers:writing-plans` → `forge:writing-plans`
- 全部 `superpowers:executing-plans` → `forge:subagent-driven-development`(forge 无 inline 模式,合并到本 skill;若上下文不通,改为删除该引用并加注 "forge 统一用 subagent 派发")
- 全部其他 `superpowers:<x>` → `forge:<x>`(若 `<x>` 在 12 个 forge skill 内)或删除引用(不在内的)
- `docs/superpowers/plans/...` → `forge/changes/<change-id>/tasks.md`

- [ ] **Step 3:跑通用断言**

```bash
pnpm vitest run tests/core/templates/skills.test.ts -t subagent-driven-development
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/subagent-driven-development.md
git commit -m "feat(templates): 移植 subagent-driven-development skill"
```

---

### Task B5:移植 `test-driven-development`

**Files:**
- Create: `src/core/templates/skills/test-driven-development.md`

- [ ] **Step 1:复制 + 改 frontmatter**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/test-driven-development/SKILL.md \
   src/core/templates/skills/test-driven-development.md
```

```yaml
---
name: forge:test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---
```

- [ ] **Step 2:命名空间替换**

- 全部 `superpowers:<x>` → `forge:<x>`(`<x>` 在 12 内则替换;不在内则删除该段引用)
- 全部 `docs/superpowers/(specs|plans)/...` → 对应 `forge/changes/<change-id>/(specs|tasks).md`

- [ ] **Step 3:跑通用断言**

```bash
pnpm vitest run tests/core/templates/skills.test.ts -t test-driven-development
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/test-driven-development.md
git commit -m "feat(templates): 移植 test-driven-development skill"
```

---

### Task B6:移植 `requesting-code-review`

**Files:**
- Create: `src/core/templates/skills/requesting-code-review.md`

- [ ] **Step 1:复制 + 改 frontmatter**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/requesting-code-review/SKILL.md \
   src/core/templates/skills/requesting-code-review.md
```

```yaml
---
name: forge:requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---
```

- [ ] **Step 2:命名空间替换**

- 所有 `superpowers:<x>` → `forge:<x>`(in-12)或删除引用(out-of-12)
- 所有 `docs/superpowers/...` → 对应 `forge/changes/<change-id>/...`
- 若提到"package the [proposal + specs + design + diff]"等 superpowers 默认产物路径,改为 forge 实际路径(`forge/changes/<change-id>/{proposal,specs,design}.md` + `git diff`)

- [ ] **Step 3:跑通用断言**

```bash
pnpm vitest run tests/core/templates/skills.test.ts -t requesting-code-review
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/requesting-code-review.md
git commit -m "feat(templates): 移植 requesting-code-review skill"
```

---

### Task B7:移植 `receiving-code-review`

**Files:**
- Create: `src/core/templates/skills/receiving-code-review.md`

- [ ] **Step 1:复制 + 改 frontmatter**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/receiving-code-review/SKILL.md \
   src/core/templates/skills/receiving-code-review.md
```

```yaml
---
name: forge:receiving-code-review
description: Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
---
```

- [ ] **Step 2:命名空间替换**

同 B6 规则。特别地:把"接受意见 → append to TODO" 的描述改为 forge 实际行为"接受意见 → append 到 `forge/changes/<change-id>/tasks.md` 末尾作为新 task 条目"。

- [ ] **Step 3:跑通用断言**

```bash
pnpm vitest run tests/core/templates/skills.test.ts -t receiving-code-review
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/receiving-code-review.md
git commit -m "feat(templates): 移植 receiving-code-review skill"
```

---

### Task B8:移植 `verification-before-completion`

**Files:**
- Create: `src/core/templates/skills/verification-before-completion.md`

- [ ] **Step 1:复制 + 改 frontmatter**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/verification-before-completion/SKILL.md \
   src/core/templates/skills/verification-before-completion.md
```

```yaml
---
name: forge:verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
---
```

- [ ] **Step 2:命名空间替换 + forge 行为补充**

- 标准 superpowers:<x> → forge:<x> 替换
- 在 "Evidence" 段加注:"forge:verify 命令模板会把证据 log 写到 `forge/changes/<change-id>/.evidence/<task-id>.log`,SHA256 由 `.verify-passed` YAML 的 `evidence[i].log_hash` 字段绑定(spec §3.4)"

- [ ] **Step 3:跑通用断言**

```bash
pnpm vitest run tests/core/templates/skills.test.ts -t verification-before-completion
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/verification-before-completion.md
git commit -m "feat(templates): 移植 verification-before-completion skill"
```

---

### Task B9:移植 `systematic-debugging`

**Files:**
- Create: `src/core/templates/skills/systematic-debugging.md`

- [ ] **Step 1:复制 + 改 frontmatter**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/systematic-debugging/SKILL.md \
   src/core/templates/skills/systematic-debugging.md
```

```yaml
---
name: forge:systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
---
```

- [ ] **Step 2:命名空间替换**

标准规则。systematic-debugging 不强依赖 forge 产物路径,仅做 superpowers:<x> → forge:<x> 即可。

- [ ] **Step 3:跑通用断言**

```bash
pnpm vitest run tests/core/templates/skills.test.ts -t systematic-debugging
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/systematic-debugging.md
git commit -m "feat(templates): 移植 systematic-debugging skill"
```

---

### Task B10:移植 `dispatching-parallel-agents`

**Files:**
- Create: `src/core/templates/skills/dispatching-parallel-agents.md`

- [ ] **Step 1:复制 + 改 frontmatter**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/dispatching-parallel-agents/SKILL.md \
   src/core/templates/skills/dispatching-parallel-agents.md
```

```yaml
---
name: forge:dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
---
```

- [ ] **Step 2:命名空间替换 + forge cherry-pick 协议补充**

- 标准 superpowers:<x> → forge:<x>(配套引用 forge:using-git-worktrees + forge:subagent-driven-development)
- 在文件末尾加 forge 专属"Cherry-pick 串行协议"段(摘自 spec §3.1 T3):
  ````markdown

  ## forge --parallel 模式 cherry-pick 串行协议(必须遵守)

  **代码合并必须严格串行**(违反将导致 worktree 间冲突未捕获):

  1. 每个子代理在自己的 worktree 跑 TDD 并 commit
  2. 子代理交付后,主代理在主工作区 cherry-pick 该 worktree 的 commit(**一次只 cherry-pick 一个 worktree**)
  3. 成功 → 销毁 worktree + 进入 tasks.md 写入步骤
  4. cherry-pick 冲突 → 立即跑 `git cherry-pick --abort` 清理主工作区(必须先恢复主工作区干净);abort 失败 → 进入人工恢复(打印 cherry-pick 临时状态路径,退出码 3)。abort 成功 → 销毁 worktree + 失败该 task + append 一条 `merge-conflict-fix-N` 修复任务

  **tasks.md 写入(主代理单点串行)**:

  - worktree 内 tasks.md 是只读快照,子代理不写
  - 主代理在主工作区原子地把 `[ ]` 改 `[x]`
  - failure task append 仅由主代理在主工作区执行
  - 同一时间只有一个 cherry-pick + tasks.md 写在跑
  ````

- [ ] **Step 3:跑通用断言**

```bash
pnpm vitest run tests/core/templates/skills.test.ts -t dispatching-parallel-agents
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/dispatching-parallel-agents.md
git commit -m "feat(templates): 移植 dispatching-parallel-agents skill + cherry-pick 串行协议"
```

---

### Task B11:移植 `using-git-worktrees`

**Files:**
- Create: `src/core/templates/skills/using-git-worktrees.md`

- [ ] **Step 1:复制 + 改 frontmatter**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/using-git-worktrees/SKILL.md \
   src/core/templates/skills/using-git-worktrees.md
```

```yaml
---
name: forge:using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback
---
```

- [ ] **Step 2:命名空间替换**

- 标准规则
- 在 worktree 命名规范段补充:"forge --parallel 默认 worktree 名 `forge-<change-id>-<task-id>`,放在 `.git/forge-worktrees/` 下,与 forge change 一一对应"

- [ ] **Step 3:跑通用断言**

```bash
pnpm vitest run tests/core/templates/skills.test.ts -t using-git-worktrees
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/using-git-worktrees.md
git commit -m "feat(templates): 移植 using-git-worktrees skill"
```

---

### Task B12:移植 `finishing-a-development-branch`

**Files:**
- Create: `src/core/templates/skills/finishing-a-development-branch.md`

- [ ] **Step 1:复制 + 改 frontmatter**

```bash
cp /d/ClaudeProject/opsp/superpowers/skills/finishing-a-development-branch/SKILL.md \
   src/core/templates/skills/finishing-a-development-branch.md
```

```yaml
---
name: forge:finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
---
```

- [ ] **Step 2:命名空间替换 + forge archive 衔接**

- 标准规则
- 在 "After implementation" 段加注:"forge 路径下,这一步发生在 `/forge:archive` 之后(archive 已做产物归档),本 skill 仅引导用户决定 git 层面的合并/PR/清理策略"

- [ ] **Step 3:跑全部 12 skill 通用断言(B 阶段总验)**

```bash
pnpm vitest run tests/core/templates/skills.test.ts
```

预期:全 36 个通用 case + 1 个 using-forge 专属 case = **37 tests passing**(12 skills × 3 通用 + 1 = 37)。如任何 case fail,回到对应 skill 的 Task 修正。

- [ ] **Step 4:commit**

```bash
git add src/core/templates/skills/finishing-a-development-branch.md
git commit -m "feat(templates): 移植 finishing-a-development-branch skill(完成 12 skill 移植)"
```

---

## Phase C:6 个 slash 命令模板(原创)

> **slash 命令模板规范**:每个 .md 文件采用 Claude Code commands 标准格式(frontmatter + 正文 prompt)。Frontmatter 至少含 `description`(给用户看的命令说明)和可选的 `argument-hint`(命令参数提示)。正文用第二人称指令告诉 AI 怎么走该命令的工作流。

### Task C1:`/forge:brainstorm` 命令模板

**Files:**
- Create: `src/core/templates/commands/brainstorm.md`
- Test: `tests/core/templates/commands.test.ts`(本 task 创建)

- [ ] **Step 1:写 `src/core/templates/commands/brainstorm.md`**

````markdown
---
description: 把模糊想法转化为 forge/drafts/ 下的结构化 draft,通过强制提问 + 设计探讨完成
argument-hint: "<topic>"
---

You are about to handle a `/forge:brainstorm <topic>` invocation. The user typed:

```
/forge:brainstorm $ARGUMENTS
```

Follow these steps strictly. Do NOT skip any:

1. **必须先调用 `forge:brainstorming` skill**(用 Skill 工具,skill 名 `forge:brainstorming`)。该 skill 强制提问 / 不允许直接给方案 / 不允许写代码。
2. 完成 skill 内的全部 checklist(包括"探索项目上下文"、"逐个澄清问题"、"提 2-3 方案"、"分段呈现 design")。
3. 确认 design 通过用户审阅后,把 draft **保存到 `forge/drafts/<YYYY-MM-DD>-<topic>.md`**(date 用今天,topic 来自用户参数,小写连字符化)。
4. 若 `forge/drafts/` 目录不存在,先 `mkdir -p forge/drafts/`。
5. 写完后,提示用户:"draft 保存到 `forge/drafts/<file>`,确认要推进就跑 `/forge:propose <change-id> --from-draft <date>-<topic>`"。

**禁止行为**:
- 不允许直接产出 `forge/changes/<id>/` 任何文件(那是 `/forge:propose` 的工作)
- 不允许跳过 `forge:brainstorming` skill 的提问环节,即使用户表示"我已经想清楚了"
- 不允许在 `forge/specs/` 里写任何东西(specs/ 仅由 archive 内部 sync 写入)
````

- [ ] **Step 2:写 `tests/core/templates/commands.test.ts`(命令通用断言框架)**

```typescript
// 6 个 slash 命令模板的通用结构断言
import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { loadCommand, COMMAND_NAMES } from '../../../src/core/templates/commands/index.js';

describe('templates/commands', () => {
  it.each(COMMAND_NAMES)('%s 有合法 frontmatter 含 description', async (name) => {
    const content = await loadCommand(name);
    const parsed = matter(content);
    expect(parsed.data.description).toBeTruthy();
    expect(typeof parsed.data.description).toBe('string');
    expect(parsed.content.trim().length).toBeGreaterThan(50);
  });

  it.each(COMMAND_NAMES)('%s 不含残留 superpowers:<x> 引用', async (name) => {
    const content = await loadCommand(name);
    expect(content).not.toMatch(/superpowers:[a-z][a-z0-9-]*/);
  });

  it('brainstorm 命令引用 forge:brainstorming skill 且写到 forge/drafts/', async () => {
    const content = await loadCommand('brainstorm');
    expect(content).toContain('forge:brainstorming');
    expect(content).toContain('forge/drafts/');
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/templates/commands.test.ts -t brainstorm
```

预期:`brainstorm` 相关 3 个 case 通过(1 个 it.each 用例 + 1 个 superpowers 检查 + 1 个 brainstorm 专属)。其他 5 个命令的对应 case 现在 fail,Task C2-C6 转绿。

- [ ] **Step 4:commit**

```bash
git add src/core/templates/commands/brainstorm.md tests/core/templates/commands.test.ts
git commit -m "feat(templates): /forge:brainstorm 命令模板"
```

---

### Task C2:`/forge:propose` 命令模板

**Files:**
- Create: `src/core/templates/commands/propose.md`

- [ ] **Step 1:写 `src/core/templates/commands/propose.md`**

````markdown
---
description: 把 draft(可选)转化为 forge/changes/<id>/ 下的 4 件套(proposal + specs + design + tasks)
argument-hint: "<change-id> [--from-draft <date-topic>]"
---

You are about to handle `/forge:propose $ARGUMENTS`.

解析参数:第一个 token 是 `<change-id>`(slug,小写连字符);可选 `--from-draft <date-topic>` 指定要消费的 draft 文件(对应 `forge/drafts/<date-topic>.md`)。

## 步骤(必须按序)

1. **若提供了 `--from-draft <name>`**:
   - 读 `forge/drafts/<name>.md`(若不存在,**报错并停止**:"draft 不存在: forge/drafts/<name>.md。可用 draft: " + 列出 `forge/drafts/*.md`)
   - 把 draft 内容作为后续 writing 的输入上下文
2. **读 `forge/config.yaml`** 提取 `context`(tech stack)和 `rules.{proposal,specs,design,tasks}`,把这些作为系统提示注入后续 skill。
3. **必须调用 `forge:writing-plans` skill** 来产出 tasks。
4. 产出文件到 `forge/changes/<change-id>/`(如目录已存在且非空,**报错并停止**:"change 已存在: forge/changes/<change-id>/。请改 change-id 或删除已有目录"):
   - `proposal.md` — H1 标题 + Why + What + Scope + Out of scope
   - `specs/<sub-area>.md` — 每个改动域一个文件,Given/When/Then 三段格式(spec deltas)
   - `design.md` — H1 标题 + 技术方案 + 数据模型 + 接口设计(可短,但 H1 必须有)
   - `tasks.md` — checkbox 任务列表,粒度 2-5 分钟一步,采用 forge:writing-plans skill 的 task 结构
5. **若有 `--from-draft`**:把 draft 移到 `forge/drafts/.consumed/<name>.md`(filesystem chmod 444 只读)。
6. 跑 `forge validate <change-id>` 确认 4 件套完整。**若 validate 失败,根据错误回去补,不要把不完整产物留下**。

## 禁止行为

- 不允许跳过 `forge:writing-plans` skill 直接写 tasks.md(skill 内置 self-review,跳过会漏 placeholder 检查)
- 不允许把任何东西写到 `forge/specs/`(那是 archive 内部 sync 的输出)
- 不允许在 `forge/changes/<id>/` 之外创建产物文件
````

- [ ] **Step 2:在 `commands.test.ts` 加 propose 专属断言**

```typescript
  it('propose 命令引用 forge:writing-plans skill 且写到 forge/changes/', async () => {
    const content = await loadCommand('propose');
    expect(content).toContain('forge:writing-plans');
    expect(content).toContain('forge/changes/');
    expect(content).toContain('proposal.md');
    expect(content).toContain('tasks.md');
  });
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/templates/commands.test.ts -t propose
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/commands/propose.md tests/core/templates/commands.test.ts
git commit -m "feat(templates): /forge:propose 命令模板"
```

---

### Task C3:`/forge:apply` 命令模板

**Files:**
- Create: `src/core/templates/commands/apply.md`

- [ ] **Step 1:写 `src/core/templates/commands/apply.md`**

````markdown
---
description: 读 tasks.md 派子代理实施每个 task,顺序模式或 --parallel 模式
argument-hint: "[--parallel] [--change-id <id>]"
---

You are about to handle `/forge:apply $ARGUMENTS`.

解析:
- 默认:顺序模式(主工作区直接跑)
- `--parallel`:并行模式(每个独立 task 一个 worktree;遵循 forge:dispatching-parallel-agents 的 cherry-pick 串行协议)
- `--change-id <id>`:指定 change(默认为 `forge/changes/` 下唯一未归档的 change;若 >1,**报错并停止**列出选项)

## 步骤

1. **必须调用 `forge:subagent-driven-development` skill**(无 inline 模式)。
2. **必须调用 `forge:test-driven-development` skill** 作为每个 subagent 的实施纲领。
3. 若 `--parallel`,**追加调用 `forge:dispatching-parallel-agents` 和 `forge:using-git-worktrees`**。
4. 读 `forge/changes/<id>/tasks.md`,识别未勾选 tasks。
5. **顺序模式**:
   - for each task:派 fresh subagent(主工作区),subagent 拿 [task + 相关 specs/<sub-area>.md + design.md] 启动
   - subagent 跑 TDD:red → green → refactor + git commit
   - 主代理 review subagent 的 commit + test 日志,通过则在主工作区 tasks.md 把 `[ ]` 改 `[x]`
6. **--parallel 模式**:严格遵守 cherry-pick 串行协议(详 forge:dispatching-parallel-agents skill 的"forge --parallel 模式 cherry-pick 串行协议"段)
7. 全部 task 完成后,在 tasks.md 末尾追加(parallel 多 commit 用列表):
   ```yaml
   applied_commits:
     - <task-id-1>: <commit-hash>
     - <task-id-2>: <commit-hash>
   final_head: <git rev-parse HEAD>
   ```

## 禁止行为

- 不允许主代理直接写代码 — 所有 task 实施必须通过 subagent
- 不允许 subagent 改 tasks.md(写入是主代理单点串行职责)
- 不允许跳过 TDD 的 red 步骤(verify 阶段会发现并 append 修复 task)
````

- [ ] **Step 2:加 apply 专属断言**

```typescript
  it('apply 命令引用 forge:subagent-driven-development + forge:test-driven-development', async () => {
    const content = await loadCommand('apply');
    expect(content).toContain('forge:subagent-driven-development');
    expect(content).toContain('forge:test-driven-development');
    expect(content).toContain('--parallel');
    expect(content).toContain('forge:dispatching-parallel-agents');
    expect(content).toContain('forge:using-git-worktrees');
    expect(content).toContain('applied_commits');
  });
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/templates/commands.test.ts -t apply
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/commands/apply.md tests/core/templates/commands.test.ts
git commit -m "feat(templates): /forge:apply 命令模板(顺序 + parallel)"
```

---

### Task C4:`/forge:review` 命令模板

**Files:**
- Create: `src/core/templates/commands/review.md`

- [ ] **Step 1:写 `src/core/templates/commands/review.md`**

````markdown
---
description: 派 review subagent 审 [proposal + specs + design + diff],主代理处理反馈,满足三条件打 review-passed YAML
argument-hint: "[--change-id <id>]"
---

You are about to handle `/forge:review $ARGUMENTS`.

解析:`--change-id <id>` 默认 `forge/changes/` 下唯一未归档 change。

## 步骤

1. **必须调用 `forge:requesting-code-review` skill**(主轨)。
2. **必须调用 `forge:receiving-code-review` skill**(收反馈环节)。
3. 打包 review 输入:
   - `forge/changes/<id>/proposal.md`
   - `forge/changes/<id>/specs/*.md`
   - `forge/changes/<id>/design.md`
   - `git diff <since-tasks-start>..HEAD`(`since-tasks-start` 取 tasks.md 末尾 `applied_commits` 的第一个 commit 的 parent)
4. 派 fresh review subagent,产出意见列表(每条带:[严重度:阻塞/关键/可改进/建议]、[文件路径]、[问题描述]、[期望修改])。
5. 主代理对每条意见 **逐条判断接受/拒绝**(参考 forge:receiving-code-review skill 的"用证据反驳"原则,不机械接受)。
6. 接受的意见 → append 到 `forge/changes/<id>/tasks.md` 末尾作为新 task 条目。
7. **仅当满足三条件,才打 `forge/changes/<id>/.review-passed`**:
   a. 无"已用证据反驳但未存档"的拒绝意见
   b. 接受的意见已**全部实现 + 测试通过**(本轮新接受的意见**不算本轮通过**,需下一轮 review)
   c. 满足 a+b 时,本轮 review 无新增 task
8. `.review-passed` YAML schema(spec §3.4):
   ```yaml
   schema: forge-review/v1
   tasks_hash: <sha256(tasks.md 已勾段)>
   content_hash: <sha256(proposal+specs+design)>
   reviewed_by: ai-agent  # 或 human-override(需 archive --force)
   git:
     is_git_repo: true
     head: <git rev-parse HEAD>
     diff_hash: <sha256(git diff against forge/config.yaml code_paths)>
   review_outcomes:
     - id: 1
       severity: blocking
       accepted: true
       resolved: true
       resolution_commit: <hash>
   ```

## 禁止行为

- 不允许跳过 review subagent 直接打 review-passed
- 不允许接受意见但不实现就打 review-passed(违反 b)
- 非 git 项目跳过 git 字段时,review-passed YAML 必须 `is_git_repo: false`(archive --force 才接受)
````

- [ ] **Step 2:加 review 专属断言**

```typescript
  it('review 命令引用 forge:requesting-code-review + forge:receiving-code-review', async () => {
    const content = await loadCommand('review');
    expect(content).toContain('forge:requesting-code-review');
    expect(content).toContain('forge:receiving-code-review');
    expect(content).toContain('.review-passed');
    expect(content).toContain('forge-review/v1');
    expect(content).toContain('review_outcomes');
  });
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/templates/commands.test.ts -t review
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/commands/review.md tests/core/templates/commands.test.ts
git commit -m "feat(templates): /forge:review 命令模板"
```

---

### Task C5:`/forge:verify` 命令模板

**Files:**
- Create: `src/core/templates/commands/verify.md`

- [ ] **Step 1:写 `src/core/templates/commands/verify.md`**

````markdown
---
description: 跑 forge validate + verification-before-completion;失败时自动 append fake_completions 到 tasks.md
argument-hint: "[--change-id <id>]"
---

You are about to handle `/forge:verify $ARGUMENTS`.

## 步骤

1. **必须调用 `forge:verification-before-completion` skill**(证据先于声称的纪律)。
2. 跑 `forge validate <change-id>`(CLI),拿到 validate 结果。
3. **若 validate 失败**:
   - 根据失败项构造 verify-failed YAML(`forge/changes/<id>/.verify-failed`)
   - YAML schema:
     ```yaml
     schema: forge-verify/v1
     verified_by: ai-agent
     pass: false
     fake_completions:           # 已勾选但代码未改/测试未过的 task id 列表
       - tasks.md#task-3
     appended_tasks:             # 自动追加的修复 task id 列表
       - verify-fix-1
     ```
   - **append 修复 task 到 `forge/changes/<id>/tasks.md`**:每个 fake_completion 一条 `- [ ] verify-fix-N: 修正 task-X 的实施(原声称完成但 verify 失败:<具体原因>)`
   - **不要修改原已勾选 task**(维护 spec §3.3 不变量 2:"task 一旦勾就不可改回")
4. **若 validate 通过**:
   - 跑用户项目的测试(读 `forge/config.yaml` 的 `context.test_command`,缺省 `pnpm test`),把 stdout 写到 `forge/changes/<id>/.evidence/test-output.log`
   - 计算 `log_hash = sha256(test-output.log)`
   - 写 `forge/changes/<id>/.verify-passed` YAML:
     ```yaml
     schema: forge-verify/v1
     tasks_hash: <sha256(tasks.md 已勾段)>
     content_hash: <sha256(proposal+specs+design)>
     verified_by: ai-agent
     pass: true
     evidence:
       - description: "项目测试套件通过"
         log_path: .evidence/test-output.log
         log_hash: <log_hash>
     ```

## 禁止行为

- 不允许在 verify 失败时回去把已勾 task 改回 `[ ]` (违反 spec §3.3 不变量 2)
- 不允许跳过证据 log 写入(verification-before-completion 要求证据先于声称)
- 不允许 pass=true 但 evidence 为空(archive 校验会拒绝)
````

- [ ] **Step 2:加 verify 专属断言**

```typescript
  it('verify 命令引用 forge:verification-before-completion 且含 verify-passed YAML schema', async () => {
    const content = await loadCommand('verify');
    expect(content).toContain('forge:verification-before-completion');
    expect(content).toContain('.verify-passed');
    expect(content).toContain('.verify-failed');
    expect(content).toContain('forge-verify/v1');
    expect(content).toContain('fake_completions');
    expect(content).toContain('evidence');
  });
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/templates/commands.test.ts -t verify
```

- [ ] **Step 4:commit**

```bash
git add src/core/templates/commands/verify.md tests/core/templates/commands.test.ts
git commit -m "feat(templates): /forge:verify 命令模板(verify-passed/failed YAML)"
```

---

### Task C6:`/forge:archive` 命令模板

**Files:**
- Create: `src/core/templates/commands/archive.md`

- [ ] **Step 1:写 `src/core/templates/commands/archive.md`**

````markdown
---
description: 调 forge archive CLI 把 change 移到 archive/、内部 sync specs/、严格校验 verify+review 标记
argument-hint: "<change-id> [--force] [--recover]"
---

You are about to handle `/forge:archive $ARGUMENTS`.

## 步骤

本命令是 CLI 的薄包装。直接执行:

```bash
forge archive $ARGUMENTS
```

## CLI 行为说明(给 AI 理解,不要重复实现)

1. **加进程锁** `forge/.cache/archive.lock`(防止并发)
2. **校验 verify-passed + review-passed 标记存在且合法**:
   - YAML 解析成功 + `schema` 字段值 = `forge-verify/v1` 或 `forge-review/v1`
   - 重算 `tasks_hash` / `content_hash` 必须等于 marker 字段值
   - 重算 git.head + git.diff_hash 必须等于(`is_git_repo: true` 时)
   - `verified_by`/`reviewed_by` 取值 ∈ `{ai-agent, human-override}`
3. **`--force` 接受这两类降级**:
   - `verified_by`/`reviewed_by` = `human-override`
   - `is_git_repo: false`(非 git 项目)跳过 git 字段
4. **`--force` 不覆盖**(任一不一致 archive 拒绝):
   - tasks_hash/content_hash 不一致(标记过期或被篡改)
   - evidence log 文件缺失 / log_hash 不匹配 / pass ≠ true
   - review_outcomes 中 accepted=true 但 resolved=false
5. **archive 顺序原子化**(spec §3.5):Move(rename)→ Sync(specs/ deltas)→ 失败回滚
6. **`--recover` 子模式**:扫描半归档状态(case A/B/C)并修复

## AI 后续行为

archive 成功后,**调用 `forge:finishing-a-development-branch` skill** 提示用户做 git 层面的合并/PR/清理决策。
````

- [ ] **Step 2:加 archive 专属断言 + 跑全 6 命令断言**

```typescript
  it('archive 命令调 forge archive CLI 且引用 forge:finishing-a-development-branch', async () => {
    const content = await loadCommand('archive');
    expect(content).toContain('forge archive');
    expect(content).toContain('forge:finishing-a-development-branch');
    expect(content).toContain('--force');
    expect(content).toContain('--recover');
  });
```

- [ ] **Step 3:跑全 commands.test.ts**

```bash
pnpm vitest run tests/core/templates/commands.test.ts
```

预期:**18 tests passing**(6 命令 × 2 通用 + 6 专属 = 18)。

- [ ] **Step 4:commit**

```bash
git add src/core/templates/commands/archive.md tests/core/templates/commands.test.ts
git commit -m "feat(templates): /forge:archive 命令模板(完成 6 命令)"
```

---

## Phase D:hash-compare + --force 真启用

### Task D1:`hash-compare.ts` 模块

**Files:**
- Create: `src/core/harness-adapters/hash-compare.ts`
- Modify: `src/core/harness-adapters/index.ts`(追加 export)
- Test: `tests/core/harness-adapters/hash-compare.test.ts`

- [ ] **Step 1:写 `src/core/harness-adapters/hash-compare.ts`**

```typescript
// hash 比对 — 决定 deployAtomic 实际要写哪些文件
// spec §4.2 已存在 + 用户改动场景的 --force 覆盖语义

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { DeployPlan, PlannedFile } from './interface.js';

export interface HashCompareResult {
  /** 真正会传给 deployAtomic 的 plans(只含要写的文件) */
  filteredPlans: DeployPlan[];
  /** 已存在且被改但未 --force → 跳过 + 警告用户 */
  skippedModified: PlannedFile[];
  /** 已存在且 hash 与 shipped 相同 → no-op */
  unchanged: PlannedFile[];
  /** 实际要写(新增 + force 覆盖) */
  toWrite: PlannedFile[];
}

/**
 * 按 SHA256 hash 比对决定每个 PlannedFile 的处置。
 *
 * - 目标不存在 → toWrite
 * - 目标存在且 sha256(existing) == sha256(shipped) → unchanged(no-op)
 * - 目标存在且 hash 不同 + force=false → skippedModified(警告)
 * - 目标存在且 hash 不同 + force=true → toWrite(覆盖)
 */
export async function filterByHash(
  projectRoot: string,
  plans: DeployPlan[],
  force: boolean,
): Promise<HashCompareResult> {
  const skippedModified: PlannedFile[] = [];
  const unchanged: PlannedFile[] = [];
  const toWrite: PlannedFile[] = [];

  for (const plan of plans) {
    for (const f of plan.files) {
      const targetAbs = join(projectRoot, f.relPath);
      if (!existsSync(targetAbs)) {
        toWrite.push(f);
        continue;
      }
      const existing = await readFile(targetAbs, 'utf8');
      if (sha256(existing) === sha256(f.content)) {
        unchanged.push(f);
      } else if (force) {
        toWrite.push(f);
      } else {
        skippedModified.push(f);
      }
    }
  }

  // 重新组装 plans:每个 plan 仅含 toWrite 中的文件
  const toWriteSet = new Set(toWrite);
  const filteredPlans: DeployPlan[] = plans.map((plan) => ({
    files: plan.files.filter((f) => toWriteSet.has(f)),
  }));

  return { filteredPlans, skippedModified, unchanged, toWrite };
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
```

- [ ] **Step 2:在 `src/core/harness-adapters/index.ts` 加导出**

打开文件,追加一行:
```typescript
export { filterByHash, type HashCompareResult } from './hash-compare.js';
```

- [ ] **Step 3:写 `tests/core/harness-adapters/hash-compare.test.ts`**

```typescript
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
```

- [ ] **Step 4:跑测试**

```bash
pnpm vitest run tests/core/harness-adapters/hash-compare.test.ts
```

预期:4 tests passing。

- [ ] **Step 5:commit**

```bash
git add src/core/harness-adapters/hash-compare.ts src/core/harness-adapters/index.ts tests/core/harness-adapters/hash-compare.test.ts
git commit -m "feat(adapters): hash-compare 模块(--force 覆盖判定)"
```

---

### Task D2:wire `filterByHash` 进 init.ts + update.ts

**Files:**
- Modify: `src/cli/commands/init.ts`
- Modify: `src/cli/commands/update.ts`

- [ ] **Step 1:改 `src/cli/commands/init.ts`**

定位:文件顶部 imports 中已 import `deployAtomic`,追加 `filterByHash` 和 templates loader。

修改 imports 段(第 9-15 行附近):

```typescript
import {
  detectAll,
  ClaudeAdapter,
  CodexAdapter,
  deployAtomic,
  filterByHash,
} from '../../core/harness-adapters/index.js';
import type { HarnessAdapter, DeployInput } from '../../core/harness-adapters/index.js';
import { parseConfig } from '../../core/parse/index.js';
import { loadAllSkills, loadAllCommands } from '../../core/templates/index.js';
```

修改 `--force` option 的描述(第 22-25 行):

```typescript
    .option(
      '--force',
      '强制覆盖已被用户修改的 skill / command 文件(SHA256 hash 比对决定是否覆盖)',
    )
```

替换原 stub 部分(原第 64-69 行的 `const input: DeployInput = { ... [{ name: 'using-forge', content: '<!-- placeholder, Plan 4 will fill -->' }], commands: [] }`):

```typescript
      // 步骤 4:加载真实 templates(Plan 4 替换原 stub)
      const skills = await loadAllSkills();
      const commands = await loadAllCommands();
      const input: DeployInput = {
        projectRoot: cwd,
        skills: skills.map((s) => ({ name: s.name, content: s.content })),
        commands: commands.map((c) => ({ name: c.name, content: c.content })),
      };
      const plans = await Promise.all(adapters.map((a) => a.plan(input)));

      // 步骤 5:hash 比对过滤(Plan 4 真实施 --force)
      const force = opts.force ?? false;
      const { filteredPlans, skippedModified, unchanged, toWrite } = await filterByHash(
        cwd,
        plans,
        force,
      );
      if (skippedModified.length > 0) {
        console.warn(
          `⚠ ${skippedModified.length} 个文件已被用户修改,跳过(加 --force 覆盖):`,
        );
        for (const f of skippedModified) console.warn(`  - ${f.relPath}`);
      }
      if (toWrite.length === 0) {
        console.log(`✓ 全部 ${unchanged.length} 个文件已是最新,无需部署`);
      } else {
        // 步骤 6:原子部署 — Stage→Backup→Commit 三阶段
        await deployAtomic(cwd, filteredPlans);
        console.log(
          `✓ 部署 ${toWrite.length} 个文件;${unchanged.length} 个未变;${skippedModified.length} 个已修改(--force 覆盖)`,
        );
      }
```

> 注:把原步骤 5(deployAtomic 单独那一行)删除,合并到上面的步骤 6。原步骤 6/7(创建 forge 骨架 + 非 git warn)保持不变,仅编号顺移。

- [ ] **Step 2:改 `src/cli/commands/update.ts`(同样改造)**

加 imports:
```typescript
import { ClaudeAdapter, CodexAdapter, deployAtomic, filterByHash } from '../../core/harness-adapters/index.js';
import type { HarnessAdapter, DeployInput } from '../../core/harness-adapters/index.js';
import { loadAllSkills, loadAllCommands } from '../../core/templates/index.js';
```

改 --force 描述(第 21-24 行):
```typescript
    .option(
      '--force',
      '强制覆盖已被用户修改的 skill / command 文件(SHA256 hash 比对决定是否覆盖)',
    )
```

替换原步骤 5/6(原第 81-93 行的 stub plan + deployAtomic 段)为:

```typescript
      // 5. 加载真实 templates(Plan 4)
      const skills = await loadAllSkills();
      const commands = await loadAllCommands();
      const input: DeployInput = {
        projectRoot: cwd,
        skills: skills.map((s) => ({ name: s.name, content: s.content })),
        commands: commands.map((c) => ({ name: c.name, content: c.content })),
      };
      const plans = await Promise.all(adapters.map((a) => a.plan(input)));

      // 6. hash 比对过滤
      const force = opts.force ?? false;
      const { filteredPlans, skippedModified, unchanged, toWrite } = await filterByHash(
        cwd,
        plans,
        force,
      );
      if (skippedModified.length > 0) {
        console.warn(
          `⚠ ${skippedModified.length} 个文件已被用户修改,跳过(加 --force 覆盖):`,
        );
        for (const f of skippedModified) console.warn(`  - ${f.relPath}`);
      }
      if (toWrite.length === 0) {
        console.log(`✓ 全部 ${unchanged.length} 个文件已是最新`);
        return;
      }
      await deployAtomic(cwd, filteredPlans);
      console.log(
        `✓ forge updated: ${toWrite.length} 写入;${unchanged.length} 未变;${skippedModified.length} 已修改(--force 覆盖)`,
      );
```

- [ ] **Step 3:typecheck + 跑现有 init/update 测试(预期会有部分失败,Task D3 修)**

```bash
pnpm typecheck
pnpm vitest run tests/cli/init.test.ts tests/cli/update.test.ts
```

预期:typecheck 0 errors。init/update 测试中"`expect(content).toContain('placeholder')`" 那几个 case 会 fail(因为现在写的是真模板),Task D3 修测试。

- [ ] **Step 4:commit**

```bash
git add src/cli/commands/init.ts src/cli/commands/update.ts
git commit -m "feat(cli): init/update 用真模板 + filterByHash 实施 --force"
```

---

### Task D3:更新 init.test / update.test / end-to-end.test 断言

**Files:**
- Modify: `tests/cli/init.test.ts`
- Modify: `tests/cli/update.test.ts`
- Modify: `tests/cli/end-to-end.test.ts`

- [ ] **Step 1:`tests/cli/init.test.ts` 替换 placeholder 断言**

定位以下三处(行号近似 21、46、66、89、92):
```typescript
expect(readFileSync(skillPath, 'utf8')).toContain('placeholder');
```
替换为:
```typescript
// Plan 4 之后是真模板,断言含 forge bootstrap 关键标记
const skillContent = readFileSync(skillPath, 'utf8');
expect(skillContent).toContain('forge:using-forge');
expect(skillContent).toContain('/forge:brainstorm');
```

另外 Test "P2.2 --force flag 被接受(当前 noop)" 改名 + 改断言:
```typescript
  it('P2.2:--force flag 真覆盖被用户修改的文件', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-init-force-'));
    try {
      // 第一次 init,产生真模板
      runCli(['init', '--harness=claude'], d);
      const skillPath = join(d, '.claude', 'skills', 'forge-using-forge', 'SKILL.md');
      // 用户改动 SKILL.md
      writeFileSync(skillPath, 'USER MODIFIED', 'utf8');

      // 不加 --force → 应跳过 + warn
      const r1 = runCli(['init', '--harness=claude'], d);
      expect(r1.exitCode).toBe(0);
      expect(readFileSync(skillPath, 'utf8')).toBe('USER MODIFIED');
      expect(r1.stderr + r1.stdout).toMatch(/已被用户修改|跳过/);

      // 加 --force → 应覆盖
      const r2 = runCli(['init', '--harness=claude', '--force'], d);
      expect(r2.exitCode).toBe(0);
      expect(readFileSync(skillPath, 'utf8')).toContain('forge:using-forge');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
```

需要在文件顶部 imports 里加 `writeFileSync`(若没有)。

- [ ] **Step 2:`tests/cli/update.test.ts` 同样改造**

定位 Test 1(行号近似 22-33),原 stub 行为是"手改 SKILL.md → update 重铺回 placeholder"。新行为是"手改 → update 不加 --force 跳过,加 --force 才覆盖"。改写成:

```typescript
  it('已 init 项目 → forge update 默认不覆盖被改文件,--force 才覆盖', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-update-claude-'));
    try {
      const initR = runCli(['init', '--harness=claude'], d);
      expect(initR.exitCode).toBe(0);

      const skillPath = join(d, '.claude', 'skills', 'forge-using-forge', 'SKILL.md');
      writeFileSync(skillPath, 'USER MODIFIED', 'utf8');

      // update 不加 --force → 跳过
      const r1 = runCli(['update'], d);
      expect(r1.exitCode).toBe(0);
      expect(readFileSync(skillPath, 'utf8')).toBe('USER MODIFIED');

      // update --force → 覆盖回真模板
      const r2 = runCli(['update', '--force'], d);
      expect(r2.exitCode).toBe(0);
      const restored = readFileSync(skillPath, 'utf8');
      expect(restored).toContain('forge:using-forge');
      expect(restored).not.toBe('USER MODIFIED');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
```

P2.2 测试改名为 "P2.2:--force flag 行为同上(覆盖)" 或合并删除(已被上面替代)。

- [ ] **Step 3:`tests/cli/end-to-end.test.ts` 加全模板断言**

在 Test 1 末尾追加:
```typescript
      // Plan 4 真模板:验证 12 skill + 6 cmd 文件全部存在
      const skillNames = [
        'using-forge', 'brainstorming', 'writing-plans',
        'subagent-driven-development', 'test-driven-development',
        'requesting-code-review', 'receiving-code-review',
        'verification-before-completion', 'systematic-debugging',
        'dispatching-parallel-agents', 'using-git-worktrees',
        'finishing-a-development-branch',
      ];
      for (const n of skillNames) {
        expect(existsSync(join(d, `.claude/skills/forge-${n}/SKILL.md`))).toBe(true);
      }
      const cmdNames = ['brainstorm', 'propose', 'apply', 'review', 'verify', 'archive'];
      for (const n of cmdNames) {
        expect(existsSync(join(d, `.claude/commands/forge/${n}.md`))).toBe(true);
      }
```

- [ ] **Step 4:跑全 CLI 测试**

```bash
pnpm build
pnpm vitest run tests/cli/
```

预期:全绿(init/update/end-to-end/config/validate/archive/pack-smoke 全部 pass)。如有 fail,按报错回前面 step 修。

- [ ] **Step 5:commit**

```bash
git add tests/cli/init.test.ts tests/cli/update.test.ts tests/cli/end-to-end.test.ts
git commit -m "test(cli): 改 placeholder 断言为真模板特征 + --force 覆盖路径"
```

---

## Phase E:e2e brainstorming acceptance test + 收尾

### Task E1:e2e acceptance test(env-gated)

**Files:**
- Create: `tests/cli/e2e-acceptance.test.ts`

- [ ] **Step 1:写 `tests/cli/e2e-acceptance.test.ts`**

```typescript
// e2e 验收测试:forge init 部署的真模板能否在 Claude Code 里触发 brainstorming
// 与 spike/RESULTS.md 对照(spike 用 superpowers 源文件;此处用 forge 真产物)
// 仅当 CLAUDE_BIN 与 ANTHROPIC_API_KEY 均已设置时跑;CI 默认无,自动 skip
import { describe, it, expect } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

const CLAUDE_BIN = process.env.CLAUDE_BIN; // 例如 "claude"(在 PATH 里)
const HAS_API = !!process.env.ANTHROPIC_API_KEY;
const ENABLED = !!CLAUDE_BIN && HAS_API;

describe.skipIf(!ENABLED)('e2e brainstorming acceptance', () => {
  it('forge init + claude -p "我想做个 todo list" → 触发 brainstorming(问题信号 ≥ 2 + 无 code block)', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-acceptance-'));
    try {
      // 1. forge init
      const initR = runCli(['init', '--harness=claude'], d);
      expect(initR.exitCode).toBe(0);
      expect(existsSync(join(d, '.claude/skills/forge-using-forge/SKILL.md'))).toBe(true);
      expect(existsSync(join(d, '.claude/skills/forge-brainstorming/SKILL.md'))).toBe(true);

      // 2. 跑 claude -p "我想做个 todo list",cwd 是 init 后的 tmpdir
      // 注:用 spawnSync,捕获 stdout;超时 90 秒(brainstorming 多轮可能慢)
      const result = spawnSync(CLAUDE_BIN!, ['-p', '我想做个 todo list 应用'], {
        cwd: d,
        encoding: 'utf8',
        timeout: 90_000,
        env: { ...process.env, NO_COLOR: '1' },
      });
      const out = (result.stdout ?? '') + (result.stderr ?? '');

      // 3. 断言:含至少 2 个问题信号(中文问号或英文问号)
      const questionCount = (out.match(/[??]/g) ?? []).length;
      expect(questionCount, `期望至少 2 个问题信号,实际 ${questionCount}\n响应:\n${out}`).toBeGreaterThanOrEqual(2);

      // 4. 断言:不含代码 block(brainstorming 阶段不应该写代码)
      expect(out).not.toMatch(/```[a-z]/i);

      // 5. 可选:断言提到 forge/drafts/(brainstorming skill 末尾会引用)
      // 此项不强制,某些响应轮次可能尚未到设计阶段
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  }, 120_000); // vitest 测试超时 120 秒
});
```

- [ ] **Step 2:在 `vitest.config.ts` 确认 testTimeout 默认值未阻碍(若默认 5s,本 test 在 it 上独自指定 120s 已覆盖)**

```bash
cat vitest.config.ts
```

确认 `testTimeout` 未硬性 < 120000;若有,移除或调大。

- [ ] **Step 3:本地无 CLAUDE_BIN 时跑 → 应 skip,不报错**

```bash
pnpm vitest run tests/cli/e2e-acceptance.test.ts
```

预期:输出 "1 skipped"(因为 CLAUDE_BIN 未设)。

- [ ] **Step 4:可选 — 本地真跑 一次(若已装 claude CLI + 已配 API key)**

```bash
CLAUDE_BIN=claude ANTHROPIC_API_KEY=sk-... pnpm vitest run tests/cli/e2e-acceptance.test.ts
```

预期:1 passing。失败时,人工查看 stdout 判断 brainstorming 是否触发(spec §6 Phase 0.5 acceptance test 同样语义)。如不通过,可能要回去微调 `using-forge.md` 或 `brainstorming.md` 的红旗清单措辞。

- [ ] **Step 5:commit**

```bash
git add tests/cli/e2e-acceptance.test.ts
git commit -m "test(e2e): brainstorming acceptance(env-gated by CLAUDE_BIN+ANTHROPIC_API_KEY)"
```

---

### Task E2:`src/core/bootstrap/index.ts` 重写为常量

**Files:**
- Modify: `src/core/bootstrap/index.ts`

- [ ] **Step 1:覆盖 `src/core/bootstrap/index.ts`**

```typescript
// bootstrap 模块 — Plan 4
// using-forge 是 bootstrap skill,真实文本由 templates/skills/using-forge.md 提供
// 本模块仅暴露 skill 名常量,供 adapter 在调用 detect/plan 时引用

export const USING_FORGE_SKILL_NAME = 'using-forge' as const;
```

- [ ] **Step 2:typecheck**

```bash
pnpm typecheck
```

预期:0 errors。

- [ ] **Step 3:commit**

```bash
git add src/core/bootstrap/index.ts
git commit -m "refactor(bootstrap): 退化为 USING_FORGE_SKILL_NAME 常量(真文本归 templates/)"
```

---

### Task E3:README 更新(Plan 4 进度段 + Plan 4→Plan 5 衔接)

**Files:**
- Modify: `README.md`

- [ ] **Step 1:替换 README.md 第 5 行 + 在 "## Plan 3 进度" 后追加 "## Plan 4 进度"**

第 5 行:
```markdown
**当前状态**:Phase 1+2+3+4 cut 完成(测试全绿)。**Plan 5(Skill Eval 框架)待启动**。
```

在 `## Plan 3 进度` 段(行 56-63 附近)后追加:

```markdown
## Plan 4 进度

Phase 4(模板内容)完成:

- 12 个 superpowers skill MIT 复制移植到 `src/core/templates/skills/`,改名为 `forge:` 命名空间;产物路径调整为 `forge/drafts/` 与 `forge/changes/<id>/`
- 6 个 `/forge:*` slash 命令模板(brainstorm / propose / apply / review / verify / archive)
- `--force` flag 真启用:SHA256 hash 比对决定是否覆盖(默认:被改文件跳过 + warn;`--force`:强制覆盖)
- e2e brainstorming acceptance test(env-gated by `CLAUDE_BIN` + `ANTHROPIC_API_KEY`)
- LICENSE-THIRD-PARTY.md 补全 superpowers MIT attribution + 12 skill 来源映射

Plan 5 接手:Phase 5(Skill Eval 框架,详 spec §5.5)。
```

- [ ] **Step 2:commit**

```bash
git add README.md
git commit -m "docs(readme): Plan 4 进度段 + 状态更新到 Phase 4 完成"
```

---

### Task E4:全量本地验证 + push + 等 CI

**Files:** 无新增

- [ ] **Step 1:跑五大本地命令**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run
```

预期:**全 0 退出码**。任何一个不为 0,根据报错回到对应 Task 修复。

- [ ] **Step 2:统计测试数 + 写到 commit message**

```bash
pnpm vitest run --reporter=basic 2>&1 | grep -E "Tests|Test Files"
```

预期:测试数 ≥ 215(Plan 3 末尾 165 + Plan 4 新增 ~50:registry 4 + skills 36+1 + commands 18 + hash-compare 4 + e2e 1 skipped + 改造的 init/update 仍占原数)。

- [ ] **Step 3:push 到 dev**

```bash
git push origin dev
```

- [ ] **Step 4:监视 CI**

```bash
gh run watch
```

预期:Linux + Windows 两个 job 全绿。

- [ ] **Step 5:CI 绿后,在本 plan 文件末尾追加完成时间戳**

打开 `docs/plans/2026-05-05-plan-4-templates.md`,在文件末尾(本 Task 之下)新增:

```markdown
---

## Plan 4 完成记录

- 完成时间:<UTC YYYY-MM-DD HH:MM>
- 总测试数:<N>
- CI run URL:<gh URL>
- 关键 commit 范围:<first hash>..<last hash>
```

```bash
git add docs/plans/2026-05-05-plan-4-templates.md
git commit -m "docs(plan-4): 完成记录 + 时间戳"
git push origin dev
```

---

## Plan 4 完成标准

- [ ] CI Linux + Windows 全绿
- [ ] 5 个本地命令(typecheck / lint / format:check / build / test)全 0
- [ ] 测试数 ≥ 215
- [ ] 12 个 skill markdown 文件全部存在,frontmatter `name: forge:<name>`,无残留 `superpowers:<x>` 与 `docs/superpowers/(specs|plans)/`
- [ ] 6 个命令 markdown 文件全部存在,各有 frontmatter description
- [ ] `forge init --harness=claude` 真铺 12+6 = 18 个文件到 `.claude/skills/forge-*/SKILL.md` 与 `.claude/commands/forge/*.md`
- [ ] `forge init --force` 在被改文件场景真覆盖;不加 `--force` 真跳过 + warn
- [ ] `forge update --force` 同上
- [ ] e2e acceptance test 在无 `CLAUDE_BIN` 时 skip(不报错)
- [ ] LICENSE-THIRD-PARTY.md 包含 superpowers MIT 全文 + 12 skill 来源映射
- [ ] README.md "当前状态"已更新到 Phase 4 完成

---

## Plan 4 → Plan 5 衔接

Plan 5 范围(详 spec §5.5):

- 实现 `forge-eval/` 目录:runner.ts(orchestrator,调 Anthropic SDK)+ scenarios/<skill>.yaml(每个 skill 1-3 个场景)+ rubrics/<skill>.yaml(LLM-as-judge prompt)
- 12 个 skill 全做 + multi-turn 进 v1 + weekly + PR cadence
- baseline 锁 Sonnet 4.6,4.7 出来时重跑全量校准
- API key 通过 CI secret 注入,不打包进 npm 发布

Plan 4 给 Plan 5 留下的接口:
- `SKILL_NAMES` 常量(`src/core/templates/skills/index.ts`)是 scenarios YAML 文件命名的事实源
- 每个 skill 的 `forge:<name>` frontmatter 是 eval runner 拼 system prompt 时的 namespace 引用
- e2e acceptance test 的 env-gated 模式给 Plan 5 真跑提供运行机制参考

---

## 自查记录(writing-plans skill 要求)

**Spec coverage**:
- spec §1.3 bootstrap 注入 → Task B1 (using-forge skill 含 6 命令清单)
- spec §2.2 6 命令 + 12 skill 表 → Task B1-B12 + C1-C6 一对一
- spec §4.2 已存在 + 用户改动 + --force 覆盖 → Task D1 + D2 + D3
- spec §5.1 acceptance test 形式 → Task E1
- spec §6 Phase 4 任务 → 本 plan 全部 phase A/B/C/D/E

**Placeholder 扫描**:无 TBD/TODO/implement-later/similar-to-task-N 字样;每个 step 都有具体命令、代码或文件路径。

---

## Plan 4 完成记录

- 完成时间:2026-05-05 07:38
- 总测试数:227 passed, 1 skipped (228 total)
- CI run URL:https://github.com/Accelerator-mzq/forge/actions/runs/25363779371
- 关键 commit 范围:`a35201d..e20c5f7`

**Type 一致性**:
- `LoadedSkill { name, content }` 与 `SkillSpec { name, content }`(已有 types.ts)字段同名,init/update 的 `.map((s) => ({ name: s.name, content: s.content }))` 是 identity map,无歧义
- `HashCompareResult` 字段(`filteredPlans / skippedModified / unchanged / toWrite`)在 D1 定义,在 D2 解构使用,字段名匹配
- `USING_FORGE_SKILL_NAME` 常量与 `SKILL_NAMES[0]` 字面量值一致(均 `'using-forge'`)
