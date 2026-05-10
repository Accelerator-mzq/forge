// fence.ts — archive 横切 fence 调用入口 (plan-9a §9, plan-9 master §3.1)
// 13 不变量验证由 9g 完整实施;本 plan 期内全部 stub return not_implemented

/** 单个不变量的检查结果 */
export interface FenceInvariantResult {
  invariant: string;
  ok: boolean;
  reason: string;
}

/** fence 整体检查结果 */
export interface FenceCheckResult {
  ok: boolean;
  results: FenceInvariantResult[];
  /** 仅 not_implemented 数量(若开发期 --allow-stub-fence,这些视为 skip) */
  notImplementedCount: number;
}

/** fence 调用选项 */
export interface FenceCheckOptions {
  /** 开发期跳过 not_implemented invariant(release CLI 不应使用) */
  allowStubFence?: boolean;
}

/** 13 不变量名(占位,9g 实施时映射到具体语义) */
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
] as const;

/** fence 不变量名联合类型 */
export type FenceInvariantName = (typeof FENCE_INVARIANT_NAMES)[number];

/**
 * 单不变量 stub — 9g 实施时替换为真实逻辑
 * @param name 不变量名
 */
async function checkInvariantStub(name: FenceInvariantName): Promise<FenceInvariantResult> {
  // 所有 invariant 目前均为占位 stub,返回 not_implemented
  return { invariant: name, ok: false, reason: 'not_implemented' };
}

/**
 * 横切 fence 检查入口
 * @param changeRoot change 目录的绝对路径(9g 实施时各 invariant 会读取该目录)
 * @param options    调用选项(含开发期 allowStubFence 标志)
 */
export async function crossCuttingFenceCheck(
  changeRoot: string,
  options: FenceCheckOptions = {},
): Promise<FenceCheckResult> {
  const results: FenceInvariantResult[] = [];
  let notImplementedCount = 0;

  // 逐一运行 13 个 invariant stub
  for (const name of FENCE_INVARIANT_NAMES) {
    const r = await checkInvariantStub(name);
    if (r.reason === 'not_implemented') notImplementedCount++;
    results.push(r);
  }

  // allowStubFence:把所有 not_implemented 视为 skip(ok:true)
  // 这样开发期可以跳过未实现的 invariant,不阻断归档流程
  const effectiveResults = options.allowStubFence
    ? results.map((r) =>
        r.reason === 'not_implemented' ? { ...r, ok: true, reason: 'skipped:not_implemented' } : r,
      )
    : results;

  return {
    ok: effectiveResults.every((r) => r.ok),
    results: effectiveResults,
    notImplementedCount,
  };
}
