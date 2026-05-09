# Forge Migrate(openspec / superpowers 项目搬运)设计文档

- **作者**:msc(由 Claude Opus 4.7 协助 brainstorming)
- **日期**:2026-05-10
- **状态**:草案,待用户审阅
- **关联**:
  - 主 spec [`2026-05-04-forge-fusion-design.md`](2026-05-04-forge-fusion-design.md)(forge 工作目录契约 + skill/command 体系)
  - v0.3 plugin 设计 [`2026-05-09-v0.3-plugin-migration-design.md`](2026-05-09-v0.3-plugin-migration-design.md)(plugin 形态)
  - brownfield 设计 [`2026-05-05-brownfield-onboarding-design.md`](2026-05-05-brownfield-onboarding-design.md)(legacy-bridge 工具复用)

---

## 0. 决策快照

| #   | 决策                          | 选项 / 备注                                                                                                                                                                                            |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | 场景定位                      | **搬运用户已有项目仓库**(`openspec/` 或 `docs/superpowers/{specs,plans}/`)→ forge 工作目录;不做"双读 fallback",不做"上游同步追新"                                                                    |
| M2  | superpowers 源含义            | 用户仓库被 superpowers plugin 用过的产物(`docs/superpowers/specs/<date>-<topic>-design.md` + `docs/superpowers/plans/<date>-<topic>-plan.md`)                                                          |
| M3  | 迁移类型(双档)              | 默认走纯结构搬运 + transformer;`--regenerate` 调 LLM 补缺件。**两源默认都开 `--regenerate`**(经实测两源都缺关键件,关默认体验差);`--no-regenerate` 反向关闭                                            |
| M4  | CLI 入口                      | 独立 `forge migrate <source>`(不扩 `legacy-bridge`,语义不混)                                                                                                                                         |
| M5  | superpowers 落点              | design+plan 配对包成 `forge/changes/<slug>/{design.md, tasks.md}`;**不写 placeholder**;缺 proposal/specs 由 `--regenerate` 补,关闭则 `[needs-fix]`                                                    |
| M6  | 已归档判定                    | 交互确认表 + 自动推测(plan checkbox 完成度 ≥ 95% **或** `git log` commit msg 含 close/complete/done/finish/archive 关键词);非交互模式用推测默认值                                                     |
| M7  | 目标冲突                      | 默认 merge,同名加 `--imported` 后缀(再撞则递增 `--imported-2`);`--force` 旧目标先 mv 到 `.forge-trash/<ts>/` 留 24h 兜底                                                                              |
| M8  | 源处理                        | 默认 cp 不动源(源目录原样保留);写 `forge/migrate-report.md` + `forge/migrate-trace.json` + 输出 `git rm -r <source>/` cleanup 建议                                                                    |
| M9  | LLM 复用                      | 反向调 `src/core/legacy-bridge/{ack,budget,redact,quality-judge}` 工具函数(不扩 legacy-bridge 命令);ack token 写 `.forge-ack/migrate-<ts>.ack`                                                        |
| M10 | 内容格式 transformer          | source adapter 加 `transform(content, kind) -> string`,纯字符串规则;OpenSpec 处理 H4→H2 Scenario / list 前缀 / Why-What rename / tasks 标号;superpowers 处理 `**Step N**:` → `task-N: ` / 中→英冒号 |
| M11 | validate 后处理               | transform 后跑对应 `validateXxx`,**通过标 `[ok]`,失败标 `[needs-fix: <字段> <消息>]`,不阻塞**;`--regenerate` 路径在 transform+validate 之后接管缺件 + `[needs-fix]` 件                                |
| M12 | rollback                      | 本 spec **不实现** `forge migrate --rollback` 子命令;`migrate-trace.json` 结构留好供 v0.x 后续扩展                                                                                                     |

---

## 1. 顶层架构

### 1.1 模块组织

```
src/core/migrate/                       ← ★ NEW
├── index.ts                            ← 对外导出 + runMigrate(主流程编排)
├── types.ts                            ← MigrateSource 接口、ScanResult、ClassificationPlan、CopyOp、MigrateReport 等
├── conflict.ts                         ← 同名加 `--imported` 后缀递增 + `--force` trash 路径
├── archive-detect.ts                   ← 已归档推测引擎(checkbox 完成度 + git log close/done 关键词)
├── report.ts                           ← migrate-report.md / migrate-trace.json 生成器
├── regenerate.ts                       ← --regenerate 路径,反向调 legacy-bridge 工具
└── sources/
    ├── index.ts                        ← registry: 'openspec' | 'superpowers' → MigrateSource
    ├── openspec.ts                     ← OpenSpecSource(同构映射 + transformer)
    └── superpowers.ts                  ← SuperpowersSource(配对 + slug 推断 + transformer)

src/cli/commands/
└── migrate.ts                          ← ★ NEW:commander 子命令骨架,解析参数 → 调 runMigrate

tests/migrate/                          ← ★ NEW
├── archive-detect.test.ts              ← 推测引擎纯函数测
├── conflict.test.ts                    ← 同名后缀递增 + trash 路径
├── report.test.ts                      ← report 渲染快照
├── openspec.test.ts                    ← OpenSpec fixture 集成测
├── superpowers.test.ts                 ← superpowers fixture 集成测
└── regenerate.test.ts                  ← mocked Anthropic SDK 集成测

tests/cli/migrate.test.ts               ← ★ NEW:CLI 端到端
tests/fixtures/migrate/                 ← ★ NEW:四套 fixture 树(详见 §4.2)
```

