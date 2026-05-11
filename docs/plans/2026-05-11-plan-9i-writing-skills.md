# Plan 9i — forge:writing-skills 协议落地

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。**特别注意**:本 plan **Task 1 + Task 2** 一起构成 bootstrap exception 范围(沿 design §2.9.5),**必须从 Task 1 开始就 invoke `superpowers:writing-skills`** 走 RED → SKILL.md → GREEN → REFACTOR 完整链(不能用尚未实现的 forge:writing-skills 自身)。

**Goal**:落地 `forge:writing-skills` skill — port superpowers:writing-skills 的方法论到 forge,补 forge v0.2-v0.4 缺失的"写新 skill 协议层"(沿 design §2.9 全节)。本 phase 是 9d / 9f 后续 skill 开发的协议前置。

**Architecture**:三层落地:(1) `skills/writing-skills/SKILL.md`(~150-200 行)+ 两个配套文件(forge-eval-integration.md / frontmatter-conventions.md)— **不照搬 superpowers 655 行**,reference 上游 + forge 化适配;(2) `skills/using-forge/SKILL.md` meta-development entry 段加 writing-skills 入口(非 slash commands 表);(3) `forge-eval/scenarios/writing-skills.yaml`(走**现有 runner 双轨设计** — 每个 scenario runner 自动 RED+GREEN 配对,**不用 design §2.9.4 提的 `phase: red/green` 字段**,见 §8.4 设计偏差说明)+ `tests/forge-eval/writing-skills-protocol.test.ts` 协议合规测试;(4) `src/core/templates/skills/index.ts` SKILL_NAMES 扩展 + `src/core/templates/skills/writing-skills.md` 实体文件(沿现有 12 skill registry 模式)。

**Tech Stack**:Markdown(skill 文档)+ 现有 forge-eval/ YAML 框架(@anthropic-ai/sdk LLM-as-judge)+ vitest(协议合规测试)。**无新 npm 依赖**。

**Spec 引用**:
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §2.9 全节(§2.9.1 诊断 / §2.9.2 风险 / §2.9.3 协议设计 / §2.9.4 forge-eval 对齐 / §2.9.5 dogfood + bootstrap / §2.9.6 长期目标 / §2.9.7 实施清单)
- master plan §3.9(P50 2.5 工日 / P90 3.5 工日;无 §3.12 Interface Freeze 接口)
- v0.1 forge-eval 实现:`forge-eval/runner.ts:110-143`(RED+GREEN 配对算法)+ `forge-eval/types.ts:13-46`(yaml schema)+ `forge-eval/compare.ts:14`(delta 阈值 1.5 默认)

**P50 工日**:3.0(codex 二轮 review 上调,加 SKILL_NAMES 扩展 + design vs runner gap reconciliation) / **P90 工日**:4.0

**前置**:9a 完成(§3.12 Interface Freeze 全锁死);superpowers v5.1.0 用户级安装可用(bootstrap exception 依赖)。

**后续 unblocked 的前置条件**:9d(verifying-three-dimensions skill)+ 9f(exploring skill)能用 forge:writing-skills 协议开发**当且仅当**:
- 本 plan 完成后 `SKILL_NAMES` 扩展模式已立(后续 sub-plan 增 skill 时跟同路径)
- 现有 runner 双轨 RED+GREEN 配对模式足以表达"baseline 失败 + skill 通过"对照(已验证可行,见 §8.4)
- 不依赖 design §2.9.4 提的 `phase` / `expected_judge_score_max` / `expected_violations` runtime 字段(这些是文档元数据,runner 不读)

若任一前置不成立,9d / 9f 协议落地需要补 runner 扩展(超 9i 范围)。

**DoD**(完成定义):
- `skills/writing-skills/SKILL.md` 存在,~150-200 行,reference superpowers writing-skills line 10-45 + forge 化五步骤
- `skills/writing-skills/forge-eval-integration.md`(~80 行)+ `skills/writing-skills/frontmatter-conventions.md`(~60 行)存在
- `skills/using-forge/SKILL.md` meta-development entry 段(独立段落,非 slash commands 表)加 writing-skills 入口
- `src/core/templates/skills/index.ts` 的 `SKILL_NAMES` 加 `'writing-skills'` + `src/core/templates/skills/writing-skills.md` 文件实体(沿 v0.1 12-skill registry 模式 — runtime 静态 import)
- `forge-eval/scenarios/writing-skills.yaml` 含 ≥ 2 scenarios(走现有 runner 双轨)+ 顶层 `# bootstrap_exception: true` 注释或 description 内文字标注(yaml schema 不读此字段,作为文档元数据存在,沿 §8.4 偏差说明)
- `tests/forge-eval/writing-skills-protocol.test.ts` 验证 yaml 通过 `loadScenarioFile` schema + scenarios ≥ 2 + 每个 scenario 含 `judge_rubric`(沿现有 runner 合约)
- `pnpm eval:skill writing-skills` 跑双轨,GREEN delta ≥ 1.5 over RED
- 全本地 verify 通过(typecheck / lint / format:check / build / vitest)
- SKILL.md + RED scenarios 一起经 superpowers:writing-skills 协议开发(显式声明 bootstrap exception 在 SKILL.md 内)

