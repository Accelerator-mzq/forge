# Plan 1 — 仓库重构(skills/commands/hooks 提到根 + 三 harness manifest)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:把 v0.2 散落在 `src/core/templates/` 的 12 skills + 6 commands 提到仓库根 `skills/` + `commands/`,加 hooks/ + 三 harness manifest(`.claude-plugin/` + `.codex-plugin/` + `.opencode/plugins/`),让 forge 仓库变成"npm 包源 + 三 harness plugin marketplace 源"双产物形态。

**Architecture**:单仓库多 manifest(参考 superpowers 实战);`scripts/copy-templates.mjs` 反向同步根 `skills/` + `commands/` 进 `src/core/templates/`(legacy `forge init` 仍能为 v0.2 用户铺老形态,v0.4 移除);hooks/ 三文件 fork superpowers(纯 bash + run-hook.cmd polyglot);`.opencode/plugins/forge.js` fork superpowers `superpowers.js` 改 default export(Plan 0a.3 实测 PASS)。

**Tech Stack**:Node 20+(脚本 + plugin loader),bash 4+(hooks),无新 npm 依赖。

**Spec 引用**:[`2026-05-09-v0.3-plugin-migration-design.md`](../specs/2026-05-09-v0.3-plugin-migration-design.md) §1.1(仓库形态)、§2.1-2.5(组件清单)、§5.5 Plan 1。

**前置**:Plan 0a 全部 PASS(已 commit `0f519d0`)。

---

## File Structure(Plan 1 完成时仓库结构)

```
forge-repo/                              ← Accelerator-mzq/forge
├── .claude-plugin/                      ← ★ NEW
│   ├── plugin.json                      ← Claude Code plugin manifest
│   └── marketplace.json                 ← 自建 marketplace
├── .codex-plugin/                       ← ★ NEW
│   └── plugin.json                      ← Codex plugin manifest
├── .opencode/                           ← ★ NEW
│   └── plugins/
│       └── forge.js                     ← OpenCode JS hook(default export)
├── skills/                              ← ★ NEW(从 src/core/templates/skills/ 提)
│   ├── using-forge/SKILL.md
│   ├── brainstorming/SKILL.md
│   ├── writing-plans/SKILL.md
│   ├── subagent-driven-development/SKILL.md
│   ├── test-driven-development/SKILL.md
│   ├── requesting-code-review/SKILL.md
│   ├── receiving-code-review/SKILL.md
│   ├── verification-before-completion/SKILL.md
│   ├── systematic-debugging/SKILL.md
│   ├── dispatching-parallel-agents/SKILL.md
│   ├── using-git-worktrees/SKILL.md
│   └── finishing-a-development-branch/SKILL.md
├── commands/                            ← ★ NEW(从 src/core/templates/commands/ 提)
│   ├── brainstorm.md
│   ├── propose.md
│   ├── apply.md
│   ├── review.md
│   ├── verify.md
│   └── archive.md
├── hooks/                               ← ★ NEW
│   ├── hooks.json                        ← SessionStart 注入(matcher: startup|clear|compact)
│   ├── run-hook.cmd                      ← polyglot wrapper(fork superpowers)
│   └── session-start                     ← bash 脚本无扩展名(fork superpowers,sed 替换 plugin 名)
├── scripts/
│   ├── copy-templates.mjs               ← 改:反向从根 skills/+commands/ 同步进 src/core/templates/
│   ├── release-gate.mjs                 ← 原
│   └── ...                              ← Plan 5 加 build-bundled-plugin.mjs
├── src/core/templates/                  ← 降级为 mirror(由 copy-templates.mjs 反向写入)
│   ├── skills/                          ← 内容由 scripts/copy-templates.mjs 从根 skills/ 拷贝
│   └── commands/                        ← 同上
├── src/core/harness-adapters/           ← v0.2 既有,Plan 4 重构(LegacyDetector)
└── ...                                  ← 其余 v0.2 既有结构
```

---

