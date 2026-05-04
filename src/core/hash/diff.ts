// diff_hash：对 `git diff HEAD -- <pathspec>` 输出做 SHA256 — spec §3.4
// 通过 include/exclude pathspec 精准控制哪些文件参与 hash 计算，
// 防止 .verify-passed 等 marker 文件写入后污染 diff（自引用悖论）。

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_CODE_EXCLUDE } from '../schema/index.js';

const execFileAsync = promisify(execFile);

/**
 * diff hash 的默认排除 glob 列表（等同于 DEFAULT_CODE_EXCLUDE）。
 * 包含所有 marker 文件路径，确保 marker 写入不会影响代码 diff hash。
 */
export const DEFAULT_DIFF_EXCLUDE = DEFAULT_CODE_EXCLUDE;

/**
 * git diff pathspec 参数结构。
 * include：要纳入 diff 的 glob 路径列表（如 ['src/**']）。
 * exclude：要排除的 glob 路径列表（用 `:!<glob>` 语法传给 git）。
 */
export interface DiffPathspec {
  include: string[];
  exclude: string[];
}

/**
 * 计算 diff hash。
 *
 * 执行 `git diff HEAD -- <include...> :!<exclude...>`，对 stdout 做 SHA256。
 * 当工作区与 HEAD 完全一致时（无未提交修改），diff 为空，hash 为空字符串的 SHA256。
 *
 * @param repoRoot git 仓库根目录（绝对路径）
 * @param pathspec include/exclude pathspec 配置
 * @returns `sha256:<64位hex>` 格式的 hash 字符串
 */
export async function computeDiffHash(repoRoot: string, pathspec: DiffPathspec): Promise<string> {
  // 构建 git diff 参数：'diff HEAD -- <include> :!<exclude>'
  const args: string[] = ['diff', 'HEAD', '--'];
  for (const p of pathspec.include) args.push(p);
  for (const e of pathspec.exclude) args.push(`:!${e}`);

  const { stdout } = await execFileAsync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024, // 50 MB，大 diff 兜底
  });

  // 对 diff 输出做 SHA256，空 diff 也会得到固定 hash
  const sha = createHash('sha256').update(stdout, 'utf8').digest('hex');
  return `sha256:${sha}`;
}
