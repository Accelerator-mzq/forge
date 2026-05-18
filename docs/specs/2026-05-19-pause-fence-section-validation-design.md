# pause-fence 段级校验 design(release-blocker attack-path 闭环)

- **日期**:2026-05-19
- **状态**:design,待 writing-plans
- **关联**:design `2026-05-10-v1.0-fusion-completion-design.md` §2.1.5;plan-9c §7.5;plan-9c `release-blocker-attack-path.test.ts`
- **brainstorm 来源**:session 704adeea(2026-05-18~19)+ 本会话深入核查

## 1. 背景与目标

forge 的 `pnpm test:gate:release`(strict 模式,要求 0 个 `it.todo`)长期 FAIL —— `tests/integration/release-blocker-attack-path.test.ts` 含 **6 个 `it.todo`** 占位(v1.0~v2.0 均带此挂账发布;`ci.yml` 只跑 soft gate,strict gate 无 CI 调用)。

本特性把这 6 个 todo 全部 unskip 成真实通过的 attack-path 测试,使 `test:gate:release` 完全 PASS,并在 release CI 接入 `test:gate:release`。

### 1.1 6 个 todo 分类(已核查 HEAD `bc1b91d`)

| # | 类型 | 内容 |
| - | ---- | ---- |
| 1 | NEEDS-FEATURE | option=1 attack:marker 写 `target_artifact=proposal.md`/`target_anchor=## What Changes`,实际 git diff 只改 tasks.md → fence 应拒签 |
| 2 | NEEDS-FEATURE | option=2 attack:marker 写 `task_ref` 指已勾选 task,但该 task 在 `paused_at` 之前已存在(非新增)→ fence 应拒签 |
| 3/4/5 | TEST-ONLY | `transaction.ts` 的 rename / Backup / Sync 失败注入回滚 |
| 6 | TEST-ONLY | `version-retrograde-fence.ts` git log 失败 fail-closed |

**TEST-ONLY 行为已实现**(本会话核查确认):
- `transaction.ts`:阶段 1.5 rename 失败抛 `--resume-summary` 提示;阶段 1.6 Backup 失败反向 rename + unlink summary;阶段 2 Sync 失败 specs 回滚 + 反向 rename。三处回滚齐全。
- `version-retrograde-fence.ts:73-81`:`rev-parse` 确认是 git repo 后 `git log` 失败 → fail-closed 拒签。

## 2. 现状与威胁模型

### 2.1 fence 现状

`validatePauseDecisionsFence(marker, changeDir, file?)`(`src/core/archive/pause-decisions-fence.ts`)做 5 类校验。其中:

- **option=1**(`:86-105`):仅校验 marker 字段字面 —— `target_artifact==='proposal.md'` + `target_anchor` 含 `'What Changes'`。`:84` 有 `TODO(9e1)` 注释,未做 git diff 内容校验。
- **option=2**(`checkOption2TaskChecked`):仅校验 `task_ref` 末段对应的 task 行存在且 `[x]`,未做"新增"语义校验。

archive 在 `archive.ts:452`(verify-passed)/`:463`(review-passed)各调一次 fence,已传 `changeDir`,**未传 repoRoot**。

### 2.2 apply 提交模型(关键事实)

- apply 期 subagent 逐 task 做 red/green commit(代码);**主代理对 `tasks.md`/`proposal.md` 的改动(勾选框、Fluid Pause 加 task、option=1 改 What Changes)全程不 commit,留工作树**。
- review marker `git.head` = 最后 task commit;`git.diff_hash` = `git diff HEAD` = 未提交残留。pause 那刻无任何 git 锚点。
- **forge 没有 propose 阶段 marker** —— marker 只有 4 种(Verify / Review + 两个 failed)。apply 开始前的 `tasks.md` 没有任何固化点。

### 2.3 option=2 的根本约束(capture-input gap)

要校验"task 是 pause 真新增的",需要一个 pause 时刻的 `tasks.md` 可信快照。但:

- `tasks.md` 全程不 commit,git history 里没有它的任何历史;
- 即便引入 forge CLI 在 pause 时捕获,**capture 的输入(`tasks.md`)本身由 AI 喂**。AI 可"删掉目标旧 task → capture → 恢复旧 task",hash-chain 只能防*事后*篡改,防不了*捕获时*喂假输入。

