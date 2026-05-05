# Forge v0.2 Brownfield Onboarding 设计文档

**作者**:msc(由 Claude Opus 4.7 协助 brainstorming)
**日期**:2026-05-05
**关联**:
- 主 spec [`2026-05-04-forge-fusion-design.md`](2026-05-04-forge-fusion-design.md) §7(本文件细化原 v0.2 brownfield onboarding 范围)
- v0.1.0 已实施:[Plan 1-6](../plans/)
- v0.2 实施计划(待写):Plan 7(`docs/plans/2026-05-05-plan-7-brownfield.md`)

---

## 1. 概述

### 1.1 v0.2 定位

老项目接入 forge 时,通常已有完整的标准软件开发流程文档:

- 需求规格说明书(SRS / PRD / 需求规格)
- 概要设计文档(HLD / 概要设计 / Architecture)
- 详细设计文档(LLD / 详细设计 / Module Spec)
- 系统测试用例(testcases / .xlsx / 测试方案)
- 验收报告(UAT report / 客户验收)

这些文档**不能被 forge 替代**——常见原因:

- **合规交付物**:客户验收 / ISO 9001 / CMMI / 医疗 IEC 62304 / 车规 ISO 26262 / 航空 DO-178C 都要求权威需求文档可追溯
- **法律证据**:SRS 是合同性"功能边界",出 bug 打官司时 LLM 复写版无证据效力
- **审计**:审计员要的是签字版,不是 LLM 重写版
- **团队共识**:多团队按老文档协作,不能单方面切换为 forge 内部 GWT spec

v0.2 brownfield onboarding 的核心目标:**让 forge 与老文档体系并存 + 双向同步**,而非"替代"。

### 1.2 三层能力架构

```
                  老项目接入 forge
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌─────────┐    ┌──────────┐    ┌───────────┐
   │ Layer 1 │    │ Layer 2  │    │ Layer 3a  │
   │  sync   │    │  index   │    │ regenerate│
   └────┬────┘    └────┬─────┘    └─────┬─────┘
        │              │                │
        ▼              ▼                ▼
  日常 archive 时    one-shot       one-shot
  自动跑,检测      初始化时跑,  初始化时跑,
  老锚点是否需更新  产摘要给     产规范化复写版
                    sync 提速     (用户后续手维护)
```

| 层 | 命令 | 触发 | 作用 |
|---|---|---|---|
| **Layer 1:sync-check** | `forge legacy-bridge sync-check`(`forge archive` 自动调) | 每次 archive 自动 + 用户主动 | 检测本次 change 影响的老锚点是否需要更新,产 5 档严重度差异报告 |
| **Layer 2:index** | `forge legacy-bridge index` | one-shot 初始化 | 为每份老锚点产 ~100 字 LLM 摘要(提升 sync-check 性能 + 给新 change 提供老文档背景) |
| **Layer 3a:regenerate** | `forge legacy-bridge regenerate` | one-shot 初始化(可重跑等同重新初始化) | LLM 读老锚点 + 代码 + 测试用例,复写出**规范化版本**(SRS/HLD/LLD/system-tests),双 LLM 抽样验证保真率 |

### 1.3 关键决策清单

参考主 spec §1.2 风格。每条决策的理由、替代方案、为什么本选择最优都在后续章节展开。

