// vitest 全局 setup — Plan 3 reviewer C1:6 个 CLI test 并行 build 导致 race
// 改为 globalSetup 跑一次,所有 test fork 共享 dist/

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function setup(): Promise<void> {
  // 跑一次 build,所有 CLI test 共享 dist/cli/index.js
  console.log('[vitest globalSetup] running pnpm build once...');
  execSync('pnpm build', { stdio: 'inherit' });

  // 给 superpowers-minimal fixture 跑 git init + commit(Task 3.9)
  // 用 if 守护避免重复 init
  const fixtureRoot = join(__dirname, 'tests/fixtures/migrate/superpowers-minimal');
  if (existsSync(fixtureRoot) && !existsSync(join(fixtureRoot, '.git'))) {
    console.log('[vitest globalSetup] initializing superpowers-minimal fixture git repo...');
    execSync('git init', { cwd: fixtureRoot, stdio: 'pipe' });
    execSync('git config user.email "test@test"', { cwd: fixtureRoot, stdio: 'pipe' });
    execSync('git config user.name "test"', { cwd: fixtureRoot, stdio: 'pipe' });
    execSync('git add .', { cwd: fixtureRoot, stdio: 'pipe' });
    execSync('git commit -m "feat: initial fixture commit"', { cwd: fixtureRoot, stdio: 'pipe' });
    // 添加含 close+slug 关键词的 commit,供 archive-detect git log 检测使用
    execSync('git commit --allow-empty -m "close add-auth: ship feature"', {
      cwd: fixtureRoot,
      stdio: 'pipe',
    });
    execSync('git commit --allow-empty -m "docs: close-out the meeting notes"', {
      cwd: fixtureRoot,
      stdio: 'pipe',
    });
    console.log('[vitest globalSetup] superpowers-minimal fixture git repo initialized.');
  }
}
