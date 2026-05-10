# Plan 8a — `forge migrate` Phase 1 Foundation 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:落地 `forge migrate` 公共骨架(types + LockMode 扩展 + sources 空 adapter + CLI 子命令);完成后 `forge migrate <source> --dry-run` 可调起,打印"not implemented",P2/P3 可并行接手。

**Architecture**:严格走 spec §1.2-§1.4 模块组织 + 接口契约 + CLI 形态;不实施任何实际逻辑(scan/classify/transform 等留给后续 phase);所有公共 type / 接口 / lock 扩展定型。

**Tech Stack**:Node 20+、TypeScript ESM、commander 12;无新依赖。

**Spec 引用**:[`2026-05-10-forge-migrate-design.md`](../specs/2026-05-10-forge-migrate-design.md) §1.2 模块组织、§1.3 MigrateSource 接口、§1.4 CLI 形态、§1.5 主流程伪码、§5.1 复用边界(LockMode 扩展不动文案)、§5.2 / §5.3 模块清单。

**前置**:Plan 1-6 完成;`src/core/archive/lock.ts` 现状已读(LockMode union 7 mode + LockHeldError 文案"another forge archive...")。

---

## File Structure(Plan 8a 完成时改动)

```
src/
├── cli/
│   ├── index.ts                          ← 改:注册 migrate 子命令(Task 1.8)
│   └── commands/
│       └── migrate.ts                    ← ★ NEW(Task 1.7):commander 骨架 + LockHeldError 友好 catch
└── core/
    ├── archive/
    │   └── lock.ts                       ← 改:LockMode union 加 'migrate'(Task 1.1,不动 LockHeldError 文案)
    └── migrate/                          ← ★ NEW
        ├── index.ts                      ← Task 1.6:runMigrate 空骨架
        ├── types.ts                      ← Task 1.2:MigrateSource 接口 + 全部 type
        └── sources/
            ├── index.ts                  ← Task 1.3:空 registry
            ├── openspec.ts               ← Task 1.4:空骨架
            └── superpowers.ts            ← Task 1.5:空骨架

tests/
└── core/archive/
    └── lock.test.ts                      ← 改(Task 1.1):加 'migrate' mode case
```

---

## Task 1.1:`LockMode` union 加 `'migrate'`(不改 LockHeldError 文案)

**Files:**
- Modify: `src/core/archive/lock.ts:9-16`(LockMode union)
- Modify: `tests/core/archive/lock.test.ts`(加 'migrate' mode case)

**Spec 引用**:§5.1 表格行 — "LockMode union 加 'migrate';**LockHeldError 文案保持现状**...migrate CLI catch 后输出友好文案"。**关键**:不动 LockHeldError 文案(line 29 字串"another forge archive..."),保兼容现有 `lock.test.ts:188` 与 `cli/archive.test.ts:516` 断言。

- [ ] **Step 1:写 fail test**

在 `tests/core/archive/lock.test.ts` 末尾加(参考现有 'archive' / 'recover' / 'legacy-bridge-*' 测试格式):

```ts
// tests/core/archive/lock.test.ts(末尾追加)
describe("acquireLockByPath - 'migrate' mode", () => {
  it("acquires migrate lock with custom file name", async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-lock-migrate-'));
    const release = await acquireLockByPath(tmp, 'migrate', 'migrate.lock');
    const lockPath = join(tmp, '.cache', 'migrate.lock');
    expect(existsSync(lockPath)).toBe(true);
    const data = JSON.parse(await readFile(lockPath, 'utf8'));
    expect(data.mode).toBe('migrate');
    await release();
    expect(existsSync(lockPath)).toBe(false);
    await rm(tmp, { recursive: true, force: true });
  });

  it("LockHeldError 文案保持兼容(不写 'operation',保留 'archive')", async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-lock-migrate-busy-'));
    const release = await acquireLockByPath(tmp, 'migrate', 'migrate.lock');
    await expect(
      acquireLockByPath(tmp, 'migrate', 'migrate.lock'),
    ).rejects.toThrow(/another forge archive is in progress.*mode migrate/);
    await release();
    await rm(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2:跑 test 验证 fail**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm test -- tests/core/archive/lock.test.ts -t "migrate mode"
```

