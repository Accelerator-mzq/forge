# legacy-bridge 双路径执行模型(Spec A)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 legacy-bridge 的四个 LLM 命令(map/index/regenerate/sync-check)建「默认 agent / `--api`」双路径执行模型,让 agent 路径走会话额度、不耗 API key。

**Architecture:** 每个 LLM 步骤重构成 typed `LlmTask`。`AgentHandoffRunner`(默认)把当前轮的 `LlmTask[]` 包进 `TaskManifest` 信封写盘后退出,agent fulfill 后跑 `<op> --apply` 校验 + 确定性后处理;`ApiRunner`(`--api`)在进程内调 Anthropic SDK 走同一后处理。确定性后处理从 LLM 步骤剥离,两路径共用。

**Tech Stack:** TypeScript(Node ≥ 20.19)、commander、vitest、`@anthropic-ai/sdk`、`node:crypto`(SHA256)。包管理器 pnpm。

**前置 spec:** [`docs/specs/2026-05-18-legacy-bridge-dual-path-exec-design.md`](../specs/2026-05-18-legacy-bridge-dual-path-exec-design.md)(经 5 轮 Codex 对抗性审查收敛)。

---

## Phase 0:文件结构总览

**新建:**

| 文件 | 职责 |
|---|---|
| `src/core/legacy-bridge/llm-task.ts` | `LlmTask` / `TaskManifest` 类型 + `canonicalize` + `computeManifestHash` + `buildManifest` / `verifyManifest` + manifest 读写 |
| `src/core/legacy-bridge/runners.ts` | `ApiRunner`(`--api` SDK 调用)+ `AgentHandoffRunner`(默认,emit manifest)+ `readTaskResults`(读 agent 产物) |
| `skills/legacy-bridge-fulfillment/SKILL.md` | agent-driver 契约 + 反偷懒约束 |

**修改:**

| 文件 | 改动 |
|---|---|
| `src/core/legacy-bridge/mapper.ts` | 剥出 `buildMapTask` / `applyMapResult`;LLM 步骤产 `LlmTask` |
| `src/core/legacy-bridge/indexer.ts` | 剥出 `buildIndexTask` / `applyIndexResult` |
| `src/core/legacy-bridge/sync-check.ts` | 剥出 `buildSyncCheckTask` / `applySyncCheckResult`;redact 扩到 `changeContext`;`produced_from` |
| `src/core/legacy-bridge/regenerator.ts` | 剥出 `buildRegenerateRound1Tasks` / `applyRound1AndBuildRound2` / `applyRound2`;2 轮流 |
| `src/core/legacy-bridge/quality-judge.ts` | 抽出 `computeQualityResult` 纯函数(`judgeAllFacts` 复用);`stratifiedSample` / `SamplingOutput` 维持 export |
| `src/cli/commands/legacy-bridge.ts` | 四子命令加 `--apply` / `--api`;manifest 接线;默认翻转 agent |
| `src/cli/commands/archive.ts` | sync-check 改 emit manifest;加 `--api` / `--resume`;暂停态文件 |
| `commands/archive.md` | sync-check manifest 编排步 |
| `docs/legacy-bridge.md` | 文档化双路径 + 标 breaking |
| `CHANGELOG.md` | breaking note |

> **关于 Tier2/3 archive skill**:spec §4/§8 提到「Tier2/3 archive skill(改)」,但 `forge-repo/skills/` 下**不存在** archive skill —— archive 对所有 tier 是 `commands/archive.md`(slash)+ `forge archive` CLI。Tier2/3 的 sync-check manifest 编排由 Task 7.1 的 `legacy-bridge-fulfillment` skill(tier-agnostic,description 覆盖 `forge archive` emit manifest 场景)+ CLI 的 halt/resume stdout 提示承载,无需独立 archive skill。

**测试目录:** `tests/core/legacy-bridge/`、`tests/cli/legacy-bridge/`(均已存在,沿用 fixture 模式)。

每个 Phase 末尾跑 `pnpm typecheck && pnpm test`;改 `commands/` 或 `skills/` 的 Phase 末尾额外跑 `pnpm build`(双源 md5 sync,见仓库 `CLAUDE.md` 约束 1)。

---

## Phase 1:Foundation —— `LlmTask` + `TaskManifest` + runners

### Task 1.1:`LlmTask` / `TaskManifest` 类型与 canonical hash

**Files:**
- Create: `src/core/legacy-bridge/llm-task.ts`
- Test: `tests/core/legacy-bridge/llm-task.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/legacy-bridge/llm-task.test.ts
import { describe, it, expect } from 'vitest';
import { canonicalize, computeManifestHash, buildManifest, verifyManifest } from '../../../src/core/legacy-bridge/llm-task.js';
import type { LlmTask } from '../../../src/core/legacy-bridge/llm-task.js';

const sampleTask: LlmTask = {
  op: 'map',
  inputs: [{ source: 'docs/SRS.md', content: 'redacted preview' }],
  prompt: 'classify this',
  model: 'claude-sonnet-4-6',
  outputSchema: '{ classifications: [...] }',
  outputPath: 'forge/.cache/legacy-bridge-result-map.json',
};

describe('canonicalize', () => {
  it('键序无关:不同插入顺序产同一字符串', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });
});

describe('computeManifestHash + verifyManifest', () => {
  it('buildManifest 产物能自校验通过', () => {
    const m = buildManifest({ op: 'map', round: 1, tasks: [sampleTask], forgeVersion: '1.4.0' });
    expect(verifyManifest(m)).toEqual({ ok: true });
  });

  it('篡改 meta.gate_context 后 verifyManifest 失败', () => {
    const m = buildManifest({ op: 'sync-check', round: 1, tasks: [sampleTask], forgeVersion: '1.4.0', meta: { gate_context: 'archive-preflight' } });
    const tampered = { ...m, meta: { gate_context: 'standalone' } };
    expect(verifyManifest(tampered).ok).toBe(false);
  });

  it('篡改 round 后 verifyManifest 失败', () => {
    const m = buildManifest({ op: 'regenerate', round: 1, tasks: [sampleTask], forgeVersion: '1.4.0' });
    expect(verifyManifest({ ...m, round: 2 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/llm-task.test.ts`
Expected: FAIL —— `Cannot find module '.../llm-task.js'`

- [ ] **Step 3: 写实现**

```ts
// src/core/legacy-bridge/llm-task.ts
// 双路径执行模型核心:LlmTask + TaskManifest 信封 + canonical hash
import { createHash } from 'node:crypto';

/** 可走双路径的 LLM 操作类型 */
export type LlmOp = 'map' | 'index' | 'regenerate' | 'extract-facts' | 'quality-judge' | 'sync-check';

/** 一条已 redact 的输入 */
export interface LlmTaskInput {
  source: string; // 输入来源标识(文件路径 / anchor path / 'change-context')
  content: string; // 已 redact 的内容
}

/** 一个待执行的 LLM 任务(O 仅作输出类型标记,运行时不用) */
export interface LlmTask<O = unknown> {
  op: LlmOp;
  inputs: LlmTaskInput[];
  prompt: string;
  model: string; // 建议模型;agent 模式仅参考
  outputSchema: string; // 输出 JSON schema 描述,供 agent 自校验
  outputPath: string; // agent 把结果写到哪
  __outputType?: O;
}

/** agent 路径的交接信封 */
export interface TaskManifest {
  forge_version: string;
  op: LlmOp;
  round: number; // 当前轮次(单轮命令恒为 1;regenerate 为 1 或 2)
  tasks: LlmTask[];
  meta?: Record<string, unknown>; // op 专属上下文(如 sync-check 的 gate_context)
  manifest_hash: string; // SHA256,覆盖本结构除 manifest_hash 外全部字段
}

/** JCS 式稳定序列化:递归按键名排序后 JSON.stringify(数组保序) */
export function canonicalize(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = norm((v as Record<string, unknown>)[k]);
      }
      return sorted;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

/** 算 manifest_hash:覆盖除 manifest_hash 外的全部字段 */
export function computeManifestHash(m: Omit<TaskManifest, 'manifest_hash'>): string {
  return createHash('sha256').update(canonicalize(m), 'utf8').digest('hex');
}

/** 组装 manifest 并填好 manifest_hash */
export function buildManifest(args: {
  op: LlmOp;
  round: number;
  tasks: LlmTask[];
  forgeVersion: string;
  meta?: Record<string, unknown>;
}): TaskManifest {
  const base: Omit<TaskManifest, 'manifest_hash'> = {
    forge_version: args.forgeVersion,
    op: args.op,
    round: args.round,
    tasks: args.tasks,
    ...(args.meta ? { meta: args.meta } : {}),
  };
  return { ...base, manifest_hash: computeManifestHash(base) };
}

/** 重算并比对 manifest_hash;任一字段被篡改即失败 */
export function verifyManifest(m: TaskManifest): { ok: true } | { ok: false; reason: string } {
  const { manifest_hash, ...rest } = m;
  const expected = computeManifestHash(rest);
  if (expected !== manifest_hash) {
    return { ok: false, reason: `manifest_hash 不匹配(可能被篡改或跨版本):期望 ${expected.slice(0, 12)}…,实得 ${manifest_hash.slice(0, 12)}…` };
  }
  return { ok: true };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/llm-task.test.ts`
Expected: PASS(4 个用例)

- [ ] **Step 5: 提交**

```bash
git add src/core/legacy-bridge/llm-task.ts tests/core/legacy-bridge/llm-task.test.ts
git commit -m "feat(legacy-bridge): 加 LlmTask/TaskManifest 类型与 canonical hash"
```

### Task 1.2:manifest 读写 + 防漂移校验

**Files:**
- Modify: `src/core/legacy-bridge/llm-task.ts`(追加)
- Test: `tests/core/legacy-bridge/llm-task-io.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/legacy-bridge/llm-task-io.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManifest, writeManifest, readManifest, manifestPath } from '../../../src/core/legacy-bridge/llm-task.js';
import type { LlmTask } from '../../../src/core/legacy-bridge/llm-task.js';

const task: LlmTask = { op: 'map', inputs: [], prompt: 'p', model: 'm', outputSchema: 's', outputPath: 'o' };

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'lb-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('writeManifest / readManifest', () => {
  it('写后读回 manifest,verify 通过', async () => {
    const m = buildManifest({ op: 'map', round: 1, tasks: [task], forgeVersion: '1.4.0' });
    await writeManifest(dir, m);
    const back = await readManifest(dir, 'map');
    expect(back).not.toBeNull();
    expect(back!.manifest_hash).toBe(m.manifest_hash);
  });

  it('磁盘上被篡改 → readManifest 抛带「篡改」字样的错', async () => {
    const m = buildManifest({ op: 'map', round: 1, tasks: [task], forgeVersion: '1.4.0' });
    await writeManifest(dir, m);
    const raw = JSON.parse(await readFile(manifestPath(dir, 'map'), 'utf8'));
    raw.round = 99; // 篡改但不重算 hash
    await writeFile(manifestPath(dir, 'map'), JSON.stringify(raw), 'utf8');
    await expect(readManifest(dir, 'map')).rejects.toThrow(/篡改|不匹配/);
  });

  it('manifest 不存在 → readManifest 返回 null', async () => {
    expect(await readManifest(dir, 'index')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/llm-task-io.test.ts`
Expected: FAIL —— `writeManifest is not a function`

- [ ] **Step 3: 追加实现到 `llm-task.ts`**

