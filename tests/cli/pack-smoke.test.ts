// tests/cli/pack-smoke.test.ts — pnpm pack tarball 冒烟测试
// 验证:tarball 包含 dist/cli/index.js,且 shebang 正确保留
// 注意:用纯 Node.js zlib 解析 tarball,避免 Windows 下 tar 命令的路径兼容问题
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// 仓库根目录(相对测试文件往上两级)
const REPO_ROOT = resolve(__dirname, '../..');

/**
 * 纯 Node.js 解析 .tgz 文件,返回所有 entry 名称列表
 * 兼容 Windows + Linux,不依赖外部 tar 命令
 */
function listTarEntries(tgzPath: string): string[] {
  // 1. gunzip
  const compressed = readFileSync(tgzPath);
  const buf = gunzipSync(compressed);

  // 2. 手动扫描 tar header(512 字节对齐)
  const names: string[] = [];
  let offset = 0;
  while (offset + 512 <= buf.length) {
    // tar header 前 100 字节是文件名
    const rawName = buf.subarray(offset, offset + 100);
    const name = rawName.toString('utf8').replace(/\0/g, '').trim();
    if (!name) break; // 两个全零 block 表示结束

    names.push(name);

    // 文件大小在 offset+124,长度 12,以八进制字符串存储
    const sizeBytes = buf.subarray(offset + 124, offset + 136);
    const sizeStr = sizeBytes.toString('utf8').replace(/\0/g, '').trim();
    const size = parseInt(sizeStr, 8) || 0;

    // 下一个 header 位置 = 当前 header(512) + 内容(512 字节对齐)
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}

describe('pnpm pack tarball smoke', () => {
  it('produces tarball that includes dist/cli/index.js', () => {
    // 创建临时目录存放 tarball
    const tmp = mkdtempSync(join(tmpdir(), 'forge-pack-'));
    try {
      // 1. 执行 pnpm pack,将 tarball 输出到临时目录
      execSync('pnpm pack --pack-destination ' + JSON.stringify(tmp), {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        // 捕获 stderr 防止 pnpm 的 info 输出干扰
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // 2. 直接读取临时目录找 .tgz 文件(不依赖 pnpm stdout 的路径格式)
      const files = readdirSync(tmp);
      const tgzFile = files.find((f) => f.endsWith('.tgz'));
      expect(tgzFile).toBeDefined();
      const tgzPath = join(tmp, tgzFile!);
      expect(existsSync(tgzPath)).toBe(true);

      // 3. 用纯 Node.js 解析 tarball,验证包含关键文件
      // npm 惯例:tarball 内路径前缀为 package/
      const entries = listTarEntries(tgzPath);
      expect(entries).toContain('package/dist/cli/index.js');
      expect(entries).toContain('package/LICENSE');
      expect(entries).toContain('package/LICENSE-THIRD-PARTY.md');
      expect(entries).toContain('package/README.md');
    } finally {
      // 清理临时目录
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('shebang preserved in dist/cli/index.js', () => {
    // 读取已构建的 dist/cli/index.js,验证第一行是 shebang
    const distEntry = resolve(REPO_ROOT, 'dist/cli/index.js');
    const content = readFileSync(distEntry, 'utf8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });
});