**结论**:option=2 在当前 forge 架构下无法密码学证明"新增"。本特性采用**轻量 capture 方案**(见 §5),目标是把反向加固落到 option=2 上 —— 挡住*事后篡改链* + *无凭据凭空声称*;capture-input gap 作为已知 gap 显式声明(§8)。

## 3. 总体方案

三个工作块,**一个 plan + Phase 化**执行:

- **Phase 1** = Block A(4 TEST-ONLY)+ Block B(option=1 diff 段级校验)—— 风险低、自包含,快速闭合 5/6 个 todo。
- **Phase 2** = Block C(option=2 轻量 capture)—— 新 CLI 子命令 + schema + 协议改动。

Block C 复用 Block B 给 fence 加的 `repoRoot` 参数,故同 plan 更顺。

## 4. Block A — 4 个 TEST-ONLY(纯测试)

行为已实现,只补测试 + mock,无生产代码改动。

- **todo 3/4/5**:`transaction.ts` rename / Backup / Sync 失败注入回滚 —— 参考 `tests/core/archive/transaction.test.ts` 的 P2.2 + case 3 注入模式。
- **todo 6**:`version-retrograde-fence.ts` git log 失败 fail-closed —— `vi.mock('node:child_process')` 让 `rev-parse` 成功(确认是 git repo)但 `git log` 抛错,断言 fence 拒签。

unskip 后这 4 个 todo 改为真实 `it()`。

## 5. Block B — option=1 diff 段级校验

### 5.1 unified-diff hunk parser(新模块)

新增 `src/core/parse/unified-diff.ts`(命名 writing-plans 定):解析 `git diff` 文本输出,产出 hunk 列表。每个 hunk 含 `@@ -a,b +c,d @@` 头,以及该 hunk 内带 `+`(新增)/`-`(删除)前缀的行。提供"判断某行号是否落在某文件的某个 hunk 新增侧"的能力。

### 5.2 fence 签名变更

`validatePauseDecisionsFence` 加 `repoRoot` 参数(沿 `version-retrograde-fence` 的 `gitDir` 先例)。`archive.ts` 已具备 repoRoot(`:555` 的 `validateReviewGitIntegrity` 在用),两处调用传入即可。

### 5.3 option=1 校验逻辑

option=1 分支在现有字段校验之外:

1. 跑 `git diff HEAD -- <changeDir>/proposal.md`,用 hunk parser 解析。
2. 用 `parseMarkdown` 解析当前 `proposal.md`,取 `## What Changes` 段的行号区间 `[start, end]`。
3. 校验:diff 中至少有一个**新增行(`+`)**的新文件行号落在 `## What Changes` 段区间内。
4. fail 模式:
   - 非 git 项目 → diff 校验 N/A,降级到现有字段校验(沿已定 fail 模式)。
   - git 项目内 `git diff` 失败 → fail-closed 拒签(沿 `version-retrograde-fence` 先例)。

无 schema / 协议改动。

## 6. Block C — option=2 轻量 capture

### 6.1 新增 `forge pause-capture` CLI 子命令

命名建议 `forge pause-capture`(单 action,kebab;`forge evidence record-tdd` 是多 action 子命令组的先例,pause 暂只一个 action 故用单级),writing-plans 可调整。

- 签名:`forge pause-capture <changeId> --task <triggering-task-ref> --issue <summary>`
- 行为:读 `forge/changes/<changeId>/tasks.md` → `parseTasks` 解析所有 task id → 写一条 `kind='pause-capture'` entry 进 `.evidence/ack-log.jsonl`(复用 `appendAckLog`,自动接 `prev_entry_hash` 链)。
- 输出:capture 的 ISO 8601 timestamp(主代理写进 `pause_decision.paused_at`)。

### 6.2 capture entry 的链保护(关键:免费复用)

`verifyAckLogChain` 三重校验(链内自洽 + 行数固化 + 尾 hash 固化)由 `process-evidence-fence.ts` 子检 9.3 执行,依赖 `marker.ack_log_tail_hash`/`ack_log_entry_count` —— 这两个字段在 verify 阶段 `forge evidence freeze` 时固化。

Fluid Pause 在 apply 阶段(freeze **之前**)发生,故 capture entry 写入 ack-log 后会被 freeze 的 tail/count 一并固化,archive 时自动受链校验保护。`process-evidence-fence.ts:419-425` 已有的"伪造 ack entry"防线注释正是同一套机制。

