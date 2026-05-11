// Marker YAML 类型 — spec §3.4

import type { Finding } from '../schemas/severity.js';

export interface VerifyMarker {
  schema: 'forge-verify/v1';
  verified_at: string; // ISO 8601 UTC
  verified_by: 'ai-agent' | 'human-override';
  tasks_hash: string;
  content_hash: string;
  evidence: EvidenceItem[];
  // plan-9d Task 3 新增 — superset additive,老 marker 缺等价 []
  verify_findings?: VerifyFinding[];
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
}

export interface ReviewFailedMarker {
  schema: 'forge-review-failed/v1';
  failed_at: string;
  unresolved_outcomes: ReviewOutcome[];
  appended_tasks: string[];
}

export type AnyMarker = VerifyMarker | ReviewMarker | VerifyFailedMarker | ReviewFailedMarker;
