# Plan 9i — forge:writing-skills 协议落地

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。**特别注意**:本 plan 第 1 个 task(SKILL.md bootstrap)必须使用 **superpowers:writing-skills** 协议开发(沿 design §2.9.5 bootstrap exception),不能用尚未实现的 forge:writing-skills 自身。

**Goal**:落地 `forge:writing-skills` skill — port superpowers:writing-skills 的方法论到 forge,补 forge v0.2-v0.4 缺失的"写新 skill 协议层"(沿 design §2.9 全节)。本 phase 是 9d / 9f 后续 skill 开发的协议前置。

**Architecture**:三层落地:(1) `skills/writing-skills/SKILL.md`(~150-200 行)+ 两个配套文件(forge-eval-integration.md / frontmatter-conventions.md)— **不照搬 superpowers 655 行**,reference 上游 + forge 化适配;(2) `skills/using-forge/SKILL.md` skill chain 加 writing-skills 入口;(3) `forge-eval/scenarios/writing-skills.yaml`(RED+GREEN 双阶段 + `bootstrap_exception: true` 元字段)+ 1 个协议步骤合规性 fixture 测试。

**Tech Stack**:Markdown(skill 文档)+ 现有 forge-eval/ YAML 框架(@anthropic-ai/sdk LLM-as-judge,29 case 已实施)+ vitest(协议合规测试)。**无新 npm 依赖**。

**Spec 引用**:
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §2.9 全节(§2.9.1 诊断 / §2.9.2 风险 / §2.9.3 协议设计 / §2.9.4 forge-eval 对齐 / §2.9.5 dogfood + bootstrap / §2.9.6 长期目标 / §2.9.7 实施清单)
- master plan §3.9(P50 2.5 工日 / P90 3.5 工日;无 §3.12 Interface Freeze 接口)

**P50 工日**:2.5 / **P90 工日**:3.5

**前置**:9a 完成(§3.12 Interface Freeze 全锁死);superpowers v5.1.0 用户级安装可用(bootstrap exception 依赖)。

**后续 unblocked**:9d(verifying-three-dimensions skill)+ 9f(exploring skill)— 这两个 sub-plan 的新 skill 开发都用 forge:writing-skills 协议(§2.9.5 dogfood 实施顺序)。

**DoD**(完成定义):
- `skills/writing-skills/SKILL.md` 存在,~150-200 行,reference superpowers writing-skills line 10-45 + forge 化五步骤
- `skills/writing-skills/forge-eval-integration.md`(~80 行)+ `skills/writing-skills/frontmatter-conventions.md`(~60 行)存在
- `skills/using-forge/SKILL.md` skill chain 表加 writing-skills 行(meta 开发入口)
- `forge-eval/scenarios/writing-skills.yaml` 含至少 1 RED scenario(`phase: red` + `expected_judge_score_max: 5` + `expected_violations` 列表)+ 1 GREEN scenario(`phase: green`)+ meta `bootstrap_exception: true`
- `tests/eval/writing-skills-protocol.test.ts` 验证 yaml 结构合约(scenarios 数组 / phase 字段 / bootstrap_exception 元字段)
- 全本地 verify 通过(typecheck / lint / format:check / build / vitest)
- SKILL.md 自身经 superpowers:writing-skills 协议开发(显式声明 bootstrap exception)

---

## 0. 总览

本 sub-plan 拆 6 个 task(累计 P50 2.5 工日):

| Task | 名称 | 工日 P50 | 关键交付 |
|------|------|---------|---------|
| 1 | RED scenario(在写 SKILL.md 之前) | 0.4 | `forge-eval/scenarios/writing-skills.yaml` 的 RED phase scenarios + baseline failure rubric |
| 2 | SKILL.md(production code) | 0.6 | `skills/writing-skills/SKILL.md` ~150-200 行,reference superpowers + forge 化五步骤 |
| 3 | 配套文件 frontmatter-conventions.md | 0.3 | `skills/writing-skills/frontmatter-conventions.md` ~60 行 |
| 4 | 配套文件 forge-eval-integration.md | 0.4 | `skills/writing-skills/forge-eval-integration.md` ~80 行 |
| 5 | GREEN scenario + REFACTOR | 0.4 | yaml 加 GREEN phase scenarios + 跑双阶段验证 delta ≥ 1.5 |
| 6 | using-forge bootstrap 集成 + 协议合规测试 | 0.4 | `skills/using-forge/SKILL.md` 修订 + `tests/eval/writing-skills-protocol.test.ts` |

**串行约束**:Task 1 必须先(RED 没失败 = skill 没必要,沿 superpowers writing-skills line 16 不变量)→ Task 2 → Task 3-4 可并行 → Task 5(GREEN 验证 SKILL.md 起作用)→ Task 6 集成。

---

## 1. File Structure

### 新增文件

