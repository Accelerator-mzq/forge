# Tier 2/3 Workflow Closure 设计

> **日期**:2026-05-19
> **状态**:Approved（已 Codex 对抗性审查 9 轮收敛;终轮 1 MINOR 已修,0 CRITICAL/MAJOR/MINOR;待 writing-plans 出实施计划）
> **目标版本**:v3.0.0 → v3.1.0(minor / feature 增量)
> **provenance**:brainstorming → 9 轮 Codex(gpt-5.x-codex)对抗性审查,累计 R1-R31 修订全部经独立代码核实为真(0 误报),见附录 A。

---

## 0. 背景与问题陈述

forge 是「多 harness AI 工作流 plugin」,三 tier:Tier 1 Claude Code 全功能;Tier 2 OpenCode / Tier 3 Codex = PARTIAL_SHIP(skill + CLI,slash 命令不可用)。主流程 6 步:`brainstorm → propose → apply → review → verify → archive`,每步产强校验 marker。

经核实,Tier 2/3 当前**跑不通完整工作流**,根因如下:

1. `commands/*.md`(10 个 slash 命令)承载主流程编排;Tier 2/3 不注册 slash(`docs/codex-install.md:65`、`docs/opencode-install.md:112`)。
2. 18 个 skill 仅 3 个带 Tier 2/3 桥接段(`writing-plans/SKILL.md:240`、`verification-before-completion/SKILL.md:147`、`finishing-a-development-branch/SKILL.md:228`),合计只桥 `validate`×2 + `archive`。
3. `writing-plans/SKILL.md:18` 只产 `tasks.md`,4 件套其余由 `commands/propose.md:48` 模板生成 → Tier 2/3 缺。
4. **假 claim #1**:`verification-before-completion/SKILL.md:161-167` 称 validate 自动写 marker。核实 `validate.ts:44-58` 纯只读。真实 marker 生命周期:① AI 按 `verify.md` step 4.3 写基础 `.verify-passed` → ② `forge evidence record-verify` 写 staging → ③ `forge evidence freeze` 原子重写 marker(`evidence.ts:610-673`)。
5. **假 claim #2 + forge-wide bug**:`ack-confirm.md:20` 称 `forge ack confirm` 写 marker。核实 `ack.ts:203-231`:confirm 只 `appendAckLog` + `unlink`,不写 marker,且 ack-log entry `finding_hash` 写死 `null`(`ack.ts:213`)。而 archive 双重校验 —— `verify-findings-fence.ts:57-68` 要 marker `severity_acked_by`+`_at`;`ack-log-consistency.ts:124-138` 要 ack-log `finding_hash` == marker finding 重算 hash 且 `ack-log.user` == `marker.severity_acked_by`。→ **WARNING ack → archive 在所有 tier 都断链**(forge-wide 既有 bug)。
6. 后果链:Tier 2/3 verify 桥接段只跑 `validate` 并误以为 marker 已写 → marker 不产出 → `archive.ts:295-300` 缺 marker 拒签 → **6 步在 Tier 2/3 跑不通**。
7. `using-forge/SKILL.md:125` 称 Tier 2/3「与 Claude Code 体验一致」,与 `:113/:116` 自身 slash FAIL 标注矛盾。

## 1. 目标与已决策选项

**目标**:Codex/OpenCode 跑通完整工作流 = `propose→apply→review→verify→archive` 5 stage 新增桥接 + `brainstorm` 已由 `brainstorming` skill 覆盖 = 6 步闭环 + 反向加固协议。

**scope 含一处 forge-core 修复**:`forge ack confirm` 写 marker ack 字段 + ack-log `finding_hash`(§5.1)—— §0.5 既有 bug 的修复,是「完整工作流」对任何带 WARNING / pause-warning finding 的 change 的硬前置。该 bug 是 forge-wide 的,Tier 1 同样受益。用户已裁定将此修复合并进本设计(而非拆为独立 change)。

**已否决备选**:

