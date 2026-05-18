// tests/cli/legacy-bridge/optin.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLlmOptIn } from '../../../src/cli/commands/legacy-bridge.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'optin-'));
  await mkdir(join(dir, 'forge'), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('assertLlmOptIn', () => {
  it('config 无 allow_llm_calls → not-ok,reason 提示该字段,graceful=true(合法 opt-out)', async () => {
    await writeFile(join(dir, 'forge', 'config.yaml'), 'legacy_bridge: {}\n', 'utf8');
    const r = await assertLlmOptIn(join(dir, 'forge'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/allow_llm_calls/);
      expect(r.graceful).toBe(true);
    }
  });

  it('config.yaml 缺失 → not-ok,graceful=false(error)', async () => {
    const r = await assertLlmOptIn(join(dir, 'forge'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.graceful).toBe(false);
  });

  it('config.yaml 格式错误 → not-ok,graceful=false', async () => {
    await writeFile(join(dir, 'forge', 'config.yaml'), 'legacy_bridge: [unclosed\n', 'utf8');
    const r = await assertLlmOptIn(join(dir, 'forge'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.graceful).toBe(false);
  });

  it('legacy-anchors.yaml 损坏 → not-ok,graceful=false(不静默绕过 GDPR 门)', async () => {
    await writeFile(
      join(dir, 'forge', 'config.yaml'),
      'legacy_bridge:\n  allow_llm_calls: true\n',
      'utf8',
    );
    await writeFile(
      join(dir, 'forge', 'legacy-anchors.yaml'),
      'schema: forge-legacy-anchor/v1\nanchors: [unclosed\n',
      'utf8',
    );
    const r = await assertLlmOptIn(join(dir, 'forge'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.graceful).toBe(false);
  });
});
