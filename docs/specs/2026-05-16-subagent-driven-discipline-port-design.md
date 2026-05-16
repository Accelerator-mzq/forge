# Forge 移植 subagent-driven-discipline 设计文档

- **作者**:msc(由 Claude Opus 4.7 协助 brainstorming)
- **日期**:2026-05-16
- **状态**:草案,待用户审阅(设计已口头 approve;spec 落盘供新会话接续)
- **目标**:把 `subagent-driven-discipline`(`superpowers:subagent-driven-development` 的第三方 companion skill)**移植**进 forge plugin,产出 forge 第 17 个 skill `forge:subagent-driven-discipline`,配套 `forge:subagent-driven-development` —— 同时净化掉它残留的所有项目锚点,使其作为面向各类项目的 forge 工作流初始技能不夹带任何其它项目信息。

---

## 0. 决策快照

| #   | 决策             | 选项                                                                                          |
| --- | ---------------- | --------------------------------------------------------------------------------------------- |
| 1   | 性质             | **移植** —— 跟 forge 当初移植其它 16 个 superpowers skill 同模式;原件不动,仅作源材料         |
| 2   | 形态             | **独立 skill** —— forge plugin 第 17 个 skill,完整保留 §1-§9 + `references/` 结构             |
| 3   | 内容范围         | **净化** —— 清掉所有项目锚点(27 条 audit,见附录 A),做成真正零项目信息的 generic skill      |
| 4   | §5 case study    | **全删,留 `Case <NN>` 空模板** —— 符合 README「§5 ship 时 0 case」设计;下游各项目自己增长   |
| 5   | registry         | **进 `SKILL_NAMES`**(15 → 16)+ 更新 `registry.test.ts`                                       |
| 6   | references/ 同步 | **改 `copy-templates.mjs`** 加 skill 自带 `references/` 子目录的同步逻辑                       |
| 7   | forge-eval       | **不配 eval scenario** —— discipline 是 controller 侧纪律参考,非「被 invoke 塑造行为」型 skill |

---

## 1. 背景与动机

### 1.1 触发问题:一个 dangling reference

forge 已分发的 `skills/subagent-driven-development/SKILL.md`(16 skill 之一)正文有 **3 处**明文引用,且用 `forge:` 命名空间前缀:

- line 108:「model 选型 matrix(沿 `forge:subagent-driven-discipline` §1 taxonomy)」
- line 125:「cross-verify 五类(沿 `forge:subagent-driven-discipline` §3.2)」
- line 139:「decision tree(沿 `forge:subagent-driven-discipline` §3.3)」

`skills/writing-plans/SKILL.md` 也命中引用。但 `SKILL_NAMES` registry(`src/core/templates/skills/index.ts`)只有 15 个,**不含** `subagent-driven-discipline`;`skills/` 目录里也没有它。它的实体只在 `forge-repo/.claude/skills/subagent-driven-discipline/`(仓库的项目级开发配置)。

**结果**:用户跑 forge 工作流、invoke `subagent-driven-development` skill,读到「沿 `forge:subagent-driven-discipline` §1」,但环境里根本没有这个 forge skill 可 invoke —— 这是一个 **dangling reference**。

### 1.2 根因

`subagent-driven-discipline` 是 `superpowers:subagent-driven-development` 的**第三方 companion skill**(从 ForgeUE 项目抽出的 generic 版,被 drop 进 forge-repo 的 `.claude/` 当本地开发工具)。forge 当初把 `superpowers:subagent-driven-development` 移植进 plugin 时,**漏带了它的 companion** `subagent-driven-discipline`。plan-v1.1 Task 2/3 把 discipline 的 §1/§3.2/§3.3 摘进 SDD SKILL.md 并标 `forge:` 前缀 —— 一路假定它会是 forge 的一部分,但「正式移植进 plugin」这一步从未做。

### 1.3 本设计的本质

**补全这次漏带的移植**。不是新功能 —— 是把一个 forge 工作流已经假定存在的依赖真正纳入。

---

## 2. 性质:移植,不是搬运

forge 现有的 16 个 skill **全部是从 superpowers 移植来的**(`brainstorming` / `writing-plans` / `test-driven-development` / `subagent-driven-development` 等)。移植后它们成为 `forge:` 命名空间版本,superpowers 原版照旧存在 —— 两份同源、独立维护。

本设计对 `subagent-driven-discipline` 做同样的移植:

- **原件**(`.claude/skills/subagent-driven-discipline/`):superpowers SDD 的第三方 companion,留在 forge-repo `.claude/` **不动** —— 它有自己的用途(forge-repo 开发者配合 `superpowers:subagent-driven-development` 时的纪律参考)。**仅作移植的源材料。**
- **移植版**(新建 `skills/subagent-driven-discipline/`):以原件为源,复制 → forge 命名空间化 → 净化项目锚点。这是 forge plugin 第 17 个 skill。

