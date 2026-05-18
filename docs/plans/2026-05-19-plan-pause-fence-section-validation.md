# pause-fence 段级校验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 闭合 `tests/integration/release-blocker-attack-path.test.ts` 的 6 个 `it.todo`,使 `pnpm test:gate:release` PASS 并接入 CI。

**Architecture:** 三个 Block,Phase 化。Phase 1 = Block A(4 个 TEST-ONLY:transaction / version-retrograde 失败回滚已实现,纯补测试)+ Block B(option=1:新 unified-diff hunk parser,fence 校验 proposal.md `## What Changes` 段确有变更行)。Phase 2 = Block C(option=2:新 `forge pause-capture` CLI 子命令,pause 时把 tasks.md task id 列表写进 ack-log hash-chain,fence 校验"新增 task"语义)。

**Tech Stack:** TypeScript(ESM,Node ≥ 20.19)、commander(CLI)、vitest(测试)、yaml、gray-matter。包管理 pnpm。

**权威 design:** `docs/specs/2026-05-19-pause-fence-section-validation-design.md`(已过 Codex 5 轮对抗性 review 定稿)。本 plan 每个 Block 引用 design 对应章节;实施者遇歧义以 design 为准。

---

## Path Pre-flight Verify(writing-plans 阶段核查结论)

design §6.2 / §8.4 要求 writing-plans 核查的事实,已核实:

1. **工作流顺序** = `apply → review → verify → archive`(CLAUDE.md)。`review.md` 7b 跑 `forge evidence freeze --kind review`,`verify.md` 4.4 跑 `--kind verify`。**verify 是最后一次 freeze**,verify marker 的 `ack_log_tail_hash`/`ack_log_entry_count` 是 archive 时刻全量 ack-log 的快照。
2. **tasks.md task 行格式**:`parseTasks`(`src/core/parse/tasks.ts:32`)的 `TASK_RE = /^\s*- \[([ x])\]\s+([\w-]+)\s*:\s*(.+)$/` 要求 `- [x] task-id: desc`(冒号分隔)。现有 pause fixtures(`tests/fixtures/pause-decisions/*/tasks.md`)用 `- [x] **task-1** desc`(bold,无冒号)。`commands/propose.md` 不定义精确格式。**本 plan 决策:canonical 格式 = `parseTasks` 的 `- [x] task-id: desc`**(它是 archive 工具链唯一的真 task-id 解析器);Task 14 迁移 fixtures。
3. **CLI 注册**:`src/cli/index.ts` 用 `import { buildXxxCommand }` + `program.addCommand(buildXxxCommand())`;命令工厂模式见 `src/cli/commands/finding.ts`。
4. **release gate**:`scripts/check-release-gate.mjs` 只扫 `tests/integration/release-blocker-attack-path.test.ts`,`EXPECTED_TODO_COUNT_SOFT = 6`。`pnpm test` = `vitest run && pnpm test:gate`(soft);`pnpm test:gate:release` 跑 `--release`(硬约束 actual=0)。CI(`.github/workflows/ci.yml`)只跑 `pnpm test`(soft),无 release gate step。
5. **transaction.ts 失败回滚行为已实现**(阶段 1.5 rename / 1.6 Backup / 2 Sync 三处回滚 + summary unlink 齐全);`version-retrograde-fence.ts:73-81` git error fail-closed 已实现。Block A 纯补测试。
6. **`transaction-summary.test.ts:232-238`** 另有 3 个 `it.todo`(rename/Backup/Sync 失败),与 release-blocker 文件的 todo 3/4/5 镜像 —— 两处都需 unskip。
7. **fence 现签名** `validatePauseDecisionsFence(marker, changeDir, file?)`,`archive.ts:452`/`:463` 各调一次(verify / review marker);`archive.ts:555` 用 `process.cwd()` 作 repo root。
8. **process-evidence-fence** review ctx 用 review marker tail/count(`fence.ts:190-197`)—— 本特性 option=2 fence 不沿用,固定用 verify marker tail/count(design §6.2 Observation)。

---

## File Structure

**新建:**
- `src/core/parse/unified-diff.ts` — unified-diff 文本解析器:解析 `git diff` 输出为 hunk 列表,提供"新增行新文件行号"查询。单一职责,无副作用。
- `src/cli/commands/pause-capture.ts` — `forge pause-capture` 子命令工厂(`buildPauseCaptureCommand`)。
- `tests/core/parse/unified-diff.test.ts` — unified-diff parser 单测。
- `tests/cli/pause-capture.test.ts` — pause-capture 子命令单测。
- `tests/core/archive/pause-capture-fence.test.ts` — option=2 capture fence(`checkOption2TaskChecked`)单测。

**修改:**
- `src/core/archive/pause-decisions-fence.ts` — fence 签名加 repo root + option=2 链固化入参;option=1 加 diff 段级校验;重写 `checkOption2TaskChecked`。
- `src/core/ack-log.ts` — `AckLogEntry` union 加 `PauseCaptureEntry`。
- `src/core/archive/ack-log-consistency.ts` — 删本地 `AckLogEntry`,改 import。
- `src/core/markers/types.ts` — `PauseDecision` 加 `added_task_ref?` + `capture_id?`。
- `src/core/validate/marker-schema.ts` — 校验两个新字段(`undefined` 走 legacy 分支)。
- `src/cli/commands/archive.ts` — fence 调用传 repo root + verify marker tail/count;加 verify/review `pause_decisions` cross-check。
- `src/cli/index.ts` — 注册 `pause-capture` 子命令。
- `commands/apply.md` — Fluid Pause 段加 `forge pause-capture` 协议。
- `scripts/check-release-gate.mjs` — `EXPECTED_TODO_COUNT_SOFT` 6 → 0。
- `.github/workflows/ci.yml` — 加 `pnpm test:gate:release` step。
- `tests/integration/release-blocker-attack-path.test.ts` — 6 个 `it.todo` 全 unskip。
- `tests/core/archive/transaction-summary.test.ts` — 3 个 `it.todo` unskip。
- `tests/fixtures/pause-decisions/option-2-add-task/` — tasks.md 迁移 canonical 格式 + 加 capture fixture。
- `tests/cli/archive-pause-fence.test.ts` — 现有 option=2 测试同步新 schema。
- `docs/cli-reference.md` — 补 `pause-capture` 子命令。

---

# Phase 1 — Block A(TEST-ONLY)+ Block B(option=1)

## Task 1: Block A — transaction archiveSummary 失败回滚测试(todo 3/4/5)

**Files:**
- Modify: `tests/core/archive/transaction-summary.test.ts:232-238`(unskip 3 个 `it.todo`)
- Modify: `tests/integration/release-blocker-attack-path.test.ts:32-42`(unskip todo 3/4/5)
- Reference(行为已实现,勿改): `src/core/archive/transaction.ts`(阶段 1.5/1.6/2 回滚)

行为已实现(design §1.1),本 task 纯补测试。注入策略沿 `transaction-summary.test.ts` 已有 helper `setupForgeRoot()` / `buildSummary()`。

- [ ] **Step 1: 在 `transaction-summary.test.ts` 把 3 个 `it.todo`(`:232-238`)替换为真实 `it()`**

```ts
// 替换 transaction-summary.test.ts 末尾 3 个 it.todo —— 注入需 vi.spyOn,文件顶部 import 补 vi:
//   import { describe, it, expect, vi, afterEach } from 'vitest';
//   import * as specsSync from '../../../src/core/specs-sync/index.js';
// 并在 describe 内加 afterEach(() => vi.restoreAllMocks());

it('rename .tmp → 正式名失败 → 抛 --resume-summary 提示(archive 数据已 move)', async () => {
  const ctx = setupForgeRoot();
  try {
    // 注入:在 source changeDir 预建 archive_summary.yaml 为「目录」。
    // Move 把它一起搬到 archive 目录;阶段 1.5 rename(.tmp.yaml → archive_summary.yaml)
    // 目标已是目录 → rename 失败。
    mkdirSync(join(ctx.changeDir, 'archive_summary.yaml'), { recursive: true });
    await expect(
      archiveTransaction({
        forgeRoot: ctx.forgeRoot,
        changeId: 'add-x',
        archiveDate: '2026-05-12',
        archiveSummary: buildSummary('add-x'),
      }),
    ).rejects.toThrow(/--resume-summary/);
  } finally {
    ctx.cleanup();
  }
});

it('Backup 失败 → 反向 Move + unlink summary + 抛 Backup failed', async () => {
  const ctx = setupForgeRoot();
  try {
    // 注入:backupDir 路径预建为普通文件,cp(dir→file) 失败(沿 transaction.test.ts P2.2)
    const backupDir = join(ctx.forgeRoot, '.cache', `archive-sync-backup-${process.pid}`);
    writeFileSync(backupDir, 'blocker', 'utf8');
    await expect(
      archiveTransaction({
        forgeRoot: ctx.forgeRoot,
        changeId: 'add-x',
        archiveDate: '2026-05-12',
        archiveSummary: buildSummary('add-x'),
      }),
    ).rejects.toThrow(/Backup failed/);
    // 反向 Move:source changeDir 恢复
    expect(existsSync(ctx.changeDir)).toBe(true);
    // unlink summary:source 内不残留 archive_summary(.tmp).yaml
    expect(existsSync(join(ctx.changeDir, 'archive_summary.yaml'))).toBe(false);
    expect(existsSync(join(ctx.changeDir, 'archive_summary.tmp.yaml'))).toBe(false);
  } finally {
    ctx.cleanup();
  }
});

it('Sync 失败 → 反向 Move + restore specs + unlink summary + 抛 rolled back', async () => {
  const ctx = setupForgeRoot();
  try {
    writeFileSync(join(ctx.forgeRoot, 'specs', 'existing.md'), '# Existing\n', 'utf8');
    vi.spyOn(specsSync, 'applyDeltas').mockRejectedValueOnce(new Error('disk full (simulated)'));
    await expect(
      archiveTransaction({
        forgeRoot: ctx.forgeRoot,
        changeId: 'add-x',
        archiveDate: '2026-05-12',
        archiveSummary: buildSummary('add-x'),
      }),
    ).rejects.toThrow(/rolled back/);
    expect(existsSync(ctx.changeDir)).toBe(true);
    expect(existsSync(join(ctx.forgeRoot, 'specs', 'existing.md'))).toBe(true);
    expect(existsSync(join(ctx.changeDir, 'archive_summary.yaml'))).toBe(false);
    expect(existsSync(join(ctx.changeDir, 'archive_summary.tmp.yaml'))).toBe(false);
  } finally {
    ctx.cleanup();
  }
});
```

注:`transaction-summary.test.ts` 顶部 import 需补 `vi`、`mkdirSync`、`* as specsSync`(`mkdtempSync` 等已在)。`specs-sync` 的 `vi.mock` 声明沿 `transaction.test.ts:19-26`。

- [ ] **Step 2: 运行 `transaction-summary.test.ts` 确认 3 个新 `it()` 通过**

Run: `pnpm vitest run tests/core/archive/transaction-summary.test.ts`
Expected: PASS（行为已实现，测试应直接通过）。若 FAIL,说明注入未触发对应回滚分支 —— 对照 `transaction.ts` 阶段 1.5/1.6/2 调整注入。

- [ ] **Step 3: 在 `release-blocker-attack-path.test.ts` 把 todo 3/4/5(`:32-42` 的 describe 块)unskip 为真 `it()`**

`release-blocker-attack-path.test.ts` 是 release gate 的可执行清单,每个 todo 必须是真 `it()`。这 3 个 `it()` 复用同款注入,直接断言"抛错 + 回滚"(精简版,核心覆盖):