- 协议复制进 skill —— 产生第三份副本(`commands/` + `src/core/templates/`×2 已是 md5 双源同步),漂移风险高。
- CLI 加 `forge propose/verify` 编排命令 —— 违反 forge 自身「v7 CLI/AI 职责分层」(CLI 纯机械、judgment 归 AI)。

**已选方案**:skill 指向 command 文件(§2)。

## 2. 架构 / 桥接机制

命令文件协议原语 = [AI 判断] + [CLI helper 调用] + [skill 调用] + [AskUserQuestion] + [Task 派子代理],每种 Tier 2/3 都有等价物;真正缺的只有 slash「注册」,而 `commands/*.md` 是随 plugin 分发的普通文件。

**机制**:5 个 stage skill 各加「Tier 2/3 Orchestration」段,指示 AI 无 slash 命令时 Read 对应 `commands/<stage>.md` 并完整执行。**桥接机制不改任何命令文件**(替换规则在桥接段,执行时由 AI 代入)→ Tier-1 桥接路径零回归;`commands/` 单一来源 → 协议零复制零漂移。

> 注:唯一例外是 §5.1 forge-core 修复会同步更新命令文件 `ack-confirm.md` 中一处描述 `forge ack confirm` 行为的文本(§5.0、§5.1.6),使其与修复后的 CLI 一致 —— 这是文档准确性修正,不改 `/forge:ack-confirm` 的协议流程,Tier-1 行为不变。

**可靠性风险与缓解**:「Read 长 command 并完整执行」的可靠性,Plan 0a 实测只覆盖短命令(`spike/v0.3/0a-codex/RESULTS.md`)。缓解三层:① 桥接段内嵌该 stage 硬门槛自检清单(§4);② `bridge-protocol-fixture` 驱动到 archive fence 真实成败(§8);③ 文档措辞「经 bridge 支持 / best-effort」,不写「与 Claude Code 等价」。

## 3. 共享替换规则 —— 新增 `skills/_shared/tier23-command-bridge.md`

5 个桥接段引用同一份规则(DRY,仿既有 `_shared/scope-category-guidance.md`)。执行命令文件时:

| 命令文件里的 | Tier 2/3 替换为 |
|---|---|
| `${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs` | `<plugin root 绝对路径>/scripts/run-forge.mjs`(§3.1) |
| **shell/命令执行上下文中的 forge executable token** —— 含裸 `forge <subcmd>`、管道右侧 `… \| forge <subcmd>`。**散文/说明性文字里的 `forge archive` 等引用不替换**(按语义理解,如 `archive.md:103/181`) | `node "<plugin root 绝对路径>/scripts/run-forge.mjs" <subcmd> …`;helper 不可达时 fallback `npx -y --package @accelerator-mzq/forge@^3.x -- forge <subcmd>`(沿 `writing-plans/SKILL.md:254`)。命令文件裸 `forge` 处:`verify.md:55`(管道)、`verify.md:115/127`、`review.md:31/41`、`apply.md:16/78/190`、`archive.md:140/141` |
| 命令文件自身路径 | `<plugin root 绝对路径>/commands/<stage>.md`(§3.1) |
| `$ARGUMENTS` | 从用户自然语言提取 |
| `AskUserQuestion` | 降级终端 `[1]/[2]/…` prompt;确认结果必须落对应 CLI(`forge ack confirm/reject` 等),留 ack-log 证据(`archive.ts:513`) |
| `Task` 派子代理 | 按 `skills/subagent-driven-discipline/references/{codex,opencode}-tools.md` 映射 |
| `## (可选)Stage extensions hook — Tier 1 Claude Code only` 段 | 跳过 |

规则给 PowerShell + bash 双示例(含管道形式)。

### 3.1 plugin root 解析(绝对路径字面值,不依赖 shell 环境变量)

`${FORGE_HELPER}` / `${FORGE_PLUGIN_ROOT}` **均非运行时环境变量**(`writing-plans/SKILL.md:250-254` 只是文档约定)。桥接段必须先把 root 解析成**绝对路径字面值**,再代入命令 —— **不得**在 shell 写 `node "$FORGE_PLUGIN_ROOT/..."`(运行时 undefined)。

