---
description: 调 forge archive CLI 把 change 移到 archive/、内部 sync specs/、严格校验 verify+review 标记
argument-hint: "<change-id> [--force] [--recover]"
---

You are about to handle `/forge:archive $ARGUMENTS`.

## 步骤

本命令是 CLI 的薄包装。直接执行:

```bash
forge archive $ARGUMENTS
```

## CLI 行为说明(给 AI 理解,不要重复实现)

1. **加进程锁** `forge/.cache/archive.lock`(防止并发)
2. **校验 verify-passed + review-passed 标记存在且合法**:
   - YAML 解析成功 + `schema` 字段值 = `forge-verify/v1` 或 `forge-review/v1`
   - 重算 `tasks_hash` / `content_hash` 必须等于 marker 字段值
   - 重算 git.head + git.diff_hash 必须等于(`is_git_repo: true` 时)
   - `verified_by`/`reviewed_by` 取值 ∈ `{ai-agent, human-override}`
3. **`--force` 接受这两类降级**:
   - `verified_by`/`reviewed_by` = `human-override`
   - `is_git_repo: false`(非 git 项目)跳过 git 字段
4. **`--force` 不覆盖**(任一不一致 archive 拒绝):
   - tasks_hash/content_hash 不一致(标记过期或被篡改)
   - evidence log 文件缺失 / log_hash 不匹配 / pass ≠ true
   - review_outcomes 中 accepted=true 但 resolved=false
5. **archive 顺序原子化**(spec §3.5):Move(rename)→ Sync(specs/ deltas)→ 失败回滚
6. **`--recover` 子模式**:扫描半归档状态(case A/B/C)并修复

## 禁止行为

- 不允许手工实现 Move/Sync/Rollback 原子化步骤(那是 CLI 内部实现;AI 只调 CLI,不重现 CLI 行为)
- 不允许在 archive 失败时绕过 verify+review 标记直接 mv 文件
- 不允许在 `--force` 不被允许的场景(如 hash 不匹配)主动加 `--force` 试图绕过

## AI 后续行为

archive 成功后,**调用 `forge:finishing-a-development-branch` skill** 提示用户做 git 层面的合并/PR/清理决策。
