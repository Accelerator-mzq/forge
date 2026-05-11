// Codex adapter — 铺到 .agents/skills/forge-<name>/SKILL.md
// 关键:Phase 0.5 spike 实测 Codex 用 .agents/(共享 Claude Agent SDK 约定),不是 .codex/
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

export class CodexAdapter implements HarnessAdapter, LegacyDetector {
  readonly id = 'codex' as const;

  async detect(projectRoot: string): Promise<HarnessDetection> {
    const target = join(projectRoot, '.agents');
    try {
      await stat(target);
      return { id: this.id, detected: true, detectedAt: '.agents' };
    } catch {
      return { id: this.id, detected: false };
    }
  }

  async plan(input: DeployInput): Promise<DeployPlan> {
    const files: PlannedFile[] = [];
    for (const skill of input.skills) {
      files.push({
        relPath: `.agents/skills/forge-${skill.name}/SKILL.md`,
        content: skill.content,
      });
    }
    // Codex 暂不需要 commands(spike 阶段只验 skills 自动注入即可触发 brainstorming)
    // commands 模板在 Plan 4 完整 v0.1 时再决定是否需要(可能用 plugin manifest 形式)
    if (input.commands.length > 0) {
      // forge v0.1 先把 commands 写到 .agents/commands/forge/<name>.md(对称 Claude 路径)
      // v0.2 视 Codex 实际行为调整
      for (const cmd of input.commands) {
        files.push({
          relPath: `.agents/commands/forge/${cmd.name}.md`,
          content: cmd.content,
        });
      }
    }
    // v2 plan-9b Task 7b:共用 reference docs 铺到 codex 对应 _shared 容器
    // 路径沿 .agents/skills/forge-<name>/ 约定,_shared 作为伪 skill 容器
    for (const doc of input.sharedDocs ?? []) {
      files.push({
        relPath: `.agents/skills/forge-_shared/${doc.name}.md`,
        content: doc.content,
      });
    }
    return { files };
  }

  /**
   * v0.3 Plan 4 — 扫 `.agents/skills/forge-{name}/SKILL.md` + `.agents/commands/forge/{name}.md`
   * legacy v0.2 codex adapter 产物,供 `forge upgrade` 5 阶段事务使用。
   * 注意:Codex 实际写到 `.agents/`(共享 Agent SDK 约定),不是 `.codex/`。
   */
  async detectLegacyArtifacts(projectRoot: string): Promise<LegacyArtifact[]> {
    const skills = await detectLegacySkills(projectRoot, '.agents');
    const commands = await detectLegacyCommands(projectRoot, '.agents');
    return [...skills, ...commands];
  }
}
