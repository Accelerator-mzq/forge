// src/core/schemas/archive-summary.ts — plan-9e1 Task 1
// §3.12.1bis Interface Freeze:archive_summary 9 业务字段冻结 + 1 schema identifier
// 沿 design §2.4.3 YAML 字面格式 + master §3.12.1bis 字段表
//
// v2 BLOCKER 2 修订:`schema` literal 字段是 YAML schema identifier(沿所有 forge marker
//   schema 同约定:forge-verify/v1, forge-review/v1, forge-scope-entries/v1,
//   forge-ack-log/v1 都有),**不算 master §3.12.1bis 9 业务字段**。
//   master 9 字段冻结指 version / archived_at / change_id / verify_passed / review_passed /
//   process_evidence_summary / handoff_to_backlog / acked_warnings / pending_suggestions。
//   字段名沿 master(`acked_warnings`)而非 design line 662 字面(`acknowledged_warnings`)。
//
// 后续 sub-plan(9e2 接 process_evidence_summary / v1.1 backlog index)reference 此处,不重定义

import type { Severity } from './severity.js';

/** archive_summary 顶级 schema(9 业务字段 + 1 schema identifier,沿 master §3.12.1bis + v2 BLOCKER 2 注脚) */
export interface ArchiveSummary {
  /**
   * YAML schema identifier(v2 BLOCKER 2:不算 master §3.12.1bis 9 业务字段;
   * 沿 forge marker schema 同约定 — 每个 YAML 产物都有 schema literal 标识)
   */
  schema: 'forge-archive-summary/v1';
  /** semver(沿 forge 自身版本号叙事 §1.4,9e1 写 '1.0.0') */
  version: string;
  /** ISO 8601 UTC */
  archived_at: string;
  /** change id(非空) */
  change_id: string;
  /** verify-passed 摘要(含 verified_invariants 列表;9d verify 三维度填) */
  verify_passed: VerifyPassedRef;
  /** review-passed 摘要(含 reviewers 列表) */
  review_passed: ReviewPassedRef;
  /** process_evidence 14 不变量 pass/fail/legacy 分布;9e1 仅 placeholder,9e2 接 9g 真实统计 */
  process_evidence_summary: ProcessEvidenceSummary;
  /** 给 v1.1 forge backlog index 用 — 三类聚合(沿 design §2.4.3) */
  handoff_to_backlog: HandoffEntry[];
  /** 给用户回顾用 — verify/review 中 WARNING + acked 的引用 */
  acked_warnings: AckedWarningRef[];
  /** SUGGESTION + resolved=false 的引用(handoff 子集,但单独列出方便 §2.4.4 输出按类分段) */
  pending_suggestions: SuggestionRef[];
}

/** verify-passed 摘要 */
export interface VerifyPassedRef {
  /** 已验证的不变量(9d 三维度 / 9g 13 不变量;9e1 至少含 'hash-match' / 'evidence-complete') */
  verified_invariants: string[];
}

/** review-passed 摘要 */
export interface ReviewPassedRef {
  /** reviewer 列表(actor 值;'ai-agent' / 'human-override' / 具体用户名) */
  reviewers: string[];
}

/**
 * process_evidence_summary — 14 不变量分布(9g/9e2 真实填,9e1 仅 placeholder)
 *
 * placeholder=true 表示本字段是 9e1 占位,9e2 实施时改为真实统计:
 *   - placeholder: false
 *   - invariants_passed: number(经 mapper 优先级筛选后仍为 status='pass' 的 invariant 数)
 *   - invariants_with_warning: number(经 mapper 优先级筛选后仍为 status='warning' 的 invariant 数)
 *   - invariants_failed: number(v1.0 永远 = 0,fence.ok=false 时 archive 直接 exit 1,summary 不写入)
 *   - legacy_exempt: number(legacy marker 豁免数 — verify || review 任一为 legacy 即触发,沿 §3.4.4.1)
 *
 * **精度损失说明(v1.0 接受)**:legacy 路径下被豁免的 invariant 即使产 WARNING 也优先标 'legacy-skip'
 * 不计入 invariants_with_warning;特别是 review-only legacy + verify-side WARNING 副作用
 * (沿 brainstorm spec §4.3 边界场景 + §7 遗留 #8);WARNING 实际信息仍走 acked_warnings(freeze-time)
 * 或 stderr(rerun-time)双路径不丢,仅 summary 中 invariants_with_warning 计数偏低;
 * v1.1+ side-aware mapper 修复。
 *
 * **sum 不变式**:invariants_passed + invariants_with_warning + invariants_failed + legacy_exempt
 *               === FENCE_INVARIANT_NAMES.length(14)
 */
