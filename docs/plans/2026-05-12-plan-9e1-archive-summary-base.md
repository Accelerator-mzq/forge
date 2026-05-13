# Plan 9e1 — archive 软告警基础(archive_summary + 三级 fence + handoff_to_backlog + --resume-summary)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。**特别注意**:本 plan **不是新 skill 开发**(只产 schema/builder/transaction 集成 + 改既有 archive.md);沿 plan-9c / plan-9d 同模式,**不必 invoke `forge:writing-skills`**;走标准 TDD/SDD 即可。

**Goal**:落地 v1.0 §2.4 *archive 软告警放行基础* — archive 阶段在 verify_findings / pause_decisions fence 之后再叠加"三级业务行为"裁决(CRITICAL 拒签 / WARNING acked 通过 / WARNING 缺 ack 拒签 / SUGGESTION 持挂通过),并在 Move 之前生成 `archive_summary.tmp.yaml` 草稿,Move 后 rename 为正式 `archive_summary.yaml`;`handoff_to_backlog` 数组聚合三类入参(verify/review SUGGESTION 持挂 + pause_decisions option=3 转 out-of-scope + 本次新加的 scope-entries Out-of-Scope/Future-Work 条目);失败按 design §2.4.5 三阶段回滚;新增 `forge archive --resume-summary <YYYY-MM-DD-id>` 子命令处理罕见的"Move 完成 + rename 失败"残留;`forge validate` 加孤立 `.tmp` 扫描(active change 目录残留 → WARNING)。

**Architecture**:四层 — (1) **Schema 层**:`src/core/schemas/archive-summary.ts` 锁死 `ArchiveSummary` interface(沿 master §3.12.1bis 9 顶级业务字段 + schema literal identifier + 子接口 `HandoffEntry` / `AckedWarningRef` / `SuggestionRef`);`src/core/validate/archive-summary-schema.ts` 校验 schema/version/必填字段。 (2) **Builder 层**:`src/core/archive/summary-builder.ts` 纯函数 `buildArchiveSummary(verifyMarker, reviewMarker, changeDir, changeId, ctx)` → ArchiveSummary,内部三个 collector:`collectAckedWarnings`(仅 verify_findings WARNING + ack;v2 BLOCKER 3:review_outcomes C 简码 fence 拒签不进 builder)/ `collectPendingSuggestions`(SUGGESTION resolved=false + L 简码直接映射)/ `collectHandoffEntries`(三类聚合);v2 BLOCKER 4:`ScopeEntriesIntegrityError` 抛错路径 → archive exit 1。 (3) **Transaction 层**:`src/core/archive/transaction.ts` 扩展 `ArchiveTransactionInput` 加 `archiveSummary?: ArchiveSummary` 字段;在 Move 之前先把 `.tmp` 写到 source 目录,Move 后 rename `.tmp` → 正式 `archive_summary.yaml`;失败按 design §2.4.5 五阶段回滚链(v2 MAJOR 1:回滚 unlink summary)。 (4) **CLI 层**:`src/cli/commands/archive.ts` 步骤 3.9(verify findings fence + pause decisions fence 之后,ack-log 之前)加 `validateThreeLevelFence`(verify 端 CRITICAL sanity 兜底 / review 端 S/C/L 三分支,**v3 BLOCKER 1 + v4 BLOCKER 1:C 无视 resolved 硬墙拒签**);步骤 5 之前调 `buildArchiveSummary` 传给 transaction;archive 成功后渲染 §2.4.4 输出;加 `--resume-summary <archive-id>` 子模式(rename 前 schema 校验,v2 BLOCKER 5);`src/core/validate/change.ts` 调 `scanOrphanTmp` 给 WARNING(v3 MAJOR 3:扫 `.tmp` + `.yaml` 两者)。 (5) **测试层**:schema 单测 / builder 三类聚合 + 4 抛错单测(v3 MAJOR 2)/ transaction `.tmp` 7 实测 + 3 it.todo 单测 / archive 三级 fence **10 case** 单测(v3 BLOCKER 1+v4 BLOCKER 1)/ archive_summary 渲染单测 / resume-summary 5 case(v3 MINOR 1 加 parse 错)/ orphan-tmp scan **4 case**(v3 MAJOR 3 扫 .yaml)/ e2e **7 fixture**(acked-warning / pending-suggestion / pause-out-of-scope / mixed-all-three / warning-missing-ack-double-fence / review-outcomes-c-rejected / scope-entries-yaml-corrupt;v3 MAJOR 2)。

**Tech Stack**:Node 20+ / TypeScript ESM / commander 12 / `yaml` v2 / vitest / 现有 `src/core/schemas/severity.ts`(9a Severity / Finding)+ `src/core/schemas/scope-entries.ts`(9b ScopeEntry — handoff 第 3 类 input)+ `src/core/markers/types.ts`(9c PauseDecision + 9d VerifyFinding)+ `src/core/archive/transaction.ts`(P3 已有 Move→Sync)+ `src/core/archive/verify-findings-fence.ts` / `pause-decisions-fence.ts`(沿用模块化模式作模板)+ `src/core/parse/{markdown,fenced-yaml}.ts`(9b 抽 scope-entries YAML 块)+ `src/cli/commands/archive.ts`(已有 fence 调用链 + exit code 对齐)。**不引入新 npm 依赖**。

**Spec 引用**:
- design v3 [`2026-05-10-v1.0-fusion-completion-design.md`](../specs/2026-05-10-v1.0-fusion-completion-design.md) §2.4 全节(§2.4.1 基线 / §2.4.2 三级 fence 行为表 / §2.4.3 archive_summary schema + 三类 handoff / §2.4.4 输出格式 / §2.4.5 atomic 序列 + 三阶段回滚 + `.tmp` 生命周期 / §2.4.6 `--force` 不扩展 / §2.4.7 实施清单)+ §2.3.2 三级语义 + §2.3.3 ack 协议(handoff 决定哪些 finding 走 `acked_warnings` 还是 `handoff_to_backlog`)+ §2.6 scope-entries(handoff 第 3 类 input)
- master plan §3.5(plan-9e 概览 P50 3.5 / P90 4.5;§310 line 拆 9e1 基础 2.5d + 9e2 process_evidence 集成 1d;9e1 不依赖 9g)+ §3.12.1bis(archive_summary 9 顶级字段冻结)+ §3.12.2(文件路径冻结:`forge/changes/<id>/archive_summary.tmp.yaml` / `forge/changes/archive/YYYY-MM-DD-<id>/archive_summary.yaml`)+ §3.12.3 CLI exit code 冻结(`forge archive` 1 = fence business-fail / 2 = lock+fs / 3 = corrupt)+ 依赖图 line 90-93(9a/9b/9c/9d → 9e archive 软告警)

**P50 工日**:**4.20**(v5 修订:codex 4 轮 review 0 BLOCKER + 2 MAJOR + 3 MINOR + 1 NIT 全采纳;MAJOR 2 走选项 C **plan-9e1 实施时实际改 master plan**(cross-plan 修订);v4 4.05 → v5 +0.15d 主要 Task 6 加 cross-plan 修订 Step + 文档统一);**P90 工日**:**5.5**

**v6 → v7 关键修订**(codex 6 轮 review 0 BLOCKER + 1 MAJOR + 3 MINOR + 2 NIT 全采纳;MAJOR 是措辞问题 — plan §11 "已落地" 误读为现状已改 master/design,实际是 Task 6 Step 4-pre 实施时落地):
- **MAJOR 1(REMAINING)**:plan §11 写 "状态:已落地",但 plan-9e1 v6 仍是**实施前 plan 文档**,master/design 三处注脚实际未改;codex 检查现状发现不一致。v7 修订:§11 三处状态字段全改 "**实施时落地**(Task 6 Step 4-pre 执行后)" — 区分"plan 文档定义状态" vs "实施后现状"
- **MINOR 1(REMAINING)**:同 MAJOR 1,master §6 修订记录 v3.1 行未实际加(v6 加的是 Step 4-pre.4 实施步骤指引,不是实施结果)。v7 修订:Step 4-pre.4 说明明示 "实施时加 v3.1 行,plan-9e1 v6 阶段未改"
- **MINOR 2(REMAINING)**:plan §11 / Step 4-pre.1/.2/.3 内文残留绝对 line 引用(`master:493-503` / `master:456` / `design:662`);v6 加的 Step 4-pre.6 仅声明改 anchor 未真改。v7 修订:Step 4-pre.6 改为 plan-9e1 内部引用 — 把所有 `master:NNN` / `design:NNN` 形式改为 section anchor(`master §3.12.3` / `master §3.12.1bis` / `design §2.4.3`);Step 4-pre.1/.2/.3 也对应改 anchor 引用
- **MINOR 3(NEW)**:plan-9c v6 头部有 `v5 → v6 关键修订` 段,plan-9e1 头部缺 `v5 → v6 关键修订` 段。v7 修订:header 加 v5 → v6 关键修订 4 项(MAJOR §10 工日同步 / MINOR Step 4-pre.6 anchor / MINOR Step 4-pre.4 master §6 / NIT Step 7→Step 4-pre)
- **NIT 1(REMAINING)**:plan-9e1 line 30 仍有 "新增 Step 7 cross-plan" 字样(v5 修订摘要中的 v4 → v5 描述行)。v7 修订:替换为 "新增 Step 4-pre cross-plan"
- **NIT 2(NEW)**:§10 表头 "工日 P50(v3)" / "工日 P90(v3)" 版本陈旧。v7 修订:改为 "工日 P50(v7)" / "工日 P90(v7)"

**v6 → v7 工日核算**(`P50 4.20 → 4.20`):全文档修订无工日变化。
**v7 → v8 工日核算**(`P50 4.20 → 4.20`):文档措辞收干无工日变化。
**v8 → v9 工日核算**(`P50 4.20 → 4.20`):文档措辞收干 + 表头版本同步无工日变化。
**v9 → v10 工日核算**(`P50 4.20 → 4.20`):**§10 表 Task 6 工日由 0.5/0.65 调到 0.65/0.80**,吸收 cross-plan 修订 + Step 4-pre.4 master §6 + Step 4-pre.6 section anchor 替换的实际工作量;Task 1-6 行加和与合计行算术闭合(沿 codex 第 9 轮 MAJOR 修订)。总工日不变(仅工日在 Task 间重分配)。
**v10 → v11 工日核算**(`P50 4.20 → 4.20`):**§0 总览表 Task 6 P50 由 0.4 同步到 0.65**(codex 第 10 轮僵尸 job log 捕获 finding:§10 已改但 §0 总览表残留旧值);两个表算术闭合一致。总工日不变(纯文档同步)。
**v11 → v12 工日核算**(`P50 4.20 → 4.20`):§10 表头 v10 → v11;line 174 Task 6 注释 "(v10 §10 ...)" → "(v10 修订;v11 §0 同步)"。codex 第 11 轮 MAJOR-A(§0 无 P90 列)经核 plan-9c v6 §0 同结构,**判 codex 误判**(简版设计,非结构 gap);MAJOR-B 残留版本号 2 处采纳进 v12。总工日不变。

**v5 → v6 关键修订**(codex 5 轮 review 全采纳 — 0 BLOCKER + 1 MAJOR + 2 MINOR + 1 NIT;接近收敛):
- **MAJOR 1**:§10 工日表 Task 6 P50 0.4 → 0.5 / P90 0.50 → 0.65;合计 3.95 → 4.20 / 5.20 → 5.50 — 同步 v5 修订摘要
- **MINOR 1**:Step 4-pre 加 Step 4-pre.6 — plan-9e1 内部 `master:NNN` / `design:NNN` 绝对 line 引用改为 section anchor
- **MINOR 2**:Step 4-pre 加 Step 4-pre.4 — master §6 修订记录加 v3.1 行
- **NIT 1**:统一 "Task 6 Step 7" → "Task 6 Step 4-pre"

**v4 → v5 关键修订**(codex 4 轮 review 全采纳;**0 BLOCKER 已说明 plan 主体收敛**;主要文档清理 + MAJOR 2 cross-plan 修订):
- **MAJOR 1(REGRESSION)**:plan §0 前置仅列 9a/9b/9c/9d,但 v4 BLOCKER 1 修订后(C 简码硬墙)用户工作流**实际依赖** 9j 落地才能 archive v0.4 含 C 简码 marker — 两种"依赖"概念混淆(实现 vs 工作流)。v5 修订:plan §0 + 前置段加显式声明 — "**实现依赖**:9e1 不依赖 9j 代码(可独立写)/**用户工作流依赖**:v0.4 含 C 简码 marker 的 archive 路径硬依赖 9j 完成(沿 v4 BLOCKER 1 硬墙);9e1 实施期间该路径阻塞"
- **MAJOR 2(REMAINING)**:plan v4 §11 给上游 master plan 写 reflection 段,但 reflection 不实际改 master 文件 — 后续 master 修订者读不到 §11。**v5 修订(选项 C)**:Task 6 加新 Step "cross-plan 修订" 实际改 master plan 加注脚:
  - master `docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` **§3.12.3** 加注脚:`forge archive --resume-summary` exit 2(9e1 v3 新);主路径 + `--recover` exit 5(v0.4 遗留,待 9z release / 单独 cleanup plan 统一)
  - master **§3.12.1bis** 字段表上方加注脚:"schema literal 字段隐含,沿 forge marker schema 同约定 — 不算业务字段计数"
  - design `docs/specs/2026-05-10-v1.0-fusion-completion-design.md` **§2.4.3** 改 `acknowledged_warnings` → `acked_warnings`(对齐 master `acked_warnings` 字面)
  - plan §11 改 owner 字段为 "状态:已落地(Task 6 Step 4-pre)" + "GH issue 跟进:留作 9z release / cleanup plan owner 接手 exit code 全路径统一"
- **MINOR 1(REMAINING)**:§8 重号修复后 §8.6/§8.7 空缺;line 22 引用指向不存在 §8.6。v5 修订:重编号 §8 连续 — §8.6(C 简码硬墙)/ §8.7(exit code 遗留)/ §8.8(defense-in-depth)/ §8.9(verify fence 角色;原 §8.11);同步交叉引用(plan §0 修订摘要里"plan §8.6 / §8.7" 引用对齐新编号)
- **MINOR 2(REMAINING)**:case / fixture 计数全文残留:line 7 仍写 "9 case 单测" / "6 fixture";line 101 已正确 10/7。v5 修订:line 7 + Architecture 段同步 — "archive 三级 fence **10** case 单测" / "e2e **7** fixture"
- **MINOR 3(NEW)**:commands/archive.md exit code 段 "9e1 不修留 GH issue 跟进" 与 §11.1 "reflection 建议修改 master" 口径并存,用户读两处混淆。v5 修订:v5 选项 C 已让 reflection 落地 master,**统一口径**为 "已知降级,master §3.12.3 加 known limitation 注脚(9e1 Task 6 Step 4-pre 落地),由 9z release / cleanup plan 统一全路径 exit 2";不再说 "9e1 不修留 GH issue"
- **NIT 1(NEW)**:plan §8.10 (现 §8.8)写 "用户跑 `forge verify` 会调 `validateChange`",但仓库**无** `src/cli/commands/verify.ts`;`/forge:verify` slash 命令通过 `commands/verify.md` 调 `forge validate` → `validateChange` → `validateScopeEntries`。v5 修订:措辞改为 "`/forge:verify` slash → `forge validate` → `validateChange` → `validateScopeEntries`"

**v4 → v5 工日核算**(`P50 4.05 → 4.20`):
- Task 6 +0.1d(选项 C — 新增 Step 4-pre cross-plan 修订 master plan + design 注脚 + 测试 master/design 文件改后未破坏现有 plan-9-master 引用)
- 全文文档清理 +0.05d(§8 重号 + line 7 + commands/archive.md 口径)
- 合计 v4 4.05 → v5 4.20(+0.15d)



**v3 → v4 关键修订**(codex 3 轮 review 全采纳;B1 是结构性问题 — v3 给的 "9j 未完成时手动改 marker" 三道墙都走不通):
- **BLOCKER 1(NEW)**:plan v3 给"C 简码 9j 未完成时手动改 .review-passed 中 severity 简码为全名 + 加 severity_acked_by 字段"路径,但三道墙都拦死:
  - (1) `ReviewOutcome` 接口(types.ts:112)`severity: 'S' \| 'C' \| 'L'` — 不接受 'WARNING' / 'SUGGESTION' 全名
  - (2) `marker-schema.ts:336` `REVIEW_OUTCOME_SEVERITY_CODES = new Set(['S','C','L'])` — schema 拒签全名
  - (3) 即使前两墙绕过,WARNING ack 必须 CLI 触发(ack-log-consistency.ts:31 + design §1.5.2 反向加固),手动加 `severity_acked_by` 字段违反协议
  - v4 修订:**删除** manual edit 路径;fence 错误提示改为 "C 简码不允许 archive;**必须**等 9j 完成跑 `forge upgrade --resign-markers`;9e1 fence 是硬墙无 graceful 出口";plan §8.6(C 迁移协议)+ commands/archive.md(C 简码迁移协议)同步修订 — 9e1 实施期间 archive C 简码 marker 是阻塞性硬墙
- **MAJOR 1(REGRESSION)**:v2 Task 6 Step 1.1 commands/archive.md "v1.0 三级分级行为" 段含"`review_outcomes` 端 S/C/L 同步走三级裁决:`S → CRITICAL` / `C → WARNING` / `L → SUGGESTION`;`review_outcomes` 中 acked 等价 `accepted=true + rationale 非空`"— v3 BLOCKER 1 修 fence 后**没同步**这段文档,文档误导用户。v4 修订:Task 6 Step 1.1 文档段删 "C → WARNING 等价" + "accepted+rationale 视为 ack" 错误等价描述;改为 "S → CRITICAL 直接映射 / L → SUGGESTION 直接映射 / **C 简码拒签**(需 9j resign 迁移)"
- **MAJOR 2(NEW)**:`scope-entries-yaml-corrupt` fixture 在真实工作流下不可达 — `forge verify` → `validateChange` → `validateScopeEntries` 早就拦坏 YAML(scope-entries.ts:55-68 抛 FencedYamlParseError → CRITICAL finding → verify exit 1);fixture 只在"预构造 .verify-passed marker + 直接跑 archive"测试场景可达。v4 修订:plan §8.8 加显式说明 "scope-entries-yaml-corrupt fixture 是 9e1 builder defense-in-depth e2e 化验证;真实流程下 verify 阶段已拦,该路径不代表用户工作流;价值在于防 verify 阶段被绕过(用户手动改 marker 后直接 archive)";plan Task 6 Step 3.x e2e case 注释加同模式说明
- **MAJOR 3(NEW)**:plan v3 §8.7 单方面声明 "normal archive / `--recover` exit 5 是 v0.4 遗留,9e1 不修",与 master §3.12.3 line 499 freeze(应 exit 2)不一致,缺跨 plan 协调。v4 修订:plan §8.7 改措辞 — "9e1 不修(改动需重写 archive.test.ts:517 等多处断言,与 9e1 范围正交);**给上游 master plan 写 reflection(plan-9e1 末尾新增 §11 段),建议 master §3.12.3 加 known limitation 注脚 + 指定后续 sub-plan owner**";不再单方面宣称 "v0.4 遗留",改为 "9e1 范围外 + 待 master 协调"
- **MINOR 1(REGRESSION)**:Task 2 case 计数 DoD 17 / overview 13 / 章节 header 11 三处不一致;Task 4 多处 10/11/13;Task 6 标题 6 fixture / 后文 7 fixture。v4 修订:统一 Task 2 = **17 case**(11 baseline + 2 v2 BLOCKER 3 + 4 v3 MAJOR 2);Task 4 fence 子测 = **10 case**(3 verify + 7 review,v3 BLOCKER 1 修后),summary-output 仍 3 case,合计 13;Task 6 = **7 fixture**(v3 MAJOR 2 +1)
- **NIT 1(NEW)**:v3 我在 §8 加新段时编号重复(v3 段写 §8.6/§8.7,但 v2 已存在的 §8.6/§8.7 仍在文档);出现两对编号。v4 修订:v3 新增段改 §8.8/§8.9(保留 v2 §8.6/§8.7 内容)

**v3 → v4 工日核算**(`P50 3.95 → 4.05`):
- Task 4 +0.05d(fence 文案净化 + 测试断言简化)
- Task 6 +0.05d(commands/archive.md 多段修订 + e2e case 注释)
- 合计 v3 3.95 → v4 4.05(+0.1d)



**v2 → v3 关键修订**(codex 2 轮 review 1 BLOCKER + 4 MAJOR + 2 MINOR + 2 NIT 全采纳):
- **BLOCKER 1(REMAINING)**:v2 写 `C + resolved=true → 通过` 错误 — design §2.3.5 line 563 严格读 "`C` 不自动映射,archive 阶段拒签直到 `forge upgrade --resign-markers` 处理",**无关 resolved 状态**(C 简码本质需要 resign 把语义升级到 v1.0 全名,resolved=true 仅表示 v0.4 视角已修但 v1.0 视角 severity 仍未确定)。v3 修订:fence + builder 全部 C 简码无视 resolved/accepted/rationale 拒签;Task 4 测试改"C+resolved=true → 拒签"
- **MAJOR 1(NEW)**:v2 仅让 `--resume-summary` LockHeldError exit 2,显式保留 normal archive / `--recover` exit 5;但 master §3.12.3 line 493 给 `forge archive` lock 错统一 exit 2 — v2 状态 "同命令两条 lock 路径 exit code 不一致"。v3 修订:**9e1 不动 v0.4 遗留**(改动需重写 archive.test.ts 多处断言,且与 9e1 范围正交),plan §8 加显式 known limitation 段 + commands/archive.md 同步说明 + 上游 GH issue stub 跟进 v0.4 全路径对齐 freeze
- **MAJOR 2(NEW)**:`ScopeEntriesIntegrityError` 抛错路径(YAML parse / schema 非法 / anchor_id 不匹配 / entries 非数组)在 Task 2 测试无覆盖;Task 6 e2e fixture 也漏。v3 修订:Task 2 +4 抛错 case + Task 6 +1 fixture `scope-entries-yaml-corrupt`(纯坏 YAML 无 pause_decision option=3,验证 9e1 独立检测路径)
- **MAJOR 3(REMAINING)**:v2 plan transaction rollback `unlink summary.catch(() => {})` 静默吞,失败留 stale summary 但宣称 rolled back。v3 修订(走轻量 Plan B):**不动** transaction rollback 链(unlink 失败 POSIX 极罕见,改 chain 影响 archive.test.ts 多处);`scanOrphanTmp` 扩展同时扫 `archive_summary.tmp.yaml` + `archive_summary.yaml`(active change 不应有任一),让 validate 捕获 rollback 残留;plan §8.5 同步说明
- **MAJOR 4(NEW)**:Task 4 fence C 简码错误提示要求"必须走 forge upgrade --resign-markers",但 9j(plan-9j marker version + deprecation,master §3.10)未完成;v2 plan 前置仅 9a/9b/9c/9d,且 line 104 写"假设 9j 未完成"— 用户跑命令会 unknown command。v3 修订:fence 文案改 graceful guidance:"9j 完成后跑 `forge upgrade --resign-markers`;9j 未完成时需手动改 marker 中 `review_outcomes[].severity` 简码 C 为 v1.0 全名(WARNING / SUGGESTION,由用户判断)";plan §8.7 加 known limitation 段
- **MINOR 1(NEW)**:Task 5 corrupt 测试用 schema literal 错(`not-archive-summary`),未覆盖纯 YAML 语法错(parse 失败)路径;resume-summary.ts 中已有 parse error 分支。v3 修订:Task 5 +1 case(纯 YAML 语法错 `@@@@@`)+ 预期数 4 → 5 case
- **MINOR 2(NEW)**:文本一致性遗漏 — plan header line 7 + Task 6 标题 + commit message 仍写 "5 fixture / critical-rejected" 但 v2 实际 6 fixture / warning-missing-ack-double-fence。v3 修订:全文搜替换
- **NIT 1(NEW)**:`src/core/archive/lock.ts:99` 注释 "实际 callsite 应仅传 'archive' / 'recover'" 加 'resume-summary' 后未同步。v3 修订:Task 5 Step 2.1a 加同步更新注释指引
- **NIT 2(NEW)**:Task 5 工日 +0.1d 偏低(含 LockMode/CLI flag/schema 校验/orphan-tmp scan/dist 测试)。v3 修订:Task 5 P50 0.5 → 0.6(+0.1d);Task 2 +0.15d 含 4 抛错 case 合理保持

**v2 → v3 工日核算**(`P50 3.65 → 3.95`):
- Task 1 +0d(无改动)
- Task 2 +0d(v2 已含 ScopeEntriesIntegrityError;v3 +4 抛错 case 工日含在 v2 0.85d)
- Task 3 +0d
- Task 4 +0.05d(fence C 简码无视 resolved 拒签 + 提示文案 graceful + 测试调整)
- Task 5 +0.1d(校准 v2 低估 — LockMode 注释 + parse 错 case + scanOrphanTmp 扫 .yaml)
- Task 6 +0.15d(新增 fixture scope-entries-yaml-corrupt + e2e case + 文本一致性)
- 合计 v2 3.65 → v3 3.95(+0.3d)

**v1 → v2 关键修订**(codex 1 轮 review 全采纳;沿 plan-9c v6 修订模式):
- **BLOCKER 1**:`src/core/archive/lock.ts:12-20` LockMode union 字面 8 个不含 `'resume-summary'` — Task 5 编译会失败。v2 修订:扩 LockMode 加 `'resume-summary'`;`--resume-summary` LockHeldError exit 5 → **exit 2**(对齐 master §3.12.3 freeze;不动 v0.4 `--recover` 路径的 exit 5 遗留)
- **BLOCKER 2**:Task 1 ArchiveSummary 9 字段表加 `schema` literal 与 master §3.12.1bis 9 字段冻结看似冲突。v2 修订:**保留** `schema` literal(沿所有 forge marker schema 同约定:forge-verify/v1, forge-review/v1, forge-scope-entries/v1, forge-ack-log/v1 都有 schema identifier),plan §0 / Task 1 加注脚 "`schema` 是 YAML schema identifier,不算 master §3.12.1bis 9 业务字段;此字段沿 forge marker schema 约定";同时记录"master §3.12.1bis 建议加注脚明示"作为本 plan 给上游 master 的反馈
  - **附属修订**:design §2.4.3 line 662 字面用 `acknowledged_warnings`,master §3.12.1bis line 467 用 `acked_warnings`;v2 显式声明沿 master(后修,更新 ground truth),plan 沿用 `acked_warnings`
- **BLOCKER 3**:Task 2 builder + Task 4 fence 把 `review_outcomes[i].severity = 'C'`(clarification)当 WARNING 处理 — 违 design §2.3.5 line 559 "C 不自动映射 + archive 阶段拒签 + 提示 forge upgrade --resign-markers"。v2 修订:Task 4 three-level-fence `C + resolved=false` → **拒签 + 提示走 9j**(无论 accepted/rationale);Task 2 builder collector1 / collector2 不收 C 简码(L → SUGGESTION 直接映射保留,沿 design §2.3.5 line 558)
- **BLOCKER 4**:Task 2 builder `collectScopeEntriesHandoff` parse 失败 / schema 非 forge-scope-entries/v1 时静默 `continue` — malformed YAML 可通过 archive 丢失 handoff 条目。v2 修订:新建 `class ScopeEntriesIntegrityError`,builder 内部 parse 失败 / schema 非法 → 抛错;`src/cli/commands/archive.ts` 在 `buildArchiveSummary` 调用点 try/catch 转 exit 1
- **BLOCKER 5**:Task 5 `resumeArchiveSummary` rename 前不读取 `.tmp` 内容;损坏或手放 `.tmp` 会被升级为正式 `.yaml`。v2 修订:rename 前 readFile + parseYaml + `validateArchiveSummarySchema`,失败返 `kind: 'corrupt'` → archive.ts CLI 路径 **exit 3**(沿 master §3.12.3 corrupt 档)
- **MAJOR 1**:Task 3 transaction 回滚链反向 Move 之后把 summary `.yaml` 改回 `.tmp` 名保留 — 违 "rolled back = 状态完全回到事务开始前" 语义,残留 `.tmp` 让下次 validate 报 noisy WARNING。v2 修订:回滚链 `unlink` 任何 summary 文件(无论 `.tmp` / 正式名),重试 archive 时重新生成
- **MAJOR 2**:Task 3 transaction 测试 6 case 漏 4 失败注入路径(`.tmp` 写失败 / rename `.tmp` → 正式名失败 / Backup 失败 / Sync 失败)。v2 修订:`.tmp` 写失败用 readonly source dir 注入(可实测);rename / Backup / Sync 失败用 `it.todo` 占位 + plan-9c 同模式 release-blocker gate(9z plan 解 todo;sof gate 期望 todo 数同步 +3 → `EXPECTED_TODO_COUNT_SOFT = 5`)
- **MAJOR 3**:Task 6 e2e fixture `critical-rejected` 走 WARNING 缺 ack 路径,被 9d verify-findings-fence(step 3.6)拒签,9e1 三级 fence(step 3.9)永远不被触达 — fixture 不能证明 9e1 fence 接入。v2 修订:fixture +1 `review-outcomes-c-rejected`(纯 `review_outcomes[i].severity='C'`,无 verify_findings,9d 跳过,9e1 fence 必须拦);原 `critical-rejected` 改名 `warning-missing-ack-double-fence`(语义清晰为"双 fence 兜底测试")
- **MINOR 1(架构)**:codex 隐含指出 Task 4 three-level-fence verify_findings 端业务行为已被 9d step 3.6 完全覆盖 — 三级 fence 在 verify_findings 端是冗余。v2 修订:three-level-fence `verify_findings` 端仅保 CRITICAL **sanity 兜底**(WARNING/SUGGESTION 不重复处理,由 9d 单源);`review_outcomes` 端是核心(S/C/L 三分支裁决,C 拒签);Task 4 测试比例从 5:3(verify_findings:review_outcomes)调到 2:5
- **NIT 1**:6 个 Task commit block 全 heredoc,Windows/PowerShell 实施者会卡 shell 问题。v2 修订:每个 commit block 注释行加 PowerShell here-string 替代提示(参 plan-9e1 header shell 假设段)

