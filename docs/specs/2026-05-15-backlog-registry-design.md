# Backlog Registry brainstorm design — `forge/backlog/` active.md + archived.md

> **Status**: brainstorming 产物,作为 writing-plans 阶段的输入。
> **Date**: 2026-05-15
> **Version**: v6(经 Codex 对抗性审查五轮处置;round 5 收敛 —— 0 HIGH 0 MEDIUM,见 §12)
> **Author**: msc(brainstorm 与 Claude 协作)
> **前置**:plan-9b(scope-entries schema + `superseding_entries` + `aggregator.ts`)/ plan-9e1(archive_summary + `handoff_to_backlog`)
> **参考结构**:`D:\ClaudeProject\ForgeUE_claude\openspec\backlog\`(active.md / archived.md / README.md 三文件范式)

---

## 0.0 文档状态声明

**本文档是 brainstorming 阶段产物,描述本 feature 的「实施清单」而非「已实施成果」。** 全文「新增」「扩展」「补」「渲染」等表述都是 writing-plans 阶段拆 task + 实施时的目标,**当前代码库尚未包含这些改动**。当前真实状态:

- `src/core/scope/aggregator.ts::scanArchivedFollowups()` 已存在,但只返回 `AggregatorResult { entries }`(存活 active entries);superseding 明细算进局部 `superseded` Set 后**即丢弃**;parse error **静默 skip**(`aggregator.ts:67`),schema mismatch 仅 **stderr warning + skip**(`aggregator.ts:85`)—— 跳过信息不进任何结构化返回。
- `aggregator.ts:99-101` 对 `superseding_entries` **逐条无条件** `superseded.add(\`${source_change}::${entry_id}\`)`,**不检查** `new_status`(已读实)。
- `src/cli/commands/scope.ts` 的 `forge scope scan-archived-followups` 子命令已存在,把聚合结果打到 stdout —— **不落盘任何文件**。
- **不存在** `src/core/backlog/` 目录、**不存在** `forge backlog` CLI 子命令、**不存在** `forge/backlog/` 产物目录约定。
- `commands/propose.md:25` 的 inherit 分支要求写 `triggered_by: {source: "from-archived", id: ...}`,但 `TriggeredByRef.source` enum 只允许 `pause_decisions | explore_capture | review_outcomes` —— `from-archived` 是 enum 外值;`src/core/validate/scope-entries.ts` 当前**不强校验**该字段,故此不一致目前悄悄漏过。propose.md step 4 决策菜单含 `inherit` / `mark superseded` / `mark obsolete`,**无 `mark completed`**。
- `commands/archive.md` 的 archive 流程**不生成任何 backlog 产物**;archive 输出模板印着 `v1.1+: run forge backlog list`(`commands/archive.md:86` + `src/core/archive/summary-render.ts:58`)—— 一句**承诺过却从未兑现**的文案;且 archive 输出含标题 `### Pending Suggestions (…) — handed off to backlog`(`summary-render.ts:46` + `commands/archive.md:80`)。
- `src/core/schemas/archive-summary.ts:35` 的 `handoff_to_backlog` 字段注释写「给 v1.1 forge backlog index 用」;`src/core/archive/summary-builder.ts:82` 聚合 `HandoffEntry`,`HandoffEntry.source` 含 `verify_findings | review_outcomes | pause_decisions | scope_entries` 四类。
- `src/core/schemas/scope-entries.ts` 的 `ScopeEntry` 是 §3.12.1bis Interface Freeze 冻结的 8 字段(已含 `priority` / `status` / `related_change`),`ScopeStatus` enum 含 `active | inherited | superseded | completed | obsolete`(注意:**含 `active`**)。`SupersedingRef.new_status` 字段类型为 `ScopeStatus`。
- `src/core/schemas/archive-summary.ts` 的 `ArchiveSummary` 是 9 业务字段冻结。

**本 feature 不改任一冻结 TS interface schema**(`ScopeEntry` / `ArchiveSummary` 均不动;对 `archive-summary.ts` 的改动仅限**注释**文案 —— 注释不算 schema)。本文档 §3.2 / §7.1 定义的 `SupersedingDetail` / `SkippedBlock` / `BacklogWarning` 是**本 feature 新增的内部类型**(非冻结 schema),可自由设计。Codex 审查请按「spec 描述未来实施」区分:仅当本文档自相矛盾才算问题。

---

## 0. 目的与边界

本文档是 `superpowers:brainstorming` skill 流程的产物,记录「backlog 注册表」feature 的设计选型。

- **诉求**:开发者需要一个集中入口掌握「项目还剩多少待办」。forge 当前的 backlog 是分布式的(散在各 change 的 `proposal.md` / `design.md` scope YAML 块),无汇总视图。
- **核心洞察**:choice C(后续 change 显式认领)所需的数据模型与认领机制 **forge 已全部具备** —— `ScopeEntry`(`id` / `priority` / `status` 状态机)、`SupersedingRef`(认领)、`aggregator.ts`(扫描 + 聚合 + 扣减)。本 feature **不发明数据模型**,只补三件事:**渲染、持久化、接入 `/forge:archive`**。
- **Plan 层(writing-plans 阶段产出)**:本文档不拆 task。后续由 `superpowers:writing-plans` skill 生成 `docs/plans/2026-05-15-plan-backlog-registry.md`。

---

## 1. Brainstorming 决策摘要

| #   | 决策点               | 选定                                                                | 选定理由                                                                                                |
| --- | -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | 产出形态             | 仓库内活文档目录 `forge/backlog/`                                   | 用户要可长期维护的集中入口;两文件分离 = 未决视图 + 审计轨                                               |
| 2   | 生命周期模型         | **C —— 后续 change 显式认领**                                       | A(只增不减)撑不起「还剩多少」;B 引入可变 sidecar;C 全派生自不可变记录,最 forge-native                |
| 3   | 目录结构             | 借鉴 ForgeUE `openspec/backlog/` 三文件范式                         | 成熟范式:`active.md`(未决)/ `archived.md`(tombstone)/ `README.md`(schema 文档)                     |
| 4   | 文件性质             | `active.md`/`archived.md` = **生成产物、不可手编**;`README.md` = 一次性静态种子 | 用户已接受代价:富字段须进源头 scope-entry,手编 active/archived 会被下次重生成冲掉;README 仅首次写入、允许下游本地补充(§3.1) |
| 5   | 认领机制             | **复用既有 `superseding_entries`(SupersedingRef)**                     | forge 已有;无需新产物;`archive_summary.yaml` schema 不动                                            |
| 6   | non-goal 处理        | active.md 单列一段「Non-Goals」,不计入待办数                       | non-goal 是「原则反对做」的反目标,不是待办                                                             |
| 7   | CLI                  | 加 `forge backlog` + `forge backlog list` + `--check`               | 兑现过期承诺 `v1.1+: run forge backlog list`;`--check` 给 CI 做 staleness 守门                          |
| 8   | 冻结 schema 改动     | **零**(仅改 `archive-summary.ts` 注释)                            | `priority` 已存在;`trigger` 用 `reason`+`description` 替代;`inherit` 来源改用既有 `related_change` 字段(§9),都不动 TS interface |
| 9   | 既有机制缺陷         | inherit double-count / `from-archived` / `new_status` 三项**确认缺陷,本 feature 必修** | 对照代码核实为已确认缺陷(非「待核实」),注册表计数正确性依赖修复(见 §9)            |
| 10  | backlog 数据源       | **仅 scope YAML**,不消费 `archive_summary.handoff_to_backlog`       | 见 §2.3 论证;within-change SUGGESTION 无跨 change 认领机制,纳入会产生永久孤儿                          |

---

## 2. 架构 + 模块边界 + 文件清单

### 2.1 产物布局(项目侧,对标 ForgeUE)

```
<project>/forge/backlog/
├── active.md     ← 生成产物:当前未决 scope-entry,按 category 分段
├── archived.md   ← 生成产物:tombstone(被 superseded/obsolete/completed/inherited 的 entry)
└── README.md     ← 静态 schema 文档:首次生成时由模板写入,已存在则不覆盖(§3.1)
```

`active.md` / `archived.md` 全自动派生,数据源是 `forge/changes/archive/<date>-<id>/` **archived change 目录**:`{proposal,design}.md` 内的 `forge-scope-entries/v1` YAML 块提供 entries + 认领;**目录名的日期前缀**提供 tombstone 时间(§5)。两文件每次 `/forge:archive` **整体重生成**;`forge/changes/archive/` 按 forge 约定不可变(见 `aggregator.ts` 注释「archive 历史不可改」),故重生成确定性、archived.md 内容稳定 —— 「append-only」是不可变约定下的涌现属性,非单独 fence(§5、§12 round1 #3)。

### 2.2 新增 / 改动文件(forge-repo 侧)

| 文件                                       | 改动                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `src/core/backlog/render.ts`(新)          | 纯函数:聚合结果 → 派生 `BacklogWarning[]`(§7.1)→ `active.md` / `archived.md` markdown 字符串                |
| `src/core/backlog/index.ts`(新)           | orchestration:调 `scanArchivedFollowups` + `render` + 写文件(含 README 首写);re-export                     |
| `src/core/backlog/assets/backlog-readme.md`(新) | `forge/backlog/README.md` 的静态模板(schema 文档,首次生成时拷入下游项目)                               |
| `src/core/scope/aggregator.ts`(改)        | `scanArchivedFollowups` 增返回 `superseding` 明细(含 snapshot)+ `skipped`(坏块);扣减加 `new_status` 守卫(§9c);向后兼容 |
| `src/cli/commands/backlog.ts`(新)         | `forge backlog` / `forge backlog list` / `forge backlog --check` 子命令组                                     |
| `src/cli/index.ts`(改)                    | 注册 `buildBacklogCommand()`                                                                                  |
| `src/cli/commands/archive.ts`(改)         | archive 成功后调 `backlog/index.ts` 写产物 + 收集 WARNING                                                     |
| `commands/archive.md`(改)                 | 末尾补「backlog 产物」说明;改 archive 输出模板两处文案:`v1.1+: run forge backlog list` 过期承诺 + `Pending Suggestions — handed off to backlog` 标题(§2.3) |
| `commands/propose.md`(改)                 | step 4 决策菜单补 `mark completed` 选项;修 inherit 分支(见 §9a/§9b)                                         |
| `src/core/archive/summary-render.ts`(改)  | line 58 过期承诺文案改为已兑现表述;line 46 `Pending Suggestions — handed off to backlog` 标题改措辞(§2.3)     |
| `src/core/schemas/archive-summary.ts`(改) | **仅注释**:`handoff_to_backlog` 字段注释「给 v1.1 forge backlog index 用」改为准确表述(见 §2.3)             |

> 注:改 `commands/*.md` 后必须 `pnpm build`(双源 md5 sync,见仓库 CLAUDE.md)。

### 2.3 与既有 `archive_summary.handoff_to_backlog` 的关系(§12 round1 #1)

`archive_summary.yaml` 有 `handoff_to_backlog` 字段,其注释历史上写「给 v1.1 forge backlog index 用」。本 feature **不消费**该字段,理由:

1. `handoff_to_backlog` 的 `scope_entries` 部分与「直接扫 scope YAML」**信息等价**,直接扫源头更少一层间接、且 `aggregator.ts` 已是扫源头模式。
2. `handoff_to_backlog` 还含 `verify_findings`(SUGGESTION)/ `review_outcomes` / `pause_decisions` 三类**within-change 项**。这些项**没有跨 change 认领机制** —— `superseding_entries`(choice C 的认领载体)只对 `scope-entries` 生效。若把它们纳入一个以 choice C 为生命周期模型的注册表,它们将**永远无法被标记 resolved**,成为永久孤儿。

**故本 feature 的 backlog 注册表 = 跨 change 的 scope-entry 注册表**(决策 10),`handoff_to_backlog` 保持为「单 change archive 的不可变记录」,**不再**是 backlog index 的入口。

**配套文案清理**(§12 round2 #4):本 feature 让「backlog」从模糊概念变成 `forge/backlog/` 这个具体产物。两处旧文案会因此误导,须一并改:

- `archive-summary.ts:35` 注释「给 v1.1 forge backlog index 用」→ 改为「单 change archive 的不可变 handoff 记录;跨 change backlog 注册表见 `forge/backlog/`,独立扫 scope YAML 生成」。
- archive stdout 标题 `### Pending Suggestions (…) — handed off to backlog`(`summary-render.ts:46` + `commands/archive.md:80`)→ 去掉「backlog」字样(如 `### Pending Suggestions (…) — recorded in archive_summary`),否则读者会去 `forge/backlog/` 找 SUGGESTION 却找不到。

within-change 的 SUGGESTION 待办仍由各 change `archive_summary.yaml` 的 `pending_suggestions` 承载,只是不进 `forge/backlog/`(§11)。

---

## 3. 数据流

### 3.1 `/forge:archive` 成功后的 backlog 步骤

`commands/archive.md` 是 CLI 薄包装;backlog 生成挂在 `forge archive` CLI 内 → **三 harness(Claude Code / OpenCode / Codex)自动一致**,无 harness 特定工作。

archive 把 change X 移进 `forge/changes/archive/<date>-X/` **之后**:

1. `backlog/index.ts` 调扩展后的 `scanArchivedFollowups`(§3.2)扫 `forge/changes/archive/*/`(此时已含 X)→ 得 `{ entries, superseding, skipped }`。
2. `render.ts` 三步:(a) `entries` → `active.md` 主体;(b) `superseding` → `archived.md` tombstone;(c) 从 `superseding` + `skipped` **派生** `BacklogWarning[]`(§7.1)→ 渲染 `active.md` 顶部 `## Warnings` 段。
3. 写入 `forge/backlog/{active,archived}.md`(目录不存在则创建)。**`README.md` 仅当不存在时**由 `assets/backlog-readme.md` 模板写入(已存在则不动 —— 它是静态文档,允许下游项目本地补充)。
4. archive stdout 末尾追加:`Backlog: forge/backlog/active.md (<N> open, <W> warnings)`。

backlog 写入失败**不回滚 archive**(archive 主流程已成功,backlog 是衍生产物)—— 失败仅 stderr WARNING + 提示手动 `forge backlog` 重生成。

### 3.2 聚合扩展(`aggregator.ts`)—— 数据层

当前 `scanArchivedFollowups` 把 `superseding_entries` 收进局部 `superseded: Set<string>` 后丢弃明细,且 skip 的坏块只走 stderr。扩展为保留明细 + 结构化 skipped 列表。**aggregator 只产「原始数据」,不产「呈现层 warning」** —— warning 由 render 层从这些数据派生(§7.1):

```ts
// 每条 superseding 明细 —— 用于渲染 tombstone(中文注释)
interface SupersedingDetail {
  source_change: string; // 被认领的历史 entry 所在 archived change(目录名)
  entry_id: string; // 被认领的 entry id
  new_status: string; // YAML 原始字串,未 cast;合法性(∈ 4 枚举)在 render 层校验(§7.1/§9c),非法值原样保留供 warning 渲染
  rationale: string; // 认领论证
  superseded_in_change: string; // 写下这条 SupersedingRef 的 archived change(认领者,目录名)
  superseded_at: string; // 认领者 archived 目录名日期前缀 YYYY-MM-DD;无可解析前缀 → 字面量 'unknown'(§5 排序规则 / §7)
  registry_entry_snapshot: ScopeEntry | null; // 原 entry 快照;null = 悬空引用(§7,render 层据此出 dangling warning)
}

// 被 skip 的 archived scope 块 —— aggregator 唯一产出的「原始异常」
interface SkippedBlock {
  change: string; // archived change 目录名
  file: string; // proposal.md | design.md
  reason: 'yaml-parse-error' | 'schema-mismatch';
}

interface AggregatorResult {
  entries: AggregatedScopeEntry[]; // 不变:存活 active(已扣 superseding)
  superseding: SupersedingDetail[]; // 新增:供 backlog tombstone + render 层派生 warning
  skipped: SkippedBlock[]; // 新增:坏块不再仅 stderr,结构化返回(render 层转 skipped-block warning)
}
```

- **`new_status` 类型为 `string`(非 `ScopeStatus`)**:`superseding_entries` 来自 YAML,字段值在校验前是任意字串。typed 成 `ScopeStatus` 是类型谎言(容不下非法值),且会丢失原始字串无从在 warning 里渲染。故 aggregator 原样保留 `string`,合法性由 render 层显式判 `∈ {superseded,obsolete,completed,inherited}`(§9c)。
- **身份键**:一个 backlog 项的唯一标识**统一为复合键 `source_change::entry_id`**(与 aggregator 既有 `superseded` Set 键一致)。`ScopeEntry.id` 虽文档称跨 change 唯一,但 dangling 判定、重复认领分组(§5/§7)**一律用复合键**,不依赖 `id` 单独唯一性。
- **目录名异常**:认领者 archived 目录名无可解析 `YYYY-MM-DD` 前缀时(legacy / `forge migrate` 导入的非标准命名),`superseded_at` = 字面量 `'unknown'`;render 层据此出 `malformed-dirname` warning,tombstone 仍渲染(§5)。
- **零额外 IO**:`superseding[]` 与 `entries[]` 同源同遍历;`registry_entry_snapshot` 由内存中已扫 entry 解析(不重读文件);`superseded_at` 取目录名(不读 `archive_summary.yaml`);`skipped[]` 复用现有 skip 分支,改「丢弃 / stderr」为「push 进数组」。`AggregatorResult` 加字段不破坏现有 `forge scope scan-archived-followups` 消费方(它只读 `entries`)。

---

## 4. `active.md` schema 与渲染

未决 backlog 视图,源数据 = aggregator `entries[]`(已扣 superseding 的存活 `status=active` 项)。

文件顶部固定一个 `## Warnings` 段(render 层派生的 `BacklogWarning[]`,§7.1);其下按 category 分段:**先 Future Work,再 Out of Scope**(两者构成「待办」主体并计数),**最后单列 Non-Goals**(决策 6:可见但不计入待办数)。每条由 `ScopeEntry` 字段渲染:

```markdown
# Active Backlog

> 生成产物 —— 由 `/forge:archive` 自动重生成,**勿手编**。Schema 见 README.md。
> 待办计 <N> 项(Future Work + Out of Scope;Non-Goals 不计入)。

## Warnings (<W>)

<无异常时:渲染 "(无)";否则每条一行,见 §7.1 五类>

## Future Work (<n1>)

### `<source_change>::<id>`

- **source change**: <source_change>
- **description**: <description>
- **reason**: <reason>
- **priority**: critical | high | medium | low | (未排序)
- **related change**: <change-id> | (无)
- **triggered_by**: <source>#<id> | (无)

## Out of Scope (<n2>)

…(同上字段)

## Non-Goals (<n3>) — 原则不做,不计入待办

…(同上字段)
```

排序沿 aggregator 既有 `future-work > out-of-scope > non-goal`,组内按 `source_change` 再按 `id`。

## 5. `archived.md` tombstone schema 与渲染

源数据 = aggregator `superseding[]`。每条 tombstone 全字段可派生 —— snapshot 由 `source_change` + `entry_id` 回查内存中已扫的原 entry 得到,`superseded_at` 取认领者 archived 目录名日期前缀:

```markdown
# Archived Backlog (Tombstones)

> 生成产物 —— 由 `/forge:archive` 自动重生成。每条记录一个 backlog 项的退役。Schema 见 README.md。
> 异常(悬空认领 / 非法 new_status / 重复认领 / 跳过坏块 / 目录名异常)见 active.md `## Warnings`。

### `<source_change>::<entry_id>`

- **superseded_in_change**: <认领者 change id>
- **superseded_at**: <YYYY-MM-DD 日精度;目录名无可解析前缀时 unknown>
- **new_status**: superseded | obsolete | completed | inherited
- **cancellation_reason**: <rationale>
- **registry_entry_snapshot**: <原 ScopeEntry 8 字段,JSON 单行>
```

**渲染规则**(§12 round1 #3/#6/#7;round4 MEDIUM-2):

- **处理顺序**:按身份键 `source_change::entry_id` 分组;每组内**先**剔除 dangling(`snapshot=null`)与非法 `new_status` 的 claim(各自进 `## Warnings`,不参与 tombstone 评选),**再**在剩余 valid claim 中选 winner —— dangling / invalid claim 永不成为 winner。
- `registry_entry_snapshot` 让 tombstone 自包含**可读**(读 archived.md 不必回查原 change)。它**不**声称能对抗源文件被人为篡改 —— archived change 篡改属违反 forge「archive 不可变」约定,超出本 feature 责任。
- **悬空认领**(snapshot=null):**不出 tombstone**(无实体可入葬),仅进 `## Warnings`。
- **非法 `new_status`**(不在 `{superseded,obsolete,completed,inherited}` 内,含 `active`):**不出 tombstone**,仅进 `## Warnings`。
- **重复认领**(同一 `source_change::entry_id` 被多条 **valid** superseding claim 命中):只渲染 **`superseded_at` 最早**的一条 tombstone(winner),其余进 `## Warnings`。**排序规则**:有效 `YYYY-MM-DD` 按字典序比较;字面量 `'unknown'` 一律**排在所有有效日期之后**(即「最晚」,故有真实日期者优先入选 tombstone);若并列(同日期、或全为 `unknown`)→ 按 `superseded_in_change` 字典序取首。active.md 的扣减不受影响(aggregator `superseded` Set 本就按 `source_change::entry_id` 去重)。

## 6. 认领机制 —— 复用 `superseding_entries`

无新产物。后续 change 在 `/forge:propose` 阶段经 `commands/propose.md` step 4 的历史 followup 决策菜单认领:

- **现状**:菜单 = `inherit`(复制到本 change 自己的 scope 块)/ `mark superseded` / `mark obsolete`,后两者写入 `superseding_entries: SupersedingRef[]`。
- **本 feature 改动**:菜单补 `mark completed` 选项 —— `ScopeStatus` enum 早含 `completed`,只是 propose.md 菜单文案漏列。「我做完了 backlog 项 X」= 一条 `new_status: completed` 的 `SupersedingRef`。inherit 分支另见 §9。

认领在**认领者 change 自己 `/forge:archive`** 时才生效(它的 scope 块进入 archived 池后,下次聚合才扣减)—— 与「认领但 change 被弃」自然隔离。

## 7. 校验、WARNING 与 staleness

### 7.1 WARNING 模型与渲染(`## Warnings` 段)

backlog 是衍生产物,其异常**一律不阻断 archive**(一个 backlog 引用 typo 不该挡一个已通过 verify+review 的 change 出门)。`render.ts` 从 `AggregatorResult` 派生一个 **`BacklogWarning` 联合类型**数组,渲染进 `active.md` 顶部 `## Warnings` 段。五个变体:

```ts
// render 层呈现类型 —— 由 superseding[] / skipped[] 派生(非 aggregator 产出)
type BacklogWarning =
  | { kind: 'dangling-reference'; superseded_in_change: string; source_change: string; entry_id: string }
  | { kind: 'invalid-new-status'; superseded_in_change: string; source_change: string; entry_id: string; raw: string }
  | { kind: 'duplicate-claim'; source_change: string; entry_id: string; claimants: { superseded_in_change: string; superseded_at: string }[]; winner_superseded_in_change: string }
  | { kind: 'malformed-dirname'; superseded_in_change: string }
  | { kind: 'skipped-block'; change: string; file: string; reason: string };
```

| kind                 | 派生自                                                    | 渲染行                                                                                |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `dangling-reference` | `SupersedingDetail.registry_entry_snapshot === null`      | `- [dangling] <superseded_in_change> 认领的 <source_change>::<entry_id> 不存在`        |
| `invalid-new-status` | `SupersedingDetail.new_status` ∉ 4 枚举(`raw` 保留原值) | `- [invalid-status] <superseded_in_change> 认领 <source_change>::<entry_id> new_status=<raw>` |
| `duplicate-claim`    | 同一 `source_change::entry_id` 被 ≥2 条 **valid** superseding 命中 | `- [duplicate] <source_change>::<entry_id> claimants=<superseded_in_change:superseded_at…> winner=<winner_superseded_in_change>` |
| `skipped-block`      | `AggregatorResult.skipped[]` 每项                         | `- [skipped] <change>/<file>: <reason>` —— 提示 backlog 可能少算                        |
| `malformed-dirname`  | `SupersedingDetail.superseded_at === 'unknown'`           | `- [malformed-dirname] <superseded_in_change> 目录名无日期前缀,superseded_at=unknown` |

只有 `skipped-block` 来自 aggregator 的结构化产出(`skipped[]`),其余四类全由 render 层分析 `superseding[]` 派生 —— 这就是 §3.2「aggregator 只产原始数据」的含义。archive stdout 同步打印 `<W> warnings` 计数(§3.1 step 4)。

### 7.2 `forge backlog --check`(staleness 守门,§12 round1 #10)

`/forge:archive` 内部只「渲染 + 写盘」,无自比对(刚写的文件不存在「陈旧」)。staleness 守门独立成 `forge backlog --check`:在内存重生成 `active.md` / `archived.md` 字符串,与磁盘上两文件**逐字节**比对;任一不一致 → stderr 打印不一致文件名 + exit 1。供 CI 用(对标仓库 `format:check` 文化),也供用户确认 `forge/backlog/` 未被手改或漏 archive。`--check` 不重写文件。

## 8. CLI

新子命令组 `forge backlog`(`src/cli/commands/backlog.ts`):

| 命令                    | 行为                                                                              | exit code              |
| ----------------------- | --------------------------------------------------------------------------------- | ---------------------- |
| `forge backlog`         | standalone 重生成 `forge/backlog/{active,archived}.md`(+ README 首写)             | 0 / 2(archive 目录缺) |
| `forge backlog list`    | 把当前未决 backlog(同 `active.md` 内容)打到 stdout,不落盘                        | 0 / 2                  |
| `forge backlog --check` | 重生成对比磁盘,陈旧则 exit 1(§7.2);不重写                                        | 0 / 1 / 2              |

`forge backlog list` 即落实 archive 输出里那句 `v1.1+: run forge backlog list` 旧承诺(该承诺文案本身由 §2.3 一并改写)。`forge backlog` 让用户在不跑 archive 时也能刷新(如首次引入本 feature、或手动修过 archived change 后)。三者共用 `src/core/backlog/`,不重复实现。

## 9. 既有 scope / inherit 机制的 3 处确认缺陷(本 feature 必修)

backlog 注册表的**计数正确性依赖**既有 aggregator 与 inherit 流程。对照代码核实出 3 处**已确认**缺陷(代码已读实,非「待核实」):本 feature **必须修**,均纳入实施 scope。writing-plans 阶段为每处先写复现 fixture(`tests/core/scope/`,TDD red),再修 —— 「fixture」是 TDD 复现步,不是「问题是否成立」的 gate。

**(a) inherit double-count** —— `commands/propose.md:25`:`inherit` 把历史项**复制**成本 change 自己 scope 块里的新 entry,且**不写** `superseding_entries` ref → 老 entry 在原 archived change 里仍 `status: active`。aggregator 同时收「老 entry」与「新副本」→ active.md 同一逻辑项出现两次、计数翻倍。
修法:`inherit` 决策**同时**写一条 `new_status: inherited` 的 `SupersedingRef`(`ScopeStatus` 已含 `inherited`;aggregator `superseded` Set 已对所有 `superseding_entries` 生效,无需改聚合逻辑,只改 propose.md step 4 inherit 分支)。该修法同时让老 entry 进 `archived.md` tombstone,语义自洽。

**(b) inherit 来源字段 `from-archived` 越界** —— `propose.md:25` 要 inherit entry 写 `triggered_by: {source: "from-archived", ...}`,但 `TriggeredByRef.source` enum 无 `from-archived`;`validate/scope-entries.ts` 当前不强校验该字段故漏过,后续严格 validator / typed builder 会失败。
修法:inherit entry 的 archived 来源改用既有 `related_change` 字段(`ScopeEntry` 既有字段,语义即「关联其他 change id」),`triggered_by` 不再塞越界值。**不动 schema**(决策 8)。与 (a) 同处 propose.md inherit 分支,一并改。
**关于来源粒度**(§12 round3):`related_change` 只到 change 粒度,似比旧 `from-archived` 的 `<change>::<entry_id>` 粗。但 **entry 级来源不丢** —— (a) 写的 `new_status: inherited` SupersedingRef 本身携带精确 `{source_change, entry_id}`,inherited 老 entry 的精确出处由该 ref(及其 tombstone)记录。新 entry 的 `related_change` 只作人类可读的 change 级指针。**唯一不机器化的**是「同一 change 一次 inherit 多个 entry 时,新 entry ↔ 旧 entry 的逐一配对」—— 本 feature **接受**此粒度(注册表只需:旧 entry 退役有 tombstone、新 entry 计入 active;逐一配对非必需)。如个别场景需要,可在新 entry 的 `reason` 文字里注明来源 entry_id。

**(c) `new_status` 无约束扣减** —— `aggregator.ts:99-101` 对 `superseding_entries` 逐条**无条件**加入扣减 Set,不看 `new_status`。一条 `new_status: active` 的 ref 会把原 active entry 误扣 → active.md **少算**待办。
**两层防御都必做**:§7.1 的 `invalid-new-status` 是**渲染层**可见性(不出 tombstone + 进 WARNING);本项是**聚合层**正确性。**只做渲染层不够** —— 渲染 WARNING 了但 entry 仍被误扣、计数仍错。
修法:aggregator 扣减时加 `new_status ∈ {superseded,obsolete,completed,inherited}` 守卫,非法值**跳过扣减**并保留进 `superseding[]`(供 render 层出 `invalid-new-status` warning)。此为本 feature 强制实现项,非可选。

## 10. 多 harness

backlog 渲染逻辑全在 `forge archive` / `forge backlog` CLI 内(`src/core/backlog/` + `src/cli/commands/backlog.ts`)。Tier 1 Claude Code 经 `/forge:archive` slash 命令触发,Tier 2/3 OpenCode/Codex 经 CLI / skill 内嵌路径触发 —— 三 harness 走同一 CLI,产物一致,无 harness 特定代码。

## 11. 不做 / scope-out(明确边界)

- **verify/review 的 SUGGESTION 不进 backlog 注册表** —— 决策 10 + §2.3:SUGGESTION 是 within-change nice-to-have,无跨 change 认领机制,纳入会成永久孤儿;它仍由各 change 的 `archive_summary.yaml`(`pending_suggestions`)承载,只是不进 `forge/backlog/`。
- **不消费 `archive_summary.handoff_to_backlog`** —— 见 §2.3。
- **`forge-repo` 自身的 `it.todo` / `TODO` 注释 / plan-v2 待办不在本 feature 范围** —— 那是 forge-repo 自己的开发待办(本对话已确认 A:本 feature 服务下游用 forge 的项目)。
- **不加 `forge backlog resolve` 类手动改状态命令** —— choice C 下,resolved 一律经后续 change 的 `superseding_entries` 认领,不开手动后门。
- **不动 `archive_summary.yaml` 与 `ScopeEntry` 两个冻结 TS schema**(决策 8;`archive-summary.ts` 仅改注释)。
- **不加 `trigger` 字段** —— `reason` + `description` 已够;如后续确有需要,另起 follow-up。

## 12. Codex 对抗性审查处置

### Round 1(v1 → v2):10 finding,均独立核实为真,全处置

| #   | severity | 核实结论                                                                 | 处置                                                                                  |
| --- | -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | HIGH     | 真 —— `handoff_to_backlog` 注释指定它做 backlog index 入口,我绕开了      | §2.3 明确不消费 + 论证;§2.2 加 `archive-summary.ts` 注释更新;决策 10 新增            |
| 2   | HIGH     | 真 —— `superseded_at` 要 archive_summary,但 §2.1 称只读 scope YAML       | §3.2 / §5:`superseded_at` 改取认领者 archived 目录名日期前缀,零额外 IO               |
| 3   | HIGH     | 真 —— 「整体重生成」与「snapshot 抗篡改」逻辑互斥                          | §5 删过度声称;明确 snapshot 只保证「自包含可读」,不可变性靠 archive 约定              |
| 4   | HIGH     | 真 —— `ScopeStatus` 含 `active`,aggregator 不检查 `new_status` 全扣减     | §7.1 渲染层拦截 + §9(c) 聚合层守卫(round 2 升级为强制)                                |
| 5   | HIGH     | 真 —— `triggered_by.source:"from-archived"` 越 enum,validator 不拦       | §9(b):inherit 来源改用既有 `related_change` 字段,不动 schema                          |
| 6   | MEDIUM   | 真 —— 多 change 认领同一 entry → 重复 tombstone 未定义                    | §5 渲染规则:重复认领取最早 `superseded_at`,其余进 `## Warnings`                      |
| 7   | MEDIUM   | 真 —— dangling / null snapshot 渲染格式未定义                            | §5:悬空认领不出 tombstone;§7.1 定义 `dangling-reference` 行格式                       |
| 8   | MEDIUM   | 真 —— README 列进布局但无生成路径                                        | §2.2 加 `assets/backlog-readme.md` 模板;§3.1:首次生成时写入、已存在不覆盖             |
| 9   | MEDIUM   | 真 —— 坏 YAML 时 backlog 静默少算                                        | §3.2 `AggregatorResult.skipped`;§7.1 `skipped-block` warning 类                       |
| 10  | LOW      | 真 —— staleness fence 描述含糊                                           | §7.2 重构:staleness 独立成 `forge backlog --check`(CI 用)                            |

### Round 2(v2 → v3):2 partial + 5 新问题,均独立核实为真,全处置

| 项              | 核实结论                                                                              | 处置                                                                            |
| --------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| round1 #4 partial | 真 —— §9(c) aggregator 守卫写成「待核实推荐修法」,但代码已读实为确认缺陷               | §9 重构:3 项从「待核实」改为「确认缺陷,必修」;§9(c) 标强制实现项               |
| round1 #6 partial | 真 —— 身份键不一致:dangling 用复合键,重复认领只写 `entry_id`                         | §3.2 明确身份键统一为复合键 `source_change::entry_id`;§5/§7 同步                |
| 新 #1           | 真 —— 同上(与 round1 #6 partial 同根)                                                | 同上                                                                            |
| 新 #2           | 真 —— `superseded_at` 目录名无 `YYYY-MM-DD` 前缀(legacy/migrate)时行为未定义          | §3.2 + §7.1:无前缀 → `superseded_at='unknown'` + `malformed-dirname` warning     |
| 新 #3           | 真 —— 决策 4「不可手编」涵盖 README,与「README 可本地补充」矛盾                       | 决策 4 改:「不可手编」仅限 `active.md`/`archived.md`;README 是一次性静态种子     |
| 新 #4           | 真 —— `Pending Suggestions — handed off to backlog` 旧文案在 2 处,本 feature 后误导   | §2.3 + §2.2:列入 `summary-render.ts:46` / `archive.md:80` 标题改措辞            |
| 新 #5           | 真 —— 同上(与 round1 #4 partial 同根:§7 渲染 vs §9 聚合守卫强度不一)                 | §9(c) 明确「两层都必做」,聚合层守卫为强制实现项                                 |

### Round 3(v3 → v4):1 HIGH + 3 MEDIUM + 1 LOW,均独立核实为真,全处置

| 项     | severity | 核实结论                                                                          | 处置                                                                                  |
| ------ | -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 新 #1  | HIGH     | 真 —— `AggregatorResult.warnings: SkippedBlock[]` 只能装 1 类,§7.1 却要装 5 类     | §3.2 字段更名 `skipped: SkippedBlock[]`(aggregator 只产坏块);§7.1 新增 `BacklogWarning` 联合类型,render 层从 `superseding[]`+`skipped[]` 派生 5 类 |
| 新 #2  | MEDIUM   | 真 —— `superseded_at='unknown'` 在重复认领「取最早」排序中行为未定义               | §5 排序规则:`'unknown'` 一律排在有效日期之后(最晚);并列按 `superseded_in_change` 字典序 |
| 新 #3  | MEDIUM   | 真 —— `SupersedingDetail.new_status: ScopeStatus` 容不下原始非法值,无从渲染 `<raw>` | §3.2:`new_status` 改 `string`(YAML 原始字串未 cast);§7.1 `invalid-new-status` 带 `raw` 字段 |
| 新 #4  | MEDIUM   | 真 —— §9(b) `related_change` 仅 change 粒度,比旧 `from-archived` 的 entry 粒度粗   | §9(b) 补段:entry 级来源由 `new_status: inherited` 的 SupersedingRef 精确承载;新 entry 的 `related_change` 作 change 级指针;多 inherit 逐一配对非机器化,明确**接受**此粒度 |
| 新 #5  | LOW      | 真 —— §8 交叉引用「`summary-render.ts` 那句承诺文案」,而该文案 §2.3 要改写         | §8 改为直接描述 `forge backlog list` 输出 active backlog;承诺文案改写仍由 §2.3 负责    |

### Round 4(v4 → v5):0 HIGH + 2 MEDIUM + 1 LOW,均独立核实为真,全处置

| 项       | severity | 核实结论                                                                          | 处置                                                                                  |
| -------- | -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| MEDIUM-1 | MEDIUM   | 真 —— §3.2 定身份键为复合键 `source_change::entry_id`,但 §4/§5 标题仍用 `<id>` / `<entry_id>`,同名 entry 标题撞、锚点歧义 | §4 active.md 标题改 `### \`<source_change>::<id>\``;§5 archived.md 标题改 `### \`<source_change>::<entry_id>\`` |
| MEDIUM-2 | MEDIUM   | 真 —— §5 dangling / invalid / 重复认领 三规则的处理顺序未定义,winner 从全部还是 valid claim 选不明 | §5 新增「处理顺序」首条:先剔 dangling/invalid 进 warning,再在剩余 valid claim 选 winner |
| LOW-1    | LOW      | 真 —— `duplicate-claim` warning 的 `claimants: string[]` 无 winner / 日期,无法审计「取最早」 | §7.1:`claimants` 改 `{superseded_in_change, superseded_at}[]` + 增 winner 字段;渲染行带 winner |

### Round 5(v5 → v6):0 HIGH + 0 MEDIUM + 1 LOW —— **收敛**

| 项    | severity | 核实结论                                                                              | 处置                                                                                  |
| ----- | -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| LOW-1 | LOW      | 真 —— `duplicate-claim` 的 `claimants.change` / `winner` 字段名未说清是认领者还是被认领 entry 的 source,实现易误读 | §7.1:字段更名 `claimants[].superseded_in_change` + `winner_superseded_in_change`,语义自明 |

**收敛声明**:round 5 复审结果 0 HIGH + 0 MEDIUM(仅 1 LOW,已于 v6 修)。按既定收敛标准「无 HIGH 无 MEDIUM」,设计稿自 v6 起视为收敛,可进入 writing-plans 阶段。五轮 finding 总数趋势:10 → 7 → 5 → 3 → 1,单调收敛。
