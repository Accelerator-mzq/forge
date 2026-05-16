# subagent-driven-discipline 移植实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把第三方 companion skill `subagent-driven-discipline` 移植成 forge plugin 第 17 个 skill `forge:subagent-driven-discipline`,净化掉全部项目锚点,补全 SDD 工作流早已假定存在的依赖。

**Architecture:** 以 forge-repo `.claude/skills/subagent-driven-discipline/`(原件,不动)为源,复制到仓库根 `skills/subagent-driven-discipline/` → forge 命名空间化 → 按 § 分块净化 27+1 条锚点 → 接 forge 基建(`SKILL_NAMES` registry / `copy-templates.mjs` references 同步 / forge-eval scenario)→ 校验下游 skill 引用不悬空。`copy-templates.mjs` 的 `syncSkills()` 是目录驱动的,新建 `skills/<name>/SKILL.md` 会被自动反向同步到 `src/core/templates/` + `dist/`;但子目录 `references/` 需新增同步函数。

**Tech Stack:** Markdown skill 文本 / TypeScript registry(`src/core/templates/skills/index.ts`)/ Node ESM 构建脚本(`scripts/copy-templates.mjs`)/ vitest / pnpm / YAML(forge-eval scenario)。

---

## 设计前提:spec review 已独立核实(必读)

本计划基于 `docs/specs/2026-05-16-subagent-driven-discipline-port-design.md`,但 spec 的 §6/§7/§8 经独立对照代码后**确认有事实错误**,本计划已修正,执行时以本计划为准:

1. **§8「forge-eval 有自己的 registry(`forge-eval/runner/registry.ts`)」是错的。** `forge-eval/runner/registry.ts` 不存在;`forge-eval/load-skill.ts:4` 直接 re-export 主 `SKILL_NAMES`(`import { ..., SKILL_NAMES } from '../src/core/templates/index.js'`)。`forge-eval/index.ts:65` 全量 eval = `[...SKILL_NAMES]`,`forge-eval/runner.ts:117` 对每个 skill 调 `loadScenarioFile(skill)`。**结论**:discipline 进 `SKILL_NAMES` 后,`pnpm eval` 全量会强制要求 `forge-eval/scenarios/subagent-driven-discipline.yaml`,否则崩。§5(进 registry)与 §7(不配 eval)矛盾。
2. **决议(用户已拍板,选项 A)**:保留 decision-5(进 `SKILL_NAMES`),**新增** `forge-eval/scenarios/subagent-driven-discipline.yaml`,§7「不配 eval」作废 —— 见 Task 11。
3. **audit B-03 的 `forge-eval/runner/registry.ts`、`scripts/build.ts` 是架空路径**(`scripts/` 只有 `.mjs`;无 `runner/` 目录)。净化动作(占位符化)不变,但执行时不要假定它们存在 —— 见 Task 5。
4. **spec §3 漏列 `tests/core/templates/skills.test.ts`** —— 该文件也硬编码 skill 数 15 与按序断言,必须一起改 —— 见 Task 10。
5. **spec §3 对 `writing-plans/SKILL.md` 引用的描述不准** —— 它的引用是 `.claude/skills/...` 路径形式且指向 `§5 Case 09`(本移植全删 §5),不是 SDD 那种 `forge:` 命名空间引用 —— 见 Task 12。
6. **「Pattern S」只定义在 §5 case study 内**(原件 `SKILL.md:1233`),§6 Pattern Catalog **没有** Pattern S 行。§5 删后 Pattern S 在 discipline skill 内彻底消失 —— Task 12 的 repoint 不能指向「§6 Pattern S」。
7. **Type 6 / Type 7 只出现在 §5**(原件 `SKILL.md:1125/1203/1282/1318/1352`,全在 §5 范围 546-1412),且是 forge 流程特设 trigger type(`forge:writing-skills 协议` / `release sub-plan`)。spec §4.4/D-05 的判断结果:**Type 6/7 随 §5 删除而消失,§3.4 Trigger Type Matrix 保持 Type 1-5 不动,无需补定义** —— 见 Task 6。

**分支**:在 `dev` 上开 feature 分支(如 `feat/port-subagent-driven-discipline`)。每个 Task 一个 commit。

**全局纪律**:
- 改 `skills/` 后必跑 `pnpm build`(`copy-templates.mjs` 反向同步)。本计划每个改 `skills/` 的 Task 末尾都含 build + commit `skills/` 与 `src/core/templates/` 两处(`dist/` 被 gitignore,不 commit)。
- push 前(Task 13)按 CI 顺序全量:`pnpm lint` → `pnpm format:check` → `pnpm typecheck` → `pnpm build` → `pnpm test`,任一失败即修。
- 原件 `.claude/skills/subagent-driven-discipline/` **全程不动**,只作复制源。

---

## 文件结构

| 文件 | 责任 | 改动类型 |
| ---- | ---- | -------- |
| `skills/subagent-driven-discipline/SKILL.md` | 移植版 skill 正文(净化 + 命名空间化) | 新增 |
| `skills/subagent-driven-discipline/README.md` | 移植版 skill 说明(中性化出处/License) | 新增 |
| `skills/subagent-driven-discipline/references/codex-tools.md` | Codex CLI 工具映射参考 | 新增 |
| `skills/subagent-driven-discipline/references/opencode-tools.md` | OpenCode 工具映射参考 | 新增 |
| `src/core/templates/skills/subagent-driven-discipline.md` | legacy/npm 形态模板(`pnpm build` 自动生成) | 构建产物 |
| `src/core/templates/skills/subagent-driven-discipline/references/*.md` | legacy/npm 形态 references 镜像(Task 9 后由 build 生成) | 构建产物 |
| `src/core/templates/skills/index.ts` | `SKILL_NAMES` registry(15→16) | 改 |
| `scripts/copy-templates.mjs` | 新增 `syncSkillReferences()` 同步 skill 自带 `references/` 子目录 | 改 |
| `tests/core/templates/registry.test.ts` | registry 数量/字面断言(15→16) | 改 |
| `tests/core/templates/skills.test.ts` | skill 结构断言 + 数量(15→16)+ 净化回归锁 | 改 |
| `tests/smoke.test.ts` | 顶层 smoke 测试,硬编码 skill 数(15→16) | 改 |
| `forge-eval/scenarios/subagent-driven-discipline.yaml` | forge-eval RED/GREEN scenario | 新增 |
| `tests/forge-eval/load-scenario.test.ts` | 新 scenario yaml 合法性断言 | 改 |
| `skills/subagent-driven-development/SKILL.md` | 校验 3 处 `forge:subagent-driven-discipline §x` 引用 | 改(校验) |
| `skills/writing-plans/SKILL.md` | repoint 6 处 discipline / Case 09 悬空引用 | 改 |
| `CHANGELOG.md` | Keep a Changelog 记一条 | 改 |

---

## Task 1: 复制原件到 `skills/` 并首次 build

**Files:**
- Create: `skills/subagent-driven-discipline/SKILL.md`(从原件复制)
- Create: `skills/subagent-driven-discipline/README.md`(从原件复制)
- Create: `skills/subagent-driven-discipline/references/codex-tools.md`(从原件复制)
- Create: `skills/subagent-driven-discipline/references/opencode-tools.md`(从原件复制)
- 构建产物: `src/core/templates/skills/subagent-driven-discipline.md`

- [ ] **Step 1: 复制整个目录**

原件在 `.claude/skills/subagent-driven-discipline/`(`SKILL.md` ~187KB / `README.md` ~21KB / `references/` 两文件)。整目录复制到仓库根 `skills/`:

```bash
cp -r .claude/skills/subagent-driven-discipline skills/subagent-driven-discipline
```

- [ ] **Step 2: 确认 frontmatter `name` 无前缀**

`skills/subagent-driven-discipline/SKILL.md` frontmatter 必须保持 `name: subagent-driven-discipline`(**无** `forge:` 前缀 —— plugin namespace 隐含,与其它 16 个 root skill 一致;`copy-templates.mjs:49` reverse-sync 时自动加前缀)。原件本就是无前缀,确认未被改动即可:

```bash
grep -n "^name:" skills/subagent-driven-discipline/SKILL.md
```

Expected: `name: subagent-driven-discipline`

- [ ] **Step 3: 跑 build,确认目录驱动同步生效**

```bash
pnpm build
```

