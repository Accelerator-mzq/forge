# Plan 9j — marker version + deprecation(`created_by_tool_version` + `--resign-markers` + legacy 精确豁免 + version retrograde fence)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。沿 plan-9c / plan-9e1 同模式,**不必 invoke `forge:writing-skills`**(本 plan 不是新 skill 开发);走标准 TDD/SDD。

**Goal**:落地 v1.0 §3.4 *marker version + deprecation 完整协议* — marker schema 加 `created_by_tool_version` + `resigned_by_tool_version` semver 字段(超集兼容,老 marker 缺等价 `<1.0.0`);`forge upgrade --resign-markers <changeId>` **option** flag(对齐 spec line 1763 + master line 503 冻结,不是 subcommand)一次性升级 v0.4 marker 到 v1.0(简码 S/L 自动映射 + C 走 ack.ts propose/confirm 协议交互式询问 / 不自动填空 process_evidence/verify_findings/pause_decisions 改标 `process_evidence_unavailable_legacy: true`);archive.ts 加 legacy 精确豁免表(13 不变量中 #1-8/10/13 跳过,**#9/11/12 保留 + 反向加固**)+ version retrograde fence(git history 检查 + **resigned-aware 互斥**:`legacy=true ⊥ (created_by_tool_version >= 1.0.0 且 resigned_by_tool_version 缺失)`,沿 v2 选项 C)+ exit code 对齐 master §3.12.3(0/1/2 三档,沿 NIT 二轮 #10)。

**Architecture**:五层 — (1) **Marker schema 层**:`src/core/markers/types.ts` 四 marker interface 加 `created_by_tool_version?: string` + `resigned_by_tool_version?: string` 字段(superset additive,老 marker 缺等价 `<1.0.0`);`src/core/validate/marker-schema.ts` 加 `checkSemverString` helper(沿 ARCHIVE_SUMMARY_SEMVER_RE 同模式)+ 四 schema 分支 optional 字段校验。 (2) **Upgrade CLI 层**:`src/cli/commands/upgrade.ts` 加 `.option('--resign-markers <changeId>', ...)` flag(option 形态对齐 spec line 1763 + master line 503 冻结);`src/core/upgrade/resign-markers.ts` 模块化实施(SCAN markers → 简码映射 → C 简码真调 ack.ts CLI → stash → writeFile → ack-log resign 行 → 失败 restore stash);**不自动填空数组字段**(填空=工具帮 AI 伪造证据,违反 AI 反向加固) — 改标 `process_evidence_unavailable_legacy: true` meta 字段。 (3) **Archive legacy 豁免层**:`src/core/archive/legacy-exemption.ts` 模块(沿 plan-9d verify-findings-fence.ts / plan-9c pause-decisions-fence.ts 同模式)— `validateLegacyExemption(marker, processEvidence?)` 函数,按 13 不变量精确豁免表(design §3.4.4.1)裁决;**`legacy=true ⊥ (created_by_tool_version >= 1.0.0 且 resigned_by_tool_version 缺失)` 互斥校验**(原生 v1.0 marker 不允许 legacy 标记;resigned 后 marker 允许 legacy + version 共存,沿 v2 选项 C)。 (4) **Archive version retrograde fence 层**:`src/core/archive/version-retrograde-fence.ts` 模块 — `validateVersionRetrograde(markerPath, marker, gitDir?)` 函数,扫 `git log -p <marker-file>` 历史中 `created_by_tool_version` 字段值,若历史最高值 > 当前值则视为 tamper 拒签;non-git 用 `git rev-parse --is-inside-work-tree` 区分,git error 在 git repo 内 fail-closed(沿 v3 MAJOR 1)。 (5) **archive.ts 集成 + CLI 测试层**:archive.ts 步骤 3.4(在 verify-findings fence 之前)插入 `validateLegacyExemption` + `validateVersionRetrograde` 两 fence 调用;`commands/upgrade.md` 加 §"--resign-markers 用法" 段;fixture 含三类 marker 情景(archived old / active old / new)+ 'C' 简码交互式 propose/confirm 流真实样本。

**Tech Stack**:Node 20+ / TypeScript ESM / commander 12 / `yaml` v2 / vitest / `@anthropic-ai/sdk`(plan-9d 已用,本 plan 不直接调)/ 现有 `src/core/schemas/severity.ts`(9a Severity / Finding)+ `src/core/markers/types.ts`(9c/9d/9e1 已扩 marker 字段,本 plan 沿 superset additive 模式加 `created_by_tool_version?` 第 5 个 optional 字段)+ `src/core/ack-log.ts`(9a propose/confirm + ackEntry)+ `src/cli/commands/ack.ts`(9a 现状 propose/confirm/reject 三子命令,本 plan resign-markers 调 propose 路径)+ `src/cli/commands/upgrade.ts`(v0.3 现状 258 行 SCAN→DIFF→ASK→STASH→VERIFY→COMMIT 阶段事务,本 plan 加新 `--resign-markers` option flag 不动既有 legacy-adapter 清理流)+ `src/cli/commands/archive.ts`(plan-9e1 已扩,本 plan 步骤 3.5 插入新 fence)。**不引入新 npm 依赖**。

**Spec 引用**:
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §3.4 全节(§3.4.1 marker `created_by_tool_version` 字段 / §3.4.2 三类 marker 情景 deprecation 路径 / §3.4.3 字段 deprecation 表 / §3.4.4 `--resign-markers` 行为 / §3.4.4.1 legacy 精确豁免表 / §3.4.4.2 sunset policy / §3.4.4.3 version retrograde fence + hash 关系)+ §2.3.5 简码迁移(C 不自动映射,走 propose/confirm)
- master plan §3.10(plan-9j 概览 P50 2.5 / P90 3.5;BLOCKER #2 修订:从 9z release 分出独立 phase)+ §3.12.1bis(marker 字段冻结 — `created_by_tool_version` 已在 9j 范围)+ §3.12.3 CLI exit code 冻结(`forge upgrade --resign-markers` 0/1/2 三档)+ master §6 修订记录(plan-9e1 v3.1 已加;本 plan 收敛后由 Task 6.1 Step 6.1.6 加 v3.2)
- plan-9e1 v12 cross-plan reflection:plan-9e1 fence C 简码硬墙 → 9j `--resign-markers` 是唯一合规出口(commands/archive.md / three-level-fence.ts 已明示;9j 落地后用户工作流解锁)

**P50 工日**:**4.8**(v2-v6 codex 累计 5 轮 review 修订采纳;v1 2.7 → v2 +2.1d 主要在 Task 2 重写 option 形态 + 真调 ack CLI + stash/rollback + 新增 Task 6 cross-plan;v3-v6 工日不变,仅文档闭环修订);**P90 工日**:**6.3**(P50 + 1.5d buffer ~ 31%;沿 §10 工日表 Task 6 P90 0.7 合计闭合)

**v8 → v9 关键修订**(codex 8 轮 review 0 BLOCKER + 2 MAJOR + 2 MINOR 部分采纳;**0 BLOCKER 已 2 连**;MAJOR 1 评估为 codex 误读 — markdown 文件本该 markdown fenced;sha256:placeholder 是 e2e helper 设计 非占位符):
- **MAJOR 1(误读修正 + 注脚补)**:codex 评 Step 3.5 "6 个 fenced 应全 yaml" — 误读,markdown 4 个文件本就 markdown fenced;.verify-passed/.review-passed 已是 yaml fenced ✓。**v9 修订**:.verify-passed marker 段 sha256:placeholder 加注脚 "e2e setupFixture helper 运行时重算填" 沿 plan-9c/9e1 同模式
- **MAJOR 2**:Task 1 Files 列表 line 281 改 `12 case` → `14 case`,line 279 加 `resigned_by_tool_version?: string` 字段;line 280 加"两个 version 字段调用"
- **MINOR 1**:line 13 引用 "本 plan v12 收敛后再加 v3.2" → "本 plan 收敛后由 Task 6.1 Step 6.1.6 加 v3.2"(版本号不写死)
- **MINOR 2**:commands/archive.md 段 line 2540 "plan-9j v2 完成后" → "plan-9j 落地完成后"(版本号不写死)

**v7 → v8 关键修订**(codex 7 轮 review 0 BLOCKER + 2 MAJOR 全采纳;**0 BLOCKER 首次出现** — 主体收敛,仅文档清理):
- **MAJOR 1**:Task 5 Step 4.2 release-gate 预期值 5 → **6**(对齐 Task 4 Step 2.2 加 it.todo 后的 EXPECTED_TODO_COUNT_SOFT)
- **MAJOR 2**:Task 5 Step 3.5 为 `resign-c-simcode-with-confirm` fixture 补完整 YAML fenced 字面(proposal.md / design.md / tasks.md / specs/x.md / .verify-passed / .review-passed 全 6 文件),implementer 可直接复制

**v6 → v7 关键修订**(codex 6 轮 review 1 BLOCKER + 2 MAJOR + 1 NIT 全采纳):
- **B1(NEW)**:`resignChangeMarkers` + `resignOneMarker` 函数签名加 `forgeCliPath: string` 参数;caller line 1205 调用 `proposeForCSimcode(forgeCliPath, ...)` 而非 `changeDir`;upgrade.ts action handler 用 `process.argv[1]` 推 dist/cli/index.js 真路径
- **MAJOR 1(NEW)**:Task 4 case 7 name/body 名实对齐 — 改为 "非 git path best-effort 真实测";真 git repo 内 fail-closed 留 it.todo(9z release plan 解锁);Task 4 case 数 `7 PASS + 1 it.todo`;release-blocker gate `EXPECTED_TODO_COUNT_SOFT` 5 → 6 同步
- **MAJOR 2(NEW)**:Task 5 加 Step 3.5 创建 `resign-c-simcode-with-confirm` fixture 内容字面(沿 plan-9e1 fixture 同模式 — 4 件套 + .verify-passed 缺字段 + .review-passed C 简码)
- **NIT 1(NEW)**:删 v5→v6 修订摘要中辩护性措辞("合规" / "估算过乐观" 等),保留事实型描述

**v5 → v6 关键修订**(codex 5 轮 review 2 BLOCKER + 4 MAJOR + 4 MINOR + 1 NIT 全采纳):
- **B1**:Task 2 `proposeForCSimcode` 函数从自写 pending YAML 改为**真 spawn `forge ack propose`** CLI(沿 9a 协议);旧 helper 注释保留供历史叙事
- **B2**:Task 2 resign-markers.ts import 补齐 `mkdir, copyFile, rm`(node:fs/promises)+ `basename`(node:path),修正 typecheck 错
- **MAJOR 1**:Task 1 Step 3.5.3 字面补丁完整化 — 给完整 `validateThreeLevelFence` 函数体(含 import / 参数 / return / `for` 循环);明示替换范围(plan-9e1 现状 ~ line 65-105)
- **MAJOR 2**:Task 4 +1 case 凑 7(fail-closed git error case;非 git path best-effort 验证);commit message + Step 2.2 同步 7 PASS
- **MAJOR 3**:Task 5 fixture 4 → 5 + e2e 4 case → 5 case;commit message 同步;Step 4.1 描述补完整 C confirm 流程
- **MAJOR 4**:commands/upgrade.md 嵌入段 line 2243 互斥规则改 resigned-aware
- **MINOR 1**:DoD 加 `resigned_by_tool_version?` 字段 + 互斥规则改 resigned-aware
- **MINOR 2**:Task 3 red 预期 15 ERROR → 17 ERROR
- **MINOR 4**:commands/upgrade.md argument-hint 从 `<sub-command>` 改 `[--resign-markers <changeId>] [...]` option 形态
- **NIT 1**:Header P90 6.0 → 6.3(对齐 §10 工日表合计 6.3)
- MINOR 3 注释残留:v6 修订摘要段(line 1466 等)引用旧规则,属历史叙事,plan 字面已统一

**v4 → v5 关键修订**(codex 4 轮 review 5 BLOCKER + 3 MAJOR 全采纳;**5 BLOCKER 仍是 REGRESSION + 系统性扫漏**(v4 改了一部分但 Header Goal/Architecture + Task 2 case + Task 3 Step+commit + §8 编号没全改);v5 系统性收尾):
- **B1(REGRESSION)**:Header Goal(line 5)/ Architecture(line 7)/ File Structure(line 175)/ Task 2 Step 1.2 spawn 描述(line 910)/ resign-markers.ts 代码注释 — 全改"子命令"→ "option flag"
- **B2(REGRESSION)**:Task 2 字面 +2 case(8 → **10**):case 9 = 原 marker 含 `created_by_tool_version=0.4.0` → resign 后 created 保留 0.4.0(B3 字面 expect);case 10 = C 简码 pending file 数字 findingId 跨平台兼容
- **B3(REGRESSION)**:Task 2 字面已有 case 1 加 `expect(review.created_by_tool_version)` 断言(B2 case 9 完整覆盖)
- **B4(REGRESSION)**:Task 1 Step 3.5 字面补丁完整化 — three-level-fence + summary-builder collector1/2 给出可粘贴 TS 字面(不再 prose 占位 + 不留 implementer 自补)
- **B5(REGRESSION)**:Task 3 Step 2.2 预期 → 17 case;commit message → 17 case + resigned-aware 互斥 + process_evidence fail-closed
- **MAJOR 1(NEW)**:`## 8` 编号冲突修(`### 8.0` → `### 8.1` + 后续 `### 7.1-7.4` → `### 8.2-8.5`;`## 8. Self-Review` → `## 9.`;`## 9. 工日核算` → `## 10.`)
- **MAJOR 2(REMAINING)**:File Structure "不修改文件" 列表移除 three-level-fence + summary-builder + ack-log + ack.ts(沿 v5 修订标 freeze 例外)
- **MAJOR 3(REMAINING)**:顶层 Goal/Architecture 互斥规则改 resigned-aware(原 `legacy=true ⊥ version>=1.0.0` → `legacy=true ⊥ (created>=1.0.0 且 resigned 缺失)`)

**v3 → v4 关键修订**(codex 3 轮 review 5 BLOCKER + 4 MAJOR + 1 MINOR 全采纳;**5 BLOCKER 全是 REGRESSION**(v3 修订只动了一部分代码块);v4 系统性扫全文修):
- **B1(REGRESSION)**:8 处 `forge upgrade resign-markers` subcommand 字面残留全改 option 形态 `forge upgrade --resign-markers`(commit message + commands/upgrade.md + e2e spawn + Step 1.2 段)
- **B2(REGRESSION)**:Task 1 字面真补 +2 case(`resigned_by_tool_version` 合法 + 拒签)+ 4 marker interface 加 `resigned_by_tool_version?: string` 字段 + marker-schema 加第二个 `checkSemverString` 调用
- **B3(REGRESSION)**:Task 2 测试断言改 `created_by_tool_version` 保留 + `resigned_by_tool_version=1.0.0`;resignOneMarker 内 "already resigned" 判定改 `resigned_by_tool_version` 字段存在性(沿 v2 选项 C)
- **B4(REMAINING)**:Task 1 加新 Step 3.5 plan-9e1 4 文件同步补丁(types.ts ReviewOutcome union 扩 + marker-schema REVIEW_OUTCOME_SEVERITY_CODES 扩 + three-level-fence simcode+全名双格式 + summary-builder collector2 全名映射)
- **B5(REGRESSION)**:Task 3 字面真补 +2 case(resigned-aware 允许通过 + process_evidence fail-closed)case 数 15 → 17
- **MAJOR 1(NEW)**:Task 6.1 加 Step 6.1.6.5 cross-plan 修订 rollback 指南(Case A 未 commit `git restore` / Case B 已 commit `git revert`;禁 reset --hard / push --force)
- **MAJOR 2(NEW)**:Task 6 commit message 加 "9a interface freeze 例外" 字样 + Step 6.1.5 加显式声明
- **MAJOR 3(NEW)**:plan §8.0 新增 v0.4 native marker 语义边界条款(沿 design §3.4.2 三类 marker 路径,v0.4 native 不被 9j 拦,走 strict path + 9e1/9d/9c 现有 fence superset additive 兼容)
- **MAJOR 4(NEW)**:resignOneMarker 函数签名加 `forgeRoot: string` 参数;stash 路径从 `join(changeDir, '..', '..', '.cache', ...)` 改 `join(forgeRoot, '.cache', ...)`(沿 upgrade.ts:95 同模式,避免 .. 跳出)
- **MINOR 1(误报)**:codex 第 3 轮报"docs/master.md / docs/design.md 简写引用错误",grep 确认 plan 实际用全路径,无残留

**v2 → v3 关键修订**(codex 2 轮 review 8 BLOCKER + 3 MAJOR + 1 NIT 全采纳;**8 BLOCKER 全是 REGRESSION** — v2 修订仅 Header 声明,代码块字面未更新;v3 全部代码块字面真改):
- **B1(REGRESSION)**:Task 2 Step 2.2 代码块从 `.command('resign-markers')` 真改为 `.option('--resign-markers <changeId>', ...)` + `.action(opts => if (opts.resignMarkers) { ... })` 主 action 体内分支
- **B2(REGRESSION)**:Task 2 resignOneMarker 内 `marker.created_by_tool_version = cliVersion`(覆写)→ **保留 created_by_tool_version 不变 + 加 `marker.resigned_by_tool_version = cliVersion`**(沿 v2 选项 C);Task 3 互斥规则代码块改 `legacy=true ⊥ (created>=1.0.0 且 resigned 缺失)`
- **B3(REGRESSION)**:Task 1 字面代码块加 +2 case(`resigned_by_tool_version` 字段合法 / 拒签);新 Task 1 注释段标 plan-9e1 已落代码 four 文件同步改(types.ts ReviewOutcome union + marker-schema REVIEW_OUTCOME_SEVERITY_CODES + three-level-fence simcode 双格式 + summary-builder 全名映射)
- **B4(REGRESSION)**:Task 2 resignOneMarker 内 `findingId = 'review-outcome:${outcomeIndex}'` → **`String(outcomeIndex)`**(数字索引避免 Windows 路径冒号);加 Task 6.1 ack.ts 扩 `--target-severity` flag(让 plan v3 ack.ts 真扩,而非 plan 声明 implementer 自己加)
- **B5(REGRESSION)**:Task 2 resignOneMarker 主流程加 **stash → writeFile → ack-log → 失败 restore stash** 阶段事务(沿 upgrade.ts:95 STASH 同模式);copyFile + 失败时 restore + rm stash 清理
- **B6(REGRESSION)**:Task 3 legacy-exemption 字面代码块加 **process_evidence 字段反向加固**(legacy=true + process_evidence 整字段 → 拒签);case 数 15 → 17
- **MAJOR 1 = B6 retrograde(REGRESSION)**:Task 4 version-retrograde-fence catch `return ok()` → **fail-closed return failed**(git repo 内 git log 失败视为 tamper);加 `git rev-parse --is-inside-work-tree` 区分 non-git vs git error;case 6 → 7
- **MAJOR 1(NEW)**:Task 6.1 多文件 rollback 指南 — 实施 Task 6.1 spec/master/ack.ts/commands 修订时若中途失败,**回滚指南**:`git restore docs/specs/... docs/plans/... src/cli/commands/ack.ts`(只要未 commit,简单);若已 commit,需要 revert commit 重新整合
- **MAJOR 2(NEW)**:9a interface freeze 例外声明 — `ack.ts` / `AckEntry` interface 是 9a 锁死,Task 6.1 扩 `--target-severity` flag + `resign-c-simcode` action 是**显式 9a freeze 例外**(plan 头部声明 + commit message 注明 "Task 6.1 cross-plan 修订 — 9a freeze 例外,沿 plan-9j v2 BLOCKER 4 + plan-9e1 v5 选项 C 同模式")
- **MAJOR 3(NEW)**:v0.4 native marker 语义边界(无 legacy + 无 resigned + created 缺失/<1.0.0)— plan §7.x 加显式条款:"v0.4 native marker(无 legacy=true)走 strict path,不被 9j legacy-exemption 拦;但 archive 主路径会按 marker schema + 9d/9e1 现有 fence 处理 v0.4 字段缺失情况(沿 plan-9e1 superset additive 兼容)"
- **NIT 1**:§9 工日表 Task 6 P90 0.4 → 0.7(P90 不应 < P50,数字填反);合计 P90 6.0 → 6.3
- **B7 / B8 同 B3 / Task 5 fixture +1**:已在 Task 5 修(5 fixture / 5 case 含 resign-c-simcode-with-confirm 完整 e2e 链)

**v1 → v2 关键修订**(codex 1 轮 review 6 BLOCKER + 3 MAJOR + 3 MINOR + 2 NIT 全采纳;**BLOCKER 数量超 plan-9e1 v1 5 / plan-9c v1 5**,v1 写得快漏洞多;user 选方案 2 加 `resigned_by_tool_version` 新字段区分 created vs resigned):

- **BLOCKER 1(NEW)**:plan v1 line 856 写 `.command('resign-markers')` subcommand 形态,**与 spec line 1763 / master line 503 冻结的 option 形态 `forge upgrade --resign-markers <changeId>` 偏离**。v2 修订:Task 2 改为 option 形态 — `cmd.option('--resign-markers <changeId>', '...').action(...)` 在 buildUpgradeCommand 主 action 体内分支处理(沿 v0.3 现有 `--recover` / `--gc` 同模式);commands/upgrade.md 用法段同步
- **BLOCKER 2(NEW,spec 自身不一致)**:spec line 1767 要 resign 加 `created_by_tool_version=1.0.0`;spec line 1772 要改标 `legacy=true`;**但 spec line 1800 写 `legacy=true ⊥ version>=1.0.0 互斥`** — resign 产物会被自己 fence 拒签,协议自相矛盾。**v2 修订(user 选方案 2)**:
  - **spec / master 加新字段 `resigned_by_tool_version: string`**(标 resign 时机),`created_by_tool_version` 保留**原 v0.4 值**(不写 1.0.0)
  - 互斥规则改:`legacy=true ⊥ (created_by_tool_version >= 1.0.0 且 resigned_by_tool_version 缺失)` — **v1.0 原生** marker 不允许 legacy 标记;**resign 后** marker(`resigned_by_tool_version` 存在)允许 legacy=true
  - Task 6 加 cross-plan 修订 spec §3.4.1 / §3.4.4 / §3.4.4.1 + master §3.12.1 + commands/archive.md 同步
- **BLOCKER 3(REMAINING)**:现状 marker-schema.ts:336 `REVIEW_OUTCOME_SEVERITY_CODES = ['S','C','L']` + types.ts:112 `severity: 'S' \| 'C' \| 'L'` + three-level-fence.ts:89 校验 S/C/L — **resign 后 severity=CRITICAL 全名写回 marker 会被 schema step 2a 直接拒签**。**plan-9e1 遗漏**(plan-9e1 v4 BLOCKER 1 修了 fence C 简码拒签,但没扩 schema 接受全名)。v2 修订:9j 范围扩展同步改 4 个文件:
  - `src/core/markers/types.ts:112` `ReviewOutcome.severity` 改为 `'S' \| 'C' \| 'L' \| 'CRITICAL' \| 'WARNING' \| 'SUGGESTION'`(union 扩 — superset additive 兼容老 marker)
  - `src/core/validate/marker-schema.ts:336` `REVIEW_OUTCOME_SEVERITY_CODES` 同步扩(简码 + 全名双格式)
  - `src/core/archive/three-level-fence.ts` C 简码硬墙保留(沿 plan-9e1 v4 BLOCKER 1);S 简码 / L 简码 + 全名 CRITICAL/WARNING/SUGGESTION 同表裁决
  - `src/core/archive/summary-builder.ts` collector1/2 对全名严格按 design §2.3.5 处理(WARNING/SUGGESTION resolved=false 进 handoff)
- **BLOCKER 4(NEW,严重)**:C 简码 propose 协议 plan v1 设计漏洞:
  - v1 line 800 声称"调 ack.ts propose",但 line 815 自写 pending YAML(没真调 9a ack CLI 入口)— **绕过 9a 反向加固协议**
  - 9a `ack-log.ts:65` `getPendingPath` 接受数字 findingId;v1 用 `review-outcome:0` 含冒号,Windows 路径非法 + 9a `listPending()` 正则不匹配
  - 9a `ack confirm` 不支持 `--target-severity` flag;confirm 后 marker 字段不被改回 → resign 重跑再次发现 C → 死循环
  - v2 修订:
    - 扩 `src/cli/commands/ack.ts` 加 `--target-severity <sev>` flag(propose / confirm 两端);加新 action 类型 `resign-c-simcode`
    - `src/core/upgrade/resign-markers.ts` C 简码处理真调 `forge ack propose <changeId> --finding ... --action resign-c-simcode --target-severity <ask-user>` CLI 入口(不自写 pending file)
    - confirm 后 ack-log 行包含 `target_severity` 字段;resign 重跑读 ack-log 确认 C 已被 resolve,**改回 marker `severity: WARNING|SUGGESTION` 后写回**
    - findingId 改用数字索引(如 `1`、`2`)或 9a 内置的 `pause_decisions:N` 等 schema(避免冒号 Windows 路径问题)
- **BLOCKER 5(NEW)**:plan v1 resign 阶段事务非事务 — line 774 先 writeFile marker,line 779 后 appendAckLog;**任一中间失败 → marker 已升级但无审计**。v2 修订:沿 `src/cli/commands/upgrade.ts:95` 现有 stash/verify 回滚模式:
  - 先 stash 原 marker 到 `.cache/resign-markers-stash-<pid>/`
  - writeFile 新 marker
  - appendAckLog
  - 若 ack-log 失败 → restore stash → 抛错
  - 全成功 → 清理 stash
- **BLOCKER 6(NEW)**:legacy-exemption #9 不变量 plan v1 §7.1 降为 placeholder(9g 未完成时跳)— **fail-open 漏洞**:legacy marker 可带伪造 `process_evidence` 整字段而不被拦。v2 修订:legacy-exemption fail-closed 反向加固:**legacy=true 时若含 process_evidence 整字段 → 拒签**(沿 #11/#12 同模式)

- **MAJOR 1(NEW)**:version-retrograde fence v1 实施 `try { git log } catch { return ok() }` 任何 git 错都 fail-open。v2 修订:
  - 先 `git rev-parse --is-inside-work-tree` 区分 non-git(返 ok)vs git(继续)
  - git repo 内 log 失败 → fail-closed(返 failed,提示用户检查 git history)
  - 加缓解 4(沿 design §3.4.4.3)— 若 ack-log 有 resign 行 + git history 无对应版本字段变更 → 视为 git history rewrite 篡改,拒签
- **MAJOR 2(NEW)**:`corrupt-version-retrograde` e2e fixture v1 静态目录创建 — **tmpdir 复制不会带 git history**,fence 实际测不到 retrograde。v2 修订:e2e `setupFixture()` 内动态 `git init` + commit 老版本 + 改新版本(参 unit 测试 helper)
- **MAJOR 3(NEW)**:Task 2 Step 8 阶段事务回滚 case Windows 端 skip(chmod 不生效)— 关键 rollback 路径无实测;C 简码 pending file 名也 Windows 非法。v2 修订:用 mock fs / dependency injection 注入 `appendAckLog` 失败,跨平台单测;findingId 改数字或统一走 9a `getPendingPath()`

- **MINOR 1(NEW)**:plan v1 line 310 注释只把 `undefined` 当字段缺失;YAML parse `created_by_tool_version: ` 会得 `null`。v2 修订:checkSemverString 把 `null` 视为"字段存在 + 类型非 string" → 拒签,plan 文案明示
- **MINOR 2(NEW)**:Task 2 工日低估 — codex 评估 8 case + ack CLI 扩展 + schema/fence 联动 + transaction rollback,1.0d 不现实。v2 修订:Task 2 P50 1.0 → **2.0**(实测 case +2 增至 10);总 P50 2.7 → 4.8
- **MINOR 3(NEW)**:plan v1 "9j 完成 → 解锁" 措辞引导用户误以为实现完成 = 自动解锁。v2 修订:plan §0 + Task 5 commit 措辞改为"9j 落地 + 用户完成 `forge upgrade --resign-markers` + C confirm 后用户工作流解锁"

- **NIT 1(NEW)**:plan v1 line 13 引用 `master §3.12.1bis(marker 字段冻结)`;实际 `created_by_tool_version` 在 master §3.12.1(marker schema)而非 §3.12.1bis(后修加的 process_evidence/archive_summary/scope-entries 三 schema)。v2 修订:改 master §3.12.1 引用
- **NIT 2(NEW)**:plan v1 line 1570 写 commands/upgrade.md "若不存在 创建,若存在 加段" — 仓库现状无该文件。v2 修订:明示 "当前不存在,创建 commands/upgrade.md;若实施前已由他人新增,按同段合并"

**v1 → v2 工日核算**(`P50 2.7 → 4.8`):
- Task 1 +0.1d(加 `resigned_by_tool_version?` 字段 + 2 case 测试 + null 语义明示)
- Task 2 +1.0d(option 形态重写 + 真调 ack CLI 路径 + stash/rollback + Windows 兼容路径 + 10 case)
- Task 3 +0.2d(互斥规则 + process_evidence 字段反向加固 + 2 case)
- Task 4 +0.1d(fail-closed git error + 1 case)
- Task 5 +0.2d(B3 schema 扩 + e2e 4 → 5 fixture + 9a ack.ts 扩 propagation)
- Task 6(新)+0.5d(cross-plan 修订 spec/master + 9a ack.ts 扩 --target-severity flag + resign-c-simcode action)
- 合计 v1 2.7 → v2 4.8(+2.1d)


**前置(必须完成)**:
- 9a 横切层基础(已完成,`f347329`):`Severity` enum / `Finding` / `ack-log.ts` propose/confirm 协议
- 9c apply Fluid Pause Decision Point(已完成,`a9b6ab4`):PauseDecision interface + marker pause_decisions? 字段
- 9d verify 三维度(已完成,`20e3563`):VerifyFinding interface + verify-findings-fence.ts(沿模块化模式作 legacy-exemption.ts 模板)
- **plan-9e1 archive 软告警基础**(已完成,`dde9209`):archive.ts 步骤 3.5/3.9 已扩三级 fence + ScopeEntriesIntegrityError;本 plan 在步骤 3.5 之前(verify-findings fence 之前)插入新 fence;commands/archive.md 已有 "C 简码迁移协议" 段引用 9j → 9j 落地后该段用户工作流解锁

**不前置(实现层面)**:
- 9g process_evidence:legacy 豁免表中 #9/11/12 三个保留的不变量涉及 process_evidence JCS hash / tdd_exemption / process_verification_mode 字段;**9g 完成前 9j legacy 豁免表 placeholder 实现**(reject if `process_evidence_unavailable_legacy: true` + tdd_exemption / process_verification_mode 字段非空 → 拒签,沿 design §3.4.4.1 反向加固);9g 完成后 9j 不需追加,豁免表行为已对齐

**用户工作流强依赖**(plan-9e1 已声明):
- v0.4 含 C 简码 review_outcomes marker 的 archive 路径:plan-9e1 三级 fence 硬墙拒签 → 用户**必须**等 9j 完成跑 `forge upgrade --resign-markers` 交互式迁移(无 manual 出口)— 9j 完成后该路径解锁

**后续 unblocked**:
- 9g process_evidence(9j 完成后,legacy 豁免表第 9/11/12 不变量切到 9g 真实校验)
- 9z release(v1.0 收尾;统一全路径 lock exit 5 → 2 沿 master §3.12.3 known limitation)

**DoD**(完成定义,沿 master §3.10 NIT 二轮 #10 修订):
- `src/core/markers/types.ts` 四 marker interface 加 `created_by_tool_version?: string` + `resigned_by_tool_version?: string` 字段(superset additive,老 marker 缺等价 `<1.0.0`;沿 v2 选项 C)
- `src/core/validate/marker-schema.ts` 加 `checkSemverString` helper + 四 schema 分支两个 optional 字段校验(沿 plan-9c checkPauseDecisionsArray 同模式 — 字段缺失等价不校验,字段存在则严格 semver)
- `src/cli/commands/upgrade.ts` 加 `.option('--resign-markers <changeId>', ...)`(**v3:option 形态对齐 spec line 1763 + master line 503**)+ 阶段事务(SCAN markers → 简码映射 → 真调 ack CLI → stash → writeFile → ack-log → 失败 restore)
- `src/core/upgrade/resign-markers.ts` 新建 module(主流程 + helpers — sub-skill 设计避免 upgrade.ts 单文件膨胀)
- `src/core/archive/legacy-exemption.ts` 新建 module — `validateLegacyExemption(marker, processEvidence?)` 13 不变量精确豁免表;**`legacy=true ⊥ (created_by_tool_version >= 1.0.0 且 resigned_by_tool_version 缺失)`** 互斥校验(沿 v2 选项 C resigned-aware)
- `src/core/archive/version-retrograde-fence.ts` 新建 module — `validateVersionRetrograde(markerPath, marker, gitDir?)` git history 扫描 + semver 比对
- `src/cli/commands/archive.ts` 步骤 3.5 之前(verify-findings fence 之前)插入新 fence 调用:`validateLegacyExemption` + `validateVersionRetrograde`(失败 exit 1 沿 master §3.12.3)
- `commands/upgrade.md` 加 §"--resign-markers 用法"段(模板 + 简码迁移规则 + C propose/confirm 引用 + sunset policy 引用)
- 测试:
  - `tests/core/markers/marker-version-schema.test.ts`(checkSemverString 校验 12 case:合法 semver / 缺字段兼容 / `<1.0.0` / `>=1.0.0` / prerelease+build / 非 semver 拒签 / 等)
  - `tests/cli/upgrade-resign-markers.test.ts`(resign-markers option flag 端到端 **10 case**:S/L 自动 / C 走 propose / 不自动填空 / legacy 标记 / ack-log 写 / 阶段事务回滚 / 干净状态跳过 / CI 模式拒绝 / **created 字段保留 / 真调 ack CLI**)
  - `tests/core/archive/legacy-exemption.test.ts`(**v3:17 case** — 13 不变量豁免 + 互斥校验 resigned-aware + process_evidence 反向加固)
  - `tests/core/archive/version-retrograde-fence.test.ts`(retrograde 拒签 / 非 git 跳过 / 合法 semver / tamper 检测 6 case)
  - `tests/integration/marker-version-end-to-end.test.ts`(**v3:5 fixture** — archived-old / active-old-need-resign / new-v1.0 / corrupt-version-retrograde + **resign-c-simcode-with-confirm**)
- 全本地 verify 通过(`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test`)

**Shell 假设 + commit block 跨 shell 兼容**(沿 plan-9c v3 codex MINOR 9 + plan-9e1 v2 NIT 1):本 plan 5 个 Task commit block 全用 `git commit -m "$(cat <<'EOF' ... EOF)"` heredoc 形式。**实施者必须先确认当前 shell + 按下表转换**:

| Shell | 直接复制 commit block? | 转换规则 |
|---|---|---|
| Bash / Git-Bash / WSL | ✓ 直接用 | 无需转换 |
| PowerShell 5.1 / 7+ | ✗ 必须改 here-string | `git commit -m "$(cat <<'EOF' ... EOF)"` → `git commit -m @'`(独占一行)→ 内容 → `'@`(独占一行,前导无空白)|
| Claude Code Bash tool (Windows) | ✗ 默认走 PowerShell | 同上,或显式指定 Git-Bash 路径 |

---

## 0. 总览

本 sub-plan 拆 **6 个 task**(v2 加 Task 6 cross-plan;原 5 task 扩范围):

| Task | 名称 | 工日 P50 | 关键交付 |
|------|------|---------|---------|
| 1 | marker schema 加 `created_by_tool_version` + **`resigned_by_tool_version`**(v2 BLOCKER 2)+ 14 case | **0.5** | types.ts 四 marker 加两可选字段;marker-schema.ts 加 `checkSemverString` + 四 schema 分支;**类型 union 扩 simcode + 全名双格式**(v2 BLOCKER 3);**`ReviewOutcome.severity` 扩** `'S'\|'C'\|'L'\|'CRITICAL'\|'WARNING'\|'SUGGESTION'`;14 case |
| 2 | `forge upgrade --resign-markers` **option 形态**(v2 BLOCKER 1)+ 真调 9a ack CLI(v2 BLOCKER 4)+ stash/rollback(v2 BLOCKER 5)+ 10 case | **2.0** | `src/core/upgrade/resign-markers.ts` 主流程含 stash/rollback;`src/cli/commands/upgrade.ts` 加 `.option('--resign-markers <changeId>', ...)`;**C 简码真调 `forge ack propose --action resign-c-simcode --target-severity` CLI**;10 case e2e + 跨平台兼容(数字 findingId + mock fs 注入) |
| 3 | archive.ts legacy 精确豁免表 + **互斥规则改 resigned-aware**(v2 BLOCKER 2)+ **process_evidence fail-closed**(v2 BLOCKER 6)+ 17 case | **0.6** | `src/core/archive/legacy-exemption.ts` 互斥规则改:`legacy=true ⊥ (created>=1.0.0 且 resigned 缺失)`;legacy=true + process_evidence 整字段 → 拒签(反向加固 #9 placeholder);17 case |
| 4 | archive.ts version-retrograde-fence + **fail-closed git error**(v2 MAJOR 1)+ ack-log cross-check + 7 case | **0.5** | `src/core/archive/version-retrograde-fence.ts` 区分 non-git(rev-parse)vs git error;git history rewrite 防御(ack-log resign 行交叉验证);7 case |
| 5 | archive.ts 集成 + commands/upgrade.md + e2e **5 fixture**(v2 MAJOR 2)+ 全本地 verify | **0.7** | archive.ts 步骤 3.4 插入两 fence;commands/upgrade.md(**创建**,v2 NIT 2 现状无)+ §"--resign-markers 用法";5 fixture 含 **resign-c-simcode-with-confirm**(C 简码 confirm 后真改 marker e2e);e2e setupFixture 动态 git init + commit + tamper |
| 6(**v2 新增**)| **cross-plan 修订 spec + master + 9a ack.ts 扩**(v2 BLOCKER 2+4 + NIT 1)+ commit | **0.5** | spec §3.4.1 加 `resigned_by_tool_version` 字段 + §3.4.4.1 互斥规则改 resigned-aware;master §3.12.1 加 `created_by_tool_version` / `resigned_by_tool_version` 注脚(v2 NIT 1 修 §3.12.1bis → §3.12.1);**`src/cli/commands/ack.ts` 扩 `--target-severity` flag + `resign-c-simcode` action**(plan-9a 同模式扩展)+ commands/archive.md 同步 9j 解锁声明 |

**v2 总 P50**:0.5+2.0+0.6+0.5+0.7+0.5 = **4.8d**(沿 codex 工日校准)

**串行约束**(v2 修订):
- **Task 6 拆为 6.1 + 6.2**(v2 BLOCKER 2 + 4):
  - **Task 6.1 先跑**(spec/master 修订 + 9a ack.ts 扩 `--target-severity`):Task 1/2 实施时需 reference 新字段 + 新 flag,**Task 6.1 必须在 Task 1/2 之前 land**
  - **Task 6.2 跟在 Task 5 之后**(commands/archive.md 同步 + 9j 解锁声明):需要 archive.ts 集成完成后才能写正确的合并点说明
- Task 6.1 → Task 1(schema 加 `resigned_by_tool_version` 字段需 spec freeze 先 land)
- Task 6.1 → Task 2(resign-markers 调 ack.ts `--target-severity` flag 需 9a 扩展先 land)
- Task 1 → Task 2(resign-markers 写 marker 字段需 Task 1 schema 就位)
- Task 1 → Task 3(legacy-exemption 读 `created_by_tool_version` + `resigned_by_tool_version` 字段需 schema 就位)
- Task 1 → Task 4(version-retrograde-fence 读字段同上)
- Task 2 / Task 3 / Task 4 之间**可并行**(三个独立模块)— 但 plan-9c v6 经验:串行最稳,沿串行
- Task 4 → Task 5(archive.ts 集成 + e2e 依赖 Task 3+4 模块就位)
- Task 5 → Task 6.2(commands/archive.md 同步 + 解锁声明)

**Task 实施顺序**:6.1 → 1 → 2 → 3 → 4 → 5 → 6.2

**多 agent 并行可能**:Task 2 / 3 / 4 可并行(三个模块互相独立);**5 task 串行实施更稳**,沿 plan-9c v6 模式。

**与其他 sub-plan 合并点**(参考 master plan §3.10):
- `src/core/markers/types.ts`:9c(PauseDecision)+ 9d(VerifyFinding)+ 9j(`created_by_tool_version`)三方修改;无字段重叠,均 superset additive
- `src/cli/commands/archive.ts`:plan-9e1 已加步骤 3.5(verify-findings)+ 3.9(三级 fence)+ 4.5(buildArchiveSummary);9j 在步骤 3.5 **之前**新加 legacy-exemption + version-retrograde fence;9g 在 9j 之后(步骤 3 区段)再加 worktree 重跑阶段
- `src/cli/commands/upgrade.ts`:v0.3 legacy adapter 清理 + 9j 新 `--resign-markers <changeId>` option flag(沿 v3 BLOCKER 1 — 不是 subcommand);commander 同 group 加 option,在主 `.action` 体内分支处理

---

## 1. File Structure

### 新增文件

```
src/core/upgrade/resign-markers.ts                       ← Task 2:resign-markers 主流程 module(SCAN markers → 简码映射 → 真调 forge ack propose CLI → stash → writeFile → ack-log → 失败 restore)
src/core/archive/legacy-exemption.ts                     ← Task 3:validateLegacyExemption + 13 不变量豁免表 + resigned-aware 互斥校验(v2 BLOCKER 2)
src/core/archive/version-retrograde-fence.ts             ← Task 4:validateVersionRetrograde + git log 扫描 + non-git rev-parse 区分(v2 MAJOR 1)+ ack-log cross-check
tests/core/markers/marker-version-schema.test.ts         ← Task 1:checkSemverString + marker-schema **14 case**(v2 +2 resigned 字段)
tests/cli/upgrade-resign-markers.test.ts                 ← Task 2:resign-markers option 形态 e2e **10 case**(v2 +2 真调 ack CLI 测试)
tests/core/archive/legacy-exemption.test.ts              ← Task 3:legacy-exemption **17 case**(v2 +2:resigned-aware 互斥 + process_evidence 反向加固)
tests/core/archive/version-retrograde-fence.test.ts      ← Task 4:version-retrograde-fence **7 case**(v2 +1 fail-closed git error)
tests/integration/marker-version-end-to-end.test.ts      ← Task 5:三类 marker 情景 e2e **5 fixture**(v2 +1 resign-c-simcode-with-confirm)
tests/fixtures/marker-version/archived-old/              ← Task 5:已 archived 的 v0.4 marker(冻结,不动)
tests/fixtures/marker-version/active-old-need-resign/    ← Task 5:active change 含 v0.4 marker 含 S+L+C 简码,需 resign
tests/fixtures/marker-version/new-v1.0/                  ← Task 5:v1.0 创建的 marker,严格路径
tests/fixtures/marker-version/corrupt-version-retrograde/ ← Task 5:`created_by_tool_version` 被改,fence 拒签(v2 MAJOR 2 改用动态 git history)
tests/fixtures/marker-version/resign-c-simcode-with-confirm/  ← Task 5(v2 新):C 简码 + user confirm WARNING 后 resign 完整闭环 e2e
```

### 修改文件

```
src/core/markers/types.ts                          ← Task 1:四 marker interface 加 `created_by_tool_version?: string` + `resigned_by_tool_version?: string`(v2 BLOCKER 2);ReviewOutcome.severity union 扩 simcode + 全名(v2 BLOCKER 3)
src/core/validate/marker-schema.ts                 ← Task 1:加 checkSemverString helper + 四 schema 分支;REVIEW_OUTCOME_SEVERITY_CODES 扩 simcode + 全名(v2 BLOCKER 3)
src/cli/commands/upgrade.ts                        ← Task 2:加 `.option('--resign-markers <changeId>', ...)`(v2 BLOCKER 1 option 形态,不是 subcommand)
src/cli/commands/archive.ts                        ← Task 5:步骤 3.5 之前插入 legacy-exemption + version-retrograde fence 调用
src/cli/commands/ack.ts                            ← Task 6.1(v2 新):加 `--target-severity <sev>` flag + `resign-c-simcode` action 类型(plan-9j 范围扩,sync 9a)
src/core/archive/three-level-fence.ts              ← Task 1(v2 BLOCKER 3):S/L 简码扩 + 全名 CRITICAL/WARNING/SUGGESTION 同表裁决;C 简码硬墙保留(plan-9e1 v4 BLOCKER 1)
src/core/archive/summary-builder.ts                ← Task 1(v2 BLOCKER 3):collector1/2 全名严格处理(plan-9e1 v3 BLOCKER 3 同模式扩,L→SUGGESTION 直接映射 + WARNING+ack→acked_warnings)
commands/upgrade.md                                ← Task 5:**创建**(v2 NIT 2 现状无)+ §"--resign-markers 用法"段
commands/archive.md                                ← Task 6.2(v2):同步 9j 解锁声明(plan-9e1 已声明 9j 是 C 简码硬墙唯一合规出口,9j 落地后更新文档措辞)
docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md  ← Task 6.1(v2 BLOCKER 2 + NIT 1):§3.12.1 加 `resigned_by_tool_version` 字段 + §6 修订记录 v3.2 行
docs/specs/2026-05-10-v1.0-fusion-completion-design.md  ← Task 6.1(v2 BLOCKER 2):§3.4.1 加 `resigned_by_tool_version` 字段定义 + §3.4.4 行为修订(保留原 version + 加 resigned 字段)+ §3.4.4.1 互斥规则改 resigned-aware
```

### 不修改文件(明确边界)

```
src/core/schemas/severity.ts                       ← 9a 锁死,本 plan 复用 Severity / Finding 不动
src/core/schemas/archive-summary.ts                ← plan-9e1 锁死,本 plan 不动(不加 created_by_tool_version 字段;archive_summary 是 archive 产物含 archived_at 时间戳,version 由 marker 字段携带)
src/core/markers/parse.ts                          ← 9a/9c/9d 锁死(YAML 解析无变化)
src/core/archive/transaction.ts                    ← plan-9e1 锁死,本 plan 不动(legacy 豁免 + version retrograde 是 archive 主路径 fence,不动 transaction 阶段)
src/core/archive/verify-findings-fence.ts          ← plan-9d 锁死,本 plan 沿用模块化模板不动(legacy-exemption / version-retrograde-fence 独立模块)
src/core/archive/pause-decisions-fence.ts          ← plan-9c 锁死,沿用不动
src/core/archive/ack-log-consistency.ts            ← plan-9d 锁死,沿用不动
# v5 MAJOR 2 修订:three-level-fence.ts + summary-builder.ts 从"不修改文件"移除 — Task 1 Step 3.5 同步扩双格式(plan-9e1 freeze 例外,沿 v3 BLOCKER 4)
# v5 MAJOR 2 修订:ack-log.ts + ack.ts 从"不修改文件"移除 — Task 6.1 Step 6.1.5 扩 --target-severity flag + resign-c-simcode action(9a freeze 例外,沿 v3 MAJOR 2)
src/cli/commands/validate.ts                       ← 不改(validate 调 validateChange,marker version 字段校验由 marker-schema 自动 propagate)
forge-eval/scenarios/                              ← 不加 forge-eval scenario(本 plan 不是新 skill 开发,沿 plan-9c / plan-9d / plan-9e1 同模式)
```

---

## 2. Task 1 — marker schema 加 `created_by_tool_version` + **`resigned_by_tool_version`** + ReviewOutcome union 扩 + 14 case 单测(**v2 BLOCKER 2 + 3 修订**)

**v2 修订要点**(详 header 修订摘要):
- 加新字段 `resigned_by_tool_version?: string`(沿 BLOCKER 2 方案 2 — 区分 created vs resigned;Task 6.1 已在 spec/master cross-plan 修订)
- `ReviewOutcome.severity` union 扩 `'S'\|'C'\|'L'\|'CRITICAL'\|'WARNING'\|'SUGGESTION'`(v2 BLOCKER 3:plan-9e1 遗漏,resign 后 marker 写 全名要 schema 接受)
- `marker-schema.ts` `REVIEW_OUTCOME_SEVERITY_CODES` 扩 simcode + 全名双格式
- Task 1 case 数 12 → **14**(+2:resigned 字段合法 / resigned 字段非 semver 拒签 + 全名 review_outcomes severity)

**注意**:Task 1 实施需在 Task 6.1 spec/master 修订完成后开始(沿 §0 串行约束)。



**Files**:
- Modify: `src/core/markers/types.ts:1-141`(四 marker interface 加 `created_by_tool_version?: string` + `resigned_by_tool_version?: string` 字段,沿 v3 BLOCKER 2 选项 C)
- Modify: `src/core/validate/marker-schema.ts`(加 `checkSemverString` helper + 四 schema 分支调用两个 version 字段)
- Create: `tests/core/markers/marker-version-schema.test.ts`(**14 case**;v3 BLOCKER 2 修订:12 baseline + 2 resigned 字段)

### Step 1: 先写 schema 校验失败测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/core/markers/marker-version-schema.test.ts`**

```typescript
// marker-version-schema.test.ts — plan-9j Task 1 单测
// 沿 verify-findings-schema.test.ts / pause-decisions-schema.test.ts 同模式
// 校验 created_by_tool_version 字段:semver 合法 / 缺字段兼容(<1.0.0) / 等

import { describe, it, expect } from 'vitest';
import { validateMarkerSchema } from '../../../src/core/validate/marker-schema.js';

// 合法 marker baseline(verify-passed)
const baseVerifyMarker = {
  schema: 'forge-verify/v1',
  verified_at: '2026-05-12T14:30:00Z',
  verified_by: 'ai-agent',
  tasks_hash: 'sha256:' + 'a'.repeat(64),
  content_hash: 'sha256:' + 'b'.repeat(64),
  evidence: [],
};

describe('created_by_tool_version schema validation', () => {
  it('superset additive:marker 缺 created_by_tool_version 字段 → 老兼容通过', () => {
    const result = validateMarkerSchema(baseVerifyMarker);
    expect(result.valid).toBe(true);
  });

  it('合法 semver 1.0.0 → 通过', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '1.0.0',
    });
    expect(result.valid).toBe(true);
  });

  it('合法 semver 0.4.2 → 通过', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '0.4.2',
    });
    expect(result.valid).toBe(true);
  });

  it('合法 semver 含 prerelease 1.0.0-alpha.1 → 通过', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '1.0.0-alpha.1',
    });
    expect(result.valid).toBe(true);
  });

  it('合法 semver 含 build 1.0.0+20260512 → 通过', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '1.0.0+20260512',
    });
    expect(result.valid).toBe(true);
  });

  it('非 semver 字符串 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: 'not-semver',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'created_by_tool_version')).toBe(true);
  });

  it('数字而非字符串 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: 1.0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'created_by_tool_version')).toBe(true);
  });

  it('空字符串 → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'created_by_tool_version')).toBe(true);
  });

  it('forge-review/v1 marker 同样校验字段', () => {
    const reviewMarker = {
      schema: 'forge-review/v1',
      reviewed_at: '2026-05-12T16:30:00Z',
      reviewed_by: 'ai-agent',
      tasks_hash: 'sha256:' + 'a'.repeat(64),
      content_hash: 'sha256:' + 'b'.repeat(64),
      git: { is_git_repo: false },
      review_outcomes: [],
      created_by_tool_version: 'not-semver',
    };
    const result = validateMarkerSchema(reviewMarker);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'created_by_tool_version')).toBe(true);
  });

  it('forge-verify-failed/v1 marker 同样校验', () => {
    const failedMarker = {
      schema: 'forge-verify-failed/v1',
      failed_at: '2026-05-12T16:30:00Z',
      reasons: ['x'],
      fake_completions: [],
      appended_tasks: [],
      created_by_tool_version: '1.0.0',
    };
    const result = validateMarkerSchema(failedMarker);
    expect(result.valid).toBe(true);
  });

  it('forge-review-failed/v1 marker 同样校验', () => {
    const failedMarker = {
      schema: 'forge-review-failed/v1',
      failed_at: '2026-05-12T16:30:00Z',
      unresolved_outcomes: [],
      appended_tasks: [],
      created_by_tool_version: '0.0.1',
    };
    const result = validateMarkerSchema(failedMarker);
    expect(result.valid).toBe(true);
  });

  it('semver 含 0 主版本 0.4.0 → 通过(v0.4 marker)', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '0.4.0',
    });
    expect(result.valid).toBe(true);
  });

  // v3 BLOCKER 2 修订:加 resigned_by_tool_version 字段 +2 case(沿 v2 选项 C)
  it('合法 resigned_by_tool_version 1.0.0 → 通过(resign 后 marker)', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '0.4.0',
      resigned_by_tool_version: '1.0.0',
    });
    expect(result.valid).toBe(true);
  });

  it('resigned_by_tool_version 非 semver → 拒签', () => {
    const result = validateMarkerSchema({
      ...baseVerifyMarker,
      created_by_tool_version: '0.4.0',
      resigned_by_tool_version: 'not-semver',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'resigned_by_tool_version')).toBe(true);
  });
});
```

- [ ] **Step 1.2: 跑测试确认全红(预期 FAIL — checkSemverString 尚未实现)**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/markers/marker-version-schema.test.ts
```

预期:**14 case**(v3 +2 resigned_by_tool_version);大部分 case 默认通过(因 marker-schema 未校验字段),仅 `非 semver 字符串 → 拒签` / `数字而非字符串 → 拒签` / `空字符串 → 拒签` / `resigned_by_tool_version 非 semver → 拒签` 期望 valid=false 的 case 失败。沿 plan-9c v2 同模式 baseline 红验证。

### Step 2: 加 checkSemverString helper + 四 schema 分支调用(TDD green Part 1)

- [ ] **Step 2.1: 修改 `src/core/validate/marker-schema.ts:30` 邻近加 SEMVER 正则**

定位:在现有 `FINDING_HASH_RE` 之后(line ~24-26)追加:

```typescript
// finding_hash:裸 64-hex(沿 9a finding-hash.ts:8,不带 sha256: 前缀)
const FINDING_HASH_RE = /^[a-f0-9]{64}$/;
// git commit hash:40 位小写十六进制
const GIT_HEAD_RE = /^[a-f0-9]{40}$/;
// plan-9j Task 1 新增:created_by_tool_version semver 校验
// 沿 archive-summary.ts SEMVER_RE 同模式(major.minor.patch[-prerelease][+build])
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
```

- [ ] **Step 2.2: 在 `src/core/validate/marker-schema.ts` `checkSha256` helper 之后追加 `checkSemverString` helper**

```typescript
// plan-9j Task 1 新增:校验 semver 字符串字段(可选字段,缺失等价 <1.0.0)
function checkSemverString(
  obj: Record<string, unknown>,
  field: string,
  file?: string,
): ValidationResult {
  const v = obj[field];
  if (v === undefined) {
    return ok(); // 字段缺失等价老 marker(<1.0.0),superset additive 兼容
  }
  if (typeof v !== 'string' || !SEMVER_RE.test(v)) {
    return failed({
      artifact: 'marker',
      field,
      message: `must be semver string (major.minor.patch[-prerelease][+build]) or omitted (老 marker <1.0.0,沿 design §3.4.1)`,
      file,
    });
  }
  return ok();
}
```

- [ ] **Step 2.3: 在四 schema 分支末尾追加 `checkSemverString` 调用**

定位:在 `forge-verify/v1` 分支末尾(`checkPauseDecisionsArray` 调用之后),`forge-review/v1` 同位,`forge-verify-failed/v1` / `forge-review-failed/v1` 同位。每个分支追加:

```typescript
    // plan-9j Task 1 新增:created_by_tool_version 可选 superset additive 字段
    results.push(checkSemverString(obj, 'created_by_tool_version', file));
    // v3 BLOCKER 2 新增:resigned_by_tool_version(沿 v2 选项 C — 区分 created vs resigned)
    results.push(checkSemverString(obj, 'resigned_by_tool_version', file));
```

(注:四 schema 分支末尾追加同一行,沿 plan-9c / plan-9d 同模式)

- [ ] **Step 2.4: 跑测试确认 14 case 全 PASS**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/markers/marker-version-schema.test.ts
```

预期:**14 PASS** / 0 FAIL(v3 +2 case)。

### Step 3: 加 `created_by_tool_version?` + `resigned_by_tool_version?`(v3 BLOCKER 2)字段到四 marker interface

- [ ] **Step 3.1: 修改 `src/core/markers/types.ts:6-18` VerifyMarker 加字段**

```typescript
export interface VerifyMarker {
  schema: 'forge-verify/v1';
  verified_at: string; // ISO 8601 UTC
  verified_by: 'ai-agent' | 'human-override';
  tasks_hash: string;
  content_hash: string;
  evidence: EvidenceItem[];
  // plan-9d Task 3 新增 — superset additive,老 marker 缺等价 []
  verify_findings?: VerifyFinding[];
  // plan-9c Task 1 新增 — superset additive,老 marker 缺等价 []
  pause_decisions?: PauseDecision[];
  // plan-9j Task 1 新增 — superset additive,老 marker 缺等价 <1.0.0(沿 design §3.4.1)
  // marker 写入时 forge CLI 的版本号(semver),archive fence 按版本字段判断 marker 行为
  created_by_tool_version?: string;
  // v3 BLOCKER 2 新增 — superset additive,沿 v2 选项 C 修订(plan-9j §0)
  // 仅在 marker 经过 `forge upgrade --resign-markers` 后存在;与 created 配对区分 native v1.0 vs resigned legacy
  resigned_by_tool_version?: string;
}
```

- [ ] **Step 3.2: 修改 `src/core/markers/types.ts:90-100` ReviewMarker 加字段**

```typescript
export interface ReviewMarker {
  schema: 'forge-review/v1';
  reviewed_at: string;
  reviewed_by: 'ai-agent' | 'human-override';
  tasks_hash: string;
  content_hash: string;
  git: GitInfo;
  review_outcomes: ReviewOutcome[];
  // plan-9c Task 1 新增
  pause_decisions?: PauseDecision[];
  // plan-9j Task 1 新增
  created_by_tool_version?: string;
  // v3 BLOCKER 2 新增 — resigned 字段(沿 v2 选项 C)
  resigned_by_tool_version?: string;
}
```

- [ ] **Step 3.3: 修改 `src/core/markers/types.ts:120-130` VerifyFailedMarker 加字段**

```typescript
export interface VerifyFailedMarker {
  schema: 'forge-verify-failed/v1';
  failed_at: string;
  reasons: string[];
  fake_completions: string[];
  appended_tasks: string[];
  // plan-9d Task 3 新增
  verify_findings?: VerifyFinding[];
  // plan-9c Task 1 新增
  pause_decisions?: PauseDecision[];
  // plan-9j Task 1 新增
  created_by_tool_version?: string;
  // v3 BLOCKER 2 新增 — resigned 字段(沿 v2 选项 C)
  resigned_by_tool_version?: string;
}
```

- [ ] **Step 3.4: 修改 `src/core/markers/types.ts:132-139` ReviewFailedMarker 加字段**

```typescript
export interface ReviewFailedMarker {
  schema: 'forge-review-failed/v1';
  failed_at: string;
  unresolved_outcomes: ReviewOutcome[];
  appended_tasks: string[];
  // plan-9c Task 1 新增
  pause_decisions?: PauseDecision[];
  // plan-9j Task 1 新增
  created_by_tool_version?: string;
  // v3 BLOCKER 2 新增 — resigned 字段(沿 v2 选项 C)
  resigned_by_tool_version?: string;
}
```

- [ ] **Step 3.5: 跑 typecheck 确认所有现有 marker 调用兼容(superset additive 不破老代码)**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck
```

预期:全过(可选字段不破任何现有代码)。

### Step 3.5(v3 BLOCKER 4 新增):plan-9e1 4 文件同步补丁 — ReviewOutcome union 扩 simcode + 全名双格式

**为什么**:plan-9j Task 2 resign 后 marker `review_outcomes[i].severity` 会写 `'CRITICAL' | 'WARNING' | 'SUGGESTION'` 全名(沿 design §2.3.5 简码迁移);但 plan-9e1 现状 4 文件锁死 simcode `'S' | 'C' | 'L'`,resign 产物会被 schema step 2a 直接拒签。本 Step 同步扩 4 文件接受双格式。

- [ ] **Step 3.5.1**:修改 `src/core/markers/types.ts:112` ReviewOutcome.severity union

定位:`src/core/markers/types.ts` ReviewOutcome interface `severity` 字段:

```typescript
export interface ReviewOutcome {
  // v3 BLOCKER 4(plan-9j):union 扩 simcode + 全名双格式
  // 沿 design §2.3.5 简码迁移 — v0.4 simcode S/C/L 兼容老 marker;v1.0 全名 resign 后写入
  // C 简码硬墙拒签(沿 plan-9e1 v4 BLOCKER 1)+ S→CRITICAL / L→SUGGESTION 直接映射
  severity: 'S' | 'C' | 'L' | 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  accepted: boolean;
  resolved: boolean;
  task_ref?: string;
  rationale?: string;
}
```

- [ ] **Step 3.5.2**:修改 `src/core/validate/marker-schema.ts:31` REVIEW_OUTCOME_SEVERITY_CODES Set 扩

```typescript
// v3 BLOCKER 4(plan-9j):union 扩 simcode + 全名(沿 types.ts ReviewOutcome.severity)
const REVIEW_OUTCOME_SEVERITY_CODES = new Set([
  'S', 'C', 'L',                              // v0.4 simcode(老 marker 兼容)
  'CRITICAL', 'WARNING', 'SUGGESTION',        // v1.0 全名(resign 后或 v1.0 native 写入)
]);
```

- [ ] **Step 3.5.3**:修改 `src/core/archive/three-level-fence.ts` S/L/C 简码 + 全名双格式裁决

**v6 MAJOR 1 修订**:给完整可粘贴函数体 + 替换范围。

**定位**:`src/core/archive/three-level-fence.ts` 现有 `validateThreeLevelFence` 函数(plan-9e1 v4 BLOCKER 1 落地;line ~25-110)。**整段替换** `for (let i = 0; i < outcomes.length; i++) { ... }` 循环体(plan-9e1 现状 ~ line 65-105),用下面字面 patch:

**Patch 上下文**(展示完整函数,implementer 找到 `// 处理 review_outcomes` 注释下方循环替换):

```typescript
// src/core/archive/three-level-fence.ts(plan-9e1 现状 + v6 plan-9j 同步扩双格式)
import { type ValidationResult, failed, mergeResults } from '../validate/types.js';
import type { ReviewMarker, VerifyMarker } from '../markers/types.js';

export function validateThreeLevelFence(
  verifyMarker: Record<string, unknown>,
  reviewMarker: Record<string, unknown>,
  verifyFile?: string,
  reviewFile?: string,
): ValidationResult {
  const results: ValidationResult[] = [];
  const outcomes = (reviewMarker.review_outcomes as Array<Record<string, unknown>>) ?? [];

  // === verify_findings 循环(plan-9e1 v4 BLOCKER 1 现状,本次不动)===
  // ... 沿 plan-9e1 v12 文件现状,本 plan 仅扩 review_outcomes 端

  // === review_outcomes 循环 — **v6 plan-9j 修订:simcode + 全名双格式裁决** ===
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i] as { severity: string; resolved: boolean; accepted?: boolean; rationale?: string };
    const sev = o.severity;
    const fieldBase = `review_outcomes[${i}]`;

    // CRITICAL/S(同义)— 拒签
    if ((sev === 'S' || sev === 'CRITICAL') && !o.resolved) {
      results.push(failed({
        artifact: 'marker',
        field: `${fieldBase}.severity`,
        message: `${sev}(${sev === 'S' ? 'CRITICAL 简码' : 'CRITICAL 全名'})未 resolve,archive 拒签(沿 design §2.4.2 + plan-9j v3 BLOCKER 4 双格式)`,
        file: reviewFile,
      }));
      continue;
    }

    // C 简码 — 硬墙拒签(沿 plan-9e1 v4 BLOCKER 1)
    if (sev === 'C') {
      results.push(failed({
        artifact: 'marker',
        field: `${fieldBase}.severity`,
        message:
          `review_outcomes C(clarification 简码,resolved=${String(o.resolved)})不允许 archive。\n` +
          `  必须等 plan-9j 完成跑 \`forge upgrade --resign-markers\` 迁移(沿 design §2.3.5)。\n` +
          `  9e1 fence 是硬墙 — 不接受手动编辑 marker(违反 AI 反向加固 + ReviewOutcome 接口不接受全名 + ack-log 协议)。`,
        file: reviewFile,
      }));
      continue;
    }

    // WARNING 全名 — 必须 acked(简码 v0.4 无 WARNING 简码 — 仅 v1.0 全名;沿 design §2.3.5)
    if (sev === 'WARNING' && !o.resolved) {
      const acked = o.accepted === true && typeof o.rationale === 'string' && o.rationale.length > 0;
      if (!acked) {
        results.push(failed({
          artifact: 'marker',
          field: `${fieldBase}.accepted`,
          message: `review_outcomes WARNING(v1.0 全名)未 resolve + 缺 acked(需 accepted=true + rationale 非空)`,
          file: reviewFile,
        }));
      }
      continue;
    }

    // L/SUGGESTION(同义)+ resolved=false → 通过(handoff to backlog)
    // 全 resolved=true → 通过(无 fence 动作)
  }
  return mergeResults(...results);
}
```

- [ ] **Step 3.5.4**:修改 `src/core/archive/summary-builder.ts` collector1/2 全名映射(沿 plan-9e1 v3 BLOCKER 3)

定位:`buildArchiveSummary` 内 collector2 `collectPendingSuggestions` 中 review_outcomes 处理。**加全名分支**:

```typescript
// 完整可粘贴字面补丁(沿 plan-9e1 v3 BLOCKER 3 collector 模式):

