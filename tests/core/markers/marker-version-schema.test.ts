// marker-version-schema.test.ts — plan-9j Task 1 单测
// 沿 verify-findings-schema.test.ts / pause-decisions-schema.test.ts 同模式
// 校验 created_by_tool_version 字段:semver 合法 / 缺字段兼容(<1.0.0) / 等

import { describe, it, expect } from 'vitest';
import { validateMarkerSchema } from '../../../src/core/validate/marker-schema.js';

// 合法 marker baseline(verify-passed)
const baseVerifyMarker = {
  schema: 'forge-verify/v1',
  verified_at: '2026-05-12T14:30:00Z',
  verified_by: 'ai-agent',
  tasks_hash: 'sha256:' + 'a'.repeat(64),
  content_hash: 'sha256:' + 'b'.repeat(64),
  evidence: [],
};

describe('created_by_tool_version schema validation', () => {
  it('superset additive:marker 缺 created_by_tool_version 字段 → 老兼容通过', () => {
    const result = validateMarkerSchema(baseVerifyMarker);
    expect(result.valid).toBe(true);
  });

  it('合法 semver 1.0.0 → 通过', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '1.0.0',
    });
    expect(result.valid).toBe(true);
  });

  it('合法 semver 0.4.2 → 通过', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '0.4.2',
    });
    expect(result.valid).toBe(true);
  });

  it('合法 semver 含 prerelease 1.0.0-alpha.1 → 通过', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '1.0.0-alpha.1',
    });
    expect(result.valid).toBe(true);
  });

  it('合法 semver 含 build 1.0.0+20260512 → 通过', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '1.0.0+20260512',
    });
    expect(result.valid).toBe(true);
  });

  it('非 semver 字符串 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: 'not-semver',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'created_by_tool_version')).toBe(true);
  });

  it('数字而非字符串 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: 1.0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'created_by_tool_version')).toBe(true);
  });

  it('空字符串 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'created_by_tool_version')).toBe(true);
  });

  it('forge-review/v1 marker 同样校验字段', () => {
    const reviewMarker = {
      schema: 'forge-review/v1',
      reviewed_at: '2026-05-12T16:30:00Z',
      reviewed_by: 'ai-agent',
      tasks_hash: 'sha256:' + 'a'.repeat(64),
      content_hash: 'sha256:' + 'b'.repeat(64),
      git: { is_git_repo: false },
      review_outcomes: [],
      created_by_tool_version: 'not-semver',
    };
    const result = validateMarkerSchema(reviewMarker);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'created_by_tool_version')).toBe(true);
  });

  it('forge-verify-failed/v1 marker 同样校验', () => {
    const failedMarker = {
      schema: 'forge-verify-failed/v1',
      failed_at: '2026-05-12T16:30:00Z',
      reasons: ['x'],
      fake_completions: [],
      appended_tasks: [],
      created_by_tool_version: '1.0.0',
    };
    const result = validateMarkerSchema(failedMarker);
    expect(result.valid).toBe(true);
  });

  it('forge-review-failed/v1 marker 同样校验', () => {
    const failedMarker = {
      schema: 'forge-review-failed/v1',
      failed_at: '2026-05-12T16:30:00Z',
      unresolved_outcomes: [],
      appended_tasks: [],
      created_by_tool_version: '0.0.1',
    };
    const result = validateMarkerSchema(failedMarker);
    expect(result.valid).toBe(true);
  });

  it('semver 含 0 主版本 0.4.0 → 通过(v0.4 marker)', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '0.4.0',
    });
    expect(result.valid).toBe(true);
  });

  // v3 BLOCKER 2 修订:加 resigned_by_tool_version 字段 +2 case(沿 v2 选项 C)
  it('合法 resigned_by_tool_version 1.0.0 → 通过(resign 后 marker)', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '0.4.0',
      resigned_by_tool_version: '1.0.0',
    });
    expect(result.valid).toBe(true);
  });

  it('resigned_by_tool_version 非 semver → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '0.4.0',
      resigned_by_tool_version: 'not-semver',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'resigned_by_tool_version')).toBe(true);
  });
});