预期:FAIL with `Type '"migrate"' is not assignable to parameter of type 'LockMode'`(TS 类型错误)。

- [ ] **Step 3:扩 LockMode union(只动 union,不动 Error 文案)**

`src/core/archive/lock.ts:9-16`:

```ts
// 决策 #23:扩展 mode union 支持 legacy-bridge 命令(C-2 / spec §2.6)
// migrate 命令 v0.4 加(Plan 8a Task 1.1):LockMode union 加 'migrate' 一项
// LockHeldError 文案不动(保兼容 lock.test.ts:188 / cli/archive.test.ts:516 断言);
// migrate CLI 入口 catch 后改输出友好文案(见 plan-8a Task 1.7)
export type LockMode =
  | 'archive'
  | 'recover'
  | 'legacy-bridge-map'
  | 'legacy-bridge-regenerate'
  | 'legacy-bridge-index'
  | 'legacy-bridge-resolve'
  | 'legacy-bridge-sync-check'
  | 'migrate';
```

- [ ] **Step 4:跑 test 验证 pass**

```bash
pnpm test -- tests/core/archive/lock.test.ts
```

预期:全 PASS,含新加 2 个 case;原有 'archive' / 'legacy-bridge-*' 测试不破。

- [ ] **Step 5:本地 verification**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
```

预期:全 0 error。

- [ ] **Step 6:commit**

```bash
git add src/core/archive/lock.ts tests/core/archive/lock.test.ts
git commit -m "$(cat <<'EOF'
feat(lock): migrate-1.1 加 'migrate' mode 到 LockMode union

LockMode union 加 'migrate' 第 8 个值;LockHeldError 文案不动(保兼容
现有 lock.test.ts:188 与 cli/archive.test.ts:516 断言)。
migrate CLI 入口将在 plan-8a Task 1.7 catch LockHeldError 后输出
友好文案(避免"用户以为 archive 命令占锁"的排障误导,spec §3.3 + B6)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.2:`src/core/migrate/types.ts` — MigrateSource 接口 + 全部 type

**Files:**
- Create: `src/core/migrate/types.ts`

**Spec 引用**:§1.3 接口契约;§2.2 落点表(active/archive/draft/skip);§3.4 trace v1 schema。

- [ ] **Step 1:创建文件 + ArtifactKind / DetectResult / ScanResult / ClassificationPlan / CopyOp / MigrateReport 全部 type**

