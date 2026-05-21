# workflow-monitor 已开启

本会话 forge 工作流监控已开启。在跑 forge 工作流时,你**额外**做以下记录动作 —— 它们不改变工作流本身,只产出可观测 trace。

所有 `forge monitor` 调用走 plugin helper(forge CLI 不在 PATH):
`node "<forge plugin root>/scripts/run-forge.mjs" monitor <子命令> <参数>`

`<forge plugin root>` 按 harness 不同解析:

- **Claude Code**:直接用环境变量 `${CLAUDE_PLUGIN_ROOT}`(SessionStart hook 自动注入)
- **OpenCode**:看本 bootstrap 顶部 `forge plugin root: <abs path>` 行(plugin transform hook 注入)
- **Codex**:`~/.codex/forge`(标准安装路径,Windows 是 `$env:USERPROFILE\.codex\forge`,需展开 home)

> **Codex 路径下本注入不会自动触发**(Codex plugin 协议无 hook 通道)。如 `forge/config.yaml#monitor.enabled=true` 但你正在 Codex session,需主动 `Read` 本文件并按下面步骤执行 monitor record。

> **Windows 限制 + 推荐做法**:`run-forge.mjs` 在 Windows 下 spawn `npx.cmd` 必须 `shell: true`(Node 21+ CVE-2024-27980),JSON args 经 cmd.exe 二次 escape 会被吃掉引号导致 100% `record_error`。**Windows 用户用 `--json-file <path>` 替代 `--json '...'`**:把 JSON payload 写文件再传路径,绕过 shell quoting。下面"每个阶段要记录的"步骤同时给两种形态。

## 每个阶段要记录的

进入任一 forge 阶段(brainstorm / propose / apply / review / verify / archive / explore)时:

1. **进入阶段** —— 调(无 data 负载,无 Windows quoting 问题):
   `... run-forge.mjs monitor record --stage <阶段> --event stage_enter --change <change-id>`

2. **fork 点决策** —— 在该阶段的关键岔路口,记录你实际选了哪条分支:
   - **macOS/Linux**(`--json` 直传):
     `... monitor record --stage <阶段> --event decision --change <id> --json '{"scenario_id":"<见下>","chosen":"<你实际怎么走的>"}'`
   - **Windows**(`--json-file` 绕 cmd.exe;推荐):
     ```bash
     # 先把 payload 写文件
     echo '{"scenario_id":"<见下>","chosen":"<...>"}' > /tmp/forge-monitor-payload.json
     # 再传文件路径(无 shell quoting 问题)
     ... monitor record --stage <阶段> --event decision --change <id> --json-file /tmp/forge-monitor-payload.json
     ```

3. **加固步骤** —— 执行(或跳过)一个反向加固步骤后:
   - **macOS/Linux**:`... monitor record --stage <阶段> --event hardening_step --change <id> --json '{"step":"<步骤名>","executed":<true 或 false>}'`
   - **Windows**:同 fork 点用 `--json-file <path>`

4. **离开阶段** —— 调:
   - **macOS/Linux**:`... monitor record --stage <阶段> --event stage_exit --change <id> --json '{"outcome":"<结果>"}'`
   - **Windows**:同上用 `--json-file <path>`

> **`--json-file` 优先于 `--json`**:如两者同传,以 file 内容为准(file 不存在 / 解析失败 → 降级 `record_error`,同 stdin 路径语义对称)。

> **brainstorm/explore 阶段还没有 change-id 时,`record` 省略 `--change`(自动落 `_session` 桶,propose 创建 change 后报告会并入)**。

## fork 点 scenario_id 速查

- verify 阶段「测试 pass 后是否做三维 verify」→ `scenario_id: verify-tests-green`
- archive 阶段「有未 ack WARNING 是否归档」→ `scenario_id: archive-unresolved-warning`
- 其它阶段的 scenario_id 见 `src/core/monitor/divergence-map.ts`。

## 报告

- `/forge:archive` 成功后,跑一次 `... monitor report --change <change-id>` 生成完整报告。
- 工作流中途被 fence 拦下时,也可随时跑 `... monitor report --change <change-id>` 拿当前快照。

记录是尽力而为的:某次漏记不会破坏工作流,只会让报告在该阶段标「AI trace 不完整」。
