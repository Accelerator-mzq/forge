# Backlog Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 forge 加一个 `forge/backlog/` 注册表 —— `/forge:archive` 时自动把跨 change 的未决 scope-entry 聚合成人类可读的 `active.md` + `archived.md`,让开发者一处掌握「项目还剩多少待办」。

**Architecture:** 复用既有 `ScopeEntry` / `SupersedingRef` / `aggregator.ts`,只补三层:① `aggregator.ts` 扩展返回 superseding 明细 + skipped 坏块 + `new_status` 守卫;② 新 `src/core/backlog/` 模块做 warning 派生 + markdown 渲染 + 落盘;③ `forge backlog` CLI + archive 接入。零冻结 schema 改动。

**Tech Stack:** TypeScript (ESM, `.js` import 后缀)、commander、vitest、pnpm。

**权威 spec:** `docs/specs/2026-05-15-backlog-registry-design.md`(v6,经 5 轮 Codex 审查收敛)。本计划实现该 spec,章节号 §N 均指 spec。本计划 v5 经 Codex 对抗性审查四轮处置,round 4 收敛(0 HIGH 0 MEDIUM;见末节)。

**通用约定:**

- 所有 commit message 末尾加一行:`Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`。
- 单测试文件跑法:`pnpm vitest run <path>`;按名:`pnpm vitest run <path> -t "<子串>"`。
- 改 `commands/*.md` 后**必须** `pnpm build`(双源 md5 sync,见仓库 CLAUDE.md);改完跑 `pnpm format:check`。
- **`dist/` / `dist-bundled/` 是 gitignored 构建产物 —— 任何 commit 都不要 `git add dist/`。** `src/core/templates/` 进 git,改 `commands/*.md` + build 后需提交它。
- 代码注释用中文(仓库 CLAUDE.md 要求)。

---

## File Structure

| 文件 | 责任 | 任务 |
| --- | --- | --- |
| `src/core/scope/aggregator.ts` | 扫 archived → `entries` + `superseding` + `skipped`;`new_status` 守卫 | 1 |
| `src/core/backlog/render.ts` | 纯函数:派生 `BacklogWarning[]` + 选 tombstone + 渲染两份 markdown | 2,3,4 |
| `src/core/backlog/index.ts` | orchestration:聚合 → 渲染 → 写盘(含 README 首写)+ staleness 比对 | 5 |
| `src/core/backlog/assets/backlog-readme.md` | `forge/backlog/README.md` 静态模板 | 5 |
| `src/cli/commands/backlog.ts` | `forge backlog` / `list` / `--check` 子命令组 | 6 |
| `src/cli/index.ts` | 注册 `buildBacklogCommand()` | 6 |
| `src/cli/commands/archive.ts` | archive 成功后调 `generateBacklog`(step 6.5) | 7 |
| `commands/propose.md` | step 4 菜单补 `mark completed`;修 inherit 分支(§9a/§9b) | 8 |
| `commands/archive.md` / `src/core/archive/summary-render.ts` / `src/core/schemas/archive-summary.ts` | 「handed off to backlog」文案清理 + 注释更新 + backlog 产物说明(§2.3) | 9 |

任务依赖顺序:1 → 2 → 3 → 4 → 5 → 6 → 7;8、9 独立(可任意时点做)。

---

## Task 1: 扩展 aggregator —— superseding 明细 + skipped + new_status 守卫

**Files:**
- Modify: `src/core/scope/aggregator.ts`
- Test: `tests/core/scope/aggregator.test.ts`

实现 spec §3.2 + §9(c)。当前 `scanArchivedFollowups` 把 superseding 收进局部 Set 后丢弃明细、坏块只走 stderr、扣减不看 `new_status`。本任务改为:保留 `SupersedingDetail[]`、结构化 `SkippedBlock[]`、扣减加 `new_status ∈ 4 枚举` 守卫。

- [ ] **Step 1: 写失败测试 —— superseding 明细 + new_status 守卫 + skipped**

追加到 `tests/core/scope/aggregator.test.ts`(沿用文件顶部既有 `makeArchive` helper):

```typescript
  // ---- plan-backlog-registry Task 1 ----
  function ossBlock(entriesYaml: string, supersedingYaml = ''): string {
    return [
      '# Proposal',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      entriesYaml,
      supersedingYaml,
      '```',
      '',
    ].join('\n');
  }

  it('Task1: superseding 明细被保留(含 superseded_in_change / superseded_at / snapshot)', async () => {
    await makeArchive(
      '2026-05-01-a',
      ossBlock(
        'entries:\n  - {id: foo, category: out-of-scope, description: d, reason: r, priority: null, status: active, triggered_by: null, related_change: null}',
      ),
    );
    await makeArchive(
      '2026-05-09-b',
      ossBlock(
        'entries: []',
        'superseding_entries:\n  - {source_change: 2026-05-01-a, entry_id: foo, new_status: completed, rationale: done}',
      ),
    );
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.entries).toHaveLength(0);
    expect(r.superseding).toHaveLength(1);
    expect(r.superseding[0]).toMatchObject({
      source_change: '2026-05-01-a',
      entry_id: 'foo',
      new_status: 'completed',
      superseded_in_change: '2026-05-09-b',
      superseded_at: '2026-05-09',
    });
    expect(r.superseding[0].registry_entry_snapshot?.id).toBe('foo');
  });

  it('Task1: new_status=active 的 superseding 不扣减(§9c 守卫),但仍进 superseding[]', async () => {
    await makeArchive(
      '2026-05-01-a',
      ossBlock(
        'entries:\n  - {id: foo, category: out-of-scope, description: d, reason: r, priority: null, status: active, triggered_by: null, related_change: null}',
      ),
    );
    await makeArchive(
      '2026-05-09-b',
      ossBlock(
        'entries: []',
        'superseding_entries:\n  - {source_change: 2026-05-01-a, entry_id: foo, new_status: active, rationale: bogus}',
      ),
    );
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.entries).toHaveLength(1);
    expect(r.superseding).toHaveLength(1);
    expect(r.superseding[0].new_status).toBe('active');
  });

  it('Task1: 坏 YAML 块进 skipped[](不再静默)', async () => {
    await makeArchive('2026-05-01-a', [
      '# Proposal',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'entries: [unclosed',
      '```',
    ].join('\n'));
    const r = await scanArchivedFollowups(forgeRoot);
    expect(r.skipped).toEqual([
      { change: '2026-05-01-a', file: 'proposal.md', reason: 'yaml-parse-error' },
    ]);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/scope/aggregator.test.ts -t "Task1"`
Expected: FAIL —— `r.superseding` / `r.skipped` 为 undefined。

- [ ] **Step 3: 改 `aggregator.ts`**

把 `src/core/scope/aggregator.ts` 整体替换为下列内容:

```typescript
// src/core/scope/aggregator.ts
// plan-9b Task 5 — 扫 archived YAML 块 + 聚合 active entries + 扣 superseding_entries
// plan-backlog-registry Task 1 — 扩展:保留 superseding 明细 + skipped 坏块 + new_status 守卫

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

/** 一条 superseding 明细 —— 供 backlog tombstone + render 层派生 warning(spec §3.2) */
export interface SupersedingDetail {
  /** 被认领的历史 entry 所在 archived change(目录名) */
  source_change: string;
  /** 被认领的 entry id */
  entry_id: string;
  /** YAML 原始字串,未 cast;合法性在 render 层判(∈ 4 枚举) */
  new_status: string;
  /** 认领论证 */
  rationale: string;
  /** 写下这条 SupersedingRef 的 archived change(认领者,目录名) */
  superseded_in_change: string;
  /** 认领者目录名日期前缀 YYYY-MM-DD;无可解析前缀 → 'unknown' */
  superseded_at: string;
  /** 原 entry 快照;null = 悬空引用 */
  registry_entry_snapshot: ScopeEntry | null;
}

/** 被 skip 的 archived scope 块 —— aggregator 唯一产出的「原始异常」(spec §3.2) */
export interface SkippedBlock {
  /** archived change 目录名 */
  change: string;
  /** proposal.md | design.md */
  file: string;
  reason: 'yaml-parse-error' | 'schema-mismatch';
}

export interface AggregatorResult {
  /** 存活 active(已扣 superseding) */
  entries: AggregatedScopeEntry[];
  /** superseding 明细(plan-backlog-registry) */
  superseding: SupersedingDetail[];
  /** 坏块结构化列表(plan-backlog-registry) */
  skipped: SkippedBlock[];
}

const CATEGORY_ORDER: Record<ScopeCategory, number> = {
  'future-work': 0,
  'out-of-scope': 1,
  'non-goal': 2,
};

/** 合法的 superseding new_status —— 仅这些值参与扣减(§9c 守卫) */
const VALID_SUPERSEDING_STATUS = new Set(['superseded', 'obsolete', 'completed', 'inherited']);

/** 从 archived 目录名取日期前缀;无 YYYY-MM-DD 前缀 → 'unknown' */
function dirnameDate(changeId: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})-/.exec(changeId);
  return m ? m[1] : 'unknown';
}

