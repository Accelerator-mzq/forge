# Plan 3 — commands 重构(Tier 1 调 helper + Tier 2/3 内化到 skill)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:重构 6 commands — Tier 1(Claude Code)路径 commands.md 调 plugin helper `${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs`(避开 P1 全局 PATH);Tier 2(OpenCode)+ Tier 3(Codex)plugin commands 不被注册(Plan 0a 实测确认),把 commands 内容**内化到对应 skill 文本** + skill 末尾加 fenced bash + must-execute 让 AI 主动跑 helper(Plan 0a Variant B/C 实测 PASS 路径)。

**Architecture**:`scripts/run-forge.mjs` 作为单点 helper,内部 spawn `npx -y --package @accelerator-mzq/forge@^0.3 -- forge ...`;Tier 1 commands.md 调 helper;Tier 2/3 把 commands.md 内容塞进各自对应 skill body 末尾(brainstorm → brainstorming skill,propose → writing-plans skill,etc)。

**Tech Stack**:Node 20+(child_process.spawn);Windows 兼容 `npx.cmd`(Plan 0a 已实测路径)。

**Spec 引用**:[`2026-05-09-v0.3-plugin-migration-design.md`](../specs/2026-05-09-v0.3-plugin-migration-design.md) §2.4(commands 重构清单 + OpenCode/Codex 替代设计)、§4.2(helper 形态)。

**前置**:Plan 1 完成(根 `commands/` 6 个 + `scripts/`);Plan 2 完成(skills 文本可改 — Plan 3 给 skill 末尾追加 fenced bash 段)。

---

## File Structure(Plan 3 完成时改动)

```
commands/                                ← Plan 1 已建,Plan 3 改内容(Tier 1 用)
├── brainstorm.md                        ← 改:调 Skill(brainstorming)(无 helper 调用)
├── propose.md                           ← 改:调 Skill(writing-plans) + helper validate
├── apply.md                             ← 改:调多 skill
├── review.md                            ← 改:调 Skill(requesting/receiving-code-review)
├── verify.md                            ← 改:helper validate + 失败时 append tasks.md
└── archive.md                           ← 改:helper archive(严格门禁)

scripts/
└── run-forge.mjs                        ← ★ NEW(plugin helper,Plan 0a §4.2 形态)

skills/                                  ← Plan 3 在 skill body 末尾追加 fenced bash + must-execute
├── brainstorming/SKILL.md                ← 不加(brainstorming 不调 forge CLI)
├── writing-plans/SKILL.md                ← 加 validate-step 段
├── verification-before-completion/SKILL.md ← 加 verify-step 段
├── ...(其余视 commands.md 调 forge CLI 的对应 skill)
```

---

## Task 3.1:`scripts/run-forge.mjs` plugin helper

**Files:**
- Create: `scripts/run-forge.mjs`(在 forge 仓库根 scripts/,Plan 5 bundled 时被改写)

- [ ] **Step 1**:写 helper(Plan 0a §4.2 形态,加 Windows `npx.cmd` 兼容)

```js
// scripts/run-forge.mjs(plugin tarball 内,不在 npm 包里)
// 调用形态:
//   - Claude Code:`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs validate <id>`
//   - OpenCode:`node <plugin_dir>/scripts/run-forge.mjs validate <id>`
//   - Codex:`node ~/.codex/forge/scripts/run-forge.mjs validate <id>`
// bundled 变体:Plan 5 build 期 patch,REQUIRED_RANGE 段改内嵌 dist/cli/index.js spawn

import { spawn } from 'node:child_process';

const REQUIRED_RANGE = '^0.3'; // 由 build 期注入,与 plugin 版本同步

const args = process.argv.slice(2);

// Windows: spawn 找不到 'npx',需 'npx.cmd';macOS/Linux 走 'npx'
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const child = spawn(
  npxBin,
  ['-y', '--package', `@accelerator-mzq/forge@${REQUIRED_RANGE}`, '--', 'forge', ...args],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',  // Windows 下 shell:true 解析 npx.cmd PATH
  },
);

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error(`run-forge: failed to spawn npx — ${err.message}`);
  console.error(`需 Node 20+ 与 npm 7+ 在 PATH;或装 forge-bundled plugin 离线变体`);
  process.exit(127);
});
```

