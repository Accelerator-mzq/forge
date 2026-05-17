# subagent-driven-discipline 可配置 Model Tier 映射 设计文档

- **作者**:msc(由 Claude Opus 4.7 协助 brainstorming)
- **日期**:2026-05-17
- **状态**:草案,待用户审阅。本设计经历三次 scope 转向(markdown 开关 → forge config 布尔开关 → tier→model 重映射);前一版 spec(`max-model-mode-design.md`)因 scope 实质改变已删除,本文件为唯一现行 spec。本文件经 **7 轮 Codex 对抗性审查**(累计 56 条 Finding 逐条独立核实 —— 真问题已修、不成立者附理由);末轮 Codex 判定「问题已收敛、无阻断项、可定稿进入实现」,末轮新发现 4 条均为 🟢 非阻断的实现期 TODO。
- **目标**:把 `forge:subagent-driven-discipline` 的 §1 model 列从「写死的 `haiku`/`sonnet`/`opus`」明确为 **tier 标签**,并新增 `forge/config.yaml#model_tiers` 配置,让项目把 `haiku` / `sonnet` 两个可重映射 tier 标签指向实际派发的模型(默认恒等,不改变现状;`opus` 是 design MANDATORY 档,不可重映射)。用户最初的「max model」诉求(把 `haiku` 档统一抬到 `sonnet`)成为该配置的一个预设 `model_tiers: { haiku: sonnet }`。同步修正 discipline `## Platform Note` 把「跨 harness」与「跨模型 provider」混为一谈的措辞;按 B 方案让 `subagent-driven-development` 的 model 选型指向 discipline §1 并加条件限定。

---

## 0. 决策快照

| #   | 决策              | 选项                                                                                                                          |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | 性质              | **配置驱动的 tier→model 重映射(S2)** —— 不是布尔 max 开关;「max」只是其一个预设。比原始 max 通用,又不重写整张 §1 taxonomy(S3 已否决) |
| 2   | 配置载体          | **`forge/config.yaml#model_tiers`** —— 沿用 forge 现有 config infra(`ForgeConfig` schema + `forge config`),项目级           |
| 3   | 配置语义          | 键 = 可重映射的 tier 标签 **`haiku` / `sonnet` 两个**;值 = 实际派发的具体模型(**单次查表、非递归** —— 值是模型,不再被当 tier 二次解析);整段 / 某键缺失 = 该 tier **恒等(identity)**                |
| 4   | 交付机制          | **M2** —— 无 SessionStart hook 改动;skill governance 段指示 controller 在 dispatch 前读 `forge/config.yaml#model_tiers` 解析。M2 不引入 CC-only 的 hook 依赖;但 `model_tiers` config **本身只对直接传 `model` 参数的 harness(CC)生效**,非 CC 走 agent 定义(不是「所有 harness 统一接口」)|
| 5   | §1 表格           | **不动** —— `haiku`/`sonnet`/`opus` 单元格保留,governance 段声明它们是 tier 标签                                              |
| 6   | §2 playbook       | **标题保留** —— prompt 纪律对 tier 解析后的实际模型继续适用                                                                    |
| 7   | SDD 关系          | **B 方案指针 + 条件限定** —— `subagent-driven-development` 不再字面列 model tier,指向 discipline §1;指针注明按 harness 的解析方式 |
| 8   | Platform Note     | **修正** —— 区分 harness-independence(真)与 model-provider-independence(假:tier 标签预设 Claude 族默认模型)                |
| 9   | 历史记录          | **不改写** —— recovery / case study / catalog 章节里的模型名是事实档案                                                        |
| 10  | `.claude/` 副本   | **同步 governance 段 + Platform Note 修正**(forge-repo 自身 dogfood 工作副本)                                                |
| 11  | forge-eval        | **不新增 scenario** —— 现有 `subagent-driven-discipline.yaml` 测算法任务→Opus,不受影响                                        |
| 12  | user-global config | **不做** —— forge config 一律项目级;全局层需另起 infra,超出范围                                                              |
| 13  | tier 可重映射性 + 方向 | `haiku` / `sonnet` 可重映射;**`opus` 不设配置键、不可重映射**(design 类 MANDATORY,恒为 opus)。只允许 **identity 或升级**(`haiku`→{haiku\|sonnet\|opus},`sonnet`→{sonnet\|opus});任何**降级**(如 `sonnet`→`haiku`)→ resolver warn + 回退 identity(§1.3.4 等有 MANDATORY 下限)|
| 14  | `forge config` CLI 路径 | **本轮钉死** —— `forge config` 的 `set`/`get` 均支持点分嵌套键(`set/get model_tiers.haiku`)。`set` 分两阶段:**① 先 parse `config.yaml`**,整体解析失败 → CLI 直接 fail-fast 拒写(不进 predicate);**② parse 成功后**用写入侧 predicate `validateModelTierAssignment()`(非 graceful-fallback 的 resolver)校验赋值,非法 tier / 非枚举 value / 降级 → fail-fast 拒写(exit 非 0、不触碰文件)。成功写 `model_tiers.*` 时附一行 CC-only 静态提示。`get` 为 **raw 读取**(缺键 → `null`,沿现有 `forge config get` 语义)。不退化为「文档指引手改 yaml」|

