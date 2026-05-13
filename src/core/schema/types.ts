// spec-driven schema 类型定义 — 对应 forge/config.yaml + 默认 schema

/**
 * forge/config.yaml 的解析结果类型。
 * 详见 spec §2.2.1。
 */
export interface ForgeConfig {
  schema: string; // e.g., 'forge-spec-driven/v1'
  context?: string;
  rules?: {
    proposal?: string[];
    specs?: string[];
    design?: string[];
    tasks?: string[];
  };
  code_paths?: {
    include?: string[];
    exclude?: string[];
  };
  /**
   * v0.2 brownfield onboarding 全局策略(brownfield design §2.7 / 决策 #19/#22)。
   * 缺失或全字段缺失时,brownfield 工具拒绝运行;archive 内的 sync-check graceful skip。
   *
   * **运行时默认值**:本 interface 是纯类型定义,parseConfig 透传不补默认值;
   * 调用方应以 `??` fallback(如 `config.legacy_bridge?.allow_llm_calls ?? false`)。
   */
  legacy_bridge?: {
    /** 决策 #22:opt-in LLM 调用;缺失时调用方应视为 false */
    allow_llm_calls?: boolean;
    /** 决策 #19:enforce_sync,critical 未 resolve 时 archive preflight 阻塞;缺失视为 false */
    enforce_sync?: boolean;
    /** 决策 #18:跨 anchor 不一致是否走 mtime 自动决策;缺失视为 false(默认入 diff) */
    auto_resolve_cross_anchor?: boolean;
    /** 决策 #21:复写产物许可;缺失时调用方应 fallback 为 'derived-from-source' */
    regen_license?: string;
    /**
     * 决策 #22 预留:LLM provider。v0.2 仅 'anthropic';
     * v0.3 加 'openai' 等时改为 union(`'anthropic' | 'openai' | ...`)。
     * 现 literal 类型让 v0.2 用户得到 IDE 补全;v0.3 spec 定稿后该字段会扩 union。
     */
    provider?: 'anthropic';
  };

  /**
   * v0.3 P3 修复(spec §2.3 + Plan 2):writing-plans skill 的 scale-aware mode 配置。
   * trivial change 走 light mode(1-2 task,跳 RED/GREEN/REFACTOR),避免 v0.2 P3 的
   * "trivial change → 1378 行 tasks.md" 过度生成(Plan 0b.1 实测确认)。
   */
  writing_plans?: {
    /**
     * trivial change 阈值:proposal.md 行数 < light_threshold → light mode。
     * 默认 200(由 validateWritingPlansConfig fallback);允许范围 [50, 2000]。
     * 50 太小会误判普通 change 为 trivial;2000 失去 light mode 意义。
     * 调用方应以 `??` 取默认值或调 validateWritingPlansConfig 拿 sanitized 值。
     */
    light_threshold?: number;
  };

  /**
   * v1.0 process_verification(plan-9g §2.7 — 14 不变量 + worktree 重跑配置)
   * 缺失时调用方应以 `??` fallback 取 DEFAULT_PROCESS_VERIFICATION 值
   * 或调 validateProcessVerificationConfig 拿 sanitized 完整值
   */
  process_verification?: {
    /** 默认 'full'(沿 §2.7.4 B);mode != full 必须 CLI ack 写 marker */
    mode?: 'full' | 'sample' | 'hash-only';
    /** sample 模式抽样比例 [0..1],默认 0.3 */
    sample_ratio?: number;
    /** 单 task 重跑 timeout 秒(默认 300;full 模式触发 → CRITICAL,沿 §2.7.4 D) */
    test_timeout_per_task?: number;
    /** 并发 worktree 上限(默认 2;Windows 磁盘空间约束更紧) */
    max_parallel_reruns?: number;
  };

  /**
   * v1.0 test reporter(plan-9g §2.7.4 C — 解析结构化测试报告)
   * 缺失时调用方应以 `??` fallback 'junit'
   */
  test?: {
    /** 默认 'junit';reporter 类型决定 parseReporter 走哪个分支 */
    reporter?: 'junit' | 'tap' | 'vitest-json';
    /** 单 task 测试命令(用于 worktree 重跑;沿 commands/verify.md:29) */
    test_command?: string;
  };

  /**
   * v1.0 ack CLI 安全开关(plan-9g §2.7.4 B — CI 模式拒绝 ack 防静默降级)
   * 缺失时调用方应以 `??` fallback false(更安全)
   */
  ack?: {
    /** false(默认):检测 CI=true 时 `forge ack propose` 拒绝触发 */
    allow_ci_mode?: boolean;
  };
}

/**
 * 默认 light_threshold(P3 修复;调用方 fallback 用)。
 * 详见 spec §2.3 + Plan 2 Task 2.2。
 */
export const DEFAULT_LIGHT_THRESHOLD = 200;

/**
 * 默认 process_verification 配置(plan-9g §6;调用方 fallback 用)
 * brainstorm spec §6 锁定四档默认值
 */
export const DEFAULT_PROCESS_VERIFICATION = {
  mode: 'full' as const,
  sample_ratio: 0.3,
  test_timeout_per_task: 300, // 秒
  max_parallel_reruns: 2,
};

/** 默认 test.reporter(plan-9g §6) */
export const DEFAULT_TEST_REPORTER = 'junit' as const;

/** 默认 ack.allow_ci_mode(plan-9g §6;false 防 CI 静默降级) */
export const DEFAULT_ACK_ALLOW_CI_MODE = false;

/**
 * 默认 spec-driven schema 的 artifact 列表(决定哪些文件构成一个 change)。
 */
export const DEFAULT_ARTIFACTS = ['proposal', 'specs', 'design', 'tasks'] as const;
export type ArtifactKind = (typeof DEFAULT_ARTIFACTS)[number];

/**
 * code_paths.exclude 的默认值(不可关闭,与用户声明合并使用)。
 * 详见 spec §3.4 hash 计算规则。
 */
export const DEFAULT_CODE_EXCLUDE = [
  'forge/**',
  '**/*.md',
  '**/.verify-passed',
  '**/.review-passed',
  '**/.verify-failed',
  '**/.review-failed',
  '**/.evidence/**',
] as const;

// §3.12.1 Interface Freeze 共享字段 single source of truth — 后续 sub-plan reference 此处
export * from '../schemas/severity.js';
