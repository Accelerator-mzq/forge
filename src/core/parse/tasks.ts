// tasks.md 解析器 — checkbox + applied_commits

import { parseMarkdown } from './markdown.js';

/** parseTasks 函数的返回结构 */
export interface ParsedTasks {
  /** 文档标题(# 一级 heading) */
  title: string;
  /** 所有 checkbox 任务项 */
  items: TaskItem[];
  /** 全部跑完后写入(详见 spec §3.1 T3 step 4) */
  appliedCommits?: { taskId: string; hash: string }[];
  /** git HEAD at completion */
  finalHead?: string;
}

/** 单个任务 checkbox 项 */
export interface TaskItem {
  /** task id(从 "- [x] task-1: ..." 抽出) */
  id: string;
  /** 描述(冒号后) */
  description: string;
  /** [x] = true / [ ] = false */
  checked: boolean;
  /** 该 task 所在的二级 section heading(若非顶层) */
  section?: string;
  /** 行号(1-indexed) */
  lineNumber: number;
}

// 匹配 checkbox 行："- [x] task-id: description" 格式
const TASK_RE = /^\s*- \[([ x])\]\s+([\w-]+)\s*:\s*(.+)$/;
// 匹配 applied_commits 块中的单项："  - task-id: commithash"
const APPLIED_RE = /^\s*-\s+([\w-]+)\s*:\s*([a-f0-9]+)\s*$/;

/**
 * 解析 tasks.md 文本。
 * 提取所有 checkbox 任务项及 applied_commits / final_head。
 */
export function parseTasks(text: string): ParsedTasks {
  // 使用 markdown 解析器获取章节结构
  const md = parseMarkdown(text);
  // 取第一个一级 heading 作为标题
  const titleSection = md.sections.find((s) => s.level === 1);
  const title = titleSection?.heading ?? '';

  const items: TaskItem[] = [];
  const lines = text.split('\n');
  // 跟踪当前所在的二级 section 名称
  let currentSection: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // 检测二级 heading（##）以更新 section 上下文
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      currentSection = headingMatch[1]?.trim();
      continue;
    }
    // 匹配 checkbox 行
    const m = line.match(TASK_RE);
    if (m) {
      items.push({
        id: m[2]!,
        description: m[3]!.trim(),
        checked: m[1] === 'x',
        section: currentSection,
        lineNumber: i + 1,
      });
    }
  }

  // 提取 applied_commits 和 final_head 块
  const { appliedCommits, finalHead } = extractAppliedCommits(text);
  return { title, items, appliedCommits, finalHead };
}

/**
 * 从文本中提取 applied_commits 块和 final_head。
 * 格式为：
 *   applied_commits:
 *     - task-id: commithash
 *   final_head: commithash
 */
function extractAppliedCommits(text: string): {
  appliedCommits?: { taskId: string; hash: string }[];
  finalHead?: string;
} {
  const lines = text.split('\n');
  // 查找 "applied_commits:" 行的位置
  const appliedIdx = lines.findIndex((l) => /^applied_commits:\s*$/.test(l));
  if (appliedIdx < 0) return {};

  const appliedCommits: { taskId: string; hash: string }[] = [];
  let finalHead: string | undefined;

  // 从 applied_commits: 行之后逐行解析
  for (let i = appliedIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // 匹配 commit 项
    const m = line.match(APPLIED_RE);
    if (m) {
      appliedCommits.push({ taskId: m[1]!, hash: m[2]! });
      continue;
    }
    // 匹配 final_head 行（允许前导空格，兼容 Prettier 格式化后的缩进）
    const headMatch = line.match(/^\s*final_head:\s+([a-f0-9]+)\s*$/);
    if (headMatch) {
      finalHead = headMatch[1];
      break;
    }
    // 空行跳过，其他行结束解析
    if (line.trim() === '') continue;
    break;
  }

  return { appliedCommits, finalHead };
}
