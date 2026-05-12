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

import { describe, it } from 'vitest';

describe('release-blocker: pause_decisions option=1/2 attack paths (9z gate)', () => {
  it.todo(
    'option=1 attack: marker 写 target_artifact=proposal.md / target_anchor=## What Changes,但实际 git diff 只改了 tasks.md → fence 应拒签(沿 9c §7.5.1 + design §2.1.5 line 262)',
  );

  it.todo(
    'option=2 attack: marker 写 task_ref=tasks.md#task-2 + 该 task 已勾选,但 git log 显示该 task 在 paused_at 之前已存在(非新增) → fence 应拒签(沿 9c §7.5.2 + design §2.1.5 line 263)',
  );
});

describe('release-blocker: 9e1 transaction failure injection paths (9z gate)', () => {
  it.todo(
    '9e1 transaction rename .tmp → 正式名失败:archive dir 注入失败 → archive 数据已 move,fence 应明确抛错提示 --resume-summary(plan-9e1 Task 3 v2 MAJOR 2)',
  );
  it.todo(
    '9e1 transaction Backup 失败:反向 Move 后 unlink summary 应清理 source 目录残留(plan-9e1 Task 3 v2 MAJOR 2)',
  );
  it.todo(
    '9e1 transaction Sync 失败:反向 Move + restore specs from backup + unlink summary 应原子回滚(plan-9e1 Task 3 v2 MAJOR 2)',
  );
});