```ts
// ── 追加到 src/core/legacy-bridge/llm-task.ts 末尾 ──
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** manifest 文件路径:forge/.cache/legacy-bridge-task-<op>.json */
export function manifestPath(forgeRoot: string, op: LlmOp): string {
  return join(forgeRoot, '.cache', `legacy-bridge-task-${op}.json`);
}

/** 写 manifest(创建 .cache 目录) */
export async function writeManifest(forgeRoot: string, m: TaskManifest): Promise<void> {
  await mkdir(join(forgeRoot, '.cache'), { recursive: true });
  await writeFile(manifestPath(forgeRoot, m.op), JSON.stringify(m, null, 2), 'utf8');
}

/** 读 manifest;不存在返回 null;hash 校验失败抛错 */
export async function readManifest(forgeRoot: string, op: LlmOp): Promise<TaskManifest | null> {
  const p = manifestPath(forgeRoot, op);
  if (!existsSync(p)) return null;
  const m = JSON.parse(await readFile(p, 'utf8')) as TaskManifest;
  const v = verifyManifest(m);
  if (!v.ok) throw new Error(`manifest ${p} 校验失败:${v.reason}`);
  return m;
}

/** 消费(移除)manifest —— --apply 成功后调用 */
export async function consumeManifest(forgeRoot: string, op: LlmOp): Promise<void> {
  await rm(manifestPath(forgeRoot, op), { force: true });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/llm-task-io.test.ts`
Expected: PASS(3 个用例)

- [ ] **Step 5: 提交**

```bash
git add src/core/legacy-bridge/llm-task.ts tests/core/legacy-bridge/llm-task-io.test.ts
git commit -m "feat(legacy-bridge): 加 manifest 读写 + 防漂移校验"
```

### Task 1.3:`ApiRunner` / `AgentHandoffRunner` 与 agent 结果读取

**Files:**
- Create: `src/core/legacy-bridge/runners.ts`
- Test: `tests/core/legacy-bridge/runners.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/legacy-bridge/runners.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiRunner, AgentHandoffRunner, readTaskResults } from '../../../src/core/legacy-bridge/runners.js';
import type { LlmTask } from '../../../src/core/legacy-bridge/llm-task.js';

const task: LlmTask = {
  op: 'map', inputs: [], prompt: 'p', model: 'claude-sonnet-4-6',
  outputSchema: 's', outputPath: 'forge/.cache/legacy-bridge-result-map.json',
};

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'lb-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('ApiRunner', () => {
  it('对每个 task 调一次 client,返回各自的文本结果', async () => {
    const calls: string[] = [];
    const fakeClient = {
      messages: {
        create: async (args: { messages: { content: string }[] }) => {
          calls.push(args.messages[0]!.content);
          return { content: [{ type: 'text', text: 'RESULT' }] };
        },
      },
    };
    const runner = new ApiRunner(fakeClient as never);
    const results = await runner.run([task]);
    expect(calls).toEqual(['p']);
    expect(results).toEqual([{ op: 'map', text: 'RESULT' }]);
  });
});

describe('AgentHandoffRunner', () => {
  it('emit 把 LlmTask[] 包成 manifest 信封写盘', async () => {
    const manifest = await new AgentHandoffRunner(dir, '1.4.0').emit('map', 1, [task], { k: 'v' });
    expect(manifest.op).toBe('map');
    expect(manifest.round).toBe(1);
    expect(manifest.meta).toEqual({ k: 'v' });
    expect(existsSync(join(dir, '.cache', 'legacy-bridge-task-map.json'))).toBe(true);
  });
});

describe('readTaskResults', () => {
  it('读 agent 写在 outputPath 的结果文件', async () => {
    await mkdir(join(dir, '.cache'), { recursive: true });
    await writeFile(join(dir, '.cache', 'legacy-bridge-result-map.json'), JSON.stringify({ text: 'AGENT_RESULT' }), 'utf8');
    const t: LlmTask = { ...task, outputPath: '.cache/legacy-bridge-result-map.json' };
    const results = await readTaskResults(dir, [t]);
    expect(results).toEqual([{ op: 'map', text: 'AGENT_RESULT' }]);
  });

  it('结果文件缺失 → 抛错', async () => {
    const t: LlmTask = { ...task, outputPath: '.cache/missing.json' };
    await expect(readTaskResults(dir, [t])).rejects.toThrow(/结果文件/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/runners.test.ts`
Expected: FAIL —— `Cannot find module '.../runners.js'`

- [ ] **Step 3: 写实现**

```ts
// src/core/legacy-bridge/runners.ts
// 双路径的两种执行:ApiRunner(--api 进程内调 SDK)/ AgentHandoffRunner(默认 emit manifest)+ readTaskResults
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { buildManifest, writeManifest } from './llm-task.js';
import type { LlmTask, LlmOp, TaskManifest } from './llm-task.js';

/** 一个 task 的 LLM 原始文本结果 */
export interface LlmTaskResult {
  op: LlmOp;
  text: string;
}

/** ApiRunner 所需的最小 client 接口(便于 mock) */
export interface RunnerClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

/** --api 模式:进程内逐个 task 调 Anthropic SDK */
export class ApiRunner {
  constructor(private readonly client: RunnerClient) {}

  async run(tasks: LlmTask[]): Promise<LlmTaskResult[]> {
    const out: LlmTaskResult[] = [];
    for (const t of tasks) {
      const bytes = Buffer.byteLength(t.prompt, 'utf8');
      console.log(`→ sending ${bytes} bytes to Anthropic API (provider=anthropic, region: auto, model=${t.model}, op=${t.op})`);
      const result = await this.client.messages.create({
        model: t.model,
        max_tokens: 8192,
        messages: [{ role: 'user', content: t.prompt }],
      });
      const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
      out.push({ op: t.op, text: block?.text ?? '' });
    }
    return out;
  }
}

/** 默认模式:把当前轮 LlmTask[] 包进 manifest 信封写盘(命令随后退出,等 agent fulfill) */
export class AgentHandoffRunner {
  constructor(
    private readonly forgeRoot: string,
    private readonly forgeVersion: string,
  ) {}

  /** emit 当前轮 manifest;返回 manifest(调用方可读 manifest_hash,如 archive 暂停态) */
  async emit(
    op: LlmOp,
    round: number,
    tasks: LlmTask[],
    meta?: Record<string, unknown>,
  ): Promise<TaskManifest> {
    const manifest = buildManifest({ op, round, tasks, forgeVersion: this.forgeVersion, meta });
    await writeManifest(this.forgeRoot, manifest);
    return manifest;
  }
}

/** agent 路径:读 agent 写在各 task.outputPath 的结果文件 */
export async function readTaskResults(forgeRoot: string, tasks: LlmTask[]): Promise<LlmTaskResult[]> {
  const out: LlmTaskResult[] = [];
  for (const t of tasks) {
    const p = isAbsolute(t.outputPath) ? t.outputPath : join(forgeRoot, t.outputPath);
    if (!existsSync(p)) {
      throw new Error(`agent 结果文件缺失:${p};请先 fulfill manifest 再跑 --apply`);
    }
    const parsed = JSON.parse(await readFile(p, 'utf8')) as { text?: string };
    out.push({ op: t.op, text: parsed.text ?? '' });
  }
  return out;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/runners.test.ts`
Expected: PASS(4 个用例)

- [ ] **Step 5: Phase 1 收尾 —— typecheck + 全测 + 提交**

```bash
pnpm typecheck && pnpm vitest run tests/core/legacy-bridge/
git add src/core/legacy-bridge/runners.ts tests/core/legacy-bridge/runners.test.ts
git commit -m "feat(legacy-bridge): 加 ApiRunner 与 agent 结果读取"
```

Expected: typecheck 0 error;legacy-bridge 测试全 PASS。

---

## Phase 2:retrofit `map`

`map` 是最简单的单 `LlmTask` 命令,先用它跑通端到端模式。当前 `runMapper`(`mapper.ts:152`)把「收集文件 + 读 preview + redact」「调 LLM」「组装 anchors + 渲染 draft」混在一个函数。拆成三段。

### Task 2.1:剥出 `buildMapTask`(确定性 prep)

**Files:**
- Modify: `src/core/legacy-bridge/mapper.ts`
- Test: `tests/core/legacy-bridge/mapper-dualpath.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/legacy-bridge/mapper-dualpath.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMapTask } from '../../../src/core/legacy-bridge/mapper.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lb-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs', 'SRS.md'), '# 需求规格\nAKIA1234567890ABCDEF', 'utf8');
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('buildMapTask', () => {
  it('产 1 个 op=map 的 LlmTask,preview 已 redact', async () => {
    const task = await buildMapTask({ projectRoot: dir, mode: 'overwrite' });
    expect(task.op).toBe('map');
    expect(task.prompt).toContain('docs/SRS.md');
    expect(task.prompt).not.toContain('AKIA1234567890ABCDEF'); // redact 生效
    expect(task.outputPath).toContain('legacy-bridge-result-map');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/mapper-dualpath.test.ts`
Expected: FAIL —— `buildMapTask is not a function`

- [ ] **Step 3: 在 `mapper.ts` 加 `buildMapTask`**

把 `runMapper`(`mapper.ts:152-203`)里「收集文件 → 读 preview → redact → `buildMapperPrompt`」整段抽成 `buildMapTask`。在 `mapper.ts` 顶部加 `import type { LlmTask } from './llm-task.js';`,并新增:

```ts
/** 确定性 prep:扫文件 + 读 preview + redact + 拼 prompt → 一个 LlmTask */
export async function buildMapTask(input: MapperInput): Promise<LlmTask> {
  const { projectRoot } = input;
  const docsPaths = input.docsPaths ?? DEFAULT_DOCS_PATHS;
  const allFiles: string[] = [];
  for (const docDir of docsPaths) {
    const full = join(projectRoot, docDir);
    if (!existsSync(full)) continue;
    for await (const f of walk(full, projectRoot)) allFiles.push(f);
  }
  if (input.scanSrc) {
    const srcRoot = join(projectRoot, 'src');
    if (existsSync(srcRoot)) {
      for await (const f of walk(srcRoot, projectRoot)) {
        if (f.includes('test') || f.includes('spec')) allFiles.push(f);
      }
    }
  }
  const entries: Array<{ path: string; preview: string }> = [];
  for (const f of allFiles) {
    const preview = redact(await readPreview(join(projectRoot, f))).redactedText;
    entries.push({ path: f, preview });
  }
  return {
    op: 'map',
    inputs: entries.map((e) => ({ source: e.path, content: e.preview })),
    prompt: buildMapperPrompt(entries),
    model: DEFAULT_MODEL,
    outputSchema: '[{ "path": string, "role": string, "modules": string[] }]',
    outputPath: '.cache/legacy-bridge-result-map.json',
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/mapper-dualpath.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/legacy-bridge/mapper.ts tests/core/legacy-bridge/mapper-dualpath.test.ts
git commit -m "refactor(legacy-bridge): 剥出 map 的确定性 prep buildMapTask"
```

### Task 2.2:剥出 `applyMapResult`(确定性后处理)

**Files:**
- Modify: `src/core/legacy-bridge/mapper.ts`
- Test: `tests/core/legacy-bridge/mapper-dualpath.test.ts`(追加)

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 mapper-dualpath.test.ts
import { applyMapResult } from '../../../src/core/legacy-bridge/mapper.js';

