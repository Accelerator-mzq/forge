// forge validate 子命令测试
// 测试验证 change 目录的成功/失败路径

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

beforeAll(() => execSync('pnpm build', { stdio: 'inherit' }));

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

  // Test 2: forge validate add-login 在 change 目录里 proposal 缺 Why → exit 2 + stderr 含 [proposal] why
  it('forge validate add-login 在 proposal 缺 Why 时 → exit 2, stderr 含 [proposal]', () => {
    const { dir, cleanup } = makeChangeDir('add-login', {
      proposal: '# Title\n\n## What\nw\n', // 没 Why
    });
    try {
      const r = runCli(['validate', 'add-login'], dir);
      expect(r.exitCode).toBe(2);
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
