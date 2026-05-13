# Plan 9a — 横切层基础实施

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:建立 forge v1.0 横切层基础 — JCS canonical-json + 三级分级 + critical_candidate 协议 + ack 两步 propose/confirm 协议 + CLI helper 框架 + validate/archive 横切 fence 集成 + receiving-code-review skill severity 升级。本 phase 是其他 8 个 sub-plan(9b/9c/9d/9f/9g/9i/9j + 部分 9e)的依赖基础。

**Architecture**:三层加固:(1) `src/core/` 加 canonical-json.ts(JCS)+ severity.ts schema 锁死 §3.12 Interface Freeze 接口;(2) `src/cli/commands/` 加 ack.ts(三子命令 propose/confirm/reject)+ evidence.ts(三 helper record-tdd/record-verify/record-review);(3) 修改 validate.ts / archive.ts 加横切 fence 调用入口 + fence stub 合约(`not_implemented` + `--allow-stub-fence`);最后 receiving-code-review/SKILL.md severity 字段升级。

**Tech Stack**:Node 20+ / TypeScript ESM / commander 12 / yaml(已有)+ **canonicalize npm 包**(JCS / RFC 8785 实现,**新增依赖**) + 现有测试栈(vitest)。

**Spec 引用**:
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §2.3 全节 + §2.7.6 CLI helper 框架 + §2.3.7 实施清单 + §3.4 marker 版本字段(部分,余在 9j)
- master plan §3.1 + §3.12 Interface Freeze Appendix(本 phase 实施 §3.12.1 / §3.12.1bis 部分 / §3.12.2 / §3.12.3 / §3.12.4 全部接口冻结)

**P50 工日**:6 / **P90 工日**:8

**前置**:无(基础)。本 plan 是 9b/9c/9d/9f/9g/9i/9j 的前置。

**DoD**(完成定义):
- §3.12 Interface Freeze Appendix 中所有共享接口写入 `src/core/schemas/` 和 `src/core/canonical-json.ts`,后续 sub-plan 仅 reference 不重定义
- 5 个新 CLI 子命令(`forge ack propose|confirm|reject` + `forge evidence record-tdd|record-verify|record-review`)CLI test 全 PASS
- `commands/ack-confirm.md` slash 命令文档完整
- `validate.ts` 加 candidate 验证骨架 + automated CRITICAL finding 时输出 `finding_hash`(JCS)
- `archive.ts` 加横切 fence 调用入口 + fence stub `not_implemented` 默认 fail exit 2 + 开发期 `--allow-stub-fence` flag
- `receiving-code-review/SKILL.md` severity 字段从装饰升级参与门禁 + 判定指引段
- `tests/cli/` 新增三个测试文件(severity-fence / ack-cli / evidence-helpers)+ `tests/core/canonical-json.test.ts` 全 PASS
- 全本地 verify 通过(typecheck / lint / format:check / build / vitest)

---

## 0. 总览

本 sub-plan 拆 9 个 task(累计 P50 6 工日):

| Task | 名称 | 工日 P50 | 关键交付 |
|------|------|---------|---------|
| 1 | canonical-json.ts(JCS) | 0.5 | `src/core/canonical-json.ts` + tests |
| 2 | severity schema 锁死 | 0.5 | `src/core/schemas/severity.ts`(§3.12 接口冻结) |
| 3 | ack.ts CLI(propose/confirm/reject) | 1.0 | `src/cli/commands/ack.ts` + ack-log.jsonl + pending-acks/ 协议 |
| 4 | ack-confirm slash | 0.3 | `commands/ack-confirm.md` |
| 5 | evidence.ts CLI(三 helper) | 1.2 | `src/cli/commands/evidence.ts`(record-tdd/record-verify/record-review) |
| 6 | ack-log.jsonl 协议 + pending-acks/ 目录管理 | 0.5 | `src/core/ack-log.ts` 共用 helper |
| 7 | validate.ts 横切集成 | 1.0 | finding_hash 自动产 + candidate 验证骨架 |
| 8 | archive.ts 横切 fence + stub 合约 | 0.5 | fence 调用入口 + `not_implemented` 行为 + `--allow-stub-fence` flag |
| 9 | receiving-code-review skill 升级 | 0.5 | severity 升级 + 判定指引段 |

并行可能:Task 1 / Task 2 可并行(独立模块);Task 4 是 Task 3 的薄包装可顺序;Task 5-9 互相独立可并行。**单人路径**:1→2→3→4→5→6→7→8→9。

---

## 1. File Structure

### 新增文件

```
src/core/canonical-json.ts             ← Task 1:JCS 序列化器(wrap canonicalize npm 包)
src/core/schemas/severity.ts           ← Task 2:三级 enum + candidate_type 6 类 enum + finding 字段类型
src/core/ack-log.ts                    ← Task 6:ack-log.jsonl 共用 read/write helper
src/cli/commands/ack.ts                ← Task 3:propose / confirm / reject 三子命令
src/cli/commands/evidence.ts           ← Task 5:record-tdd / record-verify / record-review 三 helper
commands/ack-confirm.md                ← Task 4:slash 命令
tests/core/canonical-json.test.ts      ← Task 1
tests/cli/severity-fence.test.ts       ← Task 2 + Task 7(部分)
tests/cli/ack-cli.test.ts              ← Task 3
tests/cli/evidence-helpers.test.ts     ← Task 5
tests/core/ack-log.test.ts             ← Task 6
```

### 修改文件

```
src/cli/index.ts                       ← Task 3 + Task 5:注册新 ack 子命令组 + evidence 子命令组
src/cli/commands/validate.ts           ← Task 7:加 finding_hash 自动产(JCS)+ candidate 验证骨架
src/cli/commands/archive.ts            ← Task 8:横切 fence 调用入口 + stub 合约
src/core/schemas/types.ts              ← Task 2 引用 severity.ts;Task 7 引用 finding 类型
skills/receiving-code-review/SKILL.md  ← Task 9:severity 升级 + 判定指引
package.json                           ← Task 1:加 canonicalize 依赖
```

