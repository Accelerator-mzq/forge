// release-blocker-attack-path.test.ts — plan-9c Task 5 Step 1.6(v3 codex BLOCKER 3 + v4 NEW-BLOCKER A3)
//
// ★★★ release-blocker 占位测试 ★★★
//
// 本文件含 9c plan §7.5.1 / §7.5.2 已知降级的攻击路径占位 — option=1 / option=2
// 在 9c 完成时**未实现** diff 段级校验,fence 不能拦截以下 attack path。
//
// **9z release plan 实施者**(v6 codex MINOR 修订:统一 v5 soft/release 双模式指引):
// 1. unskip 以下所有 `it.todo`,改为真实跑 attack fixture 并断言 fence 拒签
// 2. **改 9z release CI 配置调 `pnpm test:gate:release`**(release 模式硬约束 actual=0,
//    不读 `EXPECTED_TODO_COUNT_SOFT` — 不可通过改 SOFT 值绕过)
// 3.(可选)同步改 `EXPECTED_TODO_COUNT_SOFT` 让 9c 本地 soft gate 也通过 — 但这不影响 release gate
//
// release 模式判定:`pnpm test:gate:release` 见 actual 非 0 → exit 1 → CI fail → 9z release 拒签
// (沿 9c §7.5.1 / §7.5.2 9z 兜底承诺 + v5 codex BLOCKER 2 双模式)
//
// 9e1 plan 若先于 9z 完成且接入 git diff parser,可直接在 9e1 实施同 attack 路径,
// 本文件相应 unskip + 改 `EXPECTED_TODO_COUNT_SOFT`(可选)。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// —— mock specs-sync:让 Sync 失败注入 case 可以模拟 applyDeltas 失败 ——
// 注意:vi.mock 必须在 import 之前,vitest 会提升它(沿 transaction.test.ts:19-26)
vi.mock('../../src/core/specs-sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/specs-sync/index.js')>();
  return {
    ...actual,
    // applyDeltas 默认使用真实实现;失败注入 case 通过 vi.spyOn 覆盖
    applyDeltas: actual.applyDeltas,
  };
});

import { archiveTransaction } from '../../src/core/archive/transaction.js';
import * as specsSync from '../../src/core/specs-sync/index.js';
import {
  ARCHIVE_SUMMARY_VERSION,
  PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
  type ArchiveSummary,
} from '../../src/core/schemas/archive-summary.js';

describe('release-blocker: pause_decisions option=1/2 attack paths (9z gate)', () => {
  it.todo(
    'option=1 attack: marker 写 target_artifact=proposal.md / target_anchor=## What Changes,但实际 git diff 只改了 tasks.md → fence 应拒签(沿 9c §7.5.1 + design §2.1.5 line 262)',
  );

  it.todo(
    'option=2 attack: marker 写 task_ref=tasks.md#task-2 + 该 task 已勾选,但 git log 显示该 task 在 paused_at 之前已存在(非新增) → fence 应拒签(沿 9c §7.5.2 + design §2.1.5 line 263)',
  );
});

describe('release-blocker: 9e1 transaction failure injection paths (9z gate)', () => {
  afterEach(() => vi.restoreAllMocks());

  // —— helper:创建标准 forge skeleton ——
  function setup() {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-relblk-tx-'));
    const forgeRoot = join(tmpRoot, 'forge');
    mkdirSync(join(forgeRoot, 'changes', 'add-x', 'specs'), { recursive: true });
    mkdirSync(join(forgeRoot, 'specs'), { recursive: true });
    mkdirSync(join(forgeRoot, '.cache'), { recursive: true });
    writeFileSync(join(forgeRoot, 'changes', 'add-x', 'specs', 'x.md'), '# X spec\n', 'utf8');
    return { tmpRoot, forgeRoot, changeDir: join(forgeRoot, 'changes', 'add-x') };
  }

  // —— helper:构造最小合法 ArchiveSummary ——
  function summary(): ArchiveSummary {
    return {
      schema: 'forge-archive-summary/v1',
      version: ARCHIVE_SUMMARY_VERSION,
      archived_at: '2026-05-12T16:45:00Z',
      change_id: 'add-x',
      verify_passed: { verified_invariants: [] },
      review_passed: { reviewers: ['ai-agent'] },
      process_evidence_summary: PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
      handoff_to_backlog: [],
      acked_warnings: [],
      pending_suggestions: [],
    };
  }

  it('9e1 transaction rename .tmp → 正式名失败 → 抛 --resume-summary 提示', async () => {
    const s = setup();
    try {
      // 注入:在 source changeDir 预建 archive_summary.yaml 为「目录」
      // Move 把它一起搬到 archive 目录;阶段 1.5 rename(.tmp.yaml → archive_summary.yaml)
      // 目标已是目录 → rename 失败
      mkdirSync(join(s.changeDir, 'archive_summary.yaml'), { recursive: true });
      await expect(
        archiveTransaction({
          forgeRoot: s.forgeRoot,
          changeId: 'add-x',
          archiveDate: '2026-05-12',
          archiveSummary: summary(),
        }),
      ).rejects.toThrow(/--resume-summary/);
    } finally {
      rmSync(s.tmpRoot, { recursive: true, force: true });
    }
  });

  it('9e1 transaction Backup 失败 → 反向 Move + unlink summary 残留', async () => {
    const s = setup();
    try {
      // 注入:backupDir 路径预建为普通文件,cp(dir→file) 失败
      writeFileSync(join(s.forgeRoot, '.cache', `archive-sync-backup-${process.pid}`), 'x', 'utf8');
      await expect(
        archiveTransaction({
          forgeRoot: s.forgeRoot,
          changeId: 'add-x',
          archiveDate: '2026-05-12',
          archiveSummary: summary(),
        }),
      ).rejects.toThrow(/Backup failed/);
      // 反向 Move 后 source changeDir 应恢复
      expect(existsSync(s.changeDir)).toBe(true);
      // summary .tmp 不应残留在 source
      expect(existsSync(join(s.changeDir, 'archive_summary.tmp.yaml'))).toBe(false);
    } finally {
      rmSync(s.tmpRoot, { recursive: true, force: true });
    }
  });

  it('9e1 transaction Sync 失败 → 反向 Move + restore specs + unlink summary 原子回滚', async () => {
    const s = setup();
    try {
      writeFileSync(join(s.forgeRoot, 'specs', 'existing.md'), '# Existing\n', 'utf8');
      vi.spyOn(specsSync, 'applyDeltas').mockRejectedValueOnce(new Error('sync fail (simulated)'));
      await expect(
        archiveTransaction({
          forgeRoot: s.forgeRoot,
          changeId: 'add-x',
          archiveDate: '2026-05-12',
          archiveSummary: summary(),
        }),
      ).rejects.toThrow(/rolled back/);
      // 反向 Move 后 source changeDir 应恢复
      expect(existsSync(s.changeDir)).toBe(true);
      // specs restore:existing.md 应仍存在
      expect(existsSync(join(s.forgeRoot, 'specs', 'existing.md'))).toBe(true);
    } finally {
      rmSync(s.tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('release-blocker: 9j version-retrograde fail-closed git error path (9z gate)', () => {
  it.todo(
    'git repo 内 git log 命令失败(模拟 git binary 异常)→ version-retrograde fence fail-closed 拒签(plan-9j Task 4 v3 MAJOR 1;9z release plan 解锁 — 需要 mock spawn 或注入失败 child_process)',
  );
});
