// forge ack 子命令 — §4 两步 user 确认协议
// 提供三个子命令:
//   forge ack propose <changeId> --finding <id> --action <type>  — AI 写 pending YAML
//   forge ack confirm <changeId> <findingId>                     — User 确认,转为正式 ack 日志
//   forge ack reject <changeId> <findingId> --rationale <text>   — User 拒绝,删 pending

import { Command } from 'commander';
import { readFile, writeFile, unlink, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import {
  appendAckLog,
  getPendingPath,
  listPending,
  readAllAckLogEntries,
} from '../../core/ack-log.js';
import type { AckEntry } from '../../core/ack-log.js';
import { applyMarkerAck } from '../../core/ack/marker-ack.js';

// ──────────────────────────────────────────────────────────────────────────────
// 内部 helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * getGitHead — 获取当前 git HEAD 提交 SHA
 * 与 archive.ts 中的模式一致:execFileSync + try/catch,非 git 返回 null
 * @param cwd 工作目录
 */
function getGitHead(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // 非 git 工作树或 git 不可用时静默返回 null
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// buildAckCommand — 导出顶层 ack 命令组
// ──────────────────────────────────────────────────────────────────────────────

/**
 * buildAckCommand — 构建含三个子命令的 ack 命令组
 * 模式与 archive.ts 的 buildXxxCommand() 一致
 */
export function buildAckCommand(): Command {
  const ack = new Command('ack').description('两步 user 确认协议:AI propose → User confirm/reject');

  // ──────────────────────────────────────────────────────────────────────────
  // 子命令 1: forge ack propose
  // ──────────────────────────────────────────────────────────────────────────

  ack
    .command('propose')
    .description('AI 写 pending ack 文件(需 user confirm 才生效)')
    .argument('<changeId>', 'change 目录 ID,如 add-login')
    .requiredOption('--finding <id>', 'finding id:`<number>` 或 `pause_decisions:<number>`')
    .requiredOption('--action <type>', 'ack 类型,如 ack-warning / ack-critical / resign-c-simcode')
    .option('--rationale <text>', 'AI 给出的 rationale(可选)')
    .option(
      '--target-severity <sev>',
      'resign-c-simcode action 专用 — 目标 severity (WARNING / SUGGESTION)',
    )
    .action(
      async (
        changeId: string,
        opts: {
          finding: string;
          action: string;
          rationale?: string;
          targetSeverity?: string;
        },
      ) => {
        // CI 模式检测:默认拒绝,防止 CI 自动绕过 user review
        if (process.env['CI'] === 'true') {
          process.stderr.write(
            'forge ack propose: CI mode rejected (set ack.allow_ci_mode=true to override)\n',
          );
          process.exit(2);
        }

        // --target-severity 对 downgrade 和 resign-c-simcode action 有意义,其他 action 时提示忽略(继续执行)
        if (
          opts.targetSeverity &&
          opts.action !== 'downgrade' &&
          opts.action !== 'resign-c-simcode'
        ) {
          process.stderr.write(
            'Warning: --target-severity only applies to action=downgrade or resign-c-simcode, ignored.\n',
          );
        }

        // 计算 changeRoot:相对于当前工作目录
        const changeRoot = resolve(process.cwd(), 'forge', 'changes', changeId);

        // 生成时间戳和 pending 文件路径
        const timestamp = new Date().toISOString();
        const pendingPath = getPendingPath(changeRoot, opts.finding, timestamp);

        // 构建 pending payload(YAML 格式,供 confirm/reject 读取)
        const payload = {
          kind: 'ack-propose',
          timestamp,
          change_id: changeId,
          finding_id: opts.finding,
          action: opts.action,
          rationale: opts.rationale ?? null,
          target_severity: opts.targetSeverity ?? null,
          proposed_by: 'ai-agent',
        };

        // 确保父目录存在(类似 ack-log.ts 中 mkdir recursive 模式)
        await mkdir(dirname(pendingPath), { recursive: true });

        // 写 YAML pending 文件
        await writeFile(pendingPath, stringifyYaml(payload), 'utf8');

        // 输出操作提示(stderr,不污染 stdout 管道)
        process.stderr.write(`AI proposed ack written to: ${pendingPath}\n`);
        process.stderr.write(
          `User must confirm via /forge:ack-confirm ${changeId} ${opts.finding}\n`,
        );
        process.stderr.write(`This pending file blocks archive until confirmed or rejected.\n`);

        // exit 1:有意义的信号 — AI 已写 pending,但需要 user 操作
        process.exit(1);
      },
    );

  // ──────────────────────────────────────────────────────────────────────────
  // 子命令 2: forge ack confirm
  // ──────────────────────────────────────────────────────────────────────────

  ack
    .command('confirm')
    .description('User 确认 AI 提议的 ack,写入 ack-log.jsonl 并删除 pending 文件')
    .argument('<changeId>', 'change 目录 ID')
    .argument('<findingId>', 'finding id:`<number>` 或 `pause_decisions:<number>`')
    .option(
      '--target-severity <sev>',
      '仅 resign-c-simcode action 必填;confirm 时 user 指定目标 severity 并写回 marker',
    )
    .action(async (changeId: string, findingId: string, opts: { targetSeverity?: string }) => {
      const changeRoot = resolve(process.cwd(), 'forge', 'changes', changeId);

      // 查找 pending 文件(按时间戳升序,取最新)
      const pending = await listPending(changeRoot, findingId);
      if (pending.length === 0) {
        process.stderr.write(`No pending ack for change ${changeId} finding ${findingId}\n`);
        process.exit(2);
      }

      // 多 pending 警告:同一 finding 存在多个 pending 时,提醒用户旧文件未清理
      if (pending.length > 1) {
        process.stderr.write(
          `Warning: ${pending.length} pending found, consuming latest; ${pending.length - 1} older pending(s) remain.\n`,
        );
      }

      // 取最新的 pending(数组升序,最后一项 = 最新)
      const latest = pending[pending.length - 1]!;

      // 读取并解析 pending YAML
      // YAML 损坏时 exit 2,避免与 propose 的 exit 1 语义混淆
      const rawYaml = await readFile(latest.path, 'utf8');
      let payload: {
        action: string;
        rationale?: string | null;
        timestamp: string;
        target_severity?: string | null;
      };
      try {
        payload = parseYaml(rawYaml) as {
          action: string;
          rationale?: string | null;
          timestamp: string;
          target_severity?: string | null;
        };
      } catch (e) {
        process.stderr.write(
          `Malformed pending YAML at ${latest.path}: ${e instanceof Error ? e.message : String(e)}\n`,
        );
        process.exit(2);
      }

      // 构建正式 AckEntry(写入 ack-log.jsonl)
      // Windows 兼容:process.env.USER 常为 undefined,用 USERNAME 做 fallback
      // target_severity 优先级:confirm --target-severity option > pending file 中的值
      const resolvedTargetSeverity = opts.targetSeverity ?? payload.target_severity ?? null;

      // v9 round 2 修(plan-9j code quality reviewer I-2):invalid 枚举值 fail-closed,避免 silent inconsistency
      // 非 null 且非合法枚举值(WARNING / SUGGESTION)→ exit 2 拒绝,而非静默把顶层设 undefined
      if (
        resolvedTargetSeverity !== null &&
        resolvedTargetSeverity !== 'WARNING' &&
        resolvedTargetSeverity !== 'SUGGESTION'
      ) {
        process.stderr.write(
          `forge ack confirm: invalid --target-severity "${resolvedTargetSeverity}" (must be WARNING or SUGGESTION)\n`,
        );
        process.exit(2);
      }

      // Task A2: marker ack 字段写入 — user/ackedAt 与 ack-log entry 共用同一值保证一致性
      const ackedAt = new Date().toISOString();
      const user = process.env['USER'] ?? process.env['USERNAME'] ?? 'unknown';
      const markerResult = await applyMarkerAck({
        changeDir: changeRoot,
        action: payload.action,
        findingId,
        user,
        ackedAt,
        rationale: payload.rationale ?? null,
        targetSeverity:
          resolvedTargetSeverity === 'WARNING' || resolvedTargetSeverity === 'SUGGESTION'
            ? resolvedTargetSeverity
            : null,
      });
      if (!markerResult.ok) {
        // marker 写失败(已自恢复) → 不 append ack-log,不删 pending,exit 2
        process.stderr.write(`forge ack confirm: ${markerResult.reason}\n`);
        process.exit(2);
      }

      const ackEntry: AckEntry = {
        schema: 'forge-ack-log/v1',
        kind: 'ack',
        timestamp: ackedAt,
        action: payload.action,
        change_id: changeId,
        finding_id: findingId,
        user,
        rationale: payload.rationale ?? null,
        git_head: getGitHead(changeRoot),
        finding_hash: markerResult.ackLogFindingHash,
        target_severity:
          resolvedTargetSeverity === 'WARNING' || resolvedTargetSeverity === 'SUGGESTION'
            ? resolvedTargetSeverity
            : undefined,
        extra: {
          proposed_at: payload.timestamp,
          // 保留 propose-time 原值用于审计;顶层 target_severity 已含 confirm-time --target-severity override 解析后值,reader 优先用顶层
          target_severity: payload.target_severity ?? null,
        },
      };

      // applyMarkerAck 返回 ok=true、ackEntry 构造完成后:
      // 幂等读 ack-log + appendAckLog 整体包进同一 rollback try/catch(Codex MAJOR-1)
      // 保证 readAllAckLogEntries 失败时也触发 rollback,不留 marker 已写的半状态
      try {
        const entries = await readAllAckLogEntries(changeRoot);
        const dup = entries.some(
          (e) =>
            e.kind === 'ack' &&
            e.change_id === changeId &&
            e.finding_id === findingId &&
            (e as { action?: string }).action === payload.action &&
            e.user === user &&
            e.finding_hash === ackEntry.finding_hash,
        );
        if (!dup) await appendAckLog(changeRoot, ackEntry); // 幂等:已存在同 entry 则跳过 append
      } catch (e) {
        // ack-log 读/写失败 → 尽力从 .bak 恢复所有已写 marker;保留 pending(retry 可重跑)
        // 收集 restore 失败,不让单个失败中断其余恢复;有未恢复项时输出清晰诊断
        const restoreErrors: string[] = [];
        for (const bak of markerResult.backups) {
          const marker = bak.replace(/\.bak$/, '');
          try {
            await copyFile(bak, marker);
          } catch (re) {
            restoreErrors.push(
              `${marker}(.bak: ${bak}): ${re instanceof Error ? re.message : String(re)}`,
            );
          }
        }
        if (restoreErrors.length > 0) {
          process.stderr.write(
            `forge ack confirm: ack-log 操作失败且 rollback incomplete —— 以下 marker 未恢复,` +
              `请手动用对应 .bak 还原: ${restoreErrors.join('; ')}\n`,
          );
        } else {
          process.stderr.write(
            `forge ack confirm: ack-log 操作失败,marker 已回滚: ${e instanceof Error ? e.message : String(e)}\n`,
          );
        }
        process.exit(1);
      }

      // 成功:先删 pending(它是「未完成」标记;marker+ack-log 已一致即可删)
      // ENOENT 视为幂等成功(pending 可能已被并发/外部清理);其他 unlink 错误 → exit 1
      // (pending 残留会被 archive pending fence 拒签,必须让用户知道)
      try {
        await unlink(latest.path);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
          process.stderr.write(
            `forge ack confirm: pending 文件删除失败(残留会被 archive 拒签,请手动清理 ${latest.path}): ` +
              `${e instanceof Error ? e.message : String(e)}\n`,
          );
          process.exit(1);
        }
        // ENOENT → pending 已不在,幂等成功,继续清理 .bak
      }

      // best-effort 清理 .bak(.bak 残留不影响 archive,清理失败不阻断)
      for (const bak of markerResult.backups) {
        try {
          await unlink(bak);
        } catch {
          /* .bak 清理失败吞错 —— 不阻断,marker+ack-log 已一致 */
        }
      }

      process.exit(0);
    });

  // ──────────────────────────────────────────────────────────────────────────
  // 子命令 3: forge ack reject
  // ──────────────────────────────────────────────────────────────────────────

  ack
    .command('reject')
    .description('User 拒绝 AI 提议的 ack,写入 reject 日志并删除 pending 文件')
    .argument('<changeId>', 'change 目录 ID')
    .argument('<findingId>', 'finding id:`<number>` 或 `pause_decisions:<number>`')
    .requiredOption('--rationale <text>', '拒绝理由(必填)')
    .action(async (changeId: string, findingId: string, opts: { rationale: string }) => {
      const changeRoot = resolve(process.cwd(), 'forge', 'changes', changeId);

      // 查找 pending 文件
      const pending = await listPending(changeRoot, findingId);
      if (pending.length === 0) {
        process.stderr.write(`No pending ack for change ${changeId} finding ${findingId}\n`);
        process.exit(2);
      }

      // 多 pending 警告:同一 finding 存在多个 pending 时,提醒用户旧文件未清理
      if (pending.length > 1) {
        process.stderr.write(
          `Warning: ${pending.length} pending found, consuming latest; ${pending.length - 1} older pending(s) remain.\n`,
        );
      }

      // 取最新 pending
      const latest = pending[pending.length - 1]!;

      // 读取 pending YAML(获取原 timestamp 等信息)
      // YAML 损坏时 exit 2,避免与 propose 的 exit 1 语义混淆
      const rawYaml = await readFile(latest.path, 'utf8');
      let payload: {
        timestamp: string;
        target_severity?: string | null;
      };
      try {
        payload = parseYaml(rawYaml) as {
          timestamp: string;
          target_severity?: string | null;
        };
      } catch (e) {
        process.stderr.write(
          `Malformed pending YAML at ${latest.path}: ${e instanceof Error ? e.message : String(e)}\n`,
        );
        process.exit(2);
      }

      // 构建 reject AckEntry
      const rejectEntry: AckEntry = {
        schema: 'forge-ack-log/v1',
        kind: 'ack',
        timestamp: new Date().toISOString(),
        action: 'reject',
        change_id: changeId,
        finding_id: findingId,
        user: process.env['USER'] ?? process.env['USERNAME'] ?? 'unknown',
        rationale: opts.rationale,
        git_head: getGitHead(changeRoot),
        finding_hash: null,
        extra: {
          proposed_at: payload.timestamp,
          target_severity: payload.target_severity ?? null,
        },
      };

      // 追加到 ack 日志
      await appendAckLog(changeRoot, rejectEntry);

      // 删除 pending 文件
      await unlink(latest.path);

      process.exit(0);
    });

  return ack;
}
