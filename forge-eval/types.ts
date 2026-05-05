// forge-eval 共享类型 — Plan 5
// 对应 spec §5.5.2 (scenario YAML 格式) + §5.5.3 (双轨 grading) + §5.5.5 (multi-turn runner)

/** 一个 turn 的 assertion 配置(模式匹配,可选) */
export interface Assertions {
  /** 必须命中的正则数组(全部命中才 pass) */
  must_match?: { regex: string }[];
  /** 必须不命中的正则数组(全部不命中才 pass) */
  must_not_match?: { regex: string }[];
}

/** 一个 turn 的输入与判定 */
export interface Turn {
  /** turn id(可选,默认按数组索引) */
  id?: string;
  /** 模拟用户消息 */
  user: string;
  /** 模式匹配,可选(spec §5.5.3:可选,缺失时 patternResult.skipped=true) */
  assertions?: Assertions;
  /** LLM-as-judge 评分 prompt(必需,spec §5.5.3) */
  judge_rubric: string;
}

/** 单 scenario 配置(YAML 顶层一份) */
export interface Scenario {
  /** skill 名(对应 src/core/templates/skills/<name>.md 的 SKILL_NAMES) */
  skill: string;
  /** scenario id(同一 skill 下唯一) */
  id: string;
  /** scenario 描述(给人读) */
  description?: string;
  /** 评测用模型,默认 'claude-sonnet-4-6' */
  model?: string;
  /** 压力维度 tag(如 time/social/authority,仅记录,不参与判定) */
  pressures?: string[];
  /** turns 数组(multi-turn) */
  turns: Turn[];
}

/** 一份 YAML 文件解析后的整体(一个 skill 一份,可含多个 scenario) */
export interface ScenarioFile {
  skill: string;
  description?: string;
  model?: string;
  scenarios: Omit<Scenario, 'skill' | 'description' | 'model'>[];
}

/** 模式匹配结果 */
export interface PatternResult {
  /** 是否通过(全部 must_match 命中 + 全部 must_not_match 不命中) */
  pass: boolean;
  /** 当 turn 缺少 assertions 时,本字段为 true,模式匹配跳过(spec §5.5.3 合约) */
  skipped: boolean;
  /** 失败的具体原因(每条:失败哪个 regex,已命中/未命中) */
  failures: string[];
}

/** LLM-as-judge 结果 */
export interface JudgeResult {
  /** 0-10 分(spec §5.5.3) */
  score: number;
  /** judge 给的简短理由 */
  reasoning: string;
  /** 解析失败时填充原始响应 */
  rawResponse?: string;
}

/** 单 turn 的执行结果 */
export interface TurnResult {
  turnId: string;
  userMessage: string;
  /** 模型响应内容(text 部分) */
  assistantResponse: string;
  /** assertions 结果(skipped=true 时也算 pass) */
  patternResult: PatternResult;
  /** judge 结果 */
  judgeResult: JudgeResult;
  /** turn 是否通过(spec §5.5.3:模式匹配 pass + judge >= 6) */
  turnPass: boolean;
  /** 本 turn 累计 token 数(input + output) */
  tokensUsed: number;
}

/** 单 scenario × {RED/GREEN} 一次跑的结果 */
export interface ScenarioRunResult {
  scenarioId: string;
  skill: string;
  /** RED=false (无 skill bootstrap), GREEN=true (有 skill bootstrap) */
  withSkill: boolean;
  turnResults: TurnResult[];
  /** 全部 turn 都通过才视为 scenario pass */
  scenarioPass: boolean;
  /** 本次跑的总 tokens */
  totalTokens: number;
  /** 本次跑的估算 cost(USD) */
  estimatedCost: number;
}

/** 一个 scenario 配对(RED + GREEN)+ delta */
export interface ScenarioPair {
  scenarioId: string;
  skill: string;
  red: ScenarioRunResult;
  green: ScenarioRunResult;
  /** GREEN avg score - RED avg score(每 turn judge.score 平均) */
  delta: number;
  /** delta >= delta_threshold 即 pair pass(默认阈值 1.5,可配置) */
  pairPass: boolean;
}

/** 全 run 汇总 */
export interface RunSummary {
  /** ISO 时间 */
  timestamp: string;
  /** 跑了哪些 skill(由 --changed-only 或 全量 决定) */
  skillsRun: string[];
  /** 全部 scenario pair 结果 */
  pairs: ScenarioPair[];
  /** 总 API 调用数 */
  totalApiCalls: number;
  /** 总 tokens(全 RED+GREEN+judge) */
  totalTokens: number;
  /** 总估算 cost(USD;由各 ScenarioRunResult.estimatedCost 累加) */
  totalEstimatedCost: number;
  /** 全部 pair 都 pass 才视为 run pass */
  runPass: boolean;
}
