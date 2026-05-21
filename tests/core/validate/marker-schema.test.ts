// validateMarkerSchema 测试 — v4 简版(plan-v4 Phase 4 Task 4.10)
//
// v4 marker schema(沿 src/core/markers/types.ts):
// - schema ∈ {forge-verify/v2, forge-review/v2}
// - verified_at / reviewed_at:ISO 8601 (允许 ms)
// - verified_by / reviewed_by:非空 string
// - pause_decisions[]:可选,每项 paused_at/task_ref/issue_summary/chosen_option(1-4)/notes?
// - created_by_tool_version:可选 semver
//
// 不再校验 v1 字段:tasks_hash/content_hash/git/process_evidence/verify_findings/evidence 数组

import { describe, it, expect } from 'vitest';
import { parseMarker } from '../../../src/core/markers/index.js';
import { validateMarkerSchema } from '../../../src/core/validate/index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixDir = resolve(__dirname, '../../fixtures/markers');
const load = (name: string) => readFileSync(resolve(fixDir, name), 'utf8');

describe('validateMarkerSchema (v4)', () => {
  it('accepts valid v2 verify-passed fixture', () => {
    const m = parseMarker(load('verify-passed.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts valid v2 review-passed fixture', () => {
    const m = parseMarker(load('review-passed.yaml'));
    const r = validateMarkerSchema(m);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('rejects v1 schema(v4 仅认 v2)', () => {
    const r = validateMarkerSchema({
      schema: 'forge-verify/v1',
      verified_at: '2026-05-21T10:00:00Z',
      verified_by: 'ai-agent',
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('schema');
  });

  it('rejects unknown schema', () => {
    const r = validateMarkerSchema({ schema: 'forge-unknown/v99' });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('schema');
  });

  it('rejects non-object input', () => {
    const r = validateMarkerSchema('not-an-object');
    expect(r.valid).toBe(false);
  });

  it('accepts ISO 8601 with ms precision(V-1 修复)', () => {
    const r = validateMarkerSchema({
      schema: 'forge-verify/v2',
      verified_at: '2026-05-21T10:00:00.123Z',
      verified_by: 'ai-agent',
    });
    expect(r.valid).toBe(true);
  });

  it('rejects non-ISO timestamp', () => {
    const r = validateMarkerSchema({
      schema: 'forge-verify/v2',
      verified_at: 'yesterday',
      verified_by: 'ai-agent',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('verified_at');
  });

  it('rejects empty verified_by', () => {
    const r = validateMarkerSchema({
      schema: 'forge-verify/v2',
      verified_at: '2026-05-21T10:00:00Z',
      verified_by: '',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('verified_by');
  });

  it('rejects non-string verified_by', () => {
    const r = validateMarkerSchema({
      schema: 'forge-verify/v2',
      verified_at: '2026-05-21T10:00:00Z',
      verified_by: 123,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('verified_by');
  });

  it('accepts marker with valid pause_decisions[]', () => {
    const r = validateMarkerSchema({
      schema: 'forge-verify/v2',
      verified_at: '2026-05-21T10:00:00Z',
      verified_by: 'ai-agent',
      pause_decisions: [
        {
          paused_at: '2026-05-21T09:00:00Z',
          task_ref: 'tasks.md#task-3',
          issue_summary: 'subagent 发现 spec 漏点',
          chosen_option: 2,
          notes: '加 task',
        },
      ],
    });
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('rejects pause_decisions non-array', () => {
    const r = validateMarkerSchema({
      schema: 'forge-verify/v2',
      verified_at: '2026-05-21T10:00:00Z',
      verified_by: 'ai-agent',
      pause_decisions: 'not-array',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('pause_decisions');
  });

  it('rejects pause_decision.chosen_option 不在 {1,2,3,4}', () => {
    const r = validateMarkerSchema({
      schema: 'forge-verify/v2',
      verified_at: '2026-05-21T10:00:00Z',
      verified_by: 'ai-agent',
      pause_decisions: [
        {
          paused_at: '2026-05-21T09:00:00Z',
          task_ref: 'tasks.md#x',
          issue_summary: 'x',
          chosen_option: 5,
        },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('pause_decisions[0].chosen_option');
  });

  it('rejects pause_decision 缺 task_ref / issue_summary', () => {
    const r = validateMarkerSchema({
      schema: 'forge-verify/v2',
      verified_at: '2026-05-21T10:00:00Z',
      verified_by: 'ai-agent',
      pause_decisions: [
        {
          paused_at: '2026-05-21T09:00:00Z',
          chosen_option: 1,
        },
      ],
    });
    expect(r.valid).toBe(false);
    const fields = r.errors.map((e) => e.field);
    expect(fields).toContain('pause_decisions[0].task_ref');
    expect(fields).toContain('pause_decisions[0].issue_summary');
  });

  it('rejects created_by_tool_version 非 semver', () => {
    const r = validateMarkerSchema({
      schema: 'forge-verify/v2',
      verified_at: '2026-05-21T10:00:00Z',
      verified_by: 'ai-agent',
      created_by_tool_version: 'v4',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('created_by_tool_version');
  });

  it('accepts created_by_tool_version 合法 semver', () => {
    const r = validateMarkerSchema({
      schema: 'forge-verify/v2',
      verified_at: '2026-05-21T10:00:00Z',
      verified_by: 'ai-agent',
      created_by_tool_version: '4.0.0-beta.1',
    });
    expect(r.valid).toBe(true);
  });

  it('accepts review marker with valid pause_decisions(镜像 verify)', () => {
    const r = validateMarkerSchema({
      schema: 'forge-review/v2',
      reviewed_at: '2026-05-21T11:00:00Z',
      reviewed_by: 'ai-agent',
      pause_decisions: [
        {
          paused_at: '2026-05-21T10:30:00Z',
          task_ref: 'tasks.md#review-task',
          issue_summary: 'review subagent 找到 edge case',
          chosen_option: 2,
        },
      ],
    });
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });
});