```ts
// 文件顶部 import 改为:
//   import { describe, it, expect, vi, afterEach } from 'vitest';
//   import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
//   import { join } from 'node:path';
//   import { tmpdir } from 'node:os';
//   import { archiveTransaction } from '../../src/core/archive/transaction.js';
//   import * as specsSync from '../../src/core/specs-sync/index.js';
//   import {
//     ARCHIVE_SUMMARY_VERSION, PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY, type ArchiveSummary,
//   } from '../../src/core/schemas/archive-summary.js';
// vi.mock('../../src/core/specs-sync/index.js', ...) 沿 transaction.test.ts:19-26

describe('release-blocker: 9e1 transaction failure injection paths (9z gate)', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-relblk-tx-'));
    const forgeRoot = join(tmpRoot, 'forge');
    mkdirSync(join(forgeRoot, 'changes', 'add-x', 'specs'), { recursive: true });
    mkdirSync(join(forgeRoot, 'specs'), { recursive: true });
    mkdirSync(join(forgeRoot, '.cache'), { recursive: true });
    writeFileSync(join(forgeRoot, 'changes', 'add-x', 'specs', 'x.md'), '# X spec\n', 'utf8');
    return { tmpRoot, forgeRoot, changeDir: join(forgeRoot, 'changes', 'add-x') };
  }
  function summary(): ArchiveSummary {
    return {
      schema: 'forge-archive-summary/v1',
      version: ARCHIVE_SUMMARY_VERSION,
      archived_at: '2026-05-12T16:45:00Z',
      change_id: 'add-x',
      verify_passed: { verified_invariants: [] },
      review_passed: { reviewers: ['ai-agent'] },
      process_evidence_summary: PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
      handoff_to_backlog: [],
      acked_warnings: [],
      pending_suggestions: [],
    };
  }

  it('9e1 transaction rename .tmp → 正式名失败 → 抛 --resume-summary 提示', async () => {
    const s = setup();
    try {
      mkdirSync(join(s.changeDir, 'archive_summary.yaml'), { recursive: true });
      await expect(
        archiveTransaction({ forgeRoot: s.forgeRoot, changeId: 'add-x', archiveDate: '2026-05-12', archiveSummary: summary() }),
      ).rejects.toThrow(/--resume-summary/);
    } finally {
      rmSync(s.tmpRoot, { recursive: true, force: true });
    }
  });

  it('9e1 transaction Backup 失败 → 反向 Move + unlink summary 残留', async () => {
    const s = setup();
    try {
      writeFileSync(join(s.forgeRoot, '.cache', `archive-sync-backup-${process.pid}`), 'x', 'utf8');
      await expect(
        archiveTransaction({ forgeRoot: s.forgeRoot, changeId: 'add-x', archiveDate: '2026-05-12', archiveSummary: summary() }),
      ).rejects.toThrow(/Backup failed/);
      expect(existsSync(s.changeDir)).toBe(true);
      expect(existsSync(join(s.changeDir, 'archive_summary.tmp.yaml'))).toBe(false);
    } finally {
      rmSync(s.tmpRoot, { recursive: true, force: true });
    }
  });

  it('9e1 transaction Sync 失败 → 反向 Move + restore specs + unlink summary 原子回滚', async () => {
    const s = setup();
    try {
      writeFileSync(join(s.forgeRoot, 'specs', 'existing.md'), '# Existing\n', 'utf8');
      vi.spyOn(specsSync, 'applyDeltas').mockRejectedValueOnce(new Error('sync fail (simulated)'));
      await expect(
        archiveTransaction({ forgeRoot: s.forgeRoot, changeId: 'add-x', archiveDate: '2026-05-12', archiveSummary: summary() }),
      ).rejects.toThrow(/rolled back/);
      expect(existsSync(s.changeDir)).toBe(true);
      expect(existsSync(join(s.forgeRoot, 'specs', 'existing.md'))).toBe(true);
    } finally {
      rmSync(s.tmpRoot, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 4: 运行 release-blocker 文件确认 3 个 transaction `it()` 通过**

Run: `pnpm vitest run tests/integration/release-blocker-attack-path.test.ts -t "transaction"`
Expected: 3 个 transaction `it()` PASS。

- [ ] **Step 5: Commit**

```bash
git add tests/core/archive/transaction-summary.test.ts tests/integration/release-blocker-attack-path.test.ts
git commit -m "test(archive): unskip transaction archiveSummary 失败回滚测试(todo 3/4/5)"
```

---

## Task 2: Block A — version-retrograde git log fail-closed 测试(todo 6)

**Files:**
- Modify: `tests/integration/release-blocker-attack-path.test.ts`(unskip todo 6)
- Modify: `tests/core/archive/version-retrograde-fence.test.ts:101-103`(unskip `it.todo`)
- Reference(行为已实现,勿改): `src/core/archive/version-retrograde-fence.ts:50-81`

`version-retrograde-fence.ts` 在 `rev-parse --is-inside-work-tree` 成功(确认是 git repo)后,若 `git log -p` 失败 → fail-closed 拒签(`:73-81`)。注入需让 `rev-parse` 成功、`git log` 失败 —— mock `node:child_process` 的 `execFile`。

- [ ] **Step 1: 在 `version-retrograde-fence.test.ts` 把 `it.todo`(`:101-103`)替换为真实 `it()`**

```ts
// 文件顶部加 mock(vi.mock 提升到 import 前):
//   import { describe, it, expect, afterEach, vi } from 'vitest';
// 在现有 import 之上加:
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual };
});
// import 之后:
import * as childProcess from 'node:child_process';

// 替换 it.todo —— 真实 it():
it('git repo 内 git log 失败 → fail-closed 拒签(v3 MAJOR 1)', async () => {
  // mock execFile:rev-parse 成功(确认是 git repo),git log 失败(模拟 git binary 异常)。
  // version-retrograde-fence.ts 用 promisify(execFile);mock 须模拟 callback 形态。
  vi.spyOn(childProcess, 'execFile').mockImplementation(
    // @ts-expect-error — 仅模拟用到的 callback 重载
    (_cmd: string, args: readonly string[], _opts: unknown, cb: (e: Error | null, r?: { stdout: string }) => void) => {
      if (args[0] === 'rev-parse') {
        cb(null, { stdout: 'true\n' }); // 确认是 git repo
      } else {
        cb(new Error('git log: simulated binary failure')); // git log fail-closed
      }
      return {} as ReturnType<typeof childProcess.execFile>;
    },
  );
  const marker = { created_by_tool_version: '1.0.0' };
  // gitDir 任意非空(rev-parse 已被 mock 成功)
  const result = await validateVersionRetrograde('/tmp/fake/.verify-passed', marker, '/tmp/fake');
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => /fail-closed|git log/.test(e.message))).toBe(true);
});
```

注:`version-retrograde-fence.ts` 用 `promisify(execFile)`。`promisify` 把 `(cmd, args, opts, cb)` 形态转 Promise;mock 的 `execFile` 须以 callback 形态返回(`cb(err)` / `cb(null, {stdout})`)。若 mock 形态与 `promisify` 不兼容导致测试 hang/报错,改用 `vi.mock` 整体替换 `execFile` 为返回 callback 的 stub(参考 vitest `vi.mock` factory 文档)。

- [ ] **Step 2: 运行确认通过**

Run: `pnpm vitest run tests/core/archive/version-retrograde-fence.test.ts`
Expected: 全部 PASS,含新增的 fail-closed `it()`。

- [ ] **Step 3: 在 `release-blocker-attack-path.test.ts` unskip todo 6 为真 `it()`**

```ts
// describe('release-blocker: 9j version-retrograde fail-closed git error path (9z gate)', ...)
// 内,把 it.todo 替换为真 it() —— 复用 Step 1 同款 mock 注入。
// 文件顶部 import 补:
//   import { validateVersionRetrograde } from '../../src/core/archive/version-retrograde-fence.js';
//   import * as childProcess from 'node:child_process';
//   + vi.mock('node:child_process', ...) 同 Step 1

it('9j git repo 内 git log 失败(模拟 git binary 异常)→ version-retrograde fail-closed 拒签', async () => {
  vi.spyOn(childProcess, 'execFile').mockImplementation(
    // @ts-expect-error — 仅模拟用到的 callback 重载
    (_cmd: string, args: readonly string[], _opts: unknown, cb: (e: Error | null, r?: { stdout: string }) => void) => {
      if (args[0] === 'rev-parse') cb(null, { stdout: 'true\n' });
      else cb(new Error('git log: simulated failure'));
      return {} as ReturnType<typeof childProcess.execFile>;
    },
  );
  const result = await validateVersionRetrograde('/tmp/fake/.verify-passed', { created_by_tool_version: '1.0.0' }, '/tmp/fake');
  expect(result.valid).toBe(false);
});
```

- [ ] **Step 4: 运行确认**

Run: `pnpm vitest run tests/integration/release-blocker-attack-path.test.ts -t "version-retrograde"`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add tests/core/archive/version-retrograde-fence.test.ts tests/integration/release-blocker-attack-path.test.ts
git commit -m "test(archive): unskip version-retrograde git log fail-closed 测试(todo 6)"
```

---

## Task 3: Block B — unified-diff hunk parser 新模块

**Files:**
- Create: `src/core/parse/unified-diff.ts`
- Create: `tests/core/parse/unified-diff.test.ts`

design §5.1。解析 `git diff` 文本为 hunk 列表,提供"某 hunk 新增行的新文件行号"查询。纯函数,无 IO。

- [ ] **Step 1: 写失败测试 `tests/core/parse/unified-diff.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff, addedLineNumbers } from '../../../src/core/parse/unified-diff.js';

// 一段真实 git diff(改了 proposal.md:新文件第 8-9 行新增)
const SAMPLE = `diff --git a/proposal.md b/proposal.md
index 1111111..2222222 100644
--- a/proposal.md
+++ b/proposal.md
@@ -6,3 +6,5 @@
 ## What Changes
 
-- old item
+- new item A
+- new item B
+- new item C
 ## Impact
`;

describe('parseUnifiedDiff', () => {
  it('解析 hunk 头与增删行', () => {
    const hunks = parseUnifiedDiff(SAMPLE);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.newStart).toBe(6);
    expect(hunks[0]!.added.map((l) => l.content)).toEqual(['- new item A', '- new item B', '- new item C']);
  });

  it('addedLineNumbers 返回新增行在新文件中的行号', () => {
    const hunks = parseUnifiedDiff(SAMPLE);
    // hunk newStart=6;上下文行 "## What Changes"(6)、""(7)、被删行不占新文件行、
    // 新增 A=8 B=9 C=10、上下文 "## Impact"(11)
    expect(addedLineNumbers(hunks)).toEqual([8, 9, 10]);
  });

  it('空 diff(无未提交修改)→ 空 hunk 列表', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });

  it('多文件 diff → 各文件 hunk 都解析', () => {
    const multi = SAMPLE + `diff --git a/tasks.md b/tasks.md
--- a/tasks.md
+++ b/tasks.md
@@ -1,1 +1,2 @@
 # Tasks
+- [ ] task-2: new
`;
    const hunks = parseUnifiedDiff(multi);
    expect(hunks.length).toBe(2);
  });
});
```

- [ ] **Step 2: 运行确认 FAIL**

Run: `pnpm vitest run tests/core/parse/unified-diff.test.ts`
Expected: FAIL — "parseUnifiedDiff is not exported / not defined"。

- [ ] **Step 3: 写实现 `src/core/parse/unified-diff.ts`**

