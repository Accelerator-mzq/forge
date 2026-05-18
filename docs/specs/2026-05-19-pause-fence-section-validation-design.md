# pause-fence 段级校验 design(release-blocker attack-path 闭环)

- **日期**:2026-05-19
- **状态**:design,待 writing-plans(已过 Codex 对抗性 review round 1)
- **关联**:design `2026-05-10-v1.0-fusion-completion-design.md` §2.1.5;plan-9c §7.5;plan-9c `release-blocker-attack-path.test.ts`
- **brainstorm 来源**:session 704adeea(2026-05-18~19)+ 本会话深入核查

## 1. 背景与目标

forge 的 `pnpm test:gate:release`(strict 模式,要求 0 个 `it.todo`)长期 FAIL —— `tests/integration/release-blocker-attack-path.test.ts` 含 **6 个 `it.todo`** 占位(v1.0~v2.0 均带此挂账发布;`ci.yml` 只跑 soft gate,strict gate 无 CI 调用)。

本特性把这 6 个 todo 全部 unskip 成真实通过的 attack-path 测试,使 `test:gate:release` 完全 PASS,并在 release CI 接入 `test:gate:release`。

**option=2 的安全目标须如实界定**(见 §2.3 / §9):轻量 capture 方案**不**声称能证明"task 是 pause 真新增的";它能做到的是 —— 让 option=2 marker 必须携带一条进入 hash-chain 的 capture 凭据,挡住"完全无 capture 流程的 option=2"与"capture 凭据事后被篡改",并把 capture-input gap 显式声明为已知限制。

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

威胁模型:**AI 主代理是对手,控制整个 git repo + 文件系统 + 可跑任意 forge 命令**。要校验"task 是 pause 真新增的",需要一个 pause 之前的 `tasks.md` 可信快照。但:

- `tasks.md` 全程不 commit,git history 里没有它的任何历史;
- 引入 forge CLI 在 pause 时捕获,**capture 的输入(`tasks.md`)本身由 AI 喂**。AI 可"删掉目标旧 task → capture → 恢复旧 task";
- 一个 change 可有多次 pause(多条 capture entry),AI 可**预先攒**多条 capture,事后选择性认领一条不含目标 task 的。

hash-chain 只能防 capture 凭据*事后*被篡改,**防不了** capture *当下*喂假输入、也防不了选择性认领。

**结论**:option=2 在当前 forge 架构下无法密码学证明"新增"(完整独立 hash-chain 方案同样关不掉此 gap,故不为它多付成本)。本特性采用**轻量 capture 方案**(§6),安全收益与 gap 见 §9。

## 3. 总体方案

三个工作块,**一个 plan + Phase 化**执行:

- **Phase 1** = Block A(4 TEST-ONLY)+ Block B(option=1 diff 段级校验)—— 风险低、自包含,快速闭合 5/6 个 todo。
- **Phase 2** = Block C(option=2 轻量 capture)—— 新 CLI 子命令 + schema + 协议改动。

Block C 复用 Block B 给 fence 加的 `repoRoot` 参数,故同 plan 更顺。

## 4. Block A — 4 个 TEST-ONLY(纯测试)

行为已实现,只补测试 + mock,无生产代码改动。

- **todo 3/4/5**:`transaction.ts` rename / Backup / Sync 失败注入回滚 —— 参考 `tests/core/archive/transaction.test.ts` 的 P2.2 + case 3 注入模式。
- **todo 6**:`version-retrograde-fence.ts` git log 失败 fail-closed —— `vi.mock('node:child_process')` 让 `rev-parse` 成功(确认是 git repo)但 `git log` 抛错,断言 fence 拒签。

unskip 后这 4 个 todo 改为真 `it()`。

## 5. Block B — option=1 diff 段级校验

### 5.1 unified-diff hunk parser(新模块)

新增 `src/core/parse/unified-diff.ts`(命名 writing-plans 定):解析 `git diff` 文本输出,产出 hunk 列表。每个 hunk 含 `@@ -a,b +c,d @@` 头,以及该 hunk 内带 `+`(新增)/`-`(删除)前缀的行 + 其在**新文件**中的行号。

