# Model Tier 映射(`model_tiers`)— 用户指南

> `model_tiers` 是 `forge/config.yaml` 的一个可选配置段,用来把 `forge:subagent-driven-discipline` §1 taxonomy 里的 model tier 标签重映射到实际派发的模型。
>
> **默认恒等 —— 不配置 `model_tiers` 就完全等于现状,零行为变化。**

## 目录

- [这是什么 / 为什么](#这是什么--为什么)
- [Quick Start](#quick-start)
- [配置规则](#配置规则)
- [按 harness 的差异](#按-harness-的差异)
- [成本提示](#成本提示)
- [无效配置的行为](#无效配置的行为)

---

## 这是什么 / 为什么

`forge:subagent-driven-discipline` 的 §1 taxonomy 按 subagent 任务类型给每个子类标了一个 **model tier**:

| tier 标签 | 含义 | 典型任务 |
| --------- | ----------------- | ------------------------------------ |
| `haiku`   | cheap / 机械      | 完整 inline code 的 transcribe 类实现 |
| `sonnet`  | standard          | 多文件集成、所有 review               |
| `opus`    | most-capable      | algorithmic / architectural design   |

这三个词是 **tier 标签**,默认对应同名 Claude 模型。`model_tiers` 让你把 `haiku` / `sonnet` 两档**实际派发的模型**换掉 —— 最常见的诉求是「把机械任务也用更强的模型跑」(以成本换质量)。

`opus` 是 design 类的 **MANDATORY tier,不可重映射**(design 任务不可降级是 §1 绝对原则)。

## Quick Start

把 cheap 档(`haiku`)统一抬到 `sonnet`(即常说的「max model」):

```bash
forge config set model_tiers.haiku sonnet
```

等价于在项目 `forge/config.yaml` 里写:

```yaml
model_tiers:
  haiku: sonnet # haiku 档改用 sonnet 模型派发
```

读当前值:

```bash
forge config get model_tiers.haiku   # 未设 → 输出 null(即恒等,等于现状)
```

不配置 `model_tiers` → 三档全部恒等 → 行为与现状完全一致。

## 配置规则

- **键**:只有 `haiku` / `sonnet` 两个可重映射;`opus` 不设键、恒派 `opus`。
- **值**:`haiku` / `sonnet` / `opus` 三选一。
- **只允许 identity 或升级**:`haiku` 可映射到 `haiku` / `sonnet` / `opus`;`sonnet` 可映射到 `sonnet` / `opus`。**降级**(如 `sonnet: haiku`)会被拒绝 —— 否则 §1.3.4 等 MANDATORY-sonnet 的 review 子类会失守。
- **单次查表**:`{ haiku: sonnet }` 表示「haiku 档派 sonnet 模型」,不会因为 `sonnet` 同时也是 tier 名而再追一次。
- **缺失 = 恒等**:整段缺失、或某个键缺失 → 该 tier 的标签即模型。
- `forge config set model_tiers.<tier> <model>` 对非法赋值 **fail-fast 拒写**(不污染 `config.yaml`),错误分三类:`invalid-field`(键不是 `haiku`/`sonnet`)、`invalid-value`(值不是 `haiku`/`sonnet`/`opus`)、`downgrade`(降级)。

## 按 harness 的差异

`model_tiers` 配置**只对直接给 dispatch 工具传 `model` 参数的 harness 生效**:

- **Claude Code** 等 —— controller dispatch subagent 时直接传 `model` 参数,`model_tiers` 在此生效。
- **OpenCode / Codex** 等 —— subagent 由独立的 agent 定义文件携带 `model:` 字段,controller 不传 `model` 参数。`model_tiers` 在此**不生效**;要换模型,直接改对应 agent 定义文件的 `model:`。

## 成本提示

把 `haiku` 档映射到 `sonnet` / `opus`、或把 `sonnet` 档映射到 `opus`,会在「大量机械任务 / 并行 subagent / 反复 review」的场景下显著增加 token 与调用成本。其中 `sonnet → opus` 的放大尤其明显 —— `sonnet` 档覆盖所有 review(spec / code-quality / adversarial),是高频档。

默认恒等不产生任何额外成本;`model_tiers` 是按需主动配置的「成本换质量」开关。

## 无效配置的行为

手工编辑 `forge/config.yaml` 时若写了非法值、降级映射、或格式错误(`model_tiers` 不是对象、未知键等)的 `model_tiers`:controller 在解析时会**回退到恒等派发**,并在回复里**明确提示你该配置项无效** —— 既不静默出错,也不会因配置坏掉而中断工作流。

`forge/config.yaml` 整体无法解析(YAML 语法错 / 缺 `schema` 字段等)时:`forge config get` 照常报错;`forge config set` fail-fast 拒写、不触碰损坏的文件。
