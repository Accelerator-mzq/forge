// CLI: forge legacy-bridge map — Plan 7 Phase D Task D3 + Task 6.1(默认翻转 agent 模式)
// 默认行为已翻转:map --overwrite → emit manifest(agent 路径);
// --api flag → 进程内调 Anthropic SDK 写 draft yaml + md。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              { path: 'docs/SRS.md', role: 'requirements', modules: ['payment'] },
            ]),
          },
        ],
      }),
    },
  }));
  return { default: Anthropic };
});

vi.mock('../../../forge-eval/load-env.js', () => ({
  loadEnv: () => ({ anthropicApiKey: 'sk-test' }),
}));

describe('forge legacy-bridge map (CLI)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-map-cli-'));
    mkdirSync(join(tmp, 'forge', '.cache'), { recursive: true });
    mkdirSync(join(tmp, 'docs'), { recursive: true });
    writeFileSync(join(tmp, 'docs', 'SRS.md'), '# SRS');
    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n`,
    );
    const configHash = createHash('sha256')
      .update(JSON.stringify({ allow_llm_calls: true }, ['allow_llm_calls']))
      .digest('hex')
      .slice(0, 16);
    writeFileSync(
      join(tmp, 'forge', '.cache', 'llm-ack.yaml'),
      `schema: forge-llm-ack/v1\nacknowledged_at: 2026-05-05T00:00:00Z\nconfig_hash: ${configHash}\n`,
    );
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('默认(无 flag)→ emit manifest 到 .cache,不写 draft yaml(agent 路径)', async () => {
    // Task 6.1:默认行为翻转为 emit manifest;draft yaml 在 --apply 阶段才产出
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } =
        await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'map', '--overwrite']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        // 默认模式:manifest 已写到 .cache
        expect(existsSync(join(tmp, 'forge', '.cache', 'legacy-bridge-task-map.json'))).toBe(true);
        // 默认模式:不直接写 draft yaml(需 --apply 消费结果后才写)
        expect(existsSync(join(tmp, 'forge', 'legacy-anchors-draft.yaml'))).toBe(false);
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('--api flag → 进程内调 SDK → 写 legacy-anchors-draft.yaml + .md', async () => {
    // Task 6.1:--api 模式走进程内 SDK 路径,产出 draft yaml + md
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } =
        await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'map', '--overwrite', '--api']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(existsSync(join(tmp, 'forge', 'legacy-anchors-draft.yaml'))).toBe(true);
        expect(existsSync(join(tmp, 'forge', 'legacy-anchors-draft.md'))).toBe(true);
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
