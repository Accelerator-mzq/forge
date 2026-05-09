// Claude Code adapter — 铺到 .claude/skills/forge-<name>/SKILL.md 和 .claude/commands/forge/<name>.md
// 路径基于 Phase 0.5 spike 实测(spike/claude-code/.claude/...)
// v0.3 Plan 4:加 LegacyDetector 实现(forge upgrade 用)

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  HarnessAdapter,
  DeployPlan,
  PlannedFile,
  LegacyDetector,
  LegacyArtifact,
} from './interface.js';
import type { DeployInput, HarnessDetection } from './types.js';
import { detectLegacySkills, detectLegacyCommands } from './legacy-detector.js';

export class ClaudeAdapter implements HarnessAdapter, LegacyDetector {
  readonly id = 'claude' as const;

  async detect(projectRoot: string): Promise<HarnessDetection> {
    const target = join(projectRoot, '.claude');
    try {
      await stat(target);
      return { id: this.id, detected: true, detectedAt: '.claude' };
    } catch {
      return { id: this.id, detected: false };
    }
  }

  async plan(input: DeployInput): Promise<DeployPlan> {
    const files: PlannedFile[] = [];
    for (const skill of input.skills) {
      files.push({
        relPath: `.claude/skills/forge-${skill.name}/SKILL.md`,
        content: skill.content,
      });
    }
    for (const cmd of input.commands) {
      files.push({
        relPath: `.claude/commands/forge/${cmd.name}.md`,
        content: cmd.content,
      });
    }
    return { files };
  }

  /**
   * v0.3 Plan 4 — 扫 `.claude/skills/forge-{name}/SKILL.md` + `.claude/commands/forge/{name}.md`
   * legacy v0.2 adapter 产物,供 `forge upgrade` 5 阶段事务使用。
   */
  async detectLegacyArtifacts(projectRoot: string): Promise<LegacyArtifact[]> {
    const skills = await detectLegacySkills(projectRoot, '.claude');
    const commands = await detectLegacyCommands(projectRoot, '.claude');
    return [...skills, ...commands];
  }
}