Expected: 输出含 `✓ synced 17 skills`(原 16 个 skill 目录 + 新 discipline = 17);`src/core/templates/skills/subagent-driven-discipline.md` 被创建。

```bash
ls src/core/templates/skills/subagent-driven-discipline.md
grep -n "^name:" src/core/templates/skills/subagent-driven-discipline.md
```

Expected: 文件存在;`name: forge:subagent-driven-discipline`(copy-templates 自动加了前缀)。

> 注:此时 discipline 尚未进 `SKILL_NAMES`,`pnpm test` 不会触碰它,模板里有这个未注册文件无害(与现存 `process-evidence.md` 同状态)。

- [ ] **Step 4: Commit**

```bash
git add skills/subagent-driven-discipline src/core/templates/skills/subagent-driven-discipline.md
git commit -m "feat(skills): 复制 subagent-driven-discipline 原件作移植起点"
```

---

## Task 2: forge 命名空间化(`superpowers:` → `forge:`)

**Files:**
- Modify: `skills/subagent-driven-discipline/SKILL.md`
- Modify: `skills/subagent-driven-discipline/README.md`
- Modify: `skills/subagent-driven-discipline/references/codex-tools.md`
- Modify: `skills/subagent-driven-discipline/references/opencode-tools.md`

**背景**:`tests/core/templates/skills.test.ts:22-25` 对每个 `SKILL_NAMES` skill 断言 `不含残留 superpowers:<x> 命名空间引用`(`/superpowers:[a-z][a-z0-9-]*/`)。discipline 进 `SKILL_NAMES`(Task 10)后此断言自动覆盖它 —— 本 Task 必须把 `superpowers:<identifier>` 清零。**裸词 `superpowers`(项目名,用于致谢)允许保留**,只换 `superpowers:标识符` 形式。

- [ ] **Step 1: 扫描所有 `superpowers:<x>` 出现点**

```bash
grep -rn "superpowers:[a-z]" skills/subagent-driven-discipline/
```

预期命中点(原件已知):frontmatter `description` 内 `Companion to \`superpowers:subagent-driven-development\``、frontmatter `compatibility` 内 `sister to superpowers:subagent-driven-development`、正文 `Universal controller-side discipline for \`superpowers:subagent-driven-development\` workflows`、§9 标题 `## §9 Relation to superpowers:subagent-driven-development`、以及 §1-§9 各处 `superpowers:subagent-driven-development` 引用。

- [ ] **Step 2: 按映射表替换 `superpowers:<x>` → `forge:<x>`**

**不可机械把 `superpowers:` 换成 `forge:`** —— 部分 skill 在 forge 里改了名,机械替换会造出悬空引用。按下表替换上一步 grep 命中的每一处:

| 源引用 | 替换为 | 说明 |
| ------ | ------ | ---- |
| `superpowers:subagent-driven-development` | `forge:subagent-driven-development` | 同名,直接换前缀(frontmatter `description`/`compatibility`、正文、§9 标题等多处) |
| `superpowers:dispatching-parallel-agents` | `forge:dispatching-parallel-agents` | 同名(SKILL.md 正文,约 line 365/388) |
| `superpowers:using-superpowers` | `forge:using-forge` | **改了名** —— forge 对应 skill 是 `using-forge` 不是 `using-superpowers`;机械替换会得到悬空的 `forge:using-superpowers`。若该处上下文不适合指向具体 skill,改中性描述(README 约 line 347) |

若 grep 命中表外的其它 `superpowers:<名>`,先查 `skills/` 目录确认 forge 对应 skill 的真实名再替换;forge 无对应 skill 的,改中性描述,不写悬空引用。

- [ ] **Step 3: 校验 `superpowers:<x>` 清零 + 无悬空 `forge:` 引用**

```bash
# (a) superpowers:<x> 必须清零(裸 superpowers 词允许保留,不算命中)
grep -rn "superpowers:[a-z]" skills/subagent-driven-discipline/
# (b) 机械替换误产物 forge:using-superpowers 必须不存在
grep -rn "forge:using-superpowers" skills/subagent-driven-discipline/
# (c) 列出所有 forge:<x> 引用,逐个核实 <x> 是真实 skill 名
grep -rhoE "forge:[a-z][a-z0-9-]*" skills/subagent-driven-discipline/ | sort -u
```

Expected:(a)(b) 均无输出(exit 1);(c) 列出的每个 `forge:<x>` 都能在 `skills/` 目录找到同名 skill 目录(如 `forge:subagent-driven-development` ↔ `skills/subagent-driven-development/`)或是 forge slash 命令名 —— 任一对不上即悬空引用,回 Step 2 修。裸 `superpowers` 词允许残留。

- [ ] **Step 4: build**

```bash
pnpm build
```

Expected: `✓ synced 17 skills` 无报错。

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-discipline src/core/templates/skills/subagent-driven-discipline.md
git commit -m "refactor(skills): subagent-driven-discipline 命名空间化 superpowers→forge"
```

---

## Task 3: 净化 frontmatter + README(类 C 中性化 + I7)

**Files:**
- Modify: `skills/subagent-driven-discipline/SKILL.md`(frontmatter)
- Modify: `skills/subagent-driven-discipline/README.md`

**锚点**(audit 附录 A):B-01 / B-02 / B-25 / B-26 / B-27 + I7。

- [ ] **Step 1: 净化 frontmatter**

`skills/subagent-driven-discipline/SKILL.md` frontmatter 当前(命名空间化后):

```yaml
license: MIT
compatibility: Claude Code Agent tool + python -m pytest;sister to forge:subagent-driven-development(generic 3-stage process)
metadata:
  author: forgeue project (extracted to generic)
  version: "1.0-generic"
  scenario_subtype_count: 28
  case_study_count: 10
  retrospect_protocol: trigger-type-matrix(5 types × per-type intensity)
```

改为:

```yaml
license: MIT
compatibility: Claude Code Agent tool;sister to forge:subagent-driven-development(generic 3-stage process)
metadata:
  author: forge (generic skill)
  version: "1.0-generic"
  scenario_subtype_count: 28
  case_study_count: 0
  retrospect_protocol: trigger-type-matrix(5 types × per-type intensity)
```

改动说明:
- B-02:`compatibility` 删 `+ python -m pytest`(技术栈硬编码)。
- B-01:`author` 由 `forgeue project (extracted to generic)` 改 `forge (generic skill)`。
- I7(audit 漏列项):`case_study_count: 10` 改 `0` —— §5 case study 本移植全删(Task 7),计数必须归零。
- `scenario_subtype_count: 28` **保留**(§1 taxonomy 子类数,§1 净化不删子类)。

- [ ] **Step 2: 净化 README 出处与 License**

读 `skills/subagent-driven-discipline/README.md` 全文,处理 3 个锚点:
- B-25(README L7 附近):「从 ForgeUE 项目抽出」类出处叙述 → 改中性表述(如「a generic skill for subagent-driven-development workflows」)或删出处句。
- B-26(README License 段,中英各一处):「inherited from ForgeUE」→ 改中性 attribution,**License 仍为 MIT**(如「MIT License」不带项目继承叙述)。
- B-27(README 定制点表格):argparse `.py` 举例 / forge 专有 slash command 举例 → 换中性例子(如把 `argparse` 例换成语言无关描述,把具体 slash 命令名换成 `<your-review-command>` 占位)。

- [ ] **Step 3: 校验项目锚点已清**

```bash
# README:Task 3 全净化 README,以下应全部清零
grep -niE "forgeue|argparse|python -m pytest|inherited from" skills/subagent-driven-discipline/README.md
# SKILL.md:Task 3 只改 frontmatter —— 看 frontmatter 区(前 16 行)确认三处改动
sed -n '1,16p' skills/subagent-driven-discipline/SKILL.md
```

Expected:
- 第一条无输出(exit 1)—— README 项目锚点已清。
- 第二条:`metadata.author` 为 `forge (generic skill)`(无 `forgeue`)、`compatibility` 行不含 `python -m pytest`、`case_study_count: 0`。

> 注:**不**对 SKILL.md 整体 grep `argparse` / `python -m pytest` —— §1.1.2 的 `argparse`(B-24)由 Task 4 净化;§1.7/§2/§3 正文里的 `python -m pytest`(L102/149/240/315/316/608 附近)是多技术栈 playbook 的通用示例命令(非项目锚点,27 锚点 audit 未列),**保留不动**。

- [ ] **Step 4: build + Commit**

```bash
pnpm build
git add skills/subagent-driven-discipline src/core/templates/skills/subagent-driven-discipline.md
git commit -m "refactor(skills): 净化 discipline frontmatter+README 项目出处(B-01/02/25/26/27 + case_study_count)"
```

---

## Task 4: 净化 §1(类 B 通用化)

**Files:**
- Modify: `skills/subagent-driven-discipline/SKILL.md`(§1 范围)

**锚点**:B-23 / B-24。§1 范围参考:`## §1` 起于约 line 37,止于 `## §2`(约 line 107)前。

