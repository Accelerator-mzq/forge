// 13 个 skill 真实文本的 registry — Plan 4 + plan-9i
// 文件实体 .md 由 Task B 逐个填实

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 14 个移植 skill 名(spec §2.2 12 skill 表 + plan-9i writing-skills + plan-9d verifying-three-dimensions) */
export const SKILL_NAMES = [
  'using-forge',
  'brainstorming',
  'writing-plans',
  'subagent-driven-development',
  'test-driven-development',
  'requesting-code-review',
  'receiving-code-review',
  'verification-before-completion',
  'systematic-debugging',
  'dispatching-parallel-agents',
  'using-git-worktrees',
  'finishing-a-development-branch',
  'writing-skills', // 9i 新增(沿 design §2.9 协议落地 + plan-9i v7)
  'verifying-three-dimensions', // 9d 新增(沿 design §2.2 协议落地 + plan-9d v15)
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

/** 单 skill 内容加载 — 用 import.meta.url 定位,开发与生产路径自适应 */
export async function loadSkill(name: SkillName): Promise<string> {
  return readFile(join(__dirname, `${name}.md`), 'utf8');
}

export interface LoadedSkill {
  name: SkillName;
  content: string;
}

/** 全量加载 14 个 skill,失败抛错(说明某个 .md 漏建) */
export async function loadAllSkills(): Promise<LoadedSkill[]> {
  return Promise.all(SKILL_NAMES.map(async (name) => ({ name, content: await loadSkill(name) })));
}

/** 加载 _shared/*.md 全部 reference docs(plan-9b §2.6.8) */
export async function loadAllSharedDocs(): Promise<Array<{ name: string; content: string }>> {
  const sharedDir = join(__dirname, '_shared');
  let entries: string[];
  try {
    entries = await readdir(sharedDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const mdFiles = entries.filter((n) => n.endsWith('.md'));
  return Promise.all(
    mdFiles.map(async (filename) => ({
      name: filename.replace(/\.md$/, ''),
      content: await readFile(join(sharedDir, filename), 'utf8'),
    })),
  );
}
