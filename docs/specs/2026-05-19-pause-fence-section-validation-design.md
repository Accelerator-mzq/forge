# pause-fence 段级校验 design(release-blocker attack-path 闭环)

- **日期**:2026-05-19
- **状态**:design,待 writing-plans(已过 Codex 对抗性 review round 1 + round 2)
- **关联**:design `2026-05-10-v1.0-fusion-completion-design.md` §2.1.5;plan-9c §7.5;plan-9c `release-blocker-attack-path.test.ts`
- **brainstorm 来源**:session 704adeea(2026-05-18~19)+ 本会话深入核查

## 1. 背景与目标

forge 的 `pnpm test:gate:release`(strict 模式,要求 0 个 `it.todo`)长期 FAIL —— `tests/integration/release-blocker-attack-path.test.ts` 含 **6 个 `it.todo`** 占位(v1.0~v2.0 均带此挂账发布;`ci.yml` 只跑 soft gate,strict gate 无 CI 调用)。

本特性把这 6 个 todo 全部 unskip 成真实通过的 attack-path 测试,使 `test:gate:release` 完全 PASS,并在 release CI 接入 `test:gate:release`。

**option=2 的安全目标须如实界定**(见 §2.3 / §9):轻量 capture 方案**不**声称能证明"task 是 pause 真新增的";它能做到的是 —— 让 option=2 marker 必须携带一条进入 hash-chain 的 capture entry 作为定位锚点,挡住"完全无 capture 流程的 option=2"与"capture entry 事后被篡改",并把 capture-input gap 显式声明为已知限制。

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

archive 在 `archive.ts:452`(verify-passed)/`:463`(review-passed)各调一次 fence,已传 `changeDir`,**未传 repo root**。

### 2.2 apply 提交模型(关键事实)

- apply 期 subagent 逐 task 做 red/green commit(代码);**主代理对 `tasks.md`/`proposal.md` 的改动(勾选框、Fluid Pause 加 task、option=1 改 What Changes)全程不 commit,留工作树**。
- review marker `git.head` = 最后 task commit;`git.diff_hash` = `git diff HEAD` = 未提交残留。pause 那刻无任何 git 锚点。
- **forge 没有 propose 阶段 marker** —— marker 只有 4 种(Verify / Review + 两个 failed)。apply 开始前的 `tasks.md` 没有任何固化点。
- **marker 文件本身由 AI 产出,marker 内容(含 `pause_decisions`)不被任何 hash-chain 保护**;受 hash-chain 保护的只有 `.evidence/ack-log.jsonl`(经 `marker.ack_log_tail_hash`/`ack_log_entry_count` 固化)。

### 2.3 option=2 的根本约束(capture-input gap)

威胁模型:**AI 主代理是对手,控制整个 git repo + 文件系统 + 可跑任意 forge 命令 + 自由编写 marker 文件**。要校验"task 是 pause 真新增的",需要一个 pause 之前的 `tasks.md` 可信快照。但:

- `tasks.md` 全程不 commit,git history 里没有它的任何历史;
- 引入 forge CLI 在 pause 时捕获,**capture 的输入(`tasks.md`)本身由 AI 喂**。AI 可"删掉目标旧 task → capture → 恢复旧 task";
- 一个 change 可有多次 pause(多条 capture entry),AI 可**预先攒**多条 capture;且 `pause_decision.capture_id`(指向哪条 capture)由 AI 写 marker 时自由填,无法限定为"真实那条"。

hash-chain 只能防 capture entry *事后*被篡改,**防不了** capture *当下*喂假输入、也防不了 AI 写 marker 时选择性认领某条 capture。

**结论**:option=2 在当前 forge 架构下无法密码学证明"新增"(完整独立 hash-chain 方案同样关不掉此 gap,故不为它多付成本)。本特性采用**轻量 capture 方案**(§6),安全收益与 gap 见 §9。

## 3. 总体方案

三个工作块,**一个 plan + Phase 化**执行:

- **Phase 1** = Block A(4 TEST-ONLY)+ Block B(option=1 diff 段级校验)—— 风险低、自包含,快速闭合 5/6 个 todo。
- **Phase 2** = Block C(option=2 轻量 capture)—— 新 CLI 子命令 + schema + 协议改动。

