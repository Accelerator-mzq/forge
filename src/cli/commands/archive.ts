// forge archive 子命令 — v4 OpenSpec alignment 简版(plan-v4 Phase 1 Task 1.5)
//
// v4 BREAKING(沿 plan-v4 §6.1 v9 + §10.1.2):
// - 删反加固协议:transaction / lock / recover / resume-summary / 13 fence / process_evidence /
//   ack-log / verify-findings / pause-decisions-fence / three-level-fence / legacy-exemption /
//   version-retrograde / hash-mismatch fence / git integrity fence
// - 删 CLI flag:--recover / --resume-summary / --resume
// - 新增 CLI flag:--yes(沿 OpenSpec)/ --skip-specs(沿 OpenSpec)
// - 保留:--force(human-override / 非 git)/ --api(legacy-bridge sync-check 直连)
// - marker 校验 schema v1 → v2(VerifyMarker / ReviewMarker v2,无 hash/git/process_evidence)
// - spec deltas:沿用 forge 现有 readDeltas + applyDeltas(Path B — 不移植 OpenSpec specs-apply)
// - archive_summary v1 → v2(无 acked_warnings / pending_suggestions / process_evidence_summary)
// - 保留 legacy-bridge preflight/posthook 接口(本文件内 export,sync-check 双路径不变)

import { Command } from 'commander';
import { readFile, writeFile, readdir, mkdir, rename, cp, rm, stat } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { parseMarker } from '../../core/markers/index.js';
import { validateMarkerSchema } from '../../core/validate/index.js';
import { validateChange } from '../../core/validate/change.js';
import { readDeltas, applyDeltas } from '../../core/specs-sync/index.js';
import type { SpecDelta } from '../../core/specs-sync/index.js';
import { buildArchiveSummary } from '../../core/archive/summary-builder.js';
import { renderArchiveSummaryOutput } from '../../core/archive/summary-render.js';
import { generateBacklog } from '../../core/backlog/index.js';
import { appendTraceEvent } from '../../core/monitor/trace-store.js';
import { FORGE_VERSION } from '../../index.js';
// —— legacy-bridge sync-check 双路径依赖(仅 runArchivePreflight/PostHook + emit 用)——
import { loadAnchorsFile } from '../../core/legacy-bridge/anchors.js';
import { checkAck } from '../../core/legacy-bridge/ack.js';
import { buildSyncCheckTask, applySyncCheckResult } from '../../core/legacy-bridge/sync-check.js';
import type { SyncCheckInput } from '../../core/legacy-bridge/sync-check.js';
import {
  AgentHandoffRunner,
  ApiRunner,
  makeForgeApiClient,
} from '../../core/legacy-bridge/runners.js';
import type { RunnerClient } from '../../core/legacy-bridge/runners.js';
import { renderDiffMarkdown, renderDiffYaml } from '../../core/legacy-bridge/diff-report.js';
import { readAnchorFile } from '../../core/legacy-bridge/encoding.js';
import type { ForgeConfig } from '../../core/schema/types.js';
import type { LegacyAnchorsFile, SyncStateFile } from '../../core/legacy-bridge/types.js';

// ============================================================================
// 本地 helper(沿 plan §10.1.2 Task 1.5 v6 修订)
// ============================================================================

/**
 * getArchiveDate:返回 YYYY-MM-DD(沿 plan §6.1 v4 F-R3-2 — archive 主流程算一次)
 *
 * 关键:archive.ts 内只能调一次,后续 archiveName + posthook 共用同一变量,
 * 防跨午夜 archive 时 archiveName 用 day N、posthook 拿 day N+1 不一致。
 */
function getArchiveDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * moveDirectory:rename 跨盘失败时降级到 cp + rm(沿 OpenSpec EPERM/EXDEV fallback)
 *
 * Windows 上 rename 同盘正常,跨盘抛 EXDEV;某些权限场景抛 EPERM。
 * 失败时用 fs.cp 递归复制 + rm 删源,语义等同 mv。
 */
