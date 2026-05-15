# workflow-monitor 已开启

本会话 forge 工作流监控已开启。在跑 forge 工作流时,你**额外**做以下记录动作 —— 它们不改变工作流本身,只产出可观测 trace。

所有 `forge monitor` 调用走 plugin helper(forge CLI 不在 PATH):
`node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" monitor <子命令> <参数>`

(`CLAUDE_PLUGIN_ROOT` 由 Claude Code 环境注入,直接用即可。)

## 每个阶段要记录的

进入任一 forge 阶段(brainstorm / propose / apply / review / verify / archive / explore)时:

1. **进入阶段** —— 调:
   `... run-forge.mjs monitor record --stage <阶段> --event stage_enter --change <change-id>`
2. **fork 点决策** —— 在该阶段的关键岔路口,记录你实际选了哪条分支:
   `... monitor record --stage <阶段> --event decision --change <id> --json '{"scenario_id":"<见下>","chosen":"<你实际怎么走的>"}'`
3. **加固步骤** —— 执行(或跳过)一个反向加固步骤后:
   `... monitor record --stage <阶段> --event hardening_step --change <id> --json '{"step":"<步骤名>","executed":<true 或 false>}'`
4. **离开阶段** —— 调:
   `... monitor record --stage <阶段> --event stage_exit --change <id> --json '{"outcome":"<结果>"}'`

## fork 点 scenario_id 速查

- verify 阶段「测试 pass 后是否做三维 verify」→ `scenario_id: verify-tests-green`
- archive 阶段「有未 ack WARNING 是否归档」→ `scenario_id: archive-unresolved-warning`
- 其它阶段的 scenario_id 见 `src/core/monitor/divergence-map.ts`。

## 报告

- `/forge:archive` 成功后,跑一次 `... monitor report --change <change-id>` 生成完整报告。
- 工作流中途被 fence 拦下时,也可随时跑 `... monitor report --change <change-id>` 拿当前快照。

记录是尽力而为的:某次漏记不会破坏工作流,只会让报告在该阶段标「AI trace 不完整」。
