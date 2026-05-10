// src/core/migrate/quality.ts
// quality:facts 抽取 + judge + callAnthropic 封装 — Plan 8e Task 5.3-5.9
// 对应 spec §2.8 步骤 6-7 + M15 facts 目标分桶 + M9 不复用 legacy-bridge quality

import type Anthropic from '@anthropic-ai/sdk';
import type { SourceId } from './types.js';

// ============================================================================
// Errors
// ============================================================================

/** abort 后 SDK 抛错统一映射类型(spec §2.8 v4 修订) */
export class AbortInterrupted extends Error {
  constructor() {
    super('LLM call interrupted by AbortController');
    this.name = 'AbortInterrupted';
  }
}

/** quality 失败:facts 不足 / parse 错 / fidelity 低 */
export class QualityFailure extends Error {
  constructor(
    public readonly reason: 'parse-error' | 'too-few-facts' | 'low-fidelity' | 'empty-facts',
  ) {
    super(`quality fail: ${reason}`);
    this.name = 'QualityFailure';
  }
}

// ============================================================================
// Types
// ============================================================================

export interface CallAnthropicInput {
  model: string;
  prompt: string;
  maxTokens: number;
  signal: AbortSignal;
}

/** 简化的 Anthropic client 接口(便于测试 mock) */
export interface AnthropicClient {
  messages: {
    create: (
      args: Anthropic.Messages.MessageCreateParams,
      opts?: { signal?: AbortSignal },
    ) => Promise<Anthropic.Messages.Message>;
  };
}

/** 关键 fact 数据结构 */
export interface KeyFact {
  text: string;
  section: string;
  critical: boolean;
}

/** fact 状态:preserved(字面)/ paraphrased(等价)/ lost(漏) */
export type FactState = 'preserved' | 'paraphrased' | 'lost';

export interface JudgeResult {
  passed: boolean;
  totalRate: number;
  criticalRate: number;
  lostFacts: KeyFact[];
}

// ============================================================================
// 模型常量
// ============================================================================

// quality(extract + judge)用 sonnet(快+便宜),实际生成走 opus 在 regenerate.ts
const QUALITY_MODEL = 'claude-sonnet-4-6';
// spec M15 v3 阈值:< 5 条 facts 视为信息密度不足,直接 fail
const MIN_FACTS = 5;

// ============================================================================
// Task 5.3:callAnthropic({signal}) 统一封装
// ============================================================================

/**
 * 统一封装 SDK 调用:transient AbortError → AbortInterrupted。
 * 注意:input.signal 必传,中断信号穿透到 SDK 层。
 */
export async function callAnthropic(
  client: AnthropicClient,
  input: CallAnthropicInput,
): Promise<string> {
  try {
    const result = await client.messages.create(
      {
        model: input.model,
        max_tokens: input.maxTokens,
        messages: [{ role: 'user', content: input.prompt }],
      },
      { signal: input.signal },
    );
    // TS strict 下 content 是 union ContentBlock[];用 type guard narrow 到 TextBlock
    const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
    return block?.text ?? '';
  } catch (err) {
    const name = (err as Error).name;
    // SDK 抛 AbortError 或 signal 已 abort → 统一映射 AbortInterrupted
    if (name === 'AbortError' || input.signal.aborted) {
      throw new AbortInterrupted();
    }
    throw err;
  }
}

// ============================================================================
// 通用 facts 解析(容忍 ```json fence + 去重 + MIN_FACTS 阈值)
// ============================================================================

