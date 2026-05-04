import { describe, it, expect } from 'vitest';
import { parseMarker } from '../../../src/core/markers/index.js';
import { validateMarkerSchema } from '../../../src/core/validate/index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// fixture 目录:tests/fixtures/markers/
const fixDir = resolve(__dirname, '../../fixtures/markers');
const load = (name: string) => readFileSync(resolve(fixDir, name), 'utf8');

describe('validateMarkerSchema', () => {
  it('accepts valid verify-passed', () => {
    const m = parseMarker(load('verify-passed.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid).toBe(true);
  });

  it('accepts valid review-passed', () => {
    const m = parseMarker(load('review-passed.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid).toBe(true);
  });

  it('accepts valid verify-failed', () => {
    const m = parseMarker(load('verify-failed.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid).toBe(true);
  });

  it('accepts valid review-failed', () => {
    const m = parseMarker(load('review-failed.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid).toBe(true);
  });

  it('rejects invalid types (timestamp / actor / hash / log_path / pass)', () => {
    const m = parseMarker(load('invalid-types.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid).toBe(false);
    // 应至少有 5 个错误
    expect(r.errors.length).toBeGreaterThanOrEqual(5);
    // 关键错误字段
    const fields = r.errors.map((e) => e.field);
    expect(fields).toContain('verified_at');
    expect(fields).toContain('verified_by');
    expect(fields).toContain('tasks_hash');
  });

  it('rejects unknown schema', () => {
    const r = validateMarkerSchema({ schema: 'forge-unknown/v99' });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('schema');
  });
});