---

## 1. 背景与动机

### 1.1 现状

`forge:subagent-driven-discipline` 的核心是 §1 的 28 子类 task taxonomy:按 subagent 任务类型给出 model tier(`haiku` / `sonnet` / `opus`)+ WHY + prompt 元素。这三个词在当前 skill 里**同时充当两个角色**:(a) tier 名(cheap / standard / most-capable 三档),(b) Claude Code 上的默认具体模型。

### 1.2 跨 harness 事实(已对照 references 核实)

- **OpenCode / Codex 上模型重映射已实现**:`references/opencode-tools.md:37` —— OpenCode subagent 是独立 `.md` 文件,`model:` 写在其 frontmatter,派发时不传 model;`opencode-tools.md:62` 叫用户建 `haiku-implementer / sonnet-implementer / opus-implementer` 等 agent。`references/codex-tools.md:19` —— Codex 经 agent profile 配 model。**即:在这些 harness 上,skill 里的 `haiku`/`sonnet`/`opus` 早已是纯 tier 标签,用户在 harness 的 agent 定义里把标签指向任意模型。**
- **Claude Code 是唯一「写死」处**:CC 的 Task/Agent 工具 `model` 参数是字面枚举,仅 `haiku`/`sonnet`/`opus` 三个固定 Claude 模型,不可指向其它模型。

### 1.3 需求的本质(从「max」到「可配置映射」)

用户最初要「max model」(haiku→sonnet)。深入后认识到:真正的需求是 **tier 标签到实际模型的映射可配置**。顺事实推导:

- 非 CC harness 的「可换」已由 harness 的 agent 定义解决,无需 skill 改动 —— 只需 skill 文本明确「`haiku`/`sonnet`/`opus` 是 tier 标签」。
- CC 上「可换」受限于 Task 工具仅有的 3 个 Claude 模型,实际意义是「把某 tier 在这 3 个里重新选」—— 最有用的就是把 cheap 档(`haiku`)抬到 `sonnet` 或 `opus`。原「max model」= 该映射的预设 `{ haiku: sonnet }`。

因此本设计 = **一个 tier→model 映射配置**,默认恒等(零行为变化),用户按需重映射;并把「tier 标签」语义在 skill 里明示。

### 1.4 为什么连带改 SDD 与 Platform Note

- **SDD**:`subagent-driven-development` 的 `## How to Dispatch` 有一个 `model 选型 matrix`,括号写「沿 `forge:subagent-driven-discipline` §1 taxonomy」—— 是 §1 的三行浓缩摘要,会与 §1 漂移。按 B 方案改为指针;指针须注明 model tier 的解析按 harness 不同(CC 走 `model_tiers` config,OpenCode/Codex 走 agent 定义)。
- **Platform Note**:discipline `## Platform Note`(及两个 references 的「What still works」)称「§1 ... platform-independent, apply verbatim on every harness」。这把**跨 harness 独立**(真)与**跨模型 provider 独立**(假 —— tier 标签预设 Claude 族默认模型)混为一谈。需修正措辞。

---

## 2. 机制设计

### 2.1 配置 schema

`forge/config.yaml` 新增 `model_tiers` 段(沿 `ForgeConfig` 现有 `writing_plans` / `process_verification` 等的 snake_case 命名)。**只有 `haiku` / `sonnet` 两个键**(`opus` 是 design 类 MANDATORY tier,不可重映射,不设键):

```yaml
model_tiers:
  haiku: sonnet # haiku 档改用 sonnet 模型派发(原 "max model" 预设;sonnet 键省略即恒等)
```

- `src/core/schema/types.ts` 的 `ForgeConfig` 加:
  ```ts
  type ModelTier = 'haiku' | 'sonnet' | 'opus';
  /** model tier 标签 → 实际派发模型的重映射;缺失/缺键 = 该 tier 恒等。
   *  opus 不可重映射故不设键。详见 model-tiers-config.ts */
  model_tiers?: {
    haiku?: ModelTier;
    sonnet?: ModelTier;
  };
  ```
  并加 `DEFAULT_MODEL_TIERS = { haiku: 'haiku', sonnet: 'sonnet', opus: 'opus' }`(resolver 输出含 `opus`,恒为 `'opus'`)。
