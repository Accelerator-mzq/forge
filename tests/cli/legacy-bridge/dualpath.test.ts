// tests/cli/legacy-bridge/dualpath.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// m-2:可变 mock 状态 —— quality-judge 默认返回全 preserved;
// 测试可置 judgeVerdict='lost' 模拟 quality-fail 路径。用 vi.hoisted 让 vi.mock(被提升)能引用。
const mockState = vi.hoisted(() => ({ judgeVerdict: 'preserved' as 'preserved' | 'lost' }));

// --api 路径需要 mock:Anthropic SDK + forge-eval/load-env
// 双路径两套 quality-judge prompt 形态:
//   agent 路径(applyRound1AndBuildRound2)→ quality-judge task prompt 含「三态判定」→ 输出 JSON 数组;
//   --api 路径(judgeSingleFact 逐 fact)→ prompt 含「复写质量评估员」→ 输出纯文本首行 verdict。
// extract-facts 两变体(--api 的 extractFactsFromOriginal / agent 的 buildRegenerateRound1Tasks)
//   prompt 都含「关键事实」→ 同一 JSON 数组应答。index/sync-check 也用同一 mock。
vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockImplementation((args: { messages: Array<{ content: string }> }) => {
        const prompt = args.messages?.[0]?.content ?? '';
        // quality-judge(agent 路径,applyRound1AndBuildRound2 的 task):三态判定 → JSON 数组
        if (prompt.includes('三态判定')) {
          // 抽样数不定,返回足量 verdict(applyRound2 对越界 fact 视 lost,这里给够)
          return Promise.resolve({
            content: [
              {
                type: 'text',
                text: JSON.stringify(Array(40).fill({ state: mockState.judgeVerdict })),
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          });
        }
        // quality-judge(--api 路径,judgeSingleFact 逐 fact):复写质量评估员 → 纯文本首行 verdict
        if (prompt.includes('复写质量评估员')) {
          return Promise.resolve({
            content: [{ type: 'text', text: `${mockState.judgeVerdict}\n理由:测试 mock` }],
            usage: { input_tokens: 100, output_tokens: 50 },
          });
        }
        // extract-facts(--api 的 extractFactsFromOriginal + agent 的 buildRegenerateRound1Tasks
        // 两个变体 prompt 都含「关键事实」)→ JSON 数组
        if (prompt.includes('关键事实')) {
          return Promise.resolve({
            content: [
              {
                type: 'text',
                text: JSON.stringify([
                  { text: 'Order 表 user_id 字段非空', section: '§1', critical: true },
                  { text: 'Idempotency-Key 头部强制', section: '§1', critical: false },
                ]),
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          });
        }
        // sync-check:5 档差异 → 空数组(无更新)
        if (prompt.includes('sync 审计员')) {
          return Promise.resolve({
            content: [{ type: 'text', text: '[]' }],
            usage: { input_tokens: 100, output_tokens: 50 },
          });
        }
        // index batch 摘要(buildIndexTask batch prompt):返回 {path: summary} JSON 对象
        // applyIndexResult 期望此格式;路径取 prompt 中的 anchor path(动态),
        // 这里返回固定占位 key,applyIndexResult 对未匹配路径降级为 role=unmatched 仍渲染
        if (prompt.includes('请为下列每份文档产出约')) {
          return Promise.resolve({
            content: [
              {
                type: 'text',
                text: JSON.stringify({ 'docs/SRS.md': '这是一份需求文档的约 100 字摘要内容。' }),
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          });
        }
        // 默认(regenerate 复写正文):返回足够长的 markdown
        return Promise.resolve({
          content: [
            {
              type: 'text',
              text: '# 需求规格\n## 1. 订单\nOrder 表 user_id 字段非空。Idempotency-Key 头部强制。\n## 2. 支付\n支付流程必须幂等且保留所有约束。',
            },
          ],
          usage: { input_tokens: 1000, output_tokens: 500 },
        });
      }),
    },
  }));
  return { default: Anthropic };
});