**v1 → v2 工日核算**(`P50 3.1 → 3.65`,沿 9c v6 同模式上调):
- Task 1 +0.05d(schema literal 注脚 + 测试 case 不变)
- Task 2 +0.15d(ScopeEntriesIntegrityError class + C 简码 builder 不收 + 单测 collector1/2 各 +1 case for L 简码)
- Task 3 +0.1d(回滚 unlink + 4 失败 case 中 1 实测 + 3 it.todo)
- Task 4 +0.1d(three-level-fence 重构 verify_findings 端 + review_outcomes C 拒签 + 测试比例调整)
- Task 5 +0.1d(LockMode 扩展 + exit code 修订 + resumeArchiveSummary 加内容校验 + 测试场景 2 由 conflict → corrupt 区分细化)
- Task 6 +0.05d(fixture 重命名 + +1 review-outcomes-c-rejected + e2e 加 case)
- 合计 v1 3.1 → v2 3.65(+0.55d)

**前置(必须完成)**:
- 9a 横切层基础(已完成,`f347329`):`Severity` enum / `Finding` 接口 / `FindingHashPayload` / `ValidationResult` 框架
- 9b out-of-scope schema(已完成,`d15001d`):`ScopeEntry` / `ScopeAnchorId` / `parseFencedYamlBlocks` / `validateScopeEntries` — `handoff_to_backlog` 第 3 类 input 依赖
- 9c apply Fluid Pause Decision Point(已完成,`a9b6ab4`):`PauseDecision` interface + marker `pause_decisions?` superset additive — handoff 第 2 类 input(`chosen_option=3`)依赖
- 9d verify 三维度(已完成,`20e3563`):`VerifyFinding` interface + `verify_findings` fence 模块化模式 + ack-log 一致性 — handoff 第 1 类 input(SUGGESTION 持挂)依赖

**不前置(实现层面)**(9e1 不阻塞,本 plan 可独立写代码):
- 9g process_evidence(留给 9e2):13 不变量校验放到 9e2,本 plan 仅做"三级 fence + summary 基础架构";`process_evidence_summary` 字段 in `ArchiveSummary` 留占位字段,9e1 仅写"placeholder"值,9e2 接 9g 实施后填实(沿 master §3.5 拆分声明 line 310)
- 9j marker version + deprecation:9e1 实现不依赖 9j 代码

**用户工作流软依赖**(v5 MAJOR 1 修订显式声明):
- **9j 完成**:v0.4 含 C 简码 review_outcomes marker 的 archive 路径**硬依赖** 9j 落地(沿 v4 BLOCKER 1 三级 fence 硬墙;9j 提供 `forge upgrade --resign-markers` 是唯一合规迁移路径)
- 9e1 实施期间该用户路径阻塞 — 用户必须等 9j 完成才能 archive v0.4 含 C 简码 marker;含全名 marker 或 S/L 简码 marker 不受影响
- **两种依赖区别**:实现依赖(代码 build OK)vs 工作流依赖(用户能不能 archive);两者独立。9e1 实现可独立 land,但 v0.4 C 简码用户路径阻塞 → 详 §8.6(v5 重号后)

**后续 unblocked**:
- 9e2 process_evidence archive 集成(本 plan 完成 + 9g 完成后,把 `process_evidence_summary` 字段从 placeholder 接到真实 13 不变量统计)
- v1.1 `forge backlog index --scan-archive` 子命令(扫所有 `archive_summary.yaml` 聚合 `handoff_to_backlog` 视图)

**DoD**(完成定义):
- `src/core/schemas/archive-summary.ts` 含 `ArchiveSummary` interface(9 顶级字段)+ `HandoffEntry` / `AckedWarningRef` / `SuggestionRef` / `FinalMarkerState` 子接口(沿 master §3.12.1bis 字段冻结)
- `src/core/validate/archive-summary-schema.ts` 含 `validateArchiveSummarySchema(obj, file?)` 函数(必填字段 / 类型 / schema 字面值 / archived_at ISO 8601 / change_id 非空 / process_evidence_summary placeholder 容忍)
- `src/core/archive/summary-builder.ts` 含 `buildArchiveSummary(verifyMarker, reviewMarker, changeDir, changeId, opts)` 异步函数 + 三 collector `collectAckedWarnings` / `collectPendingSuggestions` / `collectHandoffEntries`
- `src/core/archive/transaction.ts` 扩 `ArchiveTransactionInput.archiveSummary?: ArchiveSummary` + Move 前 `.tmp` 写入步骤 + Move 后 `.tmp` → 正式名 rename + 失败回滚覆盖(沿 design §2.4.5 三阶段表)
- `src/core/archive/resume-summary.ts` 含 `resumeArchiveSummary(forgeRoot, archiveId)` 函数(三场景:正常 rename / 双份冲突拒签 / 状态损坏)
- `src/core/validate/orphan-tmp.ts` 含 `scanOrphanTmp(changeDir)` 函数(检测 `archive_summary.tmp.yaml` 残留在 active change 目录 → WARNING)
- `src/cli/commands/archive.ts` 步骤 3.9 加 `validateThreeLevelFence` 调用点(WARNING+!ack 拒签 / SUGGESTION 持挂通过 / CRITICAL 拒签 sanity)+ 步骤 4.5 加 `buildArchiveSummary` + 传给 `archiveTransaction` + archive 成功后 `renderArchiveSummaryOutput` 渲染输出(§2.4.4)+ `--resume-summary <archive-id>` flag → 调 `resumeArchiveSummary`
- `src/cli/commands/validate.ts`(或 `src/core/validate/change.ts`)加 `scanOrphanTmp` 调用 → warnings
- `commands/archive.md` 加 §"v1.0 三级分级行为" 段(§2.4.2 表)+ §"archive_summary 输出" 段(§2.4.4 模板)+ §"--resume-summary 用法" 段 + §"与其他 sub-plan 合并点" 提示(预期 9e2 / 9g 在 archive.md 再次扩展)
- 测试(v3 修订计数):`tests/core/schemas/archive-summary-schema.test.ts`(必填 / 类型 / 枚举,12 case)+ `tests/core/archive/summary-builder.test.ts`(三 collector × baseline + 边界 + v3 MAJOR 2 ScopeEntriesIntegrityError 4 抛错 case,共 17 case)+ `tests/core/archive/transaction-summary.test.ts`(.tmp 写 / Move 后 rename / 三场景失败回滚,7 实测 + 3 it.todo)+ `tests/cli/archive-three-level-fence.test.ts`(v3 BLOCKER 1 修订 + MAJOR 4 graceful,共 10 case)+ `tests/cli/archive-summary-output.test.ts`(渲染模板,3 case)+ `tests/cli/archive-resume-summary.test.ts`(v3 MINOR 1 +1 case,共 5 case)+ `tests/core/validate/orphan-tmp.test.ts`(v3 MAJOR 3 +2 case 扫 .yaml,共 4 case)+ `tests/integration/archive-summary-end-to-end.test.ts`(**7 fixture** × tmpdir 复制 × 真跑 archive,v3 MAJOR 2 加 scope-entries-yaml-corrupt)+ `tests/fixtures/archive-warnings/{acked-warning,pending-suggestion,pause-out-of-scope,mixed-all-three,warning-missing-ack-double-fence,review-outcomes-c-rejected,scope-entries-yaml-corrupt}/`
- 全本地 verify 通过(`pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test`)

**Shell 假设 + 各 Task commit block 跨 shell 兼容**(沿 plan-9c v3 codex MINOR 9 修订;v2 NIT 1 强化):本 plan 6 个 Task commit block 全用 `git commit -m "$(cat <<'EOF' ... EOF)"` heredoc 形式。**实施者必须先确认当前 shell + 按下表转换**:

| Shell | 直接复制 commit block? | 转换规则 |
|---|---|---|
| Bash / Git-Bash / WSL | ✓ 直接用 | 无需转换 |
| PowerShell 5.1 / 7+ | ✗ 必须改 here-string | `git commit -m "$(cat <<'EOF' ... EOF)"` → `git commit -m @'`(独占一行)→ 内容(`$` / 反引号不展开,与 heredoc `'EOF'` 等价语义)→ `'@`(独占一行,前导无空白) |
| Claude Code Bash tool (Windows) | ✗ 默认走 PowerShell | 同上,或显式指定 Git-Bash 路径 |

**验证当前 shell**:`echo $SHELL`(POSIX) / `$PSVersionTable`(PowerShell)。**实施者每个 commit 前需自查 shell**。

**v2 NIT 1 修订**:不在每个 commit block 重复注释,统一在此处声明;实施者首次跑 Task 1 commit 前先验 shell + 记录转换习惯,后续 Task 2-6 commit block 用同模式复用。

---

## 0. 总览

本 sub-plan 拆 **6 个 task**(沿 plan-9c 5 task / plan-9d 8 task 中间值;6 task 是因为 9e1 横跨"schema + builder + transaction + CLI fence + resume helper + 文档/e2e"五层,每层不可压并):

| Task | 名称 | 工日 P50 | 关键交付 |
|------|------|---------|---------|
| 1 | archive-summary schema 锁死 + 校验单测 | 0.45 | `src/core/schemas/archive-summary.ts` 9 顶级字段 + 子接口 + **schema literal 注脚说明**(v2 BLOCKER 2);`src/core/validate/archive-summary-schema.ts` `validateArchiveSummarySchema`;`tests/core/schemas/archive-summary-schema.test.ts` 12 case |
| 2 | summary-builder 三类聚合 + ScopeEntriesIntegrityError + 单测 | 0.85 | `src/core/archive/summary-builder.ts` `buildArchiveSummary` async + 三 collector + **`ScopeEntriesIntegrityError` 类**(v2 BLOCKER 4)+ **C 简码不进 builder**(v2 BLOCKER 3);`tests/core/archive/summary-builder.test.ts` **17 case**(11 baseline + v2 +2 case L→SUGGESTION 直接映射 / C 简码 builder 跳过 + **v3 MAJOR 2 +4 case** ScopeEntriesIntegrityError 抛错路径) |
| 3 | transaction.ts `.tmp` 写 + rename + 失败 unlink 回滚 + 单测 | 0.8 | `src/core/archive/transaction.ts` 扩 `archiveSummary?` + Move 前 `.tmp` 写 / Move 后 rename / **回滚 unlink summary**(v2 MAJOR 1);`tests/core/archive/transaction-summary.test.ts` **7 case 实测 + 3 it.todo**(v2 MAJOR 2 — `.tmp` 写失败实测 + rename/Backup/Sync 失败 it.todo + release-blocker gate `EXPECTED_TODO_COUNT_SOFT` 同步 2 → 5) |
| 4 | archive.ts 三级 fence(verify 端 sanity / review 端核心 + **C 无视 resolved 全拒签 + graceful 9j 文案**)+ summary 集成 + 渲染 + 单测 | 0.85 | `src/cli/commands/archive.ts` 步骤 3.9 三级 fence + 步骤 4.5 `buildArchiveSummary`(try/catch `ScopeEntriesIntegrityError` → exit 1)+ 步骤 6 渲染;**`src/core/archive/three-level-fence.ts` C 无视 resolved/accepted/rationale 全拒签 + 9j 未完成时 graceful manual migration 提示**(v3 BLOCKER 1 + MAJOR 4);`tests/cli/archive-three-level-fence.test.ts` **10 case**(v3 +1:C+resolved=true 由通过改为拒签;C+accepted=false 单独 case)+ `tests/cli/archive-summary-output.test.ts` 3 case |
| 5 | --resume-summary 子命令(+ schema 校验 + parse error case)+ validate 孤立 .tmp/.yaml 扫描 + 单测 | 0.6 | `src/core/archive/resume-summary.ts` `resumeArchiveSummary`;`src/core/archive/lock.ts` LockMode 扩 + **注释同步更新**(v3 NIT 1);`src/core/validate/orphan-tmp.ts` `scanOrphanTmp` **同时扫 `.tmp` + `.yaml`**(v3 MAJOR 3);`src/cli/commands/archive.ts` 加 `--resume-summary` flag;`tests/cli/archive-resume-summary.test.ts` **5 case**(v3 MINOR 1 +1:纯 YAML 语法错 → exit 3)+ `tests/core/validate/orphan-tmp.test.ts` 4 case(v3 +2:`.yaml` 扫描覆盖) |
| 6 | commands/archive.md + e2e **7 fixture** + **v5 选项 C cross-plan 修订**(Step 4-pre.1/.2/.3/.4 改 master/design + Step 4-pre.6 section anchor)+ 全本地 verify | **0.65** | `commands/archive.md` 加四段 + **C 简码 graceful 9j 文案 + exit 5 遗留声明**(v3 MAJOR 1+4);**7 fixture**(v2 6 + v3 MAJOR 2 加 scope-entries-yaml-corrupt);`tests/integration/archive-summary-end-to-end.test.ts` **7 case**;**Step 4-pre cross-plan 修订 master plan §3.12.3 + §3.12.1bis + §6 + design §2.4.3**(v10 修订:§10 算术闭合工日;v11:§0 总览同步);全本地 verify 全绿 |

**串行约束**:
- Task 1 → Task 2(builder 返回类型即 Task 1 schema)
- Task 2 → Task 3(transaction 入参 `archiveSummary` 即 Task 2 输出)
- Task 1 → Task 4(三级 fence module 不依赖 builder,但 archive.ts 集成 fence + summary 同时改,Task 4 串行最稳)
- Task 3 → Task 4(archive.ts 调 archiveTransaction 时要传 archiveSummary,Task 3 的接口变更需先 land)
- Task 4 → Task 5(--resume-summary 调 transaction 内部 helper,Task 4 的 archive.ts 改完再加 flag)
- Task 5 → Task 6(e2e 跑 archive + resume-summary,Task 5 实施后再写 fixture)

**多 agent 并行可能**:Task 1 / Task 2 不可(类型依赖);Task 2 / Task 3 不可(builder 输出即 transaction 输入);Task 4 / Task 5 不可(都改 archive.ts);Task 5 / Task 6 不可(e2e 依赖 resume-summary)。**6 task 严格串行**,不像 plan-9c Task 3/4 可并行。

**与其他 sub-plan 合并点**(参考 master plan §3.5 + §3.12.2 路径冻结):
- `commands/archive.md`:9e1(三级行为 + summary 输出)+ 9e2(process_evidence_summary 字段从 placeholder 接 9g 真实 13 不变量统计)+ 9g(13 不变量 fence 集成)三方修改。**推荐 merge 顺序 9e1 → 9g → 9e2**(9e1 落基础架构 + placeholder;9g 落 13 不变量;9e2 把 placeholder 接 9g 实施)
- `src/cli/commands/archive.ts`:9e1(三级 fence 步骤 3.9 + summary 步骤 4.5 + 输出步骤 6)+ 9g(13 不变量 fence 在步骤 3.5-3.6 区段)+ 9j(version retrograde fence 已在 archive.ts 现状)。9e1 实施时假定 9g/9j 未完成,在 baseline archive.ts 上插入步骤 3.9 + 4.5 + 6;9g/9j 实施者需 rebase 把"三级 fence / summary 生成 / 渲染"段保留原位置(类比 plan-9c rebase 指引)
- `src/core/archive/transaction.ts`:9e1(`archiveSummary?` 字段 + `.tmp` 阶段)+ 9g(worktree 重跑可能影响 transaction 阶段顺序)。9e1 完成后,9g 在 transaction 内部加 worktree 阶段时,**不动**本 plan 的 `.tmp` 写入 / rename 步骤,只在 verify markers 阶段之前插入 worktree 阶段
- `src/cli/commands/validate.ts` / `src/core/validate/change.ts`:9e1 加 `scanOrphanTmp` 调用 → warnings;与 9d 已落地的 coverage_gap / test_failure_stub / scope-entries 校验共存,只在 results 末尾追加新 warning
- **9e1 与 9g.3 可 Week 4 并行**(沿 master §3.5 line 580):9e1 = archive_summary + 三级 fence 基础不依赖 process_evidence;**9e2 必须在 9g.3 完成后启动**(本 plan 不实施 9e2)

---

## 1. File Structure

### 新增文件

```
src/core/schemas/archive-summary.ts                ← Task 1:ArchiveSummary interface + 子接口 + isFinalMarkerState 类型守卫
src/core/validate/archive-summary-schema.ts        ← Task 1:validateArchiveSummarySchema(obj, file?) — 必填/类型/枚举
src/core/archive/summary-builder.ts                ← Task 2:buildArchiveSummary async + 三 collector
src/core/archive/three-level-fence.ts              ← Task 4:validateThreeLevelFence 模块化(沿 verify-findings-fence.ts 模式)
src/core/archive/summary-render.ts                 ← Task 4:renderArchiveSummaryOutput 把 ArchiveSummary → §2.4.4 模板字符串
src/core/archive/resume-summary.ts                 ← Task 5:resumeArchiveSummary 处理 .tmp / 正式 .yaml 冲突
src/core/validate/orphan-tmp.ts                    ← Task 5:scanOrphanTmp 检测残留 .tmp(返 warning,沿 ValidationResult 模型)
tests/core/schemas/archive-summary-schema.test.ts  ← Task 1:schema 校验 12 case
tests/core/archive/summary-builder.test.ts         ← Task 2:三 collector × baseline + 边界 17 case(v4 修订 — v1 11 + v2 +2 + v3 +4)
tests/core/archive/transaction-summary.test.ts     ← Task 3:.tmp 写 / Move 后 rename / 三场景失败回滚 6 case
tests/cli/archive-three-level-fence.test.ts       ← Task 4:三级 fence 8 case
tests/cli/archive-summary-output.test.ts          ← Task 4:输出渲染 3 case
tests/cli/archive-resume-summary.test.ts          ← Task 5:--resume-summary 3 case
tests/core/validate/orphan-tmp.test.ts            ← Task 5:scanOrphanTmp 2 case
tests/integration/archive-summary-end-to-end.test.ts  ← Task 6:e2e 7 fixture × tmpdir 复制(v3 MAJOR 2 再 +1)
tests/fixtures/archive-warnings/acked-warning/                       ← Task 6:WARNING + 完整 ack + ack-log 一致
tests/fixtures/archive-warnings/pending-suggestion/                  ← Task 6:SUGGESTION 持挂 resolved=false
tests/fixtures/archive-warnings/pause-out-of-scope/                  ← Task 6:pause_decisions chosen_option=3 + scope-entries entry
tests/fixtures/archive-warnings/mixed-all-three/                     ← Task 6:三类 handoff input 都有
tests/fixtures/archive-warnings/warning-missing-ack-double-fence/    ← Task 6:WARNING 缺 ack → 9d fence 先拒签,9e1 sanity 兜底也会拦(v2 MAJOR 3 改名,原 critical-rejected)
tests/fixtures/archive-warnings/review-outcomes-c-rejected/          ← Task 6:纯 review_outcomes C 简码,无 verify_findings,9d 跳过,9e1 fence 必须拦(v2 MAJOR 3 新增)
tests/fixtures/archive-warnings/scope-entries-yaml-corrupt/          ← Task 6:proposal Out-of-Scope 段 YAML 语法错,无 pause_decision option=3,验证 9e1 独立 ScopeEntriesIntegrityError 路径(v3 MAJOR 2 新增)
```

### 修改文件

```
src/core/archive/transaction.ts                    ← Task 3:扩 ArchiveTransactionInput.archiveSummary? + Move 前 .tmp 写 / Move 后 rename / 失败回滚链
src/cli/commands/archive.ts                        ← Task 4:步骤 3.9 加 validateThreeLevelFence + 步骤 4.5 调 buildArchiveSummary + 步骤 6 renderArchiveSummaryOutput;Task 5:加 --resume-summary <archive-id> flag + 子路径
src/core/validate/change.ts                        ← Task 5:加 scanOrphanTmp 调用,append 到 results warnings
commands/archive.md                                ← Task 6:加 §"v1.0 三级分级行为" + §"archive_summary 输出" + §"--resume-summary 用法" + §"与其他 sub-plan 合并点"
```

### 不修改文件(明确边界)

```
src/core/schemas/severity.ts                       ← 9a 锁死,本 plan 复用 Severity / Finding 不动
src/core/schemas/scope-entries.ts                  ← 9b 锁死,本 plan handoff 第 3 类 input 调 ScopeEntry / parseFencedYamlBlocks 不动
src/core/markers/types.ts                          ← 9c/9d 锁死,本 plan 复用 PauseDecision / VerifyFinding 不动
src/core/validate/marker-schema.ts                 ← 9c/9d 锁死,marker schema 校验不变,本 plan 在 fence 层加业务规则
src/core/archive/verify-findings-fence.ts          ← 9d 锁死,沿用模块化模板不动(三级 fence 单独成 three-level-fence.ts 不混入)
src/core/archive/pause-decisions-fence.ts          ← 9c 锁死,沿用不动
src/core/archive/ack-log-consistency.ts            ← 9d 锁死,ack-log 一致性已覆盖 pause_decisions 与 verify_findings WARNING ack,本 plan 不重复
src/core/archive/lock.ts                           ← v0.4 锁死,acquireLock 接口不动
src/cli/commands/validate.ts                       ← Task 5 不改本文件;改 src/core/validate/change.ts(validate.ts 已直接调 validateChange,warnings 自动 propagate)
src/core/templates/skills/index.ts                 ← 不加新 skill registry(本 plan 不新建 skill)
forge-eval/scenarios/                              ← 不加 forge-eval scenario(本 plan 不是新 skill 开发,沿 9c receiving-code-review 同模式)
```

---

## 2. Task 1 — archive-summary schema 锁死 + 校验函数 + 单测

**Files**:
- Create: `src/core/schemas/archive-summary.ts`
- Create: `src/core/validate/archive-summary-schema.ts`
- Create: `tests/core/schemas/archive-summary-schema.test.ts`

**v2 BLOCKER 2 修订 — schema literal 字段注脚**:
- master §3.12.1bis line 458-468 表列出 9 个**业务字段**(version / archived_at / change_id / verify_passed / review_passed / process_evidence_summary / handoff_to_backlog / acked_warnings / pending_suggestions),**未列 `schema` literal**
- 但 design §2.4.3 line 648 YAML 字面**含** `schema: forge-archive-summary/v1`,且所有 forge marker schema(forge-verify/v1, forge-review/v1, forge-scope-entries/v1, forge-ack-log/v1)都有 schema identifier
- v2 修订决策:**保留** `schema` literal 作为 yaml schema identifier(工程常识 / 跨 forge marker 一致约定),与 master §3.12.1bis 9 业务字段不冲突 — schema identifier 不算业务字段
- 同步建议(给上游 master 反馈,不在本 plan 实施):master §3.12.1bis 在 9 字段表上方加注脚 "schema literal 字段隐含,沿 forge marker schema 同约定"
- 字段名 `acked_warnings` 沿 master(line 467)而非 design line 662 字面 `acknowledged_warnings`(后者是 master 二轮修订前的旧字面;master §3.12.1bis 是 freeze ground truth)

### Step 1: 先写 schema 校验失败测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/core/schemas/archive-summary-schema.test.ts`**

```typescript
// archive-summary-schema.test.ts — plan-9e1 Task 1 单测
// 沿 verify-findings-schema.test.ts / pause-decisions-schema.test.ts 模式
// 校验 archive_summary 顶级字段:schema/version/archived_at/change_id/...
// 业务规则(handoff 三类聚合 / process_evidence_summary 真实统计)留给 Task 2 builder + 9e2

import { describe, it, expect } from 'vitest';
import { validateArchiveSummarySchema } from '../../../src/core/validate/archive-summary-schema.js';

// 合法 baseline(沿 design §2.4.3 YAML 示例字面)
const baseSummary = {
  schema: 'forge-archive-summary/v1',
  version: '1.0.0',
  archived_at: '2026-05-12T16:45:00Z',
  change_id: 'add-oauth-refresh',
  verify_passed: { verified_invariants: ['hash-match', 'evidence-complete'] },
  review_passed: { reviewers: ['ai-agent'] },
  process_evidence_summary: {
    placeholder: true, // 9e1 仅写 placeholder,9e2 接 9g 实施后填实
    note: 'process_evidence 13 不变量统计待 9g + 9e2 实施',
  },
  handoff_to_backlog: [],
  acked_warnings: [],
  pending_suggestions: [],
};

describe('archive_summary schema validation', () => {
  it('合法 baseline → 通过', () => {
    const result = validateArchiveSummarySchema(baseSummary);
    expect(result.valid).toBe(true);
  });

  it('schema 字段缺失 → 拒签', () => {
    const { schema, ...rest } = baseSummary;
    const result = validateArchiveSummarySchema(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'schema')).toBe(true);
  });

  it('schema 值不是 forge-archive-summary/v1 → 拒签', () => {
    const result = validateArchiveSummarySchema({ ...baseSummary, schema: 'foo/v2' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /forge-archive-summary\/v1/.test(e.message))).toBe(true);
  });

  it('version 非 semver 字符串 → 拒签', () => {
    const result = validateArchiveSummarySchema({ ...baseSummary, version: 'not-semver' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'version')).toBe(true);
  });

  it('archived_at 非 ISO 8601 → 拒签', () => {
    const result = validateArchiveSummarySchema({
      ...baseSummary,
      archived_at: '2026-05-12 16:45',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'archived_at')).toBe(true);
  });

  it('change_id 空串 → 拒签', () => {
    const result = validateArchiveSummarySchema({ ...baseSummary, change_id: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'change_id')).toBe(true);
  });

  it('verify_passed 非 object → 拒签', () => {
    const result = validateArchiveSummarySchema({
      ...baseSummary,
      verify_passed: 'not-object',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'verify_passed')).toBe(true);
  });

  it('handoff_to_backlog 非数组 → 拒签', () => {
    const result = validateArchiveSummarySchema({
      ...baseSummary,
      handoff_to_backlog: 'not-array',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'handoff_to_backlog')).toBe(true);
  });

  it('acked_warnings 非数组 → 拒签', () => {
    const result = validateArchiveSummarySchema({ ...baseSummary, acked_warnings: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'acked_warnings')).toBe(true);
  });

  it('pending_suggestions 非数组 → 拒签', () => {
    const result = validateArchiveSummarySchema({ ...baseSummary, pending_suggestions: null });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'pending_suggestions')).toBe(true);
  });

  it('process_evidence_summary 缺失 → 拒签(必填,即使 placeholder)', () => {
    const { process_evidence_summary, ...rest } = baseSummary;
    const result = validateArchiveSummarySchema(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'process_evidence_summary')).toBe(true);
  });

  it('handoff_to_backlog 含合法 entry → 通过', () => {
    const result = validateArchiveSummarySchema({
      ...baseSummary,
      handoff_to_backlog: [
        {
          source: 'verify_findings',
          id: 3,
          severity: 'SUGGESTION',
          dimension: 'coherence',
          check_type: 'pattern-consistency',
          evidence: 'src/auth/login.ts:23',
          recommendation: 'rename handleLogin',
        },
      ],
    });
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 1.2: 跑测试确认全红(预期 FAIL — validateArchiveSummarySchema 尚未实现)**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/schemas/archive-summary-schema.test.ts
```

预期:模块 import 报错 `Cannot find module '../../../src/core/validate/archive-summary-schema.js'`,12 case 全 ERROR。

### Step 2: 加 ArchiveSummary schema interface(TDD green Part 1)

- [ ] **Step 2.1: 创建 `src/core/schemas/archive-summary.ts`**

