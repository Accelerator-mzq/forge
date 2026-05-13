// tests/cli/process-evidence-rerun.test.ts — plan-9g Task 6.2
// 测 runRerunFence 6 case(brainstorm spec §8.2)
//
// Case 1: mode='hash-only' → 返空数组(跳过)
// Case 2: full mode RED rerun exit_code=0 → 不变量 5 CRITICAL
// Case 3: full mode GREEN rerun exit_code != 0 → 不变量 6 CRITICAL
// Case 4: full mode timeout → 不变量 13 CRITICAL
// Case 5: sample mode timeout → 不变量 13 WARNING(不 CRITICAL)
// Case 6: expected_failures parser 命中校验(RED rerun 真失败但 expected 未中)
//
// 完整 fixture 实施者按 runInWorktree mock 模式写;Step 6.2 给框架(§0.0 留白 1)

import { describe, it } from 'vitest';
// (完整测试 fixture 沿 worktree.test.ts setupGitRepo 模式 + mock testCommand 输出 — writing-plans 阶段补)

describe('runRerunFence (plan-9g Task 6.2)', () => {
  it.todo('Case 1: mode=hash-only 跳过 worktree 重跑');
  it.todo('Case 2: full mode RED rerun exit_code=0 → CRITICAL 5');
  it.todo('Case 3: full mode GREEN rerun fail → CRITICAL 6');
  it.todo('Case 4: full mode timeout → CRITICAL 13');
  it.todo('Case 5: sample mode timeout → WARNING 13(不阻断)');
  it.todo('Case 6: expected_failures parser 命中失败 → CRITICAL 5');
});
