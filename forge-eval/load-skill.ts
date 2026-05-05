// 把 src/core/templates/skills/<name>.md 内容作为 GREEN 跑的 system prompt
// 复用 Plan 4 的 loadSkill loader

import { loadSkill, SKILL_NAMES, type SkillName } from '../src/core/templates/index.js';

export { SKILL_NAMES, type SkillName };

/**
 * 把 SKILL.md 文本(含 frontmatter + body)作为 system message 内容。
 * GREEN 跑时塞入 messages[0];RED 跑时不塞。
 */
export async function loadSkillBootstrap(name: SkillName): Promise<string> {
  const content = await loadSkill(name);
  return content;
}