async function moveDirectory(src: string, dst: string): Promise<void> {
  try {
    await rename(src, dst);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EXDEV' || code === 'EPERM' || code === 'EACCES') {
      // 跨盘 / 权限错 → cp + rm 模拟 mv
      await cp(src, dst, { recursive: true });
      await rm(src, { recursive: true, force: true });
      return;
    }
    throw err;
  }
}

/**
 * renderDeltasSummary:把 SpecDelta[] 渲染成用户可读字符串(供 confirm 前显示)
 *
 * 沿 plan §6.1 v6 修订(Codex v5 F-R5-2):archive.ts 内本地 helper(~10 行),
 * 不在 specs-sync/ 新增 — Path B "无新增代码" 仅指 specs-sync/ 不变。
 */
function renderDeltasSummary(deltas: SpecDelta[]): string {
  const lines: string[] = ['Spec deltas to apply:'];
  for (const d of deltas) {
    lines.push(`  - ${d.name}: ${d.operation}`);
  }
  return lines.join('\n');
}

/**
 * selectChange:在 forge/changes/ 下交互式让 user 选 changeId(若没传 argv)
 *
 * 沿 OpenSpec archive.ts 风格:列出 active change(忽略 archive/ 子目录),按 mtime 倒序,
 * 提示用户输入序号。空目录返 undefined。
 */
async function selectChange(changesDir: string): Promise<string | undefined> {
  const entries = await readdir(changesDir).catch(() => []);
  const candidates: { name: string; mtime: number }[] = [];
  for (const name of entries) {
    if (name === 'archive') continue;
    const stats = await stat(join(changesDir, name)).catch(() => null);
    if (!stats || !stats.isDirectory()) continue;
    candidates.push({ name, mtime: stats.mtimeMs });
  }
  if (candidates.length === 0) return undefined;
  // 按 mtime 倒序(最近修改的优先)
  candidates.sort((a, b) => b.mtime - a.mtime);

  console.log('Active changes:');
  for (let i = 0; i < candidates.length; i++) {
    console.log(`  ${i + 1}. ${candidates[i]!.name}`);
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const ans = (await rl.question(`Select change number (1-${candidates.length}): `)).trim();
    const idx = Number(ans) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
      console.error(`✗ Invalid selection: ${ans}`);
      return undefined;
    }
    return candidates[idx]!.name;
  } finally {
    rl.close();
  }
}

/**
 * confirmPrompt:Y/n 交互(--yes 时跳过 — 由 caller 判断)
 *
 * 默认 'Y'(回车 = yes),输入 n/N 返 false,其他返 true。
 * 沿 forge 现有 readline/promises 惯例(upgrade.ts:144 / migrate/index.ts 同模式)。
 */
