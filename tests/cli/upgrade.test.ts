// v0.3 Plan 4 Task 4.3 / 4.4 — `forge upgrade` 命令集成测
// 5 case:
//   (1) 干净项目无 legacy → no-op + 友好提示
//   (2) v0.2 完整 legacy → SCAN + SHOW DIFF 列清单 + ASK(stdin pipe N)→ 无副作用
//   (3) v0.2 完整 legacy → ASK y → STASH 创建 + manifest hash + 原文件 mv 走
//   (4) --recover 24h 内 → 全部回原位 + stash 删
//   (5) --gc 删 >24h 过期 stash

import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FORGE_BIN = join(REPO_ROOT, 'dist', 'cli', 'index.js');

/** 跑 forge upgrade,可传 stdin(模拟 ASK 阶段输入) */
async function runForge(
  args: string[],
  cwd: string,
  stdinInput?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = execFile(
      'node',
      [FORGE_BIN, ...args],
      { cwd, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = err && 'code' in err ? Number(err.code) : 0;
        resolve({
          stdout: String(stdout),
          stderr: String(stderr),
          code,
        });
      },
    );
    if (stdinInput !== undefined && child.stdin) {
      child.stdin.write(stdinInput);
      child.stdin.end();
    }
  });
}

/** 在 tmpdir 建 v0.2 fixture(有 legacy adapter 产物) */
async function makeV02Fixture(): Promise<string> {
  const tmp = await mkdtemp(join(tmpdir(), 'forge-upgrade-test-'));
  // Claude legacy
  await mkdir(join(tmp, '.claude', 'skills', 'forge-brainstorming'), {
    recursive: true,
  });
  await writeFile(
    join(tmp, '.claude', 'skills', 'forge-brainstorming', 'SKILL.md'),
    '---\nname: forge:brainstorming\n---\nbrainstorm content\n',
    'utf8',
  );
  await mkdir(join(tmp, '.claude', 'skills', 'forge-using-forge'), {
    recursive: true,
  });
  await writeFile(
    join(tmp, '.claude', 'skills', 'forge-using-forge', 'SKILL.md'),
    '---\nname: forge:using-forge\n---\nusing forge\n',
    'utf8',
  );
  await mkdir(join(tmp, '.claude', 'commands', 'forge'), { recursive: true });
  await writeFile(
    join(tmp, '.claude', 'commands', 'forge', 'brainstorm.md'),
    '# brainstorm command',
    'utf8',
  );
  // Codex legacy(.agents/)
  await mkdir(join(tmp, '.agents', 'skills', 'forge-brainstorming'), {
    recursive: true,
  });
  await writeFile(
    join(tmp, '.agents', 'skills', 'forge-brainstorming', 'SKILL.md'),
    '---\nname: forge:brainstorming\n---\ncodex variant\n',
    'utf8',
  );
  // forge/ 产物(必须不动)
  await mkdir(join(tmp, 'forge', 'drafts'), { recursive: true });
  await writeFile(join(tmp, 'forge', 'drafts', '2026-05-09-test.md'), '# user draft', 'utf8');
  return tmp;
}

