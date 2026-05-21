# Setup Stage Extensions — onboarding checklist

> 给新项目或迁移到 forge 的项目的 onboarding 指南,避免 `stage_extensions` 配置常见坑(codex 失焦扫整个 working tree / 15+ 分钟 hang / adversarial 模式漏 build_prompt 立即失败)。

## 背景:为什么需要专门 onboarding

`forge/config.yaml#stage_extensions` 是 forge 的可选特性 — 把 codex review / adversarial 等外部工具挂到 5 个 stage(brainstorming / propose / apply_critical_plan_review / review / verify)上。它的配置**有几处必须填对**的字段,文档零散在 [`docs/codex-review.md`](../codex-review.md) / [`docs/stage-extensions.md`](../stage-extensions.md) 里。**实测踩坑**:

1. **失焦扫整个 working tree**(漏 `--user-focus` / `--target-label`)— ForgeUE 项目 propose stage 缺这两个 flag,codex 拿到字面 `Focus: (none provided)` / `Target: current branch`,把整个仓库当 review 范围,surface 出与当前 change 无关的历史 finding(TBD-010 / executor lifecycle 等)。
2. **15+ 分钟 hang**(`defaults` 过松)— 默认 `timeout_sec: 900` / `max_rounds: 10` / `max_retries: 1`,实测 codex 单轮偶尔挂,经常 2 轮后还没退出。
3. **adversarial 模式漏 `build_prompt`** — helper 的 `run --mode adversarial` 强制要求 `--prompt-file`,缺 build_prompt 时 prompt 文件为空 → 跑挂。

本文档给一份**标准模板** + **检测脚本** + **5 stage 各自的 user-focus 文本设计**,新项目 copy 后跑一次 `forge preflight stage-extensions-check` 就 OK。

## 适用场景

