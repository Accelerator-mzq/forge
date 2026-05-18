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

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
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

// —— mock node:child_process:让 execFile 受控 mock 拦截(todo 6 fail-closed 测试需要) ——
// vi.hoisted + vi.mock factory:在模块加载前替换 execFile,promisify 才拿到 stub 引用
// execFileSync 由 ...actual 保留真实实现(Task 1 transaction + option 攻击路径不受影响)
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: execFileMock };
});

import { archiveTransaction } from '../../src/core/archive/transaction.js';
import * as specsSync from '../../src/core/specs-sync/index.js';
import {
  ARCHIVE_SUMMARY_VERSION,
  PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
  type ArchiveSummary,
} from '../../src/core/schemas/archive-summary.js';
import { validateVersionRetrograde } from '../../src/core/archive/version-retrograde-fence.js';
import { validatePauseDecisionsFence } from '../../src/core/archive/pause-decisions-fence.js';
import { appendAckLog, readAllAckLogEntries } from '../../src/core/ack-log.js';
import { canonicalHash } from '../../src/core/canonical-json.js';
import { execFileSync } from 'node:child_process';

// 文件级 beforeEach:每个测试前把 execFileMock 转发到真实 execFile + 适配 callback 形态
// 真实 execFile callback 签名是 (err, stdout, stderr)
// promisify 默认期望 (err, {stdout, stderr}) — 手动适配保证 transaction / option 攻击路径正常
beforeEach(async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  execFileMock.mockImplementation(
    (
      cmd: string,
      args: readonly string[],
      opts: unknown,
      cb: (e: Error | null, r?: { stdout: string; stderr: string }) => void,
    ) =>
      (actual.execFile as Function)(
        cmd,
        args,
        opts,
        (err: Error | null, stdout: string, stderr: string) => cb(err, { stdout, stderr }),
      ),
  );
});