---

## 0. 总览

本 sub-plan 拆 7 个 task(累计 P50 3.0 工日,codex 二轮上调:加 Task 0 SKILL_NAMES 扩展):

| Task | 名称 | 工日 P50 | 关键交付 |
|------|------|---------|---------|
| 0 | SKILL_NAMES registry 扩展 + skill 模板实体 | 0.4 | `src/core/templates/skills/index.ts` 加 `'writing-skills'` + `src/core/templates/skills/writing-skills.md` 实体(forge update 部署路径)+ 现有 12 skill registry test 更新 |
| 1 | scenarios.yaml 初稿(写 SKILL.md 之前的 baseline) | 0.4 | `forge-eval/scenarios/writing-skills.yaml`:2 个 scenarios(走现有 runner 双轨)+ `bootstrap_exception` 注释 + scenarios 设计目标"baseline 没 skill 时必失败"(必须先跑 RED leg 确认 < 6 分) |
| 2 | SKILL.md(production code,与 Task 1 同在 bootstrap exception 范围) | 0.6 | `skills/writing-skills/SKILL.md` ~150-200 行,reference superpowers + forge 化五步骤 |
| 3 | 配套文件 frontmatter-conventions.md | 0.3 | `skills/writing-skills/frontmatter-conventions.md` ~60 行 |
| 4 | 配套文件 forge-eval-integration.md | 0.4 | `skills/writing-skills/forge-eval-integration.md` ~80 行 |
| 5 | GREEN leg 跑通 + REFACTOR | 0.5 | 跑 `pnpm eval:skill writing-skills` 验证 delta ≥ 1.5;若不达标回改 Task 2 SKILL.md 加红旗 plug(**反向依赖 Task 2**,见 §8 风险) |
| 6 | using-forge meta-entry + 协议合规测试 | 0.4 | `skills/using-forge/SKILL.md` 新增 §"meta-development entry" 段(在红旗清单段之前)+ `tests/forge-eval/writing-skills-protocol.test.ts` |

**串行约束 + 反向依赖**:
- Task 0(SKILL_NAMES)必须先(否则 Task 1 跑 `pnpm eval:skill writing-skills` CLI 拒绝,沿 `forge-eval/index.ts:34`)
- Task 1 → Task 2:RED leg 没失败 = skill 没必要(沿 superpowers writing-skills line 16 不变量)
- Task 3 / Task 4 可并行(配套文件相互独立),但 Task 2 已 reference 这两个文件 — 若 Task 3/4 不存在跑 SKILL.md 内 link check 会失败,顺序应 **Task 2 → Task 3 → Task 4**(或 Task 2 写 SKILL.md 时暂用 forward reference,Task 3/4 落盘后再 verify link)
- Task 5 → Task 2 **反向链**:GREEN delta < 1.5 时必须回改 SKILL.md(加红旗 plug),REFACTOR 是合规迭代不是 placeholder
- Task 6 集成,放最后

---

## 1. File Structure

### 新增文件

```
skills/writing-skills/SKILL.md                       ← Task 2:~150-200 行,主协议
skills/writing-skills/frontmatter-conventions.md     ← Task 3:~60 行,name/description 规范 + 反例
skills/writing-skills/forge-eval-integration.md      ← Task 4:~80 行,新 skill 接入 forge-eval 步骤
src/core/templates/skills/writing-skills.md          ← Task 0:registry 实体(forge update 部署 — 沿 v0.1 12-skill 模式)
forge-eval/scenarios/writing-skills.yaml             ← Task 1+5:scenarios(走现有 runner 双轨)
tests/forge-eval/writing-skills-protocol.test.ts     ← Task 6:yaml 结构合约 fixture 验证(路径修正:tests/forge-eval/ 而非 tests/eval/)
```

### 修改文件

```
skills/using-forge/SKILL.md                          ← Task 6:在红旗清单段之前(line 142 前)新增 §"meta-development entry" 段
src/core/templates/skills/index.ts                   ← Task 0:SKILL_NAMES 加 'writing-skills'(从 12 → 13);loadAllSkills 自动覆盖
```

### 不修改文件(明确边界)

```
skills/test-driven-development/SKILL.md              ← writing-skills 必须 reference 此 skill 作为 prerequisite,但不动 TDD skill 本身
forge-eval/index.ts                                  ← Task 0 加 SKILL_NAMES 后 CLI 自动识别;runner.ts 现有 RED+GREEN 配对设计够用
forge-eval/runner.ts                                 ← 现有双轨设计(:120-123 每个 scenario 自动 RED no-bootstrap + GREEN with-bootstrap)契合本 plan 需要,无需扩展
forge-eval/types.ts                                  ← 不加 phase / expected_judge_score_max 等字段(design §2.9.4 提出但 runner 不读;若加需独立 sub-plan 扩展 runner)
forge-eval/regeneration-index.ts                     ← 不涉及 regeneration 路径
src/cli/commands/                                    ← 9i 不引入新 CLI 命令(沿 §2.9.7 "不引入新 CLI 命令(元开发活动)")
.github/workflows/                                   ← 现有 skill-eval workflow 通过 SKILL_NAMES 自动覆盖,无需改 yml
```

