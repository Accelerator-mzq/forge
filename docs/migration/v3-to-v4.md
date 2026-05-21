# Forge v3.x → v4.0 Migration Guide

> 本文档面向从 forge v3.x(v3.0.0 / v3.1.0 / v3.1.1)升级到 v4.0.0 的用户。
> v4 是 **BREAKING change**:整套反向加固协议被砍,设计哲学转向 OpenSpec 风格简洁对齐。
> 若你在 v3.x 仍有进行中的 `forge/changes/<id>/`,**升级前请按 §3 步骤操作**,避免 archive 失败。

---

## §1 哲学转向(读这一段就能理解 v4 整体动机)

v3.x forge 的核心增量是「反向加固协议」:防止 AI 在 spec / verify / archive 阶段偷懒,
表现为 13 个 fence、三级 severity、ack 两步协议、process-evidence freeze、ack-log
完整性链等机制。这些机制经过 9 轮 plan 演进沉淀,实施成本 + 维护成本都很高。

v4 决定 **整体砍掉反加固层**,把 forge 重新对齐 OpenSpec 简洁风格 —— **WARNING / suggestion
给用户自管**,机器只校验 spec layer(spec validate 仍跑 + marker schema 仍校验)。
forge 在 v4 仍保留的独特价值:

- **plan 写作约束**(skills/writing-plans 等行为塑造)
- **多 harness Tier 2/3 桥接**(Claude Code / OpenCode / Codex 三 harness 适配)
- **spec deltas 体系**(`readDeltas + applyDeltas` operation-driven 整文件 create/replace/delete)
- **archive 自动 backlog 同步**(`forge backlog active.md` 收集跨 change scope_entries)
- **stage-extensions hook**(codex review 多轮收敛集成)
- **legacy-bridge 双路径**(brownfield 锚定同步)

---

## §2 用户视角变化速查

| 变化              | v3.x 用户体验                                                                   | v4.0 用户体验                          |
| ----------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| `/forge:verify` 后  | invariant-7-verify-count WARNING + 要求 `forge ack propose` + `/forge:ack-confirm` | 直接 marker 写完,流畅过                |
| `/forge:review` 后  | subagent_review_chain 详细 staging + freeze 各种 hash                            | 直接 marker 写完,流畅过                |
| `/forge:archive` 失败 | "fence-9.3 ack-log chain verification failed: entry count mismatch"             | 仅 spec validate fail 或 marker 文件缺失 |
| Fluid Pause       | 复杂 marker pause_decisions 字段 + capture_id 链 + freeze hash 校验               | 简单 5 字段数组 + 自由 notes prose      |
| AI 偷懒可能       | 几乎所有路径都被 fence 挡住                                                     | 用户自管 —— 跟 OpenSpec 一样           |
| `/forge:ack-confirm` | 处理 WARNING 两步 ack 的 user-confirm 入口                                       | **整删** —— 无 ack 协议                |

---

## §3 已有 active change 升级路径(**必读**)

用户从 v3.1.1 升级到 v4.0.0 时,正在进行中的 `forge/changes/<id>/` 怎么办?

**唯一升级路径 —— 重跑 verify/review**:不引入 `--legacy-marker-mode` 等兼容 flag,
保留单一路径以避免长期维护负担。

### 3.1 升级前必须做的清理

在跑 `pnpm update -g @accelerator-mzq/forge`(或等价命令)拿到 v4.0.0 之前,**先清掉
v3 反加固协议遗留的临时文件**:

```bash
# 1) 删 pending ack 目录(v4 不再读)
rm -rf forge/changes/<id>/.evidence/pending-acks/

# 2) 删 archive pause 缓存(v4 不再有 archive pause 协议)
rm -f forge/.cache/archive-pause-<id>.json

# 3) 删 process evidence staging(v4 不再用 staging)
rm -f forge/changes/<id>/.evidence/process-evidence.staging.yaml

# 4) 可选:删 ack-log.jsonl(v4 不再用 ack-log;保留作 history 也无害,v4 archive 不读)
rm -f forge/changes/<id>/.evidence/ack-log.jsonl
```

> ⚠️ **不要**在 v4 升级后才清理这些文件 —— v4 archive 看到旧 v1 marker 会拒绝 archive,
> 你会卡在「marker schema fail + 旧目录」混合状态;先清后升路径最干净。

### 3.2 升级后重跑 verify/review

升级到 v4.0.0 后,对每个进行中的 change:

```bash
# 重跑 verify:slash 命令会调 forge:verification-before-completion skill,
# 写出 v4 v2 marker(schema: forge-verify/v2)覆盖原 v1 marker
/forge:verify --change-id <id>

# 同理重跑 review:写 v4 v2 review marker
/forge:review --change-id <id>

# 跑 archive:通过 v2 schema validate + spec deltas apply + mv
/forge:archive --change-id <id>
```