// === collector2 collectPendingSuggestions —— 加全名分支 ===
function collectPendingSuggestions(
  findings: Finding[],
  outcomes: ReviewOutcome[],
): SuggestionRef[] {
  const refs: SuggestionRef[] = [];
  // verify_findings SUGGESTION 全名(plan-9e1 v3 BLOCKER 3 已有,不动)
  for (const f of findings) {
    if (f.severity === 'SUGGESTION' && f.resolved === false) {
      refs.push({
        source: 'verify_findings',
        id: f.id,
        dimension: f.dimension,
        check_type: f.check_type,
        evidence: f.evidence,
        recommendation: f.recommendation,
      });
    }
  }
  // review_outcomes L 简码 + SUGGESTION 全名双格式映射(v3 BLOCKER 4 新增)
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i] as ReviewOutcome;
    if ((o.severity === 'L' || o.severity === 'SUGGESTION') && o.resolved === false) {
      refs.push({
        source: 'review_outcomes',
        id: i,
        recommendation: o.rationale,
      });
    }
  }
  return refs;
}

// === collector1 collectAckedWarnings —— review_outcomes 端 WARNING 全名 + acked 进(v3 BLOCKER 4 新增) ===
function collectAckedWarnings(findings: Finding[], outcomes: ReviewOutcome[]): AckedWarningRef[] {
  const refs: AckedWarningRef[] = [];
  // verify_findings WARNING + ack(plan-9e1 v3 BLOCKER 3 已有,不动)
  for (const f of findings) {
    if (
      f.severity === 'WARNING' &&
      f.resolved === false &&
      f.severity_acked_by &&
      f.severity_acked_at
    ) {
      refs.push({
        source: 'verify_findings',
        id: f.id,
        dimension: f.dimension,
        check_type: f.check_type,
        evidence: f.evidence,
        acked_by: f.severity_acked_by,
        acked_at: f.severity_acked_at,
      });
    }
  }
  // review_outcomes WARNING 全名 + acked(v3 BLOCKER 4:resign 后或 v1.0 native 写入)
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i] as ReviewOutcome;
    // C 简码由 fence 拒签,不进 builder(沿 plan-9e1 v3 BLOCKER 3)
    // S 简码 / CRITICAL 全名由 fence 拒签,不进 builder
    // 仅 WARNING 全名 + accepted=true + rationale 非空(v0.4 review_outcomes 端的 "acked" 等价路径)
    if (
      o.severity === 'WARNING' &&
      o.resolved === false &&
      o.accepted === true &&
      typeof o.rationale === 'string' &&
      o.rationale.length > 0
    ) {
      refs.push({
        source: 'review_outcomes',
        id: i,
        acked_by: 'review-accepted',
        acked_at: '', // review_outcomes 端无 user 字段,沿 plan-9e1 v1 collector1 review-accepted 标记
        rationale: o.rationale,
      });
    }
  }
  return refs;
}
```

- [ ] **Step 3.5.5**:跑 plan-9e1 现有测试确保不回归

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/cli/archive-three-level-fence.test.ts tests/core/archive/summary-builder.test.ts tests/integration/archive-summary-end-to-end.test.ts
```

