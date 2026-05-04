# Plan 1:Foundation(Phase 0 + 0.5)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**:跑通 npm package 脚手架(tsc/vitest/eslint 全绿,CI 跑通),完成 3 个 harness 的 bootstrap 注入 spike,产出 v0.1 实际覆盖的 harness 范围决策。

**Architecture**:TypeScript + Node 20+ + ESM + pnpm 单仓库;Phase 0 落 npm 脚手架;Phase 0.5 在仓库根 `spike/` 子目录下做 3 个 harness 的最小 PoC,每个验证 "用户开新会话 → 输入模糊需求 → 自动触发 brainstorming"。

**Tech Stack**:TypeScript 5.6+、Node 20.19+、ESM、Vitest 2、commander 12、ESLint 9 (flat config)、Prettier 3、pnpm 9、GitHub Actions(ubuntu-latest + windows-latest)。

**Spec 引用**:[`docs/specs/2026-05-04-forge-fusion-design.md`](../specs/2026-05-04-forge-fusion-design.md) §6 Phase 0 + Phase 0.5;§4.5 Windows + GBK 硬约束。

---

## File Structure(Plan 1 完成时仓库结构)

```
forge-repo/
├── .github/
│   └── workflows/
│       └── ci.yml              ← Linux + Windows CI
├── .gitignore                  ← 已有(Plan 0 init 时建的)
├── .gitattributes              ← 已有
├── eslint.config.js            ← ESM flat config
├── .prettierrc.json
├── LICENSE                     ← 已有
├── LICENSE-THIRD-PARTY.md      ← 新增,致谢 OpenSpec + superpowers
├── README.md                   ← 已有,Plan 1 末尾追加 spike 结果引用
├── package.json
├── pnpm-lock.yaml              ← 自动生成
├── tsconfig.json
├── vitest.config.ts
├── src/
│   └── index.ts                ← 占位 export(Phase 1 才填实)
├── tests/
│   └── smoke.test.ts           ← 验证 import 工作
├── spike/                      ← Phase 0.5 spike 产物
│   ├── README.md               ← spike 总览 + 退出标准
│   ├── bootstrap-text/
│   │   ├── using-forge.md      ← bootstrap skill 文本
│   │   └── forge-brainstorming.md ← 最小化 brainstorming skill
│   ├── claude-code/
│   │   ├── README.md           ← Claude Code 注入说明
│   │   ├── .claude/
│   │   │   ├── skills/
│   │   │   │   ├── using-forge/SKILL.md
│   │   │   │   └── forge-brainstorming/SKILL.md
│   │   │   └── commands/
│   │   │       └── forge/brainstorm.md
│   │   └── ACCEPTANCE-TEST.md  ← 会话粘贴
│   ├── codex/
│   │   ├── README.md
│   │   ├── plugin.json         ← Codex plugin manifest
│   │   ├── skills/             ← 内容同 claude-code/.claude/skills
│   │   └── ACCEPTANCE-TEST.md
│   ├── opencode/
│   │   ├── README.md
│   │   ├── AGENTS.md           ← OpenCode bootstrap 注入
│   │   ├── .opencode/skills/
│   │   └── ACCEPTANCE-TEST.md
│   └── RESULTS.md              ← 三 harness 通过/失败矩阵 + v0.1 范围决策
└── docs/
    ├── plans/
    │   └── 2026-05-05-plan-1-foundation.md  ← 本文档
    └── specs/
        └── 2026-05-04-forge-fusion-design.md ← 已有
```

---

## Phase 0:仓库脚手架

### Task 1:初始化 package.json + Node 版本锁定

**Files:**
- Create: `forge-repo/package.json`
- Create: `forge-repo/.nvmrc`

- [ ] **Step 1.1:写 `.nvmrc`**

```bash
cd D:/ClaudeProject/opsp/forge-repo
echo "20.19.0" > .nvmrc
```

- [ ] **Step 1.2:用 pnpm init 生成 package.json,然后改成下面内容**

把 `package.json` 内容**整体替换**为(注意 `type: module` 是 ESM 关键):

