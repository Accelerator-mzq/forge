// v0.3 Plan 4 Task 4.3 — `forge upgrade` 命令
// 5 阶段事务:SCAN → SHOW DIFF → ASK → STASH → VERIFY → COMMIT
// 关键不变量:ASK 阶段前完全只读;forge/ 产物 100% 不动(只清理 harness adapter 产物)

import { Command } from 'commander';
import { mkdir, rm, rename, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ClaudeAdapter } from '../../core/harness-adapters/claude.js';
import { CodexAdapter } from '../../core/harness-adapters/codex.js';
import { sha256OfFile } from '../../core/harness-adapters/legacy-detector.js';
import type { LegacyArtifact } from '../../core/harness-adapters/interface.js';

interface UpgradeOptions {
  dryRun?: boolean;
  recover?: boolean;
  gc?: boolean;
  resignMarkers?: string; // plan-9j Task 2:option 形态 --resign-markers <changeId>
}

interface StashManifest {
  ts: string;
  projectRoot: string;
  artifacts: { relPath: string; sha256: string }[];
}

const STASH_PREFIX = '.forge-upgrade-stash-';
const STASH_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24h

export function buildUpgradeCommand(): Command {
  const cmd = new Command('upgrade')
    .description('Scan and clean legacy v0.2 harness adapter artifacts (forge/ 产物 100% 不动)')
    .option('--dry-run', 'SHOW DIFF only, do not stash')
    .option('--recover', 'restore stashed legacy artifacts (24h validity)')
    .option('--gc', 'delete expired stashes (>24h)')
    // plan-9j v3 BLOCKER 1 新增:option 形态 resign-markers(对齐 spec line 1763 + master line 503)
    .option(
      '--resign-markers <changeId>',
      'plan-9j Task 2:一次性升级 v0.4 change marker 到 v1.0 schema(简码映射 + resigned_by_tool_version 字段)',
    )
    .action(async (opts: UpgradeOptions) => {
      // v3 BLOCKER 1:option 形态 — opts.resignMarkers 而非 subcommand argument
      // 先处理 v0.3 现有 --recover/--gc/legacy upgrade 路径(不动);若 opts.resignMarkers 非空,走新分支
      if (opts.resignMarkers) {
        // CI 模式检测(沿 9a ack propose 同模式)
        if (process.env['CI'] === 'true') {
          process.stderr.write(
            'forge upgrade --resign-markers: CI mode 拒绝(set ack.allow_ci_mode=true to override)\n',
          );
          process.exit(2);
        }
        const forgeRoot = join(process.cwd(), 'forge');
        const { resignChangeMarkers } = await import('../../core/upgrade/resign-markers.js');
        // v7 BLOCKER 1:计算 forgeCliPath(dist/cli/index.js 真路径,沿 process.argv[1] 或 import.meta.url 推导)
        // process.argv[1] 是当前运行的入口脚本(即 dist/cli/index.js;npx forge 时同);测试可 mock
        // v9 round 2 修(plan-9j code quality reviewer I-3):空 forgeCliPath 显式抛错,避免后续 spawn ENOENT 误导
        const forgeCliPath = process.argv[1];
        if (!forgeCliPath) {
          process.stderr.write(
            'forge upgrade --resign-markers: forge CLI path unavailable (process.argv[1] is empty);请通过 node 或 npx 调用\n',
          );
          process.exit(2);
        }
        const results = await resignChangeMarkers(forgeRoot, opts.resignMarkers, forgeCliPath);

        // 输出报告
        let allResigned = true;
        let anyNeedsCPropose = false;
        for (const r of results) {
          if (r.kind === 'needs-c-propose') {
            anyNeedsCPropose = true;
            allResigned = false;
            // C 简码需用户介入:输出到 stderr(测试断言 stderr 含 "C 简码")
            process.stderr.write(r.message + '\n');
            process.stderr.write(
              '请运行 `forge ack confirm <changeId> <findingId>` 处理 C 简码 pending ack 后重跑 resign-markers\n',
            );
          } else {
            console.log(r.message);
          }
          if (r.kind === 'failed') allResigned = false;
        }

        if (anyNeedsCPropose) process.exit(1);
        if (!allResigned) process.exit(1);
        if (results.every((r) => r.kind === 'skipped-already-v1')) {
          console.log(`✓ ${opts.resignMarkers}: 全部 marker 已是 v1.0+,无需 resign`);
        } else {
          console.log(
            `✓ ${opts.resignMarkers}: marker 已升级,resigned_by_tool_version=1.0.0 + legacy meta`,
          );
        }
        process.exit(0);
      }

      // v3:option 形态分支结束;后续走 v0.3 legacy adapter 清理路径
      const projectRoot = process.cwd();
      if (opts.recover) {
        await runRecover(projectRoot);
        return;
      }
      if (opts.gc) {
        await runGc(projectRoot);
        return;
      }
      await runUpgrade(projectRoot, opts);
    });

  return cmd;
}

