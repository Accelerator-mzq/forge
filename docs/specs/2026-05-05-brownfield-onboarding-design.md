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

v0.2 brownfield onboarding 的核心目标:**让 forge 与老文档体系并存 + archive→legacy 单向同步**(反向 sync 推 v0.3),而非"替代"。

### 1.1.1 v0.2 突破 v0.1 §2.3 LLM 边界(必读)

主 spec §2.3 line 189 明确:"不在用户运行时写 LLM 调用——所有用户的 AI 行为都通过 harness 发生,forge 不替代 harness 也不直接调 Anthropic API 服务用户。**例外**:forge 自身的开发期 skill eval"。

**v0.2 brownfield 是已知的第二个例外**。`forge legacy-bridge regenerate / index / sync-check` 三个命令在用户路径上直接调 Anthropic API(读老文档 + 代码 + 测试用例 → 发 LLM)。这突破 v0.1 §2.3 边界,需要:

- **显式 opt-in 机制**:`forge/config.yaml#legacy_bridge.allow_llm_calls` 默认 `false`;首次跑 `regenerate / index / sync-check` 时,工具检测到该字段缺失或为 false 时拒绝运行,**要求用户显式启用并明示数据将被发送到 Anthropic API**(类似 ANTHROPIC_API_KEY 缺失的提示)
- **数据传输声明**:启用后,工具在每次 LLM 调用前显示一行 stdout `→ sending {N} bytes to Anthropic API ({provider}, region: {region})`(用户能感知数据流向)
- **provider 配置(预留)**:`legacy_bridge.provider: anthropic`(v0.2 默认且唯一);v0.3 加 OpenAI / 自托管选项时只需改此字段
- **离线禁用**:用户在 enterprise / air-gapped 场景可永久 `allow_llm_calls: false`,brownfield 工具拒绝运行,sync-check 在 archive hook 中自动 graceful skip

**主 spec §2.3 须同步更新**(本 design 的 PR 内一并改),把"v0.2 brownfield"列为已知例外 #2。

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
| 18 | 跨 anchor 一致性 | **同 role 多版本** → 自动用 `authoritative: true` 当前版(无 diff);**跨 role 不一致**(SRS vs HLD)→ **默认入 diff 让用户审**(major 档),**不**自动决策;`config.yaml#legacy_bridge.auto_resolve_cross_anchor: true` 才走 mtime > role 优先级自动决策(高级用户用)|
| 19 | sync-check 触发时机 | **enforce 检查走 archive preflight**(Move→Sync 之前);post-archive 仅产报告(不再用作阻塞);`config.yaml#legacy_bridge.enforce_sync: true` 时 critical 未 resolve 在 preflight 阻塞,exit 2 |
| 20 | 敏感数据 redact | **redact 字段配置**(regex / 字面量),发 LLM 前 mask;内置 12+ 条默认规则(AWS/GCP/Azure key、GitHub PAT、Slack token、JWT、DB URL with creds、私钥 BEGIN markers、邮箱、IPv4-private、generic Bearer / Basic 认证) |
| 21 | 合规边界 | 复写产物**不替代权威交付物**;每份复写产物自动加 frontmatter + 顶部 disclaimer;**许可默认 `derived-from-source`**(继承 anchor 源许可,不擅自 MIT 化);`forge/config.yaml#legacy_bridge.regen_license` 用户可覆盖 |
| 22 | LLM 调用边界 | **突破 v0.1 §2.3 边界**:`legacy-bridge regenerate / index / sync-check` 在用户路径直调 Anthropic API。需 `config.yaml#legacy_bridge.allow_llm_calls: true` 显式 opt-in;首次缺失 → 拒绝运行 + 提示;每次 LLM 调用前 stdout 显示数据传输信息(provider / 字节数);`false` 时 sync-check 自动 graceful skip(不阻塞 archive) |
| 23 | 并发 lock | `forge/.cache/legacy-bridge.lock`(独立于 archive.lock);`map / regenerate / index / resolve` 各自获 legacy-bridge lock;`sync-check` 在 archive 内调用时**复用 archive.lock**(避免双重 lock 死锁);并发冲突时后到者 exit 5(同 archive.lock 模式)|

---

## 2. 架构与组件

### 2.1 CLI 入口

`forge legacy-bridge` 主命令 + 5 个子命令(对齐 forge 现有 `forge config get/set/profile` 风格):

| 子命令 | 用途 | 触发 |
|---|---|---|
| `forge legacy-bridge map [--merge \| --overwrite]` | 二阶段 mapping 第一阶段(LLM 扫 docs/+src/ 产 anchors-draft.yaml + 同名 .md 概览)。`--merge`(默认)与已存在 anchors.yaml 合并新发现项,保留用户审过部分;`--overwrite` 全量重生成(覆盖用户改动,需用户确认)| 用户主动(初始化时跑一次) |
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

archive 流程**新增两个 hook 点**:preflight(Move 之前)与 post-archive(Sync 之后)。enforce 阻塞走 preflight,因为 Move 后再阻塞已晚——change 已搬到 archive 目录、`forge/specs/` 已 sync。