```json
{
  "name": "@accelerator-mzq/forge",
  "version": "0.0.1",
  "description": "OpenSpec × superpowers fusion: spec-driven workflow + behavior-shaping skills, packaged as multi-harness CLI",
  "type": "module",
  "engines": {
    "node": ">=20.19.0",
    "pnpm": ">=9"
  },
  "bin": {
    "forge": "./dist/cli/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE",
    "LICENSE-THIRD-PARTY.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Accelerator-mzq/forge.git"
  },
  "homepage": "https://github.com/Accelerator-mzq/forge",
  "bugs": {
    "url": "https://github.com/Accelerator-mzq/forge/issues"
  }
}
```

- [ ] **Step 1.3:运行 pnpm install,验证依赖装好**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm install
```

预期:输出末尾有 "Done in <time>",生成 `pnpm-lock.yaml` 与 `node_modules/`。

- [ ] **Step 1.4:更新 .gitignore 确保 pnpm-lock.yaml 被 commit、node_modules 被忽略**

打开 `D:/ClaudeProject/opsp/forge-repo/.gitignore`(已存在),确认含 `node_modules/`。如果想强制添加,执行:

```bash
grep -q '^node_modules/$' .gitignore || echo 'node_modules/' >> .gitignore
```

- [ ] **Step 1.5:Commit**

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add package.json .nvmrc pnpm-lock.yaml .gitignore
git commit -m "feat(scaffold): init pnpm package with Node 20+ and TypeScript toolchain"
```

---

### Task 2:TypeScript 配置

**Files:**
- Create: `forge-repo/tsconfig.json`

- [ ] **Step 2.1:写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "spike"]
}
```

- [ ] **Step 2.2:写 `src/index.ts` 占位**

```typescript
// 占位入口 — Phase 1 起替换为真实导出
export const FORGE_VERSION = '0.0.1' as const;
```

- [ ] **Step 2.3:跑 typecheck 验证**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm typecheck
```

预期:无输出,退出码 0。

- [ ] **Step 2.4:跑 build 验证生成 dist/**

```bash
pnpm build
ls dist
```

预期:`dist/index.js`、`dist/index.d.ts`、`dist/index.js.map`、`dist/index.d.ts.map` 存在。

- [ ] **Step 2.5:Commit**

```bash
git add tsconfig.json src/index.ts
git commit -m "feat(scaffold): add TypeScript config with strict mode + ESM NodeNext"
```

---

### Task 3:Vitest 配置 + smoke 测试

**Files:**
- Create: `forge-repo/vitest.config.ts`
- Create: `forge-repo/tests/smoke.test.ts`

- [ ] **Step 3.1:写 `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 用真实 fs / 子进程时大多不能并行(spike 阶段不重要,Phase 1 起会大量用到)
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Windows 上 stdin 默认 GBK,确保 stdout 测试不被编码问题污染
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },
  },
});
```

- [ ] **Step 3.2:写 smoke 测试 — 验证 import 工作 + 版本常量**

```typescript
// tests/smoke.test.ts
import { describe, it, expect } from 'vitest';
import { FORGE_VERSION } from '../src/index.js';

describe('smoke', () => {
  it('should export FORGE_VERSION as a string', () => {
    expect(typeof FORGE_VERSION).toBe('string');
    expect(FORGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 3.3:跑测试验证通过**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm test
```

预期:`Test Files  1 passed (1)` + `Tests  1 passed (1)`,退出码 0。

- [ ] **Step 3.4:Commit**

```bash
git add vitest.config.ts tests/smoke.test.ts
git commit -m "feat(scaffold): add Vitest config and smoke test"
```

---

### Task 4:ESLint + Prettier(ESM flat config)

**Files:**
- Create: `forge-repo/eslint.config.js`
- Create: `forge-repo/.prettierrc.json`
- Create: `forge-repo/.prettierignore`

- [ ] **Step 4.1:写 `eslint.config.js`(flat config,ESM 风格)**

```javascript
// eslint.config.js
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'spike/**', '**/*.config.js', '**/*.config.ts'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: ['./tsconfig.json'],
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off', // CLI 工具会用 console
    },
  },
];
```

- [ ] **Step 4.2:写 `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

- [ ] **Step 4.3:写 `.prettierignore`**

```
dist/
node_modules/
pnpm-lock.yaml
spike/**/SKILL.md
spike/**/*.md
docs/
```

- [ ] **Step 4.4:跑 lint 和 format:check 验证**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm lint
pnpm format:check
```

