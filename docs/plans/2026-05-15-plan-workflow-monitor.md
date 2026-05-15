# Forge 工作流监控观察者(workflow-monitor)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 forge 工作流加一套低耦合、可经 `config.yaml` 开关的旁路监控观察者 —— 记录每阶段状态与动作选择,与 OpenSpec/superpowers 静态差异映射表对比做回归探测,产出报告。

**Architecture:** 旁路观察者。对 forge 现有代码只改 2 处(`src/cli/index.ts` 加 `process.on('exit')` 处理器、`hooks/session-start` 加条件分支),其余纯新增 `src/core/monitor/` 模块 + `forge monitor` CLI 子命令 + 两个 `hooks/` 运行时文件。监控关闭时只做一次廉价 config 探测即返回,零持久副作用。

**Tech Stack:** TypeScript + Node ≥ 20.19 + ESM + commander + `yaml` 包 + vitest;包管理 pnpm。

**权威 spec:** [`docs/specs/2026-05-15-workflow-monitor-design.md`](../specs/2026-05-15-workflow-monitor-design.md) v6(commit `e52d632`)。本计划逐节落地该 spec。

**通用约定(每个任务都适用):**

- 测试目录 `tests/core/monitor/`;单文件跑测试:`pnpm vitest run tests/core/monitor/<file>.test.ts`。
- 每个任务最后一步 commit;当前分支 `dev`,提交信息中文。
- 本计划**不改** `skills/` 与 `commands/`,故不触发 `copy-templates.mjs` 模板双源同步。`src/` 下代码照常受 `pnpm build` / `pnpm lint` / `pnpm typecheck` 约束。
- 所有新增 `src/core/monitor/*.ts` 用 ESM `.js` 扩展名导入(forge 全仓 `module: NodeNext`)。

---

## Task 1: 类型定义 + config schema 字段

**Files:**
- Create: `src/core/monitor/types.ts`
- Modify: `src/core/schema/types.ts`(`ForgeConfig` 接口加 `monitor` 字段)

- [ ] **Step 1: 创建 `src/core/monitor/types.ts`**

```typescript
// src/core/monitor/types.ts — workflow-monitor 全模块共享类型(spec §3.2 / §6 / §10)

/** 受监控的工作阶段;主流程 6 步 + explore 可进三方对比,forge 专属命令仅 CLI 层 */
export type MonitorStage =
  | 'brainstorm'
  | 'propose'
  | 'apply'
  | 'review'
  | 'verify'
  | 'archive'
  | 'explore'
  | 'ack-confirm'
  | 'upgrade'
  | 'codex-adversarial'
  | 'unknown';

/** 可与 OpenSpec/superpowers 三方对比的阶段(spec §1.3:forge 专属命令不进对比) */
export const COMPARABLE_STAGES: MonitorStage[] = [
  'brainstorm',
  'propose',
  'apply',
  'review',
  'verify',
  'archive',
  'explore',
];

export type TraceLayer = 'cli' | 'ai';

/** trace.jsonl 里的一条事件(spec §3.2) */
export interface TraceEvent {
  ts: string; // ISO 8601 UTC
  schema: 'forge-monitor-trace/v1';
  change_id: string; // 真实 change-id 或 '_session-<uuid>'
  stage: MonitorStage;
  layer: TraceLayer;
  event: string;
  data: Record<string, unknown>;
}

/** cli-exits.jsonl 里的一条记录(spec §4 约束 6) */
export interface CliExitRecord {
  ts: string;
  command: string[];
  cwd: string;
  exit_code: number;
}

/** 差异映射表里的一个对比场景(spec §6.2) */
export interface DivergenceScenario {
  stage: MonitorStage;
  scenario_id: string;
  desc: string;
  openspec: string;
  superpowers: string;
  forge: string;
  rationale: string;
  regression_signal: string;
}

/** 差异映射表(spec §6.1;数据以 TS const 形式存在,非独立 yaml) */
export interface DivergenceMap {
  meta: {
    schema: 'forge-monitor-divergence-map/v1';
    synced_against: { openspec: string; superpowers: string };
    synced_at: string; // YYYY-MM-DD
  };
  scenarios: DivergenceScenario[];
}

/** 健康裁决等级(spec §10) */
export type VerdictLevel = 'ok' | 'regression' | 'anomaly';

/** 健康裁决里的一条命中项 */
export interface VerdictItem {
  kind: 'regression' | 'anomaly';
  stage: MonitorStage;
  detail: string;
  evidence: string;
}

export interface HealthVerdict {
  level: VerdictLevel;
  items: VerdictItem[];
}
```

- [ ] **Step 2: 给 `ForgeConfig` 加 `monitor` 字段**

修改 `src/core/schema/types.ts`,在 `ForgeConfig` 接口里(`stage_extensions?` 字段之后、接口闭合 `}` 之前)加入:

```typescript
  /**
   * workflow-monitor 开关(spec §3.1)。
   * 缺失或 `enabled` 缺失时,调用方一律视为 false(监控关闭)。
   * 读取走 monitor/config.ts#isMonitorEnabled;写入走 setMonitorEnabled。
   */
  monitor?: {
    enabled?: boolean;
  };
```

- [ ] **Step 3: typecheck 验证**

Run: `pnpm typecheck`
Expected: PASS,无报错(纯类型新增,不影响现有代码)。

- [ ] **Step 4: Commit**

```bash
git add src/core/monitor/types.ts src/core/schema/types.ts
git commit -m "feat(monitor): 加 workflow-monitor 共享类型与 config.monitor 字段"
```

---

## Task 2: config 读写 — `isMonitorEnabled` / `setMonitorEnabled`

**Files:**
- Create: `src/core/monitor/config.ts`
- Test: `tests/core/monitor/config.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/core/monitor/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMonitorEnabled, setMonitorEnabled } from '../../../src/core/monitor/config.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-cfg-'));
  mkdirSync(join(root, 'forge'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeConfig(text: string): void {
  writeFileSync(join(root, 'forge', 'config.yaml'), text, 'utf8');
}

describe('isMonitorEnabled', () => {
  it('config 缺失 → false', () => {
    expect(isMonitorEnabled(root)).toBe(false);
  });
  it('缺 monitor 段 → false', () => {
    writeConfig('schema: forge-spec-driven/v1\n');
    expect(isMonitorEnabled(root)).toBe(false);
  });
  it('monitor.enabled: true → true', () => {
    writeConfig('schema: forge-spec-driven/v1\nmonitor:\n  enabled: true\n');
    expect(isMonitorEnabled(root)).toBe(true);
  });
  it('monitor.enabled: false → false', () => {
    writeConfig('schema: forge-spec-driven/v1\nmonitor:\n  enabled: false\n');
    expect(isMonitorEnabled(root)).toBe(false);
  });
  it('config 损坏 → false,不抛', () => {
    writeConfig(': : : 不是合法 yaml : :\n');
    expect(isMonitorEnabled(root)).toBe(false);
  });
});

describe('setMonitorEnabled', () => {
  it('写入嵌套 monitor.enabled,且保留其它字段值', () => {
    writeConfig('schema: forge-spec-driven/v1\ncontext: 我的项目\n');
    setMonitorEnabled(root, true);
    const txt = readFileSync(join(root, 'forge', 'config.yaml'), 'utf8');
    expect(txt).toMatch(/monitor:/);
    expect(txt).toMatch(/enabled: true/);
    expect(txt).toMatch(/context: 我的项目/);
    expect(isMonitorEnabled(root)).toBe(true);
  });
  it('config 不存在 → 报错提示 forge init', () => {
    expect(() => setMonitorEnabled(root, true)).toThrow(/forge init/);
  });
  it('config 损坏 → 报错 abort,不覆盖', () => {
    writeConfig(': : 损坏 : :\n');
    expect(() => setMonitorEnabled(root, true)).toThrow(/解析失败/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/core/monitor/config.test.ts`
Expected: FAIL —— `Cannot find module '.../monitor/config.js'`。

- [ ] **Step 3: 实现 `src/core/monitor/config.ts`**

```typescript
// src/core/monitor/config.ts — monitor 开关读写(spec §3.1)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as stringifyYAML } from 'yaml';
import { parseConfig } from '../parse/index.js';
import type { ForgeConfig } from '../schema/index.js';

/** forge/config.yaml 的绝对路径(cwd=项目根约定,对齐 config 命令,spec §9 G-9) */
export function monitorConfigPath(projectRoot: string): string {
  return join(projectRoot, 'forge', 'config.yaml');
}

/**
 * 读路径:任何异常(缺失 / 损坏 / 缺段)一律返回 false,绝不抛(spec §3.1)。
 * 同步实现 —— exit 处理器与 CLI 子命令都可调。
 */
export function isMonitorEnabled(projectRoot: string): boolean {
  try {
    const path = monitorConfigPath(projectRoot);
    if (!existsSync(path)) return false;
    const config = parseConfig(readFileSync(path, 'utf8'));
    return config.monitor?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * 写路径:fail-fast(spec §3.1 G-8)。
 * - config 不存在 → 报错提示先 forge init(不自行造 config)。
 * - config 损坏 → 报错 abort(不静默覆盖损坏文件)。
 * 正常路径 read-modify-write,保留其它字段值(注释/格式不保留,与 `forge config set` 一致)。
 */
export function setMonitorEnabled(projectRoot: string, enabled: boolean): void {
  const path = monitorConfigPath(projectRoot);
  if (!existsSync(path)) {
    throw new Error(`forge/config.yaml 不存在(${path})—— 先跑 \`forge init\` 初始化项目`);
  }
  let config: ForgeConfig;
  try {
    config = parseConfig(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`forge/config.yaml 解析失败,拒绝覆盖:${(err as Error).message}`);
  }
  config.monitor = { enabled };
  writeFileSync(path, stringifyYAML(config), 'utf8');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/core/monitor/config.test.ts`
Expected: PASS(8 个 test 全绿)。

- [ ] **Step 5: Commit**

```bash
git add src/core/monitor/config.ts tests/core/monitor/config.test.ts
git commit -m "feat(monitor): config 读写 isMonitorEnabled/setMonitorEnabled"
```

---

## Task 3: trace 存储 — `appendTraceEvent` / `readTrace` / `recordCliExit`

**Files:**
- Create: `src/core/monitor/trace-store.ts`
- Test: `tests/core/monitor/trace-store.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/core/monitor/trace-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendTraceEvent,
  readTrace,
  recordCliExit,
  traceFilePath,
  cliExitsPath,
} from '../../../src/core/monitor/trace-store.js';
import type { TraceEvent } from '../../../src/core/monitor/types.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-trace-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function ev(over: Partial<TraceEvent> = {}): TraceEvent {
  return {
    ts: '2026-05-15T00:00:00.000Z',
    schema: 'forge-monitor-trace/v1',
    change_id: '2026-05-15-x',
    stage: 'verify',
    layer: 'ai',
    event: 'stage_enter',
    data: {},
    ...over,
  };
}

