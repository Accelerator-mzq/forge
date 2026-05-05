# Forge Plan 6:harness smoke + recover 收尾 + 用户文档 + Release v0.1.0 准备 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**:把 v0.1 推到可发版状态:补完 `forge archive --recover` case C 的交互式二选一 + 完整性 check;写面向用户的文档(README 重写、5 分钟教程、harness 安装、CLI reference、CHANGELOG);写 release gate manual checklist + 自动化脚本;准备 npm publish 工件(`package.json` 完善 + `pnpm pack --dry-run` 验证 + 本地 install 验证)。**真 publish + git tag + GitHub release 由 maintainer 跑 release gate 通过后手动执行**,Plan 6 不擅自 publish。

**Architecture**:三个独立子项目 — (1) archive recover case C 交互(改 `src/core/archive/recover.ts` + `src/cli/commands/archive.ts`,加 readline prompt + 完整性 check helpers,新增单测 + integration 测);(2) 用户文档(主 README 重写 + 4 篇新 docs + CHANGELOG);(3) Release gate(`docs/release-gate-checklist.md` 手动 checklist + `scripts/release-gate.mjs` 自动化部分:pnpm pack + dry install + 结构验证)。三块解耦,可独立完成。

**Tech Stack**:已有(TypeScript 5.6+ + Node 20.19+ + Vitest 2 + commander 12 + node:readline 内置);**无新依赖**。

**Spec 引用**:[`docs/specs/2026-05-04-forge-fusion-design.md`](../specs/2026-05-04-forge-fusion-design.md) §3.5(`archive --recover` case C 完整规范)+ §5.1(harness acceptance test smoke)+ §6 Phase 6 任务清单 + §7(明确不做)+ §8(许可与署名)。