```ts
// src/core/parse/unified-diff.ts — option=1 diff 段级校验用的 unified-diff 解析器(plan pause-fence Block B)
// 解析 `git diff` 文本输出为 hunk 列表;只关心增删行 + 新文件行号,不做 IO。

/** unified-diff 一个 hunk 内的一行变更 */
export interface DiffLine {
  /** '+' 新增 / '-' 删除 */
  kind: '+' | '-';
  /** 行内容(去掉前缀 +/-) */
  content: string;
  /** 该行在「新文件」中的行号(仅 kind='+' 有意义;kind='-' 为 null) */
  newLineNumber: number | null;
}

/** 一个 unified-diff hunk */
export interface DiffHunk {
  /** hunk 头 `@@ -a,b +c,d @@` 中的 c(新文件起始行号,1-indexed) */
  newStart: number;
  /** 本 hunk 内所有新增行(kind='+') */
  added: DiffLine[];
  /** 本 hunk 内所有删除行(kind='-') */
  removed: DiffLine[];
}

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * 解析 `git diff` 文本输出为 hunk 列表。
 * @param diffText `git diff HEAD -- <file>` 的 stdout(可为空 → 返回 [])
 */
export function parseUnifiedDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  if (!diffText.trim()) return hunks;

  const lines = diffText.split('\n');
  let current: DiffHunk | null = null;
  // 新文件行游标:遇 hunk 头重置为 newStart;上下文行/新增行 +1,删除行不动。
  let newCursor = 0;

  for (const line of lines) {
    const hunkMatch = line.match(HUNK_HEADER_RE);
    if (hunkMatch) {
      current = { newStart: parseInt(hunkMatch[1]!, 10), added: [], removed: [] };
      hunks.push(current);
      newCursor = current.newStart;
      continue;
    }
    if (!current) continue; // hunk 头之前的文件头(diff --git / --- / +++)忽略

    // git diff 文件头行(下一文件)会以 'diff --git' 开头 → 关闭当前 hunk 上下文
    if (line.startsWith('diff --git')) {
      current = null;
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue; // 文件头,非内容

    if (line.startsWith('+')) {
      current.added.push({ kind: '+', content: line.slice(1), newLineNumber: newCursor });
      newCursor += 1;
    } else if (line.startsWith('-')) {
      current.removed.push({ kind: '-', content: line.slice(1), newLineNumber: null });
      // 删除行不占新文件行号,newCursor 不动
    } else {
      // 上下文行(以空格开头,或空行)→ 占新文件一行
      newCursor += 1;
    }
  }
  return hunks;
}

/** 收集所有 hunk 的新增行在「新文件」中的行号(升序去重) */
export function addedLineNumbers(hunks: DiffHunk[]): number[] {
  const nums = new Set<number>();
  for (const h of hunks) {
    for (const l of h.added) {
      if (l.newLineNumber !== null) nums.add(l.newLineNumber);
    }
  }
  return [...nums].sort((a, b) => a - b);
}
```

- [ ] **Step 4: 运行确认 PASS**

Run: `pnpm vitest run tests/core/parse/unified-diff.test.ts`
Expected: PASS（4 个测试全绿）。

- [ ] **Step 5: typecheck + commit**

```bash
pnpm typecheck
git add src/core/parse/unified-diff.ts tests/core/parse/unified-diff.test.ts
git commit -m "feat(parse): 加 unified-diff hunk parser(option=1 diff 段级校验用)"
```

---

## Task 4: Block B — fence 加 repo root 参数 + archive.ts 接线

**Files:**
- Modify: `src/core/archive/pause-decisions-fence.ts:40-44`(`validatePauseDecisionsFence` 签名)
- Modify: `src/cli/commands/archive.ts:452-467`(两处调用)
- Modify: `tests/cli/archive-pause-fence.test.ts`(调用同步)

design §5.2。本 task 只扩签名 + 接线,不加 option=1 校验逻辑(Task 5 加)。`repoRoot` 暂不被任何分支使用 —— 用 `void repoRoot;` 占位避免 lint unused,Task 5 接入。

- [ ] **Step 1: 改 `validatePauseDecisionsFence` 签名**

`pause-decisions-fence.ts:40-44`,签名加第 3 个参数 `repoRoot`:

```ts
export async function validatePauseDecisionsFence(
  marker: Record<string, unknown>,
  changeDir: string,
  repoRoot: string,
  file?: string,
): Promise<ValidationResult> {
  void repoRoot; // Task 5 接入 option=1 diff 校验后移除
  // ... 函数体不变
```

- [ ] **Step 2: 改 `archive.ts` 两处调用传 `process.cwd()`**

`archive.ts:452-456` 与 `:463-467`,各加 `process.cwd()` 作第 3 参:

```ts
const pdVerifyResult = await validatePauseDecisionsFence(
  verifyRec,
  changeDir,
  process.cwd(),
  verifyPath,
);
// ... 同样改 pdReviewResult 调用(reviewRec / reviewPath)
```

- [ ] **Step 3: 改 `archive-pause-fence.test.ts` 所有 `validatePauseDecisionsFence(...)` 调用**

现有测试调用形如 `validatePauseDecisionsFence(marker, changeDir)` / `(marker, changeDir, file)`。统一改为 **3 参** `(marker, changeDir, changeDir)` —— 加 repo root(测试用 `changeDir` 占位,option=1 git diff 不在这些 case 跑),并**去掉 `file` 参数**(`file` 仅错误报告用,测试无需;且 Task 11 会在第 4 位插入 `opts`,保留 `file` 会参数错位):

```ts
// await validatePauseDecisionsFence({}, changeDir)       → (..., changeDir, changeDir)
// await validatePauseDecisionsFence(m, changeDir, file)  → (m, changeDir, changeDir)   // 删 file
```

用编辑器逐个核对参数位置。

- [ ] **Step 4: 运行 + typecheck**

Run: `pnpm vitest run tests/cli/archive-pause-fence.test.ts && pnpm typecheck`
Expected: PASS（签名变更后所有现有测试仍绿）。

- [ ] **Step 5: Commit**

```bash
git add src/core/archive/pause-decisions-fence.ts src/cli/commands/archive.ts tests/cli/archive-pause-fence.test.ts
git commit -m "refactor(fence): validatePauseDecisionsFence 加 repoRoot 参数(option=1 diff 校验前置)"
```

---

## Task 5: Block B — option=1 diff 段级校验逻辑

**Files:**
- Modify: `src/core/archive/pause-decisions-fence.ts:82-105`(option=1 分支)
- Modify: `tests/cli/archive-pause-fence.test.ts`(加 option=1 diff 测试)

design §5.3。option=1 现有字段校验之上,加:跑 `git diff HEAD -- <changeDir>/proposal.md`,验 `## What Changes` 段确有新增行(`+`)。

- [ ] **Step 1: 写失败测试(option=1 attack + happy + frontmatter + 非 git)**

在 `archive-pause-fence.test.ts` 加一个 `describe('option=1 diff 段级校验', ...)`。测试需真 git repo(`git init` + commit proposal.md baseline,再改 proposal.md 留工作树未提交)。helper:

```ts
import { execFileSync } from 'node:child_process';

// 在 git repo 内建 change + proposal.md,baseline commit 后按 mutate 改 proposal.md(不 commit)
function setupGitChange(opts: {
  proposalBaseline: string;
  proposalMutated: string;
  tasksBaseline: string;
  tasksMutated?: string;
}): { repoRoot: string; changeDir: string } {
  const repoRoot = mkdtempSync(join(tmpdir(), 'forge-opt1-'));
  execFileSync('git', ['init', '-q'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repoRoot });
  const changeDir = join(repoRoot, 'forge', 'changes', 'c1');
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(join(changeDir, 'proposal.md'), opts.proposalBaseline);
  writeFileSync(join(changeDir, 'tasks.md'), opts.tasksBaseline);
  execFileSync('git', ['add', '-A'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-q', '-m', 'baseline'], { cwd: repoRoot });
  // mutate(留工作树未提交 —— 模拟 Fluid Pause 的 proposal.md 改动)
  writeFileSync(join(changeDir, 'proposal.md'), opts.proposalMutated);
  if (opts.tasksMutated) writeFileSync(join(changeDir, 'tasks.md'), opts.tasksMutated);
  return { repoRoot, changeDir };
}

const OPT1_DECISION = {
  id: 1, paused_at: '2026-05-12T14:30:00Z', task_ref: 'tasks.md#task-1',
  issue_summary: 'expand scope', severity: 'WARNING' as const,
  severity_acked_by: 'msc', severity_acked_at: '2026-05-12T14:32:00Z',
  chosen_option: 1 as const, target_artifact: 'proposal.md', target_anchor: '## What Changes',
  non_blocking_rationale: null, other_rationale: null, other_acked_by: null,
};
```

测试:

```ts
describe('option=1 diff 段级校验', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  it('attack:marker 声称改 proposal ## What Changes,实际 diff 只改 tasks.md → 拒签', async () => {
    const { repoRoot, changeDir } = setupGitChange({
      proposalBaseline: '# P\n\n## What Changes\n\n- a\n\n## Impact\n\n- x\n',
      proposalMutated: '# P\n\n## What Changes\n\n- a\n\n## Impact\n\n- x\n', // proposal 未改
      tasksBaseline: '# Tasks\n\n- [ ] task-1: t\n',
      tasksMutated: '# Tasks\n\n- [x] task-1: t\n', // 只改了 tasks.md
    });
    dirs.push(repoRoot);
    const result = await validatePauseDecisionsFence(
      { pause_decisions: [OPT1_DECISION] }, changeDir, repoRoot,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /What Changes.*变更|diff/.test(e.message))).toBe(true);
  });

  it('happy path:proposal ## What Changes 段确有新增行 → 通过', async () => {
    const { repoRoot, changeDir } = setupGitChange({
      proposalBaseline: '# P\n\n## What Changes\n\n- a\n\n## Impact\n\n- x\n',
      proposalMutated: '# P\n\n## What Changes\n\n- a\n- b (扩 scope)\n\n## Impact\n\n- x\n',
      tasksBaseline: '# Tasks\n\n- [x] task-1: t\n',
    });
    dirs.push(repoRoot);
    const result = await validatePauseDecisionsFence(
      { pause_decisions: [OPT1_DECISION] }, changeDir, repoRoot,
    );
    expect(result.valid).toBe(true);
  });

  it('proposal.md 带 frontmatter → ## What Changes 段行号对齐正确', async () => {
    const fm = '---\ntitle: P\n---\n';
    const { repoRoot, changeDir } = setupGitChange({
      proposalBaseline: fm + '# P\n\n## What Changes\n\n- a\n\n## Impact\n\n- x\n',
      proposalMutated: fm + '# P\n\n## What Changes\n\n- a\n- b\n\n## Impact\n\n- x\n',
      tasksBaseline: '# Tasks\n\n- [x] task-1: t\n',
    });
    dirs.push(repoRoot);
    const result = await validatePauseDecisionsFence(
      { pause_decisions: [OPT1_DECISION] }, changeDir, repoRoot,
    );
    expect(result.valid).toBe(true);
  });

  it('非 git 项目 → diff 校验 N/A,降级到字段校验(通过)', async () => {
    const changeDir = mkdtempSync(join(tmpdir(), 'forge-opt1-nogit-'));
    dirs.push(changeDir);
    // repoRoot 非 git → 降级;字段校验:target_artifact/target_anchor 合法 → 通过
    const result = await validatePauseDecisionsFence(
      { pause_decisions: [OPT1_DECISION] }, changeDir, changeDir,
    );
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认 FAIL**

Run: `pnpm vitest run tests/cli/archive-pause-fence.test.ts -t "option=1 diff"`
Expected: attack 测试 FAIL（现 fence 未做 diff 校验,attack 路径未拦）。

- [ ] **Step 3: 实现 option=1 diff 段级校验**

`pause-decisions-fence.ts`:移除 Task 4 的 `void repoRoot;`;在 option=1 分支(`:82` 起 `if (p.chosen_option === 1)`)现有字段校验之后加 diff 校验。新增一个 helper 函数 `checkOption1WhatChangesDiff`:

```ts
// 文件顶部 import 补:
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseUnifiedDiff, addedLineNumbers } from '../parse/unified-diff.js';
const execFileAsync = promisify(execFile);

