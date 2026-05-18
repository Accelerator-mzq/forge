// CLI: forge legacy-bridge index — Plan 7 Phase D Task D3
// Task 6.2 更新:index 默认走 agent 路径(emit manifest);--api 才直接写 index.md
// happy path:已有 legacy-anchors.yaml → emit manifest(新 agent 路径)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '本文档总结订单与支付的核心需求,大约 100 字以内的摘要。' }],
      }),
    },
  }));
  return { default: Anthropic };
});

vi.mock('../../../forge-eval/load-env.js', () => ({
  loadEnv: () => ({ anthropicApiKey: 'sk-test' }),
}));

describe('forge legacy-bridge index (CLI)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-idx-cli-'));
    mkdirSync(join(tmp, 'forge', '.cache'), { recursive: true });
    mkdirSync(join(tmp, 'docs', 'legacy'), { recursive: true });
    writeFileSync(join(tmp, 'docs', 'legacy', 'SRS.md'), '# SRS');

    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n`,
    );
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: ${join(tmp, 'docs', 'legacy', 'SRS.md').replace(/\\/g, '/')}\n    authoritative: true\n`,
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

  it('happy path(默认 agent 路径)→ emit manifest 到 .cache(Task 6.2 新行为)', async () => {
    // Task 6.2:默认翻转 → emit manifest,不调 LLM,不直接写 index.md
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } =
        await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      try {
        await cmd.parseAsync(['node', 'forge', 'index']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        // 新行为:manifest 已写到 .cache;index.md 不写(agent 路径)
        expect(existsSync(join(tmp, 'forge', '.cache', 'legacy-bridge-task-index.json'))).toBe(
          true,
        );
        // Anthropic SDK 不被调(无 LLM 调用):index.md 不存在
        expect(existsSync(join(tmp, 'forge', 'docs', 'index.md'))).toBe(false);
      } finally {
        exitSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('--api 路径 → 直接调 LLM → 写 forge/docs/index.md', async () => {
    // --api 路径才直接写 index.md(与旧 happy path 等价)
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } =
        await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      try {
        await cmd.parseAsync(['node', 'forge', 'index', '--api']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(existsSync(join(tmp, 'forge', 'docs', 'index.md'))).toBe(true);
      } finally {
        exitSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
