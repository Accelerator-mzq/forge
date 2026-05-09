# Plan 4 — `forge upgrade` 命令 + adapter LegacyDetector 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:加 `forge upgrade` CLI 子命令,扫 v0.2 用户项目内的 legacy harness adapter 产物(`.claude/skills/forge-*/` + `.claude/commands/forge/` + `.agents/skills/forge-*/` + `.agents/commands/forge/` + OpenCode 路径),5 阶段事务化清理(SCAN → SHOW DIFF → ASK → STASH → VERIFY → COMMIT),24h 内 `--recover` 可还原,**`forge/` 产物目录 100% 不动**(用户 drafts/changes/specs 不丢)。

**Architecture**:`cli/commands/upgrade.ts` 自有 5 阶段事务实现(**不复用** `transaction.ts` — deploy 三阶段是"安装新 + 备份旧",upgrade 是"删除旧 + 给恢复期",方向相反);三 harness adapter 各自实现 `LegacyDetector` 接口(`detectLegacyArtifacts(projectRoot)` + `cleanupLegacy(...)`);Stash 用 `<project>/.forge-upgrade-stash-<ts>/` + `.manifest.json`(sha256)。

**Tech Stack**:Node 20+ + commander 12;无新依赖(crypto 用 Node 原生 createHash)。

**Spec 引用**:[`2026-05-09-v0.3-plugin-migration-design.md`](../specs/2026-05-09-v0.3-plugin-migration-design.md) §3.2(数据流 5 阶段)、§4.1(事务化表)、§4.7 不变量、§1.4(v0.2 兼容窗口)。

**前置**:Plan 1 完成(harness adapter v0.2 既有 + Plan 1 重构后)。

---

## File Structure(Plan 4 完成时改动)

```
src/
├── cli/
│   ├── index.ts                          ← 改:注册 upgrade 子命令
│   └── commands/
│       ├── init.ts                       ← 改:加 deprecation warning(Task 4.5)
│       └── upgrade.ts                    ← ★ NEW
└── core/harness-adapters/
    ├── interface.ts                      ← 改:加 LegacyDetector 接口
    ├── claude.ts                         ← 改:实现 detectLegacyArtifacts / cleanupLegacy
    ├── codex.ts                          ← 改:同上(扫 .agents/skills/ + .agents/commands/)
    └── opencode.ts                       ← 改:同上
tests/
├── cli/commands/upgrade.test.ts          ← ★ NEW(4 case + recover + gc)
└── core/harness-adapters/legacy-detector.test.ts ← ★ NEW
```

---

## Task 4.1:`LegacyDetector` 接口

**Files:**
- Modify: `src/core/harness-adapters/interface.ts`

- [ ] **Step 1**:加 interface

```ts
// src/core/harness-adapters/interface.ts(片段)
export interface LegacyArtifact {
  /** 完整相对路径,如 .claude/skills/forge-brainstorming/SKILL.md */
  relPath: string;
  /** sha256 of file content(目录的话是 manifest hash) */
  sha256: string;
  /** 文件类型(便于 cleanup 时区分) */
  type: 'skill' | 'command' | 'config-fragment';
}

export interface LegacyDetector {
  /**
   * 扫 projectRoot 内 v0.2 adapter 写过的 legacy 路径
   * 返回所有可清理产物清单 + sha256(用于 ASK 阶段 SHOW DIFF + STASH 阶段 VERIFY)
   */
  detectLegacyArtifacts(projectRoot: string): Promise<LegacyArtifact[]>;
}
```

- [ ] **Step 2**:Commit

```bash
git add src/core/harness-adapters/interface.ts
git commit -m "feat(adapter): LegacyDetector interface (scan v0.2 legacy artifacts)"
```

---

## Task 4.2:三 adapter 实现 `LegacyDetector`

**Files:**
- Modify: `src/core/harness-adapters/{claude,codex,opencode}.ts`

### 4.2.1 ClaudeAdapter