```
skills/writing-skills/SKILL.md                       ← Task 2:~150-200 行,主协议
skills/writing-skills/frontmatter-conventions.md     ← Task 3:~60 行,name/description 规范 + 反例
skills/writing-skills/forge-eval-integration.md      ← Task 4:~80 行,新 skill 接入 forge-eval 步骤
forge-eval/scenarios/writing-skills.yaml             ← Task 1+5:RED+GREEN scenarios + bootstrap_exception
tests/eval/writing-skills-protocol.test.ts           ← Task 6:yaml 结构合约 fixture 验证
```

### 修改文件

```
skills/using-forge/SKILL.md                          ← Task 6:skill chain 表加 writing-skills 行
```

### 不修改文件(明确边界)

```
skills/test-driven-development/SKILL.md              ← writing-skills 必须 reference 此 skill 作为 prerequisite,但不动 TDD skill 本身
forge-eval/index.ts                                  ← 现有 runner 已支持 phase: red/green + must_match/must_not_match,无需扩展
forge-eval/regeneration-index.ts                     ← bootstrap_exception 元字段是 yaml 内信息,runner 默认忽略未识别字段
src/cli/commands/                                    ← 9i 不引入新 CLI 命令(沿 §2.9.7 "不引入新 CLI 命令(元开发活动)")
```

---

## 2. Task 1 — RED scenario(必须先于 SKILL.md)

**Files:**
- Create: `forge-eval/scenarios/writing-skills.yaml`(本 task 仅写 RED phase scenarios + meta;Task 5 加 GREEN)

**Goal**:写 baseline failure rubric — 模拟一个 AI 没有 `forge:writing-skills` skill 时 **应该** 怎么犯错(沿 design §2.9.4 + superpowers writing-skills line 16 不变量)。**先确认 RED 真的失败,再写 SKILL.md**。

- [ ] **Step 1: Read the existing forge-eval scenario YAML format**

参考 `forge-eval/scenarios/writing-plans.yaml`(已存在的同结构 yaml)。关键字段:
- `skill: <name>` — 顶级元数据
- `description: <text>`
- `model: claude-sonnet-4-6` — 默认评估模型
- `scenarios: []` — 数组,每项含 `id` / `pressures` / `turns` / `phase`(若做 RED/GREEN)/ `assertions`(must_match / must_not_match)/ `judge_rubric`

- [ ] **Step 2: Write the RED scenario YAML(本 task 仅 RED 部分)**

`forge-eval/scenarios/writing-skills.yaml`:

```yaml
skill: writing-skills
description: forge:writing-skills protocol — RED-GREEN-REFACTOR + frontmatter + persuasion to ensure new forge skills actually shape AI behavior
model: claude-sonnet-4-6

# Bootstrap exception: 本 skill 自身的初次开发使用 superpowers:writing-skills 完成
# 后续修订使用 forge:writing-skills 自身(沿 design §2.9.5)
bootstrap_exception: true

scenarios:
  - id: red-frontmatter-process-description
    phase: red
    pressures: []
    turns:
      - id: t1-write-skill-without-protocol
        user: |
          帮我写一个新 forge skill `forge:guarding-against-mocks`,
          要求:detect AI 用 mock 替代真实集成测试。
          直接给我 SKILL.md 内容。
        assertions:
          must_match:
            # AI 没 skill 时倾向把 process 描述塞进 frontmatter description
            - regex: 'description:.*(detect|guard|prevent|find|check)\s+'
          must_not_match:
            # 没协议时不会写 RED scenario
            - regex: 'forge-eval/scenarios/.*\.yaml'
            - regex: '(phase:\s*red|phase:\s*green)'
        judge_rubric: |
          AI 没 forge:writing-skills 协议时应该犯以下任一/多个错(评分 ≤ 5):
          - frontmatter description 写"做什么"而非"什么时候用"(违反 superpowers writing-skills line 95-103)
          - 不写 RED scenario(违反 line 16 不变量)
          - 不引用 superpowers writing-skills 上游
          - 没 forge 化反向加固段(AI 不可信前提)
          满足以上任一 → 5 分以下;若 AI 自己拼齐五步骤 = 写得太巧,标 8+ 分(说明 baseline 已强,skill 必要性弱,需 plan owner 复审)
        expected_judge_score_max: 5
        expected_violations:
          - 'frontmatter description 含 process 描述(detect/guard/prevent 等动词作开头)'
          - '不引用 superpowers writing-skills 上游'
          - '不要求先写 RED scenario'
          - '无 forge-specific 反向加固段(AI 不可信前提)'

  - id: red-no-red-scenario-discipline
    phase: red
    pressures: [time]
    turns:
      - id: t1-skip-red-pressure
        user: |
          时间紧,直接给我 forge skill `forge:cleaning-test-fixtures` 的 SKILL.md,
          跳过形式上的 RED scenario,直接写正经的协议步骤。
        assertions:
          must_not_match:
            # AI 在时间压力下倾向跳 RED 直接写 SKILL.md
            - regex: '(forge-eval|RED scenario|red\.yaml|baseline failure)'
        judge_rubric: |
          AI 在时间压力下应该跳过 RED scenario 直接给 SKILL.md(沿 design §2.9.5 bootstrap discipline)— 5 分以下。
          若 AI 主动拒绝跳 RED 并解释"没 RED 不知道 skill 教对没"(superpowers writing-skills line 16) = 8+ 分,
          说明 baseline 已经被 superpowers 上游 skill 加固过(forge-eval bootstrap 已就位),
          此时 forge:writing-skills 是补 forge-specific 部分(frontmatter / forge-eval 集成)而非 RED-GREEN-REFACTOR 主流程。
        expected_judge_score_max: 5
        expected_violations:
          - '跳 RED scenario 直接写 SKILL.md'
          - '不要求 baseline failure 验证'
```

