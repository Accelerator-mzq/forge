import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        // LLM 返 critical → preflight 应阻塞
        content: [{ type: 'text', text: '[{"severity":"critical","section":"§4.5","description":"幂等约束变化"}]' }],
      }),
    },
  }));
  return { default: Anthropic };
});

vi.mock('../../../forge-eval/load-env.js', () => ({
  loadEnv: () => ({ anthropicApiKey: 'sk-test' }),
}));

describe('forge archive 集成 brownfield preflight + post-archive', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-archive-bf-'));
    mkdirSync(join(tmp, 'forge', 'changes', 'add-payment', 'specs'), { recursive: true });
    mkdirSync(join(tmp, 'forge', '.cache'), { recursive: true });
    mkdirSync(join(tmp, 'docs', 'legacy'), { recursive: true });

    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n  enforce_sync: true\n`,
    );
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: ${join(tmp, 'docs', 'legacy', 'SRS.md').replace(/\\/g, '/')}\n    authoritative: true\n    modules: [payment]\n`,
    );
    writeFileSync(join(tmp, 'docs', 'legacy', 'SRS.md'), '# SRS\n## 1. 支付');
    writeFileSync(join(tmp, 'forge', 'changes', 'add-payment', 'proposal.md'), '# 提案');
    writeFileSync(join(tmp, 'forge', 'changes', 'add-payment', 'specs', 'payment.md'), '# spec');

    // ack 文件
    const configHash = createHash('sha256')
      .update(JSON.stringify(
        { allow_llm_calls: true, enforce_sync: true },
        ['allow_llm_calls', 'enforce_sync'],
      ))
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

  it('enforce_sync=true + LLM 返 critical → archive preflight 阻塞 exit 2', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { runArchivePreflight } = await import('../../../src/cli/commands/archive.js');
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await runArchivePreflight(join(tmp, 'forge'), 'add-payment').catch(() => undefined);
        expect(exitSpy).toHaveBeenCalledWith(2);
        expect(errSpy.mock.calls.flat().join('\n')).toContain('critical 差异未 resolve');
        // sync-state 文件应已写
        expect(existsSync(join(tmp, 'forge', 'legacy-sync-state', 'add-payment.yaml'))).toBe(true);
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('enforce_sync=false → preflight 跳过', async () => {
    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n  enforce_sync: false\n`,
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { runArchivePreflight } = await import('../../../src/cli/commands/archive.js');
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      try {
        await runArchivePreflight(join(tmp, 'forge'), 'add-payment');
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('无 legacy-anchors.yaml → preflight 跳过(graceful)', async () => {
    rmSync(join(tmp, 'forge', 'legacy-anchors.yaml'));
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { runArchivePreflight } = await import('../../../src/cli/commands/archive.js');
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      try {
        await runArchivePreflight(join(tmp, 'forge'), 'add-payment');
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
