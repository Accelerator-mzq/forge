# Tier 2/3 Command Bridge — 共享替换规则

> 被 5 个 stage skill 的「Tier 2/3 Orchestration」段引用。
> 适用:OpenCode / Codex 等无 `/forge:*` slash 命令的 harness;Claude Code(Tier 1)不走本桥接。

## plugin root 解析(绝对路径字面值)

命令文件与 helper 同在 plugin 仓库根下。先解析出**绝对路径字面值** `<ROOT>`:

- OpenCode:从 session bootstrap 文本里的 `forge plugin root: <abs path>` 行取得。
- Codex:标准安装为 `~/.codex/forge`,把 `~`/`$HOME` 展开成绝对路径。
- 解析后校验 `<ROOT>/scripts/run-forge.mjs` 与 `<ROOT>/commands/<stage>.md` **同时存在**;
  任一缺失 → 报错停止(fail closed),提示用户检查安装,**不得静默跳过**。
- **不得**在 shell 写 `$FORGE_PLUGIN_ROOT`(非运行时环境变量);用绝对路径字面值,
  或在单条命令内 `FORGE_ROOT="<abs literal>"; node "$FORGE_ROOT/..."`(变量不跨命令)。

## 替换规则

执行 `commands/<stage>.md` 时,按下表把 Tier-1 专属构造换成 Tier 2/3 等价物:

| 命令文件里的                                                                                         | 替换为                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs`                                                        | `<ROOT>/scripts/run-forge.mjs`                                                                                                                                                                   |
| shell/命令执行上下文中的 forge executable token(裸 `forge <subcmd>`、管道右侧 `… \| forge <subcmd>`) | `node "<ROOT>/scripts/run-forge.mjs" <subcmd> …`;helper 不可达时 fallback `npx -y --package @accelerator-mzq/forge@^4.0.0 -- forge <subcmd>`。**散文/说明文字里的 `forge archive` 等引用不替换** |
| `$ARGUMENTS`                                                                                         | 从用户自然语言提取                                                                                                                                                                               |
| `AskUserQuestion`                                                                                    | 降级终端 `[1]/[2]/…` 文本 prompt;v4 起无 `forge ack` 协议,确认结果按 v4 marker 写入即可(详见 [`docs/migration/v3-to-v4.md`](../../docs/migration/v3-to-v4.md))                                   |
| `Task` 工具派子代理                                                                                  | 按 `skills/subagent-driven-discipline/references/codex-tools.md`(Codex)/ `opencode-tools.md`(OpenCode)映射                                                                                       |
| `## (可选)Stage extensions hook — Tier 1 Claude Code only` 段                                        | 整段跳过                                                                                                                                                                                         |

示例:

- bash:`node "<ROOT>/scripts/run-forge.mjs" validate add-login`
- PowerShell:`node "<ROOT>\scripts\run-forge.mjs" validate add-login`
- 管道(bash):`cat payload.json | node "<ROOT>/scripts/run-forge.mjs" finding hash`
