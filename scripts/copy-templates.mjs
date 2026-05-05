#!/usr/bin/env node
// 把 src/core/templates/{skills,commands}/*.md 复制到 dist/ 对应位置
// tsc 不会复制非 TS 文件,因此构建时显式拷贝,确保运行时 readFile 能找到模板

import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const groups = [
  { src: 'src/core/templates/skills', dst: 'dist/core/templates/skills' },
  { src: 'src/core/templates/commands', dst: 'dist/core/templates/commands' },
];

for (const { src, dst } of groups) {
  const srcAbs = join(repoRoot, src);
  const dstAbs = join(repoRoot, dst);
  if (!existsSync(srcAbs)) {
    console.error(`✗ 模板源目录不存在:${srcAbs}`);
    process.exit(1);
  }
  await mkdir(dstAbs, { recursive: true });
  const entries = await readdir(srcAbs);
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    await copyFile(join(srcAbs, name), join(dstAbs, name));
  }
  console.log(`✓ copied ${entries.filter((n) => n.endsWith('.md')).length} files: ${src} → ${dst}`);
}
