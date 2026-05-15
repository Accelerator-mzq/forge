---
description: Run codex adversarial review on focus artifact (forge B-full wrapper - AI-invokable; bypasses /codex:adversarial-review disable-model-invocation lock)
argument-hint: '[focus text or file path]'
allowed-tools: Read, Bash(codex:*), Bash(node:*), Bash(git:*), Bash(mkdir:*), AskUserQuestion
---

You are about to handle `/forge:codex-adversarial $ARGUMENTS`.

## What this command does

Run a Codex adversarial review against the user-specified focus. Unlike `/codex:adversarial-review`
(which has `disable-model-invocation: true` blocking AI auto-invoke), this forge wrapper IS
invokable by AI agents — enabling automated codex review in forge workflows.

**Wrapper status**:**临时(B-full)**。`plan-stage-extensions-framework` 实施完成后,完整
runner (`forge stage-extensions run --stage <s>`) 会替换本 wrapper(沿 plan §3-§7)。

## Step-by-step protocol

### Step 1: 解析 $ARGUMENTS

$ARGUMENTS 是用户给的 focus 文本或文件路径。例如:

- `/forge:codex-adversarial review plan v1 in docs/plans/2026-05-15-plan-stage-extensions-framework.md`
- `/forge:codex-adversarial`(空 — 默认 review 当前 branch)

如果 $ARGUMENTS 包含一个 .md / .ts / .yaml 文件路径,这是 focus artifact;
否则整个 $ARGUMENTS 作为 user focus 文本。

### Step 2: 构造 prompt 文件

跑 helper build-prompt 子命令:

```bash
PROMPT_FILE=$(mktemp -t forge-codex-adv-XXXXXX.md)
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-review-helper.mjs" build-prompt \
  --template "${CLAUDE_PLUGIN_ROOT}/src/core/codex-review/prompts/adversarial-default.md" \
  --output "$PROMPT_FILE" \
  --user-focus "$ARGUMENTS" \
  --target-label "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'current state')"
```

### Step 3: 准备 output log 路径

```bash
LOG_DIR="${PWD}/.forge-codex-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/codex-adversarial-$(date +%s).log"
```

### Step 4: 跑 codex(通过 helper)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-review-helper.mjs" run \
  --prompt-file "$PROMPT_FILE" \
  --output-log "$LOG_FILE"
```

主代理需要把 codex 的 stdout **verbatim** 透传到会话(沿 codex 协议要求:
"Return Codex's output verbatim. Do not paraphrase, summarize, or add commentary
before or after it.")。

### Step 5: 清理 + 报告

```bash
rm -f "$PROMPT_FILE"
```

告诉用户:

- codex finding 已 verbatim 透传(上面)
- log 文件位置 `$LOG_FILE`(用户可后续查)

## 错误处理

- codex CLI 未装(`codex --version` 失败)→ helper 报错 + 提示用户跑 `codex login` / 装 codex
- prompt build 失败 → 检查 template 路径
- codex exit !=0 → 错误透传给用户,**不**自动 retry(B-full 不实现 retry / 多轮 / 僵尸检测 —
  这些是完整 framework 的事)

## 禁止行为

- ✗ 不允许 paraphrase / summarize codex 输出(沿 codex verbatim 协议)
- ✗ 不允许自动修复 codex 找到的问题(本命令只跑 review,不动代码)
- ✗ 不允许跳过 prompt 文件直接 inline prompt(B-full 接口约束)

## 已知限制(B-full)

- 单轮 review,无多轮收敛(完整 framework 加)
- 同步阻塞(无 `--background`)— codex 跑完才返回
- 无僵尸检测(codex 卡住 → 用户 Ctrl+C)
- 无 `--resume` thread 复用(每次跑都新 thread)
- 单一模板 `adversarial-default.md`(完整 framework 加 stage-specific 模板)

完整能力见 plan `docs/plans/2026-05-15-plan-stage-extensions-framework.md` §3-§7。
