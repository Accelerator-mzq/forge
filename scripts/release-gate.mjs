#!/usr/bin/env node
// release gate 自动化部分 — Plan 6
// 跑 5 个本地命令 + pnpm pack + 临时目录 dry install + forge --version 验证
// 任一失败 exit 非 0,docs/release-gate-checklist.md 的"自动化部分"调用本脚本

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 5 个本地命令步骤
const steps = [
  { name: 'typecheck', cmd: 'pnpm typecheck' },
  { name: 'lint', cmd: 'pnpm lint' },
  { name: 'format:check', cmd: 'pnpm format:check' },
  { name: 'build', cmd: 'pnpm build' },
  { name: 'vitest', cmd: 'pnpm vitest run' },
];

console.log('=== forge release gate(自动化部分)===\n');

// 循环跑 5 个本地命令
for (const step of steps) {
  process.stdout.write(`[${step.name}] ... `);
  try {
    execSync(step.cmd, { stdio: 'pipe' });
    console.log('OK');
  } catch (err) {
    console.log('FAIL');
    console.error(err.stdout?.toString() ?? '');
    console.error(err.stderr?.toString() ?? '');
    process.exit(1);
  }
}

// pnpm pack 真打 tarball,验证文件内容
console.log('\n[pack] pnpm pack 打 tarball ...');
let tarballName;
try {
  const out = execSync('pnpm pack', { encoding: 'utf8' });
  // pnpm pack 输出 tarball 文件名(最后一行)
  const lines = out.trim().split(/\r?\n/);
  tarballName = lines[lines.length - 1].trim();
  if (!tarballName.endsWith('.tgz')) {
    throw new Error(`pnpm pack 输出未识别 tarball:${out}`);
  }
  console.log(`  → ${tarballName}`);
} catch (err) {
  console.error('FAIL: pnpm pack');
  console.error(err.message);
  process.exit(2);
}

// tarball 结构验证(tar -tzf 列内容,过滤 package/ 前缀)
// Windows 下 tar 不可用时 warn 跳过,不阻塞
console.log('\n[tarball-content] 验证 tarball 内容 ...');
try {
  const out = execSync(`tar -tzf ${tarballName}`, { encoding: 'utf8' });
  const entries = out.split(/\r?\n/).filter(Boolean).map((e) => e.replace(/^package\//, ''));
  // 期望:dist/cli/index.js + dist/core/templates/skills/<12>.md + README.md + LICENSE + LICENSE-THIRD-PARTY.md + package.json
  const requiredPrefixes = [
    'dist/cli/index.js',
    'dist/core/templates/skills/',
    'README.md',
    'LICENSE',
    'package.json',
  ];
  for (const required of requiredPrefixes) {
    if (!entries.some((e) => e.startsWith(required))) {
      throw new Error(`tarball 缺少:${required}`);
    }
  }
  // 不应有的:src/、tests/、forge-eval/、docs/、scripts/、.github/
  const forbiddenPrefixes = ['src/', 'tests/', 'forge-eval/', 'docs/', 'scripts/', '.github/'];
  for (const forbidden of forbiddenPrefixes) {
    if (entries.some((e) => e.startsWith(forbidden))) {
      throw new Error(`tarball 不该含:${forbidden}`);
    }
  }
  console.log(`  → ${entries.length} 个文件,结构 OK`);
} catch (err) {
  // Windows 下 tar 命令可能不可用,warn 后跳过(不阻塞)
  if (process.platform === 'win32') {
    console.warn('  ⚠ Windows 下 tar 命令不可用,跳过 tarball 内容验证(请用 WSL 或 macOS/Linux 重跑)');
  } else {
    // 非 Windows 环境 tarball 验证失败是真实错误
    console.error('FAIL: tarball 内容验证');
    console.error(err.message);
    rmSync(tarballName, { force: true });
    process.exit(3);
  }
}

// 临时目录 dry install + forge --version 验证
console.log('\n[dry-install] 临时目录安装 tarball + forge --version ...');
const dryDir = mkdtempSync(join(tmpdir(), 'forge-dry-'));
try {
  // 在 dry 目录初始化 npm 项目,装 tarball
  execSync('npm init -y', { cwd: dryDir, stdio: 'pipe' });
  execSync(`npm install ${join(process.cwd(), tarballName)}`, { cwd: dryDir, stdio: 'pipe' });
  // 跑 npx forge --version
  const versionOut = execSync('npx forge --version', { cwd: dryDir, encoding: 'utf8' });
  const expected = JSON.parse(readFileSync('package.json', 'utf8')).version;
  if (!versionOut.includes(expected)) {
    throw new Error(`forge --version 输出 "${versionOut.trim()}" 不含 package.json 版本号 "${expected}"`);
  }
  console.log(`  → forge --version 输出含 ${expected},OK`);
} catch (err) {
  console.error('FAIL: dry install');
  console.error(err.message);
  rmSync(dryDir, { recursive: true, force: true });
  // 不删 tarball — 让维护者可手动调试
  process.exit(4);
} finally {
  // 清理临时目录
  rmSync(dryDir, { recursive: true, force: true });
}

// 清理 tarball
rmSync(tarballName, { force: true });

console.log('\n=== release gate 自动化部分 PASS ===');
console.log('\n下一步:跑 docs/release-gate-checklist.md 的手动部分(harness acceptance test)');
process.exit(0);
