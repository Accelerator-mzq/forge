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
            text: '[{"severity":"minor","section":"§4.5","description":"措辞调整"}]',
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

describe('forge legacy-bridge sync-check (CLI)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-sc-cli-'));
    mkdirSync(join(tmp, 'forge'), { recursive: true });
    writeFileSync(join(tmp, 'forge', 'config.yaml'), 'schema: forge-spec-driven/v1\n');
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('无 legacy-anchors.yaml → graceful skip exit 0(决策 #11)', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'sync-check']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(logSpy.mock.calls.flat().join('\n')).toContain('skipping sync-check');
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('allow_llm_calls=false → graceful skip exit 0(决策 #22)', async () => {
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: docs/legacy/SRS.md\n    authoritative: true\n`,
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'sync-check']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(logSpy.mock.calls.flat().join('\n')).toContain('allow_llm_calls=false');
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('happy path:配 ack + anchors + change → 写 sync-state(P7-12 修复)', async () => {
    // 配置 opt-in
    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n`,
    );
    mkdirSync(join(tmp, 'docs', 'legacy'), { recursive: true });
    writeFileSync(join(tmp, 'docs', 'legacy', 'SRS.md'), '# SRS\n## 1. 支付');
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: ${join(tmp, 'docs', 'legacy', 'SRS.md').replace(/\\/g, '/')}\n    authoritative: true\n    modules: [payment]\n`,
    );
    // change 上下文
    mkdirSync(join(tmp, 'forge', 'changes', 'add-payment', 'specs'), { recursive: true });
    writeFileSync(join(tmp, 'forge', 'changes', 'add-payment', 'proposal.md'), '# 提案');
    writeFileSync(join(tmp, 'forge', 'changes', 'add-payment', 'specs', 'payment.md'), '# spec payment');
    // ack 文件
    mkdirSync(join(tmp, 'forge', '.cache'), { recursive: true });
    const configHash = createHash('sha256')
      .update(JSON.stringify({ allow_llm_calls: true }, ['allow_llm_calls']))
      .digest('hex')
      .slice(0, 16);
    writeFileSync(
      join(tmp, 'forge', '.cache', 'llm-ack.yaml'),
      `schema: forge-llm-ack/v1\nacknowledged_at: 2026-05-05T00:00:00Z\nconfig_hash: ${configHash}\n`,
    );

    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'sync-check', '--change-id', 'add-payment']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        // sync-state 文件被写入(双栈 md + yaml)
        expect(existsSync(join(tmp, 'forge', 'legacy-sync-state', 'add-payment.yaml'))).toBe(true);
        expect(existsSync(join(tmp, 'forge', 'legacy-sync-state', 'add-payment.md'))).toBe(true);
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