async function runUpgrade(projectRoot: string, opts: UpgradeOptions): Promise<void> {
  // 阶段 1:SCAN(纯只读)
  const adapters = [new ClaudeAdapter(), new CodexAdapter()];
  const allArtifacts: LegacyArtifact[] = [];
  for (const adapter of adapters) {
    const a = await adapter.detectLegacyArtifacts(projectRoot);
    allArtifacts.push(...a);
  }

  // 阶段 2:SHOW DIFF(只读)
  console.log(`Scanning legacy artifacts in ${projectRoot}...`);

  if (allArtifacts.length === 0) {
    console.log('No legacy artifacts found. Project is clean.');
    return;
  }

  console.log(`Found ${allArtifacts.length} legacy paths:`);
  for (const a of allArtifacts) {
    console.log(`  ${a.relPath} (sha256: ${a.sha256.slice(0, 8)}...)`);
  }
  console.log('');
  console.log('Note: forge/ artifacts (drafts/changes/specs/config) WILL NOT be touched.');

  if (opts.dryRun) {
    console.log('Dry run only. Re-run without --dry-run to proceed.');
    return;
  }

  // 阶段 3:ASK(等用户输入)
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question('Delete these legacy artifacts? [y/N]: ')).trim().toLowerCase();
  rl.close();

  if (answer !== 'y') {
    console.log('Cancelled. No files touched.');
    return;
  }

  // 阶段 4:STASH
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const stashDir = join(projectRoot, `${STASH_PREFIX}${ts}`);
  await mkdir(stashDir, { recursive: true });

  const moved: { relPath: string; sha256: string }[] = [];
  for (const a of allArtifacts) {
    const srcAbs = join(projectRoot, a.relPath);
    const dstAbs = join(stashDir, a.relPath);
    await mkdir(dirname(dstAbs), { recursive: true });
    try {
      await rename(srcAbs, dstAbs);
      moved.push({ relPath: a.relPath, sha256: a.sha256 });
    } catch (err) {
      // 反向 mv 已 stash 的回原位
      console.error(`STASH failed at ${a.relPath}: ${(err as Error).message}\nReverting...`);
      for (const m of moved) {
        try {
          await rename(join(stashDir, m.relPath), join(projectRoot, m.relPath));
        } catch {
          /* best effort */
        }
      }
      await rm(stashDir, { recursive: true, force: true });
      process.exit(1);
    }
  }

  // 写 manifest
  const manifest: StashManifest = { ts, projectRoot, artifacts: moved };
  await writeFile(join(stashDir, '.manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // 阶段 5:VERIFY(读 stash 验 hash 与 SCAN 一致)
  for (const m of moved) {
    const stashedAbs = join(stashDir, m.relPath);
    const stashedSha = await sha256OfFile(stashedAbs);
    if (stashedSha !== m.sha256) {
      console.error(`VERIFY failed at ${m.relPath}: hash mismatch\nReverting...`);
      for (const x of moved) {
        try {
          await rename(join(stashDir, x.relPath), join(projectRoot, x.relPath));
        } catch {
          /* best effort */
        }
      }
      await rm(stashDir, { recursive: true, force: true });
      process.exit(1);
    }
  }

  // 阶段 6:COMMIT(默认不删 stash 24h)
  console.log('');
  console.log(`✓ Stashed ${moved.length} legacy artifacts to ${stashDir}`);
  console.log('  --recover: restore (24h validity)');
  console.log('  --gc: delete expired stashes (>24h)');
  console.log('');
  console.log('Next: install forge plugin (Tier 1 Claude Code):');
  console.log('  /plugin marketplace add Accelerator-mzq/forge');
  console.log('  /plugin install forge@accelerator-mzq-forge');
  console.log('  /reload-plugins');
  console.log('');
  console.log('OpenCode/Codex install: see docs/opencode-install.md / codex-install.md');
}

async function runRecover(projectRoot: string): Promise<void> {
  const stashDirs = await findStashes(projectRoot);
  if (stashDirs.length === 0) {
    console.log('No stash to recover.');
    return;
  }

  // 取最新(按 ts 排序,最大 = 最新)
  stashDirs.sort();
  const latestStash = stashDirs[stashDirs.length - 1]!;
  const stashAbs = join(projectRoot, latestStash);

  // 读 manifest
  const manifestPath = join(stashAbs, '.manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`Stash 缺 manifest.json: ${latestStash}`);
    process.exit(1);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as StashManifest;

  // 验 24h 有效期
  const tsParsed = parseStashTs(manifest.ts);
  if (tsParsed === null) {
    console.error(`Stash ts 不可解析: ${manifest.ts}`);
    process.exit(1);
  }
  const ageMs = Date.now() - tsParsed.getTime();
  if (ageMs > STASH_VALIDITY_MS) {
    console.error(`Stash 已过期(${(ageMs / (60 * 60 * 1000)).toFixed(1)}h > 24h),建议跑 --gc 清理`);
    process.exit(1);
  }

  // rename 回原位 + 验 hash
  for (const a of manifest.artifacts) {
    const stashedAbs = join(stashAbs, a.relPath);
    const stashedSha = await sha256OfFile(stashedAbs);
    if (stashedSha !== a.sha256) {
      console.error(`Stash 文件被外部修改 (${a.relPath}),hash mismatch,拒绝 recover`);
      process.exit(1);
    }
    const dstAbs = join(projectRoot, a.relPath);
    await mkdir(dirname(dstAbs), { recursive: true });
    await rename(stashedAbs, dstAbs);
  }

  // 删 stash 目录
  await rm(stashAbs, { recursive: true, force: true });

  console.log(`✓ Recovered ${manifest.artifacts.length} artifacts from ${latestStash}`);
  console.log('Stash 已删除。');
}

async function runGc(projectRoot: string): Promise<void> {
  const stashDirs = await findStashes(projectRoot);
  if (stashDirs.length === 0) {
    console.log('No stash to gc.');
    return;
  }

  let deleted = 0;
  for (const stashName of stashDirs) {
    const manifestPath = join(projectRoot, stashName, '.manifest.json');
    if (!existsSync(manifestPath)) continue;
    let manifest: StashManifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as StashManifest;
    } catch {
      continue;
    }
    const tsParsed = parseStashTs(manifest.ts);
    if (tsParsed === null) continue;
    const ageMs = Date.now() - tsParsed.getTime();
    if (ageMs > STASH_VALIDITY_MS) {
      await rm(join(projectRoot, stashName), { recursive: true, force: true });
      deleted++;
      console.log(`✓ gc: ${stashName}`);
    }
  }
  console.log(`Deleted ${deleted} expired stashes.`);
}

/** 找 projectRoot 下所有 .forge-upgrade-stash-* 目录(按名称返回) */
async function findStashes(projectRoot: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(projectRoot);
  } catch {
    return [];
  }
  return entries.filter((n) => n.startsWith(STASH_PREFIX));
}

/** 把 ts 字符串(`2026-05-09T12-34-56-789Z`)解析为 Date */
function parseStashTs(ts: string): Date | null {
  // 反 ISO:`2026-05-09T12-34-56-789Z` → `2026-05-09T12:34:56.789Z`
  const match = ts.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!match) return null;
  const [, date, h, m, s, ms] = match;
  const iso = `${date}T${h}:${m}:${s}.${ms}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