verify/review 重跑不会破坏 change 数据,只是覆盖 `.verify-passed` / `.review-passed`
marker 文件本身。proposal / design / tasks / specs 等产物不变。

### 3.3 不升级中途升级 forge 版本会发生什么?

如果你**没有**做 §3.1 清理就升级 + 直接跑 `/forge:archive`,v4 archive 会:

1. **marker schema validate fail** → 报错 `forge-verify/v2 required, got forge-verify/v1` → exit 1
2. 不会移动任何文件、不会写 archive_summary,无副作用 —— 你仍可回头补做 §3.1 清理 + §3.2 重跑

---

## §4 已 archived change 兼容性

`forge/changes/archive/*` 已归档的 v1 marker / 复杂 archive_summary.yaml **全部保留,不动**。
v4.0 不读它们,只追加新 archive(沿 OpenSpec 风格,archive 是 dead state 不再操作)。

**backlog 兼容性**:`forge backlog scan-archived-followups` 在 v4 仍能扫到 v3 时期 archived
change 的 `proposal.md` / `design.md` 内 `## Out of Scope` / `## Future Work` / `## Non-Goals`
YAML 块(`forge-scope-entries/v1` schema 未变),与 archive_summary 改 v2 schema 无关。

---

## §5 CLI 子命令兼容性表

| 子命令                       | v4 状态                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `forge validate`             | **保留**(spec validate 不变,sanity check 非 fence)                                       |
| `forge init`                 | **保留**                                                                                   |
| `forge update`               | **保留**                                                                                   |
| `forge archive`              | **重写(BREAKING)** —— 新增 `--yes` / `--skip-specs`(沿 OpenSpec);删 `--recover` / `--resume-summary` / `--resume`(v3 transaction 中断恢复消亡);保留 `--force` / `--api` |
| `forge upgrade`              | **保留**(v0.2 → v0.3 legacy upgrade;**删 `--resign-markers` flag** —— 反加固 marker 重签消亡) |
| `forge migrate`              | **保留**                                                                                   |
| `forge legacy-bridge`        | **保留**                                                                                   |
| `forge preflight`            | **保留**                                                                                   |
| `forge stage-extensions`     | **保留**                                                                                   |
| `forge monitor`              | **保留**(archive 阶段事件名 `fence_observed` → `archive_summary_observed`,字段对齐 v2 archive_summary) |
| `forge backlog`              | **保留**                                                                                   |
| `forge scope`                | **保留**                                                                                   |
| `forge config`               | **保留**                                                                                   |
| `forge finding`              | **保留**(multi-harness Tier 2/3 bridge `forge finding hash` 仍调用 — finding-hash 属 spec layer 工具,不是 archive fence) |
| **`forge ack`**              | **整删** —— 反加固两步 ack 协议消亡                                                         |
| **`forge evidence`**         | **整删** —— evidence helper 消亡(测试日志直接走 verify skill)                              |
| **`forge pause-capture`**    | **整删** —— pause-capture marker freeze 消亡                                                |

---

## §6 marker schema v1 → v2 对照

### 6.1 VerifyMarker

```yaml
# v3 v1(被删)
schema: forge-verify/v1
verified_at: 2026-05-04T15:30:00Z
verified_by: ai-agent
tasks_hash: sha256:...           # 删
content_hash: sha256:...         # 删
git:                             # 删整段
  is_git_repo: true
  head: ...
  diff_hash: ...
  diff_pathspec: ...
evidence:                        # 删整段(EvidenceItem 数组)
  - scenario_id: ...
    test_command: ...
    test_file: ...
    log_path: ...
    log_hash: ...
    pass: true
verify_findings:                 # 删整段
  - id: 1
    severity: WARNING
    finding_hash: sha256:...
    ...
process_evidence:                # 删整段
  invariants_passed: 10
  ...
ack_log_tail_hash: sha256:...    # 删
ack_log_entry_count: 5           # 删
```

```yaml
# v4 v2(极简)
schema: forge-verify/v2
verified_at: 2026-05-21T10:00:00Z
verified_by: ai-agent              # 'ai-agent' | username | 'human-override'(需 --force)
pause_decisions:                   # 可选
  - paused_at: 2026-05-21T09:00:00Z
    task_ref: tasks.md#task-3
    issue_summary: subagent 发现 spec 漏点
    chosen_option: 2               # 1/2/3/4
    notes: 自由 prose(可选)
created_by_tool_version: 4.0.0     # 可选,FORGE_VERSION 动态读 package.json
```

### 6.2 ReviewMarker

镜像 VerifyMarker v2,`reviewed_at` / `reviewed_by` 替换 `verified_at` / `verified_by`,
schema 为 `forge-review/v2`。其他字段(`pause_decisions` / `created_by_tool_version`)与
VerifyMarker v2 一致。

### 6.3 失败 marker 整删

