// 验证 spec GWT:每个 scenario 至少有 given/when/then 各 1 项(spec §4.3)

import type { ParsedSpec } from '../parse/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

export function validateSpec(s: ParsedSpec, file?: string): ValidationResult {
  const results: ValidationResult[] = [];

  if (!s.title.trim()) {
    // v3 B2 修订:business-fail 标 CRITICAL → exit 1
    results.push(
      failed({
        artifact: 'specs',
        field: 'title',
        message: 'missing H1 title',
        file,
        severity: 'CRITICAL',
      }),
    );
  }
  if (s.scenarios.length === 0) {
    results.push(
      // v3 B2 修订:business-fail 标 CRITICAL → exit 1
      failed({
        artifact: 'specs',
        field: 'scenarios',
        message: 'no scenarios found (expect "## Scenario: <id>")',
        file,
        severity: 'CRITICAL',
      }),
    );
  }
  for (const sc of s.scenarios) {
    if (!sc.id) {
      results.push(
        // v3 B2 修订:business-fail 标 CRITICAL → exit 1
        failed({
          artifact: 'specs',
          field: 'scenario.id',
          message: 'scenario missing id',
          file,
          severity: 'CRITICAL',
        }),
      );
    }
    if (sc.given.length === 0) {
      results.push(
        // v3 B2 修订:business-fail 标 CRITICAL → exit 1
        failed({
          artifact: 'specs',
          field: `scenario:${sc.id}.given`,
          message: 'missing Given',
          file,
          severity: 'CRITICAL',
        }),
      );
    }
    if (sc.when.length === 0) {
      results.push(
        // v3 B2 修订:business-fail 标 CRITICAL → exit 1
        failed({
          artifact: 'specs',
          field: `scenario:${sc.id}.when`,
          message: 'missing When',
          file,
          severity: 'CRITICAL',
        }),
      );
    }
    if (sc.then.length === 0) {
      results.push(
        // v3 B2 修订:business-fail 标 CRITICAL → exit 1
        failed({
          artifact: 'specs',
          field: `scenario:${sc.id}.then`,
          message: 'missing Then',
          file,
          severity: 'CRITICAL',
        }),
      );
    }
  }
  return results.length === 0 ? ok() : mergeResults(...results);
}
