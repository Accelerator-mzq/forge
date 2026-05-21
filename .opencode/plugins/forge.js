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

// ─── workflow-monitor 开关 scanner ──────────────────────────────────────────
// 以下两函数 inline copy 自 hooks/monitor-check.mjs(spec §9 契约同款),改一处必须同步另一处
// inline 而非 import:OpenCode plugin loader 不一定支持 import sibling .mjs;同步成本低于 module 重构

/** 去掉行内第一个非引号包裹的 # 起的注释(同 monitor-check.mjs#stripComment) */
const stripCommentForMonitor = (line) => {
  let inStr = false;
  let quote = '';
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (inStr) {
      if (c === quote) inStr = false;
    } else if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
    } else if (c === '#') {
      return line.slice(0, k);
    }
  }
  return line;
};

/**
 * 扫 forge/config.yaml 文本判断 monitor.enabled=true(同 monitor-check.mjs#scanMonitorEnabled)
 * - 顶层 monitor: 块,enabled 严格裸 true 才返回 true;
 * - 支持块式与 inline flow 式;
 * - 任何异常一律按 disabled 处理(调用方包 try-catch)。
 */
const scanMonitorEnabled = (text) => {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = stripCommentForMonitor(lines[i]);
    const m = /^monitor:\s*(.*)$/.exec(raw);
    if (!m) continue;
    const rest = m[1].trim();
    if (rest.startsWith('{')) {
      return /\benabled\s*:\s*true\s*[},]/.test(rest + ',');
    }
    for (let j = i + 1; j < lines.length; j++) {
      const sub = stripCommentForMonitor(lines[j]);
      if (sub.trim() === '') continue;
      if (!/^\s/.test(sub)) break;
      const e = /^\s+enabled\s*:\s*(\S+)\s*$/.exec(sub);
      if (e) return e[1] === 'true';
    }
    return false;
  }
  return false;
};

export default async ({ client, directory }) => {
  // OpenCode plugin 加载根:从本文件位置反推 plugin 仓库根的 skills/ 目录
  const forgeSkillsDir = path.resolve(__dirname, '../../skills');
  // forge 仓库根绝对路径(供 Tier 2/3 bridge skill 定位 CLI)
  const forgeRepoRoot = path.resolve(__dirname, '../..');

  // workflow-monitor 注入获取(spec §9 — Tier 1 走 SessionStart hook,Tier 2 OpenCode 走本函数)
  // 兜底链:directory(OpenCode plugin context 的项目根)→ process.cwd();任一异常按 disabled 处理
  const getMonitorInjection = () => {
    try {
      const projectRoot = directory || process.cwd();
      const configPath = path.join(projectRoot, 'forge', 'config.yaml');
      if (!fs.existsSync(configPath)) return null;
      const configText = fs.readFileSync(configPath, 'utf8');
      if (!scanMonitorEnabled(configText)) return null;
      const injectionPath = path.join(forgeRepoRoot, 'hooks', 'workflow-monitor-injection.md');
      if (!fs.existsSync(injectionPath)) return null;
      return fs.readFileSync(injectionPath, 'utf8');
    } catch {
      // 任何异常一律安全侧默认 disabled,绝不阻塞 session 启动
      return null;
    }
  };

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
    // workflow-monitor 注入(forge/config.yaml#monitor.enabled=true 时拼接;否则空段)
    // 对齐 Tier 1 Claude Code SessionStart hook 行为
    const monitorInjection = getMonitorInjection();
    const monitorSection = monitorInjection ? `\n\n${monitorInjection}` : '';
    return `<EXTREMELY_IMPORTANT>\nYou have forge.\n\nforge plugin root: ${forgeRepoRoot}\n\n${body}\n\n${toolMapping}${monitorSection}\n</EXTREMELY_IMPORTANT>`;
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
