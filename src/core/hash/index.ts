// hash 模块公共 API — 统一导出四个 hash 函数
export { computeTasksHash } from './tasks.js';
export { computeContentHash } from './content.js';
export { computeLogHash } from './log.js';
// Task 15：git diff pathspec hash
export { computeDiffHash, DEFAULT_DIFF_EXCLUDE } from './diff.js';
export type { DiffPathspec } from './diff.js';
