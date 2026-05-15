// tests/core/schema/stage-extensions-config.test.ts — plan-stage-extensions Task 1.4
// 4 unit tests: defaults / override / rejection / partial-convergence deep-merge

import { describe, it, expect } from 'vitest';
import {
  validateStageExtensionsConfig,
  ConfigValidationError,
  STAGE_EXTENSIONS_DEFAULTS,
} from '../../../src/core/schema/stage-extensions-config.js';

// ── 工具函数:构造最小合法 entry ────────────────────────────────────────────

function minimalEntry(name: string) {
  return { name, enabled: true, command: 'codex run', output: 'output.md' };
}

describe('validateStageExtensionsConfig', () => {
  // Test 1: 最小合法输入 → 完整 normalized config
  it('validates default config — 最小合法输入返回完整 normalized config', () => {
    const result = validateStageExtensionsConfig({
      brainstorming: [minimalEntry('bs-review')],
      propose: [minimalEntry('propose-review')],
      apply_critical_plan_review: [minimalEntry('acp-review')],
      review: [minimalEntry('code-review')],
      verify: [minimalEntry('verify-review')],
    });

    // 所有 stage 数组存在
    expect(result.brainstorming).toHaveLength(1);
    expect(result.propose).toHaveLength(1);
    expect(result.apply_critical_plan_review).toHaveLength(1);
    expect(result.review).toHaveLength(1);
    expect(result.verify).toHaveLength(1);

    // entry 数值字段从内置 defaults 填充(! 断言:上方 toHaveLength(1) 已保证存在)
    const entry = result.brainstorming[0]!;
    expect(entry.timeout_sec).toBe(STAGE_EXTENSIONS_DEFAULTS.timeout_sec);
    expect(entry.poll_interval_sec).toBe(STAGE_EXTENSIONS_DEFAULTS.poll_interval_sec);
    expect(entry.zombie_threshold_sec).toBe(STAGE_EXTENSIONS_DEFAULTS.zombie_threshold_sec);
    expect(entry.max_retries).toBe(STAGE_EXTENSIONS_DEFAULTS.max_retries);

    // convergence 完整
    expect(entry.convergence.max_rounds).toBe(STAGE_EXTENSIONS_DEFAULTS.convergence.max_rounds);
    expect(entry.convergence.confidence_threshold).toBe(
      STAGE_EXTENSIONS_DEFAULTS.convergence.confidence_threshold,
    );
    expect(entry.convergence.block_severity).toEqual(
      STAGE_EXTENSIONS_DEFAULTS.convergence.block_severity,
    );

    // severity_map / severity_map_to_forge / user_interaction 存在
    expect(result.severity_map).toBeDefined();
    expect(result.severity_map_to_forge).toBeDefined();
    expect(result.user_interaction).toBeDefined();
  });

  // Test 2: 用户 override defaults.convergence.max_rounds → 返回 20
  it('validates user override — defaults.convergence.max_rounds=20 全量生效', () => {
    const result = validateStageExtensionsConfig({
      defaults: {
        convergence: { max_rounds: 20 },
      },
      review: [minimalEntry('review-entry')],
    });

    // review entry 的 convergence.max_rounds 应为 20(! 断言:review 含 1 条 entry)
    const reviewEntry = result.review[0]!;
    expect(reviewEntry.convergence.max_rounds).toBe(20);
    // 其余 convergence 字段仍为 defaults
    expect(reviewEntry.convergence.confidence_threshold).toBe(
      STAGE_EXTENSIONS_DEFAULTS.convergence.confidence_threshold,
    );
    expect(reviewEntry.convergence.block_severity).toEqual(
      STAGE_EXTENSIONS_DEFAULTS.convergence.block_severity,
    );
    // 未声明的 stage 数组为 []
    expect(result.brainstorming).toEqual([]);
    expect(result.verify).toEqual([]);
  });

  // Test 3: 非法值 → 抛 ConfigValidationError
  it('rejects invalid values — max_rounds=-1 / confidence_threshold=2 均抛出', () => {
    // max_rounds=-1 → 违反 [1, 100] 范围
    expect(() =>
      validateStageExtensionsConfig({
        review: [
          {
            ...minimalEntry('bad-rounds'),
            convergence: { max_rounds: -1 },
          },
        ],
      }),
    ).toThrow(ConfigValidationError);

    // confidence_threshold=2 → 违反 [0, 1] 范围
    expect(() =>
      validateStageExtensionsConfig({
        review: [
          {
            ...minimalEntry('bad-confidence'),
            convergence: { confidence_threshold: 2 },
          },
        ],
      }),
    ).toThrow(ConfigValidationError);
  });

  // Test 4: 局部 convergence deep-merge → 其余字段保持 defaults
  it('partial entry convergence is deep-merged — 仅 max_rounds 覆盖,其余字段不为 undefined', () => {
    const result = validateStageExtensionsConfig({
      review: [
        {
          ...minimalEntry('partial-conv'),
          // 只传 max_rounds,其余省略
          convergence: { max_rounds: 20 },
        },
      ],
    });

    // ! 断言:review 含 1 条 entry
    const conv = result.review[0]!.convergence;

    // 明确覆盖的字段
    expect(conv.max_rounds).toBe(20);

    // 其余字段必须来自 defaults(不能是 undefined)
    expect(conv.confidence_threshold).toBe(
      STAGE_EXTENSIONS_DEFAULTS.convergence.confidence_threshold,
    );
    expect(conv.block_severity).toEqual(STAGE_EXTENSIONS_DEFAULTS.convergence.block_severity);
    expect(conv.ignore_severity).toEqual(STAGE_EXTENSIONS_DEFAULTS.convergence.ignore_severity);
    expect(conv.verdict_approve_short_circuit).toBe(
      STAGE_EXTENSIONS_DEFAULTS.convergence.verdict_approve_short_circuit,
    );
    expect(conv.max_rounds_on_exceed).toBe(
      STAGE_EXTENSIONS_DEFAULTS.convergence.max_rounds_on_exceed,
    );

    // 整个 convergence 对象所有键都不能是 undefined
    expect(conv.confidence_threshold).not.toBeUndefined();
    expect(conv.block_severity).not.toBeUndefined();
    expect(conv.ignore_severity).not.toBeUndefined();
    expect(conv.verdict_approve_short_circuit).not.toBeUndefined();
    expect(conv.max_rounds_on_exceed).not.toBeUndefined();
  });
});