```ts
// src/core/migrate/types.ts
// MigrateSource 接口 + 全部公共 type — Plan 8a Task 1.2
// 对应 spec §1.3 接口契约 / §2.2 落点表 / §3.4 trace schema

/** 源 artifact 种类(决定 transform 走哪条规则) */
export type ArtifactKind = 'spec' | 'proposal' | 'tasks' | 'design' | 'config' | 'draft';

/** 源类型 ID */
export type SourceId = 'openspec' | 'superpowers';

/** detect() 返回:源是否存在 + 源根路径 */
export interface DetectResult {
  found: boolean;
  /** 找到时:绝对路径(如 /abs/proj/openspec/) */
  rootPath?: string;
  /** found=false 时给 caller 的提示文本 */
  message?: string;
}

/** scan() 返回:原始产物清单(尚未分类) */
export interface ScanResult {
  /** 是否完全空 — runMigrate 会 exit 2 */
  isEmpty: boolean;
  /** 已发现的所有源文件(绝对路径) */
  files: ScannedFile[];
  /** 配对 / 不识别 / unsafe-slug 的 meta */
  pairings?: SuperpowersPairings;
}

export interface ScannedFile {
  /** 源绝对路径 */
  absPath: string;
  /** 相对源根的路径 */
  relPath: string;
  /** 推测 kind(初判;classify 阶段可改) */
  kind: ArtifactKind;
  /** 文件大小(byte;给 budget 用) */
  size: number;
  /** mtime ISO(给 archive-detect 弱信号 + report meta 用) */
  mtime: string;
  /** 编码探测(non-utf8 在 scan 阶段标 [skip:encoding-not-utf8]) */
  encoding?: 'utf8' | 'utf8-bom' | 'non-utf8';
}

/** superpowers 专属:配对 / unrecognized / unsafe-slug 列表 */
export interface SuperpowersPairings {
  paired: Array<{ slug: string; designPath?: string; planPath?: string }>;
  unrecognized: string[];
  unsafeSlug: string[];
}

/** classify() 输出:每个 PlannedChange/Spec/Draft 的归类结果 */
export interface ClassificationPlan {
  changes: PlannedChange[];
  specs: PlannedSpec[];
  drafts: PlannedDraft[];
  configFiles: PlannedConfig[];
  /** classify 阶段的 [unsafe-slug] / [ambiguous-slug] / [skip:read-fail] / [skip:encoding-not-utf8] 标记 */
  skipped: Array<{ source: string; reason: string }>;
}

export interface PlannedChange {
  slug: string;
  classification: 'active' | 'archive' | 'draft' | 'skip';
  /** classify 推测信号(report 显示) */
  classificationReason?: string;
  /** 关联的源文件(按 kind 索引) */
  artifacts: Partial<Record<ArtifactKind, ScannedFile>>;
  /** M13:archive 但缺件时 LLM 需补哪些 kind(--regenerate 用) */
  missingArtifacts?: ArtifactKind[];
}

export interface PlannedSpec {
  /** spec 的相对路径(如 'foo/spec.md') */
  relPath: string;
  source: ScannedFile;
}

export interface PlannedDraft {
  /** 目标 forge/drafts 下的文件名 */
  targetName: string;
  source: ScannedFile;
}

export interface PlannedConfig {
  source: ScannedFile;
  /** 'fresh' = forge/config.yaml 不存在;'imported' = 写到 .imported(可能再撞 .imported-N) */
  strategy: 'fresh' | 'imported';
  /** strategy='imported' 时分配的最终目标文件名(如 config.yaml.imported-2) */
  targetName: string;
}

/** prepareCopy() 输出:具体的 cp 操作 */
export interface CopyOp {
  /** 源绝对路径(若是从零生成,则 source 为 null) */
  source: string | null;
  /** 目标绝对路径 */
  target: string;
  kind: ArtifactKind;
  /** 关联的 PlannedChange.slug(若属于 change) */
  changeSlug?: string;
  /** 'imported--N' rename 历史(给 report 用) */
  renamedFrom?: string;
}

/** --regenerate 时枚举每个 change 缺哪些件 */
export interface MissingArtifact {
  changeSlug: string;
  kind: 'proposal' | 'specs';
  /** 期望目标路径(如 forge/changes/<slug>/proposal.md 或 forge/changes/<slug>/specs/<area>.md) */
  targetPath: string;
  /** facts 来源策略(M15 v3 目标分桶) */
  factsSource: 'design' | 'tasks' | 'self';
}

/** classify() 上下文(传给 source.classify 的 ctx) */
export interface ClassifyCtx {
  cwd: string;
  /** 用户传入的 --archive-list 文件路径(若有) */
  archiveListPath?: string;
  /** 是否在 git 仓库内(影响 archive-detect 信号 2) */
  inGitRepo: boolean;
}

/** runMigrate() 选项 */
export interface MigrateOptions {
  source: SourceId;
  noRegenerate?: boolean;
  dryRun?: boolean;
  force?: boolean;
  archiveList?: string;
  noInteractive?: boolean;
  redactRules?: string;
}

/** MigrateSource 接口契约(spec §1.3) */
export interface MigrateSource {
  readonly id: SourceId;
  detect(cwd: string): Promise<DetectResult>;
  scan(rootPath: string): Promise<ScanResult>;
  classify(scan: ScanResult, ctx: ClassifyCtx): Promise<ClassificationPlan>;
  prepareCopy(plan: ClassificationPlan, target: string): CopyOp[];
  /** markdown-aware transformer(走 markdown-aware.ts walker) */
  transform(content: string, kind: ArtifactKind): string;
  /** --regenerate 时枚举缺件 */
  listMissingArtifacts(plan: ClassificationPlan): MissingArtifact[];
}

/** trace.json v1 schema(spec §3.4) */
export interface MigrateTrace {
  version: 1;
  source: SourceId;
  sourceRoot: string;
  ts: string;
  ackToken?: string;
  ops: TraceOp[];
  conflicts: Array<{ target: string; rename: string }>;
  downgrades: Array<{ change: string; from: string; to: string; reason: string }>;
  cleanupHint: string;
}

export interface TraceOp {
  from: string | null;
  to: string;
  kind: ArtifactKind;
  transform: string[];
  /** 'ok' | 'needs-fix: <msg>' | 'skip:<reason>' */
  validate: string;
  regen: { model: string; facts: number; passed: number; threshold: number } | null;
  writtenAt: string;
  /** journal 状态机(M14 v4 三步走 + crash 恢复) */
  status?: 'pending' | 'committed';
}
```