预期:两个命令都退出码 0,无错误输出。

- [ ] **Step 4.5:Commit**

```bash
git add eslint.config.js .prettierrc.json .prettierignore
git commit -m "feat(scaffold): add ESLint flat config + Prettier with LF enforcement"
```

---

### Task 5:GitHub Actions CI(Linux + Windows)

**Files:**
- Create: `forge-repo/.github/workflows/ci.yml`

- [ ] **Step 5.1:写 `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    name: Test on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm format:check

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
```

- [ ] **Step 5.2:Commit + push 触发 CI**

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add .github/workflows/ci.yml
git commit -m "feat(ci): add GitHub Actions matrix workflow (linux + windows)"
git push
```

- [ ] **Step 5.3:等 CI 跑完 + 验证两个 runner 都绿**

```bash
gh run list --limit 1
gh run watch
```

预期:Linux 和 Windows 两个 job 都 ✓ 通过。失败必须修(常见问题:Windows 下行尾、路径分隔符)。

---

### Task 6:LICENSE-THIRD-PARTY.md

**Files:**
- Create: `forge-repo/LICENSE-THIRD-PARTY.md`

- [ ] **Step 6.1:写 LICENSE-THIRD-PARTY.md**

```markdown
# Third-Party Notices

This project (forge) borrows design ideas and skill text from the following projects:

## superpowers

- Source: https://github.com/obra/superpowers
- License: MIT
- Author: Jesse Vincent / @obra
- Use in forge: Skill text (12 skills, to be placed under `core/templates/skills/` in Phase 1+) is copied from superpowers under MIT license, with renaming (`superpowers:` → `forge:`) and path adjustments. The original MIT license and copyright notice are reproduced in full below, satisfying the "shall be included" clause for substantial portions.

### superpowers MIT License (full text)

(Copyright (c) 2025 Jesse Vincent — full MIT license text follows;复制 superpowers/LICENSE 全文。)

## OpenSpec

- Source: https://github.com/Fission-AI/OpenSpec
- License: MIT
- Author: OpenSpec Contributors / Fission AI
- Use in forge: forge does not copy OpenSpec source code, but heavily borrows its design — artifact directory structure (`forge/changes/<id>/{proposal, specs, design, tasks}.md`), `archive/<date>-<id>/` history, `config.yaml` context injection mechanism, `spec-driven` schema concept.

### OpenSpec MIT License (full text)

(Copyright (c) 2024 OpenSpec Contributors — full MIT license text follows;复制 OpenSpec/LICENSE 全文。)
```

**MIT 合规要点**:由于 forge **复制了 superpowers 12 个 skill 文本**(属于 "substantial portions"),MIT 强制要求 "shall be included" 的原始 LICENSE 与版权声明必须**带在 forge 仓库内**,不能只链回 GitHub。Implementer 需要从本地 `D:/ClaudeProject/opsp/superpowers/LICENSE` 和 `D:/ClaudeProject/opsp/OpenSpec/LICENSE` 读取实际全文嵌入。

- [ ] **Step 6.2:Commit**

```bash
git add LICENSE-THIRD-PARTY.md
git commit -m "docs: add third-party attribution for superpowers + OpenSpec"
git push
```

---

## Phase 0.5:多 harness Bootstrap Spike

> **目的**:验证 3 个 harness 的 bootstrap 注入机制都能让 skill 自动触发。退出标准决定 v0.1 实际覆盖面。
>
> **关键纪律**:这是 spike,不是产品代码。spike/ 下的内容**不进 npm 包**(.gitignore + tsconfig exclude),**不接受复杂度审查**——能跑通就行。所有结论汇总到 `spike/RESULTS.md`,后续 Phase 实施时再做产品级实现。

### Task 7:写 bootstrap 文本(共享给三 harness 用)

**Files:**
- Create: `forge-repo/spike/README.md`
- Create: `forge-repo/spike/bootstrap-text/using-forge.md`
- Create: `forge-repo/spike/bootstrap-text/forge-brainstorming.md`

- [ ] **Step 7.1:写 spike 总览 README**

```markdown
# spike/ — 多 harness Bootstrap 注入 PoC

