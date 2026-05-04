// Marker YAML 类型 — spec §3.4

export interface VerifyMarker {
  schema: 'forge-verify/v1';
  verified_at: string; // ISO 8601 UTC
  verified_by: 'ai-agent' | 'human-override';
  tasks_hash: string;
  content_hash: string;
  evidence: EvidenceItem[];
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
}

export interface ReviewFailedMarker {
  schema: 'forge-review-failed/v1';
  failed_at: string;
  unresolved_outcomes: ReviewOutcome[];
  appended_tasks: string[];
}

export type AnyMarker = VerifyMarker | ReviewMarker | VerifyFailedMarker | ReviewFailedMarker;
