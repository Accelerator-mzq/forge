// archive-pause-fence.test.ts — plan-9c Task 2 单测
// 沿 verify-findings-fence.test.ts 同模式,覆盖 5 fence 分支 + 边界 case
// 校验范围:option 1-4 业务规则 + CRITICAL 重定向 + ack 校验 + marker 缺失老兼容

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
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

// helper:在 git repo 内建 change + proposal.md,baseline commit 后按 mutate 改 proposal.md(不 commit)
function setupGitChange(opts: {
  proposalBaseline: string;
  proposalMutated: string;
  tasksBaseline: string;
  tasksMutated?: string;
}): { repoRoot: string; changeDir: string } {
  const repoRoot = mkdtempSync(join(tmpdir(), 'forge-opt1-'));
  execFileSync('git', ['init', '-q'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repoRoot });
  const changeDir = join(repoRoot, 'forge', 'changes', 'c1');
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(join(changeDir, 'proposal.md'), opts.proposalBaseline);
  writeFileSync(join(changeDir, 'tasks.md'), opts.tasksBaseline);
  execFileSync('git', ['add', '-A'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-q', '-m', 'baseline'], { cwd: repoRoot });
  // mutate(留工作树未提交 —— 模拟 Fluid Pause 的 proposal.md 改动)
  writeFileSync(join(changeDir, 'proposal.md'), opts.proposalMutated);
  if (opts.tasksMutated) writeFileSync(join(changeDir, 'tasks.md'), opts.tasksMutated);
  return { repoRoot, changeDir };
}

// option=1 diff 段级校验专用 decision fixture
const OPT1_DECISION = {
  id: 1,
  paused_at: '2026-05-12T14:30:00Z',
  task_ref: 'tasks.md#task-1',
  issue_summary: 'expand scope',
  severity: 'WARNING' as const,
  severity_acked_by: 'msc',
  severity_acked_at: '2026-05-12T14:32:00Z',
  chosen_option: 1 as const,
  target_artifact: 'proposal.md',
  target_anchor: '## What Changes',
  non_blocking_rationale: null,
  other_rationale: null,
  other_acked_by: null,
};

describe('option=1 diff 段级校验', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('attack:marker 声称改 proposal ## What Changes,实际 diff 只改 tasks.md → 拒签', async () => {
    const { repoRoot, changeDir } = setupGitChange({
      proposalBaseline: '# P\n\n## What Changes\n\n- a\n\n## Impact\n\n- x\n',
      proposalMutated: '# P\n\n## What Changes\n\n- a\n\n## Impact\n\n- x\n', // proposal 未改
      tasksBaseline: '# Tasks\n\n- [ ] task-1: t\n',
      tasksMutated: '# Tasks\n\n- [x] task-1: t\n', // 只改了 tasks.md
    });
    dirs.push(repoRoot);
    const result = await validatePauseDecisionsFence(
      { pause_decisions: [OPT1_DECISION] },
      changeDir,
      repoRoot,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /What Changes.*变更|diff/.test(e.message))).toBe(true);
  });

  it('happy path:proposal ## What Changes 段确有新增行 → 通过', async () => {
    const { repoRoot, changeDir } = setupGitChange({
      proposalBaseline: '# P\n\n## What Changes\n\n- a\n\n## Impact\n\n- x\n',
      proposalMutated: '# P\n\n## What Changes\n\n- a\n- b (扩 scope)\n\n## Impact\n\n- x\n',
      tasksBaseline: '# Tasks\n\n- [x] task-1: t\n',
    });
    dirs.push(repoRoot);
    const result = await validatePauseDecisionsFence(
      { pause_decisions: [OPT1_DECISION] },
      changeDir,
      repoRoot,
    );
    expect(result.valid).toBe(true);
  });

  it('proposal.md 带 frontmatter → ## What Changes 段行号对齐正确', async () => {
    const fm = '---\ntitle: P\n---\n';
    const { repoRoot, changeDir } = setupGitChange({
      proposalBaseline: fm + '# P\n\n## What Changes\n\n- a\n\n## Impact\n\n- x\n',
      proposalMutated: fm + '# P\n\n## What Changes\n\n- a\n- b\n\n## Impact\n\n- x\n',
      tasksBaseline: '# Tasks\n\n- [x] task-1: t\n',
    });
    dirs.push(repoRoot);
    const result = await validatePauseDecisionsFence(
      { pause_decisions: [OPT1_DECISION] },
      changeDir,
      repoRoot,
    );
    expect(result.valid).toBe(true);
  });

  it('非 git 项目 → diff 校验 N/A,降级到字段校验(通过)', async () => {
    const changeDir = mkdtempSync(join(tmpdir(), 'forge-opt1-nogit-'));
    dirs.push(changeDir);
    // repoRoot 非 git → 降级;字段校验:target_artifact/target_anchor 合法 → 通过
    const result = await validatePauseDecisionsFence(
      { pause_decisions: [OPT1_DECISION] },
      changeDir,
      changeDir,
    );
    expect(result.valid).toBe(true);
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
