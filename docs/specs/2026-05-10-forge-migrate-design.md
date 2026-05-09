# Forge Migrate(openspec / superpowers 项目搬运)设计文档

- **作者**:msc(由 Claude Opus 4.7 协助 brainstorming)
- **日期**:2026-05-10(v3 — 经 Opus subagent 自检发现 12 条新问题 + 6 条 codex 表面解决修订)
- **状态**:草案,待用户审阅
- **关联**:
  - 主 spec [`2026-05-04-forge-fusion-design.md`](2026-05-04-forge-fusion-design.md)(forge 工作目录契约 + skill/command 体系)
  - v0.3 plugin 设计 [`2026-05-09-v0.3-plugin-migration-design.md`](2026-05-09-v0.3-plugin-migration-design.md)(plugin 形态)
  - brownfield 设计 [`2026-05-05-brownfield-onboarding-design.md`](2026-05-05-brownfield-onboarding-design.md)(legacy-bridge 工具复用边界)

**v1 → v2 修订**(对照 codex 40 条审查 + 7 条代码核实):

- M9 复用边界收紧:不反向调 legacy-bridge ack/budget/quality;只复用 `redact.ts`;migrate 写专属 ack/budget/quality
- M10 transformer 升级 markdown-aware(fenced code block 状态机 + 表格 cell 跳过)
- 新增 M13/M14/M15/M16

**v2 → v3 修订**(对照 Opus subagent 自检 12 条新发现 + 6 条表面解决):

- M9 改"扩 LockMode union 但不动 LockHeldError 文案"(实证:`tests/core/archive/lock.test.ts:188` 硬断言"another forge **archive** is in progress"将破裂;改最小化方案保兼容)
- M13 archive 降级前**强制二次确认**(`--no-interactive` 时 abort 而非默默降级,反 v2 静默状态变化)
- M14 trace 用 `.ndjson` + 末态原子 `rename` 到 `.json`(防 reformat 期 crash 留半残双格式文件)
- M15 source-bundle 改**目标分桶**:proposal 校验 facts 来自 design 的"问题/动机"(独立 prompt);specs 校验 facts 来自 tasks 的"行为/输出";避免 facts 范围与 generated 不重合的"假阴性 .partial"
- M15 加阈值:facts < 5 → 视为 empty-facts 触发 fail
- M16 bundled + superpowers 时**前置 prompt** "此模式将产 N 个 [needs-fix],继续吗?";`--no-interactive` 直接 abort
- §2.5 markdown-aware walker 明示**不识 indented code block(4 空格缩进)**;只识 fenced 且 token 同种收尾
- §3.1 unsafe-slug 件数 / 总件数 ≥ 50% → exit 4(不走半残)
- §5.2 / §7.1 锁定 `@anthropic-ai/sdk` 版本(支持 AbortSignal 的最低版本)

---

## 0. 决策快照

| #   | 决策                          | 选项 / 备注                                                                                                                                                                                            |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | 场景定位                      | **搬运用户已有项目仓库**(`openspec/` 或 `docs/superpowers/{specs,plans}/`)→ forge 工作目录;不做"双读 fallback",不做"上游同步追新"                                                                    |
| M2  | superpowers 源含义            | 用户仓库被 superpowers plugin 用过的产物(`docs/superpowers/specs/<date>-<topic>-design.md` + `docs/superpowers/plans/<date>-<topic>-plan.md`)                                                          |
| M3  | 迁移类型(双档)              | 默认 `--regenerate`(LLM 补缺件);`--no-regenerate` 走纯结构 + transformer + `[needs-fix]` 标记                                                                                                          |
| M4  | CLI 入口                      | 独立 `forge migrate <source>`(不扩 `legacy-bridge`,语义不混)                                                                                                                                         |
| M5  | superpowers 落点              | design+plan 配对包成 `forge/changes/<slug>/{design.md, tasks.md}`;**不写 placeholder**;缺件由 `--regenerate` 补,关闭则 `[needs-fix]`(**与 M13 协调**:archive 落点不接受残缺)                       |
| M6  | 已归档判定                    | 推测 + 交互;**git keyword 用 word boundary + 文件路径或 slug 共同命中**(反 false-positive);`mtime` 仅在非 git 仓库展示为弱提示,不参与默认分类                                                       |
| M7  | 目标冲突                      | 默认 merge,同名加 `--imported` 后缀(撞则递增 `--imported-2..99`,99 全占整次 abort);`--force` 旧目标先 mv 到 `forge/.forge-trash/<ts>/` 留 24h 兜底;**冲突在 plan 阶段全锁定,copy 阶段再撞触发整体 rollback** |
| M8  | 源处理                        | 默认 cp 不动源;写 `forge/migrate-report.md` + `forge/migrate-trace.json`(journal 模式)+ 输出 `git rm -r <source>/` cleanup 建议                                                                       |
| M9  | LLM 复用边界(**v3 修订**)   | **只复用 `legacy-bridge/redact.ts`**(字符串处理无 brownfield 耦合);ack / budget / quality 给 migrate 写**专属包装**(`src/core/migrate/{ack,budget,quality}.ts`);`legacy-bridge/lock.ts:LockMode` union 加 `'migrate'` mode;**LockHeldError 文案保持现状**(不改"another forge archive..."字串)以兼容现有 `tests/core/archive/lock.test.ts:188` 硬断言;migrate mode 触发 lock 时错误信息略微别扭(写"another forge archive is in progress (mode: migrate)"),接受 — 用户可读 |
| M10 | content transformer(**v2 修订**)| **markdown-aware**:逐行扫描 + fenced code block 状态机 + table-row(`| ... |`)跳过;`parse/markdown.ts` 现有 ATX section 切分配合;**不再纯字符串正则**                                                  |
| M11 | validate 后处理               | transform 后跑对应 `validateXxx`,通过标 `[ok]`,失败标 `[needs-fix: <字段> <消息>]`,**不阻塞 cp**;`--regenerate` 路径在 transform+validate 后接管缺件 + `[needs-fix]` 件                                |
| M12 | rollback                      | 本 spec **不实现** `forge migrate --rollback` 子命令;`migrate-trace.json` v1 schema 留好供后续 PR                                                                                                       |
| M13(**v3 修订**) | archive 落点完整性约束 | archive 落点强制 validate 通过 + 无 [needs-fix] 残留;推测 archive 但缺件 → `--regenerate` 开则补,失败/拒绝 → **必须用户二次确认**(交互模式 prompt "降级 active 还是跳过?");`--no-interactive` 模式 → **abort + exit 4**(不沉默降级,反 v2 静默状态变化);archive 永不带 placeholder/partial |
| M14(**v3 修订**) | trace journal 模式      | journal 写 `forge/migrate-trace.json.ndjson`(NDJSON 行式 + 每步 fsync);末态写新文件 `migrate-trace.json` 后**原子 `rename`**(`fs.rename` POSIX 原子);rename 失败保留 `.ndjson` 兜底,reader 不会面对"双格式半残文件";crash/SIGINT 基于已写 NDJSON 反向回滚;LLM 调用 AbortController + 写盘前二次检查 aborted flag |
| M15(**v3 修订**) | quality facts 目标分桶 + 阈值 | **目标分桶**:生成 proposal 校验 → facts 来自 design.md 的"问题/动机"句(独立 prompt `extractMotivationFacts`);生成 specs 校验 → facts 来自 tasks.md 的"行为/输出"句(独立 prompt `extractBehaviorFacts`);**不再拼 design+tasks 当一个 origin**(避免 facts 与 generated 范围错配);**阈值**:抽出 facts < 5 条 → 视为 empty-facts 触发 fail;JSON 解析失败 → fail;superpowers regen 路径 fidelity threshold 默认 0.6(brownfield 0.9,因从零生成保真期望低)|
| M16(**v3 修订**) | bundled plugin 默认行为 | bundled + openspec source → 默认 `--regenerate` 静默退化为 `--no-regenerate` + warn(openspec 缺件少,可接受);bundled + superpowers source → **plan 表前置 prompt** "此模式将产生 N 个 [needs-fix](superpowers 必缺 proposal/specs),继续吗?";`--no-interactive` 时 abort + exit 4 + 提示用户改用完整 plugin |