```typescript
// src/core/schemas/archive-summary.ts — plan-9e1 Task 1
// §3.12.1bis Interface Freeze:archive_summary 9 业务字段冻结 + 1 schema identifier
// 沿 design §2.4.3 YAML 字面格式 + master §3.12.1bis 字段表
//
// v2 BLOCKER 2 修订:`schema` literal 字段是 YAML schema identifier(沿所有 forge marker
//   schema 同约定:forge-verify/v1, forge-review/v1, forge-scope-entries/v1,
//   forge-ack-log/v1 都有),**不算 master §3.12.1bis 9 业务字段**。
//   master 9 字段冻结指 version / archived_at / change_id / verify_passed / review_passed /
//   process_evidence_summary / handoff_to_backlog / acked_warnings / pending_suggestions。
//   字段名沿 master(`acked_warnings`)而非 design line 662 字面(`acknowledged_warnings`)。
//
// 后续 sub-plan(9e2 接 process_evidence_summary / v1.1 backlog index)reference 此处,不重定义

import type { Severity } from './severity.js';

/** archive_summary 顶级 schema(9 业务字段 + 1 schema identifier,沿 master §3.12.1bis + v2 BLOCKER 2 注脚) */
export interface ArchiveSummary {
  /**
   * YAML schema identifier(v2 BLOCKER 2:不算 master §3.12.1bis 9 业务字段;
   * 沿 forge marker schema 同约定 — 每个 YAML 产物都有 schema literal 标识)
   */
  schema: 'forge-archive-summary/v1';
  /** semver(沿 forge 自身版本号叙事 §1.4,9e1 写 '1.0.0') */
  version: string;
  /** ISO 8601 UTC */
  archived_at: string;
  /** change id(非空) */
  change_id: string;
  /** verify-passed 摘要(含 verified_invariants 列表;9d verify 三维度填) */
  verify_passed: VerifyPassedRef;
  /** review-passed 摘要(含 reviewers 列表) */
  review_passed: ReviewPassedRef;
  /** process_evidence 13 不变量 pass/fail/legacy 分布;9e1 仅 placeholder,9e2 接 9g 真实统计 */
  process_evidence_summary: ProcessEvidenceSummary;
  /** 给 v1.1 forge backlog index 用 — 三类聚合(沿 design §2.4.3) */
  handoff_to_backlog: HandoffEntry[];
  /** 给用户回顾用 — verify/review 中 WARNING + acked 的引用 */
  acked_warnings: AckedWarningRef[];
  /** SUGGESTION + resolved=false 的引用(handoff 子集,但单独列出方便 §2.4.4 输出按类分段) */
  pending_suggestions: SuggestionRef[];
}

/** verify-passed 摘要 */
export interface VerifyPassedRef {
  /** 已验证的不变量(9d 三维度 / 9g 13 不变量;9e1 至少含 'hash-match' / 'evidence-complete') */
  verified_invariants: string[];
}

/** review-passed 摘要 */
export interface ReviewPassedRef {
  /** reviewer 列表(actor 值;'ai-agent' / 'human-override' / 具体用户名) */
  reviewers: string[];
}

/**
 * process_evidence_summary — 13 不变量分布(9g/9e2 真实填,9e1 仅 placeholder)
 *
 * placeholder=true 表示本字段是 9e1 占位,9e2 实施时改为真实统计:
 *   - placeholder: false
 *   - invariants_passed: number(0-13)
 *   - invariants_failed: number
 *   - legacy_exempt: number(legacy marker 豁免数)
 */
export interface ProcessEvidenceSummary {
  /** true = 9e1 占位;false = 9e2 真实统计 */
  placeholder: boolean;
  /** placeholder=true 时填说明 */
  note?: string;
  /** placeholder=false 时填具体数;9e2 接 9g */
  invariants_passed?: number;
  invariants_failed?: number;
  legacy_exempt?: number;
}

/** handoff_to_backlog 一项 — 三类 source 聚合(沿 design §2.4.3) */
export interface HandoffEntry {
  /** 来源类别 */
  source: 'verify_findings' | 'review_outcomes' | 'pause_decisions' | 'scope_entries';
  /** 来源 id(verify_findings.id 数字 / pause_decisions.id 数字 / review_outcomes 索引数字 / scope_entries.id 字符串) */
  id: number | string;
  /** 三级 severity(scope_entries 来源时可能为 null,沿 design §2.4.3 字面) */
  severity?: Severity | null;
  /** verify/review 来源时的 dimension 字段(沿 9d VerifyFinding) */
  dimension?: string;
  /** verify/review 来源时的 check_type 字段(沿 9d VerifyFinding) */
  check_type?: string;
  /** 证据定位字符串(沿 9a EVIDENCE_FORMATS) */
  evidence?: string;
  /** 建议(可选) */
  recommendation?: string;
  /** pause_decisions 来源时的 chosen_option(应固定 = 3 才进 handoff) */
  chosen_option?: 3;
  /** pause_decisions 来源时的 target_artifact */
  target_artifact?: string;
  /** pause_decisions 来源时的 target_anchor */
  target_anchor?: string;
  /** pause_decisions 来源时的 issue_summary */
  issue_summary?: string;
  /** scope_entries 来源时的 category(沿 9b ScopeCategory) */
  category?: 'out-of-scope' | 'non-goal' | 'future-work';
  /** scope_entries 来源时的 reason */
  reason?: string;
}

/** acked_warnings 一项 — verify_findings / review_outcomes 中 WARNING + acked 的引用 */
export interface AckedWarningRef {
  source: 'verify_findings' | 'review_outcomes';
  id: number;
  dimension?: string;
  check_type?: string;
  evidence?: string;
  acked_by: string;
  acked_at: string;
  rationale?: string;
}

/** pending_suggestions 一项 — SUGGESTION + resolved=false 的引用(handoff_to_backlog 子集) */
export interface SuggestionRef {
  source: 'verify_findings' | 'review_outcomes';
  id: number;
  dimension?: string;
  check_type?: string;
  evidence?: string;
  recommendation?: string;
}

/** 9e1 当前 version 常量 */
export const ARCHIVE_SUMMARY_VERSION = '1.0.0';

/** 9e1 placeholder process_evidence_summary(9e2 接 9g 替换) */
export const PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY: ProcessEvidenceSummary = {
  placeholder: true,
  note: 'process_evidence 13 不变量统计待 9g + 9e2 实施',
};

/** ISO 8601 UTC 校验正则(沿 marker-schema.ts:20 同形式) */
export const ARCHIVE_SUMMARY_ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** semver 弱校验(major.minor.patch[-prerelease][+build]) */
export const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;

/** 类型守卫:对象具备 ArchiveSummary 顶级字段(运行时浅校验) */
export function looksLikeArchiveSummary(v: unknown): v is ArchiveSummary {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o.schema === 'forge-archive-summary/v1';
}
```

- [ ] **Step 2.2: 创建 `src/core/validate/archive-summary-schema.ts`**

```typescript
// src/core/validate/archive-summary-schema.ts — plan-9e1 Task 1
// validateArchiveSummarySchema:校验 archive_summary 顶级字段
// 不校验业务规则(handoff 三类聚合是否齐全)— 那是 Task 2 builder 与 e2e 的事
// 沿 marker-schema.ts checkXxx helper 同结构

import { type ValidationResult, ok, failed, mergeResults } from './types.js';
import { ARCHIVE_SUMMARY_ISO_8601_RE, SEMVER_RE } from '../schemas/archive-summary.js';

/**
 * 校验 archive_summary 对象的 schema 合法性
 * @param m 已解析的对象
 * @param file 可选错误报告用 archive_summary.yaml 路径
 */
export function validateArchiveSummarySchema(m: unknown, file?: string): ValidationResult {
  if (!m || typeof m !== 'object') {
    return failed({
      artifact: 'change',
      message: 'archive_summary must be a YAML mapping',
      file,
    });
  }
  const obj = m as Record<string, unknown>;
  const results: ValidationResult[] = [];

  // 1. schema literal
  if (obj.schema !== 'forge-archive-summary/v1') {
    results.push(
      failed({
        artifact: 'change',
        field: 'schema',
        message: `schema must be literal 'forge-archive-summary/v1' (got: ${JSON.stringify(obj.schema)})`,
        file,
      }),
    );
  }

  // 2. version semver
  if (typeof obj.version !== 'string' || !SEMVER_RE.test(obj.version)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'version',
        message: 'must be semver string (major.minor.patch)',
        file,
      }),
    );
  }

  // 3. archived_at ISO 8601
  if (typeof obj.archived_at !== 'string' || !ARCHIVE_SUMMARY_ISO_8601_RE.test(obj.archived_at)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'archived_at',
        message: 'must be ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ)',
        file,
      }),
    );
  }

  // 4. change_id 非空 string
  if (typeof obj.change_id !== 'string' || !obj.change_id) {
    results.push(
      failed({
        artifact: 'change',
        field: 'change_id',
        message: 'must be non-empty string',
        file,
      }),
    );
  }

  // 5. verify_passed object
  if (!obj.verify_passed || typeof obj.verify_passed !== 'object' || Array.isArray(obj.verify_passed)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'verify_passed',
        message: 'must be object',
        file,
      }),
    );
  }

  // 6. review_passed object
  if (!obj.review_passed || typeof obj.review_passed !== 'object' || Array.isArray(obj.review_passed)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'review_passed',
        message: 'must be object',
        file,
      }),
    );
  }

  // 7. process_evidence_summary 必填 object(9e1 仅 placeholder,9e2 接 9g 真实统计;两态都得过 schema)
  if (
    !obj.process_evidence_summary ||
    typeof obj.process_evidence_summary !== 'object' ||
    Array.isArray(obj.process_evidence_summary)
  ) {
    results.push(
      failed({
        artifact: 'change',
        field: 'process_evidence_summary',
        message: 'must be object (9e1 placeholder, 9e2 接 9g 真实统计)',
        file,
      }),
    );
  }

  // 8-10. 三数组字段
  if (!Array.isArray(obj.handoff_to_backlog)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'handoff_to_backlog',
        message: 'must be array',
        file,
      }),
    );
  }
  if (!Array.isArray(obj.acked_warnings)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'acked_warnings',
        message: 'must be array',
        file,
      }),
    );
  }
  if (!Array.isArray(obj.pending_suggestions)) {
    results.push(
      failed({
        artifact: 'change',
        field: 'pending_suggestions',
        message: 'must be array',
        file,
      }),
    );
  }

  return results.length === 0 ? ok() : mergeResults(...results);
}
```

- [ ] **Step 2.3: 跑测试确认 12 case 全 PASS**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/schemas/archive-summary-schema.test.ts
```

预期:12 PASS / 0 FAIL。

### Step 3: Typecheck + format + commit

- [ ] **Step 3.1: 跑 typecheck + format**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm format:check
```

预期:全过。若 format:check 失败,先 `pnpm format` 修复后 stage。

- [ ] **Step 3.2: commit Task 1**

```bash
git -C D:/ClaudeProject/opsp/forge-repo add src/core/schemas/archive-summary.ts src/core/validate/archive-summary-schema.ts tests/core/schemas/archive-summary-schema.test.ts
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9e1 Task 1): ArchiveSummary schema 锁死 + validateArchiveSummarySchema + 12 case 单测

沿 master §3.12.1bis 9 顶级字段冻结。schema/version/archived_at/change_id 必填类型校验,
process_evidence_summary 仅校验 object(9e2 接 9g 真实统计,9e1 placeholder 容忍)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

预期:commit hash 出现,无 lint/test 失败。

---

## 3. Task 2 — summary-builder 三类聚合 + ScopeEntriesIntegrityError + 单测

**Files**:
- Create: `src/core/archive/summary-builder.ts`(含 `ScopeEntriesIntegrityError` class — v2 BLOCKER 4)
- Create: `tests/core/archive/summary-builder.test.ts`

**v2 BLOCKER 3 修订 — review_outcomes 简码 `C` 不进 builder**:
- design §2.3.5 line 559 明确"`C`(clarification)不自动映射;archive 阶段给 CRITICAL finding 拒签 + 提示 `forge upgrade --resign-markers`"
- v1 plan builder collector1 `collectAckedWarnings` 把 `C + accepted=true + rationale 非空` 当 acked WARNING 收集 — **错误**
- v2 修订:
  - `collectAckedWarnings`:仅收 `verify_findings` WARNING + ack;**不收 review_outcomes**(C 简码由 fence 拒签,不应进 acked_warnings;后续 9j resign 完成后 review_outcomes 端不再有简码,届时 9e2 可加全名 WARNING 路径)
  - `collectPendingSuggestions`:`verify_findings` SUGGESTION + `review_outcomes` **L** 简码(L → SUGGESTION 直接映射,沿 design §2.3.5 line 558)
  - `collectHandoffEntries` 第 1 类同上 — 仅 SUGGESTION 持挂

**v2 BLOCKER 4 修订 — scope-entries YAML 完整性抛错**:
- v1 plan builder `collectScopeEntriesHandoff` 对 parse 失败 / schema 非法**静默 `continue`** — malformed YAML 可让 archive 通过但 handoff 条目丢失
- v2 修订:新建 `class ScopeEntriesIntegrityError extends Error`,builder 内部 parse 失败 / schema 非 `forge-scope-entries/v1` / anchor_id 不匹配 → 抛错;`src/cli/commands/archive.ts` 步骤 4.5 try/catch 转 fence business-fail exit 1

### Step 1: 先写聚合失败测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/core/archive/summary-builder.test.ts`**

```typescript
// summary-builder.test.ts — plan-9e1 Task 2 单测
// 校验 buildArchiveSummary 三类聚合:
//   collector1: acked_warnings(verify_findings + review_outcomes WARNING + ack)
//   collector2: pending_suggestions(SUGGESTION + resolved=false)
//   collector3: handoff_to_backlog(三类 input 聚合)
//     - verify_findings/review_outcomes SUGGESTION 未 resolved
//     - pause_decisions chosen_option=3
//     - proposal/design scope-entries Out-of-Scope/Future-Work YAML 块的 active entry

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildArchiveSummary } from '../../../src/core/archive/summary-builder.js';

// helper:在 tmpdir 建一个最小 change 目录(proposal + design + tasks + specs)
function setupChangeDir(): { changeDir: string; cleanup: () => void } {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-builder-'));
  const changeDir = join(tmpRoot, 'forge', 'changes', 'add-x');
  mkdirSync(join(changeDir, 'specs'), { recursive: true });
  writeFileSync(join(changeDir, 'proposal.md'), '# Add X\n\n## Why\nreason\n', 'utf8');
  writeFileSync(join(changeDir, 'design.md'), '# Design X\n', 'utf8');
  writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [x] t1\n', 'utf8');
  writeFileSync(join(changeDir, 'specs', 'x.md'), '# X Spec\n', 'utf8');
  return {
    changeDir,
    cleanup: () => rmSync(tmpRoot, { recursive: true, force: true }),
  };
}

// helper:合法 verify marker baseline(无 findings)
function baseVerifyMarker(): Record<string, unknown> {
  return {
    schema: 'forge-verify/v1',
    verified_at: '2026-05-12T16:30:00Z',
    verified_by: 'ai-agent',
    tasks_hash: 'sha256:' + 'a'.repeat(64),
    content_hash: 'sha256:' + 'b'.repeat(64),
    evidence: [],
  };
}

function baseReviewMarker(): Record<string, unknown> {
  return {
    schema: 'forge-review/v1',
    reviewed_at: '2026-05-12T16:40:00Z',
    reviewed_by: 'ai-agent',
    tasks_hash: 'sha256:' + 'a'.repeat(64),
    content_hash: 'sha256:' + 'b'.repeat(64),
    git: { is_git_repo: false },
    review_outcomes: [],
  };
}

describe('buildArchiveSummary - basic baseline', () => {
  let ctx: { changeDir: string; cleanup: () => void };
  beforeEach(() => {
    ctx = setupChangeDir();
  });
  afterEach(() => ctx.cleanup());

  it('空 markers + 空 scope → 三数组都空', async () => {
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    expect(summary.handoff_to_backlog).toEqual([]);
    expect(summary.acked_warnings).toEqual([]);
    expect(summary.pending_suggestions).toEqual([]);
    expect(summary.schema).toBe('forge-archive-summary/v1');
    expect(summary.change_id).toBe('add-x');
    expect(summary.process_evidence_summary.placeholder).toBe(true);
  });

  it('verify_passed.verified_invariants 至少含 hash-match + evidence-complete', async () => {
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    expect(summary.verify_passed.verified_invariants).toContain('hash-match');
    expect(summary.verify_passed.verified_invariants).toContain('evidence-complete');
  });

  it('review_passed.reviewers 含 reviewed_by 字段值', async () => {
    const verify = baseVerifyMarker();
    const review = baseReviewMarker();
    review.reviewed_by = 'msc';
    const summary = await buildArchiveSummary(verify, review, ctx.changeDir, 'add-x');
    expect(summary.review_passed.reviewers).toContain('msc');
  });
});

describe('buildArchiveSummary - collector1 acked_warnings', () => {
  let ctx: { changeDir: string; cleanup: () => void };
  beforeEach(() => {
    ctx = setupChangeDir();
  });
  afterEach(() => ctx.cleanup());

  it('verify_findings WARNING + acked → acked_warnings 含 1 项', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 2,
        dimension: 'correctness',
        check_type: 'requirement-mapping',
        severity: 'WARNING',
        automated: false,
        evidence: 'specs/auth.md:15',
        recommendation: 'expand impl',
        resolved: false,
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T16:30:00Z',
        finding_hash: 'c'.repeat(64),
        content_hash: 'sha256:' + 'd'.repeat(64),
        git_head: 'e'.repeat(40),
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    expect(summary.acked_warnings).toHaveLength(1);
    expect(summary.acked_warnings[0]?.source).toBe('verify_findings');
    expect(summary.acked_warnings[0]?.id).toBe(2);
    expect(summary.acked_warnings[0]?.acked_by).toBe('msc');
  });

  it('verify_findings WARNING + resolved=true → 不入 acked_warnings(已解决)', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 2,
        dimension: 'correctness',
        check_type: 'x',
        severity: 'WARNING',
        automated: false,
        evidence: 'change-level',
        recommendation: 'r',
        resolved: true,
        finding_hash: 'c'.repeat(64),
        content_hash: 'sha256:' + 'd'.repeat(64),
        git_head: 'e'.repeat(40),
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    expect(summary.acked_warnings).toHaveLength(0);
  });
});

describe('buildArchiveSummary - collector2 pending_suggestions', () => {
  let ctx: { changeDir: string; cleanup: () => void };
  beforeEach(() => {
    ctx = setupChangeDir();
  });
  afterEach(() => ctx.cleanup());

  it('verify_findings SUGGESTION + resolved=false → pending_suggestions 含 1 项', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 3,
        dimension: 'coherence',
        check_type: 'pattern-consistency',
        severity: 'SUGGESTION',
        automated: false,
        evidence: 'src/auth/login.ts:23',
        recommendation: 'rename handleLogin',
        resolved: false,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    expect(summary.pending_suggestions).toHaveLength(1);
    expect(summary.pending_suggestions[0]?.id).toBe(3);
    expect(summary.pending_suggestions[0]?.dimension).toBe('coherence');
  });

  it('verify_findings SUGGESTION + resolved=true → 不入 pending_suggestions', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 3,
        dimension: 'coherence',
        check_type: 'x',
        severity: 'SUGGESTION',
        automated: false,
        evidence: 'change-level',
        recommendation: 'r',
        resolved: true,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    expect(summary.pending_suggestions).toHaveLength(0);
  });

  // v2 BLOCKER 3 新增:review_outcomes L 简码 → SUGGESTION 直接映射(沿 design §2.3.5 line 558)
  it('review_outcomes L + resolved=false → pending_suggestions 含 1 项 source=review_outcomes', async () => {
    const review = baseReviewMarker();
    review.review_outcomes = [
      { severity: 'L', accepted: false, resolved: false, rationale: 'nice-to-have rename' },
    ];
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      review,
      ctx.changeDir,
      'add-x',
    );
    expect(summary.pending_suggestions).toHaveLength(1);
    expect(summary.pending_suggestions[0]?.source).toBe('review_outcomes');
    expect(summary.pending_suggestions[0]?.recommendation).toBe('nice-to-have rename');
  });

  // v2 BLOCKER 3 新增:review_outcomes C 简码 → builder **不收**(C 由 fence 拒签;后续不该走到 builder)
  it('review_outcomes C + accepted=true + rationale 非空 → builder 不收(由 fence 拒签;builder sanity 应忽略)', async () => {
    const review = baseReviewMarker();
    review.review_outcomes = [
      { severity: 'C', accepted: true, resolved: false, rationale: 'should be rejected by fence' },
    ];
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      review,
      ctx.changeDir,
      'add-x',
    );
    // builder 仅 sanity:C 不进 acked_warnings / pending_suggestions
    expect(summary.acked_warnings).toHaveLength(0);
    expect(summary.pending_suggestions).toHaveLength(0);
  });
});

// v3 MAJOR 2 新增:ScopeEntriesIntegrityError 抛错路径 4 case
describe('buildArchiveSummary - ScopeEntriesIntegrityError 抛错路径(v3 MAJOR 2)', () => {
  let ctx: { changeDir: string; cleanup: () => void };
  beforeEach(() => {
    ctx = setupChangeDir();
  });
  afterEach(() => ctx.cleanup());

  it('proposal Out-of-Scope 段 YAML 语法错 → 抛 ScopeEntriesIntegrityError', async () => {
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# X',
        '## Why',
        'r',
        '## Out of Scope {#forge-oos}',
        '```yaml',
        'schema: forge-scope-entries/v1',
        '@@@@@ corrupt yaml',
        '```',
      ].join('\n'),
      'utf8',
    );
    await expect(
      buildArchiveSummary(baseVerifyMarker(), baseReviewMarker(), ctx.changeDir, 'add-x'),
    ).rejects.toThrow(/scope-entries YAML parse failed/);
  });

  it('proposal Out-of-Scope 段 schema 非 forge-scope-entries/v1 → 抛 ScopeEntriesIntegrityError', async () => {
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# X',
        '## Why',
        'r',
        '## Out of Scope {#forge-oos}',
        '```yaml',
        'schema: wrong/v2',
        'anchor_id: forge-oos',
        'entries: []',
        '```',
      ].join('\n'),
      'utf8',
    );
    await expect(
      buildArchiveSummary(baseVerifyMarker(), baseReviewMarker(), ctx.changeDir, 'add-x'),
    ).rejects.toThrow(/scope-entries schema 非 'forge-scope-entries\/v1'/);
  });

  it('proposal Out-of-Scope 段 anchor_id 不匹配 → 抛 ScopeEntriesIntegrityError', async () => {
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# X',
        '## Why',
        'r',
        '## Out of Scope {#forge-oos}',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-non-goals', // 不匹配 forge-oos
        'entries: []',
        '```',
      ].join('\n'),
      'utf8',
    );
    await expect(
      buildArchiveSummary(baseVerifyMarker(), baseReviewMarker(), ctx.changeDir, 'add-x'),
    ).rejects.toThrow(/scope-entries anchor_id 不匹配/);
  });

  it('proposal Out-of-Scope 段 entries 非数组 → 抛 ScopeEntriesIntegrityError', async () => {
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# X',
        '## Why',
        'r',
        '## Out of Scope {#forge-oos}',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries: not-an-array',
        '```',
      ].join('\n'),
      'utf8',
    );
    await expect(
      buildArchiveSummary(baseVerifyMarker(), baseReviewMarker(), ctx.changeDir, 'add-x'),
    ).rejects.toThrow(/scope-entries entries 非数组/);
  });
});

describe('buildArchiveSummary - collector3 handoff_to_backlog 三类聚合', () => {
  let ctx: { changeDir: string; cleanup: () => void };
  beforeEach(() => {
    ctx = setupChangeDir();
  });
  afterEach(() => ctx.cleanup());

  it('第 1 类:verify_findings SUGGESTION 持挂 → handoff_to_backlog 含一项 source=verify_findings', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 3,
        dimension: 'coherence',
        check_type: 'x',
        severity: 'SUGGESTION',
        automated: false,
        evidence: 'src/x.ts:1',
        recommendation: 'r',
        resolved: false,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    expect(summary.handoff_to_backlog).toHaveLength(1);
    expect(summary.handoff_to_backlog[0]?.source).toBe('verify_findings');
    expect(summary.handoff_to_backlog[0]?.severity).toBe('SUGGESTION');
  });

  it('第 2 类:pause_decisions chosen_option=3 → handoff_to_backlog 含一项 source=pause_decisions', async () => {
    const verify = baseVerifyMarker();
    verify.pause_decisions = [
      {
        id: 1,
        paused_at: '2026-05-12T15:00:00Z',
        task_ref: 'tasks.md#t1',
        issue_summary: 'OAuth refresh edge',
        severity: 'WARNING',
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T15:05:00Z',
        chosen_option: 3,
        target_artifact: 'proposal.md',
        target_anchor: '## Out of Scope',
        non_blocking_rationale: 'can skip',
        other_rationale: null,
        other_acked_by: null,
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    const pauseEntries = summary.handoff_to_backlog.filter(
      (e) => e.source === 'pause_decisions',
    );
    expect(pauseEntries).toHaveLength(1);
    expect(pauseEntries[0]?.id).toBe(1);
    expect(pauseEntries[0]?.chosen_option).toBe(3);
    expect(pauseEntries[0]?.target_anchor).toBe('## Out of Scope');
  });

  it('第 2 类:pause_decisions chosen_option!=3 → 不进 handoff_to_backlog(option=1/2/4)', async () => {
    const verify = baseVerifyMarker();
    verify.pause_decisions = [
      {
        id: 1,
        paused_at: '2026-05-12T15:00:00Z',
        task_ref: 'tasks.md#t1',
        issue_summary: 'x',
        severity: 'WARNING',
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T15:05:00Z',
        chosen_option: 1, // 扩 scope,不进 backlog
        target_artifact: 'proposal.md',
        target_anchor: '## What Changes',
        non_blocking_rationale: null,
        other_rationale: null,
        other_acked_by: null,
      },
    ];
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    const pauseEntries = summary.handoff_to_backlog.filter(
      (e) => e.source === 'pause_decisions',
    );
    expect(pauseEntries).toHaveLength(0);
  });

  it('第 3 类:proposal Out-of-Scope scope-entries YAML 块 active entry → handoff_to_backlog 含一项 source=scope_entries', async () => {
    // 在 proposal.md 写一个含 forge-oos anchor + fenced YAML block
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# Add X',
        '',
        '## Why',
        'reason',
        '',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: oos-refresh-token',
        '    category: out-of-scope',
        '    description: OAuth refresh token 处理',
        '    reason: 本 change 仅含 access token issue/verify',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
        '',
      ].join('\n'),
      'utf8',
    );
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    const scopeEntries = summary.handoff_to_backlog.filter(
      (e) => e.source === 'scope_entries',
    );
    expect(scopeEntries).toHaveLength(1);
    expect(scopeEntries[0]?.id).toBe('oos-refresh-token');
    expect(scopeEntries[0]?.category).toBe('out-of-scope');
    expect(scopeEntries[0]?.reason).toBe('本 change 仅含 access token issue/verify');
  });

  it('第 3 类:scope-entries status=inherited / superseded / completed / obsolete → 不进 handoff(只 active 进)', async () => {
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# Add X',
        '',
        '## Why',
        'reason',
        '',
        '## Out of Scope {#forge-oos}',
        '',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: old-entry',
        '    category: out-of-scope',
        '    description: 老条目',
        '    reason: 已在前置 change 标记',
        '    priority: null',
        '    status: inherited',
        '    triggered_by: null',
        '    related_change: null',
        '  - id: superseded-entry',
        '    category: out-of-scope',
        '    description: 被覆盖',
        '    reason: 后续 change 接手',
        '    priority: null',
        '    status: superseded',
        '    triggered_by: null',
        '    related_change: null',
        '```',
        '',
      ].join('\n'),
      'utf8',
    );
    const summary = await buildArchiveSummary(
      baseVerifyMarker(),
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    const scopeEntries = summary.handoff_to_backlog.filter(
      (e) => e.source === 'scope_entries',
    );
    expect(scopeEntries).toHaveLength(0);
  });

  it('混合三类 input → handoff_to_backlog 含三条 source 各一', async () => {
    const verify = baseVerifyMarker();
    verify.verify_findings = [
      {
        id: 3,
        dimension: 'coherence',
        check_type: 'x',
        severity: 'SUGGESTION',
        automated: false,
        evidence: 'src/x.ts:1',
        recommendation: 'r',
        resolved: false,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    verify.pause_decisions = [
      {
        id: 1,
        paused_at: '2026-05-12T15:00:00Z',
        task_ref: 'tasks.md#t1',
        issue_summary: 'OAuth refresh edge',
        severity: 'WARNING',
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T15:05:00Z',
        chosen_option: 3,
        target_artifact: 'proposal.md',
        target_anchor: '## Out of Scope',
        non_blocking_rationale: 'can skip',
        other_rationale: null,
        other_acked_by: null,
      },
    ];
    writeFileSync(
      join(ctx.changeDir, 'proposal.md'),
      [
        '# Add X',
        '## Why',
        'r',
        '## Out of Scope {#forge-oos}',
        '```yaml',
        'schema: forge-scope-entries/v1',
        'anchor_id: forge-oos',
        'entries:',
        '  - id: e1',
        '    category: out-of-scope',
        '    description: d',
        '    reason: r',
        '    priority: null',
        '    status: active',
        '    triggered_by: null',
        '    related_change: null',
        '```',
      ].join('\n'),
      'utf8',
    );
    const summary = await buildArchiveSummary(
      verify,
      baseReviewMarker(),
      ctx.changeDir,
      'add-x',
    );
    const bySource = new Set(summary.handoff_to_backlog.map((e) => e.source));
    expect(bySource).toEqual(new Set(['verify_findings', 'pause_decisions', 'scope_entries']));
    expect(summary.handoff_to_backlog).toHaveLength(3);
  });
});
```

- [ ] **Step 1.2: 跑测试确认全红**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/archive/summary-builder.test.ts
```

预期:模块 import 失败,17 case 全 ERROR(v4 修订:11 baseline + 2 v2 BLOCKER 3 + 4 v3 MAJOR 2)。

### Step 2: 实现 summary-builder

- [ ] **Step 2.1: 创建 `src/core/archive/summary-builder.ts`**

