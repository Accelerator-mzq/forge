// tests/integration/run-forge-wrapper.test.ts
// v4.1.0 wrapper 重构(scripts/run-forge.mjs)源码层验证 — 不真 spawn(避免网络/平台依赖)
// 沿 tests/integration/opencode-plugin-bootstrap.test.ts:7-14 同模式 — readFileSync wrapper
// 源码 + 字符串 assertion 验证逻辑就位
//
// 三同根 bug 防回归:
//   1. REQUIRED_RANGE 字面必须 cmd-safe(无 ^ < > | 等 cmd 吃字符)
//   2. 主路径必须 spawn node + npx-cli.js + shell:false(绕 cmd.exe 解析)
//   3. fallback 保留 npx.cmd + shell:true(Node 21+ CVE-2024-27980 强制)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WRAPPER_PATH = join(process.cwd(), 'scripts/run-forge.mjs');
const src = readFileSync(WRAPPER_PATH, 'utf8');

describe('scripts/run-forge.mjs wrapper 源码验证(v4.1.0 重构)', () => {
  describe('REQUIRED_RANGE 字面 cmd-safe', () => {
    it('REQUIRED_RANGE 用 4.x 形式(不是 ^4.0.0)', () => {
      expect(src).toMatch(/const REQUIRED_RANGE\s*=\s*['"]4\.x['"]/);
    });

    it('REQUIRED_RANGE 不含 cmd.exe 吃字符(^ < > |)', () => {
      const match = src.match(/const REQUIRED_RANGE\s*=\s*['"]([^'"]+)['"]/);
      expect(match).not.toBeNull();
      const range = match![1] ?? '';
      expect(range).not.toContain('^');
      expect(range).not.toContain('<');
      expect(range).not.toContain('>');
      expect(range).not.toContain('|');
    });
  });

  describe('主路径:spawn node + npx-cli.js + shell:false(绕 cmd.exe)', () => {
    it('用 process.execPath 启动 node', () => {
      expect(src).toContain('process.execPath');
    });

    it('引用 npx-cli.js', () => {
      expect(src).toContain('npx-cli.js');
    });

    it('主路径 spawn 选项含 shell: false', () => {
      expect(src).toMatch(/shell:\s*false/);
    });

    it('用 npm root -g 解析 npx-cli.js 路径', () => {
      expect(src).toContain("execSync('npm root -g'");
    });

    it('candidate existsSync 检查通过才走主路径', () => {
      expect(src).toContain('existsSync(candidate)');
    });
  });

  describe('fallback 路径:spawn npx.cmd + shell:true(Node 21+ CVE-2024-27980)', () => {
    it('Windows fallback 用 npx.cmd', () => {
      expect(src).toContain("'npx.cmd'");
    });

    it('Windows fallback 用 shell: process.platform === win32', () => {
      expect(src).toMatch(/shell:\s*process\.platform === ['"]win32['"]/);
    });
  });

  describe('错误处理', () => {
    it('spawn 失败时输出含 failed to spawn', () => {
      expect(src).toContain('failed to spawn');
    });

    it('错误提示提到 Node 20+ 要求', () => {
      expect(src).toMatch(/Node\s*20\+/);
    });

    it('错误提示提到 forge-bundled 离线变体作为 air-gapped fallback', () => {
      expect(src).toContain('forge-bundled');
    });

    it('child.on(error) 退出码 127(标准 command not found)', () => {
      expect(src).toMatch(/process\.exit\(127\)/);
    });
  });

  describe('文档注释完整性', () => {
    it('注释解释 cmd-safe 规则(^ 被 cmd.exe escape 吃)', () => {
      // 防注释丢失导致未来 maintainer 不知道为啥不用 ^X.Y.Z
      expect(src).toMatch(/escape|cmd[\s.]*safe|吃/i);
    });

    it('注释提到 v4.1.0 重构', () => {
      expect(src).toContain('v4.1.0');
    });
  });
});
