# subagent-driven-discipline (generic export)

> 双语 README — [中文](#中文版) / [English](#english-version)

`superpowers:subagent-driven-development` 的 sister skill,在上游 generic 3-stage 流程之上补 **controller-side 场景判断**:任务类型 taxonomy、model tier 矩阵、cheap-model 高质量 playbook、cross-verify 纪律、Trigger Type retrospect 让 skill 从实证增长。

本 bundle 是从 ForgeUE 项目抽出的**通用版本**(已剥离项目锚点),可直接 drop 到任何使用 `superpowers:subagent-driven-development` 的项目,通过 §5 case study 增长层适配本地实证。

---

## 中文版

### 这个 skill 在 `superpowers:subagent-driven-development` 之上加什么

| upstream skill | 本 skill |
|---|---|
| Generic 3-stage 流程(implementer + spec_reviewer + code_quality_reviewer + final_reviewer) | **场景 taxonomy**(28 任务子类 × 显式 model tier × WHY) |
| 松散 3-tier model 选择("cheap / standard / most-capable") | **§1 28-子类 × model-tier 矩阵**,每行带选型理由 |
| Generic prompt 模板 | **§2 strict prompt 元素**(per scenario:precondition + 必含元素 + skip 后果) |
| Status 处理 | **§3.3 inline-fix vs round-2 vs 升级 user 决策树** |
| Red flags | **§3.1 STRICT cwd verify** + **§3.2 controller cross-verify**(5 类 claim) |
| (无 cost guidance) | model 列含 cost tier;**§4.2 mid-phase 升级触发** |
| (无 recovery flow) | **§4.1 cherry-pick recovery**(防 worktree-scope leak) |
| (无增长机制) | **§3.4 Trigger-Type Matrix retrospect** — 5 trigger types × per-type retrospect intensity 强制 skill 增长 |

上游 skill 是 3-stage 流程的**真源**。本 skill **不复制不重写**上游 prompt 模板,只补 controller-side 场景判断。

### 跨平台支持(Claude Code / Codex CLI / OpenCode)

bundle 已支持三平台,SKILL.md 文件格式三平台一致(YAML frontmatter + markdown);差异在工具名引用 + 安装路径,通过 `references/` 子目录的映射文件解决。

| 平台 | 安装路径 | Skill 调用 | Subagent dispatch | 详细 mapping |
|---|---|---|---|---|
| Claude Code | `.claude/skills/<name>/` 或 `~/.claude/skills/<name>/` | `Skill(name)` tool | `Agent` tool + `model:` 参数 | (本身就是真源,无需 mapping) |
| Codex CLI | `.codex/skills/<name>/` 或 `~/.agents/skills/<name>/` | 自动 load | `spawn_agent` / `wait_agent` / `close_agent`(需 `multi_agent = true`)| `references/codex-tools.md` |
| OpenCode | `.opencode/skills/<name>/` 或 `.claude/skills/<name>/`(直接复用!)| `skill({name:...})` tool | `Task` tool + agent 定义 in `.opencode/agents/<name>.md` | `references/opencode-tools.md` |

**关键发现**:OpenCode 原生扫描 `.claude/skills/` 路径 — 你装在 Claude Code 安装位置 **就同时被 OpenCode 读到**,不必双装。

### 安装

#### Claude Code

```bash
# 项目级安装(首次推荐):
mkdir -p <your-project>/.claude/skills/
cp -r subagent-driven-discipline-generic <your-project>/.claude/skills/subagent-driven-discipline

# 或全局安装:
mkdir -p ~/.claude/skills/
cp -r subagent-driven-discipline-generic ~/.claude/skills/subagent-driven-discipline
```

#### Codex CLI

```bash
# 项目级:
mkdir -p <your-project>/.codex/skills/
cp -r subagent-driven-discipline-generic <your-project>/.codex/skills/subagent-driven-discipline

# 或用户级(跨项目):
mkdir -p ~/.agents/skills/
cp -r subagent-driven-discipline-generic ~/.agents/skills/subagent-driven-discipline

# 必须打开 multi-agent feature:
echo -e "[features]\nmulti_agent = true" >> ~/.codex/config.toml
```

#### OpenCode

```bash
# 选项 A:OpenCode native 路径
mkdir -p <your-project>/.opencode/skills/
cp -r subagent-driven-discipline-generic <your-project>/.opencode/skills/subagent-driven-discipline

# 选项 B(推荐):用 Claude Code 路径,Claude Code + OpenCode 共享
mkdir -p <your-project>/.claude/skills/
cp -r subagent-driven-discipline-generic <your-project>/.claude/skills/subagent-driven-discipline
# OpenCode 自动 walk-up 到 git worktree 找 .claude/skills/
```

注册到 skill loader 的名字是 `subagent-driven-discipline`(取 `name:` frontmatter 字段,目录名只是文件系统布局)。

验证安装(任一平台):
```bash
ls <安装路径>/subagent-driven-discipline/SKILL.md
ls <安装路径>/subagent-driven-discipline/references/  # 应见 codex-tools.md + opencode-tools.md
```

装完后:
- Claude Code: skill 出现在新对话起头的 system-reminder skill 列表
- Codex CLI: skill 自动 load 到 agent 视野
- OpenCode: agent 看到 available skills 列表,需要时调 `skill({ name: "subagent-driven-discipline" })` 加载

### 如何 wire 到 subagent-driven workflow(不带项目命令名)

dispatch 生命周期 3 个集成点:

#### 1. dispatch 前 — invoke 本 skill

controller 即将通过 `superpowers:subagent-driven-development`(或任何等价 3-stage 流程)派 subagent 时,先 invoke `Skill(subagent-driven-discipline)` 加载 taxonomy。

在 slash-command 模板或 orchestrator skill 中加 "Preflight Subagent Discipline" 段:

```markdown
## Preflight Subagent Discipline (MANDATORY before dispatch)

Agent tool 派 subagent 之前:
1. invoke `Skill(subagent-driven-discipline)` 加载 taxonomy
2. 在 §1 定位任务(找 §1.X.Y 行匹配 subagent 角色)
3. 从 §1 model 列选 model — 显式作为 Agent tool 的 `model:` 参数传
4. 套用 §2 该 scenario 子类的 prompt playbook:
   - 验证 precondition(若 cheap-model 行)
   - 含全部必含 prompt 元素
   - 含 §3.1 STRICT cwd verify 段
```

确保每次 dispatch 都过场景化判断,不让 model 默认继承 parent session。

#### 2. subagent return 后 — 跑 controller cross-verify

任何 subagent return DONE / DONE_WITH_CONCERNS,跑 `§3.2 controller cross-verify` 验证一切事实性 claim(测试 count、commit SHA、branch、文件内容、URL)。**永不**裸信 subagent 自我汇报。

#### 3. phase / dispatch 完成后 — 按 trigger type 跑 retrospect

phase 或单 dispatch 完成,按 trigger type 跑对应 `§3.4` retrospect:

| Trigger type | Retrospect 强度 | Actor model |
|---|---|---|
| Type 1: 3-stage 完整(implementer + spec + code-quality 全绿 + 3 evidence) | **MANDATORY 全 Q1–Q6** | **仅 Opus** |
| Type 2: Parallel dispatch(多 implementer 并行 + spec + code-quality 全绿) | **MANDATORY 全 Q1–Q6 + Q7**(parallel-specific) | **仅 Opus** |
| Type 3: Standalone Task(单 subagent,无 3-stage 包装) | **轻量:Q2 + Q3 + Q4** | Opus 或 Sonnet |
| Type 4: Ad-hoc research Task(无 commit evidence) | **跳 retrospect;仅 §3.2 cross-verify** | 任意 tier |
| Type 5: Codex CLI subprocess | **本 skill 不 cover** | N/A |

retrospect 结果决定是否加 §5 case study(任一 Yes → MANDATORY 加 case;全 No → silent 跳过)。

### 项目化定制点

本 bundle ship **0 个 case study**(§5 仅含 `### Case <NN>` 模板)。你的项目从自己 retrospect 增长 §5。

| 定制点 | 替换内容 |
|---|---|
| §1.1.2 prompt 例 "沿 `<existing-project-module>.py` argparse + multi-mode CLI 风格" | 换成你项目的真实 sister-file 路径 |
| §2.1 "Sister file path: `<e.g. existing project module path>`" | 同上,选一个有代表性的 module |
| §3.4.2 Type 2 trigger 提到的 "或对应 parallel dispatch 命令模板" | 若你项目有 parallel-dispatch slash command,在这里写它的名 |
| §5 case studies | 你项目 retrospect(Q1–Q6 / Q7 / 轻量 Q2–Q4)触发时增长 — 见 §8 增长协议 |
| frontmatter `case_study_count` | 加 case 时同步 bump(`0 → 1 → 2 → ...`) |

§1 28 子类 taxonomy 本身是**故意通用**的 — **不要**在适配你项目时改 subtype 行。新 subtype 只在 retrospect Q5 触发(真实任务暴露 28 类外的 subtype)时才加。

### bundle 文件清单

```
subagent-driven-discipline-generic/
├── SKILL.md                       # skill 本体(顶部 Platform Note 段引导跨平台用户)
├── README.md                      # 本文件(双语 install + wiring + 平台适配指南)
└── references/
    ├── codex-tools.md             # Claude Code → Codex CLI 工具映射 + 平台 caveat
    └── opencode-tools.md          # Claude Code → OpenCode 工具映射 + 平台 caveat
```

`SKILL.md` 自包含:无 script、无外部资源。runtime 依赖只有 controller 调其他 skill 的能力(尤其是 `superpowers:subagent-driven-development` 作为上游 process scaffold)。

### 兼容性 (跨平台 caveat)

- **Claude Code** ✅ 主开发平台,工具命名 native 一致
- **Codex CLI** ✅ 已映射 — 需要 `multi_agent = true` config 打开 `spawn_agent` / `wait_agent` / `close_agent`;详见 `references/codex-tools.md`
- **OpenCode** ✅ 已映射 — 工具名 lowercase(`skill` / `read` / `bash`);subagent 走 `.opencode/agents/<name>.md` 定义文件,**model 选择在 agent 定义里固定**(不是 dispatch 时传参)— 这意味着每个 §1 model tier 你需要定义独立 subagent file;详见 `references/opencode-tools.md`
- **§3.4.5 Type 5(Codex CLI subprocess invoked from Claude Code parent)**:**out of scope** — 走 Codex 自家 review 协议,本 skill 不 cover。注:这与 "Codex CLI 作为本 skill 的 controller" 不同(后者完全 in scope)
- **其他 Anthropic SDK harness**(Copilot CLI / Gemini CLI 等):未实测,但理论上兼容 — 自行参考 superpowers 上游的 `references/copilot-tools.md` 做 mapping

### License

MIT(继承自 ForgeUE 原项目)。frontmatter `author: forgeue project (extracted to generic)` 保留作署名。

### 上游 sister skill 指针

`superpowers:subagent-driven-development` 定义 3-stage 流程(implementer → spec_reviewer → code_quality_reviewer → final_reviewer)、prompt 模板、status taxonomy(DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT)、red flags 列表。**那 skill 是真源**。本 skill 纯加值 — controller-side 场景判断、model tier 纪律、retrospect 协议。

冲突时上游 skill 赢。本 skill 只在场景特定的 model 选择 + prompt 元素(§1 / §2)上允许 disagree,**永不**改流程结构本身。

---

## English version

### What this skill adds on top of `superpowers:subagent-driven-development`

| upstream skill | this skill |
|---|---|
| Generic 3-stage process (implementer + spec_reviewer + code_quality_reviewer + final_reviewer) | **Scenario taxonomy** (28 task subtypes × explicit model tier × WHY) |
| Loose 3-tier model selection ("cheap / standard / most-capable") | **§1 28-subtype × model-tier matrix** with rationale per row |
| Generic prompt templates | **§2 strict prompt elements** per scenario (preconditions + must-have prompt elements + failure mode if skipped) |
| Status handling | **§3.3 inline-fix vs round-2 vs escalate decision tree** |
| Red flags | **§3.1 STRICT cwd verify** + **§3.2 controller cross-verify** (5 claim types) |
| (no cost guidance) | model column carries cost tier; **§4.2 mid-phase upgrade trigger** |
| (no recovery flow) | **§4.1 cherry-pick recovery** for worktree-scope leaks |
| (no growth mechanism) | **§3.4 Trigger-Type Matrix retrospect** — 5 trigger types × per-type retrospect intensity gates skill growth |

The upstream skill is the **source of truth** for the 3-stage process. This skill **does not duplicate or rewrite** upstream prompt templates — it only adds controller-side scenario judgment.

### Cross-platform support (Claude Code / Codex CLI / OpenCode)

The bundle supports all three harnesses. SKILL.md format is identical across them (YAML frontmatter + markdown); differences in tool-name references and install paths are handled by the mapping files in `references/`.

| Harness | Install path | Skill invocation | Subagent dispatch | Detailed mapping |
|---|---|---|---|---|
| Claude Code | `.claude/skills/<name>/` or `~/.claude/skills/<name>/` | `Skill(name)` tool | `Agent` tool with `model:` parameter | (source of truth — no mapping needed) |
| Codex CLI | `.codex/skills/<name>/` or `~/.agents/skills/<name>/` | auto-loads | `spawn_agent` / `wait_agent` / `close_agent` (requires `multi_agent = true`) | `references/codex-tools.md` |
| OpenCode | `.opencode/skills/<name>/` or `.claude/skills/<name>/` (reused!) | `skill({name:...})` tool | `Task` tool + agent definitions in `.opencode/agents/<name>.md` | `references/opencode-tools.md` |

**Key finding**: OpenCode natively scans `.claude/skills/` paths — installing under the Claude Code location makes the skill **simultaneously visible to OpenCode** without duplication.

### Install

#### Claude Code

```bash
# Per-project install (recommended for first-time adopters):
mkdir -p <your-project>/.claude/skills/
cp -r subagent-driven-discipline-generic <your-project>/.claude/skills/subagent-driven-discipline

# Or user-global install:
mkdir -p ~/.claude/skills/
cp -r subagent-driven-discipline-generic ~/.claude/skills/subagent-driven-discipline
```

#### Codex CLI

```bash
# Per-project:
mkdir -p <your-project>/.codex/skills/
cp -r subagent-driven-discipline-generic <your-project>/.codex/skills/subagent-driven-discipline

# Or user-global (cross-project):
mkdir -p ~/.agents/skills/
cp -r subagent-driven-discipline-generic ~/.agents/skills/subagent-driven-discipline

# REQUIRED — enable multi-agent feature:
echo -e "[features]\nmulti_agent = true" >> ~/.codex/config.toml
```

#### OpenCode

```bash
# Option A: OpenCode native path
mkdir -p <your-project>/.opencode/skills/
cp -r subagent-driven-discipline-generic <your-project>/.opencode/skills/subagent-driven-discipline

# Option B (recommended): use Claude Code path; both Claude Code and OpenCode share it
mkdir -p <your-project>/.claude/skills/
cp -r subagent-driven-discipline-generic <your-project>/.claude/skills/subagent-driven-discipline
# OpenCode walks up to git worktree and discovers .claude/skills/ automatically
```

The skill name registered with the loader is `subagent-driven-discipline` (taken from the `name:` frontmatter field — directory name is just filesystem layout).

Verify install (any harness):
```bash
ls <install-path>/subagent-driven-discipline/SKILL.md
ls <install-path>/subagent-driven-discipline/references/  # should show codex-tools.md + opencode-tools.md
```

After install:
- Claude Code: skill appears in the system-reminder skill list at conversation start
- Codex CLI: skill auto-loads into agent visibility
- OpenCode: agent sees the available-skills list and invokes `skill({ name: "subagent-driven-discipline" })` to load full content on demand

### How to wire into a subagent-driven workflow (no project-specific command names)

Three integration points across a subagent dispatch lifecycle:

#### 1. **Before** dispatching a subagent — invoke this skill

When the controller is about to dispatch a subagent under `superpowers:subagent-driven-development` (or any equivalent 3-stage process), invoke `Skill(subagent-driven-discipline)` first to load the taxonomy.

In a slash-command template or a skill that orchestrates dispatch, add a "Preflight Subagent Discipline" section:

```markdown
## Preflight Subagent Discipline (MANDATORY before dispatch)

Before invoking the Agent tool to dispatch a subagent:
1. Invoke `Skill(subagent-driven-discipline)` to load the taxonomy.
2. Locate the task in §1 (find the §1.X.Y row matching the subagent role).
3. Pick the model from §1's model column — pass it explicitly as the Agent tool's `model:` parameter.
4. Apply the §2 prompt playbook for that scenario subtype:
   - Verify preconditions (if cheap-model row).
   - Include all must-have prompt elements.
   - Include §3.1 STRICT cwd verify section.
```

This ensures every dispatch goes through scenario-aware judgment instead of inheriting the parent session's model by default.

#### 2. **After** the subagent returns — run controller cross-verify

Whenever a subagent returns DONE / DONE_WITH_CONCERNS, run `§3.2 controller cross-verify` against any factual claims (test counts, commit SHAs, branch names, file contents, URLs). Never trust subagent self-reports without verification.

#### 3. **After** a phase / dispatch completes — run retrospect by trigger type

When a phase or single dispatch completes, run the `§3.4` retrospect appropriate to the trigger type:

| Trigger type | Retrospect intensity | Actor model |
|---|---|---|
| Type 1: 3-stage full (implementer + spec + code-quality, all green + 3 evidence files) | **MANDATORY full Q1–Q6** | **Opus only** |
| Type 2: Parallel dispatch (multiple implementers in parallel, then spec + code-quality green) | **MANDATORY full Q1–Q6 + Q7** (parallel-specific) | **Opus only** |
| Type 3: Standalone Task (single subagent, no 3-stage wrapper) | **Light: Q2 + Q3 + Q4** | Opus or Sonnet |
| Type 4: Ad-hoc research Task (no committed evidence) | **Skip retrospect; only §3.2 cross-verify** | any tier |
| Type 5: Codex CLI subprocess | **out of scope** for this skill | N/A |

Retrospect outcome decides whether to add a §5 case study (any "Yes" answer → MANDATORY case study; all "No" → skip silently).

### Where projects customize

This bundle ships **0 case studies** in §5 — the file contains only the `### Case <NN>` template. Your project grows §5 from your own retrospect findings.

Project-specific customization points:

| Slot | What to customize |
|---|---|
| §1.1.2 prompt example "沿 `<existing-project-module>.py` argparse + multi-mode CLI 风格" | Replace with a real sister-file path from your project |
| §2.1 "Sister file path: `<e.g. existing project module path>`" | Same — pick a representative module |
| §3.4.2 Type 2 trigger reference "或对应 parallel dispatch 命令模板" | If your project has a parallel-dispatch slash command, name it here |
| §5 case studies | Grow as your project's retrospects fire (Q1–Q6 / Q7 / Light Q2–Q4) — see §8 growth protocol |
| frontmatter `case_study_count` | Bump as you add cases (`0 → 1 → 2 → ...`) |

The §1 28-subtype taxonomy itself is intentionally generic — **do not edit subtype rows when adapting to your project**. New subtypes only get added when retrospect Q5 fires (a real task surfaces a subtype outside the existing 28).

### Files in this bundle

```
subagent-driven-discipline-generic/
├── SKILL.md                       # the skill itself (top-level Platform Note guides cross-harness users)
├── README.md                      # this file (bilingual install + wiring + platform-adaptation guide)
└── references/
    ├── codex-tools.md             # Claude Code → Codex CLI tool mapping + platform caveats
    └── opencode-tools.md          # Claude Code → OpenCode tool mapping + platform caveats
```

`SKILL.md` is self-contained: no scripts, no external assets. The only runtime dependency is the controller's ability to invoke other skills (specifically `superpowers:subagent-driven-development` as the upstream process scaffold).

### Compatibility (cross-platform caveats)

- **Claude Code** ✅ primary development platform; tool naming is native
- **Codex CLI** ✅ mapped — requires `multi_agent = true` config to enable `spawn_agent` / `wait_agent` / `close_agent`; see `references/codex-tools.md`
- **OpenCode** ✅ mapped — tool names are lowercase (`skill` / `read` / `bash`); subagents are defined as `.opencode/agents/<name>.md` files with **model fixed at agent definition** (not passed at dispatch time) — meaning each §1 model tier needs its own subagent file; see `references/opencode-tools.md`
- **§3.4.5 Type 5 (Codex CLI subprocess invoked from a Claude Code parent)** is **out of scope** for this skill — those follow Codex's own review protocol. Note: this differs from "Codex CLI as the controller of this skill" (which is fully in scope).
- **Other Anthropic SDK harnesses** (Copilot CLI / Gemini CLI / etc.): not validated, but in principle compatible — refer to the upstream `superpowers:using-superpowers` skill's `references/copilot-tools.md` for additional mapping templates.

### License

MIT (inherited from the originating ForgeUE project). Frontmatter `author: forgeue project (extracted to generic)` retained as attribution.

### Pointer to the upstream sister skill

`superpowers:subagent-driven-development` defines the 3-stage process (implementer → spec_reviewer → code_quality_reviewer → final_reviewer), the prompt templates, the status taxonomy (DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT), and the red-flags list. **That skill is the source of truth.** This skill is purely additive — controller-side scenario judgment, model tier discipline, retrospect protocol.

When in doubt, the upstream skill wins. This skill is allowed to disagree only on scenario-specific model choice and prompt elements (§1 / §2), never on the process structure itself.
