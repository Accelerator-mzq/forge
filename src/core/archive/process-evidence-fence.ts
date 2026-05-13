// src/core/archive/process-evidence-fence.ts — plan-9g Task 5.1
// process_evidence fence 字段类不变量(1-4 / 8 / 9 / 11 / 12 / 14)
// brainstorm spec §3 不变量表 + §7 archive 集成 + §9.13 不变量 14 实施
//
// 关键设计:
//   - 同步执行(纯字段 + git ancestor execFileSync,无 worktree 重跑)
//   - 五源 cross-check(不变量 9):marker / staging / ack-log content / ack-log chain / tail+count
//   - 不变量 14(brainstorm v6 加):green_commit.sha ↞ archive HEAD ancestor
//   - WARNING 7/10 已在 freeze-time 写 marker.verify_findings(本 fence 不重复;仅检 CRITICAL)
//
// (runRerunFence 5/6/13 见 process-evidence-rerun.ts,Task 6)

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ProcessEvidence, TddEventChain } from '../schemas/process-evidence.js';
import type { AckLogEntry, EvidenceHelperEntry } from '../ack-log.js';
import { readAllAckLogEntries, verifyAckLogChain } from '../ack-log.js';
import { canonicalHash } from '../canonical-json.js';

/** ProcessEvidenceFenceContext — fence ctx 一次性读全(避免重复 IO) */
export interface ProcessEvidenceFenceContext {
  changeId: string;
  changeRoot: string;
  cwd: string;
  /** marker.process_evidence(可能 undefined — legacy marker / 缺 freeze) */
  processEvidence: ProcessEvidence | undefined;
  /** marker.process_evidence_staging_hash 快照(可能 undefined) */
  markerStagingHash: string | undefined;
  /** marker.ack_log_tail_hash + entry_count 快照 */
  markerAckLogTailHash: string | undefined;
  markerAckLogEntryCount: number | undefined;
  /** marker.created_by_tool_version(plan-9j 写入);v1 修订 Codex 一轮 B-3 用 */
  markerCreatedByToolVersion: string | undefined;
  /** legacy 豁免标记(plan-9j legacy-exemption.ts 写;v1 修订 Codex 一轮 B-3 用) */
  legacyExempt: boolean;
  /** 实际 staging.yaml 内 staging_hash(若文件存在);用于与 marker 快照 cross-check */
  actualStagingHash: string | undefined;
  /** 全 JSONL ack-log entries(任何 kind) */
  ackLogEntries: AckLogEntry[];
  /** evidence-helper projection(子集,用于不变量 9 内容 hash 比对) */
  helperEntries: EvidenceHelperEntry[];
  /** tasks.md 计数(不变量 7 用,WARNING 已 freeze-time 处理;本 fence 不再算) */
  tasksCount: number;
  /** archive HEAD sha(不变量 14 用) */
  archiveHead: string | null;
  /** process.env.CI === 'true' */
  isCiMode: boolean;
  /** ForgeConfig.process_verification sanitize 后的完整配置(v7 修订 Codex 七轮 BLOCKER 1) */
  config: {
    mode: 'full' | 'sample' | 'hash-only';
    sample_ratio: number;
    test_timeout_per_task: number; // 秒(runRerunFence 转毫秒用)
    max_parallel_reruns: number;
  };
  /** ForgeConfig.test sanitize 后(v8 修订 Codex 八轮 BLOCKER:runRerunFence 真读) */
  testConfig: {
    reporter: 'junit' | 'tap' | 'vitest-json';
    test_command: string;
  };
  /**
   * v1 修订 Codex 一轮 M-4:加 reviewMarker 字段
   *  review marker 也含 process_evidence + 三 hash 字段(--kind review freeze 写);
   *  fence 跑两套校验(verify 和 review 各自的 process_evidence)
   */
  reviewMarker?: Record<string, unknown>;
  reviewProcessEvidence?: ProcessEvidence;
  reviewMarkerStagingHash?: string;
  reviewMarkerAckLogTailHash?: string;
  reviewMarkerAckLogEntryCount?: number;
}