export interface ProcessEvidenceSummary {
  /** true = 9e1 占位;false = 9e2 真实统计 */
  placeholder: boolean;
  /** placeholder=true 时填说明 */
  note?: string;
  /** placeholder=false 时填具体数;9e2 接 9g */
  invariants_passed?: number;
  /** placeholder=false 时填具体数;9e2 v2 codex 一轮 MAJOR 修订新增字段;legacy 路径下被豁免 invariant 的 WARNING 不计入(精度损失,见上述说明) */
  invariants_with_warning?: number;
  /** placeholder=false 时填具体数;v1.0 永远 = 0(fence.ok=false 时 archive exit 1,summary 不写入) */
  invariants_failed?: number;
  /** placeholder=false 时填具体数;verify || review 任一为 legacy 时该 invariant 在 §3.4.4.1 豁免表内被跳 */
  legacy_exempt?: number;
}

/** handoff_to_backlog 一项 — 三类 source 聚合(沿 design §2.4.3) */
export interface HandoffEntry {
  /** 来源类别 */
  source: 'verify_findings' | 'review_outcomes' | 'pause_decisions' | 'scope_entries';
  /** 来源 id(verify_findings.id 数字 / pause_decisions.id 数字 / review_outcomes 索引数字 / scope_entries.id 字符串) */
  id: number | string;
  /** 三级 severity(scope_entries 来源时可能为 null,沿 design §2.4.3 字面) */
  severity?: Severity | null;
  /** verify/review 来源时的 dimension 字段(沿 9d VerifyFinding) */
  dimension?: string;
  /** verify/review 来源时的 check_type 字段(沿 9d VerifyFinding) */
  check_type?: string;
  /** 证据定位字符串(沿 9a EVIDENCE_FORMATS) */
  evidence?: string;
  /** 建议(可选) */
  recommendation?: string;
  /** pause_decisions 来源时的 chosen_option(应固定 = 3 才进 handoff) */
  chosen_option?: 3;
  /** pause_decisions 来源时的 target_artifact */
  target_artifact?: string;
  /** pause_decisions 来源时的 target_anchor */
  target_anchor?: string;
  /** pause_decisions 来源时的 issue_summary */
  issue_summary?: string;
  /** scope_entries 来源时的 category(沿 9b ScopeCategory) */
  category?: 'out-of-scope' | 'non-goal' | 'future-work';
  /** scope_entries 来源时的 reason */
  reason?: string;
}

/** acked_warnings 一项 — verify_findings / review_outcomes 中 WARNING + acked 的引用 */
export interface AckedWarningRef {
  source: 'verify_findings' | 'review_outcomes';
  id: number;
  dimension?: string;
  check_type?: string;
  evidence?: string;
  acked_by: string;
  acked_at: string;
  rationale?: string;
}

/** pending_suggestions 一项 — SUGGESTION + resolved=false 的引用(handoff_to_backlog 子集) */
export interface SuggestionRef {
  source: 'verify_findings' | 'review_outcomes';
  id: number;
  dimension?: string;
  check_type?: string;
  evidence?: string;
  recommendation?: string;
}

/** 9e1 当前 version 常量 */
export const ARCHIVE_SUMMARY_VERSION = '1.0.0';

/** 9e1 placeholder process_evidence_summary(9e2 接 9g 替换) */
export const PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY: ProcessEvidenceSummary = {
  placeholder: true,
  note: 'process_evidence 14 不变量统计待 9g + 9e2 实施',
};

/** ISO 8601 UTC 校验正则(沿 marker-schema.ts:20 同形式) */
export const ARCHIVE_SUMMARY_ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** semver 弱校验(major.minor.patch[-prerelease][+build]) */
export const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;

/** 类型守卫:对象具备 ArchiveSummary 顶级字段(运行时浅校验) */
export function looksLikeArchiveSummary(v: unknown): v is ArchiveSummary {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o.schema === 'forge-archive-summary/v1';
}