```typescript
// src/core/archive/summary-builder.ts — plan-9e1 Task 2
// buildArchiveSummary:从 markers + change 目录构造 ArchiveSummary
// 三 collector:
//   collectAckedWarnings — verify_findings + review_outcomes 中 WARNING + resolved=false + 有 ack
//   collectPendingSuggestions — verify_findings + review_outcomes 中 SUGGESTION + resolved=false
//   collectHandoffEntries — 三类 input 聚合(verify/review SUGGESTION 持挂 + pause_decisions option=3 + scope-entries active)

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding } from '../schemas/severity.js';
import type { PauseDecision } from '../markers/types.js';
import type {
  ArchiveSummary,
  HandoffEntry,
  AckedWarningRef,
  SuggestionRef,
} from '../schemas/archive-summary.js';
import {
  ARCHIVE_SUMMARY_VERSION,
  PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
} from '../schemas/archive-summary.js';
import { parseMarkdown } from '../parse/markdown.js';
import { parseFencedYamlBlocks } from '../parse/fenced-yaml.js';
import { SCOPE_ANCHOR_IDS, type ScopeAnchorId, type ScopeEntry } from '../schemas/scope-entries.js';

/** review_outcomes 单项最小子集(沿 marker types.ReviewOutcome) */
interface ReviewOutcome {
  severity: 'S' | 'C' | 'L';
  accepted: boolean;
  resolved: boolean;
  task_ref?: string;
  rationale?: string;
}

/** 选项:archive 时刻(测试可注入,生产用 new Date()) */
export interface BuildArchiveSummaryOptions {
  /** archived_at 时刻(沿 archive transaction 调用方计算,默认 new Date().toISOString()) */
  archivedAt?: string;
}

/**
 * 构造 archive_summary 对象
 *
 * @param verifyMarker .verify-passed 解析后对象(Record 形)
 * @param reviewMarker .review-passed 解析后对象(Record 形)
 * @param changeDir change 目录绝对路径(读 proposal.md / design.md 抽 scope-entries)
 * @param changeId change id 字符串
 * @param opts 可选项
 */
export async function buildArchiveSummary(
  verifyMarker: Record<string, unknown>,
  reviewMarker: Record<string, unknown>,
  changeDir: string,
  changeId: string,
  opts: BuildArchiveSummaryOptions = {},
): Promise<ArchiveSummary> {
  const archivedAt = opts.archivedAt ?? toIso8601(new Date());

  const verifyFindings: Finding[] = Array.isArray(verifyMarker.verify_findings)
    ? (verifyMarker.verify_findings as Finding[])
    : [];
  const pauseDecisions: PauseDecision[] = Array.isArray(verifyMarker.pause_decisions)
    ? (verifyMarker.pause_decisions as PauseDecision[])
    : [];
  // review marker 也可能携带 pause_decisions(沿 9c superset additive 镜像)
  const reviewPauseDecisions: PauseDecision[] = Array.isArray(reviewMarker.pause_decisions)
    ? (reviewMarker.pause_decisions as PauseDecision[])
    : [];
  const reviewOutcomes: ReviewOutcome[] = Array.isArray(reviewMarker.review_outcomes)
    ? (reviewMarker.review_outcomes as ReviewOutcome[])
    : [];

  const acked_warnings = collectAckedWarnings(verifyFindings);
  const pending_suggestions = collectPendingSuggestions(verifyFindings, reviewOutcomes);

  // 合并 verify + review 的 pause_decisions(去重以 id 为 key,review 镜像优先级低)
  const allPauseDecisions = mergePauseDecisions(pauseDecisions, reviewPauseDecisions);

  const handoff_to_backlog: HandoffEntry[] = [
    // 第 1 类:SUGGESTION 持挂(直接复用 pending_suggestions,但映射到 HandoffEntry 字段)
    ...pending_suggestions.map<HandoffEntry>((s) => ({
      source: s.source,
      id: s.id,
      severity: 'SUGGESTION',
      dimension: s.dimension,
      check_type: s.check_type,
      evidence: s.evidence,
      recommendation: s.recommendation,
    })),
    // 第 2 类:pause_decisions chosen_option=3
    ...allPauseDecisions
      .filter((p) => p.chosen_option === 3)
      .map<HandoffEntry>((p) => ({
        source: 'pause_decisions',
        id: p.id,
        severity: p.severity,
        chosen_option: 3,
        target_artifact: p.target_artifact,
        target_anchor: p.target_anchor,
        issue_summary: p.issue_summary,
      })),
    // 第 3 类:proposal/design scope-entries Out-of-Scope/Future-Work YAML 块的 active entry
    ...(await collectScopeEntriesHandoff(changeDir)),
  ];

  return {
    schema: 'forge-archive-summary/v1',
    version: ARCHIVE_SUMMARY_VERSION,
    archived_at: archivedAt,
    change_id: changeId,
    verify_passed: {
      verified_invariants: buildVerifiedInvariants(verifyMarker),
    },
    review_passed: {
      reviewers: [String(reviewMarker.reviewed_by ?? 'unknown')],
    },
    process_evidence_summary: PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
    handoff_to_backlog,
    acked_warnings,
    pending_suggestions,
  };
}

/** collector1:**仅 verify_findings** WARNING + resolved=false + 有 ack(v2 BLOCKER 3:review_outcomes C 简码由 fence 拒签,不进 acked_warnings) */
function collectAckedWarnings(findings: Finding[]): AckedWarningRef[] {
  const refs: AckedWarningRef[] = [];
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
  // v2 BLOCKER 3:不再收 review_outcomes(C 简码由 three-level-fence 拒签;9j resign 完成后 review_outcomes 端不再有简码,届时 9e2 可加全名 WARNING 路径)
  return refs;
}

/** collector2:verify_findings + review_outcomes 中 SUGGESTION + resolved=false(v2 BLOCKER 3:仅 L 简码,L → SUGGESTION 直接映射沿 design §2.3.5 line 558) */
function collectPendingSuggestions(
  findings: Finding[],
  outcomes: ReviewOutcome[],
): SuggestionRef[] {
  const refs: SuggestionRef[] = [];
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
  // review_outcomes 简码 L = SUGGESTION 直接映射(沿 design §2.3.5 line 558);C 简码由 fence 拒签,**不进 builder**
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i] as ReviewOutcome;
    if (o.severity === 'L' && o.resolved === false) {
      refs.push({
        source: 'review_outcomes',
        id: i,
        recommendation: o.rationale,
      });
    }
  }
  return refs;
}

/**
 * v2 BLOCKER 4 修订:scope-entries YAML 完整性错误(parse 失败 / schema 非法 / anchor_id 不匹配)
 * archive.ts 步骤 4.5 try/catch 转 fence business-fail exit 1
 */
export class ScopeEntriesIntegrityError extends Error {
  constructor(
    message: string,
    public readonly artifactName: string,
    public readonly anchorId: string,
  ) {
    super(message);
    this.name = 'ScopeEntriesIntegrityError';
  }
}

/**
 * collector3 子函数:抽 proposal.md + design.md 中 scope-entries active entry
 * v2 BLOCKER 4:parse 失败 / schema 非法 → 抛 ScopeEntriesIntegrityError(不再静默 continue)
 */
async function collectScopeEntriesHandoff(changeDir: string): Promise<HandoffEntry[]> {
  const entries: HandoffEntry[] = [];
  for (const artifactName of ['proposal.md', 'design.md']) {
    const artifactPath = join(changeDir, artifactName);
    if (!existsSync(artifactPath)) continue;
    const content = await readFile(artifactPath, 'utf8');
    const md = parseMarkdown(content);
    for (const sec of md.sections) {
      if (!sec.anchor || !(SCOPE_ANCHOR_IDS as readonly string[]).includes(sec.anchor)) continue;
      // 仅取 forge-oos / forge-future-work(non-goals 不是 handoff 目标;non-goal 是"反目标",不需 backlog 追踪)
      const anchorId = sec.anchor as ScopeAnchorId;
      if (anchorId !== 'forge-oos' && anchorId !== 'forge-future-work') continue;
      let yamlBlocks: unknown[];
      try {
        yamlBlocks = parseFencedYamlBlocks(sec.body);
      } catch (err) {
        // v2 BLOCKER 4:parse 失败 → 抛错(让 archive fence 拒签),不再静默跳过
        throw new ScopeEntriesIntegrityError(
          `scope-entries YAML parse failed in ${artifactName} section ${anchorId}: ${(err as Error).message}`,
          artifactName,
          anchorId,
        );
      }
      if (yamlBlocks.length === 0) continue; // 段内无 YAML 块允许(空段沿 9b 通过)
      const block = yamlBlocks[0] as Record<string, unknown>;
      if (block.schema !== 'forge-scope-entries/v1') {
        throw new ScopeEntriesIntegrityError(
          `scope-entries schema 非 'forge-scope-entries/v1'(${artifactName} section ${anchorId},实际 ${JSON.stringify(block.schema)})`,
          artifactName,
          anchorId,
        );
      }
      if (block.anchor_id !== anchorId) {
        throw new ScopeEntriesIntegrityError(
          `scope-entries anchor_id 不匹配(${artifactName}:${anchorId} 段内 YAML 块 anchor_id=${JSON.stringify(block.anchor_id)})`,
          artifactName,
          anchorId,
        );
      }
      if (!Array.isArray(block.entries)) {
        throw new ScopeEntriesIntegrityError(
          `scope-entries entries 非数组(${artifactName} section ${anchorId})`,
          artifactName,
          anchorId,
        );
      }
      for (const e of block.entries as ScopeEntry[]) {
        if (!e || typeof e !== 'object') continue;
        // 仅 status=active 进 handoff(inherited/superseded/completed/obsolete 不进)
        if (e.status !== 'active') continue;
        entries.push({
          source: 'scope_entries',
          id: e.id,
          severity: null,
          category: e.category,
          reason: e.reason,
          target_artifact: artifactName,
          target_anchor: anchorId === 'forge-oos' ? '## Out of Scope' : '## Future Work',
        });
      }
    }
  }
  return entries;
}

/** 合并 verify + review 端 pause_decisions(以 id 为 key 去重,verify 优先) */
function mergePauseDecisions(
  verifyPauses: PauseDecision[],
  reviewPauses: PauseDecision[],
): PauseDecision[] {
  const byId = new Map<number, PauseDecision>();
  for (const p of verifyPauses) byId.set(p.id, p);
  for (const p of reviewPauses) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  return [...byId.values()];
}

/** 沿 design verified_invariants 至少含 hash-match + evidence-complete(9d 三维度 fence 已通过) */
function buildVerifiedInvariants(verifyMarker: Record<string, unknown>): string[] {
  const list = ['hash-match', 'evidence-complete'];
  // 9d 三维度 fence 已通过 — 若 verify_findings 字段存在(老 marker 缺则跳),加上 verify-findings-fence
  if (Array.isArray(verifyMarker.verify_findings)) {
    list.push('verify-findings-fence');
  }
  if (Array.isArray(verifyMarker.pause_decisions)) {
    list.push('pause-decisions-fence');
  }
  return list;
}

/** Date → 'YYYY-MM-DDTHH:MM:SSZ'(沿 marker-schema.ts:20 ISO 8601 UTC 格式) */
function toIso8601(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
```

- [ ] **Step 2.2: 跑测试,确认 17 case PASS**(v4 修订:11 baseline + 2 v2 BLOCKER 3 + 4 v3 MAJOR 2)

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/archive/summary-builder.test.ts
```

预期:11 PASS。若 scope-entries collector 失败,核对 `parseFencedYamlBlocks` 是否被段 body 调用(sec.body 不含 heading 行)。

### Step 3: Typecheck + commit

- [ ] **Step 3.1: 跑 typecheck + format + 完整测试**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm format:check && pnpm test tests/core/archive/summary-builder.test.ts tests/core/schemas/archive-summary-schema.test.ts
```

预期:typecheck PASS / format PASS / test 23 PASS(Task 1 12 + Task 2 11)。

- [ ] **Step 3.2: commit Task 2**

```bash
git -C D:/ClaudeProject/opsp/forge-repo add src/core/archive/summary-builder.ts tests/core/archive/summary-builder.test.ts
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9e1 Task 2): summary-builder 三类聚合 + ScopeEntriesIntegrityError + 17 case 单测

buildArchiveSummary 三 collector:
- collectAckedWarnings:WARNING+resolved=false+ack 非空
- collectPendingSuggestions:SUGGESTION+resolved=false
- collectHandoffEntries:三类聚合(SUGGESTION 持挂 / pause option=3 / scope-entries active)

scope-entries 仅 forge-oos / forge-future-work + status=active 进 handoff(non-goals 是反目标,不需 backlog 追踪)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

预期:commit 成功。

---

## 4. Task 3 — transaction.ts `.tmp` 写 + rename + 失败 unlink 回滚 + 单测

**Files**:
- Modify: `src/core/archive/transaction.ts`(扩 ArchiveTransactionInput + Move 前 .tmp 写 + Move 后 rename + **回滚链 unlink summary**)
- Create: `tests/core/archive/transaction-summary.test.ts`
- Modify: `scripts/check-release-gate.mjs`(v2 MAJOR 2:`EXPECTED_TODO_COUNT_SOFT` 2 → 5,同步加 3 个 9e1 transaction 失败注入 todo)
- Modify: `tests/integration/release-blocker-attack-path.test.ts`(v2 MAJOR 2:加 3 个 9e1 failure-injection `it.todo`)

**v2 MAJOR 1 修订 — 回滚链 unlink summary 而非改回 `.tmp`**:
- v1 plan Step 2.2/2.3 反向 Move 后改 `.yaml` → `.tmp` 名保留 — 违 "rolled back = 状态完全回到事务开始前" 语义,残留 `.tmp` 让下次 validate 报 noisy WARNING
- v2 修订:反向 Move 后 **unlink summary**(无论 `.tmp` / 正式名);重试 archive 时重新生成 — 回滚状态 = 事务开始前状态
- 影响:plan §8.4 也同步改"validate 不再扫到孤立 `.tmp`(回滚已清理),`--resume-summary` 只处理 archive 目录的 rename-fail 残留"

**v2 MAJOR 2 修订 — 4 失败注入路径**:
- v1 6 case 漏 4 路径:`.tmp` 写失败 / rename `.tmp` → 正式名失败 / Backup 失败 / Sync 失败
- v2 修订:
  - `.tmp` 写失败:用 `chmod 0o555` source dir 实测(POSIX)/ Windows 用 readonly attr;1 case 实测
  - rename / Backup / Sync 失败:fs error 注入复杂(需 mock fs 或 race),用 `it.todo` 占位 3 case
  - 同步改 `scripts/check-release-gate.mjs` `EXPECTED_TODO_COUNT_SOFT = 5`(plan-9c 2 + plan-9e1 3)
  - 同步在 `tests/integration/release-blocker-attack-path.test.ts` 加 3 个 9e1 failure-injection `it.todo`(9z release plan 解锁时同 9c 一起 unskip)

### Step 1: 先写 transaction 集成失败测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/core/archive/transaction-summary.test.ts`**

```typescript
// transaction-summary.test.ts — plan-9e1 Task 3 单测
// 验证 archiveTransaction 处理 archiveSummary 字段:
//   - 正常流:Move 前在 source 写 archive_summary.tmp.yaml → Move 后 rename 为 archive_summary.yaml
//   - 失败回滚:.tmp 写失败 / Move 失败 / rename 失败 三场景
//
// 沿 transaction.test.ts 同模式 — tmpdir 搭 forge skeleton + 跑 archiveTransaction

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { archiveTransaction } from '../../../src/core/archive/transaction.js';
import {
  ARCHIVE_SUMMARY_VERSION,
  PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
  type ArchiveSummary,
} from '../../../src/core/schemas/archive-summary.js';

function setupForgeRoot(): { forgeRoot: string; changeDir: string; cleanup: () => void } {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-tx-'));
  const forgeRoot = join(tmpRoot, 'forge');
  mkdirSync(join(forgeRoot, 'changes', 'add-x', 'specs'), { recursive: true });
  mkdirSync(join(forgeRoot, 'specs'), { recursive: true });
  mkdirSync(join(forgeRoot, '.cache'), { recursive: true });
  writeFileSync(join(forgeRoot, 'changes', 'add-x', 'proposal.md'), '# X\n## Why\nr\n', 'utf8');
  writeFileSync(join(forgeRoot, 'changes', 'add-x', 'tasks.md'), '# Tasks\n- [x] t1\n', 'utf8');
  writeFileSync(join(forgeRoot, 'changes', 'add-x', 'specs', 'x.md'), '# X spec\n', 'utf8');
  return {
    forgeRoot,
    changeDir: join(forgeRoot, 'changes', 'add-x'),
    cleanup: () => rmSync(tmpRoot, { recursive: true, force: true }),
  };
}

function buildSummary(changeId: string): ArchiveSummary {
  return {
    schema: 'forge-archive-summary/v1',
    version: ARCHIVE_SUMMARY_VERSION,
    archived_at: '2026-05-12T16:45:00Z',
    change_id: changeId,
    verify_passed: { verified_invariants: ['hash-match', 'evidence-complete'] },
    review_passed: { reviewers: ['ai-agent'] },
    process_evidence_summary: PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
    handoff_to_backlog: [],
    acked_warnings: [],
    pending_suggestions: [],
  };
}

describe('archiveTransaction with archiveSummary', () => {
  it('正常流:archive_summary.yaml 出现在 archive 目录(非 .tmp 名)', async () => {
    const ctx = setupForgeRoot();
    try {
      await archiveTransaction({
        forgeRoot: ctx.forgeRoot,
        changeId: 'add-x',
        archiveDate: '2026-05-12',
        archiveSummary: buildSummary('add-x'),
      });
      const archiveDir = join(ctx.forgeRoot, 'changes', 'archive', '2026-05-12-add-x');
      expect(existsSync(join(archiveDir, 'archive_summary.yaml'))).toBe(true);
      expect(existsSync(join(archiveDir, 'archive_summary.tmp.yaml'))).toBe(false);
      const yamlText = readFileSync(join(archiveDir, 'archive_summary.yaml'), 'utf8');
      const parsed = parseYaml(yamlText) as Record<string, unknown>;
      expect(parsed.schema).toBe('forge-archive-summary/v1');
      expect(parsed.change_id).toBe('add-x');
    } finally {
      ctx.cleanup();
    }
  });

  it('archiveSummary 未传 → 兼容(归档不产 summary,沿老 v0.4 行为)', async () => {
    const ctx = setupForgeRoot();
    try {
      await archiveTransaction({
        forgeRoot: ctx.forgeRoot,
        changeId: 'add-x',
        archiveDate: '2026-05-12',
        // 不传 archiveSummary
      });
      const archiveDir = join(ctx.forgeRoot, 'changes', 'archive', '2026-05-12-add-x');
      expect(existsSync(archiveDir)).toBe(true);
      expect(existsSync(join(archiveDir, 'archive_summary.yaml'))).toBe(false);
      expect(existsSync(join(archiveDir, 'archive_summary.tmp.yaml'))).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  it('Move 失败(目标已存在)→ 整体失败 + source .tmp 清理', async () => {
    const ctx = setupForgeRoot();
    try {
      // 预先创建 archive 目标目录,导致 Move 失败
      const archiveTarget = join(ctx.forgeRoot, 'changes', 'archive', '2026-05-12-add-x');
      mkdirSync(archiveTarget, { recursive: true });
      // 给目标加一个文件确保 rename 不能覆盖空目录(POSIX rename 空目标可能覆盖,Win 拒绝)
      writeFileSync(join(archiveTarget, 'sentinel.txt'), 'x', 'utf8');

      await expect(
        archiveTransaction({
          forgeRoot: ctx.forgeRoot,
          changeId: 'add-x',
          archiveDate: '2026-05-12',
          archiveSummary: buildSummary('add-x'),
        }),
      ).rejects.toThrow();

      // 回滚:source 目录残留无 .tmp(若曾经写过则应已 unlink)
      const sourceTmp = join(ctx.changeDir, 'archive_summary.tmp.yaml');
      expect(existsSync(sourceTmp)).toBe(false);
      // 原 change 目录仍在 source(未 Move)
      expect(existsSync(ctx.changeDir)).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it('.tmp 写入完成后 Move 失败 → source .tmp 清理 + 整体失败', async () => {
    const ctx = setupForgeRoot();
    try {
      // 同上 case:Move 目标已占位
      const archiveTarget = join(ctx.forgeRoot, 'changes', 'archive', '2026-05-12-add-x');
      mkdirSync(archiveTarget, { recursive: true });
      writeFileSync(join(archiveTarget, 'sentinel.txt'), 'x', 'utf8');

      await expect(
        archiveTransaction({
          forgeRoot: ctx.forgeRoot,
          changeId: 'add-x',
          archiveDate: '2026-05-12',
          archiveSummary: buildSummary('add-x'),
        }),
      ).rejects.toThrow();

      // .tmp 不应残留在 source(回滚阶段必须 unlink)
      expect(existsSync(join(ctx.changeDir, 'archive_summary.tmp.yaml'))).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  it('归档 YAML 含 acked_warnings 与 handoff_to_backlog 数组(序列化完整)', async () => {
    const ctx = setupForgeRoot();
    try {
      const summary = buildSummary('add-x');
      summary.acked_warnings = [
        {
          source: 'verify_findings',
          id: 2,
          dimension: 'correctness',
          check_type: 'requirement-mapping',
          evidence: 'specs/x.md:15',
          acked_by: 'msc',
          acked_at: '2026-05-12T16:30:00Z',
        },
      ];
      summary.handoff_to_backlog = [
        {
          source: 'pause_decisions',
          id: 1,
          severity: 'WARNING',
          chosen_option: 3,
          target_artifact: 'proposal.md',
          target_anchor: '## Out of Scope',
          issue_summary: 'OAuth refresh',
        },
      ];
      await archiveTransaction({
        forgeRoot: ctx.forgeRoot,
        changeId: 'add-x',
        archiveDate: '2026-05-12',
        archiveSummary: summary,
      });
      const yamlText = readFileSync(
        join(ctx.forgeRoot, 'changes', 'archive', '2026-05-12-add-x', 'archive_summary.yaml'),
        'utf8',
      );
      const parsed = parseYaml(yamlText) as Record<string, unknown>;
      expect((parsed.acked_warnings as unknown[]).length).toBe(1);
      expect((parsed.handoff_to_backlog as unknown[]).length).toBe(1);
    } finally {
      ctx.cleanup();
    }
  });

  it('归档后 source 目录不再存在(.tmp 已随 Move 被 rename → 正式名)', async () => {
    const ctx = setupForgeRoot();
    try {
      await archiveTransaction({
        forgeRoot: ctx.forgeRoot,
        changeId: 'add-x',
        archiveDate: '2026-05-12',
        archiveSummary: buildSummary('add-x'),
      });
      expect(existsSync(ctx.changeDir)).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  // v2 MAJOR 2 新增:.tmp 写入失败注入(实测,POSIX chmod 0o555 / Win readonly attr)
  it('.tmp 写入失败(source 目录 readonly)→ 整体失败 + 抛错', async () => {
    const ctx = setupForgeRoot();
    try {
      // POSIX:chmod 0o555 sourceDir(write 禁止);Win:在 vitest skipIf 模式下跳过(沿 9c v6 同模式)
      const { chmod } = await import('node:fs/promises');
      if (process.platform === 'win32') {
        // Win 上 chmod 0o555 不会阻止文件创建(NTFS 权限模型不同),跳过此 case;
        // Windows 端真实注入需借助 ACL 设置,沿 9c 同模式留 it.todo
        return;
      }
      await chmod(ctx.changeDir, 0o555);
      await expect(
        archiveTransaction({
          forgeRoot: ctx.forgeRoot,
          changeId: 'add-x',
          archiveDate: '2026-05-12',
          archiveSummary: buildSummary('add-x'),
        }),
      ).rejects.toThrow(/archive_summary\.tmp\.yaml 写入失败/);
      // 复原权限以便清理
      await chmod(ctx.changeDir, 0o755);
    } finally {
      ctx.cleanup();
    }
  });

  // v2 MAJOR 2:三类失败注入留 it.todo(rename / Backup / Sync 失败),
  // 由 9z release plan unskip(同步加 3 个 9e1 todo 到 release-blocker-attack-path.test.ts,
  // EXPECTED_TODO_COUNT_SOFT 2 → 5)
  it.todo('rename .tmp → 正式名失败(archive dir 注入)→ archive 数据已 move,提示用户走 --resume-summary(v2 MAJOR 2)');
  it.todo('Backup 失败 → 反向 Move + 回滚 unlink summary + 抛错(v2 MAJOR 2)');
  it.todo('Sync 失败 → 反向 Move + 回滚 unlink summary + restore specs from backup + 抛错(v2 MAJOR 2)');
});
```

- [ ] **Step 1.2: 跑测试确认全红**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/archive/transaction-summary.test.ts
```

预期:6 case 至少 4 FAIL(`archiveSummary` 字段未被处理,`.tmp` / `archive_summary.yaml` 都不存在);兼容 case + Move 失败 case 可能通过(因当前 transaction 不写 summary)。

### Step 2: 扩 ArchiveTransactionInput + Move 前 .tmp 写 + Move 后 rename

- [ ] **Step 2.1: 修改 `src/core/archive/transaction.ts:1-17` 加 ArchiveSummary import + 扩 input 接口**

```typescript
// archive 顺序原子化:Move→Sync(spec §3.5)
// Plan 3 Task 11:archive transaction 实现
// plan-9e1 Task 3 修订:加 archive_summary `.tmp` 写入(Move 前)+ rename 到正式名(Move 后)+ 失败回滚

import { rename, mkdir, rm, cp, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { readDeltas, applyDeltas } from '../specs-sync/index.js';
import type { ArchiveSummary } from '../schemas/archive-summary.js';

/** archiveTransaction 输入参数 */
export interface ArchiveTransactionInput {
  /** <project>/forge/ 目录绝对路径 */
  forgeRoot: string;
  /** change id,如 'add-login' */
  changeId: string;
  /** 归档日期,格式 'YYYY-MM-DD',如 '2026-05-04' */
  archiveDate: string;
  /**
   * plan-9e1 Task 3 新增:可选 archive_summary 对象
   * - 传:Move 前在 source 写 archive_summary.tmp.yaml,Move 后 rename → archive_summary.yaml
   * - 不传:沿 v0.4 老行为,不产 summary(向后兼容)
   */
  archiveSummary?: ArchiveSummary;
}
```

- [ ] **Step 2.2: 修改 `src/core/archive/transaction.ts:34-47` 主函数加 .tmp 阶段**

替换原函数体的"路径计算"到"阶段 1"之间内容,插入 `.tmp` 写入阶段:

```typescript
export async function archiveTransaction(input: ArchiveTransactionInput): Promise<void> {
  const { forgeRoot, changeId, archiveDate, archiveSummary } = input;

  // 路径计算
  const sourceDir = join(forgeRoot, 'changes', changeId);
  const archiveTargetDir = join(forgeRoot, 'changes', 'archive', `${archiveDate}-${changeId}`);
  const currentSpecsDir = join(forgeRoot, 'specs');
  const backupDir = join(forgeRoot, '.cache', `archive-sync-backup-${process.pid}`);
  // plan-9e1 Task 3:archive_summary 路径(.tmp 与正式名)
  const tmpSummaryInSource = join(sourceDir, 'archive_summary.tmp.yaml');
  const tmpSummaryInArchive = join(archiveTargetDir, 'archive_summary.tmp.yaml');
  const finalSummaryInArchive = join(archiveTargetDir, 'archive_summary.yaml');

  // —— 阶段 0(plan-9e1 Task 3):Move 前在 source 写 archive_summary.tmp.yaml ——
  // 沿 design §2.4.5 step 3:archive_summary.tmp.yaml 写到 source 目录,跟随 Move 一起搬到 archive 目录
  // 失败处理:写入失败 → 抛错(整体 archive 失败,markers 未移走,source 仅 .tmp 残留 → finally 兜底 unlink)
  if (archiveSummary) {
    try {
      const yamlText = stringifyYaml(archiveSummary);
      await writeFile(tmpSummaryInSource, yamlText, 'utf8');
    } catch (writeErr) {
      // .tmp 写失败 → source 可能残留 partial 文件 → unlink + 抛错(整体 archive 失败)
      if (existsSync(tmpSummaryInSource)) {
        await unlink(tmpSummaryInSource).catch(() => {
          /* unlink 失败也忽略,把原始 write 错误抛出 */
        });
      }
      throw new Error(`archive_summary.tmp.yaml 写入失败: ${(writeErr as Error).message}`);
    }
  }

  // —— 阶段 1:Move(单原子 fs.rename)——
  // 确保 archive 父目录存在,但不创建目标目录本身(rename 负责)
  await mkdir(dirname(archiveTargetDir), { recursive: true });
  // 若目标已存在,rename 会失败(EEXIST/ENOTEMPTY),即 Move 失败路径
  try {
    await rename(sourceDir, archiveTargetDir);
  } catch (moveErr) {
    // plan-9e1 Task 3:Move 失败 → source 残留 .tmp → unlink + 抛错
    if (archiveSummary && existsSync(tmpSummaryInSource)) {
      await unlink(tmpSummaryInSource).catch(() => {
        /* 忽略 unlink 失败,把原始 move 错误抛出 */
      });
    }
    throw moveErr;
  }

  // —— 阶段 1.5(plan-9e1 Task 3):Move 后 rename .tmp → 正式名 ——
  // 沿 design §2.4.5 step 5:archive 目录内 archive_summary.tmp.yaml → archive_summary.yaml
  // 失败处理:rename 失败极罕见(同目录 rename);此时 archive 目录已 move,数据已在 archive,
  //   按 design §2.4.5 不强制回滚 Move,改提示用户走 forge archive --resume-summary <id>
  let summaryRenamed = false;
  if (archiveSummary) {
    try {
      await rename(tmpSummaryInArchive, finalSummaryInArchive);
      summaryRenamed = true;
    } catch (renameErr) {
      // 不回滚 Move(数据已在 archive),抛特殊错误供 caller 提示用户 --resume-summary
      throw new Error(
        `archive_summary rename 失败(.tmp → 正式名);archive 已 move 完成但 summary 仍是 .tmp 名。\n` +
          `请运行:forge archive --resume-summary ${archiveDate}-${changeId}\n` +
          `原始错误:${(renameErr as Error).message}`,
      );
    }
  }

  // —— 阶段 1.6:Backup(独立阶段,失败立即反向 rename + 不进 Sync)——
  // P2.2 修复:backup 独立成阶段,失败时 specs 不被破坏
  let backupSucceeded = false;
  try {
    if (existsSync(currentSpecsDir)) {
      await cp(currentSpecsDir, backupDir, { recursive: true });
    }
    backupSucceeded = true;
  } catch (backupErr) {
    // 部分 backup 残留 → 清理
    if (existsSync(backupDir)) {
      await rm(backupDir, { recursive: true, force: true });
    }
    // 反向 rename:把已移走的 change 目录恢复(specs/ 未动)
    try {
      await rename(archiveTargetDir, sourceDir);
      // v2 MAJOR 1 修订:反向 Move 后 unlink 任何 summary 文件(无论 .tmp / 正式名),
      // 让回滚状态完全等价"事务开始前 — 无 summary 残留",重试 archive 时重新生成
      if (archiveSummary) {
        const finalInSource = join(sourceDir, 'archive_summary.yaml');
        if (existsSync(finalInSource)) {
          await unlink(finalInSource).catch(() => {
            /* unlink 失败忽略 — backup 错是 root cause */
          });
        }
        if (existsSync(tmpSummaryInSource)) {
          await unlink(tmpSummaryInSource).catch(() => {});
        }
      }
    } catch {
      // 反向 rename 失败也忽略,把原始 backup 错抛出去(用户能看到 specs/ 未变)
    }
    throw new Error(`Backup failed before sync: ${(backupErr as Error).message}`);
  }
```

- [ ] **Step 2.3: 修改 `src/core/archive/transaction.ts:72-113` Sync 阶段失败回滚补 summary 还原**

替换原 sync 块的回滚链(行 82-113 区段)— 在反向 rename 之前加 summary `.tmp` 还原步骤:

```typescript
  // —— 阶段 2:Sync(可回滚,只在 backup 成功时启用 backup 路径)——
  try {
    // 2a. 读 deltas + 应用
    const archiveSpecsDir = join(archiveTargetDir, 'specs');
    const deltas = await readDeltas(archiveSpecsDir, currentSpecsDir);
    await applyDeltas(currentSpecsDir, deltas);

    // 2b. 成功 → 清理 backup
    if (existsSync(backupDir)) {
      await rm(backupDir, { recursive: true, force: true });
    }
  } catch (syncErr) {
    // —— 回滚路径(P2.3 修复:用 rolledBack flag 防止 throw 被 inner catch 误捕获)——
    let rolledBack = false;
    try {
      // a. 仅 backupSucceeded 时才从 backup 恢复 specs/
      if (backupSucceeded && existsSync(backupDir)) {
        // 清除(可能)已部分修改的 specs/
        await rm(currentSpecsDir, { recursive: true, force: true });
        await cp(backupDir, currentSpecsDir, { recursive: true });
      }

      // b. 反向 rename:archive/<date>-<id>/ 回 changes/<id>/
      await rename(archiveTargetDir, sourceDir);

      // v2 MAJOR 1 修订:反向 Move 后 unlink 任何 summary 文件(无论 .tmp / 正式名)
      if (archiveSummary) {
        const finalInSource = join(sourceDir, 'archive_summary.yaml');
        if (existsSync(finalInSource)) {
          await unlink(finalInSource).catch(() => {
            /* unlink 失败忽略 — Sync 错是 root cause */
          });
        }
        if (existsSync(tmpSummaryInSource)) {
          await unlink(tmpSummaryInSource).catch(() => {});
        }
      }

      // c. 清理 backup
      if (existsSync(backupDir)) {
        await rm(backupDir, { recursive: true, force: true });
      }

      rolledBack = true;
    } catch (rbErr) {
      // 回滚本身也失败 — 人工介入
      throw new Error(
        `Sync failed AND rollback failed: ${(syncErr as Error).message} / ${(rbErr as Error).message}\n` +
          `请手动检查 ${backupDir} 和 ${archiveTargetDir}`,
      );
    }
    // 回滚成功 → 在 inner try 外面 throw,避免被 inner catch 误捕获
    if (rolledBack) {
      throw new Error(`Sync failed and rolled back: ${(syncErr as Error).message}`);
    }
  }
}
```

- [ ] **Step 2.4: 跑 transaction-summary 测试,确认 6 case PASS**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/archive/transaction-summary.test.ts
```

预期:6 PASS。

- [ ] **Step 2.5: 跑现有 transaction.test.ts 确保未回归**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/core/archive/transaction.test.ts
```

预期:全 PASS(老 case 都不传 `archiveSummary`,走兼容路径)。

- [ ] **Step 2.6: v2 MAJOR 2 — 同步更新 `scripts/check-release-gate.mjs` `EXPECTED_TODO_COUNT_SOFT` 2 → 5**

```javascript
// scripts/check-release-gate.mjs:30
// v2 MAJOR 2(plan-9e1):2 → 5(plan-9c 2 个 + plan-9e1 3 个 failure-injection it.todo)
const EXPECTED_TODO_COUNT_SOFT = 5;
```

- [ ] **Step 2.7: v2 MAJOR 2 — 在 `tests/integration/release-blocker-attack-path.test.ts` 加 3 个 9e1 todo**

在 `describe('release-blocker: pause_decisions option=1/2 attack paths (9z gate)', ...)` 之后追加新 describe:

```typescript
describe('release-blocker: 9e1 transaction failure injection paths (9z gate)', () => {
  it.todo(
    '9e1 transaction rename .tmp → 正式名失败:archive dir 注入失败 → archive 数据已 move,fence 应明确抛错提示 --resume-summary(plan-9e1 Task 3 v2 MAJOR 2)',
  );
  it.todo(
    '9e1 transaction Backup 失败:反向 Move 后 unlink summary 应清理 source 目录残留(plan-9e1 Task 3 v2 MAJOR 2)',
  );
  it.todo(
    '9e1 transaction Sync 失败:反向 Move + restore specs from backup + unlink summary 应原子回滚(plan-9e1 Task 3 v2 MAJOR 2)',
  );
});
```

注意:这 3 个 `it.todo` 加入后 EXPECTED_TODO_COUNT_SOFT 必须 5(同步 Step 2.6);不一致 → `pnpm test:gate` 失败。

- [ ] **Step 2.8: 跑 release-gate 验证一致性**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test:gate
```

预期:`[release-gate:soft] PASS: 5 it.todo(s) = expected 5 (reminder only, NOT release enforcement)`。

### Step 3: Typecheck + format + commit

- [ ] **Step 3.1: 跑 typecheck + format + 完整 archive 域测试**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm format:check && pnpm test tests/core/archive/
```

预期:typecheck PASS / format PASS / test 全 PASS(含 transaction / ack-log / lock / recover / summary-builder / transaction-summary)。

- [ ] **Step 3.2: commit Task 3**

```bash
git -C D:/ClaudeProject/opsp/forge-repo add src/core/archive/transaction.ts tests/core/archive/transaction-summary.test.ts
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9e1 Task 3): archiveTransaction 集成 archive_summary .tmp 写 + rename + 失败回滚

