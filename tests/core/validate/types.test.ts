import { describe, it, expect } from 'vitest';
import { mergeResults, failed, ok } from '../../../src/core/validate/index.js';

describe('validate/types helpers', () => {
  it('ok() returns valid=true with empty errors', () => {
    const r = ok();
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('failed() returns valid=false with one error', () => {
    const r = failed({
      artifact: 'proposal',
      field: 'why',
      message: 'missing why section',
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('why');
  });

  it('mergeResults aggregates errors and recomputes valid', () => {
    const a = ok([{ artifact: 'specs', message: 'minor' }]);
    const b = failed({ artifact: 'tasks', message: 'crit' });
    const merged = mergeResults(a, b);
    expect(merged.valid).toBe(false);
    expect(merged.errors).toHaveLength(1);
    expect(merged.warnings).toHaveLength(1);
  });

  it('mergeResults with all ok stays valid', () => {
    const merged = mergeResults(ok(), ok(), ok());
    expect(merged.valid).toBe(true);
  });
});
