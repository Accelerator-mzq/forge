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

  it('无 legacy-anchors.yaml → graceful skip exit 0(决策 #11)(Task 6.2:统一 opt-in gate 路径)', async () => {
    // Task 6.2:runSyncCheckCommand 先过 assertLlmOptIn gate;
    // config 无 allow_llm_calls → graceful=true → exit 0(新行为:错误信息在 console.error)
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } =
        await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'sync-check']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        // graceful skip 原因包含 allow_llm_calls 相关文字
        expect(errSpy.mock.calls.flat().join('\n')).toContain('allow_llm_calls');
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('allow_llm_calls=false → graceful skip exit 0(决策 #22)(Task 6.2:统一 opt-in gate 路径)', async () => {
    // Task 6.2:runSyncCheckCommand 先过 assertLlmOptIn;allow_llm_calls 缺失 → graceful skip exit 0
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: docs/legacy/SRS.md\n    authoritative: true\n`,
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } =
        await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'sync-check']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        // 错误信息包含 allow_llm_calls
        expect(errSpy.mock.calls.flat().join('\n')).toContain('allow_llm_calls');
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('happy path(默认 agent 路径):配 ack + anchors + change → emit manifest(Task 6.2 新行为)', async () => {
    // Task 6.2:默认翻转 → emit manifest 而非直接写 sync-state
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
    // change 上下文(specs/payment.md → affectedModules=['payment'],匹配 anchor.modules=['payment'])
    mkdirSync(join(tmp, 'forge', 'changes', 'add-payment', 'specs'), { recursive: true });
    writeFileSync(join(tmp, 'forge', 'changes', 'add-payment', 'proposal.md'), '# 提案');
    writeFileSync(
      join(tmp, 'forge', 'changes', 'add-payment', 'specs', 'payment.md'),
      '# spec payment',
    );
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
      const { buildLegacyBridgeCommand } =
        await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      try {
        await cmd.parseAsync(['node', 'forge', 'sync-check', '--change-id', 'add-payment']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        // 新行为:manifest 已 emit,sync-state 文件不写(agent 路径)
        expect(existsSync(join(tmp, 'forge', '.cache', 'legacy-bridge-task-sync-check.json'))).toBe(
          true,
        );
        // sync-state 文件还未写(等 agent fulfill 后跑 --apply 才写)
        expect(existsSync(join(tmp, 'forge', 'legacy-sync-state', 'add-payment.yaml'))).toBe(false);
      } finally {
        exitSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
