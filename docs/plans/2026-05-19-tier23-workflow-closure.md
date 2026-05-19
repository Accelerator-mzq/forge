# Tier 2/3 Workflow Closure 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL:用 `forge:subagent-driven-development` 逐 task 实施本计划。步骤用 checkbox(`- [ ]`)跟踪。
> **权威 spec**:`docs/specs/2026-05-19-tier23-workflow-closure-design.md`(经 9 轮 Codex 对抗性审查收敛,R1-R31)。本计划与 spec 冲突时以 spec 为准。

**Goal:** 让 forge 的 Codex/OpenCode(Tier 2/3)能跑通完整 6 步 marker 工作流 —— 5 个 stage skill 加桥接段指向 `commands/*.md`,并修复 forge-wide 的 `forge ack confirm` 不写 marker 既有 bug。

**Architecture:** 两块。(A)forge-core:扩 `forge ack confirm` 写 marker ack 字段 + ack-log `finding_hash`,修 `ack-log.ts` 的 pending 文件名 namespace。(B)桥接:新增 `skills/_shared/tier23-command-bridge.md` 替换规则,5 个 stage skill 各加「Tier 2/3 Orchestration」段指示 AI Read 对应 `commands/<stage>.md` 执行;命令文件 0 改动(唯一例外 `ack-confirm.md` 一处文本同步)。

**Tech Stack:** TypeScript(Node ≥ 20.19,commander)、vitest、pnpm。`yaml` 包做 marker 读写。markdown skill/command 文件。

**执行顺序约束:** Phase A(forge-core ack 修复)→ B(桥接基础)→ C(stage skill)→ D(文档)→ E(测试+build+收尾)。A 是 verify/review/ack 闭环的代码前置,先行。改 `skills/` 后必跑 `pnpm build`(Phase E 统一)。

---

## Phase A — forge-core ack 修复(TS,TDD)

### Task A1:`ack-log.ts` pending 文件名 namespace 编码

让 pending 文件名兼容 `pause_decisions:<id>` 形态的 finding id(含 `:`,Windows 非法)。对应 spec §5.1.3。

**Files:**

- Modify:`src/core/ack-log.ts`(`getPendingPath` 第 151-158 行、`listPending` 第 169-211 行、`PENDING_FILE_RE` 第 99 行)
- Create:`tests/core/ack-log-pending.test.ts`

- [ ] **Step 1:写失败测试**

```typescript
// tests/core/ack-log-pending.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPendingPath, listPending } from '../../src/core/ack-log.js';

describe('ack-log pending 文件名 namespace 编码', () => {
  const TS = '2026-05-19T10:30:00.000Z';
  const SAFE = '2026-05-19T10-30-00.000Z';

  it('纯数字 findingId:文件名不变(向后兼容)', () => {
    const p = getPendingPath('/r', '5', TS);
    expect(p.endsWith(`/.evidence/pending-acks/5-${SAFE}.yaml`)).toBe(true);
  });

  it('pause_decisions:<id> findingId:冒号被 encodeURIComponent 编码', () => {
    const p = getPendingPath('/r', 'pause_decisions:1', TS);
    expect(p.endsWith(`/pending-acks/pause_decisions%3A1-${SAFE}.yaml`)).toBe(true);
    expect(p.includes(':1-')).toBe(false); // 原始冒号不出现在文件名
  });

  it('listPending:编码文件名解码还原原始 findingId', async () => {
    const root = mkdtempSync(join(tmpdir(), 'acklog-'));
    const dir = join(root, '.evidence', 'pending-acks');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `pause_decisions%3A2-${SAFE}.yaml`), 'kind: ack-propose\n');
    writeFileSync(join(dir, `7-${SAFE}.yaml`), 'kind: ack-propose\n');
    const all = await listPending(root);
    expect(all.map((x) => x.findingId).sort()).toEqual(['7', 'pause_decisions:2']);
    const filtered = await listPending(root, 'pause_decisions:2');
    expect(filtered).toHaveLength(1);
  });
});
```

- [ ] **Step 2:跑测试确认失败**

Run:`pnpm vitest run tests/core/ack-log-pending.test.ts`
Expected:FAIL —— pause_decisions 用例下 `getPendingPath` 产出含 `:` 文件名、`listPending` 的 `PENDING_FILE_RE`(`^(\d+)-...`)匹配不到编码文件名。

- [ ] **Step 3:实现 —— 改 `ack-log.ts` 三处**

`PENDING_FILE_RE`(第 99 行)改为从右锚定 timestamp,group 1 容纳编码后的 findingId:

```typescript
// 文件名 <encodeURIComponent(findingId)>-<safeTimestamp>.yaml
// safeTimestamp = ISO 时间戳冒号替换连字符:YYYY-MM-DDTHH-MM-SS.mmmZ
// timestamp 段从右精确锚定 → group 1(findingId)即使含 '-' 也无切分歧义
const PENDING_FILE_RE = /^(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)\.yaml$/;
```

`getPendingPath`(第 154 行)findingId 段做 filename-safe 编码:

```typescript
export function getPendingPath(changeRoot: string, findingId: string, timestamp: string): string {
  const safeTimestamp = timestamp.replace(/:/g, '-');
  // findingId 可能含 ':'(pause_decisions:<id>),encodeURIComponent 编码为 %3A;
  // 纯数字 id 编码后不变 → 向后兼容
  const fileName = `${encodeURIComponent(findingId)}-${safeTimestamp}.yaml`;
  return path.join(changeRoot, PENDING_DIR_REL, fileName).replace(/\\/g, '/');
}
```

`listPending`(第 191 行)解码 group 1:

```typescript
const parsedFindingId = decodeURIComponent(match[1] ?? '');
const safeTimestamp = match[2] ?? '';
```

(`PendingItem.findingId` 注释同步:从文件名解析并 `decodeURIComponent` 还原。)

- [ ] **Step 4:跑测试确认通过**

Run:`pnpm vitest run tests/core/ack-log-pending.test.ts`
Expected:PASS(3 用例全过)。

- [ ] **Step 5:回归验证 + commit**

Run:`pnpm vitest run tests/cli/ack-cli.test.ts tests/cli/ack-cli-mode.test.ts tests/cli/ack-log-pause-decisions.test.ts`
Expected:PASS(既有 ack 测试不回归)。

```bash
git add src/core/ack-log.ts tests/core/ack-log-pending.test.ts
git commit -m "fix(ack-log): pending 文件名支持 pause_decisions:<id> namespace"
```

