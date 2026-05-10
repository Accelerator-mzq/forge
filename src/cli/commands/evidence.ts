// forge evidence 子命令 — plan-9a Task 5
// 提供三个 evidence helper 子命令:
//   forge evidence record-tdd <changeId> --task <ref> --red-commit <sha> --green-commit <sha>
//   forge evidence record-verify <changeId> --task-refs <list> --scope <type> --report <path>
//   forge evidence record-review <changeId> --task <ref> --implementer-commit <sha>
//
// 每个子命令计算 payload 的 JCS canonical hash,追加一条 EvidenceHelperEntry 到 ack-log.jsonl。
// marker 写入留给 Task 9g 实现,本文件仅做日志记录。

import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { appendAckLog } from '../../core/ack-log.js';
import type { EvidenceHelperEntry } from '../../core/ack-log.js';
import { canonicalHash } from '../../core/canonical-json.js';

// ──────────────────────────────────────────────────────────────────────────────
// 内部 helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * getGitHead — 获取当前 git HEAD 提交 SHA。
 * 与 ack.ts 中的模式一致:execFileSync + try/catch,非 git 仓库返回 null。
 * @param cwd 工作目录(change 根目录)
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
// buildEvidenceCommand — 导出顶层 evidence 命令组
// ──────────────────────────────────────────────────────────────────────────────

/**
 * buildEvidenceCommand — 构建含三个子命令的 evidence 命令组。
 * 模式与 buildAckCommand() 一致:返回 Command 对象,由 index.ts 通过 addCommand() 注册。
 */
