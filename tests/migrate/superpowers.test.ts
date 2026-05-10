import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrate } from '../../src/core/migrate/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('forge migrate superpowers — 集成测(--no-regenerate)', () => {
  let tmp: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'forge-migrate-sp-'));
    // 复制 fixture 到临时目录(含 .git)
    await cp(join(__dirname, '../fixtures/migrate/superpowers-minimal'), tmp, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmp);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmp, { recursive: true, force: true });
  });

  it('--dry-run 不写 forge/', async () => {
    // dry-run 应成功(exit 0)且不创建 forge/ 目录
    const code = await runMigrate({ source: 'superpowers', dryRun: true });
    expect(code).toBe(0);
  });

  // 等 P4 cp 路径实施完才能跑 — 当前 it.skip 占位
  it.skip('add-auth(全 [x] + git slug+close commit) → archive 但缺件降级 active', async () => {
    const code = await runMigrate({
      source: 'superpowers',
      noRegenerate: true,
      noInteractive: true,
    });
    expect(code).toBe(4); // M13:archive 缺件 + non-interactive → exit 4
  });

  it.skip('cleanup-deps(部分 [x]) → active', async () => {
    // P4 cp 后启用
  });

  it.skip('single-task(1 task 100%, < 3) → active', async () => {
    // P4 cp 后启用
  });

  it.skip('orphan(plan-only) → active 且 design 缺', async () => {
    // P4 cp 后启用
  });

  it.skip('tasks.md 含 task-1-1: 嵌套;不含 **Step;中文冒号转英文', async () => {
    // P4 cp 后启用
  });
});

describe('forge migrate superpowers — unsafe-slug ≥ 50% exit 4(Task 3.8 集成测)', () => {
  let tmp: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'forge-sp-unsafe-half-'));
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmp, { recursive: true, force: true });
  });

  it('1/2 unsafe(50%)→ runMigrate exit 4', async () => {
    // 临时建 fixture(不用 superpowers-minimal,因为它没有 unsafe slug)
    const { mkdir, writeFile } = await import('node:fs/promises');
    const root = join(tmp, 'docs/superpowers');
    // 两个 spec:一个 unsafe slug(含 ..)、一个 good slug — 50% 触发 exit 4
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs/2026-01-01-..-design.md'), '# X\n');
    await writeFile(join(root, 'specs/2026-02-01-good-design.md'), '# Y\n');

    process.chdir(tmp);
    const code = await runMigrate({ source: 'superpowers', dryRun: true });
    expect(code).toBe(4);
  });
});