describe('release-blocker: pause_decisions option=1/2 attack paths (9z gate)', () => {
  it('option=1 attack:marker 写 target_anchor=## What Changes 但 diff 只改 tasks.md → fence 拒签', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'forge-relblk-opt1-'));
    try {
      // 初始化 git 仓库并建立 baseline commit
      execFileSync('git', ['init', '-q'], { cwd: repoRoot });
      execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: repoRoot });
      execFileSync('git', ['config', 'user.name', 't'], { cwd: repoRoot });
      const changeDir = join(repoRoot, 'forge', 'changes', 'c1');
      mkdirSync(changeDir, { recursive: true });
      // baseline:写入 proposal.md(含 ## What Changes 段)和 tasks.md
      writeFileSync(
        join(changeDir, 'proposal.md'),
        '# P\n\n## What Changes\n\n- a\n\n## Impact\n\n- x\n',
      );
      writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [ ] task-1: t\n');
      execFileSync('git', ['add', '-A'], { cwd: repoRoot });
      execFileSync('git', ['commit', '-q', '-m', 'baseline'], { cwd: repoRoot });
      // attack:只改 tasks.md,proposal.md 不动,但 marker 声称 option=1 改了 ## What Changes
      writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [x] task-1: t\n');
      const result = await validatePauseDecisionsFence(
        {
          pause_decisions: [
            {
              id: 1,
              paused_at: '2026-05-12T14:30:00Z',
              task_ref: 'tasks.md#task-1',
              issue_summary: 'x',
              severity: 'WARNING',
              severity_acked_by: 'msc',
              severity_acked_at: '2026-05-12T14:32:00Z',
              chosen_option: 1,
              target_artifact: 'proposal.md',
              target_anchor: '## What Changes',
              non_blocking_rationale: null,
              other_rationale: null,
              other_acked_by: null,
            },
          ],
        },
        changeDir,
        repoRoot,
      );
      // proposal.md 未改 → git diff 空 → What Changes 段无新增行 → fence 拒签
      expect(result.valid).toBe(false);
      // 锁定拒签原因是 option=1 diff 段级校验(防 fence 重构后退化为字段校验拒签仍假绿)
      expect(result.errors.some((e) => /What Changes.*无新增行/.test(e.message))).toBe(true);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('option=2 attack:added_task_ref 指向的 task 在 capture 快照中已存在(非新增)→ fence 拒签', async () => {
    const changeDir = mkdtempSync(join(tmpdir(), 'forge-relblk-opt2-'));
    try {
      // 写 tasks.md:task-1 和 task-3 都存在
      writeFileSync(
        join(changeDir, 'tasks.md'),
        '# Tasks\n\n- [x] task-1: a\n- [x] task-3: 旧 task\n',
      );
      // 构造 pause-capture entry:tasks_md_task_ids 含 task-3(attack:task-3 在 capture 时已存在)
      const entry = {
        schema: 'forge-ack-log/v1' as const,
        kind: 'pause-capture' as const,
        timestamp: '2026-05-12T14:25:00Z',
        capture_id: 'cap-attack',
        change_id: 'c1',
        task_ref: 'tasks.md#task-1',
        pause_issue_summary: 'x',
        tasks_md_task_ids: ['task-1', 'task-3'], // attack:task-3 在 capture 时已存在
        git_head: null,
        extra: {},
      };
      await appendAckLog(changeDir, entry);
      const all = await readAllAckLogEntries(changeDir);
      const tail = canonicalHash(all[all.length - 1]!);
      // added_task_ref='tasks.md#task-3' 末段 'task-3' ∈ tasks_md_task_ids → 非新增 → fence 拒签
      const result = await validatePauseDecisionsFence(
        {
          ack_log_tail_hash: tail,
          ack_log_entry_count: all.length,
          pause_decisions: [
            {
              id: 1,
              paused_at: '2026-05-12T14:25:00Z',
              task_ref: 'tasks.md#task-1',
              issue_summary: 'x',
              severity: 'WARNING',
              severity_acked_by: 'msc',
              severity_acked_at: '2026-05-12T14:27:00Z',
              chosen_option: 2,
              target_artifact: 'tasks.md',
              target_anchor: '- task-3',
              non_blocking_rationale: null,
              other_rationale: null,
              other_acked_by: null,
              added_task_ref: 'tasks.md#task-3',
              capture_id: 'cap-attack',
            },
          ],
        },
        changeDir,
        changeDir,
        { verifyAckLogTailHash: tail, verifyAckLogEntryCount: all.length, changeId: 'c1' },
      );
      expect(result.valid).toBe(false);
      // 锁定拒签原因是 capture 快照含 added task(防 fence 重构后退化为别的 step 拒签仍假绿)
      expect(result.errors.some((e) => /capture 时刻已存在|非新增/.test(e.message))).toBe(true);
    } finally {
      rmSync(changeDir, { recursive: true, force: true });
    }
  });
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

  it('9e1 transaction Backup 失败 → 反向 Move + unlink summary(无残留)', async () => {
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
      // summary 正式名 + .tmp 均不应残留在 source(回滚 unlink)
      expect(existsSync(join(s.changeDir, 'archive_summary.yaml'))).toBe(false);
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
      // summary 正式名 + .tmp 均不应残留在 source(回滚 unlink)
      expect(existsSync(join(s.changeDir, 'archive_summary.yaml'))).toBe(false);
      expect(existsSync(join(s.changeDir, 'archive_summary.tmp.yaml'))).toBe(false);
    } finally {
      rmSync(s.tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('release-blocker: 9j version-retrograde fail-closed git error path (9z gate)', () => {
  it('9j git repo 内 git log 失败(模拟 git binary 异常)→ version-retrograde fail-closed 拒签', async () => {
    // override 当次:rev-parse 成功(确认是 git repo),git log 失败(模拟 git binary 异常)
    execFileMock.mockImplementation(
      (
        _cmd: string,
        args: readonly string[],
        _opts: unknown,
        cb: (e: Error | null, r?: { stdout: string }) => void,
      ) => {
        if (args[0] === 'rev-parse')
          cb(null, { stdout: 'true\n' }); // 确认是 git repo
        else cb(new Error('git log: simulated failure')); // git log fail-closed
        return undefined as unknown as ReturnType<typeof import('node:child_process').execFile>;
      },
    );
    const result = await validateVersionRetrograde(
      '/tmp/fake/.verify-passed',
      { created_by_tool_version: '1.0.0' },
      '/tmp/fake',
    );
    expect(result.valid).toBe(false);
  });
});
