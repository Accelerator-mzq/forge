---
name: writing-skills
description: Use when creating or modifying a forge skill — RED-GREEN-REFACTOR discipline + frontmatter conventions + forge-eval integration so new skills actually shape AI behavior in forge contexts
---

# forge writing-skills

> **本 skill 自身的初次开发使用 superpowers 上游 writing-skills 完成(bootstrap exception,沿 design §2.9.5)**;后续修订使用 forge:writing-skills 自身。元数据 `bootstrap_exception` 标记在 `forge-eval/scenarios/writing-skills.yaml` 顶层注释(yaml 文档元数据,forge-eval runner 忽略未识别 key)。

## 方法论基础(reference superpowers 上游)

writing-skills 的核心论点和 RED-GREEN-REFACTOR 映射沿 superpowers 上游 `writing-skills/SKILL.md` line 10-45。**REQUIRED BACKGROUND**:必须先懂 `forge:test-driven-development`。

核心论点(superpowers 上游 line 10-18):

- **"Writing skills IS Test-Driven Development applied to process documentation"**
- 不变量(line 16):**If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing**

TDD 到 skill 文档的映射:

| TDD 概念            | Skill 创建                                      |
| ------------------- | ----------------------------------------------- |
| Test case           | Pressure scenario with subagent                 |
| Production code     | SKILL.md                                        |
| Test fails (RED)    | Agent violates rule **without** skill bootstrap |
| Test passes (GREEN) | Agent complies with skill **present**           |
| Refactor            | Close rationalization loopholes                 |

## When to Use

- 创建一个新 forge skill(`skills/<name>/SKILL.md`)
- 修订一个已有 forge skill 的 behavior(不是 typo / 加示例)
- forge-eval baseline 重跑发现某 skill 失效需要 REFACTOR

## When NOT to Use

- 写 forge plan(用 superpowers 上游 writing-plans 或 `forge:writing-plans`)
- 写 `commands/*.md` slash command(slash 是 CLI 薄包装,不是行为塑形 skill)
- 修一个 typo / 加一行示例(non-behavior change,跳协议)

## forge 化适配(五步骤)

> 本五步骤走 **现有 forge-eval runner 双轨设计**(`forge-eval/runner.ts:106-131` 对每个 scenario 自动 RED+GREEN 配对,`withSkill: false/true` 切换 bootstrap)。**不引入** design §2.9.4 提的 `phase: red/green` / `expected_judge_score_max` / `expected_violations` / `bootstrap_skill` 字段 — 这些当前 runner 不读,留 v1.0 之后独立 sub-plan reconcile(详 plan-9i §8.4.1)。

### 步骤 1:先写 scenarios + 最小骨架 SKILL.md(baseline 验证)

新建 `forge-eval/scenarios/<new-skill-name>.yaml`,**每个 scenario 同时是 RED + GREEN 的输入**(runner 自动跑两次):

- 在 `scenarios:` 数组写至少 1 个 scenario,含 `id` / `turns[]` / `judge_rubric`(沿 `forge-eval/types.ts:13-46` schema)
- `judge_rubric` 同时覆盖 RED 评判(baseline 没 skill 时该得多少分)+ GREEN 评判(有 skill 后该得多少分)— 一段 rubric 文字覆盖两侧
- 用 `must_match` / `must_not_match` 锁结构性信号(RED + GREEN 共享断言)
- **同步创建 `skills/<new-skill-name>/SKILL.md` 最小骨架**(~10-15 行,仅 frontmatter + 占位 body)— 让 runner GREEN leg 不抛 ENOENT(沿 `loadSkillBootstrap` `readFile` 路径)
- 跑 `pnpm build && pnpm eval:skill <name>` → 读 `eval-report.md` 总览表 `RED avg` 列 ≤ 5
- **如果 RED 不失败 → skill 没必要**(沿 superpowers 上游 writing-skills line 16 不变量);要么收紧 must_match / judge_rubric,要么放弃此 skill
- 此阶段 delta 接近 0 是预期(骨架不教协议,GREEN 也低)

