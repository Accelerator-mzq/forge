// src/core/schema/process-verification-config.ts — plan-9g Task 1.2
// v1.0 process_verification 配置 validation(沿 validateWritingPlansConfig 模式)
//
// 规则(brainstorm spec §6.1):
//   - 缺失字段 → 返回默认值(DEFAULT_PROCESS_VERIFICATION)
//   - 类型错 / 范围外 → stderr warn + fallback 默认
//   - 合法值 → 直接返回

import type { ForgeConfig } from './types.js';
import { DEFAULT_PROCESS_VERIFICATION } from './types.js';

/** 默认值类型(sanitize 后必填三字段返回) */
export interface SanitizedProcessVerificationConfig {
  mode: 'full' | 'sample' | 'hash-only';
  sample_ratio: number;
  test_timeout_per_task: number;
  max_parallel_reruns: number;
}

/**
 * 验证并 sanitize process_verification 配置。
 * 永远返回合法值(用 default fallback,不抛错 — 配置层 graceful degradation)。
 *
 * @param config — forge/config.yaml 解析结果(可缺 process_verification 段)
 * @param warn — 注入 console.warn 用于测试 / 自定义 logger
 * @returns 合法的 SanitizedProcessVerificationConfig
 */
export function validateProcessVerificationConfig(
  config: ForgeConfig | undefined,
  warn: (msg: string) => void = (msg) => console.warn(msg),
): SanitizedProcessVerificationConfig {
  const raw = config?.process_verification;

  // 缺失 → 全默认
  if (!raw) {
    return { ...DEFAULT_PROCESS_VERIFICATION };
  }

  // mode 校验
  let mode: SanitizedProcessVerificationConfig['mode'] = DEFAULT_PROCESS_VERIFICATION.mode;
  if (raw.mode !== undefined && raw.mode !== null) {
    if (raw.mode === 'full' || raw.mode === 'sample' || raw.mode === 'hash-only') {
      mode = raw.mode;
    } else {
      warn(
        `forge config: process_verification.mode must be 'full'|'sample'|'hash-only', got ${JSON.stringify(raw.mode)}; falling back to ${DEFAULT_PROCESS_VERIFICATION.mode}`,
      );
    }
  }

  // sample_ratio 校验(0..1)
  let sample_ratio = DEFAULT_PROCESS_VERIFICATION.sample_ratio;
  if (raw.sample_ratio !== undefined && raw.sample_ratio !== null) {
    if (
      typeof raw.sample_ratio === 'number' &&
      !Number.isNaN(raw.sample_ratio) &&
      raw.sample_ratio >= 0 &&
      raw.sample_ratio <= 1
    ) {
      sample_ratio = raw.sample_ratio;
    } else {
      warn(
        `forge config: process_verification.sample_ratio must be number in [0,1], got ${JSON.stringify(raw.sample_ratio)}; falling back to ${DEFAULT_PROCESS_VERIFICATION.sample_ratio}`,
      );
    }
  }

  // test_timeout_per_task 校验([10, 3600] 秒)
  let test_timeout_per_task = DEFAULT_PROCESS_VERIFICATION.test_timeout_per_task;
  if (raw.test_timeout_per_task !== undefined && raw.test_timeout_per_task !== null) {
    if (
      typeof raw.test_timeout_per_task === 'number' &&
      Number.isInteger(raw.test_timeout_per_task) &&
      raw.test_timeout_per_task >= 10 &&
      raw.test_timeout_per_task <= 3600
    ) {
      test_timeout_per_task = raw.test_timeout_per_task;
    } else {
      warn(
        `forge config: process_verification.test_timeout_per_task must be integer in [10, 3600], got ${JSON.stringify(raw.test_timeout_per_task)}; falling back to ${DEFAULT_PROCESS_VERIFICATION.test_timeout_per_task}`,
      );
    }
  }

  // max_parallel_reruns 校验([1, 8])
  let max_parallel_reruns = DEFAULT_PROCESS_VERIFICATION.max_parallel_reruns;
  if (raw.max_parallel_reruns !== undefined && raw.max_parallel_reruns !== null) {
    if (
      typeof raw.max_parallel_reruns === 'number' &&
      Number.isInteger(raw.max_parallel_reruns) &&
      raw.max_parallel_reruns >= 1 &&
      raw.max_parallel_reruns <= 8
    ) {
      max_parallel_reruns = raw.max_parallel_reruns;
    } else {
      warn(
        `forge config: process_verification.max_parallel_reruns must be integer in [1, 8], got ${JSON.stringify(raw.max_parallel_reruns)}; falling back to ${DEFAULT_PROCESS_VERIFICATION.max_parallel_reruns}`,
      );
    }
  }

  return { mode, sample_ratio, test_timeout_per_task, max_parallel_reruns };
}
