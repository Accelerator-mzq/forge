// src/core/archive/version-retrograde-fence.ts — plan-9j Task 4
// 沿 design §3.4.4.3 — 校验 created_by_tool_version 字段不能从高版本回降低版本

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { relative } from 'node:path';
import { type ValidationResult, ok, failed } from '../validate/types.js';

const execFileAsync = promisify(execFile);

/** semver 字符串解析为可比较数组 [major, minor, patch] — 忽略 prerelease/build */
function parseSemver(v: string): [number, number, number] | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1] ?? '0', 10), parseInt(m[2] ?? '0', 10), parseInt(m[3] ?? '0', 10)];
}

/** 比较两个 semver — return >0 if a>b, <0 if a<b, 0 if equal */
function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0; // 非 semver 视为相等(由 marker-schema 检 + 拒签)
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

/**
 * 校验 marker 的 created_by_tool_version 字段不能从高版本回降低版本
 *
 * @param markerPath marker 文件绝对路径
 * @param marker 解析后的 Record
 * @param gitDir 可选,git 仓库根目录(用于 `git log`);非 git 项目 → 跳过 best-effort
 */
export async function validateVersionRetrograde(
  markerPath: string,
  marker: Record<string, unknown>,
  gitDir?: string,
): Promise<ValidationResult> {
  const currentVersion = marker.created_by_tool_version;

  // 1. 字段缺失 → 跳过(老 marker 兼容)
  if (typeof currentVersion !== 'string') return ok();

  // 2. 非 git 项目 → 跳过 best-effort(v3 MAJOR 1:用 rev-parse 真实判断,不是仅看 gitDir 参数)
  if (!gitDir) return ok();
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: gitDir });
    // 在 git repo 内 → 继续走 fail-closed 路径
  } catch {
    // 真非 git repo → 跳过 best-effort
    return ok();
  }

  // 3. git log -p <marker-file> 扫描历史中 created_by_tool_version 字段值
  let logOutput: string;
  try {
    const relPath = relative(gitDir, markerPath);
    // v9 round 2 修(plan-9j code quality reviewer I-1):maxBuffer 50MB 沿 src/core/hash/diff.ts 同 sister-pattern
    // 默认 1MB 在 marker 历史大量 commit 时易超额触发 ERR_CHILD_PROCESS_STDIO_MAXBUFFER → 误 fail-closed 拒签
    const { stdout } = await execFileAsync('git', ['log', '-p', '--no-color', '--', relPath], {
      cwd: gitDir,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    logOutput = stdout;
  } catch (err) {
    // v3 MAJOR 1 修订:**fail-closed git error**(不再 best-effort 全跳)
    // 区分:已经过 rev-parse 确认是 git repo(line 上方),此时 git log 失败应视为异常,拒签
    return failed({
      artifact: 'marker',
      field: 'created_by_tool_version',
      message:
        `version-retrograde fence:git repo 内 git log -p 失败(${(err as Error).message});` +
        `沿 v3 MAJOR 1 修订 — git error 在 git repo 内 fail-closed,防止 git history rewrite 篡改`,
      file: markerPath,
    });
  }

  // 4. 从 diff 中抽取所有 `created_by_tool_version: <semver>` 历史值
  // [+\-] 前缀匹配 git diff 行首的 + / - 标记(对应该次 commit 增/删的 marker 字段值);
  // 整块 stdout 非逐行匹配 — `+++ / ---` 文件头不含 `created_by_tool_version` 字段不会误匹
  const versionRegex = /[+\-]\s*created_by_tool_version:\s*['"]?([\d.\-+a-zA-Z]+)['"]?/g;
  const historyVersions: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = versionRegex.exec(logOutput)) !== null) {
    if (m[1]) historyVersions.push(m[1]);
  }

  // 5. 找历史最高版本,与 currentVersion 比较
  let highest = currentVersion;
  for (const v of historyVersions) {
    if (compareSemver(v, highest) > 0) highest = v;
  }

  if (compareSemver(highest, currentVersion) > 0) {
    return failed({
      artifact: 'marker',
      field: 'created_by_tool_version',
      message:
        `version retrograde 检测:git history 中曾经为 ${highest},当前 ${currentVersion} — 视为 tamper;` +
        `沿 design §3.4.4.3 — version 字段不接受从高版本回降低版本`,
      file: markerPath,
    });
  }
  return ok();
}
