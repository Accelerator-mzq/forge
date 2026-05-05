// scenario runner — Plan 5 spec §5.5.5
// runScenario(scenario, withSkill, deps) → ScenarioRunResult
// multi-turn 循环累积 messages;RED/GREEN 由 withSkill 切 system prompt

import Anthropic from '@anthropic-ai/sdk';
import { checkPatterns, judgeWithLlm } from './judge.js';
import { loadSkillBootstrap, type SkillName } from './load-skill.js';
import type { Scenario, ScenarioRunResult, TurnResult } from './types.js';

/** 评测用模型默认值;scenario.model 可覆盖 */
const DEFAULT_MODEL = 'claude-sonnet-4-6';

/** Sonnet 4.6 估算单价(USD/百万 token):input $3 / output $15(2026 价格,后续校准) */
const PRICE_PER_M_INPUT = 3.0;
const PRICE_PER_M_OUTPUT = 15.0;

/** 跑 1 个 scenario 的 1 个方向(RED 或 GREEN) */
export async function runScenario(
  scenario: Scenario,
  withSkill: boolean,
  client: Anthropic,
): Promise<ScenarioRunResult> {
  const messages: Anthropic.Messages.MessageParam[] = [];
  // GREEN 模式加载 skill bootstrap 作为 system prompt
  const systemContent = withSkill ? await loadSkillBootstrap(scenario.skill as SkillName) : '';
  const turnResults: TurnResult[] = [];
  let totalTokens = 0;
  let totalCost = 0;

  for (const [idx, turn] of scenario.turns.entries()) {
    // 把用户消息加入对话历史
    messages.push({ role: 'user', content: turn.user });

    // 调主模型(被评测对象)
    const response = await client.messages.create({
      model: scenario.model ?? DEFAULT_MODEL,
      max_tokens: 4096,
      system: systemContent || undefined,
      messages,
    });

    const assistantText = extractText(response);
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const turnTokens = inputTokens + outputTokens;
    totalTokens += turnTokens;
    totalCost += estimateCost(inputTokens, outputTokens);

    // 把 assistant 响应塞回 messages,供下一 turn 用(multi-turn 累积)
    messages.push({ role: 'assistant', content: assistantText });

    // 双轨 grading:模式匹配 + LLM-as-judge
    const patternResult = checkPatterns(assistantText, turn.assertions);
    const judgeResult = await judgeWithLlm(client, assistantText, turn.judge_rubric);
    // judge 也调 API,粗估 judge prompt + response 总 tokens
    totalTokens += 200;
    totalCost += estimateCost(200, 100);

    // spec §5.5.3:模式匹配 pass + judge >= 6 才算 turn pass
    const turnPass = patternResult.pass && judgeResult.score >= 6;
    turnResults.push({
      turnId: turn.id ?? `turn-${idx}`,
      userMessage: turn.user,
      assistantResponse: assistantText,
      patternResult,
      judgeResult,
      turnPass,
      tokensUsed: turnTokens,
    });
  }

  // 全部 turn 都通过才视为 scenario pass
  const scenarioPass = turnResults.every((t) => t.turnPass);
  return {
    scenarioId: scenario.id,
    skill: scenario.skill,
    withSkill,
    turnResults,
    scenarioPass,
    totalTokens,
    estimatedCost: totalCost,
  };
}

/** 从 Anthropic SDK 响应中抽 text 部分 */
function extractText(result: Anthropic.Messages.Message): string {
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return block?.text ?? '';
}

/** 估算 API 调用 cost(USD) */
function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICE_PER_M_INPUT +
    (outputTokens / 1_000_000) * PRICE_PER_M_OUTPUT
  );
}
