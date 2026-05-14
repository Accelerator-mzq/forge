// tests/integration/process-evidence-end-to-end.test.ts — plan-9g Task 6.3
// e2e 8 attack + 1 GREEN(三档 mode sub-fixture)— brainstorm spec §8.3
//
// 8 attack fixture(每 fixture 一个目录,含 marker / staging / ack-log + 预期 fence 输出):
//   tests/fixtures/process-evidence/attack-1-timestamp-reverse/
//   tests/fixtures/process-evidence/attack-2-rebase-ancestor-broken/
//   tests/fixtures/process-evidence/attack-3-same-commit-no-red/
//   tests/fixtures/process-evidence/attack-4-unrelated-failure/
//   tests/fixtures/process-evidence/attack-5-fake-verify-invocations/
//   tests/fixtures/process-evidence/attack-6-bypass-helper/
//   tests/fixtures/process-evidence/attack-7-hash-only-no-ack/
//   tests/fixtures/process-evidence/attack-8-cross-branch-rewrite/(brainstorm v6 新增)
//
// 1 GREEN(含三档 mode sub-fixture):
//   tests/fixtures/process-evidence/green-normal-tdd-pass-full/
//   tests/fixtures/process-evidence/green-normal-tdd-pass-sample/
//   tests/fixtures/process-evidence/green-normal-tdd-pass-hash-only/
//
// 完整 fixture inline 留 writing-plans 阶段 review 后落地(§0.0 留白 1)
// 每 attack fixture 含约 200-400 行 git fixture + YAML 文件

import { describe, it } from 'vitest';

describe('process-evidence e2e attacks (plan-9g Task 6.3)', () => {
  it.todo('A1 改 timestamp → forge archive 拒签 + 不变量 1 finding');
  it.todo('A2 rebase ancestor 断 → 拒签 + 不变量 2');
  it.todo('A3 同 commit 无 exemption → 拒签 + 不变量 5/11');
  it.todo('A4 不相关代码错误当 RED → 拒签 + 不变量 5 子项 b');
  it.todo('A5 伪 verify_invocations log → 拒签 + 不变量 9');
  it.todo('A6 marker 字段绕 helper 直写 → 拒签 + 不变量 9 staging mismatch');
  it.todo('A7 hash-only 无 ack → 拒签 + 不变量 12');
  it.todo('A8 旁支造合法链 + 主分支换实现 → 拒签 + 不变量 14(brainstorm v6 新增)');
  it.todo('GREEN full mode → 通过 archive');
  it.todo('GREEN sample mode(已 ack）→ 通过 archive');
  it.todo('GREEN hash-only mode(已 ack）→ 通过 archive');
});
