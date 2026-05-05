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
