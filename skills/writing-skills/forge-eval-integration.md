# forge-eval 接入指南 — 新 skill 如何写 YAML 场景文件

> 本文面向"正在用 forge:writing-skills 协议开发新 skill"的工程师。
> 读完后你能独立写出一份通过 RED+GREEN 双轨 eval 的 `forge-eval/scenarios/<skill-name>.yaml`。

---

## 1. YAML 文件位置

```
forge-eval/scenarios/<new-skill-name>.yaml   # 一 skill 一文件
```

runner 按 `skill:` 字段自动匹配 `skills/<skill-name>/SKILL.md` 作 GREEN leg system prompt。

---

## 2. 顶级元数据字段

沿 `forge-eval/types.ts:41-46` `ScenarioFile` schema:

```yaml
skill: <new-skill-name> # 必需;与 SKILL_NAMES(index.ts)一致
description: <一句话> # 可选,但建议填写,给人读的摘要
model: claude-sonnet-4-6 # 默认评估模型(可按 scenario 覆盖)

scenarios:
  - id: ...
```

---

## 3. scenarios 数组字段

沿 `forge-eval/types.ts:25-38` `Scenario` interface:

```yaml
scenarios:
  - id: <scenario-id> # 必需,同一 skill 下唯一
    pressures: [time, sycophancy] # 可选;仅记录,不参与评分判定
    turns:
      - id: t1-<turn-id> # 可选;缺省按数组索引自动编号
        user: |
          <模拟用户消息>            # 必需
        assertions: # 可选;缺失时 patternResult.skipped=true
          must_match:
            - regex: '<pattern>' # 全部命中才 pass
          must_not_match:
            - regex: '<pattern>' # 全部不命中才 pass
        judge_rubric: | # 必需(spec §5.5.3 合约)
          <LLM-judge 评分指引>
          同时给 RED + GREEN 两次评分提供细则(6 分及格 / 0 分触发条件)
```

**v3 修订说明**:不引入 `phase` / `expected_judge_score_max` / `expected_violations` /
`bootstrap_skill` 字段 — runner 不读这些字段(runner 自动对每条 scenario 跑 RED+GREEN 配对)。
若后续 9d/9f sub-plan 需要严格门禁,需先开独立 sub-plan 扩展 runner + types + compare。

---

## 4. RED + GREEN 配对工作原理

`forge-eval/runner.ts:120-123` `orchestrateRun` 对每个 scenario 执行:

1. **RED leg** — `runScenario(scenario, withSkill=false, client)`
   不加 skill bootstrap,跑 baseline AI(无 SKILL.md system prompt)
2. **GREEN leg** — `runScenario(scenario, withSkill=true, client)`
   加载 `skills/<skill-name>/SKILL.md` 作 system prompt,跑 with-skill AI
3. **比较** — `compareScenarioPair(scenario, red, green, threshold=1.5)`
   `pairPass = green.scenarioPass && delta >= 1.5`

同一份 yaml 的 `assertions` 和 `judge_rubric` 同时用于 RED 和 GREEN 两次跑。
runner 不感知哪次是 RED 哪次是 GREEN — 它只比较 judge 平均分的差值(delta)。

---

## 5. delta 阈值(GREEN - RED ≥ 1.5)

沿 `forge-eval/compare.ts:14` 默认 `DEFAULT_DELTA_THRESHOLD = 1.5`(0-10 分制):

- **太高** → eval 一直挂(模型自身随机波动 ±0.5 分常见)
- **太低** → skill 实际无效但 eval 过(失去意义)
- **1.5** = 1 分容差 + 0.5 信号边界;后续可按数据校准

**达不到 1.5 时的修复方向**:

| 问题                        | 修复方向                                                             |
| --------------------------- | -------------------------------------------------------------------- |
| RED 太宽松(baseline 也能过) | 收紧 `must_match` 正则 / 加 `pressures` / 改 `judge_rubric` 评分门槛 |
| SKILL.md 写得不到位         | REFACTOR 段加红旗清单 / 反向加固 anti-pattern 拦截段                 |

---

## 6. runner 调用命令

```bash
# 单 skill 调试(开发阶段最常用)
pnpm eval:skill <new-skill-name>

# changed-only(git diff 过滤,CI PR 触发)
pnpm eval:changed

# 全量跑(weekly baseline 漂移检测)
pnpm eval
```

---

## 7. CI 三 trigger

沿 design §2.9.4:

1. **PR changed-only** — 每 PR 自动跑改动的 skill(GitHub Actions 触发,`pnpm eval:changed`)
2. **weekly 全量** — 全部 skill 跑一遍,检测 baseline 模型漂移
3. **手动触发** — `gh workflow run forge-eval` 供 debug 用

---

## 8. 调试 LLM-judge 评分

若 judge 给分不符合预期:

- 检查 `judge_rubric:` 是否描述了具体的 **6 分及格 / 0 分触发** 门槛
  (模糊 rubric → judge 随机给分 → delta 噪声大)
- 检查模型偏向:sonnet 偏严,opus 偏宽容;可在 scenario 级用 `model:` 覆盖
- 跑 `--debug-judge` flag(若当前 runner 版本支持)查看 judge 完整推理链

---

## 9. RED scenario 不失败时怎么办

RED leg 应该失败(score < 6)才证明 skill 有必要。若 RED 也通过:

- **选项 A** — RED scenario 设计太宽松:改 `must_match` 正则 / 加 `pressures: [time]` /
  收紧 `judge_rubric` 让 baseline 更难过
- **选项 B** — baseline AI 已被 superpowers 上游加固,skill 必要性减弱:
  与 plan owner 复审是否缩小本 skill 范围或废弃该 scenario

---

## 参考

- `forge-eval/types.ts` — ScenarioFile / Scenario / Turn / Assertions schema
- `forge-eval/runner.ts:100-143` — orchestrateRun RED+GREEN 配对实现
- `forge-eval/compare.ts` — compareScenarioPair + DEFAULT_DELTA_THRESHOLD
- `forge-eval/scenarios/writing-plans.yaml` — 已有 yaml 正例(含 multi-turn + pressures)
