// tests/cli/legacy-bridge/dualpath.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  runMapCommand,
  runIndexCommand,
  runSyncCheckCommand,
  runRegenerateCommand,
} from '../../../src/cli/commands/legacy-bridge.js';
import { writeAck } from '../../../src/core/legacy-bridge/ack.js';
import { buildManifest } from '../../../src/core/legacy-bridge/llm-task.js';
import type { ForgeConfig } from '../../../src/core/schema/types.js';
import type { LegacyAnchorRole } from '../../../src/core/legacy-bridge/types.js';

const CONFIG_YAML = 'legacy_bridge:\n  allow_llm_calls: true\n';

// 公共 fixture:LLM mock 返回的复写文本(足够长,通过 validateRegenOutput)
const REGEN_BODY =
  '# 需求规格\n## 1. 订单\nOrder 表 user_id 字段非空。Idempotency-Key 头部强制。\n## 2. 支付\n支付流程必须幂等。';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lb-cli-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs', 'SRS.md'), '# 需求', 'utf8');
  // opt-in gate fixture(Task 6.0):config + writeAck 写匹配 config_hash 的 ack 文件
  await mkdir(join(dir, 'forge'), { recursive: true });
  await writeFile(join(dir, 'forge', 'config.yaml'), CONFIG_YAML, 'utf8');
  await writeAck(join(dir, 'forge'), parseYaml(CONFIG_YAML) as ForgeConfig);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// ---------- 辅助:写 legacy-anchors.yaml(含 authoritative requirements anchor) ----------
async function writeAnchorsYaml(forgeRoot: string, anchorPath: string): Promise<void> {
  const content = [
    'schema: forge-legacy-anchor/v1',
    'anchors:',
    `  - role: requirements`,
    `    path: "${anchorPath.replace(/\\/g, '/')}"`,
    `    authoritative: true`,
    `    modules:`,
    `      - payments`,
  ].join('\n');
  await writeFile(join(forgeRoot, 'legacy-anchors.yaml'), content, 'utf8');
}

// ---------- 辅助:写 changes/<id>/proposal.md + specs/payments.md ----------
// 注:affectedModules 从 specs/ 目录文件名解析,需要写 specs/ 才能匹配 anchor.modules=['payments']
async function writeChangeContext(forgeRoot: string, changeId: string): Promise<void> {
  const changesDir = join(forgeRoot, 'changes', changeId);
  await mkdir(join(changesDir, 'specs'), { recursive: true });
  await writeFile(
    join(changesDir, 'proposal.md'),
    '# 变更\n支付 payments 模块新增幂等处理。',
    'utf8',
  );
  // payments.md → affectedModules=['payments'],匹配 anchor.modules=['payments']
  await writeFile(
    join(changesDir, 'specs', 'payments.md'),
    '## 支付规格\n新增幂等 key 处理。',
    'utf8',
  );
}

describe('runMapCommand 默认 agent 模式', () => {
  it('默认(无 flag)→ emit manifest 到 .cache,不调 LLM', async () => {
    const code = await runMapCommand({
      projectRoot: dir,
      mode: 'overwrite',
      apply: false,
      api: false,
    });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'forge', '.cache', 'legacy-bridge-task-map.json'))).toBe(true);
  });

  it('--apply 模式:喂 agent 结果文件 → 产 draft yaml', async () => {
    await runMapCommand({ projectRoot: dir, mode: 'overwrite', apply: false, api: false }); // 先 emit
    await writeFile(
      join(dir, 'forge', '.cache', 'legacy-bridge-result-map.json'),
      JSON.stringify({ text: JSON.stringify([{ path: 'docs/SRS.md', role: 'requirements' }]) }),
      'utf8',
    );
    const code = await runMapCommand({
      projectRoot: dir,
      mode: 'overwrite',
      apply: true,
      api: false,
    });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'forge', 'legacy-anchors-draft.yaml'))).toBe(true);
  });

  it('--apply 但无 manifest → 返回非 0 exit code', async () => {
    const code = await runMapCommand({
      projectRoot: dir,
      mode: 'overwrite',
      apply: true,
      api: false,
    });
    expect(code).not.toBe(0);
  });

  it('--apply 与 --api 同传 → 返回非 0 exit code', async () => {
    const code = await runMapCommand({
      projectRoot: dir,
      mode: 'overwrite',
      apply: true,
      api: true,
    });
    expect(code).not.toBe(0);
  });
});