- **OpenCode**:`.opencode/plugins/forge.js` bootstrap 注入段(现注入 `using-forge` body)**追加一行字面 `forge plugin root: <abs path>`** —— `forge.js` 有 `__dirname`,可算绝对路径。AI 从该 bootstrap 文本取得字面路径,代入后续命令。
- **Codex**:标准安装 clone 到 `~/.codex/forge`(`docs/codex-install.md:19`)→ AI 把 `~`/`$HOME` 展开成绝对路径字面值后代入。
- **校验 + fail closed**:解析出 root 后校验 `<root>/scripts/run-forge.mjs` 与 `<root>/commands/<stage>.md` 同时存在;任一缺失 → 报错停止(不静默跳过)。
- 若 AI 需在 shell 用变量,允许在**单条命令内**显式 `FORGE_ROOT="<abs literal>"; node "$FORGE_ROOT/..."`,但变量值仍是字面绝对路径,不跨命令依赖。

## 4. 5 个 stage skill 改动

| skill | stage | 现状 | 改动 |
|---|---|---|---|
| `writing-plans` | propose | :240-260 旧 addendum(只调 validate,隐含 4 件套已存在的错误假设) | 替换为桥接段 → `propose.md` |
| `subagent-driven-development` | apply | 无 Tier 2/3 段 | 新增桥接段 → `apply.md` |
| `requesting-code-review` | review | 无 Tier 2/3 内容 | 新增桥接段 → `review.md` |
| `verification-before-completion` | verify | :147-167 含假 claim #1 | 替换为桥接段 → `verify.md`,删假 claim |
| `finishing-a-development-branch` | archive | :228+ addendum(直接 `forge archive`,漏 `archive.md` sync-check 编排步) | 替换为桥接段 → `archive.md` |

桥接段统一结构:① 引用 `_shared/tier23-command-bridge.md`;② 「Read `commands/<stage>.md` 完整执行」;③ 内嵌硬门槛自检清单:

- **propose**:`{proposal,design,tasks}.md` + `specs/` 齐全、三段 anchor 在、`forge validate` exit 0。
- **apply**:每个完成 task 经 `forge evidence record-tdd` 写 TDD 证据链(`apply.md:188-193` 强制;缺则 archive process_evidence fence 因 `tdd_event_chain` 缺失拒签)。`forge preflight branch-check` 已跑。
- **verify**:`.verify-passed` 写 → `record-verify` 跑 → `freeze --kind verify` exit 0(缺 freeze → `process-evidence-fence.ts:248-255` 拒签)。
- **review**:`.review-passed` 写 → `record-review` 跑 → `freeze --kind review` exit 0。
- **ack**:过程中 `forge ack propose` 退出(产生 pending)→ 桥接段 Read+执行 `ack-confirm.md` 等价流程 → 降级 prompt 让用户确认 → `forge ack confirm`/`reject`(AI 不得自 ack)。confirm 后 marker ack 字段由 CLI 写(§5.1)。
- **archive**:`.verify-passed`+`.review-passed` 均在且 hash 新鲜、`forge archive` exit 0、若 emit sync-check manifest 按 `archive.md` 编排步 fulfill。

## 5. 假 claim 清理与 forge-core 修复

### 5.0 假 claim 文本清理

- `verification-before-completion/SKILL.md:161-167` 删「validate 自动写 marker」块,由桥接段「Read verify.md 完整执行」取代。
- `ack-confirm.md:20` 改为 §5.1 修复后的准确描述。
- `using-forge/SKILL.md:125` 改写为如实描述;`:113-125` tier 表见 §6(拆两列)。
- 同步修正模板副本(改根 `skills/` 后必跑 `pnpm build`,`AGENTS.md:33/40`)。

### 5.1 forge-core 修复 —— `forge ack confirm` 写 marker ack 字段 + ack-log finding_hash