### Task A2:`ack confirm` —— action 分发 + `ack-warning` 写 marker + ack-log finding_hash

`forge ack confirm` 对 `ack-warning` 定位 `.verify-passed` 的 finding,写 `severity_acked_by/at`,并把 ack-log entry 的 `finding_hash` 从 `null` 改为真实值。对应 spec §5.1 步骤 1-4 + §5.1.1。

**Files:**

- Modify:`src/cli/commands/ack.ts`(confirm action,第 133-232 行)
- Create:`src/core/ack/marker-ack.ts`(新模块:marker ack 字段写入 + 定位逻辑)
- Create:`tests/cli/ack-confirm-marker.test.ts`

- [ ] **Step 1:写失败测试 —— `ack-warning` confirm 后 marker + ack-log 一致**

```typescript
// tests/cli/ack-confirm-marker.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { computeFindingHash, extractHashPayload } from '../../src/core/validate/finding-hash.js';

// 跑 CLI:node dist/cli/index.js ack confirm ...(dist 由 pnpm build 产)
function runForge(cwd: string, args: string[]): { code: number; stderr: string } {
  try {
    execFileSync('node', [join(process.cwd(), 'dist/cli/index.js'), ...args], { cwd, encoding: 'utf8' });
    return { code: 0, stderr: '' };
  } catch (e: any) {
    return { code: e.status ?? 1, stderr: String(e.stderr ?? '') };
  }
}

describe('ack confirm 写 marker —— ack-warning', () => {
  let proj: string;
  let changeDir: string;

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'ackproj-'));
    changeDir = join(proj, 'forge', 'changes', 'add-x');
    mkdirSync(join(changeDir, '.evidence', 'pending-acks'), { recursive: true });
    // WARNING + resolved=false finding;finding_hash 用真实 computeFindingHash 生成
    //(archive fence 会重算比对,placeholder 会让后续集成测试 archive 失败)
    const finding: Record<string, unknown> = {
      id: 1, dimension: 'correctness', check_type: 'requirement-mapping',
      severity: 'WARNING', automated: false, content_hash: 'sha256:abc',
      git_head: 'd4e5f6', evidence: 'ev', recommendation: 'rec', resolved: false,
      severity_acked_by: null, severity_acked_at: null,
    };
    finding.finding_hash = computeFindingHash(extractHashPayload(finding));
    writeFileSync(join(changeDir, '.verify-passed'),
      stringifyYaml({ schema: 'forge-verify/v1', verify_findings: [finding] }));
  });

  it('confirm 后 marker 写入 severity_acked_by/at,ack-log entry finding_hash 非 null 且与 marker finding 一致', () => {
    expect(runForge(proj, ['ack', 'propose', 'add-x', '--finding', '1', '--action', 'ack-warning']).code).toBe(1);
    const r = runForge(proj, ['ack', 'confirm', 'add-x', '1']);
    expect(r.code).toBe(0);
    const marker = parseYaml(readFileSync(join(changeDir, '.verify-passed'), 'utf8'));
    expect(marker.verify_findings[0].severity_acked_by).toBeTruthy();
    expect(marker.verify_findings[0].severity_acked_at).toBeTruthy();
    const log = readFileSync(join(changeDir, '.evidence', 'ack-log.jsonl'), 'utf8').trim().split('\n');
    const ackEntry = JSON.parse(log[log.length - 1]);
    expect(ackEntry.finding_hash).not.toBeNull();
    expect(ackEntry.user).toBe(marker.verify_findings[0].severity_acked_by);
  });
});
```

> 注:fixture 的 `finding_hash` 用真实 `computeFindingHash(extractHashPayload(finding))` 生成 —— `ack-warning` 不改 finding 8 字段 payload,故 marker `finding_hash` confirm 后不变,ack-log entry `finding_hash` 应等于该值。断言可加 `expect(ackEntry.finding_hash).toBe(marker.verify_findings[0].finding_hash)`。

- [ ] **Step 2:跑测试确认失败**

Run:`pnpm build && pnpm vitest run tests/cli/ack-confirm-marker.test.ts`
Expected:FAIL —— 当前 confirm 不写 marker,`severity_acked_by` 仍为 `null`;ack-log `finding_hash` 为 `null`。

- [ ] **Step 3:实现 `src/core/ack/marker-ack.ts` —— marker 定位 + 写入**

新模块,导出:

```typescript
// src/core/ack/marker-ack.ts
import { readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { extractHashPayload, computeFindingHash } from '../validate/finding-hash.js';

/** 原子写单文件:tmp + rename */
async function atomicWriteYaml(filePath: string, obj: unknown): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, stringifyYaml(obj), 'utf8');
  await rename(tmp, filePath);
}

/** 一组 marker 写入项 */
interface MarkerWrite {
  path: string;
  content: Record<string, unknown>;
}

/**
 * writeMarkersAtomic —— 备份并原子写一组 marker;**任一写失败 → 恢复所有已写的、抛错**。
 * 这是 A3 双 marker 自回滚的核心:写第 2 个 marker 失败时第 1 个会被恢复。
 * 返回 .bak 路径列表(与 writes 顺序对齐)。
 */
async function writeMarkersAtomic(writes: MarkerWrite[]): Promise<string[]> {
  const backups = writes.map((w) => `${w.path}.bak`);
  for (let i = 0; i < writes.length; i++) await copyFile(writes[i]!.path, backups[i]!);
  const written: number[] = [];
  try {
    for (let i = 0; i < writes.length; i++) {
      await atomicWriteYaml(writes[i]!.path, writes[i]!.content);
      written.push(i);
    }
  } catch (e) {
    // 尽力恢复所有已写 marker;收集恢复失败,不让单个失败中断其余恢复
    const restoreErrors: string[] = [];
    for (const i of written) {
      try {
        await copyFile(backups[i]!, writes[i]!.path);
      } catch (re) {
        restoreErrors.push(`${writes[i]!.path}: ${re instanceof Error ? re.message : String(re)}`);
      }
    }
    if (restoreErrors.length > 0) {
      throw new Error(
        `marker 写失败且 rollback incomplete —— 未恢复: ${restoreErrors.join('; ')}` +
          `;原错误: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    throw e;
  }
  return backups;
}

