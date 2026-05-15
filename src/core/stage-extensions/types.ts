// types.ts — stage-extensions 共用辅助类型
// plan-stage-extensions Task 2.0
// 定义 CodexReviewOutput / CodexFinding / ForgeFinding / SeverityMap 等共用类型

import type { StageExtensionsDefaults } from '../schema/types.js';

/** codex severity → forge 4 级映射类型(从 StageExtensionsDefaults 取) */
export type SeverityMap = StageExtensionsDefaults['severity_map'];

/**
 * codex review JSON 输出中的单个 finding。
 * 字段与 codex review-output.schema.json 对齐。
 */
export interface CodexFinding {
  /** codex 原始 severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  body: string;
  file: string;
  line_start: number;
  line_end: number;
  /** 置信度 0-1 */
  confidence: number;
  recommendation: string;
}

/**
 * codex review 完整输出。
 * `thread_id` 不在 codex JSON schema 中 — 由 helper (Task 3) 从 codex session id 附加,可选。
 */
export interface CodexReviewOutput {
  verdict: 'approve' | 'needs-attention';
  summary: string;
  findings: CodexFinding[];
  next_steps: string[];
  /** codex session id,由 helper 附加;首轮可能缺失 */
  thread_id?: string;
}

/**
 * CodexFinding + forge 内部 4 级 severity。
 * convergence-judge 分桶后产出此类型。
 */
export interface ForgeFinding extends CodexFinding {
  forge_severity: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT';
}
