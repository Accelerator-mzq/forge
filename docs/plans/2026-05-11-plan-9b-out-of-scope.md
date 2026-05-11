# Plan 9b — Out-of-Scope 协议 + 跨 change 兜底实施

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:落地 forge v1.0 三段(Out of Scope / Non-Goals / Future Work)结构化 YAML 协议 + 跨 change 状态转移 + propose 启动时扫 archived followups,把 OpenSpec 的自由文本"不做项"升级为机器可读 + 跨 change 可关联的数据形态。本 phase 同时为 9d / 9f / receiving-code-review 三 skill 产出共用区分指引文档 `skills/_shared/scope-category-guidance.md`,并把该路径接入 `copy-templates.mjs` 部署链。

**Architecture**:三层加固。(1) **解析层**:`src/core/parse/markdown.ts` 加 anchor ID(`{#forge-oos}` 等)识别;新增 `src/core/parse/fenced-yaml.ts` 从 markdown 节内抽 `forge-scope-entries/v1` YAML block。(2) **数据层**:`src/core/schemas/scope-entries.ts` 锁死 §3.12.1bis 三 schema 顶级字段;`src/core/hash/content.ts` 改造按 anchor 剔除三段后再 SHA256,让"补 follow-up"不重 verify 整个 change。(3) **行为层**:新增 `src/cli/commands/scope.ts scan-archived-followups <change-id>` 聚合 active entries(扣已被 superseding_entries 走的);`commands/propose.md` slash 调它输出 follow-up 选单。`validate.ts` 加 scope YAML schema 校验(语法错产 CRITICAL finding,接通 9a finding_hash)。

**Tech Stack**:Node 20+ / TypeScript ESM / commander 12 / `yaml` v2(已有,用 parse + stringify)/ vitest / 现有 `src/core/canonical-json.ts`(9a 已建,用于 finding_hash 计算)+ 现有 `src/core/parse/markdown.ts`(扩展 anchor 识别)。**不引入新依赖**。

**Spec 引用**:
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §2.6 全节(§2.6.1-2.6.8)+ §2.4.3 archive_summary handoff_to_backlog 数据形态(本 plan 仅产数据源,实际 archive_summary 聚合在 9e2)
- master plan §3.2(plan-9b 概览)+ §3.12.1bis(scope-entries schema 顶级字段冻结)+ §3.12.2(`skills/_shared/scope-category-guidance.md` 路径冻结)+ §3.12.3(`forge scope scan-archived-followups` exit code 冻结)

**P50 工日**:4.3(v2 +0.5 + v3 +0.2 + v4 +0.1)/ **P90 工日**:5.4(v2 +0.5 + v3 +0.2 + v4 +0.2)

**前置**:9a 横切层基础(已完成,commit `0196d55..07e95b7`)。本 plan 在 9a 锁定的 `src/core/schemas/severity.ts`(severity / FindingHashPayload)+ `src/core/canonical-json.ts`(JCS)+ `src/core/validate/finding-hash.ts`(computeFindingHash)之上扩展。

**DoD**(完成定义):
- §3.12.1bis **四个** schema 顶级字段(`schema` / `entries` / `superseding_entries` / `anchor_id`)写入 `src/core/schemas/scope-entries.ts`,后续 sub-plan 仅 reference 不重定义(v3 codex review NIT 修订:补 `schema` 字段表述)
- proposal.md / design.md 经 9b 升级后:含 `{#forge-oos}` / `{#forge-non-goals}` / `{#forge-future-work}` anchor 时,这三段从 content_hash 剔除;改 YAML 块不致 marker 失效
- `forge scope scan-archived-followups <change-id>` CLI 输出 active entries JSON(扣 superseding_entries),exit 0 / 2 与 §3.12.3 一致
- `forge validate` 检测 scope YAML 语法错时产 CRITICAL finding(finding_hash 走 9a 路径绑定**稳定字段** `content_hash` / `git_head` / `dimension` / `check_type` / `severity` / `automated` / `evidence` / `recommendation` 8 字段,**不允许 ephemeral runId 进 payload**,沿 v3 B1 修订;CLI exit 1,沿 master §3.12.3 freeze)
- `forge update`(active 部署命令)部署 `.claude/skills/forge-_shared/scope-category-guidance.md` 到项目级目录(v2 codex review MAJOR 4 修订:adapter 部署链);smoke test 验证落地
- `commands/propose.md` slash 在产 proposal/design 时输出 anchor ID;在新 change 启动时调 `forge scope scan-archived-followups` 走 AskUserQuestion 流程
- `skills/_shared/scope-category-guidance.md` 完成;`scripts/copy-templates.mjs` 扩展同步 `skills/_shared/*.md` 到 `src/core/templates/skills/_shared/` + `dist/core/templates/skills/_shared/`;`skills/receiving-code-review/SKILL.md` reference 该文档(9d / 9f 自行 reference)
- 单元 + 集成测试覆盖:scope-entries YAML parse / anchor 识别 / content_hash 排除(三段) / scan-archived-followups CLI(active / superseding / 空 archive 三场景)/ validate scope YAML 语法错产 CRITICAL finding
- 全本地 verify 通过(`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test`)

---

## 0. 总览

本 sub-plan 拆 **9 个 task**(v2 codex review 一轮修订:Task 7 拆 7a + 7b;累计 P50 4.0 工日):

| Task | 名称 | 工日 P50 | 关键交付 |
|------|------|---------|---------|
| 1 | scope-entries schema 锁死 | 0.3 | `src/core/schemas/scope-entries.ts` + tests(§3.12.1bis 接口冻结,v2 含 `schema` 字段) |
| 2 | anchor ID 识别 + fenced YAML 抽取 | 0.5 | `src/core/parse/markdown.ts` 扩展(注释修正)+ 新增 `src/core/parse/fenced-yaml.ts` + tests |
| 3 | content_hash 改造按 anchor 剔除三段 | 0.5 | `src/core/hash/content.ts` 改造(**v2 修订:按 heading level 算区间覆盖 H3 子标题**)+ tests |
| 4 | validate scope YAML + ValidationError severity + CLI exit 1 + 9a FindingHashPayload 修订 + 现有 validator 标 severity | **0.8**(v2 修订 0.4→0.6;v3 修订 0.6→0.8:B1 跨 9a 接口修订 + B2 proposal/specs/tasks validator severity 标注) | 9a `FindingHashPayload` 9→8 字段(v3 B1)+ `src/core/validate/scope-entries.ts` + `validateChange` 传 ctx + `ValidationError.severity` 扩展 + 现有 validator 标 CRITICAL + `validate.ts` CLI exit 0/1/2 三档 |
| 5 | `forge scope scan-archived-followups` CLI | 0.6 | `src/cli/commands/scope.ts` + `src/core/scope/aggregator.ts` + CLI test(**v2 修订:ENOENT 真实 exit 2 测试,删 placeholder**) |
| 6 | `commands/propose.md` slash 升级 | 0.3 | anchor ID 模板指示 + Pending follow-ups 扫描段 + AskUserQuestion 流程 |
| 7a | `skills/_shared/scope-category-guidance.md` + copy-templates 扩展(fail-fast)+ receiving-code-review reference | 0.4 | 共用区分指引文档 + 部署链 source(_shared 缺失 fail-fast)+ receiving-code-review skill cross-ref |
| **7b**(v2 codex review MAJOR 4 修订:新增) | harness-adapters 加 sharedDocs 部署 + `forge update` 接入 + smoke | **0.4**(v2 新增 task) | `types.ts` 加 `SharedDocSpec` + claude/codex/opencode adapter 铺 `.claude/skills/forge-_shared/`(及对应 codex/opencode 路径)+ `forge update` 命令调 loadAllSharedDocs() + smoke test |
| 8 | 集成 fixture + e2e 测试 + verify | 0.4 | end-to-end 测试覆盖 archived → propose → scope scan → user 决策 → marker hash 稳定(**v2 修订:fixture 用常量生成 + 断言严格 `===0`**) |

单人路径:1 → 2 → 3 → 4 → 5 → 6 → 7a → 7b → 8(串行;Task 2 是 Task 3/4/5 的依赖;Task 7a 是 7b 的依赖)。Task 5 / 6 / 7a 三者无相互依赖可并行(若多 agent)。

---

## 1. File Structure

### 新增文件

```
src/core/schemas/scope-entries.ts             ← Task 1:`forge-scope-entries/v1` schema(entries + superseding_entries + anchor_id)
src/core/parse/fenced-yaml.ts                 ← Task 2:从 markdown 段抽 fenced `yaml` block + 按 schema 字段 dispatch
src/core/scope/aggregator.ts                  ← Task 5:扫 archived YAML 块 + superseding_entries 解算 + 输出 active entries
src/core/scope/index.ts                       ← Task 5:re-export aggregator API
src/core/validate/scope-entries.ts            ← Task 4:scope YAML schema 校验 + 产 CRITICAL finding(走 9a finding_hash)
src/cli/commands/scope.ts                     ← Task 5:`forge scope scan-archived-followups <change-id>` 子命令
skills/_shared/scope-category-guidance.md     ← Task 7:三 skill 共用区分指引(被 receiving-code-review / verifying-three-dimensions / exploring reference)
tests/core/parse/fenced-yaml.test.ts          ← Task 2
tests/core/schemas/scope-entries.test.ts      ← Task 1
tests/core/scope/aggregator.test.ts           ← Task 5
tests/core/validate/scope-entries.test.ts     ← Task 4
tests/cli/scope-cli.test.ts                   ← Task 5
tests/integration/scope-end-to-end.test.ts    ← Task 8
tests/fixtures/scope/                         ← Task 8:含 archived change YAML 块的 fixture
```

### 修改文件