**问题**(§0.5):`forge ack confirm`(`ack.ts:203-231`)(a) 不写 marker ack 字段,(b) ack-log entry `finding_hash` 写死 `null`(`ack.ts:213`)→ archive 的 `verify-findings-fence` 与 `ack-log-consistency` 两道 fence 都过不了。

**`forge ack confirm` 扩展逻辑(4 步):**

**步骤 1 —— 读 pending**:读 pending payload 取 `action` + `finding_id`(`ack.ts:99-109` payload 已含这两项)。

**步骤 2 —— 按 action 分发表定位并改写 marker**:

| action | 目标 marker → 字段 | 写入字段 | finding_hash 处理 |
|---|---|---|---|
| `ack-warning` | `.verify-passed` → `verify_findings[finding_id]` | `severity_acked_by=<user>`、`severity_acked_at=<ISO>` | finding 8 字段 payload 不含 ack 字段 → marker finding 既有 `finding_hash` 不变;ack-log entry 写 `computeFindingHash(extractHashPayload(f))` |
| `ack-pause-warning` | **`.verify-passed` 与 `.review-passed` 双 marker** → `pause_decisions[finding_id]` | 两 marker 同一 pause decision 同步写 `severity_acked_by`/`severity_acked_at` | pause decision 无 `FindingHashPayload`,ack-log entry `finding_hash=null`;consistency 靠 `action + finding_id=pause_decisions:<id> + user`(`ack-log-consistency.ts:170-200`)。两 marker 写值一致(`archive.ts:464/478/511/518` 双侧校验) |
| `downgrade`(**仅 `WARNING → SUGGESTION`**) | `.verify-passed` → `verify_findings[finding_id]` | `downgrade_acked_by=<user>`、`downgrade_rationale`、`downgraded_from=WARNING`、`severity=SUGGESTION` | `severity` 是 8 字段之一 → 改后**重算 finding `finding_hash`**,marker finding 用新 hash;ack-log entry 写新 hash 作审计字段(`ack-log-consistency.ts:150-154` 当前只校 downgrade entry 存在、不比 hash,本设计**不扩**该 fence)。**目标 finding 当前 `severity==='CRITICAL'` → confirm exit 2,不改 marker、不写 ack-log**(CRITICAL 无 ack 路径,`verify-findings-fence.ts:45-56` 拒签不分 automated) |
| **其余所有 action**(`ack-mode` / `ack-tdd-exemption` / `resign-c-simcode` / `ack-critical` / 任意未列字符串) | confirm 不改 marker | 仅 append ack-log(= forge 现状行为,本次不动) | `finding_hash=null` |

**步骤 3 —— ack-log entry `finding_hash`**:取代 `ack.ts:213` 写死的 `null` —— 仅对「定位到 marker finding」的 action(`ack-warning` / `downgrade`)算 hash 写入(`downgrade` 用改 severity 后的值);其余 action 的 ack-log entry `finding_hash=null`。

**步骤 4 —— user 一致性**:marker `severity_acked_by` 与 ack-log entry `user` 同值(`ack-log-consistency.ts:138` 要求)—— 同次 confirm 用同一 `user`。

#### 5.1.1 非 severity-ack action 的处理(行为不变 + 不做白名单回归)

本次 §5.1 改动**只对 `ack-warning` / `ack-pause-warning` / `downgrade` 三个 severity-ack action 新增 marker 写入**。其余所有 action —— `forge ack confirm` **保持 forge 现状行为完全不变**(仅 append ack-log + 删 pending),本次不新增也不删除任何行为。这些 action 各自的既有数据流**不在本改动 scope**:

- `ack-mode`:由 `forge evidence record-tdd` 写 staging 的 `process_verification_mode_acked_by/at` → `freeze` 投影进 `marker.process_evidence`(`evidence.ts:692-724`),archive 不变量 12 读 marker 字段(`process-evidence-fence.ts:444-451`)。
- `ack-tdd-exemption`:archive 不变量 11 直接查 ack-log 是否有 `action=ack-tdd-exemption` entry(`process-evidence-fence.ts:415-441`)。
- `resign-c-simcode`:`forge upgrade --resign-markers` 重跑读 ack-log 改 `review_outcomes`。
- `ack-critical`:CRITICAL 无 ack 路径,archive 强拒签不因 confirm 改变。

