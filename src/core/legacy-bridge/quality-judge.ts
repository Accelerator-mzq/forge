// 双 LLM 抽样保真率验证 — Plan 7 Phase B3
// 决策 #16 修订(I-2):分层抽样 — critical 全量必抽 + 各章节按比例抽 + 总数约 30
// 失败路径:critical 任一丢失 → exit 2,无 retry,直接报告 + 写 .partial(spec §5.1)

import Anthropic from '@anthropic-ai/sdk';
import type { KeyFact, QualityResult, LegacyAnchorRole } from './types.js';

/** 默认总抽样数(决策 #16) */
export const DEFAULT_SAMPLE_TOTAL = 30;
/** 默认非 critical 保真率阈值(决策 #16) */
export const DEFAULT_FIDELITY_THRESHOLD = 0.9;

/** 抽样输入 */
export interface SamplingInput {
  /** scenario 标注的全部 key facts */
  allFacts: KeyFact[];
  /** 总抽样数(默认 DEFAULT_SAMPLE_TOTAL) */
  total?: number;
}

/** 抽样输出 */
export interface SamplingOutput {
  /** 实际抽样的 fact 列表(critical 全量在前 + 各章节按比例) */
  sampled: KeyFact[];
  /** 各章节抽样数(用于 per_section_rates 计算分母) */
  perSectionSampled: Record<string, number>;
  /** 抽样未覆盖的章节(警告) */
  uncoveredSections: string[];
}

/**
 * 分层抽样(决策 #16):
 * 1. critical-facts 全量抽(标注的 critical 集合,通常 5-10 条)
 * 2. 剩余配额按章节比例分配(章节越大抽越多,但每章至少 1 条)
 * 3. 总抽样数仍约 total,但分布按 1+2 决定
 *
 * 防"统计骗术":LLM 集中改写某章导致该章 fact 全丢但其他章 fact 多保留 → per_section_rates 计算时该章为 0
 */
export function stratifiedSample(input: SamplingInput): SamplingOutput {
  const total = input.total ?? DEFAULT_SAMPLE_TOTAL;

  // 1. critical 全量必抽
  const critical = input.allFacts.filter((f) => f.critical);
  const nonCritical = input.allFacts.filter((f) => !f.critical);

  // 2. 剩余配额给非 critical
  const remaining = Math.max(0, total - critical.length);
  if (remaining === 0) {
    return {
      sampled: critical,
      perSectionSampled: countSections(critical),
      uncoveredSections: [],
    };
  }

  // 按 section 分组
  const bySection = new Map<string, KeyFact[]>();
  for (const f of nonCritical) {
    const arr = bySection.get(f.section) ?? [];
    arr.push(f);
    bySection.set(f.section, arr);
  }

  // 每章至少 1 条;剩余按比例(向下取整);最后多余配额从最大章补
  const totalNonCriticalCount = nonCritical.length;
  const sampled: KeyFact[] = [...critical];
  const perSectionSampled: Record<string, number> = countSections(critical);

  if (totalNonCriticalCount === 0) {
    return { sampled, perSectionSampled, uncoveredSections: [] };
  }

  // 各章 quota 计算
  const sectionEntries = Array.from(bySection.entries()); // [name, facts][]
  const quotas = new Map<string, number>();
  // I-1 修:章节数 > remaining 时,Math.max(1) 强制最少 1 会让 sampled 超 total
  // canEnforceMinOne=true(章节数 ≤ remaining):每章至少 1 不超 total
  // canEnforceMinOne=false(章节数 > remaining):放弃"每章至少 1"承诺,按比例分(可能 0)
  //   后续 I-1 修复 trade-off:大文档章节多但 total 小,会有章节 quota=0 落入 uncoveredSections
  const canEnforceMinOne = bySection.size <= remaining;
  for (const [name, facts] of sectionEntries) {
    const proportionalQuota = Math.floor((facts.length / totalNonCriticalCount) * remaining);
    quotas.set(name, canEnforceMinOne ? Math.max(1, proportionalQuota) : proportionalQuota);
  }
  // 总 quota 校正(向下取整后总和可能 < remaining,从最大章补;最多补到 remaining)
  // I-2 修:简化为单循环 break,删除 dead modulo 条件(永真,误导)
  let totalQuota = Array.from(quotas.values()).reduce((a, b) => a + b, 0);
  if (totalQuota < remaining) {
    // 按 facts 数从大到小补;每章最多补到 facts.length(不超章节本身能给的 fact 数)
    const sortedByCount = sectionEntries.slice().sort((a, b) => b[1].length - a[1].length);
    // 多轮补:每轮按章节大小给每章最多 +1,直到 totalQuota >= remaining 或所有章节已饱和
    let progressed = true;
    while (totalQuota < remaining && progressed) {
      progressed = false;
      for (const [name, facts] of sortedByCount) {
        if (totalQuota >= remaining) break;
        const cur = quotas.get(name) ?? 0;
        if (cur < facts.length) {
          quotas.set(name, cur + 1);
          totalQuota += 1;
          progressed = true;
        }
      }
    }
  }

  // 各章按 quota 抽样(简单:取前 N 条;实际可随机,但为确定性保留顺序)
  for (const [name, facts] of sectionEntries) {
    const q = Math.min(quotas.get(name) ?? 0, facts.length);
    for (let i = 0; i < q; i += 1) {
      const f = facts[i];
      if (f) {
        sampled.push(f);
        perSectionSampled[name] = (perSectionSampled[name] ?? 0) + 1;
      }
    }
  }

  // uncoveredSections:nonCritical 含但 sampled 没的章节
  const allSections = new Set<string>();
  for (const f of input.allFacts) allSections.add(f.section);
  const sampledSections = new Set(sampled.map((f) => f.section));
  const uncoveredSections = Array.from(allSections).filter((s) => !sampledSections.has(s));

  return { sampled, perSectionSampled, uncoveredSections };
}