---

## 1. 顶层架构

### 1.1 模块组织

```
src/core/migrate/                       ← ★ NEW
├── index.ts                            ← 对外导出 + runMigrate(主流程编排)
├── types.ts                            ← MigrateSource 接口、ScanResult、ClassificationPlan、CopyOp、MigrateReport、ArtifactKind 等
├── conflict.ts                         ← 同名 --imported 后缀递增 + --force trash 路径 + plan 阶段全锁定
├── archive-detect.ts                   ← 推测引擎(checkbox + git log 严格 keyword + word boundary + slug 共同命中)
├── markdown-aware.ts                   ← ★ NEW:逐行扫描 + fenced code block 状态机 + table-row 跳过(供 sources/* 复用)
├── report.ts                           ← migrate-report.md / migrate-trace.json 生成器(journal 写入)
├── ack.ts                              ← ★ NEW:migrate 专属 opt-in prompt + ack 文件读写(.forge-ack/migrate-<ts>.yaml)
├── budget.ts                           ← ★ NEW:migrate 专属 cost 估算(按件长度 + token 数,不用 brownfield 4-role 公式)
├── quality.ts                          ← ★ NEW:source-bundle 抽 facts + judge 空 facts 强制 fail
├── regenerate.ts                       ← --regenerate 主流程:复用 redact + 调本模块 ack/budget/quality
└── sources/
    ├── index.ts                        ← registry: 'openspec' | 'superpowers' → MigrateSource
    ├── openspec.ts                     ← OpenSpecSource(同构映射 + transformer)
    └── superpowers.ts                  ← SuperpowersSource(配对 + slug 推断 + transformer)

src/cli/commands/
└── migrate.ts                          ← ★ NEW:commander 子命令骨架,解析参数 → 调 runMigrate

src/core/archive/lock.ts                ← ★ 改:LockMode union 加 'migrate';LockHeldError 文案泛化(不再写死 archive)
src/core/parse/markdown.ts              ← 复用现有 parseMarkdown(ATX section)

tests/migrate/                          ← ★ NEW:单元 + 集成测,详 §4
tests/cli/migrate.test.ts               ← ★ NEW:CLI 端到端
tests/fixtures/migrate/                 ← ★ NEW:四套 fixture 树(详 §4.2,加覆盖 markdown-aware 反例)
```

### 1.2 `MigrateSource` 接口契约

```ts
// src/core/migrate/types.ts
export interface MigrateSource {
  readonly id: 'openspec' | 'superpowers';
  detect(cwd: string): Promise<DetectResult>;
  scan(rootPath: string): Promise<ScanResult>;
  classify(scan: ScanResult, ctx: ClassifyCtx): Promise<ClassificationPlan>;
  prepareCopy(plan: ClassificationPlan, target: string): CopyOp[];

  /** markdown-aware transformer:走 markdown-aware.ts 提供的 walker(逐行 + fenced state) */
  transform(content: string, kind: ArtifactKind): string;

  /** --regenerate 时枚举每个 change 缺哪些件;source-bundle 策略由 quality.ts 用 */
  listMissingArtifacts(change: PlannedChange): MissingArtifact[];
}
```

### 1.3 CLI 形态

```
forge migrate <source> [options]

参数
  <source>             'openspec' | 'superpowers'(必填,不自动猜)

选项
  --no-regenerate      不调 LLM,只走 transformer;失败件标 [needs-fix],不阻塞 cp
                       (默认 --regenerate 开启,触发 ack/budget gate;bundled plugin 自动退化为本模式 + warn)
  --dry-run            只扫描 + 出 plan + 输出报告到 stdout / stderr,**不写 forge/ 任何文件**
  --force              冲突时旧目标 mv 到 forge/.forge-trash/<ts>/(留 24h 兜底)再覆盖
  --archive-list <f>   显式指定哪些 slug 进 archive,跳过自动推测
  --no-interactive     跳过 active/archive 交互确认表,全用推测默认值
  --redact-rules <f>   --regenerate 时附加自定义 redact 规则(沿用 legacy-bridge `redact.ts` 格式)
```

### 1.4 主流程伪码(v2:加 LockMode 'migrate' / forge 初始化 / journal trace / AbortController / archive 降级)

```
runMigrate(sourceId, opts):
  source = sources[sourceId]
  detect = source.detect(cwd)
  if !detect.found:
    error('source <id> not found at <expected-path>')   # exit 2

  # M9 修订:LockMode 'migrate' 已扩展;此前不存在 forge/ 时必须先建最小 .cache 目录
  ensureForgeBootstrap(cwd)        # mkdir -p forge/.cache forge/.forge-trash forge/.forge-ack
  acquireLockByPath(forgeRoot, 'migrate', 'migrate.lock')

  # 注:detect 阶段不再因"另一源也存在"abort;source 已显式给定时只 warn 提示
  if anotherSourceAlsoFound:
    warn('also found <other-source>; not migrating it (rerun with that source if needed)')

  abortController = new AbortController()
  process.on('SIGINT', () => { abortController.abort(); journalSigint() })

  try:
    scan = source.scan(detect.rootPath)
    if scan.isEmpty:                   # M codex #15:零产物 abort
      error('source has no migratable artifacts')   # exit 2

    plan = source.classify(scan, ctx)  # 内部含 archive-detect(严格 keyword + word boundary)
    plan = applySafetyRules(plan)      # slug 安全归一化(禁 .. / . / 保留名);archive 阈值边界检查
    conflicts = conflict.check(plan, target='forge/')   # 全锁定:plan 阶段计算所有 --imported-N
    report.printPlan(plan, conflicts)

    if !opts.noInteractive:
      plan = askUserConfirm(plan, conflicts)

    regenEnabled = !opts.noRegenerate

    # M16(v3 修订):bundled + superpowers source 不沉默退化
    if isBundled() && regenEnabled:
      if source.id == 'superpowers':
        msg = 'bundled plugin: --regenerate unavailable; superpowers source will produce ' +
              count(missing) + ' [needs-fix] markers. continue?'
        if opts.noInteractive:
          error('bundled + superpowers + --no-interactive: refuse to silently degrade')   # exit 4
        elseif !askUserConfirm(msg):
          exit(0)
        regenEnabled = false   # 用户确认后才退化
      else:    # openspec source(缺件少,静默退化可接受)
        warn('bundled: --regenerate unavailable, falling back to --no-regenerate')
        regenEnabled = false

    if regenEnabled:
      missing = listAllMissing(plan, source)

      # M13(v3 修订):enforceArchiveIntegrity 移到 budget 之前,避免估算降级件 token 浪费
      plan = enforceArchiveIntegrity(plan, regenEnabled, opts.noInteractive)
        # 推测 archive 但缺件且 regen 关 / 即将拒绝:
        #   - 交互模式:askUserConfirm('降级 active 还是跳过?')
        #   - --no-interactive:error('archive 完整性不可达,abort')   # exit 4

      missing = listAllMissing(plan, source)             # 降级后重算
      cost = budget.estimateMigrateCost(missing)         # migrate 专属公式
      ackOk = ack.optin(cost, source.id)                 # migrate 专属 prompt
      if !ackOk:
        regenEnabled = false                             # 退化纯结构;exit 0

    if opts.dryRun:
      report.toStdout()                # 不写盘
      return

    ops = source.prepareCopy(plan, target='forge/')
    # M14(v3 修订):journal 写 .ndjson;末态原子 rename 到 .json
    journal = trace.openJournal('forge/migrate-trace.json.ndjson')

    for op in ops:
      try:
        rawContent = read(op.source)
        transformed = source.transform(rawContent, op.kind)
        write(op.target, transformed)
        journal.append(op)               # 立即 fsync
        validateResult = validate(op.target, op.kind)
        if validateResult.ok:
          report.mark(op, '[ok]')
        else:
          report.mark(op, '[needs-fix: ' + validateResult.message + ']')
      except IOErr:
        rollback(journal)               # 反向 rm 已写;源不动
        error('cp failed at ' + op.target)   # exit 5
      except ConflictAtCopyTime:        # M7:plan 阶段没看到的并发冲突
        rollback(journal)
        error('concurrent conflict; rerun migrate after resolving')   # exit 4

    if regenEnabled:
      regenerate.run({ plan, source, ack, abortController })
      # 内部:redact → SDK(传 abortController.signal)→ quality.judge
      #   M15 v3:目标分桶 — proposal 校验 facts 来自 design 的"问题/动机"句;
      #            specs 校验 facts 来自 tasks 的"行为/输出"句;
      #            facts < 5 触发 fail;superpowers fidelity 阈值 = 0.6
      # M14 SIGINT:abort 后写盘前 if (abortController.signal.aborted) return; .partial 残留

    report.write('forge/migrate-report.md')   # 失败降级:磁盘满时尽力 stderr
    journal.close()
    trace.finalizeAndRename('migrate-trace.json.ndjson', 'migrate-trace.json')
      # M14 v3:fs.rename 原子;rename 失败保留 .ndjson
    printCleanupHints(source.id)
  finally:
    releaseLock()
```

