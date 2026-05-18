// archive-pause-fence.test.ts — plan-9c Task 2 单测
// 沿 verify-findings-fence.test.ts 同模式,覆盖 5 fence 分支 + 边界 case
// 校验范围:option 1-4 业务规则 + CRITICAL 重定向 + ack 校验 + marker 缺失老兼容

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePauseDecisionsFence } from '../../src/core/archive/pause-decisions-fence.js';

// 合法 PauseDecision baseline(option=3 + 完整 ack + non_blocking_rationale)
const basePauseDecision = {
  id: 1,
  paused_at: '2026-05-12T14:30:00Z',
  task_ref: 'tasks.md#task-3',
  issue_summary: 'subagent 发现 specs 没覆盖 OAuth refresh token 过期处理',
  severity: 'WARNING' as const,
  severity_acked_by: 'msc',
  severity_acked_at: '2026-05-12T14:32:00Z',
  chosen_option: 3 as const,
  target_artifact: 'proposal.md',
  target_anchor: '## Out of Scope',
  non_blocking_rationale: 'subagent 可以跳过该 issue 完成本 task 主体功能',
  other_rationale: null,
  other_acked_by: null,
};

// v4 codex NEW-MAJOR A6 + B4 联动修订:fence 不再需要 ctx 参数,单测调用回归 v3 前形态

