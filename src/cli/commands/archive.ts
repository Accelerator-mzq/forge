// forge archive 子命令 — 归档 change(spec §3.5)
// 支持:
//   forge archive <changeId>             — 正常归档(检查 marker + hash + lock)
//   forge archive <changeId> --force     — 接受 human-override 标记 或 非 git 项目
//   forge archive --recover              — 从半完成状态恢复

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
          // 状态机退出码:
          //   clean / A / B / C → 0(clean/已恢复/需用户看消息后决策)
          //   corrupt → 4(需人工介入)
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

        // 步骤 4:human-override + non-git --force + git integrity + outcomes 校验
        const verifyBy = vRec['verified_by'];
        const reviewBy = rRec['reviewed_by'];
        const reviewGit = reviewRec['git'] as Record<string, unknown> | undefined;
        const isGitRepo = reviewGit?.['is_git_repo'] === true;

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

        // 4b. P1.3 — non-git review 必须 --force(spec §3.4 要求)
        if (!isGitRepo && !opts.force) {
          console.error(`✗ 非 git 项目下 review 标记不绑定代码 diff,archive 必须 --force 才接受`);
          await archiveRelease();
          process.exit(2);
        }

        // 4c. P1.3 — git review:重算 git.head + git.diff_hash 比对
        if (isGitRepo) {
          const gitResult = await validateReviewGitIntegrity(reviewRec, process.cwd(), reviewPath);
          if (!gitResult.valid) {
            console.error('✗ review git 完整性校验失败:');
            for (const e of gitResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(2);
          }
        }

        // 4d. P1.3 — review_outcomes:accepted=true 必须 resolved=true
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