confirm 的**「append ack-log」分支对所有 action 一律执行**,不做 action 白名单拒绝(否则未来新增 / 未列 action 会被 confirm 拒掉而回归)。仅「写 marker」分支是步骤 2 表中 3 个 severity-ack action specific。

#### 5.1.2 marker / finding 缺失的 fail-closed

`ack-warning` / `ack-pause-warning` / `downgrade` 三个 marker-writing action,confirm 时若目标 marker 文件不存在、或 marker 内无对应 `finding_id` 的 finding / pause_decision → **exit 2,不 append ack-log、不删 pending**(半成功状态比静默放行更安全)。

说明:apply 中段 marker 尚未生成(`commands/apply.md:120`:pause 决策在 verify/review 阶段才迁入 marker),故这三个 action 的 confirm 只应在 verify/review marker 已存在后触发;桥接段的 ack 硬门槛已置于 verify/review 之后。

#### 5.1.3 `ack-pause-warning` 的 finding_id namespace 修复

pause warning 的 finding id 形态是 `pause_decisions:<id>`(`ack-log-consistency.ts:170-183` 要求该字面),含 `:`(Windows 文件名非法)。而当前 pending 文件名正则 `PENDING_FILE_RE` 只接受 `\d+`(`ack-log.ts:99`),`getPendingPath` 直接把 findingId 拼进文件名(`ack-log.ts:151-158`)→ `ack propose --action ack-pause-warning --finding pause_decisions:1` 写出的 pending 文件无法被 `confirm` 的 `listPending` 找到。这是 ack 子系统既有断点,§5.1 一并修:

1. **finding id 取值域**:`forge ack propose --finding` 接受 `\d+`(普通 finding)或 `pause_decisions:\d+`(pause warning)两种形态 —— `PauseDecision.id` 是 `number` 类型(`markers/types.ts:70-72`),不存在任意字符串 / 非 ASCII / 含 `-` 的 id,无需处理。
2. **pending 文件名语法**(写死,消除歧义):`getPendingPath` 写 `encodeURIComponent(findingId) + '-' + safeTimestamp + '.yaml'`。`encodeURIComponent('pause_decisions:1') = 'pause_decisions%3A1'`(不含 `-`);纯数字 id `encodeURIComponent` 后不变。
3. **解析正则**(从右锚定 timestamp):`PENDING_FILE_RE` 改为 `^(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)\.yaml$` —— timestamp 段(`safeTimestamp` 即 ISO `:`→`-` 后形态,`ack-log.ts:153`)精确锚定在右侧,group 1 = encoded findingId。`listPending` 对 group 1 做 `decodeURIComponent` 还原 `PendingItem.findingId`。**向后兼容**:纯数字旧 pending 文件名 group 1 仍是纯数字,新正则照常匹配。
4. `ack-pause-warning` confirm 定位 marker 时 strip `pause_decisions:` 前缀,按 `PauseDecision.id` 在 `.verify-passed` + `.review-passed` 双 marker 查找。
5. ack-log entry 的 `finding_id` 写回原始 `pause_decisions:<id>` 字面(`ack-log-consistency.ts:178-182` 对 pause ack 是直接字符串比较 `pause_decisions:${p.id}`,故必须写回原始字面)。

> **影响面**:仅 `ack-log.ts` 的 pending 文件三函数(`getPendingPath` / `listPending` / `PENDING_FILE_RE`),它们 ack-only(evidence helper 不产 pending 文件)。

#### 5.1.4 事务与幂等

confirm 执行顺序 —— ① 读 pending + 目标 marker(s) → ② 计算 ack entry(含 finding_hash)+ marker 改写后内容 → ③ 备份 marker → ④ tmp+rename 原子写 marker(双 marker 逐个)→ ⑤ append ack-log → ⑥ 删 pending。

