import { describe, it, expect } from 'vitest';
import { parseDesign } from '../../../src/core/parse/design.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = readFileSync(resolve(__dirname, '../../fixtures/valid-change/design.md'), 'utf8');

describe('parseDesign', () => {
  it('extracts title from h1', () => {
    const r = parseDesign(fixture);
    expect(r.title).toBe('Login Design');
  });

  it('returns sections list with level + heading', () => {
    const r = parseDesign(fixture);
    expect(r.sections.find((s) => s.heading === 'Architecture')).toBeDefined();
    expect(r.sections.find((s) => s.heading === 'Data Model')).toBeDefined();
  });
});
