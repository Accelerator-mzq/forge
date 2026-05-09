// Plan 4 Task 4.2 — LegacyDetector 共享 helper(scan + sha256)
// 由 ClaudeAdapter + CodexAdapter 复用。

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { LegacyArtifact } from './interface.js';

/** sha256 of file content(hex string) */
export async function sha256OfFile(absPath: string): Promise<string> {
  const content = await readFile(absPath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 扫 `<projectRoot>/<skillsParent>/skills/forge-{name}/SKILL.md` 形态的 legacy skill 产物。
 * Claude:`skillsParent = '.claude'`;Codex:`skillsParent = '.agents'`。
 */
export async function detectLegacySkills(
  projectRoot: string,
  skillsParent: string,
): Promise<LegacyArtifact[]> {
  const artifacts: LegacyArtifact[] = [];
  const skillsDir = join(projectRoot, skillsParent, 'skills');

  if (!existsSync(skillsDir)) return artifacts;

  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch {
    return artifacts;
  }

  for (const name of entries) {
    if (!name.startsWith('forge-')) continue;
    const skillFile = join(skillsDir, name, 'SKILL.md');
    try {
      await stat(skillFile);
      const relPath = `${skillsParent}/skills/${name}/SKILL.md`;
      artifacts.push({
        // POSIX-style:确保 Windows 反斜杠不混入
        relPath: relPath.split('\\').join('/'),
        sha256: await sha256OfFile(skillFile),
        type: 'skill',
      });
    } catch {
      // 单文件缺失,跳
    }
  }

  return artifacts;
}

/**
 * 扫 `<projectRoot>/<commandsParent>/commands/forge/*.md` 形态的 legacy command 产物。
 * Claude:`commandsParent = '.claude'`;Codex:`commandsParent = '.agents'`。
 */
export async function detectLegacyCommands(
  projectRoot: string,
  commandsParent: string,
): Promise<LegacyArtifact[]> {
  const artifacts: LegacyArtifact[] = [];
  const cmdsDir = join(projectRoot, commandsParent, 'commands', 'forge');

  if (!existsSync(cmdsDir)) return artifacts;

  let entries: string[];
  try {
    entries = await readdir(cmdsDir);
  } catch {
    return artifacts;
  }

  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    const cmdFile = join(cmdsDir, name);
    try {
      await stat(cmdFile);
      const relPath = `${commandsParent}/commands/forge/${name}`;
      artifacts.push({
        relPath: relPath.split('\\').join('/'),
        sha256: await sha256OfFile(cmdFile),
        type: 'command',
      });
    } catch {
      // 跳
    }
  }

  return artifacts;
}