- [ ] **Step 2:跑 typecheck**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm typecheck
```

预期:0 error(types.ts 是纯接口,不引用其他模块)。

- [ ] **Step 3:跑 format:check + lint**

```bash
pnpm format:check
pnpm lint
```

预期:0 error。若 prettier 调整了缩进,`pnpm format` 后再 commit。

- [ ] **Step 4:commit**

```bash
git add src/core/migrate/types.ts
git commit -m "$(cat <<'EOF'
feat(migrate): migrate-1.2 创建 src/core/migrate/types.ts

MigrateSource 接口 + 全部公共 type:
- ArtifactKind / SourceId / DetectResult / ScanResult / ScannedFile
- SuperpowersPairings / ClassificationPlan / PlannedChange/Spec/Draft/Config
- CopyOp / MissingArtifact / ClassifyCtx / MigrateOptions
- MigrateTrace / TraceOp(journal v1 schema + 状态机 status)

对应 spec §1.3 接口契约 + §2.2 落点表 + §3.4 trace schema。
P1 阶段只定型不实施;P2/P3/P4/P5 各 phase 实施对应字段。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.3:`src/core/migrate/sources/index.ts` 空 registry

**Files:**
- Create: `src/core/migrate/sources/index.ts`

- [ ] **Step 1:写 registry**

```ts
// src/core/migrate/sources/index.ts
// source registry — Plan 8a Task 1.3
// P2 在 openspec.ts 实施后注册 OpenSpecSource;P3 同理 SuperpowersSource

import type { MigrateSource, SourceId } from '../types.js';
import { OpenSpecSource } from './openspec.js';
import { SuperpowersSource } from './superpowers.js';

export const SOURCES: Record<SourceId, MigrateSource> = {
  openspec: new OpenSpecSource(),
  superpowers: new SuperpowersSource(),
};

export function getSource(id: SourceId): MigrateSource {
  const s = SOURCES[id];
  if (!s) {
    throw new Error(`unknown migrate source id: ${id}`);
  }
  return s;
}
```

- [ ] **Step 2:typecheck(预期 fail — openspec.ts / superpowers.ts 还没建)**

```bash
pnpm typecheck
```

预期:FAIL `Cannot find module './openspec.js'` — Task 1.4/1.5 解决。

- [ ] **Step 3:commit(typecheck 失败但 file 已加;后续 task 解)**

```bash
git add src/core/migrate/sources/index.ts
git commit -m "$(cat <<'EOF'
feat(migrate): migrate-1.3 加 sources/index.ts 空 registry

registry 引用 OpenSpecSource / SuperpowersSource;两个 class 在 Task 1.4/1.5 落地空骨架。
本 commit 后 typecheck 暂时 FAIL,Task 1.4/1.5 修复。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.4:`src/core/migrate/sources/openspec.ts` 空骨架

**Files:**
- Create: `src/core/migrate/sources/openspec.ts`

**Spec 引用**:§1.3 接口契约 + §2.1 目录映射(P2 落实);本 task 只实施空骨架。

- [ ] **Step 1:写空骨架**

```ts
// src/core/migrate/sources/openspec.ts
// OpenSpecSource 空骨架 — Plan 8a Task 1.4
// 实际 scan/classify/transform/listMissingArtifacts 由 plan-8b(Phase 2)落实

