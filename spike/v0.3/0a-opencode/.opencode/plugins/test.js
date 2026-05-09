// .opencode/plugins/test.js
// fork from superpowers/.opencode/plugins/superpowers.js,改名 superpowers → test

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  return match ? { body: match[2] } : { body: content };
};

// 注意:用 default export 而非命名 export
// 原因:OpenCode plugin discovery 对命名 export 有 PascalCase(包名)约定
// (superpowers 包名 superpowers ↔ export SuperpowersPlugin)。本 spike 包名 forge-spike-test
// 若用命名 export 应是 ForgeSpikeTestPlugin,易拼错 → Path A 加载 FAIL 误判为协议失败
// default export 完全绕开命名约定,OpenCode 直接拿 default 就 work
export default async ({ client, directory }) => {
  const testSkillsDir = path.resolve(__dirname, '../../skills');

  const getBootstrapContent = () => {
    const skillPath = path.join(testSkillsDir, 'using-test', 'SKILL.md');
    if (!fs.existsSync(skillPath)) return null;
    const { body } = extractAndStripFrontmatter(fs.readFileSync(skillPath, 'utf8'));
    return `<EXTREMELY_IMPORTANT>\nThis is spike protocol test.\n\n${body}\n</EXTREMELY_IMPORTANT>`;
  };

  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(testSkillsDir)) {
        config.skills.paths.push(testSkillsDir);
      }
    },

    'experimental.chat.messages.transform': async (_input, output) => {
      const bootstrap = getBootstrapContent();
      if (!bootstrap || !output.messages.length) return;
      const firstUser = output.messages.find((m) => m.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;
      if (firstUser.parts.some((p) => p.type === 'text' && p.text.includes('EXTREMELY_IMPORTANT')))
        return;
      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
    },
  };
};
