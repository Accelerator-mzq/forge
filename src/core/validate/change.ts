// src/core/validate/change.ts — 顶层 validateChange，读取 change 目录，跑所有 artifact 校验，合并结果
// v2 B1 + v3 B1 修订:计算真实运行时 ctx(contentHash + gitHead),不含 ephemeral runId
// v3 B2 修订:fs 错(cannot read X)不标 severity + [fs] message 前缀;business-fail 标 CRITICAL
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseProposal, parseSpec, parseDesign, parseTasks } from '../parse/index.js';
import { validateProposal } from './proposal.js';
import { validateSpec } from './specs.js';
import { validateTasks } from './tasks.js';
import { validateScopeEntries } from './scope-entries.js';
import { computeContentHash } from '../hash/content.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

export async function validateChange(changeDir: string): Promise<ValidationResult> {
  const results: ValidationResult[] = [];

  // v2 B1 + v3 B1 修订:计算真实稳定运行时 ctx(不含 ephemeral runId)
  // 用于 validateScopeEntries 的 finding_hash 绑定
  let ctx: { contentHash: string; gitHead: string };
  try {
    ctx = {
      contentHash: await computeContentHash(changeDir),
      gitHead: getGitHead() ?? 'no-git-head',
    };
  } catch {
    // computeContentHash 抛错(罕见 — 仅 specs/ 非 ENOENT 类 IO 错)
    // 退化为 'no-content-hash' 让校验仍能跑(scope finding 仍可产但 hash 弱化)
    ctx = { contentHash: 'no-content-hash', gitHead: 'no-git-head' };
  }

  // 校验 proposal.md
  const proposalPath = join(changeDir, 'proposal.md');
  try {
    const text = await readFile(proposalPath, 'utf8');
    // 校验 proposal 结构
    results.push(validateProposal(parseProposal(text), proposalPath));
    // plan-9b Task 4:同时校验 proposal.md 中 scope anchor 三段 YAML block
    const scopeP = validateScopeEntries(text, proposalPath, ctx);
    if (!scopeP.valid) {
      for (const e of scopeP.errors) results.push({ valid: false, errors: [e], warnings: [] });
    }
  } catch (err) {
    // v3 B2 修订:fs 错不标 severity(走 exit 2);message 加 '[fs]' 前缀
    results.push(
      failed({
        artifact: 'proposal',
        message: `[fs] cannot read proposal.md: ${(err as Error).message}`,
        file: proposalPath,
      }),
    );
  }

  // 校验 design.md（只检测能否读取/解析，没有专门 validator）
  const designPath = join(changeDir, 'design.md');
  try {
    const text = await readFile(designPath, 'utf8');
    void parseDesign(text); // 只需检测 throw，不使用返回值
    // plan-9b Task 4:同时校验 design.md 中 scope anchor 三段 YAML block
    const scopeD = validateScopeEntries(text, designPath, ctx);
    if (!scopeD.valid) {
      for (const e of scopeD.errors) results.push({ valid: false, errors: [e], warnings: [] });
    }
  } catch (err) {
    // v3 B2 修订:fs 错不标 severity(走 exit 2);message 加 '[fs]' 前缀
    results.push(
      failed({
        artifact: 'design',
        message: `[fs] cannot read design.md: ${(err as Error).message}`,
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
    // v3 B2 修订:fs 错不标 severity(走 exit 2);message 加 '[fs]' 前缀
    results.push(
      failed({
        artifact: 'tasks',
        message: `[fs] cannot read tasks.md: ${(err as Error).message}`,
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
      // v3 B2 修订:specs/ 存在但空 — business-fail,标 CRITICAL → exit 1
      results.push(
        failed({
          artifact: 'specs',
          message: 'no spec files in specs/',
          file: specsDir,
          severity: 'CRITICAL',
        }),
      );
    }
    for (const name of mdFiles) {
      const path = join(specsDir, name);
      const text = await readFile(path, 'utf8');
      results.push(validateSpec(parseSpec(text), path));
    }
  } catch (err) {
    // v3 B2 修订:fs 错不标 severity(走 exit 2);message 加 '[fs]' 前缀
    results.push(
      failed({
        artifact: 'specs',
        message: `[fs] cannot read specs/: ${(err as Error).message}`,
        file: specsDir,
      }),
    );
  }

  // 没有任何结果表示空目录，直接返回 ok；否则合并所有结果
  return results.length === 0 ? ok() : mergeResults(...results);
}

/**
 * 获取当前 git HEAD commit SHA(40-char hex)。
 * 非 git 仓库或 git 命令不可用时返回 null。
 */
function getGitHead(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