**但** option=2 fence 不能假设 process-evidence-fence 一定执行(老 marker 无 process_evidence 时它可能整段跳过)。故 **option=2 fence 自己独立调 `verifyAckLogChain` 做链内自洽校验**,不依赖 process-evidence-fence。

### 6.3 schema 扩展(均 superset additive)

**`AckLogEntry` 判别联合加 `PauseCaptureEntry`**(`src/core/ack-log.ts`):

```ts
export interface PauseCaptureEntry {
  schema: 'forge-ack-log/v1';
  kind: 'pause-capture';
  timestamp: string; // ISO 8601 UTC,= 后续 pause_decision.paused_at
  change_id: string;
  task_ref: string; // 触发 pause 的 task(subagent 报 issue 所在)
  pause_issue_summary: string;
  tasks_md_task_ids: string[]; // capture 时刻 tasks.md 全部 task id(parseTasks 解析)
  git_head: string | null;
  prev_entry_hash?: string | null;
  extra: Record<string, unknown>;
}
```

顺手同步 `ack-log-consistency.ts:14-26` 那份过时的本地 `AckLogEntry`(只有 `'ack' | 'evidence-helper'` 两个 kind,是现存技术债)。

**`PauseDecision` 加 `added_task_ref: string | null`**(`src/core/markers/types.ts`):明确"pause 新增的 task",与 `task_ref`(触发 pause 的 task)分开。现状是 `checkOption2TaskChecked` 把 `task_ref` 当新增 task 用,**与类型注释「task_ref = 触发 pause 的 task」矛盾**,本特性顺势厘清。option=2 必填 `added_task_ref`,其他选项填 `null`。option=2 的 `target_anchor` 降为人类可读记录,fence 不再据它校验。

### 6.4 改 `checkOption2TaskChecked`

1. target task 从 `task_ref` 改为 `added_task_ref`。
2. 读 `.evidence/ack-log.jsonl`(`readAllAckLogEntries`),独立调 `verifyAckLogChain` 做链内自洽校验;链坏 → 拒签。
3. 用 `(change_id, timestamp===paused_at, task_ref)` 三元组定位本 pause 的 `pause-capture` entry;找不到 → fail-closed 拒签。
4. 校验:`added_task_ref` 末段 ∉ capture entry 的 `tasks_md_task_ids`(pause 时不存在)。
5. 校验:`added_task_ref` 末段 ∈ 当前 `tasks.md` 且已勾选 `[x]`。
6. **统一用 `parseTasks`**(`TASK_RE` = `^\s*- \[([ x])\]\s+([\w-]+)\s*:\s*(.+)$`,即 `- [x] task-id: desc` 格式)作为 canonical 解析器,替换现有 bold/bare 双正则 —— 现有 fence 假设 `- [x] **task-2**`,与 `parseTasks` 的 `task-id: desc` 格式不一致,是现存隐患。

### 6.5 改 `commands/apply.md`

- Fluid Pause 段:pause 触发时,主代理**先调 `forge pause-capture`**(任一 chosen_option 都做,capture 记录 pause 时刻状态),再走 AskUserQuestion。
- Marker 持久化段:option=2 schema 加 `added_task_ref` 字段说明。
- 改 `commands/apply.md` 后必须 `pnpm build`(双源 md5 sync,CLAUDE.md 约束 1)。

## 7. Schema 变更汇总

| 文件 | 变更 | 兼容性 |
| ---- | ---- | ------ |
| `src/core/ack-log.ts` | `AckLogEntry` 加 `PauseCaptureEntry` 成员 | superset additive |
| `src/core/archive/ack-log-consistency.ts` | 同步本地过时 `AckLogEntry` 定义 | 内部一致性修复 |
| `src/core/markers/types.ts` | `PauseDecision` 加 `added_task_ref?: string \| null` | superset additive |
| `src/core/validate/marker-schema.ts` | marker schema 校验同步 `added_task_ref` | 老 marker 缺 → 通过 |

## 8. 边界与兼容

### 8.1 老 marker 缺 `added_task_ref`

按 `marker.created_by_tool_version` 版本判定(沿 `version-retrograde-fence` 模式):

- `created_by_tool_version` < 本特性引入版本 → **降级走旧行为**(只校验 `task_ref` 末段对应 task 已勾选,不要求 capture)。
- ≥ 本特性引入版本 → 必须有 `added_task_ref` + 匹配的 `pause-capture` entry,否则拒签。
- `created_by_tool_version` 缺失(更老 marker)→ 视为 < 引入版本,降级。

