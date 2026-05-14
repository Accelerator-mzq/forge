import { describe, it, expect } from 'vitest';
import {
  SCOPE_CATEGORY_VALUES,
  SCOPE_STATUS_VALUES,
  SCOPE_ANCHOR_IDS,
  isScopeCategory,
  isScopeStatus,
  isScopeAnchorId,
  type ScopeEntry,
  type SupersedingRef,
  type ScopeEntriesBlock,
} from '../../../src/core/schemas/scope-entries.js';

describe('scope-entries schema', () => {
  it('三个 category enum 值', () => {
    expect(SCOPE_CATEGORY_VALUES).toEqual(['out-of-scope', 'non-goal', 'future-work']);
  });

  it('五个 status enum 值', () => {
    expect(SCOPE_STATUS_VALUES).toEqual([
      'active',
      'inherited',
      'superseded',
      'completed',
      'obsolete',
    ]);
  });

  it('三个 anchor ID', () => {
    expect(SCOPE_ANCHOR_IDS).toEqual(['forge-oos', 'forge-non-goals', 'forge-future-work']);
  });

  it('isScopeCategory 严格判别', () => {
    expect(isScopeCategory('out-of-scope')).toBe(true);
    expect(isScopeCategory('OUT-OF-SCOPE')).toBe(false);
    expect(isScopeCategory('')).toBe(false);
    expect(isScopeCategory(null)).toBe(false);
  });

  it('isScopeStatus 严格判别', () => {
    expect(isScopeStatus('active')).toBe(true);
    expect(isScopeStatus('pending')).toBe(false);
  });

  it('isScopeAnchorId 严格判别', () => {
    expect(isScopeAnchorId('forge-oos')).toBe(true);
    expect(isScopeAnchorId('oos')).toBe(false);
  });

  it('ScopeEntry 类型字段完整(structural check)', () => {
    const entry: ScopeEntry = {
      id: 'oauth-refresh-grace-period',
      category: 'out-of-scope',
      description: 'desc',
      reason: 'reason text',
      priority: 'medium',
      status: 'active',
      triggered_by: null,
      related_change: null,
    };
    expect(entry.id).toBe('oauth-refresh-grace-period');
  });

  it('SupersedingRef 类型字段完整', () => {
    const ref: SupersedingRef = {
      source_change: '2026-05-12-add-oauth-refresh',
      entry_id: 'oauth-refresh-grace-period',
      new_status: 'superseded',
      rationale: 'implemented in this change',
    };
    expect(ref.new_status).toBe('superseded');
  });

  it('ScopeEntriesBlock 顶级三字段', () => {
    const block: ScopeEntriesBlock = {
      schema: 'forge-scope-entries/v1',
      anchor_id: 'forge-oos',
      entries: [],
      superseding_entries: [],
    };
    expect(block.schema).toBe('forge-scope-entries/v1');
  });
});