export interface MarkerAckResult {
  ok: boolean;
  /** 失败原因(marker/finding 缺失、severity 不合法、marker 写失败已自恢复 等),ok=false 时非空 */
  reason?: string;
  /** ok=true 时:写回 ack-log entry 应带的 finding_hash(ack-pause-warning 为 null) */
  ackLogFindingHash: string | null;
  /**
   * ok=true 时:本次已写 marker 的 .bak 路径列表。供调用方:
   * ack-log 操作失败 → 用 .bak restore 对应 marker(spec §5.1.4 rollback);
   * 成功 → best-effort unlink .bak 清理。ok=false 时为 [](applyMarkerAck 内部已自恢复)。
   */
  backups: string[];
}

/**
 * applyMarkerAck —— 按 action 定位 marker 并写 ack 字段。**永不抛错**:
 * marker/finding 缺失、severity 不合法、marker 写失败 → 一律返回 { ok:false }
 * (写失败时 writeMarkersAtomic 已自恢复所有 marker)。调用方据 ok=false → exit 2。
 */
export async function applyMarkerAck(params: {
  changeDir: string;
  action: string;
  findingId: string;
  user: string;
  ackedAt: string;
  rationale: string | null;
  targetSeverity: 'WARNING' | 'SUGGESTION' | null;
}): Promise<MarkerAckResult> {
  const { changeDir, action, findingId, user, ackedAt } = params;
  const verifyPath = join(changeDir, '.verify-passed');
  const reviewPath = join(changeDir, '.review-passed');

  const FAIL = (reason: string): MarkerAckResult => ({
    ok: false, reason, ackLogFindingHash: null, backups: [],
  });

  try {
    if (action === 'ack-warning') {
      if (!existsSync(verifyPath)) return FAIL('.verify-passed 不存在');
      const marker = parseYaml(await readFile(verifyPath, 'utf8')) as Record<string, unknown>;
      const findings = (marker.verify_findings as Array<Record<string, unknown>>) ?? [];
      const f = findings.find((x) => String(x.id) === findingId);
      if (!f) return FAIL(`verify_findings 无 id=${findingId}`);
      f.severity_acked_by = user;
      f.severity_acked_at = ackedAt;
      const backups = await writeMarkersAtomic([{ path: verifyPath, content: marker }]);
      return { ok: true, ackLogFindingHash: computeFindingHash(extractHashPayload(f)), backups };
    }

    // ack-pause-warning / downgrade 见 Task A3 / A4 扩展(同样走 writeMarkersAtomic)
    // 其余 action:不写 marker
    return { ok: true, ackLogFindingHash: null, backups: [] };
  } catch (e) {
    // marker 写失败 → writeMarkersAtomic 已自恢复所有已写 marker;此处转 ok:false
    return FAIL(`marker 写入失败(已回滚): ${e instanceof Error ? e.message : String(e)}`);
  }
}
```

- [ ] **Step 4:改 `ack.ts` confirm action 接入 `applyMarkerAck`**

在 `ack.ts` confirm action(第 142 行起)`appendAckLog` **之前**插入:① 调 `applyMarkerAck`;② `ok=false` → `process.stderr.write(reason)` + `process.exit(2)`(不 append、不删 pending);③ `ok=true` → 用返回的 `ackLogFindingHash` 取代 `ackEntry.finding_hash` 的写死 `null`(第 213 行)。confirm 的 `user`、`timestamp` 与 marker 写入用同值。`appendAckLog` 与 `unlink` 保持现状顺序在其后。(`markerResult.backups` 的「appendAckLog 失败 → restore」与「成功 → cleanup」接线在 Task A5。)

```typescript
// ack.ts confirm action,构造 ackEntry 之前:
const ackedAt = new Date().toISOString();
const user = process.env['USER'] ?? process.env['USERNAME'] ?? 'unknown';
const markerResult = await applyMarkerAck({
  changeDir: changeRoot, action: payload.action, findingId,
  user, ackedAt, rationale: payload.rationale ?? null,
  targetSeverity: resolvedTargetSeverity,
});
if (!markerResult.ok) {
  process.stderr.write(`forge ack confirm: ${markerResult.reason}\n`);
  process.exit(2);
}
// ackEntry.timestamp 用 ackedAt;ackEntry.user 用 user;ackEntry.finding_hash 用 markerResult.ackLogFindingHash
```

- [ ] **Step 5:跑测试确认通过**

Run:`pnpm build && pnpm vitest run tests/cli/ack-confirm-marker.test.ts`
Expected:PASS。

- [ ] **Step 6:commit**

```bash
git add src/cli/commands/ack.ts src/core/ack/marker-ack.ts tests/cli/ack-confirm-marker.test.ts
git commit -m "fix(ack): forge ack confirm 为 ack-warning 写 marker ack 字段 + ack-log finding_hash"
```

### Task A3:`ack confirm` —— `ack-pause-warning` 双 marker 同步

对应 spec §5.1 action 分发表 `ack-pause-warning` 行 + §5.1.3 步骤 4-5。

**Files:**

- Modify:`src/core/ack/marker-ack.ts`(扩 `applyMarkerAck` 的 `ack-pause-warning` 分支)
- Modify:`tests/cli/ack-confirm-marker.test.ts`(加 describe block)

- [ ] **Step 1:写失败测试**

新增用例:构造 `.verify-passed` 与 `.review-passed` 各含 `pause_decisions: [{ id: 1, severity: WARNING, severity_acked_by: null, severity_acked_at: null }]`;`forge ack propose add-x --finding pause_decisions:1 --action ack-pause-warning` → `forge ack confirm add-x pause_decisions:1`;断言**两个 marker** 的 `pause_decisions[0].severity_acked_by/at` 都被写入且同值,ack-log entry `finding_id === 'pause_decisions:1'`、`finding_hash === null`。

- [ ] **Step 2:跑测试确认失败**

Run:`pnpm build && pnpm vitest run tests/cli/ack-confirm-marker.test.ts -t "ack-pause-warning"`
Expected:FAIL。

- [ ] **Step 3:实现 `ack-pause-warning` 分支**

在 `applyMarkerAck` 的 `try` 块加 `action === 'ack-pause-warning'` 分支 → strip `pause_decisions:` 前缀得数字 id,**先校验后写**:

① 校验 `.verify-passed` 与 `.review-passed` 都存在、且各自 `pause_decisions` 数组都有该 `id` 项 —— 任一不满足 → `FAIL(...)`(fail-closed,不写任何 marker);
② 把两个 marker 对象里该 pause decision 的 `severity_acked_by/at` 都设好;
③ `const backups = await writeMarkersAtomic([{ path: verifyPath, content: verifyMarker }, { path: reviewPath, content: reviewMarker }])` —— **第二个 marker 写失败时 `writeMarkersAtomic` 自动恢复第一个并抛错,被 `applyMarkerAck` 外层 `try/catch` 转成 `{ ok:false }`**(双 marker 原子性,解决 Codex 复审 MAJOR-2);
④ 返回 `{ ok:true, ackLogFindingHash: null, backups }`(pause decision 无 FindingHashPayload,故 `ackLogFindingHash` 为 `null`)。

- [ ] **Step 4:跑测试确认通过**

Run:`pnpm build && pnpm vitest run tests/cli/ack-confirm-marker.test.ts`
Expected:PASS(ack-warning + ack-pause-warning 全过)。

- [ ] **Step 5:commit**

```bash
git add src/core/ack/marker-ack.ts tests/cli/ack-confirm-marker.test.ts
git commit -m "fix(ack): ack-pause-warning confirm 同步写 verify+review 双 marker"
```

### Task A4:`ack confirm` —— `downgrade`(WARNING→SUGGESTION + 重算 hash + CRITICAL 拒绝)

对应 spec §5.1 action 分发表 `downgrade` 行。

**Files:**

- Modify:`src/core/ack/marker-ack.ts`
- Modify:`tests/cli/ack-confirm-marker.test.ts`

- [ ] **Step 1:写失败测试**

三用例:(a)WARNING finding `downgrade` → marker finding `severity` 改 `SUGGESTION`、写 `downgrade_acked_by`/`downgrade_rationale`/`downgraded_from: WARNING`(固定字面 `WARNING`)、`finding_hash` 重算(用改 severity 后的 payload)、ack-log entry `finding_hash` == 重算值;(b)CRITICAL finding `downgrade` → confirm `exit 2`,marker 不变、ack-log 不写;(c)**SUGGESTION finding `downgrade` → confirm `exit 2`,marker 不变、ack-log 不写**(spec 仅允许 `WARNING → SUGGESTION`)。

- [ ] **Step 2:跑测试确认失败**

Run:`pnpm build && pnpm vitest run tests/cli/ack-confirm-marker.test.ts -t "downgrade"`
Expected:FAIL。

- [ ] **Step 3:实现 `downgrade` 分支**

在 `applyMarkerAck` 的 `try` 块加 `action === 'downgrade'` 分支:定位 `.verify-passed` 的 `verify_findings[finding]`;**若 `f.severity !== 'WARNING'` → `FAIL(...)`** —— CRITICAL 无 ack 路径、SUGGESTION 无需 downgrade,spec 仅允许 `WARNING → SUGGESTION`(调用方据此 exit 2、不改 marker、不写 ack-log)。否则写 `downgraded_from = 'WARNING'`(**固定字面,非 `f.severity`**)、`f.severity = 'SUGGESTION'`、`downgrade_acked_by = user`、`downgrade_rationale = rationale`;**重算** `f.finding_hash = computeFindingHash(extractHashPayload(f))`(此时 `f.severity` 已是 SUGGESTION);`const backups = await writeMarkersAtomic([{ path: verifyPath, content: marker }])`;返回 `{ ok:true, ackLogFindingHash: 新 hash, backups }`。

- [ ] **Step 4:跑测试确认通过**

Run:`pnpm build && pnpm vitest run tests/cli/ack-confirm-marker.test.ts`
Expected:PASS。

- [ ] **Step 5:commit**

```bash
git add src/core/ack/marker-ack.ts tests/cli/ack-confirm-marker.test.ts
git commit -m "fix(ack): downgrade confirm 限 WARNING→SUGGESTION 并重算 finding_hash"
```

### Task A5:`ack confirm` —— 事务 rollback 接线 + retry 幂等

对应 spec §5.1.4。Task A2-A4 已做 marker 备份(`.bak` → `MarkerAckResult.backups`)+ 原子写;本 task 补两件:(1)`appendAckLog` 失败时从 `.bak` restore marker(rollback);(2)retry 幂等去重 + 成功后清理 `.bak`。

**Files:**

- Modify:`src/cli/commands/ack.ts`(confirm action:appendAckLog 失败 rollback + append 前幂等检查 + 成功清理 `.bak`)
- Modify:`tests/cli/ack-confirm-marker.test.ts`

- [ ] **Step 1:写失败测试 —— rollback + 幂等**

两用例:
(a)**rollback**:`ack-warning` confirm 前,把 `<changeDir>/.evidence/ack-log.jsonl` 预先 `mkdirSync` 成**目录** → confirm 内读/写该 ack-log 路径(`readAllAckLogEntries` 与 `appendAckLog` 都会)因 EISDIR 抛错,触发 rollback。断言:`.verify-passed` 被从 `.bak` restore(`verify_findings[0].severity_acked_by` 回到 `null`)、pending 文件**未删**、confirm exit 非 0。
(b)**幂等**:对同一 `ack-warning` finding 跑一次 `confirm` 成功后,再 `propose` 同 finding 同 action、再 `confirm`。断言 ack-log.jsonl **不出现重复 ack entry**(同 `change_id`+`finding_id`+`action`+`user`+`finding_hash`)。

- [ ] **Step 2:跑测试确认失败**

Run:`pnpm build && pnpm vitest run tests/cli/ack-confirm-marker.test.ts -t "rollback|幂等"`
Expected:FAIL(当前 confirm 无 rollback、每次都 append)。

- [ ] **Step 3:实现 rollback + 幂等检查 + 清理**

重排 confirm action 事务顺序 —— **把「幂等读 ack-log」+「appendAckLog」整体包进同一个 rollback `try/catch`**:否则 `readAllAckLogEntries` 失败(ack-log 损坏 / EISDIR)会绕过 rollback、留下 marker 已写的半状态(Codex 复审 MAJOR-1)。`applyMarkerAck` 返回 `ok=true` 后:

```typescript
// applyMarkerAck 返回 ok=true、ackEntry 构造完成后(ackEntry.finding_hash = markerResult.ackLogFindingHash):
try {
  const entries = await readAllAckLogEntries(changeRoot);
  const dup = entries.some(
    (e) =>
      e.kind === 'ack' &&
      e.change_id === changeId &&
      e.finding_id === findingId &&
      (e as { action?: string }).action === payload.action &&
      e.user === user &&
      e.finding_hash === ackEntry.finding_hash,
  );
  if (!dup) await appendAckLog(changeRoot, ackEntry); // 幂等:已存在同 entry 则跳过 append
} catch (e) {
  // ack-log 读/写失败 → 尽力从 .bak 恢复所有已写 marker;保留 pending(retry 可重跑)。
  // 收集 restore 失败,不让单个失败中断其余恢复;有未恢复项时输出清晰诊断。
  const restoreErrors: string[] = [];
  for (const bak of markerResult.backups) {
    const marker = bak.replace(/\.bak$/, '');
    try {
      await copyFile(bak, marker);
    } catch (re) {
      restoreErrors.push(`${marker}(.bak: ${bak}): ${re instanceof Error ? re.message : String(re)}`);
    }
  }
  if (restoreErrors.length > 0) {
    process.stderr.write(
      `forge ack confirm: ack-log 操作失败且 rollback incomplete —— 以下 marker 未恢复,` +
        `请手动用对应 .bak 还原: ${restoreErrors.join('; ')}\n`,
    );
  } else {
    process.stderr.write(
      `forge ack confirm: ack-log 操作失败,marker 已回滚: ${e instanceof Error ? e.message : String(e)}\n`,
    );
  }
  process.exit(1);
}
// 成功:先删 pending(它是「未完成」标记;marker+ack-log 已一致即可删)。
// ENOENT 视为幂等成功(pending 可能已被并发/外部清理);其他 unlink 错误 → exit 1
//(pending 残留会被 archive pending fence 拒签,必须让用户知道)。
try {
  await unlink(latest.path);
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
    process.stderr.write(
      `forge ack confirm: pending 文件删除失败(残留会被 archive 拒签,请手动清理 ${latest.path}): ` +
        `${e instanceof Error ? e.message : String(e)}\n`,
    );
    process.exit(1);
  }
  // ENOENT → pending 已不在,幂等成功,继续清理 .bak
}
// best-effort 清理 .bak(.bak 残留不影响 archive,清理失败不阻断)
for (const bak of markerResult.backups) {
  try {
    await unlink(bak);
  } catch {
    /* .bak 清理失败吞错 —— 不阻断,marker+ack-log 已一致 */
  }
}
process.exit(0);
```

- [ ] **Step 4:跑测试确认通过**

Run:`pnpm build && pnpm vitest run tests/cli/ack-confirm-marker.test.ts`
Expected:PASS。

- [ ] **Step 5:回归 + commit**

Run:`pnpm vitest run tests/cli/ack-cli.test.ts tests/cli/ack-cli-mode.test.ts tests/cli/ack-log-pause-decisions.test.ts`
Expected:PASS。

```bash
git add src/cli/commands/ack.ts tests/cli/ack-confirm-marker.test.ts
git commit -m "fix(ack): ack confirm 幂等去重,retry 不重复 append ack-log"
```

### Task A6:`ack-confirm.md` 文本 + CLI help + cli-reference 同步

对应 spec §5.0、§5.1.6。

**Files:**

- Modify:`commands/ack-confirm.md`(第 20 行)
- Modify:`src/cli/commands/ack.ts`(第 56、137、242 行 option/argument help 文本)
- Modify:`docs/cli-reference.md`(ack 段)

- [ ] **Step 1:改 `commands/ack-confirm.md:20`**

把 `confirm` → `调 forge ack confirm ...(CLI 写 marker + ack-log + 删 pending)` 改为准确描述:`CLI 对 severity-ack(ack-warning / ack-pause-warning / downgrade)写 marker ack 字段、写 ack-log、删 pending;其余 action 仅写 ack-log + 删 pending`。

- [ ] **Step 2:改 `ack.ts` 三处 help 文本**

`--finding <id>`(第 56 行)、confirm 的 `<findingId>`(第 137 行)、reject 的 `<findingId>`(第 242 行):描述从「finding ID(数字字符串)」改为「finding id:`<number>` 或 `pause_decisions:<number>`」。

- [ ] **Step 3:更新 `docs/cli-reference.md` ack 段**

同步 finding id 形态描述为 `<number> | pause_decisions:<number>`。

- [ ] **Step 4:验证 + commit**

Run:`pnpm vitest run tests/cli/ack-cli.test.ts`(确认 help 文本改动不破坏快照类断言;若有快照需 `-u`)
Expected:PASS。

```bash
git add commands/ack-confirm.md src/cli/commands/ack.ts docs/cli-reference.md
git commit -m "docs(ack): 同步 ack-confirm 文本与 finding id 形态描述"
```

---

## Phase B — 桥接基础设施

### Task B1:新增 `skills/_shared/tier23-command-bridge.md`

对应 spec §3 + §3.1。

**Files:**

- Create:`skills/_shared/tier23-command-bridge.md`

- [ ] **Step 1:写文件(完整内容)**

````markdown
# Tier 2/3 Command Bridge — 共享替换规则

> 被 5 个 stage skill 的「Tier 2/3 Orchestration」段引用。
> 适用:OpenCode / Codex 等无 `/forge:*` slash 命令的 harness;Claude Code(Tier 1)不走本桥接。

## plugin root 解析(绝对路径字面值)

命令文件与 helper 同在 plugin 仓库根下。先解析出**绝对路径字面值** `<ROOT>`:

- OpenCode:从 session bootstrap 文本里的 `forge plugin root: <abs path>` 行取得。
- Codex:标准安装为 `~/.codex/forge`,把 `~`/`$HOME` 展开成绝对路径。
- 解析后校验 `<ROOT>/scripts/run-forge.mjs` 与 `<ROOT>/commands/<stage>.md` **同时存在**;
  任一缺失 → 报错停止(fail closed),提示用户检查安装,**不得静默跳过**。
- **不得**在 shell 写 `$FORGE_PLUGIN_ROOT`(非运行时环境变量);用绝对路径字面值,
  或在单条命令内 `FORGE_ROOT="<abs literal>"; node "$FORGE_ROOT/..."`(变量不跨命令)。

## 替换规则

执行 `commands/<stage>.md` 时,按下表把 Tier-1 专属构造换成 Tier 2/3 等价物:

| 命令文件里的 | 替换为 |
|---|---|
| `${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs` | `<ROOT>/scripts/run-forge.mjs` |
| shell/命令执行上下文中的 forge executable token(裸 `forge <subcmd>`、管道右侧 `… \| forge <subcmd>`) | `node "<ROOT>/scripts/run-forge.mjs" <subcmd> …`;helper 不可达时 fallback `npx -y --package @accelerator-mzq/forge@^3.1 -- forge <subcmd>`。**散文/说明文字里的 `forge archive` 等引用不替换** |
| `$ARGUMENTS` | 从用户自然语言提取 |
| `AskUserQuestion` | 降级终端 `[1]/[2]/…` 文本 prompt;确认结果必须落到对应 CLI(`forge ack confirm/reject` 等),留 ack-log 证据 |
| `Task` 工具派子代理 | 按 `skills/subagent-driven-discipline/references/codex-tools.md`(Codex)/ `opencode-tools.md`(OpenCode)映射 |
| `## (可选)Stage extensions hook — Tier 1 Claude Code only` 段 | 整段跳过 |

示例:

- bash:`node "<ROOT>/scripts/run-forge.mjs" validate add-login`
- PowerShell:`node "<ROOT>\scripts\run-forge.mjs" validate add-login`
- 管道(bash):`cat payload.json | node "<ROOT>/scripts/run-forge.mjs" finding hash`
````

- [ ] **Step 2:验证 + commit**

Run:`test -f skills/_shared/tier23-command-bridge.md && echo OK`
Expected:`OK`。

```bash
git add skills/_shared/tier23-command-bridge.md
git commit -m "feat(bridge): 新增 _shared/tier23-command-bridge.md 替换规则"
```

### Task B2:`.opencode/plugins/forge.js` 注入 `forge plugin root`

对应 spec §3.1 OpenCode 项。

**Files:**

- Modify:`.opencode/plugins/forge.js`(`getBootstrapContent`,第 21-26 行)

- [ ] **Step 1:写失败测试**

```typescript
// tests/integration/opencode-plugin-bootstrap.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('.opencode/plugins/forge.js bootstrap 注入 plugin root', () => {
  it('forge.js 源码含 `forge plugin root:` 注入逻辑', () => {
    const src = readFileSync(join(process.cwd(), '.opencode/plugins/forge.js'), 'utf8');
    expect(src.includes('forge plugin root:')).toBe(true);
    // 用 path.resolve(__dirname, '../..') 算仓库根绝对路径
    expect(/forge plugin root:.*resolve/s.test(src) || src.includes('forgeRepoRoot')).toBe(true);
  });
});
```

- [ ] **Step 2:跑测试确认失败**

Run:`pnpm vitest run tests/integration/opencode-plugin-bootstrap.test.ts`
Expected:FAIL。

- [ ] **Step 3:实现**

`forge.js` 顶部已有 `forgeSkillsDir = path.resolve(__dirname, '../../skills')`;加 `const forgeRepoRoot = path.resolve(__dirname, '../..');`。`getBootstrapContent` 的返回串追加一行:

```javascript
return `<EXTREMELY_IMPORTANT>\nYou have forge.\n\nforge plugin root: ${forgeRepoRoot}\n\n${body}\n</EXTREMELY_IMPORTANT>`;
```

- [ ] **Step 4:跑测试确认通过**

Run:`pnpm vitest run tests/integration/opencode-plugin-bootstrap.test.ts`
Expected:PASS。

- [ ] **Step 5:commit**

```bash
git add .opencode/plugins/forge.js tests/integration/opencode-plugin-bootstrap.test.ts
git commit -m "feat(bridge): OpenCode plugin bootstrap 注入 forge plugin root 绝对路径"
```

---

## Phase C — 5 stage skill 桥接段 + 假 claim 清理

> **桥接段统一模板**(每个 stage skill 末尾加 / 替换旧 addendum):
>
> ```markdown
> ## Tier 2/3 Orchestration(OpenCode / Codex 路径)
>
> 当前 harness 无 `/forge:*` slash 命令时(OpenCode / Codex),你 **MUST** Read
> 对应 `commands/<stage>.md` 并**完整执行**其协议 —— 按
> `skills/_shared/tier23-command-bridge.md` 的 plugin root 解析与替换规则执行。
> Claude Code(Tier 1)有 slash 命令,不走本段。
>
> 执行完成前核对本 stage 硬门槛自检清单:
> <硬门槛清单 —— 见 spec §4 对应 stage 条目>
> ```

### Task C1:`writing-plans` skill —— propose 桥接段(替换旧 addendum)

**Files:** Modify `skills/writing-plans/SKILL.md`(删第 240-260 行旧「CLI validation step」addendum,换桥接段)

- [ ] **Step 1:删旧 addendum**

删除 `## CLI validation step (Tier 2/3 OpenCode/Codex 路径用…)` 整段(第 240 行至文件末)。

- [ ] **Step 2:加 propose 桥接段**

按统一模板,`<stage>` = `propose`,硬门槛清单(spec §4 propose 条):`{proposal,design,tasks}.md` + `specs/` 齐全、三段 anchor 在、`forge validate` exit 0。

- [ ] **Step 3:验证 + commit**

Run:`grep -q "Tier 2/3 Orchestration" skills/writing-plans/SKILL.md && grep -q "commands/propose.md" skills/writing-plans/SKILL.md && echo OK`
Expected:`OK`。

```bash
git add skills/writing-plans/SKILL.md
git commit -m "feat(bridge): writing-plans 加 propose Tier 2/3 桥接段"
```

### Task C2:`subagent-driven-development` skill —— apply 桥接段(新增)

**Files:** Modify `skills/subagent-driven-development/SKILL.md`

- [ ] **Step 1:加 apply 桥接段**

文件末尾加桥接段,`<stage>` = `apply`,硬门槛(spec §4 apply 条):每个完成 task 经 `forge evidence record-tdd` 写 TDD 证据链;`forge preflight branch-check` 已跑。

- [ ] **Step 2:验证 + commit**

Run:`grep -q "Tier 2/3 Orchestration" skills/subagent-driven-development/SKILL.md && grep -q "commands/apply.md" skills/subagent-driven-development/SKILL.md && echo OK`
Expected:`OK`。

```bash
git add skills/subagent-driven-development/SKILL.md
git commit -m "feat(bridge): subagent-driven-development 加 apply Tier 2/3 桥接段"
```

### Task C3:`requesting-code-review` skill —— review 桥接段(新增)

**Files:** Modify `skills/requesting-code-review/SKILL.md`

- [ ] **Step 1:加 review 桥接段**

`<stage>` = `review`,硬门槛(spec §4 review 条):`.review-passed` 写 → `forge evidence record-review` 跑 → `forge evidence freeze --kind review` exit 0。并注明:过程中遇 `forge ack propose` 退出 → Read+执行 `commands/ack-confirm.md` 等价流程。

- [ ] **Step 2:验证 + commit**

Run:`grep -q "Tier 2/3 Orchestration" skills/requesting-code-review/SKILL.md && grep -q "commands/review.md" skills/requesting-code-review/SKILL.md && echo OK`
Expected:`OK`。

```bash
git add skills/requesting-code-review/SKILL.md
git commit -m "feat(bridge): requesting-code-review 加 review Tier 2/3 桥接段"
```

### Task C4:`verification-before-completion` skill —— 删假 claim + verify 桥接段

对应 spec §5.0 + §4。

**Files:** Modify `skills/verification-before-completion/SKILL.md`(第 147-167 行「forge strict gate step」含假 claim #1)

- [ ] **Step 1:删假 claim addendum**

删除第 147-167 行整段(含「exit 0 → forge CLI 自动写 `.verify-passed`」假 claim)。

- [ ] **Step 2:加 verify 桥接段**

`<stage>` = `verify`,硬门槛(spec §4 verify 条):`.verify-passed` 写 → `forge evidence record-verify` 跑 → `forge evidence freeze --kind verify` exit 0。注明遇 `forge ack propose` 退出 → Read+执行 `commands/ack-confirm.md`。

- [ ] **Step 3:验证 + commit**

Run:`! grep -q "forge CLI 自动写" skills/verification-before-completion/SKILL.md && grep -q "commands/verify.md" skills/verification-before-completion/SKILL.md && echo OK`
Expected:`OK`(假 claim 已删 + 桥接段已加)。

```bash
git add skills/verification-before-completion/SKILL.md
git commit -m "fix(bridge): verification-before-completion 删假 claim,加 verify 桥接段"
```

### Task C5:`finishing-a-development-branch` skill —— archive 桥接段(替换旧 addendum)

**Files:** Modify `skills/finishing-a-development-branch/SKILL.md`(第 228 行起旧「forge archive step」addendum)

- [ ] **Step 1:替换旧 addendum**

删第 228 行起旧「forge archive step」段,换 archive 桥接段。`<stage>` = `archive`,硬门槛(spec §4 archive 条):`.verify-passed`+`.review-passed` 均在且 hash 新鲜、`forge archive` exit 0、若 emit sync-check manifest 按 `archive.md` 编排步 fulfill。

- [ ] **Step 2:验证 + commit**

Run:`grep -q "Tier 2/3 Orchestration" skills/finishing-a-development-branch/SKILL.md && grep -q "commands/archive.md" skills/finishing-a-development-branch/SKILL.md && echo OK`
Expected:`OK`。

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat(bridge): finishing-a-development-branch 换 archive Tier 2/3 桥接段"
```

### Task C6:`using-forge` skill —— tier 表拆两列 + 删「体验一致」假 claim

对应 spec §5.0 + §6。

**Files:** Modify `skills/using-forge/SKILL.md`(第 109-129 行 v0.3 plugin 协议状态段)

- [ ] **Step 1:改 tier 表 + 删假 claim**

第 113-117 行 tier 表把「`/forge:*` slash commands」列拆为两列:「slash command 注册」(Tier 2/3 仍 ❌)+「workflow bridge」(Tier 2/3 ✅ 经桥接段 Read 命令文件)。删第 125 行「跟 Claude Code 体验一致,只是没有显式入口按钮」,改为如实:「Tier 2/3 经 stage skill 的桥接段 Read `commands/<stage>.md` 执行,功能闭环但属 best-effort skill orchestration」。

- [ ] **Step 2:验证 + commit**

Run:`! grep -q "体验一致" skills/using-forge/SKILL.md && echo OK`
Expected:`OK`。

```bash
git add skills/using-forge/SKILL.md
git commit -m "fix(bridge): using-forge tier 表拆两列,删体验一致假 claim"
```

---

## Phase D — 文档 + 版本

### Task D1:`README.md` + `docs/installation.md`

对应 spec §6。

**Files:** Modify `README.md`、`docs/installation.md`

- [ ] **Step 1:改 README.md**

(a)版本陈述 `v1.2.0` → `v3.1.0`(`README.md:132` 段);(b)harness 表(`:87-91`)Tier 2/3 状态从 `PARTIAL_SHIP` 改为「workflow bridge ✅(经命令文件桥接,best-effort)」,slash 注册仍标不支持;(c)计数订正:`README.md:137` 的 `14 CLI 子命令` → `17`,skill 计数核对为 18,slash `.md` 10。

- [ ] **Step 2:改 docs/installation.md**

`v1.1` → `v3.1`;tier 表同步 README 的两列表述。

- [ ] **Step 3:验证 + commit**

Run:`! grep -q "v1.2.0" README.md && echo OK`
Expected:`OK`。

```bash
git add README.md docs/installation.md
git commit -m "docs: README/installation 订正版本号 + Tier 2/3 workflow bridge 状态"
```

### Task D2:`docs/codex-install.md` + `docs/opencode-install.md`

对应 spec §6。

**Files:** Modify `docs/codex-install.md`、`docs/opencode-install.md`

- [ ] **Step 1:重写 Workflow 段**

两文件的「Workflow(适配 Tier 2/3 PARTIAL_SHIP 路径)」段:从「slash 不可用、自然语言驱动 skill」改为「stage skill 触发后经桥接段 Read `commands/<stage>.md` 完整执行完整工作流」。删「Tier 2/3 ship 限制」里已不成立条目(`/forge:*` 不可用降级为已有桥接路径)。保留「slash 命令本身不注册」的事实陈述。

- [ ] **Step 2:验证 + commit**

```bash
git add docs/codex-install.md docs/opencode-install.md
git commit -m "docs: 重写 codex/opencode-install Workflow 段为桥接路径"
```

### Task D3:版本号 5 处同步 + CHANGELOG

对应 spec §8。

**Files:** Modify `package.json`、`.claude-plugin/plugin.json`、`.codex-plugin/plugin.json`、`.claude-plugin/marketplace.json`、`scripts/run-forge.mjs`、`CHANGELOG.md`

- [ ] **Step 1:bump 版本到 3.1.0**

5 处 `version` / `REQUIRED_RANGE` 从 `3.0.0`/`^3.0.0` 改 `3.1.0`/`^3.1.0`(`run-forge.mjs` 的 `REQUIRED_RANGE`)。

- [ ] **Step 2:CHANGELOG.md 加 `[3.1.0]` 段**

Keep a Changelog 格式,记:Tier 2/3 workflow closure(桥接段)+ `forge ack confirm` 写 marker 修复 + 文档订正。

- [ ] **Step 3:验证 + commit**

Run:`grep -c '"version": "3.1.0"' package.json .claude-plugin/plugin.json .codex-plugin/plugin.json`
Expected:每文件 1。

```bash
git add package.json .claude-plugin/plugin.json .codex-plugin/plugin.json .claude-plugin/marketplace.json scripts/run-forge.mjs CHANGELOG.md
git commit -m "chore(release): bump v3.1.0 + CHANGELOG"
```

---

## Phase E — 测试 + build + 收尾

### Task E1:桥接结构断言测试

对应 spec §8 结构断言。

**Files:** Create `tests/integration/tier23-bridge-structure.test.ts`

- [ ] **Step 1:写测试**

```typescript
// tests/integration/tier23-bridge-structure.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const R = process.cwd();
const STAGES: Array<[string, string]> = [
  ['skills/writing-plans/SKILL.md', 'commands/propose.md'],
  ['skills/subagent-driven-development/SKILL.md', 'commands/apply.md'],
  ['skills/requesting-code-review/SKILL.md', 'commands/review.md'],
  ['skills/verification-before-completion/SKILL.md', 'commands/verify.md'],
  ['skills/finishing-a-development-branch/SKILL.md', 'commands/archive.md'],
];

describe('Tier 2/3 桥接结构', () => {
  it('_shared/tier23-command-bridge.md 存在且含替换规则', () => {
    const p = join(R, 'skills/_shared/tier23-command-bridge.md');
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, 'utf8')).toContain('forge executable token');
  });

  it.each(STAGES)('%s 含 Tier 2/3 Orchestration 段且指向 %s', (skill, cmd) => {
    const txt = readFileSync(join(R, skill), 'utf8');
    expect(txt).toContain('Tier 2/3 Orchestration');
    expect(txt).toContain(cmd);
  });

  it('verification-before-completion 不再含假 claim', () => {
    expect(readFileSync(join(R, 'skills/verification-before-completion/SKILL.md'), 'utf8'))
      .not.toContain('forge CLI 自动写');
  });
});
```

- [ ] **Step 2:跑测试**

Run:`pnpm vitest run tests/integration/tier23-bridge-structure.test.ts`
Expected:PASS(Phase B/C 完成后应全过)。

- [ ] **Step 3:commit**

```bash
git add tests/integration/tier23-bridge-structure.test.ts
git commit -m "test(bridge): 桥接结构断言测试"
```

### Task E2:`bridge-protocol-fixture` 集成测试

对应 spec §8。验证「桥接协议产物若按清单生成,则 CLI/fence/产物链可通过」。**不测模型遵从度。**

**Files:** Create `tests/integration/tier23-bridge-protocol.test.ts`

- [ ] **Step 1:写测试**

构造一个完整 change fixture(`forge/changes/bridge-fix/`:proposal/design/tasks/specs 齐全 + 一个带 WARNING finding 的场景),按桥接硬门槛清单的产物序生成 marker:AI 写基础 `.verify-passed` → `forge evidence record-verify` → `forge ack propose --action ack-warning` → `forge ack confirm` → `forge evidence freeze --kind verify`;review 侧同理;最后 `forge archive`。断言 `forge archive` **真实 exit 0**。测试顶部注释明写:本 fixture 测 CLI/fence/产物链,不测模型是否遵从桥接清单。

- [ ] **Step 2:跑测试**

Run:`pnpm build && pnpm vitest run tests/integration/tier23-bridge-protocol.test.ts`
Expected:PASS(archive exit 0)。若 FAIL → 按 fence 报错回 Phase A 对应 task 修。

- [ ] **Step 3:commit**

```bash
git add tests/integration/tier23-bridge-protocol.test.ts tests/fixtures/
git commit -m "test(bridge): bridge-protocol-fixture 集成测试 —— WARNING ack 全链到 archive"
```

### Task E3:`pnpm build` 模板同步 + 全量验证 + 收尾

对应 spec §8。

- [ ] **Step 1:`pnpm build` 同步模板**

Run:`pnpm build`
Expected:exit 0。`scripts/copy-templates.mjs` 把改过的 `skills/`、`skills/_shared/`、`commands/ack-confirm.md` 反向同步到 `src/core/templates/` 与 `dist/core/templates/`。

- [ ] **Step 2:本地 5 命令全绿**

Run:`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test`
Expected:全部 exit 0,test 全 pass。若 `format:check` FAIL → `pnpm format` 后重跑。

- [ ] **Step 3:提交模板同步产物 + 收尾 commit**

```bash
git add src/core/templates/
git commit -m "chore: pnpm build 同步 Tier 2/3 桥接模板"
```

- [ ] **Step 4:验证 design doc 所有 spec 条目已覆盖**

对照 `docs/specs/2026-05-19-tier23-workflow-closure-design.md` §3-§8 逐条核对本计划 task 覆盖;无遗漏。

---

## Self-Review 记录

- **Spec coverage**:§2-§4 桥接 → Phase B/C;§3.1 plugin root → B1/B2;§5.0 假 claim → C4/C6/A6;§5.1 forge-core 修复 → Phase A(A1 namespace / A2 ack-warning / A3 pause-warning / A4 downgrade / A5 事务幂等 / A6 文本);§6 文档 → Phase D;§8 build/test/版本 → Phase E + D3。全覆盖。
- **Placeholder scan**:无 TBD/TODO;TS 任务给完整 RED 测试 + 实现代码或精确改动锚点;markdown 任务给完整内容或精确段落指令。
- **Type consistency**:`applyMarkerAck` / `MarkerAckResult` / `atomicWriteYaml` / `writeMarkersAtomic` 跨 A2-A5 一致;`computeFindingHash(extractHashPayload(f))` 用法与 `verify-findings-fence.ts:29-32` 一致。

## Codex 对抗性审查记录

本计划经 Codex 对抗性审查 3 轮(均由 Claude Code 独立对照代码核实):

- **第 1 轮**:2 MAJOR + 1 MINOR —— A4 downgrade severity guard 过宽、A5 缺 rollback、A2 fixture 用 PLACEHOLDER。全修。
- **第 2 轮**:2 MAJOR + 1 MINOR —— rollback `try/catch` 未覆盖 `readAllAckLogEntries`、A3 双 marker 第二个写失败不自恢复、`.bak` 清理阻断 pending unlink。引入 `writeMarkersAtomic` 助手 + Option Y(幂等读与 append 同一 rollback try)。全修。
- **第 3 轮**:0 CRITICAL / 0 MAJOR / 2 MINOR —— 错误路径诊断:rollback 部分失败收集诊断、pending unlink ENOENT 幂等。全修。

收敛:**0 CRITICAL / 0 MAJOR**。(叠加 design doc 9 轮 = 全程 12 轮 Codex 审查。)