预期:plan-9e1 现有 19 + 10 + 7 = 36 case 全 PASS(simcode 路径不破)。**若回归**:plan-9j Task 1 字面 4 文件改动需修订(下个 codex 轮迭代)。

### Step 4: Typecheck + format + commit

- [ ] **Step 4.1: 跑全本地 verify 子集**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm format:check
```

预期:全过。若 format:check 失败,`pnpm format` 修复后 add + commit。

- [ ] **Step 4.2: commit Task 1**

```bash
git -C D:/ClaudeProject/opsp/forge-repo add src/core/markers/types.ts src/core/validate/marker-schema.ts src/core/archive/three-level-fence.ts src/core/archive/summary-builder.ts tests/core/markers/marker-version-schema.test.ts
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9j Task 1): marker schema 加 created_by_tool_version + resigned_by_tool_version + plan-9e1 4 文件双格式扩 + 14 case 单测

沿 design §3.4.1 superset additive — 四 marker interface 加 optional semver 字段(created + resigned);
marker-schema 加 checkSemverString helper + 四 schema 分支调用 + 两 version 字段校验;
v3 BLOCKER 4 同步扩 plan-9e1 4 文件 ReviewOutcome.severity union: simcode + 全名双格式
(types.ts / marker-schema.ts / three-level-fence.ts / summary-builder.ts)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