- ④/⑤ 失败:marker 有备份可回滚;pending 未删 → retry 重跑。
- **幂等**:retry 前扫 ack-log,若已有同 `change_id`+`finding_id`+`action`+`user`+`finding_hash` entry → 跳过 append;marker 写为设同值,天然幂等。`ack-pause-warning` 的幂等 key 用原始 `finding_id` 字面(`pause_decisions:<id>`)。
- 半成功状态(marker 写了 ack-log 没写 / 反之)会被 archive fence 检出报错(非静默 corruption),retry 幂等收敛。

#### 5.1.5 安全性

`severity_acked_by`/`_at`/`downgrade_*` 不在 marker `content_hash`(=`sha256(proposal+specs+design)`,archive 重算的是内容文件 `archive.ts:359/369`);`ack-warning` 不改 8 字段 payload,`finding_hash` 稳定;仅 `downgrade` 改 `severity` 需重算,已在步骤 2 表中处理。

#### 5.1.6 配套

- `ack-confirm.md:20` 文本同步为准确描述。
- 更新 `forge ack propose/confirm/reject` 的 `--finding` / `<findingId>` CLI help 文本(`ack.ts:56/137/242` 现写「数字字符串」)与 `docs/cli-reference.md`,描述改为 `<number> | pause_decisions:<number>`。
- 补 CLI 单测:各 action confirm 后 marker + ack-log 一致、archive fence 通过、`downgrade` 重算 hash、双 marker 同步、retry 幂等、`ack-pause-warning` 全链 propose→confirm→archive、pending 文件名编码 round-trip、纯数字 id 向后兼容。

## 6. 文档改动

- `README.md` / `docs/installation.md` —— 版本号订正到当前线;tier 表见下。
- `docs/codex-install.md` / `docs/opencode-install.md` —— Workflow 段重写;删已不成立的 "Tier 2/3 ship 限制" 条目。
- **harness 表拆两列**:「slash command 注册」列 Tier 2/3 仍 ❌(事实不变);新增「workflow bridge」列 ✅ best-effort。不写「与 Claude Code 等价」。
- 计数统一:18 skill / 10 slash 命令 `.md` / 17 CLI 顶层子命令(以 `src/cli/index.ts` 注册数为准 —— 当前 17 个含 `pause-capture`;README:137 误写 14)。
- 版本号 5 处同步(`package.json` + `.claude-plugin/plugin.json` + `.codex-plugin/plugin.json` + `.claude-plugin/marketplace.json` + `run-forge.mjs` REQUIRED_RANGE)。

## 7. Scope 边界(明确不做)

- stage-extensions(codex review / adversarial)维持 Tier-1 —— 桥接段跳过。
- `/forge:upgrade` 已是纯 CLI,无需桥接。
- `/forge:ack-confirm` 不单独桥接 skill,verify/review 桥接段内联其等价流程(§4 + §5.1)。
- `/forge:explore` → `exploring` skill 已存在;writing-plans 阶段确认 `explore.md` 命令层协议。
- `brainstorm` —— `brainstorming` skill 覆盖核心 draft 产物,不覆盖 `commands/brainstorm.md:39` 的 Tier-1 stage-extension hook。
- `model_tiers` Claude-only —— 已知接受限制,不动。

## 8. Build / Test / 版本

- 改 `skills/` 后必跑 `pnpm build`(反向同步 `src/core/templates/` + `dist/`)。
- 新增测试:
  - **结构断言**:5 个 stage skill 各含桥接段且指向正确 `commands/<stage>.md`;`_shared/tier23-command-bridge.md` 存在且含「执行上下文 forge token」替换规则。
  - **`bridge-protocol-fixture`**:构造含 WARNING finding 的 change,跑 propose→apply→review→verify→ack→archive 桥接产物链,断言最终 `forge archive` 真实 exit 0。**测试范围诚实声明:验证「桥接协议产物若按清单生成,则 CLI/fence/产物链可通过」;不测模型遵从度(后者靠 eval / 人工 harness spike)。**
  - **§5.1 CLI 单测**:见 §5.1.6。
