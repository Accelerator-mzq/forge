import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const FIXTURE_FACT =
  '# 复写\n## 1. 章节\n这是 LLM 返回的复写内容,长度足够。Order 表 user_id 字段非空。Idempotency-Key 头部强制。';

vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: FIXTURE_FACT }],
        usage: { input_tokens: 1000, output_tokens: 500 },
      }),
    },
  }));
  return { default: Anthropic };
});

vi.mock('../../../forge-eval/load-env.js', () => ({
  loadEnv: () => ({ anthropicApiKey: 'sk-test' }),
}));

describe('forge legacy-bridge regenerate (CLI 集成)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-regen-cli-'));
    mkdirSync(join(tmp, 'forge'), { recursive: true });
    mkdirSync(join(tmp, 'docs', 'legacy'), { recursive: true });
    // forge/config.yaml(已 opt-in)
    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n`,
    );
    // legacy-anchors.yaml — path 用 forward slash 跨平台
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: ${join(tmp, 'docs', 'legacy', 'SRS.md').replace(/\\/g, '/')}\n    authoritative: true\n`,
    );
    // 老 SRS
    writeFileSync(
      join(tmp, 'docs', 'legacy', 'SRS.md'),
      '# 需求\n## 1. 订单\nOrder 表 user_id 字段非空。\n',
    );
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('--dry-run 不调 LLM,列出 anchor 后退 0', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } =
        await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'regenerate', '--dry-run']);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
        expect(exitSpy).toHaveBeenCalledWith(0);
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('未 ack → 退 1 + 提示 --acknowledge-data-transfer', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } =
        await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'regenerate']);
        expect(exitSpy).toHaveBeenCalledWith(1);
        const allErr = errSpy.mock.calls.flat().join('\n');
        expect(allErr).toContain('--acknowledge-data-transfer');
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('已 ack 且非 dry-run → 写 forge/docs/regenerated/SRS.md', async () => {
    // 写 ack(用真实 computeConfigHash 算法:JSON.stringify(lb, Object.keys(lb).sort()))
    mkdirSync(join(tmp, 'forge', '.cache'), { recursive: true });
    const lb = { allow_llm_calls: true };
    const configHash = createHash('sha256')
      .update(JSON.stringify(lb, Object.keys(lb).sort()))
      .digest('hex')
      .slice(0, 16);
    writeFileSync(
      join(tmp, 'forge', '.cache', 'llm-ack.yaml'),
      `schema: forge-llm-ack/v1\nacknowledged_at: 2026-05-09T00:00:00Z\nconfig_hash: ${configHash}\n`,
    );

    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } =
        await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        // --skip-quality 跳过 quality-judge,这测试只验复写主路径
        await cmd.parseAsync(['node', 'forge', 'regenerate', '--yes', '--skip-quality']);
        const outPath = join(tmp, 'forge', 'docs', 'regenerated', 'SRS.md');
        expect(existsSync(outPath)).toBe(true);
        const content = readFileSync(outPath, 'utf8');
        expect(content).toContain('generated-by: forge-legacy-bridge');
        expect(content).toContain('license: derived-from-source');
        expect(content).toContain('此文档由 forge 自动生成');
        // 验证 anchors.yaml 被写回 hash
        const updated = readFileSync(join(tmp, 'forge', 'legacy-anchors.yaml'), 'utf8');
        expect(updated).toContain('hash:');
        expect(updated).toContain('last_regenerated:');
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
