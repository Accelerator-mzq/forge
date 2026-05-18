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

  it('enforce_sync=true → preflight emit manifest + 写暂停态文件 + 返 halted-for-fulfillment(Task 6.3 行为变更:不再调 LLM)', async () => {
    // Task 6.3 变更:preflight 不再直接调 LLM 跑 runSyncCheck,改为 emit sync-check manifest
    // 到 forge/.cache/legacy-bridge-task-sync-check.json,同时写暂停态文件
    // 返回 halted-for-fulfillment(而非旧的 critical-pending)
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { runArchivePreflight } = await import('../../../src/cli/commands/archive.js');
      const result = await runArchivePreflight(join(tmp, 'forge'), 'add-payment');
      // 新行为:emit manifest → halted-for-fulfillment
      expect(result.kind).toBe('halted-for-fulfillment');
      if (result.kind === 'halted-for-fulfillment') {
        expect(result.message).toContain('sync-check manifest 已 emit');
      }
      // manifest 文件已写
      expect(existsSync(join(tmp, 'forge', '.cache', 'legacy-bridge-task-sync-check.json'))).toBe(
        true,
      );
      // 暂停态文件已写
      expect(existsSync(join(tmp, 'forge', '.cache', 'archive-pause-add-payment.json'))).toBe(true);
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

  // Regression(spec §2.5):marker 未创建 + enforce_sync=true 时,preflight 必须先于 marker check 跑。
  // Task 6.3 行为变更:preflight 不再直接调 LLM 写 sync-state,改为 emit manifest + 写暂停态文件,
  // 返回 halted-for-fulfillment → caller exit(2) 并正确 release archive.lock。
  it('marker fail + enforce_sync=true → manifest 写 + 暂停态写 + archive.lock 已释放(Task 6.3 + 锁残留 fix)', async () => {
    // setup 已配 enforce_sync=true + ack + anchors;
    // 关键:不创建 .verify-passed 和 .review-passed marker → 走原 archive 命令时,
    // preflight 先于 marker check 跑(emit manifest + halt),archive.lock 已 release。
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildArchiveCommand } = await import('../../../src/cli/commands/archive.js');
      const cmd = buildArchiveCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'add-payment']).catch(() => undefined);
        // 1. manifest 文件存在 → preflight 在 marker check 之前已跑(emit manifest)
        expect(existsSync(join(tmp, 'forge', '.cache', 'legacy-bridge-task-sync-check.json'))).toBe(
          true,
        );
        // 2. 暂停态文件存在
        expect(existsSync(join(tmp, 'forge', '.cache', 'archive-pause-add-payment.json'))).toBe(
          true,
        );
        // 3. exit(2) 被调过(halted-for-fulfillment → caller exit 2)
        expect(exitSpy).toHaveBeenCalledWith(2);
        // 4. manifest emit 提示应出现
        expect(errSpy.mock.calls.flat().join('\n')).toContain('sync-check manifest 已 emit');
        // 5. **锁残留 fix 关键断言**:archive.lock 不应残留(caller 在 halted-for-fulfillment 后正确 release)
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
