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
        content: [
          {
            type: 'text',
            text: '[{"severity":"critical","section":"§4.5","description":"幂等约束变化"}]',
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
      .update(
        JSON.stringify({ allow_llm_calls: true, enforce_sync: true }, [
          'allow_llm_calls',
          'enforce_sync',
        ]),
      )
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

  it('enforce_sync=true + LLM 返 critical → preflight 返 critical-pending(message + 写 sync-state)', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { runArchivePreflight } = await import('../../../src/cli/commands/archive.js');
      const result = await runArchivePreflight(join(tmp, 'forge'), 'add-payment');
      // preflight 不再 process.exit,改返 PreflightResult
      expect(result.kind).toBe('critical-pending');
      if (result.kind === 'critical-pending') {
        expect(result.criticalCount).toBeGreaterThan(0);
        expect(result.message).toContain('critical 差异未 resolve');
      }
      // sync-state 文件已写
      expect(existsSync(join(tmp, 'forge', 'legacy-sync-state', 'add-payment.yaml'))).toBe(true);
    } finally {
      process.chdir(cwd);
    }
  });

  it('enforce_sync=false → preflight 返 ok(graceful skip)', async () => {
    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n  enforce_sync: false\n`,
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { runArchivePreflight } = await import('../../../src/cli/commands/archive.js');
      const result = await runArchivePreflight(join(tmp, 'forge'), 'add-payment');
      expect(result.kind).toBe('ok');
    } finally {
      process.chdir(cwd);
    }
  });

  it('无 legacy-anchors.yaml → preflight 返 ok(graceful skip)', async () => {
    rmSync(join(tmp, 'forge', 'legacy-anchors.yaml'));
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { runArchivePreflight } = await import('../../../src/cli/commands/archive.js');
      const result = await runArchivePreflight(join(tmp, 'forge'), 'add-payment');
      expect(result.kind).toBe('ok');
    } finally {
      process.chdir(cwd);
    }
  });

  // Regression(spec §2.5):marker 未创建 + sync 含 critical 时,preflight 必须先于 marker check 跑,
  // sync-state 文件应已写入 — 让用户立即看到 sync 报告,不被 marker 失败遮蔽。
  // 此 case 覆盖 PR #17 偏离 2 的根因场景(原代码把 preflight 放在 marker 之后,marker fail 会
  // 直接 exit 而 sync-state 永不生成,与 spec §2.5 line 183-204 的流程图位置不符)。
  // 同时新增锁残留断言(本 PR follow-up):critical-pending 退出后 archive.lock 必须已 release。
  it('marker fail + sync critical → sync-state 写 + archive.lock 已释放(spec §2.5 + 锁残留 fix)', async () => {
    // setup 已配 enforce_sync + ack + LLM mock 返 critical;
    // 关键:不创建 .verify-passed 和 .review-passed marker → 走原 archive 命令会 marker exit 2。
    // 期望:sync-state.yaml 已写(说明 preflight 跑过)、archive.lock 不残留(说明 caller 正确 release)。
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildArchiveCommand } = await import('../../../src/cli/commands/archive.js');
      const cmd = buildArchiveCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'add-payment']).catch(() => undefined);
        // 1. sync-state 文件存在 → preflight 在 marker check 之前已跑
        expect(existsSync(join(tmp, 'forge', 'legacy-sync-state', 'add-payment.yaml'))).toBe(true);
        expect(existsSync(join(tmp, 'forge', 'legacy-sync-state', 'add-payment.md'))).toBe(true);
        // 2. exit(2) 被调过(critical preflight 或 marker check)
        expect(exitSpy).toHaveBeenCalledWith(2);
        // 3. critical 提示应出现(证明 preflight 跑到了 critical 检测)
        expect(errSpy.mock.calls.flat().join('\n')).toContain('critical 差异未 resolve');
        // 4. **锁残留 fix 关键断言**:archive.lock 不应残留(caller 在 critical-pending 后正确 release)
        expect(existsSync(join(tmp, 'forge', '.cache', 'archive.lock'))).toBe(false);
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