## Task 1.1:创建 Claude Code plugin manifest

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`

- [ ] **Step 1**:写 `.claude-plugin/plugin.json`

```json
{
  "name": "forge",
  "version": "0.3.0",
  "description": "Spec-driven workflow + 12 behavior-shaping skills for Claude Code (OpenSpec × superpowers fusion)",
  "author": { "name": "msc", "email": "msc920426@proton.me" },
  "homepage": "https://github.com/Accelerator-mzq/forge",
  "license": "MIT"
}
```

- [ ] **Step 2**:写 `.claude-plugin/marketplace.json`

```json
{
  "name": "accelerator-mzq-forge",
  "description": "Forge marketplace (self-hosted)",
  "owner": { "name": "msc" },
  "plugins": [
    {
      "name": "forge",
      "description": "Spec-driven workflow + 12 behavior-shaping skills",
      "version": "0.3.0",
      "source": "./",
      "author": { "name": "msc" }
    }
  ]
}
```

- [ ] **Step 3**:Commit

```bash
git add .claude-plugin/
git commit -m "feat(plugin): Claude Code plugin manifest + self-hosted marketplace"
```

---

## Task 1.2:创建 Codex plugin manifest

**Files:**
- Create: `.codex-plugin/plugin.json`

- [ ] **Step 1**:写 manifest(对齐 superpowers `.codex-plugin/plugin.json` 形态)

```json
{
  "name": "forge",
  "version": "0.3.0",
  "description": "Spec-driven workflow + skills for Codex CLI",
  "author": { "name": "msc" },
  "license": "MIT",
  "skills": "./skills/",
  "interface": {
    "displayName": "Forge",
    "shortDescription": "Spec-driven workflow + behavior-shaping skills for Codex",
    "category": "Coding",
    "capabilities": ["Interactive", "Read", "Write"]
  }
}
```

- [ ] **Step 2**:Commit

```bash
git add .codex-plugin/
git commit -m "feat(plugin): Codex plugin manifest"
```

---

## Task 1.3:创建 OpenCode plugin(default export 形态)

**Files:**
- Create: `.opencode/plugins/forge.js`

**前置说明**:Plan 0a.3 实测 default export 在 OpenCode 下完全 work(plan known-issue #1 实证非问题),fork superpowers `superpowers.js` 改 default export + plugin 名。

- [ ] **Step 1**:fork superpowers + 改名

```bash
mkdir -p .opencode/plugins
cp ../superpowers/.opencode/plugins/superpowers.js .opencode/plugins/forge.js
```

- [ ] **Step 2**:Edit `.opencode/plugins/forge.js` — 改命名:`superpowers` → `forge`,`Superpowers` → `Forge`,`using-superpowers` → `using-forge`;改 export 为 default(避开 PascalCase 命名约定)

最终 plugin 内容:
```js
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  return match ? { body: match[2] } : { body: content };
};

export default async ({ client, directory }) => {
  const forgeSkillsDir = path.resolve(__dirname, '../../skills');

  const getBootstrapContent = () => {
    const skillPath = path.join(forgeSkillsDir, 'using-forge', 'SKILL.md');
    if (!fs.existsSync(skillPath)) return null;
    const { body } = extractAndStripFrontmatter(
      fs.readFileSync(skillPath, 'utf8'),
    );
    return `<EXTREMELY_IMPORTANT>\nYou have forge.\n\n${body}\n</EXTREMELY_IMPORTANT>`;
  };

  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(forgeSkillsDir)) {
        config.skills.paths.push(forgeSkillsDir);
      }
    },

    'experimental.chat.messages.transform': async (_input, output) => {
      const bootstrap = getBootstrapContent();
      if (!bootstrap || !output.messages.length) return;
      const firstUser = output.messages.find((m) => m.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;
      if (firstUser.parts.some(
        (p) => p.type === 'text' && p.text.includes('EXTREMELY_IMPORTANT'),
      )) return;
      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
    },
  };
};
```

- [ ] **Step 3**:Commit

```bash
git add .opencode/plugins/forge.js
git commit -m "feat(plugin): OpenCode plugin (default export, fork from superpowers)"
```

---

## Task 1.4:fork superpowers hooks 到根 hooks/

**Files:**
- Create: `hooks/hooks.json`
- Create: `hooks/run-hook.cmd`
- Create: `hooks/session-start`(无扩展名)

- [ ] **Step 1**:写 `hooks/hooks.json`(对齐 superpowers 实战形态,Plan 0a.1 验证)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "async": false
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2**:fork superpowers 两文件 + sed 替换 + 删 legacy_skills_dir 段

```bash
OPSP_ROOT=D:/ClaudeProject/opsp
mkdir -p hooks
cp "$OPSP_ROOT/superpowers/hooks/run-hook.cmd" hooks/run-hook.cmd
cp "$OPSP_ROOT/superpowers/hooks/session-start" hooks/session-start

# sed 替换 plugin 名
sed -i 's/superpowers/forge/g; s/Superpowers/Forge/g; s/using-superpowers/using-forge/g' \
  hooks/session-start
```

手动 Edit `hooks/session-start` 删除 legacy_skills_dir 整段,保留 `warning_message=""` 一行:

```bash
# 删除 line 10-15 if [ -d "$legacy_skills_dir" ]; then ... fi 整段
# 仅保留 warning_message=""(后续 escape_for_json "$warning_message" 仍 work)
```

- [ ] **Step 3**:本地 hook 预验证(Plan 0a.1.2 验证过的脚本形态)

```bash
(cd . && CLAUDE_PLUGIN_ROOT="$(pwd)" bash hooks/run-hook.cmd session-start) > /tmp/hook-output.json