- [ ] **Step 1**:加 `detectLegacyArtifacts` 方法

```ts
// src/core/harness-adapters/claude.ts(片段)
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

async function sha256OfFile(absPath: string): Promise<string> {
  const content = await readFile(absPath);
  return createHash('sha256').update(content).digest('hex');
}

export class ClaudeAdapter implements HarnessAdapter, LegacyDetector {
  // ... v0.2 既有 detect / plan 方法保留 ...

  async detectLegacyArtifacts(projectRoot: string): Promise<LegacyArtifact[]> {
    const artifacts: LegacyArtifact[] = [];

    // 扫 .claude/skills/forge-*/SKILL.md
    const skillsDir = join(projectRoot, '.claude', 'skills');
    try {
      const entries = await readdir(skillsDir);
      for (const name of entries) {
        if (!name.startsWith('forge-')) continue;
        const skillFile = join(skillsDir, name, 'SKILL.md');
        try {
          await stat(skillFile);
          artifacts.push({
            relPath: `.claude/skills/${name}/SKILL.md`,
            sha256: await sha256OfFile(skillFile),
            type: 'skill',
          });
        } catch { /* 单文件缺失,跳 */ }
      }
    } catch { /* skills/ 不存在 */ }

    // 扫 .claude/commands/forge/<name>.md
    const cmdsDir = join(projectRoot, '.claude', 'commands', 'forge');
    try {
      const entries = await readdir(cmdsDir);
      for (const name of entries) {
        if (!name.endsWith('.md')) continue;
        const cmdFile = join(cmdsDir, name);
        artifacts.push({
          relPath: `.claude/commands/forge/${name}`,
          sha256: await sha256OfFile(cmdFile),
          type: 'command',
        });
      }
    } catch { /* commands/forge/ 不存在 */ }

    return artifacts;
  }
}
```

- [ ] **Step 2**:CodexAdapter — 扫 `.agents/skills/forge-*/` + `.agents/commands/forge/`(注意:**不是** `.codex/`,实测 v0.2 codex.ts 写到 .agents/)

```ts
// src/core/harness-adapters/codex.ts(片段)
async detectLegacyArtifacts(projectRoot: string): Promise<LegacyArtifact[]> {
  const artifacts: LegacyArtifact[] = [];

  // 扫 .agents/skills/forge-*/SKILL.md
  // (v0.2 codex.ts line 26 写到这,不是 .codex/)
  const skillsDir = join(projectRoot, '.agents', 'skills');
  // ... 同 ClaudeAdapter 模式,改路径 ...

  // 扫 .agents/commands/forge/<name>.md
  const cmdsDir = join(projectRoot, '.agents', 'commands', 'forge');
  // ... 同模式 ...

  return artifacts;
}
```

- [ ] **Step 3**:OpenCodeAdapter — 扫 v0.2 OpenCode adapter 写过的路径(具体路径看 v0.2 opencode.ts 实现)

- [ ] **Step 4**:写单测 `tests/core/harness-adapters/legacy-detector.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeAdapter } from '../../../src/core/harness-adapters/claude.js';

describe('ClaudeAdapter LegacyDetector', () => {
  it('detects 13 forge skill dirs + 6 commands', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-legacy-'));
    // 模拟 v0.2 fixture
    await mkdir(join(tmp, '.claude', 'skills', 'forge-brainstorming'), { recursive: true });
    await writeFile(join(tmp, '.claude', 'skills', 'forge-brainstorming', 'SKILL.md'), 'content');
    // ... 创建剩余 12 skill + 6 commands fixture ...

    const adapter = new ClaudeAdapter();
    const artifacts = await adapter.detectLegacyArtifacts(tmp);

    expect(artifacts).toHaveLength(13 + 6);  // 13 skill + 6 command
    expect(artifacts.every((a) => a.sha256.length === 64)).toBe(true);
  });

  it('returns empty when no legacy paths', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-empty-'));
    const adapter = new ClaudeAdapter();
    const artifacts = await adapter.detectLegacyArtifacts(tmp);
    expect(artifacts).toHaveLength(0);
  });
});
```

