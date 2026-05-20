#!/usr/bin/env node
// release gate 自动化部分 — Plan 6
// 跑 5 个本地命令 + pnpm pack + 临时目录 dry install + forge --version 验证
// 任一失败 exit 非 0,docs/release-gate-checklist.md 的"自动化部分"调用本脚本

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
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

// Plan 7 Phase E:tarball 大小回归(加 exceljs 后 tarball ~490KB 上限,vs Plan 6 ~150KB)
console.log('\n[size] 校验 tarball 大小不超 1MB(exceljs 引入回归)...');
try {
  const tarballSize = statSync(tarballName).size;
  const sizeMB = tarballSize / 1024 / 1024;
  console.log(`  → ${tarballName}: ${sizeMB.toFixed(2)} MB`);
  if (sizeMB > 1.0) {
    throw new Error(`tarball 大小 ${sizeMB.toFixed(2)} MB 超阈值 1.0 MB`);
  }
  console.log('  ✓ tarball 大小 < 1 MB');
} catch (err) {
  console.error('FAIL: tarball size check');
  console.error(err.message);
  rmSync(tarballName, { force: true });
  process.exit(1);
}

// tarball 内容验证 —— 用 `npm pack --dry-run --json` 列文件清单
// 改用 npm pack(替代旧的 `tar -tzf`):tar 在 Windows 上不可用、旧实现遇 Windows 直接跳过校验,
// codex-review helper / prompt 模板缺失的发布 bug 正是从这道 Windows 缺口漏出去的。
// npm pack --dry-run 跨平台一致,Windows 也能跑,不再有跳过分支。
console.log('\n[tarball-content] 验证 tarball 内容(npm pack --dry-run)...');
try {
  const packJson = execSync('npm pack --dry-run --json', { encoding: 'utf8' });
  const entries = JSON.parse(packJson)[0].files.map((f) => f.path);
  // 期望存在的前缀
  const requiredPrefixes = [
    'dist/cli/index.js',
    'dist/core/templates/skills/',
    'scripts/codex-review-helper.mjs', // codex stage-extension helper —— 运行时必需(见 package.json files)
    'src/core/codex-review/prompts/', // codex adversarial prompt 模板 —— 运行时必需
    'README.md',
    'LICENSE',
    'package.json',
  ];
  for (const required of requiredPrefixes) {
    if (!entries.some((e) => e.startsWith(required))) {
      throw new Error(`tarball 缺少:${required}`);
    }
  }
  // 不该含的目录;codex-review 的 helper 与 prompt 模板是显式例外(见 requiredPrefixes)
  const allowedExceptions = ['scripts/codex-review-helper.mjs', 'src/core/codex-review/'];
  const forbiddenPrefixes = ['src/', 'tests/', 'forge-eval/', 'docs/', 'scripts/', '.github/'];
  for (const forbidden of forbiddenPrefixes) {
    const offender = entries.find(
      (e) => e.startsWith(forbidden) && !allowedExceptions.some((a) => e.startsWith(a)),
    );
    if (offender) {
      throw new Error(`tarball 不该含:${offender}`);
    }
  }
  console.log(`  → ${entries.length} 个文件,结构 OK`);
} catch (err) {
  console.error('FAIL: tarball 内容验证');
  console.error(err.message);
  rmSync(tarballName, { force: true });
  process.exit(3);
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
    throw new Error(
      `forge --version 输出 "${versionOut.trim()}" 不含 package.json 版本号 "${expected}"`,
    );
  }
  console.log(`  → forge --version 输出含 ${expected},OK`);

  // Plan 7 Phase E:验证 brownfield 工件 — legacy-bridge --help 含 5 子命令
  console.log('\n[brownfield] 验证 legacy-bridge --help 可用 ...');
  const helpOut = execSync('npx forge legacy-bridge --help', { cwd: dryDir, encoding: 'utf8' });
  const required = ['map', 'regenerate', 'index', 'sync-check', 'resolve'];
  for (const sub of required) {
    if (!helpOut.includes(sub)) {
      throw new Error(`legacy-bridge --help 输出缺子命令:${sub}`);
    }
  }
  console.log('  ✓ legacy-bridge --help 含 5 子命令');
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