describe('forge upgrade', () => {
  it('case 1: 干净项目无 legacy → no-op', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-empty-'));
    const result = await runForge(['upgrade'], tmp);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No legacy artifacts found');
    await rm(tmp, { recursive: true, force: true });
  });

  it('case 2: v0.2 fixture --dry-run → SHOW DIFF 列清单 + 无副作用', async () => {
    const tmp = await makeV02Fixture();
    const result = await runForge(['upgrade', '--dry-run'], tmp);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Found');
    expect(result.stdout).toContain('forge-brainstorming');
    expect(result.stdout).toContain('Dry run only');
    // 验证文件没动
    expect(existsSync(join(tmp, '.claude', 'skills', 'forge-brainstorming', 'SKILL.md'))).toBe(
      true,
    );
    // forge/ 产物没动
    expect(existsSync(join(tmp, 'forge', 'drafts', '2026-05-09-test.md'))).toBe(true);
    await rm(tmp, { recursive: true, force: true });
  });

  it('case 3: v0.2 fixture y → STASH 完成 + manifest + 原文件 mv 走 + forge/ 不动', async () => {
    const tmp = await makeV02Fixture();
    const result = await runForge(['upgrade'], tmp, 'y\n');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Stashed');
    expect(result.stdout).toContain('plugin install');
    // 原 legacy 文件 mv 走了
    expect(existsSync(join(tmp, '.claude', 'skills', 'forge-brainstorming', 'SKILL.md'))).toBe(
      false,
    );
    expect(existsSync(join(tmp, '.agents', 'skills', 'forge-brainstorming', 'SKILL.md'))).toBe(
      false,
    );
    // forge/ 产物 100% 不动(关键不变量)
    expect(existsSync(join(tmp, 'forge', 'drafts', '2026-05-09-test.md'))).toBe(true);
    // stash 目录存在 + manifest 合法
    const stashes = (await readdir(tmp)).filter((n) => n.startsWith('.forge-upgrade-stash-'));
    expect(stashes.length).toBe(1);
    const manifestPath = join(tmp, stashes[0]!, '.manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(Array.isArray(manifest.artifacts)).toBe(true);
    expect(manifest.artifacts.length).toBeGreaterThan(0);
    await rm(tmp, { recursive: true, force: true });
  });

  it('case 4: ASK 阶段 N → 无副作用,文件全在原位', async () => {
    const tmp = await makeV02Fixture();
    const result = await runForge(['upgrade'], tmp, 'N\n');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Cancelled');
    // 文件全在原位
    expect(existsSync(join(tmp, '.claude', 'skills', 'forge-brainstorming', 'SKILL.md'))).toBe(
      true,
    );
    expect(existsSync(join(tmp, '.agents', 'skills', 'forge-brainstorming', 'SKILL.md'))).toBe(
      true,
    );
    // 无 stash dir
    const stashes = (await readdir(tmp)).filter((n) => n.startsWith('.forge-upgrade-stash-'));
    expect(stashes.length).toBe(0);
    await rm(tmp, { recursive: true, force: true });
  });

  it('case 5: --recover 24h 内 → 全部回原位 + stash 删', async () => {
    const tmp = await makeV02Fixture();
    // 先 upgrade y 创建 stash
    await runForge(['upgrade'], tmp, 'y\n');
    expect(existsSync(join(tmp, '.claude', 'skills', 'forge-brainstorming', 'SKILL.md'))).toBe(
      false,
    );

    // recover
    const result = await runForge(['upgrade', '--recover'], tmp);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Recovered');
    // 文件回原位
    expect(existsSync(join(tmp, '.claude', 'skills', 'forge-brainstorming', 'SKILL.md'))).toBe(
      true,
    );
    expect(existsSync(join(tmp, '.agents', 'skills', 'forge-brainstorming', 'SKILL.md'))).toBe(
      true,
    );
    // stash 删
    const stashes = (await readdir(tmp)).filter((n) => n.startsWith('.forge-upgrade-stash-'));
    expect(stashes.length).toBe(0);
    await rm(tmp, { recursive: true, force: true });
  });

  it('case 6: --gc 删过期 stash(>24h)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-gc-'));
    // 手工建 1 个过期 stash + 1 个新 stash
    const oldTs = '2020-01-01T00-00-00-000Z'; // 久远过期
    const newTs = new Date().toISOString().replace(/[:.]/g, '-');
    const oldStashName = `.forge-upgrade-stash-${oldTs}`;
    const newStashName = `.forge-upgrade-stash-${newTs}`;

    await mkdir(join(tmp, oldStashName), { recursive: true });
    await writeFile(
      join(tmp, oldStashName, '.manifest.json'),
      JSON.stringify({ ts: oldTs, projectRoot: tmp, artifacts: [] }),
      'utf8',
    );

    await mkdir(join(tmp, newStashName), { recursive: true });
    await writeFile(
      join(tmp, newStashName, '.manifest.json'),
      JSON.stringify({ ts: newTs, projectRoot: tmp, artifacts: [] }),
      'utf8',
    );

    const result = await runForge(['upgrade', '--gc'], tmp);
    expect(result.code).toBe(0);
    // 过期的删
    expect(existsSync(join(tmp, oldStashName))).toBe(false);
    // 新的留
    expect(existsSync(join(tmp, newStashName))).toBe(true);

    await rm(tmp, { recursive: true, force: true });
  });
});
