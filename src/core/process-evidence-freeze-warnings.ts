// src/core/process-evidence-freeze-warnings.ts — plan-9g Task 4
// freeze-time WARNING 算法(沿 brainstorm spec §3 WARNING 流转两段)
//
// freeze 阶段只能算 fence-ctx 字段类 WARNING(不变量 7 + 10);
// 不变量 11/12 是 CRITICAL,失败时返 criticals 数组让 freeze 子命令 exit 1;
// 不变量 5/6/13/14 是 archive 阶段 worktree 重跑产,freeze 时不算
//
// finding_hash 沿 plan-9a computeFindingHash 8 字段 schema
// dimension='process_evidence'(plan-9g Task 1.4 扩 enum)

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProcessEvidence } from './schemas/process-evidence.js';
import type { VerifyFinding } from './markers/types.js';
import type { AckLogEntry } from './ack-log.js';
// plan-9g §5.3 末 line 3684-3691 修正:实际函数在 validate/finding-hash.ts(NOT schemas/severity.ts)
import { computeFindingHash } from './validate/finding-hash.js';

export interface FreezeWarningsResult {
  /** WARNING finding(写 marker.verify_findings) */
  warnings: VerifyFinding[];
  /** CRITICAL finding(freeze 时 exit 1) */
  criticals: VerifyFinding[];
}

/**
 * computeFreezeWarnings — freeze 时算 fence-ctx WARNING + CRITICAL
 *
 * 不变量映射:
 *   - 7  verify_invocations 计数 < task 数 → WARNING(check_type='invariant-7-verify-count')
 *   - 10 env_hash 漂移(lockfile/node/os 与当前不一致)→ WARNING(check_type='invariant-10-env-drift')
 *   - 11 tdd_exemption 非空但 ack-log 无对应条目 → CRITICAL
 *   - 12 mode != full 但 acked_by 缺 → CRITICAL
 *
 * @param processEvidence freeze 时凝固的 process_evidence
 * @param changeRoot change 根目录(读 tasks.md 计 task 数)
 * @param ackLogEntries 全 ack-log entries(用于 11/12 cross-check)
 */
export function computeFreezeWarnings(
  processEvidence: ProcessEvidence,
  changeRoot: string,
  ackLogEntries: AckLogEntry[],
): FreezeWarningsResult {
  const warnings: VerifyFinding[] = [];
  const criticals: VerifyFinding[] = [];

  // 不变量 7:verify_invocations 总数 ≥ task 数
  const tasksCount = countTasksInTasksMd(changeRoot);
  if (processEvidence.verify_invocations.length < tasksCount) {
    warnings.push(
      mkFinding({
        invariant: 7,
        severity: 'WARNING',
        check_type: 'invariant-7-verify-count',
        evidence: `verify_invocations.length=${processEvidence.verify_invocations.length}; tasks count=${tasksCount}`,
        recommendation:
          'subagent 实施完每 task 必须调 forge evidence record-verify;若主代理已统一跑 change-level verify 视为可接受 → forge ack propose --action ack-warning',
      }),
    );
  }

  // 不变量 10:env_hash 一致性(lockfile_hash 不校:freeze 时 CWD 可能不同;校 node/os 两因子)
  const currentEnv = {
    node_version: process.version.slice(1),
    os_platform: process.platform,
  };
  if (
    processEvidence.env_hash.node_version !== currentEnv.node_version ||
    processEvidence.env_hash.os_platform !== currentEnv.os_platform
  ) {
    warnings.push(
      mkFinding({
        invariant: 10,
        severity: 'WARNING',
        check_type: 'invariant-10-env-drift',
        evidence:
          `marker env: node=${processEvidence.env_hash.node_version} os=${processEvidence.env_hash.os_platform};` +
          ` current env: node=${currentEnv.node_version} os=${currentEnv.os_platform}`,
        recommendation:
          '使用 hermetic CI 或重跑 verify 同步 env_hash;若环境差异客观 → forge ack propose --action ack-warning',
      }),
    );
  }

  // 不变量 11:tdd_exemption 非空但 ack-log 无对应条目 → CRITICAL
  for (const chain of processEvidence.tdd_event_chain) {
    if (chain.tdd_exemption !== null) {
      const hasAck = ackLogEntries.some(
        (e) =>
          e.kind === 'ack' &&
          (e as { action?: string }).action === 'ack-tdd-exemption' &&
          (e as { extra?: { task_ref?: string } }).extra?.task_ref === chain.task_ref,
      );
      if (!hasAck) {
        criticals.push(
          mkFinding({
            invariant: 11,
            severity: 'CRITICAL',
            check_type: 'invariant-11-tdd-exemption-no-ack',
            evidence: `task_ref=${chain.task_ref} has tdd_exemption=${JSON.stringify(chain.tdd_exemption)} but no ack`,
            recommendation: '跑 forge ack propose --action ack-tdd-exemption --finding <task-id>',
          }),
        );
      }
    }
  }

  // 不变量 12:mode != full 但 acked_by 缺 → CRITICAL
  if (
    processEvidence.process_verification_mode !== 'full' &&
    !processEvidence.process_verification_mode_acked_by
  ) {
    criticals.push(
      mkFinding({
        invariant: 12,
        severity: 'CRITICAL',
        check_type: 'invariant-12-mode-no-ack',
        evidence: `mode=${processEvidence.process_verification_mode}; acked_by=null`,
        recommendation: '跑 forge ack propose --action ack-mode 写 acked_by',
      }),
    );
  }

  return { warnings, criticals };
}

interface MkFindingInput {
  invariant: number;
  severity: 'CRITICAL' | 'WARNING';
  check_type: string;
  evidence: string;
  recommendation: string;
}

function mkFinding(input: MkFindingInput): VerifyFinding {
  // 沿 plan-9a computeFindingHash 8 字段 schema + dimension='process_evidence'
  // content_hash / git_head 在 freeze 阶段无法知道实际值,用固定占位(沿 plan §5.1.2 字面)
  // 不变量:同 check_type + evidence + recommendation 组合的 finding_hash 在同批 freeze 内唯一
  const payload = {
    content_hash: 'sha256:freeze-placeholder',
    git_head: 'freeze-placeholder',
    dimension: 'process_evidence' as const,
    check_type: input.check_type,
    severity: input.severity,
    automated: true,
    evidence: input.evidence,
    recommendation: input.recommendation,
  };
  const finding_hash = computeFindingHash(payload);
  return {
    id: input.invariant, // 沿不变量编号作 id(brainstorm M-2 dedup)
    resolved: false,
    finding_hash,
    ...payload,
  };
}

/** 统计 tasks.md 中 task 数量(沿 plan-9j parseTasks 同模式) */
function countTasksInTasksMd(changeRoot: string): number {
  const tasksPath = join(changeRoot, 'tasks.md');
  if (!existsSync(tasksPath)) return 0;
  const content = readFileSync(tasksPath, 'utf8');
  // 简单 count `- [ ]` 或 `- [x]`(沿 plan-9j parseTasks 同模式)
  const matches = content.match(/^\s*- \[[ x]\]/gm);
  return matches?.length ?? 0;
}