// ==========================================================================
// runIndexCommand 双路径测试(Task 6.2)
// ==========================================================================
describe('runIndexCommand 双路径', () => {
  // 每个测试前写好 legacy-anchors.yaml 和 anchor 文件
  beforeEach(async () => {
    const anchorFilePath = join(dir, 'docs', 'SRS.md');
    await writeAnchorsYaml(join(dir, 'forge'), anchorFilePath);
  });

  it('默认 emit → manifest 文件写到 .cache', async () => {
    // 期望 runIndexCommand 把 manifest 写到 forge/.cache/legacy-bridge-task-index.json
    const code = await runIndexCommand({
      projectRoot: dir,
      apply: false,
      api: false,
    });
    expect(code).toBe(0);
    const manifestFile = join(dir, 'forge', '.cache', 'legacy-bridge-task-index.json');
    expect(existsSync(manifestFile)).toBe(true);
    // manifest 应包含 op=index + round=1
    const manifest = parseYaml(await readFile(manifestFile, 'utf8')) as {
      op: string;
      round: number;
    };
    expect(manifest.op).toBe('index');
    expect(manifest.round).toBe(1);
  });

  it('--apply → 消费 agent 结果 → 写 forge/docs/index.md', async () => {
    // 先 emit 以产生 manifest
    await runIndexCommand({ projectRoot: dir, apply: false, api: false });
    // 读 manifest 取 tasks[0].outputPath 写 agent 结果
    const manifestFile = join(dir, 'forge', '.cache', 'legacy-bridge-task-index.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as {
      tasks: Array<{ outputPath: string; inputs: Array<{ source: string }> }>;
      meta?: { prebuilt?: unknown[] };
    };
    const outputPath = manifest.tasks[0]!.outputPath;
    // LLM 返回 {path: summary} JSON
    const anchorPath = manifest.tasks[0]!.inputs[0]!.source;
    await mkdir(join(dir, 'forge', '.cache'), { recursive: true });
    await writeFile(
      join(dir, 'forge', outputPath),
      JSON.stringify({
        text: JSON.stringify({ [anchorPath]: '这是一份需求文档,约 100 字摘要。' }),
      }),
      'utf8',
    );
    const code = await runIndexCommand({ projectRoot: dir, apply: true, api: false });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'forge', 'docs', 'index.md'))).toBe(true);
  });

  it('--apply 与 --api 互斥 → 返回非 0', async () => {
    const code = await runIndexCommand({ projectRoot: dir, apply: true, api: true });
    expect(code).not.toBe(0);
  });

  it('--apply 但无 manifest → 返回非 0', async () => {
    const code = await runIndexCommand({ projectRoot: dir, apply: true, api: false });
    expect(code).not.toBe(0);
  });
});

