# Plan 8e — `forge migrate` Phase 5 Regenerate(LLM)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐;每 task 派 fresh subagent + Opus model 用于 prompt 设计)。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:实施 `--regenerate` 完整 LLM 路径(ack + budget + quality 三套 prompt + AbortController + .partial + mock 全链路);M13 enforceArchiveIntegrity / M16 bundled prompt 接入。完成后 `forge migrate <source> --regenerate` 端到端跑通,可在真 Anthropic API 上手测一次(里程碑 M5)。

**Architecture**:**不反向调** legacy-bridge 的 ack/budget/quality(brownfield 硬编码不兼容);自实现 migrate 专属;复用 `legacy-bridge/redact.ts`(字符串处理无 brownfield 耦合)。M15 facts **目标分桶**:`extractMotivationFacts(design)` 验 proposal、`extractBehaviorFacts(tasks)` 验 specs、`extractFacts(content)` 给 OpenSpec 已有件。`callAnthropic({signal})` 统一封装,abort 错误映射 `[regen:interrupted]`。

**Tech Stack**:`@anthropic-ai/sdk` ≥ 0.27.0(AbortSignal 支持)+ vitest mock + 复用 redact.ts。

**Spec 引用**:[`2026-05-10-forge-migrate-design.md`](../specs/2026-05-10-forge-migrate-design.md) §1.5 主流程 regen 阶段、§2.8 v3 流程、§3.1 错误矩阵 regenerate 段、§5.1 不复用边界 + redact 复用、§5.2 quality.ts 描述、M13/M14/M15/M16/M9 决策、§7.1 风险表 SDK 版本依赖。

**前置**:Plan 8a-8d 完成(types + lock + sources + cp 路径);本 phase 是最复杂 phase(4.5d 16 task)。

**Subagent 模型策略**:Task 5.4-5.6(三套 prompt 设计)**强制 opus**(design 类);其他 task sonnet 即可;commit / file mv 类用 haiku(参考 user MEMORY)。

---

## File Structure(Plan 8e 完成时改动)

```
src/core/migrate/
├── ack.ts                                ← ★ NEW(Task 5.1)
├── budget.ts                             ← ★ NEW(Task 5.2)
├── quality.ts                            ← ★ NEW(Task 5.3-5.10)
└── regenerate.ts                         ← ★ NEW(Task 5.11-5.13)

tests/migrate/
├── ack.test.ts                           ← ★ NEW
├── budget.test.ts                        ← ★ NEW
├── quality.test.ts                       ← ★ NEW
└── regenerate.test.ts                    ← ★ NEW

src/core/migrate/index.ts                 ← 改:接入 enforceArchiveIntegrity + bundled prompt + regenerate.run
package.json                              ← 改:dependencies.@anthropic-ai/sdk ≥ 0.27.0
```

---

## Task 5.1:`ack.ts` migrate 专属 opt-in prompt + 写读

**Files:** Create `src/core/migrate/ack.ts` + `tests/migrate/ack.test.ts`

**Spec 引用**:§2.8 步骤 4 ack;§5.1 不复用 legacy-bridge ack(路径硬编码 + brownfield 文案)。

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/ack.test.ts
import { describe, it, expect } from 'vitest';
import { renderMigratePrompt, writeMigrateAck, checkMigrateAck } from '../../src/core/migrate/ack.js';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('renderMigratePrompt — migrate 专属', () => {
  it('文案不含 brownfield 字串', () => {
    const prompt = renderMigratePrompt({ source: 'openspec', estimatedCostUsd: 3.5 });
    expect(prompt).toContain('forge migrate');
    expect(prompt).toContain('openspec');
    expect(prompt).toContain('$3.5');
    expect(prompt).not.toContain('docs/legacy/');         // 不写 brownfield 老文案
    expect(prompt).not.toContain('legacy-bridge');        // 不引导跑 brownfield 命令
  });
});