---

## 2. Task 0 — SKILL_NAMES registry 扩展 + skill 模板实体

**Files:**
- Modify: `src/core/templates/skills/index.ts`(SKILL_NAMES 数组加 `'writing-skills'`)
- Create: `src/core/templates/skills/writing-skills.md`(占位 placeholder,Task 2 完成后替换为 SKILL.md 内容副本)
- Modify: `tests/core/templates/registry.test.ts`(若存在,验证 SKILL_NAMES 13 项;若不存在跳过此 step)

**Goal**:让 `pnpm eval:skill writing-skills` 不被 CLI 校验拒绝(`forge-eval/index.ts:34` 要求 `--skill` 值在 SKILL_NAMES 内)+ `forge update` 部署路径覆盖新 skill。

- [ ] **Step 1: 读现有 SKILL_NAMES registry**

`src/core/templates/skills/index.ts:12-25` 现有 12 项数组(沿 v0.1 §2.2)。Task 0 加 `'writing-skills'` 作为第 13 项。

- [ ] **Step 2: 改 SKILL_NAMES**

```typescript
// src/core/templates/skills/index.ts
export const SKILL_NAMES = [
  'using-forge',
  'brainstorming',
  'writing-plans',
  'subagent-driven-development',
  'test-driven-development',
  'requesting-code-review',
  'receiving-code-review',
  'verification-before-completion',
  'systematic-debugging',
  'dispatching-parallel-agents',
  'using-git-worktrees',
  'finishing-a-development-branch',
  'writing-skills', // 9i 新增(沿 design §2.9 协议落地)
] as const;
```

- [ ] **Step 3: Create placeholder skill .md**

`src/core/templates/skills/writing-skills.md`(占位内容,Task 2 完成后将 SKILL.md 复制至此 — 沿现有 12 skill 双源模式:`skills/<name>/SKILL.md` 是开发源,`src/core/templates/skills/<name>.md` 是 runtime 部署副本):

```markdown
---
name: writing-skills
description: Placeholder — Task 2 will replace with actual SKILL.md content (sync from skills/writing-skills/SKILL.md after Task 2 commit)
---

# writing-skills (placeholder)

This file is a placeholder. Actual content is committed in Task 2 by `cp skills/writing-skills/SKILL.md src/core/templates/skills/writing-skills.md`.
```

- [ ] **Step 4: Verify SKILL_NAMES test passes**

```bash
pnpm vitest tests/core/templates/
```

若 `tests/core/templates/registry.test.ts` 测了 SKILL_NAMES.length 等于 12,改为 13;否则跳过。

- [ ] **Step 5: Verify `pnpm eval:skill writing-skills` CLI 接受**

```bash
pnpm build && node forge-eval/dist/index.js --skill writing-skills --help 2>&1 | head -5
# 或:pnpm eval:skill writing-skills(若有此 npm script)
```

预期:CLI 不再报"--skill 后必须跟合法 skill 名;可选:..."(因为 writing-skills 现已在 SKILL_NAMES)。**但**:此时 `forge-eval/scenarios/writing-skills.yaml` 还没建 → CLI 跑到 `loadScenarioFile` 会抛"scenario 文件不存在" — 这是预期的,Task 1 创建 yaml 后解除。

- [ ] **Step 6: format:check + commit**

```bash
pnpm format:check
git add src/core/templates/skills/index.ts src/core/templates/skills/writing-skills.md
git commit -m "feat(9i): SKILL_NAMES + writing-skills.md placeholder — registry 12→13"
```

---

## 3. Task 1 — scenarios.yaml 初稿(走现有 runner 双轨)

**Files:**
- Create: `forge-eval/scenarios/writing-skills.yaml`

**Goal**:写 baseline failure 测试 — 现有 runner 对**每个** scenario 都自动跑两次(RED:无 skill bootstrap;GREEN:有 skill bootstrap)— 因此 scenarios 数组里的每条都既是 baseline 又是 with-skill,**通过 `compare.ts:DEFAULT_DELTA_THRESHOLD = 1.5` 判定 skill 是否真起作用**(沿 `forge-eval/runner.ts:120-123` + `forge-eval/compare.ts:14`)。

**重要:本 task 与 Task 2 共同处于 superpowers:writing-skills 协议的 bootstrap exception 范围内**(沿 design §2.9.5 完整 RED→SKILL→GREEN→REFACTOR 链)。开始本 task 前主代理必须 `Skill` tool 调用 `superpowers:writing-skills`,按其步骤 1(写 RED scenario)走。

**与 design §2.9.4 的偏差**:design 提的 `phase: red/green` / `expected_judge_score_max` / `expected_violations` / `bootstrap_skill` 字段在现有 runner(`forge-eval/types.ts`)**不读取**。本 plan 走现有 runner 双轨设计,不引入这些字段;`bootstrap_exception` 在 yaml 顶层做注释/description 文字标注(纯文档元数据,runner 忽略未知字段)。若 v1.1 扩展 runner 支持 phase 等字段,本 plan 完成后再回头补 — 不在 9i 范围(详 §8.4)。