// ==========================================================================
// runSyncCheckCommand 双路径测试(Task 6.2)
// ==========================================================================
describe('runSyncCheckCommand 双路径', () => {
  const CHANGE_ID = 'ch-001';

  beforeEach(async () => {
    const anchorFilePath = join(dir, 'docs', 'SRS.md');
    await writeAnchorsYaml(join(dir, 'forge'), anchorFilePath);
    await writeChangeContext(join(dir, 'forge'), CHANGE_ID);
  });

  it('默认 emit → manifest 文件写到 .cache', async () => {
    const code = await runSyncCheckCommand({
      projectRoot: dir,
      changeId: CHANGE_ID,
      apply: false,
      api: false,
    });
    expect(code).toBe(0);
    const manifestFile = join(dir, 'forge', '.cache', 'legacy-bridge-task-sync-check.json');
    expect(existsSync(manifestFile)).toBe(true);
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as {
      op: string;
      round: number;
      meta?: { gate_context?: string };
    };
    expect(manifest.op).toBe('sync-check');
    expect(manifest.round).toBe(1);
    // meta.gate_context === 'standalone'
    expect(manifest.meta?.gate_context).toBe('standalone');
  });

  it('--apply → 消费 agent 结果 → 写 forge/legacy-sync-state/<id>.yaml', async () => {
    // 先 emit
    await runSyncCheckCommand({ projectRoot: dir, changeId: CHANGE_ID, apply: false, api: false });
    const manifestFile = join(dir, 'forge', '.cache', 'legacy-bridge-task-sync-check.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as {
      tasks: Array<{ outputPath: string }>;
      manifest_hash: string;
    };
    const outputPath = manifest.tasks[0]!.outputPath;
    await writeFile(join(dir, 'forge', outputPath), JSON.stringify({ text: '[]' }), 'utf8');
    const code = await runSyncCheckCommand({
      projectRoot: dir,
      changeId: CHANGE_ID,
      apply: true,
      api: false,
    });
    expect(code).toBe(0);
    // 产物文件存在
    expect(existsSync(join(dir, 'forge', 'legacy-sync-state', `${CHANGE_ID}.yaml`))).toBe(true);
  });

  it('--apply 与 --api 互斥 → 返回非 0', async () => {
    const code = await runSyncCheckCommand({
      projectRoot: dir,
      changeId: CHANGE_ID,
      apply: true,
      api: true,
    });
    expect(code).not.toBe(0);
  });

  it('无 affected anchor(changeId 无 proposal)→ task=null → exit 0 不 emit', async () => {
    // 写一个没有 modules 的 anchors,这样没有 anchor 被 affected
    await writeFile(
      join(dir, 'forge', 'legacy-anchors.yaml'),
      [
        'schema: forge-legacy-anchor/v1',
        'anchors:',
        '  - role: requirements',
        `    path: "${join(dir, 'docs', 'SRS.md').replace(/\\/g, '/')}"`,
        '    authoritative: true',
      ].join('\n'),
      'utf8',
    );
    const code = await runSyncCheckCommand({
      projectRoot: dir,
      changeId: CHANGE_ID,
      apply: false,
      api: false,
    });
    // task=null → graceful exit 0,不 emit manifest
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'forge', '.cache', 'legacy-bridge-task-sync-check.json'))).toBe(
      false,
    );
  });
});