- 本地 5 命令(`typecheck`/`lint`/`format:check`/`build`/`test`)全绿。
- 版本:feature 增量 → minor bump(v3.0.0 → v3.1.0),5 处同步 + CHANGELOG。

## 9. 已知残余风险(非 blocking)

桥接机制本质是「行为提示」,依赖 Tier 2/3 模型遵从度;§2 三层缓解降低但不消除该风险。`using-forge` 红旗清单加一条「Tier 2/3 下不得跳过 Read 命令文件」。这是非代码协议风险,Codex 9 轮审查后判定不属于 blocking 设计漏洞。

---

## 附录 A:Codex 对抗性审查收敛记录

本设计经 brainstorming 出初稿后,提交 Codex(gpt-5.x-codex)对抗性审查 9 轮(8 轮草案 + 1 轮正式终稿)。每轮 finding 均由 Claude Code 独立对照代码核实(不把 Codex claim 当结论),累计 R1-R31 修订,**0 误报**。收敛轨迹:

| 轮次 | CRITICAL | MAJOR | MINOR | 焦点 |
|---|---|---|---|---|
| 1 | 1 + claim 订正 | 3 | 2 | 桥接机制 + verify→archive 断链 |
| 2 | 1 | 3 | 2 | §5.1 ack 是 forge-wide bug |
| 3 | 1 | 4 | 2 | §5.1 finding_hash / 双 marker / downgrade / 事务 |
| 4 | 0 | 2 | 2 | §5.1 action 覆盖 |
| 5 | 0 | 1 | 1 | §5.1 ack-mode 数据流 |
| 6 | 0 | 1 | 0 | §5.1 ack-pause-warning finding_id namespace |
| 7 | 0 | 1 | 1 | pending 文件名正则精度 |
| 8 | 0 | 0 | 0 | ✓ 草案收敛 |
| 9 | 0 | 0 | 1 | 正式终稿重组核实;CLI 计数漂移(已修) |

**修订条目(R1-R31)**:

- **第 1 轮(R1-R8)**:R1 marker 生命周期订正;R2 record/freeze 硬门槛;R3 裸 forge 替换;R4 可靠性缓解+措辞;R5 路径 fail closed;R6 ack 内联;R7 计数;R8 brainstorm scope。
- **第 2 轮(R9-R14)**:R9 §5.1 forge-core ack 修复;R10 apply 补 record-tdd;R11 替换规则任意位置;R12 FORGE_PLUGIN_ROOT;R13 tier 表拆列;R14 brainstorm 不覆盖 stage-extension。
- **第 3 轮(R15-R21)**:R15 ack-log finding_hash 绑定;R16 ack-pause-warning 双 marker;R17 downgrade 专属字段 + 重算 hash;R18 事务 + retry 幂等;R19 绝对路径字面值;R20 替换规则限定执行上下文;R21 fixture 改名 + 诚实声明。
- **第 4 轮(R22-R25)**:R22 补 `ack-mode`/`ack-tdd-exemption` + 不做白名单回归;R23 downgrade 严格限定 WARNING→SUGGESTION;R24 ack-pause-warning finding_hash=null;R25 downgrade hash 为审计字段。
- **第 5 轮(R26-R27)**:R26 非 severity-ack action 的 confirm 保持现状、数据流不在 scope;R27 marker/finding 缺失 fail-closed。
- **第 6 轮(R28)**:R28 finding_id namespace 修复(pending 文件名编码)。
- **第 7 轮(R29-R30)**:R29 写死 pending 文件名语法 + 从右锚定 timestamp 的精确正则;R30 CLI help 描述更新。
- **第 8 轮**:0 finding,草案收敛。
- **第 9 轮(R31)**:R31 核实 `src/cli/index.ts:34-82` 实际注册 17 个 CLI 子命令(含 `pause-capture`),AGENTS.md 旧值 16 漏计 → §6 计数 16 改 17、改为「以 `src/cli/index.ts` 为准」。