预期:commit hash 出现,无 lint/test 失败。

---

## 3. Task 2 — `forge upgrade --resign-markers` **option 形态** + 真调 9a ack CLI + stash/rollback + 10 case 单测(**v2 BLOCKER 1+4+5 重写**)

**v2 修订要点**(详 header):
- **BLOCKER 1**:CLI 从 subcommand `.command('resign-markers')` 改 **option** `.option('--resign-markers <changeId>', ...)`(对齐 spec line 1763 + master line 503 冻结)
- **BLOCKER 4**:C 简码处理**真调** `forge ack propose <changeId> --finding <id> --action resign-c-simcode --target-severity <sev>` CLI(沿 Task 6.1 扩 9a ack.ts);**不自写 pending YAML**;findingId 用数字索引(避免冒号 Windows 路径非法)
- **BLOCKER 5**:resign 阶段事务 — 沿 upgrade.ts:95 stash 模式:**先 stash 原 marker → writeFile 新 marker → appendAckLog → 失败 restore stash**
- **MAJOR 3**:Windows 兼容 — 用 dependency injection / mock `appendAckLog` 注入失败,跨平台单测;findingId 数字化
- Task 2 case 数 8 → **10**(+2:真调 ack CLI + stash/rollback 跨平台 mock fs)

**注意**:Task 2 实施需 Task 6.1 完成(9a ack.ts 扩 --target-severity flag + resign-c-simcode action)+ Task 1 schema 字段就位。



**Files**:
- Create: `src/core/upgrade/resign-markers.ts`(新建 module:主流程 + helpers)
- Modify: `src/cli/commands/upgrade.ts`(**v3:加 `.option('--resign-markers <changeId>', ...)`** option 形态对齐 spec/master 冻结;不是 subcommand)
- Create: `tests/cli/upgrade-resign-markers.test.ts`(**10 case**;v5 BLOCKER 2 修订:8 + 2 = 10)

### Step 1: 先写 resign-markers 端到端测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/cli/upgrade-resign-markers.test.ts`**

```typescript
// upgrade-resign-markers.test.ts — plan-9j Task 2 单测
// 10 case 覆盖:S/L 自动 / C 走 propose / 不自动填空 / legacy 标记 / ack-log 写 /
//             阶段事务回滚 / 干净状态跳过 / CI 模式拒绝

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const FORGE_CLI = resolve(process.cwd(), 'dist/cli/index.js');

interface MarkerFixtureOpts {
  schema: string;
  severity?: string; // for review_outcomes severity (S/L/C)
  hasC?: boolean;
}

// helper:在 tmpdir 搭 forge 骨架 + change 目录 + v0.4 marker
function setupV04Marker(opts: MarkerFixtureOpts): { tmpRoot: string; changeDir: string } {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9j-resign-'));
  const changeDir = join(tmpRoot, 'forge', 'changes', 'add-x');
  mkdirSync(join(changeDir, 'specs'), { recursive: true });
  mkdirSync(join(tmpRoot, 'forge', '.cache'), { recursive: true });
  writeFileSync(
    join(tmpRoot, 'forge', 'config.yaml'),
    'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
    'utf8',
  );
  writeFileSync(join(changeDir, 'proposal.md'), '# X\n## Why\nr\n', 'utf8');
  writeFileSync(join(changeDir, 'design.md'), '# Design\n', 'utf8');
  writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n- [x] t1\n', 'utf8');
  writeFileSync(join(changeDir, 'specs', 'x.md'), '# X Spec\n', 'utf8');
  // v0.4 marker — 含简码 + 无 created_by_tool_version 字段
  const reviewMarker = `schema: forge-review/v1
reviewed_at: 2025-08-01T10:00:00Z
reviewed_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
git:
  is_git_repo: false
review_outcomes:
  - severity: ${opts.severity ?? 'S'}
    accepted: true
    resolved: false
    rationale: legacy v0.4 marker
`;
  writeFileSync(join(changeDir, '.review-passed'), reviewMarker, 'utf8');
  const verifyMarker = `schema: forge-verify/v1
verified_at: 2025-08-01T10:00:00Z
verified_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
evidence: []
`;
  writeFileSync(join(changeDir, '.verify-passed'), verifyMarker, 'utf8');
  return { tmpRoot, changeDir };
}

function runResign(tmpRoot: string, changeId: string): { code: number; stderr: string; stdout: string } {
  // v3 BLOCKER 1:option 形态 — `forge upgrade --resign-markers <changeId>`(对齐 spec line 1763 / master line 503)
  const res = spawnSync(
    'node',
    [FORGE_CLI, 'upgrade', '--resign-markers', changeId],
    {
      cwd: tmpRoot,
      encoding: 'utf8',
      env: { ...process.env, CI: 'false' }, // 显式关 CI 模式
    },
  );
  return { code: res.status ?? -1, stderr: res.stderr, stdout: res.stdout };
}

describe('forge upgrade --resign-markers', () => {
  const cleanupDirs: string[] = [];
  afterAll(() => {
    for (const d of cleanupDirs) rmSync(d, { recursive: true, force: true });
  });

  it('S 简码 → 自动映射 CRITICAL + 加 resigned_by_tool_version=1.0.0(保留 created,v3 BLOCKER 2/3)', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'S' });
    cleanupDirs.push(ctx.tmpRoot);
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(0);
    // 验证 .review-passed 已 resign:severity S → CRITICAL,resigned 字段加上;created 保留(原 v0.4 marker 缺,沿用 undefined 或 0.4.0)
    const reviewText = readFileSync(join(ctx.changeDir, '.review-passed'), 'utf8');
    const review = parseYaml(reviewText) as Record<string, unknown>;
    expect(review.resigned_by_tool_version).toBe('1.0.0'); // v3 BLOCKER 2:resign 加新字段
    // v3 BLOCKER 2:created_by_tool_version 保留(若原 v0.4 marker 含字段则不变;若原缺则仍缺)
    // v0.4 marker fixture 不写 created_by_tool_version 字段 → resign 后仍是 undefined(sparse-add)
    const outcomes = review.review_outcomes as Array<Record<string, string>>;
    expect(outcomes[0]?.severity).toBe('CRITICAL');
  });

  it('L 简码 → 自动映射 SUGGESTION', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'L' });
    cleanupDirs.push(ctx.tmpRoot);
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(0);
    const review = parseYaml(
      readFileSync(join(ctx.changeDir, '.review-passed'), 'utf8'),
    ) as Record<string, unknown>;
    expect((review.review_outcomes as Array<Record<string, string>>)[0]?.severity).toBe(
      'SUGGESTION',
    );
  });

  it('C 简码 → 走 ack.ts propose 路径 + exit 1 提示 user 走 confirm', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'C' });
    cleanupDirs.push(ctx.tmpRoot);
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/C 简码|clarification|forge ack confirm|propose/);
    // pending file 已写到 .evidence/pending-acks/(沿 9a 协议)
    const pendingDir = join(ctx.changeDir, '.evidence', 'pending-acks');
    expect(existsSync(pendingDir)).toBe(true);
  });

  it('不自动填空 verify_findings / pause_decisions / process_evidence — 改标 legacy', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'S' });
    cleanupDirs.push(ctx.tmpRoot);
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(0);
    const verify = parseYaml(
      readFileSync(join(ctx.changeDir, '.verify-passed'), 'utf8'),
    ) as Record<string, unknown>;
    expect(verify.verify_findings).toBeUndefined(); // 不自动填空
    expect(verify.pause_decisions).toBeUndefined();
    expect(verify.process_evidence_unavailable_legacy).toBe(true); // 改标
  });

  it('ack-log.jsonl 写入 action=resign 行', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'S' });
    cleanupDirs.push(ctx.tmpRoot);
    runResign(ctx.tmpRoot, 'add-x');
    const ackLogPath = join(ctx.changeDir, '.evidence', 'ack-log.jsonl');
    expect(existsSync(ackLogPath)).toBe(true);
    const lines = readFileSync(ackLogPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const resignLine = lines.find((l) => l.action === 'resign');
    expect(resignLine).toBeDefined();
    expect(resignLine.change_id).toBe('add-x');
  });

  it('干净状态(无 v0.4 marker)→ stdout 含 "无需 resign"(exit 0)', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'S' });
    cleanupDirs.push(ctx.tmpRoot);
    // 先跑一次 resign 后 marker 已是 v1.0.0
    runResign(ctx.tmpRoot, 'add-x');
    // 再跑一次应 skip
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/无需 resign|already v1\.0\.0|skip/i);
  });

  it('CI 模式拒绝(env CI=true)→ exit 2', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'C' });
    cleanupDirs.push(ctx.tmpRoot);
    const res = spawnSync(
      'node',
      [FORGE_CLI, 'upgrade', '--resign-markers', 'add-x'],
      {
        cwd: ctx.tmpRoot,
        encoding: 'utf8',
        env: { ...process.env, CI: 'true' },
      },
    );
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/CI mode|拒绝/);
  });

  it('阶段事务回滚:模拟 ack-log 写失败 → marker 字段未改', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'S' });
    cleanupDirs.push(ctx.tmpRoot);
    // 让 .evidence 目录 readonly,模拟 ack-log 写失败
    if (process.platform !== 'win32') {
      const { chmodSync } = require('node:fs');
      mkdirSync(join(ctx.changeDir, '.evidence'), { recursive: true });
      chmodSync(join(ctx.changeDir, '.evidence'), 0o555);
      const r = runResign(ctx.tmpRoot, 'add-x');
      expect(r.code).toBeGreaterThan(0); // 失败
      // 验证 marker 未改(因事务回滚)
      const review = parseYaml(
        readFileSync(join(ctx.changeDir, '.review-passed'), 'utf8'),
      ) as Record<string, unknown>;
      expect(review.created_by_tool_version).toBeUndefined(); // 没被加
      // 复原权限以便 cleanup
      chmodSync(join(ctx.changeDir, '.evidence'), 0o755);
    }
  });

  // v5 BLOCKER 2 + B3:补 +2 case 凑 10 case
  it('S 简码 + 原 marker 含 created_by_tool_version=0.4.0 → resign 后 created 保留 0.4.0(v3 BLOCKER 2)', () => {
    // 自定义 fixture:不用 default setupV04Marker(它写 created 缺失);此 case 显式 init created=0.4.0
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9j-resign-created-'));
    cleanupDirs.push(tmpRoot);
    const changeDir = join(tmpRoot, 'forge', 'changes', 'add-x');
    mkdirSync(join(changeDir, 'specs'), { recursive: true });
    mkdirSync(join(tmpRoot, 'forge', '.cache'), { recursive: true });
    writeFileSync(
      join(tmpRoot, 'forge', 'config.yaml'),
      'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
      'utf8',
    );
    writeFileSync(join(changeDir, 'proposal.md'), '# X\n## Why\nr\n', 'utf8');
    writeFileSync(join(changeDir, 'design.md'), '# Design\n', 'utf8');
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n- [x] t1\n', 'utf8');
    writeFileSync(join(changeDir, 'specs', 'x.md'), '# X Spec\n', 'utf8');
    writeFileSync(
      join(changeDir, '.review-passed'),
      `schema: forge-review/v1
