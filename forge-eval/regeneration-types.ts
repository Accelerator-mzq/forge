// regeneration eval scenario 类型 — Plan 7 Phase E
// spec §5.1:复用 Plan 5 forge-eval 基础设施 + 新增分层抽样

import type { KeyFact, LegacyAnchorRole, QualityResult } from '../src/core/legacy-bridge/types.js';

/** scenario YAML 顶层 */
export interface RegenScenario {
  /** scenario id(文件名同名,如 well-formed-srs) */
  id: string;
  description?: string;
  /** 评测用模型,默认 'claude-sonnet-4-6' */
  model?: string;
  /** 复写 role(决定 SRS / HLD / LLD / system-tests) */
  role: LegacyAnchorRole;
  /** 输入 anchor 列表(scenarios fixture 路径,相对 forge-eval/regeneration-scenarios/) */
  input_anchors: Array<{
    role: LegacyAnchorRole;
    /** scenario 内 fixture 文件路径 */
    path: string;
    authoritative: boolean;
    /** Excel 子 sheet */
    sheet?: string;
  }>;
  /** 关键事实清单(分层抽样输入) */
  key_facts: KeyFact[];
  /** 总体保真率阈值(默认 0.9) */
  regeneration_threshold?: number;
  /** critical 子集必抽必保留(默认 1.0) */
  critical_must_preserve?: number;
  /** 用户自补 redact 规则(可选) */
  redact?: Array<{ regex?: string; literal?: string; name?: string }>;
}

/** 单 scenario 跑结果 */
export interface RegenScenarioResult {
  scenario: RegenScenario;
  qualityResult: QualityResult;
  /** 复写产物正文(用于 debug) */
  body: string;
  /** 总 cost */
  totalCost: number;
  /** 是否最终通过(quality.passed) */
  passed: boolean;
}

/** 全 run 汇总 */
export interface RegenRunSummary {
  timestamp: string;
  results: RegenScenarioResult[];
  totalCost: number;
  /** 全部 scenario 都 passed 才视为 run pass */
  runPass: boolean;
}
