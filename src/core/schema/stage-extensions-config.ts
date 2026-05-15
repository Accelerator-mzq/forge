// src/core/schema/stage-extensions-config.ts — plan-stage-extensions Task 1.3
// stage_extensions 配置 validation + normalization。
//
// 规则:
//   - 缺失字段 → deep-merge 内置 STAGE_EXTENSIONS_DEFAULTS
//   - 非法值(范围/类型违规) → throw ConfigValidationError(严格模式,不 fallback)
//   - 合法值 → 返回完整 NormalizedStageExtensionsConfig

import type {
  StageExtensionsConfig,
  StageExtensionsDefaults,
  NormalizedStageExtensionEntry,
  NormalizedStageExtensionsConfig,
  ConvergenceConfig,
  StageExtensionEntry,
} from './types.js';

// ─── 内置默认值 ─────────────────────────────────────────────────────────────

/**
 * 内置 stage extensions 默认值;用户 defaults 段通过 deep-merge 覆盖。
 * 所有字段均为合法值,作为 normalization 基础。
 */
export const STAGE_EXTENSIONS_DEFAULTS: StageExtensionsDefaults = {
  // mode 预留给 v2 async 模式(plan 决策 Q5);v1 仅 'sync',不进 NormalizedStageExtensionsConfig
  mode: 'sync',
  // 轮询间隔(秒)
  poll_interval_sec: 300,
  // zombie 任务阈值(秒):超过后视为悬挂进程
  zombie_threshold_sec: 300,
  // 单次 extension 超时(秒)
  timeout_sec: 900,
  // 最大重试次数
  max_retries: 1,
  convergence: {
    max_rounds: 10,
    max_rounds_on_exceed: 'ask',
    // 默认阻塞 BLOCKER + MAJOR
    block_severity: ['BLOCKER', 'MAJOR'],
    // 默认忽略 MINOR + NIT
    ignore_severity: ['MINOR', 'NIT'],
    // 通过信心阈值
    confidence_threshold: 0.7,
    // APPROVE verdict 时直接短路
    verdict_approve_short_circuit: true,
  },
  severity_map: {
    critical: 'BLOCKER',
    high: 'MAJOR',
    medium: 'MINOR',
    low: 'NIT',
  },
  severity_map_to_forge: {
    BLOCKER: 'critical',
    MAJOR: 'critical',
    MINOR: 'warning',
    NIT: 'suggestion',
  },
  user_interaction: {
    block_unconverged: 'auto_fix_recommended',
    max_rounds_exceed: 'give_up_recommended',
  },
};

// ─── 错误类 ──────────────────────────────────────────────────────────────────

/**
 * stage_extensions 配置校验失败时抛出。
 * 继承 Error,调用方可用 instanceof ConfigValidationError 判断。
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    /** 出错的字段路径(如 'stage_extensions.brainstorming[0].convergence.max_rounds') */
    public readonly field: string,
  ) {
    super(`forge config validation: ${field}: ${message}`);
    this.name = 'ConfigValidationError';
  }
}

// ─── 合法 severity 列表 ───────────────────────────────────────────────────────

const VALID_SEVERITIES = ['BLOCKER', 'MAJOR', 'MINOR', 'NIT'] as const;
type SeverityLevel = (typeof VALID_SEVERITIES)[number];

/** 检查数组中每个值是否均为合法 severity */
function isValidSeverityArray(arr: unknown): arr is SeverityLevel[] {
  return Array.isArray(arr) && arr.every((v) => VALID_SEVERITIES.includes(v as SeverityLevel));
}

/**
 * I-2:剔除对象中值为 undefined 的 key。
 * 防止用户配置里的显式 undefined(如 `{ timeout_sec: undefined }`)在 spread merge
 * 时覆盖掉合法默认值,导致 required 字段实际变 undefined。
 */
function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out;
}

// ─── 单 entry 校验 + normalization ───────────────────────────────────────────

/**
 * 对单个 StageExtensionEntry 做校验并 deep-merge defaults,返回 NormalizedStageExtensionEntry。
 * 非法值 → 抛 ConfigValidationError。
 *
 * @param entry  用户输入的 entry
 * @param defaults  已 merge 过 user defaults 的有效 defaults
 * @param path  错误路径前缀(如 'stage_extensions.brainstorming[0]')
 */
