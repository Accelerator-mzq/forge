# Forge legacy-bridge Layer 3b —— 需求抽取 → backlog(Spec B)设计文档

- **作者**:msc(由 Claude Opus 4.7 协助 brainstorming)
- **日期**:2026-05-18
- **状态**:草案,经 Codex 8 轮对抗性审查收敛(0 HIGH / 0 MEDIUM,见 §14),待用户审阅
- **关联**:
  - **前置 Spec A**:legacy-bridge 双路径执行模型 [`2026-05-18-legacy-bridge-dual-path-exec-design.md`](2026-05-18-legacy-bridge-dual-path-exec-design.md) —— 本 spec 直接复用其 `LlmTask` / `TaskManifest` 抽象与双 runner;Spec A 已实施并合入 `main`(PR #49 → dev、PR #50 → main)。
  - brownfield 设计 [`2026-05-05-brownfield-onboarding-design.md`](2026-05-05-brownfield-onboarding-design.md) —— legacy-bridge v0.2 三层能力 + LLM opt-in 边界;本 spec 是其 v0.3 reverse-sync 的首块落地。
  - backlog registry 设计 [`2026-05-15-backlog-registry-design.md`](2026-05-15-backlog-registry-design.md) —— 本 spec 把 `forge/backlog/` 扩成双数据源,并复用其 `superseding_entries` 退役机制。

---

## 0. 文档状态声明

本文档是 `superpowers:brainstorming` 阶段产物,描述本 feature 的「实施清单」而非「已实施成果」。全文「新增」「重构」「改」等表述,都是 `writing-plans` 阶段拆 task + 实施时的目标,**当前代码库尚未包含这些改动**。

---

## 0.1 背景与起因

backlog registry(`forge/backlog/`)的数据源**只有**「archived change 的 scope-entry YAML 块」—— `scanArchivedFollowups` 扫 `forge/changes/archive/*/{proposal,design}.md` 内的 `forge-scope-entries/v1` 块。

用户(msc)指出的缺口:**brownfield 项目老 SRS 里未实现的需求,永远不会进 `forge/backlog/`**。一个有完整老文档(SRS / HLD / LLD / 测试用例)的项目接入 forge 时,老文档里写明、但代码尚未实现的需求,既不在任何 forge change 的 scope 里,也就不在 backlog 里 —— 开发者无法「一处掌握项目还剩多少待办」。这是 brownfield onboarding 的真实缺口。

本 spec 是 **legacy-bridge Layer 3b**:从老文档(及已有的 `BACKLOG.md`/`TODO.md` 等)抽取需求条目,LLM 判定实现状态,经用户审核后落成 `forge/legacy-requirements.yaml`,并把它接成 backlog registry 的**第二数据源**。它依赖 Spec A 的双路径执行模型(命令默认走 agent 额度、不耗 API key)。

---

## 1. 决策快照

brainstorm 阶段已敲定的 6 个核心决策 + 本轮设计补充的 4 个:

| #   | 决策点                  | 选定                                                                                          | 理由 / 出处 |
| --- | ----------------------- | --------------------------------------------------------------------------------------------- | ----------- |
| D1  | 抽取机制                | 两阶段 —— LLM 判 implemented/unimplemented + 用户审(沿用 `map` 的 draft → 审 → 转正范式)     | brainstorm 决策 1 |
| D2  | 落点                    | 新建 `forge/legacy-requirements.yaml`,backlog registry 扩成双源,`active.md` 加 Legacy Requirements 段 | brainstorm 决策 2 |
| D3  | 已有 backlog 文件       | `BACKLOG.md`/`TODO.md`/`ROADMAP.md`/issue 导出纳入文档发现,与 SRS 未实现需求统一进 yaml      | brainstorm 决策 3 |
| D4  | LLM 额度                | 双路径、默认 agent(走会话额度,不耗 API key);`--api` 切 CLI 内嵌                            | brainstorm 决策 4;复用 Spec A |
| D5  | 文档发现                | 扩文件类型(加 `.docx`/`.pdf`)+ 扩扫描范围(`docs/`-ish → 全仓库)                          | brainstorm 决策 5 |
| D6  | 条目退役                | 后续 forge change 经 `superseding_entries` 机制认领(复用 backlog registry 现有机制),零额外 LLM | brainstorm 决策 6 |
| D7  | 命令形态                | CLI 子命令 + skill,**不新增 slash 命令**;promote 用 `extract --finalize`(非手动 `mv`)      | 本轮设计;沿 Spec A「skill 通用三 tier 已够」 |
| D8  | yaml 内容               | 存**全量**需求 + `status` 字段(implemented/unimplemented);active.md 只渲染 unimplemented    | 本轮设计;用户须能复核 LLM 的「已实现」误判 |
| D9  | 再跑 extract            | **增量合并** —— 重新抽取后与已确认 yaml diff,未变条目保留用户编辑与稳定 ID                    | 本轮设计;ID 稳定 + 复审成本低 |
| D10 | `.docx`/`.pdf` 读取     | 加 `mammoth`(docx)+ pdf 文本库依赖,CLI 在 prep 阶段抽文本 → redact → inline                | 本轮设计;redact 不变量完整覆盖,`--api` 路径同样支持 |

---

## 2. 架构总览

新增**第六个** `forge legacy-bridge` 子命令 `extract`(现有 5 个:`map` / `index` / `regenerate` / `sync-check` / `resolve`),复用 Spec A 的 `LlmTask` / `TaskManifest` 信封 / 双 runner(`ApiRunner` / `AgentHandoffRunner`)。数据流:

```
              确定性 prep                LLM 步骤              确定性后处理
forge legacy-bridge extract  ──→  whole-repo 发现 + 抽文本 + redact
                                   → 建 N 个 LlmTask(每来源文档 1 个)
                                   → 写 manifest(op=extract)→ 退出
        [agent 读 manifest:逐文档抽需求 + 真读代码判实现状态 → 写结果]
forge legacy-bridge extract --apply ──→ 校验 manifest_hash + 各结果 schema
                                   → 汇总 → 与已确认 yaml 增量 diff
                                   → 写 legacy-requirements-draft.yaml + .md 概览
        [用户审 draft yaml]
forge legacy-bridge extract --finalize ──→ 校验 draft schema → 分配/保留稳定 ID
                                   → 合并入 forge/legacy-requirements.yaml
                                   → 调 generateBacklog 刷新 active.md

forge legacy-bridge extract --api  ──→ 同 prep,ApiRunner 进程内调 SDK
                                   → 同 --apply 后处理(单进程)
```

`extract` 在 Spec A 三模式(emit / `--apply` / `--api`)之上多一个**纯确定性、不调 LLM** 的 `--finalize`。`--apply` / `--api` / `--finalize` 三者互斥(同传报错退出,沿 Spec A 的 `--apply` × `--api` 互斥校验)。

`LlmOp` 联合类型新增枚举值 `extract`;manifest 文件 `forge/.cache/legacy-bridge-task-extract.json`(沿 `manifestPath` 的 `legacy-bridge-task-<op>.json` 约定)。

---

## 3. `forge/legacy-requirements.yaml` Schema

确认产物,**人工可编辑**。draft 态文件为 `forge/legacy-requirements-draft.yaml`(沿 `legacy-anchors-draft.yaml` 命名)。

```yaml
schema: forge-legacy-requirements/v1
requirements:
  - id: LR-0042                       # 稳定 ID。--finalize 分配,增量合并保留;draft 里新条目此字段留空
    title: 用户登录支持双因素认证       # 一行需求标题
    description: |                     # 需求正文(可多行)
      系统应在用户登录时,对启用了 2FA 的账户要求第二因素验证……
    status: unimplemented              # implemented | unimplemented(D1 二值,不引入 partial)
    source:
      document: docs/legacy/SRS.md     # 来源文件,相对仓库根
      section: "3.2.1"                 # 章节锚 / 标题(增量合并的匹配键之一);无则留空
      kind: srs                        # srs | backlog-file | issue-export(D3)
    evidence:                          # LLM 判 implemented 的代码依据;unimplemented 时为空数组
      - "src/auth/2fa.ts:88 实现了 TOTP 校验"
    confidence: medium                 # LLM 判定置信度:high | medium | low
    priority: high                     # 用户填:critical | high | medium | low | null
    review: confirmed                  # pending(draft 未审)| confirmed(--finalize 后 / 用户改过)
    notes: ""                          # 用户自由编辑区
```

**字段说明:**

- `status` 二值(D1)。`partial`(部分实现)不引入 —— 用 `confidence: low` + `notes` 承载边界情形,确需拆分时用户把一条需求拆成两条。
- `id` 形如 `LR-NNNN`,4 位零填充,`--finalize` 分配(§6)。draft 里新条目 `id` 留空,匹配到既有条目的 draft 条目带回既有 `id`。
- `source.kind` 区分来源:`srs`(老规格文档)/ `backlog-file`(`BACKLOG.md` 等)/ `issue-export`(issue 导出)。
- `evidence` 是 LLM 判 `implemented` 的依据。强制性**分模式**(见 §4.5):agent 模式建议 `status: implemented` 时 `evidence`(file:line)非空、否则 `--apply` 告警;`--api` 模式不硬校验。`writing-plans` 阶段定死阈值。
- `review` 字段:`pending`(本轮新抽 / 本轮有变更,待用户审)| `confirmed`(已确认)。draft 里新条目与本轮变更条目为 `pending`,增量合并保留下来的未变条目维持 `confirmed`;`--finalize` 把整表置 `confirmed`(转正即视为用户已确认全表)。

**全量存储(D8):** yaml 存所有抽出的需求(implemented + unimplemented)。`implemented` 条目不进 active.md(非待办),但留在 yaml 里 —— 用户须能看见并纠正 LLM 误判的「已实现」;若只存 unimplemented,被误判 implemented 的需求会直接消失、无从复核。

---

## 4. 抽取流程

每个 `extract` 命令拆成「确定性 prep → 一个或多个 `LlmTask` → 确定性后处理(`--apply` 拥有)」,沿 Spec A §3 的命令结构。

### 4.1 确定性 prep(emit / `--api` 共用)

1. **whole-repo 发现**(§5)→ 得到候选来源文档清单 + 代码结构索引。
2. **抽取文本**:逐来源文档抽纯文本(`.md`/`.txt` 直读;`.xlsx` 复用 `excel.ts`;`.docx`/`.pdf` 见 §5.2)。
3. **redact**:对**全部输入**(文档文本 + 代码索引)跑 redact(沿 Spec A §5「两模式都 redact」)。
4. **建 LlmTask**:**每个来源文档建一个 `LlmTask`**(`op: extract`),`manifest.tasks[]` 为 N 个。多文档独立成 task → 可并行 fulfill、各 task 输入有界(沿 Spec A `regenerate` 的多 task 范式)。
5. **写 manifest**:`round` 恒为 1(extract 是单轮命令);`meta` 带已确认 `legacy-requirements.yaml` 的快照(供 `--apply` 增量 diff,§6),无既有文件则 `meta` 标首次运行。

### 4.2 单个 `LlmTask` 的形态

| 字段           | 内容 |
| -------------- | ---- |
| `op`           | `extract` |
| `prompt`       | prompt builder 产出,**已内嵌**本文档的已 redact 文本 + 代码结构索引;指令:抽取需求条目、逐条判 implemented/unimplemented、判 implemented 必须给代码 evidence(file:line)、给 confidence |
| `inputs`       | 与 `prompt` 并列的已 redact 输入快照(`{ source, content }[]`);供 agent 参考、emit 记录与测试断言 —— **不是**送达 LLM 的通道 |
| `model`        | 建议模型(api 模式用;agent 模式仅参考) |
| `outputSchema` | 需求条目数组的 JSON schema 描述(`title` / `description` / `status` / `source.section` / `evidence` / `confidence`) |
| `outputPath`   | `.cache/extract-result-<n>.json`(相对 `forgeRoot`,n 为 task 序号) |

**关键约定(沿 `map` 的 `buildMapTask` 先例,已核实代码):** `ApiRunner` 调 API 时**只发送 `task.prompt`**(`runners.ts` `messages: [{ content: t.prompt }]`),不发送 `inputs`。故抽取所需的文档文本与代码索引**必须由 prompt builder 内嵌进 `prompt` 字符串**(`buildMapTask` 即如此 —— `buildMapperPrompt` 把文件 preview 拼进 prompt);`inputs` 只是并列的 redact 快照,不是送 LLM 的通道。`outputPath` 写相对路径时由 `readTaskResults` 以 `forgeRoot`(即 `forge/` 目录)为基准 `join`,故用 `.cache/...` 而非 `forge/.cache/...`,否则解析成 `forge/forge/.cache/...`。**结果文件信封**:`readTaskResults` 只认 `{ "text": "<字符串>" }` 信封并取 `.text`(已核实 `runners.ts`)。故 agent 写到 `outputPath` 的文件统一是 `{ "text": "<需求条目数组的 JSON 字符串>" }` —— 抽取结果是 `text` 内的 JSON **字符串**,**不能**把数组裸写进文件;`--apply` 取出 `text` 再 parse(沿 `map` 的 `applyMapResult` 先例)。

### 4.3 agent fulfill

agent 读 manifest,逐 task:依 `prompt`(已内嵌 redact 后的文档文本)+ **真读相关代码**(用工具在仓库内导航)判实现状态;产物是匹配 `outputSchema` 的需求条目数组,按 fulfillment 既有约定**序列化成 JSON 字符串、包进 `{ "text": ... }` 信封**写到 `outputPath`(见 §4.2 关键约定)。`legacy-bridge-fulfillment` skill 加 `extract` 的反偷懒约束:**判 `implemented` 必须真读代码并给出 file:line evidence,不许凭空判定**(沿该 skill 对 `sync-check` / `quality-judge` 的同类约束)。

### 4.4 确定性后处理(`--apply`)

1. 读 manifest,校验 `manifest_hash`(Spec A §2.2,防篡改)。
2. 经 `readTaskResults` 读各 `outputPath`,取 `{ text }` 信封里的 `text` 字符串 → 对 `text` 做 JSON parse + `outputSchema` 校验(沿 `map` 的 `applyMapResult` 先例)。
3. 汇总所有 task 结果为统一需求条目集。
4. 与 `meta` 里的已确认 yaml 快照做**增量 diff**(§6)。
5. 写 `forge/legacy-requirements-draft.yaml` + `forge/legacy-requirements-draft.md` 概览(概览标注 new / changed / vanished,§6)。
6. 成功后**消费 manifest**(沿 Spec A)。

### 4.5 `--api` 路径

同 §4.1 prep,改由 `ApiRunner` 在本进程内调 Anthropic SDK,跑同一套 §4.4 后处理。

**诚实声明:** `--api` 路径下 LLM 只能凭 prompt 里的代码结构索引判 `implemented`,**不能浏览实际代码**,判定较粗。extract 的高保真路径是 **agent**(agent 用工具真读代码)—— 这正是 D4 选「默认 agent」的原因之一。`--api` 定位为 CI / 无 agent / 合规场景的可用路径,不是等价路径。该限制写入 `docs/legacy-bridge.md`。

**evidence 契约随模式分级:** §3 / §4.3 的「`implemented` 必须给 file:line evidence」是 **agent 模式**契约 —— agent 真读代码、能给精确行号。`--api` 模式的 prompt 只含 file tree(无行内容),`ApiRunner` 也无代码读取工具,LLM 给不出可靠 file:line,强求只会诱导其编造行号。故 `--api` 模式下 `implemented` 判定为 **advisory**:`evidence` 至多到文件级(不强求行号),`--apply` 对 `--api` 来源结果**不硬校验 evidence**(§13 第 1 项据此分模式);条目仍按 draft 态 `review: pending` 落盘,交用户审或后续 agent 模式 re-extract 复判。

---

## 5. 文档发现

### 5.1 发现范围与类型(D5)

whole-repo 扫描(不再限 `docs/`-ish),识别三类:

- **需求文档**:文件名匹配 SRS / PRD / requirements / 需求 / 规格 等模式的 `.md` / `.txt` / `.docx` / `.pdf` / `.xlsx`。
- **backlog 文件**(D3):`BACKLOG.md` / `TODO.md` / `ROADMAP.md` / issue 导出文件 → `source.kind` 标 `backlog-file` 或 `issue-export`。
- **代码**:全仓库代码文件 → 生成结构索引(file tree),供 implemented 判定。

**与 `legacy-anchors.yaml` 的关系:** 若该文件存在,`role: requirements` 的 anchor 作**高置信需求源**并入候选清单。但 extract **不依赖** `map` —— 无 `legacy-anchors.yaml` 时全部走自有发现,可独立运行。

发现应排除 `node_modules` / `.git` / `dist` 等;具体忽略规则在 `writing-plans` 阶段定(建议复用仓库既有 ignore 约定)。

### 5.2 `.docx` / `.pdf` 读取(D10)

**为什么是这两种格式:** 按 forge 当前能否读取分 —— `.md`/`.txt` 是纯文本,`map` 现已能读;`.xlsx` 由 legacy-bridge 既有 `excel.ts` 读(老项目测试用例常是 Excel)。三者都不是缺口。`.docx`(Word)与 `.pdf` 才是缺口:brownfield 的前提是「已有完整老 SRS/HLD/LLD」,而企业正式交付文档绝大多数是 Word / PDF(PDF 常为验收冻结版),forge 现在完全读不了。「加 `.docx`/`.pdf`」即用最小依赖把正式文档读取缺口补齐。`.doc`(2007 前二进制 Word)、`.rtf`/`.html`/`.pptx` 不纳入,理由见 §12。

新增依赖:`mammoth`(docx → text)+ 一个 pdf 文本抽取库(具体选型在 `writing-plans` 阶段定)。CLI 在 §4.1 prep 第 2 步对 `.docx` / `.pdf` 抽纯文本,与 `.md`/`.txt`/`.xlsx` 一样走 redact 后**内嵌进 `LlmTask.prompt`**(并记入 `inputs` 快照,见 §4.2 关键约定)。redact 不变量因此完整覆盖 `.docx`/`.pdf`,`--api` 路径同样支持。代价是 2 个新 npm 依赖、增包重 —— 已接受:`.docx`/`.pdf` 是 brownfield 正式文档的主力格式,值得。

### 5.3 客户数据安全门(whole-repo 模式)

legacy-bridge 现有的 `contains_customer_data` 是 **anchor 级**标注(`LegacyAnchor.contains_customer_data`,见 `legacy-anchors.yaml`),`--acknowledge-customer-data` 二次确认由「有 anchor 标了该字段」触发。而 extract 的 whole-repo 发现(§5.1)会扫到**不在任何 anchor 里**的文件,forge 对这些文件无从读取该标注 —— 直接复用 anchor 级的客户数据门会留下盲区。故 extract 的客户数据门这样定:

1. **redact 无条件兜底**:CLI 在 prep 对**全部输入**(含非 anchor 发现的文件)跑 redact 默认 12 类规则 + `legacy-anchors.yaml` 的全局/anchor 级 `redact` 规则。这是不依赖 `contains_customer_data` 标注的基线防护 —— §5.2「安全送 LLM」的安全性来源是它,不是 anchor 标注。
2. **anchor 级客户数据 gate(复用 `checkAck`,不改 `ack.ts`)**:`checkAck` 现有逻辑是**全局 anchor 级** —— `legacy-anchors.yaml` 里**任一** anchor 标 `contains_customer_data: true`,即要求 `--acknowledge-customer-data`,**不**按「该文件是否在本次发现集」过滤。extract 直接复用此 gate:比「只 gate 命中发现集的文件」更保守(阻塞更多),对客户数据门是安全方向,且零 `ack.ts` 改动。
3. **非 anchor 文件**:无法逐文件判定,故**不引入新 ack 字段**。现有 `--acknowledge-data-transfer` 产出的 `llm-ack.yaml`(`ack.ts` 的 general ack)语义即「同意把本命令的数据传给 Anthropic」—— whole-repo extract 把发现文档送 LLM 正属此范畴,沿用它即可,extract 与其它 legacy-bridge LLM 命令一样以它为 opt-in gate。extract 额外在 emit / `--api` 前**显式打印**透明告知:本次将把哪 N 份发现文档交给 LLM、redact 已跑默认规则 —— 这是知情提示,不是新 gate。`--acknowledge-customer-data` 二次确认仍是 anchor 级(点 2)。**不**把非 anchor 文件默认当作不含客户数据:其防护来自无条件 redact(点 1)+ 用户已给的 data-transfer 同意。

---

## 6. 增量合并 + ID 分配(D9)

再次跑 `extract` 时(SRS 更新 / 部分需求已被 forge change 实现 / 新增需求):

### 6.1 `--apply` 阶段:diff 并产 draft

1. 读已确认 `legacy-requirements.yaml`(由 `meta` 快照提供)。
2. 把本轮重新抽取的条目与既有条目匹配。**匹配键**:`source.document` +(`source.section` 非空时用它,否则用条目 `title` + `description` 的归一化 content hash)—— backlog 文件条目大多无 `section`,content hash 给它们身份。**匹配仅在键唯一时进行**:旧条目与本轮条目各按键分组 ——
   - 某键**恰好 1 旧 + 1 新** → **matched**:复制既有 `id`;保留用户的 `priority` / `notes`;`status` / `evidence` / `confidence` 用本轮新值。新值与既有全一致 → `review` 维持 `confirmed`、概览归 `unchanged`;有变更 → `review` 回退 `pending`、概览标 `changed`。
   - 某键 **0 旧 + 1 新** → **new**:`id` 留空。
   - 某键 **1 旧 + 0 新** → **vanished**:旧条目仍写进 draft(保留既有 `id`),概览标 `vanished`,由用户决定删不删(可能是 SRS 删了该节,也可能是发现遗漏)。
   - 某键**旧侧或新侧多于 1 条** → **conflict**:既可能是同一 `document + section` 抽出多条不同需求,也可能是多条无 `section` 条目 content hash 相同。该键下所有条目一律按 `new` / `review: pending` 处理,**不自动继承任何既有 `id` 与用户编辑**,概览标 `conflict`、提示用户在 draft 手动认领 ID / 合并。这样既覆盖「多需求同章节」也覆盖「无章节条目撞 hash」,不会误把不同需求并成一条。
3. `.md` 概览按 **new / changed / vanished / unchanged / conflict** 分组展示,让用户聚焦复审本轮变化,未变条目不必重看。

### 6.2 `--finalize` 阶段:转正

`forge legacy-bridge extract --finalize` 纯确定性、不调 LLM:

1. 读用户审过的 `legacy-requirements-draft.yaml`。
2. 校验 schema(`forge-legacy-requirements/v1`)。
3. 给 `id` 为空的条目按 `max(既有所有 LR-NNNN) + 1` 顺序分配稳定 ID。
4. 把整表所有条目 `review` 置 `confirmed`(转正即视为用户已确认全表)。
5. 写 `forge/legacy-requirements.yaml`(整体即合并结果)。
6. 顺带调 `generateBacklog`(§7)立即刷新 `forge/backlog/active.md`,无需等下次 archive。

**无 hash 锁:** draft 是人工复审产物、设计上就要被手编,`--finalize` 不对 draft 做 `manifest_hash` 类校验(沿 `map` 的 `mv` 转正无锁语义)。hash 锁只在 `--apply` 对 agent 产出的 manifest 生效。

**前置校验:** `--finalize` 找不到 `legacy-requirements-draft.yaml` 时报错退出(提示先跑 `extract` + `--apply`)。

---

## 7. backlog registry 双源集成(D2)

### 7.1 双源编排

`buildBacklog`(`src/core/backlog/index.ts`)扩成双源:

- 源一:`scanArchivedFollowups`(archived change 的 scope-entry)—— 聚合逻辑**不动**,但 `buildBacklog` 的调用方式要加空 archive 容错,见下。
- 源二:新 `loadLegacyRequirements(forgeRoot)` —— 读 `forge/legacy-requirements.yaml`,文件不存在则返回空。

**聚合层 `aggregator.ts` 不改** —— 双源合并放在 `buildBacklog` 编排层,保持聚合器纯净、可独立测试。

**空 archive 容错(Spec B 新增):** `scanArchivedFollowups` 在 `forge/changes/archive/` 不存在时**抛错**(`aggregator.ts`)。Spec B 之前 `buildBacklog` 只被 `forge archive` 在 archive 完成后调用、目录必然存在;Spec B 新增了 `extract --finalize` → `generateBacklog`(§6.2)这个调用方,而 brownfield 首次接入时很可能尚无任何 archived change。故 `buildBacklog` 在调 `scanArchivedFollowups` 前先判 `forge/changes/archive/` 是否存在,不存在则源一取空结果(`entries` / `superseding` / `skipped` 全空),让源二独立可用。容错放在 `buildBacklog` 编排层,`aggregator.ts` 仍不改。

### 7.2 `active.md` 新增 Legacy Requirements 段

`renderActiveMarkdown` 加一节 `## Legacy Requirements (N)`:

- 列 `status: unimplemented` **且未被有效 legacy winner claim 退役**的条目(「有效退役」的精确定义见 §8.4)。
- 按 `source.document` 分组,带独立计数 N。
- `implemented` 条目**不渲染**(非待办)。
- 计数口径:Legacy Requirements 段有自己的 `(N)`;文件顶部待办说明行补一句「另有 N 项 legacy requirements 待办」。现有 `countOpenBacklog`(future-work + out-of-scope)口径不变,不把 legacy requirements 混入,避免改动既有计数语义。

### 7.3 staleness 守门

`forge backlog --check`(`checkBacklogStale`)天然覆盖第二源:`buildBacklog` 已读 `legacy-requirements.yaml`,改 yaml 而不重生成 `forge/backlog/` → 重建结果与磁盘不一致 → `--check` 报 stale。**无需额外逻辑**。

`forge backlog list` 可选地一并列出 legacy requirements(`writing-plans` 阶段定;非核心)。

---

## 8. 条目退役:复用 superseding 机制(D6)

### 8.1 forge change 如何认领

复用 backlog registry 现有的 `superseding_entries` 机制,**零额外 LLM**。后续 forge change 在其 `proposal.md` / `design.md` 的 scope 块里写:

```yaml
superseding_entries:
  - source_change: legacy-requirements   # 保留 sentinel —— 无日期前缀,不与真实 archived change 目录冲突
    entry_id: LR-0042
    new_status: completed                # legacy requirement 退役仅允许 completed(已实现)| obsolete(已取消),见下
    rationale: 本 change 实现了双因素认证
```

`source_change: legacy-requirements` 是**保留 sentinel**。`forge archive` 生成的 archived change 目录名都是 `YYYY-MM-DD-<slug>` 格式,正常不会产出名为 `legacy-requirements` 的目录。但要诚实指出:`scanArchivedFollowups` 实际把 `forge/changes/archive/` 下**任意**子目录名直接当作 `source_change`,并不强制日期前缀 —— 故 `legacy-requirements` 须作保留名并加防御,见 §8.5 的 `reserved-archive-dirname`。

**`new_status` 取值收紧:** `VALID_SUPERSEDING_NEW_STATUS` 对 scope-entry 有 4 个合法值(`superseded` / `obsolete` / `completed` / `inherited`),但 legacy requirement 的退役语义只有「已实现」与「已取消」两种 —— 故 **legacy requirement 的 `superseding_entries` 仅允许 `new_status ∈ {completed, obsolete}`**。`superseded` / `inherited` 描述的是 scope-entry 之间的取代/继承关系,用在 legacy requirement 上语义不明。`buildBacklog` 分流时遇到越界值按 §8.5 的 `invalid-legacy-status` warning 处理 —— 不产 tombstone,该条目仍留在 active.md。

### 8.2 `buildBacklog` 的分流与专属 tombstone 类型

`scanArchivedFollowups` 照常扫出所有 `superseding` 明细(含 `source_change: legacy-requirements` 的)。**关键约束**:`SupersedingDetail.registry_entry_snapshot` 字段类型固定为 `ScopeEntry | null`,且因 archived scope registry 里没有 legacy requirement 条目,聚合器对 `legacy-requirements::*` 明细解析出的该字段**恒为 `null`** —— `LegacyRequirement` 与 `ScopeEntry` schema 不同,**不能也不应**把它塞进这个 `ScopeEntry`-typed 字段。

`buildBacklog` 在调 `deriveWarningsAndTombstones` **之前**做一次分流:

1. 把 `agg.superseding` 里 `source_change === 'legacy-requirements'` 的明细**分离**出来;其余照旧进 `deriveWarningsAndTombstones`。
2. 对分离出的明细,只取其身份字段(`entry_id` / `new_status` / `rationale` / `superseded_in_change` / `superseded_at`),丢弃恒 null 的 `registry_entry_snapshot`;用 `entry_id` 去 `legacy-requirements.yaml` 查 `LegacyRequirement` 快照。
3. 组装成**新类型 `LegacyRequirementTombstone`**(独立定义,不复用 `SupersedingDetail` / `ScopeEntry`):`{ entry_id, new_status, rationale, superseded_in_change, superseded_at, requirement_snapshot: LegacyRequirement | null }`。winner 选择(多 change 认领同一 LR)、异常情形(快照 null / `new_status` 越界 / 重复认领 / 目录名异常)统一见 §8.5。

分流放在 `buildBacklog` 而非 `aggregator.ts`,聚合器无需知道 legacy-requirements 的存在 —— 否则未分流的 `legacy-requirements::*` 引用会被 `deriveWarningsAndTombstones` 判为 `dangling-reference` 误报。

### 8.3 `archived.md` 新增 Retired 段

`renderArchivedMarkdown` 加一节 `## Legacy Requirements — Retired`:`LegacyRequirementTombstone`(§8.2)schema 与 `ScopeEntry` 不同,**单独渲染**,不挤进现有 scope tombstone 段。每条记录其字段:`entry_id` / `new_status` / `superseded_in_change` / `superseded_at` / `rationale` + `requirement_snapshot`。

### 8.4 active 与 retired 的权威关系

一条 legacy requirement 算「已退役」、从 `active.md` Legacy Requirements 段**排除**,**当且仅当**它被一条**有效 legacy winner claim** 认领 —— 即该 claim 同时满足:① `new_status ∈ {completed, obsolete}`(§8.1);② `entry_id` 命中 `legacy-requirements.yaml`(§8.2 `requirement_snapshot` 非 null);③ 经 §8.5 duplicate winner 选择后胜出。只有这种 claim 产 `LegacyRequirementTombstone` 并把条目移出 active。

异常 claim 对 active 的影响要分清:

- **`invalid-legacy-status`**(`new_status` 越界):claim 被拒、不产 tombstone —— 该 legacy requirement **仍留 active**。
- **`dangling-legacy-claim`**(`entry_id` 不在 yaml):没有对应条目可退役、也谈不上「留 active」,只产 warning。
- **`duplicate-legacy-claim`**(同 `entry_id` 多个**有效**认领):§8.5 选出 winner,**winner 仍把条目退役、移出 active**;落败 claim 只额外产 `duplicate-legacy-claim` warning,**不会**因落败方存在就把已退役条目留回 active。

这与 scope-entry 处理一致(`render.ts` 的 `deriveWarningsAndTombstones`:分组选 winner → `tombstones.push(winner)`,duplicate 仅额外产 warning;`aggregator.ts` 对 dangling / invalid 不计入 superseded 集)。

被退役条目在 `legacy-requirements.yaml` 里的 `status` 若仍为 `unimplemented` 属暂时滞后(yaml 不被自动改写),下次 `extract` 会重判修正(代码已实现 → status 翻 `implemented`)。这与 scope-entry 一致:源 YAML 留着条目,registry 计算出 superseded。

### 8.5 winner 选择与异常处理

legacy claim 分流后自成一套处理,但必须与 scope-entry 的 superseding 处理**同构** —— 否则违背 §8.1「复用现有机制」;实施时**抽公共 helper**,scope 与 legacy 两条路径共用,防语义漂移。处理顺序与 `render.ts` 的 `deriveWarningsAndTombstones` 一致:**先剔除无效 claim,再对有效 claim 选 winner** —— 顺序不能反,否则一个排序更早的 dangling/invalid claim 会污染 winner 仲裁。

`buildBacklog` 对分流出的 legacy claim 按三步走:

**第 1 步 —— 校验,剔除无效 claim(产 warning,不进候选集):**

- **`dangling-legacy-claim`**:`entry_id` 在 `legacy-requirements.yaml` 查不到(§8.2 `requirement_snapshot` 为 `null`)—— 报 warning,不进候选集。
- **`invalid-legacy-status`**:`new_status ∉ {completed, obsolete}`(§8.1 收紧子集,含误用 `superseded` / `inherited` 或任意非法值)—— 报 warning,不进候选集;对应 legacy requirement 仍留 `active.md`(§8.4)。

**第 2 步 —— 对有效 claim 按 `entry_id` 分组、选 winner:**

- 同一 `entry_id` 多个有效 claim 时,按 `superseded_at` 最早(并列取 `superseded_in_change` 字典序)选 winner —— 与 scope tombstone 的 `earlier` 规则一致。只为 winner 产一条 `LegacyRequirementTombstone`。
- 某 `entry_id` 有效 claim 数 > 1 → 额外报 **`duplicate-legacy-claim`** warning(列全部有效认领者);winner 仍退役该条目(§8.4)。

**第 3 步 —— 与 claim 有效性无关的目录名异常(对任何 legacy claim 都查):**

- **`malformed-dirname`**:认领者 change 目录名无 `YYYY-MM-DD-` 前缀、`superseded_at` 解析为 `unknown` —— 与 scope 路径同处置(可复用既有 `malformed-dirname` warning kind)。
- **`reserved-archive-dirname`**:`forge/changes/archive/` 下若**真实存在**名为 `legacy-requirements` 的目录(与 §8.1 sentinel 命名空间相撞)—— 报 warning 提示用户改名;正常 `forge archive` 不会产生该目录。

全部 warning 沿 backlog registry 现有 `BacklogWarning` 风格,渲染进 `active.md` 的 `## Warnings` 段。`invalid-legacy-status`(2 值子集)与既有 `invalid-new-status`(4 值集 `VALID_SUPERSEDING_NEW_STATUS`)是**不同**判定:由于分流发生在 `deriveWarningsAndTombstones` **之前**,`legacy-requirements::*` 明细只走 legacy 这套、不会同时触发两套。

---

## 9. skill 层与构建同步

- **改 `skills/legacy-bridge-fulfillment/SKILL.md`**:`description` 与流程补 `extract` op;加 `extract` 的反偷懒约束(§4.3:判 `implemented` 必须真读代码 + 给 file:line evidence)。
- **不新增 slash 命令**(D7)—— skill 通用三 tier 已够,沿 Spec A。
- 改 `skills/` 后**必跑 `pnpm build`**(双源 md5 sync,见仓库 `CLAUDE.md` 约束 1)。

---

## 10. 测试策略

沿 Spec A —— manifest 设计天然可测,不需真调 API:

- **确定性 prep** → 断言 emit 的 manifest(来源文档清单 / 每文档一 task / `prompt` / `manifest_hash`);含 whole-repo 发现的 ignore 规则用例、`.docx`/`.pdf` 文本抽取用例。
- **`--apply`** → 喂 fixture 结果文件 → 断言 `legacy-requirements-draft.yaml`;含 `manifest_hash` 篡改检测、增量 diff 的 new/changed/vanished 标记三分支。
- **`--finalize`** → 断言 ID 分配(`max+1`)、既有用户编辑保留、`review` 翻 `confirmed`、幂等(无变化的 draft finalize 两次结果一致)。
- **`--api`** → 复用 Spec A 既有注入式 client mock。
- **backlog 双源** → 断言 `active.md` 的 Legacy Requirements 段(只列 unimplemented + 未被认领)、`archived.md` 的 Retired 段、`legacy-requirements::*` superseding 不被误报 dangling、`forge backlog --check` 对改动 yaml 报 stale。

---

## 11. 文件清单(forge-repo 侧)

> 文件名为建议,`writing-plans` 阶段可调整。

| 文件                                              | 改动 |
| ------------------------------------------------- | ---- |
| `src/core/legacy-bridge/extractor.ts`(新)        | whole-repo 发现 + 文本抽取 + `buildExtractTask`(prep)+ `applyExtractResult`(后处理)+ 增量 diff |
| `src/core/legacy-bridge/legacy-requirements.ts`(新) | `forge-legacy-requirements/v1` schema + `loadLegacyRequirements` + `--finalize` 合并 + ID 分配 |
| `src/core/legacy-bridge/llm-task.ts`(改)         | `LlmOp` 联合类型加 `extract` |
| `src/core/legacy-bridge/excel.ts`(复用)          | `.xlsx` 文本抽取(已有,extract 复用) |
| `src/cli/commands/legacy-bridge.ts`(改)          | 加 `extract` 子命令(emit / `--apply` / `--api` / `--finalize` 四模式 + 互斥校验) |
| `src/core/backlog/index.ts`(改)                  | `buildBacklog` 双源:加 `loadLegacyRequirements` + §7.1 空 archive 容错 + §8.2 superseding 分流(产 `LegacyRequirementTombstone`)+ §8.5 winner 选择/异常 warning |
| `src/core/backlog/render.ts`(改)                 | `renderActiveMarkdown` 加 Legacy Requirements 段;`renderArchivedMarkdown` 加 Retired 段;`BacklogWarning` 加 `dangling-legacy-claim` / `invalid-legacy-status` / `duplicate-legacy-claim` / `reserved-archive-dirname` kind;winner/重复/malformed 抽公共 helper 与 scope 路径共用;新 render 函数 |
| `src/core/backlog/assets/backlog-readme.md`(改)  | 文档化第二数据源 |
| `src/cli/commands/backlog.ts`(改,可选)          | `forge backlog list` 一并列 legacy requirements |
| `skills/legacy-bridge-fulfillment/SKILL.md`(改)  | 加 `extract` op fulfill 契约 + 反偷懒约束(改后必 `pnpm build`) |
| `docs/legacy-bridge.md`(改)                      | 文档化 Layer 3b + `--api` 判定较粗的诚实声明 |
| `docs/cli-reference.md`(改)                      | `extract` 子命令 |
| `CHANGELOG.md`(改)                               | 新增 Layer 3b feature note |
| `package.json`(改)                              | 加 `mammoth` + pdf 文本库依赖 |

---

## 12. 不做 / scope-out(明确边界)

- **不动 `aggregator.ts`** —— 双源合并在 `buildBacklog` 编排层,聚合器保持纯净。
- **不新增 legacy-bridge slash 命令**(D7)—— skill 通用三 tier 已够。
- **`status` 保持二值**(D1)—— 不引入 `partial`;边界情形用 `confidence: low` + `notes`。
- **`propose` 命令选单不在本 spec 改** —— 「在 `/forge:propose` 选单里加『mark legacy requirement completed』直接写 `superseding_entries`」是后续 UX 增强,本 spec 只支持手写 `superseding_entries` 块(D6 的「复用现有机制」)。
- **v0.3 reverse-sync 其余部分不做** —— 本 spec 只是 reverse-sync 的首块落地(老文档 → backlog),老文档的反向复写等留 v0.3 后续。
- **`.doc`/`.rtf`/`.html`/`.pptx` 不纳入文档发现**(§5.2)—— `.doc`(2007 前二进制 Word)需另一条更重的抽取路径(`mammoth` 只吃 OOXML 的 `.docx`);`.rtf`/`.html`/`.pptx` 对正式 SRS/HLD/LLD 太少见,各加一个解析依赖不划算。文档为 `.doc` 的够老项目须先转存为 `.docx`/`.pdf`。
- **provider 仍仅 anthropic** —— 沿 Spec A。

---

## 13. 遗留待定项(writing-plans 阶段定死)

以下非设计缺陷,是留给 `writing-plans` 阶段拍板的实施细节:

1. §3 `evidence` 强制策略 —— agent 模式 `status: implemented` 但 `evidence` 空时 `--apply` 的行为(告警 / 拒绝);`--api` 模式不硬校验(分模式见 §4.5)。具体阈值在此定死。
2. §5.2 pdf 文本库选型 —— 须可在 ubuntu + windows 双平台 CI 跑通、无原生编译依赖的纯 JS 库。
3. §5.1 whole-repo 发现的 ignore 规则细节(建议复用仓库既有 ignore 约定)。
4. §7.3 `forge backlog list` 是否一并列 legacy requirements。

(原自查项「分流时机」「增量合并匹配键」已在 Codex Round 1–3 审查中处置,见 §14。)

---

## 14. Codex 对抗性审查处置

本文档经 Codex 多轮对抗性审查;每条 finding 均**独立对照 forge-repo 实际代码核实**后处置 —— 不把 Codex claim 当结论。

### Round 1(基线修正):4 真 + 1 假

> 首轮 Codex 在错误代码基线上审查 —— 本设计分支误从陈旧的本地 `dev` 切出,缺 Spec A 代码。核实后修正分支基线到 `origin/main`(`5ceedd4`,Spec A 已合入),再对 4 条真 finding 处置。

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | HIGH     | **假** —— Codex 称 `llm-task.ts` / `runners.ts` / Spec A 文档不存在,实为审查分支基线错误;三者在 `origin/main` 均存在 | 非 spec 问题;修正分支基线到 `origin/main` |
| 2   | HIGH     | 真 —— `legacy-bridge` 已有 5 子命令,`extract` 是第六 | §2 改「第六个」并列出现有 5 个 |
| 3   | MEDIUM   | 真 —— §8.2 误用 `ScopeEntry`-typed 的 `registry_entry_snapshot` 携带 legacy 快照 | §8.2 定义独立 `LegacyRequirementTombstone` 类型 |
| 4   | MEDIUM   | 真 —— legacy 退役未收紧 `new_status`,4 值集含语义不符的 `superseded` / `inherited` | §8.1 收紧为 `{completed, obsolete}`;§8.5 加 `invalid-legacy-status` |
| 5   | MEDIUM   | 真 —— `contains_customer_data` 是 anchor 级,whole-repo 非 anchor 文件无标注 | 新增 §5.3 客户数据门(无条件 redact + 复用 data-transfer ack) |

### Round 2(基线已修正):5 真,全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | HIGH     | 真 —— `ApiRunner` 只发 `prompt`、不发 `inputs`,内容走 `inputs` 会令 `--api` 拿不到文档 | §4.2 关键约定:内容必须内嵌 `prompt`;§4.3/§5.2 同步 |
| 2   | MEDIUM   | 真 —— `outputPath` 相对路径以 `forgeRoot` 拼接,`forge/.cache/...` 会变 `forge/forge/.cache/...` | §4.2 改为 `.cache/extract-result-<n>.json` |
| 3   | HIGH     | 真 —— `buildBacklog` 无条件 `scanArchivedFollowups`,archive 目录缺失即抛错;brownfield 首次 extract 时无 archived change | §7.1 加空 archive 容错 |
| 4   | MEDIUM   | 真 —— legacy claim 分流绕过 winner 选择 / 重复认领 / malformed-dirname | §8.5 重写为「winner 选择与异常处理」,抽公共 helper |
| 5   | MEDIUM   | 真 —— §5.3 ack 形态留给 writing-plans,作实施依据不够闭合 | §5.3 定死:不引入新 ack 字段,复用 `--acknowledge-data-transfer` |

### Round 3(基线已修正):3 真,全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | HIGH     | 真 —— `readTaskResults` 只认 `{ text }` 信封,直接写需求数组与契约冲突 | §4.2/§4.3/§4.4 明确 `{ "text": "<JSON 字符串>" }` 信封 |
| 2   | MEDIUM   | 真 —— 增量合并键 `document + section` 对无章节条目(`TODO.md` 等)不唯一 | §6.1 匹配键加 content hash 退化 + 冲突标 `pending` |
| 3   | LOW      | 真 —— `legacy-requirements` sentinel 与 archive 目录不冲突的假设未被代码强制 | §8.1 改诚实声明;§8.5 加 `reserved-archive-dirname` warning |

### Round 4(基线已修正):3 真,全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | HIGH     | 真 —— `ApiRunner` 无代码读取工具、prompt 仅含 file tree,`--api` 给不出可靠 file:line evidence,与 §3/§4.3 evidence 契约冲突 | §4.5 加「evidence 契约随模式分级」:`--api` 的 evidence 为 advisory、不硬校验;§3 / §13 同步 |
| 2   | MEDIUM   | 真 —— §6.1 增量合并键对「`section` 非空但同章节多需求」仍会撞键误继承(Round 3 只修了 `section` 为空) | §6.1 改为「匹配仅在键唯一时进行」,任一键多于 1 条 → `conflict`、全标 `pending` |
| 3   | LOW      | 真 —— §5.3 point 2 描述成 per-发现文件 gate,`checkAck` 实为全局 anchor 级 | §5.3 point 2 改为复用全局 anchor 级 gate(更保守,不改 `ack.ts`) |

### Round 5(基线已修正):1 真,全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | MEDIUM   | 真 —— §7.2/§8.4 写「被 `superseding_entries` 认领即排除 active」,与 §8.1/§8.5「invalid claim 不退役、条目仍留 active」矛盾;`aggregator.ts`/`render.ts` 实际只让合法 winner claim 进退役集 | §7.2/§8.4 改为「被**有效 legacy winner claim** 退役」并定死三条件 |

### Round 6(基线已修正):1 真,全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | MEDIUM   | 真 —— Round 5 改写 §8.4 时把「duplicate 落败方」与 dangling/invalid 并列说成「条目仍留 active」;实则 duplicate 场景 winner 仍退役该条目(`render.ts` `tombstones.push(winner)`) | §8.4 按 invalid / dangling / duplicate 三类分别写明对 active 的影响 |

### Round 7(基线已修正):1 真,全处置

| #   | severity | 核实结论 | 处置 |
| --- | -------- | -------- | ---- |
| 1   | MEDIUM   | 真 —— §8.5 把「winner 选择」列在 dangling/invalid 校验之前,顺序反了;`render.ts` `deriveWarningsAndTombstones` 实为先剔无效、再选 winner | §8.5 重排成与 `render.ts` 一致的三步流水线(校验剔除 → 选 winner → 目录名异常) |

### Round 8(基线已修正):0 finding —— 收敛

Codex 对照全部关键文件(§8.5 三步流水线、接口签名、`scope-entries` schema、backlog render 逻辑、legacy-bridge 各子模块)逐一核实,未发现 HIGH / MEDIUM / LOW finding。

**收敛声明:** 有效 finding 趋势 **4 → 5 → 3 → 3 → 1 → 1 → 1 → 0**(单调收敛)。Round 8 达成 **0 HIGH / 0 MEDIUM / 0 LOW**,文档收敛 —— 可作为 `writing-plans` 阶段的实施依据。每轮 finding 均独立对照 forge-repo 实际代码核实后处置;Round 1 的 1 条 HIGH 经核实为 Codex 假阳性(实为审查分支基线错误,已修正)。