- [ ] **Step 1: Invoke superpowers:writing-skills(bootstrap exception 第一段)**

```
Skill tool: superpowers:writing-skills
```

按其协议步骤 1(RED scenario 设计)进行。

- [ ] **Step 2: Read 既有 yaml 格式作参考**

参考 `forge-eval/scenarios/writing-plans.yaml`(同结构示例)+ `forge-eval/types.ts:13-46`(schema 真源)。schema 实际字段:
- 顶层:`skill` / `description` / `model` / `scenarios[]`
- scenario:`id` / `pressures[]?` / `turns[]`(每 turn:`user` / `assertions?` / `judge_rubric`)
- **没有** `phase` / `expected_judge_score_max` / `expected_violations` / `bootstrap_exception` runtime 字段

- [ ] **Step 3: Write scenarios YAML**

`forge-eval/scenarios/writing-skills.yaml`:

```yaml
skill: writing-skills
# bootstrap_exception: 本 skill 自身的初次开发使用 superpowers:writing-skills 完成
# (sole self-bootstrapped skill in forge,沿 design §2.9.5)
# 上述声明是文档元数据,forge-eval runner 忽略未识别 yaml 顶层 key
description: |
  forge:writing-skills protocol — RED-GREEN-REFACTOR + frontmatter + forge-eval 集成,
  确保新 forge skill 真的塑形 AI 行为。BOOTSTRAP EXCEPTION:本 skill 自身初次开发用 superpowers:writing-skills。
model: claude-sonnet-4-6

scenarios:
  - id: frontmatter-process-description
    pressures: []
    turns:
      - id: t1-write-skill
        user: |
          帮我写一个新 forge skill `forge:guarding-against-mocks`,
          要求:detect AI 用 mock 替代真实集成测试。
          直接给我 SKILL.md 内容(包含 frontmatter + body)。
        # runner 会跑两次:RED(无 skill bootstrap) + GREEN(有 writing-skills bootstrap)
        # baseline 期望 RED 时 AI 把 process 描述塞进 frontmatter;GREEN 时 AI 用 "Use when..." 触发条件
        assertions:
          must_match:
            # 任何 SKILL.md 都应有 name + description 字段
            - regex: 'name:\s*[a-z][a-z-]+'
            - regex: 'description:'
        judge_rubric: |
          评估生成的 SKILL.md frontmatter 合规度(沿 superpowers writing-skills line 95-103):
          - description 用 "Use when..." 第三人称开头描述触发条件 → +3 分
          - 不在 frontmatter 写 process(不含 "detect/guard/find/check" 动词作主语)→ +2 分
          - body 引用 superpowers:writing-skills 上游 → +2 分
          - body 提到先写 RED scenario(superpowers line 16 不变量)→ +2 分
          - body 含 forge-specific 反向加固段(因 mock 攻击属 §2.7.5)→ +1 分
          满分 10。baseline AI(无 skill bootstrap)预期 ≤ 5;有 skill bootstrap 预期 ≥ 7。
          delta ≥ 1.5 表示 writing-skills 真起作用(沿 forge-eval/compare.ts:14 默认阈值)。

  - id: time-pressure-skip-red
    pressures: [time]
    turns:
      - id: t1-skip-red-under-pressure
        user: |
          时间紧,直接给我 forge skill `forge:cleaning-test-fixtures` 的 SKILL.md,
          跳过形式上的 RED scenario,直接写正经的协议步骤。
        assertions:
          must_match:
            - regex: 'name:\s*cleaning-test-fixtures'
        judge_rubric: |
          压力场景下评估 AI 是否抵抗"跳 RED"诱因(沿 superpowers writing-skills line 16):
          - AI 妥协跳 RED 直接写 SKILL.md → ≤ 5 分
          - AI 拒绝跳 RED 并引用 "没 RED 不知道 skill 教对没" 理由 → 7-8 分
          - AI 同时拒绝 + 给出 RED-GREEN-REFACTOR 完整步骤 → 9-10 分
          baseline AI(无 skill bootstrap)预期妥协(≤ 5);有 skill bootstrap 预期抵抗(≥ 7)。
          delta ≥ 1.5 表示 writing-skills 真挡住压力鼓励。
```

- [ ] **Step 4: 跑 baseline 半轨验证 RED leg 真失败**

```bash
pnpm build && pnpm eval:skill writing-skills
```

注意:此时 SKILL.md 还没建,runner 跑 GREEN leg(有 skill bootstrap)会因 `loadSkill('writing-skills')` 找不到 `skills/writing-skills/SKILL.md` 而失败 — 这是预期的。**只看 RED leg(stdout 区分 `withSkill: false`)的 judge score** ≤ 5 即可。**若 RED leg ≥ 6 → 选项 A 收紧 must_match / judge_rubric;选项 B 与 plan owner 复审 9i 范围**。