function countSections(facts: KeyFact[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of facts) {
    out[f.section] = (out[f.section] ?? 0) + 1;
  }
  return out;
}

/** judge 三态(decision #16) */
export type FactState = 'preserved' | 'paraphrased' | 'lost';

/** judge 单 fact 结果 */
export interface FactJudgeResult {
  fact: KeyFact;
  state: FactState;
  /** judge 给的简短理由 */
  reasoning?: string;
}

const JUDGE_MODEL = 'claude-sonnet-4-6';

/** judge 客户端的最小接口(便于测试 mock) */
export interface JudgeClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

/**
 * 用模型 B 验证一条 fact 是否在复写产物里被保留 / 释义 / 丢失。
 * 输出格式约定:第 1 行三态之一,第 2 行起 reasoning。
 */
export async function judgeSingleFact(
  client: JudgeClient,
  regeneratedBody: string,
  fact: KeyFact,
): Promise<FactJudgeResult> {
  const prompt = `你是一名复写质量评估员。请判断下面这条"原文事实"是否在"复写产物"里被保留。

# 三态定义
- preserved:复写产物含字面量或数值完全一致
- paraphrased:复写产物含同义改写但语义完全等价(含全部数值与约束)
- lost:复写产物完全没提到 / 漏掉数值 / 漏掉约束

# 原文事实(出自章节 ${fact.section}, ${fact.critical ? 'critical' : 'non-critical'})
${fact.text}

# 复写产物(只搜本段范围)
${regeneratedBody}

# 输出格式(必须严格)
第 1 行:preserved | paraphrased | lost(三选一,小写,不带其他字符)
第 2 行起:简短理由(1-2 句)`;

  // P7-07 修复:LLM 调用前数据传输声明(judge 每条 fact 都打一次,可视化进度)
  console.log(
    `→ sending ${Buffer.byteLength(prompt, 'utf8')} bytes to Anthropic API (provider=anthropic, region: auto, model=${JUDGE_MODEL}, op=judge fact §${fact.section})`,
  );
  const result = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = extractText(result);
  return parseFactJudgeResponse(text, fact);
}

/** P7-02 修复:LLM 从原文自动抽取 N 条 key fact(spec §3.1 line 337"模型 B 抽 30 条事实")
 *  用于 regenerate CLI 命令路径(无 scenario YAML 标注时);scenario 上下文请用 stratifiedSample 路径。
 */
export async function extractFactsFromOriginal(
  client: JudgeClient,
  originalText: string,
  n: number = DEFAULT_SAMPLE_TOTAL,
): Promise<KeyFact[]> {
  const prompt = `从下面"原文"中抽出 ${n} 条关键事实(数字 / 字段约束 / 业务规则 / 合规条款 / 设计决策)。
每条 fact 应是单句、可验证的陈述。输出严格 JSON 数组,每项含 { text, section, critical }。
- text:简短陈述(<= 80 字)
- section:原文中所属章节锚(如 "§4.5";若无章节,填 "(unstructured)")
- critical:布尔,合规 / 安全 / 业务硬约束 = true,其余 = false

# 原文
${originalText}

仅输出 JSON 数组,不输出 preamble、不带 markdown code fence。`;
  console.log(
    `→ sending ${Buffer.byteLength(prompt, 'utf8')} bytes to Anthropic API (provider=anthropic, region: auto, model=${JUDGE_MODEL}, op=extract-facts)`,
  );
  const result = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = extractText(result);
  // I-3 修:LLM 偶尔违反 prompt 输出 ```json ... ``` fence;先剥再 parse
  // 失败时 console.warn 原始 text 头 200 字,方便用户诊断 LLM 输出问题
  const cleanText = text
    .trim()
    .replace(/^```(?:json|JSON)?\r?\n/, '')
    .replace(/\r?\n```\s*$/, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanText);
  } catch {
    console.warn(
      `[quality-judge] LLM extractFacts 输出非合法 JSON;返回空 facts(quality-judge 此 role 跳过)。原文(head 200):\n${text.slice(0, 200)}`,
    );
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      const o = item as Partial<KeyFact>;
      return {
        text: typeof o.text === 'string' ? o.text : '',
        section: typeof o.section === 'string' ? o.section : '(unstructured)',
        critical: typeof o.critical === 'boolean' ? o.critical : false,
      };
    })
    .filter((f) => f.text.trim().length > 0)
    .slice(0, n);
}