### 1.2 `MigrateSource` 接口契约

两个 source adapter 实现同一接口;新增第三方源(magic、claude-flow 等)只需加新 adapter,不改主流程:

```ts
// src/core/migrate/types.ts
export interface MigrateSource {
  /** source 标识,用于 CLI 参数 + report 标记 */
  readonly id: 'openspec' | 'superpowers';

  /** 1. 检测 cwd 是否有该源,返回检测结果 + 完整源根路径 */
  detect(cwd: string): Promise<DetectResult>;

  /** 2. 扫描所有源产物,返回原始清单(尚未分类) */
  scan(rootPath: string): Promise<ScanResult>;

  /** 3. 推测每条产物归类:active / archive / draft / spec / skip
   *  - 内部调 archive-detect 的 git+checkbox 推测
   *  - ctx 提供 git client、cwd、用户参数(--archive-list 等) */
  classify(scan: ScanResult, ctx: ClassifyCtx): Promise<ClassificationPlan>;

  /** 4. 把 plan 翻译成具体 copy 操作(cp + 可选 rename)
   *  - 不在此处写盘,只产 op 列表给 runMigrate 顺序执行 */
  prepareCopy(plan: ClassificationPlan, target: string): CopyOp[];

  /** 5. 内容格式 transformer,纯字符串规则
   *  - kind:'spec' | 'proposal' | 'tasks' | 'design' | 'config' | 'draft'
   *  - 实现细节见 §2.5(OpenSpec)与 §2.6(superpowers) */
  transform(content: string, kind: ArtifactKind): string;

  /** 6.(--regenerate 时用)产出每个 change 缺哪些件,供 regenerate.ts 调 LLM 补 */
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
                       (默认 --regenerate 开启,触发 ack/budget gate)
  --dry-run            只扫描 + 出 plan + 写 report,不动文件
  --force              冲突时旧目标 mv 到 .forge-trash/<ts>/(留 24h 兜底)再覆盖
  --archive-list <f>   显式指定哪些 slug 进 archive,跳过自动推测(覆盖 --no-interactive 默认)
  --no-interactive     跳过 active/archive 交互确认表,全用推测默认值
  --redact-rules <f>   --regenerate 时附加自定义 redact 规则(沿用 legacy-bridge 格式)
```

CLI 子命令骨架 `src/cli/commands/migrate.ts` 用 commander,只做参数校验 + 错误码映射,主流程 `runMigrate(source, opts)` 在 `src/core/migrate/index.ts`。

### 1.4 主流程伪码

```
runMigrate(sourceId, opts):
  source = sources[sourceId]
  detect = source.detect(cwd)
  if !detect.found:                                # 见 §3 错误矩阵
    error('source not found at <expected-path>')

  acquireLock('forge/.migrate.lock')               # 复用 legacy-bridge lock
  try:
    scan = source.scan(detect.rootPath)
    plan = source.classify(scan, ctx)
    conflicts = conflict.check(plan, target='forge/')
    report.printPlan(plan, conflicts)              # 终端打印推测表

    if !opts.noInteractive:
      plan = askUserConfirm(plan, conflicts)       # 交互改 active/archive/draft/skip + 解决冲突

    # 默认 --regenerate(M3):两源都默认开
    regenEnabled = !opts.noRegenerate
    if regenEnabled:
      missing = listAllMissing(plan, source)
      cost = budget.estimateRegenerateCost(missing)
      ackOk = ackOptin(cost)                       # ack 流程,沿用 legacy-bridge ack
      if !ackOk:
        regenEnabled = false                       # 用户拒绝 → 退化纯结构搬运

    if opts.dryRun:
      report.write()
      return

    ops = source.prepareCopy(plan, target='forge/')

    onSigInt(rollbackCp(ops.donesoFar))            # Ctrl+C 回滚

    for op in ops:
      try:
        rawContent = read(op.source)
        transformed = source.transform(rawContent, op.kind)
        write(op.target, transformed)
        ops.donesoFar.push(op)
        validateResult = validate(op.target, op.kind)
        if validateResult.ok:
          report.mark(op, '[ok]')
        else:
          report.mark(op, '[needs-fix: ' + validateResult.message + ']')
      except IOErr:
        rollbackCp(ops.donesoFar)                  # 原子失败回滚已写
        error('cp failed at ' + op.target)

    if regenEnabled:
      regenerate.run({
        plan,
        source,
        ackToken,
        redactRules: opts.redactRules,
      })                                           # 内部 redact → SDK 调用 → quality-judge

    report.write('forge/migrate-report.md')        # 见 §3.3 格式
    trace.write('forge/migrate-trace.json')
    printCleanupHints(source.id)                   # 'git rm -r openspec/' 等
  finally:
    releaseLock()
```

---

## 2. 数据流细节

### 2.1 OpenSpec 源 — 目录映射

| 源                                       | 目标                                          | 备注                                                         |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `openspec/specs/<n>/spec.md`             | `forge/specs/<n>/spec.md`                     | 整目录 cp,保留 spec.md 单文件;**transform 见 §2.5**          |
| `openspec/changes/<n>/`(非 archive)      | `forge/changes/<n>/`                          | active change;含 `proposal.md` / `tasks.md` / `design.md` / `specs/` 子目录;**transform 各件按 kind** |
| `openspec/changes/archive/<n>/`          | `forge/changes/archive/<n>/`                  | OpenSpec 已有 `changes/archive/` 子目录约定                  |
| `openspec/explorations/<x>`              | `forge/drafts/<x>`                            | exploration 当 forge draft;不 transform(forge drafts 无 schema)|
| `openspec/config.yaml`                   | 见 §2.3                                       | 合并策略单独说                                                |

