import { describe, it, expect } from 'vitest';
import { parseSpec } from '../../../src/core/parse/specs.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = readFileSync(
  resolve(__dirname, '../../fixtures/valid-change/specs/login.md'),
  'utf8',
);

describe('parseSpec', () => {
  it('extracts spec title', () => {
    const r = parseSpec(fixture);
    expect(r.title).toBe('Login Spec');
  });

  it('parses 2 scenarios', () => {
    const r = parseSpec(fixture);
    expect(r.scenarios).toHaveLength(2);
  });

  it('extracts scenario id from heading', () => {
    const r = parseSpec(fixture);
    expect(r.scenarios[0]?.id).toBe('happy-path');
    expect(r.scenarios[1]?.id).toBe('wrong-password');
  });

  it('parses Given/When/Then/And steps', () => {
    const r = parseSpec(fixture);
    const happy = r.scenarios[0]!;
    expect(happy.given).toContain('a user with valid credentials');
    expect(happy.when[0]).toContain('POST /api/login');
    expect(happy.then.length).toBeGreaterThanOrEqual(2); // Then + And
  });
});