Block C 复用 Block B 给 fence 加的 repo root 参数,故同 plan 更顺。

## 4. Block A — 4 个 TEST-ONLY(纯测试)

行为已实现,只补测试 + mock,无生产代码改动。

- **todo 3/4/5**:`transaction.ts` rename / Backup / Sync 失败注入回滚 —— 参考 `tests/core/archive/transaction.test.ts` 的 P2.2 + case 3 注入模式。
- **todo 6**:`version-retrograde-fence.ts` git log 失败 fail-closed —— `vi.mock('node:child_process')` 让 `rev-parse` 成功(确认是 git repo)但 `git log` 抛错,断言 fence 拒签。

unskip 后这 4 个 todo 改为真 `it()`。

## 5. Block B — option=1 diff 段级校验

### 5.1 unified-diff hunk parser(新模块)

新增 `src/core/parse/unified-diff.ts`(命名 writing-plans 定):解析 `git diff` 文本输出,产出 hunk 列表。每个 hunk 含 `@@ -a,b +c,d @@` 头,以及该 hunk 内带 `+`(新增)/`-`(删除)前缀的行 + 其在**新文件**中的行号。

### 5.2 fence 签名变更

`validatePauseDecisionsFence` 加一个 repo root 参数(沿 `version-retrograde-fence` 的 `gitDir` 先例)。`archive.ts:555` 调 `validateReviewGitIntegrity` 时传的是 `process.cwd()`(不存在名为 `repoRoot` 的变量);option=1 校验沿用同一个 `process.cwd()`,两处 fence 调用(`:452`/`:463`)传入即可。

### 5.3 option=1 校验逻辑(frontmatter 行号对齐)

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
  1. 生成 `capture_id`(`crypto.randomUUID()`)。
  2. 读 `forge/changes/<changeId>/tasks.md` → `parseTasks` 解析所有 task id。
  3. 在 **ack-log 级共享锁内**(见下)写一条 `kind='pause-capture'` entry 进 `.evidence/ack-log.jsonl`(经 `appendAckLog` 自动接 `prev_entry_hash` 链)。
  4. stdout 输出 `capture_id` + capture 的 ISO 8601 timestamp。
- **并发锁**:`appendAckLog`(`ack-log.ts:106-125`)是"读最后一行 → 算 hash → append",自身无锁。`forge evidence record-tdd` 靠把 `appendAckLog` 放进 staging lock 的 critical section 防链断 race(`evidence.ts:330-333` 注释 C5)。`pause-capture` 同样必须在共享锁内 append —— writing-plans 需抽出一个 ack-log 级 append 锁(或复用 `.evidence` 锁),不可裸调 `appendAckLog`。
- 主代理拿到 `capture_id` 后,写进对应 pause_decision 的 `capture_id` 字段。

### 6.2 capture entry 的链保护(前提条件)

`verifyAckLogChain`(`ack-log.ts:245-287`)做三重校验:
1. **链内自洽**:`prev_entry_hash` 逐行 match(无条件执行)。
2. **行数固化**:仅当 `markerEntryCount !== null` 时校验。
3. **尾 hash 固化**:仅当 `markerTailHash !== null` 时校验。

**关键约束**:**只做链内自洽校验,挡不住"重写整条 ack-log + 重算所有 `prev_entry_hash`"** —— 攻击者可构造一条全新且内部自洽的链。真正的事后篡改防护来自固化项 2/3,而它们依赖 `marker.ack_log_tail_hash` + `ack_log_entry_count`。这两个字段在 verify 阶段 `forge evidence freeze` 时固化(`evidence.ts:815-819`)。

因此 **option=2 强校验要求 marker 同时有 `ack_log_tail_hash` + `ack_log_entry_count`**:
- 两者齐全 → fence 把它们传入 `verifyAckLogChain`,三重校验全开,capture entry 受事后篡改保护。
- 缺任一 → 链保护不成立 → **fail-closed 拒签**(option=2 一律要求 capture,见 §8.1)。
- `writing-plans` 须先核实:forge 主流程是否所有过 verify 的 change 都必产 `process_evidence` + freeze(即必有 `ack_log_tail_hash`/`ack_log_entry_count`)。若存在合法的"无 process_evidence"路径,需在 writing-plans 阶段把它作为 design 缺口上报、重新评估。

