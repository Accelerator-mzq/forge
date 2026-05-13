// src/core/archive/fence.ts — plan-9a §9 立 stub framework + plan-9g 填实
// 13 → 14 不变量(brainstorm spec v6 加不变量 14 green↞HEAD)
// 9g 替换 stub 为真实分发:field fence(同步)+ rerun fence(async,Task 6)

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseConfig } from '../parse/index.js';
import { validateProcessVerificationConfig } from '../schema/process-verification-config.js';
import type { ForgeConfig } from '../schema/types.js';
import {
  buildProcessEvidenceFenceContext,
  runFieldFence,
  parseSemverMajor,
} from './process-evidence-fence.js';
import type {
  ProcessEvidenceFenceContext,
  ProcessEvidenceFinding,
} from './process-evidence-fence.js';
// plan-9g Task 6:rerun fence top-level import(偏离 plan §7.1.2 dynamic import 字面;
// 沿 Task 5 top-level import 一致性 — dynamic import 影响测试性能且 Task 5 已统一 top-level)
import { runRerunFence } from './process-evidence-rerun.js';

/** 单个不变量的检查结果(plan-9e2 v2 codex 一轮 MAJOR 修订:加 status 4 态 enum) */
export interface FenceInvariantResult {
  invariant: string;
  /** plan-9g 现有字段,保留 backwards-compat;不变式 status === 'fail' ⟺ ok === false */
  ok: boolean;
  /** plan-9e2 新增 4 态 status;优先级 fail > legacy-skip > warning > pass */
  status: 'pass' | 'warning' | 'fail' | 'legacy-skip';
  reason: string;
}

/** fence 整体检查结果 */
export interface FenceCheckResult {
  ok: boolean;
  results: FenceInvariantResult[];
  /** 9g 完成后 permanent 0;legacy 兼容字段保留 */
  notImplementedCount: number;
}

/** fence 调用选项(9g 删 allowStubFence;签名 backward-compat 保留可选字段) */
export interface FenceCheckOptions {
  /** @deprecated plan-9g 已填实,本字段无效;保留兼容旧调用 */
  allowStubFence?: boolean;
}

/** 14 不变量名(brainstorm v6 加第 14 个) */
export const FENCE_INVARIANT_NAMES = [
  'fence-1',
  'fence-2',
  'fence-3',
  'fence-4',
  'fence-5',
  'fence-6',
  'fence-7',
  'fence-8',
  'fence-9',
  'fence-10',
  'fence-11',
  'fence-12',
  'fence-13',
  'fence-14', // plan-9g brainstorm v6 Codex 一轮 BLOCKER-2:green ↞ HEAD ancestor
] as const;

export type FenceInvariantName = (typeof FENCE_INVARIANT_NAMES)[number];

/**
 * plan-9e2 v2 codex 一轮 MAJOR 修订:legacy 路径下被精确豁免的 invariant 编号集合
 * 沿 master §3.4.4.1:14 不变量中 #1-8/10/13 跳过(共 10 个),#9/11/12/14 保留校验
 *
 * 导出供测试断言用(`expect(LEGACY_EXEMPT_INVARIANTS.size).toBe(10)`)
 * + summary builder buildProcessEvidenceSummary reference(但不直接用,通过 status='legacy-skip' 折数)
 */
export const LEGACY_EXEMPT_INVARIANTS: ReadonlySet<number> = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 10, 13,
]);

/**
 * 横切 fence 检查入口(plan-9g 填实)
 *
 * 流程:
 *   1. 从 changeRoot 读 .verify-passed + .review-passed marker
 *   2. buildProcessEvidenceFenceContext 一次读全(marker / staging / ack-log / tasks / HEAD)
 *   3. runFieldFence(ctx)— 不变量 1-4/8/9/11/12/14 同步
 *   4. await runRerunFence(ctx)— 不变量 5/6/13(worktree 重跑;Task 6 实施)
 *   5. CRITICAL → fence.ok=false → archive 拒签 exit 1
 *
 * @param changeRoot change 目录绝对路径
 * @param _options FenceCheckOptions(allowStubFence 已无效,保留签名兼容)
 */
