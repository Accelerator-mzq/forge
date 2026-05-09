# Plan 2 — skills 体系重构(P2/P3 修复 + 命名引用更新 + eval)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:重构 12 skills 体系 — P2 修复(brainstorming 加 git-aware)+ P3 修复(writing-plans 加 scale-aware mode + config schema)+ 10 skill 命名引用更新(去 `forge-` 前缀)+ skill eval 重跑确保不回归。

**Architecture**:在 Plan 1 落地的根 `skills/` 上原地修;P3 加 `forge/config.yaml#writing_plans.light_threshold` config schema(Plan 0a §5.1 假设 5 — 不属 spike,Plan 2 落地)+ snapshot fixture 验证 light/full mode 行为。eval 跑 `pnpm eval:skill brainstorming` + `pnpm eval:skill writing-plans` 全跑 + 其余 10 skill 跑 `pnpm eval:changed` 确认无回归。

**Tech Stack**:无新依赖。eval 沿用 v0.2 既有 `forge-eval/` 框架(Anthropic SDK + ANTHROPIC_API_KEY CI secret)。

**Spec 引用**:[`2026-05-09-v0.3-plugin-migration-design.md`](../specs/2026-05-09-v0.3-plugin-migration-design.md) §2.3(skills 重构清单)、§5.2(eval 责任)、§5.3(snapshot fixture)。

**前置**:Plan 1 完成(根 `skills/` 12 个 SKILL.md 已 cp)。

---

## File Structure(Plan 2 完成时改动)

```
skills/                                  ← Plan 1 已建,Plan 2 修内容
├── using-forge/SKILL.md                  ← 改:补红旗清单 + 6 commands 引用更新
├── brainstorming/SKILL.md                ← ★ P2 修复:加 git-aware 段
├── writing-plans/SKILL.md                ← ★ P3 修复:加 scale-aware mode + 引用 config
├── subagent-driven-development/SKILL.md  ← 命名引用更新(forge:apply → apply)
├── test-driven-development/SKILL.md      ← 同上
├── requesting-code-review/SKILL.md       ← 同上
├── receiving-code-review/SKILL.md        ← 同上
├── verification-before-completion/SKILL.md ← 同上
├── systematic-debugging/SKILL.md          ← 同上
├── dispatching-parallel-agents/SKILL.md   ← 同上
├── using-git-worktrees/SKILL.md           ← 同上
└── finishing-a-development-branch/SKILL.md ← 同上

src/core/schema/                          ← 加 config schema 字段
└── config.ts                             ← writing_plans.light_threshold: number(default 200)

src/core/templates/                       ← Plan 1 反向同步脚本自动更新

forge-eval/                                ← v0.2 既有,Plan 2 加 fixture
├── fixtures/
│   ├── brainstorming-empty-git-repo/      ← ★ NEW:空 git repo + 用户做 X → skill 询问
│   ├── writing-plans-trivial-change/      ← ★ NEW:trivial proposal → tasks.md ≤ 80 行
│   └── writing-plans-full-change/         ← ★ NEW:full proposal → tasks.md ≥ 200 行
└── ...

tests/
└── core/schema/config.test.ts             ← config 4 case(default / override / 非法 / 边界)
```

---

## Task 2.1:`brainstorming` skill 加 git-aware(P2 修复)

**Files:**
- Modify: `skills/brainstorming/SKILL.md`
- Test: `forge-eval/fixtures/brainstorming-empty-git-repo/`

- [ ] **Step 1**:Read 现有 `skills/brainstorming/SKILL.md`,定位 "draft 写完后 commit" 段

- [ ] **Step 2**:在 brainstorming 主流程前(skill body 顶部 / "Process Flow" 段后)加 git base 检测段

```markdown
## Pre-flight check — Git base assumption

Before committing any draft, verify the repo has a git base:

\`\`\`bash
git rev-parse HEAD 2>/dev/null && test -f .gitignore
\`\`\`

If either fails (no commits, or no `.gitignore`):
- **Do NOT silently commit the draft**
- Ask the user explicitly:"我注意到这是空 git repo / 缺 .gitignore。要不要先 git init + 加 .gitignore + first commit 再继续?"
- 用户确认后,帮 add `.gitignore`(标准 Node/Python/etc patterns)+ `git init` + first commit
- 用户拒绝后,不写 draft,提示 "brainstorming 流程需要 git base,请稍后再试"

This pre-flight prevents accidental commit to a half-initialized repo (P2 from v0.2 fixture testing).
```

- [ ] **Step 3**:写 eval fixture `forge-eval/fixtures/brainstorming-empty-git-repo/`

