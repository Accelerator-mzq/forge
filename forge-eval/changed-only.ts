// changed-only 模式:取 git diff <base>..HEAD 中改动的 skill 名,只跑相关 scenarios
// Plan 5 v0.1 不实现 transitive 关联(skill A 改了不会自动跑 skill B 的 scenario)

import { execFileSync } from 'node:child_process';
import { SKILL_NAMES, type SkillName } from './load-skill.js';

/**
 * 取 base..HEAD 范围内改动的文件,过滤出与 forge-eval 有关的 skill 名。
 * 来源:
 *  - src/core/templates/skills/<name>.md(skill 文本改动)
 *  - forge-eval/scenarios/<name>.yaml(scenario 改动)
 *
 * 默认 base 是 origin/main,可通过 process.env.EVAL_DIFF_BASE 覆盖(CI 中由 GitHub Actions 设)。
 */
export function getChangedSkills(base = process.env['EVAL_DIFF_BASE'] ?? 'origin/main'): SkillName[] {
  const stdout = execFileSync('git', ['diff', '--name-only', `${base}..HEAD`], {
    encoding: 'utf8',
  });
  const changedFiles = stdout.split(/\r?\n/).filter(Boolean);

  const changedSet = new Set<SkillName>();
  for (const file of changedFiles) {
    const skillFromTemplate = matchSkillTemplate(file);
    if (skillFromTemplate) changedSet.add(skillFromTemplate);
    const skillFromScenario = matchScenarioFile(file);
    if (skillFromScenario) changedSet.add(skillFromScenario);
  }

  return Array.from(changedSet);
}

// 匹配 src/core/templates/skills/<name>.md 路径的正则
const TEMPLATE_RE = /^src\/core\/templates\/skills\/([a-z][a-z0-9-]+)\.md$/;
// 匹配 forge-eval/scenarios/<name>.yaml 路径的正则
const SCENARIO_RE = /^forge-eval\/scenarios\/([a-z][a-z0-9-]+)\.yaml$/;

/**
 * 从 skill template 文件路径提取 skill 名(单测可 import)
 * 返回合法 SkillName 或 null(未知 skill 名 / 路径不匹配)
 */
export function matchSkillTemplate(file: string): SkillName | null {
  const m = TEMPLATE_RE.exec(file);
  if (!m || !m[1]) return null;
  return SKILL_NAMES.includes(m[1] as SkillName) ? (m[1] as SkillName) : null;
}

/**
 * 从 scenario YAML 文件路径提取 skill 名(单测可 import)
 * 返回合法 SkillName 或 null(未知 skill 名 / 路径不匹配)
 */
export function matchScenarioFile(file: string): SkillName | null {
  const m = SCENARIO_RE.exec(file);
  if (!m || !m[1]) return null;
  return SKILL_NAMES.includes(m[1] as SkillName) ? (m[1] as SkillName) : null;
}