(实操替代:跑 `pnpm eval:skill writing-skills 2>&1 | grep -A2 "withSkill: false"` 隔离 RED leg 输出。)

- [ ] **Step 5: Commit**

```bash
pnpm format:check
git add forge-eval/scenarios/writing-skills.yaml
git commit -m "feat(9i): writing-skills.yaml — baseline RED leg failure scenarios (frontmatter + time pressure)"
```

---

## 4. Task 2 — SKILL.md(production code,bootstrap exception 延续 Task 1)

**Files:**
- Create: `skills/writing-skills/SKILL.md`(~150-200 行)

**Goal**:写 forge:writing-skills 主协议 — reference superpowers + forge 化五步骤(沿 design §2.9.3 全节)。**本 task 与 Task 1 / Task 5 共同处于 superpowers:writing-skills bootstrap exception 范围内**(沿 design §2.9.5 完整 RED→SKILL→GREEN→REFACTOR 链)。

- [ ] **Step 1: Invoke superpowers:writing-skills(若 Task 1 invoke 后已离开 session,重新 invoke)**

主代理在本 task 开始时,若 Task 1 的 superpowers:writing-skills invoke 上下文已不在(新 session / 主代理 context clear 等场景),**必须**重新 `Skill` tool 调用 `superpowers:writing-skills`,按其协议步骤 2(写 SKILL.md production code)进行。**不能用尚未实现的 forge:writing-skills 自身**(逻辑悖论,沿 §2.9.5)。

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

## 5. Task 3 — frontmatter-conventions.md

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

## 6. Task 4 — forge-eval-integration.md

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

## 7. Task 5 — GREEN leg 跑通 + REFACTOR(反向依赖 Task 2)

**Files:**
- Maybe-modify: `skills/writing-skills/SKILL.md`(若 delta < 1.5 时回改加红旗清单)
- Maybe-modify: `forge-eval/scenarios/writing-skills.yaml`(若 judge_rubric 描述需调,但不改 scenarios 数量)
- Sync: `src/core/templates/skills/writing-skills.md`(若 Task 2 SKILL.md 改了,需要 `cp` 同步到 registry 副本)

**Goal**:用现有 runner 双轨设计跑 GREEN leg(有 skill bootstrap),验证 delta ≥ 1.5;若不达标 REFACTOR 修 Task 2 SKILL.md。**本 task 是反向依赖 Task 2 的合规迭代,不是 placeholder**(沿 superpowers writing-skills 五步骤的步骤 4 REFACTOR)。

- [ ] **Step 1: 跑 RED+GREEN 双轨完整 eval**

```bash
pnpm build && pnpm eval:skill writing-skills
```

预期(沿 `forge-eval/compare.ts:14` 默认 1.5 阈值):
- RED leg(withSkill: false)avg judge score ≤ 5(Task 1 已验证)
- GREEN leg(withSkill: true)avg judge score ≥ 6.5
- delta = GREEN avg - RED avg ≥ 1.5
- pair pass = `green.scenarioPass && delta >= 1.5`(沿 compare.ts:28)

stdout 输出含 `ScenarioPair { ... pairPass: true/false, delta: <数值> }`,直接看。

- [ ] **Step 2: 若 delta < 1.5 → REFACTOR**

跑 GREEN leg 失败的 scenarios 时观察 LLM 输出(`assistantResponse` 字段),找 rationalization 借口。例:

- AI 说 "我看了 skill 但这个 skill 简单不需要走全套" → 在 SKILL.md 红旗清单加新行 plug
- AI 说 "时间紧实际上是可以跳过 RED 的" → 在 SKILL.md 加显式 anti-pattern 段

修改 `skills/writing-skills/SKILL.md`(回写 Task 2 的产出),保存,**同步副本**:

```bash
cp skills/writing-skills/SKILL.md src/core/templates/skills/writing-skills.md
```

重跑 `pnpm eval:skill writing-skills` 直到 delta ≥ 1.5。

**LLM-judge noise 处理**(plan §8.4 已识别):若单次跑 delta 在 [1.3, 1.5] 边界震荡,允许跑 2 次取平均(手动,沿 v0.1 forge-eval CLI 不支持 --retry,详 §8.4)。

- [ ] **Step 3: Sync template registry 副本**

无论 SKILL.md 是否 REFACTOR 修过,Task 5 完成前必须确保:

```bash
diff skills/writing-skills/SKILL.md src/core/templates/skills/writing-skills.md
# 应输出空(两文件一致);若有差异:cp 覆盖
```

- [ ] **Step 4: Commit**

```bash
pnpm format:check && pnpm typecheck
git add skills/writing-skills/SKILL.md src/core/templates/skills/writing-skills.md forge-eval/scenarios/writing-skills.yaml
git commit -m "refactor(9i): writing-skills REFACTOR pass — close rationalization loopholes (delta ≥ 1.5 verified)"
```

若无任何回写(GREEN leg 首跑就达标 delta ≥ 1.5),仍 commit 一个 `chore(9i): writing-skills GREEN leg verified — delta <N> ≥ 1.5` 记录验收 + sync registry。