/** 容忍 LLM ```json 包裹 + 解析 JSON 数组 + 去重 + 阈值检查 */
function parseFactsResponse(text: string): KeyFact[] {
  // 容忍 ```json fence(legacy-bridge I-3 修)
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

  // 字段宽松解析 + 默认值兜底
  const facts: KeyFact[] = parsed
    .map((item) => {
      const o = item as Partial<KeyFact>;
      return {
        text: typeof o.text === 'string' ? o.text : '',
        section: typeof o.section === 'string' ? o.section : '(unstructured)',
        critical: typeof o.critical === 'boolean' ? o.critical : false,
      };
    })
    .filter((f) => f.text.trim().length > 0);

  // 重复 facts 去重(text 小写完全相等去重 — 简化策略,任务 5.7)
  const seen = new Set<string>();
  const unique = facts.filter((f) => {
    const key = f.text.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 任务 5.10:< 5 条直接 fail(spec M15 v3 阈值)
  if (unique.length < MIN_FACTS) {
    throw new QualityFailure('too-few-facts');
  }
  return unique;
}

// ============================================================================
// 三套 prompt(Task 5.4-5.6)— positive/negative examples 区分
// ============================================================================

// Task 5.4 — 通用 extractFacts(给 OpenSpec 已有件,无目标分桶)
const EXTRACT_FACTS_PROMPT = (content: string, n: number): string =>
  `从下面"原文"中抽出最多 ${n} 条关键事实。
关键事实定义:数字 / 字段约束 / 业务规则 / 合规条款 / 设计决策 / 接口契约 / 错误码。
每条 fact 必须是单句、可独立验证的陈述。

# 输出格式(严格 JSON 数组)
每项含 { "text": string, "section": string, "critical": boolean }
- text:简短陈述(<= 80 字),保留原文中的具体数值 / 字段名
- section:原文中所属章节锚(如 "§4.5" 或 "## 接口";若无章节,填 "(unstructured)")
- critical:true 仅当该事实属于合规 / 安全 / 业务硬约束;其余 false

# 抽取标准
positive(应抽):
- "rate-limit:每用户 60 req/min"(数值约束)
- "字段 user_id 必须 UUID v4"(字段约束)
- "PII 数据不落盘"(合规)

negative(不抽):
- "本系统采用微服务架构"(过泛,无可验证陈述)
- "团队约定使用 TypeScript"(开发约定,非业务事实)
- "// TODO: 后面优化"(注释非事实)

# 原文
${content}

仅输出 JSON 数组,不输出 preamble、不带 markdown code fence。`;

// Task 5.5 — extractMotivationFacts(design → proposal 校验)
// M15 facts 目标分桶:proposal 关注"问题/动机/约束",不进实现细节
const EXTRACT_MOTIVATION_PROMPT = (designContent: string): string =>
  `从下面"design 文档"中**只抽取"问题 / 动机 / 约束 / 背景"类事实**。
用途:验证后续生成的 proposal.md 是否完整覆盖动机。
**严格按目标分桶过滤,实现层细节不要进来**。

# 抽取标准

positive(应抽 — 动机 / 约束 / 背景):
- "用户当前无法 X,需 Y 因为 Z"(动机阐述)
- "系统约束:必须 < 100ms p99 响应"(性能约束)
- "依赖 module A v2.0+;v1 接口不兼容"(背景依赖)
- "合规要求:PII 数据不存盘"(critical 约束)
- "选 hashmap 因为 read >> write 比例 100:1"(设计决策的 why,不是 how)

negative(不抽 — 实现细节 / 执行步骤 / 接口定义):
- "实现:用 Map<string, User> 存储"(实现 how)
- "Step 1: 创建 schema"(任务步骤,该进 tasks)
- "POST /api/users 入参 { name, email }"(接口定义,该进 specs)
- "架构图:gateway → service → db"(架构图,实现层)
- 单纯方案描述无 why

# 输出格式(严格 JSON 数组)
{ "text": string(<= 80 字), "section": string, "critical": boolean }
critical=true 仅当该约束是合规 / 安全 / 业务硬底线。

# 阈值
**至少抽 5 条;< 5 条说明 design 缺动机阐述,即视为 fail。**

# design 文档
${designContent}

仅输出 JSON 数组,不输出 preamble。`;

// Task 5.6 — extractBehaviorFacts(tasks → specs 校验)
// M15 facts 目标分桶:specs 关注"行为/输出/给定条件",不进动机
const EXTRACT_BEHAVIOR_PROMPT = (tasksContent: string): string =>
  `从下面"tasks/plan 文档"中**只抽取"行为 / 输出 / 给定条件 / 错误处理"类事实**。
用途:验证后续生成的 specs/<area>.md 是否完整覆盖行为契约。
**严格按目标分桶过滤,动机 / 实现细节不要进来**。

# 抽取标准

positive(应抽 — 行为 / 输出 / 输入 / 错误):
- "task-1: 用户登录后跳到 /home"(行为)
- "task-2: 输入空 username → 返 400 + 错误码 USER_REQUIRED"(行为 + 错误)
- "task-3: 配置 retries=3, backoff=exponential"(给定参数)
- "成功响应:status=200, body 含 user_id 和 token"(输出契约)
- "task-5: 重复提交相同 idempotency-key → 返同一结果"(幂等行为)

negative(不抽 — 动机 / 实现 / 流程):
- "动机:简化 onboarding"(动机,该进 motivation)
- "依赖 lodash@4 的 debounce"(实现细节)
- "提交后跑 lint 和 typecheck"(开发流程,非产品行为)
- "项目背景:取代旧 v1 系统"(背景说明)
- "PR 合并需 2 人 review"(协作流程)

# 输出格式(严格 JSON 数组)
{ "text": string(<= 80 字), "section": string, "critical": boolean }
critical=true 仅当该行为是合规 / 安全 / 业务硬契约。

# 阈值
**至少抽 5 条;< 5 条 fail。**

# tasks 文档
${tasksContent}

仅输出 JSON 数组,不输出 preamble。`;

// ============================================================================
// Task 5.4-5.6:三个 extract 入口
// ============================================================================

/**
 * 通用 extractFacts:给 OpenSpec 已有件用(spec.md / proposal.md 等),不分桶。
 * 默认 n=30;tokens 上限 4096(覆盖 30 条 80 字 + 字段)。
 */
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

/** extractMotivationFacts:从 design 抽"问题/动机/约束",用于 proposal 校验。 */
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

/** extractBehaviorFacts:从 tasks 抽"行为/输出",用于 specs 校验。 */
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

// ============================================================================
// Task 5.8:judgeAll(三态判断 + 聚合 critical/total rate)
// ============================================================================

/** judge prompt:三态判断 preserved / paraphrased / lost */
const JUDGE_PROMPT = (generatedBody: string, fact: KeyFact): string =>
  `判断下面这条"原文事实"是否在"生成产物"里被保留。

# 三态定义
- preserved:字面量或数值一致(原文数字 / 字段名 / 错误码 / 状态码 在产物中可找到)
- paraphrased:同义改写但语义等价(无遗漏数值 / 约束 / 关键名词)
- lost:完全没提到 / 漏关键数值 / 漏约束 / 改成不同含义

# 原文事实
- 章节:${fact.section}
- 重要级:${fact.critical ? 'critical' : 'non-critical'}
- 内容:${fact.text}

# 生成产物
${generatedBody}

# 输出格式
第 1 行只输出一个词:preserved / paraphrased / lost
第 2 行起(可省):简短理由(<= 50 字)`;

/**
 * judgeAll:并行 judge 每条 fact,聚合 critical+total rate。
 * 通过条件:criticalRate === 1 AND totalRate >= threshold。
 */
export async function judgeAll(
  client: AnthropicClient,
  generatedBody: string,
  facts: KeyFact[],
  threshold: number,
  signal: AbortSignal,
): Promise<JudgeResult> {
  // 并行 judge(每个 fact 独立调用,Promise.all 聚合)
  const judges = await Promise.all(
    facts.map(async (fact) => {
      const text = await callAnthropic(client, {
        model: QUALITY_MODEL,
        prompt: JUDGE_PROMPT(generatedBody, fact),
        maxTokens: 256,
        signal,
      });
      const firstLine = (text.split('\n')[0] ?? '').trim().toLowerCase();
      // 解析失败默认 lost(防 LLM 输出意外格式 → 保守判 lost,不假装通过)
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
  // critical 列表为空时视为 1(无 critical 约束)
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

// ============================================================================
// Task 5.9:getFidelityThreshold
// ============================================================================

/**
 * fidelity threshold:
 * - superpowers 0.6(LLM 生成质量约束;非 brownfield 路径 — superpowers 是专属 plugin 产物,
 *   与 legacy-bridge brownfield 是不同的迁移源,prompt 不混用;阈值偏松因 plugin 产物结构噪声)
 * - openspec 0.9(spec 严格,行为契约期望高保真)
 */
export function getFidelityThreshold(sourceId: SourceId): number {
  return sourceId === 'superpowers' ? 0.6 : 0.9;
}