/** ProcessEvidenceFinding — fence 输出 finding 项 */
export interface ProcessEvidenceFinding {
  /** 1..14 */
  invariant: number;
  /** CRITICAL | WARNING(本 fence 主要返 CRITICAL;WARNING 已 freeze-time 处理) */
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  taskRef?: string;
}

/**
 * parseSemverMajor — 取 semver 字符串的 major 部分(v3 修订 Codex 三轮 B-1)
 * 沿 plan-9j src/core/archive/version-retrograde-fence.ts parseSemver 模式但仅返 major
 *
 * @param v semver 字符串(如 "1.0.0" / "0.4.0-beta.1+build.5")
 * @returns major 数字(无法解析返 0)
 */
function parseSemverMajor(v: string): number {
  const m = v.match(/^(\d+)\./);
  return m ? parseInt(m[1] ?? '0', 10) : 0;
}

/**
 * seededSample — deterministic 抽样 N 个元素(v8 修订 Codex 八轮 BLOCKER)
 * 用 seed(changeId)生成可重现 PRNG → Fisher-Yates 部分洗牌 → 取前 N
 * 沿 mulberry32 简洁 PRNG(无外部依赖)
 *
 * @param items 全集数组
 * @param n 抽样数量(若 > items.length 返全集)
 * @param seed 字符串 seed(用 changeId 保 fence 可重现)
 * @returns 抽样后的子集(保留原顺序由 seed 决定,跨平台 deterministic)
 */
export function seededSample<T>(items: T[], n: number, seed: string): T[] {
  if (n >= items.length) return [...items];
  // 字符串 seed → 32-bit hash
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // mulberry32 PRNG state
  let state = hash >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Fisher-Yates 洗牌 + 取前 n
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    // noUncheckedIndexedAccess:用 non-null assertion 因为 i/j 在合法范围内
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr.slice(0, n);
}

/**
 * buildProcessEvidenceFenceContext — fence 入口,一次读全(brainstorm spec §7.2)
 *
 * v1 修订(Codex 一轮 M-4):接收 verifyMarker + reviewMarker 双参数
 *   review marker 也含 process_evidence(--kind review freeze 写),fence 跑两套校验
 */
