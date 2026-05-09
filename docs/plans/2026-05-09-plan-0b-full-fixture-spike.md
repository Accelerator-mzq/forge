# Plan 0b — forge Full Plugin Fixture Spike 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。
>
> **Plan 0b 是 Plan 1 完成后的回归 spike** — 用 forge 真业务内容(12 skill + 6 commands + hooks + manifest)替换 Plan 0a 的 throwaway test plugin,跑一次 happy path acceptance test,确保 Plan 0a 协议假设在 forge 业务规模下不回归。

**Goal**:在 Plan 1 落地的 forge plugin scaffold 上装 plugin → fresh 项目起 session → 用户输入"我想做个 X"→ AI 自动 trigger `brainstorming` skill → 写 `forge/drafts/<date>-X.md` → 跑 `/forge:propose` 等 commands → 验证 forge happy path 全 PASS。

**Architecture**:复用 Plan 0a 验证过的协议(Tier 1 hook+skill+commands,Tier 2/3 skills + skill 内嵌 fenced bash);唯一新变量是"forge 真业务内容能否在三 harness 上跑通"(throwaway test plugin → forge 真 plugin)。

**Tech Stack**:与 Plan 0a 相同(Node 20+,bash 4+,三 harness CLI)。

**Spec 引用**:[`docs/specs/2026-05-09-v0.3-plugin-migration-design.md`](../specs/2026-05-09-v0.3-plugin-migration-design.md) §5.1 阶段 2 + §8 验收标准 1。

**前置**:Plan 1 完成(forge `.claude-plugin/`,`.codex-plugin/`,`.opencode/plugins/`,`skills/`,`commands/`,`hooks/` scaffold 全部落地)。

---

## File Structure

```
spike/v0.3/
├── 0a-*/                       ← Plan 0a 产物(已 commit,不动)
└── 0b-claude-code/
    └── RESULTS.md              ← 0b.1 Claude Code full fixture
└── 0b-codex/
    └── RESULTS.md              ← 0b.2 Codex full fixture
└── 0b-opencode/
    └── RESULTS.md              ← 0b.3 OpenCode full fixture
```

**Plan 0b 不创建新 plugin scaffold** — 直接装 Plan 1 落地的 forge plugin。spike 产物只是 RESULTS.md 三份。

---

## Task 0b.1:Claude Code full fixture(Tier 1)

**Files:**
- Create: `spike/v0.3/0b-claude-code/RESULTS.md`

**前置**:Plan 1 完成(forge `.claude-plugin/{plugin.json,marketplace.json}` + `skills/` 12 个 + `commands/` 6 个 + `hooks/` 全部落地)。

- [ ] **Step 1**:fresh fixture 项目隔离 HOME(参考 Plan 0a Task 0a.1.4 Step 1 + cleanup_claude trap 形态)

- [ ] **Step 2**:装 forge plugin(Transport A,Plan 0a.1.3 已实测 PASS)

```
/plugin marketplace add D:/ClaudeProject/opsp/forge-repo
/plugin install forge@accelerator-mzq-forge
/reload-plugins
```

- [ ] **Step 3**:重启 session,验证 `using-forge` SessionStart hook 注入 + 12 skills 进 auto-trigger 池

输入触发短语(用 forge 标准 brainstorming 触发):
```
我想做个 todo list 应用
```

**预期**:AI 自动 invoke `Skill(forge:brainstorming)`,按 brainstorming SKILL.md 流程引导(问问题 → 设计 → 询问后写 draft)。

**对照 Plan 0a 行为**:throwaway test plugin 用 spike-specific marker;此处用 forge 真 brainstorming 流程,无 marker echo,但**skill 的 ask-questions 行为是硬证据**(模型按 skill 文本走流程而不是直接写代码)。

- [ ] **Step 4**:走完整 happy path(brainstorm → propose → apply → review → verify → archive)

逐一跑(每步贴 transcript):
- AI 写 `forge/drafts/<date>-todo-list.md` → 用户 review 通过
- `/forge:propose add-todo --from-draft <date>-todo-list` → 产 `forge/changes/add-todo/{proposal,specs,design,tasks}.md`
- `/forge:apply` → AI 派子代理跑 TDD 实施每个 task(skill 内化 subagent-driven-development)
- `/forge:review` → 派 review subagent + 主代理处理反馈
- `/forge:verify` → 跑 `node ${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs validate add-todo`,产 `.verify-passed`
- `/forge:archive` → 跑 `node ${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs archive add-todo`,严格门禁通过 + mv 到 `forge/changes/archive/`

- [ ] **Step 5**:Cleanup + 写 RESULTS.md

```markdown
# Plan 0b.1 — Claude Code Full Fixture Spike 结果

| Step | 假设 | 结论 | 证据 |
|---|---|---|---|
| 3 | brainstorming auto-trigger + ask questions | PASS/FAIL | transcript |
| 4.1 | propose 产全套 4 文件 | PASS/FAIL | ls forge/changes/add-todo/ |
| 4.2 | apply 派 subagent 跑 TDD | PASS/FAIL | transcript + commit log |
| 4.3 | review 派 subagent | PASS/FAIL | transcript |
| 4.4 | verify 严格门禁 + .verify-passed | PASS/FAIL | cat forge/changes/add-todo/.verify-passed |
| 4.5 | archive 严格校验 + mv | PASS/FAIL | ls forge/changes/archive/ |
```

**Tier 1 release 阻塞**:Step 3 任一 FAIL → release v0.3 暂停,回 Plan 2 (skills 重构) 或 Plan 3 (commands) 修。

---

