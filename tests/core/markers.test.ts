import { describe, it, expect } from 'vitest';
import { parseMarker, MarkerParseError } from '../../src/core/markers/index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// fixture 目录:tests/fixtures/markers/
const fixDir = resolve(__dirname, '../fixtures/markers');
const load = (name: string) => readFileSync(resolve(fixDir, name), 'utf8');

describe('parseMarker', () => {
  it('parses verify-passed YAML', () => {
    const m = parseMarker(load('verify-passed.yaml'));
    expect(m.schema).toBe('forge-verify/v1');
  });

  it('parses review-passed YAML', () => {
    const m = parseMarker(load('review-passed.yaml'));
    expect(m.schema).toBe('forge-review/v1');
  });

  it('throws on malformed YAML', () => {
    expect(() => parseMarker(': not yaml :::')).toThrow(MarkerParseError);
  });
});
