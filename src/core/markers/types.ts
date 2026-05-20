// Marker YAML 类型 — v4 OpenSpec alignment 简版(plan-v4 Phase 1 Task 1.2)
//
// v4 BREAKING change(沿 plan-v4 §6.2 / §4.2):
// - 删反加固字段:tasks_hash / content_hash / git / process_evidence /
//   process_evidence_staging_hash / verify_findings / ack_log_tail_hash /
//   ack_log_entry_count / evidence(EvidenceItem 数组)/ resigned_by_tool_version
// - 删 VerifyFailedMarker / ReviewFailedMarker(v4 verify/review 不再写 failed marker;
//   失败直接 abort,user 修复后重跑)
// - 简化 PauseDecision → PauseDecisionSimple(5 字段 + 自由 notes,无 fence 校验)
// - schema 版本 v1 → v2(BREAKING)

/**
 * PauseDecisionSimple — Fluid Pause 软记录(v4 简化)
 * apply 中段 subagent 报 BLOCKED/DONE_WITH_CONCERNS/DESIGN_ISSUE_FOUND 时,
 * 主代理 AskUserQuestion 4 选项后写入。无 fence 强制,marker 仅作 audit。
 */
export interface PauseDecisionSimple {
  /** pause 触发时刻(ISO 8601 UTC,允许 ms 精度) */
  paused_at: string;
  /** 关联 task(tasks.md#task-N 格式) */
  task_ref: string;
  /** subagent 报告的 issue 一句概括 */
  issue_summary: string;
  /** 1=扩 scope / 2=加 task / 3=转 out-of-scope / 4=Other */
  chosen_option: 1 | 2 | 3 | 4;
  /** 自由 prose,user/AI 想写啥写啥(无 fence 校验) */
  notes?: string;
}

/** verify marker v4 极简 schema */
export interface VerifyMarker {
  schema: 'forge-verify/v2';
  /** verify 执行时刻(ISO 8601 UTC,允许 ms 精度 — V-1 修复) */
  verified_at: string;
  /** 'ai-agent' | username */
  verified_by: string;
  /** Fluid Pause 软记录(可选,无 fence) */
  pause_decisions?: PauseDecisionSimple[];
  /** 工具版本号(来自 FORGE_VERSION,v3.1.1 起动态读 package.json) */
  created_by_tool_version?: string;
}

/** review marker v4 极简 schema(镜像 verify) */
export interface ReviewMarker {
  schema: 'forge-review/v2';
  reviewed_at: string;
  reviewed_by: string;
  pause_decisions?: PauseDecisionSimple[];
  created_by_tool_version?: string;
}

/** marker 联合类型 — v4 只有两种 */
export type AnyMarker = VerifyMarker | ReviewMarker;