### 5.2 fence 签名变更

`validatePauseDecisionsFence` 加 `repoRoot` 参数(沿 `version-retrograde-fence` 的 `gitDir` 先例)。`archive.ts` 已具备 repoRoot(`:555` 的 `validateReviewGitIntegrity` 在用),两处调用传入即可。

### 5.3 option=1 校验逻辑(已修订:frontmatter 行号对齐)

option=1 分支在现有字段校验之外:

1. 跑 `git diff HEAD -- <changeDir>/proposal.md`,用 hunk parser 解析,得到所有新增行(`+`)的**新文件行号**。
2. 求 `## What Changes` 段在 **proposal.md 原始文件**中的行号区间 `[start, end)`。
   - **不能直接用 `parseMarkdown` 的 `section.startLine`** —— `parseMarkdown`(`markdown.ts:37-42`)用 gray-matter 剥离 frontmatter 后对 `body` 算行号,`startLine` 是 body 内 1-indexed,proposal.md 若有 frontmatter 会与 git diff 的原始文件行号产生偏移。
   - 方案:直接在 proposal.md 原始文本上扫 `^##\s` 标题定位 `## What Changes` 段区间;或用 `parseMarkdown` 行号 + 加回 frontmatter 占用的行数(`---` 块行数)。writing-plans 选其一,优先前者(更直接、无偏移风险)。
3. 校验:diff 中至少有一个新增行(`+`)的新文件行号落在 `## What Changes` 段区间内。
4. fail 模式:
   - 非 git 项目 → diff 校验 N/A,降级到现有字段校验(沿已定 fail 模式)。
   - git 项目内 `git diff` 失败 → fail-closed 拒签(沿 `version-retrograde-fence` 先例)。

无 schema / 协议改动。

## 6. Block C — option=2 轻量 capture

### 6.1 新增 `forge pause-capture` CLI 子命令

命名建议 `forge pause-capture`(单 action,kebab),writing-plans 可调整。

- 签名:`forge pause-capture <changeId> --task <triggering-task-ref> --issue <summary>`
- 行为:
  1. 生成不可重用的 `capture_id`(`crypto.randomUUID()`)。
  2. 读 `forge/changes/<changeId>/tasks.md` → `parseTasks` 解析所有 task id。
  3. 在 **`.evidence` 级共享锁内**(见下)写一条 `kind='pause-capture'` entry 进 `.evidence/ack-log.jsonl`(经 `appendAckLog` 自动接 `prev_entry_hash` 链)。
  4. stdout 输出 `capture_id` + capture 的 ISO 8601 timestamp。
- **并发锁(已修订)**:`appendAckLog`(`ack-log.ts:106-125`)是"读最后一行 → 算 hash → append",自身无锁。`forge evidence record-tdd` 靠把 `appendAckLog` 放进 staging lock 的 critical section 防链断 race(`evidence.ts:330-333` 注释 C5)。`pause-capture` 同样必须在共享锁内 append —— writing-plans 需抽出一个 ack-log 级 append 锁(或复用 `.evidence` 锁),不可裸调 `appendAckLog`。
- 主代理拿到 `capture_id` 后,写进对应 pause_decision 的 `capture_id` 字段。

### 6.2 capture entry 的链保护(已修订:前提条件明确)

`verifyAckLogChain`(`ack-log.ts:245-287`)做三重校验:
1. **链内自洽**:`prev_entry_hash` 逐行 match(无条件执行)。
2. **行数固化**:仅当 `markerEntryCount !== null` 时校验。
3. **尾 hash 固化**:仅当 `markerTailHash !== null` 时校验。

**关键约束**:**只做链内自洽校验,挡不住"重写整条 ack-log + 重算所有 `prev_entry_hash`"** —— 攻击者可构造一条全新且内部自洽的链。真正的事后篡改防护来自固化项 2/3,而它们依赖 `marker.ack_log_tail_hash` + `ack_log_entry_count`。这两个字段在 verify 阶段 `forge evidence freeze` 时固化(`evidence.ts:815-819`)。

