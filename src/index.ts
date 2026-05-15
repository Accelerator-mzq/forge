// forge core library — 公共 API

export const FORGE_VERSION = '1.2.0' as const;

// 重新导出所有 core 模块的公共类型 + 函数
export * from './core/schema/index.js';
export * from './core/parse/index.js';
export * from './core/validate/index.js';
export * from './core/hash/index.js';
export * from './core/artifact-graph/index.js';
export * from './core/markers/index.js';
export * from './core/specs-sync/index.js';
export * from './core/templates/index.js';
export * from './core/bootstrap/index.js';
export * from './core/migrate/index.js';