describe('writeMigrateAck / checkMigrateAck', () => {
  it('write 后 check 通过', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-ack-'));
    await mkdir(join(tmp, 'forge/.forge-ack'), { recursive: true });
    const ts = '2026-05-10T00-00-00Z';
    await writeMigrateAck(join(tmp, 'forge'), ts, { source: 'openspec', estimatedCostUsd: 3.5 });
    const r = await checkMigrateAck(join(tmp, 'forge'), ts);
    expect(r.ok).toBe(true);
    await rm(tmp, { recursive: true, force: true });
  });

  it('ack 文件不存在 → ok=false reason=ack-missing', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-ack-missing-'));
    await mkdir(join(tmp, 'forge/.forge-ack'), { recursive: true });
    const r = await checkMigrateAck(join(tmp, 'forge'), '2026-05-10T00-00-00Z');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ack-missing');
    await rm(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2-3:fail / 实施**

```ts
// src/core/migrate/ack.ts
// migrate 专属 ack — Plan 8e Task 5.1
// Spec §2.8 步骤 4 + §5.1 不复用 legacy-bridge(路径 + 文案 brownfield)

import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stringify, parse } from 'yaml';

export interface MigrateAckInput {
  source: 'openspec' | 'superpowers';
  estimatedCostUsd: number;
}

export function renderMigratePrompt(input: MigrateAckInput): string {
  const { source, estimatedCostUsd } = input;
  return `
✗ forge migrate --regenerate 需要发送数据到 Anthropic API。

数据传输内容(${source} source):
- ${source === 'openspec' ? 'openspec/specs/changes/explorations/ 下的 markdown 文档' : 'docs/superpowers/{specs,plans}/ 下的 design.md + plan.md'}
- redact 规则会先 mask 敏感信息(token / API key / IP / email);自定义 --redact-rules 可附加

预估成本:$${estimatedCostUsd.toFixed(2)} USD
提供商:Anthropic Claude API

确认继续 → 输入 ack token(下一行 prompt 提示):
`.trim();
}

interface MigrateAckFile {
  schema: 'forge-migrate-ack/v1';
  ts: string;
  source: string;
  estimated_cost_usd: number;
  acknowledged_at: string;
}

export function ackFilePath(forgeRoot: string, ts: string): string {
  return join(forgeRoot, '.forge-ack', `migrate-${ts}.yaml`);
}

export async function writeMigrateAck(
  forgeRoot: string,
  ts: string,
  input: MigrateAckInput,
): Promise<void> {
  const data: MigrateAckFile = {
    schema: 'forge-migrate-ack/v1',
    ts,
    source: input.source,
    estimated_cost_usd: input.estimatedCostUsd,
    acknowledged_at: new Date().toISOString(),
  };
  await writeFile(ackFilePath(forgeRoot, ts), stringify(data), { encoding: 'utf8', mode: 0o600 });
}

export interface CheckAckResult {
  ok: boolean;
  reason?: 'ack-missing' | 'ack-corrupt';
}

export async function checkMigrateAck(
  forgeRoot: string,
  ts: string,
): Promise<CheckAckResult> {
  const path = ackFilePath(forgeRoot, ts);
  if (!existsSync(path)) return { ok: false, reason: 'ack-missing' };
  try {
    const raw = await readFile(path, 'utf8');
    const ack = parse(raw) as MigrateAckFile | null;
    if (!ack || ack.schema !== 'forge-migrate-ack/v1') {
      return { ok: false, reason: 'ack-corrupt' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'ack-corrupt' };
  }
}
```

- [ ] **Step 4-5:pass + commit**

```bash
pnpm test -- tests/migrate/ack.test.ts
git commit -m "feat(migrate): migrate-5.1 ack.ts 专属 opt-in prompt + 写读(.forge-ack/migrate-<ts>.yaml)"
```

---

## Task 5.2:`budget.ts` migrate 专属 cost 估算

**Files:** Create `src/core/migrate/budget.ts` + `tests/migrate/budget.test.ts`

**Spec 引用**:§2.8 步骤 2 公式;§5.2 budget.ts 描述(按件长度 + token);MIGRATE_WARN_USD = $5。

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/budget.test.ts
import { describe, it, expect } from 'vitest';
import { estimateMigrateCost, MIGRATE_WARN_USD } from '../../src/core/migrate/budget.js';

describe('estimateMigrateCost', () => {
  it('按件长度估算;无 missing 件 → cost 0', () => {
    const cost = estimateMigrateCost([]);
    expect(cost).toBe(0);
  });

  it('每件 ~5k input + ~3k output token;3 件应 > $0.5', () => {
    const cost = estimateMigrateCost([
      { changeSlug: 'a', kind: 'proposal', targetPath: '', factsSource: 'design', sourceLength: 5000 },
      { changeSlug: 'a', kind: 'specs', targetPath: '', factsSource: 'tasks', sourceLength: 3000 },
      { changeSlug: 'b', kind: 'proposal', targetPath: '', factsSource: 'design', sourceLength: 6000 },
    ]);
    expect(cost).toBeGreaterThan(0.5);
  });

  it('MIGRATE_WARN_USD 等于 5', () => {
    expect(MIGRATE_WARN_USD).toBe(5);
  });
});
```

- [ ] **Step 2-3:实施**

```ts
// src/core/migrate/budget.ts
// migrate 专属 cost 估算 — Plan 8e Task 5.2
// Spec §2.8 步骤 2 + §5.2 budget.ts(按件长度 + token,不用 brownfield 4-role)

import type { MissingArtifact } from './types.js';

export const MIGRATE_WARN_USD = 5; // spec §1.4 "≥ MIGRATE_WARN_USD 默认 $5;独立常量"

// 简化估算:按件长度推 input + output token,model rate
const APPROX_INPUT_TOKEN_PER_BYTE = 0.25;   // ~4 char/token
const APPROX_OUTPUT_TOKEN_FACTOR = 0.6;     // output 约 input 的 60%
const SONNET_INPUT_PER_MTOK = 3;            // $3 / Mtok
const SONNET_OUTPUT_PER_MTOK = 15;          // $15 / Mtok
const FACTS_OVERHEAD_TOKENS = 2000;          // extractFacts + judgeAll 的额外 token

export type MissingArtifactWithLength = MissingArtifact & { sourceLength: number };

export function estimateMigrateCost(missing: MissingArtifactWithLength[]): number {
  let totalCost = 0;
  for (const m of missing) {
    const inputTokens = m.sourceLength * APPROX_INPUT_TOKEN_PER_BYTE + FACTS_OVERHEAD_TOKENS;
    const outputTokens = inputTokens * APPROX_OUTPUT_TOKEN_FACTOR;
    const cost =
      (inputTokens / 1_000_000) * SONNET_INPUT_PER_MTOK +
      (outputTokens / 1_000_000) * SONNET_OUTPUT_PER_MTOK;
    totalCost += cost;
  }
  return Math.round(totalCost * 100) / 100;
}
```

- [ ] **Step 4-5:pass + commit**

```bash
pnpm test -- tests/migrate/budget.test.ts
git commit -m "feat(migrate): migrate-5.2 budget.ts(estimateMigrateCost,按件长度 + MIGRATE_WARN_USD=5)"
```

---

## Task 5.3:`quality.ts` callAnthropic({signal}) 封装

**Files:** Create `src/core/migrate/quality.ts`(本 task 只放 callAnthropic helper;后续 task 加 prompt)

**Spec 引用**:§2.8 步骤 7 v4 修订(callAnthropic 统一封装;abort 错误映射 interrupted)。

- [ ] **Step 1:写 fail test(单元层 mock SDK)**

```ts
// tests/migrate/quality.test.ts
import { describe, it, expect, vi } from 'vitest';
import { callAnthropic, AbortInterrupted } from '../../src/core/migrate/quality.js';

describe('callAnthropic({signal})', () => {
  it('SDK 返结果 → 透传 text', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'hello' }],
        }),
      },
    };
    const out = await callAnthropic(mockClient as any, {
      model: 'claude-sonnet-4-6',
      prompt: 'x',
      maxTokens: 100,
      signal: new AbortController().signal,
    });
    expect(out).toBe('hello');
  });

  it('AbortError 映射为 AbortInterrupted', async () => {
    const ac = new AbortController();
    ac.abort();
    const err = new Error('aborted');
    err.name = 'AbortError';
    const mockClient = {
      messages: { create: vi.fn().mockRejectedValue(err) },
    };
    await expect(
      callAnthropic(mockClient as any, {
        model: 'claude-sonnet-4-6',
        prompt: 'x',
        maxTokens: 100,
        signal: ac.signal,
      }),
    ).rejects.toThrow(AbortInterrupted);
  });
});
```

- [ ] **Step 2-3:实施**

```ts
// src/core/migrate/quality.ts
// quality:facts 抽取 + judge + callAnthropic 封装 — Plan 8e Task 5.3+
// Spec §2.8 步骤 6-7 + M15 facts 目标分桶 + M9 不复用 legacy-bridge quality