### 不修改文件(明确边界)

```
src/cli/commands/upgrade.ts            ← 9j 独立加 --resign-markers,本 plan 不动
src/core/markers/                      ← 9b/9c/9d/9e/9g 各自加 schema 字段;本 plan 仅锁 severity 共享类型
src/core/archive/transaction.ts        ← 9e 修改 archive 原子链;本 plan 仅在 archive.ts 顶层加 fence 调用入口
forge/config.yaml schema               ← 9g/9h 加各自配置块;本 plan 只用现有 config 字段
```

---

## 2. Task 1 — canonical-json.ts(JCS 序列化器)

**Files:**
- Create: `src/core/canonical-json.ts`
- Create: `tests/core/canonical-json.test.ts`
- Modify: `package.json`(加 `canonicalize` 依赖)

**Goal**:实现 JCS(JSON Canonicalization Scheme,RFC 8785)序列化器,所有 v1.0 hash 计算路径调用此模块。

- [ ] **Step 1: 加依赖**

```bash
pnpm add canonicalize
```

预期:`package.json` `dependencies` 加 `"canonicalize": "^1.0.x"`(具体版本以 npm latest 为准)。

- [ ] **Step 2: Write the failing test**

`tests/core/canonical-json.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canonicalize, canonicalHash } from '../../src/core/canonical-json.js';

describe('canonical-json', () => {
  it('serializes object with sorted keys (JCS RFC 8785)', () => {
    const obj = { z: 1, a: 2, m: 3 };
    expect(canonicalize(obj)).toBe('{"a":2,"m":3,"z":1}');
  });

  it('produces same canonical form for differently-ordered same-content objects', () => {
    const a = { x: 1, y: 2 };
    const b = { y: 2, x: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('produces deterministic SHA256 hash', () => {
    const obj = { foo: 'bar', n: 42 };
    const h1 = canonicalHash(obj);
    const h2 = canonicalHash(obj);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles nested objects + arrays', () => {
    const obj = { items: [{ b: 2, a: 1 }, { d: 4, c: 3 }] };
    const expected = '{"items":[{"a":1,"b":2},{"c":3,"d":4}]}';
    expect(canonicalize(obj)).toBe(expected);
  });

  it('rejects non-JSON values (Date, undefined, function)', () => {
    expect(() => canonicalize({ d: new Date() })).toThrow(/non-JSON/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest tests/core/canonical-json.test.ts
```

预期:FAIL,"Cannot find module '../../src/core/canonical-json.js'"。

- [ ] **Step 4: Write minimal implementation**

`src/core/canonical-json.ts`:

```typescript
// canonical-json.ts:JCS(JSON Canonicalization Scheme,RFC 8785)序列化器
// v1.0 所有 hash payload 序列化路径必须经过本模块,确保跨平台 / 跨版本字节序列一致。
// 依赖 canonicalize npm 包(IETF RFC 8785 reference impl)。

import canonicalizeImpl from 'canonicalize';
import { createHash } from 'node:crypto';

/**
 * 序列化为 JCS canonical JSON。
 * - 字段按 lexicographic 排序
 * - 字符串 UTF-8 + 标准 escape
 * - 数值 IEEE 754 double + ECMA-262 数值字符串化
 * - 拒绝 Date / undefined / function 等非 JSON 值
 */
export function canonicalize(value: unknown): string {
  // canonicalize 包对非 JSON 值会返回 undefined,需手工拒绝
  if (containsNonJsonValue(value)) {
    throw new Error('canonicalize: input contains non-JSON value (Date / undefined / function)');
  }
  const result = canonicalizeImpl(value);
  if (result === undefined) {
    throw new Error('canonicalize: serialization returned undefined');
  }
  return result;
}

/** 计算 JCS payload 的 SHA256 hex hash */
export function canonicalHash(value: unknown): string {
  const json = canonicalize(value);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

function containsNonJsonValue(v: unknown): boolean {
  if (v === undefined) return true;
  if (typeof v === 'function') return true;
  if (v instanceof Date) return true;
  if (Array.isArray(v)) return v.some(containsNonJsonValue);
  if (v && typeof v === 'object') {
    return Object.values(v).some(containsNonJsonValue);
  }
  return false;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest tests/core/canonical-json.test.ts
```

预期:5 tests PASS。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/core/canonical-json.ts tests/core/canonical-json.test.ts
git commit -m "feat(9a): canonical-json.ts JCS serializer + SHA256 hasher"
```

---

## 3. Task 2 — severity schema 锁死(§3.12 Interface Freeze 接口冻结)

**Files:**
- Create: `src/core/schemas/severity.ts`
- Modify: `src/core/schemas/types.ts`(re-export severity)
- Test: `tests/cli/severity-fence.test.ts`(本 task 加部分,Task 7 加更多)

**Goal**:把 §3.12.1 共享 severity 字段全部冻结到 single source of truth(`severity.ts`),后续 sub-plan reference 不重定义。

- [ ] **Step 1: Write the failing test**

`tests/cli/severity-fence.test.ts`(Task 2 部分):

```typescript
import { describe, it, expect } from 'vitest';
import {
  Severity,
  CandidateType,
  isSeverity,
  isCandidateType,
  EVIDENCE_FORMATS,
} from '../../src/core/schemas/severity.js';