```
src/core/parse/markdown.ts                    ← Task 2:Section 加 `anchor?: string` 字段;heading 正则识别 `{#xxx}` 后缀
src/core/hash/content.ts                      ← Task 3:proposal.md / design.md 在算 hash 前按 anchor 剔除 forge-oos / forge-non-goals / forge-future-work 段
src/cli/index.ts                              ← Task 5:注册 `buildScopeCommand()`
src/core/validate/index.ts                    ← Task 4:re-export validateScopeEntries
src/core/validate/change.ts                   ← Task 4:validateChange 调 validateScopeEntries(proposal.md + design.md)
commands/propose.md                           ← Task 6:加 anchor ID 模板指示 + §"Pending follow-ups 扫描"段 + AskUserQuestion 流程
skills/receiving-code-review/SKILL.md         ← Task 7:加 §"区分指引(scope category guidance)"段,reference `skills/_shared/scope-category-guidance.md`
scripts/copy-templates.mjs                    ← Task 7:扩展同步 `skills/_shared/*.md` → `src/core/templates/skills/_shared/` + `dist/core/templates/skills/_shared/`
tests/cli/validate.test.ts                    ← Task 4:加 scope YAML 语法错 → CRITICAL finding 用例(若现有文件无对应分支)
```

### 不修改文件(明确边界)

```
src/cli/commands/archive.ts                   ← 9e2 修改 archive_summary handoff_to_backlog 真实聚合;本 plan 仅产数据源(scope.ts aggregator),archive.ts 在 9e2 调它
src/core/archive/                             ← 9e 修改 transaction 加 archive_summary 写入;本 plan 不动
src/core/markers/                             ← 9c/9d/9e/9g/9j 各自加 marker schema 字段;本 plan 仅在 hash/content.ts 改 hash 算法,不动 marker schema
forge/config.yaml schema                      ← 9g/9h 加各自配置块;本 plan 不动 config
skills/verifying-three-dimensions/SKILL.md    ← 9d 产新 skill 时自行 reference _shared 文档,本 plan 不创建该 skill
skills/exploring/SKILL.md                     ← 9f 产新 skill 时自行 reference _shared 文档,本 plan 不创建该 skill
```

---

## 2. Task 1 — scope-entries schema 锁死

**Files:**
- Create: `src/core/schemas/scope-entries.ts`
- Create: `tests/core/schemas/scope-entries.test.ts`

**Goal**:按 master §3.12.1bis 锁死 `forge-scope-entries/v1` schema 三个顶级字段 + ScopeEntry 8 字段 + SupersedingRef 4 字段 + status / category enum。后续 sub-plan(9e2 / 9f / 9d / receiving-code-review)reference 此处,不重定义。

- [ ] **Step 1: 写 failing test**

```typescript
// tests/core/schemas/scope-entries.test.ts
import { describe, it, expect } from 'vitest';
import {
  SCOPE_CATEGORY_VALUES,
  SCOPE_STATUS_VALUES,
  SCOPE_ANCHOR_IDS,
  isScopeCategory,
  isScopeStatus,
  isScopeAnchorId,
  type ScopeEntry,
  type SupersedingRef,
  type ScopeEntriesBlock,
} from '../../../src/core/schemas/scope-entries.js';

describe('scope-entries schema', () => {
  it('三个 category enum 值', () => {
    expect(SCOPE_CATEGORY_VALUES).toEqual(['out-of-scope', 'non-goal', 'future-work']);
  });

  it('五个 status enum 值', () => {
    expect(SCOPE_STATUS_VALUES).toEqual(['active', 'inherited', 'superseded', 'completed', 'obsolete']);
  });

  it('三个 anchor ID', () => {
    expect(SCOPE_ANCHOR_IDS).toEqual(['forge-oos', 'forge-non-goals', 'forge-future-work']);
  });

  it('isScopeCategory 严格判别', () => {
    expect(isScopeCategory('out-of-scope')).toBe(true);
    expect(isScopeCategory('OUT-OF-SCOPE')).toBe(false);
    expect(isScopeCategory('')).toBe(false);
    expect(isScopeCategory(null)).toBe(false);
  });

  it('isScopeStatus 严格判别', () => {
    expect(isScopeStatus('active')).toBe(true);
    expect(isScopeStatus('pending')).toBe(false);
  });

  it('isScopeAnchorId 严格判别', () => {
    expect(isScopeAnchorId('forge-oos')).toBe(true);
    expect(isScopeAnchorId('oos')).toBe(false);
  });

  it('ScopeEntry 类型字段完整(structural check)', () => {
    const entry: ScopeEntry = {
      id: 'oauth-refresh-grace-period',
      category: 'out-of-scope',
      description: 'desc',
      reason: 'reason text',
      priority: 'medium',
      status: 'active',
      triggered_by: null,
      related_change: null,
    };
    expect(entry.id).toBe('oauth-refresh-grace-period');
  });

  it('SupersedingRef 类型字段完整', () => {
    const ref: SupersedingRef = {
      source_change: '2026-05-12-add-oauth-refresh',
      entry_id: 'oauth-refresh-grace-period',
      new_status: 'superseded',
      rationale: 'implemented in this change',
    };
    expect(ref.new_status).toBe('superseded');
  });

  it('ScopeEntriesBlock 顶级三字段', () => {
    const block: ScopeEntriesBlock = {
      schema: 'forge-scope-entries/v1',
      anchor_id: 'forge-oos',
      entries: [],
      superseding_entries: [],
    };
    expect(block.schema).toBe('forge-scope-entries/v1');
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `cd D:/ClaudeProject/opsp/forge-repo && pnpm vitest run tests/core/schemas/scope-entries.test.ts`
Expected: FAIL,"Cannot find module 'src/core/schemas/scope-entries.js'"

- [ ] **Step 3: 写实现**

```typescript
// src/core/schemas/scope-entries.ts
// §3.12.1bis Interface Freeze 共享 schema(plan-9b)
// 后续 sub-plan(9e2 / 9f / 9d / receiving-code-review)reference 此处,不重定义

/** 三段 category 枚举(沿 design §2.6.2) */
export type ScopeCategory = 'out-of-scope' | 'non-goal' | 'future-work';
export const SCOPE_CATEGORY_VALUES: readonly ScopeCategory[] = [
  'out-of-scope',
  'non-goal',
  'future-work',
] as const;

export function isScopeCategory(v: unknown): v is ScopeCategory {
  return typeof v === 'string' && (SCOPE_CATEGORY_VALUES as readonly string[]).includes(v);
}

/** 状态转移五枚举(沿 design §2.6.4) */
export type ScopeStatus = 'active' | 'inherited' | 'superseded' | 'completed' | 'obsolete';
export const SCOPE_STATUS_VALUES: readonly ScopeStatus[] = [
  'active',
  'inherited',
  'superseded',
  'completed',
  'obsolete',
] as const;

export function isScopeStatus(v: unknown): v is ScopeStatus {
  return typeof v === 'string' && (SCOPE_STATUS_VALUES as readonly string[]).includes(v);
}

/** 三段 anchor ID(沿 design §2.6.3,§3.12.2 路径冻结) */
export type ScopeAnchorId = 'forge-oos' | 'forge-non-goals' | 'forge-future-work';
export const SCOPE_ANCHOR_IDS: readonly ScopeAnchorId[] = [
  'forge-oos',
  'forge-non-goals',
  'forge-future-work',
] as const;

export function isScopeAnchorId(v: unknown): v is ScopeAnchorId {
  return typeof v === 'string' && (SCOPE_ANCHOR_IDS as readonly string[]).includes(v);
}

/** anchor ID → category 默认映射(propose 阶段补全 entry.category 用) */
export const ANCHOR_TO_CATEGORY: Record<ScopeAnchorId, ScopeCategory> = {
  'forge-oos': 'out-of-scope',
  'forge-non-goals': 'non-goal',
  'forge-future-work': 'future-work',
};

/** triggered_by 来源(沿 design §2.6.3 字段语义) */
export interface TriggeredByRef {
  source: 'pause_decisions' | 'explore_capture' | 'review_outcomes';
  id: string | number;
}

/** 优先级(沿 design §2.6.3,可空) */
export type ScopePriority = 'critical' | 'high' | 'medium' | 'low' | null;

/** Scope entry 8 字段(沿 design §2.6.3 字段语义详) */
export interface ScopeEntry {
  /** kebab-case 稳定 ID,跨 change 唯一 */
  id: string;
  /** 三段分类 */
  category: ScopeCategory;
  /** 1-2 句概括 */
  description: string;
  /** 必填论证 — 为什么不做 / 为什么反目标 / 为什么是未来工作 */
  reason: string;
  /** 优先级(null = 暂未排序) */
  priority: ScopePriority;
  /** 状态(沿 §2.6.4 状态转移) */
  status: ScopeStatus;
  /** 来源引用(从 §2.1 pause_decisions / §2.5 explore capture / review_outcomes 转入)*/
  triggered_by: TriggeredByRef | null;
  /** 关联其他 change id */
  related_change: string | null;
}

/** SupersedingRef 4 字段(沿 design §2.6.4 forward-reference) */
export interface SupersedingRef {
  /** 历史 entry 所在 archived change id */
  source_change: string;
  /** 历史 entry 的 id */
  entry_id: string;
  /** 新状态(本 change 给出的状态变更) */
  new_status: ScopeStatus;
  /** 论证(为什么把状态改成 new_status) */
  rationale: string;
}

/** scope-entries 顶级 schema(§3.12.1bis 锁死) */
export interface ScopeEntriesBlock {
  schema: 'forge-scope-entries/v1';
  /** 每段一个 anchor */
  anchor_id: ScopeAnchorId;
  /** 本段 entries */
  entries: ScopeEntry[];
  /** 可选 forward-reference */
  superseding_entries?: SupersedingRef[];
}
```

- [ ] **Step 4: 跑测试确认 pass**

Run: `pnpm vitest run tests/core/schemas/scope-entries.test.ts`
Expected: PASS,8/8

- [ ] **Step 5: 跑 typecheck + lint + format:check**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: 全 PASS

- [ ] **Step 6: commit**

```bash
git add src/core/schemas/scope-entries.ts tests/core/schemas/scope-entries.test.ts
git commit -m "feat(9b): scope-entries schema lock — §3.12.1bis Interface Freeze

forge-scope-entries/v1 顶级 + ScopeEntry/SupersedingRef + 三 enum(category/status/anchor_id)
ANCHOR_TO_CATEGORY 默认映射(propose 阶段补全用)
后续 9e2/9f/9d/receiving-code-review reference 此处不重定义"
```

---

## 3. Task 2 — anchor ID 识别 + fenced YAML 抽取

**Files:**
- Modify: `src/core/parse/markdown.ts`(Section 加 `anchor?: string` + heading 正则识别 `{#xxx}` 后缀)
- Create: `src/core/parse/fenced-yaml.ts`(从 markdown 段抽 ```yaml ... ``` block)
- Create: `tests/core/parse/fenced-yaml.test.ts`
- Modify: `tests/core/parse/markdown.test.ts`(若已有 — 加 anchor 用例;**若不存在则新建** `tests/core/parse/markdown.test.ts`)

**Goal**:扩展现有 markdown 解析器识别 `## Future Work {#forge-future-work}` 形式的 anchor ID 后缀,把 anchor 存到 `Section.anchor` 字段;新增 `parseFencedYamlBlocks(text)` 从 markdown 文本抽所有 ```yaml ... ``` block(后续 Task 3 / Task 4 / Task 5 复用)。

- [ ] **Step 1: 检查 tests/core/parse/markdown.test.ts 是否存在**

Run: `ls tests/core/parse/ 2>&1`
- 若已有 markdown.test.ts → 在末尾追加 anchor 测试
- 若没有 → 新建该文件

(执行实施时按实际情况走)

- [ ] **Step 2: 写 failing test — anchor 识别**

```typescript
// tests/core/parse/markdown.test.ts(新建或追加)
import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../../src/core/parse/markdown.js';

describe('parseMarkdown — anchor ID 识别(plan-9b Task 2)', () => {
  it('H2 + anchor → Section.anchor = "forge-oos",heading 去掉 anchor 后缀', () => {
    const text = '## Out of Scope {#forge-oos}\n\n内容\n';
    const md = parseMarkdown(text);
    const sec = md.sections[0];
    expect(sec?.heading).toBe('Out of Scope');
    expect(sec?.anchor).toBe('forge-oos');
  });

  it('本地化标题 + anchor → 仍按 anchor 识别', () => {
    const text = '## 不做项 {#forge-oos}\n\n内容\n';
    const md = parseMarkdown(text);
    expect(md.sections[0]?.anchor).toBe('forge-oos');
    expect(md.sections[0]?.heading).toBe('不做项');
  });

  it('无 anchor → Section.anchor 为 undefined', () => {
    const text = '## Future Work\n\n内容\n';
    const md = parseMarkdown(text);
    expect(md.sections[0]?.anchor).toBeUndefined();
  });

  it('多段不同 anchor', () => {
    const text =
      '## Out of Scope {#forge-oos}\n\nA\n\n## Non-Goals {#forge-non-goals}\n\nB\n\n## Future Work {#forge-future-work}\n\nC\n';
    const md = parseMarkdown(text);
    expect(md.sections.map((s) => s.anchor)).toEqual([
      'forge-oos',
      'forge-non-goals',
      'forge-future-work',
    ]);
  });
});
```

- [ ] **Step 3: 跑测试确认 fail**

Run: `pnpm vitest run tests/core/parse/markdown.test.ts`
Expected: FAIL,4 用例都 fail(Section 没有 anchor 字段 / heading 含 `{#forge-oos}` 字面)

- [ ] **Step 4: 修改 parseMarkdown 实现**

修改 `src/core/parse/markdown.ts`:

```typescript
// Section interface 加 anchor 字段
export interface Section {
  level: number;
  heading: string;
  body: string;
  startLine: number;
  endLine: number;
  /** anchor ID(`{#xxx}` 形式的 heading 后缀;无则 undefined,沿 plan-9b §2.6.3) */
  anchor?: string;
}
```

把 heading 正则从 `^(#{1,6})\s+(.+)$` 改为支持 anchor 后缀。匹配后从 heading 文本剥离 anchor:

```typescript
// extractSections 内 — 替换 headingMatch 与 current 构造逻辑
const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
if (headingMatch) {
  if (current) {
    current.body = buffer.join('\n');
    current.endLine = i;
    sections.push(current);
    buffer.length = 0;
  }
  const rawHeading = headingMatch[2] ?? '';
  // 匹配 anchor `{#xxx}` 后缀(charset 仅 ASCII alphanum + `_` + `-`;
  // **v2 codex MINOR 修订**:不是 CommonMark heading-id 兼容;forge 只用三个固定 ASCII anchor
  // (forge-oos / forge-non-goals / forge-future-work),严格 charset 是有意为之 — 阻止"用 unicode 绕过 fence"攻击)
  const anchorMatch = rawHeading.match(/^(.*?)\s*\{#([A-Za-z0-9_-]+)\}\s*$/);
  current = {
    level: headingMatch[1]?.length ?? 1,
    heading: anchorMatch ? (anchorMatch[1]?.trim() ?? '') : rawHeading.trim(),
    anchor: anchorMatch ? anchorMatch[2] : undefined,
    body: '',
    startLine: i + 1,
    endLine: lines.length,
  };
} else if (current) {
  buffer.push(line);
}
```

- [ ] **Step 5: 跑测试确认 pass**

Run: `pnpm vitest run tests/core/parse/markdown.test.ts`
Expected: 4/4 PASS

- [ ] **Step 6: 写 fenced YAML 抽取 test**

```typescript
// tests/core/parse/fenced-yaml.test.ts
import { describe, it, expect } from 'vitest';
import { parseFencedYamlBlocks } from '../../../src/core/parse/fenced-yaml.js';

describe('parseFencedYamlBlocks(plan-9b Task 2)', () => {
  it('抽单个 yaml 块', () => {
    const text = '前言\n\n```yaml\nschema: forge-scope-entries/v1\nentries: []\n```\n\n后文\n';
    const blocks = parseFencedYamlBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      schema: 'forge-scope-entries/v1',
      entries: [],
    });
  });

  it('抽多个 yaml 块,按出现顺序', () => {
    const text =
      '```yaml\nschema: a\n```\n\n中间\n\n```yaml\nschema: b\n```\n';
    const blocks = parseFencedYamlBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ schema: 'a' });
    expect(blocks[1]).toMatchObject({ schema: 'b' });
  });

  it('忽略非 yaml 的 fenced block(``` 或 ```ts)', () => {
    const text = '```\nplain\n```\n\n```ts\nconst x = 1;\n```\n';
    expect(parseFencedYamlBlocks(text)).toHaveLength(0);
  });

  it('YAML 语法错 → 抛 FencedYamlParseError 含原文位置', async () => {
    const text = '```yaml\n: invalid yaml:\n```\n';
    const { FencedYamlParseError } = await import('../../../src/core/parse/fenced-yaml.js');
    expect(() => parseFencedYamlBlocks(text)).toThrow(FencedYamlParseError);
  });

  it('空文本 → []', () => {
    expect(parseFencedYamlBlocks('')).toEqual([]);
  });
});
```

- [ ] **Step 7: 跑 fenced YAML test 确认 fail**

Run: `pnpm vitest run tests/core/parse/fenced-yaml.test.ts`
Expected: FAIL,"Cannot find module"

- [ ] **Step 8: 写 fenced YAML 实现**

```typescript
// src/core/parse/fenced-yaml.ts
// 从 markdown 文本抽所有 ```yaml ... ``` block 并 YAML.parse;
// plan-9b Task 2 — 被 Task 3(content_hash 排除)/ Task 4(validate)/ Task 5(scope aggregator)复用

import { parse as parseYaml, YAMLParseError } from 'yaml';

/** fenced YAML 块解析失败(语法错或位置不可定位) */
export class FencedYamlParseError extends Error {
  constructor(
    message: string,
    public readonly blockIndex: number, // 0-based,markdown 内 yaml 块序号
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FencedYamlParseError';
  }
}

/**
 * 从 markdown 文本抽所有 ```yaml ... ``` block 并 YAML.parse。
 * - 仅匹配 ```yaml(显式 lang,大小写不敏感),忽略 ``` 或 ```ts 等
 * - 按出现顺序返回
 * - 任一块 YAML 解析失败 → 抛 FencedYamlParseError 含 blockIndex
 *
 * 注:被 Task 3 content_hash 调用时,即使整体 YAML 解析失败,**段的剔除**逻辑也得继续工作(因为 hash 算的是字面 markdown 不依赖 YAML 内容)。
 * 故 Task 3 调用方应自己 wrap try/catch,YAML 错误下回退到"段存在 → 仍剔除"。
 */
export function parseFencedYamlBlocks(text: string): unknown[] {
  const blocks: unknown[] = [];
  // 匹配 ```yaml ... ``` (非贪婪,跨行);lang 仅接 yaml,大小写不敏感
  const re = /```yaml\s*\n([\s\S]*?)\n?```/gi;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1] ?? '';
    try {
      blocks.push(parseYaml(raw));
    } catch (err) {
      const detail = err instanceof YAMLParseError ? err.message : String(err);
      throw new FencedYamlParseError(
        `fenced yaml block #${idx} parse error: ${detail}`,
        idx,
        err,
      );
    }
    idx++;
  }
  return blocks;
}
```

- [ ] **Step 9: 跑测试确认 pass**

Run: `pnpm vitest run tests/core/parse/fenced-yaml.test.ts`
Expected: 5/5 PASS

- [ ] **Step 10: 跑全 vitest 确认 markdown 改造没破坏其它测试**

Run: `pnpm vitest run tests/core/parse/`
Expected: 全 PASS(parse 目录现有 design/proposal/specs/tasks 等 test 都依赖 parseMarkdown,需 anchor 字段不影响现有 heading 解析)

- [ ] **Step 11: typecheck + commit**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`

```bash
git add src/core/parse/markdown.ts src/core/parse/fenced-yaml.ts \
        tests/core/parse/markdown.test.ts tests/core/parse/fenced-yaml.test.ts
git commit -m "feat(9b): markdown anchor ID + fenced YAML 抽取

parseMarkdown Section 加 anchor 字段(识别 \`{#xxx}\` 后缀,heading 去后缀)
parseFencedYamlBlocks 抽 \`\`\`yaml block(被 Task 3/4/5 复用)
FencedYamlParseError 含 blockIndex 便于定位"
```

---

## 4. Task 3 — content_hash 改造按 anchor 剔除三段

**Files:**
- Modify: `src/core/hash/content.ts`(proposal.md / design.md 在算 hash 前剔除三段)
- Modify: `tests/core/hash/content.test.ts`(若存在 — 加 anchor 剔除用例;若无新建)

**Goal**:实施 design §2.6.3 修订:proposal.md / design.md 的 `## Out of Scope {#forge-oos}` / `## Non-Goals {#forge-non-goals}` / `## Future Work {#forge-future-work}` 三段(及其后所有内容,直到下一同级或更高 heading)从 content_hash 剔除。Token 是 anchor ID(`{#forge-oos}` 等),**不靠标题字面**;改 anchor → 段重新进 hash(预期行为)。

- [ ] **Step 1: 检查现有 content.test.ts**

Run: `ls tests/core/hash/`
- 若已有 content.test.ts → 追加测试
- 若无 → 新建

- [ ] **Step 2: 写 failing test**

```typescript
// tests/core/hash/content.test.ts(新建或追加)
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeContentHash } from '../../../src/core/hash/content.js';

describe('computeContentHash — anchor 剔除(plan-9b Task 3)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'forge-9b-hash-'));
    await writeFile(join(dir, 'tasks.md'), '# Tasks\n');
    await mkdir(join(dir, 'specs'));
    await writeFile(join(dir, 'specs', 'a.md'), '# A\n');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('proposal.md 带 forge-oos 段:只改该段 → hash 不变', async () => {
    const v1 =
      '# Title\n\n## Why\n\nW1\n\n## What\n\nC1\n\n## Out of Scope {#forge-oos}\n\nE1\n';
    const v2 =
      '# Title\n\n## Why\n\nW1\n\n## What\n\nC1\n\n## Out of Scope {#forge-oos}\n\nE2 changed\n';
    await writeFile(join(dir, 'proposal.md'), v1);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'proposal.md'), v2);
    const h2 = await computeContentHash(dir);
    expect(h1).toBe(h2);
  });

  it('proposal.md 改 What 段(无 anchor)→ hash 变', async () => {
    const v1 =
      '# Title\n\n## Why\n\nW1\n\n## What\n\nC1\n\n## Out of Scope {#forge-oos}\n\nE1\n';
    const v2 =
      '# Title\n\n## Why\n\nW1\n\n## What\n\nC2 changed\n\n## Out of Scope {#forge-oos}\n\nE1\n';
    await writeFile(join(dir, 'proposal.md'), v1);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'proposal.md'), v2);
    const h2 = await computeContentHash(dir);
    expect(h1).not.toBe(h2);
  });

  it('design.md 带 forge-future-work 段:只改该段 → hash 不变', async () => {
    const d1 =
      '# Design\n\n## Approach\n\nA1\n\n## Future Work {#forge-future-work}\n\nF1\n';
    const d2 =
      '# Design\n\n## Approach\n\nA1\n\n## Future Work {#forge-future-work}\n\nF2 changed\n';
    await writeFile(join(dir, 'proposal.md'), '# P\n## Why\n\nw\n\n## What\n\nc\n');
    await writeFile(join(dir, 'design.md'), d1);
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'design.md'), d2);
    const h2 = await computeContentHash(dir);
    expect(h1).toBe(h2);
  });

  it('改 anchor ID(forge-oos → oos)→ 段重新进 hash → hash 变', async () => {
    const v1 = '# P\n\n## Why\n\nw\n\n## What\n\nc\n\n## Out {#forge-oos}\n\nE\n';
    const v2 = '# P\n\n## Why\n\nw\n\n## What\n\nc\n\n## Out {#oos}\n\nE\n';
    await writeFile(join(dir, 'proposal.md'), v1);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'proposal.md'), v2);
    const h2 = await computeContentHash(dir);
    expect(h1).not.toBe(h2);
  });

  it('本地化标题 + 正确 anchor → 仍剔除', async () => {
    const v1 = '# P\n## Why\n\nw\n## What\n\nc\n\n## 不做项 {#forge-oos}\n\nE1\n';
    const v2 = '# P\n## Why\n\nw\n## What\n\nc\n\n## 不做项 {#forge-oos}\n\nE2 changed\n';
    await writeFile(join(dir, 'proposal.md'), v1);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'proposal.md'), v2);
    expect(await computeContentHash(dir)).toBe(h1);
  });

  it('forge-oos 段含 H3 子标题 → 子标题及内容也被剔除(v2 codex MAJOR 2 修订)', async () => {
    const v1 = [
      '# P',
      '## Why\n\nw',
      '## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      'top body',
      '',
      '### Sub Detail',
      '',
      'sub body v1',
      '',
      '## Next Section',
      '',
      'next body',
      '',
    ].join('\n');
    const v2 = v1.replace('sub body v1', 'sub body v2 changed');
    await writeFile(join(dir, 'proposal.md'), v1);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'proposal.md'), v2);
    expect(await computeContentHash(dir)).toBe(h1);
  });

  it('forge-oos 段后接 H1 → H1 不被剔除(剔除止于下一同级或更高级)', async () => {
    const text = [
      '# P',
      '## Why\n\nw',
      '## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      'oos body',
      '',
      '# New H1',
      '',
      'h1 body',
    ].join('\n');
    await writeFile(join(dir, 'proposal.md'), text);
    await writeFile(join(dir, 'design.md'), '# Design\n');
    const h1 = await computeContentHash(dir);
    // 改 H1 段 → hash 应变(H1 不被剔除)
    await writeFile(join(dir, 'proposal.md'), text.replace('h1 body', 'h1 changed'));
    const h2 = await computeContentHash(dir);
    expect(h1).not.toBe(h2);
  });

  it('tasks.md / specs/*.md 内带 anchor → 不剔除(仅 proposal/design 走 anchor 剔除)', async () => {
    await writeFile(join(dir, 'proposal.md'), '# P\n## Why\n\nw\n## What\n\nc\n');
    await writeFile(join(dir, 'design.md'), '# Design\n');
    await writeFile(join(dir, 'tasks.md'), '# T\n\n## Out {#forge-oos}\n\nT1\n');
    const h1 = await computeContentHash(dir);
    await writeFile(join(dir, 'tasks.md'), '# T\n\n## Out {#forge-oos}\n\nT2 changed\n');
    const h2 = await computeContentHash(dir);
    expect(h1).not.toBe(h2);
  });
});
```

(顶部如缺 `import { beforeEach, afterEach } from 'vitest'` 自行补)

- [ ] **Step 3: 跑测试确认 fail**

Run: `pnpm vitest run tests/core/hash/content.test.ts`
Expected: 6 用例,1+2 失败(改 forge-oos / forge-future-work 段 hash 仍变),其它 passively pass。

- [ ] **Step 4: 改造 computeContentHash 实现**

修改 `src/core/hash/content.ts`,在 `normalizeForHash` 之前对 `proposal.md` / `design.md` 走"剥 anchor 段"再 normalize:

```typescript
// src/core/hash/content.ts — 顶部加 import
import { parseMarkdown } from '../parse/markdown.js';
import { SCOPE_ANCHOR_IDS, type ScopeAnchorId } from '../schemas/scope-entries.js';

// 在 computeContentHash 内,读完 content 后判断 rel 路径:
for (const rel of files) {
  let content: string;
  try {
    content = await readFile(join(changeDir, rel), 'utf8');
  } catch {
    content = '<MISSING>';
  }
  // plan-9b §2.6.3:proposal.md / design.md 在算 hash 前剔除 anchor 三段
  const stripped = rel === 'proposal.md' || rel === 'design.md'
    ? stripScopeAnchoredSections(content)
    : content;
  const normalized = normalizeForHash(stripped);
  hash.update(rel);
  hash.update('\0');
  hash.update(normalized);
  hash.update('\0');
}

// 文件底部加 helper
/**
 * 从 markdown 文本剔除带 SCOPE_ANCHOR_IDS(forge-oos / forge-non-goals / forge-future-work)
 * 的段(含 heading 行 + 该段全部 body + 任意 H3+ 子标题及其内容,
 * **直到下一个同级或更高级 heading 或文件末尾**)。
 *
 * **v2 codex MAJOR 2 修订**:不能直接用 parseMarkdown 的 section.endLine,
 * 因为 parseMarkdown 任意 level heading 都关 section,H3 子标题会被切成独立 section
 * 让剔除不完整。本函数自己扫 sections,根据 level 自行算"下一同级或更高级"区间。
 *
 * 实施:proposal.md / design.md 走此过滤后再计 content_hash。
 */
function stripScopeAnchoredSections(text: string): string {
  const md = parseMarkdown(text);
  const sections = md.sections;

  // 收集要剔除的行号区间 [start, end](1-indexed,inclusive,在 body 行坐标系)
  const ranges: { start: number; end: number }[] = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (!sec) continue;
    if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) continue;

    // 找下一个 level <= sec.level 的 section,作为本剔除区间的结束(exclusive)
    let endLineInclusive = md.body.split('\n').length; // 默认到文件末尾(body 行数)
    for (let j = i + 1; j < sections.length; j++) {
      const nextSec = sections[j];
      if (!nextSec) continue;
      if (nextSec.level <= sec.level) {
        // 区间到下一同级或更高级 heading 的前一行(exclusive of nextSec.startLine)
        endLineInclusive = nextSec.startLine - 1;
        break;
      }
    }
    ranges.push({ start: sec.startLine, end: endLineInclusive });
  }
  if (ranges.length === 0) return text;

  // 剥 frontmatter — parseMarkdown 内部已剥掉,sections 行号是 body 内 1-indexed
  const fmMatch = text.match(/^---\n[\s\S]*?\n---\n/);
  const frontmatter = fmMatch ? fmMatch[0] : '';
  const body = fmMatch ? text.slice(fmMatch[0].length) : text;
  const lines = body.split('\n');

  // 构建"保留行"
  const keepLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1; // 1-indexed body 内
    const inRange = ranges.some((r) => lineNum >= r.start && lineNum <= r.end);
    if (!inRange) keepLines.push(lines[i] ?? '');
  }
  return frontmatter + keepLines.join('\n');
}
```

- [ ] **Step 5: 跑测试确认 pass**

Run: `pnpm vitest run tests/core/hash/content.test.ts`
Expected: 6/6 PASS

- [ ] **Step 6: 跑全 hash 测试 + 现有 archive 测试,确认无回归**

Run: `pnpm vitest run tests/core/hash/ tests/cli/archive.test.ts`
Expected: 全 PASS。**若 archive.test.ts 失败(因为某 fixture 含 anchor 但断言旧 hash)**,更新 fixture 用例的预期 hash;不应改实现回退。

- [ ] **Step 7: typecheck + commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
git add src/core/hash/content.ts tests/core/hash/content.test.ts
git commit -m "feat(9b): content_hash 按 anchor 剔除 scope 三段(design §2.6.3)

proposal.md / design.md 内 {#forge-oos} / {#forge-non-goals} / {#forge-future-work}
段从 content_hash payload 剔除;改 anchor ID → 段重新进 hash(预期行为)
仅 proposal/design 走剔除;tasks.md / specs/*.md 无 anchor 语义"
```

---

## 5. Task 4 — validate scope YAML schema + ValidationError severity + CLI exit 1(v2 BLOCKER + v3 BLOCKER 修订)

**Files:**
- **Modify(9a 接口冻结修订)**:`src/core/schemas/severity.ts`(`FindingHashPayload` 移除 `validate_run_id` 字段,从 9 字段降为 8 字段;**v3 B1 修订**)
- **Modify(9a 接口冻结修订)**:`src/core/validate/finding-hash.ts`(`extractHashPayload` 同步去 `validate_run_id`)
- **Modify**:`tests/core/validate/finding-hash.test.ts`(若已断言 validate_run_id 进 hash — 更新或删该 assertion)
- Create: `src/core/validate/scope-entries.ts`
- Modify: `src/core/validate/types.ts`(ValidationError 加 `severity` + `finding_hash`,artifact 加 `'scope'`;**v2 B2 修订**)
- Modify: `src/core/validate/index.ts`(re-export)
- Modify: `src/core/validate/proposal.ts` / `specs.ts` / `tasks.ts`(现有 business-fail error 显式标 `severity: 'CRITICAL'`;**v3 B2 修订**:沿 master §3.12.3 freeze,business-fail 走 exit 1 不是 exit 2)
- Modify: `src/core/validate/change.ts`(validateChange 计算 contentHash + gitHead + 传给 validateScopeEntries;`cannot read X` 类 fs error 不标 severity;**v2 B1 修订 + v3 B1 调整**)
- Modify: `src/cli/commands/validate.ts`(exit 0/1/2 三档,沿 master §3.12.3 freeze;**v2 B2 修订**)
- Create: `tests/core/validate/scope-entries.test.ts`
- Modify(existing): `tests/cli/validate.test.ts`(验 CRITICAL → exit 1 + fs 错 → exit 2;**v3 修订:删 "missing Why exit 2" 旧期望**)

**Goal**(v3 修订):`forge validate` 检测 proposal.md / design.md 内三段 fenced YAML block 时做 schema 校验,同时**重新分类全部 validate error 的 exit code 走向**沿 master §3.12.3。

**v3 B1 修订(跨 9a 接口冻结)**:9a 实施时把 `validate_run_id`(crypto.randomUUID 生成的 ephemeral ID)进了 `FindingHashPayload` 9 字段。但 ephemeral 字段进 hash 让同一逻辑 finding 每次 validate 出不同 hash,**破坏 9a finding_hash 的去重 / 持久 ack 设计意图**(同一错误 ack 一次后,下次 validate 应仍能匹配同 hash 跳过 ack 要求)。**v3 修订**:`FindingHashPayload` 从 9 字段降为 8 字段(移除 `validate_run_id`);hash 仅绑定稳定字段(`content_hash` / `git_head` / `dimension` / `check_type` / `severity` / `automated` / `evidence` / `recommendation`)。注:master §3.12.1 freeze 表**没有显式锁 `validate_run_id` 字段**(line 425-439 列的字段不含 validate_run_id),所以本修订仅影响 9a 实施细节,不动 master;但 plan-9b §11 修订记录会记该跨 plan 改动便于追溯。

**v2 B1 修订(保留)**:scope finding 的 `finding_hash` 必须绑定**真实运行时上下文**(`content_hash` 用 `computeContentHash(changeDir)`;`git_head` 用 `execFileSync('git rev-parse HEAD')`,非 git 用 'no-git-head'),**不允许静态占位**。配合 v3 B1 移除 validate_run_id,hash 现在同 change 状态下稳定可去重。

**v3 B2 修订(扩展 v2 B2)**:`forge validate` exit code 走 master §3.12.3 freeze 三档:**0 = 全 PASS / 1 = CRITICAL findings 存在 / 2 = config / fs 错**。**v3 修订**(沿 codex 二轮):"缺 Why 段" / "tasks empty" 等业务 schema 校验失败也是 CRITICAL → exit 1,不是 exit 2;exit 2 **仅**留给 fs/config 错(如 `cannot read proposal.md`)。具体实施:
- `src/core/validate/proposal.ts` / `specs.ts` / `tasks.ts` 全部 business-fail error 显式加 `severity: 'CRITICAL'`
- `src/core/validate/change.ts` 内 `cannot read X` 类 fs error **不标 severity**(undefined),用 message prefix `[fs]` 标识
- `src/cli/commands/validate.ts` 判定:errors 中存在 severity === 'CRITICAL' → exit 1;否则(全是 fs 错)→ exit 2

- [ ] **Step 0(v3 B1 修订前置):修 9a FindingHashPayload 移除 `validate_run_id`**

修改 `src/core/schemas/severity.ts`:

```typescript
// FindingHashPayload 从 9 字段降为 8 字段(v3 codex review BLOCKER 1 修订:移除 ephemeral validate_run_id)
// 这是 9a 接口冻结的反向调整;ephemeral runId 进 hash 破坏 finding_hash 去重设计意图(同一逻辑 finding ack 一次后应能稳定匹配)
// master §3.12.1 表未显式锁 validate_run_id,本修订仅影响 9a 实施细节
export interface FindingHashPayload {
  content_hash: string;
  git_head: string;
  dimension: 'completeness' | 'correctness' | 'coherence';
  check_type: string;
  severity: Severity;
  automated: boolean;
  evidence: string;
  recommendation: string;
}

export interface Finding extends FindingHashPayload {
  id: number;
  resolved: boolean;
  finding_hash: string;
  /** ephemeral metadata — 本次 validate 调用 ID;不进 hash payload(v3 B1 修订) */
  validate_run_id?: string;
  severity_candidate?: 'CRITICAL';
  candidate_type?: CandidateType;
  severity_candidate_rejected?: boolean;
  candidate_rejected_reason?: string;
  severity_acked_by?: string;
  severity_acked_at?: string;
  downgraded_from?: Severity;
  downgraded_to?: Severity;
  downgrade_acked_by?: string;
  downgrade_rationale?: string;
}
```

修改 `src/core/validate/finding-hash.ts`:

```typescript
// extractHashPayload 从 9 字段降为 8 字段
export function extractHashPayload(finding: Finding): FindingHashPayload {
  return {
    content_hash: finding.content_hash,
    git_head: finding.git_head,
    dimension: finding.dimension,
    check_type: finding.check_type,
    severity: finding.severity,
    automated: finding.automated,
    evidence: finding.evidence,
    recommendation: finding.recommendation,
  };
}
```

跑 9a 现有 test 看是否回归:

```bash
pnpm vitest run tests/core/validate/finding-hash.test.ts
```

若有 assertion 依赖 `validate_run_id` 进 hash → 更新 test(去除该 assertion 或改为"不同 validate_run_id 下同 hash")。

commit:

```bash
git add src/core/schemas/severity.ts src/core/validate/finding-hash.ts tests/core/validate/finding-hash.test.ts
git commit -m "refactor(9a→v1.0): FindingHashPayload 移除 validate_run_id(v3 plan-9b BLOCKER 1 修订)

ephemeral runId 进 hash 破坏 finding_hash 去重 / 持久 ack 设计意图
8 字段稳定 payload:content_hash + git_head + dimension + check_type +
                  severity + automated + evidence + recommendation
validate_run_id 改 Finding-level metadata(optional,不入 hash)
master §3.12.1 freeze 表未显式锁 validate_run_id,本修订不动 master"
```

- [ ] **Step 1: 扩展 ValidationError(severity + finding_hash + artifact 加 'scope')**

修改 `src/core/validate/types.ts`:

```typescript
// src/core/validate/types.ts — 顶部加 import
import type { Severity } from '../schemas/severity.js';

export interface ValidationError {
  artifact: 'proposal' | 'specs' | 'design' | 'tasks' | 'marker' | 'change' | 'scope';
  field?: string;
  message: string;
  file?: string;
  line?: number;
  /** 三级分级(沿 9a severity.ts);CRITICAL → CLI exit 1;
   *  未指定 / WARNING / SUGGESTION → 走原 exit 2(fs/config 类错或 schema 类业务错)
   *  v2 B2 修订:scope 类 finding 显式标 'CRITICAL' */
  severity?: Severity;
  /** 9a finding_hash(JCS SHA256 of FindingHashPayload);仅 scope 类 finding 有 */
  finding_hash?: string;
}
```

- [ ] **Step 2: 写 failing tests(含 B1 真实 hash 接通 + B2 exit 1 + 原 schema 校验)**

```typescript
// tests/core/validate/scope-entries.test.ts(v3 修订:context 去 runId)
import { describe, it, expect } from 'vitest';
import { validateScopeEntries } from '../../../src/core/validate/scope-entries.js';

const ctx = {
  contentHash: 'sha256:abc',
  gitHead: 'deadbeef',
};

describe('validateScopeEntries(plan-9b v2 Task 4)', () => {
  const baseFile = '/tmp/proposal.md';

  it('valid YAML block + 字段全 → ok', () => {
    const text = [
      '# P',
      '## Why\n\nw',
      '## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a-thing',
      '    category: out-of-scope',
      '    description: desc',
      '    reason: because',
      '    priority: medium',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
      '',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(true);
  });

  it('YAML 语法错 → CRITICAL finding,severity 标 CRITICAL', () => {
    const text = '## Out of Scope {#forge-oos}\n\n```yaml\n: invalid\n```\n';
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.severity).toBe('CRITICAL');
    expect(r.errors[0]?.message).toMatch(/yaml.*parse/i);
  });

  it('finding_hash 稳定:同 ctx 下两次调用产同 hash(v3 B1 修订:去 ephemeral runId)', () => {
    const text = [
      '## Out of Scope {#forge-oos}\n',
      '```yaml',
      'schema: other/v1',
      'anchor_id: forge-oos',
      'entries: []',
      '```',
    ].join('\n');
    const r1 = validateScopeEntries(text, baseFile, ctx);
    const r2 = validateScopeEntries(text, baseFile, ctx);
    expect(r1.errors[0]?.finding_hash).toBe(r2.errors[0]?.finding_hash);
  });

  it('finding_hash 是真实绑定(不同 contentHash → 不同 hash)', () => {
    const text = '## Out of Scope {#forge-oos}\n\n```yaml\nschema: bad/v1\nanchor_id: forge-oos\nentries: []\n```\n';
    const r1 = validateScopeEntries(text, baseFile, ctx);
    const r2 = validateScopeEntries(text, baseFile, { ...ctx, contentHash: 'sha256:different' });
    expect(r1.errors[0]?.finding_hash).not.toBe(r2.errors[0]?.finding_hash);
  });

  it('schema 字段不对 → CRITICAL', () => {
    const text = '## Out of Scope {#forge-oos}\n\n```yaml\nschema: other/v1\nanchor_id: forge-oos\nentries: []\n```\n';
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('schema');
    expect(r.errors[0]?.severity).toBe('CRITICAL');
  });

  it('anchor_id 与 enclosing section anchor 不一致 → CRITICAL', () => {
    const text = '## Future Work {#forge-future-work}\n\n```yaml\nschema: forge-scope-entries/v1\nanchor_id: forge-oos\nentries: []\n```\n';
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toMatch(/anchor_id/);
  });

  it('entries[].reason 空 → CRITICAL', () => {
    const text = [
      '## Out of Scope {#forge-oos}\n',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a',
      '    category: out-of-scope',
      '    description: d',
      '    reason: ""',
      '    priority: null',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('entries[0].reason');
  });

  it('entries[].category ≠ anchor_id 默认映射 → CRITICAL', () => {
    const text = [
      '## Out of Scope {#forge-oos}\n',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a',
      '    category: future-work',
      '    description: d',
      '    reason: r',
      '    priority: null',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('entries[0].category');
  });

  it('entries[].status 非法 → CRITICAL', () => {
    const text = [
      '## Out of Scope {#forge-oos}\n',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a',
      '    category: out-of-scope',
      '    description: d',
      '    reason: r',
      '    priority: null',
      '    status: pending',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('entries[0].status');
  });

  it('无 scope section / 无 yaml block → ok(老 change 兼容)', () => {
    const text = '# P\n\n## Why\n\nw\n\n## What\n\nc\n';
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(true);
  });
});
```

```typescript
// tests/cli/validate.test.ts(追加;v2 B2 修订:exit 1 验证)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CLI = join(process.cwd(), 'dist', 'cli', 'index.js');

describe('forge validate exit code(v2 B2 修订:0/1/2 三档)', () => {
  let projectRoot: string;
  let changeDir: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'forge-validate-exit-'));
    changeDir = join(projectRoot, 'forge', 'changes', 'test-id');
    await mkdir(join(changeDir, 'specs'), { recursive: true });
    await writeFile(join(changeDir, 'specs', 'a.md'), '# A\n');
    await writeFile(join(changeDir, 'tasks.md'), '# T\n');
    await writeFile(join(changeDir, 'design.md'), '# D\n');
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('全合规 → exit 0', () => {
    writeFileSync(join(changeDir, 'proposal.md'), '# P\n\n## Why\n\nw\n\n## What\n\nc\n');
    const out = execFileSync('node', [CLI, 'validate', 'test-id'], { cwd: projectRoot, encoding: 'utf8' });
    expect(out).toContain('valid');
  });

  it('CRITICAL scope finding → exit 1', () => {
    writeFileSync(
      join(changeDir, 'proposal.md'),
      [
        '# P\n## Why\n\nw\n## What\n\nc',
        '## Out of Scope {#forge-oos}\n',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: a',
        '    category: out-of-scope',
        '    description: d',
        '    reason: ""',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );
    let exitCode = 0;
    try {
      execFileSync('node', [CLI, 'validate', 'test-id'], { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 0;
    }
    expect(exitCode).toBe(1);
  });

  it('proposal missing Why → CRITICAL business-fail → exit 1(v3 B2 修订:删 v2 旧"exit 2"期望)', () => {
    writeFileSync(join(changeDir, 'proposal.md'), '# P\n\n## What\n\nc\n');
    let exitCode = 0;
    try {
      execFileSync('node', [CLI, 'validate', 'test-id'], { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 0;
    }
    expect(exitCode).toBe(1); // v3 修订:business-fail 也算 CRITICAL → exit 1(沿 master §3.12.3 freeze)
  });

  it('fs error(proposal.md 不存在)→ exit 2(仅 fs/config 错走 2)', () => {
    // 删 proposal.md 模拟 fs 错
    unlinkSync(join(changeDir, 'proposal.md').replace(/\\/g, '/'));
    let exitCode = 0;
    try {
      execFileSync('node', [CLI, 'validate', 'test-id'], { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 0;
    }
    expect(exitCode).toBe(2);
  });
});

import { writeFileSync, unlinkSync } from 'node:fs';
```

- [ ] **Step 3: 跑测试确认 fail**

```bash
pnpm vitest run tests/core/validate/scope-entries.test.ts tests/cli/validate.test.ts
```
Expected: 全部 fail(模块不存在 + CLI 无 exit 1 行为)

- [ ] **Step 4: 写 validateScopeEntries 实现(v2 B1 修订:接受真实 context)**

```typescript
// src/core/validate/scope-entries.ts(v2 B1 修订:context 参数)
import { parseMarkdown } from '../parse/markdown.js';
import { parseFencedYamlBlocks, FencedYamlParseError } from '../parse/fenced-yaml.js';
import {
  ANCHOR_TO_CATEGORY,
  SCOPE_ANCHOR_IDS,
  isScopeCategory,
  isScopeStatus,
  type ScopeAnchorId,
} from '../schemas/scope-entries.js';
import { computeFindingHash } from './finding-hash.js';
import type { FindingHashPayload } from '../schemas/severity.js';
import type { ValidationError } from './types.js';

/** validate 运行时上下文(v2 B1 + v3 B1 修订)— 仅含稳定字段,**不含 ephemeral runId** */
export interface ScopeValidateContext {
  /** computeContentHash(changeDir) 的结果(`sha256:...`) */
  contentHash: string;
  /** git rev-parse HEAD(40-char SHA);非 git → 'no-git-head' */
  gitHead: string;
}

export interface ScopeValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validateScopeEntries(
  text: string,
  file: string | undefined,
  ctx: ScopeValidateContext,
): ScopeValidationResult {
  const errors: ValidationError[] = [];
  const md = parseMarkdown(text);

  for (const sec of md.sections) {
    if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) continue;

    let blocks: unknown[];
    try {
      blocks = parseFencedYamlBlocks(sec.body);
    } catch (err) {
      const bi = err instanceof FencedYamlParseError ? err.blockIndex : 0;
      errors.push(makeError('yaml-parse', `yaml parse failed in block #${bi}: ${(err as Error).message}`, file, sec.anchor as ScopeAnchorId, ctx));
      continue;
    }
    if (blocks.length === 0) continue;

    const block = blocks[0] as Record<string, unknown>;
    const anchorId = sec.anchor as ScopeAnchorId;

    if (block.schema !== 'forge-scope-entries/v1') {
      errors.push(makeError('schema', `expected 'forge-scope-entries/v1', got ${JSON.stringify(block.schema)}`, file, anchorId, ctx));
      continue;
    }
    if (block.anchor_id !== anchorId) {
      errors.push(makeError('anchor_id', `anchor_id ${JSON.stringify(block.anchor_id)} ≠ enclosing section anchor ${anchorId}`, file, anchorId, ctx));
      continue;
    }
    const entries = Array.isArray(block.entries) ? block.entries : null;
    if (!entries) {
      errors.push(makeError('entries', `entries must be array`, file, anchorId, ctx));
      continue;
    }

    const expectedCategory = ANCHOR_TO_CATEGORY[anchorId];
    entries.forEach((e, i) => {
      const entry = e as Record<string, unknown>;
      const pre = `entries[${i}]`;
      const push = (subfield: string, msg: string) =>
        errors.push(makeError(`${pre}.${subfield}`, msg, file, anchorId, ctx));

      if (typeof entry.id !== 'string' || entry.id.length === 0) push('id', `must be non-empty string`);
      if (typeof entry.description !== 'string' || entry.description.length === 0) push('description', `must be non-empty string`);
      if (typeof entry.reason !== 'string' || entry.reason.length === 0) push('reason', `must be non-empty string(必填论证,沿 design §2.6.3)`);
      if (!isScopeCategory(entry.category)) push('category', `must be one of out-of-scope|non-goal|future-work`);
      else if (entry.category !== expectedCategory) push('category', `category ${entry.category} ≠ anchor_id ${anchorId} 默认映射 ${expectedCategory}`);
      if (!isScopeStatus(entry.status)) push('status', `must be one of active|inherited|superseded|completed|obsolete`);
    });
  }

  return { valid: errors.length === 0, errors };
}

function makeError(
  field: string,
  message: string,
  file: string | undefined,
  anchorId: ScopeAnchorId,
  ctx: ScopeValidateContext,
): ValidationError {
  // v2 B1 + v3 B1 修订:**真实**绑定 9a FindingHashPayload 8 字段(去 ephemeral validate_run_id)
  const payload: FindingHashPayload = {
    content_hash: ctx.contentHash,
    git_head: ctx.gitHead,
    dimension: 'correctness',
    check_type: `scope-entries:${anchorId}:${field}`,
    severity: 'CRITICAL',
    automated: true,
    evidence: file ? `file:${file}` : 'change-level',
    recommendation: message,
  };
  return {
    artifact: 'scope',
    field,
    message,
    file,
    severity: 'CRITICAL',
    finding_hash: computeFindingHash(payload),
  };
}
```

- [ ] **Step 5: 修 validate/index.ts re-export**

```typescript
// src/core/validate/index.ts — 末尾加
export * from './scope-entries.js';
```

- [ ] **Step 6: 修 validateChange 计算 + 传 ctx + 现有 validator 标 severity(v2 B1 + v3 B2 修订)**

修改 `src/core/validate/change.ts`:

```typescript
// src/core/validate/change.ts — 顶部
import { execFileSync } from 'node:child_process';
import { validateScopeEntries } from './scope-entries.js';
import { computeContentHash } from '../hash/content.js';

// validateChange 函数体开始处
export async function validateChange(changeDir: string): Promise<ValidationResult> {
  const results: ValidationResult[] = [];
  // v2 B1 + v3 B1 修订:仅含稳定字段,**不含 ephemeral runId**
  let ctx: { contentHash: string; gitHead: string };
  try {
    ctx = {
      contentHash: await computeContentHash(changeDir),
      gitHead: getGitHead() ?? 'no-git-head',
    };
  } catch (err) {
    // computeContentHash 抛错(罕见 — 仅 specs/ 非 ENOENT 类 IO 错)
    // 退化为 'no-content-hash' 让校验仍能跑(scope finding 仍可产但 hash 弱化)
    ctx = { contentHash: 'no-content-hash', gitHead: 'no-git-head' };
  }

  // 在 proposal 校验 try 块内,parseProposal 之后加:
  const scopeP = validateScopeEntries(text, proposalPath, ctx);
  if (!scopeP.valid) {
    for (const e of scopeP.errors) results.push({ valid: false, errors: [e], warnings: [] });
  }
  // design 校验 try 块内,parseDesign 之后加同样调用(传 designPath + ctx)
  const scopeD = validateScopeEntries(text, designPath, ctx);
  if (!scopeD.valid) {
    for (const e of scopeD.errors) results.push({ valid: false, errors: [e], warnings: [] });
  }
  // v3 B2 修订:fs 错(cannot read X)**不标 severity**(走 exit 2);现有 try/catch 内 failed() 调用 message 加 '[fs]' 前缀
  // 例:cannot read proposal.md → failed({artifact:'proposal', message:'[fs] cannot read proposal.md: ...'})
  // **v4 codex 三轮 BLOCKER 1 修订**:change.ts 内**直接构造的** failed() 调用(business-fail 不是 fs 错)
  // 必须显式标 severity 'CRITICAL'。当前 change.ts:65 处 `no spec files in specs/` 是 specs/ 存在但内部空,
  // 这是 business-fail(用户写错 change) 不是 fs 错,**必须改成**:
  //   failed({ artifact: 'specs', message: 'no spec files in specs/', file: specsDir, severity: 'CRITICAL' })
}

function getGitHead(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
```

**v3 B2 修订**:修 proposal.ts / specs.ts / tasks.ts 现有 validator,给所有 business-fail error 加 `severity: 'CRITICAL'`:

```typescript
// src/core/validate/proposal.ts — 全部 failed() 调用加 severity
errors.push(
  failed({ artifact: 'proposal', field: 'title', message: 'missing or empty H1 title', file, severity: 'CRITICAL' }),
);
errors.push(
  failed({ artifact: 'proposal', field: 'why', message: 'missing or empty Why section', file, severity: 'CRITICAL' }),
);
errors.push(
  failed({ artifact: 'proposal', field: 'what', message: 'missing or empty What section', file, severity: 'CRITICAL' }),
);
```

(specs.ts / tasks.ts 同样模式 — 所有现有 failed() 调用 spread `severity: 'CRITICAL'`)

- [ ] **Step 7: 修 validate.ts CLI 走 exit 0/1/2(v2 B2 修订)**

```typescript
// src/cli/commands/validate.ts(完整替换)
import { Command } from 'commander';
import { join } from 'node:path';
import { validateChange } from '../../core/validate/index.js';

export function buildValidateCommand(): Command {
  return new Command('validate')
    .argument('<changeId>', 'change directory id (e.g., add-login)')
    .description('Validate a change directory')
    .action(async (changeId: string) => {
      const changeDir = join(process.cwd(), 'forge', 'changes', changeId);
      const result = await validateChange(changeDir);

      if (result.valid) {
        console.log(`✓ ${changeId}: valid`);
        process.exit(0);
      }

      // v2 B2 修订:exit 1 if any CRITICAL,否则 exit 2(老 behavior)
      const hasCritical = result.errors.some((e) => e.severity === 'CRITICAL');
      const exitCode = hasCritical ? 1 : 2;
      console.error(`✗ ${changeId}: ${result.errors.length} errors`);
      for (const e of result.errors) {
        const sevPrefix = e.severity ? `[${e.severity}] ` : '';
        const hashSuffix = e.finding_hash ? ` (finding_hash=${e.finding_hash.slice(0, 8)}...)` : '';
        console.error(
          `  - ${sevPrefix}[${e.artifact}] ${e.field ?? ''}: ${e.message}${e.file ? ` (${e.file}${e.line ? `:${e.line}` : ''})` : ''}${hashSuffix}`,
        );
      }
      process.exit(exitCode);
    });
}
```

- [ ] **Step 8: 跑测试 + typecheck**

```bash
pnpm build && pnpm vitest run tests/core/validate/scope-entries.test.ts tests/cli/validate.test.ts
```
Expected: scope-entries 10/10 PASS;validate.test.ts exit code 三档 3/3 PASS

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```
Expected: 全 PASS

跑现有 validate test 确认无回归:

```bash
pnpm vitest run tests/core/validate/ tests/cli/validate.test.ts tests/cli/archive.test.ts
```
Expected: 全 PASS;若现有 fixture 触发新 CRITICAL → 是预期(应该不会,现有 fixture 不带 anchor section)

- [ ] **Step 9: commit**

```bash
git add src/core/validate/types.ts src/core/validate/scope-entries.ts \
        src/core/validate/index.ts src/core/validate/change.ts \
        src/cli/commands/validate.ts \
        tests/core/validate/scope-entries.test.ts tests/cli/validate.test.ts
git commit -m "feat(9b): scope YAML schema + ValidationError severity + validate exit 1(v2 BLOCKER 修订)

- v2 B1: validateScopeEntries 接 ScopeValidateContext {runId, contentHash, gitHead}(真实绑定)
       FindingHashPayload 9 字段全真实运行时;不允许 <validate-static> 占位
- v2 B2: ValidationError 加 severity + finding_hash;artifact enum 加 'scope'
       validate.ts CLI exit 0/1/2 三档(沿 master §3.12.3 freeze)
- validateChange 用 crypto.randomUUID + computeContentHash + git rev-parse HEAD 算 ctx"
```

- [ ] **Step 1: 写 failing test**

```typescript
// tests/core/validate/scope-entries.test.ts
import { describe, it, expect } from 'vitest';
import { validateScopeEntries } from '../../../src/core/validate/scope-entries.js';

describe('validateScopeEntries(plan-9b Task 4)', () => {
  const baseFile = '/tmp/proposal.md';

  it('valid YAML block + 字段全 → ok', () => {
    const text = [
      '# P',
      '## Why\n\nw',
      '## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a-thing',
      '    category: out-of-scope',
      '    description: desc',
      '    reason: because',
      '    priority: medium',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
      '',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile);
    expect(r.valid).toBe(true);
  });

  it('YAML 语法错 → CRITICAL finding,message 含 block 序号', () => {
    const text = [
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      ': invalid',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.severity).toBe('CRITICAL');
    expect(r.errors[0]?.message).toMatch(/yaml.*parse/i);
  });

  it('schema 字段不对(非 forge-scope-entries/v1)→ CRITICAL', () => {
    const text = [
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: other/v1',
      'anchor_id: forge-oos',
      'entries: []',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.severity).toBe('CRITICAL');
    expect(r.errors[0]?.field).toBe('schema');
  });

  it('anchor_id 与 enclosing section anchor 不一致 → CRITICAL', () => {
    const text = [
      '## Future Work {#forge-future-work}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos', // 错:实际段是 forge-future-work
      'entries: []',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toMatch(/anchor_id/);
  });

  it('entries[].reason 空 → CRITICAL(reason 必填)', () => {
    const text = [
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a',
      '    category: out-of-scope',
      '    description: d',
      '    reason: ""',
      '    priority: null',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('entries[0].reason');
  });

  it('entries[].category 与 anchor_id 默认映射不一致 → CRITICAL', () => {
    const text = [
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a',
      '    category: future-work', // 错:本段是 forge-oos,默认应 out-of-scope
      '    description: d',
      '    reason: r',
      '    priority: null',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('entries[0].category');
  });

  it('entries[].status 非法 → CRITICAL', () => {
    const text = [
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a',
      '    category: out-of-scope',
      '    description: d',
      '    reason: r',
      '    priority: null',
      '    status: pending', // 不在 5 enum
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('entries[0].status');
  });

  it('无 scope section / 无 yaml block → ok(未启用 scope 协议老 change 兼容)', () => {
    const text = '# P\n\n## Why\n\nw\n\n## What\n\nc\n';
    const r = validateScopeEntries(text, baseFile);
    expect(r.valid).toBe(true);
  });

  it('每个 finding 必含 finding_hash(9a 接通)', () => {
    const text = [
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: other/v1',
      'anchor_id: forge-oos',
      'entries: []',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile);
    expect(r.errors[0]?.finding_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `pnpm vitest run tests/core/validate/scope-entries.test.ts`
Expected: 全部 fail(模块不存在)

- [ ] **Step 3: 写实现**

```typescript
// src/core/validate/scope-entries.ts
// plan-9b Task 4 — scope YAML schema 校验 + CRITICAL finding(走 9a finding_hash)

import { parseMarkdown } from '../parse/markdown.js';
import { parseFencedYamlBlocks, FencedYamlParseError } from '../parse/fenced-yaml.js';
import {
  ANCHOR_TO_CATEGORY,
  SCOPE_ANCHOR_IDS,
  isScopeCategory,
  isScopeStatus,
  type ScopeAnchorId,
} from '../schemas/scope-entries.js';
import { computeFindingHash } from './finding-hash.js';
import type { FindingHashPayload } from '../schemas/severity.js';

/** 单个错误项(沿现有 ValidationResult error shape + severity / finding_hash 字段) */
export interface ScopeValidationError {
  artifact: 'scope';
  field: string;
  message: string;
  file?: string;
  severity: 'CRITICAL';
  /** 9a finding_hash(JCS SHA256 of FindingHashPayload) */
  finding_hash: string;
}

export interface ScopeValidationResult {
  valid: boolean;
  errors: ScopeValidationError[];
}

/**
 * 校验单个 markdown(proposal.md / design.md)内全部 scope YAML 块。
 * 无 scope section / 无 yaml block → ok(兼容未启用协议的老 change)。
 *
 * 检查:
 * - 每段含 anchor(forge-oos / forge-non-goals / forge-future-work)的 section,
 *   其内第一个 ```yaml block(若有)走 schema 校验
 * - schema == 'forge-scope-entries/v1'
 * - anchor_id == enclosing section 的 anchor
 * - entries[].category == ANCHOR_TO_CATEGORY[anchor_id]
 * - entries[].id / description / reason 非空 string
 * - entries[].status ∈ SCOPE_STATUS_VALUES
 */
export function validateScopeEntries(text: string, file?: string): ScopeValidationResult {
  const errors: ScopeValidationError[] = [];
  const md = parseMarkdown(text);
  const stamp = '<validate-static>'; // FindingHashPayload 字段统一占位(validate 阶段无 git_head/content_hash)

  for (const sec of md.sections) {
    if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) continue;

    // 抽该段 body 内的 yaml 块
    let blocks: unknown[];
    try {
      blocks = parseFencedYamlBlocks(sec.body);
    } catch (err) {
      const bi = err instanceof FencedYamlParseError ? err.blockIndex : 0;
      errors.push(makeError('yaml-parse', `yaml parse failed in block #${bi}: ${(err as Error).message}`, file, sec.anchor, stamp));
      continue;
    }
    if (blocks.length === 0) continue; // 仅 anchor section 无 yaml 块 — 合法(占位段)

    const block = blocks[0] as Record<string, unknown>;
    const anchorId = sec.anchor as ScopeAnchorId;

    // schema 字段
    if (block.schema !== 'forge-scope-entries/v1') {
      errors.push(makeError('schema', `expected 'forge-scope-entries/v1', got ${JSON.stringify(block.schema)}`, file, anchorId, stamp));
      continue;
    }
    // anchor_id 字段
    if (block.anchor_id !== anchorId) {
      errors.push(makeError('anchor_id', `anchor_id ${JSON.stringify(block.anchor_id)} ≠ enclosing section anchor ${anchorId}`, file, anchorId, stamp));
      continue;
    }
    // entries 数组
    const entries = Array.isArray(block.entries) ? block.entries : null;
    if (!entries) {
      errors.push(makeError('entries', `entries must be array`, file, anchorId, stamp));
      continue;
    }

    const expectedCategory = ANCHOR_TO_CATEGORY[anchorId];
    entries.forEach((e, i) => {
      const entry = e as Record<string, unknown>;
      const pre = `entries[${i}]`;
      const push = (subfield: string, msg: string) =>
        errors.push(makeError(`${pre}.${subfield}`, msg, file, anchorId, stamp));

      if (typeof entry.id !== 'string' || entry.id.length === 0) push('id', `must be non-empty string`);
      if (typeof entry.description !== 'string' || entry.description.length === 0) push('description', `must be non-empty string`);
      if (typeof entry.reason !== 'string' || entry.reason.length === 0) push('reason', `must be non-empty string(必填论证,沿 design §2.6.3)`);
      if (!isScopeCategory(entry.category)) push('category', `must be one of out-of-scope|non-goal|future-work`);
      else if (entry.category !== expectedCategory) push('category', `category ${entry.category} ≠ anchor_id ${anchorId} 默认映射 ${expectedCategory}`);
      if (!isScopeStatus(entry.status)) push('status', `must be one of active|inherited|superseded|completed|obsolete`);
    });
  }

  return { valid: errors.length === 0, errors };
}

function makeError(
  field: string,
  message: string,
  file: string | undefined,
  anchorId: ScopeAnchorId,
  stamp: string,
): ScopeValidationError {
  // 9a 接通:每个 finding 含 finding_hash(JCS SHA256 of 9 字段 payload)
  const payload: FindingHashPayload = {
    validate_run_id: stamp,
    content_hash: stamp,
    git_head: stamp,
    dimension: 'correctness',
    check_type: `scope-entries:${anchorId}:${field}`,
    severity: 'CRITICAL',
    automated: true,
    evidence: file ? `file:${file}` : 'change-level',
    recommendation: message,
  };
  return {
    artifact: 'scope',
    field,
    message,
    file,
    severity: 'CRITICAL',
    finding_hash: computeFindingHash(payload),
  };
}
```

- [ ] **Step 4: 跑测试确认 pass**

Run: `pnpm vitest run tests/core/validate/scope-entries.test.ts`
Expected: 9/9 PASS

- [ ] **Step 5: validate/index.ts 加 re-export**

```typescript
// src/core/validate/index.ts — 末尾加
export * from './scope-entries.js';
```

- [ ] **Step 6: validateChange 集成调用**

修改 `src/core/validate/change.ts`,在读 proposal.md / design.md 后调 validateScopeEntries,合并 errors 进 result:

```typescript
// src/core/validate/change.ts — 顶部加 import
import { validateScopeEntries } from './scope-entries.js';

// 在 proposal 校验 try 块内,parseProposal 之后加:
const scopeRes = validateScopeEntries(text, proposalPath);
if (!scopeRes.valid) {
  for (const e of scopeRes.errors) {
    results.push(
      failed({
        artifact: 'scope',
        field: e.field,
        message: `[${e.severity}] ${e.message} (finding_hash=${e.finding_hash.slice(0, 8)}...)`,
        file: e.file,
      }),
    );
  }
}

// design 校验 try 块内,parseDesign 之后加同样逻辑(参数 designPath)
const scopeDes = validateScopeEntries(text, designPath);
if (!scopeDes.valid) {
  for (const e of scopeDes.errors) {
    results.push(
      failed({
        artifact: 'scope',
        field: e.field,
        message: `[${e.severity}] ${e.message} (finding_hash=${e.finding_hash.slice(0, 8)}...)`,
        file: e.file,
      }),
    );
  }
}
```

- [ ] **Step 7: 跑现有 validate test + change test 确认无回归**

Run: `pnpm vitest run tests/core/validate/ tests/cli/validate.test.ts`
Expected: 全 PASS;若有 fixture 含 scope YAML 但不符 schema → 修 fixture 或确认是预期回归(应该不会,现有 fixture 不带 anchor section)

- [ ] **Step 8: typecheck + commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
git add src/core/validate/scope-entries.ts src/core/validate/index.ts src/core/validate/change.ts \
        tests/core/validate/scope-entries.test.ts
git commit -m "feat(9b): scope-entries YAML schema 校验 + CRITICAL finding(9a 接通)

validateScopeEntries 校验 proposal.md/design.md 内三段 yaml block:
- schema/anchor_id/entries[].{id,description,reason,category,status} 必填 + enum
- 每个 finding 走 9a finding_hash(JCS SHA256 of FindingHashPayload)
集成进 validateChange — error.severity=CRITICAL,exit 走原 validate 通路(2)
后续 9d 统一 verify 三维度路径再收割 severity → exit 1"
```

---

## 6. Task 5 — `forge scope scan-archived-followups` CLI

**Files:**
- Create: `src/core/scope/aggregator.ts`
- Create: `src/core/scope/index.ts`
- Create: `src/cli/commands/scope.ts`
- Modify: `src/cli/index.ts`(注册 `buildScopeCommand()`)
- Create: `tests/core/scope/aggregator.test.ts`
- Create: `tests/cli/scope-cli.test.ts`

**Goal**:`forge scope scan-archived-followups <new-change-id>` 扫 `forge/changes/archive/*/proposal.md` + `design.md` 的 fenced YAML 块,聚合 status=active 的 entries,**扣已被其他 archived change 的 `superseding_entries` 走的**,按 Future Work > Out of Scope > Non-Goals 排序,JSON 输出到 stdout。**exit code 沿 §3.12.3 :0 = 输出 active entries(JSON);2 = archive 目录不可读 / new-change-id 缺失**。

- [ ] **Step 1: 写 aggregator failing test**

```typescript
// tests/core/scope/aggregator.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanArchivedFollowups } from '../../../src/core/scope/aggregator.js';

describe('scanArchivedFollowups(plan-9b Task 5)', () => {
  let forgeRoot: string;
  beforeEach(async () => {
    forgeRoot = await mkdtemp(join(tmpdir(), 'forge-9b-scope-'));
    await mkdir(join(forgeRoot, 'changes', 'archive'), { recursive: true });
  });
  afterEach(async () => {
    await rm(forgeRoot, { recursive: true, force: true });
  });

  async function makeArchive(id: string, proposalMd: string, designMd = '# D\n') {
    const dir = join(forgeRoot, 'changes', 'archive', id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'proposal.md'), proposalMd);
    await writeFile(join(dir, 'design.md'), designMd);
  }

  it('空 archive → 空 entries', async () => {
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r).toEqual({ entries: [] });
  });

  it('单 archived change 含 active entry → 收集', async () => {
    await makeArchive('2026-05-01-add-auth', [
      '# P\n## Why\n\nw\n## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: sso-saml',
      '    category: out-of-scope',
      '    description: SSO SAML',
      '    reason: out-of-scope rationale',
      '    priority: medium',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n'));
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      id: 'sso-saml',
      category: 'out-of-scope',
      status: 'active',
      source_change: '2026-05-01-add-auth',
    });
  });

  it('archive A 写 entry + archive B 的 superseding_entries 标走 → 不收集', async () => {
    await makeArchive('2026-05-01-add-auth', [
      '# P\n## Why\n\nw\n## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: sso-saml',
      '    category: out-of-scope',
      '    description: SSO SAML',
      '    reason: r',
      '    priority: null',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n'));
    await makeArchive('2026-05-05-add-sso', [
      '# P\n## Why\n\nw\n## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries: []',
      'superseding_entries:',
      '  - source_change: 2026-05-01-add-auth',
      '    entry_id: sso-saml',
      '    new_status: superseded',
      '    rationale: implemented here',
      '```',
    ].join('\n'));
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.entries).toHaveLength(0);
  });

  it('排序:future-work 优先 > out-of-scope > non-goal', async () => {
    const mk = (anchor: string, category: string, id: string) =>
      [
        `## H {#${anchor}}`,
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        `anchor_id: ${anchor}`,
        'entries:',
        `  - id: ${id}`,
        `    category: ${category}`,
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n');
    await makeArchive('a', `# P\n## Why\n\nw\n## What\n\nc\n${mk('forge-oos', 'out-of-scope', 'O1')}`);
    await makeArchive('b', `# P\n## Why\n\nw\n## What\n\nc\n${mk('forge-non-goals', 'non-goal', 'N1')}`);
    await makeArchive('c', `# P\n## Why\n\nw\n## What\n\nc`, `# D\n${mk('forge-future-work', 'future-work', 'F1')}`);
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.entries.map((e) => e.id)).toEqual(['F1', 'O1', 'N1']);
  });

  it('忽略 status != active(已 inherited/superseded/completed/obsolete)', async () => {
    await makeArchive('a', [
      '# P\n## Why\n\nw\n## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: x',
      '    category: out-of-scope',
      '    description: d',
      '    reason: r',
      '    priority: null',
      '    status: completed',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n'));
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.entries).toHaveLength(0);
  });

  it('archived yaml 块缺 schema 字段 → skip + stderr warning(v3 codex MAJOR 1 修订)', async () => {
    await makeArchive('legacy-no-schema', [
      '# P\n## Why\n\nw\n## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: legacy-entry',
      '    category: out-of-scope',
      '    description: d',
      '    reason: r',
      '    priority: null',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n'));
    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr.write as unknown) = ((chunk: string | Buffer) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;
    try {
      const r = await scanArchivedFollowups(forgeRoot);
      expect(r.entries).toHaveLength(0); // legacy entry 不被聚合(schema 缺)
      expect(stderrChunks.join('')).toMatch(/skipping yaml block/);
    } finally {
      (process.stderr.write as unknown) = origWrite;
    }
  });

  it('archive 目录不存在 → throw with code ENOENT', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'forge-9b-empty-'));
    await expect(scanArchivedFollowups(empty)).rejects.toThrow(/ENOENT|not found|不存在/);
    await rm(empty, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `pnpm vitest run tests/core/scope/aggregator.test.ts`
Expected: 全部 fail(模块不存在)

- [ ] **Step 3: 写 aggregator 实现**

```typescript
// src/core/scope/aggregator.ts
// plan-9b Task 5 — 扫 archived YAML 块 + 聚合 active entries + 扣 superseding_entries

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarkdown } from '../parse/markdown.js';
import { parseFencedYamlBlocks, FencedYamlParseError } from '../parse/fenced-yaml.js';
import {
  SCOPE_ANCHOR_IDS,
  type ScopeEntry,
  type SupersedingRef,
  type ScopeCategory,
} from '../schemas/scope-entries.js';

/** 含来源 change id 的 entry(供 propose 选单显示) */
export interface AggregatedScopeEntry extends ScopeEntry {
  /** 来源 archived change id(目录名) */
  source_change: string;
}

export interface AggregatorResult {
  entries: AggregatedScopeEntry[];
}

const CATEGORY_ORDER: Record<ScopeCategory, number> = {
  'future-work': 0,
  'out-of-scope': 1,
  'non-goal': 2,
};

/**
 * 扫 forgeRoot/changes/archive/<id>/{proposal,design}.md 内 anchor 三段的 fenced YAML 块,
 * 收集 status=active 的 entries,扣已被任意 archived change 的 superseding_entries 走的。
 *
 * @param forgeRoot 项目内 forge/ 根目录的绝对路径
 * @returns active entries 按 future-work > out-of-scope > non-goal 排序
 * @throws Error 当 forgeRoot/changes/archive/ 不存在时(让 CLI exit 2)
 */
export async function scanArchivedFollowups(forgeRoot: string): Promise<AggregatorResult> {
  const archiveRoot = join(forgeRoot, 'changes', 'archive');
  if (!existsSync(archiveRoot)) {
    throw new Error(`archive 目录不存在(ENOENT): ${archiveRoot}`);
  }

  const archDirs = await readdir(archiveRoot, { withFileTypes: true });
  const collected: AggregatedScopeEntry[] = [];
  const superseded = new Set<string>(); // key: `${source_change}::${entry_id}`

  for (const ent of archDirs) {
    if (!ent.isDirectory()) continue;
    const changeId = ent.name;
    const changeDir = join(archiveRoot, changeId);
    for (const fname of ['proposal.md', 'design.md']) {
      const path = join(changeDir, fname);
      if (!existsSync(path)) continue;
      const text = await readFile(path, 'utf8');
      const md = parseMarkdown(text);
      for (const sec of md.sections) {
        if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) continue;
        let blocks: unknown[];
        try {
          blocks = parseFencedYamlBlocks(sec.body);
        } catch (err) {
          // 单 archived 的 YAML 语法错不阻塞整体扫描,记 stderr-style note 但跳过该段
          if (err instanceof FencedYamlParseError) {
            // 不抛 — 静默跳过(archive 历史不可改,有错也只能 ignored)
            continue;
          }
          throw err;
        }
        for (const block of blocks) {
          const b = block as {
            schema?: string;
            entries?: ScopeEntry[];
            superseding_entries?: SupersedingRef[];
          };
          // v3 codex MAJOR 1 修订:必须先校验 schema 字段(沿 master §3.12.1bis required)
          // archived 老 change(plan-9b 协议前)的 yaml 块可能缺 schema 字段:
          // 策略 — stderr warning 提示 + skip(不阻断聚合,沿 archived 历史不可改原则)
          if (b.schema !== 'forge-scope-entries/v1') {
            process.stderr.write(
              `⚠ scope-aggregator: skipping yaml block in ${changeId}/${fname} — ` +
                `expected schema='forge-scope-entries/v1', got ${JSON.stringify(b.schema)}\n`,
            );
            continue;
          }
          for (const e of b.entries ?? []) {
            if (e.status === 'active') {
              collected.push({ ...e, source_change: changeId });
            }
          }
          for (const sup of b.superseding_entries ?? []) {
            superseded.add(`${sup.source_change}::${sup.entry_id}`);
          }
        }
      }
    }
  }

  const filtered = collected.filter(
    (e) => !superseded.has(`${e.source_change}::${e.id}`),
  );
  filtered.sort((a, b) => {
    const cmp = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (cmp !== 0) return cmp;
    // 同 category 内按 source_change 字典序 + id 字典序(确定性)
    if (a.source_change !== b.source_change) return a.source_change < b.source_change ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { entries: filtered };
}
```

```typescript
// src/core/scope/index.ts
export * from './aggregator.js';
```

- [ ] **Step 4: 跑 aggregator 测试确认 pass**

Run: `pnpm vitest run tests/core/scope/aggregator.test.ts`
Expected: 6/6 PASS

- [ ] **Step 5: 写 CLI failing test**

```typescript
// tests/cli/scope-cli.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CLI = join(process.cwd(), 'dist', 'cli', 'index.js');

describe('forge scope scan-archived-followups(plan-9b Task 5)', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'forge-9b-cli-'));
    await mkdir(join(projectRoot, 'forge', 'changes', 'archive'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('空 archive → exit 0 + JSON {entries: []}', () => {
    const out = execFileSync('node', [CLI, 'scope', 'scan-archived-followups', 'new-change-id'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    expect(JSON.parse(out)).toEqual({ entries: [] });
  });

  it('archive 含 active entry → JSON 输出 + 含 source_change', async () => {
    const dir = join(projectRoot, 'forge', 'changes', 'archive', '2026-05-01-a');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'proposal.md'),
      [
        '# P\n## Why\n\nw\n## What\n\nc',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: foo',
        '    category: out-of-scope',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );
    await writeFile(join(dir, 'design.md'), '# D\n');
    const out = execFileSync('node', [CLI, 'scope', 'scan-archived-followups', 'new-id'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].id).toBe('foo');
    expect(parsed.entries[0].source_change).toBe('2026-05-01-a');
  });

  it('legacy archive 缺 schema 字段 → CLI exit 0 + stdout entries 空 + stderr 含 "skipping yaml block"(v4 codex 三轮 MINOR 修订)', async () => {
    const dir = join(projectRoot, 'forge', 'changes', 'archive', '2026-04-legacy-no-schema');
    await mkdir(dir, { recursive: true });
    // legacy archived change:yaml 块缺 schema 字段(plan-9b 协议前的老 change)
    await writeFile(
      join(dir, 'proposal.md'),
      [
        '# Legacy P\n## Why\n\nw\n## What\n\nc',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: legacy-entry',
        '    category: out-of-scope',
        '    description: legacy',
        '    reason: legacy r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );
    await writeFile(join(dir, 'design.md'), '# D\n');
    // 用 tests/cli/helpers.ts:runCli(spawnSync 模式)以同时捕 stdout + stderr
    const { runCli } = await import('./helpers.js');
    const r = runCli(['scope', 'scan-archived-followups', 'new-id'], projectRoot);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).entries).toEqual([]);
    expect(r.stderr).toMatch(/skipping yaml block/);
  });

  it('archive 目录不存在 → exit 2 + stderr 含 ENOENT(v2 codex MAJOR 3 修订:删 placeholder,真实测)', async () => {
    // 用独立 root,不在 beforeEach 内建 archive 目录
    const noArchRoot = await mkdtemp(join(tmpdir(), 'forge-9b-noarch-'));
    try {
      let exitCode = 0;
      let stderr = '';
      try {
        execFileSync('node', [CLI, 'scope', 'scan-archived-followups', 'new-id'], {
          cwd: noArchRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        exitCode = (e as { status?: number }).status ?? 0;
        stderr = ((e as { stderr?: Buffer }).stderr ?? Buffer.from('')).toString();
      }
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/ENOENT|不存在/);
    } finally {
      await rm(noArchRoot, { recursive: true, force: true });
    }
  });
});
```

(注:CLI test 跑前需 `pnpm build`;ENOENT 用例 aggregator unit test 已覆盖,CLI 上层只是 wrapping,不需重复)

- [ ] **Step 6: 跑测试确认 fail**

```bash
pnpm build && pnpm vitest run tests/cli/scope-cli.test.ts
```
Expected: 全 fail(scope 子命令未注册)

- [ ] **Step 7: 写 CLI scope 命令**

```typescript
// src/cli/commands/scope.ts
// plan-9b Task 5 — forge scope <sub>

import { Command } from 'commander';
import { join } from 'node:path';
import { scanArchivedFollowups } from '../../core/scope/index.js';

export function buildScopeCommand(): Command {
  const scope = new Command('scope').description('out-of-scope / future-work / non-goal 跨 change 工具');

  scope
    .command('scan-archived-followups')
    .description('扫 archived YAML 块输出 active entries(JSON)')
    .argument('<changeId>', '新 change 的 id(供日志显示,不参与扫描)')
    .action(async (_changeId: string) => {
      try {
        const forgeRoot = join(process.cwd(), 'forge');
        const result = await scanArchivedFollowups(forgeRoot);
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`✗ scope scan-archived-followups failed: ${msg}\n`);
        process.exit(2);
      }
    });

  return scope;
}
```

- [ ] **Step 8: 注册到 src/cli/index.ts**

```typescript
// src/cli/index.ts — 加 import 与注册
import { buildScopeCommand } from './commands/scope.js';
// ... 其他注册行之后:
program.addCommand(buildScopeCommand());
```

- [ ] **Step 9: build + 跑 CLI test 确认 pass**

```bash
pnpm build && pnpm vitest run tests/cli/scope-cli.test.ts
```
Expected: 2/2 PASS(ENOENT placeholder 不算)

- [ ] **Step 10: typecheck + commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
git add src/core/scope/ src/cli/commands/scope.ts src/cli/index.ts \
        tests/core/scope/aggregator.test.ts tests/cli/scope-cli.test.ts
git commit -m "feat(9b): forge scope scan-archived-followups CLI(design §2.6.5)

scanArchivedFollowups 扫 archive/*/{proposal,design}.md 内 anchor 三段 yaml,
聚合 status=active entries,扣 superseding_entries 走的,按 future>oos>non-goal 排序。
CLI: exit 0 + JSON to stdout / exit 2 + stderr on archive 不可读(沿 §3.12.3)。"
```

---

## 7. Task 6 — `commands/propose.md` slash 升级

**Files:**
- Modify: `commands/propose.md`(仓库根的 slash 模板,沿 copy-templates.mjs 同步链 source of truth)

**Goal**:slash `/forge:propose` 模板加两条新指示:(a) 产 proposal.md / design.md 时**必须**带 `{#forge-oos}` / `{#forge-non-goals}` / `{#forge-future-work}` anchor;(b) 启动新 change 时调 `forge scope scan-archived-followups <new-id>` + 用 AskUserQuestion 提示 + 把用户决策写到 proposal.md 的 `superseding_entries` YAML 块。

- [ ] **Step 1: 读现有 propose.md**

Read: `D:/ClaudeProject/opsp/forge-repo/commands/propose.md`

(已读过,内容沿 src/core/templates/commands/propose.md 同款 — copy-templates 反向同步,根目录是 source of truth)

- [ ] **Step 2: 修改 propose.md 加 anchor + scan 段**

替换内容,在"## 步骤(必须按序)"之前加上"## 前置 — Pending follow-ups 扫描"段,在产 proposal.md 步骤里强调 anchor。最终版本(见下):

```markdown
---
description: 把 draft(可选)转化为 forge/changes/<id>/ 下的 4 件套(proposal + specs + design + tasks)
argument-hint: '<change-id> [--from-draft <date-topic>] [--light]'
---

You are about to handle `/forge:propose $ARGUMENTS`.

解析参数:

- 第一个 token 是 `<change-id>`(slug,小写连字符)
- 可选 `--from-draft <date-topic>` 指定要消费的 draft 文件(对应 `forge/drafts/<date-topic>.md`)
- **可选 `--light`**:强制 writing-plans skill 走 light mode(沿 v0.3 P3)

## 前置 — Pending follow-ups 扫描(plan-9b §2.6.5)

**在产 proposal/design/tasks 之前**,先扫 archived changes 的 out-of-scope / future-work / non-goal:

1. 跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" scope scan-archived-followups <change-id>`(若 helper 不可用,fallback 调本地 `npx forge scope scan-archived-followups <change-id>`)
2. 解析 stdout JSON;若 `entries` 为空 → 跳过本段直接进步骤 1
3. 若非空 → 用 AskUserQuestion 渲染:
   - 按 `category` 分组(future-work / out-of-scope / non-goal),沿 §2.6.5 优先级排序
   - 标题:"## Pending follow-ups from archived changes (N active)"
   - 每个 entry 显示:`[source_change] id — description`
   - 每项 4 选项:`inherit`(本 change 做)/ `acknowledge but defer`(留 active)/ `mark obsolete` / `mark superseded by some other change`
4. 用户决策聚合,**`inherit` 项写到本 change 自己的 `## Out of Scope/Future Work` YAML 块**(本 change 实施时它就是新 entry,加 `triggered_by: {source: "from-archived", id: "<source_change>::<entry_id>"}` 跟踪来源);**`mark superseded` / `mark obsolete` 项写到 `superseding_entries` 数组**(每项含 source_change / entry_id / new_status / rationale)
5. `acknowledge but defer` 不写(留原 archived entry 仍 active,下次再问)

**不强制** — 用户可全跳过 / 部分处理。但**必须**显式提示,不能静默忽略。

## 步骤(必须按序)

1. **若提供了 `--from-draft <name>`**:
   - 读 `forge/drafts/<name>.md`(若不存在,**报错并停止**:"draft 不存在: forge/drafts/<name>.md。可用 draft: " + 列出 `forge/drafts/*.md`)
   - 把 draft 内容作为后续 writing 的输入上下文
2. **读 `forge/config.yaml`** 提取 `context`(tech stack)和 `rules.{proposal,specs,design,tasks}`,把这些作为系统提示注入后续 skill。
3. **必须调用 `forge:writing-plans` skill** 来产出 tasks。
4. 产出文件到 `forge/changes/<change-id>/`(如目录已存在且非空,**报错并停止**:"change 已存在: forge/changes/<change-id>/。请改 change-id 或删除已有目录"):
   - `proposal.md` — H1 标题 + Why + What + Scope
     - **必须**含 `## Out of Scope {#forge-oos}` 段(沿 plan-9b §2.6.3);若本 change 没有 out-of-scope 项,该段仅占位 anchor 无 YAML 块(合法)
     - **必须**含 `## Non-Goals {#forge-non-goals}` 段(同上)
     - 若上面 §"前置"步骤 4 收集到 `inherit` / `superseding_entries` 决策 → 写入对应段的 `forge-scope-entries/v1` YAML 块
   - `specs/<sub-area>.md` — 每个改动域一个文件,Given/When/Then 三段格式(spec deltas)
   - `design.md` — H1 标题 + 技术方案 + 数据模型 + 接口设计;**必须**含 `## Future Work {#forge-future-work}` 段(同上,可仅占位)
   - `tasks.md` — checkbox 任务列表,粒度 2-5 分钟一步,采用 forge:writing-plans skill 的 task 结构
5. **若有 `--from-draft`**:把 draft 移到 `forge/drafts/.consumed/<name>.md`(filesystem chmod 444 只读)。
6. 跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" validate <change-id>` 确认 4 件套完整 + scope YAML 合规(沿 plan-9b §2.6.8;若 helper 不可用 改用 skill 内嵌 fenced bash 调 helper,见 Plan 3 Task 3.3)。**若 validate 失败,根据错误回去补,不要把不完整产物留下**。

## 禁止行为

- 不允许跳过 `forge:writing-plans` skill 直接写 tasks.md(skill 内置 self-review,跳过会漏 placeholder 检查)
- 不允许把任何东西写到 `forge/specs/`(那是 archive 内部 sync 的输出)
- 不允许在 `forge/changes/<id>/` 之外创建产物文件
- **不允许省略三段 anchor**(plan-9b §2.6.3):缺 `{#forge-oos}` / `{#forge-non-goals}` / `{#forge-future-work}` 会让 content_hash 把 follow-up 编辑算进 marker 失效,违反 §2.6.3 解耦
- **不允许把 archived followups 决策静默丢弃**:若 scan 输出非空,必须走 AskUserQuestion 让用户做决策
```

- [ ] **Step 3: 跑 copy-templates 把根目录改动同步进 src/core/templates 与 dist/**

```bash
node scripts/copy-templates.mjs
```
Expected: 输出"synced X commands"

- [ ] **Step 4: 验证 src/core/templates/commands/propose.md 已更新**

Run: `diff commands/propose.md src/core/templates/commands/propose.md`
Expected: 无差异

- [ ] **Step 5: commit**

```bash
git add commands/propose.md src/core/templates/commands/propose.md dist/core/templates/commands/propose.md
git commit -m "docs(9b): propose.md slash 加 anchor + Pending follow-ups 扫描

§\"前置\" 段:调 forge scope scan-archived-followups,AskUserQuestion 选 inherit/defer/obsolete/superseded
步骤 4:proposal.md 强制 forge-oos/forge-non-goals 段;design.md 强制 forge-future-work 段
禁止行为:省略 anchor / 静默丢弃 archived followups 决策"
```

---

## 8. Task 7a — `skills/_shared/scope-category-guidance.md` + copy-templates fail-fast + receiving-code-review reference(v2 修订:Task 7 拆 7a + 7b)

**Files:**
- Create: `skills/_shared/scope-category-guidance.md`
- Modify: `scripts/copy-templates.mjs`(扩展同步 `skills/_shared/*.md` → `src/core/templates/skills/_shared/` + `dist/core/templates/skills/_shared/`;**v2 codex MAJOR 4 修订:_shared 缺失 fail-fast,不允许 graceful skip**)
- Modify: `skills/receiving-code-review/SKILL.md`(加 §"区分指引" cross-ref)
- 注:`skills/verifying-three-dimensions/SKILL.md`(9d 创建)和 `skills/exploring/SKILL.md`(9f 创建)自行 cross-ref,**本 plan 不创建这两个 skill**

**Goal**:产出 `skills/_shared/scope-category-guidance.md` 共用区分指引文档(沿 design §2.6.6 表),被 receiving-code-review + 未来 9d/9f 三 skill cross-reference。同时把 `_shared/` 路径接入 `copy-templates.mjs` 反向同步链(进 src/core/templates/ + dist/);**v2 修订:_shared 缺失 fail-fast 而非 graceful skip — 防止 release CI 静默缺漏**。

**注意**:此 task 完成后 `_shared/scope-category-guidance.md` 已进 `src/core/templates/skills/_shared/` 和 `dist/core/templates/skills/_shared/`,但**还没接入 harness-adapters 部署链** — adapter 把 templates 铺到项目级 `.claude/skills/forge-<name>/` 仅认 SKILL_NAMES 13 个 skill,不认 _shared。Adapter 接入在 Task 7b 完成。

- [ ] **Step 1: 写 skills/_shared/scope-category-guidance.md**

```markdown
---
title: Scope Category Guidance
description: AI 判定指引 — 找到一个"未实施项",该写到哪里(SUGGESTION / Future Work / Out of Scope / Non-Goal)
source-of-truth: forge v1.0 design §2.6.6
---

# Scope Category Guidance

> 此文档是 `skills/_shared/` 下的共用 reference,由 `forge:receiving-code-review` / `forge:verifying-three-dimensions` / `forge:exploring` 三 skill 引用。不要把这表抄到各 skill — 集中维护避免漂移。

## 决策表(沿 design §2.6.6)

当你识别出一个"未在本 change 实施的事项",按下表四选一,不要默认塞 SUGGESTION:

| 状态 | 写到 | 语义 | 判定指引(关键词) |
|---|---|---|---|
| **应在本 change 做但低优先级** | `verify_findings` / `review_outcomes` 的 `SUGGESTION` finding | 本 change 内的 nice-to-have,可不做 | "可定位 + 可修复 + 不做也不影响本 change 核心目标"(例:补一处 log message 措辞 / 加一个 edge case 测试) |
| **本 change 不做,未来可能做** | `design.md` `## Future Work {#forge-future-work}` 段的 `forge-scope-entries/v1` YAML 块 | 跨 change 长期 backlog | "实施会扩 scope,但目标方向一致"(例:本 change 加 OAuth 基础,refresh-token-grace-period 留 future-work) |
| **本 change 不做,原则反对做** | `proposal.md` `## Non-Goals {#forge-non-goals}` 段的 YAML 块 | 反目标 | "实施会偏离项目方向 / 违反核心约束"(例:加密产品不接受"明文密码可选项") |
| **本 change 不做,无强烈意见** | `proposal.md` `## Out of Scope {#forge-oos}` 段的 YAML 块 | 中性 out-of-scope | "明显不属于本 change 但未来可能做也可能不做"(例:本 change 加 password-reset,SSO/SAML 不属于但不反对) |

## 常见误判 → 修正

| AI 倾向 | 修正 |
|---|---|
| 把所有"不做"塞 SUGGESTION 持挂 | SUGGESTION 应**只**用于"本 change 内 nice-to-have";跨 change 项必须走 out-of-scope/future-work/non-goal |
| 把"未来可能做"标 Non-Goal | Non-Goal 是**反对**做;不确定的项应走 Future Work 或 Out of Scope |
| 给 `## Out of Scope` 段填一句话不写 YAML 块 | OK — 但若有具体项,**必须**写 forge-scope-entries/v1 YAML 块带 reason(沿 plan-9b §2.6.3 reason 必填) |
| 编 entry 的 `reason` 为空 / 写"未来再说" | reason 是 forge 比 OpenSpec 强制升级的字段;空 reason 会被 `forge validate` 拒签为 CRITICAL |
| 用本地化标题就改 anchor ID | **anchor ID 是契约**,标题文字可改(`## 不做项 {#forge-oos}`),但 `{#forge-oos}` 不可改 |

## Fence 反向加固(`/forge:archive`)

archive 阶段若发现 SUGGESTION > 5 项 或 SUGGESTION 中含关键词(`future` / `later` / `outside scope` / `未来` / `后续` / `超出` / `另外`),给 deprecation warning 提示考虑推到 `## Future Work` / `## Out of Scope`。**仅 warning,不阻断**(沿 design §2.3 SUGGESTION 不要求 ack)。

## Cross-reference

- 数据 schema:`src/core/schemas/scope-entries.ts`(`forge-scope-entries/v1`)
- 锚点契约:`{#forge-oos}` / `{#forge-non-goals}` / `{#forge-future-work}`(沿 design §2.6.3)
- 跨 change 扫描:`forge scope scan-archived-followups <change-id>`(沿 design §2.6.5)
```

- [ ] **Step 2: 扩展 copy-templates.mjs 同步 `_shared/`(v2 修订:fail-fast)**

修改 `scripts/copy-templates.mjs`,在 `syncSkills()` 后加 `syncSharedSkillDocs()`,**_shared 缺失 fail-fast**:

```javascript
// scripts/copy-templates.mjs — 在 syncCommands() 上面加新函数

// 同步 skills/_shared/*.md → src/core/templates/skills/_shared/ → dist/core/templates/skills/_shared/
// plan-9b §2.6.8:跨 skill 共用 reference(被 receiving-code-review / verifying-three-dimensions / exploring 引用)
// v2 codex MAJOR 4 修订:_shared 缺失 fail-fast — 防止 release CI 静默缺漏 runtime 404
async function syncSharedSkillDocs() {
  const srcDir = join(REPO_ROOT, 'skills', '_shared');
  if (!existsSync(srcDir)) {
    console.error(`✗ skills/_shared/ 缺失:${srcDir}`);
    console.error('  plan-9b §2.6.8 要求 _shared 目录在部署清单中存在;请检查是否被误删');
    process.exit(1);
  }
  const mdFiles = (await readdir(srcDir)).filter((n) => n.endsWith('.md'));
  if (mdFiles.length === 0) {
    console.error(`✗ skills/_shared/ 为空:期望至少含 scope-category-guidance.md(plan-9b 交付)`);
    process.exit(1);
  }

  const srcTemplatesDir = join(REPO_ROOT, 'src', 'core', 'templates', 'skills', '_shared');
  await mkdir(srcTemplatesDir, { recursive: true });
  await clearMarkdownFiles(srcTemplatesDir);
  for (const name of mdFiles) {
    const content = await readFile(join(srcDir, name), 'utf8');
    await writeFile(join(srcTemplatesDir, name), content, 'utf8');
  }

  const distDir = join(REPO_ROOT, 'dist', 'core', 'templates', 'skills', '_shared');
  await mkdir(distDir, { recursive: true });
  for (const name of mdFiles) {
    const content = await readFile(join(srcDir, name), 'utf8');
    await writeFile(join(distDir, name), content, 'utf8');
  }

  console.log(`✓ synced ${mdFiles.length} shared skill docs (skills/_shared/ → src/core/templates/skills/_shared/ + dist/)`);
  return mdFiles;
}

// 顶层调用部分(文件末尾):
await syncSkills();
await syncSharedSkillDocs(); // plan-9b §2.6.8(v2 修订:fail-fast)
await syncCommands();
```

- [ ] **Step 3: 跑 copy-templates 同步**

```bash
node scripts/copy-templates.mjs
```
Expected:
- "✓ synced X skills..."
- "✓ synced 1 shared skill docs..."
- "✓ synced X commands..."

- [ ] **Step 4: 修改 skills/receiving-code-review/SKILL.md cross-ref**

Read `skills/receiving-code-review/SKILL.md`,在文件末尾(或合适位置)加段:

```markdown
## Scope Category Guidance(plan-9b 共用 reference)

判定一个 review 意见应走 SUGGESTION 还是 `## Out of Scope` / `## Future Work` / `## Non-Goals` 时,**先参考共用决策表**:`skills/_shared/scope-category-guidance.md`(plugin runtime 下:`_shared/scope-category-guidance.md`)。

特别注意 §"常见误判 → 修正"段 — 不要默认把所有"不做"塞 SUGGESTION;跨 change 项应走 out-of-scope / future-work / non-goal,沿 `forge-scope-entries/v1` YAML 块。
```

- [ ] **Step 5: 跑 copy-templates 把 receiving-code-review 改动同步**

```bash
node scripts/copy-templates.mjs
```

- [ ] **Step 6: 验证同步结果**

Run: `ls src/core/templates/skills/_shared/ dist/core/templates/skills/_shared/`
Expected: 两处都有 `scope-category-guidance.md`

Run: `diff skills/_shared/scope-category-guidance.md src/core/templates/skills/_shared/scope-category-guidance.md`
Expected: 无差异

Run: `grep "Scope Category Guidance" skills/receiving-code-review/SKILL.md src/core/templates/skills/receiving-code-review.md`
Expected: 两处都命中

- [ ] **Step 7: commit**

```bash
git add skills/_shared/ scripts/copy-templates.mjs skills/receiving-code-review/SKILL.md \
        src/core/templates/skills/ dist/core/templates/skills/
git commit -m "feat(9b): skills/_shared/scope-category-guidance.md + copy-templates _shared/ 同步(Task 7a)

- scope-category-guidance.md:design §2.6.6 决策表 + 常见误判修正 + cross-ref
- copy-templates.mjs syncSharedSkillDocs():_shared/*.md → src/core/templates/skills/_shared/ + dist/
  v2 codex MAJOR 4 修订:_shared 缺失或为空 fail-fast(exit 1)而非 graceful skip
- receiving-code-review/SKILL.md:加 §\"Scope Category Guidance\" cross-ref _shared 文档
- 9d/9f 创建新 skill 时自行 cross-ref(本 plan 不创建)
- 部署链接入 Task 7b(adapter 铺到项目级 .claude/skills/forge-_shared/)"
```

---

## 9. Task 7b — harness-adapters 接 sharedDocs 部署链 + `forge update` 接入 + smoke(v2 codex MAJOR 4 新增 task)

**Files**(v3 codex review MAJOR 2 修订:收敛范围 — OpenCode adapter 不存在于现状 codebase,删除 opencode 改动;留到 OpenCode adapter 独立建立后再补 sharedDocs 部署):
- Modify: `src/core/harness-adapters/types.ts`(加 `SharedDocSpec` + `DeployInput.sharedDocs`)
- Modify: `src/core/harness-adapters/claude.ts`(plan() 把 sharedDocs 铺到 `.claude/skills/forge-_shared/<name>.md`)
- Modify: `src/core/harness-adapters/codex.ts`(plan() 把 sharedDocs 铺到 codex adapter 当前 skill 部署位置下的 `_shared/` 子目录,实施时按 codex.ts:30+ 现状对齐路径)
- Modify: `src/core/templates/skills/index.ts`(加 `loadAllSharedDocs()` API)
- Modify: `src/cli/commands/update.ts`(`forge update` 调 loadAllSharedDocs 传入 DeployInput.sharedDocs)
- Modify: `tests/cli/update.test.ts`(已存在 — 追加 smoke 验 `.claude/skills/forge-_shared/scope-category-guidance.md` 落地)

**Goal**:把 `_shared/scope-category-guidance.md` 接入 harness-adapters 部署链。**2 个 adapter**(claude / codex)`plan()` 时把 `input.sharedDocs` 铺到对应 harness 的 _shared 位置:
- Claude Code:`.claude/skills/forge-_shared/<name>.md`
- Codex CLI:沿现有 codex adapter skill 部署位置 + `/forge-_shared/`(实施时按 codex.ts:30+ 现状对齐)

`forge update` 命令(active 部署命令)调 `loadAllSharedDocs()` 把所有 `_shared/*.md` 传入 `DeployInput.sharedDocs`,跑 plan() 部署。Smoke test 验证落地。

**注意**:
- `forge init` 在 v1.2 移除(沿 init.ts:38 deprecation),9b 不为 forge init 加 smoke;仅 `forge update`(active 命令)走完整 smoke
- **OpenCode adapter 现状不存在**(`ls src/core/harness-adapters/` 仅含 claude / codex / detector / hash-compare / index / interface / legacy-detector / transaction / types,**无 opencode.ts**)。v3 收敛 7b 仅 claude + codex;OpenCode sharedDocs 部署留到 OpenCode adapter 整体建立后(v1.1 / 独立 issue)处理

- [ ] **Step 1: 扩展 types.ts 加 SharedDocSpec + DeployInput.sharedDocs**

```typescript
// src/core/harness-adapters/types.ts(追加)

/** 共用 skill reference doc(plan-9b §2.6.8;被多 skill cross-ref) */
export interface SharedDocSpec {
  /** doc 名(如 'scope-category-guidance');完整文件名是 `<name>.md` */
  name: string;
  /** markdown 内容 */
  content: string;
}

export interface DeployInput {
  projectRoot: string;
  skills: SkillSpec[];
  commands: CommandSpec[];
  /** v2 plan-9b 新增:共用 skill reference docs(铺到 _shared 子目录) */
  sharedDocs?: SharedDocSpec[];
}
```

- [ ] **Step 2: 修 claude.ts adapter plan() 铺 sharedDocs**

```typescript
// src/core/harness-adapters/claude.ts — plan() 内部追加:
async plan(input: DeployInput): Promise<DeployPlan> {
  const files: PlannedFile[] = [];
  for (const skill of input.skills) {
    files.push({
      relPath: `.claude/skills/forge-${skill.name}/SKILL.md`,
      content: skill.content,
    });
  }
  for (const cmd of input.commands) {
    files.push({
      relPath: `.claude/commands/forge/${cmd.name}.md`,
      content: cmd.content,
    });
  }
  // v2 plan-9b Task 7b:共用 reference docs 铺到 forge-_shared/ "skill-like" 容器
  // 命名约定:.claude/skills/forge-_shared/<name>.md(沿 forge-<name> 风格;_shared 是合法 skill name 字面)
  for (const doc of input.sharedDocs ?? []) {
    files.push({
      relPath: `.claude/skills/forge-_shared/${doc.name}.md`,
      content: doc.content,
    });
  }
  return { files };
}
```

类似修改 `codex.ts`(v3 修订:仅 codex,不动 opencode.ts — 现状不存在),路径按 codex.ts 的 skill 安装位置对齐(实施时读 codex.ts 确认现状)。

- [ ] **Step 3: 修 templates/skills/index.ts 加 loadAllSharedDocs()**

```typescript
// src/core/templates/skills/index.ts(追加)

import { readdir } from 'node:fs/promises';

/** 加载 _shared/*.md 全部 reference docs(plan-9b §2.6.8) */
export async function loadAllSharedDocs(): Promise<Array<{ name: string; content: string }>> {
  const sharedDir = join(__dirname, '_shared');
  let entries: string[];
  try {
    entries = await readdir(sharedDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const mdFiles = entries.filter((n) => n.endsWith('.md'));
  return Promise.all(
    mdFiles.map(async (filename) => ({
      name: filename.replace(/\.md$/, ''),
      content: await readFile(join(sharedDir, filename), 'utf8'),
    })),
  );
}
```

- [ ] **Step 4: 修 update.ts CLI 传 sharedDocs**

```typescript
// src/cli/commands/update.ts — 在调 adapter.plan() 前加:
import { loadAllSkills, loadAllSharedDocs } from '../../core/templates/skills/index.js';

// ...在构造 DeployInput 的地方:
const sharedDocs = await loadAllSharedDocs();
const input: DeployInput = { projectRoot, skills, commands, sharedDocs };
const plan = await adapter.plan(input);
// 后续 apply plan 已有,不改
```

(若现有 update.ts 没用 loadAllSkills 而是其他 API,实施时按 update.ts 实际现状 align;关键是把 sharedDocs 注入 DeployInput)

- [ ] **Step 5: 写 smoke test**

```typescript
// tests/cli/update.test.ts(追加;若不存在新建)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const CLI = join(process.cwd(), 'dist', 'cli', 'index.js');

describe('forge update — sharedDocs 部署(v2 plan-9b Task 7b smoke)', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'forge-update-shared-'));
    await mkdir(join(projectRoot, '.claude'), { recursive: true });
    // v4 codex 三轮 BLOCKER 2 修订:写 forge/config.yaml 必须含 harness 列表,
    // 否则 update.ts:55-59 会 exit 1(`No harness configured`)
    await mkdir(join(projectRoot, 'forge'), { recursive: true });
    await writeFile(
      join(projectRoot, 'forge', 'config.yaml'),
      'schema: forge-config/v1\nharness:\n  - claude\n',
    );
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('forge update 把 scope-category-guidance.md 铺到 .claude/skills/forge-_shared/', () => {
    execFileSync('node', [CLI, 'update'], { cwd: projectRoot, encoding: 'utf8' });
    const expected = join(projectRoot, '.claude', 'skills', 'forge-_shared', 'scope-category-guidance.md');
    expect(existsSync(expected)).toBe(true);
  });

  it('forge update 部署的 scope-category-guidance.md 内容含 design §2.6.6 表', async () => {
    execFileSync('node', [CLI, 'update'], { cwd: projectRoot, encoding: 'utf8' });
    const content = await readFile(
      join(projectRoot, '.claude', 'skills', 'forge-_shared', 'scope-category-guidance.md'),
      'utf8',
    );
    expect(content).toMatch(/Scope Category Guidance/);
    expect(content).toMatch(/Future Work/);
    expect(content).toMatch(/forge-oos/);
  });
});
```

- [ ] **Step 6: build + 跑 smoke 确认 pass**

```bash
pnpm build && pnpm vitest run tests/cli/update.test.ts
```
Expected: 2/2 PASS;若失败常因 update.ts 实际 API 与 plan 不符,按 update.ts 现状 align Step 4 调用

- [ ] **Step 7: typecheck + lint + format + commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
git add src/core/harness-adapters/types.ts \
        src/core/harness-adapters/claude.ts src/core/harness-adapters/codex.ts \
        src/core/templates/skills/index.ts \
        src/cli/commands/update.ts \
        tests/cli/update.test.ts
git commit -m "feat(9b): harness-adapters sharedDocs 部署 + forge update 接入(v2 Task 7b / v3 收敛)

types.ts DeployInput 加 sharedDocs;claude + codex adapter plan() 铺
.claude/skills/forge-_shared/<name>.md(及 codex 对应路径)
loadAllSharedDocs() 加载 src/core/templates/skills/_shared/*.md
update.ts 传 sharedDocs 进 DeployInput
smoke test:forge update → scope-category-guidance.md 落地 + 内容验证
解决 v2 codex MAJOR 4 — _shared 进 runtime 部署链(沿 master BLOCKER 二轮 #8 修订意图)
v3 codex MAJOR 2:OpenCode adapter 现状不存在,留独立 issue;7b 收敛 claude + codex"
```

---

## 10. Task 8 — 集成 fixture + e2e 测试 + verify

**Files:**
- Create: `tests/integration/scope-end-to-end.test.ts`
- Create: `tests/fixtures/scope/archived-with-active-entry/`(目录,含 proposal.md + design.md)
- Create: `tests/fixtures/scope/archived-with-superseding/`(同上)

**Goal**:e2e 测试覆盖整个 9b 链路 — fixture 含 archived change(active entry) + 第二个 archived change(superseding) → 跑 `forge scope scan-archived-followups` → 输出 active entries 扣 superseded 项 → propose.md 加 entry → `forge validate` 通过 → marker 计算 content_hash 在改 forge-oos 段后不变。

- [ ] **Step 1: 准备 fixture(v2 MINOR 2 修订:用常量生成避免字面值耦合)**

```bash
mkdir -p tests/fixtures/scope/archived-with-active-entry
mkdir -p tests/fixtures/scope/archived-with-superseding
```

写两个 fixture 目录的 proposal.md / design.md。**v2 修订**:fixture 中 source_change 字面值会与 e2e cp 目标目录名(如 `2026-05-01-archived-with-active-entry`)耦合;为减少手动对齐,fixture proposal.md 不 hardcode source_change,**改由 e2e 在 cp 后用 string template 写入**(见 Step 2 / Step 3 重写)。

Step 1 仅准备 active entry fixture(superseding 在 e2e 内 string template 生成):

`tests/fixtures/scope/archived-with-active-entry/proposal.md`:

```markdown
# Add OAuth Refresh

## Why

Need refresh token

## What

Implement basic refresh

## Out of Scope {#forge-oos}

```yaml
schema: forge-scope-entries/v1
anchor_id: forge-oos
entries:
  - id: refresh-grace-period
    category: out-of-scope
    description: refresh-token grace period handling
    reason: clock-skew tolerance needs independent spec
    priority: medium
    status: active
    triggered_by: null
    related_change: null
```
```

`tests/fixtures/scope/archived-with-active-entry/design.md`: `# Design\n`

`tests/fixtures/scope/archived-with-superseding/proposal.md`:

```markdown
# Add Refresh Grace Period

## Why

Address refresh-grace-period

## What

Implement grace period

## Out of Scope {#forge-oos}

```yaml
schema: forge-scope-entries/v1
anchor_id: forge-oos
entries: []
superseding_entries:
  - source_change: archived-with-active-entry
    entry_id: refresh-grace-period
    new_status: superseded
    rationale: implemented here
```
```

`tests/fixtures/scope/archived-with-superseding/design.md`: `# Design\n`

- [ ] **Step 2: 写 e2e test**

```typescript
// tests/integration/scope-end-to-end.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, cp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { computeContentHash } from '../../src/core/hash/content.js';

const CLI = join(process.cwd(), 'dist', 'cli', 'index.js');
const FIXTURE_ROOT = join(process.cwd(), 'tests', 'fixtures', 'scope');

// v2 MINOR 2 修订:用常量生成 fixture target 路径,避免字面值耦合
const ACTIVE_CHANGE_DIR = '2026-05-01-archived-with-active-entry';
const SUPERSEDING_CHANGE_DIR = '2026-05-02-archived-with-superseding';
const TARGET_ENTRY_ID = 'refresh-grace-period';

describe('plan-9b end-to-end', () => {
  let projectRoot: string;
  beforeAll(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'forge-9b-e2e-'));
    // 把 active entry fixture cp 到项目 archive
    await cp(
      join(FIXTURE_ROOT, 'archived-with-active-entry'),
      join(projectRoot, 'forge', 'changes', 'archive', ACTIVE_CHANGE_DIR),
      { recursive: true },
    );
    // superseding fixture 不用 fixture 文件,直接用 string template 写,引用 ACTIVE_CHANGE_DIR 常量
    const supersedingDir = join(projectRoot, 'forge', 'changes', 'archive', SUPERSEDING_CHANGE_DIR);
    await mkdir(supersedingDir, { recursive: true });
    await writeFile(
      join(supersedingDir, 'proposal.md'),
      [
        '# Add Refresh Grace Period\n',
        '## Why\n\nAddress refresh-grace-period\n',
        '## What\n\nImplement\n',
        '## Out of Scope {#forge-oos}\n',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries: []',
        'superseding_entries:',
        `  - source_change: ${ACTIVE_CHANGE_DIR}`,
        `    entry_id: ${TARGET_ENTRY_ID}`,
        '    new_status: superseded',
        '    rationale: implemented here',
        '```',
      ].join('\n'),
    );
    await writeFile(join(supersedingDir, 'design.md'), '# Design\n');
  });
  afterAll(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('forge scope scan-archived-followups:active entry 被 superseding 扣 → 严格 ===0(v2 MINOR 2 修订)', () => {
    const out = execFileSync('node', [CLI, 'scope', 'scan-archived-followups', 'new-id'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out);
    expect(parsed.entries).toEqual([]); // 严格断言:active entry 被 superseding 完全扣除
  });

  it('content_hash 稳定性:只改 forge-oos 段不破坏 hash', async () => {
    const changeDir = join(projectRoot, 'forge', 'changes', 'new-id');
    await writeFile(
      join(changeDir, 'proposal.md').replace(/\\/g, '/'),
      [
        '# new',
        '## Why\n\nw',
        '## What\n\nc',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries: []',
        '```',
      ].join('\n'),
      { flag: 'w' },
    ).catch(async () => {
      // changeDir 未建 — 手动创建
      await rm(changeDir, { recursive: true, force: true });
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(changeDir, 'specs'), { recursive: true });
      await writeFile(join(changeDir, 'specs', 'a.md'), '# A\n');
      await writeFile(join(changeDir, 'tasks.md'), '# T\n');
      await writeFile(join(changeDir, 'design.md'), '# D\n');
      await writeFile(
        join(changeDir, 'proposal.md'),
        [
          '# new',
          '## Why\n\nw',
          '## What\n\nc',
          '## Out of Scope {#forge-oos}',
          '',
          '```yaml',
          'schema: forge-scope-entries/v1',
          'anchor_id: forge-oos',
          'entries: []',
          '```',
        ].join('\n'),
      );
    });
    const h1 = await computeContentHash(changeDir);
    // 改 forge-oos 段(加 entry)
    await writeFile(
      join(changeDir, 'proposal.md'),
      [
        '# new',
        '## Why\n\nw',
        '## What\n\nc',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: x',
        '    category: out-of-scope',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );
    const h2 = await computeContentHash(changeDir);
    expect(h1).toBe(h2);
  });

  it('forge validate 通过(scope YAML 合规)', () => {
    // 跑 forge validate <new-id>;期望 exit 0
    let exitCode = 0;
    try {
      execFileSync('node', [CLI, 'validate', 'new-id'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 0;
    }
    expect(exitCode).toBe(0);
  });

  it('forge validate 拒签:scope YAML 缺 reason 字段 → exit 1(v4 codex 三轮 BLOCKER 3 修订,沿 v3 B2 业务 CRITICAL → exit 1)', async () => {
    const changeDir = join(projectRoot, 'forge', 'changes', 'bad-id');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(changeDir, 'specs'), { recursive: true });
    await writeFile(join(changeDir, 'specs', 'a.md'), '# A\n');
    await writeFile(join(changeDir, 'tasks.md'), '# T\n');
    await writeFile(join(changeDir, 'design.md'), '# D\n');
    await writeFile(
      join(changeDir, 'proposal.md'),
      [
        '# bad',
        '## Why\n\nw',
        '## What\n\nc',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: x',
        '    category: out-of-scope',
        '    description: d',
        '    reason: ""',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );
    let exitCode = 0;
    let stderr = '';
    try {
      execFileSync('node', [CLI, 'validate', 'bad-id'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 0;
      stderr = ((e as { stderr?: Buffer }).stderr ?? Buffer.from('')).toString();
    }
    expect(exitCode).toBe(1); // v4 修订:CRITICAL business-fail → exit 1
    expect(stderr).toMatch(/reason|CRITICAL/);
  });
});
```

(注:fixture 的 `source_change` 字段需要在实施时与实际目录名对齐,沿 Step 1 的 fixture 文件需在 superseding 那份里写 `source_change: 2026-05-01-archived-with-active-entry` — 即 e2e 把 fixture cp 到的目录名)

- [ ] **Step 3: ~~修正 fixture source_change~~(v2 MINOR 2 修订:删除此步;Step 2 已用常量生成,无 fixture 静态文件需要对齐)**

(原 Step 3 删除;tests/fixtures/scope/archived-with-superseding/ 目录不再需要,可不创建。仅保留 archived-with-active-entry fixture 文件)

- [ ] **Step 4: build + 跑 e2e test**

```bash
pnpm build && pnpm vitest run tests/integration/scope-end-to-end.test.ts
```
Expected: 4/4 PASS

- [ ] **Step 5: 跑全 vitest + format:check + typecheck + lint**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run
```
Expected: 全 PASS,所有现有 + 9b 新增测试全绿

- [ ] **Step 6: commit + 创建 release-gate snapshot(若 release-gate.mjs 有 snapshot 模式)**

```bash
git add tests/integration/scope-end-to-end.test.ts tests/fixtures/scope/
git commit -m "test(9b): scope end-to-end + fixtures(active/superseding/validate-pass/validate-fail)

archived-with-active-entry / archived-with-superseding 两份 fixture
覆盖:scan 扣 superseded / content_hash 稳定性 / validate pass / validate reason-empty CRITICAL"
```

---

## 11. 修订记录

- **v1**(2026-05-11 commit `96b2955`):初稿。沿 master plan §3.2 + §3.12.1bis + §3.12.2 + §3.12.3 锁定的接口写。本 plan 不实施 archive_summary handoff_to_backlog 的真实聚合(那是 9e2),只提供数据源(scanArchivedFollowups)。
- **v4**(2026-05-11):codex 三轮 adversarial review 全采纳(**3 BLOCKER + 1 MINOR + 1 NIT + 5 Confirmed-OK**):
  - **BLOCKER 1 — change.ts no-spec-files 业务错未标 CRITICAL,会按 exit 2 误分类**(v3 修了 proposal/specs/tasks validator 但漏了 change.ts:65 内部直接构造的 `no spec files in specs/` failed() 调用):**v4 修订**:Task 4 Step 6 显式补:`change.ts` 内 `no spec files in specs/` 加 `severity: 'CRITICAL'`(business-fail 不是 fs 错)
  - **BLOCKER 2 — Task 7b smoke test 无 harness 配置直接跑 forge update 会触发 update.ts:55-59 exit 1**(v3 plan 写最小 config 只含 `schema: forge-config/v1`,没 harness 字段;update.ts 要求 `--harness` 参数或 config.yaml `harness` 列表):**v4 修订**:smoke test 的 config.yaml 加 `harness:\n  - claude\n`
  - **BLOCKER 3 — Task 8 e2e 仍断言 scope CRITICAL → exit 2,和 v3 exit 1 目标自相矛盾**(v3 改 CLI exit 0/1/2 但忘改 Task 8 第四用例的 `expect(exitCode).toBe(2)`):**v4 修订**:Task 8 该用例改 `expect(exitCode).toBe(1)`,与 Task 4 Step 7 `hasCritical ? 1 : 2` 一致
  - **MINOR — aggregator 缺 schema warning 仅测 unit stderr,未测 CLI stderr 透出**:**v4 修订**:`tests/cli/scope-cli.test.ts` 加 legacy no-schema archive 用例,用 `tests/cli/helpers.ts:runCli`(spawnSync 模式)断言 exit 0 + stdout entries 空 + stderr 含 `skipping yaml block`
  - **NIT — DoD 仍写 finding_hash 绑定 `validate_run_id`,和 v3 Step 0 移除冲突**:**v4 修订**:DoD 改"绑定**稳定字段** content_hash/git_head/dimension/check_type/severity/automated/evidence/recommendation 8 字段,不允许 ephemeral runId 进 payload"
  - **Confirmed-OK**(v4 验证无需修改):
    - Angle 1:`tests/core/validate/finding-hash.test.ts` **当前不存在**(grep 验证 / Step 0 移除 validate_run_id 不会打断现有 assertion;若实施时该文件已被创建,需更新 assertion)
    - Angle 2:proposal/specs/tasks 现有 failed() 分别 3/6/3 个(共 12 个),plan Step 6 "所有现有 failed() 加 CRITICAL"覆盖足够
    - Angle 3:fs catch 当前无 severity → exit 2 fallback 路径与 master §3.12.3 吻合;`hasCritical ? 1 : 2` 当 errors 全无 severity 时 hasCritical=false 走 exit 2,逻辑闭合
    - Angle 5:`update.ts:87,92,109` 确实调 `a.plan(input)` + `deployAtomic`,Task 7b Step 4 插入点方向正确
    - Angle 6:`update.test.ts` 是 CLI 子进程模式(沿 helpers.ts runCli),sharedDocs 应通过文件落地观测,plan 方向匹配
  - **工日上调**:P50 4.2 → 4.3 / P90 5.2 → 5.4(MINOR + 三 BLOCKER 都是局部修订,不重做 task)
- **v3**(2026-05-11):codex 二轮 adversarial review 全采纳(**2 BLOCKER + 2 MAJOR + 1 NIT + 3 Confirmed-OK**):
  - **BLOCKER 1 — ephemeral runId 进 hash 破坏 finding_hash 去重**(v2 用 `crypto.randomUUID()` 作为 `validate_run_id` 进 hash payload,让同一逻辑 finding 每次 validate 产不同 hash,违反 9a finding_hash 持久 ack 设计意图):**v3 修订**:**跨 9a 接口修订** — `FindingHashPayload` 从 9 字段降为 8 字段(移除 `validate_run_id`);hash 仅绑定稳定字段。`ScopeValidateContext` 去 `runId` 字段。注:master §3.12.1 freeze 表未显式锁 validate_run_id,不动 master。
  - **BLOCKER 2 — validate exit 语义仍把非 scope 业务失败压到 exit 2,违反 master §3.12.3 freeze**(v2 实施只让 scope CRITICAL 走 exit 1,缺 Why / tasks empty 等 business-fail 仍走 exit 2):**v3 修订**:proposal/specs/tasks validator 全部 business-fail error 显式加 `severity: 'CRITICAL'`;`change.ts` 内 fs 错(cannot read X)**不标 severity** + message 加 `[fs]` 前缀;CLI 判定按"任一 CRITICAL → exit 1;否则有 error → exit 2";test 用例从 "missing Why exit 2" 改为 "missing Why exit 1" + 新增 "fs error exit 2"
  - **MAJOR 1 — aggregator 不校验 schema,会接受缺 schema 的 archived YAML**:**v3 修订**:`scanArchivedFollowups` 解析 yaml 块后先校验 `schema === 'forge-scope-entries/v1'`;archived 老 change 缺 schema → `stderr` warning + skip(不阻断聚合,沿 archived 历史不可改原则);加单元测试覆盖缺 schema 用例
  - **MAJOR 2 — Task 7b OpenCode adapter 现状不存在**(`ls src/core/harness-adapters/` 验证):**v3 修订**:Task 7b 收敛 claude + codex,删 opencode.ts 相关 modify;OpenCode sharedDocs 部署留到 OpenCode adapter 独立建立后(v1.1 / 独立 issue)
  - **NIT — DoD 文案仍写"三个顶级字段"漏 schema**:**v3 修订**:改"四个顶级字段(`schema` / `entries` / `superseding_entries` / `anchor_id`)"
  - **Confirmed-OK**(v3 验证我提的疑问无问题,不需修改):
    - B1 OK:`computeContentHash` 不会因缺 proposal/design/tasks/specs 直接 abort(content.ts:17 + 35 + 50,缺 specs/ 跳过 ENOENT,缺顶层文件用 `<MISSING>` 占位);v3 仍保留 try/catch 兜底是合理冗余
    - NEW-3 OK:`parseMarkdown.sections` 按文档扫描顺序 push(markdown.ts:55+65),`j = i + 1` 可靠
    - NEW-5 OK:`tests/cli/update.test.ts` 已存在,plan "追加"可执行
  - **工日上调**:P50 4.0 → 4.2 / P90 5.0 → 5.2;但 master plan 9b 工日表未同步上调(本次仅 0.2d 调整,不更新 master 表节省修订成本;v3 工日差由本 plan §11 修订记录跟踪)
- **v2**(2026-05-11):codex 一轮 adversarial review 全采纳(**2 BLOCKER + 4 MAJOR + 2 MINOR**):
  - **BLOCKER 1 — finding_hash 静态占位失效**(原 v1 Task 4 用 `<validate-static>` 填 9 字段 payload,所有 scope finding 共享同 hash,失去去重/防伪造):**v2 修订**:`validateScopeEntries` 改签名接受 `ScopeValidateContext {runId, contentHash, gitHead}`,从 `validateChange` 传入真实值(`crypto.randomUUID()` + `computeContentHash(changeDir)` + `git rev-parse HEAD`)
  - **BLOCKER 2 — validate exit code 违反 master §3.12.3 freeze**(原 v1 决定"留 9d 收割" — **错**,master §3.12.3 已锁 validate exit 1 = CRITICAL):**v2 修订**:`ValidationError` 加 `severity?: Severity` + `finding_hash?: string` 字段;artifact enum 加 `'scope'`;`validate.ts` CLI 改 exit 0/1/2 三档(CRITICAL → exit 1;其他业务错 → exit 2)
  - **MAJOR 1 — ScopeEntriesBlock 顶级 `schema` 字段 master freeze 漏**:**v2 修订**:同步修 master `2026-05-10-plan-9-v1.0-fusion-completion-master.md` §3.12.1bis 加 `schema | literal 'forge-scope-entries/v1' | required` 行
  - **MAJOR 2 — H3 子标题让 scope 段剔除不完整**(原 v1 Task 3 用 parseMarkdown 的 section.endLine,但 parseMarkdown 任意 level heading 都关 section):**v2 修订**:`stripScopeAnchoredSections` 自己扫 sections,按 `next.level <= sec.level` 算"下一同级或更高级 heading"区间;加 H3 子标题 + H1 边界两个新测试
  - **MAJOR 3 — CLI ENOENT 测试是占位**(原 v1 Task 5 Step 5 `expect(true).toBe(true)`):**v2 修订**:删 placeholder,改 mkdtemp + 不创建 archive 目录 + 真实 execFileSync 跑 CLI + 断言 status===2 + stderr 含 ENOENT
  - **MAJOR 4 — `_shared` 部署链不完整 + graceful skip 隐患**:**v2 修订**:Task 7 拆 7a/7b:
    - 7a:copy-templates 同步 _shared 加 fail-fast(缺失 / 空目录 exit 1)
    - 7b(新增 task):harness-adapters/{claude,codex,opencode}.ts plan() 把 `input.sharedDocs` 铺到项目级 `.claude/skills/forge-_shared/<name>.md`;`templates/skills/index.ts` 加 `loadAllSharedDocs()`;`forge update` 注入 sharedDocs;smoke test 验落地
  - **MINOR 1 — anchor regex 注释误称 CommonMark**:**v2 修订**:注释改为"forge 三 ASCII anchor — 严格 charset 是有意为之,阻止 unicode 绕过 fence"
  - **MINOR 2 — e2e fixture source_change 字面值耦合 + 断言放宽**:**v2 修订**:e2e 用常量 `ACTIVE_CHANGE_DIR` / `SUPERSEDING_CHANGE_DIR` / `TARGET_ENTRY_ID` 生成 superseding fixture(string template),断言改 `===0` 严格匹配
  - **工日上调**:P50 3.5 → 4.0 / P90 4.5 → 5.0;master plan §3.2 表 + §0 总计已同步更新(P50 39.5 / P90 52.5)
- 锁定决策(v1 → v2 沿用,无变化):
  - **scope scan-archived-followups CLI exit code**:0/2(沿 §3.12.3)
  - **路径决策**:`skills/_shared/scope-category-guidance.md`(master BLOCKER 二轮 #8 修订)
  - **content_hash 实施位置**:`src/core/hash/content.ts` 改造,不新建 markers/content-hash.ts(DRY)
  - **propose.md slash**:不强制用户处理 archived followups,仅必须提示;静默丢弃禁止

---

## 12. Self-Review(v2 修订)

### 12.1 Spec coverage(对照 master §3.2 + design §2.6 / §3.12)

| spec 条目 | 实施 task |
|---|---|
| `src/core/schemas/scope-entries.ts`(`forge-scope-entries/v1`,**v2 含 `schema` 顶级字段**) | Task 1 |
| proposal.md / design.md 加 anchor ID 模板 | Task 6 |
| `src/core/markers/content-hash.ts` 修订(anchor 排除三段,**v2 修订:按 level 算区间覆盖 H3 子标题**) | Task 3(改造 `src/core/hash/content.ts`,沿 §11 修订记录) |
| `src/cli/commands/scope.ts scan-archived-followups`(**v2 修订:ENOENT 真实测试**) | Task 5 |
| `commands/propose.md` Pending follow-ups 扫描段 | Task 6 |
| `src/cli/commands/validate.ts` scope YAML schema 校验 + CRITICAL finding(**v2 修订:exit 0/1/2 三档 + finding_hash 真实绑定**) | Task 4 |
| `skills/_shared/scope-category-guidance.md` + copy-templates 扩展 + receiving-code-review reference(**v2 修订:fail-fast**) | Task 7a |
| harness-adapters sharedDocs 部署链 + `forge update` 接入(**v2 新增**) | Task 7b |
| 单元测试 + smoke + e2e(anchor 识别 / content_hash 排除 / H3 子标题 / superseding forward-reference / scope YAML parse / category 区分 / validate exit 1 / scope ENOENT / forge update 部署 _shared) | Task 1-5 + Task 7b + Task 8 |
| §3.12.1bis 四 schema 顶级字段冻结(含 `schema`)| Task 1 |
| §3.12.2 `skills/_shared/` 路径 | Task 7a + 7b |
| §3.12.3 scope scan-archived-followups exit code(0/2)+ **validate exit code(0/1/2)** | Task 4 + Task 5 |

**结论**:全部 master §3.2 + 锁定接口都被 task 覆盖。9 个 task(v1 8 个 + v2 拆 Task 7 为 7a/7b)。

### 12.2 Placeholder scan(v2)

| 风险点 | 状态 |
|---|---|
| TBD / TODO / "implement later" 字符串 | 全文 grep 无命中 |
| "add appropriate error handling" 类抽象指示 | 无 |
| 缺测试代码的 step | 无 |
| placeholder 断言(`expect(true).toBe(true)`)| **v2 已删除**(Task 5 ENOENT 真实测) |
| 字面值耦合(fixture source_change)| **v2 已修复**(string template 常量生成) |
| `<=` 放宽断言 | **v2 已严格化**(`expect(...).toEqual([])`)|

### 12.3 Type consistency(v2 含新接口)

| 类型/函数名 | 定义于 | 后续 task 引用 |
|---|---|---|
| `ScopeEntry` / `SupersedingRef` / `ScopeEntriesBlock`(**v2 含 `schema` 顶级**) | Task 1 | Task 4 + Task 5 |
| `SCOPE_ANCHOR_IDS` / `ScopeAnchorId` | Task 1 | Task 3 / Task 4 / Task 5 |
| `ANCHOR_TO_CATEGORY` | Task 1 | Task 4 |
| `parseFencedYamlBlocks` / `FencedYamlParseError` | Task 2 | Task 4 + Task 5 |
| `Section.anchor` | Task 2 | Task 3 / Task 4 / Task 5 |
| `computeFindingHash` | 9a 已立 | Task 4 |
| `ScopeValidateContext`(**v2 新增**) | Task 4 | (内部使用) |
| `ValidationError.severity` + `.finding_hash`(**v2 新增字段**) | Task 4 | Task 4 CLI 输出 |
| `AggregatedScopeEntry` / `scanArchivedFollowups` | Task 5 | (9e2 archive_summary handoff 聚合) |
| `SharedDocSpec` + `DeployInput.sharedDocs`(**v2 新增**) | Task 7b | Task 7b adapter plan() + Task 7b smoke |
| `loadAllSharedDocs`(**v2 新增**) | Task 7b | Task 7b update.ts |

**结论**:跨 task 类型 + 函数名一致;`scope-entries.ts` 是 single source of truth,后续 sub-plan(9e2 / 9f / 9d)reference 不重定义。

### 11.2 Placeholder scan

| 风险点 | 状态 |
|---|---|
| TBD / TODO / "implement later" 字符串 | 全文 grep 无命中 |
| "add appropriate error handling" 类抽象指示 | 无 |
| 缺测试代码的 step | 无;每个 step 都附完整代码 + Run 命令 + Expected |
| "Similar to Task N" 重复引用 | 无 |
| Step 描述不含具体 code block | 仅 Task 5 Step 5 ENOENT placeholder 用例标了 `expect(true).toBe(true)` placeholder — 因为该用例在 unit test 已覆盖,这里仅作 CLI 层 wrapping 校验;实施者可删除该用例 |

### 11.3 Type consistency

| 类型/函数名 | 定义于 | 后续 task 引用 |
|---|---|---|
| `ScopeEntry` / `SupersedingRef` / `ScopeEntriesBlock` | Task 1 | Task 4(validateScopeEntries 接受)/ Task 5(aggregator 解析) |
| `SCOPE_ANCHOR_IDS` / `ScopeAnchorId` | Task 1 | Task 3(content hash 剔除)/ Task 4(validate 命中)/ Task 5(aggregator 扫描) |
| `ANCHOR_TO_CATEGORY` | Task 1 | Task 4(category 一致性校验) |
| `parseFencedYamlBlocks` / `FencedYamlParseError` | Task 2 | Task 4 + Task 5 复用 |
| `Section.anchor` | Task 2(modify) | Task 3 / Task 4 / Task 5 |
| `computeFindingHash` | 9a 已立 | Task 4 |
| `AggregatedScopeEntry` / `scanArchivedFollowups` | Task 5 | (9e2 archive_summary handoff 聚合时会引用) |

**结论**:跨 task 类型 + 函数名一致;无 `clearLayers` vs `clearFullLayers` 风险。