---

## 8. Task 6 — using-forge meta-entry + 协议合规测试

**Files:**
- Modify: `skills/using-forge/SKILL.md`(新增 §"meta-development entry" 段,位置:line 141 末尾 + line 142 红旗清单标题之前)
- Create: `tests/forge-eval/writing-skills-protocol.test.ts`(路径修正:tests/forge-eval/ 与现有 forge-eval 测试目录一致)

**Goal**:把 writing-skills 加入 using-forge bootstrap(meta 开发入口)+ 加协议合规 fixture 测试 — **测试只校验 runner 真实读取的字段**(沿 `forge-eval/types.ts` schema),不校验 `phase` / `expected_judge_score_max` 等 design 元数据字段(它们 runner 不读,见 §8.4)。

- [ ] **Step 1: Locate the insertion point**

`skills/using-forge/SKILL.md` 实际结构(verified):
- line 127-140:`## forge slash commands` 段 + 表格(6 slash 命令)
- line 141:空行
- line 142:`## forge 红旗清单(覆盖 superpowers 红旗清单的 forge 专属补充)`

writing-skills 是 **meta skill 不是 slash command**(沿 design §2.9.7 "不引入新 CLI 命令")。插入位置:**line 141 后、line 142 红旗清单标题前**,新增独立 §"meta-development entry" 段(不动现有 slash commands 表)。

- [ ] **Step 2: Edit using-forge SKILL.md**

在 line 141 空行后插入(line 142 红旗清单段保留原位):

```markdown
## meta-development entry — writing-skills

forge 框架自身的 skill 开发流程(用户主动 invoke,不走 slash command 路径):

| 触发 | 调起 skill |
|---|---|
| 创建一个新 forge skill(`skills/<name>/SKILL.md`) | `forge:writing-skills` |
| 修订一个 forge skill 的 behavior(不是 typo) | `forge:writing-skills` |
| 跑 forge-eval baseline 重跑发现 skill 失效 → REFACTOR | `forge:writing-skills` |

`forge:writing-skills` 自身的初次开发使用 `superpowers:writing-skills` 完成(bootstrap exception,沿 design §2.9.5);后续修订使用 forge:writing-skills 自身。详 `skills/writing-skills/SKILL.md`。

```

注:用 `Edit` tool 时锚点用 line 141 的精确空行 + line 142 的标题(避免误改 slash commands 表)。

- [ ] **Step 3: format check**

```bash
pnpm format:check
# 若失败 → pnpm format && pnpm format:check
```

- [ ] **Step 4: Write the protocol compliance test**

`tests/forge-eval/writing-skills-protocol.test.ts`(用 forge-eval 既有的 `loadScenarioFile` API 而非手解析 yaml,以 reuse schema 校验):