- [ ] **Step 1: 定位 §1 范围**

```bash
grep -n "^## §1\|^## §2" skills/subagent-driven-discipline/SKILL.md
```

读出该行号区间的全文。

- [ ] **Step 2: 净化 B-23 —— §1.3 takeaway 真实变量名 `IMPL_FILES_JSON`**

在 §1.3 takeaway 段找到 `IMPL_FILES_JSON` —— 它是某项目的真实变量名。改成通用描述,例:`IMPL_FILES_JSON` → 「a JSON-serialized list passed via env var」类中性说法,使例子不绑定具体变量名,保留「JSON 序列化静默失败」的教学点。

- [ ] **Step 3: 净化 B-24 —— §1.1.2 argparse 举例(并对齐 README 定制表)**

§1.1.2 行(约 line 44)的 prompt 例当前是:``Pattern 元素 enumerated(e.g. "沿 `<existing-project-module>.py` argparse + multi-mode CLI 风格")``。其中 `.py` 后缀与 `argparse + multi-mode CLI` 是 Python 技术栈特有锚点。

**改为与 README 定制点表格字面一致的中性写法** —— Task 3 已把 README 定制表里这一行净化成目标形态 ``§1.1.2 prompt 例 "沿 `<existing-project-module>` 的代码风格和模式"``;§1.1.2 正文必须对齐它,否则 README 表与正文不一致(Task 3 code review 已指出此跨 Task 一致性要求):

- 把 ``e.g. "沿 `<existing-project-module>.py` argparse + multi-mode CLI 风格"`` 改为 ``e.g. "沿 `<existing-project-module>` 的代码风格和模式"``(去掉 `.py` 后缀与 `argparse + multi-mode CLI`)。

保留该子类(Pattern-matching task type)要表达的教学点,只去技术栈绑定。

- [ ] **Step 3.5: 校验**

```bash
sed -n '<§1起>,<§2起>p' skills/subagent-driven-discipline/SKILL.md | grep -niE "IMPL_FILES_JSON|argparse"
# 对齐校验:§1.1.2 行的 prompt 例应与 README 定制表字面一致
grep -n "<existing-project-module>" skills/subagent-driven-discipline/SKILL.md skills/subagent-driven-discipline/README.md
```

Expected: 第一条无输出;第二条中 SKILL.md §1.1.2 行与 README 定制表行的 `<existing-project-module>` 上下文表述一致(均为「的代码风格和模式」/「code style and patterns」,无 `.py`、无 `argparse`)。

- [ ] **Step 4: build + Commit**

```bash
pnpm build
git add skills/subagent-driven-discipline src/core/templates/skills/subagent-driven-discipline.md
git commit -m "refactor(skills): 净化 discipline §1 项目锚点(B-23/B-24)"
```

---

## Task 5: 净化 §2(类 B 占位符化 + 类 A 删实证)

**Files:**
- Modify: `skills/subagent-driven-discipline/SKILL.md`(§2 范围)

**锚点**:B-03 / B-04 / B-05 / B-06。§2 范围:`## §2`(约 line 107)至 `## §3`(约 line 290)前。

> **注(I3/I4)**:B-03 列的 `forge-eval/runner/registry.ts`、`scripts/build.ts` 在当前 forge-repo **不存在**(已核实)。净化动作不变(占位符化),但不要假定它们是「现存真实路径」。

- [ ] **Step 1: 定位 §2 范围并通读**

```bash
grep -n "^## §2\|^## §3\|§2.1.1\|§2.1.2" skills/subagent-driven-discipline/SKILL.md
```

- [ ] **Step 2: 净化 B-03 —— §2.1 P-5 真实文件路径**

§2.1 P-5 段含真实路径 `forge-eval/runner/registry.ts`、`scripts/build.ts`、`copy-templates.mjs`。改成占位符或抽象描述,例:`copy-templates.mjs` → `<build-sync-script>`;`forge-eval/runner/registry.ts` → `<registry-file>`。保留「external protocol assumption verify」协议本身。

- [ ] **Step 3: 净化 B-04 —— §2.1.1 P-5 实证叙事段(类 A 删)**

§2.1.1 内有一段「实证(plan-9h Task 4 实战…)」叙事,含真实路径/变量/skill 名。**删整段实证叙事**,**保留 P-5 的通用协议正文与 dispatch prompt 模板**(spec §4.1:删实证,留通用原则)。

- [ ] **Step 4: 净化 B-05 —— §2.1.2 cross-cutting 回写 hook 实证段(类 A 删)**

§2.1.2「cross-cutting 状态回写 hook」段含 `plan-9g`/`plan-v1.1` 真实 plan 名与文件路径的实证叙事。**删实证叙事**,**保留 hook 协议本身**(implementer prompt + self-review checklist 加 grep verify 的通用描述)。注意 `## §2.1.2` 区附近 line ~198 的 `**Why**(Pattern X #1 累计实证,REINFORCE Pattern S/T)` 与 line ~223 `参考 case:本 SKILL.md §5 Case 09 §1273` —— 这些 `Pattern X/S/T` + `§5 Case 09` 实证引用一并删除或改通用(§5 将被清空,引用会悬空)。

- [ ] **Step 5: 净化 B-06 —— §2.1 Self-Review Checklist 措辞**

§2.1 Self-Review Checklist 内 `pnpm format:check`「CI 双平台 fail」措辞是 forge CI 特有。改通用措辞,如「漏跑格式检查 → 可能导致 CI 失败,具体看项目 CI 配置」,不绑定 `pnpm` 与「双平台」。

- [ ] **Step 5.5: 校验**

```bash
sed -n '<§2起>,<§3起>p' skills/subagent-driven-discipline/SKILL.md | grep -niE "forge-eval/runner|scripts/build\.ts|copy-templates|plan-9|plan-v1|IMPL_FILES_JSON"
```

Expected: 无输出(`copy-templates` 等真实名已占位符化,plan 名实证已删)。

- [ ] **Step 6: build + Commit**

```bash
pnpm build
git add skills/subagent-driven-discipline src/core/templates/skills/subagent-driven-discipline.md
git commit -m "refactor(skills): 净化 discipline §2 项目锚点(B-03/04/05/06)"
```

---

## Task 6: 净化 §3(类 B 抽象 + 占位符化)+ §4.4 Type 对齐

**Files:**
- Modify: `skills/subagent-driven-discipline/SKILL.md`(§3 范围)

**锚点**:B-07 / B-08 / B-09 / B-10 + §4.4(D-05)。§3 范围:`## §3`(约 line 290)至 `## §4`(约 line 521)前。

- [ ] **Step 1: 定位 §3 范围并通读**

```bash
grep -n "^## §3\|^## §4\|§3.3.1\|§3.3.2\|§3.4" skills/subagent-driven-discipline/SKILL.md
```

- [ ] **Step 2: 净化 B-07 —— §3.3.1 P-6 整节(类 B 抽象)**

§3.3.1 P-6 整节建立在 forge-eval 专有工具上,含 plan 名。**抽象化**:保留「P-6」要表达的通用纪律原则,删去 forge-eval 专有工具名与 plan 名。若该节脱离 forge-eval 后无通用残值,可整节删(执行时判断:抽象后是否还剩可用的通用协议;剩 → 留抽象版,不剩 → 删整节)。

- [ ] **Step 3: 净化 B-08 —— §3.3.2 P-8 整节(类 B 抽象)**

§3.3.2 P-8 整节含 `forge-eval` / `SKILL_NAMES` / `plan-9 序列` 专有术语。同 B-07 处理:抽象成通用纪律,删专有术语。

- [ ] **Step 4: 净化 B-09 / B-10 —— §3.4 Type 5 codex slash 命令名**

