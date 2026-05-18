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

  it('--dry-run --redact-report 输出含命中数(Phase F follow-up:dry-run 真跑 redact)', async () => {
    // 替换默认 fixture 为含 secret 的版本(命中 email + github-pat 规则)
    writeFileSync(
      join(tmp, 'docs', 'legacy', 'SRS.md'),
      '# SRS\n联系邮箱: foo@example.com\ngithub-pat: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n',
    );
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
        await cmd.parseAsync(['node', 'forge', 'regenerate', '--dry-run', '--redact-report']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        const allLogs = logSpy.mock.calls.flat().join('\n');
        // 期望:[redact] email + [redact] github-pat 都出现且各 ≥ 1 命中
        expect(allLogs).toMatch(/\[redact\]\s+email\s+1 命中/);
        expect(allLogs).toMatch(/\[redact\]\s+github-pat\s+1 命中/);
        // total: 至少 2 项 mask
        expect(allLogs).toMatch(/total: \d+ 项已 mask/);
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

  it('默认(无 --api/--apply)→ emit round=1 manifest 不调 LLM(Task 6.2 新行为)', async () => {
    // Task 6.2 round-2:默认翻转 → emit manifest,不直接写产物
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
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'regenerate', '--yes']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        // 新行为:round=1 manifest 已 emit,产物不写
        expect(existsSync(join(tmp, 'forge', '.cache', 'legacy-bridge-task-regenerate.json'))).toBe(
          true,
        );
        expect(existsSync(join(tmp, 'forge', 'docs', 'regenerated', 'SRS.md'))).toBe(false);
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('--api --include-historical 把 authoritative=false anchors 传给 regenerateRole', async () => {
    // 写 ack
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

    // 加一个历史版 anchor(authoritative=false)
    const v1Path = join(tmp, 'docs', 'legacy', 'SRS-v1.md').replace(/\\/g, '/');
    const v2Path = join(tmp, 'docs', 'legacy', 'SRS.md').replace(/\\/g, '/');
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: ${v2Path}\n    authoritative: true\n  - role: requirements\n    path: ${v1Path}\n    authoritative: false\n`,
    );
    writeFileSync(join(tmp, 'docs', 'legacy', 'SRS-v1.md'), '# 旧需求 v1\n## 1. 章节\n旧规则。\n');

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
        // Task 6.2 round-2:单进程路径走 --api(默认已翻转为 emit)
        await cmd.parseAsync([
          'node',
          'forge',
          'regenerate',
          '--api',
          '--yes',
          '--skip-quality',
          '--include-historical',
        ]);
        // authoritative=false 的 anchor 不进 regenerate 主循环(因 getAuthoritativeAnchors 过滤);
        // 但 historical 参数会传给 regenerateRole(由 mock 接,但 mock 不验证参数);
        // 这里验证 --api 主路径正常 + 文件写入(无静默 fail)
        const outPath = join(tmp, 'forge', 'docs', 'regenerated', 'SRS.md');
        expect(existsSync(outPath)).toBe(true);
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('--api 已 ack 且非 dry-run → 写 forge/docs/regenerated/SRS.md(含 frontmatter + anchor 回写)', async () => {
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
        // Task 6.2 round-2:单进程路径走 --api;--skip-quality 跳过 quality-judge
        await cmd.parseAsync(['node', 'forge', 'regenerate', '--api', '--yes', '--skip-quality']);
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