- 新模块 `src/core/schema/model-tiers-config.ts`(沿 `writing-plans-config.ts` 模式),**两个函数、读写职责分开**(不拿 graceful-fallback 的 resolver 去做 fail-fast 写入校验):

  **(a) `resolveModelTiers(config, warn?)` —— 读取侧纯函数**(`ForgeConfig | undefined → { haiku, sonnet, opus }`),**永远返回合法 map、永不抛异常**(配置层 graceful degradation)。**用途**:单测 + 作为下面六条规则的权威 TS 表达;**不在运行时 dispatch 热路径**(M2 下 controller 运行时解析是「读 YAML + 据治理段判断」,不调 TS)。本设计**不**引入「resolved 展示」CLI 命令。六条规则:
  1. **单次查表、非递归** —— `model_tiers.haiku` 的值是要派发的*具体模型*,不再被当作 tier 二次解析(`{haiku: sonnet}` → haiku 档派 `sonnet` 模型)。
  2. **缺失 → 恒等** —— `config` 为 `undefined` / `model_tiers` 缺失或某键缺失 → 该 tier identity。
  3. **malformed `model_tiers` → 全恒等** —— `model_tiers` 不是对象(`null` / 字符串 / 数组等)→ 整体视为缺失,全 identity;未知键(`opus` / `max` / 大小写变体 `Haiku`)→ 忽略 + warn。
  4. **非法值 → warn + 该 tier identity** —— 值非 `haiku|sonnet|opus`(含大小写不匹配)→ warn + 回退该 tier identity。
  5. **只升不降** —— `haiku` 可映射到 `haiku|sonnet|opus`、`sonnet` 可映射到 `sonnet|opus`;降级(`sonnet`→`haiku`)→ warn + 回退 identity(§1.3.4 等有 MANDATORY 下限)。
  6. **`opus` 恒为 `opus`** —— 输出的 `opus` 字段不受配置影响。

  **(b) `validateModelTierAssignment(tier: string, value: string)` —— 写入侧 fail-fast predicate**,供 `forge config set` 用。**参数类型是 `string`**(不是 `'haiku'|'sonnet'` union)—— 因为 CLI 把 `model_tiers.<X>` 点分键里的 `<X>` 原样拆出来传入,`<X>` 可能是任意字符串;若类型收成 union,`invalid-field` 分支在类型层就不可达。CLI 把**所有 `model_tiers.<X>` 键一律拆出 leaf `X` 交给本 predicate**(`X` 为 `opus`/`max`/任意非 `haiku`·`sonnet` → predicate 返回 `invalid-field`),错误来源单一、不在 CLI 层散判。返回 `{ ok: true }` 或 `{ ok: false; reason }`,`reason` 取**固定枚举** `'invalid-field' | 'invalid-value' | 'downgrade'`(CLI 稳定输出 + 测试可断言):`tier` 非 `haiku`/`sonnet` → `invalid-field`;`value` 非 `haiku|sonnet|opus` → `invalid-value`;`value` 相对 `tier` 属降级 → `downgrade`。**多重非法时 `reason` 优先级固定**:先判 `tier`,再判 `value` 枚举,最后判降级 —— 第一个命中即返回(故 `model_tiers.opus bogus` 返回 `invalid-field`)。`set` 据此**拒绝写入**(不 sanitize)。**注**:`config.yaml` 整体 parse failure 不经本 predicate(predicate 只看 `tier`/`value`、`reason` 枚举无 parse 类)—— 见下条,由 CLI 在 parse 阶段先行 fail-fast。

  两函数共享规则的方式须**落到代码**而非愿望:`model-tiers-config.ts` 内定义两个**具名常量**并由两函数共用 —— `MODEL_TIER_VALUES`(合法值集,`['haiku','sonnet','opus']`)+ `MODEL_TIER_RANK`(tier 强弱序数,`{ haiku: 0, sonnet: 1, opus: 2 } as const`;「升级或 identity」即 `RANK[value] >= RANK[tier]`)。`resolveModelTiers` 规则 4/5 与 `validateModelTierAssignment` 的 `invalid-value`/`downgrade` 判定都引用这两个常量,不得各写一遍。单测须含一致性断言:`Object.keys(MODEL_TIER_RANK).sort()` 与 `[...MODEL_TIER_VALUES].sort()` 相等(防一处加模型另一处漏)。
