# Forge Getting Started(v1.1 端到端工作流)

> 用 Claude Code + forge plugin 把"我想做个 todo list 应用"从模糊想法走到归档,**全流程跟着这一份跑通**。

> ⚠️ 适用 forge **v1.1.0** 及以后版本。装的是 v1.0.x 走 [v1.0 getting-started](https://github.com/Accelerator-mzq/forge/tree/v1.0.x/docs/getting-started.md);v0.3 / v0.2 升级指南待写(下一轮单独文档)。

## 在你开始前

- Node.js ≥ 20.19,pnpm ≥ 9
- 已装 [Claude Code](https://claude.ai/code)(本教程 Tier 1 全功能路径)
- 一个干净空目录,**最好 git init 过**(非 git 项目下 review marker 不绑代码 diff,archive 必须 `--force` 才接受)
- 心理预期:跟着跑一遍 **10-20 分钟**(AI 实施 + review + verify 子代理大约 5-10 分钟,你做决策约 5 分钟)

## 目录

- [第 0 步 — 安装](#第-0-步--安装)
- [第 1 步 — Brainstorm 出 draft](#第-1-步--brainstorm-出-draft)
- [第 2 步 — Propose 出 4 件套](#第-2-步--propose-出-4-件套)(含 `/forge:explore` 嵌入)
- [第 3 步 — Apply 实施](#第-3-步--apply-实施)(含 `forge preflight branch-check` + Fluid Pause 嵌入)
- [第 4 步 — Review](#第-4-步--review)(含 ack 两步协议嵌入)
- [第 5 步 — Verify 三维](#第-5-步--verify-三维)
- [第 6 步 — Archive 三级 fence](#第-6-步--archive-三级-fence)
- [出问题怎么办](#出问题怎么办)
- [与 superpowers plugin 共存](#与-superpowers-plugin-共存)
- [接下来](#接下来)

## 第 0 步 — 安装

### 你要做的

在 Claude Code 会话里装 forge plugin,装完看到 16 个 `forge:*` skill auto-trigger + 9 个 `/forge:*` slash 命令。

### 准确操作

```bash
mkdir my-todo-app && cd my-todo-app
git init && touch .gitignore   # brainstorming skill preflight 要求 git base
claude                          # 启动 Claude Code 会话
```

在 Claude Code 会话里发:

```
/plugin marketplace add Accelerator-mzq/forge
/plugin install forge@accelerator-mzq-forge
/reload-plugins
```

完成后 `/exit` 退出会话,再 `claude` 重新启动一次(SessionStart hook 必须 fire 一次才注入 skill / slash 命令)。

> 注:legacy projects 仍可用 `pnpm dlx @accelerator-mzq/forge init --harness claude`,v1.2 移除(沿 `src/cli/commands/init.ts:28-38`)。

### 期望发生(✅ 表示 forge 工作正常)

- ✅ `/plugin marketplace add` 报 "Marketplace added: accelerator-mzq-forge"
- ✅ `/plugin install` 报 "Plugin installed: forge"
- ✅ 重启 session 后,任意位置打 `/forge:` 看到 9 个候选(brainstorm / propose / explore / apply / review / verify / archive / upgrade / ack-confirm)
- ✅ 任意位置打 `/skills` 看到 16 个 `forge:*` skill

> ❌ 如果 `/forge:` 没补全 → bootstrap 没生效,见 [§出问题怎么办 第 1 条](#出问题怎么办)

### 确认

```bash
# 在 my-todo-app 目录(此时 forge plugin 还没创建 forge/ 骨架 — 等 §1 brainstorm 触发)
ls -la  # 期望:.git/ + .gitignore 之外没别的
```

## 第 1 步 — Brainstorm 出 draft

### 你要做的

把"我想做 X"模糊想法,通过 AI 反问 2-3 轮后,落成 `forge/drafts/<date>-<topic>.md`。

### 准确操作

在 Claude Code 会话里发(字面 prompt):

```
我想做个 todo list 应用
```

AI 会**逐条**反问——每次只问一个问题,不会一口气甩出问卷。你回答之后,它可能再追问一轮。
典型问题集中在三类:

- **目的**:给自己用还是给团队用?Web / CLI / 其他?
- **约束**:技术栈偏好、需不需要持久化、有无部署限制?
- **成功标准**:什么情况下算"做完"?

2-3 轮问答后,AI 提出 2-3 个 approach 对比(含推荐),确认后分段展示 design,每段都等你 approve 再继续。

> 或者显式调 `/forge:brainstorm` 走专用入口,会绕开 `superpowers:brainstorming` 抢跑,见 [§与 superpowers plugin 共存](#与-superpowers-plugin-共存)。

### 期望发生(✅ 表示 forge 工作正常)

- ✅ AI invoke `forge:brainstorming` skill(会在响应开头声明)
- ✅ AI **不**直接写代码
- ✅ AI 一次只问一个澄清问题(目的 / 约束 / 成功标准)
- ✅ AI 提议写 draft 到 `forge/drafts/<YYYY-MM-DD>-todo-list.md`
- ✅ AI 询问是否 commit draft(brainstorming skill 末尾步骤)

> ❌ 如果 AI 直接开始写 .ts 代码 → bootstrap 没生效,见 [§出问题怎么办 第 1 条](#出问题怎么办)
> ❌ 如果 AI 调的是 `superpowers:brainstorming` 而非 `forge:brainstorming`(没写 forge/drafts/)→ 见 [§与 superpowers plugin 共存](#与-superpowers-plugin-共存)

### 确认

```bash
ls forge/drafts/        # 期望:1 个 .md 文件(<YYYY-MM-DD>-todo-list.md)
cat forge/drafts/*.md | head -30   # 期望:Why + What + 关键决策列表
```

draft 文件顶部应该能看到:你选了哪个 approach、核心约束、成功标准。如果看到的是空文件或者文件名
不符合 `<YYYY-MM-DD>-todo-list.md` 格式,说明 brainstorming skill 末尾步骤没有正常执行。

### 深读

- [`skills/brainstorming/SKILL.md`](../skills/brainstorming/SKILL.md) — brainstorming skill 完整协议(问题质量、approach 对比、design section 分段确认、spec self-review 4 项检查)

## 第 2 步 — Propose 出 4 件套

### 你要做的

把 draft 转 4 件套(`proposal.md` / `specs/<area>.md` / `design.md` / `tasks.md`)落到 `forge/changes/<change-id>/`。

### 准确操作

在 Claude Code 会话里发(替换 `add-todo` 为你的 change id,替换 draft 文件名为 §1 产出的实际名):

```
/forge:propose add-todo --from-draft 2026-05-14-todo-list
```

注:`--from-draft` 后跟 draft 文件名(去掉 `.md` 后缀);draft 文件必须在 `forge/drafts/<date-topic>.md`(沿 `commands/propose.md:11`)。

### 期望发生(✅ 表示 forge 工作正常)

- ✅ AI invoke `forge:writing-plans` skill
- ✅ AI 读 `forge/drafts/2026-05-14-todo-list.md`
- ✅ AI 按 scale-aware mode(proposal < 200 行 → light mode 1-2 task;否则 full mode 5+ task)产 4 件套到 `forge/changes/add-todo/`:
  - `proposal.md` — Why + What + Scope
  - `specs/<area>.md` — Given/When/Then 格式
  - `design.md` — 技术方案
  - `tasks.md` — checkbox 列表(每个 task 2-5 分钟粒度)
- ✅ draft 移到 `forge/drafts/.consumed/`

> ❌ 如果报 "draft 不存在: forge/drafts/<name>.md" → draft 路径写错,跑 `ls forge/drafts/` 确认实际文件名

### 嵌入 deep-dive

> 💡 **深入:不确定方案时先 `/forge:explore` 探路**
>
> 如果你的需求比较模糊,**直接 propose 容易得到错误 design**。可以先用 `/forge:explore` 让 AI 调研 codebase + 列 2-3 个可行 approach:
>
> ```
> /forge:explore --change add-todo
> ```
>
> AI invoke `forge:exploring` skill,产 `forge/changes/add-todo/explore-notes.md`(approach 对比 + 选定理由)。回头 propose 时,writing-plans skill 会读 explore-notes 作为 design 输入。

### 确认

```bash
ls forge/changes/add-todo/         # 期望:proposal.md / specs/ / design.md / tasks.md
ls forge/drafts/.consumed/         # 期望:原 draft 文件已移到这里
```

### 深读

- [`skills/writing-plans/SKILL.md`](../skills/writing-plans/SKILL.md) — writing-plans skill scale-aware mode 协议
- [`skills/exploring/SKILL.md`](../skills/exploring/SKILL.md) — exploring skill 调研协议
- [`commands/propose.md`](../commands/propose.md) — /forge:propose 命令完整参数 + 错误退出码

## 第 3 步 — Apply 实施

### 你要做的

让 AI 派 fresh 子代理对每个 task 跑 TDD(red → green → refactor),主代理回写 `tasks.md`。

### 准确操作

**先 preflight**(在 shell 里跑,不在 Claude Code 会话):

```bash
cd /path/to/my-todo-app
forge preflight branch-check
```

期望输出:`✓ Currently on '<branch>' (protected: false)`,exit 0。
如果你在 main / master 分支,exit 2,要么 `git checkout -b feature/add-todo`,要么加 `--allow-protected-branch` 显式绕过(沿 `src/cli/commands/preflight.ts`)。

**再 apply**(在 Claude Code 会话里发):

```
/forge:apply
```

无参数时走默认未归档 change。多 change 并存时报错让你 `--change-id` 显式指定。

### 期望发生(✅ 表示 forge 工作正常)

- ✅ AI invoke `forge:subagent-driven-development` + `forge:test-driven-development` skills
- ✅ AI 派 fresh 子代理(Task tool subagent_type=general-purpose)拿 [task + 相关 spec + design] 启动
- ✅ 子代理跑 red → green → refactor + git commit(每个子代理 1 commit)
- ✅ 主代理 review 子代理 commit + test 日志,通过 → 主工作区 `tasks.md` 把 `[ ]` 改 `[x]`
- ✅ 每个 task 完成,AI 调 `forge evidence record-tdd <changeId>` helper(写 staging 证据,**用户不需手敲**)
- ✅ 全部完成后 `tasks.md` 末尾追加 `applied_commits` YAML 块列每个 task 对应 commit hash

> ❌ 如果子代理 commit 后主代理 review 失败 → 不要手动改 tasks.md;让 AI 派 fix 子代理 + 重 review

### 嵌入 deep-dive 1

> 💡 **深入:开干前 `forge preflight branch-check`**
>
> v1.1 加的小工具,防止你在 main/master 分支误改代码:
>
> ```bash
> forge preflight branch-check                       # 默认检查
> forge preflight branch-check --allow-protected-branch  # 显式绕过保护
> ```
>
> 退出码:
> - 0 = 当前分支非 main/master,安全
> - 2 = 在保护分支 + 未加 `--allow-protected-branch`(沿 `src/cli/commands/preflight.ts`)

### 嵌入 deep-dive 2

> 💡 **深入:Apply 中段子代理遇到 issue,AI 进 Fluid Pause**
>
> 子代理可能在跑到一半时报告:
>
> - "plan itself is wrong"(plan 本身错了)
> - 或发现 spec 未覆盖但属于本 change 的需求(`DESIGN_ISSUE_FOUND`)
>
> 主代理**不直接处理**,而是 invoke `AskUserQuestion` 弹四选项给你:
>
> | 选项 | 行为 | 必填字段 |
> |---|---|---|
> | **1 = 扩本 change scope** | 更新 `proposal.md` `## What Changes` + subagent 重派 | 无 |
> | **2 = 加 task 进本轮** | 主代理 append 新 task 到 `tasks.md` + subagent 重派 | 无 |
> | **3 = 转 out-of-scope** | subagent 跳过 issue 继续 | `non_blocking_rationale`(为啥不在本轮做) |
> | **4 = Other** | 自由文本 | `other_rationale` + `other_acked_by` |
>
> 后续:**AI 会记录该 pause decision**(内部 marker 写入时机存在已知 forge doc bug,**用户不操作 marker**)。
>
> 注:**CRITICAL 级问题(测试 fail / hash mismatch / evidence 丢)不会触发 Fluid Pause**,走 forge 强 fence 拒签(沿 `skills/receiving-code-review/SKILL.md:230`)。

### 确认

```bash
ls forge/changes/add-todo/.evidence/  # 期望:process-evidence.staging.yaml(AI 自动调 record-tdd 产)
grep "\[x\]" forge/changes/add-todo/tasks.md | wc -l  # 期望:跟 tasks.md 总 task 数一致
tail -10 forge/changes/add-todo/tasks.md  # 期望:末尾有 applied_commits YAML
```

### 深读

- [`skills/subagent-driven-development/SKILL.md`](../skills/subagent-driven-development/SKILL.md) — SDD 完整协议
- [`skills/test-driven-development/SKILL.md`](../skills/test-driven-development/SKILL.md) — TDD red/green/refactor
- [`commands/apply.md`](../commands/apply.md) — `/forge:apply` 完整流程 + Fluid Pause 触发条件

## 第 4 步 — Review

### 你要做的

派 review 子代理审 4 件套 + git diff,主代理对每条 finding 判 accept/reject,通过后写 `.review-passed` marker。

### 准确操作

在 Claude Code 会话里发:

```
/forge:review
```

### 期望发生(✅ 表示 forge 工作正常)

- ✅ AI invoke `forge:requesting-code-review` + `forge:receiving-code-review` skills
- ✅ AI 派 fresh review 子代理审 [proposal + specs + design + git diff]
- ✅ 主代理对子代理产的每条 finding **逐条判 accept / reject**(accept = 用证据反驳 + 实施 / reject = 用证据反驳但不实施)
- ✅ AI 调 `forge evidence record-review` helper(写 staging,**用户不需手敲**)
- ✅ 接受意见 append 到 `tasks.md` 末尾作新 task(本轮**不算通过**,需下一轮 review)
- ✅ 三条件全满足时写 `forge/changes/<id>/.review-passed`:
  1. 无悬挂"已用证据反驳但未存档"的拒绝意见
  2. 接受意见已全部实现 + 测试通过
  3. 本轮无新增 task

> ❌ 如果 finding 你既不 accept 也不 reject → review 拒签,marker 不写

### 嵌入 deep-dive

> 💡 **深入:Review 报 finding,走哪一级处理**
>
> forge 把 review finding 分三级,**只有 WARNING 可走 ack 流程**(沿 `skills/receiving-code-review/SKILL.md:230 + 263`):
>
> | Severity | 判定来源 | 你的动作 |
> |---|---|---|
> | **CRITICAL** | 工具客观判定(测试 fail / hash mismatch / evidence 缺失) | **必修**。修代码 → 重跑 verify。**不能 ack 降级**(forge 协议硬约束) |
> | **WARNING** | AI 主判(事实可能有问题但需人类裁决) | 优先 fix;若有合理理由不 fix(scope 太大 / 决策被推翻)→ 走 **ack 两步协议**(见下) |
> | **SUGGESTION** | AI 主判,无需 ack | 顺手 fix 或留 backlog,archive 不阻塞 |
>
> **ack 两步协议(只对 WARNING)**:
>
> ```bash
> # 第一步:AI 调 propose(用户不直接敲)
> forge ack propose --action ack-warning --finding-id <id> --rationale "<为啥可以不修>"
> # → 写 forge/changes/<id>/.ack-log.jsonl 一条 status=proposed
> ```
>
> 然后在 Claude Code 会话里:
>
> ```
> /forge:ack-confirm
> ```
>
> - AI 列出待 confirm 的 propose 项
> - 你回答 `accept` / `reject`
> - accept → `.ack-log.jsonl` append `status=confirmed` + `acked_by` + `ack_at`
> - reject → `.ack-log.jsonl` append `status=rejected`,你回头修代码

### 确认

```bash
cat forge/changes/<id>/.review-passed   # 期望:schema_version / log_hash / reviewed_at / findings_acked
cat forge/changes/<id>/.ack-log.jsonl   # 若有 WARNING:每行 1 个 ack 事件(proposed / confirmed / rejected)
```

### 深读

- [`skills/receiving-code-review/SKILL.md`](../skills/receiving-code-review/SKILL.md) §三级 severity 段
- [`commands/review.md`](../commands/review.md) + [`commands/ack-confirm.md`](../commands/ack-confirm.md)
- [`src/cli/commands/ack.ts`](../src/cli/commands/ack.ts) — `forge ack` 三子命令实现

## 第 5 步 — Verify 三维

### 你要做的

跑 syntax / semantic / process 三维度验证 + 凝固 evidence 到 marker。

### 准确操作

**先确保 `forge/config.yaml` 含**(没有就建):

```yaml
test:
  test_command: pnpm test    # 用 test.test_command 字段(代码事实)
```

> ⚠️ **不要写 `context.test_command`** — 这是 `commands/verify.md:42` 的 stale doc bug;真实 schema 在 `test.` 下(`src/core/schema/types.ts:83` + `src/core/archive/fence.ts:146`)。

**在 Claude Code 会话里发**:

```
/forge:verify
```

### 期望发生(✅ 表示 forge 工作正常)

- ✅ AI invoke `forge:verification-before-completion` skill(证据先于声称)
- ✅ AI 跑 `forge validate <change-id>`(CRITICAL automated finding 工具产)
- ✅ AI 跑用户测试套(读 `test.test_command`,缺省 `pnpm test`,stdout 写 `.evidence/test-output.log`)
- ✅ AI invoke `forge:verifying-three-dimensions` skill 产**三维 findings**(见下嵌入)
- ✅ AI 写 `forge/changes/<id>/.verify-passed` 含 evidence log_hash + verify_findings YAML 字段
- ✅ AI 调 `forge evidence record-verify` helper 记录测试/验证证据到 staging(权威 `commands/apply.md:179-182`,verify.md 未引用是 doc bug)
- ✅ AI 调 `forge evidence freeze <id> --kind verify` 把 staging 凝固到 marker.process_evidence

> ❌ 如果 freeze 报 "staging file not found ... 必须先调 forge evidence record-*" → AI 漏调 record-verify,提示 AI invoke 该 helper 再 freeze(代码事实 `src/cli/commands/evidence.ts:639`)

### 嵌入 deep-dive

> 💡 **深入:Verify 三维(Completeness / Correctness / Coherence)**
>
> verify 不只是跑测试 — `forge:verifying-three-dimensions` skill 从三个独立维度扫:
>
> | 维度 | 检查什么 | finding 严重度 |
> |---|---|---|
> | **Completeness** | 每个 spec Requirement 必有实施证据(grep codebase 找)| CRITICAL `coverage_gap`(automated=true) |
> | **Correctness** | 每个 spec Requirement 定位 `file:line`,WHEN/THEN scenario 覆盖 | WARNING / SUGGESTION(automated=false) |
> | **Coherence** | `design.md ## Decision:` 段与 codebase 比对,命名 / pattern 跟项目惯例对齐 | WARNING / SUGGESTION(automated=false) |
>
> 三维 findings 处理同 §4 Review:
> - **CRITICAL**(automated=true)→ 必修,不能 ack 降级
> - **WARNING / SUGGESTION** → 走 §4 ack 两步协议

### 确认

```bash
cat forge/changes/<id>/.verify-passed | head -30   # 期望:schema + log_hash + verify_findings 数组
ls forge/changes/<id>/.evidence/                    # 期望:test-output.log + process-evidence.staging.yaml
cat forge/changes/<id>/.verify-passed | grep process_evidence  # 期望:freeze 后凝固字段
```

### 深读

- [`skills/verifying-three-dimensions/SKILL.md`](../skills/verifying-three-dimensions/SKILL.md) — 三维 finding 协议
- [`skills/process-evidence/SKILL.md`](../skills/process-evidence/SKILL.md) — 14 不变量 + worktree 重跑
- [`commands/verify.md`](../commands/verify.md) — `/forge:verify` 完整流程
- [`docs/specs/2026-05-10-v1.0-fusion-completion-design.md`](specs/2026-05-10-v1.0-fusion-completion-design.md) — v1.0 verify 三维设计

## 第 6 步 — Archive 三级 fence

### 你要做的

严格校验所有 marker + git integrity,通过后归档 change 到 `forge/changes/archive/`,同步 spec deltas 到 `forge/specs/`。

### 准确操作

在 Claude Code 会话里发:

```
/forge:archive
```

### 期望发生(✅ 表示 forge 工作正常)

- ✅ AI 校验 `.verify-passed` + `.review-passed` marker schema + log_hash + git integrity
- ✅ AI 跑**三级 fence**(沿 `src/core/archive/three-level-fence.ts`):
  - **CRITICAL 硬墙**:有未解 CRITICAL → exit + 提示修代码重跑 verify(不能 archive)
  - **WARNING ack**:有 WARNING + 未 confirm → 提示用户走 `/forge:ack-confirm`(沿 §4)
  - **SUGGESTION soft**:不阻塞,聚合到 `archive_summary.yaml` 的 `handoff_to_backlog`
- ✅ 通过后 AI **Move** `forge/changes/<id>/` → `forge/changes/archive/<date>-<id>/`
- ✅ AI **Sync** specs deltas 到 `forge/specs/<area>.md`
- ✅ AI 写 `forge/changes/archive/<date>-<id>/archive_summary.yaml`(含 9 业务字段 + `handoff_to_backlog` 三类聚合)
- ✅ AI invoke `forge:finishing-a-development-branch` skill 提示 git 后续(merge / PR / cleanup 决策)

> ❌ 如果 archive 报 "marker hash mismatch" → marker 跟当前 tasks.md / specs/ 不符,见 §出问题 第 2 条
> ❌ **`forge backlog list` 在 v1.1 不存在**(`commands/archive.md:86` 是 forward-looking 提示)— 只能 `cat archive_summary.yaml` 看 backlog,沿 spec §9.0

### 确认

```bash
ls forge/changes/archive/                           # 期望:<date>-<id> 目录
ls forge/specs/                                     # 期望:本 change 留下的 spec 文件
cat forge/changes/archive/<date>-<id>/archive_summary.yaml | head -30
# 期望:schema=forge-archive-summary/v1 + handoff_to_backlog 三类(critical/warning/suggestion)
```

### 深读

- [`skills/finishing-a-development-branch/SKILL.md`](../skills/finishing-a-development-branch/SKILL.md)
- [`commands/archive.md`](../commands/archive.md) — `/forge:archive` 完整流程
- [`docs/specs/2026-05-10-v1.0-fusion-completion-design.md`](specs/2026-05-10-v1.0-fusion-completion-design.md) §archive-三级-fence + §handoff-to-backlog — v1.0 协议设计

## 出问题怎么办

### 1. bootstrap 没生效(AI 直接写代码,没走 brainstorm)

**症状**:你发"我想做 X",AI 直接打开 editor 写 `.ts` 代码,没问澄清问题、没写 `forge/drafts/`。

**排查**:

```bash
ls .claude/skills/         # 期望 16 个 forge-* 目录(plugin install 后)
ls .claude/commands/forge/ # 期望 9 个 .md
```

若 0 个:
- 重启 Claude Code 会话(SessionStart hook 必须重 fire 一次)
- `/plugins` 看 forge 是否 enabled
- 极端情况:`/plugin install forge@accelerator-mzq-forge --force` 重装

### 2. `/forge:archive` 被拒(marker 已过期 / hash mismatch)

**症状**:`forge archive` 报 `marker hash mismatch / git integrity failed`。

**原因**:你或 AI 在 verify / review 之后改了 `tasks.md` 或 `specs/`,marker 锁的 content_hash 跟当前不符。

**修法**:重跑 `/forge:verify` + `/forge:review`(顺序不变),让 marker 重新对齐 → 再 archive。

### 3. `/forge:verify` 三维报 CRITICAL automated finding

**症状**:`forge validate` exit 1,`.verify-failed` YAML 列 `automated=true` CRITICAL。

**修法**:**修代码**(测试 fail → fix code → 测试 pass / coverage_gap → 实施 spec 未覆盖部分)→ 重跑 verify。**不能** `forge ack propose` 降级(CRITICAL 不可 ack,沿 §4 Review 表)。

### 4. `forge evidence freeze` 报 staging not found

**症状**:freeze exit 1 + "staging file not found ... 必须先调 `forge evidence record-tdd/verify/review`"。

**原因**:freeze 必须前置 `record-*` helper 写 staging(`.evidence/process-evidence.staging.yaml`)。

**修法**:**AI 应当自动调** record-* helper(沿 `commands/apply.md:179-182`)。若 AI 没调,提示 AI invoke 对应 helper(record-tdd 在 apply 完成时、record-verify 在 verify 后、record-review 在 review 后)。

完整错误退出码清单见 [`docs/cli-reference.md`](cli-reference.md)(总览页;v1.1 新 CLI 段待下轮补)。

## 与 superpowers plugin 共存

forge 的 16 个 skill 是从 [superpowers](https://github.com/obra/superpowers) MIT 移植 + 命名空间改名(`superpowers:` → `forge:`,见 [`LICENSE-THIRD-PARTY.md`](../LICENSE-THIRD-PARTY.md))。

**装了 superpowers plugin 的 Claude Code 会话同时跑 forge 项目时**,会看到两组同主题 skill 共存:

| 维度 | 冲突? |
|---|---|
| 安装路径(项目级 `.claude/` vs 用户级 `~/.claude/plugins/`) | ❌ 不冲突 |
| skill 名(`forge:brainstorming` vs `superpowers:brainstorming`) | ❌ 命名空间隔离 |
| slash 命令(forge 9 个 `/forge:*` vs superpowers 不带命令) | ❌ 不冲突 |

**但行为可能重叠**:你说"我想做个 todo list 应用"时,Claude 看到两个 brainstorming skill 都"1% 可能匹配",可能优先 invoke `superpowers:brainstorming`(plugin auto-load 抢先注册)→ 走完引导但**不写 `forge/drafts/<date>-<topic>.md`** → 下一步 `/forge:propose --from-draft <name>` 找不到 draft。

### 两种解决方案

**A. 显式用 `/forge:*` slash 命令触发(推荐)**

`/forge:brainstorm` 等命令直接调 `forge:*` skill,优先级高于 skill auto-trigger,绕过 superpowers 抢跑:

```
# 在 Claude Code 会话里:
/forge:brainstorm
# AI 在 forge:brainstorming 引导下提问 + 写 forge/drafts/<date>-<topic>.md
```

**B. 跑 forge 项目时通过 `/plugins` 暂时关掉 superpowers**

forge 16 个 skill 跟 superpowers 几乎相同(同源 MIT 移植),关 superpowers 不会损失能力。

## 接下来

- [`docs/cli-reference.md`](cli-reference.md) — 13 个 CLI 子命令完整参数 + 退出码(v1.1 新 6 CLI 段下轮补)
- [`docs/installation.md`](installation.md) — 三 harness 安装总览
- [`docs/claude-install.md`](claude-install.md) — Claude Code 专题安装
- **Legacy 形态文档**(v0.2-v0.4 时期,**新用户不需要看**):
  - [`docs/harness-setup.md`](harness-setup.md) — legacy v0.2-v0.4 形态
  - [`docs/opencode-install.md`](opencode-install.md) — legacy v0.2-v0.4 形态
  - [`docs/codex-install.md`](codex-install.md) — legacy v0.2-v0.4 形态
- 协议设计深读:[`docs/specs/2026-05-10-v1.0-fusion-completion-design.md`](specs/2026-05-10-v1.0-fusion-completion-design.md) — v1.0 fusion completion 21 决策
- Brownfield 项目接入:[`docs/legacy-bridge.md`](legacy-bridge.md)
- 升级:v0.3 / v0.2 项目 → v1.1 见 `docs/migration/v0.3-to-v1.1.md`(下一轮单独文档)