Fluid Pause 在 apply 阶段(`forge evidence freeze` 之前)发生,故正常路径下 capture entry 会被 freeze 的 tail/count 一并固化。边界(pause 发生在 freeze 之后)见 §8.3。

### 6.3 schema 扩展(均 superset additive)

**`AckLogEntry` 判别联合加 `PauseCaptureEntry`**(`src/core/ack-log.ts`):

```ts
export interface PauseCaptureEntry {
  schema: 'forge-ack-log/v1';
  kind: 'pause-capture';
  timestamp: string; // ISO 8601 UTC
  capture_id: string; // crypto.randomUUID(),marker 据此定位 capture entry
  change_id: string;
  task_ref: string; // 触发 pause 的 task(subagent 报 issue 所在)
  pause_issue_summary: string;
  tasks_md_task_ids: string[]; // capture 时刻 tasks.md 全部 task id(parseTasks 解析)
  git_head: string | null;
  prev_entry_hash?: string | null;
  extra: Record<string, unknown>;
}
```

**`ack-log-consistency.ts` 类型去重**:`ack-log-consistency.ts:14-26` 有一份本地重定义的 `AckLogEntry`(只含 `'ack' | 'evidence-helper'` 两个 kind,已漂移)。本特性**直接 `import { AckLogEntry } from '../ack-log.js'`,删除本地重复定义**,在用到 `kind==='ack'` 处用 type guard 过滤。不再维护两份 schema。

**`PauseDecision` 加两个 optional 字段**(`src/core/markers/types.ts`):

```ts
added_task_ref?: string | null; // option=2 新增的 task(末段 tasks.md#task-N);厘清见下
capture_id?: string | null;     // option=2 关联的 pause-capture entry id
```

- 两者在 **schema 层为 optional**(`?`),因为是 superset additive 新字段,gen-0 老 marker(根本没有 `pause_decisions` 字段)与本特性发布前的 marker 都没有它们 —— schema 层缺字段不可 fail。**不可**沿用现有 `PauseDecision` nullable 字段(`severity_acked_by` 等)"字段必须存在、值可为 null"的约定:`marker-schema.ts:730-769` 对 nullable 字段用 `val !== null && ...` 校验,`undefined` 会 fail。`marker-schema.ts` 对 `added_task_ref` / `capture_id` 必须单独处理 `=== undefined` 的分支(undefined → 跳过类型校验)。
- **"是否必填"由 fence 层(§6.4)按 `chosen_option` 决定,不由 schema 层、也不由 marker 自报版本决定**(见 §8.1)。
- `added_task_ref` 厘清 `task_ref` 语义歧义:现状 `checkOption2TaskChecked` 把 `task_ref` 当"新增 task"用,与类型注释「`task_ref` = 触发 pause 的 task」矛盾。本特性引入 `added_task_ref` 专指"pause 新增的 task",`task_ref` 归位为"触发 pause 的 task"。option=2 的 `target_anchor` 降为人类可读记录,fence 不再据它校验。

### 6.4 改 `checkOption2TaskChecked`

对**任何** `chosen_option===2` 的 pause_decision(不分 marker 版本,见 §8.1):

1. 校验该 pause_decision 有非空 `added_task_ref` + `capture_id`;缺任一 → 拒签。
2. 校验 marker 有 `ack_log_tail_hash` + `ack_log_entry_count`(§6.2);缺 → 拒签。
3. 读 `.evidence/ack-log.jsonl`(`readAllAckLogEntries`),调 `verifyAckLogChain(entries, marker.ack_log_tail_hash, marker.ack_log_entry_count)`;链校验失败 → 拒签。
4. 在 ack-log 里定位 capture entry:`kind==='pause-capture'` **且** `capture_id` 匹配 **且** `change_id===changeId` **且** `task_ref===pause_decision.task_ref`(全部匹配,defense-in-depth);找不到 / 找到多条 → fail-closed 拒签。
5. 同一 marker 内,校验 `capture_id` 未被多个 pause_decision 复用(防一条 capture 被多次认领)。
6. 校验:`added_task_ref` 末段 ∉ capture entry 的 `tasks_md_task_ids`(pause 时不存在)。
7. 校验:`added_task_ref` 末段 ∈ 当前 `tasks.md` 且已勾选 `[x]`。
8. 解析器:用 `parseTasks`(`tasks.ts:32`,`TASK_RE` = `^\s*- \[([ x])\]\s+([\w-]+)\s*:\s*(.+)$`,即 `- [x] task-id: desc` 格式)作 canonical 解析器。**注意格式收窄**:`parseTasks` 只认 `task-id: desc`,现有 fence 的旧正则还认 `- [x] **task-2**` bold / bare key。见 §8.4。