export async function buildProcessEvidenceFenceContext(args: {
  changeId: string;
  changeRoot: string;
  cwd: string;
  verifyMarker: Record<string, unknown>; // 已 parseYaml 的 .verify-passed
  reviewMarker?: Record<string, unknown>; // 已 parseYaml 的 .review-passed(可选;legacy marker / verify-only 流程可能缺)
  legacyExempt?: boolean; // plan-9j legacy-exemption 调用方传入(v1 修订 Codex 一轮 B-3)
  config: ProcessEvidenceFenceContext['config']; // v7 Codex 七轮 BLOCKER 1:caller 必须传入 sanitize 配置
  testConfig: ProcessEvidenceFenceContext['testConfig']; // v8 Codex 八轮 BLOCKER
}): Promise<ProcessEvidenceFenceContext> {
  const { changeId, changeRoot, cwd, verifyMarker, reviewMarker, legacyExempt } = args;

  // 读 verifyMarker 4 字段
  const processEvidence = verifyMarker.process_evidence as ProcessEvidence | undefined;
  const markerStagingHash = verifyMarker.process_evidence_staging_hash as string | undefined;
  const markerAckLogTailHash = verifyMarker.ack_log_tail_hash as string | undefined;
  const markerAckLogEntryCount = verifyMarker.ack_log_entry_count as number | undefined;
  const markerCreatedByToolVersion = verifyMarker.created_by_tool_version as string | undefined;

  // v1 修订:读 reviewMarker 同 4 字段(M-4)
  const reviewProcessEvidence = reviewMarker?.process_evidence as ProcessEvidence | undefined;
  const reviewMarkerStagingHash = reviewMarker?.process_evidence_staging_hash as string | undefined;
  const reviewMarkerAckLogTailHash = reviewMarker?.ack_log_tail_hash as string | undefined;
  const reviewMarkerAckLogEntryCount = reviewMarker?.ack_log_entry_count as number | undefined;

  // 读 staging.yaml(若存在)
  const stagingPath = join(changeRoot, '.evidence', 'process-evidence.staging.yaml');
  let actualStagingHash: string | undefined;
  if (existsSync(stagingPath)) {
    const staging = parseYaml(readFileSync(stagingPath, 'utf8')) as { staging_hash?: string };
    actualStagingHash = staging.staging_hash;
  }

  // 读全 ack-log + 过滤 evidence-helper projection
  const ackLogEntries = await readAllAckLogEntries(changeRoot);
  const helperEntries = ackLogEntries.filter(
    (e) => e.kind === 'evidence-helper',
  ) as EvidenceHelperEntry[];

  // 计算 tasks count
  const tasksPath = join(changeRoot, 'tasks.md');
  let tasksCount = 0;
  if (existsSync(tasksPath)) {
    const content = readFileSync(tasksPath, 'utf8');
    const matches = content.match(/^\s*- \[[ x]\]/gm);
    tasksCount = matches?.length ?? 0;
  }

  // 取 archive HEAD(不变量 14;非 git 时 null)
  let archiveHead: string | null = null;
  try {
    archiveHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    archiveHead = null;
  }

  return {
    changeId,
    changeRoot,
    cwd,
    processEvidence,
    markerStagingHash,
    markerAckLogTailHash,
    markerAckLogEntryCount,
    markerCreatedByToolVersion, // v1 Codex B-3
    legacyExempt: legacyExempt ?? false, // v1 Codex B-3(caller 传入,默认 false)
    actualStagingHash,
    ackLogEntries,
    helperEntries,
    tasksCount,
    archiveHead,
    isCiMode: process.env.CI === 'true',
    config: args.config, // v7 Codex 七轮 BLOCKER 1
    testConfig: args.testConfig, // v8 Codex 八轮 BLOCKER
    // v1 Codex M-4:review marker 字段
    reviewMarker,
    reviewProcessEvidence,
    reviewMarkerStagingHash,
    reviewMarkerAckLogTailHash,
    reviewMarkerAckLogEntryCount,
  };
}

/**
 * runFieldFence — 跑字段类不变量 1-4 / 8 / 9 / 11 / 12 / 14
 *
 * 注:不变量 7(verify_invocations 计数)+ 10(env_hash)是 WARNING,已在 freeze-time
 *   写 marker.verify_findings;archive 阶段不重复(沿 brainstorm spec §3 两段闭合)
 *
 * @param ctx buildProcessEvidenceFenceContext 返回
 * @returns ProcessEvidenceFinding[]
 */
