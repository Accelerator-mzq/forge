// archive-three-level-fence.test.ts — plan-9e1 Task 4 单测
// 沿 verify-findings-fence 单测同模式,直接调 validateThreeLevelFence(不走 CLI,快速反馈)
// e2e 跑全链(archive 命令)留给 Task 6

import { describe, it, expect } from 'vitest';
import { validateThreeLevelFence } from '../../src/core/archive/three-level-fence.js';

function baseVerify(): Record<string, unknown> {
  return {
    schema: 'forge-verify/v1',
    verified_at: '2026-05-12T16:30:00Z',
    verified_by: 'ai-agent',
    tasks_hash: 'sha256:' + 'a'.repeat(64),
    content_hash: 'sha256:' + 'b'.repeat(64),
    evidence: [],
  };
}
function baseReview(): Record<string, unknown> {
  return {
    schema: 'forge-review/v1',
    reviewed_at: '2026-05-12T16:40:00Z',
    reviewed_by: 'ai-agent',
    tasks_hash: 'sha256:' + 'a'.repeat(64),
    content_hash: 'sha256:' + 'b'.repeat(64),
    git: { is_git_repo: false },
    review_outcomes: [],
  };
}

describe('validateThreeLevelFence (v2 重构:verify 端 sanity + review 端核心)', () => {
  // —— verify_findings 端:仅 CRITICAL sanity(v2 MINOR 1) ——
  it('空 markers → 通过', () => {
    const r = validateThreeLevelFence(baseVerify(), baseReview());
    expect(r.valid).toBe(true);
  });

  it('verify_findings CRITICAL + resolved=false → 拒签(sanity 兜底,正常应被 9d 拦)', () => {
    const v = baseVerify();
    v.verify_findings = [
      {
        id: 1,
        dimension: 'completeness',
        check_type: 'x',
        severity: 'CRITICAL',
        automated: true,
        evidence: 'change-level',
        recommendation: 'r',
        resolved: false,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    const r = validateThreeLevelFence(v, baseReview());
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /sanity/.test(e.message))).toBe(true);
  });

  it('verify_findings WARNING + resolved=false + 缺 ack → **9e1 fence 不拦**(由 9d 单源处理,v2 MINOR 1)', () => {
    const v = baseVerify();
    v.verify_findings = [
      {
        id: 1,
        dimension: 'correctness',
        check_type: 'x',
        severity: 'WARNING',
        automated: false,
        evidence: 'src/x.ts:1',
        recommendation: 'r',
        resolved: false,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    const r = validateThreeLevelFence(v, baseReview());
    // v2:9e1 三级 fence verify 端不再处理 WARNING(9d 单源);此处期望通过
    expect(r.valid).toBe(true);
  });

  // —— review_outcomes 端核心:S/C/L 三分支(v2 BLOCKER 3) ——
  it('review_outcomes S + resolved=false → 拒签', () => {
    const rv = baseReview();
    rv.review_outcomes = [
      { severity: 'S', accepted: false, resolved: false, rationale: 'critical bug' },
    ];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /S\(CRITICAL/.test(e.message))).toBe(true);
  });

  it('review_outcomes S + resolved=true → 通过', () => {
    const rv = baseReview();
    rv.review_outcomes = [{ severity: 'S', accepted: true, resolved: true, task_ref: 'fix-1' }];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(true);
  });

  it('review_outcomes C + resolved=false + accepted=true + rationale 非空 → **拒签**(v3 BLOCKER 1:无视 resolved/accepted/rationale)', () => {
    const rv = baseReview();
    rv.review_outcomes = [
      {
        severity: 'C',
        accepted: true,
        resolved: false,
        rationale: 'human accepted',
        task_ref: 't1',
      },
    ];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /clarification/.test(e.message))).toBe(true);
    // v4 BLOCKER 1:fence 硬墙,提示走 9j(forge upgrade --resign-markers);删除 v3 manual edit 等价路径
    expect(r.errors.some((e) => /forge upgrade --resign-markers|9j/.test(e.message))).toBe(true);
    // v4 BLOCKER 1:必须含"硬墙"或"不接受手动编辑"字眼,反向加固提示
    expect(r.errors.some((e) => /硬墙|不接受手动编辑|反向加固/.test(e.message))).toBe(true);
  });

  // v3 BLOCKER 1 修订:C + resolved=true 由 v2 通过 → v3 改为拒签
  it('review_outcomes C + resolved=true → **拒签**(v3 BLOCKER 1:v0.4 视角 resolved 但 v1.0 视角 severity 仍是简码 C,必须 resign)', () => {
    const rv = baseReview();
    rv.review_outcomes = [{ severity: 'C', accepted: true, resolved: true, task_ref: 't1' }];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /clarification/.test(e.message))).toBe(true);
  });

  // v3 BLOCKER 1 新增:C + accepted=false 也拒签(任何 C 状态都拒签)
  it('review_outcomes C + accepted=false + resolved=false → 拒签(任何 C 状态都拒签)', () => {
    const rv = baseReview();
    rv.review_outcomes = [
      { severity: 'C', accepted: false, resolved: false, rationale: 'rejected' },
    ];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /clarification/.test(e.message))).toBe(true);
  });

  it('review_outcomes L + resolved=false → 通过(SUGGESTION 持挂,builder 收进 pending_suggestions)', () => {
    const rv = baseReview();
    rv.review_outcomes = [
      { severity: 'L', accepted: false, resolved: false, rationale: 'suggestion only' },
    ];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(true);
  });

  it('review_outcomes L + resolved=true → 通过', () => {
    const rv = baseReview();
    rv.review_outcomes = [{ severity: 'L', accepted: false, resolved: true, rationale: 'minor' }];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(true);
  });
});