### 6.5 verify/review 双 marker `pause_decisions` cross-check

`pause_decisions` 同时镜像在 `.verify-passed` / `.review-passed`(design §2.1.6)。archive 现对两个 marker 各跑一次独立 fence(`archive.ts:452`/`:463`),不做跨 marker 比对 —— 两份可写不同 `capture_id` / `added_task_ref` 各自通过,镜像语义漂移。

本特性在 archive 层加一个 verify/review `pause_decisions` cross-check(沿 `validateThreeLevelFence` 同时接 verifyRec + reviewRec 的先例):按 `id` 配对,比对 `task_ref` / `chosen_option` / `added_task_ref` / `capture_id` 一致;不一致 → 拒签。范围限定在本特性引入/相关的字段,不扩展到整 marker 镜像校验(那是独立议题,§12 非目标)。

### 6.6 改 `commands/apply.md`

- Fluid Pause 段:pause 触发时,主代理**先调 `forge pause-capture`**(任一 chosen_option 都做,capture 记录 pause 时刻状态),把返回的 `capture_id` 留作 marker 写入用,再走 AskUserQuestion。
- Marker 持久化段:option=2 schema 加 `added_task_ref` + `capture_id` 字段说明。
- 改 `commands/apply.md` 后必须 `pnpm build`(双源 md5 sync,CLAUDE.md 约束 1)。

## 7. Schema 变更汇总

| 文件 | 变更 | 兼容性 |
| ---- | ---- | ------ |
| `src/core/ack-log.ts` | `AckLogEntry` 加 `PauseCaptureEntry` 成员(含 `capture_id`) | superset additive |
| `src/core/archive/ack-log-consistency.ts` | 删本地 `AckLogEntry`,改 import + type guard | 内部一致性修复 |
| `src/core/markers/types.ts` | `PauseDecision` 加 `added_task_ref?` + `capture_id?`(schema 层 optional) | superset additive |
| `src/core/validate/marker-schema.ts` | 校验同步两个新字段,单独处理 `=== undefined` 分支 | 缺字段 → schema 不 fail,必填性留 fence 判 |

## 8. 边界与兼容

### 8.1 option=2 一律要求 capture(取消版本降级)

