# Plan 5 — Bundled Plugin Build Script + Release-gate 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:`scripts/build-bundled-plugin.mjs` — 把 npm 包 `dist/` + 仓库根 `skills/` + `commands/` + `hooks/` + `.claude-plugin/` 重打包成 `forge-bundled-v0.3.0.tgz`(**仅 Claude Code 形态**,不含 `.codex-plugin/` / `.opencode/`),供 air-gapped 用户 `/plugin install --from-tarball` 离线装。同步更新 release-gate-checklist 加 v0.3 段。

**Architecture**:build 期 npm pack 拿 dist/ → 解压 → 与仓库根 plugin 内容合并 → patch `scripts/run-forge.mjs` 把 spawn npx 改为内嵌 `node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js` 调用(不需运行时分支)→ tar czf 重打包。

**Tech Stack**:Node 20+(tar 用 `node-tar` 或调用系统 tar 命令);无新 npm 依赖(尽可能复用 Node + 系统 tar)。

**Spec 引用**:[`2026-05-09-v0.3-plugin-migration-design.md`](../specs/2026-05-09-v0.3-plugin-migration-design.md) §1.3(双 plugin 变体,bundled 仅 Claude Code)、§3.3(air-gapped 路径)、§5.4(release-gate-checklist v0.3 段)。

**前置**:Plan 1 + Plan 2 + Plan 3 + Plan 4 完成(plugin scaffold + skills 重构 + commands + helper + upgrade 命令落地)。

---

## File Structure(Plan 5 完成时改动)

```
scripts/
├── build-bundled-plugin.mjs              ← ★ NEW
└── ... (其余 v0.4 既有)

docs/
└── release-gate-checklist.md             ← 改:加 v0.3 段(§3.1-§3.5)

dist-bundled/                             ← ★ NEW(build 输出,gitignored)
├── forge-bundled-v0.3.0.tgz              ← 真产物
└── verify-extracted/                     ← (临时)解压验证目录,build 期清

release-gate-evidence/v0.3/               ← ★ NEW(release 时归档)
├── claude-fresh-install.transcript.md
├── upgrade-from-v0.2.transcript.md
├── bundled-offline-install.transcript.md
├── hook-failure-fallback.transcript.md
└── npx-version-mismatch.warn.log
```

---

## Task 5.1:`scripts/build-bundled-plugin.mjs`

**Files:**
- Create: `scripts/build-bundled-plugin.mjs`

- [ ] **Step 1**:写 build 脚本(主流程)

```js
// scripts/build-bundled-plugin.mjs
import { spawnSync } from 'node:child_process';
import { mkdir, rm, cp, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const VERSION = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8')).version;
const OUT_DIR = join(REPO_ROOT, 'dist-bundled');
const STAGING = join(OUT_DIR, 'staging');
const TARBALL = join(OUT_DIR, `forge-bundled-v${VERSION}.tgz`);

console.log(`Building bundled plugin v${VERSION}...`);

// 1. 清旧产物
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(STAGING, { recursive: true });

// 2. npm pack 拿 dist/(确保 dist/ 已 build)
spawnSync('pnpm', ['build'], { cwd: REPO_ROOT, stdio: 'inherit', shell: true });
const { stdout: packResult } = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: REPO_ROOT, encoding: 'utf8' });
// (用 dry-run 拿包内容清单;真 pack 用 cp dist/ 即可避免依赖 npm pack)

// 3. cp Claude Code plugin 部分到 staging
// (.claude-plugin / skills / commands / hooks / scripts/run-forge.mjs / dist/)
for (const dir of ['.claude-plugin', 'skills', 'commands', 'hooks', 'dist']) {
  await cp(join(REPO_ROOT, dir), join(STAGING, dir), { recursive: true });
}
await cp(join(REPO_ROOT, 'scripts', 'run-forge.mjs'), join(STAGING, 'scripts', 'run-forge.mjs'));

// 4. patch scripts/run-forge.mjs(把 spawn npx 改为 spawn node + dist/cli/index.js)
const runForge = await readFile(join(STAGING, 'scripts', 'run-forge.mjs'), 'utf8');
const patchedRunForge = runForge.replace(
  /const REQUIRED_RANGE = '.*?';[\s\S]*?child\.on\('error'.*?\);/,
  `// Bundled variant: skip npx, use plugin-internal dist/