import type {
  MigrateSource,
  DetectResult,
  ScanResult,
  ClassificationPlan,
  ClassifyCtx,
  CopyOp,
  ArtifactKind,
  MissingArtifact,
} from '../types.js';

export class OpenSpecSource implements MigrateSource {
  readonly id = 'openspec' as const;

  async detect(_cwd: string): Promise<DetectResult> {
    throw new Error('OpenSpecSource.detect not implemented (plan-8b)');
  }

  async scan(_rootPath: string): Promise<ScanResult> {
    throw new Error('OpenSpecSource.scan not implemented (plan-8b)');
  }

  async classify(_scan: ScanResult, _ctx: ClassifyCtx): Promise<ClassificationPlan> {
    throw new Error('OpenSpecSource.classify not implemented (plan-8b)');
  }

  prepareCopy(_plan: ClassificationPlan, _target: string): CopyOp[] {
    throw new Error('OpenSpecSource.prepareCopy not implemented (plan-8b)');
  }

  transform(content: string, _kind: ArtifactKind): string {
    // P2 实施 markdown-aware transformer;本骨架原样返回
    return content;
  }

  listMissingArtifacts(_plan: ClassificationPlan): MissingArtifact[] {
    return []; // OpenSpec 缺件少;P2 / P5 细化
  }
}
```

- [ ] **Step 2:typecheck**

```bash
pnpm typecheck
```

预期:仍 FAIL — superpowers.ts 还没建(Task 1.5 解);openspec.ts 本身 typecheck 通过。

- [ ] **Step 3:commit**

```bash
git add src/core/migrate/sources/openspec.ts
git commit -m "$(cat <<'EOF'
feat(migrate): migrate-1.4 OpenSpecSource 空骨架

实现 MigrateSource 接口的所有方法,内部抛 'not implemented (plan-8b)'。
transform 原样返回 content(P2 接 markdown-aware walker)。
listMissingArtifacts 返空数组(P2 / P5 细化)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.5:`src/core/migrate/sources/superpowers.ts` 空骨架

**Files:**
- Create: `src/core/migrate/sources/superpowers.ts`

- [ ] **Step 1:写空骨架(同 Task 1.4 结构,id 'superpowers')**

```ts
// src/core/migrate/sources/superpowers.ts
// SuperpowersSource 空骨架 — Plan 8a Task 1.5
// 实际 scan/classify/transform/listMissingArtifacts 由 plan-8c(Phase 3)落实

import type {
  MigrateSource,
  DetectResult,
  ScanResult,
  ClassificationPlan,
  ClassifyCtx,
  CopyOp,
  ArtifactKind,
  MissingArtifact,
} from '../types.js';

export class SuperpowersSource implements MigrateSource {
  readonly id = 'superpowers' as const;

  async detect(_cwd: string): Promise<DetectResult> {
    throw new Error('SuperpowersSource.detect not implemented (plan-8c)');
  }

  async scan(_rootPath: string): Promise<ScanResult> {
    throw new Error('SuperpowersSource.scan not implemented (plan-8c)');
  }

  async classify(_scan: ScanResult, _ctx: ClassifyCtx): Promise<ClassificationPlan> {
    throw new Error('SuperpowersSource.classify not implemented (plan-8c)');
  }

  prepareCopy(_plan: ClassificationPlan, _target: string): CopyOp[] {
    throw new Error('SuperpowersSource.prepareCopy not implemented (plan-8c)');
  }

  transform(content: string, _kind: ArtifactKind): string {
    return content;
  }

  listMissingArtifacts(_plan: ClassificationPlan): MissingArtifact[] {
    return [];
  }
}
```

- [ ] **Step 2:typecheck — 现在应该全过**

```bash
pnpm typecheck
```

预期:0 error(sources/index.ts + openspec.ts + superpowers.ts 三件齐全)。