```yaml
# forge-eval/fixtures/brainstorming-empty-git-repo/scenario.yaml
name: brainstorming-empty-git-repo
description: P2 修复验证 — 空 git repo 触发 brainstorming,skill 应先问 git base 不静默 commit
setup:
  - run: mkdir /tmp/empty-fixture && cd /tmp/empty-fixture && git init -q
input: 我想做个 todo list 应用
assert:
  - skill_invoke: brainstorming
  - response_must_contain: "git init"  # 或 "git base" / "gitignore"
  - response_must_not_contain: "draft 已写"
  - file_must_not_exist: forge/drafts/*.md
```

- [ ] **Step 4**:跑 `pnpm eval:skill brainstorming` 全套 + 新 fixture

```bash
pnpm eval:skill brainstorming
# 预期:全部 PASS,含新 fixture(brainstorming-empty-git-repo)
```

- [ ] **Step 5**:Commit

```bash
git add skills/brainstorming/SKILL.md forge-eval/fixtures/brainstorming-empty-git-repo/
git commit -m "fix(skill): brainstorming P2 git-aware preflight (avoid silent commit on empty repo)"
```

---

## Task 2.2:`writing-plans` skill 加 scale-aware mode(P3 修复)

**Files:**
- Modify: `skills/writing-plans/SKILL.md`
- Modify: `src/core/schema/config.ts`(加 light_threshold 字段)
- Modify: `commands/propose.md`(加 `--light` flag)
- Create: `tests/core/schema/config.test.ts`
- Create: `forge-eval/fixtures/writing-plans-trivial-change/` 与 `writing-plans-full-change/`

### Sub-task 2.2.1:Config schema

- [ ] **Step 1**:Read `src/core/schema/config.ts`(v0.2 既有)

- [ ] **Step 2**:加 `writing_plans` 段

```ts
// src/core/schema/config.ts(片段)
export interface ForgeConfig {
  // ... v0.2 字段(context / rules / code_paths)保留 ...

  writing_plans?: {
    /** Trivial change 阈值:proposal 行数 < light_threshold → light mode(1-2 task,跳 RED/GREEN/REFACTOR) */
    light_threshold?: number; // 默认 200
  };
}

export const CONFIG_DEFAULTS = {
  writing_plans: {
    light_threshold: 200,
  },
};
```

- [ ] **Step 3**:加 zod schema 校验(继承 v0.2 zod 体系)

```ts
import { z } from 'zod';

export const writingPlansSchema = z.object({
  light_threshold: z
    .number()
    .int()
    .positive()
    .default(200)
    .refine((n) => n >= 50 && n <= 2000, {
      message: 'light_threshold 必须 50-2000 行(50 太激进会误判;2000 失去 light mode 意义)',
    }),
});
```

- [ ] **Step 4**:写 4 case 单测 `tests/core/schema/config.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { writingPlansSchema } from '../../src/core/schema/config.js';

describe('writing_plans config schema', () => {
  it('default fallback to 200', () => {
    const parsed = writingPlansSchema.parse({});
    expect(parsed.light_threshold).toBe(200);
  });

  it('user override accepted', () => {
    const parsed = writingPlansSchema.parse({ light_threshold: 100 });
    expect(parsed.light_threshold).toBe(100);
  });

  it('rejects non-integer', () => {
    expect(() => writingPlansSchema.parse({ light_threshold: 100.5 })).toThrow();
  });

  it('rejects out-of-range (49 太小)', () => {
    expect(() => writingPlansSchema.parse({ light_threshold: 49 })).toThrow(/50-2000/);
  });

  it('rejects out-of-range (2001 太大)', () => {
    expect(() => writingPlansSchema.parse({ light_threshold: 2001 })).toThrow(/50-2000/);
  });
});
```

- [ ] **Step 5**:跑测试 PASS

```bash
pnpm test src/core/schema/config.test.ts
# 预期:5 个 test 全 PASS
```

### Sub-task 2.2.2:writing-plans skill 内嵌 scale-aware 逻辑

- [ ] **Step 1**:Read `skills/writing-plans/SKILL.md`,定位"5 task RED/GREEN/REFACTOR 强制"段

- [ ] **Step 2**:加 scale-aware mode 段(skill body 顶部 / Process Flow 前)

```markdown
## Scale-aware mode (P3 fix)

Before generating tasks, count `proposal.md` line count and check `forge/config.yaml#writing_plans.light_threshold`(default 200):

- **Light mode**(proposal 行数 < threshold 或 `/forge:propose --light`):产 1-2 task,**跳过** RED/GREEN/REFACTOR 三段强约束;tasks.md ≤ 80 行
- **Full mode**(proposal 行数 >= threshold,默认):走 v0.2 完整模板(5+ task,RED/GREEN/REFACTOR 强约束);tasks.md ≥ 200 行

