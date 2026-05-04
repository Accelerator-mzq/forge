import { describe, it, expect } from 'vitest';
import { parseProposal } from '../../../src/core/parse/proposal.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = readFileSync(resolve(__dirname, '../../fixtures/valid-change/proposal.md'), 'utf8');

describe('parseProposal', () => {
  it('extracts title from h1', () => {
    const r = parseProposal(fixture);
    expect(r.title).toBe('Add Login Feature');
  });

  it('extracts why section body', () => {
    const r = parseProposal(fixture);
    expect(r.why).toContain('authenticate');
  });

  it('extracts what section body', () => {
    const r = parseProposal(fixture);
    expect(r.what).toContain('email/password');
  });

  it('extracts scope section body when present', () => {
    const r = parseProposal(fixture);
    expect(r.scope).toContain('session management');
  });

  it('returns undefined scope when absent', () => {
    const minimal = '# Title\n\n## Why\nx\n\n## What\ny\n';
    const r = parseProposal(minimal);
    expect(r.scope).toBeUndefined();
  });
});
