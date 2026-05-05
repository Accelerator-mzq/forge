// forge archive 子命令 — 归档 change(spec §3.5)
// 支持:
//   forge archive <changeId>             — 正常归档(检查 marker + hash + lock)
//   forge archive <changeId> --force     — 接受 human-override 标记
//   forge archive --recover              — 从半完成状态恢复

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarker } from '../../core/markers/index.js';
import { validateMarkerSchema } from '../../core/validate/index.js';
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
            process.exit(4);
          }
          process.exit(0);
        } catch (err) {
          if (err instanceof LockHeldError) {
            console.error(err.message);
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

      const release = await acquireLock(forgeRoot, 'archive');
      try {
        const changeDir = join(forgeRoot, 'changes', changeId);
        const verifyPath = join(changeDir, '.verify-passed');
        const reviewPath = join(changeDir, '.review-passed');

        // 步骤 1:检查 .verify-passed 和 .review-passed 都存在
        if (!existsSync(verifyPath)) {
          console.error(`✗ archive 拒绝:缺 .verify-passed (in ${changeDir})`);
          process.exit(2);
        }
        if (!existsSync(reviewPath)) {
          console.error(`✗ archive 拒绝:缺 .review-passed (in ${changeDir})`);
          process.exit(2);
        }

        // 步骤 2:解析 + schema 校验两个 marker
        const verifyText = await readFile(verifyPath, 'utf8');
        const reviewText = await readFile(reviewPath, 'utf8');

        const verifyMarker = parseMarker(verifyText);
        const reviewMarker = parseMarker(reviewText);

        const verifyResult = validateMarkerSchema(verifyMarker, verifyPath);
        if (!verifyResult.valid) {
          console.error(
            `✗ .verify-passed marker schema 校验失败:${verifyResult.errors[0]?.message}`,
          );
          process.exit(2);
        }
        const reviewResult = validateMarkerSchema(reviewMarker, reviewPath);
        if (!reviewResult.valid) {
          console.error(
            `✗ .review-passed marker schema 校验失败:${reviewResult.errors[0]?.message}`,
          );
          process.exit(2);
        }

        // 步骤 3:重算 tasks_hash 和 content_hash + 比对
        const tasksContent = await readFile(join(changeDir, 'tasks.md'), 'utf8');
        const tasksHashNow = computeTasksHash(tasksContent);
        const contentHashNow = await computeContentHash(changeDir);

        // 将 marker 转为 Record 以便访问字段
        const vRec = verifyMarker as unknown as Record<string, string>;
        const rRec = reviewMarker as unknown as Record<string, string>;

        // 比对 verify marker 里的 hash
        if (tasksHashNow !== vRec['tasks_hash'] || contentHashNow !== vRec['content_hash']) {
          console.error('✗ .verify-passed marker 已过期(tasks/content hash 不匹配),请重跑 verify');
          process.exit(2);
        }

        // 比对 review marker 里的 hash
        if (tasksHashNow !== rRec['tasks_hash'] || contentHashNow !== rRec['content_hash']) {
          console.error('✗ .review-passed marker 已过期(tasks/content hash 不匹配),请重跑 review');
          process.exit(2);
        }

        // 步骤 4:human-override 检查 — 必须 --force
        const verifyBy = vRec['verified_by'];
        const reviewBy = rRec['reviewed_by'];
        if (verifyBy === 'human-override' || reviewBy === 'human-override') {
          if (!opts.force) {
            console.error(
              '✗ human-override 标记需要 --force 接受\n' +
                '  verified_by=' +
                verifyBy +
                '  reviewed_by=' +
                reviewBy,
            );
            process.exit(2);
          }
        }

        // 步骤 5:调 archiveTransaction(Move→Sync)
        const archiveDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        await archiveTransaction({ forgeRoot, changeId, archiveDate });

        console.log(`✓ archived ${changeId} → changes/archive/${archiveDate}-${changeId}`);
      } finally {
        await release();
      }
    });
}
