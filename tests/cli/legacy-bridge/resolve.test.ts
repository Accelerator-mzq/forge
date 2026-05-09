import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

describe('forge legacy-bridge resolve (CLI)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-resolve-cli-'));
    mkdirSync(join(tmp, 'forge', 'legacy-sync-state'), { recursive: true });
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('happy path — 全 ack → exit 0', async () => {
    writeFileSync(
      join(tmp, 'forge', 'legacy-sync-state', 'add-x.yaml'),
      stringifyYaml({
        schema: 'forge-legacy-sync/v1',
        change_id: 'add-x',
        generated_at: '2026-05-05T00:00:00Z',
        diffs: [
          { id: 1, severity: 'critical', anchor_path: 'a.md', description: 'd1', status: 'resolved-by-doc-update' },
        ],
      }),
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'resolve', 'add-x']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(logSpy.mock.calls.flat().join('\n')).toContain('全部 diffs 已 ack');
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('仍有 pending → exit 2', async () => {
    writeFileSync(
      join(tmp, 'forge', 'legacy-sync-state', 'add-x.yaml'),
      stringifyYaml({
        schema: 'forge-legacy-sync/v1',
        change_id: 'add-x',
        generated_at: '2026-05-05T00:00:00Z',
        diffs: [
          { id: 1, severity: 'critical', anchor_path: 'a.md', description: 'd1', status: 'pending' },
        ],
      }),
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'resolve', 'add-x']);
        expect(exitSpy).toHaveBeenCalledWith(2);
        expect(errSpy.mock.calls.flat().join('\n')).toContain('pending');
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('非法 status → exit 1', async () => {
    writeFileSync(
      join(tmp, 'forge', 'legacy-sync-state', 'add-x.yaml'),
      stringifyYaml({
        schema: 'forge-legacy-sync/v1',
        change_id: 'add-x',
        generated_at: '2026-05-05T00:00:00Z',
        diffs: [
          { id: 1, severity: 'critical', anchor_path: 'a.md', description: 'd1', status: 'random-string' },
        ],
      }),
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'resolve', 'add-x']);
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
