// src/cli/commands/pause-capture.ts — `forge pause-capture` 子命令(plan pause-fence Block C)
// Fluid Pause 触发时主代理调:读 tasks.md 解析 task id,写 pause-capture entry 进 ack-log
// hash-chain(锁内 append),stdout 输出 capture_id。沿 design §6.1。

import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { parseTasks } from '../../core/parse/tasks.js';
import { appendAckLog, type PauseCaptureEntry } from '../../core/ack-log.js';
import { acquireStagingLock } from '../../core/staging-lock.js';

const execFileAsync = promisify(execFile);

/** runPauseCapture 入参 */
export interface PauseCaptureArgs {
  /** 项目根(forge/changes/ 的父目录;CLI action 传 process.cwd()) */
  cwd: string;
  changeId: string;
  /** 触发 pause 的 task,如 tasks.md#task-3 */
  task: string;
  /** subagent 报告的 issue 一句概括 */
  issue: string;
}

/** runPauseCapture 结果 */
export interface PauseCaptureResult {
  captureId: string;
  timestamp: string;
}

/**
 * pause-capture 核心逻辑:读 tasks.md → 解析 task id → 锁内 append pause-capture entry。
 * 与 CLI action 分离,便于单测。
 */
export async function runPauseCapture(args: PauseCaptureArgs): Promise<PauseCaptureResult> {
  const changeRoot = join(args.cwd, 'forge', 'changes', args.changeId);
  const tasksPath = join(changeRoot, 'tasks.md');
  // 检查 tasks.md 是否存在
  if (!existsSync(tasksPath)) {
    throw new Error(`pause-capture 失败:tasks.md 不存在(${tasksPath})`);
  }
  const tasksContent = await readFile(tasksPath, 'utf8');
  // 解析 tasks.md 获取全部 task id
  const taskIds = parseTasks(tasksContent).items.map((t) => t.id);

  // git HEAD(非 git 仓库 → null)
  let gitHead: string | null = null;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: args.cwd });
    gitHead = stdout.trim();
  } catch {
    gitHead = null;
  }

  const captureId = randomUUID();
  const timestamp = new Date().toISOString();
  const entry: PauseCaptureEntry = {
    schema: 'forge-ack-log/v1',
    kind: 'pause-capture',
    timestamp,
    capture_id: captureId,
    change_id: args.changeId,
    task_ref: args.task,
    pause_issue_summary: args.issue,
    tasks_md_task_ids: taskIds,
    git_head: gitHead,
    extra: {},
  };

  // 在 ack-log 级共享锁内 append(沿 design §6.1 + evidence.ts C5 模式 — 避免与 evidence helper 并发链断 race)
  const release = await acquireStagingLock(changeRoot);
  try {
    await appendAckLog(changeRoot, entry);
  } finally {
    await release();
  }
  return { captureId, timestamp };
}

/** 构造 `forge pause-capture` 子命令 */
export function buildPauseCaptureCommand(): Command {
  return new Command('pause-capture')
    .description('Fluid Pause 触发时捕获 tasks.md 状态进 ack-log hash-chain(option=2 用)')
    .argument('<changeId>', 'change 目录 ID')
    .requiredOption('--task <ref>', '触发 pause 的 task 引用,如 tasks.md#task-3')
    .requiredOption('--issue <summary>', 'subagent 报告的 issue 一句概括')
    .action(async (changeId: string, opts: { task: string; issue: string }) => {
      try {
        const result = await runPauseCapture({
          cwd: process.cwd(),
          changeId,
          task: opts.task,
          issue: opts.issue,
        });
        // stdout 输出 capture_id(主代理写进 pause_decision.capture_id)+ timestamp
        process.stdout.write(`${result.captureId}\t${result.timestamp}\n`);
        process.exit(0);
      } catch (err) {
        console.error(`✗ ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