reviewed_at: 2025-08-01T10:00:00Z
reviewed_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
created_by_tool_version: '0.4.0'
git:
  is_git_repo: false
review_outcomes:
  - severity: S
    accepted: true
    resolved: false
    rationale: legacy v0.4 marker with created field
`,
      'utf8',
    );
    writeFileSync(
      join(changeDir, '.verify-passed'),
      `schema: forge-verify/v1
verified_at: 2025-08-01T10:00:00Z
verified_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
created_by_tool_version: '0.4.0'
evidence: []
`,
      'utf8',
    );
    const r = runResign(tmpRoot, 'add-x');
    expect(r.code).toBe(0);
    const review = parseYaml(readFileSync(join(changeDir, '.review-passed'), 'utf8')) as Record<string, unknown>;
    expect(review.created_by_tool_version).toBe('0.4.0'); // **保留不变**
    expect(review.resigned_by_tool_version).toBe('1.0.0'); // 加上
  });

  it('C 简码 propose 真调 9a ack CLI 路径(不自写 pending YAML,v3 BLOCKER 4)', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'C' });
    cleanupDirs.push(ctx.tmpRoot);
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(1);
    // 验证 pending file 名为数字 findingId(沿 v3 BLOCKER 4:String(outcomeIndex)),不是 review-outcome:0 含冒号
    const pendingDir = join(ctx.changeDir, '.evidence', 'pending-acks');
    expect(existsSync(pendingDir)).toBe(true);
    const { readdirSync } = require('node:fs');
    const files = readdirSync(pendingDir) as string[];
    // pending file 名应是数字 findingId 开头(如 '0-<timestamp>.yaml'),不含冒号
    expect(files.some((f) => /^\d+-/.test(f))).toBe(true);
    expect(files.every((f) => !f.includes(':'))).toBe(true); // Windows 路径合规
  });
});
```

- [ ] **Step 1.2: build + 跑测试确认全红**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm build && pnpm test tests/cli/upgrade-resign-markers.test.ts
```

预期:--resign-markers option flag 未实现 → spawn 都返非 0 exit + stderr 含 "unknown option" 或 "--resign-markers 未实现"(沿 commander 默认 unknown option 输出)。

### Step 2: 实现 resign-markers module

- [ ] **Step 2.1: 创建 `src/core/upgrade/resign-markers.ts`**

```typescript
// src/core/upgrade/resign-markers.ts — plan-9j Task 2
// `forge upgrade --resign-markers <changeId>` option flag 主流程(沿 v3 BLOCKER 1 — 不是 subcommand)
// 沿 design §3.4.4 行为表 + §2.3.5 简码迁移 + §3.4.4.1 精确豁免

// v6 BLOCKER 2 修订:补齐所有 import(v5 stash 路径用 copyFile/mkdir/rm + basename 但没 import)
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { spawnSync } from 'node:child_process';
import { appendAckLog } from '../ack-log.js';

/** resign-markers 单 marker 处理结果 */
export interface ResignResult {
  kind: 'resigned' | 'skipped-already-v1' | 'needs-c-propose' | 'failed';
  message: string;
  markerPath?: string;
  pendingPaths?: string[]; // C 简码 propose 后写的 pending file 路径
}

/** 一次性入口 — 对 change 目录两 marker(.verify-passed + .review-passed)处理
 *
 * v7 BLOCKER 1 修订:加 forgeCliPath 参数(沿调用链传到 proposeForCSimcode 真调 ack CLI)
 * caller(upgrade.ts action handler)需传 dist/cli/index.js 真实路径;测试可注入 mock CLI 路径
 */
export async function resignChangeMarkers(
  forgeRoot: string,
  changeId: string,
  forgeCliPath: string,
  cliVersion: string = '1.0.0',
): Promise<ResignResult[]> {
  const changeDir = join(forgeRoot, 'changes', changeId);
  const results: ResignResult[] = [];
  for (const markerName of ['.verify-passed', '.review-passed']) {
    const markerPath = join(changeDir, markerName);
    if (!existsSync(markerPath)) continue;
    // v3 MAJOR 4:传 forgeRoot 入,resignOneMarker 用 forgeRoot 拼 stash 路径
    // v7 BLOCKER 1:传 forgeCliPath 入,resignOneMarker → proposeForCSimcode spawn 真 ack CLI
    results.push(await resignOneMarker(markerPath, changeDir, changeId, forgeRoot, forgeCliPath, cliVersion));
  }
  return results;
}

/** 单 marker resign — 三步:简码映射 / 字段添加 / ack-log 写入(v3 MAJOR 4 + v7 BLOCKER 1:加 forgeRoot + forgeCliPath 参数) */
async function resignOneMarker(
  markerPath: string,
  changeDir: string,
  changeId: string,
  forgeRoot: string,
  forgeCliPath: string,
  cliVersion: string,
): Promise<ResignResult> {
  const text = await readFile(markerPath, 'utf8');
  const marker = parseYaml(text) as Record<string, unknown>;

  // 步骤 0:若已 resigned(`resigned_by_tool_version` 字段存在)或原生 v1.0.0+ → skip
  // v3 BLOCKER 3 修订:判定依据是 `resigned_by_tool_version` 字段(沿 v2 选项 C),
  // 不再用 `created_by_tool_version >= 1.0.0` 判定(原 v1 逻辑覆写 created,v3 改保留)
  const alreadyResigned = typeof marker.resigned_by_tool_version === 'string';
  const isNativeV10 =
    typeof marker.created_by_tool_version === 'string' &&
    !marker.created_by_tool_version.startsWith('0.');
  if (alreadyResigned || isNativeV10) {
    const ver = marker.resigned_by_tool_version ?? marker.created_by_tool_version;
    return {
      kind: 'skipped-already-v1',
      message: `${markerPath}: 已是 v1.0+(resigned=${marker.resigned_by_tool_version ?? '<none>'} / created=${marker.created_by_tool_version ?? '<none>'}),无需 resign`,
      markerPath,
    };
  }

  // 步骤 1:review_outcomes 简码映射(沿 design §2.3.5)
  let needsCPropose = false;
  const pendingPaths: string[] = [];
  if (Array.isArray(marker.review_outcomes)) {
    const outcomes = marker.review_outcomes as Array<Record<string, unknown>>;
    for (let i = 0; i < outcomes.length; i++) {
      const o = outcomes[i] as Record<string, unknown>;
      if (o.severity === 'S') {
        o.severity = 'CRITICAL';
      } else if (o.severity === 'L') {
        o.severity = 'SUGGESTION';
      } else if (o.severity === 'C' || o.severity === 'blocking') {
        // C 简码 / blocking 字符串 → 走 ack.ts propose 路径(交互式询问 target severity)
        // v7 BLOCKER 1 修订:传 forgeCliPath(从 resignChangeMarkers 接收的参数),不是 changeDir
        needsCPropose = true;
        const { exitCode, pendingDirAfter } = await proposeForCSimcode(forgeCliPath, changeId, i, o);
        pendingPaths.push(pendingDirAfter);
      }
    }
  }
  if (needsCPropose) {
    return {
      kind: 'needs-c-propose',
      message:
        `${markerPath}: 含 C 简码 review_outcome,已写 pending file 到 ${pendingPaths.length} 个;\n` +
        `请运行 \`forge ack confirm <changeId> <findingId>\` 或 \`/forge:ack-confirm\` slash 命令处理后重跑 resign-markers`,
      markerPath,
      pendingPaths,
    };
  }

  // v3 BLOCKER 5 + v3 MAJOR 4:阶段事务 stash/rollback — 用 forgeRoot 拼 stash 路径
  // 沿 upgrade.ts:95 现有 STASH 模式(projectRoot/.cache),保持模块入口接收 forgeRoot 参数
  // 而非 changeDir 相对路径(避免 `..`/`..` 跳出 changeDir 后路径 fragile)
  const stashDir = join(forgeRoot, '.cache', `resign-markers-stash-${process.pid}`);
  await mkdir(stashDir, { recursive: true });
  const stashPath = join(stashDir, basename(markerPath));
  await copyFile(markerPath, stashPath);

  // 步骤 2:加 resigned_by_tool_version 字段(superset additive),保留 created 不变
  // v3 BLOCKER 2 修订:**不覆写** created_by_tool_version(保留原值),**加** resigned_by_tool_version 新字段
  // 沿 design §3.4.4 修订:resign 后 marker 区分 created(原始) vs resigned(升级时机)
  if (typeof marker.created_by_tool_version !== 'string') {
    // 老 marker 缺字段时,只设 resigned 字段(created 隐含 <1.0.0)
  }
  marker.resigned_by_tool_version = cliVersion;

  // 步骤 3:改标 process_evidence_unavailable_legacy meta(不自动填空 verify_findings/pause_decisions/process_evidence)
  // 沿 design §3.4.4 + §3.4.4.1 — 填空 = 工具帮 AI 伪造证据,违反 AI 反向加固
  marker.process_evidence_unavailable_legacy = true;

  // 步骤 4:写回 marker(v3 BLOCKER 5:try/catch 包裹 — ack-log 失败时 restore stash)
  try {
    await writeFile(markerPath, stringifyYaml(marker), 'utf8');
  } catch (writeErr) {
    // writeFile 失败 → restore stash 直接抛
    await copyFile(stashPath, markerPath).catch(() => {});
    await rm(stashDir, { recursive: true, force: true }).catch(() => {});
    throw writeErr;
  }

  // 步骤 5:写 ack-log 一行 action=resign — 失败时回滚 writeFile
  const gitHead = getGitHeadOrNull(changeDir);
  try {
    await appendAckLog(changeDir, {
    schema: 'forge-ack-log/v1',
    kind: 'ack',
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    action: 'resign',
    change_id: changeId,
    finding_id: null,
    user: 'cli-upgrade',
    rationale: `forge upgrade --resign-markers: ${cliVersion}`,
    git_head: gitHead,
    finding_hash: null,
      extra: { markerPath, originalVersion: '<1.0.0', targetVersion: cliVersion },
    });
  } catch (ackErr) {
    // v3 BLOCKER 5:ack-log 写失败 → restore stash 让 marker 字段未变
    await copyFile(stashPath, markerPath).catch(() => {});
    await rm(stashDir, { recursive: true, force: true }).catch(() => {});
    throw ackErr;
  }

  // 全成功 → 清理 stash
  await rm(stashDir, { recursive: true, force: true }).catch(() => {});

  return {
    kind: 'resigned',
    message: `${markerPath}: resigned to ${cliVersion}(原 created_by_tool_version 保留)+ legacy meta`,
    markerPath,
  };
}

/**
 * C 简码 propose — **真调** `forge ack propose` CLI(沿 v6 BLOCKER 1 修订 + v3 BLOCKER 4 数字 findingId)
 *
 * v6 BLOCKER 1:不再自写 pending YAML — 真 spawn forge ack propose 子命令(沿 9a propose/confirm 协议)
 * 让 ack-log + pending file 完全走 9a 现状路径,plan-9j 仅提供 changeId + findingId + action,
 * --target-severity 由 user 在后续 ack confirm 时指定(Task 6.1 已扩 9a 加该 flag)
 */
async function proposeForCSimcode(
  forgeCliPath: string,  // dist/cli/index.js 路径(测试可注入 mock)
  changeId: string,
  outcomeIndex: number,
  outcome: Record<string, unknown>,
): Promise<{ exitCode: number; pendingDirAfter: string }> {
  // v3 BLOCKER 4:findingId 用数字索引(Windows 路径合规 + 9a listPending 正则匹配)
  const findingId = String(outcomeIndex);
  // v6 BLOCKER 1:真 spawn forge ack propose(CI=false 让 propose 不被 9a CI 拒绝)
  const res = spawnSync(
    'node',
    [
      forgeCliPath,
      'ack',
      'propose',
      changeId,
      '--finding',
      findingId,
      '--action',
      'resign-c-simcode',
      '--rationale',
      `forge upgrade --resign-markers: C 简码需 user 判定 target severity`,
    ],
    { encoding: 'utf8', env: { ...process.env, CI: 'false' } },
  );
  return {
    exitCode: res.status ?? -1,
    pendingDirAfter: join(process.cwd(), 'forge', 'changes', changeId, '.evidence', 'pending-acks'),
  };
}

/* v6 BLOCKER 1 旧版自写 pending YAML 已**移除** — 真调 ack CLI 走 9a 协议
function _legacyProposeForCSimcodeRemoved(
  changeDir: string,
  changeId: string,
  outcomeIndex: number,
  outcome: Record<string, unknown>,
): Promise<string> {
  const findingId = String(outcomeIndex);
  const pendingPath = join(
    changeDir,
    '.evidence',
    'pending-acks',
    `${findingId}-${Date.now()}.yaml`,
  );
  const pendingContent = stringifyYaml({
    schema: 'forge-pending-ack/v1',
    finding_id: findingId,
    action: 'resign-c-simcode',
    proposer: 'cli-upgrade',
    proposed_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    target_severity_options: ['WARNING', 'SUGGESTION'],
    rationale:
      `v0.4 简码 'C'(clarification)需人工迁移到 v1.0 全名;` +
      `请运行 forge ack confirm <change-id> ${findingId} --target-severity <WARNING|SUGGESTION>`,
    extra: { changeId, originalSeverity: 'C', originalRationale: outcome.rationale ?? null },
  });
  // 用 ack-log helper 接口写 pending(沿 9a 路径)
  const { mkdir } = await import('node:fs/promises');
  await mkdir(join(changeDir, '.evidence', 'pending-acks'), { recursive: true });
  await writeFile(pendingPath, pendingContent, 'utf8');
  return pendingPath;
}
v6 BLOCKER 1 旧版结束 */

/** 获取 git HEAD(沿 archive.ts:isProjectActuallyGit 同模式) */
function getGitHeadOrNull(cwd: string): string | null {
  try {
    return spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .stdout.toString()
      .trim();
  } catch {
    return null;
  }
}
```

- [ ] **Step 2.2: 修改 `src/cli/commands/upgrade.ts` 加 `.option('--resign-markers <changeId>', ...)` flag(v3 BLOCKER 1:option 形态)**

**v3 修订**:对齐 spec line 1763 + master line 503 冻结的 option 形态 `forge upgrade --resign-markers <changeId>`(**不是** subcommand `forge upgrade resign-markers`)。

定位:在 `buildUpgradeCommand` 函数现有 `.option('--gc', ...)` 之后追加新 flag,在主 `.action` 体内分支处理(沿 v0.3 `--recover` / `--gc` 同模式):

```typescript
  const cmd = new Command('upgrade')
    .description('Scan and clean legacy v0.2 harness adapter artifacts(...沿 v0.3)')
    .option('--dry-run', 'SHOW DIFF only, do not stash')
    .option('--recover', 'restore stashed legacy artifacts (24h validity)')
    .option('--gc', 'delete expired stashes (>24h)')
    // plan-9j v3 BLOCKER 1 新增:option 形态 resign-markers(对齐 spec line 1763 + master line 503)
    .option(
      '--resign-markers <changeId>',
      'plan-9j Task 2:一次性升级 v0.4 change marker 到 v1.0 schema(简码映射 + resigned_by_tool_version 字段)',
    )
    .action(async (opts: UpgradeOptions & { resignMarkers?: string }) => {
      // v3 BLOCKER 1:option 形态 — opts.resignMarkers 而非 subcommand argument
      // 先处理 v0.3 现有 --recover/--gc/legacy upgrade 路径(不动);若 opts.resignMarkers 非空,走新分支
      if (opts.resignMarkers) {
        // CI 模式检测(沿 9a ack propose 同模式)
        if (process.env['CI'] === 'true') {
          process.stderr.write(
            'forge upgrade --resign-markers: CI mode 拒绝(set ack.allow_ci_mode=true to override)\n',
          );
          process.exit(2);
        }
        const forgeRoot = join(process.cwd(), 'forge');
        const { resignChangeMarkers } = await import('../../core/upgrade/resign-markers.js');
        // v7 BLOCKER 1:计算 forgeCliPath(dist/cli/index.js 真路径,沿 process.argv[1] 或 import.meta.url 推导)
        // process.argv[1] 是当前运行的入口脚本(即 dist/cli/index.js;npx forge 时同);测试可 mock
        const forgeCliPath = process.argv[1] ?? '';
        const results = await resignChangeMarkers(forgeRoot, opts.resignMarkers, forgeCliPath);

        // 输出报告
        let allResigned = true;
        let anyNeedsCPropose = false;
        for (const r of results) {
          console.log(r.message);
          if (r.kind === 'needs-c-propose') {
            anyNeedsCPropose = true;
            allResigned = false;
          }
          if (r.kind === 'failed') allResigned = false;
        }

        if (anyNeedsCPropose) process.exit(1);
        if (!allResigned) process.exit(1);
        if (results.every((r) => r.kind === 'skipped-already-v1')) {
          console.log(`✓ ${opts.resignMarkers}: 全部 marker 已是 v1.0+,无需 resign`);
        } else {
          console.log(`✓ ${opts.resignMarkers}: marker 已升级,resigned_by_tool_version=1.0.0 + legacy meta`);
        }
        process.exit(0);
      }

      // v3:option 形态分支结束;后续走 v0.3 legacy adapter 清理路径
      const projectRoot = process.cwd();
      if (opts.recover) { await runRecover(projectRoot); return; }
      if (opts.gc) { await runGc(projectRoot); return; }
      await runUpgrade(projectRoot, opts);
    });