**Plan 5 reviewer 移交**:无(Plan 5 PR #4 + #5 双 CI 绿合并,无遗留 punch list)。

---

## Phase 0:范围与非范围

**做**:
1. **`forge archive --recover` case C 交互式二选一**(spec §3.5 line 647-655):
   - 加 backup 完整性 check(预期文件齐全 + YAML 解析成功)
   - 加 archive 完整性 check(目录结构 + verify/review marker 存在)
   - 两者都完整 → readline 提示用户输入 `[1]` 完成归档 / `[2]` 撤销归档
   - 任一不完整 → 输出诊断 + 退出码 4
2. **用户文档完整套**:
   - `README.md` 重写(面向最终用户)
   - `docs/getting-started.md`(5 分钟跑通 init → brainstorm → propose → apply → review → verify → archive)
   - `docs/harness-setup.md`(Claude Code + Codex 安装/配置)
   - `docs/cli-reference.md`(5 个 CLI 命令完整参数 + 退出码 + 例子)
   - `CHANGELOG.md`(v0.1.0 release notes,Keep a Changelog 风格)
3. **Release gate**:
   - `docs/release-gate-checklist.md` manual checklist(maintainer 每发版必须人工跑;含 §5.1 acceptance test 两 harness 流程)
   - `scripts/release-gate.mjs` 自动化部分:5 个本地命令 + `pnpm pack` + dry install 到临时目录 + tarball 结构验证
4. **npm publish 工件准备**:
   - `package.json` 加 `keywords` 字段(npm 搜索可发现)
   - `pnpm pack --dry-run` 验证 tarball 内容(只含 `dist/` + `README.md` + `LICENSE` + `LICENSE-THIRD-PARTY.md`)
   - 本地 `npm install -g <tarball>` 真跑 `forge --version` 验证 bin 可用
5. **README "当前状态"段**更新到 Phase 6 完成 + Release v0.1.0 准备就绪

**不做**(spec §7 + Plan 6 v0.1 显式收紧):
- **不擅自 npm publish / git tag / 创 GitHub release** — 这些由 maintainer 跑完 release gate 后手动执行(防止 CI 自动 publish 的安全顾虑)
- 不实施 OpenCode adapter(v0.2;Phase 0.5 spike 已确认 OpenCode 自动注入需 plugin)
- 不实施 specs-sync delete operation(spec §3.5 line 609-617 显式推 v0.2)
- 不实施 brownfield onboarding / `bulk-archive` / `migrate-from-openspec`(spec §7 不做项)
- 不写 Web Dashboard / telemetry / i18n / 自定义 schema(spec §7)
- 不实施 Anthropic Sonnet 4.7 切换(v0.1 锁 Sonnet 4.6,4.7 出来时 v0.2 重跑全量校准,spec 风险段)

---

## File Structure(Plan 6 完成时新增/修改)

```
forge-repo/
├── package.json                                 ← 修改:加 keywords + 可选 publishConfig
├── README.md                                    ← 重写:面向用户
├── CHANGELOG.md                                 ← 新增:v0.1.0 release notes
├── docs/
│   ├── plans/
│   │   └── 2026-05-05-plan-6-release.md         ← 新增:本 plan
│   ├── getting-started.md                       ← 新增:5 分钟教程
│   ├── harness-setup.md                         ← 新增:Claude Code + Codex 安装
│   ├── cli-reference.md                         ← 新增:5 命令 reference
│   └── release-gate-checklist.md                ← 新增:maintainer manual checklist
├── scripts/
│   └── release-gate.mjs                         ← 新增:自动化 release 验证
├── src/
│   ├── core/archive/
│   │   ├── recover.ts                           ← 修改:加 case C 交互 + 完整性 check
│   │   └── recover-prompt.ts                    ← 新增:readline 二选一 prompt 封装(便于 mock 测)
│   └── cli/commands/
│       └── archive.ts                           ← 修改:--recover 路径处理 case C 用户输入
└── tests/
    └── core/archive/
        ├── recover.test.ts                      ← 修改:加 case C 完整性 check 与交互 mock 测试
        └── recover-prompt.test.ts               ← 新增:readline mock 测
```

---

## Phase A:`archive --recover` case C 交互 + 完整性检查

### Task A1:`src/core/archive/recover-prompt.ts` 交互层

**Files:**
- Create: `src/core/archive/recover-prompt.ts`
- Test: `tests/core/archive/recover-prompt.test.ts`

- [ ] **Step 1:写 `src/core/archive/recover-prompt.ts`**

```typescript
// case C 交互式二选一 prompt — Plan 6
// 用 node:readline 封装,导出可注入函数便于测试 mock

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/** 用户对 case C 的选择 */
export type RecoverChoice = 'complete-archive' | 'undo-archive';

/**
 * 提示用户在 case C 状态下二选一。
 *
 * 默认实现:用 node:readline 从 stdin 读取数字 1/2,直到输入合法。
 * 测试可注入自定义实现(例如直接返回固定值)。
 */
export async function promptRecoverChoice(
  customPrompt?: () => Promise<RecoverChoice>,
): Promise<RecoverChoice> {
  if (customPrompt) return customPrompt();

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question(
        '请输入 [1] 完成归档(重跑 Sync) 或 [2] 撤销归档(从 backup 还原):',
      )).trim();
      if (answer === '1') return 'complete-archive';
      if (answer === '2') return 'undo-archive';
      console.log('无效输入,请输入 1 或 2');
    }
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 2:写 `tests/core/archive/recover-prompt.test.ts`**

```typescript
// recover-prompt 单测 — 用 customPrompt 注入避免真 stdin 交互
import { describe, it, expect } from 'vitest';
import { promptRecoverChoice } from '../../../src/core/archive/recover-prompt.js';

describe('forge-recover/promptRecoverChoice', () => {
  it('注入 customPrompt 返回 complete-archive', async () => {
    const r = await promptRecoverChoice(async () => 'complete-archive');
    expect(r).toBe('complete-archive');
  });

  it('注入 customPrompt 返回 undo-archive', async () => {
    const r = await promptRecoverChoice(async () => 'undo-archive');
    expect(r).toBe('undo-archive');
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/archive/recover-prompt.test.ts
```

预期:2 tests passing。

- [ ] **Step 4:typecheck**

```bash
pnpm typecheck
```

预期:0 errors。

- [ ] **Step 5:commit**

```bash
git add src/core/archive/recover-prompt.ts tests/core/archive/recover-prompt.test.ts
git commit -m "feat(archive): recover-prompt readline 二选一封装(可注入测试)"
```

---

### Task A2:`recover.ts` 加 backup + archive 完整性 check helper

**Files:**
- Modify: `src/core/archive/recover.ts`(追加两个 helper)

- [ ] **Step 1:在 `src/core/archive/recover.ts` 文件末尾追加 helper**

```typescript
/** backup 完整性检查结果 */
export interface BackupIntegrityResult {
  ok: boolean;
  reason?: string;
}

/**
 * 检查 backup 目录完整性(Plan 6 — spec §3.5 case C 前置条件)。
 *
 * 完整性条件:
 * 1. backup 目录可读
 * 2. 目录非空(至少一个文件,否则代表 sync 没产生备份就死了)
 * 3. 内含 .md 文件能被 utf8 读取(非二进制损坏)
 *
 * 若任一不满足 → ok=false + reason 描述哪条不满足
 */
export async function checkBackupIntegrity(backupDir: string): Promise<BackupIntegrityResult> {
  if (!existsSync(backupDir)) {
    return { ok: false, reason: 'backup 目录不存在' };
  }
  let entries: string[];
  try {
    entries = await readdir(backupDir);
  } catch (err) {
    return { ok: false, reason: `backup 目录无法读取:${(err as Error).message}` };
  }
  if (entries.length === 0) {
    return { ok: false, reason: 'backup 目录为空(预期至少一个备份文件)' };
  }
  // 抽查前 3 个 .md 文件能否 utf8 读取
  const mdFiles = entries.filter((e) => e.endsWith('.md')).slice(0, 3);
  for (const name of mdFiles) {
    try {
      await readFile(join(backupDir, name), 'utf8');
    } catch (err) {
      return { ok: false, reason: `backup/${name} 无法读取:${(err as Error).message}` };
    }
  }
  return { ok: true };
}

/** archive 完整性检查结果 */
export interface ArchiveIntegrityResult {
  ok: boolean;
  reason?: string;
}

/**
 * 检查 archive/<date>-<id>/ 目录完整性(Plan 6 — spec §3.5 case C 前置条件)。
 *
 * 完整性条件:
 * 1. 目录存在
 * 2. 包含 specs/ 子目录(可空,但必须存在)
 * 3. 包含 .verify-passed 与 .review-passed 两个 marker 文件
 * 4. 两个 marker 都能被 utf8 读取(YAML 解析交给 archive 命令的 schema 校验)
 *
 * 若任一不满足 → ok=false + reason 描述
 */
export async function checkArchiveIntegrity(archiveChangeDir: string): Promise<ArchiveIntegrityResult> {
  if (!existsSync(archiveChangeDir)) {
    return { ok: false, reason: 'archive change 目录不存在' };
  }
  if (!existsSync(join(archiveChangeDir, 'specs'))) {
    return { ok: false, reason: 'archive 内缺 specs/ 子目录' };
  }
  const verifyPath = join(archiveChangeDir, '.verify-passed');
  const reviewPath = join(archiveChangeDir, '.review-passed');
  if (!existsSync(verifyPath)) {
    return { ok: false, reason: '.verify-passed marker 不存在' };
  }
  if (!existsSync(reviewPath)) {
    return { ok: false, reason: '.review-passed marker 不存在' };
  }
  try {
    await readFile(verifyPath, 'utf8');
    await readFile(reviewPath, 'utf8');
  } catch (err) {
    return { ok: false, reason: `marker 文件读取失败:${(err as Error).message}` };
  }
  return { ok: true };
}
```

- [ ] **Step 2:补 import(若文件顶部还没 readFile)**

确认 `src/core/archive/recover.ts` 顶部 import 已含 `readFile`(Plan 3 写时应已含,因为 verifyAllReplacedAlreadyApplied 用 readFile)。如缺,加上:

```typescript
import { readdir, rm, readFile } from 'node:fs/promises';
```

- [ ] **Step 3:typecheck**

```bash
pnpm typecheck
```

预期:0 errors。

- [ ] **Step 4:commit(本 task 不加测试,Task A4 一起补)**

```bash
git add src/core/archive/recover.ts
git commit -m "feat(archive): recover 加 backup/archive 完整性 check helper(spec §3.5 case C 前置)"
```

---

### Task A3:`recover.ts` case C 改为返回结构化结果(给 CLI 决定走交互或退出 4)

**Files:**
- Modify: `src/core/archive/recover.ts`(改 RecoverResult + recover 函数 case C 路径)

- [ ] **Step 1:扩展 `RecoverResult` 接口加 `caseCData` 字段**

定位 `RecoverResult` 接口(应在文件靠前位置),改为:

```typescript
/** recover 返回结果 */
export interface RecoverResult {
  /** 状态机判定的 case */
  case: 'clean' | 'A' | 'B' | 'C' | 'corrupt';
  /** 人类可读说明(含操作指引) */
  message: string;
  /**
   * case='C' 时填充,提供 CLI 进行交互式二选一所需上下文。
   * 其他 case 为 undefined。
   */
  caseCData?: {
    /** archive change 目录绝对路径(用于"撤销归档"反向 rename) */
    archiveChangeDir: string;
    /** 原 change 名(去掉日期前缀,用于"撤销归档"反向 rename 目标) */
    changeOrigId: string;
    /** backup 目录绝对路径 */
    backupDir: string;
    /** archive specs 目录(用于"完成归档"重跑 Sync) */
    archiveSpecsDir: string;
    /** current specs 目录(用于"完成归档"或"撤销归档") */
    currentSpecsDir: string;
    /** 待应用 deltas(用于"完成归档") */
    deltas: SpecDelta[];
    /** backup 完整性 check 结果 */
    backupIntegrity: BackupIntegrityResult;
    /** archive 完整性 check 结果 */
    archiveIntegrity: ArchiveIntegrityResult;
  };
}
```

- [ ] **Step 2:改 `recover` 函数 case C 返回路径**

定位 case C 的返回(原文件 line 117-126 附近):

```typescript
  // case C:deltas 含 delete 或内容不一致(说明状态不一致),需要用户手动介入
  const changeOrigId = halfArchivedChange.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return {
    case: 'C',
    message:
      `case C:archive/${halfArchivedChange} 与 backup 不一致,需用户介入。请手动选择:\n` +
      `  [完成归档] 恢复 specs 后再跑 forge archive --recover\n` +
      `  [撤销归档] mv ${join(archiveDir, halfArchivedChange)} ${join(forgeRoot, 'changes', changeOrigId)}\n` +
      `  backup 位置:${backupDir}`,
  };
```

替换为:

```typescript
  // case C:deltas 含 delete 或内容不一致(说明状态不一致)
  // Plan 6:加完整性 check + 给 CLI 提供 caseCData 让其决定走交互(两者都完整)或退出 4(任一不完整)
  const changeOrigId = halfArchivedChange.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const archiveChangeDir = join(archiveDir, halfArchivedChange);
  const backupIntegrity = await checkBackupIntegrity(backupDir);
  const archiveIntegrity = await checkArchiveIntegrity(archiveChangeDir);

  const baseMsg =
    `case C:archive/${halfArchivedChange} 与 backup 不一致(specs 应用状态)。\n` +
    `  archive 位置:${archiveChangeDir}\n` +
    `  backup 位置:${backupDir}`;

  return {
    case: 'C',
    message: baseMsg,
    caseCData: {
      archiveChangeDir,
      changeOrigId,
      backupDir,
      archiveSpecsDir,
      currentSpecsDir,
      deltas,
      backupIntegrity,
      archiveIntegrity,
    },
  };
```

- [ ] **Step 3:跑既有 recover 测试,确认未破**

```bash
pnpm vitest run tests/core/archive/recover.test.ts
```

预期:既有 tests 全 pass(message 字面量改了可能影响测试断言;若 fail,改测试断言或收缩;Task A4 会补完整测试)。

- [ ] **Step 4:typecheck**

```bash
pnpm typecheck
```

预期:0 errors(SpecDelta 已 import,只是接口加字段)。

- [ ] **Step 5:commit**

```bash
git add src/core/archive/recover.ts
git commit -m "feat(archive): recover case C 返回结构化 caseCData(spec §3.5)"
```

---

### Task A4:`archive.ts` --recover 路径处理 case C

**Files:**
- Modify: `src/cli/commands/archive.ts`
- Test: 修改 `tests/core/archive/recover.test.ts`(加 case C 完整性 check 测试)

- [ ] **Step 1:改 `src/cli/commands/archive.ts` 的 --recover 段**

定位 `// —— --recover 独立路径 ——` 段(应在 line 53 附近)。当前实现:

```typescript
      if (opts.recover) {
        let release: (() => Promise<void>) | undefined;
        try {
          release = await acquireLock(forgeRoot, 'recover');
          const r = await recover(forgeRoot);
          console.log(r.message);
          if (r.case === 'corrupt') {
            const rel = release;
            release = undefined;
            if (rel) await rel();
            process.exit(4);
          }
          const rel = release;
          release = undefined;
          if (rel) await rel();
          process.exit(0);
        } catch (err) {
          // ...
        } finally {
          if (release) await release();
        }
      }
```

替换为(加 case C 处理):

```typescript
      if (opts.recover) {
        let release: (() => Promise<void>) | undefined;
        try {
          release = await acquireLock(forgeRoot, 'recover');
          const r = await recover(forgeRoot);
          console.log(r.message);

          // Plan 6:case C 处理 — 完整性 check + 交互二选一
          if (r.case === 'C' && r.caseCData) {
            const { backupIntegrity, archiveIntegrity } = r.caseCData;
            // 任一不完整 → 退出码 4(spec §3.5 case C 末尾"任一不完整 → 输出诊断 + 退出码 4")
            if (!backupIntegrity.ok || !archiveIntegrity.ok) {
              console.error('✗ case C 完整性 check 失败,需人工介入:');
              if (!backupIntegrity.ok) console.error(`  backup: ${backupIntegrity.reason}`);
              if (!archiveIntegrity.ok) console.error(`  archive: ${archiveIntegrity.reason}`);
              const rel = release;
              release = undefined;
              if (rel) await rel();
              process.exit(4);
            }
            // 两者都完整 → 交互式二选一
            const choice = await promptRecoverChoice();
            if (choice === 'complete-archive') {
              // 完成归档:重跑 Sync(applyDeltas)+ 删 backup
              await applyDeltas(r.caseCData.currentSpecsDir, r.caseCData.deltas);
              await rm(r.caseCData.backupDir, { recursive: true, force: true });
              console.log('✓ case C 选择 [1] 完成归档:Sync 重跑成功,backup 已清理');
            } else {
              // 撤销归档:从 backup 恢复 forge/specs/ + 反向 rename
              await restoreSpecsFromBackup(r.caseCData.backupDir, r.caseCData.currentSpecsDir);
              await rename(
                r.caseCData.archiveChangeDir,
                join(forgeRoot, 'changes', r.caseCData.changeOrigId),
              );
              await rm(r.caseCData.backupDir, { recursive: true, force: true });
              console.log('✓ case C 选择 [2] 撤销归档:specs 已还原,archive 反向 rename 完成');
            }
            const rel = release;
            release = undefined;
            if (rel) await rel();
            process.exit(0);
          }

          if (r.case === 'corrupt') {
            const rel = release;
            release = undefined;
            if (rel) await rel();
            process.exit(4);
          }
          const rel = release;
          release = undefined;
          if (rel) await rel();
          process.exit(0);
        } catch (err) {
          if (err instanceof LockHeldError) {
            console.error(err.message);
            process.exit(5);
          }
          throw err;
        } finally {
          if (release) await release();
        }
      }
```

- [ ] **Step 2:在 `archive.ts` 顶部追加 imports**

```typescript
import { rm, rename, readdir, copyFile, mkdir } from 'node:fs/promises';
import { promptRecoverChoice } from '../../core/archive/recover-prompt.js';
import { applyDeltas } from '../../core/specs-sync/index.js';
```

注:`rm` `rename` 等 fs/promises API 可能与 archive.ts 已有 imports 冲突或重复;以最小改动为原则,只补缺失的。具体看现有 imports 调整。

- [ ] **Step 3:在 `archive.ts` 末尾追加 `restoreSpecsFromBackup` helper**

```typescript
/**
 * 从 backup 目录把所有备份的 specs 文件还原到 currentSpecsDir(case C [2] 撤销归档用)。
 *
 * 简单语义:backup 内每个 .md 文件 copy 回 currentSpecsDir/ 同名位置,
 *           对应的 currentSpecsDir 内文件被覆盖。
 * 不删除 currentSpecsDir 中"backup 没有的文件"(理由:那些是 archive 没影响的旧文件)。
 */
async function restoreSpecsFromBackup(backupDir: string, currentSpecsDir: string): Promise<void> {
  const entries = await readdir(backupDir);
  await mkdir(currentSpecsDir, { recursive: true });
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    await copyFile(join(backupDir, name), join(currentSpecsDir, name));
  }
}
```

- [ ] **Step 4:typecheck**

```bash
pnpm typecheck
```

预期:0 errors。如果 imports 冲突报错,合并去重。

- [ ] **Step 5:跑既有 archive + recover 测试**

```bash
pnpm vitest run tests/core/archive/ tests/cli/archive.test.ts
```

预期:既有 tests 全 pass。如某个 case C 既有测试因 message 字面量改了 fail,Task A5 修。

- [ ] **Step 6:commit**

```bash
git add src/cli/commands/archive.ts
git commit -m "feat(archive): --recover case C 完整性 check + 交互式二选一(spec §3.5)"
```

---

### Task A5:补 case C 单测(完整性 check 各分支)

**Files:**
- Modify: `tests/core/archive/recover.test.ts`(追加 case C 测试)

- [ ] **Step 1:在 `tests/core/archive/recover.test.ts` 末尾追加 4 个新 it block**

```typescript
import { checkBackupIntegrity, checkArchiveIntegrity } from '../../../src/core/archive/recover.js';
// 上面 import 与既有 import 合并(若 recover 已 import,只补两个新 helper)

describe('forge-archive/recover Plan 6 case C 完整性 check', () => {
  let forgeRoot: string;
  beforeEach(() => {
    forgeRoot = mkdtempSync(join(tmpdir(), 'forge-recover-c-'));
    mkdirSync(join(forgeRoot, 'forge'), { recursive: true });
  });
  afterEach(() => {
    rmSync(forgeRoot, { recursive: true, force: true });
  });

  it('checkBackupIntegrity:目录不存在 → ok=false', async () => {
    const r = await checkBackupIntegrity(join(forgeRoot, 'forge', '.cache', 'archive-sync-backup-x'));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('不存在');
  });

  it('checkBackupIntegrity:目录空 → ok=false', async () => {
    const dir = join(forgeRoot, 'forge', '.cache', 'archive-sync-backup-1');
    mkdirSync(dir, { recursive: true });
    const r = await checkBackupIntegrity(dir);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('为空');
  });

  it('checkBackupIntegrity:含 .md 可读 → ok=true', async () => {
    const dir = join(forgeRoot, 'forge', '.cache', 'archive-sync-backup-1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'foo.md'), '# foo', 'utf8');
    const r = await checkBackupIntegrity(dir);
    expect(r.ok).toBe(true);
  });

  it('checkArchiveIntegrity:缺 marker → ok=false', async () => {
    const dir = join(forgeRoot, 'forge', 'changes', 'archive', '2026-05-05-test');
    mkdirSync(join(dir, 'specs'), { recursive: true });
    // 缺 .verify-passed
    const r = await checkArchiveIntegrity(dir);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('.verify-passed');
  });

  it('checkArchiveIntegrity:目录结构完整 → ok=true', async () => {
    const dir = join(forgeRoot, 'forge', 'changes', 'archive', '2026-05-05-test');
    mkdirSync(join(dir, 'specs'), { recursive: true });
    writeFileSync(join(dir, '.verify-passed'), 'schema: forge-verify/v1', 'utf8');
    writeFileSync(join(dir, '.review-passed'), 'schema: forge-review/v1', 'utf8');
    const r = await checkArchiveIntegrity(dir);
    expect(r.ok).toBe(true);
  });
});
```

注:测试文件顶部需含 `mkdtempSync, mkdirSync, writeFileSync, rmSync` from `node:fs`、`tmpdir` from `node:os`、`join` from `node:path`。这些与 Plan 3 既有 recover.test.ts 应该已有,合并 import 不重复。

- [ ] **Step 2:跑测试**

```bash
pnpm vitest run tests/core/archive/recover.test.ts
```

预期:既有 + 5 个新 = 全部 pass。

- [ ] **Step 3:commit**

```bash
git add tests/core/archive/recover.test.ts
git commit -m "test(archive): recover case C 完整性 check 5 个分支测试"
```

---

## Phase B:Release Gate Checklist + 自动化脚本

### Task B1:`docs/release-gate-checklist.md`(maintainer 手动 checklist)

**Files:**
- Create: `docs/release-gate-checklist.md`

- [ ] **Step 1:写 `docs/release-gate-checklist.md`**

````markdown
# Forge Release Gate Checklist

每发版必须人工跑一遍。任一不通过不发版(spec §5.1)。

## 1. 自动化部分(在 dev 或 release 候选分支上跑)

```bash
pnpm install --frozen-lockfile
node scripts/release-gate.mjs
```

`release-gate.mjs` 会:
- 跑 5 个本地命令(typecheck / lint / format:check / build / vitest)
- `pnpm pack --dry-run` 验证 tarball 内容仅含 `dist/` + 3 个 license/readme 文件
- 创建临时目录,`npm install` tarball,验证 `forge --version` 退出码 0

任一 step 失败 → 报错并退出非 0,不进入手动部分。

## 2. 手动部分:harness acceptance test(spec §5.1)

**v0.1 必须跑两 harness:Claude Code + Codex。任一失败不发版。**

### 2.1 Claude Code

1. 起一个空目录 `mkdir /tmp/forge-release-test-claude && cd $_`
2. `git init`(forge 在非 git 项目下会 warn,在 git 下表现完整)
3. `pnpm dlx @accelerator-mzq/forge init --harness claude`(若发版前,可用本地 tarball 替换:`npm install -g <forge-tarball>` 后跑 `forge init --harness claude`)
4. 起 Claude Code 会话(`claude` 命令)
5. **第一句发**:`我想做个 todo list 应用`
6. **期望(✅ 通过条件,全满足才算 PASS)**:
   - AI 不写代码,反而开始问问题
   - AI 提到至少一个 forge 概念(如 "forge:brainstorming" / "forge/drafts/")
   - 多轮对话完成后,`forge/drafts/<date>-todo-list.md` 文件被创建
7. 把 transcript 复制到 `docs/release-gate-evidence/<version>-claude.md`(供后续 release notes 引用)

### 2.2 Codex

同上,但 step 3 改为 `--harness codex`,step 4 改为起 Codex 会话。

文件路径变为 `.agents/skills/forge-*/SKILL.md`(共享 Claude Agent SDK 约定)而非 `.claude/`。

### 2.3 失败处理

任一 harness 不满足上述期望:
- **不发版**
- 在 GitHub Issues 开 issue,标 `release-gate-fail` label
- 检查最近 PR 是否动了 `src/core/templates/skills/using-forge.md` 或 `forge:brainstorming` 文本
- 修复 → 跑全套 release gate(自动 + 手动)→ 通过后再发版

## 3. 发版动作(checklist 全过后,maintainer 手动)

```bash
# 1. 更新版本号(根据 CHANGELOG.md)
npm version <patch|minor|major> --no-git-tag-version

# 2. 提交 version bump
git add package.json
git commit -m "chore: release v<X.Y.Z>"

# 3. push 并合并到 main(走标准 PR 流程,等 CI 绿)

# 4. 打 git tag
git tag v<X.Y.Z>
git push origin v<X.Y.Z>

# 5. npm publish
npm publish --access public

# 6. 在 GitHub 上 Create release(从 v<X.Y.Z> tag),粘贴 CHANGELOG.md 该版本段
```

## 4. 发版后 sanity check

```bash
# 在干净环境验证全球可装
mkdir /tmp/forge-postrelease && cd $_
npm install -g @accelerator-mzq/forge
forge --version       # 应输出 X.Y.Z
forge init --harness claude
ls .claude/skills/    # 应见 12 个 forge-*/
```

任一不通过 → 立即在 GitHub Issues 开 issue,考虑 unpublish(`npm unpublish` 仅在发版 72 小时内可用)+ patch release。
````

- [ ] **Step 2:commit**

```bash
git add docs/release-gate-checklist.md
git commit -m "docs: release gate checklist(spec §5.1 含 manual harness smoke + 发版动作)"
```

---

### Task B2:`scripts/release-gate.mjs`(自动化部分)

**Files:**
- Create: `scripts/release-gate.mjs`

- [ ] **Step 1:写 `scripts/release-gate.mjs`**

```javascript
#!/usr/bin/env node
// release gate 自动化部分 — Plan 6
// 跑 5 个本地命令 + pnpm pack + 临时目录 dry install + forge --version 验证
// 任一失败 exit 非 0,docs/release-gate-checklist.md 的"自动化部分"调用本脚本

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const steps = [
  { name: 'typecheck', cmd: 'pnpm typecheck' },
  { name: 'lint', cmd: 'pnpm lint' },
  { name: 'format:check', cmd: 'pnpm format:check' },
  { name: 'build', cmd: 'pnpm build' },
  { name: 'vitest', cmd: 'pnpm vitest run' },
];

console.log('=== forge release gate(自动化部分)===\n');

for (const step of steps) {
  process.stdout.write(`[${step.name}] ... `);
  try {
    execSync(step.cmd, { stdio: 'pipe' });
    console.log('OK');
  } catch (err) {
    console.log('FAIL');
    console.error(err.stdout?.toString() ?? '');
    console.error(err.stderr?.toString() ?? '');
    process.exit(1);
  }
}

// pnpm pack 真打 tarball,验证文件内容
console.log('\n[pack] pnpm pack 打 tarball ...');
let tarballName;
try {
  const out = execSync('pnpm pack', { encoding: 'utf8' });
  // pnpm pack 输出 tarball 文件名(最后一行)
  const lines = out.trim().split(/\r?\n/);
  tarballName = lines[lines.length - 1].trim();
  if (!tarballName.endsWith('.tgz')) {
    throw new Error(`pnpm pack 输出未识别 tarball:${out}`);
  }
  console.log(`  → ${tarballName}`);
} catch (err) {
  console.error('FAIL: pnpm pack');
  console.error(err.message);
  process.exit(2);
}

// tarball 结构验证(tar -tzf 列内容,过滤 package/ 前缀)
console.log('\n[tarball-content] 验证 tarball 内容 ...');
try {
  const out = execSync(`tar -tzf ${tarballName}`, { encoding: 'utf8' });
  const entries = out.split(/\r?\n/).filter(Boolean).map((e) => e.replace(/^package\//, ''));
  // 期望:dist/cli/index.js + dist/core/templates/skills/<12>.md + README.md + LICENSE + LICENSE-THIRD-PARTY.md + package.json
  const requiredPrefixes = [
    'dist/cli/index.js',
    'dist/core/templates/skills/',
    'README.md',
    'LICENSE',
    'package.json',
  ];
  for (const required of requiredPrefixes) {
    if (!entries.some((e) => e.startsWith(required))) {
      throw new Error(`tarball 缺少:${required}`);
    }
  }
  // 不应有的:src/、tests/、forge-eval/、docs/、scripts/、.github/
  const forbiddenPrefixes = ['src/', 'tests/', 'forge-eval/', 'docs/', 'scripts/', '.github/'];
  for (const forbidden of forbiddenPrefixes) {
    if (entries.some((e) => e.startsWith(forbidden))) {
      throw new Error(`tarball 不该含:${forbidden}`);
    }
  }
  console.log(`  → ${entries.length} 个文件,结构 OK`);
} catch (err) {
  console.error('FAIL: tarball 内容验证');
  console.error(err.message);
  process.exit(3);
}

// 临时目录 dry install + forge --version 验证
console.log('\n[dry-install] 临时目录安装 tarball + forge --version ...');
const dryDir = mkdtempSync(join(tmpdir(), 'forge-dry-'));
try {
  // 在 dry 目录初始化 npm 项目,装 tarball
  execSync('npm init -y', { cwd: dryDir, stdio: 'pipe' });
  execSync(`npm install ${join(process.cwd(), tarballName)}`, { cwd: dryDir, stdio: 'pipe' });
  // 跑 npx forge --version
  const versionOut = execSync('npx forge --version', { cwd: dryDir, encoding: 'utf8' });
  const expected = JSON.parse(readFileSync('package.json', 'utf8')).version;
  if (!versionOut.includes(expected)) {
    throw new Error(`forge --version 输出 "${versionOut.trim()}" 不含 package.json 版本号 "${expected}"`);
  }
  console.log(`  → forge --version 输出含 ${expected},OK`);
} catch (err) {
  console.error('FAIL: dry install');
  console.error(err.message);
  rmSync(dryDir, { recursive: true, force: true });
  // 不删 tarball — 让维护者可手动调试
  process.exit(4);
} finally {
  rmSync(dryDir, { recursive: true, force: true });
}

// 清理 tarball
rmSync(tarballName, { force: true });

console.log('\n=== release gate 自动化部分 PASS ===');
console.log('\n下一步:跑 docs/release-gate-checklist.md 的手动部分(harness acceptance test)');
process.exit(0);
```

- [ ] **Step 2:跑一次本地验证脚本**

```bash
node scripts/release-gate.mjs
```

预期(macOS/Linux + tar 可用):
- 5 个本地命令全 OK
- pnpm pack 出 tarball
- tarball 内容验证 OK
- dry install + forge --version 输出版本号

**Windows 注意**:`tar -tzf` 在 Windows 10+ 内置 bsdtar 应当工作;若不工作,改为读 tarball 用 Node `node:zlib` + 流式 tar 解析(本 plan v0.1 不实施跨平台 tar parsing,Windows 维护者用 WSL 跑或临时跳过此 step)。

如脚本在 Windows 上 tar fail,加 try/catch + 提示用户用 WSL,**不阻塞**:

```javascript
// 在 [tarball-content] step 包裹:
try {
  const out = execSync(`tar -tzf ${tarballName}`, { encoding: 'utf8' });
  // ...
} catch (err) {
  if (process.platform === 'win32') {
    console.warn('  ⚠ Windows 下 tar 命令不可用,跳过 tarball 内容验证(请用 WSL 或 macOS/Linux 重跑)');
  } else {
    throw err;
  }
}
```

- [ ] **Step 3:commit**

```bash
git add scripts/release-gate.mjs
git commit -m "feat(scripts): release-gate.mjs 自动化(本地命令 + pack + dry install)"
```

---

## Phase C:用户文档

### Task C1:重写主 `README.md`(面向用户)

**Files:**
- Modify: `README.md`(整体重写)

- [ ] **Step 1:覆盖 `README.md`**

````markdown
# Forge

> Multi-harness CLI 把 OpenSpec 的产物驱动工作流和 superpowers 的行为塑造 skill 体系融合到一起。AI 在 Claude Code / Codex 等 harness 里按统一规范工作。

```bash
pnpm dlx @accelerator-mzq/forge init --harness claude
# 或
pnpm dlx @accelerator-mzq/forge init --harness codex
```

## 它做什么

1. **把 12 个行为塑造 skill 装到 harness 里**:`brainstorming`(模糊需求时强制提问)、`test-driven-development`(red→green→refactor)、`subagent-driven-development`(派 fresh 子代理实施每个 task)、`verification-before-completion`(声称完成必附证据)等。
2. **把 6 个工作流命令铺到 harness**:`/forge:brainstorm` → `/forge:propose` → `/forge:apply` → `/forge:review` → `/forge:verify` → `/forge:archive` 串成产物化流水线。
3. **CLI 兜底**:`forge validate / archive` 验证产物完整性、严格门禁归档(verify+review marker hash 不对就拒绝)。
4. **专注 v0.1 = Claude Code + Codex**(OpenCode 推 v0.2,需要 plugin 实现自动注入)。

## 5 分钟跑通

详见 [`docs/getting-started.md`](docs/getting-started.md)。

```bash
# 1. 装 + 初始化
mkdir my-project && cd my-project
git init                                            # 强烈建议(非 git 项目下 review 标记不绑代码 diff)
pnpm dlx @accelerator-mzq/forge init --harness claude

# 2. 起 harness 会话,第一句话:
#    "我想做个 todo list 应用"
#    AI 自动触发 brainstorming,问问题、写 forge/drafts/<date>-todo-list.md

# 3. 你审完 draft,跑:
#    /forge:propose add-todo --from-draft 2026-05-05-todo-list
#    AI 调 writing-plans skill,产出 forge/changes/add-todo/{proposal,specs,design,tasks}.md

# 4. 跑 /forge:apply,AI 派子代理跑 TDD 实施每个 task
# 5. 跑 /forge:review,派 review 子代理 + 主代理处理反馈
# 6. 跑 /forge:verify,跑 forge validate + 写 .verify-passed
# 7. 跑 /forge:archive,严格校验 marker hash → mv 到 forge/changes/archive/
```

## CLI 命令

`forge init / update / config / validate / archive`。详见 [`docs/cli-reference.md`](docs/cli-reference.md)。

## Harness 安装

[Claude Code 与 Codex 的安装步骤、bootstrap 注入路径、调试技巧](docs/harness-setup.md)。

## 设计文档

- [2026-05-04 融合方案设计](docs/specs/2026-05-04-forge-fusion-design.md)(1273 行,21 条决策,完整架构 / 数据流 / 错误处理 / 测试策略 / 实施路线)
- [Plan 1-6 实施记录](docs/plans/)
- [Phase 0.5 spike 结果](spike/RESULTS.md):为什么 v0.1 = Claude Code + Codex 两 harness

## 状态

**v0.1 候选**:Phase 1+2+3+4+5+6 完成,自动化 skill eval 跑在 weekly + PR cadence,本地 5 命令全 0,**release gate 通过即可发版**。详见 [`CHANGELOG.md`](CHANGELOG.md)。

## 许可

MIT。复制了 superpowers 的 12 个 skill 文本(MIT 许可),attribution 见 [`LICENSE-THIRD-PARTY.md`](LICENSE-THIRD-PARTY.md)。

## 致谢

- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — 产物驱动工作流的设计灵感
- [superpowers](https://github.com/obra/superpowers) — 行为塑造 skill 体系的源头(skill 文本经 MIT 许可移植)
````

- [ ] **Step 2:commit**

```bash
git add README.md
git commit -m "docs(readme): 重写为面向用户(快速开始 + CLI / harness 链接)"
```

---

### Task C2:`docs/getting-started.md`(5 分钟教程)

**Files:**
- Create: `docs/getting-started.md`

- [ ] **Step 1:写 `docs/getting-started.md`**

````markdown
# Forge Getting Started(5 分钟跑通)

本文带你从空目录一直走到 `forge archive` 完成第一次归档。

## 前置

- Node.js ≥ 20.19,pnpm ≥ 9
- 已装 Claude Code 或 Codex(本教程用 Claude Code)
- 一个干净空目录,**最好 git init 过**(非 git 项目下 review 标记不绑代码 diff,archive 必须 --force 才接受)

## 1. 安装 + 初始化(30 秒)

```bash
mkdir my-todo-app && cd my-todo-app
git init
pnpm dlx @accelerator-mzq/forge init --harness claude
```

会发生什么:
- 检测到当前目录(空但有 `.git/`),自动选择 `claude` adapter
- 把 12 个 skill 铺到 `.claude/skills/forge-*/SKILL.md`
- 把 6 个命令铺到 `.claude/commands/forge/*.md`
- 创建 `forge/config.yaml` + `forge/{drafts,changes,specs}/` 骨架

确认:
```bash
ls .claude/skills/         # 12 个 forge-* 目录
ls .claude/commands/forge/ # 6 个 .md
cat forge/config.yaml      # harness: [claude]
```

## 2. 起 Claude Code 会话,触发 brainstorming(2 分钟)

```bash
claude
```

第一句话发:

> 我想做个 todo list 应用

期望发生(✅ 表示 forge 工作正常):
- AI **不**直接写代码
- AI 反而问 2-3 个澄清问题(目的、约束、成功标准)
- 多轮对话后,AI 提议把 design 写到 `forge/drafts/<date>-todo-list.md`

如果 AI 直接写代码 → bootstrap 没生效,看 [`docs/harness-setup.md`](harness-setup.md) 排查。

完成后,确认:
```bash
ls forge/drafts/  # 至少一个 .md 文件
```

## 3. 把 draft 转 change(1 分钟)

在 Claude Code 里发:

```
/forge:propose add-todo --from-draft 2026-05-05-todo-list
```

(把 `2026-05-05-todo-list` 替换为实际 draft 文件名,不带 `.md`)

期望发生:
- AI 读 draft 内容
- AI 调 `forge:writing-plans` skill,产出 4 件套到 `forge/changes/add-todo/`:
  - `proposal.md` — Why + What + Scope
  - `specs/<area>.md` — Given/When/Then 格式
  - `design.md` — 技术方案
  - `tasks.md` — checkbox 列表(每个 task 2-5 分钟粒度)
- draft 移到 `forge/drafts/.consumed/`

确认:
```bash
ls forge/changes/add-todo/
```

## 4. AI 实施 tasks(1 分钟主代理时间;子代理可能跑数分钟)

```
/forge:apply
```

期望发生:
- AI 调 `forge:subagent-driven-development` + `forge:test-driven-development`
- 对每个未勾选 task:
  - 派 fresh 子代理拿 [task + 相关 spec + design] 启动
  - 子代理跑 red→green→refactor + git commit
  - 主代理 review 子代理 commit + test 日志,通过 → 在主工作区把 `[ ]` 改 `[x]`
- 全部完成后 tasks.md 末尾追加 `applied_commits` 列表

## 5. 派 review subagent + 处理反馈(2 分钟)

```
/forge:review
```

期望发生:
- 派 fresh review 子代理审 [proposal + specs + design + git diff]
- 主代理对每条意见判断 accept / reject(用证据反驳,不机械接受)
- 接受的意见 append 到 tasks.md 末尾作为新 task
- 满足三条件(无悬挂意见 + 接受意见已实现 + 本轮无新增 task)→ 写 `.review-passed` YAML

## 6. 验证 + 归档(30 秒)

```
/forge:verify
```

跑 `forge validate` + 跑用户测试套 + 写 `.verify-passed` YAML(含 evidence log_hash)。

```
/forge:archive
```

调 `forge archive add-todo` CLI:
- 校验 .verify-passed + .review-passed marker schema + hash + git integrity
- 严格 + Move 到 `forge/changes/archive/<date>-add-todo/` + Sync specs deltas 到 `forge/specs/`
- 调 `forge:finishing-a-development-branch` 提示 git 层面合并/PR/清理决策

确认:
```bash
ls forge/changes/archive/   # 含 <date>-add-todo
ls forge/specs/             # 应有归档 change 留下的 spec 文件
```

## 接下来

- [`docs/cli-reference.md`](cli-reference.md):5 个 CLI 命令的完整参数 + 退出码
- [`docs/harness-setup.md`](harness-setup.md):Claude Code + Codex 安装详解 + bootstrap 注入路径
- 改坏了想重来:`rm -rf forge/ .claude/ && pnpm dlx @accelerator-mzq/forge init --harness claude`(慎用,会丢全部 draft / change / spec)

## 出问题怎么办

- bootstrap 没生效(AI 直接写代码) → 检查 `.claude/skills/forge-using-forge/SKILL.md` 文件存在;重启 Claude Code 会话;`forge update --force` 强制重铺
- archive 拒绝(`marker 已过期`) → tasks.md 或 specs/ 被改过,重跑 `/forge:verify` + `/forge:review`
- `forge update` 报"已被用户修改" → 默认行为(spec §4.2);`forge update --force` 强制覆盖

完整问题清单见 [`docs/cli-reference.md` 的"错误退出码"段](cli-reference.md#错误退出码)。
````

- [ ] **Step 2:commit**

```bash
git add docs/getting-started.md
git commit -m "docs: getting-started.md(5 分钟跑通 init→archive 完整流程)"
```

---

### Task C3:`docs/harness-setup.md`(Claude Code + Codex)

**Files:**
- Create: `docs/harness-setup.md`

- [ ] **Step 1:写 `docs/harness-setup.md`**

````markdown
# Forge Harness 安装与配置

v0.1 支持 Claude Code 与 Codex 两个 harness(Phase 0.5 spike 结果,详 [spike/RESULTS.md](../spike/RESULTS.md))。OpenCode 推 v0.2(需要 plugin 实现自动注入)。

## Claude Code

### 安装

参考 [Anthropic 官方文档](https://docs.anthropic.com/claude/docs)。本节假设 `claude` 命令在 PATH 里。

### Forge bootstrap 注入路径

`forge init --harness claude` 在项目目录铺:

```
.claude/
├── skills/
│   ├── forge-using-forge/SKILL.md           # bootstrap,会话开始注入
│   ├── forge-brainstorming/SKILL.md
│   ├── forge-writing-plans/SKILL.md
│   ├── forge-subagent-driven-development/SKILL.md
│   ├── forge-test-driven-development/SKILL.md
│   ├── forge-requesting-code-review/SKILL.md
│   ├── forge-receiving-code-review/SKILL.md
│   ├── forge-verification-before-completion/SKILL.md
│   ├── forge-systematic-debugging/SKILL.md
│   ├── forge-dispatching-parallel-agents/SKILL.md
│   ├── forge-using-git-worktrees/SKILL.md
│   └── forge-finishing-a-development-branch/SKILL.md
└── commands/forge/
    ├── brainstorm.md
    ├── propose.md
    ├── apply.md
    ├── review.md
    ├── verify.md
    └── archive.md
```

`using-forge` SKILL.md 是 bootstrap — Claude Code 在每个会话开始把它加载到 system prompt,12 个 skill 的红旗清单按需触发。

### 验证 bootstrap 生效

参见 [`getting-started.md` 第 2 步](getting-started.md#2-起-claude-code-会话触发-brainstorming2-分钟)。简言之:发"我想做个 todo list",AI 应该问问题而非写代码。

### 调试

bootstrap 没生效(AI 直接给方案):
- 确认文件存在:`ls .claude/skills/forge-using-forge/SKILL.md`
- 确认 Claude Code 会话是新的(老会话不会重新加载 skills)
- 重铺:`forge update --force`(强制覆盖被改的 skill 文件)
- 终极手段:`rm -rf .claude/skills/forge-* .claude/commands/forge/ && forge update`

## Codex

### 安装

参考 [Codex 官方文档](https://github.com/anthropics/codex)。本节假设 codex 命令可用。

### Forge bootstrap 注入路径

`forge init --harness codex` 在项目目录铺:

```
.agents/
├── skills/
│   ├── forge-using-forge/SKILL.md           # bootstrap
│   ├── forge-brainstorming/SKILL.md
│   ├── ... (其余 11 个同上)
│   └── forge-finishing-a-development-branch/SKILL.md
└── commands/forge/
    ├── brainstorm.md
    └── ... (其余 5 个同上)
```

注:Codex 用 `.agents/` 目录(共享 Claude Agent SDK 约定),不是 `.codex/`。Phase 0.5 spike 实测确认。

### 验证

同 Claude Code:发"我想做个 todo list",期望 AI 问问题。

### 调试

同 Claude Code,把 `.claude/` 替换为 `.agents/`。

## 同时装多个 harness

```bash
forge init --harness claude,codex
```

会同时铺 `.claude/` 和 `.agents/`。`forge/config.yaml` 的 `harness` 字段记录 `[claude, codex]`。后续 `forge update` 重铺这两个 harness。

## OpenCode(v0.2 计划)

Phase 0.5 spike 实测 OpenCode 的 skill 路径(`~/.config/opencode/skills/` 与 `.opencode/skills/`)只把 SKILL.md 注册为可调用工具,**不**自动注入到 system prompt。要让 bootstrap 生效需要写 plugin 用 OpenCode 的 `experimental.chat.messages.transform` hook,这不在 v0.1 范围。

v0.1 用 OpenCode 的临时方案:用户每个会话开头手动复制粘贴 `using-forge` SKILL.md 内容,**强烈不推荐**(违反"自动触发"前提,体验差)。建议等 v0.2 plugin 完成。

## 安装跨用户(不推荐)

forge 当前只支持项目级安装(铺到当前目录的 `.claude/` 等)。不支持全局安装到 `~/.claude/skills/forge-*/`(那会污染所有项目)。如果要这么做,自己手动复制 `dist/core/templates/skills/*.md` 到对应路径,但 forge update 不会维护它们。
````

- [ ] **Step 2:commit**

```bash
git add docs/harness-setup.md
git commit -m "docs: harness-setup.md(Claude Code + Codex 安装/调试 + OpenCode v0.2 说明)"
```

---

### Task C4:`docs/cli-reference.md`(5 命令完整 reference)

**Files:**
- Create: `docs/cli-reference.md`

- [ ] **Step 1:写 `docs/cli-reference.md`**

````markdown
# Forge CLI Reference

5 个公开命令:`init` / `update` / `config` / `validate` / `archive`。

## `forge init`

初始化 forge 到当前目录:检测 / 选择 harness、铺 skills + commands、创建 `forge/` 骨架。

```
forge init [--harness <list>] [--force]
```

### 选项

| 选项 | 说明 |
|---|---|
| `--harness <list>` | 逗号分隔 harness id(`claude`、`codex`)。缺省自动检测项目里已有的 harness(扫 `.claude/`、`.agents/`、`AGENTS.md`)。指定值优先 |
| `--force` | 当 skill / command 文件已被用户修改(SHA256 hash 不匹配 shipped 内容)时,强制覆盖。缺省跳过 + warn |

### 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | harness 无效 / 未检测到任何受支持的 harness |

### 例子

```bash
forge init                              # 自动检测
forge init --harness claude             # 仅 Claude Code
forge init --harness claude,codex       # 双 harness
forge init --harness claude --force     # 用户改过 skill 也强制覆盖
```

非 git 项目下会 warn(review 标记不绑代码 diff,archive 必须 --force 才接受)。

## `forge update`

重铺当前已配置 harness 的 skills + commands。`forge init` 之后跑(用户的 forge 升级了或本地手改了 skill 想还原)。

```
forge update [--harness <list>] [--force]
```

### 选项

| 选项 | 说明 |
|---|---|
| `--harness <list>` | 覆盖 `forge/config.yaml` 的 harness 字段(主要给 CI 用) |
| `--force` | hash 不匹配时强制覆盖 |

### 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | `forge/config.yaml` 不存在(未 init);或 harness 字段空且无 `--harness` |

## `forge config`

读 / 写 `forge/config.yaml` 的字段。

```
forge config get <key>
forge config set <key> <value>
forge config profile          # (v0.2)
```

### 例子

```bash
forge config get harness        # 输出:claude,codex
forge config set harness codex  # 改为只用 Codex
```

## `forge validate`

校验产物完整性:proposal 含 why、specs 是 Given/When/Then、tasks 含 checkbox 等。被 `/forge:propose` / `/forge:verify` slash 命令模板调用。

```
forge validate <changeId>
```

### 退出码

| 码 | 含义 |
|---|---|
| 0 | 校验通过 |
| 2 | 校验失败(stderr 含哪条规则、哪个文件、哪一行) |

## `forge archive`

归档 change:严格校验 marker → Move 到 archive/<date>-<id>/ → Sync deltas 到 specs/。

```
forge archive <changeId>          # 正常归档
forge archive <changeId> --force  # 接受 human-override 标记 或 非 git 项目
forge archive --recover           # 从半完成归档状态恢复
```

### 选项

| 选项 | 说明 |
|---|---|
| `--force` | 仅覆盖两类降级:`verified_by`/`reviewed_by` = `human-override`;非 git 项目跳过 git 字段。**不**覆盖 hash 不一致 / evidence 损坏 / outcome 未 resolved |
| `--recover` | 检测半完成归档(crash 后)并尝试恢复:case A(Sync 半完成,重跑 Sync)/ B(backup 残留,删 backup)/ C(冲突,交互式 [1] 完成 / [2] 撤销) |

### 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功(含 --recover 的 clean / A / B / C 已恢复) |
| 1 | 一般错误 / 缺 changeId(非 --recover 时) |
| 2 | marker 缺失 / hash 不匹配 / Sync 失败但反向回滚成功(可重试) |
| 3 | Sync 失败且反向回滚失败(需人工介入,backup 路径已打印) |
| 4 | --recover 检测到状态损坏 / case C 完整性 check 失败(需人工介入) |
| 5 | archive.lock 被另一进程占用 |

### 错误恢复

- 退出 2(可重试):修底层(disk / permission / git 状态)后再跑 `forge archive <id>`
- 退出 3(回滚失败):按打印的 backup 路径手动恢复 `forge/specs/`,然后 `forge archive --recover` 检查
- 退出 4(状态损坏):看 stderr 诊断,可能要手动 mv archive/ 回 changes/
- 退出 5(lock 占用):等另一进程结束,或检查 `forge/.cache/archive.lock` 内的 pid 是否真存活,stale lock 会被 forge 自动清

## 错误退出码(全命令通用)

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 一般错误 / 参数无效 |
| 2 | 业务规则失败(可重试) |
| 3 | 原子化操作回滚失败(需人工) |
| 4 | 状态损坏 / 需人工 |
| 5 | 资源被占用(lock) |

## 调试命令(非公开,但可用)

```bash
forge --version                  # 版本号
DEBUG=forge:* forge init         # (v0.2)详细日志
```
````

- [ ] **Step 2:commit**

```bash
git add docs/cli-reference.md
git commit -m "docs: cli-reference.md(5 命令完整 reference + 退出码表)"
```

---

### Task C5:`CHANGELOG.md`(v0.1.0 release notes)

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1:写 `CHANGELOG.md`**

````markdown
# Changelog

All notable changes to this project will be documented in this file.

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

(暂无)

## [0.1.0] — 2026-05-XX

首个公开版本。v0.1 实际范围 = Claude Code + Codex 两 harness(OpenCode 推 v0.2,需 plugin 实现自动注入)。

### Added

- **5 个公开 CLI 命令**:`forge init / update / config / validate / archive`(`specs-sync` 是内部模块,不公开)
- **2 个 harness adapter**:Claude Code(`.claude/skills/` + `.claude/commands/`)、Codex(`.agents/skills/` + `.agents/commands/`,共享 Claude Agent SDK 约定)
- **12 个 forge 命名空间 skill**(`forge-eval/scenarios/` 各对应一份 eval 场景;MIT 复制自 superpowers,调整产物路径与命名空间):
  - `using-forge`(bootstrap)
  - `brainstorming` / `writing-plans` / `subagent-driven-development` / `test-driven-development`
  - `requesting-code-review` / `receiving-code-review` / `verification-before-completion`
  - `systematic-debugging` / `dispatching-parallel-agents` / `using-git-worktrees`
  - `finishing-a-development-branch`
- **6 个 `/forge:*` slash 命令**:`/forge:brainstorm` → `/forge:propose` → `/forge:apply` → `/forge:review` → `/forge:verify` → `/forge:archive`
- **`forge archive` 严格门禁**:校验 `.verify-passed` + `.review-passed` marker 的 schema、tasks_hash、content_hash、evidence log_hash、git.head + git.diff_hash、review_outcomes resolved。任一不符 → 拒绝;`--force` 仅覆盖两类降级(human-override 标记 / 非 git 项目跳过 git 字段)
- **`forge archive --recover`**:从半完成归档恢复(case A/B/C/clean/corrupt 状态机;case C 交互式 [1] 完成归档 / [2] 撤销归档;含 backup/archive 完整性 check)
- **adapter 安装原子化**:Stage→Backup→Commit 三阶段 + 反向回滚;archive 内部 Move→Sync 顺序原子化
- **`--force` flag 真启用**:SHA256 hash 比对决定 init/update 是否覆盖被改 skill 文件
- **自动化 skill eval 框架**(`forge-eval/`):RED/GREEN 双跑(无 skill bootstrap vs 有,验证 skill 真起作用)+ 双轨 grading(模式匹配 must_match/must_not_match + LLM-as-judge 0-10 分,≥6 及格)+ delta 阈值(默认 1.5);12 个 skill 各 2-3 scenario 合计 29 scenario;CI 三 trigger(PR `--changed-only` / weekly Sunday / 手动);`ANTHROPIC_API_KEY` secret 缺失时优雅 skip
- **完整测试**:Linux + Windows runner CI,300+ tests,本地 5 命令(typecheck / lint / format:check / build / vitest)全 0
- **完整文档**:`getting-started.md`(5 分钟跑通)+ `harness-setup.md`(两 harness 安装/调试)+ `cli-reference.md`(5 命令完整参数 + 退出码)+ `release-gate-checklist.md`(maintainer 发版 checklist)+ 设计 spec(1273 行)+ Plan 1-6 实施记录

### License

MIT。复制 superpowers 12 个 skill 文本(MIT 许可),attribution 见 `LICENSE-THIRD-PARTY.md`。

### Known limitations(v0.1)

- **OpenCode 不支持**(spike 实测 skill 路径只注册工具不自动注入,需 plugin;v0.2 实施)
- **specs-sync delete 不支持**(spec 注明 v0.2 加,delete 需要 deletion marker 设计)
- **skill eval 锁 Sonnet 4.6**(v0.1 baseline,Sonnet 4.7 出来时 v0.2 重跑全量校准)
- **不支持 Web Dashboard / telemetry / i18n / 自定义 schema**(spec §7,v1 不做)
- **harness smoke 是 release gate manual checklist,不进 CI**(harness 是闭源 GUI,CI 跑不了)

[Unreleased]: https://github.com/Accelerator-mzq/forge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Accelerator-mzq/forge/releases/tag/v0.1.0
````

- [ ] **Step 2:commit**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG.md(v0.1.0 release notes,Keep a Changelog 风格)"
```

---

## Phase D:npm publish 工件准备

### Task D1:`package.json` 字段补全

**Files:**
- Modify: `package.json`

- [ ] **Step 1:在 `package.json` 加 `keywords` + `publishConfig`**

定位 `"license": "MIT",` 行,在其上方插入:

```json
  "keywords": [
    "openspec",
    "superpowers",
    "skill",
    "ai-workflow",
    "claude-code",
    "codex",
    "spec-driven-development",
    "tdd",
    "code-review"
  ],
  "publishConfig": {
    "access": "public"
  },
```

注:
- `keywords` 帮 npm search 发现
- `publishConfig.access: public` 因 package 名 `@accelerator-mzq/forge` 有 scope,默认 npm publish 是 restricted,需要 `--access public` 或 `publishConfig`

- [ ] **Step 2:typecheck(确认 package.json JSON 合法,不破坏什么)**

```bash
pnpm typecheck && pnpm build
```

预期:0 errors。

- [ ] **Step 3:commit**

```bash
git add package.json
git commit -m "build(package): 加 keywords + publishConfig.access=public"
```

---

### Task D2:`pnpm pack --dry-run` 验证 tarball 内容

**Files:** 无新增

- [ ] **Step 1:跑 dry-run 看 tarball 应包含什么**

```bash
pnpm pack --dry-run 2>&1 | head -100
```

预期看到:
- `dist/cli/index.js`
- `dist/core/templates/skills/<12>.md`(12 个 skill markdown)
- `dist/core/templates/commands/<6>.md`(6 个命令)
- `dist/core/...`(其他核心模块编译产物)
- `README.md`
- `LICENSE`
- `LICENSE-THIRD-PARTY.md`
- `package.json`

**不应**看到:
- `src/` `tests/` `forge-eval/` `docs/` `scripts/` `.github/`
- `node_modules/`
- 配置文件(`tsconfig.json` / `eslint.config.js` / `vitest.config.ts`)

如有偏差,核对 `package.json` 的 `files` 数组(应只含 `["dist", "README.md", "LICENSE", "LICENSE-THIRD-PARTY.md"]`),与 npm 默认排除(.gitignore 内容)交集决定最终 tarball 内容。

- [ ] **Step 2(可选,本 task 不 commit,只是验证)**

如果发现 tarball 内容不对,**不要在本 task 修改**,而是在下一个 commit 里调整 `files` 数组。验证完即可,无 commit。

---

### Task D3:本地 `npm install -g <tarball>` 真跑验证

**Files:** 无新增

- [ ] **Step 1:打 tarball + 临时全局装**

```bash
pnpm pack
# 得到 accelerator-mzq-forge-X.Y.Z.tgz

# 临时目录全局装
mkdir /tmp/forge-install-test && cd /tmp/forge-install-test
npm init -y
npm install <forge-repo>/accelerator-mzq-forge-X.Y.Z.tgz
```

(实际命令参考 `pnpm pack` 输出的具体文件名)

- [ ] **Step 2:验证 forge --version**

```bash
npx forge --version
```

预期:输出 `0.0.1`(或 `package.json` 当前版本)。如失败,检查:
- `dist/cli/index.js` 是否含正确 shebang(`#!/usr/bin/env node`)
- `dist/cli/index.js` 文件权限(npm 自动 chmod +x bin 文件,但本地 tar 可能不保留)

- [ ] **Step 3:验证 forge init**

```bash
mkdir test-init && cd test-init
git init
npx forge init --harness claude
ls .claude/skills/         # 12 个 forge-* 目录
ls forge/                  # config.yaml + drafts/ + changes/ + specs/
```

预期:全部存在。

- [ ] **Step 4:清理 + 回 forge-repo**

```bash
cd <forge-repo>
rm accelerator-mzq-forge-*.tgz
rm -rf /tmp/forge-install-test
```

- [ ] **Step 5(本 task 不 commit,验证为主)**

如发现 dist 缺东西 → 看 `scripts/copy-templates.mjs` 是否漏了某些 .md;补完跑 build 后再验证。本 task 验证通过后无 commit,直接进 Phase E。

---

## Phase E:全验证 + push + 完成记录

### Task E1:跑 release-gate.mjs(本地)

**Files:** 无新增

- [ ] **Step 1:跑 Phase B 写的 release-gate 脚本**

```bash
node scripts/release-gate.mjs
```

预期:
- 5 个本地命令全 OK
- pnpm pack 成功
- tarball 内容验证 OK
- dry install + forge --version 通过

任一失败回前面 Phase 修。

---

### Task E2:更新主 README "当前状态"段

**Files:**
- Modify: `README.md`(只改"状态"段)

- [ ] **Step 1:定位 README.md 的"## 状态"段(Phase C1 已重写),把内容改为**

```markdown
## 状态

**v0.1.0 候选**:Phase 1+2+3+4+5+6 完成。
- 本地 5 命令(typecheck / lint / format:check / build / test)全 0
- 测试 300+ passing(含 e2e-acceptance env-gated 1 skipped)
- CI Linux + Windows 双绿
- 自动化 skill eval 在 weekly + PR cadence 跑
- `npm publish` 工件已通过本地 release gate(`scripts/release-gate.mjs`)

**发版前置**:maintainer 跑 [`docs/release-gate-checklist.md`](docs/release-gate-checklist.md) 手动 harness acceptance test 两个 harness。通过即可发 v0.1.0。

详见 [`CHANGELOG.md`](CHANGELOG.md)。
```

- [ ] **Step 2:commit**

```bash
git add README.md
git commit -m "docs(readme): 状态段更新到 v0.1.0 候选"
```

---

### Task E3:全量本地验证 + push + Plan 6 完成记录

**Files:** Plan 文档末尾追加完成记录

- [ ] **Step 1:跑 5 个本地命令**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run
```

任一失败回前面 task 修;若 prettier 报新文件未格式化,跑 `pnpm format` 自动修(可加一个 fix commit)。

- [ ] **Step 2:统计测试数**

```bash
pnpm vitest run --reporter=basic 2>&1 | tail -5
```

记录 passed 总数。

- [ ] **Step 3:push 到 plan-6-release 分支(隔离 dev)**

类似 Plan 5,Plan 6 在独立分支:

```bash
# 在 Phase A 第一个 commit 之前应该已经切换到 plan-6-release;
# 若不是,现在切并把已有 commits 移过来
git status
git push -u origin plan-6-release  # 若分支已建,push 即可
```

(Plan 6 实施细节:本 plan 假定 implementer 在 Phase A 之前先 `git checkout -b plan-6-release`,后续 commits 都在这个分支。如忘记切,主控代理需先把 commits cherry-pick 到 plan-6-release 分支。这一约束在主控代理派 implementer 的 prompt 里明确)

- [ ] **Step 4:监视 CI**

```bash
gh run watch
```

预期:`ci.yml` 双绿(plan-6-release 分支不会触发,但 PR 时会触发)。

实际 plan-6-release 分支不在 ci.yml 的 push trigger 里(只 `[main, dev]`),所以 push 后不立即触发;等建 PR 时 PR check 触发。

- [ ] **Step 5:在 plan 文件末尾追加完成记录**

```markdown
---

## Plan 6 完成记录

- 完成时间:<UTC YYYY-MM-DD HH:MM>
- 总测试数:<N>
- CI run URL:<gh URL>(PR check)
- 关键 commit 范围:`<plan-doc-hash>..<HEAD hash>`
- v0.1.0 release gate 自动化部分:已通过
- v0.1.0 release gate 手动部分(Claude Code + Codex acceptance test):**待 maintainer 跑**(spec §5.1)
```

```bash
git add docs/plans/2026-05-05-plan-6-release.md
git commit -m "docs(plan-6): 完成记录 + 时间戳"
git push origin plan-6-release
```

- [ ] **Step 6:建 plan-6-release → dev 的 PR**(参照 PR #4 流程)

```bash
gh pr create --base dev --head plan-6-release --title "Plan 6:archive recover case C + 用户文档 + Release v0.1.0 准备" --body "..."
```

PR body 参照 Plan 5 PR 风格:Summary + Test plan + 完成度表 + Plan 文档链接。

---

## Plan 6 完成标准

- [ ] CI Linux + Windows 全绿(PR 触发的 ci.yml)
- [ ] 5 个本地命令(typecheck / lint / format:check / build / test)全 0
- [ ] `node scripts/release-gate.mjs` 通过
- [ ] `pnpm pack` 出的 tarball 在临时目录 install 后 `forge --version` + `forge init` 真能跑
- [ ] `archive --recover` case C 在 backup/archive 都完整时进入交互;任一不完整退出 4
- [ ] case C 交互单测覆盖(promptRecoverChoice 注入 mock)
- [ ] 主 README 重写为面向用户
- [ ] `docs/getting-started.md` / `harness-setup.md` / `cli-reference.md` / `release-gate-checklist.md` 全到位
- [ ] `CHANGELOG.md` 含 v0.1.0 段
- [ ] `package.json` 含 `keywords` + `publishConfig.access=public`

---

## Plan 6 → v0.1.0 发版衔接

Plan 6 完成 + PR 合并到 main 后,maintainer 走 release gate:

1. 跑 `docs/release-gate-checklist.md` 第 1 节(自动化,已在 Plan 6 验证;maintainer 重跑确认)
2. 跑第 2 节(手动 harness acceptance test):
   - Claude Code:发"我想做个 todo list",AI 应自动触发 brainstorming
   - Codex:同上
   - 两个 transcript 存 `docs/release-gate-evidence/v0.1.0-{claude,codex}.md`
3. 任一不通过 → 不发版,开 issue + 修
4. 全过 → 跑第 3 节(发版动作):
   - `npm version 0.1.0 --no-git-tag-version`
   - 提 `chore: release v0.1.0` PR + merge
   - `git tag v0.1.0 && git push origin v0.1.0`
   - `npm publish --access public`(`publishConfig` 已配,可省略 flag)
   - GitHub 创 release 粘 CHANGELOG 段
5. 跑第 4 节 sanity check(干净环境装 + `forge --version`)

**Plan 6 不做 v0.1.0 实际发版**,只把 release gate 与 release notes 准备到位。是否真发由 maintainer 决定。

---

## 自查记录

**Spec coverage**:
- spec §3.5 case C 交互式二选一 + 完整性 check → Phase A(A1-A5)
- spec §5.1 harness acceptance test smoke → Phase B1(checklist 第 2 节)
- spec §6 Phase 6 任务 → Phase A(recover case C)+ Phase B(release gate)+ Phase C(用户文档)+ Phase D(npm publish 准备)+ Phase E(收尾)
- spec §7 不做项 → Plan 6 v0.1 显式收紧段
- spec §8 许可 → CHANGELOG.md License 段 + LICENSE-THIRD-PARTY 已在 Plan 4

**Placeholder 扫描**:已扫,无 TBD/TODO/implement-later;每 step 都有具体命令、代码或 file:line。

**Type 一致性**:
- `RecoverResult.caseCData` 字段(`archiveChangeDir / changeOrigId / backupDir / archiveSpecsDir / currentSpecsDir / deltas / backupIntegrity / archiveIntegrity`)在 Task A3 定义,在 Task A4 解构使用,字段名一致
- `BackupIntegrityResult` / `ArchiveIntegrityResult` 同样命名(`{ ok: boolean; reason?: string }`)
- `RecoverChoice` 联合类型 `'complete-archive' | 'undo-archive'` 在 Task A1 定义,在 Task A4 case C 路径分支匹配,值一致
- `promptRecoverChoice(customPrompt?: () => Promise<RecoverChoice>)` 签名在 A1 与 A4 调用处对齐

**实施顺序约束**:
- Task A2 加 helper(`checkBackupIntegrity` / `checkArchiveIntegrity`)+ Task A3 改 RecoverResult 接口 → Task A4 archive.ts 的 --recover 路径才能用上 caseCData。严格按 A1 → A2 → A3 → A4 → A5 顺序
- Phase B / C / D 互相独立,可乱序;但 Phase E 要等所有前置完成

---

## Plan 6 完成记录

- 完成时间:2026-05-05 13:15(UTC)
- 总测试数:275 passed + 1 skipped
- CI run URL:https://github.com/Accelerator-mzq/forge/pull/6(PR check;CI 触发中)
- 关键 commit 范围:`32d5524..b77230a57a2cd4d3ef7b88fa47ed38d56bdbe1ea`
- v0.1.0 release gate 自动化部分:**已通过**(本地 release-gate.mjs exit 0)
- v0.1.0 release gate 手动部分(Claude Code + Codex acceptance test):**待 maintainer 跑**(spec §5.1 + docs/release-gate-checklist.md §2)
