// .opencode/plugins/forge.js
// fork from superpowers/.opencode/plugins/superpowers.js,改 default export(避开 PascalCase 命名约定)
// Plan 0a.3 实测 default export 在 OpenCode 下完全 work

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 提取并剥离 SKILL.md frontmatter(用 using-forge body 注入)
const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  return match ? { body: match[2] } : { body: content };
};

export default async ({ client, directory }) => {
  // OpenCode plugin 加载根:从本文件位置反推 plugin 仓库根的 skills/ 目录
  const forgeSkillsDir = path.resolve(__dirname, '../../skills');
  // forge 仓库根绝对路径(供 Tier 2/3 bridge skill 定位 CLI)
  const forgeRepoRoot = path.resolve(__dirname, '../..');

  const getBootstrapContent = () => {
    const skillPath = path.join(forgeSkillsDir, 'using-forge', 'SKILL.md');
    if (!fs.existsSync(skillPath)) return null;
    const { body } = extractAndStripFrontmatter(fs.readFileSync(skillPath, 'utf8'));
    // OpenCode 下 SKILL.md 引用的 Claude Code 工具名(Skill / Task / TodoWrite ...)需要翻译
    // SKILL.md 内已含 Platform Tool Mapping 表,这里再追加一份精简提醒,确保 AI 第一时间用对工具名
    // 避免 AI 尝试 invoke 不存在的 `Skill` 工具导致流程漂移
    const toolMapping = `**Tool Mapping for OpenCode:**
When skills reference tools you don't have, substitute OpenCode equivalents:
- \`TodoWrite\` → \`todowrite\`
- \`Task\` tool with subagents → OpenCode's @mention subagent system
- \`Skill\` tool → OpenCode's native \`skill\` tool
- \`Read\`, \`Write\`, \`Edit\`, \`Bash\` → your native tools

Use OpenCode's native \`skill\` tool to list and load skills.`;
    return `<EXTREMELY_IMPORTANT>\nYou have forge.\n\nforge plugin root: ${forgeRepoRoot}\n\n${body}\n\n${toolMapping}\n</EXTREMELY_IMPORTANT>`;
  };

  return {
    // Hook 1:把 forge skills 目录注入 OpenCode live config
    // → OpenCode 原生 skill discovery 自动找到,用户免 symlink(参考 superpowers 实战)
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(forgeSkillsDir)) {
        config.skills.paths.push(forgeSkillsDir);
      }
    },

    // Hook 2:在每个 session 的 first user message 注入 bootstrap
    // 注意:注入 user message 而非 system message(踩过的坑 — superpowers issue #750/#894)
    'experimental.chat.messages.transform': async (_input, output) => {
      const bootstrap = getBootstrapContent();
      if (!bootstrap || !output.messages.length) return;
      const firstUser = output.messages.find((m) => m.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;
      // 已注入则跳过(防重复)
      if (firstUser.parts.some((p) => p.type === 'text' && p.text.includes('EXTREMELY_IMPORTANT')))
        return;
      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
    },
  };
};