沿 design §2.4.5 五阶段:Move 前 .tmp 写到 source → Move(整目录搬走 .tmp 跟随)→
Move 后 rename .tmp → 正式名 → Backup → Sync。任一阶段失败按表回滚:
- .tmp 写失败 → unlink + 抛错
- Move 失败 → unlink source .tmp + 抛错
- rename 失败(罕见)→ 不回滚 Move,提示用户 --resume-summary
- Backup/Sync 失败 → 反向 Move + 把 summary 改回 .tmp 名 + 还原 specs

archiveSummary 字段可选(老 v0.4 调用不传 → 不产 summary,向后兼容)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

预期:commit 成功。

---

## 5. Task 4 — archive.ts 三级 fence(verify 端 sanity / review 端核心 + C 拒签)+ summary 集成 + 输出渲染 + 单测

**Files**:
- Create: `src/core/archive/three-level-fence.ts`(**v2 BLOCKER 3 + MINOR 1**:verify 端瘦成 CRITICAL sanity 兜底,review 端 S/C/L 三分支核心)
- Create: `src/core/archive/summary-render.ts`
- Modify: `src/cli/commands/archive.ts`(步骤 3.9 加 fence + 步骤 4.5 调 builder + try/catch `ScopeEntriesIntegrityError` + 步骤 6 render)
- Create: `tests/cli/archive-three-level-fence.test.ts`
- Create: `tests/cli/archive-summary-output.test.ts`

**v2 BLOCKER 3 + MINOR 1 重构要点**:
- v1 三级 fence 在 verify_findings 端业务行为(WARNING+!ack 拒签)**与 9d verify-findings-fence step 3.6 完全重复** — codex review 隐含指出
- v2 修订:**verify_findings 端瘦成 CRITICAL sanity 兜底**(9d 应该已拦,9e1 再加一道防止 9d skip / mock 路径漏过 CRITICAL),WARNING/SUGGESTION 不重复处理,由 9d 单源
- review_outcomes 端是 9e1 三级 fence **核心**(沿 design §2.4.2 + §2.3.5 简码迁移):
  - `S` + resolved=false → 拒签(CRITICAL 简码 sanity)
  - `C` + resolved=false → **拒签 + 提示 `forge upgrade --resign-markers`**(沿 design §2.3.5 line 559 — clarification 不自动映射,必须人工迁移)
  - `L` + resolved=false → 通过(SUGGESTION 持挂,由 builder collector2 进 pending_suggestions)
  - 全 resolved=true → 通过
- 测试比例从 5:3(verify:review)调到 3:6:verify 端 1 CRITICAL sanity case + 2 边界(空 / SUGGESTION 不拦)+ review 端 S/C/L 三分支 × 各 2 case(resolved=true / resolved=false)

### Step 1: 先写三级 fence 失败测试(TDD red)

- [ ] **Step 1.1: 创建 `src/core/archive/three-level-fence.ts` 接口骨架(让测试可 import)**

```typescript
// src/core/archive/three-level-fence.ts — plan-9e1 Task 4(v2 BLOCKER 3 + MINOR 1 重构)
// 9e1 三级业务行为 fence:
//
// 设计定位(v2 MINOR 1 重构):
//   - **verify_findings 端**:仅 CRITICAL sanity 兜底(9d verify-findings-fence step 3.6 已拦
//     CRITICAL+resolved=false 与 WARNING+!ack;9e1 此处只保 CRITICAL 双重保险,WARNING/SUGGESTION
//     由 9d 单源,不重复)
//   - **review_outcomes 端**:核心 — 简码 S/C/L 三分支裁决(沿 design §2.4.2 表 + §2.3.5 简码迁移)
//     - S(CRITICAL 简码)+ resolved=false → 拒签
//     - C(clarification)+ resolved=false → 拒签 + **提示 `forge upgrade --resign-markers`**
//       (沿 design §2.3.5 line 559:C 不自动映射,必须人工迁移)
//     - L(SUGGESTION)+ resolved=false → 通过(handoff to backlog)
//
// 沿 verify-findings-fence.ts / pause-decisions-fence.ts 模块化模式
// 与 verify-findings-fence 的区别:本 fence **不重算 finding_hash**(verify-findings-fence 已校验),
//   只做"业务行为"裁决

import type { Finding } from '../schemas/severity.js';
import { type ValidationResult, ok, failed, mergeResults } from '../validate/types.js';

/** review_outcomes 子集类型(沿 marker types.ReviewOutcome) */
interface ReviewOutcome {
  severity: 'S' | 'C' | 'L';
  accepted: boolean;
  resolved: boolean;
  task_ref?: string;
  rationale?: string;
}

/**
 * 三级业务行为 fence(v2 BLOCKER 3 + MINOR 1 重构)
 * @param verifyMarker .verify-passed marker(Record 形)— 读 verify_findings 字段
 * @param reviewMarker .review-passed marker(Record 形)— 读 review_outcomes 字段
 * @param verifyFile 可选错误报告用 .verify-passed 路径
 * @param reviewFile 可选错误报告用 .review-passed 路径
 */
export function validateThreeLevelFence(
  verifyMarker: Record<string, unknown>,
  reviewMarker: Record<string, unknown>,
  verifyFile?: string,
  reviewFile?: string,
): ValidationResult {
  const results: ValidationResult[] = [];

  // 1. verify_findings 端:**仅 CRITICAL sanity 兜底**(v2 MINOR 1:WARNING/SUGGESTION 由 9d 单源)
  const findings = Array.isArray(verifyMarker.verify_findings)
    ? (verifyMarker.verify_findings as Finding[])
    : [];
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i] as Finding;
    if (f.severity === 'CRITICAL' && f.resolved === false) {
      results.push(
        failed({
          artifact: 'marker',
          field: `verify_findings[${i}].resolved`,
          message: `[9e1 sanity 兜底] CRITICAL finding 未 resolve;正常应被 9d verify-findings-fence step 3.6 拦截,此处兜底拒签(沿 design §2.4.2 CRITICAL 行)`,
          file: verifyFile,
        }),
      );
    }
    // v2 MINOR 1:WARNING + resolved=false + !ack 由 9d verify-findings-fence step 3.6 拦,本 fence 不重复
    // SUGGESTION + resolved=false 由 9e1 builder 进 pending_suggestions 持挂,本 fence 不拦
  }

  // 2. review_outcomes 端:**核心** — S/C/L 三分支裁决(v2 BLOCKER 3)
  const outcomes = Array.isArray(reviewMarker.review_outcomes)
    ? (reviewMarker.review_outcomes as ReviewOutcome[])
    : [];
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i] as ReviewOutcome;
    const fieldBase = `review_outcomes[${i}]`;
    if (o.severity === 'S' && o.resolved === false) {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.resolved`,
          message: `review_outcomes S(CRITICAL 简码)未 resolve(沿 design §2.4.2 + §2.3.5 简码映射);需 resolve 或走 forge upgrade --resign-markers 迁移为全名 CRITICAL`,
          file: reviewFile,
        }),
      );
    } else if (o.severity === 'C') {
      // v3 BLOCKER 1 + v4 BLOCKER 1:C(clarification)**无视** resolved/accepted/rationale 全拒签
      // 沿 design §2.3.5 line 559 + line 563:"C 不自动映射;archive 阶段给 CRITICAL finding,
      //   拒签直到用户走 forge upgrade --resign-markers 处理"
      // 关键语义:resolved=true 仅表示 v0.4 视角已修,但 v1.0 视角 severity 仍是简码 C —
      //   archive_summary.yaml 落地后 v1.1 backlog index 读到 C 简码会语义错乱;
      //   必须经 9j resign 把 C 升级到 WARNING/SUGGESTION 全名后才能 archive
      //
      // v4 BLOCKER 1 修订:**删除** v3 "9j 未完成时手动迁移 marker" 路径 — 三道墙都走不通:
      //   (1) ReviewOutcome 接口 severity: 'S'|'C'|'L' 不接受全名
      //   (2) marker-schema REVIEW_OUTCOME_SEVERITY_CODES 拒签全名
      //   (3) WARNING ack 必须 CLI ack-log,违反 AI 反向加固
      // 9e1 fence 是**硬墙** — 9j 未完成时 archive C 简码 marker 阻塞,必须等 9j 落地
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.severity`,
          message:
            `review_outcomes C(clarification 简码,resolved=${String(o.resolved)})不允许 archive(沿 design §2.3.5 line 559+563:C 不自动映射,必须经 forge upgrade --resign-markers 人工迁移)。\n` +
            `  **必须等 plan-9j marker version + deprecation 完成后**,运行 \`forge upgrade --resign-markers\` 交互式询问每条 C 的目标 severity(WARNING / SUGGESTION)+ 自动 resign marker 字段 + 写 ack-log.jsonl。\n` +
            `  9e1 fence 是硬墙 — 不接受手动编辑 marker(违反 AI 反向加固 + ReviewOutcome 接口不接受全名 + ack-log 协议)。`,
          file: reviewFile,
        }),
      );
    }
    // L(SUGGESTION 简码)+ 未 resolved → 通过(handoff 进 builder collector2 pending_suggestions)
    // S 简码 + resolved=true → 通过(常规 archive)
    // L 简码 + resolved=true → 通过
  }

  return mergeResults(...results);
}
```

- [ ] **Step 1.2: 创建 `tests/cli/archive-three-level-fence.test.ts`**

```typescript
// archive-three-level-fence.test.ts — plan-9e1 Task 4 单测
// 沿 verify-findings-fence 单测同模式,直接调 validateThreeLevelFence(不走 CLI,快速反馈)
// e2e 跑全链(archive 命令)留给 Task 6

import { describe, it, expect } from 'vitest';
import { validateThreeLevelFence } from '../../src/core/archive/three-level-fence.js';

function baseVerify(): Record<string, unknown> {
  return {
    schema: 'forge-verify/v1',
    verified_at: '2026-05-12T16:30:00Z',
    verified_by: 'ai-agent',
    tasks_hash: 'sha256:' + 'a'.repeat(64),
    content_hash: 'sha256:' + 'b'.repeat(64),
    evidence: [],
  };
}
function baseReview(): Record<string, unknown> {
  return {
    schema: 'forge-review/v1',
    reviewed_at: '2026-05-12T16:40:00Z',
    reviewed_by: 'ai-agent',
    tasks_hash: 'sha256:' + 'a'.repeat(64),
    content_hash: 'sha256:' + 'b'.repeat(64),
    git: { is_git_repo: false },
    review_outcomes: [],
  };
}

describe('validateThreeLevelFence (v2 重构:verify 端 sanity + review 端核心)', () => {
  // —— verify_findings 端:仅 CRITICAL sanity(v2 MINOR 1) ——
  it('空 markers → 通过', () => {
    const r = validateThreeLevelFence(baseVerify(), baseReview());
    expect(r.valid).toBe(true);
  });

  it('verify_findings CRITICAL + resolved=false → 拒签(sanity 兜底,正常应被 9d 拦)', () => {
    const v = baseVerify();
    v.verify_findings = [
      {
        id: 1,
        dimension: 'completeness',
        check_type: 'x',
        severity: 'CRITICAL',
        automated: true,
        evidence: 'change-level',
        recommendation: 'r',
        resolved: false,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    const r = validateThreeLevelFence(v, baseReview());
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /sanity/.test(e.message))).toBe(true);
  });

  it('verify_findings WARNING + resolved=false + 缺 ack → **9e1 fence 不拦**(由 9d 单源处理,v2 MINOR 1)', () => {
    const v = baseVerify();
    v.verify_findings = [
      {
        id: 1,
        dimension: 'correctness',
        check_type: 'x',
        severity: 'WARNING',
        automated: false,
        evidence: 'src/x.ts:1',
        recommendation: 'r',
        resolved: false,
        finding_hash: 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        git_head: 'c'.repeat(40),
      },
    ];
    const r = validateThreeLevelFence(v, baseReview());
    // v2:9e1 三级 fence verify 端不再处理 WARNING(9d 单源);此处期望通过
    expect(r.valid).toBe(true);
  });

  // —— review_outcomes 端核心:S/C/L 三分支(v2 BLOCKER 3) ——
  it('review_outcomes S + resolved=false → 拒签', () => {
    const rv = baseReview();
    rv.review_outcomes = [
      { severity: 'S', accepted: false, resolved: false, rationale: 'critical bug' },
    ];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /S\(CRITICAL/.test(e.message))).toBe(true);
  });

  it('review_outcomes S + resolved=true → 通过', () => {
    const rv = baseReview();
    rv.review_outcomes = [
      { severity: 'S', accepted: true, resolved: true, task_ref: 'fix-1' },
    ];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(true);
  });

  it('review_outcomes C + resolved=false + accepted=true + rationale 非空 → **拒签**(v3 BLOCKER 1:无视 resolved/accepted/rationale)', () => {
    const rv = baseReview();
    rv.review_outcomes = [
      { severity: 'C', accepted: true, resolved: false, rationale: 'human accepted', task_ref: 't1' },
    ];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /clarification/.test(e.message))).toBe(true);
    // v4 BLOCKER 1:fence 硬墙,提示走 9j(forge upgrade --resign-markers);删除 v3 manual edit 等价路径
    expect(r.errors.some((e) => /forge upgrade --resign-markers|9j/.test(e.message))).toBe(true);
    // v4 BLOCKER 1:必须含"硬墙"或"不接受手动编辑"字眼,反向加固提示
    expect(r.errors.some((e) => /硬墙|不接受手动编辑|反向加固/.test(e.message))).toBe(true);
  });

  // v3 BLOCKER 1 修订:C + resolved=true 由 v2 通过 → v3 改为拒签
  it('review_outcomes C + resolved=true → **拒签**(v3 BLOCKER 1:v0.4 视角 resolved 但 v1.0 视角 severity 仍是简码 C,必须 resign)', () => {
    const rv = baseReview();
    rv.review_outcomes = [
      { severity: 'C', accepted: true, resolved: true, task_ref: 't1' },
    ];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /clarification/.test(e.message))).toBe(true);
  });

  // v3 BLOCKER 1 新增:C + accepted=false 也拒签(任何 C 状态都拒签)
  it('review_outcomes C + accepted=false + resolved=false → 拒签(任何 C 状态都拒签)', () => {
    const rv = baseReview();
    rv.review_outcomes = [
      { severity: 'C', accepted: false, resolved: false, rationale: 'rejected' },
    ];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /clarification/.test(e.message))).toBe(true);
  });

  it('review_outcomes L + resolved=false → 通过(SUGGESTION 持挂,builder 收进 pending_suggestions)', () => {
    const rv = baseReview();
    rv.review_outcomes = [
      { severity: 'L', accepted: false, resolved: false, rationale: 'suggestion only' },
    ];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(true);
  });

  it('review_outcomes L + resolved=true → 通过', () => {
    const rv = baseReview();
    rv.review_outcomes = [
      { severity: 'L', accepted: false, resolved: true, rationale: 'minor' },
    ];
    const r = validateThreeLevelFence(baseVerify(), rv);
    expect(r.valid).toBe(true);
  });
});
```

- [ ] **Step 1.3: 跑测试**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/cli/archive-three-level-fence.test.ts
```

预期:8 PASS(three-level-fence.ts 在 Step 1.1 已实现)。

### Step 2: 实现 summary-render

- [ ] **Step 2.1: 创建 `tests/cli/archive-summary-output.test.ts`**

```typescript
// archive-summary-output.test.ts — plan-9e1 Task 4 单测
// 校验 renderArchiveSummaryOutput 输出格式(沿 design §2.4.4)

import { describe, it, expect } from 'vitest';
import { renderArchiveSummaryOutput } from '../../src/core/archive/summary-render.js';
import {
  ARCHIVE_SUMMARY_VERSION,
  PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
  type ArchiveSummary,
} from '../../src/core/schemas/archive-summary.js';

function baseSummary(): ArchiveSummary {
  return {
    schema: 'forge-archive-summary/v1',
    version: ARCHIVE_SUMMARY_VERSION,
    archived_at: '2026-05-12T16:45:00Z',
    change_id: 'add-oauth-refresh',
    verify_passed: { verified_invariants: ['hash-match', 'evidence-complete'] },
    review_passed: { reviewers: ['ai-agent'] },
    process_evidence_summary: PLACEHOLDER_PROCESS_EVIDENCE_SUMMARY,
    handoff_to_backlog: [],
    acked_warnings: [],
    pending_suggestions: [],
  };
}

describe('renderArchiveSummaryOutput', () => {
  it('空 summary → 只含基本 header', () => {
    const out = renderArchiveSummaryOutput(baseSummary(), '2026-05-12-add-oauth-refresh');
    expect(out).toMatch(/## Archive Complete/);
    expect(out).toMatch(/\*\*Change:\*\* add-oauth-refresh/);
    expect(out).toMatch(/\*\*Archived to:\*\* forge\/changes\/archive\/2026-05-12-add-oauth-refresh/);
    expect(out).not.toMatch(/Acknowledged Warnings/); // 空数组不出现段
    expect(out).not.toMatch(/Pending Suggestions/);
  });

  it('含 acked_warnings → 渲染 Acknowledged Warnings 段', () => {
    const s = baseSummary();
    s.acked_warnings = [
      {
        source: 'verify_findings',
        id: 2,
        dimension: 'correctness',
        check_type: 'requirement-mapping',
        evidence: 'specs/auth.md:15',
        acked_by: 'msc',
        acked_at: '2026-05-12T16:30:00Z',
        rationale: 'spec 描述模糊',
      },
    ];
    const out = renderArchiveSummaryOutput(s, '2026-05-12-add-oauth-refresh');
    expect(out).toMatch(/### Acknowledged Warnings \(1\)/);
    expect(out).toMatch(/\[WARNING\] verify_findings#2/);
    expect(out).toMatch(/correctness\/requirement-mapping/);
    expect(out).toMatch(/Acked by: msc/);
  });

  it('含 pending_suggestions → 渲染 Pending Suggestions 段 + handoff 提示', () => {
    const s = baseSummary();
    s.pending_suggestions = [
      {
        source: 'verify_findings',
        id: 3,
        dimension: 'coherence',
        check_type: 'pattern-consistency',
        evidence: 'src/auth/login.ts:23',
        recommendation: '考虑 rename handleLogin',
      },
    ];
    const out = renderArchiveSummaryOutput(s, '2026-05-12-add-oauth-refresh');
    expect(out).toMatch(/### Pending Suggestions \(1\) — handed off to backlog/);
    expect(out).toMatch(/\[SUGGESTION\] verify_findings#3/);
    expect(out).toMatch(/handleLogin/);
    expect(out).toMatch(/forge backlog list/); // v1.1 引用
  });
});
```

- [ ] **Step 2.2: 创建 `src/core/archive/summary-render.ts`**

```typescript
// src/core/archive/summary-render.ts — plan-9e1 Task 4
// renderArchiveSummaryOutput:把 ArchiveSummary → 用户可读字符串(沿 design §2.4.4 模板)

import type { ArchiveSummary, AckedWarningRef, SuggestionRef } from '../schemas/archive-summary.js';

/**
 * @param summary ArchiveSummary 对象
 * @param archiveDirName archive 子目录名(如 '2026-05-12-add-oauth-refresh');用于 yaml 路径提示
 */
export function renderArchiveSummaryOutput(
  summary: ArchiveSummary,
  archiveDirName: string,
): string {
  const lines: string[] = [];
  lines.push('## Archive Complete');
  lines.push('');
  lines.push(`**Change:** ${summary.change_id}`);
  lines.push(`**Archived to:** forge/changes/archive/${archiveDirName}/`);
  lines.push(`**Specs:** ✓ Synced`);
  // process_evidence_summary placeholder 显式标注(9e2 接 9g 后换成真实统计)
  if (summary.process_evidence_summary.placeholder) {
    lines.push(`**Security:** [process_evidence:placeholder] ${summary.process_evidence_summary.note ?? ''}`);
  } else {
    const p = summary.process_evidence_summary;
    lines.push(
      `**Security:** [process_evidence:passed=${p.invariants_passed ?? 0}/failed=${p.invariants_failed ?? 0}/legacy=${p.legacy_exempt ?? 0}]`,
    );
  }
  lines.push('');

  // Acknowledged Warnings 段
  if (summary.acked_warnings.length > 0) {
    lines.push(`### Acknowledged Warnings (${summary.acked_warnings.length})`);
    for (const a of summary.acked_warnings) {
      lines.push(renderAckedWarning(a));
    }
    lines.push('');
  }

  // Pending Suggestions 段
  if (summary.pending_suggestions.length > 0) {
    lines.push(`### Pending Suggestions (${summary.pending_suggestions.length}) — handed off to backlog`);
    for (const s of summary.pending_suggestions) {
      lines.push(renderPendingSuggestion(s));
    }
    lines.push('');
  }

  // 提示
  lines.push(`Review handoff details: cat forge/changes/archive/${archiveDirName}/archive_summary.yaml`);
  lines.push(`v1.1+: run \`forge backlog list\` to query across changes`);
  return lines.join('\n');
}

function renderAckedWarning(a: AckedWarningRef): string {
  const tag = `[WARNING] ${a.source}#${a.id}`;
  const dim = a.dimension && a.check_type ? ` (${a.dimension}/${a.check_type})` : '';
  const head = `- ${tag}${dim}`;
  const ev = a.evidence ? `\n  Evidence: ${a.evidence}` : '';
  const acked = `\n  Acked by: ${a.acked_by}${a.acked_at ? ` at ${a.acked_at}` : ''}`;
  const rat = a.rationale ? `\n  Rationale: ${a.rationale}` : '';
  return `${head}${ev}${acked}${rat}`;
}

function renderPendingSuggestion(s: SuggestionRef): string {
  const tag = `[SUGGESTION] ${s.source}#${s.id}`;
  const dim = s.dimension && s.check_type ? ` (${s.dimension}/${s.check_type})` : '';
  const head = `- ${tag}${dim}`;
  const ev = s.evidence ? `\n  Source: ${s.evidence}` : '';
  const rec = s.recommendation ? `\n  Recommendation: ${s.recommendation}` : '';
  return `${head}${ev}${rec}`;
}
```

- [ ] **Step 2.3: 跑 render 测试 + fence 测试**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/cli/archive-three-level-fence.test.ts tests/cli/archive-summary-output.test.ts
```

预期:fence 8 PASS + render 3 PASS = 11 PASS。

### Step 3: archive.ts 集成 — 步骤 3.9 fence + 步骤 4.5 builder + 步骤 6 render

- [ ] **Step 3.1: 修改 `src/cli/commands/archive.ts:42-44` 加 import**

在 line 42-43 之后追加新 import:

```typescript
// plan-9c Task 2:pause_decisions fence
import { validatePauseDecisionsFence } from '../../core/archive/pause-decisions-fence.js';
// plan-9e1 Task 4:三级 fence + summary builder + render
import { validateThreeLevelFence } from '../../core/archive/three-level-fence.js';
import { buildArchiveSummary } from '../../core/archive/summary-builder.js';
import { renderArchiveSummaryOutput } from '../../core/archive/summary-render.js';
```

- [ ] **Step 3.2: 修改 `src/cli/commands/archive.ts:354-371` ack-log cross-check 之后插入步骤 3.9 三级 fence**

在 line 371(`if (!ackReviewResult.valid) { ... process.exit(1); }` 块结束)之后插入:

```typescript
          // 步骤 3.9:plan-9e1 Task 4 — 三级业务行为 fence(沿 design §2.4.2)
          // CRITICAL+resolved=false 拒签(sanity 双重保险)/ WARNING+resolved=false+无 ack 拒签 /
          // WARNING+resolved=false+acked 通过 / SUGGESTION+resolved=false 通过(handoff to backlog)
          const tlfResult = validateThreeLevelFence(verifyRec, reviewRec, verifyPath, reviewPath);
          if (!tlfResult.valid) {
            console.error('✗ 三级业务行为 fence 拒签:');
            for (const e of tlfResult.errors) console.error(`  - ${e.field}: ${e.message}`);
            await archiveRelease();
            process.exit(1);
          }
```

- [ ] **Step 3.3: 修改 `src/cli/commands/archive.ts:444-446` archiveTransaction 调用前生成 summary**

替换 line 444-446 区段(`const archiveDate = new Date().toISOString().slice(0, 10); await archiveTransaction({ forgeRoot, changeId, archiveDate });`):