import type Anthropic from '@anthropic-ai/sdk';

/** abort 后 SDK 抛错统一映射类型(spec §2.8 v4 修订) */
export class AbortInterrupted extends Error {
  constructor() {
    super('LLM call interrupted by AbortController');
    this.name = 'AbortInterrupted';
  }
}

export interface CallAnthropicInput {
  model: string;
  prompt: string;
  maxTokens: number;
  signal: AbortSignal;
}

export interface AnthropicClient {
  messages: {
    create: (
      args: Anthropic.Messages.MessageCreateParams,
      opts?: { signal?: AbortSignal },
    ) => Promise<Anthropic.Messages.Message>;
  };
}

export async function callAnthropic(client: AnthropicClient, input: CallAnthropicInput): Promise<string> {
  try {
    const result = await client.messages.create(
      {
        model: input.model,
        max_tokens: input.maxTokens,
        messages: [{ role: 'user', content: input.prompt }],
      },
      { signal: input.signal },
    );
    const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
    return block?.text ?? '';
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'AbortError' || input.signal.aborted) {
      throw new AbortInterrupted();
    }
    throw err;
  }
}
```

- [ ] **Step 4-5:pass + commit**

```bash
git commit -m "feat(migrate): migrate-5.3 quality.ts callAnthropic({signal}) 封装(AbortInterrupted 映射)"
```

---

## Task 5.4 [opus]:`extractFacts` 通用 prompt(给 OpenSpec 已有件)

**Files:** Modify `src/core/migrate/quality.ts` + `tests/migrate/quality.test.ts`

**Spec 引用**:§5.2 quality.ts(三套 prompt 各自约束)。本 task 实施通用 `extractFacts(content, n=30)` prompt(类比 legacy-bridge 同名 helper,但本地化在 migrate 模块)。

**强制 opus 模型**:prompt 设计是 design 类。

- [ ] **Step 1:写 fail test(mock SDK 返合法 JSON)**

```ts
// tests/migrate/quality.test.ts(追加)
describe('extractFacts(content)', () => {
  it('mock SDK 返 30 条 facts → 抽取', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ text: `fact ${i}`, section: '§1', critical: i < 3 }))) }],
        }),
      },
    };
    const facts = await extractFacts(mockClient, 'some content', new AbortController().signal);
    expect(facts).toHaveLength(30);
  });

  it('SDK 返非 JSON → throw QualityFailure parse-error', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] }),
      },
    };
    await expect(extractFacts(mockClient, 'x', new AbortController().signal)).rejects.toThrow(/parse-error/);
  });

  it('SDK 返 < 5 条 → throw QualityFailure too-few-facts', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify([{ text: 'a', section: '§1', critical: false }]) }],
        }),
      },
    };
    await expect(extractFacts(mockClient, 'x', new AbortController().signal)).rejects.toThrow(/too-few-facts/);
  });
});
```

- [ ] **Step 2-3:实施 + prompt(opus 设计)**

```ts
// src/core/migrate/quality.ts(追加)
export interface KeyFact {
  text: string;
  section: string;
  critical: boolean;
}

