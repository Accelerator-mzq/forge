// tests/cli/legacy-bridge/archive-dualpath.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  emitPreflightSyncCheck,
  emitPostHookSyncCheck,
} from '../../../src/cli/commands/archive.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arc-'));
  await mkdir(join(dir, 'forge', 'changes', 'add-pay', 'specs'), { recursive: true });
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
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
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
