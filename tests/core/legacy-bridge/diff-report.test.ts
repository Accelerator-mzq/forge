import { describe, it, expect } from 'vitest';
import {
  renderDiffMarkdown,
  renderDiffYaml,
  countBySeverity,
  hasCriticalPending,
  normalizeDiffsFromLlm,
  SEVERITY_ORDER,
} from '../../../src/core/legacy-bridge/diff-report.js';
import type { SyncStateFile } from '../../../src/core/legacy-bridge/types.js';
import { parse as parseYaml } from 'yaml';

const sample: SyncStateFile = {
  schema: 'forge-legacy-sync/v1',
  change_id: 'add-payment',
  generated_at: '2026-05-05T10:00:00Z',
  diffs: [
    {
      id: 1,
      severity: 'critical',
      anchor_path: 'docs/legacy/SRS.md',
      section: '§4.5',
      description: '支付幂等性约束变化',
      status: 'pending',
    },
    {
      id: 2,
      severity: 'minor',
      anchor_path: 'docs/legacy/HLD.md',
      description: '术语调整',
      status: 'resolved-by-doc-update',
    },
    {
      id: 3,
      severity: 'major',
      anchor_path: 'docs/legacy/SRS.md',
      description: '新增退款规则',
      status: 'pending',
    },
  ],
};

describe('legacy-bridge/diff-report', () => {
  it('SEVERITY_ORDER 5 档(spec §5)', () => {
    expect(SEVERITY_ORDER).toEqual(['critical', 'major', 'minor', 'style', 'info']);
  });

  it('countBySeverity 正确', () => {
    const c = countBySeverity(sample.diffs);
    expect(c.critical).toBe(1);
    expect(c.major).toBe(1);
    expect(c.minor).toBe(1);
    expect(c.style).toBe(0);
    expect(c.info).toBe(0);
  });

  it('hasCriticalPending true(含 status=pending 的 critical)', () => {
    expect(hasCriticalPending(sample)).toBe(true);
  });

  it('hasCriticalPending false(全部 critical 已 ack)', () => {
    const file: SyncStateFile = {
      ...sample,
      diffs: sample.diffs.map((d) =>
        d.severity === 'critical' ? { ...d, status: 'resolved-by-doc-update' as const } : d,
      ),
    };
    expect(hasCriticalPending(file)).toBe(false);
  });

  it('renderDiffMarkdown 含总览 + 5 档分组', () => {
    const md = renderDiffMarkdown(sample);
    expect(md).toContain('Sync 差异报告:add-payment');
    expect(md).toContain('🔴 critical: 1');
    expect(md).toContain('🟠 major: 1');
    expect(md).toContain('## 🔴 critical (1)');
    expect(md).toContain('支付幂等性约束变化');
    expect(md).toContain('resolve 流程');
  });

  it('renderDiffMarkdown style/info 段无 0 计数小节', () => {
    const md = renderDiffMarkdown(sample);
    expect(md).not.toContain('## ⚪ info');
    expect(md).not.toContain('## 🔵 style');
  });

  it('renderDiffYaml 可被 yaml.parse 反解为同结构', () => {
    const yaml = renderDiffYaml(sample);
    const parsed = parseYaml(yaml) as SyncStateFile;
    expect(parsed.change_id).toBe(sample.change_id);
    expect(parsed.diffs).toHaveLength(3);
  });

  it('normalizeDiffsFromLlm 默认 status=pending + 自增 id', () => {
    const diffs = normalizeDiffsFromLlm([
      { severity: 'major', anchor_path: 'a.md', description: 'd1' },
      { severity: 'minor', anchor_path: 'b.md', description: 'd2' },
    ]);
    expect(diffs[0]?.id).toBe(1);
    expect(diffs[0]?.status).toBe('pending');
    expect(diffs[1]?.id).toBe(2);
  });

  it('cross_anchor_conflicts 段在 markdown 中独立渲染', () => {
    const file: SyncStateFile = {
      ...sample,
      cross_anchor_conflicts: [
        {
          id: 100,
          severity: 'major',
          anchor_path: 'docs/legacy/SRS.md vs docs/legacy/HLD.md',
          description: 'SRS §4.5 与 HLD §6.2 矛盾',
          status: 'pending',
        },
      ],
    };
    const md = renderDiffMarkdown(file);
    expect(md).toContain('跨 anchor 不一致(决策 #18 修订)');
    expect(md).toContain('SRS §4.5 与 HLD §6.2 矛盾');
  });
});