```

- [ ] **Step 2.3: build + 跑 resign-markers 测试**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm build && pnpm test tests/cli/upgrade-resign-markers.test.ts
```

预期:**10 case PASS**(v5 修订)。stage 8(事务回滚)在 Windows 端 chmod 模拟不工作,会 skip;POSIX 端跑实测。其余 +2 case(created 保留 + 真调 ack CLI pending file 数字 findingId)跨平台跑。

### Step 3: Typecheck + format + commit

- [ ] **Step 3.1: 全本地 verify 子集**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

预期:全过。

- [ ] **Step 3.2: commit Task 2**

```bash
git -C D:/ClaudeProject/opsp/forge-repo add src/core/upgrade/resign-markers.ts src/cli/commands/upgrade.ts tests/cli/upgrade-resign-markers.test.ts
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9j Task 2): forge upgrade --resign-markers option + 10 case 单测

沿 design §3.4.4 + §2.3.5 简码迁移:
- S → CRITICAL / L → SUGGESTION 自动映射
- C 简码 / blocking 字符串 → 走 ack.ts propose 路径(交互式询问 target severity)
- 不自动填空 verify_findings / pause_decisions / process_evidence(改标 process_evidence_unavailable_legacy)
- 写 ack-log.jsonl action=resign 行(沿 9a 协议)

CI 模式拒绝(env CI=true → exit 2);干净状态(已是 v1.0+)skip;阶段事务失败时 marker 未改。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

预期:commit 成功。

---

## 4. Task 3 — archive.ts legacy 精确豁免表 + **resigned-aware 互斥规则**(v2 BLOCKER 2)+ **process_evidence fail-closed**(v2 BLOCKER 6)+ 17 case

**v2 修订要点**:
- **BLOCKER 2**:互斥规则 `legacy=true ⊥ created_by_tool_version>=1.0.0` 改为 `legacy=true ⊥ (created_by_tool_version>=1.0.0 且 resigned_by_tool_version 缺失)`(resigned 后 marker 允许 legacy + 1.0.0 共存)
- **BLOCKER 6**:legacy=true 时若含 `process_evidence` 整字段 → 拒签(fail-closed,反向加固 #9 placeholder;沿 #11/#12 同模式)
- 测试 case 数 15 → **17**(+2:resigned-aware 互斥 + process_evidence 反向加固)



**Files**:
- Create: `src/core/archive/legacy-exemption.ts`(新建 module)
- Create: `tests/core/archive/legacy-exemption.test.ts`(**v3:17 case** — 加 resigned-aware 互斥 + process_evidence fail-closed 反向加固)

### Step 1: 先写 legacy-exemption 测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/core/archive/legacy-exemption.test.ts`**

```typescript
// legacy-exemption.test.ts — plan-9j Task 3 单测
// 13 不变量豁免矩阵 13 case + 互斥校验 2 case + v3 +2(resigned-aware 互斥 + process_evidence fail-closed) = **17 case**
// 沿 design §3.4.4.1 精确豁免表 + 反向加固

import { describe, it, expect } from 'vitest';
import { validateLegacyExemption } from '../../../src/core/archive/legacy-exemption.js';

// 合法 v0.4 legacy marker baseline
const baseLegacyMarker = {
  schema: 'forge-verify/v1',
  verified_at: '2025-08-01T10:00:00Z',
  verified_by: 'ai-agent',
  tasks_hash: 'sha256:' + 'a'.repeat(64),
  content_hash: 'sha256:' + 'b'.repeat(64),
  evidence: [],
  process_evidence_unavailable_legacy: true,
  // 注意:无 created_by_tool_version 字段,等价 <1.0.0
};

describe('validateLegacyExemption', () => {
  it('legacy marker 缺 created_by_tool_version → 视为 legacy,豁免通过', () => {
    const result = validateLegacyExemption(baseLegacyMarker);
    expect(result.valid).toBe(true);
  });

  it('legacy marker + created_by_tool_version=0.4.0 → 豁免通过', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      created_by_tool_version: '0.4.0',
    });
    expect(result.valid).toBe(true);
  });

  it('legacy=true + created_by_tool_version=1.0.0 → **互斥拒签**(v1.0 marker 不允许 legacy 标记)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence_unavailable_legacy: true,
      created_by_tool_version: '1.0.0',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /互斥|legacy.*1\.0\.0/.test(e.message))).toBe(true);
  });

  it('legacy=true + created_by_tool_version=1.1.0 → 互斥拒签(任何 >=1.0.0 都不允许)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence_unavailable_legacy: true,
      created_by_tool_version: '1.1.0',
    });
    expect(result.valid).toBe(false);
  });

  it('非 legacy(无 process_evidence_unavailable_legacy 字段)→ 走 strict 路径,本函数不裁决(返通过)', () => {
    const { process_evidence_unavailable_legacy, ...nonLegacy } = baseLegacyMarker;
    void process_evidence_unavailable_legacy;
    const result = validateLegacyExemption(nonLegacy);
    // 本函数仅校验 legacy=true 的不变量;legacy=false 不裁决,交给 strict fence 处理
    expect(result.valid).toBe(true);
  });

  // —— 13 不变量豁免矩阵 ——

  it('不变量 #1-#8 跳过(legacy marker 无 process_evidence,无需校验 timestamp/SHA/exit_code 等)', () => {
    // 沿 design §3.4.4.1 第 1-8 行:legacy=true 全部跳过
    // 校验方法:legacy marker 无 process_evidence 子字段,validateLegacyExemption 返通过即可
    const result = validateLegacyExemption(baseLegacyMarker);
    expect(result.valid).toBe(true);
  });

  it('不变量 #9 保留(JCS hash 校验 marker 整体完整性)— marker 字段未篡改 → 通过', () => {
    // 实施:legacy-exemption 内部不重算 hash(那是 verify-findings-fence 的事)
    // 本函数仅在 marker 字段层面校验;hash 校验由现有 marker-integrity.ts 处理
    // 此 case 验证 legacy-exemption 函数不影响 marker hash 路径
    const result = validateLegacyExemption(baseLegacyMarker);
    expect(result.valid).toBe(true);
  });

  it('不变量 #10 跳过(env_hash 一致性,legacy 无 env_hash 字段)', () => {
    const result = validateLegacyExemption(baseLegacyMarker);
    expect(result.valid).toBe(true);
  });

  it('不变量 #11 反向加固:legacy marker **不应该**有 tdd_exemption 字段,有则拒签', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      tdd_exemption: { rationale: 'fake exemption' }, // 试图加 tdd_exemption 绕过 fence
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /tdd_exemption.*legacy/.test(e.message))).toBe(true);
  });

  it('不变量 #12 反向加固:legacy marker **不应该**有 process_verification_mode 字段,有则拒签', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_verification_mode: 'sample', // 试图加该字段
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /process_verification_mode.*legacy/.test(e.message))).toBe(
      true,
    );
  });

  it('不变量 #13 跳过(timeout 行为,legacy 无重跑)', () => {
    const result = validateLegacyExemption(baseLegacyMarker);
    expect(result.valid).toBe(true);
  });

  // —— 互斥校验 + 反向加固边界 ——

  it('legacy=true + created_by_tool_version=2.0.0-alpha.1 → 互斥拒签(任何 >=1.0.0 prerelease 也算)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      created_by_tool_version: '2.0.0-alpha.1',
    });
    expect(result.valid).toBe(false);
  });

  it('legacy=true + 同时含 tdd_exemption + process_verification_mode → 两条 fence 都触发,拒签', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      tdd_exemption: { rationale: 'x' },
      process_verification_mode: 'sample',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('process_evidence_unavailable_legacy=false 显式标 → 不算 legacy,本函数返通过(交给 strict)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence_unavailable_legacy: false,
    });
    expect(result.valid).toBe(true);
  });

  it('process_evidence_unavailable_legacy=1(非 boolean)→ 严格类型校验拒签', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence_unavailable_legacy: 1, // 非 boolean
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /process_evidence_unavailable_legacy.*boolean/.test(e.message))).toBe(
      true,
    );
  });

  // v3 BLOCKER 5 新增:resigned-aware 互斥 allow + process_evidence 反向加固
  it('legacy=true + created_by_tool_version=1.0.0 + resigned_by_tool_version=1.0.0 → **允许通过**(resigned-aware,v3 BLOCKER 2)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence_unavailable_legacy: true,
      created_by_tool_version: '1.0.0',  // 注意:created 1.0.0(原本应互斥)
      resigned_by_tool_version: '1.0.0', // 但 resigned 字段存在 → 允许通过
    });
    expect(result.valid).toBe(true);
  });

  it('legacy=true + process_evidence 整字段(伪造)→ **fail-closed 反向加固**(v3 BLOCKER 6)', () => {
    const result = validateLegacyExemption({
      ...baseLegacyMarker,
      process_evidence: { fake: 'tampered process_evidence' }, // 试图加 process_evidence 绕开 fence
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /process_evidence.*legacy|integrity|tamper/.test(e.message))).toBe(
      true,
    );
  });
});
```

- [ ] **Step 1.2: 跑测试确认全红**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/archive/legacy-exemption.test.ts
```

预期:模块未实现 → **17 ERROR**(v3 BLOCKER 5+6 修订:15 + 2 = 17)。

### Step 2: 实现 legacy-exemption module

- [ ] **Step 2.1: 创建 `src/core/archive/legacy-exemption.ts`**

```typescript
// src/core/archive/legacy-exemption.ts — plan-9j Task 3
// 沿 design §3.4.4.1 精确豁免表 + 反向加固
// 13 不变量中 #1-8/10/13 跳过;#9/11/12 保留 + 反向加固;legacy=true ⊥ (created>=1.0.0 且 resigned 缺失) 互斥(v6 修订 resigned-aware)

import { type ValidationResult, ok, failed, mergeResults } from '../validate/types.js';

/** v0.4 marker 视为 legacy 的 semver 上界(<1.0.0) */
const V10_SEMVER_RE = /^[1-9]\d*\./; // 主版本 >=1 即视为 v1.0.0+

/**
 * legacy 精确豁免校验(沿 design §3.4.4.1)
 *
 * 规则:
 * 1. 若 process_evidence_unavailable_legacy != true → 非 legacy,本函数不裁决,返通过(strict path 处理)
 * 2. 若是 legacy + created_by_tool_version >=1.0.0 → 互斥拒签
 * 3. 反向加固:legacy marker **不应该**有 tdd_exemption / process_verification_mode 字段
 *
 * @param marker .verify-passed / .review-passed 解析后 Record
 * @param file 可选错误报告用 marker 文件路径
 */
export function validateLegacyExemption(
  marker: Record<string, unknown>,
  file?: string,
): ValidationResult {
  // 1. 字段类型严格校验
  const legacyMeta = marker.process_evidence_unavailable_legacy;
  if (legacyMeta !== undefined && typeof legacyMeta !== 'boolean') {
    return failed({
      artifact: 'marker',
      field: 'process_evidence_unavailable_legacy',
      message: `must be boolean or omitted,实际:${typeof legacyMeta}`,
      file,
    });
  }

  // 2. 非 legacy → 本函数不裁决,返通过(strict path 处理)
  if (legacyMeta !== true) {
    return ok();
  }

  const results: ValidationResult[] = [];

  // 3. 互斥校验(v3 BLOCKER 2 resigned-aware):legacy=true ⊥ (created>=1.0.0 且 resigned 缺失)
  // 沿 design §3.4.4.1 修订规则:resign 后 marker(含 resigned_by_tool_version)允许 legacy + version 共存
  const version = marker.created_by_tool_version;
  const resignedVersion = marker.resigned_by_tool_version;
  if (
    typeof version === 'string' &&
    V10_SEMVER_RE.test(version) &&
    typeof resignedVersion !== 'string'
  ) {
    results.push(
      failed({
        artifact: 'marker',
        field: 'process_evidence_unavailable_legacy',
        message:
          `legacy=true 与 (created_by_tool_version >= 1.0.0 且 resigned_by_tool_version 缺失)互斥(实际 created=${version});` +
          `**原生 v1.0** 创建的 marker 不允许 legacy 标记;resign 后 marker 应同时含 resigned 字段。沿 design §3.4.4.1 修订 + v2 BLOCKER 2 选项 C`,
        file,
      }),
    );
  }

  // v3 BLOCKER 6 反向加固 #9 placeholder:legacy=true 时若含 process_evidence 整字段 → 拒签
  // 沿 design §3.4.4.1 line 1798 关键不变量保留 + 9g 未完成 fail-closed
  if (marker.process_evidence !== undefined && marker.process_evidence !== null) {
    results.push(
      failed({
        artifact: 'marker',
        field: 'process_evidence',
        message:
          `legacy marker 不应该有 process_evidence 整字段(legacy 没走 v1.0 process_evidence 协议;` +
          `若有则疑似 tamper 或工具伪造,fence 拒签 — 沿 design §3.4.4.1 #9 反向加固,9g 未完成时 fail-closed)`,
        file,
      }),
    );
  }

  // 4. 反向加固 #11:legacy marker 不应有 tdd_exemption 字段
  if (marker.tdd_exemption !== undefined && marker.tdd_exemption !== null) {
    results.push(
      failed({
        artifact: 'marker',
        field: 'tdd_exemption',
        message:
          `legacy marker 不应该有 tdd_exemption 字段(疑似 tamper:legacy marker 没走 v1.0 协议);` +
          `沿 design §3.4.4.1 不变量 #11 反向加固`,
        file,
      }),
    );
  }

  // 5. 反向加固 #12:legacy marker 不应有 process_verification_mode 字段
  if (
    marker.process_verification_mode !== undefined &&
    marker.process_verification_mode !== null
  ) {
    results.push(
      failed({
        artifact: 'marker',
        field: 'process_verification_mode',
        message:
          `legacy marker 不应该有 process_verification_mode 字段(同上反向加固);` +
          `沿 design §3.4.4.1 不变量 #12`,
        file,
      }),
    );
  }

  return mergeResults(...results);
}
```

- [ ] **Step 2.2: 跑 17 case 测试 → PASS**(v5 BLOCKER 4 修订:含 +2 case resigned-aware + process_evidence fail-closed)

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/archive/legacy-exemption.test.ts
```

预期:**17 PASS**(v3 BLOCKER 5 + 6 修订:15 baseline + 2 新加 resigned-aware + process_evidence fail-closed)。

### Step 3: Typecheck + format + commit

- [ ] **Step 3.1: 跑全本地 verify 子集**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm format:check
```

- [ ] **Step 3.2: commit Task 3**

```bash
git -C D:/ClaudeProject/opsp/forge-repo add src/core/archive/legacy-exemption.ts tests/core/archive/legacy-exemption.test.ts
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9j Task 3): archive legacy-exemption 模块 + 17 case 单测(v5 修订)

沿 design §3.4.4.1 精确豁免表 + v3 BLOCKER 5/6 修订:
- 13 不变量中 #1-8/10/13 跳过(legacy marker 无 process_evidence 子字段)
- #9/11/12 保留 + 反向加固(legacy marker 不应有 tdd_exemption / process_verification_mode 字段)
- **legacy=true ⊥ (created_by_tool_version >= 1.0.0 且 resigned_by_tool_version 缺失)** 互斥
  (resigned-aware:resigned 后 marker 允许 legacy + version 共存,沿 v2 选项 C)