---

## 2. 数据流细节

### 2.1 OpenSpec 源 — 目录映射

| 源                                       | 目标                                          | 备注                                                         |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `openspec/specs/<n>/spec.md`             | `forge/specs/<n>/spec.md`                     | 整目录 cp;**transform 见 §2.5**(markdown-aware)             |
| `openspec/changes/<n>/`(非 archive)      | `forge/changes/<n>/`                          | active change;含 `proposal.md` / `tasks.md` / `design.md` / `specs/` 子目录 |
| `openspec/changes/archive/<n>/`          | `forge/changes/archive/<n>/`                  | OpenSpec 已有 `changes/archive/` 子目录约定;**遵守 M13**     |
| `openspec/explorations/<x>`              | `forge/drafts/<x>`                            | exploration 当 forge draft;不 transform                      |
| `openspec/config.yaml`                   | 见 §2.3                                       |                                                               |

### 2.2 superpowers 源 — 配对 + slug 推断

**配对算法**(`SuperpowersSource.scan`):
1. 读 `docs/superpowers/specs/` 全部 `*-design.md`,提取 pairing key = 文件名 anchored 去 `/-design\.md$/` 后缀(**严格末尾匹配**,反 codex #14:`2026-04-15-design-system-design.md` → key `2026-04-15-design-system`)
2. 同样读 `plans/` 全部 `*-plan.md`,锚定 `/-plan\.md$/`
3. 文件名不匹配后缀(如 `feature-design-v2.md`)→ 标 `unrecognized`,plan 表显式列出让用户决定
4. 同 key 两边都有 → design+plan 配对
5. 只在 specs/ 出现 → design-only;只在 plans/ 出现 → plan-only
6. **change-id 取 `<topic>` 部分 + 安全归一化**(禁 `..`、`.`、保留名 `.forge-trash` / `.forge-ack` / `archive` / `.cache`;命中保留名 → 标 `unsafe-slug`,跳过 + report 警告)
7. date 部分丢进 trace meta 不进 id

**已归档推测**(`archive-detect.ts`,v2 严格化):
| 信号 | 内容 | 强度 |
|------|------|------|
| 1 | plan.md `[x]` 完成度 ≥ 95% **且 task 总数 ≥ 3**(防单 task 100% 误归)| 强 |
| 2 | `git log --follow -- <plan.md path>` commit msg 含 **word-boundary**(`\b(close|complete|done|finish|archive|ship)\b`)**且 commit message 也含该 plan 的 slug 或文件路径片段** | 强 |
| 3(展示)| plan.md `mtime` ≥ 30 天 | **仅展示,不参与默认分类**(codex #19:git clone 后 mtime 失真) |
| 4(可选标记)| plan.md 内含特殊 marker 如 `<!-- forge:archived -->`(用户手动标记) | 强,优先级最高 |

推荐:信号 1 OR 信号 2 命中(且无 critical-task-pending,见下)→ archive;否则 active。
**critical-task-pending 检查**:plan.md 中含 `<!-- critical: <task-id> -->` 标记的 task 若未勾 `[x]` → 哪怕 95% 完成也不推 archive(codex #17)。

**落点表**:
| 用户确认 | 目标                                                                    |
| -------- | ----------------------------------------------------------------------- |
| active   | `forge/changes/<topic>/{design.md, tasks.md}`(有几个写几个,不写 placeholder)|
| archive  | `forge/changes/archive/<topic>/{design.md, tasks.md, proposal.md, specs/}`(**M13 强制完整**;不完整时按 enforceArchiveIntegrity 降级) |
| draft    | `forge/drafts/<date>-<topic>-design.md` + `forge/drafts/<date>-<topic>-plan.md`(扁平保留)|
| skip     | 不动                                                                    |

**空目录处理**(codex #15):若 `docs/superpowers/specs/` 与 `plans/` 都无可识别文件 → exit 2 + 提示 "源目录无可迁移文件,确认路径或 source 类型"。

### 2.3 OpenSpec config.yaml 合并策略

| 场景                                      | 处理                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `forge/config.yaml` 不存在                | 直接 cp + 加注释 `# imported from openspec/config.yaml @ <ts>`                                                                |
| `forge/config.yaml` 存在,`forge/config.yaml.imported` 不存在 | 不自动 merge;写到 `forge/config.yaml.imported`;report 提示手动 review                                                |
| `forge/config.yaml.imported` 也已存在(codex #38)| 升级后缀 `forge/config.yaml.imported-2..99`;99 全占 → exit 4 + 提示用户清理                                                |

### 2.4 冲突处理(v2 加 plan 阶段全锁定 + copy 时撞冲突回滚)

| 场景                                                                     | 处理                                                                                                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `forge/<path>` 已存在(非 `--force`)                                     | 目标改名加 `--imported` 后缀;**plan 阶段全锁定**(在 ASK 阶段就把所有 `--imported-N` 名分配定下并记入 plan)                           |
| `--imported-N` 撞至 99                                                   | 取消整次 migrate;exit 4                                                                                                            |
| `--force`                                                                | 旧目标先 mv 到 `forge/.forge-trash/<ts>/<path>`;`forge/.forge-trash/` parent 由 `ensureForgeBootstrap` 在主流程开头建好           |
| **copy 阶段撞 plan 阶段未预期的冲突**(并发进程在 plan 后写 forge/) | journal rollback 已写件 + 释放 lock + exit 4 提示重跑                                                                              |
| `.forge-trash/` 24h 之外的旧条目                                         | `forge migrate --gc`(stub,后续 PR 实现);**不自动清理**                                                                            |

### 2.5 OpenSpec content transformer(v3 markdown-aware,精确边界)

**统一前置:fenced code block + table-row 状态机**(`markdown-aware.ts`):

```ts
// markdown-aware.ts 伪码:逐行扫描,产 LineCtx { inFenced: boolean, isTableRow: boolean }
// transformer 规则只在 !inFenced && !isTableRow 时执行;否则原样保留
walkLines(content, (line, ctx, replace) => {
  if (ctx.inFenced) return; // 代码块内不动
  if (ctx.isTableRow) return; // 表格 cell 不动
  // 在此跑各 source 的规则
});
```

**v3 边界精确化**(对应 Opus A5):
- **只识 fenced code block**(行 trim 后以 ` ``` ` 或 `~~~` 开头);**不识 indented code(4 空格缩进 / Tab)** — 文档 §7.1 标 best-effort
- 同种 token 收尾:`` ``` `` 开的 fence 必须 `` ``` `` 关闭(三个反引号或更多但同种符号);`~~~` 同;**混用不识为有效 fence**
- Windows CRLF:walker 在 split 前 `replace(/\r\n/g, '\n')`,处理后写盘按目标 EOL(默认 LF)
- 文件编码:**强制 UTF-8 读**(`encoding: 'utf8'`);若文件含 BOM(0xEF 0xBB 0xBF)→ 跳过;非 UTF-8(GBK / UTF-16)→ scan 阶段标 `[skip:encoding-not-utf8]` 不进 transform

`inFenced` 检测:行 trim 后以 ``` 或 ~~~ 开头 → toggle;`isTableRow`:行 trim 后以 `|` 开头且至少 2 个 `|`。

**spec.md** 规则(v2):

| 规则                                                                                  | 处理                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `### Requirement: <name>` 处理(codex #6)                                            | **不直接删**;改为 `## Requirement: <name>`(forge `parseSpec` 不识别这层但允许其存在,不影响 `## Scenario:` 抽取);Description/Notes 段落保留为 Requirement 子内容 |
| `#### Scenario: <id>` → `## Scenario: <id>`                                           | line replace,只在 !fenced && !table 行                                                                                                                            |
| `- **WHEN** <text>` → `**When** <text>`(去 list 前缀 + 标题大小写)                  | 同上                                                                                                                                                              |
| `- **THEN** / GIVEN / AND / BUT** <text>` → 同上                                      | 同上                                                                                                                                                              |
| **多行 list 续行处理**(codex #7)                                                    | 遇到 `- **WHEN** ... \n  续行内容` 时,把续行(以 2+ 空格缩进 + 非 `-` 起始)合并到上一句,转换后产生单行 `**When** <line1> <line2>`(中间空格连接)              |
| Given 子句缺                                                                          | transformer 不补;`validateSpec` 报 `missing Given` → 该 scenario 标 `[needs-fix]`;非阻塞                                                                          |

**proposal.md**:

| 规则                                                                | 处理                                            |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| `## Problem` → `## Why`                                             | line replace,只在 !fenced 行                   |
| `## Proposed Solution` → `## What`                                  | 同上                                            |
| 其他章节(`## User Experience` / `## Migration Path` 等)          | 不动(forge 允许额外章节)                       |

**tasks.md**(v2 支持三层编号):

| 规则                                                                                           | 处理                                                                          |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `- [ ] N(.M(.K)?)?\.\s+<text>` → `- [ ] task-N(-M(-K)?)?: <text>`(三层支持,`.` → `-`)        | 正则 `^(\s*)- \[([ x])\] (\d+(?:\.\d+){0,2})\.\s+(.+)$`,捕获组替换           |
| `- [ ] <prose 无数字编号>`                                                                     | 不动 → 落 `[needs-fix]`                                                       |

**design.md**:不 transform(v2 修订:`parseDesign` 不抛错也不 validate,见 §2.7)。

**specs/<area>.md**:同 spec.md 规则。

### 2.6 superpowers content transformer(v2 修中文冒号 + 三层 + slug)

**plan.md → tasks.md**(实证 forge 自己 docs/plans/ 内 plan 格式 = `- [ ] **Step N**:`):

| 规则                                                                                                | 处理                                                                                              |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `- [ ] **Step N(.M(.K)?)?**[\s]*[:]\s*<text>` → `- [ ] task-N(-M(-K)?)?: <text>`(三层 + 中英冒号) | 正则 `^(\s*)- \[([ x])\] \*\*[Ss][Tt][Ee][Pp]\s+(\d+(?:\.\d+){0,2})\*\*[\s]*[:：]\s*(.+)$` → `$1- [$2] task-$3: $4`;`$3` 的 `.` 全替 `-` |
| 大小写无关                                                                                          | 正则字符类显式覆盖 `[Ss][Tt][Ee][Pp]`(避免 `i` flag 与代码块状态机冲突)                          |
| **中文冒号 `:` 修复**(codex #10/#11)                                                              | 字符类 `[:：]`(中文 `:` U+FF1A + 英文 `:` U+003A);**不再 `[:|:]`**(那是 `|` 字面量,错的)        |
| H1 title 保留                                                                                       | forge tasks parser 也要 H1                                                                        |
| **嵌套层级语义降级**(codex #12)                                                                   | `Step 1` 与 `Step 1.1` 转换后是扁平 `task-1` 与 `task-1-1`;forge tasks parser 不识别父子关系;**接受降级**,文档说明 |

**design.md**:直接搬,无 transform;`parseDesign` 不抛错(见 §2.7)。

**proposal.md / specs/<area>.md**:**superpowers 没产**;`--regenerate` 路径补;关闭则 `[needs-fix: missing proposal]` / `[needs-fix: missing specs]`。

### 2.7 design.md 校验明示(codex #28)

forge 现状:
- `parse/design.ts:parseDesign` 不抛错,无 H1 时返空 title
- `validate/change.ts` 对 design 只做 `void parseDesign(text)` — 不抛即认为通过

本 spec 行为:
- migrate 后**不强制 design.md 有 H1**(forge 当前 validate 也不要求);transformer 不补 H1
- 若 v0.x 后续 forge 加 `validateDesign`(强制 H1),migrate 直接走它的输出
- v1 那条"无 H1 → parseDesign 抛 → [needs-fix]" 删除(本来就不抛)

### 2.8 `--regenerate`(默认开,v3 自实现 ack/budget/quality;facts 目标分桶)

**触发件**:
- superpowers 配对 active/archive change → 必触发(几乎都缺 proposal + specs)
- OpenSpec change / spec → 仅当 transform 后 validate 失败时触发
- OpenSpec spec.md 缺 Given 子句 → 触发(LLM 补 Given,不重写整 spec)

**流程**(v2 — 不反向调 legacy-bridge ack/budget/quality):
1. `listAllMissing(plan, source)` → 列所有缺件 + 待补字段
2. `budget.estimateMigrateCost(missing)`(`src/core/migrate/budget.ts`)
   - 公式按件长度 + token 估算:`Σ (input_tokens(src_bundle) + output_tokens(target_artifact)) * model_rate`
   - **不**用 brownfield 4-role 公式
3. 终端打印估价;≥ `MIGRATE_WARN_USD`(默认 $5;独立常量)二次确认
4. `ack.optin(cost, sourceId)`(`src/core/migrate/ack.ts`)
   - 渲染 migrate 专属 prompt(明示传输内容:`<source>` 下原文 + 生成目标说明;不写"docs/legacy/ 老文档"等 brownfield 文案)
   - 用户输入 ack token → 写 `forge/.forge-ack/migrate-<ts>.yaml`(独立路径,不挤 `.cache/llm-ack.yaml`)
5. **复用** `legacy-bridge/redact.ts:redact` + `DEFAULT_REDACT_RULES` + `--redact-rules` 用户附加(redact 字符串处理无 brownfield 耦合)
6. 对每件:
   - **facts 目标分桶**(M15 v3 — 不再拼 design+tasks 当一个 origin):
     - 生成 **proposal.md** 校验:`facts = quality.extractMotivationFacts(design.md, n=30)`(独立 prompt,只抽 design 中"问题/动机/约束"句)
     - 生成 **specs/<area>.md** 校验:`facts = quality.extractBehaviorFacts(tasks.md, n=30)`(独立 prompt,只抽 tasks 中"行为/输出/给定条件"句)
     - 生成 **OpenSpec 已有件**(transform 失败补缺):`facts = quality.extractFacts(该件原文, n=30)`(用现成原文,与 brownfield 同路径)
   - 调 Anthropic SDK(传 `abortController.signal`)生成 markdown
   - **quality 阈值检查**(M15 v3):
     - 抽出 facts < 5 条 → `[regen:quality-fail: too-few-facts]` + `.partial`(防 LLM 抽取失败时空跑通过)
     - JSON 解析失败 → `[regen:quality-fail: parse-error]` + `.partial`
     - facts ≥ 5 → 跑 `quality.judgeAll(generated, facts)`
   - **fidelity threshold**:openspec source 默认 0.9(brownfield 同);**superpowers source 默认 0.6**(从零生成,保真期望低,文档 §6.2 明示)
   - 通过 → 落地;失败 → `.partial-<artifact>.md` + 标 `[regen:quality-fail: low-fidelity]`
7. **AbortController 路径**(M14):写盘前 `if (abortController.signal.aborted) return; .partial 残留`;LLM 请求若已发出,Anthropic SDK 调用通过 `AbortSignal` 取消(**要求 `@anthropic-ai/sdk` ≥ 0.27.0**,该版本起官方支持 AbortSignal;package.json 锁定该版本下限)

**用户拒绝 ack**:`regenEnabled = false`;退化纯结构搬运 + transformer + `[needs-fix]`;exit 0。

**dry-run + regenerate 互斥**:`--dry-run` 时 regenerate 不执行(估价仍打印),走 stdout 报告。

---

## 3. 错误处理

### 3.1 阶段化失败矩阵(v2 增删)

| 阶段             | 失败场景                                          | 处理                                                                                                                | exit code |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| **detect**       | 指定 source 目录不存在                            | 报错 + 列 cwd 找到的源(若有,提示用户改参数)                                                                       | 2         |
| **detect**       | source 部分存在(只 specs/ 缺 changes/)         | warn + 当作 partial source 继续 scan                                                                                | 0         |
| **detect**       | ~~同时找两源退出~~(v2 删除)                    | source 显式给定时不 abort;只 warn 提示另一源未迁移                                                                  | 0         |
| **scan**         | source 全空(零产物,codex #15)                   | exit 2 + 提示"无可迁移文件,确认路径或 source 类型"                                                                  | 2         |
| **scan**         | yaml parse 失败(openspec/config.yaml)          | warn + 跳过 config.yaml 合并,其他产物继续                                                                          | 0         |
| **scan**         | 文件读权限失败                                    | 单文件 warn + plan 标 `[skip:read-fail]`,**不中断**                                                                | 0         |
| **scan**         | superpowers 文件名无 design/plan 后缀锚定         | 单文件归类 `unrecognized`,plan 表显式列出                                                                           | 0         |
| **classify**     | 不在 git 仓库内                                   | 信号 2 失效;只用信号 1(checkbox)+ 信号 4(marker);信号 3(mtime)只展示不参与默认                                | 0         |
| **classify**     | plan.md 没 checkbox                               | 信号 1 失效;若 git/marker 也无 → 默认 active                                                                        | 0         |
| **classify**     | 同 slug 多 date 重复(superpowers)              | report 标 `[ambiguous-slug]` + 用户挑                                                                              | 0         |
| **classify**     | slug 命中保留名 / 含 `..`(codex #39)             | 标 `[unsafe-slug]`,跳过该件;**v3:unsafe-slug 件数 / 总件数 ≥ 50% → exit 4 + 提示用户审 slug 命名**(防全部跳过产空 forge/) | 0 / 4    |
| **classify**     | M13 archive 完整性不可达 + 交互模式               | prompt "降级 active 还是跳过?";用户选则按选项执行                                                                  | 0         |
| **classify**     | M13 archive 完整性不可达 + `--no-interactive`     | abort + 提示用户改用交互模式或 `--regenerate`                                                                       | 4         |
| **scan**         | 文件含 BOM / 非 UTF-8 编码                        | 标 `[skip:encoding-not-utf8]`;非阻塞                                                                                | 0         |
| **conflict**     | `--imported-99` 全占                              | 取消整次 migrate                                                                                                    | 4         |
| **conflict**     | 全冲突且 `--no-interactive`                       | 输出冲突清单 + 建议 `--force` 或手动清,**中止**                                                                    | 4         |
| **conflict**     | copy 阶段撞 plan 阶段未预期冲突(M7)             | journal rollback + 释放 lock + 提示重跑                                                                            | 4         |
| **transform**    | 单件 transformer 抛错(理论不应,纯字符串规则)   | warn + 落原内容 + 标 `[transform-error]`,继续                                                                       | 0         |
| **validate**     | transform 后 validate 失败                        | 标 `[needs-fix: ...]`,**不阻塞**;`--regenerate` 开则后续接管                                                       | 0         |
| **archive 完整性(M13)** | 推测 archive 但缺件且 regen 关闭 / 失败  | 降级 active + warn;archive 落点永不带 `[needs-fix]` / `.partial`                                                   | 0         |
| **copy**         | cp 中途 IO 失败(磁盘满 / 权限)                  | journal rollback;源完整;不留半残 forge/                                                                          | 5         |
| **regenerate**   | ack 用户拒绝 / 输错 token                         | regenEnabled=false 退化;report 标 `[regen:declined]`                                                              | 0         |
| **regenerate**   | budget 超阈值且用户取消                           | 同上                                                                                                                | 0         |
| **regenerate**   | Anthropic SDK 网络 / API 错误                     | 单件 `.partial-<artifact>.md` + 标 `[regen:network-error]`,继续下一件                                              | 0         |
| **regenerate**   | quality 抽 facts < 5 条 / JSON 解析失败(M15 v3)| 标 `[regen:quality-fail: too-few-facts]` 或 `[parse-error]`,**不视为通过**,文件保留为 `.partial`                  | 0         |
| **regenerate**   | quality judge 抽样保真率不达标                    | 标 `[regen:quality-fail: low-fidelity]`,文件保留为 `.partial`                                                      | 0         |
| **regenerate**   | 生成 markdown 不符合 forge validate              | 标 `[regen:invalid-format]`,`.partial` 保留                                                                        | 0         |
| **regenerate**   | SIGINT(M14)                                      | abortController.abort();已发请求若 Anthropic SDK 支持 AbortSignal 则取消;否则进程退出 promise 仍 resolve;**写盘前二次检查 aborted flag**,跳过写;`.partial` 残留 | 0  |
| **report**       | 磁盘满写不了 forge/migrate-report.md              | **降级**:不再承诺"必出";尽力 stderr 输出完整 plan + trace JSON 内容                                               | 5         |

### 3.2 三个不变量(v2 修订)

1. **源目录绝不动**(默认 cp 不 mv)
2. **forge/ 半残禁止**:cp 阶段失败必须 journal rollback;regenerate 阶段失败允许 `.partial` 残留;**archive 子目录永远完整**(M13)
3. **report 尽力输出**:磁盘正常时写到 `forge/migrate-report.md`;磁盘满 / IO 失败时降级为 stderr 输出 trace JSON

### 3.3 锁与中断

- **LockMode 'migrate' 已扩展**(codex #21);改 `src/core/archive/lock.ts:LockMode` union + `LockHeldError` 文案泛化为"another forge operation is in progress (mode: <mode>)"
- 锁文件 `forge/.cache/migrate.lock`(注:复用 `.cache/` 与 `archive.lock` / `legacy-bridge.lock` 同 dir)
- SIGINT:
  - cp 阶段:journal rollback + 释放 lock
  - regenerate 阶段:abortController + 写盘前二次检查;`.partial` 残留
- 锁残留(进程 crash):`acquireLockByPath` 现有 stale-pid 检测自动处理

### 3.4 report 与 trace 格式

**`forge/migrate-trace.json`** v1 schema(M14:journal 模式):

```json
{
  "version": 1,
  "source": "openspec",
  "sourceRoot": "/abs/path/openspec/",
  "ts": "2026-05-10T14:32:00Z",
  "ackToken": "FORGE-MIGRATE-ACK-...",
  "ops": [
    {
      "from": "openspec/specs/auth/spec.md",
      "to": "forge/specs/auth/spec.md",
      "kind": "spec",
      "transform": ["h4-to-h2-scenario", "list-prefix-strip"],
      "validate": "ok",
      "regen": null,
      "writtenAt": "2026-05-10T14:32:01.123Z"
    }
  ],
  "conflicts": [
    { "target": "forge/changes/add-foo/", "rename": "forge/changes/add-foo--imported/" }
  ],
  "downgrades": [
    { "change": "feature-x", "from": "archive", "to": "active", "reason": "M13: missing proposal" }
  ],
  "cleanupHint": "git rm -r openspec/"
}
```

**journal 写入流程**(M14 v3):
1. 主流程开头:打开 `forge/migrate-trace.json.ndjson`(append 模式)
2. 每个 op 完成后:`fs.writeSync(fd, JSON.stringify(opEntry) + '\n') + fs.fsyncSync(fd)`(NDJSON 行式 + 立即 fsync;一行一 op,reader 容错好)
3. 末态:扫描全部 NDJSON 行 → 在内存 reformat 为合法 JSON 对象 → 写入新文件 `forge/migrate-trace.json.tmp` → `fs.rename('migrate-trace.json.tmp', 'migrate-trace.json')`(POSIX 原子)→ `fs.unlink('migrate-trace.json.ndjson')` 删 journal
4. **crash 时机的兜底状态**:
   - crash 在 step 2(写 .ndjson 中):reader 看到 `.ndjson` 存在;直接读取,容忍最后一行可能 truncate(NDJSON parser 跳过坏行);基于已写 op 行做反向 rollback
   - crash 在 step 3 reformat 中(.tmp 半残):reader 看到 .ndjson + .tmp 共存;**忽略 .tmp**(tmp 后缀语义已损);用 .ndjson 做权威源
   - crash 在 step 3 rename 后 unlink 前:reader 看到 .json + .ndjson 共存;**优先 .json**(已是末态合法 JSON);.ndjson 残留可手动删
   - crash 在 step 3 unlink 后:正常完成态,只有 .json
5. reader 优先级:`.json` > `.ndjson` > `.tmp`(忽略)

**关键:用户永远不会面对"双格式半残文件"**(reader 算法有明确优先级与 fallback)。

**`forge/migrate-report.md`**(人读;格式同 v1 + 加 downgrades 段)

---

## 4. 测试策略

### 4.1 测试分层

| 层     | 文件                                       | 用途                                                                                                  |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 单元   | `tests/migrate/markdown-aware.test.ts`     | walker 状态机:fenced code block 识别(```、~~~、缩进 4 空格 indent block);table-row 识别;嵌套 fence  |
| 单元   | `tests/migrate/archive-detect.test.ts`     | 信号 1(checkbox + 总数 ≥ 3)、信号 2(word-boundary + slug 共同命中)、信号 4(marker);git fixture     |
| 单元   | `tests/migrate/conflict.test.ts`           | `--imported-N` 递增 plan 阶段全锁定;copy 阶段撞冲突 rollback;`--force` trash;config.yaml.imported-N    |
| 单元   | `tests/migrate/report.test.ts`             | report.md / trace.json journal 写入;downgrades 段;summary 计数                                      |
| 单元   | `tests/migrate/sources/openspec.test.ts`   | OpenSpec transform 全规则(包含代码块跳过 / 表格跳过 / 多行 list 续行 / 三层 task)                    |
| 单元   | `tests/migrate/sources/superpowers.test.ts` | superpowers transform:`Step 1` + `Step 1.1` 同存;中文冒号 `：`;`STEP` 大写;slug 安全归一化         |
| 单元   | `tests/migrate/ack.test.ts`                | migrate 专属 prompt 文案不含 brownfield 字串;ack 写到 `.forge-ack/migrate-<ts>.yaml`                |
| 单元   | `tests/migrate/budget.test.ts`             | migrate cost 估算(按件长度 + token);MIGRATE_WARN_USD 阈值                                          |
| 单元   | `tests/migrate/quality.test.ts`            | 空 facts → fail(M15);source-bundle 拼接;judge 多轮 mock                                            |
| 集成   | `tests/migrate/openspec.test.ts`           | OpenSpec fixture(`--no-regenerate`);断言 archive 件 validate 全通过;含 [needs-fix] 件不进 archive   |
| 集成   | `tests/migrate/superpowers.test.ts`        | superpowers fixture + git;active/archive/draft 落点;archive 缺件降级 active 行为(M13)              |
| 集成   | `tests/migrate/regenerate.test.ts`         | mock SDK 全链路:extractFacts → 30 judge calls → 空 facts → AbortController 中断                     |
| CLI    | `tests/cli/migrate.test.ts`                | exit code(0/2/4/5);dry-run 不写 forge/;bundled 自动退化 warn                                        |

### 4.2 Fixture 树(v2 加覆盖反例)

```
tests/fixtures/migrate/
├── openspec-minimal/                            # 给 openspec.test 用
│   └── openspec/
│       ├── specs/
│       │   ├── foo/spec.md                      # H4 Scenario + list-prefix WHEN/THEN(基础)
│       │   ├── bar/spec.md                      # ★ 含代码块内 #### Scenario 示例(测 fenced 跳过)
│       │   └── baz/spec.md                      # ★ 表格列出 step;Description 段在 Requirement 下;多行 WHEN 续行
│       ├── changes/
│       │   ├── add-bar/{proposal.md, tasks.md, design.md}    # Why → Problem;tasks 数字编号
│       │   ├── three-level/tasks.md             # ★ 三层编号 1.2.3.
│       │   └── archive/old-baz/{proposal.md, tasks.md, design.md, specs/x.md}  # 完整 archive
│       ├── explorations/idea-x.md
│       └── config.yaml
├── superpowers-minimal/
│   ├── docs/superpowers/
│   │   ├── specs/2026-01-01-add-auth-design.md
│   │   ├── specs/2026-04-01-cleanup-deps-design.md
│   │   ├── plans/2026-01-01-add-auth-plan.md          # 全 [x],3+ tasks,含 **Step 1.1** 嵌套 + 中文冒号
│   │   ├── plans/2026-04-01-cleanup-deps-plan.md      # 部分 [x]
│   │   ├── plans/2026-03-01-orphan-plan.md            # plan-only;**STEP 1**(大写测)
│   │   └── plans/2026-02-01-single-task-plan.md       # ★ 1 task 100% 完成 → 不应自动 archive(< 3 tasks)
│   └── .git/                                  # commits:
│                                              #   "feat: implement add-auth" -- docs/superpowers/plans/2026-01-01-add-auth-plan.md
│                                              #   "close add-auth: ship feature"  ← 命中 word-boundary + slug
│                                              #   "docs: close-out the meeting notes"  ← 不应误命中(无 slug)
├── conflict-existing/
│   ├── openspec/changes/add-bar/proposal.md
│   ├── forge/changes/add-bar/proposal.md       # 触发 --imported
│   └── forge/changes/add-bar--imported/proposal.md  # 触发 --imported-2
├── unsafe-slug/                                # ★ NEW
│   └── docs/superpowers/specs/2026-01-01-..-design.md   # 命中 .. 保留 → unsafe-slug
└── regen-mocked/
    └── docs/superpowers/{specs,plans}/         # 配对 + 缺 proposal/specs 触发 --regenerate
```

### 4.3 关键断言点

**OpenSpec 集成测**(`--no-regenerate`):
- archive 件全 [ok](M13);任一 [needs-fix] 件不在 archive 子目录
- 代码块内 `#### Scenario` 字串保留原样(transformer 没改)
- 多行 WHEN 续行合并到单 `**When**` 行
- 三层编号 `1.2.3.` → `task-1-2-3:`
- `forge/migrate-trace.json` journal 模式:模拟 IO 失败后,trace 含已写部分 + rollback 记录

**superpowers 集成测**(`--no-regenerate`):
- `add-auth`(plan 全 [x] + git slug+close commit)→ 推测 archive,但缺 proposal/specs → **降级 active + warn**(M13);trace 含 downgrades 段
- `cleanup-deps` → active
- `orphan` → active 且 design 缺(只 tasks)
- `single-task`(1 task 100%)→ active(< 3 tasks 阈值)
- `..-design.md` → unsafe-slug skip
- tasks.md 含 `task-1: `、`task-1-1: `(嵌套);中文冒号已转英文;`STEP` 转 `task-`

**conflict 集成测**:
- 跑两次 → 第二次 add-bar→add-bar--imported,第三次 → add-bar--imported-2
- `--force` → 旧目标进 `forge/.forge-trash/<ts>/`
- `forge/config.yaml.imported` 已存在 → 升级 `.imported-2`

**regenerate 集成测**(v3 — facts 目标分桶 + 阈值):
- mock SDK call 分层:
  - `extractMotivationFacts(design.md)` × N 件(每件 mock 返回 8/3/12 条 — 测 < 5 阈值触发)
  - `extractBehaviorFacts(tasks.md)` × N 件
  - `judgeSingleFact` 每件 8/12 个 mock(<5 件不进 judge,直接 fail)
- 验证:返 3 条 facts 的件 → `[regen:quality-fail: too-few-facts]` + .partial(测 M15 阈值)
- 验证:某件 extractFacts 返非合法 JSON → `[regen:quality-fail: parse-error]` + .partial
- AbortController 中断:第 N 个 judge 时发 SIGINT;abortController.signal.aborted=true;后续写盘跳过
- bundled + openspec source(env 变量模拟)→ warn + 退化 --no-regenerate
- bundled + superpowers source + `--no-interactive` → exit 4 + 提示用户改用完整 plugin
- bundled + superpowers source + 交互模式 + 用户拒绝 prompt → exit 0
- M13 `--no-interactive` archive 完整性不可达 → exit 4

### 4.4 CI 兼容

- 所有 fixture 用 `path.join`
- `vitest.global-setup.ts` 加 hook:对每个 fixture 跑 `git init` + 写预设 commit
- `pnpm format:check` 必跑
- 覆盖率门槛:`archive-detect.ts ≥ 90%`、`markdown-aware.ts ≥ 90%`、`conflict.ts ≥ 85%`、`quality.ts ≥ 85%`

---

## 5. 复用与新增模块清单

### 5.1 复用边界(v3:只复用 redact + 扩 lock union 不动文案)

| legacy-bridge / archive 模块 | migrate 用途 | 修改 |
|------------------------------|--------------|------|
| `legacy-bridge/redact.ts:redact + DEFAULT_REDACT_RULES + RedactReport + formatRedactReport` | --regenerate 跑 redact;字符串处理无 brownfield 耦合 | 不改 |
| `archive/lock.ts:acquireLockByPath` | 锁 `forge/.cache/migrate.lock` | **改**(v3 最小化):`LockMode` union 加 `'migrate'`;**LockHeldError 文案保持现状**("another forge archive is in progress (pid ..., mode ..., started ...)";migrate 触发时 mode 字段写 'migrate' 即可,文案稍别扭但兼容现有 `tests/core/archive/lock.test.ts:188` 与 `tests/cli/archive.test.ts:516` 断言,**不改测**) |
| `parse/markdown.ts:parseMarkdown` | 复用 ATX section 切分(non-fenced) | 不改;`markdown-aware.ts` 在其上加状态机 |

**不复用**(v1 那条全反向调路径删除):
- `legacy-bridge/ack.ts` — 路径硬编码 `.cache/llm-ack.yaml`、文案 brownfield(codex #23/#24)
- `legacy-bridge/budget.ts:estimateRegenerateCost` — 签名 `anchorCount` + 4-role 公式硬编码(codex #25)
- `legacy-bridge/quality-judge.ts:extractFactsFromOriginal/judgeAllFacts` — 空 facts 假通过(codex #27)+ 假设有原文(codex #26)

migrate 自实现版本见 §5.2。

### 5.2 新增模块清单

| 路径                                                     | 内容                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/core/migrate/index.ts`                              | `runMigrate(sourceId, opts)` 主流程编排                                                                          |
| `src/core/migrate/types.ts`                              | `MigrateSource` 接口、`ScanResult`、`ClassificationPlan`、`CopyOp`、`MigrateReport`、`ArtifactKind` 等           |
| `src/core/migrate/conflict.ts`                           | 同名 `--imported-N` 递增 plan 阶段全锁定;copy 阶段撞冲突 rollback;`--force` trash;config.yaml.imported-N         |
| `src/core/migrate/archive-detect.ts`                     | 推测引擎;严格 keyword + word boundary + slug 共同命中;critical-task-pending 检查                                 |
| `src/core/migrate/markdown-aware.ts`                     | walker:逐行扫描 + fenced code block 状态机 + table-row 跳过                                                       |
| `src/core/migrate/report.ts`                             | report.md / trace.json journal 写入(NDJSON 行式 + 末态 reformat)                                                |
| `src/core/migrate/ack.ts`                                | migrate 专属 opt-in prompt + ack 文件读写(`forge/.forge-ack/migrate-<ts>.yaml`)                                  |
| `src/core/migrate/budget.ts`                             | migrate 专属 cost 估算(按件长度 + token,不用 brownfield 4-role 公式);MIGRATE_WARN_USD = $5                    |
| `src/core/migrate/quality.ts`                            | **facts 目标分桶**(v3):`extractMotivationFacts(design)` 喂 proposal 校验、`extractBehaviorFacts(tasks)` 喂 specs 校验、`extractFacts(content)` 给 OpenSpec 已有件;facts < 5 / JSON parse fail → 强制 fail;superpowers fidelity 阈值 0.6 |
| `src/core/migrate/regenerate.ts`                         | --regenerate 主流程;调本模块 ack/budget/quality;复用 redact;AbortController 串通                                |
| `src/core/migrate/sources/openspec.ts`                   | OpenSpecSource;§2.1 目录映射 + §2.5 transformer(走 markdown-aware.ts walker)                                    |
| `src/core/migrate/sources/superpowers.ts`                | SuperpowersSource;§2.2 配对 + §2.6 transformer(走 markdown-aware.ts walker)                                      |
| `src/core/migrate/sources/index.ts`                      | source registry                                                                                                  |
| `src/cli/commands/migrate.ts`                            | commander 子命令骨架                                                                                              |

### 5.3 改动模块清单

| 路径                                | 改动                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/core/archive/lock.ts`          | LockMode union 加 `'migrate'`;**LockHeldError 文案保持原样**(v3 修订:不再"泛化",保兼容现有测断言) |
| `src/cli/index.ts`                  | 注册 `migrate` 子命令                                                                                |
| `src/index.ts` 顶层 export         | 公开 `runMigrate`(供 plugin commands.md 后续可能调用)                                               |
| `package.json`                      | `dependencies.@anthropic-ai/sdk` 锁定 ≥ 0.27.0(支持 AbortSignal,M14)                              |

---

## 6. 用户视角文档

### 6.1 README 加段(简版,与 v1 同)

```md
## 从已有项目搬过来

forge migrate openspec       # 默认 --regenerate(LLM 补缺件,会显示估价)
forge migrate superpowers    # 同上;design+plan 配对成 forge change

加 --no-regenerate 跳过 LLM,只搬结构 + 跑 markdown-aware transformer;失败件标 [needs-fix]。
注:bundled plugin 中 --regenerate 不可用,自动退化为 --no-regenerate。
```

### 6.2 `docs/migration/from-openspec.md` + `docs/migration/from-superpowers.md`

详细文档:迁移前要做啥、估价怎么读、`[needs-fix]` 怎么补、cleanup 建议、archive 降级机制(M13)、bundled 限制(M16);~每篇 ≤ 350 行。

---

## 7. 风险与未决项

### 7.1 风险

| 风险                                                                                                | 缓解                                                                                                                |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| markdown-aware walker 对未知 markdown 变体(setext heading `===`、HTML embed)处理不全               | walker 只识别 ATX + fenced + table;其他保留原样;单元测覆盖已知 + best-effort 说明                                  |
| **markdown-aware walker 不识 indented code block(4 空格缩进 / Tab)**(v3 新加,Opus A5)            | 文档明示用户**不要用 4 空格 indented code 写示例**(用 fenced 替代);若已有,接受可能误改                            |
| **OpenSpec 表格内 GWT step**(罕见,Opus 接受 #8)                                                  | walker 跳过 table-row,接受不转换;文档说明用户改 list 形式                                                          |
| **task 父子语义降级**(`Step 1` 与 `Step 1.1` → 扁平 `task-1` / `task-1-1`,forge tasks parser 实测不识别父子,Opus 接受 #12) | 接受降级;文档明示;若 v0.x 后续 forge 加父子识别,migrate 走它的输出                                              |
| LLM regenerate 成本超预期                                                                           | budget gate 二次确认;MIGRATE_WARN_USD 阈值 $5;`--no-regenerate` 退化                                                |
| **Anthropic SDK AbortSignal 取消能力**(v3 锁版本)                                                 | `package.json` 锁定 `@anthropic-ai/sdk ≥ 0.27.0`(该版本起官方支持 AbortSignal);写盘前二次检查 aborted flag;最坏 LLM 已生成内容被丢 |
| superpowers 配对算法对边角文件名(`feature-design-v2.md`、奇怪 slug)失效                           | unrecognized 列出让用户决定;非阻塞                                                                                  |
| migrate 跑完后用户跑 `forge archive` 失败(因 [needs-fix] 件)                                       | 文档明示;archive 错误信息引导重跑 migrate --regenerate 或手补                                                       |
| **superpowers regen fidelity threshold 0.6(< brownfield 0.9)**(v3 新加,因从零生成保真期望低)     | 文档 §6.2 明示;集成测断言 0.6 阈值;若用户调高触发更多 .partial,引导手补                                            |
| **bundled + superpowers 不静默退化**(v3 新加,Opus A4)                                            | M16:`--no-interactive` abort + 提示用户改用完整 plugin;交互模式 plan 表前置 prompt                                |
| **archive 完整性不可达不静默降级**(v3 新加,Opus A6)                                              | M13:`--no-interactive` abort + exit 4;交互模式 prompt "降级 active 还是跳过?"                                     |

### 7.2 未决项 / NOT 实现

- **M12** `forge migrate --rollback`:trace.json schema 留好,后续 PR 实现
- **M7** `.forge-trash/` 24h GC:`forge migrate --gc` stub
- 第三方源(magic、claude-flow):接口已抽象,加新 adapter 即可
- 高级 archive 推测:LLM 介入推测(读 plan / git log)— 现阶段纯启发式

### 7.3 与 forge upgrade 的关系

`forge upgrade`(v0.2 → v0.3 自升级)与 `forge migrate`(框架→forge 搬运)**完全独立**:
- upgrade 处理 forge 自身版本演进的 STASH + 5 阶段事务
- migrate 处理外部框架产物搬入,默认 cp 不动源,半残禁止
- 两者不共用代码;锁机制都用 `acquireLockByPath` 但不同 mode + 不同 lock 文件
- 推荐顺序:**先 upgrade(forge 自身到位)→ 再 migrate(搬入外部产物)**

---

## 8. 实施路线图(v2 重估,8.5 → 14 工日)

| 阶段 | 内容                                                                                                                | 估算工作量 |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| P1   | 骨架:types.ts + sources/{index,openspec,superpowers}.ts 空实现 + cli/migrate.ts + 单测占位 + LockMode 扩展         | 1 day      |
| P2   | OpenSpecSource(scan + classify + prepareCopy + markdown-aware transformer);单元 + 集成测;**含 markdown-aware.ts** | **3 days** |
| P3   | SuperpowersSource(配对 + slug 安全 + archive-detect 严格化 + transformer);单元 + 集成测                           | **3 days** |
| P4   | conflict.ts plan 阶段全锁定 + copy 撞冲突 rollback;**report.ts journal NDJSON + 原子 rename + reader 优先级算法**(M14 v3) | **1.5 day**|
| P5   | regenerate 完整路径:**ack.ts + budget.ts + quality.ts(facts 目标分桶 extractMotivation/Behavior/Facts 三套 prompt + facts < 5 阈值 + JSON parse fail + superpowers 0.6 fidelity)+ regenerate.ts + AbortController + .partial + mock 分层全链路** | **4.5 days** |
| P6   | CLI 端到端测;README + docs/migration/from-*.md(含 M13 / M16 / 0.6 fidelity / bundled 限制说明)                       | 1 day      |
| P7   | release-gate-checklist 加 §4 v0.4 段;CHANGELOG 写迁移说明                                                          | 0.5 day    |

总计:**14.5 工日**(原 8.5 → v2 14 → v3 14.5,P5 因 facts 目标分桶 + reader 优先级算法 +0.5d)。版本目标:`v0.4.0`;若分版本:`v0.4.0` OpenSpec(P1-P2-P4-P6-P7,~7 工日)+ `v0.4.1` superpowers + LLM(P3 + P5,~7.5 工日)。

---

**文档结束**(v3)。已采纳 codex 第一轮 40 条 + Opus subagent 自检 12 条新发现。后续步骤:codex 第二轮对抗性审查;若 v3 通过,转 writing-plans skill 产 implementation plan。