```typescript
          // 步骤 4.5:plan-9e1 Task 4 — 构造 archive_summary(传给 transaction 落 .tmp)
          const archiveDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          const changeDir = join(forgeRoot, 'changes', changeId);
          const archiveSummary = await buildArchiveSummary(
            verifyRec,
            reviewRec,
            changeDir,
            changeId,
          );

          // 步骤 5:调 archiveTransaction(Move→Sync,含 .tmp 写 / rename / 回滚)
          await archiveTransaction({ forgeRoot, changeId, archiveDate, archiveSummary });
```

注意:`changeDir` 在 line 213 已经定义过(`const changeDir = join(forgeRoot, 'changes', changeId);`),此处会产生重定义。需要把上面 line 213 的 `const changeDir = ...` 改成 `let changeDir = ...` **或者**保留 line 213 不变,把 Step 3.3 这里改为不重新声明,沿用 line 213 的 `changeDir`。

**v0 修订**:走第 2 种做法 — 删除 Step 3.3 中的 `const changeDir = ...` 行,沿用 line 213 的 `changeDir`:

```typescript
          // 步骤 4.5:plan-9e1 Task 4 — 构造 archive_summary(传给 transaction 落 .tmp)
          // v2 BLOCKER 4 修订:try/catch ScopeEntriesIntegrityError → fence business-fail exit 1
          const archiveDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          let archiveSummary;
          try {
            archiveSummary = await buildArchiveSummary(
              verifyRec,
              reviewRec,
              changeDir, // 沿用 line 213 已定义的 changeDir
              changeId,
            );
          } catch (err) {
            if (err instanceof ScopeEntriesIntegrityError) {
              console.error(
                `✗ scope-entries 完整性 fence 拒签(${err.artifactName} section ${err.anchorId}):${err.message}`,
              );
              await archiveRelease();
              process.exit(1);
            }
            throw err;
          }

          // 步骤 5:调 archiveTransaction(Move→Sync,含 .tmp 写 / rename / 回滚)
          await archiveTransaction({ forgeRoot, changeId, archiveDate, archiveSummary });
```

**v2 BLOCKER 4 注**:`ScopeEntriesIntegrityError` 从 Task 2 builder 抛出;archive.ts 在 imports 区追加(替换 Step 3.1 中已写的 import block):

```typescript
// plan-9e1 Task 4:三级 fence + summary builder + render + ScopeEntriesIntegrityError(v2 BLOCKER 4)
import { validateThreeLevelFence } from '../../core/archive/three-level-fence.js';
import {
  buildArchiveSummary,
  ScopeEntriesIntegrityError,
} from '../../core/archive/summary-builder.js';
import { renderArchiveSummaryOutput } from '../../core/archive/summary-render.js';
```

- [ ] **Step 3.4: 修改 `src/cli/commands/archive.ts:450-451` archive 成功后渲染输出**

替换 line 450-451(`console.log(\`✓ archived ${changeId} → changes/archive/${archiveDate}-${changeId}\`);`):

```typescript
          // 步骤 5.5:Plan 7 post-archive hook(enforce_sync=false 时不阻塞,只产报告)
          await runArchivePostHook(forgeRoot, changeId);

          // 步骤 6:plan-9e1 Task 4 — 渲染 archive_summary 输出(沿 design §2.4.4)
          const archiveDirName = `${archiveDate}-${changeId}`;
          console.log(renderArchiveSummaryOutput(archiveSummary, archiveDirName));
```

(原 `console.log(\`✓ archived ...\`)` 由 renderArchiveSummaryOutput 输出的 `## Archive Complete` 段替代;更详细,符合 design §2.4.4 模板)

- [ ] **Step 3.5: 跑现有 archive 集成测试,确认未回归**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/cli/archive.test.ts
```

预期:全 PASS(本 plan 不改 happy path 业务规则,所有 archive 现有 case 都应过)。**若 archive.test.ts 中 stdout 断言写死了 `✓ archived` 字面**,需把那些断言改为更松散的 regex(如 `/Archive Complete|archived/`)。

- [ ] **Step 3.6: 跑 9c/9d e2e 测试确保 fence 链未回归**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/integration/pause-decisions-end-to-end.test.ts tests/integration/verify-findings-end-to-end.test.ts
```

预期:全 PASS。

### Step 4: Typecheck + format + commit

- [ ] **Step 4.1: 全本地 verify**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

预期:全过。

- [ ] **Step 4.2: commit Task 4**

```bash
git -C D:/ClaudeProject/opsp/forge-repo add src/core/archive/three-level-fence.ts src/core/archive/summary-render.ts src/cli/commands/archive.ts tests/cli/archive-three-level-fence.test.ts tests/cli/archive-summary-output.test.ts
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9e1 Task 4): archive.ts 三级 fence(verify sanity / review S/C/L)+ summary 集成 + 输出渲染 + 13 case 单测(10 fence + 3 render)

- three-level-fence.ts:沿 design §2.4.2 三级业务行为裁决(CRITICAL/WARNING+ack/SUGGESTION/review_outcomes 简码 S/C/L 平行)
- summary-render.ts:沿 design §2.4.4 模板输出 Archive Complete + Acknowledged Warnings + Pending Suggestions 段
- archive.ts 步骤 3.9 加 fence;步骤 4.5 调 buildArchiveSummary 传给 transaction;步骤 6 用 render 替换原 console.log

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

预期:commit 成功。

---

## 6. Task 5 — `--resume-summary` 子命令(+ 内容校验)+ validate 孤立 .tmp 扫描 + 单测

**Files**:
- Create: `src/core/archive/resume-summary.ts`(v2 BLOCKER 5:rename 前 schema 校验)
- Create: `src/core/validate/orphan-tmp.ts`
- Modify: `src/core/archive/lock.ts`(v2 BLOCKER 1:LockMode 扩 `'resume-summary'`)
- Modify: `src/cli/commands/archive.ts`(加 `--resume-summary <archive-id>` flag 路径;**lock-held exit 2 / corrupt exit 3**,v2 BLOCKER 1+5)
- Modify: `src/core/validate/change.ts`(在 results warnings 末尾追加 scanOrphanTmp 输出)
- Create: `tests/cli/archive-resume-summary.test.ts`(4 case,v2 BLOCKER 5 +1)
- Create: `tests/core/validate/orphan-tmp.test.ts`

**v2 BLOCKER 1 修订 — LockMode 扩展 + exit code 对齐 freeze**:
- `src/core/archive/lock.ts:12-20` `LockMode` union 字面 8 个不含 `'resume-summary'` — v1 plan 直接调 `acquireLock(forgeRoot, 'resume-summary')` 会编译失败
- v2 修订:扩 `LockMode` union 加 `'resume-summary'`
- master §3.12.3 给 `forge archive` lock 错 → exit 2(line 499);v1 plan 沿现有 archive.ts:152 `--recover` 路径 LockHeldError → exit 5,**不符 freeze**
- v2 修订:`--resume-summary` 路径 LockHeldError → **exit 2**(对齐 master freeze);**不动** v0.4 `--recover` 路径 exit 5 遗留(单独 GH issue 跟进)

**v2 BLOCKER 5 修订 — rename 前内容校验**:
- v1 plan `resumeArchiveSummary` 三场景仅检查 `.tmp` / 正式 `.yaml` 存在与否就 rename — 损坏或手放 `.tmp` 会被升级为正式 `.yaml`(数据可信度问题)
- v2 修订:rename 前 readFile + parseYaml + `validateArchiveSummarySchema`,失败返 `kind: 'corrupt'`;archive.ts CLI 路径 corrupt → **exit 3**(沿 master §3.12.3 corrupt 档)
- 测试 +1 case:`.tmp` 内容损坏(schema 字段错)→ exit 3 + stderr 含 'corrupt' / 'schema'

### Step 1: 先写 resume-summary 失败测试(TDD red)

- [ ] **Step 1.1: 创建 `tests/cli/archive-resume-summary.test.ts`**

```typescript
// archive-resume-summary.test.ts — plan-9e1 Task 5 单测
// 测试 forge archive --resume-summary <archive-id> 三场景:
//   1. archive 目录有 .tmp + 无正式 .yaml → rename 成功(exit 0)
//   2. archive 目录有 .tmp + 已存在正式 .yaml → 拒签(exit 1)+ 错误提示
//   3. archive 目录无 .tmp 也无正式 .yaml → 报错(exit 2 或 1,沿状态损坏类)
//
// 沿 archive.test.ts 同模式 — tmpdir 搭 forge skeleton + 跑 archive --resume-summary

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const FORGE_CLI = resolve(process.cwd(), 'dist/cli/index.js');

function setupArchivedChange(opts: {
  withTmp: boolean;
  withFinal: boolean;
}): { tmpRoot: string; archiveId: string; cleanup: () => void } {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-resume-'));
  const archiveId = '2026-05-12-add-x';
  const archiveDir = join(tmpRoot, 'forge', 'changes', 'archive', archiveId);
  mkdirSync(archiveDir, { recursive: true });
  mkdirSync(join(tmpRoot, 'forge', '.cache'), { recursive: true });
  writeFileSync(join(tmpRoot, 'forge', 'config.yaml'), 'schema: forge-spec-driven/v1\nharness:\n  - claude\n', 'utf8');
  if (opts.withTmp) {
    writeFileSync(
      join(archiveDir, 'archive_summary.tmp.yaml'),
      [
        'schema: forge-archive-summary/v1',
        'version: 1.0.0',
        'archived_at: 2026-05-12T16:45:00Z',
        'change_id: add-x',
        'verify_passed:',
        '  verified_invariants: [hash-match, evidence-complete]',
        'review_passed:',
        '  reviewers: [ai-agent]',
        'process_evidence_summary:',
        '  placeholder: true',
        '  note: placeholder',
        'handoff_to_backlog: []',
        'acked_warnings: []',
        'pending_suggestions: []',
        '',
      ].join('\n'),
      'utf8',
    );
  }
  if (opts.withFinal) {
    writeFileSync(
      join(archiveDir, 'archive_summary.yaml'),
      [
        'schema: forge-archive-summary/v1',
        'version: 1.0.0',
        'archived_at: 2026-05-12T16:45:00Z',
        'change_id: add-x',
        'verify_passed:',
        '  verified_invariants: [hash-match]',
        'review_passed:',
        '  reviewers: [ai-agent]',
        'process_evidence_summary:',
        '  placeholder: true',
        'handoff_to_backlog: []',
        'acked_warnings: []',
        'pending_suggestions: []',
        '',
      ].join('\n'),
      'utf8',
    );
  }
  return {
    tmpRoot,
    archiveId,
    cleanup: () => rmSync(tmpRoot, { recursive: true, force: true }),
  };
}

function runResume(tmpRoot: string, archiveId: string): { code: number; stderr: string; stdout: string } {
  const res = spawnSync('node', [FORGE_CLI, 'archive', '--resume-summary', archiveId], {
    cwd: tmpRoot,
    encoding: 'utf8',
  });
  return { code: res.status ?? -1, stderr: res.stderr, stdout: res.stdout };
}