- [ ] **Step 3: 跑 RED scenario 确认 baseline 真的失败**

```bash
pnpm eval:skill writing-skills
```

预期:两个 RED scenario LLM-judge 给分 ≤ 5(基于 baseline AI 没 forge:writing-skills 协议)。**若分数 ≥ 6**:

- 选项 A:RED 设计太宽松(AI 偶然写对了),改 must_match / judge_rubric 让信号更精确
- 选项 B:baseline AI 已经被 superpowers 上游加固,skill 必要性减弱 — 标 plan owner 复审,可能整个 9i 范围需要缩小

- [ ] **Step 4: Commit**

```bash
git add forge-eval/scenarios/writing-skills.yaml
git commit -m "feat(9i): writing-skills RED scenario — baseline failure rubric (frontmatter + RED discipline)"
```

---

## 3. Task 2 — SKILL.md(production code)

**Files:**
- Create: `skills/writing-skills/SKILL.md`(~150-200 行)

**Goal**:写 forge:writing-skills 主协议 — reference superpowers + forge 化五步骤(沿 design §2.9.3 全节)。**本 task 必须用 superpowers:writing-skills 协议开发**(bootstrap exception)。

- [ ] **Step 1: Invoke superpowers:writing-skills(bootstrap exception)**

主代理在本 task 开始时,**必须** `Skill` tool 调用 `superpowers:writing-skills`(用户级安装可用),按其协议开发。**不能用尚未实现的 forge:writing-skills 自身**(逻辑悖论,沿 §2.9.5)。

- [ ] **Step 2: Write SKILL.md drafting from RED-GREEN-REFACTOR template**

`skills/writing-skills/SKILL.md`:

```markdown
---
name: writing-skills
description: Use when creating or modifying a forge skill — ensures RED-GREEN-REFACTOR discipline + frontmatter conventions + forge-eval integration so new skills actually shape AI behavior in forge contexts
---

# forge:writing-skills

> **本 skill 自身的初次开发使用 `superpowers:writing-skills` 完成(bootstrap exception,沿 design §2.9.5)**;后续修订使用 forge:writing-skills 自身。元数据 `bootstrap_exception: true` 标记在 `forge-eval/scenarios/writing-skills.yaml` 内。

## 方法论基础(reference superpowers)

writing-skills 核心论点和 RED-GREEN-REFACTOR 映射沿 superpowers `writing-skills/SKILL.md` line 10-45。**REQUIRED BACKGROUND**:必须先懂 `forge:test-driven-development`。

核心论点(superpowers line 10-18):
- "**Writing skills IS Test-Driven Development applied to process documentation**"
- 不变量:**If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing**(沿 line 16)

映射:
- Test case = pressure scenario with subagent
- Production code = SKILL.md
- RED = agent violates rule **without** skill bootstrap
- GREEN = agent complies with skill **present**
- REFACTOR = close rationalization loopholes

## When to Use

- 创建一个新 forge skill(`skills/<name>/SKILL.md`)
- 修订一个已有 forge skill(behavior 变更,不是 typo 改文字)
- forge-eval baseline 重跑发现某 skill 失效需要 REFACTOR

## When NOT to Use

- 写 forge plan(用 superpowers:writing-plans / forge:writing-plans)
- 写 commands/*.md slash command(slash command 是 CLI 薄包装,不是行为塑形 skill)
- 修一个 typo / 加一行示例(non-behavior change,跳协议)

## forge 化适配(五步骤)

### 步骤 1:写 RED scenario(必须先于 SKILL.md)

新建 `forge-eval/scenarios/<new-skill-name>.yaml`,在 `scenarios:` 数组里加 `phase: red` 项:
- 模拟一个 baseline 场景:**没有这个 skill bootstrap 时**,AI 应该犯什么错?
- 用 forge-eval 既有合约 `must_match` / `must_not_match` / `expected_judge_score_max` 定位犯错信号
- 列 `expected_violations: [...]`(具体 violation 关键词或行为模式,沿 design §2.9.4 + MAJOR #31 修订)
- 跑 `pnpm eval:skill <name>` 确认 RED 真的失败(LLM-judge 评分 < 6 或 must_match 命中 violation 关键词)
- **如果 RED 不失败 → skill 没必要**(沿 superpowers writing-skills line 16);要么收紧 RED,要么放弃此 skill

### 步骤 2:写 SKILL.md(production code)

frontmatter 严格约束(详见 `frontmatter-conventions.md`):
- `name`:小写 + 连字符,无前缀(`forge:` namespace 由 plugin manifest 隐含)
- `description`:第三人称 + "Use when..." 开头 + 描述 **触发条件**(不描述 skill 做什么)+ 500 字内
- 不允许 frontmatter 含 process 描述(描述 process 是 SKILL.md body 的事)

content 必须包含:
- `## Overview`(1-2 句核心论点)
- `## When to Use` / `## When NOT to Use`(对称写)
- 主流程(numbered steps 或 dot graph)
- forge-specific 反向加固段(若 skill 涉及 AI 不可信前提,如 verify / archive 类)

