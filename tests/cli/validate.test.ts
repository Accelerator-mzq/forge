// forge validate 子命令测试
// 测试验证 change 目录的成功/失败路径

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

// 帮助函数：生成临时 change 目录，支持覆盖 proposal、design、tasks、specs 文件
function makeChangeDir(
  changeId: string,
  overrides?: {
    proposal?: string;
    design?: string;
    tasks?: string;
    specs?: Record<string, string>;
  },
): { dir: string; cleanup: () => void } {
  const d = mkdtempSync(join(tmpdir(), 'forge-cli-validate-'));
  const changeDir = join(d, 'forge', 'changes', changeId);
  mkdirSync(changeDir, { recursive: true });

  writeFileSync(
    join(changeDir, 'proposal.md'),
    overrides?.proposal ?? '# Title\n\n## Why\nr\n\n## What\nw\n',
  );
  writeFileSync(
    join(changeDir, 'design.md'),
    overrides?.design ?? '# Design\n\n## Architecture\nx\n',
  );
  writeFileSync(join(changeDir, 'tasks.md'), overrides?.tasks ?? '# T\n\n- [ ] t1: a\n');

  const specsDir = join(changeDir, 'specs');
  mkdirSync(specsDir);
  if (overrides?.specs) {
    for (const [name, content] of Object.entries(overrides.specs)) {
      writeFileSync(join(specsDir, name), content);
    }
  } else {
    writeFileSync(
      join(specsDir, 's.md'),
      '# S\n\n## Scenario: x\n\n**Given** g\n**When** w\n**Then** t\n',
    );
  }

  return {
    dir: d,
    cleanup: () => rmSync(d, { recursive: true, force: true }),
  };
}

describe('forge validate', () => {
  // Test 1: forge validate add-login 在合法 change 目录下 → exit 0 + stdout 含 ✓
  it('forge validate add-login 在合法 change 目录下 → exit 0, stdout 含 ✓ add-login: valid', () => {
    const { dir, cleanup } = makeChangeDir('add-login');
    try {
      const r = runCli(['validate', 'add-login'], dir);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('✓ add-login: valid');
    } finally {
      cleanup();
    }
  });

  // Test 2: forge validate add-login 在 change 目录里 proposal 缺 Why → exit 1(v3 B2 修订:business-fail 标 CRITICAL → exit 1)
  it('forge validate add-login 在 proposal 缺 Why 时 → exit 1(CRITICAL), stderr 含 [proposal]', () => {
    const { dir, cleanup } = makeChangeDir('add-login', {
      proposal: '# Title\n\n## What\nw\n', // 没 Why
    });
    try {
      const r = runCli(['validate', 'add-login'], dir);
      // v3 B2 修订:business-fail 现在是 CRITICAL → exit 1(不再是 exit 2)
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain('[proposal]');
    } finally {
      cleanup();
    }
  });

  // Test 3: forge validate xxx 在 change 不存在时 → exit 2
  it('forge validate xxx 在 change 不存在时 → exit 2', () => {
    const { dir, cleanup } = makeChangeDir('dummy'); // 创建一个目录但查询不存在的 change
    try {
      const r = runCli(['validate', 'nonexistent'], dir);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain('✗ nonexistent');
    } finally {
      cleanup();
    }
  });
});

// ─── v2 B2 修订:exit 0/1/2 三档测试 ────────────────────────────────────────────

const CLI = join(process.cwd(), 'dist', 'cli', 'index.js');

describe('forge validate exit code(v2 B2 修订:0/1/2 三档)', () => {
  let projectRoot: string;
  let changeDir: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'forge-validate-exit-'));
    changeDir = join(projectRoot, 'forge', 'changes', 'test-id');
    await mkdir(join(changeDir, 'specs'), { recursive: true });
    // v6 codex 五轮 BLOCKER 1 修订:fixture 必须满足 specs.ts:12 (scenarios.length>0) + given/when/then 非空
    // 沿 parse/specs.ts STEP_RE = /^\*\*(Given|When|Then|And|But)\*\*\s+(.+)$/i,必须用 **Given** 加粗格式
    // 否则 "全合规 → exit 0" 用例会 fail
    await writeFile(
      join(changeDir, 'specs', 'a.md'),
      '# A\n\n## Scenario: s1\n\n**Given** x\n\n**When** y\n\n**Then** z\n',
    );
    // tasks.ts:8 要求 items.length>0;沿 parse/tasks.ts TASK_RE = /^\s*- \[([ x])\]\s+([\w-]+)\s*:\s*(.+)$/
    // 必须含冒号分隔 id 和 description:`- [ ] task-1: do thing`
    await writeFile(join(changeDir, 'tasks.md'), '# T\n\n- [ ] task-1: do thing\n');
    await writeFile(join(changeDir, 'design.md'), '# D\n');
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('全合规 → exit 0', () => {
    writeFileSync(join(changeDir, 'proposal.md'), '# P\n\n## Why\n\nw\n\n## What\n\nc\n');
    const out = execFileSync('node', [CLI, 'validate', 'test-id'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    expect(out).toContain('valid');
  });

  it('CRITICAL scope finding → exit 1', () => {
    writeFileSync(
      join(changeDir, 'proposal.md'),
      [
        '# P\n## Why\n\nw\n## What\n\nc',
        '## Out of Scope {#forge-oos}\n',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: a',
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
    let exitCode = 0;
    try {
      execFileSync('node', [CLI, 'validate', 'test-id'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 0;
    }
    expect(exitCode).toBe(1);
  });

  it('proposal missing Why → CRITICAL business-fail → exit 1(v3 B2 修订:删 v2 旧"exit 2"期望)', () => {
    writeFileSync(join(changeDir, 'proposal.md'), '# P\n\n## What\n\nc\n');
    let exitCode = 0;
    try {
      execFileSync('node', [CLI, 'validate', 'test-id'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 0;
    }
    expect(exitCode).toBe(1); // v3 修订:business-fail 也算 CRITICAL → exit 1(沿 master §3.12.3 freeze)
  });

  it('fs error(proposal.md 不存在)→ exit 2(仅 fs/config 错走 2)', () => {
    // 不写 proposal.md 模拟 fs 错(beforeEach 没创建它)
    let exitCode = 0;
    try {
      execFileSync('node', [CLI, 'validate', 'test-id'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 0;
    }
    expect(exitCode).toBe(2);
  });
});