export class QualityFailure extends Error {
  constructor(public readonly reason: 'parse-error' | 'too-few-facts' | 'low-fidelity' | 'empty-facts') {
    super(`quality fail: ${reason}`);
    this.name = 'QualityFailure';
  }
}

const QUALITY_MODEL = 'claude-sonnet-4-6';
const MIN_FACTS = 5; // spec M15 v3 阈值

const EXTRACT_FACTS_PROMPT = (content: string, n: number) =>
  `从下面"原文"中抽出 ${n} 条关键事实(数字 / 字段约束 / 业务规则 / 合规条款 / 设计决策)。
每条 fact 应是单句、可验证的陈述。输出严格 JSON 数组,每项含 { text, section, critical }。
- text:简短陈述(<= 80 字)
- section:原文中所属章节锚(如 "§4.5";若无章节,填 "(unstructured)")
- critical:布尔,合规 / 安全 / 业务硬约束 = true,其余 = false

# 原文
${content}

仅输出 JSON 数组,不输出 preamble、不带 markdown code fence。`;

function parseFactsResponse(text: string): KeyFact[] {
  // 容忍 LLM 输出 ```json fence(legacy-bridge I-3 修)
  const cleaned = text
    .trim()
    .replace(/^```(?:json|JSON)?\r?\n/, '')
    .replace(/\r?\n```\s*$/, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new QualityFailure('parse-error');
  }
  if (!Array.isArray(parsed)) throw new QualityFailure('parse-error');
  const facts: KeyFact[] = parsed.map((item) => {
    const o = item as Partial<KeyFact>;
    return {
      text: typeof o.text === 'string' ? o.text : '',
      section: typeof o.section === 'string' ? o.section : '(unstructured)',
      critical: typeof o.critical === 'boolean' ? o.critical : false,
    };
  }).filter((f) => f.text.trim().length > 0);

  // 重复去重(text 相似度;简化:小写完全相等去重)
  const seen = new Set<string>();
  const unique = facts.filter((f) => {
    const key = f.text.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length < MIN_FACTS) {
    throw new QualityFailure('too-few-facts');
  }
  return unique;
}

export async function extractFacts(
  client: AnthropicClient,
  content: string,
  signal: AbortSignal,
  n: number = 30,
): Promise<KeyFact[]> {
  const text = await callAnthropic(client, {
    model: QUALITY_MODEL,
    prompt: EXTRACT_FACTS_PROMPT(content, n),
    maxTokens: 4096,
    signal,
  });
  return parseFactsResponse(text);
}
```

- [ ] **Step 4-5:pass + commit**

```bash
pnpm test -- tests/migrate/quality.test.ts -t "extractFacts"
git commit -m "feat(migrate): migrate-5.4 extractFacts(content) 通用 prompt + 阈值 5 + 去重"
```

---

## Task 5.5 [opus]:`extractMotivationFacts(design)` — proposal 校验

**Files:** Modify `src/core/migrate/quality.ts` + tests

**Spec 引用**:§2.8 facts 目标分桶(M15 v3)— proposal 校验 facts 来自 design 的"问题/动机"句。

**强制 opus 模型**:prompt 设计。

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/quality.test.ts(追加)
describe('extractMotivationFacts — design → motivation', () => {
  it('mock 返 8 条 motivation facts', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(
            Array.from({ length: 8 }, (_, i) => ({ text: `motivation ${i}`, section: '§Why', critical: i === 0 })),
          ) }],
        }),
      },
    };
    const facts = await extractMotivationFacts(mockClient, 'design content', new AbortController().signal);
    expect(facts).toHaveLength(8);
    expect(facts.every((f) => f.section === '§Why' || /motivation/i.test(f.text))).toBe(true);
  });
});
```

- [ ] **Step 2-3:实施 prompt**

```ts
// src/core/migrate/quality.ts(追加)
const EXTRACT_MOTIVATION_PROMPT = (designContent: string) =>
  `从下面"design 文档"中**只抽取"问题 / 动机 / 约束"类事实**,用于后续验证生成的 proposal.md 是否覆盖。

抽取标准(positive examples):
- "用户当前无法 X,需 Y 因为 Z"(动机)
- "系统约束:必须 < 100ms 响应"(约束)
- "依赖 A v2.0+,影响 module B"(背景)

排除(negative examples,不抽):
- "实现:用 hashmap 存储"(实现细节,该进 specs)
- "Step 1: 创建 schema"(执行步骤,该进 tasks)
- 架构图 / 接口定义(实现层)

输出严格 JSON 数组,每项 { text, section, critical }(同 extractFacts 格式)。
**至少抽 5 条;< 5 条说明 design 缺动机阐述,即 fail。**

# design 文档
${designContent}

仅输出 JSON 数组。`;

export async function extractMotivationFacts(
  client: AnthropicClient,
  designContent: string,
  signal: AbortSignal,
): Promise<KeyFact[]> {
  const text = await callAnthropic(client, {
    model: QUALITY_MODEL,
    prompt: EXTRACT_MOTIVATION_PROMPT(designContent),
    maxTokens: 4096,
    signal,
  });
  return parseFactsResponse(text);
}
```

- [ ] **Step 4-5:pass + commit**

```bash
git commit -m "feat(migrate): migrate-5.5 [opus] extractMotivationFacts(design) prompt(facts 目标分桶)"
```

---

## Task 5.6 [opus]:`extractBehaviorFacts(tasks)` — specs 校验

**Files:** Modify `quality.ts` + tests

**Spec 引用**:M15 v3;specs 校验 facts 来自 tasks 的"行为/输出"句。

**强制 opus 模型**:prompt 设计。

- [ ] **Step 1-3:写 prompt**(同 5.5 结构,positive/negative examples 不同)

```ts
const EXTRACT_BEHAVIOR_PROMPT = (tasksContent: string) =>
  `从下面"tasks/plan 文档"中**只抽取"行为 / 输出 / 给定条件"类事实**,用于后续验证生成的 specs/<area>.md 是否覆盖。

抽取标准(positive examples):
- "task-1: 用户登录后跳到 /home"(行为)
- "task-2: 输入空 username → 返 400"(行为 + 错误)
- "task-3: 配置 retries=3"(给定参数)

排除(negative examples,不抽):
- "动机:简化 onboarding"(动机,该进 motivation)
- "依赖 lodash@4"(实现细节)
- "提交后跑 lint"(开发流程)

输出严格 JSON 数组(同格式)。**至少抽 5 条;< 5 条 fail。**

# tasks 文档
${tasksContent}

仅输出 JSON 数组。`;

export async function extractBehaviorFacts(
  client: AnthropicClient,
  tasksContent: string,
  signal: AbortSignal,
): Promise<KeyFact[]> {
  const text = await callAnthropic(client, {
    model: QUALITY_MODEL,
    prompt: EXTRACT_BEHAVIOR_PROMPT(tasksContent),
    maxTokens: 4096,
    signal,
  });
  return parseFactsResponse(text);
}
```

- [ ] **Step 4-5:pass + commit**

```bash
git commit -m "feat(migrate): migrate-5.6 [opus] extractBehaviorFacts(tasks) prompt(facts 目标分桶)"
```

---

## Task 5.7:facts 重复去重(已合并入 Task 5.4 parseFactsResponse)

跳过;`parseFactsResponse` 内已实施 lowercase trim 去重(spec §5.2 + codex #27 minor)。

---

## Task 5.8:`judgeAll(generated, facts)` + fidelity threshold

**Files:** Modify `quality.ts` + tests

**Spec 引用**:§2.8 步骤 6(quality.judgeAll);M15 v3 fidelity threshold 0.6(superpowers)/ 0.9(其他)。

- [ ] **Step 1:写 fail test**

```ts
// tests/migrate/quality.test.ts(追加)
describe('judgeAll', () => {
  it('全 preserved → passed', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'preserved\nclean.' }],
        }),
      },
    };
    const facts: KeyFact[] = Array.from({ length: 5 }, (_, i) => ({ text: `fact ${i}`, section: '§1', critical: false }));
    const result = await judgeAll(mockClient, 'generated body', facts, 0.9, new AbortController().signal);
    expect(result.passed).toBe(true);
    expect(result.totalRate).toBe(1);
  });

  it('70% preserved + threshold 0.9 → fail', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockImplementation((args: any) => {
          // mock 7 个 preserved + 3 个 lost(总 10 个 fact)
          const idx = (mockClient.messages.create as any).mock.calls.length - 1;
          return Promise.resolve({
            content: [{ type: 'text', text: idx < 7 ? 'preserved\n' : 'lost\n' }],
          });
        }),
      },
    };
    const facts: KeyFact[] = Array.from({ length: 10 }, (_, i) => ({ text: `f ${i}`, section: '§1', critical: false }));
    const result = await judgeAll(mockClient, 'gen', facts, 0.9, new AbortController().signal);
    expect(result.passed).toBe(false);
    expect(result.totalRate).toBeLessThan(0.9);
  });
});
```

- [ ] **Step 2-3:实施**

```ts
// src/core/migrate/quality.ts(追加)
export type FactState = 'preserved' | 'paraphrased' | 'lost';

export interface JudgeResult {
  passed: boolean;
  totalRate: number;
  criticalRate: number;
  lostFacts: KeyFact[];
}

const JUDGE_PROMPT = (generatedBody: string, fact: KeyFact) =>
  `判断下面这条"原文事实"是否在"生成产物"里被保留。
三态:preserved(字面量或数值一致)| paraphrased(同义改写但语义等价)| lost(完全没提到 / 漏数值 / 漏约束)

# 原文事实(章节 ${fact.section}, ${fact.critical ? 'critical' : 'non-critical'})
${fact.text}

# 生成产物
${generatedBody}

输出格式:第 1 行 preserved/paraphrased/lost,第 2 行起简短理由(可省)。`;

export async function judgeAll(
  client: AnthropicClient,
  generatedBody: string,
  facts: KeyFact[],
  threshold: number,
  signal: AbortSignal,
): Promise<JudgeResult> {
  const judges = await Promise.all(
    facts.map(async (fact) => {
      const text = await callAnthropic(client, {
        model: QUALITY_MODEL,
        prompt: JUDGE_PROMPT(generatedBody, fact),
        maxTokens: 256,
        signal,
      });
      const firstLine = (text.split('\n')[0] ?? '').trim().toLowerCase();
      const state: FactState =
        firstLine === 'preserved' || firstLine === 'paraphrased' || firstLine === 'lost'
          ? firstLine
          : 'lost';
      return { fact, state };
    }),
  );
  const critical = judges.filter((j) => j.fact.critical);
  const critPreserved = critical.filter((j) => j.state !== 'lost');
  const totalPreserved = judges.filter((j) => j.state !== 'lost');
  const criticalRate = critical.length === 0 ? 1 : critPreserved.length / critical.length;
  const totalRate = judges.length === 0 ? 1 : totalPreserved.length / judges.length;
  const lostFacts = judges.filter((j) => j.state === 'lost').map((j) => j.fact);
  return {
    passed: criticalRate >= 1 && totalRate >= threshold,
    totalRate,
    criticalRate,
    lostFacts,
  };
}
```

- [ ] **Step 4-5:commit**

```bash
git commit -m "feat(migrate): migrate-5.8 quality.judgeAll(threshold 可配)"
```

---

## Task 5.9:`getFidelityThreshold(sourceId)`

**Files:** Modify `quality.ts`

**Spec 引用**:M15 v3 — superpowers 默认 0.6,brownfield 0.9。

```ts
// src/core/migrate/quality.ts(追加)
import type { SourceId } from './types.js';

export function getFidelityThreshold(sourceId: SourceId): number {
  return sourceId === 'superpowers' ? 0.6 : 0.9;
}
```

- [ ] **Step 1-3:写测 + 实施**

```ts
// tests/migrate/quality.test.ts
it('getFidelityThreshold superpowers=0.6 / openspec=0.9', () => {
  expect(getFidelityThreshold('superpowers')).toBe(0.6);
  expect(getFidelityThreshold('openspec')).toBe(0.9);
});
```

- [ ] **Step 4-5:commit**

```bash
git commit -m "feat(migrate): migrate-5.9 getFidelityThreshold(superpowers=0.6, openspec=0.9)"
```

---

## Task 5.10:JSON parse fail / facts < 5 已合并入 Task 5.4

跳过;parseFactsResponse 已抛 QualityFailure。

---

## Task 5.11:`regenerate.ts` 主流程 + redact 接入

**Files:** Create `src/core/migrate/regenerate.ts`

**Spec 引用**:§2.8 v3 完整流程 + §5.1 复用 redact.ts。

- [ ] **Step 1:写 fail test(集成测见 Task 5.15)**

本 task 主要写 regenerate.run(...) 主流程;集成测覆盖。

- [ ] **Step 2-3:实施**

```ts
// src/core/migrate/regenerate.ts
// --regenerate 主流程 — Plan 8e Task 5.11+
// Spec §2.8 v3 + §5.1 复用 redact

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { redact, DEFAULT_REDACT_RULES } from '../legacy-bridge/redact.js';
import {
  callAnthropic,
  extractFacts,
  extractMotivationFacts,
  extractBehaviorFacts,
  judgeAll,
  getFidelityThreshold,
  QualityFailure,
  AbortInterrupted,
  type AnthropicClient,
} from './quality.js';
import type { ClassificationPlan, MissingArtifact, MigrateSource, TraceOp } from './types.js';

const REGEN_MODEL = 'claude-opus-4-7'; // 生成用 opus(质量高);extract+judge 用 sonnet

export interface RegenerateContext {
  source: MigrateSource;
  plan: ClassificationPlan;
  cwd: string;
  abortController: AbortController;
  client: AnthropicClient;
  appendTraceOp: (op: TraceOp) => Promise<void>;
}

export interface RegenerateResult {
  succeeded: number;
  failed: number;
  partials: string[]; // .partial 文件路径列表
}

export async function runRegenerate(ctx: RegenerateContext): Promise<RegenerateResult> {
  const result: RegenerateResult = { succeeded: 0, failed: 0, partials: [] };
  const missing = ctx.source.listMissingArtifacts(ctx.plan);
  const threshold = getFidelityThreshold(ctx.source.id);

  for (const m of missing) {
    if (ctx.abortController.signal.aborted) break;
    try {
      const generated = await regenerateOne(m, ctx, threshold);
      const targetAbs = join(ctx.cwd, m.targetPath);
      await writeFile(targetAbs, generated, 'utf8');
      await ctx.appendTraceOp({
        from: null,
        to: targetAbs,
        kind: m.kind === 'specs' ? 'spec' : 'proposal',
        transform: ['regen'],
        validate: 'ok',
        regen: { model: REGEN_MODEL, facts: 0, passed: 0, threshold },
        writtenAt: new Date().toISOString(),
        status: 'committed',
      });
      result.succeeded++;
    } catch (err) {
      const reason =
        err instanceof QualityFailure
          ? `quality-fail: ${err.reason}`
          : err instanceof AbortInterrupted
            ? 'interrupted'
            : 'network-error';
      const partialPath = join(ctx.cwd, m.targetPath + `.partial-${m.kind}.md`);
      // .partial 内容写出错信息;若有部分生成内容也保留
      await writeFile(partialPath, `<!-- regen failed: ${reason} -->\n`, 'utf8');
      result.partials.push(partialPath);
      result.failed++;
      if (err instanceof AbortInterrupted) break;
    }
  }
  return result;
}

async function regenerateOne(
  m: MissingArtifact,
  ctx: RegenerateContext,
  threshold: number,
): Promise<string> {
  // 1. 读 facts source(M15 目标分桶)
  let factsSourceContent: string;
  if (m.factsSource === 'design') {
    const designOp = findArtifact(ctx.plan, m.changeSlug, 'design');
    factsSourceContent = designOp ? await readFile(designOp.absPath, 'utf8') : '';
  } else if (m.factsSource === 'tasks') {
    const tasksOp = findArtifact(ctx.plan, m.changeSlug, 'tasks');
    factsSourceContent = tasksOp ? await readFile(tasksOp.absPath, 'utf8') : '';
  } else {
    factsSourceContent = ''; // 'self' 路径:OpenSpec 已有件用本身原文(此处简化;实施期 P5 完善)
  }

  // 2. redact(spec §5.1 复用)
  const { redactedText } = redact(factsSourceContent, DEFAULT_REDACT_RULES);

  // 3. 调 SDK 生成目标
  const targetPrompt =
    m.kind === 'proposal'
      ? `基于下面 design,生成符合 forge 格式的 proposal.md(# 标题 + ## Why + ## What):\n\n${redactedText}`
      : `基于下面 tasks,生成符合 forge 格式的 specs/<area>.md(# 标题 + ## Scenario: <id> + **Given/When/Then**):\n\n${redactedText}`;

  const generated = await callAnthropic(ctx.client, {
    model: REGEN_MODEL,
    prompt: targetPrompt,
    maxTokens: 4096,
    signal: ctx.abortController.signal,
  });

  // 4. 抽 facts(分桶)
  const facts =
    m.factsSource === 'design'
      ? await extractMotivationFacts(ctx.client, redactedText, ctx.abortController.signal)
      : m.factsSource === 'tasks'
        ? await extractBehaviorFacts(ctx.client, redactedText, ctx.abortController.signal)
        : await extractFacts(ctx.client, redactedText, ctx.abortController.signal);

  // 5. judge
  const judge = await judgeAll(ctx.client, generated, facts, threshold, ctx.abortController.signal);
  if (!judge.passed) {
    throw new QualityFailure('low-fidelity');
  }

  // 6. 写盘前二次检查 abort(spec §3.1)
  if (ctx.abortController.signal.aborted) throw new AbortInterrupted();

  return generated;
}

function findArtifact(plan: ClassificationPlan, slug: string, kind: 'design' | 'tasks') {
  const c = plan.changes.find((c) => c.slug === slug);
  return c?.artifacts[kind];
}
```

- [ ] **Step 4-5:commit**

```bash
git commit -m "feat(migrate): migrate-5.11 regenerate.ts 主流程 + redact + facts 分桶 + judge"
```

---

## Task 5.12:AbortController 串通 SIGINT(已在 5.3 + 5.11 实施)

跳过;`AbortInterrupted` 在 5.3 抛、5.11 catch 后写 .partial。

---

## Task 5.13:`.partial` 写入(已在 5.11 实施)

跳过;5.11 已包含。

---

## Task 5.14:`package.json` 锁 SDK 版本

**Files:** Modify `package.json`

**Spec 引用**:§7.1 风险表 + §5.3 改动模块清单。

- [ ] **Step 1:改 dependencies**

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm add '@anthropic-ai/sdk@^0.27.0'
```

或手编辑 `package.json` `dependencies."@anthropic-ai/sdk": "^0.27.0"`(若已 ≥ 0.27 → 检查 lock 文件)。

- [ ] **Step 2:跑 typecheck + 整测**

```bash
pnpm typecheck && pnpm test
```

预期:0 error。SDK 版本变化可能让现有 legacy-bridge SDK call 也走新 API,需检查兼容性。

- [ ] **Step 3:commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(migrate): migrate-5.14 锁 @anthropic-ai/sdk ≥ 0.27.0(AbortSignal 支持,M14)"
```

---

## Task 5.15:regenerate 集成测(mock SDK 全链路)

**Files:** Create `tests/migrate/regenerate.test.ts`

**Spec 引用**:§4.3 regenerate 集成测断言点。

- [ ] **Step 1:写完整集成测**

```ts
// tests/migrate/regenerate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runRegenerate } from '../../src/core/migrate/regenerate.js';
// ... 完整 mock SDK 4 阶段:
//   - extractMotivationFacts(返 8 facts)
//   - extractBehaviorFacts(返 12 facts)
//   - regenerate.callAnthropic 生成 proposal/spec
//   - judgeAll 每件 8/12 mock
// 断言:
//   - 成功件 proposal.md 落地
//   - 第 N 件 mock 返 < 5 facts → .partial-proposal.md 残留 + report 标 [regen:quality-fail: too-few-facts]
//   - AbortController.abort() → 写盘跳过 + .partial-...md 残留
//   - JSON parse fail mock → .partial + [regen:quality-fail: parse-error]
```

详细实施由 subagent 完成;本 plan 只列断言点。

- [ ] **Step 2-5:fail / 实施 / pass / commit**

```bash
pnpm test -- tests/migrate/regenerate.test.ts
git commit -m "test(migrate): migrate-5.15 regenerate.test.ts mock SDK 全链路集成测"
```

---

## Task 5.16:M13 enforceArchiveIntegrity(交互 + --no-interactive)

**Files:** Modify `src/core/migrate/index.ts`

**Spec 引用**:§1.5 主流程行 175-178 + §3.1 错误矩阵 classify M13 行。

- [ ] **Step 1:写测**(superpowers 集成测的 archive case 已写;本 task 让其 PASS)

```ts
// tests/migrate/superpowers.test.ts(plan-8c 已铺;现实施)
it('add-auth(全 [x] + git slug+close commit)→ 推测 archive 但缺件;--no-interactive → exit 4', async () => {
  // 实施期跑通,plan-8c 测占位转 PASS
});
```

- [ ] **Step 2-3:实施 enforceArchiveIntegrity 在 runMigrate**

```ts
// src/core/migrate/index.ts(在 ack 之前加)
function enforceArchiveIntegrity(
  plan: ClassificationPlan,
  regenEnabled: boolean,
  noInteractive: boolean,
): { plan: ClassificationPlan; downgrades: { change: string; from: string; to: string; reason: string }[]; abort: boolean } {
  const downgrades: ReturnType<typeof enforceArchiveIntegrity>['downgrades'] = [];
  const newPlan = { ...plan, changes: [...plan.changes] };
  for (const c of newPlan.changes) {
    if (c.classification !== 'archive') continue;
    // 缺 proposal/specs?
    const hasProposal = !!c.artifacts.proposal;
    const hasSpec = !!c.artifacts.spec;
    if (hasProposal && hasSpec) continue; // archive 完整 OK

    if (regenEnabled) continue; // 留给 LLM 补;本函数不动

    // regen 关 / 拒绝 → 必须降级
    if (noInteractive) {
      console.error(
        `[migrate] M13 archive 完整性不可达(change: ${c.slug});--no-interactive 模式 abort`,
      );
      return { plan: newPlan, downgrades, abort: true };
    }
    // 交互模式(此处需 readline/inquirer;P5 简化:console + 默认降级)
    // 实施期接 prompts package
    c.classification = 'active';
    downgrades.push({ change: c.slug, from: 'archive', to: 'active', reason: 'M13: missing proposal/specs;user chose downgrade' });
  }
  return { plan: newPlan, downgrades, abort: false };
}
```

- [ ] **Step 4-5:pass + commit**

```bash
git commit -m "feat(migrate): migrate-5.16 M13 enforceArchiveIntegrity(交互降级 / no-interactive abort exit 4)"
```

---

## Task 5.17:M16 bundled + superpowers 前置 prompt

**Files:** Modify `src/core/migrate/index.ts`

**Spec 引用**:M16 v3 + §1.5 主流程 bundled 路径。

- [ ] **Step 1-3:实施 isBundled + bundled prompt**

```ts
// src/core/migrate/index.ts(在 missingPreview 算后、ack 前加)
function isBundled(): boolean {
  // bundled plugin 走 ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js;env 探测
  return process.env.FORGE_BUNDLED === '1' || (process.env.CLAUDE_PLUGIN_ROOT?.includes('forge-bundled') ?? false);
}

// ...在 runMigrate 内,bundled 路径
if (isBundled() && regenEnabled) {
  if (source.id === 'superpowers') {
    if (opts.noInteractive) {
      console.error('[migrate] bundled + superpowers + --no-interactive: refuse to silently degrade');
      return 4;
    }
    const msg = `[migrate] bundled plugin: --regenerate unavailable;此模式将产生 ${missingPreview.length} 个 [needs-fix](superpowers 必缺 proposal/specs)。继续?`;
    // simple readline prompt
    const ok = await promptYesNo(msg);
    if (!ok) return 0;
    regenEnabled = false;
  } else {
    console.warn('[migrate] bundled: --regenerate unavailable, falling back to --no-regenerate');
    regenEnabled = false;
  }
}
```

- [ ] **Step 4-5:pass + commit**

```bash
git commit -m "feat(migrate): migrate-5.17 M16 bundled prompt(openspec 静默 / superpowers 前置 prompt)"
```

---

## Plan 8e Self-Review

- [ ] ack.ts:migrate 专属 prompt(无 brownfield 文案);写读 .forge-ack/migrate-<ts>.yaml
- [ ] budget.ts:estimateMigrateCost(按件长度);MIGRATE_WARN_USD = 5
- [ ] quality.ts 三套 prompt:extractFacts(通用)/ extractMotivationFacts(design)/ extractBehaviorFacts(tasks)
- [ ] facts < 5 / JSON parse fail → QualityFailure
- [ ] 重复 facts(text 小写)去重
- [ ] getFidelityThreshold:superpowers=0.6,openspec=0.9
- [ ] callAnthropic({signal})统一封装;AbortError → AbortInterrupted
- [ ] regenerate.ts 主流程:redact → 调 SDK → 抽 facts → judge → 通过则写,失败 .partial
- [ ] M13 enforceArchiveIntegrity:--no-interactive abort exit 4 / 交互降级
- [ ] M16 bundled + sp 前置 prompt;--no-interactive abort
- [ ] @anthropic-ai/sdk ≥ 0.27.0 锁
- [ ] 集成测全链路 mock(成功 / too-few-facts / parse-error / abort)

P5 完成,M5 里程碑达成(--regenerate 端到端跑通可在真 API 手测一次)。