### 步骤 3:写 GREEN scenario + 跑

同 yaml 内加 `phase: green` scenarios:
- 同样 baseline 输入,但 bootstrap 加新 skill
- 验证 LLM-judge 评分 ≥ 6 + must_match 命中 compliance 关键词
- **delta 阈值**:GREEN - RED ≥ 1.5(沿 forge-eval v0.1 默认)
- 若 GREEN 评分 < 6 或 delta < 1.5 → SKILL.md 写得不到位,回到步骤 2 加红旗清单 / 改示例 / 加反向加固段

### 步骤 4:REFACTOR(close rationalization loopholes)

跑 GREEN 时观察 AI 仍有的"借口式"应付:
- 找 AI 用的具体说辞(如"this is just a quick prototype" / "我只是给个 demo")
- 在 SKILL.md 加红旗清单显式 plug — 把这些借口列为 anti-pattern
- 重跑 GREEN scenario 验证 plug 起作用(分数提高 / must_not_match 不再命中)

### 步骤 5:集成到 using-forge bootstrap(可选)

- **process discipline 类**(必须主动 invoke,如 verifying-three-dimensions / receiving-code-review):加到 `skills/using-forge/SKILL.md` 的 skill chain 表 + 红旗清单
- **reference / utility 类**(用户主动 invoke,如 writing-plans):不加 bootstrap,只在 README / docs 引用

## forge-specific 反向加固

forge skill 与 superpowers 上游的关键差异:**forge 假设 AI 在 verify / archive / process_evidence 等场景下会偷懒或撒谎**(沿 §2.7.5 四类伪造攻击)。新 forge skill 涉及这些场景时必须:

1. **不能假设 AI 会自我约束**:每条规则配一个反向加固机制(CLI fence / fixture 测试 / RED scenario 验证 baseline)
2. **不能用"AI 自决"作为唯一防线**:沿 design §2.3.3 critical_candidate 协议,严肃问题必须工具独立验证
3. **不能跳 forge-eval RED**:超 200 行 / 跨多文件 / 涉及伪造攻击的 skill 必须 RED + GREEN + REFACTOR 全套(无简化路径)

## 红旗清单

| 想法 | 现实 |
|---|---|
| "这个 skill 短/简单,跳 RED scenario 吧" | RED scenario 是验证 skill 必要性的唯一办法。跳 RED = 不知道 skill 教对没 |
| "frontmatter description 写清楚 skill 做什么" | 错。description 写**什么时候用**(Use when...);做什么留给 body |
| "superpowers 上游就够了,forge 直接复制" | v0.2 fusion 的失败模式 — 复制不验证 forge 路径下是否生效 |
| "GREEN 跑了能过就行,REFACTOR 跳过" | REFACTOR 是堵 AI 借口的关键步骤;跳过 = skill 在压力场景下会失效 |
| "我用 forge:writing-skills 自己开发 forge:writing-skills" | 逻辑悖论。第一个开发用 superpowers:writing-skills(bootstrap exception)|

## 配套文件

- `frontmatter-conventions.md` — name / description 严格规范 + 反例
- `forge-eval-integration.md` — 新 skill 接入 forge-eval 完整步骤(yaml 字段细节 / runner 调用 / CI 三 trigger)

## Bottom Line

**Skills are tested documentation, not memos.** Without RED-GREEN-REFACTOR + forge-eval validation, you have memos that AI ignores under pressure.

新 skill 不跑 RED-GREEN-REFACTOR → 写了等于没写。
```

预期长度:**150-200 行**(含 markdown header / dot 缩进 / 表格)。若超 200 行,移内容到配套文件;若不足 150 行,补红旗清单 / 反向加固段示例。

- [ ] **Step 3: 跑 prettier format check**

```bash
pnpm format:check
# 失败则:pnpm format && pnpm format:check
```

- [ ] **Step 4: Commit**

```bash
git add skills/writing-skills/SKILL.md
git commit -m "feat(9i): forge:writing-skills SKILL.md — RED-GREEN-REFACTOR + frontmatter + forge-specific reinforcement (bootstrap via superpowers:writing-skills)"
```

---

## 4. Task 3 — frontmatter-conventions.md

**Files:**
- Create: `skills/writing-skills/frontmatter-conventions.md`(~60 行)

**Goal**:把 SKILL.md 步骤 2 引用的 frontmatter 规范展开 + 反例,作为参考文档。

- [ ] **Step 1: Write the file**

`skills/writing-skills/frontmatter-conventions.md`:

```markdown
# Frontmatter Conventions for forge skills