const child = spawn(
  'node',
  [join(__dirname, '..', 'dist', 'cli', 'index.js'), ...args],
  { stdio: 'inherit' },
);

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error(\`run-forge (bundled): failed to spawn node — \${err.message}\`);
  process.exit(127);
});`,
);
// 注意:patched 版本要加 import { join } 和 __dirname 解析(若原文件没有,本 patch 一并加)
const patchedHeader = `import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
`;
await writeFile(
  join(STAGING, 'scripts', 'run-forge.mjs'),
  patchedHeader + patchedRunForge.split('const args = process.argv.slice(2);')[1],
  'utf8',
);

// 5. 修改 staging .claude-plugin/marketplace.json — 标 bundled 变体名
const marketplace = JSON.parse(await readFile(join(STAGING, '.claude-plugin', 'marketplace.json'), 'utf8'));
marketplace.plugins[0].name = 'forge-bundled';
marketplace.plugins[0].description = 'Forge bundled (offline, vendored dist/)';
await writeFile(
  join(STAGING, '.claude-plugin', 'marketplace.json'),
  JSON.stringify(marketplace, null, 2),
  'utf8',
);

// 6. tar czf
const tarResult = spawnSync('tar', ['czf', TARBALL, '-C', STAGING, '.'], { stdio: 'inherit' });
if (tarResult.status !== 0) {
  console.error('tar 失败');
  process.exit(1);
}

// 7. 验证 tarball 大小合理(应在 ~5MB,过小说明缺 dist/,过大说明 vendor 多余)
const stat = await import('node:fs/promises').then((m) => m.stat(TARBALL));
const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
console.log(`✓ Built ${TARBALL} (${sizeMB} MB)`);
if (stat.size < 1024 * 1024 || stat.size > 50 * 1024 * 1024) {
  console.error('Tarball size out of expected range (1-50 MB)');
  process.exit(1);
}

console.log('Done. Test with:');
console.log(`  /plugin install --from-tarball "${TARBALL}"`);
```

- [ ] **Step 2**:跑 build 验证

```bash
node scripts/build-bundled-plugin.mjs
# 预期:产 dist-bundled/forge-bundled-v0.3.0.tgz,~3-7 MB
```

- [ ] **Step 3**:解压验证内容

```bash
mkdir -p /tmp/bundled-verify
tar xzf dist-bundled/forge-bundled-v0.3.0.tgz -C /tmp/bundled-verify
ls /tmp/bundled-verify/   # 期望:.claude-plugin/ skills/ commands/ hooks/ dist/ scripts/
cat /tmp/bundled-verify/scripts/run-forge.mjs | head -30   # 验证 patched 版(含 dist/cli/index.js)
test ! -d /tmp/bundled-verify/.codex-plugin   # 应不存在(bundled 仅 Claude Code)
test ! -d /tmp/bundled-verify/.opencode       # 应不存在
```

- [ ] **Step 4**:Commit

```bash
git add scripts/build-bundled-plugin.mjs .gitignore   # gitignore 加 dist-bundled/
git commit -m "feat(scripts): build-bundled-plugin.mjs (Claude Code only, vendored dist/, patched run-forge for offline)"
```

---

## Task 5.2:本地装 bundled plugin 验证(离线模拟)

**Files:**
- Create: `release-gate-evidence/v0.3/bundled-offline-install.transcript.md`

- [ ] **Step 1**:断网模拟(关 WiFi 或防火墙挡 npm registry),跑 Plan 0a 验证过的 fixture 路径,装 bundled plugin

```
/plugin install --from-tarball D:/ClaudeProject/opsp/forge-repo/dist-bundled/forge-bundled-v0.3.0.tgz
```

- [ ] **Step 2**:重启 session,输入 "我想做 X" → 验证 brainstorming auto-trigger + helper 调本地 dist(无 npx + 无网)

- [ ] **Step 3**:跑 `/forge:propose <id>` 验证 Tier 1 commands 调 helper → helper 调 dist/cli/index.js → 真跑 forge validate(完全离线)

- [ ] **Step 4**:贴 transcript 到 `release-gate-evidence/v0.3/bundled-offline-install.transcript.md`

- [ ] **Step 5**:Commit evidence

```bash
git add release-gate-evidence/v0.3/bundled-offline-install.transcript.md
git commit -m "test(release-gate): bundled plugin offline install evidence"
```

---

## Task 5.3:更新 `docs/release-gate-checklist.md` 加 v0.3 段

**Files:**
- Modify: `docs/release-gate-checklist.md`

- [ ] **Step 1**:在 v0.2 checklist 后加 §3 v0.3 段

```markdown
## §3 v0.3 Plugin Migration release gate

### §3.1 Plugin install fresh path

