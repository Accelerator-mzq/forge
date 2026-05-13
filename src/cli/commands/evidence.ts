// forge evidence 子命令 — plan-9a Task 5 + plan-9g Task 3.3 扩展
// 提供三个 evidence helper 子命令:
//   forge evidence record-tdd <changeId> --task <ref> --red-commit <sha> --green-commit <sha> [+14 new options]
//   forge evidence record-verify <changeId> --task-refs <list> --scope <type> --report <path> [+6 new options]
//   forge evidence record-review <changeId> --task <ref> --implementer-commit <sha> [+3 new options]
//
// plan-9g Task 3.3 扩展:
//   - 三 helper 各加新 commander options(沿 plan §4.3.0 字段映射表)
//   - 三 helper 内部新增 staging.yaml 写入路径(acquireStagingLock wrapper)
//   - 同时仍调 appendAckLog(已扩 prev_entry_hash 链)
//
// Observation(plan §4.3.0 表 vs 行 2906 数字差异):
//   - record-tdd 按表实际新增 14 项(超 plan 行 2906 "+12" 字面;含 tdd-exemption/tdd-exemption-acked-by)
//   - record-verify 按表实际新增 6 项(超 plan 行 2907 "+5";含 v6 修订 --result)
//   - record-review 按表实际新增 3 项(--spec-iterations/--quality-iterations rename + --main-check-off-at)
//   按表对齐 master spec 字段名严格

import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stringify, parse } from 'yaml';
import { appendAckLog, readAllAckLogEntries } from '../../core/ack-log.js';
import type { EvidenceHelperEntry } from '../../core/ack-log.js';
import { canonicalHash } from '../../core/canonical-json.js';
import { acquireStagingLock } from '../../core/staging-lock.js';
import type {
  ProcessEvidence,
  TddEventChain,
  VerifyInvocation,
  SubagentReviewChain,
  EnvHash,
  TddExemption,
  ExpectedFailure,
  ReviewIteration,
} from '../../core/schemas/process-evidence.js';
import type { VerifyFinding } from '../../core/markers/types.js';
import { computeFreezeWarnings } from '../../core/process-evidence-freeze-warnings.js';

// ──────────────────────────────────────────────────────────────────────────────
// staging.yaml 路径
// ──────────────────────────────────────────────────────────────────────────────

/** staging.yaml 相对于 changeRoot 的路径(plan §4 行 5 字面) */
const STAGING_YAML_REL = '.evidence/process-evidence.staging.yaml';

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

/**
 * computeEnvHash — 计算环境三因子(plan §4.3.0 行 2897-2900)
 * 在 record-tdd 第一次写 staging 时调用
 * @param changeRoot change 根目录
 */
function computeEnvHash(changeRoot: string): EnvHash {
  // 查找 pnpm-lock.yaml 或 package-lock.json(从 changeRoot 向上到项目根)
  // 实际项目锁文件通常在 repo 根,非 change 目录;从 cwd 找
  const candidates = [
    join(process.cwd(), 'pnpm-lock.yaml'),
    join(process.cwd(), 'package-lock.json'),
    join(changeRoot, 'pnpm-lock.yaml'),
    join(changeRoot, 'package-lock.json'),
  ];
  let lockfileHash = 'none';
  for (const c of candidates) {
    if (existsSync(c)) {
      const content = readFileSync(c);
      lockfileHash = createHash('sha256').update(content).digest('hex');
      break;
    }
  }
  return {
    lockfile_hash: lockfileHash,
    node_version: process.version.slice(1), // 去掉前缀 'v'
    os_platform: process.platform as 'win32' | 'darwin' | 'linux',
  };
}

/**
 * readStagingYaml — 读取 staging.yaml,不存在时返回 null(新建)
 */
async function readStagingYaml(changeRoot: string): Promise<ProcessEvidence | null> {
  const stagingPath = join(changeRoot, STAGING_YAML_REL);
  if (!existsSync(stagingPath)) return null;
  const content = await readFile(stagingPath, 'utf8');
  return parse(content) as ProcessEvidence;
}

/**
 * writeStagingYaml — 覆写 staging.yaml(重算 staging_hash 写入)
 * staging_hash = canonicalHash(ProcessEvidence struct)(plan §4.3 留白展开)
 *
 * round 2 fix (I2):改原子写 — 先写 .tmp,再 rename 到目标
 * 沿 plan-9e1 transaction.ts atomic 模式
 * POSIX 平台 rename 是 atomic;NTFS 是 near-atomic
 * 中途崩溃(磁盘满 / SIGKILL)→ staging.yaml 不会半写损坏
 */