判定逻辑(skill body 内):
1. 调 `node ${PLUGIN_HELPER}/run-forge.mjs` 读 `forge/config.yaml` 拿 `writing_plans.light_threshold`(默认 200,非法值 fallback 200 + stderr warn)
2. 跑 `wc -l forge/changes/<id>/proposal.md` 拿行数
3. 若 `--light` flag 显式传 → light mode(覆盖 threshold)
4. 否则按 threshold 判定

This prevents v0.2 P3 (trivial change → 511 行 tasks.md) regression.
```

- [ ] **Step 3**:Modify `commands/propose.md` 加 `--light` flag 支持

(因为 commands 是 markdown 模板给 AI 用,`--light` 是 AI 解析的 flag,不是真 CLI flag)

```markdown
# /forge:propose <change-id> [--from-draft <name>] [--light]

If user passes `--light`, force light mode in writing-plans skill (override config threshold).
```

- [ ] **Step 4**:跑 `pnpm eval:skill writing-plans` + 新 fixture

```bash
pnpm eval:skill writing-plans
# 预期:含 trivial-change(light mode 验)+ full-change(full mode 验)
```

### Sub-task 2.2.3:eval fixture

- [ ] **Step 1**:写 `forge-eval/fixtures/writing-plans-trivial-change/scenario.yaml`

```yaml
name: writing-plans-trivial-change
description: P3 修复验证 — trivial proposal(< 200 行)→ light mode → tasks.md ≤ 80 行
setup:
  - file: forge/changes/test/proposal.md
    content: |
      # Add priority field
      Add priority field to todo schema.
      ## Why: user request
      ## What: 1 type field, 1 CLI flag
input: |
  从 forge/changes/test/proposal.md 起 writing-plans 流程
assert:
  - skill_invoke: writing-plans
  - file_max_lines:
      path: forge/changes/test/tasks.md
      lines: 80
  - file_must_contain:
      path: forge/changes/test/tasks.md
      patterns: ["Task 1"]   # 至少 1 task
  - file_must_not_contain:
      path: forge/changes/test/tasks.md
      patterns: ["RED", "GREEN", "REFACTOR"]   # light mode 跳三段强约束
```

- [ ] **Step 2**:写 `forge-eval/fixtures/writing-plans-full-change/scenario.yaml`(对偶 — full mode)

```yaml
name: writing-plans-full-change
description: full proposal(>= 200 行)→ full mode → tasks.md >= 200 行 + 含 RED/GREEN/REFACTOR
setup:
  - file: forge/changes/big-feature/proposal.md
    # 200+ 行 proposal 模板
input: |
  从 forge/changes/big-feature/proposal.md 起 writing-plans
assert:
  - skill_invoke: writing-plans
  - file_min_lines:
      path: forge/changes/big-feature/tasks.md
      lines: 200
  - file_must_contain:
      path: forge/changes/big-feature/tasks.md
      patterns: ["RED", "GREEN", "REFACTOR"]
```

- [ ] **Step 3**:跑两 fixture PASS,Commit

```bash
git add skills/writing-plans/SKILL.md src/core/schema/config.ts tests/core/schema/config.test.ts forge-eval/fixtures/writing-plans-* commands/propose.md
git commit -m "fix(skill): writing-plans P3 scale-aware mode (light_threshold config + --light flag, snapshot fixtures)"
```

---

## Task 2.3:10 skill 命名引用更新

**Files:**
- Modify(只改引用): 10 个 SKILL.md
  - `subagent-driven-development`
  - `test-driven-development`
  - `requesting-code-review`
  - `receiving-code-review`
  - `verification-before-completion`
  - `systematic-debugging`
  - `dispatching-parallel-agents`
  - `using-git-worktrees`
  - `finishing-a-development-branch`
  - `using-forge`(顺带改)

**改动范围**(纯文本 patch,不改行为):
- `forge:brainstorming` → `brainstorming`(plugin namespace 已隐含 forge:)
- `forge:apply` → `apply`(skill 内引用其他 skill 时,不带 plugin 前缀)
- `forge:writing-plans` → `writing-plans`
- 等等

**注意**:command 文件名(`/forge:brainstorm` slash)**保留** `forge:` 前缀(那是 Claude Code plugin namespace 的真实 slash 形态),不改。

- [ ] **Step 1**:跑 grep 列所有 forge: 引用

```bash
grep -rn "forge:" skills/ | grep -v "forge:propose\|forge:archive\|forge:apply\|forge:review\|forge:verify\|forge:brainstorm" | head -30
```

(列出所有 skill 内非 commands 的 forge: 引用,这些是要改的)

- [ ] **Step 2**:逐 skill 改

每 skill 跑:
```bash
sed -i 's/forge:brainstorming/brainstorming/g;
        s/forge:writing-plans/writing-plans/g;
        s/forge:subagent-driven-development/subagent-driven-development/g;
        s/forge:test-driven-development/test-driven-development/g;
        s/forge:requesting-code-review/requesting-code-review/g;
        s/forge:receiving-code-review/receiving-code-review/g;
        s/forge:verification-before-completion/verification-before-completion/g;
        s/forge:systematic-debugging/systematic-debugging/g;
        s/forge:dispatching-parallel-agents/dispatching-parallel-agents/g;
        s/forge:using-git-worktrees/using-git-worktrees/g;
        s/forge:finishing-a-development-branch/finishing-a-development-branch/g' \
  skills/<skill-name>/SKILL.md
