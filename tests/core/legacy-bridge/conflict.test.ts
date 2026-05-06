import { describe, it, expect } from 'vitest';
import {
  resolveSameRole,
  decideCrossRole,
  resolveAuthoritativeForAllRoles,
  ROLE_PRIORITY,
} from '../../../src/core/legacy-bridge/conflict.js';
import type { LegacyAnchor } from '../../../src/core/legacy-bridge/types.js';

describe('legacy-bridge/conflict.resolveSameRole', () => {
  it('单版本 authoritative=true → 直接返回', () => {
    const r = resolveSameRole([{ role: 'requirements', path: 'srs.md', authoritative: true }]);
    expect(r.chosen.path).toBe('srs.md');
    expect(r.reason).toBe('sole-authoritative');
  });

  it('多版本 → 仅 authoritative=true 那条', () => {
    const r = resolveSameRole([
      { role: 'requirements', path: 'srs-v1.md', authoritative: false },
      { role: 'requirements', path: 'srs-v2.md', authoritative: true },
      { role: 'requirements', path: 'srs-v3-draft.md', authoritative: false },
    ]);
    expect(r.chosen.path).toBe('srs-v2.md');
    expect(r.skipped?.map((a) => a.path)).toEqual(['srs-v1.md', 'srs-v3-draft.md']);
  });

  it('无 authoritative=true → 抛错', () => {
    expect(() =>
      resolveSameRole([{ role: 'requirements', path: 'srs.md', authoritative: false }]),
    ).toThrow(/无 authoritative=true/);
  });

  // I2 修验证:混合 role 数组 → 抛错(防 caller 误用)
  it('混合 role 的 anchors 数组 → 抛错(I2 修)', () => {
    expect(() =>
      resolveSameRole([
        { role: 'requirements', path: 'srs.md', authoritative: true },
        { role: 'high-level-design', path: 'hld.md', authoritative: true },
      ]),
    ).toThrow(/混合 role/);
  });
});

describe('legacy-bridge/conflict.decideCrossRole', () => {
  const a: LegacyAnchor = { role: 'requirements', path: 'srs.md', authoritative: true };
  const b: LegacyAnchor = { role: 'high-level-design', path: 'hld.md', authoritative: true };

  it('autoResolve=false(默认)→ enter-diff', () => {
    const r = decideCrossRole([a, b], { mtimeOf: () => 0, autoResolve: false });
    expect(r.kind).toBe('enter-diff');
    if (r.kind === 'enter-diff') {
      expect(r.conflictingRoles.sort()).toEqual(['high-level-design', 'requirements']);
    }
  });

  it('autoResolve=true + mtime 不同 → mtime-newer', () => {
    const r = decideCrossRole([a, b], {
      mtimeOf: (p) => (p === 'hld.md' ? 200 : 100),
      autoResolve: true,
    });
    expect(r.kind).toBe('auto-resolved');
    if (r.kind === 'auto-resolved') {
      expect(r.chosen.path).toBe('hld.md');
      expect(r.reason).toBe('mtime-newer');
    }
  });

  it('autoResolve=true + mtime 相同 → role-priority(requirements 胜)', () => {
    const r = decideCrossRole([b, a], {
      mtimeOf: () => 100,
      autoResolve: true,
    });
    expect(r.kind).toBe('auto-resolved');
    if (r.kind === 'auto-resolved') {
      expect(r.chosen.role).toBe('requirements');
      expect(r.reason).toBe('role-priority');
    }
  });

  // C1 修验证:有 mtime 更小的 anchor(loser)不应让 reason 误报 mtime-newer
  it('autoResolve=true + 部分 anchor mtime 更小(非竞争者)→ reason 是 role-priority(C1 修)', () => {
    const c: LegacyAnchor = { role: 'low-level-design', path: 'lld.md', authoritative: true };
    // a/b 同 mtime=100, c.mtime=50 → winner 由 role-priority 在 a/b 间挑出,c 不参与;
    // 修前 allSameMtime 因 c=50 → false → 错报 mtime-newer
    const r = decideCrossRole([a, b, c], {
      mtimeOf: (p) => (p === 'lld.md' ? 50 : 100),
      autoResolve: true,
    });
    expect(r.kind).toBe('auto-resolved');
    if (r.kind === 'auto-resolved') {
      expect(r.chosen.role).toBe('requirements');
      expect(r.reason).toBe('role-priority');
    }
  });

  // I1 修验证:conflicting=[] 在两路径都抛错(原本只在 autoResolve=true 抛)
  it('conflicting=[] 在两路径都抛错(I1 修)', () => {
    expect(() => decideCrossRole([], { mtimeOf: () => 0, autoResolve: false })).toThrow(
      /conflicting 为空/,
    );
    expect(() => decideCrossRole([], { mtimeOf: () => 0, autoResolve: true })).toThrow(
      /conflicting 为空/,
    );
  });

  it('ROLE_PRIORITY 顺序合理(requirements 第一,acceptance-report 最后)', () => {
    expect(ROLE_PRIORITY[0]).toBe('requirements');
    expect(ROLE_PRIORITY[ROLE_PRIORITY.length - 1]).toBe('acceptance-report');
  });
});

describe('legacy-bridge/conflict.resolveAuthoritativeForAllRoles', () => {
  it('多 role 各自独立解析', () => {
    const file = {
      schema: 'forge-legacy-anchor/v1' as const,
      anchors: [
        { role: 'requirements' as const, path: 'srs-v1.md', authoritative: false },
        { role: 'requirements' as const, path: 'srs-v2.md', authoritative: true },
        { role: 'high-level-design' as const, path: 'hld.md', authoritative: true },
      ],
    };
    const r = resolveAuthoritativeForAllRoles(file);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.chosen.role).sort()).toEqual(['high-level-design', 'requirements']);
  });
});