- B-09(§3.4.0 Type 5 行):`/codex:adversarial-review`、`/codex:review` 等 slash 命令名 → 占位符,如 `<external-review-command>`。
- B-10(§3.4.5 Type 5):codex slash 命令名 + `codex-companion.mjs` + `codex_review_round1.md` → 占位符化(`<codex-helper-script>` / `<review-output-file>` 等)。保留「Type 5 = 外部 CLI review trigger」的通用定位。

- [ ] **Step 4.5: 净化 §3 残留 `IMPL_FILES_JSON`(audit 漏列项,Task 4 review 发现)**

§3 的 Q7c 诊断表行(约 line 405)含真实变量名 `IMPL_FILES_JSON`:``| **Q7c** | IMPL_FILES_JSON 序列化缺 / W2 actual diff Bash glue 错? ... |``。27 锚点 audit 只列了 §1.3 的 `IMPL_FILES_JSON`(B-23),**漏了 §3 这处**(Task 4 review 时发现)。按 B-23 同款净化:把 `IMPL_FILES_JSON` 改为通用描述(如「JSON 序列化(env var 传递)缺失」),保留 Q7c 行的诊断教学点与 markdown 表格结构。

- [ ] **Step 5: §4.4 / D-05 —— Type 6/7 对齐(已判定:无需补)**

已核实:`Type 6` / `Type 7` 在原件只出现于 §5 范围内(line 1125/1203/1282/1318/1352,全 < §6 起点 1413),且是 forge 流程特设 trigger type(`forge:writing-skills 协议` / `release sub-plan`)。**结论:Type 6/7 随 §5 删除(Task 7)而消失,§3.4 Trigger Type Matrix 保持 Type 1-5 不动,不补定义。** 本 Step 只需校验 §1-§4 / §6-§9 范围内无 `Type 6`/`Type 7` 残留引用:

```bash
grep -n "Type 6\|Type 7" skills/subagent-driven-discipline/SKILL.md
```

Expected: 命中行号应全部落在 §5 范围(546-1412 附近);若有命中落在 §3.4 等处,改为不依赖 Type 6/7(因 §5 删后它们无定义)。

- [ ] **Step 5.5: 校验**

```bash
sed -n '<§3起>,<§4起>p' skills/subagent-driven-discipline/SKILL.md | grep -niE "forge-eval|SKILL_NAMES|plan-9|codex:|codex-companion|codex_review_round|IMPL_FILES_JSON"
```

Expected: 无输出。

- [ ] **Step 6: build + Commit**

```bash
pnpm build
git add skills/subagent-driven-discipline src/core/templates/skills/subagent-driven-discipline.md
git commit -m "refactor(skills): 净化 discipline §3 项目锚点(B-07/08/09/10)+ §4.4 Type 对齐"
```

---

## Task 7: 净化 §5 —— 删全部 10 个 case study(类 A)

**Files:**
- Modify: `skills/subagent-driven-discipline/SKILL.md`(§5 范围)

**锚点**:B-11 ~ B-20(10 个 case study)。§5 范围:`## §5 Case Studies`(约 line 546)至 `## §6`(约 line 1413)前 —— 约 866 行。

**依据**:spec decision-4 + 原件 README「§5 ship 时应为 0 case」设计。case study 是项目实证、天生项目绑定;pattern 教学价值已在 §6 对照表保留;下游各项目靠 §3.4 retrospect 机制自然增长自己的 case。

- [ ] **Step 1: 定位 §5 边界**

```bash
grep -n "^## §5\|^## §6" skills/subagent-driven-discipline/SKILL.md
```

记下 §5 标题行号 与 §6 标题行号。

- [ ] **Step 2: 删 §5 全部 case study,留空模板**

把 `## §5` 标题行 与 `## §6` 标题行之间的全部内容,替换为:§5 标题(保留原标题文字)+ 一段说明 + 一个 `Case <NN>` 空模板。具体写成:

```markdown
## §5 Case Studies(growing layer — 项目实证)

> 本层 ship 时为空。下游项目按 §3.4 Trigger Type Matrix retrospect 机制,在满足「任一 trigger 命中」时往这里追加自己的 case study。pattern 教学价值见 §6 Pattern Catalog。

### Case <NN>: <title>

- **Trigger Type**: <Type 1-5 之一>
- **Context**: <场景一句话>
- **Failure mode / friction**: <遇到的具体问题>
- **Recovery**: <如何恢复>
- **Lesson / Pattern**: <沉淀的可复用 pattern>
```

> 注意:`## §6` 及其后(§6-§9)标题文字内的「§6/§7/§8/§9」是字面文本,删 §5 正文**不会**令其重编号 —— 保持原样。

- [ ] **Step 2.5: 全文消除 §5 case 悬空交叉引用(audit 漏列项,Task 5 review 发现)**

§5 清空后,skill 其它章节里指向**具体某个 §5 case** 的交叉引用会悬空。27 锚点 audit 只列了 §6 的 `see §5 Case`(B-22,Task 8 处理),漏了散落在 §1-§4 / §7-§9 的同类引用。本 Step 清掉 §6 **之外**的全部悬空 §5-case 引用(§6 留给 Task 8):

```bash
grep -nE "§5 Case|Case 0[0-9]|实证见 §5|Case [0-9] 实证" skills/subagent-driven-discipline/SKILL.md
```

已知命中(原件 + 前序 Task 后):
- §1 约 L68:``Case 1 实证:Haiku implementer ... 只有 Sonnet code_quality 抓到`` —— 删去 `Case 1 实证:` 前缀,保留后面的通用教学点。
- §2 约 L156:``... 导致 CI fail(see §5 Case 01)...`` —— 删括注 `(see §5 Case 01)`。
- §2 约 L272:``... 输出 useless verdict(实证见 §5 Case 1)。`` —— 删括注 `(实证见 §5 Case 1)`。
- 若 grep 在 §3 / §4 / §7 / §8 / §9 还有其它指向具体已删 case 的交叉引用,一并删括注 / 改通用。

**保留**(不算悬空,不要动):§5 模板内的 `Case <NN>` 占位符;§4 / §3.4 等处「至少加 §5 Case <NN+1>」「往 §5 追加 case」这类**增长指令**(指向未来 case,非悬空)。只清「指向某个已删的具体 case」的引用。

- [ ] **Step 3: 校验**

```bash
grep -n "^## §5\|^## §6\|^## §7\|^## §8\|^## §9" skills/subagent-driven-discipline/SKILL.md
# §5 范围内实证已删
sed -n '<§5起>,<§6起>p' skills/subagent-driven-discipline/SKILL.md | grep -niE "PR #|plan-9|plan-v1|commit|forge-repo|legacy-bridge"
# §6 之外无悬空 §5-case 引用(§6 仍有,留 Task 8)
grep -nE "see §5 Case|实证见 §5|§5 Case 0[0-9]|Case 0[0-9]" skills/subagent-driven-discipline/SKILL.md
```

Expected:
- 第一条仍显示 §5-§9 五个标题齐全。
- 第二条无输出(§5 case study 实证已全删)。
- 第三条:命中行**只允许**落在 §6 范围(Task 8 待处理);若有命中落在 §1-§4 / §7-§9,说明 Step 2.5 漏清,回去补。

- [ ] **Step 4: build + Commit**

```bash
pnpm build
git add skills/subagent-driven-discipline src/core/templates/skills/subagent-driven-discipline.md
git commit -m "refactor(skills): 清空 discipline §5 case study,留 Case <NN> 空模板(B-11~B-20)"
```

---

## Task 8: 净化 §6 Pattern Catalog(类 B 改通用)

**Files:**
- Modify: `skills/subagent-driven-discipline/SKILL.md`(§6 范围)

**锚点**:B-21 / B-22。§6 范围:`## §6 Pattern Catalog`(约 line 1413)至 `## §7`(约 line 1446)前。

**依据**:spec D-04 建议保留 §6(pattern 对照表有通用价值),仅改悬空引用。§5 已清空(Task 7),§6 catalog 内所有 `see §5 Case XX` 指针 + plan 名引用全部悬空,必须改。

- [ ] **Step 1: 定位 §6 并通读**

```bash
grep -n "^## §6\|^## §7" skills/subagent-driven-discipline/SKILL.md
```

- [ ] **Step 2: 净化 B-21 —— §6 首行/首行附近的内部 plan 引用**

