// tests/migrate/ack.test.ts
// migrate 专属 ack test — Plan 8e Task 5.1
import { describe, it, expect } from 'vitest';
import {
  renderMigratePrompt,
  writeMigrateAck,
  checkMigrateAck,
} from '../../src/core/migrate/ack.js';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('renderMigratePrompt — migrate 专属', () => {
  it('文案不含 brownfield 字串', () => {
    const prompt = renderMigratePrompt({
      source: 'openspec',
      estimatedCostUsd: 3.5,
    });
    expect(prompt).toContain('forge migrate');
    expect(prompt).toContain('openspec');
    expect(prompt).toContain('$3.5');
    expect(prompt).not.toContain('docs/legacy/');
    expect(prompt).not.toContain('legacy-bridge');
  });

  it('superpowers source 显示 docs/superpowers/ 路径', () => {
    const prompt = renderMigratePrompt({
      source: 'superpowers',
      estimatedCostUsd: 7.2,
    });
    expect(prompt).toContain('superpowers');
    expect(prompt).toContain('docs/superpowers');
    expect(prompt).toContain('$7.2');
  });
});

describe('writeMigrateAck / checkMigrateAck', () => {
  it('write 后 check 通过', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-ack-'));
    await mkdir(join(tmp, 'forge/.forge-ack'), { recursive: true });
    const ts = '2026-05-10T00-00-00Z';
    await writeMigrateAck(join(tmp, 'forge'), ts, {
      source: 'openspec',
      estimatedCostUsd: 3.5,
    });
    const r = await checkMigrateAck(join(tmp, 'forge'), ts);
    expect(r.ok).toBe(true);
    await rm(tmp, { recursive: true, force: true });
  });

  it('ack 文件不存在 → ok=false reason=ack-missing', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-ack-missing-'));
    await mkdir(join(tmp, 'forge/.forge-ack'), { recursive: true });
    const r = await checkMigrateAck(join(tmp, 'forge'), '2026-05-10T00-00-00Z');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ack-missing');
    await rm(tmp, { recursive: true, force: true });
  });

  it('ack 文件 schema 错 → ok=false reason=ack-corrupt', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-ack-corrupt-'));
    await mkdir(join(tmp, 'forge/.forge-ack'), { recursive: true });
    const ts = '2026-05-10T00-00-00Z';
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(tmp, 'forge/.forge-ack', `migrate-${ts}.yaml`),
      'schema: wrong-schema/v0\n',
    );
    const r = await checkMigrateAck(join(tmp, 'forge'), ts);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ack-corrupt');
    await rm(tmp, { recursive: true, force: true });
  });
});