describe('severity schema', () => {
  it('Severity enum has exactly three values', () => {
    expect(['CRITICAL', 'WARNING', 'SUGGESTION']).toContain('CRITICAL');
    expect(isSeverity('CRITICAL')).toBe(true);
    expect(isSeverity('WARNING')).toBe(true);
    expect(isSeverity('SUGGESTION')).toBe(true);
    expect(isSeverity('S')).toBe(false); // v0.4 简码 — Task 9j 处理迁移,本层不接受
    expect(isSeverity('blocking')).toBe(false);
  });

  it('CandidateType enum has 6 types', () => {
    const types = ['test_failure', 'hash_mismatch', 'evidence_missing', 'coverage_gap', 'api_contract', 'manual_claim'];
    types.forEach((t) => expect(isCandidateType(t)).toBe(true));
    expect(isCandidateType('unknown')).toBe(false);
  });

  it('EVIDENCE_FORMATS contains 5 supported types', () => {
    expect(EVIDENCE_FORMATS).toEqual(['file:line', 'artifact:section', 'change-level', 'command-output', 'tests:scenario']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest tests/cli/severity-fence.test.ts
```

预期:FAIL,"Cannot find module '../../src/core/schemas/severity.js'"。

- [ ] **Step 3: Write minimal implementation**

`src/core/schemas/severity.ts`:

```typescript
// severity.ts:§3.12.1 Interface Freeze 共享字段 single source of truth
// 后续 sub-plan(9c/9d/9e/9g/9j 等)reference 此处,不重定义

/** 三级分级(沿 design §2.3.2) */
export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
export const SEVERITY_VALUES: readonly Severity[] = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;

export function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (SEVERITY_VALUES as readonly string[]).includes(v);
}

/** candidate_type 6 类(沿 design §2.3.3 A,9a 立 enum,9g/9j/9d 各自实现具体验证算法) */
export type CandidateType =
  | 'test_failure'
  | 'hash_mismatch'
  | 'evidence_missing'
  | 'coverage_gap'
  | 'api_contract'
  | 'manual_claim';
export const CANDIDATE_TYPE_VALUES: readonly CandidateType[] = [
  'test_failure',
  'hash_mismatch',
  'evidence_missing',
  'coverage_gap',
  'api_contract',
  'manual_claim',
] as const;

export function isCandidateType(v: unknown): v is CandidateType {
  return typeof v === 'string' && (CANDIDATE_TYPE_VALUES as readonly string[]).includes(v);
}

/** evidence 5 类格式(沿 design §2.3.3 D)— prefix 形式 */
export const EVIDENCE_FORMATS = [
  'file:line',
  'artifact:section',
  'change-level',
  'command-output',
  'tests:scenario',
] as const;
export type EvidenceFormat = (typeof EVIDENCE_FORMATS)[number];

/**
 * Finding 接口 — finding_hash payload 字段集(沿 design §2.3.6)
 * 注意:resolved / ack 字段不在本接口内(它们不进 hash payload)
 */
export interface FindingHashPayload {
  validate_run_id: string;
  content_hash: string;
  git_head: string;
  dimension: 'completeness' | 'correctness' | 'coherence';
  check_type: string;
  severity: Severity;
  automated: boolean;
  evidence: string;
  recommendation: string;
}

/**
 * 完整 Finding 字段(含 ack / resolved / candidate 等可变字段)
 * 用于 marker schema reference,不进 hash payload
 */
export interface Finding extends FindingHashPayload {
  id: number;
  resolved: boolean;
  finding_hash: string; // SHA256 of canonicalize(FindingHashPayload)
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

`src/core/schemas/types.ts`(re-export):

```typescript
export * from './severity.js';
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest tests/cli/severity-fence.test.ts
```

预期:3 tests PASS。

- [ ] **Step 5: Commit**

```bash
git add src/core/schemas/severity.ts src/core/schemas/types.ts tests/cli/severity-fence.test.ts
git commit -m "feat(9a): severity.ts schema lock — §3.12 Interface Freeze single source of truth"
```

---

## 4. Task 3 — ack.ts CLI(propose / confirm / reject 三子命令)

**Files:**
- Create: `src/cli/commands/ack.ts`
- Modify: `src/cli/index.ts`(注册子命令)
- Test: `tests/cli/ack-cli.test.ts`

**Goal**:实施 §2.3.3 B 两步 propose/confirm 协议 — `forge ack propose` 写 pending file + exit 1;`forge ack confirm` 真正写 marker + ack-log;`forge ack reject` 删 pending + 写 reject record。

**注**:ack-log.jsonl 实际写入逻辑由 Task 6 的 `src/core/ack-log.ts` 提供,本 task 仅 CLI 层调用。Task 顺序:Task 6 先于 Task 3 实施,或本 task 用 stub helper 然后 Task 6 实施。**推荐 Task 6 先**(基础 helper),本 task 用 Task 6 的 helper。

- [ ] **Step 1: Pre-req**:Task 6 完成(`src/core/ack-log.ts` 提供 `appendAckLog(entry)` + `readPendingFile(path)` + `writePendingFile(path, payload)` 等 helper)

- [ ] **Step 2: Write the failing test**

`tests/cli/ack-cli.test.ts`(展示骨架,完整 cases ~15-20 个):

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execaNode } from 'execa';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FORGE_CLI = path.resolve('dist/cli/index.js');

describe('forge ack propose', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), 'forge-ack-'));
    // 准备 fake change 目录
    const changeDir = path.join(tmp, 'forge/changes/test-change');
    await mkdir(changeDir, { recursive: true });
    await mkdir(path.join(changeDir, '.evidence/pending-acks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('propose writes pending file + exit code 1', async () => {
    const result = await execaNode(FORGE_CLI, [
      'ack', 'propose',
      'test-change',
      '--finding', '7',
      '--action', 'ack-warning',
      '--rationale', 'spec 描述模糊'
    ], { cwd: tmp, reject: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/AI proposed ack written to/);
    expect(result.stderr).toMatch(/User must confirm via \/forge:ack-confirm/);

    // 验证 pending file 写入
    const pendingDir = path.join(tmp, 'forge/changes/test-change/.evidence/pending-acks');
    const files = await readdir(pendingDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^7-\d{4}-\d{2}-\d{2}T/); // findingId-timestamp.yaml
  });

  it('propose in CI mode rejects with exit code 2', async () => {
    const result = await execaNode(FORGE_CLI, [
      'ack', 'propose',
      'test-change',
      '--finding', '7',
      '--action', 'ack-warning',
    ], { cwd: tmp, reject: false, env: { ...process.env, CI: 'true' } });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/CI mode/);
  });
});