### 8.2 非 git 项目

- option=1:diff 校验 N/A → 降级字段校验。
- option=2:capture / ack-log 链不依赖 git,正常执行;`git_head` 字段允许 `null`。

### 8.3 capture entry 在 freeze 之后写入(罕见边界)

design `2026-05-10` line 375 提到"verify 阶段也可触发 pause"。若 pause 发生在 `forge evidence freeze` 之后,capture entry 不被 `ack_log_tail_hash`/`entry_count` 固化 —— 但 option=2 fence 自己调的链内自洽校验(§6.2)仍覆盖它。tail/count 固化失效仅意味着"freeze 后 append/重写整链"防御对这些 entry 弱化,链内自洽防御不受影响。作为已知边界声明,不阻塞本特性。

## 9. 已知 gap 声明(capture-input gap)

option=2 轻量 capture **不能**密码学证明"task 是 pause 真新增的"。攻击者(AI 主代理控制文件系统)可执行:

```
删掉目标旧 task → forge pause-capture(快照不含该 task)→ 恢复目标旧 task
```

使 fence 误判"该 task 是 pause 后新增"。本特性的 hash-chain 仅保证:capture 事件发生过、顺序固定、内容不可*事后*篡改、无 capture entry 则无法凭空声称 option=2。capture *当下*喂入的 `tasks.md` 是否诚实,无技术手段验证。

此 gap 须在 `pause-decisions-fence.ts` 代码注释 + 本 design §9 + `apply.md` 显式声明。这是经 brainstorm 确认的取舍(完整独立 hash-chain 方案同样关不掉此 gap,故不为它多付成本)。

## 10. 测试策略

- **Block A**:4 个 TEST-ONLY todo unskip 为真 `it()`,注入失败断言回滚 / fail-closed。
- **Block B**:option=1 attack todo unskip —— fixture:marker 声称改 proposal `## What Changes` 但实际 diff 只动 tasks.md → 断言 fence 拒签;另加 happy path(确有 What Changes 段变更)断言通过。
- **Block C**:option=2 attack todo unskip —— fixture:marker `added_task_ref` 指向的 task 出现在 capture entry 的 `tasks_md_task_ids` 里(非新增)→ 断言拒签;happy path:`added_task_ref` ∉ capture 快照、∈ 当前 tasks.md 且勾选 → 通过;链坏 / capture entry 缺失 → 拒签。
- **release gate**:全 6 todo unskip 后 `pnpm test:gate:release` actual=0 → PASS;release CI 接入 `test:gate:release`。
- 推 commit 前本地跑全 5 步(lint → format:check → typecheck → build → test),沿 CLAUDE.md。

## 11. 实施清单(文件级,writing-plans 细化)

**Phase 1(Block A + B):**
- `tests/integration/release-blocker-attack-path.test.ts` —— unskip todo 1/3/4/5/6
- `src/core/parse/unified-diff.ts`(新)+ 单测
- `src/core/archive/pause-decisions-fence.ts` —— fence 加 `repoRoot` 参数 + option=1 diff 校验
- `src/cli/commands/archive.ts` —— 两处 fence 调用传 `repoRoot`
- release CI 配置 —— 接入 `pnpm test:gate:release`

**Phase 2(Block C):**
- `src/cli/commands/` —— 新增 `pause-capture` 子命令 + CLI 注册
- `src/core/ack-log.ts` —— `PauseCaptureEntry`
- `src/core/archive/ack-log-consistency.ts` —— 同步本地 `AckLogEntry`
- `src/core/markers/types.ts` + `src/core/validate/marker-schema.ts` —— `added_task_ref`
- `src/core/archive/pause-decisions-fence.ts` —— 重写 `checkOption2TaskChecked`
- `commands/apply.md` —— Fluid Pause 协议 + `pnpm build`
- `tests/integration/release-blocker-attack-path.test.ts` —— unskip todo 2
- 各模块单测 + `docs/cli-reference.md` 补 `pause-capture`

## 12. 非目标(out of scope)

- 不改 option=3 / option=4 fence(v5/v6 已闭环)。
- 不追求 option=2 的密码学强度证明(§9 gap 接受)。
- 不引入独立于 ack-log 的新 hash-chain。