option=2 fence **不**按 `marker.created_by_tool_version` 做降级 —— 版本号由 marker 自报,AI 可谎报低版本绕过校验(Codex round 2 BLOCKER #2)。`marker` 与 `ack-log` 均为 AI 产出,**不存在 AI 无法伪造的"是否 legacy"判据**,故任何"自动降级"开关都可被绕过。

规则:
- marker **完全没有 `pause_decisions` 字段**(gen-0 老 marker)→ 现有 fence `if (!Array.isArray(decisions)) return ok()` 直接通过,不进 option 校验,**天然兼容、不受影响**。
- marker **有 `pause_decisions` 且某条 `chosen_option===2`** → 一律走 §6.4 强校验(要求 `added_task_ref` + `capture_id` + 匹配 capture entry + `ack_log_tail_hash`/`ack_log_entry_count`);任一不满足 → 拒签。

**已知破坏性边界**:本特性发布**前** in-flight 的 option=2 change(已 verify/review、未 archive,且 apply 期未走过 `pause-capture`,ack-log 里无 capture entry)在用新 CLI archive 时会被拒。这类 change 极罕见(需恰好卡在发布窗口),且无法靠重走 verify/review 修复(capture entry 是 apply 期产物)。处理:
- `CHANGELOG.md` 以 breaking change 显式声明。
- 受影响 change 由用户人工处理(例如把该条 pause_decision 改判为 option=4 Other 并补 `other_rationale`/`other_acked_by`,或人工接受后另行归档)。
- 不在 fence 内开自动放行口子。

### 8.2 非 git 项目

- option=1:diff 校验 N/A → 降级字段校验。
- option=2:capture / ack-log 链不依赖 git,正常执行;`git_head` 字段允许 `null`。

### 8.3 capture entry 在 freeze 之后写入(罕见边界)

design `2026-05-10` line 375 提到"verify 阶段也可触发 pause"。若 pause 发生在 `forge evidence freeze` 之后,capture entry 不被 `ack_log_tail_hash`/`entry_count` 固化 —— §6.4 step 2 要求 marker 有这两个字段,但它们固化的是 freeze 时刻的链尾;freeze 后追加的 capture entry 会使实际 entry count 超过 `ack_log_entry_count` → `verifyAckLogChain` 行数校验失败 → 拒签。

即:freeze 后再 pause-capture 的 change,option=2 强校验会拒签。writing-plans 须明确此约束并在 `commands/apply.md` / `verify.md` 协议侧声明"Fluid Pause 须在 verify freeze 之前完成"。作为已知边界。

### 8.4 `parseTasks` 格式收窄

`parseTasks` 只认 `- [x] task-id: desc`。现有 option=2 fence 的旧正则还认 `- [x] **task-2**` bold / bare key。统一到 `parseTasks` 后,旧格式 task 行在新 fence 下不可见。

writing-plans 的 Path Pre-flight Verify 阶段**必须先核查实际 `tasks.md` 的真实 task 行格式**(看 `forge/changes/` 下样本 + `commands/apply.md` / `commands/propose.md` 模板对 task 行的定义):
- 若实际格式就是 `task-id: desc` → 直接统一 `parseTasks`,旧 bold 正则是无效假设,删除。
- 若旧格式确实在用 → 需在 propose/apply 协议侧明确强制 `task-id: desc` 格式 + 加格式校验或错误提示;本特性的 option=2 fence 只支持 canonical 格式(option=2 一律要求 capture,不保留旧格式兼容路径)。

## 9. 已知 gap 声明(capture-input gap)

### 9.1 轻量 capture **能**挡的

- **option=2 无 capture entry**:marker 声称 `chosen_option===2` 但 ack-log 里无 `capture_id` 匹配的 `pause-capture` entry(或 marker 缺 `capture_id` / `ack_log_tail_hash`)→ 拒签。
- **capture entry 事后被篡改**:在 marker 有 `ack_log_tail_hash`/`ack_log_entry_count` 固化的前提下(§6.2),改动 ack-log 里的 capture entry 内容会破坏链 → 拒签。
- **同 marker 内 capture 复用**:fence 校验一条 `capture_id` 不被多个 pause_decision 引用 → 拒签。

`capture_id` 的作用是**精确定位 capture entry**(消除"按时间戳模糊匹配"的歧义)+ **同 marker 内防复用**。它由 `forge pause-capture` 生成,**不是授权凭据** —— AI 可运行该命令产生任意多 `capture_id`(威胁模型承认 AI 控制 forge 命令)。

### 9.2 轻量 capture **挡不住**的(capture-input gap)

攻击者(AI 主代理控制文件系统 + 可跑任意 forge 命令 + 自由编写 marker)仍可:

- **喂假输入**:`删掉目标旧 task → forge pause-capture(快照不含该 task)→ 恢复目标旧 task`,使 capture entry 的 `tasks_md_task_ids` 不含目标 task。
- **选择性认领**:**预先攒**多条 capture entry,写 marker 时为 option=2 的 pause_decision 挑一条 `tasks_md_task_ids` 不含目标 task 的,把其 `capture_id` 填进去。`pause_decision.capture_id` 指向哪条 capture,由 AI 写 marker 时决定 —— marker `pause_decisions` 不被任何 hash-chain 保护(§2.2),无论 AI 在 freeze 前还是 freeze 后定稿 marker,都能自由选择 `capture_id`。

> 关于"freeze 时固化 marker `pause_decisions` hash"(Codex round 2 BLOCKER #1 建议):该机制只能阻止"freeze 后改 marker",但 AI 在 verify 阶段**首次写** marker `pause_decisions` 时,apply 期产生的全部 capture entry 早已在 ack-log 里 —— AI 在定稿那一刻即可填入指向"不含目标 task 的 capture"的 `capture_id`。固化 marker hash 只封堵一条 AI 本就不需要走的路径,不关闭本 gap,故不采纳(详见 §13 round 2 #1)。

根因:capture *当下*喂入的 `tasks.md` 由 AI 控制,且 `pause_decision → capture entry` 的关联由 AI 写 marker 时决定;forge 没有独立于 AI 文件系统/marker 输入的 pre-pause tasks 可信来源(`tasks.md` 不 commit、无 propose marker)。

### 9.3 取舍结论

完整独立 hash-chain 方案同样关不掉 9.2 的 gap(根因在"无可信锚点",不在"链强度")。故采用轻量方案,不为消除一个无法消除的 gap 多付成本。此 gap 须在 `pause-decisions-fence.ts` 代码注释、本 design §9、`commands/apply.md` 三处显式声明。轻量 capture 的实际价值边界:**对"诚实但偷懒"的 AI 有效(逼它至少走完 capture 流程并留下进链的记录),对蓄意构造假输入的攻击者无效。**

## 10. 测试策略

- **Block A**:4 个 TEST-ONLY todo unskip 为真 `it()`,注入失败断言回滚 / fail-closed。
- **Block B**:option=1 attack todo unskip —— fixture:marker 声称改 proposal `## What Changes` 但实际 diff 只动 tasks.md → 断言拒签;happy path(确有 What Changes 段新增行)断言通过;另测 proposal.md 带 frontmatter 时行号对齐正确。
- **Block C**:option=2 attack todo unskip —— fixture:`added_task_ref` 出现在 capture entry 的 `tasks_md_task_ids` 里(非新增)→ 拒签;happy path:`added_task_ref` ∉ capture 快照、∈ 当前 tasks.md 且勾选 → 通过;链坏 / capture entry 缺失 / `capture_id` 被复用 / 缺 `ack_log_tail_hash` / `change_id`/`task_ref` 不匹配 → 拒签;verify/review 两份 `pause_decisions` 不一致 → 拒签;gen-0 老 marker(无 `pause_decisions`)→ 通过。
- **release gate**:全 6 todo unskip 后 `pnpm test:gate:release` actual=0 → PASS;release CI 接入 `test:gate:release`。
- 推 commit 前本地跑全 5 步(lint → format:check → typecheck → build → test),沿 CLAUDE.md。

## 11. 实施清单(文件级,writing-plans 细化)

**Phase 1(Block A + B):**
- `tests/integration/release-blocker-attack-path.test.ts` —— unskip todo 1/3/4/5/6
- `src/core/parse/unified-diff.ts`(新)+ 单测
- `src/core/archive/pause-decisions-fence.ts` —— fence 加 repo root 参数 + option=1 diff 校验(含 frontmatter 行号对齐)
- `src/cli/commands/archive.ts` —— 两处 fence 调用传 `process.cwd()`
- release CI 配置 —— 接入 `pnpm test:gate:release`

**Phase 2(Block C):**
- `src/cli/commands/pause-capture.ts`(新)—— 子命令实现
- `src/cli/index.ts` —— `import` + `program.addCommand(...)` 注册(漏此步命令不可用)
- ack-log append 共享锁 —— 抽出或复用(§6.1)
- `src/core/ack-log.ts` —— `PauseCaptureEntry` + union 扩展
- `src/core/archive/ack-log-consistency.ts` —— 删本地 `AckLogEntry`,改 import + type guard
- `src/core/markers/types.ts` + `src/core/validate/marker-schema.ts` —— `added_task_ref` + `capture_id`(schema 层 optional + `undefined` 分支)
- `src/core/archive/pause-decisions-fence.ts` —— 重写 `checkOption2TaskChecked`(§6.4)
- `src/cli/commands/archive.ts` —— 加 verify/review `pause_decisions` cross-check(§6.5)
- `commands/apply.md` —— Fluid Pause 协议 + `pnpm build`
- `tests/integration/release-blocker-attack-path.test.ts` —— unskip todo 2
- CLI 单测(`pause-capture` help / 参数校验 / unknown command)+ 各模块单测
- `docs/cli-reference.md` —— 补 `pause-capture` 子命令

## 12. 非目标(out of scope)

- 不改 option=3 / option=4 fence(v5/v6 已闭环)。
- 不追求 option=2 的密码学强度证明(§9.2 gap 接受)。
- 不引入独立于 ack-log 的新 hash-chain。
- 不做整 marker 的 verify/review 镜像 cross-check(本特性只 cross-check `pause_decisions` 相关字段,§6.5)。

## 13. 修订记录

### round 1 — Codex 对抗性 review(2026-05-19)

9 条意见(3 BLOCKER / 4 MAJOR / 1 MINOR / 1 NIT),逐条独立对照代码核实,**全部属实,全部采纳**:

| # | 级别 | 议题 | 修订 |
| - | ---- | ---- | ---- |
| 1 | BLOCKER | 独立 `verifyAckLogChain` 链内自洽挡不住"重写整链" | §6.2:option=2 强校验前提 = marker 有 `ack_log_tail_hash`+`ack_log_entry_count` |
| 2 | BLOCKER | 三元组 `(change_id,paused_at,task_ref)` 可重放,旧 capture 可被选择性认领 | 引入 `capture_id` 精确定位(§6.1/§6.3/§6.4);"选择性认领"仍属 gap(round 2 #1) |
| 3 | BLOCKER | option=2 仍不能验证"真新增",目标与 gap 冲突 | §1/§2.3/§9 重写:如实界定安全目标,gap 分层声明 |
| 4 | MAJOR | `pause-capture` 裸调 `appendAckLog` 有链断 race | §6.1:必须在 ack-log 级共享锁内 append |
| 5 | MAJOR | option=1 用 `parseMarkdown` 行号忽略 frontmatter 偏移 | §5.3:用 proposal.md 原始文件行号定位段 |
| 6 | MAJOR | `added_task_ref` nullable/optional 不一致 | §6.3/§7/§8 统一为 schema 层 optional + `undefined` 分支 |
| 7 | MAJOR | `pause-capture` CLI 注册链实施点不完整 | §11 Phase 2 补 `src/cli/index.ts` 注册 + CLI 单测 |
| 8 | MINOR | `parseTasks` 作 canonical 收窄可接受 task 格式 | §8.4:writing-plans 先核查实际格式 |
| 9 | NIT | `ack-log-consistency.ts` 本地 `AckLogEntry` 会继续漂移 | §6.3:直接 import,删本地定义 |

### round 2 — Codex 对抗性 review(2026-05-19)

复核确认 round 1 的 9 条修订均到位。新意见 6 条(2 BLOCKER / 2 MAJOR / 1 MINOR / 1 NIT),逐条核实:

| # | 级别 | 议题 | 核实与处理 |
| - | ---- | ---- | ---------- |
| 1 | BLOCKER | `capture_id` 不被 freeze entry / hash-chain 固化,可 freeze 后改 marker 选另一条已固化 capture | **现象属实,但修复建议(固化 marker pause hash)经核实无效** —— AI 在 verify 阶段首次写 marker `pause_decisions` 时即可填任意 `capture_id`,不需"freeze 后改"。**不采纳该机制**;现象作为 capture-input gap 的根因写入 §9.2(含对该建议无效性的论证) |
| 2 | BLOCKER | §8.1 版本降级可被 marker 自报版本绕过 | **属实,严重**。用户决策:取消版本降级,option=2 一律要求 capture(§8.1 重写);gen-0 老 marker 天然兼容,发布前 in-flight option=2 change 作为已知破坏性边界声明 |
| 3 | MAJOR | §9.1 "挡凭据重放" 表述强于实际能力 | 属实,采纳:§9.1 重写,明确 `capture_id` 是定位键 + 同 marker 防复用,非授权凭据 |
| 4 | MAJOR | verify/review 双 marker `pause_decisions` 无 cross-check | 属实,采纳:新增 §6.5,archive 层加 verify/review `pause_decisions` cross-check(沿 `validateThreeLevelFence` 先例) |
| 5 | MINOR | §6.4 未校验 capture entry 的 `change_id`/`task_ref` | 采纳:§6.4 step 4 改为 `capture_id`+`change_id`+`task_ref` 全匹配 |
| 6 | NIT | §5.2 "archive 已具备 repoRoot" 措辞不准 | 属实(`archive.ts:555` 传 `process.cwd()`),采纳:§5.2 改措辞 |
