// forge archive 子命令 — 归档 change(spec §3.5)
// 支持:
//   forge archive <changeId>             — 正常归档(检查 marker + hash + lock)
//   forge archive <changeId> --force     — 接受 human-override 标记 或 非 git 项目
//   forge archive --recover              — 从半完成状态恢复

import { Command } from 'commander';
import { readFile, rm, rename, readdir, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import Anthropic from '@anthropic-ai/sdk';
import { parseMarker } from '../../core/markers/index.js';
import { validateMarkerSchema } from '../../core/validate/index.js';
import {
  validateEvidence,
  validateReviewGitIntegrity,
  validateReviewOutcomes,
} from '../../core/validate/marker-integrity.js';
import { computeTasksHash, computeContentHash } from '../../core/hash/index.js';
import { archiveTransaction } from '../../core/archive/transaction.js';
import { acquireLock, LockHeldError } from '../../core/archive/lock.js';
import { recover } from '../../core/archive/recover.js';
import { promptRecoverChoice } from '../../core/archive/recover-prompt.js';
import { applyDeltas } from '../../core/specs-sync/index.js';
import { loadAnchorsFile } from '../../core/legacy-bridge/anchors.js';
import { checkAck } from '../../core/legacy-bridge/ack.js';
import { runSyncCheck, type SyncCheckClient } from '../../core/legacy-bridge/sync-check.js';
import {
  renderDiffMarkdown,
  renderDiffYaml,
  hasCriticalPending,
} from '../../core/legacy-bridge/diff-report.js';
import { readAnchorFile } from '../../core/legacy-bridge/encoding.js';
import type { ForgeConfig } from '../../core/schema/types.js';

/**
 * 检测当前目录是否真实处于 git 工作树中
 * P1 修复:用真实 git 状态决定,不信 marker 字段
 * @param cwd 要检测的目录路径
 * @returns true = 真实 git 工作树, false = 非 git
 */
function isProjectActuallyGit(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

export function buildArchiveCommand(): Command {
  return new Command('archive')
    .argument('[changeId]', 'change directory id (e.g., add-login)')
    .description('Archive a verified+reviewed change')
    .option('--force', 'accept human-override or non-git review markers')
    .option('--recover', 'recover from a half-completed archive transaction')
    .action(async (changeId: string | undefined, opts: { force?: boolean; recover?: boolean }) => {
      const forgeRoot = join(process.cwd(), 'forge');

      // —— --recover 独立路径 ——
      if (opts.recover) {
        let release: (() => Promise<void>) | undefined;
        try {
          release = await acquireLock(forgeRoot, 'recover');
          const r = await recover(forgeRoot);
          console.log(r.message);

          // Plan 6:case C 处理 — 完整性 check + 交互二选一
          if (r.case === 'C' && r.caseCData) {
            const { backupIntegrity, archiveIntegrity } = r.caseCData;
            // 任一不完整 → 退出码 4(spec §3.5 case C 末尾"任一不完整 → 输出诊断 + 退出码 4")
            if (!backupIntegrity.ok || !archiveIntegrity.ok) {
              console.error('✗ case C 完整性 check 失败,需人工介入:');
              if (!backupIntegrity.ok) console.error(`  backup: ${backupIntegrity.reason}`);
              if (!archiveIntegrity.ok) console.error(`  archive: ${archiveIntegrity.reason}`);
              const rel = release;
              release = undefined;
              if (rel) await rel();
              process.exit(4);
            }
            // 两者都完整 → 交互式二选一
            const choice = await promptRecoverChoice();
            if (choice === 'complete-archive') {
              // 完成归档:重跑 Sync(applyDeltas)+ 删 backup
              await applyDeltas(r.caseCData.currentSpecsDir, r.caseCData.deltas);
              await rm(r.caseCData.backupDir, { recursive: true, force: true });
              console.log('✓ case C 选择 [1] 完成归档:Sync 重跑成功,backup 已清理');
            } else {
              // 撤销归档:从 backup 恢复 forge/specs/ + 反向 rename
              await restoreSpecsFromBackup(r.caseCData.backupDir, r.caseCData.currentSpecsDir);
              // rename 失败时 specs 已还原但 archive 仍在原位,整体可重入(再跑 --recover 仍可完成)
              await rename(
                r.caseCData.archiveChangeDir,
                join(forgeRoot, 'changes', r.caseCData.changeOrigId),
              );
              await rm(r.caseCData.backupDir, { recursive: true, force: true });
              console.log('✓ case C 选择 [2] 撤销归档:specs 已还原,archive 反向 rename 完成');
            }
            const rel = release;
            release = undefined;
            if (rel) await rel();
            process.exit(0);
          }

          if (r.case === 'corrupt') {
            // C2 修复:先 release lock 再 exit,避免 process.exit 跳过 finally
            // 置 undefined 防止 finally 再次调用
            const rel = release;
            release = undefined;
            if (rel) await rel();
            process.exit(4);
          }
          // C2 修复:先 release lock 再 exit,置 undefined 防止 finally 重复调用
          const rel = release;
          release = undefined;
          if (rel) await rel();
          process.exit(0);
        } catch (err) {
          if (err instanceof LockHeldError) {
            console.error(err.message);
            // LockHeldError 时 release 未赋值,无需 release
            process.exit(5);
          }
          throw err;
        } finally {
          if (release) await release();
        }
      }

      // —— 正常 archive 路径 ——
      if (!changeId) {
        console.error('✗ changeId required (unless using --recover)');
        process.exit(1);
      }

      // C2 修复:改为 let,允许在 process.exit 前先 release
      let archiveRelease: (() => Promise<void>) | undefined;
      try {
        archiveRelease = await acquireLock(forgeRoot, 'archive');

        // Plan 7 PREFLIGHT(spec §2.5 line 183-204):acquireLock 之后、archive 严格门禁(marker check)之前。
        // 设计意图:用户立即拿到 sync-state 报告,不被 marker 失败遮蔽 — marker fail + sync critical
        // 共存时,先写 sync-state.{md,yaml},user 跑 resolve 后再撞 marker check。
        // 决策 #23:复用 archive.lock,不再 acquire legacy-bridge.lock。
        await runArchivePreflight(forgeRoot, changeId);

        const changeDir = join(forgeRoot, 'changes', changeId);
        const verifyPath = join(changeDir, '.verify-passed');
        const reviewPath = join(changeDir, '.review-passed');

        // 步骤 1:检查 .verify-passed 和 .review-passed 都存在
        if (!existsSync(verifyPath)) {
          console.error(`✗ archive 拒绝:缺 .verify-passed (in ${changeDir})`);
          // C2 修复:先 release lock 再 exit
          await archiveRelease();
          process.exit(2);
        }
        if (!existsSync(reviewPath)) {
          console.error(`✗ archive 拒绝:缺 .review-passed (in ${changeDir})`);
          // C2 修复:先 release lock 再 exit
          await archiveRelease();
          process.exit(2);
        }

        // 步骤 2:解析 + schema 校验两个 marker
        const verifyText = await readFile(verifyPath, 'utf8');
        const reviewText = await readFile(reviewPath, 'utf8');

        const verifyMarker = parseMarker(verifyText);
        const reviewMarker = parseMarker(reviewText);

        // 步骤 2a:schema 结构校验
        const verifyResult = validateMarkerSchema(verifyMarker, verifyPath);
        if (!verifyResult.valid) {
          console.error(
            `✗ .verify-passed marker schema 校验失败:${verifyResult.errors[0]?.message}`,
          );
          // C2 修复:先 release lock 再 exit
          await archiveRelease();
          process.exit(2);
        }
        const reviewResult = validateMarkerSchema(reviewMarker, reviewPath);
        if (!reviewResult.valid) {
          console.error(
            `✗ .review-passed marker schema 校验失败:${reviewResult.errors[0]?.message}`,
          );
          // C2 修复:先 release lock 再 exit
          await archiveRelease();
          process.exit(2);
        }

        // 步骤 2b:P1.1 — schema 类型限定(.verify-passed 必须是 forge-verify/v1)
        // 通过 unknown 中转以绕过 TS 的交叉类型检查
        const verifyRec = verifyMarker as unknown as Record<string, unknown>;
        const reviewRec = reviewMarker as unknown as Record<string, unknown>;

        if (verifyRec['schema'] !== 'forge-verify/v1') {
          console.error(
            `✗ .verify-passed 必须是 forge-verify/v1,实际:${String(verifyRec['schema'])}`,
          );
          await archiveRelease();
          process.exit(2);
        }
        if (reviewRec['schema'] !== 'forge-review/v1') {
          console.error(
            `✗ .review-passed 必须是 forge-review/v1,实际:${String(reviewRec['schema'])}`,
          );
          await archiveRelease();
          process.exit(2);
        }

        // 步骤 3:重算 tasks_hash 和 content_hash + 比对
        const tasksContent = await readFile(join(changeDir, 'tasks.md'), 'utf8');
        const tasksHashNow = computeTasksHash(tasksContent);
        const contentHashNow = await computeContentHash(changeDir);

        // 将 marker 转为 Record 以便访问字段
        const vRec = verifyRec as unknown as Record<string, string>;
        const rRec = reviewRec as unknown as Record<string, string>;

        // 比对 verify marker 里的 hash
        if (tasksHashNow !== vRec['tasks_hash'] || contentHashNow !== vRec['content_hash']) {
          console.error('✗ .verify-passed marker 已过期(tasks/content hash 不匹配),请重跑 verify');
          // C2 修复:先 release lock 再 exit
          await archiveRelease();
          process.exit(2);
        }

        // 比对 review marker 里的 hash
        if (tasksHashNow !== rRec['tasks_hash'] || contentHashNow !== rRec['content_hash']) {
          console.error('✗ .review-passed marker 已过期(tasks/content hash 不匹配),请重跑 review');
          // C2 修复:先 release lock 再 exit
          await archiveRelease();
          process.exit(2);
        }

        // 步骤 3.5:P1.2 — 验证 evidence 完整性
        const evResult = await validateEvidence(verifyRec, verifyPath);
        if (!evResult.valid) {
          console.error('✗ verify evidence 校验失败:');
          for (const e of evResult.errors) console.error(`  - ${e.field}: ${e.message}`);
          await archiveRelease();
          process.exit(2);
        }

        // 步骤 4:human-override + 真实 git 状态校验 + outcomes 校验
        const verifyBy = vRec['verified_by'];
        const reviewBy = rRec['reviewed_by'];
        const reviewGit = reviewRec['git'] as Record<string, unknown> | undefined;
        const markerSaysGit = reviewGit?.['is_git_repo'] === true;
        // P1 修复:用真实 git 状态决定,不信 marker 字段
        const projectIsGit = isProjectActuallyGit(process.cwd());

        // 4a. human-override 必须 --force
        if (verifyBy === 'human-override' || reviewBy === 'human-override') {
          if (!opts.force) {
            console.error(
              '✗ human-override 标记需要 --force 接受\n' +
                '  verified_by=' +
                verifyBy +
                '  reviewed_by=' +
                reviewBy,
            );
            // C2 修复:先 release lock 再 exit
            await archiveRelease();
            process.exit(2);
          }
        }

        // 4b. marker 与真实 git 状态不一致 → 可疑伪造,拒绝(--force 也不能覆盖)
        if (projectIsGit && !markerSaysGit) {
          console.error(
            '✗ review marker 标记 is_git_repo=false,但项目实际是 git。可能为伪造,拒绝(即使 --force)',
          );
          await archiveRelease();
          process.exit(2);
        }
        if (!projectIsGit && markerSaysGit) {
          console.error(
            '✗ review marker 标记 is_git_repo=true,但项目实际不是 git。可能为伪造,拒绝',
          );
          await archiveRelease();
          process.exit(2);
        }

        // 4c. 真非 git → 必须 --force(spec §3.4 要求)
        if (!projectIsGit && !opts.force) {
          console.error(`✗ 非 git 项目下 review 标记不绑定代码 diff,archive 必须 --force 才接受`);
          await archiveRelease();
          process.exit(2);
        }

        // 4d. 真 git → 跑 git integrity(重算 head + diff_hash)
        if (projectIsGit) {
          const gitResult = await validateReviewGitIntegrity(reviewRec, process.cwd(), reviewPath);
          if (!gitResult.valid) {
            console.error('✗ review git 完整性校验失败:');
            for (const e of gitResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(2);
          }
        }

        // 4e. review_outcomes:accepted=true 必须 resolved=true(已实现,不变)
        const outResult = validateReviewOutcomes(reviewRec, reviewPath);
        if (!outResult.valid) {
          console.error('✗ review_outcomes 校验失败:');
          for (const e of outResult.errors) console.error(`  - ${e.field}: ${e.message}`);
          await archiveRelease();
          process.exit(2);
        }

        // 步骤 5:调 archiveTransaction(Move→Sync)
        const archiveDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        await archiveTransaction({ forgeRoot, changeId, archiveDate });

        // 步骤 5.5:Plan 7 post-archive hook(enforce_sync=false 时不阻塞,只产报告)
        await runArchivePostHook(forgeRoot, changeId);

        console.log(`✓ archived ${changeId} → changes/archive/${archiveDate}-${changeId}`);
      } catch (err) {
        // exit code 映射 — spec §3.5
        if (err instanceof LockHeldError) {
          // lock 被占用 → exit 5
          console.error(err.message);
          if (archiveRelease) await archiveRelease();
          process.exit(5);
        }
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('AND rollback failed')) {
          // 同步失败且回滚也失败 → 需人工介入 → exit 3
          console.error(`✗ ${msg}`);
          if (archiveRelease) await archiveRelease();
          process.exit(3);
        }
        if (msg.includes('rolled back')) {
          // 同步失败但回滚成功 → 可重试 → exit 2
          console.error(`✗ ${msg}`);
          if (archiveRelease) await archiveRelease();
          process.exit(2);
        }
        // 兜底:未知错误 → exit 1
        console.error(`✗ ${msg}`);
        if (archiveRelease) await archiveRelease();
        process.exit(1);
      } finally {
        // finally 作为最终兜底(catch 内 process.exit 会跳过 finally,release 函数幂等)
        if (archiveRelease) await archiveRelease();
      }
    });
}

/**
 * 从 backup 目录把所有备份的 specs 文件还原到 currentSpecsDir(case C [2] 撤销归档用)。
 *
 * 简单语义:backup 内每个 .md 文件 copy 回 currentSpecsDir/ 同名位置,
 *           对应的 currentSpecsDir 内文件被覆盖。
 * 不删除 currentSpecsDir 中"backup 没有的文件"(理由:那些是 archive 没影响的旧文件)。
 */
async function restoreSpecsFromBackup(backupDir: string, currentSpecsDir: string): Promise<void> {
  const entries = await readdir(backupDir);
  await mkdir(currentSpecsDir, { recursive: true });
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    await copyFile(join(backupDir, name), join(currentSpecsDir, name));
  }
}

/**
 * Plan 7 §2.5:archive preflight — enforce_sync=true 时阻塞 critical 差异。
 *
 * Graceful skip 路径(全部走"不阻塞、return"):
 *   1. forge/config.yaml 不存在
 *   2. legacy-anchors.yaml 不存在
 *   3. legacy_bridge.allow_llm_calls != true
 *   4. legacy_bridge.enforce_sync != true
 *
 * 走 LLM 路径时,任何 ack 失败都退出(给用户提示);
 * sync-state 写入 forge/legacy-sync-state/<change-id>.{md,yaml};
 * 含 critical pending → exit 2(business-rule-fail)。
 */
export async function runArchivePreflight(forgeRoot: string, changeId: string): Promise<void> {
  const configPath = join(forgeRoot, 'config.yaml');
  if (!existsSync(configPath)) return;
  const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;

  // §2.5:仅当 legacy-anchors.yaml 存在 AND allow_llm_calls=true AND enforce_sync=true 时进入 preflight
  const anchors = await loadAnchorsFile(forgeRoot).catch(() => null);
  if (!anchors) return;
  if (!config.legacy_bridge?.allow_llm_calls) return;
  if (!config.legacy_bridge?.enforce_sync) return;

  const ack = await checkAck(forgeRoot, config, anchors);
  if (!ack.ok) {
    console.error(
      `legacy_bridge.enforce_sync=true 但 ack 未就绪:${ack.reason};请先跑 forge legacy-bridge --acknowledge-data-transfer`,
    );
    process.exit(2);
    return;
  }

  // 拼 change context(同 sync-check 命令)
  const changesDir = join(forgeRoot, 'changes', changeId);
  let changeContext = '';
  const affectedModules: string[] = [];
  if (existsSync(join(changesDir, 'proposal.md'))) {
    changeContext += await readFile(join(changesDir, 'proposal.md'), 'utf8');
  }
  const specsDir = join(changesDir, 'specs');
  if (existsSync(specsDir)) {
    const files = await readdir(specsDir);
    for (const f of files) {
      changeContext += `\n## specs/${f}\n${await readFile(join(specsDir, f), 'utf8')}`;
      affectedModules.push(f.replace(/\.md$/, ''));
    }
  }

  // 跑 sync-check(决策 #23:复用 archive.lock,不再 acquire legacy-bridge.lock)
  // 运行时动态加载 forge-eval/load-env(避免 src/ rootDir 静态分析边界限制)
  const evalLoadEnvPath = new URL('../../../forge-eval/load-env.js', import.meta.url).href;
  const { loadEnv } = (await import(/* @vite-ignore */ evalLoadEnvPath)) as {
    loadEnv: () => { anthropicApiKey: string };
  };
  const { anthropicApiKey } = loadEnv();
  const client = new Anthropic({ apiKey: anthropicApiKey }) as unknown as SyncCheckClient;
  const out = await runSyncCheck(
    client,
    {
      changeId,
      changeContext,
      affectedModules,
      anchors,
      autoResolveCrossAnchor: config.legacy_bridge.auto_resolve_cross_anchor ?? false,
      mtimeOf: (p) => {
        try {
          return Math.floor(statSync(p).mtimeMs / 1000);
        } catch {
          return 0;
        }
      },
    },
    async (path) => (await readAnchorFile(path)).text,
  );

  await mkdir(join(forgeRoot, 'legacy-sync-state'), { recursive: true });
  await writeFile(
    join(forgeRoot, 'legacy-sync-state', `${changeId}.md`),
    renderDiffMarkdown(out.syncState),
    'utf8',
  );
  await writeFile(
    join(forgeRoot, 'legacy-sync-state', `${changeId}.yaml`),
    renderDiffYaml(out.syncState),
    'utf8',
  );

  if (hasCriticalPending(out.syncState)) {
    console.error(
      `✗ ${out.syncState.diffs.filter((d) => d.severity === 'critical' && d.status === 'pending').length} 项 critical 差异未 resolve;\n` +
        `跑 forge legacy-bridge resolve ${changeId} 后重试,或在 forge/legacy-sync-state/${changeId}.yaml 标 ack`,
    );
    process.exit(2);
  }
}

/**
 * Plan 7 §2.5:post-archive hook — 不阻塞,仅在 enforce_sync=false 时跑(产报告)。
 * enforce_sync=true 已由 preflight 跑过;graceful skip 路径同 preflight。
 */
export async function runArchivePostHook(forgeRoot: string, changeId: string): Promise<void> {
  const configPath = join(forgeRoot, 'config.yaml');
  if (!existsSync(configPath)) return;
  const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
  if (!config.legacy_bridge?.allow_llm_calls) return;
  if (config.legacy_bridge?.enforce_sync) return; // 已在 preflight 跑过
  const anchors = await loadAnchorsFile(forgeRoot).catch(() => null);
  if (!anchors) return;
  const ack = await checkAck(forgeRoot, config, anchors);
  if (!ack.ok) return; // ack 不就绪 → graceful skip

  // 跑 sync-check 但不阻塞
  const changesDir = join(
    forgeRoot,
    'changes',
    'archive',
    `${new Date().toISOString().slice(0, 10)}-${changeId}`,
  );
  const proposalPath = existsSync(join(changesDir, 'proposal.md'))
    ? join(changesDir, 'proposal.md')
    : join(forgeRoot, 'changes', changeId, 'proposal.md');
  let changeContext = '';
  if (existsSync(proposalPath)) {
    changeContext = await readFile(proposalPath, 'utf8');
  }
  const affectedModules: string[] = [];
  // 简化:从 changeId 推测 module(占位,真实环境靠 specs/<area>.md)
  const evalLoadEnvPath = new URL('../../../forge-eval/load-env.js', import.meta.url).href;
  const { loadEnv } = (await import(/* @vite-ignore */ evalLoadEnvPath)) as {
    loadEnv: () => { anthropicApiKey: string };
  };
  const { anthropicApiKey } = loadEnv();
  const client = new Anthropic({ apiKey: anthropicApiKey }) as unknown as SyncCheckClient;
  const out = await runSyncCheck(
    client,
    {
      changeId,
      changeContext,
      affectedModules,
      anchors,
      autoResolveCrossAnchor: config.legacy_bridge.auto_resolve_cross_anchor ?? false,
      mtimeOf: (p) => {
        try {
          return Math.floor(statSync(p).mtimeMs / 1000);
        } catch {
          return 0;
        }
      },
    },
    async (path) => (await readAnchorFile(path)).text,
  );

  await mkdir(join(forgeRoot, 'legacy-sync-state'), { recursive: true });
  await writeFile(
    join(forgeRoot, 'legacy-sync-state', `${changeId}.md`),
    renderDiffMarkdown(out.syncState),
    'utf8',
  );
  await writeFile(
    join(forgeRoot, 'legacy-sync-state', `${changeId}.yaml`),
    renderDiffYaml(out.syncState),
    'utf8',
  );
  console.log(
    `⚠ ${out.syncState.diffs.length} 项老文档可能需更新,详见 forge/legacy-sync-state/${changeId}.md`,
  );
}