async function writeStagingYaml(changeRoot: string, data: ProcessEvidence): Promise<void> {
  const evidenceDir = join(changeRoot, '.evidence');
  await mkdir(evidenceDir, { recursive: true });
  const stagingPath = join(changeRoot, STAGING_YAML_REL);
  // staging_hash:对完整 ProcessEvidence struct 做 canonicalHash
  const stagingHash = canonicalHash(data);
  // 写入时附加 staging_hash 顶级字段(额外信封字段,不影响 schema)
  const withHash = { ...data, staging_hash: stagingHash };
  // round 2 (I2):原子写 — tmp + rename
  const tmpPath = stagingPath + '.tmp';
  await writeFile(tmpPath, stringify(withHash), 'utf8');
  await rename(tmpPath, stagingPath);
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
    'Evidence helper 子命令:记录 TDD / verify / review 事件到 ack-log.jsonl + staging.yaml',
  );

  // ────────────────────────────────────────────────────────────────────────────
  // 子命令 1: forge evidence record-tdd
  // plan-9g Task 3.3:+14 新 options(按 plan §4.3.0 表;超 plan 行 2906 "+12" 字面)
  // ────────────────────────────────────────────────────────────────────────────

  evidence
    .command('record-tdd')
    .description('记录 TDD red→green 事件:写 payload hash 到 ack-log.jsonl + staging.yaml')
    .argument('<changeId>', 'change 目录 ID,如 add-login')
    .requiredOption('--task <task-ref>', 'task 引用,如 tasks.md#task-1')
    // round 2 fix (I3):--red-commit 改 optional,以兼容 schema TddEventChain.red_commit | null
    // 验证:若 !tddExemption && !redCommit → exit 2(在 action 内显式检查)
    .option('--red-commit <sha>', 'failing test(红) 提交 SHA;tdd_exemption 非空时可省')
    .requiredOption('--green-commit <sha>', 'passing test(绿) 提交 SHA')
    .option('--expected-failures <json>', '预期失败列表,JSON 数组格式,如 ["test-a"]')
    // plan-9g Task 3.3 新增 options(red 系列 — 沿 plan §4.3.0 表)
    .option('--red-timestamp <iso>', 'RED commit 时间戳(ISO 8601 UTC)')
    .option('--red-log <path>', 'RED plain log 路径')
    .option('--red-log-hash <sha256>', 'sha256(RED log content)')
    .option('--red-report <path>', 'RED runner 报告路径(JUnit XML / TAP / Vitest JSON)')
    .option('--red-report-hash <sha256>', 'sha256(RED runner report content)')
    .option('--red-exit <int>', 'RED 阶段进程 exit code(必 != 0)')
    // plan-9g Task 3.3 新增 options(green 系列 — 沿 plan §4.3.0 表)
    .option('--green-timestamp <iso>', 'GREEN commit 时间戳(ISO 8601 UTC)')
    .option('--green-log <path>', 'GREEN plain log 路径')
    .option('--green-log-hash <sha256>', 'sha256(GREEN log content)')
    .option('--green-report <path>', 'GREEN runner 报告路径')
    .option('--green-report-hash <sha256>', 'sha256(GREEN runner report content)')
    .option('--green-exit <int>', 'GREEN 阶段进程 exit code(必 == 0)')
    // plan-9g Task 3.3 新增 options(顶级 + 免 RED — 沿 plan §4.3.0 表)
    .option('--mode <full|sample|hash-only>', 'process_verification_mode(顶级字段;默认 full)')
    .option('--tdd-exemption <json>', 'TDD 免 RED JSON 对象(light-mode-trivial)')
    .option(
      '--tdd-exemption-acked-by <user>',
      'tdd_exemption ack-log 中对应 acked_by user(v6 Codex 修订)',
    )
    .action(
      async (
        changeId: string,
        opts: {
          task: string;
          // round 2 fix (I3):redCommit 改 optional 配合 schema
          redCommit?: string;
          greenCommit: string;
          expectedFailures?: string;
          redTimestamp?: string;
          redLog?: string;
          redLogHash?: string;
          redReport?: string;
          redReportHash?: string;
          redExit?: string;
          greenTimestamp?: string;
          greenLog?: string;
          greenLogHash?: string;
          greenReport?: string;
          greenReportHash?: string;
          greenExit?: string;
          mode?: string;
          tddExemption?: string;
          tddExemptionAckedBy?: string;
        },
      ) => {
        const changeRoot = resolve(process.cwd(), 'forge', 'changes', changeId);

        // 解析可选 --expected-failures(JSON 字符串)
        let expectedFailures: unknown[] = [];
        if (opts.expectedFailures) {
          try {
            expectedFailures = JSON.parse(opts.expectedFailures) as unknown[];
          } catch (e) {
            process.stderr.write(
              `Invalid --expected-failures JSON: ${e instanceof Error ? e.message : String(e)}\n`,
            );
            process.exit(2);
          }
        }

        // 解析可选 --tdd-exemption(JSON 对象)
        let tddExemption: TddExemption | null = null;
        if (opts.tddExemption) {
          try {
            tddExemption = JSON.parse(opts.tddExemption) as TddExemption;
          } catch (e) {
            process.stderr.write(
              `Invalid --tdd-exemption JSON: ${e instanceof Error ? e.message : String(e)}\n`,
            );
            process.exit(2);
          }
        }

        // round 2 fix (I3):--red-commit 必填校验
        // 仅当 tdd_exemption 非空时可省;否则必须提供 --red-commit
        if (!tddExemption && !opts.redCommit) {
          process.stderr.write(
            `forge evidence record-tdd: --red-commit is required unless --tdd-exemption is provided\n`,
          );
          process.exit(2);
        }

        // 构建 payload extra 对象(沿 plan §4.3.0 表 "写入 ack-log entry.extra 字段" 列)
        // round 2 fix (I3):tddExemption 非空时 red_commit 设 null(沿 schema)
        const payload = {
          helper: 'record-tdd',
          change_id: changeId,
          task_ref: opts.task,
          red_commit: tddExemption
            ? null
            : {
                sha: opts.redCommit!,
                timestamp: opts.redTimestamp ?? null,
                red_log_path: opts.redLog ?? null,
                red_log_hash: opts.redLogHash ?? null,
                runner_report_path: opts.redReport ?? null,
                runner_report_hash: opts.redReportHash ?? null,
                exit_code: opts.redExit !== undefined ? parseInt(opts.redExit, 10) : null,
                expected_failures: expectedFailures,
              },
          green_commit: {
            sha: opts.greenCommit,
            timestamp: opts.greenTimestamp ?? null,
            green_log_path: opts.greenLog ?? null,
            green_log_hash: opts.greenLogHash ?? null,
            runner_report_path: opts.greenReport ?? null,
            runner_report_hash: opts.greenReportHash ?? null,
            exit_code: opts.greenExit !== undefined ? parseInt(opts.greenExit, 10) : null,
          },
          mode: opts.mode ?? null,
          tdd_exemption: tddExemption,
          tdd_exemption_acked_by: opts.tddExemptionAckedBy ?? null,
        };

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

        // plan-9g Task 3.3:staging.yaml 写入(acquireStagingLock wrapper)
        const release = await acquireStagingLock(changeRoot);
        try {
          const existing = await readStagingYaml(changeRoot);
          const mode = (opts.mode as ProcessEvidence['process_verification_mode']) ?? 'full';
          const staging: ProcessEvidence = existing ?? {
            schema: 'forge-process-evidence/v1',
            process_verification_mode: mode,
            process_verification_mode_acked_by: null,
            process_verification_mode_acked_at: null,
            // 第一次写 staging 时自动检测 env_hash(plan §4.3.0 行 2897-2900)
            env_hash: computeEnvHash(changeRoot),
            tdd_event_chain: [],
            verify_invocations: [],
            subagent_review_chain: [],
          };
          // 若已存在且 mode 参数变化,更新顶级 mode
          if (opts.mode) {
            staging.process_verification_mode = mode;
          }

          // 构建 TddEventChain 条目(沿 plan §4.3.0 表 "写入 staging.yaml 字段" 列)
          // round 2 fix (I3):tddExemption 非空时 red_commit = null(schema TddEventChain.red_commit | null)
          const tddEntry: TddEventChain = {
            task_ref: opts.task,
            red_commit: tddExemption
              ? null
              : {
                  sha: opts.redCommit!,
                  timestamp: opts.redTimestamp ?? new Date().toISOString(),
                  red_log_path: opts.redLog ?? '',
                  red_log_hash: opts.redLogHash ?? '',
                  exit_code: opts.redExit !== undefined ? parseInt(opts.redExit, 10) : -1,
                  runner_report_path: opts.redReport ?? '',
                  runner_report_hash: opts.redReportHash ?? '',
                  expected_failures: expectedFailures as ExpectedFailure[],
                },
            green_commit: {
              sha: opts.greenCommit,
              timestamp: opts.greenTimestamp ?? new Date().toISOString(),
              green_log_path: opts.greenLog ?? '',
              green_log_hash: opts.greenLogHash ?? '',
              exit_code: opts.greenExit !== undefined ? parseInt(opts.greenExit, 10) : 0,
              runner_report_path: opts.greenReport ?? '',
              runner_report_hash: opts.greenReportHash ?? '',
            },
            tdd_exemption: tddExemption,
            tdd_exemption_acked_by: opts.tddExemptionAckedBy ?? null,
          };

          staging.tdd_event_chain.push(tddEntry);
          await writeStagingYaml(changeRoot, staging);
          // round 2 fix (C5):appendAckLog 移入 lock 内防并发链断 race
          // 否则 staging release 与 ack-log 读 last entry 之间存在 race window,
          // 双进程可能读到同一 last 写入相同 prev_entry_hash → 链断
          await appendAckLog(changeRoot, entry);
        } finally {
          await release();
        }

        process.exit(0);
      },
    );

  // ────────────────────────────────────────────────────────────────────────────
  // 子命令 2: forge evidence record-verify
  // plan-9g Task 3.3:+6 新 options(按 plan §4.3.0 表;超 plan 行 2907 "+5" 字面,含 v6 修订 --result)
  // ────────────────────────────────────────────────────────────────────────────

  evidence
    .command('record-verify')
    .description('记录 verify 报告事件:写 payload hash 到 ack-log.jsonl + staging.yaml')
    .argument('<changeId>', 'change 目录 ID')
    .requiredOption(
      '--task-refs <list>',
      'task 引用列表,逗号分隔,如 tasks.md#task-1,tasks.md#task-2',
    )
    .requiredOption('--scope <type>', 'verify 范围:per-task(每 task)或 change-level(整个 change)')
    .requiredOption('--report <path>', 'verify 报告文件路径')
    // plan-9g Task 3.3 新增 options(沿 plan §4.3.0 表)
    .option('--result <pass|fail|skip>', 'verify 结果(v6 修订 Codex 七轮 MAJOR)')
    .option('--report-hash <sha256>', 'sha256(verify runner report content)')
    .option('--log <path>', 'verify plain log 路径')
    .option('--log-hash <sha256>', 'sha256(verify log content)')
    .option('--exit-code <int>', 'verify 进程 exit code')
    .option('--invoked-at <iso>', 'verify 命令调用时间戳(ISO 8601 UTC)')
    .action(
      async (
        changeId: string,
        opts: {
          taskRefs: string;
          scope: string;
          report: string;
          result?: string;
          reportHash?: string;
          log?: string;
          logHash?: string;
          exitCode?: string;
          invokedAt?: string;
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

        // 构建 payload extra 对象(沿 plan §4.3.0 表 "写入 ack-log entry.extra 字段" 列)
        const payload = {
          helper: 'record-verify',
          change_id: changeId,
          task_refs: taskRefList,
          verify_scope: opts.scope,
          runner_report_path: opts.report,
          result: opts.result ?? null,
          runner_report_hash: opts.reportHash ?? null,
          log_path: opts.log ?? null,
          log_hash: opts.logHash ?? null,
          exit_code: opts.exitCode !== undefined ? parseInt(opts.exitCode, 10) : null,
          invoked_at: opts.invokedAt ?? null,
        };

        const payloadHash = canonicalHash(payload);

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

        // plan-9g Task 3.3:staging.yaml 写入
        const release = await acquireStagingLock(changeRoot);
        try {
          const existing = await readStagingYaml(changeRoot);
          const staging: ProcessEvidence = existing ?? {
            schema: 'forge-process-evidence/v1',
            process_verification_mode: 'full',
            process_verification_mode_acked_by: null,
            process_verification_mode_acked_at: null,
            env_hash: computeEnvHash(changeRoot),
            tdd_event_chain: [],
            verify_invocations: [],
            subagent_review_chain: [],
          };

          // 构建 VerifyInvocation 条目(沿 plan §4.3.0 表 "写入 staging.yaml 字段" 列)
          const verifyEntry: VerifyInvocation = {
            invoked_at: opts.invokedAt ?? new Date().toISOString(),
            task_refs: taskRefList,
            verify_scope: opts.scope as 'per-task' | 'change-level',
            result: (opts.result as 'pass' | 'fail' | 'skip') ?? 'pass',
            exit_code: opts.exitCode !== undefined ? parseInt(opts.exitCode, 10) : 0,
            log_path: opts.log ?? '',
            log_hash: opts.logHash ?? '',
            runner_report_path: opts.report,
            runner_report_hash: opts.reportHash ?? '',
          };

          staging.verify_invocations.push(verifyEntry);
          await writeStagingYaml(changeRoot, staging);
          // round 2 fix (C5):appendAckLog 移入 lock 内防并发链断 race
          await appendAckLog(changeRoot, entry);
        } finally {
          await release();
        }

        process.exit(0);
      },
    );

  // ────────────────────────────────────────────────────────────────────────────
  // 子命令 3: forge evidence record-review
  // plan-9g Task 3.3:+3 new options(按 plan §4.3.0 表;--spec-iterations/--quality-iterations rename)
  // ────────────────────────────────────────────────────────────────────────────

  evidence
    .command('record-review')
    .description('记录 code review 事件:写 payload hash 到 ack-log.jsonl + staging.yaml')
    .argument('<changeId>', 'change 目录 ID')
    .requiredOption('--task <task-ref>', 'task 引用,如 tasks.md#task-5')
    .requiredOption('--implementer-commit <sha>', 'implementer 最终提交 SHA')
    // plan-9g Task 3.3:--spec-iterations(rename from --spec-iteration;JSON array 格式)
    .option(
      '--spec-iterations <json>',
      'spec review 迭代 JSON 数组,[{reviewer_commit,outcome,notes_log_path},...](v6 修订,rename from --spec-iteration)',
    )
    // plan-9g Task 3.3:--quality-iterations(rename from --quality-iteration;JSON array 格式)
    .option(
      '--quality-iterations <json>',
      'quality review 迭代 JSON 数组,[{reviewer_commit,outcome,notes_log_path},...](v6 修订,rename from --quality-iteration)',
    )
    // plan-9g Task 3.3:--main-check-off-at 新增
    .option('--main-check-off-at <iso>', '主代理 check-off 时间戳(ISO 8601 UTC)')
    .action(
      async (
        changeId: string,
        opts: {
          task: string;
          implementerCommit: string;
          specIterations?: string;
          qualityIterations?: string;
          mainCheckOffAt?: string;
        },
      ) => {
        const changeRoot = resolve(process.cwd(), 'forge', 'changes', changeId);

        // 解析 --spec-iterations JSON 数组
        let specIterations: unknown[] = [];
        if (opts.specIterations) {
          try {
            specIterations = JSON.parse(opts.specIterations) as unknown[];
          } catch (e) {
            process.stderr.write(
              `Invalid --spec-iterations JSON: ${e instanceof Error ? e.message : String(e)}\n`,
            );
            process.exit(2);
          }
        }

        // 解析 --quality-iterations JSON 数组
        let qualityIterations: unknown[] = [];
        if (opts.qualityIterations) {
          try {
            qualityIterations = JSON.parse(opts.qualityIterations) as unknown[];
          } catch (e) {
            process.stderr.write(
              `Invalid --quality-iterations JSON: ${e instanceof Error ? e.message : String(e)}\n`,
            );
            process.exit(2);
          }
        }

        // 构建 payload extra 对象(沿 plan §4.3.0 表)
        const payload = {
          helper: 'record-review',
          change_id: changeId,
          task_ref: opts.task,
          implementer_commit: opts.implementerCommit,
          spec_iterations: specIterations,
          quality_iterations: qualityIterations,
          main_check_off_at: opts.mainCheckOffAt ?? null,
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

        // plan-9g Task 3.3:staging.yaml 写入
        const release = await acquireStagingLock(changeRoot);
        try {
          const existing = await readStagingYaml(changeRoot);
          const staging: ProcessEvidence = existing ?? {
            schema: 'forge-process-evidence/v1',
            process_verification_mode: 'full',
            process_verification_mode_acked_by: null,
            process_verification_mode_acked_at: null,
            env_hash: computeEnvHash(changeRoot),
            tdd_event_chain: [],
            verify_invocations: [],
            subagent_review_chain: [],
          };

          // 构建 SubagentReviewChain 条目(沿 plan §4.3.0 表 "写入 staging.yaml 字段" 列)
          const reviewEntry: SubagentReviewChain = {
            task_ref: opts.task,
            implementer_commit: opts.implementerCommit,
            spec_reviewer_iterations: specIterations as ReviewIteration[],
            quality_reviewer_iterations: qualityIterations as ReviewIteration[],
            main_agent_check_off_at: opts.mainCheckOffAt ?? new Date().toISOString(),
          };

          staging.subagent_review_chain.push(reviewEntry);
          await writeStagingYaml(changeRoot, staging);
          // round 2 fix (C5):appendAckLog 移入 lock 内防并发链断 race
          await appendAckLog(changeRoot, entry);
        } finally {
          await release();
        }

        process.exit(0);
      },
    );

  // ────────────────────────────────────────────────────────────────────────────
  // 子命令 4: forge evidence freeze <changeId> --kind <verify|review>
  // plan-9g Task 4 — staging → marker 凝固 + transaction + WARNING 转 VerifyFinding
  // brainstorm spec §5 数据流 + §9.6 锁定 B(transaction)+ §9.11(ack-log tail+count 固化)
  // ────────────────────────────────────────────────────────────────────────────

  evidence
    .command('freeze')
    .description('staging → marker 凝固;主代理在 verify/review marker 写完后显式调用')
    .argument('<changeId>', 'change 目录 ID')
    .requiredOption(
      '--kind <verify|review>',
      'freeze 目标 marker:verify 或 review(commander.requiredOption,omit 自动 exit 1)',
    )
    .option('--marker <path>', 'marker 路径(可选,默认按 --kind 派生)')
    .action(async (changeId: string, opts: { kind: string; marker?: string }) => {
      // 校验 --kind 取值(commander.requiredOption 已保证非空,但仍校 enum)
      if (opts.kind !== 'verify' && opts.kind !== 'review') {
        process.stderr.write(
          `forge evidence freeze: invalid --kind "${opts.kind}". Must be 'verify' or 'review'\n`,
        );
        process.exit(2);
      }
      const kind = opts.kind as 'verify' | 'review';

      const changeRoot = resolve(process.cwd(), 'forge', 'changes', changeId);
      const markerFilename = kind === 'verify' ? '.verify-passed' : '.review-passed';
      const markerPath = opts.marker ?? join(changeRoot, markerFilename);

      // 路径冲突检测(--marker 与 --kind 派生不一致 → stderr WARNING)
      const derivedPath = join(changeRoot, markerFilename);
      if (opts.marker && opts.marker !== derivedPath) {
        process.stderr.write(
          `⚠ forge evidence freeze: --marker (${opts.marker}) 与 --kind=${kind} 派生路径 (${derivedPath}) 不一致;以 --marker 为准\n`,
        );
      }

      // 1. acquireStagingLock(防 freeze 期间 helper 再 append)
      const releaseLock = await acquireStagingLock(changeRoot);
      try {
        // 2. 读 staging.yaml
        const stagingPath = join(changeRoot, '.evidence', 'process-evidence.staging.yaml');
        if (!existsSync(stagingPath)) {
          process.stderr.write(
            `forge evidence freeze: staging file not found at ${stagingPath};` +
              ` 主代理必须先调 forge evidence record-tdd/verify/review 写 staging\n`,
          );
          process.exit(1);
        }
        const stagingContent = await readFile(stagingPath, 'utf8');
        const staging = parse(stagingContent) as ProcessEvidence & {
          staging_hash: string;
        };

        // 3. 重算 staging_hash 校验未被中间篡改
        // Observation(latent bug 1):plan §5.1.1 字面 projection 三数组与 Task 3 实际公式不一致。
        // Task 3 writeStagingYaml:stagingHash = canonicalHash(data) 其中 data 是完整 ProcessEvidence struct
        //   (不含 staging_hash),再写 { ...data, staging_hash }。
        // 所以读取后 staging 含 staging_hash 信封字段;重算需剥离该字段对剩余做 canonicalHash。
        // 沿 Task 3 落地公式(backward-compatible)。
        const { staging_hash: storedHash, ...stagingForHash } = staging;
        const recomputedHash = canonicalHash(stagingForHash);
        if (recomputedHash !== storedHash) {
          process.stderr.write(
            `✗ forge evidence freeze: staging_hash mismatch — staging tampered\n`,
          );
          process.exit(1);
        }

        // 4. 读 marker(主代理刚写的 .verify-passed/.review-passed)
        if (!existsSync(markerPath)) {
          process.stderr.write(
            `forge evidence freeze: marker not found at ${markerPath};` +
              ` 主代理必须先写 .${kind}-passed yaml(沿 commands/verify.md 步骤 4.3)\n`,
          );
          process.exit(1);
        }
        const markerContent = await readFile(markerPath, 'utf8');
        const marker = parse(markerContent) as Record<string, unknown>;

        // 5. staging schema 强制必填 mode/ack/env_hash;freeze 时缺字段 → exit 1
        //    (v3 修订:mode != full 时 acked_by/acked_at 必填;env_hash 子字段完整性)
        const stagingTyped = staging as typeof staging & {
          process_verification_mode?: 'full' | 'sample' | 'hash-only';
          process_verification_mode_acked_by?: string | null;
          process_verification_mode_acked_at?: string | null;
          env_hash?: {
            lockfile_hash: string;
            node_version: string;
            os_platform: 'win32' | 'darwin' | 'linux';
          };
        };

        const missingFields: string[] = [];
        if (!stagingTyped.process_verification_mode)
          missingFields.push('process_verification_mode');
        // mode != full 时 acked_by + acked_at 必填(沿不变量 12 CRITICAL)
        if (
          stagingTyped.process_verification_mode &&
          stagingTyped.process_verification_mode !== 'full'
        ) {
          if (!stagingTyped.process_verification_mode_acked_by)
            missingFields.push('process_verification_mode_acked_by (mode != full required)');
          if (!stagingTyped.process_verification_mode_acked_at)
            missingFields.push('process_verification_mode_acked_at (mode != full required)');
        }
        if (!stagingTyped.env_hash) {
          missingFields.push('env_hash');
        } else {
          // env_hash 子字段完整性
          if (!stagingTyped.env_hash.lockfile_hash) missingFields.push('env_hash.lockfile_hash');
          if (!stagingTyped.env_hash.node_version) missingFields.push('env_hash.node_version');
          if (!stagingTyped.env_hash.os_platform) missingFields.push('env_hash.os_platform');
        }
        if (missingFields.length > 0) {
          process.stderr.write(
            `forge evidence freeze: staging.yaml missing required fields: ${missingFields.join(', ')};` +
              ` 主代理必须先调 forge evidence record-tdd 写完整 staging(含 --mode + --lockfile-hash + 环境字段)\n`,
          );
          process.exit(1);
        }

        // 构造 processEvidence(不含 staging_hash 信封字段)
        const processEvidence: ProcessEvidence = {
          schema: 'forge-process-evidence/v1',
          process_verification_mode: stagingTyped.process_verification_mode!,
          process_verification_mode_acked_by:
            stagingTyped.process_verification_mode_acked_by ?? null,
          process_verification_mode_acked_at:
            stagingTyped.process_verification_mode_acked_at ?? null,
          env_hash: stagingTyped.env_hash!,
          tdd_event_chain: staging.tdd_event_chain,
          verify_invocations: staging.verify_invocations,
          subagent_review_chain: staging.subagent_review_chain,
        };
        marker.process_evidence = processEvidence;

        // 6. 写 process_evidence_staging_hash 快照(archive fence cross-check 用)
        marker.process_evidence_staging_hash = storedHash;

        // 7. 三段式 entry 处理:
        //    a) entriesBeforeFreeze:用于 11/12 ack 检测(freeze entry 还未在)
        //    b) appendAckLog(freezeEntry):写 freeze 行(参与全 JSONL 链)
        //    c) entriesAfterFreeze:用于 tail/count 固化(含 freeze entry)
        //    避免 happy path 自拒签(原 v0/v1:用同名 allEntries 跨两阶段导致顺序错乱)
        const entriesBeforeFreeze = await readAllAckLogEntries(changeRoot);

        // 8. 算 freeze-time WARNING(仅不变量 7 + 10)→ 转 VerifyFinding 写 marker.verify_findings
        //    + CRITICAL 11/12(tdd_exemption ack / mode ack)freeze 时直接 exit 1
        //    (brainstorm spec §3 WARNING 流转两段闭合)
        //    用 entriesBeforeFreeze(freeze entry 还未在);避免循环依赖
        const warningFindings = computeFreezeWarnings(
          processEvidence,
          changeRoot,
          entriesBeforeFreeze,
        );
        // 若 fence-ctx 检测到不变量 11/12 失败 → CRITICAL,exit 1
        if (warningFindings.criticals.length > 0) {
          for (const c of warningFindings.criticals) {
            process.stderr.write(`✗ ${c.evidence}\n`);
          }
          process.stderr.write(
            `forge evidence freeze: CRITICAL invariant failed;` +
              ` 必须先跑 forge ack propose 处理后 retry freeze\n`,
          );
          process.exit(1);
        }
        // WARNING 7/10 转 VerifyFinding 追加 marker.verify_findings
        // v8.1 round 2 (I-2 fix):re-freeze 时 dedup by finding_hash,
        //   防 marker.verify_findings 重复 id(checkVerifyFindingsArray seenIds detection 拒签)
        if (warningFindings.warnings.length > 0) {
          const existingFindings = (marker.verify_findings as VerifyFinding[] | undefined) ?? [];
          const existingHashes = new Set(existingFindings.map((f) => f.finding_hash));
          const newFindings = warningFindings.warnings.filter(
            (f) => !existingHashes.has(f.finding_hash),
          );
          marker.verify_findings = [...existingFindings, ...newFindings];
        }

        // 9. 先 append freeze entry 到 ack-log,再读全文件算 tail/count 固化
        //    freeze entry payload_hash 不含 ack_log_tail_hash(循环依赖避免)
        //    markerPath 跨平台归一化正斜杠(plan-9g 注:Windows 反斜杠路径 hash 不一致)
        const normalizedMarkerPath = markerPath.replace(/\\/g, '/');
        const freezePayloadHash = canonicalHash({
          helper: 'freeze',
          change_id: changeId,
          kind,
          marker_path: normalizedMarkerPath,
          staging_hash: storedHash,
          warning_count: warningFindings.warnings.length,
        });

        // v8.1 round 2 (I-1 fix):idempotency guard 防 retry 时多余 freeze entry
        // 场景:appendAckLog 成功 → writeFile/rename 失败 → ack-log 已含 freeze entry,marker 未更新。
        //   Retry freeze 不加 guard 会再 appendAckLog → entry_count mismatch + 链不可信。
        // 判定:last entry kind=evidence-helper + helper_name=freeze + payload_hash 完全相同 → replay
        const lastEntry = entriesBeforeFreeze[entriesBeforeFreeze.length - 1];
        const isReplay =
          lastEntry?.kind === 'evidence-helper' &&
          (lastEntry as EvidenceHelperEntry).helper_name === 'freeze' &&
          (lastEntry as EvidenceHelperEntry).payload_hash === freezePayloadHash;

        if (!isReplay) {
          const freezeEntry: EvidenceHelperEntry = {
            schema: 'forge-ack-log/v1',
            kind: 'evidence-helper',
            timestamp: new Date().toISOString(),
            helper_name: 'freeze',
            change_id: changeId,
            task_ref: `freeze-${kind}`, // 标志 freeze 而非 record-*
            payload_hash: freezePayloadHash,
            status: 'success',
            git_head: getGitHead(changeRoot),
            extra: { kind, warning_count: warningFindings.warnings.length },
          };
          await appendAckLog(changeRoot, freezeEntry);
        }
        // 否则:retry 复用已有 freeze entry,不再 append(ack-log 不长第二条)

        // 10. 读 entriesAfterFreeze(此时已含 freeze entry)→ 算 tail/count 固化到 marker
        const entriesAfterFreeze = await readAllAckLogEntries(changeRoot);
        marker.ack_log_entry_count = entriesAfterFreeze.length;
        marker.ack_log_tail_hash =
          entriesAfterFreeze.length > 0
            ? canonicalHash(entriesAfterFreeze[entriesAfterFreeze.length - 1]!)
            : null;

        // 11. transaction 落 marker(沿 brainstorm spec §9.6 锁定 B + plan-9e1 transaction.ts 模式)
        //    tmp 文件写 + rename atomic(POSIX + Windows NTFS 同卷)
        const tmpPath = `${markerPath}.tmp.${process.pid}`;
        const updatedYaml = stringify(marker);
        await writeFile(tmpPath, updatedYaml, 'utf8');
        // rename atomic(POSIX + Windows NTFS 同卷)
        await rename(tmpPath, markerPath);

        process.stdout.write(
          `✓ forge evidence freeze: ${kind} marker frozen` +
            ` (staging_hash=${storedHash.slice(0, 16)}..., ` +
            `${warningFindings.warnings.length} WARNING(s) → marker.verify_findings)\n`,
        );
        process.exit(0);
      } finally {
        await releaseLock();
      }
    });

  return evidence;
}