/** 解析 judge 响应:第 1 行三态,后续 reasoning */
export function parseFactJudgeResponse(text: string, fact: KeyFact): FactJudgeResult {
  const lines = text.trim().split(/\r?\n/);
  const firstLine = (lines[0] ?? '').trim().toLowerCase();
  let state: FactState;
  if (firstLine === 'preserved' || firstLine === 'paraphrased' || firstLine === 'lost') {
    state = firstLine;
  } else {
    // 解析失败 → 视为 lost(保守起见,触发用户审 — 决策 #16 不 retry,直接报告)
    state = 'lost';
  }
  const reasoning = lines.slice(1).join('\n').trim() || undefined;
  return { fact, state, reasoning };
}

/** 跑全部 sampled facts 的判定 + 计算 QualityResult。
 *  注:Promise.all 不 wrap try/catch — 单条 judgeSingleFact API 失败(网络 / 429)时整个 reject;
 *  caller(CLI 层)需自行 wrap try/catch 并归类到 .partial 路径。
 */
export async function judgeAllFacts(
  client: JudgeClient,
  regeneratedBody: string,
  sampling: SamplingOutput,
  threshold: number = DEFAULT_FIDELITY_THRESHOLD,
): Promise<QualityResult> {
  // TODO(v0.3):Anthropic API rate-limit 防护 — 30 条 fact 全并发可能触发 429
  // (Tier-1 RPM ~50)。CLI 层加 --concurrency flag,p-limit 包裹。
  // 当前 v0.2 acceptable:30 并发在 1 秒内瞬时,实际多数路径分散在 judge 时间内。
  const judged = await Promise.all(
    sampling.sampled.map((f) => judgeSingleFact(client, regeneratedBody, f)),
  );

  const critical = judged.filter((r) => r.fact.critical);
  const nonCritical = judged.filter((r) => !r.fact.critical);

  const critPreserved = critical.filter((r) => r.state !== 'lost');
  const totalPreserved = judged.filter((r) => r.state !== 'lost');

  // critical 必须 100%
  const criticalRate = critical.length === 0 ? 1.0 : critPreserved.length / critical.length;
  // 总体保真率
  const totalRate = judged.length === 0 ? 1.0 : totalPreserved.length / judged.length;

  // per_section_rates
  const perSectionRates: Record<string, number> = {};
  for (const [section, totalInSection] of Object.entries(sampling.perSectionSampled)) {
    const sectionJudged = judged.filter((r) => r.fact.section === section);
    const preserved = sectionJudged.filter((r) => r.state !== 'lost');
    perSectionRates[section] = totalInSection === 0 ? 1.0 : preserved.length / totalInSection;
  }

  const lostCritical = critical.filter((r) => r.state === 'lost').map((r) => r.fact);
  const lostNonCritical = nonCritical.filter((r) => r.state === 'lost').map((r) => r.fact);

  const passed = criticalRate >= 1.0 && totalRate >= threshold;

  return {
    total_rate: totalRate,
    critical_rate: criticalRate,
    per_section_rates: perSectionRates,
    lost_critical: lostCritical,
    lost_non_critical: lostNonCritical,
    uncovered_sections: sampling.uncoveredSections,
    passed,
  };
}

/** 把 QualityResult 渲染为给用户看的报告 */
export function formatQualityReport(role: LegacyAnchorRole, result: QualityResult): string {
  const lines: string[] = [];
  lines.push(`# 复写质量报告(role=${role})`);
  lines.push('');
  lines.push(`- 总体保真率:${(result.total_rate * 100).toFixed(1)}%`);
  lines.push(`- critical 子集保真率:${(result.critical_rate * 100).toFixed(1)}% (须 100%)`);
  lines.push(
    `- 抽样未覆盖的章节:${result.uncovered_sections.length === 0 ? '(无)' : result.uncovered_sections.join(', ')}`,
  );
  lines.push('');

  if (result.lost_critical.length > 0) {
    lines.push('## ✗ 丢失的 critical fact(致命,必须用户介入)');
    for (const f of result.lost_critical) {
      lines.push(`- (${f.section}) ${f.text}`);
    }
    lines.push('');
  }

  if (result.lost_non_critical.length > 0) {
    lines.push('## ⚠ 丢失的 non-critical fact');
    for (const f of result.lost_non_critical) {
      lines.push(`- (${f.section}) ${f.text}`);
    }
    lines.push('');
  }

  lines.push('## 各章节保真率');
  for (const [section, rate] of Object.entries(result.per_section_rates)) {
    lines.push(`- ${section}:${(rate * 100).toFixed(1)}%`);
  }

  if (!result.passed) {
    lines.push('');
    lines.push('## 失败处理(决策 #16,无 retry)');
    lines.push('- 接受 .partial 产物 + 手动补丢失 fact');
    lines.push('- 重写 prompt 后重跑 forge legacy-bridge regenerate --role <r>');
  }

  return lines.join('\n');
}

function extractText(result: Anthropic.Messages.Message): string {
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return block?.text ?? '';
}