async function confirmPrompt(message: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const ans = (await rl.question(`${message} [Y/n] `)).trim().toLowerCase();
    return ans === '' || ans === 'y' || ans === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * countIncompleteTasks:数 tasks.md 内未打勾的 task(- [ ] 行计数)
 *
 * 沿 OpenSpec archive.ts — 未完成 task 时 prompt confirm(--yes 跳过)
 */
async function countIncompleteTasks(changeDir: string): Promise<number> {
  const tasksPath = join(changeDir, 'tasks.md');
  if (!existsSync(tasksPath)) return 0;
  const text = await readFile(tasksPath, 'utf8');
  // 匹配 "- [ ] " 行(空格代表未打勾)
  const matches = text.match(/^\s*- \[ \]\s+/gm);
  return matches ? matches.length : 0;
}

// ============================================================================
// buildArchiveCommand — commander 工厂(沿 plan §6.1 v7 F-R6-1)
// ============================================================================

/**
 * Forge archive 命令工厂 — v4 简版(沿 plan §6.1 v9 伪代码)
 *
 * 9 步主流程:
 *   1. forgeRoot + changeId selection
 *   2. legacy-bridge preflight(可 graceful skip)
 *   3. spec validate(blocking,永远跑)
 *   4. marker check + v2 schema validate
 *   5. task progress confirm(--yes 跳过)
 *   6. spec deltas(--skip-specs 跳;否则 readDeltas + confirm + applyDeltas)
 *   7. mv change → archive/<archiveDate>-<changeId>(算一次 archiveDate)
 *   8. buildArchiveSummary + 写 archive_summary.yaml
 *   9. legacy-bridge posthook + generateBacklog + appendTraceEvent
 */
export function buildArchiveCommand(): Command {
  return new Command('archive')
    .argument('[changeId]', 'change directory id (e.g., add-login)')
    .description('Archive a verified+reviewed change')
    .option('--force', 'accept human-override markers')
    .option('--yes', 'auto-accept all interactive confirms (CI mode)')
    .option('--skip-specs', 'skip applying spec deltas to forge/specs/')
    .option('--api', '直连 Anthropic API 跑 sync-check(不 emit manifest、不暂停)')
    .action(
      async (
        changeId: string | undefined,
        opts: {
          force?: boolean;
          yes?: boolean;
          skipSpecs?: boolean;
          api?: boolean;
        },
      ) => {
        const targetPath = process.cwd();
        const forgeRoot = join(targetPath, 'forge');
        const changesDir = join(forgeRoot, 'changes');
        const archiveDir = join(changesDir, 'archive');
        const mainSpecsDir = join(forgeRoot, 'specs');

        // —— 1. forge/changes/ 存在性 + changeId 选择 ——
        if (!existsSync(changesDir)) {
          console.error("✗ No forge/changes/ directory. Run 'forge init' first.");
          process.exit(1);
        }
        if (!changeId) {
          changeId = await selectChange(changesDir);
          if (!changeId) {
            console.error('✗ No active change selected.');
            process.exit(1);
          }
        }
        const changeDir = join(changesDir, changeId);
        if (!existsSync(changeDir) || !statSync(changeDir).isDirectory()) {
          console.error(`✗ Change '${changeId}' not found in forge/changes/`);
          process.exit(1);
        }

        // —— 2. legacy-bridge preflight(brownfield 同步检查;graceful skip 路径多)——
        const preflightResult = await runArchivePreflight(forgeRoot, changeId, {
          api: opts.api ?? false,
        });
        if (preflightResult.kind !== 'ok') {
          console.error(preflightResult.message);
          process.exit(2);
        }

        // —— 3. Spec validate(永远跑,blocking — sanity check 非 fence)——
        // v9 修订(Codex v8 F-R8-1):删 --no-validate flag,archive 永远 validate
        const validateResult = await validateChange(changeDir);
        if (!validateResult.valid) {
          console.error('✗ Spec validate failed:');
          for (const e of validateResult.errors) {
            console.error(`  - ${e.artifact}${e.field ? `.${e.field}` : ''}: ${e.message}`);
          }
          process.exit(1);
        }

        // —— 4. marker 存在性 + v2 schema validate ——
        const verifyPath = join(changeDir, '.verify-passed');
        const reviewPath = join(changeDir, '.review-passed');
        if (!existsSync(verifyPath)) {
          console.error(`✗ Missing .verify-passed in ${changeDir}. Run /forge:verify first.`);
          process.exit(1);
        }
        if (!existsSync(reviewPath)) {
          console.error(`✗ Missing .review-passed in ${changeDir}. Run /forge:review first.`);
          process.exit(1);
        }

        const verifyText = await readFile(verifyPath, 'utf8');
        const reviewText = await readFile(reviewPath, 'utf8');
        const verifyMarker = parseMarker(verifyText) as unknown as Record<string, unknown>;
        const reviewMarker = parseMarker(reviewText) as unknown as Record<string, unknown>;

        const verifyValid = validateMarkerSchema(verifyMarker, verifyPath);
        if (!verifyValid.valid) {
          console.error('✗ .verify-passed schema invalid:');
          for (const e of verifyValid.errors) {
            console.error(`  - ${e.field ?? 'marker'}: ${e.message}`);
          }
          process.exit(1);
        }
        const reviewValid = validateMarkerSchema(reviewMarker, reviewPath);
        if (!reviewValid.valid) {
          console.error('✗ .review-passed schema invalid:');
          for (const e of reviewValid.errors) {
            console.error(`  - ${e.field ?? 'marker'}: ${e.message}`);
          }
          process.exit(1);
        }
        // schema 字段 v2 类型限定(双保险)
        if (verifyMarker.schema !== 'forge-verify/v2') {
          console.error(
            `✗ .verify-passed must be forge-verify/v2, got: ${String(verifyMarker.schema)}`,
          );
          process.exit(1);
        }
        if (reviewMarker.schema !== 'forge-review/v2') {
          console.error(
            `✗ .review-passed must be forge-review/v2, got: ${String(reviewMarker.schema)}`,
          );
          process.exit(1);
        }

        // —— 4b. human-override 处理 ——
        if (
          (verifyMarker.verified_by === 'human-override' ||
            reviewMarker.reviewed_by === 'human-override') &&
          !opts.force
        ) {
          console.error(
            '✗ human-override marker requires --force\n' +
              `  verified_by=${verifyMarker.verified_by} reviewed_by=${reviewMarker.reviewed_by}`,
          );
          process.exit(1);
        }

        // —— 5. Task progress confirm(未完成 + 非 --yes 才弹)——
        const incomplete = await countIncompleteTasks(changeDir);
        if (incomplete > 0 && !opts.yes) {
          const proceed = await confirmPrompt(
            `${incomplete} incomplete task(s) in tasks.md. Continue archive anyway?`,
          );
          if (!proceed) {
            console.log('Archive cancelled.');
            return;
          }
        }

        // —— 6. Spec deltas 应用 — Path B 用 forge 现有 readDeltas + applyDeltas ——
        let deltas: SpecDelta[] = [];
        if (!opts.skipSpecs) {
          const changeSpecsDir = join(changeDir, 'specs');
          deltas = await readDeltas(changeSpecsDir, mainSpecsDir);
          if (deltas.length > 0) {
            console.log(renderDeltasSummary(deltas));
            if (!opts.yes) {
              const proceed = await confirmPrompt('Apply spec deltas?');
              if (!proceed) {
                console.log('Skipping spec deltas. Continuing with archive.');
                deltas = [];
              }
            }
            if (deltas.length > 0) {
              await applyDeltas(mainSpecsDir, deltas);
            }
          }
        }

        // —— 7. archiveDate(算一次 — F-R3-2)+ mv changeDir → archive/<archiveName> ——
        const archiveDate = getArchiveDate();
        const archiveName = `${archiveDate}-${changeId}`;
        const archivePath = join(archiveDir, archiveName);
        if (existsSync(archivePath)) {
          console.error(`✗ Archive '${archiveName}' already exists.`);
          process.exit(1);
        }
        await mkdir(archiveDir, { recursive: true });
        await moveDirectory(changeDir, archivePath);

        // —— 8. buildArchiveSummary(v2 新 signature)+ 写 archive_summary.yaml ——
        const summary = await buildArchiveSummary({
          archivePath,
          changeId,
          verifyMarker,
          reviewMarker,
          deltas,
        });
        await writeFile(join(archivePath, 'archive_summary.yaml'), stringifyYaml(summary), 'utf8');

        // —— 9a. legacy-bridge posthook(透传 archiveDate 防跨午夜偏)——
        await runArchivePostHook(forgeRoot, changeId, {
          archiveDate,
          api: opts.api ?? false,
        });

        // —— 9b. 打印用户输出(渲染 summary)——
        console.log(renderArchiveSummaryOutput(summary, archiveName));

        // —— 9c. 自动重生成 backlog(失败仅 warn,不回滚 archive)——
        try {
          const bl = await generateBacklog(forgeRoot);
          console.log(
            `Backlog: forge/backlog/active.md (${bl.openCount} open, ${bl.warningCount} warnings)`,
          );
        } catch (e) {
          console.warn(
            `⚠ backlog 重生成失败(不影响 archive):${(e as Error).message} —— 可手动跑 \`forge backlog\``,
          );
        }

        // —— 9d. 顺手 emit monitor trace event(沿 plan §10.3 Task 3.15)——
        appendTraceEvent(targetPath, {
          ts: new Date().toISOString(),
          schema: 'forge-monitor-trace/v1',
          change_id: changeId,
          stage: 'archive',
          layer: 'cli',
          event: 'change_archived',
          data: {
            archive_name: archiveName,
            spec_updates: deltas.length,
            forge_version: FORGE_VERSION,
          },
        });
      },
    );
}

// ============================================================================
// legacy-bridge sync-check 接口(保留 — 双路径 archive-dualpath / archive-integration 测试用)
// ============================================================================

/**
 * preflight 结果 union — caller 根据 kind 退出
 *
 * kind 'ok':可继续 archive(graceful skip / 无 affected anchor / --api 跑完无 critical)
 * kind 'ack-missing':ack 未就绪,exit 2
 * kind 'critical-pending':**仅 --api 模式** —— 进程内跑 sync-check 后发现 critical pending
 * kind 'halted-for-fulfillment':**仅 agent 模式** —— emit manifest + 暂停态文件已写,exit 2
 */
export type PreflightResult =
  | { kind: 'ok' }
  | { kind: 'ack-missing'; message: string }
  | { kind: 'critical-pending'; criticalCount: number; message: string }
  | { kind: 'halted-for-fulfillment'; message: string };

/**
 * Plan 7 §2.5 + Task 6.3:archive preflight — enforce_sync=true 时拦截 sync 差异。
 *
 * Graceful skip 路径(全部返 {kind:'ok'}):
 *   1. forge/config.yaml 不存在
 *   2. legacy-anchors.yaml 不存在
 *   3. legacy_bridge.allow_llm_calls != true
 *   4. legacy_bridge.enforce_sync != true
 *   5. 无受影响 anchor / 全部读取失败(buildSyncCheckTask 返 null)
 *
 * 双模式:
 *   - **agent 模式(默认)**:emit sync-check manifest + 暂停态 → halted-for-fulfillment
 *   - **--api 模式**:进程内直连 API 跑 sync-check + 写 sync-state → critical-pending 或 ok
 *
 * ack 不就绪 → ack-missing。
 */
export async function runArchivePreflight(
  forgeRoot: string,
  changeId: string,
  opts: { api: boolean } = { api: false },
): Promise<PreflightResult> {
  const configPath = join(forgeRoot, 'config.yaml');
  if (!existsSync(configPath)) return { kind: 'ok' };
  const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;

  // §2.5:仅当 legacy-anchors.yaml 存在 AND allow_llm_calls AND enforce_sync 时进入
  const anchors = await loadAnchorsFile(forgeRoot).catch(() => null);
  if (!anchors) return { kind: 'ok' };
  if (!config.legacy_bridge?.allow_llm_calls) return { kind: 'ok' };
  if (!config.legacy_bridge?.enforce_sync) return { kind: 'ok' };

  const ack = await checkAck(forgeRoot, config, anchors);
  if (!ack.ok) {
    return {
      kind: 'ack-missing',
      message: `legacy_bridge.enforce_sync=true 但 ack 未就绪:${ack.reason};请先跑 forge legacy-bridge --acknowledge-data-transfer`,
    };
  }

  // 拼 change context(I-3:gate 已加载的 config + anchors 传入)
  const ctx = await buildSyncCheckChangeContext(
    forgeRoot,
    changeId,
    { archived: false },
    config,
    anchors,
  );

  if (opts.api) {
    // —— --api 模式:进程内直连 API 跑 sync-check ——
    const task = await buildSyncCheckTask(ctx, async (p) => (await readAnchorFile(p)).text);
    if (!task) return { kind: 'ok' };
    const client = (await makeForgeApiClient()) as unknown as RunnerClient;
    const results = await new ApiRunner(client).run([task]);
    const syncState = applySyncCheckResult(results[0]?.text ?? '', changeId, 'api-inline');
    await mkdir(join(forgeRoot, 'legacy-sync-state'), { recursive: true });
    await writeFile(
      join(forgeRoot, 'legacy-sync-state', `${changeId}.md`),
      renderDiffMarkdown(syncState),
      'utf8',
    );
    await writeFile(
      join(forgeRoot, 'legacy-sync-state', `${changeId}.yaml`),
      renderDiffYaml(syncState),
      'utf8',
    );
    const criticalDiffs = syncState.diffs.filter(
      (d) => d.severity === 'critical' && d.status === 'pending',
    );
    if (criticalDiffs.length > 0) {
      return {
        kind: 'critical-pending',
        criticalCount: criticalDiffs.length,
        message:
          `✗ ${criticalDiffs.length} 项 critical 差异未 resolve;\n` +
          `跑 forge legacy-bridge resolve ${changeId} 后重试,或在 forge/legacy-sync-state/${changeId}.yaml 标 ack`,
      };
    }
    return { kind: 'ok' };
  }

  // —— agent 模式(默认):emit sync-check manifest + 暂停态 ——
  const emitResult = await emitPreflightSyncCheck(forgeRoot, changeId, ctx);
  if (emitResult.kind === 'skip') return { kind: 'ok' };
  return {
    kind: 'halted-for-fulfillment',
    message:
      `sync-check manifest 已 emit(preflight);\n` +
      `forge agent 履行后跑 forge legacy-bridge sync-check --apply --change-id ${changeId};\n` +
      `暂停态文件:forge/.cache/archive-pause-${changeId}.json`,
  };
}

/**
 * Plan 7 §2.5 + Task 6.3:post-archive hook — 不阻塞,enforce_sync=false 时跑(产报告)。
 *
 * agent 模式:emit sync-check manifest(非阻塞,archive 已完成)
 * --api 模式:进程内直连 API 跑 sync-check + 写 sync-state(非阻塞)
 *
 * I-2:archiveDate 由 archive 主流程透传(不自己算 new Date(),避免跨午夜偏一天)。
 */
export async function runArchivePostHook(
  forgeRoot: string,
  changeId: string,
  opts: { archiveDate: string; api: boolean },
): Promise<void> {
  const configPath = join(forgeRoot, 'config.yaml');
  if (!existsSync(configPath)) return;
  const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
  if (!config.legacy_bridge?.allow_llm_calls) return;
  if (config.legacy_bridge?.enforce_sync) return; // 已在 preflight 跑过
  const anchors = await loadAnchorsFile(forgeRoot).catch(() => null);
  if (!anchors) return;
  const ack = await checkAck(forgeRoot, config, anchors);
  if (!ack.ok) return;

  const ctx = await buildSyncCheckChangeContext(
    forgeRoot,
    changeId,
    { archived: true, archiveDate: opts.archiveDate },
    config,
    anchors,
  );

  if (opts.api) {
    // —— --api 模式:进程内直连 API 跑 sync-check + 写 sync-state(非阻塞,失败仅 warn)——
    try {
      const task = await buildSyncCheckTask(ctx, async (p) => (await readAnchorFile(p)).text);
      if (!task) return;
      const client = (await makeForgeApiClient()) as unknown as RunnerClient;
      const results = await new ApiRunner(client).run([task]);
      const syncState = applySyncCheckResult(results[0]?.text ?? '', changeId, 'api-inline');
      await mkdir(join(forgeRoot, 'legacy-sync-state'), { recursive: true });
      await writeFile(
        join(forgeRoot, 'legacy-sync-state', `${changeId}.md`),
        renderDiffMarkdown(syncState),
        'utf8',
      );
      await writeFile(
        join(forgeRoot, 'legacy-sync-state', `${changeId}.yaml`),
        renderDiffYaml(syncState),
        'utf8',
      );
      console.log(
        `⚠ ${syncState.diffs.length} 项老文档可能需更新,详见 forge/legacy-sync-state/${changeId}.md`,
      );
    } catch (e) {
      console.warn(
        `⚠ --api sync-check(posthook)失败,已跳过(archive 已完成):${(e as Error).message}`,
      );
    }
    return;
  }

  // —— agent 模式(默认):emit sync-check manifest(非阻塞)——
  const emitResult = await emitPostHookSyncCheck(forgeRoot, changeId, ctx);
  if (emitResult.kind === 'emitted') {
    console.log(
      `⚠ sync-check manifest 已 emit(posthook);forge agent 履行后跑 forge legacy-bridge sync-check --apply --change-id ${changeId} 可得报告`,
    );
  }
}

/**
 * 抽出:合并 runArchivePreflight/runArchivePostHook 两处重复的 change context 拼装。
 *
 * archived=false → forge/changes/<id>/;
 * archived=true  → forge/changes/archive/<archiveDate>-<id>/。
 *
 * I-3:config 与 anchors 由调用方已加载并传入,避免 double-IO。
 * I-2:archived=true 时用调用方透传的 archiveDate(防跨午夜偏)。
 */
async function buildSyncCheckChangeContext(
  forgeRoot: string,
  changeId: string,
  opts: { archived: boolean; archiveDate?: string },
  config: ForgeConfig,
  anchors: LegacyAnchorsFile,
): Promise<SyncCheckInput> {
  const changesDir =
    opts.archived && opts.archiveDate
      ? join(forgeRoot, 'changes', 'archive', `${opts.archiveDate}-${changeId}`)
      : join(forgeRoot, 'changes', changeId);
  let changeContext = '';
  const affectedModules: string[] = [];
  if (existsSync(join(changesDir, 'proposal.md'))) {
    changeContext += await readFile(join(changesDir, 'proposal.md'), 'utf8');
  }
  const specsDir = join(changesDir, 'specs');
  if (existsSync(specsDir)) {
    for (const f of await readdir(specsDir)) {
      changeContext += `\n## specs/${f}\n${await readFile(join(specsDir, f), 'utf8')}`;
      affectedModules.push(f.replace(/\.md$/, ''));
    }
  }
  return {
    changeId,
    changeContext,
    affectedModules,
    anchors,
    autoResolveCrossAnchor: config.legacy_bridge?.auto_resolve_cross_anchor ?? false,
    mtimeOf: (p) => {
      try {
        return Math.floor(statSync(p).mtimeMs / 1000);
      } catch {
        return 0;
      }
    },
  };
}

/**
 * agent 模式:emit preflight sync-check manifest + 暂停态文件,halt archive(Task 6.3)。
 *
 * 调用前 gate 检查(config 存在 + allow_llm_calls + enforce_sync + anchors + ack)由
 * runArchivePreflight 负责;本函数专注 emit 逻辑。
 *
 * @param ctx 已拼好的 SyncCheckInput(可选;不传则内部自拼,供测试直接调用)
 */
export async function emitPreflightSyncCheck(
  forgeRoot: string,
  changeId: string,
  ctx?: SyncCheckInput,
): Promise<{ kind: 'halted-for-fulfillment' | 'skip' }> {
  const syncCtx = ctx ?? (await buildSyncCheckContextStandalone(forgeRoot, changeId, false));
  if (!syncCtx) return { kind: 'skip' };
  const task = await buildSyncCheckTask(syncCtx, async (p) => (await readAnchorFile(p)).text);
  if (!task) return { kind: 'skip' };
  const manifest = await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit(
    'sync-check',
    1,
    [task],
    { gate_context: 'archive-preflight', changeId },
  );
  await mkdir(join(forgeRoot, '.cache'), { recursive: true });
  await writeFile(
    join(forgeRoot, '.cache', `archive-pause-${changeId}.json`),
    JSON.stringify(
      {
        changeId,
        paused_step: 'preflight-sync-check',
        manifest_hash: manifest.manifest_hash,
      },
      null,
      2,
    ),
    'utf8',
  );
  return { kind: 'halted-for-fulfillment' };
}

/**
 * agent 模式:enforce_sync=false 时 post-archive emit sync-check manifest(非阻塞)。
 *
 * archive 已完成;fulfill 后跑 forge legacy-bridge sync-check --apply 出报告。
 */
export async function emitPostHookSyncCheck(
  forgeRoot: string,
  changeId: string,
  ctx?: SyncCheckInput,
): Promise<{ kind: 'emitted' | 'skip' }> {
  const syncCtx = ctx ?? (await buildSyncCheckContextStandalone(forgeRoot, changeId, true));
  if (!syncCtx) return { kind: 'skip' };
  const task = await buildSyncCheckTask(syncCtx, async (p) => (await readAnchorFile(p)).text);
  if (!task) return { kind: 'skip' };
  await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit('sync-check', 1, [task], {
    gate_context: 'archive-posthook',
    changeId,
  });
  return { kind: 'emitted' };
}

/**
 * Task 6.3 I-3 配套:emitPreflightSyncCheck/emitPostHookSyncCheck 被测试直接调用
 * (不经 runArchivePreflight/runArchivePostHook gate)时,自行加载 config + anchors。
 *
 * archived=true 时用「今日」作 archiveDate —— 仅 standalone 测试路径,生产路径
 * 由 runArchivePostHook 透传准确的 archiveDate。
 *
 * 返回 null:config 缺失 / anchors 缺失 → 调用方按 skip 处理。
 */
async function buildSyncCheckContextStandalone(
  forgeRoot: string,
  changeId: string,
  archived: boolean,
): Promise<SyncCheckInput | null> {
  const configPath = join(forgeRoot, 'config.yaml');
  if (!existsSync(configPath)) return null;
  const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
  const anchors = await loadAnchorsFile(forgeRoot).catch(() => null);
  if (!anchors) return null;
  return buildSyncCheckChangeContext(
    forgeRoot,
    changeId,
    { archived, archiveDate: archived ? new Date().toISOString().slice(0, 10) : undefined },
    config,
    anchors,
  );
}

/**
 * Task 6.4:forge archive --resume 的 gate 复核(legacy 留存 — v4 archive 主流程已无 --resume,
 * 但 tests/cli/legacy-bridge/archive-dualpath.test.ts 直接 import 测试此 gate 逻辑,需保留)。
 *
 * 复核两项:
 * ① 产物绑定 — sync-state.produced_from 必须等于暂停态文件的 manifest_hash
 * ② critical 幂等重评 — sync-state 中不得有 severity=critical + status=pending 的差异
 *
 * v4 备注:archive 命令本身不再调用此函数;legacy-bridge sync-check 命令(若有 resume 路径)
 * 可调用此函数验证 sync-state 绑定。本函数留存为 sync-check 子系统的 building block。
 */
export async function resumeArchiveGateCheck(
  forgeRoot: string,
  changeId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const pausePath = join(forgeRoot, '.cache', `archive-pause-${changeId}.json`);
  if (!existsSync(pausePath)) {
    return {
      ok: false,
      reason: `无暂停态文件 archive-pause-${changeId}.json;archive 未在 preflight 暂停,无需 resume`,
    };
  }
  let pause: { manifest_hash: string };
  try {
    pause = JSON.parse(await readFile(pausePath, 'utf8')) as { manifest_hash: string };
  } catch (err) {
    return {
      ok: false,
      reason: `暂停态文件 ${pausePath} 解析失败(可能损坏):${(err as Error).message}`,
    };
  }

  const statePath = join(forgeRoot, 'legacy-sync-state', `${changeId}.yaml`);
  if (!existsSync(statePath)) {
    return {
      ok: false,
      reason: `sync-state 缺失(forge/legacy-sync-state/${changeId}.yaml);请先让 agent fulfill manifest 后跑 forge legacy-bridge sync-check --apply --change-id ${changeId}`,
    };
  }
  let state: SyncStateFile;
  try {
    state = parseYaml(await readFile(statePath, 'utf8')) as SyncStateFile;
  } catch (err) {
    return {
      ok: false,
      reason: `sync-state 文件 ${statePath} 解析失败(可能损坏):${(err as Error).message}`,
    };
  }

  if (state.produced_from !== pause.manifest_hash) {
    return {
      ok: false,
      reason: `produced_from(${state.produced_from ?? 'undefined'}) ≠ 暂停态 manifest_hash(${pause.manifest_hash});sync-state 非本次 --apply 产物,请重新履行 manifest 并跑 sync-check --apply`,
    };
  }

  const criticalPending = (state.diffs ?? []).filter(
    (d) => d.severity === 'critical' && d.status === 'pending',
  );
  if (criticalPending.length > 0) {
    return {
      ok: false,
      reason: `仍有 ${criticalPending.length} 项 critical 差异未 resolve;跑 forge legacy-bridge resolve ${changeId} 后重试`,
    };
  }

  return { ok: true };
}