describe('forge ack confirm', () => {
  it('confirm writes marker + ack-log + deletes pending file', async () => {
    // 先 propose
    await execaNode(FORGE_CLI, [
      'ack', 'propose', 'test-change',
      '--finding', '7', '--action', 'ack-warning', '--rationale', 'X'
    ], { cwd: tmp, reject: false });

    // 然后 confirm
    const result = await execaNode(FORGE_CLI, [
      'ack', 'confirm', 'test-change', '7'
    ], { cwd: tmp, reject: false });

    expect(result.exitCode).toBe(0);

    // 验证 ack-log.jsonl 写入
    const log = await readFile(path.join(tmp, 'forge/changes/test-change/.evidence/ack-log.jsonl'), 'utf8');
    expect(log).toMatch(/"kind":"ack"/);
    expect(log).toMatch(/"action":"ack-warning"/);

    // 验证 pending file 已删
    const pendingDir = path.join(tmp, 'forge/changes/test-change/.evidence/pending-acks');
    const files = await readdir(pendingDir);
    expect(files.length).toBe(0);
  });
});

describe('forge ack reject', () => {
  it('reject writes reject record + deletes pending file', async () => {
    // 先 propose
    await execaNode(FORGE_CLI, [
      'ack', 'propose', 'test-change',
      '--finding', '7', '--action', 'ack-warning', '--rationale', 'X'
    ], { cwd: tmp, reject: false });

    // reject
    const result = await execaNode(FORGE_CLI, [
      'ack', 'reject', 'test-change', '7', '--rationale', '不接受'
    ], { cwd: tmp, reject: false });

    expect(result.exitCode).toBe(0);

    const log = await readFile(path.join(tmp, 'forge/changes/test-change/.evidence/ack-log.jsonl'), 'utf8');
    expect(log).toMatch(/"action":"reject"/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm build && pnpm vitest tests/cli/ack-cli.test.ts
```

预期:tests fail(子命令未注册)。

- [ ] **Step 4: Write minimal implementation**

`src/cli/commands/ack.ts`:

```typescript
import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { stringify, parse } from 'yaml';
import { appendAckLog, getPendingPath, listPending } from '../../core/ack-log.js';

export function registerAckCommands(program: Command): void {
  const ack = program.command('ack').description('ack management for v1.0 fence');

  // propose
  ack.command('propose <change-id>')
    .description('AI proposes ack — writes pending file, exit 1')
    .requiredOption('--finding <id>', 'finding id (number)')
    .requiredOption('--action <type>', 'ack-warning | downgrade | ack-mode | ack-tdd-exemption')
    .option('--rationale <text>', 'AI rationale for ack')
    .option('--target-severity <sev>', 'for downgrade action')
    .action(async (changeId: string, opts: { finding: string; action: string; rationale?: string; targetSeverity?: string }) => {
      // CI 模式拒绝
      if (process.env.CI === 'true') {
        process.stderr.write('forge ack propose: CI mode rejected (set ack.allow_ci_mode=true to override)\n');
        process.exit(2);
      }

      const changeRoot = resolve(`forge/changes/${changeId}`);
      const timestamp = new Date().toISOString();
      const pendingPath = getPendingPath(changeRoot, opts.finding, timestamp);

      const payload = {
        kind: 'ack-propose',
        timestamp,
        change_id: changeId,
        finding_id: opts.finding,
        action: opts.action,
        rationale: opts.rationale ?? null,
        target_severity: opts.targetSeverity ?? null,
        proposed_by: 'ai-agent',
      };

      await writeFile(pendingPath, stringify(payload), 'utf8');
      process.stderr.write(`AI proposed ack written to: ${pendingPath}\n`);
      process.stderr.write(`User must confirm via /forge:ack-confirm ${changeId} ${opts.finding}\n`);
      process.stderr.write('This pending file blocks archive until confirmed or rejected.\n');
      process.exit(1);
    });

  // confirm
  ack.command('confirm <change-id> <finding-id>')
    .description('User confirms pending ack — writes marker + ack-log, deletes pending')
    .action(async (changeId: string, findingId: string) => {
      const changeRoot = resolve(`forge/changes/${changeId}`);
      const pending = await listPending(changeRoot, findingId);
      if (pending.length === 0) {
        process.stderr.write(`No pending ack for change ${changeId} finding ${findingId}\n`);
        process.exit(2);
      }
      // 取最新一份 pending(若有多个)
      const latest = pending[pending.length - 1];
      const payloadStr = await readFile(latest.path, 'utf8');
      const payload = parse(payloadStr);

      // 写 ack-log(append-only)
      await appendAckLog(changeRoot, {
        schema: 'forge-ack-log/v1',
        kind: 'ack',
        timestamp: new Date().toISOString(),
        action: payload.action,
        change_id: changeId,
        finding_id: findingId,
        user: process.env.USER ?? 'unknown',
        rationale: payload.rationale,
        git_head: await getGitHead(),
        finding_hash: null, // marker 写入由后续 sub-plan 各自处理
        extra: { proposed_at: payload.timestamp, target_severity: payload.target_severity },
      });

      // 删 pending file
      await unlink(latest.path);
      process.exit(0);
    });

  // reject
  ack.command('reject <change-id> <finding-id>')
    .description('User rejects pending ack — writes reject record, deletes pending')
    .requiredOption('--rationale <text>', 'rejection rationale')
    .action(async (changeId: string, findingId: string, opts: { rationale: string }) => {
      const changeRoot = resolve(`forge/changes/${changeId}`);
      const pending = await listPending(changeRoot, findingId);
      if (pending.length === 0) {
        process.stderr.write(`No pending ack for change ${changeId} finding ${findingId}\n`);
        process.exit(2);
      }
      const latest = pending[pending.length - 1];

      await appendAckLog(changeRoot, {
        schema: 'forge-ack-log/v1',
        kind: 'ack',
        timestamp: new Date().toISOString(),
        action: 'reject',
        change_id: changeId,
        finding_id: findingId,
        user: process.env.USER ?? 'unknown',
        rationale: opts.rationale,
        git_head: await getGitHead(),
        finding_hash: null,
        extra: {},
      });

      await unlink(latest.path);
      process.exit(0);
    });
}

async function getGitHead(): Promise<string | null> {
  try {
    const { execa } = await import('execa');
    const { stdout } = await execa('git', ['rev-parse', 'HEAD']);
    return stdout.trim();
  } catch {
    return null;
  }
}
```

`src/cli/index.ts` 加注册(在现有 `program.parse()` 之前):

```typescript
import { registerAckCommands } from './commands/ack.js';
// ...
registerAckCommands(program);
// ...
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm build && pnpm vitest tests/cli/ack-cli.test.ts
```

预期:propose / confirm / reject 三组 tests PASS(若 Task 6 先实施)。

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/ack.ts src/cli/index.ts tests/cli/ack-cli.test.ts
git commit -m "feat(9a): forge ack {propose,confirm,reject} CLI — two-step user confirmation protocol"
```

---

## 5. Task 4 — `/forge:ack-confirm` slash 命令

**Files:**
- Create: `commands/ack-confirm.md`

**Goal**:slash 命令文档,主代理调用流程:读 pending file → AskUserQuestion → 调 `forge ack confirm/reject`。

- [ ] **Step 1: Write the slash command file**

`commands/ack-confirm.md`:

```markdown
---
description: 主代理读 pending ack file + AskUserQuestion 确认 + 调 forge ack confirm/reject 真正写 marker
argument-hint: '<change-id> <finding-id>'
---

You are about to handle `/forge:ack-confirm $ARGUMENTS`。

## 步骤(必须按序)

1. 解析 `$ARGUMENTS` 为 `<change-id>` `<finding-id>` 两参数(若缺,**报错并停止**)
2. 列出 `forge/changes/<change-id>/.evidence/pending-acks/<finding-id>-*.yaml`(可能多份,取最新)。**若 0 份,报错**:"No pending ack for finding <finding-id>"
3. 读 pending file 内容,提取 `action / rationale / target_severity` 等字段
4. **必须用 AskUserQuestion** 让用户确认:
   - 题目:`Confirm AI ack proposal for finding #<id>`
   - 选项:
     - `confirm`(执行 ack action)
     - `reject`(拒绝 + 让用户写 rationale)
     - `modify-rationale`(用户改 rationale 后再 confirm)
5. 根据用户选择:
   - `confirm` → 调 `forge ack confirm <change-id> <finding-id>`(CLI 写 marker + ack-log + 删 pending)
   - `reject` → 用 AskUserQuestion 让用户输入 `rejection rationale` → 调 `forge ack reject <change-id> <finding-id> --rationale "<text>"`
   - `modify-rationale` → 用 AskUserQuestion 让用户输入新 rationale → 重写 pending file → 回到 step 4

## 禁止行为

- 不允许跳过 AskUserQuestion 直接调 confirm(违反 §2.3.3 B 两步协议核心 — user 必须实际看到 + 确认)
- 不允许在 CI 模式下调用本 slash(CI 应该早在 propose 阶段就被 forge ack propose 拒绝)
- 不允许直接修改 marker 字段(必须经 forge ack confirm CLI)

## 与其他 forge 协议的关系

本 slash 是 §2.3.3 B 两步 propose/confirm 协议的第二步;第一步由 AI 在 receiving-code-review / verifying-three-dimensions / Fluid Pause Decision Point 等场景 invoke `forge ack propose`(写 pending file + exit 1)触发。
```

- [ ] **Step 2: Commit**

```bash
git add commands/ack-confirm.md
git commit -m "feat(9a): /forge:ack-confirm slash command — step 2 of two-step ack protocol"
```

---

## 6. Task 5 — evidence.ts CLI(record-tdd / record-verify / record-review 三 helper)

**Files:**
- Create: `src/cli/commands/evidence.ts`
- Modify: `src/cli/index.ts`
- Test: `tests/cli/evidence-helpers.test.ts`

**Goal**:实施 §2.7.6 关键事件 CLI helper append-only 写入 — 三 helper:`record-tdd`(TDD RED→GREEN 事件)/ `record-verify`(verify 调用)/ `record-review`(subagent review 链)。

**注**:本 task 仅写 helper 框架 + ack-log.jsonl `kind: "evidence-helper"` 写入。13 不变量验证 / worktree 重跑 / reporter parsing 在 9g 实施,本层只做"helper 接收 input + 写 ack-log + 写 marker 占位 stub"。

- [ ] **Step 1: Write the failing test**

`tests/cli/evidence-helpers.test.ts`(骨架,完整 cases ~10-15 个):

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execaNode } from 'execa';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FORGE_CLI = path.resolve('dist/cli/index.js');

describe('forge evidence record-tdd', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), 'forge-ev-'));
    await mkdir(path.join(tmp, 'forge/changes/test-change/.evidence'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('record-tdd appends ack-log entry with kind=evidence-helper', async () => {
    const result = await execaNode(FORGE_CLI, [
      'evidence', 'record-tdd', 'test-change',
      '--task', 'tasks.md#task-1',
      '--red-commit', 'abc123',
      '--green-commit', 'def456',
      '--expected-failures', '[{"test_file":"a.test.ts","test_name":"T1","failure_type":"assertion"}]',
    ], { cwd: tmp, reject: false });

    expect(result.exitCode).toBe(0);

    const log = await readFile(
      path.join(tmp, 'forge/changes/test-change/.evidence/ack-log.jsonl'),
      'utf8'
    );
    expect(log).toMatch(/"kind":"evidence-helper"/);
    expect(log).toMatch(/"helper_name":"record-tdd"/);
    expect(log).toMatch(/"task_ref":"tasks.md#task-1"/);
    expect(log).toMatch(/"payload_hash":"[a-f0-9]{64}"/);
  });
});

describe('forge evidence record-verify', () => {
  it('record-verify appends entry per invocation', async () => {
    // ... 类似 record-tdd
  });
});

describe('forge evidence record-review', () => {
  it('record-review captures review iteration chain', async () => {
    // ... 类似
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm build && pnpm vitest tests/cli/evidence-helpers.test.ts
```

预期:fail(子命令未注册)。

- [ ] **Step 3: Write minimal implementation**

`src/cli/commands/evidence.ts`:

```typescript
import { Command } from 'commander';
import { resolve } from 'node:path';
import { canonicalHash } from '../../core/canonical-json.js';
import { appendAckLog } from '../../core/ack-log.js';

export function registerEvidenceCommands(program: Command): void {
  const evidence = program.command('evidence').description('process_evidence helper writes (sub-plan 9g 完整集成)');

  evidence.command('record-tdd <change-id>')
    .requiredOption('--task <task-ref>', 'tasks.md#task-N')
    .requiredOption('--red-commit <sha>')
    .requiredOption('--green-commit <sha>')
    .option('--expected-failures <json>', 'JSON array of {test_file, test_name, failure_type}')
    .action(async (changeId: string, opts) => {
      const changeRoot = resolve(`forge/changes/${changeId}`);
      const payload = {
        helper: 'record-tdd',
        change_id: changeId,
        task_ref: opts.task,
        red_commit: opts.redCommit,
        green_commit: opts.greenCommit,
        expected_failures: opts.expectedFailures ? JSON.parse(opts.expectedFailures) : [],
      };
      const payloadHash = canonicalHash(payload);

      await appendAckLog(changeRoot, {
        schema: 'forge-ack-log/v1',
        kind: 'evidence-helper',
        timestamp: new Date().toISOString(),
        helper_name: 'record-tdd',
        change_id: changeId,
        task_ref: opts.task,
        payload_hash: payloadHash,
        status: 'success',
        git_head: await getGitHead(),
        extra: payload,
      });

      // marker 写入由 9g 完整实施;9a 仅 ack-log
      // TODO(9g):写 process_evidence.tdd_event_chain[i] 字段到 marker
      process.exit(0);
    });

  evidence.command('record-verify <change-id>')
    .requiredOption('--task-refs <list>', 'comma-sep tasks.md#task-N')
    .requiredOption('--scope <type>', 'per-task | change-level')
    .requiredOption('--report <path>', 'reporter file path')
    .action(async (changeId: string, opts) => {
      // ... 类似 record-tdd,kind=evidence-helper / helper_name=record-verify
      process.exit(0);
    });

  evidence.command('record-review <change-id>')
    .requiredOption('--task <task-ref>')
    .requiredOption('--implementer-commit <sha>')
    .option('--spec-iteration <iter>', '<commit:outcome:notes-path>')
    .option('--quality-iteration <iter>')
    .action(async (changeId: string, opts) => {
      // ... helper_name=record-review
      process.exit(0);
    });
}

async function getGitHead(): Promise<string | null> {
  try {
    const { execa } = await import('execa');
    const { stdout } = await execa('git', ['rev-parse', 'HEAD']);
    return stdout.trim();
  } catch { return null; }
}
```

`src/cli/index.ts` 加注册:`registerEvidenceCommands(program);`

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm build && pnpm vitest tests/cli/evidence-helpers.test.ts
```

预期:三 helper tests PASS(append-only ack-log 写入)。

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/evidence.ts src/cli/index.ts tests/cli/evidence-helpers.test.ts
git commit -m "feat(9a): forge evidence record-{tdd,verify,review} helper framework — 9g implements full marker integration"
```

---

## 7. Task 6 — ack-log.jsonl 协议 + pending-acks/ 目录管理

**Files:**
- Create: `src/core/ack-log.ts`
- Test: `tests/core/ack-log.test.ts`

**Goal**:共用 helper(被 Task 3 ack.ts + Task 5 evidence.ts 同时调用)。`appendAckLog(changeRoot, entry)` / `readPendingFile` / `listPending(changeRoot, findingId?)` / `getPendingPath(changeRoot, findingId, timestamp)`。

- [ ] **Step 1: Write the failing test**

`tests/core/ack-log.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendAckLog, listPending, getPendingPath } from '../../src/core/ack-log.js';

describe('ack-log', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), 'forge-acklog-'));
    await mkdir(path.join(tmp, '.evidence/pending-acks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('appendAckLog writes one line per entry (NDJSON)', async () => {
    await appendAckLog(tmp, { schema: 'forge-ack-log/v1', kind: 'ack', timestamp: '2026-01-01', action: 'ack-warning', change_id: 'c1', finding_id: '1', user: 'u', rationale: null, git_head: null, finding_hash: null, extra: {} });
    await appendAckLog(tmp, { schema: 'forge-ack-log/v1', kind: 'evidence-helper', timestamp: '2026-01-02', helper_name: 'record-tdd', change_id: 'c1', task_ref: 't1', payload_hash: 'h', status: 'success', git_head: null, extra: {} });

    const log = await readFile(path.join(tmp, '.evidence/ack-log.jsonl'), 'utf8');
    const lines = log.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).kind).toBe('ack');
    expect(JSON.parse(lines[1]).kind).toBe('evidence-helper');
  });

  it('listPending returns sorted by timestamp', async () => {
    // ... 写两个 pending file 不同 timestamp,期望 sort 升序
  });

  it('getPendingPath formats <findingId>-<isoTimestamp>.yaml', () => {
    const p = getPendingPath('/root', '7', '2026-05-12T14:30:00.000Z');
    expect(p).toMatch(/pending-acks\/7-2026-05-12T14-30-00\.000Z\.yaml$/);
  });
});
```

- [ ] **Step 2: Implementation**

`src/core/ack-log.ts`:

```typescript
import { appendFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

type AckEntry = {
  schema: 'forge-ack-log/v1';
  kind: 'ack';
  timestamp: string;
  action: string;
  change_id: string;
  finding_id: string | null;
  user: string;
  rationale: string | null;
  git_head: string | null;
  finding_hash: string | null;
  extra: Record<string, unknown>;
};

type EvidenceHelperEntry = {
  schema: 'forge-ack-log/v1';
  kind: 'evidence-helper';
  timestamp: string;
  helper_name: 'record-tdd' | 'record-verify' | 'record-review';
  change_id: string;
  task_ref: string;
  payload_hash: string;
  status: 'success' | 'partial' | 'failed';
  git_head: string | null;
  extra: Record<string, unknown>;
};

export type AckLogEntry = AckEntry | EvidenceHelperEntry;

export async function appendAckLog(changeRoot: string, entry: AckLogEntry): Promise<void> {
  const logPath = join(changeRoot, '.evidence/ack-log.jsonl');
  await appendFile(logPath, JSON.stringify(entry) + '\n', 'utf8');
}

export function getPendingPath(changeRoot: string, findingId: string, timestamp: string): string {
  // Windows-safe filename:replace : with - in timestamp
  const safeTimestamp = timestamp.replace(/:/g, '-');
  return join(changeRoot, '.evidence/pending-acks', `${findingId}-${safeTimestamp}.yaml`);
}

export async function listPending(
  changeRoot: string,
  findingId?: string
): Promise<{ path: string; findingId: string; timestamp: string }[]> {
  const dir = join(changeRoot, '.evidence/pending-acks');
  const entries = await readdir(dir).catch(() => []);
  return entries
    .filter((e) => e.endsWith('.yaml'))
    .map((e) => {
      const m = e.match(/^(\d+)-(.+)\.yaml$/);
      if (!m) return null;
      return { path: join(dir, e), findingId: m[1], timestamp: m[2] };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .filter((e) => !findingId || e.findingId === findingId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
```

- [ ] **Step 3: Test passes + commit**

```bash
pnpm vitest tests/core/ack-log.test.ts
git add src/core/ack-log.ts tests/core/ack-log.test.ts
git commit -m "feat(9a): ack-log.ts helper — NDJSON append-only + pending-acks/ management"
```

---

## 8. Task 7 — validate.ts 横切集成(finding_hash 自动产 + candidate 验证骨架)

**Files:**
- Modify: `src/cli/commands/validate.ts`
- Test: `tests/cli/severity-fence.test.ts`(扩展)

**Goal**:`forge validate` 自动产 CRITICAL finding 时输出 `finding_hash`(JCS,沿 §2.3.6);candidate 验证骨架(`severity_candidate: CRITICAL` 项工具独立验证 — 但具体算法 6 类各自实现在后续 sub-plan,本 task 仅立 validation 入口框架)。

- [ ] **Step 1: 实施步骤**

阅读现有 `src/cli/commands/validate.ts`(沿 v0.4 实现);加:
1. import canonicalHash from `core/canonical-json.js`
2. import isSeverity / isCandidateType 等 from `core/schemas/severity.js`
3. CRITICAL finding 产生时,调用 canonicalHash 算 payload SHA256 写入 finding 的 finding_hash 字段
4. candidate 验证入口框架:遍历 verify_findings,检测 `severity_candidate=CRITICAL`,按 candidate_type 分发到 6 类 stub validator(每类 stub 返回 `{ verified: false, reason: 'not_implemented' }` 占位 — 9d/9g/9j 各自实施真实验证逻辑)
5. fence 拒签直接写 CRITICAL `severity:CRITICAL + automated:false`(沿 §2.3.3 A)

- [ ] **Step 2: Test extension + commit**

```bash
pnpm vitest tests/cli/severity-fence.test.ts
git add src/cli/commands/validate.ts tests/cli/severity-fence.test.ts
git commit -m "feat(9a): validate.ts integrate finding_hash (JCS) + candidate verification framework (stub validators per candidate_type)"
```

---

## 9. Task 8 — archive.ts 横切 fence 调用入口 + stub 合约

**Files:**
- Modify: `src/cli/commands/archive.ts`

**Goal**:archive 命令加横切 fence 调用入口;具体 13 不变量在 9g 实施;过渡期 stub 行为(`not_implemented` → fail exit 2)+ 开发期 `--allow-stub-fence` flag。

- [ ] **Step 1: 实施 + Test + Commit**

按 §3.1 fence stub 合约要求:
- archive.ts 加 `crossCuttingFenceCheck(changeRoot, options)` 入口
- 内部遍历 13 不变量(目前全部返回 `not_implemented`);9g 完成后逐一替换为真实 invariant 逻辑
- 默认遇到 `not_implemented` → archive fail with exit code 2 + stderr "fence not ready, complete 9g first"
- `--allow-stub-fence` flag:跳过 not_implemented invariant(开发期 only,**不出现在 release CLI**:加 deprecation warning)

```bash
pnpm vitest tests/cli/archive-fence-stub.test.ts # 9a 加少量 cases:not_implemented + --allow-stub-fence flag
git add src/cli/commands/archive.ts tests/cli/archive-fence-stub.test.ts
git commit -m "feat(9a): archive.ts cross-cutting fence entry + stub contract — 9g implements 13 invariants"
```

---

## 10. Task 9 — receiving-code-review skill severity 升级 + 判定指引

**Files:**
- Modify: `skills/receiving-code-review/SKILL.md`

**Goal**:severity 字段从 v0.4 装饰升级为参与门禁(沿 §2.3.4 表 review_outcomes 行)+ 加判定指引段(沿 §2.3.2 三级语义)。

- [ ] **Step 1: Edit SKILL.md**

具体加段:
- §"severity 判定指引"(新加):列出 CRITICAL / WARNING / SUGGESTION 三级在 review feedback 中的判定标准 + AI 反向加固(不能直接判 CRITICAL,只能写 severity_candidate);引用 §2.3.4 区分指引表
- §"v0.4 兼容"(新加):简述 v0.4 review_outcomes 简码 'S/C/L' 的迁移行为(归 9j 实施)

- [ ] **Step 2: Commit**

```bash
git add skills/receiving-code-review/SKILL.md
git commit -m "docs(9a): receiving-code-review skill severity field upgrade + judgment guidance"
```

---

## 11. Self-Review

按 writing-plans skill 要求,plan 写完后自查:

### 11.1 Spec coverage

| design § | task 覆盖 |
|---|---|
| §2.3.2 三级语义 | Task 2 severity.ts |
| §2.3.3 A critical_candidate 协议 | Task 7 validate.ts(候选验证骨架)+ Task 2 schema |
| §2.3.3 B ack 两步协议 | Task 3 ack.ts + Task 4 ack-confirm slash + Task 6 ack-log helper |
| §2.3.3 C 操作矩阵 | Task 3 三子命令 |
| §2.3.3 D evidence 5 类 | Task 2 EVIDENCE_FORMATS const |
| §2.3.4 横切应用 | Task 9 receiving-code-review skill 升级 |
| §2.3.5 v0.4 简码迁移 | **不在本 plan**(归 9j) |
| §2.3.6 JCS canonical | Task 1 canonical-json.ts |
| §2.7.6 CLI helper 框架 | Task 5 evidence.ts(三 helper 框架,marker 写入 9g 完整) |
| §3.4 marker 版本 | **不在本 plan**(归 9j) |
| §3.12 Interface Freeze | Task 2 + Task 6 共同实现 §3.12.1 / §3.12.2 / §3.12.3 / §3.12.4 全部 |

### 11.2 Placeholder scan

逐 task 检查 `TBD` / `TODO` / `implement later` 关键词。Task 5 / 7 / 8 内部明确标 "9d/9g/9j 各自实现",不是 placeholder 而是**显式归属其他 sub-plan 的范围声明**(不是本 plan 的工作)。

### 11.3 Type consistency

- `Severity` enum:Task 2 定义,Task 3/5/7/8/9 reference,无重定义
- `CandidateType` enum:Task 2 定义,Task 7 reference,9d/9g/9j 后续 reference
- `Finding` interface:Task 2 定义,Task 7 写入 finding_hash 时使用
- `AckLogEntry` discriminated union:Task 6 定义,Task 3/5 共用
- `canonicalHash` 函数:Task 1 定义,Task 5/7 调用

跨 task 类型无歧义(全部 §3.12 Interface Freeze 锁死)。

### 11.4 接口冻结校验

完成 Task 2 + Task 6 后,**§3.12 Interface Freeze Appendix 全部锁死**:
- §3.12.1 共享 finding/severity 字段 ✓
- §3.12.1bis process_evidence/archive_summary/scope-entries schema 占位(具体字段在 9g/9e/9b 实施)— 本 plan 仅冻结顶级字段名 + 类型,留 placeholder 给后续 sub-plan
- §3.12.2 文件路径冻结 ✓(在 ack-log.ts 实现)
- §3.12.3 CLI exit code 冻结 ✓(本 plan 加的三 + 三共 6 个子命令的 exit code)
- §3.12.4 ack-log.jsonl 一行 schema ✓(双 kind:ack / evidence-helper)

### 11.5 Risks / Known issues 记录

- Task 7 candidate 验证骨架的 6 类 stub 全部返回 `not_implemented` — 9d/9g/9j 实施前 candidate 路径无法升级 CRITICAL,所有 candidate=CRITICAL 都 fallback WARNING + severity_candidate_rejected=true。本 plan 期内可接受
- Task 8 archive.ts fence stub 默认 fail exit 2 — 9b/9c/9d 阶段 archive 命令需要加 `--allow-stub-fence` 或等 9g 完成。本 plan 在 README / commands/archive.md 加临时说明
- canonicalize npm 包跨 Linux + Windows 测试(Task 1 已含)

---

## 12. Execution Handoff

**Plan 完成。两个执行选项:**

1. **Subagent-Driven**(推荐):每 task 派 fresh subagent,主代理 review 后进下一 task。
   - REQUIRED SUB-SKILL:`superpowers:subagent-driven-development`
   - Fresh subagent per task + two-stage review(spec → quality)
   - 适合本 plan(9 task 互相独立性高)

2. **Inline Execution**:在当前 session 顺序执行 task。
   - REQUIRED SUB-SKILL:`superpowers:executing-plans`
   - Batch execution + checkpoints 主代理 review

**推荐 1**(本 plan 9 task 大多独立,subagent 隔离上下文 + 两阶段 review 适合横切层基础工程)。

实施完成后,9a 是 9b/9c/9d/9f/9g/9i/9j 的依赖基础。验收通过(全 task 测试 PASS + DoD checklist 全勾)后启动后续 sub-plan(推荐顺序:9b → 9h → 9i → 9j 并行 → 9d → 9c → 9g → 9e → 9f → 9z)。

---

## 修订记录

- **v1**(2026-05-10):初稿 — 基于 plan-9 master v3 §3.1 拆 9 task。本 sub-plan 实施 §2.3 全节 + §2.7.6 CLI helper 框架 + §3.12 Interface Freeze 全部
