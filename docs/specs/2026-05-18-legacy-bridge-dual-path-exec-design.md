# Forge legacy-bridge 双路径执行模型(Spec A)设计文档

- **作者**:msc(由 Claude Opus 4.7 协助 brainstorming)
- **日期**:2026-05-18
- **状态**:草案,待用户审阅
- **关联**:
  - brownfield 设计 [`2026-05-05-brownfield-onboarding-design.md`](2026-05-05-brownfield-onboarding-design.md) —— legacy-bridge v0.2 三层能力 + LLM opt-in 边界
  - forge-migrate 设计 [`2026-05-10-forge-migrate-design.md`](2026-05-10-forge-migrate-design.md) —— `--no-regenerate` + agent-fill 范式的来源
  - **后继 Spec B**:legacy-bridge Layer 3b —— requirement extraction → backlog(依赖本 spec 的 `LlmTask` 抽象;6 个 brainstorm 决策已定,待本 spec 落地后续写其设计文档)

---

## 0. 文档状态声明

本文档是 `superpowers:brainstorming` 阶段产物,描述本 feature 的「实施清单」而非「已实施成果」。全文「新增」「重构」「改」等表述,都是 `writing-plans` 阶段拆 task + 实施时的目标,**当前代码库尚未包含这些改动**。

---

## 0.1 背景与起因

legacy-bridge v0.2 的四个用 LLM 的命令 —— `map` / `index` / `regenerate` / `sync-check` —— 目前都在 CLI 进程内 `import @anthropic-ai/sdk` + `ANTHROPIC_API_KEY` 直连 Anthropic,按 token 计费。

用户(msc)指出问题:这迫使用户额外付 API 费用,而 Claude Code 会话里的 agent 本身有额度,LLM 步骤本质是「读输入 → 推理 → 写输出文件」,正是 agent 在会话里能干的事。`forge migrate` 已证明另一条路可行(`docs/migration/from-existing-project.md §4.2`:`--no-regenerate` + 让 agent 补缺件)。

**成因澄清**:四命令 API-only 并非刻意决策,而是时序产物 —— legacy-bridge v0.2 设计(2026-05-05)早于 migrate 的 agent-fill 范式(2026-05-10)。当时 brownfield 设计把「在用户路径直连 API」当成刻意「突破 v0.1 §2.3 LLM 边界」来写。

本 spec 把 agent 路径系统化:给 legacy-bridge 建一个「默认 agent / `--api`」双路径执行模型,并 retrofit 四个命令。这是 **Spec A**;后继 **Spec B**(Layer 3b requirement extraction → backlog)直接复用本 spec 的 `LlmTask` 抽象。

---

## 1. 决策快照

| #   | 决策点                | 选定                                                                  | 理由                                                                                       |
| --- | --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D1  | retrofit 范围         | 四命令全部 retrofit(`map`/`index`/`regenerate`/`sync-check`)         | 用户诉求是「legacy-bridge 整体不耗 API key」;既要建双路径抽象,顺手覆盖四命令边际成本可控  |
| D2  | agent 路径交接机制    | **Task manifest 文件**(`forge/.cache/legacy-bridge-task-<op>.json`)  | 可测、可检查、跨 tier 一致;优于 stdout 指令(脆)与纯 skill 内嵌(契约不可测)            |
| D3  | 抽象                  | 统一 `LlmTask` 类型 + 双 runner(`ApiRunner` / `AgentHandoffRunner`)  | 「先做 Spec A 当地基」的意义所在;不建抽象等于没拆;Spec B 直接复用                         |
| D4  | sync-check × archive  | slash/skill 编排                                                      | `/forge:archive` 本就 agent 驱动;统一走 agent 路径,硬 gate 留在 `--apply` 确定性逻辑      |
| D5  | 默认模式              | **agent 默认**,`--api` 切回                                          | 用户明确选「默认 agent」;与 Spec B 一致                                                   |
| D6  | opt-in gate           | `allow_llm_calls` + ack 适用**两模式**                                | agent 模式同样把老文档(含客户数据锚点)交给 LLM;gate 含义泛化                            |
| D7  | spec 拆分             | Spec A(本文,执行模型)/ Spec B(Layer 3b)分离,B 依赖 A             | 两块各为 plan-8x 量级;单 spec 过大,违反 brainstorming「单 spec 该聚焦」纪律               |

