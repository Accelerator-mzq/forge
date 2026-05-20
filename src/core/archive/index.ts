// archive 模块公共 API 导出 — v4 简版(plan-v4 Phase 1 §10.1.6 Task 1.18 提前执行)
//
// v4 BREAKING:transaction / lock / recover / resume-summary / 9 fence 模块全删,
// barrel 仅保留 summary-builder + summary-render(archive_summary 构造与渲染)。
// lock.ts 已迁到 src/core/lock.ts(通用工具,非 archive 专属)。

export * from './summary-builder.js';
export * from './summary-render.js';