export function runFieldFence(ctx: ProcessEvidenceFenceContext): ProcessEvidenceFinding[] {
  const findings: ProcessEvidenceFinding[] = [];

  // **v1 修订(Codex 一轮 B-3 修复)**:挡 AI 绕过 helper + 不写 staging + 不调 freeze 的 bypass 路径
  //   规则:created_by_tool_version >= 1.0.0 且无 process_evidence_unavailable_legacy 标记 →
  //         必须含 process_evidence(沿 plan-9j legacy-exemption 反向加固)
  if (!ctx.processEvidence) {
    const isLegacy = ctx.legacyExempt === true; // v1 新增 ctx 字段,沿 plan-9j legacy-exemption.ts 标记
    const isV10Native = ctx.markerCreatedByToolVersion
      ? parseSemverMajor(ctx.markerCreatedByToolVersion) >= 1
      : false;
    if (isV10Native && !isLegacy) {
      // v1.0 原生 marker 必须含 process_evidence
      findings.push({
        invariant: 9,
        severity: 'CRITICAL',
        message:
          'v1.0 marker missing process_evidence — 必须走 forge evidence record-tdd/verify/review + forge evidence freeze;不允许绕过 helper 直接写 marker',
      });
    } else if (ctx.actualStagingHash) {
      // staging 存在但 marker 缺 process_evidence → freeze 未跑
      findings.push({
        invariant: 9,
        severity: 'CRITICAL',
        message: 'staging.yaml exists but marker has no process_evidence (freeze missing)',
      });
    }
    // legacy marker 路径(plan-9j legacy-exemption 已处理 13 不变量豁免)→ 9g 不强制
    return findings;
  }

  // 不变量 1:red_commit.timestamp < green_commit.timestamp
  // round 2 (M-1):区分 "timestamp invalid format" vs "timestamp reverse order"
  //   NaN < NaN === false 会落入原 `!(redTs < greenTs)` 分支但 message 不清晰
  for (const chain of ctx.processEvidence.tdd_event_chain) {
    if (chain.red_commit && chain.green_commit) {
      const redTs = Date.parse(chain.red_commit.timestamp);
      const greenTs = Date.parse(chain.green_commit.timestamp);
      if (Number.isNaN(redTs) || Number.isNaN(greenTs)) {
        findings.push({
          invariant: 1,
          severity: 'CRITICAL',
          message: `invalid timestamp format: red="${chain.red_commit.timestamp}" green="${chain.green_commit.timestamp}"`,
          taskRef: chain.task_ref,
        });
      } else if (!(redTs < greenTs)) {
        findings.push({
          invariant: 1,
          severity: 'CRITICAL',
          message: `red timestamp (${chain.red_commit.timestamp}) not before green (${chain.green_commit.timestamp})`,
          taskRef: chain.task_ref,
        });
      }
    }
  }

  // 不变量 2:red_commit.sha 是 green_commit.sha 祖先
  for (const chain of ctx.processEvidence.tdd_event_chain) {
    if (chain.red_commit && chain.green_commit) {
      try {
        execFileSync(
          'git',
          ['merge-base', '--is-ancestor', chain.red_commit.sha, chain.green_commit.sha],
          { cwd: ctx.cwd, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        // exit 0 → 是祖先
      } catch {
        findings.push({
          invariant: 2,
          severity: 'CRITICAL',
          message: `red ${chain.red_commit.sha} is not ancestor of green ${chain.green_commit.sha}`,
          taskRef: chain.task_ref,
        });
      }
    }
  }

  // 不变量 3:RED exit_code != 0
  for (const chain of ctx.processEvidence.tdd_event_chain) {
    if (chain.red_commit && chain.red_commit.exit_code === 0) {
      findings.push({
        invariant: 3,
        severity: 'CRITICAL',
        message: `RED commit exit_code is 0 (must be != 0)`,
        taskRef: chain.task_ref,
      });
    }
  }

  // 不变量 4:GREEN exit_code == 0
  for (const chain of ctx.processEvidence.tdd_event_chain) {
    if (chain.green_commit.exit_code !== 0) {
      findings.push({
        invariant: 4,
        severity: 'CRITICAL',
        message: `GREEN commit exit_code is ${chain.green_commit.exit_code} (must be 0)`,
        taskRef: chain.task_ref,
      });
    }
  }

  // 不变量 8:subagent_review_chain 顺序合理(每对 reviewer commit ancestor + timestamp 链)
  // 简化版:reviewer_commit 必须是 implementer_commit 的后代;后续 reviewer 必须是前一个后代
  for (const review of ctx.processEvidence.subagent_review_chain) {
    let prevCommit = review.implementer_commit;
    const allIterations = [
      ...review.spec_reviewer_iterations,
      ...review.quality_reviewer_iterations,
    ];
    for (const iter of allIterations) {
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', prevCommit, iter.reviewer_commit], {
          cwd: ctx.cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        prevCommit = iter.reviewer_commit;
      } catch {
        findings.push({
          invariant: 8,
          severity: 'CRITICAL',
          message: `reviewer commit ${iter.reviewer_commit} not descendant of ${prevCommit}`,
          taskRef: review.task_ref,
        });
        break;
      }
    }
  }

  // 不变量 9:五源 cross-check(brainstorm spec §5.1 矩阵)
  //   marker_hash = canonicalHash(marker.process_evidence)
  //   stagingHash = actualStagingHash(staging.yaml 内 staging_hash)
  //   ackLogProjectionHash = canonicalHash(evidence-helper 还原三数组)
  //   ack-log chain + tail/count 校验(verifyAckLogChain)
  {
    // 子检 9.1:marker.process_evidence_staging_hash 与实际 staging.yaml hash 一致
    if (ctx.markerStagingHash !== ctx.actualStagingHash) {
      findings.push({
        invariant: 9,
        severity: 'CRITICAL',
        message: `marker.process_evidence_staging_hash (${ctx.markerStagingHash ?? 'null'}) mismatch with actual staging_hash (${ctx.actualStagingHash ?? 'null'})`,
      });
    }

    // 子检 9.2:evidence-helper projection 还原三数组 hash 与 marker.process_evidence 一致
    // 注:helper entries 含 record-tdd/record-verify/record-review/freeze;
    //     reconstructProjectionFromAckLog 已 v2 修订完整 inline 伪代码 + 3 projection type alias;
    //     Task 3.3 evidence helper payload schema 落地后,实施者按 payload 字段对齐 entry.extra 解析细节
    const projectionFromAckLog = reconstructProjectionFromAckLog(ctx.helperEntries);
    const projectionHashFromAckLog = canonicalHash(projectionFromAckLog);
    const projectionFromMarker = {
      tdd_event_chain: ctx.processEvidence.tdd_event_chain,
      verify_invocations: ctx.processEvidence.verify_invocations,
      subagent_review_chain: ctx.processEvidence.subagent_review_chain,
    };
    const projectionHashFromMarker = canonicalHash(projectionFromMarker);
    if (projectionHashFromAckLog !== projectionHashFromMarker) {
      findings.push({
        invariant: 9,
        severity: 'CRITICAL',
        message: `marker projection hash (${projectionHashFromMarker.slice(0, 16)}...) mismatch with ack-log projection (${projectionHashFromAckLog.slice(0, 16)}...)`,
      });
    }

    // 子检 9.3:全 JSONL chain + tail + count 校验(verifyAckLogChain)
    const chainResult = verifyAckLogChain(
      ctx.ackLogEntries,
      ctx.markerAckLogTailHash ?? null,
      ctx.markerAckLogEntryCount ?? null,
    );
    if (!chainResult.ok) {
      findings.push({
        invariant: 9,
        severity: 'CRITICAL',
        message: `ack-log chain verification failed: ${chainResult.reason ?? 'unknown'}`,
      });
    }
  }

  // 不变量 11:tdd_exemption 非空时 ack-log 含 ack-tdd-exemption 条目
  // Observation:沿 Task 4 round 2 Option C 简化 — 仅检 action 存在性,不做 per-task task_ref 精度匹配
  //   per-task 精度损失是已知 trade-off,plan-9z polish 阶段可加回 extra.task_ref 对比
  //
  // round 2 (M-2) 安全防护边界说明:
  //   Option C 不查 extra.task_ref 看似可被"手写一条伪造 ack entry 蒙混过关",但实际安全防线在
  //   不变量 9.3(verifyAckLogChain)— 全 JSONL 链 prev_entry_hash + tail/count 三重校验。
  //   伪造 ack 必须:
  //     (a) 重写完整 ack-log 链(包含 prev_entry_hash 递推)→ 但 marker.ack_log_tail_hash + entry_count
  //         freeze-time 已固化,与重写后链尾 hash 不匹配 → fence-9.3 拒签
  //     (b) 仅 append → 但 marker 在 freeze 时已固化 entry_count,append 后 count mismatch → fence-9.3 拒签
  //   所以 Option C 在 fence-9.3 防护下仍能保证"至少存在一个合法 ack confirm 写入"语义
  for (const chain of ctx.processEvidence.tdd_event_chain) {
    if (chain.tdd_exemption !== null) {
      // Option C 简化:同 freeze-warnings.ts 模式(去掉 extra.task_ref 比较)
      const hasAck = ctx.ackLogEntries.some(
        (e) => e.kind === 'ack' && (e as { action?: string }).action === 'ack-tdd-exemption',
      );
      if (!hasAck) {
        findings.push({
          invariant: 11,
          severity: 'CRITICAL',
          message: `tdd_exemption set for ${chain.task_ref} but no ack-log entry`,
          taskRef: chain.task_ref,
        });
      }
    }
  }

  // 不变量 12:mode != full 时 acked_by 非空 + CI 拒签
  if (ctx.processEvidence.process_verification_mode !== 'full') {
    if (!ctx.processEvidence.process_verification_mode_acked_by) {
      findings.push({
        invariant: 12,
        severity: 'CRITICAL',
        message: `process_verification_mode=${ctx.processEvidence.process_verification_mode} but acked_by missing`,
      });
    }
    // CI 模式下 mode != full 直接拒签(regardless ack)
    if (ctx.isCiMode) {
      findings.push({
        invariant: 12,
        severity: 'CRITICAL',
        message: `CI mode detected (CI=true) and process_verification_mode=${ctx.processEvidence.process_verification_mode} — CI release gate 拒签 mode != full`,
      });
    }
  }

  // 不变量 14:green_commit.sha ↞ archive HEAD ancestor(brainstorm v6 加,挡旁支造链)
  //  非 git 项目 archiveHead=null → 跳过(brainstorm §9.13)
  if (ctx.archiveHead) {
    for (const chain of ctx.processEvidence.tdd_event_chain) {
      try {
        execFileSync(
          'git',
          ['merge-base', '--is-ancestor', chain.green_commit.sha, ctx.archiveHead],
          { cwd: ctx.cwd, stdio: ['ignore', 'pipe', 'pipe'] },
        );
      } catch {
        findings.push({
          invariant: 14,
          severity: 'CRITICAL',
          message: `green_commit ${chain.green_commit.sha} 不是 archive HEAD ${ctx.archiveHead} 的祖先;旁支造链 + 主分支换实现攻击`,
          taskRef: chain.task_ref,
        });
      }
    }
  }

  return findings;
}

/**
 * reconstructProjectionFromAckLog — 从 evidence-helper entries 还原三数组
 * (v2 修订 Codex 二轮 M-3 + round 2 Critical fix:identity cast 模式)
 *
 * 工作原理:
 *   - Task 5 round 2 起,evidence.ts 三 helper 改为 "payload = staging-built object" 模式
 *     (single source of truth):helper 先构造 staging entry(TddEventChain / VerifyInvocation /
 *     SubagentReviewChain),然后用 entry 字段直接构造 payload。
 *   - 因此 entry.extra(=payload)字段名 + fallback default 与 staging 三数组**完全一致**,
 *     reconstruct 改为 identity cast(无独立 fallback default)。
 *   - 不变量 9.2 用此结果与 marker.process_evidence 三数组算 hash 比对(应严格等)。
 *
 * round 2 fix 历史:
 *   原实现 reconstruct 用 `??` fallback(如 `?? null`)与 payload 的 `?? null` 一致,但
 *   staging 用了不同 fallback(`?? ''` / `?? -1` / `?? new Date()`)→ fence-9.2 永误报。
 *   Critical fix 把 payload 与 staging 对齐为同一对象 → reconstruct 退化为 identity cast。
 *
 * @param entries evidence-helper entries(已 filter kind='evidence-helper';不含 freeze entry)
 * @returns 三数组(与 ProcessEvidence.tdd_event_chain / verify_invocations / subagent_review_chain 同形态)
 */
function reconstructProjectionFromAckLog(entries: EvidenceHelperEntry[]): {
  tdd_event_chain: TddEventChainProjection[];
  verify_invocations: VerifyInvocationProjection[];
  subagent_review_chain: SubagentReviewProjection[];
} {
  const tdd: TddEventChainProjection[] = [];
  const verify: VerifyInvocationProjection[] = [];
  const review: SubagentReviewProjection[] = [];

  for (const entry of entries) {
    if (entry.helper_name === 'freeze') continue; // freeze entry 不参与 projection

    const extra = entry.extra as Record<string, unknown>;
    if (entry.helper_name === 'record-tdd') {
      // Identity cast — payload 字段与 TddEventChain staging entry 完全一致
      // (round 2 Critical fix:evidence.ts payload = staging-built tddEntry 字段)
      tdd.push({
        task_ref: extra.task_ref as string,
        red_commit: extra.red_commit as TddCommitProjection | null,
        green_commit: extra.green_commit as TddCommitProjection,
        tdd_exemption: extra.tdd_exemption as TddExemptionProjection | null,
        tdd_exemption_acked_by: extra.tdd_exemption_acked_by as string | null,
      });
    } else if (entry.helper_name === 'record-verify') {
      // Identity cast — payload 字段与 VerifyInvocation staging entry 完全一致
      verify.push({
        invoked_at: extra.invoked_at as string,
        task_refs: extra.task_refs as string[],
        verify_scope: extra.verify_scope as 'per-task' | 'change-level',
        result: extra.result as 'pass' | 'fail' | 'skip',
        exit_code: extra.exit_code as number,
        log_path: extra.log_path as string,
        log_hash: extra.log_hash as string,
        runner_report_path: extra.runner_report_path as string,
        runner_report_hash: extra.runner_report_hash as string,
      });
    } else if (entry.helper_name === 'record-review') {
      // Identity cast — payload 字段(spec_iterations / quality_iterations / main_check_off_at)
      // 映射到 SubagentReviewChain(spec_reviewer_iterations / quality_reviewer_iterations /
      // main_agent_check_off_at)。payload key 名沿用历史 record-review 字面;
      // 由于 staging 也通过 reviewEntry 中转再装入 payload,两路径仍 identity
      review.push({
        task_ref: extra.task_ref as string,
        implementer_commit: extra.implementer_commit as string,
        spec_reviewer_iterations: extra.spec_iterations as ReviewIterationProjection[],
        quality_reviewer_iterations: extra.quality_iterations as ReviewIterationProjection[],
        main_agent_check_off_at: extra.main_check_off_at as string,
      });
    }
  }

  return { tdd_event_chain: tdd, verify_invocations: verify, subagent_review_chain: review };
}

// 沿 src/core/schemas/process-evidence.ts 字段,但允许 unknown 字段(因为 ack-log entry.extra
//   是 Record<string, unknown>;此处 projection 类型 alias 仅用于 reconstructProjectionFromAckLog)
type TddCommitProjection = Record<string, unknown>;
type TddExemptionProjection = Record<string, unknown>;
type ReviewIterationProjection = Record<string, unknown>;
type TddEventChainProjection = {
  task_ref: string;
  red_commit: TddCommitProjection | null;
  green_commit: TddCommitProjection;
  tdd_exemption: TddExemptionProjection | null;
  tdd_exemption_acked_by: string | null;
};
type VerifyInvocationProjection = {
  invoked_at: string;
  task_refs: string[];
  verify_scope: 'per-task' | 'change-level';
  result: 'pass' | 'fail' | 'skip';
  exit_code: number;
  log_path: string;
  log_hash: string;
  runner_report_path: string;
  runner_report_hash: string;
};
type SubagentReviewProjection = {
  task_ref: string;
  implementer_commit: string;
  spec_reviewer_iterations: ReviewIterationProjection[];
  quality_reviewer_iterations: ReviewIterationProjection[];
  main_agent_check_off_at: string;
};

// 显式 re-export parseSemverMajor 供 fence.ts 使用(review 侧 bypass 检测需要)
export { parseSemverMajor };

// TddEventChain 类型 re-export(仅供模块内类型推断,不污染公共 API)
export type { TddEventChain };
