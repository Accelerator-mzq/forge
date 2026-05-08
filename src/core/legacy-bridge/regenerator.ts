// 复写器:读 anchors → 多版本合并 → LLM → 加 frontmatter / disclaimer / license → 输出
// Plan 7 Phase B2 / spec §3.1 + 决策 #14-#21 / §4.3 不变量

import Anthropic from '@anthropic-ai/sdk';
import matter from 'gray-matter';
import type { LegacyAnchor, LegacyAnchorRole, LegacyAnchorsFile } from './types.js';
import { redact } from './redact.js';
import { readAnchorFile } from './encoding.js';
import { parseWorkbook, getSheet, sheetToMarkdown } from './excel.js';
import { extname } from 'node:path';

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
  redactReport: ReturnType<typeof redact>;
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

/** 把 anchor 文件读为 LLM 输入文本(支持 .md / .txt / .csv / .xlsx) */
async function readAnchorAsText(anchor: LegacyAnchor): Promise<string> {
  const ext = extname(anchor.path).toLowerCase();
  if (ext === '.xlsx') {
    const wb = await parseWorkbook(anchor.path);
    const sheet = getSheet(wb, anchor.sheet, anchor.path);
    // P7-09 修复:决策 §4.1 line 502 — chart/pivot/formula 不支持时拒绝运行,引导导出 csv
    if (sheet.unsupportedFeatures.length > 0) {
      const { ExcelParseError } = await import('./excel.js');
      throw new ExcelParseError(
        `sheet '${sheet.name}' 含不支持特性(${sheet.unsupportedFeatures.join(', ')});请在 Excel 另存为 .csv 后改 anchors.yaml path 指向 .csv(决策 §4.1)`,
        anchor.path,
      );
    }
    return sheetToMarkdown(sheet);
  }
  const r = await readAnchorFile(anchor.path);
  return r.text;
}

/** 拼 LLM prompt(决策 #14:复写规范化版本) */
function buildRegeneratePrompt(
  input: RegenerateInput,
  anchorText: string,
  historicalText?: string,
): string {
  const role = input.role;
  const roleHumanName: Record<LegacyAnchorRole, string> = {
    requirements: 'Software Requirements Specification (SRS)',
    'high-level-design': 'High-Level Design (HLD)',
    'low-level-design': 'Low-Level Design (LLD)',
    'system-tests': 'System Test Cases',
    'acceptance-report': 'Acceptance Report',
    rationale: 'Design Rationale',
    glossary: 'Glossary',
  };

  let prompt = `你是一名技术文档规范化助手。请把下列老文档内容**忠实复写**为规范化的 ${roleHumanName[role]}。

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
  const redactReport = redact(authText + (historicalCombined ?? ''), redactRules);
  const maskedAuth = redact(authText, redactRules).redactedText;
  const maskedHistorical = historicalCombined
    ? redact(historicalCombined, redactRules).redactedText
    : undefined;

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
  // LLM 不该输出 frontmatter(我们另加);若开头 `---\n`,警告但不强 fail(用 gray-matter 试解析判断)
  const parsed = matter(body);
  if (Object.keys(parsed.data).length > 0) {
    throw new RegenOutputError(
      `LLM 输出含 frontmatter 字段(${Object.keys(parsed.data).join(',')}),应只输出正文`,
      role,
    );
  }
  // code block 闭合检查(简易:对 ``` 计数应为偶数)
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

/** 加 frontmatter + 顶部 disclaimer(决策 #21 / §9) */
function wrapWithFrontmatterAndDisclaimer(body: string, input: RegenerateInput): string {
  const generatedAt = new Date().toISOString();
  const sourcesYaml = input.authoritative.path
    ? `\nsources:\n  - ${input.authoritative.path}` +
      (input.historical?.map((a) => `\n  - ${a.path}`).join('') ?? '')
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
