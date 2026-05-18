// tests/cli/legacy-bridge/archive-dualpath.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import {
  emitPreflightSyncCheck,
  emitPostHookSyncCheck,
  runArchivePreflight,
  resumeArchiveGateCheck,
} from '../../../src/cli/commands/archive.js';

// —— SDK mock:--api 模式集成测试用例真走 ApiRunner → client.messages.create ——
// mockResponseText 由各用例在调用前赋值,控制 sync-check 返回 critical / 非 critical。
let mockResponseText = '[]';
vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockImplementation(() =>
        Promise.resolve({
          content: [{ type: 'text', text: mockResponseText }],
          stop_reason: 'end_turn',
        }),
      ),
    },
  }));
  return { default: Anthropic };
});
vi.mock('../../../forge-eval/load-env.js', () => ({
  loadEnv: () => ({ anthropicApiKey: 'sk-test' }),
}));

let dir: string;
beforeEach(async () => {
  mockResponseText = '[]'; // 默认无差异
  dir = await mkdtemp(join(tmpdir(), 'arc-'));
  await mkdir(join(dir, 'forge', 'changes', 'add-pay', 'specs'), { recursive: true });
  await mkdir(join(dir, 'forge', '.cache'), { recursive: true });
  await mkdir(join(dir, 'docs'), { recursive: true });
  // anchor 用绝对路径 → readAnchorFile 不依赖 cwd;modules 与 change specs/<area> 对齐才有 affected anchor
  await writeFile(join(dir, 'docs', 'SRS.md'), '# SRS\n支付幂等性约束。', 'utf8');
  await writeFile(join(dir, 'forge', 'changes', 'add-pay', 'proposal.md'), '# add payment', 'utf8');
  await writeFile(
    join(dir, 'forge', 'changes', 'add-pay', 'specs', 'payment.md'),
    '# payment',
    'utf8',
  );
  await writeFile(
    join(dir, 'forge', 'config.yaml'),
    'legacy_bridge:\n  allow_llm_calls: true\n  enforce_sync: true\n',
    'utf8',
  );
  const srsPath = join(dir, 'docs', 'SRS.md').replace(/\\/g, '/');
  await writeFile(
    join(dir, 'forge', 'legacy-anchors.yaml'),
    `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: ${JSON.stringify(srsPath)}\n    authoritative: true\n    modules: [payment]\n`,
    'utf8',
  );
  // ack 文件(--api 模式经 runArchivePreflight gate 需要 ack 就绪)
  const configHash = createHash('sha256')
    .update(
      JSON.stringify({ allow_llm_calls: true, enforce_sync: true }, [
        'allow_llm_calls',
        'enforce_sync',
      ]),
    )
    .digest('hex')
    .slice(0, 16);
  await writeFile(
    join(dir, 'forge', '.cache', 'llm-ack.yaml'),
    `schema: forge-llm-ack/v1\nacknowledged_at: 2026-05-05T00:00:00Z\nconfig_hash: ${configHash}\n`,
    'utf8',
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('emitPreflightSyncCheck(enforce_sync=true)', () => {
  it('agent 模式 emit sync-check manifest(gate_context=archive-preflight)+ 暂停态文件', async () => {
    const r = await emitPreflightSyncCheck(join(dir, 'forge'), 'add-pay');
    expect(r.kind).toBe('halted-for-fulfillment');
    expect(existsSync(join(dir, 'forge', '.cache', 'legacy-bridge-task-sync-check.json'))).toBe(
      true,
    );
    expect(existsSync(join(dir, 'forge', '.cache', 'archive-pause-add-pay.json'))).toBe(true);
  });
});

describe('emitPostHookSyncCheck(enforce_sync=false)', () => {
  it('post-archive emit posthook manifest,不写暂停态文件', async () => {
    const forgeRoot = join(dir, 'forge');
    // posthook 从已归档位置取 change context
    const today = new Date().toISOString().slice(0, 10);
    await mkdir(join(forgeRoot, 'changes', 'archive', `${today}-add-pay`, 'specs'), {
      recursive: true,
    });
    await writeFile(
      join(forgeRoot, 'changes', 'archive', `${today}-add-pay`, 'proposal.md'),
      '# add payment',
      'utf8',
    );
    await writeFile(
      join(forgeRoot, 'changes', 'archive', `${today}-add-pay`, 'specs', 'payment.md'),
      '# payment',
      'utf8',
    );
    const r = await emitPostHookSyncCheck(forgeRoot, 'add-pay');
    expect(r.kind).toBe('emitted');
    expect(existsSync(join(forgeRoot, '.cache', 'legacy-bridge-task-sync-check.json'))).toBe(true);
    expect(existsSync(join(forgeRoot, '.cache', 'archive-pause-add-pay.json'))).toBe(false); // posthook 无暂停态
  });
});

describe('runArchivePreflight --api 模式(进程内直连 API)', () => {
  it('--api 返回非 critical → 不 emit manifest、不写暂停态、写 sync-state、返 ok', async () => {
    mockResponseText = JSON.stringify([
      { severity: 'info', section: '§1', description: '小幅描述变化' },
    ]);
    const forgeRoot = join(dir, 'forge');
    const r = await runArchivePreflight(forgeRoot, 'add-pay', { api: true });
    // 非 critical → ok,archive 续跑
    expect(r.kind).toBe('ok');
    // --api 不 emit manifest、不写暂停态
    expect(existsSync(join(forgeRoot, '.cache', 'legacy-bridge-task-sync-check.json'))).toBe(false);
    expect(existsSync(join(forgeRoot, '.cache', 'archive-pause-add-pay.json'))).toBe(false);
    // --api 进程内跑完,sync-state 已写
    expect(existsSync(join(forgeRoot, 'legacy-sync-state', 'add-pay.yaml'))).toBe(true);
    expect(existsSync(join(forgeRoot, 'legacy-sync-state', 'add-pay.md'))).toBe(true);
  });

  it('--api 返回 critical → 返 critical-pending(criticalCount>0),sync-state 已写', async () => {
    mockResponseText = JSON.stringify([
      { severity: 'critical', section: '§4.5', description: '幂等约束变化未同步' },
    ]);
    const forgeRoot = join(dir, 'forge');
    const r = await runArchivePreflight(forgeRoot, 'add-pay', { api: true });
    // critical → critical-pending(死变体的归宿)
    expect(r.kind).toBe('critical-pending');
    if (r.kind === 'critical-pending') {
      expect(r.criticalCount).toBeGreaterThan(0);
      expect(r.message).toContain('critical 差异未 resolve');
    }
    // sync-state 已写,且确含 critical diff
    const yamlPath = join(forgeRoot, 'legacy-sync-state', 'add-pay.yaml');
    expect(existsSync(yamlPath)).toBe(true);
    const state = parseYaml(readFileSync(yamlPath, 'utf8')) as { diffs: { severity: string }[] };
    expect(state.diffs.some((d) => d.severity === 'critical')).toBe(true);
    // --api 不写暂停态
    expect(existsSync(join(forgeRoot, '.cache', 'archive-pause-add-pay.json'))).toBe(false);
  });
});

describe('resumeArchiveGateCheck', () => {
  it('produced_from 不匹配暂停态 → 拒绝 resume', async () => {
    const forgeRoot = join(dir, 'forge');
    await mkdir(join(forgeRoot, '.cache'), { recursive: true });
    // 暂停态文件用 camelCase changeId(与 Task 6.3 emitPreflightSyncCheck 实际写入一致)
    await writeFile(
      join(forgeRoot, '.cache', 'archive-pause-add-pay.json'),
      JSON.stringify({ changeId: 'add-pay', manifest_hash: 'EXPECTED' }),
      'utf8',
    );
    await mkdir(join(forgeRoot, 'legacy-sync-state'), { recursive: true });
    await writeFile(
      join(forgeRoot, 'legacy-sync-state', 'add-pay.yaml'),
      'schema: forge-legacy-sync/v1\nchange_id: add-pay\nproduced_from: WRONG\ndiffs: []\n',
      'utf8',
    );
    const r = await resumeArchiveGateCheck(forgeRoot, 'add-pay');
    expect(r.ok).toBe(false);
    // TS narrowing:r.ok=false 时才有 reason 字段
    if (!r.ok) expect(r.reason).toMatch(/produced_from/);
  });

  it('produced_from 匹配 + 无 critical pending → 放行', async () => {
    const forgeRoot = join(dir, 'forge');
    await mkdir(join(forgeRoot, '.cache'), { recursive: true });
    // 暂停态文件用 camelCase changeId(与 Task 6.3 实际写入一致)
    await writeFile(
      join(forgeRoot, '.cache', 'archive-pause-add-pay.json'),
      JSON.stringify({ changeId: 'add-pay', manifest_hash: 'H1' }),
      'utf8',
    );
    await mkdir(join(forgeRoot, 'legacy-sync-state'), { recursive: true });
    await writeFile(
      join(forgeRoot, 'legacy-sync-state', 'add-pay.yaml'),
      'schema: forge-legacy-sync/v1\nchange_id: add-pay\nproduced_from: H1\ndiffs: []\n',
      'utf8',
    );
    const r = await resumeArchiveGateCheck(forgeRoot, 'add-pay');
    expect(r.ok).toBe(true);
  });
});