§6 Pattern Catalog 第一个数据行(failure mode = `cross-cutting 状态回写漏`)的 Root cause / Recovery 列含 `see §5 Case 09 §1273 + plan-v1.1 Task 0 §14`、`plan-v1.1 §14 v3.1/v3.2/v3.3 实证` 等内部 plan 引用。删去这些 `see §5 Case`/`plan-v1.1 §14` 指针,保留该行 failure mode → prevention → recovery 的通用描述。

- [ ] **Step 3: 净化 B-22 —— 全部 `see §5 Case XX` 悬空引用**

§6 catalog 多行的标题/列内含 `(see §5 Case 01)` / `(see §5 Case 02 Pattern A)` / `(see §5 Case 03 Pattern D)` / `(see §5 Case 04 Pattern A)` / `(see §5 Case 05 Pattern G~M)` / `(see §5 Case 10 Pattern AA)` 类悬空指针。逐行**删除每个 `(see §5 Case NN ...)` 括注**,保留 catalog 行本身的「failure mode / root cause / prevention / recovery」四列实质内容。行标题里的 `Pattern A`~`Pattern M`/`Pattern AA` 字母标签是助记名,可保留(它们不再指向具体 case,但作为 failure-mode 命名无害);只删 `see §5 Case` 这个指向已删内容的指针。

> 同时检查 §6 行内若有 `plan-9j`/`plan-9z` 等 plan 名(如某些 Root cause 列),一并改通用描述。

- [ ] **Step 4: 校验**

```bash
sed -n '<§6起>,<§7起>p' skills/subagent-driven-discipline/SKILL.md | grep -niE "see §5|§5 Case|plan-9|plan-v1|§1273|§14"
```

Expected: 无输出。

- [ ] **Step 5: build + Commit**

```bash
pnpm build
git add skills/subagent-driven-discipline src/core/templates/skills/subagent-driven-discipline.md
git commit -m "refactor(skills): 净化 discipline §6 Pattern Catalog 悬空引用(B-21/B-22)"
```

---

## Task 9: `copy-templates.mjs` 新增 `references/` 子目录同步

**Files:**
- Modify: `scripts/copy-templates.mjs`
- 构建产物: `src/core/templates/skills/subagent-driven-discipline/references/*.md`、`dist/...`

**背景**:`syncSkills()` 只读每个 `<name>/SKILL.md`,**忽略 skill 目录下的子目录**,故 discipline 的 `references/` 不会被同步。新增一个目录驱动的 `syncSkillReferences()`,扫所有 `skills/<name>/references/` 并同步到 `src/core/templates/` + `dist/`,模式参考既有 `syncSharedSkillDocs()`。

> 说明(I5):legacy `forge init`(`loadAllSkills()`)只装平铺 `<name>.md`,当前没有 loader 消费 per-skill `references/`。本 Task 的同步**目的是让 `src/core/templates/` 也带上 per-skill `references/` 子目录**,与 `syncSkills()` 同步 `SKILL.md`、`syncSharedSkillDocs()` 同步 `_shared/` 并列 —— spec §6/decision-6 明确要求,不为新增 loader。注意:`src/core/templates/` 并非 `skills/` 的逐文件完整镜像(skill 根下 sibling `.md`,如 `writing-skills/frontmatter-conventions.md`、`writing-skills/forge-eval-integration.md`,本就不被任何同步函数处理),本 Task 只补 `references/` 这一类。plugin 形态直接读根 `skills/`,本就含 `references/`,无需此同步。

- [ ] **Step 1: 写失败测试 —— references 镜像缺失**

在 `tests/core/templates/skills.test.ts` 末尾追加(`describe` 外或新 `describe` 内):

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

describe('skill references/ 同步(copy-templates syncSkillReferences)', () => {
  it('subagent-driven-discipline references/ 已镜像到 src/core/templates/', () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
    const refDir = join(repoRoot, 'src/core/templates/skills/subagent-driven-discipline/references');
    expect(existsSync(join(refDir, 'codex-tools.md'))).toBe(true);
    expect(existsSync(join(refDir, 'opencode-tools.md'))).toBe(true);
  });
});
```

> 若 `skills.test.ts` 已 import 了 `node:path` / `node:url` 等,合并 import 不要重复声明。
>
> 测试只断言 `src/core/templates/`(已 commit、`pnpm test` 必能读到);`dist/` 是 gitignore 构建产物、无 `pnpm build` 时不存在,故不进 vitest —— `dist/` 分支由 Step 5 在 build 后用 `ls` 即时验证。

- [ ] **Step 2: 跑测试,确认失败**

```bash
pnpm vitest run tests/core/templates/skills.test.ts -t "references/ 已镜像"
```

Expected: FAIL —— `src/core/templates/skills/subagent-driven-discipline/references/` 尚不存在。

- [ ] **Step 3: 在 `copy-templates.mjs` 补 `rm` import + 新增 `syncSkillReferences()`**

先改 `scripts/copy-templates.mjs` 第 6 行 import,补入 `rm`(新函数的「真镜像」预清理要用,现有 import 没有它):

```js
import { mkdir, readdir, readFile, writeFile, unlink, rm } from 'node:fs/promises';
```

再在 `syncCommands()` 之后、文件末尾 `await` 调用区之前,加入新函数(`REPO_ROOT` / `existsSync` / `readdir` 均已在文件内可用):

```js
// 同步 skill 自带的 references/ 子目录:skills/<name>/references/*.md
// → src/core/templates/skills/<name>/references/ → dist/core/templates/skills/<name>/references/
// syncSkills() 只同步 <name>/SKILL.md 忽略子目录;带 references/ 的 skill 需此函数
// 补同步 per-skill references/ 子目录(注:templates 非 skills/ 的逐文件完整镜像)。
async function syncSkillReferences() {
  const skillsDir = join(REPO_ROOT, 'skills');
  const templateRoots = [
    join(REPO_ROOT, 'src', 'core', 'templates', 'skills'),
    join(REPO_ROOT, 'dist', 'core', 'templates', 'skills'),
  ];
  // 真镜像第一步:删两个目标根下所有已存在的 per-skill references/ 子目录,
  // 防止源 skill 删掉/清空 references/ 后,目标残留 stale 文件。
  for (const root of templateRoots) {
    if (!existsSync(root)) continue;
    for (const name of await readdir(root)) {
      const staleRefDir = join(root, name, 'references');
      if (existsSync(staleRefDir)) await rm(staleRefDir, { recursive: true, force: true });
    }
  }
  // 真镜像第二步:从源逐个 skill 重建 references/
  let count = 0;
  for (const name of await readdir(skillsDir)) {
    const refDir = join(skillsDir, name, 'references');
    if (!existsSync(refDir)) continue;
    const mdFiles = (await readdir(refDir)).filter((n) => n.endsWith('.md'));
    if (mdFiles.length === 0) continue;
    for (const root of templateRoots) {
      const target = join(root, name, 'references');
      await mkdir(target, { recursive: true });
      for (const f of mdFiles) {
        await writeFile(join(target, f), await readFile(join(refDir, f), 'utf8'), 'utf8');
      }
    }
    count += mdFiles.length;
  }
  console.log(`✓ synced ${count} skill reference docs (skills/<name>/references/ → src/core/templates/ + dist/)`);
}
```

- [ ] **Step 4: 在文件末尾的调用区接上 `syncSkillReferences()`**

`copy-templates.mjs` 末尾当前是:

```js
await syncSkills();
await syncSharedSkillDocs(); // plan-9b §2.6.8(v2 修订:fail-fast)
await syncCommands();
await syncBacklogAssets(); // plan-backlog-registry
```

改为(在 `syncSkills()` 之后插一行):

```js
await syncSkills();
await syncSkillReferences(); // skill 自带 references/ 子目录(plan-port-discipline)
await syncSharedSkillDocs(); // plan-9b §2.6.8(v2 修订:fail-fast)
await syncCommands();
await syncBacklogAssets(); // plan-backlog-registry
```

- [ ] **Step 5: build + 验证 src/dist 同步 + 跑测试**

```bash
pnpm build
# src 镜像(已 commit,vitest 也覆盖)
ls src/core/templates/skills/subagent-driven-discipline/references/
# dist 镜像(gitignore 构建产物,build 后即时验证 —— 不进 vitest)
ls dist/core/templates/skills/subagent-driven-discipline/references/
pnpm vitest run tests/core/templates/skills.test.ts -t "references/ 已镜像"
```

Expected: build 输出新增 `✓ synced 2 skill reference docs ...`;两个 `ls` 都列出 `codex-tools.md` 与 `opencode-tools.md`;测试 PASS。

- [ ] **Step 6: Commit**

```bash
git add scripts/copy-templates.mjs tests/core/templates/skills.test.ts src/core/templates/skills/subagent-driven-discipline
git commit -m "feat(build): copy-templates 同步 skill 自带 references/ 子目录"
```

---

## Task 10: 接入 `SKILL_NAMES` registry(15→16)

**Files:**
- Modify: `src/core/templates/skills/index.ts`
- Modify: `tests/core/templates/registry.test.ts`
- Modify: `tests/core/templates/skills.test.ts`
- Modify: `tests/smoke.test.ts`

- [ ] **Step 1: 更新失败测试 `registry.test.ts`**

`tests/core/templates/registry.test.ts` 改 3 处:
- L7-10 `SKILL_NAMES 含 15 个不重复 skill`:`toHaveLength(15)` → `toHaveLength(16)`;`new Set(SKILL_NAMES).size).toBe(15)` → `toBe(16)`;`it` 描述文字 `15` → `16`。
- L12-30 `toEqual([...])`:数组末尾(`'exploring'` 之后)加一项 `'subagent-driven-discipline', // plan-port-discipline 新增`。
- L6 注释 `共 15 项` → `共 16 项`。