- **legacy=true + process_evidence 整字段 → fail-closed 拒签**(v3 BLOCKER 6 反向加固 #9 placeholder)

archive.ts 集成在 Task 5。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

预期:commit 成功。

---

## 5. Task 4 — archive.ts version-retrograde-fence + **fail-closed git error**(v2 MAJOR 1)+ ack-log cross-check + 7 case

**v2 修订要点**:
- **MAJOR 1**:`try { git log } catch { return ok() }` 改为先 `git rev-parse --is-inside-work-tree` 区分 non-git(返 ok)vs git error(返 failed,fail-closed);加 ack-log cross-check 防御 git history rewrite(若 ack-log 有 resign 行但 git history 无对应版本字段变更 → 视为 tamper,拒签)
- 测试 case 数 6 → **7**(+1:non-git 区分)



**Files**:
- Create: `src/core/archive/version-retrograde-fence.ts`(新建 module)
- Create: `tests/core/archive/version-retrograde-fence.test.ts`(**7 case 实测 + 1 it.todo**;v3 MAJOR 1 + v7 MAJOR 1 修订:case 7 = non-git best-effort 真实测,fail-closed git error 留 it.todo 9z release 解锁)

### Step 1: 先写 retrograde fence 测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/core/archive/version-retrograde-fence.test.ts`**

```typescript
// version-retrograde-fence.test.ts — plan-9j Task 4 单测
// 7 case 实测 + 1 it.todo:retrograde 拒签 / 非 git 跳过 / 合法 semver / tamper 检测 / 缺字段 / 上升路径 / **non-git fake gitDir best-effort**(v7 MAJOR 1 真名实对齐)+ it.todo: git repo 内 log 失败 fail-closed

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateVersionRetrograde } from '../../../src/core/archive/version-retrograde-fence.js';

interface GitMarkerCtx {
  tmpRoot: string;
  markerPath: string;
}

function setupGitRepoWithMarker(history: string[]): GitMarkerCtx {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9j-retrograde-'));
  execFileSync('git', ['init', '-q'], { cwd: tmpRoot });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpRoot });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: tmpRoot });
  const markerPath = join(tmpRoot, '.verify-passed');
  for (const version of history) {
    const marker = `schema: forge-verify/v1
verified_at: 2026-05-12T14:30:00Z
verified_by: ai-agent
tasks_hash: sha256:${'a'.repeat(64)}
content_hash: sha256:${'b'.repeat(64)}
evidence: []
created_by_tool_version: '${version}'
`;
    writeFileSync(markerPath, marker, 'utf8');
    execFileSync('git', ['add', '.verify-passed'], { cwd: tmpRoot });
    execFileSync('git', ['commit', '-q', '-m', `bump to ${version}`], { cwd: tmpRoot });
  }
  return { tmpRoot, markerPath };
}

describe('validateVersionRetrograde', () => {
  const cleanupDirs: string[] = [];
  afterEach(() => {
    for (const d of cleanupDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('合法 retrograde 缺失(单 commit 1.0.0)→ 通过', async () => {
    const ctx = setupGitRepoWithMarker(['1.0.0']);
    cleanupDirs.push(ctx.tmpRoot);
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(ctx.markerPath, marker, ctx.tmpRoot);
    expect(result.valid).toBe(true);
  });

  it('retrograde 检测:历史含 1.0.0,当前 0.4.0 → 拒签', async () => {
    // 历史先 1.0.0 后改成 0.4.0
    const ctx = setupGitRepoWithMarker(['1.0.0', '0.4.0']);
    cleanupDirs.push(ctx.tmpRoot);
    const marker = { created_by_tool_version: '0.4.0' };
    const result = await validateVersionRetrograde(ctx.markerPath, marker, ctx.tmpRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /retrograde|tamper/.test(e.message))).toBe(true);
  });

  it('上升路径 0.4.0 → 1.0.0 → 通过', async () => {
    const ctx = setupGitRepoWithMarker(['0.4.0', '1.0.0']);
    cleanupDirs.push(ctx.tmpRoot);
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(ctx.markerPath, marker, ctx.tmpRoot);
    expect(result.valid).toBe(true);
  });

  it('非 git 项目 → 跳过(best-effort,沿 v0.4 git fence)', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9j-retrograde-nogit-'));
    cleanupDirs.push(tmpRoot);
    const markerPath = join(tmpRoot, '.verify-passed');
    writeFileSync(markerPath, 'schema: forge-verify/v1\ncreated_by_tool_version: 1.0.0\n');
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(markerPath, marker, tmpRoot);
    expect(result.valid).toBe(true);
  });

  it('marker 缺 created_by_tool_version 字段 → 跳过(老 marker 兼容)', async () => {
    const ctx = setupGitRepoWithMarker(['1.0.0']);
    cleanupDirs.push(ctx.tmpRoot);
    const marker = {}; // 无字段
    const result = await validateVersionRetrograde(ctx.markerPath, marker, ctx.tmpRoot);
    expect(result.valid).toBe(true);
  });

  // v7 MAJOR 1 修订(名实对齐):case 7 改为 non-git best-effort 真实测;
  //   真 git repo 内 git log 失败的 fail-closed 路径留作 it.todo + 9z release 解锁
  it('非 git path(fake gitDir,rev-parse 失败)→ best-effort 跳过(返 ok)— v3 MAJOR 1 非 git 路径', async () => {
    const fakeGitDir = mkdtempSync(join(tmpdir(), 'forge-9j-fake-git-'));
    cleanupDirs.push(fakeGitDir);
    const markerPath = join(fakeGitDir, '.verify-passed');
    writeFileSync(markerPath, 'schema: forge-verify/v1\ncreated_by_tool_version: 1.0.0\n');
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(markerPath, marker, fakeGitDir);
    expect(result.valid).toBe(true); // non-git best-effort
  });

  // v7 MAJOR 1:真 git repo 内 git log 失败 fail-closed 路径 — 用文件操作难模拟,留 it.todo + 9z release gate 解锁
  it.todo(
    'git repo 内 git log 命令失败(模拟 git binary 异常)→ fail-closed 拒签(v3 MAJOR 1;9z release plan 解锁 — 需要 mock spawn 或注入失败 child_process)',
  );

  it('历史含 2.0.0 prerelease,当前 1.0.0 → 拒签(prerelease 也算 retrograde)', async () => {
    const ctx = setupGitRepoWithMarker(['2.0.0-alpha.1', '1.0.0']);
    cleanupDirs.push(ctx.tmpRoot);
    const marker = { created_by_tool_version: '1.0.0' };
    const result = await validateVersionRetrograde(ctx.markerPath, marker, ctx.tmpRoot);
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 1.2: 跑测试确认全红**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/archive/version-retrograde-fence.test.ts
```

预期:6 ERROR(模块未实现)。

### Step 2: 实现 version-retrograde-fence module

- [ ] **Step 2.1: 创建 `src/core/archive/version-retrograde-fence.ts`**

```typescript
// src/core/archive/version-retrograde-fence.ts — plan-9j Task 4
// 沿 design §3.4.4.3 — 校验 created_by_tool_version 字段不能从高版本回降低版本

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { relative } from 'node:path';
import { type ValidationResult, ok, failed } from '../validate/types.js';

const execFileAsync = promisify(execFile);

/** semver 字符串解析为可比较数组 [major, minor, patch] — 忽略 prerelease/build */
function parseSemver(v: string): [number, number, number] | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1] ?? '0', 10), parseInt(m[2] ?? '0', 10), parseInt(m[3] ?? '0', 10)];
}

/** 比较两个 semver — return >0 if a>b, <0 if a<b, 0 if equal */
function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0; // 非 semver 视为相等(由 marker-schema 检 + 拒签)
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

/**
 * 校验 marker 的 created_by_tool_version 字段不能从高版本回降低版本
 *
 * @param markerPath marker 文件绝对路径
 * @param marker 解析后的 Record
 * @param gitDir 可选,git 仓库根目录(用于 `git log`);非 git 项目 → 跳过 best-effort
 */
export async function validateVersionRetrograde(
  markerPath: string,
  marker: Record<string, unknown>,
  gitDir?: string,
): Promise<ValidationResult> {
  const currentVersion = marker.created_by_tool_version;

  // 1. 字段缺失 → 跳过(老 marker 兼容)
  if (typeof currentVersion !== 'string') return ok();

  // 2. 非 git 项目 → 跳过 best-effort(v3 MAJOR 1:用 rev-parse 真实判断,不是仅看 gitDir 参数)
  if (!gitDir) return ok();
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: gitDir });
    // 在 git repo 内 → 继续走 fail-closed 路径
  } catch {
    // 真非 git repo → 跳过 best-effort
    return ok();
  }

  // 3. git log -p <marker-file> 扫描历史中 created_by_tool_version 字段值
  let logOutput: string;
  try {
    const relPath = relative(gitDir, markerPath);
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-p', '--no-color', '--', relPath],
      { cwd: gitDir, encoding: 'utf8' },
    );
    logOutput = stdout;
  } catch (err) {
    // v3 MAJOR 1 修订:**fail-closed git error**(不再 best-effort 全跳)
    // 区分:已经过 rev-parse 确认是 git repo(line 上方),此时 git log 失败应视为异常,拒签
    return failed({
      artifact: 'marker',
      field: 'created_by_tool_version',
      message:
        `version-retrograde fence:git repo 内 git log -p 失败(${(err as Error).message});` +
        `沿 v3 MAJOR 1 修订 — git error 在 git repo 内 fail-closed,防止 git history rewrite 篡改`,
      file: markerPath,
    });
  }

  // 4. 从 diff 中抽取所有 `created_by_tool_version: <semver>` 历史值
  const versionRegex = /[+\-]\s*created_by_tool_version:\s*['"]?([\d.\-+a-zA-Z]+)['"]?/g;
  const historyVersions: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = versionRegex.exec(logOutput)) !== null) {
    if (m[1]) historyVersions.push(m[1]);
  }

  // 5. 找历史最高版本,与 currentVersion 比较
  let highest = currentVersion;
  for (const v of historyVersions) {
    if (compareSemver(v, highest) > 0) highest = v;
  }

  if (compareSemver(highest, currentVersion) > 0) {
    return failed({
      artifact: 'marker',
      field: 'created_by_tool_version',
      message:
        `version retrograde 检测:git history 中曾经为 ${highest},当前 ${currentVersion} — 视为 tamper;` +
        `沿 design §3.4.4.3 — version 字段不接受从高版本回降低版本`,
      file: markerPath,
    });
  }
  return ok();
}
```

- [ ] **Step 2.2: 跑测试 → 7 PASS + 1 it.todo**(v7 MAJOR 1 修订:non-git fake gitDir 真测 + git repo 内 fail-closed 留 it.todo;同步加 release-blocker gate todo count)

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/archive/version-retrograde-fence.test.ts
```

预期:**7 PASS + 1 it.todo**(v7 MAJOR 1 修订)。同步加 release-blocker `EXPECTED_TODO_COUNT_SOFT` 5 → 6(plan-9e1 3 + plan-9j 1 + plan-9c 2);沿 plan-9e1 Task 3 + plan-9c 同模式 release-blocker-attack-path.test.ts 加 9j it.todo 占位。

### Step 3: Typecheck + commit

- [ ] **Step 3.1: 跑 typecheck + format**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm format:check
```

- [ ] **Step 3.2: commit Task 4**

```bash
git -C D:/ClaudeProject/opsp/forge-repo add src/core/archive/version-retrograde-fence.ts tests/core/archive/version-retrograde-fence.test.ts
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9j Task 4): archive version-retrograde-fence 模块 + 7 case 单测(v6 修订:+ fail-closed git error)

沿 design §3.4.4.3:
- git log -p <marker-file> 扫描历史中 created_by_tool_version 字段
- 若历史最高值 > 当前值 → 视为 tamper,fence 拒签
- 非 git 项目跳过(best-effort,沿 v0.4 git fence)
- 字段缺失跳过(老 marker 兼容)

archive.ts 集成在 Task 5。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

预期:commit 成功。

---

## 6. Task 5 — archive.ts 集成 + commands/upgrade.md **创建**(v2 NIT 2 现状无)+ e2e **5 fixture**(v2 MAJOR 2 动态 git history)+ 全本地 verify

**v2 修订要点**:
- **NIT 2**:commands/upgrade.md 现状不存在(plan v1 误以为存在),改为**创建**(若实施前已由他人新增,按段合并)
- **MAJOR 2**:`corrupt-version-retrograde` fixture 改用 e2e `setupFixture()` 动态 `git init` + commit 老版本 + 改新版本(静态目录不会带 git history)
- **新增 fixture 5**:`resign-c-simcode-with-confirm` — C 简码 + user confirm WARNING 后 resign 完整闭环(沿 v2 BLOCKER 4 修复路径 e2e 验证 propose → confirm → 重跑 resign → marker 字段改回)
- **MINOR 3**:commit message 改为"9j 落地 + 用户完成 `forge upgrade --resign-markers` + C confirm 后用户工作流解锁"(消除"自动解锁"误导)



**Files**:
- Modify: `src/cli/commands/archive.ts`(步骤 3.5 之前插入 legacy-exemption + version-retrograde 调用)
- Create: `commands/upgrade.md`(加 §"--resign-markers 用法")
- Create: **5 fixture**(archived-old / active-old-need-resign / new-v1.0 / corrupt-version-retrograde / **resign-c-simcode-with-confirm**)
- Create: `tests/integration/marker-version-end-to-end.test.ts`(**5 case**;含 C confirm 闭环 e2e:setupFixture → spawn upgrade --resign-markers exit 1 → spawn ack confirm --target-severity → 重跑 upgrade --resign-markers exit 0 → spawn archive exit 0)

### Step 1: archive.ts 集成新 fence 调用

- [ ] **Step 1.1: 修改 `src/cli/commands/archive.ts` imports 区追加**

```typescript
// plan-9j Task 5:legacy-exemption + version-retrograde fence
import { validateLegacyExemption } from '../../core/archive/legacy-exemption.js';
import { validateVersionRetrograde } from '../../core/archive/version-retrograde-fence.js';
```

- [ ] **Step 1.2: 在 archive.ts 步骤 3.5(验证 evidence)之前插入新 fence**

定位:archive.ts 现有步骤 3.5 `validateEvidence(verifyRec, verifyPath)` 调用之前。追加:

```typescript
          // 步骤 3.4(plan-9j Task 5):legacy-exemption + version-retrograde fence
          // 沿 design §3.4.4.1 + §3.4.4.3 — 在 evidence 校验之前拦截 legacy marker 异常
          const legacyVerifyResult = validateLegacyExemption(verifyRec, verifyPath);
          if (!legacyVerifyResult.valid) {
            console.error('✗ legacy-exemption fence 拒签(verify-passed):');
            for (const e of legacyVerifyResult.errors)
              console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
          const legacyReviewResult = validateLegacyExemption(reviewRec, reviewPath);
          if (!legacyReviewResult.valid) {
            console.error('✗ legacy-exemption fence 拒签(review-passed):');
            for (const e of legacyReviewResult.errors)
              console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
          const retrogradeVerifyResult = await validateVersionRetrograde(
            verifyPath,
            verifyRec,
            process.cwd(),
          );
          if (!retrogradeVerifyResult.valid) {
            console.error('✗ version-retrograde fence 拒签(verify-passed):');
            for (const e of retrogradeVerifyResult.errors)
              console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
          const retrogradeReviewResult = await validateVersionRetrograde(
            reviewPath,
            reviewRec,
            process.cwd(),
          );
          if (!retrogradeReviewResult.valid) {
            console.error('✗ version-retrograde fence 拒签(review-passed):');
            for (const e of retrogradeReviewResult.errors)
              console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
```

### Step 2: 创建 commands/upgrade.md

- [ ] **Step 2.1: 创建 `commands/upgrade.md`(若不存在)或加 §"--resign-markers 用法"段(若存在)**

```markdown
---
description: 调 forge upgrade CLI(legacy adapter 清理 + marker resign)
argument-hint: '[--resign-markers <changeId>] [--recover] [--gc] [--dry-run]'
---

# /forge:upgrade

包装 `forge upgrade` CLI(v0.3 / plan-9j 落地)。

## 用法 / 选项(v6 MINOR 4:option flag 形态,不是 subcommand)

- `forge upgrade`(无 flag,沿 v0.3):清理 legacy v0.2 harness adapter 产物
- `forge upgrade --resign-markers <changeId>`(plan-9j 新增 option):升级 v0.4 marker 到 v1.0 schema

## --resign-markers 用法(plan-9j Task 2 落地)

```bash
forge upgrade --resign-markers add-oauth-refresh
```

行为:
- **S 简码** → 自动映射 CRITICAL
- **L 简码** → 自动映射 SUGGESTION
- **C 简码** → 写 pending file 到 `.evidence/pending-acks/`,exit 1 + 提示走 `forge ack confirm`
- **不自动填空** verify_findings / pause_decisions / process_evidence(违反 AI 反向加固)
- 改标 `process_evidence_unavailable_legacy: true` meta 字段
- 写 `ack-log.jsonl` action=resign 行

退出码(沿 master §3.12.3):
- 0:全部 marker resigned 或已是 v1.0
- 1:部分需 C 简码 confirm / 阶段事务失败
- 2:CI 模式拒绝(env CI=true)

## C 简码迁移协议(完整流程)

C 简码(clarification)不自动映射(沿 design §2.3.5):用户必须判断目标 severity:

1. 跑 `forge upgrade --resign-markers <changeId>` — 若含 C 简码,exit 1 + 写 pending file
2. 跑 `forge ack confirm <changeId> <findingId> --target-severity WARNING|SUGGESTION`(或走 `/forge:ack-confirm` slash)
3. 重跑 `forge upgrade --resign-markers <changeId>` 完成 resign

## sunset policy

`process_evidence_unavailable_legacy: true` 在 v2.0 sunset(沿 design §3.4.4.2):
- v1.0 / v1.1:合法
- v1.2:warning 加强
- v2.0:拒签,`forge migrate <change-id>` 自动触发 process_evidence 补录

## archive 行为(沿 plan-9j Task 3 / 4)

archive.ts 步骤 3.4 在 evidence 校验之前先跑 legacy-exemption + version-retrograde fence:
- legacy marker 缺 created_by_tool_version 字段或 `<1.0.0` → 走 legacy 路径(13 不变量精确豁免)
- **`legacy=true ⊥ (created_by_tool_version >= 1.0.0 且 resigned_by_tool_version 缺失)`** 互斥(沿 §3.4.4.1 + v6 选项 C resigned-aware):原生 v1.0 marker 不允许 legacy 标记;resigned 后 marker(含 resigned_by_tool_version 字段)允许 legacy + version 共存
- version retrograde(高版本 → 低版本)→ 拒签(沿 §3.4.4.3)
```

### Step 3: 创建 5 fixture(v3 MAJOR 2 + v6 MAJOR 3)

- [ ] **Step 3.1: 创建 `tests/fixtures/marker-version/archived-old/`(已 archived 的 v0.4 marker,冻结不动)**

含两 marker(v0.4 schema 无 `created_by_tool_version` 字段)+ proposal/design/tasks/specs:

```bash
mkdir -p tests/fixtures/marker-version/archived-old/specs
```

(具体文件创建沿 plan-9e1 fixture 同模式,略;tests/integration/marker-version-end-to-end.test.ts 会引用这些目录)

- [ ] **Step 3.2: 创建 `tests/fixtures/marker-version/active-old-need-resign/`(active v0.4 marker 含 S+L+C 简码)**
- [ ] **Step 3.3: 创建 `tests/fixtures/marker-version/new-v1.0/`(v1.0 创建的 marker)**
- [ ] **Step 3.4: 创建 `tests/fixtures/marker-version/corrupt-version-retrograde/`(`created_by_tool_version` 被改 1.0.0 → 0.4.0)**

- [ ] **Step 3.5(v6 MAJOR 3 + v7 MAJOR 2 + v8 MAJOR 2):创建 `tests/fixtures/marker-version/resign-c-simcode-with-confirm/`(C 简码 + user confirm 完整闭环 e2e fixture)**

  目录结构:`proposal.md` / `design.md` / `tasks.md` / `specs/x.md` / `.verify-passed` / `.review-passed`(不预置 `.evidence/`,propose 阶段动态生成)。

  `proposal.md`:

  ```markdown
  # C 简码迁移 Fixture

  ## Why
  test resign-c-simcode 完整 propose → confirm → rerun → archive 闭环

  ## What
  v0.4 marker 含 C 简码 review_outcome,需 user 走 forge ack confirm --target-severity 迁移
  ```

  `design.md`:

  ```markdown
  # Design
  ```

  `tasks.md`:

  ```markdown
  # Tasks

  - [x] t1: implement
  ```

  `specs/x.md`:

  ```markdown
  # X Spec

  ## Scenario: X

  **Given** y
  **When** z
  **Then** w
  ```

  `.verify-passed`(legacy v0.4 marker,缺 `created_by_tool_version` 字段):

  ```yaml
  schema: forge-verify/v1
  verified_at: 2025-08-01T10:00:00Z
  verified_by: ai-agent
  tasks_hash: sha256:placeholder   # e2e setupFixture helper 运行时重算填(沿 plan-9c/plan-9e1 同模式)
  content_hash: sha256:placeholder # 同上
  evidence: []
  ```

  `.review-passed`(含 C 简码 + accepted+rationale 但 unresolved;9j fence 应拦):

  ```yaml
  schema: forge-review/v1
  reviewed_at: 2025-08-01T10:00:00Z
  reviewed_by: ai-agent
  tasks_hash: sha256:placeholder
  content_hash: sha256:placeholder
  git:
    is_git_repo: false
  review_outcomes:
    - severity: C
      accepted: true
      resolved: false
      rationale: v0.4 clarification 需 user 判定 target severity
  ```

  e2e 测试用此 fixture 验证完整 propose→confirm→rerun→archive 链路(详 Step 4.1)。

### Step 4: 创建 e2e 测试 + 跑

- [ ] **Step 4.1: 创建 `tests/integration/marker-version-end-to-end.test.ts`(5 case)**(v6 MAJOR 3 修订:含 resign-c-simcode-with-confirm 完整 e2e:动态 git init → spawn `forge upgrade --resign-markers` → exit 1 + pending file 写 → spawn `forge ack confirm <changeId> 0 --target-severity WARNING` → 重跑 `forge upgrade --resign-markers` → marker 字段写回 WARNING + resigned_by_tool_version=1.0.0 → spawn `forge archive` exit 0)

(测试用 spawn dist binary 真跑 `forge upgrade --resign-markers` + `forge archive`,沿 plan-9e1 e2e 同模式)

- [ ] **Step 4.2: build + 跑 e2e + 全本地 verify**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
```

预期:全 PASS;release-gate **`PASS: 6 it.todo(s) = expected 6`**(v7 MAJOR 1:plan-9c 2 + plan-9e1 3 + plan-9j 1 = 6)。Task 4 Step 2.2 已同步修 `scripts/check-release-gate.mjs` `EXPECTED_TODO_COUNT_SOFT` 5 → 6;Task 5 e2e 通过 release-gate post-hook 验证一致性。

- [ ] **Step 4.3: commit Task 5**

```bash
git -C D:/ClaudeProject/opsp/forge-repo add src/cli/commands/archive.ts commands/upgrade.md tests/fixtures/marker-version/ tests/integration/marker-version-end-to-end.test.ts
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9j Task 5): archive.ts 集成 legacy + retrograde fence + commands/upgrade.md + 5 fixture e2e + 全本地 verify PASS(v6 修订)

- archive.ts 步骤 3.4 插入 legacy-exemption + version-retrograde fence(verify+review marker 两端)
- commands/upgrade.md 加 §"--resign-markers 用法" + C 简码迁移协议 + sunset policy
- **5 fixture**:archived-old / active-old-need-resign / new-v1.0 / corrupt-version-retrograde / **resign-c-simcode-with-confirm**(v6 MAJOR 3:完整 propose→confirm→rerun→archive e2e)

plan-9j 完成 → plan-9e1 三级 fence C 简码硬墙用户工作流解锁。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 7. Task 6(**v2 新增**)— cross-plan 修订 spec/master + 9a ack.ts 扩 + commands 同步

**v2 BLOCKER 2 + 4 + NIT 1 修订关键 task** — 沿 plan-9e1 v5 选项 C 同模式(plan 实施时实际改 master/design 文件,而非空泛 reflection)。

### Task 6.1(**Task 1/2 之前 land**)— cross-plan 修订 spec + master + 9a ack.ts 扩

#### Step 6.1.1:修改 design `docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §3.4.1

定位:§3.4.1 line ~1727 marker yaml 示例之下。追加:

```markdown
**resigned_by_tool_version 字段**(v2 BLOCKER 2 新增):

```yaml
schema: forge-verify/v1
created_by_tool_version: "0.4.0"        # marker 写入时的 forge CLI 版本(原始)
resigned_by_tool_version: "1.0.0"       # 若 marker 经过 forge upgrade --resign-markers,记录 resign 时的 CLI 版本
created_at: 2026-05-12T16:00:00Z
...
```

`resigned_by_tool_version` 字段语义:
- 仅在 marker 经过 `forge upgrade --resign-markers` 后存在
- 与 `created_by_tool_version` 配对使用 — 原始版本 + resign 版本
- archive fence 用此字段区分:**原生** v1.0 marker(无 resigned 字段)vs **resigned** legacy marker(有 resigned 字段)
```

#### Step 6.1.2:修改 design §3.4.4 行为表

定位:§3.4.4 line ~1768 "**加** `created_by_tool_version: "1.0.0"` 字段" 行。修改为:

```markdown
- **保留**原 `created_by_tool_version`(若已有);若缺则**沿用** `<1.0.0` 语义不写
- **加** `resigned_by_tool_version: "1.0.0"`(v2 BLOCKER 2 修订:不改原 version,加 resign 字段)
```

#### Step 6.1.3:修改 design §3.4.4.1 互斥规则

定位:§3.4.4.1 line ~1800 "加固 fence" 段。修改为:

```markdown
加固 fence(v2 BLOCKER 2 修订):
- 原 互斥规则:`legacy=true ⊥ created_by_tool_version >= 1.0.0`
- **新规则**:`legacy=true ⊥ (created_by_tool_version >= 1.0.0 且 resigned_by_tool_version 缺失)`
- 即:**原生 v1.0 创建**的 marker 不允许 legacy 标记;**resign 后**的 marker(有 resigned_by_tool_version 字段)允许 legacy=true + version 字段共存
```

#### Step 6.1.4:修改 master `docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` §3.12.1 加注脚

定位:§3.12.1 marker schema 字段表(line ~438 邻近)。追加注脚:

```markdown
**注脚(plan-9j v2 选项 C 修订)**:
- `created_by_tool_version: string`(可选,缺等价 `<1.0.0`)— marker 写入时的 forge CLI 版本
- `resigned_by_tool_version: string`(可选,仅在 marker 经过 `forge upgrade --resign-markers` 后存在)— resign 时的 forge CLI 版本;与 `created_by_tool_version` 配对区分原生 v1.0 marker vs resigned legacy marker
```

#### Step 6.1.5:扩 `src/cli/commands/ack.ts` 加 `--target-severity` flag + `resign-c-simcode` action(v2 BLOCKER 4)

**9a freeze 例外声明**(v3 MAJOR 2):`src/cli/commands/ack.ts` 是 9a 锁死接口(plan-9j File Structure §1.3 "不修改文件" 中曾列);本 Step 是 **9a interface freeze 显式例外** — 沿 plan-9j v2 BLOCKER 4 + plan-9e1 v5 选项 C 同模式(实施时实际改 9a-frozen 文件,plan-9j 范围内的合规跨越)。**理由**:plan-9j C 简码 resign 路径 需要 user 在 ack confirm 时指定 target severity(WARNING/SUGGESTION),9a 现状 ack propose/confirm 不支持该参数。

具体修改:

```typescript
// src/cli/commands/ack.ts line ~57 propose 子命令加 option
ack.command('propose')
  .description('...')
  .argument('<changeId>', '...')
  .requiredOption('--finding <id>', '...')
  .requiredOption('--action <type>', 'ack 类型,如 ack-warning / ack-critical / **resign-c-simcode**')  // v3 BLOCKER 4 加新 action
  .option('--rationale <text>', '...')
  .option('--target-severity <sev>', 'v3 BLOCKER 4(plan-9j):resign-c-simcode action 用 — 目标 severity (WARNING / SUGGESTION)');

// confirm 子命令同步加 --target-severity option(让 user 在 confirm 时指定)
ack.command('confirm')
  .description('...')
  .argument('<changeId>', '...')
  .argument('<findingId>', '...')
  .option('--target-severity <sev>', 'v3 BLOCKER 4:仅 resign-c-simcode action 必填;confirm 时 user 指定目标 severity 并写回 marker');

// src/core/ack-log.ts AckEntry interface 加可选字段
export interface AckEntry {
  // ... 现有字段
  target_severity?: 'WARNING' | 'SUGGESTION';  // v3 BLOCKER 4:仅 resign-c-simcode action 时非空
}
```

#### Step 6.1.6:修改 master `§6` 修订记录加 v3.2 行

定位:master §6 修订记录段末尾(plan-9e1 v3.1 已加,plan-9j v2 加 v3.2)。追加:

```markdown
- **v3.2**(2026-05-12,plan-9j v2 选项 C 修订):§3.4.1 加 `resigned_by_tool_version` 字段定义 + §3.4.4 行为修订(保留原 version + 加 resigned 字段)+ §3.4.4.1 互斥规则改 resigned-aware;§3.12.1 加 marker 字段注脚;`src/cli/commands/ack.ts` 扩 `--target-severity` flag + `resign-c-simcode` action 类型
```

#### Step 6.1.6.5(v3 MAJOR 1 新增):cross-plan 修订 rollback 指南

Task 6.1 同时改 4 个文件(spec / master / ack.ts / ack-log.ts),实施中任一步失败 → **回滚路径**:

**Case A:未 commit 时失败**(`git restore` 即可):

```bash
cd D:/ClaudeProject/opsp/forge-repo
git restore docs/specs/2026-05-10-v1.0-fusion-completion-design.md
git restore docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md
git restore src/cli/commands/ack.ts
git restore src/core/ack-log.ts
# 重新开始 Step 6.1.1
```

**Case B:已 commit 时失败**(发现错误后):

```bash
cd D:/ClaudeProject/opsp/forge-repo
git log --oneline -3  # 找 Task 6.1 commit hash
git revert <commit-hash>  # 创建 revert commit(不重写历史,保留审计)
# 修订错误后重新提交 Task 6.1
```

**禁止**:不要 `git reset --hard` 或 `git push --force`(沿用户偏好 — 任何 git 撤销操作走显式 revert 不重写历史)。

#### Step 6.1.7:跑 grep 验证 cross-plan 修订无遗漏

```bash
cd D:/ClaudeProject/opsp/forge-repo && grep -n "resigned_by_tool_version" docs/specs/2026-05-10-v1.0-fusion-completion-design.md docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md src/cli/commands/ack.ts
```

预期:**≥ 6 matches**(spec §3.4.1 + §3.4.4 + §3.4.4.1 + master §3.12.1 + §6 v3.2 + ack.ts)。

### Task 6.2(**Task 5 之后**)— commands/archive.md 同步 + 9j 解锁声明

定位:`commands/archive.md` 现有 "C 简码迁移协议" 段(plan-9e1 v4 BLOCKER 1 加)。修改文案:

```markdown
## C 简码迁移协议(plan-9e1 v4 BLOCKER 1 落地 + plan-9j v2 解锁)

`review_outcomes[i].severity = 'C'`(v0.4 clarification 简码)在 v1.0 三级体系中**不直接对应**;archive 阶段会**硬拒签**。

**plan-9j 落地完成后**:用户工作流解锁路径:
1. 跑 `forge upgrade --resign-markers <change-id>` — 若含 C 简码,exit 1 + 写 pending file
2. 跑 `forge ack confirm <change-id> <findingId> --target-severity <WARNING|SUGGESTION>` — user 判定目标 severity
3. 重跑 `forge upgrade --resign-markers <change-id>` — confirm 后 marker `severity` 字段改回全名,archive 通过

**plan-9j 未完成时**(本 plan 实施期间):archive 含 C 简码 marker 仍是阻塞性硬墙(无 manual edit 出口,沿 v4 BLOCKER 1 三道墙)。
```

### Task 6 commit

```bash
git -C D:/ClaudeProject/opsp/forge-repo add docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md docs/specs/2026-05-10-v1.0-fusion-completion-design.md src/cli/commands/ack.ts commands/archive.md
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9j Task 6): cross-plan 修订 spec/master + 9a freeze 例外:ack.ts 扩 --target-severity + commands/archive.md 9j 解锁声明

沿 plan-9j v2 选项 C(plan-9e1 v5 同模式 — reflection 真落地):
- design §3.4.1 + §3.4.4 + §3.4.4.1:加 resigned_by_tool_version 字段 + 互斥规则 resigned-aware
- master §3.12.1 marker schema 字段注脚 + §6 修订记录 v3.2 行
- **9a interface freeze 例外**(沿 plan-9j v3 MAJOR 2 声明):src/cli/commands/ack.ts 加 --target-severity flag + resign-c-simcode action + AckEntry interface target_severity 字段(plan-9j v2 BLOCKER 4 修复路径需要)
- commands/archive.md:C 简码迁移协议段加 9j 解锁三步流程

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 8. 已知降级与风险

### 8.1(v3 MAJOR 3 新增)v0.4 native marker 语义边界条款

**定义**:**v0.4 native marker** = 同时满足三条件:
1. 缺 `process_evidence_unavailable_legacy` 字段(或 = false)
2. 缺 `resigned_by_tool_version` 字段
3. 缺 `created_by_tool_version` 字段(或 `<1.0.0`)

**这种 marker 在 archive fence 中行为**:
- **不被 plan-9j legacy-exemption 拦截**(沿 §1.3 函数注释:`legacyMeta !== true` 时 return ok());走 strict path
- **不被 plan-9j version-retrograde fence 拦截**(沿 Task 4 字段缺失跳过);
- **走 plan-9e1 三级 fence + plan-9d verify-findings fence + plan-9c pause-decisions fence**(superset additive 兼容,老 marker 缺字段等价 [])
- 若含 simcode S/L → 沿 plan-9e1 v4 BLOCKER 1 全名扩 + plan-9j v3 BLOCKER 4 双格式 schema 处理;若含 simcode C → 9e1 三级 fence 硬墙拒签 + 9j C 简码 resign 路径解锁
- 若 schema 校验通过 + 业务 fence 通过 → 可 archive(v0.4 marker 自然过渡到 v1.0 archive 流程)

**为什么不强制 v0.4 marker 走 resign**:用户 v0.4 active change 在 9j 落地前可能积累很多 marker;若 9j 强拦,用户全要回去跑 `forge upgrade --resign-markers` — 高成本。**沿 design §3.4.2 三类 marker 情景 deprecation 路径**:v0.4 marker on v1.0 active change 是 warning(提示 resign),不强制(v1.2 才强制)。

**plan-9j 不拦 v0.4 native 的理由总结**:
- legacy-exemption 仅校验 `legacy=true` 路径,v0.4 native 走 strict(沿 design §3.4.4.1 + plan-9e1 v3 superset additive)
- version-retrograde 仅校验有 created_by_tool_version 字段的 retrograde,v0.4 native 字段缺失跳过(沿 §3.4.4.3)
- 业务 fence(plan-9e1 三级)处理 v0.4 marker 的 simcode → 全名映射 + C 硬墙(沿 §2.3.5 简码迁移)

### 8.2 9g 未完成时 legacy 豁免表 #9 不变量 placeholder

**降级**:design §3.4.4.1 不变量 #9(process_evidence JCS hash 校验 marker 整体完整性)在 9g 未完成时无法实施(因 9g 才会引入 process_evidence 字段 + JCS hash 算法)。

**plan-9j 处理**:legacy-exemption 模块当前不实现 #9(留 placeholder);9g 完成后 9g 实施者在 fence 层加 #9 校验,与 legacy-exemption 并存(legacy marker 跳过 #9,strict marker 走 #9)。

**风险评估**:低 — 9g 是后续 sub-plan,plan-9j 范围正交;不变量 #9 是 "整体完整性"校验,plan-9j 的 retrograde fence 已覆盖一部分(version 字段不能 retrograde)。

### 8.3 Windows 端 spawn ack confirm 测试受限

**降级**:`forge upgrade --resign-markers` 在 Windows 端 spawn 测试不能模拟 readonly 目录(chmod 0o555 在 Windows 不生效)— Task 2 Step 8 测试在 Windows 跳过。

**兜底**:plan-9c v6 同模式 — Windows 跳过的 case 沿 release-blocker `it.todo` 占位策略(若有);本 plan 这一 case 直接条件 skip(`if (process.platform === 'win32') return;`)。

### 8.4 prerelease 版本比较语义弱

**降级**:`compareSemver` 当前只比较 major.minor.patch,忽略 prerelease 后缀。`1.0.0-alpha.1` 与 `1.0.0` 视为相等。

**风险评估**:低 — forge 版本号目前不用 prerelease 链(沿 §1.4 版本叙事 v0.4 → v1.0 → v1.1 主版本递进);prerelease 字段仅 schema 校验允许,实际运行时不会出现。

**v2.0 升级**:若未来用 prerelease 链,这条比较逻辑需扩展(用 `semver` npm 包替代手写)。

### 8.5 git log 扫描性能

**降级**:`git log -p <marker-file>` 在 marker 文件大量改动时输出可能很大(每次 archive 都跑)。

**评估**:marker 文件改动频率低(一个 change 周期 1-2 次 resign + 1 次 archive),性能可接受;若未来 archive 速度有性能需求,可缓存 git log 输出或仅扫最近 N commits。

---

## 9. Self-Review checklist

实施者完成 Task 5 后,**实施前自查**:

1. **Spec 覆盖**(沿 plan-9c / plan-9e1 同模式):
   - design §3.4.1 created_by_tool_version 字段 → Task 1 marker-schema
   - design §3.4.2 三类 marker 情景 → Task 5 e2e 4 fixture
   - design §3.4.3 字段 deprecation 表 → 引用在 commands/upgrade.md + sunset policy
   - design §3.4.4 `--resign-markers` 行为 → Task 2 resign-markers.ts
   - design §3.4.4.1 精确豁免表 → Task 3 legacy-exemption.ts
   - design §3.4.4.2 sunset policy → 引用在 commands/upgrade.md
   - design §3.4.4.3 version retrograde fence + hash 关系 → Task 4 version-retrograde-fence.ts
   - design §2.3.5 简码迁移 → Task 2 resign-markers.ts(S/L 自动 + C propose)

2. **Placeholder scan**:全文搜 TBD / TODO / FIXME / "implement later" — 仅允许 §7.1 9g 未完成时的 #9 placeholder 说明。

3. **类型一致性**:
   - `created_by_tool_version?: string` 字段在四 marker interface 一致
   - `validateLegacyExemption` 函数签名(Task 3)与 archive.ts 调用(Task 5)一致
   - `validateVersionRetrograde` 函数签名(Task 4)与 archive.ts 调用(Task 5)一致

4. **commit 单元粒度**:每 Task 独立 commit;commit message 沿 `feat(9j Task N): <summary>`

5. **codex review 5-8 轮预期**(沿 plan-9c v6 + plan-9e1 v12 模式):
   - 第 1 轮:schema 字段冻结 + legacy-exemption 13 不变量精确豁免 + version retrograde 算法
   - 第 2 轮:resign-markers 模块化 + C 简码 propose 协议 + ack-log 集成
   - 第 3 轮:archive.ts 步骤 3.4 插入位置 + 9e1 已有 fence 顺序
   - 第 4 轮:e2e 4 fixture 占位替换 + git history 模拟
   - 第 5 轮:cross-plan 协议一致性 + commands/upgrade.md 与 commands/archive.md 口径
   - 第 6 轮(可选):工日 / 拆分粒度复盘

---

## 10. 沿 master plan §3.10 工日核算(v5 修订)

| Phase | 子任务 | 工日 P50(v2) | 工日 P90(v2) |
|------|------|---------|---------|
| Task 1 | marker schema + checkSemverString + resigned 字段 + ReviewOutcome union 扩 + 14 case | 0.5 | 0.7 |
| Task 2 | resign-markers **option 形态** + 真调 9a ack CLI + stash/rollback + 10 case | **2.0** | 2.5 |
| Task 3 | legacy-exemption + resigned-aware 互斥 + process_evidence fail-closed + 17 case | 0.6 | 0.8 |
| Task 4 | version-retrograde-fence + fail-closed git error + ack-log cross-check + 7 case | 0.5 | 0.7 |
| Task 5 | archive.ts 集成 + commands/upgrade.md 创建 + 5 fixture e2e(动态 git history)+ 全本地 verify | 0.7 | 0.9 |
| Task 6 | cross-plan 修订 spec/master + 9a ack.ts 扩 + commands/archive.md 同步 | 0.5 | **0.7**(v3 N1:P90 修正 0.4→0.7,P90 不应 < P50)|
| **合计** | | **4.8** | **6.3**(v3 N1 修订:Task 6 P90 0.4 → 0.7,合计 P90 6.0 → 6.3)|

master §3.10 给 9j ~ 2.5d(line 377),v2 +2.3d(P50)— codex 第 1 轮 review 6 BLOCKER + 3 MAJOR 全采纳后大幅上调(沿 plan-9e1 v1 → v12 12 轮 review 上调 1.7d 模式 — v1 估算过乐观,代价是 codex review 收敛迭代)。

**v1 → v2 工日核算**(`P50 2.7 → 4.8`):
- Task 1 +0.1d / Task 2 +1.0d / Task 3 +0.2d / Task 4 +0.1d / Task 5 +0.2d / Task 6 (新)+0.5d
- 合计 v1 2.7 → v2 4.8(+2.1d)

---

(Plan v9 — codex 8 轮 review 0 BLOCKER + 2 MAJOR(1 误读 + 1 真,文档清理)+ 2 MINOR 全采纳;**0 BLOCKER 2 连保持**;**待第 9 轮 codex review 确认收敛**;主体逻辑稳定)
