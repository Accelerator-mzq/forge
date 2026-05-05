// marker integrity 验证 — Plan 3 reviewer P1.2 + P1.3
// archive 命令调用,做 schema 校验之外的"内容真实性"验证

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { computeLogHash, computeDiffHash } from '../hash/index.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * 验证 verify marker 的 evidence 完整性(P1.2)。
 * 每条 evidence:
 *   - log_path(相对 marker 文件目录)必须存在
 *   - log 文件字节 SHA256 必须等于 log_hash
 *   - pass 必须为 true
 */
export async function validateEvidence(
  marker: Record<string, unknown>,
  markerPath: string,
): Promise<ValidationResult> {
  const evidence = marker['evidence'];
  if (!Array.isArray(evidence)) {
    return failed({
      artifact: 'marker',
      field: 'evidence',
      message: 'must be array',
      file: markerPath,
    });
  }
  const markerDir = dirname(markerPath);
  const results: ValidationResult[] = [];

  for (let i = 0; i < evidence.length; i++) {
    const e = evidence[i] as Record<string, unknown>;
    const logPath = e['log_path'] as string;
    const expectedHash = e['log_hash'] as string;
    const pass = e['pass'];

    // log_path 是相对 marker 目录的路径
    const absLogPath = join(markerDir, logPath);
    if (!existsSync(absLogPath)) {
      results.push(
        failed({
          artifact: 'marker',
          field: `evidence[${i}].log_path`,
          message: `log 文件不存在: ${absLogPath}`,
          file: markerPath,
        }),
      );
      continue; // 文件不存在,跳过后续验证
    }

    // 字节级 SHA256 校验
    const actualHash = await computeLogHash(absLogPath);
    if (actualHash !== expectedHash) {
      results.push(
        failed({
          artifact: 'marker',
          field: `evidence[${i}].log_hash`,
          message: `期望 ${expectedHash},实际 ${actualHash}(log 已修改或损坏)`,
          file: markerPath,
        }),
      );
    }

    // pass 必须为 true
    if (pass !== true) {
      results.push(
        failed({
          artifact: 'marker',
          field: `evidence[${i}].pass`,
          message: 'must be true(失败的测试不能进 verify-passed)',
          file: markerPath,
        }),
      );
    }
  }

  return results.length === 0 ? ok() : mergeResults(...results);
}

/**
 * 验证 review marker 的 git 完整性(P1.3)。
 * 仅在 git.is_git_repo === true 时验证;非 git 由调用方决定是否 --force。
 *
 * 验证项:
 *   - 重算 git.head(`git rev-parse HEAD`)与 marker 中的 head 比对
 *   - 重算 git.diff_hash(用 marker 中的 diff_pathspec)与 marker 中的 diff_hash 比对
 */
export async function validateReviewGitIntegrity(
  marker: Record<string, unknown>,
  repoRoot: string,
  markerPath: string,
): Promise<ValidationResult> {
  const git = marker['git'] as Record<string, unknown>;
  if (!git || git['is_git_repo'] !== true) {
    // non-git 不在这里验证(由 archive 命令决定 --force)
    return ok();
  }

  // 重算 git.head
  let actualHead: string;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    actualHead = stdout.trim();
  } catch (err) {
    return failed({
      artifact: 'marker',
      field: 'git.head',
      message: `git rev-parse HEAD 失败: ${(err as Error).message}`,
      file: markerPath,
    });
  }

  if (actualHead !== git['head']) {
    return failed({
      artifact: 'marker',
      field: 'git.head',
      message: `期望 ${String(git['head'])},实际 ${actualHead}(代码已 commit / HEAD 已变)`,
      file: markerPath,
    });
  }

  // 重算 diff_hash,使用 marker 自身的 pathspec
  const ps = git['diff_pathspec'] as { include: string[]; exclude: string[] };
  let actualDiffHash: string;
  try {
    actualDiffHash = await computeDiffHash(repoRoot, { include: ps.include, exclude: ps.exclude });
  } catch (err) {
    return failed({
      artifact: 'marker',
      field: 'git.diff_hash',
      message: `计算 diff_hash 失败: ${(err as Error).message}`,
      file: markerPath,
    });
  }

  if (actualDiffHash !== git['diff_hash']) {
    return failed({
      artifact: 'marker',
      field: 'git.diff_hash',
      message: `期望 ${String(git['diff_hash'])},实际 ${actualDiffHash}(workspace 代码已改动)`,
      file: markerPath,
    });
  }

  return ok();
}

/**
 * 验证 review_outcomes(P1.3 子项)。
 * 每条 accepted=true 必须 resolved=true。
 */
export function validateReviewOutcomes(
  marker: Record<string, unknown>,
  markerPath: string,
): ValidationResult {
  const outcomes = marker['review_outcomes'];
  if (!Array.isArray(outcomes)) {
    return failed({
      artifact: 'marker',
      field: 'review_outcomes',
      message: 'must be array',
      file: markerPath,
    });
  }

  const results: ValidationResult[] = [];
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i] as Record<string, unknown>;
    if (o['accepted'] === true && o['resolved'] !== true) {
      results.push(
        failed({
          artifact: 'marker',
          field: `review_outcomes[${i}].resolved`,
          message: 'accepted=true 必须 resolved=true(spec §3.1 T4)',
          file: markerPath,
        }),
      );
    }
  }

  return results.length === 0 ? ok() : mergeResults(...results);
}

/**
 * 读取文件内容,用于内容比对(P2.2 recover case B 校验)。
 */
export async function readFileContent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}
