#!/usr/bin/env node
// v0.3 重写:反向同步 — 仓库根 skills/ + commands/ 是 source of truth(plugin 直接读)
// 然后写入 src/core/templates/{skills,commands}/(legacy `forge init` 仍读这,v0.4 移除)
// 然后写入 dist/core/templates/(npm package 运行时读这)

import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 只清目录内 .md 文件,保留 .ts(registry)
async function clearMarkdownFiles(dir) {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir);
  for (const name of entries) {
    if (name.endsWith('.md')) {
      await unlink(join(dir, name));
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// 同步 skills:仓库根 skills/<name>/SKILL.md → src/core/templates/skills/<name>.md → dist/core/templates/skills/<name>.md
async function syncSkills() {
  const srcDir = join(REPO_ROOT, 'skills');
  if (!existsSync(srcDir)) {
    console.error(`✗ skills 源目录不存在:${srcDir}`);
    process.exit(1);
  }
  const skillNames = await readdir(srcDir);
  const validSkills = [];
  for (const name of skillNames) {
    const skillFile = join(srcDir, name, 'SKILL.md');
    if (existsSync(skillFile)) validSkills.push(name);
  }

  // 写入 src/core/templates/skills/(legacy 兼容)
  // 关键:legacy `forge init` 路径下 skill 装到项目级 .claude/skills/forge-<name>/,
  //      没有 plugin namespace,frontmatter 必须显式带 `name: forge:<name>` 前缀避免冲突。
  //      所以 reverse-sync 写入 src/core/templates 时,给 frontmatter `name:` 加回前缀。
  //      根 skills/(plugin 用)保持无前缀,plugin namespace 隐含 forge:
  const srcTemplatesDir = join(REPO_ROOT, 'src', 'core', 'templates', 'skills');
  await mkdir(srcTemplatesDir, { recursive: true });
  await clearMarkdownFiles(srcTemplatesDir);
  for (const name of validSkills) {
    const content = await readFile(join(srcDir, name, 'SKILL.md'), 'utf8');
    const legacyContent = content.replace(/^name: (?!forge:)([\w-]+)$/m, 'name: forge:$1');
    await writeFile(join(srcTemplatesDir, `${name}.md`), legacyContent, 'utf8');
  }

  // 写入 dist/core/templates/skills/(npm package 运行时,与 src/core/templates 一致 — 给 legacy `forge init` 用)
  const distDir = join(REPO_ROOT, 'dist', 'core', 'templates', 'skills');
  await mkdir(distDir, { recursive: true });
  for (const name of validSkills) {
    const content = await readFile(join(srcDir, name, 'SKILL.md'), 'utf8');
    const legacyContent = content.replace(/^name: (?!forge:)([\w-]+)$/m, 'name: forge:$1');
    await writeFile(join(distDir, `${name}.md`), legacyContent, 'utf8');
  }

  console.log(`✓ synced ${validSkills.length} skills (root → src/core/templates/ + dist/)`);
  return validSkills;
}

// 同步 commands:仓库根 commands/<name>.md → src/core/templates/commands/ → dist/core/templates/commands/
async function syncCommands() {
  const srcDir = join(REPO_ROOT, 'commands');
  if (!existsSync(srcDir)) {
    console.error(`✗ commands 源目录不存在:${srcDir}`);
    process.exit(1);
  }
  const cmdFiles = (await readdir(srcDir)).filter((n) => n.endsWith('.md'));

  const srcTemplatesDir = join(REPO_ROOT, 'src', 'core', 'templates', 'commands');
  await mkdir(srcTemplatesDir, { recursive: true });
  await clearMarkdownFiles(srcTemplatesDir);
  for (const name of cmdFiles) {
    const content = await readFile(join(srcDir, name), 'utf8');
    await writeFile(join(srcTemplatesDir, name), content, 'utf8');
  }

  const distDir = join(REPO_ROOT, 'dist', 'core', 'templates', 'commands');
  await mkdir(distDir, { recursive: true });
  for (const name of cmdFiles) {
    const content = await readFile(join(srcDir, name), 'utf8');
    await writeFile(join(distDir, name), content, 'utf8');
  }

  console.log(`✓ synced ${cmdFiles.length} commands (root → src/core/templates/ + dist/)`);
  return cmdFiles;
}

await syncSkills();
await syncCommands();
