// 验证 tasks:至少 1 个 task,id 非空,id 唯一(spec §3.3 不变量 2:append-only 隐含 id 唯一)

import type { ParsedTasks } from '../parse/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

export function validateTasks(t: ParsedTasks, file?: string): ValidationResult {
  const results: ValidationResult[] = [];
  if (t.items.length === 0) {
    results.push(
      // v3 B2 修订:business-fail 标 CRITICAL → exit 1
      failed({
        artifact: 'tasks',
        field: 'items',
        message: 'no checkbox items found',
        file,
        severity: 'CRITICAL',
      }),
    );
  }
  const seen = new Set<string>();
  for (const item of t.items) {
    if (!item.id) {
      results.push(
        // v3 B2 修订:business-fail 标 CRITICAL → exit 1
        failed({
          artifact: 'tasks',
          field: 'item.id',
          message: `task at line ${item.lineNumber} has empty id`,
          file,
          line: item.lineNumber,
          severity: 'CRITICAL',
        }),
      );
    } else if (seen.has(item.id)) {
      results.push(
        // v3 B2 修订:business-fail 标 CRITICAL → exit 1
        failed({
          artifact: 'tasks',
          field: 'item.id',
          message: `duplicate task id "${item.id}" (violates append-only invariant)`,
          file,
          line: item.lineNumber,
          severity: 'CRITICAL',
        }),
      );
    } else {
      seen.add(item.id);
    }
  }
  return results.length === 0 ? ok() : mergeResults(...results);
}