describe('appendTraceEvent / readTrace', () => {
  it('首次 append 自建目录,readTrace 读回', () => {
    appendTraceEvent(root, ev({ event: 'stage_enter' }));
    appendTraceEvent(root, ev({ event: 'stage_exit' }));
    const { events, corruptLines } = readTrace(root, '2026-05-15-x');
    expect(events.map((e) => e.event)).toEqual(['stage_enter', 'stage_exit']);
    expect(corruptLines).toBe(0);
  });
  it('trace 不存在 → 空结果', () => {
    expect(readTrace(root, '无此 change')).toEqual({ events: [], corruptLines: 0 });
  });
  it('坏行被跳过并计数', () => {
    appendTraceEvent(root, ev());
    appendFileSync(traceFilePath(root, '2026-05-15-x'), '这不是 json\n', 'utf8');
    appendTraceEvent(root, ev({ event: 'stage_exit' }));
    const { events, corruptLines } = readTrace(root, '2026-05-15-x');
    expect(events).toHaveLength(2);
    expect(corruptLines).toBe(1);
  });
});

describe('recordCliExit', () => {
  it('首次写自建目录,追加 JSONL', () => {
    recordCliExit(root, { ts: '2026-05-15T00:00:00.000Z', command: ['verify'], cwd: root, exit_code: 0 });
    const txt = readFileSync(cliExitsPath(root), 'utf8').trim();
    expect(JSON.parse(txt)).toMatchObject({ command: ['verify'], exit_code: 0 });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/core/monitor/trace-store.test.ts`
Expected: FAIL —— `Cannot find module '.../monitor/trace-store.js'`。

- [ ] **Step 3: 实现 `src/core/monitor/trace-store.ts`**

```typescript
// src/core/monitor/trace-store.ts — append-only JSONL trace 存储(spec §3.2 / §5)
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { TraceEvent, CliExitRecord } from './types.js';

/** forge/.monitor/ 目录(spec §5) */
export function monitorDir(projectRoot: string): string {
  return join(projectRoot, 'forge', '.monitor');
}

/** 某 change 的 trace.jsonl 路径 */
export function traceFilePath(projectRoot: string, changeId: string): string {
  return join(monitorDir(projectRoot), changeId, 'trace.jsonl');
}

/** 项目级 cli-exits.jsonl 路径 */
export function cliExitsPath(projectRoot: string): string {
  return join(monitorDir(projectRoot), 'cli-exits.jsonl');
}

/** 追加一条 trace 事件;写入前先建目录(spec §4 G-10) */
export function appendTraceEvent(projectRoot: string, event: TraceEvent): void {
  const file = traceFilePath(projectRoot, event.change_id);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
}

/** 读某 change 的 trace;逐行解析,坏行跳过并计数 */
export function readTrace(
  projectRoot: string,
  changeId: string,
): { events: TraceEvent[]; corruptLines: number } {
  const file = traceFilePath(projectRoot, changeId);
  if (!existsSync(file)) return { events: [], corruptLines: 0 };
  const events: TraceEvent[] = [];
  let corruptLines = 0;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as TraceEvent);
    } catch {
      corruptLines++;
    }
  }
  return { events, corruptLines };
}

/** 追加一条 CLI exit 记录;写入前先建目录 */
export function recordCliExit(projectRoot: string, record: CliExitRecord): void {
  const file = cliExitsPath(projectRoot);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
}

/** 读项目级 cli-exits.jsonl;坏行跳过 */
export function readCliExits(projectRoot: string): CliExitRecord[] {
  const file = cliExitsPath(projectRoot);
  if (!existsSync(file)) return [];
  const out: CliExitRecord[] = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as CliExitRecord);
    } catch {
      /* 坏行跳过 */
    }
  }
  return out;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/core/monitor/trace-store.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/core/monitor/trace-store.ts tests/core/monitor/trace-store.test.ts
