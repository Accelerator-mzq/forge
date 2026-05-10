import { describe, it, expect } from 'vitest';
import {
  detectArchive,
  parseCheckboxes,
  countSlugInGitLog,
} from '../../src/core/migrate/archive-detect.js';

describe('parseCheckboxes', () => {
  it('返回 total + checked 数', () => {
    const input = '- [ ] task-1: x\n- [x] task-2: y\n- [x] task-3: z\n';
    expect(parseCheckboxes(input)).toEqual({ total: 3, checked: 2 });
  });
});

describe('detectArchive — 信号矩阵', () => {
  it('信号 1 + 信号 2 命中 → archive', () => {
    const result = detectArchive({
      slug: 'add-auth',
      planContent: '- [x] task-1: x\n- [x] task-2: y\n- [x] task-3: z\n',
      gitLogCommits: ['close add-auth: ship feature'],
      mtimeAgeDays: 60,
      hasArchivedMarker: false,
      inGitRepo: true,
    });
    expect(result.recommended).toBe('archive');
    expect(result.reasons).toContain('checkbox 3/3 (100%)');
    expect(result.reasons.some((r) => r.includes('git: 1 close-commit'))).toBe(true);
  });

  it('单 task 100% 完成(< 3) → 不 archive', () => {
    const result = detectArchive({
      slug: 'single',
      planContent: '- [x] task-1: spike\n',
      gitLogCommits: [],
      mtimeAgeDays: 60,
      hasArchivedMarker: false,
      inGitRepo: true,
    });
    expect(result.recommended).toBe('active');
  });

  it('git log "close-out the meeting" 不命中(无 slug 共同命中)', () => {
    const result = detectArchive({
      slug: 'add-auth',
      planContent: '- [ ] task-1: x\n- [ ] task-2: y\n',
      gitLogCommits: ['docs: close-out the meeting notes'],
      mtimeAgeDays: 60,
      hasArchivedMarker: false,
      inGitRepo: true,
    });
    expect(result.recommended).toBe('active');
  });

  it('marker <!-- forge:archived --> 命中 → 强制 archive(优先级最高)', () => {
    const result = detectArchive({
      slug: 'x',
      planContent: '<!-- forge:archived -->\n- [ ] task-1: x\n',
      gitLogCommits: [],
      mtimeAgeDays: 0,
      hasArchivedMarker: true,
      inGitRepo: true,
    });
    expect(result.recommended).toBe('archive');
    expect(result.reasons).toContain('marker: <!-- forge:archived -->');
  });

  it('critical-task-pending 即使 95% 完成也不 archive', () => {
    const planContent =
      '<!-- critical: task-20 -->\n' +
      Array.from({ length: 19 })
        .map((_, i) => `- [x] task-${i + 1}: done\n`)
        .join('') +
      '- [ ] task-20: critical pending\n';
    const result = detectArchive({
      slug: 'cleanup',
      planContent,
      gitLogCommits: ['close cleanup: ship feature'],
      mtimeAgeDays: 60,
      hasArchivedMarker: false,
      inGitRepo: true,
    });
    expect(result.recommended).toBe('active');
    expect(result.reasons.some((r) => r.includes('critical-task-pending'))).toBe(true);
  });

  it('非 git 仓库:信号 2 失效,只用 1 + 4', () => {
    const result = detectArchive({
      slug: 'x',
      planContent: '- [x] task-1\n- [x] task-2\n- [x] task-3\n',
      gitLogCommits: [],
      mtimeAgeDays: 60,
      hasArchivedMarker: false,
      inGitRepo: false,
    });
    expect(result.recommended).toBe('archive');
  });
});

describe('countSlugInGitLog', () => {
  it('word-boundary close + slug 共同命中', () => {
    const commits = [
      'close add-auth: ship', // 命中
      'docs: close-out meeting', // 不命中(无 slug)
      'closing add-auth conversation', // 命中(close 词根 + slug)
    ];
    expect(countSlugInGitLog(commits, 'add-auth')).toBe(2);
  });
});