function normalizeEntry(
  entry: StageExtensionEntry,
  defaults: StageExtensionsDefaults,
  path: string,
): NormalizedStageExtensionEntry {
  // command 必须为非空字符串
  if (typeof entry.command !== 'string' || entry.command.trim() === '') {
    throw new ConfigValidationError('command must be a non-empty string', `${path}.command`);
  }

  // 合并数值字段(entry 未设则取 defaults)
  const timeout_sec = entry.timeout_sec ?? defaults.timeout_sec;
  const poll_interval_sec = entry.poll_interval_sec ?? defaults.poll_interval_sec;
  const zombie_threshold_sec = entry.zombie_threshold_sec ?? defaults.zombie_threshold_sec;
  const max_retries = entry.max_retries ?? defaults.max_retries;

  // ── 校验数值范围(merge 后再校验,防止 defaults 本身非法) ──
  if (!Number.isFinite(timeout_sec) || timeout_sec < 60 || timeout_sec > 3600) {
    throw new ConfigValidationError(
      `timeout_sec must be in [60, 3600], got ${timeout_sec}`,
      `${path}.timeout_sec`,
    );
  }

  // I-1:poll_interval_sec 范围校验 [10, 3600]
  if (!Number.isFinite(poll_interval_sec) || poll_interval_sec < 10 || poll_interval_sec > 3600) {
    throw new ConfigValidationError(
      `poll_interval_sec must be in [10, 3600], got ${poll_interval_sec}`,
      `${path}.poll_interval_sec`,
    );
  }

  // I-1:zombie_threshold_sec 范围校验 [10, 3600]
  if (
    !Number.isFinite(zombie_threshold_sec) ||
    zombie_threshold_sec < 10 ||
    zombie_threshold_sec > 3600
  ) {
    throw new ConfigValidationError(
      `zombie_threshold_sec must be in [10, 3600], got ${zombie_threshold_sec}`,
      `${path}.zombie_threshold_sec`,
    );
  }

  if (
    !Number.isFinite(max_retries) ||
    !Number.isInteger(max_retries) ||
    max_retries < 0 ||
    max_retries > 10
  ) {
    throw new ConfigValidationError(
      `max_retries must be integer in [0, 10], got ${max_retries}`,
      `${path}.max_retries`,
    );
  }

  // ── convergence deep-merge:entry.convergence 覆盖 defaults.convergence ──
  const effectiveConvergence: ConvergenceConfig = {
    ...defaults.convergence,
    ...entry.convergence,
  };

  // 校验 convergence 字段
  const cvgPath = `${path}.convergence`;

  if (
    !Number.isFinite(effectiveConvergence.max_rounds) ||
    !Number.isInteger(effectiveConvergence.max_rounds) ||
    effectiveConvergence.max_rounds < 1 ||
    effectiveConvergence.max_rounds > 100
  ) {
    throw new ConfigValidationError(
      `max_rounds must be integer in [1, 100], got ${effectiveConvergence.max_rounds}`,
      `${cvgPath}.max_rounds`,
    );
  }

  if (
    !Number.isFinite(effectiveConvergence.confidence_threshold) ||
    effectiveConvergence.confidence_threshold < 0 ||
    effectiveConvergence.confidence_threshold > 1
  ) {
    throw new ConfigValidationError(
      `confidence_threshold must be in [0, 1], got ${effectiveConvergence.confidence_threshold}`,
      `${cvgPath}.confidence_threshold`,
    );
  }

  if (!isValidSeverityArray(effectiveConvergence.block_severity)) {
    throw new ConfigValidationError(
      `block_severity must be array of BLOCKER|MAJOR|MINOR|NIT, got ${JSON.stringify(effectiveConvergence.block_severity)}`,
      `${cvgPath}.block_severity`,
    );
  }

  if (!isValidSeverityArray(effectiveConvergence.ignore_severity)) {
    throw new ConfigValidationError(
      `ignore_severity must be array of BLOCKER|MAJOR|MINOR|NIT, got ${JSON.stringify(effectiveConvergence.ignore_severity)}`,
      `${cvgPath}.ignore_severity`,
    );
  }

  // I-3:max_rounds_on_exceed 必须为 'ask' | 'force_end'
  if (
    effectiveConvergence.max_rounds_on_exceed !== 'ask' &&
    effectiveConvergence.max_rounds_on_exceed !== 'force_end'
  ) {
    throw new ConfigValidationError(
      `max_rounds_on_exceed must be 'ask' or 'force_end', got ${JSON.stringify(effectiveConvergence.max_rounds_on_exceed)}`,
      `${cvgPath}.max_rounds_on_exceed`,
    );
  }

  // I-3:verdict_approve_short_circuit 必须为 boolean
  if (typeof effectiveConvergence.verdict_approve_short_circuit !== 'boolean') {
    throw new ConfigValidationError(
      `verdict_approve_short_circuit must be a boolean, got ${JSON.stringify(effectiveConvergence.verdict_approve_short_circuit)}`,
      `${cvgPath}.verdict_approve_short_circuit`,
    );
  }

  return {
    name: entry.name,
    enabled: entry.enabled,
    command: entry.command,
    ...(entry.build_prompt !== undefined ? { build_prompt: entry.build_prompt } : {}),
    output: entry.output,
    timeout_sec,
    poll_interval_sec,
    zombie_threshold_sec,
    max_retries,
    convergence: effectiveConvergence,
  };
}