---

## 2. 架构 —— `LlmTask` 抽象 + 双 runner

### 2.1 核心类型

每个 LLM 步骤重构成一个 typed descriptor:

```ts
// 一个待执行的 LLM 任务描述(中文注释)
interface LlmTask<O> {
  op: 'map' | 'index' | 'regenerate' | 'extract-facts' | 'quality-judge' | 'sync-check';
  inputs: LlmTaskInput[]; // 已 redact 的输入 bundle(文件片段 / change context)
  prompt: string; // 各命令 prompt builder 产出
  model: string; // 建议模型(api 模式用;agent 模式仅参考 —— agent 本身即模型)
  outputSchema: string; // 输出 JSON schema 描述,供 agent 自校验产物
  outputPath: string; // agent 把结果写到哪
}
```

### 2.2 双 runner

同一个 `LlmTask`,两种执行:

- **`ApiRunner`**(`--api`)—— 调 Anthropic SDK;沿用现有注入式 client 接口(`MapperClient` / `IndexerClient` / `RegenerateClient` / `JudgeClient` / `SyncCheckClient` 成为它的内部细节)。
- **`AgentHandoffRunner`**(默认)—— 把当前轮的 `LlmTask[]` 包进一个 manifest 信封写到 `forge/.cache/legacy-bridge-task-<op>.json`,然后退出。

manifest 是一个**信封结构**(不是裸 `LlmTask[]` 数组):

```ts
// agent 路径的交接文件(中文注释)
interface TaskManifest {
  forge_version: string; // 防跨版本误用
  op: string; // 命令名
  round: number; // 当前轮次(单轮命令恒为 1;regenerate §3.1 为 1 或 2)
  input_hash: string; // 本轮输入 bundle 的 hash,供 --apply 防漂移
  tasks: LlmTask<unknown>[]; // 当前轮的待执行任务
  meta?: Record<string, unknown>; // op 专属上下文(如 sync-check 的 gate_context,§4)
}
```

`--apply` 读 manifest 时强校验 `forge_version` / `round` / `input_hash`:任一不符即报错退出,**不静默复用旧产物**(§3.1)。

### 2.3 两步命令形态

```
agent 模式  forge legacy-bridge <op>          → 建 LlmTask[] → 写 manifest → 退出 0
            [agent 读 manifest、逐个做 LLM、写结果到各 outputPath]
            forge legacy-bridge <op> --apply  → 校验结果(schema + 输入 hash)
                                              → 跑确定性后处理 → 写最终产物(或 emit 下一轮 manifest)
api 模式    forge legacy-bridge <op> --api    → 建 LlmTask[] → ApiRunner 调 SDK
                                              → 同确定性后处理 → 写产物(单进程)
```

**关键解耦**:确定性后处理(如 mapper 的 role→anchor 组装、draft 渲染)从 LLM 步骤里剥出来,两条路径共用。这是「确定性骨架」与「LLM 步骤」分离的落点 —— manifest 是 §2.2 的 `TaskManifest` 信封,其 `tasks` 字段为当前轮的 `LlmTask[]`;`--apply` 校验本轮后按需 emit 下一轮 manifest 或 finalize。

---

## 3. 四命令 retrofit

每个命令拆成「确定性 prep → 一个或多个 `LlmTask` → 确定性后处理(`--apply` 拥有)」。

| 命令         | LlmTask 数         | 确定性 prep                                  | 确定性后处理(`--apply` 拥有)                                              |
| ------------ | ------------------ | -------------------------------------------- | --------------------------------------------------------------------------- |
| `map`        | 1                  | walk 文件 + 读 preview + redact + 拼 prompt  | `parseMapperResponse` + 组装 anchors + merge + 渲染 draft yaml/md            |
| `index`      | 1(批量覆盖所有 anchor) | 读 anchors + 正文                            | `renderIndexMarkdown`                                                       |
| `sync-check` | 1                  | 拼 change context(diff)+ load anchors + redact | `renderDiffMarkdown/Yaml` + `hasCriticalPending`                            |
| `regenerate` | **多个,2 轮**     | 读 anchors + 代码                            | `stratifiedSample` + 保真率算分 + 阈值 gate + `.partial` + redact-report     |