| 场景 | 入口 |
|---|---|
| 新项目第一次装 forge | [§1 新项目 setup](#1-新项目-setup) |
| 已有 forge 项目想加 stage extensions | [§1 新项目 setup](#1-新项目-setup)(同) |
| 已有 stage_extensions 配置想检测漏洞 | [§2 已有项目检测](#2-已有项目检测) |
| 用 codex 之外的 stage extension(自定义 build_prompt) | [§3 自定义](#3-自定义自己的-stage-extension) |

## §1 新项目 setup

### Step 1 — 装 forge plugin(不要跑 `forge init`,已 deprecated)

```bash
# Claude Code
/plugin marketplace add Accelerator-mzq/forge
/plugin install forge@accelerator-mzq-forge
/reload-plugins

# OpenCode(opencode.json 加 plugin entry)
# Codex(git clone + symlink,见 docs/codex-install.md)
```

### Step 2 — 建项目 forge 目录

```bash
mkdir -p forge/{drafts,changes,specs}
```

### Step 3 — 写 `forge/config.yaml`

最小可用配置:

```yaml
schema: forge-spec-driven/v1
context: |
  # 项目背景描述(给 AI 用于 brainstorm/propose 判断 scope)
  ...
```

### Step 4 — 加 `stage_extensions` 段(可选,但推荐)

**copy 下面的"标准模板"**,根据项目语言调整 user-focus 文本(中英文都可):

```yaml
stage_extensions:
  # 防 hang:单轮硬超时 10 分钟,output 文件 3 分钟不动判 zombie,失败一次即停,不做多轮收敛
  defaults:
    timeout_sec: 600
    zombie_threshold_sec: 180
    max_retries: 1
    convergence:
      max_rounds: 1

  brainstorming:
    - name: codex-adversarial
      enabled: true
      build_prompt: >
        node "${FORGE_HELPER_DIR}/codex-review-helper.mjs" build-prompt
        --output "${PROMPT_FILE}"
        --user-focus "聚焦 change ${CHANGE_ID} 的 brainstorm draft;评估想法边界、关键假设、是否值得继续推进;不要 surface working tree 中未合并代码的实现细节问题。"
        --target-label "${CHANGE_ID}-brainstorm"
      command: >
        node "${FORGE_HELPER_DIR}/codex-review-helper.mjs" run
        --mode adversarial
        --prompt-file "${PROMPT_FILE}"
        --output-log "${OUTPUT_FILE}"
      output: forge/changes/${CHANGE_ID}/.evidence/codex-adversarial-r${ROUND}-a${ATTEMPT}.md

  propose:
    - name: codex-adversarial
      enabled: true
      build_prompt: >
        node "${FORGE_HELPER_DIR}/codex-review-helper.mjs" build-prompt
        --output "${PROMPT_FILE}"
        --user-focus "聚焦 change ${CHANGE_ID} 的 4 件套 (proposal.md / design.md / specs/ / tasks.md) 的设计决策、边界、可行性;不要 surface working tree 中未合并代码的问题。"
        --target-label "${CHANGE_ID}-propose"
      command: >
        node "${FORGE_HELPER_DIR}/codex-review-helper.mjs" run
        --mode adversarial
        --prompt-file "${PROMPT_FILE}"
        --output-log "${OUTPUT_FILE}"
      output: forge/changes/${CHANGE_ID}/.evidence/codex-adversarial-r${ROUND}-a${ATTEMPT}.md

  apply_critical_plan_review:
    - name: codex-adversarial
      enabled: true
      build_prompt: >
        node "${FORGE_HELPER_DIR}/codex-review-helper.mjs" build-prompt
        --output "${PROMPT_FILE}"
        --user-focus "聚焦 change ${CHANGE_ID} 的 tasks.md 是否可独立执行、风险点、测试覆盖是否充分;不要 surface working tree 中其他无关代码的问题。"
        --target-label "${CHANGE_ID}-apply-plan"
      command: >
        node "${FORGE_HELPER_DIR}/codex-review-helper.mjs" run
        --mode adversarial
        --prompt-file "${PROMPT_FILE}"
        --output-log "${OUTPUT_FILE}"
      output: forge/changes/${CHANGE_ID}/.evidence/codex-adversarial-r${ROUND}-a${ATTEMPT}.md

  review:
    - name: codex-code-review
      enabled: true
      # review 用 code-review 模式(直接分析 git diff,不需要 build_prompt)
      command: >
        node "${FORGE_HELPER_DIR}/codex-review-helper.mjs" run
        --mode code-review
        --output-log "${OUTPUT_FILE}"
      output: forge/changes/${CHANGE_ID}/.evidence/codex-review-r${ROUND}-a${ATTEMPT}.json

  verify:
    - name: codex-adversarial
      enabled: true
      build_prompt: >
        node "${FORGE_HELPER_DIR}/codex-review-helper.mjs" build-prompt
        --output "${PROMPT_FILE}"
        --user-focus "聚焦 change ${CHANGE_ID} 实施结果的三维 verify (Completeness / Correctness / Coherence);评估 tests 与 spec 是否一致;不要 surface working tree 中未合并代码的问题。"
        --target-label "${CHANGE_ID}-verify"
      command: >
        node "${FORGE_HELPER_DIR}/codex-review-helper.mjs" run
        --mode adversarial
        --prompt-file "${PROMPT_FILE}"
        --output-log "${OUTPUT_FILE}"
      output: forge/changes/${CHANGE_ID}/.evidence/codex-adversarial-r${ROUND}-a${ATTEMPT}.md
```

### Step 5 — 跑 preflight 验证配置完整性

```bash
forge preflight stage-extensions-check
```

期望输出:`✓ 配置完整,无已知问题`。

如果看到 `[WARN]` / `[SUGGESTION]`,根据提示修。

### Step 6 — 跑一次 dry-run 验证 codex 行为

起一个 dummy change,跑 propose stage 触发 codex-adversarial,检查产出文件 `forge/changes/<id>/.evidence/codex-adversarial-r0-a0.md` 的 prompt 头部应含:

```
Focus: 聚焦 change <id> 的 4 件套 ...
Target: <id>-propose
```

而**不是**:

```
Focus: (none provided)
Target: current branch
```

## §2 已有项目检测

如果项目已经有 `forge/config.yaml#stage_extensions` 配置,跑:

```bash
forge preflight stage-extensions-check
```

会扫以下规则:

| 检测项 | 等级 | 含义 |
|---|---|---|
| `build_prompt` 含 `codex-review-helper.mjs build-prompt` 但缺 `--user-focus` | WARN | codex 失焦扫整个 working tree |
| 同上,缺 `--target-label` | WARN | codex 报告 target 显示字面 `current branch` 不精确 |
| `command` 含 `--mode adversarial` 但 entry 无 `build_prompt` | WARN | helper run 立即失败 |
| `defaults.timeout_sec` > 900 | SUGGESTION | 实测易 hang,建议 600 |
| `defaults.convergence.max_rounds` > 3 | SUGGESTION | 多轮重跑成本大,建议 1 |

发现问题后,按 [§1 Step 4](#step-4--加-stage_extensions-段可选但推荐) 的标准模板修对应字段。

**注意**:loose 模式 — 即使发现问题 `preflight` 也 exit 0,不阻塞 CI。如需在 CI 里 strict 失败,可以:

```bash
forge preflight stage-extensions-check 2>&1 | tee /tmp/sec.log
grep -qE '\[WARN\]|\[SUGGESTION\]' /tmp/sec.log && exit 1 || exit 0
```

## §3 自定义自己的 stage extension

如果你的 stage extension **不是** codex review(比如自己的 lint / 自定义 LLM 调用),preflight 只检测 codex-review-helper 相关字段,不检测自定义 command。规则:

- 自定义 build_prompt 不会被扫(只扫 `codex-review-helper.mjs build-prompt` 字符串)
- 自定义 command 含 `--mode adversarial` 字符串会被扫(可能误报)— 若是自定义,把 `--mode adversarial` 改为 `--mode my-custom` 或类似避开关键字
- `defaults.timeout_sec` / `convergence.max_rounds` 的告警阈值固定 — 适合 codex 场景;自定义 stage extension 想要更长 timeout 直接在 entry 级覆盖(`entry.timeout_sec`)而不改 defaults

## 常见问题

### Q: 我只想用 review stage 的 code-review 模式,不需要 adversarial / build_prompt

可以。`code-review` 模式无 `build_prompt`,preflight 不会告警。
最小配置:

```yaml
stage_extensions:
  defaults:
    timeout_sec: 600
    convergence:
      max_rounds: 1
  review:
    - name: codex-code-review
      enabled: true
      command: >
        node "${FORGE_HELPER_DIR}/codex-review-helper.mjs" run
        --mode code-review --output-log "${OUTPUT_FILE}"
      output: forge/changes/${CHANGE_ID}/.evidence/codex-review-r${ROUND}-a${ATTEMPT}.json
```

### Q: user-focus 文本要怎么写才精准?

原则:**告诉 codex"看哪里"+"不看哪里"**。

- ✅ "聚焦 change ${CHANGE_ID} 的 4 件套;不要 surface working tree 中未合并代码的问题"
- ❌ "review this change"(太泛,等于没传)
- ❌ "review the whole repo"(等于触发原 bug)

stage-specific 设计参考 §1 Step 4 的标准模板:每个 stage 有不同关注点(brainstorm 关注 idea 边界,verify 关注三维覆盖等)。

### Q: 我的项目 working tree 不一定干净(有未合并改动),会被 codex 误报吗?

会。`adversarial` 模式 codex 看到的是整个 working tree(不只是 git diff)。`user-focus` 显式说"不要 surface 未合并代码"能极大降低 false positive,但不能 100% 杜绝。

更激进的方案:
- 在新建 change branch 时确保 working tree 干净
- 或者改用 `code-review` 模式(只看 git diff,不看 working tree)

### Q: 跑 preflight 报 `[WARN]` 但我确实不需要 user-focus(比如自定义场景),如何 silence?

当前没有 silence 机制(YAGNI)。两种选择:

1. 把 entry 改为非 codex-review-helper 命令(自定义,preflight 不扫)
2. 接受 stderr warning(loose 不阻塞,不影响 exit code)

如果未来有 silence 需求,可以加 `entry.preflight: skip` 字段,或考虑加 `--silence-rule` flag。

## 相关文档

- [docs/codex-review.md](../codex-review.md) — codex review / adversarial 用户指南
- [docs/stage-extensions.md](../stage-extensions.md) — stage-extensions framework 完整协议
- [docs/getting-started.md](../getting-started.md) — forge 端到端教程
- [docs/cli-reference.md](../cli-reference.md) — forge CLI 16 子命令(含 preflight 子命令组)
