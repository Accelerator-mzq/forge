import { describe, it, expect } from 'vitest';
import { validateProposal } from '../../../src/core/validate/index.js';

describe('validateProposal', () => {
  it('accepts a complete proposal', () => {
    const r = validateProposal({
      title: 'X',
      why: 'reason',
      what: 'do thing',
      scope: 'limited',
    });
    expect(r.valid).toBe(true);
  });

  it('rejects missing title', () => {
    const r = validateProposal({ title: '', why: 'r', what: 'w' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'title')).toBe(true);
  });

  it('rejects missing why and what together', () => {
    const r = validateProposal({ title: 'X', why: '', what: '' });
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(2);
  });
});