export async function crossCuttingFenceCheck(
  changeRoot: string,
  _options: FenceCheckOptions = {},
): Promise<FenceCheckResult> {
  // 注:options.allowStubFence 已 deprecated;实际不影响 fence 行为(plan-9g 填实)
  //     保留 parameter signature 兼容 archive.ts 旧调用代码

  // 1. 从 changeRoot 读 marker(内部读取,不由 caller 传入 — 沿 plan-9a API)
  const verifyPath = join(changeRoot, '.verify-passed');
  const reviewPath = join(changeRoot, '.review-passed');
  let verifyMarker: Record<string, unknown> = {};
  try {
    verifyMarker = parseYaml(await readFile(verifyPath, 'utf8')) as Record<string, unknown>;
  } catch {
    // verify marker 不存在 → 视为 legacy / pre-9g,fence 不强制(沿 superset additive)
    return { ok: true, results: [], notImplementedCount: 0 };
  }

  // v1 修订 Codex 一轮 M-4:读 review marker(若存在)
  let reviewMarker: Record<string, unknown> | undefined;
  try {
    if (existsSync(reviewPath)) {
      const reviewContent = await readFile(reviewPath, 'utf8');
      reviewMarker = parseYaml(reviewContent) as Record<string, unknown>;
    }
  } catch {
    reviewMarker = undefined; // review marker 缺等价 verify-only 流程(已被 archive 主路径处理)
  }

  // changeId 从 changeRoot 末段推导
  const changeId = changeRoot.split(/[/\\]/).pop() ?? 'unknown';
  // project root: changeRoot 上溯两级(forge/changes/<id> → project)
  const projectRoot = dirname(dirname(dirname(changeRoot)));

  // **v2 修订 Codex 二轮 B-3**:legacyExempt 读 marker 内 `process_evidence_unavailable_legacy: true` 标志
  //   (plan-9j --resign-markers 写入;沿 master spec §3.4.4.1)
  const legacyExempt =
    (verifyMarker.process_evidence_unavailable_legacy as boolean | undefined) === true;

  // v7 Codex 七轮 BLOCKER 1:读 forge/config.yaml + sanitize ProcessVerification 配置
  let forgeConfig: ForgeConfig | undefined;
  const configPath = join(projectRoot, 'forge', 'config.yaml');
  try {
    if (existsSync(configPath)) {
      forgeConfig = parseConfig(await readFile(configPath, 'utf8'));
    }
  } catch {
    forgeConfig = undefined; // 缺 config 走默认
  }
  const sanitizedConfig = validateProcessVerificationConfig(forgeConfig);
  // v8 Codex 八轮 BLOCKER:test config 从 forgeConfig.test 取(沿 §6 brainstorm spec)
  const testConfig = {
    reporter: (forgeConfig?.test?.reporter ?? 'junit') as 'junit' | 'tap' | 'vitest-json',
    test_command: forgeConfig?.test?.test_command ?? 'pnpm test',
  };

  const ctx = await buildProcessEvidenceFenceContext({
    changeId,
    changeRoot,
    cwd: projectRoot,
    verifyMarker,
    reviewMarker, // v1 M-4
    legacyExempt, // v1 B-3
    config: sanitizedConfig, // v7 Codex 七轮 BLOCKER 1
    testConfig, // v8 Codex 八轮 BLOCKER
  });

  // 2. runFieldFence(同步)
  const fieldFindings = runFieldFence(ctx);

  // 3. **v3 修订(Codex 三轮 M-1)**:fence 对 verify + review 各跑 process_evidence 校验
  //    含 review 侧 bypass 检测(review marker 存在但缺 process_evidence 也 CRITICAL)
  //    沿 brainstorm spec §5.1 五源 cross-check;finding source 字段区分 verify / review
  // plan-9e2 v2 quality fix I-1:reviewLegacyExempt 提到 if block 之前统一声明
  //   bypass 检测(block 内)+ mapper 并集(step 5)共用同一变量,避免重复声明
  const reviewLegacyExempt =
    (reviewMarker?.process_evidence_unavailable_legacy as boolean | undefined) === true;
  const reviewFindings: ProcessEvidenceFinding[] = [];
  if (reviewMarker) {
    // review 侧 bypass 检测(对称 verify 侧 B-3,v3 修订 Codex 三轮 M-1):
    //   review marker 含 v1.0 marker version 标志(`created_by_tool_version >= 1.0.0`)
    //   且无 legacy_exempt → 必须含 process_evidence;否则 CRITICAL
    const reviewMarkerVersion = reviewMarker.created_by_tool_version as string | undefined;
    const reviewIsV10Native = reviewMarkerVersion
      ? parseSemverMajor(reviewMarkerVersion) >= 1
      : false;
    if (!ctx.reviewProcessEvidence) {
      if (reviewIsV10Native && !reviewLegacyExempt) {
        reviewFindings.push({
          invariant: 9,
          severity: 'CRITICAL',
          message:
            '[review] v1.0 marker missing process_evidence — 必须走 forge evidence freeze --kind review',
        });
      }
    } else {
      // 构造 review-side ctx(processEvidence 替换为 reviewProcessEvidence)
      const reviewCtx: ProcessEvidenceFenceContext = {
        ...ctx,
        processEvidence: ctx.reviewProcessEvidence,
        markerStagingHash: ctx.reviewMarkerStagingHash,
        markerAckLogTailHash: ctx.reviewMarkerAckLogTailHash,
        markerAckLogEntryCount: ctx.reviewMarkerAckLogEntryCount,
      };
      const reviewSideFindings = runFieldFence(reviewCtx);
      // 标 source='review' 区分
      for (const f of reviewSideFindings) {
        reviewFindings.push({ ...f, message: `[review] ${f.message}` });
      }
    }
  }

  // 4. runRerunFence(async,Task 6 启用;不变量 5/6/13 worktree 重跑)
  const rerunFindings = await runRerunFence(ctx);

  // 5. 汇合 + 输出 FenceCheckResult(verify + review + rerun;v2 M-1 加 reviewFindings)
  // plan-9e2 v2 codex 一轮 MAJOR 修订:同时筛 CRITICAL + WARNING + 取 verify||review legacy 并集
  const allFindings = [...fieldFindings, ...reviewFindings, ...rerunFindings];

  // plan-9e2 v2 codex 一轮 MAJOR 修订:legacyExempt 取 verify || review 并集
  // 沿 fence.ts:115/153-164 当前已两源独立读约定;v1.0 精度损失 = 无法区分 verify-only / review-only legacy
  // quality fix I-1:reviewLegacyExempt 已在上方 step 3 之前统一声明,此处复用
  const effectiveLegacyExempt = legacyExempt || reviewLegacyExempt;

  const results = mapFindingsToResults({
    findings: allFindings,
    effectiveLegacyExempt,
  });
  const ok = !results.some((r) => r.status === 'fail');

  return {
    ok,
    results,
    notImplementedCount: 0, // 9g 完成,permanent 0
  };
}