## Task 0b.2:Codex full fixture(Tier 3 PARTIAL_SHIP)

**Files:**
- Create: `spike/v0.3/0b-codex/RESULTS.md`

**前置**:Plan 1 完成 + Plan 3 完成(skill 内嵌 fenced bash 内容已落地 — 替代 Codex 不可用的 commands)。

- [ ] **Step 1**:用 Plan 0a.2 验证过的形态装 forge plugin(symlink 到日常 ~/.agents/skills/forge,**无 USERPROFILE 隔离** — 实测 Codex 不继承)

```powershell
cmd /c mklink /J "$env:USERPROFILE\.agents\skills\forge" "D:\ClaudeProject\opsp\forge-repo\skills"
npm i -g @accelerator-mzq/forge@^0.3
```

- [ ] **Step 2**:起 codex session,输入 "我想做个 todo list 应用"

**预期**:AI 自动 invoke forge brainstorming skill(Plan 0a.2 已验证 skill auto-trigger work)。

- [ ] **Step 3**:走 happy path,**关键观察 — AI 是否按 skill 内嵌 fenced bash + must-execute 主动跑 helper**

每个 skill(brainstorming / writing-plans / verify-step / archive-step 等)末尾都会有"必须跑 `node ~/.codex/forge/scripts/run-forge.mjs <subcmd> <args>`"指示(Plan 3 落地)。

观察:AI 是否真按指示跑 PowerShell helper + 把输出报回(Plan 0a.2 Variant B/C 已验证可行)。

- [ ] **Step 4**:Cleanup junction + 写 RESULTS.md(同 0b.1 模板)

**Tier 3 PARTIAL_SHIP 阻塞**:Step 3 任一 FAIL → spec §3.4 修订(替换 fenced bash 路径)或 Codex Tier 3 退化到"只 skills 不调 CLI",严格门禁靠 forge CLI 走外部跑。

---

## Task 0b.3:OpenCode full fixture(Tier 2 PARTIAL_SHIP)

**Files:**
- Create: `spike/v0.3/0b-opencode/RESULTS.md`

**前置**:Plan 1 完成 + Plan 3 完成。

- [ ] **Step 1**:用 Plan 0a.3 验证过的 Path A(opencode.json plugin 数组)装 forge plugin(隔离 OPENCODE_CONFIG_DIR,Plan 0a.3 实测 OpenCode 继承)

```powershell
$env:OPENCODE_CONFIG_DIR = "$env:TEMP\forge-fixture-opencode\.config\opencode"
@'
{
  "plugin": [
    "forge@file:D:/ClaudeProject/opsp/forge-repo"
  ]
}
'@ | Set-Content "$env:OPENCODE_CONFIG_DIR\opencode.json"
```

- [ ] **Step 2**:起 opencode session,输入 "我想做个 todo list 应用"

**预期**:AI 自动 invoke forge brainstorming skill(Plan 0a.3 已验证 transform hook 注入 + skills.paths discovery work)。

- [ ] **Step 3**:走 happy path(同 0b.2,skill 内嵌 fenced bash 跑 helper)

- [ ] **Step 4**:Cleanup + 写 RESULTS.md

**Tier 2 PARTIAL_SHIP 阻塞**:同 Tier 3。

---

## Task 0b.4:三 harness fixture 汇总

**Files:**
- Update: `spike/v0.3/0a-summary.md`(追加 0b 结果段,不新建 0b-summary.md;复用 0a 决策矩阵格式)

- [ ] **Step 1**:扫三份 0b RESULTS.md 关键结论
- [ ] **Step 2**:更新 `0a-summary.md` 加段:

```markdown
## Plan 0b 三 harness full fixture 结果(forge 业务内容回归测试)

| Tier | Harness | Plan 0a (协议) | Plan 0b (full fixture) | 是否回归 |
|---|---|---|---|---|
| 1 | Claude Code | PASS | ? | ? |
| 2 | OpenCode | PARTIAL_SHIP | ? | ? |
| 3 | Codex | PARTIAL_SHIP | ? | ? |
```

- [ ] **Step 3**:任一 Tier 0b 回归(Plan 0a PASS 但 Plan 0b FAIL) → 立即 Edit spec 对应章节;此处不能让 v0.3 release 期 plan 1+ 拿错 spec
- [ ] **Step 4**:Commit

```bash
git add spike/v0.3/0b-* spike/v0.3/0a-summary.md
git commit -m "spike(0b): three-harness full fixture acceptance + summary update"
```

---

## Self-Review

**Spec 覆盖**:
- ✅ spec §5.1 阶段 2 三 sub-spike → Task 0b.1 / 0b.2 / 0b.3 各对应
- ✅ spec §8 验收标准 1 (Plan 0b 三 harness full fixture spike PASS) → Task 0b.4 Step 1-2 汇总
- ✅ Plan 0a 协议假设到 Plan 0b 业务回归的衔接 → 显式对照表(Plan 0a vs Plan 0b)

**Placeholder scan**:实施时需替换的 `<date>` / `<plugin path>` 等是 spike 必要变量,不是占位。

**Type consistency**:`forge` plugin name / `forge:brainstorming` skill 引用 / `~/.agents/skills/forge` 路径在三 task 一致。

**实操可行性**:全部基于 Plan 0a 已实测 PASS 的协议路径,Plan 0b 主要是回归验证(用 forge 真业务替换 throwaway),风险低。

---

**Plan 0b 完成,落地于** `docs/plans/2026-05-09-plan-0b-full-fixture-spike.md`。

**执行前置**:Plan 1+2+3 完成。