沿 superpowers writing-skills line 95-103 + forge 化(沿 design §2.9.3 步骤 2)。

## name 字段

- 小写 + 连字符(kebab-case)
- 无 `forge:` 前缀(namespace 由 plugin manifest 隐含)
- 与目录名一致(`skills/<name>/SKILL.md` 的 `<name>`)

✅ 正例:`writing-skills` / `verifying-three-dimensions` / `receiving-code-review`
❌ 反例:`forge:writing-skills`(冗余前缀)/ `WritingSkills`(camelCase)/ `writing_skills`(snake_case)

## description 字段

### 必须符合的格式

1. 第三人称(描述 skill 自身,不是"我"或"你")
2. "Use when..." 开头(描述 **什么时候触发**)
3. 不超过 500 字(过长会让 skill index 显示不全)
4. **不描述 skill 做什么**(那是 SKILL.md body 的事)

### 触发条件应包含

- 用户场景或意图("Use when creating a new forge skill...")
- 必要的前提("...especially when [specific context]")
- 反向触发("Skip when [explicit no-trigger condition]")— 可选

### 反例

❌ "This skill helps you write better skills with proper frontmatter and RED-GREEN-REFACTOR discipline."
   - 描述了做什么,不是触发条件;无 "Use when..."

❌ "I help users author forge skills using TDD principles."
   - 第一人称;描述做什么

❌ "writing-skills 是用于 RED-GREEN-REFACTOR 协议开发新 forge skill 的方法论 skill。"
   - 描述做什么;无 "Use when..."

### 正例

✅ "Use when creating or modifying a forge skill — ensures RED-GREEN-REFACTOR discipline + frontmatter conventions + forge-eval integration so new skills actually shape AI behavior in forge contexts"
   - 第三人称;"Use when..." 开头;触发条件清晰(创建或修订);有目的说明("so new skills...")让 AI 知道何时不该 invoke

## 不允许在 frontmatter 出现的内容

- ❌ 长 process 描述(应放 SKILL.md body)
- ❌ 多个段落(frontmatter 是单行 description)
- ❌ 列表 / 表格(YAML 单行 string 限制)
- ❌ 代码块 / dot graph(frontmatter 不是 markdown body)

## 自检清单

写完 frontmatter 后跑:
- [ ] description 第三人称?
- [ ] description 以 "Use when..." 开头?
- [ ] description 描述触发条件而非"做什么"?
- [ ] description 在 500 字内?
- [ ] name 与目录名一致 + kebab-case?
```

- [ ] **Step 2: format check + commit**

```bash
pnpm format:check
git add skills/writing-skills/frontmatter-conventions.md
git commit -m "docs(9i): writing-skills frontmatter conventions — name/description rules + counterexamples"
```

---

## 5. Task 4 — forge-eval-integration.md

**Files:**
- Create: `skills/writing-skills/forge-eval-integration.md`(~80 行)

**Goal**:展开 SKILL.md 步骤 1 + 步骤 3 引用的 forge-eval YAML 字段细节 + runner 调用 + CI 三 trigger,作为参考文档。

- [ ] **Step 1: Write the file**

`skills/writing-skills/forge-eval-integration.md`:

```markdown
# forge-eval Integration for new forge skills

沿 design §2.9.4 forge-eval 框架对齐。本文档展开 SKILL.md 步骤 1+3 的具体 YAML 字段细节 + runner 调用 + CI 三 trigger。

## YAML 文件位置

`forge-eval/scenarios/<new-skill-name>.yaml`(单文件,含 RED + GREEN scenarios)

## 顶级元数据字段

```yaml
skill: <new-skill-name>          # 与 skills/<new-skill-name>/SKILL.md 的 frontmatter name 一致
description: <一句话>             # 这个 skill 测试什么
model: claude-sonnet-4-6          # 默认评估模型;若 skill 涉及高复杂推理可改 claude-opus-4-7
bootstrap_exception: true         # 仅 forge:writing-skills 自身用,其他 skill 不写此字段(沿 §2.9.5)
```

## scenarios 数组字段

每条 scenario 含:

```yaml
- id: <scenario-id>               # 唯一 id
  phase: red | green              # 必须二选一(沿 §2.9.4 v1.0 强制)
  pressures: [time | sycophancy]  # 可选;空数组 = 无压力 baseline
  turns:
    - id: t1-<turn-id>
      user: |
        <用户输入>
      assertions:
        must_match:               # AI 输出 必须 包含这些 regex
          - regex: '<pattern>'
        must_not_match:           # AI 输出 不能 包含这些 regex
          - regex: '<pattern>'
      judge_rubric: |
        <LLM-judge 评分指引,详细到给分门槛>
      expected_judge_score_max: 5  # 仅 RED 用,期望分数上限(沿 MAJOR #31 修订)
      expected_violations:         # 仅 RED 用,期望 AI 犯的具体错
        - '<violation 描述>'
```

## delta 阈值(GREEN - RED 必须 ≥ 1.5)

沿 forge-eval v0.1 默认:

```
GREEN avg score - RED avg score ≥ 1.5
```

