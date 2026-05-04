import { describe, it, expect } from 'vitest';
import { computeDiffHash, DEFAULT_DIFF_EXCLUDE } from '../../../src/core/hash/index.js';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 创建一个临时 git 仓库供测试使用。
 * 注意：git config 拆成两条单独命令，避免 shell 兼容性问题（不依赖 /bin/bash）。
 */
function makeGitRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'forge-diff-'));
  // 初始化 git 仓库，指定 main 分支
  execSync('git init -b main', { cwd: d, stdio: 'ignore' });
  // 单独配置 user.email 和 user.name，不使用 shell && 链式写法
  execSync('git config user.email t@t.com', { cwd: d, stdio: 'ignore' });
  execSync('git config user.name t', { cwd: d, stdio: 'ignore' });
  // 写入初始文件
  writeFileSync(join(d, 'README.md'), '# initial\n');
  mkdirSync(join(d, 'src'));
  writeFileSync(join(d, 'src', 'a.ts'), 'export const a = 1;\n');
  // 提交初始状态（commit message 不带空格避免 shell 转义问题）
  execSync('git add .', { cwd: d, stdio: 'ignore' });
  execSync('git commit -m init', { cwd: d, stdio: 'ignore' });
  return d;
}

describe('computeDiffHash', () => {
  it('无 changes 时返回稳定的 hash', async () => {
    // 没有任何未提交变更时，两次调用结果相同
    const d = makeGitRepo();
    try {
      const a = await computeDiffHash(d, {
        include: ['src/**'],
        exclude: [...DEFAULT_DIFF_EXCLUDE],
      });
      const b = await computeDiffHash(d, {
        include: ['src/**'],
        exclude: [...DEFAULT_DIFF_EXCLUDE],
      });
      expect(a).toBe(b);
      // 校验格式：sha256: + 64 位 hex
      expect(a).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('src 代码改动会让 hash 变化', async () => {
    // 修改 src/a.ts（在 include 范围内），hash 必须不同
    const d = makeGitRepo();
    try {
      const before = await computeDiffHash(d, {
        include: ['src/**'],
        exclude: [...DEFAULT_DIFF_EXCLUDE],
      });
      writeFileSync(join(d, 'src', 'a.ts'), 'export const a = 2;\n'); // 修改代码
      const after = await computeDiffHash(d, {
        include: ['src/**'],
        exclude: [...DEFAULT_DIFF_EXCLUDE],
      });
      expect(before).not.toBe(after);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('include 范围外的改动（README.md）不影响 hash', async () => {
    // 只 include src/**，修改 README.md 不在该 pathspec 内，hash 应保持不变
    const d = makeGitRepo();
    try {
      const before = await computeDiffHash(d, {
        include: ['src/**'],
        exclude: [...DEFAULT_DIFF_EXCLUDE],
      });
      writeFileSync(join(d, 'README.md'), '# changed\n'); // 修改 README（不在 include 范围）
      const after = await computeDiffHash(d, {
        include: ['src/**'],
        exclude: [...DEFAULT_DIFF_EXCLUDE],
      });
      expect(before).toBe(after);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