v3 的 `.verify-failed` / `.review-failed` marker 在 v4 **不再生成** —— verify/review 失败
直接 abort,user 修复后重跑。这简化了 archive 路径(只看 `.verify-passed` / `.review-passed`)。

### 6.4 archive_summary v1 → v2

```yaml
# v3 v1(被删字段)
acked_warnings: [...]              # 删
pending_suggestions: [...]         # 删
process_evidence_summary: {...}    # 删
verify_passed:                     # 字段降级:v2 改 verified_by 直接顶级
  verified_invariants: [...]       # 删 14 不变量
review_passed:
  reviewers: [...]                 # 删 simcode 兼容
```

```yaml
# v4 v2
schema: forge-archive-summary/v2
version: 2.0.0
archived_at: 2026-05-21T12:00:00Z
change_id: add-login
archive_name: 2026-05-21-add-login
verified_by: ai-agent              # 直读 verify marker
reviewed_by: ai-agent              # 直读 review marker
applied_commits:                   # 可选,user/AI 自填
  - <commit-sha>
spec_updates_applied:              # 从 forge applyDeltas SpecDelta[] 转
  - capability: auth
    operation: replace             # create | replace | delete
handoff_to_backlog:                # 两来源:pause_decisions option=3 + scope_entries active
  - source: pause_decisions
    id: 0
    chosen_option: 3
    issue_summary: 转 out-of-scope 项
  - source: scope_entries
    id: oos-1
    category: out-of-scope         # out-of-scope | non-goal | future-work
    description: ...
    reason: ...
```

---

## §7 已知限制 / Risk

### 7.1 spec sync 部分失败无回滚

v4 `forge archive` 步 6 `applyDeltas` 逐文件写入 `forge/specs/` 时,**部分成功无原子回滚**:
若中途某文件写失败,前面已写的 spec 文件保留,后面的不写,archive 中止。

撞到时手动处理:

```bash
# 1) 用 git checkout 撤回部分写入的 forge/specs/<capability>.md
git checkout -- forge/specs/

# 2) 修复磁盘空间 / 权限问题后重跑 archive
forge archive <change-id>
```

此限制沿 OpenSpec archive 风格(`forge/specs/` 部分写入是 best-effort)。v3 的 transaction
五阶段 atomic 重试机制在 v4 已删 —— 接受这个 risk 换取代码简洁。

### 7.2 没有 `--legacy-marker-mode v1` 兼容 flag

v4 不引入 v1 marker 兼容路径。理由:plan v10 review 时已确认单一路径(重跑 verify/review)
不破坏数据,引入 flag 会带来 long-tail 维护负担。若你的工作流确实需要持续兼容 v1
marker,可暂留 v3.1.1。

### 7.3 monitor 阶段 trace 事件名变化

`forge monitor` 在 v4 把 archive 阶段的 `fence_observed` 事件改名为 `archive_summary_observed`
(更准确反映 v4 无 fence 拒签的语义)。如果你有外部消费 trace events 的工具,需要同步改
事件名。其他事件名(`marker_observed` / `record_error` / `stage_enter` / `cli_exit` /
`hardening_step`)不变。

### 7.4 health-verdict 不再判 ack-confirm 阶段

`MonitorStage` 类型 v4 删 `'ack-confirm'`。如果你的 trace 历史含 `stage: 'ack-confirm'` 事件,
v4 不会解析(但也不会崩,只是不进 health verdict 计算)。

---

## §8 升级 checklist 速查

- [ ] 对每个 `forge/changes/<id>/`,跑 §3.1 清理命令
- [ ] `pnpm update -g @accelerator-mzq/forge`(或对应 plugin 升级 — 见 `docs/migration/upgrading.md`)
- [ ] 跑 `forge --version` 确认是 `4.0.0` 或更新
- [ ] 对每个 active change,跑 `/forge:verify` + `/forge:review` 写 v2 marker
- [ ] 跑 `/forge:archive <id>` 确认 archive 路径打通
- [ ] 跑 `forge backlog active.md` 确认 backlog 仍能正常生成
- [ ] 若依赖 `forge monitor` trace,把外部消费侧的 `fence_observed`(archive 阶段)改名 `archive_summary_observed`

---

## §9 进一步阅读

- [`CHANGELOG.md`](../../CHANGELOG.md) — `[4.0.0]` 段完整 BREAKING 列表
- [`docs/plans/2026-05-20-plan-v4-openspec-alignment.md`](../plans/2026-05-20-plan-v4-openspec-alignment.md) — v4 设计完整 plan(11 轮 Codex review 闭环)
- [`docs/cli-reference.md`](../cli-reference.md) — v4 CLI 子命令完整文档
- [`docs/getting-started.md`](../getting-started.md) — v4 端到端工作流
- [`src/core/markers/types.ts`](../../src/core/markers/types.ts) — v4 marker schema 类型定义
- [`src/core/schemas/archive-summary.ts`](../../src/core/schemas/archive-summary.ts) — v4 archive_summary schema 类型定义