# 验证 JSON 合法 + 关键字段(用 stdin pipe 跨平台一致)
cat /tmp/hook-output.json | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"
grep -q 'using-forge' /tmp/hook-output.json && echo "using-forge: HIT"
grep -q 'EXTREMELY_IMPORTANT' /tmp/hook-output.json && echo "EXTREMELY_IMPORTANT: HIT"
```

- [ ] **Step 4**:Commit + 设可执行位

```bash
git add hooks/
git update-index --chmod=+x hooks/session-start hooks/run-hook.cmd
git commit -m "feat(plugin): hooks/ fork from superpowers (run-hook.cmd polyglot + session-start, exec bits)"
```

---

## Task 1.5:把 12 skills 提到根 skills/

**Files:**
- Move: `src/core/templates/skills/forge-<name>.md` → `skills/<name>/SKILL.md`(12 个)

**重要 — 不直接删 src/core/templates/skills/**(legacy `forge init` 仍要用,Task 1.7 写反向同步脚本)。

- [ ] **Step 1**:为每 skill 创建子目录 + 移文本

```bash
mkdir -p skills/{using-forge,brainstorming,writing-plans,subagent-driven-development,test-driven-development,requesting-code-review,receiving-code-review,verification-before-completion,systematic-debugging,dispatching-parallel-agents,using-git-worktrees,finishing-a-development-branch}
```

- [ ] **Step 2**:逐一 cp + 改名(原 forge-<name>.md → <name>/SKILL.md)

```bash
for skill in using-forge brainstorming writing-plans subagent-driven-development test-driven-development requesting-code-review receiving-code-review verification-before-completion systematic-debugging dispatching-parallel-agents using-git-worktrees finishing-a-development-branch; do
  cp "src/core/templates/skills/forge-${skill}.md" "skills/${skill}/SKILL.md"
done
```

- [ ] **Step 3**:Commit(此时根 skills/ 与 src/core/templates/skills/ 内容相同,Task 1.7 加反向同步脚本)

```bash
git add skills/
git commit -m "feat(plugin): hoist 12 skills from src/core/templates/skills/ to repo root skills/"
```

**注意**:本 task 只是 cp,内容不改。Plan 2(skill 体系重构)负责本地化(P2/P3 修复 + 命名引用更新 forge: → 内部 namespace)。

---

## Task 1.6:把 6 commands 提到根 commands/

**Files:**
- Move: `src/core/templates/commands/<name>.md` → `commands/<name>.md`(6 个)

- [ ] **Step 1**:cp 6 个 commands

```bash
mkdir -p commands
for cmd in brainstorm propose apply review verify archive; do
  cp "src/core/templates/commands/${cmd}.md" "commands/${cmd}.md"
