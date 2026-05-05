// LLM-as-judge + 模式匹配双轨 — Plan 5 spec §5.5.3
// Task B1 实现 checkPatterns;Task B2 加 judgeWithLlm

import Anthropic from '@anthropic-ai/sdk';
import type { Assertions, JudgeResult, PatternResult } from './types.js';

/**
 * 跑模式匹配:must_match 全部命中 + must_not_match 全部不命中 → pass
 * assertions 缺失或两个数组都空 → skipped=true,视为 pass(spec §5.5.3 合约)
 */
export function checkPatterns(response: string, assertions?: Assertions): PatternResult {
  const failures: string[] = [];

  // 检查是否有实质性的 assertions
  const hasMustMatch = (assertions?.must_match?.length ?? 0) > 0;
  const hasMustNotMatch = (assertions?.must_not_match?.length ?? 0) > 0;
  if (!assertions || (!hasMustMatch && !hasMustNotMatch)) {
    return { pass: true, skipped: true, failures };
  }

  // 验证 must_match:每个 regex 都必须命中
  for (const item of assertions.must_match ?? []) {
    const re = new RegExp(item.regex);
    if (!re.test(response)) {
      failures.push(`must_match 未命中: /${item.regex}/`);
    }
  }

  // 验证 must_not_match:每个 regex 都不能命中
  for (const item of assertions.must_not_match ?? []) {
    const re = new RegExp(item.regex);
    if (re.test(response)) {
      failures.push(`must_not_match 命中: /${item.regex}/`);
    }
  }

  return { pass: failures.length === 0, skipped: false, failures };
}

// ─── LLM-as-judge 段(Task B2) ────────────────────────────────────────────────

/** judge 调用使用的模型 */
const JUDGE_MODEL = 'claude-sonnet-4-6';

/**
 * 用 LLM-as-judge 给 response 打分(0-10)。spec §5.5.3 合约:rubric 必需。
 * 返回结构化 JudgeResult。
 *
 * @param client Anthropic SDK 实例(运行时由 runner 注入,测试可注入 mock)
 * @param response 待评分的 AI 响应文本
 * @param rubric judge_rubric 文本(scenario YAML 提供)
 */
export async function judgeWithLlm(
  client: Anthropic,
  response: string,
  rubric: string,
): Promise<JudgeResult> {
  const judgePrompt = `你是一名 skill eval 评判员。请按以下评分标准给 AI 响应打 0-10 分。

# 评分标准(rubric)
${rubric}

# AI 响应
${response}

# 输出格式(必须严格遵守)
第一行:仅一个 0-10 之间的整数(不带其他字符)
第二行起:简短理由(1-3 句)`;

  const result = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: judgePrompt }],
  });

  const text = extractText(result);
  return parseJudgeResponse(text);
}

/** 从 Anthropic SDK 响应中抽 text 部分 */
function extractText(result: Anthropic.Messages.Message): string {
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return block?.text ?? '';
}

/** 解析 judge 响应:第一行整数 0-10,后续是 reasoning */
export function parseJudgeResponse(text: string): JudgeResult {
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/);
  const firstLine = lines[0]?.trim() ?? '';
  const score = Number.parseInt(firstLine, 10);
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    return {
      score: 0,
      reasoning: '解析失败:第一行非 0-10 整数',
      rawResponse: text,
    };
  }
  const reasoning = lines.slice(1).join('\n').trim() || '(无理由)';
  return { score, reasoning };
}
