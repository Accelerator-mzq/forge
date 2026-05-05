// LLM-as-judge + 模式匹配双轨 — Plan 5 spec §5.5.3
// Task B1 只实现 checkPatterns;judgeWithLlm 在 Task B2 加

import type { Assertions, PatternResult } from './types.js';

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