- [ ] **Step 3:commit**

```bash
git add src/core/migrate/sources/superpowers.ts
git commit -m "$(cat <<'EOF'
feat(migrate): migrate-1.5 SuperpowersSource 空骨架

完整实现 MigrateSource 接口骨架;sources/index.ts 现在 typecheck 通过。
P3(plan-8c)落实 detect/scan/classify/prepareCopy/transform 真实逻辑。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.6:`src/core/migrate/index.ts` runMigrate 空骨架

**Files:**
- Create: `src/core/migrate/index.ts`

**Spec 引用**:§1.5 主流程伪码(完整版,含 v4 cp 三步走 + missingPreview 早算 + dry-run 前置 + SIGINT process.once)。本 task 实施流程**框架**(detect/scan/classify/printPlan;cp/regen 留 throw "not implemented")。

- [ ] **Step 1:实施 runMigrate 框架**

```ts
// src/core/migrate/index.ts
// runMigrate 主流程 — Plan 8a Task 1.6(框架)+ 后续 phase 填实
// 对应 spec §1.5 主流程伪码 v4

import { acquireLockByPath, LockHeldError } from '../archive/lock.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getSource } from './sources/index.js';
import type { MigrateOptions, ClassifyCtx } from './types.js';

export { getSource };
export type { MigrateOptions, MigrateSource, SourceId } from './types.js';

/** runMigrate 主流程编排 */
export async function runMigrate(opts: MigrateOptions): Promise<number> {
  const cwd = process.cwd();
  const source = getSource(opts.source);

  // P1 阶段:detect 调真;后续阶段填实
  const detect = await source.detect(cwd).catch((err) => {
    return { found: false, message: (err as Error).message } as const;
  });

  if (!detect.found) {
    console.error(`source <${opts.source}> not found: ${detect.message ?? 'unknown reason'}`);
    return 2;
  }

  // ensureForgeBootstrap — 此前不存在 forge/ 时建最小 .cache(spec §1.5)
  await ensureForgeBootstrap(cwd);

  let release: (() => Promise<void>) | undefined;
  const sigintHandler = () => {
    console.error('\n[migrate] SIGINT received; rolling back...');
    process.exit(130);
  };
  process.once('SIGINT', sigintHandler);

  try {
    release = await acquireLockByPath(join(cwd, 'forge'), 'migrate', 'migrate.lock');

    const ctx: ClassifyCtx = {
      cwd,
      archiveListPath: opts.archiveList,
      inGitRepo: false, // P3 实施 git 探测
    };

    // P2/P3 实施真实 scan/classify
    const scan = await source.scan(detect.rootPath!);
    const plan = await source.classify(scan, ctx);

    if (opts.dryRun) {
      console.log('[migrate] dry-run: not implemented yet (plan-8d report.printPlan)');
      console.log(`[migrate] source=${source.id}, scanned ${scan.files.length} files`);
      return 0;
    }

    // P4 / P5 实施 conflict / cp / regenerate / report
    throw new Error('runMigrate copy / regenerate path not implemented (plan-8d / plan-8e)');
  } catch (err) {
    if (err instanceof LockHeldError) {
      // P1 Task 1.7 在 CLI 入口提供友好文案;此处再次兜底友好化(spec §3.3 v4)
      console.error(
        `forge migrate is blocked by lock: pid ${err.holder.pid}, mode ${err.holder.mode}, started ${err.holder.started_at}`,
      );
      return 1;
    }
    throw err;
  } finally {
    process.off('SIGINT', sigintHandler); // v4 修订:防 listener 累积(codex C2)
    if (release) await release();
  }
}

async function ensureForgeBootstrap(cwd: string): Promise<void> {
  await mkdir(join(cwd, 'forge', '.cache'), { recursive: true });
  await mkdir(join(cwd, 'forge', '.forge-trash'), { recursive: true });
  await mkdir(join(cwd, 'forge', '.forge-ack'), { recursive: true });
}
```

- [ ] **Step 2:typecheck**

```bash
pnpm typecheck
```

预期:0 error。

- [ ] **Step 3:commit**

```bash
git add src/core/migrate/index.ts
git commit -m "$(cat <<'EOF'
feat(migrate): migrate-1.6 runMigrate 主流程框架