```
用户跑 /forge:archive
   │
   ▼
src/cli/commands/archive.ts(Plan 3+6 写的)
   │
   ├─► acquireLock("archive")(原 archive.lock,Plan 3 写的)
   │
   ├─► 【新增 PREFLIGHT】sync-check enforce(可阻塞)
   │       │
   │       │ 仅当:legacy-anchors.yaml 存在 AND
   │       │      config.yaml#legacy_bridge.allow_llm_calls=true AND
   │       │      config.yaml#legacy_bridge.enforce_sync=true
   │       │ 才进入此 hook(否则跳过)
   │       │
   │       ├─► 找本次 change 影响的模块,LLM 输出 5 档差异
   │       │   → forge/legacy-sync-state/<change-id>.{md,yaml}
   │       │
   │       ├─► 检测 anchor hash 变化 / 跨 anchor 冲突
   │       │
   │       ├─► IF 含 critical 项 status=pending → exit 2 + 提示
   │       │   "X 项 critical 差异未 resolve,跑
   │       │    forge legacy-bridge resolve <change-id> 后重试"
   │       │   (此时 archive 未动用户文件)
   │       │
   │       └─► IF 全部 critical 已 ack → 继续
   │
   ├─► archive 严格门禁(原有,不动)
   ├─► archiveTransaction Move→Sync(原有,不动)
   │
   ├─► 【新增 POST-ARCHIVE】sync-check 报告(不阻塞)
   │       │
   │       │ 仅当 allow_llm_calls=true 才进入(graceful skip otherwise)
   │       │
   │       ├─► 若 enforce_sync=false:首次跑 sync-check 产报告
   │       │   (preflight 已 skip,这是用户唯一时机看 sync 结果)
   │       │
   │       ├─► 若 enforce_sync=true:preflight 已跑过,这里只
   │       │   更新 anchor hash + last_sync_at,不再调 LLM
   │       │
   │       └─► stdout:"⚠ N 项老文档可能需更新,详见 sync-state/<id>.md"
   │
   ├─► releaseLock("archive")
   │
   └─► archive exit 0
```

**enforce_sync 默认值**:`false`(用户体验渐进 — 老 forge 项目升级到 v0.2 后行为不变)。用户在合规场景手动启用 `true` 进入严格模式。

