// src/core/migrate/budget.ts
// migrate 专属 cost 估算 — Plan 8e Task 5.2
// Spec §2.8 步骤 2 + §5.2 budget.ts(按件长度 + token,不用 brownfield 4-role 估算法)

import type { MissingArtifact } from './types.js';

// $5 USD 警告阈值(spec §1.4 独立常量;不与 brownfield BUDGET_WARN 混)
export const MIGRATE_WARN_USD = 5;

// 估算公式参数(spec §2.8 步骤 2)
const APPROX_INPUT_TOKEN_PER_BYTE = 0.5; // ~2 char/token
const APPROX_OUTPUT_TOKEN_FACTOR = 1.5; // output 是 input 的 150%(migration 生成量较多)
const SONNET_INPUT_PER_MTOK = 3; // $3 / Mtok
const SONNET_OUTPUT_PER_MTOK = 15; // $15 / Mtok
const FACTS_OVERHEAD_TOKENS = 5000; // extractFacts + judgeAll 的额外 token

// MissingArtifact + 源长度(给 budget 估)
export type MissingArtifactWithLength = MissingArtifact & { sourceLength: number };

// 估算 migrate --regenerate 的 LLM 调用成本(USD)
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
  // 2 位小数(避免浮点尾巴)
  return Math.round(totalCost * 100) / 100;
}