/**
 * option=1 diff 段级校验:proposal.md 的 git diff 中,`## What Changes` 段须确有新增行。
 * 沿 design §5.3。非 git → N/A 降级(返回 ok);git 项目内 git diff 失败 → fail-closed 拒签。
 */
async function checkOption1WhatChangesDiff(
  p: PauseDecision, changeDir: string, repoRoot: string, fieldBase: string, file?: string,
): Promise<ValidationResult> {
  // 1. 非 git 项目 → diff 校验 N/A,降级(沿 version-retrograde-fence 先例)
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repoRoot });
  } catch {
    return ok(); // 非 git → 降级到已通过的字段校验
  }
  // 2. git diff HEAD -- <changeDir>/proposal.md
  const proposalPath = join(changeDir, 'proposal.md');
  let diffText: string;
  try {
    const { stdout } = await execFileAsync('git', ['diff', 'HEAD', '--', proposalPath], {
      cwd: repoRoot, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024,
    });
    diffText = stdout;
  } catch (err) {
    // git 项目内 git diff 失败 → fail-closed(沿 version-retrograde-fence:73-81)
    return failed({
      artifact: 'marker', field: `${fieldBase}.target_anchor`,
      message: `option=1 校验失败:git diff proposal.md 失败(${(err as Error).message})— fail-closed 拒签`,
      file,
    });
  }
  // 3. 求 `## What Changes` 段在 proposal.md 原始文件中的行号区间 [start, end)
  //    直接扫原始文本(不用 parseMarkdown —— 它剥 frontmatter 后行号有偏移,design §5.3)
  const content = await readFile(proposalPath, 'utf8');
  const srcLines = content.split('\n');
  let wcStart = -1; let wcEnd = srcLines.length;
  for (let i = 0; i < srcLines.length; i++) {
    if (/^##\s+What Changes\s*$/.test(srcLines[i] ?? '')) { wcStart = i + 1; continue; } // 1-indexed
    if (wcStart >= 0 && /^##\s/.test(srcLines[i] ?? '') && i + 1 > wcStart) { wcEnd = i + 1; break; }
  }
  if (wcStart < 0) {
    return failed({
      artifact: 'marker', field: `${fieldBase}.target_anchor`,
      message: `option=1 校验失败:proposal.md 找不到 \`## What Changes\` 段`,
      file,
    });
  }
  // 4. diff 新增行须有落在 [wcStart, wcEnd) 区间内的
  const added = addedLineNumbers(parseUnifiedDiff(diffText));
  const inSection = added.some((ln) => ln >= wcStart && ln < wcEnd);
  if (!inSection) {
    return failed({
      artifact: 'marker', field: `${fieldBase}.target_anchor`,
      message: `option=1(扩 scope)校验失败:git diff 中 proposal.md \`## What Changes\` 段无新增行 — marker 声称扩 scope 但实际未改该段(沿 design §2.1.5 line 262)`,
      file,
    });
  }
  return ok();
}
```

在 option=1 分支末尾(`:105` 现有 `target_anchor` 字段校验之后)调用:

```ts
// option=1 分支内,现有 target_artifact / target_anchor 字段校验之后追加:
results.push(await checkOption1WhatChangesDiff(p, changeDir, repoRoot, fieldBase, file));
```

并删除 `:84-86` 的 `TODO(9e1)` 注释(改为指向本特性已实现)。

- [ ] **Step 4: 运行确认 PASS**

Run: `pnpm vitest run tests/cli/archive-pause-fence.test.ts`
Expected: 全 PASS（含 option=1 的 attack/happy/frontmatter/非 git 4 测试）。

- [ ] **Step 5: typecheck + commit**

```bash
pnpm typecheck
git add src/core/archive/pause-decisions-fence.ts tests/cli/archive-pause-fence.test.ts
git commit -m "feat(fence): option=1 diff 段级校验 — 验 proposal ## What Changes 段确有变更"
```

---

## Task 6: Block B — unskip todo 1(option=1 attack path)

**Files:**
- Modify: `tests/integration/release-blocker-attack-path.test.ts`(unskip todo 1)

todo 1 是 release gate 的 option=1 attack 可执行 gate。逻辑同 Task 5 的 attack 测试,在 release-blocker 文件里写真 `it()`。

- [ ] **Step 1: unskip todo 1 为真 `it()`**

```ts
// describe('release-blocker: pause_decisions option=1/2 attack paths (9z gate)', ...) 内,
// 把 option=1 的 it.todo 替换为真 it()。文件顶部 import 补(若未在 Task 1 加):
//   import { validatePauseDecisionsFence } from '../../src/core/archive/pause-decisions-fence.js';
//   import { execFileSync } from 'node:child_process';

it('option=1 attack:marker 写 target_anchor=## What Changes 但 diff 只改 tasks.md → fence 拒签', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'forge-relblk-opt1-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repoRoot });
    const changeDir = join(repoRoot, 'forge', 'changes', 'c1');
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(changeDir, 'proposal.md'), '# P\n\n## What Changes\n\n- a\n\n## Impact\n\n- x\n');
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [ ] task-1: t\n');
    execFileSync('git', ['add', '-A'], { cwd: repoRoot });
    execFileSync('git', ['commit', '-q', '-m', 'baseline'], { cwd: repoRoot });
    // attack:只改 tasks.md,proposal.md 不动,但 marker 声称 option=1 改了 What Changes
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [x] task-1: t\n');
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [{
          id: 1, paused_at: '2026-05-12T14:30:00Z', task_ref: 'tasks.md#task-1',
          issue_summary: 'x', severity: 'WARNING', severity_acked_by: 'msc',
          severity_acked_at: '2026-05-12T14:32:00Z', chosen_option: 1,
          target_artifact: 'proposal.md', target_anchor: '## What Changes',
          non_blocking_rationale: null, other_rationale: null, other_acked_by: null,
        }],
      },
      changeDir, repoRoot,
    );
    expect(result.valid).toBe(false);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 运行确认**

Run: `pnpm vitest run tests/integration/release-blocker-attack-path.test.ts -t "option=1 attack"`
Expected: PASS。

- [ ] **Step 3: Phase 1 全量验证**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run`
Expected: 全 PASS。此时 `release-blocker-attack-path.test.ts` 剩 1 个 `it.todo`(option=2,Phase 2 处理)。

- [ ] **Step 4: Commit**

```bash
git add tests/integration/release-blocker-attack-path.test.ts
git commit -m "test(release-gate): unskip option=1 attack-path todo(diff 段级校验已拦)"
```

---

# Phase 2 — Block C(option=2 轻量 capture)

## Task 7: Block C — ack-log `PauseCaptureEntry` schema

**Files:**
- Modify: `src/core/ack-log.ts:55-56`(`AckLogEntry` union)+ 新增 interface
- Create: `tests/core/ack-log-pause-capture.test.ts`

design §6.3。`AckLogEntry` 判别联合加 `PauseCaptureEntry`。`appendAckLog` / `readAllAckLogEntries` / `verifyAckLogChain` 已是 kind-agnostic,加 union 成员即自动支持。

- [ ] **Step 1: 写失败测试 `tests/core/ack-log-pause-capture.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendAckLog, readAllAckLogEntries, verifyAckLogChain,
  type PauseCaptureEntry,
} from '../../src/core/ack-log.js';
import { canonicalHash } from '../../src/core/canonical-json.js';