**安全性保证**:
- 默认模式(enforce_sync=false):sync-check post-archive 跑;archive 行为兼容 v0.1
- 严格模式(enforce_sync=true):sync-check preflight 跑;**critical 未 resolve 时 archive 还没 Move 文件**,exit 2 不破坏现有状态
- `archive.lock` 包裹整个流程,sync-check 复用此锁(决策 #23),不会有"sync-check 跑到一半另一进程 archive"竞争

### 2.6 并发 lock 设计(决策 #23)

brownfield 命令读写共享状态(`legacy-anchors.yaml` 含 hash + last_regenerated;`forge/legacy-sync-state/<id>.yaml` 含 status;`forge/docs/regenerated/`)。无锁 → `regenerate` 与 `archive sync-check` 同时跑会:

- regenerate 写 anchor hash 到 yaml,sync-check 读到旧 hash,误报"anchor 已改动"
- 两个 archive 同时跑(虽然 archive.lock 已挡),但若 regenerate 跟 archive 在不同进程同时写 yaml,可能互相覆盖

**设计**:

| Lock 文件 | 持有者 | 作用 |
|---|---|---|
| `forge/.cache/archive.lock`(Plan 3 已有) | `forge archive`(及其内部的 sync-check)| 防 archive 并发 |
| `forge/.cache/legacy-bridge.lock`(新增) | `legacy-bridge map / regenerate / index / resolve` 各自获 | 防 brownfield 命令之间冲突 |

**复用 vs 独立**(决策点):

- `archive sync-check` 在 archive 内部跑 → **复用 archive.lock**,不再获 legacy-bridge.lock(避免双重 lock 死锁:某进程 A 持有 archive.lock 等 legacy-bridge.lock,某进程 B 持有 legacy-bridge.lock 等 archive.lock)
- `legacy-bridge regenerate / index` 跟 archive 互斥:用户跑 regenerate 时 archive 阻塞(获 archive.lock 失败 → exit 5);反之亦然 → **regenerate 同时获 archive.lock + legacy-bridge.lock**,顺序固定为先 archive.lock 后 legacy-bridge.lock(任何持有 legacy-bridge.lock 的命令都不能再获 archive.lock)
- `legacy-bridge map` 不写 sync-state,不影响 archive,只获 legacy-bridge.lock
- `legacy-bridge resolve` 改 sync-state.yaml,但不与 archive 冲突(archive 在 preflight 检测 status,看到 pending 就阻塞,resolve 完成前用户必须手 ack)→ 仅获 legacy-bridge.lock

**实现复用 Plan 3** `src/core/archive/lock.ts`(`acquireLock(forgeRoot, mode)`),`mode` 字段扩展支持 `'archive' | 'recover' | 'legacy-bridge-map' | 'legacy-bridge-regenerate' | ...`,持有者写入 `{pid, started_at, mode}` 与现有格式一致。

**stale lock**:与 archive.lock 相同处理(Plan 3 line 626):lock 已存在 → 检 pid 存活 → 不存活强制清理。

### 2.7 LLM 调用 opt-in 流程(决策 #22)

首次跑 `legacy-bridge regenerate / index / sync-check`(或 archive 中触发 sync-check)时:

```
forge legacy-bridge regenerate
   │
   ▼
检查 forge/config.yaml#legacy_bridge.allow_llm_calls
   │
   ├─► 未配置 / 为 false →
   │      ┌──────────────────────────────────────────────────────────────┐
   │      │ ✗ legacy-bridge 命令需要发送数据到 Anthropic API。            │
   │      │                                                                │
   │      │ 数据传输内容:                                                  │
   │      │ - docs/legacy/ 下的老文档全文                                  │
   │      │ - src/ 下的代码片段                                            │
   │      │ - tests/ 下的测试用例                                          │
   │      │                                                                │
   │      │ 数据已通过 forge/legacy-anchors.yaml#redact 配置 mask。        │
   │      │ 提供商:Anthropic Claude API(默认,v0.2 唯一支持)            │
   │      │ 数据驻留:Anthropic 当前默认不保留 30+ 天                      │
   │      │                                                                │
   │      │ 启用步骤:                                                      │
   │      │ 1. 在 forge/config.yaml 加:                                   │
   │      │    legacy_bridge:                                              │
   │      │      allow_llm_calls: true                                     │
   │      │ 2. 跑 forge legacy-bridge --acknowledge-data-transfer          │
   │      │    (一次性 ack,记录到 forge/.cache/llm-ack.yaml)              │
   │      │ 3. 重新跑当前命令                                              │
   │      │                                                                │
   │      │ 合规场景:enterprise / air-gapped / GDPR 要求数据驻留时,      │
   │      │ 保持 false 或省略此字段。brownfield 工具拒绝运行,            │
   │      │ archive sync-check 自动 graceful skip,forge 主工作流不变。   │
   │      └──────────────────────────────────────────────────────────────┘
   │      exit 1
   │
   └─► 为 true 且 ack 文件存在 →
          每次 LLM 调用前 stdout:
            "→ Anthropic API: sending {N} bytes
              (provider=anthropic, region={region}, model=claude-sonnet-4-6)"
          继续执行
```

`--acknowledge-data-transfer` 一次性 ack 写入 `forge/.cache/llm-ack.yaml`(含 `acknowledged_at`、`config_hash`);若用户后改 config 显著(如 redact 字段),hash 变 → 要求重新 ack。这是 GDPR / 合规审计的"用户知情同意"证据链。

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
| 老文档非 UTF-8(GBK Word 转 markdown 常见) | Windows 老项目 | 强制 `{ encoding: 'utf8' }`;mojibake → exit 2 + 提示用户用 iconv / vscode 转换;**dry-run 时**(`--dry-run`)输出文件路径 + 疑似编码(用 `chardet` 库探测,可选依赖)+ mojibake 段前后 80 字符 hex/text 对照,帮用户定位 |
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
| **anchors.yaml 记录的 hash 与实际 anchor 文件 hash 一致**(此哲学**比 v0.1 marker hash 更宽松**:marker hash 不一致直接拒绝 archive,anchor hash 不一致默认仅 warn —— 因为 anchor 改动是用户合规活动的常态,marker 改动是过期信号) | archive 的 sync-check 时**重算**每 anchor 的 hash;不一致默认 warn(不阻塞);`config.yaml#legacy_bridge.enforce_sync=true` 时进入 preflight,critical 项 status=pending → exit 2;regenerate 跑完才更新 hash + last_regenerated |
| **sync-state YAML 的 status ∈ {pending, resolved-by-doc-update, false-positive, skipped}** | resolve 命令前置校验;非法值 exit 1 |
| **resolve 校验所有 diffs status ≠ pending 才标 resolved** | 仍有 pending → exit 2 + 列出 |
| **enforce_sync = true 时,critical 未 resolve 阻塞 archive**(走 preflight,Move 之前;Move 之后再阻塞已晚)| archive **preflight** 检测最近 sync-state.yaml 含 critical 未 resolve → exit 2(此时 change 未 Move,用户文件零变化) |
| **复写产物 markdown 格式合法**(章节层级 / code block 闭合 / frontmatter 合法) | regenerator output validator(用 gray-matter + remark);不合法 → exit 2 + .invalid 文件 |
| **复写产物 frontmatter 含 disclaimer + license** | regenerator 自动添加 `generated-by: forge-legacy-bridge` + `version: <commit-sha>` + `license: derived-from-source`(决策 #21)+ 顶部声明 "**此文档由 LLM 复写,不是项目权威交付物**;权威源:`docs/legacy/`" |
| **跨 anchor 一致性默认入 diff(决策 #18 修订)** | conflict.ts:**同 role 多版本** → 用 authoritative=true 当前版自动决策(无 diff);**跨 role 不一致** → **默认入 diff(major 档)让用户审**;`config.yaml#legacy_bridge.auto_resolve_cross_anchor=true` 才走 mtime > role 优先级自动决策(高级用户,理解 mtime 风险后才启用) |
| **LLM opt-in 已 ack** | 跑前检测 `forge/.cache/llm-ack.yaml` + `config.yaml#legacy_bridge.allow_llm_calls=true`;任一缺失 → exit 1 + 提示启用步骤(决策 #22) |
| **lock 顺序**(避免死锁) | regenerate / index 同时获 archive.lock + legacy-bridge.lock,顺序固定:**先 archive.lock 后 legacy-bridge.lock**;sync-check 在 archive 内不重复获 lock(复用 archive.lock)|

### 4.4 预算与速率(成本控制)

| 场景 | 处理 |
|---|---|
| `regenerate` 估算 cost > $20(中型项目 SRS+HLD+LLD+system-tests 全跑) | 命令开头 console.warn 估算成本;**TTY**(交互终端)→ 5 秒倒计时 + Ctrl-C 取消;**非 TTY**(CI / 脚本管道)→ 拒绝运行,exit 1 + 提示 `--yes` flag(用户显式同意)|
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

**默认内置规则**(12 类,用户不写也兜底):

云厂商 secret:
- AWS access key:`AKIA[0-9A-Z]{16}`
- GCP API key:`AIza[0-9A-Za-z_-]{35}`
- Azure connection string:`DefaultEndpointsProtocol=...`

代码托管 / 协作工具 token:
- GitHub Personal Access Token:`ghp_[A-Za-z0-9]{36,}` / `gho_[A-Za-z0-9]{36,}` / `ghu_[A-Za-z0-9]{36,}` / `ghs_[A-Za-z0-9]{36,}` / `ghr_[A-Za-z0-9]{36,}`
- GitLab token:`glpat-[A-Za-z0-9_-]{20,}`
- Slack token:`xox[bpoa]-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{20,}`
- OAuth client secret(generic Bearer / Basic):`(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{20,}`

身份验证:
- JWT:`eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`
- 私钥 BEGIN markers:`-----BEGIN (RSA|EC|OPENSSH|DSA|ENCRYPTED) PRIVATE KEY-----`

数据库连接:
- DB URL with creds:`(postgres|mysql|mongodb|redis)(\+[a-z]+)?://[^:]+:[^@]+@[^/\s]+`(匹配 `postgres://user:pass@host`)

通用 PII:
- Email:`[\w.-]+@[\w.-]+\.[a-z]{2,4}`
- IPv4 private:`10\.\d+\.\d+\.\d+` / `192\.168\.\d+\.\d+` / `172\.(1[6-9]|2\d|3[01])\.\d+\.\d+`

**`--redact-report` flag**:跑命令时加此 flag → stdout 输出每条规则的命中**数量**(不输出原值),用户能验证 redact 真生效:

```
$ forge legacy-bridge regenerate --redact-report
[redact] aws-access-key:    3 命中
[redact] github-pat:         12 命中
[redact] db-url-with-creds:  2 命中
[redact] jwt:                0 命中
...(共 12 类规则)
total: 17 项已 mask 为 <<REDACTED-N>>
```

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
- **critical-facts 子集**(标注哪些事实属于 critical 级别 — 合规 / 安全 / 业务硬约束)
- 期望保真率阈值

**分层抽样**(对抗 LLM 长文档低频 fact 漏报):

抽样不是简单"随机 30 条",而是:

1. **critical-facts 全量抽**(标注的 critical 集合,通常 5-10 条)→ 这部分**必须 100% 保留**(任一丢失 → 整体失败,无关 90% 阈值)
2. **每个章节按比例抽**(章节越大抽越多,但每章至少 1 条)→ 防止 LLM 集中改写某章导致该章 fact 全丢但其他章 fact 多保留拉高总比率的"统计骗术"
3. **总抽样数仍约 30**,但分布按 1+2 决定

数据形态:

```yaml
# regeneration-scenarios/well-formed-srs.yaml
input_anchors:
  - role: requirements
    path: fixtures/srs.md
key_facts:
  - text: "支付幂等性必须用 Idempotency-Key 头"
    section: "§4.5"
    critical: true            # 合规硬约束,必抽必保留
  - text: "Order 表 user_id 字段非空"
    section: "§3.1"
    critical: true
  - text: "退款 7 天内完成"
    section: "§4.6"
    critical: false           # 业务规则,允许同义改写但不能丢

regeneration_threshold: 0.9   # 非 critical 90% 保真率
critical_must_preserve: 1.0   # critical 必须 100%
```

跑 `pnpm eval-regen` → 调真 LLM → 分层抽样 → 验证 critical 100% + 总体 ≥ 90% → 输出报告(含未覆盖章节清单)。

`quality-judge.ts` 输出新增字段:

```typescript
interface QualityResult {
  total_rate: number;            // 总体保真率(critical + non-critical)
  critical_rate: number;         // critical 子集保真率(必须 1.0)
  per_section_rates: Record<string, number>;  // 各章节保真率(防统计骗术)
  lost_critical: KeyFact[];      // 丢失的 critical(致命)
  lost_non_critical: KeyFact[];  // 丢失的 non-critical
  uncovered_sections: string[];  // 抽样未覆盖的章节(警告)
}
```

**失败路径**:critical 任一丢失 → exit 2,不 retry,直接报告 + 写 .partial 让用户决定接受 / 重写 prompt / 手补(决策 #16,无 retry)。

CI 集成同 Plan 5:**weekly + PR(若改 regenerator.ts / quality-judge.ts) + 手动**;`ANTHROPIC_API_KEY` 缺失时优雅 skip。

### 5.2 优先级第二:sync-check 行为单元测试

sync-check 是 brownfield 用户**每次 archive 都跑**的核心路径。错了影响最大(差异报告漏报 / 误报)。

```
tests/core/legacy-bridge/sync-check.test.ts(mock LLM client)
- 受影响模块识别:本次 change 改了 specs/payment.md → 找出 anchors.modules.payment 列的所有文件
- 5 档严重度判定:fixture 中 LLM 返回 5 档,验证报告分组正确
- graceful skip:legacy-anchors.yaml 不存在 → exit 0 + skip
- graceful skip:allow_llm_calls=false → exit 0 + skip(决策 #22)
- malformed yaml(用户改坏 anchors.yaml,非法字段 / 同 role 多 authoritative)→ exit 1 + 行号
- hash 过期检测:anchor SHA256 与 yaml 记录不一致 → warn 输出含 "anchor X 已改动"
- 部分降级:anchors.yaml 引用 5 文件,3 存 2 缺 → 处理 3 个 + 报告 2 缺,不整体失败
- 全干净:本次 change 改的模块在 anchors 里没配 → "no affected anchors, exiting"
- 同 role 跨版本 → 自动用 authoritative=true 当前版(无 diff)
- **跨 role 不一致默认入 diff**(决策 #18 修订);auto_resolve_cross_anchor=true 时才走 mtime>role 自动决策

并发 / lock 测试(新增,对抗 Codex C-2 / I-5):
- regenerate 与 archive 同时跑 → archive.lock 互斥(后到者 exit 5)
- regenerate 与 map 同时跑 → legacy-bridge.lock 互斥
- archive 内 sync-check 复用 archive.lock(不再获 legacy-bridge.lock,不死锁)
- resolve 与 sync-check 同 change-id 竞争(resolve 改 status,sync-check 重写 yaml)→ legacy-bridge.lock 互斥
- stale lock(pid 不存活)→ 自动清理后获(同 archive.lock 模式)
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
| sync-check 单元(含并发 / lock / malformed yaml / opt-in skip)| 12 case |
| CLI 集成(5 命令) | 25 case |
| Core engine 单元(含 redact / conflict / lock / quality-judge 分层抽样)| 60 case |
| 跨平台 fixture | 10 case |
| 并发 / 集成测试(I-5 新增) | 6 case |
| **合计** | **~135 新 tests**(总 ~410 = 原 275 + 新 135) |

---

## 6. 实施路线

### 6.1 阶段拆分(Plan 7 内部)

参考 forge spec §6 + Plan 4-6 实施风格,Plan 7 内部分 6 phase:

原始版本 Phase B "1 周做 5 模块" Codex 对抗审查指出过于乐观(Plan 6 实际经验:archive --recover case C 单一功能 5 sub-task 用了 1 周)。**修订版**把 B 拆 B1/B2/B3,E/F 也重估:

| Phase | 内容 | 时长(单人全职) | 依赖 |
|---|---|---|---|
| **A. 基础设施 + schema** | `anchors.ts` 解析 + 校验(支持 `forge-legacy-anchor/v1` schema + redact + role + multi-version + lock 字段)/ `legacy-bridge` CLI 子命令骨架(commander)/ 4 个新 schema 注册(legacy-anchor / legacy-sync / regen-quality / llm-ack)/ `legacy-anchors.yaml` 模板 / **依赖选定**:`exceljs`(Apache 2.0,选定理由 见 §6.5)+ `chardet`(可选 dep,encoding detect) / 复用 `src/core/archive/lock.ts` 加 mode 扩展(决策 #23)/ `forge/.cache/llm-ack.yaml` schema | 1 周 | Plan 6 main 已合 |
| **B1. redact + conflict + LLM opt-in** | `redact.ts`(12+ 默认规则 + 自定义 + mask)/ `conflict.ts`(同 role authoritative + 跨 role 默认入 diff)/ `legacy-bridge --acknowledge-data-transfer` ack 流程(决策 #22)/ budget 估算 + TTY/非 TTY 分支 | 0.5 周 | A 完 |
| **B2. regenerator + 多版本 + disclaimer** | `regenerator.ts`(读 anchors → 多版本合并 → 调 LLM → 加 frontmatter `generated-by` + `license: derived-from-source` + 顶部 disclaimer → 输出)/ output validator(gray-matter + remark)/ excel 解析(`exceljs`,sheet 字段精确指向) | 0.5 周 | B1 完 |
| **B3. quality-judge 分层抽样** | `quality-judge.ts`(模型 A 抽 fact + critical-facts 全量必抽 + 各章节按比例抽;模型 B 验证三态 preserved/paraphrased/lost;输出 per-section 保真率 + lost critical / lost non-critical / uncovered sections;无 retry,失败直接 .partial)| 0.5 周 | B2 完 |
| **C. sync-check + 差异报告** | `sync-check.ts`(archive **preflight** + post-archive 双 hook,根据 enforce_sync 选择走哪边)/ `diff-report.ts`(5 档严重度,跨 anchor 冲突默认入 diff)/ `resolve` 命令 / `enforce_sync` 配置 / archive.ts 集成 preflight | 1 周 | B3 完 |
| **D. 索引 + mapper** | `mapper.ts`(二阶段第一阶段 + draft yaml + `--merge` / `--overwrite` 参数)/ `indexer.ts`(每 anchor ~100 字摘要 + 大文件分块)/ archive 集成 hash 检测 | 0.5 周 | C 完(可与 C 并行) |
| **E. 复写质量 eval 框架 + harden** | `forge-eval/regeneration-scenarios/` 6 scenario(含 critical-facts 标注)/ `regeneration-runner.ts` 分层抽样实现 / CI workflow paths trigger / weekly schedule / **release hardening 子任务**:并发场景测试(B/C/D 完后手工跑 regenerate 与 archive 同时跑验证 lock)、跨平台 fixture 验证 | **0.7 周** | B3 完(可与 C/D 并行) |
| **F. 用户文档 + Release v0.2.0** | `docs/legacy-bridge.md`(完整使用手册 + opt-in 流程示例 + 合规场景 FAQ)/ 主 README + `getting-started.md` 加 brownfield 段 / CHANGELOG.md / release-gate-checklist.md 加 brownfield acceptance test 段(7 个 acceptance scenario:opt-in 流程 / redact 真生效 / preflight 阻塞 / lock 并发 / 多 harness skill smoke 不退化 / Excel 解析 / disclaimer 含 license)/ npm publish v0.2.0 工件 / **同步更新主 spec §7**(I-7:OpenCode + specs-sync delete 路线图正式调整) | **0.7 周** | A-E 全完 |

**合计 5.4 周**,加 review 修复 + 调试缓冲约 **5-6 周**。

**修订理由**(对应 Codex I-4):
- 原 Phase B 1 周做 5 模块 → 拆 B1/B2/B3 各 0.5 周,功能边界清晰可独立 review
- 原 Phase E 0.4 周 → 0.7 周,加 release hardening 子任务(并发 / 跨平台 / 真 LLM eval 校准)
- 原 Phase F 0.5 周 → 0.7 周,加主 spec §7 同步更新 + acceptance test 数从 5 增到 7

### 6.2 阶段间依赖关系

### 6.2 阶段间依赖关系

```
                       ┌──────────────────────┐
                       │ A. 基础设施 + schema  │
                       │     (1 周)           │
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │ B1. redact+conflict  │
                       │     +LLM opt-in      │
                       │      (0.5 周)         │
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │ B2. regenerator+     │
                       │     多版本+disclaimer │
                       │      (0.5 周)         │
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │ B3. quality-judge    │
                       │     分层抽样          │
                       │      (0.5 周)         │
                       └──────────┬───────────┘
                                  │
                       ┌──────────┼──────────┬──────────┐
                       ▼          ▼          ▼          ▼
                     ┌────┐   ┌────┐   ┌──────┐   ┌────────┐
                     │ C  │   │ D  │   │  E   │   │   F    │
                     │sync│   │idx │   │ eval │   │  Doc + │
                     │1 周 │   │0.5 │   │+harden│   │Release │
                     └─┬──┘   └─┬──┘   │0.7 周 │   │0.7 周  │
                       │        │      └──┬───┘   └────┬───┘
                       │        │         │            │
                       └────────┴─────────┴────────────┘
                                          │
                                          ▼
                                    v0.2.0 候选
```

C/D/E 在 B3 完成后可部分并行;F 必须最后(因含主 spec §7 同步更新 + 完整 release-gate)。

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

### 6.5 关键依赖选定(对抗 Codex I-6)

`.xlsx` 解析库二选一:

| 库 | 许可 | 大小 | 解析能力 | 公式 / pivot / chart |
|---|---|---|---|---|
| `xlsx` (SheetJS Community) | Apache 2.0 | ~660KB | 强 | 公式部分支持,pivot/chart 不支持 |
| **`exceljs`(选定)** | MIT | ~340KB | 强 | 公式不解析(读取计算缓存值),pivot/chart 不支持 |

**选 `exceljs`**:
- MIT 许可与 forge 主项目一致(`xlsx` Apache 2.0 兼容但增加 license 复杂度)
- 大小更小(节约打包尺寸)
- v0.2 不需要公式 / pivot / chart(测试用例 Excel 通常是简单 sheet);若用户 Excel 含这些复杂特性,**Phase A 失败提示用户先导出 .csv**(spec §4.1 已声明)
- v0.3 若需要公式/pivot/chart 解析,届时再加 `xlsx` 或迁移

**Phase A 加依赖**:`pnpm add exceljs@^4`,验证 npm pack tarball 增量 ~340KB(可接受,对齐 release-gate.mjs 的 tarball 内容验证)。

### 6.6 与 forge 现有路线图衔接

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

**主 spec §7 同步更新**(对抗 Codex I-7):本 design 修订路线图后,Plan 7 Phase F 内含主 spec `docs/specs/2026-05-04-forge-fusion-design.md` §7 / §6 路线图修订:把 OpenCode adapter 与 specs-sync delete 从 v0.2 移到 v0.3 范围。同时 specs-sync 在 archive 中遇到 delete delta 时仍保持现有的 `v0.2 not implemented` 错误信息,这是已发布 v0.1 的行为延续(用户预期内,不破坏向后兼容)。

---

## 7. 不在 v0.2 范围(显式)

继承 forge spec §7 的"不做项",并新增 brownfield 相关:

- ❌ **不替代老文档**(只共存 + archive→legacy 单向同步;反向 sync 推 v0.3)
- ❌ **不实施反向 sync**(改老锚点 → 自动建议新 change;v0.3 — 注:v0.2 hash 检测 warn 是被动信号,不是反向 sync)
- ❌ **不导入老文档为 forge GWT specs**(决策 #6;sync-check 持续同步替代一次性导入)
- ❌ **不全量导入验收报告**(决策 #8);**但 v0.2 接受 metadata-only 导入**(对抗 Codex I-8):用户可在 `legacy-anchors.yaml` 把验收报告 mark 为 `role: acceptance-report`,工具仅在 `forge/docs/index.md` 索引该文件名 + 客户 / 日期 / 通过条目数等 metadata(不读全文,不发 LLM),提供 trace graph 入口;具体内容用户手查原文件
- ❌ **不实施 forge-protected 段保留机制**(决策 #15-17;复写器 one-shot 不重跑)
- ❌ **不做 LLM 自评保真率**(决策 #16;靠双 LLM 抽样)
- ❌ **不默认开启 LLM 调用**(决策 #22;突破 v0.1 §2.3 边界,需 opt-in)
- ❌ **不支持外部文档 URL**(决策 #12;v0.2 只支持 git 内文件)
- ❌ **不支持 Word / PDF 原生解析**(决策 #13;用户先 pandoc 转 markdown)
- ❌ **不在复写产物**还原 redact 占位(决策 #20;敏感数据不进 forge)
- ❌ **不自动重跑 regenerate**(决策 #15;用户主动跑;hash 过期只 warn)
- ❌ **不实施跨 anchor 一致性专门审计**(默认入 diff 融入 sync-check;v0.3 单独命令做整体审计)
- ❌ **不实施代码逆向 brownfield**(无文档项目从代码推 SRS;v0.3)
- ❌ **不在非 TTY 环境跑 regenerate / index 时无声 confirm**(M-4:非 TTY 必须显式 `--yes`)

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

### 8.4 hash + marker 哲学**类似但不完全一致**(措辞修订 — Codex C-4)

- `legacy-anchors.yaml` 的 anchor hash 用 SHA256(同 spec §3.4 marker hash 算法)
- sync-state YAML 的 status 字段(pending / resolved-by-doc-update / false-positive / skipped)同 marker review_outcomes resolved 风格
- 都是"显式声明 + 严格校验 + 不擅自修复"
- **关键差异**(此 design 与 v0.1 marker 在严格度上的不对称):
  - v0.1 marker hash 不一致 → archive 直接拒绝(marker 是"过期信号",改了说明 verify/review 已失效)
  - **brownfield anchor hash 不一致默认仅 warn**(anchor 改动是用户合规活动的常态:每次老 SRS 评审后改一次很正常,严格阻塞会让工具不可用)
  - 用户可在合规场景设 `enforce_sync: true` 手动严格化,与 v0.1 marker 对齐
  - **本设计哲学声明**:brownfield 在默认安全级别上比 v0.1 marker **更宽松一档**,但提供 enforce_sync flag 让用户在需要时升级到与 v0.1 同等严格

---

## 9. 许可与署名

- forge 自身:MIT(同 v0.1)
- **复写产物默认许可:`derived-from-source`**(对抗 Codex I-9 — 不假定 MIT,因为客户 SRS 派生物可能不能 MIT 化):
  - frontmatter `license: derived-from-source` 表示"许可继承自 anchor 源,需用户根据老文档版权决定"
  - 用户可在 `forge/config.yaml#legacy_bridge.regen_license` 显式覆盖(如 MIT / Apache-2.0 / Proprietary / CC-BY-NC)
  - **不擅自 MIT 化**:防止用户把客户 SRS 复写产物错误以 MIT 发布、或提交到不允许衍生授权的仓库
- 老文档原件(`docs/legacy/`)的版权归用户;forge 不修改不持有
- **GDPR / 客户数据 / 跨境传输确认门**(对抗 Codex I-9):
  - 首次启用 `allow_llm_calls: true` 时,工具检测 `legacy-anchors.yaml` 是否含被标记 `contains_customer_data: true` 的文件
  - 若有 → 跑前额外提示"以下文件标为含客户数据,启用前请确认有数据出境授权(GDPR Art. 44+ / DPA 协议),并已签 Anthropic DPA"+ exit 1 等用户在 `forge/.cache/llm-ack.yaml` 加 `customer_data_acknowledged: true`
  - 若没 mark 但用户实际上有客户数据,责任自负(forge 仅在显式 mark 上提示,不做 PII 自动检测)
- 复写产物 frontmatter 自动加合规 disclaimer:

```markdown
---
generated-by: forge-legacy-bridge
generated-at: 2026-05-05T10:30:00Z
sources:
  - docs/legacy/SRS-v3.2.md
  - docs/legacy/payment-detailed.md
fidelity-rate: 92%
critical-fact-rate: 100%      # critical 子集保真率(分层抽样,决策 #16)
license: derived-from-source  # 默认值,见 §9
forge-version: 0.2.0
---

> **⚠ 此文档由 forge 自动生成**
> 这是 LLM 复写的规范化版本,**不是项目权威交付物**。
> 权威源:`docs/legacy/`(用户原版老文档)
> 客户验收 / 审计 / 法律证据请引用权威源,不要引用本文件
> 
> 许可:`derived-from-source` — 实际许可由 anchor 源决定,
> 在 `forge/config.yaml#legacy_bridge.regen_license` 显式声明前不假定任何 OSS 许可
```

---

---

## 10. 修订记录

### v0.2(本版本,2026-05-05 — 基于 Codex 对抗审查的修订)

外部对抗审查(Codex `gpt-5.3-codex` `--effort high`)指出 v0.1 设计有 4 项 Critical + 9 项 Important + 5 项 Minor 缺陷。本 design 经核实后接受/修订/反驳如下:

| Codex 项 | 处理 | 修订位置 |
|---|---|---|
| C-1 LLM 边界(突破 v0.1 §2.3) | 接受,加 opt-in 机制 | §1.1.1 / 决策 #22 / §2.7 |
| C-2 并发 lock 缺失 | 接受,加共享 lock 设计 | 决策 #23 / §2.6 |
| C-3 sync-check 时机错误(post-archive 阻塞失效) | 接受,改 preflight | 决策 #19 / §2.5 重写 |
| C-4 hash 哲学双标措辞 | 部分接受(改文档表述,默认值合理保留) | §8.4 修订 |
| I-1 redact 默认规则不全 | 接受,扩展 5 → 12+ 类 | §4.5 |
| I-2 抽样不防低频 fact | 接受,改分层抽样 + critical 必抽 | §5.1 / 决策 #16 |
| I-3 mtime 优先风险 | 部分接受(跨 role 冲突默认入 diff)| 决策 #18 修订 / §4.3 |
| I-4 Phase B 时长乐观 | 接受,B 拆 B1/B2/B3,总 4-5 周 → 5-6 周 | §6.1 / §6.2 重新画图 |
| I-5 测试盲点 | 接受,补并发/lock/yaml-malformed/竞争测试 | §5.2 / §5.7(135 → 原 114)|
| I-6 .xlsx 库未选 | 接受,选定 exceljs,Phase A 加依赖 | §6.5 新增 |
| I-7 路线图与主 spec 冲突 | 接受,Phase F 加主 spec §7 同步更新 | §6.6(原 6.4)/ Phase F |
| I-8 审计盲点(acceptance reports / 反向 sync)| 部分接受(metadata-only acceptance reports 导入) | §7 修订 |
| I-9 复写产物 license MIT 化风险 | 接受,改默认 `derived-from-source` + GDPR 确认门 | 决策 #21 / §9 |
| M-1 措辞冲突(双向 vs 单向)| 接受 | §1.2 / §7 |
| M-2 --merge / --overwrite 缺定义 | 接受 | §2.1 |
| M-3 编码 dry-run 提示 | 接受 | §4.1 |
| M-4 非 TTY 倒计时不适用 | 接受,加 `--yes` flag | §4.4 / §7 |
| M-5 配置职责分裂 | 接受,声明 `legacy-anchors.yaml` = anchor metadata,`config.yaml#legacy_bridge` = global policy | 决策 #19 / §2.5 |

**Codex Open Questions 回应**:
- Q-1 / Q-2:Plan 6 已合 main(commit 99c510f,PR #5);Plan 7 实施计划待 brainstorming 完成后 invoke writing-plans 写
- Q-3:本 design §1.1.1 / 决策 #22 / §2.7 / §9 已正式声明 v0.2 突破 §2.3 LLM 边界 + 数据传输声明 + opt-in 机制 + GDPR 确认门
- Q-4:验收报告处理改为 metadata-only 导入(§7 / I-8 部分接受),不全量但保留 trace graph 入口

### v0.1(初稿,2026-05-05 上午)

10+5 轮 brainstorming 澄清后写出。被 Codex 对抗审查发现 18 项缺陷(见 v0.2 修订记录)。

---

**文档结束**。Plan 7 实施细节见 `docs/plans/2026-05-05-plan-7-brownfield.md`(待 invoke writing-plans 写)。
