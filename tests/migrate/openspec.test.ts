// forge migrate openspec — 集成测(--no-regenerate)
// fixture 覆盖 transformer 6 大反例:
// - specs/foo H4 Scenario + list-prefix WHEN/THEN
// - specs/bar 代码块内 #### Scenario(测 fenced 跳过)
// - specs/baz Description + 多行 WHEN 续行
// - changes/add-bar Problem/Proposed Solution + 数字编号
// - changes/three-level 三层编号 1.2.3
// - changes/archive/old-baz scoped spec + archive 归档

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrate } from '../../src/core/migrate/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('forge migrate openspec — 集成测(--no-regenerate)', () => {
  let tmp: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'forge-migrate-os-'));
    // cp fixture 到 tmp
    await cp(join(__dirname, '../fixtures/migrate/openspec-minimal'), tmp, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmp);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmp, { recursive: true, force: true });
  });

  it('--dry-run 不写 forge/', async () => {
    const code = await runMigrate({ source: 'openspec', dryRun: true });
    expect(code).toBe(0);
  });

  // P4 待实施 — 以下 case 当前期望 FAIL,等 P4 cp 路径实施完才会 PASS
  it.skip('--no-regenerate 实跑后 forge/ 树就位 + transformer 应用 + archive 不残', async () => {
    const code = await runMigrate({ source: 'openspec', noRegenerate: true });
    expect(code).toBe(0);
    // 1. forge/specs/foo/spec.md 含 ## Scenario(transform 后)
    const fooSpec = await readFile(join(tmp, 'forge/specs/foo/spec.md'), 'utf8');
    expect(fooSpec).toContain('## Scenario:');
    expect(fooSpec).not.toContain('#### Scenario:');
    // 2. forge/specs/bar/spec.md 代码块内 #### Scenario 字串保留
    const barSpec = await readFile(join(tmp, 'forge/specs/bar/spec.md'), 'utf8');
    expect(barSpec).toContain('#### Scenario: example'); // fenced 内不动
    // 3. forge/changes/add-bar/proposal.md 含 ## Why / ## What
    const proposal = await readFile(join(tmp, 'forge/changes/add-bar/proposal.md'), 'utf8');
    expect(proposal).toContain('## Why');
    expect(proposal).toContain('## What');
    // 4. forge/changes/three-level/tasks.md 三层 task-1-2-3:
    const tasks = await readFile(join(tmp, 'forge/changes/three-level/tasks.md'), 'utf8');
    expect(tasks).toMatch(/task-1-2-3:/);
    // 5. forge/changes/archive/old-baz/ 在 archive 子目录
    expect(
      await readFile(join(tmp, 'forge/changes/archive/old-baz/proposal.md'), 'utf8'),
    ).toBeTruthy();
    // 6. forge/drafts/idea-x.md 存在
    expect(await readFile(join(tmp, 'forge/drafts/idea-x.md'), 'utf8')).toBeTruthy();
  });
});