`map` / `index` / `sync-check` 是干净的单 `LlmTask`,两步走完。

### 3.1 `regenerate` 是 2 轮 agent 流

保真率自检本身是 LLM 步骤,且依赖前一轮产物:

```
轮1  forge legacy-bridge regenerate         → manifest 含 2 个 LlmTask:
                                              ① regenerate(复写 SRS/HLD/LLD/system-tests)
                                              ② extract-facts(从老锚点抽 fact)
     [agent fulfill 两个]
     forge legacy-bridge regenerate --apply → 校验轮1 + 跑 stratifiedSample(确定性抽样)
                                            → 发现还需轮2 → 写 manifest 含:
轮2                                            ③ quality-judge(判抽样 fact 是否在复写产物里存活)
     [agent fulfill]
     forge legacy-bridge regenerate --apply → 校验轮2 → 算保真率 → 阈值 gate(默认 0.9)
                                            → 达标转正 / 不达标产 .partial
```

**轮次与防漂移**:manifest 的 `round` 字段区分轮1/轮2;`--apply` 按 `round` 决定是「校验轮1 + emit 轮2 manifest」还是「校验轮2 + finalize」。`--apply` 同时强校验 `input_hash` 与磁盘当前输入:**两轮之间输入被改动(hash 不符)→ 报错退出,不静默用旧产物**;对已消费过的 manifest 重复 `--apply` → 报错。轮2 manifest 的 `input_hash` 覆盖轮1产物 + 抽样结果,确保 judge 评的是当前复写产物。

**反偷懒不软化**:保真率算分 + 阈值判定**始终是 CLI 的确定性逻辑**,agent 只产 raw judge 结果,不自己决定「达标没」。`regenerate` 的结构化 gate 不因走 agent 路径而软化。

---

## 4. sync-check × archive 集成

`sync-check` 现被 `forge archive` 进程内同步调用 —— 两个函数 `runArchivePreflight`(`enforce_sync=true`)与 `runArchivePostHook`(`enforce_sync=false`,默认)各自 `new Anthropic(...)` 后调 `runSyncCheck`(均在 `src/cli/commands/archive.ts`)。**关键:两条路径阻塞语义不同** —— preflight 发现 critical pending 时返回 `critical-pending`、让 archive 命令 abort(exit 2);post-hook 只产报告、不阻塞。而**独立命令 `forge legacy-bridge sync-check` 永远 exit 0**(critical pending 仅打 warning)。所以「阻塞」从来不在 sync-check 自身,而在 archive preflight。agent 路径下 CLI 进程内不再跑 LLM 步骤,改由 slash/skill 编排。

1. **CLI `forge archive` 只 emit manifest**。到 sync-check 点时按 `enforce_sync` 决定时机:`true` → preflight 点 emit;`false` → post-archive 点 emit。不进程内调 LLM。
2. **archive 命令/skill 加编排步**。`commands/archive.md` 与 Tier2/3 archive skill 各加一步:检测到 `forge/.cache/legacy-bridge-task-sync-check.json` → 指挥 agent fulfill → 跑 `forge legacy-bridge sync-check --apply`。
3. **硬 gate 不软化,但 `--apply` 必须知道自己的 gate 语义**。双路径化后阻塞性不再靠「两条独立代码路径」区分,只有一个 `sync-check --apply`。故 sync-check 的 manifest 在 `meta` 里带一个 **`gate_context`** 字段(枚举 `archive-preflight` / `archive-posthook` / `standalone`)。`--apply` 据此:`archive-preflight` + critical pending → **确定性 exit 2**(等价现 `runArchivePreflight` 的 `critical-pending` abort);`archive-posthook` / `standalone` → 只产报告、exit 0(等价现 post-hook 与独立命令)。**这是把隐含上下文显式化,不是「保留」现状** —— 现状里 exit 2 本就不在 sync-check 命令、而在 archive preflight。判定权仍全在 CLI 确定性逻辑(`--apply` 按 `gate_context` + critical pending 算),agent 只 relay 退出码。archive 在 preflight gate 处可中断/恢复(见点 4)。
4. **`forge archive` 不检测「谁在调用」**。CLI 行为只由 `enforce_sync`(config)决定,不区分 slash command 还是裸用户:
   - `enforce_sync=true` → archive 走到 preflight 点 emit manifest(`gate_context: archive-preflight`)后**停在 gate**(archive 越不过一个自己评不了的 gate)。经 `/forge:archive` 时由 slash/skill 自动 fulfill + `forge archive --resume`;裸 CLI 用户看到提示「fulfill manifest 后 `forge archive --resume`,或用 `--api` 让本进程内联跑」。**同一个 emit+halt,无 agent 检测机制**。
   - `enforce_sync=false` → archive 正常完成,post-archive 点 emit manifest(`gate_context: archive-posthook`,非阻塞);裸 CLI 下不 fulfill 也不影响 archive(本就非阻塞)。