- `src/core/schema/index.ts` 导出 `resolveModelTiers` + `validateModelTierAssignment`。
- **`forge/config.yaml` 整体 YAML 解析失败 / 不可读**(`parseConfig` 抛 `ConfigParseError`)的处理 —— 只涉及 `forge config` CLI(`config.ts` 本就有 config 读取 + `parseConfig`),无需独立 safe-read helper:
  - **`get` 路径**:解析错误**照常向用户报出**(沿现有 `forge config get` 行为),不静默吞成 `null` 或 identity。
  - **`set` 路径**:**fail-fast 拒写**(不触碰损坏文件、提示用户先修复 YAML),避免覆盖用户文件里的其它字段。顺序明确 —— `set` **先 parse `config.yaml`**(parse 失败即 CLI fail-fast,不进 predicate),parse 成功后才把 `tier`/`value` 交 `validateModelTierAssignment()` 校验赋值。
  - `resolveModelTiers()` 自身不接触文件 IO;「`undefined` 入参 → 全 identity」是它的纯函数语义,不是 `get` CLI 的展示行为。
  - **dispatch advisory 路径 vs CLI 诊断命令的有意差异**:运行时 controller 解析配置时,`config.yaml` 不存在/无法解析 → 按 identity **继续派发**(治理段所述 —— 这是派发决策,不能因配置坏掉就卡住工作流);而 `forge config get` 是**诊断命令**,无法解析就**报错**给用户。二者对 parse failure 处理不同是刻意的,不是矛盾。

### 2.2 治理段(插入 discipline SKILL.md)