/**
 * 扫 forgeRoot/changes/archive/<id>/{proposal,design}.md 内 anchor 三段的 fenced YAML 块,
 * 收集 status=active 的 entries,扣已被合法 superseding_entries 走的;
 * 同时保留 superseding 明细与坏块列表。
 *
 * @param forgeRoot 项目内 forge/ 根目录的绝对路径
 * @throws Error 当 forgeRoot/changes/archive/ 不存在时(让 CLI exit 2)
 */
export async function scanArchivedFollowups(forgeRoot: string): Promise<AggregatorResult> {
  const archiveRoot = join(forgeRoot, 'changes', 'archive');
  if (!existsSync(archiveRoot)) {
    throw new Error(`archive 目录不存在(ENOENT): ${archiveRoot}`);
  }

  const archDirs = await readdir(archiveRoot, { withFileTypes: true });
  const collected: AggregatedScopeEntry[] = [];
  const skipped: SkippedBlock[] = [];
  const rawSuperseding: Array<Omit<SupersedingDetail, 'registry_entry_snapshot'>> = [];
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
        if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) {
          continue;
        }
        let blocks: unknown[];
        try {
          blocks = parseFencedYamlBlocks(sec.body);
        } catch (err) {
          if (err instanceof FencedYamlParseError) {
            skipped.push({ change: changeId, file: fname, reason: 'yaml-parse-error' });
            continue;
          }
          throw err;
        }
        for (const block of blocks) {
          // plan-backlog-registry Codex LOW-1:非对象块(null/标量)按 schema-mismatch,避免 b.schema 抛 TypeError
          if (typeof block !== 'object' || block === null) {
            skipped.push({ change: changeId, file: fname, reason: 'schema-mismatch' });
            continue;
          }
          const b = block as {
            schema?: string;
            entries?: ScopeEntry[];
            superseding_entries?: SupersedingRef[];
          };
          if (b.schema !== 'forge-scope-entries/v1') {
            skipped.push({ change: changeId, file: fname, reason: 'schema-mismatch' });
            continue;
          }
          for (const e of b.entries ?? []) {
            if (e.status === 'active') {
              collected.push({ ...e, source_change: changeId });
            }
          }
          for (const sup of b.superseding_entries ?? []) {
            rawSuperseding.push({
              source_change: sup.source_change,
              entry_id: sup.entry_id,
              new_status: String(sup.new_status),
              rationale: sup.rationale,
              superseded_in_change: changeId,
              superseded_at: dirnameDate(changeId),
            });
            // §9c 守卫:只有合法 new_status 才扣减
            if (VALID_SUPERSEDING_STATUS.has(String(sup.new_status))) {
              superseded.add(`${sup.source_change}::${sup.entry_id}`);
            }
          }
        }
      }
    }
  }

  // 回填 snapshot:从内存中已扫的 entries 解析(不重读文件)
  const byKey = new Map<string, AggregatedScopeEntry>();
  for (const e of collected) byKey.set(`${e.source_change}::${e.id}`, e);
  const superseding: SupersedingDetail[] = rawSuperseding.map((s) => ({
    ...s,
    registry_entry_snapshot: byKey.get(`${s.source_change}::${s.entry_id}`) ?? null,
  }));

  const filtered = collected.filter((e) => !superseded.has(`${e.source_change}::${e.id}`));
  filtered.sort((a, b) => {
    const cmp = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (cmp !== 0) return cmp;
    if (a.source_change !== b.source_change) {
      return a.source_change < b.source_change ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { entries: filtered, superseding, skipped };
}
```

- [ ] **Step 4: 跑测试确认通过 + 类型检查**

Run: `pnpm vitest run tests/core/scope/aggregator.test.ts` → PASS(含原有 case + 3 个 Task1 case)
Run: `pnpm typecheck` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/scope/aggregator.ts tests/core/scope/aggregator.test.ts
git commit -m "feat(scope): aggregator 返回 superseding 明细 + skipped + new_status 守卫"
```

---

## Task 2: backlog warning 派生 + tombstone 选择

**Files:**
- Create: `src/core/backlog/render.ts`(本任务先建文件,只放 warning/tombstone 逻辑;Task 3/4 续加渲染函数)
- Test: `tests/core/backlog/render.test.ts`

实现 spec §7.1(`BacklogWarning` 五类联合 + 派生)+ §5 处理顺序(先剔 dangling/invalid,再 valid 组内选最早 winner)。

- [ ] **Step 1: 写失败测试**

Create `tests/core/backlog/render.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { deriveWarningsAndTombstones } from '../../../src/core/backlog/render.js';
import type { SupersedingDetail, SkippedBlock } from '../../../src/core/scope/aggregator.js';
import type { ScopeEntry } from '../../../src/core/schemas/scope-entries.js';

const snap: ScopeEntry = {
  id: 'foo', category: 'out-of-scope', description: 'd', reason: 'r',
  priority: null, status: 'active', triggered_by: null, related_change: null,
};
function sup(p: Partial<SupersedingDetail>): SupersedingDetail {
  return {
    source_change: '2026-05-01-a', entry_id: 'foo', new_status: 'completed',
    rationale: 'done', superseded_in_change: '2026-05-09-b', superseded_at: '2026-05-09',
    registry_entry_snapshot: snap, ...p,
  };
}

describe('deriveWarningsAndTombstones (plan-backlog-registry Task 2)', () => {
  it('snapshot=null → dangling-reference warning,不出 tombstone', () => {
    const r = deriveWarningsAndTombstones([sup({ registry_entry_snapshot: null })], []);
    expect(r.tombstones).toHaveLength(0);
    expect(r.warnings).toEqual([
      { kind: 'dangling-reference', superseded_in_change: '2026-05-09-b', source_change: '2026-05-01-a', entry_id: 'foo' },
    ]);
  });

  it('new_status 非法 → invalid-new-status warning(带 raw),不出 tombstone', () => {
    const r = deriveWarningsAndTombstones([sup({ new_status: 'active' })], []);
    expect(r.tombstones).toHaveLength(0);
    expect(r.warnings[0]).toMatchObject({ kind: 'invalid-new-status', raw: 'active' });
  });

  it('重复认领 → 取 superseded_at 最早为 winner,其余进 duplicate-claim warning', () => {
    const r = deriveWarningsAndTombstones(
      [
        sup({ superseded_in_change: '2026-05-09-b', superseded_at: '2026-05-09' }),
        sup({ superseded_in_change: '2026-05-03-c', superseded_at: '2026-05-03' }),
      ],
      [],
    );
    expect(r.tombstones).toHaveLength(1);
    expect(r.tombstones[0].superseded_in_change).toBe('2026-05-03-c');
    expect(r.warnings).toEqual([
      {
        kind: 'duplicate-claim', source_change: '2026-05-01-a', entry_id: 'foo',
        claimants: [
          { superseded_in_change: '2026-05-09-b', superseded_at: '2026-05-09' },
          { superseded_in_change: '2026-05-03-c', superseded_at: '2026-05-03' },
        ],
        winner_superseded_in_change: '2026-05-03-c',
      },
    ]);
  });

  it("superseded_at='unknown' → malformed-dirname warning,且排序中算最晚", () => {
    const r = deriveWarningsAndTombstones(
      [
        sup({ superseded_in_change: 'legacy-x', superseded_at: 'unknown' }),
        sup({ superseded_in_change: '2026-05-09-b', superseded_at: '2026-05-09' }),
      ],
      [],
    );
    expect(r.tombstones[0].superseded_in_change).toBe('2026-05-09-b');
    expect(r.warnings).toContainEqual({ kind: 'malformed-dirname', superseded_in_change: 'legacy-x' });
  });

  it('skipped block → skipped-block warning', () => {
    const sk: SkippedBlock = { change: '2026-05-01-a', file: 'proposal.md', reason: 'yaml-parse-error' };
    const r = deriveWarningsAndTombstones([], [sk]);
    expect(r.warnings).toEqual([
      { kind: 'skipped-block', change: '2026-05-01-a', file: 'proposal.md', reason: 'yaml-parse-error' },
    ]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/backlog/render.test.ts`
Expected: FAIL —— `src/core/backlog/render.ts` 不存在。

- [ ] **Step 3: 建 `src/core/backlog/render.ts`(warning/tombstone 部分)**

```typescript
// src/core/backlog/render.ts
// plan-backlog-registry — 纯函数:聚合结果 → BacklogWarning[] + tombstone + markdown
// 本文件 Task 2 放 warning/tombstone 派生;Task 3/4 续加 renderActive / renderArchived。

import type { SupersedingDetail, SkippedBlock } from '../scope/aggregator.js';

/** render 层呈现类型 —— 由 superseding[] / skipped[] 派生(spec §7.1) */
export type BacklogWarning =
  | { kind: 'dangling-reference'; superseded_in_change: string; source_change: string; entry_id: string }
  | { kind: 'invalid-new-status'; superseded_in_change: string; source_change: string; entry_id: string; raw: string }
  | {
      kind: 'duplicate-claim';
      source_change: string;
      entry_id: string;
      claimants: { superseded_in_change: string; superseded_at: string }[];
      winner_superseded_in_change: string;
    }
  | { kind: 'malformed-dirname'; superseded_in_change: string }
  | { kind: 'skipped-block'; change: string; file: string; reason: string };

const VALID_NEW_STATUS = new Set(['superseded', 'obsolete', 'completed', 'inherited']);

/** superseded_at 比较:有效 YYYY-MM-DD 按字典序;'unknown' 一律排最后(spec §5) */
function compareSupersededAt(a: string, b: string): number {
  if (a === b) return 0;
  if (a === 'unknown') return 1;
  if (b === 'unknown') return -1;
  return a < b ? -1 : 1;
}

/** 两条 claim 选 winner:superseded_at 最早;并列按 superseded_in_change 字典序 */
function earlier(a: SupersedingDetail, b: SupersedingDetail): SupersedingDetail {
  const c = compareSupersededAt(a.superseded_at, b.superseded_at);
  if (c !== 0) return c < 0 ? a : b;
  return a.superseded_in_change <= b.superseded_in_change ? a : b;
}

/**
 * 从 aggregator 的 superseding[] / skipped[] 派生 warning 与 tombstone(spec §5 处理顺序 / §7.1)。
 * 处理顺序:先剔 dangling(snapshot=null)与非法 new_status,再在剩余 valid claim 组内选 winner。
 */
export function deriveWarningsAndTombstones(
  superseding: SupersedingDetail[],
  skipped: SkippedBlock[],
): { warnings: BacklogWarning[]; tombstones: SupersedingDetail[] } {
  const warnings: BacklogWarning[] = [];
  const valid: SupersedingDetail[] = [];

  for (const s of superseding) {
    if (s.registry_entry_snapshot === null) {
      warnings.push({
        kind: 'dangling-reference',
        superseded_in_change: s.superseded_in_change,
        source_change: s.source_change,
        entry_id: s.entry_id,
      });
      continue;
    }
    if (!VALID_NEW_STATUS.has(s.new_status)) {
      warnings.push({
        kind: 'invalid-new-status',
        superseded_in_change: s.superseded_in_change,
        source_change: s.source_change,
        entry_id: s.entry_id,
        raw: s.new_status,
      });
      continue;
    }
    valid.push(s);
  }

  // malformed-dirname:任何 superseding 明细目录名异常都报
  for (const s of superseding) {
    if (s.superseded_at === 'unknown') {
      warnings.push({ kind: 'malformed-dirname', superseded_in_change: s.superseded_in_change });
    }
  }

  // valid claim 按身份键分组
  const groups = new Map<string, SupersedingDetail[]>();
  for (const s of valid) {
    const key = `${s.source_change}::${s.entry_id}`;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }

  const tombstones: SupersedingDetail[] = [];
  for (const g of groups.values()) {
    const winner = g.reduce(earlier);
    tombstones.push(winner);
    if (g.length > 1) {
      warnings.push({
        kind: 'duplicate-claim',
        source_change: g[0].source_change,
        entry_id: g[0].entry_id,
        claimants: g.map((s) => ({
          superseded_in_change: s.superseded_in_change,
          superseded_at: s.superseded_at,
        })),
        winner_superseded_in_change: winner.superseded_in_change,
      });
    }
  }

  for (const sk of skipped) {
    warnings.push({ kind: 'skipped-block', change: sk.change, file: sk.file, reason: sk.reason });
  }

  return { warnings, tombstones };
}
```

- [ ] **Step 4: 跑测试确认通过 + 类型检查**

Run: `pnpm vitest run tests/core/backlog/render.test.ts` → PASS(5 case)
Run: `pnpm typecheck` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/backlog/render.ts tests/core/backlog/render.test.ts
git commit -m "feat(backlog): BacklogWarning 派生 + tombstone winner 选择"
```

---

## Task 3: 渲染 active.md

**Files:**
- Modify: `src/core/backlog/render.ts`(加 `renderActiveMarkdown` + `renderWarningLine`)
- Test: `tests/core/backlog/render.test.ts`(加 active 渲染 case)

实现 spec §4。

- [ ] **Step 1: 写失败测试**

追加到 `tests/core/backlog/render.test.ts`:

```typescript
import { renderActiveMarkdown } from '../../../src/core/backlog/render.js';
import type { AggregatedScopeEntry } from '../../../src/core/scope/aggregator.js';

function entry(p: Partial<AggregatedScopeEntry>): AggregatedScopeEntry {
  return {
    id: 'e', category: 'future-work', description: 'desc', reason: 'rsn',
    priority: null, status: 'active', triggered_by: null, related_change: null,
    source_change: '2026-05-01-a', ...p,
  };
}

describe('renderActiveMarkdown (plan-backlog-registry Task 3)', () => {
  it('无 entry 无 warning:待办计 0、Warnings (0) 渲染 (无)', () => {
    const md = renderActiveMarkdown([], []);
    expect(md).toContain('待办计 0 项');
    expect(md).toContain('## Warnings (0)');
    expect(md).toContain('(无)');
  });

  it('future-work + out-of-scope 计入待办数,non-goal 不计入', () => {
    const md = renderActiveMarkdown(
      [
        entry({ id: 'fw', category: 'future-work' }),
        entry({ id: 'oos', category: 'out-of-scope' }),
        entry({ id: 'ng', category: 'non-goal' }),
      ],
      [],
    );
    expect(md).toContain('待办计 2 项');
    expect(md).toContain('## Future Work (1)');
    expect(md).toContain('## Out of Scope (1)');
    expect(md).toContain('## Non-Goals (1)');
    expect(md).toContain('### `2026-05-01-a::fw`');
  });

  it('warning 渲染进 ## Warnings 段', () => {
    const md = renderActiveMarkdown([], [
      { kind: 'dangling-reference', superseded_in_change: '2026-05-09-b', source_change: '2026-05-01-a', entry_id: 'foo' },
    ]);
    expect(md).toContain('## Warnings (1)');
    expect(md).toContain('[dangling] 2026-05-09-b 认领的 2026-05-01-a::foo 不存在');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/backlog/render.test.ts -t "renderActiveMarkdown"`
Expected: FAIL —— `renderActiveMarkdown` 未导出。

- [ ] **Step 3: 在 `render.ts` 末尾追加**

```typescript
import type { AggregatedScopeEntry } from '../scope/aggregator.js';
import type { ScopeCategory } from '../schemas/scope-entries.js';

/** 单条 BacklogWarning → 一行文本(spec §7.1 表) */
export function renderWarningLine(w: BacklogWarning): string {
  switch (w.kind) {
    case 'dangling-reference':
      return `- [dangling] ${w.superseded_in_change} 认领的 ${w.source_change}::${w.entry_id} 不存在`;
    case 'invalid-new-status':
      return `- [invalid-status] ${w.superseded_in_change} 认领 ${w.source_change}::${w.entry_id} new_status=${w.raw}`;
    case 'duplicate-claim': {
      const cs = w.claimants.map((c) => `${c.superseded_in_change}:${c.superseded_at}`).join(' ');
      return `- [duplicate] ${w.source_change}::${w.entry_id} claimants=${cs} winner=${w.winner_superseded_in_change}`;
    }
    case 'malformed-dirname':
      return `- [malformed-dirname] ${w.superseded_in_change} 目录名无日期前缀,superseded_at=unknown`;
    case 'skipped-block':
      return `- [skipped] ${w.change}/${w.file}: ${w.reason}`;
  }
}

/** 单条 active entry → markdown 块 */
function renderEntry(e: AggregatedScopeEntry): string {
  const tb = e.triggered_by ? `${e.triggered_by.source}#${e.triggered_by.id}` : '(无)';
  return [
    `### \`${e.source_change}::${e.id}\``,
    '',
    `- **source change**: ${e.source_change}`,
    `- **description**: ${e.description}`,
    `- **reason**: ${e.reason}`,
    `- **priority**: ${e.priority ?? '(未排序)'}`,
    `- **related change**: ${e.related_change ?? '(无)'}`,
    `- **triggered_by**: ${tb}`,
    '',
  ].join('\n');
}

/** 渲染 active.md(spec §4) */
export function renderActiveMarkdown(
  entries: AggregatedScopeEntry[],
  warnings: BacklogWarning[],
): string {
  const byCat = (c: ScopeCategory) => entries.filter((e) => e.category === c);
  const fw = byCat('future-work');
  const oos = byCat('out-of-scope');
  const ng = byCat('non-goal');
  const openCount = fw.length + oos.length;

  const lines: string[] = [];
  lines.push('# Active Backlog');
  lines.push('');
  lines.push('> 生成产物 —— 由 `/forge:archive` 自动重生成,**勿手编**。Schema 见 README.md。');
  lines.push(`> 待办计 ${openCount} 项(Future Work + Out of Scope;Non-Goals 不计入)。`);
  lines.push('');
  lines.push(`## Warnings (${warnings.length})`);
  lines.push('');
  lines.push(warnings.length === 0 ? '(无)' : warnings.map(renderWarningLine).join('\n'));
  lines.push('');
  for (const [title, list] of [
    [`## Future Work (${fw.length})`, fw],
    [`## Out of Scope (${oos.length})`, oos],
    [`## Non-Goals (${ng.length}) — 原则不做,不计入待办`, ng],
  ] as const) {
    lines.push(title);
    lines.push('');
    if (list.length === 0) {
      lines.push('(无)');
      lines.push('');
    } else {
      for (const e of list) lines.push(renderEntry(e));
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}
```

- [ ] **Step 4: 跑测试 + typecheck 确认通过**

Run: `pnpm vitest run tests/core/backlog/render.test.ts` → PASS
Run: `pnpm typecheck` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/backlog/render.ts tests/core/backlog/render.test.ts
git commit -m "feat(backlog): 渲染 active.md(Warnings + 三段 category)"
```

---

## Task 4: 渲染 archived.md

**Files:**
- Modify: `src/core/backlog/render.ts`(加 `renderArchivedMarkdown`)
- Test: `tests/core/backlog/render.test.ts`(加 archived 渲染 case)

实现 spec §5。tombstone 标题用复合键 `<source_change>::<entry_id>`。

- [ ] **Step 1: 写失败测试**

追加到 `tests/core/backlog/render.test.ts`:

```typescript
import { renderArchivedMarkdown } from '../../../src/core/backlog/render.js';

describe('renderArchivedMarkdown (plan-backlog-registry Task 4)', () => {
  it('无 tombstone:渲染标题 + (无)', () => {
    const md = renderArchivedMarkdown([]);
    expect(md).toContain('# Archived Backlog (Tombstones)');
    expect(md).toContain('(无)');
  });

  it('单 tombstone:复合键标题 + 5 字段', () => {
    const md = renderArchivedMarkdown([sup({ new_status: 'completed' })]);
    expect(md).toContain('### `2026-05-01-a::foo`');
    expect(md).toContain('- **superseded_in_change**: 2026-05-09-b');
    expect(md).toContain('- **superseded_at**: 2026-05-09');
    expect(md).toContain('- **new_status**: completed');
    expect(md).toContain('- **cancellation_reason**: done');
    expect(md).toContain('"id":"foo"');
  });
});
```

(`sup` helper 已在 Task 2 的测试文件顶部定义,本 describe 复用。)

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/backlog/render.test.ts -t "renderArchivedMarkdown"`
Expected: FAIL —— `renderArchivedMarkdown` 未导出。

- [ ] **Step 3: 在 `render.ts` 末尾追加**

```typescript
/** 渲染 archived.md tombstone(spec §5);入参为 deriveWarningsAndTombstones 选出的 winner 列表 */
export function renderArchivedMarkdown(tombstones: SupersedingDetail[]): string {
  const lines: string[] = [];
  lines.push('# Archived Backlog (Tombstones)');
  lines.push('');
  lines.push('> 生成产物 —— 由 `/forge:archive` 自动重生成。每条记录一个 backlog 项的退役。Schema 见 README.md。');
  lines.push('> 异常(悬空认领 / 非法 new_status / 重复认领 / 跳过坏块 / 目录名异常)见 active.md `## Warnings`。');
  lines.push('');
  if (tombstones.length === 0) {
    lines.push('(无)');
    return lines.join('\n') + '\n';
  }
  for (const t of tombstones) {
    // registry_entry_snapshot 一定非 null(deriveWarningsAndTombstones 已剔 dangling)
    const snapshot = JSON.stringify(t.registry_entry_snapshot);
    lines.push(`### \`${t.source_change}::${t.entry_id}\``);
    lines.push('');
    lines.push(`- **superseded_in_change**: ${t.superseded_in_change}`);
    lines.push(`- **superseded_at**: ${t.superseded_at}`);
    lines.push(`- **new_status**: ${t.new_status}`);
    lines.push(`- **cancellation_reason**: ${t.rationale}`);
    lines.push(`- **registry_entry_snapshot**: ${snapshot}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
```

- [ ] **Step 4: 跑测试 + typecheck 确认通过**

Run: `pnpm vitest run tests/core/backlog/render.test.ts` → PASS
Run: `pnpm typecheck` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/backlog/render.ts tests/core/backlog/render.test.ts
git commit -m "feat(backlog): 渲染 archived.md tombstone"
```

---

## Task 5: orchestration —— `generateBacklog` + `checkBacklogStale` + README 首写

**Files:**
- Create: `src/core/backlog/index.ts`
- Create: `src/core/backlog/assets/backlog-readme.md`
- Modify: `scripts/copy-templates.mjs`(同步 assets 到 dist)
- Test: `tests/core/backlog/index.test.ts`

实现 spec §3.1 + §7.2。

- [ ] **Step 1: 建 README 静态模板 `src/core/backlog/assets/backlog-readme.md`**

```markdown
# Backlog Registry

`active.md` / `archived.md` 是 **生成产物** —— 由 `/forge:archive`(或 `forge backlog`)自动重生成,**请勿手编**。本 `README.md` 是一次性静态种子,可本地补充。

- `active.md` —— 当前未决 scope-entry(Future Work + Out of Scope 计入待办数;Non-Goals 单列不计入)。
- `archived.md` —— tombstone:已被后续 change 经 `superseding_entries` 认领为 superseded / obsolete / completed / inherited 的 entry。

数据源:`forge/changes/archive/*/{proposal,design}.md` 内的 `forge-scope-entries/v1` YAML 块。
富字段(priority / reason 等)须写进源头 scope-entry,手编 active.md / archived.md 会被下次重生成冲掉。

查询:`forge backlog list`。CI 守门:`forge backlog --check`。
```

- [ ] **Step 2: 写失败测试**

Create `tests/core/backlog/index.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateBacklog, checkBacklogStale } from '../../../src/core/backlog/index.js';

describe('generateBacklog (plan-backlog-registry Task 5)', () => {
  let forgeRoot: string;
  beforeEach(async () => {
    forgeRoot = await mkdtemp(join(tmpdir(), 'forge-backlog-'));
    await mkdir(join(forgeRoot, 'changes', 'archive'), { recursive: true });
  });
  afterEach(async () => {
    await rm(forgeRoot, { recursive: true, force: true });
  });

  it('空 archive:写出 active.md / archived.md / README.md', async () => {
    const r = await generateBacklog(forgeRoot);
    expect(r.openCount).toBe(0);
    const active = await readFile(join(forgeRoot, 'backlog', 'active.md'), 'utf8');
    expect(active).toContain('# Active Backlog');
    await stat(join(forgeRoot, 'backlog', 'archived.md'));
    await stat(join(forgeRoot, 'backlog', 'README.md'));
  });

  it('README.md 已存在则不覆盖', async () => {
    await mkdir(join(forgeRoot, 'backlog'), { recursive: true });
    await writeFile(join(forgeRoot, 'backlog', 'README.md'), 'CUSTOM');
    await generateBacklog(forgeRoot);
    expect(await readFile(join(forgeRoot, 'backlog', 'README.md'), 'utf8')).toBe('CUSTOM');
  });

  it('checkBacklogStale:磁盘缺文件 → 报两文件陈旧;generateBacklog 后 → 一致', async () => {
    expect((await checkBacklogStale(forgeRoot)).sort()).toEqual(['active.md', 'archived.md']);
    await generateBacklog(forgeRoot);
    expect(await checkBacklogStale(forgeRoot)).toEqual([]);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm vitest run tests/core/backlog/index.test.ts`
Expected: FAIL —— `src/core/backlog/index.ts` 不存在。

- [ ] **Step 4: 建 `src/core/backlog/index.ts`**

```typescript
// src/core/backlog/index.ts
// plan-backlog-registry — orchestration:聚合 → 渲染 → 写 forge/backlog/

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanArchivedFollowups } from '../scope/aggregator.js';
import {
  deriveWarningsAndTombstones,
  renderActiveMarkdown,
  renderArchivedMarkdown,
} from './render.js';

export * from './render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** README 模板路径(随 dist 一起发布 —— 由 scripts/copy-templates.mjs 拷到 dist,见 Step 5) */
const README_TEMPLATE = join(__dirname, 'assets', 'backlog-readme.md');

export interface GenerateBacklogResult {
  /** 待办数(future-work + out-of-scope) */
  openCount: number;
  /** warning 数 */
  warningCount: number;
  /** 渲染出的两份 markdown(供 --check 比对,不必重新读盘) */
  activeMd: string;
  archivedMd: string;
}

/** 聚合 + 渲染,返回两份 markdown(纯计算,不写盘) */
export async function buildBacklog(forgeRoot: string): Promise<GenerateBacklogResult> {
  const agg = await scanArchivedFollowups(forgeRoot);
  const { warnings, tombstones } = deriveWarningsAndTombstones(agg.superseding, agg.skipped);
  const activeMd = renderActiveMarkdown(agg.entries, warnings);
  const archivedMd = renderArchivedMarkdown(tombstones);
  const openCount = agg.entries.filter(
    (e) => e.category === 'future-work' || e.category === 'out-of-scope',
  ).length;
  return { openCount, warningCount: warnings.length, activeMd, archivedMd };
}

/** 聚合 + 渲染 + 写盘到 forge/backlog/(README 仅首写) */
export async function generateBacklog(forgeRoot: string): Promise<GenerateBacklogResult> {
  const result = await buildBacklog(forgeRoot);
  const dir = join(forgeRoot, 'backlog');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'active.md'), result.activeMd, 'utf8');
  await writeFile(join(dir, 'archived.md'), result.archivedMd, 'utf8');
  const readmePath = join(dir, 'README.md');
  if (!existsSync(readmePath)) {
    await writeFile(readmePath, await readFile(README_TEMPLATE, 'utf8'), 'utf8');
  }
  return result;
}

/**
 * 比对磁盘上的 forge/backlog/{active,archived}.md 与重生成结果。
 * 返回陈旧文件名列表(空数组 = 一致)。供 `forge backlog --check`(CI staleness 守门,spec §7.2)。
 */
export async function checkBacklogStale(forgeRoot: string): Promise<string[]> {
  const built = await buildBacklog(forgeRoot);
  const dir = join(forgeRoot, 'backlog');
  const stale: string[] = [];
  for (const [name, fresh] of [
    ['active.md', built.activeMd],
    ['archived.md', built.archivedMd],
  ] as const) {
    let onDisk: string;
    try {
      onDisk = await readFile(join(dir, name), 'utf8');
    } catch {
      onDisk = '';
    }
    if (onDisk !== fresh) stale.push(name);
  }
  return stale;
}
```

- [ ] **Step 5: 改 `scripts/copy-templates.mjs` 同步 assets**

`tsc` 不拷 `.md` 资产到 `dist/`。在 `scripts/copy-templates.mjs` 里加一个同步函数(放在文件末尾、`await syncCommands();` 之前的函数定义区),并在末尾调用它:

```javascript
// 同步 backlog assets:src/core/backlog/assets/*.md → dist/core/backlog/assets/
async function syncBacklogAssets() {
  const srcDir = join(REPO_ROOT, 'src', 'core', 'backlog', 'assets');
  if (!existsSync(srcDir)) return;
  const distDir = join(REPO_ROOT, 'dist', 'core', 'backlog', 'assets');
  await mkdir(distDir, { recursive: true });
  for (const name of (await readdir(srcDir)).filter((n) => n.endsWith('.md'))) {
    await writeFile(join(distDir, name), await readFile(join(srcDir, name), 'utf8'), 'utf8');
  }
  console.log('✓ synced backlog assets');
}
```

并在文件最末尾(`await syncCommands();` 那一行之后)加:

```javascript
await syncBacklogAssets(); // plan-backlog-registry
```

- [ ] **Step 6: 跑测试 + build + typecheck 确认通过**

Run: `pnpm vitest run tests/core/backlog/index.test.ts` → PASS
Run: `pnpm build` → 成功,控制台出现 `✓ synced backlog assets`
Run: `pnpm typecheck` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/backlog/ tests/core/backlog/index.test.ts scripts/copy-templates.mjs
git commit -m "feat(backlog): generateBacklog + checkBacklogStale + README 模板 + assets 同步"
```

---

## Task 6: `forge backlog` CLI 子命令

**Files:**
- Create: `src/cli/commands/backlog.ts`
- Modify: `src/cli/index.ts`(注册)
- Test: `tests/cli/backlog.test.ts`

实现 spec §8。对照 `src/cli/commands/scope.ts` 的 commander 模式。**CLI 范围**:本 feature 只实现 `forge backlog` / `forge backlog list` / `forge backlog --check` 三个(spec §8),**不**引入 `--dry-run` / `--verbose` 等其它 flag。`--check` 的 staleness 比对核心逻辑由 Task 5 `checkBacklogStale` 单测覆盖;本任务测 CLI 装配 + 子进程行为(exit code / stdout)。

- [ ] **Step 1: 写失败测试(结构测试 + 子进程 CLI 行为测试一起写,先全红)**

CLI action 调 `process.exit`、进程内难测,故行为测试沿 `archive-summary-end-to-end.test.ts` 的子进程模式 spawn 真 CLI。Create `tests/cli/backlog.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildBacklogCommand } from '../../src/cli/commands/backlog.js';

describe('buildBacklogCommand 装配 (plan-backlog-registry Task 6)', () => {
  it('返回名为 backlog 的 Command,含 list 子命令', () => {
    const cmd = buildBacklogCommand();
    expect(cmd.name()).toBe('backlog');
    expect(cmd.commands.map((c) => c.name())).toContain('list');
  });

  it('backlog 顶层命令含 --check 选项', () => {
    const cmd = buildBacklogCommand();
    expect(cmd.options.map((o) => o.long)).toContain('--check');
  });
});

const FORGE_CLI = resolve(process.cwd(), 'dist/cli/index.js');
function runCli(cwd: string, args: string[]) {
  const r = spawnSync('node', [FORGE_CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe('forge backlog CLI 行为 (plan-backlog-registry Task 6)', () => {
  it('forge backlog:空 archive → exit 0 + 生成 active.md', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-bl-cli-'));
    mkdirSync(join(root, 'forge', 'changes', 'archive'), { recursive: true });
    const r = runCli(root, ['backlog']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/backlog 已生成/);
    expect(existsSync(join(root, 'forge', 'backlog', 'active.md'))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('forge backlog --check:一致 → exit 0;改脏 → exit 1', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-bl-cli-'));
    mkdirSync(join(root, 'forge', 'changes', 'archive'), { recursive: true });
    runCli(root, ['backlog']);
    expect(runCli(root, ['backlog', '--check']).code).toBe(0);
    writeFileSync(join(root, 'forge', 'backlog', 'active.md'), 'STALE');
    expect(runCli(root, ['backlog', '--check']).code).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it('forge backlog list:打印 active backlog 到 stdout,不落盘', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-bl-cli-'));
    mkdirSync(join(root, 'forge', 'changes', 'archive'), { recursive: true });
    const r = runCli(root, ['backlog', 'list']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('# Active Backlog');
    expect(existsSync(join(root, 'forge', 'backlog', 'active.md'))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('forge backlog:无 forge/changes/archive → exit 2', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-bl-cli-'));
    const r = runCli(root, ['backlog']);
    expect(r.code).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: build + 跑测试确认失败**

Run: `pnpm build`(让子进程测试有 dist 可 spawn —— 此时 dist 尚无 backlog 命令)
Run: `pnpm vitest run tests/cli/backlog.test.ts`
Expected: FAIL —— `tests/cli/backlog.test.ts` 顶部静态 import `src/cli/commands/backlog.ts`,该文件不存在 → 整个测试文件 import 失败、全部 case(结构 + 子进程)一并红。此即本任务 TDD 红灯。

- [ ] **Step 3: 建 `src/cli/commands/backlog.ts`**

```typescript
// src/cli/commands/backlog.ts
// plan-backlog-registry Task 6 — forge backlog / list / --check

import { Command } from 'commander';
import { join } from 'node:path';
import { generateBacklog, buildBacklog, checkBacklogStale } from '../../core/backlog/index.js';

export function buildBacklogCommand(): Command {
  const backlog = new Command('backlog').description(
    '生成 / 查询 forge/backlog/ 注册表(active.md + archived.md)',
  );

  // forge backlog [--check]:默认重生成;--check 只比对不写
  backlog
    .option('--check', '只比对磁盘与重生成结果,陈旧则 exit 1,不写盘')
    .action(async (opts: { check?: boolean }) => {
      try {
        const forgeRoot = join(process.cwd(), 'forge');
        if (opts.check) {
          const stale = await checkBacklogStale(forgeRoot);
          if (stale.length > 0) {
            process.stderr.write(
              `✗ backlog 陈旧:${stale.join(', ')} —— 跑 \`forge backlog\` 重生成\n`,
            );
            process.exit(1);
          }
          process.stdout.write('✓ backlog 与 archived changes 一致\n');
          process.exit(0);
        }
        const r = await generateBacklog(forgeRoot);
        process.stdout.write(
          `✓ backlog 已生成:forge/backlog/active.md (${r.openCount} open, ${r.warningCount} warnings)\n`,
        );
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`✗ backlog failed: ${msg}\n`);
        process.exit(2);
      }
    });

  // forge backlog list:把当前未决 backlog(同 active.md 内容)打到 stdout,不落盘
  backlog
    .command('list')
    .description('打印当前未决 backlog(不落盘)')
    .action(async () => {
      try {
        const forgeRoot = join(process.cwd(), 'forge');
        const built = await buildBacklog(forgeRoot);
        process.stdout.write(built.activeMd);
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`✗ backlog list failed: ${msg}\n`);
        process.exit(2);
      }
    });

  return backlog;
}
```

- [ ] **Step 4: 注册到 `src/cli/index.ts`**

在 import 段(`buildStageExtensionsCommand` import 行之后)加:

```typescript
import { buildBacklogCommand } from './commands/backlog.js';
```

在命令注册段末尾(`program.addCommand(buildStageExtensionsCommand());` 之后)加:

```typescript
// 注册 backlog 子命令(plan-backlog-registry)
program.addCommand(buildBacklogCommand());
```

- [ ] **Step 5: build**

Run: `pnpm build`(把 backlog 命令编进 dist,供 Step 1 的子进程 CLI 测试 spawn)

- [ ] **Step 6: 跑全部测试 + typecheck 确认通过**

Run: `pnpm vitest run tests/cli/backlog.test.ts` → PASS(结构 case + 4 个 CLI 行为 case)
Run: `pnpm typecheck` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/backlog.ts src/cli/index.ts tests/cli/backlog.test.ts
git commit -m "feat(cli): forge backlog / list / --check 子命令 + CLI 行为测试"
```

---

## Task 7: archive 接入 —— archive 成功后生成 backlog(真端到端测试)

**Files:**
- Modify: `src/cli/commands/archive.ts`(step 6 之后插 step 6.5)
- Test: `tests/integration/archive-summary-end-to-end.test.ts`(追加一个 e2e case)

实现 spec §3.1。**测试用真端到端**:`spawnSync` 跑 `forge archive` CLI,断言 `forge/backlog/` 产物生成 —— 这是真 red-green(改 archive.ts 前文件不存在 → red;改后 → green)。复用该测试文件已有的 `setupFixture` / `runArchive` helper。

- [ ] **Step 1: 写失败测试 —— 追加到 `tests/integration/archive-summary-end-to-end.test.ts`**

先把该文件第 7 行 `node:fs` 的 import 补上 `mkdirSync`(失败路径用例需要):

```typescript
import { mkdtempSync, mkdirSync, rmSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
```

然后在 `describe('archive_summary e2e', ...)` 块内末尾(最后一个 `it(...)` 之后、`});` 之前)追加两个用例(成功路径 + 失败不回滚路径)。该文件顶部已 import `join`,无需再加:

```typescript
  // plan-backlog-registry Task 7 — archive 成功后自动生成 forge/backlog/
  it('archive 成功后生成 forge/backlog/{active,archived,README}.md', async () => {
    const ctx = await setupFixture('mixed-all-three');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0);
    const backlogDir = join(ctx.tmpRoot, 'forge', 'backlog');
    expect(existsSync(join(backlogDir, 'active.md'))).toBe(true);
    expect(existsSync(join(backlogDir, 'archived.md'))).toBe(true);
    expect(existsSync(join(backlogDir, 'README.md'))).toBe(true);
    expect(readFileSync(join(backlogDir, 'active.md'), 'utf8')).toContain('# Active Backlog');
    expect(r.stdout).toMatch(/Backlog: forge\/backlog\/active\.md/);
  });

  // plan-backlog-registry Task 7 — backlog 写入失败不回滚 archive(spec §3.1)
  it('backlog 写入失败 → archive 仍 exit 0 + stderr warning + archive 不回滚', async () => {
    const ctx = await setupFixture('mixed-all-three');
    cleanupDirs.push(ctx.tmpRoot);
    // 把 active.md 预建成「目录」,使 backlog 的 writeFile 落 EISDIR 失败
    mkdirSync(join(ctx.tmpRoot, 'forge', 'backlog', 'active.md'), { recursive: true });
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0); // archive 主流程仍成功
    expect(r.stderr).toMatch(/backlog 重生成失败/);
    // archive 未回滚 + 主流程产物完整:change 已移进 archive/ 且 archive_summary.yaml 存在
    const archDir = join(
      ctx.tmpRoot, 'forge', 'changes', 'archive', `${ctx.archiveDate}-${ctx.changeId}`,
    );
    expect(existsSync(archDir)).toBe(true);
    expect(existsSync(join(archDir, 'archive_summary.yaml'))).toBe(true);
  });
```

> **失败路径测试范围**:以 EISDIR(`active.md` 预建为目录)代表 fs 写入失败一类。`archive.ts` 的 backlog 步是 catch-all `try/catch`,一个代表性失败即可证明「backlog 失败被吞、archive 不受影响」;**不**另测权限拒绝 —— 跨平台(尤其 Windows CI)模拟 EACCES 不可靠、易 flaky。schema/marker 校验失败属 archive 主流程**前置**拒签(exit 1,在 step 6.5 之前),根本不进 backlog step,由既有 archive fence 测试覆盖。

- [ ] **Step 2: 跑测试确认失败**

该 e2e 测试 spawn `dist/cli/index.js`,先 build 出当前(尚无 backlog 接入的)CLI:
Run: `pnpm build`
Run: `pnpm vitest run tests/integration/archive-summary-end-to-end.test.ts -t "生成 forge/backlog"`
Expected: FAIL —— `forge/backlog/active.md` 不存在(archive 还没接入 backlog 生成)。

- [ ] **Step 3: 改 `src/cli/commands/archive.ts` —— 插 step 6.5**

第 51 行 import 段(`renderArchiveSummaryOutput` import 那行附近)加:

```typescript
import { generateBacklog } from '../../core/backlog/index.js';
```

定位第 560 行 `console.log(renderArchiveSummaryOutput(archiveSummary, archiveDirName));`,在它之后、`} catch (err) {` 之前插入:

```typescript
          // 步骤 6.5:plan-backlog-registry — 重生成 forge/backlog/ 注册表
          // 失败不回滚 archive(archive 主流程已成功,backlog 是衍生产物)
          try {
            const bl = await generateBacklog(forgeRoot);
            console.log(
              `Backlog: forge/backlog/active.md (${bl.openCount} open, ${bl.warningCount} warnings)`,
            );
          } catch (blErr) {
            const m = blErr instanceof Error ? blErr.message : String(blErr);
            console.error(`⚠ backlog 重生成失败(不影响 archive):${m} —— 可手动跑 \`forge backlog\``);
          }
```

> `forgeRoot` 变量在 archive action 作用域内已存在(archive 流程全程使用 forge 根路径)。若该文件实际变量名不同,以文件内 forge 根路径变量为准。

- [ ] **Step 4: 重新 build + 跑测试确认通过**

Run: `pnpm build`(把带 backlog 接入的 archive.ts 编进 dist)
Run: `pnpm vitest run tests/integration/archive-summary-end-to-end.test.ts` → PASS(原 7 case + 2 个新 case)
Run: `pnpm typecheck` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/archive.ts tests/integration/archive-summary-end-to-end.test.ts
git commit -m "feat(archive): archive 成功后自动重生成 forge/backlog/"
```

---

## Task 8: 修 propose.md inherit 分支 + 补 mark completed 菜单

**Files:**
- Modify: `commands/propose.md`(「前置」步骤区,第 24 / 25 / 41 行)

实现 spec §6 + §9(a) + §9(b)。改完 `commands/*.md` **必须** `pnpm build`。下列「原文」均为 `commands/propose.md` 当前字面;逐处精确替换。

- [ ] **Step 1: 改第 24 行 —— 菜单补 `mark completed`**

原文(第 24 行):

```
   - 每项 4 选项:`inherit`(本 change 做)/ `acknowledge but defer`(留 active)/ `mark obsolete` / `mark superseded by some other change`
```

替换为:

```
   - 每项 5 选项:`inherit`(本 change 做)/ `acknowledge but defer`(留 active)/ `mark obsolete` / `mark superseded by some other change` / `mark completed`(本 change 已实际完成该 backlog 项)
```

- [ ] **Step 2: 改第 25 行 —— inherit 分支(§9a/§9b)**

原文(第 25 行):

```
4. 用户决策聚合,**`inherit` 项写到本 change 自己的 `## Out of Scope/Future Work` YAML 块**(本 change 实施时它就是新 entry,加 `triggered_by: {source: "from-archived", id: "<source_change>::<entry_id>"}` 跟踪来源);**`mark superseded` / `mark obsolete` 项写到 `superseding_entries` 数组**(每项含 source_change / entry_id / new_status / rationale)
```

替换为:

```
4. 用户决策聚合并写入:
   - **`inherit`**:写到本 change 自己的 `## Out of Scope/Future Work` YAML 块成为新 entry,archived 来源用 **`related_change: "<source_change>"`** 字段记录(**勿**写 `triggered_by: {source: "from-archived", ...}` —— `from-archived` 不在 `TriggeredByRef.source` 枚举内,会被严格 validator 拒签);**并且**在 `superseding_entries` 数组写一条 `{source_change, entry_id, new_status: inherited, rationale}` —— 否则被继承的老 entry 不会从 backlog 注册表扣除,造成 double-count(plan-backlog-registry §9a/§9b)
   - **`mark superseded` / `mark obsolete` / `mark completed`**:各写一条 `superseding_entries` 项(`{source_change, entry_id, new_status, rationale}`,`new_status` 取 `superseded` / `obsolete` / `completed`)
```

- [ ] **Step 3: 改第 41 行 —— 写入说明同步**

原文(第 41 行):

```
     - 若上面 §"前置"步骤 4 收集到 `inherit` / `superseding_entries` 决策 → 写入对应段的 `forge-scope-entries/v1` YAML 块
```

替换为:

```
     - 若上面 §"前置"步骤 4 收集到 `inherit` / `superseding_entries` 决策 → 写入对应段的 `forge-scope-entries/v1` YAML 块(inherit 项带 `related_change`,且必配一条 `new_status: inherited` 的 superseding_entries 项 —— plan-backlog-registry §9a/§9b)
```

- [ ] **Step 4: build + 校验同步 + format**

Run: `pnpm build`
Expected: 成功,`✓ synced N commands`(propose.md 同步进 `src/core/templates/commands/`)。
Run: `pnpm format:check`
Expected: PASS(若 propose.md 触发 prettier diff,先 `pnpm format` 再 `format:check`)。

- [ ] **Step 5: Commit**

```bash
git add commands/propose.md src/core/templates/
git commit -m "fix(propose): inherit 写 inherited superseding ref + related_change;菜单补 mark completed"
```

---

## Task 9: 「handed off to backlog」文案清理 + archive.md backlog 产物说明

**Files:**
- Modify: `src/core/archive/summary-render.ts`(line 46、58)
- Modify: `commands/archive.md`(line 80、86 文案 + 末尾补 backlog 产物段)
- Modify: `src/core/schemas/archive-summary.ts`(line 35 注释)
- Test: 既有断言同步(见 Step 4)

实现 spec §2.3 + §2.2(archive.md 末尾补 backlog 产物说明)。

- [ ] **Step 1: 改 `summary-render.ts`**

line 46 原文:

```typescript
      `### Pending Suggestions (${summary.pending_suggestions.length}) — handed off to backlog`,
```

改为:

```typescript
      `### Pending Suggestions (${summary.pending_suggestions.length}) — recorded in archive_summary`,
```

line 58 原文:

```typescript
  lines.push(`v1.1+: run \`forge backlog list\` to query across changes`);
```

改为:

```typescript
  lines.push(`Cross-change backlog: run \`forge backlog list\` (see forge/backlog/)`);
```

- [ ] **Step 2: 改 `commands/archive.md` 两处文案**

line 80 原文 `### Pending Suggestions (M) — handed off to backlog` → 改为 `### Pending Suggestions (M) — recorded in archive_summary`。
line 86 原文 `v1.1+: run `forge backlog list` to query across changes` → 改为 `Cross-change backlog: run `forge backlog list` (see forge/backlog/)`。

- [ ] **Step 3: `commands/archive.md` 末尾补 backlog 产物说明段(spec §2.2)**

在 `commands/archive.md` 文件**末尾**追加一段:

```markdown
## backlog 产物(plan-backlog-registry)

archive 成功后,CLI 自动重生成项目级 backlog 注册表 `forge/backlog/{active.md,archived.md}`(跨所有 archived change 聚合未决 scope-entry;首次生成时附带 `README.md`)。backlog 生成失败**不回滚 archive**(archive 主流程已成功,backlog 是衍生产物),仅 stderr WARNING + 提示手动跑 `forge backlog`。详见 `forge backlog` 子命令(`forge backlog` 重生成 / `forge backlog list` 查询 / `forge backlog --check` CI staleness 守门)。
```

- [ ] **Step 4: 改 `archive-summary.ts` line 35 注释 + 同步既有测试断言**

`src/core/schemas/archive-summary.ts` line 35 原文:

```typescript
  /** 给 v1.1 forge backlog index 用 — 三类聚合(沿 design §2.4.3) */
```

改为:

```typescript
  /** 单 change archive 的不可变 handoff 记录 — 三类聚合(沿 design §2.4.3)。
   *  注:跨 change backlog 注册表见 forge/backlog/,由 plan-backlog-registry 独立扫 scope YAML 生成,不消费本字段。 */
```

再查既有测试对旧文案的断言:
Run: `pnpm vitest run -t "handed off to backlog"`
若有测试断言旧字串 `handed off to backlog` 或 `v1.1+: run`,把断言改为对应新字串(`recorded in archive_summary` / `Cross-change backlog`)。

- [ ] **Step 5: build + typecheck + format + 相关测试**

Run: `pnpm build`(因改了 `commands/archive.md`)→ 成功
Run: `pnpm typecheck` → PASS
Run: `pnpm vitest run tests/cli/archive tests/core/archive` → PASS
Run: `pnpm format:check` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/archive/summary-render.ts commands/archive.md src/core/schemas/archive-summary.ts src/core/templates/ tests/
git commit -m "docs(archive): backlog 文案清理 + archive.md 补 backlog 产物说明"
```

---

## 收尾:全量验证

完成全部 9 个任务后:

- [ ] Run: `pnpm typecheck` → PASS
- [ ] Run: `pnpm lint` → PASS
- [ ] Run: `pnpm format:check` → PASS
- [ ] Run: `pnpm build` → PASS
- [ ] Run: `pnpm test` → PASS(全 suite + release gate)
- [ ] 手动冒烟:在一个含 archived change 的项目跑 `forge backlog`,确认 `forge/backlog/{active,archived,README}.md` 三文件生成且内容合理;跑 `forge backlog --check` 确认 exit 0。

---

## Self-Review(写计划后自检)

**1. Spec coverage** —— 逐节核对:

- §2.1 产物布局 → Task 5;§2.2 文件清单 → 全 9 任务覆盖(含 archive.md backlog 产物段 → Task 9 Step 3);§2.3 文案清理 → Task 9。
- §3.1 数据流 → Task 7 + Task 5;§3.2 aggregator 扩展 → Task 1。
- §4 active.md → Task 3;§5 archived.md tombstone + 排序/重复规则 → Task 4 + Task 2。
- §6 认领机制 + mark completed → Task 8;§7.1 BacklogWarning 五类 → Task 2;§7.2 `--check` → Task 5(`checkBacklogStale`)+ Task 6(CLI)。
- §8 CLI 三命令 → Task 6;§9(a)(b) → Task 8,§9(c) new_status 守卫 → Task 1;§10 多 harness → CLI 实现天然满足;§11 scope-out → 无需任务。
- 无遗漏。

**2. Placeholder scan** —— 全任务代码步均有完整代码;markdown 改动步(Task 8/9)给出精确 old→new 文本;无 TBD / 空泛措辞。

**3. Type consistency** —— `AggregatorResult { entries, superseding, skipped }`(Task 1)→ Task 5 `buildBacklog` 消费一致;`SupersedingDetail`(Task 1)→ Task 2 `deriveWarningsAndTombstones` 入参一致;`BacklogWarning` 五变体(Task 2)→ Task 3 `renderWarningLine` switch 五分支一一对应;`deriveWarningsAndTombstones` 返回 `{warnings, tombstones}` → Task 5 解构一致;`GenerateBacklogResult`(Task 5)→ Task 6 CLI 消费一致;`checkBacklogStale`(Task 5)→ Task 6 `--check` 调用一致。一致。

---

## Codex 对抗性审查处置

### Round 1(v1 → v2):7 finding,均独立对照代码核实为真,全处置

| # | severity | 核实结论 | 处置 |
| --- | --- | --- | --- |
| 1 | HIGH | 真 —— Task7 测试用 `join` 但追加 import 块缺 `node:path` | Task7 重构:测试改为追加进 `archive-summary-end-to-end.test.ts`,该文件已 import `join`,问题消失 |
| 2 | HIGH | 真 —— Task7 旧测试只验 `generateBacklog` 契约、Task5 后即 PASS,不是真 red-green,未验 archive 真调用链 | Task7 重构为真 e2e:`spawnSync forge archive`(fixture `mixed-all-three`)断言 `forge/backlog/` 生成 + stdout `Backlog:` 行;改 archive.ts 前 red、后 green |
| 3 | MEDIUM | 真 —— Task6 CLI 测试只查命令/选项注册,不验 `--check` 行为 | `--check` staleness 比对抽成 `checkBacklogStale`(Task 5)并单测;CLI 退化为薄包装,结构测试足够 |
| 4 | MEDIUM | 真 —— Task8 只改第 25 行说明,漏改第 24 行真实菜单;且原描述丢了 `acknowledge but defer` | Task8 重写:精确改第 24 行(5 选项菜单)+ 第 25 行(inherit 分支)+ 第 41 行 |
| 5 | MEDIUM | 真 —— spec §2.2 要求 archive.md 末尾补 backlog 产物说明,Task7/9 都没做 | Task9 新增 Step 3:archive.md 末尾追加「backlog 产物」段 |
| 6 | LOW | 真 —— `parseFencedYamlBlocks` 返回 `unknown[]`,块为 null/标量时 `b.schema` 抛 TypeError | Task1 代码加 `typeof block !== 'object' || block === null` 守卫,按 schema-mismatch 进 skipped |
| 7 | LOW | 真 —— Task8/9 commit 步 `git add dist/`,而 `dist/` 是 gitignored | 通用约定新增「不 `git add dist/`」;Task8/9 commit 步移除 `dist/` |

### Round 2(v2 → v3):0 HIGH + 2 MEDIUM,均独立核实为真,全处置

| 项  | severity | 核实结论                                                                  | 处置                                                                                |
| --- | -------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| M-1 | MEDIUM   | 真 —— Task7 只测 backlog 成功路径,spec §3.1「写入失败不回滚 archive」无测试 | Task7 Step 1 增失败路径 e2e:预建 `active.md` 为目录使 writeFile EISDIR → 断言 archive exit 0 + stderr warning + change 已进 archive/ |
| M-2 | MEDIUM   | 真 —— Task6 CLI 测试只验装配,exit code 0/1/2 与 stdout / `list` 不落盘未覆盖 | Task6 Step 5 增子进程 CLI 行为测试:`spawnSync` 跑真 CLI,覆盖 backlog 生成 / `--check` 0&1 / `list` 不落盘 / 无 archive 目录 exit 2 |

### Round 3(v3 → v4):3 MEDIUM + 1 LOW —— 2 条独立核实为「非真问题」顶回,2 条真问题处置

| 项            | Codex 级别 | 独立核实结论                                                                                          | 处置                                                                                  |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| M-1 复审      | MEDIUM     | **非真问题** —— v3 已加 EISDIR 失败路径测试,覆盖核心行为。Codex 要的「权限拒绝」测试跨平台模拟 EACCES 在 Windows CI 必 flaky;「schema 校验失败」属 archive 前置拒签、进不到 backlog step | 不加 flaky 测试;Task7 Step 1 补「失败路径测试范围」说明,讲清 catch-all 一个代表性失败足够 |
| M-2 复审      | MEDIUM     | **非真问题(Codex 幻觉)** —— Codex 称漏了 `--dry-run` / `--verbose`,但 spec §8 与本计划从无这两个 flag;v3 已加 CLI 行为测试 | 不实现幻觉 flag;Task6 开头补「CLI 范围」声明(只三命令)防再误判          |
| v3 新 MEDIUM  | MEDIUM     | **真** —— CLI 行为测试写在 Step 5(实现之后),非先红                                                   | Task6 重排:CLI 行为测试挪到 Step 1 与结构测试一起写,Step 2 整体红,Step 5 退化为 build |
| v3 新 LOW     | LOW        | **真** —— Task7 失败测试只断言 archive 目录存在,未断言 `archive_summary.yaml`                          | 失败测试追加 `archive_summary.yaml` 存在断言,证明 archive 主流程产物完整                |

### Round 4(v4 → v5):0 HIGH + 0 MEDIUM + 1 LOW —— **收敛**

Codex round 4 确认 round 3 的处置全部合理(M-1/M-2 范围说明成立、red-green 顺序已落地、archive_summary 断言已加)。仅剩 1 LOW:

| 项    | severity | 核实结论                                                                              | 处置                                                                            |
| ----- | -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| LOW-1 | LOW      | 真 —— Task6 Step 2 失败描述不精确:测试文件是顶部 import 失败致整体红,非「子进程因 CLI 无命令红」 | Step 2 Expected 改为准确表述:静态 import 不存在的 `backlog.ts` → 整文件 import 失败、全 case 红 |

**收敛声明**:round 4 复审 0 HIGH + 0 MEDIUM(仅 1 LOW,已于 v5 修)。按既定标准「无 HIGH 无 MEDIUM」,实施计划自 v5 起收敛。四轮 finding 趋势:7 → 2 → 3(其中 2 条经独立核实顶回为非真问题)→ 1。