5. **`allow_llm_calls=false`** → 两模式都 graceful skip(不变)。

---

## 5. opt-in / redact / 默认翻转

- **opt-in gate 适用两模式**。`allow_llm_calls` + `--acknowledge-data-transfer` ack 含义泛化为「本命令会把老文档(含 `contains_customer_data` 锚点)交给 LLM —— 不论 agent 还是 API」。agent 模式同样过 gate;`allow_llm_calls=false` 两模式都 graceful skip。
- **redact 在两模式都跑**。CLI 在**写 manifest 前**就 redact 输入 bundle —— agent 永远拿不到未脱敏的 secret;api 模式在调 SDK 前 redact(现状)。CLI 数据传输声明随模式变:api 印 `→ sending N bytes to Anthropic API`;agent 印 `→ N bytes(已 redact)prepared for agent fulfillment`。
- **默认翻转 + 迁移**。四命令从 API-only 翻成 **agent 默认**,`--api` 切回。破坏性说明:现有靠 `forge legacy-bridge map` 进程内出活的脚本 / CI,现在拿到的是 manifest。缓解:整个 legacy-bridge 本就锁在 `allow_llm_calls` opt-in 后(v0.2、用户基数小),爆炸半径有限;`CHANGELOG.md` + `docs/legacy-bridge.md` 明确标 breaking。

---

## 6. skill 层与构建同步

- **新增 skill** 承载 agent-driver 契约:怎么 fulfill manifest(读 → 按 `op` 做 LLM → 产物匹配 `outputSchema` → 跑 `--apply`),外加反偷懒行为约束(`sync-check` / `regenerate` 必须真读代码,不许伪造判定)。三 tier 都有 agent,skill 通用。
- **不新增 legacy-bridge slash 命令**。唯一改的现有 command 是 `commands/archive.md`(§4 的 sync-check 编排步)。
- 改 `commands/` 或加 `skills/` 后**必跑 `pnpm build`**(双源 md5 sync,见仓库 `CLAUDE.md` 约束 1)。

---

## 7. 测试策略

manifest 设计天然可测,三层各自独立测,不需真调 API:

- **命令 prep(确定性)** → 断言 emit 的 manifest 内容(文件清单 / prompt / 输入 hash)。
- **`--apply`** → 喂 fixture 结果文件 → 断言最终产物;含输入 hash 不匹配的漂移检测用例。
- **`ApiRunner`** → 复用现有注入式 client 做 mock(`tests/core/legacy-bridge/` 既有 fixture 模式)。
- **§3.1 regenerate 2 轮** → 测轮1 `--apply` 正确 emit 轮2 manifest;轮2 `--apply` 保真率阈值 gate 的达标 / 不达标 / `.partial` 三分支。
- **§4 sync-check × archive** → 测裸 CLI + `enforce_sync=true` 报错;`/forge:archive` 编排路径的 e2e。

---

## 8. 文件清单(forge-repo 侧)

> 文件名为建议,writing-plans 阶段可调整。