git commit -m "feat(monitor): append-only JSONL trace 存储"
```

---

## Task 4: exit 处理器 — `maybeRecordCliExit` + 接入 `src/cli/index.ts`

**Files:**
- Create: `src/core/monitor/exit-handler.ts`
- Modify: `src/cli/index.ts`(末尾注册 `process.on('exit')`)
- Test: `tests/core/monitor/exit-handler.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/core/monitor/exit-handler.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maybeRecordCliExit } from '../../../src/core/monitor/exit-handler.js';
import { readCliExits, cliExitsPath } from '../../../src/core/monitor/trace-store.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-exit-'));
  mkdirSync(join(root, 'forge'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function enable(): void {
  writeFileSync(join(root, 'forge', 'config.yaml'), 'schema: forge-spec-driven/v1\nmonitor:\n  enabled: true\n');
}

describe('maybeRecordCliExit', () => {
  it('监控关闭 → 不写文件', () => {
    maybeRecordCliExit(root, ['verify'], 0);
    expect(existsSync(cliExitsPath(root))).toBe(false);
  });
  it('监控开启 → 记录 exit', () => {
    enable();
    maybeRecordCliExit(root, ['verify', '2026-05-15-x'], 1);
    const recs = readCliExits(root);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.command).toEqual(['verify', '2026-05-15-x']); // ?. — noUncheckedIndexedAccess
    expect(recs[0]?.exit_code).toBe(1);
  });
  it('argv 以 monitor 开头 → 跳过自身,不记录', () => {
    enable();
    maybeRecordCliExit(root, ['monitor', 'report'], 0);
    expect(existsSync(cliExitsPath(root))).toBe(false);
  });
  it('内部异常被吞掉,绝不抛', () => {
    enable();
    // 传 undefined argv 模拟异常输入
    expect(() => maybeRecordCliExit(root, undefined as unknown as string[], 0)).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/core/monitor/exit-handler.test.ts`
Expected: FAIL —— `Cannot find module '.../monitor/exit-handler.js'`。

- [ ] **Step 3: 实现 `src/core/monitor/exit-handler.ts`**

```typescript
// src/core/monitor/exit-handler.ts — exit 处理器逻辑(spec §4)
import { isMonitorEnabled } from './config.js';
import { recordCliExit } from './trace-store.js';

/**
 * exit 处理器的可测逻辑:config 守卫 + 跳过自身 + 绝不抛(spec §4 约束 1/3/4)。
 * `process.on('exit')` 注册体只调本函数。
 */
export function maybeRecordCliExit(projectRoot: string, argv: string[], exitCode: number): void {
  try {
    if (!Array.isArray(argv)) return;
    if (argv[0] === 'monitor') return; // 跳过自身,避免噪声/递归
    if (!isMonitorEnabled(projectRoot)) return; // config 守卫:关闭即返回
    recordCliExit(projectRoot, {
      ts: new Date().toISOString(),
      command: argv,
      cwd: projectRoot,
      exit_code: exitCode,
    });
  } catch {
    // 绝不抛 —— 'exit' 处理器抛异常会污染进程退出
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/core/monitor/exit-handler.test.ts`
Expected: PASS。

- [ ] **Step 5: 在 `src/cli/index.ts` 注册 exit 处理器**

在 `src/cli/index.ts` 顶部 import 区(其它 import 之后)加:

```typescript
import { maybeRecordCliExit } from '../core/monitor/exit-handler.js';
```

在文件末尾 `program.parseAsync(...)` 调用**之前**加:

```typescript
// workflow-monitor:唯一的 CLI 侧埋点(spec §4)。config 守卫确保关闭时零行为。
process.on('exit', (code) => {
  maybeRecordCliExit(process.cwd(), process.argv.slice(2), code);
});
```

- [ ] **Step 6: typecheck + build 验证**

Run: `pnpm typecheck && pnpm build`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/core/monitor/exit-handler.ts tests/core/monitor/exit-handler.test.ts src/cli/index.ts
git commit -m "feat(monitor): exit 处理器接入 CLI 入口"
```

---

## Task 5: artifact-observer — 从 forge 产物反推 CLI 层事件

**Files:**
- Create: `src/core/monitor/artifact-observer.ts`
- Test: `tests/core/monitor/artifact-observer.test.ts`

- [ ] **Step 1: 确认 marker / archive_summary 文件位置**

Run: `grep -rn "verify-passed\|review-passed\|archive_summary\|changes/archive" src/cli/commands/archive.ts | head -30`
Expected: 确认 (a) marker 文件位于 `forge/changes/<change-id>/` 下、文件名形如 `.verify-passed` / `.review-passed` / `.verify-failed` / `.review-failed`;(b) archive 成功后 change 目录移到 **`forge/changes/archive/<YYYY-MM-DD>-<change-id>/`**(`transaction.ts:56` 给目录名加 `archiveDate-` 前缀),`archive_summary.yaml` 也写在那里。**实现 Step 4 时以此处实际路径为准 —— observer 不知道 archiveDate,须按正则反解目录名。**

- [ ] **Step 2: 写失败测试**

```typescript
// tests/core/monitor/artifact-observer.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeArtifacts } from '../../../src/core/monitor/artifact-observer.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-obs-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const HASH_A = 'sha256:' + 'a'.repeat(64);
const HASH_B = 'sha256:' + 'b'.repeat(64);

/** 写一个合法的 verify marker 到 active change 目录 */
function writeVerifyMarker(changeId: string, taskHash: string = HASH_A): void {
  const dir = join(root, 'forge', 'changes', changeId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, '.verify-passed'),
    [
      'schema: forge-verify/v1',
      'verified_at: 2026-05-15T01:00:00Z', // marker-schema ISO 正则不接受毫秒
      'verified_by: ai-agent',
      `tasks_hash: ${taskHash}`,
      `content_hash: ${HASH_B}`,
      'evidence: []',
    ].join('\n') + '\n',
    'utf8',
  );
}

describe('observeArtifacts', () => {
  it('无 change 目录 → 空事件', () => {
    expect(observeArtifacts(root, '无此 change')).toEqual([]);
  });

  it('合法 verify marker → marker_observed,含 hashes 与 ok=true', () => {
    writeVerifyMarker('2026-05-15-x');
    const events = observeArtifacts(root, '2026-05-15-x');
    const m = events.find((e) => e.event === 'marker_observed');
    expect(m).toBeDefined();
    expect(m?.layer).toBe('cli');
    expect(m?.stage).toBe('verify');
    expect(m?.data.marker_schema).toBe('forge-verify/v1');
    expect(m?.data.ok).toBe(true);
    expect((m?.data.hashes as Record<string, unknown>).tasks_hash).toBe(HASH_A);
    expect(m?.ts).toBe('2026-05-15T01:00:00Z'); // 事件 ts = marker 的 verified_at,非观察时刻
  });

  it('hash 格式非法的 marker → marker_observed 但 ok=false', () => {
    writeVerifyMarker('2026-05-15-bad', '非法hash');
    const events = observeArtifacts(root, '2026-05-15-bad');
    const m = events.find((e) => e.event === 'marker_observed');
    expect(m?.data.ok).toBe(false);
  });

  it('marker YAML 损坏 → record_error,不抛', () => {
    const dir = join(root, 'forge', 'changes', '2026-05-15-y');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.verify-passed'), '{ this is: [unclosed\n', 'utf8');
    const events = observeArtifacts(root, '2026-05-15-y');
    expect(events.some((e) => e.event === 'record_error')).toBe(true);
  });

  it('archive 目录有 archive_summary.yaml → fence_observed(archive 阶段)', () => {
    // archive 目录名带 <YYYY-MM-DD>- 前缀(transaction.ts:56);changeId 仍是 2026-05-15-z
    const adir = join(root, 'forge', 'changes', 'archive', '2026-05-16-2026-05-15-z');
    mkdirSync(adir, { recursive: true });
    writeFileSync(
      join(adir, 'archive_summary.yaml'),
      [
        'schema: forge-archive-summary/v1',
        'version: 1.0.0',
        'archived_at: 2026-05-15T02:00:00Z',
        'change_id: 2026-05-15-z',
        'verify_passed: { verified_invariants: [] }',
        'review_passed: { reviewers: [ai-agent] }',
        'process_evidence_summary: { placeholder: true }',
        'handoff_to_backlog: []',
        'acked_warnings: []',
        'pending_suggestions: []',
      ].join('\n') + '\n',
      'utf8',
    );
    const events = observeArtifacts(root, '2026-05-15-z');
    const f = events.find((e) => e.event === 'fence_observed');
    expect(f).toBeDefined();
    expect(f?.stage).toBe('archive');
    expect(f?.data.ok).toBe(true);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run tests/core/monitor/artifact-observer.test.ts`
Expected: FAIL —— `Cannot find module '.../monitor/artifact-observer.js'`。

- [ ] **Step 4: 实现 `src/core/monitor/artifact-observer.ts`**

```typescript
// src/core/monitor/artifact-observer.ts — 把 forge 常规产物反推成 CLI 层 trace 事件(spec §3 / §3.2)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYAML } from 'yaml';
import { parseMarker } from '../markers/parse.js';
import { validateMarkerSchema } from '../validate/marker-schema.js';
import { validateArchiveSummarySchema } from '../validate/archive-summary-schema.js';
import type { TraceEvent, MonitorStage } from './types.js';

/** marker 文件名 → 监控阶段(以 Step 1 确认的实际文件名为准) */
const MARKER_FILES: Record<string, MonitorStage> = {
  '.verify-passed': 'verify',
  '.verify-failed': 'verify',
  '.review-passed': 'review',
  '.review-failed': 'review',
};

function mkEvent(
  changeId: string,
  stage: MonitorStage,
  event: string,
  data: Record<string, unknown>,
  ts?: string,
): TraceEvent {
  return {
    // 优先用产物自带时间戳;缺失才回退观察时刻 —— 报告时间线才不乱序(Codex 计划审查第 4 轮 检查点 3)
    ts: ts ?? new Date().toISOString(),
    schema: 'forge-monitor-trace/v1',
    change_id: changeId,
    stage,
    layer: 'cli',
    event,
    data,
  };
}

/** 扫一个目录里的 4 个 marker 文件,产出 marker_observed / record_error 事件 */
function observeMarkers(dir: string, relBase: string, changeId: string): TraceEvent[] {
  const events: TraceEvent[] = [];
  for (const [fileName, stage] of Object.entries(MARKER_FILES)) {
    const markerPath = join(dir, fileName);
    if (!existsSync(markerPath)) continue;
    const relPath = join(relBase, fileName);
    try {
      const marker = parseMarker(readFileSync(markerPath, 'utf8'));
      // marker 是 union 类型;失败类 marker 无 hash 字段,转 record 安全取值
      const obj = marker as unknown as Record<string, unknown>;
      const validation = validateMarkerSchema(marker, markerPath);
      // 事件 ts 取 marker 自带时间戳(verify→verified_at / review→reviewed_at / failed→failed_at);
      // 报告「阶段时间线」按真实时序排序才有意义(Codex 计划审查第 4 轮 检查点 3)。
      // 用 typeof runtime guard 而非 as 断言 —— schema-invalid marker 的时间戳字段可能不是 string,
      // as 会让非 string 值漏进 TraceEvent.ts,致 Task 11 排序 localeCompare 崩溃(第 5 轮 Finding 1)
      const markerTs =
        typeof obj.verified_at === 'string'
          ? obj.verified_at
          : typeof obj.reviewed_at === 'string'
            ? obj.reviewed_at
            : typeof obj.failed_at === 'string'
              ? obj.failed_at
              : undefined;
      events.push(
        mkEvent(
          changeId,
          stage,
          'marker_observed',
          {
            marker_schema: marker.schema,
            path: relPath,
            hashes: { tasks_hash: obj.tasks_hash, content_hash: obj.content_hash },
            ok: validation.valid, // spec §3.2:ok = marker schema 校验是否通过
            observed_at: new Date().toISOString(), // observer 实际跑的时刻,与 ts 区分
          },
          markerTs,
        ),
      );
    } catch (err) {
      events.push(
        mkEvent(changeId, stage, 'record_error', { path: relPath, error: (err as Error).message }),
      );
    }
  }
  return events;
}

/**
 * 扫描某 change 的产物,反推 CLI 层事件(spec §3 / §3.2)。
 * 同时扫 active 目录 forge/changes/<id>/ 与 archive 目录 forge/changes/archive/<id>/
 * —— 产物是 forge 常规输出、与监控开关无关,故可回溯 enable 之前的阶段(spec §2.4)。
 * 单个产物解析失败不抛,产出一条 record_error 事件。
 */
export function observeArtifacts(projectRoot: string, changeId: string): TraceEvent[] {
  const events: TraceEvent[] = [];

  // 1. active change 目录的 marker
  const activeDir = join(projectRoot, 'forge', 'changes', changeId);
  if (existsSync(activeDir)) {
    events.push(...observeMarkers(activeDir, join('forge', 'changes', changeId), changeId));
  }

  // 2. archive 目录 —— archive 成功后 change 移到 forge/changes/archive/<YYYY-MM-DD>-<changeId>/
  //    (transaction.ts:56 给目录名加 archiveDate 前缀;monitor 不知 archiveDate,按正则反解;
  //     Codex 计划审查第 2 轮 F-2 / 新-1 / 新-3)
  const archiveRoot = join(projectRoot, 'forge', 'changes', 'archive');
  if (existsSync(archiveRoot)) {
    for (const entry of readdirSync(archiveRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // 目录名 = <YYYY-MM-DD>-<changeId>;剥一层日期前缀,余下须严格等于 changeId
      const m = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(entry.name);
      if (!m || m[1] !== changeId) continue;

      const archiveDir = join(archiveRoot, entry.name);
      const archiveRel = join('forge', 'changes', 'archive', entry.name);
      events.push(...observeMarkers(archiveDir, archiveRel, changeId));

      // archive_summary.yaml —— 三级 fence 的 archive 侧裁决产物(spec §3.2)
      const summaryPath = join(archiveDir, 'archive_summary.yaml');
      if (!existsSync(summaryPath)) continue;
      const summaryRel = join(archiveRel, 'archive_summary.yaml');
      try {
        const summary = parseYAML(readFileSync(summaryPath, 'utf8')) as unknown;
        // Codex 计划审查第 2 轮 新-2:用完整 schema 校验定 ok,而非浅守卫 looksLikeArchiveSummary
        const validation = validateArchiveSummarySchema(summary, summaryPath);
        const s = (summary ?? {}) as Record<string, unknown>;
        events.push(
          mkEvent(
            changeId,
            'archive',
            'fence_observed',
            {
              level: 'archive',
              ok: validation.valid,
              path: summaryRel,
              verify_passed: s.verify_passed,
              review_passed: s.review_passed,
              process_evidence_summary: s.process_evidence_summary,
              observed_at: new Date().toISOString(),
            },
            typeof s.archived_at === 'string' ? s.archived_at : undefined, // ts 取 archived_at,typeof guard(第 5 轮 Finding 1)
          ),
        );
      } catch (err) {
        events.push(
          mkEvent(changeId, 'archive', 'record_error', {
            path: summaryRel,
            error: (err as Error).message,
          }),
        );
      }
    }
  }

  return events;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run tests/core/monitor/artifact-observer.test.ts`
Expected: PASS(5 个用例全绿)。

- [ ] **Step 6: Commit**

```bash
git add src/core/monitor/artifact-observer.ts tests/core/monitor/artifact-observer.test.ts
git commit -m "feat(monitor): artifact-observer 反推 CLI 层事件(含 archive_summary)"
```

---

## Task 6: 差异映射表 `divergence-map.ts`

**Files:**
- Create: `src/core/monitor/divergence-map.ts`
- Test: `tests/core/monitor/divergence-map.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/core/monitor/divergence-map.test.ts
import { describe, it, expect } from 'vitest';
import { DIVERGENCE_MAP, findScenario } from '../../../src/core/monitor/divergence-map.js';
import { COMPARABLE_STAGES } from '../../../src/core/monitor/types.js';

describe('divergence-map', () => {
  it('scenario_id 全表唯一', () => {
    const ids = DIVERGENCE_MAP.scenarios.map((s) => s.scenario_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('7 个可对比阶段每个至少 1 条场景', () => {
    for (const stage of COMPARABLE_STAGES) {
      expect(DIVERGENCE_MAP.scenarios.some((s) => s.stage === stage)).toBe(true);
    }
  });
  it('每条场景五个对比字段非空', () => {
    for (const s of DIVERGENCE_MAP.scenarios) {
      for (const f of ['openspec', 'superpowers', 'forge', 'rationale', 'regression_signal'] as const) {
        expect(s[f].length, `${s.scenario_id}.${f}`).toBeGreaterThan(0);
      }
    }
  });
  it('findScenario 命中已知 id', () => {
    const s = findScenario('verify-tests-green');
    expect(s?.stage).toBe('verify');
  });
  it('findScenario 未命中返回 undefined', () => {
    expect(findScenario('不存在的-id')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/core/monitor/divergence-map.test.ts`
Expected: FAIL —— `Cannot find module '.../monitor/divergence-map.js'`。

- [ ] **Step 3: 实现 `src/core/monitor/divergence-map.ts`(骨架 + 2 条种子场景)**

```typescript
// src/core/monitor/divergence-map.ts — 静态差异映射表(spec §6;数据即 TS const,随 tsc 进 dist)
import type { DivergenceMap, DivergenceScenario } from './types.js';

export const DIVERGENCE_MAP: DivergenceMap = {
  meta: {
    schema: 'forge-monitor-divergence-map/v1',
    synced_against: { openspec: 'unknown', superpowers: 'unknown' },
    synced_at: '2026-05-15',
  },
  scenarios: [
    {
      stage: 'verify',
      scenario_id: 'verify-tests-green',
      desc: '测试全 pass,要不要继续深挖?',
      openspec: '无强 verify 阶段,验证靠 review,≈ 弱/无对应',
      superpowers: 'verification-before-completion:跑验证命令、确认输出;pass 即可声明完成',
      forge: 'verifying-three-dimensions:测试 pass 只是 Correctness 一维;还需 Completeness + Coherence',
      rationale: '反向加固 —— 防 AI 拿「测试绿」当完工',
      regression_signal:
        'verify 阶段 trace 只有 Correctness 维度 record,缺 Completeness/Coherence → forge 塌回 superpowers 基线',
    },
    {
      stage: 'archive',
      scenario_id: 'archive-unresolved-warning',
      desc: 'review 留了个未解决 WARNING,要不要归档?',
      openspec: 'openspec archive 无 severity 分级 fence → 多半放行',
      superpowers: 'finishing-a-development-branch:给 merge/PR/cleanup 选项,不强制 finding 解决',
      forge: '三级 fence:WARNING 未 resolve 且无 ack → 拒签 exit 1',
      rationale: '反向加固 —— 强 fence 防偷懒归档',
      regression_signal: 'archive 在有未 ack WARNING 时 cli_exit.exit_code=0 → 回归',
    },
  ],
};

/** 按 scenario_id 查询 */
export function findScenario(id: string): DivergenceScenario | undefined {
  return DIVERGENCE_MAP.scenarios.find((s) => s.scenario_id === id);
}
```

- [ ] **Step 4: 补全其余 5 个阶段的场景(挖掘 OpenSpec/superpowers)**

**上游仓位置(Codex 计划审查第 1 轮 F-3)**:`OpenSpec/` 与 `superpowers/` 是 `forge-repo/` 的 **sibling 仓**,位于项目根 `D:\ClaudeProject\opsp\` 下 —— 从 `forge-repo` 当前目录看即 `../OpenSpec/` 与 `../superpowers/`。挖掘前先确认这两个目录存在(`ls ../OpenSpec ../superpowers`);若不存在,向 msc 确认获取方式后再做本 Step。

逐项挖掘并向 `DIVERGENCE_MAP.scenarios` 数组追加场景,直到 `brainstorm` / `propose` / `apply` / `review` / `explore` 每个阶段**至少 1 条**(spec §6 要求覆盖 7 个可对比阶段)。每条按下面的清单做:

- `brainstorm` —— 读 `../superpowers/skills/brainstorming/SKILL.md` 与 `../OpenSpec/` 的 proposal 流程,场景示例:「用户给一句话需求,要不要先问澄清问题」。
- `propose` —— 读 `../OpenSpec/` 的 propose/change 流程与 forge `commands/propose.md`,场景示例:「proposal 与 spec 产物的强校验差异」。
- `apply` —— 读 `../superpowers/skills/subagent-driven-development/` 与 `../superpowers/skills/test-driven-development/` 及 forge `commands/apply.md`,场景示例:「子任务发现 scope 外问题时 Fluid Pause 三选项」。
- `review` —— 读 `../superpowers/skills/requesting-code-review/` 与 forge `commands/review.md`,场景示例:「review finding 的 severity 分级与 ack」。
- `explore` —— 读 `../superpowers/skills/exploring/` 与 forge `commands/explore.md`,场景示例:「探索结论是否要落产物」。

每条场景的 `openspec` / `superpowers` 写「未加固基线」走法,`forge` 写加固后走法,`regression_signal` 写「什么 trace 模式 = forge 塌回基线」。`meta.synced_against` 的 `openspec` / `superpowers` 从 `'unknown'` 改成挖掘时 `OpenSpec/` 与 `superpowers/` 两仓的实际 commit/版本号。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run tests/core/monitor/divergence-map.test.ts`
Expected: PASS(「7 个可对比阶段每个至少 1 条」在 Step 4 补全后转绿)。

- [ ] **Step 6: Commit**

```bash
git add src/core/monitor/divergence-map.ts tests/core/monitor/divergence-map.test.ts
git commit -m "feat(monitor): 静态差异映射表 divergence-map"
```

---

## Task 7: health-verdict — 健康裁决

**Files:**
- Create: `src/core/monitor/health-verdict.ts`
- Test: `tests/core/monitor/health-verdict.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/core/monitor/health-verdict.test.ts
import { describe, it, expect } from 'vitest';
import { computeVerdict } from '../../../src/core/monitor/health-verdict.js';
import type { TraceEvent } from '../../../src/core/monitor/types.js';

function ev(over: Partial<TraceEvent>): TraceEvent {
  return {
    ts: '2026-05-15T00:00:00.000Z',
    schema: 'forge-monitor-trace/v1',
    change_id: 'x',
    stage: 'verify',
    layer: 'ai',
    event: 'stage_enter',
    data: {},
    ...over,
  };
}

describe('computeVerdict', () => {
  it('无事件 → ok', () => {
    expect(computeVerdict([]).level).toBe('ok');
  });
  it('hardening_step executed=false → regression', () => {
    const v = computeVerdict([
      ev({ layer: 'ai', event: 'hardening_step', data: { step: '三维 verify', executed: false } }),
    ]);
    expect(v.level).toBe('regression');
    expect(v.items[0]?.kind).toBe('regression'); // ?. — tsconfig noUncheckedIndexedAccess
  });
  it('stage 有 CLI 事件但无 AI stage_enter → anomaly', () => {
    const v = computeVerdict([
      ev({ layer: 'cli', event: 'marker_observed', stage: 'verify' }),
    ]);
    expect(v.level).toBe('anomaly');
    expect(v.items[0]?.detail).toMatch(/缺 AI/); // ?. — tsconfig noUncheckedIndexedAccess
  });
  it('hardening 全 executed=true 且有 stage_enter → ok', () => {
    const v = computeVerdict([
      ev({ layer: 'ai', event: 'stage_enter', stage: 'verify' }),
      ev({ layer: 'cli', event: 'marker_observed', stage: 'verify' }),
      ev({ layer: 'ai', event: 'hardening_step', stage: 'verify', data: { step: 's', executed: true } }),
    ]);
    expect(v.level).toBe('ok');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/core/monitor/health-verdict.test.ts`
Expected: FAIL —— `Cannot find module '.../monitor/health-verdict.js'`。

- [ ] **Step 3: 实现 `src/core/monitor/health-verdict.ts`**

```typescript
// src/core/monitor/health-verdict.ts — 健康裁决(spec §10.1:只做可机检的判定)
import type { TraceEvent, HealthVerdict, VerdictItem, MonitorStage } from './types.js';

/**
 * 计算健康裁决。只做 spec §10.1 列的「可机检」项:
 * - regression:hardening_step.executed === false(加固步骤未执行)。
 * - anomaly:某阶段有 CLI 事件但完全无 AI stage_enter(AI trace 缺该阶段)。
 * 语义细微的 regression_signal 不在此机评,交报告并排呈现给人判。
 */
export function computeVerdict(events: TraceEvent[]): HealthVerdict {
  const items: VerdictItem[] = [];

  // 检查 1:加固步骤未执行 → regression
  for (const e of events) {
    if (e.layer === 'ai' && e.event === 'hardening_step' && e.data.executed === false) {
      items.push({
        kind: 'regression',
        stage: e.stage,
        detail: `加固步骤未执行:${String(e.data.step ?? '(未命名)')}`,
        evidence: `trace ${e.ts} hardening_step executed=false`,
      });
    }
  }

  // 检查 2:某阶段有 CLI 事件但无 AI stage_enter → anomaly
  const stagesWithCli = new Set<MonitorStage>();
  const stagesWithAiEnter = new Set<MonitorStage>();
  for (const e of events) {
    if (e.layer === 'cli') stagesWithCli.add(e.stage);
    if (e.layer === 'ai' && e.event === 'stage_enter') stagesWithAiEnter.add(e.stage);
  }
  for (const stage of stagesWithCli) {
    if (!stagesWithAiEnter.has(stage)) {
      items.push({
        kind: 'anomaly',
        stage,
        detail: `${stage} 阶段有 CLI 事件但缺 AI stage_enter record`,
        evidence: 'AI trace 不完整(可能漏记或中途启用)',
      });
    }
  }

  const level: HealthVerdict['level'] = items.some((i) => i.kind === 'regression')
    ? 'regression'
    : items.length > 0
      ? 'anomaly'
      : 'ok';
  return { level, items };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/core/monitor/health-verdict.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/core/monitor/health-verdict.ts tests/core/monitor/health-verdict.test.ts
git commit -m "feat(monitor): 健康裁决 computeVerdict"
```

---

## Task 8: report-renderer — markdown 报告渲染

**Files:**
- Create: `src/core/monitor/report-renderer.ts`
- Test: `tests/core/monitor/report-renderer.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/core/monitor/report-renderer.test.ts
import { describe, it, expect } from 'vitest';
import { renderReport } from '../../../src/core/monitor/report-renderer.js';
import type { TraceEvent } from '../../../src/core/monitor/types.js';

function ev(over: Partial<TraceEvent>): TraceEvent {
  return {
    ts: '2026-05-15T00:00:00.000Z',
    schema: 'forge-monitor-trace/v1',
    change_id: '2026-05-15-x',
    stage: 'verify',
    layer: 'ai',
    event: 'stage_enter',
    data: {},
    ...over,
  };
}

describe('renderReport', () => {
  it('含四个章节标题', () => {
    const md = renderReport('2026-05-15-x', [ev({})], []);
    expect(md).toMatch(/# Forge 工作流监控报告 — 2026-05-15-x/);
    expect(md).toMatch(/## 1\. 健康裁决/);
    expect(md).toMatch(/## 2\. 阶段时间线/);
    expect(md).toMatch(/## 3\. 三方对比表/);
    expect(md).toMatch(/## 4\. 附录/);
  });
  it('regression 出现在健康裁决段', () => {
    const md = renderReport('2026-05-15-x', [
      ev({ layer: 'ai', event: 'hardening_step', data: { step: '三维 verify', executed: false } }),
    ], []);
    expect(md).toMatch(/检出回归/);
    expect(md).toMatch(/三维 verify/);
  });
  it('decision 事件进三方对比表', () => {
    const md = renderReport('2026-05-15-x', [
      ev({ layer: 'ai', event: 'decision', data: { scenario_id: 'verify-tests-green', chosen: '走了三维' } }),
    ], []);
    expect(md).toMatch(/verify-tests-green/);
    expect(md).toMatch(/走了三维/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/core/monitor/report-renderer.test.ts`
Expected: FAIL —— `Cannot find module '.../monitor/report-renderer.js'`。

- [ ] **Step 3: 实现 `src/core/monitor/report-renderer.ts`**

```typescript
// src/core/monitor/report-renderer.ts — 渲染 markdown 报告(spec §10)
import type { TraceEvent, CliExitRecord } from './types.js';
import { computeVerdict } from './health-verdict.js';
import { DIVERGENCE_MAP, findScenario } from './divergence-map.js';

/** 渲染某 change 的完整监控报告 markdown */
export function renderReport(
  changeId: string,
  events: TraceEvent[],
  cliExits: CliExitRecord[],
): string {
  const verdict = computeVerdict(events);
  const lines: string[] = [];

  lines.push(`# Forge 工作流监控报告 — ${changeId}`, '');
  lines.push(`生成时间:${new Date().toISOString()}`);
  lines.push(`差异映射表同步于:${DIVERGENCE_MAP.meta.synced_at}`, '');

  // ── 1. 健康裁决 ──
  lines.push('## 1. 健康裁决', '');
  const levelText = { ok: '✓ OK', regression: '✗ 检出回归', anomaly: '⚠ 检出异常' }[verdict.level];
  lines.push(`整体:${levelText}`, '');
  if (verdict.items.length === 0) {
    lines.push('无命中项。', '');
  } else {
    for (const it of verdict.items) {
      const tag = it.kind === 'regression' ? '回归' : '异常';
      lines.push(`- [${tag}] (${it.stage}) ${it.detail}`);
      lines.push(`  证据:${it.evidence}`);
    }
    lines.push('');
  }

  // ── 2. 阶段时间线 ──
  lines.push('## 2. 阶段时间线', '');
  if (events.length === 0) {
    lines.push('(无 trace 事件)', '');
  } else {
    lines.push('| 时间 | 阶段 | 层 | 事件 |', '| --- | --- | --- | --- |');
    for (const e of events) {
      lines.push(`| ${e.ts} | ${e.stage} | ${e.layer} | ${e.event} |`);
    }
    lines.push('');
  }
  if (cliExits.length > 0) {
    lines.push('CLI exit 记录:');
    for (const c of cliExits) {
      lines.push(`- ${c.ts} \`forge ${c.command.join(' ')}\` → exit ${c.exit_code}`);
    }
    lines.push('');
  }

  // ── 3. 三方对比表 ──
  lines.push('## 3. 三方对比表(Forge vs OpenSpec vs Superpowers)', '');
  lines.push(
    '| scenario | forge 实际走法 | openspec | superpowers | 加固守住? |',
    '| --- | --- | --- | --- | --- |',
  );
  const decisions = events.filter((e) => e.layer === 'ai' && e.event === 'decision');
  if (decisions.length === 0) {
    lines.push('| (无 decision record) | — | — | — | — |');
  } else {
    for (const d of decisions) {
      const sid = String(d.data.scenario_id ?? '');
      const chosen = String(d.data.chosen ?? '(未记录)');
      const sc = findScenario(sid);
      lines.push(
        `| ${sid} | ${chosen} | ${sc?.openspec ?? '?'} | ${sc?.superpowers ?? '?'} | ? |`,
      );
    }
  }
  lines.push('');
  lines.push(
    '> `加固守住?` 列填 `?` 的需人工对照 `regression_signal` 判定(spec §10.1)。',
    '',
  );

  // ── 4. 附录 ──
  lines.push('## 4. 附录:原始 trace', '');
  lines.push('```jsonl');
  for (const e of events) lines.push(JSON.stringify(e));
  lines.push('```', '');

  return lines.join('\n');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/core/monitor/report-renderer.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/core/monitor/report-renderer.ts tests/core/monitor/report-renderer.test.ts
git commit -m "feat(monitor): markdown 报告渲染器"
```

---

## Task 9: `forge monitor` CLI — `enable` / `disable` / `status`

**Files:**
- Create: `src/cli/commands/monitor.ts`
- Test: `tests/core/monitor/cli-monitor.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/core/monitor/cli-monitor.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMonitorCommand } from '../../../src/cli/commands/monitor.js';
import { isMonitorEnabled } from '../../../src/core/monitor/config.js';

let root: string;
let cwd: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-cli-'));
  mkdirSync(join(root, 'forge'), { recursive: true });
  writeFileSync(join(root, 'forge', 'config.yaml'), 'schema: forge-spec-driven/v1\n');
  cwd = process.cwd();
  process.chdir(root);
});
afterEach(() => {
  process.chdir(cwd);
  rmSync(root, { recursive: true, force: true });
});

async function run(args: string[]): Promise<void> {
  await buildMonitorCommand().parseAsync(['node', 'forge', ...args]);
}

describe('forge monitor enable/disable', () => {
  it('enable 把 config.monitor.enabled 置 true', async () => {
    await run(['enable']);
    expect(isMonitorEnabled(root)).toBe(true);
  });
  it('disable 把它置 false', async () => {
    await run(['enable']);
    await run(['disable']);
    expect(isMonitorEnabled(root)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/core/monitor/cli-monitor.test.ts`
Expected: FAIL —— `Cannot find module '.../cli/commands/monitor.js'`。

- [ ] **Step 3: 实现 `src/cli/commands/monitor.ts`(先只含 enable/disable/status)**

```typescript
// src/cli/commands/monitor.ts — forge monitor 子命令组(spec §7)
import { Command } from 'commander';
import { isMonitorEnabled, setMonitorEnabled } from '../../core/monitor/config.js';
import { readTrace } from '../../core/monitor/trace-store.js';

export function buildMonitorCommand(): Command {
  const cmd = new Command('monitor').description('workflow-monitor:观察并报告 forge 工作流');

  cmd
    .command('enable')
    .description('开启 workflow-monitor(写 config.yaml#monitor.enabled)')
    .action(() => {
      setMonitorEnabled(process.cwd(), true);
      console.log('✓ workflow-monitor 已开启 —— AI trace 层下次会话生效,CLI 层下次 forge 调用生效');
    });

  cmd
    .command('disable')
    .description('关闭 workflow-monitor')
    .action(() => {
      setMonitorEnabled(process.cwd(), false);
      console.log('✓ workflow-monitor 已关闭');
    });

  cmd
    .command('status')
    .description('查看开关状态 + 活动 change 的 trace 摘要')
    .option('--change <id>', '指定 change-id')
    .action((opts: { change?: string }) => {
      const root = process.cwd();
      console.log(`workflow-monitor: ${isMonitorEnabled(root) ? '已开启' : '已关闭'}`);
      if (opts.change) {
        const { events, corruptLines } = readTrace(root, opts.change);
        console.log(`change ${opts.change}: ${events.length} 条 trace 事件,${corruptLines} 行损坏`);
      }
    });

  return cmd;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/core/monitor/cli-monitor.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/monitor.ts tests/core/monitor/cli-monitor.test.ts
git commit -m "feat(monitor): forge monitor enable/disable/status 子命令"
```

---

## Task 10: `forge monitor record` — AI 层事件写入

**Files:**
- Modify: `src/cli/commands/monitor.ts`(加 `record` 子命令)
- Test: `tests/core/monitor/cli-monitor.test.ts`(追加 record 用例)

- [ ] **Step 1: 追加失败测试**

在 `tests/core/monitor/cli-monitor.test.ts` 末尾(`describe` 块外)追加:

```typescript
import { readTrace } from '../../../src/core/monitor/trace-store.js';

describe('forge monitor record', () => {
  it('监控开启 → 写入一条 AI 层事件', async () => {
    await run(['enable']);
    await run([
      'record',
      '--stage', 'verify',
      '--event', 'decision',
      '--change', '2026-05-15-x',
      '--json', '{"scenario_id":"verify-tests-green","chosen":"走了三维"}',
    ]);
    const { events } = readTrace(root, '2026-05-15-x');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ layer: 'ai', event: 'decision', stage: 'verify' });
    expect(events[0]?.data.chosen).toBe('走了三维'); // ?. — tsconfig noUncheckedIndexedAccess
  });
  it('监控关闭 → 静默 no-op,不写文件', async () => {
    await run(['record', '--stage', 'verify', '--event', 'stage_enter', '--change', '2026-05-15-y']);
    expect(readTrace(root, '2026-05-15-y').events).toHaveLength(0);
  });
  it('坏 json → 不抛,写一条 record_error', async () => {
    await run(['enable']);
    await run(['record', '--stage', 'verify', '--event', 'decision', '--change', '2026-05-15-z', '--json', '不是json']);
    const { events } = readTrace(root, '2026-05-15-z');
    expect(events.some((e) => e.event === 'record_error')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/core/monitor/cli-monitor.test.ts`
Expected: FAIL —— `record` 子命令不存在(commander 报未知命令)。

- [ ] **Step 3: 给 `monitor.ts` 加 `record` 子命令**

在 `src/cli/commands/monitor.ts` 顶部 import 区加:

```typescript
import { appendTraceEvent } from '../../core/monitor/trace-store.js';
import type { TraceEvent, MonitorStage } from '../../core/monitor/types.js';
```

在 `buildMonitorCommand()` 内、`return cmd;` 之前加:

```typescript
  cmd
    .command('record')
    .description('记录一条 AI 层 trace 事件(由 workflow-monitor 注入内容指示 AI 调用)')
    .requiredOption('--stage <stage>', '工作阶段')
    .requiredOption('--event <event>', '事件类型(stage_enter|decision|hardening_step|stage_exit)')
    .option('--change <id>', 'change-id', '_session')
    .option('--json <payload>', 'data 负载(JSON)', '{}')
    .action((opts: { stage: string; event: string; change: string; json: string }) => {
      // 硬约束(spec §7):永远 exit 0;关闭时静默 no-op。
      try {
        const root = process.cwd();
        if (!isMonitorEnabled(root)) return; // 静默 no-op
        let data: Record<string, unknown>;
        let event = opts.event;
        try {
          data = JSON.parse(opts.json) as Record<string, unknown>;
        } catch (err) {
          // 坏输入降级为 record_error,不报错退出
          event = 'record_error';
          data = { original_event: opts.event, error: (err as Error).message };
        }
        const traceEvent: TraceEvent = {
          ts: new Date().toISOString(),
          schema: 'forge-monitor-trace/v1',
          change_id: opts.change,
          stage: opts.stage as MonitorStage,
          layer: 'ai',
          event,
          data,
        };
        appendTraceEvent(root, traceEvent);
      } catch {
        // 永不破坏工作流 —— 吞掉一切异常
      }
    });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/core/monitor/cli-monitor.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/monitor.ts tests/core/monitor/cli-monitor.test.ts
git commit -m "feat(monitor): forge monitor record 写 AI 层事件"
```

---

## Task 11: `forge monitor report` + 注册到 CLI 入口

**Files:**
- Modify: `src/cli/commands/monitor.ts`(加 `report` 子命令)
- Modify: `src/cli/index.ts`(注册 `buildMonitorCommand()`)
- Test: `tests/core/monitor/cli-monitor.test.ts`(追加 report 用例)

- [ ] **Step 1: 追加失败测试**

在 `tests/core/monitor/cli-monitor.test.ts` 末尾追加:

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';

describe('forge monitor report', () => {
  it('渲染报告并写 report.md', async () => {
    await run(['enable']);
    await run(['record', '--stage', 'verify', '--event', 'stage_enter', '--change', '2026-05-15-r']);
    await run(['report', '--change', '2026-05-15-r']);
    const reportPath = pathJoin(root, 'forge', '.monitor', '2026-05-15-r', 'report.md');
    expect(existsSync(reportPath)).toBe(true);
    expect(readFileSync(reportPath, 'utf8')).toMatch(/# Forge 工作流监控报告 — 2026-05-15-r/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/core/monitor/cli-monitor.test.ts`
Expected: FAIL —— `report` 子命令不存在。

- [ ] **Step 3: 给 `monitor.ts` 加 `report` 子命令**

在 `src/cli/commands/monitor.ts` 顶部 import 区加这三行新 import:

```typescript
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { observeArtifacts } from '../../core/monitor/artifact-observer.js';
import { renderReport } from '../../core/monitor/report-renderer.js';
```

并把 Task 9 已写入的那行 trace-store import:

```typescript
import { readTrace } from '../../core/monitor/trace-store.js';
```

改为(追加 `readCliExits` 与 `monitorDir`,复用同一行,不要新开重复 import):

```typescript
import { readTrace, readCliExits, monitorDir } from '../../core/monitor/trace-store.js';
```

在 `buildMonitorCommand()` 内、`return cmd;` 之前加:

```typescript
  cmd
    .command('report')
    .description('渲染某 change 的监控报告(markdown)')
    .requiredOption('--change <id>', 'change-id')
    .option('--out <path>', '报告输出路径(默认 forge/.monitor/<change>/report.md)')
    .action((opts: { change: string; out?: string }) => {
      const root = process.cwd();
      // AI trace 事件 + CLI 产物回扫事件合并(spec §2.4:产物层可回溯全程)
      const aiEvents = readTrace(root, opts.change).events;
      const cliEvents = observeArtifacts(root, opts.change);
      const all = [...cliEvents, ...aiEvents].sort((a, b) => a.ts.localeCompare(b.ts));
      const cliExits = readCliExits(root);
      const md = renderReport(opts.change, all, cliExits);
      const outPath = opts.out ?? join(monitorDir(root), opts.change, 'report.md');
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, md, 'utf8');
      console.log(md);
      console.error(`\n报告已写入 ${outPath}`);
    });
```

- [ ] **Step 4: 在 `src/cli/index.ts` 注册 monitor 子命令**

在 `src/cli/index.ts` import 区(其它 `buildXxxCommand` import 之后)加:

```typescript
import { buildMonitorCommand } from './commands/monitor.js';
```

在 `program.addCommand(buildBacklogCommand());` 之后加:

```typescript
// 注册 monitor 子命令组(plan-workflow-monitor)
program.addCommand(buildMonitorCommand());
```

- [ ] **Step 5: 运行测试 + typecheck + build**

Run: `pnpm vitest run tests/core/monitor/cli-monitor.test.ts && pnpm typecheck && pnpm build`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/monitor.ts src/cli/index.ts tests/core/monitor/cli-monitor.test.ts
git commit -m "feat(monitor): forge monitor report + 注册子命令到 CLI 入口"
```

---

## Task 12: `hooks/monitor-check.mjs` — 零依赖开关 gate

**Files:**
- Create: `hooks/monitor-check.mjs`
- Test: `tests/core/monitor/monitor-check.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/core/monitor/monitor-check.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'hooks', 'monitor-check.mjs');

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-monitor-check-'));
  mkdirSync(join(root, 'forge'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function check(configText?: string): number {
  if (configText !== undefined) {
    writeFileSync(join(root, 'forge', 'config.yaml'), configText, 'utf8');
  }
  return spawnSync('node', [SCRIPT], { cwd: root }).status ?? -1;
}

describe('monitor-check.mjs', () => {
  it('config 缺失 → exit 1', () => {
    expect(check()).toBe(1);
  });
  it('块式 monitor.enabled: true → exit 0', () => {
    expect(check('schema: forge-spec-driven/v1\nmonitor:\n  enabled: true\n')).toBe(0);
  });
  it('块式 monitor.enabled: false → exit 1', () => {
    expect(check('schema: forge-spec-driven/v1\nmonitor:\n  enabled: false\n')).toBe(1);
  });
  it('inline flow monitor: { enabled: true } → exit 0', () => {
    expect(check('schema: forge-spec-driven/v1\nmonitor: { enabled: true }\n')).toBe(0);
  });
  it('注释掉的 enabled 不算数 → exit 1', () => {
    expect(check('schema: forge-spec-driven/v1\nmonitor:\n  # enabled: true\n')).toBe(1);
  });
  it('别的父键下的 enabled 不误判 → exit 1', () => {
    expect(check('schema: forge-spec-driven/v1\nother:\n  enabled: true\n')).toBe(1);
  });
  it('带引号的 "true" 不算裸 boolean → exit 1', () => {
    expect(check('schema: forge-spec-driven/v1\nmonitor:\n  enabled: "true"\n')).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/core/monitor/monitor-check.test.ts`
Expected: FAIL —— `hooks/monitor-check.mjs` 不存在,`spawnSync` status 非 0 但不是预期分支(多数用例不通过)。

- [ ] **Step 3: 实现 `hooks/monitor-check.mjs`**

```javascript
#!/usr/bin/env node
// hooks/monitor-check.mjs — workflow-monitor 开关 gate(spec §9)
// 零依赖:非 bundled plugin 不含 dist/ 与 node_modules,不能 import forge 编译产物或 yaml 包。
// 退出码:0 = monitor enabled;1 = disabled 或任何异常(安全侧默认 disabled)。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

try {
  const path = join(process.cwd(), 'forge', 'config.yaml');
  if (!existsSync(path)) process.exit(1);
  process.exit(scanMonitorEnabled(readFileSync(path, 'utf8')) ? 0 : 1);
} catch {
  process.exit(1);
}

/**
 * scan 契约(spec §9):
 * - 剔除行内非引号包裹的注释;
 * - 只在顶层(零缩进)monitor: 块内找 enabled:;
 * - 支持块式与 inline flow 式;
 * - 严格匹配裸 boolean true;其它一律 disabled。
 */
function scanMonitorEnabled(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = stripComment(lines[i]);
    const m = /^monitor:\s*(.*)$/.exec(raw);
    if (!m) continue;
    const rest = m[1].trim();
    // inline flow:monitor: { enabled: true }
    if (rest.startsWith('{')) {
      return /\benabled\s*:\s*true\s*[},]/.test(rest + ',');
    }
    // 块式:扫 monitor: 之后的缩进子块
    for (let j = i + 1; j < lines.length; j++) {
      const sub = stripComment(lines[j]);
      if (sub.trim() === '') continue;
      if (!/^\s/.test(sub)) break; // 回到零缩进 → 子块结束
      const e = /^\s+enabled\s*:\s*(\S+)\s*$/.exec(sub);
      if (e) return e[1] === 'true'; // 严格裸 true;"true" / false / 其它 → 否
    }
    return false;
  }
  return false;
}

/** 去掉行内第一个非引号包裹的 # 起的注释 */
function stripComment(line) {
  let inStr = false;
  let quote = '';
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (inStr) {
      if (c === quote) inStr = false;
    } else if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
    } else if (c === '#') {
      return line.slice(0, k);
    }
  }
  return line;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/core/monitor/monitor-check.test.ts`
Expected: PASS(7 个用例全绿)。

- [ ] **Step 5: Commit**

```bash
git add hooks/monitor-check.mjs tests/core/monitor/monitor-check.test.ts
git commit -m "feat(monitor): hooks/monitor-check.mjs 零依赖开关 gate"
```

---

## Task 13: AI trace 注入内容 + SessionStart hook 接线

**Files:**
- Create: `hooks/workflow-monitor-injection.md`
- Modify: `hooks/session-start`

- [ ] **Step 1: 创建 `hooks/workflow-monitor-injection.md`**

```markdown
# workflow-monitor 已开启

本会话 forge 工作流监控已开启。在跑 forge 工作流时,你**额外**做以下记录动作 —— 它们不改变工作流本身,只产出可观测 trace。

所有 `forge monitor` 调用走 plugin helper(forge CLI 不在 PATH):
`node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" monitor <子命令> <参数>`

## 每个阶段要记录的

进入任一 forge 阶段(brainstorm / propose / apply / review / verify / archive / explore)时:

1. **进入阶段** —— 调:
   `... run-forge.mjs monitor record --stage <阶段> --event stage_enter --change <change-id>`
2. **fork 点决策** —— 在该阶段的关键岔路口,记录你实际选了哪条分支:
   `... monitor record --stage <阶段> --event decision --change <id> --json '{"scenario_id":"<见下>","chosen":"<你实际怎么走的>"}'`
3. **加固步骤** —— 执行(或跳过)一个反向加固步骤后:
   `... monitor record --stage <阶段> --event hardening_step --change <id> --json '{"step":"<步骤名>","executed":true|false}'`
4. **离开阶段** —— 调:
   `... monitor record --stage <阶段> --event stage_exit --change <id> --json '{"outcome":"<结果>"}'`

## fork 点 scenario_id 速查

- verify 阶段「测试 pass 后是否做三维 verify」→ `scenario_id: verify-tests-green`
- archive 阶段「有未 ack WARNING 是否归档」→ `scenario_id: archive-unresolved-warning`
- 其它阶段的 scenario_id 见 `src/core/monitor/divergence-map.ts`。

## 报告

- `/forge:archive` 成功后,跑一次 `... monitor report --change <change-id>` 生成完整报告。
- 工作流中途被 fence 拦下时,也可随时跑 `... monitor report --change <change-id>` 拿当前快照。

记录是尽力而为的:某次漏记不会破坏工作流,只会让报告在该阶段标「AI trace 不完整」。
```

- [ ] **Step 2: 读现有 `hooks/session-start` 确认结构**

Run: `cat hooks/session-start`
Expected: 看到脚本计算 `SCRIPT_DIR` / `PLUGIN_ROOT`,读 `using-forge/SKILL.md` 拼 `session_context`,最后按 harness 输出 JSON。确认 `session_context` 变量在 `printf` 输出之前已拼好。

- [ ] **Step 3: 在 `hooks/session-start` 加 monitor 注入分支**

在 `hooks/session-start` 里,`using_forge_escaped` 赋值之后、`session_context=...` 赋值之前,插入:

```bash
# workflow-monitor:开关由 forge/config.yaml#monitor.enabled 决定(spec §9)
# monitor-check.mjs 零依赖,exit 0 = 开启。任何异常都当关闭,绝不阻塞 session 启动。
monitor_injection=""
if node "${SCRIPT_DIR}/monitor-check.mjs" >/dev/null 2>&1; then
  monitor_content=$(cat "${SCRIPT_DIR}/workflow-monitor-injection.md" 2>/dev/null || echo "")
  if [ -n "$monitor_content" ]; then
    monitor_injection=$(escape_for_json "$monitor_content")
  fi
fi
```

然后把 `session_context=` 那一行的拼接末尾加上 `${monitor_injection}`。具体改法:找到形如

```bash
session_context="<EXTREMELY_IMPORTANT>\n...${using_forge_escaped}\n\n${warning_escaped}\n</EXTREMELY_IMPORTANT>"
```

的行,在 `</EXTREMELY_IMPORTANT>` **之前**插入 `\n\n${monitor_injection}`,即:

```bash
session_context="<EXTREMELY_IMPORTANT>\n...${using_forge_escaped}\n\n${warning_escaped}\n\n${monitor_injection}\n</EXTREMELY_IMPORTANT>"
```

> `monitor_injection` 在监控关闭时为空字符串,拼进去无副作用 —— 即 spec §11「关闭时无 context 注入」。

- [ ] **Step 4: 手动验证 hook 行为**

> **在 Git Bash 中运行**(forge 项目的标准 shell,见环境约定 —— Windows 11 + Git-Bash)。下面命令是 bash / MSYS 路径风格,PowerShell 下无法直接照抄。

Run(监控关闭时):
```bash
cd /tmp && mkdir -p fm-test/forge && cd fm-test && echo 'schema: forge-spec-driven/v1' > forge/config.yaml && node "$(git -C /d/ClaudeProject/opsp/forge-repo rev-parse --show-toplevel)/hooks/monitor-check.mjs"; echo "exit=$?"
```
Expected: `exit=1`(监控关闭)。

Run(监控开启时):
```bash
cd /tmp/fm-test && printf 'schema: forge-spec-driven/v1\nmonitor:\n  enabled: true\n' > forge/config.yaml && node "$(git -C /d/ClaudeProject/opsp/forge-repo rev-parse --show-toplevel)/hooks/monitor-check.mjs"; echo "exit=$?"
```
Expected: `exit=0`(监控开启)。清理:`rm -rf /tmp/fm-test`。

- [ ] **Step 5: Commit**

```bash
git add hooks/workflow-monitor-injection.md hooks/session-start
git commit -m "feat(monitor): AI trace 注入内容 + SessionStart hook 接线"
```

---

## Task 14: 文档、CHANGELOG、.gitignore

**Files:**
- Modify: `.gitignore`(加 `forge/.monitor/`)
- Modify: `CHANGELOG.md`
- Modify: `docs/cli-reference.md`(加 `forge monitor` 子命令文档)

- [ ] **Step 1: `.gitignore` 加忽略项**

在 `.gitignore` 末尾加一行:

```
forge/.monitor/
```

- [ ] **Step 2: `CHANGELOG.md` 记一条**

`CHANGELOG.md` 当前 `## [Unreleased]` 区下只有一行占位符 `(暂无)`、无 `### Added` 小节。把 `(暂无)` 这一行替换为 `### Added` 标题,然后在其下插入条目:

```markdown
- **workflow-monitor**:低耦合旁路工作流监控观察者。`forge monitor enable` 开启后,记录
  forge 每阶段状态与动作选择,与 OpenSpec/superpowers 静态差异映射表对比做回归探测;
  `forge monitor report` 渲染 markdown 报告。详见
  `docs/specs/2026-05-15-workflow-monitor-design.md`。
```

- [ ] **Step 3: `docs/cli-reference.md` 加子命令文档**

在 `docs/cli-reference.md` 里参照现有子命令条目的格式,新增 `forge monitor` 段落,列出 `enable` / `disable` / `status` / `record` / `report` 五个子命令及其参数(取自本计划 Task 9-11 的 commander 定义)。

- [ ] **Step 4: 全量验证**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`
Expected: 五步全 PASS(CI 同序;`format:check` 失败就先跑 `pnpm format` 再重跑)。

- [ ] **Step 5: Commit**

```bash
git add .gitignore CHANGELOG.md docs/cli-reference.md
git commit -m "docs(monitor): CHANGELOG + cli-reference + gitignore"
```

---

## 收尾验证

- [ ] **全链路冒烟**:在一个测试项目里 `forge init` → `forge monitor enable` → 确认 `forge/config.yaml` 有 `monitor.enabled: true` → 跑 `forge monitor record --stage verify --event stage_enter --change test-x` → `forge monitor report --change test-x` → 确认报告生成且含四个章节。
- [ ] **关闭验证**:`forge monitor disable` 后,`forge monitor record ...` 静默无输出、不写 trace;任意 `forge` 命令不再写 `cli-exits.jsonl`。
- [ ] 确认 `pnpm test` 全绿、release gate 通过。

---

## 修订记录

### 第 1 轮 Codex 对抗性审查后修订(2026-05-16)

Codex 对计划做对抗性审查,提出 4 项 finding,均经独立对照代码核实成立:

| Finding | 核实 | 修正 |
| ------- | ---- | ---- |
| F-1 Task 5 `marker_observed` 漏 `hashes` / `ok` 字段(spec §3.2 要求) | 成立 | Task 5 重写:observer 调 `validateMarkerSchema`(`marker-schema.ts:58`,返回 `.valid`)填 `ok`,从 marker 取 `tasks_hash`/`content_hash` 填 `hashes`;测试 fixture 改用合法 sha256 与无毫秒时间戳 |
| F-2 Task 5 不扫 `forge/changes/archive/<id>/`、漏 `archive_summary.yaml`(spec §3 明列) | 成立 | Task 5 重写:`observeArtifacts` 同时扫 active 与 archive 目录;archive 目录额外读 `archive_summary.yaml`,经 `looksLikeArchiveSummary` 校验后产 `fence_observed`(archive) |
| F-3 Task 6 上游仓路径写裸名 `superpowers/...`,实为 `forge-repo` 的 sibling | 成立 | Task 6 Step 4 改为 `../OpenSpec/` / `../superpowers/`,并加挖掘前存在性确认 |
| F-4 Task 13 手动验证命令是 bash 风格,未注明 shell | 成立 | Task 13 Step 4 加注「在 Git Bash 中运行」 |

附带修复:Task 5 原缺「运行确认失败」TDD 步骤,重写时补齐(现为 6 步)。

### 第 2 轮 Codex 对抗性审查后修订(2026-05-16)

Codex 重审:F-1 / F-3 / F-4 确认已修复;F-2 未修好;新提 3 项。均经独立核实:

| Finding | 核实 | 修正 |
| ------- | ---- | ---- |
| F-2 / 新-1 / 新-3 archive 目录名带 `<YYYY-MM-DD>-` 前缀,Task 5 第 1 轮的 `archive/<changeId>` 路径仍错 | 成立 | 读 `transaction.ts:56` 确认目录名 = `${archiveDate}-${changeId}`。Task 5 改为 `readdirSync` 扫 `forge/changes/archive/`,用正则 `^\d{4}-\d{2}-\d{2}-(.+)$` 反解、捕获组严格等于 `changeId`。Task 11 传 `changeId` 不变(observeArtifacts 内部反解,新-3 一并解决) |
| 新-2 `looksLikeArchiveSummary` 只查 schema 字段,残缺 summary 也记 `ok:true` | 成立 | 读 `archive-summary-schema.ts:35` 确认 `validateArchiveSummarySchema` 存在。Task 5 改用它,`ok = validation.valid`;测试 fixture 的 archive 目录改为带日期前缀 `2026-05-16-2026-05-15-z` |

### 第 3 轮 Codex 对抗性审查后修订(2026-05-16)

Codex 重审:第 2 轮全部修订确认有效落地。新提 4 项(1 项「无缺陷」),其余 3 项经独立核实:

| Finding | 核实 | 修正 |
| ------- | ---- | ---- |
| Finding 2 Task 7 测试 `v.items[0].kind/.detail` 在 `noUncheckedIndexedAccess` 下 typecheck 失败 | 成立 | 读 `tsconfig.json:10`(`noUncheckedIndexedAccess:true`)+ `tsconfig.test.json:7`(含 `tests/**/*`)确认。改为 `v.items[0]?.kind` / `?.detail` |
| Finding 3 Task 10 测试 `events[0].data.chosen` 同问题 | 成立 | 改为 `events[0]?.data.chosen` |
| Finding 4 Task 14 CHANGELOG 指令假设有 `### Added` 节,实为 `(暂无)` 占位符 | 成立 | 读 `CHANGELOG.md:7-9` 确认。Task 14 Step 2 改为「把 `(暂无)` 替换为 `### Added` 标题再插入条目」 |

Finding 1(exit 处理器 `code` 类型)经 Codex 核实无缺陷,不修。

### 第 4 轮 Codex 对抗性审查后修订(2026-05-16)

Codex 收敛性审查:Finding 2/3/4 确认已修复;import 路径/命名、archive_summary fixture YAML、commander 用法均确认无问题。新提 2 项实质问题,经独立核实:

| Finding | 核实 | 修正 |
| ------- | ---- | ---- |
| 检查点 3 Task 5 artifact 事件 `ts` 用 `new Date()`(观察时刻)而非产物时刻,Task 11 报告「阶段时间线」按 `ts` 排序会把回扫事件全堆到末尾 | 成立 | `mkEvent` 加 `ts?` 参数;`marker_observed` 取 marker 的 `verified_at`/`reviewed_at`/`failed_at`、`fence_observed` 取 `archived_at` 作 `ts`;观察时刻另记 `data.observed_at`;测试加 `ts` 断言 |
| 检查点 5 Task 4 测试 `recs[0]` 直接传 `toMatchObject`,与 Finding 2/3 同类未统一修 | 成立 | 改为 `recs[0]?.command` / `recs[0]?.exit_code` 两条 `?.` 断言 |

### 第 5 轮 Codex 对抗性审查后修订(2026-05-16,末轮)

Codex 末轮全局收敛复查:第 4 轮两项修订确认有效;F-1~F-4、新-1~新-3、Finding 2~4、检查点 3/5 修订叠加后无残留矛盾;任务顺序无前向引用阻断。仅剩 1 项真实问题,经核实:

| Finding | 核实 | 修正 |
| ------- | ---- | ---- |
| 第 5 轮 Finding 1 Task 5 时间戳用 `as string | undefined` 编译期断言、无运行时检查;schema-invalid marker 的时间戳字段若非 string 会漏进 `TraceEvent.ts`,致 Task 11 排序 `localeCompare` 崩溃 | 成立 | `markerTs` 与 `archived_at` 均改为 `typeof x === 'string'` runtime guard,非 string 即 `undefined`、回退观察时刻 |

**收敛结论**:Codex 末轮判定 —— 该 Finding 修掉后计划已收敛、可进入实施。5 轮对抗性审查累计 13 项 finding(F-1~F-4 / 新-1~新-3 / Finding 2~4 / 检查点 3、5 / 第 5 轮 Finding 1),全部独立对照代码核实为真问题并修正。