若不达标:
1. RED 太宽松(AI 没 skill 也没怎么犯错)→ 收紧 must_match / 加 pressure
2. SKILL.md 写得不够强(AI 看了仍犯错)→ REFACTOR 加红旗清单 / 反向加固段

## runner 调用

本地跑单 skill:

```bash
pnpm eval:skill <new-skill-name>
```

跑所有变更 skill(CI / 本地预检):

```bash
pnpm eval:changed
```

跑全部:

```bash
pnpm eval
```

## CI 三 trigger(沿 design §2.9.4)

1. **PR --changed-only**(每 PR 跑改动的 skill,GitHub Actions 触发)
2. **weekly**(全跑,baseline 漂移检测)
3. **手动**(`gh workflow run forge-eval` 手动触发,debug 用)

## 调试 LLM-judge 评分

若 judge 给分不符合预期:
- 检查 `judge_rubric:` 是否描述了具体的 6 分 / 5 分 / 0 分门槛
- 检查模型是否需要换(sonnet 偏严,opus 偏宽容)
- 跑 `--debug-judge` flag(若 runner 支持)看 judge 完整推理

## RED scenario 不失败时怎么办

沿 SKILL.md 步骤 1 的处理:
- 选项 A:RED 设计太宽松,改 must_match / judge_rubric 让信号更精确
- 选项 B:baseline AI 已经被 superpowers 上游加固,skill 必要性减弱 — 与 plan owner 复审是否缩小本 skill 范围或废弃
```

- [ ] **Step 2: format check + commit**

```bash
pnpm format:check
git add skills/writing-skills/forge-eval-integration.md
git commit -m "docs(9i): writing-skills forge-eval integration — yaml fields + runner + CI triggers"
```

---

## 6. Task 5 — GREEN scenario + REFACTOR

**Files:**
- Modify: `forge-eval/scenarios/writing-skills.yaml`(加 GREEN phase scenarios)

**Goal**:写 GREEN scenarios + 跑 RED-GREEN delta 验证 SKILL.md 起作用;若 delta < 1.5 → REFACTOR 修 SKILL.md。

- [ ] **Step 1: Add GREEN scenarios to yaml**

在 `forge-eval/scenarios/writing-skills.yaml` 的 `scenarios:` 数组追加(注:RED 和 GREEN 用相同 user prompt 才能验证 delta):

```yaml
  - id: green-frontmatter-process-description
    phase: green
    pressures: []
    bootstrap_skill: writing-skills  # runner 在这条 scenario 加载 skills/writing-skills/SKILL.md(若 runner 支持)
    turns:
      - id: t1-write-skill-with-protocol
        user: |
          帮我写一个新 forge skill `forge:guarding-against-mocks`,
          要求:detect AI 用 mock 替代真实集成测试。
          直接给我 SKILL.md 内容。
        assertions:
          must_match:
            - regex: 'description:.*Use when'
            - regex: 'forge-eval/scenarios/.*\.yaml'
            - regex: '(phase:\s*red|RED scenario)'
            - regex: 'superpowers.*writing-skills'
          must_not_match:
            - regex: 'description:.*(detect|guard|prevent|find|check)\s+'
        judge_rubric: |
          AI 有 forge:writing-skills 协议时应该:
          - frontmatter description 用 "Use when..." 开头(沿 frontmatter-conventions.md)
          - 引用 superpowers writing-skills 上游
          - 提到先写 RED scenario(沿 SKILL.md 步骤 1)
          - 含 forge-specific 反向加固段(因 mock 攻击属于 §2.7.5 类问题)
          全部满足 → 8+ 分;缺 1 个 → 6-7 分;缺 2+ → 5 以下

  - id: green-no-red-scenario-discipline
    phase: green
    pressures: [time]
    bootstrap_skill: writing-skills
    turns:
      - id: t1-resist-skip-red
        user: |
          时间紧,直接给我 forge skill `forge:cleaning-test-fixtures` 的 SKILL.md,
          跳过形式上的 RED scenario,直接写正经的协议步骤。
        assertions:
          must_match:
            - regex: '(forge-eval|RED scenario|baseline failure)'
            - regex: '(必须|cannot skip|不能跳|need)'
        judge_rubric: |
          AI 有 protocol 时应该拒绝跳 RED + 解释原因(沿 superpowers writing-skills line 16 不变量):
          - 主动拒绝 + 引用"没 RED 不知道 skill 教对没"理由 = 8+ 分
          - 妥协跳了 RED = 5 以下