| 文件                                            | 改动                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/core/legacy-bridge/llm-task.ts`(新)       | `LlmTask` + `TaskManifest` 信封(`round` / `input_hash` / `meta`)+ 序列化/反序列化 + hash 计算 |
| `src/core/legacy-bridge/runners.ts`(新)        | `ApiRunner` / `AgentHandoffRunner` 双 runner                                               |
| `src/core/legacy-bridge/mapper.ts`(改)         | 重构:剥出确定性 prep / 后处理,LLM 步骤产 `LlmTask`                                        |
| `src/core/legacy-bridge/indexer.ts`(改)        | 同上                                                                                       |
| `src/core/legacy-bridge/regenerator.ts`(改)    | 同上;多 `LlmTask`、2 轮流                                                                  |
| `src/core/legacy-bridge/quality-judge.ts`(改)  | `extract-facts` / `quality-judge` 成独立 `LlmTask`;`stratifiedSample` + 算分留确定性       |
| `src/core/legacy-bridge/sync-check.ts`(改)     | 重构产 `LlmTask`;确定性后处理留 `renderDiff*` / `hasCriticalPending`                       |
| `src/cli/commands/legacy-bridge.ts`(改)        | 加 `--apply` / `--api` flag;manifest 接线;默认翻转为 agent                                |
| `src/cli/commands/archive.ts`(改)              | sync-check 改为 emit manifest;加 `--resume`;裸 CLI + `enforce_sync=true` 报错             |
| `commands/archive.md`(改)                      | 加 sync-check manifest 编排步(改后必 `pnpm build`)                                        |
| `skills/legacy-bridge-fulfillment/SKILL.md`(新) | agent-driver 契约 + 反偷懒约束(改后必 `pnpm build`)                                       |
| Tier2/3 archive skill(改)                      | 加等价 sync-check 编排步                                                                   |
| `docs/legacy-bridge.md`(改)                    | 文档化双路径 + 标 breaking                                                                 |
| `CHANGELOG.md`(改)                             | breaking note:四命令默认从 API 翻为 agent                                                 |

---

## 9. 不做 / scope-out(明确边界)

- **Layer 3b requirement extraction → backlog** —— 是 Spec B,本 spec 只建它依赖的执行模型抽象,不实现抽取能力本身。
- **不新增 legacy-bridge slash 命令** —— skill 通用三 tier 已够。
- **不动 `redact.ts` 规则** —— 只是在两模式都调用它,不改脱敏规则本身。
- **provider 仍仅 anthropic** —— v0.3 的多 provider 不在本 spec。

---

## 10. Codex 对抗性审查处置

### Round 1(v1 → v2):1 HIGH + 2 MEDIUM + 1 LOW,均独立对照代码核实为真,全处置

| #   | severity | 核实结论                                                                                                                | 处置                                                                                                          |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | HIGH     | 真 —— 独立 `sync-check` 命令恒 exit 0(critical 仅 warning),阻塞实际在 `runArchivePreflight`;§4 称「保留 exit 2」不实,且未说 `--apply` 怎么知道 gate 上下文 | §2.2 manifest 信封加 `meta`;§4 intro 校正现状描述;§4 点3:sync-check manifest 带 `gate_context` 字段,`--apply` 据此决定阻塞性 |
| 2   | MEDIUM   | 真 —— §4.4「无 agent 会话」暗示一个 `archive.ts` 里不存在也不需要的 agent 检测机制                                       | §4 点4 重写:CLI 不检测调用方,行为只由 `enforce_sync` 决定;emit+halt 对 slash / 裸用户一致                   |
| 3   | MEDIUM   | 真 —— §3.1 描述 regenerate 2 轮流,但 §2.2 manifest schema 无轮次/状态字段,内部不自洽                                   | §2.2 manifest 信封加 `round` 字段;§3.1 加轮次语义 + `input_hash` 防漂移 + 重复 apply 报错                     |
| 4   | LOW      | 真 —— `runSyncCheck` 调用点行号 694 指向注释行,实际调用在 702 / 786                                                     | §4 intro 改用函数名 `runArchivePreflight` / `runArchivePostHook` 引用,不再用行号                             |
