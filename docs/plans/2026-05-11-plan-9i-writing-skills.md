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
| 0 | SKILL_NAMES registry 扩展(单点改动) | 0.3 | `src/core/templates/skills/index.ts` 加 `'writing-skills'` + vitest 单测断言 13 项;**不写 placeholder**(`scripts/copy-templates.mjs` build 时反向同步,沿 v3 修订) |
| 1 | scenarios.yaml + 最小骨架 SKILL.md + 跑 baseline | 0.5 | `forge-eval/scenarios/writing-skills.yaml` 2 个 scenarios + `skills/writing-skills/SKILL.md` 最小骨架(~10-15 行让 GREEN leg 不 ENOENT)+ `pnpm build` reverse-sync + 跑 full RED+GREEN eval 看 RED ≤ 5(沿 v3 修订 B-1) |
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
skills/writing-skills/SKILL.md                       ← Task 1:最小骨架(~10-15 行,让 GREEN leg 不 ENOENT)→ Task 2:~150-200 行完整协议
skills/writing-skills/frontmatter-conventions.md     ← Task 3:~60 行,name/description 规范 + 反例
skills/writing-skills/forge-eval-integration.md      ← Task 4:~80 行,新 skill 接入 forge-eval 步骤
forge-eval/scenarios/writing-skills.yaml             ← Task 1+5:scenarios(走现有 runner 双轨)
tests/forge-eval/writing-skills-protocol.test.ts     ← Task 6:yaml 结构合约 fixture 验证(路径修正:tests/forge-eval/ 而非 tests/eval/)
```

**v3 修订**:不再 Create `src/core/templates/skills/writing-skills.md` placeholder — 由 `pnpm build` 反向同步自动生成(沿 §8.4.2 B-2 修订)

### 修改文件

```
skills/using-forge/SKILL.md                          ← Task 6:在红旗清单段之前(line 142 前)新增 §"meta-development entry" 段
src/core/templates/skills/index.ts                   ← Task 0:SKILL_NAMES 加 'writing-skills'(从 12 → 13);loadAllSkills 自动覆盖
tests/core/templates/skills.test.ts                  ← Task 0:加 SKILL_NAMES registry 单测(参与 v3 修订 M-2 验收)
```

### Build 自动生成文件(commit 时 stage,不手写)

```
src/core/templates/skills/writing-skills.md          ← scripts/copy-templates.mjs 反向同步(自动加 forge: 前缀;Task 1 build 时生成)
dist/core/templates/skills/writing-skills.md         ← build 输出(若 .gitignore 不排除则 stage)
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

## 2. Task 0 — SKILL_NAMES registry 扩展 + 同步更新 hardcoded 12-item 断言

**Files:**
- Modify: `src/core/templates/skills/index.ts`(SKILL_NAMES 数组加 `'writing-skills'`)
- Modify: `tests/core/templates/registry.test.ts`(`toHaveLength(12)` → `13` + 完整列表数组加 `'writing-skills'`)
- Modify: `tests/smoke.test.ts`(`toHaveLength(12)` → `13`)
- Add: `tests/core/templates/skills.test.ts` 新增 SKILL_NAMES registry 单测段(沿 v4 修订)

**v6 修订**(codex 五轮 review B-NEW):`tests/core/templates/registry.test.ts:8/13` 硬断言 `SKILL_NAMES.length === 12` + 完整 12 项列表,`tests/smoke.test.ts:44` 同样硬断言 12 — Task 0 不同步改这两个文件,Task 2 Step 4 跑 `tests/core/templates/` 全目录必挂(`registry.test.ts` 在该目录内)。v5 漏列这两 modify。

**Goal**:让 `pnpm eval:skill writing-skills` 不被 CLI 校验拒绝(`forge-eval/index.ts:34` 要求 `--skill` 值在 SKILL_NAMES 内)。

**v3 重要修订**(codex 二轮 review B-2):**不创建 `src/core/templates/skills/writing-skills.md` placeholder**。`scripts/copy-templates.mjs:46` 会在 build 时 `clearMarkdownFiles` 清空整个 `src/core/templates/skills/*.md` 然后从 `skills/<name>/SKILL.md` **反向同步**(line 49 自动加 `forge:` 前缀以满足 `tests/core/templates/skills.test.ts:12` 的 `name: forge:<name>` 断言)。Task 0 只改 registry 数组;runtime 副本由 Task 1/2 创建 `skills/writing-skills/SKILL.md` 后 `pnpm build` 自动生成。

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

- [ ] **Step 3: 同步更新 hardcoded 12-item 断言(v6 必修,沿 codex 五轮 review B-NEW)**

`tests/core/templates/registry.test.ts:8` 断言 `toHaveLength(12)`,`:13` 断言完整 12 项数组;`tests/smoke.test.ts:44` 断言 `toHaveLength(12)`。Task 0 改 SKILL_NAMES 为 13 项后必须同步这三个 hardcoded:

```typescript
// tests/core/templates/registry.test.ts:8 改为 13
expect(SKILL_NAMES).toHaveLength(13);
expect(new Set(SKILL_NAMES).size).toBe(13);

// tests/core/templates/registry.test.ts:13 完整数组末尾加一行
expect(SKILL_NAMES).toEqual([
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
  'writing-skills', // 9i 新增
]);

// tests/smoke.test.ts:44 改为 13
expect(SKILL_NAMES).toHaveLength(13);
```

跑确认:

```bash
pnpm vitest tests/core/templates/registry.test.ts tests/smoke.test.ts
```

预期:registry.test.ts 4 PASS + smoke.test.ts(`exports templates registry` it 那条)PASS。

- [ ] **Step 4: 加 9i 新 registry 单测(parser-only,不跑 CLI)**

