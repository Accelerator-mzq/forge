// tests/core/validate/scope-entries.test.ts(v3 修订:context 去 runId)
import { describe, it, expect } from 'vitest';
import { validateScopeEntries } from '../../../src/core/validate/scope-entries.js';

// v3 B1 修订:context 仅含稳定字段,不含 ephemeral runId
const ctx = {
  contentHash: 'sha256:abc',
  gitHead: 'deadbeef',
};

describe('validateScopeEntries(plan-9b v2 Task 4)', () => {
  const baseFile = '/tmp/proposal.md';

  it('valid YAML block + 字段全 → ok', () => {
    const text = [
      '# P',
      '## Why\n\nw',
      '## What\n\nc',
      '## Out of Scope {#forge-oos}',
      '',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a-thing',
      '    category: out-of-scope',
      '    description: desc',
      '    reason: because',
      '    priority: medium',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
      '',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(true);
  });

  it('YAML 语法错 → CRITICAL finding,severity 标 CRITICAL', () => {
    // 使用真实非法 YAML 语法触发 FencedYamlParseError(': invalid' 在 yaml 包里合法,改用 '{unclosed')
    const text = '## Out of Scope {#forge-oos}\n\n```yaml\n{unclosed: [bad\n```\n';
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.severity).toBe('CRITICAL');
    expect(r.errors[0]?.message).toMatch(/yaml.*parse/i);
  });

  it('finding_hash 稳定:同 ctx 下两次调用产同 hash(v3 B1 修订:去 ephemeral runId)', () => {
    const text = [
      '## Out of Scope {#forge-oos}\n',
      '```yaml',
      'schema: other/v1',
      'anchor_id: forge-oos',
      'entries: []',
      '```',
    ].join('\n');
    const r1 = validateScopeEntries(text, baseFile, ctx);
    const r2 = validateScopeEntries(text, baseFile, ctx);
    expect(r1.errors[0]?.finding_hash).toBe(r2.errors[0]?.finding_hash);
  });

  it('finding_hash 是真实绑定(不同 contentHash → 不同 hash)', () => {
    const text =
      '## Out of Scope {#forge-oos}\n\n```yaml\nschema: bad/v1\nanchor_id: forge-oos\nentries: []\n```\n';
    const r1 = validateScopeEntries(text, baseFile, ctx);
    const r2 = validateScopeEntries(text, baseFile, { ...ctx, contentHash: 'sha256:different' });
    expect(r1.errors[0]?.finding_hash).not.toBe(r2.errors[0]?.finding_hash);
  });

  it('schema 字段不对 → CRITICAL', () => {
    const text =
      '## Out of Scope {#forge-oos}\n\n```yaml\nschema: other/v1\nanchor_id: forge-oos\nentries: []\n```\n';
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('schema');
    expect(r.errors[0]?.severity).toBe('CRITICAL');
  });

  it('anchor_id 与 enclosing section anchor 不一致 → CRITICAL', () => {
    const text =
      '## Future Work {#forge-future-work}\n\n```yaml\nschema: forge-scope-entries/v1\nanchor_id: forge-oos\nentries: []\n```\n';
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toMatch(/anchor_id/);
  });

  it('entries[].reason 空 → CRITICAL', () => {
    const text = [
      '## Out of Scope {#forge-oos}\n',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a',
      '    category: out-of-scope',
      '    description: d',
      '    reason: ""',
      '    priority: null',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('entries[0].reason');
  });

  it('entries[].category ≠ anchor_id 默认映射 → CRITICAL', () => {
    const text = [
      '## Out of Scope {#forge-oos}\n',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a',
      '    category: future-work',
      '    description: d',
      '    reason: r',
      '    priority: null',
      '    status: active',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('entries[0].category');
  });

  it('entries[].status 非法 → CRITICAL', () => {
    const text = [
      '## Out of Scope {#forge-oos}\n',
      '```yaml',
      'schema: forge-scope-entries/v1',
      'anchor_id: forge-oos',
      'entries:',
      '  - id: a',
      '    category: out-of-scope',
      '    description: d',
      '    reason: r',
      '    priority: null',
      '    status: pending',
      '    triggered_by: null',
      '    related_change: null',
      '```',
    ].join('\n');
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.field).toBe('entries[0].status');
  });

  it('无 scope section / 无 yaml block → ok(老 change 兼容)', () => {
    const text = '# P\n\n## Why\n\nw\n\n## What\n\nc\n';
    const r = validateScopeEntries(text, baseFile, ctx);
    expect(r.valid).toBe(true);
  });
});