因此 **option=2 强校验的前提条件 = marker 同时有 `ack_log_tail_hash` + `ack_log_entry_count`**:
- 两者齐全 → fence 把它们传入 `verifyAckLogChain`,三重校验全开,capture entry 受事后篡改保护。
- 缺任一 → 链保护不成立,**不得宣称有链保护**。处理见 §8.1:老版本 marker 走版本降级;新版本 marker 缺这两个字段属异常 → fail-closed 拒签(`writing-plans` 需先核实 forge 主流程是否所有 change 必产 `process_evidence` + freeze;若存在合法的"无 process_evidence"路径,则改为降级而非拒签)。

Fluid Pause 在 apply 阶段(`forge evidence freeze` 之前)发生,故正常路径下 capture entry 会被 freeze 的 tail/count 一并固化。边界(pause 发生在 freeze 之后)见 §8.3。

### 6.3 schema 扩展(均 superset additive)

**`AckLogEntry` 判别联合加 `PauseCaptureEntry`**(`src/core/ack-log.ts`):

```ts
export interface PauseCaptureEntry {
  schema: 'forge-ack-log/v1';
  kind: 'pause-capture';
  timestamp: string; // ISO 8601 UTC
  capture_id: string; // crypto.randomUUID(),不可重用,marker 据此精确匹配
  change_id: string;
  task_ref: string; // 触发 pause 的 task(subagent 报 issue 所在)
  pause_issue_summary: string;
  tasks_md_task_ids: string[]; // capture 时刻 tasks.md 全部 task id(parseTasks 解析)
  git_head: string | null;
  prev_entry_hash?: string | null;
  extra: Record<string, unknown>;
}
```

**`ack-log-consistency.ts` 类型去重(已修订)**:`ack-log-consistency.ts:14-26` 有一份本地重定义的 `AckLogEntry`(只含 `'ack' | 'evidence-helper'` 两个 kind,已漂移)。本特性**直接 `import { AckLogEntry } from '../ack-log.js'`,删除本地重复定义**,在用到 `kind==='ack'` 处用 type guard 过滤。不再维护两份 schema。

**`PauseDecision` 加两个 optional 字段(已修订:统一 optional)**(`src/core/markers/types.ts`):

```ts
added_task_ref?: string | null; // option=2 新增的 task(末段 tasks.md#task-N);厘清见下
capture_id?: string | null;     // option=2 关联的 pause-capture entry id
```

- 两者均为 **optional**(`?`),因为是 superset additive 新字段,老 marker 没有。**不可**沿用现有 `PauseDecision` nullable 字段(`severity_acked_by` 等)"字段必须存在、值可为 null"的约定 —— `marker-schema.ts:730-769` 对 nullable 字段用 `val !== null && ...` 校验,`undefined` 会 fail。`marker-schema.ts` 对 `added_task_ref` / `capture_id` 必须单独处理 `=== undefined` 的 legacy 分支(undefined → 跳过类型校验,留给 fence 按版本判定)。
- `added_task_ref` 厘清 `task_ref` 语义歧义:现状 `checkOption2TaskChecked` 把 `task_ref` 当"新增 task"用,与类型注释「`task_ref` = 触发 pause 的 task」矛盾。本特性引入 `added_task_ref` 专指"pause 新增的 task",`task_ref` 归位为"触发 pause 的 task"。option=2 的 `target_anchor` 降为人类可读记录,fence 不再据它校验。

### 6.4 改 `checkOption2TaskChecked`(已修订)

新版本 marker(`created_by_tool_version` ≥ 本特性引入版本)的 option=2 校验:

