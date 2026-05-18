// 复写器:读 anchors → 多版本合并 → LLM → 加 frontmatter / disclaimer / license → 输出
// Plan 7 Phase B2 / spec §3.1 + 决策 #14-#21 / §4.3 不变量

import Anthropic from '@anthropic-ai/sdk';
import matter from 'gray-matter';
import type {
  KeyFact,
  LegacyAnchor,
  LegacyAnchorRole,
  LegacyAnchorsFile,
  QualityResult,
} from './types.js';
import { redact, type RedactReport } from './redact.js';
import { readAnchorAsText } from './encoding.js';
import type { LlmTask, LlmTaskInput } from './llm-task.js';
import {
  stratifiedSample,
  computeQualityResult,
  type SamplingOutput,
  type FactState,
  type FactJudgeResult,
} from './quality-judge.js';

/** 复写参数 */
export interface RegenerateInput {
  role: LegacyAnchorRole;
  /** 当前版 anchor(authoritative=true) */
  authoritative: LegacyAnchor;
  /** 历史版 anchor(可选;--include-historical 时 LLM 当背景输入) */
  historical?: LegacyAnchor[];
  /** 全局 redact 规则(用户 yaml 顶层) */
  globalRedactRules?: LegacyAnchorsFile['redact'];
  /** forge 版本号(写入 frontmatter) */
  forgeVersion: string;
  /** 用户 config 的 regen_license(默认 derived-from-source) */
  regenLicense: string;
}

/** 复写产物 */
export interface RegenerateOutput {
  role: LegacyAnchorRole;
  /** 完整 markdown(含 frontmatter + disclaimer + LLM 复写内容) */
  fullMarkdown: string;
  /** 用于 quality-judge 验证的复写正文(不含 frontmatter / disclaimer) */
  body: string;
  /** redact 命中数(用于 --redact-report) */
  redactReport: RedactReport;
  /** 估算 token / cost */
  tokensUsed: number;
  estimatedCost: number;
}

/** LLM client 的最小接口(便于测试 mock) */
export interface RegenerateClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const PRICE_PER_M_INPUT = 3.0;
const PRICE_PER_M_OUTPUT = 15.0;

/** role → 人类可读全名(LLM prompt 用) */
const ROLE_HUMAN_NAME: Record<LegacyAnchorRole, string> = {
  requirements: 'Software Requirements Specification (SRS)',
  'high-level-design': 'High-Level Design (HLD)',
  'low-level-design': 'Low-Level Design (LLD)',
  'system-tests': 'System Test Cases',
  'acceptance-report': 'Acceptance Report',
  rationale: 'Design Rationale',
  glossary: 'Glossary',
};

/** role → 文件名映射(决策 #14:每 role 一份大文件) */
export const REGEN_FILENAMES: Record<LegacyAnchorRole, string> = {
  requirements: 'SRS.md',
  'high-level-design': 'HLD.md',
  'low-level-design': 'LLD.md',
  'system-tests': 'system-tests.md',
  // P7-03 修复:acceptance-report 走 metadata-only(spec §7 line 909 / I-8),不进 regenerator
  // 此项保留 key 但 regenerateRole 检测到会抛 RegenOutputError
  'acceptance-report': '__metadata-only__',
  rationale: 'rationale.md',
  glossary: 'glossary.md',
};

/** P7-03 修复:metadata-only 角色集合(不发 LLM,不复写) */
export const METADATA_ONLY_ROLES: ReadonlyArray<LegacyAnchorRole> = ['acceptance-report'];