**目的**:验证三 harness 在会话开始就加载 `using-forge` bootstrap,使 `brainstorming` skill 能在用户输入模糊需求时自动触发(不写代码反而开始问问题)。

**退出标准**(写入 `RESULTS.md`):

- 全 3 通过 → v0.1 范围 = Claude Code + Codex + OpenCode
- 仅 Claude + Codex 通过 → v0.1 缩到 2 harness,OpenCode 推 v0.2
- 仅 Claude 通过 → v0.1 缩到 1 harness,Codex+OpenCode 推 v0.2
- 全失败 → 回到设计阶段,重新评估"自动触发"前提

**Acceptance Test**(每个 harness 都跑):

1. 开一个空目录
2. 把 `spike/<harness>/` 下的文件复制/链接到该目录
3. 起新会话,发**这句话**:`我想做个 todo list 应用`
4. **预期**:AI 不直接写代码,而是开始问问题(确认范围/限制/技术栈)
5. **失败**:AI 直接生成代码或 import React 等 → bootstrap 没生效

每个 harness 子目录的 `ACCEPTANCE-TEST.md` 粘贴会话原文 + 判定结果。

不接受 bootstrap 文本变形(比如把"先问问题"改成"先思考问题")绕过测试——必须看到 AI 真在多轮问澄清问题。
```

- [ ] **Step 7.2:写最小化 `using-forge.md` bootstrap**

```markdown
---
name: using-forge
description: forge 项目的 session-start bootstrap。注入 forge 工作流约束:模糊需求触发 brainstorming,不直接写代码。
---

# Forge 会话规则

你在一个使用 forge 工作流的项目里。任何会话开始时,在做任何代码或文件操作前,先检查下面规则。

## 红旗清单(命中任一 → STOP,转 brainstorming)

| 用户输入信号 | 你的反应 |
|---|---|
| "我想做..."(陈述意图但未列细节) | 触发 brainstorming |
| 含"大概 / 也许 / 不太确定" | 触发 brainstorming |
| 没有给具体技术栈、UI、数据模型 | 触发 brainstorming |
| 直接说"给代码 / 直接写 / 别问问题了" + 上面任一信号 | **仍然触发 brainstorming**,礼貌拒绝压力 |

## 禁止行为

- 用户输入模糊时,**不**直接写代码
- 用户输入模糊时,**不**用占位符填代码再说"如果不对就改"
- 把"先问问题"改写成"先思考问题"绕过 brainstorming

## 可以做的事

- 用 Read 工具读已有文件了解上下文
- 复述用户输入,确认理解一致
- 提 2-3 个候选方案,等用户选
```

- [ ] **Step 7.3:写最小化 `forge-brainstorming.md` skill**

```markdown
---
name: forge-brainstorming
description: 把模糊需求变成具体设计,通过逐段提问 + 多方案比较,而不是直接写代码。
---

# Forge Brainstorming

模糊需求触发本 skill。**强制流程**:

1. **复述并澄清**:重述用户原话,问 1 个最关键的澄清问题(范围 / 用户 / 技术栈中选一个最缺的)
2. **2-3 方案对照**:把候选方案列成表格,每个标"优 / 劣 / 推荐与否"
3. **逐段确认**:用户选了方案后,把架构按段拆出来,每段问一句"这段你接受吗?"
4. **写 design 草稿**:确认完成后,把 design 总结写到 `forge/drafts/<date>-<topic>.md`(spike 阶段不写文件,只复述要写的内容)

## 红旗清单