- [ ] Tier 1 Claude Code:`/plugin marketplace add Accelerator-mzq/forge` + `/plugin install forge@accelerator-mzq-forge` + `/reload-plugins`
  - 验证:重启 session,输入 "我想做 todo list" → AI 自动 trigger `Skill(forge:brainstorming)` + 走 brainstorming 流程
  - Evidence:`release-gate-evidence/v0.3/claude-fresh-install.transcript.md`
- [ ] Tier 2 OpenCode(若启用):配 `opencode.json` plugin 数组(file:/git+file:)+ 重启 + 验证 first user message 注入 + skill auto-trigger
- [ ] Tier 3 Codex(若启用):clone + symlink ~/.agents/skills/forge + npm i -g forge@^0.3 + 重启 + 验证 skill auto-trigger + skill 内嵌 fenced bash 跑 helper

### §3.2 forge upgrade from v0.2 fixture

- [ ] 准备 v0.2 完整 fixture(用 v0.2 install 一份 + 用户已有 forge/ 产物)
- [ ] 跑 `forge upgrade`,选 y → STASH 完成 + plugin install 指引输出
- [ ] 验证 `forge/` 目录 0 损失(drafts / changes / specs / config 全在)
- [ ] 24h 内跑 `forge upgrade --recover` → 全部回原位
- [ ] 重新 `forge upgrade` y + 装 plugin → 完整工作流跑通
- [ ] Evidence:`release-gate-evidence/v0.3/upgrade-from-v0.2.transcript.md`

### §3.3 bundled plugin 断网装 + 跑通 happy path

- [ ] 断网,装 `dist-bundled/forge-bundled-v0.3.0.tgz`
- [ ] 重启 session 验证 brainstorming auto-trigger + helper 调本地 dist(无网仍 work)
- [ ] Evidence:`release-gate-evidence/v0.3/bundled-offline-install.transcript.md`(Plan 5 Task 5.2 已生成)

### §3.4 SessionStart hook fail 时 fallback

- [ ] 模拟 hook 不可执行(改 `chmod -x hooks/session-start`)
- [ ] 重启 session,验证 fallback — 即使 hook FAIL,plugin 注册的 skills 仍进 auto-trigger 池(brainstorming 仍 work)
- [ ] Evidence:`release-gate-evidence/v0.3/hook-failure-fallback.transcript.md`

### §3.5 npx 拉 forge 0.3 with 用户机已有 forge 0.2 全局

- [ ] `npm i -g @accelerator-mzq/forge@0.2.0`(模拟用户旧版)
- [ ] plugin v0.3 调 helper → npx semver 解析 ^0.3 → 拉新版 + 报警老版本 + 退出非零
- [ ] Evidence:`release-gate-evidence/v0.3/npx-version-mismatch.warn.log`
```

- [ ] **Step 2**:Commit

```bash
git add docs/release-gate-checklist.md
git commit -m "docs(release-gate): add v0.3 plugin migration §3 (5 sub-checks + evidence)"
```

---

## Task 5.4:5 个本地命令 + bundled build 集成测

- [ ] **Step 1**:5 local cmds 全 0
- [ ] **Step 2**:跑 `node scripts/build-bundled-plugin.mjs`(Plan 5 主产物)+ 验解压
- [ ] **Step 3**:Commit

---

## Self-Review

**Spec 覆盖**:
- ✅ §1.3 双 plugin 变体表(bundled 仅 Claude Code) → Task 5.1 仅 cp `.claude-plugin/`,不含 `.codex-plugin/` / `.opencode/`
- ✅ §3.3 air-gapped 路径 → Task 5.2 离线装 + happy path 验证
- ✅ §5.4 release-gate-checklist v0.3 段 § 3.1-3.5 → Task 5.3 加完整

**Placeholder scan**:`spawnSync('npm', ['pack', '--dry-run', '--json'])` 在 Task 5.1 是探索性命令(未真用 dry-run 输出);实际 build 用 cp dist/ 已够,可删 npm pack 调用。Plan 5 实施时 review/简化。

**Type consistency**:`forge` plugin name(主)vs `forge-bundled` plugin name(变体)在 marketplace.json 区分;同 spec §1.3 表格一致。

**已知风险**:
- `tar czf` 在 Windows Git Bash 可能 work(BSD tar 默认 install)但产物在 Unix 解压可能有路径分隔符问题;Task 5.1 实施时验证 cross-platform tarball
- patched run-forge.mjs 字符串替换正则可能脆弱;实施时若 source run-forge.mjs 改动,正则要同步更新

---

**Plan 5 完成,落地于** `docs/plans/2026-05-09-plan-5-bundled-plugin.md`。

**unblock**:Plan 6(release v0.3.0)。
