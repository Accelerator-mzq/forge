// parseMarker 测试 — v4 简版(plan-v4 Phase 4 Task 4.10)
// v4 marker:forge-verify/v2 / forge-review/v2,fixture 已同步
import { describe, it, expect } from 'vitest';
import { parseMarker, MarkerParseError } from '../../src/core/markers/index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixDir = resolve(__dirname, '../fixtures/markers');
const load = (name: string) => readFileSync(resolve(fixDir, name), 'utf8');

describe('parseMarker', () => {
  it('parses verify-passed YAML(v4 v2)', () => {
    const m = parseMarker(load('verify-passed.yaml'));
    expect(m.schema).toBe('forge-verify/v2');
  });

  it('parses review-passed YAML(v4 v2)', () => {
    const m = parseMarker(load('review-passed.yaml'));
    expect(m.schema).toBe('forge-review/v2');
  });

  it('throws on malformed YAML', () => {
    expect(() => parseMarker(': not yaml :::')).toThrow(MarkerParseError);
  });
});