describe('applyMapResult', () => {
  it('把 LLM 分类结果组装成 draft yaml/md', () => {
    const llmText = JSON.stringify([{ path: 'docs/SRS.md', role: 'requirements', modules: ['payment'] }]);
    const out = applyMapResult(llmText, ['docs/SRS.md'], { mode: 'overwrite' });
    expect(out.draftYaml).toContain('requirements');
    expect(out.draftYaml).toContain('docs/SRS.md');
    expect(out.newAnchors).toHaveLength(1);
  });

  it('LLM 输出非法 JSON → 全部 fallback 成 unmatched', () => {
    const out = applyMapResult('not json', ['docs/X.md'], { mode: 'overwrite' });
    expect(out.unmatched).toContain('docs/X.md');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/mapper-dualpath.test.ts -t applyMapResult`
Expected: FAIL —— `applyMapResult is not a function`

- [ ] **Step 3: 在 `mapper.ts` 加 `applyMapResult`**

把 `runMapper`(`mapper.ts:201-251`)里「`parseMapperResponse` → 组装 `newAnchors` → merge → 渲染 draft」整段抽成 `applyMapResult`:

```ts
/** 确定性后处理:LLM 分类结果文本 → draft yaml/md + anchors */
export function applyMapResult(
  llmText: string,
  allFiles: string[],
  input: { mode: 'merge' | 'overwrite'; existing?: LegacyAnchorsFile },
): MapperOutput {
  const classifications = parseMapperResponse(llmText, allFiles);
  const newAnchors: LegacyAnchor[] = [];
  const unmatched: string[] = [];
  const roleSeen = new Set<LegacyAnchorRole>();
  for (const c of classifications) {
    if (c.role === 'unmatched') { unmatched.push(c.path); continue; }
    const isFirst = !roleSeen.has(c.role);
    roleSeen.add(c.role);
    newAnchors.push({ role: c.role, path: c.path, authoritative: isFirst, modules: c.modules });
  }
  let preservedAnchors: LegacyAnchor[] = [];
  if (input.mode === 'merge' && input.existing) {
    const existingPaths = new Set(input.existing.anchors.map((a) => a.path));
    preservedAnchors = input.existing.anchors;
    const filtered = newAnchors.filter((a) => !existingPaths.has(a.path));
    newAnchors.length = 0;
    newAnchors.push(...filtered);
  }
  const finalFile: LegacyAnchorsFile = {
    schema: 'forge-legacy-anchor/v1',
    anchors: [...preservedAnchors, ...newAnchors],
    redact: input.existing?.redact,
  };
  return {
    draftYaml: stringifyYaml(finalFile),
    draftMarkdown: renderMapperOverview(finalFile, unmatched),
    newAnchors, preservedAnchors, unmatched,
  };
}
```

`runMapper` 改为内部复用这两个新函数(保留向后兼容,供 `--api` 路径):

```ts
export async function runMapper(client: MapperClient, input: MapperInput): Promise<MapperOutput> {
  const task = await buildMapTask(input);
  const allFiles = task.inputs.map((i) => i.source);
  if (task.inputs.length === 0) return applyMapResult('[]', [], input);
  console.log(`→ sending ${Buffer.byteLength(task.prompt, 'utf8')} bytes to Anthropic API (provider=anthropic, region: auto, model=${DEFAULT_MODEL}, op=map ${task.inputs.length} files)`);
  const result = await client.messages.create({ model: DEFAULT_MODEL, max_tokens: 4096, messages: [{ role: 'user', content: task.prompt }] });
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return applyMapResult(block?.text ?? '', allFiles, input);
}
```

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `pnpm vitest run tests/core/legacy-bridge/mapper-dualpath.test.ts tests/core/legacy-bridge/mapper.test.ts`
Expected: 新用例 PASS;`mapper.test.ts` 既有用例仍 PASS(`runMapper` 行为不变)。

- [ ] **Step 5: 提交**

```bash
git add src/core/legacy-bridge/mapper.ts tests/core/legacy-bridge/mapper-dualpath.test.ts
git commit -m "refactor(legacy-bridge): 剥出 map 的确定性后处理 applyMapResult"
```

---

## Phase 3:retrofit `index`

`index` 同样是单 `LlmTask`,但当前 `buildIndex`(`indexer.ts:110`)逐 anchor 多次调 LLM(大文件还分块二次合并)。双路径化:把所有 authoritative anchor 的摘要请求**合并成一个 batch LlmTask**(一次 LLM 调用产全部摘要的 JSON map),`--apply` 渲染。`metadata-only` role(`acceptance-report`)不进 LLM,留在确定性 prep 里直接产出。

### Task 3.1:剥出 `buildIndexTask` + `applyIndexResult`

**Files:**
- Modify: `src/core/legacy-bridge/indexer.ts`
- Test: `tests/core/legacy-bridge/indexer-dualpath.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/legacy-bridge/indexer-dualpath.test.ts
import { describe, it, expect } from 'vitest';
import { buildIndexTask, applyIndexResult } from '../../../src/core/legacy-bridge/indexer.js';
import type { LegacyAnchorsFile } from '../../../src/core/legacy-bridge/types.js';

const file: LegacyAnchorsFile = {
  schema: 'forge-legacy-anchor/v1',
  anchors: [
    { role: 'requirements', path: 'docs/SRS.md', authoritative: true },
    { role: 'acceptance-report', path: 'docs/UAT.md', authoritative: true },
  ],
};

describe('buildIndexTask', () => {
  it('只为非 metadata-only anchor 产 LlmTask;metadata-only 走 prebuilt', async () => {
    const { task, prebuilt } = await buildIndexTask(file, async () => '正文内容若干');
    expect(task).not.toBeNull();
    expect(task!.op).toBe('index');
    expect(task!.prompt).toContain('docs/SRS.md');
    expect(task!.prompt).not.toContain('docs/UAT.md'); // acceptance-report 不进 LLM
    expect(prebuilt.find((e) => e.path === 'docs/UAT.md')).toBeTruthy();
  });
});

describe('applyIndexResult', () => {
  it('LLM 的 {path: summary} map + prebuilt 合并渲染 markdown', () => {
    const llmText = JSON.stringify({ 'docs/SRS.md': '这是需求摘要' });
    const prebuilt = [{ path: 'docs/UAT.md', role: 'acceptance-report', summary: '(metadata-only)', inputBytes: 0 }];
    const md = applyIndexResult(llmText, file, prebuilt);
    expect(md).toContain('这是需求摘要');
    expect(md).toContain('docs/UAT.md');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/indexer-dualpath.test.ts`
Expected: FAIL —— `buildIndexTask is not a function`

- [ ] **Step 3: 在 `indexer.ts` 加两个函数**

加 `import type { LlmTask } from './llm-task.js';`,并新增:

```ts
/** 确定性 prep:产 batch 摘要 LlmTask + metadata-only 的 prebuilt 项 */
export async function buildIndexTask(
  file: LegacyAnchorsFile,
  readText: (anchor: LegacyAnchor) => Promise<string>,
): Promise<{ task: LlmTask | null; prebuilt: IndexEntry[] }> {
  const auth = file.anchors.filter((a) => a.authoritative);
  const prebuilt: IndexEntry[] = [];
  const llmAnchors: Array<{ anchor: LegacyAnchor; masked: string }> = [];
  for (const a of auth) {
    if (METADATA_ONLY_INDEX_ROLES.has(a.role)) {
      prebuilt.push(await indexAnchorMetadataOnly(a));
      continue;
    }
    const masked = redact(await readText(a)).redactedText;
    llmAnchors.push({ anchor: a, masked });
  }
  if (llmAnchors.length === 0) return { task: null, prebuilt };
  const prompt = `请为下列每份文档产出约 ${SUMMARY_TARGET_LEN} 字摘要。\n严格输出 JSON 对象 {"<path>": "<摘要>"},不加 preamble。\n\n` +
    llmAnchors.map((x) => `## ${x.anchor.path}(role=${x.anchor.role})\n${x.masked}`).join('\n\n');
  return {
    task: {
      op: 'index',
      inputs: llmAnchors.map((x) => ({ source: x.anchor.path, content: x.masked })),
      prompt,
      model: DEFAULT_MODEL,
      outputSchema: '{ "<anchor-path>": "<约 100 字摘要>" }',
      outputPath: '.cache/legacy-bridge-result-index.json',
    },
    prebuilt,
  };
}

/** 确定性后处理:LLM 的 {path:summary} map + prebuilt → index markdown */
export function applyIndexResult(llmText: string, file: LegacyAnchorsFile, prebuilt: IndexEntry[]): string {
  let summaries: Record<string, string> = {};
  try {
    const parsed = JSON.parse(llmText.trim()) as Record<string, string>;
    if (parsed && typeof parsed === 'object') summaries = parsed;
  } catch {
    // 解析失败:LLM 摘要全空,prebuilt 仍渲染
  }
  const roleOf = new Map(file.anchors.map((a) => [a.path, a.role]));
  const entries: IndexEntry[] = [
    ...prebuilt,
    ...Object.entries(summaries).map(([path, summary]) => ({
      path, role: roleOf.get(path) ?? 'unmatched', summary, inputBytes: 0,
    })),
  ];
  return renderIndexMarkdown(entries);
}
```

> 注:`METADATA_ONLY_INDEX_ROLES` 当前是模块私有 `const`(`indexer.ts:70`)—— 无需导出,两个新函数与它同文件。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/indexer-dualpath.test.ts`
Expected: PASS

- [ ] **Step 5: Phase 3 收尾 —— 提交**

```bash
pnpm typecheck && pnpm vitest run tests/core/legacy-bridge/
git add src/core/legacy-bridge/indexer.ts tests/core/legacy-bridge/indexer-dualpath.test.ts
git commit -m "refactor(legacy-bridge): index 双路径化(batch LlmTask + applyIndexResult)"
```

---

## Phase 4:retrofit `sync-check`(含 redact 补盲区)

当前 `runSyncCheck`(`sync-check.ts:159`)逐 anchor 调 LLM,且 `changeContext` **未 redact**(spec §5 标的现状盲区)。双路径化 + 修盲区。

### Task 4.1:redact 扩到 `changeContext`(修盲区,TDD red 先复现)

**Files:**
- Modify: `src/core/legacy-bridge/sync-check.ts`
- Test: `tests/core/legacy-bridge/sync-check-redact.test.ts`

- [ ] **Step 1: 写复现盲区的失败测试**

```ts
// tests/core/legacy-bridge/sync-check-redact.test.ts
import { describe, it, expect } from 'vitest';
import { buildSyncCheckTask } from '../../../src/core/legacy-bridge/sync-check.js';
import type { LegacyAnchorsFile } from '../../../src/core/legacy-bridge/types.js';

const anchors: LegacyAnchorsFile = {
  schema: 'forge-legacy-anchor/v1',
  anchors: [{ role: 'requirements', path: 'docs/SRS.md', authoritative: true, modules: ['payment'] }],
};

describe('buildSyncCheckTask redact 覆盖 changeContext', () => {
  it('changeContext 里的 secret 在 task.prompt 中被 mask', async () => {
    const task = await buildSyncCheckTask(
      {
        changeId: 'add-pay', changeContext: '本次 change 用 token AKIA1234567890ABCDEF',
        affectedModules: ['payment'], anchors, autoResolveCrossAnchor: false, mtimeOf: () => 0,
      },
      async () => '锚点正文',
    );
    expect(task).not.toBeNull();
    expect(task!.prompt).not.toContain('AKIA1234567890ABCDEF'); // 现状盲区:此前会失败
    expect(task!.prompt).toContain('<<REDACTED');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/sync-check-redact.test.ts`
Expected: FAIL —— `buildSyncCheckTask is not a function`

- [ ] **Step 3: 在 `sync-check.ts` 加 `buildSyncCheckTask`**

加 `import type { LlmTask } from './llm-task.js';`。`buildSyncCheckPrompt` 当前直接插 `${changeContext}`(`sync-check.ts:71`)—— 新函数在拼 prompt 前对 `changeContext` 也跑 `redact`:

```ts
/** 确定性 prep:findAffectedAnchors + redact(含 changeContext,补盲区)→ 一个 LlmTask */
export async function buildSyncCheckTask(
  input: SyncCheckInput,
  readAnchorText: (path: string) => Promise<string>,
  indexEntries?: Array<{ path: string; summary: string }>,
): Promise<LlmTask | null> {
  let affected = findAffectedAnchors(input.anchors, input.affectedModules);
  const redactRules = input.anchors.redact ?? [];
  if (indexEntries && indexEntries.length > 0) {
    const keywords = extractKeywords(input.changeContext);
    const filtered = affected.filter((a) => {
      const entry = indexEntries.find((e) => e.path === a.path);
      if (!entry) return true;
      return keywords.some((k) => entry.summary.includes(k));
    });
    if (filtered.length > 0) affected = filtered;
  }
  if (affected.length === 0) return null;
  // 修盲区:changeContext 也 redact 后再进 prompt
  const maskedContext = redact(input.changeContext, redactRules).redactedText;
  const blocks: string[] = [];
  const inputs: LlmTask['inputs'] = [{ source: 'change-context', content: maskedContext }];
  for (const anchor of affected) {
    let masked: string;
    try {
      masked = redact(await readAnchorText(anchor.path), redactRules).redactedText;
    } catch (err) {
      console.warn(`⚠ anchor ${anchor.path} 读取失败:${(err as Error).message};跳过该项继续`);
      continue; // 缺失锚点不阻塞(对齐现 runSyncCheck P7-10)
    }
    blocks.push(`# 锚点 role=${anchor.role} path=${anchor.path}\n${masked}`);
    inputs.push({ source: anchor.path, content: masked });
  }
  // affected 存在但全部读取失败 → 无锚点内容,不 emit 空 sync-check task
  if (blocks.length === 0) return null;
  const prompt = `你是 brownfield sync 审计员。判断"本次 change"是否要求更新各"老文档锚点"。\n\n# 本次 change 上下文\n${maskedContext}\n\n${blocks.join('\n\n')}\n\n# 输出\n严格 JSON 数组,每项 { "anchor_path": string, "severity": "critical|major|minor|style|info", "section": string, "description": string }。无更新输出 []。`;
  return {
    op: 'sync-check', inputs, prompt, model: DEFAULT_MODEL,
    outputSchema: '[{ "anchor_path": string, "severity": string, "section": string, "description": string }]',
    outputPath: '.cache/legacy-bridge-result-sync-check.json',
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/sync-check-redact.test.ts`
Expected: PASS —— `changeContext` 的 secret 已 mask。

- [ ] **Step 5: 提交**

```bash
git add src/core/legacy-bridge/sync-check.ts tests/core/legacy-bridge/sync-check-redact.test.ts
git commit -m "fix(legacy-bridge): sync-check 的 changeContext 补 redact + 剥出 buildSyncCheckTask"
```

### Task 4.2:`applySyncCheckResult` + `produced_from` 字段

**Files:**
- Modify: `src/core/legacy-bridge/sync-check.ts`、`src/core/legacy-bridge/types.ts`
- Test: `tests/core/legacy-bridge/sync-check-dualpath.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/legacy-bridge/sync-check-dualpath.test.ts
import { describe, it, expect } from 'vitest';
import { applySyncCheckResult } from '../../../src/core/legacy-bridge/sync-check.js';

describe('applySyncCheckResult', () => {
  it('LLM diff 数组 → SyncStateFile,带 produced_from', () => {
    const llmText = JSON.stringify([
      { anchor_path: 'docs/SRS.md', severity: 'critical', section: '§4.5', description: '幂等性变化' },
    ]);
    const state = applySyncCheckResult(llmText, 'add-pay', 'abc123hash');
    expect(state.change_id).toBe('add-pay');
    expect(state.produced_from).toBe('abc123hash');
    expect(state.diffs).toHaveLength(1);
    expect(state.diffs[0]!.severity).toBe('critical');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/sync-check-dualpath.test.ts`
Expected: FAIL —— `applySyncCheckResult is not a function`

- [ ] **Step 3a: `types.ts` 给 `SyncStateFile` 加 `produced_from`**

在 `src/core/legacy-bridge/types.ts` 的 `SyncStateFile` interface 加可选字段:

```ts
  /** 产生此 sync-state 的 sync-check manifest 的 manifest_hash(双路径 resume gate 复核用,Spec A §4.5) */
  produced_from?: string;
```

- [ ] **Step 3b: `sync-check.ts` 加 `applySyncCheckResult`**

```ts
/** 确定性后处理:LLM diff 数组文本 → SyncStateFile(带 produced_from) */
export function applySyncCheckResult(
  llmText: string,
  changeId: string,
  producedFromHash: string,
): SyncStateFile {
  let raw: Array<Partial<SyncStateDiff>> = [];
  try {
    const parsed = JSON.parse(llmText.trim());
    if (Array.isArray(parsed)) raw = parsed as Array<Partial<SyncStateDiff>>;
  } catch {
    raw = [{ severity: 'info', description: `LLM 输出非合法 JSON:${llmText.slice(0, 200)}` }];
  }
  const diffs: SyncStateDiff[] = normalizeDiffsFromLlm(raw).map((d, i) => ({ ...d, id: i + 1 }));
  return {
    schema: 'forge-legacy-sync/v1',
    change_id: changeId,
    generated_at: new Date().toISOString(),
    diffs,
    produced_from: producedFromHash,
  };
}
```

> `normalizeDiffsFromLlm` 已从 `./diff-report.js` 导入(`sync-check.ts:8`),沿用。

- [ ] **Step 4: 跑测试 + 回归**

Run: `pnpm vitest run tests/core/legacy-bridge/sync-check-dualpath.test.ts tests/core/legacy-bridge/sync-check.test.ts`
Expected: 新用例 PASS;`sync-check.test.ts` 既有用例仍 PASS。

- [ ] **Step 5: Phase 4 收尾 —— 提交**

```bash
pnpm typecheck && pnpm vitest run tests/core/legacy-bridge/
git add src/core/legacy-bridge/sync-check.ts src/core/legacy-bridge/types.ts tests/core/legacy-bridge/sync-check-dualpath.test.ts
git commit -m "feat(legacy-bridge): sync-check 双路径化 + SyncStateFile.produced_from"
```

---

## Phase 5:retrofit `regenerate`(2 轮流)

`regenerate` 是唯一多轮命令。轮1 = `regenerate` + `extract-facts` 两个 `LlmTask`;`--apply` 轮1 跑 `stratifiedSample`(确定性)后 emit 轮2 manifest(`quality-judge`);`--apply` 轮2 算保真率 + 阈值 gate。

### Task 5.1:轮1 —— `buildRegenerateRound1Tasks`

**Files:**
- Modify: `src/core/legacy-bridge/regenerator.ts`
- Test: `tests/core/legacy-bridge/regenerator-dualpath.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/core/legacy-bridge/regenerator-dualpath.test.ts
import { describe, it, expect } from 'vitest';
import { buildRegenerateRound1Tasks } from '../../../src/core/legacy-bridge/regenerator.js';
import type { LegacyAnchor } from '../../../src/core/legacy-bridge/types.js';

const auth: LegacyAnchor = { role: 'requirements', path: 'docs/SRS.md', authoritative: true };

describe('buildRegenerateRound1Tasks', () => {
  it('产 2 个 LlmTask:regenerate + extract-facts', async () => {
    const tasks = await buildRegenerateRound1Tasks(
      { role: 'requirements', authoritative: auth, forgeVersion: '1.4.0', regenLicense: 'derived-from-source' },
      async () => '老 SRS 正文,含密钥 AKIA1234567890ABCDEF',
    );
    expect(tasks.map((t) => t.op).sort()).toEqual(['extract-facts', 'regenerate']);
    for (const t of tasks) expect(t.prompt).not.toContain('AKIA1234567890ABCDEF'); // redact
  });

  it('metadata-only role 抛 RegenOutputError', async () => {
    await expect(
      buildRegenerateRound1Tasks(
        { role: 'acceptance-report', authoritative: auth, forgeVersion: '1.4.0', regenLicense: 'derived-from-source' },
        async () => 'x',
      ),
    ).rejects.toThrow(/metadata-only/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/regenerator-dualpath.test.ts`
Expected: FAIL —— `buildRegenerateRound1Tasks is not a function`

- [ ] **Step 3: 在 `regenerator.ts` 加 `buildRegenerateRound1Tasks`**

加 `import type { LlmTask } from './llm-task.js';`。复用既有 `buildRegeneratePrompt`、`redact`、`readAnchorAsText`、`METADATA_ONLY_ROLES`:

```ts
/** 轮1:产 regenerate + extract-facts 两个 LlmTask */
export async function buildRegenerateRound1Tasks(
  input: RegenerateInput,
  readText: (anchor: LegacyAnchor) => Promise<string> = readAnchorAsText,
): Promise<LlmTask[]> {
  if (METADATA_ONLY_ROLES.includes(input.role)) {
    throw new RegenOutputError(
      `role=${input.role} 是 metadata-only(spec §7 line 909);不复写。`, input.role,
    );
  }
  const redactRules = [...(input.globalRedactRules ?? []), ...(input.authoritative.redact ?? [])];
  const maskedAuth = redact(await readText(input.authoritative), redactRules).redactedText;
  const regeneratePrompt = buildRegeneratePrompt(input, maskedAuth);
  const extractFactsPrompt = `从下列老文档抽取关键事实(数字 / 字段约束 / 业务规则 / 合规条款 / 设计决策)。\n严格输出 JSON 数组,每项含 { "text": string(<=80 字单句), "section": string(章节锚如 "§4.5",无则 "(unstructured)"), "critical": boolean(合规/安全/业务硬约束=true) }。不加 preamble、不带 code fence。\n\n# 老文档\n${maskedAuth}`;
  const common = { model: DEFAULT_MODEL, inputs: [{ source: input.authoritative.path, content: maskedAuth }] };
  return [
    { ...common, op: 'regenerate', prompt: regeneratePrompt, outputSchema: 'markdown 正文', outputPath: `.cache/legacy-bridge-result-regenerate.json` },
    { ...common, op: 'extract-facts', prompt: extractFactsPrompt, outputSchema: '[{ "text": string, "section": string, "critical": boolean }]', outputPath: `.cache/legacy-bridge-result-extract-facts.json` },
  ];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/regenerator-dualpath.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/legacy-bridge/regenerator.ts tests/core/legacy-bridge/regenerator-dualpath.test.ts
git commit -m "refactor(legacy-bridge): regenerate 轮1 双路径化(buildRegenerateRound1Tasks)"
```

### Task 5.2:轮1→轮2 衔接 —— `applyRound1AndBuildRound2`

**Files:**
- Modify: `src/core/legacy-bridge/quality-judge.ts`、`src/core/legacy-bridge/regenerator.ts`
- Test: `tests/core/legacy-bridge/regenerator-dualpath.test.ts`(追加)

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 regenerator-dualpath.test.ts
import { applyRound1AndBuildRound2 } from '../../../src/core/legacy-bridge/regenerator.js';

describe('applyRound1AndBuildRound2', () => {
  it('轮1 产物 → stratifiedSample → 产 quality-judge LlmTask + SamplingOutput', () => {
    const regenBody = '## 复写后的 SRS\n字段 X 必须非空。' + 'x'.repeat(200);
    const facts = JSON.stringify([
      { text: '字段 X 必须非空', section: '§4', critical: true },
      { text: 'fact2', section: '§4', critical: false },
      { text: 'fact3', section: '§5', critical: false },
    ]);
    const { task, sampling } = applyRound1AndBuildRound2(regenBody, facts, 'requirements');
    expect(task.op).toBe('quality-judge');
    expect(task.prompt).toContain('字段 X 必须非空'); // 抽样 fact 进 prompt
    expect(sampling.sampled.length).toBeGreaterThan(0);
  });

  it('extract-facts 空 / 非法 → 抛 RegenOutputError(不静默走「空抽样=passed」)', () => {
    const regenBody = '## SRS\n' + 'x'.repeat(200);
    expect(() => applyRound1AndBuildRound2(regenBody, 'not json', 'requirements')).toThrow(/extract-facts/);
    expect(() => applyRound1AndBuildRound2(regenBody, '[]', 'requirements')).toThrow(/保真率/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/regenerator-dualpath.test.ts -t applyRound1AndBuildRound2`
Expected: FAIL —— `applyRound1AndBuildRound2 is not a function`

- [ ] **Step 3: 在 `regenerator.ts` 加 `applyRound1AndBuildRound2`**

复用 `quality-judge.ts` 既有的 `stratifiedSample`(确定性抽样)。在 `regenerator.ts`:

```ts
import { stratifiedSample, type SamplingOutput } from './quality-judge.js';
import type { KeyFact } from './types.js';
import type { LlmTask, LlmTaskInput } from './llm-task.js';

/** 轮1 校验后处理:解析 facts(KeyFact)→ 确定性分层抽样 → 产轮2 quality-judge LlmTask + SamplingOutput */
export function applyRound1AndBuildRound2(
  regenBody: string,
  extractFactsText: string,
  role: LegacyAnchorRole,
): { task: LlmTask; sampling: SamplingOutput } {
  validateRegenOutput(regenBody, role); // 复用既有 markdown 合法性校验
  let facts: KeyFact[] = [];
  try {
    const parsed = JSON.parse(extractFactsText.trim());
    if (Array.isArray(parsed)) {
      facts = (parsed as Array<Partial<KeyFact>>)
        .map((o) => ({
          text: typeof o.text === 'string' ? o.text : '',
          section: typeof o.section === 'string' ? o.section : '(unstructured)',
          critical: typeof o.critical === 'boolean' ? o.critical : false,
        }))
        .filter((f) => f.text.trim().length > 0);
    }
  } catch { facts = []; }
  // extract-facts 失败 / 空 → 无法验证保真率;不静默走「空抽样=passed」,显式抛错(下游写 .partial)
  if (facts.length === 0) {
    throw new RegenOutputError('extract-facts 未抽出任何 fact(LLM 输出非法或为空);无法验证保真率', role);
  }
  const sampling = stratifiedSample({ allFacts: facts }); // 确定性分层抽样,留 CLI 侧
  const numbered = sampling.sampled
    .map((f, i) => `${i + 1}. [${f.section}${f.critical ? ',critical' : ''}] ${f.text}`)
    .join('\n');
  const prompt = `下面是一份「复写产物」和一组「原文 fact」。对每个 fact 三态判定它是否在复写产物里被保留:\n- preserved:字面/数值完全一致\n- paraphrased:同义改写但语义+数值+约束完全等价\n- lost:漏掉 / 数值错 / 约束丢\n\n严格输出 JSON 数组,**顺序与 fact 编号一一对应**,每项 { "state": "preserved"|"paraphrased"|"lost" }。不加 preamble。\n\n# 复写产物\n${regenBody}\n\n# 待判 fact\n${numbered}`;
  const inputs: LlmTaskInput[] = [{ source: 'regen-body', content: regenBody }];
  return {
    task: {
      op: 'quality-judge', inputs, prompt, model: DEFAULT_MODEL,
      outputSchema: '[{ "state": "preserved"|"paraphrased"|"lost" }](顺序对应 fact 编号)',
      outputPath: '.cache/legacy-bridge-result-quality-judge.json',
    },
    sampling,
  };
}
```

> `stratifiedSample` / `SamplingOutput` 已是 `quality-judge.ts` 的 export(`:39` / `:22`),`KeyFact` 是 `types.ts` 的 export,直接 import。`computeQualityResult` 在 Task 5.3 新增。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/core/legacy-bridge/regenerator-dualpath.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/legacy-bridge/regenerator.ts src/core/legacy-bridge/quality-judge.ts tests/core/legacy-bridge/regenerator-dualpath.test.ts
git commit -m "refactor(legacy-bridge): regenerate 轮1→轮2 衔接(stratifiedSample + quality-judge task)"
```

### Task 5.3:轮2 —— `computeQualityResult` 抽取 + `applyRound2`(三态保真率 gate)

`judgeAllFacts`(`quality-judge.ts:272-318`)把「调 LLM」与「算分」混在一起。双路径化:把算分段抽成纯函数 `computeQualityResult`(含 critical 必须 100% 的 gate),`applyRound2` 复用它 —— **不因走 agent 路径软化质量模型**(F2)。

**Files:**
- Modify: `src/core/legacy-bridge/quality-judge.ts`、`src/core/legacy-bridge/regenerator.ts`
- Test: `tests/core/legacy-bridge/regenerator-dualpath.test.ts`(追加)

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 regenerator-dualpath.test.ts
import { applyRound2 } from '../../../src/core/legacy-bridge/regenerator.js';
import type { SamplingOutput } from '../../../src/core/legacy-bridge/quality-judge.js';

const sampling: SamplingOutput = {
  sampled: [
    { text: 'a', section: '§1', critical: true },
    { text: 'b', section: '§1', critical: false },
  ],
  perSectionSampled: { '§1': 2 },
  uncoveredSections: [],
};

describe('applyRound2 三态保真率 gate', () => {
  it('全 preserved → critical_rate=1 total_rate=1 → passed', () => {
    const judge = JSON.stringify([{ state: 'preserved' }, { state: 'preserved' }]);
    const r = applyRound2(judge, sampling, 0.9);
    expect(r.critical_rate).toBe(1);
    expect(r.passed).toBe(true);
  });

  it('critical fact lost → critical_rate<1 → 不 passed(critical 必须 100%,即便 total 达标)', () => {
    const judge = JSON.stringify([{ state: 'lost' }, { state: 'preserved' }]);
    const r = applyRound2(judge, sampling, 0.4);
    expect(r.critical_rate).toBe(0);
    expect(r.passed).toBe(false);
  });

  it('paraphrased 视为保留(state !== lost)', () => {
    const judge = JSON.stringify([{ state: 'paraphrased' }, { state: 'paraphrased' }]);
    const r = applyRound2(judge, sampling, 0.9);
    expect(r.passed).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/core/legacy-bridge/regenerator-dualpath.test.ts -t applyRound2`
Expected: FAIL —— `applyRound2 is not a function`

- [ ] **Step 3a: 在 `quality-judge.ts` 抽出 `computeQualityResult`**

把 `judgeAllFacts`(`quality-judge.ts:285-317`)的「算分」段抽成纯函数并 export,`judgeAllFacts` 改为调它(DRY,行为不变):

```ts
/** 纯函数:三态 judge 结果 + 抽样 → QualityResult。critical 必须 100% 的 gate 在此。 */
export function computeQualityResult(
  judged: FactJudgeResult[],
  sampling: SamplingOutput,
  threshold: number = DEFAULT_FIDELITY_THRESHOLD,
): QualityResult {
  const critical = judged.filter((r) => r.fact.critical);
  const nonCritical = judged.filter((r) => !r.fact.critical);
  const criticalRate =
    critical.length === 0 ? 1.0 : critical.filter((r) => r.state !== 'lost').length / critical.length;
  const totalRate =
    judged.length === 0 ? 1.0 : judged.filter((r) => r.state !== 'lost').length / judged.length;
  const perSectionRates: Record<string, number> = {};
  for (const [section, totalInSection] of Object.entries(sampling.perSectionSampled)) {
    const preserved = judged.filter((r) => r.fact.section === section && r.state !== 'lost').length;
    perSectionRates[section] = totalInSection === 0 ? 1.0 : preserved / totalInSection;
  }
  return {
    total_rate: totalRate,
    critical_rate: criticalRate,
    per_section_rates: perSectionRates,
    lost_critical: critical.filter((r) => r.state === 'lost').map((r) => r.fact),
    lost_non_critical: nonCritical.filter((r) => r.state === 'lost').map((r) => r.fact),
    uncovered_sections: sampling.uncoveredSections,
    passed: criticalRate >= 1.0 && totalRate >= threshold,
  };
}
```

`judgeAllFacts` 末尾 `const critical = ...` 到 `return {...}` 整段(`:285-317`)替换为:`return computeQualityResult(judged, sampling, threshold);`。

- [ ] **Step 3b: 在 `regenerator.ts` 加 `applyRound2`**

```ts
import { computeQualityResult } from './quality-judge.js';
import type { FactState, FactJudgeResult, SamplingOutput } from './quality-judge.js';
import type { QualityResult } from './types.js';

/** 轮2 后处理:agent 三态 judge 结果 + 轮1 抽样 → QualityResult。
 *  critical 必须 100% 的 gate 在 computeQualityResult 内,不因走 agent 路径软化。 */
export function applyRound2(
  judgeText: string,
  sampling: SamplingOutput,
  threshold: number,
): QualityResult {
  let states: FactState[] = [];
  try {
    const parsed = JSON.parse(judgeText.trim());
    if (Array.isArray(parsed)) {
      states = (parsed as Array<{ state?: string }>).map((o) =>
        o.state === 'preserved' || o.state === 'paraphrased' || o.state === 'lost' ? o.state : 'lost',
      );
    }
  } catch { states = []; }
  // 按编号与轮1 抽样 fact 一一对应;agent 漏判的 fact 保守视为 lost
  const judged: FactJudgeResult[] = sampling.sampled.map((fact, i) => ({ fact, state: states[i] ?? 'lost' }));
  return computeQualityResult(judged, sampling, threshold);
}
```

> `FactState` / `FactJudgeResult` / `SamplingOutput` 均已是 `quality-judge.ts` 的 export(`:137` / `:140` / `:22`);`QualityResult` 是 `types.ts` 的 export。

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `pnpm vitest run tests/core/legacy-bridge/regenerator-dualpath.test.ts tests/core/legacy-bridge/quality-judge.test.ts`
Expected: 新用例 PASS;`quality-judge.test.ts` 既有用例仍 PASS(`judgeAllFacts` 经 `computeQualityResult` 重构,行为不变)。

- [ ] **Step 5: Phase 5 收尾 —— 提交**

```bash
pnpm typecheck && pnpm vitest run tests/core/legacy-bridge/
git add src/core/legacy-bridge/regenerator.ts src/core/legacy-bridge/quality-judge.ts tests/core/legacy-bridge/regenerator-dualpath.test.ts
git commit -m "feat(legacy-bridge): regenerate 轮2 三态保真率 gate(computeQualityResult + applyRound2)"
```

---

## Phase 6:CLI 接线 —— `legacy-bridge.ts` 四子命令 + archive 集成

### Task 6.0:opt-in gate 抽成共享 helper(双模式都过)

spec §5 / 决策 D6:`allow_llm_calls` + ack 的 opt-in gate 对 agent 与 `--api` 两模式都生效 —— agent 模式同样把老文档(含 `contains_customer_data` 锚点)交给 LLM。当前 gate 逻辑散在主命令 action(`legacy-bridge.ts:81-118`,用 `checkAck`)。抽成 helper,四个 `run*Command` 入口都先调。

**Files:**
- Modify: `src/cli/commands/legacy-bridge.ts`
- Test: `tests/cli/legacy-bridge/optin.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/cli/legacy-bridge/optin.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLlmOptIn } from '../../../src/cli/commands/legacy-bridge.js';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'optin-')); await mkdir(join(dir, 'forge'), { recursive: true }); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('assertLlmOptIn', () => {
  it('config 无 allow_llm_calls → not-ok,reason 提示该字段', async () => {
    await writeFile(join(dir, 'forge', 'config.yaml'), 'legacy_bridge: {}\n', 'utf8');
    const r = await assertLlmOptIn(join(dir, 'forge'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/allow_llm_calls/);
  });

  it('config.yaml 缺失 → not-ok', async () => {
    const r = await assertLlmOptIn(join(dir, 'forge'));
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/cli/legacy-bridge/optin.test.ts`
Expected: FAIL —— `assertLlmOptIn is not a function`

- [ ] **Step 3: 在 `legacy-bridge.ts` 实现 `assertLlmOptIn`**

```ts
/** spec §5:opt-in gate —— agent 与 --api 两模式都先过。复用既有 checkAck。 */
export async function assertLlmOptIn(
  forgeRoot: string,
): Promise<{ ok: true } | { ok: false; reason: string; graceful: boolean }> {
  const configPath = join(forgeRoot, 'config.yaml');
  if (!existsSync(configPath)) return { ok: false, graceful: false, reason: 'forge/config.yaml 不存在,先跑 forge init' };
  let config: ForgeConfig;
  try { config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig; }
  catch (e) { return { ok: false, graceful: false, reason: `config.yaml 格式错误:${(e as Error).message}` }; }
  // allow_llm_calls=false/缺失 → graceful skip(spec §4 点6:两模式都 graceful skip)
  if (!config.legacy_bridge?.allow_llm_calls) {
    return { ok: false, graceful: true, reason: 'legacy_bridge.allow_llm_calls 未开启 — 跳过(graceful skip)' };
  }
  const anchors = await loadAnchorsFile(forgeRoot).catch(() => null);
  const ack = await checkAck(forgeRoot, config, anchors ?? { schema: 'forge-legacy-anchor/v1', anchors: [] });
  if (!ack.ok) return { ok: false, graceful: false, reason: `LLM 数据传输 ack 未就绪:${ack.reason};跑 forge legacy-bridge --acknowledge-data-transfer` };
  return { ok: true };
}
```

**集成契约**:Task 6.1 / 6.2 的每个 `run*Command` 入口**第一步**调 `assertLlmOptIn`;not-ok 时 —— `graceful:true` → 打印 reason 后 `return LB_EXIT_OK`(graceful skip);`graceful:false` → 打印 reason 后 `return LB_EXIT_GENERAL_ERROR`。`--apply` 分支不调 LLM,可跳过 gate。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/cli/legacy-bridge/optin.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/cli/commands/legacy-bridge.ts tests/cli/legacy-bridge/optin.test.ts
git commit -m "refactor(legacy-bridge): opt-in gate 抽成共享 assertLlmOptIn helper"
```

### Task 6.1:四子命令加 `--apply` / `--api` + 默认翻转 agent

**Files:**
- Modify: `src/cli/commands/legacy-bridge.ts`
- Test: `tests/cli/legacy-bridge/dualpath.test.ts`

`legacy-bridge.ts` 现有 `map` / `index` / `regenerate` / `sync-check` 子命令在 commander 注册(Phase A 骨架,见 `legacy-bridge.ts:46-51` 的 import)。每个子命令加两个 flag:`--apply`、`--api`;默认(都不带)走 agent emit。

- [ ] **Step 1: 写失败测试(以 `map` 为代表)**

```ts
// tests/cli/legacy-bridge/dualpath.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { runMapCommand } from '../../../src/cli/commands/legacy-bridge.js';
import { writeAck } from '../../../src/core/legacy-bridge/ack.js';
import type { ForgeConfig } from '../../../src/core/schema/types.js';

const CONFIG_YAML = 'legacy_bridge:\n  allow_llm_calls: true\n';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lb-cli-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs', 'SRS.md'), '# 需求', 'utf8');
  // opt-in gate fixture(Task 6.0):config + writeAck 写匹配 config_hash 的 ack 文件
  await mkdir(join(dir, 'forge'), { recursive: true });
  await writeFile(join(dir, 'forge', 'config.yaml'), CONFIG_YAML, 'utf8');
  await writeAck(join(dir, 'forge'), parseYaml(CONFIG_YAML) as ForgeConfig);
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('runMapCommand 默认 agent 模式', () => {
  it('默认(无 flag)→ emit manifest 到 .cache,不调 LLM', async () => {
    const code = await runMapCommand({ projectRoot: dir, mode: 'overwrite', apply: false, api: false });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'forge', '.cache', 'legacy-bridge-task-map.json'))).toBe(true);
  });

  it('--apply 模式:喂 agent 结果文件 → 产 draft yaml', async () => {
    await runMapCommand({ projectRoot: dir, mode: 'overwrite', apply: false, api: false }); // 先 emit
    await writeFile(
      join(dir, 'forge', '.cache', 'legacy-bridge-result-map.json'),
      JSON.stringify({ text: JSON.stringify([{ path: 'docs/SRS.md', role: 'requirements' }]) }),
      'utf8',
    );
    const code = await runMapCommand({ projectRoot: dir, mode: 'overwrite', apply: true, api: false });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'forge', 'legacy-anchors-draft.yaml'))).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/cli/legacy-bridge/dualpath.test.ts`
Expected: FAIL —— `runMapCommand is not a function`

- [ ] **Step 3: 在 `legacy-bridge.ts` 实现 `runMapCommand` 并接 commander**

把 `map` 子命令的 action 体抽成可测的 `runMapCommand`(返回 exit code,不直接 `process.exit`,便于测试),三分支:

```ts
// src/cli/commands/legacy-bridge.ts —— 新增导出
import { readManifest, consumeManifest, manifestPath } from '../../core/legacy-bridge/llm-task.js';
import { ApiRunner, AgentHandoffRunner, readTaskResults, type RunnerClient } from '../../core/legacy-bridge/runners.js';
import { buildMapTask, applyMapResult, writeMapperDraft } from '../../core/legacy-bridge/mapper.js';

export interface MapCommandOpts {
  projectRoot: string;
  mode: 'merge' | 'overwrite';
  apply: boolean;
  api: boolean;
}

/** map 子命令三分支:emit(默认)/ --apply / --api。返回 exit code。 */
export async function runMapCommand(opts: MapCommandOpts): Promise<number> {
  const forgeRoot = join(opts.projectRoot, 'forge');
  if (!opts.apply) {
    // --apply 不调 LLM,跳过 gate;emit / --api 先过 opt-in gate(Task 6.0)
    const optin = await assertLlmOptIn(forgeRoot);
    if (!optin.ok) { console.error(`✗ ${optin.reason}`); return optin.graceful ? LB_EXIT_OK : LB_EXIT_GENERAL_ERROR; }
  }
  if (opts.apply) {
    const manifest = await readManifest(forgeRoot, 'map');
    if (!manifest) { console.error('✗ 无 map manifest;请先跑 forge legacy-bridge map'); return LB_EXIT_GENERAL_ERROR; }
    const [result] = await readTaskResults(forgeRoot, manifest.tasks);
    const allFiles = manifest.tasks[0]!.inputs.map((i) => i.source);
    const existing = opts.mode === 'merge' ? ((await loadAnchorsFile(forgeRoot).catch(() => null)) ?? undefined) : undefined;
    const out = applyMapResult(result!.text, allFiles, { mode: opts.mode, existing });
    await writeMapperDraft(forgeRoot, out);
    await consumeManifest(forgeRoot, 'map');
    console.log('✓ map draft 已写 forge/legacy-anchors-draft.yaml');
    return LB_EXIT_OK;
  }
  const task = await buildMapTask({ projectRoot: opts.projectRoot, mode: opts.mode });
  if (opts.api) {
    const client = makeApiClient() as unknown as RunnerClient; // 复用现有 loadEnv()
    const [result] = await new ApiRunner(client).run([task]);
    const existing = opts.mode === 'merge' ? ((await loadAnchorsFile(forgeRoot).catch(() => null)) ?? undefined) : undefined;
    const out = applyMapResult(result!.text, task.inputs.map((i) => i.source), { mode: opts.mode, existing });
    await writeMapperDraft(forgeRoot, out);
    console.log('✓ map draft 已写(--api 单进程)');
    return LB_EXIT_OK;
  }
  // 默认 agent:emit manifest(经 AgentHandoffRunner)
  await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit('map', 1, [task]);
  console.log(`✓ map manifest 已写 ${manifestPath(forgeRoot, 'map')}\n  → 请 fulfill 后跑 forge legacy-bridge map --apply(见 skill: legacy-bridge-fulfillment)`);
  return LB_EXIT_OK;
}
```

commander 注册处把 `map` 子命令改为 `.option('--apply', ...)`.`.option('--api', ...)`,action 调 `runMapCommand` 后 `process.exit(code)`。`makeApiClient()` 抽出现有 `loadEnv()` + `new Anthropic(...)` 逻辑(`legacy-bridge.ts:610-618`)成一个 helper。

> `index` / `regenerate` / `sync-check` 三子命令同构,各加 `runIndexCommand` / `runRegenerateCommand` / `runSyncCheckCommand`,emit 分支同样用 `AgentHandoffRunner`。`regenerate` 的 `--apply` 读 `manifest.round`:`round===1` → `applyRound1AndBuildRound2`(若抛 `RegenOutputError` —— extract-facts 空/非法 —— **不 emit 轮2,直接写 `.partial` + exit 3**)得 `{task, sampling}` → emit 轮2 manifest(`round:2`、`meta:{sampling}`);`round===2` → 从 `manifest.meta.sampling` 取回 `SamplingOutput` → `applyRound2(judgeText, sampling, threshold)` → 按 `QualityResult.passed` 写产物 / `.partial`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/cli/legacy-bridge/dualpath.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/cli/commands/legacy-bridge.ts tests/cli/legacy-bridge/dualpath.test.ts
git commit -m "feat(legacy-bridge): 四子命令加 --apply/--api,默认翻转 agent 模式"
```

### Task 6.2:index / regenerate / sync-check 三子命令同构接线

**Files:**
- Modify: `src/cli/commands/legacy-bridge.ts`
- Test: `tests/cli/legacy-bridge/dualpath.test.ts`(追加)

- [ ] **Step 1: 追加三子命令的 emit / apply 测试**

为 `runIndexCommand`、`runSyncCheckCommand`、`runRegenerateCommand` 各加「默认 emit manifest」「`--apply` 产产物」两个用例(结构同 Task 6.1 的 map 用例;`regenerate` 额外加「轮1 `--apply` 后 emit 轮2 manifest(`round:2`)」用例)。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/cli/legacy-bridge/dualpath.test.ts`
Expected: FAIL —— 三个 `run*Command` 未定义。

- [ ] **Step 3: 实现三个 `run*Command`**

按 Task 6.1 的 `runMapCommand` 模板实现,各入口先过 `assertLlmOptIn`(同 6.1)。三命令的关键差异 + **null-task 分支**(必须显式定义,否则实现者会歧义):

- **`runIndexCommand`**(`buildIndexTask` / `applyIndexResult`):`buildIndexTask` 返回 `{ task, prebuilt }`。
  - **`task === null`**(全部 anchor 是 metadata-only,无 LLM 工作)→ **不 emit manifest、不走 agent**:直接 `applyIndexResult('', file, prebuilt)` 渲染 index 写盘、`return LB_EXIT_OK`。
  - `task !== null` → emit 时 manifest 带 `meta: { prebuilt }`;`--apply` 从 `manifest.meta.prebuilt` 取回 prebuilt 一并传 `applyIndexResult`。
- **`runSyncCheckCommand`**(`buildSyncCheckTask` / `applySyncCheckResult`):`buildSyncCheckTask` 返回 `LlmTask | null`。
  - **`task === null`**(无 affected anchor / 全部读取失败)→ 打印「无需 sync-check」、`return LB_EXIT_OK`,不 emit。
  - emit 时 `meta.gate_context = 'standalone'`;`--apply` 把 `manifest.manifest_hash` 作 `produced_from` 传 `applySyncCheckResult`。
- **`runRegenerateCommand`**(轮次分支见 Task 6.1 注):`buildRegenerateRound1Tasks` / `applyRound1AndBuildRound2` 抛 `RegenOutputError`(metadata-only role / extract-facts 空)→ 写 `.partial` + `return LB_EXIT_PARTIAL_SUCCESS`。

commander 注册三子命令对应 `--apply` / `--api` flag。

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `pnpm vitest run tests/cli/legacy-bridge/`
Expected: 新用例 PASS;既有 `tests/cli/legacy-bridge/` 用例仍 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/cli/commands/legacy-bridge.ts tests/cli/legacy-bridge/dualpath.test.ts
git commit -m "feat(legacy-bridge): index/regenerate/sync-check 三子命令双路径接线"
```

### Task 6.3:archive 集成 —— emit sync-check manifest + `--api` + `--resume`

**Files:**
- Modify: `src/cli/commands/archive.ts`
- Test: `tests/cli/legacy-bridge/archive-dualpath.test.ts`

`runArchivePreflight`(`archive.ts:702` 调 `runSyncCheck`)与 `runArchivePostHook`(`archive.ts:786`)改为:agent 模式 emit sync-check manifest(分别带 `gate_context: archive-preflight` / `archive-posthook`);`--api` 模式走 `ApiRunner` 内联。preflight 在 enforce_sync=true 时写暂停态文件并 halt。

- [ ] **Step 1: 写失败测试**

```ts
// tests/cli/legacy-bridge/archive-dualpath.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitPreflightSyncCheck, emitPostHookSyncCheck } from '../../../src/cli/commands/archive.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arc-'));
  await mkdir(join(dir, 'forge', 'changes', 'add-pay', 'specs'), { recursive: true });
  await mkdir(join(dir, 'docs'), { recursive: true });
  // anchor 用绝对路径 → readAnchorFile 不依赖 cwd;modules 与 change specs/<area> 对齐才有 affected anchor
  await writeFile(join(dir, 'docs', 'SRS.md'), '# SRS\n支付幂等性约束。', 'utf8');
  await writeFile(join(dir, 'forge', 'changes', 'add-pay', 'proposal.md'), '# add payment', 'utf8');
  await writeFile(join(dir, 'forge', 'changes', 'add-pay', 'specs', 'payment.md'), '# payment', 'utf8');
  await writeFile(join(dir, 'forge', 'config.yaml'),
    'legacy_bridge:\n  allow_llm_calls: true\n  enforce_sync: true\n', 'utf8');
  const srsPath = join(dir, 'docs', 'SRS.md').replace(/\\/g, '/');
  await writeFile(join(dir, 'forge', 'legacy-anchors.yaml'),
    `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: ${JSON.stringify(srsPath)}\n    authoritative: true\n    modules: [payment]\n`, 'utf8');
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('emitPreflightSyncCheck(enforce_sync=true)', () => {
  it('agent 模式 emit sync-check manifest(gate_context=archive-preflight)+ 暂停态文件', async () => {
    const r = await emitPreflightSyncCheck(join(dir, 'forge'), 'add-pay');
    expect(r.kind).toBe('halted-for-fulfillment');
    expect(existsSync(join(dir, 'forge', '.cache', 'legacy-bridge-task-sync-check.json'))).toBe(true);
    expect(existsSync(join(dir, 'forge', '.cache', 'archive-pause-add-pay.json'))).toBe(true);
  });
});

describe('emitPostHookSyncCheck(enforce_sync=false)', () => {
  it('post-archive emit posthook manifest,不写暂停态文件', async () => {
    const forgeRoot = join(dir, 'forge');
    // posthook 从已归档位置取 change context
    const today = new Date().toISOString().slice(0, 10);
    await mkdir(join(forgeRoot, 'changes', 'archive', `${today}-add-pay`, 'specs'), { recursive: true });
    await writeFile(join(forgeRoot, 'changes', 'archive', `${today}-add-pay`, 'proposal.md'), '# add payment', 'utf8');
    await writeFile(join(forgeRoot, 'changes', 'archive', `${today}-add-pay`, 'specs', 'payment.md'), '# payment', 'utf8');
    const r = await emitPostHookSyncCheck(forgeRoot, 'add-pay');
    expect(r.kind).toBe('emitted');
    expect(existsSync(join(forgeRoot, '.cache', 'legacy-bridge-task-sync-check.json'))).toBe(true);
    expect(existsSync(join(forgeRoot, '.cache', 'archive-pause-add-pay.json'))).toBe(false); // posthook 无暂停态
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/cli/legacy-bridge/archive-dualpath.test.ts`
Expected: FAIL —— `emitPreflightSyncCheck is not a function`

- [ ] **Step 3: 在 `archive.ts` 实现 emit(preflight + posthook)+ 暂停态**

把 `runArchivePreflight`(`archive.ts:655-747`)与 `runArchivePostHook`(`archive.ts:749-810`)的「`new Anthropic` + `runSyncCheck`」段,分别替换为调 `emitPreflightSyncCheck` / `emitPostHookSyncCheck`;`--api` 模式两者都走 `ApiRunner` 内联 + `applySyncCheckResult`。两个 emit 函数共用一个抽出的 context 拼装函数:

```ts
import { buildSyncCheckTask } from '../../core/legacy-bridge/sync-check.js';
import { applySyncCheckResult } from '../../core/legacy-bridge/sync-check.js';
import { AgentHandoffRunner } from '../../core/legacy-bridge/runners.js';
import type { SyncCheckInput } from '../../core/legacy-bridge/sync-check.js';

/** 抽出:合并现 archive.ts:678-692(preflight)与 :765-777(posthook)两处重复的 change context 拼装。
 *  archived=false → forge/changes/<id>/;archived=true → forge/changes/archive/<date>-<id>/。
 *  调用方需已确认 anchors 存在(preflight/posthook 的 gate 检查在调用前)。 */
async function buildSyncCheckChangeContext(
  forgeRoot: string,
  changeId: string,
  opts: { archived: boolean },
): Promise<SyncCheckInput> {
  const config = parseYaml(await readFile(join(forgeRoot, 'config.yaml'), 'utf8')) as ForgeConfig;
  const anchors = await loadAnchorsFile(forgeRoot);
  const changesDir = opts.archived
    ? join(forgeRoot, 'changes', 'archive', `${new Date().toISOString().slice(0, 10)}-${changeId}`)
    : join(forgeRoot, 'changes', changeId);
  let changeContext = '';
  const affectedModules: string[] = [];
  if (existsSync(join(changesDir, 'proposal.md'))) {
    changeContext += await readFile(join(changesDir, 'proposal.md'), 'utf8');
  }
  const specsDir = join(changesDir, 'specs');
  if (existsSync(specsDir)) {
    for (const f of await readdir(specsDir)) {
      changeContext += `\n## specs/${f}\n${await readFile(join(specsDir, f), 'utf8')}`;
      affectedModules.push(f.replace(/\.md$/, ''));
    }
  }
  return {
    changeId, changeContext, affectedModules,
    anchors: anchors ?? { schema: 'forge-legacy-anchor/v1', anchors: [] },
    autoResolveCrossAnchor: config.legacy_bridge?.auto_resolve_cross_anchor ?? false,
    mtimeOf: (p) => { try { return Math.floor(statSync(p).mtimeMs / 1000); } catch { return 0; } },
  };
}

/** agent 模式:emit preflight sync-check manifest + 暂停态文件,halt archive */
export async function emitPreflightSyncCheck(
  forgeRoot: string,
  changeId: string,
): Promise<{ kind: 'halted-for-fulfillment' | 'skip' }> {
  const ctx = await buildSyncCheckChangeContext(forgeRoot, changeId, { archived: false });
  const task = await buildSyncCheckTask(ctx, async (p) => (await readAnchorFile(p)).text);
  if (!task) return { kind: 'skip' }; // 无 affected anchor / 全部读取失败
  const manifest = await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit(
    'sync-check', 1, [task], { gate_context: 'archive-preflight', change_id: changeId },
  );
  await mkdir(join(forgeRoot, '.cache'), { recursive: true });
  await writeFile(
    join(forgeRoot, '.cache', `archive-pause-${changeId}.json`),
    JSON.stringify({ change_id: changeId, paused_step: 'preflight-sync-check', manifest_hash: manifest.manifest_hash }, null, 2),
    'utf8',
  );
  return { kind: 'halted-for-fulfillment' };
}

/** agent 模式:enforce_sync=false 时 post-archive emit sync-check manifest(非阻塞,无暂停态) */
export async function emitPostHookSyncCheck(
  forgeRoot: string,
  changeId: string,
): Promise<{ kind: 'emitted' | 'skip' }> {
  const ctx = await buildSyncCheckChangeContext(forgeRoot, changeId, { archived: true });
  const task = await buildSyncCheckTask(ctx, async (p) => (await readAnchorFile(p)).text);
  if (!task) return { kind: 'skip' };
  await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit(
    'sync-check', 1, [task], { gate_context: 'archive-posthook', change_id: changeId },
  );
  return { kind: 'emitted' }; // 非阻塞:archive 已完成;fulfill 后跑 sync-check --apply 出报告
}
```

`--resume` 见 Task 6.4。preflight/posthook 的 opt-in gate(`allow_llm_calls` / `enforce_sync` / anchors 存在性)沿用现 `runArchivePreflight`/`runArchivePostHook` 的前置检查,在调 emit 函数前。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/cli/legacy-bridge/archive-dualpath.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/cli/commands/archive.ts tests/cli/legacy-bridge/archive-dualpath.test.ts
git commit -m "feat(archive): sync-check 改 emit manifest(preflight + posthook)+ 暂停态文件"
```

### Task 6.4:`forge archive --resume` 的 gate 复核

**Files:**
- Modify: `src/cli/commands/archive.ts`
- Test: `tests/cli/legacy-bridge/archive-dualpath.test.ts`(追加)

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 archive-dualpath.test.ts
import { resumeArchiveGateCheck } from '../../../src/cli/commands/archive.js';

describe('resumeArchiveGateCheck', () => {
  it('produced_from 不匹配暂停态 → 拒绝 resume', async () => {
    const forgeRoot = join(dir, 'forge');
    await mkdir(join(forgeRoot, '.cache'), { recursive: true });
    await writeFile(join(forgeRoot, '.cache', 'archive-pause-add-pay.json'),
      JSON.stringify({ change_id: 'add-pay', manifest_hash: 'EXPECTED' }), 'utf8');
    await mkdir(join(forgeRoot, 'legacy-sync-state'), { recursive: true });
    await writeFile(join(forgeRoot, 'legacy-sync-state', 'add-pay.yaml'),
      'schema: forge-legacy-sync/v1\nchange_id: add-pay\nproduced_from: WRONG\ndiffs: []\n', 'utf8');
    const r = await resumeArchiveGateCheck(forgeRoot, 'add-pay');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/produced_from/);
  });

  it('produced_from 匹配 + 无 critical pending → 放行', async () => {
    const forgeRoot = join(dir, 'forge');
    await mkdir(join(forgeRoot, '.cache'), { recursive: true });
    await writeFile(join(forgeRoot, '.cache', 'archive-pause-add-pay.json'),
      JSON.stringify({ change_id: 'add-pay', manifest_hash: 'H1' }), 'utf8');
    await mkdir(join(forgeRoot, 'legacy-sync-state'), { recursive: true });
    await writeFile(join(forgeRoot, 'legacy-sync-state', 'add-pay.yaml'),
      'schema: forge-legacy-sync/v1\nchange_id: add-pay\nproduced_from: H1\ndiffs: []\n', 'utf8');
    const r = await resumeArchiveGateCheck(forgeRoot, 'add-pay');
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/cli/legacy-bridge/archive-dualpath.test.ts -t resumeArchiveGateCheck`
Expected: FAIL —— `resumeArchiveGateCheck is not a function`

- [ ] **Step 3: 在 `archive.ts` 实现 `resumeArchiveGateCheck`**

```ts
import { hasCriticalPending } from '../../core/legacy-bridge/diff-report.js';
import type { SyncStateFile } from '../../core/legacy-bridge/types.js';

/** --resume 的 gate 复核:产物绑定 + critical 幂等重评 */
export async function resumeArchiveGateCheck(
  forgeRoot: string,
  changeId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const pausePath = join(forgeRoot, '.cache', `archive-pause-${changeId}.json`);
  if (!existsSync(pausePath)) return { ok: false, reason: `无暂停态文件 archive-pause-${changeId}.json` };
  const pause = JSON.parse(await readFile(pausePath, 'utf8')) as { manifest_hash: string };
  const statePath = join(forgeRoot, 'legacy-sync-state', `${changeId}.yaml`);
  if (!existsSync(statePath)) return { ok: false, reason: `sync-state 缺失;请先 fulfill manifest 跑 sync-check --apply` };
  const state = parseYaml(await readFile(statePath, 'utf8')) as SyncStateFile;
  // ① 产物绑定:sync-state 必须由本次 preflight 的 manifest 产生
  if (state.produced_from !== pause.manifest_hash) {
    return { ok: false, reason: `produced_from(${state.produced_from})≠ 暂停态 manifest_hash(${pause.manifest_hash});sync-state 非本次 --apply 产物` };
  }
  // ② critical 幂等重评
  if (hasCriticalPending(state)) {
    return { ok: false, reason: `仍有 critical 差异未 resolve;跑 forge legacy-bridge resolve ${changeId}` };
  }
  return { ok: true };
}
```

`--resume` 的 action:`resumeArchiveGateCheck` 返回 `ok:false` → `console.error` + `process.exit(LB_EXIT_BUSINESS_RULE_FAIL)`(2);`ok:true` → 清暂停态文件 + 续跑 archive 余下步骤。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/cli/legacy-bridge/archive-dualpath.test.ts`
Expected: PASS

- [ ] **Step 5: Phase 6 收尾 —— typecheck + 全测 + 提交**

```bash
pnpm typecheck && pnpm test
git add src/cli/commands/archive.ts tests/cli/legacy-bridge/archive-dualpath.test.ts
git commit -m "feat(archive): --resume 的 gate 复核(produced_from 绑定 + critical 幂等重评)"
```

Expected: typecheck 0 error;`pnpm test` 全 PASS。

---

## Phase 7:skill + `commands/archive.md` + 文档 + 默认翻转收尾

### Task 7.1:新增 `legacy-bridge-fulfillment` skill

**Files:**
- Create: `skills/legacy-bridge-fulfillment/SKILL.md`

- [ ] **Step 1: 写 SKILL.md**

```markdown
---
name: legacy-bridge-fulfillment
description: Use when a forge legacy-bridge or forge archive command emits a Task manifest (forge/.cache/legacy-bridge-task-<op>.json) that needs agent fulfillment - reads the manifest, performs the LLM op, writes results, runs --apply.
---

# Fulfilling legacy-bridge Task Manifests

当 `forge legacy-bridge <op>`(默认 agent 模式)或 `forge archive` emit 了一个 manifest,按此 skill fulfill。

## 流程

1. 读 `forge/.cache/legacy-bridge-task-<op>.json`。
2. 对 `tasks[]` 里每个 task:按 `task.prompt` 做判定 —— `sync-check` / `regenerate` 必须**真读对应代码 / 文档**做判断,不许凭空产出。
3. 产物必须匹配 `task.outputSchema`,写成 `{ "text": "<你的结果>" }` 到 `task.outputPath`。
4. 跑 `forge legacy-bridge <op> --apply`(archive 场景跑 `forge legacy-bridge sync-check --apply` 后 `forge archive --resume`)。

## 反偷懒约束(硬性)

- **不许伪造判定**:`sync-check` 的「无差异」、`quality-judge` 的「fact preserved」必须基于真实比对。空结果要有依据。
- **不许改 manifest**:只往 `outputPath` 写;manifest 被改 → `--apply` 的 `manifest_hash` 校验会失败。
- 高保证场景(CI / 合规)用 `--api` 模式 —— CLI 直连 API,不经 agent。
```

- [ ] **Step 2: 跑 build 同步模板**

Run: `pnpm build`
Expected: `copy-templates.mjs` 把新 skill 同步进 `src/core/templates/` 与 `dist/core/templates/`(legacy 模板 frontmatter `name:` 会被加 `forge:` 前缀)。

- [ ] **Step 3: 提交**

```bash
git add skills/legacy-bridge-fulfillment/ src/core/templates/ dist/core/templates/
git commit -m "feat(legacy-bridge): 加 legacy-bridge-fulfillment skill(agent-driver 契约)"
```

### Task 7.2:`commands/archive.md` 加 sync-check 编排步

**Files:**
- Modify: `commands/archive.md`

- [ ] **Step 1: 加编排步**

在 `commands/archive.md` 的 archive 流程里,preflight 之后加一步:

```markdown
### 步骤 X:sync-check manifest fulfillment(若有)

跑 `forge archive` 后,若输出提示 emit 了 sync-check manifest
(`forge/.cache/legacy-bridge-task-sync-check.json` 存在):

1. 按 `legacy-bridge-fulfillment` skill fulfill 该 manifest。
2. 跑 `forge legacy-bridge sync-check --apply`。
3. 跑 `forge archive --resume`:
   - exit 2 → archive 被 critical 差异阻塞,先 `forge legacy-bridge resolve <change-id>`。
   - exit 0 → archive 续跑完成。

`enforce_sync=false` 时此步非阻塞;`enforce_sync=true` 时是硬 gate。
```

- [ ] **Step 2: 跑 build 同步**

Run: `pnpm build`
Expected: `commands/archive.md` 同步进双模板源。

- [ ] **Step 3: 提交**

```bash
git add commands/archive.md src/core/templates/ dist/core/templates/
git commit -m "docs(archive): commands/archive.md 加 sync-check manifest 编排步"
```

### Task 7.3:`docs/legacy-bridge.md` + `CHANGELOG.md`

**Files:**
- Modify: `docs/legacy-bridge.md`、`CHANGELOG.md`

- [ ] **Step 1: 更新 `docs/legacy-bridge.md`**

在工作流章节加「双路径」说明:四命令默认 agent 模式(emit manifest → fulfill → `--apply`),`--api` 切回进程内 SDK 调用。标注 breaking:`forge legacy-bridge map` 等默认行为变更。

- [ ] **Step 2: 更新 `CHANGELOG.md`**

`Unreleased` 段加:

```markdown
### Changed
- **BREAKING** `forge legacy-bridge` 的 map/index/regenerate/sync-check 四命令默认改为 agent 模式(emit Task manifest,需 fulfill 后跑 `--apply`)。`--api` flag 切回原进程内 SDK 行为。详见 docs/specs/2026-05-18-legacy-bridge-dual-path-exec-design.md。
```

- [ ] **Step 3: Phase 7 收尾 —— 全量验证 + 提交**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm build && pnpm test
git add docs/legacy-bridge.md CHANGELOG.md
git commit -m "docs(legacy-bridge): 双路径执行模型文档 + CHANGELOG breaking note"
```

Expected: CI 五步(lint → format:check → typecheck → build → test)本地全过。

---

## 收尾验证

全部 Phase 完成后,最终验证(对齐 CI):

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

逐项确认 spec §7 测试策略覆盖:
- 命令 prep → `*-dualpath.test.ts` 断言 manifest 内容 ✓(Task 2.1 / 3.1 / 4.1 / 5.1)
- `--apply` → fixture 结果 + `manifest_hash` 篡改用例 ✓(Task 1.2 / 6.1)
- `ApiRunner` mock ✓(Task 1.3)
- regenerate 2 轮 ✓(Task 5.2 / 5.3 / 6.2)
- sync-check × archive(裸 CLI halt / `--resume` 拒绝)✓(Task 6.3 / 6.4)

---

## 附录:Codex 对抗性审查处置

### Round 1:5 MEDIUM,均独立对照代码核实为真,全处置

| #  | severity | 核实结论                                                                                              | 处置                                                                                          |
| -- | -------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| F1 | MEDIUM   | 真 —— `stratifiedSample(input: SamplingInput)`、`allFacts: KeyFact[]`;plan Task 5.2 传 `string[]` 编译不过 | Task 5.1 extract-facts prompt 改产 `{text,section,critical}`;Task 5.2 解析为 `KeyFact[]`、传 `{allFacts}` |
| F2 | MEDIUM   | 真 —— `judgeAllFacts` 用三态 + critical 必须 100%;plan `applyRound2` 用 boolean 比例,静默砍 critical 保护 | Task 5.3 重写:抽 `computeQualityResult`(含 critical gate),`applyRound2` 用三态 + 复用它      |
| F3 | MEDIUM   | 真 —— Task 6.1 测试 fixture 未建 config/ack,`runMapCommand` 经 `assertLlmOptIn` 必失败                  | Task 6.1 `beforeEach` 加 `config.yaml` + `writeAck` 写匹配 ack                                |
| F4 | MEDIUM   | 真 —— spec 提「Tier2/3 archive skill」,但 `forge-repo/skills/` 下无此 skill                            | Phase 0 加注:无独立 archive skill,`legacy-bridge-fulfillment`(tier-agnostic)覆盖 Tier2/3   |
| F5 | MEDIUM   | 真 —— spec D3/§2.2 要 `AgentHandoffRunner` 类,plan 只有散函数                                          | Task 1.3 加 `AgentHandoffRunner` 类;Phase 0 / Task 6.1 同步                                   |

### Round 2:1 HIGH + 1 MEDIUM + 1 LOW,均独立对照代码核实为真,全处置

| #  | severity | 核实结论                                                                                              | 处置                                                                                          |
| -- | -------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| F6 | HIGH     | 真 —— `computeQualityResult` 遇空 `judged` → `criticalRate=totalRate=1.0` → `passed=true`;extract-facts 失败时质量 gate 反判「完美」 | Task 5.2:`facts.length===0` 抛 `RegenOutputError`,regenerate `--apply` 转 `.partial`,不走「空抽样=passed」 |
| F7 | MEDIUM   | 真 —— `buildSyncCheckTask` 在 anchor 全部读取失败时 `blocks` 空,仍 return 只含 changeContext 的空 task | Task 4.1:catch 加 `console.warn`;循环后 `if (blocks.length===0) return null`               |
| F8 | LOW      | 真 —— Phase 0 写 `buildRegenerateTask`/`applyRegenerateRound1`,与实际任务名不符                        | Phase 0 regenerator.ts / quality-judge.ts 两行更正为实际函数名                                |

### Round 3:2 MEDIUM,均独立对照代码核实为真,全处置

| #   | severity | 核实结论                                                                                              | 处置                                                                                          |
| --- | -------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| F9  | MEDIUM   | 真 —— Task 6.1 `runMapCommand` 的 `--apply`/`--api` 调 `applyMapResult` 未传 `existing`,merge 模式退化成 overwrite、丢用户已审 anchors | Task 6.1 两分支加 `loadAnchorsFile` 载 `existing`、传 `applyMapResult`                         |
| F10 | MEDIUM   | 真 —— `buildIndexTask` / `buildSyncCheckTask` 可返回 `null` task,Task 6.2 未定义 CLI 在 `task===null` 时的分支 | Task 6.2 Step 3 显式定义 index / sync-check 的 `task===null` 分支(直接渲染 / 跳过,不 emit) |

### Round 4:1 MEDIUM,独立对照核实为真,全处置(顺带修两处自查发现的关联问题)

| #   | severity | 核实结论                                                                                              | 处置                                                                                          |
| --- | -------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| F11 | MEDIUM   | 真 —— Task 6.3 intro 称 preflight/posthook 都改造,但 Step 1/3 只实现 `emitPreflightSyncCheck`,`archive-posthook` emit 路径缺失 | Task 6.3 加 `emitPostHookSyncCheck` 实现 + 测试;抽 `buildSyncCheckChangeContext` 共用(`archived` 参数) |
| 关联 | —        | 自查:Task 6.3 测试 fixture 缺 `specs/` 与锚点文件,preflight 测试跑不出 `halted-for-fulfillment`;`emitPreflight` 未用 `AgentHandoffRunner` | fixture 补 `specs/payment.md` + 绝对路径锚点;`emitPreflight` 改用 `AgentHandoffRunner`(与 Task 6.1 一致) |

### Round 5:0 HIGH + 0 MEDIUM —— **收敛**

第 4 轮的 F11 + 2 处关联问题均已落地,本轮未发现新 HIGH/MEDIUM。

**收敛声明**:实施计划经 5 轮 Codex 对抗性审查,finding 趋势 **5 → 3 → 2 → 1 → 0**,单调收敛。自本轮起视为收敛,可进入实施(`subagent-driven-development` / `executing-plans`)。