describe('ack-log PauseCaptureEntry', () => {
  it('appendAckLog 写 pause-capture entry → readAll 读回 + 链自洽', async () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-pc-acklog-'));
    try {
      const entry: PauseCaptureEntry = {
        schema: 'forge-ack-log/v1', kind: 'pause-capture',
        timestamp: '2026-05-12T14:25:00Z', capture_id: 'cap-uuid-1',
        change_id: 'c1', task_ref: 'tasks.md#task-3',
        pause_issue_summary: 'OAuth refresh', tasks_md_task_ids: ['task-1', 'task-2'],
        git_head: null, extra: {},
      };
      await appendAckLog(root, entry);
      const all = await readAllAckLogEntries(root);
      expect(all).toHaveLength(1);
      expect(all[0]!.kind).toBe('pause-capture');
      expect((all[0] as PauseCaptureEntry).capture_id).toBe('cap-uuid-1');
      // 链自洽:单条 entry,prev=null
      const chain = verifyAckLogChain(all, canonicalHash(all[0]!), 1);
      expect(chain.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 运行确认 FAIL**

Run: `pnpm vitest run tests/core/ack-log-pause-capture.test.ts`
Expected: FAIL — `PauseCaptureEntry` 未导出。

- [ ] **Step 3: 在 `ack-log.ts` 加 `PauseCaptureEntry` + 扩 union**

`ack-log.ts`,在 `EvidenceHelperEntry` interface 之后、`AckLogEntry` type 之前加:

```ts
/** pause-capture 操作日志条目(kind='pause-capture')— plan pause-fence Block C
 *  Fluid Pause 触发时 `forge pause-capture` 写入,记录 pause 时刻 tasks.md 的全部 task id。
 *  沿全 JSONL 链:prev_entry_hash 跨 kind 递推(同 AckEntry / EvidenceHelperEntry)。 */
export interface PauseCaptureEntry {
  schema: 'forge-ack-log/v1';
  kind: 'pause-capture';
  timestamp: string; // ISO 8601 UTC
  capture_id: string; // crypto.randomUUID();marker.pause_decisions[].capture_id 据此定位
  change_id: string;
  task_ref: string; // 触发 pause 的 task
  pause_issue_summary: string;
  tasks_md_task_ids: string[]; // capture 时刻 tasks.md 全部 task id(parseTasks 解析)
  git_head: string | null;
  prev_entry_hash?: string | null;
  extra: Record<string, unknown>;
}
```

`AckLogEntry` union 改为:

```ts
/** ack 日志条目判别联合 */
export type AckLogEntry = AckEntry | EvidenceHelperEntry | PauseCaptureEntry;
```

- [ ] **Step 4: 运行确认 PASS + typecheck**

Run: `pnpm vitest run tests/core/ack-log-pause-capture.test.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/core/ack-log.ts tests/core/ack-log-pause-capture.test.ts
git commit -m "feat(ack-log): AckLogEntry union 加 PauseCaptureEntry(option=2 capture 用)"
```

---

## Task 8: Block C — `ack-log-consistency.ts` 类型去重

**Files:**
- Modify: `src/core/archive/ack-log-consistency.ts:14-26`(删本地 `AckLogEntry`)

design §6.3 / round 1 NIT #9。`ack-log-consistency.ts` 有一份本地 `AckLogEntry`(只含 `'ack' | 'evidence-helper'`)。删它,改 import 正式定义。

- [ ] **Step 1: 删本地 interface,改 import**

`ack-log-consistency.ts`:删除 `:14-26` 的本地 `interface AckLogEntry { ... }`。在文件顶部 import 区加:

```ts
import type { AckLogEntry } from '../ack-log.js';
```

`:96-100` 的 `.map((line) => JSON.parse(line) as AckLogEntry).filter((e) => e.kind === 'ack')` —— `filter((e) => e.kind === 'ack')` 已是 type guard,过滤后得 `AckEntry[]`。但下游用 `ackEntries.find(...)` 访问 `e.finding_id` / `e.action` 等 `AckEntry` 专属字段。改 `ackEntries` 的类型标注:

```ts
// :93 附近
let ackEntries: AckEntry[] = [];
// :96-100
ackEntries = ackText
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line) as AckLogEntry)
  .filter((e): e is AckEntry => e.kind === 'ack'); // type guard:过滤后是 AckEntry
```

import 区补 `import type { AckEntry } from '../ack-log.js';`(与 `AckLogEntry` 同行或分行)。

- [ ] **Step 2: typecheck + 运行现有 ack-log 一致性测试**

Run: `pnpm typecheck && pnpm vitest run tests/cli/archive-pause-fence.test.ts tests/cli/ack-log-pause-decisions.test.ts`
Expected: PASS（去重不改行为,现有测试仍绿）。若有专门的 ack-log-consistency 测试文件,一并跑。

- [ ] **Step 3: Commit**

```bash
git add src/core/archive/ack-log-consistency.ts
git commit -m "refactor(ack-log): ack-log-consistency 删本地 AckLogEntry,改 import 正式定义"
```

---

## Task 9: Block C — `PauseDecision` 加 `added_task_ref` + `capture_id`

**Files:**
- Modify: `src/core/markers/types.ts:70-96`(`PauseDecision` interface)
- Modify: `src/core/validate/marker-schema.ts:756-769`(nullable 字段校验段)
- Modify: `tests/core/markers/pause-decisions-schema.test.ts`

design §6.3。两个新字段 schema 层 **optional**(`?`);`undefined` 不可 fail(gen-0 老 marker 无此字段)。

- [ ] **Step 1: 写失败测试 — `pause-decisions-schema.test.ts` 加 case**

在 `tests/core/markers/pause-decisions-schema.test.ts` 加:

```ts
it('PauseDecision 缺 added_task_ref / capture_id → schema 通过(superset additive)', () => {
  // 一个不含两新字段的 option=2 pause_decision 应通过 schema 校验
  // (必填性由 fence 层判,非 schema 层)
  const marker = {
    schema: 'forge-verify/v1', verified_at: '2026-05-12T14:30:00Z', verified_by: 'ai-agent',
    tasks_hash: 'sha256:x', content_hash: 'sha256:x', evidence: [],
    pause_decisions: [{
      id: 1, paused_at: '2026-05-12T14:30:00Z', task_ref: 'tasks.md#task-1',
      issue_summary: 'x', severity: 'WARNING', severity_acked_by: 'msc',
      severity_acked_at: '2026-05-12T14:32:00Z', chosen_option: 2,
      target_artifact: 'tasks.md', target_anchor: '- task-2',
      non_blocking_rationale: null, other_rationale: null, other_acked_by: null,
    }],
  };
  const result = validateMarkerSchema(marker); // 用文件内现有的 schema 校验入口
  expect(result.valid).toBe(true);
});

it('PauseDecision added_task_ref / capture_id 类型错(非 string 非 null)→ schema 拒签', () => {
  const marker = { /* ...同上 marker... */ };
  (marker.pause_decisions[0] as Record<string, unknown>).added_task_ref = 123; // 非法类型
  const result = validateMarkerSchema(marker);
  expect(result.valid).toBe(false);
});
```

注:`validateMarkerSchema` 的精确入口名/签名以 `pause-decisions-schema.test.ts` 现有 import 为准(沿文件内现有用法)。

- [ ] **Step 2: 运行确认 FAIL**

Run: `pnpm vitest run tests/core/markers/pause-decisions-schema.test.ts`
Expected: 第 2 个 case FAIL（现 schema 不校验未知字段 `added_task_ref`,类型错的不会被拒）。

- [ ] **Step 3: `markers/types.ts` 加两字段**

`PauseDecision` interface(`:70-96`),在 `other_acked_by` 之后加:

```ts
  /** option=2 新增的 task(末段 tasks.md#task-N);厘清 task_ref 语义 —— task_ref = 触发 pause 的 task。
   *  schema 层 optional(superset additive,老 marker 无);必填性由 fence 层按 chosen_option 判。 */
  added_task_ref?: string | null;
  /** option=2 关联的 pause-capture entry 的 capture_id;schema 层 optional,同上。 */
  capture_id?: string | null;
```

- [ ] **Step 4: `marker-schema.ts` 加两字段校验**

`marker-schema.ts:756-769` 的 nullable 字段校验循环当前是 `['non_blocking_rationale', 'other_rationale', 'other_acked_by']`。**不能**把新字段加进这个循环 —— 该循环对字段缺失(`undefined`)会 fail(`val !== null && (typeof val !== 'string' ...)` 对 undefined 成立 → push failed)。新字段须单独处理,允许 `undefined`:

```ts
// 在 :756-769 的循环之后追加 —— added_task_ref / capture_id:undefined(老 marker)跳过,
// 存在则须 null 或 non-empty string
for (const field of ['added_task_ref', 'capture_id']) {
  const val = p[field];
  if (val === undefined) continue; // superset additive:老 marker 缺字段 → 跳过(legacy 分支)
  if (val !== null && (typeof val !== 'string' || !val)) {
    results.push(
      failed({
        artifact: 'marker',
        field: `${fieldBase}.${field}`,
        message: 'must be undefined / null / non-empty string',
        file,
      }),
    );
  }
}
```

- [ ] **Step 5: 运行确认 PASS + typecheck**

Run: `pnpm vitest run tests/core/markers/pause-decisions-schema.test.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/core/markers/types.ts src/core/validate/marker-schema.ts tests/core/markers/pause-decisions-schema.test.ts
git commit -m "feat(marker): PauseDecision 加 added_task_ref + capture_id(schema 层 optional)"
```

---

## Task 10: Block C — `forge pause-capture` CLI 子命令

**Files:**
- Create: `src/cli/commands/pause-capture.ts`
- Modify: `src/cli/index.ts`(注册)
- Create: `tests/cli/pause-capture.test.ts`
- Modify: `docs/cli-reference.md`(补子命令)

design §6.1。pause 触发时主代理调,读 tasks.md → `parseTasks` 解析 task id → 在 `acquireStagingLock` 锁内 `appendAckLog` 写 `pause-capture` entry → stdout 输出 `capture_id`。

- [ ] **Step 1: 写失败测试 `tests/cli/pause-capture.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPauseCapture } from '../../src/cli/commands/pause-capture.js';
import { readAllAckLogEntries, type PauseCaptureEntry } from '../../src/core/ack-log.js';

describe('forge pause-capture', () => {
  it('读 tasks.md 解析 task id,写 pause-capture entry 进 ack-log,返回 capture_id', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'forge-pc-cmd-'));
    try {
      const changeRoot = join(cwd, 'forge', 'changes', 'c1');
      mkdirSync(changeRoot, { recursive: true });
      writeFileSync(
        join(changeRoot, 'tasks.md'),
        '# Tasks\n\n- [x] task-1: baseline\n- [ ] task-2: wip\n',
      );
      const result = await runPauseCapture({
        cwd, changeId: 'c1', task: 'tasks.md#task-2', issue: 'OAuth refresh',
      });
      expect(result.captureId).toMatch(/^[0-9a-f-]{36}$/); // UUID
      const entries = await readAllAckLogEntries(changeRoot);
      const cap = entries.find((e) => e.kind === 'pause-capture') as PauseCaptureEntry;
      expect(cap).toBeDefined();
      expect(cap.capture_id).toBe(result.captureId);
      expect(cap.change_id).toBe('c1');
      expect(cap.task_ref).toBe('tasks.md#task-2');
      expect(cap.tasks_md_task_ids).toEqual(['task-1', 'task-2']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('changeId 对应目录不存在 → 抛错', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'forge-pc-cmd-2-'));
    try {
      await expect(
        runPauseCapture({ cwd, changeId: 'missing', task: 'tasks.md#t', issue: 'x' }),
      ).rejects.toThrow(/tasks\.md|不存在/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 运行确认 FAIL**

Run: `pnpm vitest run tests/cli/pause-capture.test.ts`
Expected: FAIL — `runPauseCapture` 未定义。

- [ ] **Step 3: 写 `src/cli/commands/pause-capture.ts`**

```ts
// src/cli/commands/pause-capture.ts — `forge pause-capture` 子命令(plan pause-fence Block C)
// Fluid Pause 触发时主代理调:读 tasks.md 解析 task id,写 pause-capture entry 进 ack-log
// hash-chain(锁内 append),stdout 输出 capture_id。沿 design §6.1。

import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { parseTasks } from '../../core/parse/tasks.js';
import { appendAckLog, type PauseCaptureEntry } from '../../core/ack-log.js';
import { acquireStagingLock } from '../../core/staging-lock.js';

const execFileAsync = promisify(execFile);

/** runPauseCapture 入参 */
export interface PauseCaptureArgs {
  /** 项目根(forge/changes/ 的父目录;CLI action 传 process.cwd()) */
  cwd: string;
  changeId: string;
  /** 触发 pause 的 task,如 tasks.md#task-3 */
  task: string;
  /** subagent 报告的 issue 一句概括 */
  issue: string;
}

/** runPauseCapture 结果 */
export interface PauseCaptureResult {
  captureId: string;
  timestamp: string;
}

/**
 * pause-capture 核心逻辑:读 tasks.md → 解析 task id → 锁内 append pause-capture entry。
 * 与 CLI action 分离,便于单测。
 */
export async function runPauseCapture(args: PauseCaptureArgs): Promise<PauseCaptureResult> {
  const changeRoot = join(args.cwd, 'forge', 'changes', args.changeId);
  const tasksPath = join(changeRoot, 'tasks.md');
  if (!existsSync(tasksPath)) {
    throw new Error(`pause-capture 失败:tasks.md 不存在(${tasksPath})`);
  }
  const tasksContent = await readFile(tasksPath, 'utf8');
  const taskIds = parseTasks(tasksContent).items.map((t) => t.id);

  // git HEAD(非 git → null)
  let gitHead: string | null = null;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: args.cwd });
    gitHead = stdout.trim();
  } catch {
    gitHead = null;
  }

  const captureId = randomUUID();
  const timestamp = new Date().toISOString();
  const entry: PauseCaptureEntry = {
    schema: 'forge-ack-log/v1',
    kind: 'pause-capture',
    timestamp,
    capture_id: captureId,
    change_id: args.changeId,
    task_ref: args.task,
    pause_issue_summary: args.issue,
    tasks_md_task_ids: taskIds,
    git_head: gitHead,
    extra: {},
  };

  // 在 ack-log 级共享锁内 append(沿 design §6.1 — 避免与 evidence helper 并发链断 race)
  const release = await acquireStagingLock(changeRoot);
  try {
    await appendAckLog(changeRoot, entry);
  } finally {
    await release();
  }
  return { captureId, timestamp };
}

/** 构造 `forge pause-capture` 子命令 */
export function buildPauseCaptureCommand(): Command {
  return new Command('pause-capture')
    .description('Fluid Pause 触发时捕获 tasks.md 状态进 ack-log hash-chain(option=2 用)')
    .argument('<changeId>', 'change 目录 ID')
    .requiredOption('--task <ref>', '触发 pause 的 task 引用,如 tasks.md#task-3')
    .requiredOption('--issue <summary>', 'subagent 报告的 issue 一句概括')
    .action(async (changeId: string, opts: { task: string; issue: string }) => {
      try {
        const result = await runPauseCapture({
          cwd: process.cwd(),
          changeId,
          task: opts.task,
          issue: opts.issue,
        });
        // stdout 输出 capture_id(主代理写进 pause_decision.capture_id)+ timestamp
        process.stdout.write(`${result.captureId}\t${result.timestamp}\n`);
        process.exit(0);
      } catch (err) {
        console.error(`✗ ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
```

注:`changeRoot` 解析用 `<cwd>/forge/changes/<changeId>`。若仓库已有统一的 changeRoot 解析 helper(检查 `src/cli/commands/evidence.ts` / `ack.ts` 对 `changeId` 的处理),优先复用以保持一致。

- [ ] **Step 4: 在 `src/cli/index.ts` 注册**

`index.ts` import 区加 `import { buildPauseCaptureCommand } from './commands/pause-capture.js';`;在 `program.addCommand(buildMonitorCommand());` 之后加:

```ts
// 注册 pause-capture 子命令(plan pause-fence Block C — Fluid Pause 锚点捕获)
program.addCommand(buildPauseCaptureCommand());
```

- [ ] **Step 5: 运行确认 PASS + typecheck**

Run: `pnpm vitest run tests/cli/pause-capture.test.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 6: 补 `docs/cli-reference.md`**

在 `docs/cli-reference.md` 子命令列表加一条 `forge pause-capture <changeId> --task <ref> --issue <summary>` 说明(沿文件内现有子命令条目格式)。

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/pause-capture.ts src/cli/index.ts tests/cli/pause-capture.test.ts docs/cli-reference.md
git commit -m "feat(cli): 加 forge pause-capture 子命令(option=2 capture 锚点)"
```

---

## Task 11: Block C — 重写 `checkOption2TaskChecked`

**Files:**
- Modify: `src/core/archive/pause-decisions-fence.ts`(`checkOption2TaskChecked` + fence 签名 + 主循环)
- Modify: `src/cli/commands/archive.ts`(调用同步,Task 12 完整接线)
- Create: `tests/core/archive/pause-capture-fence.test.ts`

design §6.4。fence 签名再扩展加 `opts`(verify marker tail/count);`checkOption2TaskChecked` 重写为 capture 校验。

- [ ] **Step 1: 写失败测试 `tests/core/archive/pause-capture-fence.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validatePauseDecisionsFence } from '../../../src/core/archive/pause-decisions-fence.js';
import { appendAckLog, readAllAckLogEntries, type PauseCaptureEntry } from '../../../src/core/ack-log.js';
import { canonicalHash } from '../../../src/core/canonical-json.js';

// 在 changeDir 写 tasks.md + 一条 pause-capture entry;返回 verify marker tail/count
async function setupCapture(opts: {
  tasksMd: string;
  captureTaskIds: string[];
  captureId: string;
  taskRef: string;
}): Promise<{ changeDir: string; tailHash: string; count: number }> {
  const changeDir = mkdtempSync(join(tmpdir(), 'forge-opt2-'));
  writeFileSync(join(changeDir, 'tasks.md'), opts.tasksMd);
  const entry: PauseCaptureEntry = {
    schema: 'forge-ack-log/v1', kind: 'pause-capture', timestamp: '2026-05-12T14:25:00Z',
    capture_id: opts.captureId, change_id: 'c1', task_ref: opts.taskRef,
    pause_issue_summary: 'x', tasks_md_task_ids: opts.captureTaskIds, git_head: null, extra: {},
  };
  await appendAckLog(changeDir, entry);
  const all = await readAllAckLogEntries(changeDir);
  return { changeDir, tailHash: canonicalHash(all[all.length - 1]!), count: all.length };
}

function opt2Marker(captureId: string, addedTaskRef: string, tailHash: string, count: number) {
  return {
    ack_log_tail_hash: tailHash, ack_log_entry_count: count,
    pause_decisions: [{
      id: 1, paused_at: '2026-05-12T14:25:00Z', task_ref: 'tasks.md#task-1',
      issue_summary: 'x', severity: 'WARNING', severity_acked_by: 'msc',
      severity_acked_at: '2026-05-12T14:27:00Z', chosen_option: 2,
      target_artifact: 'tasks.md', target_anchor: '- task-3',
      non_blocking_rationale: null, other_rationale: null, other_acked_by: null,
      added_task_ref: addedTaskRef, capture_id: captureId,
    }],
  };
}

describe('checkOption2TaskChecked — capture 校验', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  it('happy path:added_task_ref ∉ capture 快照、∈ 当前 tasks.md 且勾选 → 通过', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: pause 新增\n',
      captureTaskIds: ['task-1'], // capture 时只有 task-1
      captureId: 'cap-1', taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash, verifyAckLogEntryCount: count, changeId: 'c1',
    });
    expect(result.valid).toBe(true);
  });

  it('attack:added_task_ref 出现在 capture 快照里(非新增)→ 拒签', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: 旧 task\n',
      captureTaskIds: ['task-1', 'task-3'], // capture 时 task-3 已存在
      captureId: 'cap-1', taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash, verifyAckLogEntryCount: count, changeId: 'c1',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /capture|新增/.test(e.message))).toBe(true);
  });

  it('capture entry 缺失(capture_id 找不到)→ fail-closed 拒签', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: t\n',
      captureTaskIds: ['task-1'], captureId: 'cap-1', taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-MISSING', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash, verifyAckLogEntryCount: count, changeId: 'c1',
    });
    expect(result.valid).toBe(false);
  });

  it('marker 缺 ack_log_tail_hash → 拒签', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: t\n',
      captureTaskIds: ['task-1'], captureId: 'cap-1', taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: undefined, verifyAckLogEntryCount: undefined, changeId: 'c1',
    });
    expect(result.valid).toBe(false);
  });

  it('added_task_ref 在 tasks.md 未勾选 → 拒签', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [ ] task-3: 未勾选\n',
      captureTaskIds: ['task-1'], captureId: 'cap-1', taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash, verifyAckLogEntryCount: count, changeId: 'c1',
    });
    expect(result.valid).toBe(false);
  });

  it('同一 capture_id 被两个 pause_decision 复用 → 拒签(design §6.4 step 5)', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: t\n- [x] task-4: t\n',
      captureTaskIds: ['task-1'], captureId: 'cap-1', taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    // 加第二个 pause_decision,复用同一 capture_id
    (marker.pause_decisions as Record<string, unknown>[]).push({
      ...marker.pause_decisions[0], id: 2, added_task_ref: 'tasks.md#task-4',
    });
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash, verifyAckLogEntryCount: count, changeId: 'c1',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /复用|capture_id/.test(e.message))).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认 FAIL**

Run: `pnpm vitest run tests/core/archive/pause-capture-fence.test.ts`
Expected: FAIL — fence 不接受第 4 个 `opts` 参数 / `checkOption2TaskChecked` 仍是旧逻辑。

- [ ] **Step 3: 改 fence 签名(加 `opts`)**

`pause-decisions-fence.ts` 的 `validatePauseDecisionsFence` 签名(Task 4 已加 `repoRoot`),改为:

```ts
/** option=2 capture 链固化入参(由 archive 层从 verify marker 取出) */
export interface PauseFenceOptions {
  verifyAckLogTailHash?: string;
  verifyAckLogEntryCount?: number;
  changeId?: string;
}

export async function validatePauseDecisionsFence(
  marker: Record<string, unknown>,
  changeDir: string,
  repoRoot: string,
  opts: PauseFenceOptions = {},
  file?: string,
): Promise<ValidationResult> {
```

主循环前收集所有 option=2 的 `capture_id` 用于查重(design §6.4 step 5):

```ts
// 主循环之前:收集 option=2 capture_id,检测同 marker 内复用
const captureIdSeen = new Map<string, number>(); // capture_id → 首次出现的 decision id
```

- [ ] **Step 4: 重写 `checkOption2TaskChecked`**

把 `pause-decisions-fence.ts` 现有 `checkOption2TaskChecked` 整个函数替换为下面的 capture 校验(design §6.4 step 1-8)。option=2 分支调用处改为传入新参数。

```ts
// 文件顶部 import 补:
import { readAllAckLogEntries, verifyAckLogChain, type PauseCaptureEntry } from '../ack-log.js';
import { parseTasks } from '../parse/tasks.js';

/**
 * option=2 校验(design §6.4):pause 新增 task 真实性的轻量 capture 校验。
 * 一律要求 added_task_ref + capture_id + 匹配的 pause-capture entry(无版本降级,design §8.1)。
 */
async function checkOption2TaskChecked(
  p: PauseDecision,
  changeDir: string,
  opts: PauseFenceOptions,
  captureIdSeen: Map<string, number>,
  fieldBase: string,
  file?: string,
): Promise<ValidationResult> {
  // 1. added_task_ref + capture_id 非空
  if (!p.added_task_ref) {
    return failed({ artifact: 'marker', field: `${fieldBase}.added_task_ref`,
      message: 'option=2 必须有 added_task_ref(pause 新增的 task)', file });
  }
  if (!p.capture_id) {
    return failed({ artifact: 'marker', field: `${fieldBase}.capture_id`,
      message: 'option=2 必须有 capture_id(关联 pause-capture entry)', file });
  }
  // 5(提前查):capture_id 同 marker 内不被多个 pause_decision 复用
  const prevId = captureIdSeen.get(p.capture_id);
  if (prevId !== undefined) {
    return failed({ artifact: 'marker', field: `${fieldBase}.capture_id`,
      message: `option=2 校验失败:capture_id=${p.capture_id} 已被 pause_decision id=${prevId} 引用,不可复用`, file });
  }
  captureIdSeen.set(p.capture_id, p.id);

  // 2. verify marker 须有 ack_log_tail_hash + entry_count(design §6.2)
  if (opts.verifyAckLogTailHash === undefined || opts.verifyAckLogEntryCount === undefined) {
    return failed({ artifact: 'marker', field: `${fieldBase}.capture_id`,
      message: 'option=2 校验失败:verify marker 缺 ack_log_tail_hash / ack_log_entry_count,链保护不成立 — fail-closed 拒签', file });
  }
  // 3. 读 ack-log + verifyAckLogChain(用 verify marker 的 tail/count)
  let entries;
  try {
    entries = await readAllAckLogEntries(changeDir);
  } catch (err) {
    return failed({ artifact: 'marker', field: `${fieldBase}.capture_id`,
      message: `option=2 校验失败:ack-log.jsonl 读取/解析失败(${(err as Error).message})`, file });
  }
  const chain = verifyAckLogChain(entries, opts.verifyAckLogTailHash, opts.verifyAckLogEntryCount);
  if (!chain.ok) {
    return failed({ artifact: 'marker', field: `${fieldBase}.capture_id`,
      message: `option=2 校验失败:ack-log 链校验失败(${chain.reason ?? 'unknown'})`, file });
  }
  // 4. 定位 capture entry:kind + capture_id + change_id + task_ref 全匹配
  const captures = entries.filter(
    (e): e is PauseCaptureEntry =>
      e.kind === 'pause-capture' &&
      (e as PauseCaptureEntry).capture_id === p.capture_id &&
      (e as PauseCaptureEntry).change_id === (opts.changeId ?? '') &&
      (e as PauseCaptureEntry).task_ref === p.task_ref,
  );
  if (captures.length !== 1) {
    return failed({ artifact: 'marker', field: `${fieldBase}.capture_id`,
      message: `option=2 校验失败:ack-log 中匹配 capture_id=${p.capture_id} + change_id + task_ref 的 pause-capture entry 数=${captures.length}(应 exactly 1)— fail-closed 拒签`, file });
  }
  const capture = captures[0]!;

  // 取 added_task_ref 末段
  const addedKey = p.added_task_ref.split('#').pop() ?? '';
  if (!addedKey) {
    return failed({ artifact: 'marker', field: `${fieldBase}.added_task_ref`,
      message: `option=2 校验失败:added_task_ref 末段为空(${p.added_task_ref})`, file });
  }
  // 6. added_task_ref 末段 ∉ capture 快照(pause 时不存在)
  if (capture.tasks_md_task_ids.includes(addedKey)) {
    return failed({ artifact: 'marker', field: `${fieldBase}.added_task_ref`,
      message: `option=2 校验失败:task ${addedKey} 在 pause capture 时刻已存在于 tasks.md(非新增)— 沿 design §2.1.5 line 263`, file });
  }
  // 7. added_task_ref 末段 ∈ 当前 tasks.md 且勾选(用 parseTasks,design §6.4 step 8)
  const tasksPath = join(changeDir, 'tasks.md');
  if (!existsSync(tasksPath)) {
    return failed({ artifact: 'marker', field: `${fieldBase}.added_task_ref`,
      message: `option=2 校验失败:tasks.md 不存在(${tasksPath})`, file });
  }
  const parsed = parseTasks(await readFile(tasksPath, 'utf8'));
  const item = parsed.items.find((t) => t.id === addedKey);
  if (!item) {
    return failed({ artifact: 'marker', field: `${fieldBase}.added_task_ref`,
      message: `option=2 校验失败:当前 tasks.md 找不到 task ${addedKey}(需 \`- [x] ${addedKey}: ...\` 格式)`, file });
  }
  if (!item.checked) {
    return failed({ artifact: 'marker', field: `${fieldBase}.added_task_ref`,
      message: `option=2 校验失败:task ${addedKey} 未勾选 [x]`, file });
  }
  return ok();
}
```

option=2 分支调用处(主循环内 `else if (p.chosen_option === 2)`)改为:

```ts
} else if (p.chosen_option === 2) {
  const r = await checkOption2TaskChecked(p, changeDir, opts, captureIdSeen, fieldBase, file);
  results.push(r);
}
```

注:`PauseDecision` 已在 Task 9 加 `added_task_ref`/`capture_id`。`existsSync` / `readFile` / `join` 已在文件 import。删除旧 `checkOption2TaskChecked` 里的 bold/bare 正则块(`:184-224`)。

- [ ] **Step 5: 运行确认 PASS + typecheck**

Run: `pnpm vitest run tests/core/archive/pause-capture-fence.test.ts && pnpm typecheck`
Expected: PASS（5 个 capture 校验测试全绿）。

- [ ] **Step 6: 改 `archive.ts` 调用占位(完整接线在 Task 12)**

`archive.ts:452`/`:463` 两处 `validatePauseDecisionsFence` 调用 —— Task 4 已传 `process.cwd()`,现签名多了 `opts`。临时传 `{}` 占位,Task 12 填真值:

```ts
const pdVerifyResult = await validatePauseDecisionsFence(verifyRec, changeDir, process.cwd(), {}, verifyPath);
const pdReviewResult = await validatePauseDecisionsFence(reviewRec, changeDir, process.cwd(), {}, reviewPath);
```

- [ ] **Step 7: typecheck + commit**

```bash
pnpm typecheck
git add src/core/archive/pause-decisions-fence.ts src/cli/commands/archive.ts tests/core/archive/pause-capture-fence.test.ts
git commit -m "feat(fence): 重写 checkOption2TaskChecked 为 capture 校验(design §6.4)"
```

---

## Task 12: Block C — archive.ts fence 接线 + verify/review cross-check

**Files:**
- Modify: `src/cli/commands/archive.ts:448-473`
- Modify: `tests/cli/archive-pause-fence.test.ts`(cross-check 测试)

design §6.4(opts 传 verify marker tail/count)+ §6.5(cross-check)。

- [ ] **Step 1: archive.ts 两处 fence 调用传真 opts**

`archive.ts`,在 pause fence 调用前从 `verifyRec` 取链固化值。两处调用(verify / review marker)**都传 verify marker 的 tail/count**(design §6.2 — verify 是最后 freeze):

```ts
// 步骤 3.7 之前:从 verify marker 取链固化值
const pauseFenceOpts = {
  verifyAckLogTailHash: verifyRec['ack_log_tail_hash'] as string | undefined,
  verifyAckLogEntryCount: verifyRec['ack_log_entry_count'] as number | undefined,
  changeId,
};
const pdVerifyResult = await validatePauseDecisionsFence(
  verifyRec, changeDir, process.cwd(), pauseFenceOpts, verifyPath,
);
// ... 拒签处理不变 ...
const pdReviewResult = await validatePauseDecisionsFence(
  reviewRec, changeDir, process.cwd(), pauseFenceOpts, reviewPath,
);
// ... 拒签处理不变 ...
```

`changeId` 在 archive.ts 作用域已有(`:290` 一带)。

- [ ] **Step 2: 写 cross-check 失败测试**

在 `archive-pause-fence.test.ts` 加 `describe('verify/review pause_decisions cross-check', ...)`:

```ts
import { crossCheckPauseDecisions } from '../../src/core/archive/pause-decisions-fence.js';

describe('verify/review pause_decisions cross-check', () => {
  const base = {
    id: 1, task_ref: 'tasks.md#task-1', chosen_option: 2,
    added_task_ref: 'tasks.md#task-3', capture_id: 'cap-1',
  };
  it('共有 id 字段一致 → 通过', () => {
    const r = crossCheckPauseDecisions([base], [{ ...base }]);
    expect(r.valid).toBe(true);
  });
  it('共有 id 的 capture_id 不一致 → 拒签', () => {
    const r = crossCheckPauseDecisions([base], [{ ...base, capture_id: 'cap-2' }]);
    expect(r.valid).toBe(false);
  });
  it('verify-only id(review 无)→ 不拒签(单侧独有合法)', () => {
    const r = crossCheckPauseDecisions([base, { ...base, id: 2 }], [base]);
    expect(r.valid).toBe(true);
  });
});
```

- [ ] **Step 3: 实现 `crossCheckPauseDecisions`**

在 `pause-decisions-fence.ts` 加导出函数(design §6.5 — 共有 id 比对,单侧独有不拒):

```ts
/**
 * verify/review 双 marker pause_decisions cross-check(design §6.5)。
 * 对两侧 id 相同的 pause_decision,逐字段比对;单侧独有 id 不拒签。
 */
export function crossCheckPauseDecisions(
  verifyDecisions: PauseDecision[],
  reviewDecisions: PauseDecision[],
  file?: string,
): ValidationResult {
  const results: ValidationResult[] = [];
  const reviewById = new Map(reviewDecisions.map((d) => [d.id, d]));
  const FIELDS: (keyof PauseDecision)[] = ['task_ref', 'chosen_option', 'added_task_ref', 'capture_id'];
  for (const v of verifyDecisions) {
    const r = reviewById.get(v.id);
    if (!r) continue; // 单侧独有 id(verify-only)→ 合法,不拒
    for (const f of FIELDS) {
      if (v[f] !== r[f]) {
        results.push(failed({
          artifact: 'marker', field: `pause_decisions[id=${v.id}].${String(f)}`,
          message: `verify/review marker pause_decision id=${v.id} 的 ${String(f)} 不一致(verify=${String(v[f])} review=${String(r[f])})`,
          file,
        }));
      }
    }
  }
  return results.length === 0 ? ok() : mergeResults(...results);
}
```

- [ ] **Step 4: archive.ts 调用 cross-check**

`archive.ts`,在两处 `validatePauseDecisionsFence` 拒签处理之后加:

```ts
// 步骤 3.7b:verify/review pause_decisions cross-check(design §6.5)
const vDecisions = Array.isArray(verifyRec['pause_decisions'])
  ? (verifyRec['pause_decisions'] as PauseDecision[]) : [];
const rDecisions = Array.isArray(reviewRec['pause_decisions'])
  ? (reviewRec['pause_decisions'] as PauseDecision[]) : [];
const ccResult = crossCheckPauseDecisions(vDecisions, rDecisions, verifyPath);
if (!ccResult.valid) {
  console.error('✗ pause_decisions verify/review cross-check 拒签:');
  for (const e of ccResult.errors) console.error(`  - ${e.field}: ${e.message}`);
  await archiveRelease();
  process.exit(1);
}
```

`archive.ts` import 区补 `crossCheckPauseDecisions` + `PauseDecision` 类型(后者从 `markers/types.js`)。

- [ ] **Step 5: 运行确认 PASS + typecheck**

Run: `pnpm vitest run tests/cli/archive-pause-fence.test.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/core/archive/pause-decisions-fence.ts src/cli/commands/archive.ts tests/cli/archive-pause-fence.test.ts
git commit -m "feat(fence): archive 传 verify marker tail/count + verify/review pause_decisions cross-check"
```

---

## Task 13: Block C — `commands/apply.md` Fluid Pause 协议更新

**Files:**
- Modify: `commands/apply.md`(Fluid Pause Decision Point 段 + Marker 持久化段)
- Build: `pnpm build`

design §6.6。

- [ ] **Step 1: 改 `commands/apply.md` 的 Fluid Pause 协议流程**

`apply.md` §"Fluid Pause Decision Point" 的"协议流程"段(`:72-88`)—— 在"主代理判定 severity"之后、AskUserQuestion 之前,加 capture 步骤:

```markdown
              ↓
              CRITICAL? → yes → 走 forge 强 fence 拒签
                       → no  → 主代理调 `forge pause-capture <change-id> --task <triggering-task-ref> --issue "<summary>"`
                                (捕获 pause 时刻 tasks.md 状态进 ack-log hash-chain;记下 stdout 返回的 capture_id)
                                ↓
                                AskUserQuestion 四选项
```

- [ ] **Step 2: 改 `apply.md` Marker 持久化段的 schema 样例**

`apply.md:121-136` 的 `pause_decisions` YAML 样例,加 `added_task_ref` + `capture_id` 字段说明:

```markdown
    chosen_option: 2 # 1=扩 scope / 2=加 task / 3=转 out-of-scope / 4=Other
    added_task_ref: tasks.md#task-7 # option=2 必填:Fluid Pause 新增的 task(与 task_ref=触发 task 区分)
    capture_id: <forge pause-capture 返回的 capture_id> # option=2 必填:关联 pause-capture entry
    target_artifact: tasks.md
    target_anchor: '- task-7' # option=2 仅人类可读记录,fence 不据此校验
```

并在 Fence 校验段(`:138-147`)把 option=2 行改为:`option=2:added_task_ref 指向的 task ∉ capture 快照、∈ 当前 tasks.md 且勾选 [x];capture_id 匹配 ack-log pause-capture entry;链完整`。

- [ ] **Step 3: 跑 `pnpm build` 同步双源模板**

Run: `pnpm build`
Expected: exit 0;`copy-templates.mjs` 把 `commands/apply.md` 同步到 `src/core/templates/commands/apply.md` 与 `dist/`。CLAUDE.md 约束 1 — 改 `commands/` 必须 build。

- [ ] **Step 4: 确认模板已同步**

Run: `git status --short src/core/templates/commands/apply.md`
Expected: 该文件出现在 staged/modified(build 已反向同步)。

- [ ] **Step 5: Commit**

```bash
git add commands/apply.md src/core/templates/commands/apply.md
git commit -m "docs(apply): Fluid Pause 协议加 forge pause-capture + option=2 schema 字段"
```

---

## Task 14: Block C — 迁移 pause fixtures 到 canonical task 格式

**Files:**
- Modify: `tests/fixtures/pause-decisions/*/tasks.md`(5 个 fixture:bold → `task-id: desc`)
- Modify: `tests/fixtures/pause-decisions/option-2-add-task/.verify-passed` + `.review-passed`(加 `added_task_ref` + `capture_id`)
- Create/Modify: `tests/fixtures/pause-decisions/option-2-add-task/.evidence/ack-log.jsonl`(加 pause-capture entry)
- Modify: `tests/cli/archive-pause-fence.test.ts`(option=2 现有测试同步)

design §8.4。Path Pre-flight 已定:canonical 格式 = `parseTasks` 的 `- [x] task-id: desc`。

- [ ] **Step 1: 迁移所有 pause fixture 的 tasks.md 到 `task-id: desc` 格式**

5 个 fixture(`critical-redirect-rejected` / `option-1-expand-scope` / `option-2-add-task` / `option-3-out-of-scope` / `option-4-other`)的 `tasks.md`。把 `- [x] **task-1** baseline task` 改为 `- [x] task-1: baseline task`。例如 `option-2-add-task/tasks.md`:

```markdown
# Tasks

- [x] task-1: baseline task
- [x] task-3: added after pause-decision id=1 (option=2 add task)
```

(注:option=2 fixture 的"新增 task"用 `task-3` —— 与触发 pause 的 `task-1` 区分;capture 快照将只含 `task-1`。)

- [ ] **Step 2: option-2-add-task fixture 的 marker 加新字段**

`option-2-add-task/.verify-passed` 与 `.review-passed` 的 `pause_decisions[0]` 加:

```yaml
    chosen_option: 2
    added_task_ref: tasks.md#task-3
    capture_id: 11111111-1111-1111-1111-111111111111
```

并给 marker 顶层加 `ack_log_tail_hash` / `ack_log_entry_count`(值在 Step 3 确定后回填)。

- [ ] **Step 3: option-2-add-task fixture 的 ack-log.jsonl 加 pause-capture entry**

`option-2-add-task/.evidence/ack-log.jsonl` 末尾加一条 `pause-capture` entry(`capture_id` 与 marker 一致,`tasks_md_task_ids` 只含 `task-1`,`task_ref` = `tasks.md#task-1`)。entry 的 `prev_entry_hash` 须接现有链尾;`ack_log_tail_hash` = 加入后链尾 entry 的 `canonicalHash`,`ack_log_entry_count` = 总行数。

为避免手算 hash,**用脚本生成**:写一个一次性 node 脚本(或 vitest 内的 setup),调 `appendAckLog` 把 pause-capture entry 追加到 fixture 的 ack-log,再 `readAllAckLogEntries` + `canonicalHash` 算出 tail/count,回填进两个 marker。脚本跑完即删,fixture 文件提交。

- [ ] **Step 4: 同步 `archive-pause-fence.test.ts` 现有 option=2 测试**

`archive-pause-fence.test.ts` 现有的 option=2 相关测试(用旧 bold 格式 + 无 capture 的)—— 改为 canonical 格式 + 新 schema,或标注为 Task 11 的 `pause-capture-fence.test.ts` 已覆盖而精简。确保整文件 `pnpm vitest run tests/cli/archive-pause-fence.test.ts` 全绿。

- [ ] **Step 5: 运行全量 pause 相关测试**

Run: `pnpm vitest run tests/cli/archive-pause-fence.test.ts tests/integration/pause-decisions-end-to-end.test.ts tests/core/archive/pause-capture-fence.test.ts`
Expected: PASS。若 `pause-decisions-end-to-end.test.ts` 因 fixture 迁移失败,同步修正其断言。

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/pause-decisions tests/cli/archive-pause-fence.test.ts
git commit -m "test(fixtures): pause fixtures 迁移 canonical task 格式 + option-2 加 capture"
```

---

## Task 15: Block C — unskip todo 2(option=2 attack path)

**Files:**
- Modify: `tests/integration/release-blocker-attack-path.test.ts`(unskip todo 2)

- [ ] **Step 1: unskip todo 2 为真 `it()`**

`release-blocker-attack-path.test.ts` 的 `describe('release-blocker: pause_decisions option=1/2 attack paths', ...)` 内,把 option=2 的 `it.todo` 替换为真 `it()`。复用 Task 11 的 `setupCapture` 模式(在文件内重建或 import 共享 helper):

```ts
it('option=2 attack:added_task_ref 指向的 task 在 capture 快照中已存在(非新增)→ fence 拒签', async () => {
  const changeDir = mkdtempSync(join(tmpdir(), 'forge-relblk-opt2-'));
  try {
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [x] task-1: a\n- [x] task-3: 旧 task\n');
    const entry = {
      schema: 'forge-ack-log/v1', kind: 'pause-capture', timestamp: '2026-05-12T14:25:00Z',
      capture_id: 'cap-attack', change_id: 'c1', task_ref: 'tasks.md#task-1',
      pause_issue_summary: 'x',
      tasks_md_task_ids: ['task-1', 'task-3'], // attack:task-3 在 capture 时已存在
      git_head: null, extra: {},
    };
    await appendAckLog(changeDir, entry);
    const all = await readAllAckLogEntries(changeDir);
    const tail = canonicalHash(all[all.length - 1]!);
    const result = await validatePauseDecisionsFence(
      {
        ack_log_tail_hash: tail, ack_log_entry_count: all.length,
        pause_decisions: [{
          id: 1, paused_at: '2026-05-12T14:25:00Z', task_ref: 'tasks.md#task-1',
          issue_summary: 'x', severity: 'WARNING', severity_acked_by: 'msc',
          severity_acked_at: '2026-05-12T14:27:00Z', chosen_option: 2,
          target_artifact: 'tasks.md', target_anchor: '- task-3',
          non_blocking_rationale: null, other_rationale: null, other_acked_by: null,
          added_task_ref: 'tasks.md#task-3', capture_id: 'cap-attack',
        }],
      },
      changeDir, changeDir,
      { verifyAckLogTailHash: tail, verifyAckLogEntryCount: all.length, changeId: 'c1' },
    );
    expect(result.valid).toBe(false);
  } finally {
    rmSync(changeDir, { recursive: true, force: true });
  }
});
```

文件顶部 import 补 `appendAckLog` / `readAllAckLogEntries` / `canonicalHash`(若 Task 1/2 未加)。

- [ ] **Step 2: 运行确认**

Run: `pnpm vitest run tests/integration/release-blocker-attack-path.test.ts`
Expected: 全 PASS,**0 个 `it.todo`**。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/release-blocker-attack-path.test.ts
git commit -m "test(release-gate): unskip option=2 attack-path todo(capture 校验已拦)"
```

---

## Task 16: Block C — release gate 接入 CI

**Files:**
- Modify: `scripts/check-release-gate.mjs:33`(`EXPECTED_TODO_COUNT_SOFT` 6 → 0)
- Modify: `.github/workflows/ci.yml`(加 `test:gate:release` step)

**前置**:Task 1-15 全部完成,6 个 `it.todo` 全 unskip。提前做本 task 会使 CI 变红(design §11 / round 3 MAJOR #3)。

- [ ] **Step 1: 改 `check-release-gate.mjs` 的 soft EXPECTED**

`check-release-gate.mjs:33`:`const EXPECTED_TODO_COUNT_SOFT = 6;` → `const EXPECTED_TODO_COUNT_SOFT = 0;`。并更新 `:27-32` 注释(说明 plan pause-fence 已 unskip 全 6 todo,soft 期望归零)。

- [ ] **Step 2: 验证 soft + release gate 均 PASS**

Run: `pnpm test:gate && pnpm test:gate:release`
Expected: 两条都 PASS（soft:actual=0=EXPECTED;release:actual=0 硬约束满足)。

- [ ] **Step 3: `ci.yml` 加 release gate step**

`.github/workflows/ci.yml`,在 `- name: Test` step 之后加:

```yaml
      - name: Release gate (strict)
        run: pnpm test:gate:release
```

- [ ] **Step 4: 全量本地验证(沿 CLAUDE.md 5 步)**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`
Expected: 全 PASS。再单独 `pnpm test:gate:release` → PASS。

- [ ] **Step 5: Commit**

```bash
git add scripts/check-release-gate.mjs .github/workflows/ci.yml
git commit -m "ci(release-gate): EXPECTED_TODO_COUNT_SOFT 归零 + CI 接入 test:gate:release"
```

---

## 收尾验证

- [ ] **Phase 2 完成后全量验证**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test && pnpm test:gate:release`
Expected: 全 PASS。`release-blocker-attack-path.test.ts` 0 个 `it.todo`。

- [ ] **确认 design 实施清单全覆盖**(design §11)— 见下方 Self-Review 段。

---

## Self-Review(writing-plans 自检结论)

**Spec coverage** — design §11 实施清单逐项映射到 task:

| design §11 项 | Task |
| --- | --- |
| `release-blocker-attack-path.test.ts` unskip todo 1/3/4/5/6 | Task 1(3/4/5)、Task 2(6)、Task 6(1) |
| `src/core/parse/unified-diff.ts` 新 + 单测 | Task 3 |
| `pause-decisions-fence.ts` repo root 参数 + option=1 diff | Task 4 + Task 5 |
| `archive.ts` fence 调用传 repo root | Task 4(占位)+ Task 11/12(完整) |
| release CI 接入 `test:gate:release` | Task 16 |
| `src/cli/commands/pause-capture.ts` 新 | Task 10 |
| `src/cli/index.ts` 注册 | Task 10 |
| ack-log append 共享锁 | Task 10(复用 `acquireStagingLock`) |
| `ack-log.ts` `PauseCaptureEntry` | Task 7 |
| `ack-log-consistency.ts` 删本地 `AckLogEntry` | Task 8 |
| `markers/types.ts` + `marker-schema.ts` 两新字段 | Task 9 |
| `pause-decisions-fence.ts` 重写 `checkOption2TaskChecked` | Task 11 |
| `archive.ts` verify/review cross-check | Task 12 |
| `commands/apply.md` + `pnpm build` | Task 13 |
| `release-blocker-attack-path.test.ts` unskip todo 2 | Task 15 |
| CLI 单测 + 各模块单测 | 各 Task 内含 |
| `docs/cli-reference.md` 补 `pause-capture` | Task 10 |
| 迁移 option=2 fixtures/tests | Task 14 |

design §10 测试策略覆盖:Block A 4 todo(Task 1/2);option=1 attack/happy/frontmatter/非 git(Task 5/6);option=2 attack/happy/链坏/capture 缺失/缺 tail_hash/未勾选/**capture_id 复用**(Task 11)/verify-review 不一致(Task 12)/gen-0 老 marker(Task 4 保留现有测试);release gate(Task 16)。

**自检修正(已 inline 修复):**
1. Task 11 测试补 "capture_id 复用 → 拒签" case —— 原缺失,design §6.4 step 5 / §9.1 要求。
2. Task 4 Step 3:测试调用统一 3 参、去掉 `file` 参数 —— 否则 Task 11 在第 4 位插入 `opts` 后,旧 4 参调用(末位 `file`)会参数错位。

**类型一致性核对:** `validatePauseDecisionsFence` 签名两次演进(Task 4 加 `repoRoot`;Task 11 加 `opts: PauseFenceOptions`,`file` 移至第 5 位)—— archive.ts 调用 Task 11 Step 6 占位 `{}`、Task 12 填真值,测试调用 3 参形式不受影响。`PauseCaptureEntry`(Task 7)/ `PauseFenceOptions`、`crossCheckPauseDecisions`(Task 11/12)/ `runPauseCapture`(Task 10)跨 task 引用一致。

**已知留给执行阶段核实的点(design 授权,非 placeholder):**
- Task 9 `validateMarkerSchema` 入口名 — 以 `pause-decisions-schema.test.ts` 现有 import 为准。
- Task 10 `changeRoot` 解析 — 若仓库有统一 helper,复用;否则 `<cwd>/forge/changes/<changeId>`。
- design §6.2 Observation:`process-evidence-fence` review-side count mismatch 风险属 forge 既有问题,本特性不涉及,执行中如撞见可单独立项。