两份的关系如同 forge 的 `brainstorming` 与 superpowers 的 `brainstorming` —— 同源、各自独立。

> **重要**:本设计**不处置原件**。早期 brainstorming 中曾误把原件当成「要被净化消费掉的源、需决定删留」,此前提已撤销。移植 = 产出新副本,原件照旧。

---

## 3. 改动面

| 改动                                  | 类型   | 说明                                                                                      |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `skills/subagent-driven-discipline/SKILL.md` | 纯新增 | 以原件 SKILL.md 为源,净化 + forge 命名空间化                                              |
| `skills/subagent-driven-discipline/references/codex-tools.md` | 纯新增 | audit 确认干净,直接搬(superpowers: 引用如有需 forge 命名空间化)                          |
| `skills/subagent-driven-discipline/references/opencode-tools.md` | 纯新增 | 同上                                                                                      |
| `src/core/templates/skills/index.ts`(`SKILL_NAMES`) | 改现有 | 加 `subagent-driven-discipline`,15 → 16                                                   |
| `tests/core/templates/registry.test.ts` | 改现有 | 数量断言 15→16 + `toEqual` 数组同步加一项                                                 |
| `scripts/copy-templates.mjs`          | 改现有 | 加「skill 自带 `references/` 子目录」的同步逻辑(见 §6)                                   |
| `skills/subagent-driven-development/SKILL.md` | 改现有(校验) | 净化删了 §5、改了 §2/§3,§号会移位 —— 核对 3 处 `forge:subagent-driven-discipline §x` 引用的 §号在净化版仍对得上,不对则修引用 |
| `skills/writing-plans/SKILL.md`       | 改现有(校验) | 同上,校验其引用                                                                          |

> 改 `skills/` 后必跑 `pnpm build`(`copy-templates.mjs` 反向同步到 `src/core/templates/` + `dist/`)。

---

## 4. 净化范围与标准

audit 出 **27 条项目锚点**(完整清单见**附录 A**)。净化按以下 3 类标准处理:

### 4.1 类 A —— 删除

- **§5 全部 10 个 case study**(B-11~B-20):全删,§5 只留 `Case <NN>` 空模板。符合原件 README「§5 ship 时应为 0 case」的设计 —— case study 是项目实证、天生项目绑定;pattern 教学价值已在 §6 对照表保留;下游各项目用起来后靠 §3.4 retrospect 机制自然增长自己的 case。
- **§2/§3 内联「实证(plan-9h…)」叙事段**(B-04、B-05、B-07 实证部分、B-08 实证部分):删实证叙事,只保留通用原则与 dispatch prompt 模板。

### 4.2 类 B —— 占位符化 / 通用化

- 真实文件路径(`forge-eval/runner/registry.ts`、`scripts/copy-templates.mjs` 等,B-03)→ `<eval-runner-registry>` 类占位符,或抽象成通用描述。
- codex slash 命令名(`/codex:adversarial-review` 等)、`codex-companion.mjs`、`codex_review_round1.md`(B-09、B-10)→ 占位符化。
- 真实变量名 `IMPL_FILES_JSON`(B-23)→ 通用描述(如「JSON serialization silent fail」)。
- argparse 举例(B-24、B-27)→ 中性例子。
- `pnpm format:check` 的「CI 双平台 fail」措辞(B-06)→ 通用措辞(「漏 → CI fail,具体看项目 CI 配置」)。
- `compatibility` 字段的 `python -m pytest`(B-02)→ 去掉技术栈硬编码。
- §6 pattern catalog 的 `see §5 Case XX` 悬空引用(B-21、B-22)→ 改通用描述。

### 4.3 类 C —— frontmatter / README 出处中性化

- frontmatter `author: forgeue project`(B-01)→ 中性(如 `community` 或 `<project>`)。
- README「从 ForgeUE 项目抽出」(B-25)→ 中性表述或删出处。
- README License「inherited from ForgeUE」(B-26)→ 仍 MIT,attribution 改中性表述。

### 4.4 附带 —— §3.4 Type 定义对齐(audit D-05)

§5 清空后,原 §5 case 用过的 `Type 6`/`Type 7` 失去实例,而 §3.4 Trigger Type Matrix 只定义 Type 1-5。净化时一并处理:若 Type 6/7 概念通用 → 补进 §3.4 正式定义;若纯属 case 特设 → 随 §5 删除而消失。

---

## 5. forge 命名空间化

