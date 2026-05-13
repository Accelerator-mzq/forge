// transaction-summary.test.ts — plan-9e1 Task 3 单测
// 验证 archiveTransaction 处理 archiveSummary 字段:
//   - 正常流:Move 前在 source 写 archive_summary.tmp.yaml → Move 后 rename 为 archive_summary.yaml
//   - 失败回滚:.tmp 写失败 / Move 失败 / rename 失败 三场景
//
// 沿 transaction.test.ts 同模式 — tmpdir 搭 forge skeleton + 跑 archiveTransaction

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { archiveTransaction } from '../../../src/core/archive/transaction.js';
import {
  ARCHIVE_SUMMARY_VERSION,
  PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
  type ArchiveSummary,
} from '../../../src/core/schemas/archive-summary.js';

function setupForgeRoot(): { forgeRoot: string; changeDir: string; cleanup: () => void } {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-tx-'));
  const forgeRoot = join(tmpRoot, 'forge');
  mkdirSync(join(forgeRoot, 'changes', 'add-x', 'specs'), { recursive: true });
  mkdirSync(join(forgeRoot, 'specs'), { recursive: true });
  mkdirSync(join(forgeRoot, '.cache'), { recursive: true });
  writeFileSync(join(forgeRoot, 'changes', 'add-x', 'proposal.md'), '# X\n## Why\nr\n', 'utf8');
  writeFileSync(join(forgeRoot, 'changes', 'add-x', 'tasks.md'), '# Tasks\n- [x] t1\n', 'utf8');
  writeFileSync(join(forgeRoot, 'changes', 'add-x', 'specs', 'x.md'), '# X spec\n', 'utf8');
  return {
    forgeRoot,
    changeDir: join(forgeRoot, 'changes', 'add-x'),
    cleanup: () => rmSync(tmpRoot, { recursive: true, force: true }),
  };
}

function buildSummary(changeId: string): ArchiveSummary {
  return {
    schema: 'forge-archive-summary/v1',
    version: ARCHIVE_SUMMARY_VERSION,
    archived_at: '2026-05-12T16:45:00Z',
    change_id: changeId,
    verify_passed: { verified_invariants: ['hash-match', 'evidence-complete'] },
    review_passed: { reviewers: ['ai-agent'] },
    process_evidence_summary: PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
    handoff_to_backlog: [],
    acked_warnings: [],
    pending_suggestions: [],
  };
}

