// 验证 spec GWT:每个 scenario 至少有 given/when/then 各 1 项(spec §4.3)

import type { ParsedSpec } from '../parse/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

export function validateSpec(s: ParsedSpec, file?: string): ValidationResult {
  const results: ValidationResult[] = [];

  if (!s.title.trim()) {
    results.push(failed({ artifact: 'specs', field: 'title', message: 'missing H1 title', file }));
  }
  if (s.scenarios.length === 0) {
    results.push(
      failed({
        artifact: 'specs',
        field: 'scenarios',
        message: 'no scenarios found (expect "## Scenario: <id>")',
        file,
      }),
    );
  }
  for (const sc of s.scenarios) {
    if (!sc.id) {
      results.push(
        failed({ artifact: 'specs', field: 'scenario.id', message: 'scenario missing id', file }),
      );
    }
    if (sc.given.length === 0) {
      results.push(
        failed({
          artifact: 'specs',
          field: `scenario:${sc.id}.given`,
          message: 'missing Given',
          file,
        }),
      );
    }
    if (sc.when.length === 0) {
      results.push(
        failed({
          artifact: 'specs',
          field: `scenario:${sc.id}.when`,
          message: 'missing When',
          file,
        }),
      );
    }
    if (sc.then.length === 0) {
      results.push(
        failed({
          artifact: 'specs',
          field: `scenario:${sc.id}.then`,
          message: 'missing Then',
          file,
        }),
      );
    }
  }
  return results.length === 0 ? ok() : mergeResults(...results);
}