- 根 `skills/` 那份 frontmatter 保持 `name: subagent-driven-discipline` **无前缀**(plugin namespace 隐含 `forge:`,与其它 16 skill 一致;`copy-templates.mjs` reverse-sync 到 legacy templates 时会自动加 `forge:` 前缀 —— 见 `copy-templates.mjs:49`)。
- 正文里 `Companion to superpowers:subagent-driven-development` 等引用 → 改 `forge:subagent-driven-development`(移植版配套 forge 体系的 SDD)。
- `references/` 两个文件里如有 `superpowers:` 引用,同样改 `forge:`。

---

## 6. 机制(已探索确认)

- `copy-templates.mjs` 的 `syncSkills()` 是**目录驱动**的(扫 `skills/` 下每个含 `SKILL.md` 的目录就同步)→ 新建 `skills/subagent-driven-discipline/SKILL.md` **会被自动同步**到 `src/core/templates/skills/` + `dist/`,对 SKILL.md 本身零改 `copy-templates.mjs`。
- 但 `syncSkills()` **只读 `<name>/SKILL.md` 这一个文件,忽略 skill 目录下的子目录** → discipline 的 `references/` 子目录不会被同步到 legacy/npm 形态。需在 `copy-templates.mjs` 新增「skill 自带 `references/` 子目录」的同步逻辑(可参考既有 `syncSharedSkillDocs()` 同步 `skills/_shared/` 的模式)。
- 进 `SKILL_NAMES` → `loadAllSkills()` 能加载它、`registry.test.ts` 锁住数量。

> 现存小不一致(背景知识):`src/core/templates/skills/` 实际有 16 个 `.md`(含 `process-evidence.md`,因 `syncSkills` 目录驱动会带上它),但 `SKILL_NAMES` 只列 15 个 —— `process-evidence` 被 copy-templates 同步却没进 registry。本设计让 `subagent-driven-discipline` **正式进 `SKILL_NAMES`**,不照搬 `process-evidence` 的疏漏。

---

## 7. 测试 / 纪律

- 改 `skills/` 必跑 `pnpm build`(双源同步);push 前全量 `pnpm lint` → `format:check` → `typecheck` → `build` → `test`(CI 同序)。
- `registry.test.ts` 数量断言更新(15→16)。
- **不配 forge-eval scenario** —— discipline 是 controller 侧纪律参考,不是「被 invoke 后塑造 subagent 行为」的典型 skill,forge-eval 的 RED/GREEN 双轨评测不适用(YAGNI)。
- `CHANGELOG.md` 按 Keep a Changelog 记一条。

---

## 8. 留 writing-plans 阶段精确化

- **净化执行方式** —— `SKILL.md` 是约 90200 token 的巨文件,27 条锚点散布其中:逐条改 vs 按 § 分块净化。建议按 § 分块(§1-§9 + frontmatter + README)。
- **`references/` 同步改 `copy-templates.mjs` 的具体形态** —— 函数签名、是否复用 `syncSharedSkillDocs` 模式。
- **进 `SKILL_NAMES` 对 forge-eval 的连带影响** —— audit B-03 提到 forge-eval 有自己的 registry(`forge-eval/runner/registry.ts`,与 `templates/skills/index.ts` 的 `SKILL_NAMES` 是两回事)。writing-plans 阶段需对照确认:加一个 skill 会不会被 forge-eval runner 强制要求配对应 scenario yaml;若强制,§7「不配 eval」需重审。

---

## 附录 A —— 27 条项目锚点 audit 清单

audit 由独立 subagent 通读原件全文(`SKILL.md` ~90200 tokens + `README.md` + `references/` 两文件)产出。`references/` 两文件**确认零锚点**。