1. 前置:marker 有 `ack_log_tail_hash` + `ack_log_entry_count`(§6.2);缺 → 见 §8.1。
2. 读 `.evidence/ack-log.jsonl`(`readAllAckLogEntries`),调 `verifyAckLogChain(entries, marker.ack_log_tail_hash, marker.ack_log_entry_count)`;链校验失败 → 拒签。
3. 用 `pause_decision.capture_id` 在 ack-log 里精确定位 `kind==='pause-capture'` 且 `capture_id` 匹配的 entry;**找不到 / 找到多条 → fail-closed 拒签**。
4. 同一 marker 内,校验 `capture_id` 未被多个 pause_decision 复用(防一条 capture 被多次认领)。
5. 校验:`added_task_ref` 末段 ∉ capture entry 的 `tasks_md_task_ids`(pause 时不存在)。
6. 校验:`added_task_ref` 末段 ∈ 当前 `tasks.md` 且已勾选 `[x]`。
7. 解析器:用 `parseTasks`(`tasks.ts:32`,`TASK_RE` = `^\s*- \[([ x])\]\s+([\w-]+)\s*:\s*(.+)$`,即 `- [x] task-id: desc` 格式)作 canonical 解析器。**注意格式收窄**:`parseTasks` 只认 `task-id: desc`,现有 fence 的旧正则还认 `- [x] **task-2**` bold / bare key。见 §8.4。

### 6.5 改 `commands/apply.md`

- Fluid Pause 段:pause 触发时,主代理**先调 `forge pause-capture`**(任一 chosen_option 都做,capture 记录 pause 时刻状态),把返回的 `capture_id` 留作 marker 写入用,再走 AskUserQuestion。
- Marker 持久化段:option=2 schema 加 `added_task_ref` + `capture_id` 字段说明。
- 改 `commands/apply.md` 后必须 `pnpm build`(双源 md5 sync,CLAUDE.md 约束 1)。

## 7. Schema 变更汇总