### 2.2 superpowers 源 — 配对 + slug 推断

**输入**:
- `docs/superpowers/specs/<date>-<topic>-design.md`
- `docs/superpowers/plans/<date>-<topic>-plan.md`

**配对算法**(`SuperpowersSource.scan`):
1. 读 `docs/superpowers/specs/` 全部 `*-design.md`,提取 pairing key = 文件名去 `-design.md` 后缀(如 `2026-04-15-add-auth-flow`)
2. 同样读 `plans/` 全部 `*-plan.md`,提取 pairing key
3. 同 key 两边都有 → design+plan 配对
4. 只在 specs/ 出现 → design-only(无 tasks.md)
5. 只在 plans/ 出现 → plan-only(无 design.md)
6. **change-id 取 `<topic>` 部分**(date 部分丢进 trace meta,不进 id);例:`2026-04-15-add-auth-flow` → change-id `add-auth-flow`

**已归档推测**(`archive-detect.ts`):
- 信号 1(强):plan.md 的 `[x]` checkbox 完成度 ≥ 95%
- 信号 2(强):`git log -- <plan.md path>` commit msg 含 close/complete/done/finish/archive 关键词(case-insensitive)
- 信号 3(弱):plan.md `mtime` ≥ 30 天(只在前两都不明确时参考)
- 推荐结果:
  - 信号 1 OR 信号 2 命中 → 推荐 archive
  - 都不命中 → 推荐 active
- report 表显示推测原因(`plan 14/14 [x], git: 1 close-commit` 这种字面信号串)

**落点表**(用户最终确认后):
| 用户确认                    | 目标                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| active                      | `forge/changes/<topic>/{design.md, tasks.md}`(有几个写几个,不写 placeholder)|
| archive                     | `forge/changes/archive/<topic>/{design.md, tasks.md}`                   |
| draft                       | `forge/drafts/<date>-<topic>-design.md` + `forge/drafts/<date>-<topic>-plan.md`(扁平保留)|
| skip                        | 不动                                                                    |

注:`plan.md` mv 时改名 `tasks.md`,内容**走 transformer**(见 §2.6)。

### 2.3 OpenSpec config.yaml 合并策略

| 场景                                | 处理                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `forge/config.yaml` 不存在          | 直接 cp + 在文件头加注释 `# imported from openspec/config.yaml @ <ISO ts>`            |
| `forge/config.yaml` 存在            | **不自动 merge**(schema 可能不兼容);写到 `forge/config.yaml.imported`;report 提示用户手动 review/合并 |

理由:openspec config.yaml 的 `rules.{specs,tasks,design}` 字段与 forge 同名,但内容形式可能不同(openspec 是行内列表,forge 也是行内列表但 wording 不同);自动合并风险大,留给用户手动操作。

### 2.4 冲突处理

| 场景                                                                | 处理                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `forge/<path>` 已存在(非 `--force`)                                | 目标改名加 `--imported` 后缀(`add-foo` → `add-foo--imported`)                                        |
| `--imported` 后缀也已被占                                           | 升级 `--imported-2`,递增直到唯一(测得 `--imported-99` 即取消整次 migrate,极端 case)                |
| `--force`                                                           | 旧目标先 mv 到 `forge/.forge-trash/<ts>/<path>`(不删,留 24h 兜底,沿用 forge upgrade STASH 风格);再写新内容 |
| `.forge-trash/` 内 24h 之外的旧条目                                 | `forge migrate --gc` 显式清理(本 spec 留 stub,实现可在 v0.x 后续 PR);**不自动清理**                  |

### 2.5 OpenSpec content transformer 规则

**spec.md**(冲突最严重的件):

| 规则                                                                  | 正则 / 替换                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 去 `### Requirement: <name>` 包装层(把内部 H4 Scenario 提到 H2)    | 删除所有 `^### Requirement:.*$` 行(保留下方内容,因为 H4 Scenario 会在下一步升到 H2)|
| `#### Scenario: <id>` → `## Scenario: <id>`                           | `^#### Scenario:` → `## Scenario:`                                |
| `- **WHEN** <text>` → `**When** <text>`(去 list 前缀 + 标题大小写)  | `^(\s*)- \*\*WHEN\*\*\s+(.+)$` → `$1**When** $2`                  |
| `- **THEN** <text>` → `**Then** <text>`                               | `^(\s*)- \*\*THEN\*\*\s+(.+)$` → `$1**Then** $2`                  |
| `- **GIVEN** <text>` → `**Given** <text>`(若有)                     | `^(\s*)- \*\*GIVEN\*\*\s+(.+)$` → `$1**Given** $2`                |
| `- **AND** <text>` / `- **BUT** <text>` 同上                         | 类推                                                              |

**注意**:Given 子句缺(隐式)时 transformer **不补**;forge `validateSpec` 会报 `missing Given` → 单 scenario 标 `[needs-fix: missing Given]`,该件其他 scenario 仍可能通过。

**proposal.md**:

| 规则                                                                | 正则 / 替换                          |
| ------------------------------------------------------------------- | ------------------------------------ |
| `## Problem` → `## Why`                                             | `^## Problem$` → `## Why`            |
| `## Proposed Solution` → `## What`                                  | `^## Proposed Solution$` → `## What` |
| 其他章节(`## User Experience` / `## Migration Path` 等)保留      | 不动(forge 允许额外章节)            |

**tasks.md**:

| 规则                                                                | 正则 / 替换                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `- [ ] N. <text>` → `- [ ] task-N: <text>`(数字编号补 `task-` 前缀 + 加冒号)| `^(\s*)- \[([ x])\] (\d+(?:\.\d+)?)\. (.+)$` → `$1- [$2] task-$3: $4`(`.` 进 task-id 时换 `-`)|
| 数字+点号格式不在(如 `- [ ] some prose`)                           | 不动,落 `[needs-fix]`                                                |

**design.md**:不 transform(forge 只 parse 不 validate;`parseDesign` 不抛即可)。

**specs/<area>.md** 在 changes/<n>/specs/ 下的 delta:同 `spec.md` 规则。

### 2.6 superpowers content transformer 规则

**plan.md → tasks.md**(实证 forge 自己 docs/plans/ 内 plan 格式 = `- [ ] **Step N**:`):

| 规则                                                                                  | 正则 / 替换                                                                            |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `- [ ] **Step N**[:|:]<text>` → `- [ ] task-N: <text>`(去加粗、统一标号、中→英冒号) | `^(\s*)- \[([ x])\] \*\*[Ss]tep (\d+(?:\.\d+)?)\*\*[:|:]\s*(.+)$` → `$1- [$2] task-$3: $4`|
| 嵌套 `**Step 1.1**` 的点号 → `-`                                                      | task-id 内 `\d+\.\d+` → `\d+-\d+`(在上一步替换时同步处理)                            |
| 大小写无关("step"、"Step"、"STEP" 都吃)                                              | 正则 flag `i`                                                                          |
| H1 title(`# Plan 1 — ...`)保留                                                       | forge tasks parser 也要 H1                                                             |
| 描述里的中文冒号 / 标点保留                                                           | 只换 task-id 后那一个                                                                  |

**design.md**:直接搬,不 transform(forge 只 parse 不 validate);唯一保险:无 H1 时不补 → 让 `parseDesign` 抛 → 标 `[needs-fix]`。

**proposal.md / specs/<area>.md**:**superpowers 没产这两件**,transformer 无东西可转;留给 `--regenerate` 路径调 LLM 补(见 §2.8),关闭则 report 标 `[needs-fix: missing proposal]` / `[needs-fix: missing specs]`。

### 2.7 validate 后处理

每个件 cp + transform 写盘后:
1. 按 kind 调对应 forge validator(`validateProposal` / `validateSpec` / `validateTasks` / `parseDesign`)
2. 通过 → report 标 `[ok]`
3. 失败 → report 标 `[needs-fix: <field>: <message>]`,**不阻塞**,继续下一件

**关键**:`[needs-fix]` 标记**不让 cp 失败**(目标文件已写到位),只是后续 `forge archive` 会拒绝走 archive 流程的提醒。用户两条出路:
- 手工编辑目标文件直到 validate 通过
- 重跑 `forge migrate <source> --regenerate`(LLM 补内容到合规)

### 2.8 `--regenerate`(默认开)路径

只在两源都默认开;用户加 `--no-regenerate` 才关。

**触发件**:
- superpowers 配对 active/archive change → 必触发(几乎都缺 proposal + specs)
- OpenSpec change → 仅当 transform 后跑 validate 失败时触发(几乎都通过)
- OpenSpec spec.md 缺 Given 子句 → 触发(LLM 补 Given 子句,不重写整 spec)

**流程**(沿用 legacy-bridge):
1. `listAllMissing(plan, source)` → 列出所有缺件 + 待补字段
2. `budget.estimateRegenerateCost(missing)` → 估 token 数 + USD
3. 终端打印估价;若 ≥ `REGEN_WARN_USD` 阈值,二次确认
4. `ack.renderOptinPrompt(...)` → 用户输入 ack token → 写 `.forge-ack/migrate-<ts>.ack`
5. 对每件:
   - `redact(content, rules)` → 跑默认 + 自定义规则(沿用 legacy-bridge `redact.ts`)
   - 调 Anthropic SDK 生成 markdown(model 沿用 forge config.yaml `llm.model`)
   - `quality-judge.extractFactsFromOriginal(originalContent)` + `judgeAllFacts(generated)` → critical 全抽 + 章节比例抽
   - 通过 → 写到目标(覆盖原 [needs-fix] 件)+ report 标 `[regen:ok]`
   - 失败 → 写 `<target>.partial-<artifact>.md` + report 标 `[regen:quality-fail]`(原 [needs-fix] 件保留)

**用户拒绝 ack**:`regenEnabled = false`,流程退化纯结构搬运 + transformer + [needs-fix] 标记;不抛错,exit 0。

---

## 3. 错误处理

### 3.1 阶段化失败矩阵

