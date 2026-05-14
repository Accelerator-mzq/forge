// forge archive 子命令 — 归档 change(spec §3.5)
// 支持:
//   forge archive <changeId>             — 正常归档(检查 marker + hash + lock)
//   forge archive <changeId> --force     — 接受 human-override 标记 或 非 git 项目
//   forge archive --recover              — 从半完成状态恢复
//   forge archive --resume-summary <archiveId> — 恢复半完成 .tmp summary rename

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
// Task 8 (plan-9a §9): cross-cutting fence framework — 9g 实施完整 13 不变量逻辑
import { crossCuttingFenceCheck } from '../../core/archive/fence.js';
// plan-9d Task 6:verify_findings fence + ack-log consistency
import { validateVerifyFindingsFence } from '../../core/archive/verify-findings-fence.js';
import { validateAckLogConsistency } from '../../core/archive/ack-log-consistency.js';
// plan-9c Task 2:pause_decisions fence
import { validatePauseDecisionsFence } from '../../core/archive/pause-decisions-fence.js';
// plan-9e1 Task 4:三级 fence + summary builder + render + ScopeEntriesIntegrityError(v2 BLOCKER 4)
import { validateThreeLevelFence } from '../../core/archive/three-level-fence.js';
import {
  buildArchiveSummary,
  ScopeEntriesIntegrityError,
} from '../../core/archive/summary-builder.js';
import { renderArchiveSummaryOutput } from '../../core/archive/summary-render.js';
// plan-9e1 Task 5:resume-summary 子模式
import { resumeArchiveSummary } from '../../core/archive/resume-summary.js';
// plan-9j Task 5:legacy-exemption + version-retrograde fence
import { validateLegacyExemption } from '../../core/archive/legacy-exemption.js';
import { validateVersionRetrograde } from '../../core/archive/version-retrograde-fence.js';

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
    .option(
      '--resume-summary <archiveId>',
      'resume rename archive_summary.tmp.yaml → archive_summary.yaml (rare half-completed state, plan-9e1)',
    )
    .action(
      async (
        changeId: string | undefined,
        opts: {
          force?: boolean;
          recover?: boolean;
          resumeSummary?: string; // plan-9e1 Task 5
        },
      ) => {
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

        // —— plan-9e1 Task 5:--resume-summary 独立路径(v2 BLOCKER 1 + 5 修订)——
        if (opts.resumeSummary) {
          let release: (() => Promise<void>) | undefined;
          try {
            release = await acquireLock(forgeRoot, 'resume-summary');
            const r = await resumeArchiveSummary(forgeRoot, opts.resumeSummary);
            if (r.kind === 'ok') {
              console.log(r.message);
              const rel = release;
              release = undefined;
              if (rel) await rel();
              process.exit(0);
            }
            // v2 BLOCKER 5:corrupt → exit 3(沿 master §3.12.3 corrupt 档)
            if (r.kind === 'corrupt') {
              console.error(r.message);
              const rel = release;
              release = undefined;
              if (rel) await rel();
              process.exit(3);
            }
            // conflict / missing 都是 business-fail → exit 1
            console.error(r.message);
            const rel = release;
            release = undefined;
            if (rel) await rel();
            process.exit(1);
          } catch (err) {
            if (err instanceof LockHeldError) {
              // v2 BLOCKER 1:lock-held → exit 2(对齐 master §3.12.3 freeze;v0.4 --recover exit 5 是遗留)
              console.error(err.message);
              process.exit(2);
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
          // 设计意图:用户立即拿到 sync-state 报告,不被 marker 失败遮蔽。
          // 决策 #23:复用 archive.lock,不再 acquire legacy-bridge.lock。
          // preflight 不再 process.exit,改返 PreflightResult,caller 在 try 块内手动 release+exit
          // 与 marker check 现有 inline-release convention 一致(避免 process.exit 跳过 finally 致锁残留)
          const preflightResult = await runArchivePreflight(forgeRoot, changeId);
          if (preflightResult.kind !== 'ok') {
            console.error(preflightResult.message);
            await archiveRelease();
            process.exit(2);
          }

          // plan-9g 默认开启 14 不变量 fence(brainstorm v6 删两 opt-in flag);所有 archive 调用都跑
          const fenceResult = await crossCuttingFenceCheck(join(forgeRoot, 'changes', changeId));
          if (!fenceResult.ok) {
            console.error('✗ cross-cutting fence rejected archive:');
            for (const r of fenceResult.results) {
              if (!r.ok) console.error(`  - ${r.invariant}: ${r.reason}`);
            }
            const rel = archiveRelease;
            archiveRelease = undefined;
            if (rel) await rel();
            process.exit(1);
          }

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
            console.error(
              '✗ .verify-passed marker 已过期(tasks/content hash 不匹配),请重跑 verify',
            );
            // C2 修复:先 release lock 再 exit
            // plan-9d Task 6 v2 M-1 修订:hash mismatch = fence business-fail,exit 1(沿 master §3.12.3)
            await archiveRelease();
            process.exit(1);
          }

          // 比对 review marker 里的 hash
          if (tasksHashNow !== rRec['tasks_hash'] || contentHashNow !== rRec['content_hash']) {
            console.error(
              '✗ .review-passed marker 已过期(tasks/content hash 不匹配),请重跑 review',
            );
            // C2 修复:先 release lock 再 exit
            // plan-9d Task 6 v2 M-1 修订:hash mismatch = fence business-fail,exit 1
            await archiveRelease();
            process.exit(1);
          }

          // 步骤 3.4(plan-9j Task 5):legacy-exemption + version-retrograde fence
          // 沿 design §3.4.4.1 + §3.4.4.3 — 在 evidence 校验之前拦截 legacy marker 异常
          const legacyVerifyResult = validateLegacyExemption(verifyRec, verifyPath);
          if (!legacyVerifyResult.valid) {
            console.error('✗ legacy-exemption fence 拒签(verify-passed):');
            for (const e of legacyVerifyResult.errors)
              console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
          const legacyReviewResult = validateLegacyExemption(reviewRec, reviewPath);
          if (!legacyReviewResult.valid) {
            console.error('✗ legacy-exemption fence 拒签(review-passed):');
            for (const e of legacyReviewResult.errors)
              console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
          const retrogradeVerifyResult = await validateVersionRetrograde(
            verifyPath,
            verifyRec,
            process.cwd(),
          );
          if (!retrogradeVerifyResult.valid) {
            console.error('✗ version-retrograde fence 拒签(verify-passed):');
            for (const e of retrogradeVerifyResult.errors)
              console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
          const retrogradeReviewResult = await validateVersionRetrograde(
            reviewPath,
            reviewRec,
            process.cwd(),
          );
          if (!retrogradeReviewResult.valid) {
            console.error('✗ version-retrograde fence 拒签(review-passed):');
            for (const e of retrogradeReviewResult.errors)
              console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }

          // 步骤 3.5:P1.2 — 验证 evidence 完整性
          const evResult = await validateEvidence(verifyRec, verifyPath);
          if (!evResult.valid) {
            console.error('✗ verify evidence 校验失败:');
            for (const e of evResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            // plan-9d Task 6 v2 M-1 修订:evidence 校验失败 = fence business-fail,exit 1
            await archiveRelease();
            process.exit(1);
          }

          // 步骤 3.6:plan-9d Task 6 — verify_findings fence 三级 × resolved × ack 矩阵 + finding_hash 篡改拒签
          const vfResult = validateVerifyFindingsFence(verifyRec, verifyPath);
          if (!vfResult.valid) {
            console.error('✗ verify_findings fence 拒签:');
            for (const e of vfResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }

          // 步骤 3.7:plan-9c Task 2 — pause_decisions fence(option 1-4 五类业务校验 + CRITICAL 重定向)
          // v2 codex MAJOR 4 修订:对 verifyRec + reviewRec 都跑 fence
          // v4 codex NEW-MAJOR A6 + B4 联动:fence 不再需要 ctx 参数(B4 改用 parseMarkdown 局部段校验,
          //   不再调 validateScopeEntries → ctx unused → 沿 YAGNI 移除)
          const pdVerifyResult = await validatePauseDecisionsFence(
            verifyRec,
            changeDir,
            verifyPath,
          );
          if (!pdVerifyResult.valid) {
            console.error('✗ pause_decisions fence 拒签(verify-passed):');
            for (const e of pdVerifyResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
          const pdReviewResult = await validatePauseDecisionsFence(
            reviewRec,
            changeDir,
            reviewPath,
          );
          if (!pdReviewResult.valid) {
            console.error('✗ pause_decisions fence 拒签(review-passed):');
            for (const e of pdReviewResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }

          // 步骤 3.8:plan-9d Task 6 v2 B-4 — ack-log 一致性 cross-check
          // v3 codex BLOCKER 2 修订:对 verifyRec + reviewRec 都跑 cross-check
          // (review marker 同样可承载 pause_decisions superset additive,沿 9c Task 1 schema)
          const ackVerifyResult = await validateAckLogConsistency(changeDir, verifyRec, changeId);
          if (!ackVerifyResult.valid) {
            console.error('✗ ack-log 一致性校验失败(verify-passed):');
            for (const e of ackVerifyResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
          const ackReviewResult = await validateAckLogConsistency(changeDir, reviewRec, changeId);
          if (!ackReviewResult.valid) {
            console.error('✗ ack-log 一致性校验失败(review-passed):');
            for (const e of ackReviewResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }

          // 步骤 3.9:plan-9e1 Task 4 — 三级业务行为 fence(沿 design §2.4.2)
          // CRITICAL+resolved=false 拒签(sanity 双重保险)/ WARNING+resolved=false+无 ack 拒签 /
          // WARNING+resolved=false+acked 通过 / SUGGESTION+resolved=false 通过(handoff to backlog)
          const tlfResult = validateThreeLevelFence(verifyRec, reviewRec, verifyPath, reviewPath);
          if (!tlfResult.valid) {
            console.error('✗ 三级业务行为 fence 拒签:');
            for (const e of tlfResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
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
            const gitResult = await validateReviewGitIntegrity(
              reviewRec,
              process.cwd(),
              reviewPath,
            );
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

          // 步骤 4.5:plan-9e1 Task 4 — 构造 archive_summary(传给 transaction 落 .tmp)
          // v2 BLOCKER 4 修订:try/catch ScopeEntriesIntegrityError → fence business-fail exit 1
          const archiveDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          let archiveSummary;
          try {
            // plan-9e2 Task 2 同步改:加 fenceResult 入参(沿 archive.ts:231 现有 crossCuttingFenceCheck 输出)— Task 4 进一步整理调用顺序
            archiveSummary = await buildArchiveSummary(
              verifyRec,
              reviewRec,
              changeDir, // 沿用 line 213 已定义的 changeDir
              changeId,
              fenceResult,
            );
          } catch (err) {
            if (err instanceof ScopeEntriesIntegrityError) {
              console.error(
                `✗ scope-entries 完整性 fence 拒签(${err.artifactName} section ${err.anchorId}):${err.message}`,
              );
              await archiveRelease();
              process.exit(1);
            }
            throw err;
          }

          // 步骤 5:调 archiveTransaction(Move→Sync,含 .tmp 写 / rename / 回滚)
          await archiveTransaction({ forgeRoot, changeId, archiveDate, archiveSummary });

          // 步骤 5.5:Plan 7 post-archive hook(enforce_sync=false 时不阻塞,只产报告)
          await runArchivePostHook(forgeRoot, changeId);

          // 步骤 6:plan-9e1 Task 4 — 渲染 archive_summary 输出(沿 design §2.4.4)
          const archiveDirName = `${archiveDate}-${changeId}`;
          console.log(renderArchiveSummaryOutput(archiveSummary, archiveDirName));
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
      },
    );
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
 * preflight 结果 union — caller 在 try 块内根据 kind 手动 release + exit,
 * 与 archive.ts 现有"business-rule fail 处理"convention 一致(line 154 / 160 等)。
 *
 * kind 'ok':可继续 archive(graceful skip 或 全过)
 * kind 'ack-missing' / 'critical-pending':caller 应 await release + exit 2
 */
export type PreflightResult =
  | { kind: 'ok' }
  | { kind: 'ack-missing'; message: string }
  | { kind: 'critical-pending'; criticalCount: number; message: string };

/**
 * Plan 7 §2.5:archive preflight — enforce_sync=true 时阻塞 critical 差异。
 *
 * Graceful skip 路径(全部返 {kind:'ok'}):
 *   1. forge/config.yaml 不存在
 *   2. legacy-anchors.yaml 不存在
 *   3. legacy_bridge.allow_llm_calls != true
 *   4. legacy_bridge.enforce_sync != true
 *
 * 走 LLM 路径时:
 *   - ack 不就绪 → 返 {kind:'ack-missing'}
 *   - 含 critical pending → sync-state 已写后返 {kind:'critical-pending'}
 *   - 全过 → 返 {kind:'ok'}
 *
 * **不再调 process.exit / console.error**:caller(archive 命令)负责打印消息 +
 * release archive.lock + exit,避免本函数内 process.exit 跳过 caller finally
 * 导致 archive.lock 文件残留。
 */
export async function runArchivePreflight(
  forgeRoot: string,
  changeId: string,
): Promise<PreflightResult> {
  const configPath = join(forgeRoot, 'config.yaml');
  if (!existsSync(configPath)) return { kind: 'ok' };
  const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;

  // §2.5:仅当 legacy-anchors.yaml 存在 AND allow_llm_calls=true AND enforce_sync=true 时进入 preflight
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
    const criticalCount = out.syncState.diffs.filter(
      (d) => d.severity === 'critical' && d.status === 'pending',
    ).length;
    return {
      kind: 'critical-pending',
      criticalCount,
      message:
        `✗ ${criticalCount} 项 critical 差异未 resolve;\n` +
        `跑 forge legacy-bridge resolve ${changeId} 后重试,或在 forge/legacy-sync-state/${changeId}.yaml 标 ack`,
    };
  }

  return { kind: 'ok' };
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