/** 拼 LLM prompt(决策 #14:复写规范化版本) */
function buildRegeneratePrompt(
  input: RegenerateInput,
  anchorText: string,
  historicalText?: string,
): string {
  const role = input.role;

  let prompt = `你是一名技术文档规范化助手。请把下列老文档内容**忠实复写**为规范化的 ${ROLE_HUMAN_NAME[role]}。

# 复写要求(strict)
1. **不丢失任何事实** — 包括数字、字段约束、合规条款、设计决策
2. **保留章节结构** — 用 \`##\` / \`###\` 层级
3. **不添加未声明的功能** — 老文档没说的不补
4. **保留原文中所有 <<REDACTED-N>> 占位** — 这些是敏感数据 mask,不要尝试还原或替换
5. **输出纯 markdown** — 不输出 frontmatter(我会另加),不输出代码 block 包裹整段
6. **保留中文 / 中英文混排** — 不强行翻译

# 老文档内容(权威源)
${anchorText}
`;

  if (historicalText) {
    prompt += `\n# 历史版本(背景信息;不直接复写,仅用于理解演进)\n${historicalText}\n`;
  }

  prompt += `\n# 输出格式
直接输出复写后的 markdown,从一级标题或章节标题开始。不要任何 preamble。`;

  return prompt;
}