describe('validatePauseDecisionsFence', () => {
  let changeDir: string;

  beforeEach(() => {
    changeDir = mkdtempSync(join(tmpdir(), 'forge-pause-fence-'));
    mkdirSync(changeDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(changeDir, { recursive: true, force: true });
  });

  // —— Superset additive:marker 缺 pause_decisions → 老兼容通过 ——
  it('marker 缺 pause_decisions 字段 → 老兼容 ok', async () => {
    const result = await validatePauseDecisionsFence({}, changeDir, changeDir);
    expect(result.valid).toBe(true);
  });

  it('pause_decisions: [] → 通过', async () => {
    const result = await validatePauseDecisionsFence({ pause_decisions: [] }, changeDir, changeDir);
    expect(result.valid).toBe(true);
  });

  // —— CRITICAL 重定向:不应进 pause(无 ack 路径) ——
  it('CRITICAL severity → 拒签(CRITICAL 应走 forge 强 fence,不应进 pause)', async () => {
    const result = await validatePauseDecisionsFence(
      { pause_decisions: [{ ...basePauseDecision, severity: 'CRITICAL' }] },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/CRITICAL.*应走.*fence/);
  });

  // —— WARNING + 未 ack → 拒签 ——
  it('WARNING + severity_acked_by 空 → 拒签', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [{ ...basePauseDecision, severity: 'WARNING', severity_acked_by: null }],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toMatch(/severity_acked_by/);
  });

  // —— SUGGESTION + 未 ack → 通过(fence 仅校验存在性) ——
  it('SUGGESTION + severity_acked_by 空 → 通过(SUGGESTION 例外)', async () => {
    // SUGGESTION 必须配 option=3 路径 + non_blocking_rationale 才合理(option=1/2 SUGGESTION 没意义)
    writeFileSync(
      join(changeDir, 'proposal.md'),
      buildProposalWithScopeEntry('issue-1', '## Out of Scope', 'forge-oos'),
    );
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            severity: 'SUGGESTION',
            severity_acked_by: null,
            severity_acked_at: null,
            target_artifact: 'proposal.md',
            target_anchor: '## Out of Scope',
            non_blocking_rationale: 'edge-case 建议',
            // scope_entry_id 通过 task_ref 关联 'issue-1'(下文 Step 2 fence 实施会用 task_ref 末段做 entry_id 匹配)
            task_ref: 'tasks.md#issue-1',
          },
        ],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(true);
  });

  // —— option=1 (扩 scope):target_artifact=proposal.md + target_anchor 含 'What Changes' ——
  it('option=1 + target_artifact=proposal.md + target_anchor=## What Changes → 通过', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 1,
            target_artifact: 'proposal.md',
            target_anchor: '## What Changes',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(true);
  });

  it('option=1 + target_artifact=tasks.md → 拒签(option=1 必须改 proposal.md)', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 1,
            target_artifact: 'tasks.md',
            target_anchor: '## What Changes',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/option=1.*proposal/);
  });

  // —— option=2 (加 task):tasks.md 中 task_ref 指向的行已勾选 [x] ——
  it('option=2 + tasks.md 中 task_ref 行已勾选 → 通过', async () => {
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n- [x] **task-3** subagent 实施 OAuth\n');
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 2,
            task_ref: 'tasks.md#task-3',
            target_artifact: 'tasks.md',
            target_anchor: '- task-3',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(true);
  });

  it('option=2 + tasks.md 中 task_ref 行未勾选 [ ] → 拒签', async () => {
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n- [ ] **task-3** subagent 实施 OAuth\n');
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 2,
            task_ref: 'tasks.md#task-3',
            target_artifact: 'tasks.md',
            target_anchor: '- task-3',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/option=2.*未勾选/);
  });

  it('option=2 + tasks.md 中找不到 task_ref → 拒签', async () => {
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n- [x] **task-1** other\n');
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 2,
            task_ref: 'tasks.md#task-3',
            target_artifact: 'tasks.md',
            target_anchor: '- task-3',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/找不到.*task-3/);
  });

  // —— option=3 (转 out-of-scope):scope-entries 有 entry + non_blocking_rationale 非空 ——
  it('option=3 + scope-entries 有 entry + non_blocking_rationale → 通过', async () => {
    writeFileSync(
      join(changeDir, 'proposal.md'),
      buildProposalWithScopeEntry('issue-1', '## Out of Scope', 'forge-oos'),
    );
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [{ ...basePauseDecision, task_ref: 'tasks.md#issue-1' }],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(true);
  });

  it('option=3 + non_blocking_rationale 为 null → 拒签', async () => {
    writeFileSync(
      join(changeDir, 'proposal.md'),
      buildProposalWithScopeEntry('issue-1', '## Out of Scope', 'forge-oos'),
    );
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            task_ref: 'tasks.md#issue-1',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/option=3.*non_blocking_rationale/);
  });

  it('option=3 + scope-entries 块无 triggered_by 反向引用本 pause_decision → 拒签', async () => {
    // v3 codex MAJOR 5 修订:负例改为 triggered_by.id=999 ≠ basePauseDecision.id=1
    //   (老版用 entry.id='different-id' 但 triggered_by.id 仍是 1,新 fence 反向查找仍匹配)
    writeFileSync(
      join(changeDir, 'proposal.md'),
      buildProposalWithScopeEntry('different-id', '## Out of Scope', 'forge-oos', 999),
    );
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            non_blocking_rationale: 'rationale here',
          },
        ],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/scope-entries.*triggered_by.*pause_decision/);
  });

  // —— option=4 (Other):other_rationale + other_acked_by 必填 ——
  it('option=4 + other_rationale + other_acked_by 非空 → 通过', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 4,
            other_rationale: '用户自定义方案 X',
            other_acked_by: 'msc',
            target_artifact: 'proposal.md',
            target_anchor: '## What Changes',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(true);
  });

  it('option=4 + other_rationale 为 null → 拒签', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 4,
            other_rationale: null,
            other_acked_by: 'msc',
            target_artifact: 'proposal.md',
            target_anchor: '## What Changes',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/option=4.*other_rationale/);
  });

  it('option=4 + other_acked_by 为 null → 拒签', async () => {
    const result = await validatePauseDecisionsFence(
      {
        pause_decisions: [
          {
            ...basePauseDecision,
            chosen_option: 4,
            other_rationale: '用户自定义方案 X',
            other_acked_by: null,
            target_artifact: 'proposal.md',
            target_anchor: '## What Changes',
            non_blocking_rationale: null,
          },
        ],
      },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/option=4.*other_acked_by/);
  });
});

// Helper:构造含 scope-entries fenced YAML 块的 proposal.md(沿 9b §2.6.3 anchor 模式)
// v3 codex MAJOR 5 修订:加 triggeredById 参数,允许负例传 999 让反向查找匹配失败
function buildProposalWithScopeEntry(
  entryId: string,
  sectionHeader: string,
  anchorId: 'forge-oos' | 'forge-future-work',
  triggeredById: number = 1, // 默认 1 对齐 basePauseDecision.id=1;负例传非 1 让反向查找失败
): string {
  return `# Proposal: test-change

## What Changes

- baseline change

${sectionHeader} {#${anchorId}}

\`\`\`yaml
schema: forge-scope-entries/v1
anchor_id: ${anchorId}
entries:
  - id: ${entryId}
    category: ${anchorId === 'forge-oos' ? 'out-of-scope' : 'future-work'}
    description: "subagent paused issue"
    reason: "non-blocking, transferred via pause_decisions"
    priority: null
    status: active
    triggered_by:
      source: pause_decisions
      id: ${triggeredById}
    related_change: null
\`\`\`
`;
}
