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

  // P2 回归:diff_pathspec 必须含 include + exclude string array
  // 不能放过 diff_pathspec: {}(spec §3.4.1 类型校验表)
  it('rejects review marker with empty diff_pathspec object', () => {
    const m = parseMarker(load('review-passed-bad-pathspec.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid).toBe(false);
    const fields = r.errors.map((e) => e.field);
    expect(fields).toContain('git.diff_pathspec.include');
  });

  // P2 回归:include/exclude 必须是 string array,非字符串元素也要拒
  it('rejects diff_pathspec with non-string array elements', () => {
    const r = validateMarkerSchema({
      schema: 'forge-review/v1',
      reviewed_at: '2026-05-04T16:00:00Z',
      reviewed_by: 'ai-agent',
      tasks_hash: 'sha256:a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd',
      content_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      git: {
        is_git_repo: true,
        head: 'a1b2c3d4e5f6789012345678901234567890abcd',
        diff_hash: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
        diff_pathspec: {
          include: ['src/**', 123], // 含非字符串
          exclude: ['forge/**'],
        },
      },
      review_outcomes: [{ severity: 'S', accepted: true, resolved: true, task_ref: 'tasks.md#x' }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('git.diff_pathspec.include');
  });
});