- [ ] **Step 5**:Commit

```bash
git add src/core/harness-adapters/ tests/core/harness-adapters/legacy-detector.test.ts
git commit -m "feat(adapter): three adapters impl LegacyDetector (claude .claude/, codex .agents/, opencode)"
```

---

## Task 4.3:`forge upgrade` CLI 命令(5 阶段事务)

**Files:**
- Create: `src/cli/commands/upgrade.ts`
- Modify: `src/cli/index.ts`(注册 upgrade)
- Test: `tests/cli/commands/upgrade.test.ts`

- [ ] **Step 1**:写 upgrade.ts(5 阶段:SCAN → SHOW DIFF → ASK → STASH → VERIFY → COMMIT)

```ts
// src/cli/commands/upgrade.ts
import { Command } from 'commander';
import { mkdir, rm, rename, writeFile, readFile, copyFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ClaudeAdapter } from '../../core/harness-adapters/claude.js';
import { CodexAdapter } from '../../core/harness-adapters/codex.js';
import { OpenCodeAdapter } from '../../core/harness-adapters/opencode.js';
import type { LegacyArtifact } from '../../core/harness-adapters/interface.js';

export function buildUpgradeCommand() {
  const cmd = new Command('upgrade')
    .description('Scan and clean legacy v0.2 harness adapter artifacts (forge/ unchanged)')
    .option('--dry-run', 'SHOW DIFF only, do not stash')
    .option('--recover', 'restore stashed legacy artifacts (24h validity)')
    .option('--gc', 'delete expired stashes (>24h)')
    .option('--show-diff', 'expand per-file diff during ASK phase')
    .action(async (opts) => {
      const projectRoot = process.cwd();

      if (opts.recover) return runRecover(projectRoot);
      if (opts.gc) return runGc(projectRoot);
      return runUpgrade(projectRoot, opts);
    });
  return cmd;
}

async function runUpgrade(projectRoot: string, opts: { dryRun?: boolean; showDiff?: boolean }) {
  // === 阶段 1:SCAN(纯只读)===
  const adapters = [new ClaudeAdapter(), new CodexAdapter(), new OpenCodeAdapter()];
  const allArtifacts: LegacyArtifact[] = [];
  for (const adapter of adapters) {
    if ('detectLegacyArtifacts' in adapter) {
      const a = await adapter.detectLegacyArtifacts(projectRoot);
      allArtifacts.push(...a);
    }
  }

  // === 阶段 2:SHOW DIFF(只读)===
  console.log(`Scanning legacy artifacts in ${projectRoot}...`);
  console.log(`Found ${allArtifacts.length} legacy paths:`);
  for (const a of allArtifacts) {
    console.log(`  ${a.relPath} (sha256: ${a.sha256.slice(0, 8)})`);
  }
  console.log('');
  console.log('Note: forge/ artifacts (drafts/changes/specs/config) WILL NOT be touched.');

  if (allArtifacts.length === 0) {
    console.log('No legacy artifacts. Project is clean (or never had v0.2 adapter installed).');
    return;
  }

  if (opts.dryRun) {
    console.log('Dry run only,no files moved. Re-run without --dry-run to proceed.');
    return;
  }

  // === 阶段 3:ASK(等用户输入)===
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`Delete these legacy artifacts? [y/N/show-diff]: `);
  rl.close();

  if (answer.trim().toLowerCase() === 'show-diff') {
    // 展开 per-file diff(用 git diff or 自实现)... 略
    console.log('show-diff TBD;currently behaving as N');
    return;
  }
  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Cancelled. No files touched.');
    return;
  }

  // === 阶段 4:STASH ===
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const stashDir = join(projectRoot, `.forge-upgrade-stash-${ts}`);
  await mkdir(stashDir, { recursive: true });

  const moved: { rel: string; sha256: string }[] = [];
  for (const a of allArtifacts) {
    const srcAbs = join(projectRoot, a.relPath);
    const dstAbs = join(stashDir, a.relPath);
    await mkdir(dirname(dstAbs), { recursive: true });
    try {
      await rename(srcAbs, dstAbs);
      moved.push({ rel: a.relPath, sha256: a.sha256 });
    } catch (err) {
      // 反向 mv 已 stash 的回原位
      console.error(`STASH failed at ${a.relPath}: ${(err as Error).message}`);
      console.error('Reverting...');
      for (const m of moved) {
        try {
          await rename(join(stashDir, m.rel), join(projectRoot, m.rel));
        } catch { /* best effort */ }
      }
      await rm(stashDir, { recursive: true, force: true });
      process.exit(1);
    }
  }

  // 写 .manifest.json
  await writeFile(
    join(stashDir, '.manifest.json'),
    JSON.stringify({ ts, projectRoot, artifacts: moved }, null, 2),
    'utf8',
  );

  // === 阶段 5:VERIFY(读 stash 验 hash 与 SCAN 阶段一致)===
  for (const m of moved) {
    const stashedAbs = join(stashDir, m.rel);
    const stashedSha = await sha256OfFile(stashedAbs);
    if (stashedSha !== m.sha256) {
      console.error(`VERIFY failed at ${m.rel}: hash mismatch`);
      // 反向 mv 全部回原位
      for (const x of moved) {
        try {
          await rename(join(stashDir, x.rel), join(projectRoot, x.rel));
        } catch { /* best effort */ }
      }
      await rm(stashDir, { recursive: true, force: true });
      process.exit(1);
    }
  }

  // === 阶段 6:COMMIT(默认不删 stash 24h)===
  console.log(`✓ Stashed ${moved.length} legacy artifacts to ${stashDir}`);
  console.log(`  --recover: restore (24h validity)`);
  console.log(`  --gc: delete expired stashes (> 24h)`);
  console.log('');
  console.log('Next:install forge plugin (Tier 1 Claude Code)');
  console.log('  /plugin marketplace add Accelerator-mzq/forge');
  console.log('  /plugin install forge@accelerator-mzq-forge');
  console.log('');
  console.log('See README "v0.2 → v0.3 migration guide" for OpenCode/Codex install.');
}

async function runRecover(projectRoot: string) {
  // 找最新 stash dir,读 .manifest.json,逐 entry rename 回原位 + 删 stash
  // 实施细节略
}

async function runGc(projectRoot: string) {
  // 找所有 .forge-upgrade-stash-* dir,>24h 的删
}

async function sha256OfFile(absPath: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(await readFile(absPath)).digest('hex');
}
```