done
```

- [ ] **Step 2**:Commit

```bash
git add commands/
git commit -m "feat(plugin): hoist 6 commands from src/core/templates/commands/ to repo root commands/"
```

**注意**:Plan 3 负责 commands 重构 — Claude Code 路径调 `node ${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs`;OpenCode + Codex 路径 commands 不可注册,内容内化到 skill 文本。

---

## Task 1.7:反向同步脚本 `scripts/copy-templates.mjs`

**Files:**
- Modify: `scripts/copy-templates.mjs`(v0.2 既有,反向工作)
- Test: 跑 `pnpm build` 验证 src/core/templates/ 自动同步

- [ ] **Step 1**:Read 现有 `scripts/copy-templates.mjs`(v0.2 实现 — 从 src/core/templates 写到 build 输出)

- [ ] **Step 2**:重写为反向同步(从根 skills/ + commands/ 写到 src/core/templates/)

```js
// scripts/copy-templates.mjs (v0.3 重写)
import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SRC_TEMPLATES = join(REPO_ROOT, 'src', 'core', 'templates');

// 同步 skills:repo-root/skills/<name>/SKILL.md → src/core/templates/skills/forge-<name>.md
async function syncSkills() {
  const srcDir = join(REPO_ROOT, 'skills');
  const dstDir = join(SRC_TEMPLATES, 'skills');
  await rm(dstDir, { recursive: true, force: true });
  await mkdir(dstDir, { recursive: true });
  const skills = await readdir(srcDir);
  for (const name of skills) {
    const srcSkill = join(srcDir, name, 'SKILL.md');
    const dstSkill = join(dstDir, `forge-${name}.md`);
    const content = await readFile(srcSkill, 'utf8');
    await writeFile(dstSkill, content, 'utf8');
  }
  console.log(`[copy-templates] synced ${skills.length} skills`);
}

// 同步 commands:repo-root/commands/<name>.md → src/core/templates/commands/<name>.md
async function syncCommands() {
  const srcDir = join(REPO_ROOT, 'commands');
  const dstDir = join(SRC_TEMPLATES, 'commands');
  await rm(dstDir, { recursive: true, force: true });
  await mkdir(dstDir, { recursive: true });
  const commands = await readdir(srcDir);
  for (const name of commands) {
    const srcCmd = join(srcDir, name);
    const dstCmd = join(dstDir, name);
    const content = await readFile(srcCmd, 'utf8');
    await writeFile(dstCmd, content, 'utf8');
  }
  console.log(`[copy-templates] synced ${commands.length} commands`);
}

await syncSkills();
await syncCommands();
```

- [ ] **Step 3**:跑 `pnpm build` 验证

```bash
pnpm build
# 预期:[copy-templates] synced 12 skills + [copy-templates] synced 6 commands + tsc 编译 src/
ls src/core/templates/skills/ | wc -l   # 应 12
ls src/core/templates/commands/ | wc -l # 应 6
```

- [ ] **Step 4**:Commit

```bash
git add scripts/copy-templates.mjs
git commit -m "refactor(scripts): copy-templates.mjs reverse sync (root skills/+commands/ → src/core/templates/)"
```

---

## Task 1.8:验证 5 个本地命令全绿

- [ ] **Step 1**:跑全套命令,确认 Plan 1 没破 v0.2 既有功能

```bash
pnpm typecheck    # tsc 编译 src/ + test/
pnpm lint         # eslint
pnpm format:check # prettier
pnpm build        # tsc + copy-templates.mjs
pnpm test         # vitest
```

预期:5 个命令全 exit 0。

- [ ] **Step 2**:若任一 FAIL,排查后修(可能 ESLint 对新 `.opencode/plugins/forge.js` 报警 → 加 .eslintignore 或 import 调整;prettier 对新 hooks/session-start 报 → 加 .prettierignore)。

- [ ] **Step 3**:Commit lint/format/ignore 的 patch(若有)

```bash
git add .eslintignore .prettierignore
git commit -m "chore(plan-1): ignore plugin bash scripts in lint/format checks"
```

---

## Task 1.9:本地 fixture 装 plugin 走 Plan 0b 准备

- [ ] **Step 1**:用 Plan 0a.1.4 验证过的形态在另一 fixture 项目装 plugin

```
/plugin marketplace add D:/ClaudeProject/opsp/forge-repo
/plugin install forge@accelerator-mzq-forge
/reload-plugins
```

- [ ] **Step 2**:重启 session 验证 SessionStart hook 注入 + 12 skills 进 auto-trigger

输入 "我想做个 X"(brainstorming 标准触发),看 AI 是否自动 invoke `Skill(forge:brainstorming)`。

**这是 Plan 0b.1 的 fast-track**:Plan 1 落地后立即在 Claude Code 测一次,**避免**Plan 2/3 完成后才发现 Plan 1 路径有问题。

- [ ] **Step 3**:cleanup junction(Plan 0a 验证过的 cleanup 脚本)

---

## Self-Review

**Spec 覆盖**:
- ✅ spec §1.1 文件结构 → Task 1.1-1.6 落地全部 manifest + skills + commands + hooks
- ✅ spec §2.5 hooks/ — Task 1.4 fork + Plan 0a.1.2 已 patch 跨平台脚本
- ✅ spec §2.2.3 OpenCode plugin — Task 1.3 default export 形态
- ✅ spec §1.2 single source of truth — Task 1.7 反向同步脚本
- ✅ spec §8 验收标准 4 "5 个本地命令全绿" — Task 1.8

**Placeholder scan**:无 TBD/TODO。所有命令含 expected output。

**Type consistency**:`forge` plugin name 在三 harness manifest + skills 引用 + hooks 内容一致。

**实操可行性**:除 Task 1.7 反向同步脚本是新写,其余 Task 1.1-1.6 都是按 spec 模板 + Plan 0a 验证过的实操形态写,风险低。

---

**Plan 1 完成,落地于** `docs/plans/2026-05-09-plan-1-repo-refactor.md`。

**unblock**:Plan 0b / Plan 2 / Plan 3 / Plan 5。

**已知限制**:
- v0.2 老 `forge init` 命令在 Plan 1 后仍 work(Task 1.7 反向同步保证 src/core/templates 仍有内容);Plan 4 加 deprecation warning + Plan 4/v0.4 移除
- skills/commands 内容本身未改(只是位置变),Plan 2/3 负责重构内容