| 阶段             | 失败场景                                          | 处理策略                                                                                                                              | exit code |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **detect**       | 指定 source 目录不存在                            | 报错 + 列 cwd 找到的源(若有,提示用户改参数)+ 退出                                                                                  | 2         |
| **detect**       | 同时找到 openspec/ 与 docs/superpowers/           | **不自动选**,要求显式 `<source>`;退出                                                                                                | 2         |
| **detect**       | source 部分存在(只 specs/ 缺 changes/)         | warn + 当作 partial source 继续 scan                                                                                                  | 0         |
| **scan**         | yaml parse 失败(openspec/config.yaml)          | warn + 跳过 config.yaml 合并,其他产物继续                                                                                            | 0         |
| **scan**         | 文件读权限失败                                    | 单文件失败 → warn + plan 标 `[skip:read-fail]`,**不中断**                                                                            | 0         |
| **scan**         | superpowers 文件名无 date-topic 结构              | 单文件归类 `unrecognized`,plan 表显式列出让用户决定                                                                                   | 0         |
| **classify**     | 不在 git 仓库内                                   | git 信号失效;只用 checkbox + mtime 推测;report 标 `[git:not-available]`                                                              | 0         |
| **classify**     | plan.md 没 checkbox                               | checkbox 信号失效;只用 git + mtime;若都无 → 默认 active                                                                              | 0         |
| **classify**     | 同 slug 多 date 重复出现(superpowers)         | 全列出来让用户挑,report 标 `[ambiguous-slug]`                                                                                        | 0         |
| **conflict**     | `--imported-2..99` 全占                           | 取消整次 migrate,提示用户清理或手动操作                                                                                               | 4         |
| **conflict**     | 全部产物冲突且 `--no-interactive`                 | 输出冲突清单 + 建议 `--force` 或手动清,**中止**                                                                                      | 4         |
| **transform**    | 单件 transformer 抛错(理论不该,纯字符串规则)  | warn + 落原内容 + 标 `[transform-error]`,继续                                                                                        | 0         |
| **validate**     | transform 后 validate 失败                        | 标 `[needs-fix: ...]`,**不阻塞**;若 `--regenerate` 开,后续 regenerate 阶段接管                                                       | 0         |
| **copy**         | cp 中途 IO 失败(磁盘满 / 权限)                  | **原子回滚**:已 cp 的全删(用 trace 反向);源完整;不留半残 forge/                                                                  | 5         |
| **regenerate**   | ack 用户拒绝 / 输错 token                         | regenEnabled=false,流程退化;report 标 `[regen:declined]`;exit 0                                                                     | 0         |
| **regenerate**   | budget 超阈值且用户取消                           | 同上                                                                                                                                  | 0         |
| **regenerate**   | Anthropic SDK 网络 / API 错误                     | 单件失败 → 写 `.partial-<artifact>.md` + 标 `[regen:network-error]`,**继续下一件**                                                    | 0         |
| **regenerate**   | quality-judge 抽样失败                            | 同上,标 `[regen:quality-fail]`,文件保留为 `.partial`                                                                                 | 0         |
| **regenerate**   | 生成的 markdown 不符合 forge validate             | 标 `[regen:invalid-format]`,文件保留为 `.partial`                                                                                     | 0         |
| **report**       | 磁盘满写不了 forge/migrate-report.md              | stderr 输出完整 plan + trace JSON 内容,提示重定向到文件                                                                              | 5         |

### 3.2 三个不变量

1. **源目录绝不动**(默认 cp 不 mv,任何阶段失败都不影响源)
2. **forge/ 半残禁止**:cp 阶段失败必须原子回滚;`regenerate` 阶段失败允许 `.partial-<artifact>.md` 残留(因为 cp 已成功,regenerate 是增量增强)
3. **report 必出**:除非磁盘彻底坏,否则一定写出 report;report 是后续手工 cleanup / 重跑 / 排查的唯一权威

### 3.3 锁与中断

- 复用 forge 现有 `acquireLockByPath`(legacy-bridge 在用),锁文件 `forge/.migrate.lock`,持锁整 runMigrate 生命周期
- `LockHeldError` 文案沿用 legacy-bridge 风格(提示用户 `--gc` 或检查并发进程)
- `SIGINT`(Ctrl+C):
  - cp 阶段:已 cp 的回滚(捕 SIGINT 跑 trace 反向 rm)
  - regenerate 阶段:停在当前件,已写 `.partial` 保留;report 标 `[regen:interrupted]`
  - 所有阶段都释放 lock

### 3.4 report 与 trace 格式

**`forge/migrate-report.md`**(人读):

```markdown
# Migration Report — <source> @ 2026-05-10T14:32:00Z

## Summary
- Source: openspec(rootPath: /abs/path/openspec/)
- Mode: regenerate=on(LLM gate accepted)| structural-only | dry-run
- Total scanned: 54
- Classified: active=23, archive=18, draft=3, skipped=10
- Conflicts: 2(全部 rename --imported)
- validate 通过率: 41/44(标 [ok]),3 件 [needs-fix],regenerate 后补 2 件 [regen:ok],1 件 [regen:quality-fail]

## Plan
| Source path                                    | Target path                          | Class    | Conflict   | Validate              |
| ---------------------------------------------- | ------------------------------------ | -------- | ---------- | --------------------- |
| openspec/specs/auth/spec.md                    | forge/specs/auth/spec.md             | spec     |            | [ok]                  |
| openspec/changes/add-foo/proposal.md           | forge/changes/add-foo/proposal.md    | active   |            | [ok]                  |
| openspec/changes/archive/old-x/proposal.md     | forge/changes/archive/old-x/...      | archive  |            | [ok]                  |
| (sp) docs/.../2026-04-add-auth-design.md       | forge/changes/add-auth/design.md     | active   |            | [ok]                  |
| (sp) docs/.../2026-04-add-auth-plan.md         | forge/changes/add-auth/tasks.md      | active   |            | [needs-fix: nested]   |
| (sp) [missing] proposal.md                     | forge/changes/add-auth/proposal.md   | active   |            | [regen:ok]            |
| ...                                                                                                                                                  |

## Conflicts
- forge/changes/add-foo/ exists → renamed to forge/changes/add-foo--imported/
- forge/specs/cache/ exists → renamed to forge/specs/cache--imported/

## Cleanup suggestions
After review you may run:
  git rm -r openspec/

或者(superpowers):
  git rm -r docs/superpowers/{specs,plans}/

## Source-meta
Each migrated file maps to source-path in `migrate-trace.json`(同目录).
```

