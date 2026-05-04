// 验证 proposal:title 非空 + why/what 非空(spec §4.3)

import type { ParsedProposal } from '../parse/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

export function validateProposal(p: ParsedProposal, file?: string): ValidationResult {
  const errors: ValidationResult[] = [];
  if (!p.title.trim()) {
    errors.push(
      failed({ artifact: 'proposal', field: 'title', message: 'missing or empty H1 title', file }),
    );
  }
  if (!p.why.trim()) {
    errors.push(
      failed({ artifact: 'proposal', field: 'why', message: 'missing or empty Why section', file }),
    );
  }
  if (!p.what.trim()) {
    errors.push(
      failed({
        artifact: 'proposal',
        field: 'what',
        message: 'missing or empty What section',
        file,
      }),
    );
  }
  return errors.length === 0 ? ok() : mergeResults(...errors);
}
