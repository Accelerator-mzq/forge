// src/core/validate/change.ts — 顶层 validateChange，读取 change 目录，跑所有 artifact 校验，合并结果
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseProposal, parseSpec, parseDesign, parseTasks } from '../parse/index.js';
import { validateProposal } from './proposal.js';
import { validateSpec } from './specs.js';
import { validateTasks } from './tasks.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

export async function validateChange(changeDir: string): Promise<ValidationResult> {
  const results: ValidationResult[] = [];

  // 校验 proposal.md
  const proposalPath = join(changeDir, 'proposal.md');
  try {
    const text = await readFile(proposalPath, 'utf8');
    results.push(validateProposal(parseProposal(text), proposalPath));
  } catch (err) {
    results.push(
      failed({
        artifact: 'proposal',
        message: `cannot read proposal.md: ${(err as Error).message}`,
        file: proposalPath,
      }),
    );
  }

  // 校验 design.md（只检测能否读取/解析，没有专门 validator）
  const designPath = join(changeDir, 'design.md');
  try {
    const text = await readFile(designPath, 'utf8');
    void parseDesign(text); // 只需检测 throw，不使用返回值
  } catch (err) {
    results.push(
      failed({
        artifact: 'design',
        message: `cannot read design.md: ${(err as Error).message}`,
        file: designPath,
      }),
    );
  }

  // 校验 tasks.md
  const tasksPath = join(changeDir, 'tasks.md');
  try {
    const text = await readFile(tasksPath, 'utf8');
    results.push(validateTasks(parseTasks(text), tasksPath));
  } catch (err) {
    results.push(
      failed({
        artifact: 'tasks',
        message: `cannot read tasks.md: ${(err as Error).message}`,
        file: tasksPath,
      }),
    );
  }

  // 校验 specs/*.md 目录下所有 spec 文件
  const specsDir = join(changeDir, 'specs');
  try {
    const entries = await readdir(specsDir);
    const mdFiles = entries.filter((n) => n.endsWith('.md'));
    if (mdFiles.length === 0) {
      results.push(
        failed({ artifact: 'specs', message: 'no spec files in specs/', file: specsDir }),
      );
    }
    for (const name of mdFiles) {
      const path = join(specsDir, name);
      const text = await readFile(path, 'utf8');
      results.push(validateSpec(parseSpec(text), path));
    }
  } catch (err) {
    results.push(
      failed({
        artifact: 'specs',
        message: `cannot read specs/: ${(err as Error).message}`,
        file: specsDir,
      }),
    );
  }

  // 没有任何结果表示空目录，直接返回 ok；否则合并所有结果
  return results.length === 0 ? ok() : mergeResults(...results);
}
