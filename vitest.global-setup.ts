// vitest 全局 setup — Plan 3 reviewer C1:6 个 CLI test 并行 build 导致 race
// 改为 globalSetup 跑一次,所有 test fork 共享 dist/

import { execSync } from 'node:child_process';

export async function setup(): Promise<void> {
  // 跑一次 build,所有 CLI test 共享 dist/cli/index.js
  console.log('[vitest globalSetup] running pnpm build once...');
  execSync('pnpm build', { stdio: 'inherit' });
}