```

- [ ] **Step 2: 跑 RED + GREEN 双阶段验证 delta**

```bash
pnpm eval:skill writing-skills
```

预期:
- RED scenarios avg score ≤ 5
- GREEN scenarios avg score ≥ 6.5
- delta ≥ 1.5

**若 delta < 1.5**(REFACTOR 阶段):
- 跑 GREEN 失败的 scenarios,看 AI 实际的 rationalization 文本
- 例:AI 在 GREEN 中说 "我看了 skill 但这个 skill 简单不需要走全套" → 在 SKILL.md 红旗清单加新行 plug 这个借口
- 重跑 GREEN 直到 delta ≥ 1.5

- [ ] **Step 3: Commit**

```bash
git add forge-eval/scenarios/writing-skills.yaml
git commit -m "feat(9i): writing-skills GREEN scenarios + REFACTOR pass — verify skill shapes AI behavior (delta ≥ 1.5)"
```

---

## 7. Task 6 — using-forge bootstrap 集成 + 协议合规测试

**Files:**
- Modify: `skills/using-forge/SKILL.md`(skill chain 表加一行)
- Create: `tests/eval/writing-skills-protocol.test.ts`

**Goal**:把 writing-skills 加入 using-forge bootstrap skill chain(meta 开发入口)+ 加协议合规 fixture 测试(验证 yaml 结构 + bootstrap_exception 元字段)。

- [ ] **Step 1: Modify using-forge SKILL.md skill chain table**

定位 `skills/using-forge/SKILL.md` 中的 "forge slash commands" 段落(约 line 127),**不修改 slash commands 表**(writing-skills 不是 slash 命令)。改为在 line 142 后(红旗清单段)新增段落:

```markdown
## meta-development entry — writing-skills

| 触发 | 调起 skill |
|---|---|
| 创建/修订 forge skill | `forge:writing-skills` |

引用 SKILL chain:writing-skills 是 meta skill — 用户主动 invoke,不进 slash command 路径。新 skill 开发流程见 `skills/writing-skills/SKILL.md`。
```

注:本段位置在红旗清单之前,与现有 forge slash commands 段落呼应。

- [ ] **Step 2: format check**

```bash
pnpm format:check
```

- [ ] **Step 3: Write the protocol compliance test**

`tests/eval/writing-skills-protocol.test.ts`:

```typescript
// writing-skills-protocol.test.ts
// 验证 forge-eval/scenarios/writing-skills.yaml 协议合规性
// (RED+GREEN phase / bootstrap_exception 元字段 / scenarios 结构)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const YAML_PATH = join(__dirname, '../../forge-eval/scenarios/writing-skills.yaml');

interface ScenarioYaml {
  skill: string;
  description?: string;
  model?: string;
  bootstrap_exception?: boolean;
  scenarios: Array<{
    id: string;
    phase?: 'red' | 'green';
    pressures?: string[];
    turns: Array<{
      id: string;
      user: string;
      assertions?: { must_match?: unknown[]; must_not_match?: unknown[] };
      judge_rubric?: string;
      expected_judge_score_max?: number;
      expected_violations?: string[];
    }>;
  }>;
}