- [ ] **Step 2: 更新失败测试 `skills.test.ts`**

`tests/core/templates/skills.test.ts` 改:
- L1 注释 `15 个 skill` → `16 个 skill`。
- L8 注释 `所有 15 skill` → `所有 16 skill`。
- L64-66 `it('SKILL_NAMES 总数 15')` → 描述与断言改 `16`(`expect(SKILL_NAMES.length).toBe(16)`)。
- 在 L62 之后(`exploring 第 15 项` 之后)加一个新 `it`:

```ts
  it('subagent-driven-discipline 是 SKILL_NAMES 第 16 项', () => {
    expect(SKILL_NAMES).toContain('subagent-driven-discipline');
    expect(SKILL_NAMES.indexOf('subagent-driven-discipline')).toBe(15); // 0-indexed
  });
```

- 在第一个 `describe('templates/skills', ...)` 内追加净化回归锁(放在 `using-forge 含 6 个...` 那个 `it` 之后):

```ts
  // 净化回归锁:移植版 discipline 不得含任何项目锚点(plan-port-discipline Task 3-8 净化结果锁定)
  it('subagent-driven-discipline 不含项目锚点', async () => {
    const content = await loadSkill('subagent-driven-discipline');
    const anchors: RegExp[] = [
      /forgeue/i, // ForgeUE 项目名
      /forge-eval\/runner/, // 架空旧路径
      /IMPL_FILES_JSON/, // 真实变量名
      /\bplan-9[a-z]/, // plan-9x 内部计划名
      /\bplan-v1\.1\b/, // plan-v1.1 内部计划名
      /codex-companion/, // 项目专有 helper
      /PR #\d+/, // 项目 PR 编号
    ];
    for (const re of anchors) {
      expect(content).not.toMatch(re);
    }
  });
```

> 若此测试在后续 Task 13 全量跑时 FAIL,说明 Task 3-8 某个净化漏了锚点 —— 回去改 `skills/subagent-driven-discipline/SKILL.md`,**不要改测试放宽 regex**。

- [ ] **Step 2.5: 更新失败测试 `smoke.test.ts`**

`tests/smoke.test.ts` 顶层 smoke 测试也硬编码了 skill 数,必须一起改(否则 `pnpm test` 在此 fail):
- L44 注释 `共 15 个 skill` → `共 16 个 skill`。
- L45 `expect(SKILL_NAMES).toHaveLength(15)` → `expect(SKILL_NAMES).toHaveLength(16)`。

- [ ] **Step 3: 跑测试,确认失败**

```bash
pnpm vitest run tests/core/templates/registry.test.ts tests/core/templates/skills.test.ts tests/smoke.test.ts
```

Expected: FAIL —— `SKILL_NAMES` 仍是 15 项,断言不符。

- [ ] **Step 4: 更新 `SKILL_NAMES` registry**

`src/core/templates/skills/index.ts`:
- L1 / L11 / L42 注释里的 `15 个` → `16 个`。
- L12-28 `SKILL_NAMES` 数组在 `'exploring'`(末项)之后加:

```ts
  'exploring', // 9f 新增(沿 design §2.5 全节 + plan-9f)
  'subagent-driven-discipline', // plan-port-discipline 新增(移植 superpowers SDD 的 companion)
] as const;
```

- [ ] **Step 5: build + 跑测试确认通过**

```bash
pnpm build
pnpm vitest run tests/core/templates/registry.test.ts tests/core/templates/skills.test.ts tests/smoke.test.ts
```

Expected: PASS。注意 `skills.test.ts` 的 `it.each(SKILL_NAMES)` 现在覆盖 discipline,会校验它 `name: forge:subagent-driven-discipline`(build 已加前缀)、无残留 `superpowers:<x>`(Task 2 已清)、无 `docs/superpowers/(specs|plans)`、以及净化回归锁。若 `superpowers:<x>` 项 FAIL → 回 Task 2 补;若净化锁 FAIL → 回 Task 3-8 补。

- [ ] **Step 6: 跑 forge-eval load-skill 测试(连带影响校验)**

```bash
pnpm vitest run tests/forge-eval/load-skill.test.ts tests/forge-eval/changed-only.test.ts
```

Expected: PASS。`forge-eval/load-skill.ts` re-export 同一 `SKILL_NAMES`,`load-skill.test.ts` 会 `loadSkillBootstrap('subagent-driven-discipline')` 并断言含 `name: forge:subagent-driven-discipline` —— build 后的模板满足。

- [ ] **Step 7: Commit**

```bash
git add src/core/templates/skills/index.ts tests/core/templates/registry.test.ts tests/core/templates/skills.test.ts tests/smoke.test.ts
git commit -m "feat(skills): subagent-driven-discipline 进 SKILL_NAMES registry(15→16)"
```

---

## Task 11: 新增 forge-eval scenario(I1-A 决议)

**Files:**
- Create: `forge-eval/scenarios/subagent-driven-discipline.yaml`
- Modify: `tests/forge-eval/load-scenario.test.ts`

**背景**:discipline 进 `SKILL_NAMES` 后,`pnpm eval` 全量(`forge-eval/index.ts:65` = `[...SKILL_NAMES]`)会对它调 `loadScenarioFile('subagent-driven-discipline')`,缺 yaml 即崩。用户已拍板选项 A:补一个 scenario yaml。此 yaml 提供一个聚焦「Design 任务强制 Opus」的 RED/GREEN scenario(discipline §1 taxonomy 的核心纪律)。rubric 后续可经 `pnpm eval` baseline 迭代调优(非本计划阻塞项;`pnpm eval` 不在 CI / `pnpm test` 内)。

- [ ] **Step 1: 写失败测试 —— scenario yaml 合法性**

在 `tests/forge-eval/load-scenario.test.ts` 的 `describe('forge-eval/load-scenario', ...)` 内追加:

```ts
  it('subagent-driven-discipline.yaml 合法且可加载', async () => {
    const { loadScenarioFile } = await import('../../forge-eval/load-scenario.js');
    const file = await loadScenarioFile('subagent-driven-discipline');
    expect(file.skill).toBe('subagent-driven-discipline');
    expect(file.scenarios.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: 跑测试,确认失败**

```bash
pnpm vitest run tests/forge-eval/load-scenario.test.ts -t "subagent-driven-discipline.yaml 合法"
```

Expected: FAIL —— `scenario 文件不存在: .../scenarios/subagent-driven-discipline.yaml`。

- [ ] **Step 3: 创建 `forge-eval/scenarios/subagent-driven-discipline.yaml`**

```yaml
skill: subagent-driven-discipline
description: subagent-driven-discipline skill 按 subagent 任务类型细分 model tier,Design 任务(algorithmic/architectural)绝对原则 Opus only
model: claude-sonnet-4-6

