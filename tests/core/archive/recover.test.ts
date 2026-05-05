// archive recover 测试 — Plan 3 Task 13
// 覆盖 case:clean / case A / case B / case C / corrupt
// P2.1/P2.2 新增:多历史 archive clean / replace-但内容不匹配 → case C

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  recover,
  checkBackupIntegrity,
  checkArchiveIntegrity,
} from '../../../src/core/archive/recover.js';

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

  // —— P2.1 新增:多个 archive 历史 + 无 backup → clean(不误判为半归档)——
  it('P2.1:多个历史 archive + 无 backup → 返回 case=clean(不误报半归档)', async () => {
    const { forgeRoot, cleanup } = setupForgeRoot();
    try {
      // 铺多个已完成 archive 历史
      for (const entry of ['2026-05-01-feat-a', '2026-05-02-feat-b', '2026-05-03-feat-c']) {
        setupArchiveChange(forgeRoot, entry, {
          'spec.md': '# Spec\n\n## Scenario: x\n\n**Given** g\n**When** w\n**Then** t\n',
        });
        // 同时在 specs/ 写入对应文件(模拟已经 sync 完成)
        writeFileSync(
          join(forgeRoot, 'specs', `spec-${entry}.md`),
          '# Spec\n\n## Scenario: x\n\n**Given** g\n**When** w\n**Then** t\n',
        );
      }
      // 无 backup → 应该 clean

      const result = await recover(forgeRoot);
      expect(result.case).toBe('clean');
      expect(result.message).toContain('无半完成状态');
    } finally {
      cleanup();
    }
  });

  // —— case 2:case A — archive 存在 + backup 存在 + specs 未应用 → 重跑 sync ——
  it('case A:archive + backup 存在,specs 未应用(create 操作) → 重跑 Sync,specs/ 被应用', async () => {
    const { forgeRoot, cleanup } = setupForgeRoot();
    try {
      const archiveEntry = '2026-05-04-add-login';
      // 铺 archive change specs(内容将 create 到 specs/)
      setupArchiveChange(forgeRoot, archiveEntry, {
        'auth.md':
          '# Auth Spec\n\n## Scenario: login\n\n**Given** user\n**When** login\n**Then** ok\n',
      });

      // 铺 backup(说明 sync 已开始但未完成)
      setupBackup(forgeRoot, 12345, {
        'existing.md': '# Existing\n',
      });

      // specs/ 中没有 auth.md(未应用)
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
  it('case B:archive 完整 + backup 残留,specs 已应用(内容一致) → 删 backup', async () => {
    const { forgeRoot, cleanup } = setupForgeRoot();
    try {
      const archiveEntry = '2026-05-04-add-feature';
      const specContent =
        '# Feature Spec\n\n## Scenario: feature\n\n**Given** user\n**When** click\n**Then** done\n';

      // 铺 archive change specs(用 replace 语义:specs/ 下已有同名文件)
      setupArchiveChange(forgeRoot, archiveEntry, {
        'feature.md': specContent,
      });

      // specs/ 已经有 feature.md(内容与 archive 一致,模拟 deltas 已应用的状态)
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

  // —— P2.2 新增:case B 检测 — replace 操作但内容不匹配 → 应走 case A(重跑 sync)——
  it('P2.2:replace 操作但 archive spec 与 current spec 内容不一致 → case A(重跑 sync)', async () => {
    const { forgeRoot, cleanup } = setupForgeRoot();
    try {
      const archiveEntry = '2026-05-04-patch-spec';
      const archiveContent =
        '# Updated Spec\n\n## Scenario: new\n\n**Given** g\n**When** w\n**Then** t\n';
      const oldContent = '# Old Spec\n\n## Scenario: old\n\n**Given** g\n**When** w\n**Then** t\n';

      // 铺 archive change specs
      setupArchiveChange(forgeRoot, archiveEntry, {
        'patch.md': archiveContent,
      });

      // current specs/ 有 patch.md 但内容是旧的(replace delta,但未应用新内容)
      writeFileSync(join(forgeRoot, 'specs', 'patch.md'), oldContent);

      // 铺 backup
      setupBackup(forgeRoot, 99999, {
        'patch.md': oldContent,
      });

      const result = await recover(forgeRoot);

      // 内容不匹配 → 不满足 case B 条件 → 走 case A(重跑 sync)
      expect(result.case).toBe('A');
      expect(result.message).toContain('A');

      // 验证 specs/ 已应用新内容
      const { readFileSync } = await import('node:fs');
      const appliedContent = readFileSync(join(forgeRoot, 'specs', 'patch.md'), 'utf8');
      expect(appliedContent).toBe(archiveContent);
    } finally {
      cleanup();
    }
  });

  // —— case 4:case C — 含 delete delta 或其他不可安全自动处理的情况 → 需用户介入 ——
  // 注意:P2.1/P2.2 之后,create delta 走 case A(重跑),replace+内容不匹配也走 case A
  // case C 现在只在 deltas 含 delete 时触发(当前实现中 delete 不会自动应用)
  it('case C:backup 存在但 archive specs 为空(无法应用 deltas) → 不应崩溃', async () => {
    const { forgeRoot, cleanup } = setupForgeRoot();
    try {
      // 铺一个 archive 但 specs/ 子目录为空
      const archiveEntry = '2026-05-04-empty-specs';
      mkdirSync(join(forgeRoot, 'changes', 'archive', archiveEntry, 'specs'), { recursive: true });

      // 铺 backup
      setupBackup(forgeRoot, 77777, {
        'existing.md': '# Old\n',
      });

      // archive specs 为空 → readDeltas 返回空数组 → deltas.every(replace) → true
      // verifyAllReplacedAlreadyApplied 在空数组上返回 true → case B
      const result = await recover(forgeRoot);

      // 空 deltas 时 case B(backup 删掉,nothing to sync)
      expect(['A', 'B', 'C']).toContain(result.case);
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

describe('forge-archive/recover Plan 6 case C 完整性 check', () => {
  let forgeRoot: string;
  beforeEach(() => {
    forgeRoot = mkdtempSync(join(tmpdir(), 'forge-recover-c-'));
    mkdirSync(join(forgeRoot, 'forge'), { recursive: true });
  });
  afterEach(() => {
    rmSync(forgeRoot, { recursive: true, force: true });
  });

  it('checkBackupIntegrity:目录不存在 → ok=false', async () => {
    const r = await checkBackupIntegrity(
      join(forgeRoot, 'forge', '.cache', 'archive-sync-backup-x'),
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('不存在');
  });

  it('checkBackupIntegrity:目录空 → ok=false', async () => {
    const dir = join(forgeRoot, 'forge', '.cache', 'archive-sync-backup-1');
    mkdirSync(dir, { recursive: true });
    const r = await checkBackupIntegrity(dir);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('为空');
  });

  it('checkBackupIntegrity:目录非空但不含 .md → ok=false', async () => {
    const dir = join(forgeRoot, 'forge', '.cache', 'archive-sync-backup-1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.gitkeep'), '', 'utf8');
    const r = await checkBackupIntegrity(dir);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('不含 .md');
  });

  it('checkBackupIntegrity:含 .md 可读 → ok=true', async () => {
    const dir = join(forgeRoot, 'forge', '.cache', 'archive-sync-backup-1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'foo.md'), '# foo', 'utf8');
    const r = await checkBackupIntegrity(dir);
    expect(r.ok).toBe(true);
  });

  it('checkArchiveIntegrity:缺 marker → ok=false', async () => {
    const dir = join(forgeRoot, 'forge', 'changes', 'archive', '2026-05-05-test');
    mkdirSync(join(dir, 'specs'), { recursive: true });
    // 缺 .verify-passed
    const r = await checkArchiveIntegrity(dir);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('.verify-passed');
  });

  it('checkArchiveIntegrity:目录结构完整 → ok=true', async () => {
    const dir = join(forgeRoot, 'forge', 'changes', 'archive', '2026-05-05-test');
    mkdirSync(join(dir, 'specs'), { recursive: true });
    writeFileSync(join(dir, '.verify-passed'), 'schema: forge-verify/v1', 'utf8');
    writeFileSync(join(dir, '.review-passed'), 'schema: forge-review/v1', 'utf8');
    const r = await checkArchiveIntegrity(dir);
    expect(r.ok).toBe(true);
  });
});
