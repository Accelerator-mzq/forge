// index.ts — stage-extensions 模块公开 API 统一导出
// plan-stage-extensions Task 2
// 从 6 个子模块 + types.ts 重新导出所有公开类型/函数/类

// ── 共用辅助类型 ────────────────────────────────────────────────────────────
export type { SeverityMap, CodexFinding, CodexReviewOutput, ForgeFinding } from './types.js';

// ── severity-mapper ─────────────────────────────────────────────────────────
export { mapCodexToForge, mapForgeToForgeTier } from './severity-mapper.js';

// ── convergence-judge ───────────────────────────────────────────────────────
export type { ConvergenceResult } from './convergence-judge.js';
export { judgeConvergence } from './convergence-judge.js';

// ── thread-map ──────────────────────────────────────────────────────────────
export type { ThreadMapEntry } from './thread-map.js';
export { ThreadMap } from './thread-map.js';

// ── trend-analyzer ──────────────────────────────────────────────────────────
export type { TrendAdvice } from './trend-analyzer.js';
export { analyzeTrend } from './trend-analyzer.js';

// ── output-watcher ──────────────────────────────────────────────────────────
export type { WatchResult } from './output-watcher.js';
export { OutputWatcher, watchProcess } from './output-watcher.js';

// ── state-machine ───────────────────────────────────────────────────────────
export type { RoundOutcome } from './state-machine.js';
export { isFailureOutcome } from './state-machine.js';