| 你想... | 别这样 |
|---|---|
| 不问就给代码 | STOP,先问 1 个问题 |
| 一次问 5 个问题 | 一次只问 1 个 |
| 跳过方案对比直接选一个 | 必须列 2-3 个 |
| 把所有架构一次性丢出来 | 拆段逐次确认 |
```

- [ ] **Step 7.4:Commit**

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add spike/README.md spike/bootstrap-text/
git commit -m "feat(spike): add minimal using-forge bootstrap + forge-brainstorming skill text"
```

---

### Task 8:Claude Code spike

**Files:**
- Create: `forge-repo/spike/claude-code/README.md`
- Create: `forge-repo/spike/claude-code/.claude/skills/using-forge/SKILL.md`
- Create: `forge-repo/spike/claude-code/.claude/skills/forge-brainstorming/SKILL.md`
- Create: `forge-repo/spike/claude-code/.claude/commands/forge/brainstorm.md`
- Create: `forge-repo/spike/claude-code/ACCEPTANCE-TEST.md`

- [ ] **Step 8.1:写 Claude Code spike README**

```markdown
# spike/claude-code/

**Claude Code 注入机制**(参考 superpowers 仓库公开的 install 文档):

- `.claude/skills/<skill-name>/SKILL.md` — 会话开始就被加载
- `.claude/commands/<namespace>/<cmd>.md` — slash 命令模板

**测试方法**:

1. 在你电脑上找一个空目录(如 `/tmp/forge-spike-test/`)
2. 复制 `spike/claude-code/.claude/` 整个目录过去
3. 在该目录下 `claude` 起新会话
4. 发"我想做个 todo list 应用"
5. 把会话原文(包括 AI 回复至少 5 轮)粘贴到 `ACCEPTANCE-TEST.md`
```

- [ ] **Step 8.2:把 `bootstrap-text/using-forge.md` 复制为 SKILL.md(加 frontmatter 头)**

`spike/claude-code/.claude/skills/using-forge/SKILL.md`:复制 `spike/bootstrap-text/using-forge.md` 的全部内容(已含 frontmatter,可直接拿)。

- [ ] **Step 8.3:复制 forge-brainstorming SKILL.md 同上**

`spike/claude-code/.claude/skills/forge-brainstorming/SKILL.md`:复制 `spike/bootstrap-text/forge-brainstorming.md` 全部内容。

- [ ] **Step 8.4:写 slash 命令模板 `brainstorm.md`**

```markdown
---
description: forge brainstorm:把模糊需求变成具体设计
---

调用 forge-brainstorming skill。完成后把 design 草稿写到 `forge/drafts/<date>-<topic>.md`(spike 阶段不写文件,只复述要写的内容)。
```

- [ ] **Step 8.5:跑 acceptance test 并粘贴会话**

操作:在你电脑上 cd 到一个空目录,把 `spike/claude-code/.claude/` 复制过去,起 `claude` 新会话,发`我想做个 todo list 应用`。

**期望**:AI 不写代码,反而开始问问题(范围 / 用户 / 技术栈)。

把整段会话(用户输入 + AI 输出至少 5 轮)粘贴到:

```markdown
# spike/claude-code/ACCEPTANCE-TEST.md
# Acceptance Test:Claude Code Bootstrap

**测试时间**:<填写,如 2026-05-08T10:30:00Z>
**Claude Code 版本**:<填写,如 v2.x>

## 会话原文

### 用户(turn 1)
我想做个 todo list 应用

### AI(turn 1)
<粘贴 AI 回复>

### 用户(turn 2)
<粘贴你的回复>

### AI(turn 2)
<粘贴 AI 回复>

...(至少 5 轮)

## 判定

- [ ] AI 在 turn 1 没写代码
- [ ] AI 在 turn 1 提了至少 1 个澄清问题
- [ ] 在后续 turn 中,AI 提了 2-3 个方案让用户选
- [ ] AI 没有被"快给代码"压力打破规则

**结果**:PASS / FAIL

**失败原因**(若 FAIL):<具体描述,例如"AI 直接给了 jsx 代码"或"AI 只问了一个问题就开始写代码">
```

