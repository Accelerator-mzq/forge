#!/usr/bin/env node
// v0.3 Plan 5 Task 5.1 — 打 forge-bundled plugin tarball(仅 Claude Code)
// 输出:dist-bundled/forge-bundled-v<version>.tgz
//
// 流程:
//   1. 跑 pnpm build 产 dist/
//   2. mkdir staging,cp .claude-plugin/, skills/, commands/, hooks/, dist/, scripts/run-forge.mjs
//   3. patch scripts/run-forge.mjs(spawn npx → spawn node + dist/cli/index.js,完全离线)
//   4. patch marketplace.json plugin name → forge-bundled
//   5. tar czf 重打包
//
// 体积:~3-7 MB(含 dist/);若超 50 MB 报错(可能误打了 node_modules)

import { spawnSync } from 'node:child_process';
import { mkdir, rm, cp, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PKG = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version;

const OUT_DIR = join(REPO_ROOT, 'dist-bundled');
const STAGING = join(OUT_DIR, 'staging');
const TARBALL = join(OUT_DIR, `forge-bundled-v${VERSION}.tgz`);

console.log(`Building bundled plugin v${VERSION}...`);

// 1. 清旧产物 + 跑 pnpm build(确保 dist/ 最新)
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(STAGING, { recursive: true });

console.log('Running pnpm build...');
const buildResult = spawnSync('pnpm', ['build'], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  shell: true,
});
if (buildResult.status !== 0) {
  console.error('pnpm build failed,abort');
  process.exit(1);
}

// 2. 拷 plugin 必需目录到 staging(仅 Claude Code 形态)
const dirsToCp = ['.claude-plugin', 'skills', 'commands', 'hooks', 'dist'];
for (const dir of dirsToCp) {
  const src = join(REPO_ROOT, dir);
  if (!existsSync(src)) {
    console.error(`Missing required dir: ${dir}`);
    process.exit(1);
  }
  await cp(src, join(STAGING, dir), { recursive: true });
}

// 拷 run-forge.mjs(单文件)
await mkdir(join(STAGING, 'scripts'), { recursive: true });
await cp(join(REPO_ROOT, 'scripts', 'run-forge.mjs'), join(STAGING, 'scripts', 'run-forge.mjs'));

// 3. patch staging/scripts/run-forge.mjs:spawn npx → spawn node + dist/cli/index.js(离线)
// 把整个文件内容替换为 bundled 变体(原内容是 npx 形态,bundled 不需要)
const runForgePath = join(STAGING, 'scripts', 'run-forge.mjs');

const runForgeBundled = `#!/usr/bin/env node
// forge-bundled 变体的 run-forge.mjs(Plan 5 build 期生成)
// 直接调 plugin 内 vendored dist/cli/index.js,完全离线,不依赖 npx + npm registry

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const child = spawn(
  'node',
  [join(__dirname, '..', 'dist', 'cli', 'index.js'), ...args],
  { stdio: 'inherit' },
);

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error(\`run-forge (bundled): failed to spawn node — \${err.message}\`);
  console.error('需 Node 20+ 在 PATH');
  process.exit(127);
});
`;

await writeFile(runForgePath, runForgeBundled, 'utf8');
console.log('✓ patched run-forge.mjs(bundled variant: spawn node + dist/cli/index.js)');

// 4. patch staging/.claude-plugin/marketplace.json:plugin name → forge-bundled
const marketplacePath = join(STAGING, '.claude-plugin', 'marketplace.json');
const marketplace = JSON.parse(await readFile(marketplacePath, 'utf8'));
if (marketplace.plugins && marketplace.plugins[0]) {
  marketplace.plugins[0].name = 'forge-bundled';
  marketplace.plugins[0].description = 'Forge bundled (offline, vendored dist/)';
}
await writeFile(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n', 'utf8');
console.log('✓ patched marketplace.json(plugin name → forge-bundled)');

// 5. tar czf 重打包(Windows 10+ 自带 bsdtar 在 C:\\Windows\\System32\\tar.exe;
// Git Bash 下 GNU tar 误把 D: 当 remote host,需 --force-local)
console.log('Creating tarball...');
const tarArgs =
  process.platform === 'win32'
    ? ['--force-local', '-czf', TARBALL, '-C', STAGING, '.']
    : ['-czf', TARBALL, '-C', STAGING, '.'];
const tarResult = spawnSync('tar', tarArgs, { stdio: 'inherit' });
if (tarResult.status !== 0) {
  console.error('tar 失败');
  process.exit(1);
}

// 6. 验证 tarball 大小合理(1-50 MB)
const tarStat = await stat(TARBALL);
const sizeMB = (tarStat.size / 1024 / 1024).toFixed(2);
console.log(`✓ Built ${TARBALL} (${sizeMB} MB)`);

if (tarStat.size < 100 * 1024) {
  console.error(`Tarball 过小(${sizeMB} MB),可能缺 dist/`);
  process.exit(1);
}
if (tarStat.size > 50 * 1024 * 1024) {
  console.error(`Tarball 过大(${sizeMB} MB),可能误打 node_modules`);
  process.exit(1);
}

console.log('');
console.log('Done. Test with(Claude Code 内):');
console.log(`  /plugin install --from-tarball "${TARBALL}"`);
console.log('');
console.log('或直接 release 到 GitHub Release artifact:');
console.log(`  gh release upload v${VERSION} "${TARBALL}"`);