| 文件 | 变更 | 兼容性 |
| ---- | ---- | ------ |
| `src/core/ack-log.ts` | `AckLogEntry` 加 `PauseCaptureEntry` 成员(含 `capture_id`) | superset additive |
| `src/core/archive/ack-log-consistency.ts` | 删本地 `AckLogEntry`,改 import + type guard | 内部一致性修复(#9) |
| `src/core/markers/types.ts` | `PauseDecision` 加 `added_task_ref?: string \| null` + `capture_id?: string \| null`(均 optional) | superset additive |
| `src/core/validate/marker-schema.ts` | 校验同步两个新字段,单独处理 `=== undefined` legacy 分支 | 老 marker 缺 → 不 fail,留 fence 判 |

## 8. 边界与兼容

### 8.1 老 marker 缺 `added_task_ref` / `capture_id`

按 `marker.created_by_tool_version` 版本判定(沿 `version-retrograde-fence` 模式):

- `created_by_tool_version` < 本特性引入版本(或字段缺失,视为更老)→ **降级走旧行为**:只校验 `task_ref` 末段对应 task 已勾选,不要求 capture / 不要求链保护。
- ≥ 本特性引入版本 → 必须有 `added_task_ref` + `capture_id` + 匹配的 `pause-capture` entry + marker 有 `ack_log_tail_hash`/`ack_log_entry_count`(§6.2);任一缺失 → fail-closed 拒签。

引入版本号在 release 时定(占位 `vNEXT`)。

### 8.2 非 git 项目

- option=1:diff 校验 N/A → 降级字段校验。
- option=2:capture / ack-log 链不依赖 git,正常执行;`git_head` 字段允许 `null`。

### 8.3 capture entry 在 freeze 之后写入(罕见边界)

design `2026-05-10` line 375 提到"verify 阶段也可触发 pause"。若 pause 发生在 `forge evidence freeze` 之后,capture entry 不被 `ack_log_tail_hash`/`entry_count` 固化 —— 链内自洽校验仍覆盖它,但事后篡改防护(行数/尾 hash 固化)对这些 entry 失效。

writing-plans 需明确:此场景下 option=2 强校验是否要求"capture 必须在 freeze 前"。倾向:freeze 后的 pause 视为异常并拒签(Fluid Pause 设计语义在 apply 阶段)。作为已知边界声明。

### 8.4 `parseTasks` 格式收窄(#8)

`parseTasks` 只认 `- [x] task-id: desc`。若实际 `tasks.md` 存在旧格式(`- [x] **task-2**` / bare key),统一到 `parseTasks` 会让旧格式 task 在新 fence 下不可见。

writing-plans 的 Path Pre-flight Verify 阶段**必须先核查实际 `tasks.md` 的真实 task 行格式**(看 `forge/changes/` 下样本 + `commands/apply.md` / propose 模板对 task 行的定义)。处理:
- 若实际格式就是 `task-id: desc` → 直接统一 `parseTasks`,旧 bold 正则是无效假设,删除。
- 若旧格式确实在用 → legacy marker(版本降级路径)保留旧匹配;新版本明确强制 `task-id: desc` 并在 propose/apply 协议加格式约束。

## 9. 已知 gap 声明(capture-input gap)

### 9.1 轻量 capture **能**挡的

- **option=2 无 capture 凭据**:marker 声称 option=2 但 ack-log 里无对应 `capture_id` 的 `pause-capture` entry → 拒签。
- **capture 凭据事后被篡改**:在 marker 有 `ack_log_tail_hash`/`ack_log_entry_count` 固化的前提下(§6.2),改动 capture entry 内容会破坏链 → 拒签。
- **凭据重放 / 复用**:`capture_id` 不可重用,且 fence 校验同一 marker 内不被多 pause_decision 复用 → 挡住"三元组重放"与"一条 capture 被多次认领"。

### 9.2 轻量 capture **挡不住**的(capture-input gap)

攻击者(AI 主代理控制文件系统 + 可跑任意 forge 命令)仍可:

```
删掉目标旧 task → forge pause-capture(快照不含该 task)→ 恢复目标旧 task
```

或**预先攒**多条 capture entry,事后挑一条 `tasks_md_task_ids` 不含目标 task 的,把其 `capture_id` 填进谎称 option=2 的 pause_decision。

根因:capture *当下*喂入的 `tasks.md` 由 AI 控制,forge 没有独立于 AI 文件系统输入的 pre-pause tasks 可信来源(`tasks.md` 不 commit、无 propose marker)。hash-chain 只保证*事后*不可篡改,保证不了*捕获时*输入诚实。

### 9.3 取舍结论

完整独立 hash-chain 方案同样关不掉 9.2 的 gap(根因在"无可信锚点",不在"链强度")。故采用轻量方案,不为消除一个无法消除的 gap 多付成本。此 gap 须在 `pause-decisions-fence.ts` 代码注释、本 design §9、`commands/apply.md` 三处显式声明。

## 10. 测试策略

- **Block A**:4 个 TEST-ONLY todo unskip 为真 `it()`,注入失败断言回滚 / fail-closed。
- **Block B**:option=1 attack todo unskip —— fixture:marker 声称改 proposal `## What Changes` 但实际 diff 只动 tasks.md → 断言拒签;happy path(确有 What Changes 段新增行)断言通过;另测 proposal.md 带 frontmatter 时行号对齐正确。
- **Block C**:option=2 attack todo unskip —— fixture:`added_task_ref` 出现在 capture entry 的 `tasks_md_task_ids` 里(非新增)→ 拒签;happy path:`added_task_ref` ∉ capture 快照、∈ 当前 tasks.md 且勾选 → 通过;链坏 / capture entry 缺失 / `capture_id` 被复用 / 缺 `ack_log_tail_hash` → 拒签;老版本 marker 降级路径 → 旧行为通过。
- **release gate**:全 6 todo unskip 后 `pnpm test:gate:release` actual=0 → PASS;release CI 接入 `test:gate:release`。
- 推 commit 前本地跑全 5 步(lint → format:check → typecheck → build → test),沿 CLAUDE.md。

## 11. 实施清单(文件级,writing-plans 细化)

**Phase 1(Block A + B):**
- `tests/integration/release-blocker-attack-path.test.ts` —— unskip todo 1/3/4/5/6
- `src/core/parse/unified-diff.ts`(新)+ 单测
- `src/core/archive/pause-decisions-fence.ts` —— fence 加 `repoRoot` 参数 + option=1 diff 校验(含 frontmatter 行号对齐)
- `src/cli/commands/archive.ts` —— 两处 fence 调用传 `repoRoot`
- release CI 配置 —— 接入 `pnpm test:gate:release`

**Phase 2(Block C):**
- `src/cli/commands/pause-capture.ts`(新)—— 子命令实现
- `src/cli/index.ts` —— `import` + `program.addCommand(...)` 注册(#7;漏此步命令不可用)
- ack-log append 共享锁 —— 抽出或复用(§6.1)
- `src/core/ack-log.ts` —— `PauseCaptureEntry` + union 扩展
- `src/core/archive/ack-log-consistency.ts` —— 删本地 `AckLogEntry`,改 import + type guard
- `src/core/markers/types.ts` + `src/core/validate/marker-schema.ts` —— `added_task_ref` + `capture_id`(optional + legacy undefined 分支)
- `src/core/archive/pause-decisions-fence.ts` —— 重写 `checkOption2TaskChecked`
- `commands/apply.md` —— Fluid Pause 协议 + `pnpm build`
- `tests/integration/release-blocker-attack-path.test.ts` —— unskip todo 2
- CLI 单测(`pause-capture` help / 参数校验 / unknown command)+ 各模块单测
- `docs/cli-reference.md` —— 补 `pause-capture` 子命令

## 12. 非目标(out of scope)

- 不改 option=3 / option=4 fence(v5/v6 已闭环)。
- 不追求 option=2 的密码学强度证明(§9.2 gap 接受)。
- 不引入独立于 ack-log 的新 hash-chain。

## 13. 修订记录

### round 1 — Codex 对抗性 review(2026-05-19)

9 条意见(3 BLOCKER / 4 MAJOR / 1 MINOR / 1 NIT),逐条独立对照代码核实,**全部属实,全部采纳**:

| # | 级别 | 议题 | 修订 |
| - | ---- | ---- | ---- |
| 1 | BLOCKER | 独立 `verifyAckLogChain` 链内自洽挡不住"重写整链" | §6.2 重写:option=2 强校验前提 = marker 有 `ack_log_tail_hash`+`ack_log_entry_count`,缺则不宣称链保护 |
| 2 | BLOCKER | 三元组 `(change_id,paused_at,task_ref)` 可重放,旧 capture 可被选择性认领 | 引入不可重用 `capture_id`,marker 据此精确匹配 + 唯一性校验(§6.1/§6.3/§6.4) |
| 3 | BLOCKER | option=2 仍不能验证"真新增",目标与 gap 冲突 | §1/§2.3/§9 重写:如实界定安全目标,gap 分层声明(9.1 能挡 / 9.2 挡不住) |
| 4 | MAJOR | `pause-capture` 裸调 `appendAckLog` 有链断 race | §6.1:必须在 ack-log 级共享锁内 append(`evidence.ts:330` C5 先例) |
| 5 | MAJOR | option=1 用 `parseMarkdown` 行号忽略 frontmatter 偏移 | §5.3:用 proposal.md 原始文件行号定位段,不用 body 内行号 |
| 6 | MAJOR | `added_task_ref` nullable/optional 不一致 | §6.3/§7/§8.1 统一为 optional + marker-schema legacy `undefined` 分支 |
| 7 | MAJOR | `pause-capture` CLI 注册链实施点不完整 | §11 Phase 2 补 `src/cli/index.ts` 注册 + CLI 单测 |
| 8 | MINOR | `parseTasks` 作 canonical 收窄可接受 task 格式 | §8.4 新增:writing-plans 先核查实际格式,legacy 保留旧匹配 |
| 9 | NIT | `ack-log-consistency.ts` 本地 `AckLogEntry` 会继续漂移 | §6.3:直接 import,删本地定义 |
