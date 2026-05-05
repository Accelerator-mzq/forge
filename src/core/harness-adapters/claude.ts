// Claude Code adapter — 铺到 .claude/skills/forge-<name>/SKILL.md 和 .claude/commands/forge/<name>.md
// 路径基于 Phase 0.5 spike 实测(spike/claude-code/.claude/...)

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessAdapter, DeployPlan, PlannedFile } from './interface.js';
import type { DeployInput, HarnessDetection } from './types.js';

export class ClaudeAdapter implements HarnessAdapter {
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
}