- [ ] **Step 2**:Modify `src/cli/index.ts` 注册 upgrade

```ts
import { buildUpgradeCommand } from './commands/upgrade.js';
program.addCommand(buildUpgradeCommand());
```

- [ ] **Step 3**:写 upgrade 单测 + 集成测

```ts
// tests/cli/commands/upgrade.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// ... 4 case:
// (1) 干净项目无 legacy → no-op
// (2) v0.2 完整 legacy → 全清单 + 用户选 N → 无副作用
// (3) v0.2 完整 legacy → 用户选 y → STASH 创建 + manifest 正确 + 原文件 mv 走
// (4) STASH 中途模拟 rename 失败 → 反向回滚 + 退出非零
```

- [ ] **Step 4**:跑测试 PASS,Commit

```bash
git add src/cli/commands/upgrade.ts src/cli/index.ts tests/cli/commands/upgrade.test.ts
git commit -m "feat(cli): forge upgrade command (5-stage transactional cleanup, ASK before STASH, --recover/--gc)"
```

---

## Task 4.4:`--recover` 与 `--gc` 实现

**Files:**
- Modify: `src/cli/commands/upgrade.ts`(填 runRecover + runGc)
- Test: 集成测加 `--recover` 24h 内 / >24h 不同行为

- [ ] **Step 1**:`runRecover`:找最新 stash dir → 读 .manifest.json → 逐 entry rename 回 → 验 hash → 删 stash

