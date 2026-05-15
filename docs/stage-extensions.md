# Stage Extensions Framework

> forge v1.2(plan-stage-extensions-framework)新增的 **stage-level extension runner**。
> 当前 v1 为 Tier 1 Claude Code only;Tier 2/3 接口预留,见 [§未来 Tier 2/3 集成](#未来-tier-23-集成)。

## 目录

- [§1 概念](#概念)
- [§2 Config Schema 完整字段表](#config-schema-完整字段表)
- [§3 协议:多轮收敛 / 僵尸检测 / Thread Map / 趋势分析](#协议多轮收敛--僵尸检测--thread-map--趋势分析)
- [§4 加新 Extension](#加新-extension)
- [§5 Troubleshooting](#troubleshooting)
- [§6 未来 Tier 2/3 集成](#未来-tier-23-集成)

---

## 概念

### framework 是什么

**Stage Extensions Framework** 是 forge core 内建的 **通用 stage-level extension runner**。它在 forge 主流程的 5 个 stage(brainstorming / propose / apply_critical_plan_review / review / verify)挂钩,允许在每个 stage 结束时调用外部工具做额外校验或 review,结果以多轮收敛协议驱动 AI 主代理处理。

架构上分两层:

| 层 | 职责 | 实现位置 |
|---|---|---|
| **CLI runner(机械层)** | spawn extension 进程 / 监控 / 解析输出 / 收敛判定 / retry | `src/cli/commands/stage-extensions.ts` |
| **AI 协议层** | 多轮 loop / AskUserQuestion / dispatch fix subagent | `commands/*.md` §"Stage extensions hook" |

CLI runner **永远 exit 0**(loose),不阻塞 forge 主流程 fence。

### 预置 Extension:codex review / adversarial

v1 内建两类预置 extension 模板:

- **code-review mode**:调 `codex review`,输出 JSON(`{ verdict, findings, summary }`),适合结构化代码审查
- **adversarial mode**:调 `codex exec` + adversarial-default.md prompt,输出 Markdown(`## Findings / ## Verdict`),适合对抗性深度审查

两种模式由 `entry.command` 字段决定;runner 解析时自动探测 JSON vs Markdown。

### Quick Start

```yaml
# forge/config.yaml — 最小配置,开启 review stage 的 codex code-review
stage_extensions:
  review:
    - name: codex-code-review
      enabled: true
      command: >
        node "${FORGE_HELPER_DIR}/codex-review-helper.mjs" run
        --mode code-review
        --output-log "${OUTPUT_FILE}"
      output: forge/changes/${CHANGE_ID}/.evidence/codex-review-r${ROUND}-a${ATTEMPT}.json
```

配置保存后,下次跑 `/forge:review` 时 AI 主代理会自动检测并触发多轮收敛协议。

> 推荐新用户先只开 `review` + `verify` 两个 stage(D/E 路径,约 20-50 分钟),熟悉协议后再扩展到其他 stage。

---

## Config Schema 完整字段表

所有字段位于 `forge/config.yaml` 的 `stage_extensions` 顶层 key 下。

### 顶层字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `defaults` | `StageExtensionsDefaults`(可选) | 全局默认值;每 entry 缺省字段从此处 deep-merge 填充 |
| `brainstorming` | `StageExtensionEntry[]`(可选) | brainstorming stage 的 extension 列表 |
| `propose` | `StageExtensionEntry[]`(可选) | propose stage 的 extension 列表 |
| `apply_critical_plan_review` | `StageExtensionEntry[]`(可选) | apply critical plan review stage 的 extension 列表 |
| `review` | `StageExtensionEntry[]`(可选) | review stage 的 extension 列表 |
| `verify` | `StageExtensionEntry[]`(可选) | verify stage 的 extension 列表 |

### `defaults` 字段

| 字段 | 类型 | 默认值 | 合法范围 | 说明 |
|---|---|---|---|---|
| `poll_interval_sec` | `number` | `300` | `[10, 3600]` | 进程监控轮询间隔(秒) |
| `zombie_threshold_sec` | `number` | `300` | `[10, 3600]` | output 文件 mtime 静止超过此阈值视为僵尸进程(秒) |
| `timeout_sec` | `number` | `900` | `[60, 3600]` | 单次 extension 最大执行时间(秒);超时强制 terminate |
| `max_retries` | `integer` | `1` | `[0, 10]` | 单轮失败后最大重试次数(总执行次数 = 1 + max_retries) |
| `convergence` | `ConvergenceConfig` | 见下表 | — | 收敛策略;entry 可局部覆盖 |
| `severity_map` | `SeverityMap` | 见下表 | — | codex severity → forge 内部 severity 映射 |
| `severity_map_to_forge` | `SeverityMapToForge` | 见下表 | — | forge 内部 severity → forge finding 级别映射 |
| `user_interaction` | `UserInteraction` | 见下表 | — | 未收敛 / 超轮次时推荐动作 |

### `convergence` 子字段

| 字段 | 类型 | 默认值 | 合法范围 | 说明 |
|---|---|---|---|---|
| `max_rounds` | `integer` | `10` | `[1, 100]` | 单 entry 最大收敛轮次 |
| `max_rounds_on_exceed` | `'ask' \| 'force_end'` | `'ask'` | — | 轮次上限时的行为:`ask` 弹三选项问用户;`force_end` 强制结束写 backlog(适合 CI 自动化) |
| `block_severity` | `SeverityLevel[]` | `['BLOCKER', 'MAJOR']` | `BLOCKER\|MAJOR\|MINOR\|NIT` | 阻塞收敛的 severity 列表;block 桶非空 = 未收敛 |
| `ignore_severity` | `SeverityLevel[]` | `['MINOR', 'NIT']` | `BLOCKER\|MAJOR\|MINOR\|NIT` | 不计入收敛判定的 severity 列表(写 ignore 桶) |
| `confidence_threshold` | `number` | `0.7` | `[0, 1]` | finding 置信度阈值;低于此值的 finding 直接丢弃(记入 `droppedByConfidence`) |
| `verdict_approve_short_circuit` | `boolean` | `true` | — | verdict=approve **且** block 桶为空时直接短路判定收敛(不必所有 finding 都清零) |

### entry 字段

每个 stage 数组中的单个 extension 条目:

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | `string` | ✅ | entry 唯一标识符(同 stage 内唯一;CLI `--extension <name>` 参数引用此值) |
| `enabled` | `boolean` | ✅ | `false` 跳过本 entry |
| `command` | `string` | ✅ | spawn 的命令模板;支持变量替换(见下) |
| `build_prompt` | `string` | — | 可选;生成 prompt 文件的命令(adversarial 模式用);code-review 模式可省略 |
| `output` | `string` | ✅ | output 文件路径模板(extension 写结果到此路径;runner 读取解析) |
| `timeout_sec` | `number` | — | 覆盖 defaults.timeout_sec;合法范围 `[60, 3600]` |
| `poll_interval_sec` | `number` | — | 覆盖 defaults.poll_interval_sec;合法范围 `[10, 3600]` |
| `zombie_threshold_sec` | `number` | — | 覆盖 defaults.zombie_threshold_sec;合法范围 `[10, 3600]` |
| `max_retries` | `integer` | — | 覆盖 defaults.max_retries;合法范围 `[0, 10]` |
| `convergence` | `Partial<ConvergenceConfig>` | — | 局部覆盖 convergence 字段;未设字段从 defaults deep-merge 填充 |

**`command` / `output` 模板变量**:

| 变量 | 说明 |
|---|---|
| `${FORGE_HELPER_DIR}` | forge scripts/ 目录绝对路径(由 runner 自动推导) |
| `${PROMPT_FILE}` | build_prompt 产出的 prompt 文件路径(无 build_prompt 时为空串) |
| `${THREAD_ID}` | codex resume thread id(首轮为空串) |
| `${OUTPUT_FILE}` | 本轮 output 文件路径(已带 round + attempt 维度保证唯一) |
| `${CHANGE_ID}` | 当前 change ID |
| `${TS}` | ISO 8601 时间戳(用于文件名去重) |
| `${ROUND}` | 当前轮次编号 |
| `${ATTEMPT}` | 当前 attempt 编号(retry 时递增,保证文件名唯一) |

### `severity_map` 字段

codex 原生 severity → forge 内部 severity 映射:

| codex severity | 默认 forge 内部 severity |
|---|---|
| `critical` | `BLOCKER` |
| `high` | `MAJOR` |
| `medium` | `MINOR` |
| `low` | `NIT` |

### `severity_map_to_forge` 字段

forge 内部 severity → forge finding 级别映射(CLI 输出 + UI 显示用):

| forge 内部 severity | 默认 forge finding 级别 |
|---|---|
| `BLOCKER` | `critical` |
| `MAJOR` | `critical` |
| `MINOR` | `warning` |
| `NIT` | `suggestion` |

### `user_interaction` 字段

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `block_unconverged` | `'auto_fix_recommended' \| 'manual_fix_recommended' \| 'give_up_recommended'` | `'auto_fix_recommended'` | 未收敛时 AskUserQuestion 的推荐选项 |
| `max_rounds_exceed` | `'give_up_recommended' \| 'continue_recommended' \| 'accept_recommended'` | `'give_up_recommended'` | 轮次上限时 AskUserQuestion 的推荐选项 |

---

## 协议:多轮收敛 / 僵尸检测 / Thread Map / 趋势分析

### 多轮收敛协议(AI 协议层)

多轮收敛由 `commands/*.md` 末尾 §"Stage extensions hook" 段定义,由 AI 主代理执行。CLI runner 只做单轮机械操作。

**Step A — 检查启用状态**

AI 主代理读 `forge/config.yaml#stage_extensions.<stage>`。若该字段不存在 / 数组为空 / 全部 entry `enabled: false` → **跳过**。

**Step B — 对每个 enabled entry 跑多轮收敛 loop**

初始化 `round = 1`、`threadId = ''`、`roundHistory = []`、`roundLimit = null`。

每轮循环:

1. 调 CLI runner:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" stage-extensions run \
     --stage <stage> --change-id <change-id> --extension <entry-name> \
     --round <round> [--thread-id <threadId>]
   ```
2. 解析 stdout JSON 的 `kind`:
   - `converged` → 该 entry 收敛完成,break loop
   - `failed` / `config_error` / `no_extension` → 放弃,break loop(loose)
   - `unconverged` → 继续步骤 3
3. 取 unconverged JSON 状态:
   - `roundHistory.push({ round, block_count: blockFindings.length })`
   - `threadId = JSON.threadId`
   - 首轮:`roundLimit = JSON.effectiveConvergence.max_rounds`
4. 若 `round >= roundLimit`:根据 `effectiveConvergence.max_rounds_on_exceed` 决定行为(见"超轮次处理")
5. 否则:`AskUserQuestion` 三选项(默认推 `userInteraction.block_unconverged`)

**Step C — loose**:任何步骤失败不阻塞主流程 fence。

### 未收敛三选项(round < roundLimit)

| 选项 | 行为 |
|---|---|
| **① auto_fix**(默认推荐) | dispatch fresh fix subagent 修 blockFindings → `round++`,继续 |
| **② manual_fix** | 等用户手动修改 → `round++`,继续 |
| **③ give_up** | break loop |

### 超轮次处理(round >= roundLimit)

- **`force_end`**:把 blockFindings 写 `forge/changes/<id>/.evidence/codex-pending-findings.yaml`(backlog),break loop
- **`ask`(默认)**:先调 `analyze-trend` 得 TrendAdvice,再 AskUserQuestion 三选项:
  - **① 再跑 N 轮**:`roundLimit += N`,继续(不重置 roundHistory)
  - **② 放弃 codex**:break loop
  - **③ 接受当前**:blockFindings 写 backlog,break loop

### 僵尸检测(zombie detection)

runner 在 `watchProcess` 中检测僵尸进程。判定条件(AND):

- output 文件 mtime 静止 ≥ `zombie_threshold_sec`(默认 300 秒)
- 进程总运行时长 ≥ `timeout_sec`(默认 900 秒)

检测到僵尸 → 调 `terminateRound`(SIGTERM → 等 3s → SIGKILL)→ 返回 `{ kind: 'zombie' }` → runner 判为失败,消耗 retry attempt。

### Thread Map

runner 在 `converged` / `unconverged` 时写 `forge/changes/<id>/.evidence/thread-map.json`,记录每个 (stage, entry-name) 的 thread 历史:

```json
{
  "review/codex-code-review": {
    "thread_id": "<codex-session-id>",
    "round": 2,
    "last_verdict": "needs-attention",
    "last_finding_count": 3,
    "last_round_at": "2026-05-15T10:00:00.000Z"
  }
}
```

同 stage 内复用同一 `thread_id`(codex `--resume <id>` 保持 context);跨 stage 新建 thread(防 context 串扰)。

### 趋势分析

当轮次达上限且 `max_rounds_on_exceed=ask` 时,AI 主代理调:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" stage-extensions analyze-trend \
  --history '[{"round":1,"block_count":5},{"round":2,"block_count":3},...]'
```

输出 `TrendAdvice`:

```json
{
  "trend": "improving",
  "recommendation": "block count 从 5 降到 3,建议再跑 2 轮",
  "recommended_option": 1
}
```

`trend` 取值:`improving` / `stable` / `degrading` / `data_insufficient`。`recommended_option` 对应三选项编号。

---

## 加新 Extension

### 示例 1:加 grok review extension

```yaml
# forge/config.yaml
stage_extensions:
  review:
    - name: grok-review
      enabled: true
      # grok CLI 命令模板(假设 grok 已安装并支持 --output JSON)
      command: >
        grok review
        --output "${OUTPUT_FILE}"
        --context "${CHANGE_ID}"
      output: forge/changes/${CHANGE_ID}/.evidence/grok-review-r${ROUND}-a${ATTEMPT}.json
      timeout_sec: 600
      convergence:
        max_rounds: 5
        block_severity: [BLOCKER]
```

### 示例 2:加 lint extension

```yaml
stage_extensions:
  apply_critical_plan_review:
    - name: eslint-check
      enabled: true
      # 自定义 lint wrapper,输出 codex 兼容 JSON 格式
      command: >
        node scripts/lint-to-codex.mjs
        --change-id "${CHANGE_ID}"
        --output "${OUTPUT_FILE}"
      output: forge/changes/${CHANGE_ID}/.evidence/lint-r${ROUND}-a${ATTEMPT}.json
      max_retries: 0
      convergence:
        max_rounds: 3
        max_rounds_on_exceed: force_end
```

### Extension 输出格式要求

runner 支持两种输出格式(自动探测):

**JSON 格式(code-review mode)**:

```json
{
  "verdict": "approve" | "needs-attention",
  "summary": "...",
  "findings": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "title": "...",
      "body": "...",
      "file": "src/foo.ts",
      "line_start": 42,
      "line_end": 42,
      "confidence": 0.9,
      "recommendation": "..."
    }
  ],
  "next_steps": []
}
```

**Markdown 格式(adversarial mode)**:

```markdown
## Summary
...

## Findings
### [BLOCKER] 问题标题
**Location**: `src/foo.ts:42`
**Confidence**: 0.9
**Body**: 问题描述
**Recommendation**: 建议

## Verdict
needs-attention
```

---

## Troubleshooting

### 1. codex 没有安装

**症状**:runner 输出 `{ "kind": "failed", "reason": "spawn_failed: ..." }`,stderr 含 `ENOENT` 或 `command not found`。

**解决**:

```bash
# 安装 Codex CLI
npm install -g @openai/codex
# 或
pnpm add -g @openai/codex

# 验证
codex --version
```

详见 [`docs/codex-install.md`](codex-install.md)。

### 2. config 非法 — `ConfigValidationError`

**症状**:runner 输出 `{ "kind": "config_error", "message": "forge config validation: ..." }`。

**排查**:错误消息包含出错的字段路径,例如 `stage_extensions.review[0].convergence.max_rounds`。常见原因:

- `timeout_sec` 不在 `[60, 3600]` 范围
- `max_rounds` 不在 `[1, 100]` 范围
- `block_severity` 含非法 severity 字符串
- `command` 为空字符串

**修法**:对照 [§2 Config Schema](#config-schema-完整字段表) 逐字段核对。

### 3. extension 跑了很多轮但不收敛

**症状**:每轮都有 BLOCKER/MAJOR finding,AI 不断循环。

**排查与建议**:

- 检查 `block_severity` 配置 — 若只关心 BLOCKER,把 `MAJOR` 从 `block_severity` 移到 `ignore_severity`
- 临时降低 `max_rounds` 到 `3`,触发 ask 流程后选"接受当前"写 backlog
- 若问题是代码质量问题,让 fix subagent 修完后继续

### 4. Markdown 解析失败

**症状**:runner 输出 `invalid_output: parseCodexOutput: markdown 缺少 ## Verdict 段`。

**原因**:adversarial 模式的 codex output 没有标准的 `## Verdict` 段。

**解决**:检查 prompt 模板(`src/core/codex-review/prompts/adversarial-default.md`)是否要求 codex 输出 `## Verdict` 段。若自定义 prompt 省略了这个要求,需要补充。

### 5. loose 永不阻塞主流程

**这是预期行为**:runner 永远 exit 0,失败/超时/解析错误都只影响 extension 结果,不阻断 forge 主流程。

若希望 extension 失败时警示:在 AI 协议层,`failed` / `config_error` 结果会被 AI 主代理 verbatim 透传给用户显示。

### 6. Windows 上 codex ENOENT

**症状**:Windows 环境下 spawn 失败,错误为 `ENOENT`。

**原因**:Windows 的 codex 是 `.cmd` wrapper,直接 spawn 需要 `shell: true`。

**现状**:runner 已内建 `shell: true`(对照 `src/cli/commands/stage-extensions.ts` 第 401 行)。若仍 ENOENT,确认 codex 全局安装路径在 `PATH` 中。

### 7. `--change-id` 含特殊字符报 `config_error`

**症状**:runner 输出 `{ "kind": "config_error", "message": "--change-id 含非法 shell 字符: ..." }`。

**原因**:change ID 会被替换到 shell 命令字符串中(I-1 注入面防护)。白名单仅 `[A-Za-z0-9._-]`。

**解决**:change ID 只使用字母、数字、点、下划线、连字符。

### 8. output 文件 mtime 早于 spawn 时刻

**症状**:runner 输出 `invalid_output: output 文件 mtime 早于本次 spawn — 疑似残留旧文件`。

**原因**:上次运行的 output 文件残留,codex 本次没有写入新文件。

**解决**:runner 在 spawn 前已删除残留文件(双保险),但若删除失败(权限等原因),会触发此错误。检查 output 文件目录权限。

---

## 未来 Tier 2/3 集成

当前 v1 framework 为 **Tier 1 Claude Code only**。Tier 2(Codex harness)和 Tier 3(OpenCode)集成预留在 v2 实施。

### 接口设计(预留)

**harness-agnostic helper**:

`scripts/codex-review-helper.mjs` 已设计为 harness-agnostic(不依赖 `${CLAUDE_PLUGIN_ROOT}` — 所有路径通过 CLI 参数传入,repo root 从 `import.meta.url` 推导)。Tier 2/3 调用方式与 Tier 1 相同。

**Config**:

`forge/config.yaml#stage_extensions` 格式不依赖 harness,Tier 2/3 解析同一 config 即可。

**Prompts**:

`src/core/codex-review/prompts/adversarial-default.md` 为通用模板,不绑 Claude Code harness。

### Tier 2/3 用户临时方案

v2 完成前,Tier 2/3 用户可手动调 codex CLI 跑单轮 review:

```bash
# 手动跑 code-review 模式
codex review

# 手动跑 adversarial 模式
codex exec --prompt-file src/core/codex-review/prompts/adversarial-default.md \
  --output forge/changes/<id>/.evidence/manual-review.md

# resume 上一 session
codex exec resume <thread-id> \
  --prompt-file src/core/codex-review/prompts/adversarial-default.md \
  --output forge/changes/<id>/.evidence/manual-review-r2.md
```

详见 [`docs/codex-review.md §Tier 2/3 手动跑 codex CLI 指引`](codex-review.md#tier-23-手动跑-codex-cli-指引)。

### v2 规划

- `--background` async mode + job/status/cancel CLI 协议(约 200 LOC)
- Tier 2 SKILL.md 集成(harness 检测 + skill auto-trigger)
- Generic ExtensionContract(`output_format` / `parser` / `success_criteria`)— 真有 grok/lint 非 codex 集成需求时 refactor
