#!/usr/bin/env node
// v0.3 plugin helper(Plan 3 Task 3.1)
// v4.1.0 重构:主路径 spawn node + npx-cli.js 直接(shell: false,无 cmd.exe 干扰)
//          fallback 旧路径 spawn npx.cmd(shell: true,Node 21+ CVE-2024-27980 强制)
//
// 调用形态:
//   - Claude Code commands.md:`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs <subcmd> <args>`
//   - OpenCode/Codex skill 文本内嵌:`node <plugin_dir>/scripts/run-forge.mjs <subcmd> <args>`
//
// bundled plugin 变体(Plan 5):build 期 patch 本文件,把 spawn npx 改为
//   spawn node + ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js,完全离线

import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// forge npm 包版本范围;改版本号时需与 package.json / .claude-plugin/plugin.json 手动同步
// 注:不用 `^4.0.0` 因 Windows 下 fallback 路径 shell:true 让 cmd.exe 把 `^` 当 escape char
// 吃掉(turn into `4.0.0` 精确版本,永远拉不到 patch update)。用 `4.x` 等价 `>=4.0.0 <5.0.0`,
// 字符全 cmd-safe(字母数字+点)。跨 major bump(4→5)时改为 `5.x`。
const REQUIRED_RANGE = '4.x';

const args = process.argv.slice(2);
const npxArgs = [
  '-y',
  '--package',
  `@accelerator-mzq/forge@${REQUIRED_RANGE}`,
  '--',
  'forge',
  ...args,
];

// 主路径:resolve npm 全局 root → spawn node + npx-cli.js + shell:false
// 这一路径无 cmd.exe 解释层,根治 v4.0.x 系列三同根 bug:
//   - JSON 花括号被吃(forge monitor record --json '{...}')
//   - 引号嵌套乱(stage-extensions build_prompt user-focus)
//   - `^` 被 escape 吃(REQUIRED_RANGE='^4.0.0' → npx 收到 '4.0.0' 精确版本)
let npxCliPath = null;
try {
  // npm root -g 跨 OS 标准接口:
  //   Windows: %APPDATA%\npm\node_modules
  //   *nix:    /usr/local/lib/node_modules(或 nvm/asdf node 版本下的对应目录)
  // 此命令 args 简单(无 cmd 元字符),即使经 cmd.exe shell:true 也不会被吃
  const npmRoot = execSync('npm root -g', {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  // npx 是 npm 自带的 cli,npx-cli.js 在 npm 包内的 bin/ 下
  const candidate = join(npmRoot, 'npm', 'bin', 'npx-cli.js');
  if (existsSync(candidate)) npxCliPath = candidate;
} catch {
  // npm 未装 / npm 6 无 npx-cli.js / 其他错 → fallback 旧路径
}

let child;
if (npxCliPath) {
  // ★ 主路径:node + npx-cli.js + args + shell:false(无 cmd.exe 解析层)
  child = spawn(process.execPath, [npxCliPath, ...npxArgs], {
    stdio: 'inherit',
    shell: false,
  });
} else {
  // fallback 旧路径(v4.0.2 wrapper):shell:true + npx.cmd
  // REQUIRED_RANGE 已 cmd-safe('4.x'),但 JSON / 引号嵌套仍可能被 cmd 吃
  // → 用户感知这条 fallback 时需用 --json-file / config user-focus 等 workaround
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  child = spawn(npxBin, npxArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32', // Node 21+ CVE-2024-27980 强制
  });
}

child.on('exit', (code) => process.exit(code ?? 1));

child.on('error', (err) => {
  console.error(`run-forge: failed to spawn — ${err.message}`);
  console.error(
    `需 Node 20+ 与 npm 7+ 在 PATH;air-gapped 用户改装 forge-bundled plugin 离线变体(Plan 5)`,
  );
  process.exit(127);
});
