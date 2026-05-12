// pause-decisions-schema.test.ts — plan-9c Task 1 单测(沿 verify-findings-schema.test.ts 模式)
// 校验 pause_decisions 数组 schema:必填字段 / 类型 / 枚举值 / id 唯一性 / superset additive

import { describe, it, expect } from 'vitest';
import { validateMarkerSchema } from '../../../src/core/validate/marker-schema.js';

// 合法 marker baseline(verify-passed,无 pause_decisions)
const baseVerifyMarker = {
  schema: 'forge-verify/v1',
  verified_at: '2026-05-12T14:30:00Z',
  verified_by: 'ai-agent',
  tasks_hash: 'sha256:' + 'a'.repeat(64),
  content_hash: 'sha256:' + 'b'.repeat(64),
  evidence: [],
};

// 合法 PauseDecision baseline(option=3 转 out-of-scope)
const basePauseDecision = {
  id: 1,
  paused_at: '2026-05-12T14:30:00Z',
  task_ref: 'tasks.md#task-3',
  issue_summary: 'subagent 发现 specs 没覆盖 OAuth refresh token 过期处理',
  severity: 'WARNING',
  severity_acked_by: 'msc',
  severity_acked_at: '2026-05-12T14:32:00Z',
  chosen_option: 3,
  target_artifact: 'proposal.md',
  target_anchor: '## Out of Scope',
  non_blocking_rationale: 'subagent 可以跳过该 issue 完成本 task 主体功能',
  other_rationale: null,
  other_acked_by: null,
};

describe('pause_decisions schema validation', () => {
  it('superset additive:marker 缺 pause_decisions 字段 → 老兼容通过', () => {
    const result = validateMarkerSchema(baseVerifyMarker);
    expect(result.valid).toBe(true);
  });

  it('空数组 pause_decisions: [] → 通过', () => {
    const result = validateMarkerSchema({ ...baseVerifyMarker, pause_decisions: [] });
    expect(result.valid).toBe(true);
  });

  it('合法 PauseDecision 项(option=3) → 通过', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [basePauseDecision],
    });
    expect(result.valid).toBe(true);
  });

  it('pause_decisions 非数组 → 拒签', () => {
    const result = validateMarkerSchema({ ...baseVerifyMarker, pause_decisions: 'not-array' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions')).toBe(true);
  });

  it('id 重复 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [
        { ...basePauseDecision, id: 1 },
        { ...basePauseDecision, id: 1 },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /id.*重复/.test(e.message))).toBe(true);
  });

  it('缺 paused_at 必填字段 → 拒签', () => {
    // 用对象展开替代析构,避免 no-unused-vars 报错
    const { paused_at: _, ...rest } = basePauseDecision;
    void _;
    const result = validateMarkerSchema({ ...baseVerifyMarker, pause_decisions: [rest] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].paused_at')).toBe(true);
  });

  it('paused_at 非 ISO 8601 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [{ ...basePauseDecision, paused_at: '2026-05-12 14:30' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].paused_at')).toBe(true);
  });

  it('severity 非三级 enum → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [{ ...basePauseDecision, severity: 'INFO' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].severity')).toBe(true);
  });

  it('chosen_option 非 1-4 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [{ ...basePauseDecision, chosen_option: 5 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].chosen_option')).toBe(true);
  });

  it('chosen_option 是 string 而非 number → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [{ ...basePauseDecision, chosen_option: '3' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].chosen_option')).toBe(true);
  });

  it('issue_summary 空串 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      pause_decisions: [{ ...basePauseDecision, issue_summary: '' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].issue_summary')).toBe(true);
  });

  it('task_ref 缺失 → 拒签', () => {
    // 用对象展开替代析构,避免 no-unused-vars 报错
    const { task_ref: _, ...rest } = basePauseDecision;
    void _;
    const result = validateMarkerSchema({ ...baseVerifyMarker, pause_decisions: [rest] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pause_decisions[0].task_ref')).toBe(true);
  });
});