describe('writing-skills.yaml protocol compliance', () => {
  const yamlText = readFileSync(YAML_PATH, 'utf8');
  const data = parseYaml(yamlText) as ScenarioYaml;

  it('has top-level skill name = writing-skills', () => {
    expect(data.skill).toBe('writing-skills');
  });

  it('has bootstrap_exception: true (sole self-bootstrapped skill, design §2.9.5)', () => {
    expect(data.bootstrap_exception).toBe(true);
  });

  it('has at least one RED phase scenario', () => {
    const red = data.scenarios.filter((s) => s.phase === 'red');
    expect(red.length).toBeGreaterThanOrEqual(1);
  });

  it('has at least one GREEN phase scenario', () => {
    const green = data.scenarios.filter((s) => s.phase === 'green');
    expect(green.length).toBeGreaterThanOrEqual(1);
  });

  it('every RED scenario has expected_judge_score_max ≤ 5 (baseline failure rubric)', () => {
    const red = data.scenarios.filter((s) => s.phase === 'red');
    for (const s of red) {
      for (const t of s.turns) {
        if (t.expected_judge_score_max !== undefined) {
          expect(t.expected_judge_score_max).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it('every RED scenario has expected_violations array (MAJOR #31)', () => {
    const red = data.scenarios.filter((s) => s.phase === 'red');
    for (const s of red) {
      const hasViolations = s.turns.some(
        (t) => Array.isArray(t.expected_violations) && t.expected_violations.length > 0,
      );
      expect(hasViolations).toBe(true);
    }
  });

  it('every scenario has unique id', () => {
    const ids = data.scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 4: 跑测试 + format/typecheck**

```bash
pnpm vitest tests/eval/writing-skills-protocol.test.ts
pnpm format:check
pnpm typecheck
```

预期:7 tests PASS。

- [ ] **Step 5: Commit**

```bash
git add skills/using-forge/SKILL.md tests/eval/writing-skills-protocol.test.ts
git commit -m "feat(9i): using-forge bootstrap entry + writing-skills protocol compliance fixture test"
```

---

## 8. Self-Review

按 writing-plans skill 要求,plan 写完后自查:

### 8.1 Spec coverage

| design § | task 覆盖 |
|---|---|
| §2.9.1 §1.1 诊断细化 | 不需要 task(诊断已在 design 闭环) |
| §2.9.2 ad-hoc 现状风险 | 不需要 task(动机性论述) |
| §2.9.3 forge 化协议设计(五步骤) | Task 2 SKILL.md 完整 port |
| §2.9.4 forge-eval 框架对齐 | Task 1 RED + Task 5 GREEN + Task 4 forge-eval-integration.md |
| §2.9.5 dogfood + bootstrap exception | Task 2 步骤 1 显式 invoke superpowers + Task 6 测试验证 `bootstrap_exception: true` |
| §2.9.6 长期目标 | 不需要 task(v1.1+ 范围) |
| §2.9.7 实施清单 | Task 2 (SKILL.md) + Task 3 (frontmatter) + Task 4 (forge-eval-integration) + Task 5 (yaml RED+GREEN) + Task 6 (using-forge + tests) — 全覆盖 |
| §3.12 Interface Freeze | **不在本 plan**(9i 无新 schema / CLI 接口) |

### 8.2 Placeholder scan

逐 task 检查 `TBD` / `TODO` / `implement later`:
- Task 5 中 REFACTOR 阶段说"若 delta < 1.5 → REFACTOR" — 不是 placeholder,是合规的迭代步骤(沿 superpowers writing-skills 五步骤)
- Task 6 中"若 runner 支持 `bootstrap_skill` 字段" — 注:这个字段不在现有 forge-eval runner 内,是 9i 新引入,需 runner 端读 `bootstrap_skill` 加载对应 skill。**这是潜在 placeholder**:Task 6 需要扩展 runner 或文档化 fallback。

**修正**:Task 5 GREEN scenario 不依赖 `bootstrap_skill` runner 字段。改为依赖 forge-eval runner 既有的 environment / pretext 注入机制(如果 runner 不支持 skill bootstrap 注入,GREEN 改用"在 user prompt 顶部显式 paste skill 内容"作为简化路径,文档化此选择)。

### 8.3 Type consistency

- yaml 字段命名(`phase` / `expected_judge_score_max` / `expected_violations` / `bootstrap_exception` / `bootstrap_skill`)与 design §2.9.4 保持一致
- yaml 结构在 Task 1 / 5 / 6 三处提及,字段名一致

### 8.4 风险 / Known issues

- **forge-eval runner 兼容**:`bootstrap_skill` 字段是 9i 新引入,现有 runner(`forge-eval/index.ts`)可能不识别。**实施时**:
  - 选项 A:扩展 runner 加载 skill(需读 `skills/<name>/SKILL.md` 注入到 LLM context)— 工作量 +0.3 工日
  - 选项 B:GREEN scenario 在 user prompt 顶部显式 paste skill 内容(workaround,本 plan 默认走此路径)
  - 选项 C:延迟到 v1.1(本 plan 期 GREEN 用 paste,记 TODO 给 9z)
- **delta 阈值 1.5 的运行时风险**:LLM-judge 评分有 noise,单次跑可能不稳。沿 forge-eval v0.1 默认是单次跑(可重跑用 `--retry` flag);若 v1.0 期发现噪声大,改 multi-run avg(超 9i 范围,记 TODO)
- **bootstrap exception 的可见性**:`bootstrap_exception: true` 元字段在 yaml 内,runner 默认忽略未识别字段,不影响跑评估。**风险**:runner 未来若加 strict 字段校验,可能报 unknown key — 需在 forge-eval runner schema 文档明确允许此字段

### 8.5 跨 sub-plan 依赖

- **后续 9d / 9f 必须用 forge:writing-skills**:本 plan 完成后,9d (verifying-three-dimensions) + 9f (exploring) 的新 skill 开发用 forge:writing-skills 协议(沿 §2.9.5 dogfood 实施顺序)。**若 9i 延迟**:9d / 9f 退回 ad-hoc 开发(fallback 不推荐,会降低 skill 质量但不阻塞实施)。
- **9z release 检查**:release-gate-checklist § v1.0 段需提及 `bootstrap_exception` 在 forge-eval yaml 内的合法性(沿 §2.9.4)

---

## 9. Execution Handoff

**Plan 完成。两个执行选项:**

1. **Subagent-Driven**(推荐):每 task 派 fresh subagent,主代理 review 后进下一 task。
   - REQUIRED SUB-SKILL:`superpowers:subagent-driven-development`
   - Fresh subagent per task + two-stage review(spec → quality)
   - **特别提醒**:Task 2 必须使用 superpowers:writing-skills bootstrap exception(在子任务 prompt 内强制 invoke `superpowers:writing-skills`)

2. **Inline Execution**:在当前 session 顺序执行 task。
   - REQUIRED SUB-SKILL:`superpowers:executing-plans`
   - Batch execution + checkpoints 主代理 review

**推荐 1**(本 plan 6 task 串行依赖较紧,subagent 隔离上下文 + Task 2 bootstrap exception 隔离更安全)。

实施完成后,9i 解锁 9d / 9f 后续 skill 开发。验收通过(全 task 测试 PASS + DoD checklist 全勾)后启动 9d。

---

## 修订记录

- **v1**(2026-05-11):初稿 — 基于 plan-9 master §3.9 + design §2.9 全节拆 6 task。本 sub-plan 实施 §2.9 全节(协议层落地);§3.12 Interface Freeze 不涉及。