/** 单 role 复写(用于测试便于 mock) */
export async function regenerateRole(
  input: RegenerateInput,
  client: RegenerateClient,
  modelOverride?: string,
): Promise<RegenerateOutput> {
  // P7-03 修复:acceptance-report 等 metadata-only role 不进 regenerator
  // (spec §7 line 909 / 决策 #8 / Codex I-8 部分接受)
  if (METADATA_ONLY_ROLES.includes(input.role)) {
    throw new RegenOutputError(
      `role=${input.role} 是 metadata-only(spec §7 line 909);只在 forge/docs/index.md 索引 metadata,不复写。请在 anchors.yaml 改用其他 role 或跳过此 anchor。`,
      input.role,
    );
  }
  const authText = await readAnchorAsText(input.authoritative);
  const historicalTexts = await Promise.all((input.historical ?? []).map(readAnchorAsText));
  const historicalCombined =
    historicalTexts.length > 0
      ? historicalTexts
          .map((t, i) => `## 历史版 ${i + 1} (${input.historical![i]?.path})\n${t}`)
          .join('\n\n')
      : undefined;

  // redact 在发 LLM 前 mask(决策 #20)
  const redactRules = [...(input.globalRedactRules ?? []), ...(input.authoritative.redact ?? [])];
  // 分别 redact auth 和 historical;两段在不同 region 各自命中 + 各自占位编号(LLM 视占位为 sentinel,
  // 不解读编号语义,所以两段编号独立不影响复写;reviewer 关切的是 redactReport audit
  // 准确性 — 这里通过累加两段 hitsByRule 拿到真发 LLM 的总命中数)
  const authReport = redact(authText, redactRules);
  const maskedAuth = authReport.redactedText;
  let totalHits = authReport.hitsByRule;
  let totalReplacements = authReport.totalReplacements;
  let maskedHistorical: string | undefined;
  if (historicalCombined) {
    const histReport = redact(historicalCombined, redactRules);
    maskedHistorical = histReport.redactedText;
    totalReplacements += histReport.totalReplacements;
    // 累加 hitsByRule 字典(每条规则的命中数)
    totalHits = mergeHits(totalHits, histReport.hitsByRule);
  }
  const redactReport: RedactReport = {
    ...authReport,
    redactedText: maskedAuth + (maskedHistorical ? '\n\n' + maskedHistorical : ''),
    totalReplacements,
    hitsByRule: totalHits,
  };

  const prompt = buildRegeneratePrompt(input, maskedAuth, maskedHistorical);

  // P7-07 修复:每次 LLM 调用前显示数据传输声明(spec §1.1.1 line 40)
  const model = modelOverride ?? DEFAULT_MODEL;
  const promptBytes = Buffer.byteLength(prompt, 'utf8');
  console.log(
    `→ sending ${promptBytes} bytes to Anthropic API (provider=anthropic, region: auto, model=${model})`,
  );

  const result = await client.messages.create({
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  const body = extractText(result);
  validateRegenOutput(body, input.role);

  const inputTokens = result.usage?.input_tokens ?? 0;
  const outputTokens = result.usage?.output_tokens ?? 0;
  const cost =
    (inputTokens / 1_000_000) * PRICE_PER_M_INPUT + (outputTokens / 1_000_000) * PRICE_PER_M_OUTPUT;

  // 加 frontmatter + disclaimer(决策 #21 / §9)
  const fullMarkdown = wrapWithFrontmatterAndDisclaimer(body, input);

  return {
    role: input.role,
    fullMarkdown,
    body,
    redactReport,
    tokensUsed: inputTokens + outputTokens,
    estimatedCost: cost,
  };
}

/** output validator:复写产物必须是合法 markdown,无 frontmatter(LLM 不该输出),正文非空 */
export function validateRegenOutput(body: string, role: LegacyAnchorRole): void {
  // 不变量 §4.3:复写产物 markdown 格式合法
  if (!body || body.trim().length < 50) {
    throw new RegenOutputError(`复写产物为空或过短(role=${role}),LLM 可能未正确响应`, role);
  }
  // LLM 不该输出 frontmatter(我们另加);只在真模式 `---\n<key>:<val>\n...\n---` 时拒绝
  // gray-matter 对 `---\n\n# 标题` 这类合法 markdown(thematic break + 空行 + 标题)误判为 frontmatter
  // (data 会被解析成数字键 record),所以先用正则锚定真 frontmatter 才走 gray-matter
  const FRONTMATTER_RE = /^---\r?\n([\s\S]+?)\r?\n---(?:\r?\n|$)/;
  const fmMatch = body.match(FRONTMATTER_RE);
  if (fmMatch) {
    // 含真 frontmatter delimiters;再用 gray-matter parse 看是否含 key:value
    const parsed = matter(body);
    if (Object.keys(parsed.data).length > 0) {
      throw new RegenOutputError(
        `LLM 输出含 frontmatter 字段(${Object.keys(parsed.data).join(',')}),应只输出正文`,
        role,
      );
    }
  }
  // 简易 ` ``` ` 计数(只检 3-backtick fence;4+backtick fence 极少见,LLM 实际不会输出,边界忽略)
  const fenceCount = (body.match(/^```/gm) ?? []).length;
  if (fenceCount % 2 !== 0) {
    throw new RegenOutputError(
      `复写产物 code block 不闭合(\`\`\` 计数 ${fenceCount} 非偶数)`,
      role,
    );
  }
}

/** 自定义异常:LLM 输出不合规(转 exit 2 + 写 .invalid 文件) */
export class RegenOutputError extends Error {
  constructor(
    message: string,
    public readonly role: LegacyAnchorRole,
  ) {
    super(`[role=${role}] ${message}`);
    this.name = 'RegenOutputError';
  }
}

/**
 * 加 frontmatter + 顶部 disclaimer(决策 #21 / §9)。
 * Task 6.2 round-2:export 供双路径 CLI(--api / --apply 成功路径)复用,
 * 与 regenerateRole 单进程路径产物保持一致(同一 frontmatter/disclaimer)。
 */
export function wrapWithFrontmatterAndDisclaimer(body: string, input: RegenerateInput): string {
  const generatedAt = new Date().toISOString();
  // 用 JSON.stringify 包裹路径,确保含特殊 yaml 字符(`: ` / `#` / `\n` 等)的路径不破 yaml 结构
  // (JSON 字符串字面量是 yaml 双引号字符串的合法子集)
  const quoteYamlPath = (p: string): string => JSON.stringify(p);
  const sourcesYaml = input.authoritative.path
    ? `\nsources:\n  - ${quoteYamlPath(input.authoritative.path)}` +
      (input.historical?.map((a) => `\n  - ${quoteYamlPath(a.path)}`).join('') ?? '')
    : '';

  const frontmatter = `---
generated-by: forge-legacy-bridge
generated-at: ${generatedAt}${sourcesYaml}
license: ${input.regenLicense}
forge-version: ${input.forgeVersion}
---

> **⚠ 此文档由 forge 自动生成**
> 这是 LLM 复写的规范化版本,**不是项目权威交付物**。
> 权威源:\`${input.authoritative.path}\`(用户原版老文档)
> 客户验收 / 审计 / 法律证据请引用权威源,不要引用本文件
>
> 许可:\`${input.regenLicense}\` — 实际许可由 anchor 源决定,
> 在 \`forge/config.yaml#legacy_bridge.regen_license\` 显式声明前不假定任何 OSS 许可

`;

  return frontmatter + body;
}

/** 从 LLM 响应中提取文本块内容 */
function extractText(result: Anthropic.Messages.Message): string {
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return block?.text ?? '';
}

/** 合并两段 hitsByRule 字典(累加每条规则的命中数) */
function mergeHits(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const merged: Record<string, number> = { ...a };
  for (const [name, count] of Object.entries(b)) {
    merged[name] = (merged[name] ?? 0) + count;
  }
  return merged;
}

/** 轮1 校验后处理:解析 facts(KeyFact)→ 确定性分层抽样 → 产轮2 quality-judge LlmTask + SamplingOutput */
export function applyRound1AndBuildRound2(
  regenBody: string,
  extractFactsText: string,
  role: LegacyAnchorRole,
): { task: LlmTask; sampling: SamplingOutput } {
  // 复用既有 markdown 合法性校验
  validateRegenOutput(regenBody, role);
  let facts: KeyFact[] = [];
  try {
    // LLM 偶尔违反 prompt 输出 ```json ... ``` fence;先剥再 parse(对齐 quality-judge.ts I-3 修)
    const cleanText = extractFactsText
      .trim()
      .replace(/^```(?:json|JSON)?\r?\n/, '')
      .replace(/\r?\n```\s*$/, '')
      .trim();
    const parsed = JSON.parse(cleanText);
    if (Array.isArray(parsed)) {
      facts = (parsed as Array<Partial<KeyFact>>)
        .map((o) => ({
          text: typeof o.text === 'string' ? o.text : '',
          section: typeof o.section === 'string' ? o.section : '(unstructured)',
          critical: typeof o.critical === 'boolean' ? o.critical : false,
        }))
        .filter((f) => f.text.trim().length > 0);
    }
  } catch {
    // JSON.parse 失败 → facts 保持空数组,后续统一走 facts.length === 0 错误路径
    facts = [];
  }
  // extract-facts 失败 / 空 → 无法验证保真率;不静默走「空抽样=passed」,显式抛错(下游写 .partial)
  if (facts.length === 0) {
    throw new RegenOutputError(
      'extract-facts 未抽出任何 fact(LLM 输出非法或为空);无法验证保真率',
      role,
    );
  }
  // 确定性分层抽样,留 CLI 侧
  const sampling = stratifiedSample({ allFacts: facts });
  // 将抽样 fact 编号排列,供 LLM 三态判定
  const numbered = sampling.sampled
    .map((f, i) => `${i + 1}. [${f.section}${f.critical ? ',critical' : ''}] ${f.text}`)
    .join('\n');
  const prompt =
    `下面是一份「复写产物」和一组「原文 fact」。对每个 fact 三态判定它是否在复写产物里被保留:\n` +
    `- preserved:字面/数值完全一致\n` +
    `- paraphrased:同义改写但语义+数值+约束完全等价\n` +
    `- lost:漏掉 / 数值错 / 约束丢\n\n` +
    `严格输出 JSON 数组,**顺序与 fact 编号一一对应**,每项 { "state": "preserved"|"paraphrased"|"lost" }。不加 preamble。\n\n` +
    `# 复写产物\n${regenBody}\n\n# 待判 fact\n${numbered}`;
  const inputs: LlmTaskInput[] = [{ source: 'regen-body', content: regenBody }];
  return {
    task: {
      op: 'quality-judge',
      inputs,
      prompt,
      model: DEFAULT_MODEL,
      outputSchema: '[{ "state": "preserved"|"paraphrased"|"lost" }](顺序对应 fact 编号)',
      outputPath: '.cache/legacy-bridge-result-quality-judge.json',
    },
    sampling,
  };
}

/** 轮1:产 regenerate + extract-facts 两个 LlmTask */
export async function buildRegenerateRound1Tasks(
  input: RegenerateInput,
  // 默认用 readAnchorAsText;测试可注入 mock
  readText: (anchor: LegacyAnchor) => Promise<string> = readAnchorAsText,
): Promise<LlmTask[]> {
  // metadata-only role 不发 LLM(spec §7 line 909 / P7-03 修复)
  if (METADATA_ONLY_ROLES.includes(input.role)) {
    throw new RegenOutputError(
      `role=${input.role} 是 metadata-only(spec §7 line 909);不复写。`,
      input.role,
    );
  }

  // 合并全局 redact 规则和 anchor 级别规则,然后对权威源文本 mask
  const redactRules = [...(input.globalRedactRules ?? []), ...(input.authoritative.redact ?? [])];
  const maskedAuth = redact(await readText(input.authoritative), redactRules).redactedText;

  // 复写 prompt(复用既有 buildRegeneratePrompt)
  const regeneratePrompt = buildRegeneratePrompt(input, maskedAuth);

  // 关键事实抽取 prompt:从老文档提取结构化 JSON 事实列表
  const extractFactsPrompt = `从下列老文档抽取关键事实(数字 / 字段约束 / 业务规则 / 合规条款 / 设计决策)。\n严格输出 JSON 数组,每项含 { "text": string(<=80 字单句), "section": string(章节锚如 "§4.5",无则 "(unstructured)"), "critical": boolean(合规/安全/业务硬约束=true) }。不加 preamble、不带 code fence。\n\n# 老文档\n${maskedAuth}`;

  // 两个 task 共用的公共字段
  const common = {
    model: DEFAULT_MODEL,
    inputs: [{ source: input.authoritative.path, content: maskedAuth }],
  };

  return [
    {
      ...common,
      op: 'regenerate' as const,
      prompt: regeneratePrompt,
      outputSchema: 'markdown 正文',
      outputPath: `.cache/legacy-bridge-result-regenerate.json`,
    },
    {
      ...common,
      op: 'extract-facts' as const,
      prompt: extractFactsPrompt,
      outputSchema: '[{ "text": string, "section": string, "critical": boolean }]',
      outputPath: `.cache/legacy-bridge-result-extract-facts.json`,
    },
  ];
}

/** 轮2 后处理:agent 三态 judge 结果(JSON 字符串) + 轮1 抽样 → QualityResult。
 *  critical 必须 100% 的 gate 在 computeQualityResult 内,不因走 agent 路径软化。
 *  agent 漏判的 fact(数组越界)保守视为 lost。
 */
export function applyRound2(
  judgeText: string,
  sampling: SamplingOutput,
  threshold: number,
): QualityResult {
  // 解析 agent 输出的三态 JSON 数组;解析失败 → 所有 fact 保守视为 lost
  let states: FactState[] = [];
  try {
    const parsed = JSON.parse(judgeText.trim());
    if (Array.isArray(parsed)) {
      states = (parsed as Array<{ state?: string }>).map((o) =>
        o.state === 'preserved' || o.state === 'paraphrased' || o.state === 'lost'
          ? o.state
          : 'lost',
      );
    } else {
      // 合法 JSON 但非数组 → 无法逐 fact 对应,所有 fact 保守视为 lost(fail-closed)
      console.warn(
        `[applyRound2] agent judge 输出非 JSON 数组(type=${typeof parsed});所有 fact 保守视为 lost`,
      );
    }
  } catch {
    // JSON 解析失败 → states 保持空数组,下面逐条 fallback 为 lost(fail-closed)
    console.warn(
      `[applyRound2] agent judge 输出非合法 JSON;所有 fact 保守视为 lost。原文(head 200):\n${judgeText.slice(0, 200)}`,
    );
    states = [];
  }
  // 按编号与轮1 抽样 fact 一一对应;agent 漏判的 fact 保守视为 lost
  const judged: FactJudgeResult[] = sampling.sampled.map((fact, i) => ({
    fact,
    state: states[i] ?? 'lost',
  }));
  // 复用纯函数算分 gate,行为与 LLM 路径完全一致
  return computeQualityResult(judged, sampling, threshold);
}
