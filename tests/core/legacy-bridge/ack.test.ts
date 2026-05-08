import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeConfigHash,
  checkAck,
  writeAck,
  renderOptinPrompt,
} from '../../../src/core/legacy-bridge/ack.js';
import type { ForgeConfig } from '../../../src/core/schema/types.js';
import type { LegacyAnchorsFile } from '../../../src/core/legacy-bridge/types.js';

describe('legacy-bridge/ack', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-ack-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const baseConfig: ForgeConfig = {
    schema: 'forge-spec-driven/v1',
    legacy_bridge: { allow_llm_calls: true },
  };

  it('computeConfigHash 对 legacy_bridge 段稳定', () => {
    const h1 = computeConfigHash(baseConfig);
    const h2 = computeConfigHash({ ...baseConfig });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
  });

  it('config 变化 → hash 变(强制重新 ack)', () => {
    const h1 = computeConfigHash(baseConfig);
    const h2 = computeConfigHash({
      ...baseConfig,
      legacy_bridge: { allow_llm_calls: true, enforce_sync: true },
    });
    expect(h1).not.toBe(h2);
  });

  it('allow_llm_calls=false → checkAck reason=allow_llm_calls=false', async () => {
    const r = await checkAck(dir, { schema: 'forge-spec-driven/v1' }, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('allow_llm_calls=false');
  });

  it('allow_llm_calls=true 但无 ack 文件 → reason=ack-missing', async () => {
    const r = await checkAck(dir, baseConfig, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ack-missing');
  });

  it('writeAck + checkAck → ok=true', async () => {
    await writeAck(dir, baseConfig);
    const r = await checkAck(dir, baseConfig, null);
    expect(r.ok).toBe(true);
  });

  it('ack 写入后改 config → reason=ack-stale-config-changed', async () => {
    await writeAck(dir, baseConfig);
    const newConfig: ForgeConfig = {
      ...baseConfig,
      legacy_bridge: { allow_llm_calls: true, enforce_sync: true },
    };
    const r = await checkAck(dir, newConfig, null);
    expect(r.reason).toBe('ack-stale-config-changed');
  });

  it('含 customer_data anchor + ack 未 customer_data_acknowledged → reason=customer-data-not-acknowledged', async () => {
    await writeAck(dir, baseConfig, false);
    const anchors: LegacyAnchorsFile = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        {
          role: 'requirements',
          path: 'docs/legacy/SRS.md',
          authoritative: true,
          contains_customer_data: true,
        },
      ],
    };
    const r = await checkAck(dir, baseConfig, anchors);
    expect(r.reason).toBe('customer-data-not-acknowledged');
    expect(r.customerDataPaths).toEqual(['docs/legacy/SRS.md']);
  });

  it('含 customer_data anchor + ack 已 customer_data_acknowledged=true → ok', async () => {
    await writeAck(dir, baseConfig, true);
    const anchors: LegacyAnchorsFile = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        {
          role: 'requirements',
          path: 'docs/legacy/SRS.md',
          authoritative: true,
          contains_customer_data: true,
        },
      ],
    };
    const r = await checkAck(dir, baseConfig, anchors);
    expect(r.ok).toBe(true);
  });

  it('renderOptinPrompt 各 reason 各自渲染', () => {
    expect(renderOptinPrompt('allow_llm_calls=false')).toContain('Anthropic API');
    expect(renderOptinPrompt('ack-stale-config-changed')).toContain('已过期');
    expect(renderOptinPrompt('customer-data-not-acknowledged', ['a.md', 'b.md'])).toContain(
      '- a.md',
    );
  });

  // C1 修验证:空 ack 文件(writeFile 中途中断模拟)→ reason=ack-missing,不抛 TypeError
  it('空 ack 文件 → reason=ack-missing(C1 修;不崩溃)', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, '.cache'), { recursive: true });
    await writeFile(join(dir, '.cache', 'llm-ack.yaml'), '', 'utf8');
    const r = await checkAck(dir, baseConfig, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ack-missing');
  });

  it('损坏 yaml ack 文件 → reason=ack-missing(C1 修)', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, '.cache'), { recursive: true });
    await writeFile(join(dir, '.cache', 'llm-ack.yaml'), 'not: [valid yaml: }}', 'utf8');
    const r = await checkAck(dir, baseConfig, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ack-missing');
  });
});
