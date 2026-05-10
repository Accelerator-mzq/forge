// 已归档推测引擎 — Plan 8c Task 3.1
// Spec §2.2:信号 1 checkbox ≥ 95% 且 task ≥ 3 / 信号 2 git log word-boundary + slug / 信号 3 mtime 仅展示 / 信号 4 marker

export interface DetectArchiveInput {
  slug: string;
  // plan.md 完整文本(含 checkbox + critical 标记 + archived marker)
  planContent: string;
  // git log 该 plan 文件的 commit message 列表(若非 git 仓库则空)
  gitLogCommits: string[];
  // mtime 距今天数(仅展示,不参与默认分类)
  mtimeAgeDays: number;
  // 是否含 <!-- forge:archived --> marker
  hasArchivedMarker: boolean;
  // 是否在 git 仓库内(false 则信号 2 失效)
  inGitRepo: boolean;
}

export interface DetectArchiveResult {
  recommended: 'active' | 'archive';
  reasons: string[]; // 给 report 表显示
}

// 信号 1:解析 checkbox total + checked
export function parseCheckboxes(content: string): { total: number; checked: number } {
  let total = 0;
  let checked = 0;
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*- \[([ x])\]/);
    if (!m) continue;
    total++;
    if (m[1] === 'x') checked++;
  }
  return { total, checked };
}

// 信号 2:git log word-boundary close 关键词 + slug 共同命中
export function countSlugInGitLog(commits: string[], slug: string): number {
  const KEYWORDS = /\b(close|complete|done|finish|archive|ship|closing|closed)\b/i;
  let count = 0;
  for (const c of commits) {
    if (!c.includes(slug)) continue;
    if (KEYWORDS.test(c)) count++;
  }
  return count;
}

// 信号 4:critical-task-pending 检查(<!-- critical: task-N --> 标记的 task 未勾 [x])
function hasCriticalTaskPending(content: string): boolean {
  const lines = content.split('\n');
  // 找所有 <!-- critical: <task-id> --> 标记
  const criticalIds: string[] = [];
  for (const line of lines) {
    const m = line.match(/<!--\s*critical:\s*([\w-]+)\s*-->/);
    if (m && m[1]) criticalIds.push(m[1]);
  }
  if (criticalIds.length === 0) return false;
  // 检查这些 task-id 是否都勾 [x]
  for (const id of criticalIds) {
    const re = new RegExp(`- \\[x\\]\\s+${id}\\b`);
    if (!re.test(content)) return true; // 有未勾 critical → pending
  }
  return false;
}

export function detectArchive(input: DetectArchiveInput): DetectArchiveResult {
  const reasons: string[] = [];
  const { slug, planContent, gitLogCommits, mtimeAgeDays, hasArchivedMarker, inGitRepo } = input;

  // 信号 4 marker — 优先级最高
  if (hasArchivedMarker) {
    reasons.push('marker: <!-- forge:archived -->');
    return { recommended: 'archive', reasons };
  }

  // critical-task-pending 检查 — 即使 95% 也不 archive
  if (hasCriticalTaskPending(planContent)) {
    reasons.push('critical-task-pending(忽略其他信号)');
    return { recommended: 'active', reasons };
  }

  // 信号 1 checkbox(必须 ≥ 3 task)
  const { total, checked } = parseCheckboxes(planContent);
  const sig1 =
    total >= 3 && checked / total >= 0.95
      ? `checkbox ${checked}/${total} (${((checked / total) * 100).toFixed(0)}%)`
      : null;
  if (sig1) reasons.push(sig1);

  // 信号 2 git log
  let sig2: string | null = null;
  if (inGitRepo) {
    const closeCommits = countSlugInGitLog(gitLogCommits, slug);
    if (closeCommits > 0) sig2 = `git: ${closeCommits} close-commit(s) with slug`;
    if (sig2) reasons.push(sig2);
  } else {
    reasons.push('git: not-available');
  }

  // 信号 3 mtime — 仅展示
  reasons.push(`mtime: ${mtimeAgeDays}d ago`);

  // 推荐:信号 1 OR 信号 2 命中 → archive
  if (sig1 || sig2) {
    return { recommended: 'archive', reasons };
  }
  return { recommended: 'active', reasons };
}