- [ ] **Step 8.6:Commit**

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add spike/claude-code/
git commit -m "spike(claude-code): bootstrap PoC + acceptance test transcript"
```

---

### Task 9:Codex spike

**Files:**
- Create: `forge-repo/spike/codex/README.md`
- Create: `forge-repo/spike/codex/plugin.json`(或 superpowers 实际用的格式)
- Create: `forge-repo/spike/codex/skills/using-forge/SKILL.md`
- Create: `forge-repo/spike/codex/skills/forge-brainstorming/SKILL.md`
- Create: `forge-repo/spike/codex/ACCEPTANCE-TEST.md`

- [ ] **Step 9.1:研究 Codex plugin manifest 格式**

参考 superpowers 仓库的 Codex 适配代码(找 `superpowers` repo 的 release notes 或 install docs 提到 Codex 的章节)。

预期产出:一份 `plugin.json`(或 superpowers 实际用的格式),包含:
- 插件名 / 版本
- skill 文件路径列表
- bootstrap 注入点声明

- [ ] **Step 9.2:写 `spike/codex/README.md`**

```markdown
# spike/codex/

**Codex 注入机制**(本 spike 验证产物):

<填写 9.1 研究结果。例如:>
- Codex plugin 通过 `plugin.json` 声明
- 启动时读取 `plugin.json` → 加载所有 skill 文件
- bootstrap 标记:`"bootstrap": true` 字段(或类似)

**测试方法**:同 `spike/claude-code/README.md`,但用 Codex CLI 启动会话。
```

- [ ] **Step 9.3:写 `plugin.json`(基于 9.1 研究)**

按 9.1 找到的格式写最小可用 manifest。**如果 9.1 找不到公开文档**:在 `README.md` 显式标注"格式未公开,本 PoC 失败,Codex 推 v0.2",并把 spike 结果记为 FAIL。

- [ ] **Step 9.4:复制 skill 文件**

`spike/codex/skills/using-forge/SKILL.md` 和 `spike/codex/skills/forge-brainstorming/SKILL.md` 内容同 spike/claude-code/.claude/skills/。

- [ ] **Step 9.5:跑 acceptance test 并粘贴会话**

格式同 `spike/claude-code/ACCEPTANCE-TEST.md`,但在 Codex 会话里跑。如 9.1 失败、根本起不了 Codex 会话,直接把 ACCEPTANCE-TEST.md 标 FAIL + 写明原因。

- [ ] **Step 9.6:Commit**

```bash
git add spike/codex/
git commit -m "spike(codex): bootstrap PoC + acceptance test (status: pass/fail)"
```

(commit message 里写实际状态)

---

### Task 10:OpenCode spike

**Files:**
- Create: `forge-repo/spike/opencode/README.md`
- Create: `forge-repo/spike/opencode/AGENTS.md`(或 superpowers 实际用的注入入口)
- Create: `forge-repo/spike/opencode/.opencode/skills/using-forge/SKILL.md`
- Create: `forge-repo/spike/opencode/.opencode/skills/forge-brainstorming/SKILL.md`
- Create: `forge-repo/spike/opencode/ACCEPTANCE-TEST.md`

- [ ] **Step 10.1:读 superpowers 仓库的 OpenCode 安装文档**

地址:superpowers 仓库的 `docs/README.opencode.md`(或当前命名)。重点找:
- bootstrap 注入路径(可能是 `AGENTS.md`、`.opencode/<something>`、或两者结合)
- skill 加载机制

- [ ] **Step 10.2:写 `spike/opencode/README.md`** 总结 10.1 结论

- [ ] **Step 10.3:按 10.1 结果铺最小 PoC**

如果 OpenCode 用 `AGENTS.md` + `.opencode/skills/`:
- `AGENTS.md` 写 bootstrap 引用(具体格式按 10.1 文档)
- `.opencode/skills/<name>/SKILL.md` 复制对应内容

如果 OpenCode 文档说不可行:直接 FAIL,写明原因。

- [ ] **Step 10.4:跑 acceptance test 并粘贴会话**

格式同上,在 OpenCode 会话里跑。

- [ ] **Step 10.5:Commit**

```bash
git add spike/opencode/
git commit -m "spike(opencode): bootstrap PoC + acceptance test (status: pass/fail)"
```

---

### Task 11:汇总 spike 结果 + v0.1 范围决策

**Files:**
- Create: `forge-repo/spike/RESULTS.md`

- [ ] **Step 11.1:写 `spike/RESULTS.md`**

```markdown
# Phase 0.5 Spike Results

