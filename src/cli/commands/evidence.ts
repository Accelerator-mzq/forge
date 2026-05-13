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
import { appendAckLog } from '../../core/ack-log.js';
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

  return evidence;
}
