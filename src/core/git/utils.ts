// src/core/git/utils.ts — plan-v1.1 P-9
// 共享 git helper(plan-9h Q8 决策抽出延后;v1.1 因 preflight.ts + migrate/index.ts 2+ 复用点解锁 YAGNI 限制)
// 统一用 execFileSync(safer than execSync;不 spawn shell 避 quote injection)
//
// 语义沿 plan-9h inline 现行模式(不改语义只 refactor;严格化语义留 plan-v2):
// - isGitRepo:`--git-dir` 探测(bare repo 也返 true;若 caller 需严格 work tree 用 `--is-inside-work-tree`)
// - getCurrentBranch:detached HEAD 时返 'HEAD' 字面字符串(caller 应判断该 sentinel;preflight branch-protection 此时不命中保护列表 → 通过 — 与 plan-9h 现行行为一致)
//
// scope clarification(Step 1.1 grep verify 后):
// - 本 utils.ts 仅抽 isGitRepo + getCurrentBranch(P-9 scope 内 2+ 复用点:preflight.ts + migrate/index.ts)
// - ack.ts / evidence.ts / process-evidence-fence.ts 用 `git rev-parse HEAD` 拿 SHA(不同语义,getCommitHead candidate;不在 P-9 scope,留 plan-v2 评估)
// - archive.ts 用 `git rev-parse --is-inside-work-tree`(严格 work tree;不同 API;不在 P-9 scope,留 plan-v2 评估是否合并到 isGitRepo strict 模式)

import { execFileSync } from 'node:child_process';

/**
 * 探测 cwd 是否在 git repo 内(含 work tree 与 bare repo)。
 * 沿 plan-9h preflight.ts inline 同模式(execFileSync + try/catch)。
 *
 * **语义注意(Codex review v1 #12 caveat)**:用 `git rev-parse --git-dir`,bare repo 也返 true。
 * 若 caller 严格需要 work tree(排除 bare)→ 自行加 `git rev-parse --is-inside-work-tree` 二次校验;
 * 留 plan-v2 评估是否在 helper 内升级严格语义(不在 plan-v1.1 P-9 scope — 是 refactor 不改语义)。
 *
 * @param cwd 工作目录绝对路径
 * @returns true 若 cwd 在 git repo(含 bare)内;false 若非 git
 */
export function isGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 拿 cwd 当前分支名(`git rev-parse --abbrev-ref HEAD`)。
 * 调用前应已 `isGitRepo(cwd) === true` 守卫,否则 throw。
 *
 * **语义注意(Codex review v1 #13 caveat)**:detached HEAD(checkout SHA / tag 状态)返字面 `'HEAD'` 字符串。
 * 沿 plan-9h preflight.ts 现行行为:'HEAD' 不在 protected_branches 列表 → 不阻断实施(等价 caller 选择"detached HEAD 视为可实施")。
 * 若 caller 需严格拒绝 detached HEAD → 判 `result === 'HEAD'` 走另路径;
 * 留 plan-v2 评估是否在 helper 内 throw / 返 sentinel(不在 plan-v1.1 P-9 scope — 是 refactor 不改语义)。
 *
 * @param cwd 工作目录绝对路径(必须已 isGitRepo verified)
 * @returns 当前分支名;detached HEAD 时返 'HEAD' 字面字符串
 * @throws 若 cwd 非 git repo(未守卫 isGitRepo)或 git 命令失败
 */
export function getCurrentBranch(cwd: string): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd,
    encoding: 'utf-8',
  }).trim();
}
