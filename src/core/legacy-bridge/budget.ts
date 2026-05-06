// brownfield 命令 cost 估算 + TTY 倒计时 / 非 TTY --yes 强制 — Plan 7 Phase B1
// spec §4.4:regenerate > $20 时 TTY 5 秒倒计时;非 TTY 拒绝运行 + 提示 --yes flag

import { isatty } from 'node:tty';

/** 估算单次 brownfield LLM 调用平均 cost(USD;单 anchor 复写约 5k input + 3k output token) */
const APPROX_COST_PER_REGEN_PER_ANCHOR_USD = 0.075;
const APPROX_COST_PER_SYNC_CHECK_PER_ANCHOR_USD = 0.012;
const APPROX_COST_PER_INDEX_PER_ANCHOR_USD = 0.005;
const APPROX_COST_PER_MAP_TOTAL_USD = 0.6;
const APPROX_COST_QUALITY_JUDGE_PER_ROLE_USD = 0.06;

/** 默认警告阈值(spec §4.4:regenerate > $20 警告) */
export const REGEN_WARN_USD = 20.0;
export const SYNC_CHECK_WARN_USD = 5.0;

/** 估算 regenerate 全 4 role 全 anchor 总 cost */
export function estimateRegenerateCost(anchorCount: number): number {
  return (
    anchorCount * APPROX_COST_PER_REGEN_PER_ANCHOR_USD + 4 * APPROX_COST_QUALITY_JUDGE_PER_ROLE_USD // 4 role 各跑一次 quality-judge
  );
}

/** 估算 sync-check 一次跑(单 change)cost */
export function estimateSyncCheckCost(affectedAnchorCount: number): number {
  return affectedAnchorCount * APPROX_COST_PER_SYNC_CHECK_PER_ANCHOR_USD;
}

/** 估算 index 一次跑(全 anchor)cost */
export function estimateIndexCost(anchorCount: number): number {
  return anchorCount * APPROX_COST_PER_INDEX_PER_ANCHOR_USD;
}

/** 估算 map 一次跑 cost(LLM 扫 docs+src) */
export function estimateMapCost(): number {
  return APPROX_COST_PER_MAP_TOTAL_USD;
}

/** TTY/非 TTY 分支:超阈值时根据环境处理 */
export interface BudgetGateResult {
  /** 是否继续 */
  proceed: boolean;
  /** 给 caller 显示的提示文本 */
  message: string;
  /** 退出码(proceed=false 时,>0) */
  exitCode: number;
  /**
   * I-1 修:caller 是否需要在 print message 后调 `await countdown()`。
   * 仅 TTY 超阈值路径为 true;其余三路径 false。
   * 避免 caller 用 `message.includes('5 秒后继续')` 字符串耦合。
   */
  requiresCountdown: boolean;
}

/**
 * 阈值闸门:
 * - 估算 < threshold → 继续(proceed=true)
 * - 估算 ≥ threshold + TTY → 5 秒倒计时(由 caller 用 setTimeout 实现);返回 proceed=true
 * - 估算 ≥ threshold + 非 TTY + yesFlag=true → 继续
 * - 估算 ≥ threshold + 非 TTY + yesFlag=false → proceed=false,exit 1 + 提示 --yes
 *
 * Note:实际倒计时不在本函数(避免 IO),由 caller 在 message 后做 setTimeout。
 */
export function checkBudgetGate(
  estimated: number,
  threshold: number,
  yesFlag: boolean = false,
  ttyOverride?: boolean,
): BudgetGateResult {
  const tty = ttyOverride ?? isatty(1);

  // M-1 修:`<=` 与 spec §4.4 ">$20 触发警告" 一致 — 浮点估算极少精确等于阈值,
  // 但精确边界归 "未超" 路径更符合 spec 措辞,且测试更可预期。
  if (estimated <= threshold) {
    return {
      proceed: true,
      message: `估算 cost ≈ $${estimated.toFixed(2)}(<= 阈值 $${threshold.toFixed(2)})`,
      exitCode: 0,
      requiresCountdown: false,
    };
  }

  // 估算超阈值
  if (tty) {
    return {
      proceed: true,
      message: `⚠ 估算 cost ≈ $${estimated.toFixed(2)},超阈值 $${threshold.toFixed(2)};5 秒后继续,Ctrl-C 取消`,
      exitCode: 0,
      requiresCountdown: true,
    };
  }
  if (yesFlag) {
    return {
      proceed: true,
      message: `⚠ 估算 cost ≈ $${estimated.toFixed(2)};非 TTY + --yes,继续`,
      exitCode: 0,
      requiresCountdown: false,
    };
  }
  return {
    proceed: false,
    message: `✗ 估算 cost ≈ $${estimated.toFixed(2)},超阈值 $${threshold.toFixed(2)};\n非 TTY 环境(CI / 脚本管道)需加 --yes flag 显式同意`,
    exitCode: 1,
    requiresCountdown: false,
  };
}

/** 5 秒倒计时(给 caller 用) */
export async function countdown(seconds: number = 5): Promise<void> {
  for (let i = seconds; i > 0; i -= 1) {
    process.stderr.write(`\r${i}...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  process.stderr.write('\n');
}
