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
}

/**
 * 默认 light_threshold(P3 修复;调用方 fallback 用)。
 * 详见 spec §2.3 + Plan 2 Task 2.2。
 */
export const DEFAULT_LIGHT_THRESHOLD = 200;

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
