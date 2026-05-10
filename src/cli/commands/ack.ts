// forge ack 子命令 — §4 两步 user 确认协议
// 提供三个子命令:
//   forge ack propose <changeId> --finding <id> --action <type>  — AI 写 pending YAML
//   forge ack confirm <changeId> <findingId>                     — User 确认,转为正式 ack 日志
//   forge ack reject <changeId> <findingId> --rationale <text>   — User 拒绝,删 pending

import { Command } from 'commander';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { appendAckLog, getPendingPath, listPending } from '../../core/ack-log.js';
import type { AckEntry } from '../../core/ack-log.js';

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
    .requiredOption('--finding <id>', 'finding ID(数字字符串)')
    .requiredOption('--action <type>', 'ack 类型,如 ack-warning / ack-critical')
    .option('--rationale <text>', 'AI 给出的 rationale(可选)')
    .option('--target-severity <sev>', '目标 severity(可选,供审查参考)')
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
    .argument('<findingId>', 'finding ID(数字字符串)')
    .action(async (changeId: string, findingId: string) => {
      const changeRoot = resolve(process.cwd(), 'forge', 'changes', changeId);

      // 查找 pending 文件(按时间戳升序,取最新)
      const pending = await listPending(changeRoot, findingId);
      if (pending.length === 0) {
        process.stderr.write(`No pending ack for change ${changeId} finding ${findingId}\n`);
        process.exit(2);
      }

      // 取最新的 pending(数组升序,最后一项 = 最新)
      const latest = pending[pending.length - 1]!;

      // 读取并解析 pending YAML
      const rawYaml = await readFile(latest.path, 'utf8');
      const payload = parseYaml(rawYaml) as {
        action: string;
        rationale?: string | null;
        timestamp: string;
        target_severity?: string | null;
      };

      // 构建正式 AckEntry(写入 ack-log.jsonl)
      // Windows 兼容:process.env.USER 常为 undefined,用 USERNAME 做 fallback
      const ackEntry: AckEntry = {
        schema: 'forge-ack-log/v1',
        kind: 'ack',
        timestamp: new Date().toISOString(),
        action: payload.action,
        change_id: changeId,
        finding_id: findingId,
        user: process.env['USER'] ?? process.env['USERNAME'] ?? 'unknown',
        rationale: payload.rationale ?? null,
        git_head: getGitHead(changeRoot),
        finding_hash: null,
        extra: {
          proposed_at: payload.timestamp,
          target_severity: payload.target_severity ?? null,
        },
      };

      // 追加到 ack 日志
      await appendAckLog(changeRoot, ackEntry);

      // 删除 pending 文件(confirm 消费后不再需要)
      await unlink(latest.path);

      process.exit(0);
    });

  // ──────────────────────────────────────────────────────────────────────────
  // 子命令 3: forge ack reject
  // ──────────────────────────────────────────────────────────────────────────

  ack
    .command('reject')
    .description('User 拒绝 AI 提议的 ack,写入 reject 日志并删除 pending 文件')
    .argument('<changeId>', 'change 目录 ID')
    .argument('<findingId>', 'finding ID(数字字符串)')
    .requiredOption('--rationale <text>', '拒绝理由(必填)')
    .action(async (changeId: string, findingId: string, opts: { rationale: string }) => {
      const changeRoot = resolve(process.cwd(), 'forge', 'changes', changeId);

      // 查找 pending 文件
      const pending = await listPending(changeRoot, findingId);
      if (pending.length === 0) {
        process.stderr.write(`No pending ack for change ${changeId} finding ${findingId}\n`);
        process.exit(2);
      }

      // 取最新 pending
      const latest = pending[pending.length - 1]!;

      // 读取 pending YAML(获取原 timestamp 等信息)
      const rawYaml = await readFile(latest.path, 'utf8');
      const payload = parseYaml(rawYaml) as {
        timestamp: string;
        target_severity?: string | null;
      };

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