scenarios:
  # discipline §1 taxonomy 核心纪律:Design 任务无 cheap-model exception
  - id: model-tier-for-design-task
    pressures: [cost]
    turns:
      - id: t1-algorithm-rewrite-cheap-model
        user: |
          我要派一个 subagent 把限流算法从 fixed-window 重写成 sliding-window,
          这种算法活儿用 haiku 跑省钱吧?你帮我把 subagent 的 model 定了。
        assertions:
          # 只设 must_match 做粗筛;不设 must_not_match —— 正确的拒绝答案会复述用户原话
          # (「haiku」「省钱」等词),judge.ts checkPatterns 对 must_not_match 是整段 regex
          # 命中即 fail、无上下文,无法区分「AI 自己同意降级」与「AI 复述后拒绝」→ 必误判。
          # RED/GREEN 的细致判定交 judge_rubric(LLM judge)。
          must_match:
            # GREEN 粗筛锚点:坚持 Opus(RED 答案附和 haiku 通常根本不会推荐 Opus → must_match fail)
            - regex: '(opus|Opus)'
        judge_rubric: |
          评估 AI 是否识别「重写算法 = algorithmic design 任务」,坚持用 Opus、拒绝 haiku/sonnet 降级。

          **判分锚点**:本评估不评判 sliding-window 算法本身的正确性,
          只评估 subagent model tier 选择是否符合任务类型 taxonomy(Design 任务绝对 Opus、无 exception)。
          AI 顺着「用 haiku 省钱」附和 = baseline 预期失败模式。

          **forge-specific 维度**(baseline AI 不知 taxonomy,必然失分):
          - 显式判定为 algorithmic design 任务(而非泛泛「实现任务」)→ +3 分
          - 坚持 Opus 并明确「Design 任务无 cheap-model exception」→ +4 分
          - 解释 WHY(算法设计错误 silent 难被 review 抓、cheap model reasoning 深度不足)→ +3 分

          **通用维度**(baseline 可能命中,降权重):
          - 笼统说「算法活儿建议用强一点的模型」但不引用 taxonomy → +1 分

          满分 10。baseline(无 skill bootstrap)预期 ≤ 3 分;有 bootstrap 预期 ≥ 7 分。
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm vitest run tests/forge-eval/load-scenario.test.ts -t "subagent-driven-discipline.yaml 合法"
```

Expected: PASS(`validateScenarioFile` 校验 skill 字段 + scenarios 非空 + 每 turn 有 `user`/`judge_rubric` 全通过)。

- [ ] **Step 5: Commit**

```bash
git add forge-eval/scenarios/subagent-driven-discipline.yaml tests/forge-eval/load-scenario.test.ts
git commit -m "feat(forge-eval): subagent-driven-discipline scenario(Design 任务 Opus 纪律)"
```

---

## Task 12: 校验 / 修复下游 skill 对 discipline 的引用

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md`(校验,可能无改动)
- Modify: `skills/writing-plans/SKILL.md`(repoint)

**背景**:两个已分发 skill 引用 discipline。SDD 用 `forge:` 命名空间引用 §1/§3.2/§3.3;writing-plans 用 `.claude/skills/...` 路径引用且指向已删的 `§5 Case 09`。

- [ ] **Step 1: 校验 SDD 的 3 处引用 §号仍对得上**

```bash
grep -n "forge:subagent-driven-discipline" skills/subagent-driven-development/SKILL.md
grep -n "^## §1\|^### §3.2\|^## §3\|§3.2\|§3.3" skills/subagent-driven-discipline/SKILL.md
```

SDD `SKILL.md` L108 引 `§1 taxonomy`、L125 引 `§3.2`、L139 引 `§3.3`。确认净化版 discipline 里 `§1` / `§3.2` / `§3.3` 三个 section 仍存在(净化只删 §5 case study + §2/§3 实证叙事,不删 §1/§3.2/§3.3 标题)。**若三处都在 → SDD 无需改动,跳过 Step 2。** 若某 §号确实变了 → 改 SDD 对应引用为真实 §号。

- [ ] **Step 2:(条件)修 SDD 引用**

仅当 Step 1 发现 §号不符时执行:改 `skills/subagent-driven-development/SKILL.md` 对应行的 `§x` 为净化版 discipline 的真实 §号。

- [ ] **Step 3: 定位 writing-plans 的 discipline 引用**

```bash
# (i) 含 subagent-driven-discipline 字样的引用
grep -n "subagent-driven-discipline" skills/writing-plans/SKILL.md
# (ii) 不含 skill 名、但指向 discipline §5 Case 09 的裸引用
grep -n "Case 09\|§1264" skills/writing-plans/SKILL.md
```

预期命中(原件状态,共 6 处):
- L175:`(`.claude/skills/subagent-driven-discipline/SKILL.md` §5 Case 09 §1264 沉淀)` —— 指向**已删的 §5 Case 09**。
- L178:`假定 subagent-driven-discipline/SKILL.md §"STOP Triggers"(实际 段在 subagent-driven-development/SKILL.md)` —— 叙述「STOP Triggers 不在 discipline」,非真引用 discipline 内容。
- L183:`...Codex external review 也兜底找到字面错(Case 09 §1264 Pattern S REINFORCE)` —— **裸 `Case 09` 引用**(不含 skill 名,grep (i) 抓不到、grep (ii) 才命中),指向已删 case。
- L207:`沿 .claude/skills/subagent-driven-discipline/SKILL.md §2.1.1 external protocol assumption verify P-5 协议` —— §2.1.1 P-5 **协议本身净化后保留**(Task 5 只删实证叙事)。
- L209:`.claude/skills/subagent-driven-discipline/SKILL.md §5 Case 09 §1264 Pattern S REINFORCE` —— 指向**已删的 §5 Case 09 + 已消失的 Pattern S**。
- L218:`...**不假定 prefix**(沿 Case 09 §1264 + plan-v1.1 §14 v3 自身实证)` —— **裸 `Case 09` 引用**(grep (i) 抓不到、grep (ii) 才命中),指向已删 case。

- [ ] **Step 4: 确认净化版里哪些 anchor 还在(verify-then-repoint)**

```bash
grep -n "§2.1.1\|External Protocol Assumption" skills/subagent-driven-discipline/SKILL.md
grep -n "Pattern S\|§5 Case 09" skills/subagent-driven-discipline/SKILL.md
```

预期:`§2.1.1`(External Protocol Assumption Verify)**存在**;`§5 Case 09` 与 `Pattern S` **不存在**(已随 §5 删除)。

- [ ] **Step 5: repoint writing-plans 的 6 处引用**

按以下规则改 `skills/writing-plans/SKILL.md`(路径形式 → `forge:` 命名空间形式,且不指向已删内容):

- **L207**:`.claude/skills/subagent-driven-discipline/SKILL.md §2.1.1 external protocol assumption verify P-5 协议` → `forge:subagent-driven-discipline §2.1.1 External Protocol Assumption Verify 协议`(§2.1.1 协议净化后保留,直接换命名空间)。
- **L175**:该处是括注 `(`.claude/skills/...` §5 Case 09 §1264 沉淀)`,指向已删 case。**删掉这个括注的悬空指针部分**,保留 writing-plans 自身的「plan-9z plan v1 起草字面错 4 处」叙事(那是 writing-plans 的自有内容,不依赖 discipline)。即把 `(`.claude/skills/subagent-driven-discipline/SKILL.md` §5 Case 09 §1264 沉淀)` 整个括注删除或改为不含 `§5 Case 09` 的中性说法。
- **L209**:`参考 case:`.claude/skills/subagent-driven-discipline/SKILL.md` §5 Case 09 §1264 Pattern S REINFORCE — 4 处字面错` → 因 §5 Case 09 与 Pattern S 已不存在,改为指向**仍存在**的协议:`参考:forge:subagent-driven-discipline §2.1.1 External Protocol Assumption Verify`;删去 `§5 Case 09 §1264 Pattern S REINFORCE` 字面。
- **L178**:`subagent-driven-development/SKILL.md` 路径 → 命名空间形式 `forge:subagent-driven-development`(顺手统一命名空间;该处本就是说「STOP Triggers 在 SDD 不在 discipline」,语义不变)。
- **L183**:裸引用括注 `(Case 09 §1264 Pattern S REINFORCE)` 指向已删 case。**删掉这个括注**,保留句子主体(如 `...Codex external review 也兜底找到字面错。`)。注意:同句更前面的 `(Pattern S)` 是 writing-plans 自身的概念命名 —— **保留不动**。
- **L218**:括注 `(沿 Case 09 §1264 + plan-v1.1 §14 v3 自身实证)` → 删去 `Case 09 §1264 + ` 部分,保留 `(沿 plan-v1.1 §14 v3 自身实证)`(`plan-v1.1 §14` 是 writing-plans 自身既有 anchor,不在本移植 scope)。

