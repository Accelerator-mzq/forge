#!/usr/bin/env node
// v0.3 plugin helper(Plan 3 Task 3.1)
// 调用形态:
//   - Claude Code commands.md:`node ${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs <subcmd> <args>`
//   - OpenCode/Codex skill 文本内嵌:`node <plugin_dir>/scripts/run-forge.mjs <subcmd> <args>`
// 内部用 npx 拉 npm 包(@accelerator-mzq/forge@^4.0.0)调 forge CLI,避开 v0.2 P1
// (forge CLI 不在用户全局 PATH)
//
// bundled plugin 变体(Plan 5):build 期 patch 本文件,把 spawn npx 改为
//   spawn node + ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js,完全离线

import { spawn } from 'node:child_process';

// forge npm 包版本范围;改版本号时需与 package.json / .claude-plugin/plugin.json 手动同步
// 注:不用 `^4.0.0` 因 Windows 下 spawn shell:true 让 cmd.exe 把 `^` 当 escape char
// 吃掉(turn into `4.0.0` 精确版本,永远拉不到 patch update)。用 `4.x` 等价 `>=4.0.0 <5.0.0`,
// 字符全 cmd-safe(字母数字+点)。跨 major bump(4→5)时改为 `5.x`。
const REQUIRED_RANGE = '4.x';

const args = process.argv.slice(2);

// Windows: spawn 找不到 'npx',需 'npx.cmd';macOS/Linux 走 'npx'
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const child = spawn(
  npxBin,
  ['-y', '--package', `@accelerator-mzq/forge@${REQUIRED_RANGE}`, '--', 'forge', ...args],
  {
    stdio: 'inherit',
    // Windows 下 shell:true 让 spawn 解析 npx.cmd PATH(否则可能找不到)
    shell: process.platform === 'win32',
  },
);

child.on('exit', (code) => process.exit(code ?? 1));

child.on('error', (err) => {
  console.error(`run-forge: failed to spawn ${npxBin} — ${err.message}`);
  console.error(
    `需 Node 20+ 与 npm 7+ 在 PATH;air-gapped 用户改装 forge-bundled plugin 离线变体(Plan 5)`,
  );
  process.exit(127);
});