- [ ] **Step 2**:本地测试 `node scripts/run-forge.mjs --version`

```bash
node scripts/run-forge.mjs --version
# 预期:输出 forge --version(npx 拉 @accelerator-mzq/forge@^0.3 → 跑 forge --version)
# 首次 npx 拉 ~5s,缓存后 0
```

- [ ] **Step 3**:Commit

```bash
git add scripts/run-forge.mjs
git commit -m "feat(plugin): scripts/run-forge.mjs helper (cross-platform npx spawn)"
```

---

## Task 3.2:重构 6 commands(Tier 1 commands.md)

**Files:**
- Modify: `commands/{brainstorm,propose,apply,review,verify,archive}.md`

按 spec §2.4 表格改:

### 3.2.1 `commands/brainstorm.md`

```markdown
---
description: Brainstorm a feature idea and produce a draft (forge spec-driven workflow)
---

# /forge:brainstorm <topic>

Use the `brainstorming` skill (forge spec-driven workflow). The skill handles:
- Pre-flight git base check (P2 fix)
- Question-by-question dialog
- Write draft to `forge/drafts/<date>-<topic>.md`
- Commit if user confirms

**Invoke**:`Skill(brainstorming)`(plugin namespace `forge:` implicit)
```

(其余 commands 同模式 — 调对应 skill,不裸调 forge CLI)

### 3.2.2 `commands/propose.md`

```markdown
---
description: Propose a change from a draft (writing-plans skill + validate)
---

# /forge:propose <change-id> [--from-draft <name>] [--light]

Use the `writing-plans` skill, then validate the artifact.

1. Read `forge/drafts/<name>.md` (if --from-draft passed)
2. Skill `writing-plans`:
   - Detect proposal scale (light_threshold from forge/config.yaml, default 200)
   - If `--light` flag: force light mode
   - Generate `forge/changes/<change-id>/{proposal,specs,design,tasks}.md`
3. Validate (Tier 1 路径调 helper):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" validate <change-id>
   ```
   Expect exit 0 + "validation OK" output.
   If exit non-zero,把 stderr 转给用户,**不要继续 archive 流程**。
```

### 3.2.3 `commands/apply.md`

```markdown
---
description: Apply tasks via subagent-driven development with TDD
---

# /forge:apply [--parallel]

Use `subagent-driven-development` skill (forge spec-driven workflow).

1. Read `forge/changes/<id>/tasks.md`
2. Skill `subagent-driven-development`:
   - 逐 task 派 fresh subagent
   - 每 task 走 Skill `test-driven-development`(red → green → refactor)
   - `--parallel` flag → 加调 `dispatching-parallel-agents` + `using-git-worktrees`
3. Skill `systematic-debugging` 自动触发(若 subagent 跑出 bug)
```

### 3.2.4 `commands/review.md`

```markdown
---
description: Run code review with subagent + main agent feedback loop
---

# /forge:review

Use `requesting-code-review` (派审查 subagent) + `receiving-code-review` (主代理处理反馈).

1. Skill `requesting-code-review`:派 fresh review subagent → 列改动 + commit history → 报 issue 清单
2. 主代理 Skill `receiving-code-review`:逐 issue 处理(技术验证 + 接受 / 反驳 / 修)
3. 若所有 issue 接受 + 实现 → 写 `.review-passed`(spec §3.4 hash 绑定)
4. 若有未解决 issue → 不写 marker,提示用户继续
```

### 3.2.5 `commands/verify.md`

```markdown
---
description: Verify the change (validate + write .verify-passed)
---