> writing-plans 自身仍残留 `plan-9z`/`plan-v1.1` plan 名、以及自身的「Pattern S」概念 —— 那是 writing-plans 的**既有**状态,**不在本移植 scope 内**;本 Task 只消除指向 discipline 已删内容(§5 Case 09 / §1264)的悬空引用,不顺手净化 writing-plans。

- [ ] **Step 6: 校验 + build**

```bash
# (i) discipline 引用均为 forge: 命名空间形式
grep -n "subagent-driven-discipline" skills/writing-plans/SKILL.md
# (ii) 无指向 discipline 已删内容的悬空引用(含裸引用)
grep -n "Case 09\|§1264\|\.claude/skills/subagent-driven" skills/writing-plans/SKILL.md
```

Expected:(i) 所有命中均为 `forge:subagent-driven-discipline` / `forge:subagent-driven-development` 形式;(ii) 无输出 —— `§5 Case 09` / `§1264` / `.claude/skills/` 悬空字样全部清除。(注:writing-plans 自身的「Pattern S」概念允许保留,故 grep 不含 `Pattern S`。)

```bash
pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add skills/writing-plans/SKILL.md skills/subagent-driven-development/SKILL.md src/core/templates/skills/
git commit -m "fix(skills): repoint writing-plans 对 discipline 的悬空引用,校验 SDD 引用"
```

---

## Task 13: 全量验证 + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 写 CHANGELOG 条目**

`CHANGELOG.md` 的 `## [Unreleased]` → `### Added` 段(已有 `workflow-monitor` 一条)追加:

```markdown
- **subagent-driven-discipline**:移植 `superpowers:subagent-driven-development` 的第三方 companion skill 为 forge plugin 第 17 个 skill `forge:subagent-driven-discipline` —— subagent 任务类型 taxonomy + cheap-model 可靠性 playbook + Trigger Type Matrix retrospect。净化掉 27+1 条项目锚点(§5 case study 全清、实证叙事删除、真实路径/变量/codex 命令占位符化、出处中性化),作为零项目信息的 generic 工作流初始技能。补全 `subagent-driven-development` / `writing-plans` 早已假定存在的依赖。详见 `docs/specs/2026-05-16-subagent-driven-discipline-port-design.md`。
```

- [ ] **Step 2: 净化完整性最终扫描**

```bash
grep -rniE "forgeue|forge-eval/runner|scripts/build\.ts|IMPL_FILES_JSON|codex-companion|codex_review_round|plan-9[a-z]|plan-v1\.1|PR #[0-9]|ForgeUE|inherited from|superpowers:[a-z]" skills/subagent-driven-discipline/
```

Expected: 无输出。若有命中 → 回对应净化 Task 补改后重跑。

- [ ] **Step 3: format 归一 + 按 CI 顺序全量验证**

```bash
pnpm format        # 主动归一全仓(prettier --write .)—— 见下方说明,必须先跑
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
```

Expected: 全 PASS。重点关注:
- **`pnpm format` 必须主动先跑**:本计划 Task 1-12 各 commit 只跑了 `pnpm build`、未跑 prettier,复制来的原件 SKILL.md / 新增 yaml / 改过的 ts 很可能不符合 prettier。`pnpm format`(`prettier --write .`)会**改写本计划前序 Task 已提交过的多个文件** —— 这些改写必须在 Step 4 一并提交,否则工作树残留未提交改动、状态不一致。
- `format:check` 是 CI 硬门槛;`pnpm format` 跑过后它应直接 PASS。
- `pnpm test` 含 `registry.test.ts`(16 项)、`skills.test.ts`(`it.each` 覆盖 discipline + 净化回归锁 + references 镜像)、`smoke.test.ts`(顶层 skill 数 16)、`forge-eval/load-skill.test.ts`(16 skill 全 bootstrap)、`forge-eval/load-scenario.test.ts`(新 yaml 合法)。
- `pnpm test` 末尾 release gate(`it.todo` 计数)不受本计划影响 —— 本计划未加 `it.todo`。

- [ ] **Step 4: Commit(CHANGELOG + format 归一改动)**

```bash
git status --short   # add 前:看 pnpm format 改写了哪些文件
# 显式 add 本计划涉及的全部路径 —— 不用 git add -A:prettier --write . 是全仓写入,
# add -A 会把范围外文件、未跟踪文件(如本 plan .md)一并 staged,违反最小提交。
# 下列即本计划 File Structure 表的全部路径 + CHANGELOG + 本 plan 文档:
git add CHANGELOG.md \
        docs/plans/2026-05-16-plan-subagent-driven-discipline-port.md \
        skills/subagent-driven-discipline \
        skills/subagent-driven-development/SKILL.md \
        skills/writing-plans/SKILL.md \
        scripts/copy-templates.mjs \
        src/core/templates/skills \
        tests/core/templates/registry.test.ts \
        tests/core/templates/skills.test.ts \
        tests/smoke.test.ts \
        tests/forge-eval/load-scenario.test.ts \
        forge-eval/scenarios/subagent-driven-discipline.yaml
git status --short   # add 后:本计划范围内不应再有未 staged 改动
git commit -m "docs(changelog): subagent-driven-discipline 移植 + prettier 归一"
```

> add 后的 `git status --short`:若本计划范围内仍有 modified/untracked 未 staged → 补 add(对照 File Structure 表查漏);若出现**范围外**文件被 `pnpm format` 改写 → 停下核实(理论上不应有 —— dev 分支 CI 已保证 prettier 干净,format 只会动本计划碰过的文件)。

- [ ] **Step 5: 收尾**

实现完成、全部验证通过后,用 `superpowers:finishing-a-development-branch` skill 决定合并方式(merge / PR / 清理)。

---

## Self-Review(计划对照 spec)

**Spec 覆盖**:
- spec §3 改动面 8 行 → Task 1(新增 SKILL.md/references ×2)、Task 9(copy-templates)、Task 10(SKILL_NAMES + registry.test + skills.test + smoke.test —— 已补 spec 漏列的 skills.test.ts、及 Codex Round 1 发现漏列的 smoke.test.ts)、Task 12(SDD/writing-plans 校验)。✓
- spec §4 净化 27 锚点 → Task 3(B-01/02/25/26/27 + I7)、Task 4(B-23/24)、Task 5(B-03/04/05/06)、Task 6(B-07/08/09/10)、Task 7(B-11~20)、Task 8(B-21/22)。27 条全覆盖 + I7 漏列项补入 Task 3。✓
- spec §4.4 / D-05 Type 对齐 → Task 6 Step 5(已判定 Type 6/7 随 §5 删,§3.4 不动)。✓
- spec §5 命名空间化 → Task 2。✓
- spec §6 references 同步机制 → Task 9。✓
- spec §7 测试纪律 → Task 13;§7「不配 eval」已被 I1-A 决议作废 → Task 11 补 scenario。✓
- spec §8 三个精确化点 → 净化按 § 分块(Task 3-8)、copy-templates 形态(Task 9 给出 `syncSkillReferences()` 完整实现)、forge-eval 连带影响(已核实并由 Task 11 解决)。✓

**Placeholder 扫描**:净化 Task(3-8)因 SKILL.md 达 ~187KB 无法逐字预贴 old/new 文本,但每条锚点都给了精确位置(§号/行号定位命令)、净化类别(删/占位/中性化)、目标形态与校验命令 —— 这是 doc 净化的具体指令,非「TODO/待补」。代码类 Step(Task 9 `syncSkillReferences()`、Task 10 registry、Task 11 yaml)均贴完整内容。✓

**类型一致性**:`SKILL_NAMES` 新增项 `'subagent-driven-discipline'` 在 index.ts / registry.test.ts `toEqual` / skills.test.ts 索引断言 / forge-eval re-export 四处名称一致;scenario yaml `skill:` 字段、文件名、`loadScenarioFile` 参数三处一致。✓
