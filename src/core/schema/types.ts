// spec-driven schema 类型定义 — 对应 forge/config.yaml + 默认 schema

/** 三个 model tier 标签 / 合法模型值 */
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

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

  /**
   * v1.0 protected branches(plan-9h §2.8.3 C — main/master 分支保护)
   * 缺失时调用方应以 `??` fallback `DEFAULT_PROTECTED_BRANCHES`;
   * 空数组等价于禁用分支保护(不推荐,沿 design §2.8.3 C line 1438)。
   *
   * 由 `forge preflight branch-check` CLI helper 读取(沿 spec §2.8.5 第 3 项)。
   * 用户项目 `forge/config.yaml` 设置形如:
   *   protected_branches:
   *     - main
   *     - master
   *     - develop
   *     - trunk
   */
  protected_branches?: string[];

  /**
   * plan-stage-extensions Task 1 — stage 扩展点配置。
   * 缺失时调用方应以空对象 fallback 或调 validateStageExtensionsConfig 拿完整 normalized 值。
   */
  stage_extensions?: StageExtensionsConfig;

  /**
   * workflow-monitor 开关(spec §3.1)。
   * 缺失或 `enabled` 缺失时,调用方一律视为 false(监控关闭)。
   * 读取走 monitor/config.ts#isMonitorEnabled;写入走 setMonitorEnabled。
   */
  monitor?: {
    enabled?: boolean;
  };

  /**
   * model tier 标签 → 实际派发模型的重映射(详见 model-tiers-config.ts)。
   * 只有 haiku / sonnet 两个可重映射键;opus 是 design MANDATORY tier,不设键、恒派 opus。
   * 缺失 / 缺键 = 该 tier 恒等。
   */
  model_tiers?: {
    haiku?: ModelTier;
    sonnet?: ModelTier;
  };
}

/**
 * 默认 light_threshold(P3 修复;调用方 fallback 用)。
 * 详见 spec §2.3 + Plan 2 Task 2.2。
 */
export const DEFAULT_LIGHT_THRESHOLD = 200;

/** model_tiers 缺失时的恒等默认(resolveModelTiers fallback 用) */
export const DEFAULT_MODEL_TIERS: { haiku: ModelTier; sonnet: ModelTier; opus: ModelTier } = {
  haiku: 'haiku',
  sonnet: 'sonnet',
  opus: 'opus',
};

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
 * 默认 protected branches(plan-9h §2.8.3 C;调用方 fallback 用)。
 * 详见 design v3 §2.8.3 C line 1432-1438。
 */
export const DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'develop', 'trunk'] as const;

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

// ─── plan-stage-extensions Task 1: StageExtensions 配置类型 ───────────────────

/** 单个 stage extension 条目(用户配置层;可选字段由 validator 填充) */
export interface StageExtensionEntry {
  name: string;
  enabled: boolean;
  command: string;
  /** codex review 模式可不传 prompt */
  build_prompt?: string;
  output: string;
  timeout_sec?: number;
  poll_interval_sec?: number;
  zombie_threshold_sec?: number;
  max_retries?: number;
  /** 用户可局部覆盖 convergence;缺省字段由 defaults 填充 */
  convergence?: Partial<ConvergenceConfig>;
}

/** convergence 收敛策略(完整配置;Partial 版本用于用户输入) */
export interface ConvergenceConfig {
  /** 最多收敛轮次 [1, 100] */
  max_rounds: number;
  /** 轮次上限时行为 */
  max_rounds_on_exceed: 'ask' | 'force_end';
  /** 阻塞 merge 的 severity 列表 */
  block_severity: Array<'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT'>;
  /** 忽略不计入收敛的 severity 列表 */
  ignore_severity: Array<'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT'>;
  /** 通过信心阈值 [0, 1] */
  confidence_threshold: number;
  /** verdict=APPROVE 时直接短路跳出收敛循环 */
  verdict_approve_short_circuit: boolean;
}

/** stage_extensions.defaults 用户配置层(所有字段可选) */
export interface StageExtensionsDefaults {
  /** 运行模式;v1 仅 'sync','background' 预留给 v2 async 模式(plan 决策 Q5) */
  mode: 'background' | 'sync';
  poll_interval_sec: number;
  zombie_threshold_sec: number;
  timeout_sec: number;
  max_retries: number;
  convergence: ConvergenceConfig;
  /** codex severity → forge severity 映射(codex → 内部) */
  severity_map: {
    critical: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT';
    high: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT';
    medium: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT';
    low: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT';
  };
  /** forge severity → forge finding 级别映射(内部 → CLI 输出) */
  severity_map_to_forge: {
    BLOCKER: 'critical' | 'warning' | 'suggestion';
    MAJOR: 'critical' | 'warning' | 'suggestion';
    MINOR: 'critical' | 'warning' | 'suggestion';
    NIT: 'critical' | 'warning' | 'suggestion';
  };
  /** 用户交互策略(未收敛 / 超轮次时推荐动作) */
  user_interaction: {
    block_unconverged: 'auto_fix_recommended' | 'manual_fix_recommended' | 'give_up_recommended';
    max_rounds_exceed: 'give_up_recommended' | 'continue_recommended' | 'accept_recommended';
  };
}

/** stage_extensions 顶层用户配置(forge/config.yaml#stage_extensions) */
export interface StageExtensionsConfig {
  defaults?: Partial<StageExtensionsDefaults>;
  brainstorming?: StageExtensionEntry[];
  propose?: StageExtensionEntry[];
  apply_critical_plan_review?: StageExtensionEntry[];
  review?: StageExtensionEntry[];
  verify?: StageExtensionEntry[];
}

// ─── Normalized 类型 — validator 输出;所有 optional 已填充 ──────────────────

/** normalized entry:所有数值字段已填充,convergence 为完整 ConvergenceConfig */
export interface NormalizedStageExtensionEntry {
  name: string;
  enabled: boolean;
  command: string;
  /** codex review 模式仍可无 prompt */
  build_prompt?: string;
  output: string;
  timeout_sec: number;
  poll_interval_sec: number;
  zombie_threshold_sec: number;
  max_retries: number;
  /** 完整 convergence(deep-merge defaults + entry.convergence) */
  convergence: ConvergenceConfig;
}

/** normalized 顶层配置:所有 stage 数组已填充(缺省 []) */
export interface NormalizedStageExtensionsConfig {
  severity_map: StageExtensionsDefaults['severity_map'];
  severity_map_to_forge: StageExtensionsDefaults['severity_map_to_forge'];
  user_interaction: StageExtensionsDefaults['user_interaction'];
  brainstorming: NormalizedStageExtensionEntry[];
  propose: NormalizedStageExtensionEntry[];
  apply_critical_plan_review: NormalizedStageExtensionEntry[];
  review: NormalizedStageExtensionEntry[];
  verify: NormalizedStageExtensionEntry[];
}