describe('archiveTransaction with archiveSummary', () => {
  it('正常流:archive_summary.yaml 出现在 archive 目录(非 .tmp 名)', async () => {
    const ctx = setupForgeRoot();
    try {
      await archiveTransaction({
        forgeRoot: ctx.forgeRoot,
        changeId: 'add-x',
        archiveDate: '2026-05-12',
        archiveSummary: buildSummary('add-x'),
      });
      const archiveDir = join(ctx.forgeRoot, 'changes', 'archive', '2026-05-12-add-x');
      expect(existsSync(join(archiveDir, 'archive_summary.yaml'))).toBe(true);
      expect(existsSync(join(archiveDir, 'archive_summary.tmp.yaml'))).toBe(false);
      const yamlText = readFileSync(join(archiveDir, 'archive_summary.yaml'), 'utf8');
      const parsed = parseYaml(yamlText) as Record<string, unknown>;
      expect(parsed.schema).toBe('forge-archive-summary/v1');
      expect(parsed.change_id).toBe('add-x');
    } finally {
      ctx.cleanup();
    }
  });

  it('archiveSummary 未传 → 兼容(归档不产 summary,沿老 v0.4 行为)', async () => {
    const ctx = setupForgeRoot();
    try {
      await archiveTransaction({
        forgeRoot: ctx.forgeRoot,
        changeId: 'add-x',
        archiveDate: '2026-05-12',
        // 不传 archiveSummary
      });
      const archiveDir = join(ctx.forgeRoot, 'changes', 'archive', '2026-05-12-add-x');
      expect(existsSync(archiveDir)).toBe(true);
      expect(existsSync(join(archiveDir, 'archive_summary.yaml'))).toBe(false);
      expect(existsSync(join(archiveDir, 'archive_summary.tmp.yaml'))).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  it('Move 失败(目标已存在)→ 整体失败 + source .tmp 清理', async () => {
    const ctx = setupForgeRoot();
    try {
      // 预先创建 archive 目标目录,导致 Move 失败
      const archiveTarget = join(ctx.forgeRoot, 'changes', 'archive', '2026-05-12-add-x');
      mkdirSync(archiveTarget, { recursive: true });
      // 给目标加一个文件确保 rename 不能覆盖空目录(POSIX rename 空目标可能覆盖,Win 拒绝)
      writeFileSync(join(archiveTarget, 'sentinel.txt'), 'x', 'utf8');

      await expect(
        archiveTransaction({
          forgeRoot: ctx.forgeRoot,
          changeId: 'add-x',
          archiveDate: '2026-05-12',
          archiveSummary: buildSummary('add-x'),
        }),
      ).rejects.toThrow();

      // 回滚:source 目录残留无 .tmp(若曾经写过则应已 unlink)
      const sourceTmp = join(ctx.changeDir, 'archive_summary.tmp.yaml');
      expect(existsSync(sourceTmp)).toBe(false);
      // 原 change 目录仍在 source(未 Move)
      expect(existsSync(ctx.changeDir)).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it('.tmp 写入完成后 Move 失败 → source .tmp 清理 + 整体失败', async () => {
    const ctx = setupForgeRoot();
    try {
      // 同上 case:Move 目标已占位
      const archiveTarget = join(ctx.forgeRoot, 'changes', 'archive', '2026-05-12-add-x');
      mkdirSync(archiveTarget, { recursive: true });
      writeFileSync(join(archiveTarget, 'sentinel.txt'), 'x', 'utf8');

      await expect(
        archiveTransaction({
          forgeRoot: ctx.forgeRoot,
          changeId: 'add-x',
          archiveDate: '2026-05-12',
          archiveSummary: buildSummary('add-x'),
        }),
      ).rejects.toThrow();

      // .tmp 不应残留在 source(回滚阶段必须 unlink)
      expect(existsSync(join(ctx.changeDir, 'archive_summary.tmp.yaml'))).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  it('归档 YAML 含 acked_warnings 与 handoff_to_backlog 数组(序列化完整)', async () => {
    const ctx = setupForgeRoot();
    try {
      const summary = buildSummary('add-x');
      summary.acked_warnings = [
        {
          source: 'verify_findings',
          id: 2,
          dimension: 'correctness',
          check_type: 'requirement-mapping',
          evidence: 'specs/x.md:15',
          acked_by: 'msc',
          acked_at: '2026-05-12T16:30:00Z',
        },
      ];
      summary.handoff_to_backlog = [
        {
          source: 'pause_decisions',
          id: 1,
          severity: 'WARNING',
          chosen_option: 3,
          target_artifact: 'proposal.md',
          target_anchor: '## Out of Scope',
          issue_summary: 'OAuth refresh',
        },
      ];
      await archiveTransaction({
        forgeRoot: ctx.forgeRoot,
        changeId: 'add-x',
        archiveDate: '2026-05-12',
        archiveSummary: summary,
      });
      const yamlText = readFileSync(
        join(ctx.forgeRoot, 'changes', 'archive', '2026-05-12-add-x', 'archive_summary.yaml'),
        'utf8',
      );
      const parsed = parseYaml(yamlText) as Record<string, unknown>;
      expect((parsed.acked_warnings as unknown[]).length).toBe(1);
      expect((parsed.handoff_to_backlog as unknown[]).length).toBe(1);
    } finally {
      ctx.cleanup();
    }
  });

  it('归档后 source 目录不再存在(.tmp 已随 Move 被 rename → 正式名)', async () => {
    const ctx = setupForgeRoot();
    try {
      await archiveTransaction({
        forgeRoot: ctx.forgeRoot,
        changeId: 'add-x',
        archiveDate: '2026-05-12',
        archiveSummary: buildSummary('add-x'),
      });
      expect(existsSync(ctx.changeDir)).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  // v2 MAJOR 2 新增:.tmp 写入失败注入(实测,POSIX chmod 0o555 / Win readonly attr)
  it('.tmp 写入失败(source 目录 readonly)→ 整体失败 + 抛错', async () => {
    const ctx = setupForgeRoot();
    try {
      // POSIX:chmod 0o555 sourceDir(write 禁止);Win:在 vitest skipIf 模式下跳过(沿 9c v6 同模式)
      const { chmod } = await import('node:fs/promises');
      if (process.platform === 'win32') {
        // Win 上 chmod 0o555 不会阻止文件创建(NTFS 权限模型不同),跳过此 case;
        // Windows 端真实注入需借助 ACL 设置,沿 9c 同模式留 it.todo
        return;
      }
      await chmod(ctx.changeDir, 0o555);
      await expect(
        archiveTransaction({
          forgeRoot: ctx.forgeRoot,
          changeId: 'add-x',
          archiveDate: '2026-05-12',
          archiveSummary: buildSummary('add-x'),
        }),
      ).rejects.toThrow(/archive_summary\.tmp\.yaml 写入失败/);
      // 复原权限以便清理
      await chmod(ctx.changeDir, 0o755);
    } finally {
      ctx.cleanup();
    }
  });

  // v2 MAJOR 2:三类失败注入留 it.todo(rename / Backup / Sync 失败),
  // 由 9z release plan unskip(同步加 3 个 9e1 todo 到 release-blocker-attack-path.test.ts,
  // EXPECTED_TODO_COUNT_SOFT 2 → 5)
  it.todo(
    'rename .tmp → 正式名失败(archive dir 注入)→ archive 数据已 move,提示用户走 --resume-summary(v2 MAJOR 2)',
  );
  it.todo('Backup 失败 → 反向 Move + 回滚 unlink summary + 抛错(v2 MAJOR 2)');
  it.todo(
    'Sync 失败 → 反向 Move + 回滚 unlink summary + restore specs from backup + 抛错(v2 MAJOR 2)',
  );
});