加测试到 `tests/core/templates/skills.test.ts`(或新建 `tests/core/templates/registry.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { SKILL_NAMES } from '../../../src/core/templates/skills/index.js';

describe('SKILL_NAMES registry (9i)', () => {
  it('includes writing-skills (sole self-bootstrapped skill, design §2.9.5)', () => {
    expect(SKILL_NAMES).toContain('writing-skills');
  });

  it('has 13 entries (v0.1 12 + 9i writing-skills)', () => {
    expect(SKILL_NAMES.length).toBe(13);
  });
});
```

**v3 修订**(codex 二轮 review M-2):**不跑 `pnpm build && node forge-eval/... --help`** — 因 `forge-eval/index.ts` 没实现 `--help`,该命令会走到 `loadEnv()` + scenario loading,不能干净证明 registry 接受。改单测断言更精确。

**v4 修订**(codex 三轮 review M-4):Task 0 阶段**只跑新 registry 单测**(精确 testNamePattern),不跑全目录。原因:`it.each(SKILL_NAMES)`(`tests/core/templates/skills.test.ts:9`)会尝试 `loadSkill('writing-skills')` ENOENT(`skills/writing-skills/SKILL.md` 还未建,Task 1 才建),全目录命令必挂。

```bash
pnpm vitest tests/core/templates/ --testNamePattern "SKILL_NAMES registry"
```

预期:2 tests PASS。完整 `tests/core/templates/` 全量跑由 Task 2 完成后(SKILL.md + `pnpm build` reverse-sync 全到位)恢复绿。

- [ ] **Step 5: format:check + commit**

```bash
pnpm format:check
git add src/core/templates/skills/index.ts tests/core/templates/skills.test.ts tests/core/templates/registry.test.ts tests/smoke.test.ts
git commit -m "feat(9i): SKILL_NAMES registry 12→13 — add writing-skills + sync hardcoded 12-item assertions"
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
# bootstrap_exception: 本 skill 自身的初次开发使用 superpowers 上游 writing-skills 完成
# (sole self-bootstrapped skill in forge,沿 design §2.9.5)
# 上述声明是文档元数据,forge-eval runner 忽略未识别 yaml 顶层 key
description: |
  forge:writing-skills protocol — RED-GREEN-REFACTOR + frontmatter + forge-eval 集成,
  确保新 forge skill 真的塑形 AI 行为。BOOTSTRAP EXCEPTION:本 skill 自身初次开发用 superpowers 上游 writing-skills。
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
          评估生成的 SKILL.md frontmatter 合规度(沿 superpowers 上游 writing-skills line 95-103):
          - description 用 "Use when..." 第三人称开头描述触发条件 → +3 分
          - 不在 frontmatter 写 process(不含 "detect/guard/find/check" 动词作主语)→ +2 分
          - body 引用 superpowers 上游 writing-skills(不用 superpowers:writing-skills 冒号命名空间,因 tests/core/templates/skills.test.ts:24 通用断言禁止) → +2 分
          - body 提到先写 RED scenario(superpowers 上游 line 16 不变量)→ +2 分
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

- [ ] **Step 4: 写最小合规骨架 `skills/writing-skills/SKILL.md`(让 GREEN leg 不抛 ENOENT)**

**v3 修订**(codex 二轮 review B-1 + RQ-5):原 plan "只看 RED leg" 不可行 — `forge-eval/runner.ts:106-131` 的 `orchestrateRun` 每个 scenario 串行跑 RED → GREEN,GREEN 跑 `loadSkillBootstrap('writing-skills')`(`forge-eval/runner.ts:27`)→ `readFile(src/core/templates/skills/writing-skills.md)` ENOENT → bubble 到 `forge-eval/index.ts:88` main.catch exit 2,**无 eval-report.md 落盘**。

正确路径:**先写骨架 SKILL.md 让 GREEN leg 加载 skill 文本不抛错**(skill 内容是空骨架,刻意让 GREEN judge 分数也低,这样能干净观察 RED leg 的真分数)。完整 SKILL.md 由 Task 2 替换。

`skills/writing-skills/SKILL.md`(Task 1 阶段的最小合规骨架,~10-15 行):

```markdown
---
name: writing-skills
description: Use when creating or modifying a forge skill — RED-GREEN-REFACTOR + frontmatter + forge-eval integration discipline (v4 Task 1 skeleton, Task 2 will replace with full content)
---

# forge writing-skills (Task 1 skeleton)

This skeleton exists so the forge-eval runner's GREEN leg does not ENOENT on loadSkillBootstrap. Task 2 will replace this with the full ~150-200 line protocol.

Methodology TBD by Task 2 — bootstrap exception applies (see plan §8.4.6).
```

**v4 修订**(codex 三轮 review B-2):骨架内容**不能含 `superpowers:writing-skills` 字面冒号命名空间**(`tests/core/templates/skills.test.ts:24` 通用断言 `not.toMatch(/superpowers:[a-z][a-z0-9-]*/)`)。骨架用 "bootstrap exception" 文字 + 引用 plan §8.4.6 替代命名空间字面;Task 2 完整 SKILL.md 草案同步避开冒号命名空间(详 §4 v4 修订)。

- [ ] **Step 5: 跑 build 让 reverse-sync 生成 registry 副本**

```bash
pnpm build
```

预期:`scripts/copy-templates.mjs:46-51` 反向同步把 `skills/writing-skills/SKILL.md` 读出 → `src/core/templates/skills/writing-skills.md` 自动加 `forge:` 前缀 + 写入 + `dist/core/templates/skills/writing-skills.md` 同步。stdout 末尾应含 `✓ synced 13 skills (root → src/core/templates/ + dist/)`(从 12 升到 13)。

- [ ] **Step 6: 跑完整 RED+GREEN eval 观察 RED leg score**

**必须在 Git-Bash 中执行**(本脚本是 bash 语法,沿用户内存"Windows 11 + Git-Bash + D: 盘项目"。若在 PowerShell 执行,改用 `$LASTEXITCODE` + `if ($LASTEXITCODE -in @(0,1)) {...}` 语法,沿 v6 修订 Mi-1):

```bash
# v5 修订(codex 四轮 review M-1):区分 exit 1(eval 跑完 runPass false,预期)与 exit 2(infra fail,真错误)
pnpm eval:skill writing-skills; ec=$?
if [ "$ec" -eq 0 ] || [ "$ec" -eq 1 ]; then
  echo "eval completed (exit $ec — $([ "$ec" -eq 1 ] && echo 'runPass false at skeleton stage, expected' || echo 'unexpected pass at skeleton stage'))"
elif [ "$ec" -eq 2 ]; then
  echo "infrastructure failure (exit 2) — env/scenario loading/API error, abort" >&2
  exit 2
else
  echo "unknown exit $ec, abort" >&2
  exit "$ec"
fi
```

**v4 修订**(codex 三轮 review M-1):`forge-eval/index.ts:83-85` 在 `!summary.runPass` 时 `process.exit(1)`(eval 跑完但 pair fail);`forge-eval/index.ts:88-91` 在 `main.catch` 时 `process.exit(2)`(infra 失败 — env / scenario loading / API)。**v5 修订**(codex 四轮 review M-1):区分两种退出码,不能用 `|| true` 一锅吞,否则 baseline 阶段假阳性 — env 错误或 API 不通也会被当 "预期 baseline 失败" 略过。

预期(LLM-judge 跑 2 scenario × 2 leg = 4 turn,~30-60s + ~$0.05 API 成本):
- RED leg avg judge ≤ 5
- GREEN leg avg judge 也低(可能 4-6,因骨架不教协议) — **delta 在本步预期接近 0**
- `eval-report.md` 落盘(总览表 + 失败详情,沿 `forge-eval/report.ts:21-59` 输出格式)
- exit code 通常 1(pair pass false) — 这是预期;若 exit 2 → infra fail,abort

- [ ] **Step 7: 读 eval-report.md 验收 RED leg ≤ 5**

`eval-report.md` 真实格式(沿 `report.ts:21-59`):
- 顶部元数据(timestamp / 总 API 调用 / 总 tokens / 总估算 cost / 整体结果)
- **总览表**:`| skill | scenario | RED avg | GREEN avg | delta | green pass | pair pass |`
- **失败详情段**(仅有失败 pair 时输出):每失败 pair 列 delta + GREEN scenarioPass + 失败 turn 列表(judge score + judge reasoning + 模式匹配失败)

判定 RED leg score 的命令(Windows + Git-Bash 环境):

```bash
cat eval-report.md
# 或针对性提取总览行(report 单行格式,无 withSkill 字段):
grep "writing-skills" eval-report.md
```

**v4 修订**(codex 三轮 review M-5):报告**不含** `withSkill` / `assistantResponse` 字段(那是 stdout / 内存 runtime 中间字段),只读 table 的 "RED avg" 列。

判定标准:总览表 "RED avg" 列 ≤ 5.0 即 baseline 失败合规。
- 若 RED ≥ 6 → 选项 A:收紧 must_match / judge_rubric;选项 B:与 plan owner 复审 9i 范围
- delta 当前接近 0 是预期(Task 5 会通过完整 SKILL.md 把 delta 拉到 ≥ 1.5)

- [ ] **Step 8: Commit**

```bash
pnpm format:check
git add forge-eval/scenarios/writing-skills.yaml skills/writing-skills/SKILL.md src/core/templates/skills/writing-skills.md
git commit -m "feat(9i): scenarios.yaml + SKILL.md skeleton + registry reverse-sync — baseline RED avg <= 5 verified"
```

注意:
- `src/core/templates/skills/writing-skills.md` 由 `pnpm build` 反向同步生成(自动加 `forge:` 前缀),沿现有 12-skill committed 模式
- `dist/core/templates/skills/writing-skills.md` 通常 `.gitignore` 排除,不 add
- 不要手 `cp skills/.../SKILL.md src/core/templates/...`(沿 v3 修订 B-2 / v4 修订 B-1) — 直接复制不会自动加 `forge:` 前缀,违反 `tests/core/templates/skills.test.ts:12` 断言

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

> **本 skill 自身的初次开发使用 superpowers 上游 writing-skills 完成(bootstrap exception,沿 design §2.9.5)**;后续修订使用 forge:writing-skills 自身。元数据 `bootstrap_exception: true` 标记在 `forge-eval/scenarios/writing-skills.yaml` 内。

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

- 写 forge plan(用 superpowers 上游 writing-plans 或 forge:writing-plans)
- 写 commands/*.md slash command(slash command 是 CLI 薄包装,不是行为塑形 skill)
- 修一个 typo / 加一行示例(non-behavior change,跳协议)

## forge 化适配(五步骤)

> **v3 修订**(沿 plan §8.4.1):本五步骤走 **现有 forge-eval runner 双轨设计**(`forge-eval/runner.ts:106-131` 对每个 scenario 自动 RED+GREEN 配对,`withSkill: false/true` 切换 bootstrap)。**不引入** design §2.9.4 提的 `phase: red/green` / `expected_judge_score_max` / `expected_violations` / `bootstrap_skill` 字段 — 这些 design 字段当前 runner 不读,留 v1.0 之后独立 sub-plan reconcile。

### 步骤 1:写 scenarios + 骨架 SKILL.md(baseline 验证)

新建 `forge-eval/scenarios/<new-skill-name>.yaml`,**每个 scenario 同时是 RED + GREEN 的输入**(runner 自动跑两次):
- 在 `scenarios:` 数组写至少 1 个 scenario,含 `id` / `turns[]` / `judge_rubric`(沿 `forge-eval/types.ts:13-46` schema)
- `judge_rubric` 同时给 RED 评判(baseline 没 skill 时该得多少分)+ GREEN 评判(有 skill 后该得多少分)— rubric 一段文字覆盖两侧
- 用 `must_match` / `must_not_match` 锁结构性信号(都是 RED + GREEN 共享断言)
- **同时创建 `skills/<new-skill-name>/SKILL.md` 最小骨架**(~10-15 行,仅 frontmatter + 占位 body)— 让 runner GREEN leg 不抛 ENOENT(沿 `loadSkillBootstrap` `readFile` 路径)
- 跑 `pnpm build && pnpm eval:skill <name>` → 读 `eval-report.md` 看 RED leg(`withSkill: false`)avg judge ≤ 5
- **如果 RED 不失败 → skill 没必要**(沿 superpowers writing-skills line 16);要么收紧 must_match / judge_rubric,要么放弃此 skill
- 此阶段 delta 接近 0 是预期(骨架 SKILL.md 不教协议,GREEN 也低)

### 步骤 2:写完整 SKILL.md(production code)

frontmatter 严格约束(详见 `frontmatter-conventions.md`):
- `name`:小写 + 连字符,无前缀(`forge:` namespace 由 plugin manifest 隐含;`scripts/copy-templates.mjs:49` 反向同步时自动加 `forge:` 前缀写入 `src/core/templates/skills/`)
- `description`:第三人称 + "Use when..." 开头 + 描述 **触发条件**(不描述 skill 做什么)+ 500 字内
- 不允许 frontmatter 含 process 描述(描述 process 是 SKILL.md body 的事)

content 必须包含:
- `## Overview`(1-2 句核心论点)
- `## When to Use` / `## When NOT to Use`(对称写)
- 主流程(numbered steps 或 dot graph)
- forge-specific 反向加固段(若 skill 涉及 AI 不可信前提,如 verify / archive 类)

### 步骤 3:跑 GREEN leg 验证 skill 起作用

```bash
pnpm build && pnpm eval:skill <new-skill-name>
```

read `eval-report.md` 看:
- GREEN leg(`withSkill: true`)avg judge ≥ 6.5
- delta = GREEN avg - RED avg ≥ 1.5(沿 `forge-eval/compare.ts:14` `DEFAULT_DELTA_THRESHOLD`)
- pair pass = `green.scenarioPass && delta >= 1.5`(沿 `compare.ts:28`)

若 GREEN 评分 < 6 或 delta < 1.5 → SKILL.md 写得不到位,回到步骤 2 加红旗清单 / 改示例 / 加反向加固段。

### 步骤 4:REFACTOR(close rationalization loopholes)

`eval-report.md` 含失败 GREEN turn 的 `judge.score` + `judge.reasoning`(沿 `forge-eval/report.ts:45-55`),用 judge reasoning 推断 AI 用了什么"借口式"应付。**注意**:report **不含** `assistantResponse` 完整文本字段;若需读 AI 原文,需临时改 runner.ts 加 verbose 输出或在 forge-eval 跑期 console.log(超 9i 范围)。

实操路径:
- 读 `eval-report.md` 失败详情段:`grep -A 5 "失败 turn 列表" eval-report.md`
- 看 judge reasoning 推 AI 说辞(如 reasoning 提到"AI 把这个当 quick prototype")
- 在 SKILL.md 加红旗清单显式 plug — 把这些借口列为 anti-pattern
- 重跑 `pnpm eval:skill <name>` 验证 plug 起作用(分数提高 / must_not_match 不再命中)

### 步骤 5:集成到 using-forge bootstrap(可选)

- **process discipline 类**(必须主动 invoke,如 verifying-three-dimensions / receiving-code-review):加到 `skills/using-forge/SKILL.md` 的 skill chain 表 + 红旗清单
- **reference / utility 类**(用户主动 invoke,如 writing-plans):不加 bootstrap,只在 README / docs 引用

**registry 部署**:每加新 forge skill,**还必须**(沿 v3 修订 + codex 二轮 review B-2):
1. 在 `src/core/templates/skills/index.ts` 的 `SKILL_NAMES` 数组追加 `'<new-skill-name>'`
2. 跑 `pnpm build` 让 `scripts/copy-templates.mjs` 反向同步生成 `src/core/templates/skills/<name>.md`(自动加 `forge:` 前缀)
3. 不要手动写 `src/core/templates/skills/<name>.md`(build 时 clearMarkdownFiles 会清掉)

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
| "我用 forge:writing-skills 自己开发 forge:writing-skills" | 逻辑悖论。第一个开发用 superpowers 上游 writing-skills(bootstrap exception)|

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

- [ ] **Step 4: Reverse-sync + Commit**

**v5 修订**(codex 四轮 review M-4):Task 2 替换 `skills/writing-skills/SKILL.md` 后**必须立即跑 `pnpm build`**,让 `scripts/copy-templates.mjs:46-51` 反向同步重生成 `src/core/templates/skills/writing-skills.md`(从 Task 1 骨架升级为完整内容)。否则 Task 2 → Task 5 之间 committed runtime template 仍是骨架,Task 5 跑 `pnpm eval:skill writing-skills` 加载 stale 骨架 → GREEN delta 永远不会到 1.5。

```bash
pnpm build                                    # reverse-sync 重生成 registry 副本
pnpm format:check && pnpm typecheck           # 验证
pnpm vitest tests/core/templates/             # 全 13 skill 通用断言现在应过(SKILL.md 不含 superpowers:<x>)
git add skills/writing-skills/SKILL.md src/core/templates/skills/writing-skills.md
git commit -m "feat(9i): forge writing-skills SKILL.md — RED-GREEN-REFACTOR + frontmatter + forge-specific reinforcement (bootstrap via superpowers upstream writing-skills)"
```

注:commit message **不用** `superpowers:writing-skills` 冒号命名空间字面(沿 v5 修订)— 虽然 commit message 不进 skill body 不触发测试,但保持一致避免误传给 9d/9f 后续 sub-plan。

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

`forge-eval/scenarios/<new-skill-name>.yaml`(单文件;一组 scenarios,**runner 自动对每个 scenario 跑 RED + GREEN 两次** — 沿 `forge-eval/runner.ts:120-123`)

## 顶级元数据字段(沿 `forge-eval/types.ts:41-46` ScenarioFile schema)

```yaml
skill: <new-skill-name>          # 与 SKILL_NAMES 一致(`src/core/templates/skills/index.ts:12`)
description: <一句话>             # 这个 skill 测试什么(可选,但建议)
model: claude-sonnet-4-6          # 默认评估模型;scenario.model 可覆盖
```

**v3 偏差说明**:design §2.9.4 提的 `bootstrap_exception: true` 顶层字段当前 runner 不读(types.ts ScenarioFile interface 没此字段,但 yaml 解析器忽略未识别 key,不报错)。本 plan 在 `forge-eval/scenarios/writing-skills.yaml` 内用 yaml 顶层 comment 或 description 字段文字标注 "bootstrap_exception" 作为文档元数据,沿 plan §8.4.1 偏差决策。其他新 forge skill **不用**这个标注(只有 writing-skills 自身是 bootstrap exception)。

## scenarios 数组字段(沿 `forge-eval/types.ts:25-38` Scenario schema)

每条 scenario 含:

```yaml
- id: <scenario-id>               # 唯一 id(必需)
  pressures: [time | sycophancy]  # 可选;仅记录维度 tag,不参与判定
  turns:
    - id: t1-<turn-id>            # 可选;默认按数组索引
      user: |
        <用户输入>                # 必需
      assertions:                 # 可选;模式匹配(skipped=true 时通过)
        must_match:               # AI 输出 必须 包含这些 regex
          - regex: '<pattern>'
        must_not_match:           # AI 输出 不能 包含这些 regex
          - regex: '<pattern>'
      judge_rubric: |             # 必需(spec §5.5.3 合约)
        <LLM-judge 评分指引,同时给 RED 和 GREEN 评判细则>
        - RED(无 skill bootstrap)预期 ≤ 5
        - GREEN(有 skill bootstrap)预期 ≥ 6.5
        - delta(GREEN avg - RED avg)预期 ≥ 1.5
```

**v3 修订**(codex 二轮 review B-3):**不引入** `phase: red/green` / `expected_judge_score_max` / `expected_violations` / `bootstrap_skill` 字段 — 这些在 design §2.9.4 提出但 runner 不读(`forge-eval/types.ts:13` 没定义)。若 9d/9f/9j 等后续 sub-plan 想要这些字段做严格门禁,需要先开独立 sub-plan 扩展 runner + types + compare(超 9i 范围)。

## RED + GREEN 配对工作原理

`forge-eval/runner.ts:120-123`(`orchestrateRun`)对每个 scenario:
1. **RED leg**:`runScenario(scenario, withSkill=false, client)` — 不加 skill bootstrap,跑 baseline AI
2. **GREEN leg**:`runScenario(scenario, withSkill=true, client)` — 加载 `skills/<skill-name>/SKILL.md` 作为 system message,跑 with-skill AI
3. **比较**:`compareScenarioPair(scenario, red, green, threshold=1.5)` → `pairPass = green.scenarioPass && delta >= 1.5`

同一份 scenario.yaml 同时是 RED 和 GREEN 的输入。**rubric 和 assertions 是共享的** — runner 不知道哪一次跑是 RED 哪一次是 GREEN,它只比较分数差。

## delta 阈值(GREEN - RED 必须 ≥ 1.5)

沿 `forge-eval/compare.ts:14` 默认 `DEFAULT_DELTA_THRESHOLD = 1.5`:

```
GREEN avg score - RED avg score ≥ 1.5
```

若不达标:
1. RED 太宽松(AI 没 skill 也没怎么犯错)→ 收紧 must_match / 加 pressure / 改 judge_rubric 评分门槛
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
- Auto-regenerate(build):`src/core/templates/skills/writing-skills.md`(reverse-sync,**不手动 cp**)

**Goal**:用现有 runner 双轨设计跑 GREEN leg(有 skill bootstrap),验证 delta ≥ 1.5;若不达标 REFACTOR 修 Task 2 SKILL.md。**本 task 是反向依赖 Task 2 的合规迭代,不是 placeholder**(沿 writing-skills 五步骤的步骤 4 REFACTOR)。

**v4 重要修订**(codex 三轮 review B-1):**永远不用 `cp skills/.../SKILL.md src/core/templates/...`**。`scripts/copy-templates.mjs:49` 反向同步会把 `name: writing-skills` 自动 transform 为 `name: forge:writing-skills`(以满足 `tests/core/templates/skills.test.ts:12` 断言)。手动 cp 不做这个 transform → template 副本 `name: writing-skills` → 测试挂。

正确路径:**任何修改 `skills/writing-skills/SKILL.md` 之后,必须 `pnpm build` 重生成 `src/core/templates/skills/writing-skills.md`**;不要手动复制。

- [ ] **Step 1: 跑 build + RED+GREEN 双轨完整 eval**

```bash
pnpm build && pnpm eval:skill writing-skills
```

预期(沿 `forge-eval/compare.ts:14` 默认 1.5 阈值):
- RED leg avg judge score ≤ 5(Task 1 已验证)
- GREEN leg avg judge score ≥ 6.5
- delta = GREEN avg - RED avg ≥ 1.5
- pair pass = `green.scenarioPass && delta >= 1.5`(沿 compare.ts:28)

`eval-report.md` 输出总览表(沿 `forge-eval/report.ts:23-30`),直接读 "delta" 列。

- [ ] **Step 2: 若 delta < 1.5 → REFACTOR**

`eval-report.md` 失败详情段含每条失败 GREEN turn 的 `judge.score` + `judge.reasoning`(沿 `report.ts:45-55`)。从 reasoning 推 AI 用的"借口式"应付,例:

- reasoning 含 "AI 把这个当 quick prototype" → 在 SKILL.md 红旗清单加新行 plug
- reasoning 含 "AI 觉得时间紧可以跳 RED" → 在 SKILL.md 加显式 anti-pattern 段

修改 `skills/writing-skills/SKILL.md`(回写 Task 2 的产出);然后:

```bash
pnpm build  # 必须重跑 — reverse-sync 重生成 src/core/templates/skills/writing-skills.md(自动加 forge: 前缀)
pnpm eval:skill writing-skills
```

重复直到 delta ≥ 1.5。

**LLM-judge noise 处理**(plan §8.4 已识别):若单次跑 delta 在 [1.3, 1.5] 边界震荡,允许跑 2 次取平均(手动,沿 v0.1 forge-eval CLI 不支持 --retry,详 §8.4)。

- [ ] **Step 3: 自动断言 template 副本同步 + 测试全绿**

```bash
# v5 修订(codex 四轮 review Mi-1):用 grep 断言而非人工观察 head -3
grep -q "^name: forge:writing-skills$" src/core/templates/skills/writing-skills.md \
  || { echo "✗ reverse-sync 未生成 'name: forge:writing-skills' frontmatter" >&2; exit 1; }
echo "✓ reverse-sync 正确加 forge: 前缀"

# 跑全 skill 测试(此时 writing-skills.md 已就位,通用断言应全过 — 13 skill × 3 通用断言 = 39 个 templates/skills 用例)
pnpm vitest tests/core/templates/
```

**v5 修订**(codex 四轮 review Mi-1):`head -3` 是人工观察非断言;改用 `grep -q "^name: forge:writing-skills$"` + exit 1 失败 — 让 CI / 执行者捕获 reverse-sync 失败而不依赖人眼。`tests/core/templates/` 全目录跑是真正保障(`skills.test.ts:9` `it.each(SKILL_NAMES)` 遍历 13 skill 检查 `name: forge:<name>` 必匹配)。

**不用 `diff skills/... src/core/templates/...`** — 两文件本来就不应该 byte-identical(reverse-sync 改了 `name:` 行)。

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

`forge:writing-skills` 自身的初次开发使用 superpowers 上游 writing-skills 完成(bootstrap exception,沿 design §2.9.5);后续修订使用 forge:writing-skills 自身。详 `skills/writing-skills/SKILL.md`。

```

注:
- 用 `Edit` tool 时锚点用 line 141 的精确空行 + line 142 的标题(避免误改 slash commands 表)
- **v5 修订**(codex 四轮 review B-2):using-forge 是 registered skill(SKILL_NAMES 第 1 项),`scripts/copy-templates.mjs` reverse-sync 到 `src/core/templates/skills/using-forge.md`,触发 `tests/core/templates/skills.test.ts:24` 通用断言 `not.toMatch(/superpowers:[a-z][a-z0-9-]*/)` — 因此插入内容**不能含 `superpowers:<x>` 冒号命名空间字面**,必须用"superpowers 上游 writing-skills"(空格分隔)替代

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
- Task 5 REFACTOR 阶段"若 delta < 1.5 → REFACTOR" — 不是 placeholder,是合规的迭代步骤(沿 superpowers 上游 writing-skills 五步骤)
- Task 1 阶段的 `skills/writing-skills/SKILL.md` 最小骨架 — 不是真 placeholder,是让 GREEN leg 不抛 ENOENT 的最小合规结构;Task 2 替换为完整内容,**`src/core/templates/skills/writing-skills.md` 由 `pnpm build` 反向同步自动生成,不手动 cp**(沿 v3/v4 修订 B-1/B-2)

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

**v4 修订**(codex 三轮 review M-3):design §2.9.4 vs runner 双轨设计的不一致**必须在 v1.0 release 前 reconcile**,不能只在 9z release-gate-checklist 留 TODO。提供三条可执行路径,**任选其一在 9z 之前完成**:

- **路径 A(推荐)**:**修订 design §2.9.4**(轻量改动,~0.2 工日) — 把 design 中的 "在 yaml `scenarios:` 数组里分类标 `phase: red | green`" 改为 "走现有 runner 双轨设计 — 每个 scenario 自动 RED + GREEN 配对"。承认现有 runner 是 v1.0 事实;phase / expected_judge_score_max 等字段标为 v1.1+ 增强目标。**此路径推荐**,因为 v1.0 实际 v0.1 forge-eval 已运作 12 skill × 29 case 双轨设计,没必要为字面对齐改 runner。
- **路径 B**:**新开 sub-plan(假设 9k)扩展 runner**(~3-4 工日) — 改 `forge-eval/runner.ts` 读 `phase` 字段,RED-only / GREEN-only scenarios 各跑一次;改 `forge-eval/types.ts` 加新字段;改 `forge-eval/compare.ts` 处理新输入;现有 12 skill yaml 兼容(老 scenarios 默认 phase 由 withSkill 推断)
- **路径 C**:**v1.0 显式承认不实施 phase 字段,推迟到 v1.1+**(~0.3 工日,v6 修订上调) — **必须同时改三处**(沿 codex 五轮 review M-C):
  1. `docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §2.9.4 顶部插入显式段落 "v1.0 NOT IMPLEMENTED: phase / expected_judge_score_max / expected_violations / bootstrap_skill 字段是 v1.1+ 目标,v1.0 实施走 forge-eval runner 双轨设计(沿 forge-eval/runner.ts:106-131)"
  2. **同步改 design §2.9.4 line 1573-1577**:把"必须配 phase: red | green"改为"现有 runner 双轨,phase 字段是 v1.1+ 目标";`expected_judge_score_max` / `expected_violations` 标 v1.1+ optional
  3. **同步改 design §2.9.7 line 1620-1624 实施清单**:删除 "phase: red 标记 / phase: green 标记" + "expected_violations / expected_judge_score_max" 强制项,标"v1.1+";否则 design 内部 §2.9.4 顶部说不实施但 §2.9.7 仍要求 → 自相矛盾
  4. CHANGELOG / release-notes 标注同样信息

  **仅改 CHANGELOG / design 顶部不算真正 reconcile**(沿 codex 五轮 review M-C — design §2.9.7 line 1620-1624 内部 reference 必须同步)

**9z release 前必须三选一**(不是 TODO,是 release blocker)。**owner 指定**:路径 A / 路径 C 由 9z owner 完成;路径 B 需新开 sub-plan(由 v1.0 master plan owner 决定是否引入)。本 plan-9i 自身不处理。

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

#### 8.4.8 v3 修订(codex 三轮 review)

v2 plan 后 codex 三轮 review 发现三个 v2 未消解的 BLOCKER:

**B-1**(Task 1 baseline 半轨不可行):runner.ts:106-131 `orchestrateRun` 串行 RED→GREEN 每个 scenario,GREEN 跑 `loadSkillBootstrap('writing-skills')` 时 readFile ENOENT → main.catch exit 2 → **无 eval-report.md 落盘**,"只看 RED leg" 不可达。**v3 修复**:Task 1 同步建最小骨架 `skills/writing-skills/SKILL.md` 让 GREEN 不抛 ENOENT,跑完整 RED+GREEN eval 后读 eval-report.md。

**B-2**(Task 0 placeholder 与 reverse-sync 冲突):`scripts/copy-templates.mjs:46` build 时 clearMarkdownFiles 清空 + 反向同步;`tests/core/templates/skills.test.ts:12` 断言 `name: forge:<name>`。**v3 修复**:Task 0 删 placeholder 步骤,只改 SKILL_NAMES;副本由 build 自动生成。

**B-3**(Task 2/4 草案仍含 phase 字段教学):v2 改了 plan 顶部但漏改 Task 2/4 内嵌文档草案(plan:334/356/540 仍教 `phase: red/green` / `expected_*` 字段)。**v3 修复**:Task 2 SKILL.md 草案 §"forge 化适配" + Task 4 forge-eval-integration.md 草案全部重写,删 design §2.9.4 不兼容字段,加 "走现有 runner 双轨" + "RED+GREEN 配对工作原理" 段。

**M-1**(Task 5 反向依赖 ownership):fresh-subagent 不会回改上游产物。**v3 修复**:§10 加 ownership 规则,Task 1/2/5 必须同一 owner(`SendMessage(to: A)` 继续)。

**M-2**(CLI 验收不够 parser-only):CLI 没实现 `--help`,`--skill writing-skills --help` 会进 scenario loading。**v3 修复**:Task 0 改用 vitest 单测断言 `SKILL_NAMES.includes` + length === 13。

**Mi-1**(Windows grep):用户环境 Git-Bash 可用 grep;**v3 修复**:Task 1 Step 6 注明 grep 可用 + `cat eval-report.md` 备选。

#### 8.4.9 v4 修订(codex 三轮 review)

v3 plan 后 codex 三轮 review 又发现 2 BLOCKER + 4 MAJOR + 1 MINOR:

**B-1**(Task 5 cp 绕过 reverse-sync):v3 Task 5 Step 2/3 仍写 `cp skills/.../SKILL.md src/core/templates/...` + `diff` 验证,但 `scripts/copy-templates.mjs:49` reverse-sync 会自动加 `forge:` 前缀,cp 不做这个 transform → `tests/core/templates/skills.test.ts:12` 断言挂。**v4 修复**:Task 5 改 `pnpm build` 自动 reverse-sync(不手动 cp);Step 3 改用 `head -3` 检查 frontmatter `name:` 是否含 `forge:` 前缀 + 跑 `tests/core/templates/` 全目录确认通过。

**B-2**(SKILL.md 草案含 `superpowers:writing-skills` 字面量):Task 1 骨架 + Task 2 完整 SKILL.md 草案多处 `superpowers:writing-skills` 字面命名空间,但 `tests/core/templates/skills.test.ts:24` 通用断言 `not.toMatch(/superpowers:[a-z][a-z0-9-]*/)` — 现有 12 skill 全部不含此字面。**v4 修复**:草案改用 "superpowers 上游 writing-skills"(空格分隔)替代 `superpowers:writing-skills`(冒号命名空间)。`forge:<x>` 字面 OK(现有 skill 也有)。

**M-1**(骨架 eval 非零退出):骨架阶段 GREEN judge 必然 < 6 → `forge-eval/index.ts:83` exit 1,subagent 可能当任务挂止。**v4 修复**:Task 1 Step 6 命令加 `|| true`,显式说明 exit 1 是 baseline 预期行为。

**M-2**(Ownership rules 与 SDD 工作流冲突):v3 §10 "Task 1/2/5 同 owner via SendMessage" 与 `forge:subagent-driven-development` SKILL.md core principle(fresh subagent per task)直接冲突。**v4 修复**:§10 改为"混合模式 — Task 1/2/5 紧耦合主代理 inline 执行(走 `superpowers:executing-plans` tightly coupled 路径)+ Task 0/3/4/6 fresh subagent"。

**M-3**(phase 字段对齐留 9z 不可执行):9z scope 不含改 runner。**v4 修复**:§8.4.1 加三条可执行 reconcile 路径(A 改 design / B 新 sub-plan 扩 runner / C 显式记为 v1.1+),9z 前必须三选一,不是 TODO。

**M-4**(Task 0 Step 3 命令矛盾):v3 step 3 先写 `pnpm vitest tests/core/templates/`(必挂),又解释只能跑 testNamePattern。**v4 修复**:删第一行全目录命令,只保留 testNamePattern 命令。

**M-5**(eval-report 格式不符):v3 Task 1 grep `withSkill` 字段,Task 5 提 `assistantResponse` — `forge-eval/report.ts:21-59` 实际不输出这两个字段(只有总览表 `RED avg / GREEN avg / delta / pair pass` + 失败详情段含 judge score + reasoning)。**v4 修复**:Task 1 Step 7 改读总览表 "RED avg" 列;Task 5 Step 2 改读 judge reasoning;Task 2 草案步骤 4 删除 assistantResponse 字段引用 + 加 "report 不含 assistantResponse" 说明。

**Mi-1**(§8.2 残留 v2 placeholder 文案):**v4 修复**:§8.2 重写为 "Task 1 骨架不是 placeholder + 副本由 build 自动生成"。

**P50 工日**:维持 3.0(v4 修订主要是修文档细节,不增 task)

### 8.5 跨 sub-plan 依赖

- **后续 9d / 9f 用 forge:writing-skills 的前置**:见 §8.4.5
- **9z release 检查**:release-gate-checklist § v1.0 段需说明:
  - `bootstrap_exception` 是文档元数据(yaml 顶层注释/description),非 runner 字段
  - design §2.9.4 提的 phase / expected_judge_score_max 等字段是 design 目标但 v1.0 不实施(留给独立 sub-plan)
  - `forge-eval/scenarios/writing-skills.yaml` 走现有 runner 双轨,无新字段

---

## 10. Execution Handoff

**Plan 完成。本 plan 的执行选项 — v4 修订**(codex 三轮 review M-2):

### 推荐:混合模式(inline core + subagent satellites)

**v4 关键修订**:原 v3 "Task 1/2/5 同 owner via SendMessage" 与 `forge:subagent-driven-development` SKILL.md core principle(line 12 "Fresh subagent per task")**直接冲突** — SDD skill 没有"跨 task 复用同 subagent"语义。

正确做法:把 Task 1/2/5 视为一个紧耦合逻辑单元(SDD skill 的 "tightly coupled" 路径,沿 SDD SKILL.md line 27),由**主代理 inline 执行**;Task 0/3/4/6 视为独立单元,可派 fresh subagent。

#### 具体派发模式

| Tasks | 执行方式 | 沿用 skill |
|---|---|---|
| **Task 1 + Task 2 + Task 5**(bootstrap exception 紧耦合单元) | **主代理 inline 执行**(superpowers:writing-skills bootstrap exception 在主代理 context 内连贯) | `superpowers:executing-plans` 的"tightly coupled section" 路径 |
| **Task 0**(SKILL_NAMES + 单测) | fresh subagent(纯独立) | `forge:subagent-driven-development` |
| **Task 3**(frontmatter-conventions.md) | fresh subagent(独立 markdown) | `forge:subagent-driven-development` |
| **Task 4**(forge-eval-integration.md) | fresh subagent(独立 markdown) | `forge:subagent-driven-development` |
| **Task 6**(using-forge + tests) | fresh subagent(独立) | `forge:subagent-driven-development` |

#### 执行顺序(v5 修订,codex 四轮 review B-1;v6 加 barrier,codex 五轮 M-A)

**Task 0 必须最先 + 显式 barrier**(SKILL_NAMES 不含 writing-skills 时 `pnpm eval:skill writing-skills` 被 CLI 拒绝,沿 `forge-eval/index.ts:34` + plan §0 总览串行约束 line 55):

1. **Task 0 派 fresh subagent**(SKILL_NAMES 扩展 + 单测)— 必须先跑
2. **BARRIER**(v6 修订,sync block):**主代理 wait Task 0 subagent 返回 + commit 落盘**,通过运行以下命令验证 Task 0 完成:
   ```bash
   git log -1 --pretty=%s | grep -q "SKILL_NAMES registry 12→13"  # 确认 Task 0 commit 已落
   grep -q "'writing-skills'" src/core/templates/skills/index.ts    # 确认 SKILL_NAMES 含 writing-skills
   ```
   两命令任一非 0 退出 → Task 0 未完成 → 等待。**禁止在 Task 0 commit 未落盘前进入 Task 1**(否则 `pnpm eval:skill writing-skills` 在 Task 1 Step 6 必挂)。
3. 主代理 inline:Task 1 → Task 2(同一 session,bootstrap exception 内 invoke superpowers 上游 writing-skills 后连续走 RED → SKILL.md 写完)
4. Task 3 / Task 4 派 fresh subagents(可并行,无 cross-task 依赖)
5. 主代理 inline:Task 5(继续 bootstrap exception 链,可能回改 Task 2 SKILL.md)
6. Task 6 派 fresh subagent

主代理 inline 执行 Task 1+2+5 的好处:
- 不需要"跨 task 持久化 subagent context"的非标准机制
- 主代理对 superpowers:writing-skills bootstrap exception 的语境保持连贯
- Task 5 REFACTOR 改 Task 2 SKILL.md 时,主代理直接读写,无 cross-subagent handoff 问题

#### 替代方案:全 inline

若用户偏好简单工作流,可全部 7 task 都主代理 inline(走 `superpowers:executing-plans` 全程)。代价:主代理 context 累积更大;好处:无 subagent 派发协调开销。

实施完成后,9i 解锁 9d / 9f 后续 skill 开发(沿 §8.4.5 前置条件)。验收通过(全 task 测试 PASS + DoD checklist 全勾)后启动 9d。

---

## 11. 修订记录

- **v1**(2026-05-11):初稿 — 基于 plan-9 master §3.9 + design §2.9 全节拆 6 task。本 sub-plan 实施 §2.9 全节(协议层落地);§3.12 Interface Freeze 不涉及。
- **v2**(2026-05-11):codex 二轮 adversarial review 全采纳 — 加 Task 0 SKILL_NAMES registry 扩展(B-2)+ 走现有 runner 双轨设计放弃 design §2.9.4 phase 字段(B-1)+ bootstrap exception 覆盖 Task 1+2+5 完整链(B-3)+ P50 2.5→3.0 工日(M-1)+ scope 排除 persuasion / best-practices 文本复制(Mi-2)+ using-forge 插入点修正为 line 141/142 之间(Mi-1)+ Task 5 反向依赖 Task 2 显式说明(M-4)+ 9d/9f unblock 前置条件加(M-5)+ retry 留 v1.1(M-3)。Self-Review §8 全面重写为 v2 修订表。
- **v3**(2026-05-11):codex **三轮** adversarial review 全采纳(独立对照 forge-eval/runner.ts / forge-eval/index.ts / scripts/copy-templates.mjs / tests/core/templates/skills.test.ts 实际代码验证):
  - **B-1**(baseline 半轨不可执行):Task 1 改为"先建最小骨架 SKILL.md → `pnpm build` reverse-sync → 跑完整 RED+GREEN eval → 读 eval-report.md 看 RED leg"。原 plan "只看 RED leg" 不可行(runner 串行 RED→GREEN,GREEN ENOENT 时 main.catch exit 2 无 eval-report 落盘)
  - **B-2**(Task 0 placeholder 与 reverse-sync 冲突):删除 Task 0 写 `src/core/templates/skills/writing-skills.md` placeholder 步骤(`scripts/copy-templates.mjs:46` build 时 clearMarkdownFiles 清空 + 自动加 `forge:` 前缀反向同步;`tests/core/templates/skills.test.ts:12` 断言 `name: forge:<name>` 与 placeholder 不符)。Task 0 只改 SKILL_NAMES,registry 副本由 Task 1 创建 `skills/writing-skills/SKILL.md` + `pnpm build` 自动生成
  - **B-3**(Task 2/4 草案仍含 phase 字段教学):重写 Task 2 SKILL.md 草案 §"forge 化适配(五步骤)"+ Task 4 forge-eval-integration.md 草案,删除所有 `phase: red/green` / `expected_judge_score_max` / `expected_violations` / `bootstrap_skill` 字段教学,加显式 "走现有 runner 双轨" 段落 + RED+GREEN 配对工作原理段
  - **M-1**(Task 5 反向依赖 ownership):§10 Execution Handoff 加 "Ownership rules" 段 — Task 1/2/5 必须同一 owner(`SendMessage(to: A)` 继续),Task 3/4/6 独立 fresh subagent
  - **M-2**(CLI 验收不够 parser-only):Task 0 Step 3 改为 vitest 单测断言 `SKILL_NAMES.includes('writing-skills')` + `SKILL_NAMES.length === 13`,不跑 `pnpm build && node forge-eval/... --help`(CLI 没实现 `--help`)
  - **Mi-1**(Windows grep):Task 1 Step 6 注明 Windows + Git-Bash 环境 grep 可用(沿用户内存:"Windows 11 + Git-Bash + D: 盘项目"),也允许 `cat eval-report.md` 直接读
  - **P50 工日**:维持 3.0(B-1 修复加 0.1 抵消 B-2 placeholder 删除 -0.1)
- **v4**(2026-05-11):codex **四轮** adversarial review 全采纳(独立对照 forge-eval/report.ts / skills/subagent-driven-development/SKILL.md / 现有 12 skill body 命名空间用法验证):
  - **B-1**(Task 5 cp 绕过 reverse-sync):删除 cp / diff,改用 `pnpm build` 触发 reverse-sync;Step 3 改 `head -3` 验证 frontmatter `forge:` 前缀 + `tests/core/templates/` 全目录测试
  - **B-2**(SKILL.md 草案含 `superpowers:writing-skills` 字面):Task 1 骨架 + Task 2 完整 SKILL.md 草案改 "superpowers 上游 writing-skills"(空格分隔)替代冒号命名空间;`forge:<x>` 保留(现有 skill 也有)
  - **M-1**(骨架 eval 非零退出):Task 1 Step 6 加 `|| true` + 显式说明 exit 1 是 baseline 预期
  - **M-2**(Ownership rules 与 SDD 工作流冲突):§10 改"混合模式" — Task 1/2/5 紧耦合主代理 inline(走 `superpowers:executing-plans`),Task 0/3/4/6 fresh subagent(走 `forge:subagent-driven-development`);删除 v3 "SendMessage 跨 task 复用" 非标做法
  - **M-3**(phase 字段对齐留 9z 不可执行):§8.4.1 加三条可执行 reconcile 路径(A 改 design / B 新 sub-plan / C 显式 v1.1+),9z 前必须三选一,不是 TODO
  - **M-4**(Task 0 Step 3 命令矛盾):删除全目录命令,只保留 `--testNamePattern "SKILL_NAMES registry"`
  - **M-5**(eval-report 格式不符):Task 1 Step 7 改读总览表 "RED avg" 列(不读 withSkill);Task 5 Step 2 改读 judge reasoning(不读 assistantResponse);Task 2 草案步骤 4 删 assistantResponse 引用
  - **Mi-1**(§8.2 残留 v2 placeholder 文案):§8.2 重写为 "Task 1 骨架 + 副本由 build 自动生成"
  - **P50 工日**:维持 3.0(v4 修订全是文档细节修正,不增 task)
- **v5**(2026-05-11):codex **五轮** adversarial review 全采纳(独立对照 plan §10 执行顺序、Task 6 using-forge 草案、forge-eval/index.ts:83-91 exit code 分支、judge_rubric line 240、Task 2 Step 4 commit 流程验证):
  - **B-1 NEW**(§10 执行顺序错排):Task 1→2 排在 Task 0 之前与 SKILL_NAMES CLI 校验冲突。v5 修:§10 改 Task 0 → Task 1 → Task 2 → Task 3/4(并行)→ Task 5 → Task 6
  - **B-2 残留**(Task 6 using-forge 段含 superpowers:writing-skills 字面):v4 漏改 Task 6 §8 内嵌 using-forge 修改草案 line 818。v5 修:改"superpowers 上游 writing-skills"+ 加 v5 修订注释
  - **M-1**(`|| true` 吞 exit 2 假阳性):v5 修:Task 1 Step 6 改精确 exit code 检查(case 0/1 OK,case 2 abort)
  - **M-2**(rubric line 240 含冒号命名空间):v5 修:rubric 改"superpowers 上游 writing-skills"+ 注明 tests:24 断言约束
  - **M-3**(路径 C 不真 reconcile):v5 修:路径 C 加约束必须同时改 design §2.9.4 + CHANGELOG;~0.1 工日;加 owner 指定
  - **M-4**(Task 2 未跑 build,副本 stale):v5 修:Task 2 Step 4 改"Reverse-sync + Commit",必跑 pnpm build + stage src/core/templates/skills/writing-skills.md + 跑 tests/core/templates/ 验证
  - **Mi-1**(`head -3` 非断言):v5 修:Task 5 Step 3 改 `grep -q "^name: forge:writing-skills$" ... || exit 1` 自动断言
  - **P50 工日**:维持 3.0(v5 修订全是文档细节修正,不增 task)
- **v6**(2026-05-11):codex **六轮** adversarial review 全采纳(独立对照 tests/core/templates/registry.test.ts / tests/smoke.test.ts / docs/specs §2.9.7 line 1620-1624 实证验证):
  - **B-NEW**(Task 0 漏改 hardcoded 12-item 断言):registry.test.ts:8/13 + smoke.test.ts:44 硬断言 12,Task 0 改 SKILL_NAMES 为 13 后 Task 2 Step 4 跑 tests/core/templates/ 必挂。v6 修:Task 0 Files 列表加 registry.test.ts + smoke.test.ts;Step 3 同步改三个 hardcoded 断言(12→13 + 完整数组加 'writing-skills');Step 5 commit stage 加这两文件
  - **M-A**(§10 Task 0 → Task 1 缺 barrier):v6 修:§10 加 BARRIER step,用 git log grep + grep SKILL_NAMES 双断言确认 Task 0 commit 落盘后才进 Task 1
  - **M-B 部分**(yaml line 212/217 字面):清掉 yaml 顶部注释 + description 内 `superpowers:writing-skills` 字面(改"superpowers 上游 writing-skills");rubric line 240 保留 anti-pattern 描述(LLM 应理解为禁止)
  - **M-C**(路径 C 连锁未估全):design §2.9.7 line 1620-1624 实施清单仍 reference phase 字段,路径 C 工日 0.1→0.3,加同步改 §2.9.4 line 1573-1577 + §2.9.7 line 1620-1624 两处
  - **Mi-1**(PowerShell 兼容):Task 1 Step 6 加注"必须在 Git-Bash 执行,PowerShell 用 `$LASTEXITCODE`"
  - **P50 工日**:维持 3.0(v6 修订全是文档细节修正,不增 task)

#### 8.4.10 v5 修订(codex 四轮 review)

v4 plan 后 codex 四轮 review 找到 1 NEW BLOCKER + 1 残留 BLOCKER + 4 MAJOR + 1 MINOR(全 7 条独立对照代码验证 CONFIRMED):

**B-1 NEW**(§10 混合模式执行顺序违反 Task 0 前置):v4 §10 line 1055-1056 把 Task 1→2 排在 Task 0 之前,但 SKILL_NAMES 未注册时 `pnpm eval:skill writing-skills` 被 CLI 拒绝(`forge-eval/index.ts:34`),与 §0 line 55 串行约束矛盾。**v5 修复**:§10 执行顺序改为 Task 0 必须最先(0 → 1 → 2 → 3/4 → 5 → 6)。

**B-2 残留**(Task 6 using-forge 段含 `superpowers:writing-skills` 字面):v4 改了 writing-skills SKILL.md 草案但漏改 Task 6 §8 内嵌 using-forge 修改草案 line 818,using-forge 是 registered skill(SKILL_NAMES 第 1 项)→ reverse-sync → tests:24 断言挂。**v5 修复**:Task 6 §8 using-forge 段改"superpowers 上游 writing-skills"(空格分隔)+ 加 v5 修订注释解释。

**M-1**(`|| true` 吞 exit 2 假阳性):`|| true` 同时吞 exit 1(eval 跑完 runPass false,预期)和 exit 2(infra fail,真错误),baseline 阶段无法区分。**v5 修复**:Task 1 Step 6 改为精确 exit code 检查脚本(0/1 OK,2 abort,其他 abort)。

**M-2**(scenarios rubric 奖励 `superpowers:writing-skills` 字面):line 240 judge_rubric 给 LLM 加分时含冒号命名空间字面,与 skill body 禁止规则冲突。**v5 修复**:rubric 改"superpowers 上游 writing-skills"+ 加注 "因 tests/core/templates/skills.test.ts:24 通用断言禁止" 让 LLM 明白规则。

**M-3**(路径 C 不是真正 reconcile):v4 路径 C 只改 CHANGELOG 不改 design,§2.9.4 与 runtime 仍不一致。**v5 修复**:路径 C 加约束"必须同时在 design §2.9.4 顶部插入 v1.0 NOT IMPLEMENTED 段落",~0.1 工日(不是 0);+ 加 owner 指定(路径 A/C 由 9z owner,路径 B 新 sub-plan)。

**M-4**(Task 2 未跑 build 副本 stale):v4 Task 2 Step 4 commit 只 `git add skills/writing-skills/SKILL.md`,没跑 build → src/core/templates/skills/writing-skills.md 仍是骨架 → Task 5 加载 stale 骨架 → GREEN delta 永远不到 1.5。**v5 修复**:Task 2 Step 4 改名"Reverse-sync + Commit",必跑 `pnpm build` + stage 两 .md 文件 + 跑 tests/core/templates/ 验证。

**Mi-1**(`head -3` 是人工观察非断言):**v5 修复**:Task 5 Step 3 改用 `grep -q "^name: forge:writing-skills$" ... || exit 1` 自动断言。

**P50 工日**:维持 3.0(v5 修订全是文档细节修正,不增 task)
