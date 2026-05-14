// src/core/schemas/process-evidence.ts — plan-9g Task 1
// §2.7.2 forge-process-evidence/v1 schema:14 不变量字段 + 五源 cross-check(brainstorm v16)
// 沿 archive-summary.ts 模式:schema literal + 手写 interface + JSDoc
//
// 关键设计(brainstorm spec §4):
//   - RedCommitRecord / GreenCommitRecord 拆两 interface(Codex 一轮 M-1)
//   - 字段名严格沿 master spec §2.7.2 行 1115/1116 / 1127/1128 字面
//     (red_log_path / red_log_hash / green_log_path / green_log_hash;
//      runner_report_path / runner_report_hash 通用)
//   - GreenCommitRecord 无 expected_failures 字段(schema 层禁止 GREEN 含)

/** ProcessEvidence 顶级 schema(沿 design §2.7.2 字段表) */
export interface ProcessEvidence {
  /** YAML schema identifier(沿 forge marker schema 同约定) */
  schema: 'forge-process-evidence/v1';

  /** 模式:full(默认重跑全部)| sample(抽样)| hash-only(仅 hash 校验,等同 v0.4 弱 fence) */
  process_verification_mode: 'full' | 'sample' | 'hash-only';
  /** mode != full 时必填 — ack-log 含对应 ack-mode 条目;CI 模式拒签 mode != full(沿 §2.7.4 B) */
  process_verification_mode_acked_by: string | null;
  /** ISO 8601 UTC */
  process_verification_mode_acked_at: string | null;

  /** 环境三因子(MAJOR #23 — 重跑前 env 一致校验,不一致 → WARNING) */
  env_hash: EnvHash;

  /** TDD RED→GREEN 事件序列(每 task 一条;沿 §2.7.2 + 不变量 1-6 + 11) */
  tdd_event_chain: TddEventChain[];

  /** verify 命令每次跑都 append(沿 §2.7.6 helper append-only;不变量 7) */
  verify_invocations: VerifyInvocation[];

  /** subagent 二段 review 痕迹(不变量 8) */
  subagent_review_chain: SubagentReviewChain[];
}

/** 环境三因子哈希(MAJOR #23) */
export interface EnvHash {
  /** sha256(pnpm-lock.yaml 或 package-lock.json) */
  lockfile_hash: string;
  /** semver,e.g. "20.10.0" */
  node_version: string;
  /** "win32" | "darwin" | "linux"(沿 Node os.platform()) */
  os_platform: 'win32' | 'darwin' | 'linux';
}

/** TDD 单 task RED→GREEN 事件链(每 task 一条) */
export interface TddEventChain {
  /** task 引用(沿 tasks.md 锚点) */
  task_ref: string;
  /** RED 阶段记录(tdd_exemption 非空时可省) */
  red_commit: RedCommitRecord | null;
  /** GREEN 阶段记录(必填) */
  green_commit: GreenCommitRecord;
  /** light mode trivial change 免 RED 的 ack 引用(沿 §2.7.2 MAJOR #37;不变量 11) */
  tdd_exemption: TddExemption | null;
  /** tdd_exemption 非空时必填 — ack-log 中对应 user ack 的 acked_by */
  tdd_exemption_acked_by: string | null;
}

/**
 * RED commit 记录(brainstorm v6 修订,Codex 一轮 M-1 修复)
 * 字段名严格沿 master spec §2.7.2 行 1115/1116 字面 — red_commit 节点下的 log/hash 字段
 * 是 red_log_path / red_log_hash 而非通用 log_path / log_hash
 */
export interface RedCommitRecord {
  /** git sha(40 hex) */
  sha: string;
  /** ISO 8601 UTC */
  timestamp: string;
  /** RED plain log 路径(forge/changes/<id>/.evidence/ 相对路径;沿 master spec 行 1115) */
  red_log_path: string;
  /** sha256(red log content);沿 master spec 行 1116 */
  red_log_hash: string;
  /** 进程 exit code — RED 必 != 0(MAJOR #19,不变量 3) */
  exit_code: number;
  /** 结构化 reporter 报告路径(JUnit XML / TAP / Vitest JSON;MAJOR #20) */
  runner_report_path: string;
  /** sha256(reporter content) */
  runner_report_hash: string;
  /** RED 阶段必填:绑定具体失败的 test(MAJOR #24;不变量 5) */
  expected_failures: ExpectedFailure[];
}