在 `skills/subagent-driven-discipline/SKILL.md` 的「核心立场 / 何时启用」段之后、`## §1` 之前,插入新治理段。下方为提议内容 —— 实现时**语义以此为准**,最终措辞实现阶段定稿;一旦定稿,repo-root 与 `.claude/` 两副本的**治理段**(非整个 SKILL.md —— 两份 SKILL.md 本就有意分叉)用**同一份最终文本**(逐字一致,见 §3 行 #11)。治理段须**自包含**(不引用本设计文档的章节号)。

```markdown
## Model Tier 映射(`haiku`/`sonnet`/`opus` 是 tier 标签)

本 skill §1 taxonomy 与 §2 playbook 用 `haiku` / `sonnet` / `opus` 标注每个 task 子类的 model tier。**这三个词是 tier 标签**(cheap / standard / most-capable 三档),默认对应同名 Claude 模型,但 `haiku` / `sonnet` 两档实际派发哪个模型可被项目配置重映射。

**实际模型的解析(controller 在 dispatch subagent 前必做)**:

- 读取项目 `forge/config.yaml` 的 `model_tiers` 段:
  ```yaml
  model_tiers:
    haiku: sonnet # haiku 档改用 sonnet 模型派发
  ```
- §1 标 `haiku` / `sonnet` 的子类 → 实际传 `model_tiers` 解析后的模型;§1 标 `opus` 的子类**恒派 `opus`**(`opus` 不可重映射)。
- **单次查表**:`model_tiers.haiku` 的值是要派发的*具体模型*,不再二次解析(`{haiku: sonnet}` → haiku 档派 `sonnet` 模型)。
- `model_tiers` 整段缺失、某键缺失、`forge/config.yaml` 不存在或无法解析 → 该 tier **恒等**(标签即模型,等于现状)。
- **遇非法值、降级映射(如 `sonnet: haiku`)、或 malformed `model_tiers`** → 该 tier **回退恒等派发**,并在回复里**明确提示用户该配置项无效**(否则用户会以为生效、难以排查)。
- 「把 cheap 档统一抬到 standard」(成本换质量的常见诉求)→ `model_tiers: { haiku: sonnet }`。

**操作化 4 步**(dispatch 前):① 读 `forge/config.yaml` 的 `model_tiers`;② §1 标 `haiku`/`sonnet` 的子类查表得实际模型,§1 标 `opus` 的子类恒 `opus`;③ 配置项无效 / 降级 / malformed / 文件不存在或无法解析 → 用 identity 并向用户提示;④ dispatch 时把解析出的模型传给 `model` 参数。

**按 harness 的差异**:

- **Claude Code** 等直接给 Task/Agent 工具传 `model` 参数的 harness —— `model_tiers` 在此生效;取值限 `haiku`/`sonnet`/`opus`(该工具仅这三个 Claude 模型)。
- **OpenCode / Codex** 等 subagent 由独立 agent 定义携带 `model:` 的 harness —— controller 不传 model 参数,`model_tiers` config 在此**不生效**;重映射直接在 agent 定义文件里改 `model:`。

**约束**:`opus`(§1.1.4 / §1.1.5 等 design 类的 MANDATORY tier)**不可重映射,恒派 `opus`** —— design 任务不可降级是 §1 绝对原则。`haiku` / `sonnet` 的重映射**只允许 identity 或升级**(保持原档,或 `haiku`→更强档、`sonnet`→`opus`),不允许降级(`sonnet`→`haiku` 会让 §1.3.4 等 MANDATORY-sonnet 子类失守)。§2「Haiku Reliability Playbook」各节的严格 prompt 纪律,对 tier 解析后的实际模型继续适用。

recovery / case study / catalog 等历史记录章节里出现的模型名是过去实际跑过的事实档案,不受 `model_tiers` 影响、不改写。
```

> **治理段 ⇄ resolver 的一致性**:M2 下 controller 的运行时解析依据是上面这段治理段(自然语言),`resolveModelTiers()` 的六条规则(§2.1)是同一套规则给 CLI/测试用的 TS 表达。二者的**「输入 → 派发哪个模型」映射规则一一对应**,修订时必须同步。唯一刻意不同的是*异常配置的暴露渠道*:resolver 走 `warn` 回调(CLI/测试语境),治理段要求 controller 在回复里 user-facing 提示 —— 两者意图相同(把无效配置暴露给人),渠道按语境不同。**注**:「治理段语义 ⇄ resolver 行为」的等价**无法自动测试**(一个是自然语言、一个是代码);降低漂移靠 —— resolver 单测按六条规则**逐条命名**(test 名即规则清单,作为可见锚点)+ 本 note + reviewer 审读。

### 2.3 SDD 的 `model 选型 matrix` 替换(B 方案 + 条件限定)

`skills/subagent-driven-development/SKILL.md`:

1. `## How to Dispatch` 段的 `model 选型 matrix`(字面 haiku/sonnet/opus 三行)替换为指针(措辞实现时微调):

   ```
   **model 选型**:每个 task 的 model tier 依据 `forge:subagent-driven-discipline` §1 task-type taxonomy。§1 的 `haiku`/`sonnet`/`opus` 是 tier 标签 —— 在 Claude Code 等直接传 `model` 参数的 harness 上,实际模型经 discipline 的 `model_tiers` 配置解析(默认恒等);在 OpenCode/Codex 等 harness 上,经 subagent agent 定义的 `model:` 解析。本 skill 不单列 model tier 摘要,以免与 discipline §1 漂移。粗粒度直觉见上方 `## Model Selection`。
   ```

2. `## Companion Skill` 段的「**若不存在**」分支当前称内联 `model 选型 matrix` 已自足 —— matrix 已删,需改为:discipline 不存在时,model tier 选型回退到本 skill 抽象的 `## Model Selection`(cheap / standard / most-capable 粗粒度直觉),并显式给出与 dispatch 代码块枚举的对应(**cheap↔`haiku` / standard↔`sonnet` / most-capable↔`opus`**),使回退路径仍 deterministic;cross-verify 五类与 decision tree 仍由本 skill 内联段自足(这两段本就 harness/模型无关)。

3. dispatch 代码块的 `model: <haiku | sonnet | opus>` 一行**保持不变**(Task 工具参数合法枚举);行尾注释可补「实际模型见 discipline `## Model Tier 映射`」。

> SDD 的 `## Model Selection` 抽象段(cheap/standard/most-capable,不点名 `haiku`)与本改动无关,不动。SDD 对 discipline §3.2(cross-verify)/§3.3(decision tree)的引用是 harness/模型无关的流程纪律,**不在本次改动范围**。

### 2.4 Platform Note 修正

`skills/subagent-driven-discipline/SKILL.md` 的 `## Platform Note`:把「§1 ... platform-independent and apply verbatim on every harness」修正为区分两个维度 —— §1 的**任务分类结构 + prompt 纪律**跨 harness、跨模型 provider 通用;但 §1 的 **model tier 列 `haiku`/`sonnet`/`opus` 是 tier 标签**,默认对应同名 Claude 模型,标签到具体模型的解析按 harness / `model_tiers` 配置不同(详见 `## Model Tier 映射` 段)。两个 references 文件(`codex-tools.md` / `opencode-tools.md`)的「What still works exactly as written」段有同样表述,补一句同样的澄清注。

### 2.5 §1 表格

§1 所有表格(含 `haiku`/`sonnet`/`opus` 单元格)**保持原样不动**。governance 段(§2.2)声明这些是 tier 标签;controller 据 governance 段解析实际模型(`haiku`/`sonnet` 经 `model_tiers`,`opus` 恒等)。这是决策 #5 —— 不重写精心构建的 §1 taxonomy 全表(S3 已否决)。

---

## 3. 改动范围(逐文件)

source of truth 是仓库根 `skills/`(见 `CLAUDE.md` 关键约束 #1)。改完 `skills/` 必须跑 `pnpm build`,由 `scripts/copy-templates.mjs` 反向同步到 `src/core/templates/` 与 `dist/core/templates/`。

| #   | 文件                                                              | 改动                                                                                                  |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `skills/subagent-driven-discipline/SKILL.md`                      | 新增 §2.2 治理段;修正 §2.4 Platform Note;§1 表格不动;frontmatter `version` 升一档                    |
| 2   | `skills/subagent-driven-development/SKILL.md`                      | §2.3:`model 选型 matrix`→指针、`## Companion Skill` 若不存在分支更新、代码块注释补一句;`version` 升一档 |
| 3   | `skills/subagent-driven-discipline/references/codex-tools.md`      | §2.4:「What still works」段补一句 tier 标签澄清注                                                     |
| 4   | `skills/subagent-driven-discipline/references/opencode-tools.md`   | §2.4:同上                                                                                            |
| 5   | `src/core/schema/types.ts`                                        | `ForgeConfig` 加 `model_tiers?`(**只 `haiku` / `sonnet` 键**);加 `ModelTier` 类型 + `DEFAULT_MODEL_TIERS` 常量 |
| 6   | `src/core/schema/model-tiers-config.ts`(新建)                    | `resolveModelTiers()`(读取侧 resolver,§2.1 六条规则)+ `validateModelTierAssignment()`(写入侧 fail-fast predicate);沿 `writing-plans-config.ts` 模式 |
| 7   | `src/core/schema/index.ts`                                        | 导出 `resolveModelTiers` + `validateModelTierAssignment`                                              |
| 8   | `tests/core/schema/model-tiers-config.test.ts`(新建)             | 单测:`resolveModelTiers` 覆盖 §2.1 六条规则(**测试逐条按规则命名**,test 名即规则清单 —— 作为治理段⇄resolver 的可见锚点)+ `validateModelTierAssignment` 覆盖 ok / `invalid-field` / `invalid-value` / `downgrade`(见 §5 步骤 1) |
| 9   | `src/cli/commands/config.ts`                                      | **增强 `forge config` 的 `set`/`get` 支持点分嵌套键**。`set` 两阶段:**先 parse `config.yaml`**(解析失败 → fail-fast 拒写、不改文件),parse 成功后用 `validateModelTierAssignment()` 校验,非法 → exit 非 0、不改文件;`set model_tiers.*` 成功附一行 CC-only 静态提示。`get` 为 raw 读取(缺键 → `null`;CLI help 须说明 raw `null` = 未设 = identity;解析失败照常报错)。方案见决策 #14 |
| 10  | `CHANGELOG.md`                                                    | Keep a Changelog:`Added` 一条(`model_tiers` 配置 —— 须注明**仅对 CC 等直接传 model 的 harness 生效**、重映射会抬高成本)+ `Changed` 一条(SDD model 选型改指向 discipline) |
| 11  | `.claude/skills/subagent-driven-discipline/SKILL.md`              | forge-repo dogfood 工作副本(git-tracked,与 generic 版有意分叉、非 build 镜像)。**仅同步 §2.2 治理段 + §2.4 Platform Note 修正**,其 §1 表格与 case study 不动;此副本无 SDD 配套 |
| 12  | `tests/core/templates/skills.test.ts`                             | **新增 parity test**:抽取 repo-root 与 `.claude/` 两份 discipline SKILL.md 的 `## Model Tier 映射` 段,断言逐字一致(防两副本治理段漂移)。段边界 = 从 `## Model Tier 映射` 标题行(含)起、到下一个二级标题(`## `)或文件末尾前止。该二级标题字面固定 —— 某副本若改标题层级 / 重命名导致抽取不到,**测试硬失败即预期的 drift 告警**,须人工对齐;测试描述里写明这一点 |
| 13  | `tests/cli/`(新建或扩展现有 config 测试)                          | **`forge config` CLI 测试**:点分 `set`/`get` 生效;`set` 非法值(三类 reason)exit≠0;**`config.yaml` 损坏(YAML 语法错 / root 非 mapping / 缺 schema 等各类 `ConfigParseError`)时 `set` exit≠0 且文件 byte-for-byte 不变**;`get` 缺键 → `null`、损坏 → 报错;`set model_tiers.*` 输出含 CC-only 提示 |
| 14  | `pnpm build` 产物                                                 | `src/core/templates/` + `dist/core/templates/` 由 build 自动反向同步,不手改                          |

> 行 #11 的 `.claude/` 副本与行 #1 的 generic 版是两个有意分叉的独立 artifact(`pnpm build` 不连接二者),其全部内容一向人工维护、无自动 parity 守护。本设计**只**往该副本同步治理段与 Platform Note 修正,不调和两者其它差异。两副本的治理段用 §2.2 定稿的同一份最终文本(逐字一致)。治理段内的章节引用(§1 / §1.1.4 等)成立的前提是两副本共享同一套 §1-§9 顶层结构编号(当前事实如此;分叉只在 §5 case study 内容数量)。

---

## 4. 非目标(YAGNI)

- **不做 SessionStart hook 注入(M1)**。M2 选择:`model_tiers` 由 controller 在 dispatch 前自读 `forge/config.yaml`,无需新 hook 脚本 / 注入 md / 改 `session-start`(治理段文本跨 harness 一致,但配置的*生效路径*按 harness 分流 —— CC 经 `model_tiers`、非 CC 经 agent 定义)。若日后要 CC 上「推送」式可靠性增强,可作后续(参考现有 `monitor.enabled` + `monitor-check.mjs` 范式)。
- **不重写 §1 taxonomy 表为抽象 tier 名(S3)**。§1 单元格保留 `haiku`/`sonnet`/`opus`;表内大量 WHY 文案点名 model,全抽象化损失可读性且收益不抵风险。
- **不新增 forge-eval scenario**。现有 `forge-eval/scenarios/subagent-driven-discipline.yaml` 测「算法任务→Opus」(§1.1.4 opus-MANDATORY),与 `model_tiers` 正交、不受影响。新增「重映射生效」scenario 技术可行但本次 out-of-scope。
- **不改写 recovery / case study / catalog 历史记录**里的模型名。
- **不做 user-global config 层**。forge config 一律项目级(`cwd/forge/config.yaml`)。
- **`model_tiers` 值不支持非 Claude 模型字符串**。CC Task 工具只有 `haiku`/`sonnet`/`opus`;非 CC harness 的任意模型重映射走 agent 定义,不经本 config。
- **不改 discipline 对 SDD 引用的 §3.2 / §3.3 部分**。那两段(cross-verify / decision tree)是 harness 与模型无关的流程纪律,无需条件化。
- **不做「在不适用 harness 上检测到 `model_tiers` 时给 CLI 提示」**。OpenCode/Codex 项目里写了 `model_tiers` 不生效(走 agent 定义),治理段已文字说明;一个 `forge config` doctor 式告警是可选后续,本次 out-of-scope。

---

## 5. 验证方式

1. **TS 单测**:
   - `resolveModelTiers()`(读取侧)覆盖 §2.1 六条规则 —— (a) `config` undefined / `model_tiers` 缺失 → 全 identity;(b) 单次查表(`{haiku: sonnet}` → haiku=`sonnet`,不递归);(c) malformed `model_tiers`(`null` / 字符串 / 数组 / 未知键 `opus`·`max`·`Haiku`)→ 全 identity 或忽略该键 + warn,**不抛异常**;(d) 非法值 → warn + 该 tier identity;(e) 升级正确(`haiku→opus`、`sonnet→opus`)、降级被拒(`sonnet→haiku` → warn + identity);(f) 输出 `opus` 字段恒为 `'opus'`。
   - `validateModelTierAssignment()`(写入侧)覆盖 —— 合法赋值 `ok: true`(identity 与升级);`ok: false` 的三类 `reason` 各覆盖:非法 tier → `invalid-field`、非枚举 value → `invalid-value`、降级 value → `downgrade`;**多重非法走优先级**(`model_tiers.opus bogus` → `invalid-field`)。
   - **共享常量一致性**:`Object.keys(MODEL_TIER_RANK).sort()` 与 `[...MODEL_TIER_VALUES].sort()` 相等。
   - `tests/core/templates/skills.test.ts` 的 parity test:两份 discipline SKILL.md 的 `## Model Tier 映射` 段逐字一致。
2. **CLI 测试**(`tests/cli/`):点分 `set`/`get` 生效;`set` 三类非法值 exit≠0 **且 config 文件 byte-for-byte 不变**;**`config.yaml` 各类 `ConfigParseError`(YAML 语法错 / root 非 mapping / 缺 schema)下 `set` exit≠0 且文件 byte-for-byte 不变**;`get` 缺键 → `null`、文件损坏 → 报错;`set model_tiers.*` 输出含 CC-only 提示(断言一段**固定最小 substring**,使提示文案稳定可测)。
3. **`pnpm build` 成功** —— `copy-templates.mjs` 把 `skills/` 同步到 `src/core/templates/` 与 `dist/`;`tests/core/templates/skills.test.ts` 校验同步后模板 frontmatter 与 `references/` 镜像。**注**:该 test 不对 SKILL.md 正文做 hash 比对,正文一致性由 build 拷贝保证 —— 验收硬依赖「改完必跑 build」。
4. **本地按 CI 顺序跑五步全绿**:`pnpm lint` → `pnpm format:check` → `pnpm typecheck` → `pnpm build` → `pnpm test`(`format:check` 是 CI 硬门槛)。
5. **`.claude/` 副本独立核对**(不在 build 管线内):`.claude/skills/subagent-driven-discipline/SKILL.md` 已同步治理段 + Platform Note 修正,且治理段与 repo-root 版逐字一致(`git diff` / grep 比对)。
6. **语义正确性由 reviewer 审读确认**:治理段准确表达 tier 标签语义 + `model_tiers` 解析规则 + 按 harness 差异 + opus 不降级约束;SDD 指针准确、`## Companion Skill` 若不存在分支已更新;Platform Note 修正到位。**验证边界(诚实声明)**:本设计**不含**「controller 在某 `model_tiers` 配置下实际派对模型」的自动化行为验证 —— 该行为正确性依赖 controller 遵循 advisory 指令,与 §1 taxonomy 本身的行为正确性同理(skill 是 controller 读取并自觉遵循的 advisory markdown)。
7. **证据**:附治理段最终文本、Platform Note diff、SDD 指针 diff、`.claude/` 副本治理段 diff、`resolveModelTiers` / `validateModelTierAssignment` 测试输出、`tests/cli` model_tiers 用例结果摘录、`pnpm build` 与 `pnpm test` 输出。验收报告须**显式记录负面证据** —— 写明本次未做「controller 在某配置下实际派对模型」的行为验证(advisory 边界,步骤 6),不得让「`pnpm test` 全绿」被误读为端到端功能已验证。

---

## 6. 风险与注意

- **advisory 性质,无 runtime 强制**:`model_tiers` 是 controller 读取并遵循的配置,skill 本身(连同 §1 的 tier 推荐)本就是 advisory markdown。`resolveModelTiers()` 给 CLI/core 用,但「controller dispatch 时实际按解析值传 model」这一步无 runtime gate —— 与 §1 taxonomy 本身的强制力同级。**注**:controller 若沿旧习惯不读 config 直接按 §1 字面派 → 退化为恒等(= 默认行为);故此风险**只在用户设了非默认映射时**才表现为「以为生效实未生效」。这是 doc-skill 的固有性质,§5 步骤 6 已声明本设计不含自动行为验证。
- **默认恒等 → 升级零行为变化**:`model_tiers` 缺失 = 全 identity = 完全等于现状。现有 forge 安装升级到含本特性的版本后,**不重映射就毫无行为/成本变化**;用户须主动配置才生效。(这相对前一版「默认 ON」设计是改进 —— 不存在「升级即静默变更行为」的问题。)
- **重映射抬高成本**:把 `haiku` 档映射到 `sonnet`/`opus`、或把 `sonnet` 档映射到 `opus`,会显著增加成本 —— 尤其 `sonnet→opus`:`sonnet` 档覆盖所有 review(spec / code-quality / adversarial),是高频档,抬到 `opus` 的成本放大可能比 `haiku→sonnet` 更猛。这是用户主动配置的取舍;不附加预算上限机制(超出本次范围)。CHANGELOG `Added` 条目应提示这一成本含义。
- **M2 依赖 controller 每次 dispatch 前读 config**:比 hook 推送多一步「读 `forge/config.yaml`」。缓解:治理段明确要求,且读 config 是 dispatch 前的自然动作;controller 有 Read/Bash 工具,成本极低。若可靠性不足可后续加 M1 hook 推送。
- **`.claude/` 两副本治理段一致性**:`.claude/` 副本不在 `pnpm build` 管线内。本设计已把两副本治理段的 parity test 纳入 scope(§3 行 #12 / §5 步骤 1)—— `skills.test.ts` 抽取比对两份 `## Model Tier 映射` 段,CI 自动拦截漂移。`.claude/` 副本其余内容仍人工维护(本设计不扩及)。
- **B 方案反转了 plan-v1.1 Task 2 的「SDD 实操字面」决策**(当初有意把 model 摘要内联进 SDD)。已与用户确认:单一信息源、根除漂移的收益 > 内联便利。残留风险:SDD 删内联 matrix 后精确 tier 选型依赖 controller invoke discipline 查 §1;缓解同前 —— 指针显式指向 §1,SDD `## Model Selection` 抽象段提供够用的粗粒度直觉。
- **行为闭环弱(已知 + 已披露)**:测试能证明 `resolveModelTiers()` 正确、两副本治理段一致,但无法自动证明「controller 在某配置下实际派对了模型」。这是 advisory doc-skill 的固有边界(§5 步骤 6)。决策 #11 选择不新增 forge-eval scenario —— 若要补一条最小行为验收,须重议 #11。
