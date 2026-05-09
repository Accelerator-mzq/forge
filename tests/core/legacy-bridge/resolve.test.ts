import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import {
  validateSyncState,
  checkAllAcked,
  resolveSyncState,
  ResolveError,
} from '../../../src/core/legacy-bridge/resolve.js';
import type { SyncStateFile } from '../../../src/core/legacy-bridge/types.js';

const baseFile: SyncStateFile = {
  schema: 'forge-legacy-sync/v1',
  change_id: 'add-x',
  generated_at: '2026-05-05T00:00:00Z',
  diffs: [
    {
      id: 1,
      severity: 'critical',
      anchor_path: 'a.md',
      description: 'd1',
      status: 'resolved-by-doc-update',
    },
    {
      id: 2,
      severity: 'minor',
      anchor_path: 'b.md',
      description: 'd2',
      status: 'false-positive',
      reason: 'LLM 误判',
    },
    {
      id: 3,
      severity: 'info',
      anchor_path: 'c.md',
      description: 'd3',
      status: 'skipped',
    },
  ],
};

describe('legacy-bridge/resolve.validateSyncState', () => {
  it('合法 status 通过', () => {
    expect(() => validateSyncState(baseFile, 'add-x')).not.toThrow();
  });

  it('非法 status → 抛 ResolveError(invalid-status)', () => {
    const bad: SyncStateFile = {
      ...baseFile,
      diffs: [
        {
          ...baseFile.diffs[0]!,
          status: 'random-string' as never,
        },
      ],
    };
    try {
      validateSyncState(bad, 'add-x');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResolveError);
      expect((err as ResolveError).kind).toBe('invalid-status');
    }
  });
});

describe('legacy-bridge/resolve.checkAllAcked', () => {
  it('全 ack → 通过', () => {
    expect(() => checkAllAcked(baseFile, 'add-x')).not.toThrow();
  });

  it('仍有 pending → 抛错(决策 #19)', () => {
    const f: SyncStateFile = {
      ...baseFile,
      diffs: [{ ...baseFile.diffs[0]!, status: 'pending' }],
    };
    try {
      checkAllAcked(f, 'add-x');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResolveError);
      expect((err as ResolveError).kind).toBe('pending-remaining');
      expect((err as ResolveError).details?.pending).toContain(1);
    }
  });

  it('cross_anchor_conflicts 含 pending → 也抛', () => {
    const f: SyncStateFile = {
      ...baseFile,
      cross_anchor_conflicts: [
        {
          id: 100,
          severity: 'major',
          anchor_path: 'x',
          description: 'cross',
          status: 'pending',
        },
      ],
    };
    expect(() => checkAllAcked(f, 'add-x')).toThrow(/pending/);
  });
});

describe('legacy-bridge/resolve.resolveSyncState', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-resolve-'));
    mkdirSync(join(dir, 'legacy-sync-state'), { recursive: true });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('文件不存在 → 抛 state-not-found', async () => {
    try {
      await resolveSyncState(dir, 'no-such');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResolveError);
      expect((err as ResolveError).kind).toBe('state-not-found');
    }
  });

  it('全 ack 文件 → 写回成功', async () => {
    writeFileSync(
      join(dir, 'legacy-sync-state', 'add-x.yaml'),
      stringifyYaml(baseFile),
    );
    const r = await resolveSyncState(dir, 'add-x');
    expect(r.change_id).toBe('add-x');
  });

  it('仍有 pending → 抛 pending-remaining', async () => {
    const file: SyncStateFile = {
      ...baseFile,
      diffs: [{ ...baseFile.diffs[0]!, status: 'pending' }],
    };
    writeFileSync(
      join(dir, 'legacy-sync-state', 'add-x.yaml'),
      stringifyYaml(file),
    );
    try {
      await resolveSyncState(dir, 'add-x');
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as ResolveError).kind).toBe('pending-remaining');
    }
  });
});