/**
 * mapFindingsToResults — 14 不变量 finding → FenceInvariantResult[14] 纯函数 mapper
 *
 * plan-9e2 v2 codex 一轮 MAJOR 修订:从内联代码提取为纯函数(沿 plan-9d / 9j 同模式),便于单元测试
 *
 * 优先级:fail > legacy-skip > warning > pass
 *   1. 任一 invariant 有 CRITICAL → status='fail' / ok=false
 *   2. legacy 路径下被豁免 invariant(在 LEGACY_EXEMPT_INVARIANTS 集合内)→ status='legacy-skip' / ok=true
 *   3. 任一 invariant 有 WARNING(未被前两级覆盖)→ status='warning' / ok=true
 *   4. 默认 → status='pass' / ok=true
 *
 * 精度损失:legacy 路径下被豁免 invariant 即使产 WARNING 也被吞为 'legacy-skip',不计入 warning
 *           (沿 brainstorm spec §4.3 副作用,v1.0 接受,v1.1+ side-aware 拆分)
 */
export function mapFindingsToResults(opts: {
  findings: readonly ProcessEvidenceFinding[];
  effectiveLegacyExempt: boolean;
}): FenceInvariantResult[] {
  const { findings, effectiveLegacyExempt } = opts;
  const criticalFindings = findings.filter((f) => f.severity === 'CRITICAL');
  const warningFindings = findings.filter((f) => f.severity === 'WARNING');

  return FENCE_INVARIANT_NAMES.map<FenceInvariantResult>((name) => {
    const inv = parseInt(name.replace('fence-', ''), 10);
    // 1. fail 最高优先级
    const fail = criticalFindings.find((f) => f.invariant === inv);
    if (fail) {
      return { invariant: name, ok: false, status: 'fail', reason: fail.message };
    }
    // 2. legacy-skip 次优先(legacy 路径下被豁免 invariant 不论是否产 WARNING 均标 skip)
    if (effectiveLegacyExempt && LEGACY_EXEMPT_INVARIANTS.has(inv)) {
      return {
        invariant: name,
        ok: true,
        status: 'legacy-skip',
        reason: 'legacy-exempt per master §3.4.4.1',
      };
    }
    // 3. warning 次次优先(沿 design §2.7.3 #7/#10/#13)
    const warn = warningFindings.find((f) => f.invariant === inv);
    if (warn) {
      return { invariant: name, ok: true, status: 'warning', reason: warn.message };
    }
    // 4. 真过
    return { invariant: name, ok: true, status: 'pass', reason: 'pass' };
  });
}
