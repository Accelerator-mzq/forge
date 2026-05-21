---
description: 调 forge archive CLI 把 change 移到 archive/、应用 spec deltas、写 archive_summary
argument-hint: '[change-id] [--force] [--yes] [--skip-specs] [--api]'
---

You are about to handle `/forge:archive $ARGUMENTS`.

## 步骤

本命令是 CLI 的薄包装。直接执行:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" archive $ARGUMENTS
```

(plugin helper 内部 spawn npx 拉 forge CLI,避开 v0.2 P1 全局 PATH 问题。OpenCode/Codex 路径走 skill 内嵌 fenced bash 调本地 `npx forge archive`,见 `skills/using-forge/SKILL.md`。)

## flag 说明

| flag           | 行为                                                                  |
| -------------- | --------------------------------------------------------------------- |
| `[change-id]`  | 默认交互式列 active change(>1 时必选);唯一 active 时可省              |
| `--force`      | 接受 `verified_by='human-override'` 或 `reviewed_by='human-override'` |
| `--yes`        | CI 模式:跳过 incomplete-tasks confirm + spec deltas apply confirm     |
| `--skip-specs` | 跳过 `forge/specs/` deltas 应用步                                     |
| `--api`        | legacy-bridge sync-check 直连 Anthropic API(否则走 agent emit)        |

## CLI 行为(给 AI 理解,不要重复实现)

1. **legacy-bridge preflight**(若 `legacy_bridge.enforce_sync=true` 且 anchors 就绪)
   - agent 模式 emit sync-check manifest 后 exit 2 暂停
   - `--api` 模式直连跑 sync-check,有 critical pending 时 exit 2
   - graceful skip 路径:config 缺 / anchors 缺 / allow_llm_calls=false / enforce_sync=false / 无受影响 anchor
2. **Spec validate**(永远跑,blocking — sanity check 非 fence)
3. **marker 存在性 + schema 校验**:`.verify-passed` schema=`forge-verify/v2`,`.review-passed` schema=`forge-review/v2`;human-override 需 `--force`
4. **未完成 task confirm**(`- [ ] ` 计数 > 0 且非 `--yes`):dangerous-by-default 回车 = NO
5. **Spec deltas 应用**(非 `--skip-specs`):`readDeltas` 列 create/replace/delete 操作 → 渲染 → 非 `--yes` 时 safe-by-default confirm 回车 = YES → `applyDeltas` 写 `forge/specs/`
6. **mv `forge/changes/<id>/` → `forge/changes/archive/<YYYY-MM-DD>-<id>/`**(`getArchiveDate` 算一次,跨午夜防偏)
7. **写 `archive_summary.yaml`** 到 archive 目录(schema `forge-archive-summary/v2`)
8. **legacy-bridge posthook**(`enforce_sync=false` 时跑;`--api` 直接写报告,否则 emit manifest 非阻塞)
9. **自动重生成 backlog**(`forge backlog active.md`;失败仅 warn,不回滚 archive)
10. **emit monitor trace event**(`change_archived` 给 `forge monitor`)

## archive_summary v2 输出

`forge/changes/archive/<archive-name>/archive_summary.yaml` 顶层字段(沿 `src/core/schemas/archive-summary.ts`):

- `schema: forge-archive-summary/v2`
- `version`(`2.0.0`)
- `archived_at` ISO 8601 UTC
- `change_id` / `archive_name` / `verified_by` / `reviewed_by`
- `applied_commits?`(可选 — user/AI 自填)
- `spec_updates_applied[]`:`{ capability, operation: create|replace|delete }`
- `handoff_to_backlog[]`:两类来源(`scope_entries` 与 `pause_decisions` chosen_option=3)

## 禁止行为

- 不允许在 archive 失败时绕过 marker 校验直接 mv 文件
- 不允许伪造 `.verify-passed` / `.review-passed`(主代理必须真跑 `/forge:verify` + `/forge:review`)
- 不允许在 schema 不是 v2 时手动改 schema 字段(用 `/forge:verify` 或 `/forge:review` 重写)

## AI 后续行为

archive 成功后,**调用 `forge:finishing-a-development-branch` skill** 提示用户做 git 层面的合并/PR/清理决策。

## v3 → v4 marker 升级

v3 marker(`forge-verify/v1` / `forge-review/v1`)在 v4 archive 时会被 schema 校验拒。唯一升级路径:**重跑 `/forge:verify` + `/forge:review` 写 v2 marker**(沿 `docs/migration/v3-to-v4.md`)。`forge upgrade --resign-markers` flag 已在 v4 移除。

## sync-check manifest fulfillment

archive 输出提示 emit 了 sync-check manifest(`forge/.cache/archive-pause-<id>.json` 存在):

1. 按 `legacy-bridge-fulfillment` skill fulfill 该 manifest
2. 跑 `forge legacy-bridge sync-check --apply`
3. 重跑 `forge archive`(从头跑;v4 删了 `--resume` flag,直接重跑即可。preflight 看到 sync-state 已就绪不会重新暂停)