实施 detect / acquireLock / SIGINT once handler / ensureForgeBootstrap;
copy / regenerate 路径 throw 'not implemented' 留 plan-8d / plan-8e 填实。

LockHeldError catch 后输出友好文案"forge migrate is blocked by lock: ...",
避免用户以为 archive 命令占锁(spec §3.3 v4 + codex B6)。
SIGINT 用 process.once 注册,finally process.off 清理(spec §3.3 + codex C2)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.7:`src/cli/commands/migrate.ts` commander 子命令骨架

**Files:**
- Create: `src/cli/commands/migrate.ts`

**Spec 引用**:§1.4 CLI 形态(8 个选项)+ §3.3 LockHeldError 友好 catch。

- [ ] **Step 1:实施 commander 骨架**

```ts
// src/cli/commands/migrate.ts
// forge migrate <source> 子命令 — Plan 8a Task 1.7
// 对应 spec §1.4 CLI 形态(8 个选项)+ §3.3 LockHeldError 友好 catch

import { Command } from 'commander';
import { runMigrate } from '../../core/migrate/index.js';
import type { SourceId } from '../../core/migrate/types.js';

export function buildMigrateCommand(): Command {
  return new Command('migrate')
    .description('搬运已有 OpenSpec / superpowers 项目仓库到 forge 工作目录')
    .argument('<source>', "源类型:'openspec' 或 'superpowers'(必填,不自动猜)")
    .option('--no-regenerate', '不调 LLM 补缺件;失败件标 [needs-fix],不阻塞 cp')
    .option('--dry-run', '只扫描 + 出 plan + 输出报告,不写 forge/')
    .option('--force', '冲突时旧目标 mv 到 forge/.forge-trash/<ts>/(留 24h 兜底)再覆盖')
    .option('--archive-list <file>', '显式指定哪些 slug 进 archive,跳过自动推测')
    .option('--no-interactive', '跳过 active/archive 交互确认表,全用推测默认值')
    .option('--redact-rules <file>', '--regenerate 时附加自定义 redact 规则')
    .action(
      async (
        source: string,
        opts: {
          regenerate?: boolean; // commander --no-regenerate flag 反向
          dryRun?: boolean;
          force?: boolean;
          archiveList?: string;
          interactive?: boolean; // commander --no-interactive flag 反向
          redactRules?: string;
        },
      ) => {
        // 校验 source argument
        if (source !== 'openspec' && source !== 'superpowers') {
          console.error(`error: <source> must be 'openspec' or 'superpowers', got '${source}'`);
          process.exit(2);
        }

        const exitCode = await runMigrate({
          source: source as SourceId,
          noRegenerate: opts.regenerate === false,
          dryRun: opts.dryRun ?? false,
          force: opts.force ?? false,
          archiveList: opts.archiveList,
          noInteractive: opts.interactive === false,
          redactRules: opts.redactRules,
        });

        process.exit(exitCode);
      },
    );
}
```

- [ ] **Step 2:typecheck**

```bash
pnpm typecheck
```

预期:0 error。

- [ ] **Step 3:commit**

