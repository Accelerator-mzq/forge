# Codex Review — forge 预置 Extension 用户指南

> codex review / adversarial 是 [stage-extensions framework](stage-extensions.md) 的**预置 extension**。本文面向用户视角,说明如何开启、配置、理解收敛行为。
>
> 技术细节(config schema 完整字段 / 协议设计 / troubleshooting)见 [`docs/stage-extensions.md`](stage-extensions.md)。

## 目录

- [§1 Quick Start](#quick-start)
- [§2 完整 Config 默认值](#完整-config-默认值)
- [§3 5 Stage 触发点](#5-stage-触发点)
- [§4 Severity 4 级映射](#severity-4-级映射)
- [§5 收敛规则 + 用户介入流程](#收敛规则--用户介入流程)
- [§6 Tier 2/3 手动跑 codex CLI 指引](#tier-23-手动跑-codex-cli-指引)

---

## Quick Start

### 最快开启方式

在项目 `forge/config.yaml` 加:

```yaml
stage_extensions:
  # 建议显式收紧 defaults(默认 timeout 900s/max_retries 1/max_rounds 10 过松,
  # 实测易 15+ 分钟无输出 hang;详 docs/migration/setup-stage-extensions.md)
  defaults:
    timeout_sec: 600
    zombie_threshold_sec: 180
    max_retries: 1
    convergence:
      max_rounds: 1
  review:
    - name: codex-code-review
      enabled: true
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

> **`code-review` 与 `adversarial` 的差别**:`code-review` 模式直接分析 git diff,无需 prompt 文件;`adversarial` 模式必须先用 `build_prompt` 命令生成 prompt 文件,再由 `command` 通过 `--prompt-file "${PROMPT_FILE}"` 传给 `run` —— helper 的 `run --mode adversarial` 强制要求 `--prompt-file`,缺了会直接报错退出。所以 adversarial entry 必须同时写 `build_prompt` 与 `command` 两个字段。

> **`--user-focus` 与 `--target-label` 必传(adversarial 模式)**:不传时 helper 拼字面 `Focus: (none provided)` / `Target: current branch` 进 prompt,codex 会失焦扫整个 working tree(可能 surface 跟当前 change 无关的历史 finding)。**ForgeUE 实测**:propose stage 缺 user-focus → codex 报无关 module 的 lifecycle/orchestrator finding。强烈推荐 setup 后跑一次 `forge preflight stage-extensions-check` 验证配置完整性,或参考 [docs/migration/setup-stage-extensions.md](migration/setup-stage-extensions.md) 完整 checklist。

保存后,下次跑 `/forge:review` 或 `/forge:verify` 时 AI 主代理自动检测并触发 codex review。

### 推荐路径

**新用户**:先只开 `review` + `verify` 两个 stage(D/E 路径)。每个 stage 约 5-15 分钟,整体额外耗时 20-50 分钟。熟悉协议后再扩展到 `brainstorming` / `propose` / `apply_critical_plan_review`。

**关闭某个 stage**:把该 entry 的 `enabled` 改 `false`,或整个删除该 stage 配置。

```yaml
stage_extensions:
  review:
    - name: codex-code-review
      enabled: false   # 临时关闭
```

---

## 完整 Config 默认值

下表列出所有字段在 `STAGE_EXTENSIONS_DEFAULTS` 中的默认值(来源:`src/core/schema/stage-extensions-config.ts`)。

```yaml
# 等效的默认配置(无需写入 config.yaml — 未设字段自动使用这些默认值)
stage_extensions:
  defaults:
    poll_interval_sec: 300       # 轮询间隔 300 秒
    zombie_threshold_sec: 300    # 僵尸阈值 300 秒
    timeout_sec: 900             # 超时 900 秒(15 分钟)
    max_retries: 1               # 失败后最多重试 1 次(总共 2 次尝试)

    convergence:
      max_rounds: 10                        # 最多 10 轮收敛
      max_rounds_on_exceed: ask             # 超上限时询问用户
      block_severity: [BLOCKER, MAJOR]      # 这两级阻塞收敛
      ignore_severity: [MINOR, NIT]         # 这两级不计入收敛判定
      confidence_threshold: 0.7            # 低于 0.7 的 finding 过滤掉
      verdict_approve_short_circuit: true  # approve verdict + block 桶空时直接收敛

    severity_map:
      critical: BLOCKER
      high: MAJOR
      medium: MINOR
      low: NIT

    severity_map_to_forge:
      BLOCKER: critical
      MAJOR: critical
      MINOR: warning
      NIT: suggestion

    user_interaction:
      block_unconverged: auto_fix_recommended   # 未收敛时推荐 auto fix
      max_rounds_exceed: give_up_recommended    # 超轮次时推荐放弃
```

**常见自定义**:

```yaml
# 缩短超时(测试环境)
stage_extensions:
  defaults:
    timeout_sec: 300

# 只阻塞 BLOCKER(放宽收敛标准)
stage_extensions:
  review:
    - name: codex-code-review
      enabled: true
      command: "..."
      output: "..."
      convergence:
        block_severity: [BLOCKER]     # MAJOR 不阻塞收敛
        ignore_severity: [MAJOR, MINOR, NIT]

# CI 自动化(不询问用户)
stage_extensions:
  review:
    - name: codex-code-review
      enabled: true
      command: "..."
      output: "..."
      convergence:
        max_rounds: 3
        max_rounds_on_exceed: force_end   # 超 3 轮直接写 backlog,不询问
```

---

## 5 Stage 触发点

codex review 可在 forge 主流程的 5 个 stage 挂钩。每个 stage 的 config key 名、触发时机和适用场景:

| Stage | Config Key | 触发时机 | 典型使用场景 |
|---|---|---|---|
| **A. brainstorming** | `brainstorming` | Brainstorm draft 产出后 | 对 draft 做架构或产品方向审查;检查需求完整性 |
| **B. propose** | `propose` | Propose 4 件套产出后 | 审查 proposal / specs / design 质量;检查 spec 覆盖度 |
| **C. apply_critical_plan_review** | `apply_critical_plan_review` | Apply 前的 critical plan review | 对 tasks.md / 实施计划做完整性/顺序/清晰度四维检查 |
| **D. review** | `review` | `/forge:review` 执行后 | 代码质量 / 逻辑正确性 / 安全漏洞;是**最常用触发点** |
| **E. verify** | `verify` | `/forge:verify` 执行后 | 实施完整度 / 三维验证补充;对抗性深度审查找遗漏 |

### 推荐配置原则

- **只开 D/E(推荐新用户)**:review + verify 是最有价值的审查点,代码已写完,codex review 找到的问题最直接
- **加 B(有需要)**:proposal 质量把关,减少 apply 阶段返工
- **加 A/C(高要求项目)**:加重每个阶段的 AI review,总耗时翻倍,适合对质量要求极高的场景

---

## Severity 4 级映射

codex 输出的 severity 经过两次映射才到 forge 最终显示:

### 第一级映射:codex → forge 内部 severity

| codex 原生 severity | 默认映射 forge 内部 severity | 说明 |
|---|---|---|
| `critical` | **BLOCKER** | 阻塞收敛;通过 block_severity 控制 |
| `high` | **MAJOR** | 阻塞收敛(默认配置) |
| `medium` | **MINOR** | 不阻塞收敛(默认写 ignore 桶) |
| `low` | **NIT** | 不阻塞收敛(默认写 ignore 桶) |

### 第二级映射:forge 内部 severity → forge finding 级别(显示用)

| forge 内部 severity | 默认 forge finding 级别 | 处理方式 |
|---|---|---|
| **BLOCKER** | `critical` | 必修;不收敛时走 auto_fix / manual_fix / give_up 三选项 |
| **MAJOR** | `critical` | 同 BLOCKER(默认配置) |
| **MINOR** | `warning` | 不阻塞收敛;写 ignore 桶;archive 时聚合到 backlog |
| **NIT** | `suggestion` | 不阻塞收敛;写 ignore 桶;顺手修或忽略 |

### loose 模式:不入主流程 marker

codex review finding **不写入** forge 主流程 marker(`.review-passed` / `.verify-passed`)。loose 模式只在 AI 对话层显示;对 archive fence 无影响。

若收敛失败(未通过)→ AI 主代理告知用户,用户决定是否继续修复。不存在"codex review 失败导致 forge archive 被拒"的情况。

---

## 收敛规则 + 用户介入流程

### 收敛判定

每轮 runner 输出后,收敛判定规则(来源:`src/core/stage-extensions/index.ts` `judgeConvergence`):

1. **`confidence_threshold` 过滤**:低于 `0.7`(默认)的 finding 直接丢弃(`droppedByConfidence`)
2. **severity 分桶**:
   - finding severity 在 `block_severity` 中 → 进 **block 桶**
   - finding severity 在 `ignore_severity` 中 → 进 **ignore 桶**
3. **short-circuit 判定**:若 `verdict_approve_short_circuit=true` **且** codex verdict=`approve` **且** block 桶为空 → 直接收敛(不等所有 finding 清零)
4. **block 桶空 = 收敛**:block 桶非空 → 未收敛,继续下一轮

### 用户介入流程图

```
                    runner 输出 unconverged
                           |
              round < roundLimit?
             /                      \
           是                        否
           |                         |
   AskUserQuestion              max_rounds_on_exceed
   三选项(默认 auto_fix)          /              \
   /        |        \          ask            force_end
  ①        ②         ③          |                 |
auto_fix  manual_fix give_up  AskUserQuestion  写 backlog
  |          |         |      三选项           break
dispatch   等用户    break   /     |     \
fix sub     改完      |    ①再N轮  ②放弃  ③接受
agent      round++        roundLimit+=N  break写backlog
round++    继续              继续
继续
```

### AskUserQuestion 三选项详解(未收敛时)

| 选项 | 快捷键/默认 | 行为 |
|---|---|---|
| **① auto_fix**(默认推荐) | 直接 Enter | dispatch fresh fix subagent 修 blockFindings,`round++` 继续 |
| **② manual_fix** | 输入 2 | 等用户手动修改代码后 `round++` 继续 |
| **③ give_up** | 输入 3 | break loop,不写 backlog |

### AskUserQuestion 三选项详解(超轮次时)

| 选项 | 行为 |
|---|---|
| **① 再跑 N 轮**(默认推荐取决于 TrendAdvice) | `roundLimit += N`;继续收敛 loop(不重置历史) |
| **② 放弃 codex** | break loop |
| **③ 接受当前** | blockFindings 写 `forge/changes/<id>/.evidence/codex-pending-findings.yaml`(backlog),break loop |

### 典型收敛场景

**场景 A:两轮收敛**

```
轮 1: block=[A, B, C]  → unconverged → auto_fix → fix subagent 修 A/B/C
轮 2: block=[]          → converged  ✅
```

**场景 B:verdict=approve 短路**

```
轮 1: verdict=approve, block=[]  → short-circuit → converged ✅(不看 ignore 桶)
```

**场景 C:趋势向好但未收敛**

```
轮 1: block=[A, B, C, D, E]   roundHistory=[{round:1, block_count:5}]
轮 2: block=[A, B]             roundHistory=[..., {round:2, block_count:2}]
...
轮 10: block=[A]               round >= roundLimit
→ analyze-trend: trend=improving, recommended_option=1
→ AskUserQuestion:推荐"再跑 2 轮"
```

---

## Tier 2/3 手动跑 codex CLI 指引

v1 stage-extensions framework 仅 Tier 1 Claude Code 支持自动触发。Tier 2(Codex harness)和 Tier 3(OpenCode)用户可手动跑 codex CLI 完成类似工作。

### 手动跑 code-review 模式

```bash
# 在项目根目录跑(需先 cd 进项目)
codex review
```

codex 会分析当前 git diff,输出结构化 review 意见。

### 手动跑 adversarial 模式

```bash
# 使用 forge 预置 adversarial prompt 模板
FORGE_ROOT=<path-to-forge-plugin>

codex exec \
  --prompt-file "$FORGE_ROOT/src/core/codex-review/prompts/adversarial-default.md" \
  --output forge/changes/<id>/.evidence/manual-adversarial.md
```

### Resume 上一 session

```bash
# 拿到上一轮的 thread-id(从 thread-map.json 或 codex 输出)
THREAD_ID=<session-id>

codex exec resume "$THREAD_ID" \
  --prompt-file "$FORGE_ROOT/src/core/codex-review/prompts/adversarial-default.md" \
  --output forge/changes/<id>/.evidence/manual-adversarial-r2.md
```

> **注**:`codex review` 模式不支持 `--resume`(thread resume 只对 `codex exec` 有效)。

### 手动解读输出

拿到 codex 输出后,参考 [§4 Severity 4 级映射](#severity-4-级映射)手动映射 severity,判断是否需要修改代码。

Tier 2/3 用户结果不经过 forge runner 处理,**不会自动写 thread-map 或 pending-findings**。若希望手动记录:

```bash
# 把 codex finding 写入 backlog(供 archive 时聚合)
cat >> forge/changes/<id>/.evidence/codex-pending-findings.yaml << EOF
- title: "..."
  severity: BLOCKER
  file: src/foo.ts
  round: 1
EOF
```

### Tier 2/3 v2 路线图

v2 计划加 Tier 2/3 自动集成:

- Tier 2 Codex harness:SKILL.md 改动 + harness 检测 + 自动调 runner CLI
- Tier 3 OpenCode:同 Tier 2

在 Tier 2/3 集成完成前,harness-agnostic helper(`scripts/codex-review-helper.mjs`)已可直接调用 — 路径通过 CLI 参数传入,无 `${CLAUDE_PLUGIN_ROOT}` 依赖。