describe('forge archive --resume-summary', () => {
  it('场景 1:有 .tmp 无正式 + .tmp 内容合法 → rename 成功(exit 0)', () => {
    const ctx = setupArchivedChange({ withTmp: true, withFinal: false });
    try {
      const r = runResume(ctx.tmpRoot, ctx.archiveId);
      expect(r.code).toBe(0);
      const archiveDir = join(ctx.tmpRoot, 'forge', 'changes', 'archive', ctx.archiveId);
      expect(existsSync(join(archiveDir, 'archive_summary.yaml'))).toBe(true);
      expect(existsSync(join(archiveDir, 'archive_summary.tmp.yaml'))).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  it('场景 2:有 .tmp 与正式 .yaml 都存在 → 拒签(exit 1,conflict)', () => {
    const ctx = setupArchivedChange({ withTmp: true, withFinal: true });
    try {
      const r = runResume(ctx.tmpRoot, ctx.archiveId);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/两个 archive_summary 都存在|conflict|拒签/);
    } finally {
      ctx.cleanup();
    }
  });

  it('场景 3:无 .tmp 也无正式 → 报错(exit 1,missing)', () => {
    const ctx = setupArchivedChange({ withTmp: false, withFinal: false });
    try {
      const r = runResume(ctx.tmpRoot, ctx.archiveId);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/找不到|missing|不存在/);
    } finally {
      ctx.cleanup();
    }
  });

  // v2 BLOCKER 5 新增:.tmp 内容损坏 → exit 3(corrupt,沿 master §3.12.3)
  it('场景 4:有 .tmp 无正式 + .tmp schema 损坏 → 拒签(exit 3,corrupt schema)', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-resume-corrupt-'));
    const archiveId = '2026-05-12-add-x';
    const archiveDir = join(tmpRoot, 'forge', 'changes', 'archive', archiveId);
    mkdirSync(archiveDir, { recursive: true });
    mkdirSync(join(tmpRoot, 'forge', '.cache'), { recursive: true });
    writeFileSync(
      join(tmpRoot, 'forge', 'config.yaml'),
      'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
      'utf8',
    );
    // 写入损坏 .tmp(schema 字段错)
    writeFileSync(
      join(archiveDir, 'archive_summary.tmp.yaml'),
      'schema: not-archive-summary\nversion: 1.0.0\n',
      'utf8',
    );
    try {
      const r = runResume(tmpRoot, archiveId);
      // v2 BLOCKER 5:corrupt → exit 3
      expect(r.code).toBe(3);
      expect(r.stderr).toMatch(/corrupt|schema|损坏|校验失败/);
      // .tmp 未被升级为正式名(校验失败拒签)
      expect(existsSync(join(archiveDir, 'archive_summary.yaml'))).toBe(false);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  // v3 MINOR 1 新增:纯 YAML 语法错(parse 失败)→ exit 3
  it('场景 5:有 .tmp 无正式 + .tmp YAML 语法错(parse 失败)→ 拒签(exit 3,corrupt parse)', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-resume-parse-'));
    const archiveId = '2026-05-12-add-x';
    const archiveDir = join(tmpRoot, 'forge', 'changes', 'archive', archiveId);
    mkdirSync(archiveDir, { recursive: true });
    mkdirSync(join(tmpRoot, 'forge', '.cache'), { recursive: true });
    writeFileSync(
      join(tmpRoot, 'forge', 'config.yaml'),
      'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
      'utf8',
    );
    // 写入纯 YAML 语法错(@@@@@ 是 YAML 不合法字符开头 + 无 indent / 无字段)
    writeFileSync(
      join(archiveDir, 'archive_summary.tmp.yaml'),
      '@@@@@ corrupt yaml @@@@@\n  not: valid: yaml: structure\n',
      'utf8',
    );
    try {
      const r = runResume(tmpRoot, archiveId);
      expect(r.code).toBe(3);
      expect(r.stderr).toMatch(/parse|corrupt|YAML/i);
      expect(existsSync(join(archiveDir, 'archive_summary.yaml'))).toBe(false);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 1.2: 创建 `tests/core/validate/orphan-tmp.test.ts`**

```typescript
// orphan-tmp.test.ts — plan-9e1 Task 5 单测
// 测试 scanOrphanTmp:active change 目录残留 archive_summary.tmp.yaml → WARNING

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanOrphanTmp } from '../../../src/core/validate/orphan-tmp.js';

describe('scanOrphanTmp', () => {
  it('change 目录无 .tmp → warnings 空', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-orphan-'));
    const changeDir = join(tmpRoot, 'change-x');
    mkdirSync(changeDir, { recursive: true });
    try {
      const result = await scanOrphanTmp(changeDir);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('change 目录有 archive_summary.tmp.yaml → warnings 含一项 + 提示用户决定', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-orphan-'));
    const changeDir = join(tmpRoot, 'change-x');
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(changeDir, 'archive_summary.tmp.yaml'), 'schema: forge-archive-summary/v1\n', 'utf8');
    try {
      const result = await scanOrphanTmp(changeDir);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.message).toMatch(/孤立|orphan|--resume-summary/);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  // v3 MAJOR 3 新增:扫 .yaml(active change 不该有正式名 → rollback 残留信号)
  it('change 目录有 archive_summary.yaml → warnings 含一项 + 提示 rollback 残留', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-orphan-'));
    const changeDir = join(tmpRoot, 'change-x');
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(changeDir, 'archive_summary.yaml'), 'schema: forge-archive-summary/v1\n', 'utf8');
    try {
      const result = await scanOrphanTmp(changeDir);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.field).toBe('archive_summary.yaml');
      expect(result.warnings[0]?.message).toMatch(/rollback 残留|active change/);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  // v3 MAJOR 3 新增:同时含两者 → warnings 含两项
  it('change 目录同时含 .tmp + .yaml → warnings 含两项', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-orphan-'));
    const changeDir = join(tmpRoot, 'change-x');
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(changeDir, 'archive_summary.tmp.yaml'), 'schema: x\n', 'utf8');
    writeFileSync(join(changeDir, 'archive_summary.yaml'), 'schema: y\n', 'utf8');
    try {
      const result = await scanOrphanTmp(changeDir);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(2);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 1.3: 跑测试确认全红**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/cli/archive-resume-summary.test.ts tests/core/validate/orphan-tmp.test.ts
```

预期:模块 import 失败 + dist/cli/index.js 未含 --resume-summary 路径 → 全 FAIL/ERROR。

### Step 2: 实现 resume-summary helper

- [ ] **Step 2.1a(v2 BLOCKER 1 + v3 NIT 1): 修改 `src/core/archive/lock.ts:12-20` 扩 LockMode union + 同步 line 99 注释**

```typescript
// src/core/archive/lock.ts:12-20
// v2 BLOCKER 1(plan-9e1 Task 5):LockMode union 加 'resume-summary',让 archive.ts 调用合法
export type LockMode =
  | 'archive'
  | 'recover'
  | 'resume-summary' // plan-9e1 v2 BLOCKER 1 修订
  | 'legacy-bridge-map'
  | 'legacy-bridge-regenerate'
  | 'legacy-bridge-index'
  | 'legacy-bridge-resolve'
  | 'legacy-bridge-sync-check'
  | 'migrate';
```

同步更新 `lock.ts:99-105` `acquireLock` JSDoc 注释(v3 NIT 1):

```typescript
/**
 * 获取 archive 进程锁(`.cache/archive.lock` 专用 wrapper)。
 *
 * 用 O_CREAT|O_EXCL 原子创建 .cache/archive.lock:
 * - 若文件不存在 → 独占创建,写入 {pid, started_at, mode},返回 release 函数
 * - 若文件已存在:
 *   - 检查持有者 pid 是否存活(isPidAlive)
 *   - stale(进程已死) → 删除 lock + 递归重试
 *   - alive → 抛 LockHeldError
 *
 * **使用约定**:本函数仅供 archive / recover / **resume-summary**(plan-9e1 v3 NIT 1 修订)命令使用;
 * legacy-bridge 命令应直接调 `acquireLockByPath(forgeRoot, mode, 'legacy-bridge.lock')`(决策 #23)。
 *
 * @param forgeRoot forge 根目录(含 .cache/ 子目录)
 * @param mode      当前操作模式(LockMode union 支持 legacy-bridge-* 与 'migrate' 是为统一类型;
 *                  实际 callsite 应仅传 'archive' / 'recover' / 'resume-summary';
 *                  legacy-bridge-* 与 'migrate' 走 `acquireLockByPath` 路径)
 * @returns         release 函数(幂等,可多次调用)
 */
```

- [ ] **Step 2.1b: 创建 `src/core/archive/resume-summary.ts`(v2 BLOCKER 5:加内容校验)**

```typescript
// src/core/archive/resume-summary.ts — plan-9e1 Task 5(v2 BLOCKER 5)
// forge archive --resume-summary <archive-id> 子流程实施
// 四场景(v1 三场景 → v2 BLOCKER 5 +1 corrupt 路径):
//   1. archive 目录有 .tmp 无正式 .yaml + .tmp 内容合法 → rename(ok)
//   2. archive 目录有 .tmp 无正式 .yaml + .tmp 内容损坏 → 拒签(corrupt,沿 master §3.12.3 exit 3)
//   3. 都存在 → 拒签(conflict,无法判断 ground truth)
//   4. 都不存在 → 报错(missing,状态损坏 / 无 summary 需要 resume)

import { rename, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { validateArchiveSummarySchema } from '../validate/archive-summary-schema.js';

/** resume-summary 结果 — caller(archive 命令)根据 kind 决定 exit code */
export type ResumeSummaryResult =
  | { kind: 'ok'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'missing'; message: string }
  | { kind: 'corrupt'; message: string }; // v2 BLOCKER 5 新增

/**
 * 处理 archive 目录半完成状态的 .tmp summary
 * @param forgeRoot <project>/forge/ 绝对路径
 * @param archiveId archive 子目录名(`YYYY-MM-DD-<id>`)
 */
export async function resumeArchiveSummary(
  forgeRoot: string,
  archiveId: string,
): Promise<ResumeSummaryResult> {
  const archiveDir = join(forgeRoot, 'changes', 'archive', archiveId);
  const tmpPath = join(archiveDir, 'archive_summary.tmp.yaml');
  const finalPath = join(archiveDir, 'archive_summary.yaml');

  const hasTmp = existsSync(tmpPath);
  const hasFinal = existsSync(finalPath);

  if (hasTmp && !hasFinal) {
    // v2 BLOCKER 5:rename 前 readFile + parseYaml + schema 校验
    let parsed: unknown;
    try {
      const content = await readFile(tmpPath, 'utf8');
      parsed = parseYaml(content);
    } catch (err) {
      return {
        kind: 'corrupt',
        message: `✗ archive_summary.tmp.yaml YAML 解析失败(${tmpPath}):${(err as Error).message}`,
      };
    }
    const schemaResult = validateArchiveSummarySchema(parsed, tmpPath);
    if (!schemaResult.valid) {
      const errMessages = schemaResult.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      return {
        kind: 'corrupt',
        message: `✗ archive_summary.tmp.yaml schema 校验失败(${tmpPath}):${errMessages}`,
      };
    }
    // 场景 1:校验通过 → 正常 rename
    await rename(tmpPath, finalPath);
    return {
      kind: 'ok',
      message: `✓ archive_summary.tmp.yaml → archive_summary.yaml (${archiveDir})`,
    };
  }
  if (hasTmp && hasFinal) {
    // 场景 3:冲突,无法判断 ground truth
    return {
      kind: 'conflict',
      message:
        `✗ 两个 archive_summary 都存在(${archiveDir}/archive_summary.{tmp.,}yaml),无法判断哪个是 ground truth — 用户需手动检查后删一个再重跑(沿 design §2.4.5 .tmp 生命周期表)`,
    };
  }
  // 场景 4:都不存在
  return {
    kind: 'missing',
    message:
      `✗ 找不到 archive_summary.{tmp.,}yaml(${archiveDir});该 archive 可能从未生成 summary(v0.4 老归档),或目录损坏`,
  };
}
```

- [ ] **Step 2.2: 创建 `src/core/validate/orphan-tmp.ts`(v3 MAJOR 3 修订:同时扫 .tmp + .yaml)**

```typescript
// src/core/validate/orphan-tmp.ts — plan-9e1 Task 5
// scanOrphanTmp:检测 active change 目录残留 archive_summary.tmp.yaml 或 archive_summary.yaml → WARNING
//
// v3 MAJOR 3 修订:同时扫两个文件名 — active change 目录正常情况下都不应有 archive_summary.*
// 因为 archive 成功 → source 已 Move 到 archive 目录(整个 change 不再存在);
// archive 失败 → 回滚链 unlink(v2 MAJOR 1)
// 故 active change 目录中任何 archive_summary.* 都是"rollback 残留 / 手动复制 / 异常 crash"信号

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type ValidationResult, ok, type ValidationWarning } from './types.js';

/**
 * 扫描 change 目录是否含孤立 archive_summary.tmp.yaml 或 archive_summary.yaml
 *
 * 设计语义(v3 MAJOR 3 修订):active change 目录正常不该有 summary 文件:
 *   - archive 成功 → change 目录被 Move 到 archive 目录(active 不存在)
 *   - archive 失败 → 回滚链 unlink summary(沿 v2 MAJOR 1)
 *   - 残留 = "rollback 残留(unlink 失败极罕见)/ 用户手动复制 / 异常 crash"信号
 *
 * 沿 design §2.4.5 line 759"孤立 .tmp"行,扩展为 .tmp + .yaml 两者
 */
export async function scanOrphanTmp(changeDir: string): Promise<ValidationResult> {
  const warnings: ValidationWarning[] = [];
  const candidates = [
    {
      name: 'archive_summary.tmp.yaml',
      hint:
        `若该 change 已 archive 过,跑 'forge archive --resume-summary <YYYY-MM-DD-id>' 或手动 rm 清理;` +
        `若 archive 仍在进行,等待 archive 完成`,
    },
    {
      name: 'archive_summary.yaml',
      hint:
        `active change 目录不该有正式 archive_summary.yaml(应只在 archive 目录);` +
        `若该 change 已 archive 过,该文件可能是上一次 archive 回滚残留(rollback unlink 失败);` +
        `手动 rm 后重试 archive`,
    },
  ];
  for (const c of candidates) {
    const p = join(changeDir, c.name);
    if (!existsSync(p)) continue;
    warnings.push({
      artifact: 'change',
      field: c.name,
      message: `孤立 ${c.name}(active change 目录残留 ${p});${c.hint}`,
      file: p,
    });
  }
  return ok(warnings);
}
```

- [ ] **Step 2.3: 修改 `src/core/validate/change.ts:178-192` 在 test_failure_stub 之后追加 scanOrphanTmp 调用**

在 `const testStub = await checkTestFailureStub();` 块之后追加:

```typescript
  // plan-9e1 Task 5:扫描孤立 archive_summary.tmp.yaml(active change 目录残留)
  // 沿 design §2.4.5 line 759 "孤立 .tmp" 行,给 WARNING + 提示
  const orphanResult = await scanOrphanTmp(changeDir);
  if (orphanResult.warnings.length > 0) {
    results.push(orphanResult);
  }
```

同时在文件顶部 `import` 块追加(line ~18 附近):

```typescript
// plan-9e1 Task 5:scanOrphanTmp 检测孤立 archive_summary.tmp.yaml
import { scanOrphanTmp } from './orphan-tmp.js';
```

- [ ] **Step 2.4: 修改 `src/cli/commands/archive.ts` 加 `--resume-summary` flag 路径**

在 line 78 `.option(...)` 链中追加 `--resume-summary` 选项(`--recover` 之后):

```typescript
    .option('--resume-summary <archiveId>', 'resume rename archive_summary.tmp.yaml → archive_summary.yaml (rare half-completed state, plan-9e1)')
```

在 `.action(...)` 函数体顶部(line ~88,在 `forgeRoot` 定义之后,`--recover` 路径之前)插入新分支:

```typescript
        const forgeRoot = join(process.cwd(), 'forge');

        // —— plan-9e1 Task 5:--resume-summary 独立路径(v2 BLOCKER 1 + 5 修订)——
        if (opts.resumeSummary) {
          let release: (() => Promise<void>) | undefined;
          try {
            release = await acquireLock(forgeRoot, 'resume-summary');
            const r = await resumeArchiveSummary(forgeRoot, opts.resumeSummary);
            if (r.kind === 'ok') {
              console.log(r.message);
              const rel = release;
              release = undefined;
              if (rel) await rel();
              process.exit(0);
            }
            // v2 BLOCKER 5:corrupt → exit 3(沿 master §3.12.3 corrupt 档)
            if (r.kind === 'corrupt') {
              console.error(r.message);
              const rel = release;
              release = undefined;
              if (rel) await rel();
              process.exit(3);
            }
            // conflict / missing 都是 business-fail → exit 1
            console.error(r.message);
            const rel = release;
            release = undefined;
            if (rel) await rel();
            process.exit(1);
          } catch (err) {
            if (err instanceof LockHeldError) {
              // v2 BLOCKER 1:lock-held → exit 2(对齐 master §3.12.3 freeze;v0.4 --recover exit 5 是遗留)
              console.error(err.message);
              process.exit(2);
            }
            throw err;
          } finally {
            if (release) await release();
          }
        }
```

并在 `opts` 类型参数列表(line ~81-86)加 `resumeSummary?: string;`:

```typescript
        opts: {
          force?: boolean;
          recover?: boolean;
          resumeSummary?: string; // plan-9e1 Task 5
          enableCrossCuttingFence?: boolean;
          allowStubFence?: boolean;
        },
```

在 imports 区(line ~43 之后)追加:

```typescript
// plan-9e1 Task 5:resume-summary 子模式
import { resumeArchiveSummary } from '../../core/archive/resume-summary.js';
```

- [ ] **Step 2.5: build + 跑测试**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm build && pnpm test tests/cli/archive-resume-summary.test.ts tests/core/validate/orphan-tmp.test.ts
```

预期:5 PASS(3 resume + 2 orphan)。注意 archive-resume-summary 走 spawn 跑 dist 二进制,必须先 build。

- [ ] **Step 2.6: 跑现有 validate 测试确保未回归**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm test tests/cli/validate.test.ts tests/cli/validate-verify-findings.test.ts
```

预期:全 PASS(原 case 不含 archive_summary.tmp.yaml,scanOrphanTmp 不产 warning)。

### Step 3: Typecheck + format + commit

- [ ] **Step 3.1: 全本地 verify**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

预期:全过。

- [ ] **Step 3.2: commit Task 5**

```bash
git -C D:/ClaudeProject/opsp/forge-repo add src/core/archive/resume-summary.ts src/core/validate/orphan-tmp.ts src/core/validate/change.ts src/cli/commands/archive.ts tests/cli/archive-resume-summary.test.ts tests/core/validate/orphan-tmp.test.ts
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9e1 Task 5): --resume-summary 子命令 + validate 孤立 .tmp 扫描 + 5 case 单测

- resume-summary.ts:三场景(ok / conflict / missing)沿 design §2.4.5 .tmp 生命周期表
- orphan-tmp.ts:active change 目录残留 .tmp → WARNING + 提示 --resume-summary
- archive.ts:加 --resume-summary <archive-id> flag + 独立锁 + exit code 映射

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

预期:commit 成功。

---

## 7. Task 6 — commands/archive.md + e2e 7 fixture + 全本地 verify(v3 MAJOR 2 / v4 文本一致性)

**Files**:
- Modify: `commands/archive.md`
- Create: `tests/integration/archive-summary-end-to-end.test.ts`
- Create: `tests/fixtures/archive-warnings/{acked-warning,pending-suggestion,pause-out-of-scope,mixed-all-three,warning-missing-ack-double-fence,review-outcomes-c-rejected}/`(v2 MAJOR 3:critical-rejected 改名 + 新增 review-outcomes-c-rejected)

**v2 MAJOR 3 修订 — e2e fixture 必须证明 9e1 fence 真接入**:
- v1 `critical-rejected` fixture 走 WARNING 缺 ack → 9d verify-findings-fence step 3.6 已拒签,9e1 三级 fence step 3.9 永远不触达 — 不能证明 9e1 接入
- v2 修订:
  - 原 `critical-rejected` 改名 **`warning-missing-ack-double-fence`**(语义清晰为"双 fence 兜底测试" — 验证 9d + 9e1 fence 都生效;断言 fence 拒签即可,不区分谁先)
  - **新增 `review-outcomes-c-rejected`**:纯 `review_outcomes[i].severity='C'`,无 verify_findings(9d 跳过),9e1 三级 fence 必须拦 — **唯一能证明 9e1 fence 真接入的 fixture**

### Step 1: 更新 commands/archive.md

- [ ] **Step 1.1: 编辑 `commands/archive.md` — 在 "## CLI 行为说明" 之后插入"v1.0 三级分级行为"段**

定位:`commands/archive.md:18` "## CLI 行为说明" 之前。

在 line 17 (`(plugin helper ...)` 段)之后追加:

```markdown
## v1.0 三级分级行为(plan-9e1 落地)

archive 阶段在 verify+review marker 严格校验之外,再叠加"三级业务行为"裁决(沿 design §2.4.2):

| 状态 | archive 行为 |
|---|---|
| 全 resolved=true | 通过 |
| CRITICAL resolved=false | **拒签**(无 ack 出口,exit 1) |
| WARNING resolved=false + `severity_acked_by` 非空 + ack-log 匹配 | 通过(标 acked-warning archive,handoff 列入 `acked_warnings`) |
| WARNING resolved=false + `severity_acked_by` 空 | **拒签**(exit 1) |
| SUGGESTION resolved=false(无论 ack 与否) | **通过**(标 pending-suggestion archive,handoff to backlog) |

**强 fence 优势保留**:CRITICAL 永远拒签,无 `--force` 出口(`--force` 仍只覆盖 v0.4 那两类降级 — human-override / 非 git;不扩展到 CRITICAL,沿 design §2.4.6)。

`review_outcomes` 端简码 S/C/L 迁移规则(v4 BLOCKER 1 + MAJOR 1 修订,沿 design §2.3.5 line 553-563):

| v0.4 简码 | v1.0 映射 | archive 行为 |
|---|---|---|
| `S`(critical) | `CRITICAL` 直接映射 | `S + resolved=false` 拒签;`S + resolved=true` 通过 |
| `L`(low) | `SUGGESTION` 直接映射 | `L + resolved=false` 通过(进 pending_suggestions);`L + resolved=true` 通过 |
| `C`(clarification) | **不自动映射** | **任何状态**(resolved/accepted/rationale)**全拒签**;必须等 plan-9j 完成跑 `forge upgrade --resign-markers` 迁移 |

**重要**:`review_outcomes` 端不存在"`accepted=true + rationale 非空` 等价 ack"路径(v2 文档错误,v4 MAJOR 1 修订删除)— ReviewOutcome 接口本身无 `severity_acked_by` 字段;WARNING ack 必须经 verify_findings 端 CLI ack-log 协议(沿 design §2.3.3)。

## archive_summary 输出(plan-9e1 落地)

archive 成功后,**新增产物**:`forge/changes/archive/YYYY-MM-DD-<id>/archive_summary.yaml`(给 v1.1 backlog index 入参)。

完整 schema 见 [`src/core/schemas/archive-summary.ts`](../src/core/schemas/archive-summary.ts);9 顶级字段:
- `schema` literal `forge-archive-summary/v1`
- `version` semver
- `archived_at` ISO 8601 UTC
- `change_id` 字符串
- `verify_passed` / `review_passed` 摘要
- `process_evidence_summary`(9e1 placeholder,9e2 接 9g 真实统计)
- `handoff_to_backlog` 三类聚合(SUGGESTION 持挂 + pause_decisions chosen_option=3 + scope-entries active)
- `acked_warnings`(WARNING + ack 的引用,给用户回顾)
- `pending_suggestions`(SUGGESTION + resolved=false 引用,handoff 子集)

archive 成功后 stdout 渲染段(沿 design §2.4.4 模板):

```
## Archive Complete

**Change:** <change-id>
**Archived to:** forge/changes/archive/<archive-id>/
**Specs:** ✓ Synced
**Security:** [process_evidence:placeholder] ... (9e2 完成后改为真实统计)

### Acknowledged Warnings (N)
- [WARNING] verify_findings#<id> (<dimension>/<check_type>)
  Evidence: ...
  Acked by: <user> at <iso>
  Rationale: ...

### Pending Suggestions (M) — handed off to backlog
- [SUGGESTION] verify_findings#<id> (<dimension>/<check_type>)
  Source: ...
  Recommendation: ...

Review handoff details: cat forge/changes/archive/<archive-id>/archive_summary.yaml
v1.1+: run `forge backlog list` to query across changes
```

## --resume-summary 用法(plan-9e1 落地,罕见状态)

设计语义:archive 流程"Move 完成 + 在 archive 目录把 `.tmp` rename 为正式名时失败"是极罕见状态(同目录 rename 几乎不会失败)。若发生:

```bash
forge archive --resume-summary 2026-05-12-add-x
```

行为:
- archive 目录有 `.tmp` 无正式 `.yaml` → rename(exit 0)
- 两者都存在(冲突,无法判断 ground truth)→ 拒签 exit 1(用户手动检查后删一个再重跑)
- 两者都不存在 → 报错 exit 1(状态损坏 / 该 archive 从未生成 summary)

`forge validate <change-id>` 会扫描 active change 目录是否残留孤立 `archive_summary.tmp.yaml`,残留时给 WARNING 提示走 `--resume-summary` 或手动 `rm`。

```

- [ ] **Step 1.2: 编辑 `commands/archive.md` — 替换 "## 步骤" 之后的 "## CLI 行为说明" 章节扩展两条新规则**

定位:`commands/archive.md:18-34` "## CLI 行为说明" 章节。修改 line 26-32 的 `--force` 接受/不覆盖列表,加 WARNING/SUGGESTION/CRITICAL 三级新行(明确告知 AI 这是不变量):

替换 line 26-32 区段:

```markdown
3. **`--force` 接受这两类降级**:
   - `verified_by`/`reviewed_by` = `human-override`
   - `is_git_repo: false`(非 git 项目)跳过 git 字段
4. **`--force` 不覆盖**(任一不一致 archive 拒绝):
   - tasks_hash/content_hash 不一致(标记过期或被篡改)
   - evidence log 文件缺失 / log_hash 不匹配 / pass ≠ true
   - review_outcomes 中 accepted=true 但 resolved=false
   - **CRITICAL finding 未 resolve**(三级 fence 强不变量,无 ack 出口;沿 plan-9e1 §三级行为表)
   - **WARNING finding 未 resolve 且缺 ack**(用户必须显式 ack `severity_acked_by`)
5. **archive 顺序原子化**(沿 design §2.4.5 + spec §3.5):
   - Move 前先写 `archive_summary.tmp.yaml` 到 source 目录
   - Move(rename change → archive)
   - rename `.tmp` → 正式 `archive_summary.yaml`
   - Backup specs/
   - Sync specs/
   - 任一阶段失败按 §2.4.5 表回滚
6. **`--recover` 子模式**:扫描半归档状态(case A/B/C)并修复(沿 v0.4)
7. **`--resume-summary <archive-id>` 子模式**(plan-9e1):处理 archive 目录半完成 `.tmp` rename(rename ok / 双份冲突拒签 / 状态损坏报错)
```

- [ ] **Step 1.3: 编辑 `commands/archive.md` — 在文件末尾追加 "## 与其他 sub-plan 合并点" 段**

在文件末尾(line ~45 `## AI 后续行为` 段之后)追加:

```markdown

## 与其他 sub-plan 合并点(参考 master plan §3.5)

本文件由多个 sub-plan 共同维护:
- **9e1**(本文件落地):三级分级行为表 + archive_summary 输出格式 + --resume-summary 用法
- **9e2**(待 9g 完成后):把 `process_evidence_summary` 字段从 placeholder 接 9g 实施的 13 不变量真实统计
- **9g**(process_evidence):在"archive 顺序原子化"步骤中加入 worktree 重跑 + 结构化 reporter parsing(注:9g 实施时 **不动** 9e1 的 .tmp / rename / 三级 fence 步骤,只在 verify markers 阶段之前插入 worktree 阶段)

merge 顺序推荐:**9e1 → 9g → 9e2**(本顺序保证 archive_summary placeholder 在 9g 真实 13 不变量统计完成后才接,避免 placeholder 与真实统计在中间状态混淆)

## C 简码迁移协议(plan-9e1 v4 BLOCKER 1 修订:9j 完成是硬前置,无 manual 出口)

`review_outcomes[i].severity = 'C'`(v0.4 clarification 简码)在 v1.0 三级体系中**不直接对应**(沿 design §2.3.5 line 559+563);archive 阶段会**硬拒签**,**必须**经 9j 迁移:

- **唯一合规路径** — 等 plan-9j(marker version + deprecation)完成,跑 `forge upgrade --resign-markers` 交互式询问每条 C 的目标 severity(WARNING / SUGGESTION 由用户判断)+ 自动 resign marker 字段 + 写 ack-log.jsonl

**为什么不支持手动编辑 marker**(v4 BLOCKER 1 修订理由):
1. `ReviewOutcome` 接口字面 `severity: 'S' | 'C' | 'L'`,不接受 'WARNING' / 'SUGGESTION' 全名(types.ts:112)
2. marker-schema `REVIEW_OUTCOME_SEVERITY_CODES = ['S','C','L']`,手动改成全名 schema 拒签(marker-schema.ts:336)
3. 即使前两墙绕过,WARNING ack 必须 CLI ack-log 触发(design §1.5.2 反向加固);手动加 `severity_acked_by` 字段违反协议

**9j 未完成时,archive C 简码 marker 是阻塞性硬墙** — 用户必须等 9j 落地。9e1 fence 错误提示会明确这一点。

## exit code 遗留声明(plan-9e1 v3 MAJOR 1 / v5 MINOR 3 修订:口径统一)

`forge archive` 各路径 LockHeldError 的 exit code:

| 路径 | exit code | 说明 |
|---|---|---|
| `forge archive <id>`(主路径) | 5 | v0.4 遗留 — **master §3.12.3 将由 plan-9e1 Task 6 Step 4-pre 加 known limitation 注脚**(实施时落地;plan v7 阶段 master 仍是 freeze 表无注脚);由后续 sub-plan(候选:9z release / 单独 cleanup plan)统一全路径 exit 2 |
| `forge archive --recover` | 5 | 同上 v0.4 遗留 |
| `forge archive --resume-summary <archive-id>`(plan-9e1 新增) | **2** | 对齐 master §3.12.3 freeze |

**v5 口径统一(v10 措辞收干)**:不再说 "9e1 不修留 GH issue 跟进"(原 v3 措辞);改为 reflection **将由 Task 6 Step 4-pre 实施时落到** master plan(沿 v5 选项 C 修订;**实施 plan 阶段** master 仍是 freeze 表无注脚,Task 6 Step 4-pre 实施完成后 master 加 known limitation 注脚)。后续 sub-plan(9z release / cleanup plan)接 master notation 统一全路径 exit 2。
```

### Step 2: 创建 7 fixture(v3 MAJOR 2 + 文本一致性修订)

- [ ] **Step 2.1: 创建 fixture `tests/fixtures/archive-warnings/acked-warning/`**

文件清单:`proposal.md` / `design.md` / `tasks.md` / `specs/x.md` / `.verify-passed` / `.review-passed` / `.evidence/ack-log.jsonl`

`tests/fixtures/archive-warnings/acked-warning/proposal.md`:

```markdown
# Add X

## Why
reason

## What
some change

## Out of Scope {#forge-oos}

```yaml
schema: forge-scope-entries/v1
anchor_id: forge-oos
entries: []
```
```

`tests/fixtures/archive-warnings/acked-warning/design.md`:

```markdown
# Design X
```

`tests/fixtures/archive-warnings/acked-warning/tasks.md`:

```markdown
# Tasks

- [x] t1: implement X
```

`tests/fixtures/archive-warnings/acked-warning/specs/x.md`:

```markdown
# X Spec

## Scenario: X

**Given** y
**When** z
**Then** w
```

`tests/fixtures/archive-warnings/acked-warning/.verify-passed`:

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T16:30:00Z
verified_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
evidence: []
verify_findings:
  - id: 1
    dimension: correctness
    check_type: requirement-mapping
    severity: WARNING
    automated: false
    evidence: "specs/x.md:5"
    recommendation: "add explicit token expiry handling"
    resolved: false
    severity_acked_by: msc
    severity_acked_at: 2026-05-12T16:30:00Z
    finding_hash: placeholder-hash-recompute-needed
    content_hash: sha256:placeholder
    git_head: 0000000000000000000000000000000000000000
```

`tests/fixtures/archive-warnings/acked-warning/.review-passed`:

```yaml
schema: forge-review/v1
reviewed_at: 2026-05-12T16:40:00Z
reviewed_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
git:
  is_git_repo: false
review_outcomes: []
```

`tests/fixtures/archive-warnings/acked-warning/.evidence/ack-log.jsonl`(占位 `<fixture-name>` 会在 e2e setup 时替换):

```
{"schema":"forge-ack-log/v1","kind":"ack","timestamp":"2026-05-12T16:30:00Z","action":"ack-warning","change_id":"<fixture-name>","finding_id":"1","user":"msc","rationale":"spec 描述模糊","git_head":null,"finding_hash":"placeholder-hash-recompute-needed","extra":{}}
```

**注**:`finding_hash` 占位由 e2e setup 重算后 patch(沿 9d verify-findings-end-to-end 同模式)。

- [ ] **Step 2.2: 创建 fixture `tests/fixtures/archive-warnings/pending-suggestion/`**

同 acked-warning 五件套结构,但 `.verify-passed` 改为:

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T16:30:00Z
verified_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
evidence: []
verify_findings:
  - id: 3
    dimension: coherence
    check_type: pattern-consistency
    severity: SUGGESTION
    automated: false
    evidence: "src/x.ts:23"
    recommendation: "consider rename handleX"
    resolved: false
    finding_hash: placeholder-hash-recompute-needed
    content_hash: sha256:placeholder
    git_head: 0000000000000000000000000000000000000000
```

`.evidence/ack-log.jsonl` 留空(SUGGESTION 不需 ack):空文件即可。

- [ ] **Step 2.3: 创建 fixture `tests/fixtures/archive-warnings/pause-out-of-scope/`**

`proposal.md` 需含 forge-oos scope-entries YAML 块,且含 `triggered_by` 反向引用 pause_decisions id=1(沿 9c option=3 fence 要求):

```markdown
# Pause Out of Scope Fixture

## Why
test pause + scope-entry pair

## What
some change

## Out of Scope {#forge-oos}

```yaml
schema: forge-scope-entries/v1
anchor_id: forge-oos
entries:
  - id: oos-refresh-token
    category: out-of-scope
    description: OAuth refresh token 过期处理
    reason: 本 change 仅含 access token issue/verify;refresh 留 follow-up
    priority: null
    status: active
    triggered_by:
      source: pause_decisions
      id: 1
    related_change: null
```
```

`.verify-passed`:

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T16:30:00Z
verified_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
evidence: []
pause_decisions:
  - id: 1
    paused_at: 2026-05-12T14:30:00Z
    task_ref: tasks.md#t1
    issue_summary: "OAuth refresh token 过期"
    severity: WARNING
    severity_acked_by: msc
    severity_acked_at: 2026-05-12T14:32:00Z
    chosen_option: 3
    target_artifact: proposal.md
    target_anchor: "## Out of Scope"
    non_blocking_rationale: "subagent 可跳过该 issue 完成 task 主体"
    other_rationale: null
    other_acked_by: null
```

`.evidence/ack-log.jsonl`(pause_decisions WARNING ack 需匹配条目):

```
{"schema":"forge-ack-log/v1","kind":"ack","timestamp":"2026-05-12T14:32:00Z","action":"ack-pause-warning","change_id":"<fixture-name>","finding_id":"pause_decisions:1","user":"msc","rationale":"see out-of-scope entry","git_head":null,"finding_hash":null,"extra":{}}
```

- [ ] **Step 2.4: 创建 fixture `tests/fixtures/archive-warnings/mixed-all-three/`**

合并三类:`verify_findings` 含一项 WARNING+ack + 一项 SUGGESTION;`pause_decisions` 含 option=3 + scope-entries 含对应 triggered_by entry。e2e 跑成功 + 输出含 acked_warnings (1) + pending_suggestions (1) + handoff_to_backlog (3)。

`.verify-passed`:

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T16:30:00Z
verified_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
evidence: []
verify_findings:
  - id: 1
    dimension: correctness
    check_type: x
    severity: WARNING
    automated: false
    evidence: "specs/x.md:5"
    recommendation: "r1"
    resolved: false
    severity_acked_by: msc
    severity_acked_at: 2026-05-12T16:30:00Z
    finding_hash: placeholder-hash-1
    content_hash: sha256:placeholder
    git_head: 0000000000000000000000000000000000000000
  - id: 2
    dimension: coherence
    check_type: y
    severity: SUGGESTION
    automated: false
    evidence: "src/y.ts:10"
    recommendation: "r2"
    resolved: false
    finding_hash: placeholder-hash-2
    content_hash: sha256:placeholder
    git_head: 0000000000000000000000000000000000000000
pause_decisions:
  - id: 1
    paused_at: 2026-05-12T14:30:00Z
    task_ref: tasks.md#t1
    issue_summary: "issue summary"
    severity: WARNING
    severity_acked_by: msc
    severity_acked_at: 2026-05-12T14:32:00Z
    chosen_option: 3
    target_artifact: proposal.md
    target_anchor: "## Out of Scope"
    non_blocking_rationale: "rationale"
    other_rationale: null
    other_acked_by: null
```

`proposal.md` 与 pause-out-of-scope fixture 同结构,scope-entries 含 triggered_by id=1 的 entry。

`.evidence/ack-log.jsonl` 含两条:WARNING finding id=1 的 ack-warning + pause_decisions id=1 的 ack-pause-warning。

- [ ] **Step 2.5: 创建 fixture `tests/fixtures/archive-warnings/warning-missing-ack-double-fence/`(v2 MAJOR 3:从 critical-rejected 改名)**

`.verify-passed` 含 WARNING+resolved=false+ **缺 ack** 项(应被 9d verify-findings-fence step 3.6 拒签;9e1 三级 fence verify 端已瘦成 CRITICAL sanity 不再处理 WARNING — 本 fixture 验证 9d fence 落地):

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T16:30:00Z
verified_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
evidence: []
verify_findings:
  - id: 1
    dimension: correctness
    check_type: x
    severity: WARNING
    automated: false
    evidence: "specs/x.md:5"
    recommendation: "needs fix"
    resolved: false
    finding_hash: placeholder-hash
    content_hash: sha256:placeholder
    git_head: 0000000000000000000000000000000000000000
```

注意:**v2 MAJOR 3 修订** — 此 fixture 验证 9d verify-findings-fence step 3.6 拒签(9e1 三级 fence verify 端已瘦成 CRITICAL sanity 不再处理 WARNING);**真正能独立证明 9e1 fence 接入的 fixture 是下面 Step 2.6 新增的 `review-outcomes-c-rejected`**。

- [ ] **Step 2.6(v2 MAJOR 3 新增): 创建 fixture `tests/fixtures/archive-warnings/review-outcomes-c-rejected/`**

唯一能独立证明 9e1 三级 fence 真接入的 fixture:`.review-passed` 含 `review_outcomes[i].severity='C'`,**无** verify_findings(9d verify-findings-fence 跳过 — verify_findings 字段缺等价 [],没有 finding 进 fence),9e1 三级 fence 必须拦 C 简码并提示 forge upgrade --resign-markers。

`tests/fixtures/archive-warnings/review-outcomes-c-rejected/proposal.md`:

```markdown
# Review Outcomes C Rejected Fixture

## Why
test 9e1 three-level fence review_outcomes C 拒签路径

## What
some change

## Out of Scope {#forge-oos}

```yaml
schema: forge-scope-entries/v1
anchor_id: forge-oos
entries: []
```
```

`tests/fixtures/archive-warnings/review-outcomes-c-rejected/design.md`:

```markdown
# Design
```

`tests/fixtures/archive-warnings/review-outcomes-c-rejected/tasks.md`:

```markdown
# Tasks

- [x] t1: implement
```

`tests/fixtures/archive-warnings/review-outcomes-c-rejected/specs/x.md`:

```markdown
# X Spec

## Scenario: X

**Given** y
**When** z
**Then** w
```

`tests/fixtures/archive-warnings/review-outcomes-c-rejected/.verify-passed`(无 verify_findings,9d fence 跳过):

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T16:30:00Z
verified_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
evidence: []
```

`tests/fixtures/archive-warnings/review-outcomes-c-rejected/.review-passed`(含 C 简码 + resolved=false):

```yaml
schema: forge-review/v1
reviewed_at: 2026-05-12T16:40:00Z
reviewed_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
git:
  is_git_repo: false
review_outcomes:
  - severity: C
    accepted: true
    resolved: false
    rationale: "clarification on edge case needed"
    task_ref: t1
```

`tests/fixtures/archive-warnings/review-outcomes-c-rejected/.evidence/ack-log.jsonl`:空文件(C 简码不需 ack,且 9e1 fence 应在 ack-log 检查之前拒签)。

- [ ] **Step 2.7(v3 MAJOR 2 新增): 创建 fixture `tests/fixtures/archive-warnings/scope-entries-yaml-corrupt/`**

唯一能独立证明 `ScopeEntriesIntegrityError` 路径接入的 fixture:`proposal.md` 含 forge-oos 段但 YAML 语法错;**无** pause_decisions option=3(避免被 9c pause-decisions-fence 拦);**无** verify_findings(9d 跳过);三级 fence 应通过,但 builder 在 step 4.5 抛 `ScopeEntriesIntegrityError` → archive.ts try/catch 转 exit 1。

`tests/fixtures/archive-warnings/scope-entries-yaml-corrupt/proposal.md`:

```markdown
# Scope Entries YAML Corrupt Fixture

## Why
test 9e1 ScopeEntriesIntegrityError 独立检测路径

## What
some change

## Out of Scope {#forge-oos}

```yaml
schema: forge-scope-entries/v1
@@@@@@@ corrupt yaml syntax
entries: not-valid
```
```

`tests/fixtures/archive-warnings/scope-entries-yaml-corrupt/design.md`:

```markdown
# Design
```

`tests/fixtures/archive-warnings/scope-entries-yaml-corrupt/tasks.md`:

```markdown
# Tasks

- [x] t1: implement
```

`tests/fixtures/archive-warnings/scope-entries-yaml-corrupt/specs/x.md`:

```markdown
# X Spec

## Scenario: X

**Given** y
**When** z
**Then** w
```

`tests/fixtures/archive-warnings/scope-entries-yaml-corrupt/.verify-passed`(无 verify_findings + 无 pause_decisions,9d/9c fence 跳过):

```yaml
schema: forge-verify/v1
verified_at: 2026-05-12T16:30:00Z
verified_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
evidence: []
```

`tests/fixtures/archive-warnings/scope-entries-yaml-corrupt/.review-passed`(无 review_outcomes,9e1 three-level-fence 通过):

```yaml
schema: forge-review/v1
reviewed_at: 2026-05-12T16:40:00Z
reviewed_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
git:
  is_git_repo: false
review_outcomes: []
```

`tests/fixtures/archive-warnings/scope-entries-yaml-corrupt/.evidence/ack-log.jsonl`:空文件。

### Step 3: 创建 e2e 集成测试

- [ ] **Step 3.1: 创建 `tests/integration/archive-summary-end-to-end.test.ts`**

```typescript
// archive-summary-end-to-end.test.ts — plan-9e1 Task 6 e2e
// 沿 pause-decisions-end-to-end.test.ts 同模式
// 7 fixture × tmpdir 复制 × 算 hash + 替占位 × spawn forge archive × 断言 exit + archive_summary.yaml(v3 MAJOR 2)

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  cpSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { computeTasksHash, computeContentHash } from '../../src/core/hash/index.js';
import { computeFindingHash, extractHashPayload } from '../../src/core/validate/finding-hash.js';

const FIXTURES_DIR = resolve(process.cwd(), 'tests/fixtures/archive-warnings');
const FORGE_CLI = resolve(process.cwd(), 'dist/cli/index.js');

async function setupFixture(
  fixtureName: string,
): Promise<{ tmpRoot: string; changeId: string; archiveDate: string }> {
  const tmpRoot = mkdtempSync(join(tmpdir(), `forge-9e1-${fixtureName}-`));
  const changeId = fixtureName;
  const changeDir = join(tmpRoot, 'forge', 'changes', changeId);
  cpSync(join(FIXTURES_DIR, fixtureName), changeDir, { recursive: true });

  // 算 hash
  const tasksContent = readFileSync(join(changeDir, 'tasks.md'), 'utf8');
  const tasksHash = computeTasksHash(tasksContent);
  const contentHash = await computeContentHash(changeDir);

  // 改两个 marker 的 hash 字段 + 重算 finding_hash 占位
  for (const markerName of ['.verify-passed', '.review-passed']) {
    const markerPath = join(changeDir, markerName);
    if (!existsSync(markerPath)) continue;
    const marker = parseYaml(readFileSync(markerPath, 'utf8')) as Record<string, unknown>;
    marker.tasks_hash = tasksHash;
    marker.content_hash = contentHash;
    // 若有 verify_findings → 重算 finding_hash + content_hash + git_head 字段
    if (Array.isArray(marker.verify_findings)) {
      const findings = marker.verify_findings as Array<Record<string, unknown>>;
      for (const f of findings) {
        f.content_hash = contentHash;
        f.git_head = '0'.repeat(40); // 沿 fixture 字面 — 非 git 项目
        const expectedHash = computeFindingHash(extractHashPayload(f as never));
        f.finding_hash = expectedHash;
      }
    }
    writeFileSync(markerPath, stringifyYaml(marker));
  }

  // 替换 ack-log 占位
  const ackLogPath = join(changeDir, '.evidence', 'ack-log.jsonl');
  if (existsSync(ackLogPath)) {
    let ackText = readFileSync(ackLogPath, 'utf8');
    ackText = ackText.replace(/<fixture-name>/g, fixtureName);
    // 替换 ack-log finding_hash 占位为重算值(对应 verify_findings id=1 的 finding_hash)
    const verifyPath = join(changeDir, '.verify-passed');
    if (existsSync(verifyPath)) {
      const verifyMarker = parseYaml(readFileSync(verifyPath, 'utf8')) as Record<string, unknown>;
      const findings = (verifyMarker.verify_findings as Array<Record<string, unknown>>) ?? [];
      const f1 = findings.find((f) => f.id === 1);
      if (f1 && typeof f1.finding_hash === 'string') {
        ackText = ackText.replace(/placeholder-hash[-\w]*/g, f1.finding_hash);
      }
    }
    writeFileSync(ackLogPath, ackText);
  }

  return { tmpRoot, changeId, archiveDate: new Date().toISOString().slice(0, 10) };
}

function runArchive(tmpRoot: string, changeId: string): { code: number; stderr: string; stdout: string } {
  const res = spawnSync('node', [FORGE_CLI, 'archive', changeId, '--force'], {
    cwd: tmpRoot,
    encoding: 'utf8',
  });
  return { code: res.status ?? -1, stderr: res.stderr, stdout: res.stdout };
}

describe('archive_summary e2e', () => {
  const cleanupDirs: string[] = [];
  afterAll(() => {
    for (const d of cleanupDirs) rmSync(d, { recursive: true, force: true });
  });

  it('acked-warning → archive 成功 + summary 含 1 acked_warnings', async () => {
    const ctx = await setupFixture('acked-warning');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0);
    const summaryPath = join(
      ctx.tmpRoot,
      'forge',
      'changes',
      'archive',
      `${ctx.archiveDate}-${ctx.changeId}`,
      'archive_summary.yaml',
    );
    expect(existsSync(summaryPath)).toBe(true);
    const summary = parseYaml(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
    expect((summary.acked_warnings as unknown[]).length).toBe(1);
    expect(r.stdout).toMatch(/Acknowledged Warnings \(1\)/);
  });

  it('pending-suggestion → archive 成功 + summary 含 1 pending_suggestions + 1 handoff', async () => {
    const ctx = await setupFixture('pending-suggestion');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0);
    const summaryPath = join(
      ctx.tmpRoot,
      'forge',
      'changes',
      'archive',
      `${ctx.archiveDate}-${ctx.changeId}`,
      'archive_summary.yaml',
    );
    const summary = parseYaml(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
    expect((summary.pending_suggestions as unknown[]).length).toBe(1);
    expect((summary.handoff_to_backlog as unknown[]).length).toBe(1);
  });

  it('pause-out-of-scope → archive 成功 + handoff 含 pause_decisions + scope_entries 各一', async () => {
    const ctx = await setupFixture('pause-out-of-scope');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0);
    const summaryPath = join(
      ctx.tmpRoot,
      'forge',
      'changes',
      'archive',
      `${ctx.archiveDate}-${ctx.changeId}`,
      'archive_summary.yaml',
    );
    const summary = parseYaml(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
    const handoff = summary.handoff_to_backlog as Array<Record<string, unknown>>;
    const bySource = new Set(handoff.map((h) => h.source));
    expect(bySource.has('pause_decisions')).toBe(true);
    expect(bySource.has('scope_entries')).toBe(true);
  });

  it('mixed-all-three → handoff 含三类 source', async () => {
    const ctx = await setupFixture('mixed-all-three');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0);
    const summaryPath = join(
      ctx.tmpRoot,
      'forge',
      'changes',
      'archive',
      `${ctx.archiveDate}-${ctx.changeId}`,
      'archive_summary.yaml',
    );
    const summary = parseYaml(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
    const handoff = summary.handoff_to_backlog as Array<Record<string, unknown>>;
    const bySource = new Set(handoff.map((h) => h.source));
    expect(bySource).toEqual(
      new Set(['verify_findings', 'pause_decisions', 'scope_entries']),
    );
  });

  it('warning-missing-ack-double-fence(WARNING 缺 ack)→ 9d fence 拒签 exit 1(v2 MAJOR 3 改名)', async () => {
    const ctx = await setupFixture('warning-missing-ack-double-fence');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(1);
    // 9d verify-findings-fence step 3.6 已拦,9e1 三级 fence verify 端瘦成 CRITICAL sanity 不重复;断言放宽匹配 9d 错误信息
    expect(r.stderr).toMatch(/verify_findings fence 拒签|WARNING.*缺 ack|severity_acked_by/);
  });

  // v2 MAJOR 3 + v3 BLOCKER 1 + MAJOR 4:唯一能证明 9e1 三级 fence 真接入的 case
  it('review-outcomes-c-rejected(C 简码)→ 9e1 三级 fence 拒签 exit 1 + 提示手动迁移 / 9j', async () => {
    const ctx = await setupFixture('review-outcomes-c-rejected');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(1);
    // 9d 跳过(无 verify_findings),9c pause fence 跳过(无 pause_decisions),9e1 三级 fence 必须拦
    expect(r.stderr).toMatch(/三级业务行为 fence 拒签|clarification|C\(clarification/);
    // v3 MAJOR 4 graceful 9j guidance:9j 完成 / 9j 未完成两路径
    expect(r.stderr).toMatch(/手动|手工|9j|forge upgrade --resign-markers/);
  });

  // v3 MAJOR 2 新增:唯一能证明 ScopeEntriesIntegrityError 独立路径接入的 case
  it('scope-entries-yaml-corrupt(proposal YAML 语法错)→ archive exit 1 + stderr 含 scope-entries 完整性 fence', async () => {
    const ctx = await setupFixture('scope-entries-yaml-corrupt');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(1);
    // 9d/9c/9e1 fence 全跳过(无 verify_findings/pause_decisions/review_outcomes);
    // builder step 4.5 抛 ScopeEntriesIntegrityError → archive.ts try/catch 转 exit 1
    expect(r.stderr).toMatch(/scope-entries 完整性 fence|scope-entries YAML parse|ScopeEntriesIntegrityError/);
  });
});
```

- [ ] **Step 3.2: build + 跑 e2e**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm build && pnpm test tests/integration/archive-summary-end-to-end.test.ts
```

预期:**7 PASS**。**若 warning-missing-ack-double-fence case 失败**:核对 fixture `.verify-passed` 中 finding 是否走 9d verify-findings-fence 的 WARNING+!ack 拒签路径(也会触发 exit 1)— 那不是 9e1 三级 fence,但 effect 相同;stderr 字符串匹配应放宽。**若 scope-entries-yaml-corrupt case 失败**:确认 fixture proposal.md 含 `@@@@@` 等不合法 YAML 字符,而非合法 YAML 仅 anchor_id 错(后者由 anchor_id 不匹配路径触发不同 stderr message)。

### Step 4-pre(v5 MAJOR 2 选项 C): cross-plan 修订 master plan + design

实施 plan-9e1 v5 §11 reflection 段三事项 — 实际修改 master plan + design 文件,让 reflection 落地。

- [ ] **Step 4-pre.1: 修改 master plan `docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` §3.12.3 加 exit code 注脚**

定位:**master §3.12.3** `forge archive` exit code 表格之后。在表格下追加注脚段:

```markdown
**注脚**(plan-9e1 v5 选项 C 修订):
- `forge archive --resume-summary <archive-id>`(plan-9e1 v3 新增子模式):LockHeldError → exit 2(对齐本表 freeze)
- `forge archive` 主路径 + `forge archive --recover`(v0.4 已落):LockHeldError → exit 5(v0.4 遗留,与本表 freeze 冲突)
- **known limitation**:9e1 范围正交 — 改主路径 + `--recover` exit 5 → 2 需重写 `tests/cli/archive.test.ts:517` 等多处断言;由后续 sub-plan(候选:9z release / 单独 cleanup plan)统一全路径 exit 2(沿 plan-9e1 v5 §11.1 reflection 落地)
```

- [ ] **Step 4-pre.2: 修改 master plan §3.12.1bis 字段表上方加 schema literal 注脚**

定位:**master §3.12.1bis** "#### `archive_summary` schema 顶级字段(实现 sub-plan:9e)" 之下、字段表上方。追加:

```markdown
**注脚**(plan-9e1 v5 选项 C 修订):本表列 9 个**业务字段**(version / archived_at / change_id / verify_passed / review_passed / process_evidence_summary / handoff_to_backlog / acked_warnings / pending_suggestions);`schema` literal 字段隐含,沿 forge marker schema 同约定(forge-verify/v1, forge-review/v1, forge-scope-entries/v1, forge-ack-log/v1 都有 schema identifier)— 不算业务字段计数。9e1 落地的 `ArchiveSummary` interface 含 `schema: 'forge-archive-summary/v1'` literal,与本表 9 业务字段不冲突。
```

- [ ] **Step 4-pre.3: 修改 design `docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §2.4.3 字段名**

定位:**design §2.4.3** `archive_summary.yaml` YAML 示例中 `acknowledged_warnings:` 字面行(实施时 grep `acknowledged_warnings` 定位)— 改为 `acked_warnings:`(对齐 master §3.12.1bis `acked_warnings` 字面)。同时在该字段下方加注释:

```yaml
acked_warnings:               # v5 选项 C 修订:统一字段名(原 design 字面 acknowledged_warnings,master §3.12.1bis 后修为 acked_warnings;以 master 为准)
  - source: verify_findings
    ...
```

- [ ] **Step 4-pre.4(v6 MINOR 2 新增): 在 master §6 修订记录加 v3.1 行**

定位:master 文件末尾 §6 修订记录段(目前含 v1/v2/v3 三行)。追加:

```markdown
- **v3.1**(2026-05-12,plan-9e1 v5 选项 C 修订):§3.12.3 加 exit code 注脚(`forge archive --resume-summary` exit 2 + 主路径/`--recover` exit 5 known limitation)+ §3.12.1bis 加 schema literal 注脚(沿 forge marker 同约定);design §2.4.3 字段名 `acknowledged_warnings` → `acked_warnings` 对齐
```

- [ ] **Step 4-pre.5: 跑 grep 验证修订无遗漏**

```bash
cd D:/ClaudeProject/opsp/forge-repo && grep -n "acknowledged_warnings" docs/specs/2026-05-10-v1.0-fusion-completion-design.md docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md
```

预期:**0 matches**(已无 acknowledged_warnings 字面)。

```bash
cd D:/ClaudeProject/opsp/forge-repo && grep -n "v5 选项 C 修订\|v3.1" docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md docs/specs/2026-05-10-v1.0-fusion-completion-design.md
```

预期:**≥4 matches**(三处注脚 / 注释 + master §6 修订记录 v3.1 行)。

- [ ] **Step 4-pre.6(v6 MINOR 1 新增): plan-9e1 内部 line anchor 更新**

由于 master / design 插入注脚,以下绝对 line 号引用会偏移,需更新 plan-9e1 内部引用:
- plan-9e1 自身内文 / Step 4-pre.1/.2/.3 / §11 等位置(v7 已改 anchor 引用,无残留绝对 line)
- v6 修订:将所有 `master:NNN` / `design:NNN` 形式的绝对 line 引用改为 section anchor 引用(`master §3.12.3` / `design §2.4.3`),减少对 line 偏移的依赖。**新增 plan-9e1 不再用绝对 line 锚定,沿 section anchor 编排**(沿 plan-9c v6 同模式)。
- 实际操作:`grep -n "master:[0-9]\+\|design:[0-9]\+" docs/plans/2026-05-12-plan-9e1-archive-summary-base.md` → 把每处改为 section anchor。

### Step 4: 全本地 verify + 文档 commit

- [ ] **Step 4.1: 全本地 verify(重头跑一遍所有命令)**

```bash
cd D:/ClaudeProject/opsp/forge-repo && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
```

预期:全过。**若 format:check 失败**:`pnpm format` 修复后 add + 立即 commit。**若 test:gate fail**:确认 `tests/integration/release-blocker-attack-path.test.ts` 仍含 2 个 `it.todo`,EXPECTED_TODO_COUNT_SOFT 仍是 2(本 plan 不改 9c gate)。

- [ ] **Step 4.2: commit Task 6**

```bash
git -C D:/ClaudeProject/opsp/forge-repo add commands/archive.md tests/integration/archive-summary-end-to-end.test.ts tests/fixtures/archive-warnings/ docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md docs/specs/2026-05-10-v1.0-fusion-completion-design.md
git -C D:/ClaudeProject/opsp/forge-repo commit -m "$(cat <<'EOF'
feat(9e1 Task 6): commands/archive.md + 7 fixture e2e + cross-plan master/design 注脚 + 全本地 verify PASS

- archive.md:加 §"v1.0 三级分级行为" + §"archive_summary 输出" + §"--resume-summary 用法" + §"与其他 sub-plan 合并点" + §"C 简码迁移 + exit 5 遗留" (v3 MAJOR 1+4)
- 7 fixture:acked-warning / pending-suggestion / pause-out-of-scope / mixed-all-three / warning-missing-ack-double-fence / review-outcomes-c-rejected / scope-entries-yaml-corrupt (v3 MAJOR 2)
- e2e:7 case × tmpdir 复制 × hash 重算 + 占位替换 × spawn forge archive × 断言 exit + archive_summary.yaml 字段
- **cross-plan**:master §3.12.3 加 exit code 注脚 / §3.12.1bis 加 schema literal 注脚 / design §2.4.3 字段名 acknowledged_warnings → acked_warnings(v5 选项 C 落实 §11 reflection)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

预期:commit 成功 + plan-9e1 完成。

---

## 8. 已知降级与风险

### 8.1 process_evidence_summary placeholder(9e2 接 9g 后填实)

**降级**:9e1 仅在 ArchiveSummary 中写 `process_evidence_summary: { placeholder: true, note: '...' }`,真实 13 不变量(沿 design §2.7)统计字段(`invariants_passed` / `invariants_failed` / `legacy_exempt`)留待 9g 实施 process_evidence 后,由 9e2 接入。

**风险**:9e1 完成后立即用 `forge backlog index --scan-archive`(v1.1)时,该字段是 placeholder,backlog index 需识别 `placeholder: true` 跳过 process_evidence 维度查询。

**兜底**:Task 1 schema 校验仅要求 `process_evidence_summary` 是 object(不强制要求 placeholder=false);9e2 实施时改为校验"placeholder=false → 必须含 invariants_passed/failed/legacy_exempt 三字段"。

### 8.2 handoff_to_backlog 第 3 类:scope-entries non-goals 不进 handoff

**降级**:`scope-entries.ts` 三段 anchor(forge-oos / forge-non-goals / forge-future-work),9e1 仅收集 forge-oos 与 forge-future-work 的 active entry 进 handoff。理由:non-goal 语义是"反目标"(明确"不做"),不需 backlog 追踪。

**风险**:v1.1 backlog index 若想统计 non-goals 作为"明确拒绝"清单,需另外加 `non_goals_inventory` 字段而非走 handoff_to_backlog。

**兜底**:在 ArchiveSummary schema 留扩展位 — `HandoffEntry.source` enum 已含 `'scope_entries'`,若未来需要扩 non-goals,可不动 schema,只改 summary-builder 收集逻辑。

### 8.3 acked_warnings 与 handoff_to_backlog 数据重复

**设计**:`acked_warnings` 包含 verify_findings + review_outcomes 中 WARNING + acked 的引用(给用户回顾用);`handoff_to_backlog` 包含 SUGGESTION 持挂(第 1 类)+ pause option=3(第 2 类)+ scope-entries(第 3 类)。**WARNING acked 不进 handoff**(已 ack 视为本 change 已处理,不再持挂到 backlog),因此两数组无重复。

**v6 修订**:Task 2 单测 `collector1 acked_warnings` 与 `collector3 handoff_to_backlog 第 1 类:verify_findings SUGGESTION 持挂` 同时 PASS 即可验证此设计 — 同一 finding 不可能同时进两个数组(severity 互斥)。

### 8.4 Move 后 rename 失败的极罕见状态

**降级**:`forge archive` 步骤 5 "rename `.tmp` → 正式名" 在同目录内 rename,理论上极少失败(同盘 rename 几乎不会出错)。但若发生(文件系统异常 / 权限突变等),archive 数据已 move 到 archive 目录,只是 summary 是 `.tmp` 名。

**兜底**:`forge archive --resume-summary <archive-id>` 子命令(Task 5)处理此场景。**v2 BLOCKER 5 加固**:rename 前 readFile + parseYaml + `validateArchiveSummarySchema`,损坏 `.tmp` → exit 3(corrupt),阻止数据可信度污染。

### 8.5 v2 MAJOR 1 修订后 — scanOrphanTmp 的兜底语义弱化

**降级**:v1 plan transaction 回滚链改 `.yaml` → `.tmp` 名保留,scanOrphanTmp 主要捕获"上次回滚残留";v2 修订改为回滚 unlink 任何 summary 文件后,scanOrphanTmp 几乎只能捕获**异常 crash 后未走完回滚**的极罕见 source 残留(SIGKILL / OOM / 磁盘满 …)

**理由**:回滚 unlink 是"事务原子性 = 状态完全回到事务开始前"的标准语义,**比 v1 残留 .tmp 更清洁**;scanOrphanTmp 仅作"运行时一致性 sanity 检测"。

**兜底**:用户手动 `rm` 或重试 `forge archive` 会重新生成 `.tmp` → Move + rename(覆盖式幂等)。

### 8.6 v3 MAJOR 4 → v4 BLOCKER 1 → v5 MINOR 1 已知降级 — C 简码硬墙,等 9j 完成

**降级**:plan-9e1 fence 拒签 `review_outcomes` 中 C 简码时,要求用户走 `forge upgrade --resign-markers`(9j 交付);但 9j 与 9e1 平行 phase,可能 9e1 早于 9j 完成。**v4 BLOCKER 1 修订**:删除 v3 "9j 未完成时手动迁移 marker" 路径 — 三道墙都走不通(ReviewOutcome 接口拒全名 / marker-schema 拒全名 / WARNING ack 必须 CLI 反向加固)。

**风险**:9e1 实施期间用户的 v0.4 marker 含 C 简码 review_outcome 时,archive 是阻塞性硬墙。

**兜底**:用户必须等 plan-9j 落地后跑 `forge upgrade --resign-markers` 迁移;9e1 fence 错误提示明确给硬墙信号(沿 Task 4 v4 修订);commands/archive.md "C 简码迁移协议" 段(Task 6 Step 1.3 v4 修订)同步说明。

**为什么 9e1 选硬墙而非 graceful manual path**:
1. 反向加固原则(design §1.5.2):ack 字段必须 CLI 触发,手动加 `severity_acked_by` 违反协议
2. 接口边界:`ReviewOutcome.severity` 字面 `'S' | 'C' | 'L'`,扩展全名属于 9j 接口变更(超出 9e1 范围)
3. 数据可信度:archive_summary.yaml 落地后 v1.1 backlog index 读 marker 需统一格式,9e1 不能造成混合简码 + 全名状态

### 8.7 v3 MAJOR 1 → v4 MAJOR 3 → v5 MAJOR 2 已知降级 — exit code v0.4 遗留(v5 选项 C:master plan 注脚由 Task 6 Step 4-pre 实施时落地)

**降级**:`forge archive` 主路径 + `--recover` LockHeldError 走 exit 5(archive.ts:149, :454);master §3.12.3 freeze 应 exit 2;**两者冲突**。

**plan-9e1 不修**理由:改动需重写 archive.test.ts:517 等多处断言,且与 9e1 范围正交(本 plan 仅落 archive 软告警基础)。

**兜底**:`--resume-summary`(plan-9e1 新增路径)走 exit 2 对齐 freeze;commands/archive.md "exit code 遗留声明" 段显式标 v0.4 遗留。

**v4 MAJOR 3 修订** — 不再单方面声明"v0.4 遗留 9e1 不修",改为:
1. plan §11(新增段)给上游 master plan 写 reflection,建议 master §3.12.3 加 known limitation 注脚 + 指定后续 sub-plan owner(如 9z release / 单独 cleanup plan)统一全路径 exit 2
2. commands/archive.md 段同步加 "9e1 已知降级 + 跟进通道" 行,而非直接说"不修"

### 8.8 v3 MAJOR 2 → v4 MAJOR 2 → v5 NIT 1 已知降级 — scope-entries-yaml-corrupt fixture defense-in-depth

**降级**(v5 NIT 1 措辞精确):Task 6 fixture `scope-entries-yaml-corrupt` 在**真实用户工作流**下不可达 — 用户跑 `/forge:verify` slash command(`commands/verify.md`)→ `forge validate` CLI(`src/cli/commands/validate.ts:16`)→ `validateChange(changeDir)` → `validateScopeEntries`,在 verify 阶段就拒签坏 YAML(scope-entries.ts:55-68 抛 FencedYamlParseError → CRITICAL finding → validate exit 1)。仓库**无**独立 `forge verify` CLI 入口。

**fixture 设计语义**(v4 MAJOR 2 修订):该 fixture 是 9e1 builder `ScopeEntriesIntegrityError` 路径的 **defense-in-depth e2e 化验证** — 验证的场景是 "用户手动改 proposal.md 后**绕过** verify 直接跑 archive",或 "verify 阶段被 mock / patch 跳过";真实工作流下 archive 命令永远读不到坏 YAML(verify 阶段已拦)。

**价值评估**:
1. 真实工作流下不可达,**不代表用户路径**
2. 但 9e1 builder 该路径仍有价值 — 防 verify 绕过 / mock 路径 / 手动改文件
3. Task 2 单测(4 ScopeEntriesIntegrityError 抛错 case)是核心 — fixture e2e 只是端到端串通验证

**v4 修订说明**(v5 NIT 1 措辞精确):plan Task 6 e2e case 注释 + plan §8.8 显式声明 fixture 语义,避免后续实施者/codex 误以为该 case 代表真实流程;调用链精确为:`/forge:verify` slash command(commands/verify.md)→ `forge validate` → `validateChange` → `validateScopeEntries`(scope-entries.ts:55-68)。仓库无独立 `forge verify` CLI 入口。

### 8.9 v2 重构后 — verify_findings 端 fence 角色明确(v5 MINOR 1 重号:原 §8.6 → v4 §8.11 → v5 §8.9 连续)

**降级**:9e1 三级 fence verify_findings 端瘦成 CRITICAL sanity 兜底;WARNING/SUGGESTION 由 9d 单源处理。这意味着如果未来 9d verify-findings-fence 被改坏或新加 bypass 路径,**9e1 sanity 仅拦 CRITICAL**,WARNING/SUGGESTION 不会被双重保险拦截。

**风险评估**:低 — 9d 已落地 + 测试覆盖完整(plan-9d Task 6 + plan-9d Task 8 e2e);任何修改 9d 需走完整 PR review。

**兜底**:`tests/cli/archive-three-level-fence.test.ts` 注释明确"verify 端 WARNING 由 9d 单源 — 本 fence 不重复处理";后续修改 9d 时也修这个 fence 的 docstring(plan-9e2 时再次复盘 9e1 fence 是否需要扩展)。

---

## 9. Self-Review checklist

实施者完成 Task 6 后,**实施前自查**:

1. **Spec 覆盖**:对照 design §2.4.1-2.4.7 逐项核对:
   - §2.4.1 当前协议状态 → 不需新代码,仅引用
   - §2.4.2 三级 fence → Task 4 three-level-fence.ts + commands/archive.md
   - §2.4.3 archive_summary schema + handoff 三类 → Task 1 schema + Task 2 builder
   - §2.4.4 输出格式 → Task 4 summary-render.ts
   - §2.4.5 atomic 序列 + .tmp 生命周期 → Task 3 transaction.ts + Task 5 resume-summary
   - §2.4.6 --force 不扩展 → commands/archive.md(Task 6 文档段)+ 实际行为由 Task 4 fence 落地
   - §2.4.7 实施清单 → Task 6 e2e fixture + Task 5 validate scanOrphanTmp

2. **Placeholder scan**:全文搜 TBD / TODO / FIXME / "实现 later" — 仅允许 `process_evidence_summary` 字段的 placeholder 说明(已在 §8.1 显式声明)。其他 placeholder 视为 plan 失败。

3. **类型一致性**:
   - `ArchiveSummary` 9 顶级字段(Task 1)与 master §3.12.1bis 字段表一致
   - `HandoffEntry.source` enum 与 Task 2 builder 收集逻辑一致(verify_findings / review_outcomes / pause_decisions / scope_entries)
   - `buildArchiveSummary` 函数签名(Task 2)与 archive.ts 调用点(Task 4)参数一致(verifyRec, reviewRec, changeDir, changeId)
   - `archiveTransaction` 函数签名(Task 3)与 archive.ts 调用点(Task 4)一致(传 archiveSummary 字段)

4. **commit 单元粒度**:每 task 独立 commit;commit message 沿 plan-9c 同模式 `feat(9e1 Task N): <summary>`。

5. **codex review 实际轮次记录**(超 plan-9c v6 收敛 5 轮 模式约一倍,沿严格 0 BLOCKER + 0 MAJOR 收敛标准):
   - 第 1 轮(v1 → v2):5 BLOCKER + 3 MAJOR + 1 MINOR + 1 NIT
   - 第 2 轮(v2 → v3):1 BLOCKER + 4 MAJOR + 2 MINOR + 2 NIT
   - 第 3 轮(v3 → v4):1 BLOCKER + 3 MAJOR + 1 MINOR + 1 NIT
   - 第 4 轮(v4 → v5):**0 BLOCKER** + 2 MAJOR + 3 MINOR + 1 NIT
   - 第 5 轮(v5 → v6):0 BLOCKER + 1 MAJOR + 2 MINOR + 1 NIT
   - 第 6 轮(v6 → v7):0 BLOCKER + 1 MAJOR + 3 MINOR + 2 NIT
   - 第 7 轮(v7 → v8):0 BLOCKER + 1 MAJOR + 1 MINOR
   - 第 8 轮(v8 → v9):0 BLOCKER + 1 MAJOR + 1 NIT
   - 第 9 轮(v9 → v10):0 BLOCKER + 1 MAJOR(§10 算术闭合)+ 2 NIT
   - 第 10 轮(待):v10 算术闭合 + 残留措辞收干后再核 — 预期收敛(0 BLOCKER 已 6 连 + 业务逻辑稳定 + 残留仅算术/文档清理)

---

## 10. 沿 master plan §3.5 工日核算

| Phase | 子任务 | 工日 P50(v11) | 工日 P90(v11) |
|------|------|---------|---------|
| Task 1 | schema(含 v2 BLOCKER 2 schema literal 注脚)+ 单测 | 0.45 | 0.55 |
| Task 2 | builder(含 v2 BLOCKER 3+4 修订 + v3 MAJOR 2 ScopeEntriesIntegrityError 4 抛错 case)+ 17 case | 0.85 | 1.15 |
| Task 3 | transaction `.tmp` + 回滚 unlink + 7 实测 case + 3 it.todo + release-gate 同步 | 0.8 | 1.10 |
| Task 4 | archive.ts 三级 fence(verify sanity / review 核心 + **v3 BLOCKER 1 C 无视 resolved 拒签 + MAJOR 4 graceful 9j 文案**)+ summary 集成 + render + 13 case | 0.85 | 1.10 |
| Task 5 | --resume-summary(含 v2 BLOCKER 1+5 + **v3 NIT 1 lock.ts 注释 + MINOR 1 parse case + MAJOR 3 scanOrphanTmp 扫 .yaml**)+ orphan-tmp 4 case | 0.6 | 0.80 |
| Task 6 | archive.md(含 v3 MAJOR 1 exit 5 遗留段 + MAJOR 4 C graceful 段)+ **7 fixture**(v3 MAJOR 2)+ **v5 选项 C cross-plan 修订 master/design**(Step 4-pre.1/.2/.3/.4)+ master §6 修订记录(Step 4-pre.4)+ section anchor 替换(Step 4-pre.6)+ e2e + 全本地 verify | **0.65** | **0.80** |
| **合计** | | **4.20** | **5.50** |

**v10 MAJOR 算术闭合**:Task 1-6 P50 = 0.45+0.85+0.8+0.85+0.6+**0.65** = **4.20** ✓;P90 = 0.55+1.15+1.10+1.10+0.80+**0.80** = **5.50** ✓。Task 6 v9→v10 +0.15d 吸收 cross-plan 修订 master/design 工日(Step 4-pre.1/.2/.3 三处文件修订)+ Step 4-pre.4 master §6 修订记录 + Step 4-pre.6 section anchor 替换共 6 sub-step,实际工作量比 0.5d 略高。

master §3.5 给 9e1 ~ 2.5d(line 310),本 plan v5 +1.70d(P50)对齐 plan-9c v6 上调 1.65d 模式(plan-9c 从 master P50 2.5d → sub-plan v6 P50 4.15d,沿 5 轮 codex review 上调;plan-9e1 v1 → v2 → v3 → v4 → v5 沿 4 轮 codex review 上调 1.10d,与 plan-9c v6 收敛工日同区间)。

---

## 11. 上游 master plan + design 实际修订(v5 选项 C — reflection 真落地)

**v4 → v5 状态变更**:v4 §11 给上游 master plan 写 "建议" 不实际改,codex 第 4 轮 MAJOR 2 指出 reflection 不落地 → master 修订者读不到。**v5 选项 C 修订**:plan-9e1 实施时 Task 6 Step 4-pre **实际修改** master plan + design 文件,reflection 真落地。本 sub-plan 范围扩展到 cross-plan 修订,但限于"加注脚 / 改字段名"等轻量改动,不动 master plan 业务逻辑。

修订事项(均在 Task 6 Step 4-pre 落实):

### 11.1 master §3.12.3 exit code freeze 待补 known limitation 注脚

**事项**:master §3.12.3 freeze `forge archive` lock/fs 错 exit 2;但现状 `src/cli/commands/archive.ts:149`(主路径)+ `:454`(--recover)走 exit 5(v0.4 遗留);`tests/cli/archive.test.ts:517` 等多处断言固化 exit 5。

**反馈**:master §3.12.3 应加注脚或 known limitation 段,显式说明:
- `forge archive --resume-summary`(plan-9e1 v3 新增):exit 2(对齐 freeze)
- `forge archive` 主路径 + `--recover`:exit 5(v0.4 遗留,与 freeze 冲突)
- 后续 sub-plan(候选:9z release / 单独 exit code cleanup plan)统一全路径 exit 2 + 同步重写 archive.test.ts 断言

**Owner / 状态**(v5 选项 C):master §3.12.3 注脚由 plan-9e1 Task 6 Step 4-pre 实际加入 — 状态 = **实施时落地**(Task 6 Step 4-pre 执行后);exit code 全路径统一(主路径 + --recover 从 exit 5 → exit 2)仍由后续 sub-plan(9z release / 单独 cleanup plan)接手,plan-9e1 仅在 master 加 known limitation 注脚。

### 11.2 master §3.12.1bis ArchiveSummary 9 字段 freeze 待补 schema literal 注脚

**事项**:master §3.12.1bis 表列 9 顶级业务字段(version / archived_at / ... / pending_suggestions);未列 `schema` literal,但 design §2.4.3 YAML 字面含 `schema: forge-archive-summary/v1`,且所有 forge marker schema(forge-verify/v1, forge-review/v1, forge-scope-entries/v1, forge-ack-log/v1)都有 schema identifier(工程常识)。

**反馈**:master §3.12.1bis 在 9 字段表上方加注脚:"schema literal 字段隐含,沿 forge marker schema 同约定 — 不算业务字段计数"。

**Owner / 状态**(v5 选项 C):master §3.12.1bis 注脚由 plan-9e1 Task 6 Step 4-pre 实际加入 — 状态 = **实施时落地**(Task 6 Step 4-pre 执行后);字段 freeze 仍以 master 为 ground truth。

### 11.3 design §2.4.3 字段名 `acknowledged_warnings` 与 master §3.12.1bis `acked_warnings` 不一致

**事项**:design §2.4.3 YAML 字面 `acknowledged_warnings`;master §3.12.1bis `acked_warnings`(后修);plan-9e1 沿 master(更新 ground truth)。

**反馈**:design §2.4.3 应修订为 `acked_warnings` 与 master 对齐;或 master 加注脚说明字段名以 master 为准。

**Owner / 状态**(v5 选项 C):design §2.4.3 字段名 `acknowledged_warnings` → `acked_warnings` 由 plan-9e1 Task 6 Step 4-pre 实际改 — 状态 = **实施时落地**(Task 6 Step 4-pre 执行后);字面与 master `acked_warnings` 对齐。

---

(Plan v12 — codex 11 轮 review 0 BLOCKER + 1 MAJOR(残留版本号 v10 → v11 + §0 P90 列误判已驳回)+ 0 NIT 全采纳完成;**待第 12 轮 codex review 确认收敛**;0 BLOCKER 已 8 连保持,业务逻辑稳定 — 11 轮已超 plan-9c v6 收敛 5 轮 2.2 倍)