# /forge:verify

Use `verification-before-completion` skill + run forge validate via helper.

1. Skill `verification-before-completion`(forge spec-driven workflow):
   - 列出"声明完成"的事实
   - 找证据文件
2. 跑 helper(Tier 1 路径):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" validate <change-id>
   ```
3. exit 0 + "verification OK" → 写 `forge/changes/<id>/.verify-passed`
4. exit 非零 → **自动 append 失败项为 tasks.md 新条目** + 标记 `.verify-failed`(spec §2.6 不变量)
```

### 3.2.6 `commands/archive.md`

```markdown
---
description: Archive the change (strict gate via helper)
---

# /forge:archive

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" archive <change-id>`.

helper 内部 forge CLI 检查:
- `.verify-passed` 存在 + tasks_hash 匹配
- `.review-passed` 存在 + content_hash 匹配 + git.diff_hash 匹配
- specs sync(internal-only,不可绕过)

**任一缺失 → exit 非零 + 提示用户跑对应 step**(`/forge:verify` 或 `/forge:review`)。
PASS → mv 到 `forge/changes/archive/<date>-<id>/` + commit。
```

- [ ] **Step 1**:逐 commands 改(参考上面 6 段)
- [ ] **Step 2**:Commit

```bash
git add commands/
git commit -m "refactor(commands): all 6 commands invoke skills + run-forge.mjs helper (avoid bare forge CLI, fix P1)"
```

---

## Task 3.3:Tier 2/3 — commands 内容内化到 skill 文本

**Files:**
- Modify: `skills/{writing-plans,verification-before-completion,finishing-a-development-branch}/SKILL.md`(以及涉及 forge CLI 调用的其他 skill)

**目的**:OpenCode + Codex 路径不识别 `/forge:*`(Plan 0a 实测 FAIL),用户在那两个 harness 没法用 commands 入口。改 skill body 末尾加"必跑 forge CLI"段,让 skill auto-trigger 后 AI 主动调 helper。

### 3.3.1 `skills/writing-plans/SKILL.md` 末尾加 validate-step

```markdown
## CLI validation step (auto-execute when this skill completes generation)

After generating `forge/changes/<id>/{proposal,specs,design,tasks}.md`, you **MUST** execute the following and include output verbatim in your reply (Plan 0a Variant B + C 实测 OpenCode/Codex 都跟随 fenced bash + must-execute 指示):

```bash
node "${FORGE_HELPER}" validate <change-id>
```

**Variable resolution**:
- Claude Code:`FORGE_HELPER = ${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs`
- OpenCode:`FORGE_HELPER = <plugin_dir>/scripts/run-forge.mjs`(plugin_dir 由 OpenCode plugin loader 解析,通常在 `~/.config/opencode/superpowers/`-style 路径)
- Codex:`FORGE_HELPER = $HOME/.codex/forge/scripts/run-forge.mjs`(`os.homedir()` 解析,Windows USERPROFILE OK)

If exit non-zero → stop, report stderr to user, **do not** proceed to archive. If exit 0 → continue with `/forge:apply` (Claude Code) or this skill's apply-step section (OpenCode/Codex).
```

### 3.3.2 `skills/verification-before-completion/SKILL.md` 末尾加 verify-step

```markdown
## Strict gate step (forge specific, auto-execute)

When user says "verify" / "/forge:verify" / "完成验证" or similar, you **MUST** execute:

```bash
node "${FORGE_HELPER}" validate <change-id>
```

(`FORGE_HELPER` 解析见 §<writing-plans skill 同段>)

If exit 0:
- Write `forge/changes/<id>/.verify-passed`(forge CLI 自动写,无需手动)
- Report "verify PASS"