// ─── 主 validator ─────────────────────────────────────────────────────────────

/**
 * 验证并 normalize stage_extensions 配置。
 * 严格模式:非法值 throw ConfigValidationError(不 fallback)。
 * 缺失字段从内置 STAGE_EXTENSIONS_DEFAULTS deep-merge 填充。
 *
 * @param raw  forge/config.yaml 解析后的 stage_extensions 段(unknown 类型)
 * @returns    完整 NormalizedStageExtensionsConfig
 * @throws     ConfigValidationError  校验失败时
 */
export function validateStageExtensionsConfig(raw: unknown): NormalizedStageExtensionsConfig {
  // C-1:narrow unknown — 必须是非 null 非数组的对象才视为配置,否则视为空配置
  const config: StageExtensionsConfig =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as StageExtensionsConfig)
      : {};

  // ── step 1: deep-merge user defaults over built-in defaults ──
  const userDefaults = config.defaults ?? {};
  const mergedDefaults: StageExtensionsDefaults = {
    ...STAGE_EXTENSIONS_DEFAULTS,
    // I-2:剔除值为 undefined 的 key,防止显式 undefined 覆盖合法默认值
    ...stripUndefined(userDefaults),
    // convergence 需单独 deep-merge
    convergence: {
      ...STAGE_EXTENSIONS_DEFAULTS.convergence,
      ...stripUndefined(userDefaults.convergence ?? {}),
    },
    // severity_map deep-merge
    severity_map: {
      ...STAGE_EXTENSIONS_DEFAULTS.severity_map,
      ...stripUndefined(userDefaults.severity_map ?? {}),
    },
    // severity_map_to_forge deep-merge
    severity_map_to_forge: {
      ...STAGE_EXTENSIONS_DEFAULTS.severity_map_to_forge,
      ...stripUndefined(userDefaults.severity_map_to_forge ?? {}),
    },
    // user_interaction deep-merge
    user_interaction: {
      ...STAGE_EXTENSIONS_DEFAULTS.user_interaction,
      ...stripUndefined(userDefaults.user_interaction ?? {}),
    },
  };

  // ── step 2: 对每个 stage 数组 normalize entries ──
  const normalizeStage = (
    entries: StageExtensionEntry[] | undefined,
    stageName: string,
  ): NormalizedStageExtensionEntry[] =>
    (entries ?? []).map((entry, idx) =>
      normalizeEntry(entry, mergedDefaults, `stage_extensions.${stageName}[${idx}]`),
    );

  return {
    severity_map: mergedDefaults.severity_map,
    severity_map_to_forge: mergedDefaults.severity_map_to_forge,
    user_interaction: mergedDefaults.user_interaction,
    brainstorming: normalizeStage(config.brainstorming, 'brainstorming'),
    propose: normalizeStage(config.propose, 'propose'),
    apply_critical_plan_review: normalizeStage(
      config.apply_critical_plan_review,
      'apply_critical_plan_review',
    ),
    review: normalizeStage(config.review, 'review'),
    verify: normalizeStage(config.verify, 'verify'),
  };
}