vi.mock('../../../forge-eval/load-env.js', () => ({
  loadEnv: () => ({ anthropicApiKey: 'sk-test' }),
}));

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
  // m-2:每个用例前重置 mock judge verdict,保证测试隔离
  mockState.judgeVerdict = 'preserved';
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

  it('--api happy path → 进程内调 LLM → 写 forge/docs/index.md', async () => {
    // --api 走 buildIndexTask + ApiRunner + applyIndexResult(对称 agent 路径);
    // Anthropic mock 返回 {path: summary} JSON 对象供 applyIndexResult 解析
    const code = await runIndexCommand({ projectRoot: dir, apply: false, api: true });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'forge', 'docs', 'index.md'))).toBe(true);
    // index.md 含 anchor 路径表头
    const content = await readFile(join(dir, 'forge', 'docs', 'index.md'), 'utf8');
    expect(content).toContain('Legacy Anchor Index');
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

  it('--api happy path → 进程内调 LLM → 写 forge/legacy-sync-state/<id>.yaml', async () => {
    // --api 走 runSyncCheck(client, ...),Anthropic mock 返回空 diff 数组
    const code = await runSyncCheckCommand({
      projectRoot: dir,
      changeId: CHANGE_ID,
      apply: false,
      api: true,
    });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'forge', 'legacy-sync-state', `${CHANGE_ID}.yaml`))).toBe(true);
    expect(existsSync(join(dir, 'forge', 'legacy-sync-state', `${CHANGE_ID}.md`))).toBe(true);
  });

  it('--apply 不带 --change-id → 从 manifest.meta.changeId 回退(I-3)', async () => {
    // emit 时带 changeId=ch-001 → 写进 meta;--apply 不带 → 应从 meta 取回写对文件名
    await runSyncCheckCommand({ projectRoot: dir, changeId: CHANGE_ID, apply: false, api: false });
    const manifestFile = join(dir, 'forge', '.cache', 'legacy-bridge-task-sync-check.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as {
      tasks: Array<{ outputPath: string }>;
      meta?: { changeId?: string };
    };
    // 确认 changeId 写进了 meta
    expect(manifest.meta?.changeId).toBe(CHANGE_ID);
    await writeFile(
      join(dir, 'forge', manifest.tasks[0]!.outputPath),
      JSON.stringify({ text: '[]' }),
      'utf8',
    );
    // --apply 不传 changeId → 应回退取 meta.changeId 写 ch-001.yaml
    const code = await runSyncCheckCommand({ projectRoot: dir, apply: true, api: false });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'forge', 'legacy-sync-state', `${CHANGE_ID}.yaml`))).toBe(true);
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
    // --apply round=2 → applyRound2 → 写产物;先写好 anchor 文件供 hash 回写
    await writeAnchorsYaml(join(dir, 'forge'), join(dir, 'docs', 'SRS.md'));
    await mkdir(join(dir, 'forge', 'docs', 'regenerated'), { recursive: true });
    const code = await runRegenerateCommand({
      projectRoot: dir,
      role: ROLE,
      apply: true,
      api: false,
    });
    expect(code).toBe(0);
    // 产物应写到 forge/docs/regenerated/SRS.md
    const outPath = join(dir, 'forge', 'docs', 'regenerated', 'SRS.md');
    expect(existsSync(outPath)).toBe(true);
    // I-2:产物含 frontmatter + disclaimer
    const content = await readFile(outPath, 'utf8');
    expect(content).toContain('generated-by: forge-legacy-bridge');
    expect(content).toContain('此文档由 forge 自动生成');
    // I-1:anchor hash + last_regenerated 回写 legacy-anchors.yaml
    const anchorsContent = await readFile(join(dir, 'forge', 'legacy-anchors.yaml'), 'utf8');
    expect(anchorsContent).toContain('hash:');
    expect(anchorsContent).toContain('last_regenerated:');
  });

  it('--apply round=1 抛 RegenOutputError(extract-facts 空)→ 写 .partial + exit 3', async () => {
    // 先 emit 轮1
    await runRegenerateCommand({ projectRoot: dir, role: ROLE, apply: false, api: false });
    const manifestFile = join(dir, 'forge', '.cache', 'legacy-bridge-task-regenerate.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as {
      tasks: Array<{ op: string; outputPath: string }>;
    };
    // regenerate 结果正常,extract-facts 返回空数组 → applyRound1AndBuildRound2 抛 RegenOutputError
    for (const task of manifest.tasks) {
      const resultPath = join(dir, 'forge', task.outputPath);
      await mkdir(join(dir, 'forge', '.cache'), { recursive: true });
      if (task.op === 'regenerate') {
        await writeFile(resultPath, JSON.stringify({ text: REGEN_BODY }), 'utf8');
      } else {
        // extract-facts 空数组 → 无 fact → RegenOutputError
        await writeFile(resultPath, JSON.stringify({ text: '[]' }), 'utf8');
      }
    }
    const code = await runRegenerateCommand({
      projectRoot: dir,
      role: ROLE,
      apply: true,
      api: false,
    });
    // exit 3 = LB_EXIT_PARTIAL_SUCCESS
    expect(code).toBe(3);
    // .partial 文件写出,不 emit 轮2
    expect(existsSync(join(dir, 'forge', 'docs', 'regenerated', 'SRS.md.partial'))).toBe(true);
    expect(existsSync(join(dir, 'forge', 'docs', 'regenerated', 'SRS.md'))).toBe(false);
  });

  it('--apply round=2 quality-fail(judge 全 lost)→ 写 .partial + exit 3', async () => {
    const { applyRound1AndBuildRound2 } =
      await import('../../../src/core/legacy-bridge/regenerator.js');
    const factsText = JSON.stringify([
      { text: 'Order 表 user_id 字段非空', section: '§1', critical: true },
      { text: 'Idempotency-Key 头部强制', section: '§1', critical: false },
    ]);
    const { task: r2task, sampling } = applyRound1AndBuildRound2(REGEN_BODY, factsText, ROLE);
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
    // quality-judge 结果:全部 fact 判 lost → critical 丢失 → quality.passed=false
    const judgeText = JSON.stringify(sampling.sampled.map(() => ({ state: 'lost' })));
    await writeFile(
      join(dir, 'forge', r2task.outputPath),
      JSON.stringify({ text: judgeText }),
      'utf8',
    );
    await writeAnchorsYaml(join(dir, 'forge'), join(dir, 'docs', 'SRS.md'));
    await mkdir(join(dir, 'forge', 'docs', 'regenerated'), { recursive: true });
    const code = await runRegenerateCommand({
      projectRoot: dir,
      role: ROLE,
      apply: true,
      api: false,
    });
    // exit 3 = LB_EXIT_PARTIAL_SUCCESS
    expect(code).toBe(3);
    // 写 .partial + quality YAML,不写正式产物
    expect(existsSync(join(dir, 'forge', 'docs', 'regenerated', 'SRS.md.partial'))).toBe(true);
    expect(existsSync(join(dir, 'forge', 'docs', 'regenerated', 'SRS.md.partial.yaml'))).toBe(true);
    expect(existsSync(join(dir, 'forge', 'docs', 'regenerated', 'SRS.md'))).toBe(false);
  });

  it('--api happy path → 单进程串两轮 → 写产物含 frontmatter + anchor 回写', async () => {
    // --api 复用 Anthropic mock:regenerate→extract-facts→quality-judge 三调用
    const code = await runRegenerateCommand({
      projectRoot: dir,
      role: ROLE,
      apply: false,
      api: true,
      yes: true, // 跳过 countdown
    });
    expect(code).toBe(0);
    const outPath = join(dir, 'forge', 'docs', 'regenerated', 'SRS.md');
    expect(existsSync(outPath)).toBe(true);
    // 产物含 frontmatter + disclaimer(regenerateRole 的 fullMarkdown)
    const content = await readFile(outPath, 'utf8');
    expect(content).toContain('generated-by: forge-legacy-bridge');
    expect(content).toContain('此文档由 forge 自动生成');
    // anchor hash + last_regenerated 回写
    const anchorsContent = await readFile(join(dir, 'forge', 'legacy-anchors.yaml'), 'utf8');
    expect(anchorsContent).toContain('hash:');
    expect(anchorsContent).toContain('last_regenerated:');
  });

  it('--api quality-fail(quality-judge 全 lost)→ 写 .partial + exit 3 + anchor 不回写', async () => {
    // m-2:置 mock judge 全 lost → critical fact 丢失 → quality.passed=false
    mockState.judgeVerdict = 'lost';
    const code = await runRegenerateCommand({
      projectRoot: dir,
      role: ROLE,
      apply: false,
      api: true,
      yes: true, // 跳过 countdown
    });
    // ① 返回 LB_EXIT_PARTIAL_SUCCESS(exit 3)
    expect(code).toBe(3);
    const outPath = join(dir, 'forge', 'docs', 'regenerated', 'SRS.md');
    // ② .partial 文件被写,正式产物不写
    expect(existsSync(`${outPath}.partial`)).toBe(true);
    expect(existsSync(outPath)).toBe(false);
    // ③ legacy-anchors.yaml 不含新 hash(quality-fail 路径不回写 anchor)
    const anchorsContent = await readFile(join(dir, 'forge', 'legacy-anchors.yaml'), 'utf8');
    expect(anchorsContent).not.toContain('hash:');
    expect(anchorsContent).not.toContain('last_regenerated:');
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