```typescript
// writing-skills-protocol.test.ts
// 验证 forge-eval/scenarios/writing-skills.yaml 通过现有 schema 合约
// + bootstrap_exception 元数据声明可见(文档元数据,runner 忽略未识别字段)

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScenarioFile } from '../../forge-eval/load-scenario.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const YAML_PATH = join(__dirname, '../../forge-eval/scenarios/writing-skills.yaml');

describe('writing-skills.yaml protocol compliance', () => {
  it('passes forge-eval loadScenarioFile schema (skill + scenarios + turns + judge_rubric)', async () => {
    const file = await loadScenarioFile('writing-skills');
    expect(file.skill).toBe('writing-skills');
    expect(file.scenarios.length).toBeGreaterThanOrEqual(2);
    for (const s of file.scenarios) {
      expect(s.id).toBeTruthy();
      expect(s.turns.length).toBeGreaterThanOrEqual(1);
      for (const t of s.turns) {
        expect(t.user).toBeTruthy();
        expect(t.judge_rubric).toBeTruthy();
      }
    }
  });

  it('declares bootstrap_exception in yaml metadata (description or comment)', async () => {
    const raw = await readFile(YAML_PATH, 'utf8');
    // bootstrap_exception 是文档元数据,可在 yaml 顶层注释 OR description 字段内文字标注
    expect(raw).toMatch(/bootstrap[_-]exception/i);
  });

  it('writing-skills is registered in SKILL_NAMES', async () => {
    const { SKILL_NAMES } = await import('../../src/core/templates/skills/index.js');
    expect(SKILL_NAMES).toContain('writing-skills');
  });

  it('every scenario has unique id', async () => {
    const file = await loadScenarioFile('writing-skills');
    const ids = file.scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 5: 跑测试 + format/typecheck**

```bash
pnpm vitest tests/forge-eval/writing-skills-protocol.test.ts
pnpm format:check
pnpm typecheck
```

预期:4 tests PASS。

- [ ] **Step 6: Commit**

```bash
git add skills/using-forge/SKILL.md tests/forge-eval/writing-skills-protocol.test.ts
git commit -m "feat(9i): using-forge meta-entry section + writing-skills protocol compliance test (forge-eval schema-aligned)"
```

---

## 9. Self-Review(v2 — codex 二轮 adversarial review 修订)

按 writing-plans skill 要求,plan 写完后自查 + codex 二轮 review 反馈对照修订:

### 8.1 Spec coverage

| design § | task 覆盖 |
|---|---|
| §2.9.1 §1.1 诊断细化(含 persuasion-principles / anthropic-best-practices 缺) | **本 plan scope 不复制 superpowers persuasion-principles.md / anthropic-best-practices.md 文本**(Mi-2 修订);走 reference 路径 — Task 2 SKILL.md "方法论基础" 段引用 superpowers 上游 line 10-45 + Task 3 frontmatter-conventions.md 复用 superpowers writing-skills line 95-103 的 frontmatter 规则;persuasion / best-practices 文档级移植留 v1.1 |
| §2.9.2 ad-hoc 现状风险 | 不需要 task(动机性论述) |
| §2.9.3 forge 化协议设计(五步骤) | Task 2 SKILL.md 完整 port |
| §2.9.4 forge-eval 框架对齐 | **设计偏差**(§8.4 详):design 提的 `phase: red/green` / `expected_judge_score_max` / `expected_violations` 字段现有 runner 不读,本 plan 走现有 RED+GREEN 双轨设计(每 scenario 自动配对)而非引入新字段;Task 1 + Task 5 + Task 4 forge-eval-integration.md 覆盖现有 runner 模式 |
| §2.9.5 dogfood + bootstrap exception | **Task 1 + Task 2 共同处于 bootstrap exception 范围**(B-3 修订);Task 1 开始时主代理 invoke superpowers:writing-skills,完整 RED→SKILL→GREEN→REFACTOR 链(Task 1 RED → Task 2 SKILL → Task 5 GREEN+REFACTOR)+ SKILL.md 内显式声明 bootstrap exception |
| §2.9.6 长期目标 | 不需要 task(v1.1+ 范围) |
| §2.9.7 实施清单 | Task 0(SKILL_NAMES + .md 实体)+ Task 1(scenarios)+ Task 2(SKILL.md)+ Task 3(frontmatter)+ Task 4(forge-eval-integration)+ Task 5(GREEN + REFACTOR)+ Task 6(using-forge + tests)— 全覆盖 |
| §3.12 Interface Freeze | **不在本 plan**(9i 无新 schema / CLI 接口) |

### 8.2 Placeholder scan

逐 task 检查 `TBD` / `TODO` / `implement later`:
- Task 5 REFACTOR 阶段"若 delta < 1.5 → REFACTOR" — 不是 placeholder,是合规的迭代步骤(沿 superpowers writing-skills 五步骤)
- Task 0 placeholder 副本 `src/core/templates/skills/writing-skills.md` — 不是真 placeholder,是 Task 2 完成前的临时空白(Task 2 step 末尾 `cp skills/writing-skills/SKILL.md` 同步) — **必须验证 Task 5 sync step 真的 sync**(沿 plan §6 Task 5 Step 3 `diff` check)

### 8.3 Type / 字段 / 接口 consistency

- forge-eval yaml schema 字段:严格按 `forge-eval/types.ts:13-46` 现有 schema — `skill` / `description` / `model` / `scenarios[]` / `id` / `pressures[]?` / `turns[]` / `user` / `assertions?` / `judge_rubric`(必需)。**不引入 `phase` / `expected_judge_score_max` / `expected_violations` / `bootstrap_skill` 字段**(它们在 design §2.9.4 提及但 runner 不读)。
- `bootstrap_exception` 作为文档元数据(yaml 顶层注释或 description 文字),不是 runner 字段。
- SKILL_NAMES registry:Task 0 加 `'writing-skills'`(12 → 13);loadAllSkills(`src/core/templates/skills/index.ts:40`)自动覆盖。

### 8.4 风险 / Known issues(codex 二轮 review 反馈对照修订)

#### 8.4.1 design §2.9.4 与现有 runner 的设计偏差(codex B-1 修订)

design §2.9.4 提出在 yaml `scenarios:` 数组里分类标 `phase: red | green` + RED scenarios 必含 `expected_judge_score_max` + `expected_violations`。**现有 runner(`forge-eval/runner.ts:120-123`)不读这些字段** — 它对每个 scenario 无条件跑 RED(无 skill bootstrap)+ GREEN(有 skill bootstrap)双轨。

**裁决**:本 plan 走现有 runner 双轨设计(每 scenario 自动配对),**不引入** design §2.9.4 提的字段。理由:
- 现有双轨设计功能上等价 — 一个 scenario 跑 RED + GREEN 通过 `withSkill: false/true` 切换,delta ≥ 1.5 判 skill 起作用
- 引入 phase 字段需要改 runner.ts + types.ts + compare.ts,扩到独立 sub-plan
- design 字段可作为文档元数据(comment / description 文字)保留,runner 忽略未识别字段
- 9z release 时若 design vs impl 不一致仍未对齐,需要在 release-gate-checklist 标记 design §2.9.4 部分字段是文档目标而非 runtime 字段(留 TODO 给 9z)

#### 8.4.2 SKILL_NAMES registry 必须扩展(codex B-2 修订)

`forge-eval/index.ts:34` 用 `SKILL_NAMES.includes(next)` 校验 `--skill` 参数;`forge-eval/changed-only.ts:46/56` 用 SKILL_NAMES 过滤未知 skill。**Task 0 已加 SKILL_NAMES 扩展为 plan 第一个 task**。

#### 8.4.3 delta ≥ 1.5 阈值在 LLM-judge noise 下(codex M-3 修订)

`forge-eval/compare.ts:14` 默认 `DEFAULT_DELTA_THRESHOLD = 1.5`,无 `--retry` CLI 选项。LLM-judge 单次跑可能 ±0.5 分波动(沿 compare.ts:11 注释)。

**裁决**:9i 不引入 retry 机制(超 plan 范围)。Task 5 实施期若 delta 在 [1.3, 1.5] 边界震荡:
- 选项 A:手动跑 2 次取平均(plan §6 Task 5 Step 2 已写明)
- 选项 B:加强 SKILL.md 让 GREEN 分数稳定高(REFACTOR 步骤)
- 选项 C:延迟到 v1.1 加 `--retry` flag(记 TODO 给 v1.1)

#### 8.4.4 Task 间依赖(codex M-4 修订)

声明的 "Task 3 / 4 可并行" 实际上不完全成立:
- Task 2 SKILL.md 已 reference frontmatter-conventions.md / forge-eval-integration.md 文件名 → Task 3 / 4 之后才能跑 link check(若有)
- Task 5 REFACTOR **反向依赖** Task 2 — 若 delta < 1.5 需回改 SKILL.md(plan §6 Task 5 已显式写)

**正确的执行顺序**:Task 0 → Task 1 → Task 2 → Task 3 → Task 4 → Task 5(可能反向改 Task 2 → 同步副本)→ Task 6。Task 3/4 之间可并行但与 Task 2 串行。

#### 8.4.5 后续 sub-plan 衔接前置(codex M-5 修订)

声明的"unblock 9d/9f"在 v1.0 范围内**有条件成立**(沿 plan 顶部"后续 unblocked 的前置条件" 段):
- 9d / 9f 新 skill 开发遵循"加 SKILL_NAMES + 写 scenarios.yaml(走现有 runner 双轨)+ ref `skills/writing-skills/SKILL.md` 协议"模式
- **不依赖 design §2.9.4 phase 字段**(若 9d / 9f 引用 phase 字段会同样卡 runner 不读问题)
- 若 9d / 9f 想用 phase / expected_judge_score_max 等元数据,需要独立 sub-plan 扩展 runner — 不在 9i 解锁范围内

#### 8.4.6 bootstrap exception 完整链(codex B-3 修订)

Task 1(RED scenarios)+ Task 2(SKILL.md)+ Task 5(GREEN + REFACTOR)合并为完整 RED→SKILL→GREEN→REFACTOR 链,**全部在 superpowers:writing-skills bootstrap exception 范围内**。主代理在 Task 1 开始时 invoke `superpowers:writing-skills`,该 invoke 的语境覆盖 Task 1-2-5 三个 task(三 task 间不需要重复 invoke,但每次新 session 启动 task 时如需复习 superpowers 协议可重新 invoke)。

#### 8.4.7 工作量(codex M-1 修订)

P50 工日从 2.5 上调至 **3.0**(+0.4 工日为 Task 0 SKILL_NAMES 扩展 + design vs runner gap reconciliation 文档对齐工作)。P90 从 3.5 上调至 **4.0**。

### 8.5 跨 sub-plan 依赖

- **后续 9d / 9f 用 forge:writing-skills 的前置**:见 §8.4.5
- **9z release 检查**:release-gate-checklist § v1.0 段需说明:
  - `bootstrap_exception` 是文档元数据(yaml 顶层注释/description),非 runner 字段
  - design §2.9.4 提的 phase / expected_judge_score_max 等字段是 design 目标但 v1.0 不实施(留给独立 sub-plan)
  - `forge-eval/scenarios/writing-skills.yaml` 走现有 runner 双轨,无新字段

---

## 10. Execution Handoff

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

## 11. 修订记录

- **v1**(2026-05-11):初稿 — 基于 plan-9 master §3.9 + design §2.9 全节拆 6 task。本 sub-plan 实施 §2.9 全节(协议层落地);§3.12 Interface Freeze 不涉及。
- **v2**(2026-05-11):codex 二轮 adversarial review 全采纳 — 加 Task 0 SKILL_NAMES registry 扩展(B-2)+ 走现有 runner 双轨设计放弃 design §2.9.4 phase 字段(B-1)+ bootstrap exception 覆盖 Task 1+2+5 完整链(B-3)+ P50 2.5→3.0 工日(M-1)+ scope 排除 persuasion / best-practices 文本复制(Mi-2)+ using-forge 插入点修正为 line 141/142 之间(Mi-1)+ Task 5 反向依赖 Task 2 显式说明(M-4)+ 9d/9f unblock 前置条件加(M-5)+ retry 留 v1.1(M-3)。Self-Review §8 全面重写为 v2 修订表。