**`forge/migrate-trace.json`**(机器读):

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
      "regen": null
    },
    {
      "from": null,
      "to": "forge/changes/add-auth/proposal.md",
      "kind": "proposal",
      "transform": [],
      "validate": "ok",
      "regen": { "model": "claude-opus-4-7", "facts": 14, "passed": 14 }
    }
  ],
  "conflicts": [
    { "target": "forge/changes/add-foo/", "rename": "forge/changes/add-foo--imported/" }
  ],
  "cleanupHint": "git rm -r openspec/"
}
```

`migrate-trace.json` 结构 v1 保留,后续 `forge migrate --rollback` 子命令(M12 列为 NOT 实现)可基于此反向操作。

---

## 4. 测试策略

### 4.1 测试分层

| 层     | 文件                                  | 用途                                                                                                  |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 单元   | `tests/migrate/archive-detect.test.ts` | 推测引擎纯函数测;mock fs(读 plan.md checkbox)+ mock git(commit msg)+ mtime 三信号组合矩阵         |
| 单元   | `tests/migrate/conflict.test.ts`      | 同名后缀递增(`--imported` → `--imported-2`);`--force` 跑 trash 路径;trash 路径 24h 过期不自动清    |
| 单元   | `tests/migrate/report.test.ts`        | report.md / trace.json 渲染快照;summary 计数正确;cleanup hint 按源切分                              |
| 单元   | `tests/migrate/sources/openspec.test.ts` | OpenSpec transform 规则 6 条全覆盖(H4→H2、list 前缀去掉、Why-What rename、tasks 数字编号转 task-N、Given 缺保留)|
| 单元   | `tests/migrate/sources/superpowers.test.ts` | superpowers transform 规则:`**Step N**:` → `task-N: `;嵌套 `**Step 1.1**` → `task-1-1`;中→英冒号;大小写不敏感|
| 集成   | `tests/migrate/openspec.test.ts`      | 用 `tests/fixtures/migrate/openspec-minimal/` 跑 runMigrate(`--no-regenerate`)→ 断言 forge/ 树 + report 计数 |
| 集成   | `tests/migrate/superpowers.test.ts`   | `tests/fixtures/migrate/superpowers-minimal/` + git fixture 跑 runMigrate → active/archive/draft 落点正确;[needs-fix] 件准确 |
| 集成   | `tests/migrate/regenerate.test.ts`    | mocked Anthropic SDK + 真 redact / quality-judge / ack / budget;断言 .partial 件残留 + 成功件落地       |
| CLI    | `tests/cli/migrate.test.ts`           | commander 子命令端到端;断言 exit code(2/4/5/0)+ stdout 关键 token + dry-run 不写 forge/                                       |

### 4.2 Fixture 树

```
tests/fixtures/migrate/
├── openspec-minimal/                            # 给 openspec.test 用
│   └── openspec/
│       ├── specs/foo/spec.md                    # Has H4 Scenario + list-prefix WHEN/THEN
│       ├── changes/add-bar/{proposal.md, tasks.md, design.md}    # Why → Problem; tasks 数字编号
│       ├── changes/archive/old-baz/{proposal.md, tasks.md}
│       ├── explorations/idea-x.md
│       └── config.yaml
├── superpowers-minimal/                         # 给 superpowers.test 用
│   ├── docs/superpowers/
│   │   ├── specs/2026-01-01-add-auth-design.md
│   │   ├── specs/2026-04-01-cleanup-deps-design.md
│   │   ├── plans/2026-01-01-add-auth-plan.md         # 全 [x],含 **Step 1.1** 嵌套
│   │   ├── plans/2026-04-01-cleanup-deps-plan.md     # 部分 [x]
│   │   └── plans/2026-03-01-orphan-plan.md           # plan-only
│   └── .git/                                    # 提前 git init + 几个 commit:
│                                                #   "feat: implement auth flow"
│                                                #   "close add-auth: ship feature"  ← 关键词触发 archive
├── conflict-existing/                           # 给 conflict.test 用
│   ├── openspec/changes/add-bar/proposal.md
│   └── forge/changes/add-bar/proposal.md        # 已存在 → 触发 --imported
└── regen-mocked/                                # 给 regenerate.test 用
    └── docs/superpowers/{specs,plans}/          # 配对 + 缺 proposal/specs,触发 --regenerate
