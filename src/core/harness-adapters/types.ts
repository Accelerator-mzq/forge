// Harness adapter 共用类型 — spec §2.1 + Phase 0.5 spike 结果

/** 受支持的 harness 标识 */
export type HarnessId = 'claude' | 'codex' | 'opencode';

/** harness 检测结果 — 项目里这个 harness 是否装了 */
export interface HarnessDetection {
  id: HarnessId;
  detected: boolean;
  /** 检测到的标志路径(如 `.claude/`、`AGENTS.md`) */
  detectedAt?: string;
}

/**
 * skill 文件描述 — adapter 要铺什么内容
 * Plan 4 之前 templates 是占位,这里只关心结构
 */
export interface SkillSpec {
  /** skill 名(如 'using-forge', 'forge-brainstorming') */
  name: string;
  /** SKILL.md 内容 */
  content: string;
}

/** slash 命令模板描述 */
export interface CommandSpec {
  /** 命令名(如 'brainstorm', 'propose') — 完整命令是 `/forge:<name>` */
  name: string;
  /** 命令模板 markdown 内容 */
  content: string;
}

/** adapter 部署任务输入 */
export interface DeployInput {
  /** 项目根目录 */
  projectRoot: string;
  /** 要铺的 skill 列表 */
  skills: SkillSpec[];
  /** 要铺的命令列表 */
  commands: CommandSpec[];
}