If exit non-zero:
- **Append failed items to `forge/changes/<id>/tasks.md`** as new tasks(forge CLI 自动 append + 标 `.verify-failed`)
- Tell user "Verify FAIL,请处理新 tasks 后重跑"
```

### 3.3.3 `skills/finishing-a-development-branch/SKILL.md` 末尾加 archive-step

```markdown
## Archive step (forge specific, auto-execute when finishing)

When user says "archive" / "/forge:archive" / "完成归档" or similar, you **MUST** execute:

```bash
node "${FORGE_HELPER}" archive <change-id>
```

forge CLI 内部严格门禁:
- `.verify-passed` + `.review-passed` 存在 + hash 匹配
- 任一缺失 → exit 非零 + 提示

If exit 0 → mv 到 `forge/changes/archive/`,Tell user "Archive PASS"。
If exit 非零 → 报 stderr,**不**重试,提示用户跑缺失 step。
```

- [ ] **Step 1**:逐 skill 改(3 处:writing-plans / verification-before-completion / finishing-a-development-branch)
- [ ] **Step 2**:跑 eval(改了 skill 文本要重跑)

```bash
pnpm eval:skill writing-plans
pnpm eval:skill verification-before-completion
pnpm eval:skill finishing-a-development-branch
```

- [ ] **Step 3**:Commit

```bash
git add skills/
git commit -m "feat(skill): embed forge CLI invocation in skill body (OpenCode/Codex commands replacement, Plan 0a Variant B/C path)"
```

---

## Task 3.4:本地 fixture 验证(Plan 0b 准备)

- [ ] **Step 1**:跑 Plan 0a.1.4 验证过的 Claude Code fixture 路径,装 forge plugin

```
/plugin marketplace add D:/ClaudeProject/opsp/forge-repo
/plugin install forge@accelerator-mzq-forge
/reload-plugins
```

- [ ] **Step 2**:在 fixture 内跑 `/forge:propose <id>`(假 change),验证 helper 调用

预期:commands.md 调 `node ${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs validate <id>`,helper 内部 spawn npx 拉 forge,跑 validate。

- [ ] **Step 3**:cleanup

---

## Task 3.5:5 个本地命令 + eval 全跑

- [ ] **Step 1**:`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test` 全 0
- [ ] **Step 2**:`pnpm eval` 全 PASS(skills 改了文本 + Plan 2 fixture 也要复跑)
- [ ] **Step 3**:Commit eval results

---

## Self-Review

**Spec 覆盖**:
- ✅ §2.4 commands 重构表 → Task 3.2 6 个 commands 改完
- ✅ §2.4 OpenCode + Codex 替代设计 → Task 3.3 skill body 内化
- ✅ §4.2 run-forge.mjs helper(Windows npx.cmd 兼容) → Task 3.1
- ✅ §4.4 失败语义("verify 失败 → append tasks.md") → Task 3.2.5 + 3.3.2

**Placeholder scan**:`<change-id>` / `<topic>` 是 commands 模板必要变量,实施时由 AI 解析,不是 plan 占位。

**Type consistency**:`FORGE_HELPER` 变量在三 harness 解析规则统一(§2.4 已定义);commands.md 内 `${CLAUDE_PLUGIN_ROOT}` 与 skill body 内 `FORGE_HELPER` 都指向 `scripts/run-forge.mjs`。

**已知风险**:
- Plan 3 改 skill body 末尾加 fenced bash,Plan 0a Variant B/C 已实测 OpenCode + Codex 都跟随 — 但**真业务流程下 AI 是否仍然主动跑 helper**(vs 跳过 / 提示用户) 需要 Plan 0b full fixture spike 回归验证
- helper `npx -y` 首次拉 forge 包延迟 ~5s,Plan 5 bundled plugin 是离线 fallback

---

**Plan 3 完成,落地于** `docs/plans/2026-05-09-plan-3-commands-refactor.md`。

**unblock**:Plan 5(bundled plugin 用 helper 形态)、Plan 0b(forge full fixture 验证)。