```

### 4.3 关键断言点(集成测)

**OpenSpec 集成测**(`--no-regenerate`):
- `forge/specs/foo/spec.md` 存在;内容含 `## Scenario:`(transform 后);**Given 缺的 scenario** 报 `[needs-fix: missing Given]`
- `forge/changes/add-bar/proposal.md` 含 `## Why` + `## What`(rename 后);validate `[ok]`
- `forge/changes/archive/old-baz/` 在 archive 子目录(不在 active);其内文件 transform 后 validate 至少 1 件 [ok]
- `forge/drafts/idea-x.md` 存在,内容未被 transform
- `forge/migrate-report.md` 包含 plan 表 + cleanup 建议
- `forge/migrate-trace.json` 反向映射齐;trace.ops 与 cp 实际一致

**superpowers 集成测**(`--no-regenerate`):
- `add-auth` 进 archive(plan 全 [x] + git commit 含 close)
- `cleanup-deps` 进 active(checkbox 不全 + 无 close commit)
- `orphan` 进 active 且 `tasks.md` 存在但 `design.md` 不存在(不写 placeholder)
- `tasks.md` 内含 `task-1: `、`task-1-1: `(嵌套);不含 `**Step` 残留;不含中文冒号
- 推测表打印含信号原因(`plan 14/14 [x], git: 1 close-commit`);快照测
- 三个 active change **均**带 `[needs-fix: missing proposal]` + `[needs-fix: missing specs]`

**conflict 集成测**:
- 跑两次同源 → 第二次目标改 `add-bar--imported/`,第三次改 `add-bar--imported-2/`;trace.conflicts 全记录
- `--force` → 旧目标进 `forge/.forge-trash/<ts>/`,新目标覆盖

**regenerate 集成测**(`tests/migrate/regenerate.test.ts`):
- 注入两个 mock Anthropic response:一个 quality-judge 通过、一个不过
- 断言成功件 `proposal.md` 落地;失败件 `.partial-proposal.md` 残留 + report 标 `[regen:quality-fail]`
- 跑 budget 估价 → 终端 stdout 含 `Estimated cost: $...`
- 用户拒绝 ack(注入 stdin "no")→ regenEnabled=false,流程退化;exit 0

### 4.4 CI 兼容

- 所有 fixture 用 `path.join` 拼路径(forge cross-platform 约束)
- `vitest.global-setup.ts` 加 hook:对每个 fixture 跑 `git init` + 写预设 commit(测 git log 信号)
- `pnpm format:check` 必跑;tests/ 走 prettier(reference MEMORY:`feedback_local_verification_format`)
- `pnpm test -- tests/migrate/` 全绿
- 覆盖率门槛:`archive-detect.ts ≥ 90%`,`conflict.ts ≥ 85%`;集成测保证 cli 主路径 OK,不强求覆盖率

---

## 5. 复用与新增模块清单

### 5.1 反向调用 legacy-bridge(M9)

migrate 不扩 `legacy-bridge` 命令,而是从 `src/core/migrate/regenerate.ts` 反向 import legacy-bridge 工具函数:

| legacy-bridge 模块                              | migrate 用途                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `legacy-bridge/ack.ts:renderOptinPrompt + writeAck + checkAck` | LLM opt-in 文案 + ack token 写读;ack 文件路径改为 `.forge-ack/migrate-<ts>.ack` |
| `legacy-bridge/budget.ts:estimateRegenerateCost + checkBudgetGate + REGEN_WARN_USD + countdown` | LLM 成本估算 + 阈值二次确认                                          |
| `legacy-bridge/redact.ts:redact + formatRedactReport`        | --regenerate 时跑 redact 规则;report 含 `--redact-report` 命中数      |
| `legacy-bridge/quality-judge.ts:extractFactsFromOriginal + judgeAllFacts + stratifiedSample + formatQualityReport` | 抽样验证 LLM 生成内容                                                |
| `archive/lock.ts:acquireLockByPath + LockHeldError`         | 锁 forge/.migrate.lock;沿用 legacy-bridge 锁顺序                     |

**保持 legacy-bridge 命令本身不动**:`forge legacy-bridge` 仍是 brownfield 老锚点(SRS/HLD/LLD)迁移命令,语义不混。

### 5.2 新增模块清单

| 路径                                         | 内容                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/core/migrate/index.ts`                  | `runMigrate(sourceId, opts)` 主流程编排                                                                              |
| `src/core/migrate/types.ts`                  | `MigrateSource` 接口、`ScanResult`、`ClassificationPlan`、`CopyOp`、`MigrateReport`、`ArtifactKind` 等              |
| `src/core/migrate/conflict.ts`               | 同名 `--imported` 后缀递增;`--force` 跑 trash 路径(`forge/.forge-trash/<ts>/`)                                       |
| `src/core/migrate/archive-detect.ts`         | 推测引擎:checkbox 完成度 + git log close-keyword + mtime 信号合成                                                    |
| `src/core/migrate/report.ts`                 | report.md / trace.json 渲染                                                                                          |
| `src/core/migrate/regenerate.ts`             | --regenerate 路径;反向调 legacy-bridge ack/budget/redact/quality-judge                                              |
| `src/core/migrate/sources/openspec.ts`       | `OpenSpecSource` 实现 MigrateSource;§2.1 目录映射 + §2.5 transformer 规则                                            |
| `src/core/migrate/sources/superpowers.ts`    | `SuperpowersSource` 实现 MigrateSource;§2.2 配对 + §2.6 transformer 规则                                              |
| `src/core/migrate/sources/index.ts`          | source registry: `'openspec'` / `'superpowers'` → MigrateSource                                                     |
| `src/cli/commands/migrate.ts`                | commander 子命令骨架,参数解析 + 错误码映射                                                                          |

### 5.3 改动模块清单

| 路径                          | 改动                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `src/cli/index.ts`            | 注册 `migrate` 子命令(import buildMigrateCommand)                            |
| `src/index.ts` 或顶层 export | 公开 `runMigrate`(供 plugin commands.md 后续可能调用)                        |

---

## 6. 用户视角文档

### 6.1 README 加段(简版)

```md
## 从已有项目搬过来