| # | 决策 | 选择 |
|---|---|---|
| 1 | 老文档命运 | 不替代,**长期共存 + 双向同步**(spec §1.1 的 layer 模型) |
| 2 | 输入源 | **D 双轨**:老文档 + 代码 + 系统测试用例(三方仲裁) |
| 3 | 范围 | **a 全自动扫**(扫全部 docs/ 与 src/) |
| 4 | mapping | **二阶段**(LLM 自动扫产 draft → 用户审 → 真扫);**markdown + YAML 双栈**编辑 |
| 5 | 差异报告 | **YAML + markdown 双栈** + **5 档严重度**(critical / major / minor / style / info) |
| 6 | 老文档去向 | **不被 LLM 转 GWT 塞进 forge/specs/**(用 sync-check 持续同步替代一次性导入);`forge/specs/` 仍按 v0.1 工作流(propose → archive sync)累积新 change |
| 7 | 测试用例 | **LLM 第三输入源**(SRS + 代码 + 测试用例三方仲裁,提升 GWT 准确度);测试用例**不直接转 GWT** |
| 8 | 验收报告 | **不导入**;关键决策 / 已知问题用户可手动摘要塞 `forge/config.yaml#context` |
| 9 | anchor 配置 | **用户显式声明 role + LLM 辅助分类草稿**(`forge/legacy-anchors.yaml`)|
| 10 | 多版本 | `authoritative: true` 标当前版,LLM 仅用当前版;历史版 ignore(可选 `--include-historical` 作背景) |
| 11 | 缺失文档 | **graceful skip**;无 anchors 配置时 sync-check 不阻塞 archive |
| 12 | 外部文档(URL) | **v0.2 不支持**(只支持 git 内文件);Notion / Confluence 用户先 export 到 git |
| 13 | 文件格式 | 支持 .md / .txt / .csv;**Excel(.xlsx)原生支持**(测试用例常见);Word/PDF 用户先 pandoc 转 |
| 14 | 复写粒度 | **按 role 一份大文件**(SRS.md / HLD.md / LLD.md / system-tests.md),不按 module 拆 |
| 15 | 复写器生命周期 | **One-shot 初始化工具**;后续日常 archive 不重跑;用户改复写产物如改老 SRS,**生命周期归用户** |
| 16 | 复写质量验证 | **双 LLM 抽样**(模型 A 复写,模型 B 抽 30 条事实验证保真率);**默认 90% 阈值**;**无 retry**(失败直接报告丢失事实让用户手补) |
| 17 | 复写产物保护 | **不需要 forge-protected 段机制**(因 one-shot 不重跑) |
| 18 | 跨 anchor 一致性 | **自动决策不报为 diff**;第一优先级 mtime 最新,第二优先级 role 优先级写死(requirements > HLD > LLD > system-tests) |
| 19 | sync-check 阻塞 | 默认 **不阻塞** archive;`forge/config.yaml#legacy_bridge.enforce_sync: true` 才阻塞未 resolve 的 critical 项 |
| 20 | 敏感数据 | **redact 字段配置**(regex / 字面量),发 LLM 前 mask;内置 5-7 条默认规则(AWS/GCP/Azure key / 私钥 / 邮箱 / IPv4-private)兜底 |
| 21 | 合规边界 | 复写产物**不替代权威交付物**;每份复写产物自动加 frontmatter `generated-by: forge-legacy-bridge` + 顶部 disclaimer |

---

## 2. 架构与组件

### 2.1 CLI 入口

`forge legacy-bridge` 主命令 + 5 个子命令(对齐 forge 现有 `forge config get/set/profile` 风格):

| 子命令 | 用途 | 触发 |
|---|---|---|
| `forge legacy-bridge map` | 二阶段 mapping 第一阶段(LLM 扫 docs/+src/ 产 anchors-draft.yaml + 同名 .md 概览)| 用户主动(初始化时跑一次) |
| `forge legacy-bridge regenerate [--role <r>] [--dry-run] [--include-historical]` | 复写器:读 anchors → LLM 生成规范 SRS/HLD/LLD/system-tests → 双 LLM 抽样验证 → 写 `forge/docs/regenerated/`| 用户主动(one-shot 初始化) |
| `forge legacy-bridge index` | 索引摘要:为每个 anchor 产 ~100 字 LLM 摘要 → `forge/docs/index.md` | 用户主动(随 regenerate 后跑) |
| `forge legacy-bridge sync-check [--change-id <id>]` | 检测某 change 影响哪些 anchor → LLM 输出 5 档差异 → `forge/legacy-sync-state/<id>.{md,yaml}`| 自动(`forge archive` hook)+ 用户主动 |
| `forge legacy-bridge resolve <change-id>` | ack 差异项(用户已手动更新老文档,标 status=resolved-by-doc-update / false-positive / skipped)| 用户主动 |

### 2.2 文件结构(新增)

```
forge/
├── legacy-anchors.yaml                # 主配置(用户审过的 anchor 角色 + 模块映射 + hash + redact)
├── docs/
│   ├── index.md                       # Layer 2:每 anchor 一行 ~100 字摘要
│   └── regenerated/                   # Layer 3a:LLM 复写产物(用户后续手维护)
│       ├── SRS.md
│       ├── HLD.md
│       ├── LLD.md
│       └── system-tests.md
├── legacy-sync-state/                 # Layer 1:每次 archive 后的 sync 报告
│   ├── <change-id>.md                 # human-readable 报告
│   └── <change-id>.yaml               # machine-readable + status tracking
└── ...(原有 forge 结构不动)

# brownfield 工具不动用户老文档原件:
docs/legacy/                           # 用户老文档(forge 仅读不写)
├── 需求规格说明书-v3.2.md
├── 概要设计文档.md
├── payment-detailed.md
├── system-test-cases.xlsx
└── ...
```

### 2.3 核心模块(`src/core/legacy-bridge/`)

```
src/core/legacy-bridge/
├── index.ts             # 顶层 export
├── anchors.ts           # legacy-anchors.yaml 解析 + 校验(forge-legacy-anchor/v1)
├── mapper.ts            # 二阶段 mapping 第一阶段:扫 docs/+src/ → LLM 推测 → 产 draft yaml
├── regenerator.ts       # 复写器:读 anchors → LLM 复写 → 整合多版本 → 加 disclaimer 输出
├── quality-judge.ts     # 双 LLM 抽样:模型 A 抽 30 条 fact,模型 B 验证;阈值 90%;失败直报丢失
├── indexer.ts           # 索引摘要:每 anchor → ~100 字 LLM 摘要
├── sync-check.ts        # 持续同步:archive 后扫 change diff → LLM 输出更新清单
├── diff-report.ts       # 5 档严重度差异报告(critical/major/minor/style/info)生成
├── redact.ts            # 发 LLM 前的敏感数据 mask(regex + 字面量 + 默认规则)
├── conflict.ts          # 跨 anchor 不一致自动决策(mtime > role priority)
└── hash.ts              # 复用 src/core/hash/ 的 SHA256

src/cli/commands/
└── legacy-bridge.ts     # CLI 入口(commander 子命令)
```

### 2.4 复用现有模块

| 复用 | 来自 |
|---|---|
| LLM 调用 + judge 框架 | `forge-eval/judge.ts`(Plan 5 写的 LLM-as-judge);quality-judge.ts 复用 |
| SHA256 hash | `src/core/hash/`(Plan 1 写的) |
| YAML schema 校验 | `src/core/validate/`(Plan 1 写的)— 加 3 个新 schema(`forge-legacy-anchor/v1` / `forge-legacy-sync/v1` / `forge-regen-quality/v1`) |
| Anthropic SDK + budget 估算 | `forge-eval/budget.ts`(Plan 5 写的) |
| 命令 commander 风格 | `src/cli/commands/config.ts`(对齐子命令模式)|

### 2.5 与 forge 现有工作流的衔接

```
用户跑 /forge:archive
   │
   ▼
src/cli/commands/archive.ts(Plan 3+6 写的)
   │
   ├─► archive 严格门禁(原有,不动)
   ├─► archiveTransaction Move→Sync(原有,不动)
   │
   ├─► 【新增】legacy-bridge sync-check 自动调用
   │       │
   │       ├─► 检测每 anchor SHA256 vs anchors.yaml 记录值
   │       │   不一致 → warn "anchor X 已改动"
   │       │
   │       ├─► 找本次 change 影响的模块,LLM 输出 5 档差异
   │       │   → forge/legacy-sync-state/<change-id>.{md,yaml}
   │       │
   │       └─► stdout:"⚠ N 项老文档可能需更新,详见 sync-state/<id>.md"
   │
   └─► archive exit 0(默认不阻塞;config 里 enforce_sync=true 才阻塞 critical 未 resolve)
```

注:archive 默认**不阻塞**(sync-check warn 不导致 exit 非 0)。`forge/config.yaml#legacy_bridge.enforce_sync: true` 时才把"未 resolve 的 critical 差异"作为 archive 阻塞条件(参 review_outcomes.resolved 机制)。

---

## 3. 数据流

### 3.1 T0 — 初始化(用户第一次配 brownfield 工具,~30 分钟人工 + ~$10-20 LLM 成本)

```
用户跑:forge legacy-bridge map
   │
   ▼
┌────────────────────────────────────────────────────────────────┐
│ Phase 1:LLM 自动扫描分类                                       │
│  - 扫 docs/ doc/ document/ 等常见目录(可 --docs-paths 覆盖)   │
│  - 扫 src/ tests/                                               │
│  - LLM 读每文件前 N 行 + 文件名,推测 role                      │
│  - LLM 推测模块边界 + 模块到文件的初始 mapping                  │
│  - 产:forge/legacy-anchors-draft.yaml                           │
│        forge/legacy-anchors-draft.md(human-readable 概览)      │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
       用户审改 yaml(改 role 错分类 / 补 unmatched / 删多余)
                            │
                            ▼
              用户:mv legacy-anchors-draft.yaml legacy-anchors.yaml
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│ 用户跑:forge legacy-bridge regenerate                          │
│  - 读 legacy-anchors.yaml(只用 authoritative=true 版)          │
│  - 跨 anchor 不一致自动决策(mtime 最新 > role 优先级)         │
│  - redact 在发 LLM 前 mask 敏感字段                             │
│  - 按 role 复写:每 role 一份大文件                             │
│      LLM 调用:模型 A 复写每 role(SRS/HLD/LLD/system-tests)    │
│  - 双 LLM 抽样验证(quality-judge.ts):                         │
│      模型 B 抽 30 条事实 → 检查复写版覆盖率                     │
│      < 90% 阈值 → 直接报告丢失事实(无 retry)                  │
│      用户决策:接受 .partial / 重写 prompt 重跑 / 手补          │
│  - 写 forge/docs/regenerated/{SRS,HLD,LLD,system-tests}.md      │
│      自动加 frontmatter(generated-by + disclaimer)             │
│  - 更新 anchors.yaml 每 anchor 的 hash + last_regenerated       │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
              用户跑:forge legacy-bridge index
                            │
                            ▼
            产 forge/docs/index.md(每 anchor ~100 字摘要)
                            │
                            ▼
                        T0 完成
              forge/specs/ 仍空
              老文档原件未动
              forge/docs/ 含规范化复写产物 + 索引
              复写器 one-shot 跑完(后续不再常态运行)
```

### 3.2 T1 — 用户做一个新 change(完整工作流)

```
用户起 Claude Code 会话,发新需求
   │
   ▼
/forge:brainstorm → forge/drafts/<date>-<topic>.md
   │
   ▼
/forge:propose <change-id> --from-draft <name>
   │  │ Plan 4 已有逻辑 + LLM 读 forge/docs/index.md 当背景
   │  │ (可选)读 forge/docs/regenerated/ 做参考(prompt 引用 §X.Y)
   ▼
forge/changes/<id>/{proposal,specs,design,tasks}.md
   │
   ▼
/forge:apply → /forge:review → /forge:verify → /forge:archive
   │
   ▼
forge/changes/archive/<date>-<id>/
   │
   ├─► sync-check 自动触发(Layer 1)
   │      │
   │      ▼
   │  ┌──────────────────────────────────────────────────────────┐
   │  │ 1. 找本次 change 影响的模块(读 specs/<area>.md 反查      │
   │  │    legacy-anchors.yaml 的 modules.<X>)                    │
   │  │ 2. 对每个受影响模块,LLM 读:                              │
   │  │     [本 change proposal + specs + design + git diff]     │
   │  │     [对应 anchor 内容(走索引摘要先快速过滤,             │
   │  │      高分摘要的 anchor 才打开原文)]                      │
   │  │ 3. LLM 输出:每 anchor 是否需更新 + 哪段需补 + 严重度     │
   │  │ 4. 写 forge/legacy-sync-state/<change-id>.{md,yaml}       │
   │  │     5 档严重度:critical / major / minor / style / info  │
   │  │ 5. 跨 anchor 不一致自动决策(不列为 diff)                │
   │  └──────────────────────────────────────────────────────────┘
   │      │
   │      ▼
   │  stdout:"⚠ 5 项老文档可能需更新(2 critical / 3 minor)。
   │           查看 forge/legacy-sync-state/<id>.md"
   │
   ├─► hash 过期检测
   │      检测每 anchor 当前 SHA256 vs anchors.yaml 记录值
   │      不一致 → "anchor X 已改动(用户改了 docs/legacy/SRS),
   │                 复写产物可能脱节 — 用户可手改 forge/docs/regenerated/"
   │
   └─► archive exit 0(默认不阻塞)
```

### 3.3 T2 — 用户手动更新老 SRS / resolve 差异项

```
用户审 forge/legacy-sync-state/<change-id>.md
   │
   ├─► 决定:critical 项 #1 真的要更新 SRS §4.5
   │      │
   │      ├─► 用户**手动**编辑 docs/legacy/SRS-v3.2.md §4.5 段
   │      │   (合规要求:权威文档由人工更新)
   │      │
   │      ├─► 可选:同步更新 forge/docs/regenerated/SRS.md
   │      │   (复写产物归用户维护,与原版一致即可)
   │      │
   │      └─► 用户改 forge/legacy-sync-state/<id>.yaml:
   │            diffs:
   │              - id: 1
   │                severity: critical
   │                status: pending → resolved-by-doc-update
   │
   ├─► 决定:critical 项 #2 是 LLM 误判,代码与 SRS 一致
   │      │
   │      └─► 改 yaml:
   │            diffs:
   │              - id: 2
   │                status: pending → false-positive
   │                reason: "LLM 误读 §6.2,代码实际兼容"
   │
   ├─► 决定:minor 项 #3 不重要,跳过
   │      │
   │      └─► 改 yaml:status: pending → skipped
   │
   ▼
用户跑:forge legacy-bridge resolve <change-id>
   │
   ▼
工具校验所有 diffs status ≠ pending(全部已 ack)
   │
   ▼
exit 0,sync state 标 resolved
若启用 enforce_sync,只有 resolved 后下次才允许新 archive
```

### 3.4 T3 — 复写产物的常态生命周期(不再 LLM 重跑)

```
日常场景:用户对复写产物某段不满意 / 老 SRS 改了想反映到复写版
   │
   ▼
用户**手动编辑** forge/docs/regenerated/SRS.md
   │
   ├─► 跟编辑老 docs/legacy/SRS.md 一样自由
   ├─► 任何时候,不需要 forge 工具介入
   └─► git commit 跟其他源代码 / 文档一起进版本控制

(罕见场景:用户彻底放弃当前复写产物,想清空重生成)
   │
   ▼
用户主动跑:forge legacy-bridge regenerate
   │
   ├─► 等同 T0 重跑:读 anchors → LLM 复写 → 双 LLM 验证 → 覆盖 forge/docs/regenerated/
   ├─► 用户手编辑过的内容**会被覆盖**(因为 one-shot 不保留 protected 段)
   └─► 因此:重跑前用户须 git commit 当前版以便对比 / 还原
```

### 3.5 T4 — Graceful skip(没配 brownfield 的项目)

```
用户在没有 legacy-anchors.yaml 的项目跑 /forge:archive
   │
   ▼
sync-check.ts 检测 forge/legacy-anchors.yaml 不存在
   │
   ▼
"no legacy anchors configured, skipping sync-check"
exit 0,不阻塞 archive
   │
   ▼
现有 forge 工作流照常完成
```

---

## 4. 错误处理

### 4.1 用户 / 环境侧错误

| 错误 | 触发 | 处理 |
|---|---|---|
| `legacy-anchors.yaml` 不存在 | 用户没跑 map 就跑其他子命令 | `regenerate / index / resolve` exit 1 + 提示;`sync-check` exit 0 + skip |
| `legacy-anchors.yaml` YAML 解析失败 | 用户手编辑改坏 | exit 1 + 行号 + 错误描述,**不擅自修复** |
| anchors.yaml 引用文件不存在 | 用户改了 docs/ 但没改 yaml | exit 2 + 列出失踪文件,**不阻塞已存在文件的处理**(部分降级) |
| 同 role 多个 `authoritative: true` | 配置错误 | exit 1 + 报哪个 role 多个 authoritative |
| 文档目录全空 | 没文档化的小项目 | `legacy-bridge map` 输出 "no docs found",exit 0 + 写空 anchors.yaml |
| 老文档非 UTF-8(GBK Word 转 markdown 常见) | Windows 老项目 | 强制 `{ encoding: 'utf8' }`;mojibake → exit 2 + 提示用户用 iconv / vscode 转换 |
| Excel 解析失败 | .xlsx 损坏 / 含 chart / pivot | exit 2 + 提示导出 .csv 重试;不在工具内做复杂 Excel 修复 |

### 4.2 LLM 调用错误

| 错误 | 处理 |
|---|---|
| Anthropic API 网络失败(超时 / 5xx) | retry 3 次(exponential backoff:1s/2s/4s);仍失败 exit 2 + 保留 .partial |
| API rate limit 429 | retry 5 次(每次 wait 60s);仍失败 exit 2 |
| `ANTHROPIC_API_KEY` 缺失 | 复用 `forge-eval/load-env.ts`(Plan 5);提示同 forge-eval |
| LLM 返回非 markdown(纯文本 / JSON 错放) | regenerator output validator 检测 → exit 2 + 保留 .invalid 让用户排错 |
| 复写保真率 < 阈值(默认 90%) | **直接报告丢失事实** + 写 .partial(无 retry);用户决策:接受 / 重写 prompt 重跑 / 手补 |
| 双 LLM judge 调用失败(模型 B 挂) | 复用 `forge-eval/judge.ts` 已有 try/catch;judge 拿不到分数 → 视为不达标 → 走报告 |

### 4.3 数据一致性错误(不变量保护)

| 不变量 | 保护机制 |
|---|---|
| **anchors.yaml 记录的 hash 与实际 anchor 文件 hash 一致** | archive 的 sync-check 时**重算**每 anchor 的 hash;不一致 → warn(不阻塞);regenerate 跑完才更新 hash + last_regenerated |
| **sync-state YAML 的 status ∈ {pending, resolved-by-doc-update, false-positive, skipped}** | resolve 命令前置校验;非法值 exit 1 |
| **resolve 校验所有 diffs status ≠ pending 才标 resolved** | 仍有 pending → exit 2 + 列出 |
| **enforce_sync = true 时,critical 未 resolve 阻塞 archive** | archive 命令开头检测 forge/legacy-sync-state/ 最近 N 份;有 critical 未 resolve → exit 2 |
| **复写产物 markdown 格式合法**(章节层级 / code block 闭合 / frontmatter 合法) | regenerator output validator(用 gray-matter + remark);不合法 → exit 2 + .invalid 文件 |
| **复写产物 frontmatter 含 disclaimer** | regenerator 自动添加 `generated-by: forge-legacy-bridge` + `version: <commit-sha>` + 顶部声明 "**此文档由 LLM 复写,不是项目权威交付物**;权威源:`docs/legacy/`" |
| **跨 anchor 一致性自动决策**(不列为 diff) | conflict.ts:第一优先级 mtime 最新,平局时 role 优先级写死;sync-check 与 regenerator 都遵循 |

### 4.4 预算与速率(成本控制)

| 场景 | 处理 |
|---|---|
| `regenerate` 估算 cost > $20(中型项目 SRS+HLD+LLD+system-tests 全跑) | 命令开头 console.warn 估算成本 + "继续 5 秒,Ctrl-C 取消"(同 forge-eval `budget.ts` 风格) |
| `regenerate --dry-run` | 不调 LLM,只估算 cost + 列要扫的文件;给用户决策依据 |
| sync-check 单次 cost > $5 | 同 warn 不阻塞 |
| 月度累计 brownfield cost(sync-check + regenerate)记录 `forge/.cache/legacy-bridge-cost.log` | 用户可 cat 查;过 $50/月 警告(参 forge-eval `DEFAULT_BUDGET_WARN_USD = 20.0` 同风格) |

### 4.5 安全(敏感数据泄露)

LLM 处理用户老文档,可能含敏感数据(数据库连接字符串 / API key / 客户姓名 / 内部 IP)。

**redact 模式(默认启用)**:`legacy-anchors.yaml` 加 `redact:` 字段;legacy-bridge 在发 LLM 前用占位符 mask:

```yaml
redact:
  - regex: "AKIA[0-9A-Z]{16}"           # AWS access key(默认内置)
  - regex: "AIza[0-9A-Za-z_-]{35}"      # GCP API key(默认内置)
  - regex: "[\\w._%+-]+@[\\w.-]+\\.[a-z]{2,4}"  # email(默认内置)
  - regex: "10\\.\\d+\\.\\d+\\.\\d+"    # IPv4 private(默认内置)
  - regex: "-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----"  # 私钥(默认内置)
  - literal: "INTERNAL-DB-PROD-01"      # 用户自补字面量
```

**默认内置规则**(用户不写也兜底):
- AWS access key:`AKIA[0-9A-Z]{16}`
- GCP API key:`AIza[0-9A-Za-z_-]{35}`
- Azure connection string:`DefaultEndpointsProtocol=...`
- Email:`[\w.-]+@[\w.-]+\.[a-z]{2,4}`
- IPv4 private:`10\.\d+\.\d+\.\d+` / `192\.168\.\d+\.\d+` / `172\.(1[6-9]|2\d|3[01])\.\d+\.\d+`
- 私钥 BEGIN markers

mask 字符:`<<REDACTED-{n}>>`(`{n}` 是序号:第一处 redact 替换为 `<<REDACTED-1>>`,第二处 `<<REDACTED-2>>`,以此类推;让 LLM 能区分多处占位但不暴露原值)。

**复写产物里被 redact 的位置不还原**(留 `<<REDACTED-{n}>>` 占位)— 因为还原意味着映射保留,敏感数据进 forge,违背 redact 初心。用户在复写产物里手动填回真实值。

### 4.6 退出码(统一,与 forge 现有约定一致)

| 码 | 含义 |
|---|---|
| 0 | 成功(含 graceful skip) |
| 1 | 一般错误 / 配置错 / 参数无效 |
| 2 | 业务规则失败(可重试)|
| 3 | 复写部分成功但中途失败需人工介入 |
| 4 | 数据损坏 / 状态机损坏(预留) |
| 5 | 资源占用(规划保留;v0.2 不需要 lock) |

---

## 5. 测试策略

按 forge spec §5 风格,按"什么类型错误最容易溜过去"分配测试精力,不按代码行数均摊。

### 5.1 优先级最高:复写质量 eval(类比 Plan 5 forge-eval)

复写器是 brownfield 最容易出问题的地方(LLM 抽象时丢细节、多版本合并出错)。**纯单元测覆盖不了**(LLM 输出有概率性),走 eval 框架。

**复用 Plan 5 forge-eval 基础设施**,新增 `forge-eval/regeneration-scenarios/`:

```
forge-eval/regeneration-scenarios/
├── well-formed-srs.yaml          # 完整 SRS,期望保真率 > 90%
├── messy-srs-multi-version.yaml  # 多版本混乱,验证 authoritative=true 仅用当前版
├── srs-with-rationale.yaml       # 含历史背景段(2023 P0 事故),验证背景被保留
├── chinese-srs.yaml              # 中文老文档,验证编码处理
├── srs-with-redact.yaml          # 含 API key,验证 redact 在发 LLM 前生效
└── partial-anchor-missing.yaml   # 一份 anchor 文件不存在,验证部分降级
```

每个 scenario 含:
- 输入老文档(可能多份,模拟真实)
- **关键事实清单**(人工标注:这份 SRS 至少 N 条事实必须保留)
- 期望保真率阈值

跑 `pnpm eval-regen` → 调真 LLM → 抽 30 条事实 → 验证保真率 ≥ 90% → 输出报告。

CI 集成同 Plan 5:**weekly + PR(若改 regenerator.ts / quality-judge.ts) + 手动**;`ANTHROPIC_API_KEY` 缺失时优雅 skip。

### 5.2 优先级第二:sync-check 行为单元测试

sync-check 是 brownfield 用户**每次 archive 都跑**的核心路径。错了影响最大(差异报告漏报 / 误报)。

```
tests/core/legacy-bridge/sync-check.test.ts(mock LLM client)
- 受影响模块识别:本次 change 改了 specs/payment.md → 找出 anchors.modules.payment 列的所有文件
- 5 档严重度判定:fixture 中 LLM 返回 5 档,验证报告分组正确
- graceful skip:legacy-anchors.yaml 不存在 → exit 0 + skip
- hash 过期检测:anchor SHA256 与 yaml 记录不一致 → warn 输出含 "anchor X 已改动"
- 部分降级:anchors.yaml 引用 5 文件,3 存 2 缺 → 处理 3 个 + 报告 2 缺,不整体失败
- 全干净:本次 change 改的模块在 anchors 里没配 → "no affected anchors, exiting"
- 跨 anchor 不一致**不报为 diff**(LLM 返回冲突时 conflict.ts 自动决策)
```

### 5.3 CLI 行为集成测试

5 个子命令各 4-6 case(参 Plan 3 archive 测试风格):

```
tests/cli/legacy-bridge/
├── map.test.ts        - happy path / 文档全空 / 已存在 anchors.yaml(覆盖 vs --merge)
├── regenerate.test.ts - happy path / 保真率达标 / 不达标产 .partial / 多 anchor 部分缺失 /
│                        redact 真生效 / disclaimer 真加 frontmatter / dry-run 不调 LLM
├── index.test.ts      - happy path / 大 anchor 文件分块 / 增量(只重生成 hash 变的)
├── sync-check.test.ts - happy path / graceful skip / hash 过期 warn / enforce_sync 阻塞
└── resolve.test.ts    - happy path(全 ack)/ 仍有 pending → exit 2 / status 字段非法 → exit 1
```

### 5.4 Core engine 单元测试

| 模块 | 重点测什么 |
|---|---|
| `anchors.ts` | YAML schema 校验:同 role 多 authoritative → 抛错;角色名非预定义 → warn;path 含 glob 解析 |
| `mapper.ts` | LLM mock 给 fixture 后产 anchors-draft.yaml 结构正确;unmatched 文件归类正确 |
| `regenerator.ts` | 多版本合并(authoritative=true 单选 / `--include-historical` flag);redact 发 LLM 前生效;复写产物 markdown 格式合法;disclaimer 自动加 |
| `quality-judge.ts` | 抽样 30 条事实(< 30 小文档抽全部);三态(preserved / paraphrased / lost);保真率精确 |
| `indexer.ts` | 摘要长度 ~100 字 ± 容差;每 anchor 一条 entry;格式 markdown 表格 |
| `sync-check.ts` | 已在 §5.2 |
| `diff-report.ts` | 5 档分组渲染正确;markdown + YAML 双栈一致;resolve 字段未填默认 pending |
| `redact.ts` | 默认规则匹配(AWS / GCP / Azure / email / IP / 私钥);用户自补字面量;mask 占位符正确 |
| `conflict.ts` | mtime 最新自动决策;平局时 role 优先级正确(requirements > HLD > LLD > system-tests) |
| `hash.ts` | 复用 src/core/hash/ 的 SHA256;含中文文件名路径 hash 稳定 |

### 5.5 跨平台 fixture(对齐 forge spec §5.4)

```
tests/fixtures/legacy-bridge/
├── chinese-anchor/                    # 中文路径 + 中文文档名
│   └── 需求规格说明书.md
├── gbk-encoded-srs.md                 # 故意 GBK 编码,验证 utf8 强制读取报错(不静默乱码)
├── windows-crlf-srs.md                # CRLF 行尾,验证规范化
├── excel-test-cases.xlsx              # 多 sheet,验证 sheet 字段精确指向
└── redact-targets.md                  # 含 API key / email / 内部 IP,验证 redact 默认规则匹配
```

CI Linux + macOS + **Windows runner**(同 forge 现有 ci.yml);Windows-specific 测试加 `.win.test.ts` tag。

### 5.6 不做的测试

- **不测 LLM 复写的具体措辞**(脆且没意义,fact 保真率覆盖语义层即可)
- **不强制覆盖率 80%**
- **不做"每次 PR 跑真 regenerator 真 LLM"** — 真 LLM 跑只在 weekly + 手动 + secret 配置下触发
- **不写性能基准**
- **不做"复写产物用户手编辑后再重跑"的端到端自动测**(交互场景,人工 acceptance 走 release-gate-checklist;CI 不跑)

### 5.7 测试体量

| 类别 | 新增 |
|---|---|
| 复写质量 eval(scenario YAML) | 6 scenario × 平均 3-4 turn ≈ 22 |
| sync-check 单元 | 7 case |
| CLI 集成(5 命令) | 25 case |
| Core engine 单元 | 50 case |
| 跨平台 fixture | 10 case |
| **合计** | **~114 新 tests**(总 ~390 = 原 275 + 新 114) |

---

## 6. 实施路线

### 6.1 阶段拆分(Plan 7 内部)

参考 forge spec §6 + Plan 4-6 实施风格,Plan 7 内部分 6 phase:

| Phase | 内容 | 时长(单人全职) | 依赖 |
|---|---|---|---|
| **A. 基础设施 + schema** | `anchors.ts` 解析 + 校验 / `legacy-bridge` CLI 子命令骨架 / 3 个新 schema 注册 / `legacy-anchors.yaml` 模板 | 1 周 | Plan 6 main 已合 |
| **B. 复写器 + 质量验证** | `regenerator.ts`(多版本合并 + disclaimer)/ `quality-judge.ts`(双 LLM 抽样,复用 forge-eval/judge.ts)/ `redact.ts`(默认规则 + mask)/ `conflict.ts`(mtime > role 优先级)/ budget 估算 | **1 周**(简化:无 forge-protected 段 + 无 retry)| A 完 |
| **C. sync-check + 差异报告** | `sync-check.ts`(archive hook + 受影响模块识别)/ `diff-report.ts`(5 档严重度 + markdown/YAML 双栈)/ `resolve` 命令 / `enforce_sync` 配置 | 1 周 | B 完 |
| **D. 索引 + mapper** | `mapper.ts`(二阶段第一阶段 + draft yaml)/ `indexer.ts`(每 anchor ~100 字摘要)/ archive 集成 hash 检测 | 0.5 周 | C 完(可与 C 并行) |
| **E. 复写质量 eval 框架** | `forge-eval/regeneration-scenarios/` 6 scenario / `regeneration-runner.ts` / CI workflow paths trigger / weekly schedule | 0.4 周 | B 完 |
| **F. 用户文档 + Release v0.2.0** | `docs/legacy-bridge.md` / 主 README + `getting-started.md` 加 brownfield 段 / CHANGELOG.md / release-gate-checklist.md 加 brownfield acceptance test / npm publish v0.2.0 工件 | 0.5 周 | A-E 全完 |

**合计 4.4 周**,加 review 修复 + 调试缓冲约 **4-5 周**。

### 6.2 阶段间依赖关系

```
                  ┌─────────────────────┐
                  │ A. 基础设施 + schema │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────────┐
                  │ B. 复写器 + quality-judge│  ◄── 核心 phase
                  │    (1 周,简化后)         │
                  └──────────┬──────────────┘
                             │
                  ┌──────────┼──────────┬──────────┐
                  ▼          ▼          ▼          ▼
                ┌────┐   ┌────┐   ┌────┐   ┌─────────┐
                │ C  │   │ D  │   │ E  │   │ F (Doc) │
                │sync│   │idx │   │eval│   │ Release │
                └─┬──┘   └─┬──┘   └─┬──┘   └────┬────┘
                  │        │        │            │
                  └────────┴────────┴────────────┘
                                │
                                ▼
                          v0.2.0 候选
```

C/D/E 在 B 完成后可部分并行;F 必须最后。

### 6.3 风险与开放问题

| # | 风险 | 缓解 |
|---|---|---|
| 1 | 复写保真率 90% 阈值是否合理 | Phase E 用 6 scenario 校准;若多次跑保真率波动大,降到 85% 默认;附 doc 让用户自行 override |
| 2 | 多版本 anchors 边角情况(同 role 多个 authoritative=true / 历史版被 LLM "复活" 已废弃需求) | Phase A schema 校验拒绝同 role 多 true;Phase B `--include-historical` flag 默认关闭;eval scenario `messy-srs-multi-version.yaml` 显式覆盖 |
| 3 | Excel 解析复杂度 | Phase A 用 `xlsx` 或 `exceljs` 库;不支持 chart / pivot / formula;复杂 Excel 提示用户先导出 .csv |
| 4 | redact 默认规则覆盖度 | Phase B 内置 5-7 条最常见规则;其他用户自补;不追求穷尽 |
| 5 | Anthropic Sonnet 4.7 切换(继承 Plan 5 风险)| v0.2 锁 4.6;Phase E eval scenario 同样 4.6 baseline;4.7 出来时 v0.3 重跑 |
| 6 | 跨 anchor 一致性自动决策的边角情况(SRS 与 HLD 矛盾,但用户其实想保留这个矛盾以便讨论)| Phase C `--no-auto-resolve-cross-anchor` flag(高级用户用);默认走自动决策 |
| 7 | one-shot regenerate 重跑会覆盖用户手编辑 | T3 数据流明示"重跑前须 git commit 当前版";`regenerate` 命令前置检测 git status 含 unstaged 改动 → warn confirm |

### 6.4 与 forge 现有路线图衔接

```
v0.1.0 (Plan 1-6, 已发布)
    │
    ▼
v0.2.0 (Plan 7) — brownfield-bridge
    │
    ├─► Layer 1 sync-check
    ├─► Layer 2 索引摘要
    └─► Layer 3a 保守复写器(one-shot)
    │
    ▼
v0.3.0 (规划) — Plan 8+
    ├─► OpenCode adapter(原 spec §7 v0.2 → v0.3)
    ├─► specs-sync delete operation(原 spec §7 v0.2 → v0.3)
    ├─► 反向 sync(改老锚点 → 提示新 change)
    ├─► 跨 anchor 一致性专门审计命令(legacy-bridge audit-consistency)
    └─► 真 brownfield 代码逆向(无文档项目,LLM 从代码推 SRS)
```

注:v0.2 不再做 OpenCode 与 specs-sync delete(原 spec §7 标 v0.2 的两项)— brownfield 工作量已经足够大,这两项推 v0.3 更合理。Plan 7 完成后,**spec §7 的 v0.2 范围只有 brownfield-bridge 这一项**。

---

## 7. 不在 v0.2 范围(显式)

继承 forge spec §7 的"不做项",并新增 brownfield 相关:

- ❌ **不替代老文档**(只共存 + 同步)
- ❌ **不导入老文档为 forge GWT specs**(决策 #6;sync-check 持续同步替代一次性导入)
- ❌ **不导入验收报告**(决策 #8;关键决策用户手摘要塞 config.yaml#context)
- ❌ **不实施 forge-protected 段保留机制**(决策 #15-17;复写器 one-shot 不重跑)
- ❌ **不做 LLM 自评保真率**(决策 #16;靠双 LLM 抽样)
- ❌ **不支持外部文档 URL**(决策 #12;v0.2 只支持 git 内文件)
- ❌ **不支持 Word / PDF 原生解析**(决策 #13;用户先 pandoc 转 markdown)
- ❌ **不在复写产物**还原 redact 占位(决策 #20;敏感数据不进 forge)
- ❌ **不自动重跑 regenerate**(决策 #15;用户主动跑;hash 过期只 warn)
- ❌ **不实施反向 sync**(老锚点改了 → 自动建议新 change;v0.3)
- ❌ **不实施跨 anchor 一致性专门审计**(自动决策融入 sync-check;v0.3 单独命令)
- ❌ **不实施代码逆向 brownfield**(无文档项目从代码推 SRS;v0.3)

---

## 8. 与 v0.1.0 现有结构衔接(零冲突)

### 8.1 文件命名空间不冲突

- `forge/legacy-anchors.yaml` 是新文件,不与 `forge/config.yaml` / `forge/changes/` / `forge/specs/` / `forge/drafts/` 冲突
- `forge/docs/` 是新顶级目录(v0.1 没有),与现有结构平行
- `forge/legacy-sync-state/` 同上
- 老文档原件留在用户原位(`docs/legacy/` 或其他用户指定路径),forge 仅读不写

### 8.2 archive 工作流向后兼容

- 已有 forge 项目升级到 v0.2 后,**没配 legacy-anchors.yaml** 时 sync-check 自动 graceful skip(决策 #11),archive 行为完全不变
- v0.1.0 的项目无需 migration,直接装 v0.2 即可
- 配了 anchors.yaml 后,sync-check 默认**不阻塞** archive(决策 #19),用户体验渐进

### 8.3 forge-eval 框架延伸

- Plan 5 的 forge-eval 基础(`runner.ts` / `judge.ts` / `report.ts` / `budget.ts`)在 v0.2 被 brownfield 复用
- 新增 `forge-eval/regeneration-scenarios/`(6 scenario)+ `regeneration-runner.ts`,与现有 `forge-eval/scenarios/`(12 个 skill)平行
- `pnpm eval` 默认仍只跑 skill scenarios(向后兼容);加 `pnpm eval-regen` 单独跑 regeneration scenarios

### 8.4 hash + marker 哲学一致

- `legacy-anchors.yaml` 的 anchor hash 用 SHA256(同 spec §3.4 marker hash)
- sync-state YAML 的 status 字段(pending / resolved-by-doc-update / false-positive / skipped)同 marker review_outcomes resolved 风格
- 都是"显式声明 + 严格校验 + 不擅自修复"

---

## 9. 许可与署名

- forge 自身:MIT(同 v0.1)
- 复写产物:由 forge 工具生成,默认 MIT(用户可在 `forge/config.yaml#license` 覆盖);复写产物 frontmatter 含 `generated-by: forge-legacy-bridge` 标识
- 老文档原件(`docs/legacy/`)的版权归用户;forge 不修改不持有
- 复写产物 frontmatter 自动加合规 disclaimer:

```markdown
---
generated-by: forge-legacy-bridge
generated-at: 2026-05-05T10:30:00Z
sources:
  - docs/legacy/SRS-v3.2.md
  - docs/legacy/payment-detailed.md
fidelity-rate: 92%
license: MIT
---

> **⚠ 此文档由 forge 自动生成**
> 这是 LLM 复写的规范化版本,**不是项目权威交付物**。
> 权威源:`docs/legacy/`(用户原版老文档)
> 客户验收 / 审计 / 法律证据请引用权威源,不要引用本文件
```

---

**文档结束**。Plan 7 实施细节见 `docs/plans/2026-05-05-plan-7-brownfield.md`(待 invoke writing-plans 写)。
