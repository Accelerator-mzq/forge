// archive recover 测试 — Plan 3 Task 13
// 覆盖 6 case:clean / case A / case B / case C / corrupt

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recover } from '../../../src/core/archive/recover.js';

// —— helper:创建基础 forgeRoot 目录结构 ——
function setupForgeRoot(): { forgeRoot: string; cleanup: () => void } {
  const tmp = mkdtempSync(join(tmpdir(), 'forge-recover-'));
  // 基础目录结构:specs/ + changes/ + .cache/
  mkdirSync(join(tmp, 'specs'), { recursive: true });
  mkdirSync(join(tmp, 'changes'), { recursive: true });
  mkdirSync(join(tmp, '.cache'), { recursive: true });
  return {
    forgeRoot: tmp,
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

/**
 * 辅助:在 archive 目录下铺一个半归档的 change
 * changeDir = forgeRoot/changes/archive/<date>-<id>/specs/
 * 写入 specs 文件
 */
function setupArchiveChange(
  forgeRoot: string,
  archiveEntry: string, // 如 '2026-05-04-add-login'
  specsFiles: Record<string, string>, // filename → content
): string {
  const archiveDir = join(forgeRoot, 'changes', 'archive', archiveEntry, 'specs');
  mkdirSync(archiveDir, { recursive: true });
  for (const [name, content] of Object.entries(specsFiles)) {
    writeFileSync(join(archiveDir, name), content);
  }
  return archiveDir;
}

/**
 * 辅助:在 .cache/ 下铺一个 backup 目录
 * backupDir = forgeRoot/.cache/archive-sync-backup-<fakePid>/
 */
function setupBackup(
  forgeRoot: string,
  fakePid: number,
  specsFiles: Record<string, string>,
): string {
  const backupDir = join(forgeRoot, '.cache', `archive-sync-backup-${fakePid}`);
  mkdirSync(backupDir, { recursive: true });
  for (const [name, content] of Object.entries(specsFiles)) {
    writeFileSync(join(backupDir, name), content);
  }
  return backupDir;
}

describe('recover — --recover 状态机(case A/B/C/clean/corrupt)', () => {
  // —— case 1:clean — archive 和 backup 都不存在 → case='clean' ——
  it('clean:无 archive 无 backup → 返回 case=clean', async () => {
    const { forgeRoot, cleanup } = setupForgeRoot();
    try {
      const result = await recover(forgeRoot);
      expect(result.case).toBe('clean');
      expect(result.message).toContain('无半完成状态');
    } finally {
      cleanup();
    }
  });

  // —— case 2:case A — archive 存在 + backup 不存在 → 重跑 sync ——
  it('case A:archive 已移完但 backup 不存在 → 重跑 Sync,specs/ 被应用', async () => {
    const { forgeRoot, cleanup } = setupForgeRoot();
    try {
      const archiveEntry = '2026-05-04-add-login';
      // 铺 archive change specs(内容将 create 到 specs/)
      setupArchiveChange(forgeRoot, archiveEntry, {
        'auth.md':
          '# Auth Spec\n\n## Scenario: login\n\n**Given** user\n**When** login\n**Then** ok\n',
      });

      // specs/ 为空(backup 不存在,说明 sync 没跑)
      const result = await recover(forgeRoot);

      expect(result.case).toBe('A');
      expect(result.message).toContain('A');

      // 验证 specs/ 已经应用了 delta
      expect(existsSync(join(forgeRoot, 'specs', 'auth.md'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  // —— case 3:case B — archive + backup 都存在,specs/ 已应用 deltas → 删 backup ——
  it('case B:archive 完整 + backup 残留,specs 已应用 → 删 backup', async () => {
    const { forgeRoot, cleanup } = setupForgeRoot();
    try {
      const archiveEntry = '2026-05-04-add-feature';
      const specContent =
        '# Feature Spec\n\n## Scenario: feature\n\n**Given** user\n**When** click\n**Then** done\n';

      // 铺 archive change specs(用 replace 语义:specs/ 下已有同名文件)
      setupArchiveChange(forgeRoot, archiveEntry, {
        'feature.md': specContent,
      });

      // specs/ 已经有 feature.md(模拟 deltas 已应用的状态)
      writeFileSync(join(forgeRoot, 'specs', 'feature.md'), specContent);

      // 铺 backup(残留的 backup)
      const backupDir = setupBackup(forgeRoot, 88888, {
        'feature.md': '# Old Feature Spec\n',
      });

      const result = await recover(forgeRoot);

      expect(result.case).toBe('B');
      expect(result.message).toContain('B');

      // backup 应该被删除
      expect(existsSync(backupDir)).toBe(false);
    } finally {
      cleanup();
    }
  });

  // —— case 4:case C — archive + backup 不一致(specs 还是 backup 的内容)→ 报告需用户介入 ——
  it('case C:archive + backup 不一致 → 返回 case=C,message 含恢复路径', async () => {
    const { forgeRoot, cleanup } = setupForgeRoot();
    try {
      const archiveEntry = '2026-05-04-add-thing';
      const newContent =
        '# New Thing Spec\n\n## Scenario: thing\n\n**Given** user\n**When** do\n**Then** thing\n';
      const oldContent = '# Old Thing Spec\n';

      // 铺 archive change specs
      setupArchiveChange(forgeRoot, archiveEntry, {
        'thing.md': newContent,
      });

      // specs/ 还是旧内容(create 语义:specs/ 下没有 thing.md → readDeltas 返回 create)
      // → 但 backup 存在 → 说明 sync 已开始但 specs 还是 backup 状态
      // 注意:这里 specs/ 是旧内容 = backup 内容 → 说明 sync 没完成
      // case C 的判断:backup 存在且 specs/ 没应用 deltas
      // 但 plan 的简化逻辑是:deltas 全 replace = case B,含 create = case C
      // 这里 specs/ 无 thing.md → readDeltas 返回 create → 不全是 replace → case C
      writeFileSync(join(forgeRoot, 'specs', 'existing.md'), oldContent);

      // 铺 backup
      setupBackup(forgeRoot, 77777, {
        'existing.md': oldContent,
      });

      const result = await recover(forgeRoot);

      expect(result.case).toBe('C');
      expect(result.message).toContain('C');
      // message 应该含恢复路径提示
      expect(result.message).toMatch(/介入|手动|选择|restore|recover/i);
    } finally {
      cleanup();
    }
  });

  // —— case 5:corrupt — 只有 backup,archive 不存在 → 状态损坏 ——
  it('corrupt:backup 存在但 archive 不存在 → 返回 case=corrupt', async () => {
    const { forgeRoot, cleanup } = setupForgeRoot();
    try {
      // 只铺 backup,不铺 archive
      setupBackup(forgeRoot, 66666, {
        'spec.md': '# Spec\n',
      });
      // changes/archive/ 目录不存在

      const result = await recover(forgeRoot);

      expect(result.case).toBe('corrupt');
      expect(result.message).toContain('corrupt');
    } finally {
      cleanup();
    }
  });
});
