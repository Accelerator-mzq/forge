import { describe, it, expect, beforeAll, afterAll } from 'vitest';
// v6 codex 五轮 BLOCKER 2 修订:加 mkdir(后续 fixture 用到)
import { mkdtemp, mkdir, cp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
// v6 codex 五轮 NIT 修订:沿 update.test.ts / scope-cli.test.ts 静态 import runCli 风格
import { runCli } from '../cli/helpers.js';
import { computeContentHash } from '../../src/core/hash/content.js';

// CLI 入口(需要先 pnpm build)
const CLI = join(process.cwd(), 'dist', 'cli', 'index.js');
// fixture 根目录
const FIXTURE_ROOT = join(process.cwd(), 'tests', 'fixtures', 'scope');

// v2 MINOR 2 修订:用常量生成 fixture target 路径,避免字面值耦合
const ACTIVE_CHANGE_DIR = '2026-05-01-archived-with-active-entry';
const SUPERSEDING_CHANGE_DIR = '2026-05-02-archived-with-superseding';
const TARGET_ENTRY_ID = 'refresh-grace-period';

describe('plan-9b end-to-end', () => {
  // 每次测试使用临时项目目录
  let projectRoot: string;

  beforeAll(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'forge-9b-e2e-'));

    // 把 active entry fixture cp 到项目 archive 目录
    await cp(
      join(FIXTURE_ROOT, 'archived-with-active-entry'),
      join(projectRoot, 'forge', 'changes', 'archive', ACTIVE_CHANGE_DIR),
      { recursive: true },
    );

    // superseding fixture 不用 fixture 文件,直接用 string template 写,引用 ACTIVE_CHANGE_DIR 常量
    const supersedingDir = join(projectRoot, 'forge', 'changes', 'archive', SUPERSEDING_CHANGE_DIR);
    await mkdir(supersedingDir, { recursive: true });
    await writeFile(
      join(supersedingDir, 'proposal.md'),
      [
        '# Add Refresh Grace Period\n',
        '## Why\n\nAddress refresh-grace-period\n',
        '## What\n\nImplement\n',
        '## Out of Scope {#forge-oos}\n',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries: []',
        'superseding_entries:',
        `  - source_change: ${ACTIVE_CHANGE_DIR}`,
        `    entry_id: ${TARGET_ENTRY_ID}`,
        '    new_status: superseded',
        '    rationale: implemented here',
        '```',
      ].join('\n'),
    );
    await writeFile(join(supersedingDir, 'design.md'), '# Design\n');
  });

  afterAll(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('forge scope scan-archived-followups:active entry 被 superseding 扣 → 严格 ===0', () => {
    // 扫描 archive,refreshgrace-period 已被 superseding 扣除,entries 应为空
    const out = execFileSync('node', [CLI, 'scope', 'scan-archived-followups', 'new-id'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out);
    expect(parsed.entries).toEqual([]);
  });

  it('content_hash 稳定性:只改 forge-oos 段不破坏 hash', async () => {
    const changeDir = join(projectRoot, 'forge', 'changes', 'new-id');

    // 手动创建 changeDir + 完整 fixture(避免 try/catch 复杂逻辑)
    await mkdir(join(changeDir, 'specs'), { recursive: true });
    await writeFile(
      join(changeDir, 'specs', 'a.md'),
      '# A\n\n## Scenario: s1\n\n**Given** x\n\n**When** y\n\n**Then** z\n',
    );
    await writeFile(join(changeDir, 'tasks.md'), '# T\n\n- [ ] task-1: do thing\n');
    await writeFile(join(changeDir, 'design.md'), '# D\n');
    await writeFile(
      join(changeDir, 'proposal.md'),
      [
        '# new',
        '## Why\n\nw',
        '## What\n\nc',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries: []',
        '```',
      ].join('\n'),
    );

    // 计算初始 hash
    const h1 = await computeContentHash(changeDir);

    // 改 forge-oos 段(加 entry),其他内容不变
    await writeFile(
      join(changeDir, 'proposal.md'),
      [
        '# new',
        '## Why\n\nw',
        '## What\n\nc',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: x',
        '    category: out-of-scope',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );

    // 改 forge-oos 段后 hash 应不变
    const h2 = await computeContentHash(changeDir);
    expect(h1).toBe(h2);
  });

  it('forge validate 通过(scope YAML 合规)', () => {
    // new-id 已在 content_hash 测试中创建,此处复用
    const r = runCli(['validate', 'new-id'], projectRoot);
    expect(r.exitCode).toBe(0);
  });

  it('forge validate 拒签:scope YAML 缺 reason 字段 → exit 1', async () => {
    const changeDir = join(projectRoot, 'forge', 'changes', 'bad-id');
    await mkdir(join(changeDir, 'specs'), { recursive: true });
    await writeFile(
      join(changeDir, 'specs', 'a.md'),
      '# A\n\n## Scenario: s1\n\n**Given** x\n\n**When** y\n\n**Then** z\n',
    );
    await writeFile(join(changeDir, 'tasks.md'), '# T\n\n- [ ] task-1: do thing\n');
    await writeFile(join(changeDir, 'design.md'), '# D\n');
    await writeFile(
      join(changeDir, 'proposal.md'),
      [
        '# bad',
        '## Why\n\nw',
        '## What\n\nc',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: x',
        '    category: out-of-scope',
        '    description: d',
        '    reason: ""',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
    );

    // reason 为空字符串,validate 应拒签并 exit 1
    const r = runCli(['validate', 'bad-id'], projectRoot);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/reason|CRITICAL/);
  });
});
