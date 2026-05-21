// forge core library — 公共 API

import { readFileSync } from 'node:fs';

// 包根 package.json 是唯一版本号来源:dev 时 src/index.ts 上溯 1 层 = 仓库根,
// runtime 时 dist/index.js 上溯 1 层 = npm 包根;两种形态都含 package.json。
// 此前硬编码字面量,与 package.json 漂移污染 archive marker / handoff manifest
// 的 forgeVersion 字段(v3.1.1 修)。
const pkgUrl = new URL('../package.json', import.meta.url);
const { version: pkgVersion } = JSON.parse(readFileSync(pkgUrl, 'utf8')) as { version: string };
export const FORGE_VERSION: string = pkgVersion;

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