### 步骤 2:写完整 SKILL.md(production code)

frontmatter 严格约束(详 `frontmatter-conventions.md`):

- `name`:小写 + 连字符,无前缀(`forge:` namespace 由 plugin manifest 隐含;`scripts/copy-templates.mjs:49` reverse-sync 时自动加 `forge:` 前缀写入 `src/core/templates/skills/`)
- `description`:第三人称 + `Use when...` 开头 + 描述 **触发条件**(NOT skill 做什么)+ 500 字内
- 不允许 frontmatter 含 process 描述(描述 process 是 body 的事;包含 "detect/guard/prevent/find/check" 动词作主语就违反规则)

**body 必须严格按以下模板**(不是建议,是强制结构):

```markdown
---
name: <new-skill-name>
description: Use when <triggering condition> — <one-line purpose>
---

# forge <new-skill-name>

## Overview

<1-2 句核心论点>

## Methodology (reference superpowers 上游)

**REQUIRED BACKGROUND**: <prerequisite skill,如 forge:test-driven-development>。

核心论点(沿 superpowers 上游 writing-skills line 16 不变量):

- "If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing"

## When to Use

- <具体触发场景 1>
- <具体触发场景 2>

## When NOT to Use

- <显式不触发条件 1>
- <显式不触发条件 2>

## 主流程

<numbered steps 或 dot graph>

## forge-specific 反向加固

forge skill 与 superpowers 上游差异:假设 AI 在 <场景> 下会偷懒或撒谎。
本 skill 涉及此场景必须:

1. <反向加固机制 1>(CLI fence / fixture / RED scenario)
2. <反向加固机制 2>

## 红旗清单 — STOP and Start Over

| 想法                  | 现实              |
| --------------------- | ----------------- |
| "<rationalization 1>" | <reality counter> |
| "<rationalization 2>" | <reality counter> |
```

**4 个必须出现的 section**:

1. `## Methodology (reference superpowers 上游)` — 显式引用 superpowers 上游 writing-skills line 16 不变量
2. `## When to Use` / `## When NOT to Use` — 对称写
3. `## forge-specific 反向加固` — AI 不可信前提的具体加固
4. `## 红旗清单` — anti-pattern table

**不能** 写 TODO 占位符 body — 必须填实际内容。SKILL.md skeleton 只在 Task 1 步骤 1 baseline 验证期允许;production 阶段(本步骤)body 必须完整。

### 步骤 3:跑 GREEN leg 验证 skill 起作用

```bash
pnpm build && pnpm eval:skill <new-skill-name>
```

读 `eval-report.md` 看:

- GREEN leg avg judge ≥ 6.5
- delta = GREEN avg - RED avg ≥ 1.5(沿 `forge-eval/compare.ts:14` `DEFAULT_DELTA_THRESHOLD`)
- pair pass = `green.scenarioPass && delta >= 1.5`(沿 `compare.ts:28`)

若 GREEN 评分 < 6 或 delta < 1.5 → SKILL.md 写得不到位,回步骤 2 加红旗清单 / 改示例 / 加反向加固段。

### 步骤 4:REFACTOR(close rationalization loopholes)

`eval-report.md` 失败详情段含失败 GREEN turn 的 `judge.score` + `judge.reasoning`(沿 `forge-eval/report.ts:45-55`)。**注意**:report **不含** `assistantResponse` 完整文本字段。

实操路径:

- 读 `eval-report.md` 失败详情段:`grep -A 5 "失败 turn 列表" eval-report.md`(或直接 `cat`)
- 看 judge reasoning 推 AI 说辞(如 reasoning 提到 "AI 把这个当 quick prototype" / "AI 妥协跳 RED 直接写")
- 在 SKILL.md 加红旗清单显式 plug — 把这些借口列为 anti-pattern
- 重跑 `pnpm eval:skill <name>` 验证 plug 起作用(分数提高 / must_not_match 不再命中)

### 步骤 5:集成到 using-forge bootstrap(可选)