```

(批处理脚本:遍历 12 skill 跑同一个 sed)

- [ ] **Step 3**:跑 `pnpm eval:changed`(只跑改动的 skill)

```bash
pnpm eval:changed
# 预期:10 个 skill 命名引用 patch 后行为不回归
```

- [ ] **Step 4**:Commit

```bash
git add skills/
git commit -m "refactor(skills): drop forge- prefix in cross-skill references (plugin namespace already implicit)"
```

---

## Task 2.4:`using-forge` skill 红旗清单更新

**Files:**
- Modify: `skills/using-forge/SKILL.md`

**目的**:把 v0.2 P0 教训("项目级 skill 不进 auto-trigger 池")写进 using-forge body,但不再作为 v0.3 已知问题(Plan 0a 实测 PASS)— 改成"v0.3 plugin 路径下 skill 真进 auto-trigger 池(spike 验证)"的事实表述。

- [ ] **Step 1**:Read `skills/using-forge/SKILL.md`,改红旗清单

```markdown
## How forge skills auto-trigger (v0.3 plugin path)

When you start a session with forge plugin installed, the SessionStart hook injects this `using-forge` skill content into your system prompt. Plus, all 12 forge skills are registered in your auto-trigger pool — when a user input matches a skill description trigger, you MUST invoke the skill.

**Verified protocols (Plan 0a spike, 2026-05-09)**:
- Claude Code:hook + skill auto-trigger + `/<plugin>:<cmd>` commands all PASS
- Codex:skill auto-trigger PASS;`/forge:*` slash commands NOT supported (use skill 内嵌 fenced bash + must-execute)
- OpenCode:transform hook + skills.paths discovery PASS;`/forge:*` slash commands NOT supported (same as Codex)

The 12 forge skills(this list mirrors `commands/` for entry points):

- `brainstorming` — `/forge:brainstorm` 入口(Claude Code only;OpenCode/Codex 用模糊需求自动触发)
- `writing-plans` — `/forge:propose` 入口
- ... (其余 10 skill)
```

- [ ] **Step 2**:跑 `pnpm eval:skill using-forge`

- [ ] **Step 3**:Commit

```bash
git add skills/using-forge/SKILL.md
git commit -m "docs(skill): using-forge update red-flag list to v0.3 plugin verified state"
```

---

## Task 2.5:全套 eval 跑 + 5 个本地命令验证

- [ ] **Step 1**:`pnpm eval`(全 12 skill eval)

```bash
ANTHROPIC_API_KEY=<...> pnpm eval
# 预期:12 skill 全 PASS;新 fixture(brainstorming git-aware + writing-plans 双模式)PASS
```

- [ ] **Step 2**:5 个本地命令

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
# 预期:全 0
```

- [ ] **Step 3**:Commit eval results 归档(仿 v0.2 acceptance test 风格)

```bash
git add forge-eval/results/$(date +%Y-%m-%d)-plan-2.md
git commit -m "test(eval): Plan 2 skill eval results archive"
```

---

## Self-Review

**Spec 覆盖**:
- ✅ §2.3 P2 修复(brainstorming git-aware) → Task 2.1
- ✅ §2.3 P3 修复(writing-plans scale-aware + light_threshold config) → Task 2.2
- ✅ §2.3 10 skill 命名引用更新 → Task 2.3
- ✅ §5.2 eval 责任(brainstorming + writing-plans 全跑;其余 changed 跑) → Task 2.5
- ✅ §5.3 snapshot fixture 验证 → Task 2.2.3

**Placeholder scan**:Step 内 expected output 全实写,无 TBD。

**Type consistency**:`light_threshold` 在 schema / fixture / skill body 三处一致;`forge:` 前缀去除规则统一(skill 间引用去前缀,commands slash 保留)。

**已知风险**:
- skill 文本改动 + eval 重跑可能发现 skill 行为微调(superpowers 移植后本地化触发新 edge case),实施时可能需要多轮 eval iter — 这是行为塑造内容的固有特征,不阻塞 plan
- P2/P3 修复属于 superpowers `brainstorming` / `writing-plans` 行为塑造内容微调,严守"修一个加一个 fixture"原则,避免回归

---

**Plan 2 完成,落地于** `docs/plans/2026-05-09-plan-2-skills-refactor.md`。

**unblock**:Plan 5(eval 通过 → release-gate 解锁)。