如果你的项目已经在用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 或装过 [superpowers](https://github.com/obra/superpowers) plugin,跑 `forge migrate <source>` 一键搬到 forge 工作目录:

\`\`\`bash
# OpenSpec 项目
forge migrate openspec       # 默认 --regenerate(LLM 补缺件,会显示估价)

# superpowers 用户产物(docs/superpowers/{specs,plans}/)
forge migrate superpowers    # 同上;design+plan 配对成 forge change
\`\`\`

加 `--no-regenerate` 跳过 LLM,只搬结构 + 跑 transformer;失败件标 `[needs-fix]`。
\`\`\`
```

### 6.2 `docs/migration/from-openspec.md` 与 `docs/migration/from-superpowers.md`

详细文档:迁移前要做啥、估价怎么读、`[needs-fix]` 怎么补、cleanup 建议;~每篇 ≤ 300 行。

---

## 7. 风险与未决项

### 7.1 风险

| 风险                                                                                       | 缓解                                                                                          |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| transformer 规则覆盖不全(用户某 OpenSpec 项目用了 transformer 没考虑的格式变体)            | 单元测覆盖已知 6 条 + 文档说明"未覆盖会标 `[needs-fix]`";后续 PR 增量加规则                  |
| LLM regenerate 成本超预期(大项目几十个 change)                                            | budget gate 二次确认;report 单独列 regenerate 成本;用户加 `--no-regenerate` 退化            |
| 用户在源仓库正在 forge brainstorm/propose 同时跑 migrate                                  | `forge/.migrate.lock` 防并发;但用户**手动**编辑 forge/ 文件 + 同时跑 migrate 仍可能撞 — 不防 |
| superpowers 配对算法对边角文件名(`-design-v2.md`、奇怪 slug)失效                       | `[ambiguous-slug]` / `unrecognized` 标记 + report 列出让用户决定;非阻塞                       |
| migrate 跑完后用户跑 `forge archive` 失败(因 [needs-fix] 件)                              | 文档明示;archive 错误信息引导用户重跑 migrate --regenerate 或手补                            |

### 7.2 未决项 / NOT 实现

- **M12** `forge migrate --rollback`:trace.json 结构留好,实现挪到后续 PR
- **M7** `.forge-trash/` 24h 之外的 GC:`forge migrate --gc` stub,实现挪到后续 PR
- 第三方源(magic、claude-flow)适配:接口已抽象,新增 adapter 即可,本 spec 不实现
- bundled plugin(decision #24)路径下的 migrate:bundled 不带 LLM SDK,`--regenerate` 在 bundled 中应自动退化为 `--no-regenerate` + warn(需在 §3 错误矩阵补一条;v0.x 实现时再加)

### 7.3 与 forge upgrade 的关系

`forge upgrade`(v0.2 → v0.3 自升级)与 `forge migrate`(框架→forge 搬运)**完全独立**:
- upgrade 处理 forge 自身版本演进的 STASH + 5 阶段事务
- migrate 处理外部框架产物搬入,默认 cp 不动源,半残禁止
- 两者不共用代码(锁机制共用 `acquireLockByPath`,但锁文件不同)
- 若用户既要 upgrade 又要 migrate,推荐顺序:**先 upgrade(forge 自身到位)→ 再 migrate(搬入外部产物)**

---

## 8. 实施路线图(初稿,具体由 writing-plans 产出)

| 阶段 | 内容                                                                                            | 估算工作量 |
| ---- | ----------------------------------------------------------------------------------------------- | ---------- |
| P1   | 骨架:types.ts + sources/{index,openspec,superpowers}.ts 空实现 + cli/migrate.ts + 单测占位      | 1 day      |
| P2   | OpenSpecSource 完整(scan + classify + prepareCopy + transform);单元测 + 集成测                 | 2 days     |
| P3   | SuperpowersSource 完整(配对 + archive-detect + transform);单元测 + 集成测                      | 2 days     |
| P4   | conflict.ts + report.ts + lock 接入;集成测覆盖冲突场景                                          | 1 day      |
| P5   | regenerate.ts 反向调 legacy-bridge;mocked SDK 集成测                                            | 1.5 days   |
| P6   | CLI 端到端测;README + docs/migration/from-*.md 撰写                                            | 0.5 day    |
| P7   | release-gate-checklist 加 §4 v0.4 段;CHANGELOG 写迁移说明                                       | 0.5 day    |

总计:约 **8.5 工日**。版本目标:`v0.4.0`(与 `forge init` 移除同期;若需要可拆分到 `v0.4.0` 给 OpenSpec / `v0.4.1` 给 superpowers + LLM)。

---

**文档结束**。后续由 writing-plans skill 基于本 spec 产 implementation plan;实施过程中若发现规则盲区,回到本 spec 增量补 §2.5 / §2.6 / §3.1。
