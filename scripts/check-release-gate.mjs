#!/usr/bin/env node
// scripts/check-release-gate.mjs — plan-9c Task 5 Step 1.6.2
//
// 9z release-blocker gate(两层模式,沿 v5 codex 四轮 BLOCKER 1+2 修订):
//
// **soft 模式**(默认;9c plan 用):actual 与 EXPECTED_TODO_COUNT 比较 — 9c 完成时
//   EXPECTED=2,本地 gate 通过。这只是"reminder gate":9c 完成时已知 release-blocker,
//   不应让 9c CI fail。9c 不能宣称 release enforcement,仅作 reminder。
//
// **release 模式**(--release flag;9z plan 必须用):**硬约束** actual=0,
//   忽略 EXPECTED_TODO_COUNT,任何 it.todo 残留 → exit 1。这是真正的 release gate:
//   9z plan 实施者**不可**通过改 EXPECTED_TODO_COUNT 来绕过 — release 模式根本不读它
//
// v5 codex BLOCKER 1 修订:regex 兼容空白 `it\s*\.\s*todo\s*\(`,覆盖 `it . todo (` 等绕过
// v5 codex BLOCKER 2 修订:soft / release 双模式,release 模式 EXPECTED 不可改值绕过
//
// 集成:`pnpm test` 默认调 soft 模式(`pnpm test:gate`);9z release CI 配置必须调
// `pnpm test:gate:release`(--release flag)。9z plan 实施清单显式列接入 release CI。

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, '../tests/integration/release-blocker-attack-path.test.ts');

// **soft 模式** EXPECTED:9c=2(已知 release-blocker);9e1=5(plan-9c 2 + plan-9e1 3 failure-injection);
//                       9j=6(plan-9c 2 + plan-9e1 3 + plan-9j 1 fail-closed git error)
//                       9z plan 实施者**不需要**改这里,9z plan 应改 release CI 配置调 --release flag
// **release 模式**(--release flag):忽略 EXPECTED,强制 actual=0
// v2 MAJOR 2(plan-9e1):2 → 5(plan-9c 2 个 + plan-9e1 3 个 failure-injection it.todo)
// v3 MAJOR 1(plan-9j Task 4):5 → 6(+ plan-9j version-retrograde fail-closed git error it.todo)
// v4 pause-fence plan(Task 1-15):6 → 0(全 6 个 release-blocker it.todo 已 unskip,soft 期望归零)
const EXPECTED_TODO_COUNT_SOFT = 0;
const isRelease = process.argv.includes('--release');

// v6 codex NIT 修订:readFileSync 加 try/catch,文件不存在(中间状态)给清晰错误而非 stack trace
let content;
try {
  content = readFileSync(FILE, 'utf8');
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(
      `[release-gate] FAIL: 找不到 ${FILE}\n` +
        `如果你在 plan-9c 实施中间状态,先完成 Task 5 Step 1.6.1 创建 release-blocker-attack-path.test.ts。\n` +
        `如果你在 9z 实施中误删此文件,9z release gate 失效 — 必须恢复或重建。`,
    );
    process.exit(1);
  }
  throw err;
}

// v5 BLOCKER 1:regex 兼容空白,覆盖 `it . todo (` / `it.todo (` 等绕过形式
const matches = content.match(/it\s*\.\s*todo\s*\(/g) ?? [];
const actual = matches.length;

if (isRelease) {
  // release 模式硬约束:必须 actual = 0(9z 实施时全部 unskip)
  if (actual !== 0) {
    console.error(
      `[release-gate:release] FAIL: ${FILE} 含 ${actual} 个 it.todo,release 模式硬约束 actual=0\n` +
        `9z plan 实施者:必须 unskip 所有 it.todo(改为真 it() 跑 attack fixture)。\n` +
        `release 模式忽略 EXPECTED_TODO_COUNT_SOFT — 不可通过改 expected 值绕过。`,
    );
    process.exit(1);
  }
  console.log(`[release-gate:release] PASS: 0 it.todo (release gate enforced)`);
  process.exit(0);
}

// soft 模式:actual 与 EXPECTED 比较(9c 完成时 EXPECTED=2 通过)
if (actual !== EXPECTED_TODO_COUNT_SOFT) {
  console.error(
    `[release-gate:soft] FAIL: ${FILE} 含 ${actual} 个 it.todo,soft 期望 ${EXPECTED_TODO_COUNT_SOFT}\n` +
      `如果 9z plan 在 unskip,请同时改 EXPECTED_TODO_COUNT_SOFT 与 unskip 数量保持一致,\n` +
      `或者用 \`pnpm test:gate:release\` 跑 release 模式(release 模式不读 SOFT 值,硬约束 actual=0)。`,
  );
  process.exit(1);
}

console.log(
  `[release-gate:soft] PASS: ${actual} it.todo(s) = expected ${EXPECTED_TODO_COUNT_SOFT} (reminder only, NOT release enforcement)`,
);
