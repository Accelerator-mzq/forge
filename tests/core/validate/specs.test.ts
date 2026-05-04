import { describe, it, expect } from 'vitest';
import { validateSpec } from '../../../src/core/validate/index.js';

describe('validateSpec', () => {
  it('accepts a valid spec with one scenario', () => {
    const r = validateSpec({
      title: 'X',
      scenarios: [{ id: 's1', given: ['a'], when: ['b'], then: ['c'], rawBody: '' }],
    });
    expect(r.valid).toBe(true);
  });

  it('rejects missing scenarios', () => {
    const r = validateSpec({ title: 'X', scenarios: [] });
    expect(r.valid).toBe(false);
  });

  it('rejects scenario missing Given', () => {
    const r = validateSpec({
      title: 'X',
      scenarios: [{ id: 's1', given: [], when: ['b'], then: ['c'], rawBody: '' }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toMatch(/given/);
  });
});