// ==========================================================================
// runRegenerateCommand 双路径测试(Task 6.2)
// ==========================================================================
describe('runRegenerateCommand 双路径', () => {
  // regenerate 用 requirements role(非 metadata-only)
  const ROLE: LegacyAnchorRole = 'requirements';

  beforeEach(async () => {
    const anchorFilePath = join(dir, 'docs', 'SRS.md');
    // 写充分长的 anchor 文件(buildRegenerateRound1Tasks 会读)
    await writeFile(
      anchorFilePath,
      '# 需求\n## 1. 订单\nOrder 表 user_id 字段非空。Idempotency-Key 头部强制。\n',
      'utf8',
    );
    await writeAnchorsYaml(join(dir, 'forge'), anchorFilePath);
  });

  it('默认 emit → manifest round=1 写到 .cache', async () => {
    const code = await runRegenerateCommand({
      projectRoot: dir,
      role: ROLE,
      apply: false,
      api: false,
    });
    expect(code).toBe(0);
    const manifestFile = join(dir, 'forge', '.cache', 'legacy-bridge-task-regenerate.json');
    expect(existsSync(manifestFile)).toBe(true);
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as {
      op: string;
      round: number;
      tasks: Array<{ op: string }>;
    };
    expect(manifest.op).toBe('regenerate');
    expect(manifest.round).toBe(1);
    // 轮1 有两个 task:regenerate + extract-facts
    expect(manifest.tasks.length).toBe(2);
    const ops = manifest.tasks.map((t) => t.op);
    expect(ops).toContain('regenerate');
    expect(ops).toContain('extract-facts');
  });

  it('--apply round=1 → 后处理 → emit 轮2 manifest(round:2)', async () => {
    // 先 emit 轮1
    await runRegenerateCommand({ projectRoot: dir, role: ROLE, apply: false, api: false });
    const manifestFile = join(dir, 'forge', '.cache', 'legacy-bridge-task-regenerate.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as {
      tasks: Array<{ op: string; outputPath: string }>;
      round: number;
    };
    // 写轮1 两个 agent 结果文件
    for (const task of manifest.tasks) {
      const resultPath = join(dir, 'forge', task.outputPath);
      await mkdir(join(dir, 'forge', '.cache'), { recursive: true });
      if (task.op === 'regenerate') {
        await writeFile(resultPath, JSON.stringify({ text: REGEN_BODY }), 'utf8');
      } else {
        // extract-facts 返回合法 JSON 数组
        const factsText = JSON.stringify([
          { text: 'Order 表 user_id 字段非空', section: '§1', critical: true },
          { text: 'Idempotency-Key 头部强制', section: '§1', critical: false },
        ]);
        await writeFile(resultPath, JSON.stringify({ text: factsText }), 'utf8');
      }
    }
    // --apply round=1 → applyRound1AndBuildRound2 → emit 轮2
    const code = await runRegenerateCommand({
      projectRoot: dir,
      role: ROLE,
      apply: true,
      api: false,
    });
    expect(code).toBe(0);
    // 轮2 manifest 已 emit(同一文件,round 更新为 2)
    const manifest2 = JSON.parse(await readFile(manifestFile, 'utf8')) as {
      op: string;
      round: number;
      tasks: Array<{ op: string }>;
      meta?: { sampling?: unknown };
    };
    expect(manifest2.round).toBe(2);
    expect(manifest2.tasks[0]?.op).toBe('quality-judge');
    // meta.sampling 被存进去
    expect(manifest2.meta?.sampling).toBeDefined();
  });

  it('--apply round=2 → quality-judge → 写 forge/docs/regenerated/SRS.md', async () => {
    // 用 buildManifest 手工构造一个 round=2 manifest,含 meta.sampling
    const { applyRound1AndBuildRound2 } =
      await import('../../../src/core/legacy-bridge/regenerator.js');
    // 轮1 数据
    const factsText = JSON.stringify([
      { text: 'Order 表 user_id 字段非空', section: '§1', critical: true },
      { text: 'Idempotency-Key 头部强制', section: '§1', critical: false },
    ]);
    const { task: r2task, sampling } = applyRound1AndBuildRound2(REGEN_BODY, factsText, ROLE);
    // 写 round=2 manifest
    const { FORGE_VERSION } = await import('../../../src/index.js');
    const r2manifest = buildManifest({
      op: 'regenerate',
      round: 2,
      tasks: [r2task],
      forgeVersion: FORGE_VERSION,
      meta: {
        sampling: sampling as unknown as Record<string, unknown>,
        regenBody: REGEN_BODY,
        role: ROLE,
      },
    });
    await mkdir(join(dir, 'forge', '.cache'), { recursive: true });
    await writeFile(
      join(dir, 'forge', '.cache', 'legacy-bridge-task-regenerate.json'),
      JSON.stringify(r2manifest, null, 2),
      'utf8',
    );
    // 写 quality-judge agent 结果(三态 JSON,全 preserved)
    const judgeText = JSON.stringify(sampling.sampled.map(() => ({ state: 'preserved' })));
    await writeFile(
      join(dir, 'forge', r2task.outputPath),
      JSON.stringify({ text: judgeText }),
      'utf8',
    );
    // --apply round=2 → applyRound2 → 写产物
    await mkdir(join(dir, 'forge', 'docs', 'regenerated'), { recursive: true });
    const code = await runRegenerateCommand({
      projectRoot: dir,
      role: ROLE,
      apply: true,
      api: false,
    });
    expect(code).toBe(0);
    // 产物应写到 forge/docs/regenerated/SRS.md
    expect(existsSync(join(dir, 'forge', 'docs', 'regenerated', 'SRS.md'))).toBe(true);
  });

  it('--apply 与 --api 互斥 → 返回非 0', async () => {
    const code = await runRegenerateCommand({
      projectRoot: dir,
      role: ROLE,
      apply: true,
      api: true,
    });
    expect(code).not.toBe(0);
  });
});
