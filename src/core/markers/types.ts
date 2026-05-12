// Marker YAML 类型 — spec §3.4

import type { Finding } from '../schemas/severity.js';
import type { Severity } from '../schemas/severity.js';

export interface VerifyMarker {
  schema: 'forge-verify/v1';
  verified_at: string; // ISO 8601 UTC
  verified_by: 'ai-agent' | 'human-override';
  tasks_hash: string;
  content_hash: string;
  evidence: EvidenceItem[];
  // plan-9d Task 3 新增 — superset additive,老 marker 缺等价 []
  verify_findings?: VerifyFinding[];
  // plan-9c Task 1 新增 — superset additive,老 marker 缺等价 []
  // apply 阶段 Fluid Pause Decision Point 主代理调 AskUserQuestion 三选项后写入(沿 design §2.1.5)
  pause_decisions?: PauseDecision[];
}

/**
 * VerifyFinding — verify 阶段产出的 finding 项
 * Reference 9a Finding 接口(沿 §3.12.1 Finding 字段冻结)
 * plan-9d v2 m-1 修订:改 extends Finding 而非裸 alias,留 verify-only optional 字段扩展位
 * (例如未来加 requirement_id?: string 显式关联 spec 章节,不打破现有接口)
 * **不允许 require 新字段** — 沿 superset additive 原则
 */
export interface VerifyFinding extends Finding {
  // verify-only optional 字段在此扩展;现版不加任何字段(沿 9a §3.12.1 freeze)
}

/**
 * chosen_option — Fluid Pause 用户决策选项(沿 design §2.1.4 / §2.1.5)
 * 1 = 扩 scope(更新 proposal `## What Changes`,subagent 重派)
 * 2 = 加 task(主代理 append 新 task 到 tasks.md,subagent 重派)
 * 3 = 转 out-of-scope(写到 proposal `## Out of Scope` / design `## Future Work` YAML 块,subagent 跳过 issue 继续)
 * 4 = Other(用户提供自由文本描述,必须配 other_rationale + other_acked_by)
 */
export type ChosenOption = 1 | 2 | 3 | 4;

/**
 * PauseDecision — apply 阶段 Fluid Pause Decision Point 主代理记录的决策项
 * 沿 design §2.1.5 marker schema
 * superset additive:四 marker 均可选 pause_decisions?,缺等价 []
 *
 * v2 codex MINOR 10 修订:本 interface 的 nullable 字段(severity_acked_by/_at /
 *   non_blocking_rationale / other_rationale / other_acked_by)统一用 `string | null`,
 *   **与 9a `Finding.severity_acked_by?: string` 不同**。
 *   - 设计理由:design §2.1.5 line 256-257 YAML 示例字面用 `other_rationale: null` /
 *     `other_acked_by: null`,marker YAML 中字段必须存在(值或填或 null),不允许"字段缺失"。
 *   - 9a Finding 是另一回事:Finding 字段缺失等价默认值,9a 实施沿 optional 模式。
 *   - 两 interface 独立,本 PauseDecision 沿 design YAML 字面格式。
 */
export interface PauseDecision {
  /** 同一 marker 内唯一(数字 id,沿 9a Finding id 模式) */
  id: number;
  /** pause 触发时刻(ISO 8601 UTC) */
  paused_at: string;
  /** 关联的 task(tasks.md#task-N 格式;subagent 报 DONE_WITH_CONCERNS / BLOCKED / DESIGN_ISSUE_FOUND 时所在 task) */
  task_ref: string;
  /** subagent 报告的 issue 一句概括 */
  issue_summary: string;
  /** 主代理初判(CRITICAL → 不应进 pause,本 enum 校验 + fence 重定向) */
  severity: Severity;
  /** WARNING 必须有,SUGGESTION 允许空(沿 design §2.1.5 fence 校验) */
  severity_acked_by: string | null;
  severity_acked_at: string | null;
  /** 1 | 2 | 3 | 4 — 用户在 AskUserQuestion 选择 */
  chosen_option: ChosenOption;
  /** option=1 → 'proposal.md';option=2 → 'tasks.md';option=3 → 'proposal.md' | 'design.md' */
  target_artifact: string;
  /** option=1 → '## What Changes';option=2 → 新 task 行;option=3 → '## Out of Scope' | '## Future Work' */
  target_anchor: string;
  /** option=3 必填(沿 design §2.1.5 fence 校验);其他选项填 null */
  non_blocking_rationale: string | null;
  /** option=4 必填(用户提供自由文本) */
  other_rationale: string | null;
  /** option=4 必填(用户在 marker 之外某处确认 — fence 仅校验非空,不校验来源)  */
  other_acked_by: string | null;
}

export interface EvidenceItem {
  scenario_id: string;
  test_command: string;
  test_file: string;
  log_path: string; // 相对 marker 文件目录
  log_hash: string;
  pass: boolean;
}

export interface ReviewMarker {
  schema: 'forge-review/v1';
  reviewed_at: string;
  reviewed_by: 'ai-agent' | 'human-override';
  tasks_hash: string;
  content_hash: string;
  git: GitInfo;
  review_outcomes: ReviewOutcome[];
  // plan-9c Task 1 新增 — superset additive(verify 端 pause 也镜像到 review marker,沿 design §2.1.6)
  pause_decisions?: PauseDecision[];
}

export interface GitInfo {
  is_git_repo: boolean;
  head?: string;
  diff_hash?: string;
  diff_pathspec?: {
    include: string[];
    exclude: string[];
  };
}

export interface ReviewOutcome {
  severity: 'S' | 'C' | 'L';
  accepted: boolean;
  resolved: boolean;
  task_ref?: string; // accepted=true 时必需
  rationale?: string; // accepted=false 时必需
}

export interface VerifyFailedMarker {
  schema: 'forge-verify-failed/v1';
  failed_at: string;
  reasons: string[];
  fake_completions: string[]; // 已勾但虚假的 task id
  appended_tasks: string[];
  // plan-9d Task 3 新增 — unresolved_findings 等价 verify_findings 中 resolved=false 子集
  verify_findings?: VerifyFinding[];
  // plan-9c Task 1 新增 — verify failed 也可能携带 pause_decisions(本 round verify 失败但已有 pause 记录)
  pause_decisions?: PauseDecision[];
}

export interface ReviewFailedMarker {
  schema: 'forge-review-failed/v1';
  failed_at: string;
  unresolved_outcomes: ReviewOutcome[];
  appended_tasks: string[];
  // plan-9c Task 1 新增
  pause_decisions?: PauseDecision[];
}

export type AnyMarker = VerifyMarker | ReviewMarker | VerifyFailedMarker | ReviewFailedMarker;
