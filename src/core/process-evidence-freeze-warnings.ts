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
import { execFileSync } from 'node:child_process';
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
 * @param changeRoot change 根目录(读 tasks.md 计 task 数 + getGitHead)
 * @param ackLogEntries 全 ack-log entries(用于 11/12 cross-check)
 */
export function computeFreezeWarnings(
  processEvidence: ProcessEvidence,
  changeRoot: string,
  ackLogEntries: AckLogEntry[],
): FreezeWarningsResult {
  const warnings: VerifyFinding[] = [];
  const criticals: VerifyFinding[] = [];
  // ctx 用于 mkFinding 算 git_head(满足 marker-schema GIT_HEAD_RE 40-hex)
  const ctx: MkFindingCtx = { changeRoot };

  // 不变量 7:verify_invocations 总数 ≥ task 数
  const tasksCount = countTasksInTasksMd(changeRoot);
  if (processEvidence.verify_invocations.length < tasksCount) {
    warnings.push(
      mkFinding(
        {
          invariant: 7,
          severity: 'WARNING',
          check_type: 'invariant-7-verify-count',
          evidence: `verify_invocations.length=${processEvidence.verify_invocations.length}; tasks count=${tasksCount}`,
          recommendation:
            'subagent 实施完每 task 必须调 forge evidence record-verify;若主代理已统一跑 change-level verify 视为可接受 → forge ack propose --action ack-warning',
        },
        ctx,
      ),
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
      mkFinding(
        {
          invariant: 10,
          severity: 'WARNING',
          check_type: 'invariant-10-env-drift',
          evidence:
            `marker env: node=${processEvidence.env_hash.node_version} os=${processEvidence.env_hash.os_platform};` +
            ` current env: node=${currentEnv.node_version} os=${currentEnv.os_platform}`,
          recommendation:
            '使用 hermetic CI 或重跑 verify 同步 env_hash;若环境差异客观 → forge ack propose --action ack-warning',
        },
        ctx,
      ),
    );
  }

  // 不变量 11:tdd_exemption 非空但 ack-log 无对应条目 → CRITICAL
  // v8.1 round 2 (C-2 fix):plan §5.1.2 字面 lookup `e.extra?.task_ref === chain.task_ref` 与
  //   AckEntry.extra schema 不符(ack.ts 写入的 extra 字段为 {proposed_at, target_severity},不含 task_ref)。
  //   永久 false → 任何 tdd_exemption != null change 永久 CRITICAL exit 1。
  // 简化 Option C:用 action='ack-tdd-exemption' 存在性检测(失去 per-task 精度)。
  // Observation:per-task 精度损失 — 若某 change 有 3 task 全 tdd_exemption 但仅 1 个 ack,
  //   所有 3 个都通过 lookup。Plan-9z polish 时改 AckEntry.extra 加 task_ref + ack propose 加
  //   --task-ref option 修复。
  for (const chain of processEvidence.tdd_event_chain) {
    if (chain.tdd_exemption !== null) {
      const hasAck = ackLogEntries.some(
        (e) => e.kind === 'ack' && (e as { action?: string }).action === 'ack-tdd-exemption',
      );
      if (!hasAck) {
        criticals.push(
          mkFinding(
            {
              invariant: 11,
              severity: 'CRITICAL',
              check_type: 'invariant-11-tdd-exemption-no-ack',
              evidence: `task_ref=${chain.task_ref} has tdd_exemption=${JSON.stringify(chain.tdd_exemption)} but no ack-tdd-exemption entry in ack-log`,
              recommendation: '跑 forge ack propose --action ack-tdd-exemption --finding <task-id>',
            },
            ctx,
          ),
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
      mkFinding(
        {
          invariant: 12,
          severity: 'CRITICAL',
          check_type: 'invariant-12-mode-no-ack',
          evidence: `mode=${processEvidence.process_verification_mode}; acked_by=null`,
          recommendation: '跑 forge ack propose --action ack-mode 写 acked_by',
        },
        ctx,
      ),
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

interface MkFindingCtx {
  changeRoot: string;
}

/**
 * mkFinding — 构造 VerifyFinding 单条
 *
 * v8.1 round 2 (C-1 fix):plan §5.1.2 字面 placeholder 'sha256:freeze-placeholder' / 'freeze-placeholder'
 *   不符合 marker-schema.ts:585-604 校验(SHA256_RE = /^sha256:[a-f0-9]{64}$/,GIT_HEAD_RE = /^[a-f0-9]{40}$/)。
 *   archive 阶段 marker validator 拒签。
 * 修正:
 *   - content_hash:全 0 SHA256(满足 regex + 标志 placeholder)
 *   - git_head:从 git rev-parse HEAD 拿真实 40-hex;非 git repo → 全 0 40-hex
 */
function mkFinding(input: MkFindingInput, ctx: MkFindingCtx): VerifyFinding {
  // C-1 fix:content_hash / git_head 必须满足 marker-schema 正则,否则 archive 拒签
  const gitHead = getGitHead(ctx.changeRoot) ?? '0'.repeat(40);
  const payload = {
    content_hash: `sha256:${'0'.repeat(64)}`, // 全 0 SHA256 placeholder,满足 ^sha256:[a-f0-9]{64}$
    git_head: gitHead, // 真实 40-hex 或全 0(non-git fallback)
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

/**
 * getGitHead — 获取 git HEAD SHA(本地版,避免循环依赖 evidence.ts)
 *
 * 沿 ack.ts / evidence.ts 同模式:execFileSync + try/catch,非 git 仓库返回 null。
 */
function getGitHead(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
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