| 编号 | 位置 | 内容性质 | 严重度 | 处理(类) |
| ---- | ---- | -------- | ------ | ---------- |
| B-01 | frontmatter `metadata.author` | `forgeue project` 项目名 | HIGH | C 中性化 |
| B-02 | frontmatter `compatibility` | `python -m pytest` 技术栈硬编码 | MEDIUM | B 通用化 |
| B-03 | §2.1 P-5 | 真实文件路径 `forge-eval/runner/registry.ts`、`scripts/build.ts`、`copy-templates.mjs` | HIGH | B 占位符化 |
| B-04 | §2.1.1 P-5 实证段 | plan-9h Task 4 实战 + 真实路径/变量/skill 名 | HIGH | A 删 |
| B-05 | §2.1.2 cross-cutting 回写 hook | plan-9g/plan-v1.1 真实 plan + 文件路径 | HIGH | A 删 |
| B-06 | §2.1 Self-Review Checklist | `pnpm format:check`「CI 双平台 fail」措辞(forge CI 特有) | LOW | B 通用化措辞 |
| B-07 | §3.3.1 P-6 整节 | 整节建立在 forge-eval 专有工具上 + plan 名 | HIGH | B 抽象(留通用原则,去 forge-eval 专有) |
| B-08 | §3.3.2 P-8 整节 | `forge-eval`/`SKILL_NAMES`/`plan-9 序列` 专有术语 | HIGH | B 抽象 |
| B-09 | §3.4.0 Type 5 行 | `/codex:adversarial-review` / `/codex:review` slash 命令名 | MEDIUM | B 占位符化 |
| B-10 | §3.4.5 Type 5 | codex slash 命令名 + `codex-companion.mjs` + `codex_review_round1.md` | HIGH | B 占位符化 |
| B-11 | §5 Case 01 | forge-repo / Plan 7 Phase A / legacy-bridge,PR #11 | HIGH | A 删 |
| B-12 | §5 Case 02 | forge-repo / Plan 7 Phase B2,PR #14 | HIGH | A 删 |
| B-13 | §5 Case 03 | forge-repo / Plan 7 Phase B3,PR #16 | HIGH | A 删 |
| B-14 | §5 Case 04 | forge-repo / Plan 9j,commit SHA | HIGH | A 删 |
| B-15 | §5 Case 05 | forge-repo / Plan 9g,PR #29 + commit SHA | HIGH | A 删 |
| B-16 | §5 Case 06 | forge-repo / Plan 9e2,md5 值 | HIGH | A 删 |
| B-17 | §5 Case 07 | forge-repo / Plan 9f,commit SHA | HIGH | A 删 |
| B-18 | §5 Case 08 | forge-repo / Plan 9h,commit SHA | HIGH | A 删 |
| B-19 | §5 Case 09 | forge-repo / Plan 9z,v1.0.0 tag + commit SHA | HIGH | A 删 |
| B-20 | §5 Case 10 | forge-repo / plan-stage-extensions,commit SHA | HIGH | A 删 |
| B-21 | §6 Pattern Catalog 首行 | `plan-v1.1 Task 0 §14` 内部计划引用 | MEDIUM | B 改通用 |
| B-22 | §6 Pattern Catalog 多行 | `see §5 Case XX` 悬空引用(§5 清空后) | MEDIUM | B 改通用 |
| B-23 | §1.3 takeaway | 真实变量名 `IMPL_FILES_JSON` | HIGH | B 通用描述 |
| B-24 | §1.1.2 | argparse 举例(Python 技术栈特有) | LOW | B 中性例子 |
| B-25 | README L7 | 「从 ForgeUE 项目抽出」 | HIGH | C 中性化 |
| B-26 | README License 段(中英各一) | 「inherited from ForgeUE」 | HIGH | C 中性化(仍 MIT) |
| B-27 | README 定制点表格 | argparse `.py` / slash command 举例 | LOW | B/C 中性化 |

**严重度分布**:HIGH 20 / MEDIUM 4 / LOW 3。**§分布**:frontmatter 2、§1 2、§2 4、§3 4、§5 10、§6 2、README 3、`references/` 0。

### 灰色地带(净化执行时判断,audit D 段)

- **D-01**:§3.4.5 Type 5 整体定位通用,但 Trigger 描述用了 forge 专有 slash 命令名 —— 措辞问题,占位符化即可。
- **D-02**:§2.1 `pnpm format:check` 强调程度 —— 算举例还是规范,介于 LOW/MEDIUM(已列 B-06)。
- **D-03**:§3.4.2 Type 2 的「parallel dispatch 命令模板」—— 半通用半项目化,有 forge plugin 时是 native。
- **D-04**:§6 与 §5 清空后的悬空引用 —— generic 版是保留 §6 pattern 行(改引用)还是一并清空 §6。**建议保留 §6**(pattern 对照表有通用价值),仅改引用。
- **D-05**:§5 Type 6/7 与 §3.4 只定义 Type 1-5 的不一致 —— 见 §4.4,净化时对齐。

---

## 9. 实施阶段建议(供 writing-plans 细化)

| 阶段 | 内容 |
| ---- | ---- |
| P1 | 复制原件 → `skills/subagent-driven-discipline/`(SKILL.md + references/);forge 命名空间化(§5) |
| P2 | 净化 SKILL.md —— 按 § 分块处理 27 条锚点(类 A 删 / 类 B 占位符化 / 类 C 中性化 + §4.4 Type 对齐) |
| P3 | 净化 README;references/ 两文件 superpowers→forge 命名空间化 |
| P4 | 接 forge 基建:`SKILL_NAMES` 15→16、`registry.test.ts` 更新、`copy-templates.mjs` 加 references/ 同步 |
| P5 | 校验 SDD/writing-plans SKILL.md 的 `forge:subagent-driven-discipline §x` 引用 §号;`pnpm build` + 全量验证;CHANGELOG |
