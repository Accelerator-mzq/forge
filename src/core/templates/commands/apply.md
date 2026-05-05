---
description: 读 tasks.md 派子代理实施每个 task,顺序模式或 --parallel 模式
argument-hint: "[--parallel] [--change-id <id>]"
---

You are about to handle `/forge:apply $ARGUMENTS`.

解析:
- 默认:顺序模式(主工作区直接跑)
- `--parallel`:并行模式(每个独立 task 一个 worktree;遵循 forge:dispatching-parallel-agents 的 cherry-pick 串行协议)
- `--change-id <id>`:指定 change(默认为 `forge/changes/` 下唯一未归档的 change;若 >1,**报错并停止**列出选项)

## 步骤

1. **必须调用 `forge:subagent-driven-development` skill**(无 inline 模式)。
2. **必须调用 `forge:test-driven-development` skill** 作为每个 subagent 的实施纲领。
3. 若 `--parallel`,**追加调用 `forge:dispatching-parallel-agents` 和 `forge:using-git-worktrees`**。
4. 读 `forge/changes/<id>/tasks.md`,识别未勾选 tasks。
5. **顺序模式**:
   - for each task:派 fresh subagent(主工作区),subagent 拿 [task + 相关 specs/<sub-area>.md + design.md] 启动
   - subagent 跑 TDD:red → green → refactor + git commit
   - 主代理 review subagent 的 commit + test 日志,通过则在主工作区 tasks.md 把 `[ ]` 改 `[x]`
6. **--parallel 模式**:严格遵守 cherry-pick 串行协议(详 forge:dispatching-parallel-agents skill 的"forge --parallel 模式 cherry-pick 串行协议"段)
7. 全部 task 完成后,在 tasks.md 末尾追加(parallel 多 commit 用列表):
   ```yaml
   applied_commits:
     - <task-id-1>: <commit-hash>
     - <task-id-2>: <commit-hash>
   final_head: <git rev-parse HEAD>
   ```

## 禁止行为

- 不允许主代理直接写代码 — 所有 task 实施必须通过 subagent
- 不允许 subagent 改 tasks.md(写入是主代理单点串行职责)
- 不允许跳过 TDD 的 red 步骤(verify 阶段会发现并 append 修复 task)