/**
 * GREEN commit 记录(brainstorm v6 修订,Codex 一轮 M-1 修复)
 * 字段名沿 master spec §2.7.2 行 1127/1128 字面 — green_commit 节点下用 green_log_path/hash
 * 注:无 expected_failures 字段(schema 层禁止 GREEN 含)
 */
export interface GreenCommitRecord {
  /** git sha(40 hex) */
  sha: string;
  /** ISO 8601 UTC */
  timestamp: string;
  /** GREEN plain log 路径;沿 master spec 行 1127 */
  green_log_path: string;
  /** sha256(green log content);沿 master spec 行 1128 */
  green_log_hash: string;
  /** 进程 exit code — GREEN 必 == 0(MAJOR #19,不变量 4) */
  exit_code: number;
  /** 结构化 reporter 报告路径 */
  runner_report_path: string;
  /** sha256(reporter content) */
  runner_report_hash: string;
}

/** RED 阶段期望失败的 test(MAJOR #24) */
export interface ExpectedFailure {
  /** 相对 repo 根 */
  test_file: string;
  /** 测试名(对应 reporter 中的 test 标识) */
  test_name: string;
  /** 失败类型 */
  failure_type: 'assertion' | 'timeout' | 'error' | 'not-implemented';
}

/** light mode trivial change 免 RED(沿 §2.7.2 MAJOR #37) */
export interface TddExemption {
  /** 沿 config.yaml#writing_plans.light_threshold 触发(默认 200 行) */
  reason: 'light-mode-trivial';
  /** 变更行数 */
  loc_delta: number;
}

/** verify 命令单次调用记录(沿 §2.7.6 helper append-only) */
export interface VerifyInvocation {
  /** ISO 8601 UTC */
  invoked_at: string;
  /** 涉及的 task(MAJOR #22:list,支持 per-task / change-level) */
  task_refs: string[];
  /** per-task = subagent 实施完单 task 立即跑;change-level = 主代理统一跑 */
  verify_scope: 'per-task' | 'change-level';
  /** pass | fail | skip */
  result: 'pass' | 'fail' | 'skip';
  /** 进程 exit code */
  exit_code: number;
  /** plain log 路径 */
  log_path: string;
  log_hash: string;
  /** 结构化 reporter 报告路径 */
  runner_report_path: string;
  runner_report_hash: string;
}

/** subagent 二段 review 链(沿 §2.7.2 + 不变量 8) */
export interface SubagentReviewChain {
  task_ref: string;
  /** subagent 实施的 commit */
  implementer_commit: string;
  /** spec 维度 review 多次迭代(每次都 append) */
  spec_reviewer_iterations: ReviewIteration[];
  /** quality 维度 review 多次迭代 */
  quality_reviewer_iterations: ReviewIteration[];
  /** 主代理 check-off 时间(ISO 8601 UTC) */
  main_agent_check_off_at: string;
}

/** 单次 reviewer 迭代 */
export interface ReviewIteration {
  /** reviewer subagent 跑完时的 commit sha */
  reviewer_commit: string;
  /** needs-fix 走下一轮;approved 终态 */
  outcome: 'needs-fix' | 'approved';
  /** review 笔记 log 路径(forge/changes/<id>/.evidence/ 相对) */
  notes_log_path: string;
}

/**
 * ProcessVerificationConfig:forge/config.yaml#process_verification 字段类型
 * validateProcessVerificationConfig 校验阈值,见 src/core/schema/process-verification-config.ts
 */
export interface ProcessVerificationConfig {
  /** 默认 'full' */
  mode: 'full' | 'sample' | 'hash-only';
  /** sample 模式抽样比例(0..1,默认 0.3) */
  sample_ratio: number;
  /** 单 task 重跑超时秒(默认 300) */
  test_timeout_per_task: number;
  /** 并发 worktree 上限(默认 2) */
  max_parallel_reruns: number;
}