```bash
git add src/cli/commands/migrate.ts
git commit -m "$(cat <<'EOF'
feat(migrate): migrate-1.7 CLI 子命令 forge migrate <source>

commander 骨架,8 个选项 wireup(--no-regenerate / --dry-run / --force / 
--archive-list / --no-interactive / --redact-rules);source argument 校验
'openspec' | 'superpowers',否则 exit 2。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.8:注册 migrate 子命令 + 公开 runMigrate + P1 完成 verification

**Files:**
- Modify: `src/cli/index.ts`(注册子命令)
- Modify: `src/index.ts`(公开 runMigrate,若该文件存在;否则跳过)

**Spec 引用**:§5.3 改动模块清单。

- [ ] **Step 1:在 src/cli/index.ts 注册 migrate 子命令**

读 src/cli/index.ts 现状(找到 program.addCommand 调用聚集处),加一行:

```ts
// src/cli/index.ts(片段示意,实际位置在 program.addCommand 段)
import { buildMigrateCommand } from './commands/migrate.js';
// ...
program.addCommand(buildMigrateCommand());
```

- [ ] **Step 2:src/index.ts 公开 runMigrate(若该文件已 re-export 其他 CLI 入口)**

```ts
// src/index.ts(片段)
export { runMigrate } from './core/migrate/index.js';
```

如果 src/index.ts 不存在或 re-export 模式不一致,跳过此 step;CLI 路径已通。

- [ ] **Step 3:跑 build + typecheck**

```bash
pnpm build
pnpm typecheck
```

预期:全 0 error;dist/cli/commands/migrate.js 已出。

- [ ] **Step 4:dry-run 手测命令存在**

```bash
node dist/cli/index.js migrate --help
```

预期 stdout 含:

```
Usage: forge migrate [options] <source>

搬运已有 OpenSpec / superpowers 项目仓库到 forge 工作目录

Arguments:
  source                  源类型:'openspec' 或 'superpowers'(必填,不自动猜)

Options:
  --no-regenerate         不调 LLM 补缺件;失败件标 [needs-fix],不阻塞 cp
  --dry-run               只扫描 + 出 plan + 输出报告,不写 forge/
  ...
```

- [ ] **Step 5:跑全量 verification(P1 完成里程碑)**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

预期:全 0 error;tests 全 PASS(原有 + 新加 lock 'migrate' mode case)。

- [ ] **Step 6:commit**

```bash
git add src/cli/index.ts src/index.ts
git commit -m "$(cat <<'EOF'
feat(cli): migrate-1.8 注册 migrate 子命令 + 公开 runMigrate

P1(Plan 8a)完成:forge migrate <source> --dry-run / --help 可调起,
打印 'not implemented yet'(P2/P3/P4/P5 落实真实逻辑)。
公共 type / MigrateSource 接口 / LockMode 扩展 / SIGINT once 全到位。

里程碑 M1:CLI 命令存在,后续 phase 可并行接手 P2/P3。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7:推 branch(可选,若按 release 节奏)**

```bash
git status
git log --oneline -10
```

观察:8 个 commit(migrate-1.1 ~ 1.8)在当前 branch;不强制 push,P2/P3/P4/P5 在同 branch 继续。

---

## Plan 8a Self-Review

完成 Task 1.1-1.8 后,跑这个清单:

- [ ] LockMode union 含 'migrate' 第 8 个值;`grep -n "'migrate'" src/core/archive/lock.ts` 找到一处
- [ ] `lock.test.ts:188` 旧断言"another forge archive..."仍 PASS
- [ ] `cli/archive.test.ts:516` 旧断言仍 PASS
- [ ] `tests/core/archive/lock.test.ts` 新加 2 个 'migrate' mode case 全 PASS
- [ ] `src/core/migrate/types.ts` 含 12+ export type / interface(MigrateSource / DetectResult / ScanResult / ClassificationPlan / CopyOp / MissingArtifact / MigrateOptions / MigrateTrace / TraceOp 等)
- [ ] `src/core/migrate/sources/{index,openspec,superpowers}.ts` 三件齐;sources/index.ts 不抛 import error
- [ ] `src/core/migrate/index.ts` 含 runMigrate;ensureForgeBootstrap;process.once SIGINT;LockHeldError 友好 catch
- [ ] `src/cli/commands/migrate.ts` 含 buildMigrateCommand;8 个 option 全 wire
- [ ] `node dist/cli/index.js migrate --help` 打印正确
- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` 全 0
- [ ] git log 显示 8 个 commit(1.1~1.8 顺序)

发现 gap:回到对应 task 补 step,再 commit。

---

**P1 完成**。下一步:并行执行 P2(plan-8b OpenSpecSource)+ P3(plan-8c SuperpowersSource);两者基于本 P1 type / 接口契约,互不依赖。

P4-P7 子 plan 文件待生成(执行选择见 master plan §0)。
