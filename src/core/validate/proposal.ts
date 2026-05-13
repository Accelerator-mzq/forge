// 验证 proposal:title 非空 + why/what 非空(spec §4.3)

import type { ParsedProposal } from '../parse/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

export function validateProposal(p: ParsedProposal, file?: string): ValidationResult {
  const errors: ValidationResult[] = [];
  if (!p.title.trim()) {
    errors.push(
      // v3 B2 修订:business-fail 标 CRITICAL → exit 1(沿 master §3.12.3 freeze)
      failed({
        artifact: 'proposal',
        field: 'title',
        message: 'missing or empty H1 title',
        file,
        severity: 'CRITICAL',
      }),
    );
  }
  if (!p.why.trim()) {
    errors.push(
      // v3 B2 修订:business-fail 标 CRITICAL → exit 1
      failed({
        artifact: 'proposal',
        field: 'why',
        message: 'missing or empty Why section',
        file,
        severity: 'CRITICAL',
      }),
    );
  }
  if (!p.what.trim()) {
    errors.push(
      // v3 B2 修订:business-fail 标 CRITICAL → exit 1
      failed({
        artifact: 'proposal',
        field: 'what',
        message: 'missing or empty What section',
        file,
        severity: 'CRITICAL',
      }),
    );
  }
  return errors.length === 0 ? ok() : mergeResults(...errors);
}
