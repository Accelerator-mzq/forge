// templates 模块顶层导出 — Plan 4
// 把 skills + commands 两个 sub-registry 聚合成单一入口

export {
  SKILL_NAMES,
  loadSkill,
  loadAllSkills,
  type SkillName,
  type LoadedSkill,
} from './skills/index.js';

export {
  COMMAND_NAMES,
  loadCommand,
  loadAllCommands,
  type CommandName,
  type LoadedCommand,
} from './commands/index.js';
