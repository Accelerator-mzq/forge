// HarnessAdapter — 每个 harness 一个实现 — spec §2.1

import type { HarnessId, DeployInput, HarnessDetection } from './types.js';

export interface HarnessAdapter {
  /** harness 标识 */
  readonly id: HarnessId;

  /**
   * 检测当前 projectRoot 下是否有该 harness 的痕迹(已装/启用)。
   * 用于 `forge init` 时给用户看 default 选项。
   */
  detect(projectRoot: string): Promise<HarnessDetection>;

  /**
   * 计算该 adapter 部署后的目标文件列表(相对 projectRoot 的路径 + 内容)。
   * 这是"纯函数"步骤 — 不写 fs。
   * Plan 3 transaction 用这个结果做 Stage 阶段的预生成。
   */
  plan(input: DeployInput): Promise<DeployPlan>;
}

/** plan() 输出:目标文件清单 */
export interface DeployPlan {
  files: PlannedFile[];
}

export interface PlannedFile {
  /** 相对 projectRoot 的路径(POSIX 风格) */
  relPath: string;
  /** 文件内容 */
  content: string;
}

/**
 * v0.3 Plan 4 — Legacy adapter 产物探测(`forge upgrade` 用)
 * v0.2 forge init 写到项目级 `.claude/skills/forge-{name}/SKILL.md` + `.claude/commands/forge/{name}.md`
 * v0.3 plugin 路径不再用项目级 — 这些 legacy 产物需要扫出来 + 询问后清理(`forge upgrade`)
 *
 * spec §3.2 数据流 5 阶段事务化(SCAN → SHOW DIFF → ASK → STASH → VERIFY → COMMIT)。
 */
export interface LegacyArtifact {
  /** 相对 projectRoot 的路径(POSIX 风格) */
  relPath: string;
  /** 文件内容 sha256(用于 SHOW DIFF + STASH 后 VERIFY hash 一致) */
  sha256: string;
  /** 文件类型 */
  type: 'skill' | 'command';
}

export interface LegacyDetector {
  /**
   * 扫 projectRoot 内 v0.2 adapter 写过的 legacy 路径。
   * 返回所有可清理产物清单 + sha256(纯只读,5 阶段事务的 SCAN 阶段)。
   *
   * @param projectRoot — 用户项目根目录
   * @returns LegacyArtifact 数组,空数组表示项目没 legacy adapter 产物
   */
  detectLegacyArtifacts(projectRoot: string): Promise<LegacyArtifact[]>;
}