- **process discipline 类**(必须主动 invoke,如 verifying-three-dimensions / receiving-code-review):加到 `skills/using-forge/SKILL.md` 的 skill chain 表
- **reference / utility 类**(用户主动 invoke,如 writing-plans):不加 bootstrap,只在 README / docs 引用

**registry 部署强约束**(每加新 forge skill 必须):

1. 在 `src/core/templates/skills/index.ts` 的 `SKILL_NAMES` 数组追加 `'<new-skill-name>'`
2. 同步改 hardcoded 12-item 断言(`tests/core/templates/registry.test.ts:8/13` + `tests/smoke.test.ts:44`)→ 改为新数量 + 完整数组
3. 跑 `pnpm build` 让 reverse-sync 自动生成 `src/core/templates/skills/<name>.md`(自动加 `forge:` 前缀)
4. **不要手 `cp skills/.../SKILL.md src/core/templates/...`** — 直接复制不会做 `forge:` 前缀 transform,违反 `tests/core/templates/skills.test.ts:12` 断言

## forge-specific 反向加固

forge skill 与 superpowers 上游的关键差异:**forge 假设 AI 在 verify / archive / process_evidence 等场景下会偷懒或撒谎**(沿 design §2.7.5 四类伪造攻击)。新 forge skill 涉及这些场景时必须:

1. **不能假设 AI 会自我约束**:每条规则配一个反向加固机制(CLI fence / fixture 测试 / forge-eval RED scenario 验证 baseline)
2. **不能用"AI 自决"作为唯一防线**:严肃问题必须工具独立验证(沿 design §2.3.3 critical_candidate 协议)
3. **不能跳 forge-eval RED**:超 200 行 / 跨多文件 / 涉及伪造攻击的 skill 必须 RED + GREEN + REFACTOR 全套(无简化路径)

## 红旗清单 — STOP and Start Over

这些念头说明你正在 rationalize,STOP:

| 想法                                                        | 现实                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| "这个 skill 短/简单,跳 RED scenario 吧"                     | RED scenario 是验证 skill 必要性的唯一办法。跳 RED = 不知道 skill 教对没                                            |
| "时间紧,直接写 SKILL.md 跳 RED"                             | 时间压力下跳 RED 是 baseline AI 的典型失败模式。如果你正想这样做,说明你正是 RED scenario 要捕获的对象               |
| "frontmatter description 写清楚 skill 做什么"               | 错。description 写**什么时候用**(`Use when...`);做什么留给 body                                                     |
| "description 用 'detect/guard/prevent/find/check' 动词开头" | 错。这些是 process 动词,写在 description 违反规则(plan §3 baseline scenario 已实测此 anti-pattern)                  |
| "superpowers 上游就够了,forge 直接复制"                     | v0.2 fusion 的失败模式 — 复制不验证 forge 路径下是否生效                                                            |
| "GREEN 跑了能过就行,REFACTOR 跳过"                          | REFACTOR 是堵 AI 借口的关键步骤;跳过 = skill 在压力场景下会失效                                                     |
| "我用 forge:writing-skills 自己开发 forge:writing-skills"   | 逻辑悖论。第一个开发用 superpowers 上游 writing-skills(bootstrap exception)                                         |
| "手 cp SKILL.md 到 src/core/templates/"                     | 错。reverse-sync 由 `pnpm build` 做,手 cp 不加 `forge:` 前缀,触发 `tests/core/templates/skills.test.ts:12` 断言失败 |

**全部触发表示:回归 RED-GREEN-REFACTOR 五步骤,从步骤 1 开始**。

## 配套文件

- `frontmatter-conventions.md` — name / description 严格规范 + 反例(由 Task 3 创建)
- `forge-eval-integration.md` — yaml schema 字段细节 + runner 调用 + CI trigger(由 Task 4 创建)

## Bottom Line

**Skills are tested documentation, not memos.** 不跑 RED-GREEN-REFACTOR + forge-eval 验证,你写的是不被 AI 遵循的 memo,不是 skill。

新 skill 不跑 forge-eval delta ≥ 1.5 → 等于没写。