**测试日期**:<完成日期>
**spec 引用**:[2026-05-04-forge-fusion-design.md](../docs/specs/2026-05-04-forge-fusion-design.md) §6 Phase 0.5

## Acceptance Test 结果矩阵

| Harness | Bootstrap 注入路径 | brainstorming 自动触发 | 结果 |
|---|---|---|---|
| Claude Code | `.claude/skills/using-forge/SKILL.md` | <PASS / FAIL> | <填写> |
| Codex | `<填写实际路径>` | <PASS / FAIL> | <填写> |
| OpenCode | `<填写实际路径>` | <PASS / FAIL> | <填写> |

## v0.1 实际范围决策

根据 spec §6 Phase 0.5 的退出标准:

- 全 3 通过 → v0.1 = 3 harness
- Claude + Codex 通过 → v0.1 = 2 harness,OpenCode 推 v0.2
- 仅 Claude 通过 → v0.1 = 1 harness,Codex+OpenCode 推 v0.2
- 全失败 → 回到设计阶段

**本次决策**:v0.1 = <填写,如 "Claude + Codex 双 harness">

## 失败 harness 的具体原因(若有)

<针对每个 FAIL 写一段,避免后续 plan 重蹈覆辙>

例:
- **OpenCode**:文档 `docs/README.opencode.md` 找不到关于 bootstrap 自动注入的说明,只支持手动 `/load` 命令。这违反"会话开始就生效"前提,不符合 forge bootstrap 哲学。推 v0.2 重新评估。

## 对后续 Plan 2 / 3 的影响

- adapter 实现范围:<列出实际要写的 adapter,如 "claude.ts + codex.ts">
- §5.1 release gate smoke test 范围:<同上>
- 决策快照 #4 / #18 已自动收紧到本结果
```

- [ ] **Step 11.2:更新 README.md 末尾追加 spike 结果引用**

打开 `D:/ClaudeProject/opsp/forge-repo/README.md`,在 "## 实施路线" 表格后追加:

```markdown
## Phase 0.5 Spike 结果

[查看 spike 结果与 v0.1 范围决策](spike/RESULTS.md)
```

- [ ] **Step 11.3:Commit + push**

```bash
cd D:/ClaudeProject/opsp/forge-repo
git add spike/RESULTS.md README.md
git commit -m "spike: finalize Phase 0.5 results + v0.1 harness scope decision"
git push
```

- [ ] **Step 11.4:验证 GitHub 上仓库状态**

```bash
gh repo view Accelerator-mzq/forge --json description,pushedAt,defaultBranchRef
gh run list --limit 1   # 验 CI 仍绿
```

预期:`pushedAt` 是刚才的时间,CI 最新一次跑过。

---

## Plan 1 完成标准(所有勾选完成)

- [ ] **CI 状态**:Linux 和 Windows 两个 runner 都 ✓
- [ ] **本地命令**:`pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm test` / `pnpm build` 五个全部退出码 0
- [ ] **Spike RESULTS.md 完成**:三 harness 各有 ACCEPTANCE-TEST.md 结论(PASS / FAIL),v0.1 范围已写明
- [ ] **README.md** 引用 spike 结果
- [ ] **GitHub 仓库** main 分支至少有 11 次 commit(每个 task 1-2 commit)

---

## Plan 1 → Plan 2 衔接

Plan 1 完成后,**根据 spike RESULTS 写 Plan 2**(Phase 1 + 2 + 3,Core Engine + CLI + Adapter)。

Plan 2 范围 = v0.1 实际覆盖的 harness。如 spike 结果 "Claude + Codex 通过,OpenCode 失败",Plan 2 只写 `claude.ts` 和 `codex.ts` 两个 adapter,把 `opencode.ts` 推到 v0.2。

**Plan 2 不在 Plan 1 范围内,等 spike 结果后再写**。
