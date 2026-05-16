#!/usr/bin/env node
// v0.3 重写:反向同步 — 仓库根 skills/ + commands/ 是 source of truth(plugin 直接读)
// 然后写入 src/core/templates/{skills,commands}/(legacy `forge init` 仍读这,v0.4 移除)
// 然后写入 dist/core/templates/(npm package 运行时读这)

import { mkdir, readdir, readFile, writeFile, unlink, rm } from 'node:fs/promises';
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

// 同步 skills/_shared/*.md → src/core/templates/skills/_shared/ → dist/core/templates/skills/_shared/
// plan-9b §2.6.8:跨 skill 共用 reference(被 receiving-code-review / verifying-three-dimensions / exploring 引用)
// v2 codex MAJOR 4 修订:_shared 缺失 fail-fast — 防止 release CI 静默缺漏 runtime 404
async function syncSharedSkillDocs() {
  const srcDir = join(REPO_ROOT, 'skills', '_shared');
  if (!existsSync(srcDir)) {
    console.error(`✗ skills/_shared/ 缺失:${srcDir}`);
    console.error('  plan-9b §2.6.8 要求 _shared 目录在部署清单中存在;请检查是否被误删');
    process.exit(1);
  }
  const mdFiles = (await readdir(srcDir)).filter((n) => n.endsWith('.md'));
  if (mdFiles.length === 0) {
    console.error(`✗ skills/_shared/ 为空:期望至少含 scope-category-guidance.md(plan-9b 交付)`);
    process.exit(1);
  }

  // 写入 src/core/templates/skills/_shared/
  const srcTemplatesDir = join(REPO_ROOT, 'src', 'core', 'templates', 'skills', '_shared');
  await mkdir(srcTemplatesDir, { recursive: true });
  await clearMarkdownFiles(srcTemplatesDir);
  for (const name of mdFiles) {
    const content = await readFile(join(srcDir, name), 'utf8');
    await writeFile(join(srcTemplatesDir, name), content, 'utf8');
  }

  // 写入 dist/core/templates/skills/_shared/(npm package 运行时)
  const distDir = join(REPO_ROOT, 'dist', 'core', 'templates', 'skills', '_shared');
  await mkdir(distDir, { recursive: true });
  for (const name of mdFiles) {
    const content = await readFile(join(srcDir, name), 'utf8');
    await writeFile(join(distDir, name), content, 'utf8');
  }

  console.log(
    `✓ synced ${mdFiles.length} shared skill docs (skills/_shared/ → src/core/templates/skills/_shared/ + dist/)`,
  );
  return mdFiles;
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

// 同步 skill 自带的 references/ 子目录:skills/<name>/references/*.md
// → src/core/templates/skills/<name>/references/ → dist/core/templates/skills/<name>/references/
// syncSkills() 只同步 <name>/SKILL.md 忽略子目录;带 references/ 的 skill 需此函数
// 补同步 per-skill references/ 子目录(注:templates 非 skills/ 的逐文件完整镜像)。
async function syncSkillReferences() {
  const skillsDir = join(REPO_ROOT, 'skills');
  const templateRoots = [
    join(REPO_ROOT, 'src', 'core', 'templates', 'skills'),
    join(REPO_ROOT, 'dist', 'core', 'templates', 'skills'),
  ];
  // 真镜像第一步:删两个目标根下所有已存在的 per-skill references/ 子目录,
  // 防止源 skill 删掉/清空 references/ 后,目标残留 stale 文件。
  for (const root of templateRoots) {
    if (!existsSync(root)) continue;
    for (const name of await readdir(root)) {
      const staleRefDir = join(root, name, 'references');
      if (existsSync(staleRefDir)) await rm(staleRefDir, { recursive: true, force: true });
    }
  }
  // 真镜像第二步:从源逐个 skill 重建 references/
  let count = 0;
  for (const name of await readdir(skillsDir)) {
    const refDir = join(skillsDir, name, 'references');
    if (!existsSync(refDir)) continue;
    const mdFiles = (await readdir(refDir)).filter((n) => n.endsWith('.md'));
    if (mdFiles.length === 0) continue;
    for (const root of templateRoots) {
      const target = join(root, name, 'references');
      await mkdir(target, { recursive: true });
      for (const f of mdFiles) {
        await writeFile(join(target, f), await readFile(join(refDir, f), 'utf8'), 'utf8');
      }
    }
    count += mdFiles.length;
  }
  console.log(
    `✓ synced ${count} skill reference docs (skills/<name>/references/ → src/core/templates/ + dist/)`,
  );
}

// 同步 backlog assets:src/core/backlog/assets/*.md → dist/core/backlog/assets/
async function syncBacklogAssets() {
  const srcDir = join(REPO_ROOT, 'src', 'core', 'backlog', 'assets');
  if (!existsSync(srcDir)) return;
  const distDir = join(REPO_ROOT, 'dist', 'core', 'backlog', 'assets');
  await mkdir(distDir, { recursive: true });
  const mdFiles = (await readdir(srcDir)).filter((n) => n.endsWith('.md'));
  for (const name of mdFiles) {
    await writeFile(join(distDir, name), await readFile(join(srcDir, name), 'utf8'), 'utf8');
  }
  console.log(`✓ synced ${mdFiles.length} backlog assets`);
}

await syncSkills();
await syncSkillReferences(); // skill 自带 references/ 子目录(plan-port-discipline)
await syncSharedSkillDocs(); // plan-9b §2.6.8(v2 修订:fail-fast)
await syncCommands();
await syncBacklogAssets(); // plan-backlog-registry