export function buildEvidenceCommand(): Command {
  const evidence = new Command('evidence').description(
    'Evidence helper 子命令:记录 TDD / verify / review 事件到 ack-log.jsonl',
  );

  // ────────────────────────────────────────────────────────────────────────────
  // 子命令 1: forge evidence record-tdd
  // ────────────────────────────────────────────────────────────────────────────

  evidence
    .command('record-tdd')
    .description('记录 TDD red→green 事件:写 payload hash 到 ack-log.jsonl')
    .argument('<changeId>', 'change 目录 ID,如 add-login')
    .requiredOption('--task <task-ref>', 'task 引用,如 tasks.md#task-1')
    .requiredOption('--red-commit <sha>', 'failing test(红) 提交 SHA')
    .requiredOption('--green-commit <sha>', 'passing test(绿) 提交 SHA')
    .option('--expected-failures <json>', '预期失败列表,JSON 数组格式,如 ["test-a"]')
    .action(
      async (
        changeId: string,
        opts: {
          task: string;
          redCommit: string;
          greenCommit: string;
          expectedFailures?: string;
        },
      ) => {
        // 计算 changeRoot:相对于当前工作目录
        const changeRoot = resolve(process.cwd(), 'forge', 'changes', changeId);

        // 构建用于哈希计算的 payload 对象(不是 marker,仅用于内容寻址)
        // TODO(9g): write process_evidence.tdd_event_chain[i] to marker
        const payload = {
          helper: 'record-tdd',
          change_id: changeId,
          task_ref: opts.task,
          red_commit: opts.redCommit,
          green_commit: opts.greenCommit,
          // --expected-failures 是可选 JSON 字符串,缺省时为空数组
          expected_failures: opts.expectedFailures ? JSON.parse(opts.expectedFailures) : [],
        };

        // 使用 JCS canonical hash 确保跨平台确定性
        const payloadHash = canonicalHash(payload);

        // 构建 EvidenceHelperEntry 并追加到 ack-log.jsonl
        const entry: EvidenceHelperEntry = {
          schema: 'forge-ack-log/v1',
          kind: 'evidence-helper',
          timestamp: new Date().toISOString(),
          helper_name: 'record-tdd',
          change_id: changeId,
          task_ref: opts.task,
          payload_hash: payloadHash,
          status: 'success',
          git_head: getGitHead(changeRoot),
          extra: payload,
        };

        await appendAckLog(changeRoot, entry);

        process.exit(0);
      },
    );

  // ────────────────────────────────────────────────────────────────────────────
  // 子命令 2: forge evidence record-verify
  // ────────────────────────────────────────────────────────────────────────────

  evidence
    .command('record-verify')
    .description('记录 verify 报告事件:写 payload hash 到 ack-log.jsonl')
    .argument('<changeId>', 'change 目录 ID')
    .requiredOption(
      '--task-refs <list>',
      'task 引用列表,逗号分隔,如 tasks.md#task-1,tasks.md#task-2',
    )
    .requiredOption('--scope <type>', 'verify 范围:per-task(每 task)或 change-level(整个 change)')
    .requiredOption('--report <path>', 'verify 报告文件路径(9g 负责校验文件存在性)')
    .action(
      async (
        changeId: string,
        opts: {
          taskRefs: string;
          scope: string;
          report: string;
        },
      ) => {
        // 验证 scope 取值:仅允许 per-task 或 change-level
        const validScopes = ['per-task', 'change-level'] as const;
        if (!validScopes.includes(opts.scope as (typeof validScopes)[number])) {
          process.stderr.write(
            `forge evidence record-verify: invalid --scope "${opts.scope}". ` +
              `Allowed values: per-task, change-level\n`,
          );
          process.exit(2);
        }

        const changeRoot = resolve(process.cwd(), 'forge', 'changes', changeId);

        // 解析逗号分隔的 task-refs 列表
        const taskRefList = opts.taskRefs
          .split(',')
          .map((r) => r.trim())
          .filter((r) => r.length > 0);

        // 构建 payload
        // TODO(9g): write process_evidence.verify_event to marker
        const payload = {
          helper: 'record-verify',
          change_id: changeId,
          task_refs: taskRefList,
          scope: opts.scope,
          report: opts.report,
        };

        const payloadHash = canonicalHash(payload);

        // task_ref 字段存储原始 --task-refs 字符串(原始形式,9g 负责深层解析)
        const entry: EvidenceHelperEntry = {
          schema: 'forge-ack-log/v1',
          kind: 'evidence-helper',
          timestamp: new Date().toISOString(),
          helper_name: 'record-verify',
          change_id: changeId,
          task_ref: opts.taskRefs,
          payload_hash: payloadHash,
          status: 'success',
          git_head: getGitHead(changeRoot),
          extra: payload,
        };

        await appendAckLog(changeRoot, entry);

        process.exit(0);
      },
    );

  // ────────────────────────────────────────────────────────────────────────────
  // 子命令 3: forge evidence record-review
  // ────────────────────────────────────────────────────────────────────────────

  evidence
    .command('record-review')
    .description('记录 code review 事件:写 payload hash 到 ack-log.jsonl')
    .argument('<changeId>', 'change 目录 ID')
    .requiredOption('--task <task-ref>', 'task 引用,如 tasks.md#task-5')
    .requiredOption('--implementer-commit <sha>', 'implementer 最终提交 SHA')
    .option(
      '--spec-iteration <iter>',
      'spec review 迭代,格式 <commit>:<outcome>:<notes-path>(可选)',
    )
    .option(
      '--quality-iteration <iter>',
      'quality review 迭代,格式 <commit>:<outcome>:<notes-path>(可选)',
    )
    .action(
      async (
        changeId: string,
        opts: {
          task: string;
          implementerCommit: string;
          specIteration?: string;
          qualityIteration?: string;
        },
      ) => {
        const changeRoot = resolve(process.cwd(), 'forge', 'changes', changeId);

        // 构建 payload
        // TODO(9g): write process_evidence.review_event to marker
        const payload = {
          helper: 'record-review',
          change_id: changeId,
          task_ref: opts.task,
          implementer_commit: opts.implementerCommit,
          spec_iteration: opts.specIteration ?? null,
          quality_iteration: opts.qualityIteration ?? null,
        };

        const payloadHash = canonicalHash(payload);

        const entry: EvidenceHelperEntry = {
          schema: 'forge-ack-log/v1',
          kind: 'evidence-helper',
          timestamp: new Date().toISOString(),
          helper_name: 'record-review',
          change_id: changeId,
          task_ref: opts.task,
          payload_hash: payloadHash,
          status: 'success',
          git_head: getGitHead(changeRoot),
          extra: payload,
        };

        await appendAckLog(changeRoot, entry);

        process.exit(0);
      },
    );

  return evidence;
}
