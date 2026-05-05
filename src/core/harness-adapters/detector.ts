// harness 检测 — 看项目里是否有 .claude/ / .agents/ / .opencode/

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessId, HarnessDetection } from './types.js';

// 各 harness 的检测路径(基于 Phase 0.5 spike 实测)
const DETECTION_PATHS: Record<HarnessId, string[]> = {
  claude: ['.claude'], // Claude Code 配置目录
  codex: ['.agents'], // 共享 Claude Agent SDK 约定(不是 .codex/)
  opencode: ['.opencode', 'AGENTS.md'], // .opencode/ 或 AGENTS.md marker
};

/** 检查路径是否存在 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检测单个 harness
 * @param projectRoot 项目根目录
 * @param id harness 标识(claude/codex/opencode)
 * @returns 检测结果(是否已安装 + 检测到的路径)
 */
export async function detect(projectRoot: string, id: HarnessId): Promise<HarnessDetection> {
  const candidates = DETECTION_PATHS[id];
  for (const rel of candidates) {
    const abs = join(projectRoot, rel);
    if (await pathExists(abs)) {
      return { id, detected: true, detectedAt: rel };
    }
  }
  return { id, detected: false };
}

/**
 * 检测所有 harness
 * @param projectRoot 项目根目录
 * @returns 三个 harness 的检测结果数组
 */
export async function detectAll(projectRoot: string): Promise<HarnessDetection[]> {
  const ids: HarnessId[] = ['claude', 'codex', 'opencode'];
  return Promise.all(ids.map((id) => detect(projectRoot, id)));
}
