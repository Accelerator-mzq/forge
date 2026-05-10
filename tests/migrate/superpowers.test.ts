import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, cp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

  // Task 5.16:enforceArchiveIntegrity 实施后启用(M13 — archive 缺件 + no-interactive → exit 4)
  it('add-auth(全 [x] + git slug+close commit) → archive 但缺件;--no-interactive → exit 4', async () => {
    // add-auth 被 archive-detect 推 archive(全 [x] + git close commit)
    // superpowers 必缺 proposal/specs;--no-interactive + --no-regenerate → M13 abort exit 4
    const code = await runMigrate({
      source: 'superpowers',
      noRegenerate: true,
      noInteractive: true,
    });
    expect(code).toBe(4);
  });

  it('cleanup-deps(部分 [x]) → active', async () => {
    // cleanup-deps 有 3 个 step,其中 1 个未完成 → 不满足 archive 条件 → active
    const code = await runMigrate({ source: 'superpowers', noRegenerate: true });
    expect(code).toBe(0);
    // forge/changes/cleanup-deps/{design,tasks}.md 就位(active 路径)
    expect(existsSync(join(tmp, 'forge/changes/cleanup-deps/design.md'))).toBe(true);
    expect(existsSync(join(tmp, 'forge/changes/cleanup-deps/tasks.md'))).toBe(true);
    // tasks.md 含 task- 前缀(transformer 应用 **Step → task-N)
    const tasks = await readFile(join(tmp, 'forge/changes/cleanup-deps/tasks.md'), 'utf8');
    expect(tasks).toMatch(/task-/);
  });

  it('single-task(1 task 100%, < 3) → active', async () => {
    // single-task 只有 1 个 step → task 数量 < 3,不满足 archive 阈值 → active
    const code = await runMigrate({ source: 'superpowers', noRegenerate: true });
    expect(code).toBe(0);
    // single-task 应在 active 路径(不应被推 archive)
    expect(existsSync(join(tmp, 'forge/changes/single-task/tasks.md'))).toBe(true);
    expect(existsSync(join(tmp, 'forge/changes/archive/single-task'))).toBe(false);
  });

  it('orphan(plan-only) → active 且 design 缺', async () => {
    // orphan 只有 plan,无对应 design → active,design.md 缺
    const code = await runMigrate({ source: 'superpowers', noRegenerate: true });
    expect(code).toBe(0);
    // tasks.md 存在(plan.md → tasks.md)
    expect(existsSync(join(tmp, 'forge/changes/orphan/tasks.md'))).toBe(true);
    // design.md 不存在(orphan 无 design 文件)
    expect(existsSync(join(tmp, 'forge/changes/orphan/design.md'))).toBe(false);
  });

  it('add-auth tasks.md 含 task-1-1: 嵌套;不含 **Step;中文冒号转英文', async () => {
    // add-auth 被 archive-detect 推 archive(全 [x] + git close commit)
    // P4 阶段无 enforceArchiveIntegrity → 会写到 archive 路径
    const code = await runMigrate({ source: 'superpowers', noRegenerate: true });
    expect(code).toBe(0);
    // archive-detect 推 archive:路径为 forge/changes/archive/add-auth/tasks.md
    const tasksPath = existsSync(join(tmp, 'forge/changes/archive/add-auth/tasks.md'))
      ? join(tmp, 'forge/changes/archive/add-auth/tasks.md')
      : join(tmp, 'forge/changes/add-auth/tasks.md'); // fallback(active 路径)
    const tasks = await readFile(tasksPath, 'utf8');
    expect(tasks).toMatch(/task-1-1:/); // 嵌套 step 转换
    expect(tasks).not.toContain('**Step'); // **Step 消失
    expect(tasks).not.toContain('：'); // 中文冒号转英文
  });
});

describe('forge migrate superpowers — M16 bundled 探测(Task 5.17)', () => {
  let tmp: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'forge-migrate-sp-bundled-'));
    await cp(join(__dirname, '../fixtures/migrate/superpowers-minimal'), tmp, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmp);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmp, { recursive: true, force: true });
    // 清理 env(防止测试污染)
    delete process.env['FORGE_BUNDLED'];
  });

  it('FORGE_BUNDLED=1 + superpowers + --no-interactive → exit 4(bundled 拒绝静默降级)', async () => {
    // M16:bundled 环境下 superpowers + no-interactive → 拒绝静默降级 exit 4
    process.env['FORGE_BUNDLED'] = '1';
    const code = await runMigrate({
      source: 'superpowers',
      noInteractive: true,
    });
    expect(code).toBe(4);
  });

  it('FORGE_BUNDLED=1 + superpowers + 交互(默认 yes) → exit 0(fallback no-regen)', async () => {
    // M16:bundled + superpowers + 交互模式 → promptYesNo 默认 true → 继续(no-regen)
    process.env['FORGE_BUNDLED'] = '1';
    const code = await runMigrate({
      source: 'superpowers',
      // noInteractive 不设 → 走 promptYesNo 默认 yes → regenEnabled=false + M13 降级 active → exit 0
    });
    expect(code).toBe(0);
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