- [ ] **Step 2**:`runGc`:遍历 `.forge-upgrade-stash-*` dir,看 ts 字段 >24h(基于 .manifest.json 的 ts 字段对比当前时间)→ 删

- [ ] **Step 3**:加测试 case

```ts
it('recover within 24h restores all artifacts', async () => {
  // setup:跑 upgrade 后,立即 recover
  // 期望:所有原路径文件回来 + sha256 与原始一致 + stash 删
});

it('gc deletes stashes older than 24h', async () => {
  // setup:手工建 stash dir,manifest.json ts 设为 25h 前
  // 跑 forge upgrade --gc
  // 期望:stash 删,无 active stash 不动
});
```

- [ ] **Step 4**:Commit

```bash
git add src/cli/commands/upgrade.ts tests/cli/commands/upgrade.test.ts
git commit -m "feat(cli): forge upgrade --recover and --gc (24h recovery window + cleanup)"
```

---

## Task 4.5:`forge init` 加 deprecation warning

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1**:在 `forge init` 主流程开头加 warning(stderr)

```ts
console.error(`
⚠️  WARNING: 'forge init' is deprecated in v0.3.

The plugin-based path is the new way:
  /plugin marketplace add Accelerator-mzq/forge
  /plugin install forge@accelerator-mzq-forge

Existing v0.2 projects:run 'forge upgrade' to clean legacy adapter artifacts.

'forge init' will be removed in v0.4. Continuing for legacy support...
`);
```

- [ ] **Step 2**:跑测试不破 v0.2 init 行为(stderr 改了不影响 stdout 主流程)

- [ ] **Step 3**:Commit

```bash
git add src/cli/commands/init.ts
git commit -m "chore(cli): forge init deprecation warning (v0.4 removal)"
```

---

## Task 4.6:5 个本地命令 + 集成测全跑

- [ ] **Step 1**:5 local cmds 全 0
- [ ] **Step 2**:跑 fixture 测试 — 用 v0.2 完整 legacy fixture 走 upgrade → recover → 复跑 upgrade
- [ ] **Step 3**:Commit eval / fixture results

---

## Self-Review

**Spec 覆盖**:
- ✅ §3.2 数据流 5 阶段 → Task 4.3 实现完整
- ✅ §4.1 事务化表(各阶段失败处理) → Task 4.3 反向回滚 + VERIFY
- ✅ §4.7 不变量 1+2(SCAN/ASK 前只读 / STASH/VERIFY 反向回滚) → 测试 case 4 验证
- ✅ §1.4 v0.2 兼容窗口 → Task 4.5 deprecation warning

**Placeholder scan**:
- show-diff 实现暂"TBD"(line 75 of upgrade.ts) — 这是真 placeholder,但**不阻塞 release**(用户可手动 git diff 查 stash);Plan 6 release 前补,或推 v0.3.1
- runRecover / runGc 函数体在 Task 4.4 填(Task 4.3 留 stub 是合理的依赖切分)

**Type consistency**:`LegacyArtifact` 在 interface / claude / codex / opencode / upgrade 五处使用,字段名一致;`projectRoot` / `stashDir` / `ts` 命名跨文件一致。

**已知风险**:
- Windows rename 跨 drive 跨 mount point 可能 fail(Node fs.rename 限制);Task 4.3 实施时若发现,改用 cp + unlink fallback
- Codex 的 `.agents/` 路径在 v0.2 codex.ts 实测确认是 .agents/(不是 .codex/),但 OpenCodeAdapter 的 v0.2 实现路径需查源码确认

---

**Plan 4 完成,落地于** `docs/plans/2026-05-09-plan-4-forge-upgrade.md`。

**unblock**:Plan 5(release-gate-checklist 用 upgrade 命令验)、Plan 6(release v0.3 前 upgrade-from-v0.2 fixture acceptance)。
